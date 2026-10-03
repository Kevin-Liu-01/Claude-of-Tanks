// src/world/landformGeology.ts — geological structure for authored landforms (maps-and-layouts lane, 2026-10-03).
//
// The gauntlet's wave-0 critics read every landform as a smooth shell: "ice-cream-scoop domes", "berm-like mesas with
// one perfectly level terrace", with no rock, jointing, erosion gullies, talus or scree. A landform may now carry
// `geology`, which shapes its own height the way rock and weather shape a real hill:
// - outline: its plan is lobed, not an ellipse or a straight-sided bar;
// - profile: 'dome' (the smooth default), 'butte' (a gently domed cap, a steep wall, a concave talus apron), 'cone'
//   (a summit crater, flanks at a near-constant slope, a rounded toe; the crater may be breached), 'inselberg' (a
//   bornhardt: a broad rounded crown steepening into a near-vertical wall, its foot wandering round the dome, over a
//   concave talus apron; fans spread from the wall's foot) or, on a ridge,
//   'flow' (a lava flow: a lowered channel between raised levees, a steep margin, a short talus; with `front`, a steep
//   blocky front at its downhill end);
// - gullies: V-shaped rills down the flanks, irregularly spaced, fading into the apron; on a knoll, talus fans spread
//   below the rills' mouths onto the plain;
// - strata: bedding, a bench and a riser per bed, the beds dipping slightly so no bench is level;
// - rough: knobbly relief a few metres across, on the landform and not on the plain round it.
// Every term is a deterministic function of (x, z) and the landform's own frame: no terrain seed, no random stream, no
// grid. A landform without `geology` keeps its exact smooth shape: terrain.ts calls this module only when it is set.
// The terrain's rock layer follows slope, so the walls, risers and gully sides read as rock. geologyZoneWeights names
// the zones a material can key on: a lava flow's footprint, a cinder cone's base and its talus fans.

export interface LandformGeology {
  /** Plan irregularity, 0 (the authored ellipse or bar) to 0.35. */
  outline?: number;
  /** The radial (knoll) or cross-axis (ridge) profile. 'flow' (ridges): a lava flow's lowered channel between raised
   * levees, a steep margin and a short talus. */
  profile?: 'dome' | 'butte' | 'cone' | 'flow' | 'inselberg';
  /** butte: the cap's edge and the wall's foot, as fractions of the radius or half-width (default 0.45, 0.62). */
  wall?: readonly [number, number];
  /** butte / inselberg: the talus apron's height at the wall's foot, as a share of the landform's height (default 0.28
   * on a butte, 0.16 on an inselberg; an inselberg's apron varies by half of it round the dome). */
  apron?: number;
  /** inselberg: the wall's foot as a fraction of the radius (default 0.68) and how far it wanders round the dome, as a
   * share of itself (default 0.12): the slope break between the wall and the talus is never one ring. */
  foot?: number;
  footVary?: number;
  /** inselberg: the crown's breadth, the power of the dome's fall to its wall (default 4: higher is a broader crown
   * and a steeper wall). */
  crown?: number;
  /** cone: the crater's rim as a fraction of the radius, its depth in metres and an optional breach bearing in
   * degrees (0 = local +x, counter-clockwise towards local +z). */
  crater?: { rim: number; depthM: number; breachDeg?: number };
  /** Rills down the flanks: how many round a knoll (a whole number; or per 100 m of a ridge), their deepest cut in
   * metres and their width as a share of their spacing (default 0.45); each rill varies its own depth, head and
   * meander. */
  gullies?: { count: number; depthM: number; width?: number };
  /** Knolls with gullies: talus fans spread below each rill's mouth onto the plain: their reach past the toe as a share
   * of the radius (default 0.3) and their height in metres at the toe (default 0.6 x the rill depth); each fan varies
   * with its rill. */
  fans?: { reach?: number; heightM?: number };
  /** Bedding: the bed thickness in metres and the riser's share of each bed (default 0.3). */
  strata?: { stepM: number; riser?: number };
  /** Knobbly relief amplitude in metres. */
  rough?: number;
  /** What the landform is made of, where its shape does not say: 'slag' (an industrial tip) counts as a rock
   * landform for a map's rock gate (geologyRockWeight) so the terrain material can draw it as slag. No height effect. */
  material?: 'slag';
  /** Knolls: how many fallen blocks props.ts scatters on the talus, crowded towards the wall's foot and thinning out
   * past the toe (geologyBoulderSite): a boulder apron. The larger blocks are hard cover. */
  boulders?: number;
  /** Ridges only: the crest falls along the axis, to (1 - |taper|) of the height at one end: positive lowers the
   * local +x end, negative the -x end. A spur descending from a wall to its toe. */
  taper?: number;
  /** Ridges only: a flow front: +1 ends the local +x end, -1 the -x end, in a steep blocky front over the last 8 % of
   * the length, while the other end thins out gently over its last half (a lava flow's vent end). */
  front?: 1 | -1;
  /** Ridges only: a cliff end: +1 ends the local +x end, -1 the -x end, 'both' both ends, in a steep wall over the last
   * 6 % of the length instead of the smooth taper (a shelf whose end would otherwise ramp up onto its cap). */
  cliffEnd?: 1 | -1 | 'both';
}

