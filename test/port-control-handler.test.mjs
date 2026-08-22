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
    return { port_entities: [portEntity('mendTargetRun', 'target-1', {
      target_name: 'EGFR', status: 'review', requested_axes: ['X', 'Y', 'Z'],
      created_at: '2026-08-22T00:00:00.000Z', updated_at: '2026-08-22T00:00:00.000Z',
      correlation_id: 'target-1', contract_version: 'mend.port-control/v1',
    }, { disease_run: 'disease-1', candidate: 'egfr' }, 'EGFR')] };
  } };
  const request = envelope();
  const first = await executePortAction({ envelope: request, idempotencyKey: 'port-1', actions, executions });
  const second = await executePortAction({ envelope: request, idempotencyKey: 'port-1', actions, executions });
  assert.equal(first.status, 'completed');
  assert.equal(first.port_entities[0].blueprint, 'mendTargetRun');
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
});

test('coalesces concurrent delivery attempts with the same idempotency key', async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const executions = new Map();
  const actions = { handoff_candidate: async () => {
    calls += 1;
    await gate;
    return { port_entities: [] };
  } };
  const request = envelope('port-concurrent');
  const first = executePortAction({ envelope: request, idempotencyKey: 'port-concurrent', actions, executions });
  const second = executePortAction({ envelope: request, idempotencyKey: 'port-concurrent', actions, executions });
  release();
  assert.deepEqual(await second, await first);
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
