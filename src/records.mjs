import { createHash } from 'node:crypto';

/** Adapter boundary: sponsor fixtures become product-neutral pipeline records here. */
export function normalizeWebRecords(records) {
  if (!Array.isArray(records) || records.length === 0) throw new Error('source returned no records');
  return records.map((record, index) => {
    const label = String(record.title ?? record.label ?? '').trim();
    const sourceUrl = String(record.url ?? record.sourceUrl ?? '').trim();
    if (!label || !sourceUrl) throw new Error(`source record ${index} is missing title/label or url/sourceUrl`);
    return {
      id: record.id ?? createHash('sha256').update(`${sourceUrl}\0${label}`).digest('hex').slice(0, 16),
      label,
      sourceUrl,
      attributes: Object.fromEntries(Object.entries(record).filter(([key]) => !['id', 'title', 'label', 'url', 'sourceUrl'].includes(key))),
    };
  });
}

export function validateNormalizedRecords(records) {
  if (!Array.isArray(records) || records.length === 0) throw new Error('pipeline requires at least one normalized record');
  for (const [index, record] of records.entries()) {
    if (!record?.id || !record?.label || !record?.sourceUrl || typeof record.attributes !== 'object') {
      throw new Error(`normalized record ${index} failed schema validation`);
    }
  }
  return records;
}
