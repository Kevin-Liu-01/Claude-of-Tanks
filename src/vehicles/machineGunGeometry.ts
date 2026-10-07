// src/vehicles/machineGunGeometry.ts — the Browning-family pintle machine gun's construction, shared by the profile
// fittings (profiles/kit.ts FITTINGS.pintleMG and its remote stations) and the decor layer's roof gun
// (decorations.ts aamg), so the fleet carries one machine-gun grammar (tank-accessories lane, 2026-10-05).
//
// Every class keeps the same authored load path (bearing -> spindle -> bridge -> fork -> trunnion -> receiver ->
// barrel group) while caliber-specific dimensions, jackets and muzzle devices keep national identity. The caller owns
// materials and assembly: parts arrive through `MachineGunParts.add(slot, geometry, x, y, z, rx, ry, rz)` by slot
// name ('dark' weapon steel, 'detail' / 'hull' painted support and shield, 'shadow', the ammunition slot), authored
// with the fitting origin at the pintle foot and +Z the firing direction.
import * as THREE from 'three';
import { box, cylX, cylY, cylZ, torus, xform } from './factoryGeometry.ts';
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
export const MG_CLASSES = {
  m2:    { s: 1.00, rec: [0.115, 0.095, 0.46], body: [0.108, 0.126], bore: 0.48, grip: 'spade', sight: 'leaf', barrelR: 0.0165, barrelL: 0.52, jacket: 'sleeve', flashR: 0.021, flashL: 0.07, gas: false, handle: false, caliber: 12.7, name: 'Browning M2HB' },
  heavy: { s: 1.00, rec: [0.115, 0.095, 0.46], body: [0.108, 0.126], bore: 0.48, grip: 'spade', sight: 'leaf', barrelR: 0.0165, barrelL: 0.52, jacket: 'sleeve', flashR: 0.021, flashL: 0.07, gas: false, handle: false, caliber: 12.7, name: 'Browning-pattern HMG' },
  dshk:  { s: 1.02, rec: [0.105, 0.105, 0.44], body: [0.104, 0.118], bore: 0.46, grip: 'spade', sight: 'ring', barrelR: 0.0155, barrelL: 0.50, jacket: 'fins',   flashR: 0.035, flashL: 0.10, gas: true,  handle: false, caliber: 12.7, name: 'DShK-pattern HMG' },
  nsvt:  { s: 0.98, rec: [0.095, 0.100, 0.42], body: [0.096, 0.124], bore: 0.42, grip: 'spade', sight: 'leaf', barrelR: 0.0170, barrelL: 0.55, jacket: 'none',   flashR: 0.028, flashL: 0.10, gas: true,  handle: true,  caliber: 12.7, name: 'NSVT-pattern HMG' },
  kord:  { s: 0.99, rec: [0.100, 0.105, 0.43], body: [0.098, 0.124], bore: 0.42, grip: 'spade', sight: 'leaf', barrelR: 0.0170, barrelL: 0.57, jacket: 'ribbed', flashR: 0.030, flashL: 0.10, gas: true,  handle: true,  caliber: 12.7, name: 'Kord-pattern HMG' },
  mag:   { s: 0.78, rec: [0.100, 0.050, 0.34], body: [0.074, 0.112], bore: 0.42, grip: 'pistol', sight: 'leaf', barrelR: 0.0120, barrelL: 0.46, jacket: 'none',  flashR: 0.017, flashL: 0.06, gas: true,  handle: true,  caliber: 7.62, name: 'Browning-derived GPMG' },
  mag58: { s: 0.80, rec: [0.105, 0.052, 0.35], body: [0.076, 0.114], bore: 0.42, grip: 'pistol', sight: 'leaf', barrelR: 0.0125, barrelL: 0.47, jacket: 'ribbed', flashR: 0.018, flashL: 0.06, gas: true, handle: true,  caliber: 7.62, name: 'MAG 58 GPMG' },
};

