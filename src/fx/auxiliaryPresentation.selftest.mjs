import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAuxiliaryPresentation } from './auxiliaryPresentation.ts';
import { requestAuxiliary } from '../sim/auxiliarySystems.ts';
import { packSmokeScreen } from '../sim/smokeReceipt.ts';
import { smokeCanisterPosition } from '../sim/smokeBallistics.ts';
const tank={id:'player',team:'player',spec:{id:'m1a3',dims:{heightM:2.6},armor:{turretPivot:[0,1.5,0]}},state:{pos:{x:0,y:0,z:0},yaw:0,turretYaw:.5},combat:{}};
requestAuxiliary(tank,'smoke',10,()=>0);
const screen=tank.combat.auxiliary.smoke;
const parent=new THREE.Group();let time=10.3,puffs=[];
const fx=createAuxiliaryPresentation(parent,{entities:()=>[],time:()=>time,ground:()=>0,report(){},flash(){},smoke(p,scale,density,life,wind){puffs.push({p:p.clone(),scale,density,life,wind});}});
const grenades=parent.getObjectByName('auxiliarySmokeCanisters');
fx.setNetworkScreens([JSON.parse(JSON.stringify(packSmokeScreen(screen)))]);fx.update();
assert.equal(grenades.count,screen.canisters.length,'late snapshot shows every in-flight canister, even without a visible emitter');
const matrix=new THREE.Matrix4(),position=new THREE.Vector3();
for(let i=0;i<grenades.count;i++){
 grenades.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);
 const expected=smokeCanisterPosition(screen.canisters[i],.3,{});
 assert.ok(position.distanceTo(new THREE.Vector3(expected.x,expected.y,expected.z))<.025);
}
assert.ok(puffs.length>0&&puffs.every(p=>!p.wind),'in-flight trails without premature bank smoke');
const previous=grenades.instanceMatrix.array.slice();fx.update();
assert.deepEqual(grenades.instanceMatrix.array,previous,'paused match clock freezes the arc');
time=14;puffs=[];fx.update();assert.equal(grenades.count,0,'landed canisters retire');
assert.ok(puffs.some(p=>p.wind&&p.density>.9),'bank smoke grows at receipt landing positions');
fx.setNetworkScreens(Array.from({length:100},()=>screen));time=10.4;fx.update();assert.equal(grenades.count,256,'flight draw has a hard capacity');
fx.reset();assert.equal(grenades.count,0,'reset clears old launches');
fx.update();assert.equal(grenades.count,0,'old network screens cannot survive rematch');
for(const object of parent.children){object.geometry?.dispose();object.material?.dispose();}
console.log('auxiliaryPresentation: visible flight, delayed snapshot parity, trails, clouds, pause, bounds and reset passed');

