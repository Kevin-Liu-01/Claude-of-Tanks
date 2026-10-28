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
}

/** The ZTZ-99A2 / VT-4A1 ring (the VT-4A1's own datum on the shared ZTZ-99A2 hull): the Longwei turret's arrowhead and
 * bustle land where the VT-4A1's do, its cheek tips at z 1.95 and its basket 1.6 m short of the stern. */
const ZTZ99A2_HULL_RING = Object.freeze([0, 1.56, 0.40]) as unknown as LongweiTurretKit['pivot'];
/** The Qilin's and Kunlun's Type 96B rings on the T-72B3 and T-72B3M hulls (nationalDonorTurrets.ts). */
const T72B3_RING = Object.freeze([0, 1.457100315 + 0.040, 0.065591405]) as unknown as LongweiTurretKit['pivot'];
const T72B3M_RING = Object.freeze([0, 1.52948397398 + 0.020, 0.1143146502203]) as unknown as LongweiTurretKit['pivot'];

export const LONGWEI_FAMILY: readonly LongweiFamilyMember[] = Object.freeze([
  Object.freeze({
    id: 'ztz99a2_qinglong', name: 'ZTZ-99A2 Qinglong', host: 'ztz99a2', number: '911',
    kit: Object.freeze({ revision: 'longwei-qinglong-r264', pivot: ZTZ99A2_HULL_RING, faceEra: 'grid', sideEra: true,
      roofGun: 'rws', protection: 'gl5-plus', bustle: 'boxes', bustleCage: false }),
    summary: 'the ZTZ-99A2 hull under a heavy modernized Longwei turret: a 3 x 2 grid of FY-5 cassettes on each arrowhead face, two rows on each side module, a remote 12.7 mm station, the GL-5-style suite with a rear launcher pair and closed armoured stowage round the bustle',
  }),
  Object.freeze({
    id: 'vt4a1_baihu', name: 'VT-4A1 Baihu', host: 'vt4a1', number: '941',
    kit: Object.freeze({ revision: 'longwei-baihu-r264', pivot: ZTZ99A2_HULL_RING, faceEra: 'chevron', sideEra: false,
      roofGun: 'pintle', protection: 'lwr', bustle: 'bins', bustleCage: true }),
    summary: 'the VT-4A1 hull under an export Longwei turret: V-ridged chevron cassettes on the arrowhead faces, laser-warning receivers in place of the hard-kill suite, the QJC-88 on its pintle and a slat screen round the bustle',
  }),
  Object.freeze({
    id: 't72b3_zhuque', name: 'T-72B3 Zhuque', host: 't72b3_qilin', number: '921',
    kit: Object.freeze({ revision: 'longwei-zhuque-r264', pivot: T72B3_RING, faceEra: 'pair', sideEra: true,
      roofGun: 'pintle', protection: 'gl5', bustle: 'boxes', bustleCage: false }),
    summary: 'the Qilin\'s T-72B3 hull and Chinese package under the Longwei turret: its two large dual-reactive modules a face, cassettes on the side modules, the GL-5-style suite, the QJC-88 on its pintle and closed armoured stowage round the bustle',
  }),
  Object.freeze({
    id: 't72b3m_xuanwu', name: 'T-72B3M Xuanwu', host: 't72b3m_kunlun', number: '931',
    kit: Object.freeze({ revision: 'longwei-xuanwu-r264', pivot: T72B3M_RING, faceEra: 'chevron', sideEra: true,
      roofGun: 'cannon30', protection: 'eyes', bustle: 'bins', bustleCage: true }),
    summary: 'the Kunlun\'s T-72B3M hull and Chinese package under an assault Longwei turret: chevron cassettes on the arrowhead faces and cassettes on the side modules, infrared dazzlers and laser warners, a remote 30 mm cannon and a slat screen round the bustle',
  }),
]);

export const LONGWEI_FAMILY_IDS: readonly LongweiFamilyId[] = Object.freeze(LONGWEI_FAMILY.map((m) => m.id));

export function longweiFamilyMember(id: string): LongweiFamilyMember | undefined {
  return LONGWEI_FAMILY.find((m) => m.id === id);
}
