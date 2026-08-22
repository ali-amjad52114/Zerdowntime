import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  EXCLUSIVITY_TERMS,
  VOUCHER_MARKET,
  assertNoUnsupportedRegulatoryClaim,
  describeClock,
  describeVoucherPosition,
  normalizeOrphanRecords,
  runOrphanExclusivity,
  summarizeOrphanExclusivity,
  validateOrphanRecords,
} from '../src/axes/z/orphan-exclusivity.mjs';

const fixtureUrl = new URL('../fixtures/xyz/z-orphan-serpina1.json', import.meta.url);
const fixedNow = new Date('2026-08-22T12:00:00.000Z');

async function fixtureRetrieve(query) {
  assert.deepEqual(query, { disease: 'Alpha-1 Antitrypsin Deficiency', target: 'SERPINA1' });
  return JSON.parse(await readFile(fixtureUrl, 'utf8'));
}

test('runOrphanExclusivity retrieves, normalizes, validates, and summarizes fixture designations', async () => {
  const result = await runOrphanExclusivity({
    retrieve: fixtureRetrieve,
    sourceName: 'fixture-orphan-register',
    clock: () => fixedNow,
  });

  assert.equal(result.axis, 'Z');
  assert.equal(result.sub_axis, 'orphan_exclusivity');
  assert.equal(result.validation.status, 'PASS');
  assert.equal(result.records.length, 4);
  assert.deepEqual(result.summary.agencies, ['EMA', 'FDA']);
  assert.equal(result.summary.designations, 4);
  assert.equal(result.summary.approvals_on_record, 2);
  assert.equal(result.records[0].subject, 'SERPINA1 / Alpha-1 Antitrypsin Deficiency');
  assert.equal(result.records[0].retrieved_at, fixedNow.toISOString());
});

test('years since designation is reported for every record, approved or not', async () => {
  const { summary } = await runOrphanExclusivity({ retrieve: fixtureRetrieve, clock: () => fixedNow });
  const byDesignation = Object.fromEntries(summary.clocks.map((c) => [c.designation, c]));

  assert.equal(byDesignation['Example AAT corrector (fixture)'].years_since_designation, 4.4);
  assert.equal(byDesignation['Example AAT augmentation (fixture)'].years_since_designation, 7.2);
  assert.equal(byDesignation['Example AAT gene therapy (fixture)'].years_since_designation, 14.9);
  assert.equal(summary.oldest_designation_years, 22.6);
  assert.equal(summary.newest_designation_years, 4.4);
});

test('the exclusivity clock only starts on approval and reports what is left', async () => {
  const { summary } = await runOrphanExclusivity({ retrieve: fixtureRetrieve, clock: () => fixedNow });
  const byDesignation = Object.fromEntries(summary.clocks.map((c) => [c.designation, c]));

  const designatedOnly = byDesignation['Example AAT corrector (fixture)'];
  assert.equal(designatedOnly.exclusivity_state, 'not started — no approval on record');
  assert.equal(designatedOnly.exclusivity_ends, null);
  assert.equal(designatedOnly.exclusivity_years_remaining, null);

  const running = byDesignation['Example AAT augmentation (fixture)'];
  assert.equal(running.exclusivity_state, 'running');
  assert.equal(running.exclusivity_term_years, EXCLUSIVITY_TERMS.FDA.years);
  assert.equal(running.exclusivity_ends, '2030-02-15');
  assert.equal(running.exclusivity_years_remaining, 3.5);

  const expired = byDesignation['Example legacy AAT product (fixture)'];
  assert.equal(expired.exclusivity_state, 'expired');
  assert.equal(expired.exclusivity_ends, '2014-03-05');
  assert.equal(expired.exclusivity_years_remaining, 0);

  assert.equal(summary.exclusivity_running, 1);
  assert.equal(summary.longest_exclusivity_years_remaining, 3.5);
});

test('EMA designations use the ten-year term rather than the FDA seven', () => {
  const [record] = normalizeOrphanRecords([{
    agency: 'EMA',
    designation: 'Example EU product',
    designated_on: '2020-01-01',
    approved_on: '2024-01-01',
    source_url: 'https://register.example.invalid/ema/1',
    evidence: 'Fixture EU designation.',
  }], { retrievedAt: fixedNow.toISOString() });

  const clock = describeClock(record, fixedNow);
  assert.equal(clock.exclusivity_term_years, 10);
  assert.equal(clock.exclusivity_ends, '2034-01-01');
  assert.equal(clock.exclusivity_state, 'running');
});

test('an old designation with no approval is flagged as stalled', async () => {
  const { summary } = await runOrphanExclusivity({ retrieve: fixtureRetrieve, clock: () => fixedNow });
  const stalled = summary.clocks.filter((c) => c.stalled);
  assert.equal(stalled.length, 1);
  assert.equal(stalled[0].designation, 'Example AAT gene therapy (fixture)');
  assert.equal(summary.stalled_designations, 1);
});

