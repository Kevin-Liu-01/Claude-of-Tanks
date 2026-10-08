// src/world/maps/skybridgeArm.ts — Skybridge Chasm's reservoir arm, computed (the map-revival lane, 2026-10-08, round
// 6): the drowned meander's course and widths, its hanging side canyons, the water discs fitted to the carved union, the
// boulders on the head's brow, the road's kerbs at the rim and the dam's site. A build-time computation: tools/
// skybridge-arm.mjs writes its result to skybridgeArm.generated.ts, which the map config reads (no fitting at boot —
// every map config loads with the game), and skybridgeArm.selftest.mjs fails when the two drift.
import type { ReservoirDamSite } from './reservoirDam.ts';
import type { TerrainMapConfig } from '../terrain.ts';
import { ridgeGeologyHeight, ridgeWidthAt } from '../landformGeology.ts';
import { landformPathFrame, landformPathStation, prepareLandformPath } from '../landformPath.ts';

/**
 * The arm's section (round 6; gauntlet wave 259: "a ruler-straight, uniform-height vertical extrusion", "a stadium-shaped
 * swimming pool", "a stair-stepped, saw-toothed edge"): a level floor, a short talus rising a metre and a third to the
 * walls' feet at 0.74 of the half-width (the waterline lies on it, never on a sheer face), then two tiers of sheer
 * wall split by a ledge halfway up that comes and goes along each side (up to 0.07 of the half-width; where it closes
 * the wall stands in one face, and the rim wanders with it), and a rounded brow over the last 0.12 of the half-width,
 * the slickrock curving over into the wall instead of a sharp lip.
 */
const ARM_WALL = [0.74, 0.8] as const;
const canyon = (extra: { cliffEnd?: 'nose-start' | 'nose-end' | 'both'; outline?: number; ledge?: number }) => ({
  profile: 'canyon' as const, wall: ARM_WALL, apron: 0.06, outline: extra.outline ?? 0.04, rough: 0,
  ledge: { level: 0.5, share: extra.ledge ?? 0.07, period: 70 }, brow: { share: 0.12, drop: 0.06 },
  ...(extra.cliffEnd ? { cliffEnd: extra.cliffEnd } : {}),
});
/** The arm: its middle reaches' half-width and its depth (m; ARM_WIDTHS below grade the width along it). */
const ARM_HALF = 24, ARM_DEPTH = -22.5;
/** The lake's level (m), half a metre over the arm's floor: the discs flatten their cores to it, and the floor between
 * their outlines lies under the sheet, never at its height (round 5's "water plane slices through in steps"). */
const WATER_LEVEL = -22;
/**
 * The tailwater pocket below the dam (round 7; gauntlet wave 259: "a rectangular pit with right-angled corners and a grey
 * kerb"): a short canyon running downstream from the dam's battered face, its start square under the face (the
 * concrete is its near wall) and its far end a nose — a D in plan, the river's outlet tunnel in its far wall — in the
 * arm's section (a level floor, a short talus, two tiers of wall split by a ledge, a rounded brow). Its half-width,
 * depth and length (m), and its axis's offset along the road from the dam's middle (m), where round 4's pocket stood;
 * its nose keeps 17 m from the east cross road's line (road 3), its west side 28 m from the west one's.
 */
const POCKET_HALF = 17, POCKET_DEPTH = -28, POCKET_LENGTH = 34, POCKET_ALONG = -13;
/** Road 5's junctions either side of the arm: the dam's crest is the road between them. */
const CREST_A = [-73.9, 235.78] as const, CREST_B = [42, 204] as const;
const CREST_L = Math.hypot(CREST_B[0] - CREST_A[0], CREST_B[1] - CREST_A[1]);
const CREST_U = [(CREST_B[0] - CREST_A[0]) / CREST_L, (CREST_B[1] - CREST_A[1]) / CREST_L] as const;
/** The dam's middle on the road, and the gap from the road's centre line to the arm's end and the pocket's wall (m). */
const DAM_X = -10, DAM_Z = CREST_A[1] + (DAM_X - CREST_A[0]) / CREST_U[0] * CREST_U[1], CREST_GAP = 6;
/** Half the dam's chord between its abutments (m): the arm's rim. */
const DAM_HALF_CHORD = 35;
/** Downstream, square to the road (the reservoir lies upstream): the arm meets the dam square. */
const DOWN = [-CREST_U[1], CREST_U[0]] as const;
/** The arm's square end, CREST_GAP upstream of the road's centre line under the dam's middle. */
const ARM_END = [DAM_X - DOWN[0] * CREST_GAP, DAM_Z - DOWN[1] * CREST_GAP] as const;
/**
 * A sine-generated meander (Langbein and Leopold's: the river's bearing swings as a sine of the distance along it, the
 * form a free meander takes) ending square at the dam: traced back from the arm's end, its last `straight` metres on
 * DOWN's bearing and from there swinging `swingDeg` either side over each `wavelength` metres, for `length` metres in
 * all; a point every 10 m.
 * Its tightest bend is the wavelength over 2 pi times the swing in radians.
 */
