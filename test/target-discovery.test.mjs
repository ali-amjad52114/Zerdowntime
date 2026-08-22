import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyTargetPassage, discoverTargets } from '../src/mend/discovery/targets.mjs';

const papers = [
  {
    id: 'paper-1',
    title: 'EGFR dependency in lung cancer',
    abstract: 'EGFR is required for tumor growth. Inhibition of EGFR reduced proliferation in the model.',
    source_url: 'https://example.org/papers/1',
  },
  {
    id: 'paper-2',
    title: 'ERBB1 response study',
    abstract: 'ERBB1 was associated with treatment response. KRAS was measured as a secondary biomarker.',
    source_url: 'https://example.org/papers/2',
  },
  {
    id: 'paper-3',
    title: 'Independent validation study',
    abstract: 'EGFR was not associated with survival in this cohort. KRAS was not required for the observed response.',
    source_url: 'https://example.org/papers/3',
  },
];

test('classifies passages with conservative, contradiction-first transparent rules', () => {
  assert.deepEqual(classifyTargetPassage('EGFR is required for tumor growth.'), {
    classification: 'SUPPORTING', reason: 'reported biological requirement',
  });
  assert.deepEqual(classifyTargetPassage('EGFR was not associated with survival.'), {
    classification: 'CONTRADICTORY', reason: 'explicit negation of a target relationship',
  });
  assert.deepEqual(classifyTargetPassage('KRAS was measured as a secondary biomarker.'), {
    classification: 'NEUTRAL', reason: 'candidate mentioned without an explicit directional claim',
  });
});

test('discovers disease-agnostic candidates, merges configured aliases, and preserves exact evidence', () => {
  const dossiers = discoverTargets(papers, {
    candidateLexicon: [{ name: 'EGFR', aliases: ['ERBB1'] }],
  });
  const egfr = dossiers.find((candidate) => candidate.name === 'EGFR');
  assert.ok(egfr);
  assert.deepEqual(egfr.aliases, ['EGFR', 'ERBB1']);
  assert.equal(egfr.ranking.supporting_evidence, 3);
  assert.equal(egfr.ranking.contradictory_evidence, 1);
  assert.equal(egfr.ranking.supporting_paper_diversity, 2);
  assert.ok(egfr.evidence.some((item) => item.passage === 'Inhibition of EGFR reduced proliferation in the model.'));
  assert.ok(egfr.evidence.every((item) => papers.some((paper) => paper.title.includes(item.passage) || paper.abstract.includes(item.passage))));
  assert.ok(dossiers.some((candidate) => candidate.name === 'KRAS'));
});

test('ranking rewards diverse support and penalizes explicit contradictions', () => {
  const dossiers = discoverTargets(papers, {
    candidateLexicon: [{ name: 'EGFR', aliases: ['ERBB1'] }, { name: 'KRAS' }],
    inferSymbols: false,
  });
  assert.equal(dossiers[0].name, 'EGFR');
  assert.equal(dossiers[0].rank, 1);
  assert.ok(dossiers[0].ranking.score > dossiers[1].ranking.score);
  assert.match(dossiers[0].ranking.formula, /contradictory evidence/);
});

test('annotations add explicit multi-word candidates while enforcing source-exact passages', () => {
  const annotatedPapers = [{
    id: 'paper-a',
    title: 'A candidate pathway in fibrosis',
    abstract: 'Transforming growth factor beta promotes fibrotic remodeling.',
    source_url: 'https://example.org/papers/a',
  }];
  const dossiers = discoverTargets(annotatedPapers, {
    inferSymbols: false,
    annotations: [{
      paper_id: 'paper-a',
      candidate: 'Transforming growth factor beta',
      aliases: ['TGF beta'],
      passages: ['Transforming growth factor beta promotes fibrotic remodeling.'],
    }],
  });
  assert.equal(dossiers[0].name, 'Transforming growth factor beta');
  assert.equal(dossiers[0].evidence[0].origin, 'text');
  assert.equal(dossiers[0].evidence[0].classification, 'SUPPORTING');
  assert.throws(() => discoverTargets(annotatedPapers, {
    inferSymbols: false,
    annotations: [{ paper_id: 'paper-a', candidate: 'TGF beta', passages: ['Invented passage.'] }],
  }), /not an exact passage/);
});

test('validates normalized paper identity and supports bounded candidate output', () => {
  assert.throws(() => discoverTargets([{ id: 'bad', title: 'Missing URL', abstract: '' }]), /requires id, title, and source_url/);
  const dossiers = discoverTargets(papers, { maxCandidates: 1 });
  assert.equal(dossiers.length, 1);
  assert.throws(() => discoverTargets(papers, { maxCandidates: 0 }), /positive integer/);
});

