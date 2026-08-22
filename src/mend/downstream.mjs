import { STAGE_RANK } from '../axes/x-pipeline-adapter.mjs';
import { costFor, epidemiologyFor, modalityFor, modalityMix } from './reference-tables.mjs';
import {
  ACCESS_RAMP_CURVE,
  CHANNEL_WEIGHTS,
  COMPLEXITY_HEADCOUNT_MULTIPLIER,
  DIAGNOSED_SHARE,
  HEADCOUNT_FUNCTIONS,
  HEADCOUNT_PHASES,
  HEADCOUNT_RATIOS,
  ORPHAN_URGENCY_MULTIPLIERS,
  POST_CLIFF_EROSION_FLOOR,
  PRICE_SCENARIO_MULTIPLIERS,
} from './illustrative-assumptions.mjs';

/**
 * Five derived, "downstream" views built from what the five core stages already produced.
 * Every function here is pure — same inputs, same output — and every value it returns carries
 * a `kind` of `'computed'` (a deterministic formula over real axis output, no citation needed
 * because the inputs are the citation) or `'illustrative'` (uses at least one unsourced
 * planning constant from `illustrative-assumptions.mjs`, and is never presented as a fact).
 *
 * These are the same shapes `viz3d.mjs`'s three primitives expect — `points` for `scatter3d`,
 * `cells` + `xCategories`/`yCategories` for `bars3d`, `lanes` for `ribbon3d` — so `ui.mjs` can
 * hand a builder's output straight to a chart with no reshaping in between.
 */

const CRYO_EM_RESOLUTION_THRESHOLD = 3.5;
const COMPLEXITY_SIMPLICITY = Object.freeze({ low: 4, moderate: 3, high: 2, 'very high': 1 });
const HEADCOUNT_PHASE_ORDER = Object.freeze(['Discovery', 'Preclinical', 'Phase 1', 'Phase 2', 'Phase 3', 'Launch']);

