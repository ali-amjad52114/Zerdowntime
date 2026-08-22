import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createFileStateStore, createMemoryStateStore, STATE_SCHEMA_VERSION } from '../src/mend/state-store.mjs';

test('memory state store clones values across load and save boundaries', () => {
  const store = createMemoryStateStore({ discovery: { disease: 'Example' } });
  const loaded = store.load();
  loaded.discovery.disease = 'Mutated';
  assert.equal(store.load().discovery.disease, 'Example');
  store.save({ discovery: { disease: 'Saved' } });
  assert.equal(store.load().discovery.disease, 'Saved');
});

test('file state store persists a versioned envelope and restores it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mend-state-'));
  const path = join(directory, 'state.json');
  try {
    const store = createFileStateStore({ path });
    assert.equal(store.load(), null);
    store.save({ discovery: { disease: 'Glioblastoma' }, targetRuns: {} });
    assert.deepEqual(createFileStateStore({ path }).load(), {
      discovery: { disease: 'Glioblastoma' }, targetRuns: {},
    });
    const envelope = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(envelope.schema_version, STATE_SCHEMA_VERSION);
    assert.ok(envelope.saved_at);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