function sineMeander({ length, wavelength, swingDeg, straight }: { length: number; wavelength: number; swingDeg: number; straight: number }): [number, number][] {
  const down = Math.atan2(DOWN[1], DOWN[0]), swing = swingDeg * Math.PI / 180, sub = 0.5;
  const pts: [number, number][] = [[ARM_END[0], ARM_END[1]]];
  let x = ARM_END[0], z = ARM_END[1];
  for (let back = 0; back < length - 1e-9; back += sub) {
    // (the last `straight` metres run square into the dam, so the arm's end stands centred under its arch)
    const into = back + sub / 2 - straight;
    const th = into <= 0 ? down : down + swing * Math.sin(2 * Math.PI * into / wavelength);
    x -= Math.cos(th) * sub; z -= Math.sin(th) * sub;
    const at = back + sub;
    if (Math.abs(at / 10 - Math.round(at / 10)) < 1e-9 || at >= length - 1e-9) pts.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
  }
  return pts.reverse();
}
/**
 * The arm's course (round 6): a drowned meander, the river's bends cut into the sandstone and the lake filling them —
 * from its head under the district's south (the nose's half-disc stands inside the first point) in three bends east
 * and back to its square end at the dam: a 380 m sine meander of a 230 m wavelength swinging 65 degrees, its tightest
 * bend 32 m, wider than the canyon's reach (landformPath.ts); it keeps 28 m from every road and 56 m from the west zone
 * apron at (-139, 49).
 */
const ARM_PATH: ReadonlyArray<readonly [number, number]> = sineMeander({ length: 400, wavelength: 230, swingDeg: 65, straight: 40 });
/** The arm's half-width along its course (one per point of ARM_PATH): 13 m at the head (round 5's "perfectly rounded
 * head" gives way to a narrowing slot), 24-27 m through the bends, widening over its last 70 m to the 34 m the dam's 70 m
 * arch spans (reservoirDam.ts). */
const ARM_END_HALF = 34;
const ARM_WIDTHS: ReadonlyArray<number> = ARM_PATH.map((_, i, all) => {
  const f = i / (all.length - 1), ease = (a: number, b: number, t: number) => { const u = Math.max(0, Math.min(1, (t - a) / (b - a))); return u * u * (3 - 2 * u); };
  return Math.round((13 + 11 * ease(0, 0.28, f) + 3 * ease(0.35, 0.75, f) + (ARM_END_HALF - 27) * ease(0.82, 1, f)) * 10) / 10;
});
/**
 * A side canyon: a dry tributary slot hanging over the lake, whose mouth opens as a pour-off in the arm's wall at the
 * arm's station `at` (m from its head)
 * on its `side` (+1 the left of the arm's course, -1 the right), running out square to the arm and curling `curlDeg` over
 * its `length` to a nose — its first point stands over the arm's floor, so the carved union (the deeper arm) hides its
 * square start.
 */
function sideCanyon(at: number, side: 1 | -1, length: number, curlDeg: number, half: number) {
  const P = prepareLandformPath(ARM_PATH, ARM_HALF);
  const st = landformPathStation(P, at - P.length / 2, { x: 0, z: 0, tx: 1, tz: 0 });
  let th = Math.atan2(st.tx * side, -st.tz * side);
  let x = st.x - st.tz * side * 4, z = st.z + st.tx * side * 4;
  const path: [number, number][] = [[Math.round(x * 10) / 10, Math.round(z * 10) / 10]];
  for (let k = 1; k <= 3; k++) {
    th += curlDeg * Math.PI / 180 / 3;
    x += Math.cos(th) * length / 3; z += Math.sin(th) * length / 3;
    path.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
  }
  return { path, half };
}
/** The side canyons, the walls broken into segments between them: west off the first bend's outside toward the zone
 * apron (22 m short of it), east off the head's reach (25 m short of the middle road), and north-west off the second bend
 * into the district. */
