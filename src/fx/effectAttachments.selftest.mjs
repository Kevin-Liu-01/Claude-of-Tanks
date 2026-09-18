import fs from 'node:fs';
import * as THREE from 'three';
import {
  EFFECT_ATTACHMENT_POLICY,
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
  'muzzleRing', 'impactParticles', 'destructionParticles',
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
