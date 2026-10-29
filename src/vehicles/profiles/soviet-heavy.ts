// Soviet heavy / breakthrough family procedural profiles (fidelity oracles:
// recovered IS-3/IS-7/Object 279/IS-6B/KV-2 GLBs). Owned by the
// Soviet-heavy family agent.
//
// Fully custom constructions (profile.build) replacing the generic kit
// profiles: every dimension below comes from the width-normalized silhouette
// probes of the local reference GLBs + the real-vehicle packets in
// docs/references/tanks/<id>.md. Original primitive reconstructions only —
// no source mesh data.
//
// r2 (shaded-parity r1, the archived visual-review receipt): surface pass on
// all six tanks — sealed convex saddle mantlets (family critical: the square
// socket collars opened voids at full depression), reading muzzle brakes on
// is3/is6b, dark-metal AA MGs, rivet/stud rows, fittings, and material
// separation through the now-mask-safe detail buckets. is3_bergman rebuilt
// with the true proud IS-3 dome (identity over its degenerate oracle).
//
// r4 (2026-07-31, measured-profile pass against docs/references/profiles/):
// is3 crossed the 90 gate (DShK cluster re-seated 0.5 m aft per the measured
// band, cupola to the measured -1.1..-1.4, D-25T brake rebuilt to the
// measured swell/muzzle 5.666, corner flaps opened, high sprocket/idler
// seats); is7 gained the second rear lathe the curves demanded (the casting
// keeps near-full width aft) + measured cheek eyes; is3_bergman inherits the
// is3 pass. object279/is6b/kv2 untouched and re-verified >= 90. sovGear grew
// optional sprocketY/R + idlerY/R overrides (defaults unchanged).
//
// r3 (shaded-parity r2): the r2 "reading muzzle brakes" claim measurably
// existed but did NOT read — held to the oracle blob diameters with hairline
// rings, the devices scored as bare tubes again. Brakes rebuilt as real
// silhouette features (baffle discs >=1.6x tube radius, punched dark side
// windows/slots, dark rings on every disc face) on is3/is3_bergman/is6b and
// a readable multi-slot sleeve on object279; the invented is7 pike chevron
// (yawed cheek-plate corner piercing the wedge) + floating weld-bead rod
// deleted via pikeNose opt-outs.
//
// FRAME NOTE: the snowleopard GLBs (is7 / object279 / is6b) fuse the gun into
// the turret mesh, so the loader normalizes them on the FULL bounding box —
// in world space their hulls sit rear-shifted (whole bbox centred). Each
// build below replicates its oracle's frame (zc = hull centre) so the
// raw-frame cannon-overhang metric and the in-game silhouette both line up
// with what the local reference renders.
//
// WIDTH GUARD: the probes width-normalize. Nothing added in r2 may exceed
// each build's committed max width (is7 anchor 3.379, is3 drums 3.15,
// object279 flare 3.39, is6b 3.20, kv2 fenders 3.31) or the whole model
// rescales and every mask shifts.
// §5.247 kv2 wave: FITTINGS (census-stamped decoration library) + the
// shadow-named muzzleBore device — timing-proof top-level spellings per the
// kit.js cycle law.
import { KIT, FITTINGS, muzzleBore } from './kit.ts';
import { withSpareTrackRun } from '../spareTrackSeat.ts';
import { spareLinkBlock } from '../spareLinkGeometry.ts';
import { sectionSolid } from './sectionSolid.ts';
import { beamBetween } from './measuredPrimitives.ts';
import type * as THREE from 'three';
// kv2 shaded-parity r4 tell 1 (r5 round): the WoT-style readability floor is
// what keeps shade-side hardware in the ref's tonal family — but the link
// pad/inner materials are CLONES made inside buildRunningGear, and
// Material.clone() does not carry onBeforeCompile, so they render floorless
// (near-black) on every shade side while the hooked paint floats at ~57.
// The kv2 build re-attaches the exported hook to its own per-build clones.
// 2026-10-17 (the wheel-band lane, round 2): through materials.ts
// (cloneRehookedVehicleMaterial, cloneFloorlessVehicleMaterial), which give each
// clone its own cascade registration — the plain assignment drew them untagged
// (the ground occlusion's band under the belly line) and outside the cascades.
import { cloneFloorlessVehicleMaterial, cloneRehookedVehicleMaterial, rehookVehicleMaterial } from '../materials.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';

type Vec3Tuple = [number, number, number];
type VehicleAssemblyOwner = 'hull' | 'turret';

interface SovietHeavyMaterials extends Record<string, THREE.MeshStandardMaterial> {
  dark: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  spareTrack: THREE.MeshStandardMaterial;
  trackL: THREE.MeshStandardMaterial;
  trackR: THREE.MeshStandardMaterial;
  wheels: THREE.MeshStandardMaterial;
}

