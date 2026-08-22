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
  if (numeric >= 0 && numeric <= 1) return `${Math.round(numeric * 100)}%`;
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
  const checked = candidate?.selected === true || selectedIds.has(id);
  return `<article class="candidate" data-candidate-id="${escapeHtml(id)}">
    <div class="candidate-head"><div><div class="eyebrow">CANDIDATE</div><h3>${escapeHtml(name)}</h3></div><div class="score" aria-label="Candidate score ${escapeHtml(score(candidateScore))}">${escapeHtml(score(candidateScore))}</div></div>
    <p class="rationale">${escapeHtml(rationale)}</p>
    <div class="evidence-grid">
      <section class="evidence supporting"><h4>Supporting passages <span>${supporting.length}</span></h4>${passageList(supporting, 'No supporting passage was retained.')}</section>
      <section class="evidence contradictory"><h4>Contradictory passages <span>${contradictory.length}</span></h4>${passageList(contradictory, 'No contradictory passage was found.')}</section>
    </div>
    <label class="select-control"><input type="checkbox" value="${escapeHtml(id)}" data-candidate-select${checked ? ' checked' : ''}> Select ${escapeHtml(name)} for human-reviewed handoff</label>
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
    <div class="eyebrow">TARGET DILIGENCE RESULTS</div><h2 id="diligence-results-title">X/Y/Z evidence after human selection</h2>
    ${results.map((result) => `<article class="diligence-target"><h3>${escapeHtml(result.target ?? result.candidate_id)}</h3>
      <div class="diligence-axes">${['X', 'Y', 'Z'].map((axis) => {
        const outcome = result.run?.axes?.[axis] ?? {};
        const records = outcome.records ?? [];
        return `<section><div class="candidate-head"><strong>${axis}</strong><span class="mini-status">${escapeHtml(status(outcome.status, 'UNAVAILABLE'))}</span></div>
          <p>${records.length} source-linked records</p>
          ${records.length ? `<ul class="result-records">${records.slice(0, 10).map((record) => `<li><a href="${safeUrl(record.source_url ?? record.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(record.subject)} — ${escapeHtml(record.value)}</a><p>${escapeHtml(record.evidence)}</p></li>`).join('')}</ul>` : '<p class="empty-copy">No validated records were available from this axis.</p>'}
        </section>`;
      }).join('')}</div></article>`).join('')}
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
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#ecf2ff;background:#07111e;line-height:1.5}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 85% 5%,#15335a 0,transparent 28%),#07111e}.shell{max-width:1180px;margin:auto;padding:42px 24px 80px}header{display:flex;justify-content:space-between;gap:24px;align-items:center;margin-bottom:30px}.brand,.eyebrow{color:#6ed8ff;font-weight:800;letter-spacing:.1em;font-size:12px}h1{font-size:42px;line-height:1.08;margin:6px 0}h2{margin:6px 0 10px}h3{margin:4px 0;font-size:23px}h4{display:flex;justify-content:space-between;margin:0 0 12px}.status-pill,.mini-status{display:inline-block;border:1px solid #355779;border-radius:999px;padding:7px 11px;background:#10243d;font-size:12px}.start,.corpus,.candidate,.handoff,.diligence-results{background:#0e1b2d;border:1px solid #233d5d;border-radius:18px}.start{padding:22px;display:grid;grid-template-columns:1fr auto;gap:12px;margin-bottom:20px}.start label{grid-column:1/-1;font-weight:700}.start input{min-width:0}.corpus{display:grid;grid-template-columns:minmax(220px,.7fr) 1.5fr;gap:24px;padding:24px;margin-bottom:28px}.corpus-summary strong{display:block;font-size:40px;margin-top:12px}.resources{margin:0;padding:0;list-style:none;display:grid;gap:9px}.resources li{border-bottom:1px solid #203752;padding:0 0 10px}.resources li>div{display:flex;gap:8px;color:#8fa7c4;font-size:12px;margin-top:3px}.mini-status{padding:1px 7px}.candidate-list{display:grid;gap:18px}.candidate{padding:24px}.candidate-head,.handoff-state{display:flex;justify-content:space-between;gap:20px;align-items:center}.score{font-size:28px;font-weight:850;color:#8ee6bb;background:#102e2a;border-radius:13px;padding:9px 13px}.rationale,.handoff p,.empty-copy{color:#a9bad1}.evidence-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin:20px 0}.evidence{border:1px solid #294663;border-radius:13px;padding:16px;background:#091525}.supporting{border-color:#286653}.contradictory{border-color:#694151}.passages{list-style:none;margin:0;padding:0}.passages li+li{border-top:1px solid #233d5d;margin-top:12px;padding-top:12px}blockquote{margin:0;color:#d6e3f7}.source-link{margin-top:6px;font-size:12px}a{color:#75d9ff}.select-control{display:flex;align-items:center;gap:10px;padding:13px;border-radius:11px;background:#132945;font-weight:700}.select-control input{width:auto}.handoff{margin-top:24px;padding:24px}.handoff-state{justify-content:flex-start;margin:14px 0}.axis-row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.axis-row div{display:flex;justify-content:space-between;border:1px solid #294663;border-radius:11px;padding:12px}.axis-row span{color:#9fb2cc}.controls{display:flex;justify-content:flex-end;gap:10px}.diligence-results{margin-top:24px;padding:24px}.diligence-target{border-top:1px solid #294663;padding-top:16px}.diligence-axes{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.diligence-axes>section{background:#091525;border:1px solid #294663;border-radius:13px;padding:14px}.result-records{padding-left:18px}.result-records p{color:#9fb2cc;font-size:13px}.empty-state{padding:28px;border:1px dashed #355779;border-radius:12px;color:#94a9c5}input,button{font:inherit;border-radius:11px;border:1px solid #3a628b;padding:12px 14px;background:#091525;color:#ecf2ff}button{background:#277df1;border-color:#5a9df8;font-weight:800;cursor:pointer}button.secondary{background:#132945}button:disabled{cursor:not-allowed;opacity:.45}.error{display:none;color:#ffbdc8;margin-top:12px}@media(max-width:780px){header,.candidate-head{align-items:flex-start;flex-direction:column}.start,.corpus,.evidence-grid,.diligence-axes{grid-template-columns:1fr}.axis-row{grid-template-columns:1fr}.controls{flex-direction:column}.controls button{width:100%}}
</style></head><body><main class="shell">
<header><div><div class="brand">MEND DISCOVERY</div><h1>Evidence-first target discovery</h1></div><span class="status-pill">${escapeHtml(discoveryStatus)}</span></header>
<form class="start" id="start-research"><label for="disease">Disease or indication</label><input id="disease" name="disease" value="${escapeHtml(disease)}" placeholder="e.g. Alpha-1 Antitrypsin Deficiency" required><button type="submit">Start research</button></form>
<section class="corpus" aria-labelledby="corpus-title"><div class="corpus-summary"><div class="eyebrow">CORPUS</div><h2 id="corpus-title">Research materials</h2><span class="status-pill">${escapeHtml(corpusStatus)}</span><strong>${escapeHtml(corpusCount)}</strong><span>papers and resources</span></div><div>${resourceList(resources)}</div></section>
<section aria-labelledby="candidates-title"><div class="eyebrow">HUMAN-REVIEWED DISCOVERY</div><h2 id="candidates-title">Candidate targets</h2><div class="candidate-list">${candidates.length ? candidates.map((candidate) => candidateCard(candidate, selectedIds)).join('') : '<div class="empty-state">Start research to generate evidence-backed candidates.</div>'}</div></section>
${handoffPanel(state?.handoff, selectedIds)}${diligenceResults(state?.handoff)}<div id="discovery-error" class="error" role="alert"></div>
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
document.querySelector('#start-research').addEventListener('submit', async (event) => {
  event.preventDefault();
  try { await post('/mend/discovery/start', { disease: document.querySelector('#disease').value }); } catch (error) { errorBox.textContent = error.message; errorBox.style.display = 'block'; }
});
for (const input of document.querySelectorAll('[data-candidate-select]')) input.addEventListener('change', updateSelectionState);
document.querySelector('#save-selection').addEventListener('click', async () => {
  try { await post('/mend/discovery/select', { candidateIds: selectedCandidateIds() }); } catch (error) { errorBox.textContent = error.message; errorBox.style.display = 'block'; }
});
document.querySelector('#handoff-selection').addEventListener('click', async () => {
  try { await post('/mend/discovery/handoff', { candidateIds: selectedCandidateIds(), axes: ['X', 'Y', 'Z'] }); } catch (error) { errorBox.textContent = error.message; errorBox.style.display = 'block'; }
});
</script></body></html>`;
}
