import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decide, loadRun, prepare, retry, revise } from "./lib/port-workflow.mjs";

const [operation, ...rawArgs] = process.argv.slice(2);
const args = {};
for (let index = 0; index < rawArgs.length; index += 1) {
  if (!rawArgs[index].startsWith("--")) continue;
  args[rawArgs[index].slice(2)] = rawArgs[index + 1]?.startsWith("--") ? true : rawArgs[++index] ?? true;
}

function briefFromArgs() {
  if (args.brief) return JSON.parse(readFileSync(args.brief, "utf8"));
  if (args["brief-json"]) return JSON.parse(args["brief-json"]);
  if (process.env.PORT_BRIEF_JSON) return JSON.parse(process.env.PORT_BRIEF_JSON);
  throw new Error("Provide --brief <file>, --brief-json <json>, or PORT_BRIEF_JSON.");
}

function summarize(state) {
  console.log(JSON.stringify({ run_id: state.id, status: state.status, plan_hash: state.plan_hash, retry_count: state.retry_count, failed_stage: state.failed_stage, audit_events: state.audit.length }, null, 2));
  if (["retry_pending", "escalated"].includes(state.status)) process.exitCode = 1;
}

function hydrateIfNeeded(runId, artifactRoot) {
  try {
    loadRun(runId, artifactRoot);
    return;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const serialized = args["state-json"] ?? process.env.PORT_STATE_JSON;
  if (!serialized) return;
  const properties = JSON.parse(serialized);
  const state = { id: runId, title: properties.brief?.title ?? runId, ...properties };
  mkdirSync(join(artifactRoot, runId), { recursive: true });
  writeFileSync(join(artifactRoot, runId, "run.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

try {
  const common = { runId: args["run-id"], artifactRoot: args["artifact-root"] ?? "artifacts/port" };
  let state;
  if (operation === "prepare") state = prepare({ ...common, brief: briefFromArgs(), failStage: args["fail-stage"] });
  else if (operation === "retry") {
    hydrateIfNeeded(common.runId, common.artifactRoot);
    state = retry({ ...common, failStage: args["fail-stage"] });
  }
  else if (operation === "revise") state = revise({ ...common, brief: briefFromArgs() });
  else if (operation === "release") {
    hydrateIfNeeded(common.runId, common.artifactRoot);
    try {
      loadRun(common.runId, common.artifactRoot);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      prepare({ ...common, brief: briefFromArgs() });
    }
    state = decide({ ...common, decision: args.decision ?? "approve", actor: args.actor, reason: args.reason, expectedPlanHash: args["expected-plan-hash"] });
  } else throw new Error("Usage: port-workflow.mjs <prepare|retry|revise|release> [options]");
  summarize(state);
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
