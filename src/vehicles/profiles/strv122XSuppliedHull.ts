// First-party planes, folded skirts and native open wheel wells. Source
// sections establish scalar dimensions, not a copied boundary/vertex mesh.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const {box,cylX,cylY} = KIT;
type Row = readonly [z: number, bottom: number, roof: number, halfWidth: number];

function tub(P: TankBuilderPort): void {
  const rows: readonly Row[] = [[-3.69,1.29,1.749,1.06],
    [-3.40,.601,1.759,1.10],[-2.79,.4165,1.746,1.10],
    [-1.62,.4165,1.683,1.10],[1.38,.4165,1.661,1.10],
    [2.12,.4165,1.566,1.10],[2.79,.4165,1.463,1.10],
    [3.30,.576,1.389,1.07],[3.53,.581,1.322,1.03],
    [3.703,.791,1.112,1.03]];
  P.add('hull',sectionSolid(rows.map(([z,bottom,roof,x])=>({z,
    ring:[[-x+.07,bottom],[x-.07,bottom],[x,bottom+.055],
      [x,roof],[-x,roof],[-x,bottom+.055]],
  }))));
  // Bearing contact is inferred from the fused source. Only this hidden
  // annular interface is constructed; the visible bustle clearance stays air.
  P.add('hull',cylY(.88,.90,.042,64),0,1.691,-.12);
}

function shoulder(P: TankBuilderPort,side: -1|1): void {
  const rows: readonly Row[] = [[-3.69,1.259,1.749,1.77],
    [-3.4,1.26,1.760,1.83],[-1.48,1.30,1.678,1.83],
    [1.36,1.30,1.658,1.83],[2.05,1.22,1.558,1.83]];
  const inner=1.095;
  P.add('hull',sectionSolid(rows.map(([z,bottom,roof,outer])=>{
    const ring: [number,number][]=[[inner,bottom],[outer-.025,bottom],
      [outer,roof-.026],[outer-.015,roof],[inner,roof+.006]];
    return {z,ring:side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring};
  })));
  // The long shoulder body physically supports the skirt hinge and every
  // detachable plate. It does not bridge through the native return shoes.
  P.add('hull',box(.085,.118,5.87),side*1.7875,1.305,-.15);
  frontShoulder(P,side);
}

function frontShoulder(P:TankBuilderPort,side:-1|1):void {
  // The fused source buries its upper belt inside this solid shoulder. The
  // native return must move: relieve only the concealed inner ceiling along
  // its source-fitted course. Roof planes and all outerX stations remain
  // unchanged. The right concealed lower tip has the small disclosed upturn
  // below, keeping a robust moving-course gap rather than a3.2mm near miss.
  const skin:readonly Row[]=[[2.05,1.22,1.558,1.83],[2.84,1.12,1.433,1.83],
    [3.45,.971,1.353,1.79],[3.70,1.016,1.171,1.52]];
  const relief=[[2.05,1.2201],[2.84,1.180],[3.20,1.195],[3.35,1.175],
    [3.45,1.115],[3.47,1.092142857],[3.52,1.035],
    [3.58,1.0287],[3.70,1.0161]];
  const sections=relief.map(([z,ceiling])=>{
    const i=Math.max(0,skin.findIndex((s,j)=>j<skin.length-1&&z<=skin[j+1][0]));
    const a=skin[i],b=skin[i+1],t=(z-a[0])/(b[0]-a[0]);
    const originalFloor=a[1]+(b[1]-a[1])*t,roof=a[2]+(b[2]-a[2])*t;
    const upturn=side>0?Math.max(0,Math.min((z-3.47)/.05,(3.58-z)/.06,1))*.042:0;
    const floor=originalFloor+upturn;
    const outer=a[3]+(b[3]-a[3])*t,clearX=Math.min(side<0?1.717:1.740,outer-.028);
    const ring:[number,number][]=[[1.095,ceiling],[clearX,ceiling],[clearX,floor],
      [outer-.025,floor],[outer,roof-.026],[outer-.015,roof],[1.095,roof+.006]];
    return{z,ring:side<0?ring.map(([x,y])=>[-x,y]as[number,number]).reverse():ring};
  });
  P.add('hull',sectionSolid(sections));
}

function skirt(P: TankBuilderPort,side: -1|1): void {
  const sections=[[-3.50,-3.05,1.00],[-3.035,-2.62,.90],[-2.605,-1.87,.75],
    [-1.855,-1.115,.75],[-1.10,-.36,.75],[-.345,.395,.75],
    [.41,1.15,.75],[1.165,1.80,.75],[1.815,2.47,.75],[2.485,3.12,.78]];
  for(const [rear,front,bottom] of sections){
    const roof=1.295, x=side*1.848;
    P.addExternalArmor('hull',box(.061,roof-bottom,front-rear),x,
      (roof+bottom)/2,(rear+front)/2);
    for(const z of [rear+.035,front-.035]){
      P.addEquipment('hullDetail',box(.073,.045,.056),side*1.814,1.307,z);
      P.addEquipment('hullDetail',cylX(.010,.008,10),side*1.884,1.25,z);
    }
    P.addEquipment('hullDetail',box(.031,.052,.09),side*1.8745,bottom+.015,(rear+front)/2);
  }
  const ring: [number,number][]=[[1.80,.85],[1.887,.85],[1.89,1.30],[1.80,1.30]];
  const mirrored=side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring;
  P.addExternalArmor('hull',sectionSolid([{z:3.08,ring:mirrored},
    {z:3.46,ring:mirrored.map(([x,y])=>[x-side*.03,y+.17] as [number,number])}]));
}

function deck(P: TankBuilderPort): void {
  // Shallow source rear fans are fully open between their individual bars.
  for(const side of [-1,1]){
    P.addEquipment('hullDetail',cylY(.437,.437,.026,40),side*.62,1.784,-2.97);
    for(let i=-6;i<=6;i++){
      const z=i*.058,length=2*Math.sqrt(.408*.408-z*z);
      P.addEquipment('hullDark',box(length,.012,.018),side*.62,1.802,-2.97+z);
    }
    P.addEquipment('hullDetail',box(.53,.025,1.08),side*1.374,1.745,-2.69);
  }
  for(const z of [-3.57,-3.36])P.addEquipment('hullDetail',box(2.43,.033,.025),0,1.783,z);
}

export function addStrv122XSuppliedHull(P: TankBuilderPort): void {
  tub(P);deck(P);
  for(const side of [-1,1] as const){shoulder(P,side);skirt(P,side);}
}
