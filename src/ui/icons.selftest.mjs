/** Plain-node coverage for the shared UI and equipment vector icon sets. */

import { EQUIPMENT_CATALOG } from '../game/equipment.js';
import { equipIconIds, equipIconSVG } from './equipIcons.js';
import { uiIconIds, uiIconSVG } from './uiIcons.js';

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

for (const id of ['sound', 'soundOff', 'graphics', 'settings']) {
  if (!uiIconIds().includes(id)) throw new Error(`missing mobile HUD icon: ${id}`);
}
