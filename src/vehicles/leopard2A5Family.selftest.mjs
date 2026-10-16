// Leopard 2A5 family builds (2026-10-10). A battle start aborted in a dev server when a Leopard 2A5 bot's exact loader
// gun failed KIT.fittings.markExact: the lazily loaded profile pack held a second copy of three (the dependency
// optimizer re-ran mid-session), so `instanceof THREE.Mesh` rejected its own receiver. markExact now reads three's own
// isMesh flag; every family spec builds at both geometry qualities across camouflage seeds; and a roster visual that
// still fails falls back instead of aborting the battle (game/rosterVisualFallback.ts).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';

const restoreCanvas = installCanvasFixture();
const { createTank } = await import('./tankFactory.ts');
const { TANK_SPECS } = await import('./specs.ts');
const { ensureInteriorFills } = await import('./interiorFills.ts');
const { FITTINGS } = await import('./profiles/kit.ts');
const { rosterVisualAttempts } = await import('../game/rosterVisualFallback.ts');

// 1. markExact accepts a mesh from a second copy of three (not instanceof the local THREE.Mesh, but isMesh);
//    an empty group and a shadow-only mesh still fail.
class ForeignMesh extends THREE.Object3D {
  constructor(geometry, material) { super(); this.isMesh = true; this.geometry = geometry; this.material = material; }
}
const foreign = new THREE.Group();
foreign.add(new ForeignMesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial()));
assert.doesNotThrow(() => FITTINGS.markExact(foreign, 'pintleMG'), 'a duplicate copy of three still marks its exact fitting');
assert.equal(foreign.userData.fittingExact, true);
assert.throws(() => FITTINGS.markExact(new THREE.Group(), 'pintleMG'), /visible mesh geometry/, 'empty group still fails');
const shadowOnly = new THREE.Group();
shadowOnly.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ colorWrite: false })));
assert.throws(() => FITTINGS.markExact(shadowOnly, 'pintleMG'), /visible mesh geometry/, 'shadow-only mesh still fails');

// 2. Every spec that builds through buildLeo2A5 (the donor chain), at HIGH and LOW, across eight camouflage seeds.
const donorChain = (id) => {
  const chain = [];
  for (let spec = TANK_SPECS[id]; spec?.variantOf && !chain.includes(spec.variantOf); spec = TANK_SPECS[spec.variantOf]) chain.push(spec.variantOf);
  return chain;
};
const family = Object.keys(TANK_SPECS).filter((id) => id === 'leo2a4_v' || donorChain(id).includes('leo2a4_v')).sort();
for (const id of ['leo2a4_v', 'leo2a4m', 'leo2a5', 'strv121', 'strv122']) assert.ok(family.includes(id), `${id} is in the family`);
await ensureInteriorFills(family);
let builds = 0;
for (const id of family) for (const quality of ['high', 'low']) for (let k = 0; k < 8; k++) {
  const camoSeed = 4000 + k * 397;
  let tank;
  assert.doesNotThrow(() => { tank = createTank(id, null, { quality, camoSeed, proceduralOnly: true }); }, `${id} ${quality} seed ${camoSeed} builds`);
  // A roof machine gun with visible geometry on every build: the certified exact loader gun (A5, Strv 122), the A5NL's
  // working remote station, or the source-X variants' own roof weapons.
  let guns = 0;
  tank.root.traverse((o) => {
    if (!o.userData?.fittingRoot || o.userData.fitting !== 'pintleMG') return;
    let meshes = 0;
    o.traverse((c) => { if (c.isMesh && c.geometry) meshes++; });
    if (meshes > 0) guns++;
  });
  assert.ok(guns > 0, `${id} ${quality}: a roof machine gun is built with visible geometry`);
  if (id === 'leo2a4_v' || id === 'strv121') assert.ok(tank.root.getObjectByName('leo2a5_loader_machine_gun'), `${id}: the exact loader gun`);
  tank.dispose();
  builds++;
}

// 3. Fail-soft roster visuals: authored, then the other geometry tier, the donor, and the first participant's tank.
assert.deepEqual(rosterVisualAttempts('leo2a5', { geometryQuality: 'low', camoSeed: 1 }, 'leo2a4_v', 'm1a1_abrams_hc')
  .map((a) => [a.specId, a.reason, a.options.geometryQuality]),
[['leo2a5', 'authored', 'low'], ['leo2a5', 'other geometry tier', 'high'], ['leo2a4_v', 'donor', 'low'], ['m1a1_abrams_hc', 'stand-in', 'low']]);
assert.deepEqual(rosterVisualAttempts('m1a1_abrams_hc', { geometryQuality: 'high' }, undefined, 'm1a1_abrams_hc').map((a) => a.reason),
  ['authored', 'other geometry tier'], 'no self or duplicate fallbacks');
restoreCanvas();
console.log(`leopard2A5Family: markExact duplicate-three and negative controls, ${family.length} family specs x 2 qualities x 8 seeds (${builds} builds), fail-soft attempt order passed`);
