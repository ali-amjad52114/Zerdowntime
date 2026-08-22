import { modalityFor, modalityMix } from './reference-tables.mjs';

/**
 * Virtual cell — a simulated perturbation model.
 *
 * "Virtual cell" work in the field means a trained model that predicts cellular response to a
 * perturbation from data. This factory has no such model, and building one is out of reach
 * here — so this is not that. It is a small, fixed, fully disclosed mechanistic simulation:
 * for each modality this run's own pipeline actually reports, walk a documented cause-and-
 * effect chain through four cellular nodes and report the direction and an illustrative
 * magnitude. Every direction in CELL_EFFECTS below is a citable claim about a real mechanism
 * class in alpha-1 antitrypsin deficiency, not a guess — see the citation on each entry. A
 * modality with no documented AATD mechanism is reported as not simulated, never guessed.
 *
 * The four nodes are the two-hit AATD mechanism itself, textbook since Lomas DA et al.,
 * "The mechanism of Z alpha 1-antitrypsin accumulation in the liver," Nature, 1992, and
 * reviewed clinically in Strnad P, McElvaney NG, Lomas DA, "Alpha1-Antitrypsin Deficiency,"
 * New England Journal of Medicine, 2020:
 *   - ER polymer burden (hepatocyte): the Z-variant protein misfolds and self-polymerises in
 *     the endoplasmic reticulum instead of secreting — a toxic gain-of-function.
 *   - Secretion / circulating AAT: how much functional monomer actually reaches the lung.
 *   - Elastase inhibition capacity: circulating AAT's job — insufficient levels leave
 *     neutrophil elastase unchecked, degrading lung tissue — a loss-of-function.
 *   - Hepatocyte ER stress / proteotoxicity: the downstream consequence of polymer
 *     accumulation, implicated in the liver disease independent of the lung disease.
 *
 * Beneficial direction is node-specific and stated once per node (BENEFICIAL_DIRECTION) —
 * less polymer burden is good, more circulating AAT is good — so a chart consumer never has
 * to guess which direction "helps."
 */

export const NODES = Object.freeze(['ER polymer burden', 'Secretion / circulating AAT', 'Elastase inhibition capacity', 'ER stress / proteotoxicity']);

export const BENEFICIAL_DIRECTION = Object.freeze({
  'ER polymer burden': 'decrease',
  'Secretion / circulating AAT': 'increase',
  'Elastase inhibition capacity': 'increase',
  'ER stress / proteotoxicity': 'decrease',
});

/**
 * Documented mechanism-class effects. `direction` per node is the cited claim; `magnitude`
 * (0–10) is an illustrative modeled scale, not extracted from a source — the same two-kind
 * discipline used everywhere else in this app. `direction: null` means no established effect
 * on that node for that mechanism class.
 */
export const CELL_EFFECTS = Object.freeze({
  'Recombinant protein or peptide': Object.freeze({
    citation: 'Weekly augmentation raises circulating AAT and elastase-inhibitory capacity directly but does not address hepatocyte polymer accumulation — the well-established reason augmentation treats the lung disease and not the liver disease (Strnad, McElvaney, Lomas, NEJM 2020).',
    effects: Object.freeze({
      'ER polymer burden': { direction: null, magnitude: 0 },
      'Secretion / circulating AAT': { direction: 'increase', magnitude: 8 },
      'Elastase inhibition capacity': { direction: 'increase', magnitude: 8 },
      'ER stress / proteotoxicity': { direction: null, magnitude: 0 },
    }),
  }),
  'Oligonucleotide (siRNA / ASO)': Object.freeze({
    citation: 'RNA-silencing approaches for AATD knock down production of the mutant transcript, reducing hepatic polymer load and ER stress at the cost of already-low circulating AAT unless paired with augmentation — the documented trade-off behind hepatic-targeted siRNA/ASO programmes for AATD (e.g. fazirsiran/ARO-AAT clinical development).',
    effects: Object.freeze({
      'ER polymer burden': { direction: 'decrease', magnitude: 7 },
      'Secretion / circulating AAT': { direction: 'decrease', magnitude: 4 },
      'Elastase inhibition capacity': { direction: 'decrease', magnitude: 4 },
      'ER stress / proteotoxicity': { direction: 'decrease', magnitude: 6 },
    }),
  }),
  'Gene editing (base / prime / CRISPR)': Object.freeze({
    citation: 'Correcting the Z mutation in situ addresses both the toxic gain-of-function (misfolded polymer) and the loss-of-function (low circulating AAT) simultaneously — the mechanistic rationale for gene-correction programmes in AATD, as distinct from silencing or augmentation alone.',
    effects: Object.freeze({
      'ER polymer burden': { direction: 'decrease', magnitude: 7 },
      'Secretion / circulating AAT': { direction: 'increase', magnitude: 7 },
      'Elastase inhibition capacity': { direction: 'increase', magnitude: 7 },
      'ER stress / proteotoxicity': { direction: 'decrease', magnitude: 7 },
    }),
  }),
  'Small molecule': Object.freeze({
    citation: 'A folding corrector/chaperone class promotes correct folding and secretion of the mutant protein rather than degrading or replacing it, addressing both compartments — the same class logic as CFTR correctors, discussed in AATD therapeutic development reviews as a complement to silencing and editing approaches.',
    effects: Object.freeze({
      'ER polymer burden': { direction: 'decrease', magnitude: 6 },
      'Secretion / circulating AAT': { direction: 'increase', magnitude: 6 },
      'Elastase inhibition capacity': { direction: 'increase', magnitude: 6 },
      'ER stress / proteotoxicity': { direction: 'decrease', magnitude: 6 },
    }),
  }),
});

