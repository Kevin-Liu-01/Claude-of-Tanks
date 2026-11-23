// The Strv 103 family's mark kits (274): the 103A's bare beak, the 103B's blade, screen and fence, the 103E's modern fit,
// the UDES 03 trials prototype and the Strv 152's casemate rebuilt round its 152 mm.
// First-party: Kevin B. Liu (NOTICE.md).

import { KIT, FITTINGS, orientedSlab } from './kit.ts';
import { mount } from './fittingMount.ts';
import { DRUM_ISSUE_PAINTS, fuelDrumParts, place } from '../accessoryPrimitives.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { FRAMES, GLACIS_PITCH, glacisY } from './strv103Frame.ts';

/** 103A: the bare beak's under-lip crossbeam and tow brackets, plain lamp pods, the infrared driving lamps, spare links
 * on the glacis shoulder, the narrow tail rack. */
export function kitA(P: TankBuilderPort): void {
  const { box, cylZ, torus } = KIT;
  // (critic r6: the boxy under-lip crossbeam read as a separate box; the tow brackets and eyes carry the beak's foot)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.14, 0.34, 0.30), s * 0.84, 1.06, 3.30);
    P.add('hullDark', torus(0.06, 0.018, 10), s * 0.84, 0.92, 3.42);
    mount(P, 'hull', FITTINGS.lightCluster({ nightKind: 'headlight',
      mats: P.mats, pods: 2, spacing: 0.13, r: 0.048, shield: false, seed: 10450 + (s > 0 ? 1 : 0),
    }), s * 1.22, 1.56, 3.24);
    // 259: the infrared driving lamps (the 103B gave them up; hhogman.se)
    P.add('hullDetail', box(0.10, 0.06, 0.09), s * 0.62, 1.50, 3.27);
    P.add('hullDetail', cylZ(0.085, 0.15, 16), s * 0.62, 1.615, 3.29);
    P.add('hullDark', cylZ(0.072, 0.012, 16), s * 0.62, 1.615, 3.371);
  }
  // the A-era spare links on the right glacis shoulder, on bare plate where its ribs stop (spareTrackSeat: at x 0.98
  // they overhung the louvre bank's frame and the seat pass racked them off a grille host)
  mount(P, 'hull', FITTINGS.spareTrackLinks({
    mats: P.mats, links: 3, width: 0.60, pitch: 0.17, seed: 10420,
  }), 1.28, glacisY(2.30) + 0.03, 2.30, [GLACIS_PITCH, 0, 0]);
  mount(P, 'hull', FITTINGS.stowageRack({
    mats: P.mats, w: 1.86, d: 0.42, h: 0.24, fill: 0.35, rails: 3, seed: 10460,
  }), 0, 1.90, -2.62);
}
/** The dozer blade folded up under the nose (103B, kept by the 103C): a curved moldboard in three facets with its
 * cutting edge, back ribs, push arms seated inside the idler lanes and the two lift rams. Nothing passes the beak's
 * published span (z 3.52). */
function dozerBlade(P: TankBuilderPort): void {
  const { box, cylZ, xform } = KIT;
  // folded, the blade lies against the beak's sloped underside (the loft's 0.88@2.98 -> 1.26@3.52 face): one continuous
  // moldboard curved in three facets sharing their edges (critic r6: the old facets read as loose planks with dark gaps),
  // 6 cm thick, its cutting edge on its foot, its top edge tucked under the lip
  const W = 1.50, T = 0.06;
  const face: [number, number][] = [[0.74, 3.02], [0.92, 3.22], [1.08, 3.39], [1.20, 3.50]];
  for (let i = 0; i + 1 < face.length; i++) {
    const [y0, z0] = face[i], [y1, z1] = face[i + 1];
    P.add('hull', orientedSlab(
      [-W, y0 + T, z0 - T], [W, y0 + T, z0 - T], [W, y1 + T, z1 - T], [-W, y1 + T, z1 - T],
      [-W, y0, z0], [W, y0, z0], [W, y1, z1], [-W, y1, z1]));
  }
  const [fy, fz] = face[0], edgeTilt = -Math.atan2(face[1][0] - fy, face[1][1] - fz);
  P.add('hullDark', box(W * 2 - 0.02, 0.025, 0.09), 0, fy + 0.025, fz - 0.005, edgeTilt, 0, 0);   // cutting edge on the foot
  for (const s of [-1, 1]) {
    // push arms from the blade's back to the hull's belly, inside the sprocket lanes
    P.add('hullDetail', box(0.08, 0.10, 0.62), s * 0.86, 0.76, 2.72, 0.12, 0, 0);
    // lift ram: sleeve on the belly, polished rod up to the blade's back
    P.add('hullDetail', xform(cylZ(0.05, 0.36, 12), 0, 0, 0, -0.55, 0, 0), s * 0.55, 0.80, 2.78);
    P.add('hullDark', xform(cylZ(0.028, 0.24, 10), 0, 0, 0, -0.55, 0, 0), s * 0.55, 0.94, 2.98);
  }
}
/** The anti-HEAT bar grilles across the nose (owner 2026-11-20, with the photographs; 2026-11-21: on the 103E and the
 * Strv 152 too): two tall panels either side of the gun on the beak, each a frame of three rails and three posts with
 * 30 mm bars at 8.3 cm, raked back with the glacis. `feet` seats the posts on a nose module's top face. */
