/** Plain-node coverage for the shared UI and equipment vector icon sets. */

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import './contextInfo.selftest.mjs';
import './garageDossier.selftest.mjs';
import { EQUIPMENT_CATALOG } from '../game/equipment.ts';
import { equipIconIds, equipIconSVG } from './equipIcons.ts';
import { uiIconIds, uiIconSVG } from './uiIcons.ts';
import { shellIconSVG, shellIconTypes } from './shellIcons.ts';
import {
  TANK_PORTRAIT_FRAME_POLICY,
  auditPortraitPixels,
  containedPortraitPlacement,
  directPortraitPlacement,
  measurePortraitCoreBounds,
} from './portraitFraming.ts';

const equipIds = new Set(equipIconIds());
const largeEquipmentIcons = new Set();
for (const item of EQUIPMENT_CATALOG) {
  const svg = equipIconSVG(item.id, 38);
  if (!equipIds.has(item.id) || !svg.includes('</svg>')) {
    throw new Error(`missing equipment icon: ${item.id}`);
  }
  assert.match(svg, new RegExp(`data-equipment-icon="${item.id}"`),
    `${item.id} icon must expose its deterministic visual identity`);
  const iconCategory = item.cat === 'fire' ? 'firepower' : item.cat;
  assert.match(svg, new RegExp(`data-icon-category="${iconCategory}"`),
    `${item.id} icon must carry the correct category cue`);
  largeEquipmentIcons.add(svg);
}
assert.equal(largeEquipmentIcons.size, EQUIPMENT_CATALOG.length,
  'every equipment item must keep a distinct rendered icon');

for (const id of uiIconIds()) {
  const svg = uiIconSVG(id, 24);
  if (!svg.startsWith('<svg') || !svg.endsWith('</svg>')) {
    throw new Error(`invalid UI icon: ${id}`);
  }
}

for (const id of ['battleBots', 'battlePrivate', 'battleLan', 'battleRanked', 'battleRecord']) {
  if (!uiIconIds().includes(id)) throw new Error(`missing garage battle icon: ${id}`);
}

for (const id of ['damage', 'penetration', 'team', 'check', 'clock', 'rematch', 'map']) {
  if (!uiIconIds().includes(id)) throw new Error(`missing debrief icon: ${id}`);
}

for (const id of ['globe', 'eraInterwar', 'eraWorldWarII', 'eraColdWar', 'eraModern', 'eraNextGeneration']) {
  if (!uiIconIds().includes(id)) throw new Error(`missing gallery filter icon: ${id}`);
}

for (const id of ['sound', 'soundOff', 'graphics', 'settings', 'lightbulb']) {
  if (!uiIconIds().includes(id)) throw new Error(`missing mobile HUD icon: ${id}`);
}

for (const id of [
  'moveForward', 'moveBack', 'steerLeft', 'steerRight', 'handbrake',
  'fireGun', 'reload', 'freeLook', 'zoomIn', 'zoomOut', 'mouse',
  'aimSmoothing', 'invertAim', 'controller', 'performance', 'telemetry',
  'armorFlashlight', 'ambience', 'music', 'heartbeat',
]) {
  if (!uiIconIds().includes(id)) throw new Error(`missing settings icon: ${id}`);
}

if (!uiIconIds().includes('github')) throw new Error('missing garage GitHub icon');

for (const [id, asset] of [
  ['garage', '/brand/nav/garage.svg'],
  ['home', '/brand/nav/home.svg'],
  ['gallery', '/brand/nav/tank-gallery.svg'],
  ['studio', '/brand/nav/studio.svg'],
]) {
  if (!uiIconSVG(id, 24).includes(asset)) throw new Error(`${id} must use the shared product mark`);
}

const garageMark = await readFile(new URL('../../public/brand/nav/garage.svg', import.meta.url), 'utf8');
if (!garageMark.includes('data-vehicle="leclerc"') || garageMark.includes('<image')) {
  throw new Error('garage mark must draw the Leclerc silhouette as native vector geometry');
}
if (!garageMark.includes('garage-turret') || !garageMark.includes('garage-hull')) {
  throw new Error('garage mark must show the hoist separating the turret from the hull');
}
if ((garageMark.match(/data-separation="turret-ring"/g) || []).length !== 2) {
  throw new Error('garage mark must split both masks at the turret ring');
}

const homeMark = await readFile(new URL('../../public/brand/nav/home.svg', import.meta.url), 'utf8');
if (!homeMark.includes('data-vehicle="m1a2"') || homeMark.includes('<image')) {
  throw new Error('home mark must draw the M1A2 silhouette as native vector geometry');
}
if (!homeMark.includes('home-bay')) throw new Error('home mark must frame the tank inside the garage bay');

