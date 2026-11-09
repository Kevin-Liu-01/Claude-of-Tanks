// The M113s' combat envelope on the build's datums (release 269; profiles/m113.ts builds them): the aluminium M113A1 hull
// (4.863 x 2.686 m, 0.43 m clearance; 12-38 mm) and each mark's turret or cupola, shared by the Australian marks
// (australiaSpecs.ts) and the US M113A3 (usaM113Specs.ts). Pure data, Node-runnable. First-party: Kevin B. Liu (NOTICE.md).
import { crewBox, modernArmor } from './specHelpers.ts';
import { m113Datums, type M113Mark } from './m113Datums.ts';

/** Each mark's gun trunnion in the turret's frame: the Saladin's and Scorpion's 76 mm, the AS4's Tenix M2 at the turret's
 * left front, the A3's M2 at its cupola shield. */
const GUN_PIVOT: Readonly<Record<M113Mark, readonly [number, number, number]>> = Object.freeze({
  fsv: [0, 0.28, 0.72], mrv: [0, 0.26, 0.72], as4: [0.22, 0.26, 0.56], a3: [0, 0.46, 0.34],
});

export const m113Armor = (mark: M113Mark, turret: { tw: number; tFrontZ: number; tRearZ: number; tH: number }, barrelLenM: number,
  barrelRadM: number) => {
  const D = m113Datums(mark);
  const as4 = mark === 'as4', a3 = mark === 'a3';
  return modernArmor({
    hl: D.length / 2, hw: 1.27, inW: 0.93, floor: 0.43, trkTop: 0.74, roofY: 1.86,
    turretPivot: [0, 1.86, D.ringZ], gunPivot: [...GUN_PIVOT[mark]],
    barrelLenM, barrelRadM,
    glacis: as4 ? [70, 70, 110] : [38, 38, 38], lower: as4 ? [50, 50, 80] : [32, 32, 32], side: as4 ? [60, 60, 100] : [44, 44, 44],
    skirt: null, rear: 32, roof: 25, ...turret,
    // (the A3's cupola: the gun shield's 10 mm steel)
    cheek: mark === 'fsv' ? [32, 32, 32] : mark === 'mrv' ? [25, 25, 25] : a3 ? [12, 12, 12] : [30, 30, 40],
    tSide: a3 ? [10, 10, 10] : [16, 16, 16],
    tRear: a3 ? 8 : 12, tRoof: a3 ? 6 : 10, mantlet: mark === 'fsv' ? [32, 32, 32] : a3 ? [12, 12, 12] : [25, 25, 25],
  });
};

/** The driver at the front left (+x, the hull's left) beside the front-right engine, as the M113AS4, the M113A3 and the
 * Redback seat him (internalLayoutRegistry.ts m113OneManTurret, ifvFrontTwoMan); modernArmor seats him front right. */
export const driverFrontLeft = <T extends { crew: readonly { crew: string; min: readonly number[]; max: readonly number[]; turretLocal: boolean }[] }>(armor: T): T => ({
  ...armor, crew: armor.crew.map((c) => (c.crew === 'driver'
    ? crewBox(c.crew, [-c.max[0], c.min[1], c.min[2]], [-c.min[0], c.max[1], c.max[2]], c.turretLocal) : c)),
});

export const m113Mobility = (weightTons: number, hp: number, kmh: number) =>
  ({ weightTons, enginePowerHp: hp, topSpeedKmh: kmh, reverseSpeedKmh: 14, hullTraverseDegS: 55 });
