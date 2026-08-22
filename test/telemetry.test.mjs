import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { AggregationTemporality, InMemoryMetricExporter } from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { runPipeline } from '../src/pipeline.mjs';
import { createTelemetry } from '../src/telemetry.mjs';

function testTelemetry() {
  const spanExporter = new InMemorySpanExporter();
  const logExporter = new InMemoryLogRecordExporter();
  const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  const telemetry = createTelemetry({ spanExporter, logExporter, metricExporter, console: false });
  return { telemetry, spanExporter, logExporter, metricExporter };
}

const records = [{ id: 'one', label: 'One', sourceUrl: 'https://example.com/one', attributes: {} }];

test('exports correlated traces, logs, and metrics for API-shaped and background work', async (t) => {
  const kit = testTelemetry();
  t.after(() => kit.telemetry.shutdown());
  const apiSpan = kit.telemetry.startSpan('api.POST /runs');
  const result = await runPipeline({ telemetry: kit.telemetry, records, runId: 'run-success', parentSpan: apiSpan });
  apiSpan.end();
  await kit.telemetry.flush();

  assert.equal(result.outcome, 'success');
  const spans = kit.spanExporter.getFinishedSpans();
  assert.ok(spans.some((span) => span.name === 'api.POST /runs'));
  assert.ok(spans.some((span) => span.name === 'pipeline.scrape'));
  assert.equal(new Set(spans.map((span) => span.spanContext().traceId)).size, 1);

  const correlatedLogs = kit.logExporter.getFinishedLogRecords().filter((log) => log.attributes['run.id'] === 'run-success');
  assert.ok(correlatedLogs.length >= 3);
  assert.ok(correlatedLogs.every((log) => log.spanContext?.traceId === spans[0].spanContext().traceId));

  const metricNames = kit.metricExporter.getMetrics().flatMap((batch) => batch.scopeMetrics.flatMap((scope) => scope.metrics.map((metric) => metric.descriptor.name)));
  assert.ok(metricNames.includes('zero_downtime_runs_total'));
  assert.ok(metricNames.includes('zero_downtime_run_duration_ms'));
  assert.ok(metricNames.includes('zero_downtime_stage_executions_total'));
});

test('controlled recovery records failure, heal request, approval, and retry', async (t) => {
  const kit = testTelemetry();
  t.after(() => kit.telemetry.shutdown());
  const result = await runPipeline({ telemetry: kit.telemetry, records, mode: 'recover', runId: 'run-recover' });
  await kit.telemetry.flush();

  assert.equal(result.outcome, 'success');
  const spans = kit.spanExporter.getFinishedSpans();
  for (const name of ['pipeline.scrape', 'pipeline.heal.request', 'pipeline.heal.approval', 'pipeline.scrape.retry']) {
    assert.ok(spans.some((span) => span.name === name), `missing ${name}`);
  }
  assert.equal(spans.find((span) => span.name === 'pipeline.scrape').status.code, 2);
  assert.ok(kit.logExporter.getFinishedLogRecords().some((log) => log.severityText === 'ERROR' && log.attributes['pipeline.stage'] === 'scrape'));
});

test('unrecovered controlled failure rejects and increments the failure path', async (t) => {
  const kit = testTelemetry();
  t.after(() => kit.telemetry.shutdown());
  await assert.rejects(
    runPipeline({ telemetry: kit.telemetry, records, mode: 'fail', runId: 'run-fail' }),
    /controlled scrape\/schema failure/,
  );
  await kit.telemetry.flush();
  assert.ok(kit.spanExporter.getFinishedSpans().some((span) => span.name === 'workflow.run' && span.status.code === 2));
});
