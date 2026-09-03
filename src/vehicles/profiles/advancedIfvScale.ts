// Complete, spec-synchronized scaling for independently authored IFVs.
//
// These profiles build in their original local authoring frame while their
// combat/anatomy specs publish the reduced world-space frame. Bake the same
// scale into every primitive bucket and direct fitting so render geometry,
// articulation, contact metadata, and hit shapes remain in one metre frame.

import type * as THREE from 'three';

export const ADVANCED_IFV_SCALE = 0.90;

interface GearContactGeometry {
  halfLenM: number;
  zCenterM: number;
  halfWidM: number;
  bottomYM: number;
  endRise?: { dzM: number; frontM: number; rearM: number } | null;
}

interface TrackHitbox {
  x0: number;
  x1: number;
  poly: Array<[number, number]>;
}

interface RoadWheelLayout {
  xc: number;
  wheelY: number;
  wheelR: number;
  wheelZs: number[];
}

export interface AdvancedIfvScalePort {
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly recoilG: THREE.Group;
  muzzleZ: number;
  gear?: {
    contactGeom?: GearContactGeometry;
    trackHitbox?: TrackHitbox[];
    roadWheelLayout?: RoadWheelLayout;
  } | null;
  topY?: number;
  scaleAllBuckets(x?: number, y?: number, z?: number): void;
  scaleDecals(scale: number): void;
}

export function applyAdvancedIfvScale(
  P: AdvancedIfvScalePort,
  designFamily: string,
): void {
  const vehicleScale = ADVANCED_IFV_SCALE;

  // Primitive parts have not been merged yet. Direct children are fittings,
  // racks, optics, and smart running-gear assemblies that bypass buckets.
  P.scaleAllBuckets(vehicleScale);
  P.scaleDecals(vehicleScale);
  const scaleAssembly = (object: THREE.Object3D): void => {
    object.position.multiplyScalar(vehicleScale);
    object.scale.multiplyScalar(vehicleScale);
  };
  for (const child of [...P.hullG.children]) scaleAssembly(child);
  for (const child of [...P.turretG.children]) {
    if (child !== P.gunG) scaleAssembly(child);
  }
  for (const child of [...P.gunG.children]) {
    if (child !== P.recoilG) scaleAssembly(child);
  }

  // Turret/gun pivots arrive from the 0.90-scaled armor frame. buildGun()
  // republishes its authoring-frame length as the muzzle/FX station, while
  // topY is likewise local to the profile, so convert both exactly once.
  P.muzzleZ *= vehicleScale;
  if (Number.isFinite(P.topY)) P.topY = (P.topY || 0) * vehicleScale;

  // These receipts are consumed outside the Three.js owner hierarchy.
  if (P.gear?.contactGeom) {
    for (const key of ['halfLenM', 'zCenterM', 'halfWidM', 'bottomYM'] as const) {
      P.gear.contactGeom[key] *= vehicleScale;
    }
    if (P.gear.contactGeom.endRise) {
      for (const key of ['dzM', 'frontM', 'rearM'] as const) {
        P.gear.contactGeom.endRise[key] *= vehicleScale;
      }
    }
  }
  for (const lane of P.gear?.trackHitbox || []) {
    lane.x0 *= vehicleScale;
    lane.x1 *= vehicleScale;
    lane.poly = lane.poly.map(([z, y]) => [z * vehicleScale, y * vehicleScale]);
  }
  if (P.gear?.roadWheelLayout) {
    const layout = P.gear.roadWheelLayout;
    layout.xc *= vehicleScale;
    layout.wheelY *= vehicleScale;
    layout.wheelR *= vehicleScale;
    layout.wheelZs = layout.wheelZs.map((z) => z * vehicleScale);
  }

  const receipt = Object.freeze({
    designFamily,
    vehicleScale,
    specSpatialFrameScaled: true,
    bakedBucketGeometry: true,
    directAssembliesScaled: true,
    ownerScalesPreserved: true,
    turretPivotFromScaledSpec: true,
    gunPivotFromScaledSpec: true,
    muzzleAnchorScaled: true,
    contactGeometryScaled: true,
    trackHitboxesScaled: true,
    roadWheelLayoutScaled: true,
  });
  P.hullG.userData.advancedIfvScaleReceipt = receipt;
  P.turretG.userData.advancedIfvScaleReceipt = receipt;
}
