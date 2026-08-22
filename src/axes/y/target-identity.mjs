import { createHash } from 'node:crypto';

/**
 * Y sub-axis — target identity from UniProtKB.
 *
 * The structure sub-axis answers "is there a model good enough to design against". This one
 * answers the questions that sit either side of it: what the protein is, how heavy it is,
 * where in the cell it is annotated, and where along the sequence the documented variants
 * fall. Mass drives whether single-particle cryo-EM is a realistic route; location decides
 * whether a biologic can physically reach the target; the variant distribution of a
 * misfolding disease is the mechanism rather than decoration.
 *
 * Same discipline as the other axes: this reports what the entry says. It does not conclude
 * that a modality will work, that a structure is obtainable, or that a variant is causal.
 *
 * The ~50 kDa single-particle threshold quoted in the summary is a methodological rule of
 * thumb, not a rule (Henderson, Q Rev Biophys 1995, on the theoretical size limit for
 * single-particle imaging). It is reported as a threshold comparison and labelled as one.
 */

const DEFAULT_ACCESSION = 'P01009';
const DEFAULT_SUBJECT = 'SERPINA1 / Alpha-1 Antitrypsin Deficiency';
const DEFAULT_ENDPOINT = 'https://rest.uniprot.org/uniprotkb/search';
const UNIPROT_FIELDS = [
  'accession', 'protein_name', 'gene_names', 'sequence',
  'ft_variant', 'ft_signal', 'ft_domain', 'ft_region', 'ft_site',
  'cc_subcellular_location',
].join(',');

/** Below roughly this mass, single-particle reconstruction gets hard. Reported, never concluded. */
export const CRYO_EM_SIZE_THRESHOLD_KDA = 50;

/** Variant windows for the sequence track. Twenty residues is coarse enough to show clustering. */
export const VARIANT_BIN_RESIDUES = 20;

const SECRETED = /secreted|extracellular/i;
const MEMBRANE = /membrane/i;

function text(value) {
  const normalized = value == null ? '' : String(value).trim();
  return normalized || null;
}

