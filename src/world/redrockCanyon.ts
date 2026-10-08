/** Redrock's single authored drainage system, shared by playable ground and outland. */
const REDROCK_CANYON = Object.freeze({
  centerX: 8, axisSlope: 0.16, floorHalfWidth: 210, mouthHalfWidth: 330,
  flareStart: 230, flareEnd: 430, floorY: 4, floorGrade: 0.004,
  westHeight: 64, eastHeight: 86,
  // A recessed amphitheatre closes each drainage beyond the deployment areas.
  // Its broken escarpment belongs to the regional geology, away from the rim.
  closureStart: 740,
  // The Redrock lane (2026-10-07, owner: "redrock is really rough rn"; the walls read as smooth clay ramps). Every wall
  // is a Wadi Rum jebel's section: a talus apron, the pale Disi sandstone's rounded and runnelled base up to this height
  // over the floor (splat.formation draws its boundary just above it), a narrow bench, then the Umm Ishrin's sheer red cliff with
  // buttress masses, flutes, chimneys and bedding ledges, under a skyline of beehive domes.
  disiTopM: 9,
  // The heads close each mouth with the tallest massifs (their height over the side walls'): the views past both
  // mouths end on jebels, not on a low sand rise.
  headLiftM: 70,
  // The ravines: their flat sand beds' half-width before the side walls' talus starts (30 m: the two cross tracks run up
  // to 28 m off a ravine's axis, so their roads stay on the bed, not on a wall's talus).
  ravineBedHalfWidth: 30,
  // Round 9 (2026-10-08, the gauntlet's wave 261: "a sharp pointed spire like an alpine horn", "a single tall slab-like
  // shard ... like a monument spire"): where a ravine's wall meets the canyon's the jebel ends in a rounded nose, both
  // distances eased back near the corner (a smooth minimum over this many metres at a right-angled corner, more as the
  // corner sharpens) — the oblique ravines and the flaring mouths had left 40-50 degree knife-edged fins that read
  // end-on as spires.
  cornerRoundM: 50,
  // The wadis through each head (round 9): their axes' offsets across the canyon (m; the north head's mirrored).
  headWadis: [-178, 168] as readonly number[],
});

