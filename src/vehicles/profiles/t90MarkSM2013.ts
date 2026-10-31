// The T-90SM obr. 2013 (`t90sm_2013`): its own fittings on the T-90SM source build (t90X.ts T90_X_PROFILES.t90sm). 2026-10-30 (lane t90-family-266; the owner: "our new
// versiosn now just look way too identical to sources. tone down that copying a lil", then "we can also make new turrets,
// layerring onn top, hull modificaitons, track shapes, shoulders, rear stuuff like barrrles and so on, sideskirts, cages,
// shtora or otherr quipmennt, machine guns"). Laid after the source build, in the builder frame of that build.
// The kit is the hot-climate export fit: a bustle air conditioner, full rubber dust skirts to the bow, long rear flaps, a sun
// hood on the gunner's sight head and a closed equipment case on the bustle flank.
import type * as THREE from 'three';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
import {KIT} from './kit.ts';
import {sectionSolid,type SolidSection} from './sectionSolid.ts';
import {beamBetween} from './measuredPrimitives.ts';
import {T90_X_DATUMS} from './t90X.ts';

const YAW=T90_X_DATUMS.t90sm.yaw;
const {box,cylX,cylY,torus}=KIT;
/** Turret stock authored in the source build's hull frame, moved into the turret rig frame. */
function onTurret(P:TankBuilderPort,bucket:string,g:THREE.BufferGeometry,x:number,y:number,z:number):void{
  P.addEquipment(bucket,g,x-YAW[0],y-YAW[1],z-YAW[2]);
}

function airConditioner(P:TankBuilderPort):void{
  // The export tank's crew air conditioner, housed on the bustle box (top y 2.2185) clear of the remote station's
  // sweep: louvred condenser intakes on its rear and ends, two fan grilles on its roof, on two mounting rails.
  const x=-.20,z=-2.095,h=.28,y=2.2395+h/2,roof=2.2395+h;
  for(const dz of [-.205,.205])onTurret(P,'turretDetail',box(.80,.022,.05),x,2.2285,z+dz);
  onTurret(P,'turretDetail',box(.76,h,.47),x,y,z);
  onTurret(P,'turretDark',box(.66,h-.06,.006),x,y,-2.333);
  for(let i=0;i<9;i++)onTurret(P,'turretDetail',box(.66,.008,.03).rotateX(.6),x,y-.10+i*.025,-2.338);
  for(const side of [-1,1]){
    const fx=x+side*.38;
    onTurret(P,'turretDark',box(.006,h-.08,.36),fx+side*.003,y,z);
    for(let i=0;i<8;i++)onTurret(P,'turretDetail',box(.026,.008,.36).rotateZ(side*.6),fx+side*.008,y-.0875+i*.025,z);
  }
  for(const fx of [x-.19,x+.19]){
    onTurret(P,'turretDark',cylY(.15,.15,.008,24),fx,roof+.004,z);
    onTurret(P,'turretDetail',torus(.15,.012,24,6),fx,roof+.008,z);
    for(const a of [Math.PI/4,-Math.PI/4])onTurret(P,'turretDetail',box(.30,.010,.014).rotateY(a),fx,roof+.011,z);
    onTurret(P,'turretDetail',cylY(.035,.035,.016,12),fx,roof+.013,z);
  }
}

function dustSkirts(P:TankBuilderPort):void{
  // Full-length rubber dust skirts, the hot-climate export fit: one sheet per side hung 40 mm up behind the six side
  // screens' V hems (y .52/.4411, inner face x 1.7813/-1.77053), down to a straight hem at y .45, outboard of the track.
  // The hem stays above the belly pan (y .4411, the screens' own V tips): the rubber bucket spans both sides, so its
  // lowest point is the pan the simulation grounds on (restPoseContact.ts); a lower hem dropped it 148 mm.
  for(const side of [-1,1]){
    const inner=side>0?1.7813:1.77053,l=Math.min(side*(inner-.016),side*inner),r=Math.max(side*(inner-.016),side*inner);
    const sections:SolidSection[]=[];
    for(let i=0;i<6;i++){
      const z0=-1.082+i*.716,z1=z0+.705;
      for(const[z,hem]of [[z0,.52],[(z0+z1)/2,.4411],[z1,.52]])
        sections.push({z,ring:[[l,.45],[r,.45],[r,hem+.04],[l,hem+.04]]});
    }
    P.addEquipment('hullRubber',sectionSolid(sections));
    // The fold-down rubber front panel of the T-72/T-90 skirt, here under the rounded bow guard's lip (underside
    // y 1.246/1.234/1.151 at z 3.22/3.50/3.70) over the idler, raked up at its leading edge.
    const shift=side>0?0:.01371,a=side*(1.775-shift),b=side*(1.791-shift);
    P.addEquipment('hullRubber',sectionSolid([[3.212,1.2576,.45],[3.50,1.2457,.45],[3.70,1.1632,.50]].map(([z,top,low]):SolidSection=>
      ({z,ring:[[Math.min(a,b),low],[Math.max(a,b),low],[Math.max(a,b),top],[Math.min(a,b),top]]}))));
  }
}

function rearFlaps(P:TankBuilderPort):void{
  // Long rubber rear mud flaps behind the tracks, each under a steel clamp bar: on the right from the fender sheet's
  // tail (underside y ~1.28 at z -3.545), on the left from the exhaust casing's underside (y .9453); both hem at y .61.
  P.addEquipment('hullRubber',box(.64,.68,.016),1.38,.95,-3.545);
  P.addEquipment('hullDark',box(.66,.04,.026),1.38,1.27,-3.545);
  P.addEquipment('hullRubber',box(.56,.35,.016),-1.345,.79,-3.585);
  P.addEquipment('hullDark',box(.58,.04,.026),-1.345,.945,-3.585);
}

function sightHood(P:TankBuilderPort):void{
  // A sun hood over the Sosna-U gunner's sight window: a visor plate on the head's two forward arms (tops y 2.464),
  // its side cheeks and hinge; the window (y 2.325..2.455) and the head stay where they are.
  const x=-.6933;
  onTurret(P,'turretDetail',box(.32,.012,.15),x,2.470,.5606);
  for(const s of [-1,1])onTurret(P,'turretDetail',box(.010,.09,.12),x+s*.155,2.419,.5756);
  onTurret(P,'turretDark',cylX(.008,.30,8),x,2.474,.492);
}

function flankCase(P:TankBuilderPort):void{
  // A closed equipment case on the left bustle flank, inside the long basket rails and standing over them, carried on
  // two brackets and struts off the bustle box's side (x -.649): the export tank's extra crew and tool stowage.
  const l=-.905,r=-.650,z0=-2.27,z1=-1.70,y0=1.87,y1=2.33,x=(l+r)/2;
  onTurret(P,'turretDetail',box(r-l,y1-y0,z1-z0),x,(y0+y1)/2,(z0+z1)/2);
  onTurret(P,'turretDetail',box(r-l+.008,.014,z1-z0+.012),x,y1+.007,(z0+z1)/2);
  for(const z of [z0+.07,z1-.07]){
    onTurret(P,'turretDetail',box(r-l,.012,.05),x,y0-.006,z);
    onTurret(P,'turretDetail',beamBetween([l+.02,y0-.012,z],[-.655,1.76,z],.012,8),0,0,0);
    onTurret(P,'turretDark',box(.012,.05,.035),l-.004,2.27,z);
  }
}

export function addT90MarkSM2013Kit(P:TankBuilderPort):void{
  airConditioner(P);dustSkirts(P);rearFlaps(P);sightHood(P);flankCase(P);
}
