// src/vehicles/machineGunGeometry.ts — the Browning-family pintle machine gun's construction, shared by the profile
// fittings (profiles/kit.ts FITTINGS.pintleMG and its remote stations) and the decor layer's roof gun
// (decorations.ts aamg), so the fleet carries one machine-gun grammar (tank-accessories lane, 2026-10-05).
//
// Every class keeps the same authored load path (bearing -> spindle -> bridge -> fork -> trunnion -> receiver ->
// barrel group) while caliber-specific dimensions, jackets and muzzle devices keep national identity. The caller owns
// materials and assembly: parts arrive through `MachineGunParts.add(slot, geometry, x, y, z, rx, ry, rz)` by slot
// name ('dark' weapon steel, 'detail' / 'hull' painted support and shield, 'shadow', the ammunition slot), authored
// with the fitting origin at the pintle foot and +Z the firing direction.
//
// 2026-10-07 (tank-accessories round 4, blind-critic wave 214: "the guns are blocky receivers with pencil-thin
// barrels and no belt, feed tray, sights or ammo box"): barrels take their true sections whatever the station's scale
// floor; each gun feeds from its real side (the M2's, the MAG's and the DShK's left-hand feed), so the can, the belt
// and the feed tray face the gunner's left where the front three-quarter views see them; the belt is a continuous run
// of rounds in their links from the can's open mouth into the feed tray; the feed cover carries its hinge and latch;
// crew guns carry a rear leaf sight and a front post. The NSVT (KT-12.7, Utyos) is its own construction below (the
// critics read the Oplot's "12.7 as an M2"): a long low receiver, a slender barrel with its long conical flash hider,
// gas tube and carrying handle, the big rectangular box hung on the cradle, and the mount's reflex sight.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, cylX, cylY, cylZ, xform } from './factoryGeometry.ts';
import { block, latheY, moldedBox, place, roundBar, sweptTube } from './accessoryPrimitives.ts';

// rec = [w,h,d] receiver datum: it fixes the bore height, the trunnion station, the muzzle point and the can/tray
// stations, so remote stations keep their published pivots and muzzles. body = [w,h] is the drawn receiver section
// (feed cover included) and bore the share of that height below the bore axis; grip is the firing control at the back
// plate ('spade' grips and the butterfly trigger, or the GPMG's 'pistol' grip and butt).
// 2026-10-07 (tank-accessories round 3, true scale): the critics read the GPMGs as "a block with a pencil-thin barrel"
// (the 100 x 50 mm block at s = 0.78 was a brick, and the unsleeved barrels floated 100 mm ahead of the receiver) and
// the NSVT/Kord barrels as cannon (48 and 44 mm tubes on 12.7 mm guns). Bodies now carry the real sections (an M2HB
// receiver is taller than it is wide; a MAG is a slim 60 x 90 mm box with its feed cover), the 12.7 mm barrels are
// 33-34 mm with a heavier breech, every barrel is carried from the receiver face, and the GPMGs carry gas cylinder,
// handle, pistol grip and butt.
// 2026-10-07 (round 4): barrelR is the true section at the class's own scale (`s`): an M2HB heavy barrel 38 mm over a
// 45 mm breech, a MAG / L7 23 mm over 27 mm, the NSV and Kord 31-34 mm; `front` is where the front sight stands (the
// M2's on the receiver's trunnion block, the others' on the gas block or the muzzle), `gasEnd` the gas block's station
// as a share of the barrel, and `feed` the side the belt enters on a crew mount (the gunner's left is +X).
// 2026-10-08 (round 5; wave 255 on the M60A1 and Type 99A: "a plain dark block with a bare tube barrel and a bulb tip,
// with no visible cooling-jacket perforations, feed tray, ammunition box, spade grips or sight"; the battle set: "no
// commander's MG reads on any turret. A real M2 or MG3 on a cupola is a clear dark silhouette at that range"): the heavy
// guns' drawn receivers take their true height (an M2HB receiver with its cover stands ~0.2 m; the drawn 0.126 m read
// as a flat block from 15-30 m), `crewL` is the barrel a crew gun carries at true length (an M2HB's runs ~1 m ahead of
// its trunnion block; `barrelL` stays the station datum a remote station's published muzzle is measured from, so no
// gameplay muzzle moves), and two national guns join the table: the German MG3 with its perforated jacket and the
// Chinese QJC-88 (the W85's vehicle form: a small rectangular receiver, a thick gas tube under a light barrel, a
// slotted brake, carrying handle and a 50-round box on the left).
export const MG_CLASSES = {
  m2:    { s: 1.00, rec: [0.115, 0.095, 0.46], body: [0.118, 0.168], bore: 0.50, grip: 'spade', sight: 'leaf', front: 'receiver', barrelR: 0.0200, barrelL: 0.52, crewL: 0.80, jacket: 'sleeve', flashR: 0.025, flashL: 0.07, gas: false, gasEnd: 0, handle: false, caliber: 12.7, feed: 'left', name: 'Browning M2HB' },
  heavy: { s: 1.00, rec: [0.115, 0.095, 0.46], body: [0.118, 0.168], bore: 0.50, grip: 'spade', sight: 'leaf', front: 'receiver', barrelR: 0.0200, barrelL: 0.52, crewL: 0.80, jacket: 'sleeve', flashR: 0.025, flashL: 0.07, gas: false, gasEnd: 0, handle: false, caliber: 12.7, feed: 'left', name: 'Browning-pattern HMG' },
  dshk:  { s: 1.02, rec: [0.105, 0.105, 0.44], body: [0.110, 0.150], bore: 0.48, grip: 'spade', sight: 'ring', front: 'barrel', barrelR: 0.0160, barrelL: 0.50, crewL: 0.76, jacket: 'fins',   flashR: 0.035, flashL: 0.10, gas: true,  gasEnd: 0.62, handle: false, caliber: 12.7, feed: 'left', name: 'DShK-pattern HMG' },
  nsvt:  { s: 0.98, rec: [0.095, 0.100, 0.42], body: [0.096, 0.124], bore: 0.42, grip: 'spade', sight: 'leaf', front: 'barrel', barrelR: 0.0168, barrelL: 0.55, crewL: 0.78, jacket: 'none',   flashR: 0.031, flashL: 0.10, gas: true,  gasEnd: 0.45, handle: true,  caliber: 12.7, feed: 'right', name: 'NSVT-pattern HMG' },
  kord:  { s: 0.99, rec: [0.100, 0.105, 0.43], body: [0.100, 0.148], bore: 0.46, grip: 'spade', sight: 'leaf', front: 'barrel', barrelR: 0.0180, barrelL: 0.57, crewL: 0.80, jacket: 'ribbed', flashR: 0.030, flashL: 0.10, gas: true,  gasEnd: 0.56, handle: true,  caliber: 12.7, feed: 'right', name: 'Kord-pattern HMG' },
  mag:   { s: 0.78, rec: [0.100, 0.050, 0.34], body: [0.074, 0.112], bore: 0.42, grip: 'pistol', sight: 'leaf', front: 'barrel', barrelR: 0.0155, barrelL: 0.46, crewL: 0.52, jacket: 'none',  flashR: 0.021, flashL: 0.06, gas: true,  gasEnd: 0.80, handle: true,  caliber: 7.62, feed: 'left', name: 'Browning-derived GPMG' },
  mag58: { s: 0.80, rec: [0.105, 0.052, 0.35], body: [0.076, 0.114], bore: 0.42, grip: 'pistol', sight: 'leaf', front: 'barrel', barrelR: 0.0151, barrelL: 0.47, crewL: 0.53, jacket: 'none',  flashR: 0.021, flashL: 0.06, gas: true,  gasEnd: 0.80, handle: true,  caliber: 7.62, feed: 'left', name: 'MAG 58 GPMG' },
  mg3:   { s: 0.80, rec: [0.090, 0.050, 0.36], body: [0.066, 0.118], bore: 0.40, grip: 'pistol', sight: 'leaf', front: 'barrel', barrelR: 0.0142, barrelL: 0.44, crewL: 0.50, jacket: 'perforated', flashR: 0.026, flashL: 0.08, gas: false, gasEnd: 0, handle: false, caliber: 7.62, feed: 'left', name: 'MG3 GPMG' },
  qjc88: { s: 1.00, rec: [0.095, 0.100, 0.40], body: [0.092, 0.132], bore: 0.44, grip: 'spade', sight: 'leaf', front: 'barrel', barrelR: 0.0150, barrelL: 0.60, crewL: 0.82, jacket: 'none',   flashR: 0.037, flashL: 0.13, gas: true,  gasEnd: 0.70, handle: true,  caliber: 12.7, feed: 'left', name: 'QJC-88 HMG' },
};

/**
 * True-scale floor on the effective class scale (round 3, 2026-10-07). Call sites authored GPMGs from 0.37 to 0.66 of
 * the class and heavy guns from 0.49 to 0.82 (a 7.62 mm gun with a 9 mm barrel: the critics' "toy-scale" cupola
 * guns). A fitting below the floor is drawn at it; a scale under MG_MARKER_SCALE is a deliberate census marker inside
 * authored stock (K2B) and stays as authored. The A6M RCWS's accepted 0.72 M2 sits on the heavy floor.
 */
export const MG_TRUE_SCALE_FLOOR = { gpmg: 0.60, heavy: 0.72 } as const;
const MG_MARKER_SCALE = 0.25;
/**
 * 2026-10-08 (round 5; wave 262, the battle set at chase distance: "no machine gun or weapon station is legible in any
 * frame"; the coordinator: "the right size ... keep the barrel and receiver at true scale"): a crew gun is drawn at no
 * less than this share of its class's true scale (83 crew guns in the fleet stood at 0.60-0.86 of it: GPMGs at 77 %,
 * heavy guns at 72 %). Remote stations keep MG_TRUE_SCALE_FLOOR, so no published pivot or muzzle moves.
 */
const MG_CREW_TRUE_SHARE = 0.95;

