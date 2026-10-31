// US Pershing/Patton family — FROM-SCRATCH rebuild against the measured
// profile curves in docs/references/profiles/<id>.json (mask-trace-1024 of the
// repaired reference GLBs; world meters, +z forward, y from ground) plus the
// gate-v6 TRUE-AXIS re-measurement of 2026-07-31 (the old side/front cameras
// carried display tilts that inflated tops ~3-9 cm — every constant below is
// from the un-tilted extraction).
//
// Method: the hull is LOFTED STATION SLABS following the measured deck/belly
// polylines; the turret is lofted from the whole−hull side band + measured
// plan half-widths; fittings exist only where the reference board shows them.
//
// Gate-v6 measured landmarks (true cameras):
//   m26  toe (+2.60,1.08) knee (+1.78,1.545) deck 1.53-1.56 tail (-3.40,1.28)
//        dome front -0.10 (top 1.77) -> crest 2.31 @ -1.9, plan max hw 1.22 @
//        -1.6, bustle chin 1.17 @ -2.4, basket floor 0.38 over -0.9..-2.1,
//        M2 band 2.66-2.75 (mast -2.66, tip -1.28), gun axis 1.60 dia 0.23,
//        brake body 0.35 x 0.52.
//   m45  toe (+3.10,1.03) knee (+2.55,1.50) deck 1.53 (rises 1.58 by -1.0);
//        full-width hull ENDS -2.50, narrow tail block to -3.22; dome crest
//        ~2.31 @ -0.9..-1.6, plan max 1.226 @ -1.2, M2 cluster front-left
//        (x -0.32) band 2.58-2.68 barrel to +0.38; howitzer axis 1.56 muzzle
//        +1.44 (no overhang: overall = hull span 6.40).
//   m46  toe (+2.62,1.14) knee (+2.24,1.62) deck 1.664 mufflers 1.73 rear
//        deck 1.726-1.784 tail (-3.42,1.54); crest 2.31 @ -1.45, plan max
//        1.208 @ -1.4, bustle chin 1.19 @ -2.4..-2.6, basket 0.41 over
//        -0.75..-2.25; gun axis 1.618, sleeve band dia 0.33 from +2.2.
//   m47  toe (+2.82,1.19) knee (+2.40,1.54) deck 1.666/1.726 mufflers 1.73;
//        needle nose +0.42 rising to the 2.50 plateau over -0.45..-1.9 (M2
//        corridor above it reads 2.87-2.94), plan max 1.146 @ -1.0, LONG
//        bustle top 2.17->2.13 floor 1.505 to -3.42 w0 0.94 w1 0.69; M36
//        evac 2.35..3.05 + wide flat deflector (side 0.24 / plan 0.68).
//   m60  fender deck 1.75-1.79 with a raised centre engine crown to 1.897;
//        glacis knee (+1.70,1.75) toe (+3.47,1.31); main hull plan 3.51 wide
//        with fender flares to 3.63 only over z -0.45..+1.49; track ramps
//        from the last road wheel to HIGH ends (idler +3.04, sprocket -2.96,
//        y 0.85); casting: plan needle (0.29@+2.62 -> 1.415@+0.5) with the
//        steep forehead (saddle 2.57 @ +1.7, shelf 2.91 @ +1.0..+1.5, crest
//        3.09 @ -0.2, right-hand roof falling to ~2.75), flat 2.66 bustle to
//        -2.02 with the underside rising 1.74 -> 2.10; M19 cupola (-0.58,
//        +0.20) top 3.30 (published 3.27 height governs — the oracle's own
//        cupola reads 3.21); searchlight 0.57 wide, z 2.05..2.88, top 2.77.
//
// PUBLISHED-LENGTH GUNS (gate v5+ hull-anchored registration): m26 overall
// 8.65 m, m46 8.48 m, m47 8.51 m, m45 6.40 m (bow-flush stub). The four
// reference barrels are modelled short (see the packets) — the coverage cost
// lands ONLY in wholeCurves/turretCurves and is certified per packet.
import * as THREE from 'three';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import type { SnapGroupOptions } from '../tankFactoryCore.ts';
import { steppedBuilder } from '../tankBuildCooperation.ts';
import { buildM46CastSteps, buildM47CastSteps, buildM48A5CastSteps, buildM48VariantCastSteps, buildM60CastSteps } from './pattonCast.ts';

