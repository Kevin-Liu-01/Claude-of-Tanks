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

/** Rounded vertical grooves along a wall run, 0..1 at their deepest: flutes every 7-14 m (a domain-warped cosine). */
function flute(s: number, salt: number): number {
  const phase = s / 9.5 + 1.1 * wander(s / 31, salt + 11) + hash(3, salt);
  const notch = Math.max(0, Math.cos(phase * Math.PI * 2));
  return notch * notch * (0.45 + 0.55 * wander(s / 17 + 2.3, salt + 12));
}

/** The chimneys: a narrow cleft every ~70 m of wall on about half the cells, as metres it sets the cliff back. */
function chimney(s: number, salt: number): number {
  const cell = Math.floor(s / 70);
  let back = 0;
  for (let c = cell - 1; c <= cell + 1; c++) {
    if (hash(c, salt + 21) < 0.45) continue;
    // (half-width 2.8-5.4 m: the playable terrain's 1.33 m grid draws the cleft's walls, where a 1.6 m slot aliased into
    // flat facets the material painted as sand — pale "flames" up the face)
    const at = (c + 0.2 + 0.6 * hash(c, salt + 22)) * 70, half = 2.8 + 2.6 * hash(c, salt + 23);
    const q = (s - at) / half;
    if (q * q >= 1) continue;
    back = Math.max(back, (7 + 10 * hash(c, salt + 24)) * (1 - q * q) ** 1.5);
  }
  return back;
}

/** One field of domes on a jittered grid of `cell` metres: their union in metres at (d, s), radius r0..r0+rv, height
 * h0..h0+hv (shares of H). */
function domeField(d: number, s: number, H: number, cell: number, r0: number, rv: number, h0: number, hv: number,
  salt: number): number {
  const ci = Math.floor(d / cell), cj = Math.floor(s / cell);
  let best = 0;
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    const key = i * 7919 + j;
    const cd = (i + 0.5 + 0.7 * (hash(key, salt + 31) - 0.5)) * cell;
    const cs = (j + 0.5 + 0.7 * (hash(key, salt + 32) - 0.5)) * cell;
    const radius = r0 + rv * hash(key, salt + 33);
    const r2 = ((d - cd) ** 2 + (s - cs) ** 2) / (radius * radius);
    if (r2 >= 1) continue;
    best = Math.max(best, H * (h0 + hv * hash(key, salt + 34)) * (1 - r2) * (1 - r2 * 0.35));
  }
  return best;
}

/** The jebels' tops `back` metres behind the nearest lip, at world-plan (u, v): beehive domes crowding the rim, broad
 * domes on the massif behind. One field for every wall, so two walls' tops never meet in a step. */
function domes(u: number, v: number, back: number, H: number, detail: number): number {
  // (the coarse ring past the square keeps the broad domes, which its 10-20 m rows resolve, and drops the beehives)
  const rim = detail * (1 - ramp(28, 52, back)), massif = ramp(12, 40, back);
  return Math.max(rim > 0 ? rim * domeField(u, v, H, 23, 8, 8, 0.05, 0.13, 401) : 0,
    massif > 0 ? massif * domeField(u, v, H, 68, 24, 18, 0.05, 0.11, 406) : 0);
}

/** The lip depth of the last jebelSection call (its cliff's top, metres from the toe): the domes stand behind it. */
let sectionLip = 0;

/**
 * One jebel wall's height over its toe at depth d (metres into the wall from the toe line) and along-wall position s,
 * without its domes (canyonWall adds them once, behind the nearest lip); H the wall's full height, `detail` 1 where the
 * playable terrain draws it and 0 where only the coarse ring does (the flutes, chimneys, runnels and ledges fade there),
 * `apron` 0..1 widening the foot towards the mouths. Sets sectionLip.
 */
