// The T-90AM (`t90am`): its own fittings on the T-90SM source build under the owner's field net (ghillieFleetSuits.ts). 2026-10-30 (lane t90-family-266; the owner: "our new
// versiosn now just look way too identical to sources. tone down that copying a lil", then "we can also make new turrets,
// layerring onn top, hull modificaitons, track shapes, shoulders, rear stuuff like barrrles and so on, sideskirts, cages,
// shtora or otherr quipmennt, machine guns"). Laid after the source build, in the builder frame of that build.
// The net covers the deck, the turret roof and the side drapes (z -3.05..3.35), so the package lives where it reads:
// the stern behind the drums, the fender ends and the bow guards.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {beamBetween} from './measuredPrimitives.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

type Point=readonly[number,number,number];
const {box,cylX}=KIT;
// Stern screen: its plane sits 75 mm behind the drums' rims (z -4.165); the top rail stays under the gun laid aft
// (bore 1.86 at the stern, its underside about 1.77).
const SCREEN_Z=-4.24,SCREEN_X=1.80,SCREEN_LOW=.86,SCREEN_TOP=1.70,RETURN_X=1.84,RETURN_FRONT=-3.345,RETURN_LOW=1.0;
// the arms run at the returns' fifth bar, inside the right fender's end sheet (y 1.24..1.33) and the exhaust casing
const ARM_Y=RETURN_LOW+4*(SCREEN_TOP-RETURN_LOW)/9;

function strut(P:TankBuilderPort,a:Point,b:Point,r=.022):void{P.addEquipment('hullDetail',beamBetween(a,b,r,10));}

/** Highest stock top under (x, z) among the hull's permanent buckets. */
function deckTop(P:TankBuilderPort,x:number,z:number):number{
  const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const ray=new THREE.Raycaster(new THREE.Vector3(x,4,z),new THREE.Vector3(0,-1,0));
  let top=-Infinity;
  P.forEachBucketPart(['hull','hullDetail'],g=>{const h=ray.intersectObject(new THREE.Mesh(g,mat))[0];if(h)top=Math.max(top,h.point.y);});
  mat.dispose();
  if(!Number.isFinite(top))throw new Error(`${P.spec.id}: no fender top under ${x},${z}`);
  return top;
}

// Stern bar cage: the field slat screen Russian crews hung behind the T-90M/T-72B3M sterns from 2022 against drones
// and RPGs, a flat-bar grille across the rear on fender-end and drum-cradle arms with returns down both sides.
function sternCage(P:TankBuilderPort):void{
  const width=SCREEN_X*2;
  for(let j=0;j<=12;j++){
    const y=SCREEN_LOW+j*(SCREEN_TOP-SCREEN_LOW)/12,rail=j===0||j===12;
    P.addEquipment('hullOpenLattice',box(width+.04,rail?.03:.012,.05),0,y,SCREEN_Z);
  }
  for(const x of[-1.80,-1.35,-.80,-.37,.37,.80,1.35,1.80])
    P.addEquipment('hullOpenLattice',box(.04,SCREEN_TOP-SCREEN_LOW+.03,.04),x,(SCREEN_TOP+SCREEN_LOW)/2,SCREEN_Z);
  for(const side of[-1,1]){
    const x=side*RETURN_X,len=RETURN_FRONT-SCREEN_Z;
    for(let j=0;j<=9;j++){
      const y=RETURN_LOW+j*(SCREEN_TOP-RETURN_LOW)/9,rail=j===0||j===9;
      P.addEquipment('hullOpenLattice',box(.05,rail?.03:.012,len),x,y,(RETURN_FRONT+SCREEN_Z)/2);
    }
    // the return's corner post and its front post, closing on the source rear cage's bar ends (z -3.323)
    for(const z of[RETURN_FRONT,-3.80])P.addEquipment('hullOpenLattice',box(.04,SCREEN_TOP-RETURN_LOW+.03,.04),x,(SCREEN_TOP+RETURN_LOW)/2,z);
    P.addEquipment('hullOpenLattice',box(Math.abs(RETURN_X-SCREEN_X)+.04,.03,.05),side*(RETURN_X+SCREEN_X)/2,SCREEN_TOP,SCREEN_Z);
    // a clamp from the front post onto the fender shoulder's edge (lower sheet x 1.81, y 1.24..1.33)
    P.addEquipment('hullOpenLatticeDark',box(.07,.05,.07),side*1.805,1.285,RETURN_FRONT-.03);
    // fender-end arms: out of the right fender end (z -3.63) and the left exhaust casing's rear face (z -3.889)
    const armZ=side>0?-3.60:-3.86;
    strut(P,[side*1.62,ARM_Y,armZ],[side*1.62,ARM_Y,SCREEN_Z+.02]);
    strut(P,[side*1.62,ARM_Y,armZ],[side*RETURN_X,ARM_Y,armZ],.018);
    // a brace from the arm down to the screen's bottom rail, and arms off both drum cradles' tail webs (z -4.097)
    strut(P,[side*1.35,SCREEN_LOW+.01,SCREEN_Z+.02],[side*1.62,ARM_Y,-3.92],.018);
    for(const cradle of side>0?[.3736,.8001]:[-.3655,-.8059])strut(P,[cradle,1.272,-4.08],[cradle,1.272,SCREEN_Z+.02],.02);
  }
}

