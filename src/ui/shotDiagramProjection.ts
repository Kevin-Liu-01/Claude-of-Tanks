// Pure coordinate projection for the ballistic-readout top/side schematics.
// Keep this DOM-free so resolved hit coordinates can be regression-tested
// without constructing the HUD or a WebGL renderer.

export const SHOT_DIAGRAM_ICON_MARGIN = 1.07;

type Vector3 = readonly number[];

interface ArmorPlate {
  readonly verts?: readonly Vector3[];
}

interface TrackShape {
  readonly x0: number;
  readonly x1: number;
  readonly poly?: readonly (readonly number[])[];
}

interface DiagramArmor {
  readonly turretPivot?: Vector3;
  readonly gunPivot?: Vector3;
  readonly hullPlates?: readonly ArmorPlate[];
  readonly turretPlates?: readonly ArmorPlate[];
  readonly trackShapes?: readonly TrackShape[];
  readonly gunBarrel?: { readonly lengthM?: number };
}

export interface ShotDiagramSpec {
  readonly dims: {
    readonly widthM?: number;
    readonly hullLengthM?: number;
    readonly overallLengthM?: number;
    readonly heightM?: number;
  };
  readonly armor?: DiagramArmor;
}

export interface ShotDiagramEvent {
  readonly impactLocalPos?: Vector3;
  readonly localPos?: Vector3;
  readonly impactLocalDir?: Vector3;
  readonly localDir?: Vector3;
  readonly impactFrame?: string;
}

export interface ShotDiagramProjectionOptions {
  readonly topSize?: number;
  readonly sideWidth?: number;
  readonly sideHeight?: number;
  readonly margin?: number;
  readonly presentationAnchor?: { readonly xM: number; readonly zM: number };
  readonly presentationProjection?: {
    readonly centerYM?: number;
    readonly topHalfM?: number;
    readonly sideHalfM?: number;
  };
}

export interface ShotDiagramProjection {
  readonly topScale: number;
  readonly sideScale: number;
  topPoint(x: number, z: number): number[];
  sidePoint(y: number, z: number): number[];
}

