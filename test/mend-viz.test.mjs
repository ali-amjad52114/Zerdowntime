import assert from 'node:assert/strict';
import test from 'node:test';
import { cellDiagram, regionBars, resolutionPlot, sequenceTrack } from '../src/mend/viz.mjs';

const ALL = [
  ['cell diagram', () => cellDiagram(['Secreted'])],
  ['region bars', () => regionBars({ regions: [{ region: 'Europe', trials: 2, countries: 1 }], countries: [{ country: 'Germany', trials: 2, sites: 2 }], total_sites: 2, countries_covered: 1, single_country_trials: 1 })],
  ['sequence track', () => sequenceTrack({ length: 418, features: [{ kind: 'signal', type: 'Signal', start: 1, end: 24 }], hotspots: [{ start: 360, count: 2 }] })],
  ['resolution plot', () => resolutionPlot([{ id: '1QLP', method: 'X-RAY DIFFRACTION', resolution: 2 }])],
];

test('every visualisation degrades to a caption instead of an empty box', () => {
  for (const markup of [
    cellDiagram([]),
    regionBars({ regions: [] }),
    sequenceTrack({ length: null }),
    resolutionPlot([]),
  ]) {
    assert.match(markup, /class="vcap"/);
    assert.doesNotMatch(markup, /<svg/);
  }
  assert.match(sequenceTrack({}), /No sequence length/);
  assert.match(resolutionPlot([{ id: '1ABC', method: 'X-RAY DIFFRACTION' }]), /No entry in this set reports a resolution/);
});

test('every mark carries a title so hovering gives the record behind it', () => {
  for (const [name, render] of ALL) {
    assert.match(render(), /<title>|title="/, `${name} needs hover titles`);
  }
});

test('visualisations take their colours from the stylesheet so both themes work', () => {
  for (const [name, render] of ALL) {
    assert.doesNotMatch(render(), /#[0-9a-fA-F]{6}/, `${name} should not hard-code a hex colour`);
  }
  // The SVG marks name their variables directly; the bar chart is styled by class.
  for (const name of ['cell diagram', 'sequence track', 'resolution plot']) {
    const [, render] = ALL.find(([label]) => label === name);
    assert.match(render(), /var\(--/, `${name} needs themed colours`);
  }
  assert.match(regionBars({ regions: [{ region: 'Europe', trials: 1, countries: 1 }], countries: [] }), /class="barfill"/);
});

test('the cell diagram lights up the annotated compartment and leaves the rest grey', () => {
  const secreted = cellDiagram(['Secreted']);
  assert.match(secreted, /Extracellular \/ secreted — annotated: Secreted/);
  assert.match(secreted, /Nucleus — not annotated/);
  const nuclear = cellDiagram(['Nucleus']);
  assert.match(nuclear, /Nucleus — annotated: Nucleus/);
  assert.match(nuclear, /Extracellular \/ secreted — not annotated/);
});

test('region bars flag a concentrated set and stay quiet otherwise', () => {
  const geography = {
    regions: [{ region: 'North America', trials: 3, countries: 1 }],
    countries: [{ country: 'United States', trials: 3, sites: 5 }],
    total_sites: 5, countries_covered: 1, single_country_trials: 3,
    concentrated: true, concentration_threshold: 0.6,
  };
  const flagged = regionBars(geography);
  assert.match(flagged, /geographically concentrated/);
  assert.match(flagged, /class="vcap flagged"/);
  assert.doesNotMatch(regionBars({ ...geography, concentrated: false }), /geographically concentrated/);
});

test('the sequence track scales spans and variant bins to the sequence length', () => {
  const markup = sequenceTrack({
    length: 400,
    features: [{ kind: 'signal', type: 'Signal', start: 1, end: 200, description: 'half the protein' }],
    hotspots: [{ start: 0, count: 1 }, { start: 380, count: 4 }],
  });
  assert.match(markup, /Signal: half the protein \(1–200\)/);
  assert.match(markup, /4 variants between residues 380 and 399/);
  assert.match(markup, /1 variant between residues 0 and 19/);
  assert.match(markup, /variants per 20 residues/);
});

test('the resolution plot draws the design-quality line and colours by method', () => {
  const markup = resolutionPlot([
    { id: '1QLP', method: 'X-RAY DIFFRACTION', resolution: 2 },
    { id: '8ABC', method: 'ELECTRON MICROSCOPY', resolution: 3.9 },
  ]);
  assert.match(markup, /3\.5 Å/);
  assert.match(markup, /stroke-dasharray/);
  assert.match(markup, /var\(--vres-em\)/);
  assert.match(markup, /var\(--vres-xray\)/);
  assert.match(markup, /1QLP · x-ray diffraction · 2 Å/);
});

test('user-supplied text is escaped before it reaches the markup', () => {
  const markup = regionBars({
    regions: [{ region: '<script>alert(1)</script>', trials: 1, countries: 1 }],
    countries: [], total_sites: 1, countries_covered: 1, single_country_trials: 1,
  });
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /&lt;script&gt;/);
});
