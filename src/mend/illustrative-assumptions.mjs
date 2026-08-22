/**
 * Illustrative planning assumptions — NOT cited facts.
 *
 * `reference-tables.mjs` is this repo's cited-facts file: every row there carries a real
 * source you could go check. This file is the opposite half of the same discipline: every
 * constant here is a modeling choice or an unsourced planning heuristic, and it stays out of
 * `reference-tables.mjs` on purpose so that file's one promise — "everything here is cited" —
 * never gets diluted.
 *
 * Where a number's general *shape* is grounded in named, real literature, the `basis` field
 * says so and says plainly that the specific figure is Mend's own modeled fit to that shape,
 * not an extracted table from a specific document. Two such patterns recur below:
 *   - Biotech R&D/commercial staffing scales with phase and manufacturing complexity — a
 *     pattern discussed in Tufts Center for the Study of Drug Development clinical-trial cost
 *     and staffing benchmarking, and in DiMasi JA, Grabowski HG, Hansen RW, "Innovation in the
 *     pharmaceutical industry: New estimates of R&D costs," Journal of Health Economics, 2016.
 *   - Orphan-drug launches tend to ramp faster than mass-market launches because the patient
 *     population is small and identifiable through specialist/registry networks — a pattern
 *     discussed in IQVIA Institute reporting on orphan drug market access.
 * Neither source gives Mend a single number to extract; both give a real, named shape to fit.
 *
 * Every value everywhere in the app built from this file must carry the visible
 * `kind: 'illustrative'` tag (see `downstream.mjs`) and render with the `--illustrative` badge,
 * never the plain `--struct` "computed" styling and never the `--warn` "this stage degraded"
 * styling — a heuristic number is neither a fact nor a fault, and conflating any of those three
 * would itself be a kind of invention this repo works hard not to commit.
 */

export const DISCLAIMER = 'Illustrative planning assumption, not a cited fact. A modeling choice or a modeled fit to a named pattern in the literature — see the basis field — never an extracted figure.';

/** Relative emphasis per go-to-market channel. A strategic modeling choice, not a market fact. */
export const CHANNEL_WEIGHTS = Object.freeze([
  Object.freeze({ channel: 'Direct commercial', weight: 1.0, basis: 'Baseline emphasis for a specialty launch with a small number of high-volume prescribers.' }),
  Object.freeze({ channel: 'Patient advocacy & registries', weight: 0.8, basis: 'Lower baseline than direct commercial, but the channel a stalled or newly-diagnosed population is found through first.' }),
  Object.freeze({ channel: 'Payer & HTA engagement', weight: 0.9, basis: 'High baseline for any orphan-priced therapy, where payer engagement gates access regardless of region.' }),
  Object.freeze({ channel: 'KOL & academic centers', weight: 0.7, basis: 'Lower baseline; matters most where trial sites already exist and referral patterns are established.' }),
]);

/**
 * Multipliers applied to channel weight when a Z-axis orphan/voucher signal is present.
 * Directionally motivated by the real signal (a stalled designation or a live voucher event is
 * real, from Z.orphan_exclusivity), the multiplier magnitude itself is a modeling choice.
 */
export const ORPHAN_URGENCY_MULTIPLIERS = Object.freeze({
  stalled_boosts_advocacy: Object.freeze({ channel: 'Patient advocacy & registries', multiplier: 1.3, basis: 'A stalled designation signals an underserved population; advocacy/registry engagement is the channel most likely to re-surface it.' }),
  voucher_boosts_payer: Object.freeze({ channel: 'Payer & HTA engagement', multiplier: 1.25, basis: 'An approved paediatric designation, the event a priority review voucher attaches to, raises the value of an early payer conversation.' }),
});

/**
 * Five-year access-ramp curve, cumulative share of eventually-treated patients reached by end
 * of each year, per scenario. Shape only (front-loaded, per the IQVIA-pattern basis above);
 * the exact numbers are Mend's modeled fit, not an extracted curve.
 */
