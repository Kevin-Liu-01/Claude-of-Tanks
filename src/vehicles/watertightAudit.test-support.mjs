// Fleet watertight gate (2026-10-02): every playable hull and turret holds water with its shipped interior fills, so
// a fill record left behind by a geometry change can no longer drift unseen (65 of 176 full-body hulls had). A fleet
// audit (fleetPass.test-support.mjs) on the factory's default build, shared by fleetPassDefault.selftest: that build
// voxelises the same body as tools/tank-watertight-check.mjs and tools/gen-interior-fills.mjs. The pass builds without
// the fill registry, so the audit attaches each tank's generated fills itself through the factory's own
// applyInteriorFills (the same meshes, frames and float32 boxes), measures through the CLI's shared measurement
// (tools/tank-watertight-measure.mjs: fill-policy body, track lanes, retained air and declared bore air reported apart)
// and removes the fills again before the next audit sees the build.
// 2026-10-06: moving-part clearance air (tools/moving-clearance-air.mjs: pockets under the moving gun group, and a
// declared finite clearance's cut cells) is reported apart too; a declared record whose lattice no longer matches the
// build fails the gate, as a stale fill record does.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { collectTriangles } from '../../tools/tank-surface-collect.mjs';
import { trackLaneBoxesForVoxel } from '../../tools/track-lane-boxes.mjs';
import { physicalBoreAir } from '../../tools/physical-bore-air.mjs';
import {
  WATERTIGHT_MAX_LEAK_L, WATERTIGHT_VOXEL, measureWatertight, movingClearanceAir, retainedSourceAir, watertightBody,
} from '../../tools/tank-watertight-measure.mjs';
import { applyInteriorFills } from './interiorFills.ts';
import { INTERIOR_FILL_GROUP_LOADERS } from './interiorFillLoaders.generated.ts';

const RIGS = ['rig_hull', 'rig_turret', 'rig_gun'];

/** `records` replaces the shipped fill records (the audit's own negative controls); the pass passes nothing. */
export async function createWatertightAudit({ records: replaced = null } = {}) {
  const records = {};
  if (replaced) Object.assign(records, replaced);
  else for (const load of Object.values(INTERIOR_FILL_GROUP_LOADERS)) Object.assign(records, (await load()).INTERIOR_FILLS);
  const material = new THREE.MeshBasicMaterial();
  const leaks = [];
  let measured = 0, laneL = 0, retainedL = 0, boreL = 0, boreHulls = 0, fillPolicyHulls = 0, movingL = 0, movingHulls = 0;
  return {
    check(id, visual) {
      const root = visual.root;
      let shipped = false;
      root.traverse((object) => { if (object.userData?.interiorFill) shipped = true; });
      const [hullG, turretG, gunG] = RIGS.map((name) => root.getObjectByName(name) ?? null);
      const before = new Map([hullG, turretG, gunG].filter(Boolean).map((rig) => [rig, [...rig.children]]));
      const disposables = [];
      if (!shipped) applyInteriorFills({ specId: id, hullG, turretG, gunG, material, disposables, record: records[id] ?? null });
      try {
        const { tris, meshes } = collectTriangles(root);
        const body = watertightBody(id, tris, meshes);
        if (body !== tris) fillPolicyHulls++;
        const boreAir = physicalBoreAir(root);
        const r = measureWatertight(body, meshes, trackLaneBoxesForVoxel(root, WATERTIGHT_VOXEL),
          { retainedAir: retainedSourceAir(id), boreAir, movingAir: movingClearanceAir(id) });
        measured++; laneL += r.trackLaneL; retainedL += r.retainedL; boreL += r.boreAirL; if (boreAir) boreHulls++;
        movingL += r.movingClearanceL; if (r.movingClearanceL) movingHulls++;
        if (!r.watertight) {
          leaks.push(`${id}: ${r.leakL} L reaches the deep interior in ${r.clusters.length} gap(s); largest `
            + r.clusters.slice(0, 3).map((c) => `${c.litres} L at (${c.centre.join(', ')}) near ${c.groups.join(' ')}`).join('; '));
        }
        if (r.clearanceStale) leaks.push(`${id}: its declared moving-clearance record (docs/geometry-gate/moving-clearance-air.json) no longer matches the build's lattice`);
      } finally {
        for (const [rig, children] of before) for (const child of [...rig.children]) if (!children.includes(child)) rig.remove(child);
        for (const resource of disposables) resource.dispose();
      }
    },
    finish() {
      assert.equal(leaks.length, 0, `${leaks.length} hull(s) leak past the ${WATERTIGHT_MAX_LEAK_L} L watertight gate `
        + `(regenerate: node tools/gen-interior-fills.mjs --ids=<id> --rounds=8 --min-fine=1):\n  ${leaks.join('\n  ')}`);
      console.log(`watertight: ${measured} hulls hold water with their shipped fills (${fillPolicyHulls} on their fill-policy `
        + `boundary); ${laneL.toFixed(2)} L of track-lane air, ${retainedL.toFixed(2)} L of retained source air, `
        + `${boreL.toFixed(2)} L of declared bore air (${boreHulls} physical bores) and ${movingL.toFixed(2)} L of moving-part `
        + `clearance air (${movingHulls} hulls) reported apart`);
    },
  };
}
