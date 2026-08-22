import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeXPipeline, summarizeXPipeline, validateXPipeline } from '../axes/x-pipeline-adapter.mjs';

export const BRIGHTDATA_SOURCE_CONTRACT_VERSION = 'mend.source-execution.v1';
export const BRIGHTDATA_ADAPTER_VERSION = 'brightdata.pipeline.v3';

const SECRET_KEY = /(api[_-]?key|authorization|bearer|token|secret|password|cookie)/i;
const SEARCH_FIELDS = [
  'organization', 'sponsor', 'program', 'program_name', 'disease', 'indication',
  'target_mechanism', 'mechanism', 'evidence', 'evidence_text', 'evidence_excerpt',
];

function requiredText(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} is required`);
  return result;
}

function uniqueTerms(values, label) {
  const result = [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))];
  if (!result.length) throw new TypeError(`${label} requires at least one term`);
  return result;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertPublicSourceUrl(value) {
  const url = new URL(requiredText(value, 'source.url'));
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('source.url must use HTTP or HTTPS');
  if (url.username || url.password) throw new TypeError('source.url must not contain credentials');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === '::1' || /^127\./.test(host) || /^10\./.test(host)
    || /^192\.168\./.test(host) || /^169\.254\./.test(host)) {
    throw new TypeError('source.url must identify a public source');
  }
  return url.toString();
}

function assertNoSecrets(value, path = 'request') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) throw new TypeError(`${path}.${key} is not allowed in the source contract`);
    assertNoSecrets(child, `${path}.${key}`);
  }
}

export function createBrightDataAcquisitionRequest(input = {}) {
  assertNoSecrets(input);
  const sourceKind = input.source?.kind ?? 'scraper_studio_collector';
  if (!['scraper_studio_collector', 'marketplace_dataset'].includes(sourceKind)) {
    throw new TypeError(`unsupported Bright Data source kind: ${sourceKind}`);
  }
  const assetId = requiredText(input.source?.assetId, 'source.assetId');
  if (sourceKind === 'scraper_studio_collector' && !assetId.startsWith('c_')) {
    throw new TypeError('Scraper Studio collector IDs must start with c_');
  }
  if (sourceKind === 'marketplace_dataset' && !assetId.startsWith('gd_')) {
    throw new TypeError('Marketplace dataset IDs must start with gd_');
  }

  return {
    contract_version: BRIGHTDATA_SOURCE_CONTRACT_VERSION,
    adapter_version: BRIGHTDATA_ADAPTER_VERSION,
    correlation: {
      disease_run_id: requiredText(input.diseaseRunId, 'diseaseRunId'),
      candidate_id: input.candidateId ? String(input.candidateId) : null,
      target_run_id: requiredText(input.targetRunId, 'targetRunId'),
      axis: 'X',
    },
    query: {
      disease: requiredText(input.disease?.name, 'disease.name'),
      disease_terms: uniqueTerms([input.disease?.name, ...(input.disease?.aliases ?? [])], 'disease'),
      target: requiredText(input.target?.name, 'target.name'),
      target_terms: uniqueTerms([input.target?.name, ...(input.target?.aliases ?? [])], 'target'),
      target_identifiers: { ...(input.target?.identifiers ?? {}) },
      match_policy: input.matchPolicy ?? 'disease_or_target',
    },
    source: {
      provider: 'bright_data',
      kind: sourceKind,
      asset_id: assetId,
      url: assertPublicSourceUrl(input.source?.url),
      public_source_approved: input.source?.publicSourceApproved === true,
    },
  };
}

export function chooseAcquisitionRoute({ authoritativeApi, datasets = [], collectors = [] } = {}) {
  if (authoritativeApi?.available) return { strategy: 'authoritative_api', source: authoritativeApi };
  if (datasets.length) return { strategy: 'brightdata_existing_dataset', source: datasets[0] };
  if (collectors.length) return { strategy: 'brightdata_existing_collector', source: collectors[0] };
  return { strategy: 'gap_requires_review', source: null };
}

export function flattenBrightDataPayload(payload) {
  const roots = Array.isArray(payload) ? payload : [payload];
  return roots.flatMap((item) => {
    if (Array.isArray(item)) return item;
    for (const key of ['pipeline_items', 'programme_cards', 'programs', 'results', 'data']) {
      if (Array.isArray(item?.[key])) return item[key];
    }
    return item && typeof item === 'object' ? [item] : [];
  });
}

function matchingTerms(text, terms) {
  const haystack = text.toLocaleLowerCase();
  return terms.filter((term) => {
    const needle = term.toLocaleLowerCase();
    if (!/^[a-z0-9]+$/i.test(needle)) return haystack.includes(needle);
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(haystack);
  });
}

export function filterBrightDataRecords(records, query) {
  if (!['disease_and_target', 'disease_or_target'].includes(query.match_policy)) {
    throw new TypeError(`unsupported match policy: ${query.match_policy}`);
  }
  return [...records.entries()].flatMap(([rawRecordIndex, record]) => {
    const searchable = SEARCH_FIELDS.map((field) => record?.[field]).filter(Boolean).join(' ');
    const diseaseMatches = matchingTerms(searchable, query.disease_terms);
    const targetMatches = matchingTerms(searchable, query.target_terms);
    const relevant = query.match_policy === 'disease_and_target'
      ? diseaseMatches.length > 0 && targetMatches.length > 0
      : diseaseMatches.length > 0 || targetMatches.length > 0;
    return relevant ? [{
      ...record,
      _mend_raw_record_index: rawRecordIndex,
      _mend_match: { disease_terms: diseaseMatches, target_terms: targetMatches },
    }] : [];
  });
}

export function executeBrightDataAdapter({ request, payload, retrievedAt = new Date().toISOString(), previousHealthy = [] }) {
  if (request?.contract_version !== BRIGHTDATA_SOURCE_CONTRACT_VERSION) {
    throw new TypeError(`expected ${BRIGHTDATA_SOURCE_CONTRACT_VERSION}`);
  }
  const rawRecords = flattenBrightDataPayload(payload);
  const relevantRawRecords = filterBrightDataRecords(rawRecords, request.query);
  const records = normalizeXPipeline(relevantRawRecords, {
    source_url: request.source.url,
    retrieved_at: retrievedAt,
  }).map((record, index) => ({
    ...record,
    provenance: {
      source_execution_id: null,
      provider: 'bright_data',
      asset_id: request.source.asset_id,
      raw_record_index: relevantRawRecords[index]._mend_raw_record_index,
      matched_terms: relevantRawRecords[index]._mend_match,
    },
  }));
  const previousHealthyCount = Array.isArray(previousHealthy) ? previousHealthy.length : Number(previousHealthy ?? 0);
  const validation = validateXPipeline(records, { previousHealthyCount, maxMissingRatio: 0.67 });
  if (!request.source.public_source_approved) {
    validation.status = 'FAIL';
    validation.quarantined = true;
    validation.reasons.push('PUBLIC_SOURCE_APPROVAL_REQUIRED');
  }
  return {
    axis: 'X',
    records,
    summary: summarizeXPipeline(records),
    validation,
    acquisition: {
      raw_record_count: rawRecords.length,
      relevant_record_count: relevantRawRecords.length,
      query: request.query,
    },
  };
}

export function persistBrightDataSourceExecution({
  artifactRoot = 'artifacts/source-executions', request, payload, adapterResult,
  executionId = randomUUID(), providerRunId = null, startedAt, completedAt = new Date().toISOString(),
  mode = 'live', healingHistory = [],
}) {
  if (!['live', 'fixture'].includes(mode)) throw new TypeError('mode must be live or fixture');
  assertNoSecrets(payload, 'payload');
  const safeExecutionId = requiredText(executionId, 'executionId');
  if (!/^[A-Za-z0-9._-]+$/.test(safeExecutionId)) throw new TypeError('executionId contains unsafe characters');
  const directory = join(artifactRoot, safeExecutionId);
  mkdirSync(directory, { recursive: true });
  for (const record of adapterResult.records) record.provenance.source_execution_id = safeExecutionId;
  const raw = json(payload);
  const normalized = json(adapterResult.records);
  const status = adapterResult.validation.status === 'PASS' ? 'succeeded' : 'quarantined';
  const manifest = {
    contract_version: BRIGHTDATA_SOURCE_CONTRACT_VERSION,
    execution_id: safeExecutionId,
    mode,
    status,
    correlation: request.correlation,
    telemetry_attributes: {
      'source.provider': 'bright_data',
      'source.execution.id': safeExecutionId,
      'disease.run.id': request.correlation.disease_run_id,
      'candidate.id': request.correlation.candidate_id,
      'target.run.id': request.correlation.target_run_id,
      ...(request.source.kind === 'scraper_studio_collector'
        ? { 'brightdata.collector.id': request.source.asset_id }
        : { 'brightdata.dataset.id': request.source.asset_id }),
    },
    provider: {
      name: 'bright_data',
      source_kind: request.source.kind,
      asset_id: request.source.asset_id,
      run_id: providerRunId,
    },
    request: {
      query: request.query,
      source_url: request.source.url,
      public_source_approved: request.source.public_source_approved,
    },
    timing: { started_at: startedAt ?? completedAt, completed_at: completedAt },
    artifacts: {
      raw: { path: 'raw.json', sha256: sha256(raw), bytes: Buffer.byteLength(raw) },
      normalized: { path: 'normalized.json', sha256: sha256(normalized), bytes: Buffer.byteLength(normalized) },
    },
    counts: {
      raw: adapterResult.acquisition.raw_record_count,
      relevant: adapterResult.acquisition.relevant_record_count,
      normalized: adapterResult.records.length,
    },
    validation: adapterResult.validation,
    healing_history: healingHistory,
    live_gate: {
      provider_run_id_present: Boolean(providerRunId),
      nonempty_response: adapterResult.acquisition.raw_record_count > 0,
      correlated: Boolean(request.correlation.disease_run_id && request.correlation.target_run_id),
      pass: mode === 'live' && Boolean(providerRunId)
        && adapterResult.acquisition.raw_record_count > 0 && adapterResult.validation.status === 'PASS',
    },
  };
  const manifestText = json(manifest);
  writeFileSync(join(directory, 'raw.json'), raw, 'utf8');
  writeFileSync(join(directory, 'normalized.json'), normalized, 'utf8');
  writeFileSync(join(directory, 'manifest.json'), manifestText, 'utf8');
  return { ...manifest, artifact_directory: directory };
}

export function buildCollectorPrompt(request) {
  const diseaseTerms = request.query.disease_terms.join(', ');
  const targetTerms = request.query.target_terms.join(', ');
  return [
    'Scrape only the supplied public pipeline page and do not follow links.',
    `Retain programs whose on-page evidence explicitly mentions a disease term (${diseaseTerms}) or target term (${targetTerms}).`,
    'Return a JSON array with organization, program, disease, target_mechanism, development_stage, status, source_url, evidence_excerpt, and product_page_url.',
    'Evidence_excerpt must be a concise verbatim excerpt from the page. Do not infer missing values.',
  ].join(' ');
}