interface SovietHeavyBuilderPort {
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly mats: SovietHeavyMaterials;
  readonly q?: boolean;
  readonly spec: { visual: { number?: string } };
  readonly disposables: THREE.Material[];
  topY?: number;
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addEquipment(owner: VehicleAssemblyOwner, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  decal(
    owner: VehicleAssemblyOwner,
    kind: string,
    label: string | null,
    scale: number,
    position: Vec3Tuple,
    ...orientation: number[]
  ): void;
}

interface SovietGearOptions {
  wheels: number;
  zc: number;
  span: number;
  trackW: number;
  wheelR: number;
  wheelY: number;
  xc: number;
  topY: number;
  style?: string;
  yLift?: number;
  sprocketDz?: number;
  sprocketY?: number;
  sprocketR?: number;
  idlerDz?: number;
  idlerY?: number;
  idlerR?: number;
  rollers?: readonly { z: number; y: number; r: number }[];
  rollerR?: number;
  returnRollerWidthM?: number;
  botY?: number;
  corridorOwned?: boolean;
}

interface RunningGearPort {
  addRoadWheelLayer(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    options?: { name?: string; outset?: number; appearanceRole?: string },
  ): void;
}

interface MaterialSceneObject extends THREE.Object3D {
  readonly isMesh?: boolean;
  readonly isInstancedMesh?: boolean;
  material?: THREE.MeshStandardMaterial;
  geometry?: THREE.BufferGeometry;
}

// ---------------------------------------------------------------------------
// Family machinery
// ---------------------------------------------------------------------------

// IS running gear: big steel wheels low on the hull, rear sprocket, no
// return-roller gap (KV passes explicit rollers).
function sovGear(P: SovietHeavyBuilderPort, g: SovietGearOptions): RunningGearPort {
  const { buildRunningGear, cylX } = KIT;
  const wheelZs = Array.from({ length: g.wheels }, (_, i) =>
    g.zc + g.span / 2 - i * (g.span / (g.wheels - 1)));
  const wheelW = Math.min(0.24, g.trackW * 0.42);
  const lift = g.yLift ?? 0;              // 279 inner pair rides high: its
                                          // oracle keeps the centre-bottom
                                          // clear between the corner tracks
  const gear = buildRunningGear(P, {
    // kv2 shaded-parity r3 (tell2 "stamped discs"): optional style override.
    // 'holes' carries its 6 big dark pocket voids in the same instanced list
    // as the dish, so the pockets SPIN+BOB with the wheel — the only
    // kit-supported way to deep spoke pockets without a static-overlay
    // rotation artifact. Default stays 'steel' (other family ids unchanged).
    style: g.style ?? 'steel', wheelR: g.wheelR, wheelW,
    wheelY: g.wheelY + lift, xc: g.xc, wheelZs,
    // v10: sprocketDz/idlerDz overrides — the KV oracle runs a high SMALL
    // idler close to the last wheel (short ground run), which the default
    // 0.44 end-wheel offset cannot express.
    sprocket: { z: g.zc - g.span / 2 - (g.sprocketDz ?? 0.44), y: g.sprocketY ?? (lift + g.wheelR + 0.10), r: g.sprocketR ?? g.wheelR * 0.92 },
    idler: { z: g.zc + g.span / 2 + (g.idlerDz ?? 0.44), y: g.idlerY ?? (lift + g.wheelR + 0.06), r: g.idlerR ?? g.wheelR * 0.84 },
    rollers: g.rollers || [], trackW: g.trackW, topY: g.topY,
    ...(g.rollerR ? { rollerR: g.rollerR } : {}),
    ...(g.returnRollerWidthM ? { returnRollerWidthM: g.returnRollerWidthM } : {}),
    botY: (g.botY ?? 0.10) + lift,        // track run above the wheel bottoms:
    arms: true,                           // the oracles show wheel scallops
    ...(g.corridorOwned ? { armBucket: 'hullRunningGearDetail' } : {}),
  });
  // shaded-parity r1 (family WT 3 — "flat discs in shadow"): the bespoke
  // steel wheels merged every face feature into one painted material. A dark
  // recess field sits BEHIND the painted rim ring / spoke ribs / hub drum /
  // bolt ring (all of which stand proud of it), so hubs and rims read out of
  // the wheel-bay shadow under any camo. These are native running-gear
  // members, so the dedicated buckets keep the hull-corridor census truthful.
  gear.addRoadWheelLayer(cylX(g.wheelR * 0.72, wheelW * 1.06, 12), P.mats.dark, {
    name: 'gearRoadWheelRecesses', appearanceRole: 'wheelInset', // a dark recess field, not a painted face (runningGearFinish.ts)
  });
  return gear;
}

// ---------------------------------------------------------------------------
// KV-2 — docs/references/tanks/kv2.md (release 262 historical rebuild)
// The owner (2026-10-27): "update/redesign ... turrets and hullls as well based on proper historical referrences so they
// will no longer look so chungus". The print-fitted build (a full-width 2.9 m deck slab at 1.60 m with deck-level
// fenders, a disc-and-box mantlet) gives way to the measured vehicle; the packet's gap table carries every number.
// World metres, ground y = 0, bow +z, tank left +x. The welded KV-1 hull is a 1.85 m box from the 0.43 belly to the
// 1.65 roof, 6.675 m from nose to tail, with fender shelves 0.28 m under the roof over 0.70 m tracks. The 1941
// production turret stands on the 1.535 m ring at z 0.32: 1.94 wide, 2.75 long, roof 3.24, its rear 0.7 m overhanging
// the engine deck at 1.91 over a square step. The M-10T trunnion sits 0.10 m behind the front plate, (0, 2.67, 1.27),
// the 1.06 m cradle drum's top level with the roof; its muzzle 3.47, 0.17 m past the nose (6.85 m overall: S1's table
// says 6.95, the drawing and the photographs 0.1-0.2 m of muzzle past the bow).
// ---------------------------------------------------------------------------
const KV2 = Object.freeze({
  halfW: 0.925, belly: 0.43, roof: 1.65, nose: 3.30, tail: -3.375,
  // bow plates (S1): driver's plate 30° from vertical, glacis 70° (20° over the horizontal), lower plate 25°
  // (S4 front: a tall driver's plate carrying the vision block and the ball, a short glacis strip, a tall lower plate)
  driverTopZ: 2.36, driverFootZ: 2.649, driverFootY: 1.15, glacisEndZ: 3.27, glacisEndY: 0.94,
  noseTopY: 0.93, noseFootY: 0.89, lowerFootZ: 3.085,
  // stern (S1, S4 rear, S6): the deck rolls over into the rear plate, which curves under to the belly
  tailTopR: 0.42, tailKneeY: 1.03, tailR: 0.60,
  fenderY: 1.37, fenderTh: 0.022, fenderOuter: 1.66, fenderFrontZ: 2.30, fenderRearZ: -3.34,
  mudguardTipZ: 3.24, mudguardTipY: 1.18,
  // turret, local to the ring (world 0, 1.67, 0.32)
  ringZ: 0.32, ringY: 1.67, tHalfW: 0.97, tFront: 1.05, tRear: -1.70, tRoof: 1.57, tFloor: 0.02, tSoffit: 0.24,
  tSoffitZ: -0.93, tStepZ: -0.92, cheekZ: 0.93, cheekHalfW: 0.85, chamferZ: 0.97, frontTopY: 1.54,
  // M-10T: the trunnion 0.10 m behind the front plate, turret-local; the drum's top level with the roof
  trunnionY: 1.00, trunnionZ: 0.95, drumR: 0.53,
});

type KvPoint = readonly [number, number, number];

/** The hull's side profile (S1 plates): its belly and its top line at a station. */
function kv2HullProfile(z: number): [bottom: number, top: number] {
  const K = KV2;
  const lerp = (z0: number, y0: number, z1: number, y1: number): number => y0 + (y1 - y0) * (z - z0) / (z1 - z0);
  const kneeZ = K.tail + K.tailR, shoulderZ = K.tail + K.tailTopR;
  const bottom = z < kneeZ ? K.tailKneeY - Math.sqrt(Math.max(0, K.tailR ** 2 - (z - kneeZ) ** 2))
    : z <= K.lowerFootZ ? K.belly : lerp(K.lowerFootZ, K.belly, K.nose, K.noseFootY);
  const top = z < shoulderZ ? K.roof - K.tailTopR + Math.sqrt(Math.max(0, K.tailTopR ** 2 - (z - shoulderZ) ** 2))
    : z <= K.driverTopZ ? K.roof
    : z <= K.driverFootZ ? lerp(K.driverTopZ, K.roof, K.driverFootZ, K.driverFootY)
    : z <= K.glacisEndZ ? lerp(K.driverFootZ, K.driverFootY, K.glacisEndZ, K.glacisEndY)
    : lerp(K.glacisEndZ, K.glacisEndY, K.nose, K.noseTopY);
  return [bottom, top];
}

/** A flat plate of thickness `th` under the side-profile line a → b (z, y), spanning x0..x1 (x0 < x1). */
function kv2Plate(xa: number, xb: number, a: readonly [number, number], b: readonly [number, number], th: number): THREE.BufferGeometry {
  const [front, rear] = a[0] > b[0] ? [a, b] : [b, a];
  return KIT.slab(
    [xa, front[1] - th, front[0]], [xb, front[1] - th, front[0]], [xb, rear[1] - th, rear[0]], [xa, rear[1] - th, rear[0]],
    [xa, front[1], front[0]], [xb, front[1], front[0]], [xb, rear[1], rear[0]], [xa, rear[1], rear[0]]);
}

/** A weld bead along a plate joint: a thin round bar, its ends sunk in the plates. */
function kv2Weld(P: SovietHeavyBuilderPort, slot: string, a: KvPoint, b: KvPoint, r = 0.011): void {
  P.add(slot, beamBetween(a, b, r, 6));
}

function addKV2Hull(P: SovietHeavyBuilderPort): void {
  const K = KV2;
  // One welded box (S1: 75 mm sides from belly to roof): the stations are every corner of the bow and stern plates,
  // the stern's curved lower plate in 15° steps.
  const zs = new Set([K.tail, K.tail + K.tailTopR, K.tail + K.tailR, K.driverTopZ, K.driverFootZ, K.lowerFootZ, K.glacisEndZ, K.nose]);
  for (let deg = 195; deg < 270; deg += 15) {
    zs.add(K.tail + K.tailR + K.tailR * Math.cos(deg * Math.PI / 180));
    zs.add(K.tail + K.tailTopR + K.tailTopR * Math.cos(deg * Math.PI / 180));
  }
  const sections = [...zs].sort((a, b) => a - b).map((z) => {
    const [b, t] = kv2HullProfile(z);
    return { z, ring: [[-K.halfW, b], [K.halfW, b], [K.halfW, t], [-K.halfW, t]] as [number, number][] };
  });
  P.add('hull', sectionSolid(sections));
  // weld beads on every plate joint the eye follows: roof and deck edges, both edges of the driver's plate, the
  // glacis' sides and nose, the stern's upper plate
  for (const s of [-1, 1]) {
    const x = s * (K.halfW - 0.004);
    kv2Weld(P, 'hullDetail', [x, K.roof, K.tail + K.tailTopR], [x, K.roof, K.driverTopZ]);
    kv2Weld(P, 'hullDetail', [x, K.roof, K.driverTopZ], [x, K.driverFootY, K.driverFootZ]);
    kv2Weld(P, 'hullDetail', [x, K.driverFootY, K.driverFootZ], [x, K.glacisEndY, K.glacisEndZ]);
    kv2Weld(P, 'hullDetail', [x, K.noseFootY, K.nose], [x, K.belly, K.lowerFootZ]);
  }
  kv2Weld(P, 'hullDetail', [-K.halfW, K.roof, K.driverTopZ], [K.halfW, K.roof, K.driverTopZ]);
  kv2Weld(P, 'hullDetail', [-K.halfW, K.driverFootY, K.driverFootZ], [K.halfW, K.driverFootY, K.driverFootZ]);
  kv2Weld(P, 'hullDetail', [-K.halfW, K.noseTopY, K.nose - 0.004], [K.halfW, K.noseTopY, K.nose - 0.004], 0.014);
  // the deck plate's transverse joints behind the turret and the roof plate's ahead of it (bolted, S3 plan)
  for (const z of [-0.84, -2.18, 1.95]) {
    P.add('hullDark', KIT.box(1.80, 0.006, 0.012), 0, K.roof + 0.003, z);
    for (let k = 0; k < 9; k++) P.add('hullDetail', KIT.cylY(0.017, 0.017, 0.014, 6), -0.80 + k * 0.20, K.roof + 0.007, z + 0.035);
  }
}

function addKV2Fenders(P: SovietHeavyBuilderPort): void {
  const K = KV2, { box } = KIT;
  const xi = K.halfW, xo = K.fenderOuter, w = xo - xi;
  for (const s of [-1, 1]) {
    const [xa, xb] = s > 0 ? [xi, xo] : [-xo, -xi], xm = s * (xi + w / 2);
    // the shelf (S3/S4: 0.28 m under the roof line), the sloped front mudguard over the idler and its inner cheek plate
    // down to the glacis' edge, so no opening reads from the front between the mudguard and the bow
    P.add('hull', box(w, K.fenderTh, K.fenderFrontZ - K.fenderRearZ), xm, K.fenderY - K.fenderTh / 2, (K.fenderFrontZ + K.fenderRearZ) / 2);
    P.add('hull', kv2Plate(xa, xb, [K.fenderFrontZ, K.fenderY], [K.mudguardTipZ, K.mudguardTipY], K.fenderTh));
    const cheekX = s * (K.halfW + 0.010), glacis = (z: number): number => kv2HullProfile(z)[1];
    const zA = K.driverFootZ - 0.02, zB = K.mudguardTipZ - 0.02;
    const guard = (z: number): number => z <= K.fenderFrontZ ? K.fenderY - K.fenderTh
      : K.fenderY - K.fenderTh + (K.mudguardTipY - K.fenderY) * (z - K.fenderFrontZ) / (K.mudguardTipZ - K.fenderFrontZ);
    P.add('hull', KIT.slab(
      [cheekX - 0.01, glacis(zB) - 0.03, zB], [cheekX + 0.01, glacis(zB) - 0.03, zB], [cheekX + 0.01, glacis(zA) - 0.03, zA], [cheekX - 0.01, glacis(zA) - 0.03, zA],
      [cheekX - 0.01, guard(zB), zB], [cheekX + 0.01, guard(zB), zB], [cheekX + 0.01, guard(zA), zA], [cheekX - 0.01, guard(zA), zA]));
    // the folded outer lip along the shelf and the mudguard (a 40 mm turned-down edge)
    P.add('hullDetail', box(0.012, 0.040, K.fenderFrontZ - K.fenderRearZ), s * (xo - 0.006), K.fenderY - 0.030, (K.fenderFrontZ + K.fenderRearZ) / 2);
    P.add('hullDetail', kv2Plate(s > 0 ? xo - 0.012 : -xo, s > 0 ? xo : -xo + 0.012,
      [K.fenderFrontZ, K.fenderY - 0.010], [K.mudguardTipZ, K.mudguardTipY - 0.010], 0.040));
    // the shelf's triangular frames against the hull side (S4: four a side, upright leg forward, flat bar)
    // angle-iron triangles standing 40 mm off the wall on the shelf, the upright leg forward (S4)
    const fx = s * (K.halfW + 0.035);
    for (const z0 of [1.70, 0.45, -0.85, -2.10]) {
      const z1 = z0 - 0.56, top = K.roof - 0.02, foot = K.fenderY, h = top - foot, d = Math.hypot(h, z0 - z1);
      P.add('hullDetail', box(0.045, h, 0.05), fx, foot + h / 2, z0 - 0.025);
      P.add('hullDetail', box(0.045, 0.014, z0 - z1), fx, foot + 0.007, (z0 + z1) / 2);
      P.add('hullDetail', box(0.045, 0.05, d), fx, foot + h / 2, (z0 + z1) / 2, -Math.atan2(h, z0 - z1), 0, 0);
      P.add('hullDetail', box(0.035, 0.035, 0.02), s * (K.halfW + 0.0175), top - 0.02, z0 - 0.025);     // wall cleat
    }
    // the mudguard's turned-down front flap
    P.add('hull', box(w, 0.12, K.fenderTh), xm, K.mudguardTipY - 0.06, K.mudguardTipZ - K.fenderTh / 2);
    // shelf joints and the rows of bolts that hold it to the hull side
    for (const z of [-1.90, 0.10, 1.50]) P.add('hullDark', box(w - 0.02, 0.004, 0.010), xm, K.fenderY + 0.001, z);
    for (let k = 0; k < 14; k++) P.add('hullDetail', KIT.cylY(0.014, 0.014, 0.012, 6), s * (xi + 0.035), K.fenderY + 0.004, -3.20 + k * 0.40);
  }
  // S5 (the Lida and D 50/5 photographs): a long stowage box on each rear fender
  for (const s of [-1, 1]) {
    const bx = s * 1.39, bz = -2.30, bl = 1.50, bw = 0.42, bh = 0.27;
    P.add('hull', box(bw, bh, bl), bx, K.fenderY + bh / 2, bz);
    P.add('hullDetail', box(bw + 0.024, 0.018, bl + 0.024), bx, K.fenderY + bh + 0.006, bz);              // lid
    P.add('hullDark', box(bw + 0.026, 0.006, bl + 0.026), bx, K.fenderY + bh - 0.004, bz);                 // lid seam
    for (const dz of [-0.45, 0.45]) {
      P.add('hullDark', box(0.016, 0.07, 0.05), s * (1.39 + bw / 2 + 0.008), K.fenderY + bh - 0.05, bz + dz); // hasps
      P.add('hullDark', box(bw + 0.03, 0.03, 0.012), bx, K.fenderY + bh - 0.11, bz + dz);                    // straps
    }
  }
  // the crew's kit (KV-1/KV-2 period stowage): a shovel and an axe on the left fender ahead of the box, a screw jack
  // and its block on the right
  KIT.shovelTool(P, 1.33, K.fenderY + 0.012, -0.95, 0.90);
  P.add('hullWood', box(0.030, 0.026, 0.78), 1.52, K.fenderY + 0.016, -0.35);                              // axe haft
  P.add('hullDark', box(0.06, 0.03, 0.15), 1.52, K.fenderY + 0.020, 0.04);                                 // axe head
  for (const z of [-0.60, -0.15]) P.add('hullDark', box(0.10, 0.012, 0.024), 1.52, K.fenderY + 0.034, z);   // clamps
  P.add('hullDetail', box(0.14, 0.12, 0.22), -1.30, K.fenderY + 0.06, -0.95);                              // jack body
  P.add('hullDark', KIT.cylY(0.022, 0.022, 0.09, 8), -1.30, K.fenderY + 0.165, -0.95);                     // jack screw
  P.add('hullWood', box(0.24, 0.10, 0.28), -1.30, K.fenderY + 0.05, -0.55);                                // jack block
  for (const x of [-1.37, -1.23]) P.add('hullDark', box(0.014, 0.135, 0.03), x, K.fenderY + 0.06, -0.95);  // jack straps
}

function addKV2HullFittings(P: SovietHeavyBuilderPort): void {
  const K = KV2, { box, cylX, cylY, cylZ, sph } = KIT;
  // the driver's plate (30° from vertical): its outward normal leans 30° up from +z
  const dp = (x: number, y: number, out = 0): KvPoint => {
    const z = K.driverTopZ + (K.roof - y) * Math.tan(Math.PI / 6);
    return [x, y + out * 0.5, z + out * Math.cos(Math.PI / 6)];
  };
  const tilt = -Math.PI / 6;
  // driver's armoured vision block on the centre line (S4), its visor and slit
  {
    const [x, y, z] = dp(0, 1.43, 0.04);
    P.add('hullDetail', box(0.34, 0.15, 0.08), x, y, z, tilt, 0, 0);
    P.add('hullDetail', box(0.30, 0.05, 0.03), x, y + 0.05, z + 0.045, tilt, 0, 0);
    P.add('hullDark', box(0.20, 0.022, 0.02), x, y - 0.012, z + 0.042, tilt, 0, 0);
    for (const dx of [-0.13, 0.13]) P.add('hullDark', cylZ(0.012, 0.02, 6), dx, y + 0.045, z + 0.042, tilt, 0, 0);
  }
  // the bow DT in its ball on the tank's left (S4), the headlight on its right
  {
    const [x, y, z] = dp(0.42, 1.38, 0.0);
    P.add('hullDetail', KIT.xform(cylZ(0.135, 0.05, 16), 0, 0, 0.02), x, y, z, tilt, 0, 0);                // armoured collar
    P.add('hull', sph(0.105, 14), x, y + 0.03, z + 0.05);                                                     // ball
    P.add('hullDark', KIT.xform(cylZ(0.016, 0.20, 8), 0, 0, 0.17), x, y + 0.03, z + 0.05, tilt * 0.3, 0, 0); // DT barrel
    P.add('hullDark', KIT.xform(cylZ(0.034, 0.04, 8), 0, 0, 0.10), x, y + 0.03, z + 0.05, tilt * 0.3, 0, 0); // ball aperture
  }
  {
    const [x, y, z] = dp(-0.66, 1.60, 0.02);
    P.add('hullDetail', box(0.05, 0.12, 0.05), x, y + 0.04, z);                                              // bracket
    KIT.headlight(P, x, y + 0.13, z + 0.04, 0, 0.075);
    P.add('hullDetail', box(0.18, 0.012, 0.02), x, y + 0.215, z + 0.10);                                     // guard bar
  }
  // driver's periscopes and the radio operator's round hatch on the roof ahead of the turret (kept flush: the turret's
  // floor sweeps over them)
  for (const x of [-0.18, 0.18]) {
    P.add('hullDetail', box(0.16, 0.035, 0.12), x, K.roof + 0.0175, 2.20);
    P.add('hullGlass', box(0.12, 0.010, 0.012), x, K.roof + 0.025, 2.265);
  }
  P.add('hullDark', cylY(0.25, 0.25, 0.006, 20), 0.42, K.roof + 0.002, 1.80);                             // hatch seam
  P.add('hullDetail', cylY(0.23, 0.23, 0.012, 20), 0.42, K.roof + 0.006, 1.80);                           // hatch lid
  P.add('hullDetail', box(0.10, 0.012, 0.05), 0.42, K.roof + 0.008, 1.54);                                // hinge
  // the 71-TK-3's whip on the driver's plate's left edge, 2.27 m off the ring's axis: outside the shield box's sweep
  // and the rear overhang's (1.96 m), its tip 0.11 m under the tube laid at -5 degrees over it
  {
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 0.70, r: 0.011, rake: 0.07, seed: 4 });
    whip.position.set(0.80, kv2HullProfile(2.45)[1], 2.45);
    P.hullG.add(whip);
  }
  // the nose: bolt row along the lower plate's top edge and the two towing eyes (S4 front)
  const lp = (y: number): number => K.lowerFootZ + (y - K.belly) * (K.nose - K.lowerFootZ) / (K.noseFootY - K.belly);
  const lowerTilt = Math.atan2(K.nose - K.lowerFootZ, K.noseFootY - K.belly);
  for (let k = 0; k < 11; k++) P.add('hullDetail', KIT.xform(cylZ(0.020, 0.016, 6), 0, 0, 0.008), -0.80 + k * 0.16, 0.835, lp(0.835), lowerTilt, 0, 0);
  for (const s of [-1, 1]) {
    const y = 0.64, z = lp(y);
    P.add('hullDetail', KIT.xform(box(0.16, 0.20, 0.06), 0, 0, 0.03), s * 0.55, y, z, lowerTilt, 0, 0);
    P.add('hullDark', KIT.xform(cylX(0.034, 0.17, 8), 0, -0.02, 0.06), s * 0.55, y, z, lowerTilt, 0, 0);
  }
  // spare track links flat on the right front fender (VEH-13: one registered run)
  withSpareTrackRun(P, { site: 'kv-fender-links', source: 'adhoc', rotation: [0, 0, 0] }, (port) => {
    for (const zc of [0.70, 0.86]) port.add('hullTrack', spareLinkBlock(0.5, 0.045, 0.15), -1.33, K.fenderY + 0.0225, zc);
  });
}

