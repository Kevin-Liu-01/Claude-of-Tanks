// Release 227 (owner 2026-10-16): "make thhe zubr 2 and zubr autocannons into proper machine gun emplacements that are
// aut ocontrolled. for the qilin and kunlun, make their machine guns much smalelr and make thhem into the more classic
// machine gunn emplacement on the turrets." The CN track's three roof stations: the Qilin's and the Kunlun's QJC-88 on
// open cupola pintles and the Yun's faceted station on its Type 96B roof seat. Each is a calibre-true working station
// (never an inert drawn gun), published with its pivot, muzzle, traverse arc and depression table, and the auxiliary
// roof-gun control (src/sim/auxiliarySystems.ts) slews it to and fires it at a spotted enemy inside its arc with no
// player input, and holds it off a target inside an excluded window.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { TANK_SPECS } from './specs.ts';
import { AUXILIARY_INVENTORY } from './auxiliaryInventory.generated.ts';
import { AUXILIARY_ROOF_GUNS } from './auxiliaryRoofGuns.generated.ts';
import { INERT_DRAWN_WEAPONS } from './inertDrawnWeapons.generated.ts';
import { NATIONAL_ROOF_LOADOUTS } from './nationalRoofConfig.ts';
import { auxiliaryWeaponProfile } from './auxiliaryWeapons.ts';
import { stepRoofGun, auxiliaryState } from '../sim/auxiliarySystems.ts';

const EXPECT = {
  t72b3_qilin: { name: 'Qilin cupola QJC-88', pintle: true, shield: 'standard', arc: true, table: true, excluded: -69 },
  t72b3m_kunlun: { name: 'Kunlun cupola QJC-88', pintle: true, shield: 'low', arc: false, table: false },
  t80u_yun: { name: 'Yun faceted station', pintle: false, arc: true, table: false, excluded: 147.5 },
};

// The cupola profile: the QJC-88's Type 54 API at the cupola mount's 5 degrees of depression (auxiliaryWeapons.ts).
for (const id of ['t72b3_qilin', 't72b3m_kunlun']) {
  const p = auxiliaryWeaponProfile(12.7, id);
  assert.equal(p.shell.caliberMm, 12.7, `${id}: a 12.7 mm round`);
  assert.equal(p.shell.name, '12.7×108 mm Type 54 API', `${id}: the QJC-88's cartridge`);
  assert.equal(p.depressionRad, .087, `${id}: the cupola mount's 5 degrees of depression`);
  assert.equal(p.elevationRad, .75, `${id}: the heavy mount's elevation`);
}
// The Kunlun's 30 mm station is gone: its gun now hurts what a 12.7 mm hurts (the old 65 mm at 100 m defeated MBT rears).
assert.equal(auxiliaryWeaponProfile(12.7, 't72b3m_kunlun').shell.pen100Mm, 26, 'Kunlun: heavy-MG penetration');
assert.equal(auxiliaryWeaponProfile(12.7, 't72b3m_kunlun').rangeM, 240, 'Kunlun: heavy-MG range');

