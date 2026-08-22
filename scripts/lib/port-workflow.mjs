import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const MAX_RETRIES = 2;

function now() {
  return new Date().toISOString();
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

export function validateBrief(brief) {
  if (!brief || typeof brief !== "object" || Array.isArray(brief)) throw new Error("Brief must be a JSON object.");
  for (const field of ["title", "summary"]) {
    if (typeof brief[field] !== "string" || !brief[field].trim()) throw new Error(`Brief field '${field}' must be a non-empty string.`);
  }
  for (const field of ["goals", "acceptance_criteria"]) {
    if (!Array.isArray(brief[field]) || brief[field].length === 0 || brief[field].some((item) => typeof item !== "string" || !item.trim())) {
      throw new Error(`Brief field '${field}' must be a non-empty string array.`);
    }
  }
  if (brief.constraints !== undefined && !Array.isArray(brief.constraints)) throw new Error("Brief field 'constraints' must be an array when present.");
  return brief;
}

export function makePlan(brief, revision = 1) {
  validateBrief(brief);
  const plan = {
    revision,
    objective: brief.summary,
    steps: [
      { id: "build", purpose: `Implement ${brief.goals.length} stated goal(s) within ${(brief.constraints ?? []).length} constraint(s).` },
      { id: "test", purpose: `Verify ${brief.acceptance_criteria.length} acceptance criterion/criteria with automated evidence.` },
      { id: "approval", purpose: "Require an explicit human decision before release." },
      { id: "release", purpose: "Release only the approved, verified plan." },
      { id: "audit", purpose: "Record inputs, outputs, decisions, retries, and correlation identifiers." }
    ],
    acceptance_criteria: brief.acceptance_criteria,
    constraints: brief.constraints ?? []
  };
  return { plan, planHash: hash({ brief, plan }) };
}

function event(state, type, details = {}) {
  state.audit.push({ sequence: state.audit.length + 1, at: now(), type, stage: state.status, ...details });
}

function save(state, artifactRoot) {
  const directory = join(artifactRoot, state.id);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "run.json");
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return path;
}

export function loadRun(runId, artifactRoot) {
  return JSON.parse(readFileSync(join(artifactRoot, runId, "run.json"), "utf8"));
}

function stage(state, name, shouldFail) {
  state.status = name === "build" ? "building" : "testing";
  event(state, "stage_started", { target_stage: name });
  if (shouldFail) return fail(state, name, `Controlled ${name} failure requested by smoke test.`);
  state.outputs[name] = { status: "passed", evidence: `${name} checks completed for plan ${state.plan_hash}` };
  event(state, "stage_succeeded", { target_stage: name });
  return true;
}

function fail(state, name, reason) {
  state.attempts[name] = (state.attempts[name] ?? 0) + 1;
  state.failed_stage = name;
  event(state, "stage_failed", { target_stage: name, attempt: state.attempts[name], reason });
  if (state.retry_count < state.max_retries) {
    state.status = "retry_pending";
    event(state, "retry_scheduled", { target_stage: name, retry: state.retry_count + 1, max_retries: state.max_retries });
  } else {
    state.status = "escalated";
    event(state, "escalated", { target_stage: name, failures: state.attempts[name], reason: "Retry budget exhausted; human intervention required." });
  }
  return false;
}

export function prepare({ brief, runId = randomUUID(), artifactRoot = "artifacts/port", failStage }) {
  validateBrief(brief);
  const { plan, planHash } = makePlan(brief, 1);
  const state = {
    id: runId,
    title: brief.title,
    correlation_id: runId,
    brief,
    requirement_revision: 1,
    plan,
    plan_hash: planHash,
    status: "planning",
    failed_stage: null,
    retry_count: 0,
    max_retries: MAX_RETRIES,
    attempts: {},
    outputs: {},
    audit: []
  };
  event(state, "brief_accepted", { brief_hash: hash(brief) });
  event(state, "plan_created", { plan_hash: planHash, revision: 1 });
  if (!stage(state, "build", failStage === "build") || !stage(state, "test", failStage === "test")) {
    save(state, artifactRoot);
    return state;
  }
  state.status = "awaiting_approval";
  event(state, "approval_requested", { plan_hash: state.plan_hash });
  save(state, artifactRoot);
  return state;
}

