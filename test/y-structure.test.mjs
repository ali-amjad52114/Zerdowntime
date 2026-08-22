import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  downloadStructure,
  fallbackAlphafold,
  normalizeRcsbStructures,
  rankBestStructure,
  retrieveRcsbStructures,
  runYAxis,
  summarizeStructureRecords,
  validateStructureRecords,
} from '../src/axes/y/structure.mjs';

const fixtureUrl = new URL('../fixtures/xyz/y-structure-rcsb.json', import.meta.url);
const loadedFixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
const retrievedAt = '2026-08-22T18:00:00.000Z';

test('Y axis normalizes RCSB entries to canonical evidence without inferring disease relevance', () => {
  const records = normalizeRcsbStructures(loadedFixture, { retrievedAt });
  assert.equal(records.length, 3);
  assert.deepEqual(records[0], {
    axis: 'Y',
    subject: 'SERPINA1 / Alpha-1 antitrypsin',
    value: '1QLP',
    source_url: 'https://www.rcsb.org/structure/1QLP',
    retrieved_at: retrievedAt,
    evidence: 'RCSB PDB entry 1QLP, reports experimental method X-RAY DIFFRACTION, at 2 Å resolution, titled “Structure of alpha-1-antitrypsin”.',
    structure_id: '1QLP',
    target: 'SERPINA1 / Alpha-1 antitrypsin',
    experimental_method: 'X-RAY DIFFRACTION',
    resolution_angstrom: 2,
    organisms: ['Homo sapiens'],
    ligands: [],
    sample_state_description: 'Structure of alpha-1-antitrypsin',
    disease_relevance: null,
  });
  assert.equal(records[1].ligands[0].id, 'GOL');
  assert.ok(records.every((record) => record.disease_relevance === null));
});

test('Y axis summary reports count, method mix, and best available resolution', () => {
  const records = normalizeRcsbStructures(loadedFixture, { retrievedAt });
  assert.deepEqual(summarizeStructureRecords(records), {
    experimental_structures: 3,
    methods: { 'X-RAY DIFFRACTION': 3 },
    cryo_em_structures: 0,
    best_resolution_angstrom: 1.83,
    disease_relevance: null,
    disease_relevance_note: 'Not inferred from target identity or structure availability.',
  });
});

test('Y axis validator reports invalid identifiers, methods, resolutions, and sources', () => {
  const [validRecord] = normalizeRcsbStructures(loadedFixture, { retrievedAt });
  assert.equal(validateStructureRecords([validRecord]).valid, true);

  const validation = validateStructureRecords([{ ...validRecord,
    structure_id: 'bad-id',
    experimental_method: null,
    resolution_angstrom: -1,
    source_url: 'https://example.com/not-rcsb',
    evidence: '',
  }]);
  assert.equal(validation.valid, false);
  assert.deepEqual(validation.errors.map((error) => error.field), [
    'structure_id', 'experimental_method', 'resolution_angstrom', 'source_url', 'evidence',
  ]);
  assert.equal(validateStructureRecords([]).valid, false);
});

test('Y axis runner exposes the shared orchestration contract for fixture execution', async () => {
  const result = await runYAxis({ fixture: loadedFixture, retrievedAt });
  assert.equal(result.axis, 'Y');
  assert.equal(result.records.length, 3);
  assert.equal(result.summary.best_resolution_angstrom, 1.83);
  assert.deepEqual(result.validation, { valid: true, record_count: 3, errors: [] });
});

test('RCSB retrieval is bounded and supports an injected fetch implementation', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (calls.length === 1) return { ok: true, status: 200, json: async () => ({
      result_set: [{ identifier: '1qlp' }, { identifier: '1QLP' }, { identifier: '7API' }],
    }) };
    return { ok: true, status: 200, json: async () => loadedFixture };
  };

  const result = await retrieveRcsbStructures({ fetchImpl, maxEntries: 2 });
  assert.equal(result, loadedFixture);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.request_options.paginate.rows, 2);
  assert.deepEqual(calls[1].body.variables.ids, ['1QLP', '7API']);
  await assert.rejects(() => retrieveRcsbStructures({ fetchImpl, maxEntries: 101 }), /between 1 and 100/);
});

