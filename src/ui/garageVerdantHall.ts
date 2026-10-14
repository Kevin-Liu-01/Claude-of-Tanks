// src/ui/garageVerdantHall.ts — Verdant Motor Pool's hall built as a building (the garage redesign, round 7, GA.05,
// 2026-10-14). Waves 402-424 and the props census (#20, garage:field_shed grade 1): "a windowless corrugated box with a
// hard bright seam at the floor line"; census: "steel portal columns at each truss line (I-sections with base plates and
// haunches) and wall girts carrying profiled sheeting with real corrugation; a concrete upstand with thickness and a
// chamfered top; a vehicle door with frame, guides and a head box, partly raised so daylight and the yard show beyond;
// a personnel door with frame and reveal; clerestory glazing in frames with reveals; skylights as framed glazing".
//
// Everything here is DOM-free geometry in the stage's authored frame (before the indoor half-turn): walls at x, z = ±HW,
// the floor at y = 0, the roof at y = WALL_H. The stage wraps each part in a material it already compiles (the wall map
// program, the roof map program and the outdoor packs' vertex-colour, glass programs seeded under the boot cover), so the
// hall adds no shader program. The canonical camera looks at the authored east and south walls (after the half-turn,
// the far corner behind the hero), so they carry the openings; the north and west walls carry the floods, signs and
// pipes and keep their sheeting whole.
import * as THREE from 'three';

import {
  addChannelGirt, addColumnBase, addFramedGlazing, addISectionColumn, addPersonnelDoor, addProfiledSheeting,
  addUpstand, hallWallFrame, HallMesh, type HallOpening,
} from './garageHallKit.ts';

export interface VerdantHallParts {
  /** Profiled wall sheeting with UVs for the wall map (repeat 3 x 1 over a 46 x 10 m wall). */
  readonly sheeting: HallMesh;
  /** Profiled roof sheeting (ribs across the purlins) with UVs for the roof deck map (repeat 4 x 4). */
  readonly roof: HallMesh;
  /** Painted structural steel, door leaves and fittings: vertex colour. */
  readonly steel: HallMesh;
  /** The concrete upstand and the floor drain's channel: vertex colour. */
  readonly concrete: HallMesh;
  /** Glazing in the clerestories and the roof lights. */
  readonly glass: HallMesh;
  /** The apron, fields and woods outside the openings: vertex colour, receives shadow only. */
  readonly exterior: HallMesh;
  readonly stats: Readonly<{
    openings: number;
    columns: number;
    girts: number;
    glazedLights: number;
    skylights: number;
  }>;
}

type WallId = 'north' | 'south' | 'west' | 'east';

interface WallPlan {
  readonly id: WallId;
  readonly origin: readonly [number, number, number];
  readonly yaw: number;
  /** Columns carry the trusses (east, west) or stand as gable wind posts (north, south). */
  readonly bearing: boolean;
  readonly openings: HallOpening[];
}

/** Steel and concrete tones (sRGB), warm neutral: the hall must not read navy (wave 402). */
const TONE = Object.freeze({
  column: 0x5b605e,
  girt: 0x6a6d68,
  base: 0x3f413f,
  grout: 0x8d8a82,
  frame: 0x4e5251,
  flashing: 0x777a74,
  shutter: 0x8b8e86,
  shutterRib: 0x6f726c,
  leaf: 0x51624f,
  kick: 0x7c7f79,
  safety: 0xb38a24,
  upstand: 0x8b877d,
  upstandStain: 0x6c6961,
  drain: 0x1e1f1e,
  grating: 0x4a4d4c,
});

const UPSTAND_H = 1.2;
const UPSTAND_FACE = 0.06;
const UPSTAND_T = 0.25;
const COLUMN_W = 0.28; // the bearing columns' web centre (in front of the girts)

