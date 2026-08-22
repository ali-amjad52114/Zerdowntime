import { spawnSync } from 'node:child_process';
import { loadLocalEnv } from './env.mjs';

loadLocalEnv();
const collectorId = process.env.MEND_X_COLLECTOR_ID;
const target = process.env.MEND_X_TARGET_URL;
const reason = process.env.MEND_X_HEAL_REASON;
if (!process.env.BRIGHTDATA_API_KEY || !collectorId || !target || !reason) {
  console.error('BRIGHTDATA_API_KEY, MEND_X_COLLECTOR_ID, MEND_X_TARGET_URL, and MEND_X_HEAL_REASON are required.');
  process.exit(2);
}
if (process.env.MEND_X_HEAL_APPROVED !== 'true') {
  console.error('Healing requires an external approval. Set MEND_X_HEAL_APPROVED=true only after the gate is recorded.');
  process.exit(2);
}
const prompt = [
  `Observed failure: ${reason}`,
  'Repair retrieval while preserving the current generic pipeline output schema.',
  'Keep evidence_excerpt verbatim, do not infer missing values, scrape only the supplied public page, and do not follow links.',
].join(' ');
const result = spawnSync(process.execPath, [
  'node_modules/@brightdata/cli/dist/index.js', 'scraper', 'heal', collectorId, prompt,
  '--url', target, '--pretty',
], { encoding: 'utf8', env: process.env });
if (result.stderr) process.stderr.write(result.stderr);
if (result.stdout) process.stdout.write(result.stdout);
if (result.error) {
  console.error(`Unable to start Bright Data healing: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 0);