test('rankBestStructure selects the ligand-bearing 1.83 Å fixture entry over 1QLP', () => {
  const records = normalizeRcsbStructures(loadedFixture, { retrievedAt });
  const winner = rankBestStructure(records);
  assert.equal(winner.structure_id, '7NPK');
  assert.equal(winner.resolution_angstrom, 1.83);
  assert.equal(winner.ligands[0].id, 'CMPD3');
  assert.ok(records.find((record) => record.structure_id === '7API').ligands[0].id === 'GOL');
  assert.equal(rankBestStructure([]), null);
});

test('rankBestStructure prefers experimental, ligand-bound, then better resolution', () => {
  const experimentalUnbound = {
    structure_id: '1AAA',
    experimental_method: 'X-RAY DIFFRACTION',
    resolution_angstrom: 1.2,
    ligands: [],
  };
  const predictedBound = {
    structure_id: 'AF01',
    experimental_method: null,
    resolution_angstrom: 1.0,
    ligands: [{ id: 'GOL', name: 'GLYCEROL' }],
  };
  const experimentalBoundWorse = {
    structure_id: '1BBB',
    experimental_method: 'X-RAY DIFFRACTION',
    resolution_angstrom: 2.5,
    ligands: [{ id: 'GOL', name: 'GLYCEROL' }],
  };
  const experimentalBoundNullRes = {
    structure_id: '1CCC',
    experimental_method: 'X-RAY DIFFRACTION',
    resolution_angstrom: null,
    ligands: [{ id: 'GOL', name: 'GLYCEROL' }],
    released_at: '2024-01-01',
  };
  const experimentalBoundNewer = {
    structure_id: '1DDD',
    experimental_method: 'X-RAY DIFFRACTION',
    resolution_angstrom: 2.5,
    ligands: [{ id: 'GOL', name: 'GLYCEROL' }],
    released_at: '2025-06-01',
  };

  assert.equal(rankBestStructure([predictedBound, experimentalUnbound]).structure_id, '1AAA');
  assert.equal(rankBestStructure([experimentalUnbound, experimentalBoundWorse]).structure_id, '1BBB');
  assert.equal(rankBestStructure([experimentalBoundNullRes, experimentalBoundWorse]).structure_id, '1BBB');
  assert.equal(rankBestStructure([experimentalBoundWorse, experimentalBoundNewer]).structure_id, '1DDD');
});

test('downloadStructure writes RCSB coordinates through an injected fetch implementation', async () => {
  const dest = join(tmpdir(), `y-structure-${process.pid}.pdb`);
  const body = 'HEADER    TEST PDB';
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, text: async () => body };
  };

  try {
    const result = await downloadStructure({ pdbId: '1qlp', dest, fetchImpl });
    assert.deepEqual(calls, ['https://files.rcsb.org/download/1QLP.pdb']);
    assert.deepEqual(result, { pdbId: '1QLP', dest, bytes: Buffer.byteLength(body) });
    assert.equal(await readFile(dest, 'utf8'), body);
    await assert.rejects(() => downloadStructure({ pdbId: '1QLP', dest }), /fetchImpl is required/);
  } finally {
    await rm(dest, { force: true });
  }
});

test('fallbackAlphafold returns AlphaFold metadata and optionally checks the model URL', async () => {
  const expected = {
    source: 'alphafold',
    pdb_id: 'AF-P01009-F1',
    uniprot_id: 'P01009',
    structure_download_url: 'https://alphafold.ebi.ac.uk/files/AF-P01009-F1-model_v4.pdb',
    method: 'AlphaFold prediction',
    resolution: null,
    has_ligand: false,
  };
  assert.deepEqual(await fallbackAlphafold({ uniprotId: 'P01009' }), expected);

  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, method: options?.method });
    return { ok: true, status: 200 };
  };
  assert.deepEqual(await fallbackAlphafold({ uniprotId: 'P01009', fetchImpl }), expected);
  assert.deepEqual(calls, [{
    url: 'https://alphafold.ebi.ac.uk/files/AF-P01009-F1-model_v4.pdb',
    method: 'HEAD',
  }]);
  await assert.rejects(() => fallbackAlphafold({
    uniprotId: 'P01009',
    fetchImpl: async () => ({ ok: false, status: 404 }),
  }), /AlphaFold structure failed with HTTP 404/);
});
