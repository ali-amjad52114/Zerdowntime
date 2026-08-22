import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeWebRecords, validateNormalizedRecords } from '../src/records.mjs';

test('normalizes sponsor-specific source fields behind the adapter boundary', () => {
  const [record] = normalizeWebRecords([{ title: 'Example', url: 'https://example.com', points: 42 }]);
  assert.equal(record.label, 'Example');
  assert.equal(record.sourceUrl, 'https://example.com');
  assert.deepEqual(record.attributes, { points: 42 });
  assert.doesNotThrow(() => validateNormalizedRecords([record]));
});

test('rejects empty and incomplete source data', () => {
  assert.throws(() => normalizeWebRecords([]), /no records/);
  assert.throws(() => normalizeWebRecords([{ title: 'missing URL' }]), /missing/);
});
