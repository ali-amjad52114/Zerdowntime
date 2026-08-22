import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadPortCatalog(root = join(repositoryRoot, 'port')) {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  const blueprints = new Map(manifest.blueprints.map((relative) => {
    const blueprint = JSON.parse(readFileSync(join(root, relative), 'utf8'));
    return [blueprint.identifier, blueprint];
  }));
  return { root, manifest, blueprints };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateFormat(value, format, path, errors) {
  if (format === 'date-time' && Number.isNaN(Date.parse(value))) errors.push(`${path} must be an ISO date-time`);
  if (format === 'url') {
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) errors.push(`${path} must be an HTTP(S) URL`);
    } catch {
      errors.push(`${path} must be an HTTP(S) URL`);
    }
  }
}

function validateValue(value, schema, path, errors) {
  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${path} must be an array`);
      return;
    }
    if (schema.minItems != null && value.length < schema.minItems) errors.push(`${path} must contain at least ${schema.minItems} item(s)`);
    if (schema.maxItems != null && value.length > schema.maxItems) errors.push(`${path} must contain at most ${schema.maxItems} item(s)`);
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${path} must contain unique items`);
    for (const [index, item] of value.entries()) validateValue(item, schema.items ?? {}, `${path}[${index}]`, errors);
    return;
  }
  if (schema.type === 'object') {
    if (!isObject(value)) errors.push(`${path} must be an object`);
    return;
  }
  if (schema.type && typeof value !== schema.type) {
    errors.push(`${path} must be ${schema.type}`);
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} is outside its enum`);
  if (typeof value === 'string') {
    if (schema.minLength != null && value.trim().length < schema.minLength) errors.push(`${path} must contain at least ${schema.minLength} character(s)`);
    if (schema.format) validateFormat(value, schema.format, path, errors);
  }
}

export function validatePortEntity(entity, blueprint, { source = blueprint?.identifier ?? 'entity' } = {}) {
  const errors = [];
  if (!blueprint) throw new Error(`${source} targets an unknown Port blueprint`);
  if (!isObject(entity)) throw new Error(`${source} must be an object`);
  if (typeof entity.identifier !== 'string' || !entity.identifier.trim()) errors.push(`${source}.identifier must be a non-empty string`);
  if (entity.title != null && (typeof entity.title !== 'string' || !entity.title.trim())) errors.push(`${source}.title must be a non-empty string when supplied`);
  if (!isObject(entity.properties)) errors.push(`${source}.properties must be an object`);
  if (!isObject(entity.relations ?? {})) errors.push(`${source}.relations must be an object`);

  const properties = isObject(entity.properties) ? entity.properties : {};
  for (const required of blueprint.schema?.required ?? []) {
    if (properties[required] === undefined || properties[required] === null || properties[required] === '') {
      errors.push(`${source}.properties.${required} is required`);
    }
  }
  for (const [name, value] of Object.entries(properties)) {
    const schema = blueprint.schema?.properties?.[name];
    if (!schema) errors.push(`${source}.properties.${name} is not defined by ${blueprint.identifier}`);
    else validateValue(value, schema, `${source}.properties.${name}`, errors);
  }

  const relations = isObject(entity.relations) ? entity.relations : {};
  for (const [name, definition] of Object.entries(blueprint.relations ?? {})) {
    const value = relations[name];
    if (definition.required && (value == null || value === '' || (definition.many && (!Array.isArray(value) || !value.length)))) {
      errors.push(`${source}.relations.${name} is required`);
    }
    if (value != null) {
      if (definition.many && (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim()))) {
        errors.push(`${source}.relations.${name} must be a non-empty string array`);
      }
      if (!definition.many && (typeof value !== 'string' || !value.trim())) errors.push(`${source}.relations.${name} must be a non-empty string`);
    }
  }
  for (const name of Object.keys(relations)) {
    if (!blueprint.relations?.[name]) errors.push(`${source}.relations.${name} is not defined by ${blueprint.identifier}`);
  }
  if (errors.length) throw new Error(errors.join('; '));
  return entity;
}

export function validatePortEntityEntry(entry, catalog = loadPortCatalog(), options = {}) {
  if (!isObject(entry)) throw new Error('Port entity entry must be an object');
  if (options.allowedBlueprints && !options.allowedBlueprints.includes(entry.blueprint)) {
    throw new Error(`Port action may not return blueprint '${entry.blueprint}'`);
  }
  return validatePortEntity(entry.entity, catalog.blueprints.get(entry.blueprint), {
    source: options.source ?? `port_entities.${entry.blueprint}`,
  });
}
