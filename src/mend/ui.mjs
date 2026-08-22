import { caption, escapeHtml } from './html.mjs';
import { buildRunTrace } from './run-trace.mjs';
import { costFor, modalityMix } from './reference-tables.mjs';
import { cellDiagram, regionBars, resolutionPlot, sequenceTrack } from './viz.mjs';
import { bars3d, ribbon3d, scatter3d } from './viz3d.mjs';
import {
  buildGoToMarket,
  buildInsightGeneralization,
  buildProductPositioning,
  buildResourcing,
  buildRevenueForecast,
} from './downstream.mjs';
import { rollupAllDownstream } from './downstream-status.mjs';
import { factoryLine } from './factory-line.mjs';
import { buildVirtualCellSimulation } from './virtual-cell.mjs';

/**
 * The one-page answer view.
 *
 * Five panels — target, cryo-EM and mass, subcellular location, market and CMC, orphan
 * status — sitting on the three axes the factory already runs. There is no fourth axis
 * behind this page: panels 1 and 4 read X, panels 2 and 3 read Y, panel 5 reads Z.
 *
 * The run trace above the panels is the point. The dashboard is the test run and the factory
 * is the product, so an operator should be able to see which stage released, which degraded
 * and why, without opening SigNoz. A panel whose stage degraded says so on its face.
 *
 * Rendered as a string with no client-side framework: the data is already computed by the
 * time the page is built, and a hand-rolled server has nothing to hydrate.
 */

const DISEASE = 'Alpha-1 Antitrypsin Deficiency';
const TARGET = 'SERPINA1';

const STAGE_WORDS = {
  released: 'released',
  degraded: 'degraded',
  failed: 'failed',
  blocked: 'blocked',
};

function axisOf(run, axis) {
  return run?.axes?.[axis] ?? { records: [], summary: {}, validation: {}, sub_axes: {} };
}

function subAxisOf(result, name) {
  return result?.sub_axes?.[name] ?? { records: [], summary: {}, validation: {} };
}

function value(input, fallback = '—') {
  return input === null || input === undefined || input === '' ? fallback : input;
}

function stat(label, shown, note) {
  return `<div class="stat"><div class="statlab">${escapeHtml(label)}</div><div class="statval">${escapeHtml(value(shown))}</div>${
    note ? `<div class="statnote">${escapeHtml(note)}</div>` : ''}</div>`;
}

function chips(items) {
  if (!items?.length) return '';
  return `<div class="chips">${items.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join('')}</div>`;
}

function curatedTag(text = 'curated') {
  return `<span class="tag curated" title="Curated reference table with a cited basis, not a live source.">${escapeHtml(text)}</span>`;
}

/**
 * `computed` and `illustrative` distinguish the two kinds of number the downstream sections
 * produce: a deterministic formula over this run's own real axis output needs no citation
 * (the inputs are the citation), while an illustrative planning constant is a modeling choice
 * and must never be mistaken for either a cited fact or a degraded stage — hence its own
 * `--illustrative` token, never the `--warn` used for "this stage degraded."
 */
function kindTag(kind) {
  return kind === 'illustrative'
    ? '<span class="tag illustrative" title="Uses at least one illustrative planning assumption — a modeling choice, never presented as a cited fact. See the basis note below.">illustrative</span>'
    : '<span class="tag computed" title="A deterministic formula over this run\'s own real axis output. No citation needed — the inputs are the citation.">computed</span>';
}

function basisNote(basis, dependsOn) {
  return `<p class="vcap">${escapeHtml(basis ?? '')}</p><p class="mono">reads: ${escapeHtml((dependsOn ?? []).join(', '))}</p>`;
}

function evidenceList(records, { limit = 12 } = {}) {
  if (!records?.length) return caption('No evidence records on this stage.');
  const shown = records.slice(0, limit).map((record) => `<li>${
    record.source_url
      ? `<a href="${escapeHtml(record.source_url)}" target="_blank" rel="noreferrer">${escapeHtml(record.value ?? record.subject)}</a>`
      : `<span>${escapeHtml(record.value ?? record.subject)}</span>`
  }<p>${escapeHtml(record.evidence)}</p><p class="mono">${escapeHtml(record.source_name ?? '')} · retrieved ${escapeHtml(record.retrieved_at ?? 'unknown')}</p></li>`).join('');
  const more = records.length > limit
    ? `<p class="vcap">${escapeHtml(`${records.length - limit} further records not listed.`)}</p>`
    : '';
  return `<ul class="evidence">${shown}</ul>${more}`;
}

