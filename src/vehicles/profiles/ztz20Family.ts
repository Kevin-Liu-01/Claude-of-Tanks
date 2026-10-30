// ZTZ-20 family (release 262; owner 2026-10-27: "the ztz 20 should be completely new, not based off of qilin, and the
// ztz 100 is its prototype, ztz 20 needs to be designed from scratch and then it should update the ztz 100").
//
// One first-party base, three stages. The production ZTZ-20 (`ztz20`) is the owner-authored concept of
// docs/references/concepts/ztz20-family-20261027.json, measured from the owner's Sketchfab "[OD]ZTZ-20 Test-3"
// (EXcaliburK117, CC-BY-4.0, raw SHA-256 387d8655…5da5d; registration uniform 0.92, translation (0, 0.00644, -0.12098),
// docs/references/tanks/ztz20.md). The oracle is a local measuring instrument: its 1 cm first-hit depth maps gave the
// scalars below and nothing else; no source vertex, island or topology participates, and no other profile (Qilin,
// Kunlun, Yun, the retired ZTZ-100 builders) is imported or imitated. The pre-production ZTZ-100 (`ztz100`) and the
// ZTZ-100 Prototype testbed (`ztz100_prototype`, its owner-approved missile turret kept in ztz100Prototype.ts) are the
// same hull, gear and turret with the typed stage deltas of ZTZ20_STAGES: earlier steps toward the ZTZ-20.
//
// Measured layout (game frame: metres, +Y up, +Z forward, ground y 0, structural hull centred on z 0):
// - hull 7.13 m stern plate (z -3.55) to nose (z 3.58), rear fender boxes to z -3.80; a 6.3° glacis from the nose line
//   (y 1.20) to the roof (1.41) at z 1.70, a 45° lower bow to the belly (0.35-0.40), the engine deck 1.465 behind z
//   -2.10; fender lips to x ±1.72 over the tracks, the stepped side skirts to ±1.85 (forward) and ±1.765 (aft);
// - seven 0.3135 m road wheels on staggered left/right stations, drive sprocket aft, idler forward, two return
//   rollers, a 0.515 m track centred at x ±1.2485;
// - an unmanned arrowhead turret on the ring (0, 1.41, -0.55): two raked cheek blocks either side of a narrow gun housing,
//   a 2.40 m main body under a roof that climbs from 2.15 to the 2.30 rear plateau, flank pods to ±1.51, side bins and
//   a closed rear stowage block under three slat bays; the 105 mm gun's trunnion at (0, 1.76, 0.55), its muzzle 4.625 m
//   ahead (z 5.175) behind a flat ribbed brake, an angular thermal sleeve over the rear two thirds of the tube.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { KIT, orientedSlab, convexSlab } from './kit.ts';
import { sectionSolid, type SolidSection, type SectionPoint } from './sectionSolid.ts';
import { ZTZ100_TIRE_BANDS, ztz100RoadWheelCore, ztz100RoadWheelHardware } from '../nationWheelConstructions.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import { lathedWheelSection, type AxialWheelStation } from './lathedWheelStock.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { beginAuxiliaryStation } from './auxiliaryStation.ts';
import { libraryStationGun } from './libraryRoofMg.ts';
import { mergeAll } from '../factoryGeometry.ts';

const { box, cylX, cylY, cylZ, torus } = KIT;
type XYZ = readonly [number, number, number];

/** The four stages of the family, in development order: the missile testbed (ztz100_prototype), the pre-production
 * gun tank (ztz100), the ZTZ-20 turret testbed (ztz20_prototype) and the production ZTZ-20 (ztz20). */
export type Ztz20Stage = 'ztz100_prototype' | 'ztz100' | 'ztz20_prototype' | 'ztz20';

/** Typed stage deltas: every difference between the four vehicles is one of these switches. */
export interface Ztz20StageDeltas {
  /** Composite appliqué tiles over the glacis and the bow (production only). */
  readonly glacisTiles: boolean;
  /** Skirt bands below the full upper band: the steel lower band and the rubber lip. */
  readonly skirtLowerBand: boolean;
  readonly skirtLip: boolean;
  /** Stern and rear-flank slat cage (production), the trials stowage basket (pre-production) or a plain stern bin. */
  readonly stern: 'slat-cage' | 'stowage-basket' | 'stowage-bin';
  /** Engine deck: the raised production deck (1.465 behind the ring) or the missile testbed's flat deck at the roof line. */
  readonly deck: 'raised' | 'flat';
  /** Crew hatches: the raised production hatches, or the missile testbed's flush plates under its turret platter's sweep. */
  readonly hatches: 'raised' | 'flush';
  // The gun-turret deltas (the missile testbed carries its own turret, ztz100Prototype.ts).
  /** Flank modules: the armour pods, or the turret testbed's trial ballast blocks in their place. */
  readonly pods: 'armour' | 'ballast';
  /** The four-tube smoke banks on the pod shoulders. */
  readonly smoke: boolean;
  /** Hard-kill launcher towers on the pods, their blanked seats, or nothing (no pods to carry them). */
  readonly apsTowers: 'launchers' | 'blanked' | 'none';
  /** Remote weapon station: the twin-tube ATGM station, the plain 12.7 mm trials station, or none. */
  readonly rws: 'twin-tube' | 'plain' | 'none';
  /** Commander's sight: the gimballed panoramic head, or the testbed's fixed periscope block. */
  readonly commanderSight: 'panoramic' | 'periscope';
  /** The coaxial machine gun in its armoured housing in the right cheek's notch (production), or in the mantlet with a
   * cover plate over the housing's seat. */
  readonly coaxHousing: boolean;
  /** Gun mount: the angular moving mantlet, or the testbed's early bolted box mantlet. */
  readonly mantlet: 'angular' | 'early';
  /** The angular thermal sleeve over the tube (a bare tube with its fume extractor without it). */
  readonly sleeve: boolean;
  /** The production gun's flat ribbed brake, the testbed's slotted box brake, or the earlier round multi-baffle brake. */
  readonly brake: 'ribbed' | 'slotted' | 'round';
  /** Trials instrumentation: telemetry mast and GPS dome on the bustle. */
  readonly trialsMast: boolean;
  /** Side stowage bins and the rear stowage block with its slat bays on the bustle. */
  readonly bustleStowage: boolean;
}

export const ZTZ20_STAGES: Readonly<Record<Ztz20Stage, Ztz20StageDeltas>> = Object.freeze({
  ztz100_prototype: Object.freeze({
    glacisTiles: false, skirtLowerBand: false, skirtLip: false, stern: 'stowage-bin', deck: 'flat', hatches: 'flush',
    pods: 'armour', smoke: true, apsTowers: 'blanked', rws: 'plain', commanderSight: 'panoramic', coaxHousing: false,
    mantlet: 'angular', sleeve: true, brake: 'round', trialsMast: true, bustleStowage: false,
  }),
  ztz100: Object.freeze({
    glacisTiles: false, skirtLowerBand: true, skirtLip: false, stern: 'stowage-basket', deck: 'raised', hatches: 'raised',
    pods: 'armour', smoke: true, apsTowers: 'blanked', rws: 'plain', commanderSight: 'panoramic', coaxHousing: false,
    mantlet: 'angular', sleeve: true, brake: 'round', trialsMast: true, bustleStowage: true,
  }),
  ztz20_prototype: Object.freeze({
    glacisTiles: false, skirtLowerBand: true, skirtLip: true, stern: 'stowage-bin', deck: 'raised', hatches: 'raised',
    pods: 'ballast', smoke: false, apsTowers: 'none', rws: 'none', commanderSight: 'periscope', coaxHousing: false,
    mantlet: 'early', sleeve: false, brake: 'slotted', trialsMast: true, bustleStowage: false,
  }),
  ztz20: Object.freeze({
    glacisTiles: true, skirtLowerBand: true, skirtLip: true, stern: 'slat-cage', deck: 'raised', hatches: 'raised',
    pods: 'armour', smoke: true, apsTowers: 'launchers', rws: 'twin-tube', commanderSight: 'panoramic', coaxHousing: true,
    mantlet: 'angular', sleeve: true, brake: 'ribbed', trialsMast: false, bustleStowage: true,
  }),
});

/** Tag a geometry with its part name so the receipts can census the build. */
function part(geometry: THREE.BufferGeometry, name: string): THREE.BufferGeometry {
  geometry.userData.ztz20 = name;
  return geometry;
}

/** Closed convex part from turret-local corner points, with the box UV convexSlab writes. */
function convexPart(points: readonly THREE.Vector3[], name: string): THREE.BufferGeometry {
  const geometry = new ConvexGeometry([...points]), position = geometry.getAttribute('position'), uv: number[] = [];
  for (let i = 0; i < position.count; i++) uv.push(position.getX(i), position.getZ(i));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return part(geometry, name);
}

// ---------------------------------------------------------------------------------------------- measured frame
export const ZTZ20_DATUMS = Object.freeze({
  widthM: 3.70, hullLengthM: 7.13, roofHeightM: 1.41, deckHeightM: 1.465, turretRoofM: 2.30,
  turretPivot: [0, 1.41, -0.55] as XYZ, trunnion: [0, 1.76, 0.55] as XYZ, muzzleZ: 5.175, barrelLengthM: 4.625,
  barrelRadiusM: 0.072,
  // Road-wheel stations: the left side, and the right side staggered 90 mm forward (oracle component census).
  wheelStations: [-2.3375, -1.6015, -0.8655, -0.1295, 0.6065, 1.4345, 2.1705] as const,
  wheelStationsRight: [-2.24736, -1.51136, -0.77536, -0.03936, 0.69664, 1.52464, 2.26064] as const,
  wheelR: 0.3135, wheelY: 0.374, trackW: 0.515, trackX: 1.2485,
  sprocket: Object.freeze({ z: -2.961, y: 0.658, r: 0.311 }),
  idler: Object.freeze({ z: 2.9915, y: 0.7395, r: 0.2035 }),
  rollers: Object.freeze([Object.freeze({ z: -0.933, y: 0.8775, r: 0.1195 }), Object.freeze({ z: 0.648, y: 0.9045, r: 0.1195 })]),
  sternPlateZ: -3.55, sternFenderZ: -3.80, noseZ: 3.58, noseY: 1.20,
});

