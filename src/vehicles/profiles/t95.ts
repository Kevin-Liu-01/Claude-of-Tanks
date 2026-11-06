/**
 * t95.ts — the T95 superheavy tank destroyer (the T28) with a fictional 152 mm gun (release 270).
 *
 * Copyright © 2026 Kevin B. Liu. Created, designed and directed by Kevin B. Liu; first-party Reserved Content
 * (LicenseRef-Claude-of-Tanks-Proprietary-Content-1.0, LICENSE-POLICY.md, NOTICE.md). Claude was a development tool for
 * this file, not an author. provenance: urn:claude-of-tanks:vehicle-profile:t95.
 *
 * The owner, 2026-11-05: "also use our generation procedure to make the t95 and its 152mm cannon"; asked which T95, the
 * American T95 with a 152 mm gun (DECISIONS "2026-11-05 American T95 with a 152 mm gun"). The 1945 pilot in fighting
 * trim: both outer track units fitted, the one-piece cast bow and casemate, the hemispherical ball mantlet, the turtle-back
 * upper hull whose 57-degree sides run out over the outer units, the driver's cupola front left and the commander's
 * cupola rear right with the .50 cal on its ring. The gun is fictional: the US Navy 6"/47 Mark 16's 152.4 mm bore, 7.17 m
 * tube and separate brass-cased rounds fitted in the T40-pattern ball (docs/references/tanks/t95.md).
 *
 * Datums: the registered print (t95_doomturtle_haphazard.glb) at its one uniform registration scale, 4.37 / 4.2797 (the
 * published 4.37 m over the outer units, History of War), which puts its hull at the 7.62 m of the March 1945 Ordnance
 * table, checked against the published 2.84 m over the .50 cal and the 0.48 m clearance. Four tracks 0.50 m wide on
 * 1.205 m and 1.79 m centres, eight 0.52 m dual road wheels a unit on four HVSS bogies (0.82 m inside a bogie, 1.45 m
 * between bogies), the rear sprocket and front idler, three return rollers; the outer skirts 4 in thick from 0.40 m to
 * 1.24 m; the casemate roof at 2.02 m, the sides at 31 degrees off the horizontal from the roof edge (x 1.02) out to the
 * skirt tops; the cast bow rounding forward of z -1.0 to its face at z 0.30; the ball 0.58 m round on the gun axis (y
 * 1.39, z 0.42). Coordinates are world metres: y up from the ground, +z forward, +x the tank's left.
 */
import * as THREE from 'three';
import { KIT, FITTINGS, muzzleBore } from './kit.ts';
import { antennaPart } from './antennaPart.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';

// ------------------------------------------------------------------------------------------------- datums --
const H = Object.freeze({
  sternZ: -5.26, faceZ: 0.30, bellyY: 0.45, tubX: 0.94, coverY: 1.20,
  skirtX: 2.185, skirtT: 0.05, skirtTop: 1.24, skirtLow: 0.42, coverFrontZ: 1.45, noseZ: 1.90, noseY: 0.86,
  coverInX: 0.78, spacerX: 1.52,
});
/** Track units: the inner and outer centres, the 19.5 in (0.495 m) T80 track cut down. */
const TRACK = Object.freeze({ inner: 1.21, outer: 1.83, w: 0.52, topY: 1.08 });
/** Eight dual road wheels a unit, front to rear: four HVSS bogies. */
const ROAD_WHEEL_ZS = Object.freeze([0.67, -0.15, -0.73, -1.55, -2.15, -2.97, -3.64, -4.465]);
const WHEEL = Object.freeze({ r: 0.26, y: 0.30 });
const SPROCKET = Object.freeze({ z: -4.93, y: 0.66, r: 0.31 });
const IDLER = Object.freeze({ z: 1.17, y: 0.64, r: 0.30 });
const ROLLER_ZS = Object.freeze([-0.42, -1.86, -3.31]);
/** The ball mount: its centre is the yaw and pitch pivot. */
const BALL = Object.freeze({ y: 1.39, z: 0.42, r: 0.58 });
/** The fictional 152 mm (6"/47 Mark 16 figures): its muzzle on the print's, the tube's outside from drawings (EST). */
const GUN = Object.freeze({ muzzleZ: 5.46, rootR: 0.170, muzzleR: 0.145, brakeL: 0.40, brakeR: 0.19, boreR: 0.0762 });

/**
 * One station of the cast upper hull (casemate and turtle back): the roof's half-width and height, the shoulder where the
 * 57-degree side meets the roof roll, and the side's foot on the track-unit cover (half-width and height).
 */
