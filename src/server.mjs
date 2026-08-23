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
import { retrySelectedTargetAxis, runSelectedTargetDiligence } from './mend/discovery/handoff.mjs';
import { discoverTargets } from './mend/discovery/targets.mjs';
import { renderDiscoveryView } from './mend/discovery/ui.mjs';
import { createFileStateStore } from './mend/state-store.mjs';
import { retrieveKnownTargetCompounds } from './mend/compounds.mjs';
import { executePortAction, portEntity } from './mend/port-control.mjs';
import { configuredBrightDataAcquirer } from './acquisition/brightdata-cli.mjs';

const fallbackFixture = [{ title: 'Product-neutral smoke record', url: 'https://example.com/smoke', fixture: true }];
const REQUIRED_HANDOFF_AXES = Object.freeze(['X', 'Y', 'Z']);
loadLocalEnv();

function requestedHandoffAxes(value) {
  if (value == null) return [...REQUIRED_HANDOFF_AXES];
  if (!Array.isArray(value)) throw new Error('handoff axes must be the complete X/Y/Z set');
  const axes = value.map((axis) => String(axis).trim().toUpperCase());
  const unique = new Set(axes);
  if (axes.length !== REQUIRED_HANDOFF_AXES.length
    || unique.size !== REQUIRED_HANDOFF_AXES.length
    || REQUIRED_HANDOFF_AXES.some((axis) => !unique.has(axis))) {
    throw new Error('handoff axes must be the complete X/Y/Z set');
  }
  return [...REQUIRED_HANDOFF_AXES];
}

function canonicalUniProtId(run) {
  const value = run?.uniprot_id ?? run?.axes?.Y?.summary?.uniprot_id;
  return String(value ?? '').trim().toUpperCase() || null;
}

function bindTargetRun(run, { disease, diseaseRunId, candidate, runId } = {}) {
  return {
    ...run,
    runId: run?.runId ?? runId,
    disease_run_id: run?.disease_run_id ?? diseaseRunId,
    candidate_id: run?.candidate_id ?? candidate?.candidate_id,
    disease: run?.disease ?? disease,
    target: candidate?.name ?? run?.target,
    uniprot_id: canonicalUniProtId(run) ?? (String(candidate?.uniprot_id ?? '').trim().toUpperCase() || null),
  };
}

function canonicalTargetRequest(body, boundRun) {
  const target = String(boundRun?.target ?? '').trim();
  const disease = String(boundRun?.disease ?? '').trim();
  const uniprotId = canonicalUniProtId(boundRun);
  if (!target || !disease || !uniprotId) throw new Error('target_run_id is missing canonical target, disease, or UniProt identity');
  if (body.target != null && String(body.target).trim().toUpperCase() !== target.toUpperCase()) {
    throw new Error('target does not match target_run_id');
  }
  if (body.disease != null && String(body.disease).trim().toUpperCase() !== disease.toUpperCase()) {
    throw new Error('disease does not match target_run_id');
  }
  if (body.uniprot_id != null && String(body.uniprot_id).trim().toUpperCase() !== uniprotId) {
    throw new Error('uniprot_id does not match target_run_id');
  }
  return { target, disease, uniprot_id: uniprotId };
}

