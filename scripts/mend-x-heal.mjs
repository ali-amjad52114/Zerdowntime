import { spawnSync } from 'node:child_process';
import { loadLocalEnv } from './env.mjs';

loadLocalEnv();
const collectorId = process.env.MEND_X_COLLECTOR_ID;
const target = process.env.MEND_X_TARGET_URL ?? 'https://beamtx.com/pipeline/';
if (!process.env.BRIGHTDATA_API_KEY || !collectorId) {
  console.error('BRIGHTDATA_API_KEY and MEND_X_COLLECTOR_ID are required in ignored .env.local.');
  process.exit(2);
}
const prompt = [
  'The crawler fails before extraction with: tunneling socket could not be established, statusCode=403, error_code=proxy_config.',
  'Remove unsupported proxy configuration and use the account-compatible default network settings.',
  'Preserve the existing SERPINA1/AATD output schema and evidence requirements.',
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
