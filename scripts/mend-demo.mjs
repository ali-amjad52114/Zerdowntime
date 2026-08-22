import { runDemoLifecycle } from '../src/mend/demo.mjs';

const { healthy, failed, recovered } = await runDemoLifecycle();
const view = (run) => ({
  runId: run.runId,
  factoryVersion: run.factoryVersion,
  status: run.status,
  publishStatus: run.publishStatus,
  failedAxes: run.failedAxes,
  X: { status: run.axes.X.status, records: run.axes.X.records.length, summary: run.axes.X.summary },
  Y: { status: run.axes.Y.status, records: run.axes.Y.records.length, summary: run.axes.Y.summary },
  Z: { status: run.axes.Z.status, records: run.axes.Z.records.length, summary: run.axes.Z.summary },
});

process.stdout.write(`${JSON.stringify({ healthy: view(healthy), failed: view(failed), recovered: view(recovered) }, null, 2)}\n`);
