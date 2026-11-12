import fs from 'node:fs';
import * as THREE from 'three';
import {
  EFFECT_ATTACHMENT_POLICY,
  MUZZLE_SMOKE_CARRY_DRAG,
  MUZZLE_SMOKE_CARRY_DRAG_MIN,
  shooterCarryDrag,
  shooterVelocityGain,
  subjectPointVelocity,
  syncSubjectEmitterAnchor,
} from './effectAttachments.ts';

function near(actual, expected, label, eps = 1e-6) {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

// Rendered subjects preserve the ignition point in TankVisual-root space.
const root = new THREE.Group();
root.position.set(10, 2, -4);
root.rotation.set(0.08, 0.35, -0.03);
root.updateWorldMatrix(true, false);
const initialLocal = new THREE.Vector3(0.8, 1.3, -0.45);
const initialWorld = root.localToWorld(initialLocal.clone());
const visualEmitter = { pos: initialWorld.toArray() };
const visualSubject = { visual: { root }, state: { pos: root.position, yaw: root.rotation.y } };
const scratch = new THREE.Vector3();
if (!syncSubjectEmitterAnchor(visualEmitter, visualSubject, scratch)) {
  throw new Error('visual-root subject did not resolve');
}
const stableAnchor = visualEmitter.localPos;
root.position.set(-3, 5, 12);
root.rotation.set(-0.12, -0.7, 0.05);
root.updateWorldMatrix(true, false);
const expectedWorld = root.localToWorld(initialLocal.clone());
syncSubjectEmitterAnchor(visualEmitter, visualSubject, scratch);
near(visualEmitter.pos[0], expectedWorld.x, 'visual x');
near(visualEmitter.pos[1], expectedWorld.y, 'visual y');
near(visualEmitter.pos[2], expectedWorld.z, 'visual z');
for (let i = 0; i < 1000; i++) syncSubjectEmitterAnchor(visualEmitter, visualSubject, scratch);
if (visualEmitter.localPos !== stableAnchor) {
  throw new Error('visual attachment replaced its local anchor in the hot loop');
}

// Lazy/headless subjects get the same contract using position + yaw.
const stateSubject = { state: { pos: { x: 2, y: 1, z: 3 }, yaw: 0 } };
const stateEmitter = { pos: [3, 2.5, 5] };
syncSubjectEmitterAnchor(stateEmitter, stateSubject, scratch);
const stableStateAnchor = stateEmitter.localPos;
stateSubject.state.pos = { x: 7, y: 4, z: -2 };
stateSubject.state.yaw = Math.PI / 2;
syncSubjectEmitterAnchor(stateEmitter, stateSubject, scratch);
near(stateEmitter.pos[0], 9, 'state x');
near(stateEmitter.pos[1], 5.5, 'state y');
near(stateEmitter.pos[2], -3, 'state z');
if (stateEmitter.localPos !== stableStateAnchor) {
  throw new Error('state attachment replaced its local anchor in the hot loop');
}

const unresolved = { pos: [1, 2, 3] };
if (syncSubjectEmitterAnchor(unresolved, {}, scratch)) {
  throw new Error('invalid subject unexpectedly resolved');
}
if (unresolved.pos.join(',') !== '1,2,3') throw new Error('unresolved emitter moved');

// Exhaustive policy gate for live-owner, caller-refreshed, and world effects.
const requiredFamilies = [
  'burningColumn', 'impactDecal', 'trackDust', 'engineExhaust',
  'guidedMissileBody', 'guidedMissileTrail', 'turretPopTrail', 'muzzleFlash',
  'muzzleRing', 'muzzleLight', 'muzzleSmoke', 'muzzleGroundDust', 'rocketIgnitionSmoke', 'impactParticles', 'destructionParticles',
  'destroyedTankColumn', 'terrainScorch', 'trackPrint', 'propBreak',
  'propCrush', 'loosePropHit',
];
for (const family of requiredFamilies) {
  if (!EFFECT_ATTACHMENT_POLICY[family]) throw new Error(`missing attachment policy: ${family}`);
}

// Integration seams: battle + Studio resolution and live->wreck transition.
const effectsSource = fs.readFileSync(new URL('./effects.ts', import.meta.url), 'utf8');
const mainFrameSource = fs.readFileSync(new URL('../app/mainFrameRuntime.ts', import.meta.url), 'utf8');
const studioSource = fs.readFileSync(new URL('../game/studio.ts', import.meta.url), 'utf8');
if (!effectsSource.includes('syncSubjectEmitterAnchor(col, subject, _subjectAnchor)')) {
  throw new Error('burning columns are not refreshed through the attachment helper');
}
if (!effectsSource.includes('retireSubjectColumn(e.id);')) {
  throw new Error('tank destruction does not retire the live burning emitter');
}
if (!/setReplaySuppressed\(suppressed(?:\s*:\s*boolean)?\)/.test(effectsSource)) {
  throw new Error('effects lack the reversible killcam reconstruction gate');
}
if (!/if \(replaySuppressed\) \{\s*col\.acc = 0;\s*return/.test(effectsSource)) {
  throw new Error('suppressed wreck columns can accumulate a replay emission backlog');
}
if (!mainFrameSource.includes('game.shells, camera, resolveFxSubject')) {
  throw new Error('battle fx update lacks the solo/network subject resolver');
}
if (!studioSource.includes('fx.update(dt, shells, camera, resolveFxSubject)')) {
  throw new Error('Studio fx update lacks its actor subject resolver');
}

console.log('effect attachment selftest passed');

// wreck r1 (owner 2026-09-17): fire/smoke belong to the vehicle object. The
// destroyed-tank column rides the corpse's visual root (a shoved wreck carries
// its smoke) and leaves the frame the corpse is gone — released to the pool,
// revived for a respawn — instead of standing on the fixed 40 s timer.
{
  const { createRequire } = await import('node:module');
  const THREE = await import('three');
  const { createFx } = await import('./effects.ts');
  const { createCanvas } = createRequire(import.meta.url)('@napi-rs/canvas');
  const documentBefore = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { createElement(tag) { if (tag !== 'canvas') throw new Error(tag); return createCanvas(1, 1); } };
  try {
    if (EFFECT_ATTACHMENT_POLICY.destroyedTankColumn !== 'wreck-local-emitter') {
      throw new Error('the destroyed-tank column must ride the wreck (wreck-local-emitter)');
    }
    const handlers = new Map();
    const bus = { on(type, fn) { handlers.set(type, fn); return () => handlers.delete(type); }, emit(type, payload) { handlers.get(type)?.(payload); } };
    const fx = createFx({ anisotropy: 4 }, { getHeightAt: () => 0 }, { seed: 77 });
    fx.bindBus(bus);
    const camera = new THREE.PerspectiveCamera();
    const root = new THREE.Object3D(); root.position.set(40, 0, -10); root.updateWorldMatrix(true, true);
    let wrecked = true;
    let corpse = { visual: { root, isDestroyed: () => wrecked, setDestroyed() {} }, state: { pos: root.position, yaw: 0 }, combat: { destroyed: true } };
    const resolve = (id) => (id === 'w1' ? corpse : null);
    const columnsOf = () => fx.getAttachmentDebug().subjects.filter((s) => s.id === 'wreck:w1');
    bus.emit('tank:destroyed', { id: 'w1', pos: [40, 0.5, -10], cause: 'shot' });
    fx.update(1 / 60, [], camera, resolve);
    let cols = columnsOf();
    if (cols.length !== 1) throw new Error(`the live kill must raise one wreck-keyed column (got ${cols.length})`);
    if (!cols[0].resolved) throw new Error('the wreck column must anchor to the corpse visual root');
    // a shoved wreck carries its smoke
    root.position.x += 6; root.updateWorldMatrix(true, true);
    fx.update(1 / 60, [], camera, resolve);
    cols = columnsOf();
    if (Math.abs(cols[0].pos[0] - 46) > 1e-6) throw new Error(`the column must follow the wreck root (x ${cols[0].pos[0]})`);
    // the corpse revives for a respawn: the smoke leaves with it
    wrecked = false; corpse.combat.destroyed = false;
    fx.update(1 / 60, [], camera, resolve);
    if (columnsOf().length !== 0) throw new Error('a revived corpse must take its column along');
    // a second kill, then the entity is released to the pool: the column is gone
    wrecked = true; corpse.combat.destroyed = true;
    bus.emit('tank:destroyed', { id: 'w1', pos: [46, 0.5, -10], cause: 'ammorack' });
    fx.update(1 / 60, [], camera, resolve);
    if (columnsOf().length !== 1) throw new Error('the second kill raises its column');
    corpse = null;
    fx.update(1 / 60, [], camera, resolve);
    if (columnsOf().length !== 0) throw new Error('a released corpse must take its column along');
    // composed replays / warm-ups (no id) keep the world-fixed column
    fx.destruction(new THREE.Vector3(0, 0, 0), null, 'shot');
    fx.update(1 / 60, [], camera, resolve);
    if (fx.getAttachmentDebug().subjects.length !== 0) throw new Error('an unnamed destruction stays a world-fixed column');
    console.log('effectAttachments.selftest: wreck columns ride and leave with the corpse');
  } finally {
    if (documentBefore) Object.defineProperty(globalThis, 'document', documentBefore); else delete globalThis.document;
  }
}

// (fleet review 2026-11-03: s272 ztz99a2_qinglong, s86 leo2a4, s271 vt4a1_baihu) a tank firing at 15 m/s showed its
// flash a third of the barrel back: every muzzle part was born world-fixed and the hull drove on. (Loading-screen
// critics 2026-11-08: s39 Leopard 2A7V head-on, s286 Monsoon) the propellant left world-fixed sat ~1.2 m back along the
// barrel at 80 ms and hung over the firing tank's own turret. The policy says which parts ride the muzzle and which are
// born with its motion and shed it; this holds the battle flash on both tiers (pools and the media layer), its ring and
// light, and the Studio's cinematic blast to it.
{
  for (const family of ['muzzleFlash', 'muzzleRing', 'muzzleLight']) {
    if (EFFECT_ATTACHMENT_POLICY[family] !== 'shooter-velocity-burst' || shooterVelocityGain(family) !== 1) {
      throw new Error(`${family} must leave with the shooter's velocity`);
    }
  }
  if (EFFECT_ATTACHMENT_POLICY.muzzleSmoke !== 'shooter-velocity-shed-burst' || shooterVelocityGain('muzzleSmoke') !== 1) {
    throw new Error('muzzle smoke must be born with the shooter\'s velocity and shed it');
  }
  for (const family of ['muzzleGroundDust', 'rocketIgnitionSmoke']) {
    if (EFFECT_ATTACHMENT_POLICY[family] !== 'world-space-burst' || shooterVelocityGain(family) !== 0) {
      throw new Error(`${family} must stay world-space`);
    }
  }
  // the shed rate: the medium's own drag where it is fast enough, else the pooled cards' 0.1 s; nothing else is shed
  near(shooterCarryDrag('muzzleSmoke', 0.9), MUZZLE_SMOKE_CARRY_DRAG, 'a weak pool sheds the carry at MUZZLE_SMOKE_CARRY_DRAG');
  near(shooterCarryDrag('muzzleSmoke', 4.2), 4.2, 'a medium with strong drag sheds the carry by its own drag');
  near(shooterCarryDrag('muzzleFlash', 0.6), 0.6, 'a bright part keeps its carry under its pool\'s drag');
  if (!(MUZZLE_SMOKE_CARRY_DRAG >= MUZZLE_SMOKE_CARRY_DRAG_MIN)) throw new Error('the pooled shed rate must meet the floor');

  // the carried point's velocity: hull speed along yaw, vertical speed, and the yaw rate swinging the muzzle
  const vel = [0, 0, 0];
  subjectPointVelocity({ state: { pos: { x: 2, y: 0, z: 3 }, yaw: 0, speed: 10, yawRate: 0.5, verticalSpeed: -1 } }, 2, 9, vel);
  near(vel[0], 3, 'a muzzle 6 m ahead swings toward +x as yaw grows'); near(vel[1], -1, 'vertical'); near(vel[2], 10, 'forward');
  subjectPointVelocity({ state: { yaw: Math.PI / 2, speed: -4 } }, 0, 0, vel);
  near(vel[0], -4, 'reversing along +x yaw'); near(vel[2], 0, 'no sideways drift', 1e-9);
  if (subjectPointVelocity(null, 0, 0, vel) || vel.some((v) => v !== 0)) throw new Error('an unresolved shooter carries nothing');
  // the GPU halves: a jet's origin is carried linearly (jets have no drag), so it stays on a moving brake; a propellant
  // card sheds its carry from the shot (a card born pre-aged takes it from the shot, not from its early birth)
  const particlesSource = fs.readFileSync(new URL('./particles.ts', import.meta.url), 'utf8');
  if (!particlesSource.includes('vec3 tipPos = aPB.xyz + aCV * age + axis * ( u * len );')) {
    throw new Error('the jet shader must carry each jet with its emitter (aCV)');
  }
  if (!particlesSource.includes('float carriedAge = max( age - aCV.w, 0.0 );') ||
    !particlesSource.includes('wpos += aCV.xyz * ( ( 1.0 - exp( -uCarryDrag * carriedAge ) ) / uCarryDrag );')) {
    throw new Error('the puff shader must shed a carried velocity from the shot (FX_CARRY)');
  }
  subjectPointVelocity({ state: { yaw: 0, speed: 900 } }, 0, 0, vel);
  if (Math.hypot(...vel) > 40 + 1e-9) throw new Error(`a teleport's one-tick speed must be bounded (${Math.hypot(...vel)})`);

  const { createRequire } = await import('node:module');
  const { createFx } = await import('./effects.ts');
  const { muzzleBlast } = await import('./cinematicRecipes.ts');
  const { volumePositionAt } = await import('./volumeMedia.ts');
  const { createCanvas } = createRequire(import.meta.url)('@napi-rs/canvas');
  const documentBefore = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { createElement(tag) { if (tag !== 'canvas') throw new Error(tag); return createCanvas(1, 1); } };
  const YAW = 0.4, SPEED = 15, AGE = 0.05, MEDIA_AT = 0.3;
  const fwd = [Math.sin(YAW), 0, Math.cos(YAW)];
  const muzzle0 = [fwd[0] * 5.5, 2.3, fwd[2] * 5.5];
  const shotVel = fwd.map((f) => f * SPEED);
  const flashCarry = shotVel.map((v) => v * shooterVelocityGain('muzzleFlash'));
  const smokeCarry = shotVel.map((v) => v * shooterVelocityGain('muzzleSmoke'));
  const groundCarry = shotVel.map((v) => v * shooterVelocityGain('muzzleGroundDust'));
  /** One 120 mm shot from a hull at `speed` along YAW: every particle pool, then the ring and light AGE later. */
  function fire(speed) {
    const handlers = new Map();
    const bus = { on(type, fn) { handlers.set(type, fn); return () => handlers.delete(type); }, emit(type, payload) { handlers.get(type)?.(payload); } };
    const scene = new THREE.Scene(); // the media layer (propellant gas, ground dust) mounts its draws on the scene
    const fx = createFx({ anisotropy: 4, scene }, { getHeightAt: () => 0 }, { seed: 91 });
    fx.bindBus(bus);
    scene.add(fx.group);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(-12, 4, 6); camera.lookAt(0, 2, 4); camera.updateMatrixWorld();
    const shooter = { visual: {}, state: { pos: new THREE.Vector3(0, 0, 0), yaw: YAW, speed, yawRate: 0, verticalSpeed: 0 } };
    const resolve = (id) => (id === 'h1' ? shooter : null);
    fx.update(1 / 60, [], camera, resolve);
    bus.emit('shell:fired', { shellId: 1, shooterId: 'h1', shellType: 'HEAT', caliberMm: 120, muzzlePos: muzzle0, dir: fwd });
    fx.update(0, [], camera, resolve);
    /** every instanced draw in traversal order (the particle pools, the media layer, chunks, marks), and the pools */
    const snapshot = () => {
      const pools = {}, instanced = [];
      scene.traverse((o) => {
        const attrs = {};
        for (const [key, attr] of Object.entries(o.geometry?.attributes ?? {})) {
          if (attr.isInstancedBufferAttribute) attrs[key] = Float32Array.from(attr.array);
        }
        if (!Object.keys(attrs).length) return;
        const u = o.material?.uniforms;
        const entry = { name: o.name, attrs, count: o.geometry.instanceCount, drag: u?.uDrag?.value ?? 0, carryDrag: u?.uCarryDrag?.value };
        instanced.push(entry);
        if (o.name.startsWith('particles:')) (pools[o.name.slice(10)] ??= []).push(entry);
      });
      return { pools, instanced };
    };
    const { pools, instanced } = snapshot();
    fx.update(AGE, [], camera, resolve);
    const ring = [];
    const light = [];
    fx.group.traverse((o) => {
      if (o.name === 'fx:muzzleRing' && o.visible) ring.push(o.position.clone());
      if (o.name === 'fx:muzzleLight') light.push(o.position.clone());
    });
    // the media layer uploads only its live bodies: by 0.3 s every gas and dust body of the shot is born and none gone
    fx.update(MEDIA_AT - AGE, [], camera, resolve);
    const media = snapshot().instanced.find((e) => e.name === 'fx-volume-media');
    // the shot's instant on the particle clock: the core card is born at the shot
    return { pools, instanced, ring, light, media, shotT: pools.flash[0].attrs.aPB[3] };
  }
  const muzzleAt = (t) => muzzle0.map((m, k) => m + shotVel[k] * t);
  /** lag (m) behind a moving muzzle t s after the shot, against a still gun's card at the same place relative to its muzzle */
  const lagOf = (stillP, movingP, t) => Math.hypot(...[0, 1, 2].map((k) => (movingP[k] - muzzleAt(t)[k]) - (stillP[k] - muzzle0[k])));
  const report = [];
  try {
    // desktop tier first (the media layer takes the propellant gas and ground dust), then the phone tier, whose pooled
    // propellant mass, smoke ring and wisps leave with the muzzle and whose ground dust stays (the tier resolves once
    // per process)
    const still = fire(0), moving = fire(SPEED);
    const windowBefore = Object.getOwnPropertyDescriptor(globalThis, 'window');
    globalThis.window = { location: { search: '?tier=mobile' } };
    let phoneStill, phoneMoving;
    try {
      const { resolveDeviceTier, getDeviceTier } = await import('../engine/quality.ts');
      if (resolveDeviceTier() !== 'mobile' || getDeviceTier() !== 'mobile') throw new Error('the phone tier did not resolve');
      phoneStill = fire(0); phoneMoving = fire(SPEED);
    } finally {
      if (windowBefore) Object.defineProperty(globalThis, 'window', windowBefore); else delete globalThis.window;
    }
    /** bright pool -> [velocity attribute, its item size]: born at the same muzzle point, carrying the flash's gain */
    const bright = { flash: ['aVL', 4], fire: ['aVL', 4], sparks: ['aVL', 4], jet: ['aCV', 3] };
    for (const [tier, a0, b0] of [['desktop', still, moving], ['phone', phoneStill, phoneMoving]]) {
      for (const [pool, [key, size]] of Object.entries(bright)) {
        const a = a0.pools[pool]?.[0], b = b0.pools[pool]?.[0];
        if (!a || !b || a.count !== b.count) throw new Error(`${tier} ${pool}: the shot must fill the same slots still and moving`);
        if (a.count === 0) throw new Error(`${tier} ${pool}: the shot emitted nothing`);
        for (let i = 0; i < a.count; i++) {
          for (let k = 0; k < 3; k++) {
            near(b.attrs.aPB[i * 4 + k] - a.attrs.aPB[i * 4 + k], 0, `${tier} ${pool}[${i}] is born at the same muzzle point`);
            if (key === 'aCV' && a.attrs.aCV[i * 3 + k] !== 0) throw new Error(`a still muzzle's jet must carry nothing (${pool}[${i}])`);
            near(b.attrs[key][i * size + k] - a.attrs[key][i * size + k], flashCarry[k], `${tier} ${pool}[${i}] carries ${flashCarry[k]} on axis ${k}`, 1e-4);
          }
        }
      }
    }

    // phone tier: the pooled propellant (mass, smoke ring, plume, wisps) is born at the same place with the same air
    // velocity, and carries the muzzle's motion apart (aCV), from the shot, shed at the pool's carry rate
    const pa = phoneStill.pools.psmoke[0], pb = phoneMoving.pools.psmoke[0];
    if (!(pa.count > 0) || pa.count !== pb.count) throw new Error('the phone tier must pool its propellant smoke, still and moving alike');
    near(pb.carryDrag, shooterCarryDrag('muzzleSmoke', pb.drag), 'the propellant pool sheds the carry at the policy rate');
    if (!(pb.carryDrag > pb.drag)) throw new Error('the propellant pool\'s own drag is the weak one the carry must not ride on');
    let phoneLag80 = 0, phoneTrail500 = Infinity;
    const cardPos = (e, i, t, shotT) => {
      const A = e.attrs, j = i * 4;
      const age = shotT + t - A.aPB[j + 3];
      const k = Math.max(e.drag, 1e-4), sc = (1 - Math.exp(-k * age)) / k;
      const ca = Math.max(age - A.aCV[j + 3], 0), kc = e.carryDrag, cs = (1 - Math.exp(-kc * ca)) / kc;
      return [0, 1, 2].map((d) => A.aPB[j + d] + A.aVL[j + d] * sc + A.aCV[j + d] * cs + (d === 1 ? 0.5 * A.aC0[j + 3] * age * age : 0));
    };
    for (let i = 0; i < pa.count; i++) {
      const j = i * 4;
      for (let k = 0; k < 4; k++) {
        near(pb.attrs.aPB[j + k] - pa.attrs.aPB[j + k], 0, `phone psmoke[${i}] is born at the same place and time`);
        near(pb.attrs.aVL[j + k] - pa.attrs.aVL[j + k], 0, `phone psmoke[${i}] keeps the same air velocity`);
      }
      for (let k = 0; k < 3; k++) {
        near(pa.attrs.aCV[j + k], 0, `a still muzzle's propellant carries nothing (${i})`);
        near(pb.attrs.aCV[j + k], smokeCarry[k], `phone psmoke[${i}] carries ${smokeCarry[k]} on axis ${k}`, 1e-4);
      }
      // pre-aged at birth (a cloud already formed at the shot): the carry starts at the shot, not at the early birth
      near(pb.attrs.aCV[j + 3], Math.max(0, phoneMoving.shotT - pb.attrs.aPB[j + 3]), `phone psmoke[${i}] carries from the shot`, 1e-5);
      phoneLag80 = Math.max(phoneLag80, lagOf(cardPos(pa, i, 0.08, phoneStill.shotT), cardPos(pb, i, 0.08, phoneMoving.shotT), 0.08));
      phoneTrail500 = Math.min(phoneTrail500, lagOf(cardPos(pa, i, 0.5, phoneStill.shotT), cardPos(pb, i, 0.5, phoneMoving.shotT), 0.5));
    }

    // desktop tier: the media layer's propellant gas and brake lobes are born with the muzzle's motion (a puff born after
    // the shot from where the muzzle is then) and shed it by their own drag; its ground dust is untouched. The media
    // draw is depth-sorted, so its bodies are matched by their seeded birth, life and size.
    const ma = still.media, mb = moving.media;
    if (!ma || !mb || ma.count !== mb.count || !(ma.count > 0)) throw new Error('the desktop media layer must take the muzzle blast');
    const keyOf = (e, i) => `${e.attrs.aPB[i * 4 + 3]}|${e.attrs.aVL[i * 4 + 3]}|${e.attrs.aSZ[i * 4 + 1]}`;
    const byKey = new Map();
    for (let i = 0; i < mb.count; i++) byKey.set(keyOf(mb, i), i);
    if (byKey.size !== mb.count) throw new Error('the media bodies must be told apart by birth, life and size');
    let gas = 0, ground = 0, mediaLag80 = 0, mediaTrail500 = Infinity;
    const shotT = still.shotT;
    const recOf = (e, i) => [...e.attrs.aPB.subarray(i * 4, i * 4 + 4), ...e.attrs.aVL.subarray(i * 4, i * 4 + 4), ...e.attrs.aDY.subarray(i * 4, i * 4 + 4)];
    const bodyAt = (rec, t, at) => { const out = [0, 0, 0]; volumePositionAt(rec, 0, 0, 0, at + t - rec[3], out); return out; };
    for (let i = 0; i < ma.count; i++) {
      const n = byKey.get(keyOf(ma, i));
      if (n === undefined) throw new Error(`media body ${i} has no moving twin`);
      const isGas = ma.attrs.aPB[i * 4 + 1] > 1.2; // born at the muzzle (2.3 m), not off the ground
      const carry = isGas ? smokeCarry : groundCarry;
      const late = ma.attrs.aPB[i * 4 + 3] - shotT;
      for (const key of Object.keys(ma.attrs)) {
        const size = ma.attrs[key].length / ma.attrs.aPB.length * 4;
        for (let k = 0; k < size; k++) {
          const d = mb.attrs[key][n * size + k] - ma.attrs[key][i * size + k];
          const want = key === 'aVL' && k < 3 ? carry[k] : key === 'aPB' && k < 3 ? carry[k] * late : 0;
          near(d, want, `media ${isGas ? 'gas' : 'ground dust'} ${i}.${key}[${k}]`, 1e-3);
        }
      }
      if (!isGas) { ground++; continue; }
      gas++;
      const ra = recOf(ma, i), rb = recOf(mb, n);
      if (!(ra[8] >= MUZZLE_SMOKE_CARRY_DRAG_MIN)) throw new Error(`the media gas's drag must shed the carry itself (${ra[8]} /s)`);
      if (late > 0.08) continue;
      mediaLag80 = Math.max(mediaLag80, lagOf(bodyAt(ra, 0.08, shotT), bodyAt(rb, 0.08, shotT), 0.08));
      mediaTrail500 = Math.min(mediaTrail500, lagOf(bodyAt(ra, 0.5, shotT), bodyAt(rb, 0.5, shotT), 0.5));
    }
    if (gas !== Math.round(6 + 3 * 1) + 2 || !(ground > 0)) throw new Error(`the media blast: ${gas} gas bodies, ${ground} of ground dust`);

    // every other instanced draw (the smoke and dust pools, chunks, marks) is untouched by the shooter's motion
    const handled = new Set(['particles:flash', 'particles:fire', 'particles:sparks', 'particles:jet', 'particles:psmoke', 'fx-volume-media']);
    for (const [tier, a0, b0] of [['desktop', still, moving], ['phone', phoneStill, phoneMoving]]) {
      if (a0.instanced.length !== b0.instanced.length) throw new Error(`${tier}: the two shots must build the same draws`);
      let untouched = 0;
      a0.instanced.forEach((a, n) => {
        const b = b0.instanced[n];
        if (handled.has(a.name)) return;
        untouched += a.count;
        for (const key of Object.keys(a.attrs)) {
          if (a.attrs[key].some((v, i) => v !== b.attrs[key][i])) {
            throw new Error(`${tier}: ${a.name || `draw ${n}`}.${key} must not move with the shooter`);
          }
        }
      });
      if (tier === 'phone' && !(untouched > 0)) throw new Error('the phone tier must leave its pooled ground dust to stay');
    }

    // the core 100 ms on, through the puff shader's drag: in the muzzle's frame it sits where a still gun's does
    const displace = (v, grav, age, drag) => {
      const k = Math.max(drag, 1e-4), sc = (1 - Math.exp(-k * age)) / k;
      return [v[0] * sc, v[1] * sc + 0.5 * grav * age * age, v[2] * sc];
    };
    const corePos = (run, age) => {
      const { attrs, drag } = run.pools.flash[0];
      const d = displace([attrs.aVL[0], attrs.aVL[1], attrs.aVL[2]], attrs.aC0[3], age, drag);
      return [0, 1, 2].map((k) => attrs.aPB[k] + d[k]);
    };
    const t = 0.1;
    const stillCore = corePos(still, t), movingCore = corePos(moving, t);
    const offset = lagOf(stillCore, movingCore, t);
    const worldFixedLag = lagOf(stillCore, stillCore, t);
    if (!(offset < 0.08)) throw new Error(`the core must ride the muzzle at 15 m/s (${offset.toFixed(3)} m off at 100 ms)`);
    if (!(worldFixedLag > 1.4)) throw new Error(`the world-fixed reference must show the old lag (${worldFixedLag.toFixed(3)} m)`);
    // the propellant at 80 ms keeps near the muzzle (1.2 m world-fixed), and by 500 ms trails the hull, not riding along
    const fixed80 = SPEED * 0.08, drove500 = SPEED * 0.5;
    for (const [what, lag80, trail500] of [['desktop media gas', mediaLag80, mediaTrail500], ['phone propellant', phoneLag80, phoneTrail500]]) {
      if (!(lag80 <= 0.5)) throw new Error(`${what}: ${lag80.toFixed(3)} m behind a still gun's place at 80 ms (target ≤ 0.5; world-fixed ${fixed80.toFixed(2)})`);
      if (!(trail500 >= 0.4 * drove500)) throw new Error(`${what}: only ${trail500.toFixed(2)} m behind at 500 ms (the hull drove ${drove500} m): it rides along`);
      report.push(`${what} ${lag80.toFixed(2)} m at 80 ms, ${trail500.toFixed(2)} m at 500 ms`);
    }
    // the pressure ring and the muzzle light ride the bore by their own policy rows
    if (still.ring.length !== 1 || moving.ring.length !== 1) throw new Error('one muzzle ring must be live 50 ms after the shot');
    if (still.light.length !== 1 || moving.light.length !== 1) throw new Error('the muzzle light must be found');
    const ringK = shooterVelocityGain('muzzleRing'), lightK = shooterVelocityGain('muzzleLight');
    for (let k = 0; k < 3; k++) {
      const axis = ['x', 'y', 'z'][k];
      near(moving.ring[0][axis] - still.ring[0][axis], shotVel[k] * AGE * ringK, `ring rides the muzzle (${axis})`, 1e-4);
      near(moving.light[0][axis] - still.light[0][axis], shotVel[k] * AGE * lightK, `light rides the muzzle (${axis})`, 1e-4);
    }
    console.log(`effectAttachments.selftest: a 15 m/s shot's core rides its muzzle (${offset.toFixed(3)} m vs ${worldFixedLag.toFixed(2)} m world-fixed at 100 ms); ` +
      `its propellant keeps near it and trails (${report.join('; ')}; world-fixed ${fixed80.toFixed(2)} m at 80 ms)`);
  } finally {
    if (documentBefore) Object.defineProperty(globalThis, 'document', documentBefore); else delete globalThis.document;
  }

  // (round 8 Y6, s4-05) one writer of the muzzle light's pulse: a shot whose muzzle point is not finite (the
  // black-screen-228 RC6 case flashLight's guard refuses) lights nothing and leaves the pulse burning where it was. The
  // carry was a second writer (carryLight) its callers ran even when the guard refused the pulse: another gun's pulse,
  // still burning, took the new shooter's velocity and slid off its gun, and a turning shooter's NaN velocity (a NaN muzzle
  // x or z through the yaw-rate swing) parked the light at a NaN place every frame after, past a battle reset. (The phone
  // tier resolved above holds for the rest of the process; the light's path is the same on every tier.)
  {
    globalThis.document = { createElement(tag) { if (tag !== 'canvas') throw new Error(tag); return createCanvas(1, 1); } };
    try {
      /** Gun a (10 m/s along +Z) fires; then, in the same frame (inside MUZZLE_LIGHT_S), gun b's shot does what `second`
       *  says; the muzzle light 50 ms on, and again after a battle reset and one more frame. */
      const lightAfter = (second) => {
        const handlers = new Map();
        const bus = { on(type, fn) { handlers.set(type, fn); return () => handlers.delete(type); }, emit(type, payload) { handlers.get(type)?.(payload); } };
        const scene = new THREE.Scene();
        const fx = createFx({ anisotropy: 4, scene }, { getHeightAt: () => 0 }, { seed: 91 });
        fx.bindBus(bus);
        scene.add(fx.group);
        const camera = new THREE.PerspectiveCamera();
        camera.position.set(-12, 4, 6); camera.lookAt(0, 2, 4); camera.updateMatrixWorld();
        const a = { visual: {}, state: { pos: new THREE.Vector3(0, 0, 0), yaw: 0, speed: 10, yawRate: 0, verticalSpeed: 0 } };
        // gun b drives along -X (yaw -90 deg) 20 m off, turning or not as the case asks
        const b = { visual: {}, state: { pos: new THREE.Vector3(20, 0, 0), yaw: -Math.PI / 2, speed: 10, yawRate: 0, verticalSpeed: 0 } };
        const resolve = (id) => (id === 'a' ? a : id === 'b' ? b : null);
        fx.update(1 / 60, [], camera, resolve);
        bus.emit('shell:fired', { shellId: 1, shooterId: 'a', shellType: 'HEAT', caliberMm: 120, muzzlePos: [0, 2.3, 5.5], dir: [0, 0, 1] });
        second?.(bus, fx, b);
        fx.update(0.05, [], camera, resolve);
        const light = fx.group.getObjectByName('fx:muzzleLight');
        const now = light.position.clone();
        fx.resetAll();
        fx.update(1 / 60, [], camera, resolve);
        return { now, reset: light.position.clone() };
      };
      const alone = lightAfter(null);
      const same = (run, label) => {
        if (![...run.now.toArray(), ...run.reset.toArray()].every(Number.isFinite)) {
          throw new Error(`${label}: the muzzle light is at a non-finite place (${run.now.toArray()}; after a reset ${run.reset.toArray()})`);
        }
        for (const k of ['x', 'y', 'z']) near(run.now[k], alone.now[k], `${label}: the light stays on gun a's pulse (${k})`, 1e-6);
      };
      // gun b, still on its course, fires with a NaN muzzle height: its velocity is finite, and a's pulse took it
      same(lightAfter((bus) => bus.emit('shell:fired', { shellId: 2, shooterId: 'b', shellType: 'HEAT', caliberMm: 120,
        muzzlePos: [14.5, NaN, 0], dir: [-1, 0, 0] })), 'a refused cannon pulse (NaN muzzle height)');
      // gun b, turning, fires with a NaN muzzle x: its swing makes its velocity NaN, and the light went to NaN
      same(lightAfter((bus, fx, b) => {
        b.state.yawRate = 0.5;
        bus.emit('shell:fired', { shellId: 2, shooterId: 'b', shellType: 'HEAT', caliberMm: 120, muzzlePos: [NaN, 2.3, 0], dir: [-1, 0, 0] });
      }), 'a refused cannon pulse from a turning gun (NaN muzzle x)');
      // a rocket's ignition (fx.muzzleFlash's rocket path) lights the same pulse
      same(lightAfter((bus, fx, b) => {
        b.state.yawRate = 0.5;
        fx.muzzleFlash(new THREE.Vector3(NaN, 2.3, 0), new THREE.Vector3(-1, 0, 0), 80, true, 'b');
      }), 'a refused rocket pulse from a turning launcher (NaN muzzle x)');
      console.log('effectAttachments.selftest: a refused muzzle-light pulse leaves the burning one where it was (no slide, no NaN, none after a reset)');
    } finally {
      if (documentBefore) Object.defineProperty(globalThis, 'document', documentBefore); else delete globalThis.document;
    }
  }

  // (round 8 H9, the 271 merge) a gun's near field (engine/muzzleNearField.ts) binds only to a pulse flashLight lit. Gun a's
  // 120 mm pulse burns and its near field names a's bore; then gun b's pulse is refused by flashLight's finite guard (a
  // non-finite muzzle place) at each of the three sites that bind a near field: the roof-gun flash port, muzzleFlash and
  // composeFiringMoment. Main's shape bound b's bore to a's pulse after the refusal (boundGunNearField without the lit
  // gate), so a's gun lost its bound and b's line of fire took a's light. The near field keeps a's bore and radius, and a
  // battle reset releases it. A lit pulse from the same site binds its own gun (the control: each site reaches the bind).
  {
    globalThis.document = { createElement(tag) { if (tag !== 'canvas') throw new Error(tag); return createCanvas(1, 1); } };
    try {
      const { attachMuzzleNearField } = await import('../engine/muzzleNearField.ts');
      const { auxiliaryCapabilities } = await import('../vehicles/auxiliaryInventory.ts');
      /** the published near field, as a lit program binds it */
      const shared = { uniforms: {}, fragmentShader: '' };
      attachMuzzleNearField(shared);
      const seat = shared.uniforms.uCotMuzzleSeat.value, bore = shared.uniforms.uCotMuzzleBore.value;
      const ROOF_SPEC = { id: 'm1a1' }, roofGun = auxiliaryCapabilities(ROOF_SPEC)?.guns[0];
      if (!roofGun) throw new Error('the m1a1 must carry a roof gun for the flash port');
      /** Gun a (120 mm, line of fire +Z) fires on the battle path; then gun b (line of fire -X, its roof gun on the hull
       *  root) does what `second` says; two frames on, the published near field, and again after a battle reset and
       *  after one more frame. */
      const nearFieldAfter = (second) => {
        const handlers = new Map();
        const bus = { on(type, fn) { handlers.set(type, fn); return () => handlers.delete(type); }, emit(type, payload) { handlers.get(type)?.(payload); } };
        const scene = new THREE.Scene();
        let clock = 0;
        const root = new THREE.Group();
        root.rotation.y = -Math.PI / 2; // the roof gun's line of fire: -X
        root.position.set(20, 0, 0);
        const gun = new THREE.Object3D();
        gun.name = roofGun.name;
        gun.position.set(0, 2.4, 0);
        root.add(gun);
        scene.add(root);
        const a = { id: 'a', visual: {}, state: { pos: new THREE.Vector3(0, 0, 0), yaw: 0, speed: 10, yawRate: 0, verticalSpeed: 0 } };
        const b = { id: 'b', spec: ROOF_SPEC, visual: { root },
          combat: { auxiliary: { gunYaw: 0, gunPitch: 0, shots: 0 } },
          state: { pos: root.position, yaw: -Math.PI / 2, speed: 10, yawRate: 0, verticalSpeed: 0 } };
        const fx = createFx({ anisotropy: 4, scene }, { getHeightAt: () => 0 },
          { seed: 91, auxiliaryEntities: () => [b], auxiliaryTime: () => clock });
        fx.bindBus(bus);
        scene.add(fx.group);
        const camera = new THREE.PerspectiveCamera();
        camera.position.set(-12, 4, 6); camera.lookAt(0, 2, 4); camera.updateMatrixWorld();
        const resolve = (id) => (id === 'a' ? a : id === 'b' ? b : null);
        const frame = () => { clock += 1 / 60; fx.update(1 / 60, [], camera, resolve); };
        frame(); // the roof station is prepared on its first frame
        bus.emit('shell:fired', { shellId: 1, shooterId: 'a', shellType: 'HEAT', caliberMm: 120, muzzlePos: [0, 2.3, 5.5], dir: [0, 0, 1] });
        second?.(bus, fx, b, root);
        // two frames: the roof station fires inside a frame, and a pulse lit there burns from the next one
        frame(); frame();
        const light = fx.group.getObjectByName('fx:muzzleLight');
        const now = { w: seat.w, bore: bore.clone(), seat: new THREE.Vector3(seat.x, seat.y, seat.z), light: light.position.clone() };
        fx.resetAll();
        const atReset = seat.w;
        frame();
        return { ...now, atReset, after: seat.w };
      };
      const alone = nearFieldAfter(null);
      const A_BORE = new THREE.Vector3(0, 0, 1), B_BORE = new THREE.Vector3(-1, 0, 0);
      if (!(alone.w > 0) || alone.bore.distanceTo(A_BORE) > 1e-9) {
        throw new Error(`gun a's burning pulse must publish its own near field (w ${alone.w}, bore ${alone.bore.toArray()})`);
      }
      const keepsA = (run, label) => {
        if (run.bore.distanceTo(A_BORE) > 1e-9) {
          throw new Error(`${label}: the near field must still name gun a's bore (got ${run.bore.toArray()}, b's is ${B_BORE.toArray()})`);
        }
        near(run.w, alone.w, `${label}: the near field keeps gun a's radius`, 1e-9);
        if (run.seat.distanceTo(run.light) > 1e-6 || run.light.distanceTo(alone.light) > 1e-6) {
          throw new Error(`${label}: the near field's seat must stay gun a's burning light (${run.seat.toArray()} vs ${alone.light.toArray()})`);
        }
        if (run.atReset !== 0 || run.after !== 0) {
          throw new Error(`${label}: a battle reset must release the near field (${run.atReset} at the reset, ${run.after} a frame on)`);
        }
      };
      const bindsB = (run, label) => {
        if (!(run.w > 0) || run.bore.distanceTo(B_BORE) > 1e-6) {
          throw new Error(`${label}: a lit pulse must bind its own gun's near field (w ${run.w}, bore ${run.bore.toArray()})`);
        }
      };
      /** the three sites: gun b's shot at a finite muzzle, or at a non-finite one flashLight refuses */
      const sites = {
        'the roof-gun flash port': (finite) => (bus, fx, b, root) => {
          // the station's mount at a non-finite place: its muzzle is not finite, its line of fire is (a non-finite hull
          // would poison the mount's rotation too, and a non-finite line of fire binds nothing on either shape)
          if (!finite) root.getObjectByName(roofGun.name).position.x = NaN;
          b.combat.auxiliary.shots++;
        },
        muzzleFlash: (finite) => (bus) => bus.emit('shell:fired', { shellId: 2, shooterId: 'b', shellType: 'HEAT', caliberMm: 120,
          muzzlePos: [finite ? 14.5 : NaN, 2.3, 0], dir: [-1, 0, 0] }),
        composeFiringMoment: (finite) => (bus, fx) => fx.composeFiringMoment({ muzzlePos: new THREE.Vector3(finite ? 14.5 : NaN, 2.3, 0),
          dir: new THREE.Vector3(-1, 0, 0), caliberMm: 120, tracerType: 'HEAT', ageS: 0 }),
      };
      for (const [site, shot] of Object.entries(sites)) {
        bindsB(nearFieldAfter(shot(true)), `${site} (a lit pulse)`);
        keepsA(nearFieldAfter(shot(false)), `${site} (a refused pulse)`);
      }
      console.log('effectAttachments.selftest: a refused pulse binds no near field at any of its three sites (gun a keeps its bore and radius; a reset releases it)');
    } finally {
      if (documentBefore) Object.defineProperty(globalThis, 'document', documentBefore); else delete globalThis.document;
    }
  }

  // the Studio's cinematic blast layered over it: fireball, flash disc and sparks carry; the propellant ring and gas cone
  // are born with the muzzle's motion apart from their air velocity (the propellant pool sheds it); dust and grit stay
  const cine = (muzzleVel) => {
    let a = 0x5eed;
    const rng = () => { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const out = { fire: [], psmoke: [], dust: [], streak: [], chunk: [], jet: [] };
    const carried = { psmoke: [], dust: [] };
    const sink = {
      puff: (pool, o) => {
        (out[pool] ??= []).push([...o.vel]);
        (carried[pool] ??= []).push([...(o.carry ?? [0, 0, 0])]);
        (carried.birth ??= []).push(o.birthOffset);
      },
      streak: (o) => out.streak.push([...o.vel]),
      chunk: (o) => out.chunk.push([...o.vel]),
      jet: (o) => out.jet.push([...(o.carry ?? [0, 0, 0])]),
    };
    const tone = (x, z, o) => { o.light[0] = o.light[1] = o.light[2] = 0.5; o.dark[0] = o.dark[1] = o.dark[2] = 0.3; return o; };
    const ctx = { sink, world: { groundY: () => 0, tone, water: () => 0 }, env: { night: 0, nowS: 0 }, rng, shift: 0,
      pulse() {}, addEmitter() {}, scorch() {}, shockRing() {} };
    muzzleBlast(ctx, muzzle0[0], muzzle0[1], muzzle0[2], fwd[0], fwd[1], fwd[2], 120, muzzleVel);
    return { ...out, carried };
  };
  const a = cine([0, 0, 0]), b = cine(shotVel);
  const k = shooterVelocityGain('muzzleFlash'), kg = shooterVelocityGain('muzzleGroundDust');
  for (const [kind, gain] of [['fire', k], ['streak', k], ['jet', k], ['psmoke', 0], ['dust', kg], ['chunk', kg]]) {
    if (!a[kind].length || a[kind].length !== b[kind].length) throw new Error(`cinematic ${kind}: the blast must emit the same parts`);
    for (let i = 0; i < a[kind].length; i++) {
      for (let j = 0; j < 3; j++) near(b[kind][i][j] - a[kind][i][j], shotVel[j] * gain, `cinematic ${kind}[${i}] carry`, 1e-9);
    }
  }
  if (a.carried.birth.some((v, i) => v !== b.carried.birth[i])) throw new Error('cinematic: the carry must not move a puff\'s birth');
  for (const [kind, gain] of [['psmoke', shooterVelocityGain('muzzleSmoke')], ['dust', kg]]) {
    for (let i = 0; i < a.carried[kind].length; i++) {
      for (let j = 0; j < 3; j++) {
        near(a.carried[kind][i][j], 0, `cinematic ${kind}[${i}]: a still muzzle carries nothing`);
        near(b.carried[kind][i][j], shotVel[j] * gain, `cinematic ${kind}[${i}] is born with the muzzle's motion`, 1e-9);
      }
    }
  }
  console.log('effectAttachments.selftest: the cinematic muzzle blast carries its bright parts and its propellant, and leaves its dust');
}
