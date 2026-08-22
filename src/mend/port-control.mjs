import { createHash } from 'node:crypto';
import { buildMendPortEnvelope, MEND_PORT_CONTRACT_VERSION, validateMendPortResult } from '../../scripts/lib/port-mend-contracts.mjs';

const pendingByExecutionStore = new WeakMap();

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function validateInboundPortEnvelope(envelope, idempotencyKey) {
  if (envelope?.contract_version !== MEND_PORT_CONTRACT_VERSION) throw new Error('unsupported Port contract_version');
  if (String(idempotencyKey ?? '') !== String(envelope?.idempotency_key ?? '')) throw new Error('Idempotency-Key does not match envelope');
  const rebuilt = buildMendPortEnvelope({
    action: envelope.action,
    portRunId: envelope.port_run_id,
    entityId: envelope.resource?.id,
    parentId: envelope.resource?.parent_id,
    actor: envelope.actor,
    payload: envelope.input,
    requestedAt: envelope.requested_at,
  });
  if (JSON.stringify(rebuilt.resource) !== JSON.stringify(envelope.resource)) throw new Error('Port resource does not match action');
  if (JSON.stringify(rebuilt.correlation) !== JSON.stringify(envelope.correlation)) throw new Error('Port correlation does not match action resource');
  return envelope;
}

export async function executePortAction({ envelope, idempotencyKey, actions, executions = new Map() } = {}) {
  validateInboundPortEnvelope(envelope, idempotencyKey);
  const prior = executions.get(idempotencyKey);
  const requestFingerprint = fingerprint(envelope);
  if (prior) {
    if (prior.requestFingerprint !== requestFingerprint) {
      return {
        contract_version: MEND_PORT_CONTRACT_VERSION,
        port_run_id: envelope.port_run_id,
        action: envelope.action,
        action_execution_id: prior.result.action_execution_id,
        status: 'conflict',
        message: 'idempotency key was already used for a different request',
        correlation: envelope.correlation,
        port_entities: [],
      };
    }
    return prior.result;
  }
  let pending = pendingByExecutionStore.get(executions);
  if (!pending) {
    pending = new Map();
    pendingByExecutionStore.set(executions, pending);
  }
  const inFlight = pending.get(idempotencyKey);
  if (inFlight) {
    if (inFlight.requestFingerprint !== requestFingerprint) {
      return {
        contract_version: MEND_PORT_CONTRACT_VERSION,
        port_run_id: envelope.port_run_id,
        action: envelope.action,
        action_execution_id: `mend-${envelope.port_run_id}`,
        status: 'conflict',
        message: 'idempotency key is in use for a different request',
        correlation: envelope.correlation,
        port_entities: [],
      };
    }
    return inFlight.promise;
  }
  const handler = actions?.[envelope.action];
  if (typeof handler !== 'function') throw new Error(`Port action ${envelope.action} is not implemented`);
  const promise = (async () => {
    const output = await handler(envelope);
    const result = {
      contract_version: MEND_PORT_CONTRACT_VERSION,
      port_run_id: envelope.port_run_id,
      action: envelope.action,
      action_execution_id: `mend-${envelope.port_run_id}`,
      status: output?.status ?? 'completed',
      message: output?.message ?? null,
      correlation: envelope.correlation,
      port_entities: output?.port_entities ?? [],
    };
    validateMendPortResult(result, envelope);
    executions.set(idempotencyKey, { requestFingerprint, result });
    return result;
  })();
  pending.set(idempotencyKey, { requestFingerprint, promise });
  try {
    return await promise;
  } finally {
    pending.delete(idempotencyKey);
  }
}

export function portEntity(blueprint, identifier, properties, relations = {}, title = properties.title ?? identifier) {
  return { blueprint, entity: { identifier, title, properties, relations } };
}
