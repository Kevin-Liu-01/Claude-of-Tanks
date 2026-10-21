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
  /** The pintle socket a cupola emplacement (loadout mount 'pintle') stands in, at `station` on the cupola's rim. */
  socket?: NationalPintleSocket;
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

/**
 * Release 227, round 4 (geometry critic D10, visual critic S1: the emplacement's pintle column stood on the commander's
 * hatch lid, so the hatch could not open): a classic rim mount. The pintle stands in a socket post on the turret roof
 * at the cupola's rim, welded 4 mm into the cupola's fixed ring, its top collar the pintle flange's seat; the lid inside
 * the ring stays free. Turret frame, metres.
 */
export interface NationalPintleSocket {
  /** The cupola's centre in plan. */
  cupola: readonly [number, number];
  /** The commander's hatch lid's radius round the cupola's centre (the post and the pintle's foot stay outside it). */
  lidR: number;
  /** The outer radius of the cupola's fixed ring the post is welded to. */
  ringR: number;
  /** The socket's top (the pintle flange's seat). */
  topY: number;
  /** The post's radius (its collar is 6 mm wider). */
  postR: number;
  /** A web plate welding a tall post to the cupola under its ring's top edge: its inner end's radius (in the cupola's
   * stock) and its top. */
  web?: { readonly innerR: number; readonly topY: number };
}

