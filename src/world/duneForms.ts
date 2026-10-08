// src/world/duneForms.ts — sand landforms in sand's own form (the map-revival lane, 2026-10-07, Sirocco Wadi round 1;
// gauntlet wave 235 on the PR head: "a bleached cream-beige of soft, low, banded mesas and pale sand", the draa and the
// star dunes "soft cream mounds").
//
// The Grand Erg Oriental's sand lies at its angle of rest, so its dunes have crests, not crowns. A seif, the linear dune
// the wind draws out along itself (the Erg's draa), is a sharp crest wandering across its line: a slip face on the side
// it bows to and a long back on the other, the two changing places along it, its height swelling to peaks and dipping to
// saddles. A star dune, where the winds come from every quarter, is a peak whose sharp-crested arms run out in three to
// five directions, steep between them. A landform with `dune` takes this section in place of the smooth ridge or knoll
// (terrain.ts sampleLandformHeight); its plan, its yaw and its weights are the landform's. Every term is a deterministic
// function of the landform's local frame and its position: no seed, no stream, no grid.
//
// The slopes: a seif's back about 9° and its slip face about 19° at the crest (a hull crosses one, slowly, and sits
// hull-down behind its brink); a star dune's flanks near the angle of rest (34°) round its peak, its arms' backs gentler.

/** A sand landform's form (a ridge's or a knoll's `dune`). */
export interface DuneForm {
  /** 'seif' on a ridge (a crest along its length), 'star' on a knoll (a peak and its arms). */
  kind: 'seif' | 'star';
  /** seif: how far the crest wanders from the ridge's line, a share of the half-width (default 0.16), and the wander's
   * wavelength in metres (default 110). */
  sinuosity?: number;
  wavelengthM?: number;
  /** seif: the slip face's run from the crest, a share of the half-width (default 0.3). */
  slip?: number;
  /** star: how many arms (3-5, default 4), and how far the flanks between them reach, a share of the radius (default
   * 0.6; the arms reach the whole radius). */
  arms?: number;
  waist?: number;
  /** star: the share of the height in the broad sand base the arms rise from (default 0.5: a star dune stands on its own
   * draa, so its mass and the sight it blocks stay those of the smooth knoll it replaces). */
  base?: number;
}

/** The slice of a landform the dune forms read (its local frame is the caller's). */
export interface DuneLandform {
  x: number;
  z: number;
  height: number;
  length?: number;
  width?: number;
  rx?: number;
  rz?: number;
  r?: number;
  dune?: DuneForm;
}

const TAU = Math.PI * 2;
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/**
 * A phase in [0, 2π) from the landform's position — the same for a landform and its turn about the map's centre (a
 * layout turned through 180°: (x, z) and (-x, -z)), whose local frame is turned with it (twinSign), so twins are each
 * other's rotation exactly.
 */
function salt(form: DuneLandform, k: number): number {
  const g = twinSign(form);
  const s = Math.sin(g * form.x * 12.9898 + g * form.z * 78.233 + k * 37.719) * 43758.5453;
  return (s - Math.floor(s)) * TAU;
}
/** -1 for the turned one of a pair of twins (x < 0, or x = 0 and z < 0), whose local frame reads turned; else 1. */
function twinSign(form: DuneLandform): number {
  return form.x < 0 || (form.x === 0 && form.z < 0) ? -1 : 1;
}

/**
 * A seif's height at the local point (lx along the ridge, lz across it), `along` the ridge's own fade at its ends.
 * The crest wanders by `sinuosity` of the half-width; the side it bows to is the slip face (a short concave run), the
 * other the back (a long one), blended across the crest's straight stretches so neither flank jumps.
 */
