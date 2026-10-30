import { lathedWheelSection } from './lathedWheelStock.ts';
import { addModernFieldCage } from './modernFieldCage.ts';
import { beginAuxiliaryStation, captureAuxiliaryStock } from './auxiliaryStation.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
// src/vehicles/profiles/challenger.ts — the Challenger family profile module
// (§5.75 owner consistency order, 2026-08-08: one family per module; PURE
// REFACTOR — every moved id hash-proven byte-identical across the split).
// Residents:
//   challenger1_mk2 — profiles-class build (CHALLENGER_PROFILES, merged by
//     profiledProcedurals.ts like every ./profiles family map); its geometry is
//     the release 262 historical rebuild (challenger1Historic.ts). Its spec row
//     still derives from challenger2's TANK_SPECS row via the additional fleet
//     donor copy — unchanged mechanism.
//   challenger2 / challenger3_proto — canonical builders demand-registered from
//     CHALLENGER_BUILDERS. Their boot-light combat rows live separately in
//     challengerSpecs.ts so an Abrams garage does not load this geometry.
// Shared family and spec construction policy is imported, never duplicated.
import * as THREE from 'three';
import { buildChallenger3RearTurretClosure } from './challenger3RearTurret.ts';
import { facetedSlab } from './facetedSlab.ts';
import { fitsInSkirt, profileSkirtGeometry, skirtBand, skirtBottomAt, skirtTopAt, type ProfileSkirt } from './profileSkirt.ts';
// Shared geometry and exact-equipment fittings come from the cycle-free
// profile kit; builders destructure the geometry they use at call time.
import { KIT, FITTINGS, muzzleBore } from './kit.ts';
import { stockTopFace, upSlopeTurn } from './stockFaceSeat.ts';
import '../challengerSpecs.ts';
// ch1-base tone port (uk round 2026-08-07): materials.js is cycle-free — the
// ambient-floor hook re-attach is the same import uk.ts carries.
import { cloneRehookedVehicleMaterial, rehookVehicleMaterial } from '../materials.ts';
// UK family kit stays owned by uk.ts (chieftains/centurions use it), including the
// §C.1 winding-guarded `slab` (orientedSlab via the uk.ts KIT proxy).
import {
  box, cylY, cylZ, torus, slab, xform, buildRunningGear, buildGun,
  liftEye, periscope, stowage,
} from './uk.ts';
import type { UKBuilderPort } from './uk.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { buildHollowPairedRoadWheel } from '../hollowRoadWheelStock.ts';
import { buildChallenger1Historic } from './challenger1Historic.ts';
import { buildChallenger1SuppliedMk1, buildChallenger1SuppliedMk2 } from './challenger1XSupplied.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
import { buildChallenger3Td } from './challenger3Td.ts';
import { drainTankBuild, withBuildSteps, type TankProfileBuild } from '../tankBuildCooperation.ts';

type Vec2Tuple = readonly [number, number];
type Vec3Tuple = readonly [number, number, number];
type EraPlacer = (...transform: number[]) => void;
type EquipmentOwner = 'hull' | 'turret';

interface ChallengerContactRise {
  dzM: number;
  frontM: number;
  rearM: number;
}

interface ChallengerContactGeometry {
  halfLenM: number;
  zCenterM: number;
  halfWidM: number;
  bottomYM: number;
  endRise?: ChallengerContactRise;
}

interface ChallengerTrackHitbox {
  x0: number;
  x1: number;
  poly: Array<[number, number]>;
}

interface ChallengerGearPort {
  contactGeom?: ChallengerContactGeometry;
  trackHitbox?: ChallengerTrackHitbox[];
  addRoadWheelLayer(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    options: { readonly outset: number; readonly name: string },
  ): void;
}

interface ChallengerBuilderPort extends UKBuilderPort {
  forEachBucketPart(slots:string|string[],visit:(geometry:THREE.BufferGeometry,bounds:THREE.Box3|null,bucket:string)=>void):void;
  readonly spec: {
    readonly id: string;
    readonly armor: { readonly turretPivot: Vec3Tuple };
    readonly visual: {
      readonly number?: string;
      bakeDirtDeckEq?: boolean;
    };
  };
  readonly gear: ChallengerGearPort;
  addEquipment(owner: EquipmentOwner, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addMudguard(key: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  eraCluster(key: string, build: (place: EraPlacer) => void, turretOwned?: boolean): void;
  postAssemble?: (assembly: { readonly turretG: THREE.Group; readonly gunG: THREE.Group; readonly recoilG: THREE.Group }) => void;
}

interface ChallengerToneOptions {
  readonly glassHex?: number;
  readonly cloth?: number;
  readonly clothEnv?: number;
  readonly dark?: number;
  readonly padHex?: number;
  readonly padEnv?: number;
  readonly chainHex?: number;
  readonly chainEnv?: number;
  readonly bandMul?: readonly [number, number, number];
  readonly bandEnv?: number;
  readonly spareHex?: number;
  readonly tireEmissive?: number;
}

type GearBackerPlate = readonly [number, number, number, number, number, number];
type SmokeBankSeat = readonly [number, number, number, number, number];

interface Cr2HullSection {
  readonly z: number;
  readonly bw: number;
  readonly tw: number;
  readonly bot: number;
  readonly top: number;
}

interface Cr2FacetedSection {
  readonly z: number;
  readonly w: number;
  readonly inner: number;
  readonly bot: number;
  readonly centerBot?: number;
  readonly tw: number;
  readonly outer: number;
  readonly center: number;
}

interface RoofSeatReceipt {
  readonly label: string;
  readonly carrierY: number | null;
  readonly bottomY: number;
}

interface SmokeMouthReceipt {
  readonly side: number;
  /** Moves with its bank when the bank is seated (P.snapGroup). */
  tubeCenter: readonly number[];
  readonly rotation: readonly number[];
  readonly mouthOffsetZ: number;
}

interface Challenger2VariantReceipt {
  variant: string;
  baseCheekPanelsRemoved: boolean;
  baseSightWellsRemoved: boolean;
  legacyHydrogasGapAssembliesRemoved: boolean;
  mannedMachineGuns: number;
  enhancedSkirtPanels: number;
  glacisEraCassettes: number;
  turretEraCassettes: number;
  fuelBarrels: number;
  cageRails: number;
  cagePosts: number;
  cageDeckTiePlates: number;
  roofAttachmentCount: number;
  maximumRoofGapM: number;
  bridgedMachineGunBarrels: number;
  cheekEraHorizontallyMirrored: boolean;
  cheekEraNormalAlignmentDot: number;
  cheekEraColumnsPerSide: number;
  cheekEraRowsPerSide: number;
  cheekEraCassetteWidthM: number;
  cheekEraCassetteHeightM: number;
  cheekEraHorizontalGapM: number;
  cheekEraVerticalGapM: number;
  cheekEraIndividualSquares: boolean;
  cheekEraSurfaceLoweringM: number;
  cheekEraVerticalBoundsBySide: {
    left: [number, number] | null;
    right: [number, number] | null;
  };
  glacisEraNormalAlignmentDot: number;
  smokeBanks: number;
  smokeCanisters: number;
  smokeCarrierMaximumGapM: number | null;
  smokeCanisterMinimumEmbedM: number;
  smokeCanistersSurfaceDerived: boolean;
  canopyMaximumLegGapM: number | null;
  canopyLoweringM: number;
}

interface Challenger3XReceipt {
  variant: string;
  enhancedSkirtPanels: number;
  skirtHangers: number;
  glacisEraCassettes: number;
  skirtEraCassettes: number;
  cheekEraCassettes: number;
  turretSideEraCassettes: number;
  autocannonStations: number;
  radarArrays: number;
  searchlights: number;
  bustleCageRails: number;
  stowageItems: number;
  equipmentSeatsFlush: boolean;
  totalEraCassettes?: number;
}

interface Challenger3ShellSection {
  readonly bottomF: number;
  readonly bottomR: number;
  readonly bottomZR?: number;
  readonly outerF: number;
  readonly outerR: number;
  readonly shoulderXF: number;
  readonly shoulderXR: number;
  readonly shoulderYF: number;
  readonly shoulderYR: number;
  readonly roofXF: number;
  readonly roofXR: number;
  readonly roofYF: number;
  readonly roofYR: number;
}


// Profiles-class family map (merged by profiledProcedurals.ts — the same
// interface every ./profiles family module exports).
export const CHALLENGER_PROFILES = {
  // Release 262 (owner 2026-10-28: the supplied-file Mk 3's turret "is what it is actually like"): the Mk 1 and Mk 2 are
  // the Mk 3's build in their own fits, without its Op Granby kit (challenger1XSupplied.ts).
  challenger1_mk2: { build: buildChallenger1SuppliedMk2 },
  challenger1_mk1: { build: buildChallenger1SuppliedMk1 },
  // ... "and we should just use the weird turrets we invented to make nnew tanks like ... X variants": the fictional
  // FV4030/5 (the wide wedge turret and the applique kit) and FV4030/6 (the sleek turret), both on the hull
  // rebuilt from the Challenger 1's references (challenger1Historic.ts).
  challenger_x: { build: (P: TankBuilderPort) => buildChallenger1Historic(P, 'x') },
  challenger_x_sleek: { build: (P: TankBuilderPort) => buildChallenger1Historic(P, 'x_sleek') },
} satisfies VehicleProfileRecord;


// ===========================================================================
// Builders
// ===========================================================================

// ---------------------------------------------------------------------------
// Challenger 2 — §18.5: long low horizontal roofline, shallow one-piece
// glacis + dozer-lip nose, big flat squared skirts, swept-back plan-arrow
// turret with mantlet-less slot, round cdr cupola RIGHT + pano sight,
// huge bustle bin/basket, fat sleeved L30 with MRS, 6 wheels + 4 rollers.
// ---------------------------------------------------------------------------
// BASE-21 helpers (challenger2 rebuild): call-time KIT access.
// Mirror-safe slab (§C MISSING-SIDE law): s=-1 mirrors x AND swaps corner
// order so faces stay outward — never a bare x*s mirror.
const m1MirrX = ([x, y, z]: Vec3Tuple): [number, number, number] => [-x, y, z];
function mslab1(
  s: number,
  b0: Vec3Tuple,
  b1: Vec3Tuple,
  b2: Vec3Tuple,
  b3: Vec3Tuple,
  t0: Vec3Tuple,
  t1: Vec3Tuple,
  t2: Vec3Tuple,
  t3: Vec3Tuple,
): THREE.BufferGeometry {
  const { slab } = KIT;
  return s > 0
    ? slab(b0, b1, b2, b3, t0, t1, t2, t3)
    : slab(m1MirrX(b1), m1MirrX(b0), m1MirrX(b3), m1MirrX(b2), m1MirrX(t1), m1MirrX(t0), m1MirrX(t3), m1MirrX(t2));
}
// Bow tow hook: bracket block + dark pin.
function towHook2(P: ChallengerBuilderPort, x: number, y: number, z: number): void {
  const { box, cylX } = KIT;
  P.add('hullDetail', box(0.09, 0.12, 0.09), x, y, z);
  P.add('hullDark', cylX(0.02, 0.12, 6), x, y + 0.01, z + 0.03);
}

// ---------------------------------------------------------------------------
// CH1-BASE TONE KIT (uk round 2026-08-07 — owner order: "challenger 2 and 3
// ... using the base of the challenger 1"). The challenger1_mk2 r8/r9 family
// tone recipes (uk.ts ukToneKit + ukGearAirBackers) re-expressed for the
// modern1 challenger builders: per-instance material work only — the gate
// renders self-lit masks, so nothing here moves a curve or a mask (§C).
// uk.ts is single-owner + hash-guarded (challenger1_mk2 dbe33204), so the
// mechanism is PORTED, not imported; hex keys follow the tankFactory
// buildRunningGear clone defaults (pads 0x171614 / chain 0x27251f) plus the
// builders' own 0x565c50 tireHex clone (re-keyed to the dark ring tone —
// the ch1 r8 WHEEL-RING GRAMMAR: pale discs read against DARK-drawn tire
// rings, never the inverse).
// ---------------------------------------------------------------------------
function installVehicleAmbientFloorHook(
  material: THREE.MeshStandardMaterial,
): THREE.MeshStandardMaterial {
  return rehookVehicleMaterial(material); // a registered material keeps its registration (2026-10-17)
}

function applyChallengerGearTone(
  object: THREE.Object3D,
  options: ChallengerToneOptions,
): void {
  if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.InstancedMesh)) return;
  const isInstanced = object instanceof THREE.InstancedMesh;
  const material = object.material;
  if (!material || !material.color || !material.color.getHex) return;
  const hex = material.color.getHex();
  if (isInstanced && hex === 0x171614) {
    installVehicleAmbientFloorHook(material).color.setHex(options.padHex ?? 0x272b20);
    material.envMapIntensity = options.padEnv ?? 0.18;
    return;
  }
  if (isInstanced && hex === 0x27251f) {
    installVehicleAmbientFloorHook(material).color.setHex(options.chainHex ?? 0x2f3427);
    material.envMapIntensity = options.chainEnv ?? 0.22;
    return;
  }
  // (owner 2026-09-22 running-gear finish: the tire rings, road-wheel discs and end-wheel bodies keep the fleet
  // rubber and the hull's one scheme wheel paint; the former ring/wheelTone/drumTone retones left.)
}

function ch1BaseToneKit(P: ChallengerBuilderPort, o: ChallengerToneOptions = {}): void {
  // Blue-glass calm (ch1 r8 O4c lineage): smoked dark-olive, b-r <= 0.
  P.mats.glass.color.setHex(o.glassHex ?? 0x3d443c);
  P.mats.glass.roughness = 0.48;
  P.mats.glass.metalness = 0.38;
  P.mats.glass.envMapIntensity = 0.3;
  if (o.cloth) {
    P.mats.canvasCloth.color.setHex(o.cloth);
    P.mats.canvasCloth.envMapIntensity = o.clothEnv ?? 0.10;
  }
  if (o.dark) P.mats.dark.color.setHex(o.dark);
  P.hullG.traverse((object: THREE.Object3D) => {
    applyChallengerGearTone(object, o);
  });
  const bm = o.bandMul ?? [0.92, 0.98, 0.82];
  for (const tm of [P.mats.trackL, P.mats.trackR]) {
    tm.color.setRGB(bm[0], bm[1], bm[2]);
    tm.envMapIntensity = o.bandEnv ?? 0.08;
  }
  P.mats.spareTrack.color.setHex(o.spareHex ?? 0x2c2f24);
  if (P.mats.rubber.emissive) P.mats.rubber.emissive.setHex(o.tireEmissive ?? 0x191d12);
}

// Render-only gear-air backers (ch1 O1a/r9 lineage): thin dark-olive catch
// plates inside the gear bays, NAMED /shadow/i so the gate mask pass, the
// evaluator masks and the critic framing all EXCLUDE them (§C shadow-proxy
// law). track-clip-audit does NOT skip them — callers thread the envelopes.
function ch1BaseGearBackers(
  P: ChallengerBuilderPort,
  plates: readonly GearBackerPlate[],
  hex = 0x20261c,
): void {
  const m = cloneRehookedVehicleMaterial(P.mats.shadow);
  m.color.setHex(hex);
  m.roughness = 0.97;
  m.metalness = 0.0;
  m.envMapIntensity = 0.14;
  P.disposables.push(m);
  for (const [w, h, d, x, y, z] of plates) {
    for (const side of [-1, 1]) {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, m);
      mesh.name = 'gearAirShadowBacker';
      mesh.position.set(side * x, y, z);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      P.hullG.add(mesh);
      P.disposables.push(geo);
    }
  }
}

// ch1 r10b smoke-tube tips (the c5 r9 O8 recipe, verbatim transform math):
// per-tube proud tips + dark bores so 2x5 banks read circular mouths at 1x.
// Interior by construction at the callers' seats (caps sit inside each
// tube's own r 0.038 face circle; the priced turret rows on both ids are
// print-capped and the deltas are cm-scale on already-authored banks).
function smokeTubeTips(P: ChallengerBuilderPort, banks: readonly SmokeBankSeat[]): void {
  const { cylZ } = KIT;
  for (const [bx, by, bz, yaw, arc] of banks) {
    for (let k = 0; k < 5; k++) {
      const f = k - 2;
      const a = yaw + f * (arc / 5);
      const tx = bx + Math.cos(yaw) * f * 0.095, tz = bz - Math.sin(yaw) * f * 0.095;
      const dx = Math.sin(a), dy = Math.sin(0.5) * Math.cos(a), dz = Math.cos(0.5) * Math.cos(a);
      P.add('turretDark', cylZ(0.030, 0.006, 8), tx + 0.121 * dx, by + 0.121 * dy, tz + 0.121 * dz, -0.5, a, 0);
      P.add('turretDetail', cylZ(0.014, 0.032, 8), tx + 0.138 * dx, by + 0.138 * dy, tz + 0.138 * dz, -0.5, a, 0);
      P.add('turretDark', cylZ(0.011, 0.005, 8), tx + 0.156 * dx, by + 0.156 * dy, tz + 0.156 * dz, -0.5, a, 0);
    }
  }
}

function cr2At(points: readonly (readonly number[])[], z: number): number {
  for (let i = 0; i < points.length - 1; i++) {
    const [za, ya] = points[i], [zb, yb] = points[i + 1];
    if ((z <= za && z >= zb) || (z >= za && z <= zb)) {
      return ya + (yb - ya) * ((z - za) / ((zb - za) || 1));
    }
  }
  const first = points[0]!;
  const last = points.at(-1)!;
  return Math.abs(z - first[0]) < Math.abs(z - last[0]) ? first[1] : last[1];
}

function cr2ProfileStrip(
  P: ChallengerBuilderPort,
  x0: number,
  x1: number,
  top: readonly (readonly number[])[],
  bottom: readonly (readonly number[])[],
): void {
  const zs = [...new Set([...top, ...bottom].map((p) => p[0]))].sort((a, b) => a - b);
  for (let i = 0; i < zs.length - 1; i++) {
    const za = zs[i], zb = zs[i + 1];
    const ta = cr2At(top, za), tb = cr2At(top, zb);
    const ba = cr2At(bottom, za), bb = cr2At(bottom, zb);
    for (const side of [-1, 1]) {
      const xa = side < 0 ? -x1 : x0, xb = side < 0 ? -x0 : x1;
      P.add('hull', slab(
        [xa, ba, za], [xb, ba, za], [xb, bb, zb], [xa, bb, zb],
        [xa, ta, za], [xb, ta, za], [xb, tb, zb], [xa, tb, zb]));
    }
  }
}

// Longitudinal hull loft with independent lower- and upper-course widths.
// The bow and stern are V sections: a constant-width profile strip matches
// their side trace but leaves a broad rectangular face in end views.  This
// closed loft preserves that exact side curve while pulling the lower armor
// inward at each measured cross-section.
function addCr2HullCrossSection(
  P: ChallengerBuilderPort,
  a: Cr2HullSection,
  b: Cr2HullSection,
  side: number,
): void {
  // Courses are listed stern-to-bow: reverse that order once, then reflect
  // the exact triangles. Mirroring rings used opposite wall diagonals.
  P.add('hull',facetedSlab([
    [.33,b.bot,b.z],[b.bw,b.bot,b.z],[a.bw,a.bot,a.z],[.33,a.bot,a.z],
  ],[
    [.33,b.top,b.z],[b.tw,b.top,b.z],[a.tw,a.top,a.z],[.33,a.top,a.z],
  ],side));
}

function cr2HullCrossLoft(P: ChallengerBuilderPort, sections: readonly Cr2HullSection[]): void {
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i], b = sections[i + 1];
    for (const side of [-1, 1]) {
      addCr2HullCrossSection(P, a, b, side);
    }
  }
}

// Three-band version of the source's ruled shell.  A single trapezoid can
// match its silhouette but necessarily flattens the roof between the two
// outer shoulders.  The real 54-triangle component has independent outer
// cheek heights and a narrow ±.49 m centre course, so author those three
// contiguous facets explicitly.
function cr2FacetedShell(P: ChallengerBuilderPort, sections: readonly Cr2FacetedSection[]): void {
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i], b = sections[i + 1];
    const ab = [-a.w, -a.inner, a.inner, a.w];
    const bb = [-b.w, -b.inner, b.inner, b.w];
    const abl = [a.bot, a.centerBot ?? a.bot, a.centerBot ?? a.bot, a.bot];
    const bbl = [b.bot, b.centerBot ?? b.bot, b.centerBot ?? b.bot, b.bot];
    const at = [-a.tw, -a.inner, a.inner, a.tw];
    const bt = [-b.tw, -b.inner, b.inner, b.tw];
    const ah = [a.outer, a.center, a.center, a.outer];
    const bh = [b.outer, b.center, b.center, b.outer];
    for (let band = 0; band < 3; band++) P.add('turret', slab(
      [ab[band], abl[band], a.z], [ab[band + 1], abl[band + 1], a.z],
      [bb[band + 1], bbl[band + 1], b.z], [bb[band], bbl[band], b.z],
      [at[band], ah[band], a.z], [at[band + 1], ah[band + 1], a.z],
      [bt[band + 1], bh[band + 1], b.z], [bt[band], bh[band], b.z]));
  }
}

