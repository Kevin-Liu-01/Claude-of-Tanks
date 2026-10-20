import * as THREE from 'three';

import { LandmarkMesh, landmarkHash, type GarageHorizonSink, type LandmarkPoint } from './garageLandmarkMesh.ts';

/**
 * Steinburg Deployment's town skyline (garage r9; the brief: "a red-sandstone and brick Zeughaus in an old German hill
 * town ... gables, the castle on its rock"; replacing the built horizon's pastel flat-roofed boxes). Steinburg is a walled
 * Franconian hill town (src/world/maps/urban.ts, after Kronach and Meissen): the old town on the back of a ridge spur, its
 * wall surviving in stretches with its gate towers, the market church, the castle crowning the rock where the spur ends,
 * brickworks down in the valley.
 *
 * Seen from the Garage (the map's player spawn, -36, -404, in the south valley) the town fills the north:
 * - the old town on its spur, map bearing 70-125 deg: steep red-brown tiled roofs, gable-fronted and eaves-fronted houses
 *   two and three storeys high in lime render, ochre and half-timbering, dormers and chimneys, the back rows climbing the
 *   spur;
 * - the town wall in front of it with the south gate tower (map bearing 92 deg) and a round wall tower;
 * - two spires: the market church's Gothic needle (95 deg) and a baroque onion tower (80 deg);
 * - the castle on its rock (65 deg): the round keep, the palace range and the ring wall on a crag;
 * - the brickworks in the valley (54 deg): kiln sheds and the tall tapered chimney;
 * - the rest of the round is the valley's farmland: orchards and red-roofed farmsteads on the low hills, nothing behind
 *   the hero's turret in the canonical frame (bearings 211-239 deg).
 * Masses stay under the biome ceiling (13.2 m); only the spires, the keep, the towers and the chimney rise past it.
 */

const DEG = Math.PI / 180;

export const STEINBURG_LANDMARKS = Object.freeze([
  { name: 'the old town', type: 'townSkyline', bearingDeg: 96, radiusM: 66, map: [-50, 0] as const },
  { name: 'the castle on its rock', type: 'castle', bearingDeg: 65, radiusM: 74, map: [153, 8] as const },
  { name: 'the market church spire', type: 'spire', bearingDeg: 95, radiusM: 70, map: [-76, 52] as const },
  { name: 'the onion tower', type: 'spire', bearingDeg: 81, radiusM: 69, map: [10, 40] as const },
  { name: 'the south gate tower', type: 'wallTower', bearingDeg: 92, radiusM: 56, map: [-48, -101] as const },
  { name: 'the brickworks chimney', type: 'chimney', bearingDeg: 54, radiusM: 62, map: [70, -258] as const },
]);

const ROOFS = [0x8a4632, 0x7c3e2c, 0x6e3a2a, 0x94523a, 0x80442e] as const;
const RENDER = [0xd7c7a6, 0xcdb48a, 0xbfae8c, 0xd2c2a2, 0xb9a487, 0xc8b08e] as const;
const TIMBER = 0x4e3a2a;
const WINDOW = 0x2c3237;
const STONE = 0x8e857a;
const STONE_DARK = 0x7a7268;

/** The spur's rise under the old town (metres over the band's land), highest along its crest. */
function spurRise(bearingDeg: number, radius: number): number {
  const along = 1 - THREE.MathUtils.smoothstep(Math.abs(bearingDeg - 97), 18, 34);
  const back = THREE.MathUtils.smoothstep(radius, 54, 74);
  return along * (0.5 + 1.5 * back);
}

