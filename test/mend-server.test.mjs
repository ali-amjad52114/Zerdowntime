import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { AggregationTemporality, InMemoryMetricExporter } from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { createApp } from '../src/server.mjs';
import { createTelemetry } from '../src/telemetry.mjs';

test('Mend API and target view expose healthy, isolated X failure, and v2 recovery', async (t) => {
  const telemetry = createTelemetry({
    spanExporter: new InMemorySpanExporter(),
    logExporter: new InMemoryLogRecordExporter(),
    metricExporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
    console: false,
  });
  const { server } = createApp({ telemetry });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await telemetry.shutdown(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const run = (mode, runId) => fetch(`${base}/mend/runs`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode, runId }),
  });

  const empty = await fetch(`${base}/mend`);
  assert.equal(empty.status, 404);
  assert.match(await empty.text(), /No run yet/);
  const healthy = await (await run('normal', 'api-mend-healthy')).json();
  assert.equal(healthy.status, 'HEALTHY');
  assert.equal(healthy.axes.X.records.length, 8);

  const failed = await (await run('break-x', 'api-mend-failed')).json();
  assert.equal(failed.status, 'DEGRADED');
  assert.equal(failed.axes.X.status, 'STALE_HEALTHY');
  assert.equal(failed.axes.Y.status, 'HEALTHY');

  const recovered = await (await run('repaired', 'api-mend-recovered')).json();
  assert.equal(recovered.status, 'HEALTHY');
  assert.equal(recovered.factoryVersion, 'v2');

  const view = await fetch(`${base}/mend`);
  assert.equal(view.status, 200);
  const html = await view.text();
  assert.match(html, /SERPINA1/);
  assert.match(html, /X — Pipeline activity/);
  assert.match(html, /Y — Structural readiness/);
  assert.match(html, /Z — IP activity/);
  assert.match(html, /factory v2 · PUBLISHED/);
  assert.match(html, /HEALTHY/);

  const before = await fetch(`${base}/mend`, { headers: { accept: 'text/html' } });
  assert.equal(before.headers.get('content-type'), 'text/html; charset=utf-8');
});