function addKV2EngineDeck(P: SovietHeavyBuilderPort): void {
  const K = KV2, { box, cylX, cylY, cylZ } = KIT;
  const y = K.roof;
  // engine access plate (bolted, S3 plan) right behind the turret
  P.add('hullDetail', box(0.90, 0.022, 0.60), 0, y + 0.011, -1.50);
  for (let k = 0; k < 6; k++) for (const s of [-1, 1]) {
    P.add('hullDark', cylY(0.016, 0.016, 0.010, 6), -0.40 + k * 0.16, y + 0.025, -1.50 + s * 0.27);
    if (k < 4) P.add('hullDark', cylY(0.016, 0.016, 0.010, 6), s * 0.415, y + 0.025, -1.74 + k * 0.16);
  }
  for (const x of [-0.25, 0.25]) P.add('hullDark', box(0.10, 0.016, 0.022), x, y + 0.030, -1.50);           // lift handles
  // the two short intake grilles beside it (armoured slats in a raised frame, S3 plan)
  for (const s of [-1, 1]) {
    const x = s * 0.66, z = -1.72, wx = 0.30, lz = 0.48;
    P.add('hullDetail', box(wx, 0.05, lz), x, y + 0.025, z);
    P.add('hullDark', box(wx - 0.06, 0.012, lz - 0.06), x, y + 0.046, z);
    for (let k = 0; k < 6; k++) P.add('hullDetail', box(wx - 0.06, 0.018, 0.026), x, y + 0.058, z - 0.18 + k * 0.072, 0.5, 0, 0);
  }
  // the two big round transmission covers behind the deck joint (S3 plan: about 0.65 m across), bolted rims
  for (const x of [-0.42, 0.42]) {
    P.add('hullDetail', cylY(0.32, 0.32, 0.028, 28), x, y + 0.014, -2.56);
    P.add('hullDark', cylY(0.33, 0.33, 0.006, 28), x, y + 0.003, -2.56);
    P.add('hullDetail', cylY(0.10, 0.12, 0.03, 16), x, y + 0.040, -2.56);
    for (let k = 0; k < 10; k++) {
      const a = k * Math.PI / 5;
      P.add('hullDark', cylY(0.014, 0.014, 0.008, 6), x + Math.sin(a) * 0.28, y + 0.031, -2.56 + Math.cos(a) * 0.28);
    }
  }
  // the stern: hooded exhaust outlets on the deck's rear edge (S4 rear), two towing eyes on the curved lower plate
  for (const s of [-1, 1]) {
    const z = K.tail + K.tailTopR + 0.05;
    P.add('hullDetail', box(0.26, 0.11, 0.24), s * 0.40, y + 0.055, z);
    P.add('hullDetail', KIT.xform(cylX(0.13, 0.26, 16, 0.13), 0, 0, 0, 0, 0, 0, [1, 0.75, 1]), s * 0.40, y + 0.11, z);
    P.add('hullDark', cylZ(0.06, 0.03, 12), s * 0.40, y + 0.05, z - 0.11);
  }
  for (const s of [-1, 1]) {
    const yy = 0.80, kneeZ = K.tail + K.tailR, dz = Math.sqrt(K.tailR ** 2 - (yy - K.tailKneeY) ** 2);
    const z = kneeZ - dz, a = Math.atan2(K.tailKneeY - yy, dz);
    P.add('hullDetail', KIT.xform(box(0.16, 0.20, 0.07), 0, 0, -0.03), s * 0.55, yy, z, -a, 0, 0);
    P.add('hullDark', KIT.xform(cylX(0.034, 0.17, 8), 0, -0.02, -0.07), s * 0.55, yy, z, -a, 0, 0);
  }
}