const galleryMark = await readFile(new URL('../../public/brand/nav/tank-gallery.svg', import.meta.url), 'utf8');
for (const vehicle of ['strv103a', 't90m', 'm1a2']) {
  if (!galleryMark.includes(`data-vehicle="${vehicle}"`)) {
    throw new Error(`tank gallery mark must include the ${vehicle} silhouette`);
  }
}
if (galleryMark.includes('<image') || galleryMark.includes('data:image/')) {
  throw new Error('tank gallery silhouettes must remain native vector geometry');
}

const studioMark = await readFile(new URL('../../public/brand/nav/studio.svg', import.meta.url), 'utf8');
if (!studioMark.includes('data-vehicle="leclerc"') || studioMark.includes('<image')) {
  throw new Error('scene studio mark must draw the Leclerc silhouette as native vector geometry');
}
if (!studioMark.includes('studio-turret') || !studioMark.includes('studio-hull')) {
  throw new Error('scene studio mark must separate the turret from the hull');
}
if ((studioMark.match(/data-separation="turret-ring"/g) || []).length !== 2) {
  throw new Error('scene studio mark must split both masks at the turret ring');
}

const tankThumbs = await readFile(new URL('./tankThumbs.ts', import.meta.url), 'utf8');
if (!tankThumbs.includes('await ensureTankBuilder(id)')) {
  throw new Error('top-down mask fallback must join the exact fleet demand-load before createTank');
}
for (const contract of [
  "from './portraitFraming.ts'",
  'measurePortraitCoreBounds',
  'containedPortraitPlacement',
  '--cot-thumb-scale',
  "cotPortraitFramed = 'true'",
]) {
  if (!tankThumbs.includes(contract)) {
    throw new Error(`garage portrait framing is missing ${contract}`);
  }
}

assert.deepEqual(
  {
    widthRatio: TANK_PORTRAIT_FRAME_POLICY.widthRatio,
    heightRatio: TANK_PORTRAIT_FRAME_POLICY.heightRatio,
    baselineRatio: TANK_PORTRAIT_FRAME_POLICY.baselineRatio,
  },
  { widthRatio: 0.54, heightRatio: 0.68, baselineRatio: 0.88 },
  'one exported policy owns portrait width, height, and track baseline',
);

const syntheticWidth = 100;
const syntheticHeight = 100;
const syntheticPixels = new Uint8ClampedArray(syntheticWidth * syntheticHeight * 4);
const paintAlpha = (x0, y0, x1, y1, alpha = 255) => {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) syntheticPixels[(y * syntheticWidth + x) * 4 + 3] = alpha;
  }
};
paintAlpha(20, 48, 79, 87); // dense hull and running gear on the shared baseline
paintAlpha(49, 13, 50, 47); // sparse antenna
paintAlpha(80, 58, 99, 59); // sparse barrel
const syntheticCore = measurePortraitCoreBounds(syntheticPixels, syntheticWidth, syntheticHeight);
assert(syntheticCore, 'dense synthetic tank has measurable portrait bounds');
assert(syntheticCore.x0 >= 20 && syntheticCore.x1 <= 79 && syntheticCore.y0 >= 47,
  'sparse antenna and barrel pixels do not control dense chassis framing');
for (const placement of [
  directPortraitPlacement(syntheticCore, 256, 256),
  containedPortraitPlacement(syntheticCore, syntheticWidth, syntheticHeight, 140, 88),
]) {
  assert(Number.isFinite(placement.x) && Number.isFinite(placement.y) && placement.scale > 0,
    'generator and runtime placements remain finite and positive');
}
assert.equal(
  auditPortraitPixels(syntheticPixels, syntheticWidth, syntheticHeight).passes,
  true,
  'a normalized tank with sparse equipment passes the shared release envelope',
);

const iconNames = (await readdir(new URL('../../public/icons/', import.meta.url)))
  .filter((name) => name.endsWith('_angle.webp'))
  .sort();
const thumbNames = (await readdir(new URL('../../public/icons/thumbs/', import.meta.url)))
  .filter((name) => name.endsWith('_angle.webp'))
  .sort();
if (iconNames.length !== thumbNames.length
    || iconNames.some((name, index) => name !== thumbNames[index])) {
  throw new Error('every full Garage angle portrait must have a matching 256px thumbnail');
}

for (const id of ['gallery', 'speed', 'camouflage', 'shield', 'engine', 'scope', 'damage', 'optics']) {
  if (!uiIconIds().includes(id)) throw new Error(`missing garage dossier icon: ${id}`);
}

for (const type of shellIconTypes()) {
  if (!shellIconSVG(type, 24).includes(`data-shell-type="${type}"`)) {
    throw new Error(`missing garage ammunition silhouette: ${type}`);
  }
}
