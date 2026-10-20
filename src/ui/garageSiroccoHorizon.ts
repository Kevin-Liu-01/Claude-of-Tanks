import * as THREE from 'three';

import { LandmarkMesh, landmarkHash, landmarkHex, type GarageHorizonSink, type LandmarkPoint } from './garageLandmarkMesh.ts';

/**
 * Sirocco Deployment's horizon (garage r9; the owner: "the envrionments outside ... should have enviornments inspired off
 * of their map inspo"). Sirocco Wadi is the eroded edge of Tunisia's Dahar sandstone plateau (src/world/maps/desert.ts):
 * two mesa outliers stand on the west of the basin, the Gara south-west of centre and the North Mesa in the north-west
 * corner, the wadi leaves the escarpment between them and braids east past a ksar, the fortified granary village at the
 * ford, and star dunes answer the mesas across the centre.
 *
 * Seen from the Garage (the map's player spawn, -118, -408) every landmark stands at its own map bearing
 * (`SIROCCO_LANDMARKS`, checked against the map's heightfield by garageG3Horizons.selftest.mjs):
 * - the Gara: a table mesa straight up the wadi (map bearing 90.5 deg, 235 m, 46 deg wide), caprock lip, strata cliff
 *   bands, buttress fluting, varnish streaks and a talus apron, the dunes banked against its foot;
 * - the North Mesa: a second, hazier tableland beyond the Gara's right shoulder (the map's 101 deg, drawn at 112 deg where
 *   the Gara does not hide it, inside the receipt's 15 degrees);
 * - the ksar on a spur at the wadi crossing: stacked barrel-vaulted ghorfa granary cells three and four high in mud
 *   plaster, its curtain wall and a gate;
 * - date palms clustered along the braided wadi bed toward the ksar;
 * - the Erg Dune and the Gara Dune, the two star dunes, as peaked crests in the far bands;
 * - the escarpment itself, the Dahar's edge beyond the map's south-west rim, a low strata cliff behind the dunes either
 *   side of the canonical frame, broken by the wadi's notch behind the hero so the turret keeps the sky.
 *
 * Budget: about 2,000 triangles in the horizon's existing draw (the dune bands give up columns to pay for them).
 */

const DEG = Math.PI / 180;

/** The landmarks and the map points they stand for (map metres; the receipt re-derives each bearing). */
export const SIROCCO_LANDMARKS = Object.freeze([
  { name: 'the Gara', type: 'tableMesa', bearingDeg: 88, radiusM: 70, map: [-120, -173] as const },
  { name: 'the North Mesa', type: 'tableMesa', bearingDeg: 113, radiusM: 90, map: [-269, 372] as const },
  { name: 'the ksar', type: 'ksar', bearingDeg: 62, radiusM: 64, map: [0, 0] as const },
  { name: 'the Erg Dune', type: 'starDune', bearingDeg: 66, radiusM: 96, map: [128, 148] as const },
  { name: 'the Gara Dune', type: 'starDune', bearingDeg: 7, radiusM: 96, map: [300, -356] as const },
]);

interface MesaParams {
  readonly bearing: number;
  readonly radius: number;
  /** Half-length across the line of sight and half-depth along it (m). */
  readonly halfWidth: number;
  readonly halfDepth: number;
  readonly height: number;
  readonly segments: number;
  readonly seed: number;
  /** Extra haze for a farther tableland. */
  readonly haze?: number;
}

const STRATA = [0xd4b48c, 0xb07e5a, 0xc8a47c, 0x98684a, 0xdcc49e, 0xa87656, 0xc09470] as const;
const CAPROCK = 0x7e604a;
const CAPROCK_TOP = 0x987a5a;
const TALUS = 0xbb9670;
const SAND = 0xd6b886;

/**
 * The sandstone's profile from the dunes up (garage r9): a talus apron, a lower cliff, a ledge stepping back, an upper
 * cliff, the caprock's overhanging lip and its top. [outward offset (m), height share of the column's height, kind];
 * offsets are from the column's cliff line, the shares of its height (the foot row is absolute).
 */