function noseGrilles(P: TankBuilderPort, o: { posts: readonly [number, number, number]; railX: number; railW: number;
  bars: number; feet?: boolean }): void {
  const { box, cylZ } = KIT;
  const RAKE = 0.25;
  for (const s of [-1, 1]) {
    for (const [y, z] of [[1.49, 3.43], [1.72, 3.375], [1.95, 3.32]] as const) {
      P.add('hullDetail', box(o.railW, 0.035, 0.04), s * o.railX, y, z);
    }
    for (const x of o.posts) {
      P.add('hullDetail', box(0.04, 0.50, 0.04), s * x, 1.72, 3.375, RAKE, 0, 0);
      // the module's top face falls from 1.52 at z 3.00 to 1.36 at z 3.68; the post's foot is at y 1.478, z 3.437
      if (o.feet) P.add('hullDark', box(0.07, 0.09, 0.07), s * x, 1.445, 3.437);
    }
    for (let k = 0; k < o.bars; k++) {
      P.add('hullDetail', cylZ(0.015, 0.47, 8), s * (o.posts[0] + 0.05 + k * 0.083), 1.72, 3.375, -Math.PI / 2 + RAKE, 0, 0);
    }
  }
}
/** 103B: the blade, the flotation screen boxed round the deck edge (its trough sets the 3.63 m width), the 30 mm
 * anti-HEAT rod fence on the beak's front edge, shrouded headlamps, the rear stowage rack. */
