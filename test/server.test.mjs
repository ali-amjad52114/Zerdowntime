import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { AggregationTemporality, InMemoryMetricExporter } from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { createApp } from '../src/server.mjs';
import { createTelemetry } from '../src/telemetry.mjs';

test('API exposes normal, controlled failure, and recovery runs', async (t) => {
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

  assert.equal((await fetch(`${base}/health`)).status, 200);
  const success = await fetch(`${base}/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId: 'api-success' }) });
  assert.equal(success.status, 200);
  assert.equal((await success.json()).runId, 'api-success');

  const failure = await fetch(`${base}/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'fail', runId: 'api-fail' }) });
  assert.equal(failure.status, 500);

  const recovery = await fetch(`${base}/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'recover', runId: 'api-recover' }) });
  assert.equal(recovery.status, 200);
  assert.equal((await recovery.json()).outcome, 'success');
});
