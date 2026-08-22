import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
export const STRUCTURE_CACHE_DIR = join(ROOT, 'data', 'structures');
export const P2RANK_CACHE_DIR = join(ROOT, 'data', 'p2rank');

const SELECTION_RULES = [
  'experimental > predicted',
  'ligand-bound > unbound',
  'better resolution',
  'newer entry',
];

export function resolveStructurePath(pdbId) {
  return join(STRUCTURE_CACHE_DIR, `${String(pdbId)}.pdb`);
}

async function loadStructureApi() {
  return import('./structure.mjs');
}

function cacheGet(cache, ...keys) {
  if (!cache) return undefined;
  for (const key of keys) {
    if (key == null || key === '') continue;
    if (cache.has(key)) return cache.get(key);
    const upper = String(key).toUpperCase();
    if (cache.has(upper)) return cache.get(upper);
  }
  return undefined;
}

export function cacheAnalysis(cache, result) {
  if (!cache || !result) return result;
  for (const key of [result.structure?.pdb_id, result.uniprot_id]) {
    if (!key) continue;
    cache.set(key, result);
    cache.set(String(key).toUpperCase(), result);
  }
  return result;
}

function ligandIds(record) {
  return (record?.ligands ?? [])
    .map((ligand) => (typeof ligand === 'string' ? ligand : ligand?.id ?? ligand?.comp_id))
    .filter(Boolean)
    .map(String);
}

function toStructureContract(record, source) {
  if (!record) throw new Error('no structure available for target');
  const pdbId = String(record.pdb_id ?? record.structure_id ?? record.pdbId ?? '').trim();
  if (!pdbId) throw new Error('structure is missing pdb_id');
  const ligands = ligandIds(record);
  const resolvedSource = record.source === 'alphafold' || source === 'alphafold' ? 'alphafold' : 'experimental';
  return {
    pdb_id: pdbId,
    source: resolvedSource,
    method: record.method ?? record.experimental_method ?? (resolvedSource === 'alphafold' ? 'AlphaFold' : null),
    resolution: record.resolution ?? record.resolution_angstrom ?? null,
    released: record.released ?? record.release_date ?? record.released_at ?? null,
    has_ligand: record.has_ligand ?? ligands.length > 0,
    chains: Array.isArray(record.chains) && record.chains.length ? record.chains.map(String) : ['A'],
    ligands,
    structure_url: `/target/${pdbId}/structure`,
    selection_rules: SELECTION_RULES,
  };
}

function normalizeResidue(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const colon = text.match(/^([A-Za-z0-9]+):(-?\d+[A-Za-z]?)$/);
  if (colon) return `${colon[1].toUpperCase()}:${colon[2]}`;
  const underscored = text.match(/^([A-Za-z0-9]+)[_.](-?\d+[A-Za-z]?)$/);
  if (underscored) return `${underscored[1].toUpperCase()}:${underscored[2]}`;
  return null;
}

function parseResidueIds(raw) {
  if (Array.isArray(raw)) return raw.map(normalizeResidue).filter(Boolean);
  if (raw == null || raw === '') return [];
  return String(raw).trim().split(/[\s,;]+/).map(normalizeResidue).filter(Boolean);
}

function splitCsvLine(line) {
  const columns = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      columns.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  columns.push(current);
  return columns;
}

export function parseP2RankPredictionsCsv(csv) {
  const lines = String(csv ?? '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  const rankIdx = headers.indexOf('rank');
  const scoreIdx = headers.indexOf('score');
  const probabilityIdx = headers.indexOf('probability');
  const residueIdx = headers.indexOf('residue_ids');
  return lines.slice(1).map((line, index) => {
    const columns = splitCsvLine(line);
    const residueField = residueIdx >= 0 ? columns.slice(residueIdx).join(' ') : '';
    return {
      rank: Number(rankIdx >= 0 ? columns[rankIdx] : index + 1),
      score: Number(scoreIdx >= 0 ? columns[scoreIdx] : NaN),
      probability: Number(probabilityIdx >= 0 ? columns[probabilityIdx] : NaN),
      residues: parseResidueIds(residueField),
    };
  }).sort((left, right) => left.rank - right.rank).slice(0, 3);
}

function normalizePocket(pocket, index = 0) {
  return {
    rank: Number(pocket.rank ?? index + 1),
    score: Number(pocket.score),
    probability: Number(pocket.probability),
    residues: parseResidueIds(pocket.residues ?? pocket.residue_ids),
  };
}

function takeTopPockets(pockets) {
  return (pockets ?? []).map(normalizePocket).sort((left, right) => left.rank - right.rank).slice(0, 3);
}

async function findPredictionsCsv(roots) {
  for (const root of roots) {
    const found = await walkForPredictionsCsv(root, 0);
    if (found) return found;
  }
  return null;
}

async function walkForPredictionsCsv(dir, depth) {
  if (depth > 3) return null;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('_predictions.csv')) return join(dir, entry.name);
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = await walkForPredictionsCsv(join(dir, entry.name), depth + 1);
    if (found) return found;
  }
  return null;
}

