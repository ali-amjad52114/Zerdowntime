import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CRYO_EM_SIZE_THRESHOLD_KDA,
  binVariants,
  normalizeTargetIdentity,
  resolveUniProtTarget,
  retrieveUniProtEntry,
  runTargetIdentity,
  summarizeTargetIdentity,
  validateTargetIdentityRecords,
} from '../src/axes/y/target-identity.mjs';

const CLOCK = () => new Date('2026-08-22T18:00:00.000Z');

async function fixture() {
  return JSON.parse(await readFile(new URL('../fixtures/xyz/y-target-uniprot-p01009.json', import.meta.url), 'utf8'));
}

test('normalizer produces one canonical Y record carrying the evidence contract', async () => {
  const records = normalizeTargetIdentity(await fixture(), { retrievedAt: '2026-08-22T18:00:00.000Z' });
  assert.equal(records.length, 1);
  const [record] = records;
  assert.equal(record.axis, 'Y');
  assert.equal(record.sub_axis, 'target_identity');
  assert.equal(record.value, 'P01009');
  assert.equal(record.source_url, 'https://www.uniprot.org/uniprotkb/P01009/entry');
  assert.equal(record.retrieved_at, '2026-08-22T18:00:00.000Z');
  assert.match(record.evidence, /UniProtKB entry P01009/);
  assert.equal(record.id.length, 16);
});

test('identity is read from the entry and never inferred', async () => {
  const [record] = normalizeTargetIdentity(await fixture());
  assert.equal(record.accession, 'P01009');
  assert.equal(record.protein_name, 'Alpha-1-antitrypsin');
  assert.equal(record.gene, 'SERPINA1');
  assert.equal(record.mass_dalton, 46737);
  assert.equal(record.sequence_length, 418);
  assert.deepEqual(record.subcellular_locations, ['Secreted']);
});

test('positional features keep their kind, span and description', async () => {
  const [record] = normalizeTargetIdentity(await fixture());
  const signal = record.features.find((feature) => feature.kind === 'signal');
  assert.deepEqual({ start: signal.start, end: signal.end }, { start: 1, end: 24 });
  assert.equal(record.features.filter((feature) => feature.kind === 'variant').length, 6);
  assert.equal(record.features.filter((feature) => feature.kind === 'site').length, 1);
  const z = record.features.find((feature) => feature.start === 366);
  assert.match(z.description, /PI Z/);
});

test('a feature with no start position is dropped rather than guessed', () => {
  const records = normalizeTargetIdentity({
    results: [{
      primaryAccession: 'P00000',
      proteinDescription: { recommendedName: { fullName: { value: 'Test protein' } } },
      sequence: { molWeight: 60000, length: 500 },
      features: [
        { type: 'Natural variant', location: { start: {}, end: { value: 40 } } },
        { type: 'Domain', location: { start: { value: 10 }, end: { value: 40 } } },
      ],
    }],
  });
  assert.equal(records[0].features.length, 1);
  assert.equal(records[0].features[0].kind, 'domain');
});

test('missing optional fields stay null instead of being filled in', () => {
  const [record] = normalizeTargetIdentity({
    results: [{
      primaryAccession: 'P00000',
      proteinDescription: { recommendedName: { fullName: { value: 'Test protein' } } },
      sequence: { length: 120 },
    }],
  });
  assert.equal(record.gene, null);
  assert.equal(record.mass_dalton, null);
  assert.deepEqual(record.subcellular_locations, []);
  assert.deepEqual(record.topology, []);
});

test('an empty source response is an error, not an empty summary', () => {
  assert.throws(() => normalizeTargetIdentity({ results: [] }), /returned no entries/);
  assert.throws(() => normalizeTargetIdentity({}), /returned no entries/);
});

test('validation rejects records missing identity or evidence', () => {
  assert.throws(() => validateTargetIdentityRecords([]), /at least one UniProt record/);
  assert.throws(
    () => validateTargetIdentityRecords([{ axis: 'Y', accession: 'P01009', source_url: 'x', evidence: 'y', sequence_length: 10 }]),
    /protein name is required/,
  );
  assert.throws(
    () => validateTargetIdentityRecords([{
      axis: 'Y', accession: 'P01009', protein_name: 'x', source_url: 'x', evidence: 'y',
      sequence_length: 10, features: [{ kind: 'variant', start: 4, end: 40 }],
    }]),
    /ends past the sequence/,
  );
});