function panel({ number, title, source, stage, body, evidence }) {
  const status = stage?.status ?? 'failed';
  const gate = stage?.gate ?? 'UNKNOWN';
  const issues = stage?.issues ?? [];
  const detail = `${escapeHtml(gate)} · ${escapeHtml(stage?.records ?? 0)} records${
    issues.length ? ` · ${escapeHtml(issues.length)} ${issues.length === 1 ? 'issue' : 'issues'}` : ''}`;
  const why = issues.length
    ? `<p class="vcap flagged">${escapeHtml(`Gate reported: ${issues.join('; ')}`)}</p>`
    : '';
  return `<article class="panel p-${escapeHtml(status)}">
<div class="panelhead">
<div><span class="pnum">${escapeHtml(number)}</span><h3>${escapeHtml(title)}</h3></div>
<div class="panelmeta"><span class="pstatus s-${escapeHtml(status)}">${escapeHtml(STAGE_WORDS[status] ?? status)}</span><span class="mono">${detail}</span></div>
</div>
<p class="psource">${escapeHtml(source)}</p>
${why}${body}
<details><summary>Source evidence</summary>${evidence}</details>
</article>`;
}

function traceSection(trace) {
  const rows = trace.stages.map((stage) => `<tr class="t-${escapeHtml(stage.status)}">
<td class="mono">${escapeHtml(stage.id)}</td>
<td>${escapeHtml(stage.label)}</td>
<td><span class="pstatus s-${escapeHtml(stage.status)}">${escapeHtml(STAGE_WORDS[stage.status] ?? stage.status)}</span></td>
<td class="mono">${escapeHtml(stage.gate)}</td>
<td class="mono">${escapeHtml(stage.records)}</td>
<td>${stage.issues.length ? escapeHtml(stage.issues.join('; ')) : escapeHtml(stage.note ?? 'no issues reported')}</td>
</tr>`).join('');

  return `<section class="trace">
<div class="tracehead">
<h2>Run trace</h2>
<div class="mono">run ${escapeHtml(trace.runId ?? '—')} · factory ${escapeHtml(trace.factoryVersion ?? '—')} · mode ${escapeHtml(trace.mode ?? '—')} · publish ${escapeHtml(trace.publishStatus ?? '—')}</div>
</div>
<div class="tracecounts">
<span class="pstatus s-released">${escapeHtml(trace.counts.released)} released</span>
<span class="pstatus s-degraded">${escapeHtml(trace.counts.degraded)} degraded</span>
<span class="pstatus s-failed">${escapeHtml(trace.counts.failed)} failed</span>
<span class="mono">${escapeHtml(trace.issue_count)} gate ${trace.issue_count === 1 ? 'issue' : 'issues'} across ${escapeHtml(trace.stage_count)} stages</span>
</div>
<div class="tablewrap"><table>
<thead><tr><th>Stage</th><th>What it answers</th><th>Status</th><th>Gate</th><th>Records</th><th>Reported</th></tr></thead>
<tbody>${rows || '<tr><td colspan="6">No stage has run yet.</td></tr>'}</tbody>
</table></div>
<p class="vcap">Each stage passes its own gate before its panel renders. A stage that fails its checks is marked degraded and serves its last healthy snapshot rather than publishing thin data.</p>
</section>`;
}

/** One chip per distinct stage with its count, rather than one chip per programme. */
function stageCounts(records) {
  const counts = new Map();
  for (const record of records ?? []) {
    const stage = record.developmentStage;
    if (!stage) continue;
    counts.set(stage, (counts.get(stage) ?? 0) + 1);
  }
  return [...counts.entries()].map(([stage, count]) => `${stage} ×${count}`);
}

function targetPanel({ x, identity, stage }) {
  const summary = identity.summary ?? {};
  const pipeline = x.summary ?? {};
  const body = `<div class="stats">
${stat('Protein', summary.protein_name, summary.accession ? `UniProtKB ${summary.accession}` : null)}
${stat('Gene', summary.gene, summary.sequence_length ? `${summary.sequence_length} residues` : null)}
${stat('Programs in the pipeline', pipeline.programsFound, `${value(pipeline.organizations, 0)} organizations`)}
${stat('Most advanced stage', pipeline.mostAdvancedStage, 'as reported by the source cards')}
</div>${chips(stageCounts(x.records))}`;
  return panel({
    number: '1', title: 'Target', source: 'X — pipeline activity · UniProtKB', stage, body,
    evidence: evidenceList([...(identity.records ?? []), ...(x.records ?? [])]),
  });
}

