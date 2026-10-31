import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
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
import { KIT, FITTINGS, MUDGUARDS, evenStations, muzzleBore, orientedSlab, convexSlab } from './kit.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import type { SnapGroupOptions } from '../tankFactoryCore.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import { buildM46CastSteps, buildM47CastSteps, buildM48A5CastSteps, buildM48VariantCastSteps } from './pattonCast.ts';

type Vec2Tuple = readonly [number, number];
type Vec3Tuple = readonly [number, number, number];
type GeometryScale = number | readonly number[];
type ProfileCurve = readonly Vec2Tuple[];
type ProfileOwner = 'hull' | 'turret';
type Disposable = { dispose(): void };
type HeightMap = (value: number) => number;

interface GeometrySection {
  readonly z: number;
  readonly hw: number;
  readonly top: number;
  readonly bot: number;
  readonly hwL?: number;
}

interface LoftOptions {
  readonly wall?: number;
  readonly mid?: number;
  readonly midW?: number;
  readonly crownW?: number;
  readonly crownX?: number;
  readonly shiftX?: number;
  readonly oy?: number;
  readonly oz?: number;
  readonly smooth?: boolean;
}

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

interface TrackWheel {
  readonly z: number;
  readonly y: number;
  readonly r: number;
  readonly support?: boolean;
}

interface RunningGearConfig {
  readonly wheelR: number;
  readonly wheelY?: number;
  readonly span: Vec2Tuple;
  readonly idler: TrackWheel;
  readonly sprocket: TrackWheel;
  readonly tension?: TrackWheel;
  readonly rollerN: number;
  readonly rollerY: number;
  readonly sprocketTeeth?: boolean;
  readonly contactZF?: number;
  readonly contactZR?: number;
  readonly botY?: number;
  readonly endRingSpan?: number;
  readonly shoeRadialScale?: number;
  readonly shoeWidthScale?: number;
}

interface DeckCorridor {
  readonly z0: number;
  readonly z1: number;
  readonly x: number;
  readonly floor: number;
}

interface PattonHullConfig {
  readonly W: number;
  readonly trackW: number;
  readonly sponsonY: number;
  readonly deck: ProfileCurve;
  readonly bellyFrontZ: number;
  readonly bellyRearZ: number;
  readonly gear: RunningGearConfig;
  readonly aftCentreClosure?: boolean;
  readonly bandHW?: number;
  readonly bellyHW?: number;
  readonly bellyY?: number;
  readonly darkGearFit?: boolean;
  readonly deckCorridor?: DeckCorridor;
  readonly duckbills?: { readonly z: number };
  readonly fenderHW?: number;
  readonly fenderY?: readonly [number, number, number];
  readonly flapF?: readonly [number, number, number];
  readonly flapR?: readonly [number, number, number];
  readonly flatDeck?: boolean;
  readonly glacisWingDrop?: number;
  readonly glacisWingY0?: number;
  readonly glacisWingZ0?: number;
  readonly mufflers?: {
    readonly z0: number;
    readonly z1: number;
    readonly top: number;
    readonly x?: number;
    readonly straps?: readonly number[];
    readonly legY0?: number;
  };
  readonly narrowTail?: { readonly hw: number; readonly z0: number; readonly z1: number; readonly top1: number; readonly botY: number };
  readonly noseW?: number;
  readonly runningGearFace?: boolean;
  readonly runningGearFit?: boolean;
  readonly rearUndercutFloorJoin?: boolean;
  readonly sponsonAftY?: number;
  readonly sponsonAftZ?: number;
  readonly sponsonBandY?: number;
  readonly tailBotY?: number;
  readonly tailTaper?: { readonly z0: number; readonly z1?: number; readonly hw1: number };
  readonly toeBot?: number;
  readonly tongues?: readonly (readonly [number, number, number])[];
  readonly trackInset?: number;
  readonly trackBandHex?: number;
  readonly trackBandRoughness?: number;
  readonly trackBandEnvMapIntensity?: number;
}

interface BuiltHull {
  readonly hw: number;
  readonly bhw: number;
  readonly xc: number;
  readonly iw: number;
  readonly spons: number;
  readonly deckAt: HeightMap;
  readonly toeZ: number;
  readonly tailZ: number;
  readonly kneeZ: number;
  readonly kneeY: number;
}

interface HullFurniture {
  readonly hatchZ: number;
  readonly lights: { readonly x: number; readonly y: number; readonly z: number; readonly rx: number };
  readonly shackleY: number;
  readonly shackleZ: number;
  readonly grille: { readonly z0: number; readonly z1: number; readonly y: number; readonly rx?: number; readonly x?: number; readonly w?: number };
  readonly hatchX?: number;
  readonly hatchX0?: number;
  readonly hatchFlush?: boolean;
  readonly singleHatch?: boolean;
  readonly bowMG?: readonly [number, number, number, number];
  readonly bowMGHeavy?: boolean;
  readonly siren?: Vec3Tuple;
  readonly noRearEyes?: boolean;
  readonly caps?: Vec2Tuple;
  readonly rearGrilleW?: number;
  readonly rearGrilleY?: number;
  readonly rearGrilleZ?: number;
}

interface M60Section extends GeometrySection {
  readonly hwR?: number;
}

type CrossProfile = readonly (readonly [number, number])[];

interface EraCell {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rx: number;
  readonly ry: number;
  readonly rz: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly w: number;
  readonly h: number;
  readonly d: number;
  readonly supportGapM: number;
  readonly seatCorrectionM: number;
  readonly exteriorProjectionM: number;
}

type Side = -1 | 1;

interface M60BuildConfig {
  readonly hull: PattonHullConfig;
  readonly fit: HullFurniture;
  readonly sections: readonly M60Section[];
  readonly bustle: readonly M60Section[];
  readonly gunLen: number;
  readonly searchlight?: boolean | number;
  readonly sleeve?: boolean;
  readonly a3?: boolean;
}

interface M60A2BuildConfig {
  readonly hull: PattonHullConfig;
  readonly fit: HullFurniture;
  readonly sections: readonly GeometrySection[];
  readonly muzzle: number;
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

// ---------------------------------------------------------------------------
// Piecewise deck lookup (z descending front->rear).
// ---------------------------------------------------------------------------
const deckLine = (deck: ProfileCurve): HeightMap => (z: number): number => {
  if (z >= deck[0][0]) return deck[0][1];
  for (let i = 0; i < deck.length - 1; i++) {
    const [z0, y0] = deck[i], [z1, y1] = deck[i + 1];
    if (z <= z0 && z >= z1) return y0 + (y1 - y0) * ((z - z0) / (z1 - z0));
  }
  return deck[deck.length - 1][1];
};

// ---------------------------------------------------------------------------
// Lofted body: consecutive station slabs in three vertical bands so a cast
// silhouette follows the measured top/bottom curves with rounded-reading
// shoulders. sections: [{z, hw, top, bot}] front -> rear, world coords,
// emitted into `bucket` at a local frame offset by (oy, oz). opts.crownX
// shifts the roof band centreline sideways (fraction of hw) for castings
// whose roof ridge is offset (M60: ridge left of centre).
// ---------------------------------------------------------------------------
function loftBody(
  P: PattonBuilderPort,
  bucket: string,
  sections: readonly GeometrySection[],
  opts: LoftOptions = {},
): void {
  const slab = orientedSlab;                                  // §C.1 winding guard
  const wallT = opts.wall ?? 0.55;     // top of the vertical cheek band
  const midT = opts.mid ?? 0.84;      // top of the shoulder band
  const midW = opts.midW ?? 0.94;     // shoulder half-width fraction
  const crownW = opts.crownW ?? 0.44;  // roof half-width fraction
  const crownX = opts.crownX ?? 0;     // roof band centre offset fraction
  const sx = opts.shiftX ?? 0;         // whole-section lateral offset (m)
  const oy = opts.oy ?? 0, oz = opts.oz ?? 0;
  const L = (s: GeometrySection, f: number): number => s.bot + (s.top - s.bot) * f;
  // opt-in asymmetric plan: s.hwL narrows the LEFT wall/shoulder only (m60a2
  // Starship nose rake). Absent -> the exact symmetric expressions below
  // (byte-identical for every section without hwL).
  const hl = (s: GeometrySection): number => s.hwL ?? s.hw;
  const crownL = (s: GeometrySection): number => (s.hwL != null
    ? Math.max((crownX - crownW) * s.hw, -midW * s.hwL)
    : (crownX - crownW) * s.hw);
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i], b = sections[i + 1];
    const az = a.z - oz, bz = b.z - oz;
    const quad = (
      xA0: number, xA1: number, yA: number,
      xB0: number, xB1: number, yB: number,
      x2A0: number, x2A1: number, y2A: number,
      x2B0: number, x2B1: number, y2B: number,
    ): void => P.add(bucket, slab(
      [xA0 + sx, yA - oy, az], [xA1 + sx, yA - oy, az], [xB1 + sx, yB - oy, bz], [xB0 + sx, yB - oy, bz],
      [x2A0 + sx, y2A - oy, az], [x2A1 + sx, y2A - oy, az], [x2B1 + sx, y2B - oy, bz], [x2B0 + sx, y2B - oy, bz]));
    // wall band (vertical cheeks)
    quad(-hl(a), a.hw, a.bot, -hl(b), b.hw, b.bot, -hl(a), a.hw, L(a, wallT), -hl(b), b.hw, L(b, wallT));
    // shoulder band
    quad(-hl(a), a.hw, L(a, wallT), -hl(b), b.hw, L(b, wallT),
      -midW * hl(a), midW * a.hw, L(a, midT), -midW * hl(b), midW * b.hw, L(b, midT));
    // crown band (roof, optionally ridge-offset)
    quad(-midW * hl(a), midW * a.hw, L(a, midT), -midW * hl(b), midW * b.hw, L(b, midT),
      crownL(a), (crownX + crownW) * a.hw, a.top,
      crownL(b), (crownX + crownW) * b.hw, b.top);
  }
}

// ---------------------------------------------------------------------------
// Hull from the measured curves. All coordinates are world meters.
// H: { W, trackW, trackInset?, sponsonY, bellyY?, noseW,
//      deck: [[z,y]...] toe -> tail (base plates, fittings excluded),
//      toeBot, bellyFrontZ, bellyRearZ, tailBotY, fenderY?,
//      narrowTail?: { hw, z0, z1, top1, botY },   // m45 centre tail block
//      duckbills?: { z },                          // m26/m46/m47 centre prong
//      mufflers?: { z0, z1, top },
//      flapF/flapR: [z, y0, y1],                   // fender-tip mud flaps
//      gear: { wheelR, wheelY?, span:[zF,zR], idler, sprocket, tension?,
//              rollerN, rollerY } }
// ---------------------------------------------------------------------------
function curveHull(P: PattonBuilderPort, H: PattonHullConfig): BuiltHull {
  const { box, cylX, cylZ, torus, buildRunningGear } = KIT;
  const slab = orientedSlab;                                  // §C.1 winding guard
  const hw = H.W / 2 - 0.008;          // fender edge (widest point)
  const bhw = H.bandHW ?? hw;           // full-width armour band half width
  const xc = H.W / 2 - H.trackW / 2 - (H.trackInset || 0);
  // inner (between-track) half width; H.bellyHW opt-in (m47 r2 containment:
  // the derived 1.085 overlapped the track inner edge at the nose cylinder)
  const iw = H.bellyHW ?? ((H.W - 2 * H.trackW - 0.14) / 2);
  const spons = H.sponsonY;
  const belly = H.bellyY ?? 0.44;
  const deck = H.deck;
  const deckAt = deckLine(deck);
  const [toeZ, toeY] = deck[0];
  const [kneeZ, kneeY] = deck[1];
  const tail = deck[deck.length - 1];

  // full-width band: sponson floor -> deck polyline (knee back to the tail,
  // or to the tail-taper start when the plan shows rounded rear corners).
  // H.sponsonAftY/Z opt-in (m47 r2 containment): the aft band bottom lifts
  // above the track top run climbing to a high rear sprocket.
  const bandEnd = H.tailTaper ? H.tailTaper.z0 : -Infinity;
  // Optional closed over-track soffit. Insert its stations into the deck
  // polyline so the accepted roof/outer-wall outline stays continuous;
  // only the concealed shoulder floor rises above the moving return run.
  const bandDeck = H.deckCorridor
    ? [...deck, [H.deckCorridor.z0, deckAt(H.deckCorridor.z0)],
      [H.deckCorridor.z1, deckAt(H.deckCorridor.z1)]]
      .sort((a, b) => b[0] - a[0])
      .filter((p, i, a) => i === 0 || Math.abs(p[0] - a[i - 1][0]) > 1e-6)
    : deck;
  const curveHullHullStage1 = (): void => {
    for (let i = 1; i < bandDeck.length - 1; i++) {
      let [z0, y0] = bandDeck[i];
      let [z1, y1] = bandDeck[i + 1];
      if (z0 <= bandEnd) continue;
      if (z1 < bandEnd) { y1 = y0 + (y1 - y0) * ((bandEnd - z0) / (z1 - z0)); z1 = bandEnd; }
      // H.flatDeck opt-in (m48a5_patton r3, station slice-paint parity): keep exactly
      // level deck pairs EXACTLY level — a nudged (+0.006) quad rasterizes a
      // 1-2 px top line in every station z-slab while a true-flat quad is
      // edge-on invisible, exactly like the reference prints' own flat decks
      // (m48a5_patton ref st1/st2 read their fender fragments 1.56-1.60, not their
      // 1.82 deck; my nudged deck painted 1.828 -> topPct 8-10 on two
      // slices). Default byte-identical (the nudge stands for every sibling).
      if (Math.abs(y1 - y0) < 0.004) y1 = H.flatDeck ? y0 : y0 + 0.006;
      const sb = (z: number): number => (H.sponsonAftY != null && H.sponsonAftZ != null && z <= H.sponsonAftZ
        ? H.sponsonAftY
        : (H.sponsonBandY ?? spons - 0.03));
      const C = H.deckCorridor;
      const mid = (z0 + z1) * 0.5;
      const inCorridor = C && mid >= Math.min(C.z0, C.z1) - 1e-6
        && mid <= Math.max(C.z0, C.z1) + 1e-6;
      if (!inCorridor) {
        P.add('hull', slab(
          [-bhw, sb(z0), z0], [bhw, sb(z0), z0], [bhw, sb(z1), z1], [-bhw, sb(z1), z1],
          [-bhw, y0, z0], [bhw, y0, z0], [bhw, y1, z1], [-bhw, y1, z1]));
        continue;
      }
      const X = C.x, F = C.floor;
      // Complete central body.
      P.add('hull', slab(
        [-X, sb(z0), z0], [X, sb(z0), z0], [X, sb(z1), z1], [-X, sb(z1), z1],
        [-X, y0, z0], [X, y0, z0], [X, y1, z1], [-X, y1, z1]));
      // Closed left/right sponson shoulders, retaining the original deck and
      // exterior side faces while moving only the hidden underside upward.
      for (const side of [-1, 1]) {
        P.add('hull', side > 0
          ? slab([X, F, z0], [bhw, F, z0], [bhw, F, z1], [X, F, z1],
            [X, y0, z0], [bhw, y0, z0], [bhw, y1, z1], [X, y1, z1])
          : slab([-bhw, F, z0], [-X, F, z0], [-X, F, z1], [-bhw, F, z1],
            [-bhw, y0, z0], [-X, y0, z0], [-X, y1, z1], [-bhw, y1, z1]));
      }
    }
  };
  curveHullHullStage1();
  // thin fender plates carry the true width (the reference decks step DOWN to
  // a narrow fender lip at the extreme edge — a full-width deck slab painted
  // +0.2 m tops into the front-view edge columns under gate v6).
  // H.fenderHW opt-in (m47 r2): the continuous plate stops at the ref's own
  // 1.677 fender line — full width lives on the discrete hanger bumps
  // (stations law; a full-length hw plate over-reads the width slices).
  const curveHullHullStage2 = (): void => {
    if (H.fenderY) {
      const [fy, fz0, fz1] = H.fenderY;
      const fhw = H.fenderHW ?? hw;
      P.add('hull', box(fhw - bhw + 0.01, 0.035, fz0 - fz1), (bhw + fhw) / 2, fy, (fz0 + fz1) / 2);
      P.add('hull', box(fhw - bhw + 0.01, 0.035, fz0 - fz1), -(bhw + fhw) / 2, fy, (fz0 + fz1) / 2);
    }
  };
  curveHullHullStage2();
  // upper glacis: full width tapering to the beak edge (knife-edge bow).
  // H.glacisWingY0 opt-in (m47 r2 containment): the full-width slab passed
  // through the idler wrap inside the track band — split into a centre
  // wedge (inside the tracks, full profile) + side wings clamped above the
  // wrap crest. Silhouettes identical (side reads the centre wedge, front
  // reads the track below the wing line). Default byte-identical.
  const nw = H.noseW ?? bhw * 0.95;
  const toeBot = H.toeBot ?? toeY - 0.09;
  const curveHullHullStage3 = (): void => {
    if (H.glacisWingY0 != null) {
      const gw = Math.min(iw, nw);
      P.add('hull', slab(
        [-gw, toeBot, toeZ], [gw, toeBot, toeZ], [gw, spons - 0.03, kneeZ], [-gw, spons - 0.03, kneeZ],
        [-gw, toeY, toeZ], [gw, toeY, toeZ], [gw, kneeY, kneeZ], [-gw, kneeY, kneeZ]));
      if (kneeY > H.glacisWingY0 + 0.05) {
        const wy = H.glacisWingY0;
        const wb = Math.max(toeBot, wy - (H.glacisWingDrop ?? 0.35));
        const wz = Math.max(kneeZ, Math.min(toeZ, H.glacisWingZ0 ?? toeZ));
        const wt = (toeZ - wz) / Math.max(0.001, toeZ - kneeZ);
        const ww = nw + (bhw - nw) * wt;
        const wyt = toeY + (kneeY - toeY) * wt;
        // FSP-05 (2026-09-25): with a 0.04 drop the wing's clamped bottom (1.26)
        // sat ABOVE its toe-line top (1.21) on the M46, folding the plate into a
        // bow-tie whose toe face shipped inside-out (205 open px, both side
        // rings). The front edge keeps the certified toe-line top and takes its
        // bottom 2 cm under it; hulls whose wing already clears stay identical.
        const wbFront = Math.min(wb, wyt - 0.02);
        P.add('hull', slab(
          [-ww, wbFront, wz], [ww, wbFront, wz], [bhw, wy, kneeZ], [-bhw, wy, kneeZ],
          [-ww, wyt, wz], [ww, wyt, wz], [bhw, kneeY, kneeZ], [-bhw, kneeY, kneeZ]));
      }
    } else {
      P.add('hull', slab(
        [-nw, toeBot, toeZ], [nw, toeBot, toeZ], [bhw, spons - 0.03, kneeZ], [-bhw, spons - 0.03, kneeZ],
        [-nw, toeY, toeZ], [nw, toeY, toeZ], [bhw, kneeY, kneeZ], [-bhw, kneeY, kneeZ]));
    }
    // lower glacis wedge + rounded cast transmission nose (between the tracks)
    // The M48 terminal roof lies below its toe floor. Bound that one inverted
    // wedge by the retained corners; leave every valid slab and the casting
    // itself on their existing construction paths.
    const lowerGlacis = toeY - 0.02 < toeBot ? convexSlab : slab;
    P.add('hull', lowerGlacis(
      [-iw, belly, H.bellyFrontZ], [iw, belly, H.bellyFrontZ], [iw * 0.98, toeBot, toeZ - 0.02], [-iw * 0.98, toeBot, toeZ - 0.02],
      [-iw, spons + 0.05, H.bellyFrontZ], [iw, spons + 0.05, H.bellyFrontZ], [iw * 0.98, toeY - 0.02, toeZ - 0.02], [-iw * 0.98, toeY - 0.02, toeZ - 0.02]));
    P.add('hull', cylX(0.21, iw * 2, P.q ? 20 : 12), 0, toeBot - 0.01, toeZ - 0.30);
    // lower hull box
    P.add('hull', box(iw * 2, spons - belly + 0.04, H.bellyFrontZ - H.bellyRearZ),
      0, (spons + belly) / 2, (H.bellyFrontZ + H.bellyRearZ) / 2);

    if (H.narrowTail) {
      // m45: the full-width hull ends early; a narrow centre tail block carries
      // the rear plate/exhaust mass the reference shows from -2.5 rearward.
      const T = H.narrowTail;
      P.add('hull', slab(
        [-T.hw, T.botY, T.z0], [T.hw, T.botY, T.z0], [T.hw * 0.96, T.botY + 0.04, T.z1], [-T.hw * 0.96, T.botY + 0.04, T.z1],
        [-T.hw, deckAt(T.z0), T.z0], [T.hw, deckAt(T.z0), T.z0], [T.hw * 0.96, T.top1, T.z1], [-T.hw * 0.96, T.top1, T.z1]));
    } else {
      // rear undercut wedge from the belly up to the tail lip (narrowed at the
      // tail when the reference plan shows rounded rear corners)
      const tb = H.tailBotY ?? 1.0;
      const twx = H.tailTaper ? Math.max(H.tailTaper.hw1, iw * 0.55) : iw * 0.92;
      // The early shared wedge deliberately began above the belly. That left
      // a visible, non-structural opening between the floor plate and stern on
      // the M46/M47/M48 boat hulls. Opt those measured hulls into a true
      // floor-to-tail ramp while preserving every other certified family mesh.
      const rearUndercutBottomY = H.rearUndercutFloorJoin ? belly : belly + 0.3;
      P.add('hull', slab(
        [-iw, rearUndercutBottomY, H.bellyRearZ], [iw, rearUndercutBottomY, H.bellyRearZ], [twx, tb, tail[0] + 0.02], [-twx, tb, tail[0] + 0.02],
        [-iw, spons + 0.04, H.bellyRearZ], [iw, spons + 0.04, H.bellyRearZ], [twx, tail[1] - 0.02, tail[0] + 0.02], [-twx, tail[1] - 0.02, tail[0] + 0.02]));
    }
  };
  curveHullHullStage3();
  // H.aftCentreClosure opt-in (owner 2026-10-21, "gaps in hull around the engines ... a top slab and bottom slab"):
  // H.sponsonAftY lifts the WHOLE band floor aft, the centre between the tracks included, while the tub below it
  // stops at the sponson line and the rear ramp climbs only slowly to the tail. Over the engine bay that left a
  // see-through slot from track to track. The tub's side plates now carry on up into the band: one block over the
  // flat tub and one riding the ramp's top face with its taper, flush with both side walls, its top buried 1 cm in
  // the band. The lifted over-track soffit outboard stays as it was.
  const curveHullAftClosure = (): void => {
    if (!H.aftCentreClosure || H.sponsonAftY == null || H.sponsonAftZ == null || H.narrowTail) return;
    const aftZ = H.sponsonAftZ;
    const top = H.sponsonAftY + 0.01;
    const tubTop = spons + 0.02;         // the lower hull box's top
    const rampY0 = spons + 0.04;         // the rear ramp's top face, bellyRearZ -> tail
    const rampY1 = tail[1] - 0.02;
    const zr = H.bellyRearZ, zt = tail[0] + 0.02;
    const twx = H.tailTaper ? Math.max(H.tailTaper.hw1, iw * 0.55) : iw * 0.92;
    // the band floor starts to climb at the station ahead of the first lifted one
    const lift = bandDeck.findIndex((p) => p[0] <= aftZ);
    const za = lift > 0 ? Math.max(bandDeck[lift - 1][0], zr) : aftZ;
    if (za > zr) P.add('hull', box(iw * 2, top - tubTop, za - zr), 0, (top + tubTop) / 2, (za + zr) / 2);
    // the ramp meets the band floor here; the block ends inside the band
    const f = Math.min(1, (H.sponsonAftY - rampY0) / Math.max(0.001, rampY1 - rampY0));
    const ze = zr + (zt - zr) * f, ye = rampY0 + (rampY1 - rampY0) * f, we = iw + (twx - iw) * f;
    P.add('hull', slab(
      [-iw, rampY0, zr], [iw, rampY0, zr], [we, ye, ze], [-we, ye, ze],
      [-iw, top, zr], [iw, top, zr], [we, Math.max(top, ye + 0.01), ze], [-we, Math.max(top, ye + 0.01), ze]));
    P.hullG.userData.pattonAftCentreClosure = Object.freeze({
      revision: 'engine-bay-tub-wall-r1', z0: +za.toFixed(3), z1: +ze.toFixed(3), halfWidth: +iw.toFixed(3),
      tubTopY: +tubTop.toFixed(3), soffitY: H.sponsonAftY,
    });
  };
  curveHullAftClosure();
  const rearUndercutBottomY = H.rearUndercutFloorJoin ? belly : belly + 0.3;
  const curveHullHullStage4 = (): void => {
    P.hullG.userData.pattonLowerHullReceipt = {
      floorY: belly,
      lowerGlacisAngleDeg: THREE.MathUtils.radToDeg(Math.atan2(
        toeBot - belly,
        Math.max(0.001, toeZ - 0.02 - H.bellyFrontZ),
      )),
      rearJointZ: H.bellyRearZ,
      rearUndercutBottomY,
      rearUndercutJoinsFloor: Math.abs(rearUndercutBottomY - belly) < 1e-6,
    };
    if (H.tailTaper) {
      // rounded rear corners: the full-width band above stops at tailTaper.z0
      // (deck slabs must end there); this trapezoid carries the deck to the
      // tail tip at hw1 following the deck polyline.
      const T = H.tailTaper;
      P.add('hull', slab(
        [-bhw, spons - 0.03, T.z0], [bhw, spons - 0.03, T.z0], [T.hw1, tail[1] - 0.10, tail[0]], [-T.hw1, tail[1] - 0.10, tail[0]],
        [-bhw, deckAt(T.z0), T.z0], [bhw, deckAt(T.z0), T.z0], [T.hw1, tail[1], tail[0]], [-T.hw1, tail[1], tail[0]]));
    }
    if (H.duckbills) {
      // twin exhaust deflector humps on the centre rear (the plan prong).
      for (const side of [-1, 1]) {
        P.add('hull', slab(
          [side * 0.14, deckAt(H.duckbills.z) - 0.30, H.duckbills.z], [side * 0.52, deckAt(H.duckbills.z) - 0.30, H.duckbills.z],
          [side * 0.46, deckAt(H.duckbills.z) - 0.26, H.duckbills.z - 0.24], [side * 0.16, deckAt(H.duckbills.z) - 0.26, H.duckbills.z - 0.24],
          [side * 0.14, deckAt(H.duckbills.z) - 0.06, H.duckbills.z], [side * 0.52, deckAt(H.duckbills.z) - 0.06, H.duckbills.z],
          [side * 0.46, deckAt(H.duckbills.z) - 0.16, H.duckbills.z - 0.24], [side * 0.16, deckAt(H.duckbills.z) - 0.16, H.duckbills.z - 0.24]));
      }
      P.add('hullDark', box(1.00, 0.14, 0.03), 0, deckAt(H.duckbills.z) - 0.24, H.duckbills.z + 0.01);
    }
    if (H.tongues) {
      for (const [tx, tw, tz1] of H.tongues) {
        P.add('hull', box(tw, 0.045, Math.abs(tail[0] - tz1) + 0.05),
          tx, deckAt(tail[0]) - 0.01, (tail[0] + tz1) / 2);
      }
    }
  };
  curveHullHullStage4();

  // r4 (m47 TONE round, order A3) opt-in H.darkGearFit: the pale 'hullDetail'
  // gear-zone fittings (muffler legs, roller brackets, flap hanger straps)
  // read as bare primer sticks against the dark track band / sky in every
  // quarter view — route them to the dark-fitting bucket. Keep real flaps in
  // their armor bucket; only the opt-in return-roller brackets use the native
  // running-gear detail bucket for exact corridor auditing.
  const gearFitB = H.darkGearFit ? 'hullDark' : 'hullDetail';
  const rollerFitB = H.runningGearFit ? 'hullRunningGearDetail' : gearFitB;
  const wheelFaceB = H.runningGearFace ? 'hullRunningGearDark' : 'hullDark';
  // fender mufflers (M46/M47): proud cylinders, end caps, elbows, tailpipes.
  // Opt-in x/straps (m47 r2): the r1 m47 band (-2.26..-2.52) made the body
  // length degenerate (0.26 fixed trim) while the hardcoded strap offsets
  // (+0.32/-0.52) parked the proud rings 0.4 m OUTSIDE the band on bare deck
  // (side_hull -2.891 read 1.798 vs ref 1.702). Defaults byte-identical.
  const curveHullHullStage5 = (): void => {
    if (H.mufflers) {
      const { z0, z1, top } = H.mufflers;
      const mr = 0.14, my = top - mr, mx = H.mufflers.x ?? (bhw - 0.24);
      for (const side of [-1, 1]) {
        P.add('hull', cylZ(mr, z0 - z1 - 0.26, P.q ? 18 : 10), side * mx, my, (z0 + z1) / 2, 0.012, 0, 0);
        P.add('hull', cylZ(mr * 0.8, 0.06, 12), side * mx, my, z0 - 0.08);
        P.add('hull', cylZ(mr * 0.8, 0.06, 12), side * mx, my, z1 + 0.14);
        P.add('hullDark', cylZ(0.06, 0.28, 8), side * (mx - 0.05), my - 0.08, z0 - 0.02, 0.85, 0, 0);
        P.add('hullDark', cylZ(0.052, 0.38, 8), side * mx, my - 0.07, z1 + 0.02, 0.35, 0, 0);
        for (const dz of H.mufflers.straps ?? [0.32, -0.52]) {
          const ly0 = H.mufflers.legY0 ?? spons;
          P.add('hullDark', cylZ(mr * 1.04, 0.032, 12), side * mx, my, (z0 + z1) / 2 + dz);
          P.add(gearFitB, box(0.05, my - ly0 + 0.02, 0.07), side * mx, (my + ly0) / 2, (z0 + z1) / 2 + dz);
        }
      }
    }
  };
  curveHullHullStage5();

  // running gear (Patton pattern: dished wheels, torsion arms, rear sprocket)
  const G = H.gear;
  const wheelZs = evenStations(6, G.span[0] - G.span[1], (G.span[0] + G.span[1]) / 2);
  const rollers = evenStations(G.rollerN, (G.span[0] - G.span[1]) * 0.8, (G.span[0] + G.span[1]) / 2)
    .map((z) => ({ z, y: G.rollerY, r: 0.095 }));
  const curveHullHullStage6 = (): void => {
    if (G.tension) {
      // track tension idler: a real wheel pair LOW between the last road wheel
      // and the sprocket.
      if (G.tension.support) rollers.push(G.tension);
      for (const side of [-1, 1]) {
        P.add(H.runningGearFit ? 'hullRunningGearDetail' : 'hullDetail',
          cylX(G.tension.r, 0.17, 12), side * xc, G.tension.y, G.tension.z);
        P.add(wheelFaceB, cylX(G.tension.r * 0.5, 0.19, 8),
          side * xc, G.tension.y, G.tension.z);
      }
    }
  };
  curveHullHullStage6();
  const wheelW = Math.min(0.24, H.trackW * 0.4);
  const wy = G.wheelY ?? G.wheelR + 0.03;
  const curveHullRunningGearStage1 = (): void => {
    buildRunningGear(P, {
      style: 'dished', wheelR: G.wheelR, wheelW, wheelY: wy, xc, wheelZs,
      sprocket: G.sprocket, idler: G.idler, rollers, trackW: H.trackW,
      topY: G.rollerY + 0.04, paintedEnds: true, coveredTop: false, arms: true,
      sprocketTeeth: G.sprocketTeeth,
      // m46 r5 opt-in pass-through: pin the contact patch so the ramp
      // departures match the measured ref lines (the loop eases into its
      // tangent ~0.1 m past the patch end). Undefined = byte-identical.
      contactZF: G.contactZF, contactZR: G.contactZR,
      // m45 r1 opt-in pass-through: ground line for the band bottom — the
      // default 0.055 hangs link pads ~15 mm below y0 and the dims heightM
      // read (p95 top - min bot) pays it. Undefined = byte-identical.
      botY: G.botY,
      // m48a5_patton r8 opt-in pass-through: sprocket carrier-ring span (see
      // tankFactory buildRunningGear). Undefined = byte-identical.
      endRingSpan: G.endRingSpan,
      // M48A5 oracle correction: retain the authored linked course and smart
      // suspension, but keep the pad crown inside the measured source orbit.
      // Undefined remains byte-identical for every sibling Patton.
      shoeRadialScale: G.shoeRadialScale,
      shoeWidthScale: G.shoeWidthScale,
      trackBandHex: H.trackBandHex,
      trackBandRoughness: H.trackBandRoughness,
      trackBandEnvMapIntensity: H.trackBandEnvMapIntensity,
    });
    // readable hub ring + bolts on every outer wheel face
    for (const z of wheelZs) {
      for (const side of [-1, 1]) {
        const fx = side * (xc + wheelW / 2 + 0.012);
        P.add(wheelFaceB, torus(G.wheelR * 0.3, 0.015, 16), fx, wy, z, 0, 0, Math.PI / 2);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + 0.26;
          P.add(wheelFaceB, cylX(0.026, 0.05, 6), fx, wy + Math.sin(a) * G.wheelR * 0.52, z + Math.cos(a) * G.wheelR * 0.52);
        }
      }
    }
    // roller brackets + mud flaps at the fender tips (measured hang bands)
    for (const rl of rollers) for (const side of [-1, 1]) {
      P.add(rollerFitB, box(0.05, Math.max(0.05, spons - rl.y - 0.02), 0.13), side * xc, (spons + rl.y) / 2, rl.z);
    }
  };
  curveHullRunningGearStage1();
  const flaps = [H.flapF, H.flapR].filter(
    (flap): flap is readonly [number, number, number] => flap !== undefined,
  );
  const curveHullAssemblyStage1 = (): void => {
    for (const [fz, fy0, fy1] of flaps) {
      for (const side of [-1, 1]) {
        MUDGUARDS.add(P, {
          label: `patton-${fz < 0 ? 'rear' : 'front'}-flap-${side}`,
          x: side * xc,
          y: (fy0 + fy1) / 2,
          z: fz,
          thickness: 0.03,
          length: H.trackW * 0.92,
          height: fy1 - fy0,
          material: 'rubber',
          rotation: [0, Math.PI / 2, 0],
          crown: 0.012,
          frontCut: 0.025,
          rearCut: 0.018,
        });
        // hanger strap: articulation floater guard (the flap must stay one
        // island with the hull in every pose)
        P.add(gearFitB, box(0.035, Math.max(0.08, spons - fy1 + 0.06), 0.035),
          side * xc, (spons + fy1) / 2 - 0.01, fz);
      }
    }
  };
  curveHullAssemblyStage1();
  return { hw, bhw, xc, iw, spons, deckAt, toeZ, tailZ: tail[0], kneeZ, kneeY };
}