/** The side canyons' depth (m): dry slots hanging half the arm's depth over the lake (round 6). */
const SIDE_DEPTH = -12;
const SIDE_CANYONS: ReadonlyArray<{ path: ReadonlyArray<readonly [number, number]>; half: number }> = [
  sideCanyon(120, 1, 62, 25, 9),
  sideCanyon(60, -1, 52, -20, 9),
  sideCanyon(200, 1, 60, 30, 8),
];
/** The disc cores reach this far past the walls' feet, so the water meets every wall. */
const WATER_PAD = 2;

/** The pocket's axis: from its square start under the dam's face, CREST_GAP downstream of the road's centre line at
 * POCKET_ALONG, straight downstream (DOWN) for POCKET_LENGTH. */
const POCKET_START = [DAM_X + CREST_U[0] * POCKET_ALONG + DOWN[0] * CREST_GAP, DAM_Z + CREST_U[1] * POCKET_ALONG + DOWN[1] * CREST_GAP] as const;
const POCKET_PATH: ReadonlyArray<readonly [number, number]> = [
  [Math.round(POCKET_START[0] * 10) / 10, Math.round(POCKET_START[1] * 10) / 10],
  [Math.round((POCKET_START[0] + DOWN[0] * POCKET_LENGTH) * 10) / 10, Math.round((POCKET_START[1] + DOWN[1] * POCKET_LENGTH) * 10) / 10],
];

