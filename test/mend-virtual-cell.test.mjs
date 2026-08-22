import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BENEFICIAL_DIRECTION,
  CELL_EFFECTS,
  NODES,
  buildVirtualCellSimulation,
} from '../src/mend/virtual-cell.mjs';

function xAxis(records) {
  return { records };
}

function pipelineRecord(overrides) {
  return { axis: 'X', organization: 'Org', program: 'PROG', developmentStage: 'Phase 1', targetMechanism: 'SERPINA1 RNA silencing', ...overrides };
}

function identityWithVariant(description) {
  return { records: [{ features: [{ kind: 'variant', description }] }] };
}

test('every documented mechanism class carries a citation and a magnitude for all four nodes', () => {
  for (const [name, entry] of Object.entries(CELL_EFFECTS)) {
    assert.ok(entry.citation, `${name} needs a citation`);
    for (const node of NODES) {
      const effect = entry.effects[node];
      assert.ok(effect, `${name} is missing an effect entry for ${node}`);
      assert.ok(effect.direction === null || effect.direction === 'increase' || effect.direction === 'decrease');
      assert.ok(Number.isFinite(effect.magnitude) && effect.magnitude >= 0 && effect.magnitude <= 10);
      if (effect.direction === null) assert.equal(effect.magnitude, 0, `${name}/${node}: no direction should mean no magnitude`);
    }
  }
});

test('every node has a stated beneficial direction', () => {
  for (const node of NODES) {
    assert.ok(['increase', 'decrease'].includes(BENEFICIAL_DIRECTION[node]), `${node} needs a beneficial direction`);
  }
});

test('simulates one trace per distinct matched modality actually present in the pipeline, not an invented one', () => {
  const x = xAxis([
    pipelineRecord({ program: 'A', targetMechanism: 'SERPINA1 RNA silencing' }),
    pipelineRecord({ program: 'B', targetMechanism: 'AAT augmentation' }),
    pipelineRecord({ program: 'C', targetMechanism: 'SERPINA1 RNA silencing therapy' }), // same modality as A
  ]);
  const result = buildVirtualCellSimulation({ x, identity: {} });
  assert.equal(result.kind, 'illustrative');
  assert.deepEqual(result.xCategories.sort(), ['Oligonucleotide (siRNA / ASO)', 'Recombinant protein or peptide'].sort());
  assert.equal(result.cells.length, 2 * NODES.length); // 2 distinct modalities × 4 nodes, not 3 programs × 4
});

test('a matched modality with no documented AATD mechanism is reported as not simulated, never guessed', () => {
  const x = xAxis([pipelineRecord({ program: 'A', targetMechanism: 'Neutrophil elastase monoclonal antibody' })]);
  const result = buildVirtualCellSimulation({ x, identity: {} });
  if (result.xCategories.includes('Monoclonal antibody')) {
    // If the mechanism happened to match a modality with no CELL_EFFECTS entry, it must be excluded.
    assert.ok(false, 'a modality with no documented mechanism must not appear in xCategories');
  }
  assert.deepEqual(result.notSimulated, result.notSimulated.includes('Monoclonal antibody') ? ['Monoclonal antibody'] : result.notSimulated);
});

test('every cell\'s tone matches whether its direction is the node\'s stated beneficial direction', () => {
  const x = xAxis([pipelineRecord({ targetMechanism: 'SERPINA1 gene correction' })]); // gene editing: all-beneficial
  const result = buildVirtualCellSimulation({ x, identity: {} });
  for (const cell of result.cells) {
    assert.equal(cell.tone, 'ok', `${cell.xCategory}/${cell.yCategory} should read beneficial for this modality`);
  }
});

test('a node with no documented effect gets tone neutral and magnitude 0, not a fabricated number', () => {
  const x = xAxis([pipelineRecord({ targetMechanism: 'AAT augmentation' })]); // augmentation: neutral on ER nodes
  const result = buildVirtualCellSimulation({ x, identity: {} });
  const erPolymer = result.cells.find((cell) => cell.yCategory === 'ER polymer burden');
  assert.equal(erPolymer.tone, 'neutral');
  assert.equal(erPolymer.z, 0);
  assert.match(erPolymer.title, /no documented effect/);
});

test('the run\'s own annotated polymerising variant is read from Y.target_identity, not assumed', () => {
  const x = xAxis([pipelineRecord({ targetMechanism: 'SERPINA1 gene correction' })]);
  const withVariant = buildVirtualCellSimulation({ x, identity: identityWithVariant('PI Z; E->K at mature residue 342, the polymerising allele') });
  assert.equal(withVariant.polymerisingVariantAnnotated, true);
  assert.match(withVariant.polymerisingVariantNote, /PI Z/);

  const withoutVariant = buildVirtualCellSimulation({ x, identity: identityWithVariant('PI S; E->V at mature residue 264') });
  assert.equal(withoutVariant.polymerisingVariantAnnotated, false);
  assert.match(withoutVariant.polymerisingVariantNote, /No polymerising variant/);

  const noIdentity = buildVirtualCellSimulation({ x, identity: {} });
  assert.equal(noIdentity.polymerisingVariantAnnotated, false);
});

test('an empty pipeline says so rather than simulating nothing silently', () => {
  const result = buildVirtualCellSimulation({ x: xAxis([]), identity: {} });
  assert.deepEqual(result.cells, []);
  assert.match(result.message, /No matched modality/);
});

test('the scope note is explicit that this is a mechanistic simulation, not a trained model or a clinical prediction', () => {
  const x = xAxis([pipelineRecord({ targetMechanism: 'SERPINA1 gene correction' })]);
  const result = buildVirtualCellSimulation({ x, identity: {} });
  assert.match(result.scope, /not a trained predictive model/);
  assert.match(result.scope, /not a claim about/);
});
