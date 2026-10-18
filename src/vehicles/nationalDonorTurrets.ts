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
  // moved forward as one piece, nothing ahead of z -1.27 moved); its rear flank fit gives way to the Qilin's own flank
  // sleeves (chinaDonorTurretKit.ts), and both whips stand on the right rear roof edge, at least 1.6 m from the
  // cupola emplacement and clear of the drone's dock on the right rear roof.
  t72b3_qilin: { donor: 'ztz99a2', pivot: ZTZ99A2_ON_T72B3, roofY: .83, station: ZTZ99A2_CUPOLA, heightM: 3.213,
    addedTurretEra: ['turret_era_L', 'turret_era_R'],
    // Release 227: its ring collar turns in place on the pivot, its skirt at r 1.08 inside the B3 deck's edge (x 1.11)
    // and 25 mm clear of the fenders' inner edge (the 99A2's own 1.14 m collar, 0.12 m behind the pivot, swept 11 mm
    // into the fender tops at yaw 110-250).
    builderOptions: { bustleCutM: QILIN_BUSTLE_CUT_M, rearFlank: false, antennaSeats: [[-1.20, -1.25], [-1.14, -.96]],
      ringCollar: { z: 0, radiusM: 1.08 } } },
  // Release 227 (cnClearance, 2026-10-17): the gun's depression by turret yaw, measured: at each degree the deepest pitch
  // keeping 26 mm between the whole gun (boot, box sight, barrel at recoil 0 and 0.135 m) and every hull mesh, on both
  // sides, then a conservative curve through each degree's shallowest neighbour. Over the front corners the barrel
  // passes over the hull lamps' armoured brows (yaw 20-32 deg: 1.3 deg of depression left), over the side boxes at
  // 111-115 deg, and over the rear fenders, shoulder covers and fuel drums aft of 133 deg (3.4-5.7 deg).
  t72b3m_kunlun: { donor: 'type96b', pivot: TYPE96B_ON_T72B3M, roofY: .70, station: TYPE96B_CUPOLA, heightM: 3.35,
    gunPitchByYawDeg: [[0, -6], [19, -6], [20, -4.8], [21, -2.4], [22, -1.5], [23, -1.3], [30, -1.3], [31, -1.7], [32, -3.1],
      [33, -6], [110, -6], [111, -5.3], [114, -5.3], [116, -6], [133, -5.7], [139, -4.2], [145, -3.4], [148, -3.4], [153, -3.8],
      [155, -4.9], [158, -4.8], [162, -3.8], [163, -3.7], [166, -3.7], [178, -4], [180, -4.5]],
    addedTurretEra: ['turret_era_L', 'turret_era_R'],
    // The Type 96B's 3 m rear whip would make the listed height (body and roof weapon: the sim's body height) 5.2 m.
    // Release 227: the boot's heel keeps the mantlet boot over the B3M driver's hatch at full elevation; the box sight
    // rides the boot on the gun's pitch group (the fleet 96B's turret-fixed one stands inside the pitching boot).
    builderOptions: { mastTopY: 3.40, bootHeel: true, boxSightOnGun: true } },
  // The Yun keeps its faceted station on its own left-roof seat beside the 96B commander's cupola, as on its cast turret
  // (the cupola's latch clevis and periscopes stand inside the station's bearing ring; release 227: the seat 15 mm
  // further from the 96B mast stem, so the station's side box keeps 25 mm from it facing right at 29 deg in recoil);
  // the 96B's open side bins and twelve cheek launchers give way to the Yun's armour housings and its own eight roof
  // smoke tubes.
  // Its depression by turret yaw is measured as the Kunlun's (26 mm from every hull mesh): over the front corners the
  // barrel passes over the paired lamps' armoured brows (yaw 22-33 deg: 3.4-4.9 deg left), and aft of 158 deg over the
  // engine deck's cooling panels, their leafy net and the slatted transom (3.4-5.1 deg).
  t80u_yun: { donor: 'type96b', pivot: TYPE96B_ON_T80U, roofY: .70, station: [.392, -.607], heightM: 3.212,
    gunPitchByYawDeg: [[0, -6], [21, -6], [23, -4], [24, -3.8], [28, -3.6], [30, -3.6], [32, -4], [33, -4.9], [34, -6], [157, -6],
      [159, -5.1], [160, -4.9], [163, -4.5], [166, -4.5], [167, -4], [169, -3.5], [172, -3.4], [174, -3.4], [180, -3.6]],
    addedTurretEra: ['turret_era_L', 'turret_era_R'],
    builderOptions: { mastTopY: 3.20, bins: false, smoke: false, bootHeel: true, boxSightOnGun: true } },
  t72b3m_hetman: { donor: 't72b3m_2016', pivot: T72B3M_RING, roofY: .82, station: T72B3M_CUPOLA, heightM: 3.382 },
  // Release 227 (owner 2026-10-16: "brand new era packages ... donnt make it just copy the t90ms"): Hetman II and both
  // Zubrs fit their own frontal ERA (ukraineFrontEra.ts, polandFrontEra.ts), so the donor's Relikt cells, their beams
  // and its roof cassettes are not emitted on them. The Zubrs' heights are their lower 12.7 mm WKM-B emplacements'
  // (the sight box tops them: 3.2627 -> 3.0777, 3.3227 -> 3.1077).
  t72b3m_hetman_ii: { donor: 't72b3m_2016', pivot: T72B3M_RING, roofY: .82, station: T72B3M_CUPOLA, heightM: 3.402,
    builderOptions: { reliktEra: false } },
  t72b3_sich: { donor: 't72b3', pivot: T72B3_RING, roofY: .82, station: T72B3_CUPOLA_RING, heightM: 3.305 },
  t72b3_zubr: { donor: 't72b3m_2016', pivot: T72B3M_ON_T72B3, roofY: .82, station: T72B3M_CUPOLA, heightM: 3.0777,
    builderOptions: { reliktEra: false } },
  t72b3_zubr_ii: { donor: 't72b3m_2016', pivot: T72B3M_ON_T72B3, roofY: .82, station: T72B3M_CUPOLA, heightM: 3.1077,
    builderOptions: { reliktEra: false } },
};

