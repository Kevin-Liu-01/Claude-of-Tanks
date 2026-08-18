import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./t72.js', import.meta.url), 'utf8');
const afvSource = readFileSync(new URL('./afvFamily.js', import.meta.url), 'utf8');
const bmptBuild = afvSource.match(/function buildBMPT2\(P\) \{[\s\S]*?\n\}/)?.[0] || '';

assert.match(source,
  /coverWithVehicleCamo\(P\.mats\.detail, P\.mats\.hull, 'fittings'\)/,
  'T-72B3M fitting paint is sampled from the active camouflage');
assert.match(source,
  /coverWithVehicleCamo\(P\.mats\.canvasCloth, P\.mats\.hull, 'painted-canvas'\)/,
  'T-72B3M painted canvas is sampled from the active camouflage');
assert.match(source,
  /coverWithVehicleCamo\(ob\.material, P\.mats\.hull, 'relikt-cassette'\)/,
  'painted Relikt cassettes are sampled from the active camouflage');
assert.match(source,
  /coverWithVehicleCamo\(ob\.material, P\.mats\.hull, 'deck-panel'\)/,
  'painted deck panels are sampled from the active camouflage');
assert.match(bmptBuild, /T72_PROFILES\.t72b3m\.build\(P\);/,
  'BMPT Terminator 2 inherits the T-72B3M camouflage-coverage pass');
assert.doesNotMatch(bmptBuild, /P\.mats\.(?:detail|canvasCloth)\.color\.setHex/,
  'BMPT Terminator 2 does not tint inherited camouflage back into flat paint');

console.log('t72CamoCoverage.selftest: T-72B3M/BMPT flat fallback paint is camouflaged');
