import { caption, escapeHtml, num } from './html.mjs';

/**
 * Three hand-drawn, no-library 3D chart primitives, isometric, for the downstream/derived
 * sections. Same discipline as `viz.mjs`: every mark carries a `<title>`, every colour comes
 * from a CSS variable, every function degrades to a `caption()` on empty input, and nothing
 * here is a chart library — a fixed 30° isometric projection and painter's-algorithm depth
 * sorting are the entire "engine."
 *
 * A static SVG with no rotation is harder to read an exact value off than the 2D charts next
 * to it, so every chart here is followed by a collapsed `<details>` table with the exact
 * number behind every mark — the isometric view is for shape, the table is where the number
 * actually lives.
 *
 * `viewBox` is never a fixed guess: every mark (plus a rough label-width estimate) is projected
 * first, the real bounding box is computed from that, and the box is set from it. Category
 * counts are capped and the overflow captioned, matching `evidenceList`'s "N further records
 * not listed" pattern, so a chart never silently drops data without saying so.
 */

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = Math.sin(Math.PI / 6);
const CATEGORY_CAP = 8;
const POINT_CAP = 10;

/** The one projection every chart in this module uses. x/y recede into the floor, z rises. */
function project(x, y, z, scale) {
  return [(x - y) * COS30 * scale, (x + y) * SIN30 * scale - z * scale];
}

/**
 * Painter's-algorithm draw order: ascending by (x+y), so a mark further into the scene (small
 * x+y, appears higher/further on screen) is painted first and a mark nearer the viewer (large
 * x+y, appears lower/nearer) paints over it. Ties (same x+y — the common case for a bars3d
 * category grid, where every cell has integer x/y) break by z ascending, so a taller mark at
 * the same footprint paints last and stays visible.
 */
function depthOrder(x, y, z) {
  return (x + y) * 1024 - z;
}

function byDepth(a, b) {
  return depthOrder(a.x, a.y, a.z) - depthOrder(b.x, b.y, b.z);
}

/** Rough monospace-ish width estimate, good enough to keep a viewBox from clipping a label. */
function textWidth(text, charWidth = 5.3) {
  return String(text ?? '').length * charWidth;
}

/** Track the raw (pre-origin) bounding box every drawn primitive needs to fit inside. */
function createBounds() {
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  return {
    include(x, y) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    },
    includeLabel(x, y, text, { above = true } = {}) {
      const width = textWidth(text);
      minX = Math.min(minX, x - width / 2);
      maxX = Math.max(maxX, x + width / 2);
      minY = Math.min(minY, above ? y - 10 : y);
      maxY = Math.max(maxY, above ? y : y + 10);
    },
    box(padding = 26) {
      // Every drawn coordinate is `raw + originX/originY` (see the `at()` helpers below), which
      // shifts the raw bounding box to start at `padding`. So the viewBox itself must start at
      // 0,0 — NOT at `minX - padding` — or the padding gets applied twice and content that was
      // correctly inset from the raw box ends up outside the viewBox entirely.
      return { minX: 0, minY: 0, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2, originX: padding - minX, originY: padding - minY };
    },
  };
}

/** Wrap chart body + legend + fallback table in the SVG shell every 3D chart shares. */
function wrapChart({ ariaLabel, bbox, body, legend = '', fallback = '' }) {
  return `<div class="viz3d"><svg viewBox="${num(bbox.minX, 1)} ${num(bbox.minY, 1)} ${num(bbox.width, 1)} ${num(bbox.height, 1)}" role="img" aria-label="${escapeHtml(ariaLabel)}">
${body}</svg>${legend}${fallback ? `<details><summary>Exact values</summary>${fallback}</details>` : ''}</div>`;
}

function fallbackTable(headers, rows) {
  if (!rows.length) return '';
  const head = `<tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>`;
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
  return `<div class="tablewrap"><table>${head}${body}</table></div>`;
}

function evenTicks(min, max, count = 5) {
  if (max <= min) return [min];
  return Array.from({ length: count }, (_, index) => min + (index / (count - 1)) * (max - min));
}