function finite(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

interface AnatomyBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function emptyAnatomyBounds(): AnatomyBounds {
  return { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
}

function addAnatomyPoint(bounds: AnatomyBounds, x: number, z: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return;
  bounds.minX = Math.min(bounds.minX, x);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.minZ = Math.min(bounds.minZ, z);
  bounds.maxZ = Math.max(bounds.maxZ, z);
}

function addPlateBounds(
  bounds: AnatomyBounds,
  plates: readonly ArmorPlate[] | undefined,
  offset: Vector3 = [0, 0, 0],
): void {
  for (const plate of plates || []) {
    for (const point of plate.verts || []) {
      addAnatomyPoint(bounds, point[0] + offset[0], point[2] + offset[2]);
    }
  }
}

function addTrackBounds(
  bounds: AnatomyBounds,
  shapes: readonly TrackShape[] | undefined,
): void {
  for (const shape of shapes || []) {
    for (const point of shape.poly || []) {
      addAnatomyPoint(bounds, shape.x0, point[0]);
      addAnatomyPoint(bounds, shape.x1, point[0]);
    }
  }
}

function includePublishedWidth(
  bounds: AnatomyBounds,
  anchor: { readonly xM: number },
  width: number,
): void {
  const left = anchor.xM - width / 2;
  const right = anchor.xM + width / 2;
  if (!Number.isFinite(bounds.minX)) {
    bounds.minX = left;
    bounds.maxX = right;
    return;
  }
  bounds.minX = Math.min(bounds.minX, left);
  bounds.maxX = Math.max(bounds.maxX, right);
}

function includePublishedLength(
  bounds: AnatomyBounds,
  anchor: { readonly zM: number },
  hullLength: number,
): void {
  if (Number.isFinite(bounds.minZ)) return;
  bounds.minZ = anchor.zM - hullLength / 2;
  bounds.maxZ = anchor.zM + hullLength / 2;
}

function includeForwardExtent(
  bounds: AnatomyBounds,
  dims: ShotDiagramSpec['dims'],
  armor: DiagramArmor,
  turretPivot: Vector3,
  hullLength: number,
): void {
  const barrelLength = finite(armor.gunBarrel?.lengthM, 0);
  if (barrelLength > 0) {
    const gunPivot = armor.gunPivot || [0, 0, 0];
    bounds.maxZ = Math.max(bounds.maxZ, turretPivot[2] + gunPivot[2] + barrelLength);
    return;
  }
  bounds.maxZ = Math.max(bounds.maxZ, bounds.minZ + finite(dims.overallLengthM, hullLength));
}

/**
 * Put an exact articulation-local impact back into the neutral, forward-facing
 * hull pose used by the static top/side schematics. Legacy events already
 * carry hull-local coordinates and remain bit-for-bit compatible.
 */
export function impactForShotDiagram(
  event: ShotDiagramEvent | null | undefined,
  armor: DiagramArmor = {},
): { point: number[]; direction: number[] | null } | null {
  const exact = Array.isArray(event?.impactLocalPos) ? event.impactLocalPos : null;
  const position = exact || event?.localPos || null;
  if (!position) return null;
  const point = [position[0], position[1], position[2]];
  const directionSource = Array.isArray(event?.impactLocalDir)
    ? event.impactLocalDir : event?.localDir;
  const direction = directionSource
    ? [directionSource[0], directionSource[1], directionSource[2]] : null;
  const frame = exact ? event?.impactFrame : 'hull';
  if (frame === 'turret' || frame === 'gun' || frame === 'barrel') {
    const turretPivot = armor.turretPivot || [0, 0, 0];
    point[0] += turretPivot[0];
    point[1] += turretPivot[1];
    point[2] += turretPivot[2];
  }
  if (frame === 'barrel') {
    // Barrel-frame coordinates are trunnion-relative. Gun-follow armor uses
    // turret-origin coordinates, so it deliberately does not take this step.
    const gunPivot = armor.gunPivot || [0, 0, 0];
    point[0] += gunPivot[0];
    point[1] += gunPivot[1];
    point[2] += gunPivot[2];
  }
  return { point, direction };
}

function anatomyEnvelope(
  spec: ShotDiagramSpec,
  anchor: { readonly xM: number; readonly zM: number },
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const dims = spec.dims || {};
  const armor = spec.armor || {};
  const bounds = emptyAnatomyBounds();
  addPlateBounds(bounds, armor.hullPlates);
  const turretPivot = armor.turretPivot || [0, 0, 0];
  addPlateBounds(bounds, armor.turretPlates, turretPivot);
  addTrackBounds(bounds, armor.trackShapes);
  const width = finite(dims.widthM, 1);
  // Published width remains the presentation fallback for small fittings
  // that are not armor volumes but do contribute to the exported mask.
  includePublishedWidth(bounds, anchor, width);
  const hullLength = finite(dims.hullLengthM, 1);
  includePublishedLength(bounds, anchor, hullLength);
  // Exported top/side icons are framed around the body presentation anchor
  // while the forward cannon still expands their fit envelope.
  includeForwardExtent(bounds, dims, armor, turretPivot, hullLength);
  return bounds;
}

/**
 * Project hull-local metres into the pre-rendered tank schematic frames.
 *
 * @param {object} spec vehicle spec
 * @param {{topSize?:number,sideWidth?:number,sideHeight?:number,margin?:number,
 *   presentationAnchor?:{xM:number,zM:number},
 *   presentationProjection?:{centerYM:number,topHalfM:number,sideHalfM:number}}} [options]
 */
export function createShotDiagramProjection(
  spec: ShotDiagramSpec,
  options: ShotDiagramProjectionOptions = {},
): ShotDiagramProjection {
  const dims = spec.dims;
  const topSize = options.topSize || 96;
  const sideWidth = options.sideWidth || 184;
  const sideHeight = options.sideHeight || 92;
  const margin = options.margin || SHOT_DIAGRAM_ICON_MARGIN;

  const presentationAnchor = options.presentationAnchor || { xM: 0, zM: 0 };
  const anchor = {
    xM: finite(presentationAnchor.xM, 0),
    zM: finite(presentationAnchor.zM, 0),
  };
  const envelope = anatomyEnvelope(spec, anchor);
  const extentX = Math.max(anchor.xM - envelope.minX, envelope.maxX - anchor.xM);
  const extentZ = Math.max(anchor.zM - envelope.minZ, envelope.maxZ - anchor.zM);
  const receipt = options.presentationProjection || {};
  const topHalf = finite(receipt.topHalfM, Math.max(extentX, extentZ) * margin);
  const topScale = (topSize / 2) / topHalf;
  const centerY = finite(receipt.centerYM, finite(dims.heightM, 1) / 2);
  const sideHalf = finite(receipt.sideHalfM,
    Math.max(finite(dims.heightM, 1) / 2, extentZ / 2) * margin);
  const sideScale = (sideHeight / 2) / sideHalf;

  return {
    topScale,
    sideScale,
    topPoint(x, z) {
      return [topSize / 2 - (x - anchor.xM) * topScale,
        topSize / 2 - (z - anchor.zM) * topScale];
    },
    sidePoint(y, z) {
      return [sideWidth / 2 + (z - anchor.zM) * sideScale,
        sideHeight / 2 - (y - centerY) * sideScale];
    },
  };
}
