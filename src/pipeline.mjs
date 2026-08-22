import { randomUUID } from 'node:crypto';
import { validateNormalizedRecords } from './records.mjs';

async function stage(telemetry, parent, runId, name, operation) {
  const span = telemetry.startSpan(`pipeline.${name}`, { 'run.id': runId, 'pipeline.stage': name }, parent);
  telemetry.metrics.stages.add(1, { 'pipeline.stage': name, 'run.id': runId });
  telemetry.log('INFO', `stage ${name} started`, { 'run.id': runId, 'pipeline.stage': name }, span);
  try {
    const result = await operation(span);
    telemetry.log('INFO', `stage ${name} completed`, { 'run.id': runId, 'pipeline.stage': name }, span);
    return result;
  } catch (error) {
    telemetry.failSpan(span, error);
    telemetry.metrics.failures.add(1, { 'pipeline.stage': name, 'run.id': runId });
    telemetry.log('ERROR', `stage ${name} failed: ${error.message}`, {
      'run.id': runId,
      'pipeline.stage': name,
      'error.type': error.name,
      'escalation.target': 'human-review',
      'retry.eligible': true,
    }, span);
    throw error;
  } finally {
    span.end();
  }
}

export async function runPipeline({ telemetry, records, mode = 'normal', runId = randomUUID(), parentSpan }) {
  const startedAt = performance.now();
  const root = telemetry.startSpan('workflow.run', { 'run.id': runId, 'run.mode': mode }, parentSpan);
  let outcome = 'success';
  try {
    await stage(telemetry, root, runId, 'scrape', async () => {
      if (mode === 'fail' || mode === 'recover') throw new Error('controlled scrape/schema failure');
      return validateNormalizedRecords(records);
    });
  } catch (error) {
    if (mode !== 'recover') {
      outcome = 'error';
      telemetry.failSpan(root, error);
      throw error;
    }
    await stage(telemetry, root, runId, 'heal.request', async (span) => {
      span.addEvent('scraper.heal.requested', { 'run.id': runId, 'approval.required': true });
    });
    await stage(telemetry, root, runId, 'heal.approval', async (span) => {
      span.addEvent('scraper.heal.approved', { 'run.id': runId, 'approval.actor': 'smoke-test-fixture' });
    });
    await stage(telemetry, root, runId, 'scrape.retry', () => validateNormalizedRecords(records));
  } finally {
    const duration = performance.now() - startedAt;
    telemetry.metrics.runs.add(1, { outcome, 'run.id': runId });
    telemetry.metrics.duration.record(duration, { outcome, 'run.id': runId });
    telemetry.log(outcome === 'success' ? 'INFO' : 'ERROR', `workflow ${outcome}`, { 'run.id': runId, outcome, 'duration.ms': duration }, root);
    root.end();
  }
  return { runId, outcome, recordCount: records.length };
}