async function tryPrankPredict(structurePath) {
  await mkdir(P2RANK_CACHE_DIR, { recursive: true });
  try {
    await execFileAsync('prank', ['predict', '-f', structurePath, '-o', P2RANK_CACHE_DIR], {
      timeout: 20_000,
      windowsHide: true,
    });
  } catch (error) {
    return { pockets: [], error: `P2Rank unavailable: ${error.message}` };
  }
  const csvPath = await findPredictionsCsv([P2RANK_CACHE_DIR, `${structurePath}_out`]);
  if (!csvPath) return { pockets: [], error: 'P2Rank completed without a predictions CSV' };
  return { pockets: parseP2RankPredictionsCsv(await readFile(csvPath, 'utf8')), error: null };
}

async function runPockets({ dest, prankImpl }) {
  if (typeof prankImpl === 'function') {
    let output;
    try {
      output = await prankImpl({ dest, structurePath: dest });
    } catch (error) {
      return { pockets: [], pockets_source: 'unavailable', pockets_error: `P2Rank unavailable: ${error.message}` };
    }
    if (typeof output === 'string') {
      return { pockets: parseP2RankPredictionsCsv(output), pockets_source: 'p2rank' };
    }
    if (output?.pockets_source === 'fixture') {
      return { pockets: takeTopPockets(output.pockets), pockets_source: 'fixture', pockets_error: null };
    }
    if (Array.isArray(output)) return { pockets: takeTopPockets(output), pockets_source: 'p2rank' };
    if (Array.isArray(output?.pockets)) return { pockets: takeTopPockets(output.pockets), pockets_source: 'p2rank' };
    if (output?.csv) return { pockets: parseP2RankPredictionsCsv(output.csv), pockets_source: 'p2rank' };
  }
  const predicted = await tryPrankPredict(dest);
  if (predicted.pockets.length) return { pockets: predicted.pockets, pockets_source: 'p2rank', pockets_error: null };
  return { pockets: [], pockets_source: 'unavailable', pockets_error: predicted.error };
}

/**
 * Retrieve, rank, download, and pocket-score a selected target structure.
 * Structure helpers are loaded from ./structure.mjs (Agent A contract).
 */
export async function analyzeTarget({
  target,
  uniprot_id,
  disease,
  fetchImpl = globalThis.fetch,
  prankImpl,
  cache,
} = {}) {
  const cached = cacheGet(cache, uniprot_id, target);
  if (cached) return cached;

  const {
    retrieveRcsbStructures,
    normalizeRcsbStructures,
    rankBestStructure,
    downloadStructure,
    downloadStructureFromUrl,
    fallbackAlphafold,
  } = await loadStructureApi();

  let resolvedUniProt = String(uniprot_id ?? '').trim();
  let identity_resolution = resolvedUniProt ? { accession: resolvedUniProt, match: 'provided' } : null;
  if (!resolvedUniProt && target) {
    const { resolveUniProtTarget } = await import('./target-identity.mjs');
    identity_resolution = await resolveUniProtTarget({ target, fetchImpl });
    resolvedUniProt = identity_resolution.accession;
  }

  let payload = { data: { entries: [] } };
  if (resolvedUniProt) {
    payload = await retrieveRcsbStructures({ accession: resolvedUniProt, fetchImpl });
  }
  const records = normalizeRcsbStructures(payload, { subject: target ?? uniprot_id });
  let best = rankBestStructure(records);
  let source = 'experimental';
  if (!best) {
    best = await fallbackAlphafold({ uniprotId: resolvedUniProt, fetchImpl });
    source = 'alphafold';
  }

  const structure = toStructureContract(best, source);
  const dest = resolveStructurePath(structure.pdb_id);
  await mkdir(STRUCTURE_CACHE_DIR, { recursive: true });
  if (source === 'alphafold') {
    await downloadStructureFromUrl({
      structureUrl: best.structure_download_url,
      structureId: structure.pdb_id,
      dest,
      fetchImpl,
    });
  } else {
    await downloadStructure({ pdbId: structure.pdb_id, dest, fetchImpl });
  }

  const { pockets, pockets_source, pockets_error = null } = await runPockets({ dest, prankImpl });
  const result = {
    target,
    uniprot_id: resolvedUniProt,
    disease,
    identity_resolution,
    structure,
    pockets,
    pockets_source,
    pockets_provenance: {
      engine: pockets_source === 'p2rank' ? 'P2Rank' : pockets_source,
      version: process.env.MEND_P2RANK_VERSION ?? null,
      structure_id: structure.pdb_id,
      generated_at: new Date().toISOString(),
    },
    pockets_error,
  };
  return cacheAnalysis(cache, result);
}
