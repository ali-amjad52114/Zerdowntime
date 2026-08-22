import { createHash } from 'node:crypto';

/**
 * Z sub-axis — orphan designation, exclusivity clocks, and priority review vouchers.
 *
 * For a rare disease this IS the market model. A designation on its own confers fee
 * waivers and protocol assistance; the seven-year US exclusivity clock only starts on
 * approval, and a rare paediatric approval can additionally yield a transferable priority
 * review voucher that has repeatedly sold for nine figures.
 *
 * Same discipline as z-ip-activity: this reports observable register facts and arithmetic
 * on dates. It does not conclude that exclusivity will be granted, that a competitor is
 * blocked, or that a voucher will issue — those are regulatory determinations.
 */

const FORBIDDEN_REGULATORY_CONCLUSIONS = [
  /\b(?:will|shall)\s+(?:be\s+)?(?:granted|awarded|receive)\b/i,
  /guarantee(?:d|s)?\s+(?:exclusivity|approval|voucher)/i,
  /(?:blocks?|blocked|bars?)\s+(?:all\s+)?competitors?\b/i,
  /market\s+exclusivity\s+is\s+(?:secured|assured|certain)/i,
];

const AGENCIES = new Set(['FDA', 'EMA']);

/** Statutory exclusivity terms. Years, and what starts the clock. */
export const EXCLUSIVITY_TERMS = Object.freeze({
  FDA: Object.freeze({
    years: 7,
    starts_on: 'marketing approval for the designated indication',
    note: 'Designation alone confers fee waivers, tax credits and protocol assistance. The seven-year clock does not run from designation.',
    citation: 'US Orphan Drug Act, 21 U.S.C. 360cc',
    source_url: 'https://www.fda.gov/industry/developing-products-rare-diseases-conditions',
  }),
  EMA: Object.freeze({
    years: 10,
    starts_on: 'EU marketing authorisation for the designated indication',
    note: 'Extendable by two years where an agreed paediatric investigation plan is completed; reducible to six at year five if criteria are no longer met.',
    citation: 'Regulation (EC) No 141/2000',
    source_url: 'https://www.ema.europa.eu/en/human-regulatory-overview/orphan-designation-overview',
  }),
});

/**
 * Curated reference — publicly reported priority review voucher transaction values.
 *
 * There is no API for voucher sale prices; they surface in company disclosures and press
 * reporting. These are reported bands by era, not a quote, and specific transactions
 * should be verified against the parties' own filings before anyone relies on a number.
 */
export const VOUCHER_MARKET = Object.freeze({
  curated: true,
  verify_before_relying: true,
  programs: Object.freeze([
    Object.freeze({
      program: 'Rare paediatric disease PRV',
      awarded_on: 'approval of a drug for a rare paediatric disease',
      transferable: true,
      authorisation_note:
        'The rare paediatric disease voucher programme has been subject to statutory sunset and reauthorisation. Confirm the current authorisation status before treating a voucher as part of a programme value.',
      source_url: 'https://www.fda.gov/industry/medical-products-rare-pediatric-diseases',
    }),
    Object.freeze({
      program: 'Tropical disease PRV',
      awarded_on: 'approval of a drug for a listed tropical disease',
      transferable: true,
      authorisation_note:
        'The listed-disease set includes several conditions in the neglected-disease portfolios Mend already tracks, so a nonprofit or partnered programme may be voucher-eligible.',
      source_url: 'https://www.fda.gov/about-fda/center-drug-evaluation-and-research-cder/tropical-disease-priority-review-voucher-program',
    }),
  ]),
  reported_value_bands: Object.freeze([
    Object.freeze({ era: '2014, first reported sale', usd_millions: 67.5, note: 'Established that the voucher had a market at all.' }),
    Object.freeze({ era: '2015, reported peak', usd_millions: 350, note: 'Scarcity-driven; not repeated.' }),
    Object.freeze({ era: '2017–2020, reported sales', usd_millions_range: [80, 130], note: 'Supply of vouchers rose and prices settled.' }),
    Object.freeze({ era: '2021 onward, reported sales', usd_millions_range: [100, 160], note: 'Broadly stable nine-figure band.' }),
  ]),
  planning_midpoint_usd_millions: 100,
  source_url: 'https://www.fda.gov/industry/medical-products-rare-pediatric-diseases',
});

function text(value) {
  const normalized = value == null ? '' : String(value).trim();
  return normalized || null;
}

function validDateOrNull(value, field, index) {
  const normalized = text(value);
  if (!normalized) return null;
  if (Number.isNaN(Date.parse(normalized))) {
    throw new Error(`orphan record ${index} has an invalid ${field}`);
  }
  return normalized;
}

function yearsBetween(fromIso, toDate) {
  if (!fromIso) return null;
  const from = new Date(fromIso);
  const ms = toDate.getTime() - from.getTime();
  if (ms < 0) return null;
  return Math.round((ms / 31_557_600_000) * 10) / 10; // Julian year, one decimal
}

