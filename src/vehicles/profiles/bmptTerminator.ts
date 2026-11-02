// BMPT Terminator (`bmpt_terminator`): Uralvagonzavod's Ob'yekt 199 "Ramka" of the 2009-2013 standard, the vehicle
// shown at Russian Arms Expo 2009 and Engineering Technologies 2012 and delivered to Kazakhstan (photographs and their
// licences: docs/references/tanks/bmpt_terminator.md). 267 (lane bmpt-family-267, builder T; the owner: "lets actually
// make a BMPT Terminator").
//
// Hull: the fleet's T-72 X hull, built in place by its own builder (t72b3mX.ts buildT72B3MXHull: the T-72B3M's measured
// tub, running gear, fenders, the boxed reactive skirts and the glacis cover) with the glacis cover left bare
// (glacisContainers: false), its low lamps and its rounded front mudguards left off (glacisLamps, roundedFrontGuards: false)
// and the left skirt's cassettes left out over the engine bay (openSkirtSpans), then what the Terminator adds to it:
//   - Kontakt-5 on the glacis: four rows of three flat modules a side on the bare cover, bolted along the front row's toe,
//     the two headlights in guards at the glacis' upper corners, the towing brackets and hooks on the lower nose
//     (photos 03-06);
//   - the front fender housings: a massive sloped armoured box over each front fender, flush beside the glacis, its face
//     carried down over the track's front, each AG-17D's ball mount inboard and low on its face (photos 03-06, 13);
//   - the side boxes along both fenders, the third row of the side wall over the two skirt rows, the stern box down to
//     the fender's end (photos 07, 08, 09, 14, 15); the skirt's two open fields on the right closed by containers;
//   - the slat section in the left skirt over the engine bay, the wheels showing through it (photo 07);
//   - the bow crew stations of the two grenade-launcher operators either side of the driver, each with its periscope
//     housing and hatch (photos 05, 06, 13);
//   - the stern: a cage of horizontal slats with depth close over the rear plate, the two tow cables across it with
//     their eyes on the stern boxes, brackets on the lower rear plate (photo 08), and the stern's closures.
// Station: the Ramka module on its own ring 0.51 m aft of the T-72's (bmptTerminatorStation.ts).
// Round 2 (the coordinator's two blind photo critics): the corner cubes, the mirrors on stalks, the B3M's scoop mudguards
// and the stand-off stern screen gave way to the fender housings and the close slat cage.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { markEraFurniture, markEraHitFaces } from './eraHitFaces.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { buildT72B3MXHull, t72b3mGlacisCoverY } from './t72b3mX.ts';
import { hull } from './bmptT90Station.ts';
import { buildRamkaStation } from './bmptTerminatorStation.ts';
import { sph } from '../factoryGeometry.ts';

type P3 = readonly [number, number, number];

/** The side boxes' wall (hull frame): inner face, outer face (over the skirt rows' faces), foot, top (the photographs'
 * third row over the two skirt rows) and the run from the stern's end to the front fender housings. */
const SIDE = Object.freeze({ inner: 1.30, outer: 2.005, foot: 1.515, top: 1.80, rear: -3.46, front: 1.62 });
const SIDE_PANELS = [-3.46, -2.37, -1.57, -0.77, 0.03, 0.83, 1.62] as const;
/** The front fender housings: inner face (beside the glacis cover's edge, x 1.103), outer face, the run from the side
 * boxes forward, the bottom over the track, the crown's fall and the sloped face (bottom and top), the face's lip down
 * over the track's front. */
const FENDER = Object.freeze({ inner: 1.106, outer: 2.005, rear: 1.61, bottom: 1.41, rearTop: 1.80, front: 3.42, frontTop: 1.43,
  noseInner: 1.15 });
/** The AG-17D housing over each front corner (photos 03-06): the fender's full width, its crown, the top's front edge and
 * the sloped face's foot (z, y) on the hood, the outer and inner top chamfers; the ball mount inboard on the face, its
 * centre across and its place down the face (0 at the top edge, 1 at the foot). */
const AGL_BOX = Object.freeze({ inner: 1.13, outer: 2.005, rear: 1.55, top: 2.22, faceTop: [2.12, 2.22] as const,
  faceFoot: [2.74, 1.555] as const, outerChamfer: 0.07, innerChamfer: 0.03, ballX: 1.42, ballAt: 0.35 });
