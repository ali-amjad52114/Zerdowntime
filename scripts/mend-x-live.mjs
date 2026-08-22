import { randomUUID } from 'node:crypto';
import { loadLocalEnv } from './env.mjs';
import {
  createBrightDataAcquisitionRequest,
} from '../src/acquisition/brightdata-source.mjs';
import { runExistingBrightDataCollector } from '../src/acquisition/brightdata-cli.mjs';

loadLocalEnv();
const list = (name) => String(process.env[name] ?? '').split(',').map((value) => value.trim()).filter(Boolean);
const requiredEnvironment = [
  'BRIGHTDATA_API_KEY', 'MEND_X_COLLECTOR_ID', 'MEND_X_TARGET_URL',
  'MEND_DISEASE_RUN_ID', 'MEND_TARGET_RUN_ID', 'MEND_DISEASE_NAME', 'MEND_TARGET_NAME',
];
const missing = requiredEnvironment.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing required environment: ${missing.join(', ')}`);
  process.exit(2);
}

const request = createBrightDataAcquisitionRequest({
  diseaseRunId: process.env.MEND_DISEASE_RUN_ID,
  candidateId: process.env.MEND_CANDIDATE_ID,
  targetRunId: process.env.MEND_TARGET_RUN_ID,
  disease: { name: process.env.MEND_DISEASE_NAME, aliases: list('MEND_DISEASE_ALIASES') },
  target: {
    name: process.env.MEND_TARGET_NAME,
    aliases: list('MEND_TARGET_ALIASES'),
    identifiers: { uniprot: process.env.MEND_TARGET_UNIPROT_ID || null },
  },
  matchPolicy: process.env.MEND_X_MATCH_POLICY ?? 'disease_and_target',
  source: {
    kind: 'scraper_studio_collector', assetId: process.env.MEND_X_COLLECTOR_ID,
    url: process.env.MEND_X_TARGET_URL,
    publicSourceApproved: process.env.MEND_X_PUBLIC_SOURCE_APPROVED === 'true',
  },
});

const { result: adapterResult, execution } = await runExistingBrightDataCollector({
  request,
  executionId: process.env.MEND_SOURCE_EXECUTION_ID ?? randomUUID(),
});
process.stdout.write(`${JSON.stringify({ execution, result: adapterResult }, null, 2)}\n`);
if (adapterResult.validation.status !== 'PASS') process.exit(1);