function armTerrain() {
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const scale = { corridorScale: 1, settlementScale: 1, wetScale: 1 };
  // the arm and its side canyons: path ridges carved as one union (terrain.ts), the arm's head a nose and its end square
  // at the dam, each side canyon's head a nose
  const arm = { kind: 'ridge' as const, path: ARM_PATH, widths: ARM_WIDTHS, x: 0, z: 0, width: ARM_HALF, height: ARM_DEPTH, union: 'carve' as const,
    ...scale, geology: canyon({ cliffEnd: 'nose-start' }) };
  // (the side canyons hang over the lake: dry slots half as deep, their floors ending at a pour-off in the arm's wall)
  const sides = SIDE_CANYONS.map((c) => ({ kind: 'ridge' as const, path: c.path, x: 0, z: 0, width: c.half, height: SIDE_DEPTH,
    union: 'carve' as const, ...scale, geology: canyon({ cliffEnd: 'nose-end', ledge: 0.08 }) }));
  // (round 7) the tailwater pocket: its start square under the dam's face, its far end a nose, the arm's section
  const pocketForm = { kind: 'ridge' as const, path: POCKET_PATH, x: 0, z: 0, width: POCKET_HALF, height: POCKET_DEPTH, union: 'carve' as const,
    ...scale, geology: canyon({ cliffEnd: 'nose-end', ledge: 0.06 }) };
  const landforms = [arm, ...sides, pocketForm];
  // the carved union's depth at a point (the arm and its side canyons as terrain.ts sums them), for fitting the water
  const carved = [arm, ...sides].map((form) => {
    const outline = form.geology.outline ?? 0, widths = (form as { widths?: ReadonlyArray<number> }).widths ?? null;
    const path = prepareLandformPath(form.path, (widths ? Math.max(...widths) : form.width) * (1 + outline) + 4);
    return { ...form, x: path.cx, z: path.cz, length: path.length, yawDeg: 0, _path: path, ...(widths ? { _widths: Float64Array.from(widths) } : {}) };
  });
  const frame = { lx: 0, lz: 0 };
  const depthAt = (x: number, z: number) => {
    let d = 0;
    for (const form of carved) if (landformPathFrame(form._path, x, z, frame)) d = Math.min(d, ridgeGeologyHeight(form, frame.lx, frame.lz, 1) ?? 0);
    return d;
  };
  // the water (round 6): discs along each canyon's curve (the arm's every 8 m, a side canyon's every 6 m), each an
  // ellipse long along the curve (its authored radii: 1.6 times as long as wide), its core reaching WATER_PAD past the
  // walls' feet — the long sides keep the waterline along the walls nearly straight where round 5's circles scalloped it
  // — shrunk where a bend's inner wall or a nose closes in, so no outline climbs past the ledge (24 points of it all on
  // ground at least 0.25 of the depth down): the wet core (0.85 of the outline) covers the floor and the talus's foot;
  // the pocket's round discs along its axis and in its corners
  const round = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] as const;
  type Radii = typeof round | readonly [number, number, number, number, number, number, number, number, number, number, number, number,
    number, number, number, number];
  const lakes: { x: number; z: number; r: number; depth: number; level: number; bankBand: number; radii: Radii }[] = [];
  const disc = (x: number, z: number, core: number, level: number, radii: Radii = round, depth = 1.2) =>
    lakes.push({ x: r1(x), z: r1(z), r: r1(core / 0.96), depth, level, bankBand: 0.98, radii });
  /** An ellipse's radii (the 16 bearings from +x toward +z, as shoreline.ts reads them), its long axis on `t`. */
  const ellipse = (t: number, ratio: number): Radii => Array.from({ length: 16 }, (_, k) => {
    const d = k / 16 * Math.PI * 2 - t, b = 1 / ratio;
    return Math.round(b / Math.sqrt(Math.cos(d) ** 2 * b * b + Math.sin(d) ** 2) * 1000) / 1000;
  }) as unknown as Radii;
  const radiusAt = (radii: Radii, a: number) => {
    const u = ((a / (Math.PI * 2)) % 1 + 1) % 1 * 16, i = Math.floor(u), f = u - i;
    return radii[i & 15] + (radii[(i + 1) & 15] - radii[i & 15]) * f;
  };
  const fit = (x: number, z: number, core: number, radii: Radii): number => {
    for (let r = core; r >= 2; r -= 0.5) {
      let ok = true;
      for (let k = 0; k < 24 && ok; k++) {
        const a = k / 24 * Math.PI * 2, rr = r * radiusAt(radii, a);
        if (depthAt(x + Math.cos(a) * rr, z + Math.sin(a) * rr) > ARM_DEPTH * 0.25) ok = false;
      }
      if (ok) return r;
    }
    return 0;
  };
  {
    // the arm's discs: long along the curve where it runs straight, rounder on its bends (where a long disc's ends meet
    // the outer wall and shrink), round round the head's nose, and long ACROSS the arm over its last 34 m, where it widens
    // to the dam and its square end fades
    const form = carved[0], P = form._path, st = { x: 0, z: 0, tx: 1, tz: 0 }, sa = { x: 0, z: 0, tx: 1, tz: 0 }, sb = { x: 0, z: 0, tx: 1, tz: 0 };
    for (let s = 0; s <= P.length;) {
      const lx = s - P.length / 2;
      landformPathStation(P, lx, st);
      landformPathStation(P, lx - 6, sa); landformPathStation(P, lx + 6, sb);
      const turn = Math.abs(Math.atan2(sa.tx * sb.tz - sa.tz * sb.tx, sa.tx * sb.tx + sa.tz * sb.tz)) / 12; // radians a metre
      const end = s > P.length - 34, head = s < 26;
      const ratio = head ? 1 : end ? 1.6 : turn > 1 / 45 ? 1.1 : turn > 1 / 80 ? 1.3 : 1.6;
      const along = Math.atan2(st.tz, st.tx) + (end ? Math.PI / 2 : 0);
      const radii = ellipse(along, ratio);
      const across = ridgeWidthAt(form, lx) * ARM_WALL[0] + WATER_PAD;
      // (the core's long radius: along the curve the across radius times the ratio; across the end, the across radius)
      const r = fit(st.x, st.z, end ? across : across * ratio, radii);
      if (r >= 3) disc(st.x, st.z, r, WATER_LEVEL, radii, WATER_LEVEL - ARM_DEPTH);
      s += head ? 4 : end ? 5 : 10;
    }
  }
  // the gaps: wherever the canyons' floor (at least 0.97 of the depth down) lies outside every disc's wet core (0.85 of its
  // outline: the water mask's half-wet line lies a little inside the flattened core) — round a nose,
  // in a side canyon's mouth, along a bend's outer wall — a small round disc fitted there, until the floor is covered (so no
  // floor lies under the waterline without its water; reservoirDam.selftest)
  {
    const inCore = (x: number, z: number) => lakes.some((l) => {
      const dx = x - l.x, dz = z - l.z, d = Math.hypot(dx, dz);
      return d < l.r * 0.85 * radiusAt(l.radii, Math.atan2(dz, dx));
    });
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const form of carved) { const P = form._path; for (let i = 0; i < P.xs.length; i++) { x0 = Math.min(x0, P.xs[i]); x1 = Math.max(x1, P.xs[i]); z0 = Math.min(z0, P.zs[i]); z1 = Math.max(z1, P.zs[i]); } }
    for (let z = z0 - 40; z <= z1 + 40; z += 2) for (let x = x0 - 40; x <= x1 + 40; x += 2) {
      if (depthAt(x, z) > ARM_DEPTH * 0.97 || inCore(x, z)) continue;
      // the disc's centre: from the uncovered point a few metres down the floor's slope (toward the deeper floor), as far as
      // a disc fits there and still covers the point
      const gx = depthAt(x + 1, z) - depthAt(x - 1, z), gz = depthAt(x, z + 1) - depthAt(x, z - 1), gl = Math.hypot(gx, gz);
      const ux = gl > 1e-6 ? -gx / gl : 0, uz = gl > 1e-6 ? -gz / gl : 0;
      for (let k = 0; k <= 4; k++) {
        const cx = x + ux * k, cz = z + uz * k, r = fit(cx, cz, 7, round);
        if (r >= 2 && k < r * 0.8) { disc(cx, cz, r, WATER_LEVEL, round, WATER_LEVEL - ARM_DEPTH); break; }
      }
    }
  }
  // the square end's corners, where the long discs shrink to fit its fade: by each wall two round ones, a large one where
  // the axis discs' reach along the wall ends and a small one up to the dam's face (round 4's corners)
  {
    const floor = ARM_END_HALF * ARM_WALL[0], fade = carved[0].length * 0.03, n = [CREST_U[0], CREST_U[1]];
    for (const side of [-1, 1]) for (const [back, size] of [[fade + 11, 10], [fade + 3.5, 5]] as const) {
      const across = floor + WATER_PAD - size;
      disc(ARM_END[0] - DOWN[0] * back + n[0] * side * across, ARM_END[1] - DOWN[1] * back + n[1] * side * across, size, WATER_LEVEL, round,
        WATER_LEVEL - ARM_DEPTH);
    }
  }
  // (round 7) the pocket's water: its own carved depth (it lies below the arm's level and apart from it), round discs
  // fitted to its D — a row along the square start under the dam's face, then along its axis into the nose — and the gaps
  // filled as the arm's are, at the pocket's level
  const pocketCarved = (() => {
    const outline = pocketForm.geology.outline ?? 0;
    const path = prepareLandformPath(pocketForm.path, pocketForm.width * (1 + outline) + 4);
    return { ...pocketForm, x: path.cx, z: path.cz, length: path.length, yawDeg: 0, _path: path };
  })();
  const pocketDepthAt = (x: number, z: number) =>
    landformPathFrame(pocketCarved._path, x, z, frame) ? Math.min(0, ridgeGeologyHeight(pocketCarved, frame.lx, frame.lz, 1) ?? 0) : 0;
  const pocketFit = (x: number, z: number, core: number): number => {
    for (let r = core; r >= 2; r -= 0.5) {
      let ok = true;
      for (let k = 0; k < 24 && ok; k++) {
        const a = k / 24 * Math.PI * 2;
        if (pocketDepthAt(x + Math.cos(a) * r, z + Math.sin(a) * r) > POCKET_DEPTH * 0.25) ok = false;
      }
      if (ok) return r;
    }
    return 0;
  };
  {
    const pfloor = POCKET_HALF * ARM_WALL[0], fade = POCKET_LENGTH * 0.06, n = [CREST_U[0], CREST_U[1]];
    const at = (back: number, across: number) => [POCKET_START[0] + DOWN[0] * back + n[0] * across, POCKET_START[1] + DOWN[1] * back + n[1] * across];
    // the row along the start: under the face, across the floor
    for (let across = -pfloor + 4; across <= pfloor - 4 + 1e-9; across += (2 * pfloor - 8) / 4) {
      const [x, z] = at(fade + 5, across), r = pocketFit(x, z, 6 + WATER_PAD);
      if (r >= 3) disc(x, z, r, POCKET_DEPTH);
    }
    // along the axis, into the nose
    for (let back = fade + 9; back <= POCKET_LENGTH - 4; back += 6) {
      const [x, z] = at(back, 0), r = pocketFit(x, z, pfloor + WATER_PAD);
      if (r >= 3) disc(x, z, r, POCKET_DEPTH);
    }
    // the gaps: the pocket's floor (at least 0.97 of its depth down) outside every disc's wet core
    const inCore = (x: number, z: number) => lakes.some((l) => Math.hypot(x - l.x, z - l.z) < l.r * 0.85 * radiusAt(l.radii, Math.atan2(z - l.z, x - l.x)));
    for (let back = 0; back <= POCKET_LENGTH + 4; back += 1.5) for (let across = -POCKET_HALF; across <= POCKET_HALF; across += 1.5) {
      const [x, z] = at(back, across);
      if (pocketDepthAt(x, z) > POCKET_DEPTH * 0.97 || inCore(x, z)) continue;
      const [cx, cz] = at(Math.min(back + 2, POCKET_LENGTH), across * 0.85), r = pocketFit(cx, cz, 6);
      if (r >= 2) disc(cx, cz, r, POCKET_DEPTH);
    }
  }
  // the nose's centre (where its half-disc turns round the head: a reach in from the first point along the curve) and
  // the head's outward bearing, for the boulders on its brow
  const A = carved[0]._path, inset = ARM_WIDTHS[0] * (1 + (carved[0].geology.outline ?? 0));
  let hi = 0;
  while (hi + 1 < A.s.length && A.s[hi + 1] < inset) hi++;
  const out = [A.xs[0] - A.xs[2], A.zs[0] - A.zs[2]], ol = Math.hypot(out[0], out[1]);
  return { landforms, lakes, armLength: carved[0].length, armCentre: [carved[0].x, carved[0].z] as const,
    sideCentres: carved.slice(1).map((c) => [c.x, c.z] as const),
    head: { x: A.xs[hi], z: A.zs[hi], ux: out[0] / ol, uz: out[1] / ol }, depthAt, pocketDepthAt,
    pocketNose: (() => {
      // the nose's half-disc centre (landformGeology.ts ridgeNose: a width and its outline in from the last point, never
      // short of the middle — the pocket is about as long as it is wide, so its nose turns round from the middle)
      const back = POCKET_LENGTH / 2 + Math.max(0, POCKET_LENGTH / 2 - POCKET_HALF * (1 + (pocketForm.geology.outline ?? 0)));
      return { x: POCKET_START[0] + DOWN[0] * back, z: POCKET_START[1] + DOWN[1] * back, back };
    })() };
}

