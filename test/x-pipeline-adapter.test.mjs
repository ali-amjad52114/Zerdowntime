import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  STAGE_RANK,
  normalizeXPipeline,
  runXAxis,
  validateXPipeline,
} from '../src/axes/x-pipeline-adapter.mjs';

const fixture = async (name) => JSON.parse(await readFile(
  new URL(`../fixtures/xyz/${name}`, import.meta.url),
  'utf8',
));

test('factory v1 maps eight saved pipeline results to canonical evidence', async () => {
  const result = runXAxis({ snapshot: await fixture('x-pipeline-normal-v1.json') });

  assert.equal(result.axis, 'X');
  assert.equal(result.records.length, 8);
  assert.deepEqual(result.summary, {
    programsFound: 8,
    organizations: 5,
    mostAdvancedStage: 'Phase 2',
  });
  assert.equal(result.validation.status, 'PASS');
  assert.deepEqual(Object.keys(result.records[0].evidence), [
    'axis', 'subject', 'value', 'source_url', 'retrieved_at', 'evidence',
  ]);
  assert.match(result.records[0].evidence.source_url, /^https:\/\//);
  assert.ok(result.records.every((record) => record.evidence.evidence));
});
test('controlled schema change produces 8 to 0 collapse and quarantines X only', async () => {
  const healthy = runXAxis({ snapshot: await fixture('x-pipeline-normal-v1.json') });
  const failed = runXAxis({
    snapshot: await fixture('x-pipeline-broken-v1.json'),
    mode: 'fail',
    previousHealthy: healthy.records,
  });

  assert.equal(healthy.records.length, 8);
  assert.equal(failed.records.length, 0);
  assert.equal(failed.validation.status, 'FAIL');
  assert.equal(failed.validation.quarantined, true);
  assert.deepEqual(failed.validation.reasons, ['EMPTY_RESULT', 'HISTORICAL_COUNT_COLLAPSE']);
  assert.equal(failed.validation.previousHealthyCount, 8);
  assert.equal(failed.validation.currentCount, 0);
});

test('factory v2 repair reads the changed contract and recovers all eight programs', async () => {
  const healthy = runXAxis({ snapshot: await fixture('x-pipeline-normal-v1.json') });
  const repaired = runXAxis({
    snapshot: await fixture('x-pipeline-repaired-v2.json'),
    mode: 'recover',
    previousHealthy: healthy.records,
  });

  assert.equal(repaired.records.length, 8);
  assert.equal(repaired.validation.status, 'PASS');
  assert.equal(repaired.validation.quarantined, false);
  assert.equal(repaired.summary.mostAdvancedStage, 'Phase 2');
});

test('validation rejects missing identity, evidence, and excessive missingness', () => {
  const records = normalizeXPipeline([{
    organization: 'Example Bio',
    disease: 'Alpha-1 Antitrypsin Deficiency',
  }], { source_url: 'https://example.test', retrieved_at: '2026-08-22T15:00:00.000Z' });
  const validation = validateXPipeline(records);

  assert.equal(validation.status, 'FAIL');
  assert.ok(validation.reasons.some((reason) => reason.startsWith('MISSING_IDENTITY')));
  assert.ok(validation.reasons.some((reason) => reason.startsWith('MISSING_EVIDENCE')));
  assert.ok(validation.reasons.includes('EXCESSIVE_MISSINGNESS'));
});

test('normalizer accepts Bright Data evidence_excerpt output', () => {
  const [record] = normalizeXPipeline([{
    organization: 'Arrowhead Pharmaceuticals',
    program: 'Fazirsiran (ARO-AAT)',
    disease: 'Alpha-1 Liver Disease',
    target_mechanism: 'Liver',
    development_stage: 'Phase 3',
    source_url: 'https://arrowheadpharma.com/en-us/pipeline',
    evidence_excerpt: 'Fazirsiran (ARO-AAT): Alpha-1 Liver Disease (Phase 3)',
  }], { retrieved_at: '2026-08-22T15:00:00.000Z' });

  assert.equal(record.evidenceText, 'Fazirsiran (ARO-AAT): Alpha-1 Liver Disease (Phase 3)');
  assert.equal(validateXPipeline([record], { maxMissingRatio: 0.67 }).status, 'PASS');
});

test('STAGE_RANK is exported so downstream consumers share one ladder', () => {
  assert.equal(STAGE_RANK.get('Discovery'), 1);
  assert.equal(STAGE_RANK.get('Approved'), 8);
  assert.equal(STAGE_RANK.get('Phase 2'), 5);
  assert.equal(STAGE_RANK.get('Unknown stage'), undefined);
});