/** Build the hall's shell, roof lights and the view out of its openings. */
export function buildVerdantHallParts(halfWidth: number, wallHeight: number): VerdantHallParts {
  const HW = halfWidth;
  const L = 2 * HW;
  const sheeting = new HallMesh();
  const roof = new HallMesh();
  const steel = new HallMesh();
  const concrete = new HallMesh();
  const glass = new HallMesh();
  const exterior = new HallMesh();
  let openings = 0, columns = 0, girts = 0, glazedLights = 0;

  // the truss lines (stage roof: five trusses at z = -18 .. 18) and the gable wind posts at the same rhythm
  const lines = [5, 14, 23, 32, 41];
  const walls: WallPlan[] = [
    { id: 'north', origin: [-HW, 0, -HW], yaw: 0, bearing: false, openings: [] },
    { id: 'south', origin: [HW, 0, HW], yaw: Math.PI, bearing: false, openings: [] },
    { id: 'west', origin: [-HW, 0, HW], yaw: Math.PI / 2, bearing: true, openings: [] },
    { id: 'east', origin: [HW, 0, -HW], yaw: -Math.PI / 2, bearing: true, openings: [] },
  ];
  const wall = (id: WallId): WallPlan => walls.find((plan) => plan.id === id)!;

  // --- openings -------------------------------------------------------------------------------------------------------
  // South (the canonical frame's right wall, behind the mezzanine): a roller shutter under the deck, between the
  // mezzanine's columns at x 0 and 9 (u 14 and 23), raised to 2.4 m; a personnel door beside it; a clerestory band
  // above the mezzanine rails (5.6 m) and the perimeter tray (6.6 m) in every bay.
  const shutter: HallOpening = { u0: 16.5, u1: 22.1, y0: 0, y1: 4.0 };
  const personnel: HallOpening = { u0: 11.5, u1: 12.5, y0: 0, y1: 2.15 };
  wall('south').openings.push(shutter, personnel);
  const bayEdges = [0.55, ...lines.flatMap((u) => [u - 0.42, u + 0.42]), L - 0.55];
  const bays: Array<[number, number]> = [];
  for (let index = 0; index < bayEdges.length; index += 2) bays.push([bayEdges[index], bayEdges[index + 1]]);
  const southBand: HallOpening[] = bays.map(([u0, u1]) => ({ u0: u0 + 0.25, u1: u1 - 0.25, y0: 6.95, y1: 8.6 }));
  wall('south').openings.push(...southBand);
  // East and west (the frame's left wall and its twin): a high clerestory above the crane runway (7.75-8.2 m) and
  // under the eaves, between the truss columns.
  const highBand = (): HallOpening[] => bays
    .filter(([u0, u1]) => u1 - u0 > 4)
    .map(([u0, u1]) => ({ u0: u0 + 0.35, u1: u1 - 0.35, y0: 8.5, y1: 9.55 }));
  wall('east').openings.push(...highBand());
  wall('west').openings.push(...highBand());
  // North carries the two wall floods (x -6 and 7: u 17 and 30) and a sign: its clerestory skips those bays.
  const northBand: HallOpening[] = bays
    .filter(([u0, u1]) => !(u0 < 17.6 && u1 > 16.4) && !(u0 < 30.6 && u1 > 29.4) && u1 - u0 > 4)
    .map(([u0, u1]) => ({ u0: u0 + 0.25, u1: u1 - 0.25, y0: 7.45, y1: 8.75 }));
  wall('north').openings.push(...northBand);

  for (const plan of walls) {
    const frame = hallWallFrame(plan.origin, plan.yaw);
    for (const mesh of [sheeting, steel, concrete, glass]) mesh.setFrame(frame);
    // --- concrete upstand with a chamfered cap, cut at the doors -------------------------------------------------------
    concrete.setColor(TONE.upstand);
    addUpstand(concrete, 0, L, UPSTAND_H, UPSTAND_FACE, UPSTAND_T, plan.openings.filter((o) => o.y0 < UPSTAND_H));
    // a darker splash band where the floor washes against it (a separate skin 2 mm proud, under the chamfer)
    concrete.setColor(TONE.upstandStain);
    for (const [a, b] of runsBetween(0, L, plan.openings.filter((o) => o.y0 < 0.3))) {
      concrete.quad([a, 0, UPSTAND_FACE + 0.002], [b, 0, UPSTAND_FACE + 0.002], [b, 0.22, UPSTAND_FACE + 0.002], [a, 0.22, UPSTAND_FACE + 0.002]);
    }
    // --- profiled sheeting from the upstand's cap to the eaves -----------------------------------------------------------
    sheeting.uvScale = [L, wallHeight]; // the map repeats 3 x 1 across a wall, as the plane walls did
    addProfiledSheeting(sheeting, 0, L, UPSTAND_H - 0.02, wallHeight, plan.openings, { pitch: 0.25, depth: 0.04 });
    // --- columns, bases, knee braces, tray and runway brackets ----------------------------------------------------------
    const columnU = plan.bearing ? [0.32, ...lines, L - 0.32] : lines;
    for (const u of columnU) {
      const corner = u < 1 || u > L - 1;
      const depth = plan.bearing ? 0.4 : 0.3;
      const w = 0.08 + depth / 2;
      steel.setColor(TONE.base);
      addColumnBase(steel, u, w, { plate: depth + 0.12, grout: depth + 0.24 });
      steel.setColor(TONE.column);
      addISectionColumn(steel, u, w, 0.07, wallHeight - 0.1, { flange: plan.bearing ? 0.3 : 0.25, depth });
      columns += 1;
      if (plan.bearing && !corner) {
        // the knee brace from the column into the truss's bottom chord (8.66 m), a gusset at each end
        steel.beam([u, 7.55, w + depth / 2], [u, 8.55, w + 1.55], 0.12, 0.1);
        steel.box([u, 8.55, w + 1.5], [0.012, 0.32, 0.36]);
        steel.box([u, 7.62, w + depth / 2 + 0.08], [0.012, 0.36, 0.2]);
        // the crane runway's corbel (runway beam at x ±21, 7.75-8.17 m: 1.79-2.21 m into the room)
        steel.setColor(TONE.girt);
        steel.box([u, 7.6, w + 0.98], [0.22, 0.26, 1.56]);
        steel.beam([u, 6.75, w + depth / 2], [u, 7.47, w + 1.62], 0.1);
        steel.setColor(TONE.column);
      }
      if (!corner) {
        // the perimeter cable tray's bracket (tray at 1.25 m from the wall, 6.56-6.68 m): an arm and a strut
        steel.setColor(TONE.girt);
        steel.box([u, 6.5, w + depth / 2 + 0.45], [0.06, 0.06, 0.95]);
        steel.beam([u, 6.05, w + depth / 2], [u, 6.47, w + depth / 2 + 0.8], 0.045);
        steel.setColor(TONE.column);
      }
    }
    // --- girts: channels between the columns, cut where an opening crosses them -----------------------------------------
    steel.setColor(TONE.girt);
    const girtYs = [3.25, 5.35, wallHeight - 0.42];
    for (const y of girtYs) {
      const posts = [0, ...columnU, L].sort((a, b) => a - b);
      for (let index = 0; index < posts.length - 1; index += 1) {
        const a = posts[index] + (index === 0 ? 0 : 0.16), b = posts[index + 1] - (index === posts.length - 2 ? 0 : 0.16);
        for (const [s0, s1] of runsBetween(a, b, plan.openings.filter((o) => o.y0 < y + 0.1 && o.y1 > y - 0.1))) {
          if (s1 - s0 < 0.3) continue;
          addChannelGirt(steel, s0, s1, y, 0.045);
          girts += 1;
        }
      }
    }
    // --- glazing: every opening above the doors is a clerestory light -------------------------------------------------
    for (const opening of plan.openings) {
      if (opening.y0 < 1) continue;
      steel.setColor(TONE.frame);
      addFramedGlazing(steel, glass, opening, { bay: 1.4 });
      glazedLights += Math.max(1, Math.round((opening.u1 - opening.u0) / 1.4)) * 2;
      // the sheeting's cut edge under a flashing: a jamb trim on both sides, proud of the ribs
      steel.setColor(TONE.flashing);
      for (const u of [opening.u0 - 0.04, opening.u1 + 0.04]) steel.box([u, (opening.y0 + opening.y1) / 2, 0.035], [0.08, opening.y1 - opening.y0 + 0.12, 0.04]);
    }
    openings += plan.openings.length;
  }

  // --- the roller shutter and the personnel door (south) -------------------------------------------------------------
  {
    const frame = hallWallFrame(wall('south').origin, wall('south').yaw);
    steel.setFrame(frame);
    concrete.setFrame(frame);
    addRollerShutter(steel, shutter, 2.45);
    addPersonnelDoor(steel, personnel, { frameColor: TONE.frame, leafColor: TONE.leaf, kickColor: TONE.kick });
    // the door's own canopy outside is not seen; a wall light over it inside is
    steel.setColor(TONE.frame);
    steel.box([(personnel.u0 + personnel.u1) / 2, 2.55, 0.12], [0.34, 0.16, 0.2]);
    // a trench drain with a grating across the shutter's threshold, inside: channel and edge angles in the floor
    const drainW = 0.32, drainAt = 0.62;
    concrete.setColor(TONE.drain);
    concrete.quad([shutter.u0 - 0.3, 0.003, drainAt + drainW / 2], [shutter.u1 + 0.3, 0.003, drainAt + drainW / 2],
      [shutter.u1 + 0.3, 0.003, drainAt - drainW / 2], [shutter.u0 - 0.3, 0.003, drainAt - drainW / 2]);
    steel.setColor(TONE.grating);
    for (const side of [-1, 1]) steel.box([(shutter.u0 + shutter.u1) / 2, 0.012, drainAt + side * (drainW / 2 + 0.02)], [shutter.u1 - shutter.u0 + 0.64, 0.024, 0.04]);
    for (let u = shutter.u0 - 0.24; u < shutter.u1 + 0.3; u += 0.075) steel.box([u, 0.014, drainAt], [0.022, 0.026, drainW]);
    // safety bollards each side of the shutter, cast in a collar
    steel.setColor(TONE.safety);
    for (const u of [shutter.u0 - 0.55, shutter.u1 + 0.55]) {
      steel.box([u, 0.6, 0.55], [0.17, 1.2, 0.17]);
      concrete.setColor(TONE.upstandStain);
      concrete.box([u, 0.02, 0.55], [0.34, 0.04, 0.34], { skip: ['ny'] });
    }
  }

  // --- roof: profiled sheeting across the purlins with three real roof lights --------------------------------------
  let skylights = 0;
  {
    // local u along world +z from z = -HW, local y along world -x from x = +HW, w down into the hall
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0));
    basis.setPosition(HW, wallHeight, -HW);
    const lights = [-11.5, 0, 11.5].map((x) => ({ u0: 1, u1: L - 1, y0: HW - x - 1.2, y1: HW - x + 1.2 }));
    roof.setFrame(basis);
    roof.uvScale = [L, L];
    addProfiledSheeting(roof, 0, L, 0, L, lights, { pitch: 0.3, depth: 0.045 });
    steel.setFrame(basis);
    glass.setFrame(basis);
    for (const light of lights) {
      // the upstand curb round the light (a reveal 0.3 m deep seen from below), glazing bars every 1.5 m, the glass
      steel.setColor(TONE.flashing);
      const cu = (light.u0 + light.u1) / 2, cy = (light.y0 + light.y1) / 2;
      for (const y of [light.y0 - 0.05, light.y1 + 0.05]) steel.box([cu, y, -0.15], [light.u1 - light.u0 + 0.2, 0.1, 0.3]);
      for (const u of [light.u0 - 0.05, light.u1 + 0.05]) steel.box([u, cy, -0.15], [0.1, light.y1 - light.y0 + 0.2, 0.3]);
      steel.setColor(TONE.frame);
      for (let u = light.u0 + 1.5; u < light.u1 - 0.5; u += 1.5) steel.box([u, cy, -0.3], [0.06, light.y1 - light.y0, 0.08]);
      steel.box([cu, cy, -0.3], [light.u1 - light.u0, 0.06, 0.08]);
      glass.quad([light.u0, light.y0, -0.33], [light.u1, light.y0, -0.33], [light.u1, light.y1, -0.33], [light.u0, light.y1, -0.33]);
      skylights += 1;
    }
  }

  buildExterior(exterior, HW);
  return {
    sheeting, roof, steel, concrete, glass, exterior,
    stats: Object.freeze({ openings, columns, girts, glazedLights, skylights }),
  };
}