/**
 * The boulders on the head's brow (round 6, the coordinator after wave 259: round 5b's kerb ring round the head read as
 * "swimming-pool coping"; a natural slickrock edge instead, kerbs only on roads): fallen sandstone blocks along the
 * brow round the nose, a hull's width apart or less, standing where the kerbs stood against the slide into the water
 * (the swap test, 2026-10-07: 2 of 55 games lost a hull over the head's east rim). Sizes, gaps and set-backs vary by a
 * hash of their index (no stream of their own).
 */
function headBoulders(ARM: ReturnType<typeof armTerrain>) {
  const h = (i: number, k: number) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  const { x, z, ux, uz } = ARM.head, side = [-uz, ux];
  const rocks: { form: 'outcrop'; geology: 'sandstone'; x: number; z: number; radius: number; height: number; yawDeg: number; shed: number; name: string }[] = [];
  // the lobed brow's outermost reach (the section's extent, 0.99 of the half-width, and its outline's 4 %)
  const reach = ARM_WIDTHS[0] * 0.99 * 1.04 + 1.5;
  let a = -100, i = 0;
  while (a <= 100) {
    const t = a * Math.PI / 180, dx = ux * Math.cos(t) + side[0] * Math.sin(t), dz = uz * Math.cos(t) + side[1] * Math.sin(t);
    // on the lip: out along the ray from inside the head to where the carved union meets the plain's height (the lobes
    // bring it in short of the reach on some bearings), the block set back by most of its radius and a varied step —
    // round 6's first pass stood every block at the reach, and where the lip came in short of it the south cross road
    // ran under two of them (the scenery pass leaves a rock on a road out)
    let r = ARM_WIDTHS[0] * 0.5;
    while (ARM.depthAt(x + dx * r, z + dz * r) < -0.05 && r < reach + 12) r += 0.25;
    const radius = 1.5 + h(i, 2) * 0.8;
    r += radius * 0.8 + h(i, 1) * 1.2;
    const px = x + dx * r, pz = z + dz * r;
    // (a ray that meets the canyon again — the first bend's water past the head's side — has no brow to stand on)
    if (ARM.depthAt(px, pz) < -0.05) { a += 8; i++; continue; }
    rocks.push({ form: 'outcrop', geology: 'sandstone', x: Math.round(px * 10) / 10, z: Math.round(pz * 10) / 10,
      radius: Math.round(radius * 100) / 100, height: Math.round((1.2 + h(i, 3) * 0.7) * 100) / 100,
      yawDeg: Math.round(h(i, 4) * 180), shed: 0.4, name: "the head's brow, a fallen block" });
    // the next block a hull's width on at most (2.6-3.4 m of air between them)
    a += (3.2 + h(i, 5) * 1.6 + 2 * rocks[rocks.length - 1].radius) / r * 180 / Math.PI;
    i++;
  }
  return rocks;
}