export const NATIONAL_DONOR_TURRET_IDS = Object.freeze(Object.keys(NATIONAL_DONOR_TURRETS));

/**
 * Release 227: the lowest main-gun pitch by absolute turret yaw (degrees, in the gunPitchLimits format: yaw 0..180 from
 * the hull's front, minimum pitch). The brief's defect 3: the gun's full depression over the rear arc cut the deck stock
 * (the Zubr's deck cases, the Zubr II's deck cabinets, the Hetman II's T-72B3M engine deck). Round 2 (2026-10-16, the
 * critic's D7: "at the -6 the curves keep in the front arc, the whole main gun still cuts existing hull stock"): over the
 * front quarters too, where the barrel at -6 met the front skirt bays' straps, rails and modules (the Zubrs, yaw 32-47)
 * and the hull package's skirt fronts (Hetman II, yaw 26-52); dead ahead and broadside the gun keeps its -6. Each
 * station is the lowest pitch, in half degrees, at which the whole gun (recoil 0 and -.135) keeps its barrel 1.5 cm off
 * every hull stock triangle and its mantlet off all of them, at that yaw and both neighbouring degrees (the lane's
 * gunclear probe, 1 degree steps over 0..180, both sides). Data only: sim/gunPitchLimits.ts applies it; matchRuleset.ts is
 * untouched.
 */
export const NATIONAL_GUN_PITCH_BY_YAW: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  t72b3m_hetman_ii: [[0,-6],[25,-6],[26,-5.5],[27,-5],[29,-5],[30,-5.5],[37,-5.5],[38,-6],[39,-6],[40,-5.5],[43,-5.5],[44,-6],[46,-6],[47,-5.5],[48,-5],[51,-5],[52,-5.5],[53,-6],[129,-6],[130,-5.5],[131,-5],[132,-4],[133,-3.5],[134,-3.5],[135,-3],[139,-3],[140,-3.5],[141,-3],[142,-2.5],[160,-2.5],[161,1.5],[162,2],[166,2],[167,2.5],[171,2.5],[172,2],[180,2]],
  t72b3_zubr: [[0,-6],[31,-6],[32,-5.5],[33,-5],[35,-5],[36,-4.5],[38,-4.5],[39,-4],[41,-4],[42,-4.5],[43,-4.5],[44,-5],[45,-5.5],[47,-5.5],[48,-6],[128,-6],[129,-5.5],[133,-5.5],[134,-5],[135,-5],[136,-4.5],[137,-4.5],[138,-4],[142,-4],[143,-3.5],[144,-1.5],[145,-1],[147,-1],[148,-0.5],[149,0],[152,0],[153,-0.5],[156,-0.5],[157,-1],[159,-1],[160,-1.5],[161,-2.5],[162,-5.5],[163,-5],[167,-5],[168,-5.5],[172,-5.5],[173,-6],[180,-6]],
  t72b3_zubr_ii: [[0,-6],[31,-6],[32,-5],[33,-4.5],[42,-4.5],[43,-5],[45,-5],[46,-5.5],[47,-5.5],[48,-6],[129,-6],[130,-5.5],[131,-5.5],[132,-4.5],[133,-4],[134,-3],[135,-3],[136,-2.5],[137,-2],[143,-2],[144,-1.5],[145,-1],[158,-1],[159,-1.5],[160,-2],[161,-5.5],[162,-5],[164,-5],[165,-5.5],[168,-5.5],[169,-6],[171,-6],[172,-5.5],[179,-5.5],[180,-6]],
};