function addKV2RunningGear(P: SovietHeavyBuilderPort): void {
  const { box, cylX } = KIT;
  // S1: six double-rimmed 0.60 m road wheels a side on torsion bars, three return rollers, rear sprocket, front idler,
  // a 0.70 m single-horn track (band 0.96..1.66: the hull side at 0.925 keeps 35 mm to it). S3/S5: the idler 0.66 m,
  // the tyred return rollers 0.34 m across and narrow, the track resting on them.
  const xc = 1.31, idler = { z: 2.90, y: 0.80, r: 0.33 }, sprocket = { z: -2.98, y: 0.80 };
  const wheelZs = [2.25, 1.33, 0.41, -0.51, -1.43, -2.35];
  const gear = sovGear(P, {
    xc, trackW: 0.70, wheels: 6, wheelR: 0.30, wheelY: 0.37, span: 4.60, zc: -0.05, topY: 1.03, botY: 0.13,
    sprocketY: sprocket.y, sprocketR: 0.33, sprocketDz: 0.63, idlerY: idler.y, idlerR: idler.r, idlerDz: idler.z - 2.25,
    rollers: [1.52, -0.20, -1.96].map((z) => ({ z, y: 0.96, r: 0.17 })), rollerR: 0.17, returnRollerWidthM: 0.20,
    corridorOwned: true,
    style: 'holes',                       // the early stamped wheels' six pockets, spinning with the wheel
  });
  // the bump-stop brackets on the hull side over each road wheel (S3)
  for (const sx of [-1, 1]) for (const z of wheelZs) {
    P.add('hullDetail', box(0.10, 0.12, 0.16), sx * 0.975, 0.86, z);
    P.add('hullDark', box(0.07, 0.03, 0.12), sx * 0.985, 0.785, z);
  }
  {
    // KIT.torus() lies flat (XZ plane): an X-facing wheel ring needs rz π/2.
    gear.addRoadWheelLayer(KIT.torus(0.268, 0.012, 12).rotateZ(Math.PI / 2), P.mats.spareTrack, {
      outset: 0.126,
      name: 'gearRoadWheelFacetRims',
    });
    gear.addRoadWheelLayer(KIT.torus(0.162, 0.014, 14).rotateZ(Math.PI / 2), P.mats.dark, {
      outset: 0.1105,
      name: 'gearRoadWheelDarkAnnuli', appearanceRole: 'wheelInset', // dark annulus, not a painted face (runningGearFinish.ts)
    });
    const dx = xc - 1.2925, k = idler.r / 0.30; // the face planes measured on the print-era seat, carried with the track
    for (const sx of [-1, 1]) {
      // idler: the open dished wheel (dark void, eight straight radial spokes, rim and hub rings) on the kit hub's face
      P.add('hullRunningGearDark', cylX(0.27 * k, 0.006, 20), sx * (1.578 + dx), idler.y, idler.z);
      P.add('hullRunningGearTrack', KIT.torus(0.272 * k, 0.011, 16), sx * (1.5825 + dx), idler.y, idler.z, 0, 0, Math.PI / 2);
      for (let n = 0; n < 8; n++) {
        const a = (n / 8) * Math.PI * 2 + 0.2, r = 0.17 * k;
        // -a: the spoke's length (local z) turned onto the radius (sin a, cos a), never across it
        P.add('hullRunningGearTrack', KIT.xform(box(0.014, 0.045, 0.19 * k), 0, Math.sin(a) * r, Math.cos(a) * r, -a, 0, 0),
          sx * (1.5835 + dx), idler.y, idler.z);
      }
      P.add('hullRunningGearTrack', KIT.torus(0.060 * k, 0.010, 10), sx * (1.5875 + dx), idler.y, idler.z, 0, 0, Math.PI / 2);
      // sprocket: dark recessed core, hub bolt ring and hub ring on the carrier-ring plane
      P.add('hullRunningGearDark', cylX(0.150, 0.006, 16), sx * (1.6515 + dx), sprocket.y, sprocket.z);
      P.add('hullRunningGearTrack', KIT.torus(0.152, 0.007, 14), sx * (1.6510 + dx), sprocket.y, sprocket.z, 0, 0, Math.PI / 2);
      for (let n = 0; n < 6; n++) {
        const a = (n / 6) * Math.PI * 2 + 0.3;
        P.add('hullRunningGearTrack', cylX(0.015, 0.010, 6), sx * (1.6525 + dx), sprocket.y + Math.sin(a) * 0.100, sprocket.z + Math.cos(a) * 0.100);
      }
      P.add('hullRunningGearTrack', KIT.torus(0.055, 0.008, 10), sx * (1.6505 + dx), sprocket.y, sprocket.z, 0, 0, Math.PI / 2);
    }
  }
  // the running-gear hardware family retoned (print-era r4): manganese band texels lifted to the rusty-warm family,
  // worn dark end-wheel drums, floorless pocket voids; per-build material clones only
  {
    for (const tm of [P.mats.trackL, P.mats.trackR]) tm.color.setRGB(1.45, 1.30, 1.08);
    P.mats.spareTrack.color.setHex(0x3f382c);
    const wornDrum = cloneRehookedVehicleMaterial(P.mats.wheels);
    wornDrum.color.setHex(0x39352c);
    wornDrum.envMapIntensity = 0.25;
    const pocketVoid = cloneFloorlessVehicleMaterial(P.mats.rubber);
    pocketVoid.color.setHex(0x191715);
    P.disposables.push(wornDrum, pocketVoid);
    // Material.clone() drops onBeforeCompile: the link pad/inner clones made inside buildRunningGear get the
    // readability floor back here (see the import note)
    P.hullG.traverse((o) => {
      const object: MaterialSceneObject = o;
      if (!object.isMesh && !object.isInstancedMesh) return;
      const m = object.material;
      if (!m) return;
      if (object.isInstancedMesh && m.color.getHex() === 0x171614) {
        rehookVehicleMaterial(m).color.setHex(0x423a2e);
      } else if (object.isInstancedMesh && m.color.getHex() === 0x27251f) {
        rehookVehicleMaterial(m).color.setHex(0x342e24);
      } else if (object.isMesh && m === P.mats.wheels && Math.abs(object.position.x) > 0.9) {
        object.material = wornDrum;
      } else if (object.isInstancedMesh && m === P.mats.rubber && object.geometry) {
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
        const bounds = object.geometry.boundingBox;
        if (bounds && bounds.max.x - bounds.min.x > 0.26) object.material = pocketVoid;
      }
    });
  }
}

