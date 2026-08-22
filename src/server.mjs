import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from '../scripts/env.mjs';
import { createTelemetry } from './telemetry.mjs';
import { runPipeline } from './pipeline.mjs';
import { normalizeWebRecords } from './records.mjs';
import { analyzeTarget, cacheAnalysis, resolveStructurePath } from './axes/y/analyze.mjs';
import { createDemoAxisRunners } from './mend/demo.mjs';
import { completeDiligenceTask, createDiligenceWorkflow, recordDiligenceDecision } from './mend/diligence.mjs';
import { healthySnapshot, runVerticalSlice } from './mend/vertical-slice.mjs';
import { renderTargetView } from './mend/ui.mjs';
import { discoverDiseaseCorpus } from './mend/discovery/corpus.mjs';
import { runSelectedTargetDiligence } from './mend/discovery/handoff.mjs';
import { discoverTargets } from './mend/discovery/targets.mjs';
import { renderDiscoveryView } from './mend/discovery/ui.mjs';

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

function emptyDiscoveryState() {
  return {
    status: 'NOT_STARTED',
    disease: '',
    corpus: { status: 'EMPTY', resources: [] },
    candidates: [],
    selection: { selected_candidate_ids: [] },
    handoff: { status: 'WAITING_FOR_SELECTION', axes: { X: 'WAITING', Y: 'WAITING', Z: 'WAITING' }, results: [] },
  };
}

