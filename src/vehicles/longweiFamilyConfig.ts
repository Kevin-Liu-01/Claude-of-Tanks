// The Longwei family — release 264 (owner 2026-10-28: "make 4 new chinnese tannks combining variations of vt4a1,
// qilin, kunlun, annd ztz 99a2 with modernized versions of the lonngwei turret which i like the shape of"). Four original
// PLA game concepts, named for the Four Symbols: each a fleet hull (the ZTZ-99A2's, the VT-4A1's, the Qilin's T-72B3 and the
// Kunlun's T-72B3M with their Chinese packages) carrying a modernized Longwei turret, its arrowhead shell unchanged and its
// kit its own (profiles/longwei.ts buildLongweiTurret). Data only: the spec registry reads it without loading geometry.
// First-party: Kevin B. Liu (NOTICE.md).

import type { LongweiTurretKit } from './profiles/longwei.ts';

export type LongweiFamilyId = 'ztz99a2_qinglong' | 'vt4a1_baihu' | 't72b3_zhuque' | 't72b3m_xuanwu';
export type LongweiFamilyHost = 'ztz99a2' | 'vt4a1' | 't72b3_qilin' | 't72b3m_kunlun';

export interface LongweiFamilyMember {
  readonly id: LongweiFamilyId;
  readonly name: string;
  /** The fleet vehicle whose hull, running gear, hull package and mobility this concept keeps. */
  readonly host: LongweiFamilyHost;
  /** The tactical number on its turret. */
  readonly number: string;
  readonly kit: LongweiTurretKit;
  /** One line for the description and the concept record. */
  readonly summary: string;
  /** Listed height: the ground to the tallest fitting, the roof weapon included and the whips left out (measured). */
  readonly listedHeightM?: number;
  /** The main gun's depression stops by absolute turret yaw over this hull (tools/gun-depression-sweep.mjs, measured). */
  readonly gunPitchByYawDeg?: readonly (readonly [number, number])[];
}

/** On the ZTZ-99A2 / VT-4A1 hull: the VT-4A1's ring station (the Longwei turret's arrowhead and bustle land where the
 * VT-4A1's do, its cheek tips at z 1.95 and its basket 1.6 m short of the stern), seated 1.66 m up. That hull's turrets sit
 * down in a ring well (the deck round its ring 1.667 m, over their 1.56 m pivot); there the Longwei's mantlet chin stood
 * on the drawn seat race at every pitch ahead (the depression sweep: a whole-gun floor of +6 degrees at yaw 0-5). At 1.66
 * its chin keeps 3 cm over the race at full depression, and the core's underside rides 1.3 cm over the deck round the
 * ring (critic round 1: seated as on the Longwei's own hull, 1.737 m, a dark band showed under the turret). */
const ZTZ99A2_HULL_RING = Object.freeze([0, 1.66, 0.40]) as unknown as LongweiTurretKit['pivot'];
/** The Qilin's and Kunlun's Type 96B rings on the T-72B3 and T-72B3M hulls (nationalDonorTurrets.ts). */
/** Their gun stops over the ZTZ-99A2 hull at the 1.66 m seat (tools/gun-depression-sweep.mjs, the same on both, no mount
 * conflict): the full 7 degrees ahead; the hull's armour at 32-46 (to -6.1) and from 126 (to -2.1), its rear fittings
 * from 162 (to +4.1). */
const ZTZ99A2_HULL_GUN_STOPS = Object.freeze([[0,-7],[30,-7],[32,-6.5],[35,-6.1],[37,-6.1],[42,-6.8],[43,-6.6],[45,-6.6],[48,-7],[124,-7],[154,-2.6],[158,-2.2],[163,-2.1],[164,2],[165,3.3],[167,3.7],[172,4],[180,4.1]].map((r) => Object.freeze(r))) as readonly (readonly [number, number])[];
const T72B3_RING = Object.freeze([0, 1.457100315 + 0.040, 0.065591405]) as unknown as LongweiTurretKit['pivot'];
const T72B3M_RING = Object.freeze([0, 1.52948397398 + 0.020, 0.1143146502203]) as unknown as LongweiTurretKit['pivot'];