export function kitB(P: TankBuilderPort): void {
  const { box } = KIT;
  dozerBlade(P);
  noseGrilles(P, { posts: [0.26, 0.86, 1.46], railX: 0.86, railW: 1.20, bars: 14 });
  for (const s of [-1, 1]) {
    // the big tow hooks on the beak under the grilles: a block and a closed shackle under it (an open ring read as a hole
    // from above in the contiguity check)
    P.add('hullDetail', box(0.12, 0.10, 0.08), s * 0.95, 1.30, 3.48);
    P.add('hullDark', box(0.05, 0.14, 0.07), s * 0.95, 1.18, 3.48);
  }
  // the spare links on the nose's vertical face either side of the gun, under the grilles: one clamped two-link course a
  // side, its rails' feet on the 3.52 face (base 4.05 cm under its origin), kept where authored (spareTrackSeat)
  for (const s of [-1, 1]) {
    mount(P, 'hull', FITTINGS.spareTrackLinks({ mats: P.mats, links: 2, width: 0.26, seed: s < 0 ? 31 : 32 }),
      s * 0.30, 1.26, 3.52 + 0.0405, [Math.PI / 2, 0, 0]);
  }
  // the stowage boxes on the nose corners ahead of the screen housings, sloped with the nose, orange marker lamps
  for (const s of [-1, 1]) {
    const xi = s * 1.40, xo = s * 1.76;
    P.add('hull', orientedSlab(
      [xi, 1.515, 2.36], [xo, 1.515, 2.36], [xo, 1.515, 2.96], [xi, 1.515, 2.96],
      [xi, 1.86, 2.36], [xo, 1.86, 2.36], [xo, 1.70, 2.96], [xi, 1.70, 2.96]));
    P.add('hullDark', box(0.006, 0.012, 0.56), xo + s * 0.003, 1.80, 2.62, 0.25, 0, 0);    // lid seam
    P.add('hullGlass', box(0.008, 0.05, 0.08), xo + s * 0.005, 1.62, 2.86);               // orange side marker
  }
  // the side skirts of the photographs: jerrycan-pattern panels hung from the fender lip over the upper run, eleven a
  // side, each with its pressed X and its handle, on hooks from the lip
  for (const s of [-1, 1]) {
    for (let k = 0; k < 11; k++) {
      const z = -2.05 + k * 0.41;
      P.add('hull', box(0.11, 0.42, 0.36), s * 1.760, 1.15, z);
      for (const a of [-0.62, 0.62]) P.add('hullPaintedDetail', box(0.008, 0.46, 0.022), s * 1.807, 1.15, z, a, 0, 0);
      P.add('hullDark', box(0.04, 0.03, 0.12), s * 1.760, 1.375, z);                     // hook to the lip
    }
  }
  for (const s of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({ nightKind: 'headlight',
      mats: P.mats, pods: 2, spacing: 0.13, r: 0.048, shield: true, seed: 10350 + (s > 0 ? 1 : 0),
    }), s * 1.22, 1.56, 3.20);
  }
  mount(P, 'hull', FITTINGS.stowageRack({
    mats: P.mats, w: 1.55, d: 0.44, h: 0.25, fill: 0.42, rails: 3, seed: 10340,
  }), 0, 1.92, -2.58);
}
/** A bolted composite module: a box with a sloped outer face, its bolt rows, its lifting lug. */
function compositeModule(P: TankBuilderPort, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number,
  lean: number): void {
  const s = Math.sign(x1);
  const xi = Math.min(Math.abs(x0), Math.abs(x1)), xo = Math.max(Math.abs(x0), Math.abs(x1));
  const X = (v: number): number => s * v;
  P.add('hull', orientedSlab(
    [X(xi), y0, z0], [X(xo), y0, z0], [X(xo), y0, z1], [X(xi), y0, z1],
    [X(xi), y1, z0], [X(xo - lean), y1, z0], [X(xo - lean), y1, z1], [X(xi), y1, z1]));
  const len = Math.abs(z1 - z0), bolts = Math.max(2, Math.round(len / 0.22));
  for (let k = 0; k < bolts; k++) {
    const z = Math.min(z0, z1) + 0.06 + (len - 0.12) * k / (bolts - 1);
    for (const y of [y0 + 0.07, y1 - 0.07]) {
      const t = (y - y0) / (y1 - y0);
      P.add('hullDark', KIT.cylX(0.016, 0.012, 8), X(xo - lean * t + 0.004), y, z);
    }
  }
  P.add('hullDetail', KIT.box(0.05, 0.03, 0.10), X((xi + xo - lean) / 2), y1 + 0.015, (z0 + z1) / 2);
}
/** 103E (concept): the blade; composite nose, glacis-edge and side modules; bar armour over the rear plate; smoke and
 * soft-kill launchers; laser warners; the modern rear basket and the shrouded lamps. */