// ---------------------------------------------------------------------------
// Shared US hull furniture; only fittings the reference boards show.
// F: { hatchX?, hatchZ, bowMG?, lights:{x,y,z,rx}, siren?,
//      shackleZ, shackleY, grille:{z0,z1,y,rx?,x?,w?}, caps?, rearGrilleY? }
// ---------------------------------------------------------------------------
function addUsCrewHatchesAndBowGun(
  P: PattonBuilderPort,
  hull: BuiltHull,
  F: HullFurniture,
): void {
  const { box, cylY, cylZ, sph } = KIT;
  const { deckAt } = hull;
  // driver (+ assistant) hatch discs — FLUSH (v6: the reference decks read
  // within ~0.03 m of the plate; the old proud hoods+periscopes cost the
  // whole mid-deck band)
  const hx = F.hatchX ?? 0.55;
  // F.hatchFlush opt-in (m60a2 push round): the A2 print reads its driver
  // hatch dead flush (ref side 1.655 over the 1.659 deck) — the standard
  // 0.024 disc + proud handle painted 8 side columns +0.03/+0.05. Default
  // absent -> byte-identical.
  const hLift = F.hatchFlush ? 0.005 : 0.012;
  const hDisc = F.hatchFlush ? 0.010 : 0.024;
  const hBar = F.hatchFlush ? 0.014 : 0.028;
  for (const side of F.singleHatch ? [0] : [-1, 1]) {
    const x = side * hx || F.hatchX0 || 0;
    P.add('hull', cylY(0.20, 0.21, hDisc, P.q ? 18 : 10), x, deckAt(F.hatchZ) + hLift, F.hatchZ);
    P.add('hullDark', box(0.28, 0.008, 0.04), x, deckAt(F.hatchZ) + hBar, F.hatchZ);
  }
  // bow .30cal ball mount
  // r6 C3 opt-in F.bowMGHeavy (m47): the bare 0.024 stub read as a thin
  // wire — a real muzzle mass instead: fatter tapered tube + muzzle collar
  // (all <=0.022 fatter than the old stub, front-view interior against the
  // glacis; the ball footprint already owns the zone). Default absent —
  // byte-identical (m26/m45/m46 keep the wire stub).
  if (F.bowMG) {
    P.add('hull', sph(0.12, P.q ? 16 : 10), F.bowMG[0], F.bowMG[1], F.bowMG[2]);
    if (F.bowMGHeavy) {
      const bdy = -Math.sin(F.bowMG[3]), bdz = Math.cos(F.bowMG[3]);   // stub axis
      P.add('hullDark', cylZ(0.034, 0.21, 10, 0.030), F.bowMG[0], F.bowMG[1] + 0.03, F.bowMG[2] + 0.13, F.bowMG[3], 0, 0);
      P.add('hullDark', cylZ(0.046, 0.055, 10), F.bowMG[0], F.bowMG[1] + 0.03 + bdy * 0.105, F.bowMG[2] + 0.13 + bdz * 0.105, F.bowMG[3], 0, 0);
      P.add('hullDark', cylZ(0.020, 0.016, 8), F.bowMG[0], F.bowMG[1] + 0.03 + bdy * 0.135, F.bowMG[2] + 0.13 + bdz * 0.135, F.bowMG[3], 0, 0);
    } else {
      P.add('hullDark', cylZ(0.024, 0.26, 8), F.bowMG[0], F.bowMG[1] + 0.03, F.bowMG[2] + 0.13, F.bowMG[3], 0, 0);
    }
  }
}

function addUsExteriorHullFittings(
  P: PattonBuilderPort,
  hull: BuiltHull,
  F: HullFurniture,
): void {
  const { cylY, headlight, liftEye, torus } = KIT;
  const { deckAt, tailZ } = hull;
  // headlight pods on the glacis
  for (const side of [-1, 1]) {
    headlight(P, side * F.lights.x, F.lights.y, F.lights.z, F.lights.rx, 0.05);
  }
  if (F.siren) P.add('hullDetail', cylY(0.05, 0.06, 0.07, 10), F.siren[0], F.siren[1], F.siren[2]);
  // tow shackles at the bow, flush lift eyes at the stern (suppressible: the
  // M60 reference deck reads 1.83-1.84 there — proud eyes cost side columns)
  for (const side of [-1, 1]) {
    // 2026-10-19 (owner float sweep): the shackle is seated on the bow (the m47's stood 15 mm ahead of it)
    P.snapGroup('patton-bow-shackle', () => P.add('hullDetail', torus(0.06, 0.015, 10), side * 0.58, F.shackleY, F.shackleZ,
      Math.PI / 2, 0, 0), { reachM: 0.03 });
    if (!F.noRearEyes) liftEye(P, 'hullDetail', side * 0.62, deckAt(tailZ + 0.25) - 0.02, tailZ + 0.15);
  }
}

function addUsEngineDeckAndRearGrille(
  P: PattonBuilderPort,
  hull: BuiltHull,
  F: HullFurniture,
): void {
  const { box, cylY } = KIT;
  const { deckAt, tailZ } = hull;
  // engine deck: framed louvred grille bays (kept within +0.03 of the plate)
  const gr = F.grille;
  const gm = (gr.z0 + gr.z1) / 2, gd = gr.z0 - gr.z1;
  const gx0 = gr.x ?? 0.55, gw = gr.w ?? 0.92;
  const gy = (z: number, lift: number): number => gr.y + lift + (gr.rx ? (z - gm) * gr.rx : 0);
  for (const side of [-1, 1]) {
    const gx = side * gx0;
    P.add('hullDark', box(gw, 0.012, gd), gx, gy(gm, 0.006), gm, gr.rx || 0, 0, 0);
    for (const dx of [-gw / 2 - 0.02, gw / 2 + 0.02]) {
      P.add('hull', box(0.07, 0.024, gd + 0.05), gx + dx, gy(gm, 0.012), gm, gr.rx || 0, 0, 0);
    }
    for (let i = 0; i < 7; i++) {
      const z = gr.z0 - (i + 0.5) * (gd / 7);
      P.add('hullDetail', box(gw - 0.06, 0.016, (gd / 7) * 0.6), gx, gy(z, 0.02), z, gr.rx || 0, 0, 0);
    }
  }
  P.add('hull', box(0.12, 0.026, gd + 0.05), 0, gy(gm, 0.013), gm, gr.rx || 0, 0, 0);
  for (const z of [gr.z0 + 0.02, gr.z1 - 0.02]) {
    P.add('hull', box(gx0 * 2 + gw + 0.1, 0.026, 0.07), 0, gy(z, 0.012), z, gr.rx || 0, 0, 0);
  }
  if (F.caps) for (const side of [-1, 1]) {
    P.add('hullDetail', cylY(0.07, 0.07, 0.028, 10), side * F.caps[0], deckAt(F.caps[1]) + 0.016, F.caps[1]);
  }
  // rear plate: dark exhaust grille (kept on the rear face — never past the
  // tail tip when the hull plan tapers)
  P.add('hullDark', box(F.rearGrilleW ?? 1.24, 0.22, 0.03), 0, (F.rearGrilleY ?? deckAt(tailZ) - 0.32), F.rearGrilleZ ?? (tailZ - 0.02));
}

function usKit(P: PattonBuilderPort, hull: BuiltHull, F: HullFurniture): void {
  addUsCrewHatchesAndBowGun(P, hull, F);
  addUsExteriorHullFittings(P, hull, F);
  addUsEngineDeckAndRearGrille(P, hull, F);
}

// ---------------------------------------------------------------------------
// M60 asymmetric casting loft: each section is sliced by a signed-fraction
// cross profile ([fx, fy] pairs, fx of hw, fy of bot->top) so the LEFT ridge
// cliff and the LONG low RIGHT roof of the real casting both read (the
// symmetric loftBody trapezoids cannot carry a +0.4 m left/right roof split).
//
// SHADED-PARITY r3 KILL ITEM (weld): the round-3 loft emitted every quad as
// an independent closed slab brick — flat per-brick normals corrugated the
// whole dome ("venetian blinds"), exposed brick end-faces serrated the
// bustle taper, and the inward-jutting end cap read as an open black box.
// Now ONE indexed vertex grid per smooth run: vertices are SHARED along the
// section direction and across profile points, computeVertexNormals()
// averages them (a cast surface), and hard edges exist ONLY at the true
// profile knuckles listed in `creases` (runs split there, so boundary
// vertices are duplicated and keep one-sided normals). Outer vertex
// COORDINATES are identical to the old bricks — silhouette-identical by
// construction; the inner offset shell is gone (strictly interior of the
// now-closed skin) and both end caps are FLUSH full-ring faces at the exact
// end-section planes (inside the old rim + end-annulus footprint).
// ---------------------------------------------------------------------------
function m60LoftPoint(
  section: M60Section,
  profilePoint: readonly [number, number],
): Vec2Tuple {
  return [
    profilePoint[0] * (profilePoint[0] > 0 && section.hwR ? section.hwR : section.hw),
    section.bot + (section.top - section.bot) * profilePoint[1],
  ];
}

function m60LoftRuns(profileLength: number, creases: readonly number[]): number[][] {
  const normalizedCreases = [...new Set(creases.map((index) => (
    (index % profileLength) + profileLength
  ) % profileLength))].sort((first, second) => first - second);
  const runs: number[][] = [];
  for (let creaseIndex = 0; creaseIndex < normalizedCreases.length; creaseIndex += 1) {
    const start = normalizedCreases[creaseIndex];
    const end = normalizedCreases[(creaseIndex + 1) % normalizedCreases.length];
    if (start == null || end == null) throw new Error('M60 loft crease index is invalid');
    const run = [start];
    for (let index = (start + 1) % profileLength; ; index = (index + 1) % profileLength) {
      run.push(index);
      if (index === end) break;
    }
    runs.push(run);
  }
  return runs;
}

function emitM60LoftGeometry(
  P: PattonBuilderPort,
  bucket: string,
  positions: number[],
  indices: number[] | null,
): void {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(
    new Array((positions.length / 3) * 2).fill(0),
    2,
  ));
  if (indices) geometry.setIndex(indices);
  geometry.computeVertexNormals();
  P.add(bucket, geometry);
}

function emitM60LoftRun(
  P: PattonBuilderPort,
  bucket: string,
  sections: readonly M60Section[],
  profile: CrossProfile,
  run: readonly number[],
  oy: number,
  oz: number,
): void {
  const rowLength = run.length;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    for (let runIndex = 0; runIndex < rowLength; runIndex += 1) {
      const section = sections[sectionIndex];
      const profileIndex = run[runIndex];
      const profilePoint = profileIndex == null ? undefined : profile[profileIndex];
      if (!section || !profilePoint) throw new Error('M60 loft grid index is invalid');
      const point = m60LoftPoint(section, profilePoint);
      positions.push(point[0], point[1] - oy, section.z - oz);
    }
  }
  for (let sectionIndex = 0; sectionIndex < sections.length - 1; sectionIndex += 1) {
    for (let runIndex = 0; runIndex < rowLength - 1; runIndex += 1) {
      const a0 = sectionIndex * rowLength + runIndex;
      const a1 = a0 + 1;
      const b0 = a0 + rowLength;
      const b1 = b0 + 1;
      indices.push(a0, a1, b1, a0, b1, b0);
    }
  }
  emitM60LoftGeometry(P, bucket, positions, indices);
}

function emitM60LoftEndCap(
  P: PattonBuilderPort,
  bucket: string,
  section: M60Section,
  profile: CrossProfile,
  oy: number,
  oz: number,
  sign: number,
): void {
  const ring = profile.map((profilePoint) => m60LoftPoint(section, profilePoint));
  const centerX = ring.reduce((total, point) => total + point[0], 0) / profile.length;
  const centerY = ring.reduce((total, point) => total + point[1], 0) / profile.length;
  const z = section.z - oz;
  const positions: number[] = [];
  for (let index = 0; index < profile.length; index += 1) {
    const first = ring[index];
    const second = ring[(index + 1) % profile.length];
    if (!first || !second) throw new Error('M60 loft cap index is invalid');
    if (sign > 0) {
      positions.push(centerX, centerY - oy, z,
        second[0], second[1] - oy, z, first[0], first[1] - oy, z);
    } else {
      positions.push(centerX, centerY - oy, z,
        first[0], first[1] - oy, z, second[0], second[1] - oy, z);
    }
  }
  emitM60LoftGeometry(P, bucket, positions, null);
}

