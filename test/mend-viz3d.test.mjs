import assert from 'node:assert/strict';
import test from 'node:test';
import { bars3d, ribbon3d, scatter3d } from '../src/mend/viz3d.mjs';

function viewBoxOf(markup) {
  const [, minX, minY, width, height] = markup.match(/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/).map(Number);
  return { minX, minY, width, height };
}

/** Generic bbox-containment check: every numeric coordinate the SVG actually draws with. */
function assertAllMarksWithinViewBox(markup) {
  const { minX, minY, width, height } = viewBoxOf(markup);
  const tolerance = 1.5;
  const xs = [...markup.matchAll(/(?:^|[ "])c?x1?="(-?[\d.]+)"/g)].map((match) => Number(match[1]));
  const ys = [...markup.matchAll(/(?:^|[ "])c?y1?="(-?[\d.]+)"/g)].map((match) => Number(match[1]));
  const points = [...markup.matchAll(/points="([^"]+)"/g)].flatMap((match) => match[1].trim().split(/\s+/).map((pair) => pair.split(',').map(Number)));
  for (const x of xs) assert.ok(x >= minX - tolerance && x <= minX + width + tolerance, `x=${x} outside viewBox [${minX}, ${minX + width}]`);
  for (const y of ys) assert.ok(y >= minY - tolerance && y <= minY + height + tolerance, `y=${y} outside viewBox [${minY}, ${minY + height}]`);
  for (const [px, py] of points) {
    assert.ok(px >= minX - tolerance && px <= minX + width + tolerance, `polygon x=${px} outside viewBox`);
    assert.ok(py >= minY - tolerance && py <= minY + height + tolerance, `polygon y=${py} outside viewBox`);
  }
  assert.ok(xs.length + points.length > 0, 'expected at least one drawn mark');
}

const SCATTER_POINTS = [
  { x: 1, y: 2, z: 8, label: 'A', title: 'point A, small x+y' },
  { x: 6, y: 7, z: 2, label: 'B', title: 'point B, large x+y' },
];
const BARS_CELLS = [
  { xCategory: 'A', yCategory: 'P', z: 4, title: 'A/P: 4' },
  { xCategory: 'B', yCategory: 'Q', z: 6, title: 'B/Q: 6' },
];
const BARS_OPTS = { xCategories: ['A', 'B'], yCategories: ['P', 'Q'], xLabel: 'X', yLabel: 'Y', zLabel: 'Z' };
const RIBBON_LANES = [
  { name: 'Low', colorVar: 'var(--warn)', points: [1, 2, 3].map((x) => ({ x, z: x })) },
  { name: 'High', colorVar: 'var(--ok)', points: [1, 2, 3].map((x) => ({ x, z: x * 3 })) },
];

test('all three primitives degrade to a caption on empty input, never an empty box', () => {
  for (const markup of [scatter3d([]), scatter3d(undefined), bars3d([], BARS_OPTS), bars3d(BARS_CELLS, {}), ribbon3d([]), ribbon3d([{ name: 'Low', points: [] }])]) {
    assert.match(markup, /class="vcap"/);
    assert.doesNotMatch(markup, /<svg/);
  }
});

test('every mark carries a title so hovering gives the record behind it', () => {
  for (const markup of [
    scatter3d(SCATTER_POINTS, { xLabel: 'Stage', yLabel: 'Diff', zLabel: 'Simplicity' }),
    bars3d(BARS_CELLS, BARS_OPTS),
    ribbon3d(RIBBON_LANES, { xLabel: 'Year', zLabel: '$M' }),
  ]) {
    assert.match(markup, /<title>/);
  }
});

test('colours come from CSS variables, never a hard-coded hex', () => {
  for (const markup of [
    scatter3d(SCATTER_POINTS, { xLabel: 'Stage', yLabel: 'Diff', zLabel: 'Simplicity' }),
    bars3d(BARS_CELLS, BARS_OPTS),
    ribbon3d(RIBBON_LANES, { xLabel: 'Year', zLabel: '$M' }),
  ]) {
    assert.doesNotMatch(markup, /#[0-9a-fA-F]{3,6}(?![0-9a-fA-F])/);
    assert.match(markup, /var\(--/);
  }
});

test('rendering is deterministic — identical input produces byte-identical output', () => {
  const first = bars3d(BARS_CELLS, BARS_OPTS);
  const second = bars3d(BARS_CELLS, BARS_OPTS);
  assert.equal(first, second);
  const s1 = scatter3d(SCATTER_POINTS, { xLabel: 'Stage', yLabel: 'Diff', zLabel: 'Simplicity' });
  const s2 = scatter3d(SCATTER_POINTS, { xLabel: 'Stage', yLabel: 'Diff', zLabel: 'Simplicity' });
  assert.equal(s1, s2);
});

test('the viewBox actually contains every mark it draws — no clipped geometry', () => {
  assertAllMarksWithinViewBox(scatter3d(SCATTER_POINTS, { xLabel: 'Stage', yLabel: 'Diff', zLabel: 'Simplicity' }));
  assertAllMarksWithinViewBox(bars3d(BARS_CELLS, BARS_OPTS));
  assertAllMarksWithinViewBox(ribbon3d(RIBBON_LANES, { xLabel: 'Year', zLabel: '$M', bandBetween: ['Low', 'High'], cliffAt: { x: 2, title: 'cliff' } }));
  // A denser scatter, closer to what a real pipeline run produces, to catch a bbox bug that a
  // two-point fixture might not trigger.
  const dense = Array.from({ length: 9 }, (_, index) => ({ x: index + 1, y: (index * 3) % 10, z: (index * 2) % 10, label: `P${index}` }));
  assertAllMarksWithinViewBox(scatter3d(dense, { xLabel: 'Stage', yLabel: 'Diff', zLabel: 'Simplicity' }));
});

test('bars3d paints cells back-to-front: the further cell\'s faces appear before the nearer one\'s', () => {
  // A/P sits at grid (0,0) → depth 0; B/Q sits at grid (1,1) → depth further into the scene.
  // Painter's algorithm must draw the further cell first so the nearer one can occlude it.
  const markup = bars3d(BARS_CELLS, BARS_OPTS);
  const farIndex = markup.indexOf('A/P: 4');
  const nearIndex = markup.indexOf('B/Q: 6');
  assert.ok(farIndex >= 0 && nearIndex >= 0);
  assert.ok(farIndex < nearIndex, 'the cell at the smaller grid depth must paint first');
});

test('bars3d draws each cell\'s three faces in the same fixed local order every time', () => {
  const markup = bars3d(BARS_CELLS, BARS_OPTS);
  // Each cell's three faces share one title (they're the same physical column), so pull the
  // three consecutive <polygon> elements that carry it and check the fill order on that group.
  const fills = [...markup.matchAll(/<polygon[^>]*fill="(var\([^)]*\))"><title>A\/P: 4<\/title><\/polygon>/g)].map((match) => match[1]);
  assert.equal(fills.length, 3, 'expected exactly one cell\'s three faces');
  assert.deepEqual(fills, ['var(--bars3d-side-l)', 'var(--bars3d-side-r)', 'var(--struct)'], 'faces must draw left, then right, then top');
});

test('scatter3d paints the smaller-depth point first so a nearer point layers correctly on top', () => {
  const markup = scatter3d(SCATTER_POINTS, { xLabel: 'Stage', yLabel: 'Diff', zLabel: 'Simplicity' });
  const smallSumIndex = markup.indexOf('small x+y');
  const largeSumIndex = markup.indexOf('large x+y');
  assert.ok(smallSumIndex >= 0 && largeSumIndex >= 0);
  assert.ok(smallSumIndex < largeSumIndex, 'the point with the smaller x+y depth key must paint first');
});

test('an oversized point set is capped, kept to the highest-z points, and the drop is captioned', () => {
  const many = Array.from({ length: 14 }, (_, index) => ({ x: index + 1, y: 1, z: index, label: `P${index}` }));
  const markup = scatter3d(many, { xLabel: 'Stage', yLabel: 'Diff', zLabel: 'Simplicity' });
  assert.match(markup, /further point/);
  // The lowest-z points should be the ones dropped.
  assert.doesNotMatch(markup, />P0<\/text>/);
  assert.match(markup, />P13<\/text>/);
});

test('an oversized category axis is capped to the highest-total categories, and the drop is captioned', () => {
  const manyCategories = Array.from({ length: 11 }, (_, index) => `Region ${index}`);
  const cells = manyCategories.map((category, index) => ({ xCategory: category, yCategory: 'Channel', z: index + 1, title: `${category}: ${index + 1}` }));
  const markup = bars3d(cells, { xCategories: manyCategories, yCategories: ['Channel'], xLabel: 'Region', yLabel: 'Channel', zLabel: 'Priority' });
  assert.match(markup, /further region categor(?:y is|ies are) not shown/);
  // Region 10 (index 10, z=11) is the highest value and must survive the cap.
  assert.match(markup, /Region 10/);
  assert.doesNotMatch(markup, /Region 0[^0-9]/);
});

test('a cell whose category is not in the declared category lists is silently excluded, not misplotted', () => {
  const markup = bars3d([...BARS_CELLS, { xCategory: 'Unknown', yCategory: 'P', z: 99, title: 'should not appear' }], BARS_OPTS);
  assert.doesNotMatch(markup, /should not appear/);
});

test('ribbon3d draws the requested band and cliff line, and each lane keeps its own colour', () => {
  const markup = ribbon3d(RIBBON_LANES, { xLabel: 'Year', zLabel: '$M', bandBetween: ['Low', 'High'], cliffAt: { x: 2, title: 'Exclusivity ends 2028' } });
  assert.match(markup, /Exclusivity ends 2028/);
  assert.match(markup, /var\(--warn\)/);
  assert.match(markup, /var\(--ok\)/);
  assert.match(markup, /<polygon/); // the band fill
});

test('ribbon3d omits the cliff line when the cliff falls outside the plotted range', () => {
  const markup = ribbon3d(RIBBON_LANES, { xLabel: 'Year', zLabel: '$M', cliffAt: { x: 50, title: 'out of range' } });
  assert.doesNotMatch(markup, /out of range/);
});

test('every 3D chart is followed by a collapsed fallback table with the exact values', () => {
  for (const markup of [
    scatter3d(SCATTER_POINTS, { xLabel: 'Stage', yLabel: 'Diff', zLabel: 'Simplicity' }),
    bars3d(BARS_CELLS, BARS_OPTS),
    ribbon3d(RIBBON_LANES, { xLabel: 'Year', zLabel: '$M' }),
  ]) {
    assert.match(markup, /<details><summary>Exact values<\/summary>/);
    assert.match(markup, /<table>/);
  }
});
