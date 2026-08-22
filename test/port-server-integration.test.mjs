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

test('Port adapter completes healing, failed-axis-only retry, tasks, and final decision end to end', async (t) => {
  const telemetry = createTelemetry({
    spanExporter: new InMemorySpanExporter(), logExporter: new InMemoryLogRecordExporter(),
    metricExporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE), console: false,
  });
  let retryCalls = 0;
  const axisResult = (axis, status, target = 'EGFR') => ({
    axis,
    status: status === 'PASS' ? 'HEALTHY' : 'FAILED',
    validation: { status, ...(status === 'FAIL' ? { reason: 'source schema drift' } : {}) },
    summary: axis === 'X' ? { programsFound: 1, source_execution_id: 'source-exec-x-1' } : {},
    records: [{ axis, subject: target, value: `${axis} evidence`, source_url: `https://example.test/${axis}`, retrieved_at: '2026-08-22T00:00:00.000Z', evidence: `${axis} evidence` }],
  });
  const targetDiligence = async ({ target, disease, runId, diseaseRunId, candidateId }) => ({
    runId, disease, target, disease_run_id: diseaseRunId, candidate_id: candidateId,
    status: 'DEGRADED', publishStatus: 'PRESERVED_PREVIOUS_HEALTHY', factoryVersion: 'discovery-v1', failedAxes: ['X'],
    axes: { X: axisResult('X', 'FAIL', target), Y: axisResult('Y', 'PASS', target), Z: axisResult('Z', 'PASS', target) },
  });
  const targetAxisRetry = async ({ axis, existingRun }) => {
    retryCalls += 1;
    assert.equal(axis, 'X');
    return {
      ...existingRun,
      status: 'HEALTHY', publishStatus: 'PUBLISHED', failedAxes: [],
      axes: { ...existingRun.axes, X: axisResult('X', 'PASS', existingRun.target) },
    };
  };
  const { server } = createApp({
    telemetry, portActionToken: 'test-token', targetDiligence, targetAxisRetry,
    corpusDiscovery: async ({ disease }) => ({
      disease,
      papers: [{ id: 'paper-1', title: 'EGFR evidence', abstract: 'EGFR is required for progression.', source_url: 'https://example.test/paper-1' }],
      candidateLexicon: [{ name: 'EGFR' }],
      source: { provider: 'test', hitCount: 1, requestUrl: 'https://example.test/search' },
    }),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await telemetry.shutdown(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  await fetch(`${base}/mend/discovery/start`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ disease: 'Glioblastoma', runId: 'disease-e2e' }),
  });

  let sequence = 0;
  const invoke = async ({ action, entityId, parentId, payload, runId = `port-e2e-${++sequence}` }) => {
    const envelope = buildMendPortEnvelope({ action, portRunId: runId, entityId, parentId, actor: 'port-reviewer', payload, requestedAt: '2026-08-22T12:00:00.000Z' });
    const response = await fetch(`${base}/api/port/actions`, {
      method: 'POST',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json', 'idempotency-key': runId },
      body: JSON.stringify(envelope),
    });
    return { response, result: await response.json(), envelope };
  };

  let action = await invoke({
    action: 'handoff_candidate', entityId: 'egfr', parentId: 'disease-e2e',
    payload: { axes: ['X', 'Y', 'Z'], selection_reason: 'Reviewed exact paper evidence', expected_selection_status: 'pending' },
  });
  assert.equal(action.response.status, 200);
  assert.deepEqual(new Set(action.result.port_entities.map((entry) => entry.blueprint)), new Set(['mendDiseaseRun', 'mendCandidateTarget', 'mendTargetRun', 'mendAxisRun']));
  const target = action.result.port_entities.find((entry) => entry.blueprint === 'mendTargetRun');
  const failedAxis = action.result.port_entities.find((entry) => entry.blueprint === 'mendAxisRun' && entry.entity.properties.axis === 'X');
  assert.equal(failedAxis.entity.properties.status, 'healing_pending');
  assert.equal(failedAxis.entity.properties.healing_request_id, `${target.entity.identifier}:X:healing:0`);

  const bypass = await invoke({
    action: 'retry_axis', entityId: failedAxis.entity.identifier, parentId: target.entity.identifier,
    payload: { axis: 'X', reason: 'Attempt to bypass approval', expected_status: 'failed', expected_retry_count: 0 },
  });
  assert.equal(bypass.response.status, 409);
  assert.match(bypass.result.error, /requires Port approval/);

  action = await invoke({
    action: 'approve_source_healing', entityId: failedAxis.entity.identifier, parentId: target.entity.identifier,
    payload: {
      axis: 'X', source_execution_id: failedAxis.entity.properties.source_execution_id,
      healing_request_id: failedAxis.entity.properties.healing_request_id, reason: 'Reviewed adapter change',
      evidence_url: 'https://example.test/healing-proof', expected_status: 'healing_pending',
    },
  });
  assert.equal(action.response.status, 200);
  assert.equal(action.result.port_entities[0].entity.properties.status, 'retry_pending');

  const retryRunId = 'port-e2e-retry';
  action = await invoke({
    action: 'retry_axis', entityId: failedAxis.entity.identifier, parentId: target.entity.identifier, runId: retryRunId,
    payload: { axis: 'X', reason: 'Approved source repair', expected_status: 'retry_pending', expected_retry_count: 0 },
  });
  assert.equal(action.response.status, 200);
  assert.equal(action.result.port_entities.find((entry) => entry.blueprint === 'mendAxisRun').entity.properties.retry_count, 1);
  assert.equal(action.result.port_entities.find((entry) => entry.blueprint === 'mendAxisRun').entity.properties.retry_history[0].port_run_id, retryRunId);
  const tasks = action.result.port_entities.filter((entry) => entry.blueprint === 'mendDiligenceTask');
  assert.equal(tasks.length, 3);

  const duplicate = await invoke({
    action: 'retry_axis', entityId: failedAxis.entity.identifier, parentId: target.entity.identifier, runId: retryRunId,
    payload: { axis: 'X', reason: 'Approved source repair', expected_status: 'retry_pending', expected_retry_count: 0 },
  });
  assert.equal(duplicate.response.status, 200);
  assert.equal(retryCalls, 1);

  const wrongAxis = await invoke({
    action: 'retry_axis', entityId: `${target.entity.identifier}:Y`, parentId: target.entity.identifier,
    payload: { axis: 'Y', reason: 'Should be rejected', expected_status: 'failed', expected_retry_count: 0 },
  });
  assert.equal(wrongAxis.response.status, 409);
  assert.match(wrongAxis.result.error, /only a failed axis/);

  for (const task of tasks) {
    action = await invoke({
      action: 'complete_diligence_task', entityId: task.entity.identifier, parentId: target.entity.identifier,
      payload: { finding: `Reviewed ${task.entity.properties.task_type}`, outcome: 'supports', evidence_ids: task.entity.properties.evidence_ids, expected_status: 'open' },
    });
    assert.equal(action.response.status, 200);
    assert.equal(action.result.port_entities[0].entity.properties.status, 'completed');
  }

  action = await invoke({
    action: 'record_target_decision', entityId: target.entity.identifier, parentId: 'disease-e2e',
    payload: { decision: 'proceed', rationale: 'All three reviewed tasks support bounded follow-up.', evidence_ids: tasks.flatMap((task) => task.entity.properties.evidence_ids), open_risks: ['Confirm translational relevance'], expected_status: 'review' },
  });
  assert.equal(action.response.status, 200);
  assert.deepEqual(action.result.port_entities.map((entry) => entry.blueprint), ['mendTargetRun', 'mendTargetDecision']);
  assert.equal(action.result.port_entities[0].entity.properties.status, 'decided');
  assert.equal(action.result.port_entities[1].entity.properties.actor, 'port-reviewer');
});