// ---- the media screen (atmospherics lane, 2026-10-08): the desktop tiers draw the screen as simulated smoke --------
{
  const { smokeVolume, smokeBankCount, SMOKE_DURATION_S } = await import('../sim/smokeScreen.ts');
  const { makeVolumePuff } = await import('./volumeMedia.ts');
  /** A media context that records every puff with its birth on the match clock (now + its birth offset). */
  function recorder(clock) {
    const puffs = [], flashes = [], sparks = [];
    const C = {
      rand: Math.random, groundY: () => 0,
      media: (m) => puffs.push({ birth: clock.now + m.birthOffset, x: m.x, y: m.y, z: m.z, vx: m.vx, vy: m.vy, vz: m.vz,
        drag: m.drag, windK: m.windK, life: m.life, size1: m.size1, density: m.density, medium: m.medium }),
      chunk() {}, flash: (o) => flashes.push(clock.now + o.birthOffset), fire() {}, sparks: (o) => sparks.push(clock.now + o.birthOffset),
      jet() {}, shockRing() {}, lightPulse() {}, glow() {}, distBoost: () => 1, tier: 1,
      m: makeVolumePuff(), k: {},
      lp: { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, size0: 1, size1: 1, rot: 0, rotVel: 0, col0: [1, 1, 1], col1: [1, 1, 1], alpha: 1, grav: 0, birthOffset: 0 },
      ls: { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, width: 0.03, stretch: 0.03, grav: -18, col: [1, 1, 1], alpha: 1, seed: 0, birthOffset: 0 },
      lj: { pos: [0, 0, 0], axis: [0, 1, 0], life: 0.1, width: 0.5, len0: 0.5, len1: 3, seed: 0, col: [1, 1, 1], alpha: 1, birthOffset: 0 },
    };
    return { C, puffs, flashes, sparks };
  }
  function salvo(specId) {
    const t = { id: specId, team: 'player', spec: { id: specId, dims: { heightM: 2.5 } }, state: { pos: { x: 40, y: 0, z: -20 }, yaw: 0.4, turretYaw: 0.2 }, combat: {} };
    assert.ok(requestAuxiliary(t, 'smoke', 3, () => 0), `${specId} launches smoke`);
    return t.combat.auxiliary.smoke;
  }
  /** Run one screen from its launch to past its end at a fixed frame rate (or jump straight to `from`). */
  function run(screen, dt, from = 3) {
    const clock = { now: from };
    const rec = recorder(clock);
    const parent = new THREE.Group();
    const fx = createAuxiliaryPresentation(parent, { entities: () => [], time: () => clock.now, ground: () => 0,
      report() {}, flash() {}, smoke() { throw new Error('the media tier never uses the pooled smoke'); }, blast: rec.C });
    fx.setNetworkScreens([screen]);
    for (; clock.now <= screen.born + SMOKE_DURATION_S + 1; clock.now += dt) fx.update();
    for (const object of parent.children) { object.geometry?.dispose(); object.material?.dispose(); }
    return { ...rec, fx };
  }
  const key = (p) => [p.birth, p.x, p.y, p.z, p.size1, p.life].map((v) => v.toFixed(4)).join(',');
  const screen = salvo('leo2a6');
  const at60 = run(screen, 1 / 60), at20 = run(screen, 1 / 20), at144 = run(screen, 1 / 144);
  assert.ok(at60.puffs.length > 40, `a salvo draws a wall of puffs (${at60.puffs.length})`);
  assert.deepEqual(at20.puffs.map(key).sort(), at60.puffs.map(key).sort(), 'the same puffs at 20 fps as at 60 fps');
  assert.deepEqual(at144.puffs.map(key).sort(), at60.puffs.map(key).sort(), 'the same puffs at 144 fps as at 60 fps');
  // every puff is born inside the screen's life and none outlives it
  for (const p of at60.puffs) {
    assert.ok(p.birth >= screen.born - 1e-6, 'no puff before the launch');
    assert.ok(p.birth + p.life <= screen.born + SMOKE_DURATION_S + 1e-6, 'no puff outlives the screen');
    assert.ok(Number.isFinite(p.x + p.y + p.z + p.vx + p.vy + p.vz + p.life + p.size1), 'finite records');
  }
  // the dense wall settles inside the simulation's envelope: each lobe's resting place (born at the burst, its offset
  // v/k) lies within the full-grown bank radius of some bank's centre
  const banks = smokeBankCount(screen), vol = { x: 0, y: 0, z: 0, radius: 0, height: 0, density: 0 };
  const centres = Array.from({ length: banks }, (_, b) => { smokeVolume(screen, screen.born + 6, b - 2, vol, () => 0); return [vol.x, vol.z, vol.radius]; });
  let lobes = 0;
  for (const p of at60.puffs) {
    if (p.windK !== 0 || p.drag < 1) continue;
    lobes++;
    const rx = p.x + p.vx / p.drag, rz = p.z + p.vz / p.drag;
    const inside = centres.some(([cx, cz, r]) => Math.hypot(rx - cx, rz - cz) <= r + 1);
    assert.ok(inside, `a lobe settles inside the blocking envelope (${rx.toFixed(1)}, ${rz.toFixed(1)})`);
    assert.ok(p.y + p.vy / p.drag <= 4.2 && p.y + p.vy / p.drag >= 1.5, 'lobes settle between 1.5 m and 4.2 m over the ground');
  }
  assert.ok(lobes >= 2 * banks, `every bank blooms (${lobes} lobes over ${banks} banks)`);
  // a late joiner (first frame at 10 s) sees exactly the puffs still alive then, born when the first viewer's were
  const late = run(screen, 1 / 60, screen.born + 10);
  const aliveAt10 = at60.puffs.filter((p) => p.birth <= screen.born + 10 && p.birth + p.life >= screen.born + 10 + 1 / 60);
  const lateKeys = new Set(late.puffs.map(key));
  for (const p of aliveAt10) assert.ok(lateKeys.has(key(p)), 'a late joiner sees every puff still alive');
  assert.ok(late.puffs.length < at60.puffs.length, 'and none that had died before it joined');
  // a 24-tube salvo in 14 overlapping banks draws one wall, not 14 stacked clouds: bounded puffs per bank
  const crowded = run(salvo('m1a1'), 1 / 60);
  const perBank = crowded.puffs.length / smokeBankCount(salvo('m1a1'));
  assert.ok(perBank < at60.puffs.length / banks, `crowded banks share their lobes (${perBank.toFixed(1)} vs ${(at60.puffs.length / banks).toFixed(1)} a bank)`);
  assert.ok(crowded.puffs.length <= 520, `a whole 24-tube screen stays bounded (${crowded.puffs.length} puffs over 18 s)`);
  // (r2, wave 311) the launch: a white puff at every bank's tube as its grenade leaves
  for (const sc of [screen, salvo('m1a1')]) {
    const r = run(sc, 1 / 60);
    const launches = r.puffs.filter((p) => Math.abs(p.birth - (sc.born + 0.02)) < 1e-6 && p.windK === 0.5);
    assert.equal(launches.length, smokeBankCount(sc), `a launch puff at every bank's tube (${launches.length})`);
  }
  // (r2, wave 311: "a gap exactly where the tank stands") one continuous wall wherever the simulation blocks: seen from
  // the launcher, every bearing whose wall point lies inside a bank's envelope is covered by a settled lobe's billow
  // (the inner 5 m of its ~10 m card); a gap the simulation itself leaves open stays open. (Every smoke-equipped vehicle
  // passes with the base and the fanned launchers alike: widest gap 2.6 m and 0 m, where the old ring of lobes left up to
  // 10 m and 4.3 m.)
  for (const id of ['leo2a6', 'm1a1', 'm1a2', 't90', 'amx40', 'pt91m']) {
    const sc = salvo(id);
    const r = run(sc, 1 / 60);
    const src = sc.source, ox = src ? src[1] : sc.x, oz = src ? src[3] : sc.z;
    const n = smokeBankCount(sc);
    const centres = Array.from({ length: n }, (_, b) => { smokeVolume(sc, sc.born + 6, b - 2, vol, () => 0); return [vol.x, vol.z, vol.radius]; });
    const feet = r.puffs.filter((p) => p.windK === 0 && p.drag >= 1).map((p) => {
      const x = p.x + p.vx / p.drag, z = p.z + p.vz / p.drag, rr = Math.hypot(x - ox, z - oz);
      return { r: rr, b: Math.atan2(x - ox, z - oz), h: Math.atan2(2.5, rr) };
    }).sort((a, b) => (a.b - a.h) - (b.b - b.h));
    let gap = 0, reach = -Infinity, reachR = 0;
    for (const f of feet) {
      if (reach > -Infinity && f.b - f.h > reach) {
        const mb = (f.b - f.h + reach) / 2, mr = (f.r + reachR) / 2, mx = ox + Math.sin(mb) * mr, mz = oz + Math.cos(mb) * mr;
        if (centres.some(([cx, cz, rr]) => Math.hypot(mx - cx, mz - cz) <= rr * 0.8)) gap = Math.max(gap, (f.b - f.h - reach) * mr);
      }
      if (f.b + f.h > reach) { reach = f.b + f.h; reachR = f.r; }
    }
    assert.ok(gap <= 3, `${id}: the wall's widest uncovered stretch inside the envelope is ${gap.toFixed(1)} m`);
  }
  // (r2, wave 311: "see-through by 15 s") the fade follows the simulation's sight-blocking density: every lobe holds to
  // 13.5 s and is gone by 16.6 s (the density's blocking floor); a thin haze tail drifts on inside the envelope and
  // ends with the screen
  {
    const holdAge = 13.4, blockEnd = 16.6;
    const lobes = at60.puffs.filter((p) => p.windK === 0 && p.drag >= 1);
    assert.ok(lobes.every((p) => p.birth + p.life >= screen.born + holdAge), 'every lobe holds while the density does');
    assert.ok(lobes.every((p) => p.birth + p.life <= screen.born + blockEnd + 1e-6), 'and none outlasts the blocking');
    const hazes = at60.puffs.filter((p) => p.windK === 0 && p.drag < 0.2);
    assert.ok(hazes.length >= banks, `a haze tail in every bank (${hazes.length})`);
    for (const p of hazes) {
      assert.ok(p.birth >= screen.born + 13 - 1e-6 && p.density <= 0.4, 'the tail is thin and late');
      assert.ok(p.birth + p.life <= screen.born + SMOKE_DURATION_S + 1e-6, 'it ends with the screen');
      const inside = Array.from({ length: banks }, (_, b) => { smokeVolume(screen, p.birth, b - 2, vol, () => 0); return [vol.x, vol.z, vol.radius]; })
        .some(([cx, cz, rr]) => Math.hypot(p.x - cx, p.z - cz) <= rr);
      assert.ok(inside, 'the tail is born inside the drifting envelope');
    }
  }
  // reset forgets the screens: a rematch draws nothing old
  const clock = { now: screen.born + 2 };
  const rec = recorder(clock);
  const fx = createAuxiliaryPresentation(new THREE.Group(), { entities: () => [], time: () => clock.now, ground: () => 0,
    report() {}, flash() {}, smoke() {}, blast: rec.C });
  fx.setNetworkScreens([screen]); fx.update();
  const before = rec.puffs.length;
  fx.reset(); clock.now += 1; fx.update();
  assert.equal(rec.puffs.length, before, 'reset drops every screen');
  console.log(`auxiliaryPresentation media: ${at60.puffs.length} puffs for a ${banks}-bank screen, frame-rate independent (20/60/144 fps), inside the envelope, late join, crowd share (${crowded.puffs.length} for 14 banks), launch puffs, one continuous wall, fade to the blocking floor with a haze tail, reset passed`);
}