export type MgClassKey = keyof typeof MG_CLASSES;
export type MgClassDefinition = (typeof MG_CLASSES)[MgClassKey];

export function isMgClass(value: string | undefined): value is MgClassKey {
  return value !== undefined && Object.hasOwn(MG_CLASSES, value);
}

export interface MachineGunParts {
  add(slot: string, geometry: THREE.BufferGeometry, x?: number, y?: number, z?: number,
    rx?: number, ry?: number, rz?: number): void;
}

export interface PintleOptions {
  cls?: string;
  scale?: number;
  tone?: string;
  mount?: 'pintle' | 'external-cradle';
  ammoSlot?: string;
  ammo?: boolean;
  shield?: boolean | string;
  barrelBridge?: boolean;
  ring?: boolean | { r?: number; stubs?: number };
  /** A remote station's weapon: a solenoid housing at the back plate instead of crew grips or a butt. */
  remote?: boolean;
  /** 1 = near (default); 0 = the decor coarse level: the same envelope without the small hardware. */
  detail?: 0 | 1;
  /**
   * The side the belt enters (round 4): 'left' is the gunner's left (+X). A crew mount takes its class's feed (the
   * M2, the MAG family and the DShK feed from the left, the NSVT and Kord from the right); a remote station keeps the
   * right-hand feed its housing was built around.
   */
  feed?: 'left' | 'right';
  /** Extra pintle column height (m, round 4): a station whose gun must stand clear of the roof furniture around it. */
  riser?: number;
  /** The mount's reflex (collimator) sight on an arm beside the receiver, on the side away from the feed (NSVT). */
  reflexSight?: boolean;
  /**
   * The barrel the gun draws (round 5): true takes the class's station datum (`barrelL`, from which a remote station's
   * published muzzle is measured), false the true crew length (`crewL`). Default: the datum on remote stations and
   * crewless copies, the true length on crew guns.
   */
  datumBarrel?: boolean;
  /** An explicit drawn barrel length (m, from the trunnion's barrel station): a station whose muzzle is a datum. */
  barrelLength?: number;
  /**
   * A gun whose size is measured from a source study (round 5): it keeps its authored scale above the station floor
   * (MG_TRUE_SCALE_FLOOR) instead of the crew guns' true-scale floor.
   */
  sourceScale?: boolean;
}

export interface PintleLayout {
  readonly classKey: MgClassKey;
  readonly cls: MgClassDefinition;
  readonly s: number;
  readonly tone: string;
  readonly weaponSlot: string;
  readonly supportSlot: string;
  readonly ammoSlot: string;
  readonly parts: MachineGunParts;
  readonly rw: number;
  readonly rh: number;
  readonly rd: number;
  readonly colTop: number;
  readonly recY: number;
  readonly recZ: number;
  readonly trunY: number;
  readonly trunZ: number;
  readonly shieldVariant: PintleOptions['shield'];
  readonly mount: 'pintle' | 'external-cradle';
  readonly ammo: boolean;
  readonly barrelBridge: boolean;
  readonly ring: { r?: number; stubs?: number } | null;
  /** Drawn receiver section and its vertical span (the bore axis is trunY). */
  readonly bodyW: number;
  readonly bodyH: number;
  readonly bodyBottom: number;
  readonly remote: boolean;
  /** The caller's scale before the true-scale floor (cls.s x scale). */
  readonly authoredScale: number;
  readonly detail: 0 | 1;
  /** +1 when the belt enters from the gunner's left (+X), -1 from the right (round 4). */
  readonly feedSign: 1 | -1;
  /** The barrel's true radius (round 4): its section never drops below the class's own true scale. */
  readonly barrelR0: number;
  readonly riser: number;
  readonly reflexSight: boolean;
  /** The drawn barrel's length from the trunnion's barrel station (the class's crewL or barrelL, times s). */
  readonly barrelLength: number;
}

/** Machine-gun barrel components are authored on the fitting's local +Z axis and only translated (straight barrels). */
function aim(geometry: THREE.BufferGeometry, dz: number, dy = 0): THREE.BufferGeometry {
  return xform(geometry, 0, dy, dz);
}

export function createPintleLayout(opts: PintleOptions, parts: MachineGunParts): PintleLayout {
  const classKey = isMgClass(opts.cls) ? opts.cls : 'm2';
  const cls = MG_CLASSES[classKey];
  const authoredScale = (opts.scale || 1) * cls.s;
  const floor = opts.remote || opts.sourceScale ? (cls.caliber > 10 ? MG_TRUE_SCALE_FLOOR.heavy : MG_TRUE_SCALE_FLOOR.gpmg)
    : cls.s * MG_CREW_TRUE_SHARE;
  const s = authoredScale < MG_MARKER_SCALE ? authoredScale : Math.max(authoredScale, floor);
  const tone = opts.tone || 'two-tone';
  // Weapons and ammunition stay neutral gunmetal. Tone controls only the support/shield finish; letting the host
  // camouflage colour receiver caps and ammo cans produced miniature green/tan guns.
  const [rw, rh, rd] = cls.rec.map((v) => v * s);
  const riser = Math.max(0, opts.riser || 0);
  const colTop = 0.014 + 0.16 * s + riser;
  const mount = opts.mount === 'external-cradle' ? 'external-cradle' : 'pintle';
  const recY = mount === 'external-cradle' ? rh / 2 : colTop + 0.080 * s + rh / 2;
  const recZ = 0.06 * s;
  const trunY = recY + 0.004;
  const bodyW = cls.body[0] * s, bodyH = cls.body[1] * s;
  // An external cradle bears the receiver's underside at the fitting origin (t90AwXMachineGun's source rails).
  const bodyBottom = mount === 'external-cradle' ? 0 : trunY - bodyH * cls.bore;
  const remote = Boolean(opts.remote);
  const feed = opts.feed ?? (remote ? 'right' : cls.feed);
  // A census marker inside authored stock keeps its authored section; every drawn gun keeps the barrel's true one.
  const barrelScale = authoredScale < MG_MARKER_SCALE ? s : Math.max(s, cls.s);
  return {
    classKey, cls, s, tone,
    weaponSlot: 'dark',
    supportSlot: tone === 'pale' ? 'detail' : 'dark',
    ammoSlot: opts.ammoSlot || 'gunmetalAmmo',
    parts, rw, rh, rd, colTop, recY, recZ,
    trunY,
    trunZ: recZ + rd / 2,
    shieldVariant: opts.shield === true ? 'standard' : opts.shield,
    mount,
    ammo: opts.ammo !== false,
    barrelBridge: Boolean(opts.barrelBridge),
    ring: !opts.ring ? null : typeof opts.ring === 'object' ? opts.ring : {},
    bodyW, bodyH, bodyBottom,
    remote,
    authoredScale,
    detail: opts.detail === 0 ? 0 : 1,
    feedSign: feed === 'left' ? 1 : -1,
    barrelR0: cls.barrelR * barrelScale,
    riser,
    reflexSight: Boolean(opts.reflexSight) && !remote,
    barrelLength: opts.barrelLength ?? ((opts.datumBarrel ?? (remote || Boolean(opts.sourceScale))) ? cls.barrelL : cls.crewL) * s,
  };
}

/** A flat-faced machined ring (rectangular section, chamfered top edges) about +Y: a revolved closed section. */
export function machinedRing(rIn: number, rOut: number, h: number, chamfer: number, segments: number): THREE.BufferGeometry {
  const c = Math.min(chamfer, (rOut - rIn) * 0.4, h * 0.45);
  const section = [[rIn, 0], [rOut, 0], [rOut, h - c], [rOut - c, h], [rIn + c, h], [rIn, h - c], [rIn, 0]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const lathe = new THREE.LatheGeometry(section, segments);
  const flat = lathe.toNonIndexed();
  lathe.dispose();
  flat.computeVertexNormals();
  const creased = toCreasedNormals(flat, (40 * Math.PI) / 180);
  if (creased !== flat) flat.dispose();
  return creased;
}

export function addPintleMount(context: PintleLayout): void {
  if (context.mount === 'external-cradle') return;
  const { bodyBottom, bodyW, colTop, parts, s, supportSlot, trunY, weaponSlot } = context;
  const near = context.detail === 1;
  // Flanged bearing, spindle and yoke bridge form one visible load path. The old single post made every gun look like
  // a block on a rod.
  // 2026-10-07 (round 4, Type 99A critics: "the dark rings round the MG pedestal read as loose rubber hoses, not
  // machined ring mounts"): the bearing is a turned flange with a chamfered collar and its bolt heads, not a round
  // torus.
  const colH = colTop - 0.014;
  parts.add(supportSlot, latheY([[0.0005, 0], [0.040 * s, 0], [0.040 * s, 0.006], [0.034 * s, 0.010], [0.029 * s, 0.010],
    [0.029 * s, 0.017], [0.025 * s, 0.021], [0.0005, 0.021]], near ? 14 : 10), 0, 0, 0);
  if (near) for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    parts.add(weaponSlot, cylY(0.0045 * s, 0.0045 * s, 0.006, 6), Math.cos(a) * 0.035 * s, 0.009, Math.sin(a) * 0.035 * s);
  }
  parts.add(weaponSlot, cylY(0.018 * s, 0.023 * s, colH, near ? 12 : 8), 0, 0.014 + colH / 2, 0);
  if (context.riser > 0.03) {
    // 2026-10-08 (round 5; wave 254 on the Challenger 1: "it sits on a bare thin pole, so it reads as a prop on a stick
    // rather than a gun in a mount"): a risen pintle stands in its post: a 64 mm sleeve over the riser with a clamp
    // collar and its lock bolt at the top, so the spindle above it reads as the pintle in its socket.
    const sleeveH = context.riser + 0.02;
    parts.add(context.supportSlot, cylY(0.03 * s, 0.034 * s, sleeveH, near ? 12 : 8), 0, 0.014 + sleeveH / 2, 0);
    parts.add(context.supportSlot, cylY(0.038 * s, 0.038 * s, 0.022 * s, near ? 12 : 8), 0, 0.014 + sleeveH - 0.011 * s, 0);
    if (near) parts.add(weaponSlot, cylX(0.006 * s, 0.03 * s, 6), 0.045 * s, 0.014 + sleeveH - 0.011 * s, 0);
  }
  parts.add(weaponSlot, box(0.115 * s, 0.045 * s, 0.15 * s), 0, colTop + 0.0225 * s, 0.01);
  // 2026-10-07 (round 3): a cradle that carries the gun. The fork arms used to stand inside the receiver's walls; the
  // cheeks now clasp the receiver from outside, a cradle floor runs under it, and the trunnion pin passes through
  // both cheeks and the receiver's lugs (the decor stow pivot), with proud pin heads and the elevation lock lever.
  const cx = bodyW / 2 + 0.008 * s;
  const cheekBottom = colTop + 0.028 * s, cheekTop = trunY + 0.010 * s;
  for (const side of [-1, 1]) {
    parts.add(weaponSlot, block(0.012 * s, cheekTop - cheekBottom, 0.15 * s), side * cx, (cheekTop + cheekBottom) / 2, 0.035 * s);
    if (near) parts.add(weaponSlot, cylX(0.016 * s, 0.008 * s, 8), side * (cx + 0.009 * s), colTop + 0.105 * s, 0.065 * s);
  }
  parts.add(weaponSlot, block(2 * cx + 0.012 * s, 0.010 * s, 0.15 * s), 0, Math.max(colTop + 0.04 * s, bodyBottom - 0.005 * s), 0.035 * s);
  // fleet lane 2026-10-08 (circular-cap audit, 232 findings on 91 hulls): the pin used to end exactly on its heads' outer
  // faces, two coincident discs on each side; it now ends 2 mm inside the heads (still 5 mm past the cheek where a coarse
  // level draws no heads)
  parts.add(weaponSlot, cylX(0.009 * s, 2 * cx + 0.022 * s, 8), 0, colTop + 0.105 * s, 0.065 * s);
  if (near) parts.add(weaponSlot, place(block(0.010 * s, 0.055 * s, 0.012 * s), 0, 0, 0, 0.5, 0, 0),
    cx + 0.013 * s, colTop + 0.075 * s, -0.01 * s);
  if (context.classKey === 'nsvt') addNsvtMountFurniture(context);
}

