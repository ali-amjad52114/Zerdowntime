# Mend SigNoz verification runbook

This runbook implements the S2 portion of gate G3. It deliberately separates
three facts that are often conflated:

1. **Transport reachability** — the SigNoz UI and OTLP endpoint answer.
2. **Telemetry emission** — a Mend process completed an OTLP export attempt.
3. **Cloud readback** — SigNoz queries return stored signals for the emitted run.

Only cloud readback proves ingestion. A successful command, HTTP response from an
OTLP port, or MCP `initialize` response is not ingestion proof.

## Correlation contract

Use these exact OpenTelemetry attribute names. Do not introduce alternative
spellings in an adapter.

| Attribute | Meaning |
| --- | --- |
| `run.id` | Legacy/general workflow run identifier |
| `disease.run.id` | Disease research run |
| `candidate.id` | Discovered candidate selected by a human |
| `target.run.id` | Independent diligence run for one selected target |
| `target.name` | Canonical target name at execution time |
| `axis` | `X`, `Y`, or `Z` |
| `source.provider` | Source or sponsor adapter name |
| `source.execution.id` | Provider request, snapshot, or execution identifier |
| `brightdata.collector.id` | Bright Data collector identifier, when applicable |
| `brightdata.dataset.id` | Bright Data dataset identifier, when applicable |
| `port.run.id` | Port action/run identifier, when applicable |
| `validation.status` | Normalization or validation result |

`createTelemetry().bindCorrelation(...)` accepts both these dotted names and
camel-case aliases. It applies a correlation set to spans and logs and returns an
`attributes()` helper for metric labels.

Never attach credentials, authorization headers, cookies, request bodies that
may contain credentials, patient information, paper full text, or raw provider
responses. The telemetry helper removes credential-shaped attribute keys and
redacts common bearer/token assignments as defense in depth; adapters remain
responsible for emitting only safe metadata.

## Local and cloud procedure

1. Configure `SIGNOZ_URL`, `SIGNOZ_MCP_URL`, `SIGNOZ_API_KEY`,
   `OTEL_EXPORTER_OTLP_ENDPOINT`, and `OTEL_EXPORTER_OTLP_HEADERS` outside Git.
2. Run `npm run signoz:verify`.
   - Required result: `transportReachability=PASS`.
   - Expected: emission and readback remain `NOT_RUN`.
3. Run `npm run mend:telemetry:smoke` or `npm run telemetry:smoke`.
   - Retain a non-secret run ID from the output.
   - A clean process exit proves only that the application completed its export
     path; it does not prove SigNoz stored the data.
4. Set `SIGNOZ_VERIFY_RUN_ID` to that exact run ID and run
   `npm run signoz:mcp:smoke` within one hour.
5. Retain the redacted JSON result. Gate G3 requires:
   - `mcpConnectivity.status=PASS`
   - `workspaceRead.status=PASS`
   - `telemetryReadback.status=PASS`
   - positive log and trace counts for the exact run ID
   - positive metric rows for the expected metric name

The MCP verifier is read-only and therefore always reports
`telemetryEmission.status=NOT_RUN`. Pair its output with the smoke command output
for the final evidence packet.

## Gate evidence packet

Retain these redacted items:

- UTC timestamps and deployed service version/commit
- non-secret service and environment names
- disease and target run IDs used for the test
- smoke output showing the emitted run ID
- MCP proof JSON showing exact-run log/trace readback
- metric name and positive rows scanned
- screenshot or export of the dashboard filtered to the same time window
- any failure and retry event exercised during the run

Do not retain API keys, OTLP headers, cookies, bearer tokens, `.env` contents, or
URLs with credentials/query strings. The scripts sanitize displayed URLs and
redact the active SigNoz API key from error output.

## Failure interpretation

- Transport fails: endpoint, DNS, TLS, proxy, or local stack issue.
- Emission fails: application/exporter configuration or OTLP authorization issue.
- MCP initializes but workspace read fails: API key or workspace URL/permission issue.
- Workspace read passes but exact-run queries return zero: ingestion delay,
  mismatched service/workspace, wrong time range, or correlation attributes were
  not emitted.
- Logs/traces pass but metrics fail: metric export/temporality/query issue; do not
  waive the signal without documenting the limitation for S5.

No S2 result self-certifies release. S5 must evaluate the evidence against the
exact commit under review.
