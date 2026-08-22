function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function evidenceList(records) {
  return records.map((record) => `<li><a href="${escapeHtml(record.source_url)}" target="_blank" rel="noreferrer">${escapeHtml(record.subject)} — ${escapeHtml(record.value)}</a><p>${escapeHtml(record.evidence)}</p></li>`).join('');
}

function humanize(value) {
  return String(value ?? '').toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function taskCard(task) {
  const completion = task.completion
    ? `<div class="finding"><strong>Finding</strong><p>${escapeHtml(task.completion.finding)}</p><span>${escapeHtml(task.completion.actor)} · ${escapeHtml(task.completion.completedAt)}</span></div>`
    : `<div class="task-form"><input data-actor-for="${escapeHtml(task.id)}" placeholder="Reviewer name"><textarea data-finding-for="${escapeHtml(task.id)}" placeholder="Record the reviewed finding and material gaps"></textarea><button data-complete-task="${escapeHtml(task.id)}">Complete review</button></div>`;
  return `<article class="task ${task.status === 'COMPLETE' ? 'complete' : ''}"><div class="task-head"><span class="axis">${escapeHtml(task.axis)}</span><span class="task-status">${escapeHtml(task.status)}</span></div><h3>${escapeHtml(task.title)}</h3><p>${escapeHtml(task.objective)}</p><div class="deliverable"><strong>Deliverable</strong><p>${escapeHtml(task.deliverable)}</p></div><div class="evidence-count">${task.evidence.length} linked evidence records</div>${completion}</article>`;
}

function diligenceSection(workflow) {
  if (!workflow) {
    return `<section class="workflow empty"><div><div class="eyebrow">EVIDENCE → ACTION</div><h2>Turn this evidence into focused diligence</h2><p>Create competitive, structural, and IP review work linked directly to the records above. Mend will gate the final decision until every review has a recorded finding.</p></div><button id="create-diligence">Create diligence workflow</button></section>`;
  }
  const decision = workflow.decision
    ? `<div class="decision final"><div class="eyebrow">HUMAN DECISION</div><h3>${escapeHtml(humanize(workflow.decision.decision))}</h3><p>${escapeHtml(workflow.decision.rationale)}</p><span>${escapeHtml(workflow.decision.actor)} · ${escapeHtml(workflow.decision.decidedAt)}</span></div>`
    : workflow.status === 'READY_FOR_DECISION'
      ? `<div class="decision"><div class="eyebrow">READY FOR DECISION</div><h3>Record the reviewed outcome</h3><div class="decision-form"><select id="decision-value"><option value="PROCEED_TO_FOCUSED_DILIGENCE">Proceed to focused diligence</option><option value="HOLD">Hold</option><option value="ESCALATE">Escalate</option></select><input id="decision-actor" placeholder="Decision maker"><textarea id="decision-rationale" placeholder="Decision rationale"></textarea><button id="record-decision">Record decision</button></div></div>`
      : `<div class="decision pending"><div class="eyebrow">DECISION GATE</div><h3>Complete all three reviews</h3><p>The final decision remains locked until competitive, structural, and IP findings are recorded.</p></div>`;
  return `<section class="workflow"><div class="workflow-head"><div><div class="eyebrow">EVIDENCE → ACTION</div><h2>${escapeHtml(humanize(workflow.recommendation.code))}</h2><p>${escapeHtml(workflow.recommendation.summary)}</p></div><div class="workflow-status">${escapeHtml(workflow.status)}</div></div><div class="analysis-grid"><div><h3>Why</h3><ul>${workflow.recommendation.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul></div><div><h3>Evidence gaps</h3><ul>${workflow.recommendation.gaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join('')}</ul></div></div><div class="task-grid">${workflow.tasks.map(taskCard).join('')}</div>${decision}</section>`;
}

export function renderTargetView(run, workflow = null) {
  const x = run?.axes?.X ?? { records: [], summary: {} };
  const y = run?.axes?.Y ?? { records: [], summary: {} };
  const z = run?.axes?.Z ?? { records: [], summary: {} };
  const status = run?.status ?? 'NOT_RUN';
  const version = run?.factoryVersion ?? '—';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mend — SERPINA1/AATD</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui;color:#ecf2ff;background:#08111f}*{box-sizing:border-box}body{margin:0}.shell{max-width:1180px;margin:auto;padding:48px 24px 80px}header,.workflow-head{display:flex;justify-content:space-between;gap:24px;align-items:end;margin-bottom:32px}h1{font-size:44px;margin:0}h2{margin:8px 0;color:#dce8ff;font-weight:650}h3{margin:10px 0}.status,.workflow-status,.task-status{padding:10px 14px;border:1px solid #34557e;border-radius:999px;background:#10233d}.grid,.task-grid,.analysis-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.card,.task,.analysis-grid>div,.decision{background:#101d30;border:1px solid #213958;border-radius:18px;padding:22px}.axis,.eyebrow{color:#72d5ff;font-weight:750;letter-spacing:.08em}.number{font-size:44px;font-weight:800;margin:16px 0 4px}.muted,.evidence-count,.finding span,.decision span{color:#9fb0ca}details{margin-top:20px}ul{padding-left:20px}li{margin:12px 0}a{color:#8ddfff}p{font-size:14px;line-height:1.55;color:#a9b8d4}.workflow{margin-top:28px;padding:28px;background:#0c1728;border:1px solid #294767;border-radius:22px}.workflow.empty{display:flex;justify-content:space-between;align-items:center;gap:32px}.workflow.empty>div{max-width:720px}.analysis-grid{grid-template-columns:1fr 1fr;margin-bottom:20px}.task{display:flex;flex-direction:column}.task.complete{border-color:#2d7a66}.task-head{display:flex;justify-content:space-between;align-items:center}.task-status{font-size:11px;padding:6px 9px}.deliverable{margin-top:auto}.evidence-count{font-size:12px;margin:14px 0}.task-form,.decision-form{display:grid;gap:10px}.finding{border-top:1px solid #294767;padding-top:14px}.finding p{color:#d5e3fb}input,textarea,select,button{width:100%;font:inherit;border-radius:10px;border:1px solid #34557e;padding:11px 12px;background:#091525;color:#ecf2ff}textarea{min-height:82px;resize:vertical}button{width:auto;background:#2d7dff;border-color:#5c98ff;font-weight:700;cursor:pointer}button:hover{background:#428aff}.decision{margin-top:20px}.decision.final{border-color:#2d7a66}.decision.pending{opacity:.82}@media(max-width:860px){.grid,.task-grid{grid-template-columns:1fr}.analysis-grid{grid-template-columns:1fr}.workflow.empty,.workflow-head,header{align-items:start;flex-direction:column}}
</style></head><body><main class="shell"><header><div><div class="axis">MEND</div><h1>SERPINA1</h1><h2>Alpha-1 Antitrypsin Deficiency</h2></div><div class="status">Factory ${escapeHtml(version)} · ${escapeHtml(status)}</div></header>
<section class="grid">
<article class="card"><div class="axis">X — PIPELINE</div><div class="number">${escapeHtml(x.summary.programsFound ?? x.records.length)}</div><div class="muted">Programs · ${escapeHtml(x.summary.organizations ?? 0)} organizations</div><details><summary>Source evidence</summary><ul>${evidenceList(x.records)}</ul></details></article>
<article class="card"><div class="axis">Y — STRUCTURE</div><div class="number">${escapeHtml(y.summary.experimental_structures ?? y.records.length)}</div><div class="muted">Experimental structures · best ${escapeHtml(y.summary.best_resolution_angstrom ?? 'unknown')} Å</div><details><summary>Source evidence</summary><ul>${evidenceList(y.records)}</ul></details></article>
<article class="card"><div class="axis">Z — IP ACTIVITY</div><div class="number">${escapeHtml(z.summary.relevant_records ?? z.records.length)}</div><div class="muted">Visible records · intelligence signal, not legal advice</div><details><summary>Source evidence</summary><ul>${evidenceList(z.records)}</ul></details></article>
</section>${diligenceSection(workflow)}</main><script>
async function mendPost(path, body = {}) {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed');
  location.reload();
}
document.querySelector('#create-diligence')?.addEventListener('click', async () => {
  try { await mendPost('/mend/diligence'); } catch (error) { alert(error.message); }
});
for (const button of document.querySelectorAll('[data-complete-task]')) {
  button.addEventListener('click', async () => {
    const id = button.dataset.completeTask;
    const actor = document.querySelector('[data-actor-for="' + id + '"]').value;
    const finding = document.querySelector('[data-finding-for="' + id + '"]').value;
    try { await mendPost('/mend/diligence/tasks/' + encodeURIComponent(id) + '/complete', { actor, finding }); } catch (error) { alert(error.message); }
  });
}
document.querySelector('#record-decision')?.addEventListener('click', async () => {
  try { await mendPost('/mend/diligence/decision', { decision: document.querySelector('#decision-value').value, actor: document.querySelector('#decision-actor').value, rationale: document.querySelector('#decision-rationale').value }); } catch (error) { alert(error.message); }
});
</script></body></html>`;
}
