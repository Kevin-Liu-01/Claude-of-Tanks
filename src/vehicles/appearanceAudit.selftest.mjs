import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  auditTankAppearance, normalizeTankAppearance, tagVehicleMaterial,
  VEHICLE_APPEARANCE_PALETTE,
} from './appearanceAudit.ts';

const root = new THREE.Group();
const badTrack = tagVehicleMaterial(new THREE.MeshStandardMaterial({ color: 0x6e603c }), 'trackSteel');
const shoe = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), badTrack);
shoe.name = 'gearTrackPads';
shoe.userData.runningGear = true;
root.add(shoe);
assert.equal(auditTankAppearance(root).issues[0]?.code, 'saturated-running-gear');
normalizeTankAppearance(root);
assert.equal(badTrack.color.getHex(), VEHICLE_APPEARANCE_PALETTE.trackSteel);
assert.deepEqual(auditTankAppearance(root).issues, []);

const armor = tagVehicleMaterial(new THREE.MeshStandardMaterial({ color: 0x4a5a32 }), 'armorPaint');
const guard = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), armor);
guard.name = 'hullTrackGuardL';
guard.userData.trackGuard = true;
root.add(guard);
normalizeTankAppearance(root);
assert.equal(armor.color.getHex(), 0x4a5a32, 'camouflage armor is never normalized as gear');
assert.deepEqual(auditTankAppearance(root).issues, []);

console.log('appearanceAudit.selftest: semantic gear palette and armor protection pass');

// The real native shoe shader multiplies material.color by instanceColor.
// Normalize exactly once; keep the shared near/far palette and buffer intact.
const shoeMaterial=tagVehicleMaterial(new THREE.MeshStandardMaterial({color:0xffffff}),'trackPad');
shoeMaterial.userData.appearanceColorSource='instance-palette';
const near=new THREE.InstancedMesh(new THREE.BoxGeometry(.5,.05,.15),shoeMaterial,3);
const shades=[0x2e302f,0x373a38,0x3e413e];
shades.forEach((hex,i)=>near.setColorAt(i,new THREE.Color(hex)));
near.userData.runningGear=true;
const far=new THREE.InstancedMesh(near.geometry,shoeMaterial,3);
far.instanceColor=near.instanceColor;far.userData.runningGear=true;
const tracks=new THREE.Group();tracks.add(near,far);
const original=near.instanceColor.array.slice();
normalizeTankAppearance(tracks);normalizeTankAppearance(tracks);
assert.equal(shoeMaterial.color.getHex(),0xffffff,'instance shade is not multiplied by a second dark base');
assert.deepEqual(near.instanceColor.array,original,'neutral source palettes retain their exact linear colors');
assert.equal(near.instanceColor,far.instanceColor,'near/far still share one immutable color buffer');
for(let i=0;i<3;i++) {
  const color=new THREE.Color();near.getColorAt(i,color);color.multiply(shoeMaterial.color);
  assert.equal(color.getHex(),shades[i],'effective shader color equals the intended track shade');
}
near.setColorAt(0,new THREE.Color(0x447711));
assert.ok(auditTankAppearance(tracks).issues.some(issue=>issue.code==='saturated-running-gear'),
  'instance color cannot bypass the neutral working-gear audit');
normalizeTankAppearance(tracks);
assert.deepEqual(auditTankAppearance(tracks).issues,[]);
console.log('appearanceAudit: shared near/far shoe palettes normalize once and retain neutral-color enforcement');

// Separate native batches can share a material without sharing their palette.
const extra = new THREE.InstancedMesh(near.geometry, shoeMaterial, 1);
extra.setColorAt(0, new THREE.Color(0x336611));
tracks.add(extra);
normalizeTankAppearance(tracks);
const extraColor = new THREE.Color();
extra.getColorAt(0, extraColor);
assert.equal(extraColor.getHex(), VEHICLE_APPEARANCE_PALETTE.trackPad);
assert.deepEqual(near.instanceColor.array.slice(3), original.slice(3));
assert.deepEqual(auditTankAppearance(tracks).issues, []);

// ---------------------------------------------------------------------------------------------------------------
// FSP-06 material roles (owner 2026-09-25: "camouflage on painted vehicle bodywork; distinct materials/colors for
// accessory equipment, cloth, bags and mechanisms"). The fleet census is tools/material-roles-audit.mjs
// (docs/tank-generation/material-roles-audit-20260925.md); this receipt pins the vocabulary and the role split of
// the representative re-roled hulls on real builds so a regression that folds the pale canvas back into the
// camouflage, or re-camouflages the Leclerc boot, fails here.
{
  await import('../../tools/tank-surface-collect.mjs'); // node canvas shim: materials are set as shipped
  const { createTank } = await import('./tankFactory.ts');
  const build = (id) => createTank(id, null, { proceduralOnly: true, quality: 'high', batchStatic: false });
  const rolesOf = (root) => auditTankAppearance(root).roles;
  const materialsOf = (root) => {
    const set = new Set();
    root.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      if (o.userData?.shadowOnly || /^procShadow_/.test(o.name || '')) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m) set.add(m);
    });
    return set;
  };
  // Role counts after the 2026-09-25 re-roling (mesh slots; the census JSON carries triangles), and the distinct
  // rendered materials per tank: Merkava hulls grew by exactly the +2 bound (pale canvas + the fitting paint the
  // jerry cans now share); the other re-roled hulls grew by 0.
  const expected = {
    merkava3c: { canvasPale: 2, materialsMax: 26, before: 24 },
    merkava4b: { canvasPale: 2, materialsMax: 24, before: 22 },
    leclerc: { canvas: 2, materialsMax: 22, before: 22 },
    k2b: { materialsMax: 25, before: 25 },
    carro45t: { materialsMax: 23, before: 23 },
  };
  for (const [id, want] of Object.entries(expected)) {
    const tank = build(id);
    const roles = rolesOf(tank.root);
    const materials = materialsOf(tank.root);
    assert.deepEqual(auditTankAppearance(tank.root).issues, [], `${id}: no running-gear or armor material issues`);
    if (want.canvasPale) assert.equal(roles.canvasPale, want.canvasPale, `${id}: pale canvas rides hull and turret`);
    else assert.equal(roles.canvasPale, undefined, `${id}: no pale canvas on a non-desert kit`);
    if (want.canvas) assert.ok((roles.canvas ?? 0) >= want.canvas, `${id}: canvas boot/kit present`);
    assert.ok(materials.size <= want.materialsMax && materials.size <= want.before + 2,
      `${id}: ${materials.size} materials (before ${want.before}, bound +2)`);
    const pale = [...materials].filter((m) => m.userData?.appearanceRole === 'canvasPale');
    assert.ok(pale.length <= 1, `${id}: at most one pale canvas material`);
    for (const m of pale) assert.equal(m.name, 'cot:canvas-pale');
    tank.dispose?.();
  }
  console.log('appearanceAudit: FSP-06 material roles — pale canvas, canvas boot and fitting paint pinned on representative builds (2026-09-25)');
}
