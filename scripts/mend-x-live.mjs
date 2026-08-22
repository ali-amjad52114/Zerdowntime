import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadLocalEnv } from './env.mjs';
import { runXAxis } from '../src/axes/x-pipeline-adapter.mjs';

loadLocalEnv();
const collectorId = process.env.MEND_X_COLLECTOR_ID;
const target = process.env.MEND_X_TARGET_URL ?? 'https://beamtx.com/pipeline/';
if (!process.env.BRIGHTDATA_API_KEY || !collectorId) {
  console.error('BRIGHTDATA_API_KEY and MEND_X_COLLECTOR_ID are required in ignored .env.local.');
  process.exit(2);
}

const result = spawnSync(process.execPath, [
  'node_modules/@brightdata/cli/dist/index.js', 'scraper', 'run', collectorId, target, '--pretty',
], { encoding: 'utf8', env: process.env });
if (result.stderr) process.stderr.write(result.stderr);
if (result.error || result.status !== 0) process.exit(result.status ?? 1);

let payload;
try {
  payload = JSON.parse(result.stdout);
} catch (error) {
  console.error(`Bright Data returned invalid JSON: ${error.message}`);
  process.exit(1);
}

const rows = (Array.isArray(payload) ? payload : [payload]).flatMap((item) => {
  if (Array.isArray(item)) return item;
  for (const key of ['pipeline_items', 'programs', 'results', 'data']) {
    if (Array.isArray(item?.[key])) return item[key];
  }
  return item && typeof item === 'object' ? [item] : [];
});
const targetTerms = /SERPINA1|AATD|alpha[- ]?1|antitrypsin|ARO-AAT|fazirsiran/i;
const targetRows = rows.filter((row) => targetTerms.test([
  row?.program,
  row?.program_name,
  row?.disease,
  row?.indication,
  row?.target_mechanism,
  row?.mechanism,
  row?.evidence,
  row?.evidence_text,
  row?.evidence_excerpt,
].filter(Boolean).join(' ')));
mkdirSync('artifacts/mend', { recursive: true });
writeFileSync('artifacts/mend/x-brightdata-raw.json', `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
const run = runXAxis({
  snapshot: { pipeline_items: targetRows, source_url: target, retrieved_at: new Date().toISOString() },
  mode: 'normal',
  adapterVersion: 'v1',
  validationOptions: { maxMissingRatio: 0.67 },
});
process.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
if (run.validation.status !== 'PASS') {
  console.error(JSON.stringify({ rawKeys: targetRows.map((row) => Object.keys(row ?? {})) }, null, 2));
  process.exit(1);
}