/** The [a, b] runs left between openings that cross a band (sorted, merged). */
function runsBetween(a: number, b: number, openings: readonly HallOpening[]): Array<[number, number]> {
  const cuts = openings.filter((o) => o.u1 > a && o.u0 < b).map((o) => [Math.max(a, o.u0), Math.min(b, o.u1)] as [number, number])
    .sort((x, y) => x[0] - y[0]);
  const runs: Array<[number, number]> = [];
  let at = a;
  for (const [c0, c1] of cuts) {
    if (c0 > at + 1e-3) runs.push([at, c0]);
    at = Math.max(at, c1);
  }
  if (b > at + 1e-3) runs.push([at, b]);
  return runs;
}

/**
 * A steel roller shutter: channel guides up the jambs, the coil in its hood at the head with end plates, the curtain of
 * curved slats hanging from the hood to `openY` with a bottom rail and a pull handle; a push-button box on the jamb.
 */
function addRollerShutter(mesh: HallMesh, opening: HallOpening, openY: number): void {
  const { u0, u1, y0, y1 } = opening;
  const width = u1 - u0, cu = (u0 + u1) / 2;
  mesh.setColor(TONE.frame);
  for (const u of [u0 - 0.06, u1 + 0.06]) {
    mesh.box([u, (y0 + y1) / 2 + 0.05, 0.11], [0.12, y1 - y0 + 0.1, 0.12], { skip: ['ny'] });
    mesh.box([u, (y0 + y1) / 2 + 0.05, 0.05], [0.2, y1 - y0 + 0.1, 0.02], { skip: ['ny'] });
  }
  // the hood over the coil, its end plates and the motor on one end
  mesh.box([cu, y1 + 0.36, 0.28], [width + 0.5, 0.62, 0.5]);
  for (const u of [u0 - 0.3, u1 + 0.3]) mesh.box([u, y1 + 0.36, 0.28], [0.04, 0.66, 0.54]);
  mesh.box([u1 + 0.5, y1 + 0.3, 0.3], [0.32, 0.34, 0.34]);
  // the curtain: 75 mm slats with a shadow line between each
  mesh.setColor(TONE.shutter);
  const slat = 0.1;
  for (let top = y1; top > openY + 1e-3; top -= slat) {
    const bottom = Math.max(openY, top - slat);
    mesh.box([cu, (top + bottom) / 2 + 0.005, 0.11], [width + 0.04, top - bottom - 0.012, 0.03]);
  }
  mesh.setColor(TONE.shutterRib);
  mesh.box([cu, openY + 0.05, 0.11], [width + 0.04, 0.1, 0.07]);
  for (const u of [cu - width * 0.3, cu + width * 0.3]) mesh.box([u, openY - 0.06, 0.15], [0.12, 0.08, 0.04]);
  // the control box on the right jamb, its conduit up to the hood
  mesh.setColor(TONE.safety);
  mesh.box([u1 + 0.45, 1.45, 0.12], [0.18, 0.26, 0.1]);
  mesh.setColor(TONE.frame);
  mesh.box([u1 + 0.45, (1.6 + y1 + 0.1) / 2, 0.09], [0.03, y1 + 0.1 - 1.6, 0.03]);
}

