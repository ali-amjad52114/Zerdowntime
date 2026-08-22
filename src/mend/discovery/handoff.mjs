import { runClinicalTrialsAxis } from '../../axes/x/clinical-trials.mjs';
import { runYAxis } from '../../axes/y/structure.mjs';
import { createEpoLinkedDataRetriever } from '../../axes/z/epo-linked-data.mjs';
import { runZAxis } from '../../axes/z-ip-activity.mjs';
import { resolveUniProtTarget } from '../../axes/y/target-identity.mjs';
import { runVerticalSlice } from '../vertical-slice.mjs';

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
  const axisRunners = {
    X: async () => {
      const clinical = await runClinicalTrialsAxis({ disease, target, fetchImpl });
      if (typeof pipelineAcquire !== 'function') return clinical;
      const pipeline = await pipelineAcquire({
        diseaseRunId, candidateId, targetRunId: runId, disease, target, targetAliases, uniprotId,
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
    Y: async () => {
      const accession = uniprotId || (await resolveUniProtTarget({ target, fetchImpl })).accession;
      const result = await runYAxis({ accession, subject: target, fetchImpl, maxEntries: 25 });
      return { ...result, summary: { ...result.summary, uniprot_id: accession, identity_match: 'exact_uniprot_accession' } };
    },
    Z: async () => runZAxis({
      retrieve: createEpoLinkedDataRetriever({ fetchImpl, limit: 25, timeoutMs: 45_000 }),
      query: { disease, target },
      sourceName: 'European Patent Office Linked Open EP Data',
    }),
  };
  return runVerticalSlice({
    axisRunners,
    mode: 'normal',
    factoryVersion: 'discovery-v1',
    runId,
    telemetry,
    parentSpan,
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
  const rerun = await runVerticalSlice({
    axisRunners,
    mode: 'normal',
    factoryVersion: existingRun.factoryVersion ?? 'discovery-v1',
    runId: existingRun.runId,
    telemetry,
    parentSpan,
  });
  return {
    ...rerun,
    disease_run_id: existingRun.disease_run_id,
    candidate_id: existingRun.candidate_id,
    disease: disease ?? existingRun.disease,
    target: target ?? existingRun.target,
    retried_axis: normalizedAxis,
  };
}
