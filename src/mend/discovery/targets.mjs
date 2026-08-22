const GENERIC_UPPERCASE_TERMS = new Set([
  'ABSTRACT', 'BACKGROUND', 'CONCLUSION', 'CONCLUSIONS', 'DNA', 'RNA', 'MRNA', 'CRISPR',
  'PCR', 'ELISA', 'MRI', 'CT', 'PET', 'FDA', 'EMA', 'WHO', 'AUC', 'CI', 'HR', 'OR',
  'AND', 'THE', 'WITH', 'WITHOUT', 'RESULTS', 'METHODS', 'OBJECTIVE', 'STUDY', 'TRIAL',
]);

const CONTRADICTORY_RULES = [
  ['explicit absence of evidence or effect', /\b(?:no|without)\s+(?:clear\s+|convincing\s+|significant\s+)?(?:evidence|association|correlation|effect|benefit|dependency)\b/i],
  ['explicit negation of a target relationship', /\bnot\s+(?:associated|correlated|required|essential|effective|supported|implicated|predictive|causal)\b/i],
  ['failed experimental relationship', /\bfailed\s+to\b/i],
  ['target-independent result', /\bindependent\s+of\b/i],
  ['target described as dispensable', /\bdispensable\b/i],
  ['target relationship described as unlikely', /\bunlikely\s+to\b/i],
  ['explicitly contradictory result', /\bcontradict(?:s|ed|ory|ion)?\b/i],
];

const SUPPORTING_RULES = [
  ['explicit target nomination', /\b(?:therapeutic|drug|treatment|promising|validated|actionable)\s+target\b/i],
  ['reported association', /\b(?:associated|correlated|linked)\s+with\b/i],
  ['reported disease or phenotype role', /\b(?:drives?|promotes?|mediates?|causes?|contributes?\s+to|implicated\s+in)\b/i],
  ['reported biological requirement', /\b(?:required|essential)\s+for\b/i],
  ['reported dependency', /\bdepend(?:s|ent|ence|ency)\s+(?:on|upon)\b/i],
  ['reported perturbation response', /\b(?:inhibition|inhibiting|knockdown|silencing|deletion|blockade)\b.{0,80}\b(?:reduced|suppressed|prevented|improved|reversed|attenuated)\b/i],
  ['reported molecular interaction or activation', /\b(?:binds?|activates?|inhibits?)\b/i],
  ['reported altered abundance', /\b(?:overexpressed|upregulated|downregulated|elevated)\b/i],
  ['reported causal or pathogenic status', /\b(?:causal|pathogenic|driver)\b/i],
];

