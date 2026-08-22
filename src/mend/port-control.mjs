import { createHash } from 'node:crypto';
import { buildMendPortEnvelope, MEND_PORT_CONTRACT_VERSION } from '../../scripts/lib/port-mend-contracts.mjs';

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
  if (rebuilt.resource.type !== envelope.resource?.type) throw new Error('Port resource type does not match action');
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
        action_execution_id: prior.result.action_execution_id,
        status: 'conflict',
        message: 'idempotency key was already used for a different request',
        port_entities: [],
      };
    }
    return prior.result;
  }
  const handler = actions?.[envelope.action];
  if (typeof handler !== 'function') throw new Error(`Port action ${envelope.action} is not implemented`);
  const output = await handler(envelope);
  const result = {
    contract_version: MEND_PORT_CONTRACT_VERSION,
    port_run_id: envelope.port_run_id,
    action_execution_id: `mend-${envelope.port_run_id}`,
    status: output?.status ?? 'completed',
    message: output?.message ?? null,
    port_entities: output?.port_entities ?? [],
  };
  executions.set(idempotencyKey, { requestFingerprint, result });
  return result;
}

export function portEntity(blueprint, identifier, properties, relations = {}) {
  return { blueprint, entity: { identifier, title: properties.title ?? identifier, properties, relations } };
}