interface ShellStation {
  readonly z: number;
  readonly roofY: number;
  readonly xr: number;
  readonly xs: number;
  readonly ys: number;
  readonly xo: number;
  readonly yo: number;
}
const SHELL: readonly ShellStation[] = Object.freeze([
  { z: -5.26, roofY: 1.62, xr: 0.98, xs: 1.18, ys: 1.55, xo: 2.185, yo: 1.24 },
  { z: -5.02, roofY: 1.72, xr: 1.00, xs: 1.20, ys: 1.65, xo: 2.185, yo: 1.25 },
  { z: -4.40, roofY: 1.80, xr: 1.02, xs: 1.20, ys: 1.72, xo: 2.185, yo: 1.25 },
  { z: -3.60, roofY: 1.91, xr: 1.02, xs: 1.20, ys: 1.84, xo: 2.185, yo: 1.27 },
  { z: -2.80, roofY: 2.02, xr: 1.02, xs: 1.20, ys: 1.86, xo: 2.185, yo: 1.27 },
  { z: -1.40, roofY: 2.02, xr: 1.04, xs: 1.22, ys: 1.86, xo: 2.185, yo: 1.27 },
  // (blind critics, round 7: the cheek crumpled) where the outer slope ends, its foot moves in along its own plane (the
  // print's diagonal front edge in plan): the side stays one flat plate and drops to the unit cover at its cut end
  { z: -1.00, roofY: 2.03, xr: 1.08, xs: 1.26, ys: 1.85, xo: 2.10, yo: 1.337 },
  { z: -0.70, roofY: 2.03, xr: 1.12, xs: 1.28, ys: 1.83, xo: 1.90, yo: 1.451 },
  { z: -0.40, roofY: 2.02, xr: 1.14, xs: 1.28, ys: 1.80, xo: 1.58, yo: 1.617 },
  { z: -0.25, roofY: 2.01, xr: 1.02, xs: 1.18, ys: 1.82, xo: 1.44, yo: 1.42 },
]);

/**
 * The cast nose (blind critics, round 8: the shell's rings carried through the rounding nose read as cloth draped over
 * the ball): its own closed casting from behind the cheeks to the face, each section a leaning wall rolling over a round
 * shoulder onto a crowned roof. [z, half-width at the cover line, roof height]
 */
