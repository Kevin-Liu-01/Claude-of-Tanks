// Owner 2026-10-15 (VEH-19..VEH-22): seven national T-72-family concepts carry a
// real fleet turret, built by that turret's own builder, with their national
// equipment fitted on top. Data only: the spec registry reads it without
// loading a geometry pack.
//   "for the t72nn3 qilin, adopt its turret to actually use the ztz-99a2 turret and make the kunlun usee the type 96b
//    turret except with the special era, autocannon, shtora eyes"
//   "make the t72 b3m hetman and t72 b3 sich use turrets properly based off the t72 b3m 2016, t72 b3, exceept obviously
//    up armored annnd using modern autocannon and cages and the leaves and lights and ERa and other emplacements"
//   "make the t72b3 zubr turret properly based off the t72 b3m 2016, except obvioulsy up armored annnd using modern
//    autocannon and cages and the leaves and lights and ERa and other emplacements"

export type NationalTurretDonorId = 't72b3' | 't72b3m_2016' | 'ztz99a2' | 'type96b';
type Point3 = readonly [number, number, number];

export interface NationalDonorTurret {
  /** The fleet vehicle whose turret builder, turret armour, turret modules and crew this concept reuses. */
  donor: NationalTurretDonorId;
  /** The turret ring's centre on this vehicle's hull (hull frame, metres). */
  pivot: Point3;
  /** The turret's structural roof in its own frame (P.topY). */
  roofY: number;
  /** Plan seat of the fitted remote weapon station in the turret frame: the commander's cupola, whose own gun it replaces,
   * or a roof seat of its own beside it (release 227: the Yun's faceted station keeps its left-roof seat apart from the
   * Type 96B cupola, as on its cast turret). */
  station: readonly [number, number];
  /** National turret ERA sectors the kit adds where the donor turret has no ERA plate of that name. */
  addedTurretEra?: readonly string[];
  /** The main gun's mechanical depression stops over the rear deck (sim/gunPitchLimits.ts: absolute hull-relative yaw
   * 0..180 degrees, minimum pitch degrees), measured with the gun's sweep over this hull's deck fittings. */
  gunPitchByYawDeg?: readonly (readonly [number, number])[];
  /** Listed overall height (ground to the tallest fitting, the roof weapon included), measured on the built concept. */
  heightM?: number;
  /** Extra options for the donor's own turret builder; each defaults to the donor's own output (e.g. antennaSeats for the
   * ZTZ-99A2: whips moved out of the concept station's sweep). */
  builderOptions?: Readonly<Record<string, unknown>>;
}

// The T-72B3 and T-72B3M rings sit exactly where their own hulls carry them. A T-72B3M turret on the T-72B3 hull keeps
// its casting's lower edge where the T-72B3's own casting meets that roof (1.446 m); the Type 96B shell's floor meets
// the T-72B3M roof (1.5295 m) as it meets its own hull's; the 99A2 shell's lower course lands on the T-72B3 roof.
const T72B3_RING: Point3 = [.0000002374, 1.457100315, .065591405];
const T72B3M_RING: Point3 = [.0000072471277, 1.52948397398, .1143146502203];
const T72B3M_ON_T72B3: Point3 = [0, 1.446 + (1.52948397398 - 1.5153), .065591405];
// CN lane 2026-10-15: the Type 96B ring rides 20 mm above the B3M roof so the 96B mantlet chin clears the driver's
// hatch, the shoulder covers and the engine-deck louvres at the gun's full 6 degree depression at every yaw (it cut the
// louvres by 5 mm at yaw 165); the 99A2 ring rides 54 mm above the B3 roof so the chevrons' lower returns (turret-local
// y -0.04) clear the B3 roof by 12 mm at every yaw instead of sitting 42 mm inside it. The rings' own collars bridge
// the running gap.
const TYPE96B_ON_T72B3M: Point3 = [0, 1.52948397398 + .020, .1143146502203];
// Release 227: 2 mm higher again, so the 99A2 shell's lower course passes 25 mm over the B3 driver's hatch at every yaw
// (23.5 mm at yaw 290).
// Release 227 (owner 2026-10-16: "make the yun keep all its extra add ons and modifications but altered slightly to be
// wrapped around the type 96b turret base"): the Type 96B ring rides 40 mm above the T-80U's own yaw datum, so the 96B
// shell's floor and the Yun's wrap clear the T-80U roof and its drums at every yaw; where the 96B barrel (its trunnion
// 0.85 m further forward and 68 mm lower than the cast Yun's) would meet the T-80U's front lamp brows and its slatted
// transom, its depression stops follow the measured clearance (gunPitchByYawDeg below). A stationary ring race on the
// hull closes the running gap under the collar (nationalChina.ts yunRingRace).
const TYPE96B_ON_T80U: Point3 = [0, 1.55158 + .040, .0718698169];
const ZTZ99A2_ON_T72B3: Point3 = [0, 1.457100315 + .056, .065591405];

