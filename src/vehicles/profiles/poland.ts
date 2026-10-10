import {addEscortFieldKit} from './escortFieldKit.ts';
import {addPL01FieldTurret} from './pl01FieldTurret.ts';
import {ESCORT_FIELD_KITS} from '../escortFieldKitLayout.ts';
import { buildJaguarModern } from './t72ModernVariants.ts';
// Polish armored family — §5.248 GROUND-UP REBUILDS (owner order 2026-08-17:
// "completely new ones built from the ground up doing high quality visual
// AND exact geometric comparison with the 3d models... leclerc highest
// standards"). The previous module cloned complete donor hulls (buildK2 /
// buildT72B87Native / buildPT91M) and overlaid decoration packages; every
// builder below is a fresh §K measured-loft construction against its own
// §5.248 batch-B print (pl01_501st / t72m1_jaguar_manako / pt91a_manako),
// published dims sovereign. Donor GRAMMAR (russia-lane loftHull/dome/tube
// helpers, KIT fittings) is shared per §H family-rig law; donor GEOMETRY is
// not. Measured lines cite the poland-wave vertex workorders (round 1).
//
// The three GLBs remain fixed local visual/metric oracles only; runtime
// playables stay first-party procedural.

import { KIT, FITTINGS, orientedSlab, muzzleBore } from './kit.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
import { addMissionAttachmentReceiver } from '../missionAttachmentReceiver.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import * as THREE from 'three';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import {
  loftHull, meshDomeCurved, ringSkin, tubeGun, ruBoot, mast,
  ruGlacisKit, ruDeck, ruSkirtBand,
} from './russia.ts';
import { mount } from './fittingMount.ts';

type Vec3Tuple = [number, number, number];
type VehicleAssemblyOwner = 'hull' | 'turret';
type PolishWhip = [number, number, number, number, number];
type StripRow = number[];

interface DomeSurfaceSeat {
  readonly x: number;
  readonly z: number;
  readonly nx: number;
  readonly nz: number;
  readonly surfaceGapM: number;
}

interface DisposableResource {
  dispose(): void;
}

interface PolishBuilderMaterials extends Record<string, THREE.Material> {
  hull: THREE.Material;
  canvasCloth: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
}

interface PolishBuilderPort {
  postAssemble: TankBuilderPort['postAssemble'];
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly mats: PolishBuilderMaterials;
  readonly disposables: DisposableResource[];
  readonly spec: {
    readonly id: string;
    readonly armor: { readonly gunPivot: Vec3Tuple };
    readonly visual: { readonly number?: string };
  };
  muzzleZ?: number;
  topY?: number;
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addExternalArmor(owner: VehicleAssemblyOwner, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addCupola(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addEquipment(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  offsetBuckets(names: string | string[], x?: number, y?: number, z?: number): void;
  addMudguard(label: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  decal(
    owner: VehicleAssemblyOwner,
    kind: string,
    label: string,
    scale: number,
    position: Vec3Tuple,
    ...orientation: number[]
  ): void;
  visualEraCluster(
    key: string,
    owner: VehicleAssemblyOwner,
    build: () => void,
  ): void;
}

interface EraCourseOptions {
  readonly bucket?: string;
  readonly dark?: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly right: Vec3Tuple;
  readonly up: Vec3Tuple;
  readonly out: Vec3Tuple;
  readonly cols: number;
  readonly rows: number;
  readonly pitchU: number;
  readonly pitchV: number;
  readonly tileW: number;
  readonly tileH: number;
  readonly tileD: number;
  readonly rx?: number;
  readonly ry?: number;
  readonly rz?: number;
  readonly seams?: boolean;
  readonly skip?: (row: number, column: number) => boolean;
  readonly planSeat?: (position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly row: number;
    readonly col: number;
  }) => Pick<DomeSurfaceSeat, 'x' | 'z'>;
}

interface PolishCupolaOptions {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly r: number;
  readonly ringH?: number;
  readonly lidTop?: number;
  readonly periscopes?: number;
  readonly arc0: number;
  readonly arc1: number;
}

interface FacetedGunHousingStation {
  readonly z: number;
  readonly bottomHalfWidth: number;
  readonly bottomY: number;
  readonly shoulderHalfWidth: number;
  readonly shoulderY: number;
  readonly topHalfWidth: number;
  readonly topY: number;
}

// Connected six-facet gun shroud through independently measured transverse
// stations. The PL-01 housing changes both vertical centre and side rake as
// it leaves the turret, so a uniformly-scaled polyMultiLoft cannot preserve
// the cheek contact ring. Keeping every station in one closed geometry also
// removes the coplanar end caps that made the old three-prism assembly read
// as stacked parts instead of one welded thermal cover.
function facetedGunHousing(
  stations: readonly FacetedGunHousingStation[],
): THREE.BufferGeometry {
  if (stations.length < 2) {
    throw new Error('facetedGunHousing requires at least two stations');
  }
  const rings: Vec3Tuple[][] = stations.map((station) => [
    [-station.topHalfWidth, station.topY, station.z],
    [-station.shoulderHalfWidth, station.shoulderY, station.z],
    [-station.bottomHalfWidth, station.bottomY, station.z],
    [station.bottomHalfWidth, station.bottomY, station.z],
    [station.shoulderHalfWidth, station.shoulderY, station.z],
    [station.topHalfWidth, station.topY, station.z],
  ]);
  const positions: number[] = [];
  const triangle = (a: Vec3Tuple, b: Vec3Tuple, c: Vec3Tuple): void => {
    positions.push(...a, ...b, ...c);
  };
  const normalDot = (
    a: Vec3Tuple,
    b: Vec3Tuple,
    c: Vec3Tuple,
    outward: Vec3Tuple,
  ): number => {
    const ab: Vec3Tuple = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac: Vec3Tuple = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    return (ab[1] * ac[2] - ab[2] * ac[1]) * outward[0]
      + (ab[2] * ac[0] - ab[0] * ac[2]) * outward[1]
      + (ab[0] * ac[1] - ab[1] * ac[0]) * outward[2];
  };
  for (let stationIndex = 0; stationIndex < rings.length - 1; stationIndex++) {
    const rear = rings[stationIndex];
    const front = rings[stationIndex + 1];
    const solidCenter: Vec3Tuple = [
      0,
      (stations[stationIndex].bottomY + stations[stationIndex].topY
        + stations[stationIndex + 1].bottomY + stations[stationIndex + 1].topY) / 4,
      (stations[stationIndex].z + stations[stationIndex + 1].z) / 2,
    ];
    for (let index = 0; index < rear.length; index++) {
      const next = (index + 1) % rear.length;
      const a = rear[index];
      const b = rear[next];
      const c = front[next];
      const d = front[index];
      const faceCenter: Vec3Tuple = [
        (a[0] + b[0] + c[0] + d[0]) / 4,
        (a[1] + b[1] + c[1] + d[1]) / 4,
        (a[2] + b[2] + c[2] + d[2]) / 4,
      ];
      const outward: Vec3Tuple = [
        faceCenter[0] - solidCenter[0],
        faceCenter[1] - solidCenter[1],
        faceCenter[2] - solidCenter[2],
      ];
      if (normalDot(a, b, c, outward) >= 0) {
        triangle(a, b, c);
        triangle(a, c, d);
      } else {
        triangle(a, c, b);
        triangle(a, d, c);
      }
    }
  }
  const cap = (ring: Vec3Tuple[], forward: boolean): void => {
    const center: Vec3Tuple = [
      ring.reduce((sum, point) => sum + point[0], 0) / ring.length,
      ring.reduce((sum, point) => sum + point[1], 0) / ring.length,
      ring[0][2],
    ];
    const outward: Vec3Tuple = [0, 0, forward ? 1 : -1];
    for (let index = 0; index < ring.length; index++) {
      const next = (index + 1) % ring.length;
      if (normalDot(center, ring[index], ring[next], outward) >= 0) {
        triangle(center, ring[index], ring[next]);
      } else {
        triangle(center, ring[next], ring[index]);
      }
    }
  };
  cap(rings[0], false);
  cap(rings[rings.length - 1], true);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0), 2),
  );
  geometry.computeVertexNormals();
  return geometry;
}

// ---------------------------------------------------------------------------
// Shared Polish fittings (fresh authorship — the old clone-package helpers
// are retired with the clones)
// ---------------------------------------------------------------------------

// ERAWA cassette course — the Polish ERA grammar (square shallow cassettes
// with visible rim + bolt, on a real carrier plate; never floating bricks).
// Face-proud <=55 mm; rows follow the carrier plane's own rake.
function erawaCourse(P: PolishBuilderPort, o: EraCourseOptions): void {
  const { box } = KIT;
  const bucket = o.bucket ?? 'hull';
  const owner = bucket.startsWith('hull') ? 'hull' : 'turret';
  P.visualEraCluster(`polish-erawa-${owner}`, owner, () => {
  const dark = o.dark ?? (bucket.startsWith('hull') ? 'hullDark' : 'turretDark');
  const nx = o.cols, ny = o.rows;
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      if (o.skip && o.skip(r, c)) continue;
      const u = (c - (nx - 1) / 2) * o.pitchU;
      const v = (r - (ny - 1) / 2) * o.pitchV;
      // local face frame: right = o.right, up = o.up, out = o.out
      let x = o.x + o.right[0] * u + o.up[0] * v;
      const y = o.y + o.right[1] * u + o.up[1] * v;
      let z = o.z + o.right[2] * u + o.up[2] * v;
      if (o.planSeat) {
        const seat = o.planSeat({ x, y, z, row: r, col: c });
        x = seat.x;
        z = seat.z;
      }
      P.add(bucket, box(o.tileW, o.tileH, o.tileD), x, y, z,
        o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
      if (o.seams !== false) {
        P.add(dark, box(o.tileW * 0.86, o.tileH * 0.86, 0.012),
          x + o.out[0] * (o.tileD * 0.5 + 0.004),
          y + o.out[1] * (o.tileD * 0.5 + 0.004),
          z + o.out[2] * (o.tileD * 0.5 + 0.004),
          o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
      }
    }
  }
  });
}

// Edge-on prism law (GEOMETRY-GATE station-slice visibility): long slab
// strips are subdivided so every ~0.52 m station slab contains real
// cross-section faces. lerp the two profile rows and emit <=maxLen pieces.
function segmentedStrip(
  _P: PolishBuilderPort,
  _bucket: string,
  row0: StripRow,
  row1: StripRow,
  emit: (row0: StripRow, row1: StripRow) => void,
  maxLen = 0.38,
): void {
  const [z0] = row0, [z1] = row1;
  const n = Math.max(1, Math.ceil(Math.abs(z1 - z0) / maxLen));
  for (let k = 0; k < n; k++) {
    const a = row0.map((v, i) => v + ((row1[i] - v) * k) / n);
    const b = row0.map((v, i) => v + ((row1[i] - v) * (k + 1)) / n);
    emit(a, b);
  }
}