/** A Franconian house in a frame turned to the yard: render or half-timbering, windows, a steep tiled roof, a chimney. */
function buildHouse(m: LandmarkMesh, at: (x: number, y: number, z: number) => LandmarkPoint, foot: number, seed: number,
  width: number, kind: 'gable' | 'eaves'): number {
  const depth = kind === 'gable' ? 7 + landmarkHash(seed, 1) * 2 : 5.6 + landmarkHash(seed, 1) * 1.2;
  const storeys = landmarkHash(seed, 2) < 0.55 ? 2 : 3;
  const eave = foot + 0.9 + storeys * 1.3;
  const wall = RENDER[Math.floor(landmarkHash(seed, 3) * RENDER.length)];
  const roof = ROOFS[Math.floor(landmarkHash(seed, 4) * ROOFS.length)];
  const x0 = -width / 2, x1 = width / 2;
  m.box(at, x0, x1, 0, depth, foot - 1.5, eave, wall, null);
  const framed = landmarkHash(seed, 5) < 0.4;
  let ridge: number;
  if (kind === 'gable') {
    ridge = eave + width * 0.62;
    m.gableToward(at, x0, x1, 0, depth, eave, ridge, wall, roof, 0.3);
  } else {
    ridge = eave + depth * 0.62;
    m.gableAcross(at, x0, x1, 0, depth, eave, ridge, wall, roof, 0.3);
    // a dormer in the front slope
    if (width > 7 && landmarkHash(seed, 6) < 0.7) {
      const dz = depth * 0.22, dy = eave + (ridge - eave) * 0.42;
      m.box(at, -0.8, 0.8, dz, dz + 1.2, dy - 0.2, dy + 0.9, wall, null, false);
      m.gableToward(at, -0.85, 0.85, dz, dz + 1.3, dy + 0.9, dy + 1.5, wall, roof, 0.1);
      m.panel(at, -0.4, 0.4, dz, dy + 0.05, dy + 0.7, WINDOW);
    }
  }
  // windows: a row a storey; half-timbered fronts take their frame (posts, rails, a brace) over the render
  for (let s = 0; s < storeys; s += 1) {
    const y0 = foot + 1.15 + s * 1.3;
    const count = Math.max(2, Math.floor(width / 1.9));
    for (let w = 0; w < count; w += 1) {
      const x = x0 + (w + 0.5) * (width / count);
      m.panel(at, x - 0.3, x + 0.3, 0, y0, y0 + 0.74, landmarkHash(seed + w, s + 9) < 0.08 ? 0xd8c690 : WINDOW);
    }
    if (framed && s > 0) {
      m.panel(at, x0 + 0.05, x1 - 0.05, -0.01, y0 - 0.32, y0 - 0.2, TIMBER);
      for (let w = 0; w <= count; w += 1) {
        const x = x0 + w * (width / count);
        m.panel(at, x - 0.07, x + 0.07, -0.01, y0 - 0.2, y0 + 1.0, TIMBER);
      }
    }
  }
  m.panel(at, -0.45, 0.45, 0, foot - 0.1, foot + 1.0, 0x3b2e24); // the door
  // a chimney through the roof
  if (landmarkHash(seed, 7) < 0.75) {
    const cx = x0 + width * (0.25 + 0.5 * landmarkHash(seed, 8));
    const cz = depth * 0.62;
    m.box(at, cx - 0.28, cx + 0.28, cz - 0.28, cz + 0.28, ridge - 1.6, ridge + 0.7, 0x7a4c3c, 0x3a3230);
  }
  return ridge;
}

