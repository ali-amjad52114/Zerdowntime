import { caption, escapeHtml, num } from './html.mjs';

/**
 * Four hand-drawn SVG visualisations. No chart library: the geometry is simple, the bundle
 * cost is not worth it, and every mark carries a <title> so hovering gives the record behind
 * it. Colours come from CSS variables so light and dark both work, and each function
 * degrades to a caption rather than an empty box when its input is missing.
 */

const ZONES = [
  { id: 'extracellular', match: /secreted|extracellular/i },
  { id: 'membrane', match: /membrane(?!.*(?:mitochond|nuclear|golgi|endoplasmic|lysosom))/i },
  { id: 'cytoplasm', match: /cytoplasm|cytosol/i },
  { id: 'er', match: /endoplasmic reticulum|\bER\b|microsome/i },
  { id: 'golgi', match: /golgi/i },
  { id: 'nucleus', match: /nucleus|nuclear|nucleoplasm|nucleolus/i },
  { id: 'mitochondrion', match: /mitochond/i },
  { id: 'lysosome', match: /lysosom|endosom|vesicle|vacuole/i },
];

/**
 * 1 · Where in the cell. Compartments the protein is annotated in light up, the rest stay
 * grey. This is what makes "secreted" legible: a biologic can reach an extracellular target
 * and cannot reach an intracellular one, and the diagram says it faster than a sentence.
 */
export function cellDiagram(locations = []) {
  const list = (locations ?? []).filter(Boolean);
  if (!list.length) {
    return caption('No subcellular location annotated on the source entry, so no compartment is highlighted.');
  }
  const joined = list.join(' · ');
  const on = (id) => ZONES.find((zone) => zone.id === id)?.match.test(joined) ?? false;
  const fill = (id) => (on(id) ? 'var(--loc-on)' : 'var(--loc-off)');
  const line = (id) => (on(id) ? 'var(--loc-on-line)' : 'var(--loc-off-line)');
  const ink = (id) => (on(id) ? 'var(--loc-on-text)' : 'var(--ink-3)');
  const mark = (id, label) => `<title>${escapeHtml(on(id) ? `${label} — annotated: ${joined}` : `${label} — not annotated`)}</title>`;

  return `<div class="viz"><svg viewBox="0 0 340 210" role="img" aria-label="Cell cross-section highlighting ${escapeHtml(joined)}">
<text x="170" y="14" text-anchor="middle" class="vtiny" fill="${ink('extracellular')}">extracellular</text>
<rect x="8" y="20" width="324" height="16" rx="3" fill="${fill('extracellular')}" stroke="${line('extracellular')}" stroke-width="0.5">${mark('extracellular', 'Extracellular / secreted')}</rect>
<rect x="8" y="40" width="324" height="9" rx="2" fill="${fill('membrane')}" stroke="${line('membrane')}" stroke-width="0.5">${mark('membrane', 'Plasma membrane')}</rect>
<text x="14" y="47" class="vtiny" fill="${ink('membrane')}">plasma membrane</text>
<rect x="8" y="53" width="324" height="148" rx="10" fill="${fill('cytoplasm')}" stroke="${line('cytoplasm')}" stroke-width="0.5">${mark('cytoplasm', 'Cytoplasm')}</rect>
<text x="16" y="68" class="vtiny" fill="${ink('cytoplasm')}">cytoplasm</text>
<ellipse cx="90" cy="128" rx="52" ry="42" fill="${fill('nucleus')}" stroke="${line('nucleus')}" stroke-width="0.5">${mark('nucleus', 'Nucleus')}</ellipse>
<text x="90" y="131" text-anchor="middle" class="vtiny" fill="${ink('nucleus')}">nucleus</text>
<path d="M158 92 q26 -10 52 0 q26 10 52 0" fill="none" stroke="${line('er')}" stroke-width="${on('er') ? 5 : 3}">${mark('er', 'Endoplasmic reticulum')}</path>
<path d="M158 104 q26 -10 52 0 q26 10 52 0" fill="none" stroke="${line('er')}" stroke-width="${on('er') ? 5 : 3}"></path>
<text x="270" y="88" class="vtiny" fill="${ink('er')}">ER</text>
<path d="M164 130 h74" stroke="${line('golgi')}" stroke-width="${on('golgi') ? 5 : 3}" stroke-linecap="round">${mark('golgi', 'Golgi')}</path>
<path d="M170 139 h62" stroke="${line('golgi')}" stroke-width="${on('golgi') ? 5 : 3}" stroke-linecap="round"></path>
<text x="246" y="139" class="vtiny" fill="${ink('golgi')}">Golgi</text>
<ellipse cx="285" cy="128" rx="30" ry="16" fill="${fill('mitochondrion')}" stroke="${line('mitochondrion')}" stroke-width="0.5">${mark('mitochondrion', 'Mitochondrion')}</ellipse>
<text x="285" y="131" text-anchor="middle" class="vtiny" fill="${ink('mitochondrion')}">mito</text>
<circle cx="180" cy="172" r="11" fill="${fill('lysosome')}" stroke="${line('lysosome')}" stroke-width="0.5">${mark('lysosome', 'Lysosome / vesicle')}</circle>
<circle cx="212" cy="180" r="8" fill="${fill('lysosome')}" stroke="${line('lysosome')}" stroke-width="0.5"></circle>
<text x="240" y="180" class="vtiny" fill="${ink('lysosome')}">vesicles</text>
</svg>${caption(`Highlighted: ${joined}`)}</div>`;
}