test('variants bin into fixed windows so clustering is visible', () => {
  const hotspots = binVariants([
    { kind: 'variant', start: 3, end: 3 },
    { kind: 'variant', start: 11, end: 11 },
    { kind: 'variant', start: 44, end: 44 },
    { kind: 'domain', start: 12, end: 90 },
  ]);
  assert.deepEqual(hotspots, [{ start: 0, count: 2 }, { start: 40, count: 1 }]);
});

test('summary reports mass against the cryo-EM size threshold without concluding a modality', async () => {
  const records = normalizeTargetIdentity(await fixture());
  const summary = summarizeTargetIdentity(records);
  assert.equal(summary.mass_kilodalton, 46.7);
  assert.equal(summary.cryo_em_size_threshold_kda, CRYO_EM_SIZE_THRESHOLD_KDA);
  assert.equal(summary.mass_below_cryo_em_threshold, true);
  assert.match(summary.cryo_em_size_note, /rule of thumb/);
  assert.equal(summary.modality_conclusion, null);
  assert.equal(summary.secreted, true);
  assert.equal(summary.membrane, false);
  assert.equal(summary.variants_annotated, 6);
});

test('mass comparison stays null when the entry reports no mass', () => {
  const summary = summarizeTargetIdentity(normalizeTargetIdentity({
    results: [{
      primaryAccession: 'P00000',
      proteinDescription: { recommendedName: { fullName: { value: 'Test protein' } } },
      sequence: { length: 120 },
    }],
  }));
  assert.equal(summary.mass_kilodalton, null);
  assert.equal(summary.mass_below_cryo_em_threshold, null);
  assert.match(summary.cryo_em_size_note, /No reported mass/);
});

test('runner is deterministic under an injected clock and retrieval', async () => {
  const payload = await fixture();
  const result = await runTargetIdentity({ retrieve: async () => payload, clock: CLOCK });
  assert.equal(result.axis, 'Y');
  assert.equal(result.sub_axis, 'target_identity');
  assert.equal(result.validation.status, 'PASS');
  assert.equal(result.records[0].retrieved_at, '2026-08-22T18:00:00.000Z');
  assert.equal(result.records[0].subject, 'SERPINA1 / Alpha-1 Antitrypsin Deficiency');
  const again = await runTargetIdentity({ retrieve: async () => payload, clock: CLOCK });
  assert.deepEqual(again.records, result.records);
});

test('runner rejects an invalid retrieval contract', async () => {
  await assert.rejects(() => runTargetIdentity({}), /injected retrieval function/);
  await assert.rejects(() => runTargetIdentity({ retrieve: async () => null }), /must return a UniProt payload/);
});

test('live retrieval requires an injected fetch and surfaces transport failures', async () => {
  await assert.rejects(() => retrieveUniProtEntry({ fetchImpl: null }), /fetchImpl is required/);
  await assert.rejects(
    () => retrieveUniProtEntry({ fetchImpl: async () => ({ ok: false, status: 503 }) }),
    /HTTP 503/,
  );
  let requested = null;
  await retrieveUniProtEntry({
    fetchImpl: async (url) => { requested = url; return { ok: true, json: async () => ({ results: [] }) }; },
  });
  assert.match(requested, /accession%3AP01009/);
  assert.match(requested, /cc_subcellular_location/);
});

test('resolves an arbitrary discovered gene to an exact reviewed human UniProt entry', async () => {
  let requested;
  const resolved = await resolveUniProtTarget({
    target: 'EGFR',
    fetchImpl: async (url) => {
      requested = url;
      return {
        ok: true,
        json: async () => ({ results: [{
          primaryAccession: 'P00533',
          genes: [{ geneName: { value: 'EGFR' } }],
          proteinDescription: { recommendedName: { fullName: { value: 'Epidermal growth factor receptor' } } },
        }] }),
      };
    },
  });
  assert.equal(resolved.accession, 'P00533');
  assert.equal(resolved.match, 'exact_gene');
  assert.match(requested, /organism_id%3A9606/);
  assert.match(requested, /reviewed%3Atrue/);
});

test('accepts a UniProt accession without a network resolution call', async () => {
  let calls = 0;
  const resolved = await resolveUniProtTarget({ target: 'P00533', fetchImpl: async () => { calls += 1; } });
  assert.equal(resolved.accession, 'P00533');
  assert.equal(resolved.match, 'accession');
  assert.equal(calls, 0);
});
