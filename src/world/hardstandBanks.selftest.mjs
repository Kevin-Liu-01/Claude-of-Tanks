// The apron bank law (docs/MAP-LAYOUT-BRIEF.md, "Apron banks"; maps lane, 2026-10-02): no apron (terrain.hardstands)
// may make its bank steeper than 0.6 where the ground without it is gentler, by 0.25. tools/hardstand-banks.mjs is the
// scan; this receipt holds every map to it.
//
// PENDING names each apron still over the law, where it stands and who owns it. The list only shrinks: an apron that
// grows a wall and is not on the list fails, a listed apron that moved and still has walls fails, and a listed apron
// that is now clean fails until its entry is removed. The list must be empty before PR #9 is marked ready.
import assert from 'node:assert/strict';
import { BANK_MARGIN, BANK_STEEP, scanAllHardstandBanks, scanHardstandBanks } from '../../tools/hardstand-banks.mjs';
import { getMapConfig } from './maps/index.ts';

const MAPS_LANE = 'maps lane (visual/maps-layouts)';
const MAPS_LANE_B = 'maps lane B (visual/maps-layouts-b)';
const PENDING = Object.freeze([
  { apron: 'desert:1', at: [-292, 112], owner: MAPS_LANE },
  { apron: 'desert:2', at: [292, -112], owner: MAPS_LANE },
  { apron: 'steppe:0', at: [-330, -240], owner: MAPS_LANE_B },
  { apron: 'steppe:1', at: [60, 90], owner: MAPS_LANE_B },
  { apron: 'steppe:2', at: [292, 312], owner: MAPS_LANE_B },
  { apron: 'airfield:0', at: [0, 0], owner: MAPS_LANE_B },
]);

// The scan sees the wall that set the law: Monsoon's first assembly apron, 44 m at 1.0 m on a hillside 5-15 m high,
// from which a bot fell 12 m at t = 6 s (2026-10-02).
{
  const monsoon = getMapConfig('monsoon');
  const incident = { ...monsoon, terrain: { ...monsoon.terrain,
    hardstands: [{ x: 10, z: -404, width: 44, length: 44, yawDeg: 0, level: 1.0, grade: 0 }] } };
  const [row] = scanHardstandBanks('monsoon', incident);
  assert.ok(row.walls >= 20, `the incident apron reads as a wall (${row.walls} of ${row.points} band points)`);
}

const rows = scanAllHardstandBanks();
const keyOf = (row) => `${row.mapId}:${row.index}`;
const failures = [];
const describe = (row) => `${keyOf(row)} at (${row.x}, ${row.z}) ${row.width}x${row.length}, level ${row.level}: `
  + `${row.walls} of ${row.points} band points over ${BANK_STEEP} and ${BANK_MARGIN} steeper than without it`
  + (row.steepenAt ? `, most at (${row.steepenAt.x}, ${row.steepenAt.z}) ${row.steepenAt.slope} vs ${row.steepenAt.without}` : '');
for (const row of rows) {
  if (row.walls === 0) continue;
  const pending = PENDING.find((entry) => entry.apron === keyOf(row));
  if (!pending) failures.push(`${describe(row)}: re-site it on its ground (tools/hardstand-banks.mjs, docs/MAP-LAYOUT-BRIEF.md)`);
  else if (pending.at[0] !== row.x || pending.at[1] !== row.z) failures.push(`${describe(row)}: moved from the pending (${pending.at.join(', ')}) and still has walls`);
}
for (const entry of PENDING) {
  const row = rows.find((candidate) => keyOf(candidate) === entry.apron);
  if (!row) failures.push(`${entry.apron} is pending but no such apron exists: take it off the list`);
  else if (row.walls === 0) failures.push(`${entry.apron} has no walls now: take it off the pending list`);
}
assert.deepEqual(failures, [], `apron bank law:\n${failures.join('\n')}`);

const owners = {};
for (const entry of PENDING) owners[entry.owner] = (owners[entry.owner] ?? 0) + 1;
console.log(`hardstandBanks.selftest: ${rows.length} aprons on ${new Set(rows.map((row) => row.mapId)).size} maps, `
  + `${rows.length - PENDING.length} within the law, ${PENDING.length} pending `
  + `(${Object.entries(owners).map(([owner, count]) => `${owner}: ${count}`).join('; ') || 'none'})`);