function jebelSection(d: number, s: number, H: number, detail: number, apron: number, salt: number): number {
  const w1 = wander(s / 64, salt), w2 = wander(s / 27 + 3.7, salt + 1), w3 = wander(s / 41 + 8.1, salt + 2);
  // where the coarse ring takes the walls over (detail 0) the section lays back to ~55 degrees, a face its 10 m rows can
  // follow (the seam's chords stay within 3 m of the playable terrain's last row)
  const soft = 1 - detail;
  // the talus apron: fallen blocks and banked sand, concave, about 35 degrees at its head
  const talusW = 7 + 6 * w1 + 8 * apron + 6 * soft, talusH = 3 + 2.5 * w2;
  // the Disi base: steep at its foot, rounding over into the bench, with runnels down it
  const disiTop = Math.min(H * 0.45, REDROCK_CANYON.disiTopM + 5 * (w3 - 0.5));
  const disiW = 10 + 7 * w2 + 10 * apron + 10 * soft, disiEnd = talusW + disiW;
  // (in front of the bench the lip lies further in whatever it is: no dome stands there)
  sectionLip = Infinity;
  if (d <= 0) return 0;
  if (d <= talusW) return talusH * (d / talusW) ** 1.6;
  if (d <= disiEnd) {
    const u = (d - talusW) / disiW;
    const runnel = flute(s * 0.55 + 40, salt + 5) * 2.4 * detail * Math.sin(Math.PI * u);
    return talusH + (disiTop - talusH) * (1 - (1 - u) ** 2.2) - runnel;
  }
  // the bench on the Disi's top, set back by the buttress masses; then the Umm Ishrin's face, its flutes and chimneys
  // cut back into it. (A cleft's floor climbs steeply from the bench to the set-back face — scree in the cleft at 58
  // degrees — where the bench running on flat into every groove laid a sand floor in each: pale flames up the face.)
  const benchW = 2 + 9 * w3;
  const bench = disiEnd + benchW + 8 * wander(s / 52 + 1.9, salt + 3);
  const foot = bench + detail * (3.5 * flute(s, salt) + chimney(s, salt));
  // near vertical over most of its height: a 78-82 degree face rounding at its foot and its lip
  const rise = H - disiTop - 0.8, run = Math.max(4, rise * (0.19 + 0.55 * soft));
  sectionLip = foot + run;
  if (d <= bench) return disiTop + 0.8 * (d - disiEnd) / (bench - disiEnd);
  const cleft = disiTop + 0.8 + 1.6 * (d - bench);
  if (d <= foot) return Math.min(H, cleft);
  if (d >= sectionLip) return H;
  const t = (d - foot) / run;
  let y = t < 0.12 ? (t * t) / 0.24 : t > 0.88 ? 1 - ((1 - t) * (1 - t)) / 0.24 : (t - 0.06) / 0.88;
  // where the ring draws it, a rounded massif: steep at its foot, its shoulder rounding over (no sharp lip for the rows)
  if (soft > 0) { const e = t * t * (3 - 2 * t); y += soft * (e * (2 - e) - y); }
  // bedding ledges every ~9-13 m: the face eases back for a moment at each bed
  const bed = 9 + 4 * w1, phase = 6.2832 * (y * rise + 7 * w2) / bed;
  y += detail * 0.5 * (bed / rise) * Math.sin(phase) / 6.2832 * (1 - (2 * y - 1) ** 8);
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

function canyonWall(across: number, along: number, z: number, toeDistance: number, detail: number,
  ravines: boolean, lift = 0): number {
  const west = across < 0;
  // Unequal buttresses, talus shelves and side washes continue through the
  // whole region. Fading this sculpture out at |z|=300 made the boundary
  // flanks become smooth ramps. Recesses only cut away from the valley floor.
  const sculpt = 0.94 + 0.06 * Math.sin(z * 0.007 + (west ? 0.5 : 2.4));
  const mouthApron = ramp(330, 430, Math.abs(z)) * (1 - ramp(560, 720, Math.abs(z)));
  const recess = 32 * mouthApron + sculpt * (24
    + 12 * Math.sin(z * 0.029 + (west ? 0.8 : 2.5))
    + 6 * Math.sin(z * 0.071 + (west ? 2.1 : 0.3)));
  const depth = toeDistance - recess;
  if (depth <= 0) return 0;
  // (the mouths' walls lay their feet out wider; the heads past them close the basin on their own, compact feet)
  const apron = ravines ? ramp(220, 330, Math.abs(z)) : 0;
  const height = west
    ? REDROCK_CANYON.westHeight + 6 * ramp(-380, -40, z) - 12 * ramp(170, 360, z)
    : REDROCK_CANYON.eastHeight - 2 * ramp(-280, -40, z) + 6 * ramp(100, 380, z);
  const bedding = 1 + sculpt * (0.035 * Math.sin(z * 0.031) + 0.018 * Math.sin(z * 0.067));
  const H = height * bedding + lift, salt = west ? 101 : 211;
  let h = jebelSection(depth, along, H, detail, apron, salt), lip = depth - sectionLip;
  if (ravines) {
    // The side ravines are sand-floored siqs cut through the wall: their own jebel walls rise from each bed's edge (the
    // bed keeps the floor's datum all the way through), so the wall meets each ravine in a corner, not a rounded shoulder.
    for (let k = 0; k < 2; k++) {
      const off = z - (k === 0 ? southRavineZ(across) : northRavineZ(across)), side = off < 0 ? 0 : 1;
      const rsalt = salt + 60 + 20 * k + 7 * side;
      const d = Math.abs(off) - REDROCK_CANYON.ravineBedHalfWidth - 6 * wander(across / 37, rsalt);
      if (d > 170) continue; // past its wall's top the ravine's plateau is the wall's own H
      const r = jebelSection(d, across, H, detail, 0, rsalt);
      if (r < h) h = r;
      if (d - sectionLip < lip) lip = d - sectionLip;
    }
  }
  // the beehive domes behind the nearest lip, on one world-plan field
  const crown = (detail + 0.8 * (1 - detail)) * ramp(-3, 4, lip);
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
  const headToe = Math.abs(z) - REDROCK_CANYON.closureStart + meander;
  if (headToe <= 0) return open + upland;
  const blend = ramp(-halfWidth, halfWidth, across);
  const lift = REDROCK_CANYON.headLiftM;
  const head = floor + canyonWall(-1, x, z, headToe, detail, false, lift) * (1 - blend)
    + canyonWall(1, x, z, headToe, detail, false, lift) * blend;
  return Math.max(open, head) + upland;
}
