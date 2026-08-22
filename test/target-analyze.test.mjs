import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import test from 'node:test';
import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { AggregationTemporality, InMemoryMetricExporter } from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { createApp } from '../src/server.mjs';
import { analyzeTarget, resolveStructurePath } from '../src/axes/y/analyze.mjs';
import { createTelemetry } from '../src/telemetry.mjs';

const ANALYZE_BODY = {
  target: 'SERPINA1',
  uniprot_id: 'P01009',
  disease: 'Alpha-1 Antitrypsin Deficiency',
};

const LOCKED_CONTRACT = {
  target: 'SERPINA1',
  uniprot_id: 'P01009',
  disease: 'Alpha-1 Antitrypsin Deficiency',
  structure: {
    pdb_id: '1QLP',
    source: 'experimental',
    method: 'X-RAY DIFFRACTION',
    resolution: 2.0,
    released: null,
    has_ligand: true,
    chains: ['A'],
    ligands: ['SO4'],
    structure_url: '/target/1QLP/structure',
    selection_rules: [
      'experimental > predicted',
      'ligand-bound > unbound',
      'better resolution',
      'newer entry',
    ],
  },
  pockets: [
    { rank: 1, score: 12.4, probability: 0.91, residues: ['A:34', 'A:38', 'A:112'] },
  ],
  pockets_source: 'fixture',
};

function rejectLiveNetwork(label) {
  return async () => {
    throw new Error(`${label} must not be used in tests`);
  };
}

async function startAnalyzeApp(t, { targetAnalyze, analyzeCalls }) {
  const spanExporter = new InMemorySpanExporter();
  const telemetry = createTelemetry({
    spanExporter,
    logExporter: new InMemoryLogRecordExporter(),
    metricExporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
    console: false,
  });
  const { server } = createApp({
    telemetry,
    targetAnalyze,
    fetchImpl: rejectLiveNetwork('live RCSB fetch'),
    prankImpl: rejectLiveNetwork('live P2Rank'),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await telemetry.shutdown();
  });
  return {
    telemetry,
    spanExporter,
    analyzeCalls,
    base: `http://127.0.0.1:${server.address().port}`,
  };
}

function createTargetAnalyzeMock() {
  const analyzeCalls = [];
  const targetAnalyze = async (input) => {
    analyzeCalls.push(input);
    return structuredClone(LOCKED_CONTRACT);
  };
  return { targetAnalyze, analyzeCalls };
}

function assertLockedContract(body) {
  assert.equal(body.target, LOCKED_CONTRACT.target);
  assert.equal(body.uniprot_id, LOCKED_CONTRACT.uniprot_id);
  assert.equal(body.disease, LOCKED_CONTRACT.disease);
  assert.equal(body.pockets_source, 'fixture');
  assert.equal(body.structure.pdb_id, '1QLP');
  assert.equal(body.structure.source, 'experimental');
  assert.equal(body.structure.method, 'X-RAY DIFFRACTION');
  assert.equal(body.structure.resolution, 2.0);
  assert.equal(body.structure.released, null);
  assert.equal(body.structure.has_ligand, true);
  assert.deepEqual(body.structure.chains, ['A']);
  assert.deepEqual(body.structure.ligands, ['SO4']);
  assert.equal(body.structure.structure_url, '/target/1QLP/structure');
  assert.deepEqual(body.structure.selection_rules, LOCKED_CONTRACT.structure.selection_rules);
  assert.equal(body.pockets.length, 1);
  assert.equal(body.pockets[0].rank, 1);
  assert.equal(body.pockets[0].score, 12.4);
  assert.equal(body.pockets[0].probability, 0.91);
  assert.deepEqual(body.pockets[0].residues, ['A:34', 'A:38', 'A:112']);
}

function assertAnalyzeInvokedWithBody(analyzeCalls) {
  assert.equal(analyzeCalls.length, 1);
  const input = analyzeCalls[0] ?? {};
  assert.equal(input.target, ANALYZE_BODY.target);
  assert.equal(input.uniprot_id, ANALYZE_BODY.uniprot_id);
  assert.equal(input.disease, ANALYZE_BODY.disease);
}