// ------------------------------------------------------------------------------------------------------- hull
const H = {
  belly: 0.40, tub: 0.93, sponson: 1.12, lipInner: 1.60, lipY: 1.30, lipOuter: 1.72,
  // the deck ramp starts behind the ring's 1.18 m collar sweep (ring z -0.55)
  roof: 1.41, deck: 1.465, glacisTopZ: 1.70, deckRampZ0: -1.76, deckRampZ1: -2.10,
  noseZ: ZTZ20_DATUMS.noseZ, noseY: ZTZ20_DATUMS.noseY, sternZ: ZTZ20_DATUMS.sternPlateZ,
  skirtFwd: 1.85, skirtAft: 1.765, skirtLow: 1.707, skirtLip: 1.60, skirtTop: 1.36, skirtStep: 0.82, lowerHem: 0.62,
  lipHem: 0.45, skirtSplitZ: -0.40, plate: 0.04,
} as const;
const GLACIS_SLOPE = (H.roof - H.noseY) / (H.noseZ - H.glacisTopZ);
const GLACIS_TILT = Math.atan(GLACIS_SLOPE);
export function ztz20RoofY(z: number, deck: Ztz20StageDeltas['deck'] = 'raised'): number {
  if (z >= H.glacisTopZ) return H.roof - (z - H.glacisTopZ) * GLACIS_SLOPE;
  if (z >= H.deckRampZ0 || deck === 'flat') return H.roof;
  if (z >= H.deckRampZ1) return H.roof + ((H.deckRampZ0 - z) / (H.deckRampZ0 - H.deckRampZ1)) * (H.deck - H.roof);
  return H.deck;
}
/** Lower bow (45° to the knee, a short vertical nose box) and the raked lower stern plate. */
const BOW: readonly (readonly [number, number])[] = [[2.30, H.belly], [2.55, 0.35], [3.02, 0.82], [3.30, 0.84], [H.noseZ, 1.10]];
const STERN: readonly (readonly [number, number])[] = [[-2.80, H.belly], [-3.22, 0.86], [-3.40, 0.98], [H.sternZ, 0.99]];
function lerpTable(table: readonly (readonly [number, number])[], z: number): number {
  const rising = table[0][0] < table[table.length - 1][0];
  const rows = rising ? table : [...table].reverse();
  if (z <= rows[0][0]) return rows[0][1];
  for (let i = 1; i < rows.length; i++) {
    const [z0, y0] = rows[i - 1], [z1, y1] = rows[i];
    if (z <= z1) return y0 + ((z - z0) * (y1 - y0)) / (z1 - z0);
  }
  return rows[rows.length - 1][1];
}
function bellyY(z: number): number {
  if (z >= BOW[0][0]) return lerpTable(BOW, z);
  if (z <= STERN[0][0]) return lerpTable(STERN, z);
  return H.belly;
}
/** Outer edge of the fender lip in plan: full width aft of the idler, drawn in over the front fenders to the nose. */
function lipOuterX(z: number): number {
  return lerpTable([[2.80, H.lipOuter], [3.00, 1.70], [3.30, 1.64], [3.42, 1.62], [H.noseZ, 0.86]], z);
}

/** Fourteen-point hull section: chamfered belly, tub wall, sponson floor over the track, fender lip, chamfered roof. */
function hullSection(z: number, deck: Ztz20StageDeltas['deck']): SolidSection {
  const belly = bellyY(z), roof = ztz20RoofY(z, deck), outer = lipOuterX(z);
  const lipIn = Math.min(H.lipInner, outer - 0.03), tub = Math.min(H.tub, lipIn - 0.06);
  const sponson = Math.max(H.sponson, belly + 0.02);
  const lip = Math.max(Math.min(H.lipY, roof - 0.05), sponson + 0.02);
  const ch = Math.min(0.08, (sponson - belly) * 0.3), edge = Math.min(0.03, (roof - lip) * 0.4);
  const ring: SectionPoint[] = [
    [-tub + ch, belly], [tub - ch, belly], [tub, belly + ch], [tub, sponson], [lipIn, sponson], [lipIn, lip],
    [outer, lip], [outer, roof - edge], [outer - edge, roof],
    [-(outer - edge), roof], [-outer, roof - edge], [-outer, lip], [-lipIn, lip], [-lipIn, sponson], [-tub, sponson], [-tub, belly + ch],
  ];
  return { z, ring };
}
const HULL_Z = [H.sternZ, -3.45, -3.40, -3.22, -3.00, -2.80, H.deckRampZ1, H.deckRampZ0, 0.0, H.glacisTopZ, 2.30, 2.55,
  2.80, 3.02, 3.30, 3.42, H.noseZ] as const;

function hullBody(P: TankBuilderPort, stage: Ztz20StageDeltas): void {
  const deckY = stage.deck === 'flat' ? H.roof : H.deck;
  P.add('hull', part(sectionSolid(HULL_Z.map((z) => hullSection(z, stage.deck))), 'hull-body'));
  // Rear fender boxes: the sponsons run on past the stern plate either side of the recessed louvre bay.
  for (const s of [-1, 1]) {
    const x0 = s * 0.97, x1 = s * 1.60, z0 = H.sternZ + 0.02, z1 = ZTZ20_DATUMS.sternFenderZ;
    P.add('hull', part(orientedSlab(
      [x0, 0.97, z0], [x1, 0.97, z0], [x1, 1.12, z1], [x0, 1.12, z1],
      [x0, deckY, z0], [x1, deckY, z0], [x1, deckY, z1], [x0, deckY, z1],
    ), 'rear-fender-box'));
    // the fender lip runs back over the box to the stern
    P.add('hull', part(orientedSlab(
      [s * 1.58, H.lipY, z0], [s * H.lipOuter, H.lipY, z0], [s * H.lipOuter, H.lipY, z1], [s * 1.58, H.lipY, z1],
      [s * 1.58, deckY, z0], [s * H.lipOuter, deckY - 0.03, z0], [s * H.lipOuter, deckY - 0.03, z1], [s * 1.58, deckY, z1],
    ), 'rear-fender-lip'));
  }
  // weld seams: the roof plates and the deck's front edge
  for (const x of [-0.95, 0.95]) P.add('hullDark', part(box(0.018, 0.006, 2.80), 'roof-seam'), x, H.roof + 0.003, 0.25);
  P.add('hullDark', part(box(3.20, 0.006, 0.018), 'deck-seam'), 0, deckY + 0.003, H.deckRampZ1 - 0.02);
}

/** Glacis: production composite tiles (bolted, gapped) or the bare pre-production plate with its weld seams. */
function glacis(P: TankBuilderPort, stage: Ztz20StageDeltas): void {
  const along = (z: number): number => ztz20RoofY(z);
  if (stage.glacisTiles) {
    const tile = (x0: number, x1: number, z0: number, z1: number): void => {
      const t = 0.045, under = 0.01, b = 0.02;
      // bevelled all round: chamfered side edges, and the end stations' tops lowered by the bevel
      const ring = (z: number, drop: number): SectionPoint[] => {
        const low = along(z) - under, top = along(z) + t - drop;
        return [[x0, low], [x1, low], [x1, top - b], [x1 - b, top], [x0 + b, top], [x0, top - b]];
      };
      P.addExternalArmor('hull', part(sectionSolid([
        { z: z0, ring: ring(z0, b) }, { z: z0 + b, ring: ring(z0 + b, 0) }, { z: z1 - b, ring: ring(z1 - b, 0) }, { z: z1, ring: ring(z1, b) },
      ]), 'glacis-tile'));
      for (const x of [x0 + 0.05, x1 - 0.05]) for (const z of [z0 + 0.05, z1 - 0.05]) {
        P.add('hullDetail', part(cylY(0.011, 0.013, 0.016, 6), 'glacis-tile-bolt'), x, along(z) + t + 0.004, z, GLACIS_TILT, 0, 0);
      }
    };
    // three courses of 0.5 m tiles either side of the centre spine (the reference's grid); the driver's block stays clear
    const columns: readonly (readonly [number, number])[] = [[0.06, 0.58], [0.62, 1.14], [1.18, 1.66]];
    const rows: readonly (readonly [number, number])[] = [[1.78, 2.30], [2.34, 2.86], [2.90, 3.30]];
    for (const s of [-1, 1]) for (const [a, b] of columns) for (const [z0, z1] of rows) {
      if ((z1 > 3.0 && b > 1.60) || (a < 0.1 && z0 < 2.0)) continue;
      tile(s < 0 ? -b : a, s < 0 ? -a : b, z0, z1);
    }
  } else {
    for (const x of [-0.92, 0, 0.92]) P.add('hullDark', part(box(0.016, 0.006, 1.80), 'glacis-seam'), x, along(2.6) + 0.004, 2.60, GLACIS_TILT, 0, 0);
    P.add('hullDark', part(box(3.10, 0.006, 0.016), 'glacis-seam'), 0, along(1.74) + 0.004, 1.74, GLACIS_TILT, 0, 0);
  }
  // nose: the bow strip on the lower plate with its two grille slots, and the two tow eyes
  P.add('hull', part(box(1.66, 0.12, 0.10), 'nose-block'), 0, 0.92, 3.36, 0.75, 0, 0);
  const faceY = (off: number): number => 0.92 - (0.05 + off) * Math.sin(0.75), faceZ = (off: number): number => 3.36 + (0.05 + off) * Math.cos(0.75);
  for (const s of [-1, 1]) {
    P.add('hullDark', part(box(0.46, 0.07, 0.012), 'bow-grille'), s * 0.30, faceY(0.006) - 0.004, faceZ(0.006), 0.75, 0, 0);
    for (const dx of [-0.115, 0, 0.115]) P.add('hullDetail', part(box(0.012, 0.07, 0.016), 'bow-grille-bar'), s * 0.30 + dx, faceY(0.012) - 0.004, faceZ(0.012), 0.75, 0, 0);
  }
  for (const s of [-1, 1]) {
    P.add('hullDark', part(torus(0.065, 0.022, 14), 'tow-eye'), s * 0.62, 0.86, 3.44, Math.PI / 2 - 0.75, 0, 0);
    P.add('hullDark', part(box(0.12, 0.10, 0.12), 'tow-eye-block'), s * 0.62, 0.86, 3.38, 0.75, 0, 0);
  }
  // headlights in armoured hoods on the front fender corners
  for (const s of [-1, 1]) {
    const lz = 3.24, ly = ztz20RoofY(lz), lx = s * 1.36;
    P.add('hull', part(box(0.26, 0.10, 0.20), 'lamp-hood'), lx, ly + 0.05, lz, GLACIS_TILT, 0, 0);
    P.add('hullDark', part(box(0.20, 0.06, 0.012), 'lamp-face'), lx, ly + 0.05, lz + 0.104, GLACIS_TILT, 0, 0);
    P.addModuleVisual('optics', 'hullGlass', part(markVehicleNightLens(cylZ(0.035, 0.012, 14), 'headlight'), 'lamp-lens'),
      lx - s * 0.05, ly + 0.05, lz + 0.112, GLACIS_TILT, 0, 0);
    P.addModuleVisual('optics', 'hullGlass', part(cylZ(0.022, 0.012, 12), 'lamp-marker'), lx + s * 0.06, ly + 0.05, lz + 0.112, GLACIS_TILT, 0, 0);
  }
}

