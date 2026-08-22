import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadLocalEnv } from './env.mjs';
import { emitG3VerificationRun } from '../src/mend/g3-telemetry.mjs';
import { createTelemetry } from '../src/telemetry.mjs';

loadLocalEnv('.env.local', { override: true });

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const headers = process.env.OTEL_EXPORTER_OTLP_HEADERS;
const collectorId = process.env.MEND_X_COLLECTOR_ID ?? process.env.SCRAPER_STUDIO_COLLECTOR_ID;
if (!endpoint || !headers) {
  throw new Error('OTEL_EXPORTER_OTLP_ENDPOINT and OTEL_EXPORTER_OTLP_HEADERS are required; SIGNOZ_API_KEY is read-only API authentication, not ingestion authentication');
}
if (!/(?:^|,)\s*signoz-ingestion-key=/i.test(headers)) {
  throw new Error('OTEL_EXPORTER_OTLP_HEADERS must contain the SigNoz Cloud signoz-ingestion-key header');
}
if (!collectorId) throw new Error('MEND_X_COLLECTOR_ID or SCRAPER_STUDIO_COLLECTOR_ID is required for exact collector correlation');

const telemetry = createTelemetry({ serviceName: process.env.OTEL_SERVICE_NAME ?? 'mend-g3-verification' });
try {
  const correlation = await emitG3VerificationRun({ telemetry, collectorId });
  await telemetry.flush();
  const proof = {
    schemaVersion: 'mend-g3-emission/v1', generatedAt: new Date().toISOString(),
    service: telemetry.serviceName, status: 'EXPORT_COMPLETED', correlation,
    note: 'Export completion is emission evidence only; run signoz:mcp:smoke for exact-run cloud readback.',
  };
  const proofPath = resolve(process.env.SIGNOZ_EMISSION_PROOF_PATH ?? 'artifacts/signoz/g3-emission.json');
  mkdirSync(dirname(proofPath), { recursive: true });
  writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...proof, proofPath }, null, 2));
} finally {
  await telemetry.shutdown();
}
