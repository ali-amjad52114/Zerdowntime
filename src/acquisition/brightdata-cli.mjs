import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import {
  createBrightDataAcquisitionRequest,
  executeBrightDataAdapter,
  persistBrightDataSourceExecution,
} from './brightdata-source.mjs';

const execFileAsync = promisify(execFile);

function list(value) {
  return String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}

export function configuredBrightDataAcquirer(environment = process.env) {
  if (environment.MEND_X_RUNTIME_ENABLED !== 'true'
    || !environment.BRIGHTDATA_API_KEY || !environment.MEND_X_COLLECTOR_ID || !environment.MEND_X_TARGET_URL) return null;
  return createBrightDataCliAcquirer({ environment });
}

export function createBrightDataCliAcquirer({ environment = process.env, artifactRoot } = {}) {
  return async ({ diseaseRunId, candidateId, targetRunId, disease, target, targetAliases = [], uniprotId } = {}) => {
    const request = createBrightDataAcquisitionRequest({
      diseaseRunId, candidateId, targetRunId,
      disease: { name: disease, aliases: list(environment.MEND_DISEASE_ALIASES) },
      target: { name: target, aliases: targetAliases, identifiers: { uniprot: uniprotId ?? null } },
      matchPolicy: environment.MEND_X_MATCH_POLICY ?? 'disease_and_target',
      source: {
        kind: 'scraper_studio_collector', assetId: environment.MEND_X_COLLECTOR_ID,
        url: environment.MEND_X_TARGET_URL,
        publicSourceApproved: environment.MEND_X_PUBLIC_SOURCE_APPROVED === 'true',
      },
    });
    const startedAt = new Date().toISOString();
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      'node_modules/@brightdata/cli/dist/index.js', 'scraper', 'run', request.source.asset_id, request.source.url, '--pretty',
    ], { encoding: 'utf8', env: environment, timeout: 120_000, windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
    if (stderr?.trim()) process.stderr.write(stderr);
    let payload;
    try { payload = JSON.parse(stdout); } catch (error) { throw new Error(`Bright Data returned invalid JSON: ${error.message}`); }
    const result = executeBrightDataAdapter({ request, payload });
    const execution = persistBrightDataSourceExecution({
      artifactRoot, request, payload, adapterResult: result,
      executionId: randomUUID(),
      providerRunId: environment.MEND_X_PROVIDER_RUN_ID
        || stderr?.match(/response_id:\s*([A-Za-z0-9_-]+)/i)?.[1]
        || null,
      startedAt, mode: 'live',
    });
    if (result.validation.status !== 'PASS') throw new Error(`Bright Data X validation failed: ${result.validation.reasons?.join(', ') ?? 'unknown reason'}`);
    return { ...result, source_execution: execution };
  };
}
