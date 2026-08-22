import { createHash } from 'node:crypto';

/**
 * X sub-axis — where in the world anyone is actually running trials.
 *
 * The pipeline adapter answers "is anyone developing therapeutics here". This answers the
 * question a programme lead asks straight afterwards: could we recruit. A rare disease whose
 * every site sits in one country is a different proposition from one recruiting across five
 * regions, and that signal is normally buried inside the locations module nobody reads.
 *
 * Reports counts and a concentration flag. It does not conclude that recruitment is feasible,
 * that a region is under-served, or that a regulator will accept the data.
 */

const DEFAULT_SUBJECT = 'SERPINA1 / Alpha-1 Antitrypsin Deficiency';
const NCT_ID = /^NCT\d{8}$/;

/** Deliberately coarse. The question is "which parts of the world", not "which market". */
export const REGIONS = Object.freeze({
  'United States': 'North America', Canada: 'North America', Mexico: 'North America',
  'United Kingdom': 'Europe', Germany: 'Europe', France: 'Europe', Italy: 'Europe', Spain: 'Europe',
  Netherlands: 'Europe', Belgium: 'Europe', Switzerland: 'Europe', Austria: 'Europe', Sweden: 'Europe',
  Denmark: 'Europe', Norway: 'Europe', Finland: 'Europe', Ireland: 'Europe', Poland: 'Europe',
  Portugal: 'Europe', 'Czech Republic': 'Europe', Czechia: 'Europe', Hungary: 'Europe', Greece: 'Europe',
  Romania: 'Europe', Bulgaria: 'Europe', Croatia: 'Europe', Slovakia: 'Europe', Slovenia: 'Europe',
  Serbia: 'Europe', Ukraine: 'Europe', Russia: 'Europe', Turkey: 'Europe', Estonia: 'Europe',
  Latvia: 'Europe', Lithuania: 'Europe', Iceland: 'Europe', Luxembourg: 'Europe',
  China: 'Asia', Japan: 'Asia', 'Korea, Republic of': 'Asia', 'South Korea': 'Asia', India: 'Asia',
  Taiwan: 'Asia', Singapore: 'Asia', Thailand: 'Asia', Malaysia: 'Asia', Indonesia: 'Asia',
  Vietnam: 'Asia', Philippines: 'Asia', Israel: 'Asia', 'Hong Kong': 'Asia', Pakistan: 'Asia',
  Bangladesh: 'Asia', Nepal: 'Asia', 'Sri Lanka': 'Asia', 'Saudi Arabia': 'Asia', 'United Arab Emirates': 'Asia',
  Brazil: 'Latin America', Argentina: 'Latin America', Chile: 'Latin America', Colombia: 'Latin America',
  Peru: 'Latin America', Bolivia: 'Latin America', Ecuador: 'Latin America', Uruguay: 'Latin America',
  Paraguay: 'Latin America', Venezuela: 'Latin America', Guatemala: 'Latin America', Panama: 'Latin America',
  'South Africa': 'Africa', Kenya: 'Africa', Nigeria: 'Africa', Ethiopia: 'Africa', Uganda: 'Africa',
  Tanzania: 'Africa', Ghana: 'Africa', Sudan: 'Africa', Egypt: 'Africa', Morocco: 'Africa',
  'Congo, The Democratic Republic of the': 'Africa', Malawi: 'Africa', Zambia: 'Africa', Mali: 'Africa',
  Australia: 'Oceania', 'New Zealand': 'Oceania',
});

/** Share of trials in a single country above which the set is flagged as concentrated. */
export const CONCENTRATION_THRESHOLD = 0.6;

const UNMAPPED = 'Other / unmapped';

export function regionOf(country) {
  return REGIONS[country] ?? UNMAPPED;
}

function text(value) {
  const normalized = value == null ? '' : String(value).trim();
  return normalized || null;
}

function studyList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.studies)) return payload.studies;
  if (Array.isArray(payload?.records)) return payload.records;
  return null;
}

/** Normalize a ClinicalTrials.gov v2 study list into canonical X site records. */
export function normalizeTrialSites(payload, {
  retrievedAt = new Date().toISOString(),
  subject = DEFAULT_SUBJECT,
  sourceName = 'ClinicalTrials.gov',
} = {}) {
  const studies = studyList(payload);
  if (!Array.isArray(studies) || studies.length === 0) {
    throw new Error('trial site source returned no studies');
  }

  return studies.map((study, index) => {
    const section = study?.protocolSection ?? study;
    const nctId = text(section?.identificationModule?.nctId ?? study?.nct_id ?? study?.nctId);
    const title = text(section?.identificationModule?.briefTitle ?? study?.title);
    const status = text(section?.statusModule?.overallStatus ?? study?.status);
    const phases = section?.designModule?.phases ?? study?.phases ?? [];
    const sponsor = text(section?.sponsorCollaboratorsModule?.leadSponsor?.name ?? study?.sponsor);
    const locations = section?.contactsLocationsModule?.locations ?? study?.locations ?? [];

    const countries = [...new Set(locations.map((location) => text(location?.country)).filter(Boolean))];
    const siteCount = locations.length;
    const sourceUrl = text(study?.source_url ?? study?.sourceUrl)
      ?? (nctId && NCT_ID.test(nctId) ? `https://clinicaltrials.gov/study/${nctId}` : null);

    const id = createHash('sha256').update(`X-SITES\0${nctId ?? ''}\0${sourceUrl ?? ''}`).digest('hex').slice(0, 16);
    const evidence = text(study?.evidence)
      ?? `${nctId ?? `study ${index}`} lists ${siteCount} ${siteCount === 1 ? 'site' : 'sites'} in ${
        countries.length ? countries.join(', ') : 'no reported country'}.`;

    return {
      id,
      axis: 'X',
      sub_axis: 'site_geography',
      subject,
      value: nctId,
      source_url: sourceUrl,
      retrieved_at: retrievedAt,
      evidence,
      nct_id: nctId,
      title,
      status: status ? status.replace(/_/g, ' ').toLowerCase() : null,
      phase: Array.isArray(phases) && phases.length ? phases.join('/') : null,
      sponsor,
      countries,
      site_count: siteCount,
      source_name: text(payload?.source_name) ?? sourceName,
    };
  });
}