function tokensOf(text) {
  return new Set(String(text ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

/** Nearest resourcing-phase bucket for a reported X stage name, via the shared STAGE_RANK ladder. */
function nearestHeadcountPhase(stageName) {
  const rank = STAGE_RANK.get(stageName);
  if (rank == null) return null;
  if (rank <= 1) return 'Discovery';
  if (rank === 2) return 'Preclinical';
  if (rank <= 4) return 'Phase 1';
  if (rank <= 6) return 'Phase 2';
  if (rank === 7) return 'Phase 3';
  return 'Launch';
}

/**
 * 1 · Product positioning — one point per pipeline program, the only per-program-granular data
 * this factory has. Every axis is computed, nothing illustrative: x is the shared development
 * stage ladder, y is a crowding-inverse over the pipeline's own mechanism text, z is the
 * inverse of that program's curated modality complexity.
 */
export function buildProductPositioning({ x } = {}) {
  const programs = (x?.records ?? []).filter((record) => record.program && record.developmentStage);
  if (!programs.length) {
    return { kind: 'computed', points: [], excludedNoModality: [], message: 'No pipeline programs with both a stage and a mechanism in this run.' };
  }

  const tokenSets = programs.map((program) => tokensOf(program.targetMechanism));
  const points = [];
  const excludedNoModality = [];

  programs.forEach((program, index) => {
    const modality = modalityFor(program.targetMechanism);
    if (!modality) {
      excludedNoModality.push(program.program);
      return;
    }
    // Jaccard similarity against every other program's mechanism text, not "do they share any
    // token at all" — a mechanism phrase almost always repeats the gene name, and counting that
    // one common word as full overlap would flatten every genuinely different mechanism (RNAi
    // vs. base editing vs. augmentation) into "fully crowded."
    const meanJaccard = programs.length > 1
      ? tokenSets.reduce((total, other, otherIndex) => {
        if (otherIndex === index) return total;
        const intersection = [...tokenSets[index]].filter((token) => other.has(token)).length;
        const union = new Set([...tokenSets[index], ...other]).size;
        return total + (union > 0 ? intersection / union : 0);
      }, 0) / (programs.length - 1)
      : 0;
    const differentiation = Math.round((1 - meanJaccard) * 100) / 10;
    const simplicity = (COMPLEXITY_SIMPLICITY[modality.complexity] ?? 0) * 2.5;

    points.push({
      x: STAGE_RANK.get(program.developmentStage) ?? 0,
      y: differentiation,
      z: simplicity,
      label: program.program,
      kind: 'computed',
      title: `${program.program} (${program.organization ?? 'organization not reported'}): stage ${program.developmentStage}, mechanism "${program.targetMechanism ?? 'not reported'}", modality ${modality.name} (${modality.complexity} complexity)`,
    });
  });

  return {
    kind: 'computed',
    points,
    excludedNoModality,
    xLabel: 'Development stage', yLabel: 'Mechanistic differentiation', zLabel: 'Manufacturing simplicity',
    basis: 'Stage from the shared X pipeline ladder; differentiation from keyword overlap across this run\'s own reported mechanisms; simplicity from the curated MODALITIES complexity class for each program\'s matched modality.',
  };
}

/**
 * 2 · Go-to-market — region × channel priority. Region trial counts are real
 * (X.site_geography); channel weights and the orphan-urgency multipliers are illustrative
 * modeling choices, disclosed in illustrative-assumptions.mjs and on every cell's title.
 */
export function buildGoToMarket({ geography, orphan } = {}) {
  const regions = geography?.summary?.regions ?? [];
  if (!regions.length) {
    return { kind: 'illustrative', cells: [], xCategories: [], yCategories: [], message: 'No trial site regions reported in this run.' };
  }

  const orphanSummary = orphan?.summary ?? {};
  const stalled = (orphanSummary.stalled_designations ?? 0) > 0;
  const voucherApproved = /approval is on record/i.test(orphanSummary.voucher?.voucher_signal ?? '');
  const { stalled_boosts_advocacy: advocacyBoost, voucher_boosts_payer: payerBoost } = ORPHAN_URGENCY_MULTIPLIERS;

  const cells = regions.flatMap((region) => CHANNEL_WEIGHTS.map((channelEntry) => {
    let weight = channelEntry.weight;
    const notes = [];
    if (stalled && channelEntry.channel === advocacyBoost.channel) {
      weight *= advocacyBoost.multiplier;
      notes.push('boosted: a stalled orphan designation is on record');
    }
    if (voucherApproved && channelEntry.channel === payerBoost.channel) {
      weight *= payerBoost.multiplier;
      notes.push('boosted: an approved paediatric designation is on record');
    }
    const priority = Math.round(region.trials * weight * 10) / 10;
    return {
      xCategory: region.region, yCategory: channelEntry.channel, z: priority,
      kind: 'illustrative',
      title: `${region.region} · ${channelEntry.channel}: priority ${priority} (${region.trials} trials × ${weight.toFixed(2)} channel weight${notes.length ? `, ${notes.join(', ')}` : ''})`,
    };
  }));

  return {
    kind: 'illustrative',
    cells,
    xCategories: regions.map((region) => region.region),
    yCategories: CHANNEL_WEIGHTS.map((entry) => entry.channel),
    xLabel: 'Region', yLabel: 'Channel', zLabel: 'Priority score',
    basis: 'Region trial counts are real, from X.site_geography. Channel weights and the stalled/voucher urgency multipliers are illustrative modeling choices — see illustrative-assumptions.mjs.',
  };
}

/**
 * 3 · Insight generalization, reframed as a triangulation scorecard: does this run's own
 * evidence agree with itself across independent stages, not a claim about any other disease
 * or program. Every cell is computed from a real signal in this run; no external disease is
 * named anywhere in this function.
 */
export function buildInsightGeneralization({ x, geography, y, identity, orphan } = {}) {
  const mix = modalityMix((x?.records ?? []).map((record) => record.targetMechanism));
  const dominant = mix.mix[0]?.modality ?? null;
  const platformLike = dominant ? /platform|transfers between targets/i.test(dominant.cmc_notes ?? '') : false;

  const resolution = y?.summary?.best_resolution_angstrom;
  const designations = orphan?.summary?.designations ?? 0;
  const regionsCovered = geography?.summary?.regions?.length ?? 0;
  const secreted = identity?.summary?.secreted;
  const locationsKnown = (identity?.summary?.subcellular_locations ?? []).length > 0;

  const cells = [
    {
      xCategory: 'Mechanism & modality', yCategory: 'Core evidence',
      z: platformLike ? 5 : 0,
      title: dominant
        ? `Dominant modality "${dominant.name}" ${platformLike ? 'is described as transferring across targets' : 'is not described as a cross-target platform'} in the curated table (X)`
        : 'No dominant modality matched from this run\'s reported mechanisms (X)',
    },
    {
      xCategory: 'Mechanism & modality', yCategory: 'Operational evidence',
      z: resolution == null ? 0 : resolution <= CRYO_EM_RESOLUTION_THRESHOLD ? 5 : 2,
      title: resolution == null
        ? 'No resolved structure in this run (Y)'
        : `Best resolution ${resolution} Å vs. the ${CRYO_EM_RESOLUTION_THRESHOLD} Å design-quality threshold (Y)`,
    },
    {
      xCategory: 'Regulatory pathway', yCategory: 'Core evidence',
      z: designations > 0 ? 5 : 0,
      title: `${designations} orphan designation(s) on record (Z.orphan_exclusivity)`,
    },
    {
      xCategory: 'Regulatory pathway', yCategory: 'Operational evidence',
      z: regionsCovered >= 2 ? 5 : regionsCovered === 1 ? 2 : 0,
      title: `Trials reported across ${regionsCovered} region(s) (X.site_geography)`,
    },
    {
      xCategory: 'Manufacturing & CMC', yCategory: 'Core evidence',
      z: dominant ? (COMPLEXITY_SIMPLICITY[dominant.complexity] ?? 0) * 1.25 : 0,
      title: dominant ? `Dominant modality "${dominant.name}" curated complexity: ${dominant.complexity} (X)` : 'No dominant modality matched (X)',
    },
    {
      xCategory: 'Manufacturing & CMC', yCategory: 'Operational evidence',
      z: secreted ? 5 : locationsKnown ? 2 : 0,
      title: secreted != null ? `Target annotated ${secreted ? 'secreted' : 'not secreted'} (Y.target_identity)` : 'No subcellular location annotated (Y.target_identity)',
    },
  ];

  return {
    kind: 'computed',
    cells,
    xCategories: ['Mechanism & modality', 'Regulatory pathway', 'Manufacturing & CMC'],
    yCategories: ['Core evidence', 'Operational evidence'],
    xLabel: 'Knowledge dimension', yLabel: 'Evidence source', zLabel: 'Triangulation score (0–5)',
    scope: 'A scorecard of how well this run\'s own evidence agrees with itself across independent stages of the same run — not an extrapolation to any other disease or program.',
  };
}

/**
 * 4 · Revenue — illustrative planning model, not a forecast in the "we predict" sense. The
 * addressable population and the incumbent price anchor are cited (reference-tables.mjs); the
 * access ramp, price scenario spread and post-cliff erosion are illustrative. The dominant
 * modality's real, cited COGS class sets the *direction* of the price adjustment. A marked
 * cliff line, if drawn, is a currently running THIRD-PARTY exclusivity clock from this run's
 * own Z.orphan_exclusivity data — shown as real market context, never as this model's own
 * (nonexistent) exclusivity date, since no designation exists yet for a hypothetical entrant.
 */
export function buildRevenueForecast({ x, orphan, disease } = {}) {
  const epidemiology = epidemiologyFor(disease);
  const cost = costFor(disease);
  if (!epidemiology.found || !cost.found || !cost.annual_usd) {
    return {
      kind: 'illustrative', lanes: [],
      message: !epidemiology.found ? epidemiology.message : cost.message,
    };
  }

  const mix = modalityMix((x?.records ?? []).map((record) => record.targetMechanism));
  const dominant = mix.mix[0]?.modality ?? null;
  // Direction only: a higher curated COGS class supports a higher plausible price relative to
  // the incumbent. The multiplier's magnitude is a modeling choice, not extracted from a source.
  const complexityLift = { low: 0.9, moderate: 1.0, high: 1.15, 'very high': 1.35 }[dominant?.complexity] ?? 1.0;
  const basePriceAnnual = ((cost.annual_usd[0] + cost.annual_usd[1]) / 2) * complexityLift;
  const addressable = epidemiology.severe_deficiency_us_estimate * DIAGNOSED_SHARE.value;

  const clocks = orphan?.summary?.clocks ?? [];
  const runningClock = clocks.find((clock) => clock.exclusivity_state === 'running' && Number.isFinite(clock.exclusivity_years_remaining));

  const scenarioColor = { low: 'var(--warn)', base: 'var(--struct)', high: 'var(--ok)' };
  const lanes = ['low', 'base', 'high'].map((scenario) => {
    const price = basePriceAnnual * PRICE_SCENARIO_MULTIPLIERS[scenario];
    const points = ACCESS_RAMP_CURVE[scenario].map((share, index) => {
      const year = index + 1;
      let revenueUsd = addressable * share * price;
      if (runningClock && year > runningClock.exclusivity_years_remaining) {
        revenueUsd *= POST_CLIFF_EROSION_FLOOR.share;
      }
      return { x: year, z: Math.round((revenueUsd / 1_000_000) * 10) / 10 };
    });
    return { name: scenario[0].toUpperCase() + scenario.slice(1), colorVar: scenarioColor[scenario], points };
  });

  return {
    kind: 'illustrative',
    lanes,
    xLabel: 'Year', zLabel: '$M',
    bandBetween: ['Low', 'High'],
    cliffAt: runningClock ? {
      x: Math.round(runningClock.exclusivity_years_remaining * 10) / 10,
      title: `Market context, not this model's own exclusivity date: the nearest currently running third-party exclusivity clock in this run ends ${runningClock.exclusivity_ends} (${runningClock.designation}, ${runningClock.agency})`,
    } : null,
    addressablePopulation: epidemiology.severe_deficiency_us_estimate,
    diagnosedShare: DIAGNOSED_SHARE.value,
    priceAnnualUsd: Math.round(basePriceAnnual),
    dominantModality: dominant?.name ?? null,
    basis: 'Addressable population and incumbent price are cited (reference-tables.mjs). Diagnosed share, access ramp, price-scenario spread and post-cliff erosion are illustrative — see illustrative-assumptions.mjs. Price direction (not magnitude) is set by this run\'s real dominant modality COGS class.',
  };
}

/**
 * 5 · Resourcing — illustrative headcount by phase and function. Ratios are a modeled fit to a
 * cited staffing/cost pattern (illustrative-assumptions.mjs), scaled by the real, cited
 * modality complexity for this run's dominant reported mechanism. The pipeline's real
 * most-advanced stage is surfaced as "you are here."
 */
export function buildResourcing({ x } = {}) {
  const mix = modalityMix((x?.records ?? []).map((record) => record.targetMechanism));
  const dominant = mix.mix[0]?.modality ?? null;
  const complexityMultiplier = COMPLEXITY_HEADCOUNT_MULTIPLIER[dominant?.complexity] ?? 1.0;
  const youAreHere = nearestHeadcountPhase(x?.summary?.mostAdvancedStage ?? null);

  const cells = HEADCOUNT_PHASES.flatMap((phase) => HEADCOUNT_FUNCTIONS.map((fn) => {
    const base = HEADCOUNT_RATIOS[phase][fn];
    const headcount = Math.round(base * complexityMultiplier);
    return {
      xCategory: phase, yCategory: fn, z: headcount,
      kind: 'illustrative',
      title: `${phase} · ${fn}: ~${headcount} FTE (illustrative base ${base} × ${complexityMultiplier.toFixed(2)} complexity multiplier)${phase === youAreHere ? ' — you are here' : ''}`,
    };
  }));

  return {
    kind: 'illustrative',
    cells,
    xCategories: [...HEADCOUNT_PHASE_ORDER],
    yCategories: [...HEADCOUNT_FUNCTIONS],
    xLabel: 'Phase', yLabel: 'Function', zLabel: 'Headcount (FTE)',
    youAreHere,
    dominantModality: dominant?.name ?? null,
    basis: 'Order-of-magnitude phase-scaling pattern from illustrative-assumptions.mjs, scaled by this run\'s real, cited modality complexity class. Not a staffing plan for this program.',
  };
}
