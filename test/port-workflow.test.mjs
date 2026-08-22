import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { decide, prepare, retry, revise } from "../scripts/lib/port-workflow.mjs";

const brief = { title: "Neutral change", summary: "Process normalized records.", goals: ["Prove the boundary"], constraints: ["No credentials"], acceptance_criteria: ["Automated evidence exists"] };
const roots = [];
const root = () => { const path = mkdtempSync(join(tmpdir(), "port-flow-")); roots.push(path); return path; };
test.after(() => roots.forEach((path) => rmSync(path, { recursive: true, force: true })));

test("happy path stops for approval then releases with audit evidence", () => {
  const artifactRoot = root();
  const prepared = prepare({ brief, runId: "happy", artifactRoot });
  assert.equal(prepared.status, "awaiting_approval");
  assert.ok(prepared.audit.some((entry) => entry.type === "approval_requested"));
  const released = decide({ runId: "happy", decision: "approve", actor: "reviewer", artifactRoot, expectedPlanHash: prepared.plan_hash });
  assert.equal(released.status, "released");
  assert.equal(released.outputs.release.status, "released");
  assert.ok(released.audit.some((entry) => entry.type === "audit_completed"));
});

test("rejection blocks release", () => {
  const artifactRoot = root();
  prepare({ brief, runId: "reject", artifactRoot });
  const rejected = decide({ runId: "reject", decision: "reject", reason: "Evidence incomplete", artifactRoot });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.outputs.release.status, "blocked");
  assert.throws(() => decide({ runId: "reject", decision: "approve", artifactRoot }), /not awaiting_approval/);
});

test("controlled failures retry and then escalate at the bounded limit", () => {
  const artifactRoot = root();
  let state = prepare({ brief, runId: "failure", artifactRoot, failStage: "test" });
  assert.equal(state.status, "retry_pending");
  assert.equal(state.retry_count, 0);
  state = retry({ runId: "failure", artifactRoot, failStage: "test" });
  assert.equal(state.status, "retry_pending");
  assert.equal(state.retry_count, 1);
  state = retry({ runId: "failure", artifactRoot, failStage: "test" });
  assert.equal(state.status, "escalated");
  assert.equal(state.retry_count, 2);
  assert.ok(state.audit.some((entry) => entry.type === "escalated"));
});

test("a changed requirement creates a different versioned plan", () => {
  const artifactRoot = root();
  const before = prepare({ brief, runId: "revision", artifactRoot });
  const changed = { ...brief, goals: [...brief.goals, "Prove recovery"] };
  const after = revise({ runId: "revision", brief: changed, artifactRoot });
  assert.equal(after.requirement_revision, 2);
  assert.notEqual(after.plan_hash, before.plan_hash);
  assert.ok(after.audit.some((entry) => entry.type === "plan_revised" && entry.previous_plan_hash === before.plan_hash));
});
