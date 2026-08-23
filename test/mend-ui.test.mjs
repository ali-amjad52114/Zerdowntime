import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoAxisRunners } from '../src/mend/demo.mjs';
import { healthySnapshot, runVerticalSlice } from '../src/mend/vertical-slice.mjs';
import { renderEmptyView, renderTargetView } from '../src/mend/ui.mjs';

async function runs() {
  const axisRunners = await createDemoAxisRunners();
  const healthy = await runVerticalSlice({ axisRunners, mode: 'normal', runId: 'ui-healthy', factoryVersion: 'v1' });
  const previousHealthy = healthySnapshot(healthy);
  const degraded = await runVerticalSlice({
    axisRunners, mode: 'break-x', previousHealthy, runId: 'ui-degraded', factoryVersion: 'v1',
  });
  return { healthy, degraded };
}

test('the view presents five panels mapped onto the three existing axes', async () => {
  const { healthy } = await runs();
  const html = renderTargetView(healthy);
  const core = html.slice(0, html.indexOf('Derived / downstream'));
  for (const title of [
    'Target', 'Cryo-EM and mass', 'Subcellular location', 'Market and CMC', 'Orphan status and exclusivity',
  ]) {
    assert.match(core, new RegExp(`<h3>${title}`), `missing panel: ${title}`);
  }
  assert.equal(core.match(/class="panel /g).length, 5);
  assert.match(html, /X — pipeline activity/);
  assert.match(html, /Y — structural readiness/);
  assert.match(html, /Z — IP activity/);
  assert.doesNotMatch(html, /W axis|fourth axis/);
});

test('the polished dossier renders the disease and discovered target from the run', async () => {
  const { healthy } = await runs();
  const html = renderTargetView({ ...healthy, target: 'EGFR', disease: 'Glioblastoma' });
  assert.match(html, /<h1>EGFR<\/h1>/);
  assert.match(html, /Glioblastoma/);
  assert.match(html, /research another disease or target/);
  assert.doesNotMatch(html, /<h1>SERPINA1<\/h1>/);
});

test('six further sections are derived from the same five panels, not a sixth axis', async () => {
  const { healthy } = await runs();
  const html = renderTargetView(healthy);
  const downstream = html.slice(html.indexOf('Derived / downstream'));
  for (const title of ['Product positioning', 'Go-to-market strategy', 'Insight generalization', 'Revenue — illustrative planning model', 'Resourcing', 'Virtual cell — simulated perturbation']) {
    assert.match(downstream, new RegExp(`<h3>${title}`), `missing downstream panel: ${title}`);
  }
  assert.equal(downstream.match(/class="panel /g).length, 6);
  assert.match(html, /Factory line/);
  assert.doesNotMatch(html, /Gaucher|Fabry|Pompe/i);
});

test('the run trace shows every stage with its gate, records and status', async () => {
  const { healthy } = await runs();
  const html = renderTargetView(healthy);
  assert.match(html, /Run trace/);
  for (const stage of ['X.site_geography', 'Y.target_identity', 'Z.orphan_exclusivity']) {
    assert.match(html, new RegExp(stage.replace('.', '\\.')));
  }
  assert.match(html, /6 released/);
  assert.match(html, /0 degraded/);
  assert.match(html, /0 gate issues across 6 stages/);
});

test('a degraded stage says so on the page and gives the reason', async () => {
  const { degraded } = await runs();
  const html = renderTargetView(degraded);
  assert.match(html, /PRESERVED_PREVIOUS_HEALTHY/);
  assert.match(html, /1 degraded/);
  assert.match(html, /class="panel p-degraded"/);
  assert.match(html, /Gate reported: X returned no evidence records/);
  // The sub-axes that stayed healthy are still released.
  assert.match(html, /5 released/);
});

test('all four core visualisations render from real axis output', async () => {
  const { healthy } = await runs();
  const html = renderTargetView(healthy);
  const core = html.slice(0, html.indexOf('Derived / downstream'));
  assert.match(core, /Cell cross-section highlighting Secreted/);
  assert.match(core, /Structure resolutions by experimental method/);
  assert.match(core, /Protein sequence map over 418 residues/);
  assert.match(core, /class="barfill"/);
  // 3 core 2D svg charts + 1 factory-line svg = 4 svgs before the downstream section starts.
  assert.equal(core.match(/<svg/g).length, 4);
});

test('the six downstream sections render their 3D charts from real and illustrative data alike', async () => {
  const { healthy } = await runs();
  const html = renderTargetView(healthy);
  const downstream = html.slice(html.indexOf('Derived / downstream'));
  assert.match(downstream, /Product positioning by stage/i);
  assert.equal((downstream.match(/class="viz3d"/g) || []).length, 6);
  assert.match(downstream, /class="tag computed"/);
  assert.match(downstream, /class="tag illustrative"/);
});

test('the virtual cell panel simulates only modalities this run actually reports, on a citable mechanism basis', async () => {
  const { healthy } = await runs();
  const html = renderTargetView(healthy);
  const downstream = html.slice(html.indexOf('Derived / downstream'));
  const start = downstream.indexOf('<h3>Virtual cell');
  const panelHtml = downstream.slice(downstream.lastIndexOf('<article', start), downstream.indexOf('</article>', start) + 10);
  assert.match(panelHtml, /not a trained predictive model/);
  assert.match(panelHtml, /ER polymer burden|Secretion|Elastase inhibition|ER stress/);
  assert.doesNotMatch(panelHtml, /Gaucher|Fabry|Pompe/i);
});

test('curated tables are labelled as curated on screen, not in the JSON only', async () => {
  const { healthy } = await runs();
  const html = renderTargetView(healthy);
  assert.match(html, /class="tag curated"/);
  assert.match(html, /Incumbent to beat/);
  assert.match(html, /\$100k–200k per patient per year/);
  assert.match(html, /CMC by modality/);
  assert.match(html, /verify before relying/);
});

test('the orphan panel renders every clock state and marks a stalled designation', async () => {
  const { healthy } = await runs();
  const html = renderTargetView(healthy);
  assert.match(html, /not started — no approval on record/);
  assert.match(html, /running/);
  assert.match(html, /expired/);
  assert.match(html, /class="tag risk"[^>]*>stalled/);
  assert.match(html, /yr left/);
});

test('the page carries the disclaimers the axes attach to their summaries', async () => {
  const { healthy } = await runs();
  const html = renderTargetView(healthy);
  assert.match(html, /not legal advice or a patent-claim analysis/);
  assert.match(html, /Designation is not approval/);
});

test('the empty state is a page that explains how to start a run', () => {
  const html = renderEmptyView();
  assert.match(html, /No run yet/);
  assert.match(html, /POST \/mend\/runs/);
  assert.match(html, /npm run mend:site/);
  assert.doesNotMatch(html, /class="panel /);
  assert.equal(renderTargetView(null), html);
  assert.equal(renderTargetView({}), html);
});

test('the page is self-contained and theme-aware', async () => {
  const { healthy } = await runs();
  const html = renderTargetView(healthy);
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /prefers-color-scheme:dark/);
  // The read-only half of the page stays a plain document. The diligence forms genuinely
  // post back, so the page carries exactly one inline vanilla script — never a framework,
  // never a remote asset, and never a second block that could quietly become a bundle.
  assert.doesNotMatch(html, /https?:\/\/[^"']*\.(?:js|css)/);
  assert.doesNotMatch(html, /<script[^>]+src=/);
  assert.equal((html.match(/<script/g) ?? []).length, 1);
});

test('a degraded core stage visibly propagates into the downstream sections that depend on it, and leaves the rest released', async () => {
  const { degraded } = await runs();
  const html = renderTargetView(degraded);
  const downstream = html.slice(html.indexOf('Derived / downstream'));
  // Product positioning, insight generalization, revenue, resourcing and the virtual cell
  // simulation all read X.
  assert.equal((downstream.match(/class="panel p-degraded"/g) || []).length, 5);
  assert.match(downstream, /Gate reported: X returned no evidence records/);
  // Go-to-market reads X.site_geography and Z.orphan_exclusivity, neither of which degraded.
  const gtmStart = downstream.indexOf('<h3>Go-to-market strategy');
  const gtmPanel = downstream.slice(downstream.lastIndexOf('<article', gtmStart), downstream.indexOf('</article>', gtmStart) + 10);
  assert.match(gtmPanel, /class="panel p-released"|class="panel "/);
  assert.doesNotMatch(gtmPanel, /p-degraded/);
});

test('a true first-run failure (no previous healthy snapshot) blocks the dependent downstream sections instead of rendering thin data', async () => {
  const axisRunners = await createDemoAxisRunners();
  const firstFailure = await runVerticalSlice({ axisRunners, mode: 'break-x', runId: 'ui-first-failure', factoryVersion: 'v1' });
  assert.equal(firstFailure.axes.X.status, 'UNAVAILABLE');
  const html = renderTargetView(firstFailure);
  const downstream = html.slice(html.indexOf('Derived / downstream'));
  assert.match(downstream, /class="panel p-blocked"/);
  assert.match(downstream, /Blocked — depends on/);
  // No fabricated chart numbers: the positioning panel's own chart must degrade to a caption.
  const positioningStart = downstream.indexOf('<h3>Product positioning');
  const positioningPanel = downstream.slice(downstream.lastIndexOf('<article', positioningStart), downstream.indexOf('</article>', positioningStart) + 10);
  assert.doesNotMatch(positioningPanel, /<svg/);
  assert.match(positioningPanel, /class="vcap"/);
});