const CLIFF_ROWS: ReadonlyArray<readonly [number, number, 'foot' | 'talus' | 'cliff' | 'ledge' | 'cap' | 'top']> = [
  [8.5, -6.5, 'foot'], [3.2, 0.2, 'talus'], [2.6, 0.31, 'cliff'], [2.1, 0.42, 'cliff'], [1.8, 0.5, 'ledge'],
  [0.7, 0.52, 'cliff'], [0.5, 0.64, 'cliff'], [0.3, 0.76, 'cliff'], [0.1, 0.88, 'cliff'], [0.55, 0.89, 'cap'],
  [0.55, 0.995, 'top'], [-0.7, 1, 'top'],
];

/** A column of a cliff line: its foot point, its outward normal (x, z), its height, its flute (in/out) and a streak flag. */
interface CliffColumn {
  readonly x: number;
  readonly z: number;
  readonly nx: number;
  readonly nz: number;
  readonly height: number;
  readonly flute: number;
  readonly varnish: boolean;
}

function cliffPoint(column: CliffColumn, row: number): LandmarkPoint {
  const [offset, share, kind] = CLIFF_ROWS[row];
  const rib = kind === 'cliff' ? column.flute : kind === 'ledge' || kind === 'cap' ? column.flute * 0.4 : 0;
  const o = offset + rib;
  return [column.x + column.nx * o, kind === 'foot' ? share : share * column.height, column.z + column.nz * o];
}

/** The tone of one quad of the cliff between rows `row` and `row + 1` (one colour a quad, so the strata read as bands). */
function cliffTone(column: CliffColumn, row: number, seed: number): THREE.Color | number {
  const kind = CLIFF_ROWS[row][2], next = CLIFF_ROWS[row + 1][2];
  if (kind === 'foot') return SAND;
  if (kind === 'talus') return TALUS;
  if (kind === 'cap' || next === 'cap') return next === 'cap' ? landmarkHex(CAPROCK).clone().multiplyScalar(0.9) : CAPROCK;
  if (kind === 'top') return CAPROCK_TOP;
  if (kind === 'ledge') return 0xc4a27a;
  const band = (row + Math.round(seed * 3)) % STRATA.length;
  const tone = landmarkHex(STRATA[band]).clone();
  // desert varnish runs down from the caprock on some buttresses, darkest high up
  if (column.varnish) tone.multiplyScalar(row >= 6 ? 0.66 : 0.82);
  return tone;
}

/** One cliff line of columns into the mesh: closed (a mesa) or open (an escarpment), its faces turned off `inside`. */
function buildCliffLine(m: LandmarkMesh, columns: readonly CliffColumn[], closed: boolean, seed: number,
  inside: (i: number) => LandmarkPoint): void {
  const count = closed ? columns.length : columns.length - 1;
  for (let i = 0; i < count; i += 1) {
    const a = columns[i], b = columns[(i + 1) % columns.length];
    const ref = inside(i);
    for (let row = 0; row < CLIFF_ROWS.length - 1; row += 1) {
      const tone = cliffTone(a, row, landmarkHash(seed, row));
      m.face([cliffPoint(a, row), cliffPoint(b, row), cliffPoint(b, row + 1), cliffPoint(a, row + 1)], tone,
        { inside: CLIFF_ROWS[row][2] === 'top' ? [ref[0], ref[1] - 20, ref[2]] : ref });
    }
  }
}

/**
 * A table mesa: an irregular superellipse plan with promontories and buttress fluting, the sandstone profile all round
 * (talus, lower cliff, ledge, upper cliff, caprock lip), strata bands, desert varnish, and a flat top under drifted sand
 * whose rim is notched by erosion.
 */