function structurePanel({ y, identity, stage }) {
  const structures = y.summary ?? {};
  const summary = identity.summary ?? {};
  const entries = (y.records ?? []).map((record) => ({
    id: record.structure_id ?? record.value,
    method: record.experimental_method,
    resolution: record.resolution_angstrom,
  }));
  const methods = Object.entries(structures.methods ?? {})
    .map(([method, count]) => `${method.toLowerCase()} ×${count}`);

  const body = `<div class="stats">
${stat('Experimental structures', structures.experimental_structures, methods.join(' · ') || null)}
${stat('Best resolution', structures.best_resolution_angstrom == null ? null : `${structures.best_resolution_angstrom} Å`, 'design-quality line drawn at 3.5 Å')}
${stat('Cryo-EM structures', structures.cryo_em_structures ?? 0, null)}
${stat('Reported mass', summary.mass_kilodalton == null ? null : `${summary.mass_kilodalton} kDa`, summary.mass_dalton ? `${summary.mass_dalton} Da` : null)}
</div>
${resolutionPlot(entries)}
${summary.cryo_em_size_note ? `<p class="note">${escapeHtml(summary.cryo_em_size_note)}</p>` : ''}
<h4>Variants along the sequence</h4>
${sequenceTrack({
    length: summary.sequence_length,
    features: summary.features ?? [],
    hotspots: summary.variant_hotspots ?? [],
    binSize: summary.variant_bin_residues ?? 20,
  })}
${summary.variants_annotated
    ? caption(`${summary.variants_annotated} annotated variants in the saved entry. The saved feature set is a documented subset, not the complete register of known alleles.`)
    : ''}`;

  return panel({
    number: '2', title: 'Cryo-EM and mass', source: 'Y — structural readiness · RCSB PDB · UniProtKB', stage, body,
    evidence: evidenceList(y.records ?? []),
  });
}

function locationPanel({ identity, stage }) {
  const summary = identity.summary ?? {};
  const locations = summary.subcellular_locations ?? [];
  const reach = locations.length
    ? summary.secreted
      ? 'Annotated as secreted, so an extracellular binder can physically reach it.'
      : summary.membrane
        ? 'Annotated at a membrane, so accessibility depends on which face the epitope sits on.'
        : 'Annotated inside the cell, so an extracellular binder cannot reach it and the modality choice narrows.'
    : 'No annotated location, so reachability cannot be read off this entry.';

  const body = `<div class="stats">
${stat('Annotated locations', locations.join(' · ') || null, null)}
${stat('Secreted', locations.length ? (summary.secreted ? 'yes' : 'no') : null, 'read from the annotation, not inferred')}
${stat('Membrane', locations.length ? (summary.membrane ? 'yes' : 'no') : null, 'read from the annotation, not inferred')}
</div>
${cellDiagram(locations)}
<p class="note">${escapeHtml(reach)}</p>
${(summary.topology ?? []).map((text) => `<p class="vcap">${escapeHtml(text)}</p>`).join('')}`;

  return panel({
    number: '3', title: 'Subcellular location', source: 'Y — target identity · UniProtKB', stage, body,
    evidence: evidenceList(identity.records ?? []),
  });
}

function marketPanel({ x, geography, stage }) {
  const mix = modalityMix((x.records ?? []).map((record) => record.targetMechanism));
  const cost = costFor(DISEASE);

  const modalityRows = mix.mix.map((entry) => `<tr>
<td>${escapeHtml(entry.modality.name)}</td>
<td class="mono">${escapeHtml(entry.count)}</td>
<td>${escapeHtml(entry.modality.cogs_per_patient_year)}</td>
<td>${escapeHtml(entry.modality.route)}</td>
<td>${escapeHtml(entry.modality.cold_chain ? 'cold chain' : 'ambient')}</td>
<td><a href="${escapeHtml(entry.modality.source_url)}" target="_blank" rel="noreferrer">source</a></td>
</tr>`).join('');

  const costBlock = cost.found
    ? `<div class="costcard">
<div class="statlab">Incumbent to beat ${curatedTag()}</div>
<div class="statval">${escapeHtml(cost.annual_usd_display)}</div>
<p>${escapeHtml(cost.standard_of_care)}</p>
<p class="vcap">${escapeHtml(cost.basis)} · <a href="${escapeHtml(cost.source_url)}" target="_blank" rel="noreferrer">${escapeHtml(cost.source)}</a></p>
${cost.note ? `<p class="note">${escapeHtml(cost.note)}</p>` : ''}
</div>`
    : `<div class="costcard">${caption(cost.message)}</div>`;

  const body = `${costBlock}
<h4>Where the trials actually run</h4>
${regionBars(geography.summary ?? {})}
<h4>CMC by modality ${curatedTag()}</h4>
${modalityRows
    ? `<div class="tablewrap"><table><thead><tr><th>Modality</th><th>Programs</th><th>Cost of goods</th><th>Route</th><th>Handling</th><th></th></tr></thead><tbody>${modalityRows}</tbody></table></div>`
    : caption('No reported mechanism in this run names a modality.')}
${mix.unmatched.length
    ? caption(`Not assigned a modality: ${mix.unmatched.join(' · ')}. ${mix.match_note}`)
    : caption(mix.match_note)}`;

  return panel({
    number: '4', title: 'Market and CMC', source: 'X — pipeline and trial sites · curated reference tables', stage, body,
    evidence: evidenceList(geography.records ?? []),
  });
}

