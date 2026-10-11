// src/world/maps/orbitalStructures.ts — the Olympus and Earthrise stations' kits (Mars, the Moon): the light destructible
// structures structureKit.ts registers in its 'orbital' family.
//
// The buildings lane, 2026-10-11 (gauntlet wave 380, both critics: "toy-like terrestrial prefab station props",
// "toy-like grid-textured buildings", a "pixel-grid wall texture and black outlines"): rebuilt as a planetary base of
// the 2040s is drawn in NASA's and ESA's studies — habitats whose shells are printed in regolith or shielded under it,
// pressure modules of white composite under quilted blankets with gold foil at their joints, few and small windows,
// airlocks with suit ports, radiators on struts, umbilicals between, sintered pads behind blast berms. Big surfaces take
// the structure kit's detail tile drawn small (`matte`), so it reads as a cast or woven mottle, never a grid.
//
// Every kit keeps its seat in the props' destructible stream (`seated`: as many draws as the old build took), its
// family footprint (structureKit lightMeta hw / hl / h) and its night fixtures (as many apertures, the mission control's
// one beacon). For the destructible lane's anatomy (fracture hooks come after this lands): every future piece is one
// contiguous run of parts, the pieces' boxes do not overlap past 3 cm unless they are joined, and no kit has more than
// 48 pieces; the greenhouse's broken state is the facades lane's, unchanged.
import * as THREE from 'three';
import { markWorldAperture, markWorldBeacon } from '../worldNightEmissionGeometry.ts';
import { buildLatticeMast } from './mastKit.ts';

type Rng = () => number;
interface OrbitalKit {
  box(w: number, h: number, d: number, uv?: number): THREE.BufferGeometry;
  cylinder(top: number, bottom: number, h: number, segments?: number): THREE.BufferGeometry;
  colored(out: THREE.BufferGeometry[], geometry: THREE.BufferGeometry, color: number, rng: Rng, jitter?: number): THREE.BufferGeometry;
  mergeConnectedStructure(id: string, parts: THREE.BufferGeometry[]): THREE.BufferGeometry;
  /** a plain merge (a broken state lies where it fell: no grounded-structure certificate) */
  merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry;
  /** a stream that takes exactly `draws` from `rng` (the kit's seat in the shared stream) and cycles them */
  seated(rng: Rng, draws: number): Rng;
}
const WHITE = 0xe7e7df, FRAME = 0x66727a, DARK = 0x263846;
const ORANGE = 0xd87736, GLASS = 0x52849a;
// the new palette: composite shells, quilted blankets, regolith (the plain's own rust, printed or bagged), radiators
const SHELL = 0xe2dfd6, BLANKET = 0xd6cfbd, REGOLITH = 0x9b5b3b, REGOLITH_DARK = 0x84492f, STEEL = 0x7d8489,
  GRAPHITE = 0x34393f, RADIATOR = 0xf0f1ee, FOIL = 0xb48a45, CELL = 0x26324a, HATCH = 0xc9662c;

/** The draws each kit's old build took from the props' destructible stream (measured): the new builds keep the seats. */
const SEATS: Readonly<Record<string, number>> = Object.freeze({
  missioncontrol: 1376, greenhouse: 1546, ascentlander: 1656, rovergarage: 1584, habdome: 650, habmodule: 612,
  commsmast: 324, solararray: 384, fueltanks: 742, landingpad: 520,
});

/** Draw a geometry's UVs small: the structure kit's detail tile becomes a cast or woven mottle on a big surface. */
function matte<T extends THREE.BufferGeometry>(geometry: T, k = 0.16): T {
  const uv = geometry.getAttribute('uv');
  if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
  return geometry;
}

/** An open-ended drum (stacked courses hide each other's caps), its UVs drawn small. */
function course(rt: number, rb: number, h: number, segments: number): THREE.BufferGeometry {
  return matte(new THREE.CylinderGeometry(rt, rb, h, segments, 1, true), 0.5);
}

/** A prism of the 2-D outline `points` (u across, y up, counter-clockwise) extruded `length` along z, centred on z = 0. */
function prism(points: ReadonlyArray<readonly [number, number]>, length: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([u, y]) => new THREE.Vector2(u, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
  geometry.translate(0, 0, -length / 2);
  return geometry;
}

/** A thick arc (an annular sector between radii r0 and r1 from angle a0 to a1, in the x-y plane) extruded along z. */
function thickArc(r0: number, r1: number, a0: number, a1: number, length: number, steps = 14): THREE.BufferGeometry {
  const pts: Array<[number, number]> = [];
  for (let k = 0; k <= steps; k++) { const a = a0 + (a1 - a0) * k / steps; pts.push([Math.cos(a) * r1, Math.sin(a) * r1]); }
  for (let k = steps; k >= 0; k--) { const a = a0 + (a1 - a0) * k / steps; pts.push([Math.cos(a) * r0, Math.sin(a) * r0]); }
  return prism(pts, length);
}

/** A strut between two points: a square bar `t` thick. */
function bar(a: readonly [number, number, number], b: readonly [number, number, number], t: number, box: OrbitalKit['box']): THREE.BufferGeometry {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
  const geometry = box(t, len, t);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len)));
  return geometry.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}

/** Repeated base infrastructure stays in the existing metal instance buckets.
 * Opaque glazing/foil avoids a transparent pass; fixture masks use the shared
 * night-emission owner. Connectivity is certified before merging each kit.
 */