export function seifHeight(form: DuneLandform, lx: number, lz: number, along: number): number {
  if (along <= 0) return 0;
  const g = twinSign(form);
  lx *= g; lz *= g;
  const d = form.dune ?? { kind: 'seif' };
  const width = Math.max(1, form.width || 45), height = form.height || 0;
  const lam = Math.max(20, d.wavelengthM ?? 110), sin = d.sinuosity ?? 0.16, slip = Math.max(0.12, d.slip ?? 0.3);
  const s0 = salt(form, 0), s1 = salt(form, 1), s2 = salt(form, 2);
  // the crest's wander across the line, -1..1, and its offset
  const wob = 0.62 * Math.sin(TAU * lx / lam + s0) + 0.38 * Math.sin(TAU * lx / (lam * 0.41) + s1);
  const crest = wob * sin * width;
  const dz = lz - crest;
  // the slip face is on the side the crest bows to: leeness 1 there, 0 on the back, a blend where the crest runs straight
  const lee = dz >= 0 ? smooth(-0.3, 0.3, wob) : smooth(-0.3, 0.3, -wob);
  // the back runs from the crest to the ridge's edge on its side (longer on the side the crest leans away from), the
  // slip face its short run
  const back = 1 + sin * Math.abs(wob) * (dz * wob >= 0 ? -1 : 1);
  const run = width * (back + (slip - back) * lee);
  const t = Math.abs(dz) / Math.max(1, run);
  if (t >= 1) return 0;
  // the back is concave (wind-packed, rising to the brink), the slip face nearly planar at rest with a concave foot
  const p = 1.7 + (1.15 - 1.7) * lee;
  // the crest's height swells to peaks and dips to saddles along it
  const crestH = height * (0.8 + 0.2 * Math.sin(TAU * lx / (lam * 1.7) + s2));
  return crestH * Math.pow(1 - t, p) * along;
}

/**
 * A star dune's height at the local point (lx, lz in the knoll's frame): a peak at its centre, `arms` sharp-crested arms
 * reaching the whole radius on bearings spaced round it (each turned a little off the even spacing), the flanks between
 * them reaching `waist` of it. Outside every arm's reach, nothing.
 */
export function starDuneHeight(form: DuneLandform, lx: number, lz: number): number {
  const g = twinSign(form);
  lx *= g; lz *= g;
  const d = form.dune ?? { kind: 'star' };
  const rx = Math.max(1, form.rx || form.r || 70), rz = Math.max(1, form.rz || form.r || rx), height = form.height || 0;
  const u = lx / rx, v = lz / rz, r = Math.hypot(u, v);
  if (r >= 1) return 0;
  const n = Math.max(3, Math.min(5, Math.round(d.arms ?? 4))), waist = Math.max(0.3, Math.min(0.95, d.waist ?? 0.6));
  const theta = Math.atan2(v, u), s0 = salt(form, 3);
  // the arms' reach on this bearing: a narrow lobe round each arm (cos^18: an arm a tenth of a turn across at its root)
  let arm = 0;
  for (let k = 0; k < n; k++) {
    const bearing = s0 + (k / n) * TAU + 0.35 * Math.sin(k * 1.7 + s0);
    const c = Math.max(0, Math.cos(theta - bearing));
    arm = Math.max(arm, Math.pow(c, 18));
  }
  const reach = waist + (1 - waist) * arm;
  // the base: the smooth knoll's own section (terrain.ts), a share of the height
  const b = Math.max(0, Math.min(0.8, d.base ?? 0.5));
  const w = 1 - smooth(0.12, 1, r);
  const baseH = b * w * w * (3 - 2 * w);
  const t = r / reach;
  if (t >= 1) return height * baseH;
  // near the peak the flanks stand at rest; out along an arm the crest falls more gently, its own swells on it
  const p = 1.15;
  const swell = 1 + 0.08 * arm * Math.sin(r * 9 + s0);
  return height * (baseH + (1 - b) * Math.pow(1 - t, p) * swell);
}

/** The dune form's height for a ridge (`along` its end fade) or a knoll; null when the landform carries none. */
export function duneHeight(form: DuneLandform & { kind: string }, lx: number, lz: number, along: number): number | null {
  if (!form.dune) return null;
  if (form.kind === 'ridge' && form.dune.kind === 'seif') return seifHeight(form, lx, lz, along);
  if (form.kind !== 'ridge' && form.dune.kind === 'star') return starDuneHeight(form, lx, lz);
  return null;
}
