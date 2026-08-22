import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import {
  createBrightDataAcquisitionRequest,
  executeBrightDataAdapter,
  persistBrightDataSourceExecution,
} from './brightdata-source.mjs';

const execFileAsync = promisify(execFile);

export function extractBrightDataResponseId(stderr) {
  return String(stderr ?? '').match(/\bresponse_id\s*:\s*([A-Za-z0-9._-]+)/i)?.[1] ?? null;
}

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
    const { result, execution } = await runExistingBrightDataCollector({
      request, environment, artifactRoot,
    });
    if (result.validation.status !== 'PASS') throw new Error(`Bright Data X validation failed: ${result.validation.reasons?.join(', ') ?? 'unknown reason'}`);
    return { ...result, source_execution: execution };
  };
}

export async function runExistingBrightDataCollector({
  request,
  environment = process.env,
  artifactRoot,
  executionId = randomUUID(),
  executeFile = execFileAsync,
  startedAt = new Date().toISOString(),
} = {}) {
  if (!environment.BRIGHTDATA_API_KEY) throw new TypeError('BRIGHTDATA_API_KEY is required');
  let stdout;
  let stderr;
  try {
    ({ stdout, stderr } = await executeFile(process.execPath, [
      'node_modules/@brightdata/cli/dist/index.js', 'scraper', 'run',
      request.source.asset_id, request.source.url, '--pretty',
    ], {
      encoding: 'utf8', env: environment, timeout: 120_000,
      windowsHide: true, maxBuffer: 20 * 1024 * 1024,
    }));
  } catch (error) {
    const exitCode = Number.isInteger(error?.code) ? ` (exit ${error.code})` : '';
    throw new Error(`Bright Data CLI execution failed${exitCode}`);
  }
  const providerRunId = extractBrightDataResponseId(stderr);
  if (!providerRunId) throw new Error('Bright Data CLI did not report a response_id');
  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Bright Data returned invalid JSON: ${error.message}`);
  }
  const result = executeBrightDataAdapter({ request, payload });
  const execution = persistBrightDataSourceExecution({
    artifactRoot, request, payload, adapterResult: result,
    executionId, providerRunId, startedAt, mode: 'live',
  });
  return { request, payload, result, execution };
}