/** Crew capsule roof: two chamfered octagonal hatches with periscopes, and the driver's forward vision block. */
function crewHatches(P: TankBuilderPort, stage: Ztz20StageDeltas): void {
  const outline: readonly (readonly [number, number])[] = [
    [-0.20, -0.29], [0.20, -0.29], [0.29, -0.20], [0.29, 0.16], [0.16, 0.29], [-0.16, 0.29], [-0.29, 0.16], [-0.29, -0.20],
  ];
  const hatch = (scale: number, thick: number): THREE.BufferGeometry => {
    const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x * scale, -z * scale)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, steps: 1 });
    return g.rotateX(-Math.PI / 2);
  };
  for (const s of [-1, 1]) {
    // the hatch tops stay under the turret's 1.48 floor that sweeps over them
    const x = s * 0.55, z = 1.32, y = ztz20RoofY(z);
    if (stage.hatches === 'flush') {
      // the testbed's flush plates (to 1.418): its missile turret's platter sweeps 1.44 over this part of the roof
      P.add('hullDark', part(hatch(1, 0.004), 'crew-hatch-seat'), x, y, z);
      P.addHatch('hull', part(hatch(0.92, 0.006), 'crew-hatch'), x, y + 0.002, z);
      for (const dx of [-0.15, 0.15]) P.addModuleVisual('optics', 'hullGlass', part(box(0.12, 0.006, 0.05), 'crew-periscope'), x + dx, y + 0.003, z + 0.36);
      continue;
    }
    P.add('hullDark', part(hatch(1, 0.04), 'crew-hatch-seat'), x, y - 0.01, z);
    P.addHatch('hull', part(hatch(0.92, 0.025), 'crew-hatch'), x, y + 0.03, z);
    // five periscopes ringing the hatch's front half, each hood facing out
    for (const deg of [-90, -45, 0, 45, 90]) {
      const a = deg * Math.PI / 180, px = x + Math.sin(a) * 0.36, pz = z + Math.cos(a) * 0.36;
      P.add('hullDetail', part(box(0.16, 0.035, 0.09), 'crew-periscope-hood'), px, y + 0.012, pz, 0, a, 0);
      P.addModuleVisual('optics', 'hullGlass', part(box(0.12, 0.016, 0.012), 'crew-periscope'), px + Math.sin(a) * 0.05, y + 0.016, pz + Math.cos(a) * 0.05, 0, a, 0);
    }
    P.add('hullDetail', part(cylX(0.020, 0.12, P.q ? 12 : 8), 'crew-hatch-hinge'), x, y + 0.035, z - 0.27);
    P.add('hullDetail', part(box(0.12, 0.012, 0.02), 'crew-hatch-handle'), x, y + 0.05, z + 0.12);
  }
  // driver's centre vision block on the glacis spine
  const vz = 1.98, vy = ztz20RoofY(vz);
  P.add('hull', part(box(0.30, 0.07, 0.16), 'driver-vision-block'), 0, vy + 0.03, vz, GLACIS_TILT, 0, 0);
  P.addModuleVisual('optics', 'hullGlass', part(box(0.22, 0.03, 0.012), 'driver-vision-glass'), 0, vy + 0.04, vz + 0.082, GLACIS_TILT, 0, 0);
}

/** Side skirts: the full-height upper band (forward plane 1.85, aft plane 1.765), the lower band and the rubber lip. */
/** The skirt top: level at 1.36 down the hull, then 2 cm under the glacis line as it falls to the bow (measured). */
function skirtTopY(z: number): number {
  return Math.min(H.skirtTop, ztz20RoofY(z) - 0.02);
}
function skirts(P: TankBuilderPort, stage: Ztz20StageDeltas): void {
  const bolt = (x: number, y: number, z: number): void => { P.add('hullDetail', part(cylX(0.028, 0.016, 8), 'skirt-bolt'), x, y, z); };
  for (const s of [-1, 1]) {
    // upper band panels; the aft panels stand on the inset aft plane, the forward run on the full-width plane
    const upperZ = [-3.80, -2.94, -2.08, -1.22, H.skirtSplitZ, 0.46, 1.32, 2.18, 2.84];
    for (let i = 0; i < upperZ.length - 1; i++) {
      const z0 = upperZ[i] + 0.01, z1 = upperZ[i + 1] - 0.01, zc = (z0 + z1) / 2, outer = zc < H.skirtSplitZ ? H.skirtAft : H.skirtFwd;
      const t0 = skirtTopY(z0), t1 = skirtTopY(z1), xo = s * outer, xi = s * (outer - H.plate);
      P.addExternalArmor('hull', part(t0 === H.skirtTop && t1 === H.skirtTop
        ? box(H.plate, H.skirtTop - H.skirtStep, z1 - z0).translate(s * (outer - H.plate / 2), (H.skirtTop + H.skirtStep) / 2, zc)
        : orientedSlab([xi, H.skirtStep, z0], [xo, H.skirtStep, z0], [xo, H.skirtStep, z1], [xi, H.skirtStep, z1],
          [xi, t0, z0], [xo, t0, z0], [xo, t1, z1], [xi, t1, z1]), 'skirt-upper'));
      for (const dz of [-0.32, 0, 0.32]) for (const y of [skirtTopY(zc + dz) - 0.07, 1.07, H.skirtStep + 0.07]) bolt(s * (outer + 0.004), y, zc + dz);
      P.add('hullDark', part(box(0.008, 0.012, z1 - z0 - 0.04), 'skirt-upper-seam'), s * (outer + 0.002), 1.07 + 0.03, zc);
    }
    // the step between the aft and forward planes, and the hangers onto the fender lip
    P.add('hull', part(box(H.skirtFwd - H.skirtAft + 0.02, H.skirtTop - H.skirtStep, 0.04), 'skirt-step'), s * ((H.skirtFwd + H.skirtAft) / 2 - 0.01), (H.skirtTop + H.skirtStep) / 2, H.skirtSplitZ);
    P.add('hull', part(box(H.skirtAft - H.plate - H.lipOuter + 0.01, 0.05, H.skirtSplitZ + 3.80), 'skirt-hanger'), s * ((H.skirtAft - H.plate + H.lipOuter) / 2), H.skirtTop - 0.03, (H.skirtSplitZ - 3.80) / 2);
    P.add('hull', part(box(H.skirtFwd - H.plate - H.lipOuter + 0.01, 0.05, H.glacisTopZ - H.skirtSplitZ), 'skirt-hanger'), s * ((H.skirtFwd - H.plate + H.lipOuter) / 2), H.skirtTop - 0.03, (H.glacisTopZ + H.skirtSplitZ) / 2);
    // front panel: angled in over the idler, its lower edge rising toward the bow
    const xo = s * H.skirtFwd, xi = s * (H.skirtFwd - H.plate);
    P.addExternalArmor('hull', part(orientedSlab(
      [xi, H.skirtStep, 2.85], [xo, H.skirtStep, 2.85], [s * 1.64, 1.06, 3.36], [s * 1.60, 1.06, 3.36],
      [xi, skirtTopY(2.85), 2.85], [xo, skirtTopY(2.85), 2.85], [s * 1.64, skirtTopY(3.36), 3.36], [s * 1.60, skirtTopY(3.36), 3.36],
    ), 'skirt-front'));
    if (stage.skirtLowerBand) {
      const lowerZ = [-2.60, -1.70, -0.80, 0.10, 1.00, 1.90, 2.80];
      for (let i = 0; i < lowerZ.length - 1; i++) {
        const z0 = lowerZ[i] + 0.01, z1 = lowerZ[i + 1] - 0.01, zc = (z0 + z1) / 2;
        P.addExternalArmor('hull', part(box(H.plate, H.skirtStep - H.lowerHem + 0.02, z1 - z0), 'skirt-lower'), s * (H.skirtLow - H.plate / 2), (H.skirtStep + H.lowerHem) / 2, zc);
        for (const dz of [-0.28, 0.28]) bolt(s * (H.skirtLow + 0.004), H.lowerHem + 0.06, zc + dz);
      }
      // two grab handles on the lower band (measured z 0.10 and 1.94)
      for (const z of [0.10, 1.94]) P.add('hullDetail', part(box(0.03, 0.05, 0.26), 'skirt-handle'), s * (H.skirtLow + 0.016), 0.75, z);
      // the lower band hangs from a rail under the upper band's hem
      P.add('hullDark', part(box(H.skirtFwd - H.skirtLow + 0.02, 0.04, 5.40), 'skirt-rail'), s * ((H.skirtFwd + H.skirtLow) / 2 - 0.01), H.skirtStep, 0.10);
    }
    if (stage.skirtLip) {
      const lipZ = [-2.20, -1.28, -0.36, 0.56, 1.48, 2.40];
      for (let i = 0; i < lipZ.length - 1; i++) {
        const z0 = lipZ[i] + 0.01, z1 = lipZ[i + 1] - 0.01;
        P.add('hullRubber', part(box(0.03, H.lowerHem - H.lipHem + 0.02, z1 - z0), 'skirt-lip'), s * (H.skirtLip - 0.015), (H.lowerHem + H.lipHem) / 2, (z0 + z1) / 2);
      }
      P.add('hullDark', part(box(H.skirtLow - H.skirtLip + 0.02, 0.03, 4.62), 'skirt-lip-rail'), s * ((H.skirtLow + H.skirtLip) / 2 - 0.01), H.lowerHem, 0.10);
    }
  }
}

/** Engine deck: two bolted access panels with lifting handles either side of the spine (the oracle's deck is plain
 * plates; its grilles are on the stern plate), filler caps, the exhaust grille and the forward access plates. */
function deck(P: TankBuilderPort, stage: Ztz20StageDeltas): void {
  const y = stage.deck === 'flat' ? H.roof : H.deck;
  for (const s of [-1, 1]) {
    const x = s * 0.70, z = -3.02, w = 0.95, d = 0.80;
    P.add('hull', part(box(w, 0.012, d), 'deck-panel'), x, y + 0.006, z);
    for (const dx of [-w / 2 + 0.05, w / 2 - 0.05]) for (const dz of [-d / 2 + 0.05, 0, d / 2 - 0.05]) {
      P.add('hullDetail', part(cylY(0.012, 0.012, 0.008, 6), 'deck-panel-bolt'), x + dx, y + 0.014, z + dz);
    }
    for (const dz of [-0.20, 0.20]) P.add('hullDetail', part(box(0.16, 0.02, 0.02), 'deck-panel-handle'), x, y + 0.022, z + dz);
    // access plates ahead of the grilles (the raised deck; the testbed's flat deck lies under its turret platter's sweep)
    if (stage.deck === 'flat') continue;
    P.add('hull', part(box(0.62, 0.010, 0.36), 'deck-access-plate'), s * 0.62, y + 0.005, -2.36);
    for (const dx of [-0.26, 0.26]) for (const dz of [-0.13, 0.13]) P.add('hullDetail', part(cylY(0.012, 0.012, 0.008, 6), 'deck-plate-bolt'), s * 0.62 + dx, y + 0.012, -2.36 + dz);
  }
  P.add('hullDetail', part(box(0.20, 0.010, 0.84), 'deck-spine'), 0, y + 0.005, -3.02);
  for (const z of [-2.80, -3.25]) P.add('hullDark', part(cylY(0.065, 0.065, 0.010, 14), 'filler-cap'), 0, y + 0.010, z);
  // exhaust: a low louvred outlet on the left rear fender box
  P.add('hullDark', part(box(0.012, 0.18, 0.20), 'exhaust-grille'), -1.606, 1.15, -3.67);
  for (let i = 0; i < 4; i++) P.add('hullDetail', part(box(0.012, 0.012, 0.18), 'exhaust-louvre'), -1.612, 1.08 + i * 0.045, -3.67);
}