/**
 * 1 · Scatter — one dot per item, with a stem down to the floor for depth legibility. Painter's
 * algorithm sorts each (stem, dot) pair as one atomic unit.
 */
export function scatter3d(points, {
  ariaLabel = 'Three-axis scatter plot',
  xLabel = 'x', yLabel = 'y', zLabel = 'z',
  scale = 30, colorVar = 'var(--struct)',
} = {}) {
  const items = (points ?? []).filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y) && Number.isFinite(point?.z));
  if (!items.length) return caption('No positioned points in this set.');

  const shown = [...items].sort((a, b) => b.z - a.z).slice(0, POINT_CAP);
  const overflow = items.length - shown.length;

  const xDomain = [0, Math.max(...items.map((point) => point.x), 1)];
  const yDomain = [0, Math.max(...items.map((point) => point.y), 1)];
  const zDomain = [0, Math.max(...items.map((point) => point.z), 1)];
  const xTicks = evenTicks(...xDomain);
  const yTicks = evenTicks(...yDomain);
  const zTicks = evenTicks(...zDomain, 3);

  // Normalize z to a fixed visual max height regardless of the data's actual z range, the same
  // technique bars3d and ribbon3d use — otherwise a z domain much larger than the x/y domain
  // (common here: differentiation/simplicity scores run 0–10 while stage rank runs 1–8) makes
  // stems shoot far past a floor grid sized to x/y, throwing off the whole chart's proportions.
  // `zFactor` rescales a raw z value before it reaches `project()`, whose z argument is itself
  // multiplied by `scale` internally.
  const zFactor = zDomain[1] > 0 ? 2.2 / zDomain[1] : 0;

  const bounds = createBounds();
  const gridLines = [];
  for (const xTick of xTicks) {
    const [x1, y1] = project(xTick, yDomain[0], 0, scale);
    const [x2, y2] = project(xTick, yDomain[1], 0, scale);
    bounds.include(x1, y1); bounds.include(x2, y2);
    gridLines.push([x1, y1, x2, y2]);
  }
  for (const yTick of yTicks) {
    const [x1, y1] = project(xDomain[0], yTick, 0, scale);
    const [x2, y2] = project(xDomain[1], yTick, 0, scale);
    bounds.include(x1, y1); bounds.include(x2, y2);
    gridLines.push([x1, y1, x2, y2]);
  }

  const axisLabels = [];
  const [xLabelPos] = [project((xDomain[0] + xDomain[1]) / 2, yDomain[1], 0, scale)];
  bounds.includeLabel(xLabelPos[0], xLabelPos[1] + 14, xLabel, { above: false });
  axisLabels.push({ x: xLabelPos[0], y: xLabelPos[1] + 14, text: xLabel });
  const [yLabelPos] = [project(xDomain[1], (yDomain[0] + yDomain[1]) / 2, 0, scale)];
  bounds.includeLabel(yLabelPos[0] + 6, yLabelPos[1], yLabel, { above: false });
  axisLabels.push({ x: yLabelPos[0] + 6, y: yLabelPos[1], text: yLabel, anchor: 'start' });

  const zRuler = [];
  const [rulerX, rulerYBase] = project(xDomain[0], yDomain[0], 0, scale);
  const [, rulerYTop] = project(xDomain[0], yDomain[0], zDomain[1] * zFactor, scale);
  bounds.include(rulerX, rulerYBase); bounds.include(rulerX, rulerYTop);
  for (const zTick of zTicks) {
    const [tx, ty] = project(xDomain[0], yDomain[0], zTick * zFactor, scale);
    bounds.includeLabel(tx - 8, ty, num(zTick, 1));
    zRuler.push({ x: tx, y: ty, label: num(zTick, 1) });
  }
  bounds.includeLabel(rulerX - 8, rulerYTop - 10, zLabel);

  const marks = shown.map((point) => {
    const [dx, dy] = project(point.x, point.y, point.z * zFactor, scale);
    const [fx, fy] = project(point.x, point.y, 0, scale);
    bounds.include(dx, dy); bounds.include(fx, fy);
    // Reserve headroom for the taller of the two label rows a small cluster of nearby points
    // may stagger into below — cheaper than a real collision solver, and safe because it
    // always reserves the worst case rather than growing the box after it's already fixed.
    bounds.includeLabel(dx, dy - 20, point.label ?? '');
    return { ...point, dx, dy, fx, fy };
  }).sort(byDepth);

  const box = bounds.box();
  const at = (x, y) => [num(x + box.originX), num(y + box.originY)];

  const gridSvg = gridLines.map(([x1, y1, x2, y2]) => {
    const [ax, ay] = at(x1, y1);
    const [bx, by] = at(x2, y2);
    return `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="var(--rule-2)" stroke-width="0.5"></line>`;
  }).join('');

  const rulerSvg = (() => {
    const [bx, by] = at(rulerX, rulerYBase);
    const [tx, ty] = at(rulerX, rulerYTop);
    const ticks = zRuler.map((tick) => {
      const [px, py] = at(tick.x, tick.y);
      return `<line x1="${num(Number(px) - 3)}" y1="${py}" x2="${num(Number(px) + 3)}" y2="${py}" stroke="var(--ink-3)" stroke-width="0.6"></line><text x="${num(Number(px) - 6)}" y="${num(Number(py) + 3)}" text-anchor="end" class="vtiny" fill="var(--ink-3)">${escapeHtml(tick.label)}</text>`;
    }).join('');
    return `<line x1="${bx}" y1="${by}" x2="${tx}" y2="${ty}" stroke="var(--ink-3)" stroke-width="0.6" stroke-dasharray="2 2"></line>${ticks}`;
  })();

  const labelSvg = axisLabels.map((label) => {
    const [lx, ly] = at(label.x, label.y);
    return `<text x="${lx}" y="${ly}" text-anchor="${label.anchor ?? 'middle'}" class="vtiny" fill="var(--ink-3)">${escapeHtml(label.text)}</text>`;
  }).join('');

  // Labels for points that land close together on screen collide. Rather than a full
  // collision solver, alternate every close pair between two label heights — resolves the
  // common case (a small cluster of similarly-staged programs) without extra bounds work,
  // since the headroom for both heights was already reserved above.
  const CLUSTER_THRESHOLD = 34;
  const screenX = marks.map((mark) => Number(at(mark.dx, mark.dy)[0]));
  const orderByScreenX = marks.map((_, index) => index).sort((a, b) => screenX[a] - screenX[b]);
  const raised = new Array(marks.length).fill(false);
  for (let position = 1; position < orderByScreenX.length; position += 1) {
    const current = orderByScreenX[position];
    const previous = orderByScreenX[position - 1];
    if (Math.abs(screenX[current] - screenX[previous]) < CLUSTER_THRESHOLD) raised[current] = !raised[previous];
  }

  const markSvg = marks.map((mark, index) => {
    const [dx, dy] = at(mark.dx, mark.dy);
    const [fx, fy] = at(mark.fx, mark.fy);
    const title = escapeHtml(mark.title ?? `${mark.label}: ${xLabel} ${num(mark.x, 1)}, ${yLabel} ${num(mark.y, 1)}, ${zLabel} ${num(mark.z, 1)}`);
    const labelY = num(Number(dy) - (raised[index] ? 20 : 8));
    return `<line x1="${dx}" y1="${dy}" x2="${fx}" y2="${fy}" stroke="${colorVar}" stroke-width="1" stroke-opacity="0.5"></line>` +
      `<circle cx="${dx}" cy="${dy}" r="4.5" fill="${colorVar}" fill-opacity="0.9"><title>${title}</title></circle>` +
      `<text x="${dx}" y="${labelY}" text-anchor="middle" class="vtiny" fill="var(--ink-2)">${escapeHtml(mark.label ?? '')}</text>`;
  }).join('');

  const legend = overflow > 0
    ? caption(`${overflow} further ${overflow === 1 ? 'point is' : 'points are'} not plotted; showing the ${shown.length} highest by ${zLabel}.`)
    : '';

  const fallback = fallbackTable(['Item', xLabel, yLabel, zLabel], shown.map((point) => [point.label ?? '—', num(point.x, 1), num(point.y, 1), num(point.z, 1)]));

  return wrapChart({ ariaLabel, bbox: box, body: `${gridSvg}${rulerSvg}${labelSvg}${markSvg}`, legend, fallback });
}

