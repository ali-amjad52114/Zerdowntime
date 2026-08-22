import { runYAxis } from '../src/axes/y/structure.mjs';
import { createEpoLinkedDataRetriever } from '../src/axes/z/epo-linked-data.mjs';
import { runZAxis } from '../src/axes/z-ip-activity.mjs';

const [structure, ipActivity] = await Promise.all([
  runYAxis({ maxEntries: 10 }),
  runZAxis({ retrieve: createEpoLinkedDataRetriever({ limit: 10, timeoutMs: 30_000 }) }),
]);

process.stdout.write(`${JSON.stringify({
  Y: { records: structure.records.length, summary: structure.summary, validation: structure.validation },
  Z: { records: ipActivity.records.length, summary: ipActivity.summary, validation: ipActivity.validation },
}, null, 2)}\n`);