export function createOrbitalStructures(kit: OrbitalKit) {
  const { box, cylinder, colored, mergeConnectedStructure, merge } = kit;
  function assembly(rng: Rng) {
    const out: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, color = WHITE) => colored(out, g, color, rng, .025);
    const block = (w: number, h: number, d: number, x: number, y: number, z: number, color = WHITE) => add(box(w, h, d).translate(x, y, z), color);
    const drum = (r: number, h: number, x: number, y: number, z: number, color = WHITE) => add(cylinder(r, r, h, 12).translate(x, y, z), color);
    const window = (w: number, h: number, x: number, y: number, z: number) => add(markWorldAperture(box(w, h, .08), [0, 0, 1]).translate(x, y, z), GLASS);
    return { out, add, block, drum, window };
  }

  /** A seated kit build: parts in piece order (each piece one contiguous run), its paint from the kit's seat. */
  function station(id: string, rng: Rng) {
    const paint = kit.seated(rng, SEATS[id]);
    const out: THREE.BufferGeometry[] = [], pieces: string[] = [];
    const add = (g: THREE.BufferGeometry, color: number, piece: string, jitter = 0.03): THREE.BufferGeometry => {
      colored(out, g, color, paint, jitter);
      pieces.push(piece);
      return g;
    };
    /** a small window (night aperture) facing `n` (a unit vector in the x-z plane), its steel frame round it */
    const port = (x: number, y: number, z: number, n: readonly [number, number, number], piece: string, w = 0.46, h = 0.46): void => {
      const yaw = Math.atan2(n[0], n[2]);
      add(box(w + 0.16, h + 0.16, 0.1, 0.1).rotateY(yaw).translate(x - n[0] * 0.03, y, z - n[2] * 0.03), STEEL, piece, 0.02);
      add(markWorldAperture(box(w, h, 0.08, 0.1), [0, 0, 1]).rotateY(yaw).translate(x + n[0] * 0.03, y, z + n[2] * 0.03), GLASS, piece, 0.02);
    };
    const done = (): THREE.BufferGeometry => {
      for (let i = 1; i < pieces.length; i++) {
        if (pieces[i] !== pieces[i - 1] && pieces.indexOf(pieces[i]) < i) throw new Error(`${id}: piece ${pieces[i]} is not one run`);
      }
      return mergeConnectedStructure(id, out);
    };
    return { add, port, done, paint };
  }

  // ------------------------------------------------------------------------------------------------- mission control

  /**
   * The command habitat: two printed-regolith towers (the main one two decks high under a shallow white dome with a
   * band of windows round its upper deck, the annex a single deck with its radiator wing) joined by a pressurised
   * tunnel, the suit-port airlock on the main tower's front, the antenna mast with the station's beacon over it.
   */
  function missioncontrol(rng: Rng): THREE.BufferGeometry {
    const s = station('missioncontrol', rng);
    const mx = -2.6, mr = 4.3, ax = 4.7, ar = 2.45;
    // the sintered footing under both towers
    s.add(matte(box(15.0, 0.3, 12.4, 0.1)).translate(0, 0.15, 0), REGOLITH_DARK, 'mc-footing', 0.04);
    // the main tower: printed in courses (each a shade of its own), the deck band, the window band, the dome
    const courses = 7;
    for (let k = 0; k < courses; k++) {
      const y0 = 0.3 + (k * 5.6) / courses, h = 5.6 / courses, r = mr - k * 0.035;
      s.add(course(r - 0.035, r, h, 24).translate(mx, y0 + h / 2, 0), k % 2 ? REGOLITH : REGOLITH_DARK, 'mc-main-shell', 0.04);
    }
    s.add(matte(cylinder(mr - 0.2, mr - 0.2, 1.5, 24)).translate(mx, 6.65, 0), SHELL, 'mc-main-deck', 0.02);
    const windows: Array<[number, number]> = [];
    for (let k = 0; k < 9; k++) {
      const a = Math.PI / 2 + ((k - 4) * Math.PI) / 7.2;
      windows.push([Math.sin(a), Math.cos(a)]);
    }
    s.add(course(mr - 0.05, mr - 0.05, 0.22, 24).translate(mx, 7.51, 0), STEEL, 'mc-main-deck', 0.02);
    for (const [nx, nz] of windows) s.port(mx + nx * (mr - 0.2), 6.65, nz * (mr - 0.2), [nx, 0, nz], 'mc-main-deck', 0.7, 0.62);
    const dome = new THREE.SphereGeometry(mr - 0.05, 24, 4, 0, Math.PI * 2, 0, Math.PI * 0.32);
    s.add(matte(dome).translate(mx, 7.62 - (mr - 0.05) * Math.cos(Math.PI * 0.32), 0), SHELL, 'mc-main-dome', 0.02);
    // the annex: one deck printed, its roof ring and cap
    for (let k = 0; k < 4; k++) {
      const h = 3.6 / 4;
      s.add(course(ar - 0.02, ar, h, 18).translate(ax, 0.3 + k * h + h / 2, 0), k % 2 ? REGOLITH : REGOLITH_DARK, 'mc-annex-shell', 0.04);
    }
    s.add(matte(cylinder(ar + 0.1, ar + 0.1, 0.3, 18)).translate(ax, 4.05, 0), SHELL, 'mc-annex-roof', 0.02);
    // its radiator wing: two panels on a mast off the roof
    s.add(box(0.16, 1.9, 0.16, 0.2).translate(ax, 5.15, 0), STEEL, 'mc-radiator', 0.02);
    for (const side of [-1, 1]) {
      s.add(box(0.06, 1.3, 2.3, 0.15).translate(ax + side * 0.12, 5.55, side * 1.25), RADIATOR, 'mc-radiator', 0.02);
      s.add(box(0.32, 0.1, 1.1, 0.2).translate(ax, 5.55, side * 0.6), STEEL, 'mc-radiator', 0.02);
    }
    // the tunnel between the towers (a short white drum on its saddle), gold foil at its joints
    const tunnel = cylinder(1.05, 1.05, ax - ar - (mx + mr) + 0.5, 16);
    tunnel.rotateZ(Math.PI / 2);
    s.add(matte(tunnel).translate((mx + mr + ax - ar) / 2, 1.85, 0), SHELL, 'mc-tunnel', 0.02);
    for (const x of [mx + mr - 0.05, ax - ar + 0.05]) {
      const ring = cylinder(1.12, 1.12, 0.22, 16); ring.rotateZ(Math.PI / 2);
      s.add(ring.translate(x, 1.85, 0), FOIL, 'mc-tunnel', 0.02);
    }
    s.add(box(1.4, 0.8, 1.6, 0.2).translate((mx + mr + ax - ar) / 2, 0.7, 0), STEEL, 'mc-tunnel', 0.02);
    // the suit-port airlock on the main tower's front, its hatch frame and the two suit ports beside the hatch
    s.add(matte(box(2.6, 2.7, 1.9, 0.12)).translate(mx, 1.65, mr + 0.55), SHELL, 'mc-airlock', 0.02);
    s.add(box(1.5, 2.15, 0.12, 0.2).translate(mx, 1.42, mr + 1.56), HATCH, 'mc-airlock', 0.02);
    s.port(mx, 1.32, mr + 1.66, [0, 0, 1], 'mc-airlock', 1.0, 1.65);
    for (const side of [-1, 1]) s.add(cylinder(0.32, 0.32, 0.12, 12).rotateX(Math.PI / 2).translate(mx + side * 1.0, 1.75, mr + 1.55), GRAPHITE, 'mc-airlock', 0.02);
    // the antenna mast on the dome's shoulder, its dish and the station's beacon at the top
    const mastX = mx - 1.6, mastZ = -1.4;
    s.add(box(0.7, 0.3, 0.7, 0.2).translate(mastX, 9.0, mastZ), STEEL, 'mc-mast', 0.02);
    s.add(cylinder(0.11, 0.15, 2.6, 8).translate(mastX, 10.45, mastZ), STEEL, 'mc-mast', 0.02);
    s.add(box(2.4, 0.1, 0.12, 0.2).translate(mastX, 11.2, mastZ), STEEL, 'mc-mast', 0.02);
    const dish = cylinder(0.9, 0.22, 0.32, 10); dish.rotateX(-Math.PI / 2 + 0.35);
    s.add(dish.translate(mastX, 10.4, mastZ + 0.55), RADIATOR, 'mc-mast', 0.02);
    s.add(box(0.12, 0.12, 0.42, 0.2).translate(mastX, 10.35, mastZ + 0.24), STEEL, 'mc-mast', 0.02);
    s.add(cylinder(0.16, 0.16, 0.5, 8).translate(mastX, 11.95, mastZ), GRAPHITE, 'mc-mast', 0.02);
    s.add(markWorldBeacon(cylinder(0.22, 0.22, 0.3, 8)).translate(mastX, 12.35, mastZ), ORANGE, 'mc-mast', 0.02);
    return s.done();
  }

  // ------------------------------------------------------------------------------------------------- the greenhouse

  /**
   * The greenhouse: an inflatable grow tunnel on its bagged regolith sill: the film in pillows bulging between white
   * ribs, the ribs down to the sill, the ridge conduits, the airlock at its end and the nutrient plant at its side.
   */
  function greenhouse(rng: Rng): THREE.BufferGeometry {
    const s = station('greenhouse', rng);
    s.add(matte(box(8.4, 0.7, 16, 0.12)).translate(0, 0.35, 0), REGOLITH_DARK, 'gh-sill', 0.04);
    s.add(matte(box(7.6, 1.3, 15.6, 0.12)).translate(0, 1.3, 0), REGOLITH, 'gh-sill', 0.04);
    // the film: a pillow in each bay, bulging a little past the ribs
    const zs = [-7.7, -5.15, -2.58, 0, 2.58, 5.15, 7.7];
    for (let b = 0; b + 1 < zs.length; b++) {
      const film = new THREE.CylinderGeometry(3.8, 3.8, zs[b + 1] - zs[b] - 0.06, 16, 1, true, 0, Math.PI);
      film.rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 1.94, (zs[b] + zs[b + 1]) / 2);
      s.add(matte(film), b % 2 ? 0xc6dcd2 : 0xbfd6cc, 'gh-film', 0.02);
    }
    for (const z of zs) {
      const rib = new THREE.TorusGeometry(3.84, 0.08, 4, 14, Math.PI);
      s.add(rib.translate(0, 1.94, z), RADIATOR, 'gh-ribs', 0.02);
      for (const side of [-1, 1]) s.add(box(0.2, 1.6, 0.2, 0.2).translate(side * 3.84, 1.15, z), RADIATOR, 'gh-ribs', 0.02);
    }
    for (const side of [-1, 1]) s.add(box(0.14, 0.14, 15.6, 0.2).translate(side * 1.6, 1.94 + Math.sqrt(3.84 ** 2 - 1.6 ** 2), 0), STEEL, 'gh-conduit', 0.02);
    // the airlock at the +z end, its hatch frame and window
    s.add(matte(box(2.6, 2.8, 1.4, 0.12)).translate(0, 1.65, 8.1), SHELL, 'gh-airlock', 0.02);
    s.add(box(2.2, 0.28, 0.14, 0.2).translate(0, 2.85, 8.86), HATCH, 'gh-airlock', 0.02);
    s.port(0, 1.65, 8.84, [0, 0, 1], 'gh-airlock', 1.6, 2.0);
    // the nutrient plant at its side: a white box, its tank and pipes
    s.add(matte(box(1.9, 1.6, 3.0, 0.12)).translate(4.65, 0.8, -3), SHELL, 'gh-plant', 0.02);
    s.add(cylinder(0.42, 0.42, 1.1, 12).translate(4.65, 2.15, -3.7), BLANKET, 'gh-plant', 0.02);
    for (const z of [-3.8, -3.4, -3, -2.6, -2.2]) s.add(box(0.1, 1.1, 0.1, 0.2).translate(5.64, 0.9, z), STEEL, 'gh-plant', 0.02);
    return s.done();
  }

  // ------------------------------------------------------------------------------------------------- the ascent lander

  /**
   * The ascent vehicle on its pad: the sintered pad, four legs in primary and secondary struts down to their footpads,
   * the octagonal descent stage under its foil, the engine bell, the white ascent stage and its crew capsule with two
   * windows, the RCS quads, the ladder to the hatch and the antenna.
   */
  function ascentlander(rng: Rng): THREE.BufferGeometry {
    const s = station('ascentlander', rng);
    s.add(matte(cylinder(6.6, 6.8, 0.35, 8)).translate(0, 0.175, 0), REGOLITH_DARK, 'al-pad', 0.04);
    s.add(cylinder(3.6, 3.6, 0.04, 24).translate(0, 0.37, 0), HATCH, 'al-pad', 0.02);
    s.add(matte(cylinder(1.0, 1.75, 1.7, 18)).translate(0, 1.9, 0), GRAPHITE, 'al-engine', 0.02);
    s.add(matte(cylinder(3.1, 3.4, 3.0, 8)).translate(0, 4.25, 0), FOIL, 'al-descent', 0.03);
    s.add(cylinder(3.15, 3.15, 0.18, 8).translate(0, 5.84, 0), STEEL, 'al-descent', 0.02);
    for (const side of [-1, 1]) for (const zside of [-1, 1]) {
      const x = side * 4.6, z = zside * 4.6, leg = `al-leg-${side > 0 ? 'e' : 'w'}${zside > 0 ? 's' : 'n'}`;
      s.add(cylinder(0.85, 0.95, 0.22, 10).translate(x, 0.46, z), STEEL, leg, 0.02);
      s.add(bar([x, 0.55, z], [side * 2.4, 4.6, zside * 2.4], 0.24, box), STEEL, leg, 0.02);
      s.add(bar([x * 0.92, 0.9, z * 0.92], [side * 2.85, 3.1, zside * 1.1], 0.12, box), STEEL, leg, 0.02);
      s.add(bar([x * 0.92, 0.9, z * 0.92], [side * 1.1, 3.1, zside * 2.85], 0.12, box), STEEL, leg, 0.02);
    }
    s.add(matte(cylinder(2.65, 3.0, 2.9, 12)).translate(0, 7.4, 0), SHELL, 'al-ascent', 0.02);
    s.add(cylinder(3.04, 3.04, 0.3, 12).translate(0, 6.08, 0), FOIL, 'al-ascent', 0.02);
    s.add(matte(cylinder(1.35, 2.65, 1.7, 12)).translate(0, 9.7, 0), SHELL, 'al-capsule', 0.02);
    s.add(cylinder(1.36, 1.36, 0.35, 12).translate(0, 10.72, 0), STEEL, 'al-capsule', 0.02);
    for (const x of [-0.8, 0.8]) s.port(x, 9.55, 2.08, [0, 0, 1], 'al-capsule', 0.62, 0.5);
    for (const a of [0.4, 2.0, 3.6, 5.2]) {
      s.add(box(0.5, 0.5, 0.5, 0.2).translate(Math.cos(a) * 2.95, 8.2, Math.sin(a) * 2.95), GRAPHITE, 'al-rcs', 0.02);
    }
    // the ladder from the pad to the hatch on the +z side
    for (const x of [-0.53, 0.53]) {
      s.add(box(0.1, 5.8, 0.15, 0.2).translate(x, 3.25, 3.55), STEEL, 'al-ladder', 0.02);
      // its standoffs to the descent stage
      for (const y of [3.1, 5.4]) s.add(box(0.1, 0.1, 0.6, 0.2).translate(x, y, 3.2), STEEL, 'al-ladder', 0.02);
    }
    for (let y = 1; y < 6; y += 0.4) s.add(box(1.0, 0.07, 0.15, 0.2).translate(0, y, 3.55), STEEL, 'al-ladder', 0.02);
    s.add(box(0.14, 1.5, 0.14, 0.2).translate(0, 11.65, 0), STEEL, 'al-antenna', 0.02);
    s.add(box(1.9, 0.12, 0.12, 0.2).translate(0, 12.3, 0), STEEL, 'al-antenna', 0.02);
    return s.done();
  }

  // ------------------------------------------------------------------------------------------------- the rover garage

  /**
   * The rover garage: a vaulted hangar banked under bagged regolith, its white end wall with the two bays' doors in
   * orange frames, the apron before them and the charging post, the vents through the berm.
   */
  function rovergarage(rng: Rng): THREE.BufferGeometry {
    const s = station('rovergarage', rng);
    const R = 5.5, L = 15.2, yb = 0.45;
    s.add(matte(box(13, yb, 17, 0.1)).translate(0, yb / 2, 0), REGOLITH_DARK, 'rg-footing', 0.04);
    // the vault, banked under the bagged regolith in courses (a thick arc each)
    const courses = 5;
    for (let k = 0; k < courses; k++) {
      const a0 = (k * Math.PI) / (2 * courses), a1 = ((k + 1) * Math.PI) / (2 * courses);
      for (const side of [-1, 1]) {
        const arc = thickArc(R - 0.45, R, side > 0 ? a0 : Math.PI - a1, side > 0 ? a1 : Math.PI - a0, L - 0.4);
        s.add(matte(arc).translate(0, yb, -0.2), k % 2 ? REGOLITH : REGOLITH_DARK, 'rg-vault', 0.05);
      }
    }
    // the end wall at the front with the two doors in their frames, the back wall closed
    const wall = new THREE.CylinderGeometry(R - 0.05, R - 0.05, 0.3, 24, 1, false, -Math.PI / 2, Math.PI);
    wall.rotateX(-Math.PI / 2);
    s.add(matte(wall).translate(0, yb, L / 2 - 0.25), SHELL, 'rg-front', 0.02);
    for (const x of [-2.2, 2.2]) {
      s.add(box(3.0, 3.3, 0.12, 0.2).translate(x, yb + 1.65, L / 2 - 0.05), GRAPHITE, 'rg-front', 0.02);
      for (let y = yb + 0.5; y < yb + 3.2; y += 0.42) s.add(box(2.9, 0.05, 0.08, 0.2).translate(x, y, L / 2 + 0.03), STEEL, 'rg-front', 0.02);
      s.add(box(3.3, 0.22, 0.18, 0.2).translate(x, yb + 3.42, L / 2 + 0.0), HATCH, 'rg-front', 0.02);
      for (const side of [-1, 1]) s.add(box(0.16, 3.4, 0.18, 0.2).translate(x + side * 1.58, yb + 1.7, L / 2 + 0.0), HATCH, 'rg-front', 0.02);
    }
    const back = new THREE.CylinderGeometry(R - 0.05, R - 0.05, 0.3, 24, 1, false, -Math.PI / 2, Math.PI);
    back.rotateX(-Math.PI / 2);
    s.add(matte(back).translate(0, yb, -L / 2 + 0.05), REGOLITH_DARK, 'rg-back', 0.04);
    // the apron and the charging post
    s.add(matte(box(10.4, 0.12, 0.8, 0.12)).translate(0, yb + 0.06, L / 2 + 0.45), STEEL, 'rg-apron', 0.02);
    s.add(box(0.4, 1.5, 0.4, 0.2).translate(5.2, yb + 0.75, L / 2 + 0.45), SHELL, 'rg-charger', 0.02);
    s.add(box(0.46, 0.2, 0.46, 0.2).translate(5.2, yb + 1.6, L / 2 + 0.45), HATCH, 'rg-charger', 0.02);
    // the vents through the berm's crown
    for (const z of [-4, 2]) {
      s.add(cylinder(0.35, 0.35, 0.9, 10).translate(0, yb + R + 0.2, z), STEEL, 'rg-vents', 0.02);
      s.add(cylinder(0.5, 0.42, 0.14, 10).translate(0, yb + R + 0.72, z), GRAPHITE, 'rg-vents', 0.02);
    }
    return s.done();
  }

  // ------------------------------------------------------------------------------------------------- the dome habitat

  /**
   * The dome habitat: a regolith shell printed in stepped courses on its footing ring, an inflatable white cupola in
   * its crown with the skylight's windows, the pressurised tunnel to its airlock and hatch, the antenna.
   */
  function habdome(rng: Rng): THREE.BufferGeometry {
    const s = station('habdome', rng);
    s.add(matte(cylinder(6.85, 7.0, 0.42, 28)).translate(0, 0.21, 0), REGOLITH_DARK, 'hd-footing', 0.04);
    const courses = 8, r0 = 6.4, top = 6.1, cupola = 1.75;
    for (let k = 0; k < courses; k++) {
      const t0 = k / courses, t1 = (k + 1) / courses;
      const ra = r0 * Math.cos((t0 * Math.PI) / 2) + cupola * Math.sin((t0 * Math.PI) / 2) * 0.0;
      const rb = r0 * Math.cos((t1 * Math.PI) / 2);
      const y0 = 0.42 + top * Math.sin((t0 * Math.PI) / 2), y1 = 0.42 + top * Math.sin((t1 * Math.PI) / 2);
      const rr0 = Math.max(cupola, ra), rr1 = Math.max(cupola, rb);
      s.add(matte(cylinder(rr1, rr0, y1 - y0, 30)).translate(0, (y0 + y1) / 2, 0), k % 2 ? REGOLITH : REGOLITH_DARK, 'hd-shell', 0.04);
    }
    const crown = 0.42 + top;
    const cup = new THREE.SphereGeometry(cupola + 0.05, 18, 7, 0, Math.PI * 2, 0, Math.PI / 2);
    s.add(matte(cup).translate(0, crown - 0.02, 0), SHELL, 'hd-cupola', 0.02);
    s.port(0, crown + 0.75, cupola * 0.94, [0, 0, 1], 'hd-cupola', 0.5, 0.36);
    s.port(cupola * 0.94, crown + 0.75, 0, [1, 0, 0], 'hd-cupola', 0.5, 0.36);
    s.add(cylinder(0.08, 0.1, 1.2, 8).translate(-0.6, crown + 2.2, -0.4), STEEL, 'hd-antenna', 0.02);
    // the tunnel to the airlock on +z and its hatch
    const tunnel = cylinder(1.15, 1.15, 1.8, 16); tunnel.rotateX(Math.PI / 2);
    s.add(matte(tunnel).translate(0, 1.55, r0 + 0.6), SHELL, 'hd-tunnel', 0.02);
    s.add(cylinder(1.22, 1.22, 0.2, 16).rotateX(Math.PI / 2).translate(0, 1.55, r0 + 0.05), FOIL, 'hd-tunnel', 0.02);
    s.add(matte(box(2.5, 2.6, 0.7, 0.12)).translate(0, 1.72, r0 + 1.85), SHELL, 'hd-airlock', 0.02);
    s.add(box(1.7, 2.1, 0.12, 0.2).translate(0, 1.5, r0 + 2.24), HATCH, 'hd-airlock', 0.02);
    s.port(0, 1.4, r0 + 2.34, [0, 0, 1], 'hd-airlock', 1.2, 1.7);
    return s.done();
  }

  // ------------------------------------------------------------------------------------------------- the hab module

  /**
   * The pressure module: a white composite drum on two saddles, shielded over its crown by a cover of bagged regolith,
   * its domed ends under quilted blanket with gold foil at the joints, the hatch in an orange frame, three windows a
   * side under the cover's eaves, the umbilical along its flank.
   */
  function habmodule(rng: Rng): THREE.BufferGeometry {
    const s = station('habmodule', rng);
    const r = 2.15, len = 8.0, yc = 0.8 + r;
    for (const z of [-2.5, 2.5]) {
      s.add(matte(box(5.4, 0.3, 0.8, 0.12)).translate(0, 0.15, z), STEEL, `hm-saddle-${z > 0 ? 's' : 'n'}`, 0.02);
      s.add(thickArc(r, r + 0.12, -Math.PI * 0.82, -Math.PI * 0.18, 0.6).translate(0, yc, z), STEEL, `hm-saddle-${z > 0 ? 's' : 'n'}`, 0.02);
      for (const x of [-1.4, 0, 1.4]) {
        const top = yc - Math.sqrt((r + 0.12) ** 2 - x * x) + 0.06;
        s.add(box(0.22, top - 0.3, 0.22, 0.2).translate(x, 0.3 + (top - 0.3) / 2, z), STEEL, `hm-saddle-${z > 0 ? 's' : 'n'}`, 0.02);
      }
    }
    const body = cylinder(r, r, len, 20); body.rotateX(Math.PI / 2);
    s.add(matte(body).translate(0, yc, 0), SHELL, 'hm-shell', 0.02);
    for (const z of [-len / 2 + 0.2, -1.2, 1.2, len / 2 - 0.2]) {
      const ring = cylinder(r + 0.03, r + 0.03, 0.26, 20); ring.rotateX(Math.PI / 2);
      s.add(ring.translate(0, yc, z), FOIL, 'hm-shell', 0.02);
    }
    for (const side of [-1, 1]) for (const z of [-2.2, 0, 2.2]) s.port(side * (r + 0.02), yc + 0.15, z, [side, 0, 0], 'hm-shell', 0.42, 0.42);
    for (const end of [-1, 1]) {
      const cap = new THREE.SphereGeometry(r, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      cap.scale(1, 0.32, 1).rotateX(end * Math.PI / 2);
      s.add(matte(cap).translate(0, yc, end * len / 2), BLANKET, `hm-end-${end > 0 ? 's' : 'n'}`, 0.03);
    }
    s.add(box(1.4, 1.95, 0.14, 0.2).translate(0, yc - 0.3, len / 2 + r * 0.32 - 0.02), HATCH, 'hm-hatch', 0.02);
    s.port(0, yc - 0.32, len / 2 + r * 0.32 + 0.06, [0, 0, 1], 'hm-hatch', 1.0, 1.55);
    // the regolith cover over the crown, in courses of bags, clear of the windows
    const cover = 4;
    for (let k = 0; k < cover; k++) {
      const a0 = Math.PI * 0.2 + (k * Math.PI * 0.6) / cover, a1 = Math.PI * 0.2 + ((k + 1) * Math.PI * 0.6) / cover;
      s.add(matte(thickArc(r + 0.01, r + 0.36, a0, a1, len - 0.6, 4)).translate(0, yc, 0), k % 2 ? REGOLITH : REGOLITH_DARK, 'hm-cover', 0.05);
    }
    // the umbilical down its flank to the ground box
    s.add(box(0.16, 0.16, len - 1.2, 0.2).translate(-r - 0.1, yc - 0.9, 0), GRAPHITE, 'hm-umbilical', 0.02);
    s.add(box(0.16, yc - 0.9, 0.16, 0.2).translate(-r - 0.1, (yc - 0.9) / 2, -len / 2 + 0.6), GRAPHITE, 'hm-umbilical', 0.02);
    s.add(box(0.6, 0.6, 0.5, 0.2).translate(-r - 0.25, 0.3, -len / 2 + 0.6), STEEL, 'hm-umbilical', 0.02);
    return s.done();
  }

  // ------------------------------------------------------------------------------------------------- the comms mast

  /** The communications mast: a triangular lattice on its footing, the dish on its arm, the warning light at the top. */
  function commsmast(rng: Rng): THREE.BufferGeometry {
    const s = station('commsmast', rng);
    s.add(matte(box(3.6, 0.6, 3.6, 0.12)).translate(0, 0.3, 0), REGOLITH_DARK, 'cm-footing', 0.04);
    s.add(box(1.2, 0.5, 0.9, 0.2).translate(1.0, 0.85, 1.0), SHELL, 'cm-cabinet', 0.02);
    buildLatticeMast({
      x: 0, z: 0, baseY: 0.6, height: 13.2, face: 0.62, section: 2.2, pole: 1.1,
      dish: { leg: 0, level: 0.66, radius: 0.85 },
    }, (geo, color, piece) => s.add(geo, color, `cm-${piece}`, 0.02));
    return s.done();
  }

  // ------------------------------------------------------------------------------------------------- the solar array

  /** A field of tracking panels: three rows, each a torque tube on its posts under a dusty panel, the inverter. */
  function solararray(rng: Rng): THREE.BufferGeometry {
    const s = station('solararray', rng);
    for (const z of [-3.1, 0, 3.1]) {
      const row = `sa-row-${z < 0 ? 0 : z > 0 ? 2 : 1}`;
      for (const x of [-3.6, 0, 3.6]) {
        s.add(box(0.5, 0.12, 0.5, 0.2).translate(x, 0.06, z), STEEL, row, 0.02);
        s.add(box(0.18, 1.98, 0.18, 0.2).translate(x, 1.11, z), STEEL, row, 0.02);
      }
      const tube = cylinder(0.12, 0.12, 9.0, 10); tube.rotateZ(Math.PI / 2);
      s.add(tube.translate(0, 2.18, z), STEEL, row, 0.02);
      const panel = box(9.2, 0.08, 2.4, 0.3); panel.rotateX(-0.42);
      s.add(panel.translate(0, 2.33, z), CELL, row, 0.03);
      // its aluminium frame's long edges
      for (const side of [-1, 1]) {
        const edge = box(9.2, 0.1, 0.05, 0.2); edge.translate(0, 0, side * 1.2).rotateX(-0.42);
        s.add(edge.translate(0, 2.34, z), STEEL, row, 0.02);
      }
    }
    s.add(box(0.8, 1.0, 0.6, 0.2).translate(4.3, 0.5, 3.1), SHELL, 'sa-inverter', 0.02);
    s.add(box(0.12, 0.12, 6.2, 0.2).translate(4.3, 0.06, 0), GRAPHITE, 'sa-inverter', 0.02);
    return s.done();
  }

  // ------------------------------------------------------------------------------------------------- the fuel tanks

  /** Two propellant spheres under blanket on four-legged cradles, gold foil at their equators, the piping and valves. */
  function fueltanks(rng: Rng): THREE.BufferGeometry {
    const s = station('fueltanks', rng);
    const r = 1.95, yc = 0.95 + r;
    for (const z of [-2.65, 2.65]) {
      const t = `ft-tank-${z < 0 ? 'n' : 's'}`;
      s.add(matte(box(5.0, 0.3, 4.1, 0.12)).translate(0, 0.15, z + Math.sign(z) * 0.0), REGOLITH_DARK, t, 0.04);
      const ringY = yc - 1.0, ringR = Math.sqrt(r * r - 1.0) + 0.04;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        s.add(bar([sx * 1.25, 0.3, z + sz * 1.25], [sx * ringR * Math.SQRT1_2, ringY, z + sz * ringR * Math.SQRT1_2], 0.16, box), STEEL, t, 0.02);
      }
      s.add(new THREE.TorusGeometry(ringR, 0.09, 6, 22).rotateX(Math.PI / 2).translate(0, ringY, z), STEEL, t, 0.02);
      s.add(matte(new THREE.SphereGeometry(r, 20, 14)).translate(0, yc, z), BLANKET, t, 0.03);
      s.add(cylinder(r + 0.03, r + 0.03, 0.26, 20).translate(0, yc, z), FOIL, t, 0.02);
      s.add(cylinder(0.14, 0.14, 0.45, 8).translate(0, yc + r + 0.15, z), STEEL, t, 0.02);
      s.add(cylinder(0.2, 0.2, 0.1, 8).translate(0, yc + r + 0.41, z), HATCH, t, 0.02);
    }
    s.add(box(0.2, 0.2, 2.6, 0.2).translate(0, yc - 1.25, 0), STEEL, 'ft-piping', 0.02);
    for (const z of [-0.5, 0.5]) s.add(cylinder(0.2, 0.2, 0.3, 8).rotateX(Math.PI / 2).translate(0, yc - 1.25, z), HATCH, 'ft-piping', 0.02);
    s.add(box(0.2, yc - 1.25, 0.2, 0.2).translate(0, (yc - 1.25) / 2, 0), STEEL, 'ft-piping', 0.02);
    s.add(box(1.2, 1.1, 0.9, 0.2).translate(2.0, 0.55, 0), SHELL, 'ft-control', 0.02);
    return s.done();
  }

  // ------------------------------------------------------------------------------------------------- the landing pad

  /**
   * The landing pad: a sintered octagon tiled in rings, its target, six blast berms of bagged regolith round its rim,
   * the edge lights, the pad controller's hut with its window and the warning light on its mast.
   */
  function landingpad(rng: Rng): THREE.BufferGeometry {
    const s = station('landingpad', rng);
    const r = 9.1;
    s.add(matte(cylinder(r, r + 0.2, 0.45, 8)).translate(0, 0.225, 0), REGOLITH_DARK, 'lp-pad', 0.03);
    for (const rr of [6.6, 4.8]) s.add(cylinder(rr, rr, 0.04, 8).translate(0, 0.47, 0), GRAPHITE, 'lp-pad', 0.02);
    s.add(cylinder(3.2, 3.2, 0.06, 24).translate(0, 0.49, 0), HATCH, 'lp-pad', 0.02);
    s.add(cylinder(2.7, 2.7, 0.07, 24).translate(0, 0.5, 0), REGOLITH_DARK, 'lp-pad', 0.02);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      s.add(box(0.36, 0.28, 0.36, 0.2).translate(Math.cos(a) * (r - 1.9), 0.59, Math.sin(a) * (r - 1.9)), RADIATOR, 'lp-lights', 0.02);
    }
    // the blast berms round the rim, gaps at the hut and the approach
    for (let i = 0; i < 6; i++) {
      if (i === 0) continue;
      const a = (i / 6) * Math.PI * 2;
      const g = matte(prism([[-0.6, 0], [0.6, 0], [0.22, 0.95], [-0.22, 0.95]], 4.6));
      // (its length round the rim: local z turned tangent, its section radial)
      g.rotateY(-a);
      s.add(g.translate(Math.cos(a) * (r - 0.75), 0.45, Math.sin(a) * (r - 0.75)), i % 2 ? REGOLITH : REGOLITH_DARK, `lp-berm-${i}`, 0.05);
    }
    // the controller's hut on the apron edge with its window, the mast and its light
    const hx = r - 2.6;
    s.add(matte(box(2.6, 2.4, 3.2, 0.12)).translate(hx, 1.65, 0), SHELL, 'lp-hut', 0.02);
    s.add(box(2.7, 0.18, 3.3, 0.2).translate(hx, 2.94, 0), STEEL, 'lp-hut', 0.02);
    s.port(hx - 1.32, 2.0, 0, [-1, 0, 0], 'lp-hut', 2.0, 0.8);
    s.add(cylinder(0.12, 0.15, 3.4, 8).translate(hx, 3.03 + 1.7, -1.0), STEEL, 'lp-hut', 0.02);
    s.add(cylinder(0.2, 0.2, 0.3, 8).translate(hx, 3.03 + 3.4 + 0.15, -1.0), ORANGE, 'lp-hut', 0.02);
    return s.done();
  }

  /**
   * The greenhouse broken (the facades lane, 2026-10-08; the scenery lane's broken-state audit scored the shared debris
   * 2/5). Its glazing is gone from the frame: the base and the lower walls stand, and the ribs stand bent (a few down
   * to half their height, one fallen across), with a strip of the shell still hanging at one eave. The panes lie in
   * shards round it and the ridge rails are down. The airlock and the side module stand, the airlock's window broken
   * out.
   */
  function greenhouseBroken(rng: Rng): THREE.BufferGeometry {
    const a = assembly(rng);
    a.block(8.4, .7, 16, 0, .35, 0, FRAME);
    a.block(7.6, 1.3, 15.6, 0, 1.3, 0);
    const zs = [-7.7, -5.15, -2.58, 0, 2.58, 5.15, 7.7];
    const fallen = Math.floor(rng() * zs.length);
    zs.forEach((z, k) => {
      a.block(.24, 1.6, .24, -3.83, 1.15, z);
      a.block(.24, 1.6, .24, 3.83, 1.15, z);
      if (k === fallen) {
        const rib = new THREE.TorusGeometry(3.83, .11, 5, 18, Math.PI);
        rib.rotateX(Math.PI / 2 - .25).translate(0, 2.25, z + (rng() < .5 ? 1.4 : -1.4));
        a.add(rib);
        return;
      }
      const rib = new THREE.TorusGeometry(3.83, .11, 5, 18, Math.PI);
      rib.scale(1 + rng() * .06, .55 + rng() * .45, 1).rotateZ((rng() - .5) * .16);
      a.add(rib.translate(0, 1.94, z));
    });
    // a strip of the shell still hanging at one eave
    const side = rng() < .5 ? 1 : -1;
    const strip = new THREE.CylinderGeometry(3.8, 3.8, 5 + rng() * 4, 16, 1, false, 0, Math.PI * .22);
    strip.rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
    if (side < 0) strip.rotateZ(Math.PI * .78);
    a.add(strip.translate(0, 1.94, (rng() - .5) * 6), GLASS);
    // the panes in shards round it, the ridge rails down
    for (let i = 0; i < 26; i++) {
      const ang = rng() * Math.PI * 2, r = 3.4 + rng() * 2.8;
      const shard = box(.4 + rng() * .9, .03, .3 + rng() * .7);
      shard.rotateY(rng() * Math.PI).rotateX((rng() - .5) * .5);
      a.add(shard.translate(Math.cos(ang) * r, .06 + rng() * .1, Math.sin(ang) * r * 1.9), GLASS);
    }
    for (const s of [-1, 1]) {
      const rail = box(.16, .16, 15.6);
      rail.rotateZ((rng() - .5) * .3).rotateY((rng() - .5) * .08);
      a.add(rail.translate(s * (3.2 + rng() * 1.4), .12, (rng() - .5) * 1.2), FRAME);
    }
    a.block(2.6, 2.8, 1.4, 0, 1.65, 8.1);
    a.block(1.6, 2.0, .08, 0, 1.65, 8.84, DARK);
    a.block(2.2, .28, .14, 0, 2.85, 8.86, ORANGE);
    a.block(1.9, 1.6, 3.0, 4.65, .8, -3, WHITE);
    return merge(a.out);
  }

  return { missioncontrol, greenhouse, greenhouseBroken, ascentlander, rovergarage, habdome, habmodule, commsmast, solararray, fueltanks, landingpad };
}