function buildTableMesa(m: LandmarkMesh, p: MesaParams): void {
  const center: LandmarkPoint = [Math.cos(p.bearing) * p.radius, 0, Math.sin(p.bearing) * p.radius];
  const tangent = [-Math.sin(p.bearing), Math.cos(p.bearing)] as const;
  const out = [Math.cos(p.bearing), Math.sin(p.bearing)] as const;
  const n = p.segments;
  const base: Array<[number, number]> = [];
  const s1 = landmarkHash(p.seed, 1) * 6.28, s2 = landmarkHash(p.seed, 2) * 6.28, s3 = landmarkHash(p.seed, 3) * 6.28;
  for (let i = 0; i < n; i += 1) {
    const u = (i / n) * Math.PI * 2;
    const ca = Math.cos(u), sa = Math.sin(u);
    const a = p.halfWidth * Math.sign(ca) * Math.pow(Math.abs(ca), 2 / 3.2);
    const d = p.halfDepth * Math.sign(sa) * Math.pow(Math.abs(sa), 2 / 3.2);
    const wobble = 1 + 0.08 * Math.sin(2 * u + s1) + 0.06 * Math.sin(5 * u + s2) + 0.04 * Math.sin(9 * u + s3);
    base.push([center[0] + (tangent[0] * a + out[0] * d) * wobble, center[2] + (tangent[1] * a + out[1] * d) * wobble]);
  }
  const columns: CliffColumn[] = base.map(([x, z], i) => {
    const [ax, az] = base[(i + n - 1) % n], [bx, bz] = base[(i + 1) % n];
    let nx = bz - az, nz = -(bx - ax);
    const length = Math.hypot(nx, nz) || 1;
    nx /= length; nz /= length;
    if (nx * (x - center[0]) + nz * (z - center[2]) < 0) { nx = -nx; nz = -nz; }
    // the rim notched by erosion here and there; buttresses in and out
    const notch = landmarkHash(p.seed + i, 21) < 0.14 ? 0.9 : 1;
    return {
      x, z, nx, nz,
      height: p.height * notch * (0.985 + 0.03 * landmarkHash(p.seed + i, 5)),
      flute: (i % 2 === 0 ? 1 : -1) * (0.5 + 0.6 * landmarkHash(p.seed + i, 7)),
      varnish: landmarkHash(p.seed + i * 3.7, 11) > 0.55,
    };
  });
  const hazeBefore = m.hazeBias;
  m.hazeBias = hazeBefore + (p.haze ?? 0);
  const inside: LandmarkPoint = [center[0], p.height * 0.4, center[2]];
  buildCliffLine(m, columns, true, p.seed, () => inside);
  // the top: sand drifted across the caprock, a little proud of its rim toward the middle
  for (let i = 0; i < n; i += 1) {
    const rimA = cliffPoint(columns[i], CLIFF_ROWS.length - 1), rimB = cliffPoint(columns[(i + 1) % n], CLIFF_ROWS.length - 1);
    m.face([[center[0], p.height + 0.25, center[2]], rimB, rimA], [0xcdb088, CAPROCK_TOP, CAPROCK_TOP],
      { inside: [center[0], p.height - 4, center[2]] });
  }
  m.hazeBias = hazeBefore;
}

/**
 * The escarpment: the same sandstone profile along an arc of bearings, its plateau running back from the caprock, the
 * cliff line meandering with buttresses, stepping down to a spur at each end.
 */