export function createApp({
  telemetry = createTelemetry(),
  corpusDiscovery = discoverDiseaseCorpus,
  candidateDiscovery = discoverTargets,
  targetDiligence = runSelectedTargetDiligence,
  targetAnalyze = analyzeTarget,
  fetchImpl,
  prankImpl,
} = {}) {
  let latestMendRun = null;
  let latestDiligenceWorkflow = null;
  let previousHealthy = {};
  let discoveryState = emptyDiscoveryState();
  const analysisCache = new Map();
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
      if (request.method === 'POST' && url.pathname === '/target/analyze') {
        const body = await readJson(request);
        const target = body.target;
        const uniprot_id = body.uniprot_id;
        const disease = body.disease;
        const analyzeSpan = telemetry.startSpan('target.structure.analyze', {
          'target.name': target ?? '',
          'uniprot.id': uniprot_id ?? '',
        }, requestSpan);
        try {
          const result = await targetAnalyze({ target, uniprot_id, disease, fetchImpl, prankImpl, cache: analysisCache });
          analyzeSpan.setAttribute('structure.pdb_id', result.structure?.pdb_id ?? '');
          analyzeSpan.setAttribute('structure.source', result.structure?.source ?? '');
          cacheAnalysis(analysisCache, result);
          sendJson(response, 200, result);
        } catch (error) {
          telemetry.failSpan(analyzeSpan, error);
          throw error;
        } finally {
          analyzeSpan.end();
        }
        return;
      }
      const structureFileMatch = url.pathname.match(/^\/target\/([^/]+)\/structure$/);
      if (request.method === 'GET' && structureFileMatch) {
        const id = decodeURIComponent(structureFileMatch[1]);
        const cached = analysisCache.get(id) ?? analysisCache.get(id.toUpperCase());
        const pdbId = cached?.structure?.pdb_id ?? id;
        try {
          const pdb = await readFile(resolveStructurePath(pdbId));
          response.writeHead(200, { 'content-type': 'chemical/x-pdb' });
          response.end(pdb);
        } catch {
          sendJson(response, 404, { error: 'not found' });
        }
        return;
      }
      const analysisMatch = url.pathname.match(/^\/target\/([^/]+)\/analysis$/);
      if (request.method === 'GET' && analysisMatch) {
        const id = decodeURIComponent(analysisMatch[1]);
        const cached = analysisCache.get(id) ?? analysisCache.get(id.toUpperCase());
        if (!cached) {
          sendJson(response, 404, { error: 'not found' });
          return;
        }
        sendJson(response, 200, cached);
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
      if (request.method === 'GET' && url.pathname === '/mend/diligence') {
        if (!latestDiligenceWorkflow) {
          sendJson(response, 404, { error: 'create a diligence workflow first' });
          return;
        }
        sendJson(response, 200, latestDiligenceWorkflow);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/mend/discovery') {
        sendJson(response, 200, discoveryState);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/mend/discovery/start') {
        const body = await readJson(request);
        const disease = String(body.disease ?? '').trim();
        if (!disease) throw new Error('disease is required');
        const corpus = await corpusDiscovery({ disease, maxPapers: body.maxPapers ?? 50, includeAnnotations: true });
        const papers = corpus.papers.map((paper) => ({
          ...paper,
          id: paper.id ?? paper.publicationIdentifiers?.pmid ?? paper.publicationIdentifiers?.doi,
          source_url: paper.source_url ?? paper.sourceUrl,
        }));
        const candidates = candidateDiscovery(papers, {
          maxCandidates: body.maxCandidates ?? 25,
          candidateLexicon: corpus.candidateLexicon ?? [],
          inferSymbols: (corpus.candidateLexicon ?? []).length === 0,
        });
        discoveryState = {
          status: candidates.length ? 'REVIEW_REQUIRED' : 'NO_CANDIDATES',
          disease: corpus.disease,
          corpus: {
            status: papers.length ? 'READY' : 'EMPTY',
            resource_count: papers.length,
            total_hits: corpus.source?.hitCount ?? null,
            provider: corpus.source?.provider,
            request_url: corpus.source?.requestUrl,
            resources: papers.map((paper) => ({ ...paper, type: 'paper', status: 'COLLECTED' })),
          },
          candidates,
          selection: { selected_candidate_ids: [] },
          handoff: { status: 'WAITING_FOR_SELECTION', axes: { X: 'WAITING', Y: 'WAITING', Z: 'WAITING' }, results: [] },
        };
        latestMendRun = null;
        latestDiligenceWorkflow = null;
        requestSpan.setAttribute('discovery.disease', disease);
        requestSpan.setAttribute('discovery.papers', papers.length);
        requestSpan.setAttribute('discovery.candidates', candidates.length);
        telemetry.log('INFO', 'Disease research completed', {
          disease, 'paper.count': papers.length, 'candidate.count': candidates.length,
        }, requestSpan);
        sendJson(response, 201, discoveryState);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/mend/discovery/select') {
        const body = await readJson(request);
        const candidateIds = [...new Set((body.candidateIds ?? []).map(String))];
        if (!candidateIds.length) throw new Error('at least one candidateId is required');
        const known = new Set(discoveryState.candidates.map((candidate) => candidate.candidate_id));
        const unknown = candidateIds.filter((id) => !known.has(id));
        if (unknown.length) throw new Error(`unknown candidate ${unknown.join(', ')}`);
        discoveryState = {
          ...discoveryState,
          status: 'CANDIDATES_SELECTED',
          selection: { selected_candidate_ids: candidateIds, selected_at: new Date().toISOString() },
          handoff: { ...discoveryState.handoff, status: 'READY' },
        };
        telemetry.log('INFO', 'Discovery candidates selected', {
          disease: discoveryState.disease, 'candidate.ids': candidateIds.join(','),
        }, requestSpan);
        sendJson(response, 200, discoveryState);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/mend/discovery/handoff') {
        const body = await readJson(request);
        const candidateIds = [...new Set((body.candidateIds?.length ? body.candidateIds : discoveryState.selection.selected_candidate_ids).map(String))];
        if (!candidateIds.length) throw new Error('select at least one candidate before X/Y/Z handoff');
        const candidates = candidateIds.map((id) => discoveryState.candidates.find((candidate) => candidate.candidate_id === id));
        if (candidates.some((candidate) => !candidate)) throw new Error('handoff contains an unknown candidate');
        const results = await Promise.all(candidates.map((candidate) => targetDiligence({
          disease: discoveryState.disease,
          target: candidate.name,
          runId: `discovery-${candidate.candidate_id}-${randomUUID().slice(0, 8)}`,
          telemetry,
          parentSpan: requestSpan,
        })));
        latestMendRun = results[0] ?? null;
        latestDiligenceWorkflow = null;
        const axes = Object.fromEntries(['X', 'Y', 'Z'].map((axis) => [axis, {
          status: results.every((result) => result.axes?.[axis]?.status === 'HEALTHY') ? 'COMPLETE' : 'NEEDS_REVIEW',
        }]));
        discoveryState = {
          ...discoveryState,
          status: 'DILIGENCE_COMPLETE',
          selection: { selected_candidate_ids: candidateIds, selected_at: discoveryState.selection.selected_at ?? new Date().toISOString() },
          handoff: {
            status: results.every((result) => result.status === 'HEALTHY') ? 'COMPLETE' : 'DEGRADED',
            axes,
            results: candidates.map((candidate, index) => ({ candidate_id: candidate.candidate_id, target: candidate.name, run: results[index] })),
          },
        };
        telemetry.log('INFO', 'Selected targets handed to X/Y/Z diligence', {
          disease: discoveryState.disease, 'candidate.ids': candidateIds.join(','), 'handoff.status': discoveryState.handoff.status,
        }, requestSpan);
        sendJson(response, 200, discoveryState);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/mend/diligence') {
        if (!latestMendRun) {
          sendJson(response, 409, { error: 'run the Mend vertical slice before creating diligence work' });
          return;
        }
        latestDiligenceWorkflow = createDiligenceWorkflow(latestMendRun);
        requestSpan.setAttribute('workflow.id', latestDiligenceWorkflow.id);
        requestSpan.setAttribute('run.id', latestDiligenceWorkflow.runId);
        telemetry.log('INFO', 'Diligence workflow created', {
          'workflow.id': latestDiligenceWorkflow.id,
          'run.id': latestDiligenceWorkflow.runId,
          'workflow.status': latestDiligenceWorkflow.status,
          recommendation: latestDiligenceWorkflow.recommendation.code,
        }, requestSpan);
        sendJson(response, 201, latestDiligenceWorkflow);
        return;
      }
      const diligenceTaskMatch = url.pathname.match(/^\/mend\/diligence\/tasks\/([^/]+)\/complete$/);
      if (request.method === 'POST' && diligenceTaskMatch) {
        if (!latestDiligenceWorkflow) {
          sendJson(response, 409, { error: 'create a diligence workflow first' });
          return;
        }
        const body = await readJson(request);
        latestDiligenceWorkflow = completeDiligenceTask(latestDiligenceWorkflow, {
          taskId: decodeURIComponent(diligenceTaskMatch[1]),
          actor: body.actor,
          finding: body.finding,
        });
        requestSpan.setAttribute('workflow.id', latestDiligenceWorkflow.id);
        requestSpan.setAttribute('diligence.task.id', decodeURIComponent(diligenceTaskMatch[1]));
        telemetry.log('INFO', 'Diligence task completed', {
          'workflow.id': latestDiligenceWorkflow.id,
          'run.id': latestDiligenceWorkflow.runId,
          'diligence.task.id': decodeURIComponent(diligenceTaskMatch[1]),
          'workflow.status': latestDiligenceWorkflow.status,
          actor: body.actor,
        }, requestSpan);
        sendJson(response, 200, latestDiligenceWorkflow);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/mend/diligence/decision') {
        if (!latestDiligenceWorkflow) {
          sendJson(response, 409, { error: 'create a diligence workflow first' });
          return;
        }
        const body = await readJson(request);
        latestDiligenceWorkflow = recordDiligenceDecision(latestDiligenceWorkflow, body);
        requestSpan.setAttribute('workflow.id', latestDiligenceWorkflow.id);
        requestSpan.setAttribute('diligence.decision', latestDiligenceWorkflow.decision.decision);
        telemetry.log('INFO', 'Diligence decision recorded', {
          'workflow.id': latestDiligenceWorkflow.id,
          'run.id': latestDiligenceWorkflow.runId,
          'workflow.status': latestDiligenceWorkflow.status,
          decision: latestDiligenceWorkflow.decision.decision,
          actor: latestDiligenceWorkflow.decision.actor,
        }, requestSpan);
        sendJson(response, 200, latestDiligenceWorkflow);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/mend') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(discoveryState.status !== 'NOT_STARTED' || !latestMendRun
          ? renderDiscoveryView(discoveryState)
          : renderTargetView(latestMendRun, latestDiligenceWorkflow));
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
        latestMendRun = await runVerticalSlice({
          axisRunners: await createDemoAxisRunners(),
          mode,
          previousHealthy,
          factoryVersion,
          runId,
          telemetry,
          parentSpan: requestSpan,
        });
        latestDiligenceWorkflow = null;
        if (latestMendRun.status === 'HEALTHY') previousHealthy = healthySnapshot(latestMendRun);
        sendJson(response, 200, latestMendRun);
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
      const clientError = error instanceof SyntaxError
        || /required|unknown diligence task|already complete|must be|not actionable|healthy published/.test(error.message);
      sendJson(response, clientError ? 400 : 500, { error: error.message });
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