/** The slice of a landform the geology reads. */
export interface GeologicForm {
  kind: string;
  x: number;
  z: number;
  height: number;
  length?: number;
  width?: number;
  rx?: number;
  rz?: number;
  r?: number;
  /** The plan rotation (geologyZoneWeights; the height functions take the local frame). */
  yawDeg?: number;
  /** Its cosine and sine, as terrain.ts createLayout caches them. */
  _c?: number;
  _s?: number;
  geology?: LandformGeology;
}

/** The geological zones at a point, each 0..1: [lava flow, cinder cone, talus fan] (geologyZoneWeights). */
export type GeologyZones = [number, number, number];

const TAU = Math.PI * 2;
const BUTTE_WALL: readonly [number, number] = [0.45, 0.62];

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** A stable hash of two integers and a salt, in [0, 1). */
function hash2(ix: number, iz: number, salt: number): number {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1] on a unit lattice. */
function valueNoise(x: number, z: number, salt: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, salt), b = hash2(ix + 1, iz, salt);
  const c = hash2(ix, iz + 1, salt), d = hash2(ix + 1, iz + 1, salt);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/** A landform's own salt, from its centre, so two landforms never share a pattern. */
function formSalt(form: GeologicForm): number {
  return Math.floor(hash2(Math.round(form.x * 8), Math.round(form.z * 8), 7151) * 1e9);
}

/** The lobes round a knoll, in [-1, 1]: four low harmonics of the bearing with phases from the landform. */
function lobe(theta: number, salt: number): number {
  let sum = 0, norm = 0;
  for (let k = 2; k <= 5; k++) {
    const amp = 1 / (k - 1);
    sum += amp * Math.sin(k * theta + hash2(k, 0, salt) * TAU);
    norm += amp;
  }
  return sum / norm;
}

/** The lobes along a ridge's edge, in [-1, 1]: smooth noise at 60 m and 22 m, independent on each side. */
function edgeLobe(along: number, side: number, salt: number): number {
  return (valueNoise(along / 60, side * 3.7, salt) * 0.62 + valueNoise(along / 22 + 9.1, side * 5.3, salt + 1) * 0.38)
    * 2 - 1;
}

/** terrain.ts's smooth knoll profile, in [0, 1] of a normalized radius q. */
function domeProfile(q: number): number {
  const w = 1 - smoothstep(0.12, 1, q);
  return w * w * (3 - 2 * w);
}

/** terrain.ts's smooth ridge shoulder: full height to 0.22 of the half-width, a softer shoulder below. */
function ridgeShoulder(q: number): number {
  const across = 1 - smoothstep(0.22, 1, q);
  return across * across * (3 - 2 * across);
}

/** A butte or mesa: a gently domed cap (never a level table), a steep wall, then a concave talus apron. */
function butteProfile(q: number, geology: LandformGeology): number {
  const [top, foot] = geology.wall ?? BUTTE_WALL;
  const apron = geology.apron ?? 0.28;
  if (q >= 1) return 0;
  if (q <= top) return 1 - 0.06 * (q / top) ** 2;
  if (q <= foot) {
    const t = (q - top) / (foot - top);
    return 0.94 - (0.94 - apron) * t * t * (3 - 2 * t);
  }
  const t = (q - foot) / (1 - foot);
  return apron * (1 - t) * (1 - t);
}

/** A lava flow's cross-section: the channel a step below its levees, the levee crests near the margin, a steep
 * margin wall and a short concave talus. */
function flowProfile(q: number): number {
  if (q >= 1) return 0;
  if (q <= 0.45) return 0.82;
  if (q <= 0.7) return 0.82 + 0.18 * smoothstep(0.45, 0.7, q);
  if (q <= 0.78) return 1;
  if (q <= 0.9) return 1 - 0.78 * smoothstep(0.78, 0.9, q);
  const t = (q - 0.9) / 0.1;
  return 0.22 * (1 - t) * (1 - t);
}