function buildEscarpment(m: LandmarkMesh, from: number, to: number, radius: number, height: number, seed: number): void {
  const steps = Math.max(4, Math.round(((to - from) * radius) / 4.2));
  const columns: CliffColumn[] = [];
  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    const angle = from + (to - from) * t;
    const r = radius + 2.2 * Math.sin(t * 7.3 + seed) + 1.1 * Math.sin(t * 19 + seed * 2);
    const end = Math.min(t, 1 - t) * steps;
    columns.push({
      x: Math.cos(angle) * r, z: Math.sin(angle) * r,
      // the cliff faces the yard: its outward normal points back toward the turntable
      nx: -Math.cos(angle), nz: -Math.sin(angle),
      height: height * (end < 1 ? 0.55 : end < 2 ? 0.8 : 1) * (0.95 + 0.07 * landmarkHash(seed, s)),
      flute: (s % 2 === 0 ? 1 : -1) * (0.5 + 0.5 * landmarkHash(seed + s, 7)),
      varnish: landmarkHash(seed + s * 2.3, 13) > 0.58,
    });
  }
  buildCliffLine(m, columns, false, seed, (i) => {
    const mid = from + (to - from) * ((i + 0.5) / steps);
    return [Math.cos(mid) * (radius + 8), 2, Math.sin(mid) * (radius + 8)];
  });
  // the plateau back from the caprock's rim
  for (let s = 0; s < steps; s += 1) {
    const a = columns[s], b = columns[s + 1];
    const rimA = cliffPoint(a, CLIFF_ROWS.length - 1), rimB = cliffPoint(b, CLIFF_ROWS.length - 1);
    const back = (p: LandmarkPoint, column: CliffColumn): LandmarkPoint => [p[0] - column.nx * 10, p[1] + 0.15, p[2] - column.nz * 10];
    m.face([rimA, rimB, back(rimB, b), back(rimA, a)], 0xc6a87c, { inside: [rimA[0], rimA[1] - 20, rimA[2]] });
  }
  // the end faces of each spur
  for (const s of [0, steps]) {
    const column = columns[s];
    const sign = s === 0 ? -1 : 1;
    const angle = from + (to - from) * (s / steps);
    const lip = cliffPoint(column, CLIFF_ROWS.length - 2), foot = cliffPoint(column, 1);
    const backLip: LandmarkPoint = [lip[0] - column.nx * 10, lip[1], lip[2] - column.nz * 10];
    const backFoot: LandmarkPoint = [foot[0] - column.nx * 10, foot[1], foot[2] - column.nz * 10];
    const interior: LandmarkPoint = [Math.cos(angle - sign * 0.15) * (radius + 4), 2, Math.sin(angle - sign * 0.15) * (radius + 4)];
    m.face([foot, backFoot, backLip, lip], [TALUS, TALUS, CAPROCK, CAPROCK], { inside: interior, cull: false });
  }
}

/**
 * The ksar on its spur: ghorfa granary cells (barrel vaults over mud-plastered cells, a dark door each) stacked three and
 * four high round a court, with a curtain wall, corner towers and its gate toward the wadi.
 */
function buildKsar(m: LandmarkMesh, bearing: number, radius: number, sink: GarageHorizonSink): void {
  m.rugged = false;
  const ground = Math.max(sink.crestAt(bearing, 1), sink.crestAt(bearing, 2) * 0.8) + 0.4;
  const at = m.frame(bearing, radius);
  // the spur: a low rocky shoulder under the village, tapering into the dunes
  const spurTop = ground;
  for (let i = 0; i < 10; i += 1) {
    const x0 = -15 + i * 3.4, x1 = x0 + 3.4;
    const shape = (x: number): number => spurTop * (1 - Math.pow(Math.abs(x) / 17, 3));
    m.face([at(x0, -5, -3), at(x1, -5, -3), at(x1, shape(x1), 2), at(x0, shape(x0), 2)], [SAND, SAND, TALUS, TALUS]);
    m.face([at(x0, shape(x0), 2), at(x1, shape(x1), 2), at(x1, shape(x1), 14), at(x0, shape(x0), 14)], TALUS);
  }
  const plaster = [0xc7a57a, 0xbc9a6e, 0xd0b088, 0xb48f66] as const;
  const door = 0x3a2c22;
  // the cells: rows of ghorfas on three sides of the court (left, back, right), tiers stepping up toward the back
  const cellW = 2.1, cellD = 3.2, tierH = 1.55;
  const ranges: ReadonlyArray<readonly [number, number, number, number]> = [
    // [x0, count, z, tiers]
    [-9.5, 4, 3, 3], [-0.8, 4, 3.4, 4], [5.6, 3, 2.6, 3], [-8.2, 5, 7.8, 4], [2.6, 3, 8.2, 3],
  ];
  for (const [x0, count, z, tiers] of ranges) {
    for (let c = 0; c < count; c += 1) {
      const x = x0 + c * cellW;
      const height = Math.max(2, tiers - (landmarkHash(x, z) < 0.3 ? 1 : 0));
      for (let t = 0; t < height; t += 1) {
        const y0 = spurTop + t * tierH, y1 = y0 + tierH * 0.72;
        const tone = plaster[(c + t + Math.round(z)) % plaster.length];
        m.box(at, x, x + cellW - 0.08, z + t * 0.35, z + cellD, y0, y1, tone, null, c === 0 || c === count - 1);
        // the barrel vault over the cell, three facets
        const zA = z + t * 0.35, zB = z + cellD;
        const vault = (k: number): [number, number] => {
          const a = Math.PI * (k / 3);
          return [x + (cellW - 0.08) * (0.5 - 0.5 * Math.cos(a)), y1 + Math.sin(a) * tierH * 0.28];
        };
        for (let k = 0; k < 3; k += 1) {
          const [xa, ya] = vault(k), [xb, yb] = vault(k + 1);
          m.face([at(xa, ya, zA), at(xb, yb, zA), at(xb, yb, zB), at(xa, ya, zB)], tone);
        }
        // the vault's end arch on the front and the cell's low door
        m.face([at(x, y1, zA - 0.02), at(x + cellW - 0.08, y1, zA - 0.02), at(x + (cellW - 0.08) / 2, y1 + tierH * 0.28, zA - 0.02)], tone);
        m.panel(at, x + 0.62, x + 1.38, zA, y0 + 0.08, y0 + 0.92, door);
      }
    }
  }
  // the curtain wall across the front with corner towers and the gate
  const wallTone = 0xb89670;
  m.box(at, -11.5, -2.2, 0, 0.8, spurTop - 0.3, spurTop + 2.4, wallTone, wallTone);
  m.box(at, 2.2, 10.5, 0, 0.8, spurTop - 0.3, spurTop + 2.4, wallTone, wallTone);
  m.box(at, -2.2, 2.2, -0.2, 1.2, spurTop - 0.3, spurTop + 3.6, 0xc3a27a, 0xb08c64);
  m.panel(at, -1.0, 1.0, -0.2, spurTop - 0.2, spurTop + 2.2, door);
  for (const x of [-12.6, 11.4]) m.box(at, x, x + 2.2, -0.4, 1.8, spurTop - 0.3, spurTop + 4.2, 0xc09e74, 0xae8a62);
  m.rugged = true;
}

