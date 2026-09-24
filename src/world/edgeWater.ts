// Round 40 (2026-09-22, AAA map program check 13 "water at the edge: same level and shader beyond"): a battlefield's
// water that reaches the playable square must continue into the horizon ring as the same water. Until now only Coastal
// declared a hand-placed sea aperture, and it painted the ring's annulus a neutral grey; Saltwind's bay simply stopped
// at the red line with a beach beyond. This module derives every sea opening from where the flattened water actually
// meets the square edge, keeps the authored opening when a map has one, and gives the shallow-water sheet an apron fan
// over each opening so the sheet's own shader (fresnel, glitter, wakes) reads past the edge instead of ending in a
// straight line. Pure functions over the height field; the ring and the terrain both read them.
import * as THREE from 'three';
import { waterContactProfile } from './waterContact.ts';

/** A sea-level aperture in the horizon ring. Azimuth 90° is +x (east), 0° is +z (north). */
export interface SeaOpening {
  azimuthDeg: number;
  widthDeg: number;
  /** The water FLOOR height (m), as the authored apertures always meant it: the ring's sea floor continues 4 cm
   * below it and the shallow-water sheet's apron floats the map's water depth above it. */
  level: number;
  colorHex?: number;
  /** Fraction of the half-width that stays fully open before the shoulders taper (authored default 0.58). */
  shoulder?: number;
  source?: 'authored' | 'edge';
  /** Round 47: how far past the square edge the map's own bay contour still reaches along this opening (m); the
   * derived sector takes over from there. 0 when the terrain hands no contour. */
  coastReachM?: number;
}

export interface EdgeWaterField {
  size: number;
  getWaterMaskAt(x: number, z: number): number;
  getHeightAt(x: number, z: number): number;
  getWaterDepthAt?(x: number, z: number): number;
}

const TAU = Math.PI * 2;
const DEFAULT_SHOULDER = 0.58;
/** Derived openings keep their measured run fully open and taper beyond it. Round 47 follow-up (2026-09-23): the taper
 * was 28 % of the run's half-width (0.78) — at Saltwind's mouth the ring's far rows fell from +50 m to the sea floor
 * across two or three columns, a sheared 30° face that read as two dark slabs from above; near the square the bay's
 * own contour rules (ringSeaWeight), so a wider taper only opens the far ring beside the mouth — a headland sloping
 * into the sea over ~17° of arc instead of a wall. */
const EDGE_SHOULDER = 0.6;
/** The apron's outer radius: well past the first authored ridge row, under the far haze, where the ring's own
 * sea colour has taken on the low sky (m). */
export const SEA_APRON_OUTER_RADIUS_M = 1400;
/** The apron reaches this far back inside the square so no uncovered floor strip can show at the seam (m). */
export const SEA_APRON_OVERLAP_M = 12;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const asList = (openings: readonly SeaOpening[] | SeaOpening | undefined): readonly SeaOpening[] =>
  openings === undefined ? [] : Array.isArray(openings) ? openings : [openings as SeaOpening];

/** Ring angle (x = r cos a, z = r sin a) → compass azimuth in degrees, 0..360. */
export function ringAngleToAzimuthDeg(angle: number): number {
  return ((90 - angle * 180 / Math.PI) % 360 + 360) % 360;
}

function openingWeight(angle: number, opening: SeaOpening): number {
  const direction = Math.PI / 2 - opening.azimuthDeg * Math.PI / 180;
  const distance = Math.abs(Math.atan2(Math.sin(angle - direction), Math.cos(angle - direction)));
  const halfWidth = Math.min(175, Math.max(10, opening.widthDeg)) * Math.PI / 360;
  return 1 - smoothstep(halfWidth * (opening.shoulder ?? DEFAULT_SHOULDER), halfWidth, distance);
}

/** 1 inside an opening, tapering to 0 at its shoulders; the maximum over every opening. */
export function seaOpeningWeight(angle: number, openings: readonly SeaOpening[] | SeaOpening | undefined): number {
  let weight = 0;
  for (const opening of asList(openings)) weight = Math.max(weight, openingWeight(angle, opening));
  return weight;
}