/** A cinder cone: a summit crater, then flanks at a near-constant slope that round into the toe:
 * p = s (1 - e^(-6 s)), s the share of the flank still below; its steepest point is 1.14 x the mean flank slope. */
function coneProfile(q: number, geology: LandformGeology, height: number): number {
  if (q >= 1) return 0;
  const rim = Math.max(0.02, Math.min(0.5, geology.crater?.rim ?? 0.12));
  if (q < rim) {
    const depth = geology.crater ? geology.crater.depthM / Math.max(1e-6, Math.abs(height)) : 0;
    return 1 - depth * (1 - (q / rim) ** 2);
  }
  const s = 1 - (q - rim) / (1 - rim);
  return s * (1 - Math.exp(-6 * s)) / (1 - Math.exp(-6));
}

/** An inselberg (a bornhardt): a broadly rounded crown steepening into a near-vertical wall down to the wall's foot
 * `foot` (q), then a concave talus apron `apron` high at the foot thinning to the plain at the toe; the crown's fall is
 * the power `crown` (its steepest, at the foot, is crown x (1 - apron) / foot). */
function inselbergProfile(q: number, foot: number, apron: number, crown: number): number {
  if (q >= 1) return 0;
  if (q <= foot) return 1 - (1 - apron) * (q / foot) ** crown;
  const t = (1 - q) / (1 - foot);
  return apron * t * t;
}

/** An inselberg's wall foot and apron on one bearing: each wanders round the dome (smooth, periodic in the bearing). */
function inselbergFoot(geology: LandformGeology, theta: number, salt: number): [number, number] {
  const foot = Math.max(0.3, Math.min(0.9, geology.foot ?? 0.68));
  const vary = Math.max(0, Math.min(0.3, geology.footVary ?? 0.12));
  const apron = Math.max(0, Math.min(0.5, geology.apron ?? 0.16));
  return [Math.max(0.25, Math.min(0.92, foot * (1 + vary * lobe(theta, salt + 29)))),
    apron * (1 + 0.5 * lobe(theta, salt + 31))];
}

function profileOf(q: number, geology: LandformGeology, height: number, fallback: (q: number) => number,
  foot: readonly [number, number] | null = null): number {
  const profile = geology.profile ?? 'dome';
  if (profile === 'inselberg' && foot) return inselbergProfile(q, foot[0], foot[1], Math.max(1.5, geology.crown ?? 4));
  if (profile === 'butte') return butteProfile(q, geology);
  if (profile === 'cone') return coneProfile(q, geology, height);
  if (profile === 'flow') return flowProfile(q);
  return fallback(q);
}

/** Where gullies cut: the wall and upper apron of a butte, below the rim of a cone, an inselberg's wall (its clefts),
 * the mid-flank of a dome. */
function gullyFlank(q: number, geology: LandformGeology, foot: readonly [number, number] | null = null): number {
  const profile = geology.profile ?? 'dome';
  if (profile === 'inselberg' && foot) {
    return smoothstep(foot[0] * 0.3, foot[0] * 0.75, q) * (1 - smoothstep(foot[0], foot[0] + 0.18, q));
  }
  if (profile === 'butte') {
    const [top, foot] = geology.wall ?? BUTTE_WALL;
    return smoothstep(top * 0.8, foot, q) * (1 - smoothstep(0.75, 1, q));
  }
  if (profile === 'cone') {
    const rim = geology.crater?.rim ?? 0.12;
    return smoothstep(rim, rim + 0.15, q) * (1 - smoothstep(0.8, 1, q));
  }
  if (profile === 'flow') return smoothstep(0.72, 0.8, q) * (1 - smoothstep(0.88, 1, q));
  return smoothstep(0.08, 0.35, q) * (1 - smoothstep(0.7, 1, q));
}

/**
 * Rills of a coordinate u (one per unit), in [0, 1] of their deepest cut. Each rill has its own depth, its own head
 * (it begins further down the flank or nearer the top), a meander along the fall line and a rounded V section, so the
 * rills never read as regular spokes. `fall` is the position down the flank in [0, 1]; `jitter` shifts the pattern;
 * `period` (a knoll's rill count) makes rill i and rill i + period the same rill, so the grooves close round a knoll.
 * The cut is the deeper of the two nearest rills, each measured to its own meandering line, so it is continuous
 * everywhere: no seam where one rill's ground hands over to the next's.
 */