/**
 * 2 · Extruded bars over a categorical x/y grid — a genuine 3D bar chart. Painter's algorithm
 * sorts cells (never individual faces) as atomic units; each cell always draws its three faces
 * in the same fixed order (left, right, top) so a shared edge between adjacent columns never
 * paints out of order.
 */
export function bars3d(cells, {
  ariaLabel = 'Three-axis bar chart',
  xCategories = [], yCategories = [],
  xLabel = 'x', yLabel = 'y', zLabel = 'z',
  scale = 34, barWidth = 0.62,
  topColorVar = 'var(--struct)', sideLeftColorVar = 'var(--bars3d-side-l)', sideRightColorVar = 'var(--bars3d-side-r)',
} = {}) {
  const validCells = (cells ?? []).filter((cell) => Number.isFinite(cell?.z) && xCategories.includes(cell?.xCategory) && yCategories.includes(cell?.yCategory));
  if (!validCells.length || !xCategories.length || !yCategories.length) {
    return caption('No categorised values in this set.');
  }

  const totalByX = new Map(xCategories.map((category) => [category, 0]));
  for (const cell of validCells) totalByX.set(cell.xCategory, (totalByX.get(cell.xCategory) ?? 0) + cell.z);
  const shownXCategories = xCategories.length <= CATEGORY_CAP
    ? xCategories
    : [...xCategories].sort((a, b) => (totalByX.get(b) ?? 0) - (totalByX.get(a) ?? 0)).slice(0, CATEGORY_CAP);
  const xOverflow = xCategories.length - shownXCategories.length;
  const shownYCategories = yCategories.slice(0, CATEGORY_CAP);
  const yOverflow = yCategories.length - shownYCategories.length;

  const shownCells = validCells.filter((cell) => shownXCategories.includes(cell.xCategory) && shownYCategories.includes(cell.yCategory));
  const maxZ = Math.max(...shownCells.map((cell) => cell.z), 1);
  const xIndex = new Map(shownXCategories.map((category, index) => [category, index]));
  const yIndex = new Map(shownYCategories.map((category, index) => [category, index]));

  const bounds = createBounds();
  const gridLines = [];
  const xSpan = [0, shownXCategories.length - 1 || 0.001];
  const ySpan = [0, shownYCategories.length - 1 || 0.001];
  for (let xi = 0; xi < shownXCategories.length; xi += 1) {
    const [x1, y1] = project(xi, ySpan[0] - 0.5, 0, scale);
    const [x2, y2] = project(xi, ySpan[1] + 0.5, 0, scale);
    bounds.include(x1, y1); bounds.include(x2, y2);
    gridLines.push([x1, y1, x2, y2]);
  }
  for (let yi = 0; yi < shownYCategories.length; yi += 1) {
    const [x1, y1] = project(xSpan[0] - 0.5, yi, 0, scale);
    const [x2, y2] = project(xSpan[1] + 0.5, yi, 0, scale);
    bounds.include(x1, y1); bounds.include(x2, y2);
    gridLines.push([x1, y1, x2, y2]);
  }

  const xLabelSvg = shownXCategories.map((category, index) => {
    const [lx, ly] = project(index, ySpan[1] + 0.9, 0, scale);
    bounds.includeLabel(lx, ly, category, { above: false });
    return { x: lx, y: ly, text: category };
  });
  const yLabelSvg = shownYCategories.map((category, index) => {
    const [lx, ly] = project(xSpan[1] + 0.7, index, 0, scale);
    bounds.includeLabel(lx, ly, category, { above: false });
    return { x: lx, y: ly, text: category, anchor: 'start' };
  });

  const half = barWidth / 2;
  const columns = shownCells.map((cell) => {
    const xi = xIndex.get(cell.xCategory);
    const yi = yIndex.get(cell.yCategory);
    const height = maxZ > 0 ? (cell.z / maxZ) * (scale * 3.4) : 0;
    // Corners of the column's footprint, projected at floor (z=0) and roof (z=height/scale-equivalent).
    const corners = {
      nearFloor: project(xi + half, yi + half, 0, scale),
      nearRoof: [0, 0],
      leftFloor: project(xi - half, yi + half, 0, scale),
      leftRoof: [0, 0],
      rightFloor: project(xi + half, yi - half, 0, scale),
      rightRoof: [0, 0],
      farFloor: project(xi - half, yi - half, 0, scale),
      farRoof: [0, 0],
    };
    const roofZ = height / scale;
    corners.nearRoof = project(xi + half, yi + half, roofZ, scale);
    corners.leftRoof = project(xi - half, yi + half, roofZ, scale);
    corners.rightRoof = project(xi + half, yi - half, roofZ, scale);
    corners.farRoof = project(xi - half, yi - half, roofZ, scale);
    Object.values(corners).forEach(([x, y]) => bounds.include(x, y));
    return { cell, xi, yi, corners };
  }).sort(byDepth);

  const box = bounds.box();
  const at = ([x, y]) => `${num(x + box.originX)},${num(y + box.originY)}`;

  const gridSvg = gridLines.map(([x1, y1, x2, y2]) => `<line x1="${num(x1 + box.originX)}" y1="${num(y1 + box.originY)}" x2="${num(x2 + box.originX)}" y2="${num(y2 + box.originY)}" stroke="var(--rule-2)" stroke-width="0.5"></line>`).join('');

  const xLabelText = xLabelSvg.map((label) => `<text x="${num(label.x + box.originX)}" y="${num(label.y + box.originY)}" text-anchor="middle" class="vtiny" fill="var(--ink-2)">${escapeHtml(label.text)}</text>`).join('');
  const yLabelText = yLabelSvg.map((label) => `<text x="${num(label.x + box.originX)}" y="${num(label.y + box.originY)}" text-anchor="start" class="vtiny" fill="var(--ink-2)">${escapeHtml(label.text)}</text>`).join('');

  const columnSvg = columns.map(({ cell, corners }) => {
    const title = escapeHtml(cell.title ?? `${cell.xCategory} · ${cell.yCategory}: ${num(cell.z, 2)} ${zLabel}`);
    const leftFace = `<polygon points="${at(corners.leftFloor)} ${at(corners.nearFloor)} ${at(corners.nearRoof)} ${at(corners.leftRoof)}" fill="${sideLeftColorVar}"><title>${title}</title></polygon>`;
    const rightFace = `<polygon points="${at(corners.rightFloor)} ${at(corners.nearFloor)} ${at(corners.nearRoof)} ${at(corners.rightRoof)}" fill="${sideRightColorVar}"><title>${title}</title></polygon>`;
    const topFace = `<polygon points="${at(corners.leftRoof)} ${at(corners.nearRoof)} ${at(corners.rightRoof)} ${at(corners.farRoof)}" fill="${topColorVar}"><title>${title}</title></polygon>`;
    // Fixed local face order: left, right, top — so a shared edge between neighbouring
    // columns is always overpainted the same way regardless of which cell sorted where.
    return `${leftFace}${rightFace}${topFace}`;
  }).join('');

  const overflowNotes = [
    xOverflow > 0 ? `${xOverflow} further ${xLabel.toLowerCase()} ${xOverflow === 1 ? 'category is' : 'categories are'} not shown, kept to the ${shownXCategories.length} highest-total.` : null,
    yOverflow > 0 ? `${yOverflow} further ${yLabel.toLowerCase()} ${yOverflow === 1 ? 'category is' : 'categories are'} not shown.` : null,
  ].filter(Boolean);
  const legend = overflowNotes.length ? overflowNotes.map((note) => caption(note)).join('') : '';

  const fallback = fallbackTable([xLabel, yLabel, zLabel], shownCells.map((cell) => [cell.xCategory, cell.yCategory, num(cell.z, 2)]));

  return wrapChart({ ariaLabel, bbox: box, body: `${gridSvg}${xLabelText}${yLabelText}${columnSvg}`, legend, fallback });
}

