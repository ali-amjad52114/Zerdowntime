/**
 * Curated reference tables.
 *
 * There is no free API for the cost of care or for cost of goods, so these are small sourced
 * tables rather than a guess. Every row carries its basis and a source, every consumer gets
 * `curated: true`, and the one-page view prints that label on screen. Do not add a figure you
 * cannot cite, and do not present these as live.
 *
 * Adding a disease or a modality is a single entry in the arrays below.
 */

/** Cost of the incumbent — what a new entrant would have to beat, not what the pipeline costs. */
export const COSTS = Object.freeze([
  Object.freeze({
    match: /alpha[- ]?1[- ]?antitrypsin|\bAATD\b|alpha[- ]?1 deficiency/i,
    label: 'Alpha-1 antitrypsin deficiency',
    standard_of_care: 'Weekly IV plasma-derived augmentation therapy (Prolastin-C, Zemaira, Aralast, Glassia)',
    annual_usd: Object.freeze([100000, 200000]),
    basis: 'Weight-based weekly infusion, lifelong; published US cost-effectiveness analyses',
    source: 'NCBI Bookshelf review of alpha-1 antitrypsin deficiency management',
    source_url: 'https://www.ncbi.nlm.nih.gov/books/NBK442030/',
    note: 'Augmentation slows lung decline without correcting the underlying misfolding, so the incumbent is expensive and only partly effective — a high bar on price, a low one on efficacy.',
  }),
]);

/** CMC by modality — what it takes to actually make each kind of drug. */
export const MODALITIES = Object.freeze([
  Object.freeze({
    match: /small molecule|smallmolecule|small-molecule/i,
    name: 'Small molecule',
    cogs_per_patient_year: '$1–500',
    complexity: 'low',
    route: 'usually oral',
    cold_chain: false,
    cmc_notes: 'Chemical synthesis, well-understood scale-up, a generic route after exclusivity. The cheapest thing to make and the easiest to distribute, which is why it stays the default when the target allows it.',
    source: 'WHO pricing and procurement guidance for essential medicines',
    source_url: 'https://www.who.int/publications/i/item/9789240034488',
  }),
  Object.freeze({
    match: /antibody|monoclonal|\bmab\b|biologic/i,
    name: 'Monoclonal antibody',
    cogs_per_patient_year: '$1,000–20,000',
    complexity: 'high',
    route: 'IV or subcutaneous',
    cold_chain: true,
    cmc_notes: 'Mammalian cell culture, purification trains and lot-to-lot comparability. Dose is weight-based, so cost scales with the patient, and biosimilars are slow and expensive to bring.',
    source: 'Biomanufacturing cost-of-goods literature',
    source_url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6650427/',
  }),
  Object.freeze({
    match: /protein|enzyme|peptide|fusion|augmentation/i,
    name: 'Recombinant protein or peptide',
    cogs_per_patient_year: '$500–15,000',
    complexity: 'high',
    route: 'injected',
    cold_chain: true,
    cmc_notes: 'Expression, folding and glycosylation control dominate. Plasma-derived versions carry a donor supply constraint that no amount of demand can shortcut — the reason augmentation therapies stay expensive.',
    source: 'Plasma fractionation and recombinant protein manufacturing reviews',
    source_url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7126133/',
  }),
  Object.freeze({
    match: /oligonucleotide|sirna|antisense|\baso\b|rna silencing|\brnai\b|\brna\b/i,
    name: 'Oligonucleotide (siRNA / ASO)',
    cogs_per_patient_year: '$2,000–30,000',
    complexity: 'moderate',
    route: 'subcutaneous, often quarterly',
    cold_chain: true,
    cmc_notes: 'Solid-phase synthesis with conjugate chemistry (GalNAc for liver targets). Costly per gram but dosed rarely, and the platform transfers between targets — the fastest route from sequence to clinic for a liver-expressed protein.',
    source: 'Oligonucleotide therapeutics manufacturing reviews',
    source_url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8848015/',
  }),
  Object.freeze({
    match: /gene therapy|\baav\b|lentivir|viral vector/i,
    name: 'Gene therapy (viral vector)',
    cogs_per_patient_year: 'one-time, $500k–3.5M list',
    complexity: 'very high',
    route: 'single IV or local administration',
    cold_chain: true,
    cmc_notes: 'Vector production is the bottleneck: batch yields, empty-capsid ratios and potency assays. One dose per patient for life, so the whole cost sits in a single lot, and a manufacturing failure is a clinical failure.',
    source: 'AAV manufacturing and pricing analyses',
    source_url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8642384/',
  }),
  Object.freeze({
    match: /base edit|prime edit|crispr|gene edit|gene correction/i,
    name: 'Gene editing (base / prime / CRISPR)',
    cogs_per_patient_year: 'one-time, $1M–3M list',
    complexity: 'very high',
    route: 'LNP-delivered IV, or ex vivo',
    cold_chain: true,
    cmc_notes: 'Guide RNA plus editor mRNA plus lipid nanoparticle, each with its own release testing. Off-target assessment is a regulatory centrepiece rather than a footnote.',
    source: 'FDA cellular and gene therapy product guidance',
    source_url: 'https://www.fda.gov/vaccines-blood-biologics/cellular-gene-therapy-products',
  }),
  Object.freeze({
    match: /cell therapy|\bcar[- ]?t\b|stem cell/i,
    name: 'Cell therapy',
    cogs_per_patient_year: 'one-time, $300k–500k list',
    complexity: 'very high',
    route: 'infusion after conditioning',
    cold_chain: true,
    cmc_notes: 'Every dose is its own manufacturing run, often autologous. Vein-to-vein time is a clinical constraint and release testing sits on the critical path for one named patient.',
    source: 'CAR-T manufacturing cost literature',
    source_url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8424410/',
  }),
]);

