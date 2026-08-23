import assert from 'node:assert/strict';
import test from 'node:test';
import { runClinicalTrialsAxis } from '../src/axes/x/clinical-trials.mjs';
import { runSiteGeographyFromStudies } from '../src/axes/x/site-geography.mjs';

test('a successful zero-match trial search is a source-linked evidence gap', async () => {
  let calls = 0;
  const result = await runClinicalTrialsAxis({
    disease: 'Rare example disease',
    target: 'GENE1',
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, json: async () => ({ studies: [] }) };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.validation.status, 'PASS');
  assert.equal(result.validation.evidence_gap, true);
  assert.equal(result.summary.programsFound, 0);
  assert.equal(result.records[0].record_type, 'evidence_gap');
  assert.match(result.records[0].source_url, /^https:\/\/clinicaltrials\.gov\/api\/v2\/studies\?/);

  const geography = runSiteGeographyFromStudies({
    studies: result.source_snapshot.studies,
    query: { disease: 'Rare example disease', target: 'GENE1' },
    retrievedAt: result.source_snapshot.retrieved_at,
    sourceQueryUrl: result.source_snapshot.query_url,
  });
  assert.equal(geography.validation.evidence_gap, true);
  assert.equal(geography.summary.trials, 0);
  assert.equal(geography.records[0].source_url, result.records[0].source_url);
});

test('transport and malformed ClinicalTrials.gov responses still fail loudly', async () => {
  await assert.rejects(() => runClinicalTrialsAxis({
    disease: 'Disease', target: 'GENE1',
    fetchImpl: async () => ({ ok: false, status: 503 }),
  }), /HTTP 503/);
  await assert.rejects(() => runClinicalTrialsAxis({
    disease: 'Disease', target: 'GENE1',
    fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
  }), /missing studies/);
  await assert.rejects(() => runClinicalTrialsAxis({
    disease: 'Disease', target: 'GENE1',
    fetchImpl: async () => ({ ok: true, json: async () => ({ studies: [{ protocolSection: {} }] }) }),
  }), /without usable trial identity/);
});

test('site geography derives exact locations from the supplied studies array', () => {
  const studies = [{ protocolSection: {
    identificationModule: { nctId: 'NCT00000001', briefTitle: 'GENE1 study' },
    contactsLocationsModule: { locations: [{ country: 'Canada' }, { country: 'France' }] },
  } }];
  const result = runSiteGeographyFromStudies({
    studies,
    query: { disease: 'Disease', target: 'GENE1' },
    retrievedAt: '2026-08-22T00:00:00.000Z',
    sourceQueryUrl: 'https://clinicaltrials.gov/api/v2/studies?query.term=GENE1',
  });
  assert.equal(result.summary.total_sites, 2);
  assert.deepEqual(result.records[0].countries, ['Canada', 'France']);
  assert.equal(result.records[0].retrieved_at, '2026-08-22T00:00:00.000Z');
});
