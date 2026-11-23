// garage-env-276: the Garage's outdoor scene packs build their structures the battlefield's way.
//
// 1. every merged structure draw wears the battlefield material of its bucket (buildStructureSurfaces: its propsKind is
//    the bucket's name and its program is the world props' own), never a Garage re-skin; only the approach keeps its own;
// 2. each pack's source map rebuilds its buildings through its regional architecture kit, as the world build does;
// 3. the kit's re-skin switch and the recipes' building tint are gone (cutover, not a fallback);
// 4. negative control: a pack whose structure draw wears a Garage-made material fails check 1;
// 5. the surface cache paints each map once;
// 6. the map's set pieces stand on the horizon at their true bearing with their angular size kept;
// 7. a horizon piece is part for part the piece the world's composer merges.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import { BUILDING_STYLES } from '../world/maps/buildingStyleTable.ts';
import { createGarageArchitectureController } from './garageArchitecture.ts';
import { getMapConfig } from '../world/maps/index.ts';
import { getGarageTerrainPatch } from './garageTerrainPatches.generated.ts';
import { buildLandmarkPiece, composeLandmarks } from '../world/landmarks/compose.ts';
import { LANDMARK_BUILDERS } from '../world/landmarks/index.ts';
import { resolveLandmarkParams } from '../world/landmarks/plan.ts';
import { resolveRegionalArchitecture } from '../world/maps/regional/index.ts';

const kitSource = await readFile(new URL('./garageEnvironmentKit.ts', import.meta.url), 'utf8');
const recipeSource = await readFile(new URL('./garageEnvironmentRecipes.ts', import.meta.url), 'utf8');
assert.doesNotMatch(kitSource, /materialForBucket|BUCKET_KEYS/, 'the Garage re-skin switch stays deleted');
assert.doesNotMatch(recipeSource, /buildingTint/, 'no Garage tint stands over a battlefield building');
assert.match(kitSource, /structureSurfaces\.surfaces\.mats\[key\]/, 'structure buckets draw their battlefield material');

/** The structure draws that do not wear their bucket's battlefield material. */
function reskinned(root) {
  const wrong = [];
  root.traverse((object) => {
    if (!object.isMesh || !object.name.startsWith('authored_structures_')) return;
    const key = object.name.slice('authored_structures_'.length);
    if (key === 'route') return;
    const material = object.material;
    const program = typeof material.customProgramCacheKey === 'function' ? material.customProgramCacheKey() : '';
    if (material.userData?.propsKind !== key || !program.startsWith('world-props-')) wrong.push(`${key} (${material.name || material.type})`);
  });
  return wrong;
}

const scene = new THREE.Group();
const controller = createGarageArchitectureController({}, scene, () => {}, () => import('./garageEnvironmentKit.ts'));
const outdoor = GARAGE_VARIANTS.filter((variant) => variant.architecture !== 'field_shed');
const rows = [], horizonRows = [];
for (const variant of outdoor) {
  controller.setVariant(variant);
  const stats = await controller.whenReady();
  const root = scene.getObjectByName(`garage_environment_${variant.architecture}`);
  assert.ok(root, `${variant.id}: its pack is in the scene`);
  const draws = [];
  root.traverse((object) => { if (object.isMesh && object.name.startsWith('authored_structures_')) draws.push(object.name.slice(20)); });
  assert.ok(draws.length >= 4, `${variant.id}: its structures merge into their buckets' draws`);
  assert.deepEqual(reskinned(root), [], `${variant.id}: every structure draw wears its battlefield material`);
  // (2) the map's kit rebuilds its buildings (the census on main: 4 to 9 of each pack's 9)
  assert.ok(BUILDING_STYLES[variant.mapId]?.kit, `${variant.id}: ${variant.mapId} has a regional kit`);
  assert.ok(stats.regionalKitStructures >= 4,
    `${variant.id}: ${stats.regionalKitStructures} of ${stats.structures} structures rebuilt by the ${BUILDING_STYLES[variant.mapId].kit} kit`);
  assert.ok(draws.some((key) => key.startsWith('regional')), `${variant.id}: the kit's weathered buckets draw`);
  rows.push(`${variant.mapId} ${stats.regionalKitStructures}/${stats.structures}`);
  // (6) the map's set pieces stand on the horizon ring at their true bearing, their angular size kept
  const authored = (getMapConfig(variant.mapId).props?.landmarks ?? []);
  const [ax, az] = getGarageTerrainPatch(variant.mapId).sourceAnchor;
  for (const piece of stats.horizonSetPieces) {
    const source = authored.find((p) => p.kind === piece.kind && Math.round(Math.hypot(p.x - ax, p.z - az)) === piece.distM);
    assert.ok(source, `${variant.id}: ${piece.kind} is one of the map's own set pieces`);
    const bearing = (Math.atan2(source.x - ax, source.z - az) * 180 / Math.PI + 360) % 360;
    assert.ok(Math.abs(((bearing - piece.bearingDeg + 540) % 360) - 180) < 0.1, `${variant.id}: ${piece.kind} keeps its bearing`);
    assert.ok(Math.abs(piece.scale - piece.ringM / piece.distM) < 0.002, `${variant.id}: ${piece.kind} keeps its angular size`);
    assert.ok(piece.ringM >= 58 && piece.ringM <= 116 && piece.triangles > 0, `${variant.id}: ${piece.kind} stands on the ring`);
  }
  horizonRows.push(`${variant.mapId} ${stats.horizonSetPieces.length}`);

  // (4) negative control, on this pack: a Garage-made material on one structure draw is caught
  if (variant === outdoor[0]) {
    let swapped = null;
    root.traverse((object) => {
      if (!swapped && object.isMesh && object.name === 'authored_structures_dark') {
        swapped = { mesh: object, material: object.material };
        object.material = new THREE.MeshStandardMaterial({ color: 0x55595a, roughness: 0.68, metalness: 0.30 });
      }
    });
    assert.ok(swapped, `${variant.id}: the control finds the dark bucket`);
    assert.deepEqual(reskinned(root), ['dark (MeshStandardMaterial)'], 'the control: a re-skinned draw is caught');
    swapped.mesh.material.dispose();
    swapped.mesh.material = swapped.material;
  }
}
controller.dispose?.();

