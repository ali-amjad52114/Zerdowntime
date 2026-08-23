import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTargetDossier, DOSSIER_STATES } from '../src/mend/dossier.mjs';

const record = (axis, subject, sourceUrl, extra = {}) => ({
  axis,
  subject,
  value: 'evidence',
  source_url: sourceUrl,
  retrieved_at: '2026-08-22T00:00:00.000Z',
  evidence: `${subject} evidence`,
  ...extra,
});

function modernRun() {
  const clinical = record('X', 'EGFR inhibitor study', 'https://clinicaltrials.gov/study/NCT1', {
    trial_id: 'NCT1', organization: 'Example Bio', development_stage: 'PHASE2',
  });
  const company = record('X', 'Example Bio EGFR program', 'https://company.example/pipeline', {
    organization: 'Example Bio', development_stage: 'Preclinical',
  });
  const geography = record('X', 'NCT1', 'https://clinicaltrials.gov/study/NCT1', {
    trial_id: 'NCT1', countries: ['US'], site_count: 3,
  });
  const identity = record('Y', 'EGFR', 'https://www.uniprot.org/uniprotkb/P00533/entry', {
    accession: 'P00533', protein_name: 'Epidermal growth factor receptor', gene: 'EGFR',
  });
  const structure = record('Y', 'EGFR', 'https://www.rcsb.org/structure/1M17', {
    structure_id: '1M17', experimental_method: 'X-RAY DIFFRACTION', resolution_angstrom: 2.6,
  });
  const patent = record('Z', 'EGFR inhibitor', 'https://data.epo.org/publication/EP123', {
    publication_number: 'EP123', applicant: 'Example Bio',
  });
  return {
    runId: 'target-run-egfr',
    disease_run_id: 'disease-run-gbm',
    candidate_id: 'egfr',
    disease: 'Glioblastoma',
    target: 'EGFR',
    uniprot_id: 'p00533',
    factoryVersion: 'discovery-v1',
    status: 'HEALTHY',
    publishStatus: 'PUBLISHED',
    discovery_snapshot: {
      candidate_id: 'egfr', name: 'EGFR', aliases: ['ERBB1', 'EGFR'], rank: 1,
      ranking: { score: 8.25, supporting_evidence: 2, contradictory_evidence: 1 },
      evidence: [
        { classification: 'SUPPORTING', passage: 'EGFR is required for growth.', paper_id: 'p1', paper_title: 'Paper one', source_url: 'https://papers.example/1' },
        { classification: 'CONTRADICTORY', passage: 'EGFR was not associated with survival.', paper_id: 'p2', paper_title: 'Paper two', source_url: 'https://papers.example/2' },
      ],
    },
    axes: {
      X: {
        axis: 'X', status: 'HEALTHY', records: [clinical, company],
        summary: { clinical_records: 1, pipeline_records: 1 }, validation: { status: 'PASS' },
        sub_axes: {
          clinical_trials: { records: [clinical], summary: { programsFound: 1 }, validation: { status: 'PASS' } },
          company_pipeline: { records: [company], summary: { programs: 1 }, validation: { status: 'PASS' } },
          site_geography: { records: [geography], summary: { countries_covered: 1, total_sites: 3 }, validation: { status: 'PASS' } },
        },
      },
      Y: {
        axis: 'Y', status: 'HEALTHY', records: [structure], summary: { uniprot_id: 'P00533' }, validation: { status: 'PASS' },
        sub_axes: { target_identity: { records: [identity], summary: { sequence_length: 1210 }, validation: { status: 'PASS' } } },
      },
      Z: {
        axis: 'Z', status: 'HEALTHY', records: [patent], summary: { publications: 1 }, validation: { status: 'PASS' },
        sub_axes: { orphan_exclusivity: { records: [], summary: { designations: 0 }, validation: { status: 'PASS' } } },
      },
    },
  };
}

