import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const signozDir = resolve(root, 'observability', 'signoz');
const casting = resolve(signozDir, 'casting.yaml');
const pours = resolve(signozDir, 'pours');
const action = process.argv[2];

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error?.code === 'ENOENT' || result.status === 9009) {
    throw new Error(`${command} was not found on PATH`);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

try {
  if (action === 'up') {
    run('foundryctl', ['cast', '--file', casting, '--pours', pours, '--no-ledger']);
    console.log('SigNoz is starting at http://localhost:8080; OTLP/HTTP is on http://localhost:4318.');
  } else if (action === 'down') {
    const compose = resolve(pours, 'deployment', 'compose.yaml');
    if (!existsSync(compose)) throw new Error(`generated Compose file not found: ${compose}`);
    run('docker', ['compose', '--file', compose, 'down'], resolve(pours, 'deployment'));
    console.log('SigNoz stopped; named volumes were preserved.');
  } else {
    throw new Error('usage: node scripts/signoz-stack.mjs <up|down>');
  }
} catch (error) {
  console.error(error.message);
  if (action === 'up') console.error('Install foundryctl from https://signoz.io/docs/install/docker/ and ensure Docker Compose v2 is available.');
  process.exit(1);
}
