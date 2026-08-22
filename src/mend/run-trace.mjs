/**
 * The run trace an operator reads before they read the answer.
 *
 * Every axis and sub-axis is a stage with its own gate. A stage that fails its checks is
 * marked degraded or failed rather than rendering thin data silently, and the reasons its
 * validator gave are carried through verbatim — no invented denominators, no rounded-off
 * "5/5 checks" that nothing actually counted.
 *
 * This is a read of the run record. It computes nothing the factory did not already decide.
 */

const AXES = ['X', 'Y', 'Z'];

const AXIS_LABELS = {
  X: 'X — Pipeline activity',
  Y: 'Y — Structural readiness',
  Z: 'Z — IP activity',
};

const SUB_AXIS_LABELS = {
  site_geography: 'X — Trial site geography',
  target_identity: 'Y — Target identity',
  orphan_exclusivity: 'Z — Orphan exclusivity',
};

const STAGE_STATUS = {
  HEALTHY: 'released',
  STALE_HEALTHY: 'degraded',
  UNAVAILABLE: 'failed',
};

/** Validators speak three dialects. Read all of them without pretending they are one. */
export function stageIssues(validation) {
  if (!validation || typeof validation !== 'object') return [];
  if (Array.isArray(validation.reasons)) return validation.reasons.map(String);
  if (Array.isArray(validation.issues)) return validation.issues.map(String);
  if (Array.isArray(validation.errors)) {
    return validation.errors.map((error) => (typeof error === 'string'
      ? error
      : [error.field, error.message].filter(Boolean).join(': ')));
  }
  if (validation.reason) return [String(validation.reason)];
  return [];
}

function gateStatus(validation) {
  if (!validation) return 'UNKNOWN';
  if (validation.status) return validation.status;
  if (typeof validation.valid === 'boolean') return validation.valid ? 'PASS' : 'FAIL';
  return 'UNKNOWN';
}

function stage({ id, label, status, validation, records, source, note }) {
  const issues = stageIssues(validation);
  return {
    id,
    label,
    status,
    gate: gateStatus(validation),
    records: records ?? 0,
    issues,
    issue_count: issues.length,
    source: source ?? null,
    note: note ?? null,
  };
}

/** Build the per-stage trace for one factory run. */
export function buildRunTrace(run) {
  const stages = [];

  for (const axis of AXES) {
    const result = run?.axes?.[axis];
    if (!result) continue;
    stages.push(stage({
      id: axis,
      label: AXIS_LABELS[axis] ?? axis,
      status: STAGE_STATUS[result.status] ?? 'failed',
      validation: result.validation,
      records: result.records?.length ?? 0,
      source: result.records?.[0]?.source_name ?? null,
      note: result.status === 'STALE_HEALTHY'
        ? 'Serving the last healthy snapshot; this run’s extraction was quarantined.'
        : null,
    }));

    for (const [subAxis, subResult] of Object.entries(result.sub_axes ?? {})) {
      const gate = gateStatus(subResult?.validation);
      stages.push(stage({
        id: `${axis}.${subAxis}`,
        label: SUB_AXIS_LABELS[subAxis] ?? `${axis} — ${subAxis}`,
        status: gate === 'PASS' ? 'released' : gate === 'UNKNOWN' ? 'degraded' : 'failed',
        validation: subResult?.validation,
        records: subResult?.records?.length ?? 0,
        source: subResult?.records?.[0]?.source_name ?? null,
      }));
    }
  }

  const counts = {
    released: stages.filter((item) => item.status === 'released').length,
    degraded: stages.filter((item) => item.status === 'degraded').length,
    failed: stages.filter((item) => item.status === 'failed').length,
  };

  return {
    runId: run?.runId ?? null,
    factoryVersion: run?.factoryVersion ?? null,
    mode: run?.mode ?? null,
    status: run?.status ?? 'NOT_RUN',
    publishStatus: run?.publishStatus ?? null,
    failedAxes: run?.failedAxes ?? [],
    stages,
    counts,
    stage_count: stages.length,
    issue_count: stages.reduce((total, item) => total + item.issue_count, 0),
  };
}