function positiveIntegerOrNull(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function featureKind(type) {
  const normalized = String(type ?? '').toLowerCase();
  if (normalized.includes('variant')) return 'variant';
  if (normalized.includes('signal')) return 'signal';
  if (normalized.includes('domain')) return 'domain';
  if (normalized.includes('region') || normalized.includes('repeat') || normalized.includes('coiled')) return 'region';
  if (normalized.includes('site')) return 'site';
  return 'other';
}

/**
 * Bounded UniProtKB lookup. fetchImpl is injected so the runner can serve a live entry or a
 * saved response with no change to anything downstream.
 */
export async function retrieveUniProtEntry({
  accession = DEFAULT_ACCESSION,
  fetchImpl = globalThis.fetch,
  endpoint = DEFAULT_ENDPOINT,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetchImpl is required');
  const query = `accession:${accession}`;
  const url = `${endpoint}?format=json&size=1&fields=${UNIPROT_FIELDS}&query=${encodeURIComponent(query)}`;
  const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
  if (!response?.ok) throw new Error(`UniProt lookup failed with HTTP ${response?.status ?? 'unknown'}`);
  return response.json();
}

/** Resolve a discovered target name to a reviewed human UniProt accession. */
export async function resolveUniProtTarget({
  target,
  fetchImpl = globalThis.fetch,
  endpoint = DEFAULT_ENDPOINT,
  maxCandidates = 5,
} = {}) {
  const normalizedTarget = text(target);
  if (!normalizedTarget) throw new Error('target is required for UniProt resolution');
  if (typeof fetchImpl !== 'function') throw new Error('fetchImpl is required');
  if (/^(?:[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9][A-Z][A-Z0-9]{2}[0-9])$/.test(normalizedTarget.toUpperCase())) {
    return { accession: normalizedTarget.toUpperCase(), target: normalizedTarget, match: 'accession', candidates: [] };
  }
  const size = Math.max(1, Math.min(Number.parseInt(maxCandidates, 10) || 5, 10));
  const escaped = normalizedTarget.replaceAll('"', '\\"');
  const query = `(gene_exact:${escaped} OR protein_name:"${escaped}") AND organism_id:9606 AND reviewed:true`;
  const fields = 'accession,gene_names,protein_name,reviewed,organism_id';
  const url = `${endpoint}?format=json&size=${size}&fields=${fields}&query=${encodeURIComponent(query)}`;
  const response = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  if (!response?.ok) throw new Error(`UniProt target resolution failed with HTTP ${response?.status ?? 'unknown'}`);
  const payload = await response.json();
  const candidates = (payload?.results ?? []).map((entry) => ({
    accession: text(entry?.primaryAccession),
    gene: text(entry?.genes?.[0]?.geneName?.value),
    protein_name: text(entry?.proteinDescription?.recommendedName?.fullName?.value),
  })).filter((entry) => entry.accession);
  const exactGene = candidates.find((entry) => entry.gene?.toUpperCase() === normalizedTarget.toUpperCase());
  const exactProtein = candidates.find((entry) => entry.protein_name?.toUpperCase() === normalizedTarget.toUpperCase());
  const selected = exactGene ?? exactProtein ?? candidates[0];
  if (!selected) throw new Error(`UniProt could not resolve target ${normalizedTarget}`);
  return {
    accession: selected.accession,
    target: normalizedTarget,
    match: exactGene ? 'exact_gene' : exactProtein ? 'exact_protein' : 'top_reviewed_human_result',
    candidates,
    request_url: url,
  };
}

/** Normalize a UniProtKB search response into one canonical Y evidence record. */
export function normalizeTargetIdentity(payload, {
  retrievedAt = new Date().toISOString(),
  subject = DEFAULT_SUBJECT,
  sourceName = 'UniProtKB',
} = {}) {
  const entries = payload?.results;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('UniProt source returned no entries');
  }

  return entries.map((entry) => {
    const accession = text(entry?.primaryAccession);
    const proteinName = text(entry?.proteinDescription?.recommendedName?.fullName?.value);
    const gene = text(entry?.genes?.[0]?.geneName?.value);
    const massDalton = positiveIntegerOrNull(entry?.sequence?.molWeight);
    const sequenceLength = positiveIntegerOrNull(entry?.sequence?.length);

    const features = (entry?.features ?? []).flatMap((feature) => {
      const start = positiveIntegerOrNull(feature?.location?.start?.value);
      if (start == null) return [];
      const end = positiveIntegerOrNull(feature?.location?.end?.value) ?? start;
      return [{
        type: text(feature?.type),
        kind: featureKind(feature?.type),
        start,
        end,
        description: text(feature?.description),
      }];
    });

    const locationComments = (entry?.comments ?? []).filter(
      (comment) => String(comment?.commentType ?? '').toUpperCase() === 'SUBCELLULAR LOCATION',
    );
    const locations = [...new Set(locationComments.flatMap(
      (comment) => (comment?.subcellularLocations ?? []).map((item) => text(item?.location?.value)).filter(Boolean),
    ))];
    const topology = [...new Set(locationComments.flatMap(
      (comment) => (comment?.texts ?? []).map((item) => text(item?.value)).filter(Boolean),
    ))];

    const sourceUrl = accession
      ? `https://www.uniprot.org/uniprotkb/${encodeURIComponent(accession)}/entry`
      : null;
    const id = createHash('sha256').update(`Y-TARGET\0${accession ?? ''}`).digest('hex').slice(0, 16);

    const evidenceParts = [
      `UniProtKB entry ${accession ?? 'unknown'}`,
      proteinName ? `describes ${proteinName}` : 'has no recommended name',
      gene ? `for gene ${gene}` : null,
      sequenceLength ? `over ${sequenceLength} residues` : null,
      massDalton ? `at ${massDalton} Da` : 'with no reported mass',
      locations.length ? `annotated in ${locations.join(', ')}` : 'with no annotated subcellular location',
    ].filter(Boolean);

    return {
      id,
      axis: 'Y',
      sub_axis: 'target_identity',
      subject,
      value: accession,
      source_url: sourceUrl,
      retrieved_at: retrievedAt,
      evidence: `${evidenceParts.join(', ')}.`,
      accession,
      protein_name: proteinName,
      gene,
      mass_dalton: massDalton,
      sequence_length: sequenceLength,
      subcellular_locations: locations,
      topology,
      features,
      source_name: text(payload?.source_name) ?? sourceName,
    };
  });
}

export function validateTargetIdentityRecords(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('target identity validation requires at least one UniProt record');
  }

  const issues = [];
  records.forEach((record, index) => {
    if (record?.axis !== 'Y') issues.push(`record ${index}: axis must be Y`);
    if (!text(record?.accession)) issues.push(`record ${index}: accession is required`);
    if (!text(record?.protein_name)) issues.push(`record ${index}: protein name is required`);
    if (!text(record?.source_url)) issues.push(`record ${index}: source URL is required`);
    if (!text(record?.evidence)) issues.push(`record ${index}: evidence is required`);
    if (record?.sequence_length == null) issues.push(`record ${index}: sequence length is required`);
    if (record?.mass_dalton != null && record.mass_dalton <= 0) {
      issues.push(`record ${index}: mass must be a positive number or null`);
    }
    for (const [featureIndex, feature] of (record?.features ?? []).entries()) {
      if (record?.sequence_length != null && feature.end > record.sequence_length) {
        issues.push(`record ${index}: feature ${featureIndex} ends past the sequence`);
      }
    }
  });

  if (issues.length) throw new Error(`Y target identity validation failed: ${issues.join('; ')}`);
  return { status: 'PASS', record_count: records.length, issues: [] };
}