export const LONGWEI_FAMILY: readonly LongweiFamilyMember[] = Object.freeze([
  Object.freeze({
    id: 'ztz99a2_qinglong', name: 'ZTZ-99A2 Qinglong', host: 'ztz99a2', number: '911',
    kit: Object.freeze({ revision: 'longwei-qinglong-r264', pivot: ZTZ99A2_HULL_RING, faceEra: 'grid', sideEra: true,
      roofGun: 'rws', protection: 'gl5-plus', bustle: 'boxes', bustleCage: false, floodlight: false, blockCamo: false }),
    summary: 'the ZTZ-99A2 hull under a heavy modernized Longwei turret: a 3 x 2 grid of FY-5 cassettes on each arrowhead face, two rows on each side module, a remote 12.7 mm station, the GL-5-style suite with a rear launcher pair and closed armoured stowage round the bustle',
    listedHeightM: 3.28,
    gunPitchByYawDeg: ZTZ99A2_HULL_GUN_STOPS,
  }),
  Object.freeze({
    id: 'vt4a1_baihu', name: 'VT-4A1 Baihu', host: 'vt4a1', number: '941',
    // owner 2026-10-28: "add a big floodlight on thhe baihu"
    kit: Object.freeze({ revision: 'longwei-baihu-r264', pivot: ZTZ99A2_HULL_RING, faceEra: 'chevron', sideEra: true,
      roofGun: 'pintle', protection: 'lwr', bustle: 'bins', bustleCage: true, floodlight: true, blockCamo: true }),
    summary: 'the VT-4A1 hull under an export Longwei turret: V-ridged chevron cassettes on the arrowhead faces and cassettes on the side modules, a big searchlight right of the gun, laser-warning receivers in place of the hard-kill suite, the QJC-88 on its pintle and a slat screen round the bustle',
    listedHeightM: 3.014,
    gunPitchByYawDeg: ZTZ99A2_HULL_GUN_STOPS,
  }),
  Object.freeze({
    id: 't72b3_zhuque', name: 'T-72B3 Zhuque', host: 't72b3_qilin', number: '921',
    kit: Object.freeze({ revision: 'longwei-zhuque-r264', pivot: T72B3_RING, faceEra: 'pair', sideEra: true,
      roofGun: 'pintle', protection: 'gl5', bustle: 'boxes', bustleCage: false, floodlight: false, blockCamo: true }),
    summary: 'the Qilin\'s T-72B3 hull and Chinese package under the Longwei turret: its two large dual-reactive modules a face, cassettes on the side modules, the GL-5-style suite, the QJC-88 on its pintle and closed armoured stowage round the bustle',
    listedHeightM: 2.851,
    // its gun stops (tools/gun-depression-sweep.mjs, no mount conflict): the glacis fittings at 22-33 (to -4.9), the
    // side armour from 126 (to -4.8), the rear deck from 157 (to -6.8)
    gunPitchByYawDeg: Object.freeze([[0,-7],[21,-7],[22,-5.8],[23,-5.2],[28,-4.9],[30,-4.9],[32,-5.3],[33,-6],[34,-7],[126,-7],[134,-5.8],[145,-4.8],[147,-4.8],[154,-5.3],[157,-6.1],[163,-6.4],[164,-6.2],[178,-6.5],[180,-6.8]].map((r) => Object.freeze(r))) as readonly (readonly [number, number])[],
  }),
  Object.freeze({
    id: 't72b3m_xuanwu', name: 'T-72B3M Xuanwu', host: 't72b3m_kunlun', number: '931',
    // critic round 1: the 30 mm station stood taller than the turret; the QJC-88 on its pintle, as the owner asked of the
    // Kunlun and Qilin (release 227: "the more classic machine gunn emplacement")
    // owner 2026-10-28 ("properly varies"): its faces carry small tiles, so each of the four wears its own face pattern
    kit: Object.freeze({ revision: 'longwei-xuanwu-r264', pivot: T72B3M_RING, faceEra: 'tiles', sideEra: true,
      roofGun: 'pintle', protection: 'eyes', bustle: 'bins', bustleCage: false, floodlight: false, blockCamo: true }),
    summary: 'the Kunlun\'s T-72B3M hull and Chinese package under an assault Longwei turret: four columns of three small reactive tiles on each arrowhead face and cassettes on the side modules, infrared dazzlers and laser warners, and the QJC-88 on its pintle',
    listedHeightM: 2.903,
    // its gun stops (tools/gun-depression-sweep.mjs, no mount conflict): the glacis fittings and the skirts' fronts at
    // 17-53 (to -5.3), the skirts' rear from 117 (to -3.6), the rear deck from 155 (to -4.6)
    gunPitchByYawDeg: Object.freeze([[0,-7],[15,-7],[17,-6.4],[18,-5.6],[22,-5.3],[34,-5.3],[53,-6.2],[60,-7],[117,-7],[143,-3.8],[145,-3.6],[148,-3.6],[153,-3.9],[156,-4.6],[163,-3.9],[178,-4.1],[180,-4.5]].map((r) => Object.freeze(r))) as readonly (readonly [number, number])[],
  }),
]);

export const LONGWEI_FAMILY_IDS: readonly LongweiFamilyId[] = Object.freeze(LONGWEI_FAMILY.map((m) => m.id));

export function longweiFamilyMember(id: string): LongweiFamilyMember | undefined {
  return LONGWEI_FAMILY.find((m) => m.id === id);
}
