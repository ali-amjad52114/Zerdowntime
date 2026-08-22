import assert from 'node:assert/strict';
import test from 'node:test';
import { DOWNSTREAM_DEPENDENCIES, rollupAllDownstream, rollupDownstreamStatus } from '../src/mend/downstream-status.mjs';

function stage(id, overrides = {}) {
  return { id, label: id, status: 'released', gate: 'PASS', records: 3, issues: [], issue_count: 0, source: 'fixture', note: null, ...overrides };
}

function trace(stages) {
  return { stages };
}

const ALL_STAGE_IDS = ['X', 'X.site_geography', 'Y', 'Y.target_identity', 'Z', 'Z.orphan_exclusivity'];

test('every downstream section is released when its dependency stages are all released', () => {
  const healthy = trace(ALL_STAGE_IDS.map((id) => stage(id)));
  const rollup = rollupAllDownstream(healthy);
  for (const key of Object.keys(DOWNSTREAM_DEPENDENCIES)) {
    assert.equal(rollup[key].status, 'released', `${key} should be released`);
    assert.equal(rollup[key].gate, 'PASS');
    assert.equal(rollup[key].note, null);
  }
});

test('a degraded dependency degrades only the sections that actually depend on it, and names the reason', () => {
  const degradedX = trace(ALL_STAGE_IDS.map((id) => (id === 'X'
    ? stage('X', { status: 'degraded', gate: 'FAIL', issues: ['X returned no evidence records'], issue_count: 1, note: 'Serving the last healthy snapshot; this run’s extraction was quarantined.' })
    : stage(id))));
  const rollup = rollupAllDownstream(degradedX);

  // Depends on X: product_positioning, revenue_forecast, resourcing, insight_generalization,
  // virtual_cell_simulation.
  for (const key of ['product_positioning', 'revenue_forecast', 'resourcing', 'insight_generalization', 'virtual_cell_simulation']) {
    assert.equal(rollup[key].status, 'degraded', `${key} should degrade when X degrades`);
    assert.match(rollup[key].note, /X/);
    assert.deepEqual(rollup[key].issues, ['X returned no evidence records']);
  }
  // Does NOT depend on X (or depends only on X.site_geography, which stayed released,
  // matching the real factory behaviour where a degraded parent axis does not degrade its
  // sub-axis): go_to_market.
  assert.equal(rollup.go_to_market.status, 'released', 'go-to-market only depends on X.site_geography and Z.orphan_exclusivity, not X itself');
});

test('a failed dependency with no fallback data blocks the section — chart replaced, not degraded', () => {
  const failedZOrphan = trace(ALL_STAGE_IDS.map((id) => (id === 'Z.orphan_exclusivity'
    ? stage('Z.orphan_exclusivity', { status: 'failed', gate: 'FAIL', records: 0, issues: ['orphan validation requires at least one designation record'], issue_count: 1 })
    : stage(id))));
  const rollup = rollupAllDownstream(failedZOrphan);

  for (const key of ['go_to_market', 'insight_generalization', 'revenue_forecast']) {
    assert.equal(rollup[key].status, 'blocked', `${key} should block when Z.orphan_exclusivity fails with no data`);
    assert.match(rollup[key].note, /Z\.orphan_exclusivity/);
  }
  // Unaffected sections stay released.
  assert.equal(rollup.product_positioning.status, 'released');
  assert.equal(rollup.resourcing.status, 'released');
  assert.equal(rollup.virtual_cell_simulation.status, 'released', 'depends on Y.target_identity, not Z.orphan_exclusivity');
});

test('a section with two dependencies where only one is degraded reads degraded, never upgraded to blocked', () => {
  const partiallyDegraded = trace([
    stage('X', { status: 'degraded', gate: 'FAIL', issues: ['stale'], issue_count: 1 }),
    stage('X.site_geography'),
    stage('Y'), stage('Y.target_identity'),
    stage('Z'), stage('Z.orphan_exclusivity'),
  ]);
  const rollup = rollupDownstreamStatus(partiallyDegraded, DOWNSTREAM_DEPENDENCIES.revenue_forecast); // ['X', 'Z.orphan_exclusivity']
  assert.equal(rollup.status, 'degraded');
  assert.notEqual(rollup.status, 'blocked');
});

test('a missing dependency stage (never ran) is treated as blocked, not silently released', () => {
  const missing = trace([stage('X.site_geography'), stage('Y'), stage('Y.target_identity'), stage('Z'), stage('Z.orphan_exclusivity')]); // no 'X'
  const rollup = rollupDownstreamStatus(missing, ['X']);
  assert.equal(rollup.status, 'blocked');
});

test('the rollup shape is a structural match for run-trace.mjs\'s own stage shape', () => {
  const rollup = rollupAllDownstream(trace(ALL_STAGE_IDS.map((id) => stage(id))));
  for (const key of Object.keys(DOWNSTREAM_DEPENDENCIES)) {
    const entry = rollup[key];
    for (const field of ['id', 'label', 'status', 'gate', 'records', 'issues', 'issue_count', 'source', 'note']) {
      assert.ok(field in entry, `${key} rollup is missing field ${field}`);
    }
    assert.ok(Array.isArray(entry.issues));
    assert.ok(['released', 'degraded', 'blocked'].includes(entry.status));
  }
});

test('every downstream section names dependency stage ids that actually exist in a real run trace', () => {
  for (const dependsOn of Object.values(DOWNSTREAM_DEPENDENCIES)) {
    for (const id of dependsOn) assert.ok(ALL_STAGE_IDS.includes(id), `${id} is not a real stage id`);
  }
});
