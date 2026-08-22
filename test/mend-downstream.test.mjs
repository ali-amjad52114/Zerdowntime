import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGoToMarket,
  buildInsightGeneralization,
  buildProductPositioning,
  buildResourcing,
  buildRevenueForecast,
} from '../src/mend/downstream.mjs';

function xAxis(records, summary = {}) {
  return { records, summary: { programsFound: records.length, organizations: new Set(records.map((r) => r.organization)).size, mostAdvancedStage: null, ...summary } };
}

function pipelineRecord(overrides) {
  return { axis: 'X', organization: 'Org', program: 'PROG', developmentStage: 'Phase 1', targetMechanism: 'SERPINA1 RNA silencing', ...overrides };
}

test('product positioning plots one point per matched program, computed only, no illustrative values', () => {
  const x = xAxis([
    pipelineRecord({ program: 'A', organization: 'One', developmentStage: 'Phase 1', targetMechanism: 'SERPINA1 RNA silencing' }),
    pipelineRecord({ program: 'B', organization: 'Two', developmentStage: 'Approved', targetMechanism: 'SERPINA1 gene correction' }),
    pipelineRecord({ program: 'C', organization: 'Three', developmentStage: 'Phase 2', targetMechanism: 'Neutrophil elastase inhibition' }),
  ]);
  const result = buildProductPositioning({ x });
  assert.equal(result.kind, 'computed');
  assert.equal(result.points.length, 2, 'the unmatched-modality program is excluded from the chart');
  assert.deepEqual(result.excludedNoModality, ['C']);
  const [a, b] = result.points;
  assert.equal(a.x, 3, 'Phase 1 stage rank');
  assert.equal(b.x, 8, 'Approved stage rank');
  assert.ok(Number.isFinite(a.y) && a.y >= 0 && a.y <= 10);
  assert.ok(Number.isFinite(a.z) && a.z >= 0 && a.z <= 10);
});

test('product positioning differentiation drops as more programs share mechanism keywords', () => {
  const shared = xAxis([
    pipelineRecord({ program: 'A', targetMechanism: 'SERPINA1 RNA silencing' }),
    pipelineRecord({ program: 'B', targetMechanism: 'SERPINA1 RNA silencing therapy' }),
    pipelineRecord({ program: 'C', targetMechanism: 'SERPINA1 RNA silencing approach' }),
  ]);
  const alone = xAxis([
    pipelineRecord({ program: 'A', targetMechanism: 'SERPINA1 RNA silencing' }),
    pipelineRecord({ program: 'B', targetMechanism: 'SERPINA1 gene correction' }),
    pipelineRecord({ program: 'C', targetMechanism: 'SERPINA1 base editing' }),
  ]);
  const sharedResult = buildProductPositioning({ x: shared }).points.find((point) => point.label === 'A');
  const aloneResult = buildProductPositioning({ x: alone }).points.find((point) => point.label === 'A');
  assert.ok(sharedResult.y < aloneResult.y, 'a program crowded by identical mechanism text should score lower differentiation');
});

test('product positioning is empty and says so when no program has both a stage and a mechanism', () => {
  const result = buildProductPositioning({ x: xAxis([{ axis: 'X', organization: 'Org', program: null }]) });
  assert.deepEqual(result.points, []);
  assert.match(result.message, /No pipeline programs/);
});

test('go-to-market priority is real trial counts times illustrative channel weights, never degenerate', () => {
  const geography = { summary: { regions: [{ region: 'North America', trials: 4 }, { region: 'Europe', trials: 2 }] } };
  const orphan = { summary: { stalled_designations: 0, voucher: { voucher_signal: 'no paediatric designation on record in this set' } } };
  const result = buildGoToMarket({ geography, orphan });
  assert.equal(result.kind, 'illustrative');
  assert.equal(result.cells.length, 8); // 2 regions × 4 channels
  const values = new Set(result.cells.map((cell) => cell.z));
  assert.ok(values.size > 1, 'channels must not all score identically, or the grid is decorative');
});

