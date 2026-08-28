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
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const add = (x: number, z: number): void => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  };
  for (const plate of armor.hullPlates || []) {
    for (const point of plate.verts || []) add(point[0], point[2]);
  }
  const turretPivot = armor.turretPivot || [0, 0, 0];
  for (const plate of armor.turretPlates || []) {
    for (const point of plate.verts || []) {
      add(point[0] + turretPivot[0], point[2] + turretPivot[2]);
    }
  }
  for (const shape of armor.trackShapes || []) {
    for (const point of shape.poly || []) {
      add(shape.x0, point[0]);
      add(shape.x1, point[0]);
    }
  }

  const width = finite(dims.widthM, 1);
  if (!Number.isFinite(minX)) {
    minX = anchor.xM - width / 2;
    maxX = anchor.xM + width / 2;
  } else {
    // Published width remains the presentation fallback for small fittings
    // that are not armor volumes but do contribute to the exported mask.
    minX = Math.min(minX, anchor.xM - width / 2);
    maxX = Math.max(maxX, anchor.xM + width / 2);
  }

  const hullLength = finite(dims.hullLengthM, 1);
  if (!Number.isFinite(minZ)) {
    minZ = anchor.zM - hullLength / 2;
    maxZ = anchor.zM + hullLength / 2;
  }
  const gunPivot = armor.gunPivot || [0, 0, 0];
  const barrelLength = finite(armor.gunBarrel?.lengthM, 0);
  if (barrelLength > 0) {
    // Exported top/side icons are framed around the body presentation anchor
    // while the forward cannon still expands their fit envelope.
    maxZ = Math.max(maxZ, turretPivot[2] + gunPivot[2] + barrelLength);
  } else {
    maxZ = Math.max(maxZ, minZ + finite(dims.overallLengthM, hullLength));
  }
  return { minX, maxX, minZ, maxZ };
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