test('voucher position reports the event, the bands, and the authorisation caveat', async () => {
  const { summary } = await runOrphanExclusivity({ retrieve: fixtureRetrieve, clock: () => fixedNow });
  const v = summary.voucher;

  assert.equal(v.paediatric_designation_present, true);
  assert.equal(v.approved_paediatric_designation_present, true);
  assert.match(v.voucher_signal, /voucher attaches to/);
  assert.equal(v.planning_midpoint_usd_millions, 100);
  assert.equal(v.reported_value_bands.length, 4);
  assert.equal(v.reported_value_bands[0].usd_millions, 67.5);
  assert.equal(v.reported_value_bands[1].usd_millions, 350);
  assert.equal(v.curated, true);
  assert.match(v.disclaimer, /not a quote/);
  assert.ok(v.programs.some((p) => /authorisation status/i.test(p.authorisation_note)));
});

test('a paediatric designation without approval reports no voucher event', () => {
  const records = normalizeOrphanRecords([{
    agency: 'FDA',
    designation: 'Example paediatric product',
    designated_on: '2024-01-01',
    paediatric: true,
    source_url: 'https://register.example.invalid/fda/2',
    evidence: 'Fixture paediatric designation, no approval.',
  }], { retrievedAt: fixedNow.toISOString() });

  const v = describeVoucherPosition(records);
  assert.equal(v.paediatric_designation_present, true);
  assert.equal(v.approved_paediatric_designation_present, false);
  assert.match(v.voucher_signal, /no approval yet/);
});

test('normalizer accepts common register field aliases behind the adapter boundary', () => {
  const [record] = normalizeOrphanRecords([{
    authority: 'fda',
    designatedDrug: 'Example Aliased Product',
    company: 'Example Sponsor',
    designationDate: '2021-05-04',
    approvalDate: '2025-05-04',
    designatedIndication: 'Alpha-1 antitrypsin deficiency',
    url: 'https://register.example.invalid/fda/3',
    snippet: 'Aliased fixture record.',
  }], { retrievedAt: fixedNow.toISOString() });

  assert.equal(record.agency, 'FDA');
  assert.equal(record.designation, 'Example Aliased Product');
  assert.equal(record.sponsor, 'Example Sponsor');
  assert.equal(record.designated_on, '2021-05-04');
  assert.equal(record.approved_on, '2025-05-04');
  assert.equal(record.sub_axis, 'orphan_exclusivity');
});

test('validation rejects a missing designation date, an unknown agency, and approval before designation', () => {
  const missingDate = normalizeOrphanRecords([{
    agency: 'FDA', designation: 'X', source_url: 'https://e.invalid/1', evidence: 'e',
  }], { retrievedAt: fixedNow.toISOString() });
  assert.throws(() => validateOrphanRecords(missingDate), /designation date is required/);

  const badAgency = normalizeOrphanRecords([{
    agency: 'MHRA', designation: 'X', designated_on: '2020-01-01', source_url: 'https://e.invalid/2', evidence: 'e',
  }], { retrievedAt: fixedNow.toISOString() });
  assert.throws(() => validateOrphanRecords(badAgency), /agency must be FDA or EMA/);

  const inverted = normalizeOrphanRecords([{
    agency: 'FDA', designation: 'X', designated_on: '2020-01-01', approved_on: '2019-01-01',
    source_url: 'https://e.invalid/3', evidence: 'e',
  }], { retrievedAt: fixedNow.toISOString() });
  assert.throws(() => validateOrphanRecords(inverted), /approval precedes designation/);
});

test('unsupported regulatory conclusions are refused, matching the Z axis FTO guardrail', () => {
  assert.throws(
    () => assertNoUnsupportedRegulatoryClaim({ note: 'exclusivity will be granted on filing' }),
    /unsupported regulatory conclusion/,
  );
  assert.throws(
    () => assertNoUnsupportedRegulatoryClaim({ note: 'this designation blocks all competitors' }),
    /unsupported regulatory conclusion/,
  );
  assert.doesNotThrow(() => assertNoUnsupportedRegulatoryClaim({ note: 'seven-year term runs from approval' }));
});

test('summary carries no regulatory conclusion and states the statutory terms it applied', async () => {
  const { summary } = await runOrphanExclusivity({ retrieve: fixtureRetrieve, clock: () => fixedNow });
  assert.equal(summary.regulatory_conclusion, null);
  assert.match(summary.disclaimer, /Designation is not approval/);
  assert.equal(summary.exclusivity_terms.FDA.years, 7);
  assert.equal(summary.exclusivity_terms.EMA.years, 10);
  assert.match(summary.exclusivity_terms.FDA.note, /does not run from designation/);
  assert.equal(VOUCHER_MARKET.verify_before_relying, true);
});

test('an empty register response fails loudly rather than returning an empty summary', async () => {
  await assert.rejects(
    () => runOrphanExclusivity({ retrieve: async () => ({ records: [] }), clock: () => fixedNow }),
    /returned no records/,
  );
});