/** The castle on its crag: a rock knoll, the ring wall, the round keep under its cone, the palace range, a wall tower. */
function buildCastle(m: LandmarkMesh, bearing: number, radius: number, ground: number): void {
  const at = m.frame(bearing, radius);
  const rock = [0x7c7266, 0x6c6358, 0x857b6e] as const;
  const top = ground + 5.2;
  // the crag: faceted rock faces stepping up to the crown, grass on its shoulders
  const ring = 9;
  const outline = Array.from({ length: ring }, (_, i) => {
    const a = (i / ring) * Math.PI * 2;
    const r = 13 + 2.5 * Math.sin(a * 3 + 1.1) + landmarkHash(i, 41) * 2;
    return [Math.cos(a) * r, 4 + Math.sin(a) * r * 0.75] as const;
  });
  const crown = outline.map(([x, z]) => [x * 0.55, 4 + (z - 4) * 0.55] as const);
  const inside: LandmarkPoint = at(0, ground, 4);
  for (let i = 0; i < ring; i += 1) {
    const j = (i + 1) % ring;
    const [ax, az] = outline[i], [bx, bz] = outline[j], [cx, cz] = crown[j], [dx, dz] = crown[i];
    m.face([at(ax, ground - 4, az), at(bx, ground - 4, bz), at(cx, top, cz), at(dx, top, dz)],
      [0x5f6a44, 0x5f6a44, rock[i % 3], rock[(i + 1) % 3]], { inside });
    m.face([at(dx, top, dz), at(cx, top, cz), at(0, top + 0.3, 4)], 0x6a6f4c, { inside: at(0, ground - 2, 4) });
  }
  m.track = false;
  // the ring wall round the crown
  const wallTop = top + 2.4;
  for (let i = 0; i < ring; i += 1) {
    const j = (i + 1) % ring;
    const [ax, az] = crown[i], [bx, bz] = crown[j];
    m.face([at(ax, top - 0.4, az), at(bx, top - 0.4, bz), at(bx, wallTop, bz), at(ax, wallTop, az)], STONE, { inside: at(0, top, 4) });
  }
  // the palace range: three storeys under a half-hipped roof, its long front to the yard
  m.box(at, -6.2, 3.2, 3.6, 8.4, top - 0.4, top + 5.6, 0xc9b99a, null);
  m.gableAcross(at, -6.2, 3.2, 3.6, 8.4, top + 5.6, top + 9.6, 0xc9b99a, 0x6e3a2a, 0.3);
  for (let s = 0; s < 2; s += 1) for (let w = 0; w < 5; w += 1) m.panel(at, -5.6 + w * 1.85, -5.0 + w * 1.85, 3.6, top + 1.4 + s * 1.9, top + 2.5 + s * 1.9, WINDOW);
  // the keep: a round tower with its conical roof; a square wall tower at the ring's right
  m.prism(at, 4.8, 6.0, 2.5, top - 0.4, top + 13.4, STONE, 0x5a3a2c, 10, 0, 2.3);
  m.prism(at, 4.8, 6.0, 2.6, top + 13.4, top + 13.6, STONE_DARK, 0x5a3a2c, 10, 4.6, 2.6);
  m.box(at, 6.8, 9.6, 1.4, 4.2, top - 0.4, top + 7.2, STONE, null);
  m.prism(at, 8.2, 2.8, 2.1, top + 7.2, top + 7.21, STONE_DARK, 0x6a3a2a, 4, 3.2, 2.1);
  m.track = true;
}

