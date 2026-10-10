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
  /** The pale upper formation's contact (m; badlands.ts splat.formation atY): the joints run shallow above it. */
  paleContactM: 56,
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

/** The vertical joints along a wall run (round 10, the gauntlet's wave 270: "a pleated curtain", "smooth rounded flutes
 * like draped cloth" — the round-9 flutes were rounded cosine notches every 8-16 m): columns 4.8-19 m wide between
 * joints, each joint a V re-entrant 1.2-3.6 m deep (sharp at its root), and each column a face of its own standing up to
 * 1.1 m back of its neighbours, eased across the joint's V so the ground stays continuous — metres the face stands back
 * at s. */
// (round 11, the gauntlet's wave 282: "a smooth rubbery slab with hairline drawn cracks", "no joint-bounded columns" —
// the joints 4.5-25 m apart, three in five a cleft 2.5-8 m deep and 2.4-4.6 m to each side, the rest 0.8-2 m; each column
// up to 2.6 m back of its neighbours)
// (round 11b, the gauntlet's wave 298b: "streaked with bright white smears down its fins", "spattered with bright white
// blotches and vertical drips" on the backlit walls — the deep clefts' and set-back columns' sides turned to the sun on a
// face turned from it, lit cream-white; the pale drips and the talus sand made no difference (the overnight diagnosis
// captures). The joints at round 10's spacing again, every one a shallow V 0.9-2.4 m deep over 2.2-3.6 m to each side
// (its sides at most ~47 degrees off the face), each column up to 1.1 m back; the debris cones keep to three joints in five)
const JOINT_W = 12;
function jointBoundary(j: number, salt: number): number { return (j + 0.6 * (hash(j, salt + 41) - 0.5)) * JOINT_W; }
/** Joint k's depth (m). */
function jointDepth(k: number, salt: number): number {
  return 0.9 + 1.5 * hash(k, salt + 42);
}
function jointSetback(s: number, salt: number): number {
  let j = Math.floor(s / JOINT_W);
  if (s < jointBoundary(j, salt)) j--; else if (s >= jointBoundary(j + 1, salt)) j++;
  const b0 = jointBoundary(j - 1, salt), b1 = jointBoundary(j, salt), b2 = jointBoundary(j + 1, salt), b3 = jointBoundary(j + 2, salt);
  // each joint's half-width, at most 0.45 of the narrower column beside it (so a column's two V's never meet)
  const halfL = Math.min(2.2 + 1.4 * hash(j, salt + 44), 0.45 * Math.min(b1 - b0, b2 - b1));
  const halfR = Math.min(2.2 + 1.4 * hash(j + 1, salt + 44), 0.45 * Math.min(b2 - b1, b3 - b2));
  const col = (k: number) => 1.1 * hash(k, salt + 43), depth = (k: number) => jointDepth(k, salt);
  const dl = s - b1, dr = b2 - s;
  let back = col(j);
  if (dl < halfL) back += (col(j - 1) - col(j)) * 0.5 * (1 - dl / halfL);
  if (dr < halfR) back += (col(j + 1) - col(j)) * 0.5 * (1 - dr / halfR);
  return back + Math.max(depth(j) * Math.max(0, 1 - dl / halfL), depth(j + 1) * Math.max(0, 1 - dr / halfR));
}

/** The face's bedding tiers (round 10, the gauntlet's wave 270: "no bedding", "bedding ledges in relief, breaking the
 * flutes into tiers"): the rise in beds of ~6-17 m, each a riser at ~81 degrees under a ledge, the top bed running out to
 * the lip. tieredFace gives the height over the face's foot at setback x; tierRunOf the face's whole run. Bed thicknesses
 * and ledge depths wander along the wall. */
