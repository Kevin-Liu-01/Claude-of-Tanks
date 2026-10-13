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
        drag: m.drag, windK: m.windK, life: m.life, size0: m.size0, size1: m.size1, growExp: m.growExp, density: m.density,
        r0: m.r0, medium: m.medium, aspect: m.aspect, fadeIn: m.fadeIn, fadeOut: m.fadeOut, heat: m.heat, cool: m.cool }),
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
  // every puff is born inside the screen's life; (fx 8l, wave 354a: "a full-bodied wall at 15 s that's gone at 18 s, a
  // hard switch-off", the coordinator: a cosmetic haze lingering 10-20 s past the sight block, the gameplay duration
  // untouched) only a thin haze outlives it, and by at most 20 s
  for (const p of at60.puffs) {
    assert.ok(p.birth >= screen.born - 1e-6, 'no puff before the launch');
    assert.ok(p.birth <= screen.born + SMOKE_DURATION_S + 1e-6, 'no puff born after the screen');
    const end = p.birth + p.life - (screen.born + SMOKE_DURATION_S);
    if (end > 0.65) assert.ok(p.density <= 0.3 && end <= 20 + 1e-6, `only a thin haze outlives the screen (+${end.toFixed(1)} s, density ${p.density})`);
    assert.ok(Number.isFinite(p.x + p.y + p.z + p.vx + p.vy + p.vz + p.life + p.size1), 'finite records');
  }
  // (EF.03, the SSOT rule: visible smoke may not outlast the 18 s sight block by more than its fade) whatever lives past
  // the sight block is already fading by its end: no veil holds its density after the screen stops blocking
  for (const p of at60.puffs) {
    if (p.birth + p.life <= screen.born + SMOKE_DURATION_S + 0.65) continue;
    assert.ok(p.birth + p.fadeOut * p.life <= screen.born + SMOKE_DURATION_S + 1e-6,
      `past the sight block a puff only fades (its fade from +${(p.birth + p.fadeOut * p.life - screen.born).toFixed(1)} s)`);
  }
  {
    const tail = at60.puffs.filter((p) => p.birth + p.life > screen.born + SMOKE_DURATION_S + 8);
    assert.ok(tail.length >= smokeBankCount(screen) && tail.some((p) => p.windK >= 0.5), `a haze lingers past the sight block and drifts with the wind (${tail.length})`);
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
  assert.ok(crowded.puffs.length <= 480, `a whole 24-tube screen stays bounded (${crowded.puffs.length} puffs over 18 s)`);
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
  // (r2, wave 311: "see-through by 15 s"; fx 8l, wave 354a: "a hard switch-off") the fade follows the simulation's
  // sight-blocking density with a long visual decay: every lobe holds dense past 12 s, erodes from 11-12 s (the crowns,
  // the wall's top, first), is most of the way through its erosion by the blocking floor (16.6 s) and gone by 18.4 s;
  // a thin haze tail drifts on inside the envelope and outlives the screen by at most HAZE_LINGER_S
  {
    const holdAge = 12.9, blockEnd = 16.6;
    const lobes = at60.puffs.filter((p) => p.windK === 0 && p.drag >= 1);
    assert.ok(lobes.every((p) => p.birth + p.life >= screen.born + holdAge), 'every lobe holds while the density does');
    assert.ok(lobes.every((p) => p.birth + p.life <= screen.born + 18.4 + 1e-6), 'and its last wisps are gone by 18.4 s');
    const hazes = at60.puffs.filter((p) => p.windK === 0 && p.drag < 0.2);
    assert.ok(hazes.length >= banks, `a haze tail in every bank (${hazes.length})`);
    for (const p of hazes) {
      assert.ok(p.birth >= screen.born + 13 - 1e-6 && p.density <= 0.4, 'the tail is thin and late');
      assert.ok(p.birth + p.life <= screen.born + SMOKE_DURATION_S + 9 + 1e-6, 'it outlives the screen by at most 9 s');
      const inside = Array.from({ length: banks }, (_, b) => { smokeVolume(screen, p.birth, b - 2, vol, () => 0); return [vol.x, vol.z, vol.radius]; })
        .some(([cx, cz, rr]) => Math.hypot(p.x - cx, p.z - cz) <= rr);
      assert.ok(inside, 'the tail is born inside the drifting envelope');
    }
  }
  // (fx 8m, wave 337: "strings of hard-edged near-white balls", "a necklace of balls round partial blobs" until ~4 s, "a
  // flat grey mass", "no visible strike or bounce at the wall")
  {
    // the trails are threads: every wisp in flight and every streamer puff along a pellet's arc has a neighbour of its
    // own trail closer than its own full size
    const near = (list, gap) => list.every((p) => list.some((q) => q !== p && Math.abs(q.birth - p.birth) <= gap
      && Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) <= p.size1));
    const wisps = at60.puffs.filter((p) => p.windK === 0.6 && p.drag === 1.5);
    const streamers = at60.puffs.filter((p) => p.windK === 0.5 && p.drag === 1.2);
    assert.ok(wisps.length > 0 && near(wisps, 0.061), `the grenades' trails are threads, not dotted lines (${wisps.length} wisps)`);
    assert.ok(streamers.length > 0 && near(streamers, 0.046), `the pellets' streamers are ropes, not beads (${streamers.length})`);
    // the bloom swells with the simulation's growth: every lobe is at 85 % of its size 2.4 s after its birth, from a
    // body already two metres across, fading in out of the pop
    const lobes = at60.puffs.filter((p) => p.windK === 0 && p.drag >= 1);
    for (const p of lobes) {
      const g = 1 - Math.pow(1 - Math.min(1, 2.4 / p.life), p.growExp);
      assert.ok(p.size0 >= 2 && p.size0 + (p.size1 - p.size0) * g >= 0.85 * p.size1, `a lobe swells with the bank (${p.size0} m at birth, growth ${g.toFixed(2)} by 2.4 s)`);
    }
    // the wall is modelled: its crowns (settling over 3.5 m) the sunlit white, brighter than any of its feet (under 2.5 m)
    const settle = (p) => p.y + p.vy / p.drag;
    const crowns = lobes.filter((p) => settle(p) > 3.5), feet = lobes.filter((p) => settle(p) < 2.5);
    assert.ok(crowns.length >= banks && feet.length >= banks, `crowns and feet in every bank (${crowns.length}, ${feet.length})`);
    assert.ok(Math.min(...crowns.map((p) => p.r0)) > Math.max(...feet.map((p) => p.r0)), 'the crowns are brighter than the feet');
    // a grenade striking a wall: a receipt with one bounce (sim/smokeBallistics.ts: the launch's seven numbers, then the
    // time it left the wall, where and its velocity after) strikes once, there, then; the dust leaves the face
    const g = 9.81, tb = 0.6, src = screen.canisters[0];
    const bx = src[0] + src[3] * tb, by = src[1] + src[4] * tb - 0.5 * g * tb * tb, bz = src[2] + src[5] * tb;
    const ivx = src[3], ivy = src[4] - g * tb, ivz = src[5], ih = Math.hypot(ivx, ivz);
    const nx = -ivx / ih, nz = -ivz / ih, into = ivx * nx + ivz * nz;
    const avx = 0.7 * (ivx - into * nx) - 0.35 * into * nx, avz = 0.7 * (ivz - into * nz) - 0.35 * into * nz;
    const bounced = [...src.slice(0, 7), tb, bx, by, bz, avx, ivy * 0.7, avz];
    const struck = { ...screen, canisters: [bounced, ...screen.canisters.slice(1)] };
    const r = run(struck, 1 / 60);
    const strikes = r.puffs.filter((p) => p.windK === 0.4 || p.windK === 0.45);
    assert.equal(strikes.length, 3, `one strike at the wall: a dust kick and the grenade's own puff (${strikes.length} puffs)`);
    for (const p of strikes) {
      assert.ok(Math.abs(p.birth - (struck.born + tb)) < 1e-6, 'the strike is born when the grenade leaves the wall');
      // (fx 8r, the w5 film: "white puffs sit against the house face") born off the face, in front of it, never half inside
      const off = (p.x - bx) * nx + (p.z - bz) * nz;
      assert.ok(Math.hypot(p.x - bx, p.y - by, p.z - bz) < 0.7 && off > 0.3, `and where it struck, off the face (${off.toFixed(2)} m out)`);
      if (p.windK === 0.4) assert.ok(p.vx * nx + p.vz * nz > 0, 'its dust is thrown off the face, never into the wall');
    }
    assert.ok(at60.puffs.every((p) => p.windK !== 0.4 && p.windK !== 0.45), 'a screen whose grenades struck nothing strikes nothing');
  }
  // (fx 8r, the w5 film: "a row of separate white puffs along the line before it merges", "white puffs against the house
  // face") the pops are low, wide and fade in; a skirt of low puffs closes each bank's stretch within a second of its
  // landing; nothing in the open asks for a wider soft-depth feather; by a wall the puffs fade into it more softly
  {
    const pops = at60.puffs.filter((p) => p.windK === 0.15);
    assert.ok(pops.length > 0 && pops.every((p) => p.vy <= 1.6 && p.aspect >= 1.3 && p.fadeIn >= 0.1),
      'a grenade\'s pop spreads low and wide and fades in: no round white ball');
    const skirts = at60.puffs.filter((p) => p.windK === 0.1);
    for (let b = 0; b < banks; b++) {
      smokeVolume(screen, screen.born + 6, b - 2, vol, () => 0);
      const mine = skirts.filter((p) => Math.hypot(p.x - vol.x, p.z - vol.z) <= vol.radius + 1.5);
      assert.ok(mine.length >= 1, `every bank's stretch has its skirt (bank ${b}: ${mine.length})`);
    }
    assert.ok(skirts.length >= banks, `the row's skirt (${skirts.length} puffs over ${banks} banks)`);
    for (const p of skirts) {
      const g = 1 - Math.pow(1 - Math.min(1, 1 / p.life), p.growExp);
      assert.ok(g >= 0.79 && p.size1 >= 1.6, `a skirt swells to most of its size within a second (${g.toFixed(2)})`);
      assert.ok(p.y >= 0.9 && p.y <= 1.5 && p.life <= 4.7 && p.density <= 0.85, 'low, brief and soft');
    }
    // the skirt is born within half a second of each landing: the row closes before the lobes have travelled out to it
    const firstLobe = Math.min(...at60.puffs.filter((p) => p.windK === 0 && p.drag >= 1).map((p) => p.birth));
    const firstSkirt = Math.min(...skirts.map((p) => p.birth));
    assert.ok(firstSkirt - firstLobe < 0.5, 'the skirt comes with the bloom');
    assert.ok(at60.puffs.every((p) => !(p.heat === 0 && p.cool < 0)), 'in the open no puff asks for a wider feather');
    // by a house's wall (the smoke-collision staging: x 10..18, z -4..4, walls to 5 m; a Leopard 8 m short of it)
    const { createHeadlessCollisionWorld } = await import('../world/headlessCollisionWorld.ts');
    const UP = new THREE.Vector3(0, 1, 0);
    const flat = { getHeightAt: () => 0, getHeightAtFast: () => 0, getNormalAt: () => UP, maxY: 0, minY: 0 };
    const box = { b: [10, 0, -4, 18, 5, 4], k: 'structure' };
    const world = createHeadlessCollisionWorld({ heightField: flat, manifest: { obstacles: [box], colliders: [box] } });
    const t = { id: 'leo2a6', team: 'player', spec: { id: 'leo2a6', dims: { heightM: 2.6 }, armor: { turretPivot: [0, 1.5, 0] } },
      state: { pos: { x: 2, y: 0, z: 0 }, yaw: Math.PI / 2, turretYaw: 0, visualPitch: 0, visualRoll: 0 }, combat: {} };
    assert.ok(requestAuxiliary(t, 'smoke', 3, () => 0, world), 'a salvo at a house');
    const walled = run(t.combat.auxiliary.smoke, 1 / 60);
    const byWall = walled.puffs.filter((p) => p.heat === 0 && p.cool < 0);
    assert.ok(byWall.length >= 4 && byWall.every((p) => -p.cool > 1 && -p.cool <= 3),
      `by the wall the puffs fade into it more softly (${byWall.length} puffs, feather x${Math.max(...byWall.map((p) => -p.cool)).toFixed(1)})`);
    const far = walled.puffs.filter((p) => p.windK === 0 && p.drag >= 1 && Math.max(10 - (p.x + p.vx / p.drag), 0) > 5);
    assert.ok(far.every((p) => p.cool >= 0), 'away from it, the feather they always had');
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
  console.log(`auxiliaryPresentation media: ${at60.puffs.length} puffs for a ${banks}-bank screen, frame-rate independent (20/60/144 fps), inside the envelope, late join, crowd share (${crowded.puffs.length} for 14 banks), launch puffs, one continuous wall, fade to the blocking floor with a haze tail, threads and ropes, the swelling bloom, sunlit crowns, the wall strike, low wide pops and the row's skirt, wall feathers, reset passed`);
}