/** Normalize one designation register response into the canonical Z evidence contract. */
export function normalizeOrphanRecords(rawRecords, {
  sourceName = 'orphan-designation-register',
  retrievedAt = new Date().toISOString(),
  subject = 'SERPINA1 / Alpha-1 Antitrypsin Deficiency',
} = {}) {
  if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
    throw new Error('orphan designation source returned no records');
  }

  return rawRecords.map((raw, index) => {
    const agencyRaw = text(raw.agency ?? raw.authority ?? raw.regulator);
    const agency = agencyRaw ? agencyRaw.toUpperCase() : null;
    const designation = text(raw.designation ?? raw.designated_drug ?? raw.designatedDrug ?? raw.drug ?? raw.product);
    const sourceUrl = text(raw.source_url ?? raw.sourceUrl ?? raw.url);
    const designatedOn = validDateOrNull(
      raw.designated_on ?? raw.designatedOn ?? raw.designation_date ?? raw.designationDate,
      'designation date',
      index,
    );
    const approvedOn = validDateOrNull(
      raw.approved_on ?? raw.approvedOn ?? raw.approval_date ?? raw.approvalDate,
      'approval date',
      index,
    );
    const withdrawnOn = validDateOrNull(raw.withdrawn_on ?? raw.withdrawnOn, 'withdrawal date', index);

    const id = createHash('sha256')
      .update(`Z-ORPHAN\0${agency ?? ''}\0${designation ?? ''}\0${designatedOn ?? ''}`)
      .digest('hex')
      .slice(0, 16);

    return {
      id,
      axis: 'Z',
      sub_axis: 'orphan_exclusivity',
      subject,
      value: designation,
      source_url: sourceUrl,
      retrieved_at: retrievedAt,
      evidence: text(raw.evidence ?? raw.indication_text ?? raw.indicationText ?? raw.snippet),
      agency,
      designation,
      sponsor: text(raw.sponsor ?? raw.company ?? raw.applicant),
      indication: text(raw.indication ?? raw.designated_indication ?? raw.designatedIndication),
      designated_on: designatedOn,
      approved_on: approvedOn,
      withdrawn_on: withdrawnOn,
      paediatric: raw.paediatric ?? raw.pediatric ?? null,
      source_name: text(raw.source_name ?? raw.sourceName) ?? sourceName,
    };
  });
}

export function validateOrphanRecords(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('orphan validation requires at least one designation record');
  }

  const issues = [];
  records.forEach((record, index) => {
    if (record?.axis !== 'Z') issues.push(`record ${index}: axis must be Z`);
    if (!text(record?.designation)) issues.push(`record ${index}: designation is required`);
    if (!AGENCIES.has(record?.agency)) issues.push(`record ${index}: agency must be FDA or EMA`);
    if (!text(record?.source_url)) issues.push(`record ${index}: source URL is required`);
    if (!text(record?.evidence)) issues.push(`record ${index}: evidence is required`);
    if (!record?.designated_on) issues.push(`record ${index}: designation date is required to compute an age`);
    if (record?.approved_on && record?.designated_on && new Date(record.approved_on) < new Date(record.designated_on)) {
      issues.push(`record ${index}: approval precedes designation`);
    }
  });

  if (issues.length) throw new Error(`Z orphan exclusivity validation failed: ${issues.join('; ')}`);
  return { status: 'PASS', record_count: records.length, issues: [] };
}

export function assertNoUnsupportedRegulatoryClaim(value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  const matched = FORBIDDEN_REGULATORY_CONCLUSIONS.find((pattern) => pattern.test(serialized));
  if (matched) throw new Error('unsupported regulatory conclusion is not allowed in Z orphan exclusivity output');
  return value;
}

/**
 * Per-designation clock arithmetic.
 *
 * years_since_designation answers "how long has this been on the register" — a long age
 * with no approval is itself a signal that the programme stalled.
 * exclusivity_* only populates once an approval date exists, because that is when the
 * statutory clock starts.
 */