test('builds a complete dynamic target dossier with discovery and X/Y/Z evidence', () => {
  const dossier = buildTargetDossier(modernRun());

  assert.equal(dossier.schema_version, 'mend.target-dossier/v1');
  assert.deepEqual(dossier.run, {
    id: 'target-run-egfr', disease_run_id: 'disease-run-gbm', candidate_id: 'egfr',
    status: 'HEALTHY', publish_status: 'PUBLISHED', factory_version: 'discovery-v1',
  });
  assert.deepEqual(dossier.subject, {
    disease: 'Glioblastoma', target: 'EGFR', uniprot_id: 'P00533', aliases: ['EGFR', 'ERBB1'],
  });
  assert.equal(dossier.discovery.score, 8.25);
  assert.equal(dossier.discovery.rank, 1);
  assert.equal(dossier.discovery.supporting_passages.length, 1);
  assert.equal(dossier.discovery.contradictory_passages.length, 1);
  assert.deepEqual(dossier.discovery.sources.map((source) => source.url), [
    'https://papers.example/1', 'https://papers.example/2',
  ]);

  for (const item of [
    dossier.discovery, dossier.x.clinical, dossier.x.companies, dossier.x.geography,
    dossier.y.identity, dossier.y.structures, dossier.z.patents,
  ]) assert.equal(item.state, DOSSIER_STATES.EVIDENCE_FOUND);
  assert.equal(dossier.x.clinical.records[0].trial_id, 'NCT1');
  assert.equal(dossier.x.companies.records[0].organization, 'Example Bio');
  assert.equal(dossier.x.geography.summary.total_sites, 3);
  assert.equal(dossier.y.identity.records[0].accession, 'P00533');
  assert.equal(dossier.y.structures.records[0].structure_id, '1M17');
  assert.equal(dossier.z.patents.records[0].publication_number, 'EP123');

  assert.equal(dossier.z.orphan.state, DOSSIER_STATES.NO_EVIDENCE);
  assert.equal(dossier.z.orphan.suggested_action.type, 'ENRICH');
  assert.deepEqual(dossier.evidence_gaps.map((gap) => gap.source), ['z.orphan']);
  assert.deepEqual(dossier.suggested_actions, [dossier.z.orphan.suggested_action]);
});

test('distinguishes no evidence, failed, and optional not-run sources', () => {
  const run = modernRun();
  run.axes.X.sub_axes.clinical_trials = {
    records: [], summary: { programsFound: 0 },
    validation: { status: 'FAIL', reason: 'no target-specific clinical studies found' },
  };
  delete run.axes.X.sub_axes.site_geography;
  run.axes.Y = {
    axis: 'Y', status: 'UNAVAILABLE', records: [], summary: {},
    validation: { status: 'FAIL', reason: 'RCSB request failed with HTTP 503' },
  };
  delete run.axes.Z;

  const dossier = buildTargetDossier(run);
  assert.equal(dossier.x.clinical.state, DOSSIER_STATES.NO_EVIDENCE);
  assert.equal(dossier.x.clinical.error, null);
  assert.equal(dossier.x.clinical.suggested_action.type, 'ENRICH');
  assert.equal(dossier.x.geography.state, DOSSIER_STATES.NOT_RUN);
  assert.equal(dossier.x.geography.suggested_action.type, 'RESEARCH');
  assert.equal(dossier.x.geography.suggested_action.optional, true);
  assert.equal(dossier.y.state, DOSSIER_STATES.FAILED);
  assert.equal(dossier.y.structures.state, DOSSIER_STATES.FAILED);
  assert.equal(dossier.y.structures.error, 'RCSB request failed with HTTP 503');
  assert.equal(dossier.y.structures.suggested_action.type, 'RETRY');
  assert.equal(dossier.y.identity.state, DOSSIER_STATES.NOT_RUN);
  assert.equal(dossier.z.state, DOSSIER_STATES.NOT_RUN);
  assert.equal(dossier.z.patents.state, DOSSIER_STATES.NOT_RUN);
  assert.equal(dossier.z.orphan.state, DOSSIER_STATES.NOT_RUN);
  assert.ok(dossier.evidence_gaps.every((gap) => gap.state !== DOSSIER_STATES.EVIDENCE_FOUND));
});

test('treats a completed zero-match query record as NO_EVIDENCE, not target evidence', () => {
  const run = modernRun();
  const gap = record('X', 'EGFR', 'https://clinicaltrials.gov/api/v2/studies?query=EGFR', {
    record_type: 'evidence_gap', value: '0 matching studies', trial_id: null,
  });
  run.axes.X.records = [gap, ...run.axes.X.sub_axes.company_pipeline.records];
  run.axes.X.sub_axes.clinical_trials = {
    records: [gap], summary: { programsFound: 0 },
    validation: { status: 'PASS', checks: ['SOURCE_QUERY_COMPLETED', 'ZERO_MATCH_EVIDENCE_GAP'], evidence_gap: true },
  };
  const dossier = buildTargetDossier(run);
  assert.equal(dossier.x.state, DOSSIER_STATES.EVIDENCE_FOUND, 'company evidence keeps the overall X axis nonempty');
  assert.equal(dossier.x.clinical.state, DOSSIER_STATES.NO_EVIDENCE);
  assert.equal(dossier.x.clinical.records[0].record_type, 'evidence_gap', 'query proof remains inspectable');
  assert.equal(dossier.x.clinical.suggested_action.type, 'ENRICH');
});