/** The turret's plan half-width and its floor and roof at a station (turret-local). */
function kv2TurretSection(z: number): [halfW: number, floor: number, roof: number] {
  const K = KV2;
  const t = (z0: number, z1: number): number => Math.min(1, Math.max(0, (z - z0) / (z1 - z0)));
  const halfW = K.tHalfW + (K.cheekHalfW - K.tHalfW) * t(K.cheekZ, K.tFront);
  const floor = K.tSoffit + (K.tFloor - K.tSoffit) * t(K.tSoffitZ, K.tStepZ);
  const roof = K.tRoof + (K.frontTopY - K.tRoof) * t(K.chamferZ, K.tFront);
  return [halfW, floor, roof];
}

function addKV2Turret(P: SovietHeavyBuilderPort): void {
  const K = KV2, { box, cylX } = KIT;
  P.turretG.position.set(0, K.ringY, K.ringZ);
  // 75 mm rolled plates (S1), the 1941 production turret: vertical sides and cheeks, a short chamfer over the front
  // plate, the rear 0.7 m standing over the engine deck. The roof edges carry a 15 mm bevel.
  const bev = 0.015;
  const sections = [K.tRear, K.tSoffitZ, K.tStepZ, K.chamferZ, K.cheekZ, K.tFront].sort((a, b) => a - b).map((z) => {
    const [w, f, r] = kv2TurretSection(z);
    return { z, ring: [[-w, f], [w, f], [w, r - bev], [w - bev, r], [-w + bev, r], [-w, r - bev]] as [number, number][] };
  });
  P.add('turret', sectionSolid(sections));
  // welds on every vertical corner and round the roof
  const roofAt = (z: number): number => kv2TurretSection(z)[2];
  for (const s of [-1, 1]) {
    kv2Weld(P, 'turretDetail', [s * K.tHalfW, K.tSoffit, K.tRear], [s * K.tHalfW, K.tRoof, K.tRear], 0.012);
    kv2Weld(P, 'turretDetail', [s * K.tHalfW, K.tFloor, K.cheekZ], [s * K.tHalfW, roofAt(K.cheekZ), K.cheekZ], 0.012);
    kv2Weld(P, 'turretDetail', [s * K.cheekHalfW, K.tFloor, K.tFront], [s * K.cheekHalfW, K.frontTopY, K.tFront], 0.012);
    kv2Weld(P, 'turretDetail', [s * (K.tHalfW - 0.004), K.tRoof - 0.004, K.tRear], [s * (K.tHalfW - 0.004), K.tRoof - 0.004, K.chamferZ]);
    // 263 (fleetPassLow circularCapOverlap): no second bead from chamferZ back to cheekZ: the roof is flat there
    // (roofAt(cheekZ) = tRoof), so it lay inside the roof-edge bead above and its end cap z-fought that bead's
    kv2Weld(P, 'turretDetail', [s * (K.tHalfW - 0.004), roofAt(K.cheekZ) - 0.004, K.cheekZ], [s * (K.cheekHalfW - 0.004), K.frontTopY - 0.004, K.tFront]);
    // the side plate's lower front stiffener (S4: the raised bar beside the cheek joint)
    P.add('turret', box(0.030, 0.52, 0.065), s * (K.tHalfW + 0.015), 0.80, 0.87);
  }
  kv2Weld(P, 'turretDetail', [-K.tHalfW, K.tRoof - 0.004, K.tRear + 0.004], [K.tHalfW, K.tRoof - 0.004, K.tRear + 0.004]);
  kv2Weld(P, 'turretDetail', [-K.tHalfW, roofAt(K.chamferZ), K.chamferZ], [K.tHalfW, roofAt(K.chamferZ), K.chamferZ]);
  kv2Weld(P, 'turretDetail', [-K.cheekHalfW, K.frontTopY - 0.004, K.tFront], [K.cheekHalfW, K.frontTopY - 0.004, K.tFront]);
  // the lower edge's floor bolts (S4)
  for (const s of [-1, 1]) for (let k = 0; k < 10; k++) {
    P.add('turretDark', cylX(0.017, 0.012, 6), s * (K.tHalfW + 0.004), K.tFloor + 0.05, -0.85 + k * 0.19);
  }
  // the front plate's mantlet opening: a dark reveal round the drum, and a welded bar either side (S4 front: the drum
  // fills most of the plate between two raised bars)
  const reveal = 2 * Math.sqrt(K.drumR ** 2 - (K.tFront - K.trunnionZ) ** 2);
  P.add('turretDark', box(1.30, reveal, 0.012), 0, K.trunnionY, K.tFront + 0.004);
  for (const s of [-1, 1]) P.add('turret', box(0.08, 0.86, 0.04), s * 0.74, 1.00, K.tFront + 0.02);
  // side plates: two grab handles a side, the pistol port and the vision slit over it (S4 turret close-up)
  for (const s of [-1, 1]) {
    const x = s * K.tHalfW;
    // U-handles of 32 mm bar standing 70 mm off the plate on welded feet
    for (const hy of [0.98, 0.42]) {
      for (const hz of [0.26, 0.62]) {
        kv2Weld(P, 'turretDetail', [x, hy, hz], [x + s * 0.07, hy, hz], 0.016);
        P.add('turretDetail', box(0.016, 0.05, 0.05), x + s * 0.008, hy, hz);
      }
      kv2Weld(P, 'turretDetail', [x + s * 0.07, hy, 0.245], [x + s * 0.07, hy, 0.635], 0.016);
    }
    P.add('turretDetail', cylX(0.055, 0.024, 12), x + s * 0.012, 0.80, 0.26);
    P.add('turretDark', cylX(0.022, 0.03, 8), x + s * 0.020, 0.80, 0.26);
    P.add('turretDark', box(0.02, 0.022, 0.12), x + s * 0.004, 1.24, 0.30);
    P.add('turretDetail', box(0.030, 0.026, 0.18), x + s * 0.014, 1.272, 0.30);                       // brow
  }
}

