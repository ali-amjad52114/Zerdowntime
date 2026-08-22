# Mend — X/Y/Z Critical Vertical Slice

## 1. Goal

Build the smallest possible **Agentic Software Factory** that proves:

> A scientific intelligence brief can cause Mend to manufacture, test, approve, and deploy the software integrations required to answer it — and repair those integrations when they break.

For the MVP, Mend answers three questions about **one disease/target**:

**X — Pipeline:** Is anyone building it?
**Y — Structure:** Is the structural science ready?
**Z — IP Activity:** How crowded is the space?

The factory, not the dashboard, is the primary product.

---

# 2. Demo Target

Use one target/disease pair:

**Disease:** Alpha-1 Antitrypsin Deficiency (AATD)
**Target:** SERPINA1 / Alpha-1 Antitrypsin

Port receives a brief such as:

> Build an intelligence pipeline for SERPINA1 in Alpha-1 Antitrypsin Deficiency. Determine current therapeutic pipeline activity, available experimental structural evidence, and patent/IP activity.

---

# 3. Scope

Build exactly:

* **1 disease**
* **1 target**
* **3 data integrations**
* **1 source/integration per axis initially**
* **1 generated software change**
* **1 controlled source failure**
* **1 generated repair**
* **2 software versions**
* **Human approval**
* **End-to-end SigNoz observability**

Do not build:

* Multiple diseases
* Full competitive-landscape discovery
* Bioptic-style Explorer/Validator
* Large source discovery
* Legal freedom-to-operate analysis
* Complex scoring algorithms
* Fancy frontend
* Production-scale crawling

---

# 4. Three Intelligence Axes

## X — Pipeline Activity

### Question

> Is anyone developing therapeutics here?

### MVP source

One messy biotech/nonprofit pipeline website suitable for Bright Data.

### Extract

```text
Organization
Program / Drug
Disease
Target / Mechanism
Development Stage
Status
Source
Evidence
```

### Output example

```text
X — PIPELINE

Programs found: 8
Organizations: 5
Most advanced stage: Phase 2
```

Bright Data is particularly important for X because this information may live on changing webpages rather than clean APIs.

---

# 5. Y — Structural Readiness

### Question

> Do useful experimental structures exist for this target?

### MVP source

Use **one structured structural database**, preferably:

**RCSB PDB OR EMDB**

Do not integrate multiple structural databases for the critical slice.

### Retrieve

Where available:

```text
Target / protein
Structure ID
Experimental method
Resolution
Organism
Ligand / partner
Sample/state description
Source
```

### Output example

```text
Y — STRUCTURE

Experimental structures: 12
Cryo-EM structures: 3
Best resolution: 3.2 Å
Disease-relevant structure: Evidence available
```

Do not infer disease-state relevance unless the source evidence supports it.

---

# 6. Z — IP Activity

### Question

> How much visible patent activity exists around this target/program?

### MVP source

Use **one patent data source**.

Retrieve only simple, defensible information such as:

```text
Patent/publication
Assignee
Filing/publication date
Target/program terms
Status if available
Source
```

### Output example

```text
Z — IP ACTIVITY

Relevant records: 7
Major assignees: 3
Recent activity: 2
```

### Important

Do **not** call this:

> Freedom to Operate

unless Mend performs sufficient legal analysis.

For the MVP call it:

**IP Activity**

or

**IP Crowding**

It is an intelligence signal, not legal advice.

---

# 7. Result

The application produces one target intelligence card:

```text
SERPINA1
Alpha-1 Antitrypsin Deficiency

────────────────────────────

X — PIPELINE

8 programs
5 organizations
Most advanced: Phase 2

────────────────────────────

Y — STRUCTURE

12 experimental structures
3 cryo-EM
Best resolution: 3.2 Å

────────────────────────────

Z — IP ACTIVITY

7 relevant patent records
3 major assignees

────────────────────────────
```

Every number must link back to its underlying evidence.

---

# 8. Sponsor Responsibilities

## Bright Data

Use for the messy X-axis web source.

Required:

1. Run scraper from the agentic/terminal workflow.
2. Extract pipeline information.
3. Return structured data.
4. Keep scraper configuration reusable/version-controlled.
5. Repair extraction when the webpage changes.
6. Re-run after repair.

