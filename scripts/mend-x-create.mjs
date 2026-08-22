import { spawnSync } from 'node:child_process';
import { loadLocalEnv } from './env.mjs';

loadLocalEnv();
if (!process.env.BRIGHTDATA_API_KEY) {
  console.error('BRIGHTDATA_API_KEY is missing. Add it to ignored .env.local.');
  process.exit(2);
}

const target = process.env.MEND_X_TARGET_URL ?? 'https://beamtx.com/pipeline/';
const prompt = [
  'Scrape only this pipeline page and do not follow links.',
  'Return only programs whose disease or evidence explicitly mentions Alpha-1 antitrypsin deficiency, AATD, or SERPINA1.',
  'Return a JSON array with organization, program, disease, target_mechanism, development_stage, status, source_url, and evidence.',
  'Set organization to Beam Therapeutics only when the page supports it.',
  'Evidence must be a concise verbatim excerpt from the page; do not infer missing values.',
].join(' ');

const result = spawnSync(process.execPath, [
  'node_modules/@brightdata/cli/dist/index.js', 'scraper', 'create', target, prompt,
], { encoding: 'utf8', env: process.env });

if (result.stderr) process.stderr.write(result.stderr);
if (result.stdout) process.stdout.write(result.stdout);
if (result.error) {
  console.error(`Unable to start the Bright Data CLI: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 0);