function addKV2TurretRear(P: SovietHeavyBuilderPort): void {
  const K = KV2, { box, cylY, cylZ, sph } = KIT;
  const zr = K.tRear;
  // the big rear door (S4 rear, S5): a raised plate 45 mm proud, offset to the tank's right and hung on that edge on two
  // big hinge blocks, with the DT ball on the left
  const doorX = -0.20, doorY = 0.95, dw = 0.84;
  P.add('turretDark', box(dw + 0.03, dw + 0.03, 0.008), doorX, doorY, zr - 0.002);                       // door seam
  P.add('turret', box(dw, dw, 0.045), doorX, doorY, zr - 0.024);                                          // door plate
  for (const [bx, by] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35], [0.12, 0.35], [0.12, -0.35]] as const) {
    P.add('turretDark', cylZ(0.020, 0.014, 6), doorX + bx, doorY + by, zr - 0.052);
  }
  for (const hy of [doorY - 0.25, doorY + 0.25]) {
    P.add('turretDetail', box(0.16, 0.14, 0.07), doorX - dw / 2 + 0.04, hy, zr - 0.060);                  // hinge blocks
    P.add('turret', box(0.07, 0.14, 0.08), doorX - dw / 2 - 0.035, hy, zr - 0.040);                      // wall lugs
    P.add('turretDark', cylY(0.020, 0.020, 0.20, 8), doorX - dw / 2 - 0.005, hy, zr - 0.075);            // pins
  }
  P.add('turretDetail', box(0.04, 0.16, 0.04), doorX + dw / 2 - 0.07, doorY, zr - 0.068);                  // handle
  P.add('turretDetail', cylZ(0.05, 0.03, 10), doorX + 0.10, doorY + 0.18, zr - 0.060);                    // pistol port
  P.add('turretDark', cylZ(0.02, 0.034, 8), doorX + 0.10, doorY + 0.18, zr - 0.064);
  // the rear DT ball mount beside the door
  const mgX = 0.50, mgY = 1.16;
  P.add('turretDetail', cylZ(0.15, 0.05, 16), mgX, mgY, zr - 0.020);
  P.add('turret', sph(0.11, 14), mgX, mgY, zr - 0.04);
  P.add('turretDark', KIT.xform(cylZ(0.035, 0.03, 8), 0, 0, -0.10), mgX, mgY, zr - 0.04);
  P.add('turretDark', KIT.xform(cylZ(0.016, 0.16, 8), 0, 0, -0.17), mgX, mgY, zr - 0.04);
  // the rear plate's edge welds were laid with the shell; its lifting eyes ride the roof corners
}

