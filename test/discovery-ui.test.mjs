import assert from 'node:assert/strict';
import test from 'node:test';
import { renderDiscoveryView } from '../src/mend/discovery/ui.mjs';

const state = {
  disease: 'Alpha-1 Antitrypsin Deficiency',
  status: 'review_required',
  corpus: {
    status: 'ready',
    resources: [
      { id: 'paper-1', title: 'SERPINA1 review', type: 'paper', status: 'parsed', source_url: 'https://example.org/paper' },
      { id: 'trial-1', title: 'Trial registry record', type: 'registry', source_url: 'https://example.org/trial' },
    ],
  },
  candidates: [{
    id: 'SERPINA1',
    name: 'SERPINA1',
    score: 0.91,
    rationale: 'Direct disease association with therapeutic activity.',
    supporting_passages: [{ text: 'SERPINA1 variants cause AATD.', source: 'Review', source_url: 'https://example.org/support' }],
    contradictory_passages: [{ text: 'Response may depend on genotype.', source: 'Study', source_url: 'https://example.org/contradiction' }],
  }],
  selection: { selected_candidate_ids: ['SERPINA1'] },
  handoff: { status: 'ready', axes: { X: 'queued', Y: { status: 'waiting' }, Z: 'waiting' } },
};

test('renders discovery input, corpus, scored evidence, selection, and X/Y/Z handoff', () => {
  const html = renderDiscoveryView(state);
  assert.match(html, /Disease or indication/);
  assert.match(html, /Start research/);
  assert.match(html, /SERPINA1 review/);
  assert.match(html, /2[\s\S]*papers and resources/);
  assert.match(html, /91%/);
  assert.match(html, /Supporting passages/);
  assert.match(html, /SERPINA1 variants cause AATD/);
  assert.match(html, /Contradictory passages/);
  assert.match(html, /Response may depend on genotype/);
  assert.match(html, /data-candidate-select[\s\S]*\schecked/);
  assert.match(html, /Analyze Target/);
  assert.match(html, /Hand off to X\/Y\/Z/);
  assert.match(html, />X<[\s\S]*>Y<[\s\S]*>Z</);
  assert.match(html, /\/mend\/discovery\/start/);
  assert.match(html, /\/mend\/discovery\/select/);
  assert.match(html, /\/mend\/discovery\/handoff/);
});

test('renders a safe empty state and escapes untrusted research content', () => {
  const html = renderDiscoveryView({ disease: '<script>alert(1)</script>', candidates: [{ id: 'bad" onclick="alert(1)', name: '<img src=x>', score: null, supporting: [{ text: '<b>claim</b>', source_url: 'javascript:alert(1)' }] }] });
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /&lt;b&gt;claim&lt;\/b&gt;/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /href="#"/);
  assert.match(html, /No papers or resources have been collected yet/);
  assert.match(html, /No contradictory passage was found/);
  assert.match(html, /Hand off to X\/Y\/Z/);
});

test('renders the native discovery dossier ranking and classified exact passages', () => {
  const html = renderDiscoveryView({
    candidates: [{
      candidate_id: 'SERPINA1',
      name: 'SERPINA1',
      ranking: { score: 7, formula: 'transparent ranking formula' },
      evidence: [
        { classification: 'SUPPORTING', passage: 'SERPINA1 is associated with AATD.', paper_title: 'Paper A', source_url: 'https://example.org/a' },
        { classification: 'CONTRADICTORY', passage: 'One cohort found no association.', paper_title: 'Paper B', source_url: 'https://example.org/b' },
      ],
    }],
  });
  assert.match(html, /Candidate score 7/);
  assert.match(html, /transparent ranking formula/);
  assert.match(html, /SERPINA1 is associated with AATD/);
  assert.match(html, /One cohort found no association/);
  assert.match(html, />Paper A</);
  assert.match(html, />Paper B</);
});