/**
 * The fallen blocks round the tailwater pocket's brow (round 7: round 4's kerb ring and rail round the pocket go — "a
 * rectangular pit ... and a grey kerb"): as the head's, along the lip round the nose and back up both sides toward the
 * road, a hull's width apart or less; the road's own parapet guards the side under it (the map's road filter leaves out a
 * block on its carriageway).
 */
function pocketBoulders(ARM: ReturnType<typeof armTerrain>) {
  const h = (i: number, k: number) => { const v = Math.sin(i * 19.9137 + k * 47.581 + 3.7) * 24634.6345; return v - Math.floor(v); };
  const { x, z } = ARM.pocketNose, ux = DOWN[0], uz = DOWN[1], side = [CREST_U[0], CREST_U[1]];
  const rocks: { form: 'outcrop'; geology: 'sandstone'; x: number; z: number; radius: number; height: number; yawDeg: number; shed: number; name: string }[] = [];
  const reach = POCKET_HALF * 1.2 + 8;
  let a = -150, i = 0;
  while (a <= 150) {
    const t = a * Math.PI / 180, dx = ux * Math.cos(t) + side[0] * Math.sin(t), dz = uz * Math.cos(t) + side[1] * Math.sin(t);
    let r = POCKET_HALF * 0.5;
    while (ARM.pocketDepthAt(x + dx * r, z + dz * r) < -0.05 && r < reach) r += 0.25;
    const radius = 1.4 + h(i, 2) * 0.9;
    r += radius * 0.8 + h(i, 1) * 1.2;
    const px = x + dx * r, pz = z + dz * r;
    // (past the pocket's start the ray runs out under the road and the dam: no lip there)
    const back = (px - POCKET_START[0]) * DOWN[0] + (pz - POCKET_START[1]) * DOWN[1];
    if (back > 2 && ARM.pocketDepthAt(px, pz) >= -0.05 && ARM.depthAt(px, pz) >= -0.05) {
      rocks.push({ form: 'outcrop', geology: 'sandstone', x: Math.round(px * 10) / 10, z: Math.round(pz * 10) / 10,
        radius: Math.round(radius * 100) / 100, height: Math.round((1.1 + h(i, 3) * 0.8) * 100) / 100,
        yawDeg: Math.round(h(i, 4) * 180), shed: 0.4, name: "the tailwater's brow, a fallen block" });
    }
    a += (3.2 + h(i, 5) * 1.6 + 2 * radius) / r * 180 / Math.PI;
    i++;
  }
  return rocks;
}

