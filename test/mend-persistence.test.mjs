import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { AggregationTemporality, InMemoryMetricExporter } from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { createApp } from '../src/server.mjs';
import { createMemoryStateStore } from '../src/mend/state-store.mjs';
import { createTelemetry } from '../src/telemetry.mjs';

function telemetry() {
  return createTelemetry({
    spanExporter: new InMemorySpanExporter(),
    logExporter: new InMemoryLogRecordExporter(),
    metricExporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
    console: false,
  });
}

async function listen(t, options) {
  const app = createApp({ telemetry: telemetry(), ...options });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    if (app.server.listening) await new Promise((resolve) => app.server.close(resolve));
    await app.telemetry.shutdown();
  });
  return { app, base: `http://127.0.0.1:${app.server.address().port}` };
}

const corpusDiscovery = async ({ disease }) => ({
  disease,
  papers: [
    { id: 'p1', title: 'EGFR and MET evidence', abstract: 'EGFR is required for progression. MET is associated with progression.', source_url: 'https://example.test/p1' },
  ],
  candidateLexicon: [{ name: 'EGFR' }, { name: 'MET' }],
  source: { provider: 'test', hitCount: 1, requestUrl: 'https://example.test/search' },
});

const targetDiligence = async ({ target, disease, runId }) => ({
  runId,
  factoryVersion: 'discovery-v1',
  mode: 'normal',
  status: 'HEALTHY',
  publishStatus: 'PUBLISHED',
  failedAxes: [],
  disease,
  target,
  axes: Object.fromEntries(['X', 'Y', 'Z'].map((axis) => [axis, {
    axis,
    status: 'HEALTHY',
    records: [{ axis, subject: target, value: disease, source_url: `https://example.test/${target}/${axis}`, retrieved_at: '2026-08-22T00:00:00.000Z', evidence: `${target} ${axis} evidence` }],
    summary: axis === 'Y' ? { uniprot_id: target === 'EGFR' ? 'P00533' : 'P08581' } : {},
    validation: { status: 'PASS' },
  }])),
});

test('discovery rejects caller-supplied targets', async (t) => {
  const { base } = await listen(t, { corpusDiscovery });
  const response = await fetch(`${base}/mend/discovery/start`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ disease: 'Glioblastoma', target: 'EGFR' }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /disease only/);
});

test('multiple target runs remain independently addressable and survive app restart', async (t) => {
  const stateStore = createMemoryStateStore();
  const targetAnalyze = async ({ target, uniprot_id, disease }) => ({
    target, uniprot_id, disease,
    structure: { pdb_id: '1ABC', source: 'experimental', structure_url: '/target/1ABC/structure' },
    pockets: [], pockets_source: 'unavailable', pockets_error: 'P2Rank unavailable in test',
  });
  const compoundDiscovery = async ({ target, uniprot_id, disease }) => ({
    target, uniprot_id, disease, chembl_target: { target_chembl_id: 'CHEMBL1' }, compounds: [], activity_count: 0,
  });
  const dependencies = { stateStore, corpusDiscovery, targetDiligence, targetAnalyze, compoundDiscovery };
  const first = await listen(t, dependencies);
  const post = (base, path, body) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  let response = await post(first.base, '/mend/discovery/start', { disease: 'Glioblastoma', runId: 'disease-run-1' });
  assert.equal(response.status, 201);
  response = await post(first.base, '/mend/discovery/select', { candidateIds: ['egfr', 'met'] });
  assert.equal(response.status, 200);
  response = await post(first.base, '/mend/discovery/handoff', { candidateIds: ['egfr', 'met'] });
  const state = await response.json();
  assert.equal(state.handoff.results.length, 2);
  const [egfrRun, metRun] = state.handoff.results.map((item) => item.run);
  assert.notEqual(egfrRun.runId, metRun.runId);
  assert.equal(egfrRun.target, 'EGFR');
  assert.equal(metRun.target, 'MET');

  const listed = await (await fetch(`${first.base}/mend/runs`)).json();
  assert.equal(listed.disease_run_id, 'disease-run-1');
  assert.equal(listed.runs.length, 2);
  assert.deepEqual(new Set(listed.runs.map((run) => run.target)), new Set(['EGFR', 'MET']));

  const selectedMet = await (await fetch(`${first.base}/mend/target?runId=${encodeURIComponent(metRun.runId)}`)).json();
  assert.equal(selectedMet.target, 'MET');
  response = await post(first.base, '/mend/diligence', { runId: metRun.runId });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).runId, metRun.runId);
  response = await post(first.base, '/target/analyze', { target: 'MET', uniprot_id: 'P08581', disease: 'Glioblastoma', target_run_id: metRun.runId });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).target_run_id, metRun.runId);
  response = await post(first.base, '/target/analyze', { target: 'EGFR', uniprot_id: 'P00533', disease: 'Glioblastoma', target_run_id: metRun.runId });
  assert.equal(response.status, 400);
  response = await post(first.base, '/target/analyze', { target: 'MET', uniprot_id: 'P00533', disease: 'Glioblastoma', target_run_id: metRun.runId });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /uniprot_id does not match/);
  response = await post(first.base, '/target/analyze', { target: 'MET', uniprot_id: 'P08581', disease: 'Another disease', target_run_id: metRun.runId });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /disease does not match/);
  response = await post(first.base, '/target/compounds', { target: 'MET', uniprot_id: 'P08581', disease: 'Glioblastoma', target_run_id: metRun.runId });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).target_run_id, metRun.runId);
  response = await post(first.base, '/target/compounds', { target: 'MET', uniprot_id: 'P00533', disease: 'Glioblastoma', target_run_id: metRun.runId });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /uniprot_id does not match/);
  response = await post(first.base, '/target/compounds', { target: 'MET', uniprot_id: 'P08581', disease: 'Another disease', target_run_id: metRun.runId });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /disease does not match/);

  await new Promise((resolve) => first.app.server.close(resolve));
  await first.app.telemetry.shutdown();
  const second = await listen(t, dependencies);
  const restored = await (await fetch(`${second.base}/mend/discovery`)).json();
  assert.equal(restored.disease, 'Glioblastoma');
  assert.equal(restored.handoff.results.length, 2);
  assert.equal((await (await fetch(`${second.base}/mend/target?runId=${encodeURIComponent(egfrRun.runId)}`)).json()).target, 'EGFR');
  assert.equal((await (await fetch(`${second.base}/mend/diligence?runId=${encodeURIComponent(metRun.runId)}`)).json()).runId, metRun.runId);
  assert.equal((await (await fetch(`${second.base}/target/${encodeURIComponent(metRun.runId)}/analysis`)).json()).target, 'MET');
  assert.equal((await (await fetch(`${second.base}/target/${encodeURIComponent(metRun.runId)}/compounds`)).json()).target, 'MET');
});