// §5.267 fix-round cupola: a REAL T-72-family commander/gunner station —
// ring, domed lid with hinge lug + grab rail, and a RADIAL periscope
// wreath around the ring wall (lateral pokes, not crown spikes — the
// heightM p95 budget stays untouched). lidTop caps the crown absolutely.
function polishCupola(P: PolishBuilderPort, o: PolishCupolaOptions): void {
  const { box, cylY, torus } = KIT;
  const r = o.r;
  P.add('turret', cylY(r, r + 0.02, o.ringH ?? 0.05, 16), o.x, o.y, o.z);
  P.add('turretDark', torus(r + 0.005, 0.012, 16), o.x, o.y + (o.ringH ?? 0.05) / 2 + 0.006, o.z);
  // domed lid: shallow lathe capped at lidTop
  const lidBase = o.y + (o.ringH ?? 0.05) / 2 + 0.008;
  const lidH = Math.max(0.012, (o.lidTop ?? (lidBase + 0.03)) - lidBase);
  P.add('turret', KIT.lathe(
    [[r * 0.94, 0], [r * 0.84, lidH * 0.55], [r * 0.48, lidH * 0.9], [0.02, lidH]], 16),
    o.x, lidBase, o.z);
  // hinge lug + grab rail stay BELOW the lid crown (r-fix receipt: a lug
  // at lidBase+0.02 read heightM 2.213 on pt91 and broke the dims-100 hold)
  P.add('turretDark', box(0.055, 0.020, 0.10), o.x + r * 0.86, o.y + (o.ringH ?? 0.05) / 2 - 0.002, o.z, 0, 0.3, 0);
  P.add('turretDetail', box(0.10, 0.014, 0.02), o.x - r * 0.55, lidBase + lidH * 0.35, o.z + r * 0.35, 0, -0.5, 0);
  // radial periscope wreath on the ring wall
  const n = o.periscopes ?? 4;
  for (let i = 0; i < n; i++) {
    const a = o.arc0 + (i / Math.max(1, n - 1)) * (o.arc1 - o.arc0);
    P.add('turretDark', box(0.055, 0.035, 0.045),
      o.x + Math.sin(a) * (r + 0.035), o.y + 0.012, o.z + Math.cos(a) * (r + 0.035), 0, a, 0);
  }
}

function polishWhips(P: PolishBuilderPort, list: PolishWhip[], seedBase: number): void {
  list.forEach(([x, y, z, h, rake], i) => {
    P.add('turretDetail', KIT.cylY(0.030, 0.040, 0.055, 10), x, y, z);
    mount(P, 'turret', FITTINGS.antennaWhip({
      mats: P.mats, h, r: 0.011, rake, seed: seedBase + i,
    }), x, y + 0.028, z);
  });
}

// ===========================================================================
// PT-91A TWARDY — ERAWA-1/2 coverage, Polish bins, PCO sights, WKM-B.
// Print: pt91a_manako.glb (misc_a/misc_b split). _vlo AUDIT (this round):
// chassis_vlo is a whole-vehicle LOD shell riding the HULL node — it bakes
// the at-rest turret AND the full gun into every hull mask (ref side_hull
// carries the tube band 1.84..1.56 out to z 6.25 and turret tops 2.07-2.46
// across the works band; stations z-range inflates to ~10 m). hullCurves /
// stations / front_hull are certified-capped until the orchestrator lands
// the chassis_vlo excision (normalize plan reported in the packet). Whole +
// turret rows and dims/floaters are honest and are the round's targets.
// Measured (workorder r1, absolute): rear rack 1.31-1.40 to -3.71, engine
// tops 1.45-1.56 z -3.15..-2.03, bustle 2.04-2.07 z -1.58..-1.14, mast
// spike 3.52 @ -1.02, dome band 2.13-2.29 z -0.8..-0.13, cupola crest
// 2.46-2.60 z -0.02..+0.43, ERA wedge fall 2.52-2.46 z 0.43..1.66, IR spike
// 2.54 @ 1.44, tube band 1.84..1.56/1.62 to muzzle 6.25, plan: hull edge
// ±1.75, fender fronts 3.84 (PRINT-LONG vs published hull 6.95 — capped),
// rear -3.54 with drum slivers -3.62..-3.68, turret shoulders ±1.50-1.52,
// wedge tips plan 1.72 @ |x| 0.5-0.6, evacuator col +0.18 to 4.71.
// Published sovereign: hull 6.95 (body -3.41..+3.54, mid 0.065 = the
// polluted-registration counterweight), overall 9.67 (rear drums -3.42 ->
// muzzle 6.25 — the print's own muzzle), width 3.59, height 2.19 (dome
// crown 2.19; mast+cupola spikes <=4 columns at the ref's own zones).
// ===========================================================================

function addPt91PowerpackLouvres(P: PolishBuilderPort): void {
  for (let index = 0; index < 5; index++) {
    const z = -1.06 - index * 0.21;
    P.add('hullDark', KIT.box(1.46, 0.016, 0.14), 0, 1.494, z);
    P.add('hullDetail', KIT.box(1.50, 0.030, 0.038), 0, 1.498, z + 0.09);
  }
}

