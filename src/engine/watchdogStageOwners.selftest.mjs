import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

// 2026-11-02 audit R4 (device rescue): the watchdog ladder holds scene.environment, scene.fog and the shadow switch off
// across up to 30 s of awaits and reverted by compare-and-swap on the value (null / false), which cannot tell its own
// null from a newer owner's: a sky re-bake that validated invalid also leaves null, and the revert wrote back the
// pre-ladder texture its cache had released. Now every writer counts its write (fieldWrites.ts) and a stage reverts only
// while the field still holds its own write; a retired texture is never installed again.

globalThis.window ??= globalThis;
window.__GL_DIAG ??= { errors: [] };
const { createWatchdogStages } = await import('./deviceDiag.ts');
const { noteFieldWrite, noteTextureRetired } = await import('./fieldWrites.ts');

function fixture() {
  const scene = new THREE.Scene();
  const environment = new THREE.Texture();
  const fog = new THREE.Fog(0xffffff, 1, 100);
  scene.environment = environment;
  scene.fog = fog;
  const renderer = { shadowMap: { enabled: true } };
  const stages = Object.fromEntries(createWatchdogStages(renderer, scene).map((stage) => [stage.label, stage]));
  return { scene, environment, fog, renderer, stages };
}

{
  // the stage's own write, untouched: the revert gives the pre-ladder state back
  const f = fixture();
  for (const stage of Object.values(f.stages)) stage.apply();
  assert.equal(f.scene.environment, null);
  for (const stage of Object.values(f.stages)) stage.revert();
  assert.equal(f.scene.environment, f.environment);
  assert.equal(f.scene.fog, f.fog);
  assert.equal(f.renderer.shadowMap.enabled, true);
}

{
  // a newer owner writes the same null / false during the ladder's awaits: its write stands
  const f = fixture();
  for (const stage of Object.values(f.stages)) stage.apply();
  // a sky re-bake: a new texture installed, validated invalid, nulled (skyEnvironmentCache + enforceEnvValidity)
  f.scene.environment = new THREE.Texture(); noteFieldWrite(f.scene, 'environment');
  f.scene.environment = null; noteFieldWrite(f.scene, 'environment');
  f.scene.fog = null; noteFieldWrite(f.scene, 'fog');
  f.renderer.shadowMap.enabled = false; noteFieldWrite(f.renderer.shadowMap, 'enabled'); // applyDiagRescue / reclaim
  for (const stage of Object.values(f.stages)) stage.revert();
  assert.equal(f.scene.environment, null, 'the newer owner\'s null stands (no stale texture written back)');
  assert.equal(f.scene.fog, null);
  assert.equal(f.renderer.shadowMap.enabled, false, 'the newer shadow verdict stands');
}

{
  // the pre-ladder texture was released by its cache meanwhile: never installed again
  const f = fixture();
  f.stages['environment-off'].apply();
  noteTextureRetired(f.environment);
  f.stages['environment-off'].revert();
  assert.equal(f.scene.environment, null);
}

{
  // the production writers count their writes
  const cache = readFileSync(new URL('./skyEnvironmentCache.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(cache, /this\.scene\.environment = /, 'the sky cache writes the environment only through setEnvironment');
  assert.match(cache, /function setEnvironment\(scene: THREE\.Scene, texture: THREE\.Texture \| null\): void \{\s*scene\.environment = texture;\s*noteFieldWrite\(scene, 'environment'\);/);
  assert.equal(cache.match(/noteTextureRetired\(/g)?.length, 2, 'both release paths retire the texture');
  const diag = readFileSync(new URL('./deviceDiag.ts', import.meta.url), 'utf8');
  const validity = diag.slice(diag.indexOf('export function enforceEnvValidity('), diag.indexOf('if (!_envCompLight) {'));
  assert.match(validity, /scene\.environment = null;\s*noteFieldWrite\(scene, 'environment'\);/);
  const reclaim = diag.slice(diag.indexOf('export function reclaimShadows('), diag.indexOf('export function runSceneBlackWatchdog('));
  assert.equal(reclaim.match(/renderer\.shadowMap\.enabled = (?:true|false);\s*noteFieldWrite\(renderer\.shadowMap, 'enabled'\);/g)?.length, 3);
}

console.log('watchdogStageOwners selftest: the rescue ladder reverts only its own writes; a newer owner\'s null stands');