/**
 * 2 · Where in the world. Regions ranked by trial count, top countries as chips, and a flag
 * when the set is concentrated in single-country trials — a recruitment signal nobody
 * normally puts next to the science.
 */
export function regionBars(geography) {
  const regions = geography?.regions ?? [];
  if (!regions.length) return caption('No site locations reported on these trials.');
  const countries = geography?.countries ?? [];
  const max = Math.max(...regions.map((region) => region.trials), 1);
  const concentrated = Boolean(geography?.concentrated);

  const stats = `<div class="geostats">
<span><b>${escapeHtml(geography?.countries_covered ?? countries.length)}</b> countries</span>
<span><b>${escapeHtml(geography?.total_sites ?? 0)}</b> sites</span>
<span class="${concentrated ? 'flagged' : ''}"><b>${escapeHtml(geography?.single_country_trials ?? 0)}</b> single-country trials</span>
</div>`;

  const bars = regions.map((region) => `<div class="bar">
<div class="barlab"><span>${escapeHtml(region.region)}</span><span class="mono">${escapeHtml(region.trials)} · ${escapeHtml(region.countries)} ${region.countries === 1 ? 'country' : 'countries'}</span></div>
<div class="bartrack"><div class="barfill" style="width:${num((region.trials / max) * 100, 1)}%" title="${escapeHtml(`${region.region}: ${region.trials} trials across ${region.countries} countries`)}"></div></div>
</div>`).join('');

  const chips = countries.length
    ? `<div class="chips">${countries.slice(0, 10).map((entry) => `<span class="chip" title="${escapeHtml(`${entry.country}: ${entry.trials} trials, ${entry.sites} sites`)}">${escapeHtml(entry.country)} <b>${escapeHtml(entry.trials)}</b></span>`).join('')}</div>`
    : '';

  const flag = concentrated
    ? caption(`More than ${Math.round((geography?.concentration_threshold ?? 0.6) * 100)}% of these trials run in a single country, so recruitment and any regulatory read-through are geographically concentrated.`, { flagged: true })
    : '';

  return `<div class="viz">${stats}${bars}${chips}${flag}</div>`;
}

/**
 * 3 · Where along the sequence. Domains and the signal peptide as spans, variants binned so
 * clustering shows. For a misfolding disease the variant distribution is the mechanism.
 */