/**
 * True-scale floor on the effective class scale (round 3, 2026-10-07). Call sites authored GPMGs from 0.37 to 0.66 of
 * the class and heavy guns from 0.49 to 0.82 (a 7.62 mm gun with a 9 mm barrel: the critics' "toy-scale" cupola
 * guns). A fitting below the floor is drawn at it; a scale under MG_MARKER_SCALE is a deliberate census marker inside
 * authored stock (K2B) and stays as authored. The A6M RCWS's accepted 0.72 M2 sits on the heavy floor.
 */
export const MG_TRUE_SCALE_FLOOR = { gpmg: 0.60, heavy: 0.72 } as const;
const MG_MARKER_SCALE = 0.25;

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
}

/** Machine-gun barrel components are authored on the fitting's local +Z axis and only translated (straight barrels). */
function aim(geometry: THREE.BufferGeometry, dz: number, dy = 0): THREE.BufferGeometry {
  return xform(geometry, 0, dy, dz);
}

export function createPintleLayout(opts: PintleOptions, parts: MachineGunParts): PintleLayout {
  const classKey = isMgClass(opts.cls) ? opts.cls : 'm2';
  const cls = MG_CLASSES[classKey];
  const authoredScale = (opts.scale || 1) * cls.s;
  const floor = cls.caliber > 10 ? MG_TRUE_SCALE_FLOOR.heavy : MG_TRUE_SCALE_FLOOR.gpmg;
  const s = authoredScale < MG_MARKER_SCALE ? authoredScale : Math.max(authoredScale, floor);
  const tone = opts.tone || 'two-tone';
  // Weapons and ammunition stay neutral gunmetal. Tone controls only the support/shield finish; letting the host
  // camouflage colour receiver caps and ammo cans produced miniature green/tan guns.
  const [rw, rh, rd] = cls.rec.map((v) => v * s);
  const colTop = 0.014 + 0.16 * s;
  const mount = opts.mount === 'external-cradle' ? 'external-cradle' : 'pintle';
  const recY = mount === 'external-cradle' ? rh / 2 : colTop + 0.080 * s + rh / 2;
  const recZ = 0.06 * s;
  const trunY = recY + 0.004;
  const bodyW = cls.body[0] * s, bodyH = cls.body[1] * s;
  // An external cradle bears the receiver's underside at the fitting origin (t90AwXMachineGun's source rails).
  const bodyBottom = mount === 'external-cradle' ? 0 : trunY - bodyH * cls.bore;
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
    remote: Boolean(opts.remote),
    authoredScale,
    detail: opts.detail === 0 ? 0 : 1,
  };
}

