import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.SMOKE_PORT ?? 3100);
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['src/server.mjs'], {
  env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

async function waitForHealth() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('fixture API did not become healthy');
}

async function run(mode) {
  const runId = `smoke-${mode}-${randomUUID()}`;
  const response = await fetch(`${base}/runs`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode, runId }),
  });
  const body = await response.json();
  const expected = mode === 'fail' ? 500 : 200;
  if (response.status !== expected) throw new Error(`${mode} returned ${response.status}, expected ${expected}`);
  console.log(JSON.stringify({ verification: mode, status: response.status, runId, body }));
  return runId;
}

try {
  await waitForHealth();
  const runIds = [await run('normal'), await run('fail'), await run('recover')];
  console.log(`Telemetry smoke complete. Search SigNoz for run.id IN (${runIds.join(', ')}).`);
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 5_000);
    child.once('exit', () => { clearTimeout(timeout); resolve(); });
  });
}