function orphanPanel({ z, orphan, stage }) {
  const summary = orphan.summary ?? {};
  const ip = z.summary ?? {};
  const clocks = summary.clocks ?? [];
  const voucher = summary.voucher ?? {};

  const clockRows = clocks.map((clock) => `<tr class="${clock.stalled ? 'stalled' : ''}">
<td>${escapeHtml(clock.designation)}${clock.stalled ? '<span class="tag risk" title="Designated over ten years ago with no approval on record.">stalled</span>' : ''}</td>
<td class="mono">${escapeHtml(clock.agency)}</td>
<td class="mono">${escapeHtml(clock.years_since_designation == null ? '—' : `${clock.years_since_designation} yr`)}</td>
<td>${escapeHtml(clock.exclusivity_state)}</td>
<td class="mono">${escapeHtml(clock.exclusivity_years_remaining == null ? '—' : `${clock.exclusivity_years_remaining} yr left`)}</td>
<td class="mono">${escapeHtml(clock.exclusivity_ends ?? '—')}</td>
</tr>`).join('');

  const bands = (voucher.reported_value_bands ?? []).map((band) => `<li><b>${escapeHtml(band.era)}</b> — ${
    escapeHtml(band.usd_millions ? `$${band.usd_millions}M` : `$${band.usd_millions_range?.[0]}–${band.usd_millions_range?.[1]}M`)
  }<p>${escapeHtml(band.note ?? '')}</p></li>`).join('');

  const body = `<div class="stats">
${stat('Designations on record', summary.designations, (summary.agencies ?? []).join(' · ') || null)}
${stat('Exclusivity clocks running', summary.exclusivity_running, summary.longest_exclusivity_years_remaining == null ? null : `longest ${summary.longest_exclusivity_years_remaining} yr remaining`)}
${stat('Stalled designations', summary.stalled_designations, 'over ten years old with no approval')}
${stat('Patent publications visible', ip.relevant_records, `${value(ip.known_assignees, 0)} named assignees · ${value(ip.recent_activity, 0)} in the last ${value(ip.recent_window_years, 3)} years`)}
</div>
${clockRows
    ? `<div class="tablewrap"><table><thead><tr><th>Designation</th><th>Agency</th><th>Age</th><th>Exclusivity</th><th>Remaining</th><th>Ends</th></tr></thead><tbody>${clockRows}</tbody></table></div>`
    : caption('No designation on record in this set.')}
<h4>Priority review voucher ${curatedTag()}<span class="tag warn" title="Voucher values are reported transactions, not a quote, and the programme has been subject to sunset and reauthorisation.">verify before relying</span></h4>
<p class="note">${escapeHtml(voucher.voucher_signal ?? 'No voucher signal reported.')}</p>
${bands ? `<ul class="bands">${bands}</ul>` : ''}
${voucher.planning_midpoint_usd_millions
    ? caption(`Reported planning midpoint $${voucher.planning_midpoint_usd_millions}M. ${voucher.disclaimer ?? ''}`)
    : ''}
${summary.disclaimer ? `<p class="vcap">${escapeHtml(summary.disclaimer)}</p>` : ''}
${ip.disclaimer ? `<p class="vcap">${escapeHtml(ip.disclaimer)}</p>` : ''}`;

  return panel({
    number: '5', title: 'Orphan status and exclusivity', source: 'Z — orphan register and patent activity', stage, body,
    evidence: evidenceList([...(orphan.records ?? []), ...(z.records ?? [])]),
  });
}

/**
 * The five downstream/derived sections. Each reads its data from `downstream.mjs`'s pure
 * builders and its status from `downstream-status.mjs`'s rollup — the same `panel()` helper
 * every core panel already uses, unchanged, because the rollup's shape matches a run-trace
 * stage exactly. A `blocked` section still calls its builder: with the empty axis data a
 * blocked dependency actually produces, the builder's own honest "no data" message becomes
 * the chart's caption — no separate fabricated placeholder is needed.
 */

function positioningPanel({ x, rollup }) {
  const result = buildProductPositioning({ x });
  const body = `${kindTag(result.kind)}
${scatter3d(result.points, { ariaLabel: 'Product positioning by stage, differentiation and manufacturing simplicity', xLabel: result.xLabel, yLabel: result.yLabel, zLabel: result.zLabel, colorVar: 'var(--struct)' })}
${result.message ? caption(result.message) : ''}
${result.excludedNoModality?.length ? caption(`Not plotted, no matched modality: ${result.excludedNoModality.join(', ')}.`) : ''}`;
  return panel({
    number: '6', title: 'Product positioning', source: 'Derived from X — pipeline activity', stage: rollup, body,
    evidence: basisNote(result.basis, rollup.dependsOn),
  });
}