function m60Loft(
  P: PattonBuilderPort,
  bucket: string,
  secs: readonly M60Section[],
  profile: CrossProfile,
  oy: number,
  oz: number,
  creases: readonly number[] = [0],
): void {
  if (secs.length === 0 || profile.length === 0) {
    throw new Error('M60 loft requires at least one section and profile point');
  }
  // smooth runs of consecutive ring indices between creases (ring wraps
  // k(M-1) -> k0 along the flat underside)
  const runs = m60LoftRuns(profile.length, creases);
  for (const run of runs) emitM60LoftRun(P, bucket, secs, profile, run, oy, oz);
  // FLUSH end caps: flat full-ring fans in the exact end-section planes.
  // Own geometry -> flat normals -> a hard cast rim edge (correct), and the
  // bustle tail stops reading as an open-backed box.
  const firstSection = secs[0];
  const lastSection = secs[secs.length - 1];
  if (!firstSection || !lastSection) throw new Error('M60 loft end section is missing');
  emitM60LoftEndCap(P, bucket, firstSection, profile, oy, oz, 1);
  emitM60LoftEndCap(P, bucket, lastSection, profile, oy, oz, -1);
}

// ---------------------------------------------------------------------------
// M60A1/A3: boat hull + the long-nose casting. Rebuilt round-3 against the
// TRUE-AXIS reference trace (docs/references/profiles/m60a1.json decoded to
// world coords) + the gate v10 worst arrays. Key measured landmarks:
//   deck FLAT 1.740 (z -0.45..+1.81), centre engine crown 1.884-1.886 peak
//   (z -1.6..-2.1) easing 1.828 by -3.1; fender band 1.786-1.79; glacis knee
//   (+1.86, 1.675) toe (+3.44, 1.31); bow furniture band 1.52-1.58 over
//   +2.55..+3.41; splash board 1.699-1.710 @ +2.23..+2.45; track flat
//   -2.48..+2.34 with idler (+3.04, 0.85) / sprocket (-2.96, 0.85) 42/34-deg
//   ramps; front mud flap (top 1.297/bot 1.117) to +3.545; rear: centre
//   plate ends -3.28, fender lip 1.84 to -3.39 at |x| 0.85-1.05, mud flap
//   top 1.45 @ -3.44, tail tip 1.35/0.95 to -3.55 (band < 0.39 so
//   hullLengthM keeps its -3.445 anchor); pintle to -3.52 at |x|<0.17.
// ---------------------------------------------------------------------------
function pattonFaceCassette(
  P: PattonBuilderPort,
  bucket: string,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  rx = 0,
  ry = 0,
  rz = 0,
  _rows = 1,
  _cols = 1,
): void {
  const { box, cylZ, xform } = KIT;
  P.add(bucket, box(w, h, d), x, y, z, rx, ry, rz);
  const faceZ = d / 2 + 0.004;
  const detail = bucket === 'hull' ? 'hullDetail' : 'turretDetail';
  // American applique separation comes from the real air gap between
  // cassettes, not an ink-black frame painted over every plate. Keep one
  // subdued, scheme-tinted cover and four attachment heads on the face.
  // `rows`/`cols` remain in the signature for old call sites, but no longer
  // author false dark divider strips through one physical cassette.
  P.add(detail, xform(box(w * 0.84, h * 0.76, 0.008), 0, 0, faceZ),
    x, y, z, rx, ry, rz);
  const boltX = w * 0.34;
  const boltY = h * 0.30;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      P.add(detail, xform(cylZ(Math.min(0.012, h * 0.075), 0.010, 8),
        sx * boltX, sy * boltY, faceZ + 0.008), x, y, z, rx, ry, rz);
    }
  }
}

function pattonGlacisCassette(
  P: PattonBuilderPort,
  deck: ProfileCurve,
  x: number,
  z: number,
  w: number,
  len: number,
  thickness = 0.085,
): void {
  const surfaceY = deckLine(deck);
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const zRear = z - len / 2;
  const zFront = z + len / 2;
  const p00 = new THREE.Vector3(x0, surfaceY(zFront), zFront);
  const p10 = new THREE.Vector3(x1, surfaceY(zFront), zFront);
  const p11 = new THREE.Vector3(x1, surfaceY(zRear), zRear);
  const p01 = new THREE.Vector3(x0, surfaceY(zRear), zRear);
  const normal = new THREE.Vector3().crossVectors(
    p10.clone().sub(p00), p01.clone().sub(p00),
  ).normalize();
  if (normal.y < 0) normal.negate();
  const offset = (point: THREE.Vector3, distance: number): Vec3Tuple => {
    const value = point.clone().addScaledVector(normal, distance);
    return [value.x, value.y, value.z];
  };
  const embedded = -0.008;
  P.add('hull', orientedSlab(
    offset(p00, embedded), offset(p10, embedded),
    offset(p11, embedded), offset(p01, embedded),
    offset(p00, embedded + thickness), offset(p10, embedded + thickness),
    offset(p11, embedded + thickness), offset(p01, embedded + thickness),
  ));
}

function pattonSideCassette(
  P: PattonBuilderPort,
  side: number,
  y: number,
  z: number,
  h: number,
  len: number,
  variant: string,
): void {
  const { box, xform } = KIT;
  if (variant !== 'a2') {
    const bottomY = y - h / 2;
    const topY = y + h / 2;
    const trackClearY = 1.38;
    const outerX = side * 1.8075;
    const trackClearInnerX = side * 1.795;
    const fenderAnchorInnerX = side * 1.7275;
    const z0 = z - len / 2;
    const z1 = z + len / 2;
    // The lower cassette wall sits outside the animated tread envelope. Its
    // upper half then widens inward to the real fender attachment, keeping
    // the requested low side silhouette without putting an armor solid
    // through the live track loop.
    P.add('hull', orientedSlab(
      [trackClearInnerX, bottomY, z0], [outerX, bottomY, z0],
      [outerX, bottomY, z1], [trackClearInnerX, bottomY, z1],
      [trackClearInnerX, trackClearY, z0], [outerX, trackClearY, z0],
      [outerX, trackClearY, z1], [trackClearInnerX, trackClearY, z1],
    ));
    P.add('hull', orientedSlab(
      [trackClearInnerX, trackClearY, z0], [outerX, trackClearY, z0],
      [outerX, trackClearY, z1], [trackClearInnerX, trackClearY, z1],
      [fenderAnchorInnerX, topY, z0], [outerX, topY, z0],
      [outerX, topY, z1], [fenderAnchorInnerX, topY, z1],
    ));
    // Fleet lane round 1 (2026-10-08; accessories wave 255: "a row of near-identical clean rectangles with no ...
    // missing corners or varied hinge heights"): each cassette's face plate takes its own seat (height within 1.5 cm,
    // size within a few per cent), deterministic from its station; the cassette bodies and the outer face line are unchanged (every face keeps the published
    // 1.8165 m line: an inset face moved the hull's outer extent, and with it the watertight census lattice under the
    // generated interior fills).
    const seed = Math.abs(Math.imul(Math.round(z * 1000) + (side > 0 ? 7919 : 0), 0x9e3779b1)) >>> 0;
    const u = (k: number): number => (((seed >>> (k * 8)) & 0xff) / 255);
    const faceX = side * 1.8165;
    const face = box(0.008, h * (0.74 + 0.06 * u(1)), len * (0.80 + 0.06 * u(2)));
    P.add('hullDetail', face, faceX, y + (u(3) - 0.5) * 0.03, z);
    return;
  }
  // The Starship course has to fit between the 1.8155 m published outer
  // envelope and the animated shoe face.  The former 75 mm-deep carrier
  // crossed that narrow lane by roughly 20 mm after the family 0.90 scale,
  // so the strict sweep saw the complete row inside the moving track.  A
  // 40 mm applique shell at the real fender edge preserves the same visible
  // height/length while keeping its inner face clear of both band and shoes.
  const x = side * 1.795;
  const depth = 0.040;
  P.add('hull', box(depth, h, len), x, y, z);
  // Its top 6 cm lap 5 mm under the hull shoulder's outer face (x 1.765), which carries it (owner 2026-10-19 sweep:
  // the shell stood 10 mm off the shoulder along its whole height); that band stands 16 cm over the track's top run.
  P.add('hull', box(0.055, 0.06, len), side * 1.7875, y + h / 2 - 0.03, z);
  const faceX = side * (depth / 2 + 0.004);
  P.add('hullDetail', xform(box(0.008, h * 0.78, len * 0.84), faceX, 0, 0), x, y, z);
}

function pattonSmokeBank(
  P: PattonBuilderPort,
  side: number,
  y: number,
  z: number,
  scale = 1,
): void {
  const { box, cylZ } = KIT;
  const yaw = side * 0.62;
  P.add('turret', box(0.48 * scale, 0.18 * scale, 0.15 * scale), side * 1.17, y - 0.06, z - 0.08, 0, yaw, 0);
  P.add('turretDark', box(0.10 * scale, 0.25 * scale, 0.12 * scale), side * 1.08, y - 0.13, z - 0.16, 0, yaw, 0);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const lx = (col - 1) * 0.13 * scale;
      const px = side * 1.17 + Math.cos(yaw) * lx;
      const pz = z - Math.sin(yaw) * lx + row * 0.06 * scale;
      const py = y + row * 0.085 * scale;
      P.add('turretDetail', markSmokeTube(cylZ(0.043 * scale, 0.28 * scale, 10)), px, py, pz, -0.43, yaw, 0);
      P.add('turretDark', cylZ(0.031 * scale, 0.015, 10),
        px + Math.sin(yaw) * 0.125 * scale, py + 0.052 * scale,
        pz + Math.cos(yaw) * 0.114 * scale, -0.43, yaw, 0);
    }
  }
}

function m60SectionAt(worldZ: number): M60Section {
  const finalFrontSection = M60_SECTIONS[M60_SECTIONS.length - 1];
  if (!finalFrontSection) throw new Error('M60 front casting sections are empty');
  const sections = worldZ >= finalFrontSection.z ? M60_SECTIONS : M60_BUSTLE;
  const first = sections[0];
  if (!first) throw new Error('M60 casting sections are empty');
  if (worldZ >= first.z) return { ...first, hwR: first.hwR ?? first.hw };
  for (let index = 0; index < sections.length - 1; index++) {
    const front = sections[index];
    const rear = sections[index + 1];
    if (!front || !rear) throw new Error('M60 casting section index is invalid');
    if (worldZ <= front.z && worldZ >= rear.z) {
      const mix = (front.z - worldZ) / Math.max(0.001, front.z - rear.z);
      const lerp = (a: number, b: number): number => a + (b - a) * mix;
      return {
        z: worldZ,
        hw: lerp(front.hw, rear.hw),
        hwR: lerp(front.hwR ?? front.hw, rear.hwR ?? rear.hw),
        top: lerp(front.top, rear.top),
        bot: lerp(front.bot, rear.bot),
      };
    }
  }
  const tail = sections[sections.length - 1];
  if (!tail) throw new Error('M60 casting tail section is missing');
  return { ...tail, hwR: tail.hwR ?? tail.hw };
}

function m60CastingPointAt(side: number, worldZ: number, heightFraction: number): THREE.Vector3 {
  const section = m60SectionAt(worldZ);
  const profile: CrossProfile = side < 0
    ? [[-1, 0.29], [-0.94, 0.445], [-0.919, 0.795], [-0.837, 0.927]]
    : [[1, 0.29], [0.23, 0.72], [0.038, 0.915]];
  let a = profile[0], b = profile[1];
  if (!a || !b) throw new Error('M60 casting profile requires two points');
  for (let index = 0; index < profile.length - 1; index++) {
    const nextA = profile[index];
    const nextB = profile[index + 1];
    if (!nextA || !nextB) throw new Error('M60 casting profile index is invalid');
    if (heightFraction >= nextA[1] && heightFraction <= nextB[1]) {
      a = nextA; b = nextB; break;
    }
  }
  const mix = (heightFraction - a[1]) / Math.max(0.001, b[1] - a[1]);
  const fx = a[0] + (b[0] - a[0]) * mix;
  const halfWidth = side > 0 ? (section.hwR ?? section.hw) : section.hw;
  const x = fx * halfWidth;
  const y = section.bot + (section.top - section.bot) * heightFraction;
  return new THREE.Vector3(x, y - 1.76, worldZ - 0.30);
}

function m60CastingSurfaceYAt(worldX: number, worldZ: number): number {
  const section = m60SectionAt(worldZ);
  const halfWidth = worldX >= 0 ? (section.hwR ?? section.hw) : section.hw;
  const fx = Math.max(-1, Math.min(1, worldX / Math.max(halfWidth, 0.001)));
  let a = M60_PROFILE[0], b = M60_PROFILE[1];
  if (!a || !b) throw new Error('M60 surface profile requires two points');
  for (let index = 0; index < M60_PROFILE.length - 1; index++) {
    const nextA = M60_PROFILE[index];
    const nextB = M60_PROFILE[index + 1];
    if (!nextA || !nextB) throw new Error('M60 surface profile index is invalid');
    if (fx >= nextA[0] && fx <= nextB[0]) {
      a = nextA;
      b = nextB;
      break;
    }
  }
  const mix = (fx - a[0]) / Math.max(0.001, b[0] - a[0]);
  const heightFraction = a[1] + (b[1] - a[1]) * mix;
  return section.bot + (section.top - section.bot) * heightFraction;
}

function m60RoofShelfGeometry(py: number, pz: number): THREE.BufferGeometry {
  const x0 = 0.06, x1 = 0.84;
  const z0 = -0.42, z1 = 0.58;
  const topY = 2.715;
  const embeddedY = (x: number, z: number): number => m60CastingSurfaceYAt(x, z) - 0.015;
  return orientedSlab(
    [x0, embeddedY(x0, z0) - py, z0 - pz],
    [x1, embeddedY(x1, z0) - py, z0 - pz],
    [x1, embeddedY(x1, z1) - py, z1 - pz],
    [x0, embeddedY(x0, z1) - py, z1 - pz],
    [x0, topY - py, z0 - pz],
    [x1, topY - py, z0 - pz],
    [x1, topY - py, z1 - pz],
    [x0, topY - py, z1 - pz],
  );
}

function addM60MantletSearchlight(
  P: PattonBuilderPort,
  scale = 1,
  offsetX = 0,
  bodyBottomY = 0.265,
  bodyZ = 0.79,
): void {
  const { box, cylX, cylZ, xform } = KIT;
  const width = 0.40 * scale;
  const height = 0.34 * Math.min(scale, 1.28);
  const depth = 0.73 * Math.min(scale, 1.20);
  const bodyY = bodyBottomY + height / 2;
  const frontZ = bodyZ + depth / 2;
  const lensRadius = 0.12 * Math.min(scale, 1.45);

  // The housing is field-painted armor; only the yoke and hinge stay
  // gunmetal. This removes the former black cube while preserving the real
  // glass aperture and articulated gun ownership.
  P.addGunExtra(box(width, height, depth), offsetX, bodyY, bodyZ);
  P.addGunExtra(box(width, 0.06, depth * 0.47), offsetX, bodyY + height / 2 + 0.03,
    bodyZ + depth * 0.18);
  P.addGunExtra(xform(cylZ(lensRadius + 0.028, 0.045, 22), 0, 0, 0),
    offsetX, bodyY, frontZ + 0.015);
  P.add('gunMountGlass', cylZ(lensRadius, 0.018, 24), offsetX, bodyY, frontZ + 0.042);

  const armX = width * 0.40;
  const armHeight = Math.max(0.12, bodyBottomY - 0.12);
  for (const side of [-1, 1]) {
    P.addGunExtraDark(box(0.06, armHeight, 0.07), offsetX + side * armX,
      0.12 + armHeight / 2, bodyZ + 0.02);
  }
  P.addGunExtraDark(xform(cylX(0.035, armX * 2 + 0.06, 10), 0, 0, 0),
    offsetX, 0.215, bodyZ + 0.02);

  P.gunG.userData.m60SearchlightReceipt = {
    owner: 'rig_gun',
    housingBucket: 'gunMount',
    housingFinish: 'vehicle-paint',
    lensBucket: 'gunMountGlass',
    offsetX,
    housingCenterY: bodyY,
    widthM: width,
    lensDiameterM: lensRadius * 2,
    gunMountTopY: 0.23,
    housingBottomY: bodyBottomY,
    supportGapM: bodyBottomY - 0.23,
    rearFaceZ: bodyZ - depth / 2,
    footprintZ: [bodyZ - depth / 2, bodyZ + depth / 2],
  };
}

function m60EraCellAt(
  side: number,
  worldZ: number,
  heightFraction: number,
  w: number,
  h: number,
  d: number,
  castEmbedM: number,
): EraCell {
  const point = m60CastingPointAt(side, worldZ, heightFraction);
  // Two finite tangents reconstruct the actual loft patch under this one
  // cassette: longitudinal curvature from adjacent z sections and dome
  // curvature from adjacent profile heights.  Building an orthonormal frame
  // from them gives every tile its own pitch, yaw AND roll instead of one
  // flat orientation shared by an entire bank.
  const frontTangent = m60CastingPointAt(side, worldZ + 0.025, heightFraction)
    .sub(m60CastingPointAt(side, worldZ - 0.025, heightFraction));
  const verticalTangent = m60CastingPointAt(side, worldZ, heightFraction + 0.018)
    .sub(m60CastingPointAt(side, worldZ, heightFraction - 0.018));
  const longitudinalRate = Math.max(0.001, frontTangent.length() / 0.05);
  const verticalRate = Math.max(0.001, verticalTangent.length() / 0.036);
  const normal = new THREE.Vector3().crossVectors(verticalTangent, frontTangent)
    .multiplyScalar(side).normalize();
  // Release 233 (owner: the M60s should match the Sabra's quality): every cassette keeps its own surface normal for the
  // seat, but its long edge stays level (the horizontal tangent of that normal) instead of rolling with the needle
  // nose's compound curvature, so a row reads as a fitted course rather than a scatter of tilted bricks.
  const xAxis = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
  if (xAxis.dot(frontTangent) * -side < 0) xAxis.negate();
  const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();
  xAxis.crossVectors(yAxis, normal).normalize();
  const rotation = new THREE.Matrix4().makeBasis(xAxis, yAxis, normal);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(rotation);
  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ');
  // Audit the complete inner face, not just its centre. The original broad
  // A1 cassettes could intersect at the centre while their corners visibly
  // hovered over the compound casting.
  const zHalfSpan = w / (2 * longitudinalRate);
  const heightHalfSpan = h / (2 * verticalRate);
  const supportPlanePoint = point.clone().addScaledVector(normal, -castEmbedM);
  let rawSupportGapM = 0;
  for (const zSign of [-1, 1]) {
    for (const heightSign of [-1, 1]) {
      const sample = m60CastingPointAt(
        side,
        worldZ + zSign * zHalfSpan,
        heightFraction + heightSign * heightHalfSpan,
      );
      rawSupportGapM = Math.max(rawSupportGapM,
        Math.max(0, supportPlanePoint.clone().sub(sample).dot(normal)));
    }
  }
  // Seat the complete inner face, rather than only its centre, against the
  // compound casting. The two-millimetre compression allowance prevents a
  // lighting crack after the merged geometry is quantized while preserving a
  // clearly readable armor face outside the turret skin.
  const seatCompressionM = 0.002;
  const seatCorrectionM = rawSupportGapM + seatCompressionM;
  point.addScaledVector(normal, d / 2 - castEmbedM - seatCorrectionM);
  return {
    x: point.x, y: point.y, z: point.z,
    rx: euler.x, ry: euler.y, rz: euler.z,
    nx: normal.x, ny: normal.y, nz: normal.z,
    w, h, d,
    supportGapM: Math.max(0, rawSupportGapM - seatCorrectionM),
    seatCorrectionM,
    exteriorProjectionM: d - castEmbedM - seatCorrectionM,
  };
}

function addM60A3TurretEra(P: PattonBuilderPort): void {
  const turretPivot = P.spec.armor.turretPivot;
  // Release 233 (owner: the M60s should reach the Sabra's quality): two courses of larger cassettes, three across the
  // cheek and six along the flank, spaced so neighbours never overlap on the needle nose's compound curvature (the
  // former 3 x 5 cheek grid stacked its tilted cells into a scatter).
  const frontTilesPerSide = 6;
  const sideTilesPerSide = 12;
  const castEmbedM = 0.025;
  const cassetteDepthM = 0.090;
  const cells: EraCell[] = [];
  const putTurretLocal = (put: EraPlacement, cell: EraCell): void => put(
    cell.x,
    turretPivot[1] + cell.y,
    turretPivot[2] + cell.z,
    cell.rx, cell.ry, cell.rz,
    cell.w / 0.28, cell.h / 0.13, cell.d / 0.07,
  );

  for (const side of [-1, 1]) {
    const frontCells: EraCell[] = [];
    // (the columns stand 6 cm back from the needle nose: at 1.56 the right cheek's upper cassette spanned the nose's
    // compound curve and its corner-supported seat sank it 6 cm into the casting)
    const frontZ = [1.50, 1.28, 1.06];
    const frontHeights = [0.38, 0.62];
    for (let row = 0; row < frontHeights.length; row++) {
      for (let column = 0; column < frontZ.length; column++) {
        // A regular two-by-three grid is parameterized on the casting.
        // Every column shares one longitudinal station and every row one
        // dome height; the surface normal still makes each cassette hug the
        // compound cheek without producing the former terraced scatter.
        const cell = m60EraCellAt(side, frontZ[column], frontHeights[row],
          0.20, 0.15, cassetteDepthM, castEmbedM);
        frontCells.push(cell);
        cells.push(cell);
      }
    }
    P.eraCluster(`m60a3_turret_era_front_${side > 0 ? 'R' : 'L'}`, (put: EraPlacement) => {
      for (const cell of frontCells) putTurretLocal(put, cell);
    }, true);

    const sideCells: EraCell[] = [];
    const sideZ = [0.32, 0.07, -0.18, -0.43, -0.68, -0.93];
    const sideHeights = [0.38, 0.62];
    for (let row = 0; row < sideHeights.length; row++) {
      for (let column = 0; column < sideZ.length; column++) {
        const cell = m60EraCellAt(side, sideZ[column], sideHeights[row],
          0.22, 0.15, cassetteDepthM, castEmbedM);
        sideCells.push(cell);
        cells.push(cell);
      }
    }
    P.eraCluster(`m60a3_turret_era_side_${side > 0 ? 'R' : 'L'}`, (put: EraPlacement) => {
      for (const cell of sideCells) putTurretLocal(put, cell);
    }, true);
  }

  P.turretG.userData.m60a3EraReceipt = {
    frontTilesPerSide,
    sideTilesPerSide,
    totalTiles: (frontTilesPerSide + sideTilesPerSide) * 2,
    castEmbedM,
    minimumMantletClearanceM: 0.055,
    independentlyStrippableSectors: 4,
    turretLocal: true,
    instanced: false,
    layeredVehicleScaleCamouflage: true,
    layersPerCassette: 2,
    layout: 'surface-parameter-grid',
    alignedRows: 2,
    alignedFrontColumns: 3,
    alignedSideColumns: 6,
    blackOutlineStrips: 0,
    curvedSurfaceNormals: (frontTilesPerSide + sideTilesPerSide) * 2,
    tangentAxesPerTile: 2,
    maximumSupportGapM: Math.max(...cells.map((cell) => cell.supportGapM)),
    maximumSeatCorrectionM: Math.max(...cells.map((cell) => cell.seatCorrectionM)),
    minimumExteriorProjectionM: Math.min(...cells.map((cell) => cell.exteriorProjectionM)),
    maximumExteriorProjectionM: Math.max(...cells.map((cell) => cell.exteriorProjectionM)),
  };
}

/**
 * Release 233 (owner 2026-10-21: the M60A1 and M60A3 "should take inspo from the sabra", and stop looking alike): the
 * US Army M60A3 runs with open running gear under full-length sheet fenders, as fielded, instead of the A1's USMC side
 * armour. Each fender follows the deck line from the bow shoulder to the rear corner package, its outer edge turned
 * down; welded gussets carry it from the sponson wall, and two stowage bins stand on the rear fenders clear of the
 * turret's sweep and the left tow cable.
 */