/** Round 49 (2026-09-23): 1 inside a sea opening (its taper included) and for the first third of `bandRad` beyond its
 * outer edge, easing to 0 at `bandRad` — the columns where a headland meets the water (a fjord peninsula sits 4–8°
 * outside BOTH of its arms' openings); the maximum over every opening. */
export function seaHeadlandWeight(angle: number, openings: readonly SeaOpening[] | SeaOpening | undefined, bandRad: number): number {
  let weight = 0;
  for (const opening of asList(openings)) {
    const direction = Math.PI / 2 - opening.azimuthDeg * Math.PI / 180;
    const distance = Math.abs(Math.atan2(Math.sin(angle - direction), Math.cos(angle - direction)));
    const halfWidth = Math.min(175, Math.max(10, opening.widthDeg)) * Math.PI / 360;
    weight = Math.max(weight, 1 - smoothstep(halfWidth + bandRad * 0.35, halfWidth + bandRad, distance));
  }
  return weight;
}

/** The opening that owns this azimuth (largest weight), or null on land. */
export function dominantSeaOpening(angle: number, openings: readonly SeaOpening[] | SeaOpening | undefined): SeaOpening | null {
  let best: SeaOpening | null = null, bestWeight = 0;
  for (const opening of asList(openings)) {
    const weight = openingWeight(angle, opening);
    if (weight > bestWeight) { best = opening; bestWeight = weight; }
  }
  return best;
}

interface EdgeRun { angleStart: number; angleEnd: number; levelSum: number; samples: number }

/**
 * Walk the four edges of the square 20 m inside the boundary and turn every run of flattened water at least
 * `minRunM` long into a sea opening centred on the run, wide enough that the run stays fully open and the shoulders
 * taper into the neighbouring shore. Runs that meet at a corner merge. The 20 m inset is deliberate: the shore ramps
 * of adjacent basins dry the last metres before the red line (Saltwind's bay reads as three separate runs at 1.5 m
 * and as one 74° bay at 20 m), and the ring's aperture must follow the bay, not the beach fringe the clamp leaves.
 * Deterministic: no randomness, no allocation beyond the result.
 */
export function scanEdgeWater(
  field: EdgeWaterField,
  { stepM = 4, minRunM = 40, insetM = 20, wetThreshold = 0.5 }: { stepM?: number; minRunM?: number; insetM?: number; wetThreshold?: number } = {},
): SeaOpening[] {
  const half = field.size / 2, edge = half - insetM;
  const runs: EdgeRun[] = [];
  // edges in ring-angle order: east (+x), north (+z), west (−x), south (−z); each walked with increasing angle
  const edges: ReadonlyArray<(t: number) => readonly [number, number]> = [
    (t) => [edge, t], (t) => [-t, edge], (t) => [-edge, -t], (t) => [t, -edge],
  ];
  // the flattened lake FLOOR: the ring continues the bed, the sheet apron floats the map's depth above it
  const surface = (x: number, z: number): number => field.getHeightAt(x, z);
  const angleOf = (x: number, z: number, previous: number | null): number => {
    let angle = Math.atan2(z, x);
    if (previous !== null) { while (angle < previous - Math.PI) angle += TAU; while (angle > previous + Math.PI) angle -= TAU; }
    return angle;
  };
  let current: EdgeRun | null = null, lastAngle: number | null = null;
  const close = (): void => {
    if (current && current.samples * stepM >= minRunM) runs.push(current);
    current = null;
  };
  for (const point of edges) {
    for (let t = -edge; t <= edge + 1e-6; t += stepM) {
      const [x, z] = point(t);
      const angle = angleOf(x, z, lastAngle); lastAngle = angle;
      const wet = field.getWaterMaskAt(x, z) >= wetThreshold;
      if (!wet) { close(); continue; }
      if (!current) current = { angleStart: angle, angleEnd: angle, levelSum: 0, samples: 0 };
      current.angleEnd = angle; current.levelSum += surface(x, z); current.samples++;
    }
  }
  close();
  // a run that ends exactly where the next begins (a corner) is one shoreline
  const merged: EdgeRun[] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && run.angleStart - last.angleEnd <= (stepM / edge) * 1.5 + 1e-6) {
      last.angleEnd = run.angleEnd; last.levelSum += run.levelSum; last.samples += run.samples;
    } else merged.push({ ...run });
  }
  // a run wrapping past the first sample (water across the east edge's south end) joins the first run
  if (merged.length > 1) {
    const first = merged[0], last = merged[merged.length - 1];
    if (first.angleStart + TAU - last.angleEnd <= (stepM / edge) * 1.5 + 1e-6) {
      first.angleStart = last.angleStart - TAU; first.levelSum += last.levelSum; first.samples += last.samples; merged.pop();
    }
  }
  return merged.map((run) => {
    const centre = (run.angleStart + run.angleEnd) / 2;
    const spanHalf = (run.angleEnd - run.angleStart) / 2;
    // the run stays fully open (weight 1 up to shoulder × half-width); the taper extends beyond it into the shore
    const halfWidthDeg = Math.min(175, Math.max(10, (spanHalf / EDGE_SHOULDER) * 180 / Math.PI + 1.5));
    return {
      azimuthDeg: Math.round(ringAngleToAzimuthDeg(centre) * 100) / 100,
      widthDeg: Math.round(halfWidthDeg * 2 * 100) / 100,
      level: Math.round((run.levelSum / run.samples) * 1000) / 1000,
      shoulder: EDGE_SHOULDER,
      source: 'edge',
    };
  });
}

