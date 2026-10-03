// tools/hardstand-site.mjs — search a site, a size and a level for one apron that keep the apron bank law
// (tools/hardstand-banks.mjs) and still seat what the apron carries (maps lane, 2026-10-02).
//
//   node tools/hardstand-site.mjs <map> <index> [--at=x,z] [--r=48] [--step=8] [--sizes=56,60] [--length=80]
//     [--seat=30,7] [--zmin=-402] [--zmax=402] [--tilt] [--road] [--banks=18,24] [--top=12]
//
// Candidates are centres on a square lattice round the apron (or --at), widths from --sizes (a square apron stays
// square; --length sets a strip's length), and two levels:
// the median and the middle of the ground under the candidate with this apron removed. --tilt adds the ground's own
// plane under the candidate (the apron turned to its fall line, its grade held to hardstandSurface.ts's 8 %), --road
// adds the candidate at the crossing road's own height and grade (level omitted, grade 'road': it follows the road at
// every terrain seed), and
// --banks adds wider authored banks (bankM) to every candidate. Each is built into the map's height field and ranked
// by: the seat test of src/sim/matchPlacement.ts (placementTerrainSafe at the centre with the --seat radius and relief;
// a zone disc is 30,7, a turbo goal 18,5, a flag 12,5), then the walls it makes, then the distance moved, then the
// bank (narrower first), then the most it steepens its band. Terrain only: solid props and reachability are the
// receipts'.
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
const lengthM = Number(option('length', NaN));
const tilt = args.includes('--tilt'), followRoad = args.includes('--road');
const banks = [undefined, ...option('banks', '').split(',').filter(Boolean).map(Number)];
const GRADE_LIMIT = 0.08;
const others = stands.filter((_, other) => other !== index);
const natural = fieldWithHardstands(config, others);

function groundUnder(stand) {
  const angle = (stand.yawDeg ?? 0) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle), heights = [];
  for (let u = -stand.width / 2; u <= stand.width / 2; u += 4) for (let v = -stand.length / 2; v <= stand.length / 2; v += 4) {
    heights.push(natural.getHeightAt(stand.x + u * c + v * s, stand.z - u * s + v * c));
  }
  return heights.sort((a, b) => a - b);
}

/** The ground's least-squares plane under a candidate: its height at the centre and its gradient. */
function groundPlane(stand) {
  let n = 0, sx = 0, sz = 0, sh = 0, sxx = 0, szz = 0, sxz = 0, sxh = 0, szh = 0;
  const angle = (stand.yawDeg ?? 0) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  for (let u = -stand.width / 2; u <= stand.width / 2; u += 4) for (let v = -stand.length / 2; v <= stand.length / 2; v += 4) {
    const dx = u * c + v * s, dz = -u * s + v * c, h = natural.getHeightAt(stand.x + dx, stand.z + dz);
    n++; sx += dx; sz += dz; sh += h; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; sxh += dx * h; szh += dz * h;
  }
  const mx = sx / n, mz = sz / n, mh = sh / n;
  const cxx = sxx / n - mx * mx, czz = szz / n - mz * mz, cxz = sxz / n - mx * mz;
  const cxh = sxh / n - mx * mh, czh = szh / n - mz * mh, det = cxx * czz - cxz * cxz || 1;
  const gx = (cxh * czz - czh * cxz) / det, gz = (czh * cxx - cxh * cxz) / det;
  return { level: mh - gx * mx - gz * mz, gx, gz };
}

function evaluate(stand) {
  const list = [...others.slice(0, index), stand, ...others.slice(index)];
  const field = fieldWithHardstands(config, list);
  return {
    ...measureBank(field, natural, stand),
    seat: placementTerrainSafe(field, { x: stand.x, z: stand.z }, { radius: seatRadius, relief: seatRelief, normalY: 0.94 }),
  };
}

const describe = (stand) => `(${stand.x}, ${stand.z}) ${stand.width}x${stand.length} level ${stand.level ?? 'road'}`
  + `${stand.yawDeg ? ` yaw ${stand.yawDeg}` : ''}${stand.grade ? ` grade ${stand.grade}` : ''}${stand.bankM ? ` bank ${stand.bankM}` : ''}`;
const current = evaluate(stands[index]);
console.log(`now ${describe({ ...stands[index], level: stands[index].level ?? 'road' })}: walls ${current.walls}/${current.points}, `
  + `steepens ${current.steepen}, worst ${current.worst}, seat ${current.seat}`);
const rows = [];
for (let dz = -radius; dz <= radius; dz += step) for (let dx = -radius; dx <= radius; dx += step) {
  if (origin.z + dz < zMin || origin.z + dz > zMax) continue;
  for (const size of sizes.length ? sizes : [origin.width]) {
    const square = origin.width === origin.length;
    const length = Number.isFinite(lengthM) ? lengthM : square ? size : origin.length;
    const base = { ...origin, x: origin.x + dx, z: origin.z + dz, width: size, length };
    const ground = groundUnder(base);
    const levels = new Set([ground[ground.length >> 1], (ground[0] + ground[ground.length - 1]) / 2].map((y) => Math.round(y * 10) / 10));
    const options = [...levels].map((level) => ({ ...base, level, grade: 0 }));
    if (tilt) {
      // turn the strip so its length runs down the fall line; a square apron keeps its footprint, a strip its yaw
      const plane = groundPlane(base);
      const fall = Math.atan2(plane.gx, plane.gz) * 180 / Math.PI;
      const yawDeg = square ? Math.round(fall) : base.yawDeg ?? 0;
      const angle = yawDeg * Math.PI / 180;
      const along = plane.gx * Math.sin(angle) + plane.gz * Math.cos(angle);
      const grade = Math.max(-GRADE_LIMIT, Math.min(GRADE_LIMIT, along));
      options.push({ ...base, yawDeg, level: Math.round(plane.level * 10) / 10, grade: Math.round(grade * 1000) / 1000 });
    }
    if (followRoad) {
      const { level: _level, ...onRoad } = base;
      options.push({ ...onRoad, grade: 'road' });
    }
    for (const option of options) for (const bankM of banks) {
      const stand = bankM ? { ...option, bankM } : option;
      rows.push({ stand, moved: Math.hypot(stand.x - stands[index].x, stand.z - stands[index].z),
        spread: ground[ground.length - 1] - ground[0], ...evaluate(stand) });
    }
  }
}
rows.sort((a, b) => (b.seat - a.seat) || (a.walls - b.walls) || (a.moved - b.moved)
  || ((a.stand.bankM ?? 0) - (b.stand.bankM ?? 0)) || (a.steepen - b.steepen));
for (const row of rows.slice(0, top)) {
  console.log(`${describe(row.stand)}: walls ${row.walls}/${row.points}, steepens ${row.steepen}, worst ${row.worst}, `
    + `seat ${row.seat}, moved ${row.moved.toFixed(0)} m, ground spread ${row.spread.toFixed(1)} m`);
}
