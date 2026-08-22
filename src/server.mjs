import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from '../scripts/env.mjs';
import { createTelemetry } from './telemetry.mjs';
import { runPipeline } from './pipeline.mjs';
import { normalizeWebRecords } from './records.mjs';

const fallbackFixture = [{ title: 'Product-neutral smoke record', url: 'https://example.com/smoke', fixture: true }];
loadLocalEnv();

async function defaultRecords() {
  try {
    const artifactUrl = new URL('../artifacts/brightdata/latest.json', import.meta.url);
    return normalizeWebRecords(JSON.parse(await readFile(artifactUrl, 'utf8')));
  } catch {
    return normalizeWebRecords(fallbackFixture);
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createApp({ telemetry = createTelemetry() } = {}) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const requestSpan = telemetry.startSpan(`api.${request.method.toLowerCase()} ${url.pathname}`, {
      'http.request.method': request.method, 'url.path': url.pathname,
    });
    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, { ok: true, service: telemetry.serviceName });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/runs') {
        const body = await readJson(request);
        const mode = body.mode ?? 'normal';
        if (!['normal', 'fail', 'recover'].includes(mode)) throw new Error('mode must be normal, fail, or recover');
        const records = body.records ? normalizeWebRecords(body.records) : await defaultRecords();
        const runId = body.runId ?? randomUUID();
        requestSpan.setAttribute('run.id', runId);
        const result = await runPipeline({ telemetry, records, mode, runId, parentSpan: requestSpan });
        sendJson(response, 200, result);
        return;
      }
      sendJson(response, 404, { error: 'not found' });
    } catch (error) {
      telemetry.failSpan(requestSpan, error);
      sendJson(response, error instanceof SyntaxError ? 400 : 500, { error: error.message });
    } finally {
      requestSpan.end();
    }
  });
  return { server, telemetry };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = createApp();
  const port = Number(process.env.PORT ?? 3000);
  app.server.listen(port, () => console.log(`zero-downtime fixture listening on http://localhost:${port}`));
  async function stop() {
    app.server.close(async () => { await app.telemetry.shutdown(); process.exit(0); });
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