test('a stalled designation boosts patient-advocacy priority, and the boost is stated on the cell', () => {
  const geography = { summary: { regions: [{ region: 'North America', trials: 4 }] } };
  const calm = buildGoToMarket({ geography, orphan: { summary: { stalled_designations: 0, voucher: {} } } });
  const urgent = buildGoToMarket({ geography, orphan: { summary: { stalled_designations: 1, voucher: {} } } });
  const calmAdvocacy = calm.cells.find((cell) => cell.yCategory === 'Patient advocacy & registries').z;
  const urgentAdvocacy = urgent.cells.find((cell) => cell.yCategory === 'Patient advocacy & registries').z;
  assert.ok(urgentAdvocacy > calmAdvocacy);
  assert.match(urgent.cells.find((cell) => cell.yCategory === 'Patient advocacy & registries').title, /boosted: a stalled orphan designation/);
  // An unrelated channel must not move.
  const calmDirect = calm.cells.find((cell) => cell.yCategory === 'Direct commercial').z;
  const urgentDirect = urgent.cells.find((cell) => cell.yCategory === 'Direct commercial').z;
  assert.equal(calmDirect, urgentDirect);
});

test('go-to-market is empty and says so when no regions are reported', () => {
  const result = buildGoToMarket({ geography: { summary: { regions: [] } }, orphan: { summary: {} } });
  assert.deepEqual(result.cells, []);
  assert.match(result.message, /No trial site regions/);
});

test('insight generalization never names an external disease and reads every one of six real signals', () => {
  const x = xAxis([pipelineRecord({ targetMechanism: 'SERPINA1 RNA silencing' })]);
  const geography = { summary: { regions: [{ region: 'Europe' }, { region: 'Asia' }] } };
  const y = { summary: { best_resolution_angstrom: 2.0 } };
  const identity = { summary: { secreted: true, subcellular_locations: ['Secreted'] } };
  const orphan = { summary: { designations: 2 } };
  const result = buildInsightGeneralization({ x, geography, y, identity, orphan });
  assert.equal(result.kind, 'computed');
  assert.equal(result.cells.length, 6);
  assert.deepEqual(result.xCategories, ['Mechanism & modality', 'Regulatory pathway', 'Manufacturing & CMC']);
  const serialized = JSON.stringify(result);
  for (const externalDisease of ['Gaucher', 'Fabry', 'Pompe', 'other misfolding', 'other orphan liver']) {
    assert.doesNotMatch(serialized, new RegExp(externalDisease, 'i'));
  }
  assert.match(result.scope, /not an extrapolation/);
});

test('insight generalization scores rise when the underlying signal is genuinely stronger', () => {
  const weakInputs = {
    x: xAxis([pipelineRecord({ targetMechanism: 'AAT folding corrector' })]), // unmatched modality
    geography: { summary: { regions: [] } },
    y: { summary: { best_resolution_angstrom: null } },
    identity: { summary: { secreted: false, subcellular_locations: [] } },
    orphan: { summary: { designations: 0 } },
  };
  const strongInputs = {
    x: xAxis([pipelineRecord({ targetMechanism: 'SERPINA1 RNA silencing' })]), // platform-language modality
    geography: { summary: { regions: [{ region: 'Europe' }, { region: 'Asia' }] } },
    y: { summary: { best_resolution_angstrom: 2.0 } },
    identity: { summary: { secreted: true, subcellular_locations: ['Secreted'] } },
    orphan: { summary: { designations: 3 } },
  };
  const weak = buildInsightGeneralization(weakInputs);
  const strong = buildInsightGeneralization(strongInputs);
  const total = (result) => result.cells.reduce((sum, cell) => sum + cell.z, 0);
  assert.ok(total(strong) > total(weak));
});