/**
 * Outside the hall: a concrete apron, a gravel verge, grazing land mottled in two greens and a straw tone, and two
 * woodland edges (near dark, far hazed) all round, so every opening looks out onto Verdant's country.
 */
function buildExterior(mesh: HallMesh, HW: number): void {
  const identity = new THREE.Matrix4();
  mesh.setFrame(identity);
  const offsets = [0.2, 3, 9, 16, 30, 60, 120, 240, 520];
  const segments = 24;
  const tone = (d: number, x: number, z: number): THREE.Color => {
    const n = Math.sin(x * 0.071 + Math.cos(z * 0.053) * 2.1) * 0.5 + Math.sin(z * 0.047 - x * 0.029) * 0.5;
    if (d < 8) return new THREE.Color(0x7b786f).offsetHSL(0, 0, n * 0.015);
    if (d < 15) return new THREE.Color(0x6d6656).lerp(new THREE.Color(0x5d6a3f), (d - 8) / 7);
    const grass = new THREE.Color(0x56683a).lerp(new THREE.Color(0x6f7346), THREE.MathUtils.clamp(n * 0.6 + 0.35, 0, 1));
    return grass.lerp(new THREE.Color(0x667555), THREE.MathUtils.smoothstep(d, 120, 480));
  };
  const corner = (half: number, side: number, t: number): [number, number] => {
    // the square ring's edge for side 0..3 at parameter t in [0, 1], counter-clockwise from (-half, -half)
    const a = -half + 2 * half * t;
    switch (side) {
      case 0: return [a, -half];
      case 1: return [half, a];
      case 2: return [-a, half];
      default: return [-half, -a];
    }
  };
  const y = -0.03;
  for (let ring = 0; ring < offsets.length - 1; ring += 1) {
    const inner = HW + offsets[ring], outer = HW + offsets[ring + 1];
    for (let side = 0; side < 4; side += 1) {
      for (let k = 0; k < segments; k += 1) {
        const t0 = k / segments, t1 = (k + 1) / segments;
        const [ax, az] = corner(inner, side, t0), [bx, bz] = corner(inner, side, t1);
        const [cx, cz] = corner(outer, side, t1), [dx, dz] = corner(outer, side, t0);
        const colorAt = (px: number, pz: number): THREE.Color => tone(Math.max(Math.abs(px), Math.abs(pz)) - HW, px, pz);
        // per-face colour from the quad's centre keeps the soup flat-shaded but mottled
        mesh.setColor(colorAt((ax + cx) / 2, (az + cz) / 2));
        mesh.quad([ax, y, az], [bx, y, bz], [cx, y, cz], [dx, y, dz]);
      }
    }
  }
  // two woodland edges: jagged crowns on a dark understorey, facing the hall
  const woods = (distance: number, minH: number, maxH: number, low: number, high: number, seed: number): void => {
    const half = HW + distance;
    const count = 72;
    for (let side = 0; side < 4; side += 1) {
      for (let k = 0; k < count; k += 1) {
        const t0 = k / count, t1 = (k + 1) / count;
        const [ax, az] = corner(half, side, t0), [bx, bz] = corner(half, side, t1);
        const h = (t: number): number => {
          const s = side * 17.3 + t * 41.7 + seed;
          return minH + (maxH - minH) * (0.5 + 0.3 * Math.sin(s * 2.3) + 0.2 * Math.sin(s * 7.1 + 1.3));
        };
        mesh.setColor(new THREE.Color(low).lerp(new THREE.Color(high), 0.5 + 0.5 * Math.sin(k * 1.7 + side)));
        // the face looks back at the hall (inward): counter-clockwise from the inside
        mesh.quad([ax, y, az], [bx, y, bz], [bx, h(t1), bz], [ax, h(t0), az]);
      }
    }
  };
  woods(150, 9, 17, 0x27341f, 0x34452a, 3.1);
  woods(330, 12, 24, 0x4a5a50, 0x56665b, 8.7);
}