function buildPT91Twardy(P: PolishBuilderPort): void {
  const { box, cylX, cylY, cylZ, torus, buildRunningGear } = KIT;

  // ---- hull loft (published envelope, ref engine-stack cadence) ----------
  loftHull(P, {
    deck: [[-3.41, 1.30], [-3.24, 1.43], [-3.00, 1.50], [-2.62, 1.555],
      [-2.06, 1.555], [-1.90, 1.50], [-0.80, 1.475], [1.10, 1.49],
      [2.00, 1.40], [2.30, 1.335], [2.55, 1.29], [3.05, 1.13], [3.54, 1.00]],
    belly: [[-3.41, 0.84], [-3.14, 0.55], [-2.68, 0.43], [2.30, 0.43],
      [2.92, 0.56], [3.54, 0.78]],
    wUp: [[-3.41, 1.63], [2.60, 1.63], [3.18, 1.32], [3.54, 1.02]],
    wLo: [[-3.41, 0.97], [2.50, 0.97], [3.54, 0.80]],
    sponsonY: 1.14,
  });

  // bow corner fenders carry the plan front outboard of the center V
  for (const s of [-1, 1]) {
    P.add('hull', box(0.62, 0.13, 0.42), s * 1.40, 1.09, 3.30);
    P.add('hullRubber', box(0.58, 0.15, 0.04), s * 1.38, 0.93, 3.52);
    P.add('hullDark', box(0.03, 0.05, 0.44), s * 1.755, 1.235, 3.28);
    P.add('hull', box(0.16, 0.05, 5.7), s * 1.70, 1.215, 0.30);
    // fender-slot §B2 floor: a REAL dark slot plate riding 6 cm above the
    // idler wrap arc at its z (strict clip audit proof; the v2 hole scan
    // hides /shadow/ meshes so the leclerc shadow device cannot close B2)
    P.add('hullDark', box(0.24, 0.01, 0.28), s * 1.53, 1.10, 3.00);
  }

  // ---- running gear: T-72 stance centered on the 0.065 body mid ----------
  const wheelZs = [-1.95, -1.13, -0.31, 0.51, 1.33, 2.15];
  // owner 2026-09-22 ("pt 91 m … wheels too big … overlap each other"): r 0.455 on the 0.82 pitch
  // overlapped by 9 cm and both end wheels sat 35-39 cm inside the outer road wheels. Six 750 mm
  // T-72 wheels (2R/pitch 0.91, a 7 cm gap), the end wheels moved out to clear them. FSP-03 2026-09-25:
  // the T-72 family carries three return rollers per side (FAS T-72 entry) — stationed by the T-90A X
  // source law, r 0.10, the axle fitted under the measured 1.14 lane ceiling.
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.375, wheelW: 0.23, wheelY: 0.47, xc: 1.37,
    dishR: 0.79, wheelZs,
    sprocket: { z: -2.64, y: 0.68, r: 0.32 },
    idler: { z: 2.82, y: 0.69, r: 0.30 },
    contactZF: 2.26, contactZR: -2.02,
    rollers: [-1.76, 0.16, 1.80].map((z) => ({ z, y: 0.935, r: 0.10 })),
    trackW: 0.56, topY: 1.00, botY: 0.025, paintedEnds: true,
    coveredTop: true, arms: true,
  });

  // The smart running-gear builder owns the complete road-wheel face stack.
  // Do not add a second static disc/inset layer here: it would remain hull-
  // fixed while the suspension instances move and visibly double the wheels.

  // ---- skirts: ERAWA-1 armored forward third + rubber run (±1.795) -------
  P.visualEraCluster('polish-erawa-hull-skirt', 'hull', () => {
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        P.add('hull', box(0.065, 0.36, 0.60), s * 1.7625, 1.02, 2.02 - k * 0.64,
          0, 0, s * (k % 2 ? 0.015 : -0.012));
        P.add('hullDark', box(0.018, 0.28, 0.025), s * 1.797, 1.02, 2.32 - k * 0.64);
      }
    }
  });
  ruSkirtBand(P, {
    x: 1.775, th: 0.04, z0: -2.02, z1: 0.10, yTop: 1.20, yBot: 0.74,
    panels: 4, dressIn: 0.03,
  });

  // ---- ERAWA-1 glacis field on the plate rake + bow kit -------------------
  erawaCourse(P, {
    x: 0, y: 1.255, z: 2.28, right: [1, 0, 0], up: [0, 0.30, -0.954],
    out: [0, 0.954, 0.30], cols: 9, rows: 3, pitchU: 0.292, pitchV: 0.285,
    tileW: 0.27, tileH: 0.26, tileD: 0.05, rx: -1.265,
    skip: (r, c) => r === 2 && c >= 3 && c <= 5,
  });
  ruGlacisKit(P, { w: 3.30, y: 1.18, z: 2.66, eyeX: 0.96, eyeZ: 2.98,
    eyeSplit: true, hookY: 0.92, hookZ: 3.10, lights: false });
  for (const s of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({ nightKind: 'headlight',
      mats: P.mats, pods: 2, spacing: 0.10, r: 0.042,
      shield: true, seed: 9351 + (s > 0 ? 1 : 0),
    }), s * 1.16, 1.22, 2.52, [-0.30, 0, 0]);
  }
  P.add('hull', box(2.24, 0.045, 0.15), 0, 1.335, 2.50, -0.30, 0, 0);
  ruDeck(P, { deckY: 1.475, hatchX: -0.40, hatchZ: 1.86, gz: -0.95,
    grilles: 4, gw: 1.48, periY: 1.45, gY: 1.50 });
  // §5.267 fix 3: real louvre relief over the powerpack run (sunk wells +
  // rib bars; relief tops +0.012 over the local deck line — mask-safe)
  addPt91PowerpackLouvres(P);
  for (const s of [-1, 1]) P.add('hull', box(0.06, 0.034, 1.15), s * 0.77, 1.496, -1.48);

  // Malaysian-lineage powerpack stack cadence over the rear deck
  for (const s of [-1, 1]) {
    P.add('hull', box(0.50, 0.11, 0.98), s * 0.86, 1.575, -2.58);
    P.add('hullDark', box(0.42, 0.02, 0.88), s * 0.86, 1.64, -2.58);
  }
  P.add('hull', box(0.56, 0.09, 1.00), 0, 1.565, -2.60);
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(1.98, 0.024, 0.05),
    0, 1.585, -2.24 - k * 0.22);

  // ---- rear service load: transverse drums + rack (rear extreme -3.42) ---
  // §5.267 fix 2: the drums READ AS CYLINDERS now — camo steel bodies (the
  // r1 hullWood tone fused them into a tan plank band), dark end rings +
  // hub bosses, steel straps over the crowns; the solid backing plate is
  // replaced by an open rail frame (verticals + the 3 rails) so the round
  // bodies stay visible from dead-rear.
  for (const s of [-1, 1]) {
    P.add('hull', cylX(0.235, 0.74, 18), s * 0.55, 1.16, -3.18);
    for (const rx of [-0.17, 0, 0.17]) P.add('hullDark', cylX(0.244, 0.018, 18),
      s * (0.55 + rx), 1.16, -3.18);
    for (const e of [-1, 1]) {
      P.add('hullDark', cylX(0.238, 0.014, 18), s * 0.55 + e * 0.365, 1.16, -3.18);
      P.add('hullDetail', cylX(0.09, 0.018, 12), s * 0.55 + e * 0.376, 1.16, -3.18);
    }
    P.add('hull', box(0.48, 0.13, 0.22), s * 0.55, 0.98, -3.10);
    P.add('hullDetail', box(0.03, 0.47, 0.022), s * 0.55, 1.17, -3.415); // crown strap
  }
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(1.80, 0.032, 0.035),
    0, 1.00 + k * 0.11, -3.40);
  for (let k = 0; k < 5; k++) P.add('hullDetail', box(0.035, 0.30, 0.035),
    -0.90 + k * 0.45, 1.11, -3.40);
  // §5.267 fix 2: round log read — risers keep it proud. 2026-10-07 (tank-accessories round 3: "the unditching log is
  // a smooth green pipe"): the clone's green-grey 0x4a4636 became a dark bark brown, and the scheme-painted end discs
  // that capped the sawn ends in hull green gave way to the shared log's own pale end grain. Round 4 (wave 216: "a
  // smooth brown tub"): the shared fitting log carries its own furrowed bark and baked wood colours in the log wood, so
  // the dark wood clone goes.
  mount(P, 'hull', FITTINGS.unditchingLog({
    mats: P.mats,
    len: 2.10, r: 0.115, straps: 3, seed: 9301,
  }), 0, 1.44, -3.30);
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.04, 0.09, 0.10), s * 0.80, 1.36, -3.30);
  }

  // ---- turret: measured dome + ERAWA-2 wedges + Polish stations -----------
  // pivot [0,1.38,0.02]; dome crown world 2.19 (published height), base 1.50
  const rings = [
    [1.22, 0.12], [1.26, 0.24], [1.18, 0.46], [1.00, 0.64],
    [0.72, 0.755], [0.38, 0.80], [0.03, 0.81],
  ];
  meshDomeCurved(P, rings, 0.98, 0, -0.08, { capR: 1.85 });
  // bustle (ref 2.04-2.07 band z -1.58..-1.14 -> local -1.60..-1.16)
  P.add('turret', box(1.52, 0.40, 0.50), 0, 0.46, -1.35);
  P.add('turret', box(1.10, 0.30, 0.22), 0, 0.42, -1.66, 0.12, 0, 0);
  P.add('turretDark', box(1.42, 0.28, 0.035), 0, 0.44, -1.625);
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 1.64, d: 0.38, h: 0.16, fill: 0.36, rails: 3, seed: 9311,
  }), 0, 0.56, -1.38);
  // the distinctive Polish flank bins (both cheek-rears, lidded)
  for (const s of [-1, 1]) {
    P.add('turret', box(0.22, 0.34, 0.88), s * 1.30, 0.40, -0.62, 0, s * 0.14, 0);
    P.add('turretDark', box(0.20, 0.02, 0.80), s * 1.315, 0.585, -0.64, 0, s * 0.14, 0);
    P.add('turretDetail', box(0.03, 0.10, 0.05), s * 1.42, 0.42, -0.30, 0, s * 0.14, 0);
  }

  // ERAWA-2 wedge cheeks — plan tips at the measured 1.72 line (|x| 0.5-0.6),
  // faces falling 2.52 -> 2.46 over z 0.43..1.66 (world)
  for (const s of [-1, 1]) {
    P.add('turret', orientedSlab(
      [s * 0.20, 0.16, 1.66], [s * 1.06, 0.14, 1.02], [s * 1.24, 0.16, 0.28], [s * 0.30, 0.18, 0.60],
      [s * 0.18, 0.70, 1.34], [s * 0.96, 0.66, 0.82], [s * 1.14, 0.64, 0.22], [s * 0.28, 0.70, 0.48]));
    erawaCourse(P, {
      bucket: 'turret',
      x: s * 0.64, y: 0.42, z: 1.10, right: [s * 0.50, 0, -0.60],
      up: [0, 0.94, 0.24], out: [s * 0.66, 0.30, 0.60],
      cols: 3, rows: 2, pitchU: 0.315, pitchV: 0.25,
      tileW: 0.28, tileH: 0.22, tileD: 0.05,
      ry: s * 0.66, rx: -0.20,
    });
  }
  // roof ERAWA-1 singles behind the wedges (the Twardy roof course)
  erawaCourse(P, {
    bucket: 'turret', x: 0, y: 0.7825, z: 0.10, right: [1, 0, 0], up: [0, 0.06, -1],
    out: [0, 1, 0.06], cols: 4, rows: 1, pitchU: 0.30, pitchV: 0.26,
    tileW: 0.27, tileH: 0.045, tileD: 0.26, seams: false,
  });
  // §5.267 fix 1: the FRONT-SECTOR ERAWA CARPET — the print wraps the whole
  // dome nose in the square-cassette grid (my r1 build carried wedges +
  // cheek patches only, bare nose/roof between). Two dome-skin arcs seated
  // by ringSkin + two forward-roof rows; every crown stays under the 2.19
  // grace band (tops <=0.80 local).
  {
    // the arcs ride the bare upper-nose band ABOVE the ERAWA-2 wedge tops
    // (~0.68 local) and below the crown — the exact band the critic sheet
    // shows carpeted on the print and bare on r1
    const arcs = [
      { y: 0.58, rows: 1, tile: [0.24, 0.20, 0.05], n: 7, a0: -0.95, a1: 0.95 },
      { y: 0.688, rows: 1, tile: [0.22, 0.16, 0.045], n: 5, a0: -0.72, a1: 0.72 },
    ];
    for (const arc of arcs) {
      const r = ringSkin(rings, arc.y) - 0.012;
      for (let i = 0; i < arc.n; i++) {
        const a = arc.a0 + (i / (arc.n - 1)) * (arc.a1 - arc.a0);
        const cx = Math.sin(a) * r * 0.99;
        const cz = Math.cos(a) * r * 0.98 - 0.08;
        // dome slope tilt at this band (outward lean follows the profile)
        P.add('turret', box(arc.tile[0], arc.tile[1], arc.tile[2]),
          cx, arc.y + 0.02, cz, -0.38, a, 0);
        // seam plate rides the tile FACE (outward), not its crown — the
        // +0.032 y-lift version topped 2.202 and owned heightM's 4th column
        P.add('turretDark', box(arc.tile[0] * 0.86, arc.tile[1] * 0.86, 0.012),
          cx + Math.sin(a) * 0.034, arc.y + 0.008, cz + Math.cos(a) * 0.034, -0.38, a, 0);
      }
    }
    // forward-roof carpet rows (flat tiles lying on the crown fall)
    erawaCourse(P, {
      bucket: 'turret', x: 0, y: 0.745, z: 0.62, right: [1, 0, 0], up: [0, -0.10, -0.995],
      out: [0, 0.995, -0.10], cols: 4, rows: 1, pitchU: 0.27, pitchV: 0.24,
      tileW: 0.25, tileH: 0.05, tileD: 0.23, rx: 0.10, seams: false,
    });
    erawaCourse(P, {
      bucket: 'turret', x: 0, y: 0.775, z: 0.38, right: [1, 0, 0], up: [0, -0.04, -1],
      out: [0, 1, -0.04], cols: 5, rows: 1, pitchU: 0.27, pitchV: 0.24,
      tileW: 0.25, tileH: 0.045, tileD: 0.23, seams: false,
    });
  }

  // stations: commander cupola with a REAL lid (§5.267 fix 4 — crown holds
  // 2.205 world, inside the 2.212 grace edge so dims 100 HOLDS) + radial
  // periscope wreath on the ring wall; the print's broad 2.46-2.60 crest
  // stays certified print-tall
  // (r-fix receipt: the cupola cluster at y 0.78 kept the p95 4th column
  // at 2.2124 — the whole station sinks 12 mm so every wide top holds
  // <=2.196 and the dims-100 constraint keeps real margin)
  polishCupola(P, { x: -0.36, y: 0.768, z: 0.10, r: 0.29, ringH: 0.05,
    lidTop: 0.806, periscopes: 5, arc0: -0.6, arc1: 2.4 });
  // loader/gunner hatch: flush seam ring + handles (no crown budget left)
  P.add('turretDark', torus(0.21, 0.012, 14), 0.42, 0.792, -0.38);
  P.add('turretDetail', box(0.09, 0.018, 0.025), 0.42, 0.80, -0.16);
  P.add('turretDetail', box(0.025, 0.018, 0.09), 0.62, 0.80, -0.38);
  // WKM-B 12.7 low-slung on the right dome shoulder (pt91m NSVT precedent —
  // receiver under the crown line; r1/r2 dims receipts: crown-top stations
  // read heightM 2.45-2.47). Pedestal ring seats it on the dome skin.
  // 2026-10-07 (tank-accessories round 4, wave 216: "seen from above, no MG reads on the roof, only a thin rod"; "a
  // pintle that is a bare cylinder, with no ring, box or belt"): the pedestal widens into a ring mount (a turned base
  // with its machined ring on brackets, the gun's `ring`), and the WKM-B takes the NSVT's own construction with its
  // box hung outboard (the NSV feeds from either side; inboard the box would sit in the dome) and the mount's
  // collimator inboard, so the box, its belt and the long receiver read from the hero and turret-top cameras.
  P.add('turretDark', cylY(0.16, 0.19, 0.09, 16), 1.00, 0.585, -0.30);
  mount(P, 'turret', FITTINGS.pintleMG({
    mats: P.mats, cls: 'nsvt', tone: 'two-tone', scale: 1.0,
    ammo: true, seed: 9321, feed: 'left', reflexSight: true, ring: { r: 0.155, stubs: 3 },
  }), 1.00, 0.605, -0.30, [0, -0.08, 0]);

  // PCO SKO-1M/Drawa-T sight suite (gunner right-front, hooded) + commander
  // POD-72 head — the Polish optical identity (crowns at the dome band)
  P.add('turretDetail', box(0.34, 0.22, 0.34), 0.52, 0.70, 0.66);
  P.add('turretDark', box(0.26, 0.13, 0.03), 0.52, 0.72, 0.845);
  P.add('turretGlass', box(0.18, 0.08, 0.02), 0.52, 0.72, 0.862);
  P.add('turretDetail', box(0.26, 0.14, 0.22), -0.36, 0.735, -0.38);
  P.add('turretDark', box(0.20, 0.08, 0.025), -0.36, 0.745, -0.265);
  // IR/searchlight block right of the mantlet (ref spike 2.54 @ z 1.44)
  P.add('turretDetail', box(0.30, 0.30, 0.26), 0.58, 0.56, 1.28);
  P.add('turretDark', box(0.24, 0.24, 0.03), 0.58, 0.56, 1.425);

  // met mast — the ref's own 3.52 @ z -1.02 spike (thin, one column).
  // Seated at the ref's own station on a real pedestal cone rising from the
  // dome skin (r1 floater receipt: the bare 0.81 base floated 0.46 above
  // the falling dome at yaw 90).
  P.add('turret', KIT.frustum(0.10, -0.96, -1.16, 0.05, -1.01, -1.11, 0.30, 0.76), -0.55, 0, 0);
  mast(P, -0.55, 0.74, -1.06, 2.06, 0.023, 0.09);

  // Tellur smoke banks on the LEFT cheek (the print's asymmetric tell) +
  // a compact right pair
  mount(P, 'turret', FITTINGS.smokeBank({
    mats: P.mats, count: 6, r: 0.042, len: 0.28, splay: -1.05, pitch: -0.44,
    arc: 0.60, spacing: 0.10, slot: 'detail', rotation: [0, 0, 0.10], seed: 9331,
  }), -1.12, 0.52, 0.30);
  mount(P, 'turret', FITTINGS.smokeBank({
    mats: P.mats, count: 3, r: 0.042, len: 0.28, splay: 1.05, pitch: -0.44,
    arc: 0.42, spacing: 0.10, slot: 'detail', rotation: [0, 0, -0.10], seed: 9332,
  }), 1.16, 0.50, 0.44);
  // conformal antenna bases only (r-fix receipt: the 0.20/0.17 stubs'
  // AA-faded tips floated heightM's 4th p95 column at 2.2016-2.2124
  // phase-dependent — the dims-100 hold needs every read <=2.2119; the
  // rods now stop under the 2.19 crown line)
  polishWhips(P, [[-0.98, 0.62, -1.30, 0.065, -0.05], [1.00, 0.62, -1.20, 0.055, 0.06]], 9341);

  // ---- gun: 2A46MS with thermal sleeve, evacuator, measured muzzle 6.25 ---
  // axis world 1.70 (pivot 1.38 + 0.32); local muzzle 5.73
  ruBoot(P, { pts: [[0.30, 0.64, 0.54, 0.00], [0.64, 0.48, 0.42, 0.01], [0.98, 0.33, 0.31, 0.015]] });
  tubeGun(P, [
    [0.98, 2.50, 0.122, 0.118],
    [2.50, 3.80, 0.118, 0.114],
    [3.80, 4.19, 0.114, 0.112],
    [4.19, 4.66, 0.172, 0.162],          // evacuator (plan col +0.18 to 4.71)
    [4.66, 5.60, 0.110, 0.106],
    [5.60, 5.73, 0.114, 0.114],
  ], { rings: [[2.50, 0.124], [3.80, 0.118], [4.19, 0.176], [4.66, 0.114]], muzzle: 5.73 });
  muzzleBore(P, { r: 0.099, boreR: 0.063 });
  P.addGunExtraDark(cylZ(0.032, 0.10, 10), 0.30, 0.11, 0.55);
  P.decal('turret', 'number', 'PT-91', 0.24, [-1.32, 0.42, -0.98], -Math.PI / 2);
  P.decal('turret', 'number', 'PT-91', 0.24, [1.32, 0.42, -0.98], Math.PI / 2);
  addVehicleGhillieSuit(P);
  addMissionAttachmentReceiver(P, 'pt91_twardy');
  P.topY = Math.max(P.topY || 0, 1.35);
}