function addKV2TurretRoof(P: SovietHeavyBuilderPort): void {
  const K = KV2, { box, cylY } = KIT;
  const y = K.tRoof;
  // commander's round hatch at the left rear (S3 plan): ring, lid, hinge and handle
  P.add('turretDetail', cylY(0.33, 0.33, 0.035, 22), 0.36, y + 0.0175, -0.82);
  P.add('turretDark', cylY(0.295, 0.295, 0.008, 22), 0.36, y + 0.036, -0.82);
  P.add('turret', cylY(0.27, 0.285, 0.040, 22), 0.36, y + 0.050, -0.82);
  P.add('turretDetail', box(0.24, 0.035, 0.07), 0.36, y + 0.040, -0.82 - 0.33);
  P.add('turretDark', box(0.12, 0.020, 0.024), 0.36, y + 0.080, -0.70);
  // the two periscopes' armoured domes at the roof's front corners (S4 front), their windows toward the bow
  for (const x of [-0.56, 0.56]) {
    P.add('turretDetail', cylY(0.115, 0.125, 0.045, 16), x, y + 0.0225, 0.66);
    P.add('turret', KIT.sph(0.10, 14, Math.PI / 2), x, y + 0.045, 0.66);
    P.add('turretDark', box(0.10, 0.035, 0.03), x, y + 0.085, 0.745);
    P.add('turretGlass', box(0.08, 0.020, 0.012), x, y + 0.085, 0.758);
  }
  // ventilator under its armoured cap on the right, the signal port on the centre line
  P.add('turretDetail', cylY(0.16, 0.17, 0.05, 16), -0.36, y + 0.025, -0.36);
  P.add('turret', cylY(0.11, 0.15, 0.07, 16), -0.36, y + 0.085, -0.36);
  P.add('turretDark', cylY(0.17, 0.17, 0.006, 16), -0.36, y + 0.052, -0.36);
  P.add('turretDetail', cylY(0.07, 0.07, 0.03, 12), 0, y + 0.015, -0.05);
  // four lifting eyes at the roof corners
  for (const [x, z] of [[-0.78, 0.66], [0.78, 0.66], [-0.80, -1.50], [0.80, -1.50]]) {
    KIT.liftEye(P, 'turretDetail', x, y + 0.015, z, x > 0 ? 0.6 : -0.6);
  }
}

