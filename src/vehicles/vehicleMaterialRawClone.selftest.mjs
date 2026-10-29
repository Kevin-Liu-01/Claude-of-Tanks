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
// Round 2 (2026-10-17): the profiles' own hand re-hooked clones went the same way (cloneRehookedVehicleMaterial,
// cloneFloorlessVehicleMaterial: the Patton's camouflaged road wheels, the KF51's tyres, the T-90's dark wheels banded
// under the belly line in the Garage and in battle), and so did the profiles' hooks that replaced a registered material's
// hook outright (chainVehicleMaterialHook). The set-member clones are now none, a bare hand re-hook or an emptied hook is
// banned outside materials.ts, and a profile assigns a compile hook only as a reviewed chain over the hook it replaces.
// The built fleet itself is held to the registration by tools/vehicle-material-registration.mjs and
// vehicleMaterialRegistration.selftest.mjs.
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
  // copyVehicleMaterial (6b2bbed99e, cloneTankVisual; reviewed 2026-10-24, transitions-249): it restores every define,
  // joins its source's registration family, keeps the chain and the program key, and refuses a burnt source, a twin and an
  // unregistered cascade material (vehicleMaterialClone.selftest.mjs exercises it on real hulls)
  ['src/vehicles/materials.ts', [3, 'cloneVehicleMaterial, cloneRehookedVehicleMaterial and copyVehicleMaterial: the clone joins its source\'s registration']],
  ['src/vehicles/battleGeometrySharing.ts', [1, 'a BufferGeometry (source.clone of a geometry), no material']],
  ['src/engine/thermalVehicles.ts', [2, 'the thermal view\'s emissive heat stand-ins (raw on purpose: no cascades; they write the vehicle alpha through tagUnlitVehiclePixels, round 3)']],
  ['src/engine/shadowDepthKinds.ts', [1, 'plain depth/distance materials without hooks']],
  ['src/fx/structureDebris.ts', [1, 'map structure debris, not a vehicle material']],
  ['src/game/garageDressing.ts', [1, 'the Garage set dressing (a battle screen), not a vehicle material']],
  ['src/game/garageDressingOptimization.ts', [1, 'the Garage set dressing bake, not a vehicle material']],
  ['src/ui/garageEnvironmentKit.ts', [1, 'a BufferGeometry (source.clone of a geometry), no material']],
  ['src/vehicles/turretSeatRace.ts', [1, 'a BufferGeometry (the seated fitting\'s own copy of mesh.geometry), no material']],
  ['src/vehicles/vehicleGraphClone.ts', [2, 'a BufferGeometry and an InstancedBufferAttribute (a cloned visual\'s own buffers), no material: its materials go through copyVehicleMaterial']],
]);
/**
 * A set member's raw clone (P.mats.X.clone()): none on a tank. The profiles' 48 hand re-hooked clones moved to
 * cloneRehookedVehicleMaterial / cloneFloorlessVehicleMaterial in round 2 (2026-10-17).
 */
const SET_CLONE_BASELINE = new Map([
  ['src/world/props.ts', 1], // the map vehicles' own set (props.ts), not a tank's
]);
/** A hand re-hook (the bare readability hook assigned to a material) or an emptied hook: the registration's to give. */
const BARE_HOOK = /\.onBeforeCompile\s*=\s*(?:vehicleAmbientFloorHook\b|\(\s*\)\s*=>\s*\{\s*\})/g;
// none (round 3, 2026-10-18): the unregistered fallbacks of cloneRehookedVehicleMaterial and rehookVehicleMaterial
// register too (registerVehicleMaterial without a cascade context)
const BARE_HOOK_ALLOWED = new Map();
/** A profile's compile hook: each is a reviewed chain that calls the hook it replaces (chainVehicleMaterialHook's shape). */
const PROFILE_HOOK = /\.onBeforeCompile\s*=/g;
const PROFILE_HOOK_CHAINS = new Map([
  // (263: vickers-cr1-262 31d83cdcdb took the Challenger lift's compile hook out of challenger.ts with the Mk 1/Mk 2's
  // move to the Mk 3's build; no profile chains one there now)
  ['src/vehicles/profiles/merkava.ts', 1], // roofLift, over `prev`
  ['src/vehicles/profiles/uk.ts', 1], // inkLift, over `prev`
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

// --- hand re-hooks and emptied hooks: the vehicle registration's alone
for (const dir of RUNTIME_DIRS) {
  for (const rel of sourceFiles(dir)) {
    const found = hits(rel, BARE_HOOK);
    if (!found.length) continue;
    const allowed = BARE_HOOK_ALLOWED.get(rel);
    assert.ok(allowed && found.length <= allowed[0], `a hand re-hook or an emptied compile hook drops the vehicle registration `
      + `(the cascade, the sun state and the vehicle tag): use cloneRehookedVehicleMaterial, cloneFloorlessVehicleMaterial, `
      + `rehookVehicleMaterial or setVehicleMaterialFloorless (materials.ts):\n  ${found.join('\n  ')}`);
  }
}
// --- profiles: a compile hook is a reviewed chain over the one it replaces
for (const rel of sourceFiles('src/vehicles/profiles')) {
  const found = hits(rel, PROFILE_HOOK);
  const allowed = PROFILE_HOOK_CHAINS.get(rel) ?? 0;
  assert.ok(found.length <= allowed, `${rel}: ${found.length} compile hook assignment(s), ${allowed} reviewed chain(s); chain `
    + `a profile's shader patch with chainVehicleMaterialHook (materials.ts), which keeps the registration under it:\n  ${found.join('\n  ')}`);
}
for (const [rel, allowed] of PROFILE_HOOK_CHAINS) {
  const text = code(readFileSync(join(ROOT, rel), 'utf8'));
  assert.ok(/\bprev\s*\(|\bprev\.call\s*\(/.test(text) && hits(rel, PROFILE_HOOK).length === allowed,
    `${rel}: its reviewed hook chain calls the hook it replaces (prev); update PROFILE_HOOK_CHAINS when it moves`);
}
const setTotal = [...setHits.values()].reduce((n, f) => n + f.length, 0);
console.log(`vehicleMaterialRawClone.selftest: ${runtime.size} run-time files with reviewed raw clones, `
  + `${setTotal} set-member clone(s) outside the tanks, no hand re-hooks, ${PROFILE_HOOK_CHAINS.size} reviewed profile hook chains PASS`);
