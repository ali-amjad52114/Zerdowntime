import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDiscoveryHandoffSnapshot,
  retrySelectedTargetAxis,
  runSelectedTargetDiligence,
} from '../src/mend/discovery/handoff.mjs';

test('handoff snapshot separates support, contradiction, and neutral context without diluting directional evidence', () => {
  const snapshot = createDiscoveryHandoffSnapshot({
    candidate_id: 'egfr', name: 'EGFR', rank: 1, ranking: { score: 7 },
    evidence: [
      { classification: 'SUPPORTING', text: 'Exact support.', source_url: 'https://paper.example/1' },
      { classification: 'CONTRADICTORY', text: 'Exact contradiction.', source_url: 'https://paper.example/2' },
      { classification: 'NEUTRAL', text: 'Context only.', source_url: 'https://paper.example/3' },
    ],
  });
  assert.equal(snapshot.rank, 1);
  assert.deepEqual(snapshot.ranking, { score: 7 });
  assert.equal(snapshot.supporting_passages[0].text, 'Exact support.');
  assert.equal(snapshot.contradictory_passages[0].source_url, 'https://paper.example/2');
  assert.equal(snapshot.contextual_passages[0].text, 'Context only.');
  assert.equal(snapshot.evidence.length, 3);
});

test('selected target handoff resolves exact UniProt identity and merges configured Bright Data X evidence', async () => {
  const requests = [];
  const fetchImpl = async (input, options = {}) => {
    const url = String(input);
    requests.push({ url, options });
    if (url.includes('rest.uniprot.org')) return { ok: true, json: async () => ({ results: [{
      primaryAccession: 'P00533', genes: [{ geneName: { value: 'EGFR' } }],
      proteinDescription: { recommendedName: { fullName: { value: 'Epidermal growth factor receptor' } } },
      sequence: { length: 1210, molWeight: 134277 },
      comments: [{ commentType: 'SUBCELLULAR LOCATION', subcellularLocations: [{ location: { value: 'Cell membrane' } }] }],
      features: [],
    }] }) };
    if (url.includes('clinicaltrials.gov')) return { ok: true, json: async () => ({ studies: [{ protocolSection: {
      identificationModule: { nctId: 'NCT00000001', briefTitle: 'EGFR study' },
      designModule: { phases: ['PHASE2'] }, statusModule: { overallStatus: 'RECRUITING' },
      sponsorCollaboratorsModule: { leadSponsor: { name: 'Example' } },
      armsInterventionsModule: { interventions: [{ name: 'Example inhibitor' }] },
      contactsLocationsModule: { locations: [{ country: 'United States' }, { country: 'Germany' }] },
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
    discoverySnapshot: {
      candidate_id: 'egfr', name: 'EGFR', rank: 1,
      ranking: { score: 9.4, formula: 'support minus contradiction penalty' },
      supporting_passages: [{ text: 'Exact supporting passage.', source_url: 'https://paper.example/support' }],
      contradictory_passages: [{ text: 'Exact contradictory passage.', source_url: 'https://paper.example/contradiction' }],
    },
  });
  assert.equal(run.status, 'HEALTHY');
  assert.equal(run.axes.X.records.length, 2);
  assert.equal(run.axes.X.summary.pipeline_records, 1);
  assert.equal(run.axes.X.summary.brightdata_source_execution_id, 'source-disease-run-1-egfr-target-run-1');
  assert.equal(run.axes.X.sub_axes.clinical_trials.records.length, 1);
  assert.equal(run.axes.X.sub_axes.company_pipeline.records.length, 1);
  assert.equal(run.axes.X.sub_axes.site_geography.summary.total_sites, 2);
  assert.equal(requests.filter((request) => request.url.includes('clinicaltrials.gov')).length, 1);
  assert.equal(run.axes.Y.summary.uniprot_id, 'P00533');
  assert.equal(run.axes.Y.sub_axes.target_identity.records[0].accession, 'P00533');
  assert.equal(run.axes.Y.sub_axes.target_identity.summary.membrane, true);
  assert.equal(run.discovery_snapshot.rank, 1);
  assert.deepEqual(run.discovery_snapshot.ranking, { score: 9.4, formula: 'support minus contradiction penalty' });
  assert.equal(run.discovery_snapshot.supporting_passages[0].text, 'Exact supporting passage.');
  assert.equal(run.discovery_snapshot.contradictory_passages[0].source_url, 'https://paper.example/contradiction');
  assert.equal(run.axes.Z.sub_axes.orphan_exclusivity, undefined);
  const rcsbSearch = requests.find((request) => request.url.includes('search.rcsb.org'));
  const body = JSON.parse(rcsbSearch.options.body);
  assert.equal(body.query.service, 'text');
  assert.equal(body.query.parameters.operator, 'exact_match');
  assert.equal(body.query.parameters.value, 'P00533');

  const retried = await retrySelectedTargetAxis({
    axis: 'X', existingRun: run, disease: 'Glioblastoma', target: 'EGFR', fetchImpl,
  });
  assert.equal(retried.axes.X.sub_axes.company_pipeline.records.length, 1);
  assert.equal(retried.axes.X.sub_axes.site_geography.summary.total_sites, 2);
  assert.equal(retried.axes.Y.sub_axes.target_identity.records[0].accession, 'P00533');
  assert.equal(requests.filter((request) => request.url.includes('clinicaltrials.gov')).length, 2);
});
