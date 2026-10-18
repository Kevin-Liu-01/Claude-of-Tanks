// Original concept equipment, in metres. These are separate authored loadouts,
// not claims about service vehicles or copies of a national production RWS.
/** A classic machine-gun emplacement (release 227, owner 2026-10-16: "make their machine guns much smalelr and make
 * thhem into the more classic machine gunn emplacement on the turrets"): the class's open pintle mount on the
 * commander's cupola, a race ring round it and a light shield, built by the fleet's machine-gun construction
 * (FITTINGS.pintleMG). The auxiliary roof-gun control (src/sim/auxiliarySystems.ts) still aims and fires it by itself.
 * `crewServed` keeps the crew form (spade grips, leaf sight, the true crew barrel) with the working-station rig;
 * false draws the solenoid form (the class's remote back plate) on the same rig. `riserM` is the pintle column's
 * extra height (the fitting's own sleeve and clamp), measured so the moving gun clears the cupola's periscopes,
 * latch and sights over its whole arc. */
interface NationalEmplacement {
  cls:'qjc88'|'nsvt'|'kord';
  shield:boolean|'low'|'armored';
  ring:{r:number;stubs:number};
  riserM:number;
  crewServed:boolean;
}
/** A national station's mount type: the yoke, cradle housing, feed and support width it is built with
 * (profiles/nationalRoofWeapon.ts NATIONAL_MOUNTS holds one row per type). 'pintle' is the classic emplacement on the
 * commander's cupola (release 227), built by nationalCupolaPintle from the loadout's `emplacement`, never from a row. */
