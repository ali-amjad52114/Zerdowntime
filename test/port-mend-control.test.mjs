import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ACTION_CONTRACTS, MEND_PORT_CONTRACT_VERSION, buildMendPortEnvelope, validateMendPortResult } from "../scripts/lib/port-mend-contracts.mjs";

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const manifest = read("port/manifest.json");
const blueprint = (id) => read(`port/${manifest.blueprints.find((path) => read(`port/${path}`).identifier === id)}`);
const action = (id) => read(`port/${manifest.actions.find((path) => read(`port/${path}`).identifier === id)}`);

test("disease-first Port graph retains independent ownership and human evidence", () => {
  const disease = blueprint("mendDiseaseRun");
  assert.equal(disease.schema.properties.target, undefined, "disease run must never accept a target");
  const candidate = blueprint("mendCandidateTarget");
  assert.equal(candidate.relations.disease_run.required, true);
  assert.ok(candidate.schema.required.includes("contradictory_evidence_count"));
  const target = blueprint("mendTargetRun");
  assert.equal(target.relations.candidate.required, true);
  assert.equal(target.relations.disease_run.required, true);
  const axis = blueprint("mendAxisRun");
  assert.equal(axis.relations.target_run.required, true);
  assert.ok(axis.schema.required.includes("retry_count"));
  assert.ok(axis.schema.required.includes("validation_status"));
  const task = blueprint("mendDiligenceTask");
  assert.ok(task.schema.required.includes("evidence_ids"));
  const decision = blueprint("mendTargetDecision");
  assert.ok(decision.schema.required.includes("evidence_ids"));
  assert.ok(decision.schema.required.includes("open_risks"));
});

test("Mend actions dispatch the real control workflow with stable ownership IDs", () => {
  const expectations = {
    mend_handoff_candidate: ["mendCandidateTarget", true],
    mend_retry_axis: ["mendAxisRun", false],
    mend_approve_source_healing: ["mendAxisRun", true],
    mend_complete_diligence_task: ["mendDiligenceTask", false],
    mend_record_target_decision: ["mendTargetRun", true]
  };
  for (const [id, [target, approval]] of Object.entries(expectations)) {
    const value = action(id);
    assert.equal(value.trigger.blueprintIdentifier, target);
    assert.equal(value.requiredApproval, approval);
    const invocation = value.invocationMethod.integrationActionExecutionProperties;
    assert.equal(invocation.workflow, "port-mend-control.yml");
    for (const field of ["operation", "port_run_id", "entity_id", "parent_id", "actor", "payload_json"]) assert.ok(invocation.workflowInputs[field]);
  }
});

test("action envelopes are versioned, idempotent, validated, and result-correlated", () => {
  assert.deepEqual(Object.keys(ACTION_CONTRACTS).sort(), ["approve_source_healing", "complete_diligence_task", "handoff_candidate", "record_target_decision", "retry_axis"]);
  const envelope = buildMendPortEnvelope({
    action: "handoff_candidate", portRunId: "port-run-17", entityId: "candidate-2", parentId: "disease-1", actor: "reviewer@example.test",
    payload: { axes: ["X", "Y", "Z"], selection_reason: "Independent evidence", expected_selection_status: "pending" },
    requestedAt: "2026-08-22T12:00:00.000Z"
  });
  assert.equal(envelope.contract_version, MEND_PORT_CONTRACT_VERSION);
  assert.equal(envelope.idempotency_key, "port-run-17");
  assert.equal(envelope.resource.parent_id, "disease-1");
  assert.deepEqual(envelope.correlation, { "port.run.id": "port-run-17", "candidate.id": "candidate-2", "disease.run.id": "disease-1" });
  assert.throws(() => buildMendPortEnvelope({ ...envelope, action: "retry_axis", portRunId: "x", entityId: "a", parentId: "t", actor: "r", payload: { axis: "X", reason: "again", expected_status: "failed", expected_retry_count: -1 } }), /non-negative integer/);
  const result = {
    contract_version: MEND_PORT_CONTRACT_VERSION, port_run_id: "port-run-17", action: "handoff_candidate", action_execution_id: "mend-action-9", status: "accepted",
    port_entities: [{ blueprint: "mendCandidateTarget", entity: {
      identifier: "candidate-2", title: "Candidate 2",
      properties: { display_name: "Candidate 2", ranking_score: 1, supporting_evidence_count: 1, contradictory_evidence_count: 0, evidence_ids: ["evidence-1"], selection_status: "handed_off", contract_version: MEND_PORT_CONTRACT_VERSION },
      relations: { disease_run: "disease-1" }
    } }]
  };
  assert.equal(validateMendPortResult(result, envelope), result);
  assert.throws(() => validateMendPortResult({ ...result, port_run_id: "wrong" }, envelope), /does not match/);
  const malformed = structuredClone(result);
  malformed.port_entities[0].entity.properties.placeholder = "not in the blueprint";
  assert.throws(() => validateMendPortResult(malformed, envelope), /not defined by mendCandidateTarget/);
});