function gully(u: number, fall: number, width: number, jitter: number, salt: number, period = 0): number {
  const w = u + jitter, first = Math.floor(w);
  let cut = 0;
  for (let i = first; i <= first + 1; i++) {
    const key = period > 0 ? ((i % period) + period) % period : i;
    const meander = 0.14 * Math.sin(fall * 7 + hash2(key, 1, salt) * TAU)
      + 0.06 * Math.sin(fall * 17 + hash2(key, 2, salt) * TAU);
    const d = Math.abs(w + meander - i); // 0 on this rill's line
    const half = Math.max(0.05, width * (0.7 + 0.6 * hash2(key, 3, salt)) * 0.5);
    if (d >= half) continue;
    const depth = 0.4 + 0.6 * hash2(key, 4, salt);
    const head = 0.05 + 0.4 * hash2(key, 5, salt);
    cut = Math.max(cut, smoothstep(0, 1, 1 - d / half) * depth * smoothstep(head, head + 0.18, fall));
  }
  return cut;
}

/**
 * Talus fans below the rills' mouths, in [0, 1] of their height: rill i's fan follows its rill's line past the toe,
 * widening downslope, highest at the toe and thinning to nothing at `reach` past it. `q` is the normalized radius (1 at
 * the toe); like the rills, the fan is the higher of the two nearest rills' fans, so neighbouring fans meet smoothly.
 */
function fan(u: number, q: number, width: number, jitter: number, salt: number, period: number, reach: number,
  start = 0.82): number {
  if (q <= start || q >= 1 + reach) return 0;
  const w = u + jitter, first = Math.floor(w);
  const along = smoothstep(start, Math.min(1, start + 0.18), q) * (1 - smoothstep(1, 1 + reach, q));
  const spread = (q - start) / (1 - start + reach); // 0 at the mouth, 1 at the fan's toe
  let best = 0;
  for (let i = first; i <= first + 1; i++) {
    const key = period > 0 ? ((i % period) + period) % period : i;
    // the rill's own line where it leaves the flank (the meander at fall = 1, as gully() draws it)
    const meander = 0.14 * Math.sin(7 + hash2(key, 1, salt) * TAU) + 0.06 * Math.sin(17 + hash2(key, 2, salt) * TAU);
    const d = Math.abs(w + meander - i);
    const half = Math.max(0.05, width * (0.7 + 0.6 * hash2(key, 3, salt)) * 0.5) * (1 + 1.6 * spread);
    if (d >= half) continue;
    const size = 0.5 + 0.5 * hash2(key, 6, salt);
    const t = d / half;
    best = Math.max(best, (1 - t * t) * along * size);
  }
  return best;
}

/**
 * Bedding: benches and risers of a height in metres. `dip` tilts the beds across the landform; the bed boundaries
 * wander in plan and the step's strength varies from place to place (talus and slumps blur it), so the risers never
 * trace the landform's contours like terraced fields.
 */
function bedded(h: number, strata: NonNullable<LandformGeology['strata']>, dip: number, lx: number, lz: number,
  salt: number): number {
  if (h <= 0) return h;
  const step = Math.max(0.5, strata.stepM), riser = Math.max(0.05, Math.min(0.95, strata.riser ?? 0.3));
  const wander = (valueNoise(lx / 31 + 3.3, lz / 31 - 8.1, salt + 21) - 0.5) * step * 0.9;
  const t = (h + dip + wander) / step;
  const bed = Math.floor(t), f = t - bed;
  const thick = 0.75 + 0.5 * hash2(bed, 7, salt); // each bed its own riser share
  const stepped = (bed + smoothstep(1 - Math.min(0.95, riser * thick), 1, f)) * step - dip - wander;
  const strength = 0.35 + 0.65 * smoothstep(0.25, 0.75, valueNoise(lx / 23 - 4.7, lz / 23 + 2.9, salt + 23));
  // the toe keeps its unstepped shape: the beds begin a little above the plain
  const keep = Math.max(smoothstep(step * 0.8, step * 0.2, h), 1 - strength);
  return stepped + (h - stepped) * keep;
}

function roughness(lx: number, lz: number, salt: number): number {
  const n = valueNoise(lx / 7 + 31, lz / 7 - 17, salt + 3) * 0.65 + valueNoise(lx / 3 + 5, lz / 3 + 9, salt + 5) * 0.35;
  return n * 2 - 1;
}

/**
 * A knoll's geological height in metres, from its local frame (lx, lz: metres along its rotated axes). Null when the
 * landform has no geology, so the caller keeps its smooth shape.
 */
