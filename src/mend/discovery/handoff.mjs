import { runClinicalTrialsAxis } from '../../axes/x/clinical-trials.mjs';
import { runYAxis } from '../../axes/y/structure.mjs';
import { createEpoLinkedDataRetriever } from '../../axes/z/epo-linked-data.mjs';
import { runZAxis } from '../../axes/z-ip-activity.mjs';
import { runVerticalSlice } from '../vertical-slice.mjs';

export async function runSelectedTargetDiligence({
  disease,
  target,
  runId,
  fetchImpl = globalThis.fetch,
  telemetry,
  parentSpan,
} = {}) {
  const axisRunners = {
    X: async () => runClinicalTrialsAxis({ disease, target, fetchImpl }),
    Y: async () => runYAxis({ target, subject: target, fetchImpl, maxEntries: 25 }),
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