// ===========================================================================
// PL-01 — the faceted stealth demonstrator (OBRUM/BAE concept).
// Print: pl01_501st.glb (semantic, untextured, hull 6.95 native EXACT;
// authored-look — trusted for identity + facet grammar). Followers row
// completed this round (sight mast / EO heads / RWS shields / gun thermal
// cover were stranded in the hull mask).
// Measured (workorder r1, absolute): hull body -3.505..+3.425 (plan rear
// -3.49, nose V 3.41 center / 3.38 to ±1.635 / 3.29 @ ±1.725 / 3.05 @
// ±1.845), skirt face silhouette: top 2.065 (rear) / 2.04 / 2.01 / 1.98
// falling to the (3.44, 1.44) bow tip, bottom 0.26 with bow chamfer
// (2.30,0.28)->(3.44,1.44) and stern chamfer (-2.35,0.28)->(-3.505,1.44),
// outer-face bevels (front view): top edge 2.10@|x|1.62 -> 1.96@1.87,
// bottom 0.62@1.67 -> 1.27@1.87; belly 0.32 between tracks. Turret diamond:
// roof 2.79 (z -3.16..+0.44), nose tip (0.98, ~2.55), tail wedge to
// (-3.60, 2.37), base plane 2.07; plan nose (±0.405, 0.98) ->
// shoulders (±1.487, -0.88..-1.18) -> tail (±0.405, -3.58); RWS field
// 3.30-3.39 over z -2.44..-0.88 (PRINT-TALL vs published heightM 2.80 —
// only the ref's own -2.44..-2.08 spike window is matched, remainder
// certified-capped), sight-mast head 3.00 @ z 0.08-0.20 (capped to the
// published band), gun cover 2.52->2.43 to z 3.91, bare tube 2.34..2.16 to
// the print's short 4.88 muzzle (published overall wins: muzzle 5.36).
// Published sovereign: hull 6.95, overall 8.96 (tail -3.60 -> muzzle 5.36),
// width 3.80 (skirt outer faces ±1.90), height 2.80 (roof 2.79 p95; the
// RWS window is the <=4-column spike budget).
// 7 roadwheels + raised idler/sprocket behind full skirts (print: road pairs
// r 0.337 @ y 0.38, pitch 0.72 from z 2.166 to -2.154; idler (2.99, 0.956);
// sprocket (-2.80, 0.732); track band x 1.00..1.56, top 1.286).
// ===========================================================================

interface PL01BuildContext {
  readonly is105: boolean;
  readonly equipmentHeightScale: number;
  readonly previousRoofLocalY: number;
  readonly turretHeightScale: number;
  readonly turretRoofLocalY: number;
  readonly shellY: (y: number) => number;
  readonly roofEquipmentY: (y: number) => number;
  readonly gunAssemblyY: (y: number) => number;
  readonly upperGlacisY: (z: number) => number;
  readonly driverDeckY: (z: number) => number;
  readonly glacisPitch: number;
}

function createPL01BuildContext(P: PolishBuilderPort): PL01BuildContext {
  const is105 = P.spec.id === 'pl01_105';
  const equipmentHeightScale = 0.60;
  const previousTurretHeightScale = equipmentHeightScale * 1.20;
  const turretHeightScale = previousTurretHeightScale * 1.20;
  const originalRoofLocalY = 0.72;
  const previousRoofLocalY = originalRoofLocalY * previousTurretHeightScale;
  const turretRoofLocalY = originalRoofLocalY * turretHeightScale;
  const roofLiftLocalY = originalRoofLocalY
    * (turretHeightScale - equipmentHeightScale);
  const shellY = (y: number): number => y * turretHeightScale;
  // Turret fittings keep their approved physical proportions and translate
  // upward with the new roof instead of stretching with the armor shell.
  const roofEquipmentY = (y: number): number => y * equipmentHeightScale + roofLiftLocalY;
  // The complete gun plant is reseated by its rig pivot. Its local sleeve,
  // coax, and thermal-cover offsets remain unchanged so the weapon itself is
  // not distorted by the structural height increase.
  const gunAssemblyY = (y: number): number => y * equipmentHeightScale;
  const upperGlacisY = (z: number): number => 1.975 + (z - 1.30) * ((1.46 - 1.975) / (3.425 - 1.30));
  const driverDeckY = (z: number): number => z <= 1.30
    ? 2.02 + (z - 0.50) * ((1.975 - 2.02) / (1.30 - 0.50))
    : upperGlacisY(z);
  const glacisPitch = Math.atan((1.975 - 1.46) / (3.425 - 1.30));
  P.turretG.userData.pl01TurretHeightScale = turretHeightScale;
  P.turretG.userData.pl01RoofLocalY = turretRoofLocalY;
  return {
    is105,
    equipmentHeightScale,
    previousRoofLocalY,
    turretHeightScale,
    turretRoofLocalY,
    shellY,
    roofEquipmentY,
    gunAssemblyY,
    upperGlacisY,
    driverDeckY,
    glacisPitch,
  };
}

