import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validatePortEntity } from "./lib/port-catalog.mjs";

const root = "port";
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const manifest = readJson(join(root, "manifest.json"));
const errors = [];
const blueprints = new Map();

for (const relative of manifest.blueprints ?? []) {
  const path = join(root, relative);
  if (!existsSync(path)) { errors.push(`Missing blueprint file: ${path}`); continue; }
  const blueprint = readJson(path);
  if (!blueprint.identifier || !blueprint.title || !blueprint.schema?.properties || !blueprint.relations) errors.push(`Incomplete blueprint: ${relative}`);
  if (blueprints.has(blueprint.identifier)) errors.push(`Duplicate blueprint identifier: ${blueprint.identifier}`);
  for (const required of blueprint.schema?.required ?? []) {
    if (!blueprint.schema.properties[required]) errors.push(`${blueprint.identifier} requires undefined property '${required}'`);
  }
  blueprints.set(blueprint.identifier, blueprint);
}

for (const blueprint of blueprints.values()) {
  for (const [name, relation] of Object.entries(blueprint.relations)) {
    if (relation.many && relation.required) errors.push(`${blueprint.identifier}.${name} cannot be required when many=true`);
    if (!blueprints.has(relation.target)) errors.push(`${blueprint.identifier}.${name} targets unknown blueprint '${relation.target}'`);
  }
}

function validateEntity(entity, blueprint, source) {
  try {
    validatePortEntity(entity, blueprint, { source: `${source}:${entity?.identifier ?? 'unknown'}` });
  } catch (error) {
    errors.push(error.message);
  }
  if (!entity.identifier || typeof entity.properties !== "object") errors.push(`Invalid entity in ${source}`);
  for (const required of blueprint.schema.required ?? []) {
    if (entity.properties[required] === undefined) errors.push(`${source}:${entity.identifier} omits required property '${required}'`);
  }
  for (const [name, value] of Object.entries(entity.properties ?? {})) {
    const property = blueprint.schema.properties[name];
    if (!property) errors.push(`${source}:${entity.identifier} has undefined property '${name}'`);
    else if (property.type === "array" && !Array.isArray(value)) errors.push(`${source}:${entity.identifier}.${name} must be an array`);
    else if (property.type !== "array" && property.type !== "object" && typeof value !== property.type) errors.push(`${source}:${entity.identifier}.${name} must be ${property.type}`);
    else if (property.enum && !property.enum.includes(value)) errors.push(`${source}:${entity.identifier}.${name} is outside its enum`);
    else if (property.type === "array" && property.items?.enum && value.some((item) => !property.items.enum.includes(item))) errors.push(`${source}:${entity.identifier}.${name} contains a value outside its item enum`);
  }
  for (const [name, relation] of Object.entries(blueprint.relations)) {
    const value = entity.relations?.[name];
    if (relation.required && (value === undefined || value === null || value === "" || (relation.many && (!Array.isArray(value) || value.length === 0)))) {
      errors.push(`${source}:${entity.identifier} omits required relation '${name}'`);
    }
    if (value !== undefined && relation.many && !Array.isArray(value)) errors.push(`${source}:${entity.identifier}.${name} must be an array relation`);
    if (value !== undefined && !relation.many && typeof value !== "string") errors.push(`${source}:${entity.identifier}.${name} must be a string relation`);
  }
  for (const name of Object.keys(entity.relations ?? {})) if (!blueprint.relations[name]) errors.push(`${source}:${entity.identifier} has undefined relation '${name}'`);
}

for (const entry of manifest.entities ?? []) {
  const path = join(root, entry.file);
  if (!existsSync(path)) { errors.push(`Missing entity file: ${path}`); continue; }
  const blueprint = blueprints.get(entry.blueprint);
  if (!blueprint) { errors.push(`Entity file targets unknown blueprint '${entry.blueprint}'`); continue; }
  const data = readJson(path);
  for (const entity of Array.isArray(data) ? data : [data]) validateEntity(entity, blueprint, entry.file);
}

for (const entry of manifest.regressionEntities ?? []) {
  const path = join(root, entry.file);
  if (entry.fixtureOnly !== true) errors.push(`Regression entity '${entry.file}' must declare fixtureOnly=true`);
  if (!existsSync(path)) { errors.push(`Missing regression entity file: ${path}`); continue; }
  const blueprint = blueprints.get(entry.blueprint);
  if (!blueprint) { errors.push(`Regression entity targets unknown blueprint '${entry.blueprint}'`); continue; }
  const data = readJson(path);
  for (const entity of Array.isArray(data) ? data : [data]) validateEntity(entity, blueprint, entry.file);
}

for (const entry of manifest.examples ?? []) {
  const path = join(root, entry.file);
  if (!existsSync(path)) { errors.push(`Missing example file: ${path}`); continue; }
  const blueprint = blueprints.get(entry.blueprint);
  if (!blueprint) { errors.push(`Example file targets unknown blueprint '${entry.blueprint}'`); continue; }
  const data = readJson(path);
  for (const entity of Array.isArray(data) ? data : [data]) validateEntity(entity, blueprint, entry.file);
}

