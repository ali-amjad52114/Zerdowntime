import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { loadLocalEnv } from './env.mjs';
import {
  createBrightDataAcquisitionRequest,
  executeBrightDataAdapter,
  persistBrightDataSourceExecution,
} from '../src/acquisition/brightdata-source.mjs';

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
  matchPolicy: process.env.MEND_X_MATCH_POLICY ?? 'disease_or_target',
  source: {
    kind: 'scraper_studio_collector', assetId: process.env.MEND_X_COLLECTOR_ID,
    url: process.env.MEND_X_TARGET_URL,
    publicSourceApproved: process.env.MEND_X_PUBLIC_SOURCE_APPROVED === 'true',
  },
});

const startedAt = new Date().toISOString();
const cli = spawnSync(process.execPath, [
  'node_modules/@brightdata/cli/dist/index.js', 'scraper', 'run',
  request.source.asset_id, request.source.url, '--pretty',
], { encoding: 'utf8', env: process.env });
if (cli.stderr) process.stderr.write(cli.stderr);
if (cli.error || cli.status !== 0) process.exit(cli.status ?? 1);

let payload;
try {
  payload = JSON.parse(cli.stdout);
} catch (error) {
  console.error(`Bright Data returned invalid JSON: ${error.message}`);
  process.exit(1);
}
const adapterResult = executeBrightDataAdapter({ request, payload });
const execution = persistBrightDataSourceExecution({
  request, payload, adapterResult,
  executionId: process.env.MEND_SOURCE_EXECUTION_ID ?? randomUUID(),
  providerRunId: process.env.MEND_X_PROVIDER_RUN_ID || null,
  startedAt, mode: 'live',
});
process.stdout.write(`${JSON.stringify({ execution, result: adapterResult }, null, 2)}\n`);
if (adapterResult.validation.status !== 'PASS') process.exit(1);