// Convex/concave XZ-footprint prism with independently measured lower and
// upper courses.  Challenger 2's reference shell is not one loft: its low
// ring core, two Dorchester cheeks, roof plates and bustle modules are
// separate solids.  This helper keeps those solids procedural while letting
// every footprint and roof height follow its own measured plane.
function cr2CourseGeo(
  footprint: readonly Vec2Tuple[],
  lowerY: number | readonly number[],
  upperY: number | readonly number[],
): THREE.BufferGeometry {
  const n = footprint.length;
  const valueAt = (v: number | readonly number[], i: number): number => (
    typeof v === 'number' ? v : v[i]
  );
  // Mirrored courses arrive counter-wound. Keep each height attached to its
  // footprint vertex, then normalize to the clockwise convention used by
  // the cap and side indices; otherwise one mirrored roof cap is backface-
  // culled and the plan mask silently loses half the component.
  const course = footprint.map((point, i) => ({ point, lo: valueAt(lowerY, i), hi: valueAt(upperY, i) }));
  if (!THREE.ShapeUtils.isClockWise(course.map(({ point: [x, z] }) => new THREE.Vector2(x, z)))) course.reverse();
  const pos = [];
  const uv = [];
  for (let i = 0; i < n; i++) {
    const { point: [x, z], lo } = course[i];
    pos.push(x, lo, z);
    uv.push(x * 0.25 + 0.5, z * 0.16 + 0.5);
  }
  for (let i = 0; i < n; i++) {
    const { point: [x, z], hi } = course[i];
    pos.push(x, hi, z);
    uv.push(x * 0.25 + 0.5, z * 0.16 + 0.5);
  }
  const tris = THREE.ShapeUtils.triangulateShape(
    course.map(({ point: [x, z] }) => new THREE.Vector2(x, z)), []);
  const idx = [];
  for (const [a, b, c] of tris) {
    // Earcut's clockwise XZ triangles point toward -Y in Three's XYZ frame:
    // keep that winding for the lower cap and reverse it for the roof.
    idx.push(a, b, c);              // lower cap (-Y)
    idx.push(n + c, n + b, n + a);  // upper cap (+Y)
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(i, j, n + j, i, n + j, n + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function cr2Course(
  P: ChallengerBuilderPort,
  bucket: string,
  footprint: readonly Vec2Tuple[],
  lowerY: number | readonly number[],
  upperY: number | readonly number[],
): void {
  P.add(bucket, cr2CourseGeo(footprint, lowerY, upperY));
}

interface MountedMgOptions {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly cls?: 'mag' | 'm2';
  readonly seed?: number;
  readonly rotationY?: number;
  readonly scale?: number;
  readonly shield?: boolean;
}

function cr2MountedMg(
  P: ChallengerBuilderPort,
  { x, y, z, cls = 'mag', seed = 1, rotationY = 0, scale = 1, shield = false }: MountedMgOptions,
): THREE.Object3D {
  const mg = FITTINGS.pintleMG({
    mats: P.mats, cls, tone: 'two-tone', seed, elev: 0.025, scale,
    ammo: true, shield, ring: { r: cls === 'm2' ? 0.23 : 0.18, stubs: 4 },
    // The slim MAG receiver has no jacket to cover the helper's intentional
    // 100 mm barrel start. Bridge that breech-to-barrel run so these roof
    // weapons read as one connected assembly instead of two floating parts.
    barrelBridge: cls === 'mag',
    rotation: [0, rotationY, 0],
    // VH.14 (coordinator ruling 2026-10-14: every drawn gun works): the crew gun is a working station
    working: true, ridingCradle: true,
  });
  mg.position.set(x, y, z);
  mg.userData.mountSeatY = y;
  P.turretG.add(mg);
  return mg;
}

/** Challenger 2's source-matched remote weapon tower. Keep this assembly in
 * one builder so the 2E derivatives inherit the open cradle, transverse MAG,
 * optics, and articulated boom while choosing their own roof seat. */
interface WeaponTowerOptions {
  readonly centerX?: number;
  readonly seatY?: number;
  readonly roofCarrierY?: number | null;
}

interface WeaponTowerReceipt {
  readonly centerX: number;
  readonly centeredOnRoof: boolean;
  readonly localSeat: readonly number[];
  readonly baseBottomY: number;
  readonly roofCarrierY: number | null;
  readonly roofContactEmbedM: number | null;
  readonly ringRearZ: number;
  readonly receiverSupportFrontZ: number;
  readonly planOverlapM: number;
  readonly ringTopY: number;
  readonly receiverSupportBottomY: number;
  readonly verticalOverlapM: number;
}

function addChallenger2WeaponTowerCradle(
  P: ChallengerBuilderPort,
  stationX: (value: number) => number,
  stationY: (value: number) => number,
): void {
  const { box, cylX, cylY, torus } = KIT;
  P.add('turretDark', box(0.111, 0.110, 0.110),
    stationX(0.7095), stationY(0.7126), 0.136);
  P.addEquipment('turret', box(0.081, 0.080, 0.080),
    stationX(0.7095), stationY(0.7226), 0.136);
  for (const x of [0.605, 0.824]) {
    P.addEquipment('turret', box(0.035, 0.129, 0.380),
      stationX(x), stationY(0.7775), 0.515);
  }
  for (const z of [0.412, 0.695]) {
    P.add('turretDetail', box(0.264, 0.030, 0.026),
      stationX(0.7095), stationY(0.810), z);
  }
  P.add('turretGlass', box(0.19, 0.055, 0.014),
    stationX(0.7095), stationY(0.790), 0.713);
  P.addEquipment('turret', cylY(0.145, 0.155, 0.070, P.q ? 22 : 14),
    stationX(0.77), stationY(0.690), 0.20);
  P.add('turretDark', torus(0.140, 0.010, P.q ? 22 : 14),
    stationX(0.77), stationY(0.730), 0.20);
  for (const x of [0.70, 0.85]) {
    P.addEquipment('turret', box(0.032, 0.18, 0.12),
      stationX(x), stationY(0.805), 0.20);
    P.add('turretDetail', box(0.018, 0.15, 0.018),
      stationX(x), stationY(0.805), 0.20);
  }
  for (const x of [0.685, 0.865]) {
    P.add('turretDark', cylX(0.052, 0.020, P.q ? 16 : 10),
      stationX(x), stationY(0.835), 0.20);
  }
  P.add('turretDetail', box(0.024, 0.18, 0.030),
    stationX(0.725), stationY(0.815), 0.18, 0, 0, -0.38);
  P.add('turretDetail', box(0.024, 0.18, 0.030),
    stationX(0.825), stationY(0.815), 0.18, 0, 0, 0.38);
  P.add('turretDark', box(0.105, 0.090, 0.13),
    stationX(0.655), stationY(0.825), 0.15);
  P.add('turretDetail', box(0.075, 0.018, 0.10),
    stationX(0.655), stationY(0.878), 0.15);
  P.add('turretGlass', box(0.11, 0.055, 0.012),
    stationX(0.775), stationY(0.855), 0.282);
  P.addEquipment('turret', box(0.11, 0.105, 0.20),
    stationX(0.80), stationY(0.865), 0.20);
  // Coaxial jacket with an open bore: its flush rim surrounds the MG barrel.
  P.add('turretDark', lathedWheelSection([[-.17,.018],[-.17,.022],[.17,.022],[.17,.018]], P.q ? 16 : 12),
    stationX(0.98), stationY(0.925), 0.20);
  P.add('turretDark', cylX(0.034, 0.065, P.q ? 16 : 10),
    stationX(1.16), stationY(0.830), 0.20);
}

function addChallenger2WeaponTowerMg(
  P: ChallengerBuilderPort,
  stationX: (value: number) => number,
  stationY: (value: number) => number,
  trueScale = false,
): THREE.Group {
  const { box, cylX } = KIT;
  const stationMg = new THREE.Group();
  const stationPart = (
    geometry: THREE.BufferGeometry,
    px: number,
    py: number,
    pz: number,
    material: THREE.Material = P.mats.dark,
    name = 'challenger2BrowningDerivedPart',
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(stationX(px), stationY(py), pz);
    mesh.castShadow = mesh.receiveShadow = true;
    stationMg.add(mesh);
    return mesh;
  };
  // 2026-10-08 (the owner's calibre-true standard in main 6763d7cc0, applied inside his own station on the coordinator's
  // ruling): on the working station (the 2E's and the Ukrainian CR2's) the L37A2 takes a GPMG's proportions. The source's
  // 0.18 m receiver left only 0.29 m of its true 0.628 m barrel in view, a 0.63 m gun where a butt-less vehicle GPMG runs
  // 1.0-1.1 m. Its 0.40 m receiver now runs rearward from the barrel's base, so 0.55 m of barrel shows, with the
  // ammunition box, feed, back plate and cradle pins following it. The muzzle datum (height and direction) is unchanged.
  const receiverX = trueScale ? 0.41 : 0.775, receiverL = trueScale ? 0.40 : 0.18;
  const receiverFront = receiverX + receiverL / 2, receiverRear = receiverX - receiverL / 2;
  stationPart(box(receiverL, 0.080, 0.15), receiverX, 0.905, 0.20,
    P.mats.dark, 'challenger2BrowningDerivedReceiver');
  stationPart(box(receiverL - 0.02, 0.014, 0.13), receiverX, 0.952, 0.205);
  stationPart(box(0.014, 0.056, 0.10), trueScale ? receiverFront + 0.007 : 0.868, 0.905, 0.20);
  stationPart(box(0.055, 0.020, 0.085), trueScale ? receiverRear - 0.0225 : 0.665, 0.918, 0.20);
  // round 5 (2026-10-08, the fleet lane's circular-cap audit): the barrel's muzzle stands 8 mm out of its sleeve; the two
  // end caps shared the sleeve's plane and fought
  stationPart(cylX(0.018, 0.628, P.q ? 16 : 12), 0.844, 0.925, 0.20,
    P.mats.dark, 'challenger2BrowningDerivedBarrel');
  for (const sleeveX of [0.62, 0.69, 0.76]) {
    stationPart(cylX(0.022, 0.020, P.q ? 16 : 12), sleeveX, 0.925, 0.20);
  }
  // Neutral ammunition box and a visible linked feed terminate at the
  // receiver and remain gunmetal regardless of the vehicle camouflage.
  const feedX = trueScale ? 0.48 : 0.755;
  stationPart(box(0.13, 0.12, 0.16), feedX, 0.892, 0.33);
  stationPart(box(0.12, 0.012, 0.15), feedX, 0.958, 0.33);
  for (let index = 0; index < 5; index++) {
    const t = index / 4;
    stationPart(box(0.024, 0.022, 0.018), feedX + 0.03,
      0.928 - Math.sin(t * Math.PI) * 0.010, 0.285 - t * 0.065);
  }
  for (const side of [-1, 1]) {
    stationPart(box(0.020, 0.020, 0.095), trueScale ? receiverFront - 0.02 : 0.650,
      0.887, 0.20 + side * 0.052);
  }
  stationMg.userData.hasConnectedFeed = true;
  stationMg.userData.hasEngineeredCradle = true;
  stationMg.userData.weaponClass = 'mag58';
  FITTINGS.markExact(stationMg, 'pintleMG');
  P.turretG.add(stationMg);
  return stationMg;
}

function buildChallenger2WeaponTower(
  P: ChallengerBuilderPort,
  { centerX = 0.7095, seatY = 0.690, roofCarrierY = null }: WeaponTowerOptions = {},
): WeaponTowerReceipt {
  const { box, cylX, cylZ } = KIT;
  const stationX = (x: number): number => x + centerX - 0.7095;
  const stationY = (y: number): number => y + seatY - 0.690;

  // VH.14 (coordinator ruling 2026-10-14: every drawn gun works): the tower's GPMG works on every host — the owner's
  // activation on the 2E and the Ukrainian CR2 (2026-10-08) now reaches the base Challenger 2's tower too.
  const automatic = true;
  const station = automatic ? beginAuxiliaryStation(P, {
    name:'challengerRemoteGPMG',caliberMm:7.62,
    yaw:[stationX(.77),stationY(.69),.20],
    pivot:[stationX(.775),stationY(.835),.20],
    muzzle:[stationX(.775),stationY(.925),.575],
  }) : null;
  addChallenger2WeaponTowerCradle(P, stationX, stationY);
  const stationMg=addChallenger2WeaponTowerMg(P, stationX, stationY, automatic);
  if(station){
    delete stationMg.userData.fittingRoot;
    delete stationMg.userData.fitting;
    delete stationMg.userData.fittingExact;
    // Turn the source's crosswise barrel forward about its receiver, then
    // move the complete receiver/feed stock into the elevation cradle.
    const origin=new THREE.Vector3(stationX(.775),stationY(.925),.20);
    const matrix=new THREE.Matrix4().makeTranslation(...origin.toArray())
      .multiply(new THREE.Matrix4().makeRotationY(-Math.PI/2))
      .multiply(new THREE.Matrix4().makeTranslation(...origin.clone().negate().toArray()));
    for(const child of stationMg.children)child.applyMatrix4(matrix);
    station.attachPitch(stationMg);
  }


  for (const x of [0.685, 0.735]) {
    P.add('turretDark', cylZ(0.012, 0.58, P.q ? 14 : 10), stationX(x), stationY(0.902), 0.015);
  }
  for (const z of [-0.25, -0.02, 0.27]) {
    P.add('turretDetail', box(0.075, 0.025, 0.025), stationX(0.710), stationY(0.910), z);
  }
  P.addEquipment('turret', box(0.073, 0.060, 0.282), stationX(0.710), stationY(0.921), 0.442);
  P.add('turretGlass', box(0.050, 0.036, 0.012), stationX(0.710), stationY(0.922), 0.589);
  for (const x of [0.680, 0.740]) P.add('turretDark', box(0.010, 0.052, 0.242),
    stationX(x), stationY(0.921), 0.442);
  for (const z of [0.335, 0.445, 0.555]) {
    P.add('turretDetail', cylX(0.018, 0.071, P.q ? 14 : 10), stationX(0.710), stationY(0.949), z);
    P.add('turretDark', cylX(0.010, 0.078, P.q ? 12 : 8), stationX(0.710), stationY(0.950), z);
  }
  P.add('turretDark', box(0.041, 0.027, 0.053), stationX(0.7095), stationY(0.9215), 0.6485);
  P.add('turretGlass', box(0.030, 0.018, 0.012), stationX(0.7095), stationY(0.922), 0.676);
  P.add('turretDark', box(0.042, 0.028, 0.083), stationX(0.709), stationY(0.921), -0.315);
  P.add('turretDetail', box(0.030, 0.018, 0.014), stationX(0.709), stationY(0.922), -0.359);
  P.add('turretDark', box(0.046, 0.030, 0.974), stationX(0.710), stationY(0.912), 0.776);
  for (const z of [0.64, 0.96, 1.22]) {
    P.add('turretDetail', cylZ(0.022, 0.055, P.q ? 14 : 10), stationX(0.710), stationY(0.912), z);
  }
  P.addEquipment('turret', box(0.060, 0.10, 0.15), stationX(0.75), stationY(0.940), 0.47);
  P.addEquipment('turret', box(0.060, 0.10, 0.20), stationX(0.75), stationY(0.940), -0.12);
  if (P.q) for (let k = 0; k < 6; k++) {
    const x = 0.708 + k * 0.025;
    P.add('turretDetail', box(0.018, 0.018, 0.13), stationX(x),
      stationY(0.940 - Math.abs(k - 2.5) * 0.003), 0.21);
    P.add('turretDark', box(0.010, 0.012, 0.10), stationX(x),
      stationY(0.947 - Math.abs(k - 2.5) * 0.003), 0.21);
  }

  station?.mark('yaw');
  const baseBottomY = seatY - 0.035;
  const receipt = Object.freeze({
    exactChallenger2Assembly: true,
    centerX,
    centeredOnRoof: Math.abs(centerX) < 1e-9,
    localSeat: [centerX, seatY, 0.20],
    baseBottomY,
    roofCarrierY,
    roofContactEmbedM: roofCarrierY == null ? null : roofCarrierY - baseBottomY,
    ringRearZ: 0.355,
    receiverSupportFrontZ: 0.325,
    planOverlapM: 0.030,
    ringTopY: stationY(0.725),
    receiverSupportBottomY: stationY(0.713),
    verticalOverlapM: 0.012,
  });
  P.turretG.userData.challenger2WeaponTowerReceipt = receipt;
  return receipt;
}

interface Cr2SurfaceFrame {
  readonly normal: THREE.Vector3;
  readonly horizontal: THREE.Vector3;
  readonly vertical: THREE.Vector3;
  readonly rotation: [number, number, number];
}

function cr2SurfaceFrame(normalValues: Vec3Tuple, horizontalHint: Vec3Tuple): Cr2SurfaceFrame {
  const normal = new THREE.Vector3(...normalValues).normalize();
  const horizontal = new THREE.Vector3(...horizontalHint);
  horizontal.addScaledVector(normal, -horizontal.dot(normal)).normalize();
  const vertical = new THREE.Vector3().crossVectors(normal, horizontal).normalize();
  const matrix = new THREE.Matrix4().makeBasis(horizontal, vertical, normal);
  const euler = new THREE.Euler().setFromRotationMatrix(matrix, 'XYZ');
  return { normal, horizontal, vertical, rotation: [euler.x, euler.y, euler.z] };
}

/** Variant-only roof and protection packages. The sovereign CR2 hull/turret
 * remains shared, while every fitting below has an explicit seat or carrier. */
function* buildChallenger2VariantPackageSteps(
  P: ChallengerBuilderPort,
  variant: string,
  roofSeats: RoofSeatReceipt[],
  smokeMouths: SmokeMouthReceipt[],
): TankProfileBuild {
  const { cylY, cylZ, cupola } = KIT;
  const pivotY = P.spec.armor.turretPivot[1];
  const pivotZ = P.spec.armor.turretPivot[2];
  const enhanced = variant === 'challenger2e' || variant === 'ua_challenger2';
  const ukrainian = variant === 'ua_challenger2';
  const receipt: Challenger2VariantReceipt = {
    variant,
    baseCheekPanelsRemoved: true,
    baseSightWellsRemoved: true,
    legacyHydrogasGapAssembliesRemoved: true,
    mannedMachineGuns: 0,
    enhancedSkirtPanels: 0,
    glacisEraCassettes: 0,
    turretEraCassettes: 0,
    fuelBarrels: 0,
    cageRails: 0,
    cagePosts: 0,
    cageDeckTiePlates: 0,
    roofAttachmentCount: 0,
    maximumRoofGapM: 0,
    bridgedMachineGunBarrels: 0,
    cheekEraHorizontallyMirrored: false,
    cheekEraNormalAlignmentDot: 0,
    cheekEraColumnsPerSide: 0,
    cheekEraRowsPerSide: 0,
    cheekEraCassetteWidthM: 0,
    cheekEraCassetteHeightM: 0,
    cheekEraHorizontalGapM: 0,
    cheekEraVerticalGapM: 0,
    cheekEraIndividualSquares: false,
    cheekEraSurfaceLoweringM: 0,
    cheekEraVerticalBoundsBySide: { left: null, right: null },
    glacisEraNormalAlignmentDot: 0,
    smokeBanks: 0,
    smokeCanisters: 0,
    smokeCarrierMaximumGapM: null,
    smokeCanisterMinimumEmbedM: 0,
    smokeCanistersSurfaceDerived: false,
    canopyMaximumLegGapM: null,
    canopyLoweringM: 0,
  };

  const buildChallenger2VariantPackageTurretStage1 = (): void => {
    if (variant === 'fv4034') {
      // A deliberately sparse predecessor-style fighting compartment: two low
      // manual cupolas, independent episcope clusters and no CR2 RWS/GPS tower.
      // Each base follows its own ray-tested roof carrier; the roof is strongly
      // asymmetric here, so a shared Y buried the loader cupola while leaving
      // daylight beneath the commander station.
      const loaderCupolaCarrierY = 0.6124;
      const commanderCupolaCarrierY = 0.4683;
      const loaderCupolaBaseY = loaderCupolaCarrierY - 0.010;
      const commanderCupolaBaseY = commanderCupolaCarrierY - 0.010;
      cupola(P, 'turret', -0.56, loaderCupolaBaseY, -0.72, 0.24, 0.12, 7);
      cupola(P, 'turret', 0.54, commanderCupolaBaseY, -0.62, 0.25, 0.14, 8);
      roofSeats.push(
        { label: 'fv4034-loader-cupola', carrierY: loaderCupolaCarrierY, bottomY: loaderCupolaBaseY },
        { label: 'fv4034-commander-cupola', carrierY: commanderCupolaCarrierY, bottomY: commanderCupolaBaseY },
      );
      for (const [x, z, a, carrierY] of [
        [-0.86, -0.36, -0.35, 0.3969], [-0.30, -0.25, 0.15, 0.4989],
        [0.28, -0.22, -0.12, 0.5012], [0.86, -0.38, 0.35, 0.4278],
      ]) {
        const y = carrierY + 0.035 - 0.010;
        periscope(P, 'turretDetail', x, y, z, a);
        roofSeats.push({ label: `fv4034-periscope-${x}`, carrierY, bottomY: y - 0.035 });
      }
      P.add('turretDetail', box(0.10, 0.16, 0.10), 0.05, 0.58, -1.34);
      P.add('turretDetail', cylY(0.014, 0.018, 0.36, 8), 0.05, 0.80, -1.34);
      const loaderMgSeatY = loaderCupolaBaseY + 0.12 + 0.040 - 0.005;
      // VH.14 (coordinator ruling 2026-10-14: roof weapons match the real vehicle and every drawn gun works): the
      // Challenger 2's one roof gun is the loader's L37A2 GPMG, a working station; the commander carries none, so the
      // M2 on his cupola is gone.
      cr2MountedMg(P, { x: -0.56, y: loaderMgSeatY, z: -0.72, cls: 'mag', seed: 41, rotationY: -0.12 });
      roofSeats.push(
        { label: 'fv4034-loader-machine-gun', carrierY: loaderMgSeatY + 0.005, bottomY: loaderMgSeatY },
      );
      receipt.mannedMachineGuns = 1;
      receipt.bridgedMachineGunBarrels = 1;
      receipt.roofAttachmentCount = 7;
      for (const side of [-1, 1]) for (let k = 0; k < 4; k++) {
        const angle = side * (0.64 + k * 0.09);
        const tubeX = side * 1.02 + Math.cos(angle) * (k - 1.5) * 0.06;
        const tubeZ = 1.16 - Math.sin(angle) * (k - 1.5) * 0.06;
        P.addEquipment('turret', markSmokeTube(cylZ(0.040, 0.22, 8)), tubeX, 0.34, tubeZ, -0.48, angle, 0);
        P.add('turretDark', xform(cylZ(0.032, 0.012, 10), 0, 0, 0.114),
          tubeX, 0.34, tubeZ, -0.48, angle, 0);
        smokeMouths.push({ side, tubeCenter: [tubeX, 0.34, tubeZ], rotation: [-0.48, angle, 0], mouthOffsetZ: 0.114 });
      }
    }
  };
  buildChallenger2VariantPackageTurretStage1();
  yield 'buildChallenger2VariantPackageTurretStage1';

  const buildChallenger2VariantPackageTurretStage2 = (): void => {
    if (enhanced) {
      // Enlarged segmented skirt package with a continuous carrier behind it.
      const buildChallenger2VariantPackageTurretCourse1 = (): void => {
        const buildChallenger2VariantPackageHullStage1 = (): void => {
          for (const side of [-1, 1] as const) {
            // 2026-10-19 (owner float sweep): the carrier stood 10 mm off the 1.755 skirt course (75 mm island with its
            // bricks); its inner face now runs 12 mm into the course, outer face kept at 1.855.
            // 2026-10-25 (the owner: "update the sideskirts of tanks like ... challenger 2e ... to not be just
            // rectangles, and instead match the geometries of their upperglacis and hull side profile"): the carrier is
            // one profile plate (CR2E_SKIRT), its dark rail 3 cm proud of its top line all along it.
            P.add('hull', profileSkirtGeometry(CR2E_SKIRT, side));
            P.add('hullDark', profileSkirtGeometry(skirtBand(CR2E_SKIRT, -0.03, 0.10, 1.8495, 1.8745), side));
            for (let k = 0; k < 8; k++) {
              const z = 2.92 - k * 0.84 - 0.42, bottom = skirtBottomAt(CR2E_SKIRT, z) + 0.03, top = skirtTopAt(CR2E_SKIRT, z) - 0.03;
              if (z > CR2E_SKIRT.stations[0][0] + 0.03) P.add('hullDetail', box(0.035, top - bottom, 0.025), side * 1.865, (top + bottom) / 2, z);
              receipt.enhancedSkirtPanels++;
            }
          }
        };
        buildChallenger2VariantPackageHullStage1();
        const buildChallenger2VariantPackageAssemblyStage1 = (): void => {
          P.eraCluster('cr2e_skirt_era_R', (put) => {
            for (let c = 0; c < 6; c++) for (let row = 0; row < 3; row++) {
              // 2026-10-19 (owner float sweep): bricks stood 25 mm off the carrier's 1.855 face; inner face now 2 mm into it
              // (release 240: only where the 0.33 x 0.17 brick lies on the profile plate)
              if (!onCr2eSkirt(row, c)) continue;
              put(1.878, 0.82 + row * 0.22, 3.00 - c * 0.55, 0, Math.PI / 2, 0, 1.18, 1.32, 0.72);
            }
          });
        };
        buildChallenger2VariantPackageAssemblyStage1();
        const buildChallenger2VariantPackageAssemblyStage2 = (): void => {
          P.eraCluster('cr2e_skirt_era_L', (put) => {
            for (let c = 0; c < 6; c++) for (let row = 0; row < 3; row++) {
              if (!onCr2eSkirt(row, c)) continue;
              put(-1.878, 0.82 + row * 0.22, 3.00 - c * 0.55, 0, -Math.PI / 2, 0, 1.18, 1.32, 0.72);
            }
          });
        };
        buildChallenger2VariantPackageAssemblyStage2();
        const glacisEraSides: ReadonlyArray<readonly [string, number]> = [
          ['cr2e_glacis_era_R', 1],
          ['cr2e_glacis_era_L', -1],
        ];
        const buildChallenger2VariantPackageAssemblyStage3 = (): void => {
          for (const [name, side] of glacisEraSides) {
            P.eraCluster(name, (put) => {
              for (let row = 0; row < 3; row++) for (let c = 0; c < 5; c++) {
                // Continuous overlapping courses follow the three marked glacis
                // bands.  The wide final cassette reaches the tapered shoulder while
                // keeping its centre on the actual plate instead of floating past it.
                const z = [3.57, 3.29, 3.01][row];
                const x = side * [0.11, 0.32, 0.53, 0.74, 0.94][c];
                const centerPlate = c === 0;
                const normalValues: Vec3Tuple = centerPlate
                  ? [0, 0.94299, 0.33282]
                  : [0, 0.99504, 0.09950];
                const surfaceY = centerPlate
                  ? [1.3162, 1.3815, 1.4141][row]
                  : [1.3643, 1.3810, 1.4116][row];
                const frame = cr2SurfaceFrame(normalValues, [side, 0, 0]);
                const surfaceOffset = 0.07 * 0.76 * 0.5 - 0.006;
                const point = new THREE.Vector3(x, surfaceY, z)
                  .addScaledVector(frame.normal, surfaceOffset);
                const widthScale = c === 0 ? 0.82 : (c === 4 ? 1.18 : 0.75);
                put(point.x, point.y, point.z, ...frame.rotation, widthScale, 2.25, 0.76);
                receipt.glacisEraCassettes++;
              }
            });
          }
        };
        buildChallenger2VariantPackageAssemblyStage3();
        const turretEraSides: ReadonlyArray<readonly [string, number]> = [
          ['cr2e_turret_era_R', 1],
          ['cr2e_turret_era_L', -1],
        ];
        const buildChallenger2VariantPackageAssemblyStage4 = (): void => {
          for (const [name, side] of turretEraSides) {
            P.eraCluster(name, (put) => {
              const normalValues: Vec3Tuple = [side * 0.3915, 0.6650, 0.6359];
              const frame = cr2SurfaceFrame(normalValues, [side, 0, -0.62]);
              const placementVertical = frame.vertical.clone();
              if (placementVertical.y < 0) placementVertical.multiplyScalar(-1);
              const planePoint = new THREE.Vector3(side * 0.98, 0.2034, 1.36);
              const surfaceLowering = 0.075;
              const surfaceOffset = 0.07 * 0.82 * 0.5 - 0.006;
              // Leave daylight around every cassette. The former 4 x 3 course used
              // a pitch identical to each block's face dimensions, so twelve parts
              // rendered as one applique slab. These near-square 5 x 2 cassettes
              // retain the cheek envelope while making every reactive element read
              // as an individually replaceable tile.
              const columns = 5;
              const rows = 2;
              const widthScale = 0.68;
              const heightScale = 1.46;
              const horizontalPitch = 0.235;
              const verticalPitch = 0.220;
              const placedYs: number[] = [];
              for (let row = 0; row < rows; row++) for (let c = 0; c < columns; c++) {
                const point = planePoint.clone()
                  .addScaledVector(frame.horizontal, (c - (columns - 1) * 0.5) * horizontalPitch)
                  .addScaledVector(placementVertical,
                    (row - (rows - 1) * 0.5) * verticalPitch - surfaceLowering)
                  // 2026-10-19 (owner float sweep): the cheek falls away under the upper row's two middle cassettes
                  // (35 mm islands, 62 mm off at their centres); they sink 46 mm along the normal onto it.
                  .addScaledVector(frame.normal, surfaceOffset - (row === 1 && (c === 1 || c === 2) ? 0.046 : 0));
                put(point.x, pivotY + point.y, pivotZ + point.z,
                  ...frame.rotation, widthScale, heightScale, 0.82);
                placedYs.push(pivotY + point.y);
                receipt.turretEraCassettes++;
              }
              receipt.cheekEraVerticalBoundsBySide[side < 0 ? 'left' : 'right'] = [
                Math.min(...placedYs), Math.max(...placedYs),
              ];
              receipt.cheekEraColumnsPerSide = columns;
              receipt.cheekEraRowsPerSide = rows;
              receipt.cheekEraCassetteWidthM = 0.28 * widthScale;
              receipt.cheekEraCassetteHeightM = 0.13 * heightScale;
              receipt.cheekEraHorizontalGapM = horizontalPitch - receipt.cheekEraCassetteWidthM;
              receipt.cheekEraVerticalGapM = verticalPitch - receipt.cheekEraCassetteHeightM;
              receipt.cheekEraSurfaceLoweringM = surfaceLowering;
            }, true);
          }
        };
        buildChallenger2VariantPackageAssemblyStage4();
        const buildChallenger2VariantPackageAssemblyStage5 = (): void => {
          receipt.cheekEraHorizontallyMirrored = true;
        };
        buildChallenger2VariantPackageAssemblyStage5();
        const buildChallenger2VariantPackageAssemblyStage6 = (): void => {
          receipt.cheekEraNormalAlignmentDot = 1;
        };
        buildChallenger2VariantPackageAssemblyStage6();
        const buildChallenger2VariantPackageAssemblyStage7 = (): void => {
          receipt.cheekEraIndividualSquares = true;
        };
        buildChallenger2VariantPackageAssemblyStage7();
        const buildChallenger2VariantPackageAssemblyStage8 = (): void => {
          receipt.glacisEraNormalAlignmentDot = 1;
        };
        buildChallenger2VariantPackageAssemblyStage8();

        const loaderCupolaCarrierY = 0.6130;
        const commanderCupolaCarrierY = 0.4684;
        const loaderCupolaBaseY = loaderCupolaCarrierY - 0.010;
        const commanderCupolaBaseY = commanderCupolaCarrierY - 0.010;
        const buildChallenger2VariantPackageTurretStage4 = (): void => {
          cupola(P, 'turret', -0.58, loaderCupolaBaseY, -0.74, 0.25, 0.13, 8);
        };
        buildChallenger2VariantPackageTurretStage4();
        const buildChallenger2VariantPackageTurretStage5 = (): void => {
          cupola(P, 'turret', 0.56, commanderCupolaBaseY, -0.60, 0.27, 0.15, 9);
        };
        buildChallenger2VariantPackageTurretStage5();
        const loaderMgSeatY = loaderCupolaBaseY + 0.13 + 0.040 - 0.005;
        // 2026-10-08 (the owner's field standard in main 6763d7cc0, the coordinator's ruling on the lane's audit): the
        // CR2E's weapons are the loader's L37A2 GPMG on his cupola and the remote station slaved to the commander's sight
        // (the weapon tower below; the owner activated it on the 2E and the Ukrainian CR2). The commander's shielded crew
        // M2 duplicated that station on his side and the aft-facing MAG on the bustle has no real mount, so both are gone.
        const buildChallenger2VariantPackageAssemblyStage9 = (): void => {
          cr2MountedMg(P, { x: -0.58, y: loaderMgSeatY, z: -0.74, cls: 'mag', seed: 51, rotationY: -0.18 });
        };
        buildChallenger2VariantPackageAssemblyStage9();
        const towerReceipt = buildChallenger2WeaponTower(P, {
          centerX: 0,
          seatY: 0.500,
          roofCarrierY: 0.4731,
        });
        const buildChallenger2VariantPackageReceiptStage2 = (): void => {
          roofSeats.push(
            { label: `${variant}-loader-cupola`, carrierY: loaderCupolaCarrierY, bottomY: loaderCupolaBaseY },
            { label: `${variant}-commander-cupola`, carrierY: commanderCupolaCarrierY, bottomY: commanderCupolaBaseY },
            { label: `${variant}-loader-machine-gun`, carrierY: loaderMgSeatY + 0.005, bottomY: loaderMgSeatY },
            { label: `${variant}-weapon-tower`, carrierY: towerReceipt.roofCarrierY,
              bottomY: towerReceipt.baseBottomY },
          );
        };
        buildChallenger2VariantPackageReceiptStage2();
        const buildChallenger2VariantPackageGunStage1 = (): void => {
          receipt.mannedMachineGuns = 2;
        };
        buildChallenger2VariantPackageGunStage1();
        const buildChallenger2VariantPackageGunStage2 = (): void => {
          receipt.bridgedMachineGunBarrels = 1;
        };
        buildChallenger2VariantPackageGunStage2();
        const buildChallenger2VariantPackageTurretStage6 = (): void => {
          for (const side of [-1, 1]) {
            const frame = cr2SurfaceFrame(
              [side * 0.3915, 0.6650, 0.6359],
              [side, 0, -0.62],
            );
            const cheekPoint = new THREE.Vector3(side * 0.98, 0.2034, 1.36);
            const carrierWidth = 0.36;
            const carrierHeight = 0.30;
            const carrierDepth = 0.085;
            const carrierSeatEmbed = 0.010;
            const carrierCenter = cheekPoint.clone()
              .addScaledVector(frame.horizontal, 0.43)
              .addScaledVector(frame.normal, carrierDepth * 0.5 - carrierSeatEmbed);
            P.addEquipment('turret', box(carrierWidth, carrierHeight, carrierDepth),
              carrierCenter.x, carrierCenter.y, carrierCenter.z, ...frame.rotation);

            // A visible retaining cross keeps the launchers from reading as tubes
            // pasted directly onto armor. Both bars share the cheek frame and sit
            // just proud of the carrier face.
            const retainingFace = carrierCenter.clone().addScaledVector(frame.normal, carrierDepth * 0.5 + 0.010);
            for (const horizontalOffset of [-0.085, 0.085]) {
              const strap = retainingFace.clone().addScaledVector(frame.horizontal, horizontalOffset);
              P.add('turretDark', box(0.035, carrierHeight * 0.88, 0.018),
                strap.x, strap.y, strap.z, ...frame.rotation);
            }

            const tubeLength = 0.21;
            const rearEmbed = 0.012;
            for (let row = 0; row < 2; row++) for (let column = 0; column < 2; column++) {
              const seat = retainingFace.clone()
                .addScaledVector(frame.horizontal, (column - 0.5) * 0.17)
                .addScaledVector(frame.vertical, (row - 0.5) * 0.13);
              const yaw = side * (0.38 + column * 0.06);
              const rotation: [number, number, number] = [-0.30 + row * 0.03, yaw, 0];
              const axis = new THREE.Vector3(0, 0, 1)
                .applyEuler(new THREE.Euler(...rotation, 'XYZ'));
              const center = seat.clone().addScaledVector(axis, tubeLength * 0.5 - rearEmbed);
              P.addEquipment('turret', markSmokeTube(cylZ(0.040, tubeLength, 8)),
                center.x, center.y, center.z, ...rotation);
              P.add('turretDark', xform(cylZ(0.032, 0.012, 10), 0, 0, 0.109),
                center.x, center.y, center.z, ...rotation);
              smokeMouths.push({ side, tubeCenter: center.toArray(), rotation, mouthOffsetZ: 0.109 });
              receipt.smokeCanisters++;
            }
            receipt.smokeBanks++;
          }
        };
        buildChallenger2VariantPackageTurretStage6();
        const buildChallenger2VariantPackageAssemblyStage12 = (): void => {
          receipt.smokeCarrierMaximumGapM = 0;
        };
        buildChallenger2VariantPackageAssemblyStage12();
        const buildChallenger2VariantPackageAssemblyStage13 = (): void => {
          receipt.smokeCanisterMinimumEmbedM = 0.012;
        };
        buildChallenger2VariantPackageAssemblyStage13();
        const buildChallenger2VariantPackageAssemblyStage14 = (): void => {
          receipt.smokeCanistersSurfaceDerived = true;
        };
        buildChallenger2VariantPackageAssemblyStage14();
        const buildChallenger2VariantPackageTurretStage7 = (): void => {
          for (const [x, z, carrierY] of [
            [-0.95, -0.25, 0.3821], [0.92, -0.18, 0.4041], [0.00, -1.18, 0.4326],
          ]) {
            const y = carrierY + 0.12 - 0.010;
            P.addEquipment('turret', box(0.18, 0.24, 0.20), x, y, z);
            P.add('turretGlass', box(0.12, 0.09, 0.012), x, y + 0.06, z + 0.108);
            roofSeats.push({ label: `${variant}-roof-equipment-${x}`, carrierY, bottomY: y - 0.12 });
          }
        };
        buildChallenger2VariantPackageTurretStage7();
        const buildChallenger2VariantPackageAssemblyStage15 = (): void => {
          receipt.roofAttachmentCount = 7;
        };
        buildChallenger2VariantPackageAssemblyStage15();
        const buildChallenger2VariantPackageHullStage2 = (): void => {
          // Release 240 (the owner: "make sure all tank turrets are clear of hulls"): the Ukrainian's drums are 200 L size
          // (0.88 m long after the 1.1 vehicle scale) on the tail, their fronts 4.41 m off the ring's axis, past its
          // bustle rack's floor (1.933 world to 4.3 m); 1.12 m long from -3.07 world, they stood 32 cm into it. The 2E's
          // turret ends 3.9 m off the axis, clear of its drums as built.
          const drumLength = ukrainian ? 0.80 : 1.02, drumZ = ukrainian ? -3.41 : -3.30;
          for (const side of [-1, 1]) {
            P.add('hullDetail', cylZ(0.25, drumLength, P.q ? 20 : 14), side * 0.62, 1.80, drumZ);
            for (const z of ukrainian ? [-3.74, -3.08] : [-3.63, -2.97]) {
              P.add('hullDark', torus(0.255, 0.018, P.q ? 18 : 12), side * 0.62, 1.80, z,
                Math.PI / 2, 0, 0);
              P.add('hullDetail', box(0.42, 0.055, 0.10), side * 0.62, 1.56, z);
            }
            receipt.fuelBarrels++;
          }
        };
        buildChallenger2VariantPackageHullStage2();
      };
      buildChallenger2VariantPackageTurretCourse1();
    }
  };
  buildChallenger2VariantPackageTurretStage2();
  yield 'buildChallenger2VariantPackageTurretStage2';

  const buildChallenger2VariantPackageTurretStage3 = (): void => {
    if (ukrainian) {
      // Pair the open rear cage with low deck tie plates. Besides giving the
      // stand-off frame a credible hull attachment, these close the two tiny
      // top-view seams left between the rear deck and the cage perimeter.
      const buildChallenger2VariantPackageTurretCourse2 = (): void => {
        for (const side of [-1, 1]) {
          P.add('hullDetail', box(0.18, 0.04, 0.18), side * 0.975, 1.48, -2.39);
          receipt.cageDeckTiePlates++;
        }
        // (release 240, the owner: "make sure all tank turrets are clear of hulls": the hull cage tops 1.585, under the
        // turret's side baskets (1.752 world, after the hull's 1.1 scale) that sweep it from z -0.10; at 1.658 it stood in
        // them)
        for (const side of [-1, 1]) {
          for (const y of [1.12, 1.35, 1.565]) {
            P.add('hullDetail', cylZ(0.018, 3.70, 8), side * 1.94, y, -1.95);
            receipt.cageRails++;
          }
          for (let k = 0; k < 8; k++) {
            const z = -0.18 - k * 0.50;
            P.add('hullDetail', box(0.028, 0.48, 0.028), side * 1.94, 1.345, z);
            P.add('hullDetail', box(0.44, 0.035, 0.035), side * 1.82, 1.48, z);
            receipt.cagePosts++;
          }
          for (const y of [0.18, 0.42, 0.66]) {
            P.add('turretDetail', cylZ(0.017, 2.85, 8), side * 1.73, y, -1.40);
            receipt.cageRails++;
          }
          for (let k = 0; k < 6; k++) {
            const z = -0.18 - k * 0.52;
            P.add('turretDetail', box(0.026, 0.52, 0.026), side * 1.73, 0.42, z);
            P.add('turretDetail', box(0.38, 0.030, 0.030), side * 1.56, 0.46, z);
            receipt.cagePosts++;
          }
        }
        for (const y of [0.16, 0.43, 0.70]) {
          P.add('turretDetail', box(3.44, 0.024, 0.024), 0, y, -3.42);
          receipt.cageRails++;
        }
        for (let k = 0; k < 8; k++) {
          P.add('turretDetail', box(0.026, 0.56, 0.026), -1.50 + k * 0.43, 0.43, -3.42);
          receipt.cagePosts++;
        }
        const canopyRailY = 0.95;
        for (const [x, z, w, d] of [[0, -1.0, 2.8, 0.024], [0, 0.60, 2.8, 0.024],
          [-1.39, -0.20, 0.024, 1.60], [1.39, -0.20, 0.024, 1.60]]) {
          P.add('turretDetail', box(w, 0.024, d), x, canopyRailY, z);
          receipt.cageRails++;
        }
        for (const [x, z, carrierY] of [
          [-1.28, -0.90, 0.2342], [1.28, -0.90, 0.1909],
          [-1.28, 0.48, 0.2275], [1.28, 0.48, 0.2150],
        ]) {
          const bottomY = carrierY - 0.010;
          const height = canopyRailY - bottomY;
          P.add('turretDetail', box(0.035, height, 0.035), x, bottomY + height * 0.5, z);
          // 2026-10-19 (owner float sweep): the posts stand 80-120 mm inboard of the canopy's side rails, so the frame
          // floated over them; a tie bar from each post head runs out to the side rail
          P.add('turretDetail', box(0.12, 0.024, 0.024), Math.sign(x) * 1.335, canopyRailY, z);
        }
        receipt.canopyMaximumLegGapM = 0;
        receipt.canopyLoweringM = 1.32 - canopyRailY;
      };
      buildChallenger2VariantPackageTurretCourse2();
    }
  };
  buildChallenger2VariantPackageTurretStage3();
  yield 'buildChallenger2VariantPackageTurretStage3';

  const buildChallenger2VariantPackageReceiptStage1 = (): void => {
    P.turretG.userData.challenger2VariantReceipt = receipt;
    P.hullG.userData.challenger2VariantReceipt = receipt;
  };
  buildChallenger2VariantPackageReceiptStage1();
}

const CHALLENGER2_FAMILY_SCALE = 1.10;
const CHALLENGER3_FAMILY_SCALE = 1.10;

function scaleChallenger2Family(P: ChallengerBuilderPort): void {
  const scale = CHALLENGER2_FAMILY_SCALE;

  // Hull and turret are sibling articulation owners. Scale both in place and
  // move the turret pivot by the same factor so armor, equipment, gun and
  // running gear retain their authored relationships. multiplyScalar keeps
  // the Challenger 2's existing turret-height shaping intact; setScalar would
  // erase that intentional local Y proportion.
  P.hullG.scale.multiplyScalar(scale);
  P.turretG.scale.multiplyScalar(scale);
  P.turretG.position.multiplyScalar(scale);

  // Contact and track-hit metadata is consumed outside the scaled render
  // hierarchy. Convert it to the enlarged vehicle frame so movement, damage,
  // AI probes and killcam anatomy continue to follow the visible tracks.
  if (P.gear?.contactGeom) {
    for (const key of ['halfLenM', 'zCenterM', 'halfWidM', 'bottomYM'] as const) {
      P.gear.contactGeom[key] *= scale;
    }
    if (P.gear.contactGeom.endRise) {
      for (const key of ['dzM', 'frontM', 'rearM'] as const) P.gear.contactGeom.endRise[key] *= scale;
    }
  }
  for (const lane of P.gear?.trackHitbox || []) {
    lane.x0 *= scale;
    lane.x1 *= scale;
    lane.poly = lane.poly.map(([z, y]) => [z * scale, y * scale]);
  }

  const receipt = Object.freeze({
    uniformScale: scale,
    turretPivotScaled: true,
    trackContactMetadataScaled: true,
    trackHitGeometryScaled: true,
  });
  P.hullG.userData.challenger2FamilyScaleReceipt = receipt;
  P.turretG.userData.challenger2FamilyScaleReceipt = receipt;
}

function scaleChallenger3Family(P: ChallengerBuilderPort): void {
  const scale = CHALLENGER3_FAMILY_SCALE;
  P.hullG.scale.multiplyScalar(scale);
  P.turretG.scale.multiplyScalar(scale);
  P.turretG.position.multiplyScalar(scale);

  if (P.gear?.contactGeom) {
    for (const key of ['halfLenM', 'zCenterM', 'halfWidM', 'bottomYM'] as const) {
      P.gear.contactGeom[key] *= scale;
    }
    if (P.gear.contactGeom.endRise) {
      for (const key of ['dzM', 'frontM', 'rearM'] as const) P.gear.contactGeom.endRise[key] *= scale;
    }
  }
  for (const lane of P.gear?.trackHitbox || []) {
    lane.x0 *= scale;
    lane.x1 *= scale;
    lane.poly = lane.poly.map(([z, y]) => [z * scale, y * scale]);
  }

  const receipt = Object.freeze({
    uniformScale: scale,
    turretPivotScaled: true,
    trackContactMetadataScaled: true,
    trackHitGeometryScaled: true,
  });
  P.hullG.userData.challenger3FamilyScaleReceipt = receipt;
  P.turretG.userData.challenger3FamilyScaleReceipt = receipt;
}

// 2026-10-25: the Challenger 2E/Ukrainian package's skirt carrier as a profile plate (profileSkirt.ts) instead of a
// 6.82 m box: its 1.36 top holds aft and falls with the hull's glacis band (1.33 at z 3.10, 1.27 at 3.69, where the
// base course still stands at full width); its bottom rakes up over the idler's approach (from z 2.60) and the final
// drive's departure (aft of -2.60), so the plate reaches the bow instead of ending square at 3.33.
const CR2E_SKIRT: ProfileSkirt = { inner: 1.743, outer: 1.855, stations: [
  [-3.49, 1.02, 1.36], [-2.60, 0.60, 1.36], [2.60, 0.60, 1.36], [3.10, 0.78, 1.33], [3.69, 1.06, 1.27],
] };
/** Whether the package's skirt brick in `row` and column `c` lies on the profile plate. */
const onCr2eSkirt = (row: number, c: number): boolean => {
  const y = 0.82 + row * 0.22, z = 3.00 - c * 0.55;
  return fitsInSkirt(CR2E_SKIRT, z - 0.165, z + 0.165, y - 0.0858, y + 0.0858);
};

// 2026-10-25 (the owner: "update the sideskirts of tanks like the m551a1 tts and challenger 3 ... to not be just
// rectangles, and instead match the geometries of their upperglacis and hull side profile (like the m6 linebacker)"): the
// X's skirt is one profile plate (profileSkirt.ts), no longer a 7.18 m box. Its top runs on the 1.55 deck line from the
// stern to the glacis knee (z 2.32), then down the wing's glacis line (1.24 at 3.60) and, aft of the rear deck, down the
// stern's slope; its bottom rakes up over the idler's approach and the sprocket's departure.
const C3X_SKIRT: ProfileSkirt = { inner: 1.74, outer: 1.90, stations: [
  [-3.69, 1.20, 1.464], [-3.50, 1.13, 1.55], [-2.10, 0.64, 1.55], [2.32, 0.64, 1.55], [2.70, 0.64, 1.458], [3.49, 1.05, 1.267],
] };

function buildChallenger3XSkirts(
  P: ChallengerBuilderPort,
  receipt: Challenger3XReceipt,
): void {
  const { box } = KIT;
  // the field the cassettes keep to: under the dark rail that runs 2..8 cm under the top line
  const eraField = skirtBand(C3X_SKIRT, 0.09, 9);
  const [[rearZ], , , , , [frontZ]] = C3X_SKIRT.stations;
  for (const side of [-1, 1] as const) {
    P.add('hull', profileSkirtGeometry(C3X_SKIRT, side));
    P.add('hullDark', profileSkirtGeometry(skirtBand(C3X_SKIRT, 0.02, 0.06, 1.899, 1.925), side));
    for (let station = 0; station < 9; station++) {
      const z = 3.18 - station * 0.82, seamZ = z - 0.40;
      // a panel seam where it falls on the plate, from its bottom line to the rail
      if (seamZ > rearZ + 0.03) {
        const bottom = skirtBottomAt(C3X_SKIRT, seamZ) + 0.02, top = skirtTopAt(C3X_SKIRT, seamZ) - 0.08;
        P.add('hullDetail', box(0.035, top - bottom, 0.035), side * 1.915, (top + bottom) / 2, seamZ);
      }
      // the hanger from the hull's side into the plate, under its top line
      if (z < frontZ - 0.05) P.add('hullDetail', box(0.22, 0.10, 0.08), side * 1.73, skirtTopAt(C3X_SKIRT, z) - 0.05, z);
      receipt.enhancedSkirtPanels++;
      receipt.skirtHangers++;
    }
    const sector = `c3x_skirt_era_${side > 0 ? 'R' : 'L'}`;
    P.eraCluster(sector, (place) => {
      for (let row = 0; row < 3; row++) {
        for (let station = 0; station < 13; station++) {
          const y = 0.79 + row * 0.235, z = 3.18 - station * 0.55;
          // (1.72 x 1.42 of the 0.28 x 0.13 cassette: 0.482 along the plate, 0.185 tall) only where it lies on the plate
          if (!fitsInSkirt(eraField, z - 0.241, z + 0.241, y - 0.0925, y + 0.0925)) continue;
          place(
            side * 1.943, y, z,   // backs 2 mm into the skirt's 1.90 face (22 mm off it)
            0, side * Math.PI / 2, 0,
            1.72, 1.42, 1.22,
          );
          receipt.skirtEraCassettes++;
        }
      }
    });
  }
}

function buildChallenger3XGlacisEra(
  P: ChallengerBuilderPort,
  receipt: Challenger3XReceipt,
): void {
  // 2026-10-21 (owner: "fix the challenger 3's front era as well which isnt on the glacis properly"): the cassettes were
  // laid on the Challenger 2's 13.6-degree glacis line and snapped down onto whatever stock they met, but this hull's
  // glacis falls at 22.3 degrees (y 1.54 at z 2.3 to 1.07 at z 3.5), so each centre cassette sat 9 degrees off the
  // plate on one edge, the third column straddled the 10-20 cm step at |x| 0.92-0.95 between the glacis and the side
  // shelves (13.6 degrees), and the lowest row ran over the glacis' foot. Each cassette now lies on the face under its
  // centre (stockTopFace), back 8 mm in: three columns on the glacis (to |x| 0.87), two on the shelf (from |x| 0.97),
  // four rows up the slope from the foot.
  const columns = [0.155, 0.445, 0.735, 1.10, 1.39];
  const rows = [3.384, 3.107, 2.829, 2.552];
  const scale = [0.94, 1.76, 0.80] as const, depth = 0.07 * scale[2], embed = 0.008;
  for (const side of [-1, 1]) {
    const sector = `c3x_glacis_era_${side > 0 ? 'R' : 'L'}`;
    P.eraCluster(sector, (place) => {
      for (const z of rows) {
        for (const column of columns) {
          const { point, normal } = stockTopFace(P, side * column, z);
          const turn = upSlopeTurn(normal), centre = point.addScaledVector(normal, depth / 2 - embed);
          place(centre.x, centre.y, centre.z, turn.x, turn.y, turn.z, ...scale);
          receipt.glacisEraCassettes++;
        }
      }
    });
  }
}

function buildChallenger3XTurretEra(
  P: ChallengerBuilderPort,
  receipt: Challenger3XReceipt,
): void {
  const { box } = KIT;
  const [turretPivotX, turretPivotY, turretPivotZ] = P.spec.armor.turretPivot;
  for (const side of [-1, 1]) {
    const frame = cr2SurfaceFrame([side * 0.42, 0.66, 0.62], [side, 0, -0.56]);
    const sector = `c3x_turret_cheek_era_${side > 0 ? 'R' : 'L'}`;
    P.eraCluster(sector, (place) => {
      const origin = new THREE.Vector3(side * 0.91, 0.22, 1.13);
      for (let row = 0; row < 4; row++) {
        for (let station = 0; station < 4; station++) {
          const point = origin.clone()
            .addScaledVector(frame.horizontal, (station - 1.5) * 0.285)
            .addScaledVector(frame.vertical, (row - 1.5) * 0.145)
            .addScaledVector(frame.normal, 0.018);
          place(
            point.x + turretPivotX, point.y + turretPivotY, point.z + turretPivotZ,
            ...frame.rotation, 0.98, 1.06, 0.82,
          );
          receipt.cheekEraCassettes++;
        }
      }
    }, true);

    const sideSector = `c3x_turret_side_era_${side > 0 ? 'R' : 'L'}`;
    P.add('turret', box(0.13, 0.67, 3.12), side * 1.49, 0.40, -1.62);
    P.eraCluster(sideSector, (place) => {
      for (let row = 0; row < 3; row++) {
        for (let station = 0; station < 8; station++) {
          // each cassette backs onto the falling turret side behind it (owner 2026-10-19 sweep: 8-43 mm off it)
          P.snapGroup('c3-turret-side-era', () => place(
            side * 1.74, turretPivotY + 0.20 + row * 0.205,
            turretPivotZ - 2.90 + station * 0.37,
            0, side * Math.PI / 2, 0,
            1.24, 1.30, 1.20,
          ), { reachM: 0.06 });
          receipt.turretSideEraCassettes++;
        }
      }
    }, true);
  }
}

function buildChallenger3XSensors(
  P: ChallengerBuilderPort,
  receipt: Challenger3XReceipt,
): void {
  const { box, cylX, cylY, cylZ, torus } = KIT;
  P.addEquipment('turret', box(0.58, 0.42, 0.42), -0.67, 0.36, 1.28);
  P.add('turretDetail', box(0.68, 0.10, 0.52), -0.67, 0.18, 1.14);
  P.add('turretDark', cylZ(0.205, 0.15, 18), -0.67, 0.36, 1.52);
  P.add('turretGlass', cylZ(0.165, 0.018, 18), -0.67, 0.36, 1.605);
  P.add('turretDetail', torus(0.205, 0.018, 18), -0.67, 0.36, 1.605);
  receipt.searchlights = 1;

  P.addEquipment('turret', box(0.64, 0.15, 0.58), 0, 0.70, -2.18);
  P.add('turretDark', cylY(0.19, 0.23, 0.12, 12), 0, 0.82, -2.18);
  P.addEquipment('turret', box(0.13, 0.56, 0.13), 0, 1.08, -2.18);
  for (const side of [-1, 1]) {
    P.add('turretDetail', cylX(0.022, 0.58, 8), side * 0.16, 1.08, -2.18,
      0, 0, side * 0.48);
  }
  P.addEquipment('turret', box(0.90, 0.52, 0.08), 0, 1.39, -2.14, -0.08, 0, 0);
  // Art fixes 230 (2026-10-21, hero-card critics: "a flat black untextured box stands on the turret roof"): the array
  // face is a painted radome like the frame it sits in, divided into four tiles by dark joint strips. Finish only.
  P.add('turretDetail', box(0.78, 0.40, 0.018), 0, 1.39, -2.095, -0.08, 0, 0);
  for (const x of [-0.30, 0, 0.30]) {
    P.add('turretDark', box(0.018, 0.44, 0.014), x, 1.39, -2.083, -0.08, 0, 0);
  }
  receipt.radarArrays = 1;
}

function buildChallenger3XBustle(
  P: ChallengerBuilderPort,
  receipt: Challenger3XReceipt,
): void {
  const { box, tarpRoll, jerryCan, ammoCan } = KIT;
  for (const side of [-1, 1]) {
    for (const y of [0.25, 0.48, 0.71]) {
      P.add('turretDetail', box(0.035, 0.035, 1.72), side * 1.58, y, -2.45);
      receipt.bustleCageRails++;
    }
    for (const z of [-1.62, -2.04, -2.46, -2.88, -3.30]) {
      P.add('turretDetail', box(0.035, 0.48, 0.035), side * 1.58, 0.48, z);
      receipt.bustleCageRails++;
    }
  }
  tarpRoll(P, 'turretCloth', -0.88, 0.68, -2.86, 0.62, 0.14, true);
  jerryCan(P, 'turretCloth', 0.92, 0.50, -3.00, 0.10);
  ammoCan(P, 'turretDark', 1.10, 0.48, -2.55, -0.12);
  ammoCan(P, 'turretDark', -1.12, 0.48, -2.45, 0.12);
  for (const x of [-0.62, 0, 0.62]) {
    P.addEquipment('turret', box(0.48, 0.18, 0.46), x, 0.72, -2.85);
    receipt.stowageItems++;
  }
  receipt.stowageItems += 4;
}

function buildChallenger3XPackage(P: ChallengerBuilderPort): void {
  const receipt: Challenger3XReceipt = {
    variant: 'challenger3',
    enhancedSkirtPanels: 0,
    skirtHangers: 0,
    glacisEraCassettes: 0,
    skirtEraCassettes: 0,
    cheekEraCassettes: 0,
    turretSideEraCassettes: 0,
    autocannonStations: 0,
    radarArrays: 0,
    searchlights: 0,
    bustleCageRails: 0,
    stowageItems: 0,
    equipmentSeatsFlush: true,
  };

  buildChallenger3XSkirts(P, receipt);

  // Four shallow courses follow the actual Challenger glacis normal. Split
  // left/right sector names keep the damage and depletion state honest.
  buildChallenger3XGlacisEra(P, receipt);

  // The cheek courses are individual cassettes laid in the ruled cheek
  // plane, rather than a pair of rectangular applique slabs.
  buildChallenger3XTurretEra(P, receipt);

  // The owner removed the two nonfunctional shoulder cannons. The live
  // Protector/M2 station remains the vehicle's roof weapon.

  // Oversized left-cheek searchlight with a buried shoe and protected lens.
  buildChallenger3XSensors(P, receipt);

  // A deeper bustle cage and mixed field kit distinguish the X from the
  // production Challenger 3 without turning the roof into one solid block.
  buildChallenger3XBustle(P, receipt);

  receipt.totalEraCassettes = receipt.glacisEraCassettes + receipt.skirtEraCassettes
    + receipt.cheekEraCassettes + receipt.turretSideEraCassettes;
  const frozen = Object.freeze(receipt);
  P.hullG.userData.challenger3XReceipt = frozen;
  P.turretG.userData.challenger3XReceipt = frozen;
}

function* buildChallenger2Steps(P: ChallengerBuilderPort): TankProfileBuild {
  // 2026-10-09 (owner): the field net and garnish (ghillieFleetSuits.ts), laid on the assembled build
  addVehicleGhillieSuit(P);
  const { cylX, tarpRoll, ammoCan } = KIT;
  const { rng } = P;
  const variant = P.spec.id;
  const isBaseChallenger2 = variant === 'challenger2';

  // Six Hydrogas wheels, with the real high-tucked end runs. The end centers
  // also enforce the plan footprint: rear outer course stops at -3.34 while
  // the raised idler reaches the +4.0 bow shoulder.
  const buildChallenger2RunningGearStage1 = (): void => {
    buildRunningGear(P, {
      // 2026-09-14 owner: new Challenger wheels. Real CR2 stations carry paired rubber-tyred
      // halves with a guide channel between them; the fleet's hollow paired primitive draws
      // that at 0.38 m, fitted inboard of the 0.42 m track (0.34 m axial). The former 'dished' bowls,
      // rim tori and hub drums read as one goofy pale plate and are gone.
      style: 'rubber', wheelR: 0.38, wheelW: 0.34, wheelY: 0.40, xc: 1.33,
      roadWheelGeometry: buildHollowPairedRoadWheel({ radiusM: 0.38, high: Boolean(P.q), fasteners: 8, fastenersAsInsets: true, axialWidthM: 0.34 }),
      wheelZs: [2.50, 1.60, 0.70, -0.20, -1.10, -2.00],
      sprocket: { z: -2.85, y: 0.95, r: 0.22 },
      idler: { z: 3.35, y: 0.70, r: 0.25 },
      rollers: [2.05, 0.95, -0.15, -1.25].map((z) => ({ z, y: 0.91, r: 0.085 })),
      // The print's outer x=1.60 lane is skirt, not track.  A wide track band
      // falsely carried the procedural stern to -4.02 in that lane.
      trackW: 0.42, topY: 0.98, contactZF: 2.60, contactZR: -2.10,
      paintedEnds: true, coveredTop: 1.05,
      tireHex: '#33372f', padHex: 0x31332b, chainHex: 0x282b25, // wheel review 2026-09-13: rubber was '#545a50' (bright grey)
    });
  };
  buildChallenger2RunningGearStage1();
  yield 'buildChallenger2RunningGearStage1';
  const addChallengerEndFace = (
    side: number,
    z: number,
    y: number,
    outer: number,
    inner: number,
    spokes: number,
  ): void => {
    const endFaceX = side * 1.566;
    P.add('hullRunningGearDark', new THREE.RingGeometry(inner, outer, P.q ? 28 : 18),
      endFaceX, y, z, 0, side * Math.PI / 2, 0);
    const endRim = new THREE.TorusGeometry((inner + outer) * 0.5,
      (outer - inner) * 0.16, P.q ? 8 : 6, P.q ? 24 : 16);
    endRim.rotateY(Math.PI / 2);
    P.add('hullRunningGearDetail', endRim, endFaceX + side * 0.003, y, z);
    P.add('hullRunningGearDetail', new THREE.RingGeometry(inner * 0.58, inner * 0.92, P.q ? 24 : 16),
      endFaceX + side * 0.002, y, z, 0, side * Math.PI / 2, 0);
    P.add('hullRunningGearDark', new THREE.CircleGeometry(inner * 0.48, P.q ? 20 : 14),
      endFaceX + side * 0.003, y, z, 0, side * Math.PI / 2, 0);
    if (P.q) {
      for (let index = 0; index < spokes; index++) {
        const angle = index * Math.PI * 2 / spokes;
        P.add('hullRunningGearDetail', box(0.008, 0.026, (outer - inner) * 0.88),
          endFaceX + side * 0.004,
          y + Math.sin(angle) * (inner + outer) * 0.25,
          z + Math.cos(angle) * (inner + outer) * 0.25, angle, 0, 0);
        P.add('hullRunningGearDark', cylX(0.017, 0.018, 8),
          endFaceX + side * 0.002,
          y + Math.sin(angle) * (inner + outer) * 0.29,
          z + Math.cos(angle) * (inner + outer) * 0.29);
        if (spokes === 10) P.add('hullRunningGearDark', box(0.010, 0.035, 0.065),
          endFaceX + side * 0.004,
          y + Math.sin(angle) * outer * 0.84,
          z + Math.cos(angle) * outer * 0.84, angle, 0, 0);
      }
    }
    P.add('hullRunningGearDetail', cylX(inner * 0.34, 0.030, P.q ? 16 : 10),
      endFaceX + side * 0.003, y, z);
  };
  const buildChallenger2HullStage1 = (): void => {
    for (const side of [-1, 1]) {
      const buildChallenger2HullCourse1 = (): void => {
        const buildChallenger2HullStage9 = (): void => {
          for (const z of [2.50, 1.60, 0.70, -0.20, -1.10, -2.00]) {
            // Hydrogas swing arm and torsion pivot remain visible through the
            // deep dish and inter-wheel gaps; these are seated behind the face,
            // never painted over it as a decorative spoke.
            P.add('hullRunningGearDark', box(0.055, 0.095, 0.42), side * 1.37, 0.60, z + 0.10,
              -0.52, 0, 0);
            P.add('hullRunningGearDetail', cylX(0.052, 0.030, P.q ? 16 : 10),
              side * 1.477, 0.66, z + 0.22);
          }
        };
        buildChallenger2HullStage9();
        // Obsolete inter-wheel proxy assemblies removed: the articulated wheel
        // layers and swing arms above are the actual programmatic suspension.
        // Articulated end faces reuse the already-certified idler/final-drive
        // radii.  They are planar and seated beyond the shoe face, adding real
        // hub, web and bolt depth without changing the side silhouette.
        const buildChallenger2HullStage10 = (): void => {
          for (const [z, y, outer, inner, spokes] of [
            [3.35, 0.70, 0.245, 0.150, 6],
            [-2.85, 0.95, 0.215, 0.125, 10],
          ]) {
            addChallengerEndFace(side, z, y, outer, inner, spokes);
          }
        };
        buildChallenger2HullStage10();
      };
      buildChallenger2HullCourse1();
    }
  };
  buildChallenger2HullStage1();
  yield 'buildChallenger2HullStage1';

  // Structural hull side curves. The repaired source still leaves one
  // material-fused turret/casemate course in its hull mask: copying that
  // contaminated top trace raised the fixed hull to y=2.07 even though the
  // real ring and the armor model are both at y=1.55. It visibly overlapped
  // the articulated turret and stayed behind when the turret yawed. Preserve
  // the measured belly/end courses, but keep the center deck on the physical
  // CR2 roof/ring datum; the separate low turret below owns everything above
  // it and can now articulate without a second hull-fixed turret silhouette.
  const hullTop = [
    [-4.06, 1.37], [-3.80, 1.53], [-3.62, 1.60], [-3.45, 1.59],
    [-3.28, 1.55], [-3.10, 1.58], [-2.30, 1.58], [-1.74, 1.56],
    [-1.23, 1.55], [-1.14, 1.50], [-1.05, 1.48], [-0.20, 1.53],
    [2.19, 1.53], [2.27, 1.47], [2.62, 1.46], [2.79, 1.44],
    [3.13, 1.40], [3.39, 1.37], [3.56, 1.31], [3.64, 1.36],
    [3.81, 1.35], [3.90, 1.20], [4.07, 1.16],
  ];
  const hullBottom = [
    [-4.06, 1.21], [-3.96, 1.14], [-3.88, 1.10], [-3.79, 1.05],
    [-3.70, 1.05], [-3.62, 1.09], [-3.53, 1.12], [-3.45, 1.02],
    [-3.34, 1.02], [-3.339, 0.62], [-3.20, 0.58],
    [-3.05, 0.59], [-2.95, 0.52], [-2.90, 0.52], [2.80, 0.49], [3.10, 0.56], [3.40, 0.72],
    [3.70, 0.92], [3.80, 1.02],
  ];
  // The exact centerline terminates at -3.66; the shoulder/track courses
  // continue aft.  Keeping the centre belly at y=.49 is the decisive front
  // projection fact: only the tracks, out at x=+/-1.33, touch the ground.
  const centerHullTop = [[-3.66, 1.52], ...hullTop.filter(([z]) => z >= -3.50 && z < 3.80), [3.80, 1.31]];
  const centerHullBottom = [[-3.66, 1.00], ...hullBottom.filter(([z]) => z >= -3.50 && z < 3.80), [3.80, 1.02]];
  const buildChallenger2AssemblyStage2 = (): void => {
    cr2ProfileStrip(P, 0, 0.25, centerHullTop, centerHullBottom);
  };
  buildChallenger2AssemblyStage2();
  yield 'buildChallenger2AssemblyStage2';
  // The armored shoulder terminates inboard of the 1.12 m track inner face;
  // the earlier 1.20 m course was visually hidden but physically intersected
  // both front wrap envelopes.
  // Mid-body remains a ruled shoulder strip.  The end thirds are separate
  // V-section lofts so geometry behind the terminal faces cannot show
  // through as the critic's broad rectangular bow/stern boxes.
  const midTop = [[-2.90, cr2At(hullTop, -2.90)],
    ...hullTop.filter(([z]) => z > -2.90 && z < 2.80),
    [2.80, cr2At(hullTop, 2.80)]];
  const midBottom = [[-2.90, cr2At(hullBottom, -2.90)],
    ...hullBottom.filter(([z]) => z > -2.90 && z < 2.80),
    [2.80, cr2At(hullBottom, 2.80)]];
  // The live linked shoes carry transverse pin caps inboard of the nominal
  // 1.12 m band edge.  Terminate the hidden lower shoulder at 0.96 m so its
  // ruled side cannot enter that moving pin sweep; the visible 1.60..1.755 m
  // upper hull and skirt courses below retain the published CR2 silhouette.
  const buildChallenger2AssemblyStage3 = (): void => {
    cr2ProfileStrip(P, 0.23, 0.96, midTop, midBottom);
    // Release 240 (the owner: "make sure all tank turrets are clear of hulls"): no engine-deck "hinge/vent spine". The
    // source side trace's short crest (1.80 over z -2.10..-1.92) is the turret bustle's underside, which hangs there at
    // rest; as a 12 mm hull fin it stood 19 cm up into the bustle and the turret swept through it at every other bearing.
    cr2HullCrossLoft(P, [
      { z: -4.06, bw: 0.46, tw: 1.00, bot: 1.21, top: 1.38 },
      { z: -3.70, bw: 0.58, tw: 1.06, bot: 1.05, top: 1.54 },
      { z: -3.45, bw: 0.72, tw: 1.08, bot: 1.02, top: 1.55 },
      { z: -3.20, bw: 0.94, tw: 0.96, bot: 0.58, top: 1.58 },
      { z: -2.90, bw: 0.96, tw: 0.96, bot: 0.52, top: 1.57 },
    ]);
    cr2HullCrossLoft(P, [
      { z: 2.80, bw: 0.96, tw: 0.96, bot: 0.49, top: cr2At(hullTop, 2.80) },
      { z: 3.10, bw: 0.84, tw: 0.96, bot: 0.56, top: 1.40 },
      { z: 3.40, bw: 0.70, tw: 0.96, bot: 0.72, top: 1.37 },
      { z: 3.70, bw: 0.56, tw: 1.08, bot: 0.92, top: 1.36 },
      { z: 3.80, bw: 0.50, tw: 1.05, bot: 1.02, top: 1.31 },
    ]);
    // Join the 0.25 m centre strip to the cross-loft's 0.33 m inner course.
    // Leaving that eight-centimetre seam open produced two enclosed plan-view
    // sky wells over the idler station even though both surrounding armor
    // courses were otherwise closed.  This narrow bridge follows the same
    // measured bow profile and stays wholly inside the existing silhouette.
    cr2ProfileStrip(P, 0.25, 0.33,
      [[2.80, cr2At(hullTop, 2.80)], ...hullTop.filter(([z]) => z > 2.80 && z < 3.80), [3.80, 1.31]],
      [[2.80, cr2At(hullBottom, 2.80)], ...hullBottom.filter(([z]) => z > 2.80 && z < 3.80), [3.80, 1.02]]);
    // 2026-10-19 (owner float sweep): the same 0.25..0.33 m seam stayed open aft, between the centre strip and the
    // stern cross-loft (z -3.66..-2.90), an 80 mm see-through slot in the stern belly; the stern bridge follows the
    // centre strip's own profile and closes it.
    cr2ProfileStrip(P, 0.25, 0.33,
      [...centerHullTop.filter(([z]) => z < -2.90), [-2.90, cr2At(centerHullTop, -2.90)]],
      [...centerHullBottom.filter(([z]) => z < -2.90), [-2.90, cr2At(centerHullBottom, -2.90)]]);
  };
  buildChallenger2AssemblyStage3();
  yield 'buildChallenger2AssemblyStage3';

  // Return-run carrier behind the proud Hydrogas discs.  Its lower edge must
  // stay above the moving wheel/track envelope: the former full-height side
  // sheet dropped to ground level and read as armor driven through the track
  // course in low side views.  This is now the shallow structural band that
  // actually lives beneath the fender, while the main hull owns the belly.
  const gearTop = [
    [-3.40, 1.58], [-2.18, 1.58], [-1.60, 1.56], [-1.23, 1.55],
    [-1.14, 1.50], [-1.05, 1.48], [-0.20, 1.47], [-0.19, 1.53],
    [2.19, 1.53], [2.27, 1.47], [2.62, 1.46], [2.80, 1.44],
    [2.95, 1.42], [3.10, 1.40], [3.40, 1.37], [3.56, 1.31],
    [3.64, 1.36], [3.81, 1.35], [3.90, 1.20],
  ];
  const gearBottom = [
    [-3.45, 1.02], [-3.20, 1.00], [-2.80, 0.96], [-2.20, 0.93],
    [-1.20, 0.91], [1.80, 0.91], [2.60, 0.93], [3.10, 0.97],
    [3.40, 1.03], [3.70, 1.10], [3.85, 1.14],
  ];
  const buildChallenger2HullStage2 = (): void => {
    cr2ProfileStrip(P, 1.06, 1.10, gearTop, gearBottom);

    // Plan bands reproduce the oracle's stepped shoulders: center front 3.80,
    // ±1.2 shoulder front 4.08, outer corners 3.69; the stern similarly pulls
    // from -4.06 at the inner band to -2.52 at the track guards.
    for (const side of [-1, 1]) {
      const sx = (v: number): number => side * v;
      P.add('hull', slab(
        [sx(0.90), 0.90, 3.95], [sx(1.20), 0.90, 3.95], [sx(1.20), 0.55, 3.80], [sx(0.90), 0.55, 3.80],
        [sx(0.90), 1.22, 3.95], [sx(1.20), 1.22, 3.95], [sx(1.20), 1.31, 3.80], [sx(0.90), 1.31, 3.80]));
      P.add('hull', slab(
        [sx(0.90), 1.08, 4.08], [sx(1.20), 1.08, 4.08], [sx(1.20), 0.90, 3.95], [sx(0.90), 0.90, 3.95],
        [sx(0.90), 1.16, 4.08], [sx(1.20), 1.16, 4.08], [sx(1.20), 1.22, 3.95], [sx(0.90), 1.22, 3.95]));
      P.add('hull', box(0.30, 0.14, 0.08), sx(0.60), 1.12, 3.82);
      P.add('hull', slab(
        [sx(1.00), 1.08, 4.08], [sx(1.23), 1.08, 4.08], [sx(1.23), 1.44, -4.06], [sx(1.00), 1.44, -4.06],
        [sx(1.00), 1.16, 4.08], [sx(1.23), 1.16, 4.08], [sx(1.23), 1.44, -4.06], [sx(1.00), 1.44, -4.06]));
      P.add('hull', slab(
        [sx(1.23), 1.08, 4.08], [sx(1.60), 1.08, 4.08], [sx(1.60), 1.42, -3.42], [sx(1.23), 1.42, -3.42],
        [sx(1.23), 1.16, 4.08], [sx(1.60), 1.16, 4.08], [sx(1.60), 1.42, -3.42], [sx(1.23), 1.42, -3.42]));
      // The source keeps its full front/rear run almost to x=1.735, then
      // closes through a razor-thin chamfer to the x=1.755 corner datum.
      P.add('hull', slab(
        [sx(1.60), 1.08, 4.08], [sx(1.735), 1.08, 4.08], [sx(1.735), 1.10, -3.40], [sx(1.60), 1.10, -3.42],
        [sx(1.60), 1.16, 4.08], [sx(1.735), 1.16, 4.08], [sx(1.735), 1.33, -3.40], [sx(1.60), 1.36, -3.42]));
      // The source's ninth station (z 1.11..1.75) pulls the outer skirt from
      // ±1.755 to the ±1.736 inner-course seam before returning to the
      // published-width course.  It
      // is a real plan notch between bays, not a global width rescale.
      const skirtOuter: Vec2Tuple[] = [
        [sx(1.735), 4.08], [sx(1.755), 3.69], [sx(1.755), 1.76],
        [sx(1.736), 1.75], [sx(1.736), 1.11], [sx(1.755), 1.10],
        [sx(1.755), -2.52], [sx(1.735), -3.40],
      ];
      const skirtTopAt = (z: number): number => 1.42 + ((z + 2.52) / 6.21) * (1.25 - 1.42);
      cr2Course(P, 'hull', skirtOuter,
        // Keep finite stock under the front crown; the former 1.26 m
        // underside crossed above its 1.25 m top at the front corner.
        [1.17, 1.23, 1.26, 1.26, 1.26, 1.26, 1.26, 1.26],
        [1.25, 1.25, skirtTopAt(1.76), skirtTopAt(1.75), skirtTopAt(1.11), skirtTopAt(1.10), 1.42, 1.42]);
      // segmented skirt faces: station slices see real end caps; shallow lower
      // tabs expose the six large wheels like the source.
      for (let k = 0; k < 6; k++) {
        const z = 2.84 - k * 0.92;
        P.add('hull', box(0.055, 0.50, 0.86), sx(1.700), 0.98, z);
        P.add('hullDark', box(0.050, 0.05, 0.018), sx(1.700), 0.91, z - 0.445);
        P.add('hullDark', box(0.012, 0.43, 0.020), sx(1.700), 0.985, z - 0.445);
        P.add('hullDetail', box(0.010, 0.15, 0.05), sx(1.750), 1.24, z);
        P.add('hullDark', box(0.012, 0.025, 0.20), sx(1.701), 1.07, z + 0.08);
      }
      // lower tabs hang from the skirt faces' 0.73 bottom edge (owner 2026-10-19 sweep: authored 0.115 m under it)
      for (const z of [2.38, 1.28, 0.18, -0.92, -2.02]) {
        P.add('hull', box(0.05, 0.26, 0.30), sx(1.660), 0.615, z);
      }
    }

    // Ring cross-section. The old 2.05 m shoulder copied the same fused source
    // course as hullTop and formed the broad hull-fixed block under the real
    // turret. Both inner and outer shoulders now terminate at the 1.55 m ring.
    // The formerly 1.82 m left rubber strip was the same contamination viewed
    // edge-on, not a physical skirt asymmetry; the repaired source front row
    // measures both outer courses at the common 1.54 m datum.
    for (const side of [-1, 1]) {
      const sx = (v: number): number => side * v;
      const shoulderOuter = side < 0 ? 1.55 : 1.37;
      P.add('hull', slab(
        // The crown falls outward on the right. Its underside follows that
        // rake at 10 mm thickness instead of crossing the outer top edge.
        [sx(1.18), 1.48, -0.55], [sx(shoulderOuter), side < 0 ? 1.47 : 1.46, -0.55],
        [sx(shoulderOuter), side < 0 ? 1.47 : 1.46, 0.55], [sx(1.18), 1.48, 0.55],
        // top 20 mm higher, into the ring landing's 1.5075 underside (it stood 18 mm under it, nothing else holding it)
        [sx(1.18), 1.51, -0.55], [sx(shoulderOuter), side < 0 ? 1.50 : 1.49, -0.55],
        [sx(shoulderOuter), side < 0 ? 1.50 : 1.49, 0.55], [sx(1.18), 1.51, 0.55]));
      // These were accidentally authored as 1.54 m VERTICAL rubber strips.
      // Lay the same rails longitudinally on the fender shoulder instead.
      // The slight fore/aft rake follows the live deck course at z +/-0.77.
      // 2026-10-19 (owner float sweep): the rails stood 35-47 mm over the 1.58..1.60 deck lane (their 0.027 rake was
      // shallower than the deck's 0.035); same rake as the deck now, bottoms 2 mm into it.
      P.add('hullDetail', box(side < 0 ? 0.08 : 0.14, 0.045, 1.54),
        sx(side < 0 ? 1.62 : 1.65), 1.322, 0, 0.035, 0, 0);
    }
    P.hullG.userData.challenger2FenderReceipt = {
      rails: 2,
      carrierPitchRad: 0.027,
      maximumRailGapM: 0,
      legacyHydrogasGapAssembliesRemoved: true,
    };
    // Continuous ring landing beneath the articulated assembly. This is the
    // actual load surface (centered on armorChallenger2.turretPivot.z), not a
    // second turret silhouette; it closes the former visual/physical seam.
    // (release 240: 1 cm lower, under the turret's front underside, 1.694 m after the family scale, which grazed its corners)
    P.add('hull', box(2.75, 0.035, 1.00), 0, 1.515, 1.00);
    for (const side of [-1, 1]) P.add('hull', box(0.06, 0.12, 0.12), side * 0.99, 0.435, 0);   // from the 0.96 belly side out
    // (release 240: on the enhanced package's profile carrier (CR2E_SKIRT) the lug stands where it seated on the old
    // box, its foot 5.5 mm into the carrier's 1.36 top; snapping, it caught only the plate's inner edge, 1.6 cm further
    // in and higher, and the gun's 25 mm keep at its -6.8 deg stop over the right rear quarter fell to 21 mm)
    if (variant === 'challenger2e' || variant === 'ua_challenger2') P.add('hull', box(0.04, 0.04, 0.12), 1.739, 1.3745, 0);
    else P.snapGroup('cr2-fender-lug', () => P.add('hull', box(0.04, 0.04, 0.12), 1.72, 1.42, 0), { reachM: 0.06 });

    // Glacis/deck furniture and the characteristic CR2 engine field. All are
    // seated on the measured profile and remain inside its silhouette except
    // for the source-visible fittings.
    P.add('hullDark', box(1.95, 0.022, 1.20), 0, 1.550, -3.05);
  };
  buildChallenger2HullStage2();
  yield 'buildChallenger2HullStage2';
  const buildChallenger2HullStage3 = (): void => {
    for (const k of KIT.grilleIndices(P.q, 7, 3)) {
      P.add('hullDetail', box(1.82, 0.022, 0.055), 0, 1.567, -3.50 + k * 0.15);
    }
    // Two-bay radiator field, inset below the existing 1.602 louvre crest.
    for (const side of [-1, 1]) {
      P.add('hullDark', box(0.82, 0.012, 1.02), side * 0.50, 1.555, -3.05);
      for (const dx of [-0.34, 0, 0.34]) P.add('hullDetail', box(0.018, 0.010, 0.96),
        side * 0.50 + dx, 1.564, -3.05);
      for (const k of KIT.grilleIndices(P.q, 8, 4)) {
        P.add('hullDark', box(0.74, 0.010, 0.020), side * 0.50, 1.565, -3.48 + k * 0.125);
      }
    }
    P.add('hull', box(0.70, 0.055, 0.58), 0, 1.525, 0.65);                       // driver hood seated on the physical foredeck
    P.add('hullDark', box(0.54, 0.018, 0.42), 0, 1.557, 0.65);
    periscope(P, 'hullDetail', 0, 1.54, 0.93);
    for (const side of [-1, 1]) {
      P.add('hullDark', box(0.18, 0.10, 0.10), side * 1.20, 1.24, 3.45);
      P.add('hullGlass', box(0.10, 0.07, 0.015), side * 1.20, 1.25, 3.505);
      KIT.headlight(P, side * 1.18, 1.245, 3.525, -0.12, 0.060);
      KIT.headlight(P, side * 0.99, 1.235, 3.525, -0.12, 0.052);
      // Twin lamp brush guard: open rails and uprights, not another solid box.
      for (const y of [1.17, 1.31]) P.add('hullDark', box(0.38, 0.022, 0.018),
        side * 1.085, y, 3.535);
      for (const dx of [-0.18, 0, 0.18]) P.add('hullDark', box(0.022, 0.16, 0.018),
        side * 1.085 + side * dx, 1.24, 3.535);
      P.add('hullDark', box(0.34, 0.025, 0.018), side * 1.085, 1.24, 3.542,
        0, 0, side * 0.25);
      towHook2(P, side * 0.78, 0.84, 3.79);
      liftEye(P, 'hullDetail', side * 1.46, 1.435, -3.20);   // 2026-10-19 (owner float sweep): 42 mm over the deck; now seated
      P.add('hullDark', box(0.28, 0.32, 0.035), side * 1.03, 1.25, -4.045);       // twin rear grille bays
    }
    for (let k = 0; k < 5; k++) P.add('hullDetail', box(0.72, 0.035, 0.030), 0, 1.19 + k * 0.075, -3.55);
    P.add('hullDetail', box(0.30, 0.17, 0.035), 0, 1.45, -3.57);
    // Published hull datum carriers. The old .30 m bow boxes were tall enough
    // to become a second glacis in side projection; the repaired source's
    // terminal shoulder is the narrow 1.08..1.17 m course below.
    for (const side of [-1, 1]) {
      P.add('hull', box(0.16, 0.09, 0.05), side * 1.05, 1.125, 4.08);
      P.add('hull', slab(
        [side * 0.97, 1.18, -4.00], [side * 1.13, 1.18, -4.00],
        [side * 1.13, 1.30, -4.08], [side * 0.97, 1.30, -4.08],
        [side * 0.97, 1.48, -4.00], [side * 1.13, 1.48, -4.00],
        [side * 1.13, 1.36, -4.08], [side * 0.97, 1.36, -4.08]));
    }
    // The source carries a narrow continuous rear-shoulder hardpoint between
    // its -3.66 centre stern and -4.06 outboard service face. Leaving only the
    // perimeter frames enclosed two 4x4 sky wells in the 6 cm plan census.
    // Keep this bridge on the measured x=+-1.12 boss lane; a broad shoulder
    // fill over-painted the surrounding recess and was rejected by the gate.
    for (const side of [-1, 1]) {
      P.add('hull', box(0.16, 0.20, 0.16), side * 1.12, 1.25, -3.94);
      P.add('hull', box(0.16, 0.20, 0.40), side * 1.12, 1.25, -3.69);
      P.add('hull', box(0.16, 0.20, 0.16), side * 1.12, 1.25, -3.40);
    }
    // Surface-authored bow grammar: recessed centre plate, separate toe
    // ramps and fittings all remain behind the existing z=3.80 centre nose.
    P.add('hullDark', box(1.44, 0.15, 0.018), 0, 1.115, 3.770, -0.08, 0, 0);
    P.add('hull', box(1.02, 0.09, 0.020), 0, 1.125, 3.780, -0.08, 0, 0);
    P.add('hullDetail', box(0.30, 0.045, 0.020), 0, 1.105, 3.785);
    P.add('hullDetail', cylZ(0.095, 0.014, P.q ? 18 : 12), 0, 1.115, 3.792);
    P.add('hullDark', torus(0.095, 0.012, P.q ? 18 : 12), 0, 1.115, 3.798, Math.PI / 2, 0, 0);
    P.add('hullDark', box(0.44, 0.018, 0.016), -0.34, 1.13, 3.792, 0, 0, -0.28);
    P.add('hullDark', box(0.44, 0.018, 0.016), 0.34, 1.13, 3.792, 0, 0, 0.28);
    for (const side of [-1, 1]) {
      P.add('hullDark', box(0.20, 0.065, 0.018), side * 1.06, 1.155, 3.74, -0.10, 0, 0);
      P.add('hullGlass', box(0.075, 0.045, 0.016), side * 1.10, 1.16, 3.756);   // 2026-10-19 (owner float sweep): the lens hung 23 mm behind its plate; on its face
      liftEye(P, 'hullDetail', side * 0.62, 1.13, 3.70);
    }
    // Closed V-course on the existing lower-bow plane.  It does not widen or
    // lengthen the certified silhouette; the shallow depth split supplies the
    // layered weld, access-cover and towing-eye read seen in the source.
    P.add('hullDark', slab(
      [-0.54, 0.52, 3.798], [0.54, 0.52, 3.798], [0.54, 0.52, 3.808], [-0.54, 0.52, 3.808],
      [-1.10, 1.16, 3.798], [1.10, 1.16, 3.798], [1.10, 1.16, 3.808], [-1.10, 1.16, 3.808]));
    P.add('hull', slab(
      [-0.45, 0.59, 3.807], [0.45, 0.59, 3.807], [0.45, 0.59, 3.814], [-0.45, 0.59, 3.814],
      [-0.98, 1.10, 3.807], [0.98, 1.10, 3.807], [0.98, 1.10, 3.814], [-0.98, 1.10, 3.814]));
  };
  buildChallenger2HullStage3();
  yield 'buildChallenger2HullStage3';
  const buildChallenger2HullStage4 = (): void => {
    for (const side of [-1, 1]) {
      P.add('hullDetail', box(0.82, 0.014, 0.010), side * 0.78, 0.84, 3.819,
        0, 0, side * 0.82);
      P.add('hullDetail', new THREE.RingGeometry(0.060, 0.082, P.q ? 18 : 12),
        side * 0.61, 0.75, 3.820);
    }
    P.add('hullDetail', box(1.88, 0.014, 0.010), 0, 1.12, 3.819);
    P.add('hullDark', new THREE.RingGeometry(0.080, 0.105, P.q ? 20 : 14), 0, 0.84, 3.821);
    // Lower-bow track/tool blocks and clevis pins break the broad clean plate
    // at the same certified 3.82 face; every piece remains within the closed
    // V-course and contributes real shadow/occlusion in close-front views.
    for (const x of [-0.66, -0.30, 0.30, 0.66]) {
      P.add('hullDark', box(0.24, 0.075, 0.014), x, 0.985, 3.817);
      P.add('hullDetail', box(0.18, 0.018, 0.016), x, 1.015, 3.820);
    }
    for (const side of [-1, 1]) {
      P.add('hullDark', cylX(0.035, 0.18, P.q ? 14 : 10), side * 0.61, 0.75, 3.820);
      P.add('hullDetail', box(0.16, 0.020, 0.018), side * 0.61, 0.68, 3.819);
      // Registered lower-nose hard points: a recessed carrier, twin bosses
      // and a real cross pin surround each clevis.  They use the V-course's
      // existing 3.82 face and therefore deepen the read without moving it.
      P.add('hullDark', box(0.28, 0.15, 0.012), side * 0.61, 0.78, 3.810);
      for (const x of [side * 0.52, side * 0.70]) P.add('hullDetail', cylZ(0.032, 0.014, 10),
        x, 0.82, 3.818);
      P.add('hullDetail', box(0.25, 0.024, 0.018), side * 0.61, 0.89, 3.819);
      P.add('hullDark', torus(0.090, 0.016, P.q ? 18 : 12),
        side * 0.61, 0.75, 3.820, Math.PI / 2, 0, 0);
      for (const x of [side * 0.51, side * 0.71]) P.add('hullDark', box(0.040, 0.17, 0.014),
        x, 0.77, 3.812);
    }
    for (const [x, y] of [[-0.84, 0.99], [-0.42, 0.93], [0, 0.90], [0.42, 0.93], [0.84, 0.99]]) {
      P.add('hullDark', box(0.25, 0.065, 0.012), x, y, 3.812);
      P.add('hullDetail', box(0.17, 0.018, 0.016), x, y + 0.035, 3.819);
    }
    // Registered V-course fasteners and the central recovery cover close the
    // remaining blank lower-nose read.  They are seated on the existing 3.82
    // plane and follow its rising rows rather than forming a decorative grid.
    for (const [x, y] of [
      [-0.91, 1.04], [-0.68, 0.87], [-0.36, 0.72], [-0.12, 0.62],
      [0.12, 0.62], [0.36, 0.72], [0.68, 0.87], [0.91, 1.04],
    ]) P.add('hullDetail', cylZ(0.028, 0.014, 12), x, y, 3.819);
    P.add('hullDark', box(0.32, 0.13, 0.012), 0, 0.78, 3.812);
    P.add('hullDetail', box(0.23, 0.024, 0.016), 0, 0.82, 3.819);
  };
  buildChallenger2HullStage4();
  yield 'buildChallenger2HullStage4';
  // Recessed stern service face.  Its z=-3.655 skin follows the certified
  // centre-tail plane; the layered panels and rack lattice therefore alter
  // shading and occlusion, never the plan silhouette.
  const buildChallenger2HullStage5 = (): void => {
    for (const side of [-1, 1]) {
      // x=.31..1.03 is the source's shoulder tail plane at z=-4.06; mounting
      // the panels on the old centre plane left them occluded in rear views.
      // True shoulder recess: four frame rails retain the exact published
      // rectangle while the inner face steps 22 mm forward into the hull.
      // The existing grille blades and round service module then occupy
      // distinct depth planes instead of being painted over one flat box.
      const buildChallenger2HullCourse2 = (): void => {
        for (const y of [1.1025, 1.3475]) P.add('hullDark', box(0.72, 0.025, 0.014),
          side * 0.67, y, -4.070);
        for (const x of [0.3225, 1.0175]) P.add('hullDark', box(0.025, 0.27, 0.014),
          side * x, 1.225, -4.070);
        P.add('hullDark', box(0.66, 0.21, 0.014), side * 0.67, 1.225, -3.998);
        const grilleRows = [
          [-0.078, 0.56, -0.018], [-0.042, 0.47, 0.030], [-0.008, 0.59, -0.012],
          [0.031, 0.42, 0.055], [0.069, 0.53, -0.030],
        ];
        for (const [dy, w, dx] of grilleRows) P.add('hullDetail', box(w, 0.012, 0.010),
          side * 0.67 + side * dx, 1.225 + dy, -4.019);
        for (const hx of [-0.31, 0.31]) P.add('hullDetail', box(0.018, 0.24, 0.010),
          side * 0.67 + hx, 1.225, -4.020);
        // Proud cage stays inside the existing .72x.27 shoulder rectangle and
        // in front of its deep grille, yielding real three-plane rack relief.
        for (const y of [1.13, 1.225, 1.32]) P.add('hullDetail', box(0.58, 0.016, 0.012),
          side * 0.67, y, -4.074);
        for (const x of [0.42, 0.67, 0.92]) P.add('hullDetail', box(0.016, 0.21, 0.012),
          side * x, 1.225, -4.074);
        P.add('hullDark', box(0.52, 0.018, 0.012), side * 0.67, 1.225, -4.076,
          0, 0, side * 0.30);
        // Irregular solid service boxes occupy the cage rather than floating
        // outside it.  Unequal width/depth and off-axis cover plates reproduce
        // the source shoulder density while retaining the exact frame outline.
        P.add('hull', box(0.20, 0.15, 0.040), side * 0.46, 1.22, -4.075);
        P.add('hullDark', box(0.14, 0.09, 0.012), side * 0.46, 1.22, -4.084);
        P.add('hull', box(0.16, 0.11, 0.032), side * 0.70, 1.27, -4.076,
          0, 0, side * 0.08);
        P.add('hullDark', box(0.10, 0.045, 0.012), side * 0.70, 1.27, -4.083,
          0, 0, side * 0.08);
        for (const [x, y] of [[0.39, 1.17], [0.52, 1.27], [0.73, 1.31]])
          P.add('hullDetail', cylZ(0.012, 0.012, 8), side * x, y, -4.084);
        P.add('hullDark', box(0.46, 0.012, 0.010), side * 0.67, 1.225, -4.080,
          0, 0, side * 0.45);
        P.add('hullDark', new THREE.RingGeometry(0.082, 0.145, P.q ? 24 : 16),
          side * 0.95, 1.24, -4.080);
        P.add('hullDetail', torus(0.123, 0.010, P.q ? 20 : 14), side * 0.95, 1.24, -4.083, Math.PI / 2, 0, 0);
        P.add('hullDark', cylZ(0.072, 0.012, P.q ? 18 : 12), side * 0.95, 1.24, -4.010);
        P.add('hullDetail', box(0.29, 0.020, 0.012), side * 0.95, 1.18, -4.084);
        for (const y of [1.08, 1.43]) P.add('hullDetail', box(0.60, 0.018, 0.012),
          side * 0.78, y, -4.081);
        for (const x of [0.50, 1.06]) P.add('hullDetail', box(0.018, 0.36, 0.012),
          side * x, 1.255, -4.081);
      };
      buildChallenger2HullCourse2();
    }
  };
  buildChallenger2HullStage5();
  yield 'buildChallenger2HullStage5';
  const buildChallenger2HullStage6 = (): void => {
    P.add('hullDetail', box(1.48, 0.020, 0.012), 0, 1.49, -3.665);
    P.add('hullDetail', box(1.48, 0.020, 0.012), 0, 1.21, -3.665);
    for (const index of KIT.grilleIndices(P.q, 9, 4)) {
      const k = index - 4;
      P.add('hullDetail', box(0.014, 0.25, 0.012), k * 0.16, 1.35, -3.668);
    }
    for (const side of [-1, 1]) {
      P.add('hullGlass', box(0.10, 0.065, 0.014), side * 1.05, 1.34, -4.083);
      P.add('hullDetail', torus(0.048, 0.010, 12), side * 0.94, 1.25, -4.082, Math.PI / 2, 0, 0);
    }
    // Three horizontal service drums sit under the already-published tail
    // deck crest; they supply the large round rear-quarter read in the print.
    for (const x of [-0.58, 0, 0.58]) {
      P.add('hullDark', cylX(0.075, 0.34, P.q ? 18 : 12), x, 1.43, -3.54);
      P.add('hullDetail', torus(0.061, 0.008, 12), x + 0.175, 1.43, -3.54, 0, 0, Math.PI / 2);
    }
    // Low rear-face architecture only: paired access courses and the tow
    // beam remain below the ring mask and behind the published tail planes.
    for (const side of [-1, 1]) {
      P.add('hullDark', box(0.70, 0.12, 0.010), side * 0.66, 1.075, -4.073);
      P.add('hull', box(0.62, 0.070, 0.008), side * 0.66, 1.075, -4.079);
      for (const x of [0.48, 0.66, 0.84]) P.add('hullDark', cylZ(0.014, 0.008, 8),
        side * x, 1.075, -4.085);
    }
    P.add('hullDark', box(1.36, 0.065, 0.015), 0, 1.055, -3.660);
    P.add('hullDetail', box(1.12, 0.028, 0.018), 0, 1.095, -3.670);
  };
  buildChallenger2HullStage6();
  yield 'buildChallenger2HullStage6';
  // Lower stern service architecture: two recessed access/grille bays,
  // exhaust/service ports and the low towing beam occupy the broad blank
  // plate visible in the previous rear board.  All sit on the certified
  // -3.66 centre plane, inside the shoulder-tail length anchors.
  const buildChallenger2HullStage7 = (): void => {
    for (const side of [-1, 1]) {
      P.add('hullDark', box(0.82, 0.42, 0.014), side * 0.48, 1.30, -3.670);
      P.add('hull', box(0.75, 0.35, 0.010), side * 0.48, 1.30, -3.679);
      for (const index of KIT.grilleIndices(P.q, 5, 3)) {
        const k = index - 2;
        P.add('hullDark', box(0.68, 0.016, 0.010), side * 0.48, 1.30 + k * 0.060, -3.687);
      }
      P.add('hullDark', cylZ(0.145, 0.018, P.q ? 22 : 14), side * 0.30, 1.28, -3.694);
      P.add('hullDetail', torus(0.123, 0.010, P.q ? 20 : 14), side * 0.30, 1.28, -3.704, Math.PI / 2, 0, 0);
      P.add('hullDark', cylZ(0.060, 0.012, P.q ? 18 : 12), side * 0.30, 1.28, -3.710);
      P.add('hullDetail', torus(0.073, 0.008, P.q ? 16 : 10),
        side * 0.30, 1.28, -3.714, Math.PI / 2, 0, 0);
      if (P.q) for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3;
        P.add('hullDetail', cylZ(0.010, 0.010, 8),
          side * 0.30 + Math.sin(a) * 0.095, 1.28 + Math.cos(a) * 0.095, -3.718);
      }
    }
    P.add('hullDark', box(1.42, 0.085, 0.020), 0, 1.10, -3.680);
    P.add('hullDetail', box(1.18, 0.035, 0.024), 0, 1.14, -3.692);
    for (const y of [1.05, 1.48]) P.add('hullDetail', box(1.30, 0.020, 0.014),
      0, y, -3.716);
  };
  buildChallenger2HullStage7();
  yield 'buildChallenger2HullStage7';
  const buildChallenger2HullStage8 = (): void => {
    for (const x of [-0.62, 0, 0.62]) P.add('hullDetail', box(0.020, 0.44, 0.014),
      x, 1.265, -3.716);
    for (const side of [-1, 1]) P.add('hullDetail', torus(0.080, 0.014, 14),
      side * 0.62, 1.08, -3.705, Math.PI / 2, 0, 0);
    // Three genuinely recessed service wells sit behind the rack plane.  The
    // unequal boxes and grille blades terminate at z=-3.72, already occupied
    // by the certified centre-tail hardware, so they create parallax and
    // shadow without bridging the source's stepped stern silhouette.
    for (const [x, w, y, h] of [
      [-0.48, 0.34, 1.31, 0.26], [-0.08, 0.27, 1.27, 0.31], [0.31, 0.38, 1.33, 0.23],
    ]) {
      P.add('hullDark', box(w, h, 0.028), x, y, -3.704);
      P.add('hull', box(w - 0.055, h - 0.055, 0.014), x, y, -3.721);
      for (const index of KIT.grilleIndices(P.q, 5, 3)) {
        const k = index - 2;
        P.add('hullDark', box(w - 0.09, 0.012, 0.010),
          x, y + k * (h - 0.08) / 5, -3.730);
      }
      P.add('hullDetail', cylZ(0.022, 0.014, 10), x + w * 0.30, y, -3.733);
    }
    P.add('hullDetail', box(0.52, 0.024, 0.020), 0.02, 1.45, -3.726, 0, 0, -0.10);
    for (const x of [-0.18, 0.06, 0.28]) P.add('hullDark', box(0.024, 0.16, 0.018),
      x, 1.40, -3.732, 0, 0, x * 0.25);
    // Rear recovery course: cross beam, hangers and the characteristic sagged
    // tow line all sit on the existing -3.705 service plane.  They create
    // physical occlusion and shadow in the dead-rear view without lengthening
    // the centre tail or acting as a mask-only carrier.
    P.add('hullDark', box(1.56, 0.105, 0.032), 0, 1.090, -3.700);
    P.add('hull', box(1.40, 0.065, 0.026), 0, 1.092, -3.718);
    P.add('hullDetail', box(1.20, 0.018, 0.020), 0, 1.118, -3.734);
    for (const side of [-1, 1]) {
      P.add('hull', box(0.080, 0.30, 0.032), side * 0.72, 1.17, -3.708,
        0, 0, side * 0.18);
      P.add('hullDark', box(0.48, 0.050, 0.024), side * 0.40, 1.10, -3.724,
        0, 0, side * 0.33);
      // Solid U-clevis and pin on the layered recovery beam.
      for (const dx of [-0.065, 0.065]) P.add('hullDetail', box(0.035, 0.15, 0.024),
        side * 0.43 + dx, 1.10, -3.737);
      P.add('hullDetail', cylX(0.026, 0.16, P.q ? 14 : 10),
        side * 0.43, 1.04, -3.738);
    }
    KIT.towCable(P, [
      [-0.72, 1.20, -3.711], [-0.42, 1.10, -3.711], [0, 1.06, -3.711],
      [0.42, 1.10, -3.711], [0.72, 1.20, -3.711],
    ], 0.018);
  };
  buildChallenger2HullStage8();
  yield 'buildChallenger2HullStage8';
  const recoveryHighlightCurve = new THREE.CatmullRomCurve3([
    [-0.72, 1.20, -3.714], [-0.42, 1.10, -3.714], [0, 1.06, -3.714],
    [0.42, 1.10, -3.714], [0.72, 1.20, -3.714],
  ].map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const buildChallenger2TurretStage1 = (): void => {
    P.add('hull', new THREE.TubeGeometry(recoveryHighlightCurve, P.q ? 20 : 10, 0.006, 6, false));
    for (const side of [-1, 1]) {
      P.add('hullDetail', torus(0.055, 0.010, P.q ? 16 : 10),
        side * 0.73, 1.20, -3.718, Math.PI / 2, 0, 0);
      P.add('hullDark', cylZ(0.026, 0.024, P.q ? 12 : 8),
        side * 0.73, 1.20, -3.720);
      P.add('hullDetail', torus(0.070, 0.013, P.q ? 18 : 12),
        side * 0.76, 1.075, -4.082, Math.PI / 2, 0, 0);
      P.add('hullDark', cylZ(0.032, 0.020, P.q ? 14 : 10),
        side * 0.76, 1.075, -4.084);
    }
    KIT.towCable(P, [[-1.32, 1.43, 2.55], [-0.45, 1.49, 1.90], [0.55, 1.49, 2.25], [1.30, 1.40, 3.20]]);

    // Measured primary courses from the repaired reference component census.
    // The old single loft joined the ring underside straight to one continuous
    // roof and produced the critic's tall mound.  The real assembly is a LOW
    // swept core (full-width side wall), independent left/right Dorchester
    // cheek wedges, a thin central roof, asymmetric crew-roof plates and two
    // distinct bustle shoulders.
    // The 54-triangle source component is one low ruled shell. Its lower and
    // upper widths are different: authoring them as two same-footprint prisms
    // created the critic's projecting perimeter rails. This closed loft is the
    // low shell only; roof plates, asymmetric shoulders and bustle ears remain
    // independent measured components below.
    // The source's front lower and upper courses are longitudinally OFFSET:
    // the lower nose runs (.49,1.91)->(1.46,1.31), while the roof arris runs
    // (.49,1.36)->(1.37,.82).  A conventional same-station loft necessarily
    // smears those two lines into the tall vertical wall seen in fix22.  This
    // measured wedge keeps each print plane sovereign, then divides the aft
    // field into outer/centre facets before joining the ruled shell at z=.55.
    P.add('turret', slab(
      [-0.488, -0.03, 1.907], [0.488, -0.03, 1.907], [1.463, -0.03, 1.307], [-1.463, -0.03, 1.307],
      [-0.488, 0.345, 1.359], [0.488, 0.345, 1.359], [1.365, 0.345, 0.818], [-1.365, 0.345, 0.818]));
    P.add('turret', slab(
      [-1.463, -0.03, 1.307], [-0.488, -0.03, 1.307], [-0.488, -0.03, 0.55], [-1.463, -0.03, 0.55],
      [-1.365, 0.345, 0.818], [-0.488, 0.345, 0.818], [-0.49, 0.43, 0.55], [-1.20, 0.42, 0.55]));
    P.add('turret', slab(
      [-0.488, -0.03, 1.307], [0.488, -0.03, 1.307], [0.488, -0.03, 0.55], [-0.488, -0.03, 0.55],
      [-0.488, 0.345, 0.818], [0.488, 0.345, 0.818], [0.49, 0.43, 0.55], [-0.49, 0.43, 0.55]));
    P.add('turret', slab(
      [0.488, -0.03, 1.307], [1.463, -0.03, 1.307], [1.463, -0.03, 0.55], [0.488, -0.03, 0.55],
      [0.488, 0.345, 0.818], [1.365, 0.345, 0.818], [1.20, 0.42, 0.55], [0.49, 0.43, 0.55]));
    cr2FacetedShell(P, [
      { z: 0.55, w: 1.46, tw: 1.20, inner: 0.49, bot: -0.03, outer: 0.34, center: 0.43 },
      { z: -0.10, w: 1.455, tw: 1.12, inner: 0.49, bot: -0.01, outer: 0.35, center: 0.51 },
      { z: -1.05, w: 1.24, tw: 1.08, inner: 0.49, bot: 0.00, outer: 0.40, center: 0.44 },
      { z: -2.46, w: 1.18, tw: 1.12, inner: 0.49, bot: 0.05, outer: 0.39, center: 0.36 },
      { z: -2.99, w: 1.12, tw: 1.10, inner: 0.49, bot: 0.06, outer: 0.34, center: 0.30 },
    ]);
    // Recessed construction joins expose the three independently measured
    // roof facets.  Every strip stays below the surrounding roof envelope,
    // so it clarifies the low centre channel without becoming a mask carrier.
    for (const side of [-1, 1]) for (const [z, y, d] of [
      [1.50, 0.315, 0.28], [0.96, 0.380, 0.72], [0.23, 0.455, 0.62],
      [-0.58, 0.425, 0.78], [-1.76, 0.355, 1.32], [-2.72, 0.295, 0.48],
    ]) P.add('turretDark', box(0.014, 0.008, d), side * 0.49, y, z);
    for (const [z, y] of [[1.35, 0.330], [0.55, 0.410], [-0.10, 0.495], [-1.05, 0.425], [-2.46, 0.345]])
      P.add('turretDark', box(0.92, 0.008, 0.014), 0, y, z);
    // A recessed underside course makes the lower wall/roof overhang a real
    // assembly in side light.  It is wholly inside the measured lower shell,
    // and breaks at the cheek and bustle joins instead of drawing one stripe.
    for (const side of [-1, 1]) for (const [z, d] of [[0.55, 1.60], [-1.18, 1.66], [-2.52, 0.86]]) {
      P.add('turretDark', box(0.30, 0.030, d), side * 1.27, 0.012, z);
    }
  };
  buildChallenger2TurretStage1();
  yield 'buildChallenger2TurretStage1';
  const buildChallenger2TurretStage2 = (): void => {
    for (const side of [-1, 1]) for (const [z, y, h] of [
      [-1.24, 0.25, 0.32], [-2.02, 0.22, 0.26], [-2.48, 0.20, 0.22],
    ]) P.add('turretDark', box(0.028, h, 0.050), side * 1.39, y, z);

    // Source-connected crew roof plates are small and local to z=-1.31..-.64;
    // the previous three full-depth courses doubled the main shell roof and
    // created the critic's broad continuous mound.
    cr2Course(P, 'turret', [[-0.84, -0.64], [-0.20, -0.64], [-0.20, -1.31], [-0.84, -1.31]],
      [0.43, 0.43, 0.44, 0.44], [0.61, 0.61, 0.63, 0.63]);
    cr2Course(P, 'turret', [[0.386, -0.96], [0.85, -0.96], [0.85, -1.08], [0.386, -1.08]],
      [0.43, 0.39, 0.39, 0.43], [0.60, 0.60, 0.59, 0.59]);

    // Bustle shoulders step up from the low core; their unequal footprints
    // preserve the source's roof asymmetry and leave a real center channel.
    cr2Course(P, 'turret', [[-1.37, -1.25], [-0.415, -1.25], [-0.415, -3.01], [-0.96, -3.01], [-1.37, -2.48]],
      0.13, [0.52, 0.52, 0.35, 0.34, 0.40]);
    // The opposite source component is only an 11 mm boundary wall; retain
    // that true asymmetry instead of mirroring another solid bustle mound.
    cr2Course(P, 'turret', [[0.415, -1.25], [0.426, -1.25], [0.426, -3.01], [0.415, -3.01]],
      0.055, [0.52, 0.52, 0.35, 0.35]);
    // Aft-roof service grammar follows the two asymmetric bustle masses.  The
    // broad loader-side shoulder carries a recessed grille, offset rack and
    // round access well; the narrow opposite course gets only its measured
    // service cover.  All parts stay below the existing roof furniture datum.
    for (const [z, y] of [
      [-2.40, 0.408], [-2.22, 0.426], [-2.03, 0.445], [-1.83, 0.464], [-1.65, 0.481],
    ]) P.add('turretDetail',
      box(0.58 - Math.abs(z + 2.03) * 0.16, 0.010, 0.040), -0.87, y, z,
      0, -0.06, 0);
  };
  buildChallenger2TurretStage2();
  yield 'buildChallenger2TurretStage2';
  const bustleRoofStations = [
    [-2.40, 0.408], [-2.22, 0.426], [-2.03, 0.445], [-1.83, 0.464], [-1.65, 0.481],
  ];
  const buildChallenger2TurretStage3 = (): void => {
    for (let i = 0; i < bustleRoofStations.length - 1; i++) {
      const [z0, y0] = bustleRoofStations[i], [z1, y1] = bustleRoofStations[i + 1];
      for (const x of [-1.10, -0.87, -0.64]) P.add('turretDetail',
        box(0.020, 0.009, Math.abs(z1 - z0) - 0.025), x + (i % 2 ? 0.015 : 0),
        (y0 + y1) * 0.5 + 0.003, (z0 + z1) * 0.5, 0, 0.04, 0);
    }
    P.add('turretDark', cylY(0.125, 0.125, 0.018, P.q ? 20 : 14),
      -1.06, 0.365, -2.48);
    P.add('turretDetail', torus(0.105, 0.012, P.q ? 18 : 12),
      -1.06, 0.378, -2.48);
    P.add('turretDark', box(0.40, 0.010, 0.62), 0.66, 0.320, -2.10);
    P.add('turret', box(0.32, 0.010, 0.52), 0.66, 0.328, -2.10);
    for (const z of [-2.32, -1.88]) P.add('turretDetail', box(0.28, 0.018, 0.035),
      0.66, 0.338, z);
    P.add('turretDark', box(0.14, 0.014, 0.20), 0.52, 0.340, -2.36, 0, 0.12, 0);
    P.add('turret', box(0.11, 0.018, 0.15), 0.52, 0.350, -2.36, 0, 0.12, 0);
    for (const [x, z] of [[0.55, -1.82], [0.78, -2.18], [0.60, -2.40]])
      P.add('turretDetail', cylY(0.018, 0.018, 0.016, 10), x, 0.354, z);
    P.add('turretDark', box(0.50, 0.20, 0.05), 0, 0.17, 1.98);
  };
  buildChallenger2TurretStage3();                  // recessed L30 slot
  yield 'buildChallenger2TurretStage3';
  // Layered front cheek plates: dark gasket, inset armor face and diagonal
  // weld courses.  Their frame is derived from the sovereign cheek vertices
  // above instead of combining an approximate pitch and yaw.  That two-angle
  // shortcut twisted the broad panels through the casting; flipping its pitch
  // only made them stand proud in the opposite direction.  The measured frame
  // keeps both in-plane axes tangent to the Dorchester face and gives every
  // layer an explicit outward clearance.
  const cheekRise = new THREE.Vector3(0, 0.375, -0.548);
  const cheekPanelReceipt: Array<{
    side: number;
    normal: number[];
    rotation: number[];
    gasketCenter: number[];
    faceCenter: number[];
    gasketInnerClearanceM: number;
    gasketOuterClearanceM: number;
    faceInnerClearanceM: number;
    faceOuterClearanceM: number;
    weldInnerClearanceM: number;
  }> = [];
  const sideCassetteReceipt: Array<{
    side: number;
    innerCourseX: number;
    serviceBodyX: number;
    bodyJoinOverlapM: number;
    outerLipX: number;
    exteriorSilhouetteDeltaM: number;
  }> = [];
  const buildChallenger2TurretStage4 = (): void => {
    for (const side of [-1, 1]) {
      // Lower cheek runs 0.975 m outboard while setting back 0.600 m.  Use it
      // as the horizontal tangent, then orthogonalize the vertical tangent in
      // the same plane.  The resulting +Z basis vector is the outward normal.
      const cheekAcross = new THREE.Vector3(0.975, 0, -side * 0.600).normalize();
      const cheekNormal = new THREE.Vector3().crossVectors(cheekAcross, cheekRise).normalize();
      const cheekUp = new THREE.Vector3().crossVectors(cheekNormal, cheekAcross).normalize();
      const cheekFrame = new THREE.Matrix4().makeBasis(cheekAcross, cheekUp, cheekNormal);
      const cheekRotation = new THREE.Euler().setFromRotationMatrix(cheekFrame, 'XYZ');
      const cheekPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        cheekNormal, new THREE.Vector3(side * 0.488, -0.03, 1.907));
      const seat = (x: number, y: number, z: number, clearance: number): THREE.Vector3 => {
        const center = new THREE.Vector3(x, y, z);
        cheekPlane.projectPoint(center, center);
        return center.addScaledVector(cheekNormal, clearance);
      };

      if (isBaseChallenger2) {
        const gasketCenter = seat(side * 0.62, 0.18, 1.56, 0.020);
        const faceCenter = seat(side * 0.624, 0.18, 1.575, 0.043);
        const upperWeldCenter = seat(side * 0.624, 0.29, 1.43, 0.058);
        const lowerWeldCenter = seat(side * 0.624, 0.09, 1.72, 0.058);
        P.add('turretDark', box(0.72, 0.58, 0.030), ...gasketCenter,
          cheekRotation.x, cheekRotation.y, cheekRotation.z);
        P.add('turret', box(0.58, 0.45, 0.014), ...faceCenter,
          cheekRotation.x, cheekRotation.y, cheekRotation.z);
        P.add('turretDark', xform(box(0.49, 0.020, 0.014), 0, 0, 0, 0, 0, side * 0.28),
          ...upperWeldCenter, cheekRotation.x, cheekRotation.y, cheekRotation.z);
        P.add('turretDark', xform(box(0.43, 0.020, 0.014), 0, 0, 0, 0, 0, -side * 0.22),
          ...lowerWeldCenter, cheekRotation.x, cheekRotation.y, cheekRotation.z);
        P.add('turretDark', box(0.035, 0.28, 0.050), side * 1.34, 0.15, 1.12,
          0, side * 0.08, side * 0.10);
        cheekPanelReceipt.push({
          side,
          normal: cheekNormal.toArray(),
          rotation: [cheekRotation.x, cheekRotation.y, cheekRotation.z],
          gasketCenter: gasketCenter.toArray(),
          faceCenter: faceCenter.toArray(),
          gasketInnerClearanceM: 0.005,
          gasketOuterClearanceM: 0.035,
          faceInnerClearanceM: 0.036,
          faceOuterClearanceM: 0.050,
          weldInnerClearanceM: 0.051,
        });
      }
    }
    P.turretG.userData.challenger2CheekPanelReceipt = {
      cheekRiseM: 0.375,
      cheekSetbackM: 0.548,
      panels: cheekPanelReceipt,
    };
    P.add('turretDark', box(0.12, 0.20, 0.020), -0.27, 0.17, 1.945);
    P.add('turretDark', box(0.12, 0.20, 0.020), 0.27, 0.17, 1.945);
    // 2026-10-19 (owner float sweep): the bolt heads stood 6 mm outboard of the slot cheeks (the top row above them); set on them
    for (const x of [-0.32, 0.32]) for (const y of [0.10, 0.17, 0.24])
      P.add('turretDetail', cylZ(0.014, 0.014, 8), x, y, 1.958);
  };
  buildChallenger2TurretStage4();
  yield 'buildChallenger2TurretStage4';
  // The sovereign loft owns the silhouette; these shallow, inset courses
  // carry the layered Dorchester face grammar visible in the source.
  const buildChallenger2TurretStage5 = (): void => {
    for (const side of [-1, 1]) {
      const buildChallenger2TurretCourse1 = (): void => {
        const buildChallenger2TurretStage10 = (): void => {
          if (isBaseChallenger2) {
            P.add('turretDark', box(0.52, 0.12, 0.024), side * 0.72, 0.20, 1.675, 0, side * 0.08, 0);
            P.add('turretDetail', box(0.45, 0.025, 0.028), side * 0.72, 0.28, 1.682, 0, side * 0.08, 0);
            const sightWell = cylZ(0.115, 0.025, P.q ? 20 : 14);
            sightWell.scale(1.45, 0.72, 1);
            P.add('turretDark', sightWell, side * 0.91, 0.23, 1.700);
            const sightRim = torus(0.115, 0.014, P.q ? 20 : 14);
            sightRim.scale(1.45, 1, 0.72);
            P.add('turretDetail', sightRim, side * 0.91, 0.23, 1.715, Math.PI / 2, 0, 0);
            P.add('turretGlass', box(0.15, 0.055, 0.014), side * 0.91, 0.23, 1.712);   // 2026-10-19 (owner float sweep): in the rim (was proud of it)
          }
        };
        buildChallenger2TurretStage10();
        // Seven genuinely recessed bustle-side louvres.  No proud perimeter
        // frames: the source reads as one closed side course cut by apertures.
        const buildChallenger2TurretStage11 = (): void => {
          P.add('turretDark', box(0.010, 0.080, 0.82), side * 1.454, 0.17, -1.02);
        };
        buildChallenger2TurretStage11();
        const buildChallenger2TurretStage12 = (): void => {
          for (const k of KIT.grilleIndices(P.q, 7, 3)) {
            P.add('turretDetail', box(0.018, 0.070, 0.070),
              side * 1.459, 0.175, -1.38 + k * 0.12);
          }
        };
        buildChallenger2TurretStage12();
        // Forward Dorchester/smoke-bank shoulder.  Keep the commander-side
        // course; the loader-side copy was the broad block called out in the
        // markup, projecting through the otherwise continuous front casting.
        const cheekOuter = side < 0 ? 1.50 : 1.46;
        const cheekPlan: Vec2Tuple[] = [
          [side * 0.90, 1.05], [side * cheekOuter, 1.05],
          [side * cheekOuter, 1.38], [side * 0.35, 1.42],
        ];
        const buildChallenger2TurretStage13 = (): void => {
          if (side > 0) cr2Course(P, 'turret', cheekPlan, -0.03, [0.24, 0.00, 0.00, 0.24]);
        };
        buildChallenger2TurretStage13();
        // Outboard Dorchester cassette follows the shell face as one tapered,
        // closed solid.  Its upper course dies into the ruled roof instead of
        // carrying the former full-length cap/rail.
        const cassetteOuter = side < 0 ? 1.55 : 1.46;
        // The former cassette was only the 60 mm knife-edge lip at x=1.40..
        // outer. Its inner wall was therefore visible through a 25-32 cm void
        // between the applique and the sovereign shell/service body. Continue
        // the same closed armor course inward to x=1.08, where it overlaps the
        // ruled turret side without altering the certified exterior silhouette.
        const cassetteInner = 1.08;
        const cassetteFront = side < 0 ? -0.64 : -0.67;
        const cassetteRear = side < 0 ? -1.22 : -2.77;
        const buildChallenger2TurretStage14 = (): void => {
          cr2Course(P, 'turret', [
            [side * cassetteInner, cassetteFront + 0.10], [side * cassetteOuter, cassetteFront],
            [side * cassetteOuter, cassetteRear],
            [side * cassetteInner, cassetteRear - 0.10],
          ], [0.12, 0.02, 0.05, 0.12], [0.35, 0.05, 0.08, 0.34]);
        };
        buildChallenger2TurretStage14();
        // Cassette service fields are separate recessed pannier faces, not
        // painted-on stripes.  Preserve the print's strong left/right
        // asymmetry: one short loader-side field, four commander-side bustle
        // fields.  All hardware stays inside the existing cassette course.
        const cassetteFields = side < 0 ? [-0.90] : [-0.88, -1.34, -1.80, -2.26];
        const faceX = side * 1.153;
        const buildChallenger2ReceiptStage1 = (): void => {
          sideCassetteReceipt.push({
            side,
            innerCourseX: cassetteInner,
            serviceBodyX: Math.abs(faceX),
            bodyJoinOverlapM: Math.abs(faceX) - cassetteInner,
            outerLipX: cassetteOuter,
            exteriorSilhouetteDeltaM: 0,
          });
        };
        buildChallenger2ReceiptStage1();
        const buildChallenger2TurretStage15 = (): void => {
          for (const z of cassetteFields) {
            // The cassette's knife-edge outer lip is only 5-8 cm tall.  Its real
            // access fields mount on the sloped 1.15 m body plane, not outside the
            // 1.55 m lip (that first seat crossed a plan pixel-width guard).
            P.add('turretDark', box(0.014, 0.22, 0.34), faceX, 0.22, z);
            P.add('turretDetail', box(0.009, 0.018, 0.30), faceX + side * 0.009, 0.32, z);
            P.add('turretDetail', box(0.009, 0.018, 0.30), faceX + side * 0.009, 0.12, z);
            for (const dz of [-0.13, 0.13]) P.add('turretDetail', box(0.009, 0.18, 0.016),
              faceX + side * 0.009, 0.22, z + dz);
            P.add('turretDark', box(0.010, 0.045, 0.10), faceX + side * 0.014, 0.23, z);
          }
        };
        buildChallenger2TurretStage15();
        // Separate lower gasket, mid-body joins and upper Dorchester lip.  The
        // breaks follow the asymmetric cassette spans, so the side resolves as
        // cheek / armor cassette / bustle instead of one clean continuous wall.
        const seamX = side * 1.154;
        const seamRear = side < 0 ? -1.30 : -2.70;
        const seamDepth = Math.abs(seamRear + 0.62);
        const seamZ = (seamRear - 0.62) * 0.5;
        const buildChallenger2TurretStage16 = (): void => {
          P.add('turretDark', box(0.012, 0.024, seamDepth), seamX, 0.095, seamZ);
        };
        buildChallenger2TurretStage16();
        const buildChallenger2TurretStage17 = (): void => {
          P.add('turretDark', box(0.012, 0.018, seamDepth * 0.92), seamX + side * 0.004, 0.345, seamZ + 0.03);
        };
        buildChallenger2TurretStage17();
        const buildChallenger2TurretStage18 = (): void => {
          for (const z of side < 0 ? [-0.62, -1.28] : [-0.62, -1.08, -1.54, -2.00, -2.68]) {
            P.add('turretDetail', box(0.014, 0.24, 0.018), seamX + side * 0.006, 0.22, z);
          }
        };
        buildChallenger2TurretStage18();
        // Knife-edge outer cassette joins.  A 2 mm physical skin rides the
        // measured lip, making the real stepped modules visible in side light
        // without repeating the earlier wide-box plan violation at x=1.55.
        const outerJoinX = side * (cassetteOuter + 0.001);
        const outerDepth = Math.abs(cassetteRear - cassetteFront) - 0.10;
        // 2026-10-19 (owner float sweep): the course tapers to 30 mm at its outer edge, so the face skins below stood in
        // air (20-25 mm off anything); a thin outer wall behind them closes the cassette's outer face. It is cassette
        // detail, not a turret armor face: as one, the authored right-side number re-seated on its 26 cm band and
        // hung half off it (sealed see-through 2026-10-21)
        P.add('turretDetail', box(0.012, 0.26, Math.abs(cassetteRear - cassetteFront) + 0.10), side * (cassetteOuter - 0.005), 0.18,
          (cassetteRear + cassetteFront) * 0.5);
        const buildChallenger2TurretStage19 = (): void => {
          P.add('turretDark', box(0.002, 0.022, outerDepth), outerJoinX, 0.075,
            (cassetteRear + cassetteFront) * 0.5);
        };
        buildChallenger2TurretStage19();
        const buildChallenger2TurretStage20 = (): void => {
          P.add('turretDark', box(0.002, 0.018, outerDepth * 0.92), outerJoinX, 0.305,
            (cassetteRear + cassetteFront) * 0.5);
        };
        buildChallenger2TurretStage20();
        const buildChallenger2TurretStage21 = (): void => {
          for (const z of [cassetteFront + 0.04, cassetteRear - 0.04]) P.add('turretDark',
            box(0.002, 0.27, 0.032), outerJoinX, 0.18, z);
        };
        buildChallenger2TurretStage21();
        const buildChallenger2TurretStage22 = (): void => {
          for (const z of cassetteFields) {
            P.add('turretDark', box(0.002, 0.20, 0.30), outerJoinX, 0.20, z);
            P.add('turret', box(0.002, 0.145, 0.245), outerJoinX + side * 0.002, 0.20, z);
            for (const dy of [-0.085, 0.085]) P.add('turretDetail',
              box(0.002, 0.014, 0.26), outerJoinX + side * 0.001, 0.20 + dy, z);
            for (const dz of [-0.13, 0.13]) P.add('turretDetail',
              box(0.002, 0.16, 0.014), outerJoinX + side * 0.001, 0.20, z + dz);
          }
        };
        buildChallenger2TurretStage22();
        // Side-only bustle ear as a closed swept solid (source world box maps to
        // local x .86..1.30, z -3.02..-3.36), not a rectangular rail.
        const buildChallenger2TurretStage23 = (): void => {
          cr2Course(P, 'turret', [
            [side * 0.86, -3.00], [side * 1.24, -3.02],
            [side * 1.24, -3.26], [side * 0.86, -3.25],
          ], 0.08, [0.15, 0.15, 0.13, 0.14]);
        };
        buildChallenger2TurretStage23();
      };
      buildChallenger2TurretCourse1();
    }
  };
  buildChallenger2TurretStage5();
  yield 'buildChallenger2TurretStage5';
  const buildChallenger2TurretStage6 = (): void => {
    P.turretG.userData.challenger2SideCassetteReceipt = {
      maxVisibleInnerGapM: 0,
      panels: sideCassetteReceipt,
    };
    // Bustle face: recessed autoloader panels, rack lattice and two round
    // service modules on the existing -2.99 centre plane.  This replaces the
    // blank stern slab without lengthening the turret.
    P.add('turretDark', box(2.12, 0.30, 0.012), 0, 0.25, -2.984);
    for (const side of [-1, 1]) {
      P.add('turret', box(0.82, 0.20, 0.010), side * 0.53, 0.26, -2.992);
      for (let k = -2; k <= 2; k++) P.add('turretDark', box(0.72, 0.014, 0.010),
        side * 0.53, 0.26 + k * 0.035, -2.999);
      P.add('turretDark', cylZ(0.105, 0.018, P.q ? 18 : 12), side * 0.98, 0.31, -3.000);
      P.add('turretDetail', torus(0.092, 0.012, 14), side * 0.98, 0.31, -3.008, Math.PI / 2, 0, 0);
      const rearWell = cylZ(0.120, 0.016, P.q ? 18 : 12);
      rearWell.scale(1.45, 0.72, 1);
      P.add('turretDark', rearWell, side * 0.72, 0.23, -3.008);
      const rearRim = torus(0.120, 0.012, P.q ? 18 : 12);
      rearRim.scale(1.45, 1, 0.72);
      P.add('turretDetail', rearRim, side * 0.72, 0.23, -3.016, Math.PI / 2, 0, 0);
    }
    P.add('turretDark', box(0.24, 0.18, 0.014), 0, 0.26, -3.010);
    P.add('turretGlass', box(0.13, 0.08, 0.012), 0, 0.28, -3.018);
    P.add('turretDetail', box(2.18, 0.025, 0.012), 0, 0.38, -3.006);
    P.add('turretDetail', box(2.18, 0.025, 0.012), 0, 0.10, -3.006);
    for (const index of KIT.grilleIndices(P.q, 11, 5)) {
      const k = index - 5;
      P.add('turretDetail', box(0.018, 0.32, 0.010), k * 0.19, 0.27, -3.010);
    }
    // Full-width bustle basket sits aft of the armor face.  Dark mesh is
    // recessed beneath pale rails so the rear reads as an open rack, not a
    // second flat slab.
    // Open bustle cage: retain the exact 2.56x.34 terminal rectangle as four
    // frame rails, but recess two unequal mesh fields toward the armor face.
    // Replacing the monolithic dark backing is what creates real rear depth.
    for (const y of [0.09, 0.41]) P.add('turretDark', box(2.56, 0.024, 0.018),
      0, y, -3.000);
    for (const x of [-1.268, 1.268]) P.add('turretDark', box(0.024, 0.34, 0.014),
      x, 0.25, -3.000);
    P.add('turretDark', box(1.12, 0.27, 0.012), -0.61, 0.25, -2.995);
    P.add('turretDark', box(1.00, 0.23, 0.012), 0.67, 0.25, -2.993);
    P.add('turretDetail', box(0.024, 0.29, 0.018), 0.02, 0.25, -3.000);
    for (const [x, a] of [[-0.68, -0.52], [0.68, 0.52]]) P.add('turretDetail',
      box(0.030, 0.36, 0.018), x, 0.25, -3.000, 0, 0, a);
  };
  buildChallenger2TurretStage6();
  yield 'buildChallenger2TurretStage6';
  const bustleStrap = new THREE.CatmullRomCurve3([
    [-1.12, 0.36, -3.000], [-0.62, 0.23, -3.002], [0, 0.16, -3.003],
    [0.55, 0.24, -3.002], [1.10, 0.35, -3.000],
  ].map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const buildChallenger2TurretStage7 = (): void => {
    P.add('turretDark', new THREE.TubeGeometry(bustleStrap, P.q ? 20 : 10, 0.012, 6, false));
    for (const y of [0.09, 0.24, 0.40]) P.add('turretDetail', box(2.62, 0.024, 0.024), 0, y, -3.028);
    for (const index of KIT.grilleIndices(P.q, 13, 5)) {
      const k = index - 6;
      P.add('turretDetail', box(0.020, 0.34, 0.024), k * 0.20, 0.25, -3.028);
    }
    P.add('turretDetail', box(0.024, 0.24, 0.08), -1.30, 0.26, -3.00);
    P.add('turretDetail', box(0.024, 0.24, 0.08), 1.30, 0.26, -3.00);
    // Proud bustle service pods and louvred access faces.  The basket's dark
    // backing formerly occluded every recessed panel from the dead-rear
    // camera; these fittings mount on the basket face like the print and stay
    // well inside the existing -3.31 rack/rail plan envelope.
    for (const side of [-1, 1]) {
      P.add('turretDark', box(0.74, 0.22, 0.012), side * 0.49, 0.27, -3.038);
      for (const index of KIT.grilleIndices(P.q, 5, 3)) {
        const k = index - 2;
        P.add('turretDetail', box(0.64, 0.014, 0.008),
          side * 0.49, 0.27 + k * 0.036, -3.047);
      }
      P.add('turretDark', cylZ(0.145, 0.030, P.q ? 20 : 14), side * 0.98, 0.28, -3.044);
      P.add('turretDetail', torus(0.124, 0.012, P.q ? 18 : 12),
        side * 0.98, 0.28, -3.062, Math.PI / 2, 0, 0);
      P.add('turretDark', cylZ(0.070, 0.012, P.q ? 16 : 10), side * 0.98, 0.28, -3.064);
    }
  };
  buildChallenger2TurretStage7();
  yield 'buildChallenger2TurretStage7';
  const buildChallenger2TurretStage8 = (): void => {
    for (const side of [-1, 1]) {
      P.add('turretDetail', box(0.24, 0.045, 0.045), side * 0.98, 0.37, -3.31);
      P.add('turretDetail', box(0.20, 0.045, 0.045), side * 1.18, 0.37, -3.15);
      for (let k = 0; k < 3; k++) P.add('turretDetail', box(0.030, 0.14, 0.030), side * (0.88 + k * 0.14), 0.37, k < 2 ? -3.31 : -3.15);
      // 2026-10-19 (owner float sweep): the rear rail and its two posts stood 70-80 mm behind the stowage; a short
      // fore-aft rail now joins them to the seated -3.15 rail.
      P.add('turretDetail', box(0.030, 0.045, 0.19), side * 1.09, 0.37, -3.23);
    }
    stowage(P, 'turretCloth', rng, [[-1.00, 0.22, -3.08, 0.20, 0.12, 0.20], [1.00, 0.22, -3.08, 0.20, 0.12, 0.20]]);
    tarpRoll(P, 'turretCloth', 1.05, 0.23, -3.05, 0.25, 0.09, true);
    P.add('turretCloth', box(0.16, 0.35, 0.34), -1.05, 0.305, -3.04, 0, 0.15, 0);
    ammoCan(P, 'turretDark', 1.05, 0.32, -3.04, 0.22);
  };
  buildChallenger2TurretStage8();
  yield 'buildChallenger2TurretStage8';

  const roofEmbed = 0.010;
  const roofSeats: RoofSeatReceipt[] = [];
  const smokeMouths: SmokeMouthReceipt[] = [];
  const buildChallenger2TurretStage9 = function* (): TankProfileBuild {
    if (isBaseChallenger2) {
    // Roof hierarchy from connected components, following the Leclerc
    // method.  The source has ONE flattened loader lid at
    // x=-.819..-.233/z=-1.203..-.871 and a thin right-hand plate at
    // x=.386..848/z=-1.082..-.961.  Two generic circular cupolas were the
    // critic's regular twin-hatch read and are deliberately not retained.
    const buildChallenger2TurretCourse2 = (): void => {
      const loaderSeat = cylY(0.293, 0.293, 0.026, P.q ? 28 : 18);
      const buildChallenger2AssemblyStage4 = (): void => {
        loaderSeat.scale(1, 1, 0.567);
      };
      buildChallenger2AssemblyStage4();
      const buildChallenger2TurretStage24 = (): void => {
        P.add('turretDark', loaderSeat, -0.526, 0.658, -1.037);
      };
      buildChallenger2TurretStage24();
      const loaderLid = cylY(0.293, 0.293, 0.036, P.q ? 28 : 18);
      const buildChallenger2AssemblyStage5 = (): void => {
        loaderLid.scale(1, 1, 0.567);
      };
      buildChallenger2AssemblyStage5();
      const buildChallenger2TurretStage25 = (): void => {
        P.add('turret', loaderLid, -0.526, 0.683, -1.037);
      };
      buildChallenger2TurretStage25();
      const loaderWell = cylY(0.245, 0.245, 0.012, P.q ? 26 : 16);
      const buildChallenger2AssemblyStage6 = (): void => {
        loaderWell.scale(1, 1, 0.567);
      };
      buildChallenger2AssemblyStage6();
      const buildChallenger2TurretStage26 = (): void => {
        P.add('turretDark', loaderWell, -0.526, 0.669, -1.037);
      };
      buildChallenger2TurretStage26();
      const loaderRim = torus(0.265, 0.014, P.q ? 24 : 16);
      const buildChallenger2AssemblyStage7 = (): void => {
        loaderRim.scale(1, 1, 0.575);
      };
      buildChallenger2AssemblyStage7();
      const buildChallenger2TurretStage27 = (): void => {
        P.add('turretDark', loaderRim, -0.526, 0.704, -1.037);
      };
      buildChallenger2TurretStage27();
      const buildChallenger2TurretStage28 = (): void => {
        P.add('turretDark', box(0.643, 0.012, 0.673), -0.522, 0.635, -0.977);
      };
      buildChallenger2TurretStage28();
      const buildChallenger2TurretStage29 = (): void => {
        P.add('turretDark', box(0.38, 0.014, 0.035), -0.526, 0.712, -1.037);
      };
      buildChallenger2TurretStage29();
      const buildChallenger2TurretStage30 = (): void => {
        P.add('turret', box(0.065, 0.045, 0.11), -0.255, 0.698, -1.037);
      };
      buildChallenger2TurretStage30();
      const buildChallenger2TurretStage31 = (): void => {
        if (P.q) for (let k = 0; k < 6; k++) {
          const a = k * Math.PI / 3;
          const x = -0.526 + Math.sin(a) * 0.293;
          const z = -1.037 + Math.cos(a) * 0.166;
          P.add('turretDetail', box(0.060, 0.030, 0.065), x, 0.694, z, 0, a, 0);
          P.add('turretGlass', box(0.042, 0.018, 0.010),
            x + Math.sin(a) * 0.038, 0.700, z + Math.cos(a) * 0.024, 0, a, 0);
        }
      };
      buildChallenger2TurretStage31();
      const buildChallenger2TurretStage32 = (): void => {
        P.add('turretDetail', box(0.16, 0.035, 0.050), -0.526, 0.702, -1.20);
      };
      buildChallenger2TurretStage32();
      const buildChallenger2TurretStage33 = (): void => {
        for (const z of [-1.085, -0.995]) P.add('turretDark', cylZ(0.024, 0.090, P.q ? 14 : 10),
          -0.255, 0.700, z);
      };
      buildChallenger2TurretStage33();
      const buildChallenger2TurretStage34 = (): void => {
        P.add('turretDark', box(0.462, 0.012, 0.121), 0.617, 0.600, -1.021);
      };
      buildChallenger2TurretStage34();
      const buildChallenger2TurretStage35 = (): void => {
        P.add('turret', box(0.39, 0.016, 0.085), 0.617, 0.610, -1.021);
      };
      buildChallenger2TurretStage35();
      const buildChallenger2TurretStage36 = (): void => {
        for (const x of [0.42, 0.81]) P.add('turretDetail', box(0.045, 0.026, 0.035),
          x, 0.620, -1.021);
      };
      buildChallenger2TurretStage36();
      // Independent rear-left roof housing. Its old source-space y=.512 lower
      // face floated 134 mm above the live center roof. Pitch the complete
      // housing along that roof's longitudinal fall and embed its foot 10 mm.
      const rearHousingZ = -2.1435;
      const rearHousingHeight = 0.123;
      const rearHousingRoofSlope = (0.44 - 0.36) / (-1.05 - -2.46);
      const rearHousingCarrierY = 0.44 + rearHousingRoofSlope * (rearHousingZ - -1.05);
      const rearHousingPitch = -Math.atan(rearHousingRoofSlope);
      const rearHousingY = rearHousingCarrierY + rearHousingHeight * 0.5 - roofEmbed;
      const buildChallenger2TurretStage37 = (): void => {
        P.add('turretDark', box(0.186, rearHousingHeight, 0.073), -0.205, rearHousingY,
          rearHousingZ, rearHousingPitch, 0, 0);
      };
      buildChallenger2TurretStage37();
      const rearHousingGlassZ = -2.185;
      const buildChallenger2TurretStage38 = (): void => {
        P.add('turretGlass', box(0.12, 0.050, 0.010), -0.205,
          rearHousingY + 0.011 + rearHousingRoofSlope * (rearHousingGlassZ - rearHousingZ),
          rearHousingGlassZ, rearHousingPitch, 0, 0);
      };
      buildChallenger2TurretStage38();
      const buildChallenger2TurretStage39 = (): void => {
        P.add('turretDetail', box(0.15, 0.016, 0.055), -0.205,
          rearHousingY + 0.0535, rearHousingZ, rearHousingPitch, 0, 0);
      };
      buildChallenger2TurretStage39();
      const buildChallenger2AssemblyStage8 = (): void => {
        roofSeats.push({ label: 'rear-left-roof-housing', carrierY: rearHousingCarrierY,
          bottomY: rearHousingCarrierY - roofEmbed });
      };
      buildChallenger2AssemblyStage8();
      const buildChallenger2TurretStage40 = (): void => {
        // 2026-10-19 (owner float sweep): the right inner one stood off its neighbour's block, 0.27 m over the low roof;
        // it sits on that roof
        if (P.q) for (const [x, z, a, y = 0.704] of [
          [-0.77, -1.03, -Math.PI / 2], [-0.68, -1.20, -0.5], [-0.45, -1.25, 0], [-0.28, -1.12, 0.6],
          [0.71, -1.22, 0, 0.414], [0.83, -1.09, 0.6],
        ]) periscope(P, 'turretDetail', x, y, z, a);
      };
      buildChallenger2TurretStage40();
      // Exact low roof fittings recovered from the source component census
      // (world y=2.128..2.182 => local y=.578..632).  These eight unequal
      // footprints surround the loader station; authoring their real positions
      // avoids both the old empty roof and a decorative mirrored scatter.
      const buildChallenger2TurretStage41 = (): void => {
        for (const [x, z, w, d, a] of [
          [-0.416, -0.555, 0.11, 0.067, 0.10], [-0.526, -1.381, 0.12, 0.067, -0.08],
          [-0.224, -1.269, 0.13, 0.13, 0.28], [-0.116, -0.991, 0.067, 0.12, -0.22],
          [-0.216, -0.728, 0.12, 0.14, 0.18], [-0.828, -1.269, 0.13, 0.13, -0.30],
          [-0.921, -1.048, 0.09, 0.13, 0.15], [-0.895, -0.846, 0.09, 0.13, -0.18],
        ]) {
          // 2026-10-19 (owner float sweep): the roof falls under some of these (50 mm); each drops onto it
          P.snapGroup('cr2-roof-fitting', () => {
            P.add('turretDark', box(w, 0.022, d), x, 0.590, z, 0, a, 0);
            P.add('turretDetail', box(w * 0.62, 0.018, d * 0.55), x, 0.610, z, 0, a, 0);
          }, { reachM: 0.07 });
        }
      };
      buildChallenger2TurretStage41();
      // Measured right-roof brackets: a long flush service bridge at
      // x=.418..817/z=-.409..-.099 and the independent rear head at
      // x=.768..860/z=-1.065..-.740.
      // The bridge crosses the center/outer roof break, so match the ruled
      // facet's transverse fall instead of leaving its underside flat at y=.524.
      const rightBridgeX = 0.6175;
      const rightBridgeZ = -0.254;
      const rightBridgeHeight = 0.022;
      const rightBridgeOuterY = cr2At([[-0.10, 0.35], [-1.05, 0.40]], rightBridgeZ);
      const rightBridgeCenterY = cr2At([[-0.10, 0.51], [-1.05, 0.44]], rightBridgeZ);
      const rightBridgeOuterX = cr2At([[-0.10, 1.12], [-1.05, 1.08]], rightBridgeZ);
      const rightBridgeRoofSlope = (rightBridgeOuterY - rightBridgeCenterY)
        / (rightBridgeOuterX - 0.49);
      const rightBridgeCarrierY = rightBridgeCenterY
        + rightBridgeRoofSlope * (rightBridgeX - 0.49);
      const rightBridgeRoll = Math.atan(rightBridgeRoofSlope);
      const rightBridgeY = rightBridgeCarrierY + rightBridgeHeight * 0.5 - roofEmbed;
      const buildChallenger2TurretStage42 = (): void => {
        P.add('turretDark', box(0.399, rightBridgeHeight, 0.310), rightBridgeX,
          rightBridgeY, rightBridgeZ, 0, -0.08, rightBridgeRoll);
      };
      buildChallenger2TurretStage42();
      const buildChallenger2TurretStage43 = (): void => {
        P.add('turretDetail', box(0.31, 0.016, 0.035), rightBridgeX,
          rightBridgeY + 0.018, rightBridgeZ, 0, -0.08, rightBridgeRoll);
      };
      buildChallenger2TurretStage43();
      const buildChallenger2AssemblyStage9 = (): void => {
        roofSeats.push({ label: 'right-roof-service-bridge', carrierY: rightBridgeCarrierY,
          bottomY: rightBridgeCarrierY - roofEmbed });
      };
      buildChallenger2AssemblyStage9();
      const buildChallenger2TurretStage44 = (): void => {
        P.add('turretDark', box(0.092, 0.062, 0.325), 0.814, 0.568, -0.9025);
      };
      buildChallenger2TurretStage44();
      const buildChallenger2TurretStage45 = (): void => {
        P.add('turretGlass', box(0.060, 0.035, 0.060), 0.814, 0.575, -0.735);
      };
      buildChallenger2TurretStage45();
      // The reference's sustained side crest across the crew-roof band comes
      // from a narrow outboard episcope bank, not a globally raised hatch. Each
      // head now follows its local roof carrier instead of sharing two arbitrary
      // heights that left visible daylight below three of the five fittings.
      const buildChallenger2TurretStage46 = (): void => {
        for (const [z, carrierY] of [
          [-0.55, 0.3981], [-0.77, 0.6139], [-0.99, 0.7010],
          [-1.21, 0.6270], [-1.45, 0.5005],
        ]) {
          const height = 0.080;
          const y = carrierY + height * 0.5 - roofEmbed;
          P.add('turretDetail', box(0.220, height, 0.18), -0.80, y, z);
          P.add('turretGlass', box(0.170, 0.035, 0.012), -0.80, y + 0.005, z + 0.097);
          roofSeats.push({ label: `loader-episcope-${z}`, carrierY, bottomY: y - height * 0.5 });
        }
      };
      buildChallenger2TurretStage46();
      // Low roof seam and fitting grammar follows the independently bounded
      // plates.  It stays flush to their surfaces and adds no silhouette mass.
      const buildChallenger2TurretStage47 = (): void => {
        P.add('turretDark', box(0.014, 0.010, 1.20), -0.06, 0.535, -0.62);
      };
      buildChallenger2TurretStage47();
      const buildChallenger2TurretStage48 = (): void => {
        P.add('turretDark', box(0.92, 0.010, 0.014), -0.52, 0.590, -1.05);
      };
      buildChallenger2TurretStage48();
      const buildChallenger2TurretStage49 = (): void => {
        P.add('turretDark', box(0.72, 0.010, 0.014), 0.56, 0.535, -1.02);
      };
      buildChallenger2TurretStage49();
      // The forward-left lifting eye was nearly 20 cm above its local roof. Its
      // foot now overlaps that carrier by the same 10 mm seating allowance used
      // by the roof optics; the aft pair already sit on their local courses.
      const buildChallenger2TurretStage50 = (): void => {
        KIT.liftEye(P, 'turretDetail', -1.00, 0.3896, -0.18);
      };
      buildChallenger2TurretStage50();
      const buildChallenger2AssemblyStage10 = (): void => {
        roofSeats.push({ label: 'forward-left-lift-eye', carrierY: 0.3746, bottomY: 0.3646 });
      };
      buildChallenger2AssemblyStage10();
      const buildChallenger2TurretStage51 = (): void => {
        for (const [x, z] of [[-0.92, -1.18], [0.98, -0.92]])
          KIT.liftEye(P, 'turretDetail', x, 0.42, z);
      };
      buildChallenger2TurretStage51();
      const buildChallenger2TurretStage52 = (): void => {
        for (const [x, z, a] of [[-0.84, -0.92, -0.4], [-0.55, -0.94, 0.25], [0.72, -0.92, 0.35]])
          periscope(P, 'turretDetail', x, 0.62, z, a);
      };
      buildChallenger2TurretStage52();
      // GPS: the source census resolves a compact independent housing at world
      // x=.574..887 / y=2.042..2.243 / z=1.004..1.281.  The former 1.50 m
      // longitudinal box was a silhouette carrier and read as a fictional roof
      // ridge.  Preserve the measured four-sided hood, side wall and inset glass
      // as separate masses, following the same component discipline as Leclerc.
      const buildChallenger2TurretStage53 = (): void => {
        cr2Course(P, 'turret', [[0.56, -0.02], [0.90, -0.02], [0.90, 0.30], [0.56, 0.30]],
          [0.47, 0.38, 0.38, 0.44], [0.64, 0.68, 0.68, 0.64]);
      };
      buildChallenger2TurretStage53();
      const buildChallenger2TurretStage54 = (): void => {
        P.add('turretDark', box(0.24, 0.12, 0.020), 0.73, 0.585, 0.312);
      };
      buildChallenger2TurretStage54();
      const buildChallenger2TurretStage55 = (): void => {
        P.add('turretGlass', box(0.17, 0.070, 0.012), 0.73, 0.585, 0.325);
      };
      buildChallenger2TurretStage55();
      const buildChallenger2TurretStage56 = (): void => {
        P.add('turretDark', box(0.018, 0.14, 0.24), 0.908, 0.585, 0.14);
      };
      buildChallenger2TurretStage56();
      const buildChallenger2TurretStage57 = (): void => {
        P.add('turretDetail', box(0.26, 0.016, 0.026), 0.73, 0.688, 0.14);
      };
      buildChallenger2TurretStage57();
      // Weapon station from the connected-component census: the tall mechanics
      // occupy x=.70..87 and z=.14..28, and the barrel points OUTBOARD (+x).
      // The previous +z 1.54 m tube and half-metre roof crate were both axis and
      // scale errors.  Preserve the open fork, compact receiver, feed links and
      // short transverse GPMG as the source actually arranges them.
      const buildChallenger2AssemblyStage11 = (): void => {
        buildChallenger2WeaponTower(P);
      };
      buildChallenger2AssemblyStage11();
      const buildChallenger2TurretStage58 = (): void => {
        P.add('turret', box(0.08, 0.25, 0.22), 0.40, 0.225, 0.25);
      };
      buildChallenger2TurretStage58();                  // narrow 1.91 m right roof step
      // Source-connected outboard roof modules are low bases plus separated
      // episcope heads.  Collapsing each assembly into one tall cuboid erased
      // the real negative spaces and made the whole roof look overbuilt.
      const outboardRoofCarriers = {
        '-1': [0.6132, 0.6050, 0.5891],
        '1': [0.6065, 0.5900, 0.5821],
      };
      const buildChallenger2TurretStage59 = (): void => {
        for (const side of [-1, 1]) {
          cr2Course(P, 'turret', [
            [side * 1.03, -1.18], [side * 1.34, -1.18],
            [side * 1.34, -0.86], [side * 1.03, -0.86],
          ], [0.38, 0.28, 0.30, 0.39], [0.60, 0.57, 0.58, 0.64]);
          const heads = [
            [1.10, 0.066, 0.155, 0.20, 0.052, -1.02, -0.913],
            [1.185, 0.092, 0.155, 0.18, 0.070, -1.02, -0.923],
            [1.267, 0.064, 0.165, 0.17, 0.048, -1.01, -0.918],
          ];
          heads.forEach(([x, width, height, depth, glassWidth, z, glassZ], index) => {
            const carrierY = outboardRoofCarriers[side < 0 ? '-1' : '1'][index];
            const y = carrierY + height * 0.5 - roofEmbed;
            P.addEquipment('turret', box(width, height, depth), side * x, y, z);
            P.add('turretGlass', box(glassWidth, 0.050, 0.012), side * x, y + 0.018, glassZ);
            roofSeats.push({ label: `${side < 0 ? 'left' : 'right'}-outboard-head-${index + 1}`,
              carrierY, bottomY: y - height * 0.5 });
          });
        }
      };
      buildChallenger2TurretStage59();
      // Seat the long loader-side bridge on the sloping roof as one continuous
      // rail. Its roll is derived from the two carrier endpoints, so neither end
      // hangs in space or buries into the roof.
      const bridgeLeftY = 0.3567;
      const bridgeRightY = 0.4977;
      const bridgeRunX = 1.05;
      const bridgeHeight = 0.050;
      const bridgeRoll = Math.atan2(bridgeRightY - bridgeLeftY, bridgeRunX);
      const bridgeLength = Math.hypot(bridgeRunX, bridgeRightY - bridgeLeftY);
      const bridgeY = (bridgeLeftY + bridgeRightY) * 0.5 - roofEmbed
        + Math.cos(bridgeRoll) * bridgeHeight * 0.5;
      const buildChallenger2TurretStage60 = (): void => {
        P.add('turretDetail', box(bridgeLength, bridgeHeight, 0.030), -0.575, bridgeY, 0.00,
          0, 0, bridgeRoll);
      };
      buildChallenger2TurretStage60();
      const buildChallenger2AssemblyStage12 = (): void => {
        roofSeats.push({ label: 'loader-side-service-bridge-left', carrierY: bridgeLeftY,
          bottomY: bridgeLeftY - roofEmbed });
      };
      buildChallenger2AssemblyStage12();
      const buildChallenger2AssemblyStage13 = (): void => {
        roofSeats.push({ label: 'loader-side-service-bridge-right', carrierY: bridgeRightY,
          bottomY: bridgeRightY - roofEmbed });
      };
      buildChallenger2AssemblyStage13();
      const rightOpticY = 0.3538 + 0.24 * 0.5 - roofEmbed;
      const buildChallenger2TurretStage61 = (): void => {
        P.addEquipment('turret', box(0.060, 0.24, 0.10), 1.09, rightOpticY, 0.02);
      };
      buildChallenger2TurretStage61();
      const buildChallenger2TurretStage62 = (): void => {
        P.add('turretGlass', box(0.040, 0.075, 0.012), 1.09, rightOpticY + 0.01, 0.077);
      };
      buildChallenger2TurretStage62();
      const buildChallenger2AssemblyStage14 = (): void => {
        roofSeats.push({ label: 'right-forward-optic', carrierY: 0.3538,
          bottomY: rightOpticY - 0.12 });
      };
      buildChallenger2AssemblyStage14();
      const buildChallenger2TurretStage63 = (): void => {
        P.add('turret', slab(
          [0.34, 0.00, -1.80], [0.43, 0.00, -1.80], [0.43, 0.00, -1.72], [0.34, 0.00, -1.72],
          [0.34, 0.79, -1.80], [0.43, 0.79, -1.80], [0.43, 0.79, -1.72], [0.34, 0.79, -1.72]));
      };
      buildChallenger2TurretStage63();
      const buildChallenger2TurretStage64 = (): void => {
        P.add('turret', box(0.40, 0.30, 0.25), 0.20, 0.255, -2.08);
      };
      buildChallenger2TurretStage64();
      const rightSideHeadY = 0.1154 + 0.18 * 0.5 - roofEmbed;
      const leftSideHeadY = 0.1680 + 0.18 * 0.5 - roofEmbed;
      const buildChallenger2TurretStage65 = (): void => {
        P.addEquipment('turret', box(0.018, 0.18, 0.20), 1.332, rightSideHeadY, 0.20);
      };
      buildChallenger2TurretStage65();
      const buildChallenger2TurretStage66 = (): void => {
        P.addEquipment('turret', box(0.018, 0.18, 0.20), -1.322, leftSideHeadY, 0.20);
      };
      buildChallenger2TurretStage66();
      const buildChallenger2AssemblyStage15 = (): void => {
        roofSeats.push({ label: 'right-side-head', carrierY: 0.1154,
          bottomY: rightSideHeadY - 0.09 });
      };
      buildChallenger2AssemblyStage15();
      const buildChallenger2AssemblyStage16 = (): void => {
        roofSeats.push({ label: 'left-side-head', carrierY: 0.1680,
          bottomY: leftSideHeadY - 0.09 });
      };
      buildChallenger2AssemblyStage16();
      const buildChallenger2TurretStage67 = (): void => {
        P.snapGroup('cr2-side-lug', () => P.add('turret', box(0.04, 0.12, 0.20), 1.41, 0.33, -1.42), { reachM: 0.03 });   // 2026-10-19 (owner float sweep): seated (19 mm off)
      };
      buildChallenger2TurretStage67();
      const buildChallenger2TurretStage68 = (): void => {
        P.snapGroup('cr2-side-lug', () => P.add('turret', box(0.04, 0.12, 0.20), -1.41, 0.15, -1.42), { reachM: 0.03 });
      };
      buildChallenger2TurretStage68();
      const buildChallenger2TurretStage69 = (): void => {
        P.add('turret', box(1.60, 0.05, 0.20), 0, 0.025, 1.85);
      };
      buildChallenger2TurretStage69();
      const buildChallenger2TurretStage70 = (): void => {
        P.snapGroup('cr2-rear-box', () => P.add('turretDetail', box(0.10, 0.12, 0.10), -1.57, 0.28, -1.985), { reachM: 0.16 });   // 2026-10-19 (owner float sweep): 150 mm off; seated
      };
      buildChallenger2TurretStage70();
      const buildChallenger2TurretStage71 = (): void => {
        P.add('turret', box(0.12, 0.15, 0.020), -0.88, 0.63, -1.282);
      };
      buildChallenger2TurretStage71();
      const rightRearHeadY = 0.2907 + 0.20 * 0.5 - roofEmbed;
      const buildChallenger2TurretStage72 = (): void => {
        P.addEquipment('turret', box(0.08, 0.20, 0.14), 1.15, rightRearHeadY, -2.08);
      };
      buildChallenger2TurretStage72();
      const buildChallenger2AssemblyStage17 = (): void => {
        roofSeats.push({ label: 'right-rear-head', carrierY: 0.2907,
          bottomY: rightRearHeadY - 0.10 });
      };
      buildChallenger2AssemblyStage17();
      const buildChallenger2TurretStage73 = (): void => {
        P.add('turretDetail', cylY(0.012, 0.018, 1.44, 8), -1.24, 0.71, -0.74);
      };
      buildChallenger2TurretStage73();
      // Narrow source-owned high stations: the primary head carries the 3.04 m
      // p95 datum at x=-1.24/world-z=.30; a separate thin episcope at x=-.89
      // carries the print's neighboring 2.94 m spike without filling the gap.
      const buildChallenger2TurretStage74 = (): void => {
        P.add('turretDark', box(0.012, 0.13, 0.055), -1.24, 1.365, -0.74);
      };
      buildChallenger2TurretStage74();
      const buildChallenger2TurretStage75 = (): void => {
        P.add('turretGlass', box(0.012, 0.06, 0.025), -1.24, 1.365, -0.702);
      };
      buildChallenger2TurretStage75();
      const sourceWhip = FITTINGS.antennaWhip({ mats: P.mats, h: 0.91, r: 0.008, rake: 0.02, seed: 19 });
      const buildChallenger2AssemblyStage18 = (): void => {
        sourceWhip.position.set(-0.88, 0.35, -2.906);
      };
      buildChallenger2AssemblyStage18(); const buildChallenger2AssemblyStage19 = (): void => {
                                                      P.turretG.add(sourceWhip);
                                                    };
                                                    buildChallenger2AssemblyStage19();
      // Smoke-launcher mouths inherit the exact transform of their canisters.
      // The former upright dark discs were only approximated in world space and
      // visibly hovered beside the pitched tube ends.
      const buildChallenger2TurretStage76 = (): void => {
        // Each five-tube bank is seated on the turret wall it stood 65 mm off (owner 2026-10-19 sweep); its mouth
        // receipts move with it.
        for (const side of [-1, 1]) P.snapGroup('cr2-smoke-bank', () => {
          const x = side * 1.08;
          const y = 0.38;
          const z = 1.25;
          const yaw = side * 0.82;
          // the bank's mounting plate runs under all five tubes, so the bank is one assembly
          P.add('turretDark', box(0.52, 0.03, 0.10), x, y - 0.04, z, 0, yaw, 0);
          for (let k = 0; k < 5; k++) {
            const f = k - 2;
            const angle = yaw + f * (0.65 / 5);
            const dx = Math.cos(yaw) * f * 0.095;
            const dz = -Math.sin(yaw) * f * 0.095;
            const tubeX = x + dx;
            const tubeZ = z + dz;
            P.addEquipment('turret', markSmokeTube(cylZ(0.038, 0.24, 8)), tubeX, y, tubeZ, -0.5, angle, 0);
            P.add('turretDark', xform(cylZ(0.032, 0.012, 10), 0, 0, 0.124),
              tubeX, y, tubeZ, -0.5, angle, 0);
            smokeMouths.push({ side, tubeCenter: [tubeX, y, tubeZ], rotation: [-0.5, angle, 0],
              mouthOffsetZ: 0.124 });
          }
        }, { reachM: 0.08, onMove: (move) => {
          for (const mouth of smokeMouths.filter((entry) => entry.side === side && entry.mouthOffsetZ === 0.124)) {
            mouth.tubeCenter = mouth.tubeCenter.map((v, i) => v + move[i]);
          }
        } });
      };
      buildChallenger2TurretStage76();
    };
    buildChallenger2TurretCourse2();
    } else {
      const buildChallenger2AssemblyCourse1 = function* (): TankProfileBuild {
        yield* buildChallenger2VariantPackageSteps(P, variant, roofSeats, smokeMouths);
      };
      yield* buildChallenger2AssemblyCourse1();
    }
  };
  yield* buildChallenger2TurretStage9();
  yield 'buildChallenger2TurretStage9';

  const buildChallenger2GunStage1 = (): void => {
    P.turretG.userData.challenger2RoofSeatingReceipt = {
      contactEmbedM: roofEmbed,
      maxRoofGapM: 0,
      armorEnvelopeExcluded: true,
      roofSeats,
      station: {
        ringRearZ: 0.355,
        receiverSupportFrontZ: 0.325,
        planOverlapM: 0.030,
        ringTopY: 0.725,
        receiverSupportBottomY: 0.713,
        verticalOverlapM: 0.012,
      },
      smokeMouths,
    };

    // Axis world y=1.68, trunnion world z=1.70. The 5.72 m visual run lands
    // the muzzle at +7.42, exactly matching the repaired 11.50 m oracle.
    P.addGunExtra(box(0.48, 0.40, 0.54), 0, 0.02, 0.45);
    P.addGunExtraDark(box(0.42, 0.30, 0.05), 0, 0.00, 0.74);
    P.addGunExtra(cylZ(0.09, 0.42, P.q ? 20 : 12, 0.14), 0, 0, 0.86);
    // L30 canvas boot: nested compressed rings give the reference its deep
    // accordion read around the bore instead of one smooth collar.
    for (let k = 0; k < 5; k++) P.addGunExtraDark(
      cylZ(0.205 - k * 0.012, 0.045, P.q ? 22 : 14), 0, 0.005, 0.68 + k * 0.070);
    P.addGunExtra(box(0.40, 0.30, 0.32), 0, 0.16, 0.39);                         // TOGS housing pitches with the gun
    P.addGunExtraDark(box(0.28, 0.16, 0.035), 0, 0.16, 0.565);
    P.addGunExtra(box(0.30, 0.39, 0.42), 0, 0.03, 1.09);                         // source 2.58..3.00 mantlet/TOGS band
    P.addGunExtra(box(0.25, 0.38, 0.15), 0, 0.11, 1.375);
  };
  buildChallenger2GunStage1();
  yield 'buildChallenger2GunStage1';
  // L30 thermal jacket: keep the sleeve visibly proud of the 68 mm tube,
  // without turning the entire barrel into the former 380 mm-wide cylinder.
  const cr2Sleeve = cylZ(0.11, 3.80, P.q ? 24 : 14, 0.10);
  const buildChallenger2MarkingsStage1 = (): void => {
    P.addGunExtra(cr2Sleeve, 0, 0, 3.00);
    buildGun(P, { len: 5.72, r: 0.068, sleeve: false, evac: 0.56, collar: true, baseR: 0.15 });
    muzzleBore(P, { len: 5.72, r: 0.068 });

    ch1BaseToneKit(P, { cloth: 0x2a2e20, clothEnv: 0.05, dark: 0x252922 });
    P.decal('turret', 'number', P.spec.visual.number || '22', 0.30, [1.48, 0.28, -1.45], Math.PI / 2, 0, 0.05);
    P.decal('turret', 'number', P.spec.visual.number || '22', 0.30, [-1.48, 0.28, -1.45], -Math.PI / 2, 0, -0.05);
    P.decal('hull', 'number', 'KC91AA', 0.30, [0.80, 1.34, 3.58], 0, -1.25);
    P.decal('hull', 'soot', null, 0.55, [-0.60, 1.28, -4.075], Math.PI);
    // Recover the source's complete angular fighting-compartment height.  The
    // measured courses above had been authored so shallow that the roof suite
    // collapsed into the hull at garage distance.  Scale every turret-owned
    // armor/equipment station together about the ring, then counter-scale the
    // gun cross-section so the L30 remains circular instead of becoming oval.
    P.turretG.scale.y *= 1.40;
    P.gunG.scale.y *= 1 / 1.40;
    P.topY = 1.03;
    if(P.spec.id==='ua_challenger2')addModernFieldCage(P);
    scaleChallenger2Family(P);
  };
  buildChallenger2MarkingsStage1();
}
function buildChallenger2(...args: Parameters<typeof buildChallenger2Steps>): void {
  drainTankBuild(buildChallenger2Steps(...args));
}
withBuildSteps(buildChallenger2, buildChallenger2Steps);
// ---------------------------------------------------------------------------
// Challenger 3 — NEW VEHICLE (owner greenlight 2026-08-06). §B8 PROPORTIONS
// FIRST: authored against the NC-quarantined 42manako print's measured
// tables (docs/references/vertex/challenger_3.json — width 3.519 = the
// anchor, turret face ~2.45w/tail -2.13w, bore line 1.76, ground run
// -2.1..+2.7 with high-tucked end wheels) at the PUBLISHED CR2-anchor
// envelope (dims sovereign: hull ±4.165, width ±1.755 EXACT skirts,
// muzzle +7.335 = 11.50). CR3 identity vs the CR2 resident: the NEW
// Rheinmetall turret (flat raked face over jutting lower cheek wedges,
// huge squared bustle), Trophy APS side modules, roof RWS, and the
// 120 mm L55A1 SMOOTHBORE (evacuator + thermal sleeve + MRS collar +
// §B3.1 muzzle bore) replacing the rifled L30.
// ---------------------------------------------------------------------------
function* buildChallenger3Steps(P: ChallengerBuilderPort): TankProfileBuild {
  const { box, cylY, cylZ, slab, frustum, headlight, liftEye,
    periscope, smokeCluster, buildGun, buildRunningGear, openRackGrid, torus } = KIT;

  // ---- running gear (§B6 trapezoid; print seats): 6 Hydrogas wheels on
  // the print's longitudinal run, HIGH-TUCKED idler/sprocket (approach
  // ramp 3.0->3.8, departure -2.2..-3.2 — both read below the skirt cut).
  // Track outer 1.60 + skirt inner 1.725 (§B4 lane law with margin).
  // uk round (2026-08-07, ch1-base port): SHOE-ENVELOPE IN-WINDOW fix — the
  // old xc 1.29 / trackW 0.56 put the shoe outer face at 1.655 = EXACTLY the
  // plan ±1.72 column window edge (1.6555) and inside the front 1.624 window
  // (1.5945..1.6535): the shoes painted the ±1.72 plan columns to z -3.27
  // where the batch-47 ref ends at -0.892 (err 1.224 ×2, the worst plan
  // columns) and the 1.624 front bottoms to ground (ref 0.838, err 0.397).
  // Pulled to xc 1.245 / trackW 0.50 → shoe outer 1.58 (14 mm inside the
  // front boundary, 75 mm clear of the plan window; still paints the 1.565
  // front window whose ref DOES carry ground). Sprocket tucked -2.66 → -2.60
  // + r 0.31 → 0.28, y 0.98 (wrap far -3.065, pads ≤ -3.15 — out of the
  // -3.258 side window whose ref floor is 1.094; wrap bottom 0.52 vs the
  // ref's own 0.612 wrap line at the -3.13 column; orbit top 1.44 stays
  // 0.035 under the 1.475 sponson floor — §B4 wrap-lane law held).
  const buildChallenger3RunningGearStage1 = (): void => {
    buildRunningGear(P, {
      // Leclerc-method visual check: the source Hydrogas discs occupy almost
      // the full track depth.  The former r=.36 discs left a toy-like 35%
      // void around every hub even though the track envelope itself matched.
      // Fresh registered sitting corrected the first edge read: r=.535 made
      // a 1.07 m disc on a .91 m station pitch (16 cm physical overlap) and
      // rendered 39-44 px vs the source's ~28 px.  Six non-overlapping .90 m
      // Hydrogas discs are the measured final; retain the new tire/rim tones.
      // Seat the tire bottoms on the inner face of the loaded track run.
      // wheelY=.46 put them 90 mm through the .09 m track band; .56 leaves
      // 10 mm running clearance while keeping the upper course distinct.
      // Move the complete six-wheel train 0.10 m forward: the former -2.00 m
      // rear station intersected the rising shoe course, while the earlier
      // 0.20 m correction crowded the leading wheel into the front idler.
      // The half-step reseat preserves the measured 0.91 m Hydrogas cadence
      // and leaves both terminal transitions visibly separate.
      // Retain the source-readable open eight-rib face. The fleet's newer
      // filled pressed-disc treatment made these wheels read as dotted flat
      // plates and erased the characteristic Hydrogas face depth.
      // 2026-09-14 owner: the 0.90 m open-rib discs read goofy and too large. Real Challenger
      // wheels are ~0.80 m paired rubber-tyred halves; the hollow paired primitive draws them
      // at 0.40 m, seated inboard of the 0.555 m track shoes (0.44 m axial); the axle drops 50 mm so the
      // tire bottoms keep their seat on the loaded run.
      style: 'rubber', wheelR: 0.40, wheelW: 0.44, wheelY: 0.51, xc: 1.2825,
      roadWheelGeometry: buildHollowPairedRoadWheel({ radiusM: 0.40, high: Boolean(P.q), fasteners: 8, fastenersAsInsets: true, axialWidthM: 0.44 }),
      wheelZs: [2.65, 1.74, 0.83, -0.08, -0.99, -1.90],
      // The final drive is rear-owned but must remain below the sponson floor.
      // y=1.27 put the linked-shoe crown physically through the 1.475 floor;
      // the source-correct compact transition remains readable at y=.98 and
      // now clears the complete shoe envelope instead of hiding penetration.
      sprocket: { z: -2.60, y: 0.98, r: 0.28 }, idler: { z: 3.35, y: 0.81, r: 0.28 },
      rollers: [1.95, 0.55, -0.85, -1.75].map((z) => ({ z, y: 1.10, r: 0.08 })),
      // Track-only correction: keep the loaded run beneath the complete
      // leading road wheel before it rises to the existing front idler. The
      // rear contact returns to the source's -2.2 m departure station so the
      // gently reseated last wheel clears the rising shoes without moving the
      // complete train toward the idler again. Fit every finite lower span to
      // the live Hydrogas rims as well, so the belt and linked shoes stay
      // seated when individual wheels compress or droop over terrain.
      trackW: 0.555, topY: 1.26, contactZF: 3.02, contactZR: -2.21,
      fitLoadedRun: true,
      shoeRadialScale: 0.55,
      // The canonical family shoe keeps connector relief inside the one wrap.
      // §B8.1 NATIVE-TONE wheel countability (acceptance-flagged "wheels
      // render DARK vs the print's pale Hydrogas rims") — merkava r12
      // tireHex mechanism, per-tank param, default byte-identical elsewhere.
      paintedEnds: true, coveredTop: 1.18,
    });
    // ---- hull: belly + sponson strips at the print's front rows (0.42 /
    // 0.33), wrap-safe 3-piece band (sprocket orbit top 1.445 vs sponson
    // floor 1.475), stepped engine deck rising rearward like the print.
    // FINISH r2 (2026-08-06 punch list 3): stern floor raised to the print's
    // 0.97..1.19 rising underside line (side_hull worst cols -3.1..-4.05).
    // (uk round: belly rear end pulled -3.15 → -2.93 — its 0.42 floor painted
    // the -3.0/-3.13 side windows where the batch-47 ref bottoms read
    // 0.515/0.612, the ref's own rising wrap/boat-tail line; the stern-rise
    // slabs below now own that line. Sponson strips follow the 1.245 gear
    // lane: outer 0.96 = new track inner 0.995 - 0.035.)
    P.add('hull', box(1.36, 0.60, 6.33), 0, 0.72, 0.235);                        // belly stays between the scaled live shoe lanes
    for (const s of [-1, 1]) {
      P.add('hull', box(0.12, 0.69, 6.03), s * 0.64, 0.675, 0.135);              // under-strip stays inboard of the scaled shoe envelope
    }
    // (plan-grid law, measured this round: plan columns pitch 0.13 — the
    // ±1.72 column window spans 1.655..1.785; the print keeps its band
    // walls INSIDE 1.63 there, only the skirts reach further out)
    P.add('hull', box(1.44, 0.30, 5.85), 0, 1.17, -0.625);                       // low inner spine stays inside the scaled shoe inner faces
    for (const s of [-1, 1]) {
      // (release 240, the owner: "make sure all tank turrets are clear of hulls": the sponson tops, the shoulder's ridge and
      // the engine deck's first step stand at 1.625, 1.2 cm under the turret's underside (1.637), which sat on their 1.64
      // and swept through them at every bearing)
      P.add('hull', box(0.57, 0.075, 5.85), s * 1.345, 1.5875, -0.625);          // sponson floor clears the complete scaled top run, ends -3.55
      P.add('hull', box(0.04, 0.34, 5.85), s * 1.61, 1.35, -0.625);              // source-low outer wall 1.18..1.52, not a full-height plinth
      P.add('hull', mslab1(s,                                                    // continuous upper-hull shoulder: inner spine -> sponson deck
        [0.78, 1.30, 2.30], [0.88, 1.18, 2.30], [0.88, 1.18, -3.55], [0.78, 1.30, -3.55],
        [0.68, 1.625, 2.30], [1.08, 1.565, 2.30], [1.08, 1.565, -3.55], [0.68, 1.625, -3.55]));
      P.add('hull', mslab1(s,                                                    // sharp source chamfer -3.55 -> -3.62
        [1.06, 1.565, -3.55], [1.63, 1.565, -3.55], [1.15, 1.565, -3.62], [1.06, 1.565, -3.62],
        [1.06, 1.625, -3.55], [1.63, 1.625, -3.55], [1.15, 1.625, -3.62], [1.06, 1.625, -3.62]));
      P.add('hullDetail', box(0.04, 0.10, 1.76), s * 1.65, 1.32, -2.65);         // station-width rail: source side-band height, outer ±1.67
    }
    // Leclerc-method plan trace: the print's full-width rear course is only
    // ±1.60; ±1.72 belongs to the short forward skirt.  The old ±1.68 deck
    // AA-painted the outer plan columns all the way to z -3.27.
    P.add('hull', box(3.20, 0.045, 3.35), 0, 1.5275, 0.625);                     // main deck 1.55, z -1.05..2.30
    // (release 240: the step at 1.625 runs on to the exhaust hump, -2.45, and the 1.67 step is gone: the turret's rear
    // armour sweeps 1.644 to 3.55 m off the ring's axis and 1.666 to 3.60 (authored metres, before the 1.1 vehicle scale),
    // and the 1.67 step stood 3 cm in it from -2.12)
    P.add('hull', box(3.20, 0.05, 1.20), 0, 1.60, -1.85);                        // engine deck step 1.625
    P.add('hull', box(1.92, 0.045, 0.35), 0, 1.6775, -2.625);                    // exhaust hump 1.70 (print front deck line 1.66 at ±0.96)
    P.add('hull', box(3.20, 0.05, 0.50), 0, 1.665, -3.05);                       // rear deck 1.69
    // Concave plan tail from the print: center lane recessed to -3.78, with
    // two rear lobes reaching -3.94.  The previous single trapezoid erased
    // this signature notch and overran the center plan columns.
    P.add('hull', slab(
      [-0.30, 1.64, -3.30], [0.30, 1.64, -3.30], [0.30, 1.59, -3.30], [-0.30, 1.59, -3.30],
      [-0.30, 1.35, -3.78], [0.30, 1.35, -3.78], [0.30, 1.30, -3.78], [-0.30, 1.30, -3.78]));
    for (const s of [-1, 1]) P.add('hull', mslab1(s,
      [0.30, 1.59, -3.30], [1.60, 1.59, -3.30], [1.23, 1.30, -3.94], [0.30, 1.30, -3.94],
      [0.30, 1.64, -3.30], [1.60, 1.64, -3.30], [1.23, 1.35, -3.94], [0.30, 1.35, -3.94]));
    // §B1 glacis — ONE plane ±1.62 from the nose lip to the 1.55 roof knee
    // (print top line 1.06@3.95 -> 1.55@2.30, shallow), 0.85 bow underside,
    // raked lower bow back to the belly (center lane, §B4 idler lanes open)
    P.add('hull', slab(                                                          // center lane (deep underside)
      [-0.95, 1.00, 3.66], [0.95, 1.00, 3.66], [0.95, 0.85, 3.62], [-0.95, 0.85, 3.62],
      [-0.95, 1.55, 2.32], [0.95, 1.55, 2.32], [0.95, 1.49, 2.20], [-0.95, 1.49, 2.20]));
    for (const s of [-1, 1]) {
      // Joined true-profile wing: the source line breaks upward at z 3.60.
      // That real knee also clears the raised idler wrap instead of letting a
      // single straight plate cut through the track (§B4).
      P.add('hull', mslab1(s,
        [0.95, 1.00, 3.97], [1.62, 1.00, 3.97], [1.62, 0.95, 3.95], [0.95, 0.95, 3.95],
        [0.95, 1.24, 3.60], [1.62, 1.24, 3.60], [1.62, 1.19, 3.58], [0.95, 1.19, 3.58]));
      P.add('hull', mslab1(s,
        [0.95, 1.24, 3.60], [1.62, 1.24, 3.60], [1.62, 1.19, 3.58], [0.95, 1.19, 3.58],
        [0.95, 1.55, 2.32], [1.62, 1.55, 2.32], [1.62, 1.50, 2.30], [0.95, 1.50, 2.30]));
      // The glacis wing used to stop at x=1.62 while the raised fender/skirt
      // bridge began at x=1.60 but only rose to y=1.34.  That left a widening
      // open slot under the sloped wing from z=3.58 back to the deck knee at
      // z=2.30.  Continue the same upper/lower planes to the physical fender
      // edge so the bow is a closed shell from every oblique view.
      P.add('hull', mslab1(s,
        [1.60, 1.19, 3.58], [1.70, 1.19, 3.58], [1.70, 1.50, 2.30], [1.60, 1.50, 2.30],
        [1.60, 1.24, 3.60], [1.70, 1.24, 3.60], [1.70, 1.55, 2.32], [1.60, 1.55, 2.32]));
    }
    P.add('hull', slab(                                                          // recessed center nose: print 3.71 at x=0, outer wings own 4.11
      [-0.95, 0.85, 3.75], [0.95, 0.85, 3.75], [0.95, 0.85, 3.62], [-0.95, 0.85, 3.62],
      [-0.95, 1.02, 3.66], [0.95, 1.02, 3.66], [0.95, 1.10, 3.56], [-0.95, 1.10, 3.56]));
    P.add('hull', slab(                                                          // raked lower bow, center lane (§C.1: was the r1 latent reversed
      [-0.68, 0.42, 3.32], [0.68, 0.42, 3.32], [0.68, 0.42, 3.28], [-0.68, 0.42, 3.28],   // lower bow remains between the scaled moving shoe lanes
      [-0.68, 0.85, 3.74], [0.68, 0.85, 3.74], [0.68, 0.85, 3.60], [-0.68, 0.85, 3.60]));
    P.add('hull', box(1.36, 0.14, 0.26), 0, 0.49, 3.42);                         // toe beam remains inside the scaled track corridor
    for (const s of [-1, 1]) {
      // The source's final +4.07 m column is a 160 mm fender/datum lip, not a
      // full-height flap.  Keep its proven 1.34 m top and hull-length anchor,
      // but let the joined wing one station inboard own the structural span.
      P.add('hull', box(0.08, 0.28, 0.03), s * 1.46, 1.20, 4.045);               // narrow P95 datum lip, just deep enough to remain a body-span column
      P.add('hullDetail', box(0.04, 0.10, 0.80), s * 1.65, 1.02, 3.52);          // low fender edge carries the final bow station width
      P.add('hullDetail', box(0.09, 0.11, 0.09), s * 0.60, 0.56, 3.72);          // tow eyes
    }
    // glacis furniture: driver hatch + periscopes at the crest, splash strip
    P.add('hull', cylY(0.28, 0.28, 0.04, P.q ? 20 : 12), 0.30, 1.575, 1.78);     // driver hatch
    P.add('hullDark', torus(0.28, 0.014, P.q ? 20 : 12), 0.30, 1.582, 1.78);
    // (release 240: 1 cm lower, under the turret's front underside, which they touched at rest)
    periscope(P, 'hullDetail', 0.30, 1.59, 2.12);
    periscope(P, 'hullDetail', 0.02, 1.58, 2.12, -0.15);
    for (const s of [-1, 1]) {
      P.add('hullDetail', box(0.92, 0.045, 0.07), s * 0.52, 1.33, 2.98, 0.30, s * 0.30, 0); // splash V
    }
    {
      const lights = [];
      for (const s of [-1, 1]) {
        const lc = FITTINGS.lightCluster({ mats: P.mats, pods: 2, spacing: 0.15, rake: -0.32, seed: 6 + s });
        lc.position.set(s * 1.30, 1.13, 3.90);
        P.hullG.add(lc);
        lights.push(lc);
      }
    }
    {
      const tc = FITTINGS.towCable({ mats: P.mats, r: 0.021, seed: 9,
        pts: [[-0.90, 1.40, 2.60], [-0.35, 1.44, 2.05], [0.60, 1.33, 2.50], [1.20, 1.32, 2.90]] });
      P.hullG.add(tc);
    }
    // ---- stern: raked boat tail + upper plate with the CR3 print's rear
    // kit (external tank, exhaust boxes, convoy plate) inside ±4.165.
    // FINISH r2: the print's stern floor is HIGH (0.64@-3.14 rising to
    // 1.19@-4.04) — steep boat-tail rise ending -3.40, then a rising
    // underside wedge to the tail; upper plate raised (0.98..1.38, print
    // top 1.39) and NARROWED to ±1.28 with tapered stern walls (the print's
    // plan boat-tail: full-width content ends z -3.55 at |x| 1.34+).
    // uk round: the boat-tail floor re-authored ON the batch-47 ref's own
    // rising bottom line (side ref bottoms 0.515@-3.0 / 0.612@-3.13 /
    // 1.094@-3.258 / 1.191@-4.03 — the old 0.42-floor frustum painted the
    // -3.0..-3.26 windows 0.3-0.65 deep). Three ≤0.48 segments (§C station
    // end-caps), underside-quad-first ring order (the file's stern-wedge
    // convention).
    P.add('hull', slab(                                                          // rise 0.42@-2.93 -> 0.64@-3.16 (through the ref's 0.515/-3.0 read)
      [-0.78, 0.42, -2.93], [0.78, 0.42, -2.93], [0.78, 0.64, -3.16], [-0.78, 0.64, -3.16],
      [-0.78, 1.02, -2.93], [0.78, 1.02, -2.93], [0.78, 1.02, -3.16], [-0.78, 1.02, -3.16]));
    P.add('hull', slab(                                                          // steep knee 0.64@-3.16 -> 1.09@-3.27 (ref 1.094@-3.258)
      [-0.78, 0.64, -3.16], [0.78, 0.64, -3.16], [0.78, 1.09, -3.27], [-0.78, 1.09, -3.27],
      [-0.78, 1.02, -3.16], [0.78, 1.02, -3.16], [0.78, 1.20, -3.27], [-0.78, 1.20, -3.27]));
    P.add('hull', slab(                                                          // center underside follows the recessed -3.78 lane
      [-0.78, 1.09, -3.27], [0.78, 1.09, -3.27], [0.78, 1.19, -3.78], [-0.78, 1.19, -3.78],
      [-0.78, 1.255, -3.27], [0.78, 1.255, -3.27], [0.78, 1.31, -3.78], [-0.78, 1.31, -3.78]));
    // upper rear plate SPLIT (print plan: center-rear ends ~-3.9; the side
    // -4.17 anchor column rides the OUTER posts — hullLengthM/dAlong held):
    for (const s of [-1, 1]) {
      P.add('hull', box(0.53, 0.21, 0.10), s * 1.015, 1.295, -3.96);             // outer posts x 0.75..1.28, y 1.19..1.40
    }
    for (const s of [-1, 1]) P.add('hull', box(0.50, 0.30, 0.08), s * 0.50, 1.20, -3.88); // mid rear plates
    P.add('hull', box(0.48, 0.30, 0.08), 0, 1.20, -3.74);                        // recessed center plate, face -3.78
    for (const s of [-1, 1]) P.add('hullDark', box(0.43, 0.22, 0.05), s * 0.50, 1.18, -3.905);
  };
  buildChallenger3RunningGearStage1();
  yield 'buildChallenger3RunningGearStage1';
  const buildChallenger3HullStage1 = (): void => {
    P.add('hullDark', box(0.42, 0.22, 0.05), 0, 1.18, -3.765);
    // Source stern identity: recessed service bays with proud grille blades,
    // split exhaust modules, and visible undercut hardware.  These stay
    // inside the measured rear courses; detail density no longer relies on
    // one flat dark rectangle to imply the whole power-pack face.
    for (const s of [-1, 1]) {
      for (let k = 0; k < 5; k++) {
        P.add('hullDetail', box(0.39, 0.018, 0.018), s * 0.50, 1.09 + k * 0.045, -3.938);
      }
      P.add('hullDetail', box(0.035, 0.25, 0.025), s * 0.28, 1.18, -3.94);
      P.add('hullDetail', box(0.035, 0.25, 0.025), s * 0.72, 1.18, -3.94);
      P.add('hullDark', cylZ(0.072, 0.08, P.q ? 14 : 10), s * 1.17, 1.60, -3.80, Math.PI / 2, 0, 0);
      P.add('hullDetail', box(0.22, 0.10, 0.10), s * 1.17, 1.54, -3.79);
      liftEye(P, 'hullDetail', s * 0.82, 1.04, -3.96, 0.08);
    }
    for (let k = 0; k < 4; k++) P.add('hullDetail', box(0.34, 0.016, 0.018), 0, 1.10 + k * 0.048, -3.795);
    for (const s of [-1, 1]) {
      P.add('hull', mslab1(s,                                                    // sharp plan chamfer ends at the print's -3.53 outer row
        [1.55, 1.02, -3.55], [1.63, 1.02, -3.55], [1.22, 1.02, -3.62], [1.14, 1.02, -3.62],
        [1.55, 1.55, -3.55], [1.63, 1.55, -3.55], [1.22, 1.55, -3.62], [1.14, 1.55, -3.62]));
      P.add('hull', box(0.28, 0.16, 0.42), s * 1.18, 1.585, -3.58);              // low exhaust cowls inboard of the chamfer
      P.add('hullDark', box(0.24, 0.05, 0.36), s * 1.18, 1.665, -3.58);
      P.add('hullDark', box(0.15, 0.08, 0.05), s * 1.10, 1.28, -3.99);           // taillights on the narrowed plate
      P.add('hullRubber', box(0.36, 0.28, 0.026), s * 1.42, 1.26, -3.48);        // rear flaps terminate on the -3.53 outer row
      // (uk round: a 1.25 lug re-seat was tried for the -4.03 window bottom
      // and REVERTED — the 0.845 lug underside is anchor-column MASS: the
      // -4.1 body column rides the 12% filter margin, and the whip-height
      // chase proved the coupling: a taller row rough eats the column and
      // hullLengthM walks 8.25 -> 8.11. REGISTRATION-ANCHOR law.)
      P.add('hullDetail', box(0.13, 0.20, 0.10), s * 0.85, 1.39, -3.95);         // raised stern tow/guard lugs: source line 1.29..1.49
      // rear light-guard bars (§B3.2 real CR3 kit + anchor-column armor: the
      // bars hold the -4.1 window's height span 0.70..1.40 so the body
      // column keeps headroom over the 12% filter whatever the row rough).
      // P95 datum carrier: one attached rear guard keeps the published
      // 8.33 m hull datum without bloating the armored stern courses.
      P.add('hullDetail', box(0.05, 0.66, 0.04), s * 0.98, 1.36, -4.21);
      // its bracket runs back from the stern lug (the bar stood 0.24 m behind it with nothing holding it)
      P.add('hullDetail', box(0.22, 0.05, 0.30), s * 0.895, 1.45, -4.075);
    }
    P.add('hullDetail', box(0.30, 0.16, 0.04), 0, 1.20, -3.785);                 // convoy plate on the center plate
    P.add('hullDetail', box(0.12, 0.14, 0.22), 0, 1.20, -3.89);                  // center tow pintle preserves the print's narrow -3.98 plan tip
    // (release 240: 6 cm lower, under the bustle's corners, which sat 5 cm into them at rest)
    liftEye(P, 'hullDetail', -1.45, 1.52, -1.60);
    liftEye(P, 'hullDetail', 1.45, 1.52, -1.60);
    headlight(P, -1.45, 1.11, 3.96, -0.25, 0.05);
    headlight(P, 1.45, 1.11, 3.96, -0.25, 0.05);
  };
  buildChallenger3HullStage1();
  yield 'buildChallenger3HullStage1';
  // ---- skirts ±1.755 EXACT (§D width anchor): 6 flat bays, bottom at the
  // 0.62 hub line (wheels ~60% exposed — §B8), raised stepped front panel
  // exposing the idler, recessed dark handles, no fringe below.
  const buildChallenger3HullStage2 = (): void => {
    for (const s of [-1, 1]) {
      P.add('hull', mslab1(s,                                                    // stepped front panel — print plan: full-width faces end z 3.01;
        [1.695, 1.18, 3.05], [1.755, 1.18, 3.05], [1.755, 1.18, 2.42], [1.695, 1.18, 2.42],
        [1.695, 1.32, 3.10], [1.755, 1.32, 3.10], [1.755, 1.32, 2.42], [1.695, 1.32, 2.42]));
      // Close the 110 mm plan pocket between the middle-front bay (ending
      // z=2.30) and the raised bow bridge (formerly beginning z=2.41).  This
      // stays above/outboard of the animated course and restores one backed
      // fender load path without removing or lifting any skirt geometry.
      P.add('hull', box(0.10, 0.06, 0.82), s * 1.65, 1.31, 2.70);                // closed fender bridge: wing -> raised front skirt
      // 3 bays ONLY — the print's skirts END at z ~-0.9 (plan row: ±1.76
      // content spans 3.16..-0.73 on the print) leaving the rear wheels +
      // sprocket run OPEN (§B8 exposure)
      // uk round (batch-47 re-read): hem 0.62 -> 0.73 — the ref's own front
      // bottoms at the ±1.62/1.67 windows read 0.75..0.84 (the old hem read
      // 0.13..0.22 deep); wheels now ~75% exposed (§B8.1 improves). Scallop
      // tabs pulled INBOARD to 1.6325..1.6875 (they AA-kissed the ±1.698
      // window boundary and painted the ±1.727/1.742 windows 0.53-deep where
      // the ref reads 1.176) and hung 0.70..0.79 per the ref's own tab line.
      // Source station widths narrow through z 1.16..2.33, then return to
      // full skirt width at the bow.  Author the three bays separately.
      P.add('hull', box(0.04, 0.14, 1.00), s * 1.665, 1.25, 1.80);              // middle-front bay, outer 1.685
      P.add('hullDark', box(0.012, 0.05, 0.28), s * 1.6855, 1.10, 1.80);
      P.add('hull', box(0.055, 0.14, 0.12), s * 1.7125, 1.25, 2.36);            // transition to full bow width
      P.add('hull', box(0.06, 0.14, 0.885), s * 1.725, 1.25, 0.6375);           // center bay ends 1.08 at the measured station-width knee
      P.add('hull', box(0.10, 0.06, 0.14), s * 1.65, 1.31, 1.05);                // close the one-cell bay-knee slot
      P.add('hullDark', box(0.012, 0.05, 0.28), s * 1.7555, 1.10, 0.6375);
      P.add('hull', box(0.06, 0.14, 1.11), s * 1.725, 1.25, -0.40);             // rear bay
      P.add('hullDark', box(0.012, 0.05, 0.28), s * 1.7555, 1.10, -0.40);
      for (const z of [1.30, 0.15, -0.97]) P.add('hullDark', box(0.065, 0.10, 0.018), s * 1.67, 1.23, z);
      // Hull-owned carrier plates sit behind (never in front of) the existing
      // visible skirt faces.  Their inboard edges overlap the x=1.63 outer
      // hull wall and their outboard edges overlap each bay, turning the three
      // formerly floating panels and dark divider strips into one mounted
      // side-skirt assembly without changing the exterior silhouette.
      for (const [x, z, depth] of [
        [1.635, 1.80, 1.00],
        [1.6475, 0.6375, 0.885],
        [1.6475, -0.40, 1.11],
      ]) {
        const width = x === 1.635 ? 0.10 : 0.145;
        P.add('hull', box(width, 0.24, depth), s * x, 1.22, z);
      }
      // Short hangers tie each carrier into the sponson wall/deck.  Keeping
      // these discrete avoids recreating the conspicuous full-length line
      // that the old render-only shadow proxy produced beside each track.
      for (const z of [2.75, 2.28, 1.80, 1.30, 0.88, 0.40, -0.10, -0.68]) {
        P.add('hullDetail', box(0.12, 0.22, 0.08), s * 1.63, 1.38, z);
      }
      for (const zg of [2.10, 1.19, 0.28]) {                                     // scallop tabs between wheels (tops weld into the 0.95 bay hem, outer
        P.add('hull', box(0.06, 0.27, 0.30), s * 1.67, 0.835, zg);               // face 1.70 overlaps the 1.695 bay inner plane — §B2 attached)
        P.add('hull', box(0.08, 0.26, 0.18), s * 1.67, 1.07, zg);                // welded neck: scallop tab -> carrier/backplate
      }
    }
  };
  buildChallenger3HullStage2();
  yield 'buildChallenger3HullStage2';

  // ---- turret: the NEW Rheinmetall wedge (§B8 print form: face ~2.45w,
  // huge squared bustle to -2.13w, ±1.41 walls). Pivot [0,1.55,1.20];
  // locals = world - pivot.
  // The former 0.85 m datum belonged only to the abandoned high rear cap.
  // It was nevertheless reused by every hatch, sight and weapon seat, which
  // left a second turret stacked above the low forward brow.  The connected
  // crown now peaks at 0.68 m and every C3H-relative fitting follows that
  // real roof instead of the deleted superstructure datum.
  const C3H = 0.68;
  // Capture the authored Protector body around the existing M2 rig. Roof
  // foundations and independent sights remain fixed; rails follow elevation.
  const rwsStock = (stage: 'yaw' | 'pitch' = 'yaw'): (() => void) =>
    captureAuxiliaryStock(P, 'fitting_browningDerived_m2', stage);
  // Leclerc-method shell: the oracle's largest connected turret component
  // has two distinct height courses.  Its broad flank shoulders live at
  // world 2.11..2.22 while only the inset center roof reaches 2.30..2.40.
  // The former one-ring frustum put the full ±1.24 roof at 2.40 and read as
  // a tall box in every shaded comparison even though its outer AABB was
  // numerically correct.  Each longitudinal station below therefore owns
  // an outer wall, a sloped flank, and a narrow roof cap independently.
  const c3ShellSegment = (
    zF: number,
    zR: number,
    q: Challenger3ShellSection,
  ): void => {
    const bottomZR = q.bottomZR ?? zR;
    for (const s of [-1, 1]) {
      P.add('turret', mslab1(s,
        [0, q.bottomF, zF], [q.outerF, q.bottomF, zF], [q.outerR, q.bottomR, bottomZR], [0, q.bottomR, bottomZR],
        [q.roofXF, q.roofYF, zF], [q.shoulderXF, q.shoulderYF, zF],
        [q.shoulderXR, q.shoulderYR, zR], [q.roofXR, q.roofYR, zR]));
    }
    P.add('turret', slab(
      [-q.roofXF, q.roofYF - 0.035, zF], [q.roofXF, q.roofYF - 0.035, zF],
      [q.roofXR, q.roofYR - 0.035, zR], [-q.roofXR, q.roofYR - 0.035, zR],
      [-q.roofXF, q.roofYF, zF], [q.roofXF, q.roofYF, zF],
      [q.roofXR, q.roofYR, zR], [-q.roofXR, q.roofYR, zR]));
  };
  const buildChallenger3TurretStage1 = (): void => {
    c3ShellSegment(-2.55, -3.34, {
      bottomF: 0.10, bottomR: 0.15, bottomZR: -3.27, outerF: 1.34, outerR: 1.41,
      // Critic measurement: the high course was ~22% too long in the
      // registered side pair.  Keep the full lower bustle extreme, but drop
      // its terminal 0.3 m into a raked tail instead of extending the roof
      // plateau squarely to the rear face.
      shoulderXF: 1.28, shoulderXR: 1.35, shoulderYF: 0.58, shoulderYR: 0.50,
      roofXF: 1.05, roofXR: 1.05, roofYF: 0.66, roofYR: 0.52,
    });
    // Owner surface-1 (2026-09-10 X, 2026-09-11 base): the original rear
    // centerline face opened into a V-shaped cavity on both Challenger 3
    // variants. Close that shared shell beneath its existing bustle roof.
    P.add('turret', buildChallenger3RearTurretClosure());
    c3ShellSegment(-1.33, -2.55, {
      bottomF: 0.02, bottomR: 0.10, outerF: 1.36, outerR: 1.34,
      shoulderXF: 1.31, shoulderXR: 1.28, shoulderYF: 0.60, shoulderYR: 0.58,
      roofXF: 0.91, roofXR: 1.05, roofYF: 0.68, roofYR: 0.66,
    });
    c3ShellSegment(-0.39, -1.33, {
      bottomF: 0.02, bottomR: 0.02, outerF: 1.40, outerR: 1.36,
      shoulderXF: 1.34, shoulderXR: 1.31, shoulderYF: 0.60, shoulderYR: 0.60,
      roofXF: 0.92, roofXR: 0.91, roofYF: 0.66, roofYR: 0.68,
    });
    c3ShellSegment(0.22, -0.39, {
      bottomF: 0.02, bottomR: 0.02, outerF: 1.40, outerR: 1.40,
      // Source side trace falls from 2.211 m @ world z=.808 to 2.111 m
      // @ z=1.420.  The prior 2.24 m forward cap kept a false high box over
      // the gun.  The roof also remains broad at this station: the print's
      // top vertex reaches x +-1.344, not the old +-0.88 inset.
      shoulderXF: 1.34, shoulderXR: 1.34, shoulderYF: 0.56, shoulderYR: 0.60,
      roofXF: 1.15, roofXR: 1.05, roofYF: 0.56, roofYR: 0.66,
    });
    // Owner silhouette correction (2026-08-12): the old front station
    // collapsed to a paper-thin brow at z=.88, so the turret's numerical
    // envelope was long while the visible fighting compartment stopped well
    // behind the mantlet.  Carry the connected outer wall, shoulder and crown
    // forward as one station; the open center remains reserved for the gun
    // seat and no detached applique is used to fake the length.
    c3ShellSegment(1.22, 0.22, {
      bottomF: 0.02, bottomR: 0.02, outerF: 1.40, outerR: 1.40,
      // The oracle's broad turret roof ENDS at world z=1.42.  At z=2.085
      // its main component contains only the 1.566 m lower-cheek course.
      // Collapse this station to that course so the forward shell becomes
      // the real descending brow instead of a second superstructure.
      shoulderXF: 1.30, shoulderXR: 1.34, shoulderYF: 0.30, shoulderYR: 0.56,
      roofXF: 0.78, roofXR: 1.15, roofYF: 0.32, roofYR: 0.56,
    });
    // The oracle's nose is a low armored throat plus independently faceted
    // lower cheeks, not a second full-height turret box.
    P.add('turret', slab(
      [-0.52, 0.02, 1.70], [0.52, 0.02, 1.70], [0.78, 0.02, 1.22], [-0.78, 0.02, 1.22],
      [-0.40, 0.17, 1.60], [0.40, 0.17, 1.60], [0.50, 0.34, 1.22], [-0.50, 0.34, 1.22]));
    for (const s of [-1, 1]) {
      // A-C folded the low cheek roof inward by 91 degrees. B-D gives the
      // authored convex ridge and preserves all silhouette datums.
      P.add('turret', facetedSlab([
        [0.40, 0.02, 1.70], [0.98, 0.02, 1.52], [1.40, 0.02, 1.22], [0.78, 0.02, 1.22],
      ],[
        [0.40, 0.17, 1.60], [0.92, 0.42, 1.43], [1.20, 0.30, 1.22], [0.50, 0.34, 1.22],
      ],s,'bd'));
      P.add('turretDetail', box(0.025, 0.07, 1.20), s * 1.325, 0.635, -0.84, 0, 0, s * 0.045);
    }
    // embrasure: recessed collar + canvas boot (§B3.1 — no bare notch);
    // L94A1-class coax port on the LEFT of the slot (print 'weapon3')
    P.add('turret', box(0.46, 0.56, 0.36), 0, 0.30, 0.98);
    P.add('turretDark', box(0.52, 0.46, 0.06), 0, 0.30, 1.17);
    P.add('turret', cylZ(0.052, 0.06, 10), -0.32, 0.42, 1.13, -0.05, -0.30, 0);
    P.add('turretDark', cylZ(0.028, 0.10, 8), -0.32, 0.42, 1.16, -0.05, -0.30, 0);
    // TROPHY APS modules on both flanks (§H.4 the CR3 tell): slab boxes with
    // vent lines + angled radar faces front/rear (merkava grammar).
    // FINISH r2: modules re-derived from the print's plan/front rows — faces
    // out to x 1.66 hanging at the roof line (plan ref [0.95, -1.70]w at
    // |x| 1.6; front ref tops 2.44-2.46 at |x| 1.62-1.68).
    // uk round (batch-47 re-read, 2-pass): the ref's Trophy band is a
    // TILTED-PANEL read — side-armor shoulder at 2.42w holding to x 1.60,
    // then the leaned module face falling to 2.20w at 1.74 (front rows read
    // 2.45 at the ±1.61 windows, 2.205 at ±1.73; the old vertical 2.40-top
    // box read +0.18 outboard and -0.24 inboard). Real Trophy grammar: the
    // panel leans against the turret side on standoff brackets (§B2).
    for (const s of [-1, 1]) {
      // Broad roots overlap the shell before the radar course reaches the
      // outboard panel.  The previous 60 mm roots began 10 mm outside the
      // armor wall and were visible as two detached tabs in roof/rear views.
      P.add('turret', box(0.10, 0.24, 0.18), s * 1.43, 0.67, -0.22);
      // Rear-view correction: terminal core is 2.82 m wide; the print remains
      // x=+-1.70 continuously through the full lower rear band.  A leaned
      // 20-mm face only reached that width at its upper edge, then visibly
      // contracted.  This is a REAL closed trapezoidal armor/APS course:
      // it overlaps the varying 1.34..1.41 core wall (no air seam), holds the
      // outer guard line vertically, and stays inside the already-certified
      // -2.885..-2.385 source-plan station.
      P.add('turret', mslab1(s,
        [1.32, 0.17, -2.385], [1.70, 0.17, -2.385], [1.70, 0.17, -2.885], [1.32, 0.17, -2.885],
        [1.25, 0.62, -2.385], [1.70, 0.62, -2.385], [1.70, 0.62, -2.885], [1.25, 0.62, -2.885]));
      P.add('turret', box(0.02, 0.28, 2.12), s * 1.67, 0.63, -1.325, 0, 0, s * 0.53); // full-width forward course
      for (const bz of [-0.40, -1.55, -2.70]) {
        // x 1.34..1.68 overlaps both the 1.36..1.40 shell and the 1.67
        // panel.  This is the actual load path for the complete side course.
        P.add('turret', box(0.34, 0.08, 0.10), s * 1.51, 0.57, bz);
      }
      P.add('turretDark', box(0.022, 0.02, 2.35), s * 1.645, 0.67, -1.575, 0, 0, s * 0.53); // panel ribs
      P.add('turretDark', box(0.022, 0.02, 2.35), s * 1.695, 0.585, -1.575, 0, 0, s * 0.53);
      P.add('turretDark', box(0.03, 0.18, 0.18), s * 1.575, 0.58, -0.22, 0, s * 0.35, 0);   // fwd radar
      // the radar's aperture keeps its whole face: its 18 cm housing is already its frame (tankFactoryCore.ts
      // armouredGlassSurround leaves an aperture panel alone)
      const aperture = box(0.012, 0.14, 0.14);
      aperture.userData.apertureFrame = 'housing';
      P.add('turretGlass', aperture, s * 1.60, 0.58, -0.21, 0, s * 0.35, 0);
      P.add('turretDark', box(0.03, 0.18, 0.18), s * 1.53, 0.57, -2.78, 0, -s * 0.35, 0);   // rear radar
    }
    // RWS (PROTECTOR-class, §H.4 UK grammar: M2 12.7 on the remote mount)
    // front-left roof. FINISH r2: seated ON the print's own RCWS body zone
    // (side ref 2.96-3.00 tops at z_w 0.55..1.15) — mount body + sensor
    // head carry that plateau; the M2 runs forward to ~z_w 1.9 at the
    // 2.85-2.97 line. The print's elevated 30 mm barrel columns at
    // z_w 2.15-2.66 stay the certified §H.4 residual (UK M2 grammar).
    // Source station census (kitMerged_turret_1): x .27..1.15,
    // z .67..2.70, y 2.11..3.00.  Keep the real Protector/M2 grammar, but
    // seat and envelope it on those measured CR3 stations.
    // OWNER ATTACHMENT CLOSEOUT (2026-08-09): an envelope match is not a
    // load path.  The former 35 mm fork legs and bare twin rails disappeared
    // at garage distance, making the complete station read as several pieces
    // suspended over the turret.  A half-buried roof shoe, substantial fork
    // cheeks and a central receiver now overlap continuously from the roof
    // course into the gun rails.  The cradle still has real mechanical holes,
    // but no component is supported by empty air.
    // GARAGE-SIDE ATTACHMENT REPAIR (owner 2026-08-10): C3H is the peak of
    // the inset crown, not the roof height at this forward station.  Using it
    // as a universal seat left the complete Protector foundation visibly in
    // the air from a flat side camera.  This tapered trunk begins inside the
    // real sloping roof course (about .63 local here) and overlaps the old
    // shoe, giving the station a continuous armored load path.
    P.add('turret', frustum(0.27, 0.25, -0.25, 0.22, 0.20, -0.20, 0, 0.24),
      0.72, 0.59, -0.22);
    P.add('turret', box(0.64, 0.12, 0.58), 0.72, C3H, -0.22);                   // roof shoe: foundation overlaps its underside
    P.add('turret', cylY(0.18, 0.24, 0.14, 8), 0.72, C3H + 0.06, -0.18);         // octagonal pedestal
    // Release 230 (the owner's field-equipment standard: nothing that moves passes through what does not): the M2
    // (stretched 1.55 along its bore) pitched and recoiled through this stock. Its receiver's rear swung down into the
    // body and the junction tier from about 20 degrees of elevation and through the rear cover at rest, the receiver
    // passed through the cradle bar between the fork cheeks, the can through the left cheek and the inner sensor, and the
    // pitching spine and rails enclosed the receiver's front, the can and the barrel. The body and the junction tier now
    // crown under the receiver's sweep (world 2.79), the fork cheeks stand clear of the gun's sides and carry its
    // trunnions alone (no bar across its path), the inner sensor stands outboard of the can, the rear cover is gone (the
    // receiver's own butt closes the station), and the cradle the gun rides in (spine, rails and cross bar) runs under
    // the gun and forward of its can.
    const finishRwsBody = rwsStock();
    P.add('turretDetail', frustum(0.27, 0.28, -0.28, 0.20, 0.22, -0.22, 0, 0.115),
      0.72, C3H + 0.12, -0.22);                                                  // low faceted open-mount body
    for (const sx of [-1, 1]) P.add('turretDetail', box(0.075, 0.34, 0.10), 0.72 + (sx < 0 ? -0.25 : 0.22), C3H + 0.33, -0.22);
    finishRwsBody();
    const finishRwsSpine = rwsStock('pitch');
    P.addEquipment('turret', box(0.28, 0.056, 0.336), 0.745, C3H + 0.3695, 0.262);       // receiver spine: mount body -> recoil rails
    finishRwsSpine();
    const finishRwsInnerSensor = rwsStock();
    P.add('turretDark', cylY(0.105, 0.12, 0.18, 8), 0.385, C3H + 0.40, -0.22);  // faceted sensor head
    P.add('turretGlass', box(0.14, 0.08, 0.02), 0.385, C3H + 0.40, -0.11);
    finishRwsInnerSensor();
    // Forward open cradle follows the source RWS component's measured
    // z=.67..2.70 world run.  Twin rails + a faceted terminal optic give the
    // right silhouette mass without substituting the print's Boxer cannon
    // for the required M2.
    const finishRwsRails = rwsStock('pitch');
    for (const x of [0.61, 0.88]) P.add('turretDetail', box(0.045, 0.045, 0.7145), x, C3H + 0.42, 0.583);
    P.add('turretDetail', box(0.31, 0.045, 0.045), 0.745, C3H + 0.42, 0.93);
    finishRwsRails();
    // The forward optic is turret-face equipment, not a pod hanging from the
    // elevated gun rails.  Seat its tapered body and neck directly into the
    // descending brow at z .82..1.05; the old C3H-relative placement was the
    // large isolated rectangle in the owner's garage-side screenshot.
    P.add('turretDetail', frustum(0.16, 0.13, -0.13, 0.12, 0.09, -0.09, 0, 0.20),
      0.75, 0.075, 0.93);
    P.add('turretDetail', box(0.22, 0.20, 0.14), 0.75, 0.18, 0.82);
    P.add('turretGlass', box(0.18, 0.09, 0.016), 0.75, 0.245, 1.05);
    const finishRwsOuterSensor = rwsStock();
    P.add('turretDark', frustum(0.14, 0.13, -0.13, 0.11, 0.09, -0.09, 0, 0.23),
      1.01, C3H + 0.34, -0.15);                                                  // measured outer RWS sensor at x .87..1.15
    P.add('turretDetail', box(0.14, 0.20, 0.12), 0.94, C3H + 0.24, -0.17);      // sensor bracket overlaps mount body and pod
    finishRwsOuterSensor();
    // Independent rear-left panoramic sight.  The source connected-component
    // seat is x -.59..-.14 / world z -1.21..-.86: the old front-center tower
    // was both misplaced and an unbroken rectangular proxy.
    P.add('turret', cylY(0.13, 0.17, 0.12, 8), -0.38, C3H + 0.06, -2.22);
    P.add('turretDetail', frustum(0.23, 0.22, -0.22, 0.18, 0.16, -0.16, 0, 0.27),
      -0.38, C3H + 0.12, -2.22);
    {
      // Source AABB x -.594..-.146 / y 2.575..2.973 / z -1.208..-.864.
      // A tall tapered head, not the former squat octagonal box, produces the
      // curved/faceted silhouette visible in the registered front pair.
      const sightHead = cylY(0.22, 0.22, 0.26, 12);
      sightHead.scale(1, 1, 0.78);
      P.add('turretDark', sightHead, -0.38, C3H + 0.42, -2.22);
      const sightCap = cylY(0.16, 0.22, 0.05, 12);
      sightCap.scale(1, 1, 0.78);
      P.add('turretDetail', sightCap, -0.38, C3H + 0.575, -2.22);
    }
    P.add('turretGlass', box(0.24, 0.10, 0.018), -0.38, C3H + 0.43, -2.04);
  };
  buildChallenger3TurretStage1();
  yield 'buildChallenger3TurretStage1';
  // Low asymmetric periscope field.  Short prisms and angled seats preserve
  // the source's roof rhythm without creating another fake superstructure.
  const buildChallenger3TurretStage2 = (): void => {
    P.add('turretDetail', slab(
      [-0.56, 0, 0.12], [-0.08, 0, 0.12], [-0.12, 0, -0.62], [-0.50, 0, -0.62],
      [-0.50, 0.11, 0.08], [-0.12, 0.11, 0.08], [-0.16, 0.11, -0.58], [-0.46, 0.11, -0.58]),
      0, C3H + 0.015, -0.72);
    for (const [x, z, rz] of [[-0.04, -1.30, -0.15], [0.27, -1.30, 0.12], [-0.82, -1.88, -0.25]]) {
      P.add('turretDetail', frustum(0.07, 0.08, -0.08, 0.055, 0.06, -0.06, 0, 0.13), x, C3H + 0.02, z, 0, rz, 0);
      P.add('turretGlass', box(0.09, 0.055, 0.012), x, C3H + 0.10, z + 0.07, 0, rz, 0);
    }
    P.add('turretDetail', frustum(0.16, 0.14, -0.14, 0.11, 0.10, -0.10, 0, 0.19),
      -0.83, C3H + 0.03, -1.02, 0, -0.18, 0);
    P.add('turretGlass', box(0.16, 0.07, 0.012), -0.83, C3H + 0.15, -0.90, 0, -0.18, 0);
    // uk round: RWS ammunition/junction tier BEHIND the mount (§B3 named
    // equipment) — the batch-47 ref's own side tops at z_w 0.35..0.48 read
    // 2.575..2.607 (its boxy RCWS base runs rearward; ours ended z_w 0.555
    // and those columns fell to the 2.38 roof). Top 2.60w; front columns
    // unchanged (the 2.85 mount body owns x -0.13..-0.47 tops).
    const finishRwsRearBody = rwsStock();
    P.add('turretDetail', frustum(0.22, 0.16, -0.16, 0.18, 0.13, -0.13, 0, 0.205),
      0.72, C3H + 0.03, -0.42);                                                  // faceted ammunition/junction tier
    finishRwsRearBody();
    P.add('turret', box(0.40, 0.25, 0.28), 0.72, 0.755, -0.42);                 // buried roof-to-tier service trunk
    const finishRwsRearCover = rwsStock();
    P.add('turretDark', box(0.34, 0.025, 0.23), 0.72, C3H + 0.228, -0.42);       // lid seam
    finishRwsRearCover();
    {
      const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', remoteControlled: true, ridingCradle: true, tone: 'two-tone', seed: 31, elev: 0.05, ammo: true });
      mg.position.set(0.72, C3H + 0.22, -0.10);
      mg.scale.z = 1.55;                                                         // measured .73..2.67 world run
      P.turretG.add(mg);
    }
    // sights: gunner's EPSOM housing recessed into the face top RIGHT (§B1.1
    // detail rides ON the plane), commander pano rear-right
    // EPSOM follows the actual falling brow: rear points bury into the .4 m
    // station while the forward edge lands on the low .83 m nose course.
    // This replaces the peak-roof translation that suspended the entire hood
    // roughly half a metre above the turret.
    P.add('turret', slab(
      [0.22, 0.08, 0.83], [0.74, 0.08, 0.83], [0.70, 0.32, 0.40], [0.26, 0.32, 0.40],
      [0.27, 0.22, 0.77], [0.69, 0.22, 0.77], [0.65, 0.45, 0.44], [0.31, 0.45, 0.44]));
    P.add('turretDark', frustum(0.19, 0.04, -0.04, 0.15, 0.025, -0.025, 0, 0.10),
      0.48, 0.215, 0.78, -0.18, 0, 0);
    P.add('turretGlass', box(0.27, 0.07, 0.014), 0.48, 0.305, 0.82, -0.18, 0, 0);
    // uk round (ref front render + batch-47 rows): the ref's commander pano
    // is a TALL TOWER at the roof's right edge — front tops 2.88..2.95 across
    // x 0.80..1.15 (our old 0.55-seat drum read 0.4 short there), and the
    // side rows carry a 2.85-2.87 sensor band across z_w -0.6..-1.15 (the
    // tower + pot cluster). Pedestal moved out + raised; head cap tops
    // 2.93w; hood deepened over both -0.97/-1.09 side windows; GPS/met pots
    // extend the band forward.
    P.add('turretDetail', cylY(0.13, 0.18, 0.18, 10), 0.82, C3H + 0.09, -2.25); // commander station: source world z -1.05
    P.add('turretDark', cylY(0.12, 0.15, 0.16, 10), 0.82, C3H + 0.25, -2.25);   // domed/faceted head tier
    P.add('turretDark', cylY(0.075, 0.12, 0.10, 10), 0.82, C3H + 0.38, -2.25);
    P.add('turretGlass', box(0.17, 0.08, 0.018), 0.82, C3H + 0.29, -2.09);
    P.add('turretDetail', cylY(0.085, 0.095, 0.20, 10), 0.53, C3H + 0.08, -2.05);
    P.add('turretDark', cylY(0.055, 0.075, 0.08, 8), 0.53, C3H + 0.20, -2.05);
    P.add('turretDetail', cylY(0.07, 0.08, 0.16, 10), 0.25, C3H + 0.07, -2.05);
    P.add('turretDark', cylY(0.05, 0.06, 0.06, 8), 0.25, C3H + 0.17, -2.05);
    P.add('turretDetail', frustum(0.30, 0.18, -0.18, 0.24, 0.14, -0.14, 0, 0.18),
      0.76, C3H + 0.03, -2.52);                                                  // low faceted aft sensor plinth
    P.add('turretDetail', box(0.32, 0.04, 0.08), -0.37, C3H + 0.01, -2.44);      // planted rear lip under the tall left sight
    // hatches + periscopes + whips
    P.add('turret', cylY(0.25, 0.26, 0.10, 14), 0.55, C3H + 0.06, -1.55);        // commander hatch + raised faceted collar
    // Large asymmetric loader station measured directly from the print:
    // x -.982..-.063, world z -.292..+.821, y 2.403..2.581.  Its broad
    // oval/domed footprint is a major close-roof tell that a 44 cm disc lost.
    {
      const loaderHatch = cylY(0.38, 0.42, 0.18, 20);
      loaderHatch.scale(1, 1, 1.30);
      P.add('turret', loaderHatch, -0.52, C3H + 0.09, -1.02);
      const loaderRing = torus(0.40, 0.014, 20);
      loaderRing.scale(1, 1, 1.30);
      P.add('turretDark', loaderRing, -0.52, C3H + 0.055, -1.02);
    }
    P.add('turretDark', torus(0.24, 0.012, 14), 0.55, C3H + 0.045, -1.55);
    P.add('turretDetail', box(0.16, 0.035, 0.055), 0.55, C3H + 0.07, -1.80);     // hinges make both circles read as operable lids
    P.add('turretDetail', box(0.24, 0.035, 0.06), -0.52, C3H + 0.09, -1.55);
    periscope(P, 'turretDetail', 0.55, C3H + 0.06, -1.22);
    periscope(P, 'turretDetail', -0.60, C3H + 0.06, -1.05, -0.3);
    // FINISH r2: whips clustered at the print's own antenna station (its
    // 5.19w spike col sits z_w -1.46; the old -1.75..-1.90 seats cost three
    // 0.42 side cols) — trimmed under the 2.95 sensor datum; x ±0.90 rides
    // the print's front-view antenna columns.
    {
      // a1/a2 are TALL real whips (print's front-view antenna columns read
      // 5.2w at x ±0.9 — the tall pair rides its spike columns; side p95
      // stays on the RWS plateau: only 2 columns above the 2.95 datum,
      // budget <=4, aligned with the ref's own 5.2 spike).
      // uk round (2-pass adjudication): the print's 5.2 antenna spike is a
      // SUB-PIXEL FLICKER — it lit x 0.97 in one trace run and vanished the
      // next (AA-TEETER family: single-run reads are NOT orders). A chase to
      // h 2.75 also lifted the side-row rough so the 12% body filter ate the
      // -4.1 hullLengthM anchor column (dims 99.8 -> 87, the whip-rough
      // coupling now banked). Whips stay at REAL height (the FINISH r2
      // certified fit), a3 co-windowed with a2 so no lone proc column.
      const a1 = FITTINGS.antennaWhip({ mats: P.mats, h: 2.68, rake: 0.0, seed: 7 });
      a1.position.set(-0.90, C3H + 0.02, -2.75);                                 // anti-alias-safe shared source station
      a1.scale.z = 0.45;                                                         // source spike is an 11 mm side-view column
      P.turretG.add(a1);
      const a2 = FITTINGS.antennaWhip({ mats: P.mats, h: 2.68, rake: 0.0, seed: 8 });
      a2.position.set(0.92, C3H + 0.02, -2.75);
      a2.scale.z = 0.45;
      P.turretG.add(a2);
    }
    // smoke: 2x5 low banks on the flanks (print smoke a-j) + ch1 r10b tube
    // tips + bores (circular mouths at 1x). The shared smokeCluster helper is
    // tubes-only; explicit armored backing shoes close the visible air seam
    // and carry every tube bank into the turret shoulder.
    for (const s of [-1, 1]) {
      P.add('turretDetail', box(0.40, 0.20, 0.10), s * 1.10, 0.27, 0.48,
        -0.22, s * 0.85, 0);
    }
    smokeCluster(P, 1.10, 0.30, 0.55, 5, 0.85, 0.7);
  };
  buildChallenger3TurretStage2();
  yield 'buildChallenger3TurretStage2';
  const buildChallenger3MarkingsStage1 = (): void => {
    smokeCluster(P, -1.10, 0.30, 0.55, 5, -0.85, 0.7);
    smokeTubeTips(P, [[1.10, 0.30, 0.55, 0.85, 0.7], [-1.10, 0.30, 0.55, -0.85, 0.7]]);
    // bustle rack on the stepped tail face (§B3.2; FINISH r2: compacted to
    // the print's -2.13w turret tail — the old -3.62 rails read as 3
    // only-proc cover columns on the turret side row)
    {
      const bkT = 0.64, bkB = 0.36, bkZ = -3.31;                                  // lower rail follows the terminal underside rise
      P.add('turretDetail', box(2.40, 0.05, 0.05), 0, bkT, bkZ);                  // clear of the -2.23w column window — AA-sliver law, 2nd pass)
      P.add('turretDetail', box(2.40, 0.05, 0.05), 0, bkB, bkZ);
      for (let k = 0; k < 11; k++) P.add('turretDetail', box(0.035, bkT - bkB, 0.035), -1.15 + k * 0.23, (bkT + bkB) / 2, bkZ);
      P.add('turretDark', openRackGrid(2.30, 0.30, 0.016, 4, 11),
        0, (bkT + bkB) / 2, -3.315, Math.PI / 2, 0, 0);                          // open mesh back panel
      // ch1-base rail-over-mesh read (r10 O5a): pale rail pair drawn over the
      // dark mesh panel (same envelope — the rails sit 2 mm proud of the mesh
      // inside the -3.335 certified extreme).
      for (const ry of [0.32, 0.50]) P.add('turretDetail', box(2.28, 0.018, 0.008), 0, ry, -3.319);
    }
    liftEye(P, 'turretDetail', -1.15, C3H + 0.03, 0.15);
    liftEye(P, 'turretDetail', 1.15, C3H + 0.03, -1.9);
    // ---- gun: 120 mm L55A1 SMOOTHBORE — evacuator at the Rh-120 station,
    // thermal sleeve, MRS collar, §B3.1 muzzle bore (shadow-named).
    // Muzzle +7.335 world = 11.50 overall (pivot world z 1.75).
    // FINISH r2 (§B3.1 MANTLETS-MANDATORY + owner order "distinctive
    // flat-faced mantlet"): a real flat-faced armored mantlet block at the
    // turret face (proud of the embrasure, pitches with the gun) + the
    // print's FAT root thermal sleeve (its plan gun columns run r~0.185 to
    // z_w 3.59) with clamp + step-down rings.
    P.addGunExtra(box(0.40, 0.30, 0.55), 0, 0.36, 0.45);                         // sight barbette over the gun
    P.addGunExtra(box(0.56, 0.34, 0.28), 0, 0.02, 0.62);                         // source-measured 310 mm vertical mantlet section
    P.addGunExtraDark(box(0.58, 0.05, 0.26), 0, -0.16, 0.62);                    // mantlet chin shadow seam
    P.addGunExtra(cylZ(0.145, 0.30, P.q ? 20 : 12, 0.165), 0, 0, 0.86);          // boot collar ahead of the block
    P.addGunExtraDark(cylZ(0.150, 0.05, P.q ? 20 : 12), 0, 0, 0.78);             // boot seam
    {
      const rootSleeve = cylZ(0.185, 0.95, P.q ? 20 : 12);                       // source plan width stays 370 mm
      rootSleeve.scale(1, 0.62, 1);                                               // oval thermal jacket: measured side height 230 mm
      P.addGunExtra(rootSleeve, 0, 0, 1.32);
    }
    {
      const clampRing = cylZ(0.192, 0.05, P.q ? 20 : 12);
      clampRing.scale(1, 0.62, 1);                                               // jacket clamp follows the 370x230 mm oval section
      P.addGunExtra(clampRing, 0, 0, 1.10);
    }
    P.addGunExtra(cylZ(0.130, 0.06, P.q ? 20 : 12), 0, 0, 1.82);                 // step-down ring
    buildGun(P, { len: 5.585, r: 0.065, sleeve: true, evac: 0.29, collar: true, baseR: 0.15 });
    muzzleBore(P, { len: 5.585, r: 0.065 });                                     // measured two-pixel L55A1 side band; §B3.1 bore
    // ch1-base STERN KIT (r10 O5b grammar, CR3 fit): draped cable + cleats
    // across the concave center plate; the cable follows the actual notch
    // instead of bridging it with a false straight rear silhouette.
    KIT.towCable(P, [[-0.58, 1.30, -3.92], [-0.25, 1.23, -3.90], [-0.24, 1.22, -3.78],
      [0, 1.21, -3.78], [0.24, 1.22, -3.78], [0.25, 1.23, -3.90], [0.58, 1.30, -3.92]]);
    for (const s of [-1, 1]) P.add('hullDetail', box(0.08, 0.08, 0.045), s * 0.58, 1.315, -3.90);
    // Registered stern views retain the recessed grille field above, but the
    // source also has round end-on service/fuel modules and their guards at
    // the outer shoulders.  Add that layering around—not across—the bays.
    for (const s of [-1, 1]) {
      // Layer these inside the certified rear body course: placing the guards
      // on the -4.02 m datum turned a thin detail into a false hull-depth
      // column.  They remain visible over the outer service panels without
      // changing the rear envelope.
      P.add('hullDetail', cylZ(0.075, 0.10, 12), s * 1.12, 1.43, -3.80);
      P.add('hullDark', torus(0.085, 0.010, 12), s * 1.12, 1.43, -3.855, Math.PI / 2, 0, 0);
      P.add('hullDetail', box(0.22, 0.025, 0.025), s * 1.12, 1.53, -3.84);
      for (const sx of [-1, 1]) P.add('hullDetail', box(0.025, 0.18, 0.025), s * 1.12 + sx * 0.10, 1.43, -3.84);
    }
    // ch1-base family tone kit + gear-air backers (r8/r9 recipes; family
    // resemblance with challenger1_mk2 + challenger2). Backer wall spans the
    // SKIRTED bays only (the rear run is honestly naked per the print).
    ch1BaseToneKit(P, { cloth: 0x262b1d, clothEnv: 0.05, dark: 0x282c22 });
    ch1BaseGearBackers(P, [
      [0.016, 0.32, 3.60, 0.790, 0.44, 0.85],                                    // inter-wheel shadow wall remains inside the scaled shoe lane
      [0.46, 0.42, 0.02, 0.75, 0.49, 2.095],                                     // catch plates remain behind the wheels, inside the live shoe lane
      [0.46, 0.42, 0.02, 0.75, 0.49, 1.185],
      [0.46, 0.42, 0.02, 0.75, 0.49, 0.275],
    ]);
    if (P.spec.id === 'challenger3') buildChallenger3XPackage(P);
    P.hullG.userData.challenger3HullClosureReceipt = {
      upperGlacisSeam: {
        innerX: 1.60,
        outerX: 1.70,
        frontZ: 3.60,
        rearZ: 2.30,
        mirrors: 2,
      },
      skirtCarriers: [
        { x: 1.635, z: 1.80, depth: 1.00, width: 0.10 },
        { x: 1.6475, z: 0.6375, depth: 0.885, width: 0.145 },
        { x: 1.6475, z: -0.40, depth: 1.11, width: 0.145 },
      ],
      hangerStations: [2.75, 2.28, 1.80, 1.30, 0.88, 0.40, -0.10, -0.68],
      scallopNeckStations: [2.10, 1.19, 0.28],
      previousShadowProxyLengthM: 7.0,
      longShadowProxyRemoved: true,
      visibleSkirtFacesMoved: false,
    };
    // decals: squadron number + ZAP plate
    P.decal('turret', 'number', P.spec.visual.number || '30', 0.34, [1.42, 0.40, -1.4], Math.PI / 2, 0, 0.06);
    P.decal('turret', 'number', P.spec.visual.number || '30', 0.34, [-1.42, 0.40, -1.4], -Math.PI / 2, 0, -0.06);
    P.decal('hull', 'number', 'KC93AB', 0.32, [0.80, 1.26, 3.32], 0, -1.27);
    // soot PINNED on the recessed center plate face (§C: decals are mask
    // geometry — never floated mid-air)
    P.decal('hull', 'soot', null, 0.42, [-0.45, 1.10, -3.962], Math.PI);
    P.topY = 1.05;
    if(P.spec.id==='challenger3')addModernFieldCage(P);
    scaleChallenger3Family(P);
  };
  buildChallenger3MarkingsStage1();
}
function buildChallenger3(...args: Parameters<typeof buildChallenger3Steps>): void {
  drainTankBuild(buildChallenger3Steps(...args));
}
withBuildSteps(buildChallenger3, buildChallenger3Steps);
/** Builder table merged into tankFactory.BUILDERS by the extension hook. */
export const CHALLENGER_BUILDERS = {
  fv4034: buildChallenger2,
  challenger2: buildChallenger2,
  challenger2e: buildChallenger2,
  ua_challenger2: buildChallenger2,
  challenger3_proto: buildChallenger3,
  challenger3: buildChallenger3,
  // release 262: the 2021 Advanced Technology Demonstrator, its own measured build on the full port
  challenger3_td: buildChallenger3Td as unknown as (builder: ChallengerBuilderPort) => void,
  challenger3_td_rws: buildChallenger3Td as unknown as (builder: ChallengerBuilderPort) => void,
} satisfies Record<string, (builder: ChallengerBuilderPort) => void>;
