import { resolveUniProtTarget } from '../axes/y/target-identity.mjs';

const CHEMBL_API = 'https://www.ebi.ac.uk/chembl/api/data';

function requireOk(response, label) {
  if (!response?.ok) throw new Error(`${label} failed with HTTP ${response?.status ?? 'unknown'}`);
  return response;
}

function bounded(value, fallback = 50, maximum = 200) {
  const parsed = Number.parseInt(value ?? fallback, 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error('activity limit must be a positive integer');
  return Math.min(parsed, maximum);
}

export async function retrieveKnownTargetCompounds({
  target,
  uniprot_id,
  disease,
  maxActivities = 50,
  fetchImpl = globalThis.fetch,
  endpoint = CHEMBL_API,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetchImpl is required');
  const normalizedTarget = String(target ?? '').trim();
  if (!normalizedTarget) throw new Error('target is required for compound investigation');
  let accession = String(uniprot_id ?? '').trim();
  if (!accession) accession = (await resolveUniProtTarget({ target: normalizedTarget, fetchImpl })).accession;

  const targetUrl = new URL(`${endpoint.replace(/\/$/, '')}/target.json`);
  targetUrl.searchParams.set('target_components__accession', accession);
  targetUrl.searchParams.set('limit', '10');
  targetUrl.searchParams.set('format', 'json');
  const targetPayload = await requireOk(await fetchImpl(targetUrl, {
    headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20_000),
  }), 'ChEMBL target lookup').json();
  const targets = (targetPayload?.targets ?? []).filter((entry) => entry?.target_chembl_id);
  const exact = targets.find((entry) => (entry?.target_components ?? []).some(
    (component) => String(component?.accession ?? '').toUpperCase() === accession.toUpperCase(),
  )) ?? targets[0];
  if (!exact) throw new Error(`ChEMBL has no target mapped to UniProt ${accession}`);

  const activityUrl = new URL(`${endpoint.replace(/\/$/, '')}/activity.json`);
  activityUrl.searchParams.set('target_chembl_id', exact.target_chembl_id);
  activityUrl.searchParams.set('limit', String(bounded(maxActivities)));
  activityUrl.searchParams.set('format', 'json');
  const activityPayload = await requireOk(await fetchImpl(activityUrl, {
    headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20_000),
  }), 'ChEMBL activity lookup').json();

  const activities = (activityPayload?.activities ?? []).flatMap((activity) => {
    const moleculeId = String(activity?.molecule_chembl_id ?? '').trim();
    if (!moleculeId) return [];
    return [{
      activity_id: activity.activity_id ?? null,
      molecule_chembl_id: moleculeId,
      molecule_name: activity.molecule_pref_name ?? null,
      assay_chembl_id: activity.assay_chembl_id ?? null,
      document_chembl_id: activity.document_chembl_id ?? null,
      standard_type: activity.standard_type ?? null,
      standard_relation: activity.standard_relation ?? null,
      standard_value: activity.standard_value == null ? null : Number(activity.standard_value),
      standard_units: activity.standard_units ?? null,
      pchembl_value: activity.pchembl_value == null ? null : Number(activity.pchembl_value),
      source_url: `https://www.ebi.ac.uk/chembl/explore/compound/${encodeURIComponent(moleculeId)}`,
      evidence: `${moleculeId} has a ChEMBL ${activity.standard_type ?? 'activity'} record${activity.standard_value == null ? '' : ` of ${activity.standard_relation ?? ''}${activity.standard_value} ${activity.standard_units ?? ''}`}${activity.assay_chembl_id ? ` in assay ${activity.assay_chembl_id}` : ''}.`,
    }];
  });

  const grouped = new Map();
  for (const activity of activities) {
    const current = grouped.get(activity.molecule_chembl_id) ?? {
      molecule_chembl_id: activity.molecule_chembl_id,
      molecule_name: activity.molecule_name,
      source_url: activity.source_url,
      activity_count: 0,
      best_pchembl_value: null,
      activities: [],
    };
    current.activity_count += 1;
    current.activities.push(activity);
    if (Number.isFinite(activity.pchembl_value)) {
      current.best_pchembl_value = current.best_pchembl_value == null
        ? activity.pchembl_value : Math.max(current.best_pchembl_value, activity.pchembl_value);
    }
    grouped.set(activity.molecule_chembl_id, current);
  }
  const compounds = [...grouped.values()].sort((left, right) =>
    (right.best_pchembl_value ?? -Infinity) - (left.best_pchembl_value ?? -Infinity)
      || right.activity_count - left.activity_count
      || left.molecule_chembl_id.localeCompare(right.molecule_chembl_id));

  return {
    target: normalizedTarget,
    uniprot_id: accession,
    disease: String(disease ?? '').trim() || null,
    chembl_target: {
      target_chembl_id: exact.target_chembl_id,
      pref_name: exact.pref_name ?? null,
      target_type: exact.target_type ?? null,
      source_url: `https://www.ebi.ac.uk/chembl/explore/target/${encodeURIComponent(exact.target_chembl_id)}`,
    },
    compounds,
    activity_count: activities.length,
    retrieved_at: new Date().toISOString(),
    scope: 'Known ChEMBL target activities; not evidence that a compound binds the displayed pocket or is clinically suitable.',
    source_execution: {
      provider: 'ChEMBL',
      target_request_url: targetUrl.toString(),
      activity_request_url: activityUrl.toString(),
      returned_activities: activities.length,
    },
  };
}
