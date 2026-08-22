import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { AggregationTemporality, InMemoryMetricExporter } from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { emitG3VerificationRun } from '../src/mend/g3-telemetry.mjs';
import { createTelemetry } from '../src/telemetry.mjs';

test('G3 run correlates sponsor, retry, healing, task, decision, and Port identifiers across all signals', async (t) => {
  const spanExporter = new InMemorySpanExporter();
  const logExporter = new InMemoryLogRecordExporter();
  const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  const telemetry = createTelemetry({ spanExporter, logExporter, metricExporter, console: false });
  t.after(() => telemetry.shutdown());
  const identifiers = {
    runId: 'run-1', diseaseRunId: 'disease-1', candidateId: 'candidate-1', targetRunId: 'target-1',
    portRunId: 'port-1', sourceExecutionId: 'source-1', sponsorRequestId: 'request-1', sponsorResultId: 'result-1',
    healingRequestId: 'healing-1', taskId: 'task-1', decisionId: 'decision-1', workflowId: 'workflow-1', targetName: 'EGFR',
  };
  await emitG3VerificationRun({ telemetry, collectorId: 'c_real_configured', identifiers });
  await telemetry.flush();

  const spans = spanExporter.getFinishedSpans();
  const xSponsor = spans.find((span) => span.name === 'sponsor.bright_data.verification');
  assert.equal(xSponsor.attributes['disease.run.id'], 'disease-1');
  assert.equal(xSponsor.attributes['candidate.id'], 'candidate-1');
  assert.equal(xSponsor.attributes['target.run.id'], 'target-1');
  assert.equal(xSponsor.attributes.axis, 'X');
  assert.equal(xSponsor.attributes['source.execution.id'], 'source-1');
  assert.equal(xSponsor.attributes['brightdata.collector.id'], 'c_real_configured');
  assert.equal(xSponsor.attributes['port.run.id'], 'port-1');
  assert.equal(xSponsor.attributes['sponsor.request.id'], 'request-1');
  assert.equal(xSponsor.attributes['sponsor.result.id'], 'result-1');
  assert.ok(spans.some((span) => span.attributes['retry.attempt'] === 1));
  assert.ok(spans.some((span) => span.attributes['healing.request.id'] === 'healing-1'));
  assert.ok(spans.some((span) => span.attributes['diligence.task.id'] === 'task-1'));
  assert.ok(spans.some((span) => span.attributes['diligence.decision.id'] === 'decision-1'));

  const logs = logExporter.getFinishedLogRecords();
  assert.ok(logs.some((log) => log.attributes['sponsor.result.id'] === 'result-1'));
  assert.ok(logs.some((log) => log.attributes['diligence.decision.id'] === 'decision-1'));
  const metricNames = metricExporter.getMetrics().flatMap((batch) => batch.scopeMetrics.flatMap((scope) => scope.metrics.map((metric) => metric.descriptor.name)));
  for (const name of ['mend_sponsor_requests_total', 'mend_sponsor_results_total', 'mend_retries_total', 'mend_healing_decisions_total', 'mend_diligence_tasks_total', 'mend_diligence_decisions_total']) {
    assert.ok(metricNames.includes(name), `missing metric ${name}`);
  }
});

test('G3 run refuses to invent a Bright Data collector ID', async () => {
  await assert.rejects(() => emitG3VerificationRun({ telemetry: {}, collectorId: '' }), /real configured Bright Data collector ID/);
});
