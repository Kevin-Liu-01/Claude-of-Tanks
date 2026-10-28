/** Plain-node coverage for the shared UI and equipment vector icon sets. */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { EQUIPMENT_CATALOG } from '../game/equipment.ts';
import { consumableIconSVG, equipIconIds, equipIconSVG } from './equipIcons.ts';
import { CONSUMABLE_CATALOG } from '../sim/consumableRules.ts';
import { CONSUMABLE_ICONS } from '../game/consumableLoadout.ts';
import { SMALL_MASTERS } from './icons/spriteIndex.ts';
import { uiIconIds, uiIconSVG } from './uiIcons.ts';
import { mapRegionTags, regionTagIcon } from './regionTags.ts';
import { MAP_IDS } from '../world/maps/catalog.ts';
import { shellIconSVG, shellIconTypes } from './shellIcons.ts';
import { readIconSprite } from '../../tools/icon-sprite-lib.mjs';
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

// consumables (261: "much better icons and be represented uniquely but as cool-y as equipment"): every item its own cs*
// glyph with a 16-unit master, on the equipment's badge framed in its category's colour, and bare below 20 px
const consumableGlyphs = new Set();
const largeConsumableIcons = new Set();
for (const item of CONSUMABLE_CATALOG) {
  const glyph = CONSUMABLE_ICONS[item.id];
  assert.match(glyph, /^cs[A-Z]/, `${item.id}: its own cs* glyph, never a shared UI glyph`);
  assert.ok(SMALL_MASTERS.includes(` ${glyph} `), `${item.id}: ${glyph} has its 16-unit master`);
  consumableGlyphs.add(glyph);
  const svg = consumableIconSVG(item.id, 38);
  assert.match(svg, new RegExp(`data-consumable-icon="${item.id}"`), `${item.id}: the badge names its item`);
  assert.match(svg, new RegExp(`data-icon-category="${item.category}"`), `${item.id}: the badge carries its category`);
  assert.equal(equipIconSVG(item.id, 38), '', `${item.id}: a consumable id is never an equipment id`);
  assert.match(svg, /<path d="M4 1\.5h16\.5l2 2v16L20 22\.5H3\.5l-2-2V4Z"/, `${item.id}: the equipment's badge, not a second one`);
  assert.match(consumableIconSVG(item.id, 16), new RegExp(`<use href="#i-${glyph}-s"/>`), `${item.id}: bare 16-unit master below 20 px`);
  largeConsumableIcons.add(svg);
}
assert.equal(consumableGlyphs.size, CONSUMABLE_CATALOG.length, 'every consumable keeps a distinct glyph');
assert.equal(largeConsumableIcons.size, CONSUMABLE_CATALOG.length, 'every consumable keeps a distinct rendered badge');
assert.equal(consumableIconSVG('missing'), '', 'an unknown consumable draws nothing');

for (const id of uiIconIds()) {
  const svg = uiIconSVG(id, 24);
  if (!svg.startsWith('<svg') || !svg.endsWith('</svg>')) {
    throw new Error(`invalid UI icon: ${id}`);
  }
}

const regionIcons = new Set();
for (const region of ['woodland', 'desert', 'winter', 'urban', 'tropical', 'maritime', 'night']) {
  const icon = regionTagIcon(region);
  assert.ok(uiIconIds().includes(icon), `${region}: shared region icon exists`);
  regionIcons.add(uiIconSVG(icon));
}
assert.equal(regionIcons.size, 7, 'region glyphs remain visually distinct');
assert.equal(regionTagIcon('digital'), undefined, 'pattern styles are not landscape regions');
for (const map of MAP_IDS) {
  const regions = mapRegionTags(map);
  assert.ok(regions.length > 0, `${map}: explicit landscape classification`);
  assert.equal(new Set(regions).size, regions.length, `${map}: no duplicate region badges`);
  for (const region of regions) assert.ok(regionTagIcon(region), `${map}: shares the camo filter icon`);
}
assert.deepEqual(mapRegionTags('random'), [], 'random maps cannot promise one region');
assert.deepEqual(mapRegionTags('missing'), [], 'unknown maps cannot inherit a misleading region');
assert.ok(mapRegionTags('coastal').includes('maritime'));
assert.ok(mapRegionTags('alpine').includes('winter'));
assert.ok(mapRegionTags('monsoon').includes('tropical'));

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

