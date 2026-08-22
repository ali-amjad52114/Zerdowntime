const SECRET_FIELD = /(?:authorization|cookie|password|passwd|secret|token|api[-_.]?key)/i;

export function sanitizeUrl(value) {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '[invalid URL]';
  }
}

export function redactValue(value, secrets = []) {
  if (Array.isArray(value)) return value.map((item) => redactValue(item, secrets));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      SECRET_FIELD.test(key) ? '[REDACTED]' : redactValue(item, secrets),
    ]));
  }
  if (typeof value !== 'string') return value;
  let safe = value.replace(/(bearer\s+)[a-z0-9._~+/=-]+/gi, '$1[REDACTED]');
  for (const secret of secrets.filter(Boolean)) safe = safe.split(String(secret)).join('[REDACTED]');
  return safe;
}

export function escapeFilterLiteral(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

export function decodeMcpResponse(text) {
  const dataLines = text.split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim());
  const value = dataLines.at(-1) ?? text;
  try { return JSON.parse(value); } catch { return { message: value.trim() }; }
}

export function parseToolJson(text) {
  const candidate = String(text).split(/\s+(?:note:|\[Decisions applied\])/)[0];
  return JSON.parse(candidate);
}

export function toolError(body) {
  if (!body?.error && !body?.result?.isError) return undefined;
  return body?.error?.message ?? body?.result?.content
    ?.map((item) => item.text).filter(Boolean).join(' ') ?? 'unknown error';
}

export function readAggregateCount(body) {
  const text = body?.result?.content?.map((item) => item.text).filter(Boolean).join(' ') ?? '';
  return Number(parseToolJson(text)?.data?.data?.results?.[0]?.data?.[0]?.[0]);
}

export function readMetricRowsScanned(body) {
  const text = body?.result?.content?.map((item) => item.text).filter(Boolean).join(' ') ?? '';
  return Number(parseToolJson(text)?.data?.meta?.rowsScanned);
}

export function createProofReport({ endpoint, signozUrl }) {
  return {
    schemaVersion: 'signoz-proof/v1',
    generatedAt: new Date().toISOString(),
    endpoints: { mcp: sanitizeUrl(endpoint), workspace: sanitizeUrl(signozUrl) },
    proof: {
      mcpConnectivity: { status: 'NOT_RUN' },
      workspaceRead: { status: 'NOT_RUN' },
      telemetryEmission: {
        status: 'NOT_RUN',
        note: 'This read-only verifier does not emit telemetry. Run a telemetry smoke command separately.',
      },
      telemetryReadback: {
        status: 'NOT_RUN',
        note: 'Set SIGNOZ_VERIFY_RUN_ID to query stored logs and traces for one emitted run.',
        signals: [],
      },
    },
  };
}
