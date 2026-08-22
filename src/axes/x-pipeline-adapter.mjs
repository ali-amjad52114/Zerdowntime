import { createHash } from 'node:crypto';

const REQUIRED_IDENTITY_FIELDS = ['organization', 'program', 'disease'];
const OPTIONAL_SCIENCE_FIELDS = ['targetMechanism', 'developmentStage', 'status'];

function text(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}
function sourceRecordId(record) {
  return createHash('sha256')
    .update(`${record.sourceUrl}\0${record.organization}\0${record.program}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Adapter v1 is the generated factory-v1 contract for the legacy Bright Data
 * extraction. Adapter v2 is its repair: it accepts the renamed/current card
 * contract while retaining backward compatibility with v1 snapshots.
 */
export function retrieveXPipeline(snapshot, { adapterVersion = 'v1' } = {}) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new TypeError('X pipeline snapshot must be an object');
  }

  if (adapterVersion === 'v1') {
    return Array.isArray(snapshot.pipeline_items) ? snapshot.pipeline_items : [];
  }
  if (adapterVersion === 'v2') {
    if (Array.isArray(snapshot.programme_cards)) return snapshot.programme_cards;
    return Array.isArray(snapshot.pipeline_items) ? snapshot.pipeline_items : [];
  }
  throw new Error(`unsupported X pipeline adapter version: ${adapterVersion}`);
}

export function normalizeXPipeline(rawRecords, snapshot = {}) {
  if (!Array.isArray(rawRecords)) throw new TypeError('X pipeline records must be an array');

  return rawRecords.map((raw) => {
    const record = {
      organization: text(raw.organization ?? raw.sponsor),
      program: text(raw.program ?? raw.program_name),
      disease: text(raw.disease ?? raw.indication),
      targetMechanism: text(raw.target_mechanism ?? raw.mechanism),
      developmentStage: text(raw.development_stage ?? raw.stage),
      status: text(raw.status),
      sourceUrl: text(raw.source_url ?? snapshot.source_url),
      retrievedAt: text(raw.retrieved_at ?? snapshot.retrieved_at),
      evidenceText: text(raw.evidence ?? raw.evidence_text ?? raw.evidence_excerpt),
    };

    return {
      id: sourceRecordId(record),
      axis: 'X',
      ...record,
      evidence: {
        axis: 'X',
        subject: record.program,
        value: record.developmentStage ?? record.status ?? 'unknown',
        source_url: record.sourceUrl,
        retrieved_at: record.retrievedAt,
        evidence: record.evidenceText,
      },
    };
  });
}

export function summarizeXPipeline(records) {
  const organizations = new Set(records.map((record) => record.organization).filter(Boolean));
  const stageRank = new Map([
    ['Discovery', 1], ['Preclinical', 2], ['Phase 1', 3], ['Phase 1/2', 4],
    ['Phase 2', 5], ['Phase 2/3', 6], ['Phase 3', 7], ['Approved', 8],
  ]);
  const stages = records.map((record) => record.developmentStage).filter(Boolean);
  const mostAdvancedStage = stages.sort((a, b) => (stageRank.get(b) ?? 0) - (stageRank.get(a) ?? 0))[0] ?? null;

  return {
    programsFound: records.length,
    organizations: organizations.size,
    mostAdvancedStage,
  };
}

export function validateXPipeline(records, {
  previousHealthyCount = 0,
  maxMissingRatio = 0.25,
  collapseRatio = 0.5,
} = {}) {
  const reasons = [];
  const recordCount = Array.isArray(records) ? records.length : 0;

  if (!Array.isArray(records) || recordCount === 0) reasons.push('EMPTY_RESULT');

  for (const [index, record] of (records ?? []).entries()) {
    const missingIdentity = REQUIRED_IDENTITY_FIELDS.filter((field) => !record?.[field]);
    if (missingIdentity.length) reasons.push(`MISSING_IDENTITY:${index}:${missingIdentity.join(',')}`);
    if (!record?.sourceUrl || !record?.evidenceText || !record?.evidence?.source_url || !record?.evidence?.evidence) {
      reasons.push(`MISSING_EVIDENCE:${index}`);
    }
  }

  const optionalCells = recordCount * OPTIONAL_SCIENCE_FIELDS.length;
  const missingOptionalCells = (records ?? []).reduce(
    (total, record) => total + OPTIONAL_SCIENCE_FIELDS.filter((field) => !record?.[field]).length,
    0,
  );
  const missingRatio = optionalCells === 0 ? 1 : missingOptionalCells / optionalCells;
  if (recordCount > 0 && missingRatio > maxMissingRatio) reasons.push('EXCESSIVE_MISSINGNESS');

  const collapseThreshold = previousHealthyCount > 0 ? previousHealthyCount * collapseRatio : 0;
  if (previousHealthyCount > 0 && recordCount < collapseThreshold) reasons.push('HISTORICAL_COUNT_COLLAPSE');

  return {
    status: reasons.length === 0 ? 'PASS' : 'FAIL',
    quarantined: reasons.length > 0,
    reasons,
    previousHealthyCount,
    currentCount: recordCount,
    missingRatio,
  };
}

/** Dependency-free orchestration API used by the X/Y/Z runtime. */
export function runXAxis({
  snapshot,
  mode = 'normal',
  adapterVersion = mode === 'recover' ? 'v2' : 'v1',
  previousHealthy = [],
  validationOptions = {},
} = {}) {
  const rawRecords = retrieveXPipeline(snapshot, { adapterVersion });
  const records = normalizeXPipeline(rawRecords, snapshot);
  const previousHealthyCount = Array.isArray(previousHealthy)
    ? previousHealthy.length
    : Number(previousHealthy?.records?.length ?? previousHealthy?.recordCount ?? previousHealthy ?? 0);
  const validation = validateXPipeline(records, { previousHealthyCount, ...validationOptions });

  return {
    axis: 'X',
    records,
    summary: summarizeXPipeline(records),
    validation,
  };
}