/** Stern: the recessed louvre bay between the fender boxes, tail lamps, tow pintle and eyes. */
function sternPlate(P: TankBuilderPort): void {
  const z = H.sternZ - 0.012;
  P.add('hullDark', part(box(1.84, 0.40, 0.02), 'stern-louvre-bay'), 0, 1.24, z);
  for (const x of [-0.46, 0.46]) {
    for (let i = 0; i < 10; i++) {
      // folded louvre blades, each a raked closed strip
      P.add('hullDetail', part(box(0.84, 0.018, 0.05), 'stern-louvre-blade'), x, 1.075 + i * 0.037, z - 0.02, -0.55, 0, 0);
    }
    P.add('hullDetail', part(box(0.02, 0.42, 0.06), 'stern-louvre-frame'), x - 0.43, 1.24, z - 0.02);
    P.add('hullDetail', part(box(0.02, 0.42, 0.06), 'stern-louvre-frame'), x + 0.43, 1.24, z - 0.02);
  }
  P.add('hullDetail', part(box(1.86, 0.03, 0.06), 'stern-louvre-frame'), 0, 1.45, z - 0.02);
  P.add('hullDetail', part(box(1.86, 0.03, 0.06), 'stern-louvre-frame'), 0, 1.03, z - 0.02);
  const fz = ZTZ20_DATUMS.sternFenderZ - 0.012;
  for (const s of [-1, 1]) {
    P.add('hullDark', part(box(0.20, 0.09, 0.04), 'tail-lamp'), s * 1.28, 1.36, fz);
    for (const [k, dx] of [-0.06, 0.06].entries()) {
      P.addModuleVisual('optics', 'hullGlass', part(box(0.07, 0.05, 0.01), `tail-lamp-glass-${k}`), s * 1.28 + dx, 1.36, fz - 0.022);
    }
    P.add('hullDark', part(torus(0.06, 0.02, 14), 'tow-eye'), s * 0.78, 0.92, z - 0.04, Math.PI / 2, 0, 0);
    P.add('hullDark', part(box(0.10, 0.12, 0.08), 'tow-eye-block'), s * 0.78, 0.98, z - 0.01);
  }
  P.add('hullDark', part(box(0.20, 0.12, 0.12), 'tow-pintle'), 0, 0.90, z - 0.05);
}

/** Production stern: an open slat cage round the stern and the rear flanks, horizontal slats on posts. */
function slatCage(P: TankBuilderPort): void {
  // the rear run across the stern meets the side runs on chamfered corners (measured: 0.29 m each way)
  const z0 = -4.05, xs = 1.89, xc = xs - 0.29, zc = z0 + 0.29, ys = [0.71, 0.815, 0.92, 1.025, 1.13, 1.235, 1.34] as const, top = 1.43;
  const L = 'hullOpenLatticeDark', diag = Math.hypot(xs - xc, zc - z0);
  for (const y of ys) {
    P.addEquipment(L, part(box(xc * 2, 0.016, 0.010), 'cage-slat'), 0, y, z0);
    for (const s of [-1, 1]) {
      P.addEquipment(L, part(box(0.010, 0.016, -0.40 - zc), 'cage-slat'), s * xs, y, (zc - 0.40) / 2);
      P.addEquipment(L, part(box(diag, 0.016, 0.010), 'cage-slat'), s * (xs + xc) / 2, y, (z0 + zc) / 2, 0, -s * Math.PI / 4, 0);
    }
  }
  for (const s of [-1, 1]) {
    for (const z of [zc, -3.50, -2.90, -2.30, -1.70, -1.05, -0.42]) P.addEquipment(L, part(box(0.02, top - 0.66, 0.02), 'cage-post'), s * xs, (top + 0.66) / 2, z);
    for (const x of [0.36, 1.10, xc]) P.addEquipment(L, part(box(0.02, top - 0.66, 0.02), 'cage-post'), s * x, (top + 0.66) / 2, z0);
    P.addEquipment(L, part(box(0.022, 0.022, -0.40 - zc), 'cage-rail'), s * xs, top, (zc - 0.40) / 2);
    P.addEquipment(L, part(box(diag, 0.022, 0.022), 'cage-rail'), s * (xs + xc) / 2, top, (z0 + zc) / 2, 0, -s * Math.PI / 4, 0);
    // arms from the fender boxes and the skirt hangers out to the cage
    for (const z of [-3.70, -2.30, -1.05]) P.addEquipment(L, part(box(xs - 1.76, 0.03, 0.03), 'cage-arm'), s * (xs + 1.76) / 2, 1.36, z);
    P.addEquipment(L, part(box(0.03, 0.03, ZTZ20_DATUMS.sternFenderZ - z0 - 0.01), 'cage-arm'), s * 1.10, 1.36, (z0 + ZTZ20_DATUMS.sternFenderZ) / 2);
  }
  P.addEquipment(L, part(box(xc * 2 + 0.02, 0.022, 0.022), 'cage-rail'), 0, top, z0);
}

/** Pre-production and testbed sterns: a closed stowage bin, and for the ZTZ-100 an open basket over it. */
function sternStowage(P: TankBuilderPort, stage: Ztz20StageDeltas): void {
  const zf = ZTZ20_DATUMS.sternFenderZ;
  P.addEquipment('hullFittingPaint', part(box(1.70, 0.36, 0.34), 'stern-bin'), 0, 1.20, zf - 0.17);
  for (const dx of [-0.56, 0, 0.56]) P.add('hullDark', part(box(0.03, 0.30, 0.012), 'stern-bin-rib'), dx, 1.20, zf - 0.346);
  P.add('hullDark', part(box(1.72, 0.03, 0.36), 'stern-bin-lid'), 0, 1.395, zf - 0.17);
  for (const s of [-1, 1]) P.add('hullDark', part(box(0.16, 0.08, H.sternZ - zf + 0.03), 'stern-bin-bracket'), s * 0.70, 1.05, (H.sternZ + zf) / 2 - 0.01);
  if (stage.stern === 'stowage-basket') {
    const L = 'hullOpenLatticeDark', z0 = zf - 0.36, z1 = zf - 0.02;
    for (const y of [1.44, 1.56]) {
      P.addEquipment(L, part(box(1.74, 0.025, 0.025), 'stern-basket-rail'), 0, y, z0);
      for (const s of [-1, 1]) P.addEquipment(L, part(box(0.025, 0.025, z1 - z0), 'stern-basket-rail'), s * 0.86, y, (z0 + z1) / 2);
    }
    for (const x of [-0.86, -0.29, 0.29, 0.86]) P.addEquipment(L, part(box(0.025, 0.18, 0.025), 'stern-basket-post'), x, 1.50, z0);
  }
}

function runningGear(P: TankBuilderPort): void {
  const D = ZTZ20_DATUMS;
  // the China MBT wheel construction (nationWheelConstructions.ts, owner 2026-09-22: one wheel per nation)
  const core = ztz100RoadWheelCore(Boolean(P.q));
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', dishR: 0.70, wheelR: D.wheelR, wheelW: 0.366, wheelY: D.wheelY, xc: D.trackX,
    wheelZs: [...D.wheelStations], wheelZsRightM: [...D.wheelStationsRight],
    wheelTireBands: ZTZ100_TIRE_BANDS,
    wheelCoreGeometry: { disc: core },
    sprocket: { ...D.sprocket }, idler: { ...D.idler },
    rollerR: D.rollers[0].r, rollers: D.rollers.map((r) => ({ z: r.z, y: r.y })),
    trackW: D.trackW, trackTh: 0.028, topY: 0.96, botY: 0.05,
    wheelPattern: 'armored-hub-six', trackPattern: 'nato-double-pin', linkPitchM: 0.177, shoeWidthScale: 0.99,
    trackShoeBuilder: buildFleetTrackShoe,
    paintedEnds: true, arms: true, coveredTop: true,
    contactZF: 2.45, contactZR: -2.62,
  });
  for (const side of [-1, 1] as const) {
    P.gear.addRoadWheelLayer(ztz100RoadWheelHardware(side), P.mats.wheels, {
      side, appearanceRole: 'wheelDish', name: `ztz20WheelFasteners${side < 0 ? 'Left' : 'Right'}`,
    });
  }
}

/** The shared hull and running gear of all three stages. */
export function buildZtz20Hull(P: TankBuilderPort, stageId: Ztz20Stage): void {
  const stage = ZTZ20_STAGES[stageId];
  hullBody(P, stage);
  glacis(P, stage);
  crewHatches(P, stage);
  skirts(P, stage);
  deck(P, stage);
  sternPlate(P);
  if (stage.stern === 'slat-cage') slatCage(P);
  else sternStowage(P, stage);
  runningGear(P);
}

// ----------------------------------------------------------------------------------------------------- turret
// Turret frame: the ring (0, 1.41, -0.55); local x = x, y = hull y - 1.41, z = hull z + 0.55. Every station below is
// authored in hull metres and converted once by ty/tz.
const RING = ZTZ20_DATUMS.turretPivot;
const ty = (y: number): number => y - RING[1];
const tz = (z: number): number => z - RING[2];
/** Floor of every turret part outside the ring: 1.5 cm over the 1.465 engine deck it sweeps. */
const FLOOR = 1.48;
const T = {
  roofRear: 2.30, bodyRoofRear: 2.23, roofFront: 2.20, bodyFrontZ: 0.10, bodyRearZ: -1.00, bodyHalf: 1.20, bustleHalf: 0.91,
  bustleRearZ: -2.60,
  podInner: 1.12, podOuter: 1.51, podTop: 2.14, podFrontZ: -0.05, podShoulderZ: -0.48, podRearZ: -1.62, podTailZ: -2.12,
  gunY: ZTZ20_DATUMS.trunnion[1], gunZ: ZTZ20_DATUMS.trunnion[2], gunLen: ZTZ20_DATUMS.barrelLengthM,
} as const;
/** Main-body roof: 2.20 at the body's front rising to 2.23 at its rear, where the 2.30 rear plateau stands proud. */
export function ztz20TurretRoofY(z: number): number {
  if (z <= T.bodyRearZ) return T.roofRear;
  const t = Math.min(1, (z - T.bodyRearZ) / (T.bodyFrontZ - T.bodyRearZ));
  return T.bodyRoofRear + t * (T.roofFront - T.bodyRoofRear);
}

/** Eight-point armoured body section in turret-local metres: an undercut base, vertical side, chamfered roof edge. */
function bodySection(z: number, half: number, roof: number, floor = FLOOR, chamfer = 0.12): SolidSection {
  const under = Math.min(0.12, half * 0.1), knee = floor + 0.14, edge = Math.min(chamfer, (roof - knee) * 0.4);
  const ring: SectionPoint[] = [
    [-(half - under), ty(floor)], [half - under, ty(floor)], [half, ty(knee)], [half, ty(roof - edge)],
    [half - edge * 1.6, ty(roof)], [-(half - edge * 1.6), ty(roof)], [-half, ty(roof - edge)], [-half, ty(knee)],
  ];
  return { z: tz(z), ring };
}

