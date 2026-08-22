const EUROPE_PMC_SEARCH_URL = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
const DEFAULT_MAX_PAPERS = 25;
const MAX_PAPERS_LIMIT = 100;
const REQUEST_TIMEOUT_MS = 20_000;
const ANNOTATION_TIMEOUT_MS = 20_000;
const EUROPE_PMC_ANNOTATIONS_URL = 'https://www.ebi.ac.uk/europepmc/annotations_api/annotationsByArticleIds';

function clean(value) {
  const normalized = String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || null;
}

function boundedMaxPapers(value) {
  const parsed = Number.parseInt(value ?? DEFAULT_MAX_PAPERS, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new RangeError('maxPapers must be a positive integer');
  }
  return Math.min(parsed, MAX_PAPERS_LIMIT);
}

function publicationYear(result) {
  const candidate = result.pubYear
    ?? result.journalInfo?.yearOfPublication
    ?? result.journalInfo?.printPublicationDate
    ?? result.firstPublicationDate;
  const match = String(candidate ?? '').match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function authors(result) {
  const entries = result.authorList?.author ?? [];
  if (Array.isArray(entries) && entries.length > 0) {
    return entries
      .map((author) => clean(author.fullName ?? [author.firstName, author.lastName].filter(Boolean).join(' ')))
      .filter(Boolean);
  }
  return String(result.authorString ?? '')
    .split(/,|;/)
    .map(clean)
    .filter(Boolean);
}

function identifiers(result) {
  return Object.fromEntries(Object.entries({
    pmid: clean(result.pmid),
    pmcid: clean(result.pmcid),
    doi: clean(result.doi)?.toLowerCase() ?? null,
    europePmcId: clean(result.id),
  }).filter(([, value]) => value));
}

function publicationUrl(ids, result) {
  if (ids.pmcid) return `https://europepmc.org/article/PMC/${encodeURIComponent(ids.pmcid)}`;
  if (ids.pmid) return `https://europepmc.org/article/MED/${encodeURIComponent(ids.pmid)}`;
  if (ids.europePmcId && result.source) {
    return `https://europepmc.org/article/${encodeURIComponent(result.source)}/${encodeURIComponent(ids.europePmcId)}`;
  }
  if (ids.doi) return `https://doi.org/${ids.doi}`;
  return 'https://europepmc.org/';
}

/** Normalize one Europe PMC core result without inferring absent metadata. */
export function normalizeEuropePmcPaper(result) {
  const publicationIdentifiers = identifiers(result);
  const sourceUrl = publicationUrl(publicationIdentifiers, result);
  const id = publicationIdentifiers.pmid
    ?? publicationIdentifiers.pmcid
    ?? publicationIdentifiers.doi
    ?? publicationIdentifiers.europePmcId;

  return {
    id,
    title: clean(result.title),
    abstract: clean(result.abstractText),
    authors: authors(result),
    year: publicationYear(result),
    publicationIdentifiers,
    sourceUrl,
    source_url: sourceUrl,
    sourceMetadata: {
      provider: 'Europe PMC',
      source: clean(result.source),
      journal: clean(result.journalTitle ?? result.journalInfo?.journal?.title),
      publicationType: clean(result.pubType),
      citedByCount: Number.isFinite(Number(result.citedByCount)) ? Number(result.citedByCount) : null,
      openAccess: result.isOpenAccess === 'Y' ? true : result.isOpenAccess === 'N' ? false : null,
    },
  };
}

function deduplicationKey(paper) {
  const ids = paper.publicationIdentifiers;
  if (ids.doi) return `doi:${ids.doi}`;
  if (ids.pmid) return `pmid:${ids.pmid}`;
  if (ids.pmcid) return `pmcid:${ids.pmcid}`;
  if (ids.europePmcId) return `epmc:${ids.europePmcId}`;
  return `title:${paper.title?.toLowerCase() ?? ''}|year:${paper.year ?? ''}`;
}

export function normalizeEuropePmcResults(results, { maxPapers = DEFAULT_MAX_PAPERS } = {}) {
  const limit = boundedMaxPapers(maxPapers);
  const seen = new Set();
  const papers = [];

  for (const result of Array.isArray(results) ? results : []) {
    const paper = normalizeEuropePmcPaper(result);
    if (!paper.title) continue;
    const key = deduplicationKey(paper);
    if (seen.has(key)) continue;
    seen.add(key);
    papers.push(paper);
    if (papers.length === limit) break;
  }
  return papers;
}

export function normalizeGeneProteinAnnotations(payload) {
  const symbols = new Map();
  for (const article of Array.isArray(payload) ? payload : []) {
    for (const annotation of article?.annotations ?? []) {
      if (annotation?.type !== 'Gene_Proteins') continue;
      const exact = clean(annotation.exact);
      if (!exact || !/^[A-Z][A-Z0-9-]{2,11}$/.test(exact) || !/[A-Z]/.test(exact)) continue;
      if (/^[IVXLCDM]+$/.test(exact)) continue;
      symbols.set(exact.toLowerCase(), exact);
    }
  }
  return [...symbols.values()].map((name) => ({ name, aliases: [name] }));
}

async function discoverGeneProteinLexicon(papers, fetchImpl) {
  const articleIds = papers.map((paper) => {
    const ids = paper.publicationIdentifiers ?? {};
    if (ids.pmid) return `MED:${ids.pmid}`;
    if (ids.pmcid) return `PMC:${ids.pmcid}`;
    return null;
  }).filter(Boolean);
  if (!articleIds.length) return [];
  const batches = [];
  for (let index = 0; index < articleIds.length; index += 8) batches.push(articleIds.slice(index, index + 8));
  const settled = await Promise.allSettled(batches.map(async (batch) => {
    const url = new URL(EUROPE_PMC_ANNOTATIONS_URL);
    url.searchParams.set('articleIds', batch.join(','));
    url.searchParams.set('type', 'Gene_Proteins');
    url.searchParams.set('format', 'JSON');
    const response = await fetchImpl(url, {
      method: 'GET', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(ANNOTATION_TIMEOUT_MS),
    });
    if (!response?.ok) throw new Error(`Europe PMC annotations request failed with status ${response?.status ?? 'unknown'}`);
    return response.json();
  }));
  const payloads = settled.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  return normalizeGeneProteinAnnotations(payloads.flat());
}

/**
 * Fetch a disease-only literature corpus with one bounded Europe PMC request.
 * fetchImpl is injectable so callers can use platform fetch and tests can stay
 * deterministic. The query deliberately contains no fixed target term.
 */
export async function discoverDiseaseCorpus({
  disease,
  maxPapers = DEFAULT_MAX_PAPERS,
  fetchImpl = globalThis.fetch,
  includeAnnotations = false,
} = {}) {
  const normalizedDisease = clean(disease);
  if (!normalizedDisease) throw new TypeError('disease is required');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  const limit = boundedMaxPapers(maxPapers);

  const url = new URL(EUROPE_PMC_SEARCH_URL);
  url.searchParams.set('query', `\"${normalizedDisease.replaceAll('"', '\\"')}\"`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('resultType', 'core');
  url.searchParams.set('pageSize', String(limit));

  let response;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetchImpl(url, {
        method: 'GET', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response?.ok) break;
      lastError = new Error(`Europe PMC request failed with status ${response?.status ?? 'unknown'}`);
    } catch (error) {
      lastError = error;
    }
  }
  if (!response?.ok && lastError) throw lastError;
  if (!response?.ok) {
    throw new Error(`Europe PMC request failed with status ${response?.status ?? 'unknown'}`);
  }

  const payload = await response.json();
  const rawResults = payload?.resultList?.result;
  if (!Array.isArray(rawResults)) throw new Error('Europe PMC response is missing resultList.result');

  const papers = normalizeEuropePmcResults(rawResults, { maxPapers: limit });
  const candidateLexicon = includeAnnotations ? await discoverGeneProteinLexicon(papers, fetchImpl) : [];
  return {
    disease: normalizedDisease,
    papers,
    candidateLexicon,
    source: {
      provider: 'Europe PMC',
      requestUrl: url.toString(),
      hitCount: Number.isFinite(Number(payload.hitCount)) ? Number(payload.hitCount) : null,
    },
  };
}
