const endpoint = process.env.SIGNOZ_MCP_URL ?? 'https://mcp.us2.signoz.cloud/mcp';
const apiKey = process.env.SIGNOZ_API_KEY;
const signozUrl = process.env.SIGNOZ_URL;

if (!apiKey || !signozUrl) {
  throw new Error('SIGNOZ_API_KEY and SIGNOZ_URL must be available in this process environment');
}

function decodeResponse(text) {
  const dataLines = text.split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim());
  const value = dataLines.at(-1) ?? text;
  try { return JSON.parse(value); } catch { return { message: value.trim() }; }
}

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
  const decoded = text ? decodeResponse(text) : undefined;
  if (!response.ok) {
    const detail = decoded?.error?.message ?? decoded?.message ?? 'no error detail';
    throw new Error(`SigNoz MCP returned HTTP ${response.status}: ${detail}`);
  }
  return {
    body: decoded,
    sessionId: response.headers.get('mcp-session-id') ?? sessionId,
    status: response.status,
  };
}

const initialized = await request({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'zero-downtime-smoke', version: '0.1.0' },
  },
});

if (initialized.body?.error) throw new Error(`initialize failed: ${initialized.body.error.message}`);
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

console.log(JSON.stringify({
  ok: true,
  endpoint,
  initializeStatus: initialized.status,
  toolsListStatus: listed.status,
  server: initialized.body?.result?.serverInfo,
  protocolVersion: initialized.body?.result?.protocolVersion,
  toolCount: tools.length,
  workspaceReadProbe: readProbeTool.name,
  sampleTools: tools.slice(0, 8).map((tool) => tool.name),
}, null, 2));