function turretBody(P: TankBuilderPort): void {
  // ring collar and the turret basket's skirt over the hull ring
  P.add('turretDark', part(cylY(1.14, 1.18, 0.10, P.q ? 48 : 24), 'ring-collar'), 0, ty(1.43), 0);
  // bustle: the armoured box under the 2.30 rear plateau, its underside one straight facet rising aft (measured: the
  // rear surface at 1.65 / z -2.41, the rear face from 1.75 at z -2.60) so the back of the turret overhangs the deck
  P.add('turret', part(sectionSolid([
    bodySection(T.bustleRearZ, T.bustleHalf - 0.04, T.roofRear - 0.05, 1.76, 0.06),
    bodySection(T.bustleRearZ + 0.10, T.bustleHalf, T.roofRear, 1.70, 0.08),
    bodySection(-1.60, T.bustleHalf, T.roofRear, 1.50, 0.08),
    bodySection(T.bodyRearZ - 0.02, T.bustleHalf, T.roofRear, FLOOR, 0.08),
  ]), 'bustle'));
  // fighting compartment: the 2.40 m body under the pods; the rear plateau stands 7 cm proud of its roof
  P.add('turret', part(sectionSolid([
    bodySection(T.bodyRearZ - 0.05, T.bodyHalf, ztz20TurretRoofY(T.bodyRearZ + 0.001)),
    bodySection(-0.40, T.bodyHalf, ztz20TurretRoofY(-0.40)),
    bodySection(T.bodyFrontZ, T.bodyHalf, ztz20TurretRoofY(T.bodyFrontZ)),
  ]), 'main-body'));
  // the right front roof: a raised service-hatch plateau (measured 2.20-2.25 over x 0.3-1.3, z -0.34..0)
  const plat = (z: number): SolidSection => {
    const r = ty(ztz20TurretRoofY(z)) - 0.01, t = r + 0.05;
    return { z: tz(z), ring: [[0.40, r], [1.02, r], [1.02, t - 0.015], [1.005, t], [0.415, t], [0.40, t - 0.015]] };
  };
  P.add('turret', part(sectionSolid([plat(-0.62), plat(-0.06)]), 'roof-plateau'));
  const py = ztz20TurretRoofY(-0.34) + 0.04;
  P.addHatch('turret', part(box(0.44, 0.02, 0.40), 'service-hatch'), 0.71, ty(py) + 0.01, tz(-0.34));
  P.add('turretDetail', part(cylX(0.02, 0.10, P.q ? 10 : 6), 'service-hatch-hinge'), 0.71, ty(py) + 0.02, tz(-0.56));
  P.add('turretDetail', part(box(0.14, 0.012, 0.02), 'service-hatch-handle'), 0.71, ty(py) + 0.026, tz(-0.18));
  // roof plates and seams
  for (const s of [-1, 1]) {
    P.add('turretDark', part(box(0.016, 0.006, 1.40), 'roof-seam'), s * 0.62, ty(T.roofRear) + 0.004, tz(-1.75));
    const panel = sectionSolid([-2.40, -1.10].map((z) => ({
      z: tz(z), ring: [[s < 0 ? -0.80 : 0.20, ty(T.roofRear) - 0.002], [s < 0 ? -0.20 : 0.80, ty(T.roofRear) - 0.002],
        [s < 0 ? -0.22 : 0.78, ty(T.roofRear) + 0.022], [s < 0 ? -0.78 : 0.22, ty(T.roofRear) + 0.022]] as SectionPoint[],
    })));
    P.add('turret', part(panel, 'roof-access-panel'));
    for (const z of [-2.30, -1.20]) for (const x of [0.26, 0.74]) P.add('turretDetail', part(cylY(0.012, 0.012, 0.01, 6), 'roof-panel-bolt'), s * x, ty(T.roofRear) + 0.027, tz(z));
  }
}

/** Flank pod: the armoured module along each side, chamfered back to the body ahead and tailing off aft. */
function flankPod(P: TankBuilderPort, s: number): void {
  const station = (z: number, outer: number, bottom: number, top: number): SolidSection => {
    // behind the fighting compartment the pod's inner face closes on the bustle side
    const inner = z < T.bodyRearZ ? T.bustleHalf - 0.01 : T.podInner;
    const ring: SectionPoint[] = [
      [inner, ty(bottom)], [outer - 0.06, ty(bottom)], [outer, ty(bottom + 0.08)], [outer, ty(top - 0.05)],
      [outer - 0.05, ty(top)], [inner, ty(top)],
    ];
    return { z: tz(z), ring: s > 0 ? ring : ring.map(([x, y]) => [-x, y] as SectionPoint).reverse() };
  };
  P.addExternalArmor('turret', part(sectionSolid([
    station(T.podTailZ, 1.36, 1.76, T.podTop - 0.04),
    station(-1.90, 1.45, 1.736, T.podTop - 0.02),
    station(T.podRearZ, T.podOuter, 1.706, T.podTop),
    station(-1.30, T.podOuter, 1.672, T.podTop),
    station(T.bodyRearZ - 0.01, T.podOuter, 1.64, T.podTop),
    station(T.bodyRearZ + 0.01, T.podOuter, 1.64, T.podTop),
    station(T.podShoulderZ, T.podOuter, 1.64, T.podTop),
    station(-0.27, 1.354, 1.65, T.podTop),
    station(T.podFrontZ, T.podInner + 0.07, 1.66, 1.88),
  ]), 'flank-pod'));
  // pod lids and the stowage straps along the pod side
  P.add('turretDark', part(box(0.006, 0.38, 0.016), 'pod-seam'), s * (T.podOuter + 0.003), ty(1.90), tz(-1.05));
  for (const z of [-1.40, -0.75]) {
    P.add('turretDark', part(box(0.010, 0.36, 0.035), 'pod-strap'), s * (T.podOuter + 0.004), ty(1.90), tz(z));
  }
  P.add('turretDetail', part(box(0.012, 0.03, 0.80), 'pod-handrail'), s * (T.podOuter + 0.035), ty(2.04), tz(-1.05));
  for (const z of [-1.40, -0.70]) P.add('turretDetail', part(box(0.035, 0.03, 0.03), 'pod-handrail-post'), s * (T.podOuter + 0.018), ty(2.04), tz(z));
}

/** The ZTZ-20 Prototype's trial ballast in place of the armour pods: a block against the body side and one against the
 * bustle side each flank, lifting eyes on top, painted as fittings (the pods' weight without their armour). */
const BALLAST = { outer: 1.42, low: 1.70, high: 2.00 } as const;
function ballastBlocks(P: TankBuilderPort, s: number): void {
  const y = (BALLAST.low + BALLAST.high) / 2, h = BALLAST.high - BALLAST.low;
  const blocks: readonly (readonly [number, number, number, number])[] = [
    [T.bodyHalf - 0.01, BALLAST.outer, -0.98, -0.50], [T.bustleHalf - 0.01, BALLAST.outer - 0.10, -1.62, -1.06],
  ];
  for (const [inner, outer, z0, z1] of blocks) {
    const x = s * (inner + outer) / 2, z = tz((z0 + z1) / 2);
    P.addEquipment('turretFittingPaint', part(box(outer - inner, h, z1 - z0), 'ballast-block'), x, ty(y), z);
    P.add('turretDark', part(box(0.012, h - 0.06, 0.03), 'ballast-strap'), s * (outer + 0.004), ty(y), z);
    for (const dz of [-(z1 - z0) / 4, (z1 - z0) / 4]) KIT.liftEye(P, 'turretDetail', x, ty(BALLAST.high), z + dz);
  }
}

/** The ZTZ-20 Prototype's commander's sight: a fixed armoured periscope block where the production head will stand. */
function periscopeSight(P: TankBuilderPort): void {
  const x = -0.60, z = tz(-0.08), y = ty(ztz20TurretRoofY(-0.08));
  P.add('turretDark', part(box(0.30, 0.03, 0.30), 'periscope-seat'), x, y + 0.015, z);
  P.addEquipment('turret', part(box(0.22, 0.15, 0.24), 'periscope-block'), x, y + 0.105, z);
  P.add('turretDetail', part(box(0.25, 0.02, 0.10), 'periscope-hood'), x, y + 0.19, z + 0.10);
  P.addModuleVisual('optics', 'turretGlass', part(box(0.16, 0.05, 0.008), 'periscope-glass'), x, y + 0.13, z + 0.122);
}

/** Arrowhead cheek, measured from the front first-hit maps: one swept nose line at 1.62 from the tip beside the mantlet
 * (x 0.40, z 0.97) to the outer corner (x 1.21, z 0.505), stepped in two blocks along it. The inner block (to x 0.92):
 * a short set-back chin from the floor to the nose, the face raked back 30 degrees to 1.99, a ledge at 2.04-2.07 and the
 * riser to the body roof, cut at the gun housing's side (x 0.31) so a V-notch opens between the tip and the mantlet. The
 * outer block: the same face ending at 1.93 under a low top. An outer filler closes the cheek onto the body side. */
const CHEEK_PROFILE: readonly SectionPoint[] = [
  [-0.95, FLOOR], [-0.13, FLOOR], [0, 1.62], [-0.21, 1.99], [-0.24, 2.04], [-0.50, 2.07], [-0.95, 2.12],
];
const CHEEK_OUTER_PROFILE: readonly SectionPoint[] = [[-0.95, FLOOR], [-0.13, FLOOR], [0, 1.62], [-0.176, 1.93], [-0.95, 1.95]];
const CHEEK_NOSE = { inner: [0.40, 0.97], step: 0.92, outer: [1.21, 0.505] } as const;
const CHEEK_CUT_X = 0.31;
/** The production coax slot in the right cheek (measured): across x 0.43-0.57 the face gives way between 1.66 and 2.00 to
 * a back wall 0.55 m behind the nose line, under a roof slab that overhangs it. */
const COAX_NOTCH = [0.43, 0.57] as const;
const COAX_NOTCH_WEDGE: readonly SectionPoint[] = [[-0.95, FLOOR], [-0.13, FLOOR], [0, 1.62], [-0.02, 1.66], [-0.95, 1.66]];
const COAX_NOTCH_WALL: readonly SectionPoint[] = [[-0.95, 1.66], [-0.55, 1.66], [-0.55, 2.00], [-0.95, 2.00]];
const COAX_NOTCH_SLAB: readonly SectionPoint[] = [[-0.95, 2.00], [-0.27, 2.00], [-0.24, 2.04], [-0.50, 2.07], [-0.95, 2.12]];
const CHEEK_RAKE = 0.21 / 0.37; // the face sets back 0.21 over its 0.37 rise
function cheek(P: TankBuilderPort, s: number, stage: Ztz20StageDeltas): void {
  const ax = s * CHEEK_NOSE.inner[0], az = CHEEK_NOSE.inner[1], dx = s * CHEEK_NOSE.outer[0] - ax, dz = CHEEK_NOSE.outer[1] - az;
  const len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
  const flip = ux >= 0 ? 1 : -1, nx = -uz * flip, nz = ux * flip; // the face's forward normal
  const at = (t: number, u: number, y: number): THREE.Vector3 => new THREE.Vector3(ax + ux * t + nx * u, ty(y), tz(az + uz * t + nz * u));
  const split = (CHEEK_NOSE.step - CHEEK_NOSE.inner[0]) / Math.abs(ux);
  // one block: the profile lofted from t0 to t1, clipped (inner block) to the half-space outboard of the housing's side
  const block = (t0: number, t1: number, profile: readonly SectionPoint[], name: string, cut: boolean): THREE.Vector3[] => {
    const ends = [t0, t1].map((t) => profile.map(([u, y]) => at(t, u, y)));
    const side = (v: THREE.Vector3): number => (cut ? s * v.x - CHEEK_CUT_X : 1);
    const pts = ends.flat().filter((v) => side(v) >= 0);
    for (let i = 0; i < profile.length; i++) {
      const j = (i + 1) % profile.length;
      for (const [a, b] of [[ends[0][i], ends[1][i]], [ends[0][i], ends[0][j]], [ends[1][i], ends[1][j]]]) {
        const fa = side(a), fb = side(b);
        if ((fa < 0) !== (fb < 0)) pts.push(a.clone().lerp(b, fa / (fa - fb)));
      }
    }
    P.addExternalArmor('turret', convexPart(pts, name));
    return ends[1];
  };
  const notch = stage.coaxHousing && s > 0 ? COAX_NOTCH.map((x) => (x - CHEEK_NOSE.inner[0]) / ux) : null;
  if (notch) {
    // the production right cheek: a deep slot for the coax housing between a raked lower wedge and an overhanging roof
    // slab, its back wall 0.55 m behind the face
    block(0, notch[0] + 0.005, CHEEK_PROFILE, 'cheek-tip', true);
    block(notch[0], notch[1], COAX_NOTCH_WEDGE, 'cheek-notch-wedge', true);
    block(notch[0], notch[1], COAX_NOTCH_WALL, 'cheek-notch-wall', true);
    block(notch[0], notch[1], COAX_NOTCH_SLAB, 'cheek-notch-slab', true);
    block(notch[1] - 0.005, split + 0.005, CHEEK_PROFILE, 'cheek', true);
  } else {
    block(0, split + 0.005, CHEEK_PROFILE, 'cheek', true);
  }
  const end = block(split - 0.005, len, CHEEK_OUTER_PROFILE, 'cheek-outer', false);
  // the outer filler: the outer end profile closed onto the body side plane and the body's front
  const tip = end.reduce((best, v) => (Math.abs(v.x) > Math.abs(best.x) ? v : best));
  const bodySide = s * T.bodyHalf, frontZ = tz(T.bodyFrontZ - 0.02);
  P.addExternalArmor('turret', convexPart([...end, ...end.map((v) => new THREE.Vector3(bodySide, v.y, Math.min(v.z, tip.z))),
    new THREE.Vector3(bodySide, ty(FLOOR), frontZ), new THREE.Vector3(bodySide, ty(1.95), frontZ)], 'cheek-filler'));
  // each block's appliqué plate, proud of the face with a border of the face showing round it, and the inner seam
  const face = (y: number): number => -(y - 1.62) * CHEEK_RAKE;
  for (const [t0, t1, top] of [[notch ? notch[1] + 0.03 : 0.07, split - 0.04, 1.95], [split + 0.04, len - 0.05, 1.89]] as const) {
    const ring = (off: number): (readonly number[])[] => [[t0, 1.665], [t1, 1.665], [t1, top], [t0, top]]
      .map(([t, y]) => at(t, face(y) + off, y).toArray());
    P.add('turret', part(orientedSlab(...ring(-0.005), ...ring(0.025)), 'cheek-plate'));
  }
  const s0 = notch ? notch[1] : 0, seam = at((s0 + split) / 2, face(1.975) + 0.004, 1.975);
  P.add('turretDark', part(box(split - s0 - 0.10, 0.012, 0.012), 'cheek-seam'), seam.x, seam.y, seam.z, 0, Math.atan2(-uz, ux), 0);
}