/** Bin variants into fixed windows so the sequence track can show where they cluster. */
export function binVariants(features, { binSize = VARIANT_BIN_RESIDUES } = {}) {
  const bins = new Map();
  for (const feature of features ?? []) {
    if (feature.kind !== 'variant') continue;
    const start = Math.floor(feature.start / binSize) * binSize;
    bins.set(start, (bins.get(start) ?? 0) + 1);
  }
  return [...bins.entries()].map(([start, count]) => ({ start, count })).sort((a, b) => a.start - b.start);
}

export function summarizeTargetIdentity(records) {
  validateTargetIdentityRecords(records);
  const record = records[0];
  const locations = record.subcellular_locations ?? [];
  const joined = locations.join(' · ');
  const massKilodalton = record.mass_dalton == null ? null : Math.round((record.mass_dalton / 1000) * 10) / 10;
  const variants = (record.features ?? []).filter((feature) => feature.kind === 'variant');

  return {
    label: 'Y — TARGET IDENTITY',
    accession: record.accession,
    protein_name: record.protein_name,
    gene: record.gene,
    mass_dalton: record.mass_dalton,
    mass_kilodalton: massKilodalton,
    sequence_length: record.sequence_length,
    subcellular_locations: locations,
    topology: record.topology ?? [],
    secreted: SECRETED.test(joined),
    membrane: MEMBRANE.test(joined),
    cryo_em_size_threshold_kda: CRYO_EM_SIZE_THRESHOLD_KDA,
    mass_below_cryo_em_threshold: massKilodalton == null ? null : massKilodalton < CRYO_EM_SIZE_THRESHOLD_KDA,
    cryo_em_size_note: massKilodalton == null
      ? 'No reported mass, so no comparison against the single-particle size threshold.'
      : massKilodalton < CRYO_EM_SIZE_THRESHOLD_KDA
        ? `Reported mass ${massKilodalton} kDa sits below the ~${CRYO_EM_SIZE_THRESHOLD_KDA} kDa rule of thumb for single-particle cryo-EM, so an existing crystal structure carries more weight here than the prospect of a new EM map.`
        : `Reported mass ${massKilodalton} kDa sits above the ~${CRYO_EM_SIZE_THRESHOLD_KDA} kDa rule of thumb for single-particle cryo-EM.`,
    variants_annotated: variants.length,
    variant_hotspots: binVariants(record.features),
    variant_bin_residues: VARIANT_BIN_RESIDUES,
    features: record.features ?? [],
    evidence_record_ids: records.map((item) => item.id),
    analysis_scope: 'Identity, mass, annotated subcellular location and positional features as reported by the source entry.',
    modality_conclusion: null,
    disclaimer: 'Entry facts and threshold comparisons only. Reachability and modality choice are design decisions, not readings of this entry.',
  };
}

/** Source-agnostic runner. Inject a live UniProt client or a saved response reader. */
export async function runTargetIdentity({
  retrieve,
  query = { accession: DEFAULT_ACCESSION, target: 'SERPINA1', disease: 'Alpha-1 Antitrypsin Deficiency' },
  sourceName,
  clock = () => new Date(),
} = {}) {
  if (typeof retrieve !== 'function') throw new TypeError('target identity requires an injected retrieval function');
  const payload = await retrieve(query);
  if (!payload || typeof payload !== 'object') throw new Error('target identity retrieval must return a UniProt payload');
  const now = clock();
  const records = normalizeTargetIdentity(payload, {
    retrievedAt: now.toISOString(),
    subject: `${query.target} / ${query.disease}`,
    sourceName,
  });
  const validation = validateTargetIdentityRecords(records);
  const summary = summarizeTargetIdentity(records);
  return { axis: 'Y', sub_axis: 'target_identity', records, summary, validation };
}
