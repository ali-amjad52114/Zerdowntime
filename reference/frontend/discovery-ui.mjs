function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeUrl(value) {
  try {
    const url = new URL(String(value ?? ''));
    return ['http:', 'https:'].includes(url.protocol) ? escapeHtml(url.href) : '#';
  } catch {
    return '#';
  }
}

function status(value, fallback = 'NOT_STARTED') {
  return String(value ?? fallback).trim().toUpperCase().replaceAll(' ', '_');
}

function score(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'Not scored';
  return String(Math.round(numeric * 100) / 100);
}

function passageList(passages, emptyText) {
  if (!Array.isArray(passages) || passages.length === 0) return `<p class="empty-copy">${escapeHtml(emptyText)}</p>`;
  return `<ul class="passages">${passages.map((passage) => {
    const text = passage?.text ?? passage?.passage ?? passage?.evidence ?? '';
    const source = passage?.source_title ?? passage?.sourceTitle ?? passage?.paper_title ?? passage?.paperTitle ?? passage?.source ?? 'Open source';
    const url = passage?.source_url ?? passage?.sourceUrl ?? passage?.url;
    const link = url
      ? `<a href="${safeUrl(url)}" target="_blank" rel="noreferrer">${escapeHtml(source)}</a>`
      : `<span>${escapeHtml(source)}</span>`;
    return `<li><blockquote>${escapeHtml(text)}</blockquote><div class="source-link">${link}</div></li>`;
  }).join('')}</ul>`;
}

