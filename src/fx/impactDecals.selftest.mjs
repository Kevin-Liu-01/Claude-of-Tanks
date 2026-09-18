import {
  IMPACT_DECAL_CAP, IMPACT_DECAL_LIFT_M, impactDecalDescriptor,
} from './impactDecals.ts';
import { SURFACE_MARKING_STYLE } from '../vehicles/vehicleMarkings.ts';
import { readFile } from 'node:fs/promises';

if (IMPACT_DECAL_CAP < 16) throw new Error('impact decal vehicle budget regressed');
if (IMPACT_DECAL_LIFT_M <= 0 || IMPACT_DECAL_LIFT_M > 0.01) {
  throw new Error(`impact decals must sit within 10 mm of armor (${IMPACT_DECAL_LIFT_M} m)`);
}
if (IMPACT_DECAL_LIFT_M !== SURFACE_MARKING_STYLE.surfaceLiftM) {
  throw new Error('impact scars and painted designations must share one surface-layer contract');
}

// The lazy FX runtime subscribes after the always-live typed combat-feedback
// owner. Impact decals therefore need one event owner: effects.ts. If the
// feedback listener also calls the legacy direct API, every penetration gets
// one hull-local mark followed by a second authoritative articulation-local
// mark from the same shell:hit dispatch.
const feedbackSource = await readFile(
  new URL('../game/combatFeedbackRuntime.ts', import.meta.url), 'utf8',
);
const shellHitStart = feedbackSource.indexOf("listen('shell:hit'");
const shellHitEnd = feedbackSource.indexOf("listen('shell:fired'", shellHitStart);
if (shellHitStart < 0 || shellHitEnd < 0) {
  throw new Error('battle shell:hit presentation listener is missing');
}
const shellHitListener = feedbackSource.slice(shellHitStart, shellHitEnd);
if (shellHitListener.includes('.armorScar(')) {
  throw new Error('battle shell:hit must not stamp a second legacy impact decal');
}