/** The rear-view mirror on the housing's crown at its outer rear corner: bracket pad (x, z), the head's size (w, h, d)
 * and its height over the crown. */
const MIRROR = Object.freeze({ x: 1.87, z: 1.68, w: 0.22, h: 0.34, d: 0.05, lift: 0.19 });
/** The solid rounded nose each fender carries down in front of the track: its outer face (z, y) from the hood's top to
 * its tip, and its inner face from the tip back up, 8 cm or more outside the track round the idler (z 3.218, y 0.873). */
const NOSE_OUTER: ReadonlyArray<readonly [number, number]> = [[3.38, 1.437], [3.52, 1.38], [3.63, 1.28], [3.71, 1.15],
  [3.745, 1.02], [3.73, 0.94]];
const NOSE_INNER: ReadonlyArray<readonly [number, number]> = [[3.64, 0.935], [3.60, 1.00], [3.545, 1.10], [3.47, 1.19],
  [3.38, 1.26]];
/** The operators' stations either side of the driver's hatch (centre |x|, half-width, rear and front, top). */
const STATION = Object.freeze({ x: 0.76, w: 0.28, rear: 1.26, front: 1.90, foot: 1.50, top: 1.80 });
/** The left skirt's run over the engine bay left to the slat section (side +1, rear z, front z). */
const LEFT_SLAT = Object.freeze({ rear: -2.553, front: -0.79, inner: 1.978, outer: 2.012, low: 0.80, high: 1.515 });
/** The stern cage's plane and extent (hull frame), behind the hull's own rear leaves (z -3.665). */
const CAGE = Object.freeze({ z: -3.735, depth: 0.045, half: 1.08, low: 0.90, high: 1.66 });

/** A ring of (x, y) points for one side, counter-clockwise seen from +z whichever side it is mirrored to. */
function sideRing(side: number, points: readonly SectionPoint[]): SectionPoint[] {
  const m = points.map(([x, y]) => [side * x, y] as const);
  return side < 0 ? m.reverse() : m;
}

/** The fender's top line in its stern run (t72b3mX.ts fenders), 1 cm under which the stern box's foot stands. */
const fenderTopAt = (z: number) => z < -3.15 ? 1.20 + (z + 3.47) / 0.32 * 0.1324 : 1.3324 + (z + 3.15) / 0.35 * 0.1936;

function sideBoxes(P: TankBuilderPort, side: number): void {
  const { inner, outer, foot, top } = SIDE, c = 0.03;
  const ringAt = (y: number) => sideRing(side, [[inner, y], [outer, y], [outer, top - c], [outer - c, top], [inner, top]]);
  const section = ringAt(foot);
  for (let i = 0; i + 1 < SIDE_PANELS.length; i++) {
    const a = SIDE_PANELS[i] + (i ? 0.006 : 0), b = SIDE_PANELS[i + 1] - 0.006;
    if (i === 0) {
      // the stern box, down to the fender's end: its foot follows the fender's fall (1 cm into it)
      P.add('hull', sectionSolid([-3.46, -3.15, -2.80].map((z) => ({ z, ring: ringAt(fenderTopAt(z) - 0.01) }))
        .concat([{ z: b, ring: section }])));
    } else {
      P.add('hull', sectionSolid([{ z: a, ring: section }, { z: b, ring: section }]));
    }
    // two bolt heads on the outer face's top and a grab handle on each box
    const mid = (a + b) / 2, xf = side * (outer + 0.003);
    for (const z of [a + 0.08, b - 0.08]) P.add('hullDark', KIT.cylX(0.013, 0.012, 6), xf, top - 0.06, z);
    P.add('hullDark', beamBetween([xf, top - 0.17, mid - 0.09], [side * (outer + 0.035), top - 0.17, mid - 0.09], 0.009));
    P.add('hullDark', beamBetween([xf, top - 0.17, mid + 0.09], [side * (outer + 0.035), top - 0.17, mid + 0.09], 0.009));
    P.add('hullDark', beamBetween([side * (outer + 0.035), top - 0.17, mid - 0.09], [side * (outer + 0.035), top - 0.17, mid + 0.09], 0.009));
  }
  // the lids' hinge line along the top's inner edge
  P.add('hullDetail', KIT.cylZ(0.012, SIDE.front - 0.30 - (SIDE.rear + 0.30), 8), side * (inner + 0.02), top + 0.004,
    (SIDE.front - 0.30 + SIDE.rear + 0.30) / 2);
}