export function kitE(P: TankBuilderPort, plateZ: number, cageTailZ?: number): void {
  const TAIL_Z = cageTailZ ?? plateZ, cage = cageTailZ !== undefined;
  const { box, cylY, cylZ, sph, xform } = KIT;
  dozerBlade(P);
  // the 103B's nose grilles stand on the module (inside its 1.40 m edge); the 152's wider tube and travel lock push the
  // inner post out to 0.36
  if (cage) noseGrilles(P, { posts: [0.36, 0.87, 1.38], railX: 0.87, railW: 1.06, bars: 12, feet: true });
  else noseGrilles(P, { posts: [0.26, 0.82, 1.38], railX: 0.82, railW: 1.16, bars: 13, feet: true });
  // the nose module: two wedges on the beak either side of the tube (z 3.00..3.68), their faces raked with the glacis
  for (const s of [-1, 1]) {
    P.add('hull', orientedSlab(
      [s * 0.24, 1.25, 3.00], [s * 1.40, 1.25, 3.00], [s * 1.40, 1.25, 3.68], [s * 0.24, 1.25, 3.68],
      [s * 0.24, 1.52, 3.00], [s * 1.40, 1.52, 3.00], [s * 1.40, 1.36, 3.68], [s * 0.24, 1.36, 3.68]));
    P.add('hullDark', box(1.12, 0.012, 0.016), s * 0.82, 1.37, 3.62);                // the module's face seam
    for (let k = 0; k < 4; k++) P.add('hullDark', cylY(0.018, 0.018, 0.012, 8), s * (0.36 + k * 0.32), 1.522 - 0.02, 3.06);
  }
  // glacis-edge appliqué outboard of the louvre banks, lying on the glacis plane
  for (const s of [-1, 1]) {
    const z0 = 0.80, z1 = 2.90, zc = (z0 + z1) / 2, len = (z1 - z0) / Math.cos(GLACIS_PITCH);
    P.add('hull', box(0.52, 0.09, len), s * 1.24, glacisY(zc) + 0.045, zc, GLACIS_PITCH, 0, 0);
    for (let k = 0; k < 6; k++) {
      const z = z0 + 0.15 + k * (z1 - z0 - 0.30) / 5;
      for (const dx of [-0.19, 0.19]) P.add('hullDark', cylY(0.016, 0.016, 0.012, 8), s * 1.24 + dx, glacisY(z) + 0.095, z, GLACIS_PITCH, 0, 0);
    }
  }
  // the side modules replace the bins (the 103C's front fuel boxes become armour), four a side, 3.80 m over them
  for (const s of [-1, 1]) {
    for (const [z0, z1] of [[2.40, 1.30], [1.24, 0.10], [0.04, -1.00], [-1.06, -2.10]] as const) {
      if (s < 0 && z0 > 2.0) continue;                                              // the Ksp 58 box's place
      compositeModule(P, s * 1.50, s * 1.90, 1.30, 1.84, z0, z1, 0.10);
    }
  }
  // bar armour over the rear plate (the 152's bustle; the 103E carries the rear boxes there): posts on stand-off arms,
  // five horizontal bars, 0.24 m off the plate
  const cageZ = TAIL_Z - 0.24;
  for (const x of cage ? [-1.30, -0.44, 0.44, 1.30] : []) {
    P.addEquipment('hullDetail', box(0.035, 0.62, 0.035), x, 1.48, cageZ);
    for (const y of [1.24, 1.72]) P.addEquipment('hullDark', box(0.025, 0.025, 0.26), x, y, TAIL_Z - 0.12);
  }
  for (let k = 0; k < (cage ? 5 : 0); k++) P.addEquipment('hullDetail', box(2.66, 0.032, 0.014), 0, 1.22 + k * 0.13, cageZ);
  // smoke discharger banks on the deck's front corners, four tubes each, trained forward and out
  for (const s of [-1, 1]) {
    mount(P, 'hull', FITTINGS.smokeBank({ mats: P.mats, count: 4, r: 0.04, len: 0.26, splay: s * 1.20,
      slot: 'detail', seed: 10470 + (s > 0 ? 1 : 0) }), s * 1.38, 1.90, 0.20, [0, s < 0 ? 0 : Math.PI, 0]);
  }
  // soft-kill launchers (two trainable multi-tube pods on the rear deck) and four laser-warning heads
  for (const s of [-1, 1]) {
    const x = s * 1.25, z = plateZ + 0.90;
    P.addEquipment('hull', cylY(0.14, 0.15, 0.06, P.q ? 18 : 12), x, 1.93, z);
    P.addEquipment('hull', box(0.30, 0.18, 0.22), x, 2.05, z, 0.35, 0, 0);
    for (const dx of [-0.08, 0, 0.08]) for (const dy of [-0.045, 0.045]) {
      P.add('hullDark', cylZ(0.03, 0.02, 10), x + dx, 2.05 + dy, z + 0.105, 0.35, 0, 0);
    }
  }
  for (const [x, z] of [[-1.40, 0.45], [1.40, 0.45], [-1.30, plateZ + 0.32], [1.30, plateZ + 0.32]] as const) {
    P.addEquipment('hull', cylY(0.05, 0.055, 0.10, 12), x, 1.95, z);
    P.add('hullGlass', xform(sph(0.045, 12, Math.PI / 2), 0, 0, 0), x, 2.00, z);
  }
  for (const s of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({ nightKind: 'headlight',
      mats: P.mats, pods: 2, spacing: 0.12, r: 0.045, shield: true, seed: 10480 + (s > 0 ? 1 : 0),
    }), s * 1.05, 1.53, 3.62);
  }
  mount(P, 'hull', FITTINGS.stowageRack({
    mats: P.mats, w: 1.70, d: 0.50, h: 0.30, fill: 0.55, rails: 3, seed: 10490,
  }), 0, 1.92, plateZ + 0.57);
}
/** UDES 03 (mark p): the S-tank's trials prototype (owner 2026-11-20: "redesign the udes to be more like a prototype of
 * the strv 103a"). The A casemate in plain mild steel without its production fit: bare fenders (no bins, no Ksp box), no
 * blade or screen, plain lamps; the shorter 105 mm test tube; bolted ballast plates on the glacis standing in for the
 * armour's weight, the trials data recorder with its cable runs, the telemetry mast and the trials weld seams. */