function addPL01HullBody(P: PolishBuilderPort, context: PL01BuildContext): void {
  const { box } = KIT;
  const { upperGlacisY } = context;
  const slab = orientedSlab;
  // ---- center hull body (x ±1.616): tub + faceted glacis ------------------
  // deck line = the measured falling top run (side_hull tops 2.07 rear ->
  // 1.98 at the z 1.88 fold; the flat 2.10 plateau lives aft of -1.5 only)
  // loft rear face stops at the -3.35 center inset (the print's plan notch:
  // rear -3.49 only at |x| 0.55..1.72, center -3.33) — the rear WINGS below
  // carry the -3.505 plate + boat-tail
  loftHull(P, {
    deck: [[-3.35, 2.095], [-1.50, 2.065], [-0.45, 2.04], [0.50, 2.02],
      [1.30, 1.975], [3.425, 1.46]],
    // stern boat-tails (r3/r6 receipts: the print's rear bottoms rise
    // 0.63 @ -3.23 -> 1.21 @ -3.43 -> 1.46 @ -3.53)
    belly: [[-3.35, 0.92], [-3.10, 0.50], [-2.85, 0.34], [-2.60, 0.30],
      [2.35, 0.30], [2.90, 0.76], [3.425, 1.29]],
    // containment (leclerc glacis-taper precedent + this round's strict
    // sweep 3445): the ascending idler band crosses the glacis plane past
    // z~2.6 — the full-width plate tapers to ±0.94 there; the lower band
    // stays inboard of the 0.955 course wall; the sponson floor rides above
    // the 1.45 return-strand shoe crowns.
    wUp: [[-3.35, 1.616], [2.55, 1.616], [2.66, 0.94], [3.425, 0.90]],
    wLo: [[-3.35, 0.94], [3.425, 0.86]],
    sponsonY: 1.47,
  });
  // The bow is one continuous raised wedge. Its center prow meets the skirt
  // shoulders at y=1.46 instead of collapsing beneath them. FULL WIDTH only
  // continues to z 2.60 —
  // past it the plate tapers to ±0.94 (leclerc containment precedent: the
  // ascending idler band crosses the plane there; the plan bow at |x|
  // 0.96..1.60 is carried by the course itself, exactly like the print).
  segmentedStrip(P, 'hull',
    [2.60, upperGlacisY(2.60) - 0.045, 2.60, upperGlacisY(2.60), 1.616],
    [1.33, 1.90, 1.30, 1.975, 1.616],
    ([zb0, yb0, zt0, yt0, w0], [zb1, yb1, zt1, yt1, w1]) => {
      P.add('hull', slab(
        [-w0, yb0, zb0], [w0, yb0, zb0], [w1, yb1, zb1], [-w1, yb1, zb1],
        [-w0, yt0, zt0], [w0, yt0, zt0], [w1, yt1, zt1], [-w1, yt1, zt1]));
    });
  segmentedStrip(P, 'hull',
    [3.30, 1.29, 3.425, 1.46, 0.94],
    [2.60, upperGlacisY(2.60) - 0.045, 2.60, upperGlacisY(2.60), 0.94],
    ([zb0, yb0, zt0, yt0, w0], [zb1, yb1, zt1, yt1, w1]) => {
      P.add('hull', slab(
        [-w0, yb0, zb0], [w0, yb0, zb0], [w1, yb1, zb1], [-w1, yb1, zb1],
        [-w0, yt0, zt0], [w0, yt0, zt0], [w1, yt1, zt1], [-w1, yt1, zt1]));
    });
  for (const s of [-1, 1]) {
    // Raised central nose carrier follows the same front datum as the skirts.
    segmentedStrip(P, 'hull',
      [3.415, 1.435, 3.37, 1.40, 3.10, 3.10],
      [2.30, upperGlacisY(2.30) - 0.035, 2.26, upperGlacisY(2.26) - 0.055, 1.62, 1.62],
      ([zA0, yA0, zB0, yB0, zAr0, zBr0], [zA1, yA1, zB1, yB1, zAr1, zBr1]) => {
        P.add('hull', slab(
          [s * 0.30, yA0, zA0], [s * 0.94, yB0, zB0], [s * 0.94, yB0, zBr0], [s * 0.30, yA0, zAr0],
          [s * 0.30, yA1, zA1], [s * 0.94, yB1, zB1], [s * 0.94, yB1, zBr1], [s * 0.30, yA1, zAr1]));
      });
    // Bridge the tapered center plate to the skirt bow without daylight gaps.
    P.add('hull', slab(
      [s * 0.90, upperGlacisY(2.60) - 0.055, 2.60], [s * 1.62, 1.655, 2.60],
      [s * 1.66, 1.42, 3.44], [s * 0.86, 1.29, 3.425],
      [s * 0.90, upperGlacisY(2.60), 2.60], [s * 1.62, 1.73, 2.60],
      [s * 1.66, 1.46, 3.44], [s * 0.90, 1.46, 3.425]));
  }
  // rear: the print's plan reads -3.49 rear ONLY on the |x| 0.55..1.65
  // wings; the center |x|<0.47 is an inset -3.33 panel with the service
  // door (r6 plan receipt: a full-width -3.505 plate read the center cols
  // 0.17 too far aft). Wings carry the boat-tail rake (1.36 @ -3.505 ->
  // 0.64 @ -3.30 measured).
  for (const s of [-1, 1]) {
    P.add('hull', slab(
      [s * 0.42, 1.47, -3.505], [s * 1.616, 1.47, -3.505], [s * 1.616, 0.70, -3.32], [s * 0.42, 0.70, -3.32],
      [s * 0.42, 2.09, -3.505], [s * 1.616, 2.09, -3.505], [s * 1.616, 2.09, -3.32], [s * 0.42, 2.09, -3.32]));
  }
  // center inset panel (door bay) + its shallow boat-tail
  P.add('hull', slab(
    [-0.47, 1.02, -3.345], [0.47, 1.02, -3.345], [0.47, 0.70, -3.20], [-0.47, 0.70, -3.20],
    [-0.47, 2.09, -3.345], [0.47, 2.09, -3.345], [0.47, 2.09, -3.20], [-0.47, 2.09, -3.20]));
  P.add('hullDark', box(0.60, 0.60, 0.02), 0.10, 1.55, -3.352);  // door seam
  for (const dy of [0, 0.26]) P.add('hullDetail', box(0.05, 0.14, 0.05),
    0.11, 1.42 + dy, -3.342);
  P.add('hullDetail', box(0.24, 0.05, 0.05), -0.55, 1.92, -3.49);
  P.add('hullDark', box(0.92, 0.26, 0.03), -0.98, 1.60, -3.508); // grille (left wing)
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(0.86, 0.028, 0.026),
    -0.98, 1.50 + k * 0.075, -3.515);
}

function addPL01SkirtsAndRunningGear(P: PolishBuilderPort, context: PL01BuildContext): void {
  const { box, buildRunningGear } = KIT;
  const { glacisPitch, is105, upperGlacisY } = context;
  const slab = orientedSlab;
  // ---- full-height faceted stealth skirts (widthM anchor ±1.90) -----------
  // Measured cross-section (r1/r3 front receipts): inner hanging wall
  // (hem 0.27, x <=1.66), lower out-lean bevel (1.66, 0.60) -> (1.90, 1.30),
  // vertical face band at 1.90 (1.30..top-0.14), top in-lean bevel back to
  // the deck edge (1.62, top). Bow chamfer (2.90, 0.30) -> (3.44, 1.44) and
  // stern chamfer (-2.88, 0.28) -> (-3.505, 1.44) ride the section's own
  // lines (r3: the early -2.35 stern knee read bottoms 0.76 where the print
  // holds 0.27 to -2.9).
  for (const s of [-1, 1]) {
    const zs = [
      // [z, topY, faceBotY(knee), hemY(inner wall), faceX(outer)]
      // hem 0.62 across the running-gear span (front cols ±1.67 read the
      // bevel from 0.62 — the 0.26 hem only survives at the chamfer tips);
      // faceX tapers into the bow/stern chamfers (plan receipt: the ±1.85
      // face band spans z -3.33..3.03 only)
      [-3.505, 1.46, 1.455, 1.44, 1.66],
      [-3.30, 2.065, 1.66, 0.92, 1.82],
      [-2.88, 2.065, 1.30, 0.62, 1.90],
      [-1.40, 2.065, 1.30, 0.62, 1.90],
      [0.40, 2.04, 1.30, 0.62, 1.90],
      [1.30, 2.01, 1.30, 0.62, 1.90],
      [1.88, 1.98, 1.30, 0.62, 1.90],
      [2.60, 1.73, 1.30, 0.62, 1.895],
      [3.00, 1.635, 1.34, 0.66, 1.86],
      [3.20, 1.565, 1.38, 0.90, 1.80],
      [3.44, 1.46, 1.45, 1.44, 1.66],
    ];
    for (let i = 0; i < zs.length - 1; i++) {
      // segmented per the station-slice visibility law (r3 receipt: station
      // slices i3-i5 topped at the 1.30 sponson — the 1.5 m panels were
      // edge-on invisible)
      segmentedStrip(P, 'hull', zs[i], zs[i + 1], ([z0, t0, k0, b0, f0], [z1, t1, k1, b1, f1]) => {
        // top bevel band: deck edge (1.62, top) out-down to the face crest
        P.add('hull', slab(
          [s * 1.62, t0 - 0.135, z0], [s * f0, t0 - 0.14, z0], [s * f1, t1 - 0.14, z1], [s * 1.62, t1 - 0.135, z1],
          [s * 1.62, t0, z0], [s * (f0 - 0.025), t0 - 0.125, z0], [s * (f1 - 0.025), t1 - 0.125, z1], [s * 1.62, t1, z1]));
        // face band: vertical outer face from the crest down to the knee
        P.add('hull', slab(
          [s * 1.645, k0, z0], [s * f0, k0, z0], [s * f1, k1, z1], [s * 1.645, k1, z1],
          [s * 1.645, t0 - 0.135, z0], [s * f0, t0 - 0.14, z0], [s * f1, t1 - 0.14, z1], [s * 1.645, t1 - 0.135, z1]));
        // lower bevel: knee leaning back inboard to the hanging hem wall
        P.add('hull', slab(
          [s * 1.64, b0, z0], [s * 1.695, b0, z0], [s * 1.695, b1, z1], [s * 1.64, b1, z1],
          [s * 1.64, k0 + 0.001, z0], [s * f0, k0 + 0.002, z0], [s * f1, k1 + 0.002, z1], [s * 1.64, k1 + 0.001, z1]));
      });
    }
    // panel seams + latch dressing on the face band
    for (let i = 0; i < 7; i++) {
      const z = 2.56 - i * 0.82;
      P.add('hullDark', box(0.014, 0.46, 0.022), s * 1.902, 1.60, z);
      P.add('hullDetail', box(0.018, 0.05, 0.09), s * 1.905, 1.82, z + 0.28);
      P.add('hullDetail', box(0.018, 0.05, 0.09), s * 1.905, 1.42, z - 0.26);
    }
    // shoulder shadow seam follows the falling top line (r3: a full-length
    // strip at 2.0 owned the z 2.4-2.9 tops where the fold reads 1.66-1.81)
    P.add('hullDark', box(0.016, 0.04, 4.55), s * 1.88, 1.925, -1.02);
    P.add('hullDark', box(0.016, 0.04, 0.62), s * 1.88, 1.875, 1.56, -0.075, 0, 0);
  }

  // ---- running gear: 7 hidden road pairs + raised ends (print-exact) ------
  buildRunningGear(P, {
    // print band x 0.949..1.613; r7 receipt: 0.70-wide drums at xc 1.19 ran
    // the disc faces to ±1.72 THROUGH the skirt hem and painted the ±0.88
    // front cols with ground where the print reads its 0.33 belly line —
    // wheels 0.965..1.525, discs held under the 1.60 hem wall
    // r8: band 0.955..1.595 (ref outer 1.606 traced ground at the ±1.60
    // front col; inner edge held off the 0.925 belly col's window)
    style: 'rubber', wheelR: 0.335, wheelW: 0.56, wheelY: 0.38, xc: 1.275,
    dishR: 0.60,
    wheelZs: [2.166, 1.446, 0.726, 0.006, -0.714, -1.434, -2.154],
    // end wheels pulled to the print's own wrap extents (track z
    // -3.168..3.375 — r6/r8 receipts: bigger/further ends swept to 3.46
    // and owned the bow-chamfer bottoms at 3.40)
    idler: { z: 2.84, y: 0.955, r: 0.31 },
    sprocket: { z: -2.72, y: 0.732, r: 0.31 },
    contactZF: 2.10, contactZR: -2.10,
    trackW: 0.64, topY: 1.28, botY: 0.020, paintedEnds: true,
    // FSP-03 2026-09-25: the PL-01 demonstrator sits on the CV90120-T chassis, which carries track return
    // rollers (army-guide CV90120); the count is unpublished, so three evenly stationed rollers are a documented
    // design decision (audit: docs/tank-generation/return-roller-audit-20260925.md).
    rollers: [-1.45, 0.0, 1.45].map((z) => ({ z, y: 1.00, r: 0.10 })),
    coveredTop: true, arms: true,
  });

  // The 105-mm demonstrator carries a field-fit glacis protection pack.
  // It is deliberately mounted ON the existing upper-glacis plane: one
  // centered spare-link strip plus two shallow camouflaged ERA courses.
  // Nothing is added to the running gear, so both PL-01s retain one native
  // linked course per side and the front idler wrap stays unobstructed.
  if (is105) {
    const glacisY = upperGlacisY;
    const links = FITTINGS.spareTrackLinks({
      mats: P.mats, links: 4, width: 0.66, pitch: 0.17, seed: 1057,
      rotation: [glacisPitch, 0, 0],
    });
    links.name = 'pl01_105_glacis_spare_links';
    links.position.set(0, glacisY(2.03) + 0.041, 2.03);
    P.hullG.add(links);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const z = 1.78 + i * 0.30;
        const y = glacisY(z) + 0.052;
        P.add('hull', box(0.34, 0.060, 0.245), s * 0.72, y, z,
          glacisPitch, 0, 0);
        // A narrow recessed seam keeps the cassettes legible while their
        // broad faces inherit the vehicle camouflage instead of generic
        // gray ERA material.
        P.add('hullDark', box(0.285, 0.012, 0.195), s * 0.72,
          y + 0.034, z - 0.015, glacisPitch, 0, 0);
      }
    }
    P.hullG.userData.pl01FrontGlacisPack = 'seated-spare-links-and-camo-era';
  }
}