// 2026-10-05 (tank-accessories lane): the Browning family keeps its load path, its envelope and its muzzle point;
// its members become machined forms. A pressed receiver with chamfered long edges, a hinged feed cover with its pin
// and tray step, an armoured back plate with looped spade grips and the butterfly trigger, the barrel support /
// cooling fins / ribs as one lathe per class, a coned flash hider or a baffled brake per class, the GPMGs' gas
// cylinder and carrying handle, a pressed ammunition can with its lid, handle and latch, and a belt that follows one
// curve into the feed tray instead of a stair of loose boxes.

/** A pressed receiver block whose filleted edges run along the gun (moldedBox turned so its fillets lie on Z). */
function receiverShell(width: number, height: number, depth: number, chamfer: number): THREE.BufferGeometry {
  return place(moldedBox(width, depth, height, chamfer, 1, chamfer * 0.6), 0, 0, 0, -Math.PI / 2, 0, 0);
}

/** A lathe authored along +Y (radius, station) turned onto the firing axis (+Z), its foot at local z = 0. */
function barrelLathe(profile: ReadonlyArray<readonly [number, number]>, segments = 12): THREE.BufferGeometry {
  return place(latheY(profile, segments), 0, 0, 0, Math.PI / 2, 0, 0);
}

/** The receiver's top line (the feed cover's top) and the cover's base, for sights and the feed path. */
function coverLine(context: PintleLayout): { coverY: number; coverH: number; coverTop: number } {
  const { bodyBottom, bodyH } = context;
  const boxH = bodyH * 0.84, coverH = bodyH - boxH;
  const coverY = bodyBottom + boxH;
  return { coverY, coverH, coverTop: coverY + coverH };
}

/** A folding leaf sight: base, two uprights, the crossbar and the aperture slider (top `h` above the base). */
function addLeafSight(context: PintleLayout, y: number, z: number, h: number): void {
  const { parts, s, weaponSlot } = context;
  parts.add(weaponSlot, block(0.026 * s, 0.006 * s, 0.022 * s), 0, y + 0.003 * s, z);
  for (const side of [-1, 1]) parts.add(weaponSlot, block(0.004 * s, h - 0.006 * s, 0.004 * s), side * 0.009 * s, y + 0.006 * s + (h - 0.006 * s) / 2, z);
  parts.add(weaponSlot, block(0.022 * s, 0.004 * s, 0.004 * s), 0, y + h - 0.002 * s, z);
  parts.add(weaponSlot, block(0.012 * s, 0.008 * s, 0.007 * s), 0, y + h * 0.55, z);
}

/** A front post between its two protective ears on a base block (top `h` above `y`). */
function addFrontPost(context: PintleLayout, y: number, z: number, h: number, baseW: number): void {
  const { parts, s, weaponSlot } = context;
  parts.add(weaponSlot, block(baseW, 0.008 * s, 0.016 * s), 0, y + 0.004 * s, z);
  for (const side of [-1, 1]) parts.add(weaponSlot, block(0.004 * s, h - 0.008 * s, 0.012 * s), side * 0.009 * s, y + 0.008 * s + (h - 0.008 * s) / 2, z);
  parts.add(weaponSlot, block(0.003 * s, h * 0.86 - 0.008 * s, 0.004 * s), 0, y + 0.008 * s + (h * 0.86 - 0.008 * s) / 2, z);
}

export function addPintleReceiver(context: PintleLayout): void {
  if (context.classKey === 'nsvt') { addNsvtReceiver(context); return; }
  const { bodyBottom, bodyH, bodyW, cls, feedSign: f, parts, rd, recZ, remote, s, trunY, weaponSlot } = context;
  const near = context.detail === 1;
  const backZ = recZ - rd / 2, frontZ = recZ + rd / 2;
  // the receiver box (its lower 84 %) and the feed cover over it; the chamfered long edges carry a highlight
  const boxH = bodyH * 0.84;
  const { coverY, coverH, coverTop } = coverLine(context);
  parts.add(weaponSlot, receiverShell(bodyW, boxH, rd, Math.min(bodyW, boxH) * 0.12), 0, bodyBottom + boxH / 2, recZ);
  // round 4: the side plates' seam (an M2's riveted side-plate line, a GPMG's receiver rib) breaks the slab sides
  if (near) for (const side of [-1, 1]) {
    parts.add(weaponSlot, block(0.004 * s, bodyH * 0.07, rd * 0.78), side * (bodyW / 2 + 0.0015 * s), bodyBottom + boxH * 0.58, recZ - rd * 0.04);
  }
  // the hinged feed cover over the front 60 %, its hinge knuckle at the front; the rear top plate a step lower; the
  // cover latch at the cover's rear edge with its release lever on the side away from the feed (round 4)
  parts.add(weaponSlot, receiverShell(bodyW * 0.94, coverH, rd * 0.6, coverH * 0.4), 0, coverY + coverH / 2, recZ + rd * 0.17);
  parts.add(weaponSlot, block(bodyW * 0.86, coverH * 0.55, rd * 0.36), 0, coverY + coverH * 0.275, recZ - rd * 0.3);
  if (near) parts.add(weaponSlot, roundBar([-bodyW * 0.44, coverY + coverH * 0.55, recZ + rd * 0.46], [bodyW * 0.44, coverY + coverH * 0.55, recZ + rd * 0.46],
    0.0062 * s, 6));
  parts.add(weaponSlot, block(bodyW * 0.36, coverH * 0.95, 0.014 * s), 0, coverY + coverH * 0.48, recZ - rd * 0.125);
  if (near) parts.add(weaponSlot, place(block(0.007 * s, 0.008 * s, 0.032 * s), 0, 0, 0, 0.3, 0, 0), -f * bodyW * 0.36, coverTop + 0.003 * s, recZ - rd * 0.15);
  // the feedway on the feed side where the belt enters, and the side plates' riveted trunnion lugs at the front
  parts.add(weaponSlot, block(0.022 * s, bodyH * 0.3, 0.075 * s), f * (bodyW / 2 + 0.009 * s), trunY + bodyH * 0.12, recZ + rd * 0.16);
  if (near) for (const side of [-1, 1]) {
    parts.add(weaponSlot, block(0.008 * s, bodyH * 0.55, rd * 0.18), side * (bodyW / 2 + 0.003 * s), bodyBottom + bodyH * 0.36, frontZ - rd * 0.1);
  }
  // the charging handle and its slide on the side away from the feed
  parts.add(weaponSlot, block(0.010 * s, bodyH * 0.22, rd * 0.42), -f * (bodyW / 2 + 0.004 * s), trunY - bodyH * 0.05, recZ - 0.02 * s);
  // round 5: the handle's knob stands well out from the slide on its stem (it read as a bump on the plate)
  parts.add(weaponSlot, place(block(0.04 * s, 0.012 * s, 0.014 * s), 0, 0, 0, 0, 0, 0), -f * (bodyW / 2 + 0.022 * s), trunY - bodyH * 0.05, recZ + rd * 0.12);
  if (near) parts.add(weaponSlot, place(latheY([[0.0005, 0], [0.013 * s, 0], [0.014 * s, 0.03 * s], [0.0005, 0.035 * s]], 6),
    0, 0, 0, 0, 0, f * Math.PI / 2), -f * (bodyW / 2 + 0.04 * s), trunY - bodyH * 0.05, recZ + rd * 0.12);
  // armoured back plate (buffer housing)
  parts.add(weaponSlot, moldedBox(bodyW * 0.8, bodyH * 0.62, 0.05 * s, 0.008 * s, 1, 0.005 * s), 0, bodyBottom + bodyH * 0.42, backZ - 0.025 * s);
  if (remote) {
    // a remote station fires through a solenoid housing and a cable gland, never crew grips
    parts.add(weaponSlot, block(bodyW * 0.62, bodyH * 0.42, 0.05 * s), 0, bodyBottom + bodyH * 0.36, backZ - 0.07 * s);
    parts.add(weaponSlot, cylZ(0.009 * s, 0.03 * s, 8), bodyW * 0.18, bodyBottom + bodyH * 0.3, backZ - 0.105 * s);
  } else if (cls.grip === 'pistol') {
    // the GPMG's pistol grip and trigger guard under the receiver's rear third, and its butt
    const gz = backZ + rd * 0.2;
    parts.add(weaponSlot, place(block(0.024 * s, 0.085 * s, 0.034 * s), 0, 0, 0, 0.32, 0, 0), 0, bodyBottom - 0.036 * s, gz - 0.012 * s);
    if (near) parts.add(weaponSlot, sweptTube([[0, bodyBottom + 0.002 * s, gz + 0.07 * s], [0, bodyBottom - 0.026 * s, gz + 0.062 * s],
      [0, bodyBottom - 0.03 * s, gz + 0.02 * s], [0, bodyBottom - 0.012 * s, gz + 0.004 * s]], 0.0035 * s, 4, 6));
    // the butt: a slim wrist off the buffer, then the stock dropping to its butt plate
    parts.add(weaponSlot, block(bodyW * 0.46, bodyH * 0.42, 0.04 * s), 0, trunY - bodyH * 0.06, backZ - 0.068 * s);
    parts.add(weaponSlot, place(moldedBox(bodyW * 0.6, 0.1 * s, bodyH * 0.86, 0.01 * s, 1, 0.006 * s), 0, 0, 0, Math.PI / 2 - 0.12, 0, 0),
      0, trunY - bodyH * 0.24, backZ - 0.13 * s);
    parts.add(weaponSlot, block(bodyW * 0.66, bodyH * 0.98, 0.012 * s), 0, trunY - bodyH * 0.31, backZ - 0.183 * s);
  } else {
    // looped spade grips and the butterfly trigger between them
    for (const side of [-1, 1]) {
      parts.add(weaponSlot, sweptTube([
        [side * 0.03 * s, trunY + 0.008 * s, backZ - 0.045 * s],
        [side * 0.042 * s, trunY, backZ - 0.1 * s],
        [side * 0.042 * s, trunY - 0.038 * s, backZ - 0.112 * s],
        [side * 0.03 * s, trunY - 0.044 * s, backZ - 0.05 * s],
      ], 0.0085 * s, near ? 4 : 3, near ? 6 : 4));
    }
    parts.add(weaponSlot, block(0.03 * s, 0.026 * s, 0.012 * s), 0, trunY - 0.016 * s, backZ - 0.07 * s);
  }
  // sights (round 4): a crew gun's folding rear leaf on the cover's rear plate and, for the M2, the front post on the
  // trunnion block (the others carry theirs on the barrel); the DShK carries its spider-web AA ring sight on a post.
  // A remote station aims through its own sensor head and carries neither.
  if (!remote && near) {
    addLeafSight(context, coverY + coverH * 0.55, recZ - rd * 0.3, 0.036 * s);
    if (cls.front === 'receiver') addFrontPost(context, coverTop, frontZ - 0.024 * s, 0.03 * s, 0.024 * s);
  }
  if (cls.sight === 'ring') {
    parts.add(weaponSlot, block(0.008 * s, 0.045 * s, 0.008 * s), 0, coverTop + 0.0225 * s, frontZ + 0.02 * s);
    parts.add(weaponSlot, place(machinedRing(0.0365 * s, 0.0435 * s, 0.006 * s, 0.002 * s, near ? 16 : 10), 0, 0, 0, Math.PI / 2, 0, 0),
      0, coverTop + 0.075 * s, frontZ + 0.023 * s);
  }
}