function ramp(low: number, high: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

/** A stable hash of an integer and a salt, in [0, 1). */
function hash(i: number, salt: number): number {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(salt | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Smooth 1D value noise in [0, 1]: the slow wander of a wall's parts along its run. */
function wander(t: number, salt: number): number {
  const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f);
  const a = hash(i, salt);
  return a + (hash(i + 1, salt) - a) * u;
}

/** Rounded vertical grooves along a wall run, 0..1 at their deepest: flutes every 8-16 m (a domain-warped cosine). */
function flute(s: number, salt: number): number {
  const phase = s / 11 + 0.8 * wander(s / 31, salt + 11) + hash(3, salt);
  const notch = Math.max(0, Math.cos(phase * Math.PI * 2));
  return notch * notch * (0.45 + 0.55 * wander(s / 17 + 2.3, salt + 12));
}

/** The gullies: a broad cleft every ~70 m of wall on about half the cells, as metres it sets the cliff back. (Half-width
 * 6-10 m and a set-back under 0.8 of it: the 1.33 m grid draws the cleft — a narrower slot aliased into flat facets the
 * material painted as sand, pale "flames" up the face — and the face never turns past ~85 degrees, so the height
 * field stays a function a 2 mm seam probe reads as continuous.) */
function chimney(s: number, salt: number): number {
  const cell = Math.floor(s / 70);
  let back = 0;
  for (let c = cell - 1; c <= cell + 1; c++) {
    if (hash(c, salt + 21) < 0.45) continue;
    const at = (c + 0.2 + 0.6 * hash(c, salt + 22)) * 70, half = 6 + 4 * hash(c, salt + 23);
    const q = (s - at) / half;
    if (q * q >= 1) continue;
    back = Math.max(back, half * (0.5 + 0.25 * hash(c, salt + 24)) * (1 - q * q) ** 2);
  }
  return back;
}

/** The talus cone under each gully (round 9, the gauntlet: "a ruler-straight seam where the wall meets the sand, no
 * talus, sand ramps or contact shadow"): metres it raises the talus head at s, on chimney()'s own cells, spreading about
 * 2.4 gully half-widths to each side. */
function gullyCone(s: number, salt: number): number {
  const cell = Math.floor(s / 70);
  let cone = 0;
  for (let c = cell - 1; c <= cell + 1; c++) {
    if (hash(c, salt + 21) < 0.45) continue;
    const at = (c + 0.2 + 0.6 * hash(c, salt + 22)) * 70, half = (6 + 4 * hash(c, salt + 23)) * 2.4;
    const q = (s - at) / half;
    if (q * q >= 1) continue;
    cone = Math.max(cone, (4 + 5 * hash(c, salt + 25)) * (1 - q * q) ** 2);
  }
  return cone;
}

/** One field of domes on a jittered grid of `cell` metres: their union in metres at (d, s), radius r0..r0+rv, height
 * h0..h0+hv (shares of H) and at most capR of the radius. (Round 9, the gauntlet: "sawtooth rows of sharp spikes" — a
 * beehive 15 m tall on an 8 m radius stood a tooth: each dome now rounds over, cos(pi/2 r^1.6), no taller than about
 * half as wide, its foot easing into the cap.) */
function domeField(d: number, s: number, H: number, cell: number, r0: number, rv: number, h0: number, hv: number,
  capR: number, salt: number): number {
  const ci = Math.floor(d / cell), cj = Math.floor(s / cell);
  let best = 0;
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    const key = i * 7919 + j;
    const cd = (i + 0.5 + 0.7 * (hash(key, salt + 31) - 0.5)) * cell;
    const cs = (j + 0.5 + 0.7 * (hash(key, salt + 32) - 0.5)) * cell;
    const radius = r0 + rv * hash(key, salt + 33);
    const r2 = ((d - cd) ** 2 + (s - cs) ** 2) / (radius * radius);
    if (r2 >= 1) continue;
    const height = Math.min(H * (h0 + hv * hash(key, salt + 34)), capR * radius);
    best = Math.max(best, height * Math.cos(1.5708 * r2 ** 0.8));
  }
  return best;
}

/** The jebels' tops `back` metres behind the nearest lip, at world-plan (u, v): beehive domes crowding the rim, broad
 * domes on the massif behind. One field for every wall, so two walls' tops never meet in a step. */
function domes(u: number, v: number, back: number, H: number, detail: number): number {
  // (the coarse ring past the square keeps the broad domes, which its 10-20 m rows resolve, and drops the beehives)
  const rim = detail * (1 - ramp(28, 52, back)), massif = ramp(12, 40, back);
  return Math.max(rim > 0 ? rim * domeField(u, v, H, 24, 9, 8, 0.06, 0.14, 0.7, 401) : 0,
    massif > 0 ? massif * domeField(u, v, H, 68, 24, 18, 0.05, 0.11, 0.42, 406) : 0);
}

/** The lip depth of the last jebelSection call (its cliff's top, metres from the toe), and the same without the flutes:
 * the domes stand behind the second (round 9: a dome masked at every flute's lip stood a row of teeth on the crest). */
let sectionLip = 0, sectionCrownLip = 0;

/**
 * One jebel wall's height over its toe at depth d (metres into the wall from the toe line) and along-wall position s,
 * without its domes (canyonWall adds them once, behind the nearest lip); H the wall's full height, `detail` 1 where the
 * playable terrain draws it and 0 where only the coarse ring does (the flutes, chimneys, runnels and ledges fade there),
 * `apron` 0..1 widening the foot towards the mouths; `fine` (detail by default) the share of the flutes, gullies, cones and
 * ledges, which fade at a ravine's nose where two walls' runs meet. Sets sectionLip and sectionCrownLip.
 */
function jebelSection(d: number, s: number, H: number, detail: number, apron: number, salt: number,
  fine = detail): number {
  const w1 = wander(s / 64, salt), w2 = wander(s / 27 + 3.7, salt + 1), w3 = wander(s / 41 + 8.1, salt + 2);
  // where the coarse ring takes the walls over (detail 0) the section lays back to ~55 degrees, a face its 10 m rows can
  // follow (the seam's chords stay within 3 m of the playable terrain's last row)
  const soft = 1 - detail;
  // the talus apron: fallen blocks and banked sand, concave, about 35 degrees at its head — and under each gully a cone of
  // what fell down it (round 9)
  const cone = fine * gullyCone(s, salt);
  const talusW = 7 + 6 * w1 + 8 * apron + 6 * soft + 1.2 * cone, talusH = 3 + 2.5 * w2 + cone;
  // the Disi base: steep at its foot, rounding over into the bench; its top wanders along the wall (round 9: the bench at
  // one height was a ruled line along every wall)
  const disiTop = Math.max(talusH + 3, Math.min(H * 0.45, REDROCK_CANYON.disiTopM + 5 * (w3 - 0.5)
    + 4 * fine * (wander(s / 23 + 5.3, salt + 9) - 0.5)));
  const disiW = 10 + 7 * w2 + 10 * apron + 10 * soft, disiEnd = talusW + disiW;
  // (in front of the bench the lip lies further in whatever it is: no dome stands there)
  sectionLip = Infinity; sectionCrownLip = Infinity;
  if (d <= 0) return 0;
  if (d <= talusW) return talusH * (d / talusW) ** 1.6;
  // (round 9, the gauntlet's wave 261: "a row of white spiky blades along its toe like fence stakes" — the base's
  // runnels, every 20 m and 2.4 m deep, laid each groove's floor below the sand's angle: the Disi base runs smooth)
  if (d <= disiEnd) {
    const u = (d - talusW) / disiW;
    return talusH + (disiTop - talusH) * (1 - (1 - u) ** 2.2);
  }
  // the bench on the Disi's top, set back by the buttress masses; then the Umm Ishrin's face, its flutes and chimneys
  // cut back into it. (A cleft's floor climbs steeply from the bench to the set-back face — scree in the cleft at 58
  // degrees — where the bench running on flat into every groove laid a sand floor in each: pale flames up the face.)
  const benchW = 2 + 9 * w3;
  const bench = disiEnd + benchW + 8 * wander(s / 52 + 1.9, salt + 3);
  const gully = fine * chimney(s, salt), foot = bench + fine * 1.6 * flute(s, salt) + gully;
  // near vertical over most of its height: a 78-82 degree face rounding at its foot and its lip
  const rise = H - disiTop - 0.8, run = Math.max(4, rise * (0.19 + 0.55 * soft));
  sectionLip = foot + run; sectionCrownLip = bench + gully + run;
  if (d <= bench) return disiTop + 0.8 * (d - disiEnd) / (bench - disiEnd);
  const cleft = disiTop + 0.8 + 1.6 * (d - bench);
  if (d <= foot) return Math.min(H, cleft);
  if (d >= sectionLip) return H;
  const t = (d - foot) / run;
  // (a trapezoid of slope: eased in over the first 12 % and out over the last, linear between — continuous in value and
  // slope, y = t^2 / (2 * 0.12 * 0.88) on the ends)
  let y = t < 0.12 ? (t * t) / 0.2112 : t > 0.88 ? 1 - ((1 - t) * (1 - t)) / 0.2112 : (t - 0.06) / 0.88;
  // where the ring draws it, a rounded massif: steep at its foot, its shoulder rounding over (no sharp lip for the rows)
  if (soft > 0) { const e = t * t * (3 - 2 * t); y += soft * (e * (2 - e) - y); }
  // bedding ledges every ~9-13 m: the face eases back for a moment at each bed (its slope 0.7-1.3 of the face's)
  const bed = 9 + 4 * w1, phase = 6.2832 * (y * rise + 7 * w2) / bed;
  y += fine * 0.3 * (bed / rise) * Math.sin(phase) / 6.2832 * (1 - (2 * y - 1) ** 8);
  return Math.min(H, Math.max(cleft, disiTop + 0.8 + rise * y));
}

/** Slightly oblique north/south axis; the mouth does not become a radial bowl. */
export function redrockCanyonCenter(z: number): number {
  return REDROCK_CANYON.centerX + REDROCK_CANYON.axisSlope * z;
}

/** The two deployment mouths flare once, then continue at a fixed width outside the map. */
export function redrockCanyonFloorHalfWidth(z: number): number {
  return REDROCK_CANYON.floorHalfWidth + (REDROCK_CANYON.mouthHalfWidth - REDROCK_CANYON.floorHalfWidth)
    * ramp(REDROCK_CANYON.flareStart, REDROCK_CANYON.flareEnd, Math.abs(z));
}

/** The two side ravines' axes: z where each crosses `across`. */
function southRavineZ(across: number): number { return -207 + across * 0.035; }
function northRavineZ(across: number): number { return 110 + Math.abs(across) * 0.24; }

/** How far a wall's toe stands back from its floor's edge at z: broad alcoves and buttresses along the run. */
function recessAt(z: number, west: boolean): number {
  // Unequal buttresses, talus shelves and side washes continue through the
  // whole region. Fading this sculpture out at |z|=300 made the boundary
  // flanks become smooth ramps. Recesses only cut away from the valley floor.
  const sculpt = 0.94 + 0.06 * Math.sin(z * 0.007 + (west ? 0.5 : 2.4));
  const mouthApron = ramp(330, 430, Math.abs(z)) * (1 - ramp(560, 720, Math.abs(z)));
  return 32 * mouthApron + sculpt * (24
    + 12 * Math.sin(z * 0.029 + (west ? 0.8 : 2.5))
    + 6 * Math.sin(z * 0.071 + (west ? 2.1 : 0.3)));
}

function canyonWall(across: number, along: number, z: number, toeDistance: number, detail: number,
  ravines: boolean, lift = 0): number {
  const west = across < 0;
  const sculpt = 0.94 + 0.06 * Math.sin(z * 0.007 + (west ? 0.5 : 2.4));
  const depth = toeDistance - recessAt(z, west);
  if (depth <= 0) return 0;
  // (the mouths' walls lay their feet out wider; the heads past them close the basin on their own, compact feet)
  const apron = ravines ? ramp(220, 330, Math.abs(z)) : 0;
  const height = west
    ? REDROCK_CANYON.westHeight + 6 * ramp(-380, -40, z) - 12 * ramp(170, 360, z)
    : REDROCK_CANYON.eastHeight - 2 * ramp(-280, -40, z) + 6 * ramp(100, 380, z);
  const bedding = 1 + sculpt * (0.035 * Math.sin(z * 0.031) + 0.018 * Math.sin(z * 0.067));
  const H = height * bedding + lift, salt = west ? 101 : 211;
  // The side ravines are sand-floored siqs cut through the wall: their own jebel walls rise from each bed's edge (the bed
  // keeps the floor's datum all the way through). Round 9: where a ravine's wall meets the canyon's, both distances ease
  // back over cornerRoundM (a smooth minimum), so the jebel ends in a rounded nose; its flutes and gullies fade at the nose,
  // where the two walls' runs meet.
  let ease = 0, near = 0, d0 = Infinity, d1 = Infinity, e0 = 0, e1 = 0, q0 = 0, q1 = 0;
  if (ravines) {
    // the canyon wall's inward normal in the world plan (across = x - centre(z)): its run along the flaring floor, not
    // the alcoves' and buttresses' local wiggle (recessAt), which would read a fin into every bay of a straight wall
    const sa = west ? -1 : 1;
    const az = -(redrockCanyonFloorHalfWidth(z + 1) - redrockCanyonFloorHalfWidth(z - 1)) / 2 - REDROCK_CANYON.axisSlope * sa;
    for (let k = 0; k < 2; k++) {
      const off = z - (k === 0 ? southRavineZ(across) : northRavineZ(across)), side = off < 0 ? 0 : 1;
      const d = Math.abs(off) - REDROCK_CANYON.ravineBedHalfWidth - 6 * wander(across / 37, salt + 60 + 20 * k + 7 * side);
      if (d > 170) continue; // past its wall's top the ravine's plateau is the wall's own H
      // the ravine wall's inward normal, and the half-angle of the rock's corner between the two (a right angle takes
      // cornerRoundM, a 40 degree fin more than twice it, so its nose is as broad)
      const so = off < 0 ? -1 : 1, slope = k === 0 ? 0.035 : 0.24 * Math.sign(across);
      const bx = -so * slope, bz = so + REDROCK_CANYON.axisSlope * so * slope;
      const cosPhi = (sa * bx + az * bz) / (Math.hypot(sa, az) * Math.hypot(bx, bz));
      const sinHalf = Math.sqrt(Math.max(0.04, (1 + cosPhi) / 2));
      const K = REDROCK_CANYON.cornerRoundM * Math.max(0.8, Math.min(2.6, 0.7071 / sinHalf));
      const q = Math.max(K - Math.abs(depth - d), 0) / K, e = q * q * K * 0.25;
      // (the nose's step-down below is a fin's: a corner sharper than ~65 degrees, where the plateau between the lips
      // narrows to nothing; a right-angled corner's plateau runs on along both walls)
      const fin = q * (1 - ramp(0.45, 0.6, sinHalf));
      if (k === 0) { d0 = d; e0 = e; q0 = fin; } else { d1 = d; e1 = e; q1 = fin; }
      if (e > ease) ease = e;
      if (q > near) near = q;
    }
  }
  const fine = detail * (1 - ramp(0.55, 1, near));
  const hMain = jebelSection(depth - ease, along, H, detail, apron, salt, fine), mainLip = sectionLip;
  let h = hMain, lip = depth - ease - sectionCrownLip;
  let cap = Infinity;
  for (let k = 0; k < 2; k++) {
    const d = k === 0 ? d0 : d1;
    if (d === Infinity) continue;
    const e = k === 0 ? e0 : e1;
    const off = z - (k === 0 ? southRavineZ(across) : northRavineZ(across)), side = off < 0 ? 0 : 1;
    const r = jebelSection(d - e, across, H, detail, 0, salt + 60 + 20 * k + 7 * side, fine);
    // (on the corner's bisector the two walls' sections, each its own talus, bench and run, cross: blended across a
    // 24 m band there, not a minimum's crease cut down the nose)
    const gap = depth - d, hk = gap * gap < 144 ? hMain + (r - hMain) * ramp(-12, 12, gap) : Math.min(hMain, r);
    if (hk < h) h = hk;
    if (d - e - sectionCrownLip < lip) lip = d - e - sectionCrownLip;
    // a nose too narrow to carry a top (its two lips under 100 m apart, or its faces meeting below the top) stands lower
    // as it narrows, to under a third of the wall's height at the tip: a ridge stepping down to its nose, not a fin
    // standing a slab on end (the two lips' gap is the plateau's width across the corner's bisector, where q weighs the cap in)
    const q = k === 0 ? q0 : q1;
    if (q > 0) {
      const plateau = (depth - ease - mainLip) + (d - e - sectionLip);
      const c = H * (0.3 + 0.7 * ramp(-40, 100, plateau));
      if (c < H) cap = Math.min(cap, H - q * (H - c));
    }
  }
  if (h > cap) h = cap;
  // the beehive domes behind the nearest lip, on one world-plan field (round 9: the lip without the flutes, so a dome is
  // not cut to a tooth at every flute; a gully's notch in the lip is a saddle between two rounded domes)
  const crown = (detail + 0.8 * (1 - detail)) * ramp(-3, 5, lip);
  return crown > 0 ? h + crown * domes(across, z, lip, H, detail) : h;
}

/** Absolute regional datum and unequal eroded flanks; no noise library, allocation, or mutable cache. */
export function sampleRedrockCanyon(x: number, z: number): number {
  // The authored combat lanes stay fixed. Beyond them, tributaries bend into
  // the surrounding plateau instead of extending as ruler-straight trenches.
  const regional = ramp(560, 1050, Math.max(Math.abs(x), Math.abs(z)));
  // the fine rock (flutes, chimneys, runnels, ledges, domes) is the playable terrain's: the coarse ring past the square
  // draws the jebels' masses alone, and the walls hand over to it before the playable terrain's edge
  const detail = 1 - ramp(470, 505, Math.max(Math.abs(x), Math.abs(z)));
  const wx = x + regional * (65 * Math.sin(z * 0.008) + 24 * Math.sin(z * 0.019 + 2));
  const wz = z + regional * (70 * Math.sin(x * 0.007 + 1) + 24 * Math.sin(x * 0.018));
  const upland = regional * (9 * Math.sin(x * 0.008) * Math.sin(z * 0.006)
    + 2 * Math.sin(x * 0.023 + z * 0.011));
  x = wx; z = wz;
  const floor = REDROCK_CANYON.floorY + REDROCK_CANYON.floorGrade * Math.max(-600, Math.min(600, z));
  const across = x - redrockCanyonCenter(z);
  const halfWidth = redrockCanyonFloorHalfWidth(z);
  const toeDistance = Math.abs(across) - halfWidth;
  const open = toeDistance <= 0 ? floor : floor + canyonWall(across, z, z, toeDistance, detail, true);
  if (Math.abs(z) <= REDROCK_CANYON.closureStart - 132) return open + upland;
  // Broad alcoves and offset promontories break up the former straight dam.
  // Both walls remain outside the playable floor and carry the same bedding.
  const meander = 100 * Math.sin(x * 0.008 + (z > 0 ? 0.4 : 2.1))
    + 32 * Math.sin(x * 0.029 + 1.1);
  // Round 9 (the gauntlet's wave 261: "a continuous grey-brown terraced escarpment that wraps the valley like an arena
  // wall, with no gaps or long views"): two wadis leave through each head, sand floors winding out between its massifs
  // (the head's toe set back along them, widening outward), so the views down the mouths run on to the far country.
  // The north head's are the south's turned about the outpost; the axis and the outer flanks stay closed.
  const gapSide = z < 0 ? 1 : -1, reach = Math.max(0, Math.abs(z) - 560);
  let gap = 0;
  for (const at of REDROCK_CANYON.headWadis) {
    const w = 105 + 0.1 * reach, u = (across - gapSide * at - 18 * Math.sin(z * 0.006 + at)) / w;
    if (u * u < 1) gap = Math.max(gap, (1 - u * u) ** 2);
  }
  const headToe = Math.abs(z) - REDROCK_CANYON.closureStart + meander - 640 * gap;
  if (headToe <= 0) return open + upland;
  const blend = ramp(-halfWidth, halfWidth, across);
  const lift = REDROCK_CANYON.headLiftM;
  const head = floor + canyonWall(-1, x, z, headToe, detail, false, lift) * (1 - blend)
    + canyonWall(1, x, z, headToe, detail, false, lift) * blend;
  return Math.max(open, head) + upland;
}
