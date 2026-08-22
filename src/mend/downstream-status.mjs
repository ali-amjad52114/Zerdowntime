/**
 * Break propagation for the five downstream/derived sections — a sibling of `run-trace.mjs`,
 * same discipline: this reads the run's own trace and computes nothing the factory did not
 * already decide about its own axes and sub-axes.
 *
 * A downstream section is never fed into `buildRunTrace`'s own `stages` array — that stays a
 * pure read of what the factory itself validated, and the existing tests assert exact counts
 * against the real six-stage trace. This module produces a second, clearly separate rollup for
 * the UI's "Derived / downstream" section, in a shape that's a structural match for
 * `run-trace.mjs`'s own `stage()` object, so `ui.mjs`'s existing `panel()` helper renders it
 * with zero changes.
 *
 * Every dependency below names the exact stage id a downstream section's formula actually
 * reads — never "the axis it's roughly under." A degraded parent axis does not automatically
 * degrade its sub-axis (`vertical-slice.mjs`'s `executeAxis` only re-runs sub-axes on the
 * success path; on failure it carries the previous run's sub-axis output forward untouched),
 * so getting this wrong would either wrongly clear a section that should read degraded, or
 * wrongly flag one that's genuinely unaffected.
 */

export const DOWNSTREAM_LABELS = Object.freeze({
  product_positioning: 'Product positioning',
  go_to_market: 'Go-to-market strategy',
  insight_generalization: 'Insight generalization',
  revenue_forecast: 'Revenue — illustrative planning model',
  resourcing: 'Resourcing',
});

/** Which exact stage ids each downstream section's formula actually reads. */
export const DOWNSTREAM_DEPENDENCIES = Object.freeze({
  product_positioning: Object.freeze(['X']),
  go_to_market: Object.freeze(['X.site_geography', 'Z.orphan_exclusivity']),
  insight_generalization: Object.freeze(['X', 'X.site_geography', 'Y', 'Y.target_identity', 'Z.orphan_exclusivity']),
  revenue_forecast: Object.freeze(['X', 'Z.orphan_exclusivity']),
  resourcing: Object.freeze(['X']),
});

function stageById(trace, id) {
  return trace?.stages?.find((stage) => stage.id === id) ?? null;
}

/**
 * Roll a downstream section's dependency stages up to one status. Two tiers only, matching
 * `run-trace.mjs`'s own `STAGE_STATUS` vocabulary — no third tier invented:
 *   - any dependency `failed` → `blocked` (the underlying data may not exist at all; the UI
 *     replaces the chart with a caption rather than rendering from nothing)
 *   - else any dependency `degraded` → `degraded` (the chart still renders, from whatever
 *     stale-but-real snapshot the factory itself carried forward; the note names the
 *     responsible stage and reuses its real issues, never inventing a new reason)
 *   - else `released`
 */
export function rollupDownstreamStatus(trace, dependsOn) {
  const dependencyStages = dependsOn.map((id) => stageById(trace, id));
  const missing = dependencyStages.some((stage) => stage == null);
  const failed = dependencyStages.filter((stage) => stage?.status === 'failed');
  const degraded = dependencyStages.filter((stage) => stage?.status === 'degraded');

  if (missing || failed.length) {
    const responsible = failed.length ? failed : dependencyStages.filter((stage) => stage == null);
    const names = dependsOn.filter((id, index) => !dependencyStages[index] || dependencyStages[index].status === 'failed');
    return {
      status: 'blocked',
      gate: 'FAIL',
      records: 0,
      issues: failed.flatMap((stage) => stage.issues),
      issue_count: failed.reduce((total, stage) => total + stage.issue_count, 0),
      source: null,
      note: `Blocked — depends on ${names.join(', ')}, which is not available in this run.`,
    };
  }

  if (degraded.length) {
    const names = degraded.map((stage) => stage.id);
    return {
      status: 'degraded',
      gate: 'FAIL',
      records: dependencyStages.reduce((total, stage) => total + (stage?.records ?? 0), 0),
      issues: degraded.flatMap((stage) => stage.issues),
      issue_count: degraded.reduce((total, stage) => total + stage.issue_count, 0),
      source: null,
      note: `Degraded — depends on ${names.join(', ')}, currently serving a stale snapshot: ${degraded.map((stage) => stage.note ?? stage.issues.join('; ')).filter(Boolean).join(' ')}`,
    };
  }

  return {
    status: 'released',
    gate: 'PASS',
    records: dependencyStages.reduce((total, stage) => total + (stage?.records ?? 0), 0),
    issues: [],
    issue_count: 0,
    source: null,
    note: null,
  };
}

/** Roll up every downstream section's status against one run trace, keyed the same as DOWNSTREAM_DEPENDENCIES. */
export function rollupAllDownstream(trace) {
  return Object.fromEntries(Object.entries(DOWNSTREAM_DEPENDENCIES).map(([key, dependsOn]) => [
    key,
    { id: key, label: DOWNSTREAM_LABELS[key], dependsOn, ...rollupDownstreamStatus(trace, dependsOn) },
  ]));
}
