// Owner 2026-10-15 (VEH-19..VEH-22): seven national T-72-family concepts carry a
// real fleet turret, built by that turret's own builder, with their national
// equipment fitted on top. Data only: the spec registry reads it without
// loading a geometry pack.
//   "for the t72nn3 qilin, adopt its turret to actually use the ztz-99a2 turret and make the kunlun usee the type 96b
//    turret except with the special era, autocannon, shtora eyes"
//   252: "redesign the qilin around a type 96b inspired Yun like turret"
//   "make the t72 b3m hetman and t72 b3 sich use turrets properly based off the t72 b3m 2016, t72 b3, exceept obviously
//    up armored annnd using modern autocannon and cages and the leaves and lights and ERa and other emplacements"
//   "make the t72b3 zubr turret properly based off the t72 b3m 2016, except obvioulsy up armored annnd using modern
//    autocannon and cages and the leaves and lights and ERa and other emplacements"

export type NationalTurretDonorId = 't72b3' | 't72b3m_2016' | 'type96b';
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
  /** Extra options for the donor's own turret builder; each defaults to the donor's own output (e.g. bins: false for the
   * Type 96B: its open side bins left out where a concept's armour housing fills their volume). */
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
// the T-72B3M roof (1.5295 m) as it meets its own hull's.
const T72B3_RING: Point3 = [.0000002374, 1.457100315, .065591405];
const T72B3M_RING: Point3 = [.0000072471277, 1.52948397398, .1143146502203];
const T72B3M_ON_T72B3: Point3 = [0, 1.446 + (1.52948397398 - 1.5153), .065591405];
// CN lane 2026-10-15: the Type 96B ring rides 20 mm above the B3M roof so the 96B mantlet chin clears the driver's
// hatch, the shoulder covers and the engine-deck louvres at the gun's full 6 degree depression at every yaw (it cut the
// louvres by 5 mm at yaw 165). The ring's own collar bridges the running gap.
const TYPE96B_ON_T72B3M: Point3 = [0, 1.52948397398 + .020, .1143146502203];
// 252 (owner: "redesign the qilin around a type 96b inspired Yun like turret"): the Qilin's Type 96B rides the T-72B3
// ring 40 mm over the B3 roof. The B3's driver's hatch (its top 1.488) stands 31 mm over the B3 roof round the ring, where
// the B3M's sits level with it: 20 mm up, as the Kunlun rides, the heeled boot passed 8 mm over the hatch at full
// elevation and the trunnion ring 13 mm at level (cnClearance holds 25 mm); 40 mm up it passes 28 mm over it.
const TYPE96B_ON_T72B3: Point3 = [0, 1.457100315 + .040, .065591405];
// Release 227 (owner 2026-10-16: "make the yun keep all its extra add ons and modifications but altered slightly to be
// wrapped around the type 96b turret base"): the Type 96B ring rides 40 mm above the T-80U's own yaw datum, so the 96B
// shell's floor and the Yun's wrap clear the T-80U roof and its drums at every yaw; where the 96B barrel (its trunnion
// 0.85 m further forward and 68 mm lower than the cast Yun's) would meet the T-80U's front lamp brows and its slatted
// transom, its depression stops follow the measured clearance (gunPitchByYawDeg below). A stationary ring race on the
// hull closes the running gap under the collar (nationalChina.ts yunRingRace).
const TYPE96B_ON_T80U: Point3 = [0, 1.55158 + .040, .0718698169];