function goToMarketPanel({ geography, orphan, rollup }) {
  const result = buildGoToMarket({ geography, orphan });
  const body = `${kindTag(result.kind)}
${bars3d(result.cells, { ariaLabel: 'Go-to-market priority by region and channel', xCategories: result.xCategories, yCategories: result.yCategories, xLabel: result.xLabel, yLabel: result.yLabel, zLabel: result.zLabel, topColorVar: 'var(--struct)' })}
${result.message ? caption(result.message) : ''}`;
  return panel({
    number: '7', title: 'Go-to-market strategy', source: 'Derived from X.site_geography and Z.orphan_exclusivity', stage: rollup, body,
    evidence: basisNote(result.basis, rollup.dependsOn),
  });
}

function generalizationPanel({ x, geography, y, identity, orphan, rollup }) {
  const result = buildInsightGeneralization({ x, geography, y, identity, orphan });
  const body = `${kindTag(result.kind)}
<p class="note">${escapeHtml(result.scope ?? '')}</p>
${bars3d(result.cells, { ariaLabel: 'Insight generalization triangulation scorecard', xCategories: result.xCategories, yCategories: result.yCategories, xLabel: result.xLabel, yLabel: result.yLabel, zLabel: result.zLabel, topColorVar: 'var(--ok)' })}`;
  return panel({
    number: '8', title: 'Insight generalization', source: 'Derived from all five core stages', stage: rollup, body,
    evidence: basisNote('A triangulation scorecard over this run\'s own six real signals — never a claim about any other disease or program.', rollup.dependsOn),
  });
}

function revenuePanel({ x, orphan, disease, rollup }) {
  const result = buildRevenueForecast({ x, orphan, disease });
  const body = `${kindTag(result.kind)}
${ribbon3d(result.lanes, { ariaLabel: 'Revenue illustrative planning model by year and scenario', xLabel: result.xLabel, zLabel: result.zLabel, bandBetween: result.bandBetween, cliffAt: result.cliffAt })}
${result.message ? caption(result.message) : ''}
${result.addressablePopulation ? `<p class="note">Addressable population ${escapeHtml(result.addressablePopulation.toLocaleString('en-US'))} (cited) × ${escapeHtml(Math.round((result.diagnosedShare ?? 0) * 100))}% diagnosed-and-reachable share (illustrative) × an access ramp (illustrative) × ~$${escapeHtml(Math.round((result.priceAnnualUsd ?? 0) / 1000))}k per patient per year, price direction set by this run's dominant modality (${escapeHtml(result.dominantModality ?? 'unmatched')}).</p>` : ''}`;
  return panel({
    number: '9', title: 'Revenue — illustrative planning model', source: 'Derived from X and Z.orphan_exclusivity, anchored on cited reference tables', stage: rollup, body,
    evidence: basisNote(result.basis, rollup.dependsOn),
  });
}

function resourcingPanel({ x, rollup }) {
  const result = buildResourcing({ x });
  const body = `${kindTag(result.kind)}
${bars3d(result.cells, { ariaLabel: 'Resourcing headcount by phase and function', xCategories: result.xCategories, yCategories: result.yCategories, xLabel: result.xLabel, yLabel: result.yLabel, zLabel: result.zLabel, topColorVar: 'var(--warn)' })}
${result.youAreHere ? caption(`You are here: ${result.youAreHere}, by this run's most advanced reported stage.`) : ''}`;
  return panel({
    number: '10', title: 'Resourcing', source: 'Derived from X — pipeline activity', stage: rollup, body,
    evidence: basisNote(result.basis, rollup.dependsOn),
  });
}

function virtualCellPanel({ x, identity, rollup }) {
  const result = buildVirtualCellSimulation({ x, identity });
  const body = `${kindTag(result.kind)}
<p class="note">${escapeHtml(result.scope ?? '')}</p>
${bars3d(result.cells, { ariaLabel: 'Virtual cell simulated perturbation by modality and cellular node', xCategories: result.xCategories, yCategories: result.yCategories, xLabel: result.xLabel, yLabel: result.yLabel, zLabel: result.zLabel, topColorVar: 'var(--struct)' })}
${result.message ? caption(result.message) : ''}
${result.notSimulated?.length ? caption(`Not simulated, no documented AATD mechanism mapping: ${result.notSimulated.join(', ')}.`) : ''}
${result.polymerisingVariantNote ? caption(result.polymerisingVariantNote, { flagged: !result.polymerisingVariantAnnotated }) : ''}`;
  return panel({
    number: '11', title: 'Virtual cell — simulated perturbation', source: 'Derived from X and Y.target_identity', stage: rollup, body,
    evidence: basisNote('A documented mechanism-class simulation over four cellular nodes (src/mend/virtual-cell.mjs), not a trained predictive model.', rollup.dependsOn),
  });
}