export function knollGeologyHeight(form: GeologicForm, lx: number, lz: number): number | null {
  const geology = form.geology;
  if (!geology) return null;
  const rx = Math.max(1, form.rx || form.r || 70), rz = Math.max(1, form.rz || form.r || rx);
  const height = form.height || 0;
  const nx = lx / rx, nz = lz / rz;
  let q = Math.sqrt(nx * nx + nz * nz);
  const outline = Math.max(0, Math.min(0.35, geology.outline ?? 0));
  const fans = geology.fans && geology.gullies && height > 0 ? geology.fans : null;
  const reach = fans ? Math.max(0.05, Math.min(0.6, fans.reach ?? 0.3)) : 0;
  if (q > (1 + outline) * (1 + reach) + 0.01) return 0;
  const salt = formSalt(form);
  const theta = Math.atan2(nz, nx);
  if (outline > 0) q /= 1 + outline * lobe(theta, salt);
  // an inselberg's wall foot and apron on this bearing (its fans spread from the wall's foot)
  const foot = geology.profile === 'inselberg' ? inselbergFoot(geology, theta, salt) : null;
  // the talus fans below the rills' mouths (the jitter and the rill coordinate as the rills draw them)
  const fanHeight = (): number => {
    if (!fans || !geology.gullies) return 0;
    const count = Math.max(1, Math.round(geology.gullies.count));
    const jitter = (valueNoise(Math.cos(theta) * 1.6 + 7, Math.sin(theta) * 1.6 - 3, salt + 11) - 0.5) * 0.6;
    const metres = fans.heightM ?? geology.gullies.depthM * 0.6;
    return metres * fan((theta / TAU + 1) * count, q, geology.gullies.width ?? 0.45, jitter, salt + 13, count, reach,
      foot ? foot[0] : 0.82);
  };
  if (q >= 1) return fanHeight();
  let shape = profileOf(q, geology, height, domeProfile, foot);
  const breach = geology.profile === 'cone' ? geology.crater?.breachDeg : undefined;
  if (breach !== undefined) {
    // the crater wall opens on one bearing, and a lower notch runs down the flank below it; the notch is deepest at the
    // rim and fades into the crater, so it vanishes at the centre where every bearing meets
    let d = Math.abs(theta - breach * Math.PI / 180) % TAU;
    if (d > Math.PI) d = TAU - d;
    const rim = Math.max(0.02, Math.min(0.5, geology.crater?.rim ?? 0.12));
    const radial = q < rim ? smoothstep(0, rim, q) : smoothstep(0.75, rim, q);
    shape -= Math.max(0, 1 - d / 0.45) * radial * 0.35 * Math.max(0, shape);
  }
  let h = height * shape;
  if (geology.gullies && height > 0) {
    // the jitter is periodic in the bearing, so the grooves close round the knoll without a seam
    const jitter = (valueNoise(Math.cos(theta) * 1.6 + 7, Math.sin(theta) * 1.6 - 3, salt + 11) - 0.5) * 0.6;
    const count = Math.max(1, Math.round(geology.gullies.count));
    const g = gully((theta / TAU + 1) * count, q, geology.gullies.width ?? 0.45, jitter, salt + 13, count);
    h -= geology.gullies.depthM * g * gullyFlank(q, geology, foot) * Math.min(1, shape * 3);
  }
  if (geology.strata && height > 0) {
    h = bedded(h, geology.strata, (nx * 0.6 + nz * 0.25) * geology.strata.stepM * 0.5, lx, lz, salt);
  }
  if (geology.rough) {
    h += geology.rough * roughness(lx, lz, salt) * Math.min(1, Math.abs(shape) * 2.5) * Math.sign(height || 1);
  }
  return h + fanHeight();
}

/**
 * A ridge's geological height in metres: lx along its axis, lz across it. `along` is the smooth ridge's end weight
 * (terrain.ts), so the bar's ends taper as before.
 */
