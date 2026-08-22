import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { AggregationTemporality, InMemoryMetricExporter } from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { runDemoLifecycle } from '../src/mend/demo.mjs';
import { createTelemetry } from '../src/telemetry.mjs';

test('SigNoz telemetry can correlate healthy, X failure, repair, and recovery', async (t) => {
  const spanExporter = new InMemorySpanExporter();
  const logExporter = new InMemoryLogRecordExporter();
  const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  const telemetry = createTelemetry({ spanExporter, logExporter, metricExporter, console: false });
  t.after(() => telemetry.shutdown());

  await runDemoLifecycle({ telemetry });
  await telemetry.flush();

  const spans = spanExporter.getFinishedSpans();
  assert.equal(spans.filter((span) => span.name === 'factory.run').length, 3);
  for (const name of ['axis.x', 'axis.y', 'axis.z']) assert.ok(spans.some((span) => span.name === name));
  const failedX = spans.find((span) => span.name === 'axis.x' && span.attributes['run.id'] === 'mend-v1-x-failed');
  assert.equal(failedX.status.code, 2);
  assert.equal(failedX.attributes['validation.status'], 'FAIL');
  assert.ok(spans.some((span) => span.name === 'factory.run' && span.attributes['factory.version'] === 'v2'));

  const logs = logExporter.getFinishedLogRecords();
  assert.ok(logs.some((log) => log.attributes['run.id'] === 'mend-v1-x-failed' && log.attributes.axis === 'X' && log.severityText === 'ERROR'));
  assert.ok(logs.some((log) => log.attributes['run.id'] === 'mend-v2-recovered' && log.attributes['factory.status'] === 'HEALTHY'));

  const metricNames = metricExporter.getMetrics().flatMap((batch) => batch.scopeMetrics.flatMap((scope) => scope.metrics.map((metric) => metric.descriptor.name)));
  for (const name of [
    'mend_factory_runs_total', 'mend_factory_run_duration_ms', 'mend_x_records', 'mend_y_records', 'mend_z_records',
    'mend_validation_failures_total', 'mend_repair_attempts_total', 'mend_repair_success_total',
  ]) assert.ok(metricNames.includes(name), `missing metric ${name}`);
});
