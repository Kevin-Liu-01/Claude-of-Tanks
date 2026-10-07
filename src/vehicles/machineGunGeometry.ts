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

// rec = [w,h,d] receiver mass.
export const MG_CLASSES = {
  m2:    { s: 1.00, rec: [0.115, 0.095, 0.46], barrelR: 0.0165, barrelL: 0.52, jacket: 'sleeve', flashR: 0.021, flashL: 0.07, caliber: 12.7, name: 'Browning M2HB' },
  heavy: { s: 1.00, rec: [0.115, 0.095, 0.46], barrelR: 0.0165, barrelL: 0.52, jacket: 'sleeve', flashR: 0.021, flashL: 0.07, caliber: 12.7, name: 'Browning-pattern HMG' },
  dshk:  { s: 1.02, rec: [0.105, 0.105, 0.44], barrelR: 0.0155, barrelL: 0.50, jacket: 'fins',   flashR: 0.035, flashL: 0.10, caliber: 12.7, name: 'DShK-pattern HMG' },
  nsvt:  { s: 0.98, rec: [0.095, 0.100, 0.42], barrelR: 0.0240, barrelL: 0.55, jacket: 'none',   flashR: 0.035, flashL: 0.10, caliber: 12.7, name: 'NSVT-pattern HMG' },
  kord:  { s: 0.99, rec: [0.100, 0.105, 0.43], barrelR: 0.0220, barrelL: 0.57, jacket: 'ribbed', flashR: 0.033, flashL: 0.10, caliber: 12.7, name: 'Kord-pattern HMG' },
  mag:   { s: 0.78, rec: [0.100, 0.050, 0.34], barrelR: 0.0120, barrelL: 0.46, jacket: 'none',   flashR: 0.017, flashL: 0.06, caliber: 7.62, name: 'Browning-derived GPMG' },
  mag58: { s: 0.80, rec: [0.105, 0.052, 0.35], barrelR: 0.0125, barrelL: 0.47, jacket: 'ribbed', flashR: 0.018, flashL: 0.06, caliber: 7.62, name: 'MAG 58 GPMG' },
};

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
}

/** Machine-gun barrel components are authored on the fitting's local +Z axis and only translated (straight barrels). */
function aim(geometry: THREE.BufferGeometry, dz: number, dy = 0): THREE.BufferGeometry {
  return xform(geometry, 0, dy, dz);
}

export function createPintleLayout(opts: PintleOptions, parts: MachineGunParts): PintleLayout {
  const classKey = isMgClass(opts.cls) ? opts.cls : 'm2';
  const cls = MG_CLASSES[classKey];
  const s = (opts.scale || 1) * cls.s;
  const tone = opts.tone || 'two-tone';
  // Weapons and ammunition stay neutral gunmetal. Tone controls only the support/shield finish; letting the host
  // camouflage colour receiver caps and ammo cans produced miniature green/tan guns.
  const [rw, rh, rd] = cls.rec.map((v) => v * s);
  const colTop = 0.014 + 0.16 * s;
  const mount = opts.mount === 'external-cradle' ? 'external-cradle' : 'pintle';
  const recY = mount === 'external-cradle' ? rh / 2 : colTop + 0.080 * s + rh / 2;
  const recZ = 0.06 * s;
  return {
    classKey, cls, s, tone,
    weaponSlot: 'dark',
    supportSlot: tone === 'pale' ? 'detail' : 'dark',
    ammoSlot: opts.ammoSlot || 'gunmetalAmmo',
    parts, rw, rh, rd, colTop, recY, recZ,
    trunY: recY + 0.004,
    trunZ: recZ + rd / 2,
    shieldVariant: opts.shield === true ? 'standard' : opts.shield,
    mount,
    ammo: opts.ammo !== false,
    barrelBridge: Boolean(opts.barrelBridge),
    ring: !opts.ring ? null : typeof opts.ring === 'object' ? opts.ring : {},
  };
}