/** The terrain material's `uSeaOpenings` slots: (direction angle, half-width, shoulder, 0), four at most. */
export function seaOpeningUniforms(openings: readonly SeaOpening[]): THREE.Vector4[] {
  const slots: THREE.Vector4[] = [];
  for (let i = 0; i < 4; i++) {
    const opening = openings[i];
    // round 47: .w carries the bay contour's reach past the edge (m); the shader opens the sector beyond it
    slots.push(opening
      ? new THREE.Vector4(Math.PI / 2 - opening.azimuthDeg * Math.PI / 180,
        Math.min(175, Math.max(10, opening.widthDeg)) * Math.PI / 360, opening.shoulder ?? DEFAULT_SHOULDER, opening.coastReachM ?? 0)
      : new THREE.Vector4(0, 0, 1, 0));
  }
  return slots;
}

function azimuthDistanceDeg(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360 + 540) % 360 - 180);
  return d;
}

/**
 * The openings a map's ring and water sheet share: the authored aperture (when the map declares one) plus every
 * derived edge opening that does not overlap it. Openings without a colour take the map's own deep-water colour
 * (waterContact.ts), so the ring's apron reads as this battlefield's sea rather than a neutral grey.
 */
export function resolveSeaOpenings(
  authored: SeaOpening | undefined,
  field: (Partial<EdgeWaterField> & { getOutlandWaterAt?: OutlandWaterQuery }) | null | undefined,
  mapId: string,
): SeaOpening[] {
  const color = waterContactProfile(mapId).color;
  const openings: SeaOpening[] = authored
    ? [{ shoulder: DEFAULT_SHOULDER, source: 'authored', ...authored, colorHex: authored.colorHex ?? color }] : [];
  if (field && typeof field.getWaterMaskAt === 'function' && typeof field.getHeightAt === 'function' && Number.isFinite(field.size)) {
    for (const derived of scanEdgeWater(field as EdgeWaterField)) {
      const overlaps = openings.some((opening) =>
        azimuthDistanceDeg(opening.azimuthDeg, derived.azimuthDeg) < (opening.widthDeg + derived.widthDeg) / 2);
      if (!overlaps) openings.push({ ...derived, colorHex: color });
    }
  }
  // round 47: how far the bay's own contour runs past the edge along each opening (the sector opens beyond it)
  const waterAt = field && typeof field.getOutlandWaterAt === 'function' ? field.getOutlandWaterAt : null;
  const halfSize = field && Number.isFinite(field.size) ? (field.size as number) / 2 : 512;
  for (const opening of openings) opening.coastReachM = coastReachAlong(opening, waterAt, halfSize);
  return openings;
}

