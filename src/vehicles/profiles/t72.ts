import { buildT72B3M2022, buildT72BU1989 } from './t72ModernVariants.ts';
// Pure family extraction from russia.ts (§5.75). Geometry bytes are unchanged.
import * as THREE from 'three';
import { KIT, FITTINGS, evenStations, muzzleBore, orientedSlab } from './kit.ts';
import {
  loftHull,
  meshDomeCurved,
  chamferBox,
  tubeGun,
  ruSaddle,
  ruDeck,
  eraRuCheeks,
} from './russia.ts';
import type { ProfileBuilderPort, VehicleProfileRecord } from '../profileBuilderAdapter.ts';

type Vec3Tuple = [number, number, number];
type VehicleAssemblyOwner = 'hull' | 'turret';
type T72Variant = 'b87' | 'b3' | 'jaguar';
type T72Bucket = 'hull' | 'dark' | 'detail';

interface DisposableResource {
  dispose(): void;
}

type T72Material = THREE.MeshPhysicalMaterial;

interface T72BuilderPort {
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly mats: Record<string, T72Material> & { readonly dark: T72Material };
  readonly spec: { readonly id: string; readonly visual: { readonly number?: string } };
  readonly disposables: DisposableResource[];
  readonly rng: () => number;
  readonly q: boolean;
  readonly gear: {
    addRoadWheelLayer(
      geometry: THREE.BufferGeometry,
      material: T72Material,
      options: { readonly outset: number; readonly name: string },
    ): void;
  };
  muzzleZ?: number;
  topY?: number;
  postAssemble?: (() => void) | null;
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addEquipment(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addModuleVisual(module: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addMudguard(label: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  clear(...slots: string[]): void;
  decal(
    owner: VehicleAssemblyOwner,
    kind: string,
    label: string,
    scale: number,
    position: Vec3Tuple,
    ...orientation: number[]
  ): void;
  offsetBuckets(slots: readonly string[], x?: number, y?: number, z?: number): void;
  visualEraCluster(key: string, owner: VehicleAssemblyOwner, build: () => void): void;
}

interface T72TrackProfilePort {
  readonly spec?: { readonly id?: string };
}

const nonUniformXform = KIT.xform as (
  geometry: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  rotationX: number,
  rotationY: number,
  rotationZ: number,
  scale: number | readonly number[],
) => THREE.BufferGeometry;

// The T-72 family wears dark, warm oxidized manganese steel rather than
// scheme-painted track bands. A warm-neutral multiplier plus a near-diffuse
// response keeps woodland lighting from turning the continuous belt green;
// road-wheel paint and rubber skirts remain in the active camouflage scheme.
export const T72_TRACK_FINISH = Object.freeze({
  trackBandHex: 0xb8afa0,
  trackBandRoughness: 0.96,
  trackBandEnvMapIntensity: 0.03,
});
export function t72TrackFinishFor(P: T72TrackProfilePort) {
  const id = String(P.spec?.id || '');
  const usesT72RunningGear = id.startsWith('t72') || id === 'bmpt_terminator2';
  return usesT72RunningGear ? T72_TRACK_FINISH : {};
}

// First-party native rebuild (2026-08-11). This builder is repository-authored
// from visual measurements and retains the fleet-native linked track,
// articulated gun and explicit turret/hull ownership rules. The superseded
// print-tuned prototype was never registered and was removed in September
// 2026; no reference vertices or runtime asset are used.
function addT72B87K1FrontCourses(
  P: T72BuilderPort,
  side: number,
  jitter: readonly number[],
) {
  const { box } = KIT;
  for (let row = 0; row < 4; row++) {
    for (let tile = 0; tile < 6; tile++) {
      const index = (row * 2 + tile + (side < 0 ? 1 : 0)) % jitter.length;
      const x = side * (0.16 + tile * 0.225 + row * 0.018 + jitter[index]);
      const z = 1.08 - tile * 0.102 - row * 0.115 + jitter[(index + 2) % jitter.length];
      const y = 0.065 + row * 0.116 + tile * 0.010
        + jitter[(index + 3) % jitter.length] * 0.45;
      const width = 0.205 + ((tile + row) % 3) * 0.012;
      const height = 0.112 + ((tile + row) % 2) * 0.016;
      const depth = 0.205 + ((tile * 2 + row) % 3) * 0.018;
      const yaw = side * (0.35 + tile * 0.075 + row * 0.020);
      P.add('turretTrack', box(width, height, depth), x, y, z,
        -0.10 - row * 0.012, yaw, side * ((tile % 3 - 1) * 0.018));
      P.add('turretDark', box(width * 0.78, 0.012, 0.022), x,
        y + height / 2 + 0.007, z + depth * 0.44, -0.10, yaw, 0);
    }
  }
}

function addT72B87K1RoofBridge(P: T72BuilderPort, side: number) {
  const { box } = KIT;
  for (let row = 0; row < 2; row++) {
    for (let tile = 0; tile < 5; tile++) {
      const x = side * (0.20 + tile * 0.20 + row * 0.012);
      const z = 0.78 - tile * 0.102 - row * 0.105 + (tile % 2 ? 0.014 : -0.009);
      P.add('turretTrack', box(0.175 + (tile % 2) * 0.012, 0.095, 0.165 + row * 0.015),
        x, 0.43 + row * 0.085 - tile * 0.006, z, -0.14,
        side * (0.24 + tile * 0.095 + row * 0.025), -0.06);
    }
  }
}

function addT72B87K1FlankCourses(
  P: T72BuilderPort,
  side: number,
  jitter: readonly number[],
) {
  const { box } = KIT;
  for (let row = 0; row < 3; row++) {
    for (let tile = 0; tile < 7; tile++) {
      const index = (row + tile * 2) % jitter.length;
      const x = side * (1.18 + tile * 0.045 + jitter[index]);
      const z = 0.33 - tile * 0.205 - row * 0.030
        + jitter[(index + 1) % jitter.length];
      const width = 0.205 + ((tile + row) % 3) * 0.014;
      const height = 0.125 + ((tile + row) % 2) * 0.018;
      P.add('turretTrack', box(width, height, 0.23 + (tile % 2) * 0.02), x,
        0.08 + row * 0.14 - tile * 0.006, z, -0.04,
        side * (0.60 + tile * 0.13 + row * 0.022), 0);
    }
  }
}

function addT72B87K1TurretEra(P: T72BuilderPort) {
  const jitter = [0.0, 0.018, -0.013, 0.027, -0.020, 0.010, -0.008];
  for (const side of [-1, 1]) {
    // Broad shallow carriers provide an explicit armor-to-casting load path.
    P.add('turretDark', orientedSlab(
      [side * 0.08, 0.00, 1.12], [side * 0.83, 0.00, 1.02],
      [side * 1.47, 0.00, 0.46], [side * 0.77, 0.00, 0.42],
      [side * 0.10, 0.10, 1.08], [side * 0.79, 0.10, 0.98],
      [side * 1.40, 0.10, 0.44], [side * 0.74, 0.10, 0.39]));
    addT72B87K1FrontCourses(P, side, jitter);
    // Smaller tiles bridge the roof to the cheek while leaving hatches and
    // sights clear of the protection course.
    addT72B87K1RoofBridge(P, side);
    // Three flank courses descend around the shoulder toward the rear bins.
    addT72B87K1FlankCourses(P, side, jitter);
  }
}

function buildT72B87NativeTyped(P: T72BuilderPort, variant: T72Variant = 'b87'): void {
  const { box, cylX, cylY, cylZ, torus, buildRunningGear } = KIT;
  const b3 = variant === 'b3';
  const jaguar = variant === 'jaguar';

  // ---- compact low T-72 family hull -------------------------------------
  // B3 and the obr.1987 deliberately share the same family datum, but the
  // B87 owns its complete hull loft.  Its lower bow, longer engine shoulder,
  // full fender return and larger six-wheel stance are not a scaled copy of
  // the B3M.  This keeps the two vehicles visibly related without turning
  // the older vehicle into a decoration swap.
  const buildT72B87NativeTypedAssemblyStage1 = (): void => {
    loftHull(P, {
      deck: b3
        ? [[-2.78, 1.20], [-2.62, 1.34], [-1.55, 1.36], [0.55, 1.38], [1.30, 1.34], [2.05, 1.20], [2.68, 0.98], [2.86, 0.88]]
        : [[-2.91, 1.18], [-2.73, 1.32], [-1.72, 1.35], [0.42, 1.39], [1.26, 1.35], [2.04, 1.20], [2.70, 0.98], [2.94, 0.82]],
      belly: b3
        ? [[-2.78, 0.86], [-2.58, 0.48], [-2.15, 0.28], [2.15, 0.28], [2.58, 0.43], [2.86, 0.70]]
        : [[-2.91, 0.82], [-2.70, 0.48], [-2.28, 0.27], [2.18, 0.27], [2.66, 0.42], [2.94, 0.66]],
      wUp: b3
        ? [[-2.78, 1.35], [-2.55, 1.62], [2.58, 1.62], [2.86, 1.38]]
        : [[-2.91, 1.34], [-2.68, 1.63], [1.82, 1.63], [2.14, 1.28], [2.35, 0.99], [2.94, 0.92]],
      wLo: b3
        ? [[-2.78, 0.96], [2.45, 0.96], [2.86, 0.82]]
        : [[-2.91, 0.97], [2.48, 0.97], [2.94, 0.80]],
      // The 1987 return run needs the same real track bay already present at
      // both terminal stations.  Keep the complete outer hull and hanging
      // skirts, but lift their concealed underside above the linked shoes;
      // the former 0.82 m solid sponson occupied the entire 0.94 m upper run.
      // B3 retains its separately authored bay pending its own family audit.
      sponsonY: b3
        ? [[-2.78, 1.15], [-1.62, 1.15], [-1.50, 0.82], [2.22, 0.82], [2.32, 1.14], [2.86, 1.14]]
        : [[-2.91, 1.14], [2.94, 1.14]],
    });
  };
  buildT72B87NativeTypedAssemblyStage1();

  // Thin fender shelves and a shallow, broken skirt line leave the six
  // characteristic dished wheels readable instead of walling them off.
  const buildT72B87NativeTypedHullStage1 = (): void => {
    for (const s of [-1, 1]) {
      const buildT72B87NativeTypedHullCourse1 = (): void => {
        const buildT72B87NativeTypedHullStage6 = (): void => {
          for (let i = 0; i < 8; i++) {
            P.add('hull', box(0.18, 0.055, 0.56), s * 1.66, 1.21, -2.38 + i * 0.64);
          }
        };
        buildT72B87NativeTypedHullStage6();
        const buildT72B87NativeTypedHullStage7 = (): void => {
          for (let i = 0; i < 6; i++) {
            const buildT72B87NativeTypedHullCourse5 = (): void => {
              const z = -1.93 + i * 0.78;
              const sh = b3 ? 0.265 + (i % 3) * 0.018 : 0.35 + (i % 3) * 0.018;
              const sy = b3 ? 1.065 + (i % 2) * 0.009 : 1.075 + (i % 2) * 0.012;
              const sd = b3 ? 0.58 + (i % 2) * 0.045 : 0.66 + (i % 2) * 0.035;
              // Keep the full side-armour course, but seat it outside the shoe
              // envelope.  The old x=1.69 center left only 2.5 mm between the
              // 75-mm panel back and the band; the whole supported stack moves out
              // 45 mm without changing its height, depth, coverage or ownership.
              P.add('hull', box(0.075, sh, sd), s * 1.735, sy, z, 0, 0,
                b3 ? s * (i % 2 ? 0.025 : -0.018) : s * (i % 3 - 1) * 0.012);
              P.add('hullDark', box(0.018, b3 ? sh * 0.72 : sh * 0.76, 0.025), s * 1.778, sy, z + sd / 2);
              P.add('hullDetail', box(0.025, 0.025, sd * 0.72), s * 1.780, sy + sh / 2 + 0.012, z);
              if (!b3 && !jaguar && i >= 3) {
                // Period Kontakt-1 side cassettes sit on the complete skirt rather
                // than replacing it.  Each tile has a visible lower seat and hinge.
                P.add('hullTrack', box(0.105, 0.19, sd * 0.43), s * 1.802, sy + 0.035,
                  z + (i % 2 ? 0.055 : -0.035), 0, 0, s * (i % 2 ? 0.035 : -0.025));
                P.add('hullDark', box(0.020, 0.030, sd * 0.34), s * 1.862, sy - 0.082, z);
              }
            };
            buildT72B87NativeTypedHullCourse5();
          }
        };
        buildT72B87NativeTypedHullStage7();
      };
      buildT72B87NativeTypedHullCourse1();
    }
  };
  buildT72B87NativeTypedHullStage1();

  const wheelZs = evenStations(6, b3 ? 4.02 : 4.10, b3 ? 0.02 : 0.04);
  const buildT72B87NativeTypedRunningGearStage1 = (): void => {
    buildRunningGear(P, {
      ...t72TrackFinishFor(P),
      // owner 2026-09-23 (round 46 wheel follow-up; the same fix the round-40 Polish T-72s took): r 0.455
      // on the 0.82 pitch overlapped by 9 cm and both end wheels sat ~30 cm inside the outer road wheels.
      // Six 750 mm T-72 wheels (2R/pitch 0.91, a 7 cm gap), the end wheels moved out to clear them by
      // 5-8 cm, and no return rollers: the T-72 family carries its upper run on the road-wheel tops.
      style: 'rubber', wheelR: 0.375, wheelW: 0.23, wheelY: b3 ? 0.48 : 0.47, xc: 1.37,
      dishR: b3 ? 0.77 : 0.79, wheelZs,
      sprocket: { z: -2.72, y: b3 ? 0.63 : 0.68, r: b3 ? 0.33 : 0.32 },
      // The obr.1987 keeps the family trapezoid: the front idler is visibly
      // above the road-wheel line, producing a supported / return instead of
      // a low wheel hidden inside a flat rectangular course.
      idler: { z: 2.80, y: b3 ? 0.59 : 0.69, r: b3 ? 0.31 : 0.30 },
      contactZF: b3 ? 2.22 : 2.20, contactZR: b3 ? -2.05 : -2.08,
      rollers: [],
      trackW: 0.56, topY: b3 ? 0.98 : 1.00, botY: 0.025, paintedEnds: true,
      coveredTop: true, arms: true,
    });
  };
  buildT72B87NativeTypedRunningGearStage1();
  const buildT72B87NativeTypedHullStage2 = (): void => {
    const buildT72B87NativeTypedHullStage8 = (): void => {
      if (b3) {
        // B3M wheels retain the fleet-native course but need the source's
        // unmistakable concentric dish/hub cadence at garage distance.  These
        // rings sit on the existing wheel faces; they do not add a second wheel
        // course or change the track corridor.
        const buildT72B87NativeTypedHullCourse7 = (): void => {
          const buildT72B87NativeTypedHullCourse6 = (): void => {
            const buildT72B87NativeTypedHullCourse2 = (): void => {
              for (const s of [-1, 1]) for (const z of wheelZs) {
                P.add('hull', cylX(0.205, 0.024, 18), s * 1.502, 0.48, z);
                P.add('hullDark', torus(0.145, 0.009, 18), s * 1.516, 0.48, z, 0, Math.PI / 2, 0);
                P.add('hullDetail', cylX(0.075, 0.030, 14), s * 1.522, 0.48, z);
                for (let k = 0; k < 8; k++) {
                  const a = (k / 8) * Math.PI * 2;
                  P.add('hullDark', cylX(0.015, 0.026, 8), s * 1.528, 0.48 + Math.sin(a) * 0.105, z + Math.cos(a) * 0.105);
                }
              }
              for (const [z, y, r] of [[-2.36, 0.63, 0.33], [2.48, 0.59, 0.31]]) {
                for (const s of [-1, 1]) {
                  P.add('hullDetail', torus(r * 0.72, 0.014, 16), s * 1.505, y, z, 0, Math.PI / 2, 0);
                  P.add('hullDark', cylX(r * 0.25, 0.034, 12), s * 1.512, y, z);
                }
              }
            };
            buildT72B87NativeTypedHullCourse2();
          };
          buildT72B87NativeTypedHullCourse6();
        };
        buildT72B87NativeTypedHullCourse7();
      } else if (!jaguar) {
        // The older six-wheel course receives the same readable mechanical
        // hierarchy as the current family without changing its track geometry:
        // dark tire, olive dish, hub, and eight small fasteners on each native
        // road wheel. These are face details, not a second wheel/track set.
        // Keep them in explicit running-gear meshes instead of the generic hull
        // buckets: merging suspension faces into `hull` made the strict course
        // audit report the intended wheel/track contact as 2,578 hull voxels.
        const buildT72B87NativeTypedHullCourse8 = (): void => {
          const gearParts: Record<T72Bucket, THREE.BufferGeometry[]> = { hull: [], dark: [], detail: [] };
          const gearAdd = (
            slot: T72Bucket,
            geo: THREE.BufferGeometry,
            x: number,
            y: number,
            z: number,
            rx = 0,
            ry = 0,
            rz = 0,
          ) => {
            gearParts[slot].push(KIT.xform(geo, x, y, z, rx, ry, rz));
          };
          for (const s of [-1, 1]) for (const z of wheelZs) {
            gearAdd('hull', cylX(0.216, 0.024, 18), s * 1.502, 0.47, z);
            gearAdd('dark', torus(0.154, 0.010, 18), s * 1.516, 0.47, z, 0, Math.PI / 2, 0);
            gearAdd('detail', cylX(0.078, 0.030, 14), s * 1.522, 0.47, z);
            for (let k = 0; k < 8; k++) {
              const a = (k / 8) * Math.PI * 2;
              gearAdd('dark', cylX(0.013, 0.026, 8), s * 1.528,
                0.47 + Math.sin(a) * 0.109, z + Math.cos(a) * 0.109);
            }
          }
          for (const [z, y, r] of [[-2.36, 0.68, 0.32], [2.46, 0.69, 0.30]]) {
            for (const s of [-1, 1]) {
              gearAdd('detail', torus(r * 0.69, 0.013, 16), s * 1.505, y, z, 0, Math.PI / 2, 0);
              gearAdd('dark', cylX(r * 0.24, 0.034, 12), s * 1.512, y, z);
            }
          }
          for (const [slot, parts] of Object.entries(gearParts)) {
            if (!parts.length) continue;
            const geometry = KIT.mergeAll(parts);
            if (slot === 'hull') geometry.setAttribute('color', new THREE.BufferAttribute(
              new Float32Array(geometry.attributes.position.count * 3).fill(1), 3));
            const material = slot === 'hull' ? P.mats.hull
              : slot === 'detail' ? P.mats.detail : P.mats.dark;
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = `gear_t72b87_wheelFace_${slot}`;
            mesh.userData.runningGear = true;
            mesh.castShadow = mesh.receiveShadow = true;
            P.hullG.add(mesh);
            P.disposables.push(geometry);
          }
        };
        buildT72B87NativeTypedHullCourse8();
      }
    };
    buildT72B87NativeTypedHullStage8();
  };
  buildT72B87NativeTypedHullStage2();

  // Layered swept prow, compact lamps and inboard shackles.  Every plate
  // remains above/between the exact idler corridors.
  const buildT72B87NativeTypedHullStage3 = (): void => {
    P.add('hull', box(2.88, 0.10, 0.56), 0, b3 ? 1.24 : 1.34, 2.30, -0.30, 0, 0);
    P.add('hull', box(2.56, 0.10, 0.52), 0, b3 ? 1.18 : 1.29, 2.57, -0.34, 0, 0);
    for (const s of [-1, 1]) {
      P.add('hull', box(0.28, 0.15, 0.32), s * 1.42, 1.245, 2.64, -0.25, 0, 0);
      KIT.headlight(P, s * 1.15, 1.21, 2.35, -0.30, 0.045);
      P.add('hullDark', box(0.12, 0.10, 0.16), s * 0.84, 0.72, 2.72, -0.25, 0, 0);
      P.add('hullDark', torus(0.083, 0.018, 12), s * 0.84, 0.66, 2.77, Math.PI / 2, 0, 0);
    }

    if (b3) {
      // B3 Kontakt-5 glacis: two broad, shallow cassette courses follow one
      // buried carrier.  Segment seams carry the source's tiled cadence while
      // the armor remains a continuous part of the fixed hull.
      P.add('hullTrack', box(2.72, 0.055, 0.90), 0, 1.215, 1.94, -0.29, 0, 0);
      for (let row = 0; row < 2; row++) for (let col = -4; col <= 4; col++) {
        const z = 1.79 + row * 0.35;
        const x = col * 0.305 + (row ? 0.035 : -0.025);
        P.add('hullTrack', box(0.29, 0.115, 0.31), x, 1.275 - row * 0.07, z, -0.31, 0, 0);
        P.add('hullDark', box(0.255, 0.012, 0.022), x, 1.338 - row * 0.07, z + 0.145, -0.31, 0, 0);
      }
    } else if (!jaguar) {
      // Three dense, flush Kontakt-1 glacis courses. Tiles are individually
      // legible but share a buried carrier so they cannot float off the plate.
      P.visualEraCluster('t72b87-k1-hull-era', 'hull', () => {
      P.add('hullTrack', box(2.24, 0.06, 0.82), 0, 1.26, 1.92, -0.27, 0, 0);
      for (let row = 0; row < 3; row++) {
        const z = 1.67 + row * 0.27;
        const y = 1.31 - row * 0.055;
        for (let col = -3; col <= 3; col++) {
          const x = col * 0.315 + (row === 1 ? 0.035 : row === 2 ? -0.025 : 0);
          P.add('hullTrack', box(0.30, 0.105, 0.23), x, y, z, -0.30, 0, 0);
          P.add('hullDark', box(0.268, 0.012, 0.018), x, y + 0.057, z + 0.105, -0.30, 0, 0);
        }
      }
      });
    }
    KIT.towCable(P, [[-1.18, 1.28, 1.45], [0, 1.34, 1.18], [1.18, 1.28, 1.45]]);

    // Driver station and an articulated rear deck/service field.
    ruDeck(P, { deckY: 1.36, hatchY: 1.34, hatchZ: 0.78, periY: 1.34, gz: -1.62, grilles: 5, gw: 1.55 });
    for (let i = 0; i < 7; i++) {
      P.add('hullDark', box(1.62, 0.018, 0.055), 0.18, 1.385, -1.36 - i * 0.15);
      P.add('hullDetail', box(1.56, 0.012, 0.016), 0.18, 1.397, -1.385 - i * 0.15);
    }
    // Backed, unequal transom bays with proud louvres/recovery fittings.
    P.add('hull', box(2.62, 0.31, 0.10), 0, 1.105, -2.755);
    P.add('hullDark', box(1.15, 0.30, 0.035), -0.61, 1.08, -2.815);
    P.add('hullDark', box(0.92, 0.25, 0.035), 0.64, 1.055, -2.815);
  };
  buildT72B87NativeTypedHullStage3();
  const buildT72B87NativeTypedHullStage4 = (): void => {
    for (let i = 0; i < 6; i++) {
      const yL = 0.96 + i * 0.045;
      P.add('hullDetail', box(0.31, 0.025, 0.022), -0.98, yL, -2.838);
      P.add('hullDetail', box(0.24, 0.022, 0.022), -0.67, yL + (i % 2 ? 0.008 : 0), -2.840);
      P.add('hullDetail', box(0.29, 0.025, 0.022), -0.36, yL - (i % 3 ? 0.004 : -0.006), -2.838);
      if (i < 5) {
        const yR = 0.97 + i * 0.047;
        P.add('hullDetail', box(0.25, 0.022, 0.022), 0.39, yR, -2.838);
        P.add('hullDetail', box(0.34, 0.024, 0.022), 0.74, yR + (i % 2 ? -0.006 : 0.007), -2.840);
      }
    }
    P.add('hullDark', box(0.76, 0.04, 0.06), -0.91, 1.19, -2.82);
    P.add('hullDark', box(0.62, 0.05, 0.06), -0.16, 1.205, -2.82);
    P.add('hullDark', box(0.91, 0.04, 0.06), 0.72, 1.18, -2.82);
    for (const s of [-1, 1]) {
      P.add('hull', cylX(0.225, 1.02, 18), s * 0.60, 1.29, -2.76);
      P.add('hullDark', torus(0.225, 0.015, 18), s * 1.11, 1.29, -2.76, 0, Math.PI / 2, 0);
      P.add('hullDark', torus(0.225, 0.014, 18), s * 0.60, 1.29, -2.76, 0, Math.PI / 2, 0);
      P.add('hullDark', box(0.06, 0.18, 0.38), s * 0.60, 1.29, -2.76);
      P.add('hullDark', box(0.10, 0.12, 0.05), s * 0.82, 0.88, -2.79);
      P.add('hullDetail', box(0.16, 0.09, 0.035), s * 1.20, 1.08, -2.805);
      P.add('hullDark', box(0.16, 0.11, 0.035), s * 0.94, 0.90, -2.84);
      P.add('hullDark', torus(0.075, 0.018, 12), s * 0.72, 0.79, -2.84, Math.PI / 2, 0, 0);
      // Rear flap remains full-size but hangs from the transom above/outboard
      // of the sprocket wrap.  This is a reseat, never a skirt deletion.
      P.add('hullRubber', box(0.34, 0.34, 0.035), s * 1.47, b3 ? 0.91 : 1.16, -2.79);
      P.add('hullDark', box(0.05, 0.13, 0.15), s * 1.27, 1.02, -2.83);
      P.add('hullDark', box(0.22, 0.14, 0.035), s * 1.10, 1.17, -2.84);
      P.add('hullDetail', cylZ(0.045, 0.025, 10), s * 1.20, 1.12, -2.86);
    }
    P.add('hullDark', cylX(0.072, 1.82, 12), 0, 0.96, -2.85);
    P.add('hullDetail', box(0.32, 0.16, 0.045), 0.18, 0.90, -2.835);
    P.add('hullDark', cylX(0.045, 0.72, 10), -0.76, 1.16, -2.88);
    P.add('hullDark', cylX(0.045, 0.52, 10), 0.02, 1.18, -2.88);
    P.add('hullDark', cylX(0.045, 0.74, 10), 0.78, 1.15, -2.88);
    P.add('hull', box(0.38, 0.20, 0.08), -0.18, 1.24, -2.82);
    P.add('hullDark', box(0.30, 0.025, 0.045), -0.18, 1.35, -2.865);
    for (const x of [-0.92, -0.44, 0.02, 0.54, 0.96]) {
      P.add('hullDark', box(0.035, 0.28, 0.035), x, 1.06, -2.86);
    }
  };
  buildT72B87NativeTypedHullStage4();
  const buildT72B87NativeTypedHullStage5 = (): void => {
    if (b3) {
      // Unequal B3 rear-service texture over the common backed transom. The
      // dark log stays low; proud louvres, pipes, lamp boxes and recovery eyes
      // form three depth planes without widening the certified hull envelope.
      const buildT72B87NativeTypedHullCourse3 = (): void => {
        for (let i = 0; i < 7; i++) {
          P.add('hullDetail', box(0.30 - i * 0.010, 0.023, 0.021), -0.95, 0.945 + i * 0.041, -2.852);
          if (i < 6) P.add('hullDetail', box(0.42 - i * 0.014, 0.022, 0.022), 0.58, 0.96 + i * 0.043, -2.854);
        }
        P.add('hullDark', box(0.48, 0.045, 0.050), -0.44, 1.26, -2.86);
        P.add('hullDark', box(0.72, 0.040, 0.052), 0.54, 1.22, -2.86);
        P.add('hullDetail', box(0.23, 0.17, 0.035), 0.08, 1.04, -2.875);
        P.add('hullDark', box(0.18, 0.025, 0.040), 0.08, 1.14, -2.90);
        for (const [x, y, w] of [[-0.78, 0.87, 0.36], [0.02, 0.90, 0.46], [0.76, 0.85, 0.31]]) {
          P.add('hullDark', cylX(0.040, w, 10), x, y, -2.91);
          P.add('hullDark', box(0.045, 0.17, 0.042), x - w * 0.38, y + 0.04, -2.89);
        }
        for (const s of [-1, 1]) {
          P.add('hullDetail', box(0.16, 0.095, 0.035), s * 1.20, 1.12, -2.89);
          P.add('hullDark', torus(0.082, 0.018, 12), s * 0.70, 0.78, -2.91, Math.PI / 2, 0, 0);
          P.add('hullDark', box(0.06, 0.15, 0.20), s * 1.22, 0.92, -2.88, 0, 0, s * 0.12);
        }
        // The B3 transom uses two unequal recessed radiator/service bays rather
        // than blank doors.  Dark backings are continuous hull structure; every
        // bright slat, divider, pipe and latch is proud of that backing.
        P.add('hullDark', box(1.05, 0.28, 0.028), -0.64, 1.075, -2.885);
        P.add('hullDark', box(0.86, 0.235, 0.028), 0.62, 1.055, -2.886);
        for (let i = 0; i < 7; i++) {
          P.add('hullDetail', box(0.92 - (i % 2) * 0.045, 0.018, 0.024), -0.64, 0.965 + i * 0.036, -2.906);
          if (i < 6) P.add('hullDetail', box(0.73 - (i % 3) * 0.035, 0.018, 0.024), 0.62, 0.972 + i * 0.037, -2.907);
        }
        for (const x of [-1.12, -0.82, -0.47, -0.10, 0.22, 0.52, 0.90, 1.07]) {
          P.add('hullDark', box(0.030, x < 0.15 ? 0.31 : 0.27, 0.026), x, 1.07, -2.914);
        }
        P.add('hullDark', cylX(0.060, 2.08, 12), -0.05, 0.86, -2.930);
        P.add('hullDetail', cylX(0.048, 0.52, 12), 0.72, 1.23, -2.927);
        P.add('hullDark', box(0.25, 0.15, 0.038), 0.08, 0.94, -2.930);
        P.add('hullDetail', box(0.18, 0.08, 0.038), -1.08, 0.90, -2.932);
        for (const [x, y] of [[-1.18, 1.20], [1.16, 1.14]]) {
          P.add('hullDark', box(0.21, 0.15, 0.035), x, y, -2.925);
          P.add('hullDetail', box(0.12, 0.065, 0.038), x, y + 0.01, -2.948);
        }
        // Unequal upper bay courses conceal the last plain door fields.  The
        // left radiator is taller and finer; the right service bay is shorter,
        // split by an exhaust elbow and a removable access cassette.
        P.add('hullDark', box(0.95, 0.31, 0.030), -0.67, 1.20, -2.916);
        P.add('hullDark', box(0.66, 0.25, 0.030), 0.55, 1.17, -2.917);
        P.add('hullDark', box(0.24, 0.19, 0.032), 1.01, 1.13, -2.919);
        for (let i = 0; i < 8; i++) {
          P.add('hullDetail', box(0.83 - (i % 3) * 0.055, 0.016, 0.024), -0.67, 1.075 + i * 0.034, -2.936);
          if (i < 6) P.add('hullDetail', box(0.54 - (i % 2) * 0.045, 0.017, 0.024), 0.55, 1.085 + i * 0.034, -2.938);
        }
        P.add('hullDetail', box(0.040, 0.31, 0.026), -0.96, 1.20, -2.944);
        P.add('hullDetail', box(0.040, 0.27, 0.026), -0.39, 1.18, -2.944);
        P.add('hullDark', cylZ(0.070, 0.16, 12), 0.90, 1.25, -2.945, Math.PI / 2, 0, 0);
        P.add('hullDark', cylX(0.050, 0.34, 10), 0.74, 1.25, -2.946);
        P.add('hullDetail', box(0.20, 0.13, 0.038), 1.01, 1.10, -2.944);
        P.add('hullDark', box(0.10, 0.20, 0.038), 0.18, 1.16, -2.943);
        P.add('hullDetail', box(0.18, 0.055, 0.038), 0.18, 1.26, -2.944);
      };
      buildT72B87NativeTypedHullCourse3();
    } else {
      // Period-correct, asymmetric obr.1987 rear service field. Two backed
      // radiator bays, broken louvre runs, exhaust/service pipes, lamps and
      // recovery fittings remove the old blank transom while the existing
      // external drums/log remain the dominant T-72 rear silhouette.
      const buildT72B87NativeTypedHullCourse4 = (): void => {
        P.add('hullDark', box(1.02, 0.29, 0.030), -0.63, 1.095, -2.915);
        P.add('hullDark', box(0.79, 0.24, 0.030), 0.58, 1.065, -2.916);
        for (let i = 0; i < 7; i++) {
          P.add('hullDetail', box(0.87 - (i % 3) * 0.045, 0.017, 0.024), -0.63, 0.985 + i * 0.037, -2.937);
          if (i < 6) P.add('hullDetail', box(0.66 - (i % 2) * 0.040, 0.017, 0.024), 0.58, 0.987 + i * 0.038, -2.938);
        }
        for (const x of [-1.06, -0.78, -0.46, -0.14, 0.20, 0.49, 0.82, 0.98]) {
          P.add('hullDark', box(0.030, x < 0 ? 0.29 : 0.25, 0.026), x, 1.08, -2.944);
        }
        P.add('hullDark', cylX(0.052, 0.50, 10), 0.68, 1.22, -2.948);
        P.add('hullDark', cylZ(0.070, 0.15, 12), 0.96, 1.22, -2.946, Math.PI / 2, 0, 0);
        P.add('hullDetail', box(0.21, 0.14, 0.038), 0.94, 1.07, -2.945);
        P.add('hullDark', box(0.22, 0.16, 0.038), -1.08, 1.06, -2.944);
        P.add('hullDetail', box(0.12, 0.065, 0.040), -1.08, 1.07, -2.966);
        for (const [x, y] of [[-0.72, 0.79], [0.68, 0.79]]) {
          P.add('hullDark', torus(0.078, 0.018, 12), x, y, -2.952, Math.PI / 2, 0, 0);
        }
      };
      buildT72B87NativeTypedHullCourse4();
    }
  };
  buildT72B87NativeTypedHullStage5();

  // ---- low cast T-72B turret -------------------------------------------
  const buildT72B87NativeTypedAssemblyStage2 = (): void => {
    P.turretG.position.set(0, 1.35, b3 ? 0.02 : -0.03);
  };
  buildT72B87NativeTypedAssemblyStage2();
  const rings = b3
    ? [[1.46, -0.04], [1.57, 0.08], [1.51, 0.25], [1.31, 0.39], [0.96, 0.50], [0.52, 0.56], [0.02, 0.59]]
    : [[1.54, -0.04], [1.67, 0.07], [1.61, 0.21], [1.43, 0.35], [1.12, 0.46], [0.68, 0.52], [0.24, 0.55], [0.02, 0.56]];
  // The obr.1987 uses its own wider pear casting.  The front shoulders are
  // carried down around the gun tunnel and the aft course tapers inward;
  // this is a connected cast mass, not a sphere hidden by ERA blocks.
  const buildT72B87NativeTypedTurretStage1 = (): void => {
    P.add('turret', orientedSlab(
      [-1.50, -0.05, 0.87], [1.50, -0.05, 0.87], [1.15, -0.05, -1.18], [-1.15, -0.05, -1.18],
      [-1.39, 0.28, 0.73], [1.39, 0.28, 0.73], [1.03, 0.28, -1.07], [-1.03, 0.28, -1.07]));
    if (!b3) {
      for (const s of [-1, 1]) {
        // Buried cast cheek continuations close the lower gun-root valleys
        // and produce the characteristic broad, clipped B-family face.
        P.add('turret', orientedSlab(
          [s * 0.10, -0.03, 1.14], [s * 0.78, -0.03, 1.03], [s * 1.48, -0.03, 0.54], [s * 0.92, -0.03, 0.42],
          [s * 0.12, 0.25, 1.03], [s * 0.70, 0.26, 0.93], [s * 1.34, 0.25, 0.48], [s * 0.86, 0.25, 0.37]));
      }
    }
    meshDomeCurved(P, rings, b3 ? 0.79 : 0.75, 0, b3 ? -0.02 : -0.09, { capR: b3 ? 1.8 : 2.15 });
    P.add('turretDark', cylY(b3 ? 1.53 : 1.62, b3 ? 1.53 : 1.62, 0.05, 28), 0, -0.025, b3 ? -0.02 : -0.09);
  };
  buildT72B87NativeTypedTurretStage1();

  const buildT72B87NativeTypedTurretStage2 = (): void => {
    const buildT72B87NativeTypedTurretStage10 = (): void => {
      if (!b3 && !jaguar) {
        // Kontakt-1 is planted directly into the casting in irregular front,
        // roof-bridge and flank courses rather than as a decorative necklace.
        const buildT72B87NativeTypedTurretCourse3 = (): void => {
          const buildT72B87NativeTypedTurretCourse2 = (): void => {
            const buildT72B87NativeTypedTurretCourse1 = (): void => {
              P.visualEraCluster('t72b87-k1-turret-era', 'turret', () => addT72B87K1TurretEra(P));
            };
            buildT72B87NativeTypedTurretCourse1();
          };
          buildT72B87NativeTypedTurretCourse2();
        };
        buildT72B87NativeTypedTurretCourse3();
      } else if (b3) {
        // B3 turret protection: two large Kontakt-5 arrow leaves meet around
        // the armored gun tunnel, with clipped flank cassettes and a restrained
        // stagger at the crown. Each course overlaps the cast shoulder instead
        // of standing on sparse rails.
        const buildT72B87NativeTypedTurretCourse4 = (): void => {
          const buildT72B87NativeTypedAssemblyStage3 = (): void => {
            eraRuCheeks(P, { tip: {
              x: 0.18, z: 1.24, ox: 1.30, oz: 0.47, y: 0.23,
              h: 0.31, d: 0.13, tilt: -0.16, segs: 5, rows: 0, gap: false,
              lip: { h: 0.09, dy: 0, dPitch: 0.28, tuck: 0.04 },
            } }, 'tip');
          };
          buildT72B87NativeTypedAssemblyStage3();
          const k5W = [0.19, 0.24, 0.205, 0.26, 0.18, 0.23, 0.215, 0.25];
          const k5H = [0.10, 0.14, 0.09, 0.125, 0.11, 0.15, 0.095, 0.13];
          const k5D = [0.25, 0.31, 0.28, 0.34, 0.24, 0.32, 0.27, 0.30];
          const addKontakt5TurretCell = (side: number, row: number, index: number): void => {
            if ((row === 0 && index === 6) || (row === 2 && index === 2) || (row === 3 && index === 5)) return;
            const q = (index + row * 3 + (side < 0 ? 2 : 0)) % 8;
            const jitter = [0.0, 0.022, -0.018, 0.034, -0.025, 0.012, -0.011, 0.027][q];
            const x = side * (0.89 + index * 0.071 + jitter + row * 0.015 + (index % 2 ? 0.012 : -0.008));
            const z = 0.65 - index * 0.169 - row * 0.023 + (index % 3 - 1) * 0.021 + (side < 0 ? -0.010 : 0.012);
            const yaw = side * (0.47 + index * 0.108 + jitter * 1.3 + row * 0.021);
            const w = k5W[q];
            const h = k5H[(q + row) % 8];
            const d = k5D[(q + index) % 8];
            const y = 0.038 + row * [0.102, 0.119, 0.108, 0.126][index % 4] - index * 0.003 + jitter;
            P.add('turretTrack', box(w, h, d), x, y, z, -0.04 - (index % 3) * 0.012, yaw, -0.045 + (row % 2 ? 0.018 : -0.012));
            if (row !== 0) P.add('turretDark', box(w * 0.76, 0.013, 0.027), x, y + h / 2 + 0.007, z + 0.15, 0, yaw, -0.035);
          };
          const buildT72B87NativeTypedTurretStage11 = (): void => {
            for (const side of [-1, 1]) {
              for (let row = 0; row < 4; row++) {
                for (let index = 0; index < 8; index++) addKontakt5TurretCell(side, row, index);
              }
            }
          };
          buildT72B87NativeTypedTurretStage11();
          const buildT72B87NativeTypedTurretStage12 = (): void => {
            for (const s of [-1, 1]) for (let row = 0; row < 3; row++) for (let i = 0; i < 7; i++) {
              const x = s * (0.16 + i * 0.165 + (i % 2 ? 0.014 : -0.010) + row * 0.008);
              const z = 0.86 - i * 0.108 - row * 0.086 + (i % 3 - 1) * 0.010;
              const w = 0.150 + ((i + row) % 3) * 0.016;
              P.add('turretTrack', box(w, 0.078 + (i % 2) * 0.012, 0.155 + (row % 2) * 0.018), x, 0.405 + row * 0.084 - i * 0.008, z, -0.16, s * (0.18 + i * 0.105 + row * 0.018), -0.060);
            }
          };
          buildT72B87NativeTypedTurretStage12();
          // Irregular buried inserts close the last smooth valleys between the
          // frontal leaves and inner horseshoe. Their mixed scales/pitches avoid
          // turning the protection into a decorative metronome.
          const buildT72B87NativeTypedTurretStage13 = (): void => {
            for (const s of [-1, 1]) for (const [x0, y, z, w, h, d, yaw] of [
              [0.34, 0.29, 0.92, 0.19, 0.10, 0.18, 0.30],
              [0.58, 0.34, 0.74, 0.16, 0.085, 0.21, 0.43],
              [0.79, 0.27, 0.56, 0.22, 0.095, 0.17, 0.51],
              [0.98, 0.18, 0.28, 0.17, 0.11, 0.23, 0.66],
              [1.09, 0.11, -0.02, 0.21, 0.09, 0.19, 0.79],
              [1.13, 0.07, -0.34, 0.16, 0.12, 0.24, 0.92],
            ]) {
              P.add('turretTrack', box(w, h, d), s * x0, y + (s < 0 ? 0.008 : -0.006), z + (s < 0 ? -0.014 : 0.010), -0.10, s * yaw, -0.05);
            }
          };
          buildT72B87NativeTypedTurretStage13();
          // Two lower cheek courses descend from the arrow leaves toward the gun
          // tunnel. They are wider at the nose, then taper and twist into the
          // flank array, eliminating the smooth exposed cast valleys seen head-on.
          const buildT72B87NativeTypedTurretStage14 = (): void => {
            for (const s of [-1, 1]) for (let row = 0; row < 2; row++) for (let i = 0; i < 5; i++) {
              const x = s * (0.28 + i * 0.235 + row * 0.018);
              const z = 1.02 - i * 0.105 - row * 0.145 + (i % 2 ? 0.014 : -0.008);
              const y = 0.075 + row * 0.118 + i * 0.010;
              const w = 0.215 - i * 0.008 + (row ? 0.012 : 0);
              P.add('turretTrack', box(w, 0.12 - row * 0.012, 0.27 - i * 0.012), x, y, z, -0.12, s * (0.34 + i * 0.065 + row * 0.025), -0.07);
            }
          };
          buildT72B87NativeTypedTurretStage14();
        };
        buildT72B87NativeTypedTurretCourse4();
      }
    };
    buildT72B87NativeTypedTurretStage10();
  };
  buildT72B87NativeTypedTurretStage2();

  // Compact roof station hierarchy on broad seats.
  const buildT72B87NativeTypedTurretStage3 = (): void => {
    P.add('turret', cylY(b3 ? 0.31 : 0.34, b3 ? 0.33 : 0.36, b3 ? 0.075 : 0.075, 18), -0.56, b3 ? 0.55 : 0.53, -0.02);
    chamferBox(P, 'turret', b3 ? 0.72 : 0.80, b3 ? 0.07 : 0.065, b3 ? 0.52 : 0.55, b3 ? -0.48 : -0.51, b3 ? 0.515 : 0.505, -0.10, 0.09);
    P.add('turret', cylY(b3 ? 0.27 : 0.30, b3 ? 0.29 : 0.32, b3 ? 0.075 : 0.075, 16), -0.56, b3 ? 0.625 : 0.585, -0.02);
    P.add('turretDark', cylY(0.25, 0.25, 0.025, 16), -0.56, b3 ? 0.675 : 0.635, -0.02);
  };
  buildT72B87NativeTypedTurretStage3();
  const buildT72B87NativeTypedTurretStage4 = (): void => {
    P.add('turret', cylY(b3 ? 0.27 : 0.28, b3 ? 0.29 : 0.30, b3 ? 0.075 : 0.09, 16), 0.48, b3 ? 0.525 : 0.54, -0.10);
    P.add('turretDark', cylY(0.24, 0.24, 0.024, 16), 0.48, b3 ? 0.575 : 0.60, -0.10);
    if (!b3 && !jaguar) {
      // TPN-3-49 night sight on a tapered cheek shoe.  The old cuboid rose
      // above the cupola; this lower housing stays readable but follows the
      // cast roof and keeps its blue glass clear of the K-1 courses.
      chamferBox(P, 'turret', 0.34, 0.20, 0.32, -0.42, 0.50, 0.53, 0.055);
      P.add('turretDark', box(0.27, 0.08, 0.025), -0.42, 0.525, 0.695);
      P.add('turretGlass', box(0.20, 0.095, 0.014), -0.42, 0.53, 0.710);
    }
    P.add('turret', cylZ(b3 ? 0.19 : 0.225, b3 ? 0.18 : 0.21, 16), 0.54, b3 ? 0.50 : 0.47, 0.57, -0.24, 0, 0);
    P.add('turretGlass', cylZ(b3 ? 0.16 : 0.19, 0.02, 16), 0.54, b3 ? 0.51 : 0.48, b3 ? 0.665 : 0.682, -0.24, 0, 0);
    if (!b3 && !jaguar) {
      // Broad welded cradle and two lower stays make the large Luna lamp an
      // attached source identifier rather than a blue disc on the casting.
      P.add('turretDark', box(0.31, 0.065, 0.17), 0.54, 0.36, 0.48, -0.18, 0, 0);
      for (const s of [-1, 1]) P.add('turretDark', box(0.035, 0.20, 0.035),
        0.54 + s * 0.13, 0.39, 0.48, 0, 0, s * 0.18);
    }
  };
  buildT72B87NativeTypedTurretStage4();
  const buildT72B87NativeTypedTurretStage5 = (): void => {
    for (const [x, z, ry] of [[-0.86, 0.02, -0.28], [-0.78, 0.20, -0.12], [-0.55, 0.28, 0], [-0.32, 0.20, 0.12], [-0.24, 0.02, 0.28]]) {
      P.add('turretGlass', box(0.12, 0.055, 0.07), x, 0.61, z, 0, ry, 0);
    }
  };
  buildT72B87NativeTypedTurretStage5();
  const buildT72B87NativeTypedTurretStage6 = (): void => {
    if (b3) {
      // Sosna-U and commander's station are intentionally compact and
      // asymmetric. Broad buried shoes carry the receivers; lenses stay
      // exposed, and the MG/cupola opening is not hidden behind a tower.
      chamferBox(P, 'turret', 0.38, 0.055, 0.36, -0.61, 0.558, 0.29, 0.065);
      chamferBox(P, 'turret', 0.25, 0.14, 0.27, -0.61, 0.635, 0.33, 0.065);
      P.add('turretDark', box(0.195, 0.080, 0.024), -0.61, 0.635, 0.475);
      P.add('turretGlass', box(0.115, 0.058, 0.014), -0.56, 0.642, 0.489);
      P.add('turret', box(0.045, 0.11, 0.23), -0.75, 0.625, 0.32, 0, -0.10, 0);
      P.add('turret', box(0.045, 0.095, 0.20), -0.47, 0.615, 0.31, 0, 0.10, 0);
      P.add('turret', cylY(0.31, 0.33, 0.065, 18), 0.48, 0.63, -0.10);
      P.add('turretDark', cylY(0.25, 0.25, 0.024, 16), 0.48, 0.675, -0.10);
      P.add('turret', box(0.20, 0.15, 0.22), 0.72, 0.50, 0.14);
      P.add('turretGlass', box(0.15, 0.075, 0.024), 0.72, 0.515, 0.265);
      for (const [x, z, ry] of [[0.25, 0.03, 0.18], [0.41, 0.17, 0.10], [0.59, 0.16, -0.05], [0.74, 0.02, -0.18]]) {
        P.add('turretGlass', box(0.105, 0.05, 0.065), x, 0.61, z, 0, ry, 0);
      }
      for (const [x, z, ry] of [[-0.86, 0.02, -0.24], [-0.78, 0.19, -0.12], [-0.62, 0.26, 0.02], [-0.40, 0.18, 0.14]]) {
        P.add('turretGlass', box(0.10, 0.046, 0.062), x, 0.605, z, 0, ry, 0);
      }
      P.add('turretDark', cylY(0.045, 0.050, 0.10, 10), -0.22, 0.58, -0.54);
      P.add('turretDetail', box(0.025, 0.27, 0.025), -0.22, 0.75, -0.54);
      P.add('turret', box(0.15, 0.055, 0.17), -0.22, 0.60, -0.54);
      P.add('turret', box(0.19, 0.10, 0.22), 0.16, 0.53, -0.44, 0, 0.12, 0);
      P.add('turretDark', box(0.12, 0.055, 0.020), 0.16, 0.54, -0.32, 0, 0.12, 0);
      // Low, unequal periscope/receiver bridge connects the two stations and
      // replaces the former pair of isolated optical cubes.
      P.add('turret', box(0.42, 0.055, 0.16), -0.04, 0.555, -0.04, 0, -0.06, 0);
      P.add('turretDark', box(0.16, 0.035, 0.025), -0.14, 0.575, 0.052, 0, -0.06, 0);
      P.add('turretGlass', box(0.085, 0.035, 0.026), 0.08, 0.575, 0.052, 0, -0.06, 0);
      for (const [x, z, ry, hh] of [[-0.78, -0.16, -0.20, 0.040], [-0.43, -0.31, -0.08, 0.050], [-0.04, -0.30, 0.06, 0.043], [0.35, -0.29, 0.14, 0.052], [0.69, -0.18, 0.23, 0.040]]) {
        P.add('turretGlass', box(0.085, hh, 0.050), x, 0.575 + (x > 0 ? 0.008 : 0), z, 0, ry, 0);
      }
      P.add('turret', box(0.22, 0.060, 0.12), 0.63, 0.565, -0.38, 0, 0.12, 0);
      P.add('turretDark', box(0.13, 0.032, 0.024), 0.63, 0.575, -0.31, 0, 0.12, 0);
    } else if (!jaguar) {
      // Armored commander/NSVT station: a broad cupola seat, frontal shield
      // and short return wings. The opening and weapon line remain clear.
      P.add('turret', cylY(0.34, 0.36, 0.055, 18), -0.56, 0.655, -0.14);
      chamferBox(P, 'turret', 0.54, 0.145, 0.055, -0.56, 0.705, 0.00, 0.06);
      P.add('turret', box(0.045, 0.145, 0.27), -0.80, 0.690, -0.14, 0, -0.12, 0);
      P.add('turret', box(0.045, 0.125, 0.24), -0.32, 0.680, -0.16, 0, 0.12, 0);
      P.add('turretDark', box(0.11, 0.065, 0.022), -0.67, 0.72, 0.036);
      P.add('turret', box(0.20, 0.16, 0.22), 0.76, 0.47, 0.10);
      P.add('turretGlass', box(0.15, 0.08, 0.025), 0.76, 0.49, 0.225);
      for (const [x, z] of [[0.30, 0.04], [0.46, 0.17], [0.63, 0.13], [0.74, -0.02]]) {
        P.add('turretGlass', box(0.11, 0.05, 0.065), x, 0.615, z);
      }
      for (const [x, z, ry] of [[-0.83, -0.03, -0.20], [-0.76, 0.15, -0.10], [-0.59, 0.24, 0], [-0.39, 0.17, 0.12], [-0.30, -0.01, 0.22]]) {
        P.add('turretGlass', box(0.095, 0.046, 0.058), x, 0.655, z, 0, ry, 0);
      }
    }
  };
  buildT72B87NativeTypedTurretStage6();

  // Twin 902B banks and NSVT are Russian-fit identifiers. Polish derivatives
  // author their own smoke banks, WKM-B and antenna layout on the shared cast
  // structure so family reuse never becomes a decoration clone.
  const buildT72B87NativeTypedTurretStage7 = (): void => {
    if (!jaguar) {
      for (const s of [-1, 1]) {
        P.add('turret', box(0.38, 0.08, 0.32), s * 0.99, 0.29, 0.56, 0, s * -0.58, 0);
        for (let i = 0; i < 6; i++) {
          P.add('turretDark', cylZ(0.039, 0.23, 8), s * (0.80 + i * 0.058), 0.34 + (i % 2) * 0.025, 0.80 - i * 0.068, -0.42, s * -(0.25 + i * 0.08), 0);
        }
      }
      const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'nsvt', tone: 'dark', elev: -0.04, ammo: true });
      mg.scale.setScalar(b3 ? 0.88 : 0.94);
      mg.position.set(-0.55, b3 ? 0.67 : 0.61, -0.17);
      P.turretG.add(mg);
      P.add('turretDark', cylY(0.040, 0.045, 0.11, 10), -0.87, 0.59, -0.48);
      P.add('turretDetail', box(0.025, 0.50, 0.025), -0.87, 0.82, -0.48);
      P.add('turretDark', cylY(0.035, 0.040, 0.10, 10), 0.87, 0.59, -0.48);
      P.add('turretDetail', box(0.022, 0.24, 0.022), 0.87, 0.68, -0.48);
    }

    // Open low bustle rail with direct returns into the cast rear shoulder.
    P.add('turretDark', box(1.55, 0.05, 0.05), 0, 0.30, -1.28);
    P.add('turretDark', box(1.55, 0.05, 0.05), 0, 0.48, -1.31);
    for (const [x, w, h, z] of [[-0.56, 0.38, 0.17, -1.09], [-0.08, 0.50, 0.24, -1.18], [0.49, 0.35, 0.20, -1.04]]) {
      P.add('turret', box(w, h, 0.30), x, 0.22 + h / 2, z);
      P.add('turretDark', box(w - 0.04, 0.018, 0.24), x, 0.23 + h, z);
      P.add('turretDark', box(0.045, h * 0.55, 0.022), x + w * 0.28, 0.22 + h * 0.48, z - 0.16);
      P.add('turretDark', box(w - 0.055, 0.026, 0.018), x, 0.27 + h * 0.35, z - 0.158);
      P.add('turretDetail', box(0.035, h * 0.62, 0.020), x - w * 0.22, 0.22 + h * 0.46, z - 0.161);
    }
    for (const [x, y, z, w] of [[-0.72, 0.26, -1.31, 0.20], [-0.34, 0.32, -1.35, 0.16], [0.22, 0.28, -1.37, 0.24], [0.66, 0.34, -1.28, 0.17]]) {
      P.add('turretDark', box(w, 0.055, 0.04), x, y, z);
      P.add('turretDark', box(0.04, 0.18, 0.05), x + w * 0.35, y - 0.07, z + 0.08, 0.18, 0, 0);
    }
    for (const s of [-1, 1]) {
      P.add('turretDark', box(0.05, 0.22, 0.36), s * 0.75, 0.38, -1.15, 0.20, 0, 0);
      P.add('turret', box(0.30, 0.24, 0.38), s * 0.88, 0.22, -0.92);
      P.add('turret', box(0.24, 0.20, 0.30), s * 1.08, 0.20, -0.72, 0, s * 0.20, 0);
      P.add('turretDark', box(0.18, 0.025, 0.24), s * 1.08, 0.315, -0.72, 0, s * 0.20, 0);
    }
  };
  buildT72B87NativeTypedTurretStage7();
  const buildT72B87NativeTypedTurretStage8 = (): void => {
    if (!b3 && !jaguar) {
      // Shallow 1987 stowage bustle: three unequal jerrycan/tool cells sit
      // inside the open rail and return forward into the cast shoulder. The
      // frame stays visibly open and period-correct rather than becoming a
      // modern autoloader box, while rear/quarter views gain real depth.
      for (const [x, w, h, z, yaw] of [
        [-0.56, 0.42, 0.22, -1.17, -0.07],
        [-0.08, 0.38, 0.25, -1.22, 0.02],
        [0.43, 0.48, 0.19, -1.14, 0.08],
      ]) {
        P.add('turret', box(w, h, 0.27), x, 0.25 + h / 2, z, 0, yaw, 0);
        P.add('turretDark', box(w - 0.045, 0.020, 0.22), x, 0.26 + h, z, 0, yaw, 0);
        P.add('turretDark', box(0.038, h * 0.76, 0.23), x - w * 0.39, 0.25 + h * 0.50, z, 0, yaw, 0);
        P.add('turretDetail', box(0.030, h * 0.64, 0.020), x + w * 0.35, 0.25 + h * 0.48, z - 0.145, 0, yaw, 0);
      }
      for (const [x, y, w] of [[-0.72, 0.29, 0.24], [-0.30, 0.34, 0.28], [0.17, 0.30, 0.21], [0.62, 0.35, 0.25]]) {
        P.add('turretDark', box(w, 0.040, 0.032), x, y, -1.38);
        P.add('turretDark', box(0.035, 0.16, 0.035), x + w * 0.36, y - 0.055, -1.34, 0.14, 0, 0);
      }
      P.add('turretDark', cylZ(0.075, 0.30, 12), 0.82, 0.34, -1.22, Math.PI / 2, 0, 0);
      P.add('turretDark', box(0.055, 0.20, 0.22), 0.82, 0.31, -1.12, 0.12, 0, 0);
      // Family-grade terminal rack: unequal shallow rear faces, diagonal
      // cradle legs and two service forms make the bustle read as connected
      // turret equipment from rear and quarter views.  The frame remains open
      // and period-correct; it is not a modern autoloader box.
      for (const [x, w, h, y, rails] of [
        [-0.58, 0.52, 0.21, 0.35, 5],
        [-0.08, 0.38, 0.24, 0.37, 6],
        [0.46, 0.46, 0.18, 0.32, 4],
      ]) {
        P.add('turretDark', box(w, h, 0.030), x, y, -1.48);
        P.add('turretDark', box(0.043, h * 0.90, 0.25), x - w * 0.42, y, -1.35, 0.16, 0, 0);
        P.add('turretDark', box(0.043, h * 0.82, 0.25), x + w * 0.40, y - 0.01, -1.35, -0.14, 0, 0);
        for (let i = 0; i < rails; i++) {
          const rw = w * (0.78 - (i % 3) * 0.065);
          P.add('turretDetail', box(rw, 0.016, 0.022), x + (i % 2 ? 0.015 : -0.012),
            y - h * 0.34 + i * (h * 0.68 / Math.max(rails - 1, 1)), -1.498);
        }
      }
      P.add('turretDark', torus(0.13, 0.015, 18), -0.92, 0.34, -1.49, Math.PI / 2, 0, 0);
      P.add('turret', box(0.24, 0.13, 0.18), 0.82, 0.28, -1.36, 0, 0.12, 0);
      P.add('turretDark', box(0.17, 0.018, 0.13), 0.82, 0.355, -1.36, 0, 0.12, 0);
    }
  };
  buildT72B87NativeTypedTurretStage8();
  const buildT72B87NativeTypedTurretStage9 = (): void => {
    if (b3) {
      // Modern rectangular flank packs and their low carrier rails wrap the
      // cast rear shoulder. Every box has a lid seam and an inboard return;
      // none is left on the hull when the turret traverses.
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const z = -0.42 - i * 0.35;
          P.add('turret', box(0.34, 0.24 - i * 0.02, 0.30), s * (1.18 - i * 0.08), 0.22, z, 0, s * (0.18 + i * 0.08), 0);
          P.add('turretDark', box(0.27, 0.018, 0.23), s * (1.18 - i * 0.08), 0.35 - i * 0.01, z, 0, s * (0.18 + i * 0.08), 0);
          P.add('turretDark', box(0.05, 0.18, 0.27), s * (0.99 - i * 0.03), 0.22, z + 0.02, 0, s * (0.18 + i * 0.08), 0);
        }
      }
      // Broken, backed bustle-service cadence.  The rails return into the
      // existing shoulder packs and the three unequal fields close the blank
      // rear rectangles without becoming a solid duplicate turret wall.
      for (const [x, w, y] of [[-0.54, 0.42, 0.40], [-0.05, 0.47, 0.43], [0.48, 0.36, 0.38]]) {
        P.add('turretDark', box(w, 0.035, 0.035), x, y, -1.345);
        P.add('turretDark', box(w * 0.82, 0.028, 0.030), x, y - 0.11, -1.332);
        P.add('turretDetail', box(0.035, 0.19, 0.035), x - w * 0.38, y - 0.055, -1.327);
        P.add('turretDetail', box(0.035, 0.16, 0.035), x + w * 0.34, y - 0.055, -1.327);
      }
      for (const [x, y, w] of [[-0.70, 0.25, 0.24], [-0.28, 0.29, 0.30], [0.18, 0.24, 0.22], [0.61, 0.30, 0.26]]) {
        P.add('turretDark', box(w, 0.042, 0.032), x, y, -1.365);
        P.add('turretDark', box(0.035, 0.13, 0.035), x + w * 0.36, y - 0.045, -1.335, 0.12, 0, 0);
      }
      // Purposefully unequal shoulder kit breaks the bilateral rear read: a
      // shallow tool roll and short bracketed can on the left, a compact
      // electronics/service cassette on the right, all inside the rail frame.
      P.add('turret', box(0.44, 0.13, 0.18), -0.46, 0.24, -1.20, 0, -0.08, 0);
      P.add('turretDark', box(0.34, 0.020, 0.13), -0.46, 0.315, -1.20, 0, -0.08, 0);
      P.add('turretDark', cylZ(0.075, 0.25, 12), -0.77, 0.31, -1.24, Math.PI / 2, 0, 0);
      P.add('turret', box(0.30, 0.20, 0.20), 0.52, 0.28, -1.18, 0, 0.10, 0);
      P.add('turretDark', box(0.22, 0.018, 0.15), 0.52, 0.39, -1.18, 0, 0.10, 0);
      P.add('turretDetail', box(0.040, 0.16, 0.16), 0.35, 0.28, -1.19, 0, 0.10, 0);
      // Rear-facing faces for the three unequal bustle cells.  These are
      // individually backed and tied forward into the existing boxes so the
      // direct rear reads as supported machinery rather than two blank doors.
      for (const [x, w, h, y, rails] of [
        [-0.57, 0.54, 0.21, 0.34, 5],
        [-0.10, 0.30, 0.25, 0.36, 6],
        [0.43, 0.43, 0.18, 0.31, 4],
      ]) {
        P.add('turretDark', box(w, h, 0.028), x, y, -1.405);
        P.add('turretDark', box(0.045, h * 0.88, 0.20), x - w * 0.42, y, -1.31);
        P.add('turretDark', box(0.045, h * 0.78, 0.20), x + w * 0.40, y - 0.01, -1.31);
        for (let i = 0; i < rails; i++) {
          const rw = w * (0.78 - (i % 3) * 0.07);
          P.add('turretDetail', box(rw, 0.016, 0.022), x + (i % 2 ? 0.018 : -0.012), y - h * 0.34 + i * (h * 0.68 / Math.max(rails - 1, 1)), -1.426);
        }
      }
      P.add('turretDark', cylZ(0.072, 0.12, 12), -0.91, 0.31, -1.43);
      P.add('turretDetail', torus(0.072, 0.012, 12), -0.91, 0.31, -1.495);
      P.add('turretDark', box(0.22, 0.10, 0.035), 0.78, 0.29, -1.425);
      P.add('turretDetail', box(0.11, 0.045, 0.038), 0.80, 0.30, -1.447);
      P.add('turretDark', box(0.34, 0.035, 0.18), -0.21, 0.19, -1.34, 0.18, 0, 0);
      P.add('turretDark', box(0.28, 0.035, 0.16), 0.36, 0.18, -1.33, -0.14, 0, 0);
    }
  };
  buildT72B87NativeTypedTurretStage9();

  // 2A46M: retain the proven run, cast collar, articulation and bore.
  const buildT72B87NativeTypedGunStage1 = (): void => {
    P.gunG.position.set(0, 0.05, 1.23);
    ruSaddle(P, { rollR: 0.19, rollW: 0.56, tubeR: 0.105, rootL: 0.58 });
    P.addGunExtra(nonUniformXform(cylZ(0.5, 0.36, 16, 0.45), 0, 0, 0, 0, 0, 0,
      b3 ? [0.48, 0.28, 1] : jaguar ? [0.57, 0.33, 1] : [0.62, 0.36, 1]),
    0, b3 ? -0.05 : -0.035, b3 ? 0.16 : jaguar ? 0.15 : 0.13);
    P.addGunExtra(box(b3 ? 0.40 : jaguar ? 0.44 : 0.48, b3 ? 0.24 : jaguar ? 0.25 : 0.27, 0.48), 0, -0.02, -0.20);
  };
  buildT72B87NativeTypedGunStage1();
  const muzzleZ = jaguar ? 5.22 : 4.80;
  const buildT72B87NativeTypedGunStage2 = (): void => {
    tubeGun(P, [[0.50, 2.02, 0.112], [2.02, 2.82, 0.122], [2.82, muzzleZ, 0.116]], {
      rings: [[2.02, 0.122], [2.82, 0.121], [3.52, 0.119], [4.24, 0.117]], muzzle: muzzleZ,
    });
    muzzleBore(P, { r: 0.116 });
    P.topY = 1.16;
  };
  buildT72B87NativeTypedGunStage2();
}

export function buildT72B87Native(P: ProfileBuilderPort, variant: T72Variant = 'b87'): void {
  buildT72B87NativeTyped(P as T72BuilderPort, variant);
}


export const T72_PROFILES = {
  t72b3m: {
    build: buildT72B3M2022,
  },
  t72bu: {
    build: buildT72BU1989,
  },
} satisfies VehicleProfileRecord;