export type NationalRoofMount='fork'|'shield'|'wedge'|'drum'|'cradle'|'casemate'|'pintle';
export interface NationalRoofLoadout {
  name:string;
  caliber:12.7|30;
  mount:NationalRoofMount;
  /** Present exactly when mount is 'pintle'. */
  emplacement?:NationalEmplacement;
  /** Measured traverse limits (mount-local radians, unwrapped, containing 0): tools/roof-station-arcs.mjs. */
  yawArc?:readonly [number,number];
  /** [yaw, deepest clear depression] samples (radians, ascending yaw) where the roof under the barrel is higher. */
  depressionByYaw?:readonly (readonly [number,number])[];
  feedSide:1|-1;
  axisHeight:number;
  muzzleZ:number;
  eyes:'monocle-left'|'monocle-right'|'twin'|'flat';
  eyeRadius:number;
  roof:'radome'|'split-panels'|'spine'|'scanner';
  roofZ:number;
  lamp:'round'|'slit'|'square';
}
// The emplacements' pintle risers (m), measured with the moving gun's clearance sweep (tools/roof-station-arcs.mjs; the
// Qilin's 30 mm, release 227 M5, keeps the receiver's rear 25 mm over the 99A2 cupola's periscope head facing aft-left at
// full elevation and in recoil, where 20 mm left 22.5 mm: cnClearance.selftest.mjs). Round 3 (critic D6: the emplacement
// stands no taller than 0.46 m, foot to leaf sight): the Kunlun's 36 mm keeps its spade grips 25 mm over the 96B
// cupola's front hatch latch facing aft at full elevation (26 mm left 19.1 mm, 40 mm 30.2 mm), 458 mm tall.
const KUNLUN_RISER_M=.036;
const QILIN_RISER_M=.03;
export const NATIONAL_ROOF_LOADOUTS:Readonly<Record<string,NationalRoofLoadout>>={
 t80u_zoria:{name:'Bureviy open cradle',caliber:12.7,mount:'fork',feedSide:1,axisHeight:.62,muzzleZ:1.04,eyes:'monocle-left',eyeRadius:.145,roof:'split-panels',roofZ:-.12,lamp:'round'},
 t72b3m_hetman:{name:'Hetman command cannon',caliber:30,mount:'shield',feedSide:1,axisHeight:.75,muzzleZ:1.13,eyes:'monocle-right',eyeRadius:.16,roof:'radome',roofZ:-.20,lamp:'square'},
 // Owner 2026-10-15 (VEH-21): the Sich carries a modern 30 mm autocannon in the open fork cradle, low on the T-72B3's raised cupola ring.
 t72b3_sich:{name:'Sokil field gun',caliber:30,mount:'fork',feedSide:-1,axisHeight:.56,muzzleZ:1.05,eyes:'flat',eyeRadius:.11,roof:'spine',roofZ:-.20,lamp:'slit'},
 t80u_husarz:{name:'Husarz armoured station',caliber:12.7,mount:'shield',feedSide:-1,axisHeight:.64,muzzleZ:1.01,eyes:'twin',eyeRadius:.12,roof:'scanner',roofZ:-.10,lamp:'square'},
 t72b3m_wilk:{name:'Wilk enclosed cannon',caliber:30,mount:'wedge',feedSide:1,axisHeight:.77,muzzleZ:1.16,eyes:'monocle-left',eyeRadius:.17,roof:'split-panels',roofZ:-.12,lamp:'slit'},
 // Release 227 (owner 2026-10-16: "make thhe zubr 2 and zubr autocannons into proper machine gun emplacements that are aut
 // ocontrolled"): both Zubrs carry a 12.7 mm WKM-B emplacement (profiles/nationalRoofWeapon.ts 'cradle', 'casemate').
 t72b3_zubr:{name:'Zubr WKM-B field emplacement',caliber:12.7,mount:'cradle',feedSide:1,axisHeight:.515,muzzleZ:1.12,eyes:'flat',eyeRadius:.115,roof:'radome',roofZ:-.10,lamp:'round'},
 // Release 227: the Yun's station on its own left-roof seat beside the Type 96B cupola; its arc leaves out the 96B mast
 // stem (2026-10-17, measured both ways with dense samples over the whole pitch range: under 25 mm at 140..154 deg; the
 // arc stops 1 deg short each side, 344 deg).
 t80u_yun:{name:'Yun faceted station',caliber:12.7,mount:'wedge',feedSide:-1,axisHeight:.63,muzzleZ:1.07,yawArc:[-3.5779,2.426],
  eyes:'monocle-right',eyeRadius:.15,roof:'spine',roofZ:-.16,lamp:'slit'},
 // Release 227 (owner 2026-10-16: "for the qilin and kunlun, make their machine guns much smalelr and make thhem into the
 // more classic machine gunn emplacement on the turrets"): the Kunlun's 30 mm station gives way to a QJC-88 12.7 mm on an
 // open pintle at the Type 96B commander's cupola, its ring inside the cupola's latch clevis (r .158), behind the class's
 // standard light shield (round 2: the 0.14 m 'low' leaves read as no shield at all from the front); its 36 mm riser
 // (round 3, critic D6) keeps the spade grips 25 mm over the front hatch latch with the gun facing aft at full elevation.
 // The pintle's trunnion stands .304 m over its foot plus the measured riser; its crew barrel's muzzle 1.321 m ahead.
 t72b3m_kunlun:{name:'Kunlun cupola QJC-88',caliber:12.7,mount:'pintle',feedSide:1,axisHeight:.304+KUNLUN_RISER_M,muzzleZ:1.321,
  emplacement:{cls:'qjc88',shield:true,ring:{r:.12,stubs:3},riserM:KUNLUN_RISER_M,crewServed:true},
  eyes:'twin',eyeRadius:.145,roof:'scanner',roofZ:-.16,lamp:'square'},
 // Release 227: the Qilin's QJC-88 on the ZTZ-99A2 commander's cupola, its ring inside the commander's periscope (whose
 // inner end stands at r .15) and the 99A2's own standard shield; its arc leaves out the commander's stabilised sight.
 t72b3_qilin:{name:'Qilin cupola QJC-88',caliber:12.7,mount:'pintle',feedSide:1,axisHeight:.304+QILIN_RISER_M,muzzleZ:1.321,
  emplacement:{cls:'qjc88',shield:true,ring:{r:.12,stubs:3},riserM:QILIN_RISER_M,crewServed:true},
  // Measured 2026-10-17 after the M1-M4 geometry with the 30 mm riser (cn-work r3/table2.mjs: the cnClearance pose, both
  // ways with 12 mm samples at recoil 0 and 0.025 m, 28 mm kept; each degree the smallest of it and its neighbours): the
  // arc leaves out the commander's stabilised sight (blocked -79..-58 deg; 336 deg allowed); the barrel depresses less
  // over the split-panel sensor on its central seat (yaw -54..-21 deg: its two panels and head) and the left round lamp
  // (yaw 8..28 deg).
  yawArc:[-.9948,4.8695],
  depressionByYaw:[[-.9599,.087],[-.9425,.082],[-.925,.058],[-.9076,.05],[-.8901,.044],[-.8727,.044],[-.8552,.044],
   [-.8378,.051],[-.8203,.058],[-.8029,.065],[-.7854,.062],[-.7679,.054],[-.7505,.044],[-.733,.039],[-.7156,.038],
   [-.6981,.038],[-.6807,.038],[-.6632,.038],[-.6458,.039],[-.6283,.044],[-.6109,.05],[-.5934,.047],[-.576,.046],
   [-.5585,.044],[-.5411,.044],[-.5236,.042],[-.5061,.042],[-.4887,.042],[-.4712,.042],[-.4538,.042],[-.4363,.042],
   [-.4189,.043],[-.4014,.051],[-.384,.069],[-.3665,.082],[-.3491,.087],[.1222,.087],[.1396,.081],[.1571,.072],
   [.1745,.067],[.192,.067],[.2094,.066],[.2269,.066],[.2443,.066],[.2618,.066],[.2793,.066],[.2967,.066],[.3142,.066],
   [.3316,.066],[.3491,.066],[.3665,.066],[.384,.066],[.4014,.066],[.4189,.067],[.4363,.069],[.4538,.074],[.4712,.08],
   [.4887,.085],[.5061,.087]],
  eyes:'flat',eyeRadius:.10,roof:'split-panels',roofZ:-.12,lamp:'round'},
 t80u_bars_m:{name:'Bastion drum-fed gun',caliber:12.7,mount:'drum',feedSide:-1,axisHeight:.67,muzzleZ:1.09,eyes:'twin',eyeRadius:.17,roof:'radome',roofZ:-.16,lamp:'round'},
 t72b3m_bulat_m:{name:'Grom heavy cannon',caliber:30,mount:'shield',feedSide:-1,axisHeight:.79,muzzleZ:1.18,eyes:'twin',eyeRadius:.18,roof:'spine',roofZ:-.16,lamp:'square'},
 t72b3_bastion_m:{name:'Rys open drum gun',caliber:12.7,mount:'drum',feedSide:1,axisHeight:.63,muzzleZ:1.02,eyes:'monocle-left',eyeRadius:.165,roof:'scanner',roofZ:-.12,lamp:'slit'},
 t72b3m_hetman_ii:{name:'Hetman II command weapon',caliber:30,mount:'wedge',feedSide:-1,axisHeight:.77,muzzleZ:1.17,eyes:'twin',eyeRadius:.155,roof:'scanner',roofZ:-.10,lamp:'slit'},
 t72b3_zubr_ii:{name:'Zubr II WKM-B armoured emplacement',caliber:12.7,mount:'casemate',feedSide:-1,axisHeight:.55,muzzleZ:1.14,eyes:'monocle-right',eyeRadius:.175,roof:'split-panels',roofZ:-.04,lamp:'square'},
};

/** The station's receiver width (metres): the cradle, the trunnion's bearing span and the sight foot are laid from it. */
export function nationalStationWidth(l:Pick<NationalRoofLoadout,'caliber'>&Partial<Pick<NationalRoofLoadout,'emplacement'>>):number {
  // a cupola emplacement (mount 'pintle'): its class's receiver body at the fitting's scale 1
  if(l.emplacement)return EMPLACEMENT_RECEIVER_WIDTH_M[l.emplacement.cls];
  return l.caliber===30?.245:.185;
}
/** Receiver body widths (m) of the emplacement classes as built (machineGunGeometry.ts MG_CLASSES body[0] x s). */
const EMPLACEMENT_RECEIVER_WIDTH_M:Readonly<Record<NationalEmplacement['cls'],number>>={qjc88:.092,nsvt:.09408,kord:.099};