---

## Port

Port is the factory control plane.

Required:

1. Store the intelligence brief.
2. Store context about X/Y/Z integrations.
3. Track the software change.
4. Orchestrate factory state/workflows.
5. Present generated software for human approval.
6. Manage repair approval.
7. Maintain factory/run state.
8. Preserve audit history.

---

## SigNoz

SigNoz observes the complete factory.

Required:

1. OpenTelemetry traces.
2. Metrics.
3. Logs.
4. Failure alert.
5. Dashboard.
6. Failure/recovery correlation.

SigNoz must make it possible to understand:

> What failed? Which axis? Which source? When? Did the repair work?

without relying on terminal output.

---

# 9. Mend Agent

The Mend coding agent manufactures the software.

From the brief it generates or modifies:

```text
X source integration
Y API integration
Z API/data integration

Canonical mappings
Validation policies
Tests
Telemetry
Configuration
```

The important proof is that these are **actual versioned software artifacts**, not temporary LLM outputs.

---

# 10. Build Loop

## Input

Port:

> Build intelligence for SERPINA1/AATD across Pipeline, Structure, and IP Activity.

## Execution

```text
PORT
Scientific brief
      ↓
ASSEMBLE CONTEXT
      ↓
AGENT PLAN
      ↓
CODING AGENT
      ↓
MANUFACTURE

X integration
Y integration
Z integration
Mappings
Validation
Tests
Telemetry

      ↓
AUTOMATED TESTS
      ↓
GIT DIFF
      ↓
PORT
Human Review

 [REJECT] [APPROVE]

      ↓
DEPLOY v1
```

This is the primary evidence that Mend is a **software factory**.

---

# 11. Runtime Loop

After deployment:

```text
                FACTORY v1
                    │
        ┌───────────┼───────────┐
        ↓           ↓           ↓
        X           Y           Z
     Pipeline    Structure      IP
        │           │           │
 Bright Data     API          API/Data
        │           │           │
        └───────────┼───────────┘
                    ↓
                 NORMALIZE
                    ↓
                 VALIDATE
                    ↓
               TARGET VIEW
```

SigNoz traces the complete execution.

---

# 12. Canonical Evidence Contract

Every important result should preserve:

```json
{
  "axis": "X|Y|Z",
  "subject": "",
  "value": "",
  "source_url": "",
  "retrieved_at": "",
  "evidence": ""
}
```

Never fabricate missing information.

`unknown` or `null` is preferable to unsupported inference.

---

# 13. Validation

Each axis validates independently.

## X

Check:

* Non-empty result
* Program identity present
* Source/evidence present
* Suspicious record-count collapse
* Excessive missing fields

## Y

Check:

* Valid structure identifier
* Experimental method present where expected
* Resolution correctly parsed where available
* Source preserved

## Z

Check:

* Patent/publication identifier
* Assignee where available
* Source preserved
* No unsupported FTO conclusions

---

# 14. Controlled Failure

Break **only X**.

Normal:

```text
X Pipeline:     8 programs ✓
Y Structure:   12 structures ✓
Z IP Activity:  7 records ✓
```

Introduce a reproducible website structure change.

Next run:

```text
X Pipeline:      0 programs ✗
Y Structure:    12 structures ✓
Z IP Activity:   7 records ✓
```

This demonstrates that Mend can isolate a failed integration without pretending the entire system failed.

---

# 15. SigNoz Detects the Failure

Example telemetry:

```text
axis = X
source = pipeline_source
previous_records = 8
current_records = 0
validation = FAIL
```

SigNoz:

**ALERT — X Pipeline Extraction Failed**

Y and Z remain healthy.

---

# 16. Port Starts Remediation

Port records:

```text
Affected axis: X
Affected source: Pipeline website
Factory version: v1
Previous healthy records: 8
Current records: 0
Status: REPAIR_REQUIRED
```

The failed dataset is quarantined.

The previous healthy X data remains active.

---

# 17. Factory Manufactures the Repair

Provide the coding agent:

* Failed extraction
* Previous healthy output
* Current source
* Existing integration
* Validation failure
* Tests

The agent diagnoses the source change.

Then generates:

```text
Updated X integration
        +
Regression test
```

Tests execute.

Expected:

