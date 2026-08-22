import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../observability/signoz/', import.meta.url);

test('SigNoz dashboard covers factory, sponsor, retry, healing, task, and decision metrics', async () => {
  const dashboard = JSON.parse(await readFile(new URL('dashboard-v1.json', root), 'utf8'));
  assert.equal(dashboard.layout.length, dashboard.widgets.length);
  const queries = JSON.stringify(dashboard.widgets.map((widget) => widget.query));
  for (const metric of [
    'mend_factory_runs_total', 'mend_validation_failures_total', 'mend_retries_total',
    'mend_sponsor_requests_total', 'mend_sponsor_results_total', 'mend_healing_decisions_total',
    'mend_diligence_tasks_total', 'mend_diligence_decisions_total',
  ]) assert.match(queries, new RegExp(metric), `dashboard missing ${metric}`);
});

test('versioned alerts have severity, threshold, grouping, and an existing runbook anchor', async () => {
  const alerts = JSON.parse(await readFile(new URL('alerts-v1.json', root), 'utf8'));
  const runbook = await readFile(new URL('ALERT_RUNBOOK.md', root), 'utf8');
  assert.ok(alerts.rules.length >= 3);
  for (const rule of alerts.rules) {
    assert.ok(rule.name && rule.metric && rule.window && rule.comparison && rule.severity);
    assert.equal(typeof rule.threshold, 'number');
    assert.ok(Array.isArray(rule.groupBy));
    const anchor = rule.runbook.split('#')[1];
    assert.match(runbook.toLowerCase(), new RegExp(`## ${anchor.replaceAll('-', ' ')}`));
  }
});

test('verification runbook separates service-account reads from OTLP ingestion and requires exact-run proof', async () => {
  const runbook = await readFile(new URL('VERIFICATION_RUNBOOK.md', root), 'utf8');
  for (const phrase of [
    'Only cloud readback proves ingestion', 'SIGNOZ_API_KEY', 'OTEL_EXPORTER_OTLP_HEADERS',
    'disease.run.id', 'candidate.id', 'target.run.id', 'source.execution.id',
    'brightdata.collector.id', 'port.run.id', 'sponsor.request.id', 'sponsor.result.id',
    'retry.attempt', 'healing.request.id', 'diligence.task.id', 'diligence.decision.id',
  ]) assert.match(runbook, new RegExp(phrase.replaceAll('.', '\\.')));
});
