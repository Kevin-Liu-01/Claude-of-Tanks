// Fleet road-wheel geometry (extracted from tankFactoryCore.ts in the 2026-09-22 wheel audit so the
// nation wheel constructions and the running-gear builder share one vocabulary). Every style returns
// { tire, disc, dark } solids in wheel-local metres with X as the axle; the caller instances them at
// the road-wheel stations and owns their disposal.
import * as THREE from 'three';
import { box, cylX, mergeAll, xform } from './factoryGeometry.ts';
import type { WheelPattern } from './wheelPatterns.ts';

/** Standard disc stack: the hub cap reaches this multiple of the tire width along the axle. */
export const STANDARD_WHEEL_AXIAL_ENVELOPE = 1.48;
/** Custom-face base stack (profiles that add their own face layers): hub cap reach along the axle. */
export const CUSTOM_FACE_WHEEL_AXIAL_ENVELOPE = 1.54;

export interface WheelGeometrySet {
  tire: THREE.BufferGeometry | null;
  disc: THREE.BufferGeometry;
  dark: THREE.BufferGeometry | null;
}

/** Road-wheel detail tier. HIGH keeps every face feature; LOW (owner 2026-09-22, "the low tier must cost
 * less" — the fleet's LOW road-wheel triangles had risen 38 % with the nation constructions) keeps the
 * silhouette only: tire, dish plate, dish/hub contours and the identity pockets, with
 * - no fastener bolt rings and no small bolt heads (a texture-free plate reads the same at LOW distance),
 * - no stiffening ribs and no small lightening holes,
 * - hub drums and caps at 8 / 6 sides, pockets at 6 sides,
 * and the same materials, roles and paint as HIGH (runningGearFinish.ts). The nation constructions
 * (nationWheelConstructions.ts) follow the same table: no face hardware layers at LOW, source lathes at
 * LOW_TIER_WHEEL_SEGMENTS. */
export type WheelDetail = 'high' | 'low';
/** Radial segments of every LOW-tier turned wheel stock (matches the LOW tire polygon). */
export const LOW_TIER_WHEEL_SEGMENTS = 12;

// Road-wheel geometry per style. Returns { tire, disc } (tire may be null).
// Every style gets a raised hub cap and (at HIGH) a bolt ring so wheels stop
// reading as flat painted discs at garage distance.
function boltRing(discs: THREE.BufferGeometry[], r: number, w: number, n = 8): void {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + 0.2;
    discs.push(xform(cylX(r * 0.042, w * 1.16, 6), 0, Math.sin(a) * r * 0.4, Math.cos(a) * r * 0.4));
  }
}
export function radialRibs(
  parts: THREE.BufferGeometry[],
  r: number,
  w: number,
  count: number,
  innerR = 0.20,
  outerR = 0.75,
  tangential = 0.13,
  widthScale = 1.22,
  phase = 0,
): void {
  const mid = r * (innerR + outerR) / 2;
  const length = r * (outerR - innerR);
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2 + phase;
    parts.push(xform(box(w * widthScale, r * tangential, length),
      0, Math.sin(a) * mid, Math.cos(a) * mid, -a, 0, 0));
  }
}

function steelWheelGeometry(
  r: number,
  w: number,
  seg: number,
  pattern: WheelPattern | null,
  patternFasteners: number,
  low: boolean,
): WheelGeometrySet {
  const discs: THREE.BufferGeometry[] = [cylX(r, w, seg)];
  if (!low) radialRibs(discs, r, w, pattern?.pockets || 6, 0.18, 0.82, 0.18, 1.18, 0.1);
  discs.push(cylX(r * 0.24, w * 1.3, low ? 8 : 10));
  discs.push(cylX(r * 0.14, w * 1.44, low ? 6 : 8));
  if (!low) boltRing(discs, r, w, patternFasteners);
  return { tire: null, disc: mergeAll(discs), dark: null };
}

