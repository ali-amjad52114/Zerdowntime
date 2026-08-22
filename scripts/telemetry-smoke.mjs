import { randomUUID } from 'node:crypto';
import { createApp } from '../src/server.mjs';

const port = Number(process.env.SMOKE_PORT ?? 3100);
const base = `http://127.0.0.1:${port}`;
const app = createApp();

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
  await new Promise((resolve, reject) => {
    app.server.once('error', reject);
    app.server.listen(port, '127.0.0.1', resolve);
  });
  console.log(`zero-downtime fixture listening on ${base}`);
  await waitForHealth();
  const runIds = [await run('normal'), await run('fail'), await run('recover')];
  console.log(`Telemetry smoke complete. Search SigNoz for run.id IN (${runIds.join(', ')}).`);
} finally {
  await new Promise((resolve) => app.server.close(resolve));
  await app.telemetry.shutdown();
}
