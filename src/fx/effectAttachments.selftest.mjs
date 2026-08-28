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
const effectsSource = fs.readFileSync(new URL('./effects.js', import.meta.url), 'utf8');
const mainSource = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const studioSource = fs.readFileSync(new URL('../game/studio.js', import.meta.url), 'utf8');
if (!effectsSource.includes('syncSubjectEmitterAnchor(col, subject, _subjectAnchor)')) {
  throw new Error('burning columns are not refreshed through the attachment helper');
}
if (!effectsSource.includes('retireSubjectColumn(e.id);')) {
  throw new Error('tank destruction does not retire the live burning emitter');
}
if (!effectsSource.includes('setReplaySuppressed(suppressed)')) {
  throw new Error('effects lack the reversible killcam reconstruction gate');
}
if (!effectsSource.includes('if (replaySuppressed) col.acc = 0;')) {
  throw new Error('suppressed wreck columns can accumulate a replay emission backlog');
}
if (!mainSource.includes('game.shells, camera, resolveFxSubject')) {
  throw new Error('battle fx update lacks the solo/network subject resolver');
}
if (!studioSource.includes('fx.update(dt, shells, camera, resolveFxSubject)')) {
  throw new Error('Studio fx update lacks its actor subject resolver');
}

console.log('effect attachment selftest passed');
