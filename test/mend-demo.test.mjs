import assert from 'node:assert/strict';
import test from 'node:test';
import { runDemoLifecycle } from '../src/mend/demo.mjs';

test('real X/Y/Z adapters execute the healthy, isolated failure, and repaired lifecycle', async () => {
  const lifecycle = await runDemoLifecycle();

  assert.equal(lifecycle.healthy.status, 'HEALTHY');
  assert.equal(lifecycle.healthy.axes.X.summary.programsFound, 8);
  assert.equal(lifecycle.healthy.axes.Y.summary.experimental_structures, 3);
  assert.equal(lifecycle.healthy.axes.Z.summary.relevant_records, 3);

  assert.equal(lifecycle.failed.status, 'DEGRADED');
  assert.deepEqual(lifecycle.failed.failedAxes, ['X']);
  assert.equal(lifecycle.failed.axes.X.status, 'STALE_HEALTHY');
  assert.equal(lifecycle.failed.axes.X.records.length, 8);
  assert.equal(lifecycle.failed.axes.Y.status, 'HEALTHY');
  assert.equal(lifecycle.failed.axes.Z.status, 'HEALTHY');

  assert.equal(lifecycle.recovered.status, 'HEALTHY');
  assert.equal(lifecycle.recovered.factoryVersion, 'v2');
  assert.equal(lifecycle.recovered.axes.X.records.length, 8);
  assert.equal(lifecycle.recovered.axes.Y.records.length, 3);
  assert.equal(lifecycle.recovered.axes.Z.records.length, 3);
});
