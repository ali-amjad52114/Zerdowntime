import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadLocalEnv } from "./env.mjs";
import { toPortEntity } from "./lib/port-workflow.mjs";
import { validateMendPortResult } from "./lib/port-mend-contracts.mjs";

loadLocalEnv();
const args = new Set(process.argv.slice(2));
const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const live = args.has("--live");
const root = "port";
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const runtimeFile = valueAfter("--run-file");
const mendResultFile = valueAfter("--mend-result-file");
const portRunId = valueAfter("--port-run-id");
let mendArtifact;
if (mendResultFile) {
  mendArtifact = JSON.parse(readFileSync(mendResultFile, "utf8"));
  if (mendArtifact.mode !== "live" || !Array.isArray(mendArtifact.result?.port_entities)) throw new Error("Mend result file must contain a validated live result with port_entities.");
  validateMendPortResult(mendArtifact.result, mendArtifact.envelope);
  if (portRunId && mendArtifact.envelope.port_run_id !== portRunId) throw new Error("Mend result Port run ID does not match --port-run-id.");
}

if (!live) {
  console.log(`Port sync dry run: ${manifest.blueprints.length} blueprints, ${manifest.entities.length} production seed files, ${manifest.actions.length} actions${runtimeFile ? ", 1 delivery runtime entity" : ""}${mendResultFile ? ", Mend result entities requested" : ""}.`);
  console.log("No account changes made. Add --live only after configuring Port and GitHub environment values.");
  process.exit(0);
}

for (const name of ["PORT_CLIENT_ID", "PORT_CLIENT_SECRET"]) {
  if (!process.env[name]) throw new Error(`${name} is required for --live sync.`);
}
const api = (process.env.PORT_API_URL ?? "https://api.port.io").replace(/\/$/, "");

async function raw(path, options = {}) {
  const response = await fetch(`${api}${path}`, options);
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  return { response, body };
}

const auth = await raw("/v1/auth/access_token", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ clientId: process.env.PORT_CLIENT_ID, clientSecret: process.env.PORT_CLIENT_SECRET })
});
if (!auth.response.ok) throw new Error(`Port authentication failed (${auth.response.status}): ${auth.body.message ?? "unknown error"}`);
const headers = { authorization: `Bearer ${auth.body.accessToken}`, "content-type": "application/json" };

async function upsert(path, createPath, payload, label) {
  const exists = await raw(path, { headers });
  const target = exists.response.status === 404 ? createPath : path;
  const method = exists.response.status === 404 ? "POST" : "PUT";
  if (!exists.response.ok && exists.response.status !== 404) throw new Error(`Could not inspect ${label} (${exists.response.status}).`);
  const result = await raw(target, { method, headers, body: JSON.stringify(payload) });
  if (!result.response.ok) throw new Error(`Could not sync ${label} (${result.response.status}): ${result.body.message ?? JSON.stringify(result.body)}`);
  console.log(`Synced ${label}.`);
}

for (const relative of manifest.blueprints) {
  const blueprint = JSON.parse(readFileSync(join(root, relative), "utf8"));
  await upsert(`/v1/blueprints/${encodeURIComponent(blueprint.identifier)}`, "/v1/blueprints", blueprint, `blueprint ${blueprint.identifier}`);
}
for (const entry of manifest.entities) {
  const data = JSON.parse(readFileSync(join(root, entry.file), "utf8"));
  for (const entity of Array.isArray(data) ? data : [data]) {
    const query = portRunId ? `&run_id=${encodeURIComponent(portRunId)}` : "";
    const result = await raw(`/v1/blueprints/${encodeURIComponent(entry.blueprint)}/entities?upsert=true${query}`, { method: "POST", headers, body: JSON.stringify(entity) });
    if (!result.response.ok) throw new Error(`Could not sync entity ${entity.identifier} (${result.response.status}): ${result.body.message ?? JSON.stringify(result.body)}`);
    console.log(`Synced entity ${entity.identifier}.`);
  }
}
for (const relative of manifest.actions) {
  const action = JSON.parse(readFileSync(join(root, relative), "utf8"));
  await upsert(`/v1/actions/${encodeURIComponent(action.identifier)}`, "/v1/actions", action, `action ${action.identifier}`);
}
if (runtimeFile) {
  const state = JSON.parse(readFileSync(runtimeFile, "utf8"));
  const entity = toPortEntity(state);
  const query = portRunId ? `&run_id=${encodeURIComponent(portRunId)}` : "";
  const result = await raw(`/v1/blueprints/zdWorkflowRun/entities?upsert=true${query}`, { method: "POST", headers, body: JSON.stringify(entity) });
  if (!result.response.ok) throw new Error(`Could not sync workflow run ${state.id} (${result.response.status}): ${result.body.message ?? JSON.stringify(result.body)}`);
  console.log(`Synced workflow run ${state.id}.`);
}
if (mendResultFile) {
  const artifact = mendArtifact;
  const receipts = [];
  for (const entry of artifact.result.port_entities) {
    if (!manifest.blueprints.some((relative) => JSON.parse(readFileSync(join(root, relative), "utf8")).identifier === entry.blueprint)) {
      throw new Error(`Mend result targets blueprint '${entry.blueprint}' outside the controlled manifest.`);
    }
    const query = portRunId ? `&run_id=${encodeURIComponent(portRunId)}` : "";
    const result = await raw(`/v1/blueprints/${encodeURIComponent(entry.blueprint)}/entities?upsert=true${query}`, {
      method: "POST", headers, body: JSON.stringify(entry.entity)
    });
    if (!result.response.ok) throw new Error(`Could not sync Mend entity ${entry.entity.identifier} (${result.response.status}): ${result.body.message ?? JSON.stringify(result.body)}`);
    receipts.push({
      blueprint: entry.blueprint,
      identifier: entry.entity.identifier,
      request_id: result.response.headers.get("x-request-id") ?? result.response.headers.get("request-id") ?? null,
      http_status: result.response.status,
    });
    console.log(`Synced Mend entity ${entry.entity.identifier}.`);
  }
  artifact.port_sync = {
    port_run_id: artifact.envelope.port_run_id,
    synced_at: new Date().toISOString(),
    entities: receipts,
  };
  writeFileSync(mendResultFile, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}