/** A solid extruded across x (|x| a..b on one side) through a closed (z, y) outline, any shape: a section loft along x,
 * turned into place (sectionSolid lofts along z; a quarter turn about y maps its (u, v, s) to (-s, v, u)). */
function acrossX(side: number, a: number, b: number, outline: ReadonlyArray<readonly [number, number]>): THREE.BufferGeometry {
  let area = 0;
  for (let i = 0; i < outline.length; i++) {
    const [u0, v0] = outline[i], [u1, v1] = outline[(i + 1) % outline.length];
    area += u0 * v1 - u1 * v0;
  }
  const ring: SectionPoint[] = (area > 0 ? [...outline] : [...outline].reverse()).map(([u, v]) => [u, v] as const);
  const s0 = Math.min(-side * a, -side * b), s1 = Math.max(-side * a, -side * b);
  return sectionSolid([{ z: s0, ring }, { z: s1, ring }]).rotateY(-Math.PI / 2);
}

/** The front fender (photos 03-06): a massive sloped armoured hood over the track's front, flush beside the glacis (an
 * inner cheek carried down to the glacis edge), its top falling from the side boxes' crown to the nose, which rounds down
 * thick over the track's front; standing proud on its inner half, the AG-17D's armoured box with its sloped front, the
 * launcher's ball mount in a canvas boot and its barrel on that face; the rear-view mirror on its stalk at the outer
 * corner. */