/**
 * A perforated jacket (round 5, 2026-10-08; wave 255: "no visible cooling-jacket perforations"): a closed collar at
 * each end and a ring of slats between them, so the barrel shows through the openings the way it does through the
 * M2HB's barrel support and the MG3's jacket (a solid lathe with raised bands read as a plain tube). `bands` adds
 * thin closed rings across the slats (the MG3's rows of holes). Stations are along the barrel from the trunnion.
 */
function addJacketCage(context: PintleLayout, z0: number, z1: number, rj: number, slats: number, collarL: number,
  bands: readonly number[] = []): void {
  const { parts, s, trunY, trunZ, weaponSlot } = context;
  const near = context.detail === 1;
  const seg = near ? 12 : 8;
  const rIn = Math.min(rj * 0.62, context.barrelR0 * 1.0);
  const collar = (za: number, zb: number, rOut: number): void => {
    parts.add(weaponSlot, aim(barrelLathe([[rIn, 0], [rOut, 0], [rOut, zb - za], [rIn, zb - za], [rIn, 0]], seg), za),
      0, trunY, trunZ);
  };
  collar(z0, z0 + collarL, rj * 1.05);
  collar(z1 - collarL, z1, rj * 1.05);
  for (const zb of bands) collar(zb - 0.0035 * s, zb + 0.0035 * s, rj * 1.02);
  // slats: half the circumference closed, their ends 2 mm into the collars
  const count = near ? slats : Math.max(4, Math.round(slats / 2));
  const width = (2 * Math.PI * rj / count) * (near ? 0.5 : 0.7), thick = Math.max(0.0022 * s, rj * 0.11);
  const length = z1 - z0 - 2 * collarL + 0.004;
  for (let k = 0; k < count; k++) {
    const a = (k + 0.5) / count * Math.PI * 2, r = rj - thick / 2;
    parts.add(weaponSlot, aim(place(block(width, thick, length), Math.sin(a) * r, Math.cos(a) * r, 0, 0, 0, -a), (z0 + z1) / 2),
      0, trunY, trunZ);
  }
}

/** Barrel support, fins or ribs as one lathe profile (radius, station) from the trunnion forward. */
function barrelJacketProfile(jacket: string, r0: number, s: number): Array<readonly [number, number]> | null {
  if (jacket === 'fins') {
    // the DShK's turned cooling fins over the barrel's breech third
    const profile: Array<readonly [number, number]> = [[r0 * 1.02, 0.02 * s]];
    for (let k = 0; k < 5; k++) {
      const y = (0.03 + k * 0.04) * s;
      profile.push([r0 * 1.12, y - 0.012 * s], [r0 * 1.85, y - 0.003 * s], [r0 * 1.85, y + 0.003 * s], [r0 * 1.12, y + 0.012 * s]);
    }
    profile.push([r0 * 1.02, 0.222 * s]);
    return profile;
  }
  if (jacket === 'ribbed') {
    const rj = r0 * 1.32;
    const profile: Array<readonly [number, number]> = [[r0 * 1.02, 0], [rj, 0.002 * s]];
    for (let k = 0; k < 4; k++) {
      const y = (0.026 + k * 0.030) * s;
      profile.push([rj, y - 0.0035 * s], [rj * 1.05, y - 0.0012 * s], [rj * 1.05, y + 0.0012 * s], [rj, y + 0.0035 * s]);
    }
    profile.push([rj, 0.128 * s], [r0 * 1.02, 0.13 * s]);
    return profile;
  }
  return null;
}

/** Each class's muzzle device inside the class's flash-hider envelope (radius fr, length fl): profile from its foot. */
function muzzleDeviceProfile(classKey: string, r0: number, fr: number, fl: number): Array<readonly [number, number]> {
  if (classKey === 'dshk') {
    // twin-baffle brake
    return [[r0 * 1.15, 0], [fr * 0.7, 0.12 * fl], [fr * 0.7, 0.34 * fl], [fr, 0.38 * fl], [fr, 0.6 * fl], [fr * 0.7, 0.64 * fl],
      [fr * 0.7, 0.84 * fl], [fr * 0.92, 0.88 * fl], [fr * 0.92, fl], [r0 * 0.9, fl]];
  }
  if (classKey === 'kord') {
    // ported brake: a band of ports between two collars
    return [[r0 * 1.1, 0], [fr, 0.1 * fl], [fr, 0.34 * fl], [fr * 0.82, 0.38 * fl], [fr * 0.82, 0.58 * fl], [fr, 0.62 * fl],
      [fr, fl], [r0 * 0.9, fl]];
  }
  if (classKey === 'qjc88') {
    // the W85 family's big slotted brake: three rings of slots between full-diameter collars
    const profile: Array<readonly [number, number]> = [[r0 * 1.15, 0], [fr * 0.8, 0.05 * fl], [fr, 0.1 * fl]];
    for (const [a, b] of [[0.2, 0.34], [0.46, 0.6], [0.72, 0.86]]) {
      profile.push([fr, a * fl], [fr * 0.74, a * fl + 0.004], [fr * 0.74, b * fl - 0.004], [fr, b * fl]);
    }
    profile.push([fr, fl], [r0 * 0.9, fl]);
    return profile;
  }
  if (classKey === 'mg3') {
    // the MG3's muzzle booster: a short drum ahead of the jacket and the conical flash hider in front of it
    return [[r0 * 1.15, 0], [fr * 0.9, 0.08 * fl], [fr * 0.9, 0.42 * fl], [fr * 0.62, 0.48 * fl], [fr * 0.8, 0.86 * fl],
      [fr, 0.94 * fl], [fr * 0.92, fl], [r0 * 0.9, fl]];
  }
  // conical flash hider (M2, the GPMGs)
  return [[r0 * 1.08, 0], [fr * 0.72, 0.26 * fl], [fr, 0.9 * fl], [fr * 0.9, fl], [r0 * 0.9, fl]];
}