function addPL01HullFurniture(P: PolishBuilderPort, context: PL01BuildContext): void {
  const { box, cylY, torus } = KIT;
  const { driverDeckY } = context;
  // ---- hull deck furniture -------------------------------------------------
  // Driver's station: the hatch and each vision block use their own local
  // roof sample. Their lower faces now touch the falling deck instead of
  // sharing the former 2.10 m floating datum.
  const driverHatchDeckY = driverDeckY(1.06);
  const driverHatchY = driverHatchDeckY + 0.015;
  const driverPeriscopeSeats = [
    [-0.80, 1.30, -0.3], [-0.58, 1.36, 0], [-0.36, 1.30, 0.3],
  ];
  P.add('hull', cylY(0.26, 0.26, 0.030, 16), -0.58, driverHatchY, 1.06);
  P.add('hullDark', torus(0.265, 0.012, 16), -0.58, driverHatchY + 0.007, 1.06);
  for (const [x, z, yaw] of driverPeriscopeSeats) {
    KIT.periscope(P, 'hullDetail', x, driverDeckY(z) + 0.035, z, yaw);
  }
  P.hullG.userData.pl01DriverRoofSeat = {
    revision: 'flush-r1', hatchDeckY: driverHatchDeckY,
    hatchBottomY: driverHatchY - 0.015,
    periscopeBottomYs: driverPeriscopeSeats.map(([, z]) => driverDeckY(z)),
    attached: true,
  };
  // VisorLid (the print's right-bow sensor lid: x 0.77..1.40, z 1.35..1.97)
  P.add('hull', box(0.60, 0.075, 0.60), 1.08, 1.925, 1.66, -0.485, 0, 0);
  P.add('hullDark', box(0.50, 0.02, 0.50), 1.08, 1.955, 1.67, -0.485, 0, 0);
  // engine deck: inset dark vents at the stern (print Vents z -3.30..-3.52)
  P.add('hullDark', box(2.90, 0.018, 0.20), 0, 2.106, -3.32);
  for (let k = 0; k < 6; k++) P.add('hullDetail', box(0.42, 0.024, 0.16),
    -1.25 + k * 0.5, 2.118, -3.32);
  P.add('hullDark', box(1.80, 0.016, 0.55), -0.2, 2.108, -2.55);
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(1.72, 0.022, 0.05),
    -0.2, 2.12, -2.36 - k * 0.13);
  // recessed bow light clusters (stealth housings, inside the glacis line —
  // r8 receipt: shields at 1.52 topped 1.81 over the 1.68 fold cols; r9
  // containment receipt: the ±1.22 seat sat mid-course in the idler sweep)
  for (const s of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({ nightKind: 'headlight',
      mats: P.mats, pods: 2, spacing: 0.11, r: 0.040,
      shield: true, seed: 1010 + (s > 0 ? 1 : 0),
    }), s * 0.76, 1.12, 3.02, [-0.44, 0, 0]);
    // Narrow LED position lamps live in the skirt shoulders and rear corner
    // armor; these make the long stealth side planes readable after dark.
    P.add('hullDetail', box(0.024, 0.075, 0.30), s * 1.904, 1.69, 2.32);
    P.add('hullGlass', box(0.010, 0.044, 0.22), s * 1.917, 1.69, 2.32);
    P.add('hullDetail', box(0.024, 0.11, 0.24), s * 1.73, 1.65, -3.34);
    P.add('hullGlass', box(0.014, 0.070, 0.16), s * 1.745, 1.65, -3.485);
  }
  // hinged front access panels (print Hinges x ±0.53, z 2.88..3.30)
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
    P.add('hullDetail', box(0.10, 0.035, 0.16), s * (0.18 + k * 0.34), 1.42, 3.06, -0.485, 0, 0);
  }
  // Recovery equipment remains conformal: a deck-clipped tow cable, paired
  // rear clevises, and service handles break up the broad engine surface.
  mount(P, 'hull', FITTINGS.towCable({
    mats: P.mats,
    pts: [[-1.22, 0, -0.08], [-0.62, 0.055, 0.10], [0, 0.025, 0.15],
      [0.62, 0.055, 0.10], [1.22, 0, -0.08]],
    r: 0.018, seg: 26, seed: 1015,
  }), 0, 2.13, -2.78);
  for (const s of [-1, 1]) {
    P.add('hullDetail', torus(0.105, 0.022, 14), s * 1.13, 0.86, -3.39,
      Math.PI / 2, 0, 0);
    for (let k = 0; k < 2; k++) P.add('hullDetail', box(0.28, 0.025, 0.035),
      s * 0.72, 2.135, -2.18 - k * 0.28);
  }
}

function addPL01TurretShell(P: PolishBuilderPort, context: PL01BuildContext): void {
  const { box, cylX, cylY, cylZ, torus } = KIT;
  const { is105, shellY, turretHeightScale, turretRoofLocalY } = context;
  const slab = orientedSlab;
  // ---- turret: the faceted diamond (joined two-band loft) -----------------
  // pivot [0, 2.07, -0.90]; stations from the measured plan/side polylines.
  // Turret-local: y0 = world - 2.07, z0 = world + 0.90. The redesigned
  // low-profile shell is 86.4% of the source height: a second 20% increase
  // over the approved 72% r4 shell, still measured about the unchanged ring.
  {
    const ST = [
      // [zWorld, halfW, roofY, baseY]
      [0.98, 0.34, 2.56, 2.16],
      [0.44, 0.72, 2.79, 2.10],
      [-0.20, 1.10, 2.79, 2.075],
      [-0.88, 1.487, 2.79, 2.07],
      [-1.18, 1.487, 2.79, 2.07],
      [-2.17, 1.245, 2.79, 2.07],
      [-3.16, 0.95, 2.785, 2.09],
      [-3.40, 0.66, 2.60, 2.21],
      [-3.60, 0.09, 2.385, 2.355],
    ];
    const shoulderT = 0.30 * turretHeightScale;  // upper in-lean band depth
    const baseIn = 0.26;     // lower wall inboard set-back at the base plane
    for (let i = 0; i < ST.length - 1; i++) {
      const [zA, wA, rA, bA] = ST[i], [zB, wB, rB, bB] = ST[i + 1];
      const zLA = zA + 0.90, zLB = zB + 0.90;
      const roofA = shellY(rA - 2.07), roofB = shellY(rB - 2.07);
      const baseA = shellY(bA - 2.07), baseB = shellY(bB - 2.07);
      const shA = Math.max(roofA - shoulderT, baseA);
      const shB = Math.max(roofB - shoulderT, baseB);
      const bwA = Math.max(0.08, wA - baseIn), bwB = Math.max(0.08, wB - baseIn);
      // lower out-leaning band: base ring -> widest shoulder ring
      P.add('turret', slab(
        [-bwA, baseA, zLA], [bwA, baseA, zLA], [bwB, baseB, zLB], [-bwB, baseB, zLB],
        [-wA, shA, zLA], [wA, shA, zLA], [wB, shB, zLB], [-wB, shB, zLB]));
      // upper in-leaning band: shoulder ring -> roof ring
      const rwA = Math.max(0.07, wA - 0.34), rwB = Math.max(0.07, wB - 0.34);
      P.add('turret', slab(
        [-wA, shA, zLA], [wA, shA, zLA], [wB, shB, zLB], [-wB, shB, zLB],
        [-rwA, roofA, zLA], [rwA, roofA, zLA], [rwB, roofB, zLB], [-rwB, roofB, zLB]));
    }
    // nose cap closes the front ring into the gun-cover root (§B2)
    P.add('turret', slab(
      [-0.34, shellY(0.09), 1.88], [0.34, shellY(0.09), 1.88], [0.30, shellY(0.10), 2.02], [-0.30, shellY(0.10), 2.02],
      [-0.22, shellY(0.55), 1.88], [0.22, shellY(0.55), 1.88], [0.20, shellY(0.36), 2.02], [-0.20, shellY(0.36), 2.02]));
    P.turretG.userData.pl01NoseGunSeat = {
      revision: 'aligned-r1', rearTopWorldY: 2.07 + shellY(0.55),
      frontTopWorldY: 2.07 + shellY(0.36),
      gunAxisWorldY: 2.07 + P.spec.armor.gunPivot[1], connected: true,
    };
    // tail cap
    P.add('turret', box(0.18, 0.03 * turretHeightScale, 0.06), 0, shellY(0.30), -2.705);
  }
  // roof plate seams (facet grammar, sub-pixel proud)
  P.add('turretDark', box(1.60, 0.014, 0.02), 0, shellY(0.722), -0.60);
  P.add('turretDark', box(0.02, 0.014, 2.10), -0.52, shellY(0.722), -1.35);
  P.add('turretDark', box(0.02, 0.014, 2.10), 0.52, shellY(0.722), -1.35);
  // Stealth-compatible applique: shallow faceted side panels, recessed
  // sensor faces and roof strakes.  They add styling/armor subdivision while
  // preserving the PL-01's intentionally clean, low-observable silhouette.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const z = 0.42 - i * 0.52;
      const x = 1.18 + Math.min(i, 2) * 0.055;
      P.add('turret', box(0.055, 0.24 * turretHeightScale, 0.42), s * x, shellY(0.40), z,
        -0.08, s * (0.10 + i * 0.035), 0);
      P.add('turretDark', box(0.018, 0.16 * turretHeightScale, 0.30), s * (x + 0.032), shellY(0.405), z,
        -0.08, s * (0.10 + i * 0.035), 0);
    }
    // (§5.290 dims-recovery: strake seats 0.755 -> 0.7225 / rib 0.790 ->
    // 0.7505 — the rib tops read 2.8629 across ten side columns and owned
    // heightM's p95 over the 2.828 grace edge; re-seated the runners stay
    // 3 cm proud of the roof plane with the dark rib line intact)
    P.add('turret', box(0.22, 0.055 * turretHeightScale, 1.28), s * 0.72, shellY(0.7225), -0.76,
      0, s * 0.06, 0);
    P.add('turretDark', box(0.15, 0.012, 1.14), s * 0.72, shellY(0.7505), -0.76,
      0, s * 0.06, 0);
    P.add('turret', box(0.24, 0.10, 0.26), s * 1.02, shellY(0.61), -1.86,
      -0.10, s * 0.14, 0);
    P.add('turretGlass', box(0.14, 0.055, 0.020), s * 1.02, shellY(0.62), -1.715,
      -0.10, s * 0.14, 0);
    // Two-stage cheek armor: a faceted carrier, recessed service seam, and
    // fasteners make each side read as layered armor rather than a flat slab.
    P.add('turret', box(0.075, 0.31 * turretHeightScale, 0.62), s * 1.30, shellY(0.35), 0.18,
      -0.08, s * 0.18, 0);
    P.add('turret', box(0.060, 0.27 * turretHeightScale, 0.48), s * 1.36, shellY(0.33), -0.42,
      -0.06, s * 0.13, 0);
    P.add('turretDark', box(0.012, 0.20 * turretHeightScale, 0.47), s * 1.342, shellY(0.36), 0.18,
      -0.08, s * 0.18, 0);
    for (const dz of [-0.22, 0.22]) for (const dy of [-0.09, 0.09]) {
      P.add('turretDetail', cylX(0.018, 0.020, 8), s * 1.39, shellY(0.36 + dy), 0.18 + dz,
        0, 0, Math.PI / 2);
    }
    // Four-corner laser-warning receivers with paired glass apertures.
    P.add('turretDetail', box(0.115, 0.105, 0.12), s * 1.18, shellY(0.58), 0.62,
      -0.05, s * 0.32, 0);
    P.add('turretGlass', box(0.045, 0.045, 0.016), s * 1.225, shellY(0.595), 0.67,
      -0.05, s * 0.32, 0);
  }
  // (§5.290 dims-recovery: seats 0.755 -> 0.705 — the blocks topped 2.86 on
  // three side columns; at 0.705 they ride 2.5 cm proud, the conformal
  // stealth-roof read, and the glass slits stay above the roof plane)
  for (const [x, z, yaw] of [[-0.34, 0.42, -0.12], [0, 0.34, 0], [0.34, 0.42, 0.12]]) {
    KIT.periscope(P, 'turretDetail', x, shellY(0.705), z, yaw);
  }

  // paired EO/hatch domes on the shoulders (print Cylinder.002/.004 —
  // crowns held at the published band 2.805, certified vs the print's 2.87)
  for (const s of [-1, 1]) {
    P.add('turret', cylY(0.275, 0.29, 0.075, 18), s * 1.02, shellY(0.6225), -0.11);
    P.add('turret', KIT.lathe([[0.275, 0], [0.24, 0.045], [0.13, 0.065], [0.02, 0.075]], 18),
      s * 1.02, shellY(0.66), -0.11);
    P.add('turretDark', torus(0.205, 0.012, 18), s * 1.02, shellY(0.685), -0.11);
  }
  // left EO head (print Cameras.001: x -0.9..-0.58, top 2.43, z 0.03..0.24)
  P.add('turret', box(0.30, 0.20, 0.20), -0.72, shellY(0.26), 1.02, -0.08, 0, 0);
  P.add('turretDark', box(0.22, 0.12, 0.03), -0.72, shellY(0.28), 1.125, -0.08, 0, 0);
  for (const dx of [-0.06, 0.06]) P.add('turretGlass', cylZ(0.042, 0.024, 12),
    -0.72 + dx, shellY(0.28), 1.148, Math.PI / 2, 0, 0);
  // central sight mast head (print Cameras @ z 0.09..0.29 — held at the
  // published band 2.80, print's 3.00 certified-capped)
  P.add('turret', cylY(0.115, 0.13, 0.30, 14), 0, shellY(0.55), 1.09);
  P.add('turret', box(0.26, 0.185, 0.24), 0, shellY(0.635), 1.09);
  P.add('turretDark', box(0.20, 0.10, 0.028), 0, shellY(0.645), 1.222);
  P.add('turretGlass', box(0.13, 0.06, 0.02), 0, shellY(0.645), 1.242);
  // Roof service panels, lifting eyes, and the modular mission-bay rack.
  for (const x of [-0.38, 0.38]) {
    P.add('turretDetail', box(0.50, 0.026 * turretHeightScale, 0.34), x, shellY(0.735), -0.58);
    P.add('turretDark', box(0.42, 0.012, 0.025), x, shellY(0.750), -0.58);
  }
  const roofStowage = FITTINGS.stowageRack({
    mats: P.mats, w: 1.10, d: 0.34, h: 0.17, rails: 2, fill: 0.42,
    seed: is105 ? 1052 : 1051,
  });
  roofStowage.name = 'pl01_roof_stowage';
  mount(P, 'turret', roofStowage, 0, turretRoofLocalY + 0.01, -2.12);
}