/** Fixed gun housing: the central spine between the cheeks, its roof falling from 2.20 at the body to 2.03 over the
 * throat (measured), and the throat the mantlet works in. */
function gunHousing(P: TankBuilderPort): void {
  const back = T.bodyFrontZ - 0.02;
  P.add('turret', part(convexSlab(...[
    [-0.33, FLOOR, 0.98], [0.33, FLOOR, 0.98], [0.33, FLOOR, back], [-0.33, FLOOR, back],
    [-0.30, 2.03, 0.96], [0.30, 2.03, 0.96], [0.33, T.roofFront, back], [-0.33, T.roofFront, back],
  ].map(([x, y, z]) => [x, ty(y), tz(z)])), 'gun-housing'));
  P.add('turretDark', part(box(0.50, 0.40, 0.02), 'gun-throat'), 0, ty(1.76), tz(0.985));
  // the spine's raised cover strip and its bolts
  // (the roof falls 0.17 over the 0.88 m to the throat: a positive X turn drops the strip's front end with it)
  P.add('turretDetail', part(box(0.40, 0.02, 0.70), 'housing-cover'), 0, ty(2.123) + 0.012, tz(0.48), Math.atan(0.17 / 0.88), 0, 0);
}

/** Smoke banks: four mouths across each pod's front shoulder on one launch axis tipped up and forward. */
function smokeBanks(P: TankBuilderPort, s: number): void {
  const axis = new THREE.Vector3(0, 0.74, 0.67).normalize();
  const align = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  const stock: AxialWheelStation[] = [[-0.25, 0], [-0.25, 0.038], [-0.13, 0.038], [-0.13, 0.042], [-0.10, 0.042],
    [-0.10, 0.038], [-0.02, 0.038], [-0.02, 0.041], [0, 0.041], [0, 0]];
  P.add('turretDark', part(box(0.38, 0.012, 0.16), 'smoke-bank-base'), s * 1.24, ty(T.podTop + 0.006), tz(-0.40));
  for (const lane of [1.11, 1.20, 1.29, 1.38]) {
    const x = s * lane, y = ty(T.podTop + 0.12), z = tz(-0.36);
    P.add('turretDark', part(lathedWheelSection(stock, P.q ? 14 : 8).rotateY(-Math.PI / 2).applyQuaternion(align), 'smoke-tube'), x, y, z);
    P.add('turretDark', part(markSmokeTube(cylZ(0.030, 0.002, P.q ? 14 : 8)).applyQuaternion(align), 'smoke-cap'),
      x, y + axis.y * 0.001, z + axis.z * 0.001);
  }
}

/** Hard-kill launcher tower: a round base on the pod top, two upright legs holding the 2x2 launcher head on its
 * trunnion, the radar tile on the outer leg. */
function apsTower(P: TankBuilderPort, s: number, stage: Ztz20StageDeltas): void {
  const x = s * 1.26, z = tz(-0.82), base = ty(T.podTop), n = P.q ? 16 : 10;
  P.addEquipment('turret', part(box(0.30, 0.04, 0.30), 'aps-seat'), x, base + 0.02, z);
  for (const dx of [-0.11, 0.11]) for (const dz of [-0.11, 0.11]) P.add('turretDetail', part(cylY(0.011, 0.011, 0.012, 6), 'aps-seat-bolt'), x + dx, base + 0.046, z + dz);
  if (stage.apsTowers === 'blanked') {
    P.add('turretDark', part(cylY(0.07, 0.08, 0.05, n), 'aps-blank'), x, base + 0.065, z);
    return;
  }
  // a round base and two upright legs holding the launcher head on its trunnion
  P.add('turretDark', part(cylY(0.11, 0.12, 0.05, n), 'aps-base'), x, base + 0.065, z);
  for (const dx of [-0.135, 0.135]) P.addEquipment('turret', part(box(0.03, 0.30, 0.10), 'aps-leg'), x + dx, base + 0.24, z);
  P.add('turretDark', part(cylX(0.022, 0.30, n), 'aps-trunnion'), x, base + 0.30, z);
  // launcher head: four tubes in a 2x2 cluster, open forward
  P.addEquipment('turret', part(cylZ(0.125, 0.20, P.q ? 20 : 12), 'aps-launcher-housing'), x, base + 0.30, z + 0.02);
  for (const dx of [-0.055, 0.055]) for (const dy of [-0.055, 0.055]) {
    P.addEquipment('turretDark', part(cylZ(0.045, 0.04, n), 'aps-launcher-tube'), x + dx, base + 0.30 + dy, z + 0.13);
    P.add('turretDetail', part(new THREE.CircleGeometry(0.036, n), 'aps-launcher-mouth'), x + dx, base + 0.30 + dy, z + 0.152);
  }
  // the radar tile on the outer leg
  P.addEquipment('turret', part(box(0.03, 0.14, 0.18), 'aps-radar'), x + s * 0.165, base + 0.20, z);
  P.addModuleVisual('optics', 'turretGlass', part(box(0.006, 0.10, 0.14), 'aps-radar-face'), x + s * 0.183, base + 0.20, z);
}

/** Commander's panoramic sight on the roof's left front (measured: a 0.36 x 0.27 m head over x -0.78..-0.42, z
 * -0.19..0.08, its flat top at 2.41): a low base and bearing under a box head with rounded upper edges, three receivers
 * in its face. */
function panoramicSight(P: TankBuilderPort): void {
  const x = -0.60, zc = -0.055, z = tz(zc), roofY = ztz20TurretRoofY(zc), y = ty(roofY), n = P.q ? 20 : 12;
  P.add('turret', part(box(0.38, 0.03, 0.30), 'panoramic-base'), x, y + 0.015, z);
  P.add('turretDark', part(cylY(0.12, 0.13, 0.04, n), 'panoramic-bearing'), x, y + 0.05, z);
  const top = y + 2.41 - roofY, low = y + 0.07;
  const ring: SectionPoint[] = [[x - 0.15, low], [x + 0.15, low], [x + 0.15, top - 0.05], [x + 0.10, top], [x - 0.10, top], [x - 0.15, top - 0.05]];
  P.addEquipment('turret', part(sectionSolid([z - 0.135, z + 0.135].map((zz) => ({ z: zz, ring }))), 'panoramic-head'));
  for (const [dx, dy, r] of [[-0.05, 0.12, 0.05], [0.07, 0.15, 0.03], [0.07, 0.08, 0.02]] as const) {
    P.add('turretDark', part(cylZ(r + 0.008, 0.012, n), 'panoramic-receiver'), x + dx, y + dy, z + 0.141);
    P.addModuleVisual('optics', 'turretGlass', part(cylZ(r, 0.004, n), 'panoramic-glass'), x + dx, y + dy, z + 0.149);
  }
}

/** The production coaxial machine gun in its armoured housing in the right cheek's notch beside the mantlet (measured x
 * 0.43-0.56, z 0.59-1.03, top 1.90): a hooded box with the long barrel jacket ahead of it; the earlier stages carry the
 * coax in the mantlet and a cover plate on the housing's seat. */
function coaxHousing(P: TankBuilderPort, stage: Ztz20StageDeltas): void {
  const x = 0.495;
  if (!stage.coaxHousing) {
    P.add('turretDark', part(box(0.14, 0.02, 0.24), 'coax-seat-cover'), x, ty(2.058), tz(0.55));
    return;
  }
  P.addEquipment('turret', part(box(0.13, 0.25, 0.62), 'coax-housing'), x, ty(1.785), tz(0.73));
  P.add('turret', part(box(0.16, 0.02, 0.26), 'coax-housing-hood'), x, ty(1.915), tz(0.95), 0.10, 0, 0);
  P.add('turretDark', part(box(0.10, 0.10, 0.012), 'coax-housing-face'), x, ty(1.81), tz(1.046));
  P.add('turretDark', part(cylZ(0.026, 0.10, P.q ? 12 : 8), 'coax-barrel-jacket'), x, ty(1.80), tz(1.09));
  P.add('turretDark', part(cylZ(0.016, 0.18, P.q ? 10 : 6), 'coax-barrel'), x, ty(1.80), tz(1.19));
}

/** Remote weapon station on the roof centre (measured): a rotating deck on its yaw ring carrying the central body, the
 * sight head in a U yoke in front of it, the 12.7 mm gun on the yoke's trunnion over the sight (x -0.07), the post box
 * at the left under the production station's twin-cell launcher (x -0.47, top 3.02) and the electronics box at the right
 * (x 0.31-0.55, top 2.85). */
