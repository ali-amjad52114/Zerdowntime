import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildCollectorPrompt,
  chooseAcquisitionRoute,
  createBrightDataAcquisitionRequest,
  executeBrightDataAdapter,
  persistBrightDataSourceExecution,
} from '../src/acquisition/brightdata-source.mjs';

function request(overrides = {}) {
  return createBrightDataAcquisitionRequest({
    diseaseRunId: 'disease-run-cf', candidateId: 'candidate-cftr', targetRunId: 'target-run-cftr',
    disease: { name: 'Cystic fibrosis', aliases: ['CF'] },
    target: { name: 'CFTR', aliases: ['ABCC7'], identifiers: { uniprot: 'P13569' } },
    source: {
      kind: 'scraper_studio_collector', assetId: 'c_test_pipeline',
      url: 'https://biotech.example/pipeline', publicSourceApproved: true,
    },
    ...overrides,
  });
}

const payload = JSON.parse(readFileSync(new URL('../fixtures/brightdata/cftr-pipeline.json', import.meta.url), 'utf8'));

test('request is disease/target-specific with no fixed SERPINA1 terms', () => {
  const value = request();
  assert.deepEqual(value.query.disease_terms, ['Cystic fibrosis', 'CF']);
  assert.deepEqual(value.query.target_terms, ['CFTR', 'ABCC7']);
  assert.doesNotMatch(JSON.stringify(value), /SERPINA1|AATD|antitrypsin/i);
  assert.match(buildCollectorPrompt(value), /CFTR/);
});

test('request blocks secrets and non-public source URLs', () => {
  assert.throws(() => request({ apiKey: 'do-not-store-this' }), /not allowed/);
  assert.throws(() => request({ source: { kind: 'scraper_studio_collector', assetId: 'c_x', url: 'http://127.0.0.1/private', publicSourceApproved: true } }), /public source/);
});

test('route ordering prefers an authoritative API then existing Bright Data assets', () => {
  assert.equal(chooseAcquisitionRoute({ authoritativeApi: { available: true } }).strategy, 'authoritative_api');
  assert.equal(chooseAcquisitionRoute({ datasets: [{ id: 'gd_existing' }], collectors: [{ id: 'c_existing' }] }).strategy, 'brightdata_existing_dataset');
  assert.equal(chooseAcquisitionRoute({ collectors: [{ id: 'c_existing' }] }).strategy, 'brightdata_existing_collector');
  assert.equal(chooseAcquisitionRoute({}).strategy, 'gap_requires_review');
});

test('adapter filters dynamically and preserves exact record evidence', () => {
  const result = executeBrightDataAdapter({ request: request(), payload, retrievedAt: '2026-08-22T20:00:00.000Z' });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].program, 'CFTR-101');
  assert.equal(result.records[0].provenance.raw_record_index, 0);
  assert.deepEqual(result.records[0].provenance.matched_terms.target_terms, ['CFTR']);
  assert.match(result.records[0].evidenceText, /cystic fibrosis/i);
  assert.equal(result.validation.status, 'PASS');
});

test('unrelated target run cannot inherit records from the previous target', () => {
  const pcsk9Payload = JSON.parse(readFileSync(new URL('../fixtures/brightdata/pcsk9-pipeline.json', import.meta.url), 'utf8'));
  const pcsk9Request = request({
    diseaseRunId: 'disease-run-fh', targetRunId: 'target-run-pcsk9', candidateId: 'candidate-pcsk9',
    disease: { name: 'Familial hypercholesterolemia', aliases: ['FH'] },
    target: { name: 'PCSK9', aliases: [] },
    source: { kind: 'scraper_studio_collector', assetId: 'c_cardio', url: 'https://cardio.example/pipeline', publicSourceApproved: true },
  });
  const result = executeBrightDataAdapter({ request: pcsk9Request, payload: pcsk9Payload });
  assert.deepEqual(result.records.map((record) => record.program), ['PCSK9-22']);
  assert.ok(result.records.every((record) => record.provenance.asset_id === 'c_cardio'));
  assert.doesNotMatch(JSON.stringify(result), /CFTR-9|SERPINA1|AATD/i);
});

test('unapproved public source is quarantined', () => {
  const unapproved = request({ source: { kind: 'scraper_studio_collector', assetId: 'c_test_pipeline', url: 'https://biotech.example/pipeline', publicSourceApproved: false } });
  const result = executeBrightDataAdapter({ request: unapproved, payload });
  assert.equal(result.validation.status, 'FAIL');
  assert.ok(result.validation.reasons.includes('PUBLIC_SOURCE_APPROVAL_REQUIRED'));
});

test('durable execution manifest has checksums, correlations, run ID, and no secret', () => {
  const sourceRequest = request();
  const result = executeBrightDataAdapter({ request: sourceRequest, payload, retrievedAt: '2026-08-22T20:00:00.000Z' });
  const root = mkdtempSync(join(tmpdir(), 'mend-brightdata-'));
  const manifest = persistBrightDataSourceExecution({
    artifactRoot: root, request: sourceRequest, payload, adapterResult: result,
    executionId: 'source-exec-cftr', providerRunId: 'snapshot-123',
    startedAt: '2026-08-22T19:59:59.000Z', completedAt: '2026-08-22T20:00:00.000Z',
  });
  const saved = JSON.parse(readFileSync(join(root, 'source-exec-cftr', 'manifest.json'), 'utf8'));
  assert.equal(saved.correlation.target_run_id, 'target-run-cftr');
  assert.equal(saved.provider.run_id, 'snapshot-123');
  assert.equal(saved.telemetry_attributes['source.execution.id'], 'source-exec-cftr');
  assert.equal(saved.telemetry_attributes['brightdata.collector.id'], 'c_test_pipeline');
  assert.equal(saved.live_gate.pass, true);
  assert.match(saved.artifacts.raw.sha256, /^[a-f0-9]{64}$/);
  assert.equal(saved.counts.normalized, 1);
  assert.doesNotMatch(JSON.stringify(saved), /api[_-]?key|authorization|bearer/i);
  assert.equal(manifest.status, 'succeeded');
});

test('fixture execution can never satisfy the live sponsor gate', () => {
  const sourceRequest = request();
  const result = executeBrightDataAdapter({ request: sourceRequest, payload });
  const root = mkdtempSync(join(tmpdir(), 'mend-brightdata-fixture-'));
  const manifest = persistBrightDataSourceExecution({
    artifactRoot: root, request: sourceRequest, payload, adapterResult: result,
    executionId: 'fixture-exec', providerRunId: 'fake-run', mode: 'fixture',
  });
  assert.equal(manifest.live_gate.pass, false);
});

test('artifact persistence rejects secret-shaped provider payloads', () => {
  const sourceRequest = request();
  const secretPayload = [{ ...payload[0], api_key: 'must-not-be-written' }];
  const result = executeBrightDataAdapter({ request: sourceRequest, payload: secretPayload });
  const root = mkdtempSync(join(tmpdir(), 'mend-brightdata-secret-'));
  assert.throws(() => persistBrightDataSourceExecution({
    artifactRoot: root, request: sourceRequest, payload: secretPayload,
    adapterResult: result, executionId: 'secret-exec', mode: 'fixture',
  }), /not allowed/);
});
