import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from '../scripts/env.mjs';
import { createTelemetry } from './telemetry.mjs';
import { runPipeline } from './pipeline.mjs';
import { normalizeWebRecords } from './records.mjs';
import { createDemoAxisRunners } from './mend/demo.mjs';
import { createMeridianAxisRunners } from './mend/meridian-runners.mjs';
import { runRepairLoop } from './mend/repair-loop.mjs';
import { createScraperRegistry } from './mend/scraper-registry.mjs';
import { healthySnapshot, runVerticalSlice } from './mend/vertical-slice.mjs';
import { renderRepairView, renderTargetView } from './mend/ui.mjs';

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
  let latestMendRun = null;
  let previousHealthy = {};
  let latestRepairLoop = null;
  // One registry per process, so a heal deployed through /mend/repair is the config the
  // next Meridian scrape actually uses. A per-request registry would make every repair
  // evaporate the moment it was approved.
  const registry = createScraperRegistry();
  let meridianRunners = null;
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
      if (request.method === 'GET' && url.pathname === '/mend/target') {
        if (!latestMendRun) {
          sendJson(response, 404, { error: 'run the Mend vertical slice first' });
          return;
        }
        sendJson(response, 200, latestMendRun);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/mend') {
        if (!latestMendRun) {
          sendJson(response, 404, { error: 'POST /mend/runs before opening the target view' });
          return;
        }
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(renderTargetView(latestMendRun));
        return;
      }
      if (request.method === 'POST' && url.pathname === '/mend/runs') {
        const body = await readJson(request);
        const mode = body.mode ?? 'normal';
        if (!['normal', 'break-x', 'repaired'].includes(mode)) throw new Error('mode must be normal, break-x, or repaired');
        const runId = body.runId ?? randomUUID();
        const factoryVersion = body.factoryVersion ?? (mode === 'repaired' ? 'v2' : 'v1');
        requestSpan.setAttribute('run.id', runId);
        requestSpan.setAttribute('factory.version', factoryVersion);
        const source = body.source ?? 'fixtures';
        if (!['fixtures', 'meridian'].includes(source)) throw new Error('source must be fixtures or meridian');
        if (source === 'meridian') meridianRunners ??= await createMeridianAxisRunners({ registry });
        latestMendRun = await runVerticalSlice({
          axisRunners: source === 'meridian' ? meridianRunners : await createDemoAxisRunners(),
          mode,
          previousHealthy,
          factoryVersion,
          runId,
          telemetry,
          parentSpan: requestSpan,
        });
        if (latestMendRun.status === 'HEALTHY') previousHealthy = healthySnapshot(latestMendRun);
        sendJson(response, 200, latestMendRun);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/mend/repair') {
        const body = await readJson(request);
        // Detect -> ChangeRequest -> derive -> two gates -> approve -> deploy -> re-scrape.
        // `approve: false` exercises the interlock: the repair is derived and turned down.
        latestRepairLoop = await runRepairLoop({
          registry,
          origin: body.origin ?? process.env.MEND_MERIDIAN_URL ?? null,
          healthyVersion: body.healthyVersion ?? 'v4',
          brokenVersion: body.brokenVersion ?? 'v2',
          approve: body.approve !== false,
          reviewer: body.reviewer ?? 'human-reviewer',
          telemetry,
        });
        requestSpan.setAttribute('mend.repair.status', latestRepairLoop.status);
        sendJson(response, 200, {
          status: latestRepairLoop.status,
          publish: latestRepairLoop.publish,
          steps: latestRepairLoop.steps,
          changeRequest: latestRepairLoop.changeRequest,
          softwareChange: latestRepairLoop.softwareChange,
          scraper: latestRepairLoop.registry.toJSON(),
        });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/mend/repair') {
        if (!latestRepairLoop) {
          sendJson(response, 404, { error: 'POST /mend/repair before opening the repair view' });
          return;
        }
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(renderRepairView(latestRepairLoop));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/mend/scraper') {
        sendJson(response, 200, registry.toJSON());
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
