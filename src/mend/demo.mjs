import { readFile } from 'node:fs/promises';
import { runXAxis } from '../axes/x-pipeline-adapter.mjs';
import { runYAxis } from '../axes/y/structure.mjs';
import { runZAxis } from '../axes/z-ip-activity.mjs';
import { runSiteGeography } from '../axes/x/site-geography.mjs';
import { runTargetIdentity } from '../axes/y/target-identity.mjs';
import { runOrphanExclusivity } from '../axes/z/orphan-exclusivity.mjs';
import { healthySnapshot, runVerticalSlice } from './vertical-slice.mjs';

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`../../fixtures/xyz/${name}`, import.meta.url), 'utf8'));
}

export async function createDemoAxisRunners({ clock = () => new Date('2026-08-22T18:00:00.000Z') } = {}) {
  const [xNormal, xBroken, xRepaired, xSites, yFixture, yTarget, zFixture, zOrphan] = await Promise.all([
    fixture('x-pipeline-normal-v1.json'),
    fixture('x-pipeline-broken-v1.json'),
    fixture('x-pipeline-repaired-v2.json'),
    fixture('x-trial-sites.json'),
    fixture('y-structure-rcsb.json'),
    fixture('y-target-uniprot-p01009.json'),
    fixture('z-ip-serpina1.json'),
    fixture('z-orphan-serpina1.json'),
  ]);

  return {
    X: async ({ mode, previousHealthy }) => {
      const execution = mode === 'broken'
        ? { snapshot: xBroken, mode: 'fail', adapterVersion: 'v1' }
        : mode === 'repaired'
          ? { snapshot: xRepaired, mode: 'recover', adapterVersion: 'v2' }
          : { snapshot: xNormal, mode: 'normal', adapterVersion: 'v1' };
      const pipeline = runXAxis({ ...execution, previousHealthy });
      const geography = await runSiteGeography({
        retrieve: async () => xSites,
        sourceName: 'Mend deterministic trial site fixture',
        clock,
      });
      return { ...pipeline, sub_axes: { site_geography: geography } };
    },
    Y: async () => {
      const structures = await runYAxis({ fixture: yFixture, retrievedAt: clock().toISOString() });
      const identity = await runTargetIdentity({
        retrieve: async () => yTarget,
        sourceName: 'UniProtKB (saved response)',
        clock,
      });
      return { ...structures, sub_axes: { target_identity: identity } };
    },
    Z: async () => {
      const ip = await runZAxis({
        retrieve: async () => zFixture.records,
        sourceName: 'Mend deterministic patent activity fixture',
        clock,
      });
      const orphan = await runOrphanExclusivity({
        retrieve: async () => zOrphan.records,
        sourceName: 'Mend deterministic orphan designation fixture',
        clock,
      });
      // Two record sets under one axis, kept separate: crowding and market model are
      // different questions and flattening them would lose which is which.
      return { ...ip, sub_axes: { orphan_exclusivity: orphan } };
    },
  };
}

export async function runDemoLifecycle({ telemetry } = {}) {
  const axisRunners = await createDemoAxisRunners();
  const healthy = await runVerticalSlice({
    axisRunners,
    mode: 'normal',
    runId: 'mend-v1-healthy',
    factoryVersion: 'v1',
    telemetry,
  });
  const previousHealthy = healthySnapshot(healthy);
  const failed = await runVerticalSlice({
    axisRunners,
    mode: 'break-x',
    previousHealthy,
    runId: 'mend-v1-x-failed',
    factoryVersion: 'v1',
    telemetry,
  });
  const recovered = await runVerticalSlice({
    axisRunners,
    mode: 'repaired',
    previousHealthy,
    runId: 'mend-v2-recovered',
    factoryVersion: 'v2',
    telemetry,
  });
  return { healthy, failed, recovered };
}