export function ridgeGeologyHeight(form: GeologicForm, lx: number, lz: number, along: number): number | null {
  const geology = form.geology;
  if (!geology) return null;
  const width = Math.max(1, form.width || 45);
  const height = form.height || 0;
  const outline = Math.max(0, Math.min(0.35, geology.outline ?? 0));
  if (along <= 0 || Math.abs(lz) > width * (1 + outline) + 0.5) return 0;
  const salt = formSalt(form);
  const side = lz >= 0 ? 1 : -1;
  let q = Math.abs(lz) / width;
  if (outline > 0) q /= 1 + outline * edgeLobe(lx, side, salt);
  if (q >= 1) return 0;
  const shape = profileOf(q, geology, height, ridgeShoulder);
  if (geology.front) {
    // a flow's own ends: a steep blocky front downhill, a gently thinning vent end uphill
    const half = Math.max(1, (form.length || 100) * 0.5), t = Math.max(-1, Math.min(1, lx / half)) * geology.front;
    along = t > 0 ? 1 - smoothstep(0.92, 1, t) : 1 - smoothstep(0.5, 1, -t);
    if (along <= 0) return 0;
  } else if (geology.cliffEnd && (geology.cliffEnd === 'both' || lx * geology.cliffEnd > 0)) {
    const half = Math.max(1, (form.length || 100) * 0.5);
    along = 1 - smoothstep(0.94, 1, Math.abs(lx) / half);
    if (along <= 0) return 0;
  }
  let fall = 1;
  if (geology.taper) {
    const half = Math.max(1, (form.length || 100) * 0.5);
    const t = Math.max(0, Math.min(1, (lx / half + 1) / 2)); // 0 at the -x end, 1 at the +x end
    fall = 1 - Math.min(1, Math.abs(geology.taper)) * (geology.taper > 0 ? t : 1 - t);
  }
  let h = height * along * fall * shape;
  if (geology.gullies && height > 0) {
    const perMetre = Math.max(0.01, geology.gullies.count / 100);
    const jitter = (valueNoise(lx * perMetre * 0.9, side * 2.3, salt + 11) - 0.5) * 0.6;
    const g = gully(lx * perMetre + side * 0.37, q, geology.gullies.width ?? 0.45, jitter, salt + (side > 0 ? 13 : 14));
    h -= geology.gullies.depthM * g * gullyFlank(q, geology) * Math.min(1, along * shape * 3);
  }
  if (geology.strata && height > 0) {
    h = bedded(h, geology.strata, (lx / Math.max(1, form.length || 100)) * geology.strata.stepM, lx, lz, salt);
  }
  if (geology.rough) {
    h += geology.rough * roughness(lx, lz, salt) * Math.min(1, along * Math.abs(shape) * 2.5) * Math.sign(height || 1);
  }
  return h;
}

/** The soft edge outside a lava flow's footprint and outside a cinder cone's base, in metres (geologyZoneWeights). */
const FLOW_EDGE_M = 4;
const CONE_EDGE_M = 3;

/** Whether a landform's geology names a zone: a lava flow (a ridge), a cinder cone or a cone's talus fans (knolls). */
export function hasGeologyZones(form: GeologicForm): boolean {
  const geology = form.geology;
  if (!geology) return false;
  if (form.kind === 'ridge') return geology.profile === 'flow';
  return geology.profile === 'cone' || !!(geology.fans && geology.gullies && (form.height || 0) > 0);
}

/**
 * The geological zones of one landform at the world point (x, z), each 0..1, written to `out` as [flow, cone, fan]:
 * - flow: 1 over a 'flow' ridge's whole lobed footprint (channel, levees, margin, talus and front), fading to 0 over
 *   FLOW_EDGE_M past its margin and past its ends;
 * - cone: 1 inside a 'cone' knoll's lobed base (crater, flanks and toe), fading to 0 over CONE_EDGE_M past it;
 * - fan: a talus fan's thickness as a share of its height at the toe (the fan's own 0..1 shape: its height in metres
 *   is `fans.heightM` times this).
 * The zones describe the authored landform; where a road or a spawn's clearance lowers it, the terrain's own masks
 * paint over them. For the terrain material (the flow footprint rides the landform mask) and CPU-side dressing.
 */