export const ACCESS_RAMP_CURVE = Object.freeze({
  basis: 'Front-loaded ramp shape consistent with published orphan-drug market-access reporting on small, identifiable populations (IQVIA Institute); year-by-year percentages are a modeled fit to that shape, not extracted from one source.',
  low: Object.freeze([0.05, 0.12, 0.20, 0.27, 0.32]),
  base: Object.freeze([0.08, 0.20, 0.33, 0.42, 0.48]),
  high: Object.freeze([0.12, 0.30, 0.46, 0.55, 0.60]),
});

/** Price relative to the incumbent annual cost anchor from reference-tables.mjs's costFor(). */
export const PRICE_SCENARIO_MULTIPLIERS = Object.freeze({
  basis: 'Directional premium for a differentiated modality over the incumbent standard of care is grounded in the cited MODALITIES cost-of-goods class for the dominant reported mechanism; the exact multiplier per scenario is a modeling choice.',
  low: 0.7,
  base: 1.0,
  high: 1.3,
});

/** Post-exclusivity-cliff revenue floor, as a share of the year-before-cliff value. */
export const POST_CLIFF_EROSION_FLOOR = Object.freeze({
  share: 0.2,
  basis: 'Illustrative generic-entry erosion floor; actual erosion depends on the number of entrants and the modality’s manufacturing barrier to entry, neither of which this run observes.',
});

/** Share of the diagnosed population assumed reachable at all, before the yearly ramp curve applies. */
export const DIAGNOSED_SHARE = Object.freeze({
  value: 0.85,
  basis: 'Illustrative assumption that most of the population reference-tables.mjs’s EPIDEMIOLOGY table already labels "diagnosed" is reachable through the channels this run models; not a separately sourced figure.',
});

/**
 * Illustrative headcount ratios by phase and function. Shape grounded in the Tufts CSDD /
 * DiMasi-pattern basis above; the specific numbers are Mend's own modeled fit, scaled at
 * render time by the real, cited MODALITIES complexity for the dominant reported mechanism.
 */
export const HEADCOUNT_PHASES = Object.freeze(['Discovery', 'Preclinical', 'Phase 1', 'Phase 2', 'Phase 3', 'Launch']);
export const HEADCOUNT_FUNCTIONS = Object.freeze(['R&D', 'Regulatory & CMC', 'Clinical Ops', 'Commercial']);

export const HEADCOUNT_RATIOS = Object.freeze({
  basis: 'Order-of-magnitude phase-scaling pattern consistent with published biotech R&D cost/staffing benchmarking (Tufts CSDD; DiMasi et al. 2016); absolute headcounts are a modeled fit to that pattern for illustration, not a staffing plan for this program.',
  Discovery: Object.freeze({ 'R&D': 8, 'Regulatory & CMC': 1, 'Clinical Ops': 0, Commercial: 0 }),
  Preclinical: Object.freeze({ 'R&D': 14, 'Regulatory & CMC': 4, 'Clinical Ops': 1, Commercial: 0 }),
  'Phase 1': Object.freeze({ 'R&D': 12, 'Regulatory & CMC': 6, 'Clinical Ops': 10, Commercial: 1 }),
  'Phase 2': Object.freeze({ 'R&D': 10, 'Regulatory & CMC': 8, 'Clinical Ops': 22, Commercial: 3 }),
  'Phase 3': Object.freeze({ 'R&D': 8, 'Regulatory & CMC': 14, 'Clinical Ops': 55, Commercial: 12 }),
  Launch: Object.freeze({ 'R&D': 6, 'Regulatory & CMC': 12, 'Clinical Ops': 15, Commercial: 60 }),
});

/** Complexity-class multiplier applied to the base headcount ratios above. */
export const COMPLEXITY_HEADCOUNT_MULTIPLIER = Object.freeze({
  basis: 'Direction (higher manufacturing complexity needs more CMC/operations staff) is grounded in the cited MODALITIES cost-of-goods class; the multiplier magnitude is a modeling choice.',
  low: 0.8,
  moderate: 1.0,
  high: 1.3,
  'very high': 1.7,
});
