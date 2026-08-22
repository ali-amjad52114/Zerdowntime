import { loadLocalEnv } from "./env.mjs";

loadLocalEnv();

const required = ["PORT_CLIENT_ID", "PORT_CLIENT_SECRET"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
}

const api = process.env.PORT_API_URL ?? "https://api.port.io";
const authResponse = await fetch(`${api}/v1/auth/access_token`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    clientId: process.env.PORT_CLIENT_ID,
    clientSecret: process.env.PORT_CLIENT_SECRET
  })
});
const auth = await authResponse.json().catch(() => ({}));
if (!authResponse.ok) throw new Error(`Port authentication failed: HTTP ${authResponse.status}`);

const headers = {
  authorization: `Bearer ${auth.accessToken}`,
  accept: "application/json",
  "content-type": "application/json"
};
const get = async (path) => {
  const response = await fetch(`${api}${path}`, { headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} failed: HTTP ${response.status}`);
  return body;
};

for (const identifier of [
  "zdProject", "zdService", "zdWorkflowRun", "zdDecision", "mendDiseaseRun", "mendCandidateTarget",
  "mendTargetRun", "mendAxisRun", "mendDiligenceTask", "mendTargetDecision"
]) {
  const body = await get(`/v1/blueprints/${identifier}`);
  if (body.blueprint?.identifier !== identifier) throw new Error(`Missing blueprint ${identifier}`);
}

for (const identifier of ["mend_handoff_candidate", "mend_retry_axis", "mend_approve_source_healing", "mend_complete_diligence_task", "mend_record_target_decision"]) {
  const body = await get(`/v1/actions/${identifier}`);
  if (body.action?.identifier !== identifier) throw new Error(`Missing action ${identifier}`);
}

const brief = {
  title: "Post-merge connected Port smoke test",
  summary: "Verify Port dispatches the pushed workflow and stops before release.",
  goals: ["Exercise the live Port to GitHub path", "Preserve an auditable run"],
  constraints: ["Do not release without approval", "Do not expose credentials"],
  acceptance_criteria: ["GitHub workflow completes", "Prepare path stops at awaiting approval"]
};
const launchResponse = await fetch(`${api}/v1/actions/zd_submit_change/runs`, {
  method: "POST",
  headers,
  body: JSON.stringify({ properties: brief })
});
const launched = await launchResponse.json().catch(() => ({}));
if (!launchResponse.ok) throw new Error(`Port action launch failed: HTTP ${launchResponse.status}`);
const runId = launched.run?.id;
if (!runId) throw new Error("Port action did not return a run ID.");

let result = launched.run;
for (let attempt = 0; attempt < 24; attempt += 1) {
  if (["SUCCESS", "FAILURE", "DECLINED"].includes(result?.status)) break;
  await new Promise((resolve) => setTimeout(resolve, 5000));
  result = (await get(`/v1/actions/runs/${runId}?version=v2`)).run;
}

console.log(JSON.stringify({
  ok: result?.status === "SUCCESS",
  action_run_id: runId,
  status: result?.status,
  status_label: result?.statusLabel ?? null,
  workflow: result?.payload?.workflow ?? null
}, null, 2));

if (result?.status !== "SUCCESS") {
  throw new Error(`Port action did not succeed; final status: ${result?.status ?? "unknown"}`);
}
