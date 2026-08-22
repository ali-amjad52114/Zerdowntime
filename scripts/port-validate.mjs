import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
    if (!blueprints.has(relation.target)) errors.push(`${blueprint.identifier}.${name} targets unknown blueprint '${relation.target}'`);
  }
}

function validateEntity(entity, blueprint, source) {
  if (!entity.identifier || typeof entity.properties !== "object") errors.push(`Invalid entity in ${source}`);
  for (const required of blueprint.schema.required ?? []) {
    if (entity.properties[required] === undefined) errors.push(`${source}:${entity.identifier} omits required property '${required}'`);
  }
  for (const [name, value] of Object.entries(entity.properties ?? {})) {
    const property = blueprint.schema.properties[name];
    if (!property) errors.push(`${source}:${entity.identifier} has undefined property '${name}'`);
    else if (property.type === "array" && !Array.isArray(value)) errors.push(`${source}:${entity.identifier}.${name} must be an array`);
    else if (property.type !== "array" && property.type !== "object" && typeof value !== property.type) errors.push(`${source}:${entity.identifier}.${name} must be ${property.type}`);
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

const actionIds = new Set();
for (const relative of manifest.actions ?? []) {
  const path = join(root, relative);
  if (!existsSync(path)) { errors.push(`Missing action file: ${path}`); continue; }
  const action = readJson(path);
  if (!action.identifier || action.trigger?.type !== "self-service" || action.invocationMethod?.type !== "GITHUB") errors.push(`Incomplete self-service action: ${relative}`);
  if (actionIds.has(action.identifier)) errors.push(`Duplicate action identifier: ${action.identifier}`);
  actionIds.add(action.identifier);
  if (action.trigger?.blueprintIdentifier && !blueprints.has(action.trigger.blueprintIdentifier)) errors.push(`${action.identifier} targets unknown blueprint`);
  if (action.invocationMethod?.workflow !== "port-delivery.yml") errors.push(`${action.identifier} targets an unexpected workflow`);
}

const release = readJson(join(root, "actions/release-change.json"));
if (release.requiredApproval !== true) errors.push("Release action must require Port manual approval.");
const submit = readJson(join(root, "actions/submit-change.json"));
if (submit.requiredApproval !== false) errors.push("Submit action must run without release approval.");

const serialized = [
  ...manifest.blueprints.map((path) => readFileSync(join(root, path), "utf8")),
  ...manifest.entities.map((entry) => readFileSync(join(root, entry.file), "utf8")),
  ...manifest.actions.map((path) => readFileSync(join(root, path), "utf8"))
].join("\n");
if (/(client[_-]?secret|api[_-]?key)["']?\s*[:=]\s*["'][^"']{8,}/i.test(serialized)) errors.push("Possible credential found in Port artifacts.");

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}
console.log(`Port validation passed: ${blueprints.size} blueprints, ${manifest.entities.length} entity files, ${actionIds.size} actions.`);
