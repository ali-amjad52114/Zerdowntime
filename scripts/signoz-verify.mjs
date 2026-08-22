import { loadLocalEnv } from './env.mjs';
import { sanitizeUrl } from './signoz-verification-lib.mjs';

loadLocalEnv('.env.local', { override: true });

async function check(name, url, accepted) {
  try {
    const response = await fetch(url);
    if (!accepted.includes(response.status)) throw new Error(`HTTP ${response.status}`);
    return { name, status: 'PASS', url: sanitizeUrl(url), httpStatus: response.status };
  } catch (error) {
    return { name, status: 'FAIL', url: sanitizeUrl(url), error: error.message };
  }
}

const checks = await Promise.all([
  check('SigNoz UI transport', process.env.SIGNOZ_URL ?? 'http://localhost:8080', [200, 302]),
  check('OTLP HTTP transport', process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318', [404, 405]),
]);
const ok = checks.every((item) => item.status === 'PASS');
if (!ok) process.exitCode = 1;
console.log(JSON.stringify({
  schemaVersion: 'signoz-transport-check/v1',
  ok,
  checks,
  proof: {
    transportReachability: ok ? 'PASS' : 'FAIL',
    telemetryEmission: 'NOT_RUN',
    telemetryReadback: 'NOT_RUN',
  },
  next: ok
    ? ['npm run telemetry:smoke', 'Set SIGNOZ_VERIFY_RUN_ID from smoke output, then run npm run signoz:mcp:smoke']
    : ['Fix failed transport checks before attempting emission.'],
}, null, 2));
