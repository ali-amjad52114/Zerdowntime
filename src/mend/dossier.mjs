/** @typedef {'EVIDENCE_FOUND'|'NO_EVIDENCE'|'NOT_RUN'|'FAILED'} DossierState */

export const DOSSIER_STATES = Object.freeze({
  EVIDENCE_FOUND: 'EVIDENCE_FOUND',
  NO_EVIDENCE: 'NO_EVIDENCE',
  NOT_RUN: 'NOT_RUN',
  FAILED: 'FAILED',
});

const FAILURE_STATUSES = new Set(['FAILED', 'FAIL', 'ERROR', 'UNAVAILABLE', 'BLOCKED']);
const NO_EVIDENCE_REASON = /(?:\bno\b.*\b(?:evidence|records?|results?|stud(?:y|ies)|programs?|structures?|patents?|designations?)\b|nothing found|zero results)/i;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function substantiveCount(records) {
  return array(records).filter((record) => record?.record_type !== 'evidence_gap').length;
}

function text(value) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized || null;
}

function explicitlyFailed(source) {
  return FAILURE_STATUSES.has(String(source?.status ?? '').toUpperCase())
    || FAILURE_STATUSES.has(String(source?.validation?.status ?? '').toUpperCase())
    || source?.validation?.valid === false;
}

function failureReason(source) {
  return text(source?.error ?? source?.validation?.reason ?? source?.quarantine?.reason);
}

function stateOf(source, { evidenceCount, meaningful = false } = {}) {
  if (source == null) return DOSSIER_STATES.NOT_RUN;
  const count = evidenceCount ?? array(source.records).length;
  const reason = failureReason(source);
  if (!count && reason && NO_EVIDENCE_REASON.test(reason)) return DOSSIER_STATES.NO_EVIDENCE;
  if (explicitlyFailed(source)) return DOSSIER_STATES.FAILED;
  if (count > 0 || meaningful) return DOSSIER_STATES.EVIDENCE_FOUND;
  return DOSSIER_STATES.NO_EVIDENCE;
}

function evidenceSource(record) {
  const url = text(record?.source_url ?? record?.sourceUrl ?? record?.url);
  const id = text(record?.paper_id ?? record?.source_id ?? record?.trial_id ?? record?.structure_id
    ?? record?.publication_number ?? record?.designation_id);
  const title = text(record?.paper_title ?? record?.source ?? record?.title ?? record?.subject);
  if (!url && !id && !title) return null;
  return { id, title, url };
}

