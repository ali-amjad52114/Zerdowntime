import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createProofReport,
  decodeMcpResponse,
  escapeFilterLiteral,
  redactValue,
  sanitizeUrl,
} from '../scripts/signoz-verification-lib.mjs';

test('SigNoz proof starts with connectivity, emission, and readback separated', () => {
  const report = createProofReport({
    endpoint: 'https://user:pass@mcp.example/mcp?api_key=secret',
    signozUrl: 'https://workspace.example/?token=secret',
  });
  assert.equal(report.proof.mcpConnectivity.status, 'NOT_RUN');
  assert.equal(report.proof.workspaceRead.status, 'NOT_RUN');
  assert.equal(report.proof.telemetryEmission.status, 'NOT_RUN');
  assert.equal(report.proof.telemetryReadback.status, 'NOT_RUN');
  assert.equal(report.endpoints.mcp, 'https://mcp.example/mcp');
  assert.equal(report.endpoints.workspace, 'https://workspace.example');
});

test('verification output redacts secrets and safely escapes filter literals', () => {
  const secret = 'very-secret-value';
  assert.deepEqual(redactValue({ apiKey: secret, message: `Bearer ${secret}`, nested: { ok: true } }, [secret]), {
    apiKey: '[REDACTED]', message: 'Bearer [REDACTED]', nested: { ok: true },
  });
  assert.equal(escapeFilterLiteral("run\\id'bad"), "run\\\\id\\'bad");
  assert.equal(sanitizeUrl('not a url'), '[invalid URL]');
});

test('decodes JSON and event-stream MCP responses', () => {
  assert.deepEqual(decodeMcpResponse('{"ok":true}'), { ok: true });
  assert.deepEqual(decodeMcpResponse('event: message\ndata: {"ok":true}\n\n'), { ok: true });
});
