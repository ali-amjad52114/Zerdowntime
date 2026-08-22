import assert from 'node:assert/strict';
import test from 'node:test';
import * as assumptions from '../src/mend/illustrative-assumptions.mjs';
import {
  ACCESS_RAMP_CURVE,
  CHANNEL_WEIGHTS,
  COMPLEXITY_HEADCOUNT_MULTIPLIER,
  DIAGNOSED_SHARE,
  DISCLAIMER,
  HEADCOUNT_FUNCTIONS,
  HEADCOUNT_PHASES,
  HEADCOUNT_RATIOS,
  ORPHAN_URGENCY_MULTIPLIERS,
  POST_CLIFF_EROSION_FLOOR,
  PRICE_SCENARIO_MULTIPLIERS,
} from '../src/mend/illustrative-assumptions.mjs';

test('the disclaimer says plainly this file is not sourced facts', () => {
  assert.match(DISCLAIMER, /not a cited fact/i);
  assert.match(DISCLAIMER, /modeling choice|modeled fit/i);
});

test('no constant in this file carries a URL — that is reference-tables.mjs\'s job', () => {
  // A URL here would mean a "citable" fact snuck into the uncited file, blurring the one
  // boundary this repo works hardest to keep clean.
  const serialized = JSON.stringify(assumptions, (key, value) => (typeof value === 'function' ? undefined : value));
  assert.doesNotMatch(serialized, /https?:\/\//);
});

test('every channel weight and every phase/function ratio carries a basis', () => {
  for (const entry of CHANNEL_WEIGHTS) {
    assert.ok(entry.channel, 'channel weight needs a channel name');
    assert.ok(Number.isFinite(entry.weight), `${entry.channel} needs a numeric weight`);
    assert.ok(entry.basis, `${entry.channel} needs a basis`);
  }
  for (const entry of Object.values(ORPHAN_URGENCY_MULTIPLIERS)) {
    assert.ok(entry.channel, 'urgency multiplier needs a target channel');
    assert.ok(Number.isFinite(entry.multiplier));
    assert.ok(entry.basis);
  }
  for (const table of [ACCESS_RAMP_CURVE, PRICE_SCENARIO_MULTIPLIERS, POST_CLIFF_EROSION_FLOOR, DIAGNOSED_SHARE, HEADCOUNT_RATIOS, COMPLEXITY_HEADCOUNT_MULTIPLIER]) {
    assert.ok(table.basis, 'every illustrative table needs a top-level basis');
  }
});

test('the access-ramp curve is cumulative, bounded in [0,1], and non-decreasing per scenario', () => {
  for (const scenario of ['low', 'base', 'high']) {
    const curve = ACCESS_RAMP_CURVE[scenario];
    assert.equal(curve.length, 5, `${scenario} curve should cover 5 years`);
    for (const value of curve) assert.ok(value >= 0 && value <= 1, `${scenario} share must be a fraction`);
    for (let year = 1; year < curve.length; year += 1) {
      assert.ok(curve[year] >= curve[year - 1], `${scenario} curve must not decrease year over year`);
    }
  }
  // The three scenarios should actually differ, or "low/base/high" would be decorative.
  assert.notDeepEqual(ACCESS_RAMP_CURVE.low, ACCESS_RAMP_CURVE.base);
  assert.notDeepEqual(ACCESS_RAMP_CURVE.base, ACCESS_RAMP_CURVE.high);
});

test('every headcount phase and function named elsewhere has a ratio defined here', () => {
  for (const phase of HEADCOUNT_PHASES) {
    assert.ok(HEADCOUNT_RATIOS[phase], `${phase} needs a headcount row`);
    for (const fn of HEADCOUNT_FUNCTIONS) {
      assert.ok(Number.isFinite(HEADCOUNT_RATIOS[phase][fn]), `${phase}/${fn} needs a headcount number`);
    }
  }
});

test('the complexity multiplier covers every complexity class MODALITIES uses', () => {
  for (const complexity of ['low', 'moderate', 'high', 'very high']) {
    assert.ok(Number.isFinite(COMPLEXITY_HEADCOUNT_MULTIPLIER[complexity]), `${complexity} needs a multiplier`);
  }
});