/** The kerbs where the road meets the rims (round 6: kerbs only on roads — round 5b's ring round the head and its runs
 * up the rims go): each side, from the end of the road's upstream parapet (reservoirDam.ts: the dam's half-chord and
 * 8 m) to the arm's rim beside its square end, where the road's banks grade the corner. */
function armRimGuards(): (readonly [number, number, number, number])[] {
  const v = [CREST_U[1], -CREST_U[0]];
  const r1 = (q: number[]) => q.map((x) => Math.round(x * 10) / 10) as unknown as readonly [number, number, number, number];
  const off = ARM_END_HALF * (ARM_WALL[1] + 0.07 + 0.12) + 1, from = 5;
  const runs: (readonly [number, number, number, number])[] = [];
  for (const side of [-1, 1]) {
    const parapetEnd = [DAM_X + CREST_U[0] * side * (DAM_HALF_CHORD + 8) + v[0] * 6, DAM_Z + CREST_U[1] * side * (DAM_HALF_CHORD + 8) + v[1] * 6];
    const rim = [ARM_END[0] + CREST_U[0] * side * off - DOWN[0] * from, ARM_END[1] + CREST_U[1] * side * off - DOWN[1] * from];
    runs.push(r1([...parapetEnd, ...rim]));
  }
  return runs;
}

