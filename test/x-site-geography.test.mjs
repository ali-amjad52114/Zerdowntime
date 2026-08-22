import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONCENTRATION_THRESHOLD,
  normalizeTrialSites,
  regionOf,
  runSiteGeography,
  summarizeSiteGeography,
  validateTrialSiteRecords,
} from '../src/axes/x/site-geography.mjs';

const CLOCK = () => new Date('2026-08-22T18:00:00.000Z');

async function fixture() {
  return JSON.parse(await readFile(new URL('../fixtures/xyz/x-trial-sites.json', import.meta.url), 'utf8'));
}

function trial(nctId, countries, { siteCount = countries.length } = {}) {
  return {
    id: nctId, axis: 'X', sub_axis: 'site_geography', subject: 'test', value: nctId,
    source_url: `https://trials.example.invalid/study/${nctId}`, evidence: 'fixture',
    nct_id: nctId, countries, site_count: siteCount,
  };
}

test('normalizer reads countries and site count from the locations module', async () => {
  const records = normalizeTrialSites(await fixture(), { retrievedAt: '2026-08-22T18:00:00.000Z' });
  assert.equal(records.length, 3);
  const [first] = records;
  assert.equal(first.axis, 'X');
  assert.equal(first.sub_axis, 'site_geography');
  assert.deepEqual(first.countries, ['United States', 'Canada', 'Germany', 'Brazil']);
  assert.equal(first.site_count, 4);
  assert.equal(first.phase, 'PHASE2');
  assert.equal(first.status, 'recruiting');
  assert.equal(first.retrieved_at, '2026-08-22T18:00:00.000Z');
});

test('two sites in one country collapse to one country but stay two sites', () => {
  const [record] = normalizeTrialSites({
    studies: [{
      protocolSection: {
        identificationModule: { nctId: 'NCT00000001' },
        contactsLocationsModule: {
          locations: [{ country: 'France' }, { country: 'France' }, { country: 'Spain' }],
        },
      },
    }],
  });
  assert.deepEqual(record.countries, ['France', 'Spain']);
  assert.equal(record.site_count, 3);
  assert.equal(record.source_url, 'https://clinicaltrials.gov/study/NCT00000001');
});

test('a trial with no reported location keeps an empty country list rather than a guess', () => {
  const [record] = normalizeTrialSites({
    studies: [{ protocolSection: { identificationModule: { nctId: 'NCT00000002' } } }],
  });
  assert.deepEqual(record.countries, []);
  assert.equal(record.site_count, 0);
  assert.match(record.evidence, /no reported country/);
});

test('an empty source response is an error, not an empty geography', () => {
  assert.throws(() => normalizeTrialSites({ studies: [] }), /returned no studies/);
  assert.throws(() => normalizeTrialSites({}), /returned no studies/);
});

test('validation rejects impossible counts and missing evidence', () => {
  assert.throws(() => validateTrialSiteRecords([]), /at least one trial record/);
  assert.throws(
    () => validateTrialSiteRecords([trial('FIXTURE-1', ['France', 'Spain'], { siteCount: 1 })]),
    /more countries than sites/,
  );
  const missingEvidence = { ...trial('FIXTURE-2', ['France']), evidence: '' };
  assert.throws(() => validateTrialSiteRecords([missingEvidence]), /evidence is required/);
});

test('the region map is coarse and unmapped countries are reported, not dropped', () => {
  assert.equal(regionOf('United States'), 'North America');
  assert.equal(regionOf('Japan'), 'Asia');
  assert.equal(regionOf('Atlantis'), 'Other / unmapped');
  const summary = summarizeSiteGeography([trial('FIXTURE-3', ['Atlantis'])]);
  assert.deepEqual(summary.unmapped_countries, ['Atlantis']);
  assert.equal(summary.regions[0].region, 'Other / unmapped');
});

test('the fixture rolls up to five regions, six countries and eight sites', async () => {
  const result = await runSiteGeography({ retrieve: async () => await fixture(), clock: CLOCK });
  const { summary } = result;
  assert.equal(result.validation.status, 'PASS');
  assert.equal(summary.regions.length, 5);
  assert.equal(summary.countries_covered, 6);
  assert.equal(summary.total_sites, 8);
  assert.equal(summary.single_country_trials, 1);
  assert.deepEqual(summary.regions.map((region) => region.region), [
    'North America', 'Europe', 'Asia', 'Latin America', 'Oceania',
  ]);
  assert.deepEqual(summary.countries[0], { country: 'Germany', trials: 2, sites: 2 });
});

test('concentration only flags above the stated threshold and never concludes feasibility', () => {
  const spread = summarizeSiteGeography([
    trial('FIXTURE-4', ['United States']),
    trial('FIXTURE-5', ['United States', 'Germany']),
    trial('FIXTURE-6', ['Japan', 'Australia']),
  ]);
  assert.equal(spread.concentration_ratio, 0.33);
  assert.equal(spread.concentrated, false);

  const concentrated = summarizeSiteGeography([
    trial('FIXTURE-7', ['United States']),
    trial('FIXTURE-8', ['United States']),
    trial('FIXTURE-9', ['United States', 'Canada']),
  ]);
  assert.equal(concentrated.concentration_ratio, 0.67);
  assert.equal(concentrated.concentrated, true);
  assert.ok(concentrated.concentration_ratio > CONCENTRATION_THRESHOLD);
  assert.equal(concentrated.feasibility_conclusion, null);
});

test('runner is deterministic and rejects an invalid retrieval contract', async () => {
  const payload = await fixture();
  const first = await runSiteGeography({ retrieve: async () => payload, clock: CLOCK });
  const second = await runSiteGeography({ retrieve: async () => payload, clock: CLOCK });
  assert.deepEqual(first.records, second.records);
  await assert.rejects(() => runSiteGeography({}), /injected retrieval function/);
  await assert.rejects(() => runSiteGeography({ retrieve: async () => ({}) }), /returned no studies/);
});