function downstreamSection(rollup) {
  const rows = Object.values(rollup).map((entry) => `<tr class="t-${escapeHtml(entry.status)}">
<td>${escapeHtml(entry.label)}</td>
<td><span class="pstatus s-${escapeHtml(entry.status)}">${escapeHtml(STAGE_WORDS[entry.status] ?? entry.status)}</span></td>
<td class="mono">${escapeHtml(entry.dependsOn.join(', '))}</td>
<td>${entry.note ? escapeHtml(entry.note) : 'no issues reported'}</td>
</tr>`).join('');

  return `<section class="trace">
<div class="tracehead"><h2>Derived / downstream</h2></div>
<p class="sub">Views built from what the five stages above already produced — not a further stage the factory validates, a UI-level read of the same run.</p>
<div class="tablewrap"><table>
<thead><tr><th>Section</th><th>Status</th><th>Reads</th><th>Reported</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>
</section>`;
}

const STYLES = `
:root{
--paper:#F1F3F0;--panel:#FBFCFA;--ink:#131A17;--ink-2:#4C574F;--ink-3:#7C877E;
--rule:#D7DCD4;--rule-2:#C2C9BE;
--ok:#1B6B4C;--ok-bg:#E4EFE8;--warn:#8A5300;--warn-bg:#F6EDDD;--risk:#A33C1E;--risk-bg:#F6E8E2;
--struct:#2E4EA8;--struct-bg:#E6EAF6;
--illustrative:#6D4C9F;--illustrative-bg:#EFE8F7;
--loc-on:var(--struct-bg);--loc-on-line:var(--struct);--loc-on-text:var(--struct);
--loc-off:transparent;--loc-off-line:var(--rule-2);
--vseq-backbone:var(--rule-2);--vseq-variant:#A33C1E;--vseq-domain:#2E4EA8;--vseq-signal:#8A5300;
--vres-em:#2E4EA8;--vres-xray:#8A5300;--vres-other:#7C877E;--vres-line:#A33C1E;
--bars3d-side-l:#B7C3EA;--bars3d-side-r:#8DA0DD;
--bars3d-ok-side-l:#9FD3BB;--bars3d-ok-side-r:#6FB897;
--bars3d-risk-side-l:#E3AD9B;--bars3d-risk-side-r:#CC7D62;
--bars3d-neutral-side-l:#C7CCC4;--bars3d-neutral-side-r:#A9B0A5;
--mono:ui-monospace,SFMono-Regular,Menlo,monospace;
--body:"Inter Tight",system-ui,-apple-system,sans-serif;
}
@media (prefers-color-scheme:dark){:root{
--paper:#0F1512;--panel:#161D19;--ink:#E8EDE9;--ink-2:#A9B3AD;--ink-3:#7C877E;
--rule:#26302B;--rule-2:#38443D;
--ok:#6DC79E;--ok-bg:#16281F;--warn:#D9A24E;--warn-bg:#2A2115;--risk:#E08A6A;--risk-bg:#2B1B14;
--struct:#8FA9E8;--struct-bg:#171E30;
--illustrative:#B69FE0;--illustrative-bg:#241C33;
--vseq-variant:#E08A6A;--vseq-domain:#8FA9E8;--vseq-signal:#D9A24E;
--vres-em:#8FA9E8;--vres-xray:#D9A24E;--vres-other:#9AA79F;--vres-line:#E08A6A;
--bars3d-side-l:#3A4A78;--bars3d-side-r:#2A3860;
--bars3d-ok-side-l:#2E4A3C;--bars3d-ok-side-r:#1E3830;
--bars3d-risk-side-l:#4A3226;--bars3d-risk-side-r:#3A241A;
--bars3d-neutral-side-l:#3A423C;--bars3d-neutral-side-r:#2C332E;
}}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--body);line-height:1.5}
.shell{max-width:1120px;margin:auto;padding:40px 22px 72px}
header.top{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;border-bottom:1px solid var(--rule);padding-bottom:22px}
.eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.16em;color:var(--ink-3);text-transform:uppercase}
h1{font-size:40px;margin:6px 0 2px;letter-spacing:-.02em}
h2{font-size:19px;margin:0}
h3{font-size:18px;margin:0}
h4{font-size:13px;margin:22px 0 8px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2)}
.sub{color:var(--ink-2);margin:0}
.runpill{border:1px solid var(--rule-2);border-radius:999px;padding:9px 15px;background:var(--panel);font-family:var(--mono);font-size:12px;white-space:nowrap}
.trace{margin:26px 0 30px;background:var(--panel);border:1px solid var(--rule);border-radius:14px;padding:20px}
.tracehead{display:flex;justify-content:space-between;gap:16px;align-items:baseline;flex-wrap:wrap}
.tracehead .mono{color:var(--ink-2);font-size:12px}
.tracecounts{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:14px 0 10px}
.tracecounts .mono{font-size:12px;color:var(--ink-2)}
.tablewrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13px;min-width:520px}
th{text-align:left;font-weight:600;color:var(--ink-2);font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding:8px 10px;border-bottom:1px solid var(--rule)}
td{padding:9px 10px;border-bottom:1px solid var(--rule);vertical-align:top}
tr.stalled td{background:var(--risk-bg)}
.panels{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}
.panels-downstream{display:grid;grid-template-columns:1fr;gap:18px}
.panel{background:var(--panel);border:1px solid var(--rule);border-radius:14px;padding:22px}
.panel.p-degraded{border-color:var(--warn)}
.panel.p-failed,.panel.p-blocked{border-color:var(--risk)}
.panel:nth-child(1),.panel:nth-child(4),.panel:nth-child(5){grid-column:1/-1}
.panelhead{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
.panelhead>div:first-child{display:flex;gap:10px;align-items:baseline}
.pnum{font-family:var(--mono);color:var(--ink-3);font-size:13px}
.panelmeta{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.panelmeta .mono{font-size:11px;color:var(--ink-3)}
.psource{margin:6px 0 14px;color:var(--ink-3);font-size:12px;font-family:var(--mono)}
.pstatus{font-family:var(--mono);font-size:11px;padding:3px 9px;border-radius:999px;text-transform:uppercase;letter-spacing:.06em}
.s-released{background:var(--ok-bg);color:var(--ok)}
.s-degraded{background:var(--warn-bg);color:var(--warn)}
.s-failed,.s-blocked{background:var(--risk-bg);color:var(--risk)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:16px}
.stat{border-left:2px solid var(--rule-2);padding-left:12px}
.statlab{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3)}
.statval{font-size:22px;font-weight:650;letter-spacing:-.01em;margin:2px 0}
.statnote{font-size:12px;color:var(--ink-2)}
.note{font-size:13px;color:var(--ink-2);background:var(--struct-bg);border-left:2px solid var(--struct);padding:10px 12px;border-radius:0 6px 6px 0}
.viz{margin:12px 0}
.viz svg{width:100%;height:auto;display:block}
.viz3d{margin:12px 0}
.viz3d svg{width:100%;height:auto;display:block;max-height:340px}
.factoryline{margin:14px 0}
.factoryline svg{width:100%;height:auto;display:block}
.vcap{font-size:12px;color:var(--ink-3);margin:8px 0 0}
.vcap.flagged,.geostats .flagged{color:var(--risk)}
.vtiny{font-size:8px;font-family:var(--mono)}
.vkey{display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--ink-2);margin-top:8px}
.vkey i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px}
.geostats{display:flex;gap:16px;font-size:12px;color:var(--ink-2);margin-bottom:12px;flex-wrap:wrap}
.bar{margin:9px 0}
.barlab{display:flex;justify-content:space-between;font-size:12px;color:var(--ink-2)}
.bartrack{height:7px;background:var(--rule);border-radius:4px;overflow:hidden;margin-top:4px}
.barfill{height:100%;background:var(--struct)}
.chips{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}
.chip{font-size:11px;font-family:var(--mono);border:1px solid var(--rule-2);border-radius:999px;padding:3px 9px;color:var(--ink-2)}
.tag{font-size:10px;font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;padding:2px 7px;border-radius:999px;margin-left:8px;vertical-align:middle}
.tag.curated,.tag.computed{background:var(--struct-bg);color:var(--struct)}
.tag.illustrative{background:var(--illustrative-bg);color:var(--illustrative)}
.tag.warn{background:var(--warn-bg);color:var(--warn)}
.tag.risk{background:var(--risk-bg);color:var(--risk)}
.costcard{border:1px solid var(--rule);border-radius:10px;padding:16px;background:var(--paper)}
.costcard p{font-size:13px;color:var(--ink-2);margin:6px 0}
.bands{padding-left:18px;font-size:13px;color:var(--ink-2)}
.bands p{margin:2px 0;font-size:12px;color:var(--ink-3)}
details{margin-top:18px;border-top:1px solid var(--rule);padding-top:12px}
summary{cursor:pointer;font-size:12px;font-family:var(--mono);color:var(--ink-2)}
ul.evidence{padding-left:18px;font-size:13px}
ul.evidence li{margin:12px 0}
ul.evidence p{margin:3px 0;font-size:12px;color:var(--ink-2)}
a{color:var(--struct)}
.mono{font-family:var(--mono)}
footer{margin-top:34px;border-top:1px solid var(--rule);padding-top:16px;font-size:12px;color:var(--ink-3)}
@media(max-width:860px){.panels{grid-template-columns:1fr}header.top{flex-direction:column;align-items:flex-start}h1{font-size:32px}}
`;