/** Round 47 (2026-09-23): a bay's own contour evaluated past the square (terrain.ts outlandWaterAt). */
export type OutlandWaterQuery = (x: number, z: number) => { wetness: number; level: number } | null;
/** The open-sea sector fades in over the second half of the bay contour's reach past the edge and is fully open
 * BEFORE the contour's own far shore (0.85 of the reach + 20 m), so a bay mouth opens straight into the sea and the
 * disc's far arc — a modelling artifact, never geography — is under water by the time the ring reaches it. The
 * round-47 law ([0.7, 1.1 + 40]) left ~60 % of the ring's height standing on that arc: a dark bank across every sea
 * horizon, and a cliff wall when the arc lay under the ring's mountains. With no contour (reach 0) it opens within 20 m. */
export function seaSectorBlend(coastReachM: number | undefined): readonly [number, number] {
  const reach = Math.max(0, coastReachM ?? 0);
  return [reach * 0.5, reach * 0.85 + 20];
}
/** March the bay contour outward from the square edge along an opening's azimuth: the last wet metre. */
export function coastReachAlong(opening: SeaOpening, waterAt: OutlandWaterQuery | null | undefined, halfSize = 512): number {
  if (!waterAt) return 0;
  const direction = Math.PI / 2 - opening.azimuthDeg * Math.PI / 180;
  const cosine = Math.cos(direction), sine = Math.sin(direction);
  const edge = halfSize / Math.max(Math.abs(cosine), Math.abs(sine));
  let reach = 0;
  for (let step = 4; step <= 900; step += 4) {
    const r = edge + step;
    const coast = waterAt(cosine * r, sine * r);
    if (coast && coast.wetness >= 0.5) reach = step;
    else if (step - reach > 48) break; // the contour ended (a small gap is bridged)
  }
  return reach;
}

/**
 * Round 47 (2026-09-23, owner: "evident right angle with shore and water at the border"): the sea past the square used to
 * be an azimuth SECTOR — a beach running obliquely toward the red line stopped on a straight edge and open water began.
 * The apron is now a grid over the outland whose cells are admitted where the map's own bay contours are wet, and only
 * beyond 120–360 m from the edge by the derived sector (the open sea under the haze). The bay's shoreline therefore
 * continues past the border as the same curve the square draws inside it. Falls back to the sector fan when the
 * terrain hands no contour query (frozen fields, receipts).
 */