type Vec3Tuple = readonly [number, number, number];
type GeometryScale = number | readonly number[];
type ProfileOwner = 'hull' | 'turret';
type Disposable = { dispose(): void };

interface RoadWheelLayerOptions {
  readonly outset?: number;
  readonly yOffset?: number;
  readonly name?: string;
  readonly appearanceRole?: string;
}

interface EraPlacement {
  (
    x: number,
    y: number,
    z: number,
    rotationX?: number,
    rotationY?: number,
    rotationZ?: number,
    scaleX?: number,
    scaleY?: number,
    scaleZ?: number,
  ): void;
}

interface PattonMaterialSet extends Record<string, THREE.Material> {
  readonly canvasCloth: THREE.MeshStandardMaterial;
  readonly glass: THREE.MeshStandardMaterial;
  readonly hull: THREE.MeshStandardMaterial;
  readonly rubber: THREE.MeshStandardMaterial;
  readonly shadow: THREE.MeshStandardMaterial;
  readonly spareTrack: THREE.MeshStandardMaterial;
  readonly trackL: THREE.MeshStandardMaterial;
  readonly trackR: THREE.MeshStandardMaterial;
  readonly wheels: THREE.MeshStandardMaterial;
}

interface PattonBuilderPort {
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly mats: PattonMaterialSet;
  readonly disposables: Disposable[];
  readonly rng: () => number;
  readonly q?: boolean;
  readonly gear: {
    addRoadWheelLayer(
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      options?: RoadWheelLayerOptions,
    ): void;
    contactGeom?: {
      halfLenM: number;
      zCenterM: number;
      halfWidM: number;
      bottomYM: number;
      endRise?: { dzM: number; frontM: number; rearM: number };
    };
    trackHitbox?: Array<{ x0: number; x1: number; poly: Array<[number, number]> }>;
  };
  readonly spec: {
    readonly armor: { readonly turretPivot: Vec3Tuple };
    readonly visual: { readonly number?: string };
  };
  readonly geometryReceipt?: boolean;
  muzzleZ: number;
  /** Profile-declared true-bore radii of the added mouth (tankFactoryCore.muzzleMouth). */
  muzzleMouth?: { readonly outerRadiusM: number; readonly innerRadiusM: number };
  topY: number;
  add(
    slot: string,
    geometry: THREE.BufferGeometry,
    x?: number,
    y?: number,
    z?: number,
    rotationX?: number,
    rotationY?: number,
    rotationZ?: number,
    scale?: GeometryScale,
  ): void;
  addEquipment(
    owner: ProfileOwner,
    geometry: THREE.BufferGeometry,
    ...transform: Array<number | readonly number[]>
  ): void;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addModuleVisual(module: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addMudguard(label: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  snapGroup(label: string, build: () => void, options?: SnapGroupOptions): void;
  decal(
    owner: ProfileOwner,
    kind: string,
    value: string | null,
    scale: number,
    position: readonly number[],
    ...rotation: number[]
  ): void;
  eraCluster(key: string, build: (place: EraPlacement) => void, turretOwned?: boolean): void;
  /** A consumable ERA plate's own authored parts (the Magach 3's Blazer, pattonCast.ts): external armour inside it. */
  destructibleCluster(plateName: string, fill: () => void): void;
  addExternalArmor(owner: 'hull' | 'turret', geometry: THREE.BufferGeometry, ...transform: number[]): void;
  /** Registered like addMudguard, then hung from the hull stock above its top edge (mudguardHangers.ts). */
  hangMudguard(label: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
}

// The M60 family uses exposed manganese-steel tracks. Keep the continuous
// band neutral and matte so woodland camouflage and the garage environment
// cannot wash it green or clamp it to the old near-white multiplier.
export const M60_TRACK_FINISH = Object.freeze({
  trackBandHex: 0x8f887d,
  trackBandRoughness: 0.97,
  trackBandEnvMapIntensity: 0.02,
});

// M46/M47 tracks are exposed weathered manganese steel, not camouflage and
// not the old olive multiplier used by the gear-tone pass. Keep enough value
// contrast to read the cast links while preventing the garage environment
// from turning the bands bronze or green.
export const M46_M47_TRACK_FINISH = Object.freeze({
  trackBandHex: 0x82796e,
  trackBandRoughness: 0.96,
  trackBandEnvMapIntensity: 0.035,
});

export const PATTON_PROFILES = {
  // Release 262 (the owner, 2026-10-27: "update/redesign the m47, m46, and m48 pattons ... based on proper historical
  // referrences so they will no longer look so chungus"): the three Pattons' hulls, turrets and guns are new measured
  // castings in pattonCast.ts (docs/references/tanks/<id>.md); the M60s below keep their own builders.
  m46_patton: { build: steppedBuilder((P: PattonBuilderPort) => buildM46CastSteps(P, M46_M47_TRACK_FINISH)) },
  m47_patton: { build: steppedBuilder((P: PattonBuilderPort) => buildM47CastSteps(P, M46_M47_TRACK_FINISH)) },
  m48a5_patton: { build: steppedBuilder((P: PattonBuilderPort) => buildM48A5CastSteps(P)) },
  // release 266: the M48s of the USA, Israel and Germany on the A5's castings (pattonCast.ts M48_VARIANTS)
  m48a3_patton: { build: steppedBuilder((P: PattonBuilderPort) => buildM48VariantCastSteps(P, 'm48a3')) },
  magach3: { build: steppedBuilder((P: PattonBuilderPort) => buildM48VariantCastSteps(P, 'magach3')) },
  m48a2ga2: { build: steppedBuilder((P: PattonBuilderPort) => buildM48VariantCastSteps(P, 'm48a2ga2')) },
  m48_super: { build: steppedBuilder((P: PattonBuilderPort) => buildM48VariantCastSteps(P, 'm48super')) },
  // release 265 (the owner, 2026-10-28: "be sure to update th estartship too"): the Starship rebuilt on the A1's hull
  // off the owner's model (pattonCast.ts m60a2TurretSteps)
  m60a2: { build: steppedBuilder((P: PattonBuilderPort) => buildM60CastSteps(P, 'a2', M60_TRACK_FINISH)) },

  // Release 265 (the owner, 2026-10-28: "rework ALL the m60s, their models proper are in my folders"): the M60A1 and
  // M60A3 are new measured castings at true size in pattonCast.ts (docs/references/tanks/m60a1.md, m60a3.md).
  m60a1: { build: steppedBuilder((P: PattonBuilderPort) => buildM60CastSteps(P, 'a1', M60_TRACK_FINISH)) },
  // A3 TTS: the supplied A3 oracle resolves the correct variant package —
  // thermal sleeve, TTS head, paired smoke banks and crosswind mast, without
  // the A1's large AN/VSS-1 mantlet searchlight.
  m60a3: { build: steppedBuilder((P: PattonBuilderPort) => buildM60CastSteps(P, 'a3', M60_TRACK_FINISH)) },
  // release 267 (the owner, 2026-10-28: "Magach Series (Israel) ... (Magach 6 and Magach 7 families)"): the IDF's M60s on
  // the A1's castings (pattonCast.ts buildM60CastSteps)
  magach6b: { build: steppedBuilder((P: PattonBuilderPort) => buildM60CastSteps(P, 'magach6b', M60_TRACK_FINISH)) },
  magach7c: { build: steppedBuilder((P: PattonBuilderPort) => buildM60CastSteps(P, 'magach7c', M60_TRACK_FINISH)) },
} satisfies VehicleProfileRecord;