test('revenue model anchors on the cited epidemiology and cost tables and reports which are illustrative', () => {
  const x = xAxis([pipelineRecord({ targetMechanism: 'SERPINA1 RNA silencing' })]);
  const orphan = { summary: { clocks: [] } };
  const result = buildRevenueForecast({ x, orphan, disease: 'Alpha-1 Antitrypsin Deficiency' });
  assert.equal(result.kind, 'illustrative');
  assert.equal(result.lanes.length, 3);
  assert.deepEqual(result.lanes.map((lane) => lane.name), ['Low', 'Base', 'High']);
  for (const lane of result.lanes) assert.equal(lane.points.length, 5);
  assert.equal(result.addressablePopulation, 100000);
  assert.equal(result.cliffAt, null, 'no running exclusivity clock means no cliff');
  // Low must never exceed High in any year — the scenario spread has to make directional sense.
  result.lanes[0].points.forEach((point, index) => {
    assert.ok(point.z <= result.lanes[2].points[index].z);
  });
});

test('revenue model marks a real exclusivity cliff without claiming it as its own', () => {
  const x = xAxis([pipelineRecord({ targetMechanism: 'SERPINA1 RNA silencing' })]);
  const orphan = { summary: { clocks: [{ exclusivity_state: 'running', exclusivity_years_remaining: 2.5, exclusivity_ends: '2028-01-01', designation: 'Example (fixture)', agency: 'FDA' }] } };
  const result = buildRevenueForecast({ x, orphan, disease: 'Alpha-1 Antitrypsin Deficiency' });
  assert.equal(result.cliffAt.x, 2.5);
  assert.match(result.cliffAt.title, /not this model's own exclusivity date/);
  assert.match(result.cliffAt.title, /2028-01-01/);
  // Post-cliff years should show erosion relative to what an uninterrupted ramp would produce.
  const base = result.lanes.find((lane) => lane.name === 'Base').points;
  const yearBeforeCliff = base.find((point) => point.x === 2).z;
  const yearAfterCliff = base.find((point) => point.x === 3).z;
  assert.ok(yearAfterCliff < yearBeforeCliff * 3, 'the ramp curve alone would not explain this large a drop without erosion applying');
});

test('revenue model says so, without guessing a number, when there is no curated anchor for the disease', () => {
  const result = buildRevenueForecast({ x: xAxis([]), orphan: {}, disease: 'Some uncurated disease' });
  assert.deepEqual(result.lanes, []);
  assert.match(result.message, /No curated (cost|epidemiology) reference/);
});

test('resourcing scales illustrative ratios by the real curated modality complexity and marks "you are here"', () => {
  const x = xAxis(
    [pipelineRecord({ targetMechanism: 'SERPINA1 base editing' })], // very high complexity
    { mostAdvancedStage: 'Phase 2' },
  );
  const result = buildResourcing({ x });
  assert.equal(result.kind, 'illustrative');
  assert.equal(result.cells.length, 24); // 6 phases × 4 functions
  assert.equal(result.youAreHere, 'Phase 2');
  assert.ok(result.cells.some((cell) => cell.title.includes('you are here')));

  const lowComplexity = xAxis([pipelineRecord({ targetMechanism: 'Oral small molecule chaperone' })], { mostAdvancedStage: 'Phase 2' });
  const lowResult = buildResourcing({ x: lowComplexity });
  const highCell = result.cells.find((cell) => cell.xCategory === 'Phase 3' && cell.yCategory === 'Regulatory & CMC');
  const lowCell = lowResult.cells.find((cell) => cell.xCategory === 'Phase 3' && cell.yCategory === 'Regulatory & CMC');
  assert.ok(highCell.z > lowCell.z, 'a very-high-complexity modality should need more CMC headcount than a low-complexity one');
});

test('resourcing maps every reported X stage name, including slash-phases, to one of the six fixed buckets', () => {
  assert.equal(buildResourcing({ x: xAxis([], { mostAdvancedStage: 'Discovery' }) }).youAreHere, 'Discovery');
  assert.equal(buildResourcing({ x: xAxis([], { mostAdvancedStage: 'Phase 1/2' }) }).youAreHere, 'Phase 1');
  assert.equal(buildResourcing({ x: xAxis([], { mostAdvancedStage: 'Phase 2/3' }) }).youAreHere, 'Phase 2');
  assert.equal(buildResourcing({ x: xAxis([], { mostAdvancedStage: 'Approved' }) }).youAreHere, 'Launch');
  assert.equal(buildResourcing({ x: xAxis([], { mostAdvancedStage: null }) }).youAreHere, null);
});