function frontFender(P: TankBuilderPort, side: number): void {
  const { box, cylZ } = KIT, F = FENDER, B = AGL_BOX, c = 0.03;
  // the hood: a wedge from the side boxes' crown down to the nose, its bottom over the track
  const hoodPts: P3[] = [];
  for (const [z, y] of [[F.rear, F.bottom], [F.front, F.bottom], [F.front, F.frontTop], [F.rear, F.rearTop]] as const) {
    const top = y > F.bottom + 0.01;
    hoodPts.push([side * F.inner, y, z], [side * F.outer, top ? y - c : y, z]);
    if (top) hoodPts.push([side * (F.outer - c), y, z]);
  }
  const hood = hull(hoodPts);
  hood.userData.rangeSilhouette = true;
  P.add('hull', hood);
  // the solid rounded nose from the hood's front down over the track's front
  const nose = acrossX(side, F.noseInner, F.outer, [...NOSE_OUTER, ...NOSE_INNER]);
  nose.userData.rangeSilhouette = true;
  P.add('hull', nose);
  // the inner cheek: the hood's inner wall carried down beside the glacis to 4 cm under its edge, so the hood sits flush
  // with the glacis and no slot over the track opens between them (clear of the track's inner edge, x 1.19)
  const cheek = (z: number, bottom: number) => ({ z, ring: sideRing(side, [[F.inner, bottom], [1.16, bottom], [1.16, F.bottom + 0.01], [F.inner, F.bottom + 0.01]]) });
  P.add('hull', sectionSolid([cheek(2.30, t72b3mGlacisCoverY(2.30) - 0.04), cheek(2.61, t72b3mGlacisCoverY(2.61) - 0.04),
    cheek(3.25, t72b3mGlacisCoverY(3.25) - 0.04), cheek(3.42, 0.95)]));
  const hoodTop = (z: number) => F.rearTop + (z - F.rear) / (F.front - F.rear) * (F.frontTop - F.rearTop);
  for (const x of [1.30, 1.55, 1.80]) P.add('hullDark', KIT.cylY(0.014, 0.014, 0.012, 6), side * x, hoodTop(3.20) + 0.005, 3.20);
  // the AG-17D housing: one massive sloped armoured box over the front corner, the fender's full width, its crown 0.42
  // over the side boxes, its broad front sloped down onto the hood over the track guard (photos 04, 05)
  const [tz, ty] = B.faceTop, [fz, fy] = B.faceFoot, boxPts: P3[] = [];
  for (const [z, y] of [[B.rear, F.bottom + 0.01], [fz, F.bottom + 0.01], [fz, fy], [tz, ty], [B.rear, B.top]] as const) {
    const top = y > B.top - 0.01;
    boxPts.push([side * B.inner, top ? y - B.innerChamfer : y, z], [side * B.outer, top ? y - B.outerChamfer : y, z]);
    if (top) boxPts.push([side * (B.inner + B.innerChamfer), y, z], [side * (B.outer - B.outerChamfer), y, z]);
  }
  const aglBox = hull(boxPts);
  aglBox.userData.rangeSilhouette = true;
  P.add('hull', aglBox);
  P.add('hullDetail', box(0.50, 0.016, 0.48), side * 1.52, B.top + 0.004, (B.rear + tz) / 2);
  P.add('hullDetail', KIT.torus(0.035, 0.009, 14, 6).rotateZ(Math.PI / 2), side * 1.24, B.top + 0.035, B.rear + 0.14);
  // on the sloped face, inboard and high: the armoured collar, the ball, its canvas boot, the 30 mm barrel, the muzzle
  // sleeve and its mouth; bolts along the face's top edge and its foot
  const fd = new THREE.Vector2(fz - tz, fy - ty).normalize(), n = new THREE.Vector3(0, -fd.x, fd.y);
  if (n.z < 0) n.negate();
  const tilt = -Math.atan2(n.y, n.z), x = side * B.ballX, my = ty + B.ballAt * (fy - ty), mz = tz + B.ballAt * (fz - tz);
  P.add('hull', KIT.xform(cylZ(0.15, 0.05, 22), 0, 0, 0, tilt), x, my, mz);
  P.add('hullDark', sph(0.10, 16), x, my + n.y * 0.04, mz + n.z * 0.04);
  P.add('hullCloth', cylZ(0.065, 0.16, 14, 0.095), x, my + 0.02, mz + 0.18);
  P.add('hullDark', cylZ(0.03, 0.42, 12), x, my + 0.02, mz + 0.42);
  P.add('hullDark', cylZ(0.042, 0.07, 12), x, my + 0.02, mz + 0.61);
  P.add('hullDark', cylZ(0.015, 0.012, 10), x, my + 0.02, mz + 0.646);
  const faceBolt = (t: number, bx: number) => P.add('hullDark', KIT.cylY(0.014, 0.014, 0.012, 6).rotateX(Math.atan2(n.z, n.y)),
    side * bx, ty + t * (fy - ty) + n.y * 0.004, tz + t * (fz - tz) + n.z * 0.004);
  for (const bx of [1.22, 1.62, 1.82]) faceBolt(0.08, bx);
  for (const bx of [1.25, 1.50, 1.75]) faceBolt(0.88, bx);
  // the operator's sight window on the housing's inner side, looking forward and in
  P.add('hullGlass', box(0.012, 0.07, 0.14), side * (B.inner - 0.004), 2.06, 1.95);
  P.add('hullDetail', box(0.02, 0.02, 0.18), side * (B.inner - 0.008), 2.11, 1.95);
  rearViewMirror(P, side);
}

/** The rear-view mirror (photos 04, 05): a framed head on a bracket bolted to the housing's crown at its outer rear corner,
 * a braced post and a pivot knuckle under the head, the glass to the rear in its frame. */