// Unditching log: the T-72/T-90 crew's self-recovery beam, carried here across the stern screen's back in two strap hooks
// (the drums fill the plate it rides on the factory tank).
function sternLog(P:TankBuilderPort):void{
  const r=.10,y=.99,z=SCREEN_Z-.025-r;
  P.addEquipment('hullWood',cylX(r,2.30,16),0,y,z);
  for(const x of[-.80,.80]){
    P.addEquipment('hullDark',cylX(r+.008,.045,16),x,y,z);
    P.addEquipment('hullDark',box(.045,.20,.03),x,y+.04,SCREEN_Z-.035);
  }
}

// Rubber mud flaps: the service fleet's rear flaps behind each sprocket, clamped under the right fender end and under the
// left exhaust casing (whose underside is lower), keeping spray off the stern screen.
function rearFlaps(P:TankBuilderPort):void{
  for(const side of[-1,1]){
    const top=side>0?1.24:.9453,low=side>0?.72:.54,x=side*(side>0?1.42:1.39),w=side>0?.62:.54,z=-3.585;
    P.addEquipment('hullRubber',box(w,top-low,.015),x,(top+low)/2,z);
    P.addEquipment('hullDark',box(w+.02,.045,.032),x,top-.0225,z);
  }
}

// Front mud flaps: rubber aprons under the rounded bow guards ahead of the idlers, the fitting the T-90's front
// fenders carry in field service, 80 mm clear of the track's front run.
function frontFlaps(P:TankBuilderPort):void{
  const z=3.78,top=1.185,low=.58;
  for(const side of[-1,1]){
    const x=side>0?1.34:-1.34+.01371;
    P.addEquipment('hullRubber',box(.52,top-low,.015),x,(top+low)/2,z);
    P.addEquipment('hullDark',box(.54,.04,.03),x,top-.02,z);
  }
}

// Fender stowage box: an SPTA tool box on the right rear fender shoulder, aft of the bustle's sweep and ahead of the
// tow-cable eye, standing proud of the net.
function fenderBox(P:TankBuilderPort):void{
  const x=1.36,z=-2.95,y=deckTop(P,x,z),h=.26;
  P.addEquipment('hullFittingPaint',box(.50,h,.38),x,y+h/2,z);
  P.addEquipment('hullFittingPaint',box(.52,.03,.40),x,y+h-.012,z);
  for(const dz of[-.12,.12])P.addEquipment('hullDark',box(.04,.07,.012),x+.26,y+h-.06,z+dz);
}

export function addT90MarkAMKit(P:TankBuilderPort):void{
  sternCage(P);sternLog(P);rearFlaps(P);frontFlaps(P);fenderBox(P);
}