export function geologyZoneWeights(form: GeologicForm, x: number, z: number, out: GeologyZones): GeologyZones {
  out[0] = 0; out[1] = 0; out[2] = 0;
  const geology = form.geology;
  if (!geology) return out;
  const yaw = (form.yawDeg ?? 0) * Math.PI / 180;
  const c = form._c ?? Math.cos(yaw), s = form._s ?? Math.sin(yaw);
  const dx = x - form.x, dz = z - form.z;
  const lx = dx * c + dz * s, lz = -dx * s + dz * c;
  const outline = Math.max(0, Math.min(0.35, geology.outline ?? 0));
  const salt = formSalt(form);
  if (form.kind === 'ridge') {
    if (geology.profile !== 'flow') return out;
    const width = Math.max(1, form.width || 45), half = Math.max(1, (form.length || 100) * 0.5);
    // the margin as ridgeGeologyHeight lobes it: q = |lz| / (width (1 + outline edgeLobe)) reaches 1 there
    const edge = width * (outline > 0 ? 1 + outline * edgeLobe(lx, lz >= 0 ? 1 : -1, salt) : 1);
    out[0] = (1 - smoothstep(0, FLOW_EDGE_M, Math.abs(lz) - edge))
      * (1 - smoothstep(0, FLOW_EDGE_M, Math.abs(lx) - half));
    return out;
  }
  const rx = Math.max(1, form.rx || form.r || 70), rz = Math.max(1, form.rz || form.r || rx);
  const nx = lx / rx, nz = lz / rz;
  const theta = Math.atan2(nz, nx);
  let q = Math.sqrt(nx * nx + nz * nz);
  if (outline > 0) q /= 1 + outline * lobe(theta, salt);
  if (geology.profile === 'cone') {
    // metres past the lobed base along this bearing: q grows linearly with the distance from the centre
    const rho = Math.hypot(lx, lz);
    out[1] = q > 1 ? 1 - smoothstep(0, CONE_EDGE_M, (q - 1) * rho / q) : 1;
  }
  const fans = geology.fans && geology.gullies && (form.height || 0) > 0 ? geology.fans : null;
  if (fans && geology.gullies) {
    const reach = Math.max(0.05, Math.min(0.6, fans.reach ?? 0.3));
    const count = Math.max(1, Math.round(geology.gullies.count));
    // the fan as knollGeologyHeight draws it: the same jitter, rill coordinate and salt
    const jitter = (valueNoise(Math.cos(theta) * 1.6 + 7, Math.sin(theta) * 1.6 - 3, salt + 11) - 0.5) * 0.6;
    const start = geology.profile === 'inselberg' ? inselbergFoot(geology, theta, salt)[0] : 0.82;
    out[2] = fan((theta / TAU + 1) * count, q, geology.gullies.width ?? 0.45, jitter, salt + 13, count, reach, start);
  }
  return out;
}

/** How far from its centre a landform's zones reach, in metres. */
function zoneReach(form: GeologicForm): number {
  const geology = form.geology!;
  const outline = Math.max(0, Math.min(0.35, geology.outline ?? 0));
  if (form.kind === 'ridge') {
    return Math.hypot(Math.max(1, (form.length || 100) * 0.5) + FLOW_EDGE_M,
      Math.max(1, form.width || 45) * (1 + outline) + FLOW_EDGE_M);
  }
  const rx = Math.max(1, form.rx || form.r || 70), rz = Math.max(1, form.rz || form.r || rx);
  const reach = geology.fans ? Math.max(0.05, Math.min(0.6, geology.fans.reach ?? 0.3)) : 0;
  return Math.max(rx, rz) * (1 + outline) * (1 + reach) + CONE_EDGE_M;
}

/**
 * The map's geological zones at (x, z): the strongest of each zone over its landforms (geologyZoneWeights), or null
 * when no landform has a zone. Pure and deterministic; it allocates nothing per call.
 */
export function createGeologyZoneSampler(
  forms: readonly GeologicForm[],
): ((x: number, z: number, out: GeologyZones) => GeologyZones) | null {
  const zoned = forms.filter(hasGeologyZones);
  if (!zoned.length) return null;
  const reach = zoned.map(zoneReach);
  const one: GeologyZones = [0, 0, 0];
  return (x, z, out) => {
    out[0] = 0; out[1] = 0; out[2] = 0;
    for (let i = 0; i < zoned.length; i++) {
      const dx = x - zoned[i].x, dz = z - zoned[i].z;
      if (dx * dx + dz * dz > reach[i] * reach[i]) continue;
      geologyZoneWeights(zoned[i], x, z, one);
      if (one[0] > out[0]) out[0] = one[0];
      if (one[1] > out[1]) out[1] = one[1];
      if (one[2] > out[2]) out[2] = one[2];
    }
    return out;
  };
}

/**
 * A fallen block's site on a knoll's talus, from two uniform numbers in [0, 1): the bearing from `u`; from `v` a
 * normalized radius from the wall's foot (an inselberg's, which wanders round the dome; a butte's; a cone's lower
 * flank; a dome's mid-flank) out past the toe over the fans' reach, crowded towards the foot as fallen blocks are.
 * World coordinates on the lobed outline (for props.ts's boulder aprons, `geology.boulders`).
 */
