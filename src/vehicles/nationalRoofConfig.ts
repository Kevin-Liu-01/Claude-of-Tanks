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
// The emplacements' pintle risers (m), measured with the moving gun's clearance sweep (tools/roof-station-arcs.mjs).
const KUNLUN_RISER_M=.04;
const QILIN_RISER_M=.02;
export const NATIONAL_ROOF_LOADOUTS:Readonly<Record<string,NationalRoofLoadout>>={
 t80u_zoria:{name:'Bureviy open cradle',caliber:12.7,mount:'fork',feedSide:1,axisHeight:.62,muzzleZ:1.04,eyes:'monocle-left',eyeRadius:.145,roof:'split-panels',roofZ:-.12,lamp:'round'},
 t72b3m_hetman:{name:'Hetman command cannon',caliber:30,mount:'shield',feedSide:1,axisHeight:.75,muzzleZ:1.13,eyes:'monocle-right',eyeRadius:.16,roof:'radome',roofZ:-.20,lamp:'square'},
 // Owner 2026-10-15 (VEH-21): the Sich carries a modern 30 mm autocannon in the open fork cradle, low on the T-72B3's raised cupola ring.
 t72b3_sich:{name:'Sokil field gun',caliber:30,mount:'fork',feedSide:-1,axisHeight:.56,muzzleZ:1.05,eyes:'flat',eyeRadius:.11,roof:'spine',roofZ:-.20,lamp:'slit'},
 t80u_husarz:{name:'Husarz armoured station',caliber:12.7,mount:'shield',feedSide:-1,axisHeight:.64,muzzleZ:1.01,eyes:'twin',eyeRadius:.12,roof:'scanner',roofZ:-.10,lamp:'square'},
 t72b3m_wilk:{name:'Wilk enclosed cannon',caliber:30,mount:'wedge',feedSide:1,axisHeight:.77,muzzleZ:1.16,eyes:'monocle-left',eyeRadius:.17,roof:'split-panels',roofZ:-.12,lamp:'slit'},
 t72b3_zubr:{name:'Zubr low-shield cannon',caliber:30,mount:'shield',feedSide:1,axisHeight:.70,muzzleZ:1.06,eyes:'flat',eyeRadius:.115,roof:'radome',roofZ:-.10,lamp:'round'},
 // Release 227: the Yun's station on its own left-roof seat beside the Type 96B cupola; its arc leaves out the 96B mast
 // stem (blocked 143..152 deg, tools/roof-station-arcs.mjs; 1 deg margin each side, 347 deg).
 t80u_yun:{name:'Yun faceted station',caliber:12.7,mount:'wedge',feedSide:-1,axisHeight:.63,muzzleZ:1.07,yawArc:[-3.5954,2.4609],
  eyes:'monocle-right',eyeRadius:.15,roof:'spine',roofZ:-.16,lamp:'slit'},
 // Release 227 (owner 2026-10-16: "for the qilin and kunlun, make their machine guns much smalelr and make thhem into the
 // more classic machine gunn emplacement on the turrets"): the Kunlun's 30 mm station gives way to a QJC-88 12.7 mm on an
 // open pintle at the Type 96B commander's cupola, its ring inside the cupola's latch clevis (r .158), behind the class's
// standard light shield (round 2: the 0.14 m 'low' leaves read as no shield at all from the front); its 40 mm riser keeps
// the gun's back plate and grips 20 mm over the clevis pin with the gun facing aft at full elevation and in recoil.
 // The pintle's trunnion stands .304 m over its foot plus the measured riser; its crew barrel's muzzle 1.321 m ahead.
 t72b3m_kunlun:{name:'Kunlun cupola QJC-88',caliber:12.7,mount:'pintle',feedSide:1,axisHeight:.304+KUNLUN_RISER_M,muzzleZ:1.321,
  emplacement:{cls:'qjc88',shield:true,ring:{r:.12,stubs:3},riserM:KUNLUN_RISER_M,crewServed:true},
  eyes:'twin',eyeRadius:.145,roof:'scanner',roofZ:-.16,lamp:'square'},
 // Release 227: the Qilin's QJC-88 on the ZTZ-99A2 commander's cupola, its ring inside the commander's periscope (whose
 // inner end stands at r .15) and the 99A2's own standard shield; its arc leaves out the commander's stabilised sight.
 t72b3_qilin:{name:'Qilin cupola QJC-88',caliber:12.7,mount:'pintle',feedSide:1,axisHeight:.304+QILIN_RISER_M,muzzleZ:1.321,
  emplacement:{cls:'qjc88',shield:true,ring:{r:.12,stubs:3},riserM:QILIN_RISER_M,crewServed:true},
  // Measured (cn-work clear.mjs --table, 25 mm kept; tools/roof-station-arcs.mjs): the arc leaves out the commander's
  // stabilised sight (blocked -79..-59.5 deg; 1 deg margin each side, 336 deg); the barrel depresses less over the split
  // sensor's panels (yaw -53..-22 deg) and the left round lamp (yaw 9..29 deg).
  yawArc:[-.9948,4.8695],
  depressionByYaw:[[-.925,.087],[-.9163,.041],[-.8988,.033],[-.8814,.028],[-.8639,.028],[-.8465,.033],[-.829,.04],[-.8116,.087],
   [-.7592,.087],[-.7505,.054],[-.733,.036],[-.7156,.029],[-.6981,.025],[-.6807,.025],[-.6632,.029],[-.6458,.036],
   [-.6283,.054],[-.6109,.087],[-.5498,.087],[-.5411,.047],[-.5236,.033],[-.5061,.026],[-.4887,.025],[-.4712,.025],
   [-.4538,.025],[-.4363,.025],[-.4189,.03],[-.4014,.041],[-.3927,.087],[.1571,.087],[.1658,.082],[.1833,.075],
   [.2007,.071],[.2182,.069],[.2356,.066],[.2531,.062],[.2705,.058],[.288,.055],[.3054,.054],[.3229,.052],
   [.3403,.052],[.3578,.052],[.3752,.052],[.3927,.052],[.4102,.052],[.4276,.055],[.4451,.06],[.4625,.064],
   [.48,.071],[.4974,.087]],
  eyes:'flat',eyeRadius:.10,roof:'split-panels',roofZ:-.12,lamp:'round'},
 t80u_bars_m:{name:'Bastion drum-fed gun',caliber:12.7,mount:'drum',feedSide:-1,axisHeight:.67,muzzleZ:1.09,eyes:'twin',eyeRadius:.17,roof:'radome',roofZ:-.16,lamp:'round'},
 t72b3m_bulat_m:{name:'Grom heavy cannon',caliber:30,mount:'shield',feedSide:-1,axisHeight:.79,muzzleZ:1.18,eyes:'twin',eyeRadius:.18,roof:'spine',roofZ:-.16,lamp:'square'},
 t72b3_bastion_m:{name:'Rys open drum gun',caliber:12.7,mount:'drum',feedSide:1,axisHeight:.63,muzzleZ:1.02,eyes:'monocle-left',eyeRadius:.165,roof:'scanner',roofZ:-.12,lamp:'slit'},
 t72b3m_hetman_ii:{name:'Hetman II command weapon',caliber:30,mount:'wedge',feedSide:-1,axisHeight:.77,muzzleZ:1.17,eyes:'twin',eyeRadius:.155,roof:'scanner',roofZ:-.10,lamp:'slit'},
 t72b3_zubr_ii:{name:'Zubr II protected cannon',caliber:30,mount:'drum',feedSide:-1,axisHeight:.76,muzzleZ:1.12,eyes:'monocle-right',eyeRadius:.175,roof:'split-panels',roofZ:-.04,lamp:'square'},
};

/** The station's receiver width (metres): the cradle, the trunnion's bearing span and the sight foot are laid from it. */
export function nationalStationWidth(l:Pick<NationalRoofLoadout,'caliber'>&Partial<Pick<NationalRoofLoadout,'emplacement'>>):number {
  // a cupola emplacement (mount 'pintle'): its class's receiver body at the fitting's scale 1
  if(l.emplacement)return EMPLACEMENT_RECEIVER_WIDTH_M[l.emplacement.cls];
  return l.caliber===30?.245:.185;
}
/** Receiver body widths (m) of the emplacement classes as built (machineGunGeometry.ts MG_CLASSES body[0] x s). */
const EMPLACEMENT_RECEIVER_WIDTH_M:Readonly<Record<NationalEmplacement['cls'],number>>={qjc88:.092,nsvt:.09408,kord:.099};