// Commander's cupolas in each donor's turret frame (their builders' own datums).
// The T-72B3 cupola's raised hatch ring (t72b3X.ts roofEquipment: r .358 at -.61355, -.363), its seat 70 mm aft of the
// ring's centre so the station's 260 mm yaw base clears the commander's sight block on the ring's front edge.
const T72B3_CUPOLA_RING = [-.61355 - .0000002374, -.363 - .065591405 - .07] as const;
const T72B3M_CUPOLA = [-.62689 - .0000072471277, -.24424 - .1143146502203] as const;
const ZTZ99A2_CUPOLA = [.52, -.88] as const;
const TYPE96B_CUPOLA = [-.592, -.045 + .15] as const;

/** The Qilin's bustle cut (metres): 10 % of the ZTZ-99A2 body's 3.954 m front-to-rear length. */
export const QILIN_BUSTLE_CUT_M = .395;

export const NATIONAL_DONOR_TURRETS: Readonly<Record<string, NationalDonorTurret>> = {
  // Release 227 (owner 2026-10-16: "also make the qqilin turret 10% shorter ... and redesign the qilin turret around this
  // principle"): the 99A2 bustle loses 0.395 m (donorBustleCut.ts: the body 3.954 -> 3.559 m, the rear armour assembly
  // moved forward as one piece, nothing ahead of z -1.27 moved); its rear flank fit gives way to the Qilin's own rear
  // flank housings (chinaDonorTurretKit.ts), and both whips stand on the right rear roof edge, at least 1.6 m from the
  // cupola emplacement and clear of the drone's dock on the right rear roof.
  t72b3_qilin: { donor: 'ztz99a2', pivot: ZTZ99A2_ON_T72B3, roofY: .83, station: ZTZ99A2_CUPOLA, heightM: 3.213,
    addedTurretEra: ['turret_era_L', 'turret_era_R'],
    builderOptions: { bustleCutM: QILIN_BUSTLE_CUT_M, rearFlank: false, antennaSeats: [[-1.20, -1.25], [-1.14, -.96]] } },
  // Release 227: the gun's depression over the rear deck stops at 5 degrees, so the barrel clears the engine-deck
  // cooling panels' slats by 25 mm (it came within 15 mm at 6 degrees, yaw 165-195).
  t72b3m_kunlun: { donor: 'type96b', pivot: TYPE96B_ON_T72B3M, roofY: .70, station: TYPE96B_CUPOLA, heightM: 3.35,
    gunPitchByYawDeg: [[0, -6], [150, -6], [158, -5], [180, -5]],
    addedTurretEra: ['turret_era_L', 'turret_era_R'],
    // The Type 96B's 3 m rear whip would make the listed height (body and roof weapon: the sim's body height) 5.2 m.
    // Release 227: the boot's heel keeps the mantlet boot over the B3M driver's hatch at full elevation.
    builderOptions: { mastTopY: 3.40, bootHeel: true } },
  // The Yun keeps its faceted station on its own left-roof seat beside the 96B commander's cupola, as on its cast turret
  // (the cupola's latch clevis and periscopes stand inside the station's bearing ring); the 96B's open side bins and
  // twelve cheek launchers give way to the Yun's armour housings and its own eight roof smoke tubes.
  // Its depression over the transom stops at 5 degrees at yaw 159-166 (the slatted transom plate).
  t80u_yun: { donor: 'type96b', pivot: TYPE96B_ON_T80U, roofY: .70, station: [.40, -.62], heightM: 3.222,
    gunPitchByYawDeg: [[0, -6], [156, -6], [159, -5], [166, -5], [169, -6], [180, -6]],
    addedTurretEra: ['turret_era_L', 'turret_era_R'],
    builderOptions: { mastTopY: 3.20, bins: false, smoke: false, bootHeel: true } },
  t72b3m_hetman: { donor: 't72b3m_2016', pivot: T72B3M_RING, roofY: .82, station: T72B3M_CUPOLA, heightM: 3.382 },
  t72b3m_hetman_ii: { donor: 't72b3m_2016', pivot: T72B3M_RING, roofY: .82, station: T72B3M_CUPOLA, heightM: 3.402 },
  t72b3_sich: { donor: 't72b3', pivot: T72B3_RING, roofY: .82, station: T72B3_CUPOLA_RING, heightM: 3.305 },
  t72b3_zubr: { donor: 't72b3m_2016', pivot: T72B3M_ON_T72B3, roofY: .82, station: T72B3M_CUPOLA, heightM: 3.2627 },
  t72b3_zubr_ii: { donor: 't72b3m_2016', pivot: T72B3M_ON_T72B3, roofY: .82, station: T72B3M_CUPOLA, heightM: 3.3227 },
};

export const NATIONAL_DONOR_TURRET_IDS = Object.freeze(Object.keys(NATIONAL_DONOR_TURRETS));