```text
Broken fixture before repair: FAIL

Broken fixture after repair: PASS

Programs recovered: 8
```

---

# 18. Git + Human Approval

The repair becomes a real Git change.

Port presents:

```text
MEND REPAIR

Axis:
X — Pipeline

Problem:
Website structure changed.

Changed:
pipeline adapter
regression test

Before:
0 programs

After:
8 programs

Tests:
PASS

[ REJECT ]

[ APPROVE ]
```

The agent cannot approve its own change.

---

# 19. Deploy V2

Approval creates:

```text
factory.version = v2
```

Run the complete target intelligence pipeline again.

Expected:

```text
X Pipeline:      8 programs ✓
Y Structure:    12 structures ✓
Z IP Activity:   7 records ✓

FACTORY HEALTHY
```

SigNoz must visibly show:

```text
Healthy
   ↓
Failure
   ↓
Repair
   ↓
Recovery
```

---

# 20. Minimum Telemetry

Trace:

```text
factory.run
│
├── axis.x.pipeline
│   ├── scrape
│   ├── normalize
│   └── validate
│
├── axis.y.structure
│   ├── retrieve
│   ├── normalize
│   └── validate
│
├── axis.z.ip
│   ├── retrieve
│   ├── normalize
│   └── validate
│
└── intelligence.publish
```

Minimum metrics:

```text
factory_runs_total
factory_run_duration_ms

x_records
y_records
z_records

validation_failures_total

repair_attempts_total
repair_success_total
```

---

# 21. Minimal UI

One page only.

```text
MEND

SERPINA1
Alpha-1 Antitrypsin Deficiency

Pipeline Activity
████████
8 Programs

Structural Readiness
████████████
12 Structures

IP Activity
███████
7 Records


Factory
Version: v2
Status: HEALTHY
```

Allow clicking each axis to see source evidence.

Do not recreate Port or SigNoz functionality.

---

# 22. Demo Sequence

## 1 — Brief

Show Port:

> Build intelligence for SERPINA1/AATD across pipeline activity, structural readiness, and IP activity.

## 2 — Factory builds

Agent generates:

**X + Y + Z integrations + validation + tests**

Show the actual Git diff.

## 3 — Human approval

Approve V1 in Port.

## 4 — Run

Show:

```text
X ✓
Y ✓
Z ✓
```

Show SigNoz healthy trace.

## 5 — Break X

Pipeline website changes.

```text
X: 8 → 0
```

## 6 — Detect

SigNoz alert.

Port opens remediation.

## 7 — Repair

Agent generates:

**X adapter repair + regression test**

## 8 — Review

Show Git diff.

Approve in Port.

## 9 — Deploy V2

Re-run.

```text
X: 0 → 8 ✓
Y: 12 ✓
Z: 7 ✓
```

## 10 — Finish

Show Mend target card.

---

# 23. What We Explicitly Do Not Claim

Mend does **not** determine:

* Whether a target will produce a successful drug.
* Whether a structure proves druggability.
* Whether a patent search constitutes freedom to operate.
* Whether absence from our pipeline means no program exists.
* Whether an AI-generated scientific inference is fact.

Mend provides **evidence-backed intelligence**.

---

# 24. Definition of Done

The vertical slice is complete when:

```text
SCIENTIFIC BRIEF
        ↓
AGENT MANUFACTURES
X + Y + Z SOFTWARE
        ↓
TEST
        ↓
GIT DIFF
        ↓
PORT APPROVAL
        ↓
DEPLOY V1
        ↓
RUN X + Y + Z
        ↓
SIGNOZ HEALTHY
        ↓
BREAK X
        ↓
8 → 0
        ↓
VALIDATION FAIL
        ↓
SIGNOZ ALERT
        ↓
PORT REMEDIATION
        ↓
AGENT WRITES REPAIR
+ REGRESSION TEST
        ↓
GIT DIFF
        ↓
PORT APPROVAL
        ↓
DEPLOY V2
        ↓
RE-RUN
        ↓
X RECOVERS
Y HEALTHY
Z HEALTHY
        ↓
SIGNOZ VERIFIED
        ↓
MEND TARGET VIEW
```

## Non-negotiable rule

**One target. Three integrations. One failure. One repair.**

Do not expand beyond that until the complete loop works.
