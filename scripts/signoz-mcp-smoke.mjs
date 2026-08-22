import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadLocalEnv } from './env.mjs';
import {
  correlationFilter,
  createProofReport,
  decodeMcpResponse,
  readAggregateCount,
  readMetricRowsScanned,
  readMetricSeriesCount,
  redactValue,
  toolError,
  verificationCorrelation,
} from './signoz-verification-lib.mjs';

loadLocalEnv('.env.local', { override: true });

const endpoint = process.env.SIGNOZ_MCP_URL ?? 'https://mcp.us2.signoz.cloud/mcp';
const apiKey = process.env.SIGNOZ_API_KEY;
const signozUrl = process.env.SIGNOZ_URL;
const proofPath = resolve(process.env.SIGNOZ_PROOF_PATH ?? 'artifacts/signoz/g3-proof.json');
const proof = createProofReport({ endpoint, signozUrl });

function saveAndPrint(report, error = false) {
  const safe = redactValue(report, [apiKey]);
  mkdirSync(dirname(proofPath), { recursive: true });
  writeFileSync(proofPath, `${JSON.stringify(safe, null, 2)}\n`, 'utf8');
  (error ? console.error : console.log)(JSON.stringify({ ...safe, proofPath }, null, 2));
}

async function request(payload, sessionId) {
  const externalRequestId = `signoz-mcp-${randomUUID()}`;
  const requestEvidence = {
    externalRequestId, jsonRpcId: payload.id ?? null, method: payload.method,
    tool: payload.params?.name ?? null,
  };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'SIGNOZ-API-KEY': apiKey,
      ...(signozUrl ? { 'X-SigNoz-URL': signozUrl } : {}),
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const decoded = text ? decodeMcpResponse(text) : undefined;
  proof.externalRequests.push({
    ...requestEvidence, httpStatus: response.status,
    result: response.ok && !toolError(decoded) ? 'response_received' : 'error',
  });
  if (!response.ok) {
    const detail = decoded?.error?.message ?? decoded?.message ?? 'no error detail';
    throw new Error(redactValue(`SigNoz MCP returned HTTP ${response.status}: ${detail}`, [apiKey]));
  }
  return {
    body: decoded, externalRequestId,
    sessionId: response.headers.get('mcp-session-id') ?? sessionId,
    status: response.status,
  };
}