const effectsSource = await readFile(new URL('./effects.ts', import.meta.url), 'utf8');
if (!/onFxEvent\(bus, 'shell:hit',[\s\S]{0,1800}impactDecals\.stampFromEvent\(e, ent\)/.test(effectsSource)) {
  throw new Error('authoritative shell:hit impact-decal ownership left effects.ts');
}

const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
if (!/await createFxChunked\(engineCtx, hfProxy, \{[\s\S]{0,320}resolveEntity:[\s\S]{0,120}resolveFxSubject/.test(mainSource)) {
  throw new Error('production FX must resolve struck solo, network, and player-owned tanks');
}
if (!/const resolved = resolveEntity\?\.\(targetId\);[\s\S]{0,100}isDecalEntity\(resolved\)/.test(effectsSource)) {
  throw new Error('impact decals must prefer the injected production entity resolver');
}

const pen = impactDecalDescriptor('pen');
const critical = impactDecalDescriptor('pen', true);
const ricochet = impactDecalDescriptor('ricochet');
const nonpen = impactDecalDescriptor('nonpen');
const spaced = impactDecalDescriptor('spaced_absorb');
const splash = impactDecalDescriptor('he_splash');
if (!pen?.hasHole || !critical?.hasHole) {
  throw new Error('penetrating hits must retain a visible entry hole');
}
for (const [label, mark] of [['ricochet', ricochet], ['nonpen', nonpen],
  ['spaced absorb', spaced], ['HE splash', splash]]) {
  if (!mark || mark.hasHole) throw new Error(`${label} must use a no-hole surface mark`);
}
if (ricochet.family !== 'gouge' || nonpen.family !== 'scuff'
    || spaced.family !== 'scuff' || splash.family !== 'scorch') {
  throw new Error('resolved hit outcomes lost their distinct decal families');
}
if (pen.variants < 4 || ricochet.variants < 4 || nonpen.variants < 3) {
  throw new Error('impact decal atlas no longer provides enough per-outcome variation');
}

console.log('impactDecals.selftest: production ownership and outcome-specific scars passed');

// owner r1 (owner 2026-09-17: "hit marks registered to hull when on turret →
// attach to turret/gun"): a hull-frame contact whose rendered skin belongs to
// the turret rig is stamped INTO rig_turret; a real hull contact stays on the
// hull root. Headless: the atlas paints through @napi-rs/canvas.
{
  const { createRequire } = await import('node:module');
  const THREE = await import('three');
  const { createImpactDecals } = await import('./impactDecals.ts');
  const { createCanvas } = createRequire(import.meta.url)('@napi-rs/canvas');
  const documentBefore = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { createElement(tag) { if (tag !== 'canvas') throw new Error(tag); return createCanvas(1, 1); } };
  try {
    const decals = createImpactDecals({ seed: 7 });
    const root = new THREE.Object3D();
    const skin = () => new THREE.MeshStandardMaterial();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 6), skin());
    hull.position.y = 0.5; root.add(hull);
    const turret = new THREE.Object3D(); turret.name = 'rig_turret'; turret.position.y = 1.0; root.add(turret);
    const turretBox = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 3), skin());
    turretBox.position.y = 0.4; turret.add(turretBox);
    const gun = new THREE.Object3D(); gun.name = 'rig_gun'; gun.position.set(0, 0.4, 1.5); turret.add(gun);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 12), skin());
    barrel.rotation.x = Math.PI / 2; barrel.position.z = 2; gun.add(barrel);
    root.updateWorldMatrix(true, true);
    const ent = { visual: { root, isDestroyed: () => false }, state: { pos: new THREE.Vector3(), yaw: 0, turretYaw: 0 },
      spec: { id: 'owner-probe', armor: { turretPivot: [0, 1, 0], gunPivot: [0, 0.4, 1.5] } } };
    const hit = (impactLocalPos, impactLocalNormal, zone) => ({ kind: 'pen', targetId: 'owner-probe-1', caliberMm: 105,
      zone, impactFrame: 'hull', impactLocalPos, impactLocalNormal, impactLocalDir: impactLocalNormal.map((c) => -c),
      pos: impactLocalPos, normal: impactLocalNormal });
    const parentsOfMarks = () => { const out = []; root.traverse((o) => { if (o.name === 'fx_impactDecals') out.push(o.parent); }); return out; };
    // 1. an armor "hull" contact on the turret's right cheek (turret occupies y 1.0..1.8, x ±1)
    if (!decals.stampFromEvent(hit([1.0, 1.4, 0.2], [1, 0, 0], 'turret_side'), ent)) throw new Error('turret-skin stamp skipped');
    let parents = parentsOfMarks();
    if (parents.length !== 1 || parents[0] !== turret) throw new Error('a hull-frame contact on turret skin must be stamped into rig_turret');
    // 2. a genuine hull contact stays on the hull root
    if (!decals.stampFromEvent(hit([1.5, 0.5, -1.0], [1, 0, 0], 'hull_side'), ent)) throw new Error('hull stamp skipped');
    parents = parentsOfMarks();
    if (parents.length !== 2 || !parents.includes(root) || !parents.includes(turret)) throw new Error('a hull contact must stay on the hull root');
    // 3. a hull-frame contact on the gun tube skin rides rig_gun
    if (!decals.stampFromEvent(hit([0.08, 1.4, 3.5], [1, 0, 0], 'mantlet'), ent)) throw new Error('gun-skin stamp skipped');
    parents = parentsOfMarks();
    if (parents.length !== 3 || !parents.includes(gun)) throw new Error('a hull-frame contact on gun skin must be stamped into rig_gun');
    console.log('impactDecals.selftest: visual-owner routing (turret, hull, gun) passed');
  } finally {
    if (documentBefore) Object.defineProperty(globalThis, 'document', documentBefore); else delete globalThis.document;
  }
}