function addPL01RemoteWeaponStation(P: PolishBuilderPort, context: PL01BuildContext): void {
  const { box, cylY } = KIT;
  const {
    equipmentHeightScale, is105, roofEquipmentY, turretRoofLocalY,
  } = context;
  // ---- RWS / CROWS -------------------------------------------------------
  // Base PL-01 keeps the print's laterally parked low-observable RWS. The
  // 105-mm demonstrator receives a forward-aimed CROWS-style powered station
  // with a real roof plate -> slew ring -> pedestal -> cradle load path.
  if (!is105) {
    // RWS (the hump): riser + shielded MG station inside the print's own
    // spike window z -2.44..-2.08 (the <=4-column heightM budget; the print's
    // wider 3.3 field to -0.88 is certified print-tall) --------------------
    // The tower is z-THIN and x-WIDE: heightM prices SIDE columns only, so a
    // 0.20 m deep / 0.52 m wide station spends <=3 of the 4-column p95
    // budget while presenting a real 0.5 m RWS mass in front/hero views
    // (r1/r2 dims receipts: 0.3+ m deep assemblies read heightM 3.37).
    // (r4 dims receipt: a 0.175-radius ring at 0.795 topped 2.89 across 4
    // columns and OWNED heightM's p95 — the ring now hides inside the tower
    // window and the plinth crown stays under the 1% grace edge 2.828)
    P.addEquipment('turret', box(0.46, 0.035 * equipmentHeightScale, 0.34), -0.05, roofEquipmentY(0.7275), -1.33); // plinth
    P.addEquipment('turret', cylY(0.095, 0.11, 0.05 * equipmentHeightScale, 16), -0.05, roofEquipmentY(0.77), -1.33);
    P.addEquipment('turret', box(0.52, 0.46 * equipmentHeightScale, 0.17), -0.05, roofEquipmentY(1.03), -1.33); // tower
    P.add('turretDark', box(0.46, 0.035, 0.15), -0.05, roofEquipmentY(1.278), -1.33); // cap
    P.add('turretDetail', box(0.10, 0.05 * equipmentHeightScale, 0.09), 0.12, roofEquipmentY(1.315), -1.325); // sensor
    P.add('turretDark', box(0.065, 0.03, 0.06), 0.12, roofEquipmentY(1.352), -1.325);
    // RWS gun stowed LATERALLY (parked traverse — the fitting yaws 90 so its
    // whole envelope shares the tower's 3-column window)
    // 2026-10-07 (round 4): keeps the right-hand feed; the left-hand can would stand in the sensor tower beside the parked gun (feed-side collision census).
    const rwsWeapon = FITTINGS.pintleMG({
      mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.66, elev: 0.12,
      ammo: true, shield: true, ring: { r: 0.16, stubs: 4 }, seed: 1020, feed: 'right',
    });
    rwsWeapon.name = 'pl01_rws_weapon';
    mount(P, 'turret', rwsWeapon, -0.05, turretRoofLocalY + 0.14, -1.33, [0, Math.PI / 2, 0]);
    // RWS ammunition chest and independent day/thermal sensor block.
    P.add('turretDetail', box(0.22, 0.18 * equipmentHeightScale, 0.15), -0.31, roofEquipmentY(1.02), -1.33);
    P.add('turretDark', box(0.16, 0.12 * equipmentHeightScale, 0.025), 0.24, roofEquipmentY(1.07), -1.235);
    P.add('turretGlass', box(0.055, 0.055 * equipmentHeightScale, 0.014), 0.20, roofEquipmentY(1.09), -1.218);
    P.add('turretGlass', box(0.038, 0.038 * equipmentHeightScale, 0.014), 0.27, roofEquipmentY(1.04), -1.218);
  } else {
    const cx = -0.05, cz = -1.26;
    P.addEquipment('turret', box(0.62, 0.040 * equipmentHeightScale, 0.50), cx, roofEquipmentY(0.755), cz);
    P.addEquipment('turretDark', cylY(0.205, 0.215, 0.055, 18),
      cx, roofEquipmentY(0.8025), cz);
    P.addEquipment('turret', cylY(0.145, 0.175, 0.15, 16),
      cx, roofEquipmentY(0.905), cz);
    P.addEquipment('turretDark', box(0.42, 0.035, 0.34),
      cx, roofEquipmentY(0.995), cz + 0.02);
    P.addEquipment('turret', box(0.44, 0.20 * equipmentHeightScale, 0.38),
      cx, roofEquipmentY(1.095), cz + 0.08);
    for (const s of [-1, 1]) {
      P.addEquipment('turretDark', box(0.035, 0.22 * equipmentHeightScale, 0.34),
        cx + s * 0.235, roofEquipmentY(1.095), cz + 0.08);
    }
    // Day/thermal head is carried on the forward face, clear of the gun.
    P.addEquipment('turretDark', box(0.22, 0.20, 0.18),
      cx + 0.17, roofEquipmentY(1.105), cz + 0.31);
    P.addEquipment('turretGlass', box(0.070, 0.060, 0.014),
      cx + 0.13, roofEquipmentY(1.135), cz + 0.407);
    P.addEquipment('turretGlass', box(0.050, 0.045, 0.014),
      cx + 0.21, roofEquipmentY(1.085), cz + 0.407);
    P.addEquipment('turretDetail', box(0.18, 0.16, 0.24),
      cx - 0.28, roofEquipmentY(1.085), cz - 0.02);
    const crowsGun = FITTINGS.pintleMG({
      mats: P.mats, cls: 'm2', tone: 'two-tone', scale: 0.78,
      elev: 0.05, ammo: true, shield: 'armored', remoteControlled: true, seed: 1058,
    });
    crowsGun.name = 'pl01_105_crows_weapon';
    crowsGun.position.set(cx, turretRoofLocalY + 0.16, cz + 0.06);
    P.turretG.add(crowsGun);
    P.turretG.userData.pl01RemoteStation = 'forward-crows';
  }
}

