import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMendPortEnvelope } from '../scripts/lib/port-mend-contracts.mjs';
import { executePortAction, portEntity } from '../src/mend/port-control.mjs';

function envelope(portRunId = 'port-1') {
  return buildMendPortEnvelope({
    action: 'handoff_candidate', portRunId, entityId: 'egfr', parentId: 'disease-1', actor: 'reviewer',
    payload: { axes: ['X', 'Y', 'Z'], selection_reason: 'Evidence review', expected_selection_status: 'pending' },
  });
}

test('executes a versioned Port action once and returns sync-ready entities', async () => {
  let calls = 0;
  const executions = new Map();
  const actions = { handoff_candidate: async () => {
    calls += 1;
    return { port_entities: [portEntity('mendTargetRun', 'target-1', { title: 'EGFR', status: 'review' })] };
  } };
  const request = envelope();
  const first = await executePortAction({ envelope: request, idempotencyKey: 'port-1', actions, executions });
  const second = await executePortAction({ envelope: request, idempotencyKey: 'port-1', actions, executions });
  assert.equal(first.status, 'completed');
  assert.equal(first.port_entities[0].blueprint, 'mendTargetRun');
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
});

test('rejects mismatched idempotency headers and conflicts on key reuse', async () => {
  const executions = new Map();
  const actions = { handoff_candidate: async () => ({ port_entities: [] }) };
  await assert.rejects(() => executePortAction({ envelope: envelope(), idempotencyKey: 'wrong', actions, executions }), /does not match/);
  await executePortAction({ envelope: envelope(), idempotencyKey: 'port-1', actions, executions });
  const changed = envelope('port-1');
  changed.input.selection_reason = 'Different';
  const result = await executePortAction({ envelope: changed, idempotencyKey: 'port-1', actions, executions });
  assert.equal(result.status, 'conflict');
});