function rearViewMirror(P: TankBuilderPort, side: number): void {
  const { box, cylX, cylY } = KIT, M = MIRROR, top = AGL_BOX.top, x = side * M.x;
  P.add('hullDetail', box(0.12, 0.025, 0.16), x, top + 0.0125, M.z);
  for (const dx of [-0.04, 0.04]) for (const dz of [-0.06, 0.06]) P.add('hullDark', cylY(0.011, 0.011, 0.012, 6), x + dx, top + 0.031, M.z + dz);
  const headLow = top + M.lift, cy = headLow + M.h / 2;
  P.add('hullDetail', cylY(0.024, 0.03, headLow - top - 0.03, 12), x, top + 0.025 + (headLow - top - 0.03) / 2, M.z);
  P.add('hullDetail', beamBetween([x, top + 0.03, M.z + 0.07], [x, top + 0.12, M.z + 0.005], 0.012));
  P.add('hullDark', cylX(0.03, 0.07, 12), x, headLow - 0.005, M.z);
  // the head: a rounded back shell and the frame's four bars round the glass on its rear face
  const r = 0.03, ring: SectionPoint[] = [];
  for (const [qx, qy, a0] of [[1, -1, -Math.PI / 2], [1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI]] as const) {
    for (let k = 0; k <= 2; k++) {
      const a = a0 + k * Math.PI / 4;
      ring.push([x + qx * (M.w / 2 - r) + r * Math.cos(a), cy + qy * (M.h / 2 - r) + r * Math.sin(a)]);
    }
  }
  const z0 = M.z - M.d / 2 + 0.012, z1 = M.z + M.d / 2;
  P.add('hullDetail', sectionSolid([{ z: z0, ring }, { z: z1 - 0.01, ring }, { z: z1, ring: ring.map(([px, py]) => [x + (px - x) * 0.92, cy + (py - cy) * 0.94] as const) }]));
  const fz = M.z - M.d / 2 + 0.006;
  P.add('hullDetail', box(M.w - 0.01, 0.024, 0.014), x, cy + M.h / 2 - 0.017, fz);
  P.add('hullDetail', box(M.w - 0.01, 0.024, 0.014), x, cy - M.h / 2 + 0.017, fz);
  P.add('hullDetail', box(0.024, M.h - 0.05, 0.014), x + (M.w / 2 - 0.017), cy, fz);
  P.add('hullDetail', box(0.024, M.h - 0.05, 0.014), x - (M.w / 2 - 0.017), cy, fz);
  P.add('hullGlass', box(M.w - 0.05, M.h - 0.05, 0.006), x, cy, M.z - M.d / 2 + 0.008);
}

function operatorStation(P: TankBuilderPort, side: number): void {
  const { box, cylY } = KIT, S = STATION, cx = side * S.x, c = 0.04;
  const ring = sideRing(side, [[S.x - S.w, S.foot], [S.x + S.w, S.foot], [S.x + S.w, S.top - c], [S.x + S.w - c, S.top],
    [S.x - S.w + c, S.top], [S.x - S.w, S.top - c]]);
  P.add('hull', sectionSolid([{ z: S.rear, ring }, { z: S.front, ring }]));
  // the periscope housing on the station's front, its window forward under a brow
  P.add('hull', box(0.36, 0.13, 0.18), cx, S.top + 0.055, S.front - 0.10);
  P.add('hullGlass', box(0.26, 0.07, 0.015), cx, S.top + 0.05, S.front - 0.007);
  P.add('hullDetail', box(0.38, 0.02, 0.06), cx, S.top + 0.125, S.front - 0.01);
  // the hatch: ring and closed lid, the hinge on the outboard side
  P.add('hull', cylY(0.26, 0.27, 0.05, 24), cx, S.top + 0.02, S.rear + 0.26);
  P.add('hullDetail', cylY(0.22, 0.24, 0.04, 24), cx, S.top + 0.06, S.rear + 0.26);
  P.add('hullDark', box(0.05, 0.03, 0.12), cx + side * 0.23, S.top + 0.06, S.rear + 0.26);
}

/** Kontakt-5 on the glacis: per side four rows of three flat modules 55 mm over the bare cover (6 mm into it), the rows
 * split at the cover's kink (z 2.61) so each lies in one plane, top edges chamfered; hex heads along the front row's face.
 * They are furniture of the cover's own clusters, so a spent package takes them with it. */
