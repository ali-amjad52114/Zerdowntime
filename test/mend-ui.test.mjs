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
  for (const title of [
    'Target', 'Cryo-EM and mass', 'Subcellular location', 'Market and CMC', 'Orphan status and exclusivity',
  ]) {
    assert.match(html, new RegExp(`<h3>${title}`), `missing panel: ${title}`);
  }
  assert.equal(html.match(/class="panel /g).length, 5);
  assert.match(html, /X — pipeline activity/);
  assert.match(html, /Y — structural readiness/);
  assert.match(html, /Z — IP activity/);
  assert.doesNotMatch(html, /W axis|fourth axis/);
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

test('all four visualisations render from real axis output', async () => {
  const { healthy } = await runs();
  const html = renderTargetView(healthy);
  assert.match(html, /Cell cross-section highlighting Secreted/);
  assert.match(html, /Structure resolutions by experimental method/);
  assert.match(html, /Protein sequence map over 418 residues/);
  assert.match(html, /class="barfill"/);
  assert.equal(html.match(/<svg/g).length, 3);
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
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html, /https?:\/\/[^"']*\.(?:js|css)/);
});
