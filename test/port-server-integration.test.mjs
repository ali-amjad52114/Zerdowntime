import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { AggregationTemporality, InMemoryMetricExporter } from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { buildMendPortEnvelope } from '../scripts/lib/port-mend-contracts.mjs';
import { createApp } from '../src/server.mjs';
import { createTelemetry } from '../src/telemetry.mjs';

test('Port human gate starts one evidence-derived target run and is idempotent', async (t) => {
  const telemetry = createTelemetry({
    spanExporter: new InMemorySpanExporter(), logExporter: new InMemoryLogRecordExporter(),
    metricExporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE), console: false,
  });
  let diligenceCalls = 0;
  const targetDiligence = async ({ target, disease, runId }) => {
    diligenceCalls += 1;
    return {
      runId, status: 'HEALTHY', publishStatus: 'PUBLISHED', factoryVersion: 'discovery-v1', failedAxes: [],
      axes: Object.fromEntries(['X', 'Y', 'Z'].map((axis) => [axis, {
        axis, status: 'HEALTHY', validation: { status: 'PASS' }, summary: {},
        records: [{ axis, subject: target, value: disease, source_url: `https://example.test/${axis}`, retrieved_at: '2026-08-22T00:00:00.000Z', evidence: 'evidence' }],
      }])),
    };
  };
  const { server } = createApp({
    telemetry, portActionToken: 'test-token', targetDiligence,
    corpusDiscovery: async ({ disease }) => ({
      disease,
      papers: [{ id: 'p1', title: 'EGFR evidence', abstract: 'EGFR is required for progression.', source_url: 'https://example.test/p1' }],
      candidateLexicon: [{ name: 'EGFR' }],
      source: { provider: 'test', hitCount: 1, requestUrl: 'https://example.test/search' },
    }),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await telemetry.shutdown(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const discovery = await fetch(`${base}/mend/discovery/start`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ disease: 'Glioblastoma', runId: 'disease-1' }),
  });
  assert.equal(discovery.status, 201);
  const envelope = buildMendPortEnvelope({
    action: 'handoff_candidate', portRunId: 'port-1', entityId: 'egfr', parentId: 'disease-1', actor: 'port-reviewer',
    payload: { axes: ['X', 'Y', 'Z'], selection_reason: 'Reviewed source evidence', expected_selection_status: 'pending' },
  });
  const invoke = () => fetch(`${base}/api/port/actions`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-token', 'content-type': 'application/json', 'idempotency-key': 'port-1' },
    body: JSON.stringify(envelope),
  });
  let response = await invoke();
  assert.equal(response.status, 200);
  let result = await response.json();
  assert.equal(result.status, 'completed');
  assert.ok(result.port_entities.some((entry) => entry.blueprint === 'mendTargetRun'));
  assert.equal(result.port_entities.filter((entry) => entry.blueprint === 'mendAxisRun').length, 3);
  response = await invoke();
  result = await response.json();
  assert.equal(result.status, 'completed');
  assert.equal(diligenceCalls, 1);
  const state = await (await fetch(`${base}/mend/discovery`)).json();
  assert.equal(state.selection.source, 'port');
  assert.deepEqual(state.selection.selected_candidate_ids, ['egfr']);
  assert.equal(state.handoff.results[0].run.target, 'EGFR');
});

test('HTTP handoff cannot bypass saved human selection', async (t) => {
  const telemetry = createTelemetry({
    spanExporter: new InMemorySpanExporter(), logExporter: new InMemoryLogRecordExporter(),
    metricExporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE), console: false,
  });
  const { server } = createApp({
    telemetry,
    corpusDiscovery: async ({ disease }) => ({
      disease, papers: [{ id: 'p1', title: 'EGFR', abstract: 'EGFR is associated with disease.', source_url: 'https://example.test/p1' }],
      candidateLexicon: [{ name: 'EGFR' }], source: { provider: 'test', hitCount: 1 },
    }),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await telemetry.shutdown(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  await fetch(`${base}/mend/discovery/start`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ disease: 'Example' }) });
  const response = await fetch(`${base}/mend/discovery/handoff`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ candidateIds: ['egfr'] }) });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /save a human candidate selection/);
});
