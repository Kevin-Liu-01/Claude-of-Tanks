import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { namerHullPart as put, namerMudguard } from './namerSourceFrame.ts';

function addSideSkirts(P: TankBuilderPort): void {
  for(const side of[-1,1]){
    for(let i=0;i<10;i++){
      const z=-2.4096+i*.5724;
      const g=KIT.box(.0654,.653,.569).translate(side*1.7573,.9932,z).scale(1/.95,1/1.012,1/.976);
      P.addExternalArmor('hull',g);
      for(const dz of[-.20,.20]){
        put(P,'hullDetail',KIT.box(.043,.165,.075),side*1.764,1.359,z+dz);
        put(P,'hullDetail',KIT.cylX(.018,.057,10),side*1.764,1.314,z+dz);
      }
    }
    namerMudguard(P,`namer-source-rear-flap-${side}`,KIT.box(.727,.383,.0097),side*1.332,.930,-3.654);
    namerMudguard(P,`namer-source-front-flap-${side}`,KIT.box(.741,.319,.0154),side*1.311,1.065,3.5379);
    put(P,'hullDetail',KIT.box(.017,.016,.060),side*1.690,1.209,3.515);
  }
}

function addSmokeShoulder(P: TankBuilderPort, side: number): void {
  // Local raised shoulder from hull node1: its roof bears the source's
  // six separate brackets. The forward/main side slope remains exposed.
  const ring=(roof:number): [number,number][]=>[[1.119,1.817],[1.782,1.416],[1.782,roof-.165],[1.301,roof]];
  const rows=[{z:-2.036,ring:ring(1.9166)},{z:-1.095,ring:ring(1.9166)}];
  for(const r of rows)if(side<0)r.ring=r.ring.map(([x,y])=>[-x,y] as [number,number]).reverse();
  put(P,'hull',sectionSolid(rows));
  for(const [x,y,z]of[[1.674,1.887,-1.605],[1.677,1.817,-1.498],
    [1.578,1.910,-1.493],[1.586,1.836,-1.388],[1.488,1.840,-1.324],[1.472,1.920,-1.414]]){
    put(P,'hullDetail',KIT.box(.094,.118,.192),side*x,y-.055,z-.097,-.32);
    put(P,'hullDetail',KIT.cylZ(.050,.035,P.q?16:10),side*x,y,z,-.332,side*.035);
    put(P,'hullDark',KIT.cylZ(.040,.004,P.q?16:10),side*(x+.0007),y+.0065,z+.020,-.332,side*.035);
  }
}

function addDriverPeriscopes(P: TankBuilderPort): void {
  for(const [x,y,z,yaw]of[[.829,1.913,1.339,0],[1.023,1.940,1.247,.56],
    [.621,1.940,1.242,-.56],[-.511,1.996,.552,0],[-.805,1.996,.430,-.70],[-.957,1.996,.133,-1.57]]){
    put(P,'hullDetail',KIT.box(.253,.090,.089),x,y,z,0,yaw);
    put(P,'hullDark',KIT.box(.186,.041,.013),x+Math.sin(yaw)*.048,y+.002,z+Math.cos(yaw)*.048,0,yaw);
  }
  // Low shaped bases reach the actual roof below each optical crown.
  put(P,'hullDetail',KIT.box(.626,.041,.608),-.702,1.932,.310);
  for(const x of[.621,1.023])put(P,'hullDetail',KIT.box(.165,.105,.116),x,1.898,1.245);
  put(P,'hullDetail',KIT.box(.255,.069,.106),.829,1.870,1.339);
}

export function addNamerSourceChassis(P: TankBuilderPort): void {
  addSideSkirts(P);
  addDriverPeriscopes(P);
  addSmokeShoulder(P,-1);
  addSmokeShoulder(P,1);
}