function sourceList(records) {
  const unique = new Map();
  for (const record of records) {
    const source = evidenceSource(record);
    if (!source) continue;
    const key = source.url ?? `${source.id ?? ''}\u0000${source.title ?? ''}`;
    if (!unique.has(key)) unique.set(key, source);
  }
  return [...unique.values()].sort((left, right) => {
    const leftKey = `${left.url ?? ''}\u0000${left.id ?? ''}\u0000${left.title ?? ''}`;
    const rightKey = `${right.url ?? ''}\u0000${right.id ?? ''}\u0000${right.title ?? ''}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

function actionFor(path, state, { axis = null, optional = false } = {}) {
  if (state === DOSSIER_STATES.EVIDENCE_FOUND) return null;
  const type = state === DOSSIER_STATES.FAILED
    ? 'RETRY'
    : state === DOSSIER_STATES.NO_EVIDENCE ? 'ENRICH' : 'RESEARCH';
  return {
    id: `${type.toLowerCase()}:${path}`,
    type,
    target: path,
    axis,
    optional,
    label: `${type === 'RETRY' ? 'Retry' : type === 'ENRICH' ? 'Enrich' : 'Research'} ${path.replaceAll('.', ' ')}`,
  };
}

function section(path, source, options = {}) {
  const records = clone(array(options.records ?? source?.records));
  const summary = clone(options.summary ?? source?.summary ?? {});
  const state = options.state ?? stateOf(source, {
    evidenceCount: substantiveCount(records),
    meaningful: Boolean(options.meaningful),
  });
  return {
    state,
    records,
    summary,
    sources: sourceList(options.sourceRecords ?? records),
    error: state === DOSSIER_STATES.FAILED ? failureReason(source) : null,
    suggested_action: actionFor(path, state, options),
  };
}

function isClinicalRecord(record) {
  return Boolean(record?.trial_id ?? record?.nct_id)
    || record?.sub_axis === 'clinical_trials'
    || /clinicaltrials\.gov\//i.test(String(record?.source_url ?? record?.sourceUrl ?? ''));
}

function splitDiscoveryEvidence(snapshot) {
  const combined = [
    ...array(snapshot?.evidence),
    ...array(snapshot?.supporting_passages).map((item) => ({ ...item, classification: 'SUPPORTING' })),
    ...array(snapshot?.contradictory_passages).map((item) => ({ ...item, classification: 'CONTRADICTORY' })),
    ...array(snapshot?.contextual_passages ?? snapshot?.neutral_passages).map((item) => ({ ...item, classification: 'NEUTRAL' })),
  ];
  const seen = new Set();
  const normalized = [];
  for (const item of combined) {
    const classification = String(item?.classification ?? '').toUpperCase();
    if (!['SUPPORTING', 'CONTRADICTORY', 'NEUTRAL'].includes(classification)) continue;
    const passage = text(item?.passage ?? item?.text ?? item?.evidence);
    if (!passage) continue;
    const record = {
      classification,
      passage,
      reason: text(item?.reason),
      paper_id: text(item?.paper_id ?? item?.source_id),
      paper_title: text(item?.paper_title ?? item?.source),
      source_url: text(item?.source_url ?? item?.sourceUrl ?? item?.url),
    };
    const key = `${classification}\u0000${passage}\u0000${record.source_url ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(record);
    }
  }
  return {
    supporting: normalized.filter((item) => item.classification === 'SUPPORTING'),
    contradictory: normalized.filter((item) => item.classification === 'CONTRADICTORY'),
    contextual: normalized.filter((item) => item.classification === 'NEUTRAL'),
  };
}

function discoverySection(run) {
  const snapshot = run.discovery_snapshot ?? run.discoverySnapshot ?? null;
  const passages = splitDiscoveryEvidence(snapshot);
  const allPassages = [...passages.supporting, ...passages.contradictory, ...passages.contextual];
  const state = stateOf(snapshot, { evidenceCount: allPassages.length });
  return {
    state,
    candidate_id: text(snapshot?.candidate_id ?? snapshot?.id ?? run.candidate_id ?? run.candidateId),
    name: text(snapshot?.name ?? run.target),
    aliases: [...new Set(array(snapshot?.aliases).map(text).filter(Boolean))].sort(),
    score: finiteNumber(snapshot?.score ?? snapshot?.ranking?.score),
    rank: finiteNumber(snapshot?.rank),
    ranking: clone(snapshot?.ranking ?? {}),
    supporting_passages: passages.supporting,
    contradictory_passages: passages.contradictory,
    contextual_passages: passages.contextual,
    sources: sourceList(allPassages),
    suggested_action: actionFor('discovery.evidence', state),
  };
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function xSection(run) {
  const axis = run.axes?.X ?? run.axes?.x ?? run.X ?? run.x ?? null;
  const subAxes = axis?.sub_axes ?? axis?.subAxes ?? {};
  const explicitClinical = subAxes.clinical_trials ?? subAxes.clinical ?? axis?.clinical_trials ?? null;
  const explicitCompany = subAxes.company_pipeline ?? subAxes.companies ?? axis?.company_pipeline ?? null;
  const explicitGeography = subAxes.site_geography ?? subAxes.geography ?? axis?.site_geography ?? null;
  const parentRecords = array(axis?.records);
  const clinicalRecords = explicitClinical ? array(explicitClinical.records) : parentRecords.filter(isClinicalRecord);
  const companyRecords = explicitCompany ? array(explicitCompany.records) : parentRecords.filter((item) => !isClinicalRecord(item));
  const axisFailed = explicitlyFailed(axis);
  const targetExecutionFailed = /target execution failed/i.test(failureReason(axis) ?? '');
  const clinicalSource = explicitClinical ?? (clinicalRecords.length || axis?.summary?.clinical_records != null
    || (axisFailed && run.factoryVersion === 'discovery-v1' && !targetExecutionFailed) ? axis : null);
  const companySource = explicitCompany ?? (companyRecords.length || axis?.summary?.pipeline_records != null
    || (axisFailed && run.factoryVersion !== 'discovery-v1' && !targetExecutionFailed) ? axis : null);
  return {
    state: stateOf(axis, { evidenceCount: substantiveCount(parentRecords) }),
    clinical: section('x.clinical', clinicalSource, { axis: 'X', records: clinicalRecords }),
    companies: section('x.companies', companySource, { axis: 'X', records: companyRecords }),
    geography: section('x.geography', explicitGeography, { axis: 'X', optional: true }),
    summary: clone(axis?.summary ?? {}),
    error: axisFailed ? failureReason(axis) : null,
  };
}

function ySection(run) {
  const axis = run.axes?.Y ?? run.axes?.y ?? run.Y ?? run.y ?? null;
  const subAxes = axis?.sub_axes ?? axis?.subAxes ?? {};
  const identitySource = subAxes.target_identity ?? subAxes.identity ?? axis?.target_identity ?? null;
  const parentRecords = array(axis?.records);
  const targetExecutionFailed = /target execution failed/i.test(failureReason(axis) ?? '');
  const structureSource = axis && !(targetExecutionFailed && !parentRecords.length) ? axis : null;
  return {
    state: stateOf(axis, { evidenceCount: substantiveCount(parentRecords) }),
    identity: section('y.identity', identitySource, { axis: 'Y', optional: true }),
    structures: section('y.structures', structureSource, { axis: 'Y', records: parentRecords }),
    summary: clone(axis?.summary ?? {}),
    error: explicitlyFailed(axis) ? failureReason(axis) : null,
  };
}

function zSection(run) {
  const axis = run.axes?.Z ?? run.axes?.z ?? run.Z ?? run.z ?? null;
  const subAxes = axis?.sub_axes ?? axis?.subAxes ?? {};
  const orphanSource = subAxes.orphan_exclusivity ?? subAxes.orphan ?? axis?.orphan_exclusivity ?? null;
  const parentRecords = array(axis?.records);
  const targetExecutionFailed = /target execution failed/i.test(failureReason(axis) ?? '');
  const patentSource = axis && !(targetExecutionFailed && !parentRecords.length) ? axis : null;
  return {
    state: stateOf(axis, { evidenceCount: substantiveCount(parentRecords) }),
    patents: section('z.patents', patentSource, { axis: 'Z', records: parentRecords }),
    orphan: section('z.orphan', orphanSource, { axis: 'Z', optional: true }),
    summary: clone(axis?.summary ?? {}),
    error: explicitlyFailed(axis) ? failureReason(axis) : null,
  };
}

function collectGaps(dossier) {
  const entries = [
    ['discovery.evidence', dossier.discovery],
    ['x.clinical', dossier.x.clinical],
    ['x.companies', dossier.x.companies],
    ['x.geography', dossier.x.geography],
    ['y.identity', dossier.y.identity],
    ['y.structures', dossier.y.structures],
    ['z.patents', dossier.z.patents],
    ['z.orphan', dossier.z.orphan],
  ];
  return entries.flatMap(([path, item]) => item.state === DOSSIER_STATES.EVIDENCE_FOUND ? [] : [{
    id: `gap:${path}`,
    source: path,
    state: item.state,
    reason: item.error ?? (item.state === DOSSIER_STATES.NOT_RUN
      ? 'Source has not been run for this target.'
      : item.state === DOSSIER_STATES.FAILED
        ? 'Source execution or validation failed.'
        : 'Source ran but returned no evidence for this target.'),
    suggested_action: item.suggested_action,
  }]);
}

/**
 * Translate current or legacy target-run output into a deterministic, UI-neutral dossier.
 * @param {Record<string, unknown>} run
 * @returns {Record<string, unknown>}
 */
export function buildTargetDossier(run) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) throw new TypeError('target run must be an object');
  const discovery = discoverySection(run);
  const dossier = {
    schema_version: 'mend.target-dossier/v1',
    run: {
      id: text(run.runId ?? run.run_id),
      disease_run_id: text(run.disease_run_id ?? run.diseaseRunId),
      candidate_id: text(run.candidate_id ?? run.candidateId ?? discovery.candidate_id),
      status: text(run.status),
      publish_status: text(run.publishStatus ?? run.publish_status),
      factory_version: text(run.factoryVersion ?? run.factory_version),
    },
    subject: {
      disease: text(run.disease ?? run.indication),
      target: text(run.target ?? discovery.name),
      uniprot_id: text(run.uniprot_id ?? run.uniprotId ?? run.axes?.Y?.summary?.uniprot_id)?.toUpperCase() ?? null,
      aliases: discovery.aliases,
    },
    discovery,
    x: xSection(run),
    y: ySection(run),
    z: zSection(run),
  };
  dossier.evidence_gaps = collectGaps(dossier);
  dossier.suggested_actions = dossier.evidence_gaps.map((gap) => gap.suggested_action);
  return dossier;
}