function perforatedWheelGeometry(
  r: number,
  w: number,
  seg: number,
  pattern: WheelPattern | null,
  patternFasteners: number,
  low: boolean,
): WheelGeometrySet {
  // T-34 Christie wheel (r7 rebuild): the painted dish spans nearly the
  // full radius with a THIN rubber rim, and the six big stamped lightening
  // holes are dark inserts — the "spider" face that makes the wheel read
  // full-size instead of a small disc floating in shadow.
  const tire = mergeAll([cylX(r, w, seg)]);
  const discs: THREE.BufferGeometry[] = [
    cylX(r * 0.86, w * 1.10, seg),
    cylX(r * 0.28, w * 1.32, low ? 8 : 12),
    cylX(r * 0.15, w * 1.5, low ? 6 : 8),
  ];
  if (!low) boltRing(discs, r * 0.72, w, patternFasteners);
  const dark: THREE.BufferGeometry[] = [];
  const pocketCount = pattern?.pockets || 6;
  for (let index = 0; index < pocketCount; index += 1) {
    const angle = (index / pocketCount) * Math.PI * 2 + 0.3;
    dark.push(xform(cylX(r * 0.185, w * 1.16, low ? 6 : 10),
      0, Math.sin(angle) * r * 0.55, Math.cos(angle) * r * 0.55));
  }
  return { tire, disc: mergeAll(discs), dark: mergeAll(dark) };
}

function dishedWheelGeometry(
  r: number,
  w: number,
  seg: number,
  patternFasteners: number,
  low: boolean,
): WheelGeometrySet {
  // Tiger/Panther Schachtellaufwerk wheel (r4 "poker chip" hard fix): the
  // face is a real CONCAVE DISH — proud outer face ring, twin cones falling
  // toward the hub, dark shadow annulus at the dish bottom, raised hub drum
  // + cap, and a 16-bolt ring standing dark on the dish slope. Reads as a
  // dished pressed-steel wheel at closeup instead of a flat painted disc.
  // r7b ("flat pancake discs — no dish, no rubber/steel rim separation" on
  // the judged Tiger closeup): the painted rim ring pulls in to 0.86 r so a
  // REAL dark tire band (14% of radius) separates rubber from steel, the
  // dish cones deepen (0.34 w -> 0.46 w span, proud of the face ring) and
  // the dish-bottom shadow annulus widens so the concavity survives flat
  // camo paint at closeup range.
  const tire = mergeAll([
    cylX(r, w, seg),
    cylX(r * 0.92, w * 1.02, seg),
  ]);
  const discs: THREE.BufferGeometry[] = [cylX(r * 0.86, w * 1.06, seg)];
  for (const side of [-1, 1]) {
    discs.push(xform(
      cylX(side < 0 ? r * 0.82 : r * 0.28, w * 0.46, seg,
        side < 0 ? r * 0.28 : r * 0.82),
      side * w * 0.42, 0, 0));
  }
  discs.push(cylX(r * 0.26, w * 1.34, low ? 8 : 12));
  discs.push(cylX(r * 0.15, w * 1.52, low ? 6 : 10));
  const dark = [cylX(r * 0.50, w * 0.52, seg)];
  for (let index = 0; index < (low ? 0 : patternFasteners); index += 1) {
    const angle = (index / patternFasteners) * Math.PI * 2 + 0.1;
    dark.push(xform(cylX(r * 0.042, w * 1.12, 6),
      0, Math.sin(angle) * r * 0.60, Math.cos(angle) * r * 0.60));
  }
  return { tire, disc: mergeAll(discs), dark: mergeAll(dark) };
}

function customFaceWheelGeometry(
  r: number,
  w: number,
  seg: number,
  dishR: number,
  low: boolean,
): WheelGeometrySet {
  const tire = mergeAll([
    cylX(r, w, seg),
    cylX(r * 0.30, w * 1.20, seg),
  ]);
  const discs: THREE.BufferGeometry[] = [
    cylX(r * dishR, w * 1.14, seg),
    cylX(r * 0.24, w * 1.38, low ? 8 : 10),
    cylX(r * 0.14, w * CUSTOM_FACE_WHEEL_AXIAL_ENVELOPE, low ? 6 : 8),
  ];
  if (!low) boltRing(discs, r * dishR / 0.9, w, 8);
  const dark = [
    cylX(r * 0.46, w * 1.08, seg),
    cylX(r * 0.205, w * 1.40, low ? 8 : 10),
  ];
  for (let index = 0; index < (low ? 0 : 12); index += 1) {
    const angle = (index / 12) * Math.PI * 2 + 0.13;
    dark.push(xform(cylX(r * 0.045, w * 1.20, 6),
      0, Math.sin(angle) * r * dishR * 0.72, Math.cos(angle) * r * dishR * 0.72));
  }
  return { tire, disc: mergeAll(discs), dark: mergeAll(dark) };
}