export function addPintleBarrel(context: PintleLayout): void {
  if (context.classKey === 'nsvt') { addNsvtBarrel(context); return; }
  const { barrelR0: r0, classKey, cls, parts, remote, s, trunY, trunZ, weaponSlot } = context;
  const near = context.detail === 1;
  const seg = near ? 12 : 8;
  const jacket = barrelJacketProfile(cls.jacket, r0, s);
  if (cls.jacket === 'sleeve') {
    // the M2HB's perforated barrel support (61 mm) from the trunnion block, its retaining collar at the front
    addJacketCage(context, 0, 0.15 * s, Math.max(0.031 * s, r0 * 1.4), 8, 0.024 * s);
  } else if (jacket) parts.add(weaponSlot, aim(barrelLathe(jacket, cls.jacket === 'fins' ? (near ? 10 : 8) : seg), 0), 0, trunY, trunZ);
  else {
    // 2026-10-07 (round 3): every barrel is carried from the receiver face. Unsleeved classes (the GPMGs) used to start
    // their barrel 100 mm ahead of the receiver unless a caller asked for `barrelBridge`, so 107 fleet guns showed a
    // floating tube; the barrel nut, gas block seat and chamber now run that gap on every class.
    parts.add(weaponSlot, aim(barrelLathe([[r0 * 1.6, 0], [r0 * 1.6, 0.032 * s], [r0 * 1.32, 0.042 * s], [r0 * 1.24, 0.1 * s + 0.002]], near ? 10 : 8), 0),
      0, trunY, trunZ);
  }
  const bl = context.barrelLength;
  const fl = cls.flashL * s;
  const muzzleBase = 0.10 * s + bl;
  if (cls.jacket === 'perforated') {
    // the MG3's perforated jacket over most of the barrel, with the front sight's collar at its muzzle end and two
    // closed bands across its rows of holes
    const zj1 = 0.10 * s + bl * 0.86;
    addJacketCage(context, 0.07 * s, zj1, r0 * 1.85, 8, 0.03 * s, [0.07 * s + (zj1 - 0.07 * s) * 0.36, 0.07 * s + (zj1 - 0.07 * s) * 0.68]);
  }
  // a heavier breech third, a short taper, then the barrel to the muzzle device (round 4: at its true section)
  parts.add(weaponSlot, aim(barrelLathe([[r0 * 1.12, 0], [r0 * 1.12, bl * 0.3], [r0 * 0.95, bl * 0.4], [r0 * 0.95, bl]], near ? 10 : 8), 0.10 * s),
    0, trunY, trunZ);
  const fr = Math.max(cls.flashR * s, r0 * 1.3);
  parts.add(weaponSlot, aim(barrelLathe(muzzleDeviceProfile(classKey, r0 * 0.95, fr, fl), seg), muzzleBase), 0, trunY, trunZ);
  parts.add(weaponSlot, aim(cylZ(r0 * 0.55, 0.010, near ? 10 : 6), muzzleBase + fl + 0.006), 0, trunY, trunZ);
  const gasZ1 = 0.10 * s + bl * cls.gasEnd;
  if (cls.gas) {
    // the gas cylinder under the barrel with its gas block (GPMGs, Kord, DShK; the QJC-88's thick one)
    const gasZ0 = 0.10 * s + bl * 0.04, gasR = classKey === 'qjc88' ? r0 * 0.95 : r0 * 0.62;
    parts.add(weaponSlot, aim(cylZ(gasR, gasZ1 - gasZ0, near ? 8 : 6), (gasZ0 + gasZ1) / 2, -r0 * (classKey === 'qjc88' ? 2.0 : 1.75)), 0, trunY, trunZ);
    if (near) parts.add(weaponSlot, aim(block(r0 * 1.6, r0 * 2.9, 0.018 * s), gasZ1, -r0 * 0.9), 0, trunY, trunZ);
  }
  // round 4: the front sight on the barrel (on the gas block, or near the muzzle on a gun without one)
  if (!remote && near && cls.front === 'barrel') {
    const fz = cls.gas ? gasZ1 : 0.10 * s + bl * 0.9;
    addFrontPost(context, trunY + r0 * 0.9, trunZ + fz, 0.026 * s, r0 * 1.8);
  }
  if (cls.handle && near) {
    // the barrel's carrying handle, standing on two lugs
    const hz0 = 0.10 * s + bl * 0.12, hz1 = 0.10 * s + bl * 0.3, rise = r0 * 1.12 + 0.03 * s;
    parts.add(weaponSlot, sweptTube([[0, trunY + r0 * 0.6, trunZ + hz0], [0, trunY + rise, trunZ + hz0 + (hz1 - hz0) * 0.25],
      [0, trunY + rise, trunZ + hz0 + (hz1 - hz0) * 0.75], [0, trunY + r0 * 0.6, trunZ + hz1]], 0.006 * s, 5, 6));
  }
}

/** The ammunition can's slot: callers paint it in the fitting paint (profiles) or an olive-khaki (decor). */
export const MG_AMMO_CAN_SLOT = 'ammoCan';
/** The belt's cartridges: callers paint them as dull brass (decor) or the fitting paint (profiles). */
export const MG_CARTRIDGE_SLOT = 'cartridge';

/** True round dimensions (radius, length, link pitch) by caliber at the class's own scale. */
function roundDims(cls: MgClassDefinition, s: number): { r: number; len: number; pitch: number } {
  const k = s / cls.s;
  return cls.caliber > 10 ? { r: 0.0102 * k, len: 0.138 * k, pitch: 0.025 * k } : { r: 0.006 * k, len: 0.071 * k, pitch: 0.0135 * k };
}

/** How far outboard of the tray (`p3x`) the belt's descending control point may sit, for a belt rising from a mouth at
 * `p0x` on the feed side `f`: at most `reach`, and never past half the mouth-to-tray gap, so the arch stays convex. */
function beltArchReach(p0x: number, p3x: number, f: number, reach: number): number {
  return Math.max(0, Math.min(reach, 0.5 * f * (p0x - p3x)));
}

/**
 * The belt (round 4): a continuous run of rounds in their links along one cubic from p0 (inside the can's open mouth)
 * through p1, p2 to p3 (on the feed tray at the feedway), placed at the link pitch from the tray end back, each round
 * parallel to the bore with its link wrapped round the case. The coarse level draws the same run as a few flat bands.
 */
function addBelt(context: PintleLayout, p0: readonly number[], p1: readonly number[], p2: readonly number[], p3: readonly number[],
  round: { r: number; len: number; pitch: number }, maxRounds: number): void {
  const { parts, s, weaponSlot } = context;
  const near = context.detail === 1;
  const steps = 48;
  const pts: number[][] = [], acc: number[] = [0];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    pts.push([0, 1, 2].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]));
    if (i) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  }
  const total = acc[steps];
  const at = (d: number): { p: number[]; roll: number } => {
    let i = 1; while (i < steps && acc[i] < d) i++;
    const f = (d - acc[i - 1]) / Math.max(1e-9, acc[i] - acc[i - 1]);
    const p = [0, 1, 2].map((k) => pts[i - 1][k] + (pts[i][k] - pts[i - 1][k]) * f);
    return { p, roll: Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]) };
  };
  if (!near) {
    const bands = 4;
    for (let b = 0; b < bands; b++) {
      const { p, roll } = at(total * (b + 0.5) / bands);
      const band = block(total / bands * 1.02, round.r * 1.8, round.len * 0.9);
      band.applyMatrix4(new THREE.Matrix4().makeRotationZ(roll));
      parts.add(MG_CARTRIDGE_SLOT, band, p[0], p[1], p[2] + round.len * 0.08);
    }
    return;
  }
  const count = Math.max(2, Math.min(maxRounds, Math.floor(total / round.pitch) + 1));
  const seg = round.r > 0.008 * s ? 6 : 5;
  // fleet lane 2026-10-08 (circular-cap audit): the rounds stay parallel to the bore, so two rounds closer than a case's
  // width in the belt's plane stand inside one another. Along a straight run the pitch always clears them; where the belt
  // bends tighter than its links can follow, the next round steps on along the curve until it clears every round already
  // laid (the links fan open round the bend). A belt with no tight bend lays exactly as before.
  const clear = round.r * 2.08;
  const laid: number[][] = [];
  for (let d = total; laid.length < count && d > -round.pitch + 1e-9;) {
    const { p, roll } = at(Math.max(0, d));
    if (laid.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < clear)) { d -= round.pitch * 0.125; continue; }
    laid.push(p);
    d -= round.pitch;
    // the link square to the belt's tangent in the belt's own plane (the rounds stay parallel to the bore)
    // round 5: the link wraps the case's middle as a dark band across the round, so the belt reads as a striped run
    // of rounds in links rather than a row of beads in the can's paint
    const link = block(round.pitch * 0.82, round.r * 2.3, round.len * 0.42);
    link.applyMatrix4(new THREE.Matrix4().makeRotationZ(roll));
    parts.add(weaponSlot, link, p[0], p[1], p[2] - round.len * 0.05);
    parts.add(MG_CARTRIDGE_SLOT, cylZ(round.r, round.len, seg), p[0], p[1], p[2] + round.len * 0.08);
  }
}

/**
 * The ammunition: a pressed can beside the receiver on its tray, a feed tray on the receiver's feed side and a belt of
 * cartridges that rises out of the can's open mouth and drops into the tray. 2026-10-06 (round 2: the critics read
 * the guns as "a bare tube on a block with no feed tray, belt or ammunition box"): the can is a third larger, and the
 * belt carries its rounds. 2026-10-07 (round 4): the can, the belt and the tray sit on the gun's feed side (the M2's,
 * the MAG's and the DShK's left), the lid is folded back off a mouth the belt rises from, the belt runs in true-size
 * rounds at the link pitch, and the tray carries its guides.
 */