export function addPintleMount(context: PintleLayout): void {
  if (context.mount === 'external-cradle') return;
  const { colTop, parts, s, supportSlot, weaponSlot } = context;
  // Flanged bearing, spindle, bridge, fork and cross-shaft form one visible
  // load path. The old single post made every gun look like a block on a rod.
  const colH = 0.16 * s;
  parts.add(supportSlot, cylY(0.030 * s, 0.038 * s, 0.014, 14), 0, 0.007, 0);
  parts.add(weaponSlot, torus(0.031 * s, 0.006 * s, 18), 0, 0.015, 0);
  parts.add(weaponSlot, cylY(0.018 * s, 0.023 * s, colH, 12), 0, 0.014 + colH / 2, 0);
  parts.add(weaponSlot, box(0.115 * s, 0.045 * s, 0.15 * s), 0, colTop + 0.0225 * s, 0.01);
  for (const side of [-1, 1]) {
    parts.add(weaponSlot, box(0.020 * s, 0.095 * s, 0.105 * s),
      side * 0.052 * s, colTop + 0.070 * s, 0.045 * s, side * 0.05, 0, 0);
  }
  parts.add(weaponSlot, cylX(0.025 * s, 0.130 * s, 12), 0, colTop + 0.105 * s, 0.065 * s);
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
  const { parts, rd, recY, recZ, rh, rw, s, weaponSlot } = context;
  const backZ = recZ - rd / 2;
  const coverY = recY + rh / 2;
  // pressed receiver; the chamfered long edges carry a highlight down the gun
  parts.add(weaponSlot, receiverShell(rw, rh, rd, Math.min(rw, rh) * 0.14), 0, recY, recZ);
  // hinged feed cover over the front of the receiver, its hinge pin forward and its latch step aft
  parts.add(weaponSlot, receiverShell(rw * 0.92, 0.018 * s, rd * 0.6, 0.006 * s), 0, coverY + 0.009 * s, recZ + rd * 0.13);
  parts.add(weaponSlot, block(rw * 0.86, 0.012 * s, rd * 0.26), 0, coverY + 0.006 * s, recZ - rd * 0.3);
  parts.add(weaponSlot, roundBar([-rw * 0.44, coverY + 0.01 * s, recZ + rd * 0.43], [rw * 0.44, coverY + 0.01 * s, recZ + rd * 0.43],
    0.0055 * s, 6));
  // the feed tray step where the belt enters the receiver
  parts.add(weaponSlot, block(0.024 * s, rh * 0.34, 0.07 * s), -rw / 2 - 0.01 * s, recY + rh * 0.2, recZ + rd * 0.16);
  // side plate and the slide's charging handle with its knob
  parts.add(weaponSlot, block(0.016 * s, rh * 0.66, rd * 0.52), rw / 2 + 0.008 * s, recY, recZ - 0.025 * s);
  parts.add(weaponSlot, block(0.03 * s, 0.017 * s, 0.075 * s), -rw / 2 - 0.016 * s, recY + 0.018 * s, recZ - 0.015 * s);
  parts.add(weaponSlot, place(latheY([[0.0005, 0], [0.011 * s, 0], [0.012 * s, 0.014 * s], [0.0005, 0.016 * s]], 6),
    0, 0, 0, 0, 0, Math.PI / 2), -rw / 2 - 0.031 * s, recY + 0.018 * s, recZ - 0.045 * s);
  // armoured back plate (buffer housing), looped spade grips and the butterfly trigger between them
  parts.add(weaponSlot, moldedBox(rw * 0.72, rh * 0.58, 0.05 * s, 0.008 * s, 1, 0.005 * s), 0, recY - 0.005 * s, backZ - 0.025 * s);
  for (const side of [-1, 1]) {
    parts.add(weaponSlot, sweptTube([
      [side * 0.03 * s, recY + 0.012 * s, backZ - 0.045 * s],
      [side * 0.042 * s, recY + 0.004 * s, backZ - 0.1 * s],
      [side * 0.042 * s, recY - 0.034 * s, backZ - 0.112 * s],
      [side * 0.03 * s, recY - 0.04 * s, backZ - 0.05 * s],
    ], 0.0085 * s, 4, 6));
  }
  parts.add(weaponSlot, block(0.03 * s, 0.026 * s, 0.012 * s), 0, recY - 0.012 * s, backZ - 0.07 * s);
  // rear leaf sight on the cover and the front post
  parts.add(weaponSlot, block(0.044 * s, 0.045 * s, 0.018 * s), 0, coverY + 0.030 * s, recZ - rd * 0.22);
  parts.add(weaponSlot, block(0.012 * s, 0.020 * s, 0.020 * s), 0, coverY + 0.022 * s, recZ + rd * 0.28);
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
  // Barrel group stays collinear with the receiver at the front trunnion.
  const jacket = barrelJacketProfile(cls.jacket, r0, s);
  if (jacket) parts.add(weaponSlot, aim(barrelLathe(jacket, cls.jacket === 'fins' ? 10 : 12), 0), 0, trunY, trunZ);
  else if (context.barrelBridge) {
    // Some slim, unsleeved weapons otherwise begin their barrel 100 mm ahead
    // of the receiver.  Let callers request the missing breech-to-barrel run
    // without changing the certified silhouettes of existing fittings.
    parts.add(weaponSlot, aim(cylZ(r0 * 1.12, 0.105 * s, 10), 0.0525 * s), 0, trunY, trunZ);
  }
  const bl = cls.barrelL * s;
  const fl = cls.flashL * s;
  parts.add(weaponSlot, aim(cylZ(r0, bl, 10), 0.10 * s + bl / 2), 0, trunY, trunZ);
  parts.add(weaponSlot, aim(barrelLathe(muzzleDeviceProfile(classKey, r0, cls.flashR * s, fl), 12), 0.10 * s + bl), 0, trunY, trunZ);
  parts.add(weaponSlot, aim(cylZ(r0 * 0.55, 0.010, 10), 0.10 * s + bl + fl + 0.006), 0, trunY, trunZ);
  parts.add(weaponSlot, aim(block(0.012 * s, 0.026 * s, 0.015 * s), 0.18 * s, r0 + 0.014 * s), 0, trunY, trunZ);
  if (classKey === 'mag' || classKey === 'mag58') {
    // the GPMG's gas cylinder under the barrel, its gas block, and the carrying handle over the barrel
    const gasZ0 = 0.10 * s + bl * 0.06, gasZ1 = 0.10 * s + bl * 0.56;
    parts.add(weaponSlot, aim(cylZ(r0 * 0.62, gasZ1 - gasZ0, 8), (gasZ0 + gasZ1) / 2, -r0 * 1.75), 0, trunY, trunZ);
    parts.add(weaponSlot, aim(block(r0 * 1.6, r0 * 2.9, 0.016 * s), gasZ1, -r0 * 0.9), 0, trunY, trunZ);
    const hz0 = 0.10 * s + bl * 0.14, hz1 = 0.10 * s + bl * 0.3, rise = r0 + 0.028 * s;
    parts.add(weaponSlot, sweptTube([[0, trunY + r0 * 0.6, trunZ + hz0], [0, trunY + rise, trunZ + hz0 + (hz1 - hz0) * 0.25],
      [0, trunY + rise, trunZ + hz0 + (hz1 - hz0) * 0.75], [0, trunY + r0 * 0.6, trunZ + hz1]], 0.0055 * s, 5, 6));
  } else if (classKey === 'nsvt') {
    // the NSVT's barrel carrying handle near the receiver
    const hz = 0.10 * s + bl * 0.12;
    parts.add(weaponSlot, sweptTube([[0, trunY + r0 * 0.7, trunZ + hz], [0, trunY + r0 + 0.032 * s, trunZ + hz + 0.02 * s],
      [0, trunY + r0 + 0.032 * s, trunZ + hz + 0.07 * s], [0, trunY + r0 * 0.7, trunZ + hz + 0.09 * s]], 0.0065 * s, 5, 6));
  }
}

