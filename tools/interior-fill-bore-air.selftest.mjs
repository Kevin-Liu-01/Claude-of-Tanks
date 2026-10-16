// Shipped interior fills keep out of open bore air (tank-opt WRECK verify 2026-10-16; tools/interior-fill-bore-air.mjs).
//
// The fill generator never fills a voxel that can touch one of a tank's open muzzle bores (tools/physical-bore-air.mjs).
// Records generated before a bore was declared or carved kept boxes there: one-voxel turret-frame rods, 25-175 mm long,
// inside the carved bores of t80, t80b, type10_tk_x, ua_t80bv and t90a. Turret stock in the gun's recess stays put when
// the gun elevates, droops or bends, so it hung in the air where the muzzle was, 0.13-0.28 m from every wreck's bent gun.
// Gun-frame stock also capped c1_ariete's and c2_ariete's recesses. Pins:
//   (1) the prune on a synthetic bore: a box wholly in bore air goes, a box partly in it keeps exactly its voxels outside
//       it, in place; untouched boxes and components stay byte for byte; the group line rewrite moves only the changed
//       strings, and a component left empty drops its field;
//   (2) the seven records ship no fill voxel in bore air, each tank built as the generator builds it;
//   (3) the floating rod itself: no hull- or turret-frame fill box sits on the five rod tanks' gun bores past their
//       mantlets (gun-frame stock rides the gun, so only it may lie there).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import './tank-surface-collect.mjs';
import { decodeFillSpans, encodeFillSpans, pruneBoreAirFills, rewriteGroupRecord } from './interior-fill-bore-air.mjs';
import { physicalBoreAir } from './physical-bore-air.mjs';
import { createTank } from '../src/vehicles/tankFactory.ts';
import { ensureInteriorFills, interiorFillBoxes, interiorFillRecord } from '../src/vehicles/interiorFills.ts';
import { TANK_SPECS } from '../src/vehicles/specs.ts';

// ---- (1) the prune ---------------------------------------------------------------------------------------------------
{
  // a 50 mm bore along +z, mouth at z 1, 0.2 m deep; the lattice at 25 mm from (-0.2, -0.2, 0.5): voxel i's centre is
  // -0.2 + (i + 0.5) 0.025 (x = 0 between i 7 and 8), bore air reaches 0.0717 m from the axis and z 0.778-1.022
  const bore = { worldToBore: new THREE.Matrix4(), boreToWorld: new THREE.Matrix4(), innerRadiusM: 0.05, depthM: 0.2, muzzleZ: 1 };
  const inside = [7, 7, 12, 8, 8, 18], across = [4, 7, 12, 11, 7, 12], away = [0, 0, 0, 1, 1, 1];
  const record = { v: 0.025, o: [-0.2, -0.2, 0.5], t: [0, 0, 0], g: [0, 0, 0],
    hull: encodeFillSpans(away), turret: encodeFillSpans([...inside, ...across, ...away]), gun: encodeFillSpans(inside) };
  assert.deepEqual(Array.from(decodeFillSpans(record.turret)), [...inside, ...across, ...away], 'spans round-trip');
  const { hits, record: pruned, removedVoxels } = pruneBoreAirFills(bore, record);
  assert.deepEqual(hits.map((h) => [h.component, h.box, h.inside, h.total]), [['turret', 0, 28, 28], ['turret', 1, 6, 8], ['gun', 0, 28, 28]],
    'every box holding bore air, and how much');
  assert.equal(removedVoxels, 62, 'the voxels left open');
  assert.equal(pruned.hull, record.hull, 'an untouched component stays byte for byte');
  assert.deepEqual(Array.from(decodeFillSpans(pruned.turret)), [4, 7, 12, 4, 7, 12, 11, 7, 12, 11, 7, 12, ...away],
    'the wholly-inside box goes, the crossing box keeps its two outside voxels in place, the box away stays');
  assert.ok(!('gun' in pruned), 'a component left empty drops its field');
  assert.equal(pruneBoreAirFills(null, record).record, record, 'no open bore: the record itself comes back');
  assert.equal(pruneBoreAirFills(bore, pruned).hits.length, 0, 'the pruned record holds no bore air');
  const line = (r) => `  "x": { v: ${r.v}, o: [${r.o.join(', ')}], t: [${r.t.join(', ')}], g: [${r.g.join(', ')}], hull: ${JSON.stringify(r.hull)}`
    + `, turret: ${JSON.stringify(r.turret)}${r.gun ? `, gun: ${JSON.stringify(r.gun)}` : ''} },`;
  const text = ['// header', line({ ...record, hull: record.turret, turret: record.hull }).replace('"x"', '"y"'), line(record), '});', ''].join('\n');
  const expected = text.replace(line(record), line(pruned));
  assert.equal(rewriteGroupRecord(text, 'x', record, pruned), expected, 'only the id\'s changed strings move');
  assert.throws(() => rewriteGroupRecord(text, 'z', record, pruned), /not exactly one record line/, 'an unknown id is refused');
}

// ---- (2) and (3): the shipped records ----------------------------------------------------------------------------------
const RODS = ['t80', 't80b', 'type10_tk_x', 'ua_t80bv', 't90a'];
const IDS = [...RODS, 'c1_ariete', 'c2_ariete'];
await ensureInteriorFills(IDS);
for (const id of IDS) {
  const record = interiorFillRecord(id);
  assert.ok(record, `${id}: ships interior fills`);
  const tank = createTank(id, null, { proceduralOnly: true });
  try {
    const bore = physicalBoreAir(tank.root);
    assert.ok(bore, `${id}: an open bore (declared or carved)`);
    const { hits } = pruneBoreAirFills(bore, record);
    assert.deepEqual(hits.map((h) => `${h.component}#${h.box}`), [], `${id}: no shipped fill voxel in open bore air`);
    if (!RODS.includes(id)) continue;
    // the rod: a hull- or turret-frame box on the bore's line past the barrel's midpoint (the audit's measure)
    const root = tank.root, gunInv = root.getObjectByName('rig_gun').matrixWorld.clone().invert();
    const muzzle = root.getObjectByName('rig_muzzle').getWorldPosition(new THREE.Vector3()).applyMatrix4(gunInv);
    const r = TANK_SPECS[id].armor.gunBarrel?.radiusM ?? 0.06;
    for (const component of ['hull', 'turret']) {
      for (const [cx, cy, cz] of interiorFillBoxes(record, component)) {
        const c = new THREE.Vector3(cx, cy, cz).applyMatrix4(root.matrixWorld).applyMatrix4(gunInv);
        assert.ok(!(Math.hypot(c.x - muzzle.x, c.y - muzzle.y) < r && c.z > 0.5 * muzzle.z),
          `${id}: ${component}-frame fill at gun z ${c.z.toFixed(3)} on the bore floats free of the gun`);
      }
    }
  } finally {
    tank.dispose();
  }
}
console.log(`interior-fill-bore-air selftest: the prune exact; ${IDS.length} records clear of open bore air, no rod on ${RODS.length} bores`);