export function kitP(P: TankBuilderPort): void {
  const { box, cylX, cylY, torus } = KIT;
  for (const s of [-1, 1]) {
    P.add('hull', box(0.14, 0.34, 0.30), s * 0.84, 1.06, 3.30);
    P.add('hullDark', torus(0.06, 0.018, 10), s * 0.84, 0.92, 3.42);
    mount(P, 'hull', FITTINGS.lightCluster({ nightKind: 'headlight',
      mats: P.mats, pods: 1, spacing: 0.12, r: 0.050, shield: false, seed: 300 + (s > 0 ? 1 : 0),
    }), s * 1.22, 1.56, 3.24);
    // ballast: three bolted steel plates on the glacis's outer strip either side
    for (let k = 0; k < 3; k++) {
      const z = 2.30 - k * 0.34, y = glacisY(z) + 0.035 + k * 0.004;
      P.add('hullDetail', box(0.40, 0.06, 0.30), s * 1.18, y, z, GLACIS_PITCH, 0, 0);
      for (const dx of [-0.13, 0.13]) P.add('hullDark', cylY(0.016, 0.016, 0.02, 8), s * 1.18 + dx, y + 0.035, z, GLACIS_PITCH, 0, 0);
    }
    // trials weld seams down the hull sides
    P.add('hullDark', box(0.012, 0.012, 5.60), s * 1.685, 1.70, -0.20);
  }
  // the trials data recorder on rubber mounts on the rear deck, its cable runs in clips to the right fender (the
  // suspension pressure transducers) and forward to the gun cradle
  P.addEquipment('hull', box(0.56, 0.26, 0.40), 0.40, 2.03, -2.95);
  P.add('hullDark', box(0.58, 0.02, 0.42), 0.40, 2.17, -2.95);
  P.add('hullGlass', box(0.12, 0.06, 0.006), 0.30, 2.05, -2.747);
  for (const dx of [-0.22, 0.22]) for (const dz of [-0.15, 0.15]) P.add('hullDark', cylY(0.03, 0.03, 0.02, 8), 0.40 + dx, 1.89, -2.95 + dz);
  for (const dx of [-0.29, 0.29]) P.add('hullDetail', box(0.02, 0.04, 0.16), 0.40 + dx, 2.08, -2.95);   // carrying handles
  for (const dz of [-0.13, 0.13]) P.add('hullDark', box(0.04, 0.05, 0.02), 0.40, 2.06, -2.95 + dz + Math.sign(dz) * 0.075); // latches
  // (critic r6: the deck-long cable runs read as stray wires) one cable from the recorder to the telemetry mast, clipped
  P.add('hullDark', cylX(0.014, 1.20, 6), -0.48, 1.89, -2.95);
  for (const x of [-0.20, -0.70]) P.add('hullDetail', box(0.03, 0.02, 0.04), x, 1.90, -2.95);
  // the telemetry mast with its loading coil on its own base at the rear left
  P.add('hullDetail', cylY(0.05, 0.06, 0.10, 10), -1.10, 1.93, -2.95);
  P.add('hullDark', cylY(0.03, 0.03, 0.12, 10), -1.10, 2.04, -2.95);
  mount(P, 'hull', FITTINGS.antennaWhip({ mats: P.mats, h: 1.40, r: 0.010, rake: -0.10, seed: 309 }), -1.10, 2.10, -2.95);
}
/** Strv 152 (mark x, concept; owner 2026-11-20: "make a strv 152 with a 152mm and designed hull to accommodate that
 * cannon to complement the strv 103 e"): the 103E's modern fit on a casemate rebuilt round the 152 mm. The bore rides
 * 11 cm higher in a wider, taller housing; a breech hump runs back over the fighting compartment's front; the
 * autoloader's bustle for the 152 mm rounds lengthens the hull 0.60 m behind the tail plate, its loading doors on its
 * own rear face. */
