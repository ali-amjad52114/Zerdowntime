import { caption, escapeHtml, num } from './html.mjs';

/**
 * The literal "software factory" diagram: a disease name flows into five core stations, each
 * station's output feeds one or more derived products. Plain 2D SVG, same conventions as
 * `viz.mjs` — colour via CSS variables, a `<title>` on every node and edge, degrade to a
 * `caption()` when there is no run to draw.
 *
 * The five core nodes mirror the exact panel → stage mapping `ui.mjs` already uses for each of
 * the five panels' status badge (`targetPanel` reads stage `X`, `structurePanel` reads `Y`,
 * `locationPanel` reads `Y.target_identity`, `marketPanel` reads `X.site_geography`,
 * `orphanPanel` reads `Z.orphan_exclusivity`) — this diagram does not invent a second mapping,
 * it draws the one the panels already use.
 */

const CORE_NODES = Object.freeze([
  Object.freeze({ id: 'target', label: 'Target', stageId: 'X' }),
  Object.freeze({ id: 'cryoem', label: 'Cryo-EM & mass', stageId: 'Y' }),
  Object.freeze({ id: 'location', label: 'Subcellular location', stageId: 'Y.target_identity' }),
  Object.freeze({ id: 'market', label: 'Market & CMC', stageId: 'X.site_geography' }),
  Object.freeze({ id: 'orphan', label: 'Orphan status', stageId: 'Z.orphan_exclusivity' }),
]);

// The diagram box is narrower than the full panel title can comfortably hold, so each
// downstream node gets a short on-diagram label; the full label still carries in the <title>.
const DOWNSTREAM_SHORT_LABEL = Object.freeze({
  product_positioning: 'Positioning',
  go_to_market: 'Go-to-market',
  insight_generalization: 'Generalization',
  revenue_forecast: 'Revenue model',
  resourcing: 'Resourcing',
});

const STATUS_COLOR = Object.freeze({ released: 'var(--ok)', degraded: 'var(--warn)', blocked: 'var(--risk)', failed: 'var(--risk)' });
const STATUS_BG = Object.freeze({ released: 'var(--ok-bg)', degraded: 'var(--warn-bg)', blocked: 'var(--risk-bg)', failed: 'var(--risk-bg)' });

function stageStatus(trace, stageId) {
  return trace?.stages?.find((stage) => stage.id === stageId)?.status ?? 'blocked';
}

function node({ x, y, label, status, title, width = 108, height = 44 }) {
  const color = STATUS_COLOR[status] ?? 'var(--ink-3)';
  const bg = STATUS_BG[status] ?? 'var(--panel)';
  return {
    x, y, width, height, color, bg,
    svg: `<rect x="${num(x)}" y="${num(y)}" width="${width}" height="${height}" rx="8" fill="${bg}" stroke="${color}" stroke-width="1.3"><title>${escapeHtml(title)}</title></rect>` +
      `<text x="${num(x + width / 2)}" y="${num(y + height / 2 + 4)}" text-anchor="middle" class="vtiny" fill="${color}">${escapeHtml(label)}</text>`,
  };
}

function edge(from, to, status) {
  const color = STATUS_COLOR[status] ?? 'var(--rule-2)';
  const dash = status === 'released' ? '' : ' stroke-dasharray="4 3"';
  const x1 = from.x + from.width / 2;
  const y1 = from.y + from.height;
  const x2 = to.x + to.width / 2;
  const y2 = to.y;
  const midY = (y1 + y2) / 2;
  return `<path d="M${num(x1)} ${num(y1)} C ${num(x1)} ${num(midY)}, ${num(x2)} ${num(midY)}, ${num(x2)} ${num(y2)}" fill="none" stroke="${color}" stroke-width="1.1"${dash}></path>`;
}

/**
 * Draw the pipeline. `trace` is a `run-trace.mjs` `buildRunTrace()` result; `downstreamRollup`
 * is a `downstream-status.mjs` `rollupAllDownstream()` result. Both default to empty so an
 * unrun factory degrades to a caption instead of an empty canvas.
 */
export function factoryLine(trace, downstreamRollup = {}) {
  if (!trace?.stages?.length) {
    return caption('The factory has not run yet, so there is no line to draw.');
  }

  const width = 920;
  const inputY = 10;
  const coreY = 76;
  const downstreamY = 190;
  const coreGap = (width - 40) / CORE_NODES.length;
  const downstreamKeys = Object.keys(downstreamRollup);
  const downstreamGap = downstreamKeys.length ? (width - 40) / downstreamKeys.length : 0;

  const inputNode = node({
    x: width / 2 - 90, y: inputY, width: 180, height: 36,
    label: 'Input: disease name', status: 'released', title: 'SERPINA1 / Alpha-1 Antitrypsin Deficiency',
  });

  const coreNodes = CORE_NODES.map((core, index) => {
    const status = stageStatus(trace, core.stageId);
    return {
      ...core,
      status,
      node: node({
        x: 20 + index * coreGap, y: coreY, label: core.label, status,
        title: `${core.label} — ${status} (stage ${core.stageId})`,
      }),
    };
  });

  const downstreamNodes = downstreamKeys.map((key, index) => {
    const entry = downstreamRollup[key];
    return {
      key, entry,
      node: node({
        x: 20 + index * downstreamGap, y: downstreamY, width: 128,
        label: DOWNSTREAM_SHORT_LABEL[key] ?? entry.label, status: entry.status,
        title: `${entry.label} — ${entry.status}${entry.note ? `: ${entry.note}` : ''}`,
      }),
    };
  });

  const inputEdges = coreNodes.map((core) => edge(inputNode, core.node, core.status)).join('');
  const coreLookup = new Map(coreNodes.map((core) => [core.stageId, core]));
  const downstreamEdges = downstreamNodes.flatMap(({ node: targetNode, entry }) => (entry.dependsOn ?? [])
    .map((stageId) => coreLookup.get(stageId))
    .filter(Boolean)
    .map((core) => edge(core.node, targetNode, core.status === 'released' ? entry.status : core.status))).join('');

  const height = downstreamY + 60;
  const body = `${inputEdges}${downstreamEdges}${inputNode.svg}${coreNodes.map((core) => core.node.svg).join('')}${downstreamNodes.map(({ node: targetNode }) => targetNode.svg).join('')}`;

  return `<div class="viz factoryline"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Factory line from disease input through five stages to five derived products">${body}</svg></div>`;
}
