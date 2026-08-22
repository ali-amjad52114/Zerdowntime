import { loadLocalEnv } from './env.mjs';
import { runDemoLifecycle } from '../src/mend/demo.mjs';
import { createTelemetry } from '../src/telemetry.mjs';

loadLocalEnv();
const telemetry = createTelemetry({ serviceName: process.env.OTEL_SERVICE_NAME ?? 'mend-vertical-slice' });
try {
  const lifecycle = await runDemoLifecycle({ telemetry });
  await telemetry.flush();
  process.stdout.write(`${JSON.stringify({
    service: telemetry.serviceName,
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318',
    runs: [lifecycle.healthy, lifecycle.failed, lifecycle.recovered].map((run) => ({
      runId: run.runId, factoryVersion: run.factoryVersion, status: run.status, failedAxes: run.failedAxes,
    })),
  }, null, 2)}\n`);
} finally {
  await telemetry.shutdown();
}
