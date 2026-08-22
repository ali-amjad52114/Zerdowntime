import assert from 'node:assert/strict';
import test from 'node:test';
import { runSelectedTargetDiligence } from '../src/mend/discovery/handoff.mjs';

test('selected target handoff resolves exact UniProt identity and merges configured Bright Data X evidence', async () => {
  const requests = [];
  const fetchImpl = async (input, options = {}) => {
    const url = String(input);
    requests.push({ url, options });
    if (url.includes('rest.uniprot.org')) return { ok: true, json: async () => ({ results: [{
      primaryAccession: 'P00533', genes: [{ geneName: { value: 'EGFR' } }],
      proteinDescription: { recommendedName: { fullName: { value: 'Epidermal growth factor receptor' } } },
    }] }) };
    if (url.includes('clinicaltrials.gov')) return { ok: true, json: async () => ({ studies: [{ protocolSection: {
      identificationModule: { nctId: 'NCT00000001', briefTitle: 'EGFR study' },
      designModule: { phases: ['PHASE2'] }, statusModule: { overallStatus: 'RECRUITING' },
      sponsorCollaboratorsModule: { leadSponsor: { name: 'Example' } },
      armsInterventionsModule: { interventions: [{ name: 'Example inhibitor' }] },
    } }] }) };
    if (url.includes('search.rcsb.org')) return { ok: true, json: async () => ({ result_set: [{ identifier: '1M17' }] }) };
    if (url.includes('data.rcsb.org/graphql')) return { ok: true, json: async () => ({ data: { entries: [{
      rcsb_id: '1M17', struct: { title: 'EGFR kinase domain' }, exptl: [{ method: 'X-RAY DIFFRACTION' }],
      rcsb_entry_info: { resolution_combined: [2.6] }, polymer_entities: [], nonpolymer_entities: [],
    }] } }) };
    if (url.includes('data.epo.org')) return { ok: true, json: async () => ({ results: { bindings: [{
      publication: { value: 'http://data.epo.org/linked-data/id/publication/EP/1234567/A1/-' },
      title: { value: 'EGFR inhibitor' }, date: { value: '2025-01-01' },
    }] } }) };
    throw new Error(`unexpected request ${url}`);
  };
  const pipelineAcquire = async ({ diseaseRunId, candidateId, targetRunId, target }) => ({
    axis: 'X',
    records: [{
      axis: 'X', subject: 'Company EGFR program', value: 'preclinical', source_url: 'https://company.example/pipeline',
      retrieved_at: '2026-08-22T00:00:00.000Z', evidence: 'Company page explicitly lists an EGFR program.', target,
    }],
    summary: { programs: 1 }, validation: { status: 'PASS' },
    source_execution: { execution_id: `source-${diseaseRunId}-${candidateId}-${targetRunId}` },
  });
  const run = await runSelectedTargetDiligence({
    disease: 'Glioblastoma', target: 'EGFR', runId: 'target-run-1', diseaseRunId: 'disease-run-1',
    candidateId: 'egfr', fetchImpl, pipelineAcquire,
  });
  assert.equal(run.status, 'HEALTHY');
  assert.equal(run.axes.X.records.length, 2);
  assert.equal(run.axes.X.summary.pipeline_records, 1);
  assert.equal(run.axes.X.summary.brightdata_source_execution_id, 'source-disease-run-1-egfr-target-run-1');
  assert.equal(run.axes.Y.summary.uniprot_id, 'P00533');
  const rcsbSearch = requests.find((request) => request.url.includes('search.rcsb.org'));
  const body = JSON.parse(rcsbSearch.options.body);
  assert.equal(body.query.service, 'text');
  assert.equal(body.query.parameters.operator, 'exact_match');
  assert.equal(body.query.parameters.value, 'P00533');
});
