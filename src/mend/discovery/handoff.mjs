import { randomUUID } from 'node:crypto';
import { runClinicalTrialsAxis } from '../../axes/x/clinical-trials.mjs';
import { runYAxis } from '../../axes/y/structure.mjs';
import { createEpoLinkedDataRetriever } from '../../axes/z/epo-linked-data.mjs';
import { runZAxis } from '../../axes/z-ip-activity.mjs';
import { resolveUniProtTarget } from '../../axes/y/target-identity.mjs';
import { runVerticalSlice } from '../vertical-slice.mjs';

async function executeSponsorRequest({ telemetry, parentSpan, correlation, axis, provider, operation, run }) {
  const sponsorRequestId = `request-${randomUUID()}`;
  const sourceExecutionId = `execution-${randomUUID()}`;
  const bound = telemetry?.bindCorrelation?.({
    ...correlation, axis, sourceProvider: provider, sourceExecutionId, sponsorRequestId,
  });
  const span = bound?.startSpan?.(`sponsor.${provider}.${operation}`, {
    'sponsor.operation': operation, 'sponsor.phase': 'request',
  }, parentSpan);
  const startedAt = performance.now();
  bound?.log?.('INFO', 'Sponsor request started', {
    'sponsor.operation': operation, 'sponsor.phase': 'request',
  }, span);
  telemetry?.metrics?.sponsorRequests?.add(1, bound?.attributes?.({ operation, outcome: 'started' }) ?? { axis, provider });
  telemetry?.metrics?.sourceExecutions?.add(1, bound?.attributes?.({ operation }) ?? { axis, provider });
  try {
    const result = await run();
    const manifest = result?.source_execution;
    const actualExecutionId = manifest?.execution_id ?? sourceExecutionId;
    const sponsorResultId = manifest?.provider?.run_id ?? manifest?.execution_id ?? `result-${randomUUID()}`;
    const resultCorrelation = telemetry?.correlationAttributes?.({
      ...correlation,
      axis,
      sourceProvider: provider,
      sourceExecutionId: actualExecutionId,
      sponsorRequestId,
      sponsorResultId,
      brightdataCollectorId: manifest?.telemetry_attributes?.['brightdata.collector.id'],
      brightdataDatasetId: manifest?.telemetry_attributes?.['brightdata.dataset.id'],
      validationStatus: result?.validation?.status ?? 'PASS',
    }) ?? {};
    for (const [key, value] of Object.entries(resultCorrelation)) span?.setAttribute?.(key, value);
    span?.setAttribute?.('sponsor.phase', 'result');
    const resultBound = telemetry?.bindCorrelation?.(resultCorrelation);
    resultBound?.log?.('INFO', 'Sponsor result received', {
      'sponsor.operation': operation, 'sponsor.phase': 'result',
      'record.count': result?.records?.length ?? 0,
    }, span);
    telemetry?.metrics?.sponsorResults?.add(1, { ...resultCorrelation, operation, outcome: 'success' });
    telemetry?.metrics?.sourceDuration?.record(performance.now() - startedAt, { ...resultCorrelation, operation, outcome: 'success' });
    return result;
  } catch (error) {
    telemetry?.failSpan?.(span, error);
    bound?.log?.('ERROR', `Sponsor request failed: ${error.message}`, {
      'sponsor.operation': operation, 'sponsor.phase': 'result', outcome: 'failure',
    }, span);
    telemetry?.metrics?.sourceFailures?.add(1, bound?.attributes?.({ operation, outcome: 'failure' }) ?? { axis, provider });
    telemetry?.metrics?.sourceDuration?.record(performance.now() - startedAt, bound?.attributes?.({ operation, outcome: 'failure' }) ?? { axis, provider });
    throw error;
  } finally {
    span?.end?.();
  }
}

export async function runSelectedTargetDiligence({
  disease,
  target,
  runId,
  diseaseRunId,
  candidateId,
  targetAliases,
  uniprotId,
  fetchImpl = globalThis.fetch,
  telemetry,
  parentSpan,
  pipelineAcquire,
} = {}) {
  const correlation = {
    diseaseRunId, candidateId, targetRunId: runId, targetName: target,
  };
  const axisRunners = {
    X: async ({ parentSpan: axisSpan } = {}) => {
      const clinical = await executeSponsorRequest({
        telemetry, parentSpan: axisSpan, correlation, axis: 'X', provider: 'clinicaltrials.gov', operation: 'clinical-trials-search',
        run: () => runClinicalTrialsAxis({ disease, target, fetchImpl }),
      });
      if (typeof pipelineAcquire !== 'function') return clinical;
      const pipeline = await executeSponsorRequest({
        telemetry, parentSpan: axisSpan, correlation, axis: 'X', provider: 'bright_data', operation: 'pipeline-acquisition',
        run: () => pipelineAcquire({
          diseaseRunId, candidateId, targetRunId: runId, disease, target, targetAliases, uniprotId,
        }),
      });
      return {
        axis: 'X',
        records: [...clinical.records, ...pipeline.records],
        summary: {
          ...clinical.summary,
          clinical_records: clinical.records.length,
          pipeline_records: pipeline.records.length,
          programsFound: clinical.records.length + pipeline.records.length,
          brightdata_source_execution_id: pipeline.source_execution?.execution_id ?? null,
        },
        validation: { status: 'PASS', checks: ['CLINICAL_SOURCE_LINKED', 'BRIGHTDATA_SOURCE_LINKED'] },
        sub_axes: { clinical_trials: clinical, company_pipeline: pipeline },
      };
    },
    Y: async ({ parentSpan: axisSpan } = {}) => {
      const accession = uniprotId || (await executeSponsorRequest({
        telemetry, parentSpan: axisSpan, correlation, axis: 'Y', provider: 'uniprot', operation: 'target-resolution',
        run: () => resolveUniProtTarget({ target, fetchImpl }),
      })).accession;
      const result = await executeSponsorRequest({
        telemetry, parentSpan: axisSpan, correlation, axis: 'Y', provider: 'rcsb', operation: 'structure-search',
        run: () => runYAxis({ accession, subject: target, fetchImpl, maxEntries: 25 }),
      });
      return { ...result, summary: { ...result.summary, uniprot_id: accession, identity_match: 'exact_uniprot_accession' } };
    },
    Z: async ({ parentSpan: axisSpan } = {}) => executeSponsorRequest({
      telemetry, parentSpan: axisSpan, correlation, axis: 'Z', provider: 'epo', operation: 'patent-search',
      run: () => runZAxis({
        retrieve: createEpoLinkedDataRetriever({ fetchImpl, limit: 25, timeoutMs: 45_000 }),
        query: { disease, target },
        sourceName: 'European Patent Office Linked Open EP Data',
      }),
    }),
  };
  return runVerticalSlice({
    axisRunners,
    mode: 'normal',
    factoryVersion: 'discovery-v1',
    runId,
    telemetry,
    parentSpan,
    correlation,
  });
}