function kontakt5Glacis(P: TankBuilderPort): void {
  // Two rows of two large Kontakt-5 wedges a side (photos 03-06), one row on each glacis plane, each wedge thin where it
  // leaves the glacis at its rear and standing off it at its blunt front edge, so the glacis reads as a saw-tooth in side
  // view; the lower row's toe carries a row of hex heads.
  const H0 = 0.03, H1 = 0.11, c = 0.01;
  const rows = [[2.04, 2.59], [2.63, 3.21]] as const;
  const cols = [[0.02, 0.40], [0.42, 0.80]] as const;
  for (const side of [-1, 1]) P.destructibleCluster(`glacis_era_${side < 0 ? 'L' : 'R'}`, () => {
    for (const [z0, z1] of rows) for (const [a, b] of cols) {
      const x0 = Math.min(side * a, side * b), x1 = Math.max(side * a, side * b);
      const section = (z: number, inset: number): SectionPoint[] => {
        const foot = t72b3mGlacisCoverY(z) - 0.006, lid = t72b3mGlacisCoverY(z) + H0 + (z - z0) / (z1 - z0) * (H1 - H0) - inset;
        return [[x0 + inset, foot], [x1 - inset, foot], [x1 - inset, lid - c], [x1 - inset - c, lid], [x0 + inset + c, lid], [x0 + inset, lid - c]];
      };
      P.addExternalArmor('hull', markEraFurniture(sectionSolid([
        { z: z0, ring: section(z0, c) }, { z: z0 + c, ring: section(z0 + c, 0) },
        { z: z1 - c, ring: section(z1 - c, 0) }, { z: z1, ring: section(z1, c) },
      ])));
      // the lid's two lifting bolts near its rear
      for (const x of [a + 0.08, b - 0.08]) {
        const z = z0 + 0.10;
        P.addExternalArmor('hull', markEraFurniture(KIT.cylY(0.013, 0.013, 0.012, 6)), side * x,
          t72b3mGlacisCoverY(z) + H0 + (z - z0) / (z1 - z0) * (H1 - H0) + 0.002, z);
      }
    }
    for (const x of [0.10, 0.30, 0.50, 0.70]) {
      const z = rows[1][1];
      P.addExternalArmor('hull', markEraFurniture(KIT.cylZ(0.014, 0.012, 6)), side * x, t72b3mGlacisCoverY(z) + H1 / 2 - 0.004, z + 0.004);
    }
  });
}

/** The two headlights in their guards at the glacis' upper corners, outboard of the Kontakt-5 modules. */
function glacisLamps(P: TankBuilderPort): void {
  const z = 2.13, slope = Math.atan(0.3621);
  for (const side of [-1, 1]) {
    const x = side * 0.96, base = t72b3mGlacisCoverY(z);
    P.add('hullDetail', KIT.box(0.16, 0.06, 0.14), x, base + 0.015, z, -slope, 0, 0);
    P.add('hullDetail', markVehicleNightLens(KIT.cylZ(0.065, 0.10, 20), 'headlight'), x, base + 0.105, z);
    for (const dx of [-0.09, 0.09]) {
      P.add('hullDetail', beamBetween([x + dx, base - 0.005, z - 0.02], [x + dx, base + 0.20, z + 0.07], 0.008));
    }
    P.add('hullDetail', beamBetween([x - 0.09, base + 0.18, z + 0.06], [x + 0.09, base + 0.18, z + 0.06], 0.008));
  }
}

/** The lower nose (the hull's lower front plate, y 0.70 at z 3.00 to 0.955 at 3.342): a row of towing and plough brackets
 * half into the plate, and two tow hooks hanging from the outer pair (photos 03, 06). */
function lowerNoseFittings(P: TankBuilderPort): void {
  const plateZ = (y: number) => 3.0 + (y - 0.70358) / (0.82261 - 0.70358) * 0.20;
  for (const x of [-0.75, -0.45, -0.15, 0.15, 0.45, 0.75]) {
    P.add('hullDetail', KIT.box(0.09, 0.11, 0.10), x, 0.80, plateZ(0.80) + 0.01);
    P.add('hullDark', KIT.cylX(0.018, 0.12, 10), x, 0.79, plateZ(0.80) + 0.045);
  }
  for (const x of [-0.45, 0.45]) {
    P.add('hullDetail', KIT.torus(0.055, 0.014, 18, 8).rotateX(Math.PI / 2), x, 0.715, plateZ(0.80) + 0.055);
  }
}

/** The right skirt's two open fields (between its cassettes at z -2.559..-2.217 and -1.73..-1.389) closed by containers of
 * the same rows and faces, ERA of the same cluster, in front of the fields' own backing sheets (t72b3mXSideMounts.ts
 * railFieldBacking, x 1.9395-1.9485; the photographs' skirt runs unbroken; the left side's slat section covers its own). */