const actionIds = new Set();
const mendActionOperations = {
  mend_handoff_candidate: "handoff_candidate",
  mend_retry_axis: "retry_axis",
  mend_approve_source_healing: "approve_source_healing",
  mend_complete_diligence_task: "complete_diligence_task",
  mend_record_target_decision: "record_target_decision",
};
for (const relative of manifest.actions ?? []) {
  const path = join(root, relative);
  if (!existsSync(path)) { errors.push(`Missing action file: ${path}`); continue; }
  const action = readJson(path);
  const invocation = action.invocationMethod ?? {};
  const supportedGitHubBackend = invocation.type === "GITHUB" || (
    invocation.type === "INTEGRATION_ACTION" &&
    invocation.installationId &&
    invocation.integrationActionType === "dispatch_workflow"
  );
  if (!action.identifier || action.trigger?.type !== "self-service" || !supportedGitHubBackend) errors.push(`Incomplete self-service action: ${relative}`);
  if (actionIds.has(action.identifier)) errors.push(`Duplicate action identifier: ${action.identifier}`);
  actionIds.add(action.identifier);
  if (action.trigger?.blueprintIdentifier && !blueprints.has(action.trigger.blueprintIdentifier)) errors.push(`${action.identifier} targets unknown blueprint`);
  const workflow = invocation.type === "INTEGRATION_ACTION"
    ? invocation.integrationActionExecutionProperties?.workflow
    : invocation.workflow;
  const expectedWorkflow = action.identifier.startsWith("mend_") ? "port-mend-control.yml" : "port-delivery.yml";
  if (workflow !== expectedWorkflow) errors.push(`${action.identifier} targets '${workflow}', expected '${expectedWorkflow}'`);
  if (expectedWorkflow === "port-mend-control.yml") {
    const inputs = invocation.integrationActionExecutionProperties?.workflowInputs ?? {};
    for (const required of ["operation", "port_run_id", "entity_id", "parent_id", "actor", "payload_json"]) {
      if (!inputs[required]) errors.push(`${action.identifier} omits workflow input '${required}'`);
    }
    if (inputs.operation !== mendActionOperations[action.identifier]) errors.push(`${action.identifier} dispatches the wrong Mend operation.`);
    if (!String(inputs.payload_json ?? "").includes('"expected_status"') && action.identifier !== "mend_handoff_candidate") {
      errors.push(`${action.identifier} omits its state precondition.`);
    }
    if (["mend_retry_axis", "mend_approve_source_healing"].includes(action.identifier) && !String(inputs.payload_json).includes('"axis"')) {
      errors.push(`${action.identifier} must dispatch an explicit axis.`);
    }
    const userInputs = action.trigger?.userInputs ?? {};
    for (const required of userInputs.required ?? []) {
      if (!userInputs.properties?.[required]) errors.push(`${action.identifier} requires undefined user input '${required}'.`);
    }
    const execution = invocation.integrationActionExecutionProperties ?? {};
    if (execution.org !== "ali-amjad52114" || execution.repo !== "Zerdowntime") errors.push(`${action.identifier} has unresolved GitHub dispatch coordinates.`);
  }
}

const release = readJson(join(root, "actions/release-change.json"));
if (release.requiredApproval !== true) errors.push("Release action must require Port manual approval.");
const submit = readJson(join(root, "actions/submit-change.json"));
if (submit.requiredApproval !== false) errors.push("Submit action must run without release approval.");
for (const identifier of ["mend_handoff_candidate", "mend_approve_source_healing", "mend_record_target_decision"]) {
  const relative = manifest.actions.find((path) => readJson(join(root, path)).identifier === identifier);
  if (!relative || readJson(join(root, relative)).requiredApproval !== true) errors.push(`${identifier} must require Port manual approval.`);
}

const productionEntityText = (manifest.entities ?? []).map((entry) => readFileSync(join(root, entry.file), "utf8")).join("\n");
if (/SERPINA1|AATD|P01009/i.test(productionEntityText)) errors.push("Fixed SERPINA1/AATD values are forbidden in production seed entities.");

const serialized = [
  ...manifest.blueprints.map((path) => readFileSync(join(root, path), "utf8")),
  ...manifest.entities.map((entry) => readFileSync(join(root, entry.file), "utf8")),
  ...(manifest.regressionEntities ?? []).map((entry) => readFileSync(join(root, entry.file), "utf8")),
  ...manifest.actions.map((path) => readFileSync(join(root, path), "utf8"))
].join("\n");
if (/(client[_-]?secret|api[_-]?key)["']?\s*[:=]\s*["'][^"']{8,}/i.test(serialized)) errors.push("Possible credential found in Port artifacts.");

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}
console.log(`Port validation passed: ${blueprints.size} blueprints, ${manifest.entities.length} production seed files, ${(manifest.regressionEntities ?? []).length} isolated regression entity files, ${(manifest.examples ?? []).length} validated examples, ${actionIds.size} actions.`);