export function validateTrialSiteRecords(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('site geography validation requires at least one trial record');
  }

  const issues = [];
  records.forEach((record, index) => {
    if (record?.axis !== 'X') issues.push(`record ${index}: axis must be X`);
    if (!text(record?.nct_id)) issues.push(`record ${index}: trial identifier is required`);
    if (!text(record?.source_url)) issues.push(`record ${index}: source URL is required`);
    if (!text(record?.evidence)) issues.push(`record ${index}: evidence is required`);
    if (!Array.isArray(record?.countries)) issues.push(`record ${index}: countries must be an array`);
    if (!Number.isInteger(record?.site_count) || record.site_count < 0) {
      issues.push(`record ${index}: site count must be a non-negative integer`);
    }
    if (Array.isArray(record?.countries) && record.countries.length > record?.site_count) {
      issues.push(`record ${index}: more countries than sites`);
    }
  });

  if (issues.length) throw new Error(`X site geography validation failed: ${issues.join('; ')}`);
  return { status: 'PASS', record_count: records.length, issues: [] };
}

/** Roll trial records up to countries, then to regions. Trials with no reported site are counted and excluded. */
export function summarizeSiteGeography(records) {
  validateTrialSiteRecords(records);

  const countryTotals = new Map();
  let totalSites = 0;
  let singleCountryTrials = 0;
  let trialsWithoutSites = 0;

  for (const record of records) {
    totalSites += record.site_count;
    if (record.countries.length === 0) trialsWithoutSites += 1;
    if (record.countries.length === 1) singleCountryTrials += 1;
    for (const country of record.countries) {
      const entry = countryTotals.get(country) ?? { country, trials: 0, sites: 0 };
      entry.trials += 1;
      entry.sites += record.countries.length === 1
        ? record.site_count
        : record.site_count / record.countries.length;
      countryTotals.set(country, entry);
    }
  }

  const countries = [...countryTotals.values()]
    .map((entry) => ({ ...entry, sites: Math.round(entry.sites * 10) / 10 }))
    .sort((a, b) => b.trials - a.trials || a.country.localeCompare(b.country));

  const regionTotals = new Map();
  for (const entry of countries) {
    const region = regionOf(entry.country);
    const bucket = regionTotals.get(region) ?? { region, trials: 0, countries: new Set() };
    bucket.trials += entry.trials;
    bucket.countries.add(entry.country);
    regionTotals.set(region, bucket);
  }
  const regions = [...regionTotals.values()]
    .map((bucket) => ({ region: bucket.region, trials: bucket.trials, countries: bucket.countries.size }))
    .sort((a, b) => b.trials - a.trials || a.region.localeCompare(b.region));

  const trialCount = records.length;
  const concentrationRatio = trialCount === 0 ? 0 : singleCountryTrials / trialCount;

  return {
    label: 'X — TRIAL SITE GEOGRAPHY',
    trials: trialCount,
    total_sites: totalSites,
    countries_covered: countries.length,
    regions_covered: regions.length,
    single_country_trials: singleCountryTrials,
    trials_without_reported_sites: trialsWithoutSites,
    concentration_ratio: Math.round(concentrationRatio * 100) / 100,
    concentration_threshold: CONCENTRATION_THRESHOLD,
    concentrated: concentrationRatio > CONCENTRATION_THRESHOLD,
    countries,
    regions,
    unmapped_countries: countries.filter((entry) => regionOf(entry.country) === UNMAPPED).map((entry) => entry.country),
    evidence_record_ids: records.map((record) => record.id),
    analysis_scope: 'Site counts and countries as reported on each trial record, rolled up to a coarse region map.',
    feasibility_conclusion: null,
    disclaimer: 'Reported site locations only. Concentration is a recruitment signal, not a judgement on whether a trial can enrol.',
  };
}

/** Source-agnostic runner. Inject a live ClinicalTrials.gov client or a saved response reader. */
export async function runSiteGeography({
  retrieve,
  query = { disease: 'Alpha-1 Antitrypsin Deficiency', target: 'SERPINA1' },
  sourceName,
  clock = () => new Date(),
} = {}) {
  if (typeof retrieve !== 'function') throw new TypeError('site geography requires an injected retrieval function');
  const payload = await retrieve(query);
  const now = clock();
  const records = normalizeTrialSites(payload, {
    retrievedAt: now.toISOString(),
    subject: `${query.target} / ${query.disease}`,
    sourceName,
  });
  const validation = validateTrialSiteRecords(records);
  const summary = summarizeSiteGeography(records);
  return { axis: 'X', sub_axis: 'site_geography', records, summary, validation };
}