export function buildOutlandWaterGeometry(
  openings: readonly SeaOpening[],
  waterAt: OutlandWaterQuery | null | undefined,
  halfSize = 512,
  outerRadius = SEA_APRON_OUTER_RADIUS_M,
  { cellM = 16, depthM = 0, wetThreshold = 0.02 }: { cellM?: number; depthM?: number; wetThreshold?: number } = {},
): THREE.BufferGeometry | null {
  if (!waterAt) return buildSeaApronGeometry(openings, halfSize, outerRadius, { depthM });
  if (!openings.length) return null;
  const cells = Math.ceil(outerRadius / cellM);
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  const slots = new Map<string, number>();
  // The cells are carriers: the sheet shader fades the apron along the baked bay contour (uOutlandWater), so a
  // cell is admitted as soon as any corner touches the coast or the open-sea sector, and the shoreline itself is
  // the smooth mask, never the 16 m cell edge.
  const levelAt = (x: number, z: number): number | null => {
    let level: number | null = null, best = 0;
    for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0, 0]] as const) {
      const coast = waterAt(x + dx * cellM, z + dz * cellM);
      if (coast && coast.wetness >= wetThreshold && coast.wetness > best) { best = coast.wetness; level = coast.level; }
    }
    if (level !== null) return level;
    const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - halfSize;
    const angle = Math.atan2(z, x);
    const opening = dominantSeaOpening(angle, openings);
    if (!opening) return null;
    const [from, to] = seaSectorBlend(opening.coastReachM);
    const far = smoothstep(from - cellM, to, edgeOut + cellM);
    return far > 0 && seaOpeningWeight(angle, opening) * far >= 0.35 ? opening.level : null;
  };
  const vertex = (ix: number, iz: number, level: number): number => {
    const key = `${ix},${iz}`;
    const known = slots.get(key);
    if (known !== undefined) return known;
    const index = positions.length / 3;
    slots.set(key, index);
    positions.push(ix * cellM, level + depthM, iz * cellM);
    normals.push(0, 1, 0);
    return index;
  };
  for (let iz = -cells; iz < cells; iz++) {
    for (let ix = -cells; ix < cells; ix++) {
      const cx = (ix + 0.5) * cellM, cz = (iz + 0.5) * cellM;
      // only the outland, from the red line itself: the sheet reaches the edge (its grid ends on ±halfSize) and a
      // shared strip would render the transparent water twice as a dark band along the border
      if (Math.max(Math.abs(cx), Math.abs(cz)) < halfSize) continue;
      if (Math.hypot(cx, cz) > outerRadius) continue;
      const level = levelAt(cx, cz);
      if (level === null) continue;
      const a = vertex(ix, iz, level), b = vertex(ix + 1, iz, level), c = vertex(ix, iz + 1, level), d = vertex(ix + 1, iz + 1, level);
      // counter-clockwise seen from above (+y), like the sheet's own quads
      indices.push(a, c, b, b, c, d);
    }
  }
  if (!indices.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The shallow-water sheet's apron: for each opening, a fan of quads from the square edge to the outer radius at the
 * opening's water level, covering the sector where the ring's apron is at least half lowered. Shares the sheet's
 * material, so fresnel, glitter and the deep colour continue across the seam; the far end sits under the haze.
 * Round 47: the fallback when the terrain hands no bay-contour query (see buildOutlandWaterGeometry).
 */
export function buildSeaApronGeometry(
  openings: readonly SeaOpening[],
  halfSize = 512,
  outerRadius = SEA_APRON_OUTER_RADIUS_M,
  { arcStepDeg = 2, radialSegments = 4, depthM = 0 }: { arcStepDeg?: number; radialSegments?: number; depthM?: number } = {},
): THREE.BufferGeometry | null {
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  for (const opening of openings) {
    const direction = Math.PI / 2 - opening.azimuthDeg * Math.PI / 180;
    const halfWidth = Math.min(175, Math.max(10, opening.widthDeg)) * Math.PI / 360;
    const shoulder = opening.shoulder ?? DEFAULT_SHOULDER;
    // weight 0.5 sits halfway through the taper
    const reach = halfWidth * (shoulder + (1 - shoulder) * 0.5);
    const steps = Math.max(2, Math.ceil((reach * 2) / (arcStepDeg * Math.PI / 180)));
    const base = positions.length / 3;
    for (let s = 0; s <= steps; s++) {
      const angle = direction - reach + (reach * 2) * (s / steps);
      const cosine = Math.cos(angle), sine = Math.sin(angle);
      // the apron starts 12 m inside the square edge: the sheet admits whole 8 m cells, so the last strip before the
      // red line can be uncovered water floor (Saltwind showed it as a pale line); over land the apron is buried
      const inner = (halfSize - SEA_APRON_OVERLAP_M) / Math.max(Math.abs(cosine), Math.abs(sine));
      for (let r = 0; r <= radialSegments; r++) {
        const radius = inner + (outerRadius - inner) * (r / radialSegments);
        positions.push(cosine * radius, opening.level + depthM, sine * radius); // the sheet floats depthM above the floor
        normals.push(0, 1, 0);
      }
    }
    const stride = radialSegments + 1;
    for (let s = 0; s < steps; s++) {
      for (let r = 0; r < radialSegments; r++) {
        const a = base + s * stride + r, b = a + stride, c = a + 1, d = b + 1;
        // counter-clockwise seen from above (+y), like the sheet's own quads: a → b runs with the angle, a → c
        // outward. The first cut had these reversed and the double-sided water material lit the apron from below —
        // the seam's last visible step (28 vs 44 luma straight down on Coastal) was that, not the terrain.
        indices.push(a, b, c, b, d, c);
      }
    }
  }
  if (!indices.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}
