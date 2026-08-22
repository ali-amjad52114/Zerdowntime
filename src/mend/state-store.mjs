import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const STATE_SCHEMA_VERSION = 1;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

export function createMemoryStateStore(initialState = null) {
  let value = clone(initialState);
  return {
    load() { return clone(value); },
    save(state) { value = clone(state); },
    path: null,
  };
}

export function createFileStateStore({
  path = process.env.MEND_STATE_FILE ?? resolve('data', 'mend-state.json'),
} = {}) {
  const absolutePath = resolve(path);
  return {
    path: absolutePath,
    load() {
      try {
        const envelope = JSON.parse(readFileSync(absolutePath, 'utf8'));
        if (envelope?.schema_version !== STATE_SCHEMA_VERSION || !envelope?.state) {
          throw new Error(`unsupported Mend state schema in ${absolutePath}`);
        }
        return envelope.state;
      } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error;
      }
    },
    save(state) {
      mkdirSync(dirname(absolutePath), { recursive: true });
      const temporaryPath = `${absolutePath}.${process.pid}.tmp`;
      writeFileSync(temporaryPath, `${JSON.stringify({
        schema_version: STATE_SCHEMA_VERSION,
        saved_at: new Date().toISOString(),
        state,
      }, null, 2)}\n`, 'utf8');
      rmSync(absolutePath, { force: true });
      renameSync(temporaryPath, absolutePath);
    },
  };
}
