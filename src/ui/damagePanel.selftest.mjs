import assert from 'node:assert/strict';

import {
  DAMAGE_PANEL_CREW_ICON_IDS,
  DAMAGE_PANEL_MODULE_ICON_IDS,
  layoutDamagePanelCrewAnchors,
  layoutDamagePanelModuleAnchors,
  layoutDamagePanelScreenAnchors,
} from './damagePanel.ts';
import { MODULE_IDS } from '../sim/moduleCatalog.ts';
import { CREW_ORDER } from './moduleRegistry.ts';

const expectedIconIds = MODULE_IDS.filter((id) => id !== 'trackL' && id !== 'trackR').sort();
assert.deepEqual(
  [...DAMAGE_PANEL_MODULE_ICON_IDS].sort(),
  expectedIconIds,
  'every non-track gameplay module has a damage-panel location glyph',
);
assert.deepEqual(
  [...DAMAGE_PANEL_CREW_ICON_IDS].sort(),
  [...CREW_ORDER].sort(),
  'every authored crew role has a damage-panel location glyph',
);

const markers = layoutDamagePanelModuleAnchors([
  { module: 'engine', min: [-0.4, 0, -1.2], max: [0.4, 1, -0.4] },
  { module: 'ammoRack', min: [-0.4, 0, -1.2], max: [0.4, 1, -0.4] },
  { module: 'optics', min: [-0.1, 0, -0.9], max: [0.1, 1, -0.7], turretLocal: true },
  { module: 'trackL', min: [-1.5, 0, -2], max: [-1.2, 1, 2] },
]);

assert.equal(markers.length, 3, 'tracks remain represented by the tank rails rather than duplicate glyphs');
assert.deepEqual(
  markers.map(({ name, sourceX, sourceZ, turretLocal }) => ({ name, sourceX, sourceZ, turretLocal })),
  [
    { name: 'engine', sourceX: 0, sourceZ: -0.8, turretLocal: false },
    { name: 'ammoRack', sourceX: 0, sourceZ: -0.8, turretLocal: false },
    { name: 'optics', sourceX: 0, sourceZ: -0.8, turretLocal: true },
  ],
  'marker source points stay at exact authored volume centers',
);
for (const marker of markers) {
  assert.equal(marker.x, marker.sourceX, `${marker.name}: authored x center is not pre-distorted`);
  assert.equal(marker.z, marker.sourceZ, `${marker.name}: authored z center is not pre-distorted`);
}

const crewMarkers = layoutDamagePanelCrewAnchors([
  { crew: 'driver', min: [-0.4, 0.4, 1], max: [0.4, 1.2, 1.8] },
  { crew: 'gunner', min: [0.1, 0, -0.1], max: [0.5, 0.8, 0.5], turretLocal: true },
]);
assert.deepEqual(
  crewMarkers.map(({ name, sourceX, sourceZ, turretLocal }) => ({ name, sourceX, sourceZ, turretLocal })),
  [
    { name: 'driver', sourceX: 0, sourceZ: 1.4, turretLocal: false },
    { name: 'gunner', sourceX: 0.3, sourceZ: 0.2, turretLocal: true },
  ],
  'crew markers use exact authored hull/turret volume centers',
);

const screenMarkers = layoutDamagePanelScreenAnchors([
  { kind: 'module', name: 'ammoRack', sourcePx: 50, sourcePy: 50 },
  { kind: 'module', name: 'autoloader', sourcePx: 50, sourcePy: 50 },
  { kind: 'crew', name: 'gunner', sourcePx: 50, sourcePy: 50 },
  { kind: 'crew', name: 'commander', sourcePx: 50, sourcePy: 50 },
], 100, 100);
for (const marker of screenMarkers) {
  assert(
    Math.hypot(marker.x - marker.sourcePx, marker.y - marker.sourcePy) <= 14.01,
    `${marker.kind}/${marker.name}: collision layout stays attached to the authored source`,
  );
  assert(marker.x >= 6.5 && marker.x <= 93.5 && marker.y >= 6.5 && marker.y <= 93.5,
    `${marker.kind}/${marker.name}: marker stays inside the diagram`);
}
for (let i = 0; i < screenMarkers.length; i++) {
  for (let j = i + 1; j < screenMarkers.length; j++) {
    assert(
      Math.hypot(screenMarkers[i].x - screenMarkers[j].x, screenMarkers[i].y - screenMarkers[j].y) >= 10.5,
      'dense module and crew markers resolve together in final screen space',
    );
  }
}

await import('../vehicles/tankFactory.ts');
const { ALL_TANK_IDS, TANK_SPECS } = await import('../vehicles/specs.ts');
const iconIds = new Set(DAMAGE_PANEL_MODULE_ICON_IDS);
let authoredMarkerCount = 0;
let authoredCrewMarkerCount = 0;
for (const id of ALL_TANK_IDS) {
  const armor = TANK_SPECS[id]?.armor;
  const volumes = armor?.modules || [];
  const expected = volumes.filter((volume) =>
    volume.module !== 'trackL' && volume.module !== 'trackR' && iconIds.has(volume.module));
  const layout = layoutDamagePanelModuleAnchors(volumes);
  assert.equal(layout.length, expected.length, `${id}: every authored non-track module gets a marker`);
  for (const marker of layout) {
    assert(
      [marker.x, marker.z, marker.sourceX, marker.sourceZ].every(Number.isFinite),
      `${id}/${marker.name}: marker positions stay finite`,
    );
  }
  authoredMarkerCount += layout.length;

  const crew = armor?.crew || [];
  const crewLayout = layoutDamagePanelCrewAnchors(crew);
  assert.equal(crewLayout.length, crew.length, `${id}: every authored crew station gets a marker`);
  for (const marker of crewLayout) {
    assert(
      [marker.x, marker.z, marker.sourceX, marker.sourceZ].every(Number.isFinite),
      `${id}/${marker.name}: crew marker positions stay finite`,
    );
  }
  authoredCrewMarkerCount += crewLayout.length;
}

console.log(
  `damagePanel.selftest: ${ALL_TANK_IDS.length} tanks / ${authoredMarkerCount} module + `
  + `${authoredCrewMarkerCount} crew markers, exact-source coverage and bounded screen layout passed`,
);
