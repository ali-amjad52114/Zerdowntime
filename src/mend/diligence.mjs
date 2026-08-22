import { randomUUID } from 'node:crypto';

const DECISIONS = new Set(['PROCEED_TO_FOCUSED_DILIGENCE', 'HOLD', 'ESCALATE']);

function requiredText(value, field) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${field} is required`);
  return text;
}

function evidenceReferences(records = []) {
  return records.map((record) => ({
    axis: record.axis,
    subject: record.subject,
    value: record.value,
    source_url: record.source_url,
  }));
}

function axisCount(run, axis, summaryKeys) {
  const result = run.axes[axis];
  for (const key of summaryKeys) {
    const value = Number(result.summary?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return result.records.length;
}

function deriveSignals(run) {
  const programs = axisCount(run, 'X', ['programsFound', 'programs']);
  const structures = axisCount(run, 'Y', ['experimental_structures', 'structures']);
  const publications = axisCount(run, 'Z', ['relevant_records', 'patents']);
  const bestResolution = run.axes.Y.summary?.best_resolution_angstrom ?? null;

  return {
    X: {
      code: programs >= 5 ? 'ACTIVE_COMPETITIVE_LANDSCAPE' : programs > 0 ? 'VISIBLE_PIPELINE_ACTIVITY' : 'NO_VISIBLE_ACTIVITY',
      value: programs,
      interpretation: programs >= 5
        ? 'Multiple visible programs justify a modality, stage, and differentiation review.'
        : 'Visible programs should be reviewed before drawing a competition conclusion.',
    },
    Y: {
      code: structures > 0 ? 'EXPERIMENTAL_FOUNDATION_PRESENT' : 'STRUCTURAL_EVIDENCE_GAP',
      value: structures,
      best_resolution_angstrom: bestResolution,
      interpretation: structures > 0
        ? 'Experimental structures support a focused structural opportunity and gap assessment.'
        : 'No validated structures were available for the current assessment.',
    },
    Z: {
      code: publications > 0 ? 'IP_COUNSEL_TRIAGE_REQUIRED' : 'NO_VISIBLE_IP_ACTIVITY',
      value: publications,
      interpretation: publications > 0
        ? 'Visible publications should be triaged by qualified IP counsel before stronger conclusions are made.'
        : 'Absence in this bounded search is not evidence of freedom to operate.',
    },
  };
}

function task({ id, axis, title, objective, deliverable, records }) {
  return {
    id,
    axis,
    title,
    objective,
    deliverable,
    status: 'OPEN',
    evidence: evidenceReferences(records),
    completion: null,
  };
}

export function createDiligenceWorkflow(run, options = {}) {
  if (!run || run.status !== 'HEALTHY' || run.publishStatus !== 'PUBLISHED') {
    throw new Error('a healthy published Mend run is required to create a diligence workflow');
  }
  const createdAt = options.createdAt ?? new Date().toISOString();
  const signals = deriveSignals(run);
  const tasks = [
    task({
      id: 'review-competitive-landscape',
      axis: 'X',
      title: 'Review competitive programs',
      objective: 'Compare the visible programs by organization, modality, development stage, and differentiation hypothesis.',
      deliverable: 'A reviewed competitor table with material gaps and follow-up sources.',
      records: run.axes.X.records,
    }),
    task({
      id: 'assess-structural-opportunity',
      axis: 'Y',
      title: 'Assess structural opportunity',
      objective: 'Determine what the available structures cover and identify variants, conformations, ligands, or complexes still missing.',
      deliverable: 'A structural coverage memo with experiment or modeling recommendations.',
      records: run.axes.Y.records,
    }),
    task({
      id: 'triage-ip-publications',
      axis: 'Z',
      title: 'Triage visible IP activity',
      objective: 'Have qualified counsel classify the visible publications and identify families requiring claim-level review.',
      deliverable: 'An attorney-reviewed triage list; not a freedom-to-operate opinion.',
      records: run.axes.Z.records,
    }),
  ];

  return {
    id: options.id ?? randomUUID(),
    runId: run.runId,
    factoryVersion: run.factoryVersion,
    createdAt,
    updatedAt: createdAt,
    status: 'IN_PROGRESS',
    recommendation: {
      code: 'PROCEED_TO_FOCUSED_DILIGENCE',
      confidence: 'MEDIUM',
      summary: 'The current evidence supports focused diligence, not a target-selection, clinical, investment, or legal conclusion.',
      reasons: [signals.X.interpretation, signals.Y.interpretation, signals.Z.interpretation],
      gaps: [
        'Program modality, stage, and outcome evidence require analyst review.',
        'Disease relevance and structural coverage require scientific review.',
        'Patent claims and family relationships require qualified legal review.',
      ],
    },
    signals,
    tasks,
    decision: null,
    history: [{ type: 'WORKFLOW_CREATED', at: createdAt, actor: 'mend-system', runId: run.runId }],
  };
}

export function completeDiligenceTask(workflow, input = {}) {
  if (!workflow || workflow.status === 'DECIDED') throw new Error('diligence workflow is not actionable');
  const taskId = requiredText(input.taskId, 'taskId');
  const actor = requiredText(input.actor, 'actor');
  const finding = requiredText(input.finding, 'finding');
  const existing = workflow.tasks.find((item) => item.id === taskId);
  if (!existing) throw new Error(`unknown diligence task ${taskId}`);
  if (existing.status === 'COMPLETE') throw new Error(`diligence task ${taskId} is already complete`);
  const completedAt = input.completedAt ?? new Date().toISOString();
  const tasks = workflow.tasks.map((item) => item.id === taskId ? {
    ...item,
    status: 'COMPLETE',
    completion: { actor, finding, completedAt },
  } : item);
  const status = tasks.every((item) => item.status === 'COMPLETE') ? 'READY_FOR_DECISION' : 'IN_PROGRESS';
  return {
    ...workflow,
    status,
    updatedAt: completedAt,
    tasks,
    history: [...workflow.history, { type: 'TASK_COMPLETED', at: completedAt, actor, taskId }],
  };
}

export function recordDiligenceDecision(workflow, input = {}) {
  if (!workflow || workflow.status !== 'READY_FOR_DECISION') {
    throw new Error('all diligence tasks must be complete before recording a decision');
  }
  const decision = requiredText(input.decision, 'decision').toUpperCase();
  if (!DECISIONS.has(decision)) throw new Error('decision must be PROCEED_TO_FOCUSED_DILIGENCE, HOLD, or ESCALATE');
  const actor = requiredText(input.actor, 'actor');
  const rationale = requiredText(input.rationale, 'rationale');
  const decidedAt = input.decidedAt ?? new Date().toISOString();
  return {
    ...workflow,
    status: 'DECIDED',
    updatedAt: decidedAt,
    decision: { decision, actor, rationale, decidedAt },
    history: [...workflow.history, { type: 'DECISION_RECORDED', at: decidedAt, actor, decision }],
  };
}