function skirtFieldContainers(P: TankBuilderPort): void {
  const side = -1, xi = 1.951, xo = 1.975, c = 0.010;
  for (const [a, b] of [[-2.553, -2.223], [-1.724, -1.395]] as const) {
    P.destructibleCluster('skirt_era_R', () => {
      for (const [y0, y1] of [[1.24, 1.5316], [0.7992, 1.203]] as const) {
        const full = sideRing(side, [[xi, y0], [xo - c, y0], [xo, y0 + c], [xo, y1 - c], [xo - c, y1], [xi, y1]]);
        const end = sideRing(side, [[xi, y0], [xo - 2 * c, y0], [xo - c, y0 + c], [xo - c, y1 - c], [xo - 2 * c, y1], [xi, y1]]);
        P.addExternalArmor('hull', markEraHitFaces(sectionSolid([{ z: a, ring: end }, { z: a + c, ring: full },
          { z: b - c, ring: full }, { z: b, ring: end }]), [side, 0, 0]));
      }
    });
  }
}

/** The slat section in the left skirt over the engine bay (photo 07): horizontal flat bars with depth on four posts and a
 * top and bottom rail, the top rail under the side boxes' foot, the posts braced in to the deck edge; the wheels show
 * through it. The cassettes of that run are left out of the skirt (buildT72B3MXHull openSkirtSpans); the bars stand just
 * outboard of the skirt mounts' strips and links (x 1.975 at most). */
function leftSlatSection(P: TankBuilderPort): void {
  const S = LEFT_SLAT, x = (S.inner + S.outer) / 2, len = S.front - S.rear, mid = (S.front + S.rear) / 2, d = S.outer - S.inner;
  for (let i = 0; i < 11; i++) P.add('hullOpenLattice', KIT.box(d, 0.010, len), x, S.low + 0.03 + i * 0.064, mid);
  P.add('hullOpenLattice', KIT.box(d + 0.01, 0.03, len), x, S.high - 0.005, mid);
  P.add('hullOpenLattice', KIT.box(d + 0.01, 0.025, len), x, S.low, mid);
  for (const z of [S.rear + 0.03, -2.0, -1.40, S.front - 0.03]) {
    P.add('hullOpenLattice', KIT.box(d + 0.01, S.high - S.low, 0.04), x, (S.high + S.low) / 2, z);
    P.add('hullDark', beamBetween([1.78, 1.42, z], [S.inner + 0.005, 1.42, z], 0.012));
  }
}

/** The stern cage close over the rear plate (photo 08): twelve horizontal flat slats with depth on five posts and a frame,
 * braced to the hull's rear leaves; the two tow cables run across its top from eyes on the stern boxes and hang down its
 * sides; brackets on the lower rear plate. */
function sternCage(P: TankBuilderPort): void {
  const C = CAGE, { box } = KIT;
  for (let i = 0; i < 12; i++) P.add('hullOpenLattice', box(2 * C.half, 0.012, C.depth), 0, C.low + 0.03 + i * 0.063, C.z);
  for (const y of [C.low, C.high]) P.add('hullOpenLattice', box(2 * C.half + 0.04, 0.03, C.depth + 0.01), 0, y, C.z);
  const lowerLeafZ = (y: number) => -3.455 - (y - 0.93) / 0.31 * 0.21;
  for (const x of [-C.half, -0.53, 0, 0.53, C.half]) {
    P.add('hullOpenLattice', box(0.04, C.high - C.low, C.depth + 0.01), x, (C.high + C.low) / 2, C.z);
    for (const y of [1.30, 1.60]) P.add('hullDark', beamBetween([x, y, -3.660], [x, y, C.z + C.depth / 2], 0.012));
    P.add('hullDark', beamBetween([x, 1.02, lowerLeafZ(1.02) - 0.005], [x, 1.02, C.z + C.depth / 2], 0.012));
  }
  // the two tow cables: from an eye on each stern box's face across the cage's top to hang down its far side
  const front = C.z - C.depth / 2 - 0.018;
  for (const side of [-1, 1]) {
    const eye = new THREE.Vector3(side * 1.62, 1.55 - (side > 0 ? 0 : 0.05), -3.485);
    const pts = [eye, new THREE.Vector3(side * 1.30, eye.y + 0.03, -3.70), new THREE.Vector3(side * 0.60, eye.y + 0.05, front),
      new THREE.Vector3(-side * 0.40, eye.y + 0.05, front), new THREE.Vector3(-side * 0.92, eye.y - 0.02, front),
      new THREE.Vector3(-side * 1.05, eye.y - 0.25, front), new THREE.Vector3(-side * 1.02, 1.00, front)];
    P.add('hullDark', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.018, 8, false));
    P.add('hullDark', KIT.torus(0.045, 0.012, 16, 6).rotateX(Math.PI / 2), eye.x, eye.y - 0.06, eye.z - 0.01);
    P.add('hullDetail', box(0.10, 0.10, 0.04), eye.x, eye.y, -3.465);                      // its hook bracket on the box
    P.add('hullDark', KIT.torus(0.04, 0.012, 16, 6).rotateX(Math.PI / 2), -side * 1.02, 0.96, front);
  }
  // the lower rear plate (y 0.743 at z -3.0 to 1.084 at -3.20): two lugs and a stiffener across it
  const plateZ = (y: number) => -3.0 - (y - 0.743) / 0.341 * 0.20;
  for (const x of [-0.42, 0.42]) P.add('hullDetail', box(0.12, 0.10, 0.10), x, 0.88, plateZ(0.88) - 0.02);
  P.add('hullDetail', box(1.30, 0.04, 0.05), 0, 0.98, plateZ(0.98) - 0.01, -Math.atan2(0.20, 0.341), 0, 0);
}