function finishM60A3Fenders(P: PattonBuilderPort, deck: ProfileCurve): void {
  const { box } = KIT;
  const deckAt = deckLine(deck);
  const inner = 1.70, outer = 1.8075, lipH = 0.065, sheet = 0.022;
  const zFront = 2.04, zRear = -3.30;
  const stations = [zFront, ...deck.map(([z]) => z).filter((z) => z < zFront && z > zRear), zRear];
  for (const side of [-1, 1]) {
    // orientedSlab winds every slab outward, so the left side mirrors its corner points, never the finished geometry
    const slab = (...pts: Vec3Tuple[]): THREE.BufferGeometry => orientedSlab(...pts.map(([x, y, z]) => [side * x, y, z]));
    for (let i = 0; i < stations.length - 1; i++) {
      const z0 = stations[i], z1 = stations[i + 1];
      const t0 = deckAt(z0) - 0.004, t1 = deckAt(z1) - 0.004;
      const fender = slab(
        [inner, t0 - sheet, z0], [outer, t0 - sheet, z0], [outer, t1 - sheet, z1], [inner, t1 - sheet, z1],
        [inner, t0, z0], [outer, t0, z0], [outer, t1, z1], [inner, t1, z1]);
      const lip = slab(
        [outer - 0.012, t0 - lipH, z0], [outer, t0 - lipH, z0], [outer, t1 - lipH, z1], [outer - 0.012, t1 - lipH, z1],
        [outer - 0.012, t0 - sheet, z0], [outer, t0 - sheet, z0], [outer, t1 - sheet, z1], [outer - 0.012, t1 - sheet, z1]);
      P.add('hullDetail', fender);
      P.add('hullDetail', lip);
    }
    // welded gussets under the fender, from the sponson wall out to the turned-down lip
    for (const z of [1.62, 0.70, -0.22, -1.14, -2.06, -2.98]) {
      const top = deckAt(z) - 0.004 - sheet;
      const gusset = slab(
        [inner - 0.004, top - 0.15, z - 0.006], [inner + 0.004, top - 0.15, z - 0.006],
        [inner + 0.004, top - 0.15, z + 0.006], [inner - 0.004, top - 0.15, z + 0.006],
        [inner - 0.004, top + 0.003, z - 0.006], [outer - 0.010, top + 0.003, z - 0.006],
        [outer - 0.010, top + 0.003, z + 0.006], [inner - 0.004, top + 0.003, z + 0.006]);
      P.add('hullDetail', gusset);
    }
    // rear fender stowage bin: lid, hinge line, two hasps
    const binX = side * 1.635, binZ = -2.62, binW = 0.27, binH = 0.25, binL = 0.70;
    const binY = deckAt(binZ) - 0.004 + binH / 2 - 0.003;
    P.add('hullDetail', box(binW, binH, binL), binX, binY, binZ);
    P.add('hullDetail', box(binW + 0.016, 0.022, binL + 0.016), binX, binY + binH / 2 + 0.008, binZ);
    P.add('hullDark', box(0.012, 0.016, binL - 0.06), binX - side * (binW / 2 - 0.02), binY + binH / 2 + 0.002, binZ);
    for (const dz of [-0.22, 0.22]) {
      P.add('hullDark', box(0.010, 0.07, 0.04), binX + side * (binW / 2 + 0.005), binY + binH / 2 - 0.03, binZ + dz);
    }
  }
  P.hullG.userData.m60a3FenderReceipt = Object.freeze({
    designFamily: 'cot-m60a3-open-fender-v1',
    openRunningGear: true,
    fenderFollowsDeck: true,
    innerX: inner,
    outerX: outer,
    zFront,
    zRear,
    gussetsPerSide: 6,
    rearBins: 2,
  });
}

function finishM60HullArmor(
  P: PattonBuilderPort,
  variant: string,
  deck: ProfileCurve,
  a3: boolean,
): void {
  const { box } = KIT;
  if (a3) {
    finishM60A3Fenders(P, deck);
    return;
  }

  // USMC RISE/P-style side protection hangs below the 1.79 m fender datum.
  // A visible rail and short hangers now carry the course; the previous
  // top-aligned row still read like boxes perched on the deck.
  const stations = a3 ? [-2.55, -1.94, -1.33, -0.72, -0.11, 0.50, 1.11, 1.72, 2.33]
    : [-2.48, -1.82, -1.16, -0.50, 0.16, 0.82, 1.48, 2.14];
  const fenderTopY = 1.79;
  const cassetteTopY = 1.56;
  const cassetteHeightM = a3 ? 0.54 : 0.58;
  const cassetteCenterY = cassetteTopY - cassetteHeightM / 2;
  // 2026-10-22 (lane 240; critic: "slatted vertical side plates"): the eight cassettes hung apart on their hangers read
  // as a fence of slats, daylight between them and under the fender. The course now hangs on one continuous skirt
  // plate, fender rail to cassette foot, its face 3 mm behind the cassette bodies (1.8045 against 1.8075) and its inner
  // face outboard of the track envelope (1.7955 against 1.795), with a flange from its top onto the rail: the gaps read
  // as seams between armour tiles on a skirt.
  const cassetteLen = a3 ? 0.52 : 0.57;
  const skirtZ0 = stations[0] - cassetteLen / 2 - 0.025, skirtZ1 = stations[stations.length - 1] + cassetteLen / 2 + 0.025;
  const skirtBottomY = cassetteCenterY - cassetteHeightM / 2 + 0.005, skirtTopY = fenderTopY - 0.02;
  for (const side of [-1, 1]) {
    for (const z of stations) pattonSideCassette(P, side, cassetteCenterY, z,
      cassetteHeightM, cassetteLen, variant);
    P.add('hull', box(0.055, 0.065, 5.45), side * 1.73, fenderTopY - 0.025, -0.10);
    for (const z of stations) {
      P.add('hull', box(0.048, fenderTopY - cassetteTopY + 0.04, 0.052),
        side * 1.73, (fenderTopY + cassetteTopY) / 2 - 0.01, z);
    }
    if (!a3) {
      P.add('hull', box(0.009, skirtTopY - skirtBottomY, skirtZ1 - skirtZ0),
        side * 1.80, (skirtTopY + skirtBottomY) / 2, (skirtZ0 + skirtZ1) / 2);
      P.add('hull', box(0.05, 0.02, skirtZ1 - skirtZ0), side * 1.778, skirtTopY - 0.008, (skirtZ0 + skirtZ1) / 2);
    }
  }
  P.hullG.userData.m60SideCassetteReceipt = {
    variant,
    count: stations.length * 2,
    fenderTopY,
    cassetteTopY,
    cassetteCenterY,
    cassetteBottomY: cassetteCenterY - cassetteHeightM / 2,
    supportRailCenterY: fenderTopY - 0.025,
    hangerCount: stations.length * 2,
    hangerDropM: fenderTopY - cassetteTopY,
    previousCenterY: a3 ? 1.65 : 1.67,
    trackClearanceShoulderY: 1.38,
    trackClearanceInnerX: 1.795,
    exteriorX: 1.8125,
    fenderAnchorInnerX: 1.7275,
    blackOutlineStrips: 0,
  };

  // Glacis kit follows the shallow M60 rake and leaves the driver/periscope
  // lane and both light clusters open.  A1 uses broad early Blazer boxes;
  // A3 uses a finer two-row TTS-era course.
  const glacisRows = a3
    ? [{ z: 2.20, xs: [-1.05, -0.63, -0.21, 0.21, 0.63, 1.05], w: 0.36, d: 0.37 },
      { z: 2.62, xs: [-0.94, -0.47, 0.47, 0.94], w: 0.40, d: 0.34 }]
    : [{ z: 2.18, xs: [-0.96, -0.48, 0.48, 0.96], w: 0.43, d: 0.42 },
      { z: 2.64, xs: [-0.76, -0.25, 0.25, 0.76], w: 0.46, d: 0.36 }];
  for (const row of glacisRows) {
    for (const x of row.xs) pattonGlacisCassette(P, deck, x, row.z, row.w, row.d, 0.090);
  }
  P.hullG.userData.m60GlacisArmorReceipt = Object.freeze({
    carrier: 'upper-glacis-deck-polyline',
    surfaceNormalAligned: true,
    maximumSupportGapM: 0,
    cellCount: glacisRows.reduce((sum, row) => sum + row.xs.length, 0),
    blackOutlineStrips: 0,
    finish: 'vehicle-paint',
  });
}

function finishM60TurretArmor(P: PattonBuilderPort, a3: boolean): void {
  // Needle-casting cheek armor.  Every block is turret-owned, buried into
  // the swept cheek and rotates as part of the complete turret package.
  if (a3) {
    addM60A3TurretEra(P);
  } else {
    const cheekZ = [1.30, 0.84, 0.38];
    const cheekHeights = [0.40, 0.58];
    const castEmbedM = 0.060;
    const cassetteDepthM = 0.105;
    const cells: EraCell[] = [];
    for (const side of [-1, 1]) {
      for (const heightFraction of cheekHeights) {
        for (let i = 0; i < cheekZ.length; i++) {
          const worldZ = cheekZ[i] + P.spec.armor.turretPivot[2];
          const cell = m60EraCellAt(side, worldZ, heightFraction,
            0.42, 0.18, cassetteDepthM, castEmbedM);
          cells.push(cell);
          pattonFaceCassette(P, 'turret', cell.x, cell.y, cell.z, cell.w,
            cell.h, cell.d, cell.rx, cell.ry, cell.rz, 1, 1);
        }
      }
    }
    P.turretG.userData.m60VariantAttachmentReceipt = {
      ...(P.turretG.userData.m60VariantAttachmentReceipt || {}),
      cheekPanels: {
        count: cells.length,
        conformalSurfaceNormals: cells.length,
        courses: cheekHeights.length,
        castEmbedM,
        layout: 'surface-parameter-grid',
        alignedRows: cheekHeights.length,
        alignedColumns: cheekZ.length,
        targetHeightFractions: cheekHeights,
        blackOutlineStrips: 0,
        maximumTileSpanM: Math.max(...cells.map((cell) => Math.max(cell.w, cell.h))),
        maximumSupportGapM: Math.max(...cells.map((cell) => cell.supportGapM)),
        maximumSeatCorrectionM: Math.max(...cells.map((cell) => cell.seatCorrectionM)),
        minimumExteriorProjectionM: Math.min(...cells.map((cell) => cell.exteriorProjectionM)),
        maximumExteriorProjectionM: Math.max(...cells.map((cell) => cell.exteriorProjectionM)),
      },
    };
  }
}

function finishM60VariantFireControl(P: PattonBuilderPort, a3: boolean): void {
  const { box, cylY, cylZ } = KIT;
  // Variant-specific roof and fire-control grammar taken from the supplied
  // A1/A3 models.  Both retain the low M19/M85 station; the A1 keeps its
  // mantlet searchlight while A3 carries paired M239 banks, TTS head and
  // crosswind mast.
  if (a3) {
    pattonSmokeBank(P, -1, 0.61, 0.60, 0.92);
    pattonSmokeBank(P, 1, 0.61, 0.60, 0.92);
    const pivotY = P.spec.armor.turretPivot[1];
    const pivotZ = P.spec.armor.turretPivot[2];
    // 2026-10-19 (owner float sweep): the rangefinder housing stood 57 mm off the cheek armour inboard and below it;
    // its inner face moves 54 mm inboard (x0 0.54 -> 0.486) and its foot sinks 40 mm deeper into the casting
    const x0 = 0.486, x1 = 0.90, z0 = 0.745, z1 = 1.135;
    const topY = 2.72;
    const bottomY = (x: number, z: number): number => m60CastingSurfaceYAt(x, z) - 0.055;
    P.addEquipment('turret', orientedSlab(
      [x0, bottomY(x0, z0) - pivotY, z0 - pivotZ],
      [x1, bottomY(x1, z0) - pivotY, z0 - pivotZ],
      [x1, bottomY(x1, z1) - pivotY, z1 - pivotZ],
      [x0, bottomY(x0, z1) - pivotY, z1 - pivotZ],
      [x0, topY - pivotY, z0 - pivotZ],
      [x1, topY - pivotY, z0 - pivotZ],
      [x1, topY - pivotY, z1 - pivotZ],
      [x0, topY - pivotY, z1 - pivotZ],
    ));
    P.add('turretDark', box(0.32, 0.035, 0.34), 0.72, topY - pivotY + 0.0175,
      0.94 - pivotZ);
    P.add('turretGlass', box(0.24, 0.16, 0.022), 0.72, 2.59 - pivotY,
      z1 - pivotZ + 0.012);
    P.add('turretDark', cylY(0.035, 0.045, 0.42, 10), -0.92, 1.22, -1.12);
    P.add('turretDetail', box(0.18, 0.06, 0.16), -0.92, 1.45, -1.12);
    P.add('turretGlass', box(0.10, 0.035, 0.018), -0.92, 1.45, -1.03);
    for (const z of [1.46, 2.26, 3.08]) P.add('gun', cylZ(0.096, 0.035, 16), 0, 0, z);
    const muzzleReferenceSupportRadiusM = 0.096;
    const muzzleReferenceEmbedM = 0.010;
    const muzzleReferenceHeightM = 0.12;
    const muzzleReferenceCenterY = muzzleReferenceSupportRadiusM
      + muzzleReferenceHeightM / 2 - muzzleReferenceEmbedM;
    P.add('gunDark', box(0.16, muzzleReferenceHeightM, 0.26), 0, muzzleReferenceCenterY, 3.56);
    P.add('gunDark', box(0.10, 0.07, 0.018), 0, muzzleReferenceCenterY, 3.70);
    P.gunG.userData.muzzleReferenceSeatReceipt = Object.freeze({
      designFamily: 'cot-top-mounted-gun-fixture-v1',
      owner: 'rig_recoil',
      alignment: 'barrel-top-centerline',
      bodyBucket: 'gunDark',
      faceBucket: 'gunDark',
      centerX: 0,
      centerY: muzzleReferenceCenterY,
      stationZ: 3.56,
      supportRadiusM: muzzleReferenceSupportRadiusM,
      undersideY: muzzleReferenceCenterY - muzzleReferenceHeightM / 2,
      supportEmbedM: muzzleReferenceEmbedM,
    });
  } else {
    for (const z of [1.56, 2.30, 3.18]) P.add('gun', cylZ(0.096, 0.032, 16), 0, 0, z);
  }

  P.turretG.userData.m60VariantAttachmentReceipt = {
    ...(P.turretG.userData.m60VariantAttachmentReceipt || {}),
    ttsHousing: a3 ? {
      owner: 'rig_turret',
      housingBucket: 'turretEquipment',
      lensBucket: 'turretGlass',
      surfaceEmbeddedM: 0.015,
      duplicateHousingRemoved: true,
    } : null,
  };
}

function finishM60RoofEquipment(P: PattonBuilderPort, a3: boolean): void {
  // Sheridan-derived M2HB is now the common visible American roof weapon.
  // A3 gets the later armored shield; A1 retains the open Vietnam-era plant.
  // 2026-10-08 (round 5; wave 255 on the M60A1: "the thin ring around the cupola pedestal hangs with no visible
  // support. Attach it or remove it"): the M2 stands on its pintle on the cupola roof without an AA ring (the M19
  // cupola has none); the shared Browning construction draws it at true scale.
  const m2 = FITTINGS.americanM2({
    mats: P.mats, tone: 'dark', scale: a3 ? 0.58 : 0.62,
    seed: a3 ? 603 : 601, elev: a3 ? 0.035 : 0.02, ammo: true,
    ammoSide: 1, shield: a3, ring: false, working: true, // VH.14: the M60's cupola M2 is a working station
    rotation: [0, a3 ? -0.06 : 0.04, 0],
  });
  m2.position.set(-0.58, 1.34, 0.20);
  m2.userData.hostVariant = a3 ? 'm60a3-shielded' : 'm60a1-open';
  P.turretG.add(m2);

  // Useful roof clutter with clear attachment: paired antenna bases, a
  // compact electronics/stowage cage and protected auxiliary lamp pods.
  for (const side of [-1, 1]) {
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: a3 ? 0.82 : 0.70,
      r: 0.009, rake: side * 0.055, seed: a3 ? 630 + side : 610 + side });
    whip.position.set(side * 1.02, 0.74, -1.24);
    P.turretG.add(whip);
    const lamp = FITTINGS.lightCluster({ mats: P.mats, pods: 1, r: 0.052,
      rake: -0.14, seed: a3 ? 640 + side : 620 + side });
    lamp.position.set(side * 0.93, 0.48, 0.98);
    P.turretG.add(lamp);
  }
  const rack = FITTINGS.stowageRack({ mats: P.mats, w: 0.78, d: 0.34,
    h: 0.22, posts: 4, rails: 2, fill: a3 ? 0.70 : 0.55,
    seed: a3 ? 6033 : 6011 });
  rack.position.set(0.42, 0.31, -1.54);
  rack.rotation.y = Math.PI;
  P.turretG.add(rack);
  P.turretG.userData.americanModernizationReceipt = {
    standardMachineGun: 'sheridan-m2hb-v2',
    stationVariant: m2.userData.hostVariant,
    guardedAuxiliaryLights: 2,
    antennaWhips: 2,
    equipmentRack: true,
  };
  P.turretG.userData.americanArmorFinishReceipt = Object.freeze({
    eraSeparation: 'physical-panel-gaps',
    outlineGeometry: 0,
    highContrastOutlineMaterial: false,
    mechanicalGunmetalPreserved: true,
  });
  P.gunG.userData.americanGunFinishReceipt = Object.freeze({
    decorativeBlackBands: 0,
    jacketBands: 'painted-relief',
    muzzleBoresDark: true,
    exposedWeaponsGunmetal: true,
  });
}

function finishM60Variant(
  P: PattonBuilderPort,
  variant: string,
  deck: ProfileCurve,
): void {
  const a3 = variant === 'a3';
  finishM60HullArmor(P, variant, deck, a3);
  finishM60TurretArmor(P, a3);
  finishM60VariantFireControl(P, a3);
  finishM60RoofEquipment(P, a3);
}

function applyM60CompactScale(
  P: PattonBuilderPort,
  vehicleScale: number,
  unscaledTopY: number,
): void {
  P.hullG.scale.setScalar(vehicleScale);
  P.turretG.scale.setScalar(vehicleScale);
  P.turretG.position.multiplyScalar(vehicleScale);
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
  P.hullG.userData.m60CompactScaleReceipt = Object.freeze({
    designFamily: 'cot-m60-compact-scale-v2',
    vehicleScale,
    turretPivotScaled: true,
    contactGeometryScaled: true,
    trackHitboxesScaled: true,
  });
  P.topY = unscaledTopY * vehicleScale;
}