function resourceList(resources) {
  if (!Array.isArray(resources) || resources.length === 0) {
    return '<div class="empty-state">No papers or resources have been collected yet.</div>';
  }
  return `<ol class="resources">${resources.map((resource) => {
    const title = resource?.title ?? resource?.name ?? resource?.id ?? 'Untitled resource';
    const url = resource?.source_url ?? resource?.sourceUrl ?? resource?.url;
    const type = resource?.type ?? resource?.kind ?? 'resource';
    const itemStatus = status(resource?.status, 'COLLECTED');
    const label = url
      ? `<a href="${safeUrl(url)}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a>`
      : `<span>${escapeHtml(title)}</span>`;
    return `<li>${label}<div><span>${escapeHtml(type)}</span><span class="mini-status">${escapeHtml(itemStatus)}</span></div></li>`;
  }).join('')}</ol>`;
}

function candidateCard(candidate, selectedIds) {
  const id = String(candidate?.id ?? candidate?.candidate_id ?? candidate?.name ?? 'candidate');
  const name = candidate?.name ?? candidate?.title ?? id;
  const rationale = candidate?.rationale ?? candidate?.summary ?? candidate?.ranking?.formula ?? 'Awaiting analyst interpretation.';
  const evidence = Array.isArray(candidate?.evidence) ? candidate.evidence : [];
  const supporting = candidate?.supporting_passages ?? candidate?.supportingPassages ?? candidate?.supporting ?? evidence.filter((item) => item?.classification === 'SUPPORTING');
  const contradictory = candidate?.contradictory_passages ?? candidate?.contradictoryPassages ?? candidate?.contradictions ?? evidence.filter((item) => item?.classification === 'CONTRADICTORY');
  const candidateScore = candidate?.score ?? candidate?.ranking?.score;
  const uniprotId = candidate?.uniprot_id ?? candidate?.uniprotId ?? '';
  const checked = candidate?.selected === true || selectedIds.has(id);
  return `<article class="candidate" data-candidate-id="${escapeHtml(id)}">
    <div class="candidate-head"><div><div class="eyebrow">CANDIDATE</div><h3>${escapeHtml(name)}</h3></div><div class="score" aria-label="Candidate score ${escapeHtml(score(candidateScore))}">${escapeHtml(score(candidateScore))}</div></div>
    <p class="rationale">${escapeHtml(rationale)}</p>
    <div class="evidence-grid">
      <section class="evidence supporting"><h4>Supporting passages <span>${supporting.length}</span></h4>${passageList(supporting, 'No supporting passage was retained.')}</section>
      <section class="evidence contradictory"><h4>Contradictory passages <span>${contradictory.length}</span></h4>${passageList(contradictory, 'No contradictory passage was found.')}</section>
    </div>
    <label class="select-control"><input type="checkbox" value="${escapeHtml(id)}" data-candidate-select data-candidate-name="${escapeHtml(name)}" data-uniprot-id="${escapeHtml(uniprotId)}"${checked ? ' checked' : ''}> Select ${escapeHtml(name)} for human-reviewed handoff</label>
  </article>`;
}

function handoffPanel(handoff, selectedIds) {
  const handoffStatus = status(handoff?.status, selectedIds.size ? 'READY' : 'WAITING_FOR_SELECTION');
  const axes = handoff?.axes ?? {};
  return `<section class="handoff" aria-labelledby="handoff-title">
    <div><div class="eyebrow">SELECTED CANDIDATE HANDOFF</div><h2 id="handoff-title">Send reviewed candidates to X/Y/Z</h2><p>Discovery proposes candidates. A human chooses which candidates may enter pipeline, structure, and IP investigation.</p></div>
    <div class="handoff-state"><span class="status-pill">${escapeHtml(handoffStatus)}</span><strong data-selected-count>${selectedIds.size} selected</strong></div>
    <div class="axis-row">${['X', 'Y', 'Z'].map((axis) => `<div><strong>${axis}</strong><span>${escapeHtml(status(axes?.[axis]?.status ?? axes?.[axis], 'WAITING'))}</span></div>`).join('')}</div>
    <div class="controls"><button type="button" class="secondary" id="save-selection">Save human selection</button><button type="button" id="handoff-selection"${selectedIds.size ? '' : ' disabled'}>Hand off to X/Y/Z</button></div>
  </section>`;
}

function diligenceResults(handoff) {
  const results = handoff?.results ?? [];
  if (!results.length) return '';
  return `<section class="diligence-results" aria-labelledby="diligence-results-title">
    <div class="diligence-head"><div><div class="eyebrow">TARGET DILIGENCE RESULTS</div><h2 id="diligence-results-title">X/Y/Z evidence after human selection</h2></div></div>
    ${results.map((result) => `<article class="diligence-target" data-diligence-target="${escapeHtml(result.target ?? result.candidate_id)}" data-uniprot-id="${escapeHtml(result.run?.uniprot_id ?? '')}" data-target-run-id="${escapeHtml(result.run?.runId ?? '')}"><div class="candidate-head"><h3>${escapeHtml(result.target ?? result.candidate_id)}</h3><div class="controls"><button type="button" class="secondary analyze-run-target" data-run-id="${escapeHtml(result.run?.runId ?? '')}" data-target="${escapeHtml(result.target ?? result.candidate_id)}" data-uniprot-id="${escapeHtml(result.run?.uniprot_id ?? '')}"${result.run?.status === 'FAILED' || !result.run?.uniprot_id ? ' disabled' : ''}>Analyze this target</button><button type="button" class="secondary create-diligence" data-run-id="${escapeHtml(result.run?.runId ?? '')}"${result.run?.status === 'FAILED' ? ' disabled' : ''}>Create review tasks</button></div></div>
      ${result.error ? `<p class="error" style="display:block">Target execution failed: ${escapeHtml(result.error)}</p>` : ''}
      <div class="diligence-axes">${['X', 'Y', 'Z'].map((axis) => {
        const outcome = result.run?.axes?.[axis] ?? {};
        const records = outcome.records ?? [];
        return `<section><div class="candidate-head"><strong>${axis}</strong><span class="mini-status">${escapeHtml(status(outcome.status, 'UNAVAILABLE'))}</span></div>
          <p>${records.length} source-linked records</p>
          ${records.length ? `<ul class="result-records">${records.slice(0, 10).map((record) => `<li><a href="${safeUrl(record.source_url ?? record.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(record.subject)} — ${escapeHtml(record.value)}</a><p>${escapeHtml(record.evidence)}</p></li>`).join('')}</ul>` : '<p class="empty-copy">No validated records were available from this axis.</p>'}
        </section>`;
      }).join('')}</div><div class="target-workflow" data-workflow-host="${escapeHtml(result.run?.runId ?? '')}"></div></article>`).join('')}
  </section>`;
}

export function renderDiscoveryView(state = {}) {
  const disease = state?.disease ?? state?.query?.disease ?? '';
  const discoveryStatus = status(state?.status);
  const corpus = state?.corpus ?? {};
  const resources = corpus?.resources ?? state?.resources ?? [];
  const candidates = Array.isArray(state?.candidates) ? state.candidates : [];
  const selectedIds = new Set(state?.selection?.selected_candidate_ids ?? state?.selection?.selectedCandidateIds ?? []);
  for (const candidate of candidates) if (candidate?.selected) selectedIds.add(String(candidate.id ?? candidate.candidate_id ?? candidate.name));
  const corpusStatus = status(corpus?.status, resources.length ? 'READY' : 'EMPTY');
  const corpusCount = corpus?.resource_count ?? corpus?.resourceCount ?? resources.length;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mend — Scientific Discovery</title>
<script src="https://3Dmol.org/build/3Dmol-min.js"></script>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#ecf2ff;background:#07111e;line-height:1.5}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 85% 5%,#15335a 0,transparent 28%),#07111e}.shell{max-width:1180px;margin:auto;padding:42px 24px 80px}header{display:flex;justify-content:space-between;gap:24px;align-items:center;margin-bottom:30px}.brand,.eyebrow{color:#6ed8ff;font-weight:800;letter-spacing:.1em;font-size:12px}h1{font-size:42px;line-height:1.08;margin:6px 0}h2{margin:6px 0 10px}h3{margin:4px 0;font-size:23px}h4{display:flex;justify-content:space-between;margin:0 0 12px}.status-pill,.mini-status{display:inline-block;border:1px solid #355779;border-radius:999px;padding:7px 11px;background:#10243d;font-size:12px}.start,.corpus,.candidate,.handoff,.diligence-results,.target-analysis{background:#0e1b2d;border:1px solid #233d5d;border-radius:18px}.start{padding:22px;display:grid;grid-template-columns:1fr auto;gap:12px;margin-bottom:20px}.start label{grid-column:1/-1;font-weight:700}.start input{min-width:0}.corpus{display:grid;grid-template-columns:minmax(220px,.7fr) 1.5fr;gap:24px;padding:24px;margin-bottom:28px}.corpus-summary strong{display:block;font-size:40px;margin-top:12px}.resources{margin:0;padding:0;list-style:none;display:grid;gap:9px}.resources li{border-bottom:1px solid #203752;padding:0 0 10px}.resources li>div{display:flex;gap:8px;color:#8fa7c4;font-size:12px;margin-top:3px}.mini-status{padding:1px 7px}.candidate-list{display:grid;gap:18px}.candidate{padding:24px}.candidate-head,.handoff-state{display:flex;justify-content:space-between;gap:20px;align-items:center}.score{font-size:28px;font-weight:850;color:#8ee6bb;background:#102e2a;border-radius:13px;padding:9px 13px}.rationale,.handoff p,.empty-copy{color:#a9bad1}.evidence-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin:20px 0}.evidence{border:1px solid #294663;border-radius:13px;padding:16px;background:#091525}.supporting{border-color:#286653}.contradictory{border-color:#694151}.passages{list-style:none;margin:0;padding:0}.passages li+li{border-top:1px solid #233d5d;margin-top:12px;padding-top:12px}blockquote{margin:0;color:#d6e3f7}.source-link{margin-top:6px;font-size:12px}a{color:#75d9ff}.select-control{display:flex;align-items:center;gap:10px;padding:13px;border-radius:11px;background:#132945;font-weight:700}.select-control input{width:auto}.handoff{margin-top:24px;padding:24px}.handoff-state{justify-content:flex-start;margin:14px 0}.axis-row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.axis-row div{display:flex;justify-content:space-between;border:1px solid #294663;border-radius:11px;padding:12px}.axis-row span{color:#9fb2cc}.controls{display:flex;justify-content:flex-end;gap:10px}.diligence-results{margin-top:24px;padding:24px}.diligence-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:8px}.diligence-target{border-top:1px solid #294663;padding-top:16px}.diligence-axes{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.diligence-axes>section{background:#091525;border:1px solid #294663;border-radius:13px;padding:14px}.result-records{padding-left:18px}.result-records p{color:#9fb2cc;font-size:13px}.empty-state{padding:28px;border:1px dashed #355779;border-radius:12px;color:#94a9c5}input,button{font:inherit;border-radius:11px;border:1px solid #3a628b;padding:12px 14px;background:#091525;color:#ecf2ff}button{background:#277df1;border-color:#5a9df8;font-weight:800;cursor:pointer}button.secondary{background:#132945}button:disabled{cursor:not-allowed;opacity:.45}.error{display:none;color:#ffbdc8;margin-top:12px}.target-analysis{margin-top:24px;padding:24px}.target-analysis[hidden]{display:none}.structure-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:16px 0}.structure-meta div{background:#091525;border:1px solid #294663;border-radius:11px;padding:12px}.structure-meta span{display:block;color:#9fb2cc;font-size:12px}.predicted-badge{display:inline-block;border:1px solid #c9a227;color:#ffd978;background:#2a2410;border-radius:999px;padding:7px 11px;font-size:12px;font-weight:800;letter-spacing:.06em}.view-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0}.view-grid figure{margin:0;background:#091525;border:1px solid #294663;border-radius:13px;padding:10px}.view-grid img{width:100%;height:auto;display:block;border-radius:8px;background:#07111e}.view-grid figcaption{margin-top:8px;color:#a9bad1;font-size:13px;font-weight:700}.pocket-list{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:8px}.pocket-list li{display:flex;justify-content:space-between;gap:12px;background:#091525;border:1px solid #294663;border-radius:11px;padding:12px}.mol-viewer{width:480px;height:360px;background:#091525;border:1px solid #294663;border-radius:13px;position:absolute;left:-9999px;top:0}.mol-viewer canvas{width:100%;height:100%;display:block}@media(max-width:780px){header,.candidate-head,.diligence-head{align-items:flex-start;flex-direction:column}.start,.corpus,.evidence-grid,.diligence-axes,.view-grid{grid-template-columns:1fr}.axis-row{grid-template-columns:1fr}.controls{flex-direction:column}.controls button{width:100%}}
</style></head><body><main class="shell">
<header><div><div class="brand">MEND DISCOVERY</div><h1>Evidence-first target discovery</h1></div><span class="status-pill">${escapeHtml(discoveryStatus)}</span></header>
<form class="start" id="start-research"><label for="disease">Disease or indication</label><input id="disease" name="disease" value="${escapeHtml(disease)}" placeholder="e.g. glioblastoma" required><button type="submit">Start research</button></form>
<section class="corpus" aria-labelledby="corpus-title"><div class="corpus-summary"><div class="eyebrow">CORPUS</div><h2 id="corpus-title">Research materials</h2><span class="status-pill">${escapeHtml(corpusStatus)}</span><strong>${escapeHtml(corpusCount)}</strong><span>papers and resources</span></div><div>${resourceList(resources)}</div></section>
<section aria-labelledby="candidates-title"><div class="eyebrow">HUMAN-REVIEWED DISCOVERY</div><h2 id="candidates-title">Candidate targets</h2><div class="candidate-list">${candidates.length ? candidates.map((candidate) => candidateCard(candidate, selectedIds)).join('') : '<div class="empty-state">Start research to generate evidence-backed candidates.</div>'}</div></section>
${handoffPanel(state?.handoff, selectedIds)}${diligenceResults(state?.handoff)}
<section id="target-analysis" class="target-analysis" hidden aria-labelledby="target-analysis-title"></section>
<div id="mol-viewer" class="mol-viewer" aria-hidden="true"></div>
<div id="discovery-error" class="error" role="alert"></div>
</main><script>
const errorBox = document.querySelector('#discovery-error');
async function post(path, body) {
  errorBox.style.display = 'none';
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Request failed');
  location.reload();
}
function selectedCandidateIds() { return [...document.querySelectorAll('[data-candidate-select]:checked')].map((input) => input.value); }
function updateSelectionState() {
  const count = selectedCandidateIds().length;
  document.querySelector('[data-selected-count]').textContent = count + ' selected';
  document.querySelector('#handoff-selection').disabled = count === 0;
}
function showError(message) {
  errorBox.textContent = message;
  errorBox.style.display = 'block';
}
function htmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function currentDisease() {
  return document.querySelector('#disease')?.value?.trim() || '';
}
function resolveUniprot(target, uniprotId) {
  const explicit = String(uniprotId ?? '').trim();
  if (explicit) return explicit;
  return '';
}
function analyzePayload() {
  const selected = document.querySelector('[data-candidate-select]:checked');
  if (selected) {
    const target = selected.dataset.candidateName || selected.value;
    return { target, uniprot_id: resolveUniprot(target, selected.dataset.uniprotId), disease: currentDisease() };
  }
  const diligence = document.querySelector('[data-diligence-target]');
  if (diligence) {
    const target = diligence.dataset.diligenceTarget || '';
    return { target, uniprot_id: resolveUniprot(target, diligence.dataset.uniprotId), disease: currentDisease() };
  }
  throw new Error('Select a candidate or review a diligence target before analyzing.');
}
function residueSelection(token) {
  const parts = String(token ?? '').split(':');
  return { chain: parts[0] || undefined, resi: Number(parts[1]) };
}
function pocketSelection(residues) {
  const sels = (residues ?? []).map(residueSelection).filter((sel) => Number.isFinite(sel.resi));
  if (!sels.length) return null;
  return sels.length === 1 ? sels[0] : { or: sels };
}
function pocketResidues(pocket) {
  return pocket?.residues ?? pocket?.residue_ids ?? pocket?.selection ?? [];
}
function formatValue(value) {
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (value == null || value === '') return '—';
  return String(value);
}
function formatRules(rules) {
  if (Array.isArray(rules)) return rules.map((rule) => typeof rule === 'string' ? rule : JSON.stringify(rule)).join('; ');
  if (rules && typeof rules === 'object') return JSON.stringify(rules);
  return formatValue(rules);
}
function formatProbability(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return numeric <= 1 ? Math.round(numeric * 100) + '%' : String(numeric);
}
async function fetchJson(path, options) {
  errorBox.style.display = 'none';
  const response = await fetch(path, options);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
}
function require3Dmol() {
  if (typeof $3Dmol === 'undefined') {
    throw new Error('3Dmol is not loaded. Structure images cannot be rendered until https://3Dmol.org/build/3Dmol-min.js is available.');
  }
}
function getViewer() {
  require3Dmol();
  const host = document.querySelector('#mol-viewer');
  if (!window.__mendViewer) {
    window.__mendViewer = $3Dmol.createViewer(host, { backgroundColor: '#091525', antialias: true });
  }
  window.__mendViewer.resize();
  return window.__mendViewer;
}
function resetViewer(viewer) {
  viewer.removeAllSurfaces();
  viewer.removeAllLabels();
  viewer.setStyle({}, {});
  viewer.zoomTo();
}
function waitFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
function addSurfaceAsync(viewer, style, sel) {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => { if (settled) return; settled = true; resolve(); };
    viewer.addSurface($3Dmol.SurfaceType.VDW, style, sel || {}, sel || {}, done);
    setTimeout(done, 4000);
  });
}
async function capturePng(viewer) {
  viewer.render();
  await waitFrame();
  return viewer.pngURI();
}
async function loadStructureModel(viewer, structureUrl) {
  const response = await fetch(structureUrl);
  if (!response.ok) throw new Error('Failed to load target structure');
  const contentType = response.headers.get('content-type') || '';
  let data = '';
  let format = 'pdb';
  if (contentType.includes('json')) {
    const payload = await response.json();
    data = payload.pdb ?? payload.cif ?? payload.data ?? payload.structure ?? '';
    format = payload.format ?? (payload.cif ? 'cif' : 'pdb');
  } else {
    data = await response.text();
    format = /_atom_site|data_/.test(data) ? 'cif' : 'pdb';
  }
  if (!String(data).trim()) throw new Error('Structure file was empty');
  viewer.removeAllModels();
  resetViewer(viewer);
  viewer.addModel(data, format);
}
async function renderStructureViews(analysis) {
  const structure = analysis.structure ?? {};
  const viewer = getViewer();
  await loadStructureModel(viewer, structure.structure_url);
  const pocket = (analysis.pockets ?? [])[0] ?? {};
  const pocketSel = pocketSelection(pocketResidues(pocket));
  const ligands = structure.ligands ?? [];

  resetViewer(viewer);
  viewer.setStyle({}, { cartoon: { color: 'spectrum' } });
  viewer.zoomTo();
  const overall = await capturePng(viewer);

  resetViewer(viewer);
  viewer.setStyle({}, { cartoon: { color: 'spectrum' } });
  if (pocketSel) viewer.setStyle(pocketSel, { cartoon: { color: '#ff7ad9' }, stick: { colorscheme: 'magentaCarbon' } });
  await addSurfaceAsync(viewer, { opacity: 0.72, color: '#6ed8ff' }, {});
  viewer.zoomTo();
  const surface = await capturePng(viewer);

  resetViewer(viewer);
  viewer.setStyle({}, { cartoon: { hidden: true } });
  if (pocketSel) {
    viewer.setStyle(pocketSel, { stick: { colorscheme: 'magentaCarbon', radius: 0.2 } });
    viewer.addResLabels(pocketSel, { fontSize: 12, showBackground: true, backgroundColor: '#10243d', fontColor: '#ecf2ff' });
    viewer.zoomTo(pocketSel);
  } else {
    viewer.setStyle({}, { stick: { colorscheme: 'cyanCarbon' } });
    viewer.zoomTo();
  }
  if (ligands.length) {
    for (const ligand of ligands) {
      const resn = ligand.id ?? ligand.comp_id ?? ligand.resn ?? ligand;
      if (resn) viewer.setStyle({ resn: String(resn) }, { stick: { colorscheme: 'greenCarbon', radius: 0.25 } });
    }
    viewer.setStyle({ hetflag: true }, { stick: { colorscheme: 'greenCarbon', radius: 0.25 } });
  }
  const closeup = await capturePng(viewer);
  return { overall, surface, closeup };
}
function renderAnalysis(analysis, images) {
  const structure = analysis.structure ?? {};
  const pockets = (analysis.pockets ?? []).slice(0, 3);
  const predicted = structure.source === 'alphafold' ? '<span class="predicted-badge">PREDICTED STRUCTURE</span>' : '';
  const pocketItems = pockets.length
    ? pockets.map((pocket, index) => '<li><strong>Pocket #' + (index + 1) + '</strong><span>' + htmlEscape(formatProbability(pocket.probability ?? pocket.score)) + '</span></li>').join('')
    : '<li><strong>No pockets returned</strong><span>—</span></li>';
  const panel = document.querySelector('#target-analysis');
  panel.hidden = false;
  panel.innerHTML = '<div class="candidate-head"><div><div class="eyebrow">TARGET STRUCTURE</div><h2 id="target-analysis-title">Analyze Target</h2></div>' + predicted + '</div>'
    + '<div class="structure-meta">'
    + '<div><span>PDB ID</span><strong>' + htmlEscape(formatValue(structure.pdb_id ?? structure.pdbId ?? structure.id)) + '</strong></div>'
    + '<div><span>Method</span><strong>' + htmlEscape(formatValue(structure.method)) + '</strong></div>'
    + '<div><span>Resolution</span><strong>' + htmlEscape(formatValue(structure.resolution)) + '</strong></div>'
    + '<div><span>Chains</span><strong>' + htmlEscape(formatValue(structure.chains)) + '</strong></div>'
    + '<div><span>Selection rules</span><strong>' + htmlEscape(formatRules(structure.selection_rules ?? structure.selectionRules)) + '</strong></div>'
    + '</div>'
    + '<div class="view-grid">'
    + '<figure><img alt="Overall cartoon of the selected target" src="' + images.overall + '"><figcaption>Overall</figcaption></figure>'
    + '<figure><img alt="Molecular surface with pocket 1 highlighted" src="' + images.surface + '"><figcaption>Surface + pocket #1</figcaption></figure>'
    + '<figure><img alt="Close-up of pocket 1 residues" src="' + images.closeup + '"><figcaption>Close-up</figcaption></figure>'
    + '</div>'
    + '<h3>Pockets</h3><p class="empty-copy">Source: ' + htmlEscape(analysis.pockets_provenance?.engine ?? analysis.pockets_source ?? 'unavailable') + (analysis.pockets_provenance?.version ? ' ' + htmlEscape(analysis.pockets_provenance.version) : '') + ' · mode ' + htmlEscape(analysis.pockets_provenance?.mode ?? 'unreported') + ' · structure ' + htmlEscape(analysis.pockets_provenance?.structure_id ?? structure.pdb_id ?? 'unknown') + '</p><ul class="pocket-list">' + pocketItems + '</ul>'
    + (analysis.pockets_error ? '<p class="empty-copy">' + htmlEscape(analysis.pockets_error) + '</p>' : '')
    + '<div class="controls"><button type="button" id="investigate-compounds">Investigate known compounds for this target</button></div>'
    + '<div id="compound-results"></div>';
  window.__mendAnalysis = analysis;
  document.querySelector('#investigate-compounds')?.addEventListener('click', investigateCompounds);
}
function renderCompounds(result) {
  const host = document.querySelector('#compound-results');
  if (!host) return;
  const compounds = (result.compounds ?? []).slice(0, 20);
  const rows = compounds.length ? compounds.map((compound) => '<li><div><strong>'
    + htmlEscape(compound.molecule_name || compound.molecule_chembl_id)
    + '</strong><p>' + htmlEscape(compound.activity_count + ' ChEMBL activit' + (compound.activity_count === 1 ? 'y' : 'ies')
      + (compound.best_pchembl_value == null ? '' : ' · best pChEMBL ' + compound.best_pchembl_value))
    + '</p></div><a href="' + htmlEscape(compound.source_url) + '" target="_blank" rel="noreferrer">ChEMBL source</a></li>').join('')
    : '<li><strong>No source-linked ChEMBL activities returned</strong></li>';
  host.innerHTML = '<h3>Known target activities</h3><p class="empty-copy">' + htmlEscape(result.scope) + '</p><ul class="pocket-list">' + rows + '</ul>';
}
async function investigateCompounds() {
  try {
    const analysis = window.__mendAnalysis;
    if (!analysis) throw new Error('Analyze a target before investigating compounds.');
    const result = await fetchJson('/target/compounds', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: analysis.target, uniprot_id: analysis.uniprot_id, disease: analysis.disease, target_run_id: analysis.target_run_id }),
    });
    renderCompounds(result);
  } catch (error) {
    showError(error.message);
  }
}
function workflowHost(runId) {
  return document.querySelector('[data-workflow-host="' + CSS.escape(String(runId)) + '"]');
}
function renderDiligenceWorkflow(workflow) {
  const host = workflowHost(workflow.runId);
  if (!host) return;
  const tasks = (workflow.tasks ?? []).map((task) => {
    const completed = task.status === 'COMPLETE';
    return '<section class="evidence"><div class="candidate-head"><strong>' + htmlEscape(task.title) + '</strong><span class="mini-status">' + htmlEscape(task.status) + '</span></div>'
      + '<p>' + htmlEscape(task.objective) + '</p>'
      + (completed
        ? '<p><strong>' + htmlEscape(task.completion?.actor) + ':</strong> ' + htmlEscape(task.completion?.finding) + '</p>'
        : '<label>Reviewer <input data-task-actor="' + htmlEscape(task.id) + '"></label><label>Finding <input data-task-finding="' + htmlEscape(task.id) + '"></label><button type="button" class="complete-task" data-task-id="' + htmlEscape(task.id) + '" data-run-id="' + htmlEscape(workflow.runId) + '">Complete task</button>')
      + '</section>';
  }).join('');
  const decision = workflow.status === 'READY_FOR_DECISION'
    ? '<section class="evidence"><h3>Human decision</h3><select data-decision><option>PROCEED_TO_FOCUSED_DILIGENCE</option><option>HOLD</option><option>ESCALATE</option></select><input data-decision-actor placeholder="Decision maker"><input data-decision-rationale placeholder="Decision rationale"><button type="button" class="record-decision" data-run-id="' + htmlEscape(workflow.runId) + '">Record decision</button></section>'
    : workflow.decision ? '<p><strong>Decision:</strong> ' + htmlEscape(workflow.decision.decision) + ' by ' + htmlEscape(workflow.decision.actor) + '</p>' : '';
  host.innerHTML = '<h3>Evidence-linked review workflow</h3><p class="empty-copy">' + htmlEscape(workflow.recommendation?.summary) + '</p><div class="diligence-axes">' + tasks + '</div>' + decision;
  for (const button of host.querySelectorAll('.complete-task')) button.addEventListener('click', completeDiligenceTask);
  host.querySelector('.record-decision')?.addEventListener('click', recordDiligenceDecision);
}
async function createDiligenceWorkflow(event) {
  try {
    const runId = event.currentTarget.dataset.runId;
    const workflow = await fetchJson('/mend/diligence', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId }),
    });
    renderDiligenceWorkflow(workflow);
  } catch (error) { showError(error.message); }
}
async function completeDiligenceTask(event) {
  try {
    const runId = event.currentTarget.dataset.runId;
    const taskId = event.currentTarget.dataset.taskId;
    const host = workflowHost(runId);
    const actor = host.querySelector('[data-task-actor="' + CSS.escape(taskId) + '"]').value;
    const finding = host.querySelector('[data-task-finding="' + CSS.escape(taskId) + '"]').value;
    const workflow = await fetchJson('/mend/diligence/tasks/' + encodeURIComponent(taskId) + '/complete?runId=' + encodeURIComponent(runId), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId, actor, finding }),
    });
    renderDiligenceWorkflow(workflow);
  } catch (error) { showError(error.message); }
}
async function recordDiligenceDecision(event) {
  try {
    const runId = event.currentTarget.dataset.runId;
    const host = workflowHost(runId);
    const workflow = await fetchJson('/mend/diligence/decision', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        runId,
        decision: host.querySelector('[data-decision]').value,
        actor: host.querySelector('[data-decision-actor]').value,
        rationale: host.querySelector('[data-decision-rationale]').value,
      }),
    });
    renderDiligenceWorkflow(workflow);
  } catch (error) { showError(error.message); }
}
async function analyzeTarget(event) {
  try {
    require3Dmol();
    const trigger = event?.currentTarget;
    const body = trigger?.dataset?.runId ? {
      target: trigger.dataset.target,
      uniprot_id: trigger.dataset.uniprotId || '',
      disease: currentDisease(),
      target_run_id: trigger.dataset.runId,
    } : analyzePayload();
    const result = await fetchJson('/target/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const analysis = result.analysis ?? result;
    if (!analysis?.structure?.structure_url) throw new Error('Analyze response is missing structure.structure_url');
    const images = await renderStructureViews(analysis);
    renderAnalysis(analysis, images);
  } catch (error) {
    showError(error.message);
  }
}
document.querySelector('#start-research').addEventListener('submit', async (event) => {
  event.preventDefault();
  try { await post('/mend/discovery/start', { disease: document.querySelector('#disease').value }); } catch (error) { showError(error.message); }
});
for (const input of document.querySelectorAll('[data-candidate-select]')) input.addEventListener('change', updateSelectionState);
document.querySelector('#save-selection').addEventListener('click', async () => {
  try { await post('/mend/discovery/select', { candidateIds: selectedCandidateIds() }); } catch (error) { showError(error.message); }
});
document.querySelector('#handoff-selection').addEventListener('click', async () => {
  try { await post('/mend/discovery/handoff', { candidateIds: selectedCandidateIds(), axes: ['X', 'Y', 'Z'] }); } catch (error) { showError(error.message); }
});
for (const button of document.querySelectorAll('.analyze-run-target')) button.addEventListener('click', analyzeTarget);
for (const button of document.querySelectorAll('.create-diligence')) button.addEventListener('click', createDiligenceWorkflow);
</script></body></html>`;
}

