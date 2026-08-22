import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadLocalEnv } from './env.mjs';

loadLocalEnv();

const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const dispatch = process.argv.includes('--dispatch');
const output = valueAfter('--output') ?? 'artifacts/port/live-smoke-proof.json';
for (const name of ['PORT_CLIENT_ID', 'PORT_CLIENT_SECRET']) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
}

const api = (process.env.PORT_API_URL ?? 'https://api.port.io').replace(/\/$/, '');
const requestId = (response) => response.headers.get('x-request-id') ?? response.headers.get('request-id') ?? null;
const authResponse = await fetch(`${api}/v1/auth/access_token`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ clientId: process.env.PORT_CLIENT_ID, clientSecret: process.env.PORT_CLIENT_SECRET }),
});
const auth = await authResponse.json().catch(() => ({}));
if (!authResponse.ok) throw new Error(`Port authentication failed: HTTP ${authResponse.status}`);

const headers = { authorization: `Bearer ${auth.accessToken}`, accept: 'application/json', 'content-type': 'application/json' };
const get = async (path) => {
  const response = await fetch(`${api}${path}`, { headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} failed: HTTP ${response.status}`);
  return { body, receipt: { method: 'GET', path, http_status: response.status, request_id: requestId(response) } };
};

const manifest = JSON.parse(readFileSync('port/manifest.json', 'utf8'));
const blueprintIds = manifest.blueprints.map((path) => JSON.parse(readFileSync(`port/${path}`, 'utf8')).identifier);
const actionIds = manifest.actions.map((path) => JSON.parse(readFileSync(`port/${path}`, 'utf8')).identifier);
const receipts = [];

for (const identifier of blueprintIds) {
  const { body, receipt } = await get(`/v1/blueprints/${encodeURIComponent(identifier)}`);
  if (body.blueprint?.identifier !== identifier) throw new Error(`Missing blueprint ${identifier}`);
  receipts.push({ kind: 'blueprint', identifier, ...receipt });
}
for (const identifier of actionIds) {
  const { body, receipt } = await get(`/v1/actions/${encodeURIComponent(identifier)}`);
  if (body.action?.identifier !== identifier) throw new Error(`Missing action ${identifier}`);
  receipts.push({ kind: 'action', identifier, ...receipt });
}

const proof = {
  proof_version: 'mend.port-live-smoke/v1',
  mode: dispatch ? 'catalog_and_dispatch' : 'read_only_catalog',
  api_origin: new URL(api).origin,
  checked_at: new Date().toISOString(),
  auth_request_id: requestId(authResponse),
  catalog: { blueprints: blueprintIds, actions: actionIds, receipts },
  dispatch: null,
};

if (dispatch) {
  const brief = {
    title: 'Connected Port dispatch smoke test',
    summary: 'Verify Port dispatches the repository workflow and stops before release.',
    goals: ['Exercise the live Port to GitHub path', 'Preserve an auditable run'],
    constraints: ['Do not release without approval', 'Do not expose credentials'],
    acceptance_criteria: ['GitHub workflow completes', 'Prepare path stops at awaiting approval'],
  };
  const launchResponse = await fetch(`${api}/v1/actions/zd_submit_change/runs`, {
    method: 'POST', headers, body: JSON.stringify({ properties: brief }),
  });
  const launched = await launchResponse.json().catch(() => ({}));
  if (!launchResponse.ok) throw new Error(`Port action launch failed: HTTP ${launchResponse.status}`);
  const runId = launched.run?.id;
  if (!runId) throw new Error('Port action did not return a run ID.');
  let result = launched.run;
  const pollReceipts = [];
  for (let attempt = 0; attempt < 24 && !['SUCCESS', 'FAILURE', 'DECLINED'].includes(result?.status); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const polled = await get(`/v1/actions/runs/${encodeURIComponent(runId)}?version=v2`);
    result = polled.body.run;
    pollReceipts.push(polled.receipt);
  }
  proof.dispatch = {
    action: 'zd_submit_change', port_run_id: runId, launch_request_id: requestId(launchResponse),
    status: result?.status ?? null, status_label: result?.statusLabel ?? null,
    workflow: result?.payload?.workflow ?? null, poll_receipts: pollReceipts,
  };
  if (result?.status !== 'SUCCESS') throw new Error(`Port action did not succeed; final status: ${result?.status ?? 'unknown'}`);
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, mode: proof.mode, blueprints: blueprintIds.length, actions: actionIds.length, port_run_id: proof.dispatch?.port_run_id ?? null, proof_file: output }, null, 2));