function* buildM60Steps(P: PattonBuilderPort, cfg: M60BuildConfig): TankProfileBuild {
  const { box, cylY, cylZ, cylX, xform, liftEye, buildGun, torus, towCable } = KIT;
  const slab = orientedSlab;                                  // §C.1 winding guard
  // SHADED-PARITY r3 item 3 (m60-scoped material lift): 'glass' (near-black
  // metallic) never read as optics on the proof board — the reference pods
  // carry twin PALE lenses. createTankMaterials builds PER-INSTANCE
  // materials, so this scopes to m60a1/m60a3 only. NOTE: an accompanying
  // 'dark' albedo lift was tried and REVERTED — the fleet shade-collapse fix
  // (materials.js 412399e, ambient-floor hook now survives stub contexts)
  // already restored the shade-side gunmetal read, and the extra albedo +
  // metalness pushed sun-facing fittings (searchlight lid, M85 box) to a
  // bare-aluminum tan.
  // r4 tell 2 (glass calm-down, material-only): the r3 pale lens (0x9fb2ba /
  // rough 0.30) BLEW OUT to white on sun-normal tilted panes — the two glacis
  // hood panes were the brightest pixels on the tank (the ref glacis carries
  // NO pale optics), cupola blocks the same family. Smoked glass instead:
  // dark blue-grey albedo with a soft specular hint (rough 0.42 keeps a
  // glassy sheen at closeup, near-invisible at distance like the ref).
  // Measured (tools/tmp-m60-closeround.mjs, board rig): proc front-view
  // brightest pixel is no longer a glass pane and pane median sits below the
  // lit camo plates.
  // round 5 (2026-10-08, wave 255 m60a1-hero: "the turret-front sight window is a saturated blue disc ... real sight
  // glass is dark with a faint coated tint"): the family's blue-grey half-metal pane (0x46525b, metalness 0.50, env
  // 0.3) still mirrored the sky on the gunner's sight. The M60 now wears the fleet's matte smoked optic glass
  // (materials.ts, round 4: dark faintly green, rough 0.58, almost dielectric, a quarter of the sky).
  const buildM60AssemblyStage1 = (): void => {};
  buildM60AssemblyStage1();
  const vehicleScale = 0.90;
  const hull = curveHull(P, cfg.hull);
  const buildM60AssemblyStage2 = (): void => {
    P.mats.spareTrack.color.setHex(0x403c35);
  };
  buildM60AssemblyStage2();
  yield 'buildM60AssemblyStage2';
  // centre engine crown over the fender-level band deck, CAMBERED: full
  // height only |x|<=0.78, wing wedges taper to the band by |x| 1.02 (the
  // reference front-hull columns read 1.82 at x 0.88, 1.79 by 1.08).
  // Release 240 (the owner: "make sure all tank turrets are clear of hulls"): the crown climbs under the turret's
  // rising underside (1.811 to 1.9 m off the ring's axis, 1.840 at 2.0, 1.866 at 2.1, 1.893 at 2.2; authored metres,
  // before the 0.9 vehicle scale) and reaches its 1.886 crest at -2.10; it rose to 1.884 by -1.60 and the turret sat
  // 2.5 cm in it at rest and ran 7 cm through it at the rear bearings.
  const CROWN: Vec2Tuple[] = [
    [-0.45, 1.744], [-1.00, 1.782], [-1.55, 1.800], [-1.75, 1.830], [-1.95, 1.880], [-2.10, 1.886],
    [-2.45, 1.872], [-2.80, 1.849], [-3.10, 1.831], [-3.28, 1.838]];
  const buildM60HullStage1 = (): void => {
    for (let i = 0; i < CROWN.length - 1; i++) {
      const [z0, y0] = CROWN[i], [z1, y1] = CROWN[i + 1];
      P.add('hull', slab(
        [-0.78, 1.70, z0], [0.78, 1.70, z0], [0.77, 1.70, z1], [-0.77, 1.70, z1],
        [-0.78, y0, z0], [0.78, y0, z0], [0.77, y1, z1], [-0.77, y1, z1]));
      for (const side of [-1, 1]) {
        P.add('hull', slab(
          [side * 0.77, 1.70, z0], [side * 1.02, 1.70, z0], [side * 1.02, 1.70, z1], [side * 0.77, 1.70, z1],
          [side * 0.77, y0 - 0.050, z0], [side * 1.02, y0 - 0.058, z0], [side * 1.02, y1 - 0.058, z1], [side * 0.77, y1 - 0.050, z1]));
      }
    }
  };
  buildM60HullStage1();
  yield 'buildM60HullStage1';
  // engine-deck louver banks ON the crown (r3 critique: "engine deck without
  // louvers ... deck reads bare" — the usKit grille bays at y 1.84 sit fully
  // BURIED under the 1.85-1.886 crown). Inset treatment, gate-conservative:
  // dark bay panels +6 mm over the crown surface and slat strips +12 mm,
  // flat-seated per short bay (tops <= 1.904, inside the reference's
  // 1.81-1.91 rear-deck band; no full-width frame rails).
  const crownAt = (z: number): number => {
    for (let i = 0; i < CROWN.length - 1; i++) {
      const [z0, y0] = CROWN[i], [z1, y1] = CROWN[i + 1];
      if (z <= z0 && z >= z1) return y0 + (y1 - y0) * ((z - z0) / (z1 - z0));
    }
    const tail = CROWN[CROWN.length - 1];
    if (!tail) throw new Error('M60 engine crown profile is empty');
    return tail[1];
  };
  const buildM60HullStage2 = (): void => {
    // Fleet lane round 1 (2026-10-07; accessories wave 255: "thin black outline frames lying flat on the deck with the
    // same sand skin showing between the bars ... no louver slats, depth or dark void"): each bay is now a raised
    // 16 mm frame around a dark floor with seven 34-degree louvre vanes inside it, so the lit and shaded vane faces and
    // the dark void between them read as a grille in depth. Tops stay at or under the 1.904 deck-band cap (front bay
    // crown 1.886 + 16 mm frame; vane tops 15 mm).
    // (release 240: both bays 0.10 m aft, the front one's inner corner out of the turret's 1.893 band (2.2-2.3 m off
    // the ring's axis))
    const FRAME = 0.028, FRAME_H = 0.016, VANES = 7, VANE_TILT = 0.6;
    for (const side of [-1, 1]) {
      for (const [gz0, gz1] of [[-2.02, -2.34], [-2.40, -2.70]]) {
        const gm = (gz0 + gz1) / 2, gd = gz0 - gz1, gy = crownAt(gm), gx = side * 0.40, bw = 0.56;
        P.add('hullDark', box(bw, 0.006, gd), gx, gy + 0.003, gm);
        P.add('hullDetail', box(bw + 2 * FRAME, FRAME_H, FRAME), gx, gy + FRAME_H / 2, gz0 + FRAME / 2);
        P.add('hullDetail', box(bw + 2 * FRAME, FRAME_H, FRAME), gx, gy + FRAME_H / 2, gz1 - FRAME / 2);
        for (const dx of [-1, 1]) P.add('hullDetail', box(FRAME, FRAME_H, gd), gx + dx * (bw / 2 + FRAME / 2), gy + FRAME_H / 2, gm);
        const pitch = gd / VANES;
        for (let i = 0; i < VANES; i++) {
          const z = gz0 - (i + 0.5) * pitch;
          P.add('hullDetail', box(bw - 0.012, 0.005, pitch * 0.9), gx, gy + 0.004, z, -VANE_TILT, 0, 0);
        }
      }
    }
    // Broad armored bow shoulders continue the outer fenders into the curved
    // glacis. Closed wedge volumes replace the old narrow ledge, so the front
    // now has the characteristic M60 shoulder mass in head-on and quarter
    // views without widening beyond the native 1.8075 m fender envelope.  Its
    // floor stays above the forward track crown; the former low nose points
    // entered the animated wrap even though the outer face looked correct.
    for (const side of [-1, 1]) {
      P.add('hull', slab(
        [side * 0.42, 1.40, 3.18], [side * 1.79, 1.40, 3.34],
        [side * 1.79, 1.42, 2.08], [side * 0.90, 1.44, 2.10],
        [side * 0.48, 1.53, 3.10], [side * 1.76, 1.53, 3.28],
        [side * 1.75, 1.79, 2.04], [side * 1.08, 1.82, 2.06]));
      P.add('hullDark', box(0.035, 0.055, 1.05), side * 1.765, 1.67, 2.58, 0, 0, side * 0.04);
      for (const z of [2.28, 2.62, 2.96]) {
        P.add('hullDark', cylY(0.022, 0.024, 0.025, 8), side * 1.77, 1.70, z);
      }
    }
    P.hullG.userData.m60FrontShoulderReceipt = Object.freeze({
      designFamily: 'cot-m60-closed-fender-shoulder-v1',
      mirroredClosedVolumes: 2,
      outerX: 1.79,
      innerX: 0.42,
      trackClearanceFloorY: 1.40,
      fenderJoinY: 1.79,
      forwardZ: 3.34,
      rearJoinZ: 2.04,
      texturedCamouflage: true,
    });
    // fender flares: SEGMENTED strips carry the true 3.631 width envelope (the
    // reference's own station at z 0.0..0.5 narrows to 3.343 — its width
    // carriers are panels with a gap there, the round-2 family law).
    // (The M60A3's full-length fenders carry the width instead: finishM60A3Fenders.)
    for (const side of cfg.a3 ? [] : [-1, 1]) {
      P.add('hull', box(hull.hw - 1.70, 0.03, 0.40), side * (1.70 + hull.hw) / 2, 1.732, -0.26);
      P.add('hull', box(hull.hw - 1.70, 0.03, 0.94), side * (1.70 + hull.hw) / 2, 1.732, 1.02);
    }
    // rear corner package (all measured): inner deck lip strips at 1.842,
    // outer fender tips at 1.786 (ending -3.38, clear of the -3.392 trace
    // column boundary); sloped rear plate ends the centre hull at -3.28;
    // kinked rubber mud flaps carry the tail.
    for (const side of [-1, 1]) {
      P.add('hull', box(0.17, 0.028, 0.14), side * 0.955, 1.828, -3.31);
      P.add('hull', box(0.72, 0.025, 0.12), side * 1.425, 1.774, -3.32);
      P.add('hullDark', box(0.16, 0.09, 0.05), side * 1.30, 1.38, -3.28);
      // mud flap: tall sheet joined to the fender tips, kinked at -3.40 to the
      // measured 1.45 ledge, band-thin tail tip (top 1.33/bot 0.97 keeps the
      // 12% body filter from extending hullLengthM past the -3.445 column)
      // Fleet lane round 1 (2026-10-08; accessories wave 255: "brick-like black mudflaps", "featureless black slabs
      // with no rubber flap, bolts, wear or readable function"): the same measured volumes, read as what they are on
      // the vehicle. The fender end and the mudguard bracket behind it are painted sheet steel; the rubber flap hangs
      // from the bracket's rear face under a bolted clamp strip and ends in the thin tail tip. Fender end and bracket ride
      // the painted detail bucket: they are sheet-steel fittings, not the armour envelope the combat anatomy measures.
      P.add('hullDetail', slab(
        [side * 1.02, 0.775, -3.30], [side * 1.78, 0.775, -3.30], [side * 1.78, 0.775, -3.40], [side * 1.02, 0.775, -3.40],
        [side * 1.02, 1.79, -3.30], [side * 1.78, 1.79, -3.30], [side * 1.78, 1.455, -3.40], [side * 1.02, 1.455, -3.40]));
      P.add('hullDetail', box(0.76, 0.675, 0.072), side * 1.40, 1.1125, -3.436);
      P.add('hullRubber', box(0.76, 0.675, 0.018), side * 1.40, 1.1125, -3.481);
      P.add('hullRubber', box(0.76, 0.37, 0.06), side * 1.40, 1.145, -3.52);
      P.add('hullDetail', box(0.72, 0.042, 0.010), side * 1.40, 1.405, -3.495);
      for (let k = 0; k < 5; k++) {
        P.add('hullDark', cylZ(0.0105, 0.010, 6), side * (1.40 + (k - 2) * 0.165), 1.405, -3.504);
      }
    }
    // sloped rear plate (centre): plan rear extent -3.28 at |x| <= 1.0
    P.add('hull', slab(
      [-1.0, 0.97, -3.28], [1.0, 0.97, -3.28], [1.02, 1.02, -3.20], [-1.02, 1.02, -3.20],
      [-1.0, 1.44, -3.28], [1.0, 1.44, -3.28], [1.02, 1.79, -3.20], [-1.02, 1.79, -3.20]));
    usKit(P, hull, cfg.fit);
    // splash board chevron across the glacis (measured 1.699-1.710 @ 2.23..2.45)
    P.add('hullDetail', box(1.15, 0.045, 0.10), -0.55, 1.652, 2.30, -0.28, -0.18, 0);
    P.add('hullDetail', box(1.15, 0.045, 0.10), 0.55, 1.652, 2.30, -0.28, 0.18, 0);
    // periscope/IR hood pods on the glacis (measured band 1.559 @ 2.77..2.99)
    // + glass faces under the hood lips (r3: "no glass anywhere")
    for (const side of [-1, 1]) {
      P.add('hullDetail', box(0.22, 0.105, 0.22), side * 0.35, 1.505, 2.90, -0.10, 0, 0);
      P.add('hullGlass', box(0.16, 0.048, 0.012), side * 0.35, 1.512, 3.006, -0.10, 0, 0);
    }
    // headlight brush-guard hoops + cross bar (measured bow band 1.549-1.559
    // over +3.31..+3.41 — kept under the published-length hull span)
    for (const side of [-1, 1]) {
      for (const dx of [-0.10, 0.10]) {
        P.add('hullDetail', box(0.018, 0.10, 0.20), side * (cfg.fit.lights.x + dx), 1.46, 3.33, -0.22, 0, 0);
      }
      P.add('hullDetail', box(0.24, 0.018, 0.018), side * cfg.fit.lights.x, 1.548, 3.41);
      // front mud flap: wedge from the toe over the idler (ref top 1.297 /
      // bot 1.117 at +3.52, plan front extent +3.545 at the track columns).
      // r3 critique "black void fender box front-left": the wedge is painted
      // steel-backed rubber on the reference — detail (scheme paint) bucket,
      // not raw rubber, lifts it ~2 stops. Same vertices.
      P.add('hullDetail', slab(
        [side * 1.10, 1.10, 3.44], [side * 1.78, 1.10, 3.44], [side * 1.78, 1.10, 3.53], [side * 1.10, 1.10, 3.53],
        [side * 1.10, 1.278, 3.44], [side * 1.78, 1.278, 3.44], [side * 1.78, 1.264, 3.53], [side * 1.10, 1.264, 3.53]));
      // its inboard hanger rises into the toe plate over it (owner 2026-10-19 sweep: the flap hung 11 cm under it, held
      // by nothing)
      P.add('hullDetail', box(0.04, 0.14, 0.05), side * 1.12, 1.335, 3.485);
      // twin lamp pods (r3: "headlights are dark sockets, not lights" — the
      // reference carries a second smaller IR lamp inboard and PALE lenses;
      // the pale read comes from the lifted per-instance glass material)
      P.add('hullDetail', cylZ(0.042, 0.062, 12), side * 0.825, 1.462, 3.085, -0.24, 0, 0);
      P.add('hullGlass', xform(cylZ(0.034, 0.016, 12), 0, 0, 0.033), side * 0.825, 1.462, 3.085, -0.24, 0, 0);
    }
    // left-fender tow cable with cleats (r3 critique: "the cable is the
    // reference's most visible hull-side furniture"). Slim run seated LOW
    // (top = deck +32 mm, matching the ~3 cm high band the reference's own
    // side trace shows over z -0.7..-2.6; the full-height first attempt cost
    // hull -1.3 via registration drift), plan-inside the 1.70 band.
    {
      const cy = (z: number): number => hull.deckAt(z) + 0.014;
      towCable(P, [
        [-1.36, cy(0.30) - 0.010, 0.30], [-1.43, cy(-0.55), -0.55],
        [-1.44, cy(-1.45), -1.45], [-1.36, cy(-2.55) - 0.008, -2.55],
      ], 0.018);
      for (const cz of [-0.55, -1.45]) {
        P.add('hullDetail', box(0.09, 0.032, 0.055), -1.43, hull.deckAt(cz) + 0.010, cz);
      }
    }
    // rear plate: transmission access cover + towing pintle (to -3.52). Fleet lane round 1 (2026-10-08; wave 255: "the
    // black disc with a tan bar ... cannot be identified"): the cover is a painted plate on a ring of bolts with a
    // lifting handle, and the pintle a bracket, stem and open hook jaw
    P.add('hullDetail', cylZ(0.26, 0.02, P.q ? 24 : 12), 0, 1.05, -3.28);
    if (P.q) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        P.add('hullDark', cylZ(0.012, 0.012, 6), Math.sin(a) * 0.225, 1.05 + Math.cos(a) * 0.225, -3.294);
      }
      P.add('hullDark', xform(new THREE.TorusGeometry(0.05, 0.008, 6, 10, Math.PI), 0, 0, 0, 0, 0, 0), 0, 1.03, -3.294);
    }
    P.add('hullDetail', box(0.34, 0.18, 0.06), 0, 1.16, -3.31);
    P.add('hullDetail', cylZ(0.042, 0.07, 8), 0, 1.16, -3.375);
    // the jaw: 261 degrees of forged ring in the vehicle's long vertical plane, its gap turned to the top (latch side);
    // the ring's rear edge keeps the -3.52 rear extent the old pin had, and its throat stays under 4 cm (a wider eye
    // left an open voxel the watertight census reads as a pocket)
    P.add('hullDark', xform(new THREE.TorusGeometry(0.046, 0.026, 6, P.q ? 12 : 8, Math.PI * 1.45), 0, 0, 0, 0, Math.PI / 2, 0),
      0, 1.16, -3.448, 2.435, 0, 0);
    // rear-plate louver wall (r4 tell 3): the r3 patch (4 slats x 1.18 m) left
    // the ref's rear reading "ribbed machinery" vs proc "camo wall with a
    // vent". Full-width treatment now: two mirrored HERRINGBONE banks of
    // diagonal slats (the ref carries two diagonal banks over the upper 2/3 of
    // the plate) across x +-0.13..0.945, y 1.09..1.43, each strip clipped to
    // the bank field. Inset language proven in r3 holds: slat faces at
    // -3.2805 (0.5 mm proud of the measured -3.28 plate plane, zero
    // silhouette); the dark panels behind sit recessed at -3.274 (the widened
    // usKit panel carries the lower band, a second panel carries the upper).
    P.add('hullDark', box(1.90, 0.185, 0.03), 0, 1.3555, -3.259);
  };
  buildM60HullStage2();
  yield 'buildM60HullStage2';
  const buildM60HullStage3 = (): void => {
    {
      // Fleet lane round 1 (2026-10-08; accessories wave 255: "a rear plate that is a blank tan slab with no exhaust
      // grille"): the herringbone strips sat 0.5 mm proud in the plate's own paint over a dark panel buried behind the
      // -3.28 face, so nothing of the grille showed. Each bank is now a dark field 2 mm proud of the plate inside a
      // painted 22 mm frame, its strips angled 0.62 rad outward at the top like louvre vanes so their lit upper faces and
      // the dark gaps read as a grille in depth. Everything stays inside the plan and side outlines the mud flaps,
      // corner strips and pintle already set (|x| <= 0.97, 2.6 cm behind the plate).
      const aSlat = 0.30, sinA = Math.sin(aSlat), cosA = Math.cos(aSlat);
      const y0 = 1.09, y1 = 1.43, yc = (y0 + y1) / 2;
      const PLATE = -3.28, FRAME_W = 0.022, FRAME_D = 0.022, VANE_TILT = 0.62, VANE_W = 0.034, VANE_T = 0.004;
      for (const side of [-1, 1]) {
        const bx0 = 0.13, bx1 = 0.945, bxc = side * (bx0 + bx1) / 2, bw = bx1 - bx0;
        P.add('hullDark', box(bw, y1 - y0, 0.004), bxc, yc, PLATE - 0.002);
        for (const fy of [y0 - FRAME_W / 2, y1 + FRAME_W / 2]) {
          P.add('hullDetail', box(bw + 2 * FRAME_W, FRAME_W, FRAME_D), bxc, fy, PLATE - FRAME_D / 2);
        }
        for (const fx of [bx0 - FRAME_W / 2, bx1 + FRAME_W / 2]) {
          P.add('hullDetail', box(FRAME_W, y1 - y0, FRAME_D), side * fx, yc, PLATE - FRAME_D / 2);
        }
        // slat long axis: rising toward the centre spine on both banks
        const th = side > 0 ? -aSlat : aSlat;
        const dx = Math.cos(th), dy = Math.sin(th);
        const nx = -Math.sin(th), ny = Math.cos(th);
        const maxO = ((bx1 - bx0) / 2) * sinA + ((y1 - y0) / 2) * cosA;
        for (let o = -maxO + 0.016; o <= maxO - 0.010; o += 0.048) {
          const px = bxc + o * nx, py = yc + o * ny;
          // clip the strip centre line to the bank rectangle
          const tx = [(side * bx0 - px) / dx, (side * bx1 - px) / dx].sort((a, b) => a - b);
          const ty = [(y0 - py) / dy, (y1 - py) / dy].sort((a, b) => a - b);
          const t0 = Math.max(tx[0], ty[0]), t1 = Math.min(tx[1], ty[1]);
          if (t1 - t0 < 0.09) continue;
          const tm = (t0 + t1) / 2;
          // the vane: tilted about its own long axis (top edge outboard), then laid on the herringbone line
          const vane = box(t1 - t0 - 0.014, VANE_W, VANE_T).rotateX(-VANE_TILT).rotateZ(th)
            .translate(px + tm * dx, py + tm * dy, PLATE - 0.004 - (VANE_W / 2) * Math.sin(VANE_TILT));
          P.add('hullDetail', vane);
        }
      }
    }
  };
  buildM60HullStage3();
  yield 'buildM60HullStage3';

  const py = 1.76, pz = 0.30;
  const buildM60AssemblyStage3 = (): void => {
    P.turretG.position.set(0, py, pz);
    P.gunG.position.set(0, 2.087 - py, 1.55 - pz);
  };
  buildM60AssemblyStage3();
  yield 'buildM60AssemblyStage3';
  const yl = (y: number): number => y - py;
  const zl = (z: number): number => z - pz;

  // crew basket under the ring (ref cast underside 1.33-1.35 over -0.34..+1.47)
  const buildM60TurretStage1 = (): void => {
    P.add('turretDark', box(1.40, 0.42, 1.79), 0, yl(1.525), zl(0.535));
    // right-cheek stowage bin (the measured long right-side shelf: plan front
    // +1.28 at x 1.25..1.29, +1.06 outboard; front-view tops 2.19 -> 1.90)
    P.add('turret', box(0.04, 0.34, 2.00), 1.265, yl(2.03), zl(0.28), 0.006, 0, 0);
    P.add('turret', slab(
      [1.295, yl(1.86), zl(-0.74)], [1.39, yl(1.86), zl(-0.74)], [1.39, yl(1.86), zl(1.06)], [1.295, yl(1.86), zl(1.06)],
      [1.295, yl(2.19), zl(-0.74)], [1.39, yl(1.98), zl(-0.74)], [1.39, yl(1.98), zl(1.06)], [1.295, yl(2.19), zl(1.06)]));
    P.add('turret', box(0.03, 0.07, 0.64), 1.405, yl(1.895), zl(0.40));
    // the casting, TWO lofts: the crowned front body (left ridge cliff, long
    // low right roof) and the flat-roofed bustle (roof 2.664 to -2.02).
    m60Loft(P, 'turret', cfg.sections, M60_PROFILE, py, pz, M60_PROFILE_CREASES);
    m60Loft(P, 'turret', cfg.bustle, M60_BUSTLE_PROFILE, py, pz, M60_BUSTLE_CREASES);
    // Right roof shelf: keep the measured flat 2.715 m crown for the loader
    // hatch, but extend its underside down into the rounded casting at every
    // corner. The old horizontal box touched only its inner edge and visibly
    // floated over the outer roof slope.
    P.add('turret', m60RoofShelfGeometry(py, pz));
    P.turretG.userData.m60VariantAttachmentReceipt = {
      ...(P.turretG.userData.m60VariantAttachmentReceipt || {}),
      roofShelf: {
        owner: 'rig_turret',
        topWorldY: 2.715,
        surfaceEmbeddedM: 0.015,
        conformalCorners: 4,
      },
    };
    // Fleet lane round 1 (2026-10-08; accessories wave 255: the roof "a few large flat facets ... no weld seams or hatch
    // detail"): the loader's hatch is a welded collar, a lid with its hinge block, handle and two locking dogs, and the
    // periscope housing ahead of it; the hatch keeps its 2.7725 top and footprint
    if (P.q) {
      P.add('turret', cylY(0.124, 0.128, 0.031, 18), 0.56, yl(2.733), zl(-0.05));
      P.add('turret', torus(0.128, 0.007, 18, 5), 0.56, yl(2.719), zl(-0.05));
      P.add('turretDetail', cylY(0.116, 0.118, 0.024, 18), 0.56, yl(2.7605), zl(-0.05));
      P.add('turretDark', box(0.10, 0.026, 0.045), 0.56, yl(2.755), zl(-0.05 - 0.13));
      P.add('turretDark', box(0.05, 0.012, 0.012), 0.625, yl(2.778), zl(-0.05));
      for (const dz of [-0.045, 0.045]) P.add('turretDark', box(0.016, 0.010, 0.024), 0.56 + 0.105, yl(2.765), zl(-0.05 + dz));
      P.add('turretDetail', box(0.10, 0.05, 0.07), 0.56, yl(2.737), zl(-0.05 + 0.185));
      P.add('turretGlass', box(0.07, 0.022, 0.006), 0.56, yl(2.742), zl(-0.05 + 0.222), -0.35, 0, 0);
    } else {
      P.add('turret', cylY(0.115, 0.12, 0.055, 14), 0.56, yl(2.745), zl(-0.05));
      P.add('turretDark', box(0.05, 0.014, 0.15), 0.625, yl(2.782), zl(-0.05));
    }
  };
  buildM60TurretStage1();
  yield 'buildM60TurretStage1';

  // M19 cupola LEFT of the ridge (measured: base ring curve 3.05 @ x -0.88,
  // plateau 3.197 over x -0.43..-0.80 / z +0.09..+0.30). The narrow spine
  // blade on top carries the published 3.27 m height (heightM p95 needs >=4
  // side columns at 3.26 — the oracle's own cupola stops at 3.199; the
  // residual on those columns is the documented dims-sovereign tradeoff).
  const cx = -0.60, cz = zl(0.20);
  const buildM60TurretStage2 = (): void => {
    P.add('turret', cylY(0.28, 0.315, 0.11, P.q ? 20 : 12), cx, yl(3.005), cz);
    // the cupola's weld bead round its base ring (fleet lane round 1)
    if (P.q) P.add('turret', torus(0.317, 0.011, 24, 5), cx, yl(2.954), cz);
    P.add('turret', cylY(0.175, 0.185, 0.09, P.q ? 20 : 12), cx, yl(3.105), zl(0.24));
    // 7 vision blocks: a touch taller than r3 (0.05 -> 0.065, still inside the
    // ring band) with pale glass panes outboard so they read as optics, not
    // sub-pixel black chips (critique item; glass = lifted per-instance mat)
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + 0.3;
      P.add('turretDark', box(0.07, 0.065, 0.024), cx + Math.sin(a) * 0.17, yl(3.118), zl(0.24) + Math.cos(a) * 0.17, 0, a, 0);
      P.add('turretGlass', box(0.05, 0.038, 0.012), cx + Math.sin(a) * 0.181, yl(3.121), zl(0.24) + Math.cos(a) * 0.181, 0, a, 0);
    }
    P.add('turret', cylY(0.180, 0.190, 0.047, P.q ? 20 : 12), cx - 0.01, yl(3.173), zl(0.245));
    P.add('turretDark', box(0.05, 0.074, 0.39), cx, yl(3.223), zl(0.25));
    P.add('turretDark', box(0.11, 0.07, 0.14), cx + 0.05, yl(3.055), zl(0.37));
    P.add('turretDark', cylZ(0.020, 0.20, 8), cx + 0.05, yl(3.045), zl(0.53));

    // grab rails on both cheeks (measured 2.33 @ x 1.21) + sunk lift eyes;
    // r3 readability: 0.022 -> 0.034 stock (still fully inside the wall plan)
    for (const side of [-1, 1]) {
      P.add('turretDetail', box(0.034, 0.034, 1.10), side * 1.22, yl(2.36), zl(0.50));
      // 2026-10-19 (owner float sweep): the rail's posts ended 68 mm over the cheek's swell; they run down into it
      for (const dz of [0.0, 1.00]) P.add('turretDetail', box(0.034, 0.165, 0.034), side * 1.22, yl(2.2775), zl(dz));
    }
    liftEye(P, 'turretDetail', -0.70, yl(3.00), zl(0.45));
    liftEye(P, 'turretDetail', 0.70, yl(2.66), zl(0.62));
  };
  buildM60TurretStage2();
  yield 'buildM60TurretStage2';
  // REAL bustle rack + stowage volume (r4 tell 1, gate-in-loop). The r3
  // roofline-flush frame gated at zero but read only from high angles; the
  // critic's rear-identity list = rails + stowage boxes + jerry can + M19
  // roof ring as a SHADED VOLUME. Rebuilt against the reference GLB's own
  // measured rack envelope (tools/tmp-m60-rack-probe.mjs vertex slices):
  //   - ref rail tops read 2.670-2.687 (only +8..23 mm over the 2.664
  //     roofline — the ref's rack itself is near-flush; its identity is rim
  //     + posts + stowage CONTRAST, not silhouette height);
  //   - the rear wrap runs (+-0.97,-1.80) -> (+-0.45,-1.96), INSIDE our
  //     loft taper plan (casting z-extent -1.86 @ x .97, -1.988 @ x .45);
  //   - the roof tarp ring lies FLAT at (-0.62,-1.24), r ~0.25-0.30;
  //   - a loader-area mast at (0.16..0.20, -0.90..-1.0) tops 2.772-2.778 in
  //     the ref side trace — a ref-only sliver our build was EATING ~0.11
  //     err on: adding it is a measured gate GAIN, not a cost.
  // Trace laws respected: rails at 2.670 (+6 mm, sub-centimeter even if
  // they rasterize; the ref's own thin rails do not — r3 law); everything
  // else tops <= 2.665; side-wall slabs stay inside the plan taper and
  // under the z -0.95 chamfer cover in the front trace (right columns
  // x <= 1.158 are covered to 2.587; nothing new above 2.3 outboard).
  const buildM60TurretStage3 = (): void => {
    {
      const railT = yl(2.656);              // top rail: top face 2.670
      const rseg = (
        b: string,
        y: number,
        x0: number,
        z0: number,
        x1: number,
        z1: number,
        s = 0.034,
      ): void => {
        const len = Math.hypot(x1 - x0, z1 - z0) + s;
        P.add(b, box(s, s, len),
          (x0 + x1) / 2, y, zl((z0 + z1) / 2), 0, Math.atan2(x0 - x1, z0 - z1), 0);
      };
      // top rail along the roof shoulder (LEFT wider than RIGHT: hw vs hwR)
      const RAIL: Record<Side, Vec2Tuple[]> = {
        [-1]: [[-1.025, -1.02], [-1.005, -1.42], [-0.952, -1.78], [-0.45, -1.950]],
        [1]: [[1.015, -1.02], [0.975, -1.42], [0.900, -1.78], [0.45, -1.950]],
      };
      // BASKET rail: stands OFF the wall over the side band (the r4 "rail
      // frame standing off the bustle" read). PLAN-TRACE LAW exploited: the
      // top-down plan mask is covered by the LOW wall bulge (fx 1.0 band at
      // y 1.84-2.09 reaches hw), so a rail INBOARD of hw at any height adds
      // zero plan pixels. The LEFT rail therefore rides HIGH (y 2.647, top
      // 2.658 — still under the 2.664 roofline) at x 1.185, an ~11 cm air
      // gap above the chamfer skin (the reference's own rail-over-chamfer
      // gap read); hanging posts drop into the wall band. FRONT-trace cover:
      // the left cliff covers x 1.196 to y 2.695. The RIGHT side is capped
      // by its z -0.95 chamfer cover line (2.601 at x 1.138) — its rail
      // stays at y 2.589 (top 2.600), a shallower but still-off-the-wall
      // read (the reference is itself asymmetric here: hwR < hw).
      const BASKET: Record<Side, { readonly y: number; readonly pts: Vec2Tuple[] }> = {
        [-1]: { y: yl(2.647), pts: [[-1.040, -1.04], [-1.185, -1.14], [-1.185, -1.50], [-1.070, -1.70], [-0.952, -1.80]] },
        [1]: { y: yl(2.589), pts: [[1.028, -1.04], [1.138, -1.16], [1.138, -1.38], [1.010, -1.62], [0.900, -1.78]] },
      };
      for (const side of [-1, 1] as const) {
        const pts = RAIL[side];
        for (let i = 0; i < pts.length - 1; i++) {
          rseg('turretDark', railT, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
        }
        const bk = BASKET[side];
        for (let i = 0; i < bk.pts.length - 1; i++) {
          rseg('turretDark', bk.y, bk.pts[i][0], bk.pts[i][1], bk.pts[i + 1][0], bk.pts[i + 1][1], 0.030);
        }
        // hanging posts: from the basket rail down across the air gap into
        // the wall band — the post-over-gap rhythm is the side/rear-3/4 read
        const py = side < 0 ? 2.50 : 2.46;
        for (const pz of [-1.16, -1.31, -1.46]) {
          P.add('turretDark', box(0.028, 0.30, 0.028), bk.pts[1][0], yl(py), zl(pz));
        }
        // taper-leg posts + rear wrap drops
        for (const [px, pz] of [[(bk.pts[2][0] + bk.pts[3][0]) / 2, -1.60], [pts[2][0], -1.79],
          [side * 0.68, -1.862], [side * 0.46, -1.938], [side * 0.22, -1.949]]) {
          P.add('turretDark', box(0.028, 0.13, 0.028), px, yl(2.598), zl(pz));
        }
        // tie stubs bridge basket rail -> shoulder (the stand-off read)
        for (const [tz, bi] of [[-1.16, 1], [-1.34, 2], [-1.62, 3]]) {
          const bx = bk.pts[bi][0];
          const sx = side * (Math.abs(bx) - 0.15);
          P.add('turretDark', box(Math.abs(bx - sx) + 0.02, 0.018, 0.018),
            (bx + sx) / 2, yl(side < 0 ? 2.652 : 2.62), zl(tz), 0, 0, side * (side < 0 ? -0.10 : -0.38));
        }
      }
      rseg('turretDark', railT, -0.45, -1.950, 0.45, -1.950); // rear cross
      rseg('turretDark', yl(2.586), -0.44, -1.944, 0.44, -1.944, 0.028);
      rseg('turretDark', railT, -1.02, -1.04, 1.01, -1.04);   // front tie
      // The side wrap remains a reference-specific support rail. Its former
      // rectangular tarp/duffel/jerry-can proxies are deliberately absent:
      // the shared open-lattice basket below now owns all visible rear cargo.
      // M19 roof tarp ring, flat on the bustle roof at the reference's own
      // station (crop (565-760, 330-420)): dark strap ring, top 2.680.
      // KIT torus is already FLAT (normal +y) — no rotation (an rx pi/2 here
      // STOOD the ring up and cost turret side 0.15 err at z -1.19, caught by
      // the gate loop).
      P.add('turretDark', torus(0.275, 0.008, P.q ? 26 : 18), -0.62, yl(2.672), zl(-1.24));
      P.add('turretDark', box(0.05, 0.012, 0.09), -0.62, yl(2.678), zl(-0.975)); // ring latch
      // loader-area periscope/vane mast (ref-only side-trace sliver at
      // z -0.90..-1.00, tops 2.772-2.778 — closing a measured red sliver)
      P.add('turretDark', box(0.05, 0.115, 0.10), 0.18, yl(2.7205), zl(-0.95));
      P.add('turretDark', box(0.085, 0.026, 0.05), 0.18, yl(2.765), zl(-0.93));
    }
  };
  buildM60TurretStage3();
  yield 'buildM60TurretStage3';
  // One shared compact rear basket serves both A1 and A3. The older M60
  // dressing mixed variant-specific gray blocks with differently sized
  // implied racks; this open lattice has a real floor, fence, returns,
  // braces, feet and soft cargo while preserving one identical envelope.
  const m60SharedBustleRack = FITTINGS.stowageRack({
    mats: P.mats,
    w: 1.28,
    d: 0.38,
    h: 0.28,
    rails: 3,
    posts: 7,
    mesh: true,
    fill: 0.72,
    seed: cfg.a3 ? 603 : 601,
    rotation: [0, Math.PI, 0],
  });
  const buildM60RunningGearStage1 = (): void => {
    m60SharedBustleRack.position.set(0, yl(2.29), zl(-2.15));
    m60SharedBustleRack.name = 'm60_shared_open_lattice_bustle';
    m60SharedBustleRack.userData.hostVariant = cfg.a3 ? 'm60a3' : 'm60a1';
    P.turretG.add(m60SharedBustleRack);
    P.turretG.userData.m60SharedBustleReceipt = Object.freeze({
      designFamily: 'cot-open-lattice-bustle-v2',
      envelopeM: Object.freeze([1.28, 0.28, 0.38]),
      identicalAcrossVariants: true,
      solidProxyPanels: 0,
      floorWorldY: 2.29,
      centerWorldZ: -2.15,
    });
    // antenna pot: LEFT-REAR bustle roof (the measured one-column 2.835 spike
    // at z -1.41; front-hidden under the ridge at x -0.38)
    P.add('turretDetail', cylY(0.045, 0.06, 0.10, 8), -0.38, yl(2.714), zl(-1.41));
    P.add('turretDetail', cylY(0.014, 0.018, 0.07, 6), -0.38, yl(2.80), zl(-1.41));
    // right-roof whip base (the measured one-column 2.955 front spike at
    // x +0.84; side-hidden under the crest)
    P.add('turretDetail', cylY(0.020, 0.022, 0.54, 6), 0.835, yl(2.685), zl(-0.05));
    // '123' flank decals: seated 4-5 mm proud of the WELDED bustle wall and
    // yaw-tilted to follow the plan taper (the right wall pinches from hwR —
    // the r3 plane floated 36 mm off it and read as detached at obliques)
    P.decal('turret', 'number', P.spec.visual.number || '', 0.28, [1.225, yl(2.30), zl(-1.20)], Math.PI / 2);
    P.decal('turret', 'number', P.spec.visual.number || '', 0.28, [-1.225, yl(2.30), zl(-1.20)], -Math.PI / 2);

    if (cfg.a3) { // crosswind sensor (the TTS housing is authored once below).
      P.add('turretDetail', cylY(0.030, 0.042, 0.046, 8), 0.35, yl(2.687), zl(-1.62));
      P.add('turretDark', box(0.05, 0.028, 0.05), 0.35, yl(2.696), zl(-1.62));
      // Release 233: the A3's crosswind sensor stands on its own mast above the bustle roof, the M60A3 tell seen from
      // any side: a tapered staff from the stub, the sensor drum and its four vanes.
      P.add('turretDetail', cylY(0.011, 0.016, 0.46, 8), 0.35, yl(2.94), zl(-1.62));
      P.add('turretDetail', cylY(0.034, 0.034, 0.055, 12), 0.35, yl(3.195), zl(-1.62));
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2;
        P.add('turretDark', box(0.006, 0.05, 0.05), 0.35 + Math.sin(a) * 0.055, yl(3.20),
          zl(-1.62) + Math.cos(a) * 0.055, 0, a, 0);
      }
    }

    // M140 mount: cast rotor + canvas boot at the nose throat (kept inside the
    // measured 0.32 plan half-width)
    P.addGunExtra(box(0.56, 0.42, 0.38), 0, 0.02, 0.91);
    P.addGunExtra(xform(cylX(0.17, 0.56, 12), 0, 0, 0), 0, 0.03, 0.97);
    P.addGunExtra(cylZ(0.12, 0.30, 12, 0.10), 0, 0, 1.18);
    P.addGunExtraDark(box(0.48, 0.26, 0.05), 0, -0.03, 0.98);
    if (cfg.searchlight) addM60MantletSearchlight(P,
      typeof cfg.searchlight === 'number' ? cfg.searchlight : 1);
    // M68: bare tube dia 0.164 (measured band 2.001-2.162, axis 2.08), muzzle
    // +5.96, no brake. r3 critique: the kit drum (0.62-long body) read
    // "~0.50 m long ... root-biased; the reference carries a compact
    // ~0.16-0.3 m collar further out" — kit evac off, compact collar built
    // here on the reference's own +3.65..+3.81 band (blends to +3.60/+3.86).
    // (A3 keeps the kit drum: its sleeved tube gates 0.5 weaker against the
    // shared reference with the compact collar — measured this round.)
    buildGun(P, {
      len: cfg.gunLen, r: cfg.sleeve ? 0.076 : 0.082, sleeve: !!cfg.sleeve,
      paintSleeveBands: true,
      evac: cfg.sleeve ? 0.462 : null, evacR: 1.62, collar: false, baseR: 0.15,
    });
    if (!cfg.sleeve) {
      const gseg = P.q ? 20 : 12;
      P.add('gun', cylZ(0.128, 0.16, gseg), 0, 0, 2.18);
      P.add('gun', cylZ(0.128, 0.05, gseg, 0.098), 0, 0, 2.075);
      P.add('gun', cylZ(0.098, 0.05, gseg, 0.128), 0, 0, 2.285);
    }
    // §B3.1 MUZZLE BORE (owner 2026-08-06): the r3 counterbore disc sat with
    // its face 1 mm INSIDE the tube cap (front cfg.gunLen-0.021 vs face
    // len-0.02) — fully enclosed by the solid = invisible (the kv2 r9 "blank
    // bore face" class; end-on crop proved a flat camo cap). Replaced by the
    // shared kit helper (MANDATORY shadow-named mechanism, 3fca39b): rim
    // torus + recessed shadow disc, mask/frame-excluded by construction.
    muzzleBore(P, { len: cfg.gunLen, r: cfg.sleeve ? 0.076 : 0.082 });
    finishM60Variant(P, cfg.a3 ? 'a3' : 'a1', cfg.hull.deck);
    // The broad front shoulders meet the cast glacis around two recessed
    // service pockets on both marks. Back each pocket with a thin hull-owned
    // plate so neither A1 nor A3 leaves an enclosed plan-view hole, while the
    // 1.40 m seat remains safely above the animated forward track wrap.
    for (const side of [-1, 1]) {
      P.add('hull', box(0.36, 0.025, 0.72), side * 0.965, 1.40, 3.22);
    }
    // Release 233: the belly core stops at 1.52 m and the sponson band starts at 1.55 m, leaving a 3 cm slit through the
    // hull under both sponsons. The A1's side armour hid it; the A3's open running gear shows daylight through it. A
    // sponson floor plate overlapping both closes it along the belly's length on both marks.
    P.add('hull', box(1.70, 0.08, 4.83), 0, 1.535, -0.125);
    // ... and the hull side wall stands just inboard of each track (inner shoe edge 1.089 m), from over the return rollers
    // (crowns 1.16 m) to the sponson floor, as on the M60: under the A3's open fenders the eye meets the side plate
    // behind the shock absorbers and roller brackets instead of a 0.9 m void down to the belly core.
    for (const side of [-1, 1]) P.add('hull', box(0.07, 0.27, 4.77), side * 1.035, 1.425, -0.125);
    // Uniformly reduce the complete articulated vehicle. The hull owns the
    // running gear and side protection; the turret owner contains its gun and
    // every roof fitting, so all attachment relationships survive unchanged.
    applyM60CompactScale(P, vehicleScale, 3.26 - py + 0.12);
  };
  buildM60RunningGearStage1();
}

