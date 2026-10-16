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
  /** Plan seat of the fitted remote weapon station in the turret frame: the commander's cupola, whose own gun it replaces. */
  station: readonly [number, number];
  /** National turret ERA sectors the kit adds where the donor turret has no ERA plate of that name. */
  addedTurretEra?: readonly string[];
  /** A machined adapter collar between the cupola's top and the station's pedestal (metres), where the station's barrel
   * at full depression must clear a tall donor sight beside the cupola. */
  stationRiserM?: number;
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
const ZTZ99A2_ON_T72B3: Point3 = [0, 1.457100315 + .054, .065591405];

// Commander's cupolas in each donor's turret frame (their builders' own datums).
// The T-72B3 cupola's raised hatch ring (t72b3X.ts roofEquipment: r .358 at -.61355, -.363), its seat 70 mm aft of the
// ring's centre so the station's 260 mm yaw base clears the commander's sight block on the ring's front edge.
const T72B3_CUPOLA_RING = [-.61355 - .0000002374, -.363 - .065591405 - .07] as const;
const T72B3M_CUPOLA = [-.62689 - .0000072471277, -.24424 - .1143146502203] as const;
const ZTZ99A2_CUPOLA = [.52, -.88] as const;
const TYPE96B_CUPOLA = [-.592, -.045 + .15] as const;

export const NATIONAL_DONOR_TURRETS: Readonly<Record<string, NationalDonorTurret>> = {
  // The 99A2's right-rear whip stood inside the Qilin station's sweep from the cupola: it moves to the bustle corner.
  t72b3_qilin: { donor: 'ztz99a2', pivot: ZTZ99A2_ON_T72B3, roofY: .83, station: ZTZ99A2_CUPOLA, stationRiserM: .055, heightM: 3.3286,
    builderOptions: { antennaSeats: [[-1.06, -1.58], [1.06, -2.00]] } },
  t72b3m_kunlun: { donor: 'type96b', pivot: TYPE96B_ON_T72B3M, roofY: .70, station: TYPE96B_CUPOLA, heightM: 3.48048,
    addedTurretEra: ['turret_era_L', 'turret_era_R'],
    // The Type 96B's 3 m rear whip would make the listed height (body and roof weapon: the sim's body height) 5.2 m.
    builderOptions: { mastTopY: 3.40 } },
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
 * Release 227 (the coordinator's brief, defect 3): the lowest main-gun pitch by absolute turret yaw (degrees, in the
 * gunPitchLimits format: yaw 0..180 from the hull's front, minimum pitch) where the gun's full depression over the rear
 * arc cut the deck stock (the Zubr's deck cases, the Zubr II's deck cabinets, the Hetman II's T-72B3M engine deck). Each
 * station is the lowest pitch, in half degrees, at which the gun (recoil 0 and -.135) clears every hull stock triangle
 * by 1.5 cm at that yaw and both neighbouring degrees (probe-gunpitch, 1 degree steps over the rear arc); the front arc
 * keeps its -6 degrees. Data only: sim/gunPitchLimits.ts applies it; matchRuleset.ts is untouched.
 */
export const NATIONAL_GUN_PITCH_BY_YAW: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  t72b3m_hetman_ii: [[0,-6],[129,-6],[130,-5.5],[131,-5],[132,-4],[133,-3.5],[134,-3.5],[135,-3],[139,-3],[140,-3.5],[141,-3],[142,-2.5],[160,-2.5],[161,1.5],[162,2],[166,2],[167,2.5],[171,2.5],[172,2],[180,2]],
  t72b3_zubr: [[0,-6],[128,-6],[129,-5.5],[133,-5.5],[134,-5],[135,-5],[136,-4.5],[137,-4.5],[138,-4],[142,-4],[143,-3.5],[144,-1.5],[145,-1],[147,-1],[148,-0.5],[149,0],[152,0],[153,-0.5],[156,-0.5],[157,-1],[159,-1],[160,-1.5],[161,-2.5],[162,-5.5],[163,-5],[167,-5],[168,-5.5],[172,-5.5],[173,-6],[180,-6]],
  t72b3_zubr_ii: [[0,-6],[129,-6],[130,-5.5],[131,-5.5],[132,-4.5],[133,-4],[134,-3],[135,-3],[136,-2.5],[137,-2],[143,-2],[144,-1.5],[145,-1],[158,-1],[159,-1.5],[160,-2],[161,-5.5],[162,-5],[164,-5],[165,-5.5],[168,-5.5],[169,-6],[171,-6],[172,-5.5],[179,-5.5],[180,-6]],
};