function normalizedAlias(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function candidateId(value) {
  return normalizedAlias(value).replace(/\s+/g, '-');
}

function exactSentences(text) {
  const source = String(text ?? '');
  return (source.match(/[^.!?\n]+(?:[.!?]+|(?=\n|$))/g) ?? [])
    .map((passage) => passage.trim())
    .filter(Boolean);
}

function compileAliasPattern(alias) {
  const escaped = String(alias).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}(?=$|[^A-Za-z0-9])`, 'i');
}

function aliasAppears(passage, alias) {
  return compileAliasPattern(alias).test(passage);
}

function validatePapers(papers) {
  if (!Array.isArray(papers)) throw new Error('papers must be an array');
  return papers.map((paper, index) => {
    const id = String(paper?.id ?? '').trim();
    const title = String(paper?.title ?? '').trim();
    const abstract = String(paper?.abstract ?? '').trim();
    const sourceUrl = String(paper?.source_url ?? '').trim();
    if (!id || !title || !sourceUrl) {
      throw new Error(`paper ${index} requires id, title, and source_url`);
    }
    return { ...paper, id, title, abstract, source_url: sourceUrl };
  });
}

function normalizeLexicon(lexicon) {
  return (lexicon ?? []).map((entry, index) => {
    if (typeof entry === 'string') return { name: entry, aliases: [entry] };
    const name = String(entry?.name ?? entry?.canonical ?? '').trim();
    if (!name) throw new Error(`candidate lexicon entry ${index} requires name or canonical`);
    return { name, aliases: [...new Set([name, ...(entry.aliases ?? [])].map(String).map((alias) => alias.trim()).filter(Boolean))] };
  });
}

function normalizeAnnotations(annotations) {
  return (annotations ?? []).map((annotation, index) => {
    const paperId = String(annotation?.paper_id ?? '').trim();
    const name = String(annotation?.candidate ?? annotation?.name ?? '').trim();
    if (!paperId || !name) throw new Error(`annotation ${index} requires paper_id and candidate`);
    return {
      paperId,
      name,
      aliases: [...new Set([name, ...(annotation.aliases ?? [])].map(String).map((alias) => alias.trim()).filter(Boolean))],
      passages: (annotation.passages ?? []).map(String),
    };
  });
}

function inferredSymbols(papers) {
  const symbols = new Set();
  for (const paper of papers) {
    const text = `${paper.title}\n${paper.abstract}`;
    for (const match of text.matchAll(/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*\b/g)) {
      const symbol = match[0];
      const compact = symbol.replace(/-/g, '');
      if (compact.length < 2 || compact.length > 12 || GENERIC_UPPERCASE_TERMS.has(symbol)) continue;
      if (!/[A-Z]/.test(compact) || (!/\d/.test(compact) && compact.length < 3)) continue;
      symbols.add(symbol);
    }
  }
  return [...symbols].map((name) => ({ name, aliases: [name] }));
}

function buildCandidateRegistry(entries) {
  const parent = new Map();
  const display = new Map();
  const aliasesByRoot = new Map();

  const find = (key) => {
    const next = parent.get(key);
    if (next === key) return key;
    const root = find(next);
    parent.set(key, root);
    return root;
  };
  const ensure = (alias) => {
    const key = normalizedAlias(alias);
    if (key && !parent.has(key)) {
      parent.set(key, key);
      display.set(key, alias);
      aliasesByRoot.set(key, new Set([alias]));
    }
    return key;
  };
  const unite = (left, right, preferredName) => {
    const leftRoot = find(ensure(left));
    const rightRoot = find(ensure(right));
    if (leftRoot === rightRoot) return;
    parent.set(rightRoot, leftRoot);
    for (const alias of aliasesByRoot.get(rightRoot) ?? []) aliasesByRoot.get(leftRoot).add(alias);
    aliasesByRoot.delete(rightRoot);
    display.set(leftRoot, preferredName);
  };

  for (const entry of entries) {
    const canonicalKey = ensure(entry.name);
    display.set(canonicalKey, entry.name);
    for (const alias of entry.aliases) {
      ensure(alias);
      unite(entry.name, alias, entry.name);
      aliasesByRoot.get(find(canonicalKey)).add(alias);
    }
  }

  const uniqueRoots = [...new Set([...parent.keys()].map(find))];
  return uniqueRoots.map((root) => ({
    key: root,
    name: display.get(root),
    aliases: [...aliasesByRoot.get(root)],
  }));
}

/** Classify one exact passage using contradiction-first, inspectable rules. */
export function classifyTargetPassage(passage) {
  for (const [reason, pattern] of CONTRADICTORY_RULES) {
    if (pattern.test(passage)) return { classification: 'CONTRADICTORY', reason };
  }
  for (const [reason, pattern] of SUPPORTING_RULES) {
    if (pattern.test(passage)) return { classification: 'SUPPORTING', reason };
  }
  return { classification: 'NEUTRAL', reason: 'candidate mentioned without an explicit directional claim' };
}

function scoreDossier(evidence) {
  const counts = { SUPPORTING: 0, CONTRADICTORY: 0, NEUTRAL: 0 };
  const supportingPapers = new Set();
  const allPapers = new Set();
  for (const item of evidence) {
    counts[item.classification] += 1;
    allPapers.add(item.paper_id);
    if (item.classification === 'SUPPORTING') supportingPapers.add(item.paper_id);
  }
  // Reward replicated support; penalize explicit contradictions more heavily than neutral mentions.
  const score = (counts.SUPPORTING * 2) + (supportingPapers.size * 2) + allPapers.size - (counts.CONTRADICTORY * 3);
  return {
    score,
    supporting_evidence: counts.SUPPORTING,
    contradictory_evidence: counts.CONTRADICTORY,
    neutral_evidence: counts.NEUTRAL,
    paper_diversity: allPapers.size,
    supporting_paper_diversity: supportingPapers.size,
    formula: '(supporting evidence × 2) + (supporting paper diversity × 2) + paper diversity − (contradictory evidence × 3)',
  };
}

/**
 * Discover and rank target dossiers from normalized papers.
 * Lexicon and annotations improve recall and provide explicit alias relationships;
 * conservative symbol extraction supplies a dependency-free baseline.
 */
export function discoverTargets(papers, {
  candidateLexicon = [],
  annotations = [],
  inferSymbols = true,
  maxCandidates = 50,
} = {}) {
  const normalizedPapers = validatePapers(papers);
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1) throw new Error('maxCandidates must be a positive integer');
  const normalizedAnnotations = normalizeAnnotations(annotations);
  const entries = [
    ...normalizeLexicon(candidateLexicon),
    ...normalizedAnnotations.map(({ name, aliases }) => ({ name, aliases })),
    ...(inferSymbols ? inferredSymbols(normalizedPapers) : []),
  ];
  const registry = buildCandidateRegistry(entries);
  const paperById = new Map(normalizedPapers.map((paper) => [paper.id, paper]));
  const annotationByCandidate = new Map();
  for (const annotation of normalizedAnnotations) {
    const candidate = registry.find((item) => item.aliases.some((alias) => annotation.aliases.some((candidateAlias) => normalizedAlias(alias) === normalizedAlias(candidateAlias))));
    if (!candidate) continue;
    const list = annotationByCandidate.get(candidate.key) ?? [];
    list.push(annotation);
    annotationByCandidate.set(candidate.key, list);
  }

  const dossiers = [];
  for (const candidate of registry) {
    const evidence = [];
    const seen = new Set();
    const addEvidence = (paper, passage, matchedAlias, origin) => {
      const key = `${paper.id}\0${passage}`;
      if (seen.has(key)) return;
      seen.add(key);
      evidence.push({
        paper_id: paper.id,
        paper_title: paper.title,
        source_url: paper.source_url,
        passage,
        matched_alias: matchedAlias,
        origin,
        ...classifyTargetPassage(passage),
      });
    };

    for (const paper of normalizedPapers) {
      for (const passage of exactSentences(`${paper.title}\n${paper.abstract}`)) {
        const matchedAlias = candidate.aliases.find((alias) => aliasAppears(passage, alias));
        if (matchedAlias) addEvidence(paper, passage, matchedAlias, 'text');
      }
    }
    for (const annotation of annotationByCandidate.get(candidate.key) ?? []) {
      const paper = paperById.get(annotation.paperId);
      if (!paper) throw new Error(`annotation references unknown paper ${annotation.paperId}`);
      for (const passage of annotation.passages) {
        if (!paper.title.includes(passage) && !paper.abstract.includes(passage)) {
          throw new Error(`annotated passage is not an exact passage from paper ${paper.id}`);
        }
        addEvidence(paper, passage, annotation.name, 'annotation');
      }
    }
    if (evidence.length === 0) continue;
    const ranking = scoreDossier(evidence);
    dossiers.push({
      candidate_id: candidateId(candidate.name),
      name: candidate.name,
      aliases: [...new Set(candidate.aliases)].sort((a, b) => a.localeCompare(b)),
      ranking,
      evidence,
    });
  }

  dossiers.sort((left, right) => right.ranking.score - left.ranking.score
    || right.ranking.supporting_paper_diversity - left.ranking.supporting_paper_diversity
    || left.name.localeCompare(right.name));
  return dossiers.slice(0, maxCandidates).map((dossier, index) => ({ ...dossier, rank: index + 1 }));
}