test('new disease discovery preserves historical target runs, workflows, and run-isolated analyses', async (t) => {
  const stateStore = createMemoryStateStore();
  const analyzeCalls = [];
  const targetAnalyze = async ({ target, uniprot_id, disease }) => {
    analyzeCalls.push({ target, uniprot_id, disease });
    return {
      target, uniprot_id, disease,
      structure: { pdb_id: disease === 'Disease one' ? '1AAA' : '2BBB', source: 'experimental', structure_url: '/target/structure' },
      pockets: [], pockets_source: 'unavailable',
    };
  };
  const { base } = await listen(t, { stateStore, corpusDiscovery, targetDiligence, targetAnalyze });
  const post = (path, body) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });

  await post('/mend/discovery/start', { disease: 'Disease one', runId: 'disease-one' });
  await post('/mend/discovery/select', { candidateIds: ['egfr'] });
  let response = await post('/mend/discovery/handoff', { candidateIds: ['egfr'], axes: ['X', 'Y', 'Z'] });
  const firstRun = (await response.json()).handoff.results[0].run;
  response = await post('/mend/diligence', { runId: firstRun.runId });
  assert.equal(response.status, 201);
  response = await post('/target/analyze', { target_run_id: firstRun.runId });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).disease, 'Disease one');

  await post('/mend/discovery/start', { disease: 'Disease two', runId: 'disease-two' });
  assert.equal((await fetch(`${base}/mend/target?runId=${encodeURIComponent(firstRun.runId)}`)).status, 200);
  assert.equal((await fetch(`${base}/mend/diligence?runId=${encodeURIComponent(firstRun.runId)}`)).status, 200);
  await post('/mend/discovery/select', { candidateIds: ['egfr'] });
  response = await post('/mend/discovery/handoff', { candidateIds: ['egfr'], axes: ['Z', 'X', 'Y'] });
  const secondRun = (await response.json()).handoff.results[0].run;
  response = await post('/target/analyze', { target_run_id: secondRun.runId });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).disease, 'Disease two');
  assert.equal(analyzeCalls.length, 2, 'same target/accession must be analyzed independently for each target run');

  response = await post('/target/analyze', { target_run_id: firstRun.runId });
  assert.equal((await response.json()).disease, 'Disease one');
  assert.equal(analyzeCalls.length, 2, 'repeat lookup may only reuse the cache for its own target run');
  const listed = await (await fetch(`${base}/mend/runs`)).json();
  assert.equal(listed.runs.length, 2);
});

test('handoff rejects partial axes and retains successful targets when a peer target throws', async (t) => {
  const partialFailureDiligence = async (input) => {
    if (input.target === 'MET') throw new Error('MET provider failed');
    return targetDiligence(input);
  };
  const { base } = await listen(t, { corpusDiscovery, targetDiligence: partialFailureDiligence });
  const post = (path, body) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  await post('/mend/discovery/start', { disease: 'Glioblastoma', runId: 'partial-run' });
  await post('/mend/discovery/select', { candidateIds: ['egfr', 'met'] });

  let response = await post('/mend/discovery/handoff', { candidateIds: ['egfr', 'met'], axes: ['X', 'Y'] });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /complete X\/Y\/Z set/);

  response = await post('/mend/discovery/handoff', { candidateIds: ['egfr', 'met'], axes: ['X', 'Y', 'Z'] });
  assert.equal(response.status, 200);
  const state = await response.json();
  assert.equal(state.handoff.status, 'DEGRADED');
  assert.deepEqual(state.handoff.requested_axes, ['X', 'Y', 'Z']);
  assert.equal(state.handoff.results[0].run.status, 'HEALTHY');
  assert.equal(state.handoff.results[1].run.status, 'FAILED');
  assert.match(state.handoff.results[1].error, /MET provider failed/);
  assert.equal((await fetch(`${base}/mend/target?runId=${encodeURIComponent(state.handoff.results[0].run.runId)}`)).status, 200);
  const listed = await (await fetch(`${base}/mend/runs`)).json();
  assert.equal(listed.runs.length, 2);
});