/** A date palm on the horizon: a leaning, ringed trunk and a crown of drooping fronds. */
function buildPalm(m: LandmarkMesh, x: number, z: number, foot: number, height: number, seed: number): void {
  m.rugged = false;
  const lean = (landmarkHash(seed, 1) - 0.5) * 0.9;
  const leanZ = (landmarkHash(seed, 2) - 0.5) * 0.9;
  const top: LandmarkPoint = [x + lean, foot + height, z + leanZ];
  const trunk = 0x6e5a40;
  for (let k = 0; k < 3; k += 1) {
    const a0 = (k / 3) * Math.PI * 2, a1 = ((k + 1) / 3) * Math.PI * 2;
    const r = 0.22;
    m.face([[x + Math.cos(a0) * r, foot, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, foot, z + Math.sin(a1) * r],
      [top[0] + Math.cos(a1) * r * 0.7, top[1], top[2] + Math.sin(a1) * r * 0.7], [top[0] + Math.cos(a0) * r * 0.7, top[1], top[2] + Math.sin(a0) * r * 0.7]],
    trunk, { inside: [x, foot + height / 2, z], cull: false });
  }
  const fronds = 7;
  for (let f = 0; f < fronds; f += 1) {
    const a = (f / fronds) * Math.PI * 2 + landmarkHash(seed, f) * 0.6;
    const reach = 2.4 + landmarkHash(seed, f + 9) * 0.9;
    const tipX = top[0] + Math.cos(a) * reach, tipZ = top[2] + Math.sin(a) * reach;
    const midX = top[0] + Math.cos(a) * reach * 0.5, midZ = top[2] + Math.sin(a) * reach * 0.5;
    const side = [-Math.sin(a) * 0.38, Math.cos(a) * 0.38] as const;
    const green = f % 2 ? 0x4c5a2c : 0x5e6a34;
    const below: LandmarkPoint = [top[0], top[1] - 4, top[2]];
    m.face([top, [midX + side[0], top[1] + 0.45, midZ + side[1]], [tipX, top[1] - 1.1, tipZ]], green, { cull: false, inside: below });
    m.face([top, [tipX, top[1] - 1.1, tipZ], [midX - side[0], top[1] + 0.45, midZ - side[1]]], f % 2 ? 0x44522a : 0x56622f,
      { cull: false, inside: below });
  }
  m.rugged = true;
}

