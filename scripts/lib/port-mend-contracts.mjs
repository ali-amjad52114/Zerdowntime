export const MEND_PORT_CONTRACT_VERSION = "mend.port-control/v1";

export const ACTION_CONTRACTS = Object.freeze({
  handoff_candidate: {
    resourceType: "candidate_target",
    required: ["axes", "selection_reason", "expected_selection_status"],
    validate(payload) {
      if (!Array.isArray(payload.axes) || payload.axes.length === 0 || payload.axes.some((axis) => !["X", "Y", "Z"].includes(axis))) {
        throw new Error("handoff_candidate.axes must contain one or more of X, Y, Z.");
      }
      if (new Set(payload.axes).size !== 3 || !["X", "Y", "Z"].every((axis) => payload.axes.includes(axis))) {
        throw new Error("handoff_candidate must run the complete X/Y/Z pipeline.");
      }
      if (payload.expected_selection_status !== "pending") throw new Error("handoff_candidate requires expected_selection_status=pending.");
    }
  },
  retry_axis: {
    resourceType: "axis_run",
    required: ["axis", "reason", "expected_status", "expected_retry_count"],
    validate(payload) {
      if (!["X", "Y", "Z"].includes(payload.axis)) throw new Error("retry_axis.axis must be X, Y, or Z.");
      if (payload.expected_status !== "failed") throw new Error("retry_axis requires expected_status=failed.");
      if (!Number.isInteger(payload.expected_retry_count) || payload.expected_retry_count < 0) throw new Error("retry_axis.expected_retry_count must be a non-negative integer.");
    }
  },
  approve_source_healing: {
    resourceType: "axis_run",
    required: ["source_execution_id", "healing_request_id", "reason", "evidence_url", "expected_status"],
    validate(payload) {
      if (!["X", "Y", "Z"].includes(payload.axis)) throw new Error("approve_source_healing requires axis X, Y, or Z.");
      if (payload.expected_status !== "healing_pending") throw new Error("approve_source_healing requires expected_status=healing_pending.");
      assertHttpUrl(payload.evidence_url, "approve_source_healing.evidence_url");
    }
  },
  complete_diligence_task: {
    resourceType: "diligence_task",
    required: ["finding", "outcome", "evidence_ids", "expected_status"],
    validate(payload) {
      if (!Array.isArray(payload.evidence_ids) || payload.evidence_ids.length === 0) throw new Error("complete_diligence_task.evidence_ids must be non-empty.");
      if (!["supports", "contradicts", "inconclusive", "escalate"].includes(payload.outcome)) throw new Error("complete_diligence_task.outcome is invalid.");
      if (payload.expected_status !== "open") throw new Error("complete_diligence_task requires expected_status=open.");
    }
  },
  record_target_decision: {
    resourceType: "target_run",
    required: ["decision", "rationale", "evidence_ids", "open_risks", "expected_status"],
    validate(payload) {
      if (!["proceed", "hold", "escalate"].includes(payload.decision)) throw new Error("record_target_decision.decision is invalid.");
      if (!Array.isArray(payload.evidence_ids) || payload.evidence_ids.length === 0) throw new Error("record_target_decision.evidence_ids must be non-empty.");
      if (!Array.isArray(payload.open_risks)) throw new Error("record_target_decision.open_risks must be an array.");
      if (payload.expected_status !== "review") throw new Error("record_target_decision requires expected_status=review.");
    }
  }
});

function requiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-empty string.`);
  return value.trim();
}

function assertHttpUrl(value, name) {
  requiredString(value, name);
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${name} must be an HTTP(S) URL.`);
}

export function buildMendPortEnvelope({ action, portRunId, entityId, parentId, actor, payload, requestedAt = new Date().toISOString() }) {
  const contract = ACTION_CONTRACTS[action];
  if (!contract) throw new Error(`Unsupported Mend Port action '${action}'.`);
  requiredString(portRunId, "portRunId");
  requiredString(entityId, "entityId");
  requiredString(parentId, "parentId");
  requiredString(actor, "actor");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("payload must be an object.");
  for (const field of contract.required) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === "") throw new Error(`${action}.${field} is required.`);
  }
  contract.validate(payload);
  const correlation = { "port.run.id": portRunId };
  if (action === "handoff_candidate") {
    correlation["candidate.id"] = entityId;
    correlation["disease.run.id"] = parentId;
  } else if (["retry_axis", "approve_source_healing", "complete_diligence_task"].includes(action)) {
    correlation["target.run.id"] = parentId;
  } else if (action === "record_target_decision") {
    correlation["target.run.id"] = entityId;
    correlation["disease.run.id"] = parentId;
  }
  if (payload.source_execution_id) correlation["source.execution.id"] = payload.source_execution_id;
  return {
    contract_version: MEND_PORT_CONTRACT_VERSION,
    action,
    idempotency_key: portRunId,
    port_run_id: portRunId,
    actor,
    requested_at: requestedAt,
    correlation,
    resource: { type: contract.resourceType, id: entityId, parent_id: parentId },
    input: payload
  };
}

export function validateMendPortResult(result, envelope) {
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Mend action result must be an object.");
  if (result.contract_version !== MEND_PORT_CONTRACT_VERSION) throw new Error("Mend action result contract_version does not match.");
  if (result.port_run_id !== envelope.port_run_id) throw new Error("Mend action result port_run_id does not match.");
  requiredString(result.action_execution_id, "result.action_execution_id");
  if (!["accepted", "completed", "rejected", "conflict"].includes(result.status)) throw new Error("Mend action result status is invalid.");
  if (!Array.isArray(result.port_entities)) throw new Error("Mend action result port_entities must be an array.");
  for (const [index, entry] of result.port_entities.entries()) {
    requiredString(entry?.blueprint, `result.port_entities[${index}].blueprint`);
    requiredString(entry?.entity?.identifier, `result.port_entities[${index}].entity.identifier`);
    if (!entry.entity.properties || typeof entry.entity.properties !== "object") throw new Error(`result.port_entities[${index}].entity.properties must be an object.`);
  }
  return result;
}