function failedTargetRun({ runId, diseaseRunId, disease, candidate, error }) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    runId,
    factoryVersion: 'discovery-v1',
    mode: 'normal',
    status: 'FAILED',
    publishStatus: 'BLOCKED',
    failedAxes: [...REQUIRED_HANDOFF_AXES],
    disease_run_id: diseaseRunId,
    candidate_id: candidate.candidate_id,
    disease,
    target: candidate.name,
    uniprot_id: String(candidate.uniprot_id ?? '').trim().toUpperCase() || null,
    error: message,
    axes: Object.fromEntries(REQUIRED_HANDOFF_AXES.map((axis) => [axis, {
      axis,
      status: 'FAILED',
      records: [],
      summary: {},
      validation: { status: 'FAIL', reason: `target execution failed: ${message}` },
    }])),
  };
}

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
  targetAxisRetry = retrySelectedTargetAxis,
  targetAnalyze = analyzeTarget,
  compoundDiscovery = retrieveKnownTargetCompounds,
  fetchImpl,
  prankImpl,
  stateStore,
  portActionToken = process.env.MEND_PORT_ACTION_TOKEN,
  brightDataAcquire = configuredBrightDataAcquirer(),
} = {}) {
  const restored = stateStore?.load?.() ?? {};
  let latestMendRun = restored.latestMendRun ?? null;
  let latestDiligenceWorkflow = restored.latestDiligenceWorkflow ?? null;
  let previousHealthy = restored.previousHealthy ?? {};
  let discoveryState = restored.discoveryState ?? emptyDiscoveryState();
  const targetRuns = new Map(Object.entries(restored.targetRuns ?? {}));
  const diligenceWorkflows = new Map(Object.entries(restored.diligenceWorkflows ?? {}));
  const analysisCache = new Map();
  for (const analysis of restored.analyses ?? []) {
    if (analysis?.target_run_id) analysisCache.set(analysis.target_run_id, analysis);
    else cacheAnalysis(analysisCache, analysis);
  }
  const compoundCache = new Map(Object.entries(restored.compoundAnalyses ?? {}));
  const portExecutions = new Map(Object.entries(restored.portExecutions ?? {}));
  const sourceHealingApprovals = new Map(Object.entries(restored.sourceHealingApprovals ?? {}));

  function persistState() {
    if (!stateStore?.save) return;
    const analyses = [...new Set(analysisCache.values())];
    stateStore.save({
      latestMendRun,
      latestDiligenceWorkflow,
      previousHealthy,
      discoveryState,
      targetRuns: Object.fromEntries(targetRuns),
      diligenceWorkflows: Object.fromEntries(diligenceWorkflows),
      analyses,
      compoundAnalyses: Object.fromEntries(compoundCache),
      portExecutions: Object.fromEntries(portExecutions),
      sourceHealingApprovals: Object.fromEntries(sourceHealingApprovals),
    });
  }

  function axisSourceExecutionId(outcome = {}) {
    return outcome.source_execution_id
      ?? outcome.summary?.source_execution_id
      ?? outcome.summary?.brightdata_source_execution_id
      ?? outcome.sub_axes?.company_pipeline?.source_execution?.execution_id
      ?? null;
  }

  function initializeHealingRequest(run, axis, attempt = 0) {
    const outcome = run.axes?.[axis];
    const sourceExecutionId = axisSourceExecutionId(outcome);
    if (outcome?.validation?.status !== 'FAIL' || !sourceExecutionId) return run;
    const existing = run.healing_requests?.[axis];
    if (existing?.source_execution_id === sourceExecutionId && existing?.status === 'pending') return run;
    return {
      ...run,
      healing_requests: {
        ...(run.healing_requests ?? {}),
        [axis]: {
          id: `${run.runId}:${axis}:healing:${attempt}`,
          axis,
          source_execution_id: sourceExecutionId,
          status: 'pending',
          requested_at: new Date().toISOString(),
        },
      },
    };
  }

  function portAxisEntity(run, axis, retryCount = Number(run.retry_counts?.[axis] ?? 0)) {
    const outcome = run.axes?.[axis] ?? {};
    const provider = axis === 'X' ? 'ClinicalTrials.gov' : axis === 'Y' ? 'RCSB PDB' : 'EPO Linked Open Data';
    const healingRequest = run.healing_requests?.[axis];
    const retryHistory = run.retry_history?.[axis] ?? [];
    const status = healingRequest?.status === 'pending'
      ? 'healing_pending'
      : healingRequest?.status === 'approved'
        ? 'retry_pending'
        : outcome.validation?.status === 'PASS' ? 'succeeded' : 'failed';
    return portEntity('mendAxisRun', `${run.runId}:${axis}`, {
      axis,
      status,
      provider,
      ...(axisSourceExecutionId(outcome) ? { source_execution_id: axisSourceExecutionId(outcome) } : {}),
      ...(healingRequest?.id ? { healing_request_id: healingRequest.id } : {}),
      retry_count: retryCount,
      max_retries: 2,
      retry_history: retryHistory,
      ...(retryHistory.at(-1)?.port_run_id ? { last_retry_port_run_id: retryHistory.at(-1).port_run_id } : {}),
      record_count: outcome.records?.length ?? 0,
      validation_status: String(outcome.validation?.status ?? 'pending').toLowerCase(),
      ...(outcome.validation?.reason ? { failure_message: outcome.validation.reason } : {}),
      updated_at: new Date().toISOString(),
      contract_version: 'mend.port-control/v1',
    }, { target_run: run.runId }, `${run.target} ${axis}`);
  }

  function portTargetEntity(run, requestedAxes = ['X', 'Y', 'Z'], statusOverride) {
    const now = new Date().toISOString();
    return portEntity('mendTargetRun', run.runId, {
      target_name: run.target,
      canonical_symbol: run.target,
      ...(run.axes?.Y?.summary?.uniprot_id ? { uniprot_id: run.axes.Y.summary.uniprot_id } : {}),
      status: statusOverride ?? (run.status === 'HEALTHY' ? 'review' : run.status === 'DEGRADED' ? 'partial_failure' : 'failed'),
      requested_axes: requestedAxes,
      created_at: run.created_at ?? now,
      updated_at: now,
      correlation_id: run.runId,
      contract_version: 'mend.port-control/v1',
    }, { disease_run: run.disease_run_id, candidate: run.candidate_id }, run.target);
  }

  function candidateEvidenceIds(candidate) {
    const passages = [...(candidate.supporting_passages ?? []), ...(candidate.contradictory_passages ?? []), ...(candidate.evidence ?? [])];
    return [...new Set(passages.map((item) => item.evidence_id ?? item.passage_id ?? item.paper_id ?? item.source_id ?? item.source_url).filter(Boolean).map(String))];
  }

  function portCandidateEntity(candidate, actor, selectionReason) {
    const evidenceIds = candidateEvidenceIds(candidate);
    const supportingCount = candidate.evidence?.filter((item) => item.classification === 'SUPPORTING').length
      ?? candidate.supporting_passages?.length ?? 0;
    const contradictoryCount = candidate.evidence?.filter((item) => item.classification === 'CONTRADICTORY').length
      ?? candidate.contradictory_passages?.length ?? 0;
    return portEntity('mendCandidateTarget', candidate.candidate_id, {
      display_name: candidate.name,
      ...(candidate.canonical_symbol ? { canonical_symbol: candidate.canonical_symbol } : {}),
      ...(candidate.uniprot_id ? { uniprot_id: candidate.uniprot_id } : {}),
      ranking_score: Number(candidate.score ?? candidate.ranking?.score ?? 0),
      supporting_evidence_count: Number(supportingCount),
      contradictory_evidence_count: Number(contradictoryCount),
      evidence_ids: evidenceIds,
      selection_status: 'handed_off',
      selected_by: actor,
      selected_at: new Date().toISOString(),
      contract_version: 'mend.port-control/v1',
    }, { disease_run: discoveryState.run_id }, candidate.name);
  }

  function portDiseaseEntity(status) {
    const resources = discoveryState.corpus?.resources ?? [];
    const sourceExecutionIds = [...new Set([
      ...(discoveryState.corpus?.source_execution_ids ?? []),
      ...resources.map((resource) => resource.source_execution_id).filter(Boolean),
    ].map(String))];
    const createdAt = discoveryState.created_at ?? new Date().toISOString();
    return portEntity('mendDiseaseRun', discoveryState.run_id, {
      disease: discoveryState.disease,
      status,
      corpus_document_count: resources.length,
      candidate_count: discoveryState.candidates.length,
      source_execution_ids: sourceExecutionIds,
      created_at: createdAt,
      updated_at: new Date().toISOString(),
      contract_version: 'mend.port-control/v1',
    }, { project: 'zero-downtime-factory' }, discoveryState.disease);
  }

  function taskEvidenceIds(task) {
    return [...new Set((task.evidence ?? []).map((item) => item.evidence_id ?? item.id ?? item.source_url).filter(Boolean).map(String))];
  }

  function portTaskEntity(runId, task) {
    const taskTypes = { X: 'competitive_program', Y: 'structural_opportunity', Z: 'patent_triage' };
    return portEntity('mendDiligenceTask', `${runId}:${task.id}`, {
      task_type: taskTypes[task.axis] ?? 'contradiction_review',
      title: task.title,
      status: task.status === 'COMPLETE' ? 'completed' : 'open',
      evidence_ids: taskEvidenceIds(task),
      ...(task.completion?.finding ? { finding: task.completion.finding } : {}),
      ...(task.completion?.outcome ? { outcome: task.completion.outcome } : {}),
      ...(task.completion?.actor ? { completed_by: task.completion.actor } : {}),
      ...(task.completion?.completedAt ? { completed_at: task.completion.completedAt } : {}),
      contract_version: 'mend.port-control/v1',
    }, { target_run: runId }, task.title);
  }

  function ensureDiligenceWorkflow(run) {
    let workflow = diligenceWorkflows.get(run.runId);
    if (!workflow && run.status === 'HEALTHY' && run.publishStatus === 'PUBLISHED') {
      workflow = createDiligenceWorkflow(run);
      diligenceWorkflows.set(run.runId, workflow);
      latestDiligenceWorkflow = workflow;
    }
    return workflow;
  }
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const requestSpan = telemetry.startSpan(`api.${request.method.toLowerCase()} ${url.pathname}`, {
      'http.request.method': request.method, 'url.path': url.pathname,
    });
    try {
      if (request.method === 'POST' && url.pathname === '/api/port/actions') {
        if (!portActionToken) {
          sendJson(response, 503, { error: 'Port action adapter is not configured' });
          return;
        }
        if (request.headers.authorization !== `Bearer ${portActionToken}`) {
          sendJson(response, 401, { error: 'unauthorized' });
          return;
        }
        const envelope = await readJson(request);
        const idempotencyKey = String(request.headers['idempotency-key'] ?? '');
        const actionCorrelation = {
          ...(envelope.correlation ?? {}),
          runId: envelope.resource?.parent_id ?? envelope.resource?.id,
          portRunId: envelope.port_run_id,
          axis: envelope.input?.axis,
          sourceExecutionId: envelope.input?.source_execution_id,
          healingRequestId: envelope.input?.healing_request_id,
          diligenceTaskId: envelope.action === 'complete_diligence_task' ? envelope.resource?.id : undefined,
          diligenceDecisionId: envelope.action === 'record_target_decision' ? `decision-${envelope.resource?.id}` : undefined,
          sponsorRequestId: idempotencyKey,
          sourceProvider: 'port',
        };
        const portTelemetry = telemetry.bindCorrelation(actionCorrelation);
        const portActionSpan = portTelemetry.startSpan(`port.action.${envelope.action}`, {
          'port.action': envelope.action, 'sponsor.phase': 'request',
        }, requestSpan);
        portTelemetry.log('INFO', 'Port sponsor request accepted', {
          'port.action': envelope.action, 'sponsor.phase': 'request',
        }, portActionSpan);
        telemetry.metrics.sponsorRequests.add(1, portTelemetry.attributes({ operation: envelope.action, outcome: 'accepted' }));
        const actions = {
          handoff_candidate: async (action) => {
            const requestedAxes = requestedHandoffAxes(action.input.axes);
            if (action.resource.parent_id !== discoveryState.run_id) throw new Error('Port disease run does not match active Mend discovery');
            const candidate = discoveryState.candidates.find((item) => item.candidate_id === action.resource.id);
            if (!candidate) throw new Error('Port candidate is not part of the active evidence-derived candidate set');
            const existing = discoveryState.handoff.results.find((item) => item.candidate_id === candidate.candidate_id)?.run;
            if (existing) return { status: 'conflict', message: 'candidate already has a target run', port_entities: [portTargetEntity(existing)] };
            const run = await targetDiligence({
              disease: discoveryState.disease,
              target: candidate.name,
              runId: `discovery-${candidate.candidate_id}-${randomUUID().slice(0, 8)}`,
              diseaseRunId: discoveryState.run_id,
              candidateId: candidate.candidate_id,
              targetAliases: candidate.aliases ?? [],
              uniprotId: candidate.uniprot_id ?? null,
              pipelineAcquire: brightDataAcquire,
              telemetry,
              parentSpan: requestSpan,
            });
            let bound = bindTargetRun(run, {
              disease: discoveryState.disease,
              diseaseRunId: discoveryState.run_id,
              candidate,
            });
            for (const axis of requestedAxes) bound = initializeHealingRequest(bound, axis);
            targetRuns.set(bound.runId, bound);
            latestMendRun = bound;
            const workflow = ensureDiligenceWorkflow(bound);
            const selected = [...new Set([...(discoveryState.selection.selected_candidate_ids ?? []), candidate.candidate_id])];
            const results = [...discoveryState.handoff.results, { candidate_id: candidate.candidate_id, target: candidate.name, run: bound }];
            discoveryState = {
              ...discoveryState,
              status: 'DILIGENCE_COMPLETE',
              selection: { selected_candidate_ids: selected, selected_at: discoveryState.selection.selected_at ?? new Date().toISOString(), actor: action.actor, source: 'port' },
              handoff: {
                status: results.every((item) => item.run.status === 'HEALTHY') ? 'COMPLETE' : 'DEGRADED',
                axes: Object.fromEntries(['X', 'Y', 'Z'].map((axis) => [axis, { status: results.every((item) => item.run.axes?.[axis]?.status === 'HEALTHY') ? 'COMPLETE' : 'NEEDS_REVIEW' }])),
                results,
              },
            };
            persistState();
            const diseaseStatus = bound.status === 'HEALTHY' ? 'handed_off' : 'partial_failure';
            return { port_entities: [
              portDiseaseEntity(diseaseStatus),
              portCandidateEntity(candidate, action.actor, action.input.selection_reason),
              portTargetEntity(bound, requestedAxes),
              ...requestedAxes.map((axis) => portAxisEntity(bound, axis)),
              ...(workflow?.tasks ?? []).map((task) => portTaskEntity(bound.runId, task)),
            ] };
          },
          retry_axis: async (action) => {
            const run = targetRuns.get(action.resource.parent_id);
            if (!run) throw new Error('unknown target run for Port axis retry');
            const axis = action.input.axis;
            if (action.resource.id !== `${run.runId}:${axis}`) throw new Error('Port axis resource does not match its target run and explicit axis');
            const current = run.axes?.[axis];
            if (current?.validation?.status !== 'FAIL') throw new Error('only a failed axis can be retried');
            const healingRequest = run.healing_requests?.[axis];
            if (healingRequest?.status === 'pending') throw new Error('pending source healing requires Port approval before retry');
            const currentPortStatus = healingRequest?.status === 'approved' ? 'retry_pending' : 'failed';
            if (action.input.expected_status !== currentPortStatus) throw new Error('axis retry status changed');
            const retryCount = Number(run.retry_counts?.[axis] ?? 0);
            if (retryCount !== action.input.expected_retry_count) throw new Error('axis retry count changed');
            if (retryCount >= 2) throw new Error('axis retry budget exhausted');
            let retried = await targetAxisRetry({
              axis, existingRun: run, disease: run.disease ?? discoveryState.disease, target: run.target,
              fetchImpl, telemetry, parentSpan: requestSpan,
            });
            retried.retry_counts = { ...(run.retry_counts ?? {}), [axis]: retryCount + 1 };
            const retryEvent = {
              attempt: retryCount + 1,
              port_run_id: action.port_run_id,
              actor: action.actor,
              reason: action.input.reason,
              status: retried.axes?.[axis]?.validation?.status === 'PASS' ? 'succeeded' : 'failed',
              completed_at: new Date().toISOString(),
            };
            retried.retry_history = {
              ...(run.retry_history ?? {}),
              [axis]: [...(run.retry_history?.[axis] ?? []), retryEvent],
            };
            retried.healing_requests = { ...(run.healing_requests ?? {}) };
            if (retried.axes?.[axis]?.validation?.status === 'PASS') delete retried.healing_requests[axis];
            else retried = initializeHealingRequest(retried, axis, retryCount + 1);
            targetRuns.set(run.runId, retried);
            if (latestMendRun?.runId === run.runId) latestMendRun = retried;
            const workflow = ensureDiligenceWorkflow(retried);
            discoveryState = {
              ...discoveryState,
              handoff: { ...discoveryState.handoff, results: discoveryState.handoff.results.map((item) => item.run?.runId === run.runId ? { ...item, run: retried } : item) },
            };
            persistState();
            return { port_entities: [
              portTargetEntity(retried),
              portAxisEntity(retried, axis, retryCount + 1),
              ...(workflow?.tasks ?? []).map((task) => portTaskEntity(retried.runId, task)),
            ] };
          },
          approve_source_healing: async (action) => {
            const run = targetRuns.get(action.resource.parent_id);
            if (!run) throw new Error('unknown target run for Port source-healing approval');
            const axis = action.input.axis;
            if (action.resource.id !== `${run.runId}:${axis}`) throw new Error('Port axis resource does not match its target run and explicit axis');
            const request = run.healing_requests?.[axis];
            if (!request || request.status !== 'pending') throw new Error('axis does not have a pending source-healing request');
            if (request.id !== action.input.healing_request_id) throw new Error('source-healing request ID does not match the pending axis request');
            if (request.source_execution_id !== action.input.source_execution_id) throw new Error('source execution ID does not match the pending axis request');
            const approval = {
              axis,
              source_execution_id: action.input.source_execution_id,
              healing_request_id: action.input.healing_request_id,
              actor: action.actor,
              reason: action.input.reason,
              evidence_url: action.input.evidence_url,
              approved_at: new Date().toISOString(),
              port_run_id: action.port_run_id,
            };
            sourceHealingApprovals.set(action.input.healing_request_id, approval);
            run.healing_requests = {
              ...(run.healing_requests ?? {}),
              [axis]: { ...request, status: 'approved', approval },
            };
            targetRuns.set(run.runId, run);
            persistState();
            const entity = portAxisEntity(run, axis);
            entity.entity.properties.evidence_url = action.input.evidence_url;
            entity.entity.properties.updated_at = approval.approved_at;
            return { port_entities: [entity] };
          },
          complete_diligence_task: async (action) => {
            const workflow = diligenceWorkflows.get(action.resource.parent_id);
            if (!workflow) throw new Error('unknown target diligence workflow');
            const task = workflow.tasks.find((item) => `${workflow.runId}:${item.id}` === action.resource.id);
            if (!task) throw new Error('Port task does not belong to the target diligence workflow');
            if (task.status !== 'OPEN') throw new Error('only an open diligence task can be completed');
            const allowedEvidence = new Set(taskEvidenceIds(task));
            if (action.input.evidence_ids.some((id) => !allowedEvidence.has(id))) throw new Error('task completion references evidence outside the task');
            let updated = completeDiligenceTask(workflow, { taskId: task.id, actor: action.actor, finding: action.input.finding });
            updated = {
              ...updated,
              tasks: updated.tasks.map((item) => item.id === task.id
                ? { ...item, completion: { ...item.completion, outcome: action.input.outcome, evidence_ids: action.input.evidence_ids } }
                : item),
            };
            diligenceWorkflows.set(updated.runId, updated);
            latestDiligenceWorkflow = updated;
            const completedTask = updated.tasks.find((item) => item.id === task.id);
            persistState();
            return { port_entities: [portTaskEntity(updated.runId, completedTask), portTargetEntity(targetRuns.get(updated.runId))] };
          },
          record_target_decision: async (action) => {
            const workflow = diligenceWorkflows.get(action.resource.id);
            if (!workflow) throw new Error('unknown target diligence workflow');
            const run = targetRuns.get(action.resource.id);
            if (!run || run.disease_run_id !== action.resource.parent_id) throw new Error('target decision ownership does not match the disease run');
            const decisionMap = { proceed: 'PROCEED_TO_FOCUSED_DILIGENCE', hold: 'HOLD', escalate: 'ESCALATE' };
            let updated = recordDiligenceDecision(workflow, {
              decision: decisionMap[action.input.decision], actor: action.actor, rationale: action.input.rationale,
            });
            updated = { ...updated, decision: { ...updated.decision, evidence_ids: action.input.evidence_ids, open_risks: action.input.open_risks, port_run_id: action.port_run_id } };
            diligenceWorkflows.set(updated.runId, updated);
            latestDiligenceWorkflow = updated;
            persistState();
            return { port_entities: [portTargetEntity(run, ['X', 'Y', 'Z'], 'decided'), portEntity('mendTargetDecision', `decision-${updated.runId}`, {
              decision: action.input.decision, actor: action.actor,
              rationale: action.input.rationale, evidence_ids: action.input.evidence_ids, open_risks: action.input.open_risks,
              recorded_at: updated.decision.decidedAt, contract_version: 'mend.port-control/v1',
            }, { target_run: updated.runId }, `${run.target} decision`)] };
          },
        };
        try {
          const result = await executePortAction({ envelope, idempotencyKey, actions, executions: portExecutions });
          const resultCorrelation = telemetry.correlationAttributes({
            ...actionCorrelation,
            actionExecutionId: result.action_execution_id,
            sponsorResultId: result.action_execution_id,
          });
          for (const [key, value] of Object.entries(resultCorrelation)) portActionSpan.setAttribute(key, value);
          portActionSpan.setAttribute('sponsor.phase', 'result');
          portActionSpan.setAttribute('port.action.status', result.status);
          portTelemetry.log('INFO', 'Port sponsor result received', {
            ...resultCorrelation, 'port.action': envelope.action, 'port.action.status': result.status, 'sponsor.phase': 'result',
          }, portActionSpan);
          telemetry.metrics.sponsorResults.add(1, { ...resultCorrelation, operation: envelope.action, outcome: result.status });
          if (envelope.action === 'approve_source_healing') {
            telemetry.metrics.healing.add(1, { ...resultCorrelation, outcome: result.status });
          } else if (envelope.action === 'complete_diligence_task') {
            telemetry.metrics.diligenceTasks.add(1, { ...resultCorrelation, outcome: result.status });
          } else if (envelope.action === 'record_target_decision') {
            telemetry.metrics.diligenceDecisions.add(1, { ...resultCorrelation, outcome: result.status });
          }
          persistState();
          sendJson(response, result.status === 'conflict' ? 409 : 200, result);
        } catch (error) {
          telemetry.failSpan(portActionSpan, error);
          portTelemetry.log('ERROR', `Port sponsor request failed: ${error.message}`, {
            'port.action': envelope.action, 'sponsor.phase': 'result', outcome: 'failure',
          }, portActionSpan);
          sendJson(response, 409, { error: error.message });
        } finally {
          portActionSpan.end();
        }
        return;
      }
      if (request.method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, { ok: true, service: telemetry.serviceName });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/target/analyze') {
        const body = await readJson(request);
        const targetRunId = String(body.target_run_id ?? '');
        const boundRun = targetRunId ? targetRuns.get(targetRunId) : null;
        if (discoveryState.status !== 'NOT_STARTED' && !targetRunId) {
          throw new Error('target_run_id is required for disease-first target analysis');
        }
        if (targetRunId && !boundRun) throw new Error('unknown target_run_id');
        const canonical = boundRun
          ? canonicalTargetRequest(body, boundRun)
          : { target: body.target, uniprot_id: body.uniprot_id, disease: body.disease };
        const { target, uniprot_id, disease } = canonical;
        const analyzeSpan = telemetry.startSpan('target.structure.analyze', {
          'target.name': target ?? '',
          'uniprot.id': uniprot_id ?? '',
        }, requestSpan);
        try {
          const cachedForRun = targetRunId ? analysisCache.get(targetRunId) : null;
          const analyzed = cachedForRun ?? await targetAnalyze({
            target, uniprot_id, disease, fetchImpl, prankImpl,
            cache: targetRunId ? undefined : analysisCache,
          });
          const result = { ...analyzed, target_run_id: targetRunId || null };
          analyzeSpan.setAttribute('structure.pdb_id', result.structure?.pdb_id ?? '');
          analyzeSpan.setAttribute('structure.source', result.structure?.source ?? '');
          if (targetRunId) analysisCache.set(targetRunId, result);
          else cacheAnalysis(analysisCache, result);
          persistState();
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
        const requestedRun = url.searchParams.get('runId');
        const selectedRun = requestedRun ? targetRuns.get(requestedRun) : latestMendRun;
        if (!selectedRun) {
          sendJson(response, 404, { error: 'run the Mend vertical slice first' });
          return;
        }
        sendJson(response, 200, selectedRun);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/target/compounds') {
        const body = await readJson(request);
        const targetRunId = String(body.target_run_id ?? '');
        const boundRun = targetRunId ? targetRuns.get(targetRunId) : null;
        if (discoveryState.status !== 'NOT_STARTED' && !targetRunId) throw new Error('target_run_id is required for disease-first compound investigation');
        if (targetRunId && !boundRun) throw new Error('unknown target_run_id');
        const canonical = boundRun
          ? canonicalTargetRequest(body, boundRun)
          : { target: body.target, uniprot_id: body.uniprot_id, disease: body.disease };
        const compoundSpan = telemetry.startSpan('target.compounds.investigate', {
          'target.name': String(canonical.target ?? ''),
          'uniprot.id': String(canonical.uniprot_id ?? ''),
          'source.provider': 'ChEMBL',
        }, requestSpan);
        try {
          const discovered = await compoundDiscovery({
            target: canonical.target,
            uniprot_id: canonical.uniprot_id,
            disease: canonical.disease,
            maxActivities: body.maxActivities,
            fetchImpl,
          });
          const result = { ...discovered, target_run_id: targetRunId || null };
          const key = targetRunId || result.uniprot_id || result.target;
          compoundCache.set(String(key).toUpperCase(), result);
          compoundSpan.setAttribute('chembl.target.id', result.chembl_target?.target_chembl_id ?? '');
          compoundSpan.setAttribute('compound.count', result.compounds?.length ?? 0);
          persistState();
          sendJson(response, 200, result);
        } catch (error) {
          telemetry.failSpan(compoundSpan, error);
          throw error;
        } finally {
          compoundSpan.end();
        }
        return;
      }
      const compoundMatch = url.pathname.match(/^\/target\/([^/]+)\/compounds$/);
      if (request.method === 'GET' && compoundMatch) {
        const id = decodeURIComponent(compoundMatch[1]).toUpperCase();
        const result = compoundCache.get(id);
        if (!result) {
          sendJson(response, 404, { error: 'not found' });
          return;
        }
        sendJson(response, 200, result);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/mend/diligence') {
        const requestedRun = url.searchParams.get('runId');
        const selectedWorkflow = requestedRun ? diligenceWorkflows.get(requestedRun) : latestDiligenceWorkflow;
        if (!selectedWorkflow) {
          sendJson(response, 404, { error: 'create a diligence workflow first' });
          return;
        }
        sendJson(response, 200, selectedWorkflow);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/mend/runs') {
        sendJson(response, 200, {
          disease_run_id: discoveryState.run_id ?? null,
          runs: [...targetRuns.entries()].map(([runId, run]) => ({
            runId,
            target: run.target ?? discoveryState.handoff?.results?.find((item) => item.run?.runId === runId)?.target ?? null,
            status: run.status,
            publishStatus: run.publishStatus,
            failedAxes: run.failedAxes ?? [],
          })),
        });
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
        if (body.target != null || body.targetId != null || body.uniprot_id != null) {
          throw new Error('discovery accepts a disease only; targets must be discovered from evidence');
        }
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
          run_id: String(body.runId ?? randomUUID()),
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
          disease, 'disease.run.id': discoveryState.run_id, 'paper.count': papers.length, 'candidate.count': candidates.length,
        }, requestSpan);
        persistState();
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
        persistState();
        sendJson(response, 200, discoveryState);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/mend/discovery/handoff') {
        const body = await readJson(request);
        const requestedAxes = requestedHandoffAxes(body.axes);
        const savedSelection = new Set(discoveryState.selection.selected_candidate_ids ?? []);
        if (!savedSelection.size || discoveryState.status !== 'CANDIDATES_SELECTED') {
          throw new Error('save a human candidate selection before X/Y/Z handoff');
        }
        const candidateIds = [...new Set((body.candidateIds?.length ? body.candidateIds : [...savedSelection]).map(String))];
        if (!candidateIds.length) throw new Error('select at least one candidate before X/Y/Z handoff');
        const unapproved = candidateIds.filter((id) => !savedSelection.has(id));
        if (unapproved.length) throw new Error(`handoff candidate was not human-selected: ${unapproved.join(', ')}`);
        const candidates = candidateIds.map((id) => discoveryState.candidates.find((candidate) => candidate.candidate_id === id));
        if (candidates.some((candidate) => !candidate)) throw new Error('handoff contains an unknown candidate');
        const executions = candidates.map((candidate) => ({
          candidate,
          runId: `discovery-${candidate.candidate_id}-${randomUUID().slice(0, 8)}`,
        }));
        const settlements = await Promise.allSettled(executions.map(({ candidate, runId }) => targetDiligence({
            disease: discoveryState.disease,
            target: candidate.name,
            runId,
            diseaseRunId: discoveryState.run_id,
            candidateId: candidate.candidate_id,
            targetAliases: candidate.aliases ?? [],
            uniprotId: candidate.uniprot_id ?? null,
            pipelineAcquire: brightDataAcquire,
            telemetry,
            parentSpan: requestSpan,
          })));
        const results = settlements.map((settlement, index) => {
          const { candidate, runId } = executions[index];
          if (settlement.status === 'rejected') {
            return failedTargetRun({
              runId,
              diseaseRunId: discoveryState.run_id,
              disease: discoveryState.disease,
              candidate,
              error: settlement.reason,
            });
          }
          return bindTargetRun(settlement.value, {
            disease: discoveryState.disease,
            diseaseRunId: discoveryState.run_id,
            candidate,
            runId,
          });
        });
        for (const run of results) targetRuns.set(run.runId, run);
        latestMendRun = results.find((run) => run.status !== 'FAILED') ?? results[0] ?? null;
        latestDiligenceWorkflow = null;
        const axes = Object.fromEntries(requestedAxes.map((axis) => [axis, {
          status: results.every((result) => result.axes?.[axis]?.status === 'HEALTHY') ? 'COMPLETE' : 'NEEDS_REVIEW',
        }]));
        const successfulResults = results.filter((result) => result.status !== 'FAILED');
        discoveryState = {
          ...discoveryState,
          status: 'DILIGENCE_COMPLETE',
          selection: { selected_candidate_ids: candidateIds, selected_at: discoveryState.selection.selected_at ?? new Date().toISOString() },
          handoff: {
            status: successfulResults.length === 0
              ? 'FAILED'
              : results.every((result) => result.status === 'HEALTHY') ? 'COMPLETE' : 'DEGRADED',
            axes,
            requested_axes: requestedAxes,
            results: candidates.map((candidate, index) => ({
              candidate_id: candidate.candidate_id,
              target: candidate.name,
              error: results[index].error ?? null,
              run: results[index],
            })),
          },
        };
        telemetry.log('INFO', 'Selected targets handed to X/Y/Z diligence', {
          disease: discoveryState.disease, 'disease.run.id': discoveryState.run_id,
          'candidate.ids': candidateIds.join(','), 'handoff.status': discoveryState.handoff.status,
        }, requestSpan);
        persistState();
        sendJson(response, 200, discoveryState);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/mend/diligence') {
        const body = await readJson(request);
        const selectedRun = body.runId ? targetRuns.get(String(body.runId)) : latestMendRun;
        if (!selectedRun) {
          sendJson(response, 409, { error: 'run the Mend vertical slice before creating diligence work' });
          return;
        }
        latestDiligenceWorkflow = createDiligenceWorkflow(selectedRun);
        diligenceWorkflows.set(selectedRun.runId, latestDiligenceWorkflow);
        const workflowTelemetry = telemetry.bindCorrelation({
          ...latestDiligenceWorkflow.correlation,
          runId: latestDiligenceWorkflow.runId,
          workflowId: latestDiligenceWorkflow.id,
        });
        requestSpan.setAttribute('workflow.id', latestDiligenceWorkflow.id);
        requestSpan.setAttribute('run.id', latestDiligenceWorkflow.runId);
        workflowTelemetry.log('INFO', 'Diligence workflow created', {
          'workflow.id': latestDiligenceWorkflow.id,
          'run.id': latestDiligenceWorkflow.runId,
          'workflow.status': latestDiligenceWorkflow.status,
          recommendation: latestDiligenceWorkflow.recommendation.code,
        }, requestSpan);
        persistState();
        sendJson(response, 201, latestDiligenceWorkflow);
        return;
      }
      const diligenceTaskMatch = url.pathname.match(/^\/mend\/diligence\/tasks\/([^/]+)\/complete$/);
      if (request.method === 'POST' && diligenceTaskMatch) {
        const body = await readJson(request);
        const requestedRunId = String(body.runId ?? url.searchParams.get('runId') ?? '');
        const selectedWorkflow = requestedRunId ? diligenceWorkflows.get(requestedRunId) : latestDiligenceWorkflow;
        if (!selectedWorkflow) {
          sendJson(response, 409, { error: 'create a diligence workflow first' });
          return;
        }
        latestDiligenceWorkflow = completeDiligenceTask(selectedWorkflow, {
          taskId: decodeURIComponent(diligenceTaskMatch[1]),
          actor: body.actor,
          finding: body.finding,
        });
        diligenceWorkflows.set(latestDiligenceWorkflow.runId, latestDiligenceWorkflow);
        const taskTelemetry = telemetry.bindCorrelation({
          ...latestDiligenceWorkflow.correlation,
          runId: latestDiligenceWorkflow.runId,
          workflowId: latestDiligenceWorkflow.id,
          diligenceTaskId: decodeURIComponent(diligenceTaskMatch[1]),
          axis: latestDiligenceWorkflow.tasks.find((item) => item.id === decodeURIComponent(diligenceTaskMatch[1]))?.axis,
        });
        requestSpan.setAttribute('workflow.id', latestDiligenceWorkflow.id);
        requestSpan.setAttribute('diligence.task.id', decodeURIComponent(diligenceTaskMatch[1]));
        taskTelemetry.log('INFO', 'Diligence task completed', {
          'workflow.id': latestDiligenceWorkflow.id,
          'run.id': latestDiligenceWorkflow.runId,
          'diligence.task.id': decodeURIComponent(diligenceTaskMatch[1]),
          'workflow.status': latestDiligenceWorkflow.status,
          actor: body.actor,
        }, requestSpan);
        telemetry.metrics.diligenceTasks.add(1, taskTelemetry.attributes({ outcome: 'completed' }));
        persistState();
        sendJson(response, 200, latestDiligenceWorkflow);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/mend/diligence/decision') {
        const body = await readJson(request);
        const requestedRunId = String(body.runId ?? '');
        const selectedWorkflow = requestedRunId ? diligenceWorkflows.get(requestedRunId) : latestDiligenceWorkflow;
        if (!selectedWorkflow) {
          sendJson(response, 409, { error: 'create a diligence workflow first' });
          return;
        }
        latestDiligenceWorkflow = recordDiligenceDecision(selectedWorkflow, body);
        diligenceWorkflows.set(latestDiligenceWorkflow.runId, latestDiligenceWorkflow);
        const decisionId = `decision-${latestDiligenceWorkflow.runId}`;
        const decisionTelemetry = telemetry.bindCorrelation({
          ...latestDiligenceWorkflow.correlation,
          runId: latestDiligenceWorkflow.runId,
          workflowId: latestDiligenceWorkflow.id,
          diligenceDecisionId: decisionId,
        });
        requestSpan.setAttribute('workflow.id', latestDiligenceWorkflow.id);
        requestSpan.setAttribute('diligence.decision', latestDiligenceWorkflow.decision.decision);
        requestSpan.setAttribute('diligence.decision.id', decisionId);
        decisionTelemetry.log('INFO', 'Diligence decision recorded', {
          'workflow.id': latestDiligenceWorkflow.id,
          'run.id': latestDiligenceWorkflow.runId,
          'workflow.status': latestDiligenceWorkflow.status,
          decision: latestDiligenceWorkflow.decision.decision,
          actor: latestDiligenceWorkflow.decision.actor,
        }, requestSpan);
        telemetry.metrics.diligenceDecisions.add(1, decisionTelemetry.attributes({ outcome: latestDiligenceWorkflow.decision.decision }));
        persistState();
        sendJson(response, 200, latestDiligenceWorkflow);
        return;
      }
      if (request.method === 'GET' && (url.pathname === '/mend/research' || url.pathname === '/reference/mend-discovery')) {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(renderDiscoveryView(discoveryState));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/mend') {
        const canonicalRun = latestMendRun ?? [...targetRuns.values()].at(-1) ?? null;
        const canonicalWorkflow = canonicalRun
          ? diligenceWorkflows.get(canonicalRun.runId) ?? (latestDiligenceWorkflow?.runId === canonicalRun.runId ? latestDiligenceWorkflow : null)
          : null;
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(canonicalRun
          ? renderTargetView(canonicalRun, canonicalWorkflow)
          : renderDiscoveryView(discoveryState));
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
        targetRuns.set(latestMendRun.runId, latestMendRun);
        persistState();
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
        || /required|unknown diligence task|already complete|must be|not actionable|healthy published|human candidate selection|human-selected|unknown target_run_id|does not match target_run_id|target_run_id is missing canonical/.test(error.message);
      sendJson(response, clientError ? 400 : 500, { error: error.message });
    } finally {
      requestSpan.end();
    }
  });
  return { server, telemetry };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = createApp({ stateStore: createFileStateStore() });
  const port = Number(process.env.PORT ?? 3000);
  app.server.listen(port, () => console.log(`zero-downtime fixture listening on http://localhost:${port}`));
  async function stop() {
    app.server.close(async () => { await app.telemetry.shutdown(); process.exit(0); });
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
