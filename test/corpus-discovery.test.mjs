import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  discoverDiseaseCorpus,
  normalizeGeneProteinAnnotations,
  normalizeEuropePmcResults,
} from '../src/mend/discovery/corpus.mjs';

const fixture = JSON.parse(await readFile(
  new URL('../fixtures/discovery/europe-pmc-aatd.json', import.meta.url),
  'utf8',
));

test('retrieves a bounded disease-only Europe PMC corpus through injected fetch', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => fixture };
  };

  const corpus = await discoverDiseaseCorpus({
    disease: 'Alpha-1 Antitrypsin Deficiency',
    maxPapers: 2,
    fetchImpl,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.searchParams.get('pageSize'), '2');
  assert.equal(calls[0].url.searchParams.get('query'), '"Alpha-1 Antitrypsin Deficiency"');
  assert.equal(calls[0].options.method, 'GET');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.equal(corpus.disease, 'Alpha-1 Antitrypsin Deficiency');
  assert.equal(corpus.papers.length, 2);
  assert.equal(corpus.source.hitCount, 4);
});

test('normalizes Europe PMC gene/protein annotations into a target lexicon', () => {
  const lexicon = normalizeGeneProteinAnnotations([{
    source: 'MED', extId: '1', annotations: [{
      exact: 'SERPINA1', type: 'Gene_Proteins',
      tags: [{ name: 'Alpha-1-antitrypsin', uri: 'https://www.uniprot.org/uniprotkb/P01009/entry' }],
    }, {
      exact: 'alpha-1 antitrypsin', type: 'Gene_Proteins',
      tags: [{ name: 'Alpha-1-antitrypsin', uri: 'https://www.uniprot.org/uniprotkb/P01009/entry' }],
    }],
  }]);
  assert.equal(lexicon.length, 1);
  assert.equal(lexicon[0].name, 'SERPINA1');
  assert.deepEqual(lexicon[0].aliases, ['SERPINA1']);
});

test('normalizes publications, preserves source metadata, and removes duplicates', () => {
  const papers = normalizeEuropePmcResults(fixture.resultList.result, { maxPapers: 10 });

  assert.equal(papers.length, 3);
  assert.deepEqual(papers[0].authors, ['Ada Researcher', 'Ben Scientist']);
  assert.equal(papers[0].year, 2025);
  assert.equal(papers[0].publicationIdentifiers.doi, '10.1000/aatd.2025.001');
  assert.equal(papers[0].sourceUrl, 'https://europepmc.org/article/PMC/PMC12000001');
  assert.deepEqual(papers[0].sourceMetadata, {
    provider: 'Europe PMC',
    source: 'MED',
    journal: 'Rare Disease Research',
    publicationType: 'review',
    citedByCount: 12,
    openAccess: true,
  });
  assert.equal(papers[1].year, 2024);
  assert.equal(papers[2].year, 2023);
});

test('rejects invalid input and unsuccessful or malformed source responses', async () => {
  await assert.rejects(() => discoverDiseaseCorpus({ disease: '', fetchImpl: async () => ({}) }), /disease is required/);
  await assert.rejects(() => discoverDiseaseCorpus({ disease: 'AATD', maxPapers: 0, fetchImpl: async () => ({}) }), /positive integer/);
  await assert.rejects(
    () => discoverDiseaseCorpus({ disease: 'AATD', fetchImpl: async () => ({ ok: false, status: 503 }) }),
    /status 503/,
  );
  await assert.rejects(
    () => discoverDiseaseCorpus({ disease: 'AATD', fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }),
    /resultList\.result/,
  );
});

test('caps live page size at the corpus safety limit', async () => {
  let requestedPageSize;
  await discoverDiseaseCorpus({
    disease: 'AATD',
    maxPapers: 1000,
    fetchImpl: async (url) => {
      requestedPageSize = url.searchParams.get('pageSize');
      return { ok: true, json: async () => ({ hitCount: 0, resultList: { result: [] } }) };
    },
  });
  assert.equal(requestedPageSize, '100');
});