function weaponStation(P: TankBuilderPort, stage: Ztz20StageDeltas): void {
  const sz = -0.78, roof = ztz20TurretRoofY(sz), n = P.q ? 20 : 12, gx = -0.07, gy = 2.86;
  const station = beginAuxiliaryStation(P, {
    name: 'ztz20RemoteWeaponStation', caliberMm: 12.7,
    yaw: [0, ty(roof + 0.10), tz(sz)], pivot: [gx, ty(gy), tz(sz)], muzzle: [gx, ty(gy), tz(sz + 1.15)],
  });
  P.add('turretDark', part(cylY(0.27, 0.29, 0.05, P.q ? 28 : 16), 'rws-ring'), 0, ty(roof + 0.025), tz(sz));
  P.add('turret', part(cylY(0.22, 0.22, 0.12, n), 'rws-base'), 0, ty(roof + 0.11), tz(sz));
  P.add('turret', part(box(1.10, 0.05, 0.40), 'rws-deck'), 0, ty(2.415), tz(sz - 0.05));
  P.addEquipment('turret', part(box(0.36, 0.36, 0.34), 'rws-body'), -0.04, ty(2.62), tz(sz - 0.20));
  // the sight head in its U yoke in front of the body, three receivers in its face
  P.addEquipment('turret', part(box(0.30, 0.24, 0.22), 'rws-sight'), gx, ty(2.60), tz(sz + 0.12));
  for (const [dx, dy, r] of [[-0.06, 0.02, 0.05], [0.07, 0.04, 0.035], [0.07, -0.05, 0.02]] as const) {
    P.add('turretDark', part(cylZ(r + 0.008, 0.016, n), 'rws-receiver'), gx + dx, ty(2.60) + dy, tz(sz + 0.238));
    P.addModuleVisual('optics', 'turretGlass', part(cylZ(r, 0.004, n), 'rws-sight-glass'), gx + dx, ty(2.60) + dy, tz(sz + 0.248));
  }
  for (const dx of [-0.19, 0.19]) P.add('turret', part(box(0.05, gy - 2.44, 0.16), 'rws-yoke-arm'), gx + dx, ty((gy + 2.44) / 2), tz(sz + 0.04));
  P.add('turretDark', part(cylX(0.04, 0.44, n), 'rws-trunnion'), gx, ty(gy), tz(sz));
  P.addEquipment('turret', part(box(0.24, 0.42, 0.40), 'rws-electronics'), 0.43, ty(2.645), tz(sz + 0.08));
  P.addEquipment('turret', part(box(0.16, 0.36, 0.24), 'rws-post-box'), -0.47, ty(2.61), tz(sz - 0.02));
  if (stage.rws === 'twin-tube') {
    // the twin-cell launcher on the post box: a box body, the two round tube ends proud of its face, two clamps
    P.addEquipment('turretDark', part(box(0.17, 0.23, 1.30), 'rws-missile-launcher'), -0.47, ty(2.905), tz(sz + 0.02));
    for (const y of [2.85, 2.96]) {
      P.add('turretDark', part(cylZ(0.055, 0.05, n), 'rws-missile-tube-end'), -0.47, ty(y), tz(sz + 0.695));
      P.add('turretDetail', part(new THREE.CircleGeometry(0.045, n), 'rws-missile-cell'), -0.47, ty(y), tz(sz + 0.721));
    }
    for (const dz of [-0.30, 0.34]) P.add('turret', part(box(0.19, 0.25, 0.08), 'rws-missile-clamp'), -0.47, ty(2.905), tz(sz + dz));
    // the feed arm: a C sweeping from the electronics box's top over to the gun's breech (apex 2.99)
    P.add('turretDark', part(new THREE.TorusGeometry(0.3054, 0.045, 8, P.q ? 20 : 12, 115 * Math.PI / 180).rotateZ(30 * Math.PI / 180), 'rws-feed-arm'), 0.18, ty(2.6846), tz(sz - 0.02));
  }
  station.mark('yaw');
  // the pitching gun. Owner 2026-10-28 ("... show actual machine guns that need to be actual machine guns of current
  // dimensions"): the 12.7 mm gun is the fleet's QJC-88 construction (libraryRoofMg.ts libraryStationGun) on the
  // trunnion's bore and published muzzle (sz + 1.16), in place of the drawn receiver block, tray, rods and hider. It
  // feeds from its left, where the trials station's own ammunition box and the production station's feed arm stand.
  const pieces: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, x: number, y: number, z: number): void => { pieces.push(g.translate(x, ty(y), tz(z))); };
  libraryStationGun({ add: (_slot, g, x, y, z) => add(g, x, y, z) },
    { cls: 'qjc88', x: gx, boreY: gy, pivotZ: sz, muzzleZ: sz + 1.16, feed: 'left' });
  if (stage.rws === 'plain') {
    // the trials station's own ammunition box and its curved chute over to the receiver
    add(new THREE.BoxGeometry(0.08, 0.10, 0.20), gx + 0.105, gy + 0.03, sz - 0.08);
    add(new THREE.TorusGeometry(0.05, 0.014, 6, P.q ? 12 : 8, Math.PI), gx + 0.0525, gy + 0.045, sz - 0.08); // its open ends inside the box and the receiver
  }
  const geometry = mergeAll(pieces);
  const mesh = new THREE.Mesh(geometry, P.mats.dark);
  mesh.castShadow = mesh.receiveShadow = true;
  const weapon = new THREE.Group(); weapon.add(mesh);
  weapon.name = 'ztz20MachineGunStock';
  station.attachPitch(weapon); P.disposables.push(geometry);
  station.mark('yaw');
}

/** Bustle stowage (measured): side bins flush with the turret side behind the pods (x 0.91-1.27, z -1.70..-2.45, top
 * 2.20), and the closed rear stowage block behind the bustle (floor 1.742, the oracle's 1.73, to z -3.17) with its
 * corners chamfered and its rear face inclined under the three slat bays: seven louvre rows each 36 mm further aft for
 * every 60 mm of rise, on posts. */
function bustleStowage(P: TankBuilderPort): void {
  for (const s of [-1, 1]) {
    const ring: SectionPoint[] = [[0.91, ty(1.76)], [1.27, ty(1.76)], [1.27, ty(2.08)], [1.23, ty(2.12)], [0.91, ty(2.12)]];
    const sided = s > 0 ? ring : ring.map(([x, y]) => [-x, y] as SectionPoint).reverse();
    P.addEquipment('turret', part(sectionSolid([tz(-2.45), tz(-2.15)].map((z) => ({ z, ring: sided }))), 'side-bin'));
    P.add('turretDark', part(box(0.008, 0.008, 0.28), 'side-bin-lid-seam'), s * 1.272, ty(2.02), tz(-2.30));
    for (const dz of [-0.09, 0.09]) P.add('turretDark', part(box(0.008, 0.22, 0.025), 'side-bin-strap'), s * 1.272, ty(1.90), tz(-2.30) + dz);
    P.add('turretDetail', part(box(0.016, 0.04, 0.035), 'side-bin-latch'), s * 1.276, ty(1.99), tz(-2.30));
  }
  // the rear block: one closed body from the bins' rear to the slat face
  const yb = 1.76, yt = 2.12, rise = 0.60; // the face runs 0.60 m aft-to-fore per metre of rise
  const faceZ = (y: number): number => -3.17 + (y - yb) * rise;
  const corners: THREE.Vector3[] = [];
  for (const y of [yb, yt]) for (const s of [-1, 1]) {
    corners.push(new THREE.Vector3(s * 1.27, ty(y), tz(-2.45)), new THREE.Vector3(s * 1.27, ty(y), tz(faceZ(y) + 0.30)),
      new THREE.Vector3(s * 0.97, ty(y), tz(faceZ(y))));
  }
  P.addEquipment('turret', convexPart(corners, 'rear-stowage-block'));
  for (const s of [-1, 1]) P.add('turretDark', part(box(0.008, 0.36, 0.025), 'rear-block-rib'), s * 1.272, ty(1.94), tz(-2.62));
  const L = 'turretOpenLatticeDark', run = Math.atan(rise);
  const bays: readonly (readonly [number, number])[] = [[-0.958, -0.288], [-0.223, 0.223], [0.288, 0.958]];
  for (const [left, right] of bays) {
    for (let row = 0; row < 7; row++) {
      const y = 1.785 + row * 0.06;
      P.addEquipment(L, part(box(right - left - 0.02, 0.010, 0.032), 'rack-slat'), (left + right) / 2, ty(y), tz(faceZ(y) - 0.03));
    }
    for (const x of [left + 0.006, (left + right) / 2, right - 0.006]) {
      P.addEquipment(L, part(box(0.012, 0.45, 0.012), 'rack-post'), x, ty(1.957), tz(faceZ(1.957) - 0.012), run, 0, 0);
    }
    // the bay's frame: a rail along its foot and one along its head
    for (const y of [1.765, 2.13]) P.addEquipment(L, part(box(right - left, 0.022, 0.03), 'rack-rail'), (left + right) / 2, ty(y), tz(faceZ(y) - 0.02));
  }
}