// Commander's cupolas in each donor's turret frame (their builders' own datums).
// The T-72B3 cupola's raised hatch ring (t72b3X.ts roofEquipment: r .358 at -.61355, -.363), its seat 70 mm aft of the
// ring's centre so the station's 260 mm yaw base clears the commander's sight block on the ring's front edge.
const T72B3_CUPOLA_RING = [-.61355 - .0000002374, -.363 - .065591405 - .07] as const;
const T72B3M_CUPOLA = [-.62689 - .0000072471277, -.24424 - .1143146502203] as const;
const TYPE96B_CUPOLA = [-.592, -.045 + .15] as const;
// Release 227, round 4 (critics D10, S1): the QJC-88 emplacements' pintle sockets on the cupolas' rims, off the hatch
// lids. Each stands 22.5 degrees off the turret's forward line toward the gun's feed side (+X), so the ammunition can
// faces away from the hatch: on the Type 96B cupola (fixed ring r .377, lid inside the periscope ring at r .276) between
// its forward and its forward-inboard periscopes and beside the lid's forward latch. The 96B's roof falls away ahead of
// the cupola, so the post stands 0.25 m tall, welded to the cupola's base and ring by a web plate up to 7 mm under the
// ring's top. 252: the Kunlun's and the Qilin's Type 96B cupolas carry the same socket.
const TYPE96B_RIM_SOCKET = rimSocket(TYPE96B_CUPOLA, 22.5, { lidR: .276, ringR: .377, topY: .91, postR: .046,
  web: { innerR: .352, topY: .822 } });