/** A church: the nave with its steep roof and a west tower with a Gothic needle spire or a baroque onion. */
function buildChurch(m: LandmarkMesh, bearing: number, radius: number, ground: number, style: 'needle' | 'onion'): void {
  const at = m.frame(bearing, radius);
  const wall = style === 'needle' ? 0xb8ac94 : 0xd8cdb2;
  // the church is a landmark accent whole: its nave rides the spur's crest above the houses
  m.track = false;
  if (style === 'needle') {
    m.box(at, -3.4, 3.4, 4, 15, ground - 1.5, ground + 6.2, wall, null);
    m.gableToward(at, -3.4, 3.4, 4, 15, ground + 6.2, ground + 11.4, wall, 0x5d4436, 0.3);
    for (let w = 0; w < 3; w += 1) m.panel(at, -2.6 + w * 2.1, -1.8 + w * 2.1, 4, ground + 1.6, ground + 4.8, WINDOW);
  }
  const towerTop = ground + (style === 'needle' ? 12 : 10.4);
  m.box(at, -1.9, 1.9, 0.2, 4, ground - 1.5, towerTop, wall, null);
  m.panel(at, -0.5, 0.5, 0.2, towerTop - 2.8, towerTop - 1.2, WINDOW); // the belfry openings
  m.panel(at, -0.7, 0.7, 0.2, ground - 0.2, ground + 2.6, 0x3a2e26);
  if (style === 'needle') {
    // an octagonal needle from a short parapet
    m.box(at, -2.05, 2.05, 0.05, 4.15, towerTop, towerTop + 0.5, wall, null);
    m.prism(at, 0, 2.1, 1.9, towerTop + 0.5, towerTop + 0.51, 0x4d4e4a, 0x4d4e4a, 8, 8.6, 1.9);
  } else {
    // the onion: a bulb swelling out and drawing in to a lantern and its little spire
    const bulb = [[1.5, 0], [2.3, 1.2], [2.0, 2.4], [0.7, 3.2], [0.45, 3.8], [0.6, 4.4], [0.2, 5.6]] as const;
    for (let k = 0; k < bulb.length - 1; k += 1) {
      m.prism(at, 0, 2.1, bulb[k][0], towerTop + bulb[k][1], towerTop + bulb[k + 1][1], 0x4f6a5a, 0x4f6a5a, 8, 0, bulb[k + 1][0]);
    }
    m.prism(at, 0, 2.1, 0.2, towerTop + 5.6, towerTop + 5.61, 0x8a7a4a, 0x8a7a4a, 4, 2.2, 0.2);
  }
  m.track = true;
}

/** An orchard row: round crowns on short trunks along a line. */
function buildOrchard(m: LandmarkMesh, bearingDeg: number, radius: number, count: number, ground: number, seed: number): void {
  m.rugged = false;
  const at = m.frame(bearingDeg * DEG, radius);
  for (let i = 0; i < count; i += 1) {
    const x = (i - (count - 1) / 2) * 3.1 + (landmarkHash(seed, i) - 0.5) * 0.8;
    const z = (i % 2) * 2.4;
    const h = 2.2 + landmarkHash(seed, i + 7) * 0.9, r = 1.25 + landmarkHash(seed, i + 3) * 0.4;
    const green = landmarkHash(seed, i + 5) < 0.5 ? 0x4b6432 : 0x56703a;
    // a crown of four facets over a trunk
    m.face([at(x - 0.1, ground, z), at(x + 0.1, ground, z), at(x + 0.1, ground + h - r * 0.6, z), at(x - 0.1, ground + h - r * 0.6, z)], 0x4a3a2a);
    const c = at(x, ground + h + r * 0.6, z + 0.2);
    const ring = [at(x - r, ground + h - 0.1, z), at(x, ground + h - r * 0.5, z - r * 0.4), at(x + r, ground + h - 0.1, z), at(x, ground + h + 0.2, z + r)];
    for (let k = 0; k < 4; k += 1) m.face([ring[k], ring[(k + 1) % 4], c], k === 1 ? green : 0x445c2e, { inside: at(x, ground + h - 0.3, z + 0.2) });
  }
  m.rugged = true;
}

/** A farmstead: the farmhouse gable-on and its barn eaves-on. */
function buildFarmstead(m: LandmarkMesh, bearingDeg: number, radius: number, ground: number, seed: number): void {
  m.rugged = false;
  const at = m.frame(bearingDeg * DEG, radius);
  const atHouse = m.frame(bearingDeg * DEG - 5 / radius, radius);
  buildHouse(m, atHouse, ground, seed, 6.2, 'gable');
  const barn = (x: number, y: number, z: number): LandmarkPoint => at(x + 6, y, z + 1.5);
  m.box(barn, -5, 5, 0, 6.5, ground - 1.5, ground + 3.4, 0x8a6a4c, null);
  m.gableAcross(barn, -5, 5, 0, 6.5, ground + 3.4, ground + 6.6, 0x8a6a4c, ROOFS[seed % ROOFS.length], 0.3);
  m.panel(barn, -1.4, 1.4, 0, ground - 0.1, ground + 2.8, 0x4a3a2a);
  m.rugged = true;
}