export function sequenceTrack({ length, features = [], hotspots = [], binSize = 20 } = {}) {
  if (!Number.isFinite(length) || length <= 0) {
    return caption('No sequence length on the source entry, so the sequence track cannot be drawn.');
  }
  const width = 340;
  const pad = 8;
  const inner = width - pad * 2;
  const at = (position) => num(pad + (Math.min(position, length) / length) * inner);
  const spans = features.filter((feature) => ['domain', 'signal', 'region'].includes(feature.kind));
  const maxBin = Math.max(...hotspots.map((bin) => bin.count), 1);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(fraction * length));

  const density = hotspots.map((bin) => {
    const height = 4 + (bin.count / maxBin) * 22;
    return `<rect x="${at(bin.start)}" y="${num(30 - height)}" width="${num(Math.max((binSize / length) * inner - 0.6, 1.2))}" height="${num(height)}" fill="var(--vseq-variant)" opacity="${num(0.5 + 0.5 * (bin.count / maxBin))}"><title>${escapeHtml(`${bin.count} variant${bin.count === 1 ? '' : 's'} between residues ${bin.start} and ${bin.start + binSize - 1}`)}</title></rect>`;
  }).join('');

  const spanMarks = spans.map((feature) => `<rect x="${at(feature.start)}" y="33" width="${num(Math.max(Number(at(feature.end)) - Number(at(feature.start)), 2))}" height="16" rx="2" fill="${feature.kind === 'signal' ? 'var(--vseq-signal)' : 'var(--vseq-domain)'}"><title>${escapeHtml(`${feature.type ?? feature.kind}${feature.description ? `: ${feature.description}` : ''} (${feature.start}–${feature.end})`)}</title></rect>`).join('');

  const scale = ticks.map((tick) => `<g><line x1="${at(tick)}" y1="50" x2="${at(tick)}" y2="55" stroke="var(--rule-2)" stroke-width="0.5"></line><text x="${at(tick)}" y="66" text-anchor="${tick === 0 ? 'start' : tick === length ? 'end' : 'middle'}" class="vtiny" fill="var(--ink-3)">${escapeHtml(tick)}</text></g>`).join('');

  const key = `<div class="vkey"><span><i style="background:var(--vseq-variant)"></i> variants</span><span><i style="background:var(--vseq-domain)"></i> domain</span><span><i style="background:var(--vseq-signal)"></i> signal peptide</span></div>`;

  return `<div class="viz"><svg viewBox="0 0 340 96" role="img" aria-label="Protein sequence map over ${escapeHtml(length)} residues">
${density}<text x="${pad}" y="10" class="vtiny" fill="var(--ink-3)">variants per ${escapeHtml(binSize)} residues</text>
<rect x="${pad}" y="36" width="${inner}" height="10" rx="2" fill="var(--vseq-backbone)"><title>${escapeHtml(`Backbone, ${length} residues`)}</title></rect>
${spanMarks}${scale}</svg>${key}</div>`;
}

/**
 * 4 · Structures by method and resolution. One dot per entry with a dashed 3.5 Å
 * design-quality line, so "is there a structure good enough to design against" is answered
 * by which side of the line the dots sit on.
 */
export function resolutionPlot(entries = [], { threshold = 3.5 } = {}) {
  const resolved = (entries ?? []).filter((entry) => Number.isFinite(entry?.resolution));
  if (!resolved.length) return caption('No entry in this set reports a resolution.');

  const width = 340;
  const pad = 30;
  const maxRes = Math.max(...resolved.map((entry) => entry.resolution), 4.5);
  const minRes = Math.min(...resolved.map((entry) => entry.resolution), 1.5);
  const span = Math.max(maxRes - minRes, 0.8);
  const at = (resolution) => num(pad + ((resolution - minRes) / span) * (width - pad * 2));
  const colour = (method) => (/ELECTRON MICROSCOPY/i.test(method ?? '')
    ? 'var(--vres-em)'
    : /X-RAY/i.test(method ?? '') ? 'var(--vres-xray)' : 'var(--vres-other)');

  const line = threshold >= minRes && threshold <= maxRes
    ? `<line x1="${at(threshold)}" y1="18" x2="${at(threshold)}" y2="60" stroke="var(--vres-line)" stroke-width="1" stroke-dasharray="3 3"></line><text x="${at(threshold)}" y="14" text-anchor="middle" class="vtiny" fill="var(--vres-line)">${escapeHtml(threshold)} Å</text>`
    : '';

  const dots = resolved.map((entry, index) => `<circle cx="${at(entry.resolution)}" cy="${48 - (index % 4) * 9}" r="4.5" fill="${colour(entry.method)}" fill-opacity="0.85"><title>${escapeHtml(`${entry.id} · ${String(entry.method ?? 'method not reported').toLowerCase()} · ${entry.resolution} Å`)}</title></circle>`).join('');

  return `<div class="viz"><svg viewBox="0 0 340 92" role="img" aria-label="Structure resolutions by experimental method">
<line x1="${pad}" y1="60" x2="${width - pad}" y2="60" stroke="var(--rule-2)" stroke-width="0.5"></line>
${line}${dots}
<text x="${pad}" y="76" class="vtiny" fill="var(--ink-3)">${escapeHtml(num(minRes, 1))} Å</text>
<text x="${width - pad}" y="76" text-anchor="end" class="vtiny" fill="var(--ink-3)">${escapeHtml(num(maxRes, 1))} Å</text>
<text x="${width / 2}" y="88" text-anchor="middle" class="vtiny" fill="var(--ink-3)">better resolution ←→ worse</text>
</svg><div class="vkey"><span><i style="background:var(--vres-em)"></i> cryo-EM</span><span><i style="background:var(--vres-xray)"></i> X-ray</span><span><i style="background:var(--vres-other)"></i> other</span></div></div>`;
}