/** The dam on road 5 over the arm's end (reservoirDam.ts, laid by the 'dam' dressing kit). */
type TerrainSettingsOf = NonNullable<TerrainMapConfig['terrain']>;
/** Everything the map config reads of the arm (skybridgeArm.generated.ts holds it as data). */
export interface SkybridgeArmData {
  landforms: NonNullable<TerrainSettingsOf['landforms']>;
  lakes: NonNullable<TerrainSettingsOf['lakes']>;
  rocks: ReadonlyArray<{ form: 'outcrop'; geology: 'sandstone'; x: number; z: number; radius: number; height: number; yawDeg: number; shed: number; name: string }>;
  arm: { path: ReadonlyArray<readonly [number, number]>; widths: ReadonlyArray<number>; centre: readonly [number, number]; length: number; endHalf: number; waterLevel: number };
  sides: ReadonlyArray<{ path: ReadonlyArray<readonly [number, number]>; half: number; centre: readonly [number, number] }>;
  dam: ReservoirDamSite;
}

/** The arm, computed (deterministic: no stream, no seed). */
export function computeSkybridgeArm(): SkybridgeArmData {
  const ARM = armTerrain();
  const round = (v: number, k = 100) => Math.round(v * k) / k;
  return {
    landforms: ARM.landforms,
    lakes: ARM.lakes,
    rocks: [...headBoulders(ARM), ...pocketBoulders(ARM)],
    arm: { path: ARM_PATH, widths: ARM_WIDTHS, centre: [round(ARM.armCentre[0]), round(ARM.armCentre[1])], length: round(ARM.armLength),
      endHalf: ARM_END_HALF, waterLevel: WATER_LEVEL },
    sides: SIDE_CANYONS.map((c, i) => ({ path: c.path, half: c.half, centre: [round(ARM.sideCentres[i][0]), round(ARM.sideCentres[i][1])] as const })),
    dam: {
      x: DAM_X, z: Math.round(DAM_Z * 100) / 100, roadDeg: Math.atan2(CREST_U[1], CREST_U[0]) * 180 / Math.PI,
      halfChordM: DAM_HALF_CHORD, archRadiusM: 80, abutmentM: round(CREST_GAP + ARM.armLength * 0.03), roadHalfM: 5.2,
      reservoirBedY: ARM_DEPTH, tailwaterBedY: POCKET_DEPTH, waterY: WATER_LEVEL,
      // (round 7) the tailwater's square start under the face: its walls' tops either side of its axis (the arm's section,
      // 0.8 of the half-width), its near wall the face's line CREST_GAP downstream of the road's
      pocketFromM: round(POCKET_ALONG - POCKET_HALF * ARM_WALL[1]), pocketToM: round(POCKET_ALONG + POCKET_HALF * ARM_WALL[1]),
      pocketHalfM: round(POCKET_HALF * ARM_WALL[1]), pocketWallM: CREST_GAP,
      rimGuards: armRimGuards(),
      // the outlet's portal at the foot of the nose's far wall, facing back up the tailwater to the dam
      outlet: (() => {
        const back = ARM.pocketNose.back + POCKET_HALF * ARM_WALL[0] - 0.6;
        return { x: round(POCKET_START[0] + DOWN[0] * back), z: round(POCKET_START[1] + DOWN[1] * back),
          yawDeg: round(Math.atan2(-DOWN[1], -DOWN[0]) * 180 / Math.PI) };
      })(),
      naturalTailwater: true,
    },
  };
}

