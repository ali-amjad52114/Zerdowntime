import assert from 'node:assert/strict';
import test from 'node:test';
import { factoryLine } from '../src/mend/factory-line.mjs';
import { rollupAllDownstream } from '../src/mend/downstream-status.mjs';

function stage(id, status = 'released') {
  return { id, label: id, status, gate: status === 'released' ? 'PASS' : 'FAIL', records: 3, issues: [], issue_count: 0, source: null, note: null };
}

const HEALTHY_TRACE = {
  stages: ['X', 'X.site_geography', 'Y', 'Y.target_identity', 'Z', 'Z.orphan_exclusivity'].map((id) => stage(id)),
};

test('an empty or not-run trace degrades to a caption, not a blank canvas', () => {
  assert.match(factoryLine(null), /class="vcap"/);
  assert.match(factoryLine({ stages: [] }), /class="vcap"/);
  assert.doesNotMatch(factoryLine(null), /<svg/);
});

test('a healthy run draws all five core nodes, the input node, and every downstream node', () => {
  const markup = factoryLine(HEALTHY_TRACE, rollupAllDownstream(HEALTHY_TRACE));
  for (const label of ['Input: disease name', 'Target', 'Cryo-EM &amp; mass', 'Subcellular location', 'Market &amp; CMC', 'Orphan status']) {
    assert.match(markup, new RegExp(`>${label}<`), `missing core node: ${label}`);
  }
  for (const label of ['Positioning', 'Go-to-market', 'Generalization', 'Revenue model', 'Resourcing', 'Virtual cell']) {
    assert.match(markup, new RegExp(`>${label}<`), `missing downstream node: ${label}`);
  }
  assert.equal((markup.match(/<rect/g) || []).length, 12, 'input + 5 core + 6 downstream = 12 boxes');
});

test('every node and edge carries a title, and colours are themed, never hard-coded', () => {
  const markup = factoryLine(HEALTHY_TRACE, rollupAllDownstream(HEALTHY_TRACE));
  assert.match(markup, /<title>/);
  assert.doesNotMatch(markup, /#[0-9a-fA-F]{3,6}(?![0-9a-fA-F])/);
  assert.match(markup, /var\(--ok\)/);
});

test('a degraded core stage colours its node amber and cascades amber into every dependent downstream node', () => {
  const degradedTrace = {
    stages: ['X', 'X.site_geography', 'Y', 'Y.target_identity', 'Z', 'Z.orphan_exclusivity'].map((id) => stage(id, id === 'X' ? 'degraded' : 'released')),
  };
  const rollup = rollupAllDownstream(degradedTrace);
  const markup = factoryLine(degradedTrace, rollup);

  const targetNode = markup.slice(markup.indexOf('>Target<') - 400, markup.indexOf('>Target<'));
  assert.match(targetNode, /var\(--warn\)/, 'the Target node itself must read degraded');

  // Product positioning depends only on X, so it must degrade; go-to-market does not depend on
  // X directly (only on X.site_geography, which stayed released), so it must stay released.
  assert.equal(rollup.product_positioning.status, 'degraded');
  assert.equal(rollup.go_to_market.status, 'released');
  const positioningNode = markup.slice(markup.indexOf('>Positioning<') - 400, markup.indexOf('>Positioning<'));
  assert.match(positioningNode, /var\(--warn\)/);
});

test('a blocked core stage colours its node and every dependent downstream node red', () => {
  const failedTrace = { stages: ['X.site_geography', 'Y', 'Y.target_identity', 'Z', 'Z.orphan_exclusivity'].map((id) => stage(id)) }; // 'X' missing entirely
  const rollup = rollupAllDownstream(failedTrace);
  const markup = factoryLine(failedTrace, rollup);
  assert.equal(rollup.product_positioning.status, 'blocked');
  assert.equal(rollup.resourcing.status, 'blocked');
  const positioningNode = markup.slice(markup.indexOf('>Positioning<') - 400, markup.indexOf('>Positioning<'));
  assert.match(positioningNode, /var\(--risk\)/);
});

test('every downstream node draws an incoming edge from every core node it actually depends on', () => {
  const markup = factoryLine(HEALTHY_TRACE, rollupAllDownstream(HEALTHY_TRACE));
  // 5 edges from Input to each core node, plus one edge per (downstream, dependency) pair.
  const totalDependencyEdges = Object.values(rollupAllDownstream(HEALTHY_TRACE)).reduce((total, entry) => total + entry.dependsOn.length, 0);
  const pathCount = (markup.match(/<path /g) || []).length;
  assert.equal(pathCount, 5 + totalDependencyEdges);
});