export function addPintleMount(context: PintleLayout): void {
  if (context.mount === 'external-cradle') return;
  const { bodyBottom, bodyW, colTop, parts, s, supportSlot, trunY, weaponSlot } = context;
  // Flanged bearing, spindle and yoke bridge form one visible load path. The old single post made every gun look like
  // a block on a rod.
  const colH = 0.16 * s;
  parts.add(supportSlot, cylY(0.030 * s, 0.038 * s, 0.014, 14), 0, 0.007, 0);
  parts.add(weaponSlot, torus(0.031 * s, 0.006 * s, 18), 0, 0.015, 0);
  parts.add(weaponSlot, cylY(0.018 * s, 0.023 * s, colH, 12), 0, 0.014 + colH / 2, 0);
  parts.add(weaponSlot, box(0.115 * s, 0.045 * s, 0.15 * s), 0, colTop + 0.0225 * s, 0.01);
  // 2026-10-07 (round 3): a cradle that carries the gun. The fork arms used to stand inside the receiver's walls; the
  // cheeks now clasp the receiver from outside, a cradle floor runs under it, and the trunnion pin passes through
  // both cheeks and the receiver's lugs (the decor stow pivot), with proud pin heads and the elevation lock lever.
  const cx = bodyW / 2 + 0.008 * s;
  const cheekBottom = colTop + 0.028 * s, cheekTop = trunY + 0.010 * s;
  for (const side of [-1, 1]) {
    parts.add(weaponSlot, block(0.012 * s, cheekTop - cheekBottom, 0.15 * s), side * cx, (cheekTop + cheekBottom) / 2, 0.035 * s);
    if (context.detail) parts.add(weaponSlot, cylX(0.016 * s, 0.008 * s, 10), side * (cx + 0.009 * s), colTop + 0.105 * s, 0.065 * s);
  }
  parts.add(weaponSlot, block(2 * cx + 0.012 * s, 0.010 * s, 0.15 * s), 0, Math.max(colTop + 0.04 * s, bodyBottom - 0.005 * s), 0.035 * s);
  parts.add(weaponSlot, cylX(0.009 * s, 2 * cx + 0.026 * s, 8), 0, colTop + 0.105 * s, 0.065 * s);
  if (context.detail) parts.add(weaponSlot, place(block(0.010 * s, 0.055 * s, 0.012 * s), 0, 0, 0, 0.5, 0, 0),
    cx + 0.013 * s, colTop + 0.075 * s, -0.01 * s);
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

export function addPintleReceiver(context: PintleLayout): void {
  const { bodyBottom, bodyH, bodyW, cls, parts, rd, recZ, remote, s, trunY, weaponSlot } = context;
  const backZ = recZ - rd / 2, frontZ = recZ + rd / 2;
  // the receiver box (its lower 84 %) and the feed cover over it; the chamfered long edges carry a highlight
  const boxH = bodyH * 0.84, coverH = bodyH - boxH;
  const coverY = bodyBottom + boxH;
  parts.add(weaponSlot, receiverShell(bodyW, boxH, rd, Math.min(bodyW, boxH) * 0.12), 0, bodyBottom + boxH / 2, recZ);
  // hinged feed cover over the front 60 %, its hinge pin forward; the rear top plate a step lower with the latch
  parts.add(weaponSlot, receiverShell(bodyW * 0.94, coverH, rd * 0.6, coverH * 0.4), 0, coverY + coverH / 2, recZ + rd * 0.17);
  parts.add(weaponSlot, block(bodyW * 0.86, coverH * 0.55, rd * 0.36), 0, coverY + coverH * 0.275, recZ - rd * 0.3);
  parts.add(weaponSlot, roundBar([-bodyW * 0.5, coverY + coverH * 0.45, recZ + rd * 0.45], [bodyW * 0.5, coverY + coverH * 0.45, recZ + rd * 0.45],
    0.0055 * s, 6));
  parts.add(weaponSlot, block(bodyW * 0.3, coverH * 0.8, 0.016 * s), 0, coverY + coverH * 0.4, recZ - rd * 0.12);
  // the feedway on the can side where the belt enters, and the side plates' riveted trunnion lugs at the front
  parts.add(weaponSlot, block(0.022 * s, bodyH * 0.3, 0.075 * s), -bodyW / 2 - 0.009 * s, trunY + bodyH * 0.12, recZ + rd * 0.16);
  if (context.detail) for (const side of [-1, 1]) {
    parts.add(weaponSlot, block(0.008 * s, bodyH * 0.55, rd * 0.18), side * (bodyW / 2 + 0.003 * s), bodyBottom + bodyH * 0.36, frontZ - rd * 0.1);
  }
  // the charging handle and its slide on the side away from the can
  parts.add(weaponSlot, block(0.010 * s, bodyH * 0.22, rd * 0.42), bodyW / 2 + 0.004 * s, trunY - bodyH * 0.05, recZ - 0.02 * s);
  if (context.detail) parts.add(weaponSlot, place(latheY([[0.0005, 0], [0.011 * s, 0], [0.012 * s, 0.026 * s], [0.0005, 0.03 * s]], 6),
    0, 0, 0, 0, 0, -Math.PI / 2), bodyW / 2 + 0.008 * s, trunY - bodyH * 0.05, recZ + rd * 0.12);
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
    if (context.detail) parts.add(weaponSlot, sweptTube([[0, bodyBottom + 0.002 * s, gz + 0.07 * s], [0, bodyBottom - 0.026 * s, gz + 0.062 * s],
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
      ], 0.0085 * s, 4, 6));
    }
    parts.add(weaponSlot, block(0.03 * s, 0.026 * s, 0.012 * s), 0, trunY - 0.016 * s, backZ - 0.07 * s);
  }
  // rear leaf sight on the cover and its front post; the DShK carries its spider-web AA ring sight on a post
  const coverTop = coverY + coverH;
  parts.add(weaponSlot, block(0.044 * s, 0.040 * s, 0.018 * s), 0, coverTop + 0.018 * s, recZ - rd * 0.22);
  parts.add(weaponSlot, block(0.012 * s, 0.020 * s, 0.020 * s), 0, coverTop + 0.008 * s, recZ + rd * 0.28);
  if (cls.sight === 'ring') {
    parts.add(weaponSlot, block(0.008 * s, 0.045 * s, 0.008 * s), 0, coverTop + 0.0225 * s, frontZ + 0.02 * s);
    parts.add(weaponSlot, place(torus(0.04 * s, 0.0035 * s, 16, 4), 0, 0, 0, Math.PI / 2, 0, 0), 0, coverTop + 0.075 * s, frontZ + 0.02 * s);
  }
}