/** The ammunition can's slot: callers paint it as issue olive (profiles: the canvas; decor: the scheme kit). */
export const MG_AMMO_CAN_SLOT = 'ammoCan';
/** The belt's cartridges: callers paint them as dull brass (profiles: the pale canvas; decor: a brass tint). */
export const MG_CARTRIDGE_SLOT = 'cartridge';

/**
 * The ammunition: a pressed can beside the receiver, its lid, handle and latch, a feed tray on the receiver's feed side
 * and a belt of cartridges that rises from the can's mouth and drops into the tray. 2026-10-06 (round 2: the critics
 * read the guns as "a bare tube on a block with no feed tray, belt or ammunition box" and could not find a gun at play
 * distance): the can is a third larger and olive, not gunmetal, and the belt carries its rounds, the brass catching
 * the light, so the station reads as a loaded weapon from the chase camera.
 */
export function addPintleAmmo(context: PintleLayout): void {
  const { ammoSlot, parts, recY, recZ, rh, rw, s, weaponSlot, cls } = context;
  if (!context.ammo) return;
  const heavy = cls.caliber > 10;
  const canW = (heavy ? 0.105 : 0.09) * s, canH = (heavy ? 0.14 : 0.12) * s, canD = (heavy ? 0.22 : 0.19) * s;
  const ax = -(rw / 2 + canW / 2 + 0.012 * s);
  const canY = recY - 0.01 * s, canZ = recZ - 0.02 * s;
  const canSlot = ammoSlot === 'gunmetalAmmo' ? MG_AMMO_CAN_SLOT : ammoSlot;
  // pressed can with filleted corners, a proud lid with its folding handle, and the latch lever
  parts.add(canSlot, moldedBox(canW, canH, canD, 0.008 * s, 1, 0.005 * s), ax, canY, canZ);
  const lidY = canY + canH / 2 + 0.005 * s;
  parts.add(canSlot, moldedBox(canW * 1.04, 0.01 * s, canD * 1.025, 0.006 * s, 1, 0.003 * s), ax, lidY, canZ);
  parts.add(weaponSlot, roundBar([ax, lidY + 0.012 * s, canZ - canD * 0.32], [ax, lidY + 0.012 * s, canZ + canD * 0.2], 0.0045 * s, 6));
  parts.add(weaponSlot, block(0.018 * s, canH * 0.55, 0.02 * s), ax - canW / 2 - 0.006 * s, canY + canH * 0.1, canZ);
  // the feed tray on the receiver's feed side, with its guide lip
  const trayX = -rw / 2 - 0.012 * s, trayY = recY + rh * 0.18, trayZ = recZ + 0.12 * s;
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
