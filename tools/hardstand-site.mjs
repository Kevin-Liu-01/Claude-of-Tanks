// tools/hardstand-site.mjs — search a site, a size and a level for one apron that keep the apron bank law
// (tools/hardstand-banks.mjs) and still seat what the apron carries (maps lane, 2026-10-02).
//
//   node tools/hardstand-site.mjs <map> <index> [--at=x,z] [--r=48] [--step=8] [--sizes=56,60] [--seat=30,7]
//     [--zmin=-402] [--zmax=402] [--top=12]
//
// Candidates are centres on a square lattice round the apron (or --at), square sizes from --sizes, and two levels:
// the median and the middle of the ground under the candidate with this apron removed. Each is built into the map's
// height field and ranked by: the seat test of src/sim/matchPlacement.ts (placementTerrainSafe at the centre with the
// --seat radius and relief; a zone disc is 30,7, a turbo goal 18,5, a flag 12,5), then the walls it makes, then the
// most it steepens its band, then the distance moved. Terrain only: solid props and reachability are the receipts'.
import { placementTerrainSafe } from '../src/sim/matchPlacement.ts';
import { getMapConfig } from '../src/world/maps/index.ts';
import { fieldWithHardstands, measureBank } from './hardstand-banks.mjs';

const args = process.argv.slice(2);
const option = (key, fallback) => args.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const [mapId, indexArg] = args.filter((arg) => !arg.startsWith('--'));
const index = Number(indexArg);
const config = getMapConfig(mapId);
const stands = config.terrain?.hardstands ?? [];
if (!stands[index]) throw new Error(`${mapId} has no apron ${index} (it has ${stands.length})`);
const at = option('at', '').split(',').filter(Boolean).map(Number);
const origin = at.length === 2 ? { ...stands[index], x: at[0], z: at[1] } : stands[index];
const radius = Number(option('r', 48)), step = Number(option('step', 8)), top = Number(option('top', 12));
const sizes = option('sizes', '').split(',').filter(Boolean).map(Number);
const [seatRadius, seatRelief] = option('seat', '30,7').split(',').map(Number);
const zMin = Number(option('zmin', -Infinity)), zMax = Number(option('zmax', Infinity));
const others = stands.filter((_, other) => other !== index);
const natural = fieldWithHardstands(config, others);

function groundUnder(stand) {
  const angle = (stand.yawDeg ?? 0) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle), heights = [];
  for (let u = -stand.width / 2; u <= stand.width / 2; u += 4) for (let v = -stand.length / 2; v <= stand.length / 2; v += 4) {
    heights.push(natural.getHeightAt(stand.x + u * c + v * s, stand.z - u * s + v * c));
  }
  return heights.sort((a, b) => a - b);
}

function evaluate(stand) {
  const list = [...others.slice(0, index), stand, ...others.slice(index)];
  const field = fieldWithHardstands(config, list);
  return {
    ...measureBank(field, natural, stand),
    seat: placementTerrainSafe(field, { x: stand.x, z: stand.z }, { radius: seatRadius, relief: seatRelief, normalY: 0.94 }),
  };
}

const describe = (stand) => `(${stand.x}, ${stand.z}) ${stand.width}x${stand.length} level ${stand.level}`;
const current = evaluate(stands[index]);
console.log(`now ${describe({ ...stands[index], level: stands[index].level ?? 'road' })}: walls ${current.walls}/${current.points}, `
  + `steepens ${current.steepen}, worst ${current.worst}, seat ${current.seat}`);
const rows = [];
for (let dz = -radius; dz <= radius; dz += step) for (let dx = -radius; dx <= radius; dx += step) {
  if (origin.z + dz < zMin || origin.z + dz > zMax) continue;
  for (const size of sizes.length ? sizes : [origin.width]) {
    const square = origin.width === origin.length;
    const base = { ...origin, x: origin.x + dx, z: origin.z + dz, width: size, length: square ? size : origin.length };
    const ground = groundUnder(base);
    const levels = new Set([ground[ground.length >> 1], (ground[0] + ground[ground.length - 1]) / 2].map((y) => Math.round(y * 10) / 10));
    for (const level of levels) {
      const stand = { ...base, level, grade: 0 };
      rows.push({ stand, moved: Math.hypot(stand.x - stands[index].x, stand.z - stands[index].z),
        spread: ground[ground.length - 1] - ground[0], ...evaluate(stand) });
    }
  }
}
rows.sort((a, b) => (b.seat - a.seat) || (a.walls - b.walls) || (a.steepen - b.steepen) || (a.moved - b.moved));
for (const row of rows.slice(0, top)) {
  console.log(`${describe(row.stand)}: walls ${row.walls}/${row.points}, steepens ${row.steepen}, worst ${row.worst}, `
    + `seat ${row.seat}, moved ${row.moved.toFixed(0)} m, ground spread ${row.spread.toFixed(1)} m`);
}