function page({ title, content }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head><body><main class="shell">${content}</main></body></html>`;
}

function header(trace) {
  const status = trace.status ?? 'NOT_RUN';
  const tone = status === 'HEALTHY' ? 'released' : status === 'DEGRADED' ? 'degraded' : 'failed';
  return `<header class="top">
<div>
<div class="eyebrow">Mend · agentic software factory</div>
<h1>${escapeHtml(TARGET)}</h1>
<p class="sub">${escapeHtml(DISEASE)}</p>
</div>
<div class="runpill"><span class="pstatus s-${escapeHtml(tone)}">${escapeHtml(status)}</span> factory ${escapeHtml(trace.factoryVersion ?? '—')} · ${escapeHtml(trace.publishStatus ?? 'not published')}</div>
</header>`;
}

/** The empty state is a page, not a 500: the factory simply has not run in this process yet. */
export function renderEmptyView() {
  return page({
    title: `Mend — ${TARGET}/AATD`,
    content: `${header(buildRunTrace(null))}
<section class="trace">
<h2>No run yet</h2>
<p class="sub">The dashboard is the test run, so it renders a run or it renders nothing. Start one:</p>
<div class="tablewrap"><table><tbody>
<tr><td class="mono">POST /mend/runs {"mode":"normal"}</td><td>v1, every axis healthy</td></tr>
<tr><td class="mono">POST /mend/runs {"mode":"break-x"}</td><td>X extraction quarantined, previous healthy preserved</td></tr>
<tr><td class="mono">POST /mend/runs {"mode":"repaired"}</td><td>v2 adapter, X recovered</td></tr>
</tbody></table></div>
<p class="vcap">Or run <span class="mono">npm run mend:site</span>, which seeds a healthy run and serves this page.</p>
</section>`,
  });
}

export function renderTargetView(run) {
  if (!run?.axes) return renderEmptyView();
  const trace = buildRunTrace(run);
  const stageOf = (id) => trace.stages.find((stage) => stage.id === id) ?? { status: 'failed', gate: 'UNKNOWN', records: 0, issues: [] };

  const x = axisOf(run, 'X');
  const y = axisOf(run, 'Y');
  const z = axisOf(run, 'Z');
  const geography = subAxisOf(x, 'site_geography');
  const identity = subAxisOf(y, 'target_identity');
  const orphan = subAxisOf(z, 'orphan_exclusivity');

  const panels = [
    targetPanel({ x, identity, stage: stageOf('X') }),
    structurePanel({ y, identity, stage: stageOf('Y') }),
    locationPanel({ identity, stage: stageOf('Y.target_identity') }),
    marketPanel({ x, geography, stage: stageOf('X.site_geography') }),
    orphanPanel({ z, orphan, stage: stageOf('Z.orphan_exclusivity') }),
  ].join('');

  const downstreamRollup = rollupAllDownstream(trace);
  const downstreamPanels = [
    positioningPanel({ x, rollup: downstreamRollup.product_positioning }),
    goToMarketPanel({ geography, orphan, rollup: downstreamRollup.go_to_market }),
    generalizationPanel({ x, geography, y, identity, orphan, rollup: downstreamRollup.insight_generalization }),
    revenuePanel({ x, orphan, disease: DISEASE, rollup: downstreamRollup.revenue_forecast }),
    resourcingPanel({ x, rollup: downstreamRollup.resourcing }),
    virtualCellPanel({ x, identity, rollup: downstreamRollup.virtual_cell_simulation }),
  ].join('');

  return page({
    title: `Mend — ${TARGET}/AATD`,
    content: `${header(trace)}
<section class="trace">
<div class="tracehead"><h2>Factory line</h2></div>
<p class="sub">Disease name in, five stations, six derived products — a break in any station is visible all the way through.</p>
${factoryLine(trace, downstreamRollup)}
</section>
${traceSection(trace)}
<section class="panels">${panels}</section>
${downstreamSection(downstreamRollup)}
<section class="panels panels-downstream">${downstreamPanels}</section>
<footer>Five panels over three axes: X — pipeline activity, Y — structural readiness, Z — IP activity and orphan exclusivity. The derived sections below read the same five panels; a computed value is a formula over this run's own data, an illustrative value is a disclosed planning assumption, and neither is a forecast of actual performance or a trained predictive model. Curated tables carry a cited basis and are not live sources. Designation is not approval, exclusivity accrues on approval, and none of this is legal, regulatory, investment or clinical advice.</footer>`,
  });
}