const vector = (a) => new THREE.Vector3(...a);
for (const [id, want] of Object.entries(EXPECT)) {
  const l = NATIONAL_ROOF_LOADOUTS[id];
  assert.equal(l.name, want.name, `${id}: loadout name`);
  assert.equal(l.caliber, 12.7, `${id}: calibre-true 12.7 mm`);
  assert.equal(l.mount === 'pintle', want.pintle, `${id}: emplacement form`);
  const kit = AUXILIARY_INVENTORY[id];
  assert.equal(kit.guns.length, 1, `${id}: exactly one station`);
  assert.equal(INERT_DRAWN_WEAPONS[id], undefined, `${id}: no inert drawn weapon`);
  const g = kit.guns[0];
  assert.equal(g.name, want.name, `${id}: the station is the loadout`);
  assert.equal(g.caliberMm, 12.7, `${id}: registered calibre`);
  assert.deepEqual(AUXILIARY_ROOF_GUNS[id]?.name, want.name, `${id}: combat anatomy reads the same station`);
  if (want.pintle) assert.equal(g.muzzle[2], 1.321, `${id}: the QJC-88 crew barrel's muzzle 1.321 m ahead of the pintle`);
  assert.equal(Boolean(g.yawArc), want.arc, `${id}: traverse arc published`);
  assert.equal(Boolean(g.depressionByYaw), want.table, `${id}: depression table published`);
  if (g.yawArc) assert.ok((g.yawArc[1] - g.yawArc[0]) * 180 / Math.PI >= 330, `${id}: at least 330 degrees of traverse`);

  // the built station: the fleet's pintle fitting in the working rig (crew-served), or the national station
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  try {
    const turret = tank.root.getObjectByName('rig_turret');
    let stations = 0; turret.traverse((o) => { if (o.userData.remoteControlled && o.userData.firingAxis === '+Z') stations++; });
    assert.equal(stations, 1, `${id}: one working roof gun on the turret`);
    const station = turret.getObjectByName(want.name), pitch = station?.getObjectByName('auxiliaryWeaponPitch');
    assert.ok(station && pitch, `${id}: yaw and pitch owners`);
    assert.equal(station.userData.nationalRoofLoadout, want.name, `${id}: loadout tag`);
    if (want.pintle) {
      assert.equal(station.userData.fitting, 'pintleMG', `${id}: the fleet pintle machine-gun fitting`);
      assert.equal(station.userData.weaponClass, 'qjc88', `${id}: QJC-88 class`);
      assert.equal(station.userData.crewServed, true, `${id}: the classic crew-served emplacement form`);
      assert.equal(station.userData.shieldVariant, want.shield, `${id}: its light shield`);
      const size = new THREE.Box3().setFromObject(station).getSize(new THREE.Vector3());
      assert.ok(size.x <= .50 && size.z <= 1.60 && size.y <= .50 + l.emplacement.riserM, `${id}: a small emplacement ${size.toArray()}`);
    }
    tank.root.updateMatrixWorld(true);
    const meshes = []; pitch.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const socket = vector(g.muzzle).sub(vector(g.pivot)).applyMatrix4(pitch.matrixWorld);
    let nearest = Infinity;
    for (const mesh of meshes) { const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) nearest = Math.min(nearest, new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld).distanceTo(socket)); }
    assert.ok(nearest < .05, `${id}: the published muzzle is on the drawn barrel (${nearest.toFixed(3)} m)`);
  } finally { tank.dispose(); }

  // the auxiliary control: no player input, a spotted enemy inside the arc is engaged; one in an excluded window is not
  const shooter = (bearingDeg) => ({ id: 'shooter', team: 'blue', spec: TANK_SPECS[id],
    state: { pos: { x: 0, y: 0, z: 0 }, yaw: 0, turretYaw: 0, visualPitch: 0, visualRoll: 0 }, combat: { ammo: [4, 6], reload: { t: 9 } }, bearingDeg });
  const target = (bearingDeg, range = 120) => ({ id: 'enemy', team: 'red', spec: { id: 'target', dims: { heightM: 2.0 } },
    state: { pos: { x: range * Math.sin(bearingDeg * Math.PI / 180), y: 0, z: range * Math.cos(bearingDeg * Math.PI / 180) }, yaw: 0, turretYaw: 0 }, combat: {} });
  const engage = (bearingDeg) => {
    const me = shooter(bearingDeg), them = target(bearingDeg), context = { entities: [me, them], visible: () => true, clear: () => true };
    assert.equal(auxiliaryState(me).gunOn, true, `${id}: the station starts in automatic fire`);
    let fired = false; for (let i = 0; i < 900 && !fired; i++) fired = stepRoofGun(me, i / 60, 1 / 60, context);
    return { fired, yaw: me.combat.auxiliary.gunYaw };
  };
  for (const bearing of [25, -25, 100, 180]) {
    if (want.excluded !== undefined && Math.abs(((bearing - want.excluded + 540) % 360) - 180) < 15) continue;
    const r = engage(bearing);
    assert.ok(r.fired, `${id}: slews to and fires at a spotted enemy at bearing ${bearing} with no player input`);
  }
  if (want.excluded !== undefined) {
    const r = engage(want.excluded);
    assert.equal(r.fired, false, `${id}: holds fire on a target in its excluded window (bearing ${want.excluded})`);
    if (g.yawArc) assert.ok(r.yaw >= g.yawArc[0] - 1e-6 && r.yaw <= g.yawArc[1] + 1e-6, `${id}: never turns outside its arc`);
  }
  console.log(`${id}: ${want.name} calibre-true, published, automatic inside its arc PASS`);
}
console.log('cnStations: the Qilin, Kunlun and Yun roof stations are working, automatic and calibre-true PASS');