export const NATIONAL_DONOR_TURRETS: Readonly<Record<string, NationalDonorTurret>> = {
  // 252 (owner: "redesign the qilin around a type 96b inspired Yun like turret"): the Qilin's ZTZ-99A2 gives way to the
  // Type 96B, built as the Yun's is (its open side bins and cheek launchers left out for the Qilin's own wrap, its boot
  // heeled, the box sight riding the gun) and wrapped in the Qilin's own kit (chinaDonorTurretKit.ts qilin): the stepped
  // brow and flank sleeve, the closed bustle and its loaded rack. Its QJC-88 stands in the Kunlun's rim socket on the
  // same Type 96B cupola; the 96B's own whip is the Qilin's mast.
  // Its depression by turret yaw is measured as the Kunlun's (tools/gun-depression-sweep.mjs: 26 mm between the whole gun
  // and every hull mesh, both sides, each degree's shallowest neighbour): over the B3 hull's glacis-corner fittings at
  // yaw 24-30 (5.4 deg at worst) and the skirts' rear modules at 142-151 (5.3 deg); full 6 deg elsewhere.
  t72b3_qilin: { donor: 'type96b', pivot: TYPE96B_ON_T72B3, roofY: .70, ...TYPE96B_RIM_SOCKET, heightM: 3.097,
    gunPitchByYawDeg: [[0, -6], [22, -6], [28, -5.4], [30, -5.4], [32, -6], [140, -6], [141, -5.9], [142, -5.7], [143, -5.6], [144, -5.4], [145, -5.3], [147, -5.3], [149, -5.5], [150, -5.7], [153, -6], [154, -5.9], [161, 8.1], [162, 9.2], [163, 9.6], [169, 10.2], [171, 10.2], [172, 10.3], [173, 10.5], [180, 10.5]],
    addedTurretEra: ['turret_era_L', 'turret_era_R'],
    builderOptions: { mastTopY: 3.20, bins: false, smoke: false, bootHeel: true, boxSightOnGun: true } },
  // Release 227 (cnClearance, 2026-10-17): the gun's depression by turret yaw, measured: at each degree the deepest pitch
  // keeping 26 mm between the whole gun (boot, box sight, barrel at recoil 0 and 0.135 m) and every hull mesh, on both
  // sides, then a conservative curve through each degree's shallowest neighbour. Round 5 (critic CN5-05): the hull lamps
  // left the deck for cowls on the glacis corners (nationalChina.ts glacisLampCowl), where the gun at -6 deg passes 25 mm
  // over them, so the front arc depresses the full 6 deg (it had 1.3 deg left over the 226 lamp brows at yaw 20-32). Left:
  // the skirts' tops at 111-114 deg (5.3 deg) and, aft of 133 deg, the hull deck's rear edge, the skirts' rear ends and
  // the engine deck's cooling panels (3.4-5.7 deg): the Type 96B's trunnion stands 0.26 m over the ring, and at -6 deg
  // the barrel meets the deck itself there.
  t72b3m_kunlun: { donor: 'type96b', pivot: TYPE96B_ON_T72B3M, roofY: .70, ...TYPE96B_RIM_SOCKET, heightM: 3.35,
    gunPitchByYawDeg: [[0, -6], [110, -6], [111, -5.3], [114, -5.3], [115, -5.7], [116, -6], [118, -6], [119, -5.9], [124, -5.9], [125, -5.8], [130, -5.8], [131, -5.7], [133, -5.7], [134, -5.5], [135, -5.2], [136, -5], [137, -4.7], [138, -4.5], [139, -4.2], [140, -4.1], [141, -3.9], [143, -3.7], [144, -3.5], [145, -3.4], [148, -3.4], [150, -3.6], [151, -3.6], [153, -3.8], [154, -4.3], [155, -4.7], [156, -3.5], [162, 8.5], [163, 9.5], [164, 9.8], [169, 10.3], [170, 10.3], [171, 10.4], [172, 10.4], [173, 10.5], [180, 10.5]],
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
    gunPitchByYawDeg: [[0, -6], [140, -6], [154, -6], [155, -4.7], [162, 9.3], [163, 10.4], [164, 10.6], [166, 10.8], [167, 10.8], [169, 11], [170, 11], [171, 11.1], [172, 11.1], [173, 11.2], [176, 11.2], [177, 11.3], [180, 11.3]],
    addedTurretEra: ['turret_era_L', 'turret_era_R'],
    builderOptions: { mastTopY: 3.20, bins: false, smoke: false, bootHeel: true, boxSightOnGun: true } },
  // Release 230 (the 230 turret land, after round 11's fix of the other three T-72B3M turrets): the same 16 mm shallower
  // mantlet chin. On the merged tree the stock chin passed 19.9 mm over the driver's periscope at yaw 16 (at the stop) and
  // 20.5 mm over the driver's hatch at yaw 25 (full elevation), under nationalGunMantlet's 20 mm mount keep.
  t72b3m_hetman: { donor: 't72b3m_2016', pivot: T72B3M_RING, roofY: .82, station: T72B3M_CUPOLA, heightM: 3.382,
    builderOptions: { mantletChinLift: .016 } },
  // Release 227 (owner 2026-10-16: "brand new era packages ... donnt make it just copy the t90ms"): Hetman II and both
  // Zubrs fit their own frontal ERA (ukraineFrontEra.ts, polandFrontEra.ts), so the donor's Relikt cells, their beams
  // and its roof cassettes are not emitted on them. The Zubrs' heights are their lower 12.7 mm WKM-B emplacements'
  // (the sight box tops them: 3.2627 -> 3.0777, 3.3227 -> 3.1077).
  t72b3m_hetman_ii: { donor: 't72b3m_2016', pivot: T72B3M_RING, roofY: .82, station: T72B3M_CUPOLA, heightM: 3.402,
    builderOptions: { reliktEra: false, mantletChinLift: .016 } },
  t72b3_sich: { donor: 't72b3', pivot: T72B3_RING, roofY: .82, station: T72B3_CUPOLA_RING, heightM: 3.305 },
  t72b3_zubr: { donor: 't72b3m_2016', pivot: T72B3M_ON_T72B3, roofY: .82, station: T72B3M_CUPOLA, heightM: 3.0777,
    builderOptions: { reliktEra: false, mantletChinLift: .016 } },
  t72b3_zubr_ii: { donor: 't72b3m_2016', pivot: T72B3M_ON_T72B3, roofY: .82, station: T72B3M_CUPOLA, heightM: 3.1077,
    builderOptions: { reliktEra: false, mantletChinLift: .016 } },
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
 *   (-2.9 and -3.9 at yaw 0-20);
 * - 2026-10-26: the two fuel drums across the upper rear slope (rearSlopeFuelDrums.ts) on the Bulat-M, Bastion-M, Qilin,
 *   Kunlun and Yun: over the rear's last 20 deg the gun clears their tops at +5.2 (the B3 and B3M decks) to +10.5/+11.3
 *   (the Type 96B guns on the Qilin, Kunlun and Yun). Each row is the shallower, degree by degree, of its published stop
 *   and the re-sweep with the drums, its onset then ramped at 2 deg per degree of yaw (never below the sweep): the low
 *   stop is a clamp (movement.ts), so the sweep's 12 deg step at the drums' outer ends would snap the gun up as the
 *   turret swings over them. A full 0.59 m drum on that slope cannot sit under the old stops: the gun passed 4 to 10 cm
 *   over the deck's rear edge.
 * Two standing mantlet conflicts no depression stop cures were left to the geometry:
 * - the T-72B3M turret's mantlet underside 6-18 mm over the driver's hatch at yaw 0-25 at every pitch (Hetman, Hetman II,
 *   Zubr, Zubr II; the fleet T-72B3M has it too);
 * - the T-72B3M hull's right-side fitting under the turret overhang (x -1.26, y 1.57-1.58), which the mantlet's lower
 *   corner passes through at yaw -48..-133 (the Hetman II, as on the fleet T-72B3M).
 * Release 230 cures both on the four concepts with a 16 mm shallower mantlet chin (t72b3mX.ts mantletChinLift; UA/PL
 * round 11 for Hetman II and the Zubrs, the 230 turret land for the Hetman): nationalGunMantlet.selftest.mjs holds their
 * mounts to 20 mm; nationalGunClearance.selftest.mjs still holds only the barrel to 25 mm in the windows where a mount
 * sits between 20 and 25 mm (Hetman II, the Zubrs).
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
  t72b3m_bulat_m: [[0,-3.6],[1,-3.3],[2,-3.1],[5,-3.1],[6,-3],[11,-3],[12,-2.9],[15,-2.9],[16,-3.1],[17,-3.4],[19,-4.6],[20,-4.6],[21,-5.7],[22,-6],[25,-6],[26,-5.9],[27,-5.7],[28,-5.6],[29,-5.4],[32,-5.1],[34,-5.1],[35,-5.2],[37,-5.6],[38,-6],[43,-6],[44,-5.9],[46,-5.9],[47,-6],[54,-6],[56,-5.8],[60,-5.8],[61,-5.7],[65,-5.7],[66,-5.1],[67,-4.7],[68,-4.5],[71,-4.5],[72,-4.6],[75,-5.8],[81,-5.8],[82,-5.7],[87,-5.7],[89,-4.5],[91,-4.3],[93,-4.3],[94,-4.5],[95,-4.9],[96,-5.6],[109,-5.6],[111,-4.4],[112,-4.2],[113,-4.1],[115,-4.1],[116,-4.3],[120,-5.5],[122,-5.5],[123,-5.4],[127,-5.4],[129,-5.6],[130,-4.9],[131,-4.5],[132,-4.5],[134,-4.3],[135,-4.3],[136,-4.2],[137,-4.2],[138,-3.7],[139,-3.5],[140,-3.5],[141,-3.5],[142,-3.6],[144,-3.6],[148,-4],[149,-4],[152,-4.3],[153,-3.6],[154,-2.2],[155,-1.6],[156,-1.3],[157,-1.2],[159,-1.2],[160,0.7],[161,2.7],[162,4.2],[163,4.9],[164,5],[165,5],[166,5.1],[167,5.1],[168,5.2],[172,5.2],[173,5.3],[177,5.3],[178,5.2],[180,5.2]],
  t72b3_bastion_m: [[0,-4.4],[5,-3.9],[7,-3.9],[11,-4.7],[18,-4.7],[19,-4.8],[20,-4.8],[22,-6],[73,-6],[75,-5.6],[77,-5.6],[78,-5.7],[79,-5.9],[80,-6],[100,-6],[103,-5.4],[105,-5.4],[106,-5.5],[107,-5.8],[108,-6],[128,-6],[129,-5.4],[130,-5],[131,-5],[132,-4.9],[134,-4.9],[135,-4.8],[136,-4.8],[137,-4.2],[138,-4],[139,-3.9],[140,-3.9],[142,-3.9],[143,-4],[144,-4.2],[147,-4.5],[148,-4.7],[149,-4.8],[150,-5],[151,-5.1],[152,-5.3],[154,-3.9],[155,-3.4],[156,-3.2],[157,-3.1],[158,-1.7],[160,2.3],[161,4],[162,4.7],[163,4.9],[164,4.9],[165,5],[166,5],[167,5.1],[170,5.1],[171,5.2],[180,5.2]],
};