function addWheelFaceMotif(
  motif: WheelPattern['motif'],
  discs: THREE.BufferGeometry[],
  dark: THREE.BufferGeometry[],
  r: number,
  w: number,
  seg: number,
  dishR: number,
  pattern: WheelPattern | null,
  low: boolean,
): void {
  switch (motif) {
    case 'split-rim':
      dark.push(cylX(r * 0.70, w * 1.17, seg));
      discs.push(cylX(r * 0.53, w * 1.23, seg));
      dark.push(cylX(r * 0.32, w * 1.27, low ? 8 : 12));
      return;
    case 'rib': {
      // Pressed steel disc (fleet wheel standard 2026-09-11): a painted dish
      // plate carries raised stiffening ribs and small lightening holes
      // between them, with a slim dark hub well and a raised hub drum. The
      // former dark backing behind open ribs read as a spoked wagon wheel.
      // 2026-09-12: the disc keeps the former rib envelope (plate 1.17 w, ribs
      // 0.20 x 1.24) so the T-90M X exemplar silhouette scores as before; the
      // holes, hub well and hub drum sit inside that envelope.
      // 2026-09-12 fleet wheel standard: the painted plate reaches 0.82 r so
      // the rubber is a 18 % tire band, not a third of the wheel; the hub well
      // shrinks to 0.24 r and the lightening holes move out to 0.58 r.
      const ribs = pattern?.pockets || 8;
      discs.push(cylX(r * 0.82, w * 1.17, seg));
      if (!low) {
        radialRibs(discs, r, w, ribs, 0.20, dishR * 0.84, 0.12, 1.24, 0.08);
        for (let index = 0; index < ribs; index += 1) {
          const angle = ((index + 0.5) / ribs) * Math.PI * 2 + 0.08;
          dark.push(xform(cylX(r * 0.048, w * 1.20, 8),
            0, Math.sin(angle) * r * 0.58, Math.cos(angle) * r * 0.58));
        }
      }
      dark.push(cylX(r * 0.24, w * 1.21, seg));
      discs.push(cylX(r * 0.17, w * 1.24, low ? 8 : 14));
      return;
    }
    case 'spoke':
    case 'solid-spoke':
      dark.push(cylX(r * 0.69, w * 1.17, seg));
      // The spokes are the cast wheel's identity: both tiers keep them (five boxes).
      radialRibs(discs, r, w, pattern?.pockets || 5, 0.18, dishR * 0.86,
        motif === 'solid-spoke' ? 0.24 : 0.20, 1.24, 0.06);
      return;
    case 'scalloped':
    case 'perforated': {
      const count = pattern?.pockets || 6;
      dark.push(cylX(r * 0.39, w * 1.17, low ? 8 : 14));
      for (let index = 0; index < count; index += 1) {
        const angle = (index / count) * Math.PI * 2 + 0.28;
        dark.push(xform(cylX(r * (motif === 'perforated' ? 0.15 : 0.125), w * 1.21, low ? 6 : 10),
          0, Math.sin(angle) * r * 0.56, Math.cos(angle) * r * 0.56));
      }
      return;
    }
    case 'flanged':
      dark.push(cylX(r * 0.61, w * 1.17, seg));
      discs.push(cylX(r * 0.45, w * 1.23, low ? 8 : 16));
      dark.push(cylX(r * 0.29, w * 1.27, low ? 8 : 12));
      return;
    case 'deep-dish':
      dark.push(cylX(r * 0.57, w * 1.17, seg));
      for (const side of [-1, 1]) {
        discs.push(xform(cylX(
          side < 0 ? r * 0.78 : r * 0.31,
          w * 0.16, seg,
          side < 0 ? r * 0.31 : r * 0.78,
        ), side * w * 0.62, 0, 0));
      }
      return;
    case 'armored-hub':
      dark.push(cylX(r * 0.52, w * 1.17, seg));
      discs.push(cylX(r * 0.38, w * 1.25, low ? 8 : 14));
      return;
    case 'plain-dish':
      // Flat painted dish plate proud of the tire, a slim dark hub well and a
      // raised hub drum; the shared fastener ring supplies the bolt circle.
      discs.push(cylX(r * 0.66, w * 1.19, seg));
      dark.push(cylX(r * 0.30, w * 1.23, seg));
      discs.push(cylX(r * 0.21, w * 1.29, low ? 8 : 14));
      return;
    default:
      dark.push(cylX(r * 0.48, w * 1.17, seg));
  }
}

