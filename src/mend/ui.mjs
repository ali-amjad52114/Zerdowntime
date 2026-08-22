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

export function renderTargetView(run) {
  const x = run?.axes?.X ?? { records: [], summary: {} };
  const y = run?.axes?.Y ?? { records: [], summary: {} };
  const z = run?.axes?.Z ?? { records: [], summary: {} };
  const status = run?.status ?? 'NOT_RUN';
  const version = run?.factoryVersion ?? '—';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mend — SERPINA1/AATD</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui;color:#ecf2ff;background:#08111f}body{margin:0}.shell{max-width:1080px;margin:auto;padding:48px 24px}header{display:flex;justify-content:space-between;gap:24px;align-items:end;margin-bottom:32px}h1{font-size:44px;margin:0}h2{margin:8px 0;color:#a9b8d4;font-weight:500}.status{padding:10px 14px;border:1px solid #34557e;border-radius:999px;background:#10233d}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.card{background:#101d30;border:1px solid #213958;border-radius:18px;padding:22px}.axis{color:#72d5ff;font-weight:750;letter-spacing:.08em}.number{font-size:44px;font-weight:800;margin:16px 0 4px}.muted{color:#9fb0ca}details{margin-top:20px}ul{padding-left:20px}li{margin:14px 0}a{color:#8ddfff}p{font-size:13px;color:#a9b8d4}@media(max-width:760px){.grid{grid-template-columns:1fr}header{align-items:start;flex-direction:column}}
</style></head><body><main class="shell"><header><div><div class="axis">MEND</div><h1>SERPINA1</h1><h2>Alpha-1 Antitrypsin Deficiency</h2></div><div class="status">Factory ${escapeHtml(version)} · ${escapeHtml(status)}</div></header>
<section class="grid">
<article class="card"><div class="axis">X — PIPELINE</div><div class="number">${escapeHtml(x.summary.programsFound ?? x.records.length)}</div><div class="muted">Programs · ${escapeHtml(x.summary.organizations ?? 0)} organizations</div><details><summary>Source evidence</summary><ul>${evidenceList(x.records)}</ul></details></article>
<article class="card"><div class="axis">Y — STRUCTURE</div><div class="number">${escapeHtml(y.summary.experimental_structures ?? y.records.length)}</div><div class="muted">Experimental structures · best ${escapeHtml(y.summary.best_resolution_angstrom ?? 'unknown')} Å</div><details><summary>Source evidence</summary><ul>${evidenceList(y.records)}</ul></details></article>
<article class="card"><div class="axis">Z — IP ACTIVITY</div><div class="number">${escapeHtml(z.summary.relevant_records ?? z.records.length)}</div><div class="muted">Visible records · intelligence signal, not legal advice</div><details><summary>Source evidence</summary><ul>${evidenceList(z.records)}</ul></details></article>
</section></main></body></html>`;
}
