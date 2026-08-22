import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRunTrace, stageIssues } from '../src/mend/run-trace.mjs';

function run(overrides = {}) {
  return {
    runId: 'trace-1',
    factoryVersion: 'v1',
    mode: 'normal',
    status: 'HEALTHY',
    publishStatus: 'PUBLISHED',
    failedAxes: [],
    axes: {
      X: {
        status: 'HEALTHY',
        records: [{ source_name: 'pipeline fixture' }],
        validation: { status: 'PASS', reasons: [] },
        sub_axes: {
          site_geography: { records: [{}, {}], validation: { status: 'PASS', issues: [] } },
        },
      },
      Y: { status: 'HEALTHY', records: [{}], validation: { valid: true, errors: [] } },
      Z: { status: 'HEALTHY', records: [{}], validation: { status: 'PASS', issues: [] } },
    },
    ...overrides,
  };
}

test('every axis and sub-axis becomes a stage in source order', () => {
  const trace = buildRunTrace(run());
  assert.deepEqual(trace.stages.map((stage) => stage.id), ['X', 'X.site_geography', 'Y', 'Z']);
  assert.equal(trace.stage_count, 4);
  assert.equal(trace.counts.released, 4);
  assert.equal(trace.issue_count, 0);
});

test('a quarantined axis reads as degraded and says why', () => {
  const trace = buildRunTrace(run({
    status: 'DEGRADED',
    publishStatus: 'PRESERVED_PREVIOUS_HEALTHY',
    failedAxes: ['X'],
    axes: {
      ...run().axes,
      X: {
        status: 'STALE_HEALTHY',
        records: [{}],
        validation: { status: 'FAIL', reasons: ['MISSING_IDENTITY:0:program', 'EXCESSIVE_MISSINGNESS'] },
      },
    },
  }));
  const [x] = trace.stages;
  assert.equal(x.status, 'degraded');
  assert.equal(x.gate, 'FAIL');
  assert.deepEqual(x.issues, ['MISSING_IDENTITY:0:program', 'EXCESSIVE_MISSINGNESS']);
  assert.equal(x.issue_count, 2);
  assert.match(x.note, /last healthy snapshot/);
  assert.equal(trace.counts.degraded, 1);
  assert.equal(trace.issue_count, 2);
});

test('an axis with no fallback reads as failed', () => {
  const trace = buildRunTrace(run({
    axes: { ...run().axes, Z: { status: 'UNAVAILABLE', records: [], validation: { status: 'FAIL', reason: 'source empty' } } },
  }));
  const z = trace.stages.find((stage) => stage.id === 'Z');
  assert.equal(z.status, 'failed');
  assert.deepEqual(z.issues, ['source empty']);
  assert.equal(trace.counts.failed, 1);
});

test('the three validator dialects are all read without being flattened into one', () => {
  assert.deepEqual(stageIssues({ status: 'FAIL', reasons: ['EMPTY_RESULT'] }), ['EMPTY_RESULT']);
  assert.deepEqual(stageIssues({ status: 'FAIL', issues: ['record 0: axis must be Z'] }), ['record 0: axis must be Z']);
  assert.deepEqual(
    stageIssues({ valid: false, errors: [{ field: 'structure_id', message: 'must be a valid four-character PDB identifier' }] }),
    ['structure_id: must be a valid four-character PDB identifier'],
  );
  assert.deepEqual(stageIssues(undefined), []);
});

test('an empty run still produces a readable trace', () => {
  const trace = buildRunTrace(null);
  assert.equal(trace.status, 'NOT_RUN');
  assert.deepEqual(trace.stages, []);
  assert.equal(trace.stage_count, 0);
});