try {
  if (!apiKey) {
    throw new Error('SIGNOZ_API_KEY must be available; the service-account API key is not an OTLP ingestion credential');
  }
  const initialized = await request({
    jsonrpc: '2.0', id: `initialize-${randomUUID()}`, method: 'initialize',
    params: {
      protocolVersion: '2025-11-25', capabilities: {},
      clientInfo: { name: 'zero-downtime-smoke', version: '0.1.0' },
    },
  });
  if (initialized.body?.error) throw new Error(`initialize failed: ${initialized.body.error.message}`);
  proof.proof.mcpConnectivity = {
    status: 'PASS', initializeStatus: initialized.status,
    protocolVersion: initialized.body?.result?.protocolVersion,
    server: initialized.body?.result?.serverInfo,
    externalRequestId: initialized.externalRequestId,
  };
  await request({ jsonrpc: '2.0', method: 'notifications/initialized' }, initialized.sessionId);
  const listed = await request({ jsonrpc: '2.0', id: `tools-${randomUUID()}`, method: 'tools/list', params: {} }, initialized.sessionId);
  if (listed.body?.error) throw new Error(`tools/list failed: ${listed.body.error.message}`);

  const tools = listed.body?.result?.tools ?? [];
  const readProbeTool = tools.find((tool) => tool.name === 'signoz_list_dashboards');
  if (!readProbeTool) throw new Error('SigNoz MCP did not expose signoz_list_dashboards');
  const probed = await request({
    jsonrpc: '2.0', id: `dashboards-${randomUUID()}`, method: 'tools/call',
    params: { name: readProbeTool.name, arguments: {} },
  }, initialized.sessionId);
  if (toolError(probed.body)) {
    proof.proof.workspaceRead = {
      status: 'FAIL', probe: readProbeTool.name, externalRequestId: probed.externalRequestId,
      result: 'unauthorized_or_forbidden',
    };
    throw new Error(`workspace read probe failed: ${toolError(probed.body)}`);
  }
  proof.proof.workspaceRead = { status: 'PASS', probe: readProbeTool.name, externalRequestId: probed.externalRequestId };

  const correlation = verificationCorrelation();
  const anchorKey = correlation['target.run.id'] ? 'target.run.id' : correlation['run.id'] ? 'run.id' : null;
  const anchor = anchorKey ? { [anchorKey]: correlation[anchorKey] } : {};
  const telemetryProbes = [];
  if (anchorKey) {
    proof.proof.telemetryReadback = { status: 'IN_PROGRESS', correlation, timeRange: '1h', signals: telemetryProbes };
    const attributeChecks = Object.entries(correlation).map(([key, value]) => ({ ...anchor, [key]: value }));
    for (const signal of ['logs', 'traces']) {
      const tool = `signoz_aggregate_${signal}`;
      for (const check of attributeChecks) {
        const filter = correlationFilter(check);
        const response = await request({
          jsonrpc: '2.0', id: `${signal}-${randomUUID()}`, method: 'tools/call',
          params: {
            name: tool,
            arguments: { aggregation: 'count', filter, timeRange: '1h', searchContext: 'Mend G3 exact-run ingestion verification' },
          },
        }, initialized.sessionId);
        if (toolError(response.body)) throw new Error(`${tool} failed for ${filter}: ${toolError(response.body)}`);
        const count = readAggregateCount(response.body);
        if (!(Number(count) > 0)) throw new Error(`${tool} returned no matching telemetry for ${filter}`);
        telemetryProbes.push({ signal, tool, filter, count: Number(count), status: 'PASS', externalRequestId: response.externalRequestId });
      }
    }

    const metricName = process.env.SIGNOZ_VERIFY_METRIC_NAME ?? 'mend_sponsor_results_total';
    const metricFilter = correlationFilter(anchor);
    const metricResponse = await request({
      jsonrpc: '2.0', id: `metrics-${randomUUID()}`, method: 'tools/call',
      params: {
        name: 'signoz_query_metrics',
        arguments: {
          metricName, filter: metricFilter, timeRange: '1h', requestType: 'scalar', reduceTo: 'sum',
          searchContext: 'Mend G3 exact-run metric ingestion verification',
        },
      },
    }, initialized.sessionId);
    if (toolError(metricResponse.body)) throw new Error(`signoz_query_metrics failed: ${toolError(metricResponse.body)}`);
    const rowsScanned = readMetricRowsScanned(metricResponse.body);
    const seriesCount = readMetricSeriesCount(metricResponse.body);
    if (!(rowsScanned > 0) || !(seriesCount > 0)) throw new Error('signoz_query_metrics returned no exact-run metric series');
    telemetryProbes.push({
      signal: 'metrics', tool: 'signoz_query_metrics', metric: metricName, filter: metricFilter,
      rowsScanned, seriesCount, status: 'PASS', externalRequestId: metricResponse.externalRequestId,
    });
    proof.proof.telemetryReadback = { status: 'PASS', correlation, timeRange: '1h', signals: telemetryProbes };
  }

  saveAndPrint({
    ok: proof.proof.mcpConnectivity.status === 'PASS'
      && proof.proof.workspaceRead.status === 'PASS'
      && (!anchorKey || proof.proof.telemetryReadback.status === 'PASS'),
    ...proof, toolsListStatus: listed.status, toolCount: tools.length,
    sampleTools: tools.slice(0, 8).map((tool) => tool.name),
  });
} catch (error) {
  process.exitCode = 1;
  if (proof.proof.telemetryReadback.status === 'IN_PROGRESS') proof.proof.telemetryReadback.status = 'FAIL';
  saveAndPrint({ ok: false, ...proof, failure: { message: error?.message ?? String(error) } }, true);
}