/** The stern's closures (the T-72 X hull's stern seen from the side and from behind and below): under each fender's
 * sloping stern run (t72b3mX.ts fenders: y 1.20 at z -3.47 to 1.3324 at -3.15, x 1.128-1.764) hangs the steeper rubber
 * rear leaf (1.043 at -3.475 to 1.3207 at -3.155), and the wedge between them, over the unditching log, was open; so was
 * the slot between the log's crest (y 1.012 + 0.115 at z -3.29) and the lower stern plate's underside (y 1.084 at z -3.20
 * to 1.26 at -3.342). Each wedge is filled, from 7 mm into the leaf to 1 cm into the fender (the fender's closed end box,
 * out to the stern box's outer face),
 * and the slot by a closed strip from the log's crest to 1 cm into the plate (the log's carrier), so neither reads as a
 * see-through pocket under a solid panel. */
function sternClosures(P: TankBuilderPort): void {
  const leafY = (z: number) => 1.043 + (z + 3.475) / 0.32 * 0.2777;
  const fenderY = (z: number) => 1.20 + (z + 3.47) / 0.32 * 0.1324 - 0.019;
  for (const side of [-1, 1]) {
    const ring = (z: number): SectionPoint[] => sideRing(side, [[1.13, leafY(z) - 0.007], [1.995, leafY(z) - 0.007],
      [1.995, fenderY(z) + 0.010], [1.13, fenderY(z) + 0.010]]);
    P.addMudguard('bmpt-terminator-rear-fender-end', 'hull', sectionSolid([{ z: -3.468, ring: ring(-3.468) },
      { z: -3.20, ring: ring(-3.20) }]));
  }
  const plateY = (z: number) => 1.084 + (-3.20 - z) / 0.142 * 0.176;
  const logY = (z: number) => 1.012 + Math.sqrt(0.115 ** 2 - (z + 3.29) ** 2) - 0.004;
  const strip = (z: number): SectionPoint[] => [[-1.13, logY(z)], [1.13, logY(z)], [1.13, plateY(z) + 0.010], [-1.13, plateY(z) + 0.010]];
  P.add('hull', sectionSolid([-3.335, -3.30, -3.26].map((z) => ({ z, ring: strip(z) }))));
}

/** The whole BMPT Terminator: the T-72 X hull, the Terminator's hull kit, then the Ramka station on its ring. */
export function buildBMPTTerminator(P: TankBuilderPort): void {
  buildT72B3MXHull(P, { glacisContainers: false, glacisLamps: false, roundedFrontGuards: false,
    openSkirtSpans: [[1, -2.60, -0.79]] });
  kontakt5Glacis(P);
  glacisLamps(P);
  lowerNoseFittings(P);
  for (const side of [-1, 1]) {
    sideBoxes(P, side);
    frontFender(P, side);
    operatorStation(P, side);
  }
  skirtFieldContainers(P);
  leftSlatSection(P);
  sternCage(P);
  sternClosures(P);
  buildRamkaStation(P);
  P.hullG.userData.familyRebuild = Object.freeze({ donor: 't72b3m_2016', revision: 2 });
}