/** The band clearance in front of the town and the castle: the near land drops so the old town stands clear above it. */
export function steinburgBandClearance(angle: number, layer: number, radius: number): number {
  if (radius > 70) return 1;
  let delta = Math.abs(angle - 92 * DEG) % (Math.PI * 2);
  if (delta > Math.PI) delta = Math.PI * 2 - delta;
  const window = 1 - THREE.MathUtils.smoothstep(delta, 32 * DEG, 44 * DEG);
  return 1 - window * (layer === 0 ? 0.35 : 0.6);
}

/** Build Steinburg's town skyline into the horizon's arrays. Returns the masses' and the accents' tops. */
export function buildSteinburgHorizon(sink: GarageHorizonSink): { readonly massTopM: number; readonly accentTopM: number; readonly triangles: number } {
  const m = new LandmarkMesh(sink);
  m.rugged = false;
  // the old town: a front row behind the wall and back rows climbing the spur, each house turned to the yard
  const rows: ReadonlyArray<readonly [number, number, number]> = [[58.5, 72, 122], [64.5, 70, 126], [71, 76, 120]];
  rows.forEach(([radius, from, to], rowIndex) => {
    let bearingDeg = from + landmarkHash(rowIndex, 3) * 1.5;
    let index = 0;
    while (bearingDeg < to) {
      const seed = rowIndex * 101 + index * 7;
      const kind = landmarkHash(seed, 0) < 0.55 ? 'gable' : 'eaves';
      const width = kind === 'gable' ? 5.2 + landmarkHash(seed, 9) * 1.6 : 7.4 + landmarkHash(seed, 9) * 3.4;
      const mid = bearingDeg + (width / 2 / radius) / DEG;
      // leave the church's and the onion tower's plots open
      if (!(Math.abs(mid - 95) < 3.2 && rowIndex === 1) && !(Math.abs(mid - 81) < 2.6 && rowIndex === 1)) {
        const r = radius + (landmarkHash(seed, 12) - 0.5) * 1.6;
        const foot = Math.max(0, sink.crestAt(mid * DEG, 1) * 0.8) + spurRise(mid, r);
        buildHouse(m, m.frame(mid * DEG, r), foot, seed, width, kind);
      }
      bearingDeg += ((width + 0.25 + landmarkHash(seed, 13) * 0.9) / radius) / DEG;
      index += 1;
    }
  });
  // the town wall in stretches in front of the houses, crenellated, with the gate tower and a round wall tower
  {
    const radius = 54.5;
    const groundAt = (bearingDeg: number): number => Math.max(0, sink.crestAt(bearingDeg * DEG, 1) * 0.8) + spurRise(bearingDeg, radius) - 0.4;
    for (const [from, to] of [[73, 89], [95, 108], [111.5, 121]] as const) {
      const steps = Math.round(((to - from) * DEG * radius) / 1.7);
      for (let s = 0; s < steps; s += 1) {
        const b0 = from + ((to - from) * s) / steps, b1 = from + ((to - from) * (s + 1)) / steps;
        const at0 = m.frame(b0 * DEG, radius), at1 = m.frame(b1 * DEG, radius);
        const g0 = groundAt(b0), g1 = groundAt(b1);
        const top = 3.1;
        m.face([at0(0, g0 - 1.5, 0), at1(0, g1 - 1.5, 0), at1(0, g1 + top, 0), at0(0, g0 + top, 0)], s % 3 ? STONE : STONE_DARK, { darkenFoot: true });
        m.face([at0(0, g0 + top, 0), at1(0, g1 + top, 0), at1(0, g1 + top, 0.9), at0(0, g0 + top, 0.9)], STONE_DARK);
        // a merlon on every other step
        if (s % 2 === 0) {
          const atm = m.frame(((b0 + b1) / 2) * DEG, radius - 0.02);
          const g = (g0 + g1) / 2;
          m.box(atm, -0.42, 0.42, 0, 0.6, g + top, g + top + 0.75, STONE, STONE_DARK, false);
        }
      }
    }
    m.track = false;
    // the south gate tower over the road (a square tower, its hipped roof and the passage)
    const gate = m.frame(92 * DEG, 55.5);
    const gg = groundAt(92);
    m.box(gate, -2.9, 2.9, 0, 5.2, gg - 1.5, gg + 8.6, 0xb7a68a, null);
    m.panel(gate, -1.3, 1.3, 0, gg - 0.2, gg + 3.2, 0x2e2621);
    m.panel(gate, -0.6, 0.6, 0, gg + 5.2, gg + 6.4, 0xe6dcc0); // its clock
    m.prism(gate, 0, 2.6, 4.1, gg + 8.6, gg + 8.61, 0x6e3a2a, 0x6e3a2a, 4, 4.4, 4.1);
    // the round wall tower
    const tower = m.frame(110 * DEG, 54.5);
    const tg = groundAt(110);
    m.prism(tower, 0, 0.8, 2.3, tg - 1.5, tg + 6.6, STONE, STONE, 10, 0, 2.3);
    m.prism(tower, 0, 0.8, 2.6, tg + 6.6, tg + 6.61, STONE_DARK, 0x6a3a2a, 10, 4.2, 2.6);
    m.track = true;
  }
  // the two spires: the market church's Gothic needle and the baroque onion
  buildChurch(m, 95 * DEG, 70, Math.max(0, sink.crestAt(95 * DEG, 1) * 0.8) + spurRise(95, 70), 'needle');
  buildChurch(m, 81 * DEG, 68.5, Math.max(0, sink.crestAt(81 * DEG, 1) * 0.8) + spurRise(81, 68.5), 'onion');
  // the castle on its rock where the spur ends
  buildCastle(m, 65 * DEG, 74, Math.max(0.5, sink.crestAt(65 * DEG, 2) * 0.6));
  // the brickworks in the valley: two kiln sheds and the tapered chimney
  {
    const at = m.frame(54 * DEG, 62);
    const g = Math.max(-0.5, sink.crestAt(54 * DEG, 1) * 0.6);
    m.box(at, -9, 1, 2, 9, g - 1.5, g + 3.6, 0x7a4a3a, null);
    m.gableAcross(at, -9, 1, 2, 9, g + 3.6, g + 6.0, 0x7a4a3a, 0x5a4a44, 0.3);
    m.box(at, 2, 8, 4, 10, g - 1.5, g + 3.0, 0x84503e, null);
    m.gableAcross(at, 2, 8, 4, 10, g + 3.0, g + 5.2, 0x84503e, 0x5a4a44, 0.3);
    m.track = false;
    m.prism(at, 4.6, 1.2, 1.25, g - 1.5, g + 22.5, 0x7e4a38, 0x2a2422, 10, 0, 0.78);
    m.track = true;
  }
  // the valley's farmland round the rest: farmsteads and orchards on the low hills, none behind the hero's turret
  for (const [bearingDeg, radius, seed] of [[150, 66, 3], [176, 74, 5], [253, 70, 9], [282, 64, 11], [318, 72, 13], [352, 66, 17], [22, 70, 19]] as const) {
    buildFarmstead(m, bearingDeg, radius, Math.max(-0.5, sink.crestAt(bearingDeg * DEG, 1) * 0.85), seed);
  }
  for (const [bearingDeg, radius, count, seed] of [[160, 61, 6, 2], [196, 63, 7, 4], [262, 60, 6, 6], [300, 62, 7, 8], [334, 60, 6, 10], [36, 62, 6, 12], [130, 60, 5, 14]] as const) {
    buildOrchard(m, bearingDeg, radius, count, Math.max(-0.5, sink.crestAt(bearingDeg * DEG, 1) * 0.85), seed);
  }
  return { massTopM: m.topY, accentTopM: m.accentY, triangles: m.triangles };
}
