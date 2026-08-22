import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  extractBrightDataResponseId,
  runExistingBrightDataCollector,
} from '../src/acquisition/brightdata-cli.mjs';
import { createBrightDataAcquisitionRequest } from '../src/acquisition/brightdata-source.mjs';

const providerPayload = [{
  organization: 'Public Biotech', program: 'ALK7-1', disease: 'Obesity',
  target_mechanism: 'ALK7 inhibitor', development_stage: 'Discovery', status: 'Active',
  evidence_excerpt: 'ALK7 inhibitor program for obesity.',
  source_url: 'https://public.example/pipeline',
}];

function request() {
  return createBrightDataAcquisitionRequest({
    diseaseRunId: 'disease-obesity-live', candidateId: 'candidate-alk7',
    targetRunId: 'target-alk7-live', disease: { name: 'Obesity', aliases: [] },
    target: { name: 'ALK7', aliases: ['ACVR1C'] }, matchPolicy: 'disease_and_target',
    source: {
      kind: 'scraper_studio_collector', assetId: 'c_existing_public',
      url: 'https://public.example/pipeline', publicSourceApproved: true,
    },
  });
}

test('extracts the actual provider response_id format emitted on CLI stderr', () => {
  assert.equal(extractBrightDataResponseId('Triggered (response_id: r_abc-123.X)\nPolling...'), 'r_abc-123.X');
  assert.equal(extractBrightDataResponseId('completed without an identifier'), null);
});

test('existing-collector runtime persists checksummed correlated output without leaking secrets', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mend-brightdata-runtime-'));
  const secret = 'bd-secret-value-that-must-not-leak';
  let invocation;
  const response = await runExistingBrightDataCollector({
    request: request(), artifactRoot: root, executionId: 'source-obesity-alk7',
    environment: { BRIGHTDATA_API_KEY: secret },
    startedAt: '2026-08-22T21:00:00.000Z',
    executeFile: async (file, args, options) => {
      invocation = { file, args, options };
      return {
        stdout: JSON.stringify(providerPayload),
        stderr: 'Triggered (response_id: r_provider_real_shape_42)\nDone\n',
      };
    },
  });

  assert.deepEqual(invocation.args.slice(1, 4), ['scraper', 'run', 'c_existing_public']);
  assert.equal(invocation.options.env.BRIGHTDATA_API_KEY, secret);
  assert.equal(response.execution.provider.run_id, 'r_provider_real_shape_42');
  assert.equal(response.execution.live_gate.pass, true);
  assert.equal(response.result.records.length, 1);

  const directory = join(root, 'source-obesity-alk7');
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  const durableText = ['manifest.json', 'raw.json', 'normalized.json']
    .map((name) => readFileSync(join(directory, name), 'utf8')).join('\n');
  assert.equal(manifest.correlation.disease_run_id, 'disease-obesity-live');
  assert.equal(manifest.correlation.target_run_id, 'target-alk7-live');
  assert.match(manifest.artifacts.raw.sha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.artifacts.normalized.sha256, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(durableText, new RegExp(secret));
  assert.doesNotMatch(durableText, /BRIGHTDATA_API_KEY/);
});

test('existing-collector runtime refuses live evidence without a CLI response_id', async () => {
  await assert.rejects(() => runExistingBrightDataCollector({
    request: request(), environment: { BRIGHTDATA_API_KEY: 'test-only' },
    executeFile: async () => ({ stdout: JSON.stringify(providerPayload), stderr: 'Done\n' }),
  }), /did not report a response_id/);
});

test('existing-collector runtime does not echo secrets from CLI failures', async () => {
  const leaked = 'provider-secret-canary';
  await assert.rejects(() => runExistingBrightDataCollector({
    request: request(), environment: { BRIGHTDATA_API_KEY: leaked },
    executeFile: async () => {
      const error = new Error(`provider failed with ${leaked}`);
      error.code = 7;
      error.stderr = `Authorization: Bearer ${leaked}`;
      throw error;
    },
  }), (error) => {
    assert.match(error.message, /Bright Data CLI execution failed \(exit 7\)/);
    assert.doesNotMatch(String(error), new RegExp(leaked));
    return true;
  });
});