export function describeClock(record, now = new Date()) {
  const term = EXCLUSIVITY_TERMS[record.agency];
  const yearsSinceDesignation = yearsBetween(record.designated_on, now);
  const yearsSinceApproval = yearsBetween(record.approved_on, now);

  let exclusivityEnds = null;
  let exclusivityYearsRemaining = null;
  let exclusivityState = 'not started — no approval on record';

  if (record.withdrawn_on) {
    exclusivityState = 'withdrawn';
  } else if (record.approved_on && term) {
    const end = new Date(record.approved_on);
    end.setUTCFullYear(end.getUTCFullYear() + term.years);
    exclusivityEnds = end.toISOString().slice(0, 10);
    const remaining = Math.round(((end.getTime() - now.getTime()) / 31_557_600_000) * 10) / 10;
    exclusivityYearsRemaining = Math.max(remaining, 0);
    exclusivityState = remaining > 0 ? 'running' : 'expired';
  }

  return {
    record_id: record.id,
    designation: record.designation,
    agency: record.agency,
    designated_on: record.designated_on,
    years_since_designation: yearsSinceDesignation,
    approved_on: record.approved_on,
    years_since_approval: yearsSinceApproval,
    exclusivity_term_years: term?.years ?? null,
    exclusivity_starts_on: term?.starts_on ?? null,
    exclusivity_ends: exclusivityEnds,
    exclusivity_years_remaining: exclusivityYearsRemaining,
    exclusivity_state: exclusivityState,
    stalled:
      !record.approved_on && !record.withdrawn_on && yearsSinceDesignation != null && yearsSinceDesignation >= 10,
  };
}

/** Voucher exposure for this designation set. Eligibility is a regulatory determination; we report the signal. */
export function describeVoucherPosition(records, { paediatricHint = null } = {}) {
  const paediatric = records.some((r) => r.paediatric === true) || paediatricHint === true;
  const approvedPaediatric = records.some((r) => r.paediatric === true && r.approved_on);

  return {
    paediatric_designation_present: paediatric,
    approved_paediatric_designation_present: approvedPaediatric,
    voucher_signal: approvedPaediatric
      ? 'a rare paediatric approval is on record, which is the event a voucher attaches to'
      : paediatric
        ? 'a paediatric designation is on record but no approval yet, so no voucher event has occurred'
        : 'no paediatric designation on record in this set',
    reported_value_bands: VOUCHER_MARKET.reported_value_bands,
    planning_midpoint_usd_millions: VOUCHER_MARKET.planning_midpoint_usd_millions,
    programs: VOUCHER_MARKET.programs,
    curated: true,
    disclaimer:
      'Voucher values are publicly reported transaction bands, not a quote, and voucher issuance is an agency determination. Confirm programme authorisation and any specific sale price at source.',
    source_url: VOUCHER_MARKET.source_url,
  };
}

export function summarizeOrphanExclusivity(records, { now = new Date(), paediatricHint = null } = {}) {
  validateOrphanRecords(records);

  const clocks = records.map((record) => describeClock(record, now));
  const running = clocks.filter((c) => c.exclusivity_state === 'running');
  const ages = clocks.map((c) => c.years_since_designation).filter((v) => v != null);

  const summary = {
    label: 'Z — ORPHAN EXCLUSIVITY',
    designations: records.length,
    agencies: [...new Set(records.map((r) => r.agency))].sort(),
    oldest_designation_years: ages.length ? Math.max(...ages) : null,
    newest_designation_years: ages.length ? Math.min(...ages) : null,
    approvals_on_record: records.filter((r) => r.approved_on).length,
    exclusivity_running: running.length,
    longest_exclusivity_years_remaining: running.length
      ? Math.max(...running.map((c) => c.exclusivity_years_remaining ?? 0))
      : null,
    stalled_designations: clocks.filter((c) => c.stalled).length,
    clocks,
    voucher: describeVoucherPosition(records, { paediatricHint }),
    exclusivity_terms: EXCLUSIVITY_TERMS,
    evidence_record_ids: records.map((r) => r.id),
    analysis_scope:
      'Designation register facts and date arithmetic. Exclusivity terms are statutory defaults applied to observed approval dates.',
    regulatory_conclusion: null,
    disclaimer:
      'Intelligence signal only. Designation is not approval, exclusivity accrues on approval, and neither is a legal opinion.',
  };

  return assertNoUnsupportedRegulatoryClaim(summary);
}

export async function retrieveOrphanRecords(retrieve, query) {
  if (typeof retrieve !== 'function') throw new TypeError('orphan sub-axis requires an injected retrieval function');
  const response = await retrieve(query);
  const records = Array.isArray(response) ? response : response?.records;
  if (!Array.isArray(records)) throw new Error('orphan retrieval must return an array or { records: [] }');
  return records;
}

/** Source-agnostic runner. Inject a live register scraper or a deterministic fixture reader. */
export async function runOrphanExclusivity({
  retrieve,
  query = { disease: 'Alpha-1 Antitrypsin Deficiency', target: 'SERPINA1' },
  sourceName,
  clock = () => new Date(),
  paediatricHint = null,
} = {}) {
  const rawRecords = await retrieveOrphanRecords(retrieve, query);
  const now = clock();
  const records = normalizeOrphanRecords(rawRecords, {
    sourceName,
    retrievedAt: now.toISOString(),
    subject: `${query.target} / ${query.disease}`,
  });
  const validation = validateOrphanRecords(records);
  const summary = summarizeOrphanExclusivity(records, { now, paediatricHint });
  return { axis: 'Z', sub_axis: 'orphan_exclusivity', records, summary, validation };
}