const NOSE: readonly (readonly [number, number, number])[] = Object.freeze([
  [-0.60, 1.50, 2.02], [-0.25, 1.47, 2.01], [0.0, 1.17, 1.99], [0.12, 1.09, 1.95], [0.22, 1.01, 1.86], [H.faceZ, 0.95, 1.70],
]);
const NOSE_ARC = 5;
function noseRing(hb: number, top: number): SectionPoint[] {
  const lean = 0.20, rad = 0.30, xs = hb - lean, cx = xs - rad, cy = top - rad;
  const right: [number, number][] = [];
  for (let k = 0; k <= NOSE_ARC; k++) {
    const a = (k / NOSE_ARC) * Math.PI / 2;
    right.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  const left = right.slice().reverse().map(([x, y]) => [-x, y] as [number, number]);
  return [[-hb, H.coverY], [hb, H.coverY], ...right, [0, top + 0.02], ...left];
}

/** The authored stations resampled every 0.12 m (Catmull-Rom on each datum, z kept monotone): the cast nose rounds
 * through many sections instead of creasing between a few (blind critics, round 6: "faceted"). */
function denseShell(): ShellStation[] {
  const st = SHELL, keys = ['roofY', 'xr', 'xs', 'ys', 'xo', 'yo'] as const, out: ShellStation[] = [];
  for (let i = 0; i + 1 < st.length; i++) {
    const a = st[Math.max(0, i - 1)], b = st[i], c = st[i + 1], d = st[Math.min(st.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil((c.z - b.z) / 0.12));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const cr = (p0: number, p1: number, p2: number, p3: number): number =>
        0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
      const row = { z: b.z + (c.z - b.z) * t } as { -readonly [K in keyof ShellStation]: number };
      // (held between its two stations: no overshoot past the skirts or the roof)
      for (const key of keys) row[key] = Math.min(Math.max(b[key], c[key]), Math.max(Math.min(b[key], c[key]), cr(a[key], b[key], c[key], d[key])));
      row.yo = Math.max(row.yo, H.coverY + 0.01);
      out.push(row);
    }
  }
  out.push(st[st.length - 1]);
  return out;
}

/** The shell's counter-clockwise ring (viewed from +z): the cover-level floor, each side's foot, shoulder and roof edge. */
// (blind critics: round 4, a faceted wedge with hard chines; round 5, then too soft, "a bar of soap".) Each side runs
// flat from the skirt top to the shoulder (xs, ys) and on up the shoulder line; the last 45 % of it rolls onto the roof
// through a quadratic arc whose control point is the roof edge, and the roof carries a low cast crown.
const SHOULDER_SAMPLES = 5;
const CROWN = 0.025;
function shellRing(s: ShellStation): SectionPoint[] {
  const right: [number, number][] = [[s.xs, s.ys]];
  const p0x = s.xs + (s.xr - s.xs) * 0.55, p0y = s.ys + (s.roofY - s.ys) * 0.55;
  const ex = s.xr * 0.62, ey = s.roofY + CROWN * 0.6;
  for (let i = 0; i <= SHOULDER_SAMPLES; i++) {
    const t = i / SHOULDER_SAMPLES, u = 1 - t;
    right.push([u * u * p0x + 2 * u * t * s.xr + t * t * ex, u * u * p0y + 2 * u * t * s.roofY + t * t * ey]);
  }
  const left = right.slice().reverse().map(([x, y]) => [-x, y] as [number, number]);
  return [[-s.xo, H.coverY], [s.xo, H.coverY], [s.xo, s.yo], ...right, [0, s.roofY + CROWN], ...left, [-s.xo, s.yo]];
}
/** The shell's smooth contour edges: the shoulders and the roof (the sides' flat plates and the floor stay creased). */
const SHELL_SMOOTH_EDGES = Array.from({ length: 2 * SHOULDER_SAMPLES + 2 }, (_, i) => 4 + i);

/** The shell's roof height at z (the centreline), interpolated through the stations. */
function roofAt(z: number): number {
  const s = SHELL;
  if (z <= s[0].z) return s[0].roofY;
  for (let i = 0; i + 1 < s.length; i++) {
    if (z <= s[i + 1].z) return s[i].roofY + (z - s[i].z) / (s[i + 1].z - s[i].z) * (s[i + 1].roofY - s[i].roofY);
  }
  return s[s.length - 1].roofY;
}

/** The side slope's height at |x| between the shoulder and the foot at z (outside the roof flat). */
function sideAt(ax: number, z: number): number {
  const s = SHELL;
  let a = s[0], b = s[0];
  for (let i = 0; i + 1 < s.length; i++) if (z >= s[i].z && z <= s[i + 1].z) { a = s[i]; b = s[i + 1]; break; }
  const t = b.z === a.z ? 0 : (z - a.z) / (b.z - a.z);
  const m = (u: number, v: number): number => u + (v - u) * t;
  const xr = m(a.xr, b.xr), xs = m(a.xs, b.xs), ys = m(a.ys, b.ys), xo = m(a.xo, b.xo), yo = m(a.yo, b.yo), ry = m(a.roofY, b.roofY);
  if (ax <= xr) return ry;
  if (ax <= xs) return ry + (ax - xr) / (xs - xr) * (ys - ry);
  return ys + Math.min(1, (ax - xs) / (xo - xs)) * (yo - ys);
}

function* buildT95Steps(P: TankBuilderPort): TankProfileBuild {
  const { box, cylX, cylY, cylZ, sph, xform, torus, lathe, buildRunningGear, liftEye, periscope, headlight, towCable } = KIT;
  const seg = P.q ? 22 : 12;
  /** A closed cast dome of radius r and height h on its base plane (a lathe through the axis). */
  const dome = (r: number, h: number): THREE.BufferGeometry => lathe([[0.0005, 0], [r, 0], [r * 0.93, h * 0.42], [r * 0.72, h * 0.8],
    [r * 0.4, h * 0.97], [0.0005, h]], P.q ? 22 : 12);
  const bar = (slot: string, a: readonly number[], b: readonly number[], r: number): void => {
    P.add(slot, beamBetween([a[0], a[1], a[2]], [b[0], b[1], b[2]], r, 8));
  };

  // ---------------------------------------------------------------- hull: the tub, the cast upper hull --
  const buildT95Hull = (): void => {
    // the lower hull between the inner track units: belly, the rounded final-drive housing at the stern, the lower bow
    // plate undercut back from the face to the belly (the 133 mm lower front at 60 degrees)
    const TUB: readonly (readonly [number, number])[] = [[H.sternZ, 0.62], [-5.12, H.bellyY], [-0.22, H.bellyY],
      [0.22, 0.70], [H.faceZ, 0.78]];
    P.add('hull', sectionSolid(TUB.map(([z, b]) => ({ z, ring: [[-H.tubX, b], [H.tubX, b], [H.tubX, H.coverY + 0.01],
      [-H.tubX, H.coverY + 0.01]] as SectionPoint[] }))));
    // the cast upper hull: the turtle back over all four units, the casemate roof, the bow rounding to its face
    const shell = sectionSolid(denseShell().map((s) => ({ z: s.z, ring: shellRing(s) })), { sideQuadDiagonal: 'convex', smoothSideEdges: SHELL_SMOOTH_EDGES });
    shell.userData.primaryStockRole = 't95-casting';
    P.add('hull', shell);
    // the bow face below the shell between the inner units, to the lower plate (the 305 mm casting's lower half)
    P.add('hull', sectionSolid([0.05, H.faceZ].map((z) => ({ z, ring: [[-H.tubX, 0.78], [H.tubX, 0.78], [H.tubX, H.coverY + 0.02],
      [-H.tubX, H.coverY + 0.02]] as SectionPoint[] }))));
    // the cast nose round the ball (NOSE), smooth over its shoulders and roof
    P.add('hull', sectionSolid(NOSE.map(([z, hb, top]) => ({ z, ring: noseRing(hb, top) })),
      { smoothSideEdges: Array.from({ length: 2 * NOSE_ARC + 2 }, (_, i) => 2 + i) }));
    // the cast collar the ball sits in (blind critics, round 4: the sphere read stuck onto a flat face)
    P.add('hull', xform(lathe([[0.50, -0.12], [0.60, -0.12], [0.63, -0.05], [0.62, 0.04], [0.56, 0.11], [0.50, 0.12],
      [0.50, -0.12]], P.q ? 32 : 18), 0, 0, 0, Math.PI / 2, 0, 0), 0, BALL.y, H.faceZ - 0.04);
    // the track-unit covers forward of the turtle back, flat at the cover line, their noses sloping down ahead of the idlers
    for (const s of [-1, 1] as const) {
      const ring = (xin: number, b: number, t: number): SectionPoint[] => {
        const xi = s > 0 ? xin : -H.skirtX, xe = s > 0 ? H.skirtX : -xin;
        return [[xi, b], [xe, b], [xe, t], [xi, t]];
      };
      P.add('hull', sectionSolid([
        { z: -1.10, ring: ring(H.tubX - 0.01, H.coverY - 0.07, H.coverY + 0.005) },
        { z: H.faceZ, ring: ring(H.coverInX, H.coverY - 0.07, H.coverY + 0.005) },
        { z: 1.66, ring: ring(H.coverInX, H.coverY - 0.07, H.coverY + 0.005) },
        { z: 1.76, ring: ring(H.coverInX + 0.04, 0.96, 1.03) },
        { z: H.noseZ, ring: ring(H.coverInX + 0.04, H.noseY - 0.06, H.noseY) },
      ]));
      // the cover's inner wall down to the tub forward of the bow face (the units' front carriers)
      P.add('hull', box(H.tubX - H.coverInX + 0.02, H.coverY - 0.60, H.coverFrontZ - H.faceZ), s * (H.tubX + H.coverInX) / 2, (H.coverY + 0.60) / 2 - 0.03, (H.faceZ + H.coverFrontZ) / 2);
      // the spacer wall between the two units of a side (the unit carrier the outer unit's four bolts pull to)
      // (stopping short of the front, so the two track faces of a side read apart: blind critic, round 7)
      P.add('hull', box(0.06, H.coverY - 0.34, 5.30), s * H.spacerX, (H.coverY + 0.34) / 2, -2.25);
      // the outer skirt, 4 in thick, from the stern to the nose slope, its foot rising ahead of the front bogie
      const so = s * H.skirtX, si = s * (H.skirtX - H.skirtT);
      const [x0, x1] = s > 0 ? [si, so] : [so, si];
      // (the foot bevelled up to the outer face, as the print's)
      const sk = (b: number, t: number): SectionPoint[] => {
        // (the print's foot: its outer face ends at 0.57 m, bevelled 15 cm in to the inner face's 0.42)
        const bev = Math.min(0.15, (t - b) * 0.5);
        return s > 0 ? [[x0, b], [x1, b + bev], [x1, t], [x0, t]] : [[x0, b + bev], [x1, b], [x1, t], [x0, t]];
      };
      P.add('hull', sectionSolid([
        { z: H.sternZ - 0.02, ring: sk(H.skirtLow + 0.03, H.skirtTop - 0.02) },
        { z: 1.40, ring: sk(H.skirtLow, H.skirtTop) },
        { z: 1.66, ring: sk(0.62, H.skirtTop - 0.02) },
        { z: H.noseZ, ring: sk(H.noseY - 0.02, H.noseY + 0.02) },
      ]));
    }
    // the rear plate's lip under the deck and the stern's lower plate between the units
    P.add('hullDetail', box(1.86, 0.06, 0.05), 0, 1.30, H.sternZ - 0.01);
  };
  buildT95Hull();
  yield 'buildT95Hull';

  // ---------------------------------------------------------------- running gear: four tracks --
  const buildT95RunningGear = (): void => {
    for (const xc of [TRACK.inner, TRACK.outer]) {
      buildRunningGear(P, {
        style: 'dished', wheelR: WHEEL.r, wheelW: 0.30, wheelY: WHEEL.y, xc, wheelZs: [...ROAD_WHEEL_ZS],
        sprocket: { ...SPROCKET }, idler: { ...IDLER },
        rollers: ROLLER_ZS.map((z) => ({ z, y: TRACK.topY - 0.13, r: 0.08 })),
        trackW: TRACK.w, topY: TRACK.topY, botY: 0.02, contactZF: ROAD_WHEEL_ZS[0], contactZR: ROAD_WHEEL_ZS.at(-1),
        paintedEnds: true, coveredTop: false, arms: false, sprocketTeeth: true,
      });
    }
    // the domed hub caps on the outer units' road wheels, the print's and the 1946 photograph's
    for (const z of ROAD_WHEEL_ZS) for (const s of [-1, 1] as const) {
      P.add(s < 0 ? 'hullTrackDetailL' : 'hullTrackDetailR', xform(sph(0.075, P.q ? 14 : 8, Math.PI / 2), 0, 0, 0, 0, 0, -s * Math.PI / 2),
        s * (TRACK.outer + 0.15), WHEEL.y, z);
    }
    // the HVSS bogie brackets between each pair of axles on the inner face of each unit
    for (const xc of [TRACK.inner, TRACK.outer]) for (const s of [-1, 1] as const) {
      const bx = s * (xc - TRACK.w / 2 - 0.035);
      for (let b = 0; b < 4; b++) {
        const zc = (ROAD_WHEEL_ZS[2 * b] + ROAD_WHEEL_ZS[2 * b + 1]) / 2;
        P.add('hullRunningGearDetail', box(0.07, 0.24, 0.50), bx, WHEEL.y + 0.10, zc);
        P.add('hullRunningGearDark', cylX(0.07, 0.08, 10), bx, WHEEL.y + 0.10, zc);
      }
    }
  };
  buildT95RunningGear();
  yield 'buildT95RunningGear';

  // ---------------------------------------------------------------- hull fittings --
  const buildT95Fittings = (): void => {
    // the engine deck: two armoured grille panels across the turtle back, their slats, the air outlet over the differential
    for (const [z0, z1] of [[-4.95, -4.05], [-3.95, -3.05]] as const) {
      const zc = (z0 + z1) / 2, y = roofAt(zc);
      const pitch = Math.atan2(roofAt(z1) - roofAt(z0), z1 - z0);
      P.add('hullDark', xform(box(1.80, 0.03, z1 - z0 - 0.06), 0, 0, 0, -pitch, 0, 0), 0, y + 0.005, zc);
      for (let k = 0; k < 9; k++) {
        P.addEquipment('hull', xform(box(1.84, 0.025, 0.035), 0, 0, 0, -pitch, 0, 0), 0, y + 0.03, z0 + 0.06 + k * (z1 - z0 - 0.12) / 8);
      }
      P.add('hullDetail', xform(box(0.05, 0.05, z1 - z0), 0, 0, 0, -pitch, 0, 0), 0, y + 0.035, zc);
      // each panel's raised armoured frame
      for (const sx of [-1, 1] as const) P.add('hullDetail', xform(box(0.07, 0.07, z1 - z0), 0, 0, 0, -pitch, 0, 0), sx * 0.93, y + 0.03, zc);
      for (const ez of [z0, z1]) P.add('hullDetail', box(1.93, 0.07, 0.07), 0, roofAt(ez) + 0.03, ez);
    }
    P.add('hullDark', box(1.20, 0.18, 0.06), 0, 1.18, H.sternZ - 0.02);
    for (let k = 0; k < 4; k++) P.addEquipment('hull', box(1.16, 0.02, 0.05), 0, 1.11 + k * 0.045, H.sternZ - 0.045);
    // the stern: tail lights in their guards, the towing pintle, the tow eyes
    for (const s of [-1, 1] as const) {
      P.add('hullDark', box(0.18, 0.12, 0.06), s * 0.72, 1.36, H.sternZ - 0.02);
      P.add('hullGlass', cylZ(0.035, 0.012, 12), s * 0.70, 1.36, H.sternZ - 0.055);
      P.add('hullDark', box(0.12, 0.14, 0.12), s * 0.62, 0.70, H.sternZ - 0.05);
      P.add('hullDark', torus(0.06, 0.02, 12, 6), s * 0.62, 0.62, H.sternZ - 0.12, Math.PI / 2, 0, 0);
    }
    P.add('hullDark', box(0.22, 0.20, 0.12), 0, 0.82, H.sternZ - 0.06);
    P.add('hullDark', cylY(0.05, 0.05, 0.16, 10), 0, 0.82, H.sternZ - 0.13);
    // the bow: the headlights in their brush guards on the unit covers, the tow clevises at the cover noses
    for (const s of [-1, 1] as const) {
      // the headlights on each cover's front plate in their brush guards (the museum photograph)
      const x = s * 1.40, z = 1.70, y = 1.10;
      P.add('hullDetail', box(0.30, 0.14, 0.08), x, y, z + 0.02);
      for (const dx of [-0.075, 0.075]) headlight(P, x + dx, y, z + 0.08, 0, 0.055);
      for (const dx of [-0.16, 0.16]) bar('hullDark', [x + dx, y - 0.08, z + 0.05], [x + dx, y + 0.12, z + 0.22], 0.012);
      bar('hullDark', [x - 0.16, y + 0.12, z + 0.22], [x + 0.16, y + 0.12, z + 0.22], 0.012);
      for (const xc of [TRACK.inner, TRACK.outer]) {
        P.add('hullDark', box(0.12, 0.10, 0.08), s * xc, H.noseY + 0.04, H.noseZ - 0.04);
        P.add('hullDark', torus(0.05, 0.016, 12, 6), s * xc, H.noseY + 0.03, H.noseZ + 0.02, 0, 0, Math.PI / 2);
      }
    }
    // the tow eyes on the lower bow plate
    for (const s of [-1, 1] as const) {
      P.add('hullDark', box(0.14, 0.12, 0.10), s * 0.36, 0.62, 0.20);
      P.add('hullDark', torus(0.06, 0.02, 12, 6), s * 0.36, 0.56, 0.27, Math.PI / 2, 0, 0);
    }
    // lifting eyes at the casemate's corners
    for (const s of [-1, 1] as const) {
      liftEye(P, 'hullDetail', s * 0.95, roofAt(-0.2) + 0.01, -0.2, s * 0.3);
      liftEye(P, 'hullDetail', s * 0.95, roofAt(-3.0) + 0.01, -3.0, s * 2.8);
    }
    // the pioneer tools, tow cables and their brackets along both sloped sides (the print and the 1946 photographs;
    // blind critics, round 4: the sides read bare)
    const onSlope = (side: number, ax: number, z: number, lift: number): [number, number, number, number] => {
      const slope = Math.atan2(sideAt(ax + 0.15, z) - sideAt(ax - 0.15, z), 0.3);
      return [side * ax, sideAt(ax, z) + lift, z, side * slope];
    };
    const tool = (side: number, ax: number, z0: number, z1: number, kind: 'shovel' | 'pick' | 'bar' | 'axe'): void => {
      const zc = (z0 + z1) / 2, [x, y, z, rz] = onSlope(side, ax, zc, 0.035), len = z1 - z0;
      P.addEquipment('hullWood', xform(cylZ(0.022, len * (kind === 'bar' ? 1 : 0.72), 8), 0, 0, 0, 0, 0, rz), x, y, z - (kind === 'bar' ? 0 : len * 0.14));
      if (kind === 'shovel') P.addEquipment('hullDark', xform(box(0.20, 0.025, 0.28), 0, 0, 0, 0, 0, rz), x, y - 0.005, z1 - 0.14);
      if (kind === 'pick') P.addEquipment('hullDark', xform(box(0.50, 0.04, 0.05), 0, 0, 0, 0, 0, rz), x, y + 0.005, z1 - 0.10);
      if (kind === 'axe') P.addEquipment('hullDark', xform(box(0.16, 0.03, 0.10), 0, 0, 0, 0, 0, rz), x, y, z1 - 0.07);
      for (const bz of [z0 + len * 0.18, z1 - len * 0.32]) {
        const [bx, by, , brz] = onSlope(side, ax, bz, 0.02);
        P.add('hullDetail', xform(box(0.08, 0.05, 0.04), 0, 0, 0, 0, 0, brz), bx, by, bz);
      }
    };
    for (const s of [-1, 1] as const) {
      tool(s, 1.58, -4.30, -3.30, 'shovel');
      tool(s, 1.36, -3.20, -2.30, 'pick');
      tool(s, 1.86, -4.70, -2.90, 'bar');
      if (s > 0) tool(s, 1.70, -2.10, -1.30, 'axe');
      const cx = 1.98, cz0 = -4.8, cz1 = -1.4;
      bar('hullDark', [s * cx, sideAt(cx, cz0) + 0.03, cz0], [s * cx, sideAt(cx, cz1) + 0.03, cz1], 0.022);
      for (const cz of [cz0, cz1]) P.add('hullDark', torus(0.06, 0.018, 10, 6), s * cx, sideAt(cx, cz) + 0.05, cz + (cz > -3 ? 0.06 : -0.06), Math.PI / 2, 0, 0);
      // the outer unit's removal A-frame folded forward on the cover: two arms from hinges by the casemate cheek to a
      // hook block over the cover's front, a cross bar between them (the print and the museum photograph)
      const ax = s * 1.62, hz = 0.62, tz = 1.24, ty = H.coverY + 0.58;
      for (const dx of [-0.30, 0.30]) {
        P.add('hullDetail', box(0.08, 0.20, 0.26), ax + dx * 1.15, H.coverY + 0.10, hz);
        bar('hullDark', [ax + dx, H.coverY + 0.14, hz], [ax, ty, tz], 0.045);
      }
      bar('hullDark', [ax - 0.11, H.coverY + 0.24, 0.96], [ax + 0.11, H.coverY + 0.24, 0.96], 0.024);
      P.add('hullDark', box(0.12, 0.10, 0.12), ax, ty, tz);
      P.add('hullDark', torus(0.05, 0.016, 10, 6), ax, ty - 0.08, tz + 0.04, 0, 0, Math.PI / 2);
    }
    // the stern: the tow cable looped across the rear plate on its hooks
    towCable(P, [[-0.95, 1.30, H.sternZ - 0.05], [-0.55, 1.02, H.sternZ - 0.07], [0.0, 0.98, H.sternZ - 0.08],
      [0.55, 1.02, H.sternZ - 0.07], [0.95, 1.30, H.sternZ - 0.05]], 0.022);
    P.addEquipment('hullDark', cylZ(0.07, 0.62, 12), -1.35, sideAt(1.35, -3.9) + 0.08, -3.9);
    // the right side's stowage bins along the slope beside the commander (the print's raised run, z -2.7 to -1.2)
    for (const [z0, z1] of [[-2.70, -1.98], [-1.94, -1.20]] as const) {
      const ax = 1.78, slope = Math.atan2(sideAt(ax + 0.2, z0) - sideAt(ax - 0.2, z0), 0.4);
      P.addEquipment('hullDetail', xform(box(0.42, 0.28, z1 - z0), 0, 0, 0, 0, 0, -slope), -ax, sideAt(ax, (z0 + z1) / 2) + 0.15, (z0 + z1) / 2);
    }
  };
  buildT95Fittings();
  yield 'buildT95Fittings';

  // ---------------------------------------------------------------- cupolas, periscopes, antennas, the .50 --
  const buildT95Roof = (): void => {
    // the commander's cupola rear right with its vision blocks and hatch, on the cut-down M49C ring
    const cx = -0.68, cz = -2.18, cy = roofAt(cz);
    P.addCupola('hull', cylY(0.40, 0.44, 0.16, P.q ? 24 : 14), cx, cy + 0.07, cz);
    P.addCupola('hull', dome(0.36, 0.15), cx, cy + 0.15, cz);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      P.add('hullGlass', xform(box(0.09, 0.05, 0.01), 0, 0, 0, 0, -a, 0), cx + Math.sin(a) * 0.405, cy + 0.12, cz + Math.cos(a) * 0.405);
    }
    const mg = FITTINGS.americanM2({
      mats: P.mats, tone: 'dark', ammoSide: 1, barrelLength: 0.65, elev: 0.55, ring: false, shield: false,
      seed: 27095, working: true,
    });
    // (the gun rides the ring's outboard side, as the print and the 1946 photographs carry it)
    // (blind critic, round 6: the gun floated over the ring) its mount foot seated on the ring's carriage
    mg.position.set(cx - 0.55, cy + 0.425, cz + 0.10);
    P.add('hullDark', box(0.14, 0.05, 0.20), cx - 0.55, cy + 0.41, cz + 0.10);
    // the cut-down M49C ring over the cupola and its four posts from the cupola's base ring
    P.add('hullDark', torus(0.56, 0.025, P.q ? 32 : 18, 6), cx, cy + 0.40, cz);
    for (let k = 0; k < 4; k++) {
      const a = (k + 0.5) * Math.PI / 2;
      bar('hullDark', [cx + Math.sin(a) * 0.43, cy + 0.12, cz + Math.cos(a) * 0.43], [cx + Math.sin(a) * 0.54, cy + 0.38, cz + Math.cos(a) * 0.54], 0.022);
    }
    P.hullG.add(mg);
    // the driver's cupola front left, its periscopes, and the gunner's sight hood front right
    const dx = 0.60, dz = -0.70, dy = roofAt(dz);
    P.addCupola('hull', cylY(0.33, 0.36, 0.12, P.q ? 22 : 14), dx, dy + 0.05, dz);
    P.addCupola('hull', dome(0.30, 0.12), dx, dy + 0.10, dz);
    for (const a of [-0.5, 0, 0.5]) periscope(P, 'hullDetail', dx + Math.sin(a) * 0.30, dy + 0.12, dz + Math.cos(a) * 0.30, a);
    P.add('hullDetail', box(0.22, 0.12, 0.26), -0.55, roofAt(-0.35) + 0.06, -0.35);
    P.add('hullGlass', box(0.16, 0.05, 0.01), -0.55, roofAt(-0.35) + 0.08, -0.215);
    // three whips: two on the casemate's rear roof, one forward of the commander
    for (const [x, z, h] of [[0.08, -2.40, 1.05], [0.68, -2.00, 1.05], [-0.12, -1.20, 1.05]] as const) {
      const y = roofAt(z);
      P.add('hullDark', cylY(0.04, 0.05, 0.08, 10), x, y + 0.03, z);
      const whip = FITTINGS.antennaWhip({ mats: P.mats, h, r: 0.009, rake: 0, seed: 27100 + Math.round(z * 10) });
      whip.position.set(x, y + 0.07, z);
      P.hullG.add(whip);
    }
    void antennaPart;
  };
  buildT95Roof();
  yield 'buildT95Roof';

  // ---------------------------------------------------------------- the ball mount and the 152 mm --
  P.turretG.position.set(0, BALL.y, BALL.z);
  P.gunG.position.set(0, 0, 0);
  const buildT95Gun = (): void => {
    // the hemispherical cast ball (292 mm), pitching with the gun about its own centre; its port collar
    P.add('gunMount', sph(BALL.r, P.q ? 28 : 16), 0, 0, 0);
    P.add('gunMount', cylZ(0.30, 0.08, seg), 0, 0, BALL.r - 0.02);
    P.add('gunMount', cylZ(0.24, 0.10, seg, 0.28), 0, 0, BALL.r + 0.06);
    // the tube: the 6"/47's outside tapering from the collar to the brake, a step a third of the way out
    const len = GUN.muzzleZ - BALL.z;
    const z0 = BALL.r + 0.10, zStep = z0 + (len - z0) * 0.34, zBrake = len - GUN.brakeL;
    // (blind critics, round 5: thin for its bore) the jacket over the chamber end, a third of the way out
    const zJ = z0 + (zStep - z0) * 0.62;
    P.add('gun', cylZ(GUN.rootR + 0.028, zJ - z0, seg, GUN.rootR + 0.04), 0, 0, (z0 + zJ) / 2);
    P.add('gun', cylZ(GUN.rootR - 0.004, zStep - zJ, seg, GUN.rootR + 0.028), 0, 0, (zJ + zStep) / 2);
    P.add('gun', cylZ(GUN.rootR - 0.008, 0.04, seg), 0, 0, zStep);
    P.add('gun', cylZ(GUN.muzzleR, zBrake - zStep, seg, GUN.rootR - 0.018), 0, 0, (zStep + zBrake) / 2);
    // the muzzle collar: the 6"/47 fired without a brake, so the tube ends in a solid swell with a front lip (blind critics,
    // rounds 4-7: a box brake read as a placeholder; the photographs' muzzle is a solid cylindrical cap)
    P.add('gun', cylZ(GUN.brakeR, GUN.brakeL - 0.14, seg, GUN.brakeR - 0.01), 0, 0, zBrake + 0.10 + (GUN.brakeL - 0.14) / 2);
    P.add('gun', cylZ(GUN.brakeR - 0.01, 0.10, seg, GUN.muzzleR), 0, 0, zBrake + 0.05);
    P.add('gun', torus(GUN.brakeR - 0.03, 0.03, seg, 8), 0, 0, len - 0.03, Math.PI / 2, 0, 0);
    P.add('gun', torus(GUN.boreR + 0.022, 0.02, seg, 6), 0, 0, len - 0.045, Math.PI / 2, 0, 0);
    P.add('gun', cylZ(GUN.boreR * 1.45, 0.03, seg), 0, 0, len - 0.012);
    muzzleBore(P, { z: len + 0.004, r: GUN.boreR });
    P.muzzleZ = len;
    P.gunG.userData.t95GunReceipt = { caliberMm: 152.4, muzzleZ: len, brake: 'none (muzzle collar)', source: '6"/47 Mark 16 (fictional fit)' };
  };
  buildT95Gun();
  yield 'buildT95Gun';

  for (const s of [-1, 1] as const) {
    P.decal('hull', 'star', null, 0.42, [s * (H.skirtX + 0.006), 0.84, -2.55], s * Math.PI / 2, 0, 0);
    P.decal('hull', 'number', P.spec.visual.number || '95', 0.26, [s * (H.skirtX + 0.006), 0.86, -0.80], s * Math.PI / 2, 0, 0);
  }
  P.topY = roofAt(-1.0);
}

export const buildT95 = steppedBuilder((P: TankBuilderPort) => buildT95Steps(P));

export const T95_PROFILES = {
  t95: { build: buildT95 },
} satisfies VehicleProfileRecord;

/** The datums a fixture holds the build to (docs/references/tanks/t95.md). */
export const T95_DATUMS = Object.freeze({
  hull: H, track: TRACK, roadWheelZs: ROAD_WHEEL_ZS, wheel: WHEEL, sprocket: SPROCKET, idler: IDLER, ball: BALL, gun: GUN,
  shell: SHELL,
});
