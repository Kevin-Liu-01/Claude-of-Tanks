// tools/hardstand-banks.mjs — the apron bank law (docs/MAP-LAYOUT-BRIEF.md, "Apron banks"; maps lane, 2026-10-02).
//
// An apron (terrain.hardstands) is stamped into the road grids, so the ground leaves its plane through the road
// blend: fully on the plane to 3.8 m, back to the natural ground by 14 m, a bank about 10 m wide. An apron that stands
// metres off its ground turns that band into a wall (Monsoon's first assembly apron cut 10 m into a 30 % hillside and a
// bot fell 12 m off the cut at t = 6 s). The scan samples the band 1-11 m outside every apron, every 4 m along each
// ring, and counts the points where the finished ground is steeper than BANK_STEEP and steeper by BANK_MARGIN than the
// same point with that apron removed: a wall the apron made, not a hillside it stands beside.
//
//   node tools/hardstand-banks.mjs [map,map,...] [--json=out.json]
//
// src/world/hardstandBanks.selftest.mjs holds every map to it.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { getMapConfig, MAP_IDS } from '../src/world/maps/index.ts';
import { createHeightField } from '../src/world/terrain.ts';

/** A bank steeper than this (31 degrees) is a wall to a tank. */
export const BANK_STEEP = 0.6;
/** ...when it is this much steeper than the ground without the apron. */
export const BANK_MARGIN = 0.25;
/** The terrain seed the game and the dedicated world build with (server/world-collision-manifests/index.json). */
const TERRAIN_SEED = 1337;
const BAND_M = [1, 3, 5, 7, 9, 11];
const SPACING_M = 4;
const SLOPE_STEP_M = 1.5;
const EDGE_M = 495;

function slopeAt(field, x, z) {
  const e = SLOPE_STEP_M;
  return Math.hypot(field.getHeightAt(x + e, z) - field.getHeightAt(x - e, z),
    field.getHeightAt(x, z + e) - field.getHeightAt(x, z - e)) / (2 * e);
}

/** Every band point round one apron: rings 1-11 m outside its rectangle, one point per 4 m of ring. */
function bandPoints(stand, visit) {
  const angle = (stand.yawDeg ?? 0) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  for (const d of BAND_M) {
    const hw = stand.width / 2 + d, hl = stand.length / 2 + d;
    const perimeter = 4 * (hw + hl), count = Math.ceil(perimeter / SPACING_M);
    for (let k = 0; k < count; k++) {
      let t = k / count * perimeter, u, v;
      if (t < 2 * hw) { u = -hw + t; v = -hl; } else if ((t -= 2 * hw) < 2 * hl) { u = hw; v = -hl + t; }
      else if ((t -= 2 * hl) < 2 * hw) { u = hw - t; v = hl; } else { t -= 2 * hw; u = -hw; v = hl - t; }
      // the strip's local frame as hardstandSurface.ts reads it: across = dx c - dz s, along = dx s + dz c
      const x = stand.x + u * c + v * s, z = stand.z - u * s + v * c;
      if (Math.abs(x) <= EDGE_M && Math.abs(z) <= EDGE_M) visit(x, z);
    }
  }
}

/**
 * One apron's bank on a finished field against the field without it: the band points sampled, the walls it made
 * (points over BANK_STEEP and BANK_MARGIN steeper than without it), the steepest point and where it steepened most.
 */
export function measureBank(field, without, stand) {
  let points = 0, walls = 0, worst = 0, steepen = -Infinity, steepenAt = null;
  bandPoints(stand, (x, z) => {
    const g = slopeAt(field, x, z), g0 = slopeAt(without, x, z);
    points++;
    worst = Math.max(worst, g);
    if (g - g0 > steepen) { steepen = g - g0; steepenAt = { x: Math.round(x), z: Math.round(z), slope: +g.toFixed(2), without: +g0.toFixed(2) }; }
    if (g > BANK_STEEP && g - g0 > BANK_MARGIN) walls++;
  });
  return { points, walls, worst: +worst.toFixed(3), steepen: +steepen.toFixed(3), steepenAt };
}

/** A map's height field as the game builds it, with the given aprons in place of the config's. */
export function fieldWithHardstands(config, hardstands) {
  return createHeightField(TERRAIN_SEED, { ...config, terrain: { ...config.terrain, hardstands } });
}

/** Scan one map's aprons: one row per apron, its index and frame, its built level and its bank (measureBank). */
export function scanHardstandBanks(mapId, config = getMapConfig(mapId)) {
  const stands = config?.terrain?.hardstands ?? [];
  if (!stands.length) return [];
  const field = fieldWithHardstands(config, stands);
  return stands.map((stand, index) => {
    const without = fieldWithHardstands(config, stands.filter((_, other) => other !== index));
    return {
      mapId, index, x: stand.x, z: stand.z, width: stand.width, length: stand.length,
      level: +field.getHeightAt(stand.x, stand.z).toFixed(2),
      ...measureBank(field, without, stand),
    };
  });
}

/** Scan every map that has aprons. */
export function scanAllHardstandBanks(mapIds = MAP_IDS) {
  return mapIds.flatMap((mapId) => scanHardstandBanks(mapId));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const maps = args.find((arg) => !arg.startsWith('--'))?.split(',') ?? MAP_IDS;
  const json = args.find((arg) => arg.startsWith('--json='))?.slice(7);
  const rows = scanAllHardstandBanks(maps);
  for (const row of rows) {
    const at = row.steepenAt ? ` steepest made at (${row.steepenAt.x}, ${row.steepenAt.z}) ${row.steepenAt.slope} vs ${row.steepenAt.without}` : '';
    console.log(`${`${row.mapId}:${row.index}`.padEnd(14)} (${row.x}, ${row.z}) ${row.width}x${row.length} level ${row.level}: `
      + `walls ${row.walls}/${row.points}, worst ${row.worst}${at}`);
  }
  const over = rows.filter((row) => row.walls > 0);
  console.log(`hardstand-banks: ${rows.length} aprons, ${over.length} with walls${over.length ? `: ${over.map((row) => `${row.mapId}:${row.index}`).join(', ')}` : ''}`);
  if (json) writeFileSync(json, `${JSON.stringify(rows, null, 1)}\n`);
}