export function kitX(P: TankBuilderPort): void {
  const { box } = KIT;
  const tz = FRAMES.x.tailZ;
  // the breech hump: a sloped armoured box from the housing's root back over the glacis break, its weld seams
  P.add('hull', orientedSlab(
    [-0.40, 1.83, -0.10], [0.40, 1.83, -0.10], [0.44, 1.74, 1.30], [-0.44, 1.74, 1.30],
    [-0.30, 2.16, 0.00], [0.30, 2.16, 0.00], [0.32, 2.02, 1.30], [-0.32, 2.02, 1.30]));
  P.add('hullDark', box(0.62, 0.012, 0.02), 0, 2.16, 0.00);
  for (const sd of [-1, 1]) P.add('hullDark', box(0.012, 0.012, 1.31), sd * 0.31, 2.09, 0.65, -0.107, 0, 0);
  // the autoloader bustle on the tail plate: its body, its roof hatch, its welds
  P.add('hull', orientedSlab(
    [-1.20, 1.28, tz], [1.20, 1.28, tz], [1.22, 1.24, -3.50], [-1.22, 1.24, -3.50],
    [-1.16, 1.98, tz], [1.16, 1.98, tz], [1.20, 1.98, -3.30], [-1.20, 1.98, -3.30]));
  P.add('hullDark', box(2.30, 0.012, 0.02), 0, 1.98, -3.30);                         // the bustle's weld to the deck
  // two 200 L fuel drums lying across the bustle roof in their cradles (owner 2026-11-20: "2 big fuel canisters"): the
  // saddles from the roof to the drums' undersides, the drums' own bands and bungs, a strap over each band
  // (critic r6: the 0.58 m drums stood nearly as tall as the hull) 0.50 m drums, seated low in their saddles
  const r = 0.25, len = 0.80, zc = -3.80, roofY = 1.98, yc = roofY + 0.02 + Math.sqrt(r * r - 0.15 * 0.15);
  for (const sd of [-1, 1] as const) {
    const x = sd * 0.50;
    const drum = fuelDrumParts({ r, len, straps: [0.15, 0.85], buckleAt: 2.62, bungHead: sd, detail: P.q === false ? 0 : 1,
      bold: true, paint: DRUM_ISSUE_PAINTS[sd > 0 ? 1 : 0], seed: 15200 + (sd > 0 ? 1 : 0) });
    P.add('hullBark', place(drum.body, -len / 2, 0, 0, 0, 0, -Math.PI / 2), x, yc, zc);
    for (const part of [...drum.straps, ...drum.hardware]) P.add('hullDark', place(part, -len / 2, 0, 0, 0, 0, -Math.PI / 2), x, yc, zc);
    const saddleTop = yc - Math.sqrt(r * r - 0.15 * 0.15) + 0.008;
    for (const dz of [-0.15, 0.15]) P.add('hullDark', box(len - 0.04, saddleTop - roofY, 0.05), x, (roofY + saddleTop) / 2, zc + dz);
    // a strap over each band from saddle to saddle: eight short segments round the drum's top
    const a0 = Math.acos(0.15 / r), sr = r + 0.008;
    for (const dx of [-0.308, 0.308]) for (let k = 0; k < 8; k++) {
      const t0 = a0 + (Math.PI - 2 * a0) * k / 8, t1 = a0 + (Math.PI - 2 * a0) * (k + 1) / 8, tm = (t0 + t1) / 2;
      P.add('hullDark', box(0.04, 0.008, sr * (t1 - t0) + 0.004), x + dx, yc + sr * Math.sin(tm), zc + sr * Math.cos(tm),
        Math.PI / 2 - tm, 0, 0);
    }
  }
  // the rubber side skirts under the side modules, four panels a side over the upper run; on the left the front panel
  // hangs from a bracket on the fender beside the Ksp 58 box
  for (const sd of [-1, 1]) {
    for (const [z0, z1] of [[2.38, 1.32], [1.22, 0.12], [0.02, -0.98], [-1.08, -2.08]] as const) {
      P.add('hullRubber', box(0.025, 0.30, z0 - z1 - 0.04), sd * 1.8625, 1.15, (z0 + z1) / 2);
      P.add('hullDark', box(0.03, 0.03, z0 - z1 - 0.04), sd * 1.8625, 1.30, (z0 + z1) / 2);   // its clamp strip
    }
  }
  P.add('hullDark', box(0.17, 0.03, 1.02), -1.79, 1.30, 1.85);                       // the left front panel's bracket
  P.add('hullDark', box(0.03, 0.20, 0.04), -1.72, 1.40, 1.85);
  for (const sd of [-1, 1]) P.add('hullDark', box(0.012, 0.70, 0.012), sd * 1.18, 1.63, tz + 0.01);
}
