// src/world/landformGeology.ts — geological structure for authored landforms (maps-and-layouts lane, 2026-10-03).
//
// The gauntlet's wave-0 critics read every landform as a smooth shell: "ice-cream-scoop domes", "berm-like mesas with
// one perfectly level terrace", with no rock, jointing, erosion gullies, talus or scree. A landform may now carry
// `geology`, which shapes its own height the way rock and weather shape a real hill:
// - outline: its plan is lobed, not an ellipse or a straight-sided bar;
// - profile: 'dome' (the smooth default), 'butte' (a gently domed cap, a steep wall, a concave talus apron) or 'cone'
//   (a summit crater, flanks at a near-constant slope, a rounded toe; the crater may be breached);
// - gullies: V-shaped rills down the flanks, irregularly spaced, fading into the apron;
// - strata: bedding, a bench and a riser per bed, the beds dipping slightly so no bench is level;
// - rough: knobbly relief a few metres across, on the landform and not on the plain round it.
// Every term is a deterministic function of (x, z) and the landform's own frame: no terrain seed, no random stream, no
// grid. A landform without `geology` keeps its exact smooth shape: terrain.ts calls this module only when it is set.
// The terrain's rock layer follows slope, so the walls, risers and gully sides read as rock.

export interface LandformGeology {
  /** Plan irregularity, 0 (the authored ellipse or bar) to 0.35. */
  outline?: number;
  /** The radial (knoll) or cross-axis (ridge) profile. */
  profile?: 'dome' | 'butte' | 'cone';
  /** butte: the cap's edge and the wall's foot, as fractions of the radius or half-width (default 0.45, 0.62). */
  wall?: readonly [number, number];
  /** butte: the talus apron's height at the wall's foot, as a share of the landform's height (default 0.28). */
  apron?: number;
  /** cone: the crater's rim as a fraction of the radius, its depth in metres and an optional breach bearing in
   * degrees (0 = local +x, counter-clockwise towards local +z). */
  crater?: { rim: number; depthM: number; breachDeg?: number };
  /** Rills down the flanks: how many round a knoll (or per 100 m of a ridge), their deepest cut in metres and their
   * width as a share of their spacing (default 0.45); each rill varies its own depth, head and meander. */
  gullies?: { count: number; depthM: number; width?: number };
  /** Bedding: the bed thickness in metres and the riser's share of each bed (default 0.3). */
  strata?: { stepM: number; riser?: number };
  /** Knobbly relief amplitude in metres. */
  rough?: number;
  /** Ridges only: the crest falls along the axis, to (1 - |taper|) of the height at one end: positive lowers the
   * local +x end, negative the -x end. A spur descending from a wall to its toe. */
  taper?: number;
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
  geology?: LandformGeology;
}

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

function profileOf(q: number, geology: LandformGeology, height: number, fallback: (q: number) => number): number {
  const profile = geology.profile ?? 'dome';
  if (profile === 'butte') return butteProfile(q, geology);
  if (profile === 'cone') return coneProfile(q, geology, height);
  return fallback(q);
}

/** Where gullies cut: the wall and upper apron of a butte, below the rim of a cone, the mid-flank of a dome. */
function gullyFlank(q: number, geology: LandformGeology): number {
  const profile = geology.profile ?? 'dome';
  if (profile === 'butte') {
    const [top, foot] = geology.wall ?? BUTTE_WALL;
    return smoothstep(top * 0.8, foot, q) * (1 - smoothstep(0.75, 1, q));
  }
  if (profile === 'cone') {
    const rim = geology.crater?.rim ?? 0.12;
    return smoothstep(rim, rim + 0.15, q) * (1 - smoothstep(0.8, 1, q));
  }
  return smoothstep(0.08, 0.35, q) * (1 - smoothstep(0.7, 1, q));
}

/**
 * Rills of a coordinate u (one per unit), in [0, 1] of their deepest cut. Each rill has its own depth, its own head
 * (it begins further down the flank or nearer the top), a meander along the fall line and a rounded V section, so the
 * rills never read as regular spokes. `fall` is the position down the flank in [0, 1]; `jitter` shifts the pattern.
 */
function gully(u: number, fall: number, width: number, jitter: number, salt: number): number {
  const index = Math.round(u + jitter);
  const meander = 0.14 * Math.sin(fall * 7 + hash2(index, 1, salt) * TAU)
    + 0.06 * Math.sin(fall * 17 + hash2(index, 2, salt) * TAU);
  const v = u + jitter + meander;
  const d = Math.abs(v - Math.round(v)); // 0 on a rill's line, 0.5 halfway to the next
  const half = Math.max(0.05, width * (0.7 + 0.6 * hash2(index, 3, salt)) * 0.5);
  const section = smoothstep(0, 1, 1 - d / half);
  const depth = 0.4 + 0.6 * hash2(index, 4, salt);
  const head = 0.05 + 0.4 * hash2(index, 5, salt);
  return section * depth * smoothstep(head, head + 0.18, fall);
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
  if (q > 1 + outline + 0.01) return 0;
  const salt = formSalt(form);
  const theta = Math.atan2(nz, nx);
  if (outline > 0) q /= 1 + outline * lobe(theta, salt);
  if (q >= 1) return 0;
  let shape = profileOf(q, geology, height, domeProfile);
  const breach = geology.profile === 'cone' ? geology.crater?.breachDeg : undefined;
  if (breach !== undefined) {
    // the crater wall opens on one bearing, and a lower notch runs down the flank below it
    let d = Math.abs(theta - breach * Math.PI / 180) % TAU;
    if (d > Math.PI) d = TAU - d;
    shape -= Math.max(0, 1 - d / 0.45) * smoothstep(0.75, 0, q) * 0.35 * Math.max(0, shape);
  }
  let h = height * shape;
  if (geology.gullies && height > 0) {
    // the jitter is periodic in the bearing, so the grooves close round the knoll without a seam
    const jitter = (valueNoise(Math.cos(theta) * 1.6 + 7, Math.sin(theta) * 1.6 - 3, salt + 11) - 0.5) * 0.6;
    const count = Math.max(1, geology.gullies.count);
    const g = gully((theta / TAU + 1) * count, q, geology.gullies.width ?? 0.45, jitter, salt + 13);
    h -= geology.gullies.depthM * g * gullyFlank(q, geology) * Math.min(1, shape * 3);
  }
  if (geology.strata && height > 0) {
    h = bedded(h, geology.strata, (nx * 0.6 + nz * 0.25) * geology.strata.stepM * 0.5, lx, lz, salt);
  }
  if (geology.rough) {
    h += geology.rough * roughness(lx, lz, salt) * Math.min(1, Math.abs(shape) * 2.5) * Math.sign(height || 1);
  }
  return h;
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