const POLYMERISING_VARIANT_PATTERN = /polymeris|polymeriz/i;

function tone(node, direction) {
  if (!direction) return 'neutral';
  return direction === BENEFICIAL_DIRECTION[node] ? 'ok' : 'risk';
}

/**
 * One matched modality's simulated node-by-node trace, or `null` if this modality has no
 * documented AATD mechanism mapping — reported as excluded by the caller, never guessed.
 */
function simulateModality(modalityName) {
  const documented = CELL_EFFECTS[modalityName];
  if (!documented) return null;
  return NODES.map((node) => {
    const { direction, magnitude } = documented.effects[node];
    return {
      xCategory: modalityName,
      yCategory: node,
      z: magnitude,
      tone: tone(node, direction),
      title: direction
        ? `${modalityName} on ${node}: ${direction === BENEFICIAL_DIRECTION[node] ? 'beneficial' : 'harmful'} direction (${direction}), illustrative magnitude ${magnitude}/10 — ${documented.citation}`
        : `${modalityName} on ${node}: no documented effect — ${documented.citation}`,
    };
  });
}

/**
 * Simulate the perturbation this run's own pipeline actually reports — one trace per distinct
 * matched modality present in X's records, never a modality the pipeline doesn't contain and
 * never a disease this factory doesn't run. Depends on X (which modalities are in play) and
 * Y.target_identity (whether a polymerising variant is specifically annotated in this run's
 * own data, or the simulation is running on the cited textbook mechanism alone).
 */
export function buildVirtualCellSimulation({ x, identity } = {}) {
  const mix = modalityMix((x?.records ?? []).map((record) => record.targetMechanism));
  const matchedModalities = mix.mix.map((entry) => entry.modality.name);

  if (!matchedModalities.length) {
    return {
      kind: 'computed', cells: [], xCategories: [], yCategories: [...NODES],
      message: 'No matched modality in this run\'s pipeline to simulate a perturbation for.',
    };
  }

  const cells = [];
  const notSimulated = [];
  for (const modalityName of matchedModalities) {
    const trace = simulateModality(modalityName);
    if (trace) cells.push(...trace);
    else notSimulated.push(modalityName);
  }

  const polymerisingVariant = (identity?.records ?? [])
    .flatMap((record) => record.features ?? [])
    .find((feature) => feature.kind === 'variant' && POLYMERISING_VARIANT_PATTERN.test(feature.description ?? ''));

  return {
    kind: 'illustrative',
    cells,
    xCategories: matchedModalities.filter((name) => CELL_EFFECTS[name]),
    yCategories: [...NODES],
    xLabel: 'Modality in this run\'s pipeline', yLabel: 'Cellular node', zLabel: 'Simulated effect (0–10, illustrative)',
    notSimulated,
    polymerisingVariantAnnotated: Boolean(polymerisingVariant),
    polymerisingVariantNote: polymerisingVariant
      ? `This run's own Y.target_identity data specifically annotates a polymerising variant (${polymerisingVariant.description}) — the biological basis for the ER polymer burden node below.`
      : 'No polymerising variant is specifically annotated in this run\'s Y.target_identity data; the ER polymer burden node below reflects the cited textbook Z-variant mechanism, not this run\'s own variant evidence.',
    scope: 'A documented mechanism-class simulation, not a trained predictive model and not a claim about this run\'s actual pipeline candidates\' clinical effect. Direction per node is cited; magnitude is an illustrative scale.',
  };
}