// (round 11, roadContinuity's 2 mm seam probe on the ravine walls: a riser's slope along the wall is its slope into the
// wall times the plan slope of whatever sets the face back there, a joint's V or a gully. The round-10 risers were
// smoothsteps over 14 % of a bed, 84.7 degrees at their steepest, and a joint's V on a gully took them past 86: each riser
// is an eased trapezoid over 16 % of its bed now — its foot and nose eased over an eighth of it each, straight between,
// 82 degrees at the steepest — so the beds keep their crisp noses and the face its height field's continuity)
const TIER_RISER = 0.16, TIER_EASE = 0.12;
// (six beds on every face whatever its rise — a count rounded from the rise jumped where the rise crossed a half bed, and
// the face and its lip jumped with it)
const TIER_N = 6;
const _tierT: number[] = [0, 0, 0, 0, 0, 0], _tierL: number[] = [0, 0, 0, 0, 0, 0]; // (module scratch: no query allocates)
function tierLayout(rise: number, s: number, salt: number): number {
  const n = TIER_N;
  let sum = 0;
  for (let k = 0; k < n; k++) { _tierT[k] = 0.65 + 0.7 * wander(s / 47 + k * 1.37, salt + 50 + k); sum += _tierT[k]; }
  for (let k = 0; k < n; k++) {
    _tierT[k] *= rise / sum;
    // (round 11, the gauntlet's wave 282: "no bedding ledges" — most beds part on a shallow ledge, 0.4-1.6 m, and a bed
    // here and there, for a stretch of the wall, on a deep one, up to 6 m, that casts its shadow)
    // (round 11b, wave 298b: the deep ledges' treads, sunlit over a backlit face, were the "white blotches" — 2.8 m at most)
    const deep = wander(s / 90 + k * 3.1, salt + 80 + k), prominent = deep * deep * (3 - 2 * deep);
    _tierL[k] = k < n - 1 ? 0.4 + 1.2 * wander(s / 39 + k * 2.11, salt + 70 + k) + 1.2 * Math.max(0, prominent - 0.55) / 0.45 : 0;
  }
  return n;
}
function tierRunOf(rise: number, s: number, salt: number): number {
  const n = tierLayout(rise, s, salt);
  let run = 0;
  for (let k = 0; k < n; k++) run += TIER_RISER * _tierT[k] + _tierL[k];
  return run;
}
function tieredFace(x: number, rise: number, s: number, salt: number): number {
  const n = tierLayout(rise, s, salt);
  let x0 = 0, z0 = 0;
  for (let k = 0; k < n; k++) {
    const a = TIER_RISER * _tierT[k];
    if (x < x0 + a) {
      const u = Math.max(0, (x - x0) / a), e = TIER_EASE, q = 2 * e * (1 - e);
      return z0 + _tierT[k] * (u < e ? u * u / q : u > 1 - e ? 1 - (1 - u) * (1 - u) / q : (u - e / 2) / (1 - e));
    }
    x0 += a; z0 += _tierT[k];
    if (x < x0 + _tierL[k]) return z0;
    x0 += _tierL[k];
  }
  return rise;
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

/** The debris cone under each deep joint (round 11, the gauntlet's wave 282: "its toe meets the sand along a hard straight
 * line with no talus, fallen blocks or sand ramp"): metres it raises the talus head at s, spreading 2.5 cleft half-widths
 * to each side of the joint. */
function jointCone(s: number, salt: number): number {
  let j = Math.floor(s / JOINT_W);
  if (s < jointBoundary(j, salt)) j--; else if (s >= jointBoundary(j + 1, salt)) j++;
  let cone = 0;
  for (let k = j - 1; k <= j + 2; k++) {
    if (hash(k, salt + 45) >= 0.6) continue;
    const half = 2.5 * (2.4 + 2.2 * hash(k, salt + 44)), q = (s - jointBoundary(k, salt)) / half;
    if (q * q >= 1) continue;
    cone = Math.max(cone, (2 + 4 * hash(k, salt + 46)) * (1 - q * q) ** 2);
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
  let best = 0, second = 0;
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    const key = i * 7919 + j;
    const cd = (i + 0.5 + 0.7 * (hash(key, salt + 31) - 0.5)) * cell;
    const cs = (j + 0.5 + 0.7 * (hash(key, salt + 32) - 0.5)) * cell;
    const radius = r0 + rv * hash(key, salt + 33);
    const r2 = ((d - cd) ** 2 + (s - cs) ** 2) / (radius * radius);
    if (r2 >= 1) continue;
    const height = Math.min(H * (h0 + hv * hash(key, salt + 34)), capR * radius);
    const hd = height * Math.cos(1.5708 * r2 ** 0.8);
    if (hd > best) { second = best; best = hd; } else if (hd > second) second = hd;
  }
  // (round 10, the gauntlet's wave 270: "a sawtooth crest of near-identical small teeth" — the two highest domes' union a
  // smooth maximum over 4 m, so the saddle between two domes is a rounded col, not a V between two teeth; the rounding
  // weighs in with the lower dome's own height, so it is nil at every dome's edge, and the top two are the same in any
  // order: the field stays continuous)
  const k = 4, g = best - second;
  return best + (g < k && second > 0 ? (k - g) * (k - g) / (4 * k) * Math.min(1, second / k) : 0);
}

/** The jebels' tops `back` metres behind the nearest lip, at world-plan (u, v): beehive domes crowding the rim, broad
 * domes on the massif behind. One field for every wall, so two walls' tops never meet in a step. */
function domes(u: number, v: number, back: number, H: number, detail: number): number {
  // (the coarse ring past the square keeps the broad domes, which its 10-20 m rows resolve, and drops the beehives)
  const rim = detail * (1 - ramp(28, 52, back)), massif = ramp(12, 40, back);
  // (round 10: the rim's beehives fewer and broader, 11-27 m across their bases and of more varied height — at 24 m cells
  // and 9-17 m radii a row of like domes stood along every crest as teeth)
  // (round 11, the gauntlet's wave 282: "one continuous flat-topped wall ... no domed summits", "beehive banding": the
  // domes taller, and banded in rounded 4 m steps)
  const h = Math.max(rim > 0 ? rim * domeField(u, v, H, 34, 11, 18, 0.06, 0.2, 0.6, 401) : 0,
    massif > 0 ? massif * domeField(u, v, H, 68, 24, 22, 0.06, 0.15, 0.5, 406) : 0);
  return h - BEEHIVE_A * 0.5 * (1 - Math.cos((2 * Math.PI * h) / BEEHIVE_P));
}
/** The beehive bands on the domes (round 11): their period (m) and their amplitude (m, under P / pi: monotonic). */
const BEEHIVE_P = 4, BEEHIVE_A = 1.0;

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
  // (round 11: and under every deep joint a smaller cone, and the toe's line wandering a few metres in and out between)
  const cone = fine * (gullyCone(s, salt) + 0.85 * jointCone(s, salt));
  const toe = fine * 3.2 * (wander(s / 11 + 2.2, salt + 47) - 0.5);
  const talusW = Math.max(3, 7 + 6 * w1 + 8 * apron + 6 * soft + 1.2 * cone + toe), talusH = 3 + 2.5 * w2 + cone;
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
  // (round 10: the face cut back at its joints, and stepped in bedding tiers, both the playable terrain's: `fine`)
  // (round 11, roadContinuity's seam probe: a joint inside a gully is one cut with it — the deeper set-back of the two,
  // not their sum, whose plan slopes stacked)
  const gully = fine * chimney(s, salt), joint = fine * jointSetback(s, salt), foot0 = bench + gully;
  const foot = bench + Math.max(gully, joint);
  // near vertical over most of its height: a 78-82 degree face rounding at its foot and its lip (the ring's soft
  // section), or the tiers' risers and ledges (the playable terrain's)
  const rise = H - disiTop - 0.8, runSoft = Math.max(4, rise * (0.19 + 0.55 * soft));
  const runTier = fine > 0 ? tierRunOf(rise, s, salt) : runSoft, run = runSoft + (runTier - runSoft) * fine;
  sectionLip = foot + run; sectionCrownLip = foot0 + run;
  if (d <= bench) return disiTop + 0.8 * (d - disiEnd) / (bench - disiEnd);
  const cleft = disiTop + 0.8 + 1.6 * (d - bench);
  if (d <= foot) return Math.min(H, cleft);
  const face = (x: number): number => {
    if (x >= run) return 1;
    const t = Math.max(0, x / run);
    // (a trapezoid of slope: eased in over the first 12 % and out over the last, linear between — continuous in value and
    // slope, y = t^2 / (2 * 0.12 * 0.88) on the ends)
    let y = t < 0.12 ? (t * t) / 0.2112 : t > 0.88 ? 1 - ((1 - t) * (1 - t)) / 0.2112 : (t - 0.06) / 0.88;
    // where the ring draws it, a rounded massif: steep at its foot, its shoulder rounding over (no sharp lip for the rows)
    if (soft > 0) { const e = t * t * (3 - 2 * t); y += soft * (e * (2 - e) - y); }
    if (fine > 0) y += (tieredFace(t * runTier, rise, s, salt) / rise - y) * fine;
    return y;
  };
  // the joints fade over the face's top quarter, so the crest is one line over the columns, not a tooth at every joint;
  // (round 11, the coordinator: the backlit "white blotches" were the sunlit walls of the joints' V's in the pale upper
  // formation) and above the formations' contact (badlands.ts formation atY, 56 m) they keep a third of their depth
  const yJ = face(d - foot), y0 = face(d - foot0), hy0 = disiTop + 0.8 + rise * y0;
  const w = Math.max(ramp(0.68, 0.96, y0), 0.66 * ramp(REDROCK_CANYON.paleContactM - 6, REDROCK_CANYON.paleContactM + 10, hy0));
  const y = yJ + (y0 - yJ) * w;
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
      // (round 10, the gauntlet's wave 270: "a faceted shark fin with flat-shaded planes" — the step-down was a plane: it
      // eases in now, q's smoothstep, and meets the face in a smooth minimum, so the nose rounds over)
      if (c < H) cap = Math.min(cap, H - q * q * (3 - 2 * q) * (H - c));
    }
  }
  // (the smooth minimum's reach is at most 8 m and no more than the cap's own drop below the top, so it fades out where
  // the nose's step-down begins — no seam where the cap comes in)
  const capK = Math.min(8, H - cap);
  if (capK > 0 && h > cap - capK) { const g = h - cap; h = g >= capK ? cap : h - (g + capK) * (g + capK) / (4 * capK); }
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
  // (each wadi runs ~250 m back into its head and ends on the head's inner wall short of 950 m, so the mouth stays closed:
  // the view down it is a layer of jebels behind a gap, and the headwall's contract holds past it)
  const gapSide = z < 0 ? 1 : -1, reach = Math.max(0, Math.abs(z) - 560), inner = 1 - ramp(840, 945, Math.abs(z));
  let gap = 0;
  for (const at of REDROCK_CANYON.headWadis) {
    const w = 105 + 0.1 * reach, u = (across - gapSide * at - 18 * Math.sin(z * 0.006 + at)) / w;
    if (u * u < 1) gap = Math.max(gap, (1 - u * u) ** 2 * inner);
  }
  const headToe = Math.abs(z) - REDROCK_CANYON.closureStart + meander - 640 * gap;
  if (headToe <= 0) return open + upland;
  const blend = ramp(-halfWidth, halfWidth, across);
  const lift = REDROCK_CANYON.headLiftM;
  const head = floor + canyonWall(-1, x, z, headToe, detail, false, lift) * (1 - blend)
    + canyonWall(1, x, z, headToe, detail, false, lift) * blend;
  return Math.max(open, head) + upland;
}