export function retry({ runId, artifactRoot = "artifacts/port", failStage }) {
  const state = loadRun(runId, artifactRoot);
  if (state.status !== "retry_pending") throw new Error(`Run '${runId}' is '${state.status}', not retry_pending.`);
  const failedStage = state.failed_stage;
  state.retry_count += 1;
  event(state, "retry_started", { target_stage: failedStage, retry: state.retry_count, reason: "Operator or policy invoked bounded retry." });
  const stages = failedStage === "build" ? ["build", "test"] : ["test"];
  for (const name of stages) {
    if (!stage(state, name, failStage === name)) {
      save(state, artifactRoot);
      return state;
    }
  }
  state.failed_stage = null;
  state.status = "awaiting_approval";
  event(state, "approval_requested", { plan_hash: state.plan_hash });
  save(state, artifactRoot);
  return state;
}

export function revise({ runId, brief, artifactRoot = "artifacts/port" }) {
  validateBrief(brief);
  const state = loadRun(runId, artifactRoot);
  if (["released", "rejected"].includes(state.status)) throw new Error(`A terminal '${state.status}' run cannot be revised.`);
  const previousHash = state.plan_hash;
  state.brief = brief;
  state.requirement_revision += 1;
  const { plan, planHash } = makePlan(brief, state.requirement_revision);
  state.plan = plan;
  state.plan_hash = planHash;
  state.attempts = {};
  state.retry_count = 0;
  state.failed_stage = null;
  event(state, "plan_revised", { previous_plan_hash: previousHash, plan_hash: planHash, revision: state.requirement_revision });
  stage(state, "build", false);
  stage(state, "test", false);
  state.status = "awaiting_approval";
  event(state, "approval_requested", { plan_hash: state.plan_hash });
  save(state, artifactRoot);
  return state;
}

export function decide({ runId, decision, actor = "local-reviewer", reason = "", artifactRoot = "artifacts/port", expectedPlanHash }) {
  const state = loadRun(runId, artifactRoot);
  if (state.status !== "awaiting_approval") throw new Error(`Run '${runId}' is '${state.status}', not awaiting_approval.`);
  if (expectedPlanHash && expectedPlanHash !== state.plan_hash) throw new Error(`Plan hash mismatch: expected ${expectedPlanHash}, found ${state.plan_hash}.`);
  if (!['approve', 'reject'].includes(decision)) throw new Error("Decision must be 'approve' or 'reject'.");
  event(state, "approval_decision", { decision, actor, reason, plan_hash: state.plan_hash });
  if (decision === "reject") {
    state.status = "rejected";
    state.outputs.release = { status: "blocked", reason: reason || "Human reviewer rejected the release." };
    event(state, "release_blocked", { decision: "reject" });
  } else {
    state.status = "releasing";
    event(state, "release_started", { approved_by: actor });
    state.outputs.release = { status: "released", evidence: `Approved plan ${state.plan_hash} passed release simulation.` };
    state.status = "released";
    event(state, "release_succeeded", { plan_hash: state.plan_hash });
    event(state, "audit_completed", { event_count: state.audit.length + 1 });
  }
  save(state, artifactRoot);
  return state;
}

export function toPortEntity(state) {
  return {
    identifier: state.id,
    title: state.title,
    properties: {
      brief: state.brief,
      requirement_revision: state.requirement_revision,
      plan: state.plan,
      plan_hash: state.plan_hash,
      status: state.status,
      ...(state.failed_stage ? { failed_stage: state.failed_stage } : {}),
      retry_count: state.retry_count,
      max_retries: state.max_retries,
      attempts: state.attempts,
      outputs: state.outputs,
      audit: state.audit,
      correlation_id: state.correlation_id
    },
    relations: { project: "zero-downtime-factory" }
  };
}
