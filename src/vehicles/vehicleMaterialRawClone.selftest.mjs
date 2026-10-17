// vehicleMaterialRawClone.selftest.mjs — no new raw Material.clone() of a vehicle material (2026-10-17, the wheel-band
// lane; the owner: "in garage, on all tanks, i can see this weird shadow on wheels, no matter what garage i switch
// through").
//
// three's MeshStandardMaterial.copy resets `defines` to { STANDARD } and Material.copy keeps neither onBeforeCompile nor
// customProgramCacheKey, so a raw clone of a vehicle material leaves the cascade registration: it lights with all four
// cascade suns unshadowed and writes neither the sun state nor the vehicle tag the aerial pass reads. The Garage's
// dormant energy skin (juggernautVisual.ts) made such clones of every pedestal tank's paint, and the ground occlusion
// (vehicleGroundOcclusion.ts) then took the untagged road wheels for ground under the hull: a dark band under the belly
// line on every wheel. A vehicle material is cloned through materials.ts cloneVehicleMaterial; this receipt keeps the
// raw clones to the reviewed list below. Source text only: comments are ignored, nothing is built.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** A clone whose receiver is named as a material (material, mat, source, original, …Material, …Mat). */
const MATERIAL_CLONE = /\b[A-Za-z_$]*(?:[Mm]aterial|[Mm]at|[Ss]ource|[Oo]riginal)\.clone\(\)/g;
/** A clone of a tank material set's member (P.mats.hull, mats.wheels, …): always a registered vehicle material. */
const SET_CLONE = /\bmats\.[A-Za-z_$]+\.clone\(\)/g;

/** Where vehicle materials are swapped or cloned at run time: a material-named raw clone needs a reviewed reason. */
const RUNTIME_DIRS = ['src/app', 'src/engine', 'src/fx', 'src/game', 'src/mp', 'src/ui', 'src/vehicles'];
const RUNTIME_ALLOWED = new Map([
  ['src/vehicles/materials.ts', [1, 'cloneVehicleMaterial itself: the clone joins its source\'s registration']],
  ['src/vehicles/battleGeometrySharing.ts', [1, 'a BufferGeometry (source.clone of a geometry), no material']],
  ['src/engine/thermalVehicles.ts', [2, 'the thermal view\'s emissive, unlit stand-ins (raw on purpose; their ground-AO read is a separate check)']],
  ['src/engine/shadowDepthKinds.ts', [1, 'plain depth/distance materials without hooks']],
  ['src/fx/structureDebris.ts', [1, 'map structure debris, not a vehicle material']],
  ['src/game/garageDressing.ts', [1, 'the Garage set dressing (a battle screen), not a vehicle material']],
  ['src/game/garageDressingOptimization.ts', [1, 'the Garage set dressing bake, not a vehicle material']],
  ['src/ui/garageEnvironmentKit.ts', [1, 'a BufferGeometry (source.clone of a geometry), no material']],
]);
/**
 * A set member's raw clone (P.mats.X.clone()). The profiles' sites predate cloneVehicleMaterial and sit in hash-pinned
 * sources: they re-hook the bare readability hook without the cascade (their pixels carry no vehicle tag; the
 * KF51's and the T-90M Proryv's wheel dishes among them) and wait for their own reviewed pass. The count may only fall.
 */
const SET_CLONE_BASELINE = new Map([
  ['src/vehicles/profiles/abrams.ts', 3],
  ['src/vehicles/profiles/challenger.ts', 3],
  ['src/vehicles/profiles/leopard.ts', 21],
  ['src/vehicles/profiles/merkava.ts', 1],
  ['src/vehicles/profiles/patton.ts', 10],
  ['src/vehicles/profiles/shtora.ts', 1],
  ['src/vehicles/profiles/soviet-heavy.ts', 3],
  ['src/vehicles/profiles/t90.ts', 2],
  ['src/vehicles/profiles/uk.ts', 2],
  ['src/vehicles/profiles/ukraine.ts', 1],
  ['src/world/props.ts', 1], // the map vehicles' own set (props.ts), not a tank's
]);

function* sourceFiles(dir) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    const stat = statSync(join(ROOT, rel));
    if (stat.isDirectory()) yield* sourceFiles(rel);
    else if (/\.ts$/.test(name) && !/\.d\.ts$/.test(name)) yield rel;
  }
}

/** Source text without comments (line comments, block comments), so prose about Material.clone() is not counted. */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n').map((line) => line.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');
}

function hits(rel, pattern) {
  const text = code(readFileSync(join(ROOT, rel), 'utf8'));
  const found = [];
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(pattern)) found.push(`${rel}:${i + 1}: ${m[0]}`);
  });
  return found;
}

// --- run-time modules: a material-named raw clone is reviewed or it fails
const runtime = new Map();
for (const dir of RUNTIME_DIRS) {
  for (const rel of sourceFiles(dir)) {
    if (rel.startsWith('src/vehicles/profiles/')) continue; // the set-member ratchet below
    const found = hits(rel, MATERIAL_CLONE);
    if (found.length) runtime.set(rel, found);
  }
}
for (const [rel, found] of runtime) {
  const allowed = RUNTIME_ALLOWED.get(rel);
  assert.ok(allowed, `raw Material.clone() of a vehicle material: clone it with materials.ts cloneVehicleMaterial `
    + `(or list the file here with its reason):\n  ${found.join('\n  ')}`);
  assert.ok(found.length <= allowed[0], `${rel}: ${found.length} raw clones, ${allowed[0]} reviewed (${allowed[1]}):\n  ${found.join('\n  ')}`);
}
assert.equal(hits('src/game/juggernautVisual.ts', MATERIAL_CLONE).length, 0, 'the energy skin clones through cloneVehicleMaterial');
assert.ok(readFileSync(join(ROOT, 'src/game/juggernautVisual.ts'), 'utf8').includes('cloneVehicleMaterial('),
  'the energy skin clones through cloneVehicleMaterial');

// --- set members: the profiles' raw clones may only fall
const setHits = new Map();
for (const dir of ['src/vehicles', 'src/world', 'src/game', 'src/engine', 'src/fx', 'src/ui', 'src/app']) {
  for (const rel of sourceFiles(dir)) {
    const found = hits(rel, SET_CLONE);
    if (found.length) setHits.set(rel, found);
  }
}
for (const [rel, found] of setHits) {
  const baseline = SET_CLONE_BASELINE.get(rel) ?? 0;
  assert.ok(found.length <= baseline, `${relative(ROOT, join(ROOT, rel))}: a new raw clone of a tank material set's member `
    + `(${found.length} > ${baseline}); clone it with cloneVehicleMaterial:\n  ${found.join('\n  ')}`);
}
const setTotal = [...setHits.values()].reduce((n, f) => n + f.length, 0);
console.log(`vehicleMaterialRawClone.selftest: ${runtime.size} run-time files with reviewed raw clones, `
  + `${setTotal} legacy set-member clones (baseline ${[...SET_CLONE_BASELINE.values()].reduce((a, b) => a + b, 0)}) PASS`);
