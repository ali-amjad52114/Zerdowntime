import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const manifest = read("port/manifest.json");
const blueprint = (identifier) => {
  const file = manifest.blueprints.find((path) => read(`port/${path}`).identifier === identifier);
  assert.ok(file, `missing ${identifier} blueprint`);
  return read(`port/${file}`);
};

test("Port catalog models the constrained SERPINA1 X/Y/Z brief", () => {
  const brief = read("port/entities/serpina1-brief.json");
  assert.deepEqual(brief.properties.axes, ["X", "Y", "Z"]);
  assert.match(brief.properties.disease, /AATD/);
  assert.match(brief.properties.target, /SERPINA1/);

  const integrations = read("port/entities/xyz-integrations.json");
  // Each axis carries its own sub-axis integration: X adds trial site geography, Y adds
  // target identity, Z adds orphan exclusivity. Sub-axes are narrowings, not a fourth axis.
  assert.deepEqual(integrations.map((item) => item.properties.axis).sort(), ["X", "X", "Y", "Y", "Z", "Z"]);
  assert.ok(integrations.every((item) => existsSync(item.properties.artifact_path)));
  assert.equal(integrations.find((item) => item.properties.axis === "X").properties.provider, "Bright Data");
  assert.ok(integrations.every((item) => item.properties.evidence_required));
});

test("software changes cannot omit Git, test, human-review, or integration context", () => {
  const change = blueprint("mendSoftwareChange");
  for (const required of ["git_ref", "changed_files", "test_status", "test_command", "test_evidence", "status", "audit"]) {
    assert.ok(change.schema.required.includes(required), `${required} is not required`);
  }
  assert.equal(change.relations.workflow_run.required, true);
  assert.equal(change.relations.integrations.many, true);

  const example = read("fixtures/port/software-change-v1.json");
  assert.equal(example.properties.test_status, "PASS");
  assert.equal(example.properties.status, "AWAITING_APPROVAL");
  assert.equal(example.relations.integrations.length, 3);
});

test("X repair preserves quarantine, last-known-good data, required artifacts, and approval evidence", () => {
  const repairBlueprint = blueprint("mendRepairRequest");
  for (const required of ["failed_dataset_quarantined", "previous_data_remains_active", "required_artifacts", "audit"]) {
    assert.ok(repairBlueprint.schema.required.includes(required), `${required} is not required`);
  }

  const repair = read("fixtures/port/x-repair-request.json");
  assert.equal(repair.properties.axis, "X");
  assert.equal(repair.properties.previous_healthy_count, 8);
  assert.equal(repair.properties.current_count, 0);
  assert.equal(repair.properties.failed_dataset_quarantined, true);
  assert.equal(repair.properties.previous_data_remains_active, true);
  assert.ok(repair.properties.required_artifacts.includes("regression test"));

  const approval = read("fixtures/port/repair-approval.json");
  assert.equal(approval.properties.scope, "repair");
  assert.equal(approval.properties.evidence_snapshot.self_approval, false);
  assert.ok(approval.relations.software_change);
});