export function addPintleAmmo(context: PintleLayout): void {
  if (context.classKey === 'nsvt') { addNsvtAmmo(context); return; }
  const { ammoSlot, bodyBottom, bodyW, feedSign: f, parts, recY, recZ, s, weaponSlot, cls, mount } = context;
  if (!context.ammo) return;
  const near = context.detail === 1;
  const heavy = cls.caliber > 10;
  // 2026-10-07 (round 3): the can grows toward the issue sizes (M2A1 .50: 155 x 190 x 300 mm; M19A1 7.62: 95 x 180 x 280)
  // downward from the lid line the belt already rises from, so the belt, its apex and every crown datum stay put; an
  // external cradle keeps the old can so its receiver stays inside the host's envelope.
  const oldCanH = (heavy ? 0.14 : 0.12) * s;
  const tall = mount !== 'external-cradle';
  const canW = (heavy ? (tall ? 0.122 : 0.105) : (tall ? 0.095 : 0.09)) * s;
  const canH = tall ? (heavy ? 0.17 : 0.165) * s : oldCanH;
  const canD = (heavy ? (tall ? 0.26 : 0.22) : (tall ? 0.24 : 0.19)) * s;
  const ax = f * (bodyW / 2 + canW / 2 + 0.014 * s);
  const lidY = recY - 0.01 * s + oldCanH / 2 + 0.005 * s;
  const canY = lidY - 0.005 * s - canH / 2, canZ = recZ - 0.02 * s;
  const canSlot = ammoSlot === 'gunmetalAmmo' ? MG_AMMO_CAN_SLOT : ammoSlot;
  // pressed can with filleted corners; its lid folded back to the outboard edge leaves the mouth open on the inboard
  // side, where the belt rises (the mouth shows the can's dark inside)
  const mouthW = canW * 0.34;
  const inboard = ax - f * canW / 2;
  parts.add(canSlot, moldedBox(canW, canH, canD, 0.008 * s, 1, 0.005 * s), ax, canY, canZ);
  parts.add(canSlot, moldedBox(canW * 1.04 - mouthW, 0.01 * s, canD * 1.025, 0.006 * s, 1, 0.003 * s), ax + f * mouthW / 2, lidY, canZ);
  parts.add(weaponSlot, block(mouthW * 0.86, 0.004 * s, canD * 0.9), inboard + f * mouthW / 2, lidY - 0.0005 * s, canZ);
  // separate hardware that stands off the can and throws its own shadow: the lid's hinge pin along the outer edge,
  // the carrying handle on two posts, and the clamp latch on the can's front end
  if (near) {
    const outer = ax + f * canW * 0.52;
    parts.add(weaponSlot, roundBar([outer, lidY - 0.003 * s, canZ - canD * 0.42], [outer, lidY - 0.003 * s, canZ + canD * 0.42],
      0.0045 * s, 6));
    const hx = ax + f * mouthW * 0.5;
    for (const dz of [-0.22, 0.22]) parts.add(weaponSlot, block(0.008 * s, 0.018 * s, 0.008 * s), hx, lidY + 0.012 * s, canZ + dz * canD);
    parts.add(weaponSlot, roundBar([hx, lidY + 0.021 * s, canZ - canD * 0.26], [hx, lidY + 0.021 * s, canZ + canD * 0.26], 0.0045 * s, 6));
    parts.add(weaponSlot, cylX(0.006 * s, canW * 0.5, 8), ax, lidY - 0.024 * s, canZ + canD / 2 + 0.006 * s);
    parts.add(weaponSlot, place(block(canW * 0.42, 0.034 * s, 0.007 * s), 0, 0, 0, 0.22, 0, 0), ax, lidY - 0.012 * s, canZ + canD / 2 + 0.01 * s);
  }
  // the can tray on a pintle: a floor under the can, its strap and the arm to the cradle under the receiver (an external
  // cradle's host carries the can)
  const canBottom = canY - canH / 2;
  const armX0 = Math.abs(ax) - canW / 2, armX1 = bodyW * 0.3;
  if (tall) {
    parts.add(weaponSlot, block(canW + 0.012 * s, 0.008 * s, canD * 0.62), ax, canBottom - 0.004 * s, canZ);
    if (near) parts.add(weaponSlot, block(0.008 * s, canH * 0.7, 0.028 * s), ax - f * (canW / 2 + 0.004 * s), canBottom + canH * 0.35, canZ + canD * 0.18);
    if (armX0 > armX1) {
      const armY = Math.max(canBottom, bodyBottom) + 0.005 * s;
      parts.add(weaponSlot, block(armX0 - armX1, 0.009 * s, 0.03 * s), f * (armX0 + armX1) / 2, armY, canZ + canD * 0.18);
    }
  }
  // the belt: out of the mouth, up and over, and down onto the tray at the feedway
  // round 5: a heavy gun's belt arcs higher over its can (0.065 s before), so it reads from the side and the front
  // three-quarter; a GPMG's short belt keeps its arc
  addPintleFeed(context, [inboard + f * mouthW * 0.5, lidY - 0.02 * s, pintleFeedTrayZ(context)], lidY, (heavy ? 0.085 : 0.065) * s,
    heavy ? 13 : 17);
}

/** The feed tray's station along the bore: the receiver's forward part, where the belt enters the feedway. */
export function pintleFeedTrayZ(context: PintleLayout): number {
  return context.recZ + 0.12 * context.s;
}

/**
 * The feed tray on the receiver's feed side (a shelf the length of a round, the cartridge stop at its front and a guide
 * at its rear; round 4) and the belt from p0 (inside a box's open mouth) up over an apex `rise` above the higher of
 * `apexOver` and the tray, and down onto the tray at the feedway. The pintle's own can uses it, and so does a remote
 * station that hangs its box elsewhere on its cradle (round 5, the T-90SM/T-72B3M station).
 */
export function addPintleFeed(context: PintleLayout, p0: readonly number[], apexOver: number, rise: number, maxRounds: number): void {
  const { bodyW, cls, feedSign: f, parts, recY, rh, s, weaponSlot } = context;
  const near = context.detail === 1;
  const round = roundDims(cls, s);
  const trayX = f * (bodyW / 2 + 0.016 * s), trayY = recY + rh * 0.18, trayZ = pintleFeedTrayZ(context);
  parts.add(weaponSlot, block(0.034 * s, 0.006 * s, round.len * 0.78), trayX, trayY, trayZ + round.len * 0.08);
  parts.add(weaponSlot, block(0.034 * s, 0.022 * s, 0.005 * s), trayX, trayY + 0.011 * s, trayZ + round.len * 0.6);
  if (near) parts.add(weaponSlot, block(0.034 * s, 0.012 * s, 0.005 * s), trayX, trayY + 0.006 * s, trayZ - round.len * 0.36);
  const p3 = [f * (bodyW / 2 + 0.006 * s), trayY + 0.003 * s + round.r, trayZ];
  const apex = Math.max(apexOver, p3[1]) + rise;
  const p1 = [p0[0], apex, p0[2]];
  // fleet lane 2026-10-08 (circular-cap audit, 200 findings on 61 hulls): the descending control point sat 5 cm outboard
  // of the tray, past the can mouth the belt rises from (2.9 cm on a heavy gun's can), so the curve folded back through
  // itself at the top and its rounds stood inside one another; it keeps to the inboard half of the gap, so the arch is
  // convex and the two runs keep the mouth-to-tray spacing
  const p2 = [p3[0] + f * beltArchReach(p0[0], p3[0], f, 0.05 * s), p3[1] + (apex - p3[1]) * 0.7, trayZ];
  addBelt(context, p0, p1, p2, p3, round, maxRounds);
}

export function addPintleShield(context: PintleLayout): void {
  const { parts, recY, s, shieldVariant, tone, trunZ, weaponSlot } = context;
  if (!shieldVariant) return;
  // 2026-10-08 (round 5; wave 254 on the T-90M: "the two flat dark plates flanking the gun are slabs with a pair of tiny
  // slits each, so the shield and sight look like cardboard rather than cast armour around a gun cradle"): each leaf is
  // a 30 mm armour plate with chamfered edges in two panels, the outer one swept back like a cast shield's wing; one
  // vision slot per leaf under its own armoured hood; four bolt heads where the leaf meets its stiffener; a chamfered
  // top beam over the receiver. The envelope, the stiffeners and the braces to the cradle are those of round 4.
  const near = context.detail === 1;
  const shieldSlot = tone === 'dark' ? 'dark' : 'detail';
  const shieldZ = trunZ + 0.035 * s;
  const sideW = shieldVariant === 'armored' ? 0.18 : 0.145;
  const shieldH = shieldVariant === 'low' ? 0.14 : shieldVariant === 'armored' ? 0.27 : 0.22;
  const T = 0.03 * s, innerW = sideW * 0.62, outerW = sideW * 0.42, wing = 0.30;
  const plate = (w: number, h: number): THREE.BufferGeometry => moldedBox(w * s, h * s, T, 0.006 * s, 1, 0.007 * s);
  for (const side of [-1, 1]) {
    const x0 = 0.075 * s, xi = x0 + innerW * s / 2;
    parts.add(shieldSlot, plate(innerW, shieldH), side * xi, recY + 0.018 * s, shieldZ, 0, -side * 0.055, side * 0.035);
    // the outer wing, hinged on the inner panel's outboard edge and swept back
    const xe = x0 + innerW * s * 0.98;
    parts.add(shieldSlot, plate(outerW, shieldH * 0.94),
      side * (xe + Math.cos(wing) * outerW * s / 2), recY + 0.018 * s, shieldZ - Math.sin(wing) * outerW * s / 2,
      0, side * wing, side * 0.035);
    // the stiffener post behind the inner panel's outboard edge, and the brace down to the cradle
    parts.add(weaponSlot, box(0.018 * s, shieldH * 0.82 * s, 0.030 * s), side * (xe - 0.012 * s), recY + 0.006 * s, shieldZ - 0.026 * s);
    parts.add(weaponSlot, box(0.020 * s, 0.020 * s, 0.14 * s),
      side * 0.115 * s, recY - shieldH * 0.30 * s, shieldZ - 0.060 * s,
      -0.22, 0, side * 0.08);
    // the vision slot (a recess in the inner panel) under its hood
    const slotY = recY + shieldH * 0.22 * s;
    parts.add('shadow', box(innerW * 0.6 * s, 0.024 * s, T * 0.7), side * xi, slotY, shieldZ + T * 0.2, 0, -side * 0.055, 0);
    parts.add(shieldSlot, box(innerW * 0.72 * s, 0.012 * s, 0.032 * s), side * xi, slotY + 0.019 * s, shieldZ + T * 0.5 + 0.008 * s,
      0.4, -side * 0.055, 0);
    if (near) for (const sy of [-0.3, 0.36]) for (const sx of [0.2, 0.86]) {
      parts.add('dark', cylZ(0.0095 * s, 0.01 * s, 6), side * (x0 + innerW * sx * s), recY + sy * shieldH * s, shieldZ + T * 0.5 + 0.003 * s);
    }
  }
  // the top beam over the receiver, chamfered, bridging the two inner panels
  parts.add(shieldSlot, moldedBox(0.19 * s, 0.032 * s, 0.03 * s, 0.006 * s, 1, 0.006 * s), 0, recY + shieldH * 0.48 * s, shieldZ);
  if (shieldVariant === 'armored') {
    parts.add(shieldSlot, moldedBox(0.34 * s, 0.035 * s, 0.18 * s, 0.008 * s, 1, 0.008 * s),
      0, recY + shieldH * 0.58 * s, shieldZ - 0.070 * s);
  }
}