/** Barrel support, fins or ribs as one lathe profile (radius, station) from the trunnion forward. */
function barrelJacketProfile(jacket: string, r0: number, s: number): Array<readonly [number, number]> | null {
  if (jacket === 'sleeve') {
    // perforated barrel support with four raised retaining bands
    const rj = r0 * 1.85;
    const profile: Array<readonly [number, number]> = [[r0 * 1.02, 0], [rj, 0.002 * s]];
    for (let k = 0; k < 4; k++) {
      const y = (0.030 + k * 0.034) * s;
      profile.push([rj, y - 0.004 * s], [rj * 1.06, y - 0.0015 * s], [rj * 1.06, y + 0.0015 * s], [rj, y + 0.004 * s]);
    }
    profile.push([rj, 0.148 * s], [r0 * 1.02, 0.15 * s]);
    return profile;
  }
  if (jacket === 'fins') {
    // the DShK's turned cooling fins
    const profile: Array<readonly [number, number]> = [[r0 * 1.02, 0.02 * s]];
    for (let k = 0; k < 5; k++) {
      const y = (0.03 + k * 0.028) * s;
      profile.push([r0 * 1.12, y - 0.01 * s], [r0 * 1.5, y], [r0 * 1.12, y + 0.01 * s]);
    }
    profile.push([r0 * 1.02, 0.152 * s]);
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
  // conical flash hider (M2, NSVT, the GPMGs)
  return [[r0 * 1.08, 0], [fr * 0.72, 0.26 * fl], [fr, 0.9 * fl], [fr * 0.9, fl], [r0 * 0.9, fl]];
}

export function addPintleBarrel(context: PintleLayout): void {
  const { classKey, cls, parts, s, trunY, trunZ, weaponSlot } = context;
  const r0 = cls.barrelR * s;
  const jacket = barrelJacketProfile(cls.jacket, r0, s);
  if (jacket) parts.add(weaponSlot, aim(barrelLathe(jacket, cls.jacket === 'fins' ? 10 : 12), 0), 0, trunY, trunZ);
  else {
    // 2026-10-07 (round 3): every barrel is carried from the receiver face. Unsleeved classes (the GPMGs, the NSVT)
    // used to start their barrel 100 mm ahead of the receiver unless a caller asked for `barrelBridge`, so 107 fleet
    // guns showed a floating tube; the barrel nut, gas block seat and chamber now run that gap on every class.
    parts.add(weaponSlot, aim(barrelLathe([[r0 * 1.6, 0], [r0 * 1.6, 0.032 * s], [r0 * 1.32, 0.042 * s], [r0 * 1.24, 0.1 * s + 0.002]], 10), 0),
      0, trunY, trunZ);
  }
  const bl = cls.barrelL * s;
  const fl = cls.flashL * s;
  // a heavier breech third, a short taper, then the barrel to the muzzle device
  parts.add(weaponSlot, aim(barrelLathe([[r0 * 1.12, 0], [r0 * 1.12, bl * 0.3], [r0 * 0.95, bl * 0.4], [r0 * 0.95, bl]], 10), 0.10 * s),
    0, trunY, trunZ);
  parts.add(weaponSlot, aim(barrelLathe(muzzleDeviceProfile(classKey, r0 * 0.95, cls.flashR * s, fl), 12), 0.10 * s + bl), 0, trunY, trunZ);
  parts.add(weaponSlot, aim(cylZ(r0 * 0.55, 0.010, 10), 0.10 * s + bl + fl + 0.006), 0, trunY, trunZ);
  parts.add(weaponSlot, aim(block(0.012 * s, 0.026 * s, 0.015 * s), 0.18 * s, r0 + 0.014 * s), 0, trunY, trunZ);
  if (cls.gas) {
    // the gas cylinder under the barrel with its gas block (GPMGs, NSVT, Kord, DShK)
    const gasZ0 = 0.10 * s + bl * 0.04, gasZ1 = 0.10 * s + bl * 0.56;
    parts.add(weaponSlot, aim(cylZ(r0 * 0.62, gasZ1 - gasZ0, 8), (gasZ0 + gasZ1) / 2, -r0 * 1.75), 0, trunY, trunZ);
    if (context.detail) parts.add(weaponSlot, aim(block(r0 * 1.6, r0 * 2.9, 0.016 * s), gasZ1, -r0 * 0.9), 0, trunY, trunZ);
  }
  if (cls.handle && context.detail) {
    // the barrel's carrying handle, standing on two lugs
    const hz0 = 0.10 * s + bl * 0.12, hz1 = 0.10 * s + bl * 0.3, rise = r0 * 1.12 + 0.03 * s;
    parts.add(weaponSlot, sweptTube([[0, trunY + r0 * 0.6, trunZ + hz0], [0, trunY + rise, trunZ + hz0 + (hz1 - hz0) * 0.25],
      [0, trunY + rise, trunZ + hz0 + (hz1 - hz0) * 0.75], [0, trunY + r0 * 0.6, trunZ + hz1]], 0.006 * s, 5, 6));
  }
}

/** The ammunition can's slot: callers paint it in the pale issue canvas (profiles) or an olive-khaki (decor). */
export const MG_AMMO_CAN_SLOT = 'ammoCan';
/** The belt's cartridges: callers paint them as dull brass (profiles: the pale canvas; decor: a brass tint). */
export const MG_CARTRIDGE_SLOT = 'cartridge';

/**
 * The ammunition: a pressed can beside the receiver, its lid, handle and latch, a feed tray on the receiver's feed side
 * and a belt of cartridges that rises from the can's mouth and drops into the tray. 2026-10-06 (round 2: the critics
 * read the guns as "a bare tube on a block with no feed tray, belt or ammunition box" and could not find a gun at play
 * distance): the can is a third larger and pale khaki, not gunmetal, and the belt carries its rounds, the brass catching
 * the light, so the station reads as a loaded weapon from the chase camera.
 */
export function addPintleAmmo(context: PintleLayout): void {
  const { ammoSlot, bodyBottom, bodyW, parts, recY, recZ, rh, s, weaponSlot, cls, mount } = context;
  if (!context.ammo) return;
  const heavy = cls.caliber > 10;
  // 2026-10-07 (round 3): the can grows toward the issue sizes (M2A1 .50: 155 x 190 x 300 mm; M19A1 7.62: 95 x 180 x 280)
  // downward from the lid line the belt already rises from, so the belt, its apex and every crown datum stay put; an
  // external cradle keeps the old can so its receiver stays inside the host's envelope.
  const oldCanH = (heavy ? 0.14 : 0.12) * s;
  const tall = mount !== 'external-cradle';
  const canW = (heavy ? (tall ? 0.122 : 0.105) : (tall ? 0.095 : 0.09)) * s;
  const canH = tall ? (heavy ? 0.17 : 0.165) * s : oldCanH;
  const canD = (heavy ? (tall ? 0.26 : 0.22) : (tall ? 0.24 : 0.19)) * s;
  const ax = -(bodyW / 2 + canW / 2 + 0.014 * s);
  const lidY = recY - 0.01 * s + oldCanH / 2 + 0.005 * s;
  const canY = lidY - 0.005 * s - canH / 2, canZ = recZ - 0.02 * s;
  const canSlot = ammoSlot === 'gunmetalAmmo' ? MG_AMMO_CAN_SLOT : ammoSlot;
  // pressed can with filleted corners and its proud lid
  parts.add(canSlot, moldedBox(canW, canH, canD, 0.008 * s, 1, 0.005 * s), ax, canY, canZ);
  parts.add(canSlot, moldedBox(canW * 1.04, 0.01 * s, canD * 1.025, 0.006 * s, 1, 0.003 * s), ax, lidY, canZ);
  // separate hardware that stands off the can and throws its own shadow: the lid's hinge pin along the outer edge,
  // the carrying handle on two posts, and the clamp latch on the can's front end
  if (context.detail) {
    parts.add(weaponSlot, roundBar([ax - canW * 0.52, lidY - 0.003 * s, canZ - canD * 0.42], [ax - canW * 0.52, lidY - 0.003 * s, canZ + canD * 0.42],
      0.0045 * s, 6));
    for (const dz of [-0.22, 0.22]) parts.add(weaponSlot, block(0.008 * s, 0.018 * s, 0.008 * s), ax, lidY + 0.012 * s, canZ + dz * canD);
    parts.add(weaponSlot, roundBar([ax, lidY + 0.021 * s, canZ - canD * 0.26], [ax, lidY + 0.021 * s, canZ + canD * 0.26], 0.0045 * s, 6));
    parts.add(weaponSlot, cylX(0.006 * s, canW * 0.5, 8), ax, lidY - 0.024 * s, canZ + canD / 2 + 0.006 * s);
    parts.add(weaponSlot, place(block(canW * 0.42, 0.034 * s, 0.007 * s), 0, 0, 0, 0.22, 0, 0), ax, lidY - 0.012 * s, canZ + canD / 2 + 0.01 * s);
  }
  // the can tray on a pintle: a floor under the can, its strap and the arm to the cradle under the receiver (an external
  // cradle's host carries the can)
  const canBottom = canY - canH / 2;
  const armX0 = ax + canW / 2, armX1 = -bodyW * 0.3;
  if (tall) {
    parts.add(weaponSlot, block(canW + 0.012 * s, 0.008 * s, canD * 0.62), ax, canBottom - 0.004 * s, canZ);
    if (context.detail) parts.add(weaponSlot, block(0.008 * s, canH * 0.7, 0.028 * s), ax + canW / 2 + 0.004 * s, canBottom + canH * 0.35, canZ + canD * 0.18);
    if (armX1 > armX0) {
      const armY = Math.max(canBottom, bodyBottom) + 0.005 * s;
      parts.add(weaponSlot, block(armX1 - armX0, 0.009 * s, 0.03 * s), (armX0 + armX1) / 2, armY, canZ + canD * 0.18);
    }
  }
  // the feed tray on the receiver's feed side, with its guide lip
  const trayX = -bodyW / 2 - 0.014 * s, trayY = recY + rh * 0.18, trayZ = recZ + 0.12 * s;
  parts.add(weaponSlot, block(0.03 * s, 0.008 * s, 0.075 * s), trayX, trayY, trayZ);
  parts.add(weaponSlot, block(0.03 * s, 0.022 * s, 0.006 * s), trayX, trayY + 0.012 * s, trayZ + 0.04 * s);
  // the belt: rises from the can's mouth and drops into the tray; each link carries a round pointing forward
  const p0 = [ax + canW * 0.2, lidY + 0.012 * s, trayZ];
  const p1 = [(ax + trayX) / 2, Math.max(lidY, trayY) + 0.07 * s, trayZ];
  const p2 = [trayX - 0.006 * s, trayY + 0.012 * s, trayZ];
  const links = heavy ? 9 : 10;
  const roundR = (heavy ? 0.0085 : 0.0055) * s, roundL = (heavy ? 0.105 : 0.072) * s;
  for (let index = 0; index < links; index++) {
    const t = index / (links - 1);
    const u = 1 - t;
    const p = [0, 1, 2].map((k) => u * u * p0[k] + 2 * u * t * p1[k] + t * t * p2[k]);
    const d = [0, 1, 2].map((k) => 2 * u * (p1[k] - p0[k]) + 2 * t * (p2[k] - p1[k]));
    // the link square to the belt's tangent in the belt's own plane (the rounds stay parallel to the bore)
    const roll = Math.atan2(d[1], d[0]);
    const link = block(0.016 * s, 0.006 * s, roundL * 0.62);
    link.applyMatrix4(new THREE.Matrix4().makeRotationZ(roll));
    parts.add(weaponSlot, link, p[0], p[1], p[2]);
    const round = cylZ(roundR, roundL, 6);
    parts.add(MG_CARTRIDGE_SLOT, round, p[0] - Math.sin(roll) * roundR, p[1] + Math.cos(roll) * roundR, p[2] + roundL * 0.12);
  }
}

export function addPintleShield(context: PintleLayout): void {
  const { parts, recY, s, shieldVariant, tone, trunZ, weaponSlot } = context;
  if (shieldVariant) {
    const shieldSlot = tone === 'dark' ? 'dark' : 'detail';
    const shieldZ = trunZ + 0.035 * s;
    const sideW = shieldVariant === 'armored' ? 0.18 : 0.145;
    const shieldH = shieldVariant === 'low' ? 0.14 : shieldVariant === 'armored' ? 0.27 : 0.22;
    for (const side of [-1, 1]) {
      parts.add(shieldSlot, box(sideW * s, shieldH * s, 0.022 * s),
        side * (0.075 + sideW / 2) * s, recY + 0.018 * s, shieldZ,
        0, -side * 0.055, side * 0.035);
      parts.add(weaponSlot, box(0.018 * s, shieldH * 0.82 * s, 0.030 * s),
        side * (0.148 + sideW * 0.45) * s, recY + 0.006 * s, shieldZ - 0.020 * s);
      parts.add(weaponSlot, box(0.020 * s, 0.020 * s, 0.14 * s),
        side * 0.115 * s, recY - shieldH * 0.30 * s, shieldZ - 0.060 * s,
        -0.22, 0, side * 0.08);
    }
    parts.add(shieldSlot, box(0.19 * s, 0.032 * s, 0.026 * s),
      0, recY + shieldH * 0.48 * s, shieldZ);
    // Folded lips, sight slots and fastener heads keep the shield from
    // reading as one featureless rectangle. They share the shield plane and
    // remain part of the equipment fitting rather than turret armor.
    for (const side of [-1, 1]) {
      parts.add(shieldSlot, box(0.022 * s, shieldH * 0.92 * s, 0.045 * s),
        side * (0.075 + sideW - 0.012) * s, recY + 0.018 * s, shieldZ - 0.010 * s,
        0, -side * 0.10, 0);
      parts.add('shadow', box(sideW * 0.43 * s, 0.032 * s, 0.012 * s),
        side * 0.145 * s, recY + shieldH * 0.18 * s, shieldZ + 0.014 * s,
        0, -side * 0.055, 0);
      for (const sy of [-0.28, 0.30]) {
        parts.add('dark', cylZ(0.009 * s, 0.012 * s, 8),
          side * (0.075 + sideW * 0.70) * s,
          recY + sy * shieldH * s, shieldZ + 0.018 * s);
      }
    }
    if (shieldVariant === 'armored') {
      parts.add(shieldSlot, box(0.34 * s, 0.035 * s, 0.18 * s),
        0, recY + shieldH * 0.58 * s, shieldZ - 0.070 * s);
    }
  }
}

export function addPintleRing(context: PintleLayout): void {
  const { parts, ring, s, tone } = context;
  if (ring) {
    const rr = (ring.r || 0.20) * s;
    const rSlot = tone === 'dark' ? 'dark' : 'detail';
    parts.add(rSlot, torus(rr, 0.011, 26), 0, 0.035, 0);
    const stubs = ring.stubs || 3;
    for (let k = 0; k < stubs; k++) {
      const a = 0.6 + k * (Math.PI * 2 / stubs);
      parts.add(rSlot, box(0.024, 0.032, 0.024), Math.cos(a) * rr * 0.98, 0.018, Math.sin(a) * rr * 0.98);
    }
  }
}
