import assert from 'node:assert/strict';
import test from 'node:test';
import { COSTS, MODALITIES, costFor, modalityFor, modalityMix } from '../src/mend/reference-tables.mjs';

test('every curated row carries a basis and a source URL', () => {
  for (const row of COSTS) {
    assert.ok(row.basis, `${row.label} needs a basis`);
    assert.match(row.source_url, /^https:\/\//);
  }
  for (const row of MODALITIES) {
    assert.ok(row.cmc_notes, `${row.name} needs CMC notes`);
    assert.match(row.source_url, /^https:\/\//);
  }
});

test('the incumbent cost for AATD is returned with its curated label', () => {
  const answer = costFor('Alpha-1 Antitrypsin Deficiency');
  assert.equal(answer.found, true);
  assert.equal(answer.curated, true);
  assert.deepEqual(answer.annual_usd, [100000, 200000]);
  assert.equal(answer.annual_usd_display, '$100k–200k per patient per year');
  assert.match(answer.source_url, /ncbi\.nlm\.nih\.gov/);
});

test('a disease with no curated row says so rather than guessing', () => {
  const answer = costFor('Some other disease');
  assert.equal(answer.found, false);
  assert.equal(answer.curated, true);
  assert.match(answer.message, /No curated cost reference/);
  assert.equal(answer.annual_usd, undefined);
});

test('modality is matched from reported mechanism text', () => {
  assert.equal(modalityFor('SERPINA1 RNA silencing').name, 'Oligonucleotide (siRNA / ASO)');
  assert.equal(modalityFor('SERPINA1 base editing').name, 'Gene editing (base / prime / CRISPR)');
  assert.equal(modalityFor('AAT augmentation').name, 'Recombinant protein or peptide');
  assert.equal(modalityFor('Oral small molecule chaperone').name, 'Small molecule');
  assert.equal(modalityFor(''), null);
  assert.equal(modalityFor(null), null);
});

test('a mechanism that names no modality is left unmatched rather than assumed', () => {
  // "inhibition" says what the drug does, not what it is made of — alpha-1 antitrypsin is
  // itself an elastase inhibitor, so the mechanism alone cannot decide the modality.
  assert.equal(modalityFor('Neutrophil elastase inhibition'), null);
  assert.equal(modalityFor('AAT folding corrector'), null);
  assert.equal(modalityFor('Mutant AAT reduction'), null);
});

test('an unmatched mechanism is listed, never assigned a modality', () => {
  const mix = modalityMix(['SERPINA1 RNA silencing', 'Mutant AAT reduction', 'SERPINA1 RNA silencing']);
  assert.equal(mix.mix.length, 1);
  assert.equal(mix.mix[0].count, 2);
  assert.deepEqual(mix.unmatched, ['Mutant AAT reduction']);
  assert.equal(mix.curated, true);
  assert.match(mix.match_note, /never assigned/);
});

test('the mix is ordered by count and deterministic', () => {
  const first = modalityMix(['AAT augmentation', 'SERPINA1 base editing', 'SERPINA1 gene correction']);
  const second = modalityMix(['SERPINA1 gene correction', 'SERPINA1 base editing', 'AAT augmentation']);
  assert.deepEqual(first.mix.map((entry) => entry.modality.name), second.mix.map((entry) => entry.modality.name));
  assert.equal(first.mix[0].count, 2);
});
