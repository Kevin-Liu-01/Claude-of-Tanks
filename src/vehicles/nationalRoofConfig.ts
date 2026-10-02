// Original concept equipment, in metres. These are separate authored loadouts,
// not claims about service vehicles or copies of a national production RWS.
export interface NationalRoofLoadout {
  name:string;
  caliber:12.7|30;
  mount:'fork'|'shield'|'wedge'|'drum';
  feedSide:1|-1;
  axisHeight:number;
  muzzleZ:number;
  eyes:'monocle-left'|'monocle-right'|'twin'|'flat';
  eyeRadius:number;
  roof:'radome'|'split-panels'|'spine'|'scanner';
  roofZ:number;
  lamp:'round'|'slit'|'square';
}
export const NATIONAL_ROOF_LOADOUTS:Readonly<Record<string,NationalRoofLoadout>>={
 ua_t80u_modern:{name:'Bureviy open cradle',caliber:12.7,mount:'fork',feedSide:1,axisHeight:.62,muzzleZ:1.04,eyes:'monocle-left',eyeRadius:.145,roof:'split-panels',roofZ:-.12,lamp:'round'},
 ua_t72b3m_modern:{name:'Hetman command cannon',caliber:30,mount:'shield',feedSide:1,axisHeight:.75,muzzleZ:1.13,eyes:'monocle-right',eyeRadius:.16,roof:'radome',roofZ:-.20,lamp:'square'},
 ua_t72b3_modern:{name:'Sokil field gun',caliber:12.7,mount:'fork',feedSide:-1,axisHeight:.58,muzzleZ:.98,eyes:'flat',eyeRadius:.11,roof:'spine',roofZ:-.20,lamp:'slit'},
 pl_t80u_modern:{name:'Husarz armoured station',caliber:12.7,mount:'shield',feedSide:-1,axisHeight:.64,muzzleZ:1.01,eyes:'twin',eyeRadius:.12,roof:'scanner',roofZ:-.10,lamp:'square'},
 pl_t72b3m_modern:{name:'Wilk enclosed cannon',caliber:30,mount:'wedge',feedSide:1,axisHeight:.77,muzzleZ:1.16,eyes:'monocle-left',eyeRadius:.17,roof:'split-panels',roofZ:-.12,lamp:'slit'},
 pl_t72b3_modern:{name:'Zubr low-shield gun',caliber:12.7,mount:'shield',feedSide:1,axisHeight:.60,muzzleZ:.96,eyes:'flat',eyeRadius:.115,roof:'radome',roofZ:-.10,lamp:'round'},
 cn_t80u_modern:{name:'Yun faceted station',caliber:12.7,mount:'wedge',feedSide:-1,axisHeight:.63,muzzleZ:1.07,eyes:'monocle-right',eyeRadius:.15,roof:'spine',roofZ:-.16,lamp:'slit'},
 cn_t72b3m_modern:{name:'Kunlun stabilised cannon',caliber:30,mount:'drum',feedSide:1,axisHeight:.75,muzzleZ:1.14,eyes:'twin',eyeRadius:.145,roof:'scanner',roofZ:-.16,lamp:'square'},
 cn_t72b3_modern:{name:'Qilin compact shroud',caliber:12.7,mount:'wedge',feedSide:1,axisHeight:.59,muzzleZ:.99,eyes:'flat',eyeRadius:.10,roof:'split-panels',roofZ:-.12,lamp:'round'},
 ru_t80u_modern:{name:'Bastion drum-fed gun',caliber:12.7,mount:'drum',feedSide:-1,axisHeight:.67,muzzleZ:1.09,eyes:'twin',eyeRadius:.17,roof:'radome',roofZ:-.16,lamp:'round'},
 ru_t72b3m_modern:{name:'Grom heavy cannon',caliber:30,mount:'shield',feedSide:-1,axisHeight:.79,muzzleZ:1.18,eyes:'twin',eyeRadius:.18,roof:'spine',roofZ:-.16,lamp:'square'},
 ru_t72b3_modern:{name:'Rys open drum gun',caliber:12.7,mount:'drum',feedSide:1,axisHeight:.63,muzzleZ:1.02,eyes:'monocle-left',eyeRadius:.165,roof:'scanner',roofZ:-.12,lamp:'slit'},
 ua_t72b3m_hetman_ii:{name:'Hetman II command weapon',caliber:30,mount:'wedge',feedSide:-1,axisHeight:.77,muzzleZ:1.17,eyes:'twin',eyeRadius:.155,roof:'scanner',roofZ:-.10,lamp:'slit'},
 pl_t72b3_zubr_ii:{name:'Zubr II protected cannon',caliber:30,mount:'drum',feedSide:-1,axisHeight:.76,muzzleZ:1.12,eyes:'monocle-right',eyeRadius:.175,roof:'split-panels',roofZ:-.04,lamp:'square'},
};
