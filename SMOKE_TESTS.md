# Zero Downtime sponsor integration smoke tests

This specification proves sponsor-tool integration independently of the final product idea. The fixture and application can change; the observable acceptance criteria should remain.

## End-to-end acceptance flow

1. A brief or change request starts a repeatable run in Port.
2. Port records context and launches an approved workflow.
3. Bright Data Scraper Studio fetches fresh, structured web data from the terminal.
4. Application or pipeline code consumes the returned records.
5. SigNoz receives correlated traces, logs, and metrics for the workflow, scrape, and API/background processing.
6. A controlled scrape/schema failure is introduced.
7. SigNoz exposes the failure and triggers or records retry/escalation.
8. Bright Data Self-Healing proposes a repair without changing the Collector ID.
9. A human reviews and approves the repair or release through the workflow.
10. The same input is rerun successfully, with a complete Port audit trail and SigNoz telemetry.

## Port smoke tests

Repository implementation and credential-free commands are documented in `port/README.md`. Items that require an authenticated Port organization remain unchecked until the connected smoke test is performed; local validation must not be presented as Port UI/API evidence.

- [ ] Catalog project goals, constraints, technical choices, risks, and services.
- [ ] Accept a product brief or change request as workflow input.
- [ ] Assemble context and pass it to the correct agent/tool.
- [ ] Execute build and automated verification stages.
- [ ] Stop at a human approval gate before release or another consequential action.
- [ ] Rejecting approval prevents continuation.
- [ ] A deliberate test/build failure is visible and invokes retry or escalation policy.
- [ ] A changed requirement alters the plan rather than replaying a fixed script.
- [ ] Operators can inspect status, decisions, outputs, and audit history.
- [ ] A second run succeeds without manual reconstruction.
- [ ] If MCP is used, an authorized agent can read shared context and invoke only an authorized workflow.

## Bright Data Scraper Studio smoke tests

- [ ] Create and run the scraper from the repository terminal with the Bright Data CLI.
- [ ] Store the API key only in the environment or ignored `.env.local`.
- [ ] Pin the stable Collector ID and usage rules in project guidance.
- [ ] Return a non-empty, parseable JSON array.
- [ ] Validate required fields and reject a silently empty/incomplete result.
- [ ] Save a run artifact for application consumption and demo evidence.
- [ ] Demonstrate that application/pipeline code consumes the records.
- [ ] Restart the coding session and reuse the same Collector ID/configuration.
- [ ] Introduce or identify a selector/schema failure.
- [ ] Run `heal`, review its proposed diff/preview, approve it, and rerun successfully.
- [ ] Confirm repair retains the Collector ID.

Current neutral fixture: Hacker News top stories with `title`, `url`, `points`, `author`, and `comment_count`. It is not the final product idea.

## SigNoz smoke tests

- [ ] Export traces, structured logs, and metrics through OpenTelemetry.
- [ ] Instrument at least one API endpoint and one scrape/background step.
- [ ] Propagate a shared run/trace identifier across components.
- [ ] Dashboard shows latency, throughput/execution rate, and error rate.
- [ ] A successful API call and scrape appear as searchable traces/spans.
- [ ] Logs correlate to the same trace/run.
- [ ] A forced failure increments error metrics and identifies the failed stage.
- [ ] Scraper failure, heal request, approval, and successful retry are first-class events/spans.
- [ ] A controlled threshold fires an alert.
- [ ] Alerting feeds a retry, Port workflow, or human escalation path.
- [ ] A reviewer can diagnose the controlled failure from SigNoz alone.

## Submission evidence

- [ ] GitHub repository includes source, meaningful commit history, and no credentials.
- [ ] README documents setup, architecture, normal run, failure drill, and recovery.
- [ ] Automated tests cover schema validation and at least one intentional failure.
- [ ] A 3–5 minute demo shows the terminal scrape, JSON consumed by the app, Bright Data heal flow, Port workflow/approval/audit, and live SigNoz telemetry.

