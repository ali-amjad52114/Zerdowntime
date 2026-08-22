import { loadLocalEnv } from './env.mjs';
import {
  createProofReport,
  decodeMcpResponse,
  escapeFilterLiteral,
  readAggregateCount,
  readMetricRowsScanned,
  redactValue,
  toolError,
} from './signoz-verification-lib.mjs';

loadLocalEnv('.env.local', { override: true });

const endpoint = process.env.SIGNOZ_MCP_URL ?? 'https://mcp.us2.signoz.cloud/mcp';
const apiKey = process.env.SIGNOZ_API_KEY;
const signozUrl = process.env.SIGNOZ_URL;

if (!apiKey || !signozUrl) {
  throw new Error('SIGNOZ_API_KEY and SIGNOZ_URL must be available in this process environment');
}

const proof = createProofReport({ endpoint, signozUrl });

async function request(payload, sessionId) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'SIGNOZ-API-KEY': apiKey,
      'X-SigNoz-URL': signozUrl,
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const decoded = text ? decodeMcpResponse(text) : undefined;
  if (!response.ok) {
    const detail = decoded?.error?.message ?? decoded?.message ?? 'no error detail';
    throw new Error(redactValue(`SigNoz MCP returned HTTP ${response.status}: ${detail}`, [apiKey]));
  }
  return {
    body: decoded,
    sessionId: response.headers.get('mcp-session-id') ?? sessionId,
    status: response.status,
  };
}

try {
const initialized = await request({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'zero-downtime-smoke', version: '0.1.0' },
  },
});

if (initialized.body?.error) throw new Error(`initialize failed: ${initialized.body.error.message}`);
proof.proof.mcpConnectivity = {
  status: 'PASS',
  initializeStatus: initialized.status,
  protocolVersion: initialized.body?.result?.protocolVersion,
  server: initialized.body?.result?.serverInfo,
};
await request({ jsonrpc: '2.0', method: 'notifications/initialized' }, initialized.sessionId);
const listed = await request({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, initialized.sessionId);
if (listed.body?.error) throw new Error(`tools/list failed: ${listed.body.error.message}`);

const tools = listed.body?.result?.tools ?? [];
const readProbeTool = tools.find((tool) => tool.name === 'signoz_list_dashboards');
if (!readProbeTool) throw new Error('SigNoz MCP did not expose signoz_list_dashboards');

const probed = await request({
  jsonrpc: '2.0',
  id: 3,
  method: 'tools/call',
  params: { name: readProbeTool.name, arguments: {} },
}, initialized.sessionId);
if (probed.body?.error) throw new Error(`workspace read probe failed: ${probed.body.error.message}`);
if (probed.body?.result?.isError) {
  const detail = probed.body.result.content?.map((item) => item.text).filter(Boolean).join(' ') ?? 'unknown error';
  throw new Error(`workspace read probe failed: ${detail}`);
}
proof.proof.workspaceRead = { status: 'PASS', probe: readProbeTool.name };

const telemetryProbes = [];
const verifyRunId = process.env.SIGNOZ_VERIFY_RUN_ID;
const verifyMetricName = process.env.SIGNOZ_VERIFY_METRIC_NAME ?? 'zero_downtime_runs_total';
if (verifyRunId) {
  const safeRunId = escapeFilterLiteral(verifyRunId);
  for (const name of ['signoz_aggregate_logs', 'signoz_aggregate_traces']) {
    const response = await request({
      jsonrpc: '2.0',
      id: telemetryProbes.length + 4,
      method: 'tools/call',
      params: {
        name,
        arguments: {
          aggregation: 'count',
          filter: `run.id = '${safeRunId}'`,
          timeRange: '1h',
          searchContext: `Verify telemetry ingestion for run ${verifyRunId}`,
        },
      },
    }, initialized.sessionId);
    if (toolError(response.body)) {
      const detail = toolError(response.body);
      throw new Error(`${name} failed: ${detail}`);
    }
    const count = readAggregateCount(response.body);
    if (!(Number(count) > 0)) throw new Error(`${name} returned no matching telemetry for ${verifyRunId}`);
    telemetryProbes.push({ signal: name.endsWith('logs') ? 'logs' : 'traces', tool: name, count: Number(count), status: 'PASS' });
  }

  const metricResponse = await request({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'signoz_query_metrics',
      arguments: {
        metricName: verifyMetricName,
        timeRange: '1h',
        searchContext: `Verify telemetry ingestion for run ${verifyRunId}`,
      },
    },
  }, initialized.sessionId);
  if (toolError(metricResponse.body)) {
    const detail = toolError(metricResponse.body);
    throw new Error(`signoz_query_metrics failed: ${detail}`);
  }
  const metricRowsScanned = readMetricRowsScanned(metricResponse.body);
  if (!(Number(metricRowsScanned) > 0)) throw new Error('signoz_query_metrics found no ingested metric rows');
  telemetryProbes.push({
    signal: 'metrics',
    tool: 'signoz_query_metrics',
    metric: verifyMetricName,
    rowsScanned: Number(metricRowsScanned),
    status: 'PASS',
    correlation: 'Metric-name readback; the run.id correlation is proven by the log and trace probes.',
  });
  proof.proof.telemetryReadback = {
    status: 'PASS',
    runId: verifyRunId,
    timeRange: '1h',
    signals: telemetryProbes,
  };
}

console.log(JSON.stringify(redactValue({
  ok: proof.proof.mcpConnectivity.status === 'PASS'
    && proof.proof.workspaceRead.status === 'PASS'
    && (!verifyRunId || proof.proof.telemetryReadback.status === 'PASS'),
  ...proof,
  toolsListStatus: listed.status,
  toolCount: tools.length,
  sampleTools: tools.slice(0, 8).map((tool) => tool.name),
}, [apiKey]), null, 2));
} catch (error) {
  process.exitCode = 1;
  console.error(JSON.stringify(redactValue({
    ok: false,
    ...proof,
    failure: { message: error?.message ?? String(error) },
  }, [apiKey]), null, 2));
}