function addKV2Howitzer(P: SovietHeavyBuilderPort): void {
  const K = KV2, { cylX, cylZ } = KIT;
  // 152 mm M-10T (S2: L/24.5, 3.70 m, half-jacketed). The cylindrical cradle drum turns in the front plate on the
  // trunnion axis, the armoured box over the recoil cylinders bolted to its face; both pitch with the gun.
  P.gunG.position.set(0, K.trunnionY, K.trunnionZ);
  const R = K.drumR, half = 0.54;
  P.addGunExtra(cylX(R, half * 2, 32), 0, 0, 0);                                                          // drum
  for (const s of [-1, 1]) {
    // smooth convex end caps (S4: no bolt circle) bulging 0.10 m past a rolled end edge
    P.addGunExtra(KIT.torus(R - 0.03, 0.035, 32, 8).rotateZ(Math.PI / 2), s * (half - 0.035), 0, 0);
    P.addGunExtra(KIT.xform(KIT.sph(R - 0.03, 24, Math.PI / 2), 0, 0, 0, 0, 0, -s * Math.PI / 2, [1, 0.10 / (R - 0.03), 1]), s * (half - 0.01), 0, 0);
  }
  // the shield box over the recoil cylinders: 0.74 wide, 0.67 tall, one 45° chin running back into the drum's lower
  // curve (S4), the tube leaving through a low boss
  const bw = 0.74, bTop = 0.32, bBot = -0.35, bRear = 0.30, bFront = 0.84, chinZ = 0.59, chinY = -0.10;
  P.addGunExtra(sectionSolid([bRear, chinZ, bFront].map((z) => {
    const bot = z <= chinZ ? bBot : chinY;
    return { z, ring: [[-bw / 2, bot], [bw / 2, bot], [bw / 2, bTop - 0.012], [bw / 2 - 0.012, bTop], [-bw / 2 + 0.012, bTop], [-bw / 2, bTop - 0.012]] as [number, number][] };
  })));
  P.addGunExtra(cylZ(0.150, 0.04, 20), 0, 0, bFront + 0.02);                                               // tube boss
  // round-head bolts in a line down the box-to-drum seam on each side, two small ones over the tube
  for (const s of [-1, 1]) for (const by of [0.22, 0.08, -0.06, -0.20]) {
    P.addGunExtraDark(KIT.xform(KIT.sph(0.026, 8, Math.PI / 2), 0, 0, 0, 0, 0, -s * Math.PI / 2), s * (bw / 2), by, 0.57);
  }
  for (const bx of [-0.08, 0.08]) P.addGunExtraDark(cylZ(0.016, 0.012, 6), bx, 0.23, bFront + 0.006);
  // the barrel: buildGun's tube to the muzzle and the half-jacket over its rear (S2)
  const len = 2.20, r = 0.111;
  KIT.buildGun(P, { len, r, brake: null, baseR: 0.15, sleeve: false, evac: null });
  P.add('gun', cylZ(0.132, 0.58, 20), 0, 0, bFront + 0.29);
  muzzleBore(P, { r, z: len - 0.019, seg: 16 });
  {
    // a bore is a hole: the device disc on a floorless void clone (see the import note)
    const boreVoid = cloneFloorlessVehicleMaterial(P.mats.rubber);
    boreVoid.color.setHex(0x0a0a09);
    boreVoid.envMapIntensity = 0;
    P.disposables.push(boreVoid);
    P.gunG.traverse((o) => {
      const object: MaterialSceneObject = o;
      if (object.isMesh && object.name === 'muzzleBoreShadowDisc') object.material = boreVoid;
    });
  }
  P.topY = KV2.roof;
}

function buildKV2(P: SovietHeavyBuilderPort): void {
  addKV2Hull(P);
  addKV2Fenders(P);
  addKV2HullFittings(P);
  addKV2EngineDeck(P);
  addKV2RunningGear(P);
  addKV2Turret(P);
  addKV2TurretRear(P);
  addKV2TurretRoof(P);
  addKV2Howitzer(P);
}

export const SOVIET_HEAVY_PROFILES = {
  kv2: { build: buildKV2 },
} satisfies VehicleProfileRecord;