test('does not claim individual source failures when target execution failed before sources ran', () => {
  const failedAxis = (axis) => ({
    axis, status: 'FAILED', records: [], summary: {},
    validation: { status: 'FAIL', reason: 'target execution failed: provider setup rejected' },
  });
  const dossier = buildTargetDossier({
    runId: 'failed-target', disease: 'A disease', target: 'DYNAMIC1',
    factoryVersion: 'discovery-v1', status: 'FAILED', axes: {
      X: failedAxis('X'), Y: failedAxis('Y'), Z: failedAxis('Z'),
    },
  });

  assert.equal(dossier.x.state, DOSSIER_STATES.FAILED);
  assert.equal(dossier.y.state, DOSSIER_STATES.FAILED);
  assert.equal(dossier.z.state, DOSSIER_STATES.FAILED);
  for (const source of [
    dossier.x.clinical, dossier.x.companies, dossier.x.geography,
    dossier.y.identity, dossier.y.structures, dossier.z.patents, dossier.z.orphan,
  ]) {
    assert.equal(source.state, DOSSIER_STATES.NOT_RUN);
    assert.notEqual(source.suggested_action.type, 'RETRY');
  }
});

test('reports stale records under a failed source instead of presenting them as current evidence', () => {
  const run = modernRun();
  run.factoryVersion = 'v1';
  run.axes.X = {
    axis: 'X', status: 'STALE_HEALTHY', records: run.axes.X.sub_axes.company_pipeline.records,
    summary: { programs: 1 },
    validation: { status: 'FAIL', reason: 'company pipeline schema changed' },
  };
  const dossier = buildTargetDossier(run);
  assert.equal(dossier.x.state, DOSSIER_STATES.FAILED);
  assert.equal(dossier.x.companies.state, DOSSIER_STATES.FAILED);
  assert.equal(dossier.x.companies.records.length, 1, 'stale evidence remains inspectable');
  assert.equal(dossier.x.companies.suggested_action.type, 'RETRY');
});

test('supports legacy parent-axis records without inventing missing subaxes', () => {
  const legacy = {
    run_id: 'legacy-1', diseaseRunId: 'legacy-disease', candidateId: 'legacy-candidate',
    indication: 'Legacy disease', target: 'LEGACY1', factory_version: 'v1',
    status: 'HEALTHY', publish_status: 'PUBLISHED',
    axes: {
      X: { status: 'HEALTHY', records: [record('X', 'Legacy company program', 'https://company.example/legacy')], summary: {}, validation: { status: 'PASS' } },
      Y: { status: 'HEALTHY', records: [record('Y', 'Legacy structure', 'https://www.rcsb.org/structure/1ABC', { structure_id: '1ABC' })], summary: { uniprot_id: 'Q00001' }, validation: { status: 'PASS' } },
      Z: { status: 'HEALTHY', records: [record('Z', 'Legacy patent', 'https://data.epo.org/legacy', { publication_number: 'EP1' })], summary: {}, validation: { status: 'PASS' } },
    },
  };
  const before = structuredClone(legacy);
  const first = buildTargetDossier(legacy);
  const second = buildTargetDossier(legacy);

  assert.deepEqual(first, second, 'translation must be deterministic');
  assert.deepEqual(legacy, before, 'translation must not mutate a persisted run');
  assert.equal(first.run.id, 'legacy-1');
  assert.equal(first.subject.disease, 'Legacy disease');
  assert.equal(first.subject.uniprot_id, 'Q00001');
  assert.equal(first.discovery.state, DOSSIER_STATES.NOT_RUN);
  assert.equal(first.x.companies.state, DOSSIER_STATES.EVIDENCE_FOUND);
  assert.equal(first.x.clinical.state, DOSSIER_STATES.NOT_RUN);
  assert.equal(first.x.geography.state, DOSSIER_STATES.NOT_RUN);
  assert.equal(first.y.structures.state, DOSSIER_STATES.EVIDENCE_FOUND);
  assert.equal(first.y.identity.state, DOSSIER_STATES.NOT_RUN);
  assert.equal(first.z.patents.state, DOSSIER_STATES.EVIDENCE_FOUND);
  assert.equal(first.z.orphan.state, DOSSIER_STATES.NOT_RUN);
});

test('normalizes older discovery passage fields and deduplicates exact evidence', () => {
  const supporting = { text: 'Target support sentence.', source: 'Review', source_url: 'https://paper.example/review' };
  const dossier = buildTargetDossier({
    target: 'TARGET2', disease: 'Disease two',
    discoverySnapshot: {
      id: 'target2', name: 'TARGET2', score: 0.75,
      supporting_passages: [supporting, { ...supporting }],
      contradictory_passages: [{ text: 'Target was not associated.', source: 'Cohort', source_url: 'https://paper.example/cohort' }],
    },
  });
  assert.equal(dossier.discovery.state, DOSSIER_STATES.EVIDENCE_FOUND);
  assert.equal(dossier.discovery.score, 0.75);
  assert.equal(dossier.discovery.supporting_passages.length, 1);
  assert.equal(dossier.discovery.contradictory_passages[0].classification, 'CONTRADICTORY');
  assert.equal(dossier.discovery.sources.length, 2);
});

test('rejects non-object input', () => {
  assert.throws(() => buildTargetDossier(null), /target run must be an object/);
  assert.throws(() => buildTargetDossier([]), /target run must be an object/);
});