/** The dune bands' clearance under the landmarks: band crests in front of a mesa or the escarpment sink (0..1 of them). */
export function siroccoDuneClearance(angle: number, layer: number, radius: number): number {
  let keep = 1;
  const dip = (bearingDeg: number, halfDeg: number, landmarkRadius: number, depth: number): void => {
    if (radius > landmarkRadius + 4) return;
    let delta = Math.abs(angle - bearingDeg * DEG) % (Math.PI * 2);
    if (delta > Math.PI) delta = Math.PI * 2 - delta;
    const window = 1 - THREE.MathUtils.smoothstep(delta, halfDeg * DEG, (halfDeg + 7) * DEG);
    keep = Math.min(keep, 1 - depth * window);
  };
  // the Gara's apron and the North Mesa's, the ksar's spur, the escarpment's two runs behind the canonical frame's dunes
  // (the Gara's near dunes fall away into the wadi bed in front of it, so its cliff stands from the bed)
  dip(88, 19, 76, 0.8);
  dip(113, 8, 94, layer >= 3 ? 0.7 : 0.5);
  dip(62, 6, 64, 0.45);
  dip(187, 16, 84, layer >= 3 ? 0.7 : layer >= 1 ? 0.5 : 0.2);
  dip(255, 11, 86, layer >= 3 ? 0.7 : layer >= 1 ? 0.5 : 0.2);
  return keep;
}

/** The two star dunes as peaked crests in the far bands (metres added to a band's crest). */
export function siroccoStarDunes(angle: number, layer: number): number {
  if (layer < 3) return 0;
  let lift = 0;
  for (const [bearingDeg, height] of [[66, 3.2], [7, 2.6]] as const) {
    let delta = Math.abs(angle - bearingDeg * DEG) % (Math.PI * 2);
    if (delta > Math.PI) delta = Math.PI * 2 - delta;
    // a star dune: a sharp summit and arms
    lift += height * (Math.pow(Math.max(0, Math.cos(delta)), 260) + 0.35 * Math.pow(Math.max(0, Math.cos(delta * 0.5)), 600));
  }
  return lift;
}

/** Build Sirocco's landmarks into the horizon's arrays. Returns the tallest landmark top over the datum. */
export function buildSiroccoHorizon(sink: GarageHorizonSink): { readonly maxHeightM: number; readonly triangles: number } {
  const m = new LandmarkMesh(sink);
  buildTableMesa(m, { bearing: 88 * DEG, radius: 70, halfWidth: 23, halfDepth: 8.5, height: 12.9, segments: 40, seed: 31 });
  buildTableMesa(m, { bearing: 113 * DEG, radius: 90, halfWidth: 12, halfDepth: 6, height: 12.2, segments: 22, seed: 57, haze: 0.06 });
  // the Dahar escarpment beyond the dunes, either side of the wadi's notch behind the hero (the canonical frame looks down
  // bearing 225 deg; its hero halo spans about 211-239 deg)
  buildEscarpment(m, 168 * DEG, 206 * DEG, 82, 9.4, 3);
  buildEscarpment(m, 244 * DEG, 266 * DEG, 84, 8.6, 7);
  buildKsar(m, 62 * DEG, 64, sink);
  // date palms along the wadi bed toward the ksar, in clusters
  const palms: ReadonlyArray<readonly [number, number, number]> = [
    [50, 60, 6.6], [51.5, 62, 7.4], [53, 59, 6.0], [55, 64, 7.8], [56.5, 61, 6.8], [69, 60, 7.2], [70.5, 63, 6.4],
    [72, 58, 7.6], [46, 66, 6.2], [47.5, 69, 7.0], [75, 61, 6.6], [44, 58, 7.2],
  ];
  palms.forEach(([bearingDeg, radius, height], index) => {
    const angle = bearingDeg * DEG;
    const foot = Math.max(-1, sink.crestAt(angle, radius < 60 ? 1 : 2) * 0.35 - 0.6);
    buildPalm(m, Math.cos(angle) * radius, Math.sin(angle) * radius, foot, height, 101 + index * 7);
  });
  return { maxHeightM: m.topY, triangles: m.triangles };
}
