async function check(name, url, accepted) {
  try {
    const response = await fetch(url);
    if (!accepted.includes(response.status)) throw new Error(`HTTP ${response.status}`);
    console.log(`ok - ${name}: ${url} (HTTP ${response.status})`);
  } catch (error) {
    console.error(`not ok - ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

await check('SigNoz UI', process.env.SIGNOZ_URL ?? 'http://localhost:8080', [200, 302]);
await check('OTLP HTTP receiver', process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318', [404, 405]);
if (!process.exitCode) console.log('SigNoz UI and OTLP receiver are reachable. Run npm run telemetry:smoke next.');
