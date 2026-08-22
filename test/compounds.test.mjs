import assert from 'node:assert/strict';
import test from 'node:test';
import { retrieveKnownTargetCompounds } from '../src/mend/compounds.mjs';

test('retrieves and groups source-linked ChEMBL activities for an arbitrary target', async () => {
  const requests = [];
  const result = await retrieveKnownTargetCompounds({
    target: 'EGFR', uniprot_id: 'P00533', disease: 'Glioblastoma', maxActivities: 25,
    fetchImpl: async (url) => {
      requests.push(String(url));
      if (String(url).includes('/target.json')) return { ok: true, json: async () => ({ targets: [{
        target_chembl_id: 'CHEMBL203', pref_name: 'Epidermal growth factor receptor', target_type: 'SINGLE PROTEIN',
        target_components: [{ accession: 'P00533' }],
      }] }) };
      return { ok: true, json: async () => ({ activities: [
        { activity_id: 1, molecule_chembl_id: 'CHEMBL1', molecule_pref_name: 'Example', assay_chembl_id: 'CHEMBLA1', standard_type: 'IC50', standard_relation: '=', standard_value: '10', standard_units: 'nM', pchembl_value: '8' },
        { activity_id: 2, molecule_chembl_id: 'CHEMBL1', assay_chembl_id: 'CHEMBLA2', standard_type: 'Ki', standard_value: '20', standard_units: 'nM', pchembl_value: '7.7' },
        { activity_id: 3, molecule_chembl_id: 'CHEMBL2', standard_type: 'IC50', standard_value: null, pchembl_value: null },
      ] }) };
    },
  });
  assert.equal(result.chembl_target.target_chembl_id, 'CHEMBL203');
  assert.equal(result.compounds.length, 2);
  assert.equal(result.compounds[0].molecule_chembl_id, 'CHEMBL1');
  assert.equal(result.compounds[0].activity_count, 2);
  assert.equal(result.compounds[0].best_pchembl_value, 8);
  assert.match(result.compounds[0].activities[0].source_url, /chembl/);
  assert.match(result.scope, /not evidence.*displayed pocket/i);
  assert.match(requests[0], /P00533/);
  assert.match(requests[1], /CHEMBL203/);
});

test('fails loudly when ChEMBL cannot map the selected target', async () => {
  await assert.rejects(() => retrieveKnownTargetCompounds({
    target: 'EGFR', uniprot_id: 'P00533',
    fetchImpl: async () => ({ ok: true, json: async () => ({ targets: [] }) }),
  }), /no target mapped/);
});
