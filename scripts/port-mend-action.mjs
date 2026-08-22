import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadLocalEnv } from "./env.mjs";
import { buildMendPortEnvelope, validateMendPortResult } from "./lib/port-mend-contracts.mjs";

loadLocalEnv();
const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const input = (name, envName) => arg(name) ?? process.env[envName];
const live = process.argv.includes("--live");
const output = arg("output") ?? "artifacts/port/mend-action-result.json";
const envelope = buildMendPortEnvelope({
  action: input("operation", "PORT_MEND_OPERATION"), portRunId: input("port-run-id", "PORT_MEND_RUN_ID"),
  entityId: input("entity-id", "PORT_MEND_ENTITY_ID"), parentId: input("parent-id", "PORT_MEND_PARENT_ID"),
  actor: input("actor", "PORT_MEND_ACTOR"), payload: JSON.parse(input("payload-json", "PORT_MEND_PAYLOAD_JSON") ?? "{}")
});

let artifact = { mode: "contract_only", envelope };
if (live) {
  if (!process.env.MEND_API_URL) throw new Error("MEND_API_URL is required for --live.");
  if (!process.env.MEND_PORT_ACTION_TOKEN) throw new Error("MEND_PORT_ACTION_TOKEN is required for --live.");
  const url = new URL("/api/port/actions", process.env.MEND_API_URL);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.MEND_PORT_ACTION_TOKEN}`,
      "content-type": "application/json",
      "idempotency-key": envelope.idempotency_key
    },
    body: JSON.stringify(envelope)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Mend Port action failed (HTTP ${response.status}): ${result.error ?? result.message ?? "no JSON error"}`);
  validateMendPortResult(result, envelope);
  artifact = {
    mode: "live",
    request: {
      method: "POST",
      path: url.pathname,
      port_run_id: envelope.port_run_id,
      mend_request_id: response.headers.get("x-request-id") ?? response.headers.get("request-id") ?? null,
      http_status: response.status,
    },
    dispatch: {
      github_run_id: process.env.GITHUB_RUN_ID ?? null,
      github_run_url: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : null,
    },
    envelope,
    result,
  };
}
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ mode: artifact.mode, action: envelope.action, port_run_id: envelope.port_run_id, result_file: output }, null, 2));