export function geologyBoulderSite(form: GeologicForm, u: number, v: number): [number, number] {
  const geology = form.geology ?? {};
  const salt = formSalt(form);
  const theta = u * TAU;
  const profile = geology.profile ?? 'dome';
  const start = profile === 'inselberg' ? inselbergFoot(geology, theta, salt)[0]
    : profile === 'butte' ? (geology.wall ?? BUTTE_WALL)[1] : profile === 'cone' ? 0.72 : 0.6;
  const reach = geology.fans ? Math.max(0.05, Math.min(0.6, geology.fans.reach ?? 0.3)) : 0.15;
  const q = start + (1 + reach - start) * Math.pow(Math.max(0, Math.min(1, v)), 1.6);
  const outline = Math.max(0, Math.min(0.35, geology.outline ?? 0));
  const raw = outline > 0 ? q * (1 + outline * lobe(theta, salt)) : q;
  const rx = Math.max(1, form.rx || form.r || 70), rz = Math.max(1, form.rz || form.r || rx);
  const lx = raw * Math.cos(theta) * rx, lz = raw * Math.sin(theta) * rz;
  const yaw = (form.yawDeg ?? 0) * Math.PI / 180;
  const c = form._c ?? Math.cos(yaw), s = form._s ?? Math.sin(yaw);
  return [form.x + lx * c - lz * s, form.z + lx * s + lz * c];
}

/** Whether a landform is bare rock by its geology: a butte or mesa (knoll or ridge), an inselberg, a lava flow, or a
 * landform made of slag. */
export function isRockLandform(form: GeologicForm): boolean {
  const profile = form.geology?.profile;
  return profile === 'butte' || profile === 'inselberg' || (profile === 'flow' && form.kind === 'ridge')
    || form.geology?.material === 'slag';
}

/**
 * A rock landform's footprint at the world point (x, z), 0..1: 1 over its whole lobed outline (a ridge's margin and
 * ends, a knoll's base), fading to 0 over FLOW_EDGE_M past it; 0 for any other landform. For a map whose rock gate
 * reads its authored rock landforms (terrain.ts `landformRock`).
 */
export function geologyRockWeight(form: GeologicForm, x: number, z: number): number {
  if (!isRockLandform(form)) return 0;
  const geology = form.geology!;
  const yaw = (form.yawDeg ?? 0) * Math.PI / 180;
  const c = form._c ?? Math.cos(yaw), s = form._s ?? Math.sin(yaw);
  const dx = x - form.x, dz = z - form.z;
  const lx = dx * c + dz * s, lz = -dx * s + dz * c;
  const outline = Math.max(0, Math.min(0.35, geology.outline ?? 0));
  const salt = formSalt(form);
  if (form.kind === 'ridge') {
    const width = Math.max(1, form.width || 45), half = Math.max(1, (form.length || 100) * 0.5);
    const edge = width * (outline > 0 ? 1 + outline * edgeLobe(lx, lz >= 0 ? 1 : -1, salt) : 1);
    return (1 - smoothstep(0, FLOW_EDGE_M, Math.abs(lz) - edge)) * (1 - smoothstep(0, FLOW_EDGE_M, Math.abs(lx) - half));
  }
  const rx = Math.max(1, form.rx || form.r || 70), rz = Math.max(1, form.rz || form.r || rx);
  const nx = lx / rx, nz = lz / rz;
  let q = Math.sqrt(nx * nx + nz * nz);
  if (outline > 0) q /= 1 + outline * lobe(Math.atan2(nz, nx), salt);
  return q > 1 ? 1 - smoothstep(0, FLOW_EDGE_M, (q - 1) * Math.hypot(lx, lz) / q) : 1;
}

/** The strongest rock-landform footprint over a map's landforms at (x, z), or null when none is rock. */
export function createGeologyRockSampler(forms: readonly GeologicForm[]): ((x: number, z: number) => number) | null {
  const rock = forms.filter(isRockLandform);
  if (!rock.length) return null;
  const reach = rock.map((form) => {
    const outline = Math.max(0, Math.min(0.35, form.geology?.outline ?? 0));
    if (form.kind === 'ridge') {
      return Math.hypot(Math.max(1, (form.length || 100) * 0.5) + FLOW_EDGE_M,
        Math.max(1, form.width || 45) * (1 + outline) + FLOW_EDGE_M);
    }
    return Math.max(form.rx || form.r || 70, form.rz || form.r || form.rx || 70) * (1 + outline) + FLOW_EDGE_M;
  });
  return (x, z) => {
    let best = 0;
    for (let i = 0; i < rock.length && best < 1; i++) {
      const dx = x - rock[i].x, dz = z - rock[i].z;
      if (dx * dx + dz * dz > reach[i] * reach[i]) continue;
      best = Math.max(best, geologyRockWeight(rock[i], x, z));
    }
    return best;
  };
}