const CURATED_NOTE = 'Curated reference table, not a live source. Figures are order-of-magnitude and carry their basis and citation.';

/** Cost of the incumbent for a disease, or an explicit statement that there is no curated row. */
export function costFor(disease) {
  const haystack = String(disease ?? '');
  const row = COSTS.find((entry) => entry.match.test(haystack));
  if (!row) {
    return {
      curated: true,
      found: false,
      disease: haystack || null,
      message: 'No curated cost reference for this disease. Cost of care has no free API, so Mend keeps a small sourced table rather than guessing — add a row in src/mend/reference-tables.mjs.',
      note: CURATED_NOTE,
    };
  }
  const { match, ...rest } = row;
  return {
    curated: true,
    found: true,
    disease: haystack,
    ...rest,
    annual_usd_display: rest.annual_usd
      ? `$${(rest.annual_usd[0] / 1000).toFixed(0)}k–${(rest.annual_usd[1] / 1000).toFixed(0)}k per patient per year`
      : null,
    note_curated: CURATED_NOTE,
  };
}

/** Match one reported mechanism to a modality by keyword. An unmatched mechanism stays unmatched. */
export function modalityFor(mechanism) {
  const haystack = String(mechanism ?? '').trim();
  if (!haystack) return null;
  const row = MODALITIES.find((entry) => entry.match.test(haystack));
  if (!row) return null;
  const { match, ...rest } = row;
  return { ...rest, matched_on: haystack };
}

/**
 * Summarise the modality mix across the mechanisms an axis actually reported.
 *
 * The mapping is a keyword match on source text, not a claim about how a programme works.
 * Mechanisms that match nothing are returned in `unmatched` rather than assigned a modality.
 */
export function modalityMix(mechanisms = []) {
  const counts = new Map();
  const unmatched = [];
  for (const mechanism of mechanisms) {
    const modality = modalityFor(mechanism);
    if (!modality) {
      const text = String(mechanism ?? '').trim();
      if (text) unmatched.push(text);
      continue;
    }
    const entry = counts.get(modality.name) ?? { modality, count: 0, mechanisms: [] };
    entry.count += 1;
    entry.mechanisms.push(modality.matched_on);
    counts.set(modality.name, entry);
  }
  return {
    curated: true,
    note: CURATED_NOTE,
    match_note: 'Modality is matched from the mechanism text reported by the source. Unmatched programmes are listed, never assigned.',
    mix: [...counts.values()].sort((a, b) => b.count - a.count || a.modality.name.localeCompare(b.modality.name)),
    unmatched: [...new Set(unmatched)],
  };
}
