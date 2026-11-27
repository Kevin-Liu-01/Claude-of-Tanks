// vehicleMaterialRegistrationPath.selftest (battle-retention-279): a vehicle material reaches the shadow rig one way,
// materials.ts vehicleMaterialSetup (createTankMaterials' families, registerVehicleMaterial), which records it in
// VEHICLE_REGISTRATION. The wreck's turret-ring well called engineCtx.setupShadowMaterial itself: its entries sat in the
// CSM registry outside that record, so the Garage-return probe's ledger (registry v3) could not tell them from a world's.
// A census over src/vehicles/**/*.ts: no direct setupShadowMaterial call but vehicleMaterialSetup's and the two context
// probes (a throwaway material registered and released in the same function, to read USE_CSM). Controls: a planted
// direct call, and the turret-ring well as it was, are found. And the ring material registered on a real context is a
// registered vehicle material, released by releaseVehicleMaterial.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isVehicleMaterialRegistered, releaseVehicleMaterial } from './materials.ts';
import { createTurretRingWellMaterial } from './turretRingWell.ts';

const DIRECT = /\.setupShadowMaterial\s*\(/;
// [file, the call's line (trimmed), why it may]
const ALLOWED = [
  ['src/vehicles/materials.ts', "if (cascaded && typeof engineCtx?.setupShadowMaterial === 'function') engineCtx.setupShadowMaterial(material, hook);",
    'vehicleMaterialSetup: the one registration'],
  ['src/vehicles/materials.ts', 'engineCtx.setupShadowMaterial(probe);', 'supportsShadowHook: a throwaway probe, released at once'],
  ['src/vehicles/decorations.ts', 'engineCtx.setupShadowMaterial(probe);', 'isRealShadowCtx: a throwaway probe, released at once'],
];
function directCalls(path, text) {
  const out = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('//') || line.startsWith('*') || !DIRECT.test(line)) continue;
    if (ALLOWED.some(([file, allowed]) => file === path && allowed === line)) continue;
    out.push(`${path}: ${line.slice(0, 140)}`);
  }
  return out;
}
const root = fileURLToPath(new URL('../..', import.meta.url));
const sources = readdirSync(join(root, 'src/vehicles'), { recursive: true }).map(String)
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts')).map((file) => `src/vehicles/${file.split('\\').join('/')}`);
assert.ok(sources.includes('src/vehicles/turretRingWell.ts') && sources.length > 100, `census: src/vehicles listed (${sources.length} files)`);
const texts = new Map(sources.map((path) => [path, readFileSync(join(root, path), 'utf8')]));
assert.deepEqual(sources.flatMap((path) => directCalls(path, texts.get(path))), [],
  'census: no vehicle material reaches the shadow rig but through vehicleMaterialSetup');
for (const [file, line, why] of ALLOWED) {
  assert.ok(texts.get(file)?.split('\n').some((raw) => raw.trim() === line), `census: the allowed call is still there (${why})`);
}
// controls: a planted direct call, and the ring well's own registration as it was before this lane
assert.equal(directCalls('src/vehicles/planted.ts', '  engineCtx.setupShadowMaterial(material, hook);').length, 1, 'census control: a planted direct call is found');
assert.equal(directCalls('src/vehicles/turretRingWell.ts', '    engineCtx.setupShadowMaterial(material, hook);').length, 1,
  'census control: the turret-ring well as it registered before is found');

// the ring material on a context that takes the cascade (USE_CSM stamped): registered as a vehicle material, released
const registry = new Set();
const ctx = {
  setupShadowMaterial(material, hook) { material.defines = { ...material.defines, USE_CSM: 1 }; registry.add(material); if (hook) material.onBeforeCompile = hook; return material; },
  releaseShadowMaterial(material) { return registry.delete(material); },
};
const ring = createTurretRingWellMaterial(ctx);
assert.ok(registry.has(ring), 'the ring material is in the shadow rig');
assert.equal(isVehicleMaterialRegistered(ring), true, 'and recorded as a vehicle material (VEHICLE_REGISTRATION)');
assert.equal(ring.customProgramCacheKey(), createTurretRingWellMaterial(null).customProgramCacheKey(), 'one program for the fleet, on a stub too');
releaseVehicleMaterial(ring);
assert.equal(registry.has(ring), false, 'releaseVehicleMaterial takes it out of the shadow rig');
assert.equal(isVehicleMaterialRegistered(ring), false, 'and out of the record');

console.log(`vehicleMaterialRegistrationPath.selftest: every vehicle material reaches the shadow rig through vehicleMaterialSetup (${sources.length} files; the turret-ring well registered and released as one)`);
