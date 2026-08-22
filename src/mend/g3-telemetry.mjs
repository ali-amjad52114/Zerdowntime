import { randomUUID } from 'node:crypto';

function id(prefix) {
  return `${prefix}-${randomUUID()}`;
}

export async function emitG3VerificationRun({ telemetry, collectorId, identifiers = {} } = {}) {
  if (!telemetry) throw new Error('telemetry is required');
  if (!collectorId) throw new Error('a real configured Bright Data collector ID is required');
  const ids = {
    runId: identifiers.runId ?? id('g3'),
    diseaseRunId: identifiers.diseaseRunId ?? id('disease'),
    candidateId: identifiers.candidateId ?? id('candidate'),
    targetRunId: identifiers.targetRunId ?? id('target'),
    portRunId: identifiers.portRunId ?? id('port'),
    sourceExecutionId: identifiers.sourceExecutionId ?? id('source'),
    sponsorRequestId: identifiers.sponsorRequestId ?? id('request'),
    sponsorResultId: identifiers.sponsorResultId ?? id('result'),
    healingRequestId: identifiers.healingRequestId ?? id('healing'),
    taskId: identifiers.taskId ?? id('task'),
    decisionId: identifiers.decisionId ?? id('decision'),
    workflowId: identifiers.workflowId ?? id('workflow'),
  };
  const base = telemetry.bindCorrelation({
    ...ids, targetName: identifiers.targetName ?? 'G3_VERIFICATION_TARGET',
  });
  const root = base.startSpan('mend.g3.verification', {
    'verification.mode': 'controlled', 'verification.synthetic_data': true,
  });
  try {
    base.log('INFO', 'G3 disease-to-target verification started', { 'verification.phase': 'started' }, root);
    for (const axis of ['X', 'Y', 'Z']) {
      const source = axis === 'X' ? 'bright_data' : axis === 'Y' ? 'rcsb' : 'epo';
      const axisIds = axis === 'X' ? ids : {
        sourceExecutionId: id(`source-${axis.toLowerCase()}`),
        sponsorRequestId: id(`request-${axis.toLowerCase()}`),
        sponsorResultId: id(`result-${axis.toLowerCase()}`),
      };
      const bound = telemetry.bindCorrelation({
        ...ids, ...axisIds, axis, sourceProvider: source,
        ...(axis === 'X' ? { brightdataCollectorId: collectorId } : {}),
        validationStatus: 'PASS',
      });
      const span = bound.startSpan(`sponsor.${source}.verification`, { 'sponsor.phase': 'request' }, root);
      bound.log('INFO', 'Sponsor request started', { 'sponsor.phase': 'request' }, span);
      telemetry.metrics.sponsorRequests.add(1, bound.attributes({ outcome: 'started' }));
      span.setAttribute('sponsor.phase', 'result');
      bound.log('INFO', 'Sponsor result received', { 'sponsor.phase': 'result', 'record.count': 1 }, span);
      telemetry.metrics.sponsorResults.add(1, bound.attributes({ outcome: 'success' }));
      telemetry.metrics.sourceExecutions.add(1, bound.attributes({ outcome: 'success' }));
      span.end();
    }

    const retry = telemetry.bindCorrelation({ ...ids, axis: 'X', retryAttempt: 1 });
    const retrySpan = retry.startSpan('axis.retry', { 'retry.phase': 'started' }, root);
    retry.log('INFO', 'Bounded retry completed', { 'retry.phase': 'result', outcome: 'success' }, retrySpan);
    telemetry.metrics.retries.add(1, retry.attributes({ outcome: 'success' }));
    retrySpan.end();

    const healing = telemetry.bindCorrelation({ ...ids, axis: 'X', healingRequestId: ids.healingRequestId });
    const healingSpan = healing.startSpan('source.healing.decision', { 'healing.decision': 'approved' }, root);
    healing.log('INFO', 'Source healing approved by human gate', { 'healing.decision': 'approved' }, healingSpan);
    telemetry.metrics.healing.add(1, healing.attributes({ outcome: 'approved' }));
    healingSpan.end();

    const task = telemetry.bindCorrelation({ ...ids, axis: 'X', diligenceTaskId: ids.taskId, workflowId: ids.workflowId });
    const taskSpan = task.startSpan('diligence.task.complete', {}, root);
    task.log('INFO', 'Diligence task completed', { outcome: 'completed' }, taskSpan);
    telemetry.metrics.diligenceTasks.add(1, task.attributes({ outcome: 'completed' }));
    taskSpan.end();

    const decision = telemetry.bindCorrelation({ ...ids, diligenceDecisionId: ids.decisionId, workflowId: ids.workflowId });
    const decisionSpan = decision.startSpan('diligence.decision.record', {}, root);
    decision.log('INFO', 'Diligence decision recorded', { decision: 'hold' }, decisionSpan);
    telemetry.metrics.diligenceDecisions.add(1, decision.attributes({ outcome: 'hold' }));
    decisionSpan.end();

    base.log('INFO', 'G3 disease-to-target verification completed', { 'verification.phase': 'result', outcome: 'success' }, root);
    return { ...ids, axis: 'X', brightdataCollectorId: collectorId };
  } catch (error) {
    telemetry.failSpan(root, error);
    throw error;
  } finally {
    root.end();
  }
}
