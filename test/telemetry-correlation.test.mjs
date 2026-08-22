import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { AggregationTemporality, InMemoryMetricExporter } from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import {
  CORRELATION_ATTRIBUTE_KEYS,
  correlationAttributes,
  createTelemetry,
  redactSensitiveText,
  sanitizeTelemetryAttributes,
} from '../src/telemetry.mjs';

function testTelemetry(options = {}) {
  const spanExporter = new InMemorySpanExporter();
  const logExporter = new InMemoryLogRecordExporter();
  const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  const telemetry = createTelemetry({
    spanExporter, logExporter, metricExporter, console: false, ...options,
  });
  return { telemetry, spanExporter, logExporter };
}

test('normalizes the complete Mend correlation contract', () => {
  assert.deepEqual(correlationAttributes({
    runId: 'legacy-1', diseaseRunId: 'disease-1', candidateId: 'candidate-1',
    targetRunId: 'target-1', targetName: 'IL6', axis: 'x', sourceProvider: 'brightdata',
    sourceExecutionId: 'snapshot-1', brightdataCollectorId: 'collector-1',
    brightdataDatasetId: 'dataset-1', portRunId: 'port-1', sponsorRequestId: 'request-1',
    sponsorResultId: 'result-1', actionExecutionId: 'action-1', retryAttempt: 2,
    healingRequestId: 'healing-1', diligenceTaskId: 'task-1', diligenceDecisionId: 'decision-1',
    workflowId: 'workflow-1', validationStatus: 'PASS', ignored: 'nope',
  }), {
    'run.id': 'legacy-1',
    'disease.run.id': 'disease-1',
    'candidate.id': 'candidate-1',
    'target.run.id': 'target-1',
    'target.name': 'IL6',
    axis: 'X',
    'source.provider': 'brightdata',
    'source.execution.id': 'snapshot-1',
    'brightdata.collector.id': 'collector-1',
    'brightdata.dataset.id': 'dataset-1',
    'port.run.id': 'port-1',
    'sponsor.request.id': 'request-1',
    'sponsor.result.id': 'result-1',
    'action.execution.id': 'action-1',
    'retry.attempt': 2,
    'healing.request.id': 'healing-1',
    'diligence.task.id': 'task-1',
    'diligence.decision.id': 'decision-1',
    'workflow.id': 'workflow-1',
    'validation.status': 'PASS',
  });
  assert.ok(CORRELATION_ATTRIBUTE_KEYS.includes('disease.run.id'));
  assert.ok(CORRELATION_ATTRIBUTE_KEYS.includes('port.run.id'));
  assert.ok(CORRELATION_ATTRIBUTE_KEYS.includes('sponsor.result.id'));
});

test('bound telemetry applies correlation to spans and logs', async (t) => {
  const kit = testTelemetry({ correlation: { diseaseRunId: 'disease-1' } });
  t.after(() => kit.telemetry.shutdown());
  const target = kit.telemetry.bindCorrelation({
    candidateId: 'candidate-1', targetRunId: 'target-1', axis: 'y',
    sourceProvider: 'rcsb', sourceExecutionId: 'request-1',
  });
  const span = target.startSpan('source.fetch', { 'target.run.id': 'wrong-target' });
  target.log('INFO', 'source completed', { 'validation.status': 'PASS' }, span);
  span.end();
  await kit.telemetry.flush();

  assert.deepEqual(kit.spanExporter.getFinishedSpans()[0].attributes, {
    'disease.run.id': 'disease-1',
    'candidate.id': 'candidate-1',
    'target.run.id': 'target-1',
    axis: 'Y',
    'source.provider': 'rcsb',
    'source.execution.id': 'request-1',
  });
  const log = kit.logExporter.getFinishedLogRecords()[0];
  assert.equal(log.attributes['target.run.id'], 'target-1');
  assert.equal(log.attributes['validation.status'], 'PASS');
  assert.equal(log.spanContext.traceId, kit.spanExporter.getFinishedSpans()[0].spanContext().traceId);
  assert.ok(kit.telemetry.metrics.sourceExecutions);
  assert.ok(kit.telemetry.metrics.sourceDuration);
  assert.ok(kit.telemetry.metrics.sourceFailures);
  assert.ok(kit.telemetry.metrics.sponsorRequests);
  assert.ok(kit.telemetry.metrics.diligenceDecisions);
});

test('removes credential-shaped attributes and redacts messages', async (t) => {
  const kit = testTelemetry();
  t.after(() => kit.telemetry.shutdown());
  const span = kit.telemetry.startSpan('safe', {
    'run.id': 'run-1', authorization: 'Bearer secret-value', api_key: 'secret-value', safe: 'yes',
  });
  kit.telemetry.log('ERROR', 'request failed token=secret-value', {
    password: 'secret-value', detail: 'Bearer secret-value',
  }, span);
  kit.telemetry.failSpan(span, new Error('api_key=secret-value'));
  span.end();
  await kit.telemetry.flush();

  const finished = kit.spanExporter.getFinishedSpans()[0];
  assert.equal(finished.attributes.authorization, undefined);
  assert.equal(finished.attributes.api_key, undefined);
  assert.equal(finished.attributes.safe, 'yes');
  assert.equal(finished.status.message, 'api_key=[REDACTED]');
  const log = kit.logExporter.getFinishedLogRecords()[0];
  assert.equal(log.body, 'request failed token=[REDACTED]');
  assert.equal(log.attributes.password, undefined);
  assert.equal(log.attributes.detail, 'Bearer [REDACTED]');
  assert.deepEqual(sanitizeTelemetryAttributes({ token: 'x', safe: 'y' }), { safe: 'y' });
  assert.deepEqual(sanitizeTelemetryAttributes({ 'signoz-ingestion-key': 'x', headers: 'x', safe: 'y' }), { safe: 'y' });
  assert.equal(redactSensitiveText('Bearer abc.def'), 'Bearer [REDACTED]');
  assert.equal(redactSensitiveText('signoz-ingestion-key=abc123'), 'signoz-ingestion-key=[REDACTED]');
});