// (7) a horizon piece is the composer's own: buildLandmarkPiece's parts are the parts composeLandmarks merges (flat ground)
{
  const placement = getMapConfig('urban').props.landmarks.find((p) => p.kind === 'townGate');
  const site = { mapId: 'urban', seed: 2002, tier: 'desktop', snowCap: false, architecture: resolveRegionalArchitecture(BUILDING_STYLES.urban.kit) };
  const hashOf = (parts) => Object.entries(parts).flatMap(([key, list]) => (list ?? []).map((g) => `${key}:${g.getAttribute('position').count}:`
    + Array.from(g.getAttribute('position').array.slice(0, 24)).map((v) => v.toFixed(4)).join(',')
    + ':' + (g.getAttribute('color') ? Array.from(g.getAttribute('color').array.slice(0, 12)).map((v) => v.toFixed(4)).join(',') : '-'))).join('|');
  const own = buildLandmarkPiece({ ...site, groundFall: 0, groundAt: () => 0, waterAt: () => 0 }, placement, resolveLandmarkParams(placement),
    LANDMARK_BUILDERS[placement.kind]);
  let merged = null;
  const flat = { getHeightAt: () => 0, getWaterMaskAt: () => 0, getWaterDepthAt: () => 0, _roadDist: () => 50, _noVeg: () => false,
    getNormalAt: () => ({ x: 0, y: 1, z: 0 }) };
  const it = composeLandmarks({ ...site, landmarks: [{ ...placement }], heightField: flat, spawns: [{ x: -2000, z: -2000 }, { x: 2000, z: 2000 }],
    obstacles: [], colliders: [], reserve() {}, publish() {}, veto() {}, addDestructible() {}, merge: (parts) => { merged ??= parts; } });
  let step = it.next(); while (!step.done) step = it.next();
  assert.ok(merged, 'the composer places the gate');
  assert.equal(hashOf(own.parts), hashOf(merged), 'the horizon gate is the composer\'s gate, part for part');
}

// (5) the surface cache paints a map once: a prepare that stops part-way leaves its build where it stood, the next one
// resumes it, a later one takes the painted set as it is; unheld maps past two are disposed
const adapter = await import('./garageBattleStructures.ts');
const fresh = adapter.resolveGarageMapStructures('steppe');
let slices = 0;
const stopped = await adapter.prepareGarageStructureSurfaces(fresh, 4, () => (slices += 1) < 2);
assert.equal(stopped, null, 'a prepare nobody wants any more stops');
assert.deepEqual(adapter.garageStructureSurfaceCache().find((entry) => entry.mapId === 'steppe'),
  { mapId: 'steppe', painted: false, holds: 0 }, 'and its build waits in the cache, half painted');
const resumed = await adapter.prepareGarageStructureSurfaces(fresh, 4, () => true);
const again = await adapter.prepareGarageStructureSurfaces(fresh, 4, () => true);
assert.ok(resumed && again === resumed, 'the next prepare resumes it; a later one takes the same painted set');
assert.equal(adapter.garageStructureSurfaceCache().find((entry) => entry.mapId === 'steppe')?.holds, 2);
adapter.releaseGarageStructureSurfaces(resumed);
adapter.releaseGarageStructureSurfaces(again);
assert.ok(adapter.garageStructureSurfaceCache().filter((entry) => entry.holds === 0).length <= 2,
  'no more than two unheld maps stay painted');
console.log(`garageBattleStructures.selftest: ${outdoor.length} packs wear their battlefield materials and kits `
  + `(${rows.join(', ')}); the re-skin is gone; a re-skinned draw is caught; a map is painted once (a stopped prepare resumes); set pieces on the horizon (${horizonRows.join(', ')}), the composer's own PASS`);
process.exit(0);