/** A socket at `bearingDeg` round the cupola (0 = turret forward, +Z; positive toward +X), welded 4 mm into its ring. */
function rimSocket(cupola: readonly [number, number], bearingDeg: number, s: Omit<NationalPintleSocket, 'cupola'>):
  { station: readonly [number, number]; socket: NationalPintleSocket } {
  const a = bearingDeg * Math.PI / 180, r = s.ringR + s.postR - .004;
  return { station: [cupola[0] + Math.sin(a) * r, cupola[1] + Math.cos(a) * r], socket: { cupola, ...s } };
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
// Release 227, round 4 (critics D10, S1): the QJC-88 emplacements' pintle sockets on the cupolas' rims, off the hatch
// lids. Each stands 22.5 degrees off the turret's forward line toward the gun's feed side (+X), so the ammunition can
// faces away from the hatch: on the 99A2 cupola (ring r .279 over its lid's .251) clear of its periscope at the inboard
// rim; on the Type 96B cupola (fixed ring r .377, lid inside the periscope ring at r .276) between its forward and its
// forward-inboard periscopes and beside the lid's forward latch. The 96B's roof falls away ahead of the cupola, so the
// Kunlun's post stands 0.25 m tall, welded to the cupola's base and ring by a web plate up to 7 mm under the ring's top.
const QILIN_SOCKET = rimSocket(ZTZ99A2_CUPOLA, 22.5, { lidR: .251, ringR: .279, topY: .905, postR: .046 });
const KUNLUN_SOCKET = rimSocket(TYPE96B_CUPOLA, 22.5, { lidR: .276, ringR: .377, topY: .91, postR: .046,
  web: { innerR: .352, topY: .822 } });

/** The Qilin's bustle cut (metres): 10 % of the ZTZ-99A2 body's 3.954 m front-to-rear length. */
export const QILIN_BUSTLE_CUT_M = .395;

export const NATIONAL_DONOR_TURRETS: Readonly<Record<string, NationalDonorTurret>> = {
  // Release 227 (owner 2026-10-16: "also make the qqilin turret 10% shorter ... and redesign the qilin turret around this
  // principle"): the 99A2 bustle loses 0.395 m (donorBustleCut.ts: the body 3.954 -> 3.559 m, the rear armour assembly
  // moved forward as one piece, nothing ahead of z -1.27 moved); its rear flank fit gives way to the Qilin's own flank
  // sleeves (chinaDonorTurretKit.ts), and both whips stand on the right rear roof edge, at least 1.6 m from the
  // cupola emplacement and clear of the drone's dock on the right rear roof.
  t72b3_qilin: { donor: 'ztz99a2', pivot: ZTZ99A2_ON_T72B3, roofY: .83, ...QILIN_SOCKET, heightM: 3.213,
    addedTurretEra: ['turret_era_L', 'turret_era_R'],
    // Release 227: its ring collar turns in place on the pivot, its skirt at r 1.08 inside the B3 deck's edge (x 1.11)
    // and 25 mm clear of the fenders' inner edge (the 99A2's own 1.14 m collar, 0.12 m behind the pivot, swept 11 mm
    // into the fender tops at yaw 110-250).
    builderOptions: { bustleCutM: QILIN_BUSTLE_CUT_M, rearFlank: false, antennaSeats: [[-1.20, -1.25], [-1.14, -.96]],
      ringCollar: { z: 0, radiusM: 1.08 } } },
  // Release 227 (cnClearance, 2026-10-17): the gun's depression by turret yaw, measured: at each degree the deepest pitch
  // keeping 26 mm between the whole gun (boot, box sight, barrel at recoil 0 and 0.135 m) and every hull mesh, on both
  // sides, then a conservative curve through each degree's shallowest neighbour. Round 5 (critic CN5-05): the hull lamps
  // left the deck for cowls on the glacis corners (nationalChina.ts glacisLampCowl), where the gun at -6 deg passes 25 mm
  // over them, so the front arc depresses the full 6 deg (it had 1.3 deg left over the 226 lamp brows at yaw 20-32). Left:
  // the skirts' tops at 111-114 deg (5.3 deg) and, aft of 133 deg, the hull deck's rear edge, the skirts' rear ends and
  // the engine deck's cooling panels (3.4-5.7 deg): the Type 96B's trunnion stands 0.26 m over the ring, and at -6 deg
  // the barrel meets the deck itself there.
  t72b3m_kunlun: { donor: 'type96b', pivot: TYPE96B_ON_T72B3M, roofY: .70, ...KUNLUN_SOCKET, heightM: 3.35,
    gunPitchByYawDeg: [[0, -6], [110, -6], [111, -5.3], [114, -5.3], [116, -6], [133, -5.7], [139, -4.2], [145, -3.4], [148, -3.4], [153, -3.8],
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
  // Its depression by turret yaw is measured as the Kunlun's (26 mm from every hull mesh). Round 5 (critic CN5-05): its
  // paired lamps sit in cowls on the glacis corners under the gun's -6 deg sweep, so the whole front arc to 157 deg
  // depresses 6 deg (it had 3.4-4.9 deg over the 226 lamp brows at yaw 22-33); aft of 158 deg the barrel passes over
  // the hull deck's rear edge, the engine deck's cooling panels, their leafy net and the slatted transom (3.4-5.1 deg).
  t80u_yun: { donor: 'type96b', pivot: TYPE96B_ON_T80U, roofY: .70, station: [.392, -.607], heightM: 3.212,
    gunPitchByYawDeg: [[0, -6], [157, -6],
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
 * The lowest main-gun pitch by absolute turret yaw (degrees, in the gunPitchLimits format: yaw 0..180 from the hull's
 * front, minimum pitch) of the national concepts whose gun meets its own hull at full depression. Release 227 put the
 * first rows here (the Zubrs' and the Hetman II's rear decks and front skirt bays, 1.5 cm off the hull). The follow-up
 * (2026-10-20, the CN lane's cnClearance method carried to every national concept) re-measures each with
 * tools/gun-depression-sweep.mjs: at every degree, both sides, the lowest pitch keeping the whole gun (mantlet, boot,
 * sights, and the barrel at recoil 0 and 0.135 m) 26 mm off every hull mesh, nets included. Each curve is then fitted
 * conservatively through each degree's shallowest neighbour, keeping the full -6 wherever it is clear. The Zubr II's
 * curve covers its geometry on both this branch and item/vehicles-uapl-era-227 (--envelope). What the rows stop:
 * - front quarters: the barrel over the skirt bays' fronts, rails and modules (Sich, Hetman, both Zubrs, Hetman II, yaw
 *   26-55);
 * - the rear: the barrel over the engine deck's grilles, its deck cases and cabinets and their nets (the Zubrs need about
 *   level at 149-157, the Hetman II +2.4 over its T-72B3M engine deck, the Wilk +0.6), the T-80Us' rear hull from 141-159;
 * - straight ahead on the Bulat-M and Bastion-M, the mantlet's chin over the glacis armour and the driver's periscope
 *   (-2.9 and -3.9 at yaw 0-20).
 * Two standing mantlet conflicts no depression stop cures are left to the geometry (nationalGunClearance.selftest.mjs
 * holds only the barrel there):
 * - the T-72B3M turret's mantlet underside 6-18 mm over the driver's hatch at yaw 0-25 at every pitch (Hetman, Hetman II,
 *   Zubr, Zubr II; the fleet T-72B3M has it too);
 * - the T-72B3M hull's right-side fitting under the turret overhang (x -1.26, y 1.57-1.58), which the mantlet's lower
 *   corner passes through at yaw -48..-133 (the Hetman II, as on the fleet T-72B3M).
 * Data only: sim/gunPitchLimits.ts applies it; matchRuleset.ts is untouched.
 */
export const NATIONAL_GUN_PITCH_BY_YAW: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  t72b3m_hetman: [[0,-6],[25,-6],[26,-5.3],[27,-5],[29,-5],[35,-5.5],[42,-5.5],[43,-5.3],[46,-5.3],[48,-6],[124,-6],[126,-5],[127,-4.8],[129,-4.8],[134,-5.5],[135,-4.5],[137,-3.5],[138,-3.2],[139,-3.1],[150,-3.2],[151,-3.3],[152,-4.1],[161,-3.9],[163,-3.6],[180,-4.1]],
  t72b3m_hetman_ii: [[0,-6],[25,-6],[26,-5.4],[27,-5.1],[40,-5.5],[41,-5.3],[47,-5.3],[48,-4.9],[49,-4.7],[51,-4.7],[52,-4.9],[55,-6],[122,-6],[123,-5.5],[124,-5.3],[127,-5.3],[129,-5.7],[130,-4.8],[132,-3.7],[133,-3.3],[135,-2.8],[136,-2.7],[139,-2.7],[141,-2.8],[142,-2.3],[144,-2.2],[160,-2.1],[161,1.5],[162,2.1],[168,2.4],[180,2.3]],
  t72b3_sich: [[0,-6],[31,-6],[32,-5.5],[35,-4.5],[38,-4.5],[39,-4.6],[44,-5.3],[45,-5.3],[46,-5.5],[48,-6],[132,-6],[134,-5.5],[135,-4.8],[136,-4.5],[142,-4.4],[146,-4.1],[150,-4.1],[151,-4.2],[156,-5.8],[159,-6],[180,-6]],
  t72b3_zubr: [[0,-6],[30,-6],[31,-5.2],[32,-4.8],[35,-4],[38,-3.8],[41,-3.8],[43,-4],[44,-4.4],[46,-5.3],[53,-6],[126,-6],[128,-5.5],[134,-4.7],[137,-3.9],[140,-3.8],[142,-3.8],[144,-1.4],[145,-0.8],[149,0],[152,0],[158,-0.2],[160,-1.3],[161,-2.1],[162,-4.8],[165,-4.8],[178,-5.5],[179,-5.5],[180,-5.8]],
  t72b3_zubr_ii: [[0,-6],[31,-6],[32,-4.9],[33,-4.3],[35,-4.2],[42,-4.3],[44,-4.6],[50,-6],[117,-6],[118,-5.8],[120,-5.8],[122,-6],[125,-6],[131,-5],[132,-4],[133,-3.2],[137,-1.5],[138,-1.4],[141,-1.4],[143,-1.7],[144,-1.3],[145,-1],[149,-0.5],[153,-0.3],[157,-0.3],[158,-0.4],[159,-1],[160,-1.8],[161,-3.2],[162,-5],[163,-4.9],[179,-5.2],[180,-5.3]],
  t80u_zoria: [[0,-6],[157,-6],[160,-5.1],[163,-5],[180,-5.4]],
  t80u_husarz: [[0,-6],[139,-6],[150,-4.4],[151,-4.1],[152,-3.9],[156,-3.9],[161,-4.5],[162,-4.1],[165,-3.9],[177,-4.1],[180,-4.5]],
  t72b3m_wilk: [[0,-6],[25,-6],[30,-5.3],[33,-5.3],[37,-6],[124,-6],[125,-5.9],[136,-5.2],[139,-4.5],[141,-4.3],[142,-2],[143,-0.6],[144,-0.1],[149,0.5],[152,0.6],[157,0.5],[161,0],[162,-0.4],[163,-1.6],[164,-4.2],[179,-4.4],[180,-4.6]],
  t80u_bars_m: [[0,-6],[155,-6],[159,-5],[163,-4.5],[169,-4.6],[179,-5],[180,-5.3]],
  t72b3m_bulat_m: [[0,-3.6],[1,-3.3],[2,-3.1],[15,-2.9],[17,-3.4],[19,-4.6],[20,-4.6],[21,-5.7],[22,-6],[25,-6],[30,-5.3],[32,-5.1],[34,-5.1],[35,-5.2],[37,-5.6],[38,-6],[43,-6],[44,-5.9],[46,-5.9],[47,-6],[54,-6],[56,-5.8],[65,-5.7],[66,-5.1],[67,-4.7],[68,-4.5],[71,-4.5],[72,-4.6],[75,-5.8],[87,-5.7],[89,-4.5],[91,-4.3],[93,-4.3],[94,-4.5],[95,-4.9],[96,-5.6],[109,-5.6],[111,-4.4],[113,-4.1],[115,-4.1],[117,-4.6],[120,-5.5],[124,-5.4],[127,-5.4],[129,-5.6],[130,-4.9],[131,-4.5],[137,-4.2],[138,-3.7],[139,-3.5],[144,-3.6],[152,-4.3],[153,-3.6],[154,-2.2],[155,-1.6],[156,-1.3],[161,-1.1],[163,-1.2],[164,-1.5],[165,-2.3],[166,-4.7],[179,-5],[180,-5.2]],
  t72b3_bastion_m: [[0,-4.4],[5,-3.9],[7,-3.9],[11,-4.7],[17,-4.7],[20,-4.8],[22,-6],[73,-6],[75,-5.6],[77,-5.6],[80,-6],[100,-6],[103,-5.4],[105,-5.4],[106,-5.5],[108,-6],[128,-6],[129,-5.4],[130,-5],[136,-4.8],[137,-4.2],[138,-4],[139,-3.9],[142,-3.9],[149,-4.8],[152,-5.3],[154,-3.9],[155,-3.4],[158,-2.9],[162,-2.9],[163,-3],[164,-3.4],[165,-4.4],[166,-6],[180,-6]],
};
