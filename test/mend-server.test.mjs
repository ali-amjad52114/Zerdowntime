import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { AggregationTemporality, InMemoryMetricExporter } from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { createApp } from '../src/server.mjs';
import { createTelemetry } from '../src/telemetry.mjs';

test('Mend API and target view expose healthy, isolated X failure, and v2 recovery', async (t) => {
  const telemetry = createTelemetry({
    spanExporter: new InMemorySpanExporter(),
    logExporter: new InMemoryLogRecordExporter(),
    metricExporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
    console: false,
  });
  const { server } = createApp({ telemetry });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await telemetry.shutdown(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const run = (mode, runId) => fetch(`${base}/mend/runs`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode, runId }),
  });

  const entryView = await fetch(`${base}/mend`);
  assert.equal(entryView.status, 200);
  assert.match(await entryView.text(), /Disease or indication/);
  const healthy = await (await run('normal', 'api-mend-healthy')).json();
  assert.equal(healthy.status, 'HEALTHY');
  assert.equal(healthy.axes.X.records.length, 8);

  const failed = await (await run('break-x', 'api-mend-failed')).json();
  assert.equal(failed.status, 'DEGRADED');
  assert.equal(failed.axes.X.status, 'STALE_HEALTHY');
  assert.equal(failed.axes.Y.status, 'HEALTHY');

  const recovered = await (await run('repaired', 'api-mend-recovered')).json();
  assert.equal(recovered.status, 'HEALTHY');
  assert.equal(recovered.factoryVersion, 'v2');

  const workflowResponse = await fetch(`${base}/mend/diligence`, { method: 'POST' });
  assert.equal(workflowResponse.status, 201);
  let workflow = await workflowResponse.json();
  assert.equal(workflow.status, 'IN_PROGRESS');
  assert.equal(workflow.tasks.length, 3);
  for (const item of workflow.tasks) {
    const response = await fetch(`${base}/mend/diligence/tasks/${item.id}/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actor: `${item.axis}-reviewer`, finding: `${item.axis} evidence reviewed and follow-up recorded.` }),
    });
    assert.equal(response.status, 200);
    workflow = await response.json();
  }
  assert.equal(workflow.status, 'READY_FOR_DECISION');
  const decisionResponse = await fetch(`${base}/mend/diligence/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'PROCEED_TO_FOCUSED_DILIGENCE', actor: 'portfolio-lead', rationale: 'Reviewed evidence supports bounded follow-up work.' }),
  });
  assert.equal(decisionResponse.status, 200);
  workflow = await decisionResponse.json();
  assert.equal(workflow.status, 'DECIDED');

  const view = await fetch(`${base}/mend`);
  assert.equal(view.status, 200);
  const html = await view.text();
  assert.match(html, /SERPINA1/);
  assert.match(html, /X — PIPELINE/);
  assert.match(html, /Y — STRUCTURE/);
  assert.match(html, /Z — IP ACTIVITY/);
  assert.match(html, /Factory v2 · HEALTHY/);
  assert.match(html, /Evidence → Action/i);
  assert.match(html, /Proceed To Focused Diligence/);
  assert.match(html, /portfolio-lead/);
});

test('disease research discovers evidence-linked targets before X/Y/Z handoff', async (t) => {
  const telemetry = createTelemetry({
    spanExporter: new InMemorySpanExporter(),
    logExporter: new InMemoryLogRecordExporter(),
    metricExporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
    console: false,
  });
  const corpusDiscovery = async ({ disease }) => ({
    disease,
    papers: [
      { id: 'p1', title: 'EGFR dependency', abstract: 'EGFR is required for disease progression.', source_url: 'https://example.test/p1' },
      { id: 'p2', title: 'Independent cohort', abstract: 'EGFR was not associated with response in this cohort.', source_url: 'https://example.test/p2' },
    ],
    source: { provider: 'test corpus', hitCount: 2, requestUrl: 'https://example.test/search' },
  });
  const targetDiligence = async ({ target, disease, runId }) => ({
    runId, factoryVersion: 'discovery-v1', mode: 'normal', status: 'HEALTHY', publishStatus: 'PUBLISHED', failedAxes: [],
    axes: Object.fromEntries(['X', 'Y', 'Z'].map((axis) => [axis, {
      axis, status: 'HEALTHY', records: [{ axis, subject: target, value: disease, source_url: `https://example.test/${axis}`, retrieved_at: new Date().toISOString(), evidence: `${axis} evidence` }],
      summary: {}, validation: { status: 'PASS' },
    }])),
  });
  const { server } = createApp({ telemetry, corpusDiscovery, targetDiligence });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await telemetry.shutdown(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });

  let response = await post('/mend/discovery/start', { disease: 'Example disease' });
  assert.equal(response.status, 201);
  let state = await response.json();
  assert.equal(state.corpus.resource_count, 2);
  assert.equal(state.candidates[0].name, 'EGFR');
  assert.equal(state.candidates[0].ranking.supporting_evidence, 1);
  assert.equal(state.candidates[0].ranking.contradictory_evidence, 1);

  response = await post('/mend/discovery/select', { candidateIds: ['egfr'] });
  assert.equal(response.status, 200);
  state = await response.json();
  assert.deepEqual(state.selection.selected_candidate_ids, ['egfr']);

  response = await post('/mend/discovery/handoff', { candidateIds: ['egfr'] });
  assert.equal(response.status, 200);
  state = await response.json();
  assert.equal(state.handoff.status, 'COMPLETE');
  assert.equal(state.handoff.results[0].target, 'EGFR');
  assert.equal(state.handoff.results[0].run.axes.X.records[0].subject, 'EGFR');

  const html = await (await fetch(`${base}/mend`)).text();
  assert.match(html, /Example disease/);
  assert.match(html, /EGFR dependency/);
  assert.match(html, /EGFR is required for disease progression/);
  assert.match(html, /EGFR was not associated with response/);
  assert.match(html, /COMPLETE/);
});