function standardWheelGeometry(
  r: number,
  w: number,
  seg: number,
  dishR: number,
  pattern: WheelPattern | null,
  patternFasteners: number,
  low: boolean,
): WheelGeometrySet {
  // Rubber band + a dark hub-well ring: the well sits between dish and hub so
  // the hub reads against shadow (r5: wheels merged into one flat plate).
  // camo_spotting r3: tire rim <=10% of radius and hub well slimmed — the
  // wide dark annuli rendered as high-contrast black/base BULLSEYE rings on
  // the Tiger under every scheme ("toy targets" critique). The thin rim +
  // recessed well + bolt ring keep the wheel reading as a wheel (the r6
  // "body-green disc" concern) without the target-ring geometry.
  const tire = mergeAll([
    cylX(r, w, seg),
    cylX(r * 0.94, w * 1.03, seg),
  ]);
  // Painted dish stands PROUD of the tire caps and covers `dishR` of the
  // radius (default 90%) — real road wheels read as painted steel discs with
  // a visible dark rubber rim, never as full-face painted circles (r3/r5)
  // and never as wide-ringed bullseyes (camo_spotting r3). Russian/modern
  // rigs pass a smaller dishR for their fat rubber tires (r5: "uniform green
  // discs with no rubber/hub separation").
  const discs: THREE.BufferGeometry[] = [cylX(r * dishR, w * 1.12, seg)];
  const dark: THREE.BufferGeometry[] = [];
  addWheelFaceMotif(pattern?.motif || 'split-rim', discs, dark, r, w, seg, dishR, pattern, low);
  discs.push(cylX(r * 0.24, w * 1.34, low ? 8 : 12));
  discs.push(cylX(r * 0.14, w * STANDARD_WHEEL_AXIAL_ENVELOPE, low ? 6 : 10));
  for (let index = 0; index < (low ? 0 : patternFasteners); index += 1) {
    const angle = (index / patternFasteners) * Math.PI * 2 + 0.13;
    dark.push(xform(cylX(r * 0.040, w * 1.40, 6),
      0, Math.sin(angle) * r * dishR * 0.70, Math.cos(angle) * r * dishR * 0.70));
  }
  return { tire, disc: mergeAll(discs), dark: mergeAll(dark) };
}

export function wheelGeo(
  style: string,
  r: number,
  w: number,
  seg: number,
  dishR = 0.90,
  pattern: WheelPattern | null = null,
  customFace = false,
  detail: WheelDetail = 'high',
): WheelGeometrySet {
  const patternFasteners = pattern?.fasteners ?? 8;
  const low = detail === 'low';
  if (style === 'steel') {
    return steelWheelGeometry(r, w, seg, pattern, patternFasteners, low);
  }
  if (style === 'holes' && (!pattern || pattern.motif === 'perforated')) {
    return perforatedWheelGeometry(r, w, seg, pattern, patternFasteners, low);
  }
  if (style === 'dished' && (!pattern || pattern.motif === 'deep-dish')) {
    return dishedWheelGeometry(r, w, seg, patternFasteners, low);
  }
  // Recent profile builders already supply source-measured, suspension-bound
  // face layers. Preserve their proven base stack so the shared fleet motif
  // cannot sit proud of and occlude those authored rings/recesses. They still
  // receive the family-specific idler, sprocket, roller, paint, and receipt.
  if (customFace) {
    return customFaceWheelGeometry(r, w, seg, dishR, low);
  }
  return standardWheelGeometry(r, w, seg, dishR, pattern, patternFasteners, low);
}