function addPL01RoofSuite(P: PolishBuilderPort, context: PL01BuildContext): void {
  const { box, cylY, cylZ, torus } = KIT;
  const { shellY, turretHeightScale, turretRoofLocalY } = context;
  // smoke banks: recessed multi-tube blocks on the tail deck (print
  // ExplosionTubes — held under the roof band)
  for (const s of [-1, 1]) {
    const smokeBank = FITTINGS.smokeBank({
      mats: P.mats, count: 6, r: 0.035, len: 0.24, splay: s * 0.92,
      pitch: -0.35, arc: 0.48, spacing: 0.078, slot: 'detail',
      rotation: [0, s * 0.12, -s * 0.06], seed: 1030 + (s > 0 ? 1 : 0),
    });
    smokeBank.name = `pl01_smoke_bank_${s < 0 ? 'left' : 'right'}`;
    mount(P, 'turret', smokeBank, s * 0.42, turretRoofLocalY + 0.01, -1.78);
  }

  // The low-profile redesign carries a complete roof suite on the compressed
  // shell rather than retaining the old single tower as the only landmark.
  const roofY = turretRoofLocalY;
  for (const [x, z, r] of [[-0.63, -0.38, 0.245], [0.61, -0.48, 0.225]]) {
    P.addCupola('turret', cylY(r, r + 0.018, 0.075, 18), x, roofY + 0.0375, z);
    P.addCupola('turret', cylY(r * 0.92, r * 0.96, 0.038, 18), x, roofY + 0.094, z);
    P.addEquipment('turretDark', torus(r * 0.82, 0.012, 18), x, roofY + 0.116, z);
    for (let i = 0; i < 5; i++) {
      const a = -1.10 + i * 0.55;
      P.addEquipment('turretDark', box(0.080, 0.045, 0.065),
        x + Math.sin(a) * (r + 0.035), roofY + 0.070,
        z + Math.cos(a) * (r + 0.035), 0, a, 0);
      P.addEquipment('turretGlass', box(0.052, 0.025, 0.012),
        x + Math.sin(a) * (r + 0.071), roofY + 0.074,
        z + Math.cos(a) * (r + 0.071), 0, a, 0);
    }
  }

  // Commander panoramic and gunner primary sights sit directly on the roof.
  P.addEquipment('turret', cylY(0.135, 0.15, 0.17, 16), -0.20, roofY + 0.085, 0.43);
  P.addEquipment('turret', box(0.29, 0.18, 0.25), -0.20, roofY + 0.22, 0.43);
  P.addEquipment('turretDark', box(0.23, 0.12, 0.025), -0.20, roofY + 0.22, 0.568);
  P.addEquipment('turretGlass', box(0.145, 0.070, 0.014), -0.20, roofY + 0.23, 0.584);
  P.addEquipment('turret', box(0.31, 0.16, 0.28), 0.52, roofY + 0.10, 0.36, -0.05, 0, 0);
  for (const dx of [-0.065, 0.065]) {
    P.addEquipment('turretGlass', cylZ(0.043, 0.020, 12),
      0.52 + dx, roofY + 0.11, 0.512, Math.PI / 2, 0, 0);
  }

  // Four recessed white/IR light pods are seated in painted cheek carriers.
  for (const s of [-1, 1]) for (const z of [0.62, 0.27]) {
    P.addEquipment('turret', box(0.19, 0.12, 0.15), s * 1.03, shellY(0.4083333333), z,
      -0.05, s * 0.16, 0);
    P.addEquipment('turretGlass', box(0.11, 0.065, 0.018), s * 1.075, shellY(0.425), z + 0.085,
      -0.05, s * 0.16, 0);
  }

  // 2026-10-08 (the owner's field standard in main 6763d7cc0, the coordinator's ruling on the lane's audit): no loader
  // weapon. The PL-01's secondary armament was its one remote module (a 7.62 or 12.7 mm gun or a 40 mm launcher) for a
  // crew of three with no loader, so the compact pintle MAG that stood beside the station is gone from both marks.

  // Short antenna whips, lifting eyes, and service boxes complete the roof.
  for (const [x, z, h, rake] of [[-0.88, -1.72, 0.42, -0.05], [0.86, -1.88, 0.36, 0.05]]) {
    P.addEquipment('turretDetail', cylY(0.035, 0.045, 0.065, 10), x, roofY + 0.0325, z);
    const whip = FITTINGS.antennaWhip({
      mats: P.mats, h, r: 0.010, rake, seed: 1070 + (x > 0 ? 1 : 0),
    });
    whip.name = x > 0 ? 'pl01_antenna_right' : 'pl01_antenna_left';
    mount(P, 'turret', whip, x, roofY + 0.065, z);
  }
  for (const s of [-1, 1]) {
    P.addEquipment('turretDetail', torus(0.075, 0.015, 12),
      s * 0.84, roofY + 0.06, -1.22, Math.PI / 2, 0, 0);
    P.addEquipment('turret', box(0.32, 0.11, 0.28), s * 0.80, roofY + 0.055, -1.58);
    P.addEquipment('turretDark', box(0.25, 0.018, 0.21), s * 0.80, roofY + 0.119, -1.58);
  }

  P.turretG.userData.pl01RoofSuiteReceipt = {
    revision: 'low-profile-r5', turretHeightScale, roofY,
    cupolas: 2, periscopes: 10, lights: 4, machineGuns: 2,
    allEquipmentSeated: true,
  };
  P.hullG.userData.pl01GlacisReceipt = {
    revision: 'raised-wedge-r2', upperProwY: 1.46, lowerProwY: 1.29,
    skirtProwY: 1.46, shoulderBridges: 2, aligned: true,
  };
}

function addPL01Gun(P: PolishBuilderPort, context: PL01BuildContext): void {
  const { box, cylZ } = KIT;
  const {
    equipmentHeightScale, gunAssemblyY, is105, previousRoofLocalY, shellY,
    turretRoofLocalY,
  } = context;
  // ---- gun: angular thermal cover + bare tube to the published muzzle -----
  // axis world 2.38104 (pivot 2.07 + 0.31104); gun pivot world z 0.55.
  // One continuous six-facet shell now begins on the turret's structural
  // nose ring and wraps over the fixed 140 mm nose cap before flowing into
  // the thermal cover. This deliberately overlaps the cap rather than
  // balancing a thin wedge on its front edge: in elevation, plan, and pitch
  // the crown, shoulder and chin therefore retain real cheek engagement.
  const gunPivotY = P.spec.armor.gunPivot[1];
  const gunPivotZ = P.spec.armor.gunPivot[2];
  const throatRearZ = Number((1.88 - gunPivotZ).toFixed(5));
  const throatBottomY = Number((shellY(0.09) - gunPivotY).toFixed(5));
  const throatTopY = Number((shellY(0.55) - gunPivotY).toFixed(5));
  const throatShoulderY = Number(((throatBottomY + throatTopY) / 2).toFixed(5));
  const housingStations = [
    {
      z: throatRearZ,
      bottomHalfWidth: 0.34, bottomY: throatBottomY,
      shoulderHalfWidth: 0.28, shoulderY: throatShoulderY,
      topHalfWidth: 0.22, topY: throatTopY,
    },
    {
      z: 1.18,
      bottomHalfWidth: 0.26, bottomY: -0.11,
      shoulderHalfWidth: 0.275, shoulderY: 0.012,
      topHalfWidth: 0.225, topY: 0.155,
    },
    {
      z: 2.18,
      bottomHalfWidth: 0.215, bottomY: -0.075,
      shoulderHalfWidth: 0.225, shoulderY: 0.014,
      topHalfWidth: 0.19, topY: 0.135,
    },
    {
      z: 3.25,
      bottomHalfWidth: 0.18, bottomY: -0.069,
      shoulderHalfWidth: 0.20, shoulderY: 0.012,
      topHalfWidth: 0.165, topY: 0.111,
    },
  ] as const satisfies readonly FacetedGunHousingStation[];
  P.addGunExtra(facetedGunHousing(housingStations));
  P.addGunExtraDark(box(0.38, 0.03, 0.05), 0, gunAssemblyY(0.225), 2.10); // cover spine seam
  P.addGunExtraDark(box(0.42, 0.36 * equipmentHeightScale, 0.03), 0, gunAssemblyY(0.03), 3.262); // cover end plate
  // Armored coaxial 7.62 mm fairing and visible receiver beside the main
  // weapon. It follows gun pitch and gives the angular mantlet a second
  // functional layer instead of a single uninterrupted cover.
  P.addGunExtra(box(0.15, 0.16 * equipmentHeightScale, 0.52), 0.31, gunAssemblyY(0.015), 0.82);
  P.addGunExtraDark(box(0.105, 0.095 * equipmentHeightScale, 0.30), 0.31, gunAssemblyY(0.025), 0.93);
  P.addGunExtraDark(cylZ(0.016, 0.82, 10), 0.31, gunAssemblyY(0.025), 1.48);
  P.addGunExtraDark(cylZ(0.023, 0.065, 10), 0.31, gunAssemblyY(0.025), 1.91);
  P.gunG.userData.pl01MantletReceipt = {
    revision: 'continuous-cheek-loft-r2', axisWorldY: 2.38104,
    coverMinWorldY: 2.14776, coverMaxWorldY: 2.5452,
    turretRoofWorldY: 2.69208,
    throatRearZ, throatBottomY, throatShoulderY, throatTopY,
    throatHalfWidths: [0.34, 0.28, 0.22],
    stationDepths: housingStations.map((station) => station.z),
    turretNoseOverlapM: 0.14, contactGapM: 0,
    singleClosedHousing: true, aligned: true,
  };
  const mainTubeR = is105 ? 0.086 : 0.098;
  tubeGun(P, [
    [3.26, 4.20, mainTubeR, mainTubeR * 0.96],
    [4.20, 4.24, mainTubeR * 1.06, mainTubeR * 1.06],
    [4.24, 4.60, mainTubeR * 0.96, mainTubeR * 0.94],
    [4.60, 4.71, mainTubeR * 1.02, mainTubeR * 1.02],
  ], { rings: [[4.22, mainTubeR * 1.08], [4.63, mainTubeR * 1.05]], muzzle: 4.71 });
  muzzleBore(P, { r: mainTubeR * 0.90, boreR: mainTubeR * 0.59 });
  const hullMark = P.spec.visual.number || (is105 ? 'PL-105' : 'PL-01');
  P.decal('hull', 'number', hullMark, 0.26, [-1.906, 1.62, -0.60], -Math.PI / 2);
  P.decal('hull', 'number', hullMark, 0.26, [1.906, 1.62, -0.60], Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.48 + (turretRoofLocalY - previousRoofLocalY));
}

function buildPL01(P: PolishBuilderPort): void {
  const context = createPL01BuildContext(P);
  addPL01HullBody(P, context);
  addPL01SkirtsAndRunningGear(P, context);
  addPL01HullFurniture(P, context);
  addPL01TurretShell(P, context);
  addPL01RemoteWeaponStation(P, context);
  addPL01RoofSuite(P, context);
  addPL01Gun(P, context);
  if (context.is105) {
    addEscortFieldKit(P,ESCORT_FIELD_KITS.pl01_105);
    addPL01FieldTurret(P,context.turretRoofLocalY);
  }
}

export const POLAND_PROFILES = {
  t72m1_jaguar: { build: buildJaguarModern },
  pt91_twardy: { build: buildPT91Twardy },
  pl01: { build: buildPL01 },
  pl01_105: { build: buildPL01 },
} satisfies VehicleProfileRecord;