/**
 * The AA ring round the mount. 2026-10-07 (round 4, Type 99A critics: "the dark rings on the hatch and round the MG
 * pedestal read as loose rubber hoses, not machined ring mounts"): a flat-faced machined ring with chamfered edges,
 * its bolt heads and the brackets that carry it, in the mount's paint, instead of a round 22 mm torus.
 */
export function addPintleRing(context: PintleLayout): void {
  const { parts, ring, s, tone } = context;
  if (ring) {
    const rr = (ring.r || 0.20) * s;
    const near = context.detail === 1;
    const rSlot = tone === 'dark' ? 'dark' : 'detail';
    parts.add(rSlot, machinedRing(rr - 0.013, rr + 0.013, 0.016, 0.004, near ? 24 : 16), 0, 0.027, 0);
    if (near) {
      const bolts = Math.min(8, Math.max(6, Math.round(rr / 0.04)));
      for (let k = 0; k < bolts; k++) {
        const a = 0.3 + k * (Math.PI * 2 / bolts);
        parts.add('dark', cylY(0.0042, 0.0042, 0.005, 5), Math.cos(a) * rr, 0.0455, Math.sin(a) * rr);
      }
    }
    const stubs = ring.stubs || 3;
    for (let k = 0; k < stubs; k++) {
      const a = 0.6 + k * (Math.PI * 2 / stubs);
      parts.add(rSlot, box(0.024, 0.032, 0.024), Math.cos(a) * rr * 0.98, 0.018, Math.sin(a) * rr * 0.98);
    }
  }
}

// ---- The NSVT (KT-12.7 / Utyos) — its own construction (round 4, 2026-10-07) -------------------------------------
// Blind-critic wave 214 on the Oplot-M: "the Oplot's 12.7 reads as an M2. It should be the Soviet-pattern KT/NSVT with
// its box." The Browning family's tall receiver, perforated sleeve and spade grips are the M2's silhouette. The NSV-12.7
// (1,560 mm long, a 1,070 mm barrel, 25 kg) is a long, low, flat-topped stamped receiver with a buffer cap at its back,
// a slender air-cooled barrel with a gas tube under its rear half, a big folding carrying handle ahead of the receiver
// and a long conical flash hider; the tank NSVT fires electrically (a solenoid housing under the receiver's rear) from
// the mount's firing handle, takes its belt from a big rectangular box hung on the cradle, and is aimed through the
// mount's collimator (K10-T). It keeps the nsvt class's datum: bore height, trunnion station, muzzle point and the box
// station, so every NSVT user (T-72/T-80/T-90 cupolas, the PT-91's WKM-B, the Oplot-M's KT-12.7) changes silhouette
// without moving its mount or muzzle.

/** The NSVT's receiver span: its front face is the trunnion station; the buffer runs 50 mm behind the old back plate. */
function nsvtSpan(context: PintleLayout): { frontZ: number; backZ: number; len: number; midZ: number; boxH: number; top: number } {
  const { bodyBottom, bodyH, rd, recZ, s } = context;
  const frontZ = recZ + rd / 2, backZ = recZ - rd / 2 - 0.05 * s;
  const boxH = bodyH * 0.80;
  return { frontZ, backZ, len: frontZ - backZ, midZ: (frontZ + backZ) / 2, boxH, top: bodyBottom + boxH };
}

function addNsvtReceiver(context: PintleLayout): void {
  const { bodyBottom, bodyH, bodyW, feedSign: f, parts, remote, s, trunY, weaponSlot } = context;
  const near = context.detail === 1;
  const { frontZ, backZ, len, midZ, boxH, top } = nsvtSpan(context);
  // the long, low stamped receiver with lightly broken edges
  parts.add(weaponSlot, receiverShell(bodyW, boxH, len, Math.min(bodyW, boxH) * 0.07), 0, bodyBottom + boxH / 2, midZ);
  // the flat feed cover over the front 58 %, hinged at the front, with the feed-slide hump along its middle; the
  // rear top plate a step lower
  const coverD = len * 0.58, coverZ = frontZ - coverD / 2, coverH = bodyH * 0.09;
  parts.add(weaponSlot, block(bodyW * 0.96, coverH, coverD), 0, top + coverH / 2, coverZ);
  parts.add(weaponSlot, block(bodyW * 0.34, coverH * 0.9, coverD * 0.8), 0, top + coverH * 1.45, coverZ - coverD * 0.06);
  parts.add(weaponSlot, block(bodyW * 0.9, coverH * 0.5, len * 0.4), 0, top + coverH * 0.25, backZ + len * 0.2);
  if (near) {
    parts.add(weaponSlot, roundBar([-bodyW * 0.45, top + coverH * 0.5, frontZ - 0.006 * s], [bodyW * 0.45, top + coverH * 0.5, frontZ - 0.006 * s],
      0.006 * s, 6));
    // the cover latch at its rear edge and the barrel-lock wedge on the front top, away from the feed
    parts.add(weaponSlot, block(bodyW * 0.4, coverH * 0.9, 0.012 * s), 0, top + coverH * 0.45, coverZ - coverD / 2);
    parts.add(weaponSlot, place(block(0.014 * s, 0.012 * s, 0.07 * s), 0, 0, 0, 0, -f * 0.18, 0), -f * bodyW * 0.3, top + coverH + 0.006 * s, frontZ - 0.05 * s);
    // the pressed flutes along both walls
    for (const side of [-1, 1]) {
      parts.add(weaponSlot, block(0.004 * s, bodyH * 0.07, len * 0.8), side * (bodyW / 2 + 0.0015 * s), bodyBottom + boxH * 0.42, midZ);
    }
  }
  // the buffer cap at the back (a short turned dome, the NSV's rounded butt end)
  parts.add(weaponSlot, place(latheY([[0.0005, 0], [bodyH * 0.3, 0], [bodyH * 0.3, 0.022 * s], [bodyH * 0.21, 0.04 * s], [0.0005, 0.045 * s]], near ? 12 : 8),
    0, 0, 0, -Math.PI / 2, 0, 0), 0, bodyBottom + boxH * 0.55, backZ);
  // the feed opening on the feed side at the cover line, where the belt enters
  parts.add(weaponSlot, block(0.016 * s, bodyH * 0.26, 0.1 * s), f * (bodyW / 2 + 0.006 * s), top - bodyH * 0.06, context.recZ + 0.032 * s);
  // the cocking slide and its T-handle on the side away from the feed
  parts.add(weaponSlot, block(0.008 * s, bodyH * 0.16, len * 0.36), -f * (bodyW / 2 + 0.004 * s), trunY - bodyH * 0.14, midZ - len * 0.1);
  if (near) parts.add(weaponSlot, cylX(0.0065 * s, 0.04 * s, 6), -f * (bodyW / 2 + 0.026 * s), trunY - bodyH * 0.14, midZ - len * 0.26);
  // trunnion lugs at the front of both walls
  if (near) for (const side of [-1, 1]) {
    parts.add(weaponSlot, block(0.008 * s, bodyH * 0.5, 0.06 * s), side * (bodyW / 2 + 0.003 * s), bodyBottom + bodyH * 0.34, frontZ - 0.05 * s);
  }
  if (remote) {
    // a remote station's solenoid and cable gland at the buffer
    parts.add(weaponSlot, block(bodyW * 0.62, bodyH * 0.36, 0.05 * s), 0, bodyBottom + bodyH * 0.3, backZ - 0.03 * s);
    parts.add(weaponSlot, cylZ(0.009 * s, 0.03 * s, 8), bodyW * 0.18, bodyBottom + bodyH * 0.24, backZ - 0.07 * s);
  } else {
    // the tank NSVT's electric trigger: the solenoid housing under the receiver's rear
    parts.add(weaponSlot, block(bodyW * 0.5, bodyH * 0.22, 0.09 * s), 0, bodyBottom - bodyH * 0.1, backZ + 0.08 * s);
  }
}