// The one sprite (brand-ui BUI-F4): navigation glyphs are native monoline symbols, never <image> embeds of
// product marks; uiIconSVG references them through the icon() host with the house stroke, caps and joins.
const sprite = readIconSprite();
for (const id of ['garage', 'home', 'gallery', 'studio', 'manual', 'play', 'deploy', 'media', 'record', 'settings']) {
  const glyph = sprite.large.get(id);
  assert.ok(glyph && !/<image|data:image\//.test(glyph), `${id} is a native vector glyph in the sprite`);
  const svg = uiIconSVG(id, 24);
  assert.match(svg, new RegExp(`<use href="#i-${id}"/>`), `${id} references its sprite symbol`);
  assert.match(svg, /stroke-width="1\.5" stroke-linecap="square" stroke-linejoin="miter"/, `${id} wears the house stroke`);
  assert.match(svg, /data-af=""/, `${id} takes the filled active state`);
}
assert.match(uiIconSVG('modeZones', 16), /viewBox="0 0 16 16"[^>]*stroke-width="1\.25"[\s\S]*href="#i-modeZones-s"/,
  'at 16 px a glyph with an optical master uses the 16-unit symbol and its own stroke');
assert.match(uiIconSVG('eqRammer', 16), /viewBox="0 0 24 24"[\s\S]*href="#i-eqRammer"/,
  'without an optical master the 24-unit symbol serves every size');
assert.match(uiIconSVG('tick', 12), /href="#i-check-s"/, 'retired ids resolve through the alias map');
assert.equal(uiIconSVG('', 12), '', 'an empty id draws nothing');
assert.match(uiIconSVG('info', 13, 'currentColor', 'x'), /^<svg class="cot-i x" /, 'a class joins the cot-i host');
assert.doesNotMatch(uiIconSVG('info', 13), /style=/, 'the default colour inherits the surrounding text');
const modeGlyphs = [...sprite.large.keys()].filter((id) => id.startsWith('mode'));
assert.equal(modeGlyphs.length, 14, 'fourteen mode glyphs: the 13 rulesets and the proving ground');
assert.equal(new Set(modeGlyphs.map((id) => sprite.large.get(id))).size, 14, 'no two modes share a glyph');
assert.notEqual(sprite.large.get('modeFrontline'), sprite.large.get('modeZones'), 'Frontline Assault has its own glyph');
for (const family of [
  ['engine', 'transmission', 'fuelTank', 'ammoRack', 'autoloader', 'breech', 'optics', 'radio', 'apu', 'turretRing', 'fcs', 'track'],
  ['crewCommander', 'crewGunner', 'crewDriver', 'crewLoader'],
  ['penetration', 'ricochet', 'blocked', 'critical', 'detonation', 'damage', 'skull', 'statusFire'],
  ['vehicle', 'layerArmor', 'layerModules', 'crew', 'layerMarkup', 'layerXray', 'toolSection', 'toolExplode', 'toolIsolate',
    'toolMeasure', 'toolHitbox', 'toolPhoto'],
  ['classMbt', 'classMedium', 'classHeavy', 'classLight', 'classIfv', 'classApc', 'classTd', 'classSpaa', 'classFireSupport'],
  ['shellAp', 'shellApcr', 'shellApfsds', 'shellHeat', 'shellHe', 'shellAtgm'],
  ['repair', 'medkit', 'extinguisher', 'smoke'],
  ['lampOk', 'lampWarn', 'lampDown'],
]) {
  for (const id of family) assert.ok(sprite.large.has(id), `the sprite draws ${id}`);
  assert.equal(new Set(family.map((id) => sprite.large.get(id))).size, family.length, `${family[0]} family glyphs are distinct`);
}
for (const id of ['crewCommander', 'crewGunner', 'crewDriver', 'crewLoader', 'penetration', 'ricochet', 'blocked']) {
  assert.ok(sprite.small.has(id), `${id} has a 16-unit optical master for the HUD`);
}

const tankThumbs = await readFile(new URL('./tankThumbs.ts', import.meta.url), 'utf8');
if (!tankThumbs.includes('await ensureTankBuilder(id)')) {
  throw new Error('top-down mask fallback must join the exact fleet demand-load before createTank');
}
for (const contract of [
  "from './portraitFraming.ts'",
  'measurePortraitCoreBounds',
  'containedPortraitPlacement',
  'await img.decode()',
  '--cot-thumb-scale',
  "cotPortraitFramed = 'true'",
  "cotPortraitReady = 'true'",
  "cotPortraitReady = 'false'",
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

for (const tool of ['gen-icon-sprite.mjs', 'icon-stroke-census.mjs']) {
  execFileSync(process.execPath, [new URL(`../../tools/${tool}`, import.meta.url).pathname, ...(tool.startsWith('gen') ? ['--check'] : [])], { stdio: 'pipe' });
}