// ---------------------------------------------------------------------------
// M60A2 Starship — FIRST BUILD (r2, 2026-08-04) against the full vertex
// extract (docs/references/vertex/m60a2.json; ref hull mask -3.708..+3.518,
// stylization: hullMask +4% / height +6% vs published — dims stay sovereign).
// Shares curveHull/usKit/loftBody; the A1 crown constants do NOT fit this
// print (its rear deck crowns 2.18 vs the A1's 1.886), so the hull chain is
// re-authored in the extract frame. Published dims 6.95/7.27/3.63/3.11.
// ---------------------------------------------------------------------------
function finishM60A2Variant(
  P: PattonBuilderPort,
  muzzleZ: number,
  deck: ProfileCurve,
): void {
  const { box, cylZ, torus } = KIT;

  // Starship modernization course.  It deliberately stops above the native
  // road wheels and does not touch the linked track, idler or sprocket.
  const sideCassetteCenterY = 1.34;
  const sideCassetteHeightM = 0.48;
  const sideCassetteTopY = sideCassetteCenterY + sideCassetteHeightM / 2;
  const sideStations = [-2.62, -1.98, -1.34, -0.70, -0.06, 0.58, 1.22, 1.86, 2.50];
  for (const side of [-1, 1]) {
    for (const z of sideStations) {
      pattonSideCassette(P, side, sideCassetteCenterY, z, sideCassetteHeightM, 0.54, 'a2');
      // 2026-10-19 (owner float sweep): on the A2 the cassettes hung 90 mm under the 1.67 rail with nothing inboard
      // carrying them; two hanger straps per cassette now run from its top band up into the rail.
      for (const dz of [-0.16, 0.16]) P.add('hullDetail', box(0.03, 0.13, 0.05), side * 1.76, sideCassetteTopY + 0.04, z + dz);
    }
    P.add('hullDetail', box(0.050, 0.060, 5.72), side * 1.73, 1.70, -0.08);
  }
  P.hullG.userData.m60SideCassetteReceipt = Object.freeze({
    variant: 'a2',
    count: sideStations.length * 2,
    fenderTopY: 1.805,
    cassetteTopY: sideCassetteTopY,
    cassetteCenterY: sideCassetteCenterY,
    cassetteBottomY: sideCassetteCenterY - sideCassetteHeightM / 2,
    supportRailCenterY: 1.70,
    hangerCount: sideStations.length * 2,
    previousCenterY: 1.42,
    cassetteDepthM: 0.040,
    trackClearanceInnerX: 1.775,
    exteriorX: 1.815,
    blackOutlineStrips: 0,
  });
  for (const row of [
    { z: 2.18, xs: [-1.05, -0.63, -0.21, 0.21, 0.63, 1.05], w: 0.36, d: 0.36 },
    { z: 2.63, xs: [-0.88, -0.44, 0.44, 0.88], w: 0.38, d: 0.34 },
  ]) {
    for (const x of row.xs) pattonGlacisCassette(P, deck, x, row.z, row.w, row.d, 0.090);
  }
  P.hullG.userData.m60GlacisArmorReceipt = Object.freeze({
    carrier: 'upper-glacis-deck-polyline',
    surfaceNormalAligned: true,
    maximumSupportGapM: 0,
    cellCount: 10,
    blackOutlineStrips: 0,
    finish: 'vehicle-paint',
  });

  // The Starship keeps its defining tower and 152 mm shield, but the armor
  // now reads as a deliberate two-by-five surface grid rather than four
  // oversized, individually outlined boxes scattered along each wall.
  for (const side of [-1, 1]) {
    for (let row = 0; row < 2; row++) {
      const y = 0.39 + row * 0.245;
      for (let column = 0; column < 5; column++) {
        const z = 0.88 - column * 0.42;
        P.add('turret', box(0.090, 0.205, 0.36), side * 1.205, y, z);
        P.add('turretDetail', box(0.008, 0.158, 0.29), side * 1.254, y, z);
      }
    }
    pattonSmokeBank(P, side, 0.54, 0.92, 0.76);
  }
  P.turretG.userData.m60a2EraGridReceipt = Object.freeze({
    layout: 'surface-aligned-grid',
    rowsPerSide: 2,
    columnsPerSide: 5,
    totalCassettes: 20,
    blackOutlineStrips: 0,
    finish: 'vehicle-paint-with-scheme-detail-covers',
  });

  // Rebuild the 152 mm installation as a layered gun/launcher plant:
  // accordion boot collars, reinforced trunnion ring, missile-reference
  // box, and a heavy muzzle rim.  All pieces pitch with the gun.
  for (const z of [0.76, 0.94, 1.12]) {
    P.addGunExtra(cylZ(0.23 - (z - 0.76) * 0.16, 0.040, 16), 0, 0, z);
  }
  P.addGunExtra(torus(0.25, 0.025, 20), 0, 0, 0.72);
  // Seat the searchlight directly against the launcher shield instead of
  // leaving its housing proud of the mantlet.  The shield aperture is
  // slightly asymmetric (-0.40..+0.41), so +0.005 is its true centre; the
  // housing rear face now lands exactly on the z=0.806 gun-local face.
  addM60MantletSearchlight(P, 0.72, 0.005, 0.2326, 1.0688);
  P.add('gun', cylZ(0.17, 0.035, 18), 0, 0, muzzleZ - 0.04);

  // Full modernization centerpiece: a compact TTS-derived remotely operated
  // M2 tower buried into the Starship roof, backed by a dedicated sensor box
  // and bustle service equipment.  This replaces the former rack-stowed gun
  // as the visible defensive station without altering the 152 mm gun rig.
  const rws = FITTINGS.americanRws({
    mats: P.mats, variant: 'hunter', scale: 0.72, seed: 6022,
  });
  rws.position.set(-0.58, 0.82, -0.34);
  rws.userData.hostVariant = 'm60a2-starship-hunter';
  P.turretG.add(rws);
  for (const side of [-1, 1]) {
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 0.86, r: 0.009,
      rake: side * 0.07, seed: 6200 + side });
    whip.position.set(side * 0.96, 0.78, -1.24);
    P.turretG.add(whip);
    const lamp = FITTINGS.lightCluster({ mats: P.mats, pods: 1, r: 0.060,
      rake: -0.15, seed: 6250 + side });
    lamp.position.set(side * 0.88, 0.53, 0.92);
    P.turretG.add(lamp);
  }
  const serviceRack = FITTINGS.stowageRack({ mats: P.mats, w: 1.28, d: 0.44,
    h: 0.30, posts: 7, rails: 3, mesh: true, fill: 0.72, seed: 6020 });
  serviceRack.position.set(0, 0.29, -2.02);
  serviceRack.rotation.y = Math.PI;
  serviceRack.name = 'm60a2_open_lattice_bustle';
  P.turretG.add(serviceRack);
  P.turretG.userData.m60A2BustleReceipt = Object.freeze({
    designFamily: 'cot-open-lattice-bustle-v2',
    envelopeM: Object.freeze([1.28, 0.30, 0.44]),
    attachedToTurret: true,
    centerTurretLocal: Object.freeze([0, 0.29, -2.02]),
  });
  P.turretG.userData.americanModernizationReceipt = {
    standardMachineGun: 'sheridan-m2hb-v2',
    stationFamily: 'm551a1-tts-derived-v1',
    stationVariant: 'hunter',
    guardedAuxiliaryLights: 2,
    antennaWhips: 2,
    equipmentRack: true,
    properMantletSearchlight: true,
    rearBustle: true,
  };
  P.turretG.userData.americanArmorFinishReceipt = Object.freeze({
    eraSeparation: 'physical-panel-gaps',
    outlineGeometry: 0,
    highContrastOutlineMaterial: false,
    mechanicalGunmetalPreserved: true,
  });
  P.gunG.userData.americanGunFinishReceipt = Object.freeze({
    decorativeBlackBands: 0,
    jacketBands: 'painted-relief',
    muzzleBoresDark: true,
    exposedWeaponsGunmetal: true,
  });

}