test('POST /target/analyze returns the locked contract and records target.structure.analyze', async (t) => {
  const mock = createTargetAnalyzeMock();
  const { telemetry, spanExporter, base, analyzeCalls } = await startAnalyzeApp(t, mock);

  const response = await fetch(`${base}/target/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ANALYZE_BODY),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assertLockedContract(body);
  assertAnalyzeInvokedWithBody(analyzeCalls);

  await telemetry.flush();
  const spans = spanExporter.getFinishedSpans();
  const apiSpan = spans.find((span) => span.name === 'api.post /target/analyze');
  const analyzeSpan = spans.find((span) => span.name === 'target.structure.analyze');
  assert.ok(apiSpan, 'missing parent span api.post /target/analyze');
  assert.ok(analyzeSpan, 'missing span target.structure.analyze');
  assert.equal(analyzeSpan.attributes['target.name'], 'SERPINA1');
  assert.equal(analyzeSpan.attributes['uniprot.id'], 'P01009');
  assert.equal(analyzeSpan.attributes['structure.pdb_id'], '1QLP');
  assert.equal(analyzeSpan.attributes['structure.source'], 'experimental');
  const parentSpanId = analyzeSpan.parentSpanId ?? analyzeSpan.parentSpanContext?.spanId;
  assert.equal(parentSpanId, apiSpan.spanContext().spanId);
  assert.equal(analyzeSpan.spanContext().traceId, apiSpan.spanContext().traceId);

  const cached = await fetch(`${base}/target/1QLP/analysis`);
  assert.equal(cached.status, 200);
  assertLockedContract(await cached.json());
  assert.equal(analyzeCalls.length, 1, 'cached GET /target/1QLP/analysis must not re-invoke targetAnalyze');
});

test('GET /target/missing/analysis and /target/missing/structure are 404', async (t) => {
  const mock = createTargetAnalyzeMock();
  const { base } = await startAnalyzeApp(t, mock);

  const analysis = await fetch(`${base}/target/missing/analysis`);
  assert.equal(analysis.status, 404);

  const structure = await fetch(`${base}/target/missing/structure`);
  assert.equal(structure.status, 404);
  assert.equal(mock.analyzeCalls.length, 0);
});

test('exact-accession analysis falls back only to AlphaFold and records P2Rank provenance', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method ?? 'GET', body: options.body });
    if (String(url).includes('search.rcsb.org')) {
      const query = JSON.parse(options.body).query;
      assert.equal(query.parameters.attribute, 'rcsb_polymer_entity_container_identifiers.reference_sequence_identifiers.database_accession');
      assert.equal(query.parameters.operator, 'exact_match');
      assert.equal(query.parameters.value, 'P00533');
      return { ok: true, status: 200, json: async () => ({ result_set: [] }) };
    }
    if (String(url).includes('alphafold.ebi.ac.uk') && options.method === 'HEAD') {
      return { ok: true, status: 200 };
    }
    if (String(url).includes('alphafold.ebi.ac.uk')) {
      return { ok: true, status: 200, text: async () => 'HEADER ALPHAFOLD TEST' };
    }
    throw new Error(`unexpected URL ${url}`);
  };
  const pdbId = 'AF-P00533-F1';
  try {
    const result = await analyzeTarget({
      target: 'EGFR',
      uniprot_id: 'P00533',
      disease: 'Glioblastoma',
      fetchImpl,
      prankImpl: async () => [{ rank: 1, score: 5, probability: 0.8, residues: ['A:10'] }],
    });
    assert.equal(result.structure.source, 'alphafold');
    assert.equal(result.pockets_source, 'p2rank');
    assert.deepEqual(result.pockets_provenance, {
      engine: 'P2Rank',
      version: process.env.MEND_P2RANK_VERSION ?? 'unreported',
      mode: 'predict',
      command: 'prank predict',
      structure_id: pdbId,
      generated_at: result.pockets_provenance.generated_at,
    });
    assert.equal(calls.filter((call) => call.url.includes('search.rcsb.org')).length, 1);
    assert.ok(calls.every((call) => !String(call.body ?? '').includes('full_text')));
  } finally {
    await rm(resolveStructurePath(pdbId), { force: true });
  }
});
