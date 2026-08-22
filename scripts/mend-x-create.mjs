import { spawnSync } from 'node:child_process';
import { loadLocalEnv } from './env.mjs';
import { buildCollectorPrompt, createBrightDataAcquisitionRequest } from '../src/acquisition/brightdata-source.mjs';

loadLocalEnv();
const list = (name) => String(process.env[name] ?? '').split(',').map((value) => value.trim()).filter(Boolean);
const requiredEnvironment = [
  'BRIGHTDATA_API_KEY', 'MEND_X_TARGET_URL', 'MEND_DISEASE_RUN_ID',
  'MEND_TARGET_RUN_ID', 'MEND_DISEASE_NAME', 'MEND_TARGET_NAME',
];
const missing = requiredEnvironment.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing required environment: ${missing.join(', ')}`);
  process.exit(2);
}
if (process.env.MEND_X_CREATE_APPROVED !== 'true') {
  console.error('Collector creation is disabled. Reuse an authoritative API or existing asset, or set MEND_X_CREATE_APPROVED=true after review.');
  process.exit(2);
}
const request = createBrightDataAcquisitionRequest({
  diseaseRunId: process.env.MEND_DISEASE_RUN_ID,
  targetRunId: process.env.MEND_TARGET_RUN_ID,
  disease: { name: process.env.MEND_DISEASE_NAME, aliases: list('MEND_DISEASE_ALIASES') },
  target: { name: process.env.MEND_TARGET_NAME, aliases: list('MEND_TARGET_ALIASES') },
  source: {
    kind: 'scraper_studio_collector', assetId: 'c_pending_creation',
    url: process.env.MEND_X_TARGET_URL, publicSourceApproved: true,
  },
});
const result = spawnSync(process.execPath, [
  'node_modules/@brightdata/cli/dist/index.js', 'scraper', 'create',
  request.source.url, buildCollectorPrompt(request),
], { encoding: 'utf8', env: process.env });
if (result.stderr) process.stderr.write(result.stderr);
if (result.stdout) process.stdout.write(result.stdout);
if (result.error) {
  console.error(`Unable to start the Bright Data CLI: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 0);