function addM60A2EngineDeck(P: PattonBuilderPort): void {
  const { box } = KIT;
  const slab = orientedSlab;                                  // §C.1 winding guard
  // cambered engine crown (extract: shoulder 2.005 @ -0.66..-0.92 rising to
  // the 2.18 peak @ -2.20, easing 1.98 by the -3.60 rear plate; full height
  // only |x|<=0.45, wings taper to the 1.97 shoulder at +-0.95 — the ref
  // front rolls 2.18 @ 0.44 -> 1.98 @ 0.95)
  // Release 240 (the owner: "make sure all tank turrets are clear of hulls"): the crown holds 1.92-1.93 out to 2.0 m
  // off the ring's axis, under the Starship turret's seated floor (1.931), climbs under its rising underside (1.956 at
  // 2.0 m, 2.036 at 2.2, 2.109 at 2.4, 2.130 at 2.6, 2.150 at 2.7) and crests at 2.14 past its reach (-2.42..-2.55); the
  // extract's 2.0-2.18 crown stood 12-18 cm in the turret at rest and ran through it at every rear bearing.
  const CROWN = [
    [-0.62, 1.92], [-1.55, 1.925], [-1.62, 1.93], [-1.75, 1.955], [-2.05, 2.075], [-2.25, 2.118],
    [-2.32, 2.122], [-2.42, 2.14], [-2.55, 2.14], [-3.05, 2.08], [-3.35, 2.04], [-3.60, 1.96]];
  const crownAt = (z: number): number => {
    for (let i = 0; i < CROWN.length - 1; i++) {
      const [z0, y0] = CROWN[i], [z1, y1] = CROWN[i + 1];
      if (z <= z0 && z >= z1) return y0 + (y1 - y0) * ((z - z0) / (z1 - z0));
    }
    const tail = CROWN[CROWN.length - 1];
    if (!tail) throw new Error('M60A2 engine crown profile is empty');
    return tail[1];
  };
  for (let i = 0; i < CROWN.length - 1; i++) {
    const [z0, y0] = CROWN[i], [z1, y1] = CROWN[i + 1];
    P.add('hull', slab(
      [-0.45, 1.80, z0], [0.45, 1.80, z0], [0.44, 1.80, z1], [-0.44, 1.80, z1],
      [-0.45, y0, z0], [0.45, y0, z0], [0.44, y1, z1], [-0.44, y1, z1]));
    for (const side of [-1, 1]) {
      P.add('hull', slab(
        [side * 0.44, 1.80, z0], [side * 0.95, 1.80, z0], [side * 0.95, 1.80, z1], [side * 0.44, 1.80, z1],
        [side * 0.44, y0 - 0.004, z0], [side * 0.95, Math.min(y0, 1.97), z0],
        [side * 0.95, Math.min(y1, 1.97), z1], [side * 0.44, y1 - 0.004, z1]));
    }
  }
  // louver bays on the crown (inset language, m60a1 r3 lineage; kept inside
  // the full-height |x|<=0.44 camber so the wing roll stays clean)
  // (release 240: both bays aft of the turret's reach, -2.47..-3.22, on the crest and its fall)
  for (const side of [-1, 1]) {
    for (const [gz0, gz1] of [[-2.47, -2.82], [-2.87, -3.22]]) {
      const gm = (gz0 + gz1) / 2;
      const gy = crownAt(gm);
      P.add('hullDark', box(0.40, 0.012, gz0 - gz1), side * 0.235, gy + 0.002, gm);
      for (let i = 0; i < 4; i++) {
        P.add('hullDetail', box(0.36, 0.012, (gz0 - gz1) / 4 * 0.55), side * 0.235, gy + 0.006, gz0 - (i + 0.5) * ((gz0 - gz1) / 4));
      }
    }
  }
}

function addM60A2ShoulderArmor(P: PattonBuilderPort, cfg: M60A2BuildConfig): void {
  const { box } = KIT;
  const slab = orientedSlab;
  // Full Starship upper-side course. The segmented roof plates begin on the
  // glacis shoulder, follow the deck rise and meet the raised rear sponson at
  // z=-1.60. Their inboard edge is buried in the 1.19 m hull band; the
  // outboard rail stays above the exact moving-track sweep.
  // Release 240 (the owner: "make sure all tank turrets are clear of hulls"): the shelves hold 1.86 to -1.27 and the
  // rise to the raised rear course runs -1.27..-1.60, under the turret's floor (1.931 to 2.0 m off the ring's axis) and
  // its rising underside; the rise at -0.60..-0.92 stood 8-10 cm in it at the rear-quarter bearings.
  const UPPER_SIDE_RUN = [
    [3.30, 1.50], [2.95, 1.66], [2.35, 1.76], [1.82, 1.82],
    [0.62, 1.84], [-0.60, 1.86], [-1.27, 1.86], [-1.60, 2.005],
  ];
  const shoulderInner = 1.185;
  const shoulderOuter = 1.765;
  for (const side of [-1, 1]) {
    for (let i = 0; i < UPPER_SIDE_RUN.length - 1; i++) {
      const [z0, y0] = UPPER_SIDE_RUN[i];
      const [z1, y1] = UPPER_SIDE_RUN[i + 1];
      const dz = z0 - z1;
      const dy = y0 - y1;
      const run = Math.hypot(dz, dy);
      const rx = -Math.atan2(dy, dz);
      const z = (z0 + z1) * 0.5;
      const y = (y0 + y1) * 0.5;
      P.add('hull', box(shoulderOuter - shoulderInner, 0.055, run),
        side * (shoulderInner + shoulderOuter) * 0.5, y, z, rx, 0, 0);
      P.add('hullDetail', box(0.045, 0.085, run),
        side * (shoulderOuter - 0.012), y - 0.012, z, rx, 0, 0);
    }
    // Backed hangers make the long shelves read as hull-supported rather
    // than thin decoration, while remaining well above the shoe envelope.
    for (const [z, y] of UPPER_SIDE_RUN.slice(1, -1)) {
      P.add('hullDetail', box(0.075, 0.16, 0.075),
        side * (shoulderOuter - 0.055), y - 0.095, z);
    }
  }
  // The raised Starship rear course is an armored sponson shoulder, not an
  // unsupported fender.  The old hull stopped at |x|=1.19 and left only the
  // 35 mm roof plate spanning to the track edge, so low quarter views could
  // see straight through the volume below it.  Seal that volume with a
  // mirrored, camouflaged hull wall: the front wedge follows the exact
  // -1.27 -> -1.60 roof rise and the two aft cells continue to the rear deck.
  // Its 1.48 m floor clears the authored track crown (1.41 m) by 70 mm while
  // overlapping both the native hull band inboard and the roof plate above.
  const shoulderBottomY = 1.48;
  const SHOULDER_RUN: Vec2Tuple[] = [
    [-0.60, 1.86], [-1.27, 1.86], [-1.60, 2.005], [-2.45, 2.005], [-3.50, 2.005],
  ];
  for (const side of [-1, 1]) {
    const innerX = side * shoulderInner;
    const outerX = side * shoulderOuter;
    for (let i = 0; i < SHOULDER_RUN.length - 1; i++) {
      const [z0, topY0] = SHOULDER_RUN[i];
      const [z1, topY1] = SHOULDER_RUN[i + 1];
      P.add('hull', slab(
        [innerX, shoulderBottomY, z0], [outerX, shoulderBottomY, z0],
        [outerX, shoulderBottomY, z1], [innerX, shoulderBottomY, z1],
        [innerX, topY0, z0], [outerX, topY0, z0],
        [outerX, topY1, z1], [innerX, topY1, z1]));
    }
  }
  if (P.geometryReceipt) {
    const firstShoulder = SHOULDER_RUN[0];
    const lastShoulder = SHOULDER_RUN[SHOULDER_RUN.length - 1];
    if (!firstShoulder || !lastShoulder) throw new Error('M60A2 shoulder run is empty');
    const trackCrownY = cfg.hull.gear.sprocket.y + cfg.hull.gear.sprocket.r + 0.09;
    P.hullG.userData.m60a2SideShoulderReceipt = {
      panels: 6,
      innerX: shoulderInner,
      outerX: shoulderOuter,
      bottomY: shoulderBottomY,
      frontZ: firstShoulder[0],
      rearZ: lastShoulder[0],
      roofMinY: firstShoulder[1],
      roofMaxY: lastShoulder[1],
      trackCrownY,
      trackClearanceM: shoulderBottomY - trackCrownY,
      roofOverlapM: 0.0175,
      mergedHullDrawCalls: 0,
    };
  }
}

function addM60A2HullFurniture(P: PattonBuilderPort, _cfg: M60A2BuildConfig): void {
  const { box, cylZ } = KIT;
  const slab = orientedSlab;
  // outer skirt lip to 1.78 (ref front 1.85 at 1.75-1.79), then the LOW
  // full-length side flap panels at 1.79-1.815 (ref front band 0.76..1.40
  // at +-1.81; stations carry the 3.63 width) — segmented <=0.44 m per the
  // station end-cap law
  for (const side of [-1, 1]) {
    // push round r2: the WIDE lip experiment reverted — the ref's front
    // view keeps everything above y 1.40 inside |x| 1.79 (col +-1.812 reads
    // 1.403); its published 3.63 width lives on LOW boards/flaps. Lip at
    // 1.782 (ref side-skirt line), y 1.805.
    P.add('hull', box(0.087, 0.030, 5.82), side * 1.7385, 1.805, -0.71);
    // low rear mud board (ref station i1 reads 1.812 wide at z -3.19..-2.68
    // with front-view tops <=1.40): thin, below the deck line, unions with
    // the flaps for the widthM 0.35-band rule
    P.hangMudguard('m60a2-rear-skirt-flap', 'hullRubber', box(0.019, 0.40, 0.51), side * 1.807, 1.20, -2.935);
    // ONE rear flap panel per side (containment: mid-hull panels clipped
    // the climbing top run; the -3.43..-3.64 span feeds BOTH tail width
    // stations, stays thin for the body filter and ahead of the -3.6575
    // overall anchor). Push round: bottom TAPERED 0.75 @ -3.36 -> 0.93 @
    // -3.64 (front cols +-1.81 read ref 0.752; side col -3.647 reads 0.931)
    P.hangMudguard('m60a2-skirt-flap', 'hullRubber', orientedSlab(
      [side * 1.7965, 0.75, -3.36], [side * 1.8155, 0.75, -3.36], [side * 1.8155, 0.93, -3.64], [side * 1.7965, 0.93, -3.64],
      [side * 1.7965, 1.40, -3.36], [side * 1.8155, 1.40, -3.36], [side * 1.8155, 1.40, -3.64], [side * 1.7965, 1.40, -3.64]));
    P.add('hullDetail', box(0.0075, 0.62, 0.035), side * 1.7925, 1.52, -3.50);
  }
  // right-side flap top board (the live pair reads the RIGHT flap band to
  // 1.848 while the left stops at 1.399 — asymmetric print)
  P.hangMudguard('m60a2-rear-flap', 'hullRubber', box(0.019, 0.42, 0.28), 1.806, 1.61, -3.50);
  // toe tip plates + front mud flaps (thin: hullLengthM keeps its fat-column
  // anchor at the glacis while the tip closes the ref's bow columns; the
  // 3.415..3.50 extension is sub-12%-band, so the body anchor holds)
  P.add('hull', slab(
    [-1.30, 1.13, 3.415], [1.30, 1.13, 3.415], [1.30, 1.16, 3.30], [-1.30, 1.16, 3.30],
    [-1.30, 1.34, 3.415], [1.30, 1.34, 3.415], [1.30, 1.50, 3.30], [-1.30, 1.50, 3.30]));
  // (no tip extension past 3.415: the launcher tube overlaps these columns,
  // so the 12%-band filter reads them FAT — the body anchor follows the tip
  // end exactly; 3.505 measured hullLengthM 7.10, -2.2%. Push round: tip
  // band re-read fat vs the fresh pair — ref col 3.375 spans 1.425..1.112.)
  for (const side of [-1, 1]) {
    P.add('hullRubber', slab(
      [side * 1.30, 1.14, 3.40], [side * 1.8155, 1.14, 3.40], [side * 1.8155, 1.17, 3.29], [side * 1.30, 1.17, 3.29],
      [side * 1.30, 1.26, 3.40], [side * 1.8155, 1.26, 3.40], [side * 1.8155, 1.32, 3.29], [side * 1.30, 1.32, 3.29]));
  }
  // rear plate + THIN tail flaps to the -3.6575 overall anchor (the ref
  // tail band reads 1.415..1.478 — a fat flap would extend hullLengthM)
  P.add('hull', slab(
    [-1.00, 0.95, -3.60], [1.00, 0.95, -3.60], [1.02, 1.00, -3.47], [-1.02, 1.00, -3.47],
    [-1.00, 1.44, -3.60], [1.00, 1.44, -3.60], [1.02, 1.863, -3.47], [-1.02, 1.863, -3.47]));
  // Close the two formerly open over-track shoulders. The closures key into
  // the central rear bulkhead, climb under the fender deck and stop above the
  // sprocket crest, so the rear reads as one armored structure without hiding
  // the live track wrap. They merge into the camouflaged hull bucket (zero
  // additional draw calls and no unpainted void-facing material).
  for (const side of [-1, 1]) {
    const inner = side * 1.00;
    const outer = side * 1.72;
    P.add('hull', orientedSlab(
      [inner, 1.40, -3.60], [outer, 1.40, -3.57],
      [outer, 1.48, -3.42], [side * 1.02, 1.44, -3.47],
      [inner, 1.85, -3.60], [outer, 1.92, -3.57],
      [outer, 2.01, -3.42], [side * 1.02, 1.89, -3.47]));
  }
  if (P.geometryReceipt) {
    P.hullG.userData.m60a2RearClosureReceipt = {
      panels: 2,
      innerX: 1.00,
      outerX: 1.72,
      bottomY: 1.40,
      topY: 2.01,
      rearZ: -3.60,
      frontZ: -3.42,
      deckOverlapM: 0.02,
      mergedHullDrawCalls: 0,
    };
  }
  for (const side of [-1, 1]) {
    P.add('hullRubber', box(0.50, 0.13, 0.075), side * 1.44, 1.525, -3.6125);
    P.add('hullRubber', box(0.46, 0.08, 0.045), side * 1.44, 1.52, -3.635);
  }
  P.add('hullDetail', box(0.34, 0.18, 0.06), 0, 1.18, -3.615);
  P.add('hullDetail', cylZ(0.05, 0.08, 8), 0, 1.18, -3.60);
  // splash board on the glacis shoulder (push round: fresh ref side reads
  // 1.822 over z 1.79..2.04 — the 1.837 top sat one quant proud)
  P.add('hullDetail', box(1.90, 0.042, 0.10), 0, 1.801, 1.81);
  // sponson side skids: the ref's front-view floor steps 0.58 centre ->
  // 0.40 at |x| 0.98-1.19 (its sponson boxes hang between the runs)
  for (const bz of [1.55, 0.15, -1.35]) {
    for (const side of [-1, 1]) {
      P.add('hullDetail', box(0.21, 0.81, 0.55), side * 1.085, 0.805, bz);
    }
  }
  // headlight brush guards on the 1.657 bow band
  for (const side of [-1, 1]) {
    P.add('hullDetail', box(0.24, 0.055, 0.30), side * 0.90, 1.632, 2.62);
    P.add('hullDetail', box(0.02, 0.10, 0.26), side * 1.00, 1.585, 2.62);
  }
}

function addM60A2TurretAndGun(P: PattonBuilderPort, cfg: M60A2BuildConfig): void {
  const { box, cylY, cylZ, cylX, xform, liftEye } = KIT;
  const slab = orientedSlab;
  const py = 1.90, pz = 0.38;
  P.turretG.position.set(0, py, pz);
  P.gunG.position.set(0, 2.27 - py, 1.55 - pz);
  const yl = (y: number): number => y - py;
  const zl = (z: number): number => z - pz;

  // deep crew basket (push round fresh pair: the ref turret-bucket floor
  // runs z -0.60..+1.42 down to y 1.153 — side_turret's worst column was
  // the old 1.30 front face reading proc bottom 1.87 vs ref 1.15; r2: the
  // 1.445 front overshot INTO the 1.452 column the ref keeps at 1.87)
  P.add('turretDark', box(1.45, 0.75, 1.99), 0, yl(1.525), zl(0.392));
  // the Starship tower: narrow tall casting, left-biased (plan xL -1.29 /
  // xR +1.075 -> shiftX -0.11), forehead climbing to the flat top; the ref
  // top plateau reads 3.25-3.30 but published height 3.11 governs (p95
  // grace 3.141) — the plateau is authored 3.135 and the delta is the
  // documented dims-sovereign cost of this +6%-tall print (cap candidate).
  loftBody(P, 'turret', cfg.sections, {
    oy: py, oz: pz, wall: 0.62, mid: 0.82, midW: 0.80, crownW: 0.52, crownX: -0.05, shiftX: -0.11,
  });
  // crest plateau (push round fresh pair: ref crest 3.24-3.31 over x -0.89..
  // +0.20 with ONE smooth rake falling 3.27 @ +0.19 -> 2.79 @ +0.64 — the
  // old right step slabs + roll-step box were a §B1 staircase; height-capped
  // at 3.135 the ref rake crosses our cap near x 0.42, so the capped shape
  // is plateau-to-0.42 + a single raked surface to the 2.797 roof)
  P.add('turret', slab(
    [-0.905, yl(2.70), zl(0.578)], [0.45, yl(2.70), zl(0.578)], [0.45, yl(2.70), zl(-0.85)], [-0.905, yl(2.70), zl(-0.85)],
    [-0.87, yl(3.12), zl(0.578)], [0.42, yl(3.12), zl(0.578)], [0.42, yl(3.135), zl(-0.85)], [-0.87, yl(3.135), zl(-0.85)]));
  P.add('turret', slab(
    [-0.905, yl(2.70), zl(-0.85)], [0.45, yl(2.70), zl(-0.85)], [0.42, yl(2.72), zl(-1.16)], [-0.875, yl(2.72), zl(-1.16)],
    [-0.87, yl(3.135), zl(-0.85)], [0.42, yl(3.135), zl(-0.85)], [0.40, yl(2.79), zl(-1.16)], [-0.855, yl(2.79), zl(-1.16)]));
  // the crest right rake: one surface (§B1) from the plateau edge, closed by
  // a vertical cast end-face at x 0.6135 (FLAT-CAP-BEHIND-A-RAKE) — the ref
  // falls 3.15 @ 0.43 -> 3.02 @ 0.60 then cliffs to the 2.79 roof
  P.add('turret', slab(
    [0.42, yl(2.70), zl(0.578)], [0.6135, yl(2.70), zl(0.578)], [0.6135, yl(2.70), zl(-0.85)], [0.42, yl(2.70), zl(-0.85)],
    [0.42, yl(3.12), zl(0.578)], [0.6135, yl(2.99), zl(0.578)], [0.6135, yl(2.99), zl(-0.85)], [0.42, yl(3.132), zl(-0.85)]));
  P.add('turret', slab(
    [0.42, yl(2.70), zl(-0.85)], [0.6135, yl(2.70), zl(-0.85)], [0.5935, yl(2.72), zl(-1.16)], [0.40, yl(2.72), zl(-1.16)],
    [0.42, yl(3.135), zl(-0.85)], [0.6135, yl(2.99), zl(-0.85)], [0.5935, yl(2.80), zl(-1.16)], [0.40, yl(2.79), zl(-1.16)]));
  // left cheek steps (ref front: 2.80 over x -0.91..-1.12, 2.69 to -1.29;
  // push round: box edge pulled to -1.135 — at -1.15 it partial-lit the
  // -1.159 front column the ref keeps at the 2.69 shelf)
  P.add('turret', box(0.235, 0.62, 1.75), -1.0175, yl(2.49), zl(-0.42));
  P.add('turret', box(0.17, 0.50, 2.00), -1.215, yl(2.44), zl(-0.48));
  // right shoulder fill: the ref wall keeps a square 2.72 line out to the
  // bin junction (front cols +0.92..+1.09 read 2.723 flat)
  P.add('turret', box(0.186, 0.28, 3.15), 0.993, yl(2.58), zl(-0.325));
  // right-cheek stowage bin (push round fresh plan: x 1.09..1.40 with the
  // rear face raked in plan from (1.09, -0.545) to (1.385, +0.15); front
  // 1.31; the old 1.36-wide box missed the ref's x 1.39 column)
  P.add('turret', slab(
    [1.09, yl(2.02), zl(1.31)], [1.385, yl(2.02), zl(1.31)], [1.385, yl(2.02), zl(0.15)], [1.09, yl(2.02), zl(-0.545)],
    [1.09, yl(2.70), zl(1.31)], [1.385, yl(2.70), zl(1.31)], [1.385, yl(2.70), zl(0.15)], [1.09, yl(2.70), zl(-0.545)]));
  P.add('turretDark', box(0.24, 0.02, 1.55), 1.21, yl(2.71), zl(0.50));
  // commander cupola: a low drum SUNK into the crest silhouette (the ref
  // reads the whole crest as the cupola mass; its extra 0.16 height is the
  // dims-sovereign print delta). Vision blocks dress the crest edge.
  P.add('turret', cylY(0.26, 0.28, 0.05, P.q ? 20 : 12), -0.45, yl(3.10), zl(-0.45));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.4;
    P.add('turretDark', box(0.07, 0.045, 0.024), -0.45 + Math.sin(a) * 0.21, yl(3.10), zl(-0.45) + Math.cos(a) * 0.21, 0, a, 0);
  }
  // M28 sight head: the ref's own 3.386 spike re-read on the fresh pair —
  // front x -0.27..+0.13 (10 columns), side z -0.14..+0.12 (4 columns; the
  // 4th stays under the heightM p95 flip threshold, ref parity)
  P.add('turret', cylY(0.05, 0.06, 0.20, 8), -0.07, yl(3.23), zl(-0.01));
  P.add('turretDark', box(0.40, 0.065, 0.26), -0.07, yl(3.357), zl(-0.01));
  P.add('turretGlass', box(0.22, 0.03, 0.012), -0.07, yl(3.36), zl(0.126));
  // loader hatch: flush ring + dark handle on the plateau (the old proud
  // drum at x 0.42 poked the crest rake silhouette the ref reads smooth)
  P.add('turret', cylY(0.17, 0.175, 0.008, 14), -0.10, yl(3.131), zl(-0.60));
  P.add('turretDark', box(0.05, 0.006, 0.15), -0.10, yl(3.138), zl(-0.60));
  // rear vent hump (side 2.84 over z -1.31..-1.50)
  P.add('turret', box(0.72, 0.06, 0.20), -0.10, yl(2.815), zl(-1.405));
  // bustle rack: rails + stowage INSIDE the section silhouette
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.03, 0.03, 0.85), side * 1.00, yl(2.63), zl(-1.58));
    P.add('turretDetail', box(0.03, 0.10, 0.03), side * 1.00, yl(2.575), zl(-1.20));
    P.add('turretDetail', box(0.03, 0.10, 0.03), side * 1.00, yl(2.575), zl(-1.95));
  }
  P.add('turretDetail', box(1.98, 0.03, 0.03), 0, yl(2.63), zl(-1.99));
  // push round: eye #1 dropped under the crest line (at 3.00 it poked the
  // -0.914 front column 3.07 over the ref's 2.794 shoulder)
  liftEye(P, 'turretDetail', -0.85, yl(2.62), zl(-0.85));
  liftEye(P, 'turretDetail', 0.85, yl(2.70), zl(-1.10));
  // §B3 FITTINGS decoration (from birth): M85-pattern cupola-flank MG on
  // the bustle shoulder (pintle allowance class), stowage + cable + whip
  {
    // The modernization pass moves the defensive weapon to a connected
    // roof RWS in finishM60A2Variant; keep this bustle bay for stores.
    const cans = FITTINGS.jerryCans({ mats: P.mats, count: 2, seed: 62 });
    cans.position.set(-0.45, yl(2.16), zl(-1.75));
    P.turretG.add(cans);
    // short whip on the left cheek shelf, top under the 2.79 side band
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 0.22, seed: 62 });
    whip.position.set(-1.05, yl(2.42), zl(-0.90));
    P.turretG.add(whip);
    // push round: cable dropped to 1.955 — at 2.023 its clamps topped 2.08,
    // four front columns over the ref's 2.008 fender line
    // (release 240: half-sunk in the lowered shelf to -1.27, 1.887, its clamps under the turret's 1.931 floor, then into
    // the raised course as before)
    const cable = FITTINGS.towCable({
      mats: P.mats,
      pts: [[-1.38, 1.887, -0.70], [-1.41, 1.887, -1.27], [-1.44, 1.955, -1.60], [-1.40, 1.955, -2.60]],
      r: 0.018,
    });
    P.hullG.add(cable);
  }
  // push round: the right number moved onto the bin face — at x 1.19 it
  // floated 0.115 off the 1.075 casting wall (visible at yaw)
  P.decal('turret', 'number', P.spec.visual.number || '', 0.26, [1.386, yl(2.35), zl(0.35)], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.26, [-1.30, yl(2.35), zl(-1.10)], -Math.PI / 2);

  // 152 mm M162 gun/launcher: big proud shield plate (plan +-0.34, top 2.82
  // over z +1.83..+2.40) pitching with the stub tube; muzzle at the
  // published-overall station. GUN-RIG NOTE (measured this round): the
  // hullLengthM body mask INCLUDES turretG but EXCLUDES the gun rig — a
  // turret-bucket tube read the body at +3.505 (dims 7.13, -12.8); in the
  // gun rig it reads 7.02. The two bow station slices carry the ref's
  // FUSED-tube visibility skew either way (m46-certified class, both
  // dropped by the station trim).
  // shield re-author (push round fresh pair): the ref mantlet is a RAKED
  // mass, not a stepped box (§B1 slope-motivates-the-mass) — side reads top
  // 2.82 back to z 1.75 with the face leaning bottom-forward (bottom lip
  // z 2.55, top edge z 2.40); plan reads the inner plate x -0.39..+0.41 at
  // 2.54-2.58 with wings to -0.60/+0.575 at 2.18-2.27. Gun-local frame:
  // ly = world y - 2.27, lz = world z - 1.55.
  {
    const gp = (x: number, y: number, z: number): Vec3Tuple => [x, y - 2.27, z - 1.55];
    // two-segment face (r2 fresh side re-read): the UPPER face (above the
    // tube line 2.43) is near-vertical and DONE by z 2.42 (side cols 2.46+
    // read tube-top only), the lower lip rakes forward to the plan's 2.56;
    // the 2.82 top plane runs to 2.415 so the i11 station window (proc
    // 1.90..2.41) keeps the full shield height.
    // SEGMENTED at z 2.10 (§C station end-caps: a 0.66 m axis-aligned slab
    // paints only its end caps in the clipped station slices — i11 lost the
    // whole shield height). Upper face VERTICAL at 2.39: past 2.40 it fed
    // station i12's window (proc windows sit ~0.08 rearward of the ref's —
    // the certified bow-tip skew — and the gate derives its windows from
    // 96-column CENTERS, so proc i12 starts at 2.372, not the pixel-level
    // 2.408) and any forward lean above the 2.43 tube line re-lit the 2.46
    // side column.
    for (const [zr, zf] of [[1.755, 2.10], [2.10, 2.356]]) {
      P.addGunExtra(slab(  // upper face band
        gp(-0.40, 2.43, zf), gp(0.41, 2.43, zf), gp(0.41, 2.43, zr), gp(-0.40, 2.43, zr),
        gp(-0.40, 2.82, zf), gp(0.41, 2.82, zf), gp(0.41, 2.82, zr), gp(-0.40, 2.82, zr)), 0, 0, 0);
    }
    P.addGunExtra(slab(  // lower lip, rear band
      gp(-0.40, 2.05, 2.10), gp(0.41, 2.05, 2.10), gp(0.41, 1.97, 1.755), gp(-0.40, 1.97, 1.755),
      gp(-0.40, 2.43, 2.10), gp(0.41, 2.43, 2.10), gp(0.41, 2.43, 1.755), gp(-0.40, 2.43, 1.755)), 0, 0, 0);
    P.addGunExtra(slab(  // lower lip, raked front band
      gp(-0.40, 2.05, 2.56), gp(0.41, 2.05, 2.56), gp(0.41, 2.05, 2.10), gp(-0.40, 2.05, 2.10),
      gp(-0.40, 2.43, 2.356), gp(0.41, 2.43, 2.356), gp(0.41, 2.43, 2.10), gp(-0.40, 2.43, 2.10)), 0, 0, 0);
    // wings (asymmetric per the ref plan: left to -0.585, right to +0.570)
    P.addGunExtra(box(0.185, 0.70, 0.445), -0.4925, 2.35 - 2.27, 1.9775 - 1.55);
    P.addGunExtra(box(0.160, 0.70, 0.445), 0.490, 2.35 - 2.27, 1.9775 - 1.55);
    // step shelves between plate and wings (ref plan 2.25-2.27)
    P.addGunExtra(box(0.055, 0.60, 0.49), -0.4275, 2.35 - 2.27, 2.015 - 1.55);
    P.addGunExtra(box(0.090, 0.60, 0.52), 0.455, 2.35 - 2.27, 2.01 - 1.55);
    // launcher door: co-planar dark panel ON the lip face
    P.addGunExtraDark(slab(
      gp(-0.28, 2.10, 2.545), gp(0.28, 2.10, 2.545), gp(0.28, 2.10, 2.505), gp(-0.28, 2.10, 2.505),
      gp(-0.28, 2.34, 2.478), gp(0.28, 2.34, 2.478), gp(0.28, 2.34, 2.438), gp(-0.28, 2.34, 2.438)), 0, 0, 0);
  }
  P.addGunExtra(xform(cylX(0.145, 0.62, P.q ? 16 : 10), 0, 0, 0), 0, 0.02, 0.88);
  const seg = P.q ? 20 : 12;
  // Keep the circular launcher concentric with rig_muzzle; muzzle carried
  // to the ref's own 3.712 end column (overallLengthM 7.37, +1.37% — the
  // documented dims trade for the side cover columns)
  const glen = cfg.muzzle - 1.55;
  P.add('gun', cylZ(0.148, glen - 0.08, seg), 0, 0, (glen - 0.08) / 2 + 0.02);
  P.add('gun', cylZ(0.156, 0.22, seg), 0, 0, glen - 0.55);
  P.add('gun', cylZ(0.158, 0.06, seg), 0, 0, glen - 0.03);
  // Owner 2026-09-22 ("holes are added, not carved; the muzzle marker is the
  // tube end"): the firing anchor is the stub launcher's real tube end, the
  // .158 collar face at glen. Until then P.muzzleZ kept the generic M60A1 tube
  // length that usKit's buildGun set (gun-local 5.0973, world z 5.98), 2.64 m
  // ahead of the 3.34 tube end: shells and the flash spawned in the air, the
  // spec's gunBarrel.lengthM read the same 5.0973, and the factory — finding
  // no cap within 2 m of the marker — seated the mouth on a hidden §B3.1
  // muzzleBore rim (z glen, r .148) with a clamped 6 cm proud dark throat. With
  // the marker on the collar face the terminal-cap scan seats the added hole
  // flush, so that never-rendered rim/disc pair and the legacy 0.076 gunDark
  // face puck (4*seg, occluded behind the disc) are gone; the hole radius now
  // follows the fleet law (.0589 from the spec's gunBarrel radius) instead of
  // the hidden rim's full .148 face.
  P.muzzleZ = glen;
  // Owner 2026-09-23 (round-46 follow-up to the tube-end fix): the added hole
  // draws the launcher's TRUE 152 mm bore. Measured before this change: the
  // terminal cap is the .158 collar (world .1422 under the 0.9 compact scale)
  // and the fleet law clamped the mouth to the donor M60A1's nominal 105 mm
  // tube, .064 x .92 = .0589 (world .0530, radialRatio .373) with a .0424
  // near-black core — a 118 mm hole on a 316 mm face, NARROWER than the bore;
  // the alternative 0.94 face fit (.1485) would have painted half the collar
  // dark, wider than the photographs. Reference (scout-gen2-m60a2.md): the
  // M162 tube reads r .148 side / .165-.20 plan with the 152 mm bore inside
  // it, so the bore is .076 gun-local (world .0684), 48 % of the collar face.
  // The near-black disc IS the bore; the gunmetal ring is a 3 mm bevel whose
  // 2 % overlap keeps hiding any hairline seam. Still the added ring + disc
  // (3N = 54 triangles at N 18, against 90 for a carved open mouth).
  P.muzzleMouth = { outerRadiusM: 0.079, innerRadiusM: 0.076 };
  finishM60A2Variant(P, glen, cfg.hull.deck);
  applyM60CompactScale(P, 0.90, 3.14 - py + 0.12);
}

