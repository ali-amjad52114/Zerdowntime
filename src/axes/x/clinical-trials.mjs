const ENDPOINT = 'https://clinicaltrials.gov/api/v2/studies';

function text(value) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized || null;
}

function bounded(value, fallback = 25) {
  const parsed = Number.parseInt(value ?? fallback, 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error('maxStudies must be a positive integer');
  return Math.min(parsed, 100);
}

export function normalizeClinicalTrials(studies, { disease, target, retrievedAt = new Date().toISOString() } = {}) {
  return (studies ?? []).map((study) => {
    const protocol = study?.protocolSection ?? {};
    const identity = protocol.identificationModule ?? {};
    const design = protocol.designModule ?? {};
    const status = protocol.statusModule ?? {};
    const sponsor = protocol.sponsorCollaboratorsModule?.leadSponsor ?? {};
    const interventions = protocol.armsInterventionsModule?.interventions ?? [];
    const nctId = text(identity.nctId);
    const title = text(identity.briefTitle ?? identity.officialTitle);
    const interventionNames = interventions.map((item) => text(item.name)).filter(Boolean);
    const phases = (design.phases ?? []).map(text).filter(Boolean);
    const overallStatus = text(status.overallStatus);
    const sourceUrl = `https://clinicaltrials.gov/study/${encodeURIComponent(nctId ?? '')}`;
    return {
      axis: 'X',
      subject: interventionNames[0] ?? title,
      value: phases.join(', ') || overallStatus || 'registered study',
      source_url: sourceUrl,
      retrieved_at: retrievedAt,
      evidence: `${nctId ?? 'ClinicalTrials.gov study'} — ${title ?? 'untitled study'}; target query ${target}; disease query ${disease}; ${phases.join(', ') || 'phase not supplied'}; ${overallStatus ?? 'status not supplied'}.`,
      trial_id: nctId,
      title,
      organization: text(sponsor.name),
      interventions: interventionNames,
      development_stage: phases.join(', ') || null,
      status: overallStatus,
    };
  }).filter((record) => record.trial_id && record.subject);
}

export function summarizeClinicalTrials(records) {
  return {
    programsFound: records.length,
    organizations: new Set(records.map((record) => record.organization).filter(Boolean)).size,
    mostAdvancedStage: records.map((record) => record.development_stage).find(Boolean) ?? null,
  };
}

export async function runClinicalTrialsAxis({ disease, target, fetchImpl = globalThis.fetch, maxStudies = 25 } = {}) {
  if (!text(disease)) throw new Error('disease is required for X diligence');
  if (!text(target)) throw new Error('target is required for X diligence');
  if (typeof fetchImpl !== 'function') throw new Error('fetchImpl is required');
  const url = new URL(ENDPOINT);
  url.searchParams.set('query.cond', disease);
  url.searchParams.set('query.term', target);
  url.searchParams.set('pageSize', String(bounded(maxStudies)));
  url.searchParams.set('format', 'json');
  let response;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
      if (response?.ok) break;
      lastError = new Error(`ClinicalTrials.gov request failed with HTTP ${response?.status ?? 'unknown'}`);
    } catch (error) {
      lastError = error;
    }
  }
  if (!response?.ok && lastError) throw lastError;
  if (!response?.ok) throw new Error(`ClinicalTrials.gov request failed with HTTP ${response?.status ?? 'unknown'}`);
  const payload = await response.json();
  const records = normalizeClinicalTrials(payload?.studies, { disease, target });
  return {
    axis: 'X',
    records,
    summary: summarizeClinicalTrials(records),
    validation: records.length ? { status: 'PASS', checks: ['NON_EMPTY', 'SOURCE_LINKED'] } : { status: 'FAIL', reason: 'no target-specific clinical studies found' },
  };
}