/**
 * 3 · Ribbon — named lines walking forward across a time axis, each on its own lane for real
 * spatial separation, with an optional filled band between two lanes and an optional marked
 * cliff line.
 */
export function ribbon3d(lanes, {
  ariaLabel = 'Three-axis ribbon plot',
  xTicks = [], xLabel = 'x', zLabel = 'z',
  scale = 30, bandBetween = null, cliffAt = null,
} = {}) {
  const validLanes = (lanes ?? []).filter((lane) => Array.isArray(lane?.points) && lane.points.length);
  if (!validLanes.length) return caption('No series in this set.');

  const allZ = validLanes.flatMap((lane) => lane.points.map((point) => point.z)).filter(Number.isFinite);
  const maxZ = Math.max(...allZ, 1);
  const zTicks = evenTicks(0, maxZ, 3);
  const xValues = [...new Set(validLanes.flatMap((lane) => lane.points.map((point) => point.x)))].sort((a, b) => a - b);
  const xMin = xValues[0] ?? 0;
  const xMax = xValues[xValues.length - 1] ?? 1;

  const bounds = createBounds();
  // Lane spacing is deliberately wider than one grid unit — with a tall z range, using the
  // bare lane index leaves too little separation between lanes for the eye to track which
  // line is which once the z-driven rise and fall dominates the picture.
  const LANE_SPACING = 2.4;
  const laneY = new Map(validLanes.map((lane, index) => [lane.name, index * LANE_SPACING]));
  const zScale = maxZ > 0 ? (scale * 3.2) / maxZ : 0;
  const pos = (x, laneName, z) => project(x - xMin, laneY.get(laneName), (z ?? 0) * (zScale / scale), scale);

  for (const lane of validLanes) {
    for (const point of lane.points) {
      const [px, py] = pos(point.x, lane.name, point.z);
      bounds.include(px, py);
      const [fx, fy] = pos(point.x, lane.name, 0);
      bounds.include(fx, fy);
    }
    const [labelX, labelY] = pos(xMin, lane.name, 0);
    bounds.includeLabel(labelX - 8, labelY, lane.name);
  }
  for (const tick of xTicks.length ? xTicks : xValues) {
    const [tx, ty] = pos(tick, validLanes[validLanes.length - 1].name, 0);
    bounds.includeLabel(tx, ty + 14, String(tick), { above: false });
  }
  const rulerLaneName = validLanes[0].name;
  const [rulerX, rulerYBase] = pos(xMin, rulerLaneName, 0);
  const [, rulerYTop] = pos(xMin, rulerLaneName, maxZ);
  bounds.include(rulerX, rulerYBase); bounds.include(rulerX, rulerYTop);
  for (const tick of zTicks) {
    const [tx, ty] = pos(xMin, rulerLaneName, tick);
    bounds.includeLabel(tx - 8, ty, num(tick, 0));
  }

  const box = bounds.box();
  const at = (x, y) => [num(x + box.originX), num(y + box.originY)];

  const rulerSvg = (() => {
    const [bx, by] = at(rulerX, rulerYBase);
    const [tx, ty] = at(rulerX, rulerYTop);
    const ticks = zTicks.map((tick) => {
      const [px, py] = at(...pos(xMin, rulerLaneName, tick));
      return `<line x1="${num(Number(px) - 3)}" y1="${py}" x2="${num(Number(px) + 3)}" y2="${py}" stroke="var(--ink-3)" stroke-width="0.6"></line><text x="${num(Number(px) - 6)}" y="${num(Number(py) + 3)}" text-anchor="end" class="vtiny" fill="var(--ink-3)">${escapeHtml(num(tick, 0))}</text>`;
    }).join('');
    return `<line x1="${bx}" y1="${by}" x2="${tx}" y2="${ty}" stroke="var(--ink-3)" stroke-width="0.6" stroke-dasharray="2 2"></line>${ticks}<text x="${num(Number(tx) - 8)}" y="${num(Number(ty) - 6)}" text-anchor="end" class="vtiny" fill="var(--ink-3)">${escapeHtml(zLabel)}</text>`;
  })();

  const band = bandBetween && laneY.has(bandBetween[0]) && laneY.has(bandBetween[1])
    ? (() => {
      const low = validLanes.find((lane) => lane.name === bandBetween[0]);
      const high = validLanes.find((lane) => lane.name === bandBetween[1]);
      const forward = low.points.map((point) => at(...pos(point.x, low.name, point.z)));
      const backward = [...high.points].reverse().map((point) => at(...pos(point.x, high.name, point.z)));
      return `<polygon points="${[...forward, ...backward].map(([x, y]) => `${x},${y}`).join(' ')}" fill="var(--struct-bg)" opacity="0.55"></polygon>`;
    })()
    : '';

  const cliffSvg = cliffAt && Number.isFinite(cliffAt.x) && cliffAt.x >= xMin && cliffAt.x <= xMax
    ? (() => {
      const [tx1, ty1] = at(...pos(cliffAt.x, validLanes[0].name, maxZ));
      const [tx2, ty2] = at(...pos(cliffAt.x, validLanes[validLanes.length - 1].name, 0));
      return `<line x1="${tx1}" y1="${ty1}" x2="${tx2}" y2="${ty2}" stroke="var(--risk)" stroke-width="1.1" stroke-dasharray="3 3"><title>${escapeHtml(cliffAt.title ?? `Cliff at ${cliffAt.x}`)}</title></line>`;
    })()
    : '';

  const laneSvg = validLanes.map((lane) => {
    const pts = lane.points.map((point) => at(...pos(point.x, lane.name, point.z)));
    const line = `<polyline points="${pts.map(([x, y]) => `${x},${y}`).join(' ')}" fill="none" stroke="${lane.colorVar ?? 'var(--struct)'}" stroke-width="1.6"></polyline>`;
    const dots = lane.points.map((point) => {
      const [dx, dy] = at(...pos(point.x, lane.name, point.z));
      return `<circle cx="${dx}" cy="${dy}" r="3" fill="${lane.colorVar ?? 'var(--struct)'}"><title>${escapeHtml(`${lane.name}, ${xLabel} ${point.x}: ${num(point.z, 1)} ${zLabel}`)}</title></circle>`;
    }).join('');
    const [labelX, labelY] = at(...pos(xMin, lane.name, 0));
    const label = `<text x="${num(Number(labelX) - 8)}" y="${labelY}" text-anchor="end" class="vtiny" fill="var(--ink-2)">${escapeHtml(lane.name)}</text>`;
    return `${line}${dots}${label}`;
  }).join('');

  const xLabelSvg = (xTicks.length ? xTicks : xValues).map((tick) => {
    const [tx, ty] = at(...pos(tick, validLanes[validLanes.length - 1].name, 0));
    return `<text x="${tx}" y="${num(Number(ty) + 14)}" text-anchor="middle" class="vtiny" fill="var(--ink-3)">${escapeHtml(tick)}</text>`;
  }).join('') + `<text x="${num(Number(at(...pos((xMin + xMax) / 2, validLanes[validLanes.length - 1].name, 0))[0]))}" y="${num(Number(at(...pos((xMin + xMax) / 2, validLanes[validLanes.length - 1].name, 0))[1]) + 26)}" text-anchor="middle" class="vtiny" fill="var(--ink-3)">${escapeHtml(xLabel)}</text>`;

  const fallback = fallbackTable(
    [xLabel, ...validLanes.map((lane) => lane.name)],
    xValues.map((x) => [x, ...validLanes.map((lane) => {
      const point = lane.points.find((item) => item.x === x);
      return point ? num(point.z, 1) : '—';
    })]),
  );

  return wrapChart({ ariaLabel, bbox: box, body: `${band}${rulerSvg}${cliffSvg}${laneSvg}${xLabelSvg}`, fallback });
}
