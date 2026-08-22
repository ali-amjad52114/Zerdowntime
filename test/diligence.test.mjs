import assert from 'node:assert/strict';
import test from 'node:test';
import { completeDiligenceTask, createDiligenceWorkflow, recordDiligenceDecision } from '../src/mend/diligence.mjs';

function evidence(axis, index) {
  return {
    axis,
    subject: `${axis} subject ${index}`,
    value: `${axis} value ${index}`,
    source_url: `https://example.test/${axis.toLowerCase()}/${index}`,
    retrieved_at: '2026-08-22T00:00:00.000Z',
    evidence: `${axis} evidence ${index}`,
  };
}

function healthyRun() {
  return {
    runId: 'diligence-run',
    factoryVersion: 'v2',
    status: 'HEALTHY',
    publishStatus: 'PUBLISHED',
    axes: {
      X: { records: Array.from({ length: 8 }, (_, index) => evidence('X', index)), summary: { programsFound: 8 } },
      Y: { records: Array.from({ length: 3 }, (_, index) => evidence('Y', index)), summary: { experimental_structures: 3, best_resolution_angstrom: 1.83 } },
      Z: { records: Array.from({ length: 3 }, (_, index) => evidence('Z', index)), summary: { relevant_records: 3 } },
    },
  };
}

test('healthy evidence becomes an actionable, evidence-linked diligence workflow', () => {
  const workflow = createDiligenceWorkflow(healthyRun(), { id: 'workflow-1', createdAt: '2026-08-22T01:00:00.000Z' });
  assert.equal(workflow.status, 'IN_PROGRESS');
  assert.equal(workflow.recommendation.code, 'PROCEED_TO_FOCUSED_DILIGENCE');
  assert.equal(workflow.signals.X.code, 'ACTIVE_COMPETITIVE_LANDSCAPE');
  assert.equal(workflow.signals.Y.best_resolution_angstrom, 1.83);
  assert.equal(workflow.signals.Z.code, 'IP_COUNSEL_TRIAGE_REQUIRED');
  assert.deepEqual(workflow.tasks.map((task) => task.evidence.length), [8, 3, 3]);
  assert.ok(workflow.tasks.every((task) => task.evidence.every((item) => item.source_url.startsWith('https://'))));
});

test('degraded or unpublished evidence cannot create diligence work', () => {
  const run = healthyRun();
  run.status = 'DEGRADED';
  run.publishStatus = 'PRESERVED_PREVIOUS_HEALTHY';
  assert.throws(() => createDiligenceWorkflow(run), /healthy published/);
});

test('tasks require findings and gate the final human decision', () => {
  let workflow = createDiligenceWorkflow(healthyRun(), { id: 'workflow-2', createdAt: '2026-08-22T01:00:00.000Z' });
  assert.throws(() => completeDiligenceTask(workflow, { taskId: workflow.tasks[0].id, actor: 'analyst' }), /finding/);
  assert.throws(() => recordDiligenceDecision(workflow, { decision: 'HOLD', actor: 'reviewer', rationale: 'Wait' }), /all diligence tasks/);

  for (const item of workflow.tasks) {
    workflow = completeDiligenceTask(workflow, {
      taskId: item.id,
      actor: `${item.axis.toLowerCase()}-reviewer`,
      finding: `${item.axis} review completed with documented follow-up work.`,
      completedAt: `2026-08-22T01:0${workflow.history.length}:00.000Z`,
    });
  }
  assert.equal(workflow.status, 'READY_FOR_DECISION');

  workflow = recordDiligenceDecision(workflow, {
    decision: 'PROCEED_TO_FOCUSED_DILIGENCE',
    actor: 'portfolio-lead',
    rationale: 'The reviewed evidence supports bounded follow-up work while preserving the stated scientific and legal limitations.',
    decidedAt: '2026-08-22T02:00:00.000Z',
  });
  assert.equal(workflow.status, 'DECIDED');
  assert.equal(workflow.decision.actor, 'portfolio-lead');
  assert.equal(workflow.history.at(-1).type, 'DECISION_RECORDED');
});
