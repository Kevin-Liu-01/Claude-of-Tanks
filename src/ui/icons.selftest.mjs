/** Plain-node coverage for the shared UI and equipment vector icon sets. */

import { readFile } from 'node:fs/promises';
import './garageDossier.selftest.mjs';
import { EQUIPMENT_CATALOG } from '../game/equipment.js';
import { equipIconIds, equipIconSVG } from './equipIcons.js';
import { uiIconIds, uiIconSVG } from './uiIcons.js';
import { shellIconSVG, shellIconTypes } from './shellIcons.js';

const equipIds = new Set(equipIconIds());
for (const item of EQUIPMENT_CATALOG) {
  if (!equipIds.has(item.id) || !equipIconSVG(item.id, 24).includes('</svg>')) {
    throw new Error(`missing equipment icon: ${item.id}`);
  }
}

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

for (const id of ['sound', 'soundOff', 'graphics', 'settings']) {
  if (!uiIconIds().includes(id)) throw new Error(`missing mobile HUD icon: ${id}`);
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

for (const id of ['gallery', 'speed', 'camouflage', 'shield', 'engine', 'scope', 'damage', 'optics']) {
  if (!uiIconIds().includes(id)) throw new Error(`missing garage dossier icon: ${id}`);
}

for (const type of shellIconTypes()) {
  if (!shellIconSVG(type, 24).includes(`data-shell-type="${type}"`)) {
    throw new Error(`missing garage ammunition silhouette: ${type}`);
  }
}
