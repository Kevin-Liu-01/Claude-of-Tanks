// Release 227 (owner 2026-10-16): "make thhe zubr 2 and zubr autocannons into proper machine gun emplacements that are
// aut ocontrolled. for the qilin and kunlun, make their machine guns much smalelr and make thhem into the more classic
// machine gunn emplacement on the turrets." The CN track's three roof stations: the Qilin's and the Kunlun's QJC-88 on
// open cupola pintles and the Yun's faceted station on its Type 96B roof seat. Each is a calibre-true working station
// (never an inert drawn gun), published with its pivot, muzzle, traverse arc and depression table, and the auxiliary
// roof-gun control (src/sim/auxiliarySystems.ts) slews it to and fires it at a spotted enemy inside its arc with no
// player input, and holds it off a target inside an excluded window.
// Round 3 (critics D4, D6, D7): each cupola emplacement stands within 0.46 x 0.46 x 1.60 m (its riser included); its
// cradle, pin and shield ride the gun (FittingOptions.ridingCradle) so that through its whole pitch range the moving gun
// keeps at least 1.5 mm from every part of its mount that does not pitch (the fleet's working pintle, whose cradle and
// shield stand on the yaw stage, must fail that: its receiver sweeps 22 mm into the yoke bridge); and the station adds no
// material the vehicle does not already draw with.
// Round 4 (critic CN3-D1: the sweep never recoiled the gun, and the runtime recoiled the whole pitch group, so the
// trunnion pin left its bearing through every burst): the gun (receiver, barrel, can) recoils alone in its own group
// (`auxiliaryWeaponRecoil`, 12 mm along its axis) and the presentation moves that group and nothing else; through the
// whole pitch range and the whole stroke no triangle of a moving part crosses its yaw stage and the moving parts keep
// 1.5 mm from it, the recoiling gun crosses nothing of its cradle and bears on its floor; the whole pitch group recoiled
// 25 mm (the pre-round-4 runtime) must fail.
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
import { createAuxiliaryPresentation } from '../fx/auxiliaryPresentation.ts';
import { FITTINGS } from './profiles/kit.ts';
import { RIDING_CRADLE_RECOIL_M } from './machineGunGeometry.ts';
import { stationSelfClearance } from './cnTurretGeometry.test-support.mjs';

