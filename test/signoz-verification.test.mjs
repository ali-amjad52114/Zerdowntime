import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createProofReport,
  correlationFilter,
  decodeMcpResponse,
  escapeFilterLiteral,
  redactValue,
  sanitizeUrl,
  verificationCorrelation,
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

test('builds exact-run filters for every supplied G3 identifier', () => {
  const correlation = verificationCorrelation({
    SIGNOZ_VERIFY_DISEASE_RUN_ID: "disease'1",
    SIGNOZ_VERIFY_CANDIDATE_ID: 'candidate-1',
    SIGNOZ_VERIFY_TARGET_RUN_ID: 'target-1',
    SIGNOZ_VERIFY_AXIS: 'x',
    SIGNOZ_VERIFY_RETRY_ATTEMPT: '2',
  });
  assert.deepEqual(correlation, {
    'disease.run.id': "disease'1", 'candidate.id': 'candidate-1', 'target.run.id': 'target-1', axis: 'X', 'retry.attempt': '2',
  });
  assert.equal(correlationFilter(correlation), "disease.run.id = 'disease\\'1' AND candidate.id = 'candidate-1' AND target.run.id = 'target-1' AND axis = 'X' AND retry.attempt = 2");
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