function addNsvtBarrel(context: PintleLayout): void {
  const { barrelR0: r0, cls, parts, s, trunY, trunZ, weaponSlot } = context;
  const near = context.detail === 1;
  const seg = near ? 12 : 8;
  const bl = context.barrelLength, fl = cls.flashL * s;
  // the barrel socket at the receiver face and the slender, lightly tapered barrel
  parts.add(weaponSlot, aim(barrelLathe([[r0 * 1.75, 0], [r0 * 1.75, 0.034 * s], [r0 * 1.4, 0.046 * s], [r0 * 1.12, 0.1 * s + 0.002]], near ? 10 : 8), 0),
    0, trunY, trunZ);
  // the long conical flash hider (the NSV's trumpet) takes the last 0.19 s, so the muzzle point stays the class's datum
  const hiderL = 0.19 * s, hiderZ = 0.10 * s + bl + fl - hiderL;
  parts.add(weaponSlot, aim(barrelLathe([[r0 * 1.06, 0], [r0 * 1.06, bl * 0.22], [r0 * 0.93, bl * 0.32], [r0 * 0.9, hiderZ - 0.10 * s + 0.004]],
    near ? 10 : 8), 0.10 * s), 0, trunY, trunZ);
  const fr = Math.max(cls.flashR * s * 1.1, r0 * 2.0);
  parts.add(weaponSlot, aim(barrelLathe([[r0 * 1.0, 0], [r0 * 1.22, 0.016 * s], [fr * 0.6, hiderL * 0.42], [fr * 0.86, hiderL * 0.78],
    [fr, hiderL * 0.95], [fr * 0.95, hiderL], [r0 * 0.75, hiderL]], seg), hiderZ), 0, trunY, trunZ);
  parts.add(weaponSlot, aim(cylZ(r0 * 0.55, 0.010, near ? 10 : 6), 0.10 * s + bl + fl + 0.006), 0, trunY, trunZ);
  // the gas tube under the barrel's rear half, ending in the regulator block
  const gasZ0 = 0.10 * s, gasZ1 = 0.10 * s + bl * cls.gasEnd;
  parts.add(weaponSlot, aim(cylZ(r0 * 0.66, gasZ1 - gasZ0, near ? 8 : 6), (gasZ0 + gasZ1) / 2, -r0 * 1.8), 0, trunY, trunZ);
  parts.add(weaponSlot, aim(block(r0 * 1.7, r0 * 3.0, 0.024 * s), gasZ1, -r0 * 0.95), 0, trunY, trunZ);
  if (near) parts.add(weaponSlot, aim(cylX(r0 * 0.5, r0 * 2.6, 6), gasZ1 + 0.004 * s, -r0 * 1.8), 0, trunY, trunZ);
  // the big folding carrying handle on its barrel clamp ahead of the receiver, laid back over the barrel
  const hz = 0.10 * s + bl * 0.1;
  parts.add(weaponSlot, aim(cylZ(r0 * 1.45, 0.03 * s, near ? 10 : 6), hz), 0, trunY, trunZ);
  if (near) {
    const rise = r0 * 1.45 + 0.035 * s;
    parts.add(weaponSlot, sweptTube([[0, trunY + r0 * 1.3, trunZ + hz - 0.01 * s], [0, trunY + rise, trunZ + hz - 0.03 * s],
      [0, trunY + rise, trunZ + hz - 0.11 * s], [0, trunY + r0 * 1.6, trunZ + hz - 0.13 * s]], 0.0065 * s, 5, 6));
  }
}

/**
 * The NSVT's box: a big rectangular steel box hung on the cradle's feed side, its lid with the latch clips and handle,
 * the pressed ribs, the hanger plate to the cradle cheek, and a short belt arcing from the box's mouth into the feed
 * opening. It keeps the class's old can station and envelope (the same width, height, depth, lid line and offset), so
 * every NSVT station keeps its clearances: a T-72/T-80/T-90 cupola packs the gun among sights and housings.
 */
function addNsvtAmmo(context: PintleLayout): void {
  const { ammoSlot, bodyH, bodyW, cls, feedSign: f, parts, recY, recZ, s, weaponSlot, mount } = context;
  if (!context.ammo) return;
  const near = context.detail === 1;
  const tall = mount !== 'external-cradle';
  const oldCanH = 0.14 * s;
  const boxW = (tall ? 0.122 : 0.105) * s, boxH = tall ? 0.17 * s : oldCanH, boxD = (tall ? 0.26 : 0.22) * s;
  const bx = f * (bodyW / 2 + boxW / 2 + 0.014 * s);
  const lidY = recY - 0.01 * s + oldCanH / 2 + 0.005 * s;
  const top = lidY - 0.005 * s;
  const by = top - boxH / 2, bz = recZ - 0.02 * s;
  const canSlot = ammoSlot === 'gunmetalAmmo' ? MG_AMMO_CAN_SLOT : ammoSlot;
  const mouthW = boxW * 0.3, inboard = bx - f * boxW / 2;
  parts.add(canSlot, moldedBox(boxW, boxH, boxD, 0.006 * s, 1, 0.004 * s), bx, by, bz);
  parts.add(canSlot, moldedBox(boxW * 1.03 - mouthW, 0.01 * s, boxD * 1.02, 0.005 * s, 1, 0.003 * s), bx + f * mouthW / 2, lidY, bz);
  parts.add(weaponSlot, block(mouthW * 0.86, 0.004 * s, boxD * 0.88), inboard + f * mouthW / 2, top + 0.0015 * s, bz);
  // two pressed ribs down the outboard face
  for (const dz of [-0.28, 0.28]) parts.add(canSlot, block(0.006 * s, boxH * 0.86, 0.016 * s), bx + f * (boxW / 2 + 0.002 * s), by, bz + dz * boxD);
  if (near) {
    // the lid's latch clips on the ends and its carrying handle
    for (const end of [-1, 1]) parts.add(weaponSlot, block(boxW * 0.36, 0.03 * s, 0.006 * s), bx + f * mouthW * 0.4, top - 0.01 * s, bz + end * (boxD / 2 + 0.004 * s));
    const hx = bx + f * mouthW * 0.5;
    for (const dz of [-0.2, 0.2]) parts.add(weaponSlot, block(0.008 * s, 0.016 * s, 0.008 * s), hx, lidY + 0.013 * s, bz + dz * boxD);
    parts.add(weaponSlot, roundBar([hx, lidY + 0.021 * s, bz - boxD * 0.22], [hx, lidY + 0.021 * s, bz + boxD * 0.22], 0.0045 * s, 6));
  }
  // the hanger plate between the cradle cheek and the box's inboard face
  if (tall) parts.add(weaponSlot, block(0.008 * s, boxH * 0.55, 0.05 * s), inboard - f * 0.004 * s, by + boxH * 0.1, bz + boxD * 0.1);
  // the belt: up out of the mouth and over into the feed opening at the cover line
  const round = { r: 0.0108 * s / cls.s, len: 0.147 * s / cls.s, pitch: 0.027 * s / cls.s };
  const { top: recTop } = nsvtSpan(context);
  const beltZ = recZ + 0.02 * s;
  const mouthX = inboard + f * mouthW * 0.5;
  const feedY = recTop - bodyH * 0.06;
  const p0 = [mouthX, top - 0.02 * s, beltZ];
  const p3 = [f * (bodyW / 2 + 0.012 * s), feedY, beltZ];
  // round 5 (wave 254 on the Oplot-M: "the ammunition box ... has no belt, feed chute, handle or latch, so the heavy
  // machine gun looks as though it could not be fed"): the belt arcs higher out of the box, so it reads over the lid
  const apex = Math.max(top, feedY) + 0.075 * s;
  const p1 = [mouthX, apex, beltZ];
  const p2 = [p3[0] + f * beltArchReach(p0[0], p3[0], f, 0.045 * s), feedY + (apex - feedY) * 0.7, beltZ];
  addBelt(context, p0, p1, p2, p3, round, 9);
  // the feed guide outside the opening (the belt's last round rests on it)
  parts.add(weaponSlot, block(0.03 * s, 0.006 * s, round.len * 0.7), f * (bodyW / 2 + 0.02 * s), feedY - round.r - 0.004 * s, beltZ + round.len * 0.08);
}

/**
 * The NSVT mount's own furniture on the cradle: the firing handle with its trigger lever behind the cradle (a crew
 * mount), and the mount's collimator sight on its arm beside the receiver on the side away from the box.
 */
function addNsvtMountFurniture(context: PintleLayout): void {
  const { bodyW, colTop, feedSign: f, parts, recZ, remote, s, trunY, weaponSlot } = context;
  const near = context.detail === 1;
  if (remote) return;
  const cx = bodyW / 2 + 0.008 * s;
  // the firing handle: an arm back from the cradle cheek on the side away from the box, its grip dropping, the lever
  parts.add(weaponSlot, block(0.012 * s, 0.014 * s, 0.11 * s), -f * (cx + 0.012 * s), colTop + 0.06 * s, -0.07 * s);
  parts.add(weaponSlot, place(block(0.02 * s, 0.075 * s, 0.026 * s), 0, 0, 0, 0.25, 0, 0), -f * (cx + 0.012 * s), colTop + 0.03 * s, -0.125 * s);
  if (near) parts.add(weaponSlot, block(0.006 * s, 0.024 * s, 0.008 * s), -f * (cx + 0.012 * s), colTop + 0.05 * s, -0.103 * s);
  if (!context.reflexSight) return;
  // the collimator: a boxed sight on an L-arm from the cheek, its objective window forward and the eyepiece and brow
  // pad at the back, beside the receiver's rear half at the gunner's eye line
  const sx = -f * (bodyW / 2 + 0.05 * s), sy = trunY + 0.045 * s, sz = recZ - 0.07 * s;
  parts.add(weaponSlot, block(0.012 * s, 0.065 * s, 0.03 * s), -f * (cx + 0.012 * s), trunY + 0.005 * s, sz + 0.02 * s);
  parts.add(weaponSlot, block(Math.abs(sx) - cx - 0.006 * s, 0.012 * s, 0.03 * s), -f * (cx + (Math.abs(sx) - cx) / 2), trunY + 0.035 * s, sz + 0.02 * s);
  parts.add(weaponSlot, moldedBox(0.052 * s, 0.07 * s, 0.11 * s, 0.006 * s, 1, 0.004 * s), sx, sy, sz);
  parts.add(weaponSlot, block(0.06 * s, 0.008 * s, 0.03 * s), sx, sy + 0.039 * s, sz + 0.055 * s);
  if (near) {
    parts.add(weaponSlot, block(0.04 * s, 0.045 * s, 0.006 * s), sx, sy + 0.004 * s, sz + 0.056 * s);
    parts.add(weaponSlot, cylZ(0.014 * s, 0.03 * s, 8), sx, sy + 0.01 * s, sz - 0.068 * s);
  }
}