const EXPECT = {
  t72b3_qilin: { name: 'Qilin cupola QJC-88', pintle: true, shield: 'standard', arc: true, table: true, excluded: -69 },
  t72b3m_kunlun: { name: 'Kunlun cupola QJC-88', pintle: true, shield: 'standard', arc: false, table: false },
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
      assert.equal(station.userData.shieldVariant, 'standard', `${id}: the class's standard two-leaf shield`);
      tank.root.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(station.matrixWorld).invert(), box = new THREE.Box3();
      station.traverse((o) => { if (o.isMesh) box.union(new THREE.Box3().setFromBufferAttribute(o.geometry.attributes.position).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld))); });
      const size = box.getSize(new THREE.Vector3());
      assert.ok(size.x <= .46 && size.y <= .46 && size.z <= 1.60, `${id}: the emplacement within 0.46 x 0.46 x 1.60 m (${size.toArray().map((x) => x.toFixed(4)).join(' x ')})`);
      // the shield, cradle and pin ride the gun; the yaw stage is the flange, column, yoke and race ring in one mesh
      let shieldOnGun = false; pitch.traverse((o) => { if (o.isMesh && o.userData.fittingSlot === 'detail') shieldOnGun = true; });
      assert.ok(shieldOnGun, `${id}: the shield rides the gun`);
      const range = { depression: auxiliaryWeaponProfile(12.7, id).depressionRad, elevation: auxiliaryWeaponProfile(12.7, id).elevationRad };
      const recoil = pitch.getObjectByName('auxiliaryWeaponRecoil');
      assert.ok(recoil && recoil.parent === pitch, `${id}: the gun recoils in its own group inside the cradle`);
      assert.equal(station.userData.auxiliaryRecoilM, RIDING_CRADLE_RECOIL_M, `${id}: the gun's published recoil stroke`);
      const self = stationSelfClearance(station, pitch, range);
      assert.equal(self.yawMeshes, 1, `${id}: one yaw-stage mesh`);
      assert.ok(self.recoilMeshes >= 1 && self.stroke === RIDING_CRADLE_RECOIL_M, `${id}: the sweep recoils the gun its stroke`);
      assert.ok(self.d >= .0015, `${id}: the moving parts keep 1.5 mm from their own mount through pitch and recoil (${(self.d * 1000).toFixed(1)} mm at ${(self.el * 180 / Math.PI).toFixed(1)} deg, recoil ${(self.r * 1000).toFixed(0)} mm)`);
      assert.equal(self.crossings, 0, `${id}: no moving triangle crosses the yaw stage`);
      assert.equal(self.gunCradle.crossings, 0, `${id}: the recoiling gun crosses nothing of its cradle over its stroke`);
      assert.ok(self.gunCradle.bearing <= .0005, `${id}: the gun bears on its cradle (${(self.gunCradle.bearing * 1000).toFixed(2)} mm)`);
      // negative control: the whole pitch group recoiled 25 mm (the pre-round-4 runtime) pulls the pin through its bearing
      const whole = stationSelfClearance(station, pitch, { ...range, travel: .025, wholeRecoil: true });
      assert.ok(whole.d < .0015 && whole.crossings > 0, `${id}: negative control: the whole pitch group recoiling carries the pin through its bearing (${(whole.d * 1000).toFixed(1)} mm, ${whole.crossings} pairs)`);
      // the presentation fires it: the gun group slides back its stroke, the cradle (pitch group) holds its trunnion
      {
        const scene = new THREE.Group(); scene.add(tank.root);
        const entity = { id: 'p', spec: TANK_SPECS[id], visual: { root: tank.root }, state: {}, combat: { auxiliary: { gunYaw: 0, gunPitch: .2, shots: 0 } } };
        let now = 1; const fx = createAuxiliaryPresentation(new THREE.Group(), { entities: () => [entity], time: () => now, ground: () => 0, report() {}, flash() {}, smoke() {}, visible: () => true });
        const pitchRest = pitch.position.clone(), gunRest = recoil.position.clone();
        fx.update(); entity.combat.auxiliary.shots = 1; now += 1 / 600; fx.update(); now += 1 / 600; fx.update();
        assert.ok(pitch.position.equals(pitchRest), `${id}: the cradle holds its trunnion when the gun fires`);
        const back = gunRest.z - recoil.position.z;
        assert.ok(back > RIDING_CRADLE_RECOIL_M * .9 && back <= RIDING_CRADLE_RECOIL_M + 1e-9 && recoil.position.x === gunRest.x && recoil.position.y === gunRest.y, `${id}: the gun recoils along its axis (${(back * 1000).toFixed(1)} mm)`);
        fx.reset(); assert.ok(recoil.position.equals(gunRest), `${id}: reset returns the gun to battery`);
        scene.remove(tank.root);
      }
      // no material of its own: every material the station draws with is drawn elsewhere on the vehicle
      const elsewhere = new Set(); tank.root.traverse((o) => { if (!o.isMesh) return; for (let q = o; q; q = q.parent) if (q === station) return; for (const m of [].concat(o.material)) elsewhere.add(m.uuid); });
      station.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) assert.ok(elsewhere.has(m.uuid), `${id}: the station's ${o.name} adds a material (${m.name || m.color?.getHexString?.()})`); });
      console.log(`${id}: emplacement ${size.toArray().map((x) => x.toFixed(3)).join(' x ')} m, its moving parts ${(self.d * 1000).toFixed(1)} mm from its mount at worst (pitch and ${(self.stroke * 1000).toFixed(0)} mm recoil), gun on cradle 0 crossings`);
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
// negative control: the fleet's working pintle (the same class, shield, ring and riser; its cradle and shield on the yaw
// stage) — its moving gun goes through its own mount
{
  const mat = () => new THREE.MeshStandardMaterial();
  const mats = { dark: mat(), detail: mat(), shadow: mat(), glass: mat(), hull: mat() };
  const e = NATIONAL_ROOF_LOADOUTS.t72b3_qilin.emplacement;
  const fleet = FITTINGS.pintleMG({ mats, cls: e.cls, scale: 1, tone: 'two-tone', elev: .08, shield: e.shield, ammo: true, ring: { ...e.ring },
    riser: e.riserM, working: true, datumBarrel: false });
  fleet.updateMatrixWorld(true);
  const self = stationSelfClearance(fleet, fleet.getObjectByName('auxiliaryWeaponPitch'), { depression: .087, elevation: .75 });
  assert.ok(self.d < .0015, `negative control: the fleet working pintle's gun goes through its own mount (${(self.d * 1000).toFixed(1)} mm)`);
  for (const m of Object.values(mats)) m.dispose();
}
console.log('cnStations: the Qilin, Kunlun and Yun roof stations are working, automatic and calibre-true; the emplacements small and clear of their own mounts PASS');