function buildM60A2(P: PattonBuilderPort, cfg: M60A2BuildConfig): void {
  const hull = curveHull(P, cfg.hull);
  usKit(P, hull, cfg.fit);
  addM60A2EngineDeck(P);
  addM60A2ShoulderArmor(P, cfg);
  addM60A2HullFurniture(P, cfg);
  addM60A2TurretAndGun(P, cfg);
}

const M60_HULL: PattonHullConfig = {
  W: 3.631, bandHW: 1.70, trackW: 0.69, trackInset: 0.037,
  ...M60_TRACK_FINISH,
  sponsonY: 1.50, sponsonBandY: 1.55, bellyY: 0.47, bellyHW: 0.82, noseW: 1.66,
  glacisWingY0: 1.55, glacisWingDrop: 0.02, glacisWingZ0: 2.72,
  runningGearFit: true,
  deck: [[3.44, 1.31], [1.86, 1.675], [1.76, 1.738], [-0.50, 1.742], [-2.40, 1.79], [-3.28, 1.788]],
  toeBot: 1.10, bellyFrontZ: 2.30, bellyRearZ: -2.55, tailBotY: 1.00,
  gear: {
    // measured: contact flat -2.48..+2.34 (kit: flat spans lastWheel +/-
    // wheelR/2), 34-deg front ramp to the idler (+3.04, 0.85, wrap R 0.325),
    // 42-deg rear ramp to the sprocket (-2.96, 0.85)
    wheelR: 0.37, wheelY: 0.40, span: [2.155, -2.295], rollerN: 3, rollerY: 1.06,
    idler: { z: 3.00, y: 0.96, r: 0.28 }, sprocket: { z: -2.84, y: 0.97, r: 0.28 },
  },
};
const M60_FIT: HullFurniture = {
  singleHatch: true, hatchX0: 0, hatchZ: 2.56,
  lights: { x: 0.92, y: 1.47, z: 3.10, rx: -0.24 },
  shackleY: 1.18, shackleZ: 3.34,
  // NOTE (r3 shaded pass): these usKit bays sit BURIED under the 1.85-1.886
  // engine crown (invisible; kept for config parity). A usKit re-seat onto
  // the crown was tried and cost ~0.6 whole / 0.7 stations (full-width end
  // rails) — the visible louvres are the flush m60-scoped bays in buildM60.
  // (release 240: 3 cm lower, buried again under the lowered engine crown, buildM60; at 1.840 its bars stood 1-2 cm
  // through it, in the turret's sweep)
  grille: { z0: -1.90, z1: -2.62, y: 1.81, rx: 0.026, x: 0.40, w: 0.62 }, caps: [1.18, -1.35],
  // rear-plate grille: panel recessed 6 mm so the louver slats (added in
  // buildM60) read against it; slat faces stay flush with the -3.28 plate.
  // r4 tell 3: panel widened 1.24 -> 1.90 (lower band of the full-width
  // louver wall; the upper band panel is m60-local in buildM60).
  rearGrilleY: 1.155, rearGrilleW: 1.90, rearGrilleZ: -3.259, noRearEyes: true,
};

// M60 casting cross profiles (signed fractions of hw / bot->top): the LEFT
// wall climbs a near-vertical cliff to the ridge shoulder; the RIGHT roof
// falls immediately off the ridge to the long 2.72 shelf line.
const M60_PROFILE: CrossProfile = [
  [-1, 0], [-1, 0.29], [-0.94, 0.445], [-0.919, 0.795], [-0.837, 0.927],
  [-0.268, 1.0], [0.038, 0.915], [0.23, 0.72], [1, 0.29], [1, 0]];
// True profile knuckles (weld crease list — everything else shades smooth):
// k4 left cliff-top shoulder (52 deg turn), k5 ridge crest, k6 right roof
// break (31 deg), k8 right wall top (59 deg), k9/k0 wall-to-underside.
const M60_PROFILE_CREASES = [0, 4, 5, 6, 8, 9];
const M60_BUSTLE_PROFILE: CrossProfile = [
  [-1, 0], [-1, 0.30], [-0.965, 0.66], [-0.945, 0.91], [-0.848, 1.0],
  [0.848, 1.0], [0.945, 0.91], [0.965, 0.66], [1, 0.30], [1, 0]];
// Bustle knuckles: roof-chamfer shoulders both sides (53/30 deg) + the
// wall-to-underside edges; the walls and the flat 2.664 roof stay smooth.
const M60_BUSTLE_CREASES = [0, 3, 4, 5, 6, 9];
// Front casting loft (world coords; tops/hw from the true-axis trace: saddle
// 2.564 @ 1.70..1.91, forehead shelf 2.895 @ 1.06..1.59, crest 3.09 @ ~0,
// falling 2.845 @ -0.77; nose underside hangs to the measured 1.74-1.78)
const M60_SECTIONS: M60Section[] = [
  { z: 2.16, hw: 0.30, top: 2.30, bot: 1.90 },
  { z: 2.10, hw: 0.44, top: 2.36, bot: 1.84 },
  { z: 2.02, hw: 0.54, top: 2.42, bot: 1.79 },
  { z: 1.93, hw: 0.62, top: 2.53, bot: 1.76 },
  { z: 1.80, hw: 0.72, top: 2.565, bot: 1.75 },
  { z: 1.71, hw: 0.785, top: 2.568, bot: 1.74 },
  { z: 1.647, hw: 0.825, top: 2.60, bot: 1.74 },
  { z: 1.617, hw: 0.845, top: 2.78, bot: 1.74 },
  { z: 1.592, hw: 0.862, top: 2.89, bot: 1.74 },
  { z: 1.575, hw: 0.885, top: 2.895, bot: 1.74 },
  { z: 1.40, hw: 1.00, top: 2.90, bot: 1.75 },
  { z: 1.26, hw: 1.12, top: 2.90, bot: 1.75 },
  { z: 1.10, hw: 1.19, top: 2.895, bot: 1.75 },
  { z: 0.95, hw: 1.245, top: 2.92, bot: 1.74 },
  { z: 0.80, hw: 1.275, top: 2.99, bot: 1.73 },
  { z: 0.62, hw: 1.285, top: 3.05, bot: 1.72 },
  { z: 0.42, hw: 1.295, top: 3.06, bot: 1.72 },
  { z: 0.20, hw: 1.295, top: 3.08, bot: 1.72 },
  { z: 0.00, hw: 1.285, top: 3.09, bot: 1.72 },
  { z: -0.22, hw: 1.275, top: 3.08, bot: 1.73 },
  { z: -0.40, hw: 1.265, top: 3.065, bot: 1.74 },
  { z: -0.55, hw: 1.25, top: 3.04, bot: 1.75 },
  { z: -0.66, hw: 1.245, top: 3.01, bot: 1.76 },
  { z: -0.71, hw: 1.243, top: 2.885, bot: 1.765 },
  { z: -0.78, hw: 1.24, top: 2.845, bot: 1.77 },
  { z: -0.92, hw: 1.235, top: 2.765, bot: 1.79 },
  { z: -1.05, hw: 1.23, top: 2.70, bot: 1.80 },
];
// Bustle loft: flat 2.664 roof to the measured -2.03 rear face (the -2.037
// station boundary and the -2.033 trace column boundary sit just behind it),
// plan taper 1.12 @ -1.78 -> 0.90 @ -1.87 -> 0.60 @ -1.96 -> 0.30 @ -2.01;
// the RIGHT cheek tapers earlier (measured rear -1.35 at x +1.24).
const M60_BUSTLE: M60Section[] = [
  { z: -0.95, hw: 1.235, hwR: 1.225, top: 2.665, bot: 1.80 },
  { z: -1.30, hw: 1.215, hwR: 1.175, top: 2.664, bot: 1.84 },
  { z: -1.60, hw: 1.19, hwR: 1.13, top: 2.664, bot: 1.90 },
  { z: -1.80, hw: 1.12, hwR: 1.07, top: 2.66, bot: 2.04 },
  { z: -1.87, hw: 0.92, top: 2.655, bot: 2.11 },
  { z: -1.93, hw: 0.72, top: 2.65, bot: 2.16 },
  { z: -1.99, hw: 0.44, top: 2.62, bot: 2.20 },
  { z: -2.035, hw: 0.20, top: 2.62, bot: 2.26 },
];

// M60A2 hull (extract frame; ref hull mask -3.708..+3.518). The deck
// polyline is the LOW shoulder line (flat 1.858-1.865, front dip per the
// ref front columns) — the cambered crown chain in buildM60A2 carries the
// 2.0-2.18 centre heights. Body length: fat columns end -3.60/+3.31 with
// thin tip plates to +3.415 (both hullLengthM readings inside the 1% grace
// of the published 6.95); rear flaps to -3.655 + muzzle +3.655 puts
// overallLengthM at 7.31 (+0.55% of 7.27).
const M60A2_HULL: PattonHullConfig = {
  // live-pair track read: inner edge 1.245 / outer 1.79 (narrower than the
  // A1's 0.69 band) — the belly widens to 1.195 and owns the 0.42-0.59
  // front-view floor the ref shows at |x| 0.95-1.2
  W: 3.631, bandHW: 1.19, trackW: 0.50, trackInset: 0.05, sponsonY: 1.20, bellyY: 0.58,
  bellyHW: 0.96, noseW: 1.28, glacisWingY0: 1.36, sponsonAftY: 1.47, sponsonAftZ: -2.45,
  // push round r4: deck band ends at the ref's -3.47 corner notch (plan
  // cols +-1.04..1.13 read ref rear -3.47; the centre continues to -3.60
  // on the widened rear-plate slab)
  deck: [[3.31, 1.483], [2.95, 1.657], [2.33, 1.66], [2.28, 1.68], [2.24, 1.796],
    [1.82, 1.80], [1.62, 1.787], [1.58, 1.858], [-0.60, 1.860], [-3.40, 1.862],
    [-3.47, 1.863]],
  // push round r5: raised shoulder roof edge 1.755 — curveHull's plate outer
  // edge lands at fenderHW+0.005, and the ref's 2.008 band covers the +-1.74 column
  // (1.996) but not +-1.78 (1.853): outer 1.760 threads both boundaries
  // (release 240: the raised course's roof from -1.60, behind its moved rise, addM60A2ShoulderArmor)
  fenderY: [2.005, -1.60, -3.50], fenderHW: 1.755,
  toeBot: 1.06, bellyFrontZ: 2.35, bellyRearZ: -2.62, tailBotY: 0.95,
  runningGearFace: true, runningGearFit: true,
  gear: {
    // ref ramps: front (2.27,0)->(3.31,0.93) slope 0.89; rear wrap arc
    // measured (-3.50,0.70)/(-3.59,0.78)/(-3.67,0.91) — circles fitted;
    // the idler wrap is also the dims front-body anchor (fat band):
    // hullLengthM 7.02 rides the 3.375 column either way (tube overlap).
    // push round: idler 2.92 -> 2.895 — the wrap's front shoe partially lit
    // the 3.375 column at y 0.89 where the ref bottom reads 1.112.
    wheelR: 0.37, wheelY: 0.40, span: [2.085, -2.325], rollerN: 3, rollerY: 1.06, contactZF: 2.20,
    idler: { z: 2.895, y: 0.90, r: 0.26 }, sprocket: { z: -3.19, y: 1.03, r: 0.29 },
  },
};
const M60A2_FIT: HullFurniture = {
  singleHatch: true, hatchX0: 0, hatchZ: 2.60, hatchFlush: true,
  lights: { x: 0.90, y: 1.575, z: 2.98, rx: -0.20 },
  shackleY: 1.25, shackleZ: 3.24,
  grille: { z0: -1.95, z1: -2.70, y: 1.90, rx: 0.02, x: 0.40, w: 0.62 }, caps: [1.10, -1.30],
  rearGrilleY: 1.42, rearGrilleW: 1.24, rearGrilleZ: -3.585, noRearEyes: true,
};
// Starship tower sections (world coords from the extract side/plan turret
// curves): plan xL -1.29 / xR +1.075 via shiftX -0.11; forehead climbs
// 2.79 @ +0.57 to the flat 3.135 top (published-height cap of the ref's
// 3.25-3.30 plateau); rear vent hump and the 2.66-2.68 bustle band.
const M60A2_SECTIONS = [
  // main tower body: the wide 2.79-2.80 shoulder roof (live pair: front
  // reads 2.797 flat out to +-0.91..1.2; side 2.79-2.80 over +0.6..-1.6)
  // plan is SLAB-SIDED (live pair: xL -1.29 runs z +0.76..-2.00).
  // push round: the nose is an asymmetric plan ARROWHEAD (§B1 rake) — the
  // LEFT cheek rakes from (x -0.64, z 1.56) back to the wall at (−1.27,
  // z 0.83) per the fresh plan trace (hwL opt-in), the right cheek is
  // shorter (wall by z ~1.3, bin takes over outboard).
  { z: 1.78, hw: 0.61, hwL: 0.42, top: 2.64, bot: 1.92 },
  { z: 1.50, hw: 0.92, hwL: 0.62, top: 2.685, bot: 1.88 },
  { z: 1.31, hw: 1.14, hwL: 0.89, top: 2.72, bot: 1.87 },
  { z: 1.00, hw: 1.165, hwL: 1.08, top: 2.755, bot: 1.87 },
  { z: 0.80, hw: 1.175, hwL: 1.15, top: 2.775, bot: 1.86 },
  { z: 0.60, hw: 1.18, top: 2.79, bot: 1.86 },
  { z: 0.05, hw: 1.185, top: 2.80, bot: 1.86 },
  { z: -0.45, hw: 1.19, top: 2.80, bot: 1.87 },
  { z: -0.95, hw: 1.185, top: 2.80, bot: 1.89 },
  { z: -1.10, hw: 1.18, top: 2.80, bot: 1.94 },
  { z: -1.30, hw: 1.18, top: 2.80, bot: 2.00 },
  { z: -1.40, hw: 1.18, top: 2.80, bot: 2.03 },
  { z: -1.60, hw: 1.18, top: 2.79, bot: 2.10 },
  { z: -1.72, hw: 1.175, top: 2.72, bot: 2.12 },
  { z: -1.90, hw: 1.17, top: 2.68, bot: 2.13 },
  { z: -2.04, hw: 1.10, top: 2.655, bot: 2.15 },
];

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
  m60a2: {
    // FIRST BUILD (r2): the triage 'easiest single win' — A1-family hull
    // re-authored in this print's own extract frame + the Starship tower
    // and stub 152 launcher. Containment from birth; §B3 via KIT.fittings.
    // PUSH ROUND (2026-08-05): 80.3 -> 86.3 x2 (turret 91.2, stations 89.6)
    // — raked mantlet mass, §B1 crest rake, plan arrowhead nose (hwL),
    // width system on the ref's low boards. Ceiling MEASURED at ~87.5
    // whole: bow-tip tube-overlap + crest height-cap + stern overall-cap
    // (certified-cap candidates; mechanisms in the packet round section).
    build: (P: PattonBuilderPort) => buildM60A2(P, {
      hull: M60A2_HULL, fit: M60A2_FIT, sections: M60A2_SECTIONS, muzzle: 3.712,
    }),
  },
  m60a1: { build: steppedBuilder((P: PattonBuilderPort) => buildM60Steps(P, { hull: M60_HULL, fit: M60_FIT, sections: M60_SECTIONS, bustle: M60_BUSTLE, searchlight: true, sleeve: false, gunLen: 4.435 })) },
  // A3 TTS: the supplied A3 oracle resolves the correct variant package —
  // thermal sleeve, TTS head, paired smoke banks and crosswind mast, without
  // the A1's large AN/VSS-1 mantlet searchlight.
  m60a3: { build: steppedBuilder((P: PattonBuilderPort) => buildM60Steps(P, { hull: M60_HULL, fit: M60_FIT, sections: M60_SECTIONS, bustle: M60_BUSTLE, searchlight: 1.42, sleeve: true, a3: true, gunLen: 4.435 })) },
} satisfies VehicleProfileRecord;