/** Trials instrumentation on the pre-production turrets: a telemetry mast and a GPS dome on the bustle. */
function trialsMast(P: TankBuilderPort): void {
  const x = 0.55, z = tz(-2.25), y = ty(T.roofRear);
  P.add('turretDark', part(cylY(0.06, 0.07, 0.05, P.q ? 14 : 8), 'trials-mast-base'), x, y + 0.025, z);
  P.addEquipment('turretDark', part(cylY(0.018, 0.022, 0.46, 8), 'trials-mast'), x, y + 0.28, z);
  P.addEquipment('turret', part(box(0.12, 0.08, 0.12), 'trials-telemetry-box'), x, y + 0.55, z);
  P.add('turretDark', part(new THREE.SphereGeometry(0.08, P.q ? 14 : 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'trials-gps-dome'), -0.50, y + 0.005, tz(-2.15));
}

/** The 105 mm gun: the moving mantlet, the angular thermal sleeve, the tube, the brake and the coaxial gun. */
function mainGun(P: TankBuilderPort, stage: Ztz20StageDeltas): void {
  // gun-local frame: the trunnion at hull (0, 1.76, 0.55)
  const gz = (z: number): number => z - T.gunZ, gy = (y: number): number => y - T.gunY;
  const n = P.q ? 28 : 14;
  // mantlet: a tapered block round the gun, wider and taller at its root in the housing throat
  const mantlet = (z: number, half: number, low: number, high: number, shoulder = 0.04): SolidSection => ({
    z: gz(z), ring: [[-half, gy(low)], [half, gy(low)], [half, gy(high) - shoulder], [half - shoulder, gy(high)], [-half + shoulder, gy(high)], [-half, gy(high) - shoulder]],
  });
  if (stage.mantlet === 'angular') {
    // measured: 0.58 m wide and 2.00 high at the housing face, stepping in on raked shoulder plates to 0.44 / 1.97 at
    // z 1.10, then tapering into the sleeve
    P.addGunExtra(part(sectionSolid([mantlet(0.70, 0.27, 1.54, 2.00, 0.06), mantlet(1.00, 0.29, 1.55, 2.00, 0.08),
      mantlet(1.10, 0.22, 1.57, 1.97, 0.05), mantlet(1.30, 0.18, 1.62, 1.93, 0.08)]), 'mantlet'));
    // the gunner's sensor on its post over the mantlet top (measured: head to 2.20 over x -0.10..0.05, z 1.10-1.24)
    P.addGunExtra(part(box(0.15, 0.22, 0.17), 'mantlet-sensor'), -0.03, gy(2.05), gz(1.18));
    P.addGunExtraDark(part(box(0.10, 0.07, 0.008), 'mantlet-sensor-window'), -0.03, gy(2.10), gz(1.269));
    // coaxial machine gun port on the mantlet's right shoulder (until the production coax moves to its cheek housing)
    if (!stage.coaxHousing) P.addGunExtraDark(part(cylZ(0.022, 0.12, P.q ? 12 : 8), 'coax-port'), 0.14, gy(1.67), gz(1.22));
  } else {
    // the testbed's early mount: a straight bolted box round the new gun's cradle, its face plate proud, no coax
    P.addGunExtra(part(sectionSolid([mantlet(0.70, 0.25, 1.55, 2.00), mantlet(1.18, 0.25, 1.55, 2.00)]), 'mantlet-early'));
    P.addGunExtra(part(box(0.56, 0.47, 0.03), 'mantlet-early-face'), 0, gy(1.775), gz(1.195));
    for (const x of [-0.23, 0, 0.23]) for (const y of [1.58, 1.97]) {
      P.addGunExtraDark(part(cylZ(0.014, 0.016, 6), 'mantlet-early-bolt'), x, gy(y), gz(1.218));
    }
    P.addGunExtraDark(part(cylZ(0.10, 0.04, P.q ? 20 : 12), 'mantlet-early-collar'), 0, 0, gz(1.23));
  }
  // thermal sleeve: an angular six-sided jacket tapering along the rear two thirds of the tube
  const sleeve = (z: number, half: number, top: number, bottom: number): SolidSection => ({
    z: gz(z), ring: [[-half * 0.72, gy(T.gunY - bottom)], [half * 0.72, gy(T.gunY - bottom)], [half, gy(T.gunY)],
      [half * 0.80, gy(T.gunY + top)], [-half * 0.80, gy(T.gunY + top)], [-half, gy(T.gunY)]],
  });
  const brakeStart = T.gunLen - 0.56;
  if (stage.sleeve) {
    // measured: 0.34 x 0.32 m at the mantlet, a step down at z 2.15-2.32, 0.22 m on to the muzzle end
    P.add('gun', part(sectionSolid([sleeve(1.28, 0.17, 0.15, 0.17), sleeve(2.15, 0.16, 0.13, 0.14), sleeve(2.32, 0.125, 0.105, 0.115),
      sleeve(4.44, 0.11, 0.09, 0.09)]), 'thermal-sleeve'));
    for (const [z, top, w] of [[2.05, 0.132, 0.27], [3.30, 0.104, 0.19]] as const) P.add('gunDark', part(box(w, 0.012, 0.02), 'sleeve-band'), 0, gy(T.gunY + top), gz(z));
    // tube from the sleeve to the brake (open, the bore carved at the muzzle)
    const tube = new THREE.CylinderGeometry(ZTZ20_DATUMS.barrelRadiusM, ZTZ20_DATUMS.barrelRadiusM, 0.60, n, 1, true).rotateX(Math.PI / 2);
    P.add('gun', part(tube, 'barrel'), 0, 0, gz(4.44) + 0.26);
    // the muzzle reference sensor on its clamp just behind the brake
    P.add('gunDark', part(cylZ(0.080, 0.035, n), 'mrs-clamp'), 0, 0, brakeStart - 0.14);
    P.add('gunDark', part(box(0.06, 0.07, 0.12), 'muzzle-reference-sensor'), 0, 0.105, brakeStart - 0.14);
  } else {
    // the bare tube from the early mount to the brake, with the fume extractor a third of the way out
    const from = gz(1.20), to = brakeStart + 0.02;
    const tube = new THREE.CylinderGeometry(ZTZ20_DATUMS.barrelRadiusM, ZTZ20_DATUMS.barrelRadiusM, to - from, n, 1, true).rotateX(Math.PI / 2);
    P.add('gun', part(tube, 'barrel'), 0, 0, (from + to) / 2);
    const extractor: AxialWheelStation[] = [[0, 0.072], [0.06, 0.104], [0.42, 0.104], [0.48, 0.072]];
    P.add('gun', part(lathedWheelSection(extractor, n).rotateY(-Math.PI / 2), 'fume-extractor'), 0, 0, gz(2.70));
  }
  const mouthOuter = stage.brake === 'slotted' ? 0.085 : stage.brake === 'ribbed' ? 0.08 : 0.095, bore = 0.0525;
  if (stage.brake === 'ribbed') {
    // the production brake (measured 0.25 x 0.17 m over 0.47 m): flat top and bottom plates round a core tube, eight ribs
    // a side with open slots between them, and a round 0.16 m end cap round the muzzle
    const body = 0.47;
    P.add('gunDark', part(lathedWheelSection([[0, 0.072], [0, 0.078], [body, 0.078], [body, 0.072]], n).rotateY(-Math.PI / 2), 'brake-core'), 0, 0, brakeStart);
    for (const y of [-0.08, 0.08]) P.add('gunDark', part(box(0.25, 0.02, body), 'brake-plate'), 0, y, brakeStart + body / 2);
    for (const x of [-0.13, 0.13]) for (let i = 0; i < 8; i++) P.add('gunDark', part(box(0.05, 0.14, 0.028), 'brake-rib'), x, 0, brakeStart + 0.03 + i * 0.0586);
    P.add('gunDark', part(lathedWheelSection([[0, 0.072], [0, 0.08], [0.09, 0.08], [0.09, 0.072]], n).rotateY(-Math.PI / 2), 'brake-cap'), 0, 0, brakeStart + body);
  } else if (stage.brake === 'slotted') {
    // slotted brake: a slim box body (top and bottom plates, slotted cheeks) round a core tube, a pierced front plate and
    // the muzzle rim
    P.add('gunDark', part(new THREE.CylinderGeometry(0.085, 0.085, 0.56, n, 1, true).rotateX(Math.PI / 2), 'brake-core'), 0, 0, brakeStart + 0.28);
    for (const y of [-0.072, 0.072]) P.add('gunDark', part(box(0.19, 0.02, 0.53), 'brake-plate'), 0, y, brakeStart + 0.265);
    for (const x of [-0.088, 0.088]) {
      P.add('gunDark', part(box(0.018, 0.124, 0.53), 'brake-cheek'), x, 0, brakeStart + 0.265);
      for (let i = 0; i < 5; i++) P.add('gun', part(box(0.006, 0.08, 0.045), 'brake-slot'), x + Math.sign(x) * 0.010, 0, brakeStart + 0.08 + i * 0.095);
    }
    const face = new THREE.Shape([new THREE.Vector2(-0.097, -0.082), new THREE.Vector2(0.097, -0.082), new THREE.Vector2(0.097, 0.082), new THREE.Vector2(-0.097, 0.082)]);
    face.holes.push(new THREE.Path(Array.from({ length: n }, (_, i) => {
      const a = (-i / n) * Math.PI * 2; return new THREE.Vector2(Math.cos(a) * 0.0525, Math.sin(a) * 0.0525);
    })));
    const plate = new THREE.ExtrudeGeometry(face, { depth: 0.025, bevelEnabled: false, steps: 1 });
    P.add('gunDark', part(plate, 'brake-face'), 0, 0, T.gunLen - 0.029);
  } else {
    // earlier round brake: a stepped lathe with four port rings
    const brake: AxialWheelStation[] = [[0, 0.072], [0, 0.095], [0.56, 0.095], [0.56, 0.072]];
    P.add('gunDark', part(lathedWheelSection(brake, n).rotateY(-Math.PI / 2), 'brake-body'), 0, 0, brakeStart);
    for (let i = 0; i < 4; i++) P.add('gunDark', part(torus(0.096, 0.012, n, 6).rotateX(Math.PI / 2), 'brake-port-ring'), 0, 0, brakeStart + 0.10 + i * 0.11);
  }
  // the muzzle: annulus, inward bore wall and a recessed backstop, no cap over the bore
  const inner = new THREE.CylinderGeometry(bore, bore, 0.22, n, 1, true).rotateX(Math.PI / 2);
  const idx = inner.index!;
  for (let i = 0; i < idx.count; i += 3) { const b = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, b); }
  inner.computeVertexNormals();
  P.add('gunDark', part(inner, 'bore-wall'), 0, 0, T.gunLen - 0.11);
  P.add('gunDark', part(new THREE.RingGeometry(bore, mouthOuter, n), 'muzzle-face'), 0, 0, T.gunLen);
  P.add('gunDark', part(new THREE.CircleGeometry(bore, n), 'bore-backstop'), 0, 0, T.gunLen - 0.22);
  P.muzzleZ = T.gunLen;
  P.physicalMuzzleBore = { outerRadiusM: mouthOuter, innerRadiusM: bore, depthM: 0.22 };
}

/** The gun-tank turret of the ZTZ-20 and the pre-production ZTZ-100. */
export function buildZtz20Turret(P: TankBuilderPort, stageId: Ztz20Stage): void {
  const stage = ZTZ20_STAGES[stageId];
  turretBody(P);
  for (const s of [-1, 1]) {
    if (stage.pods === 'armour') flankPod(P, s); else ballastBlocks(P, s);
    cheek(P, s, stage);
    if (stage.smoke) smokeBanks(P, s);
    if (stage.apsTowers !== 'none') apsTower(P, s, stage);
  }
  gunHousing(P);
  if (stage.commanderSight === 'panoramic') panoramicSight(P); else periscopeSight(P);
  coaxHousing(P, stage);
  if (stage.rws !== 'none') weaponStation(P, stage);
  if (stage.bustleStowage) bustleStowage(P);
  if (stage.trialsMast) trialsMast(P);
  for (const s of [-1, 1]) {
    const flank = stage.pods === 'armour' ? [T.podOuter, -1.30] : [BALLAST.outer, -0.74];
    P.decal('turret', 'star', null, 0.18, [s * (flank[0] + 0.006), ty(1.88), tz(flank[1])], s * -Math.PI / 2);
    for (const [x, y, z] of [[s * 0.66, ztz20TurretRoofY(-0.10), -0.10], [s * 0.55, T.roofRear, -2.42]]) {
      P.add('turretDetail', part(box(0.06, 0.03, 0.05), 'lift-stub'), x, ty(y) + 0.015, tz(z));
    }
  }
  mainGun(P, stage);
  P.topY = Math.max(P.topY || 0, ty(stage.rws === 'twin-tube' ? 3.03 : stage.rws === 'plain' ? 2.97 : 2.89));
}

/** Hull markings shared by every stage: the insignia forward, the tactical number aft. */
export function markZtz20Hull(P: TankBuilderPort): void {
  for (const s of [-1, 1]) {
    P.decal('hull', 'star', null, 0.22, [s * (H.skirtFwd + 0.006), 1.10, 0.20], s * -Math.PI / 2);
    P.decal('hull', 'number', P.spec.visual.number || '20', 0.24, [s * (H.skirtFwd + 0.006), 1.10, 1.75], s * -Math.PI / 2);
  }
}

/** Geometry-receipt record (Node builds only). */
export function ztz20Receipt(stageId: Ztz20Stage): Readonly<Record<string, unknown>> {
  return Object.freeze({
    architecture: 'ztz20-family-r1', stage: stageId, deltas: ZTZ20_STAGES[stageId], datums: ZTZ20_DATUMS,
    hullStations: HULL_Z.length, roadWheelsPerSide: 7, gunLengthM: T.gunLen, turretFloorM: FLOOR,
  });
}