function liveAxisRunner(axis, { disease, target, fetchImpl, uniprotId }) {
  if (axis === 'X') return () => runClinicalTrialsAxis({ disease, target, fetchImpl });
  if (axis === 'Y') return async () => {
    const accession = uniprotId || (await resolveUniProtTarget({ target, fetchImpl })).accession;
    const result = await runYAxis({ accession, subject: target, fetchImpl, maxEntries: 25 });
    return { ...result, summary: { ...result.summary, uniprot_id: accession, identity_match: 'exact_uniprot_accession' } };
  };
  if (axis === 'Z') return () => runZAxis({
    retrieve: createEpoLinkedDataRetriever({ fetchImpl, limit: 25, timeoutMs: 45_000 }),
    query: { disease, target },
    sourceName: 'European Patent Office Linked Open EP Data',
  });
  throw new Error('axis must be X, Y, or Z');
}

/** Retry one external axis while preserving the other two exact results. */
export async function retrySelectedTargetAxis({
  axis,
  existingRun,
  disease,
  target,
  fetchImpl = globalThis.fetch,
  telemetry,
  parentSpan,
} = {}) {
  if (!existingRun?.runId) throw new Error('existing target run is required');
  const normalizedAxis = String(axis ?? '').toUpperCase();
  const retryAttempt = Number(existingRun.retry_counts?.[normalizedAxis] ?? 0) + 1;
  const retryTelemetry = telemetry?.bindCorrelation?.({
    diseaseRunId: existingRun.disease_run_id,
    candidateId: existingRun.candidate_id,
    targetRunId: existingRun.runId,
    targetName: target ?? existingRun.target,
    axis: normalizedAxis,
    retryAttempt,
  });
  const retrySpan = retryTelemetry?.startSpan?.('axis.retry', { 'retry.reason': 'port-requested' }, parentSpan);
  retryTelemetry?.log?.('INFO', 'Axis retry started', { 'retry.phase': 'started' }, retrySpan);
  telemetry?.metrics?.retries?.add(1, retryTelemetry?.attributes?.({ outcome: 'started' }) ?? { axis: normalizedAxis });
  const preserved = (name) => async () => {
    const current = existingRun.axes?.[name];
    if (!current) throw new Error(`target run has no ${name} axis to preserve`);
    return {
      records: current.records,
      summary: current.summary,
      validation: current.validation?.status === 'PASS' ? current.validation : { status: 'PASS', checks: ['PRESERVED_EXISTING_AXIS'] },
      sub_axes: current.sub_axes,
    };
  };
  const axisRunners = Object.fromEntries(['X', 'Y', 'Z'].map((name) => [
    name,
    name === normalizedAxis ? liveAxisRunner(name, {
      disease, target, fetchImpl, uniprotId: existingRun.axes?.Y?.summary?.uniprot_id,
    }) : preserved(name),
  ]));
  try {
    const rerun = await runVerticalSlice({
      axisRunners,
      mode: 'normal',
      factoryVersion: existingRun.factoryVersion ?? 'discovery-v1',
      runId: existingRun.runId,
      telemetry,
      parentSpan: retrySpan ?? parentSpan,
      correlation: {
        diseaseRunId: existingRun.disease_run_id,
        candidateId: existingRun.candidate_id,
        targetRunId: existingRun.runId,
        targetName: target ?? existingRun.target,
        retryAttempt,
      },
    });
    retryTelemetry?.log?.('INFO', 'Axis retry completed', { 'retry.phase': 'result', outcome: rerun.status }, retrySpan);
    return {
      ...rerun,
      disease_run_id: existingRun.disease_run_id,
      candidate_id: existingRun.candidate_id,
      disease: disease ?? existingRun.disease,
      target: target ?? existingRun.target,
      retried_axis: normalizedAxis,
    };
  } catch (error) {
    telemetry?.failSpan?.(retrySpan, error);
    retryTelemetry?.log?.('ERROR', `Axis retry failed: ${error.message}`, { 'retry.phase': 'result', outcome: 'failure' }, retrySpan);
    throw error;
  } finally {
    retrySpan?.end?.();
  }
}
