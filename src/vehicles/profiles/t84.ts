// The T-84 (Object 478DU2, Malyshev, mid-1990s): lane t80-family-274, step 3 (the owner, 2026-11-20: the T-80 family
// "like our t90 fixes", the T-84 to sign off). It replaces the T-72B3M-hull Oplot concept (profiles/oplotModern.ts),
// building on the T-80U X hull and running gear the real tank shares with the T-80UD, as the T-80 marks and the Kursk do.
// From the photographs (lane evidence, Commons "Танк Т-84", "Object 478DU4 IDEX1999 Abu-Dhabi"; btvt, en/uk-wiki):
// - a welded, angular turret on the T-80U's ring in place of the cast one: flat sides, a blunt wedge front whose
//   Kontakt-5 is built in as flat boxes over the cheeks (not the T-80U's clamshell), no armoured bustle, a tubular
//   stowage rack across the rear with the snorkel on it;
// - the Shtora-1 dazzlers either side of the mantlet; the smoke launchers in two banks of six at the turret's rear sides;
// - the remotely laid 12.7 mm KT-12.7 over the commander's cupola, the 1G46 sight head on the gunner's side of the roof;
// - the T-80U's glacis Kontakt-5 in its V with the splash board; thick Kontakt-5 blocks on the skirts' front sections;
// - the 6TD-2 diesel's deck in place of the gas turbine's: an intake grille behind the turret, two radiator grilles and the
//   wide, shallow louvred exhaust across the top of the rear plate, with the two drums and the unditching log below it.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import {KIT,FITTINGS} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {beamBetween,blindTube,type Point3} from './measuredPrimitives.ts';
import {markEraHitFaces,markEraFurniture} from './eraHitFaces.ts';
import {markSmokeTube} from '../vehicleAuxiliaryGeometry.ts';
import {machinedRing} from '../machineGunGeometry.ts';
import {addShtoraEyes} from './shtora.ts';
import {addT90CradleDrums} from './t90CradleDrums.ts';
import {stowagePart} from './stowagePart.ts';
import {buildT80UXHullBase,buildT80UXGlacisEra,buildT80UXGun,T80U_X_YAW,T80U_X_TRUNNION} from './t80uX.ts';
import {T80U_X_RING_RAISE_M} from '../t80uXArmor.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const {box,cylX,torus}=KIT;
const cylY=(r:number,h:number,n=24)=>KIT.cylY(r,r,h,n);
const YAW:Point3=T80U_X_YAW,GUN:Point3=T80U_X_TRUNNION;
/** The turret's floor on the T-80U's yaw datum (hull frame), the parts authored against YAW as the X casting's are. */
const BASE=YAW[1];
const T=(x:number,y:number,z:number):[number,number,number]=>[x-YAW[0],y-YAW[1],z-YAW[2]];
const onTurret=(P:TankBuilderPort,bucket:string,g:Parameters<TankBuilderPort['add']>[1],x:number,y:number,z:number,rx=0,ry=0,rz=0)=>
  P.addEquipment(bucket,g,...T(x,y,z),rx,ry,rz);

// ------------------------------------------------------------------------------------------------- welded turret --

/** The hull's plan sections [z, half-width at the floor, half-width at the roof edge, roof height] (hull frame): the
 * vertical lower wall stands 0.22 m, then the upper wall leans in to the roof. The X casting ran z -1.36 to 1.18 across,
 * ±1.40 at its widest and 2.17 at its crown; the welded box keeps that envelope, a flat roof at 2.12. */
const BODY:readonly(readonly[number,number,number,number])[]=[
  [-1.30,.90,.78,2.04],[-1.05,1.18,1.04,2.08],[-.60,1.38,1.22,2.12],[.40,1.42,1.26,2.12],[.80,1.40,1.24,2.10],[1.15,.70,.60,2.02],
];
const WALL=.22;
/** The roof height at z (between the sections). */
function roofAt(z:number):number{
  if(z<=BODY[0][0])return BODY[0][3];
  for(let i=1;i<BODY.length;i++)if(z<=BODY[i][0]){const a=BODY[i-1],b=BODY[i],t=(z-a[0])/(b[0]-a[0]);return a[3]+(b[3]-a[3])*t;}
  return BODY[BODY.length-1][3];
}
/** Each cheek: a wedge from the shoulder (z .75, x 1.42) to the gun opening's flat front (z 1.50, x .80), its inner face
 * clear of the mantlet (.26), the roof falling from 2.10 to 1.98. [z, outer half-width, roof]. */
const CHEEK:readonly(readonly[number,number,number])[]=[[.75,1.42,2.10],[1.50,.80,1.98]];
const CHEEK_IN=.26;

function weldedTurret(P:TankBuilderPort):void{
  P.add('turret',sectionSolid(BODY.map(([z,wb,wt,top])=>({z:z-YAW[2],ring:[[-wb,0],[wb,0],[wb,WALL],[wt,top-BASE],[-wt,top-BASE],[-wb,WALL]]}))));
  for(const side of [-1,1])P.add('turret',sectionSolid(CHEEK.map(([z,w,top])=>{
    const a=side<0?-w:CHEEK_IN,b=side<0?-CHEEK_IN:w;
    return {z:z-YAW[2],ring:[[a,0],[b,0],[b,top-BASE],[a,top-BASE]]};
  })));
  P.add('turret',cylY(.994,.044,40),0,-.006,0);   // the ring collar over the T-80U's race, as the casting's
  // weld seams: the roof's edge and the cheeks' joint to the body
  for(const side of [-1,1]){
    onTurret(P,'turretDetail',box(.018,.018,1.95),side*1.25,2.115,-.15);
    onTurret(P,'turretDetail',beamBetween([side*1.42,2.10,.75],[side*.80,1.98,1.50],.010),0,0,0);
  }
}

/** The built-in Kontakt-5: a flat box over each cheek's roof and three boxes along each wedge face, bolted lids. */
function turretK5(P:TankBuilderPort):void{
  const [[z0,w0,t0],[z1,w1,t1]]=CHEEK,run=Math.hypot(w0-w1,z1-z0),dx=(w1-w0)/run,dz=(z1-z0)/run;
  for(const side of [-1,1]){
    const name=`turret_era_${side<0?'L':'R'}`;
    P.destructibleCluster(name,()=>{
      // the roof box: the cheek's plan, 6 cm deep, 4 cm inside its edges
      const lid=sectionSolid(CHEEK.map(([z,w,top],k)=>{
        const zz=k===0?z+.04:z-.04,o=w-.05,i=CHEEK_IN+.05,a=side<0?-o:i,b=side<0?-i:o;
        return {z:zz-YAW[2],ring:[[a,top-BASE-.004],[b,top-BASE-.004],[b,top-BASE+.056],[a,top-BASE+.056]]};
      }));
      P.addExternalArmor('turret',markEraHitFaces(lid,[0,1,0]));
      // the wedge face's three boxes, standing 9 cm proud of it
      // the face's outward normal (out and forward): (side*dz, -dx); a box's +z face turned onto it
      const yaw=Math.atan2(side*dz,-dx);
      for(const f of [.18,.50,.82]){
        const x=side*(w0+(w1-w0)*f),z=z0+(z1-z0)*f,nx=side*dz*.045,nz=-dx*.045;
        P.addExternalArmor('turret',markEraHitFaces(box(.29,.30,.09),[0,0,1]),...T(x+nx,BASE+.20,z+nz),0,yaw,0);
      }
    });
    for(const f of [.18,.50,.82]){
      const x=side*(w0+(w1-w0)*f),z=z0+(z1-z0)*f,y=t0+(t1-t0)*f;
      onTurret(P,'turretDark',markEraFurniture(cylY(.012,.010,8)),x-side*.18,y+.058,z);
    }
  }
}

/** The 2A46M-1's mantlet and gun are the T-80U's (the same trunnion); the Shtora-1 dazzlers on the cheeks' flat fronts. */
function shtora(P:TankBuilderPort):void{
  addShtoraEyes({mats:P.mats,turretG:P.turretG,disposables:P.disposables,
    add:(slot,geometry,x,y,z)=>P.addEquipment(slot,geometry,x,y,z)},
  {x:.56,y:1.80-YAW[1],z:CHEEK[1][0]+.105-YAW[2],scale:1.05,round:true,kit:true});
}

/** Two banks of six 902B tubes at the turret's rear sides, aimed forward and out. */
function smoke(P:TankBuilderPort):void{
  for(const side of [-1,1])for(let k=0;k<6;k++){
    const z=-.42-k*.105,x=side*1.21,y=2.135;
    onTurret(P,'turretDark',markSmokeTube(blindTube(.044,.033,.24,.15,16),[0,0,1],true),x,y,z,-.55,side*.28);
  }
  for(const side of [-1,1])onTurret(P,'turretDetail',box(.10,.05,.70),side*1.20,2.09,-.68);
}

/** Cupolas, the 1G46 sight head on the gunner's side (+x) and the commander's PNK-4S head ahead of his cupola. */
function roof(P:TankBuilderPort):void{
  const top=(z:number)=>roofAt(z);
  P.addCupola('turret',cylY(.3455,.076,28),...T(-.6265,top(-.225)+.036,-.225));
  onTurret(P,'turretDetail',cylY(.328,.028,28),-.6265,top(-.225)+.078,-.225);
  P.addCupola('turret',cylY(.3555,.065,28),...T(.4495,top(-.4315)+.030,-.4315));
  onTurret(P,'turretDetail',cylY(.333,.025,28),.4495,top(-.4315)+.065,-.4315);
  // the gunner's 1G46 head: a tall box with armoured doors over its window
  onTurret(P,'turretDetail',box(.30,.20,.36),.78,top(.30)+.098,.30);
  onTurret(P,'turretDark',box(.24,.08,.014),.78,top(.30)+.12,.487);
  for(const s of [-1,1])onTurret(P,'turretDetail',box(.012,.11,.16),.78+s*.14,top(.30)+.17,.40);
  // the commander's sight head ahead of his cupola
  onTurret(P,'turretDetail',box(.16,.16,.15),-.6265,top(.18)+.078,.18);
  onTurret(P,'turretDark',box(.12,.05,.010),-.6265,top(.18)+.11,.258);
  // the roof's add-on plate between the hatches (btvt) and a ventilator dome
  onTurret(P,'turretDetail',box(.42,.04,.62),-.08,top(-.10)+.018,-.10);
  onTurret(P,'turretDetail',cylY(.11,.06,16),.05,top(-.85)+.028,-.85);
}

/** The KT-12.7 on its remote mount over the commander's cupola: the fleet's working NSVT station, laid from inside. */
function kt127(P:TankBuilderPort):void{
  const ringTop=roofAt(-.225)+.093;
  P.addEquipment('turretDetail',machinedRing(.30,.33,.035,.004,24),...T(-.6265,ringTop+.012,-.225));
  const kt=FITTINGS.pintleMG({mats:P.mats,cls:'nsvt',tone:'dark',scale:1,ammo:true,shield:false,remoteControlled:true,
    ridingCradle:true,feed:'left',datumBarrel:false,seed:8484});
  kt.name='t84CommanderKt127';
  kt.position.set(...T(-.6265,ringTop+.03,-.30));
  P.turretG.add(kt);
  onTurret(P,'turretDetail',box(.10,.28,.14),-.79,ringTop+.14,-.16);   // the drive housing and the remote sight's window
  P.addModuleVisual('optics','turretGlass',box(.075,.055,.012),...T(-.79,ringTop+.24,-.088));
}

/** The rear rack: a welded tube frame across the turret's back, a tarpaulin roll and boxes in it, the snorkel on top. */
function rearRack(P:TankBuilderPort):void{
  const z0=-1.27,z1=-1.70,y0=1.70,y1=2.00,w=.90;
  for(const side of [-1,1]){
    onTurret(P,'turretDetail',stowagePart(beamBetween([side*w,y0,z0],[side*w,y0,z1],.016)),0,0,0);
    onTurret(P,'turretDetail',stowagePart(beamBetween([side*w,y1,z0],[side*w,y1,z1],.016)),0,0,0);
    onTurret(P,'turretDetail',stowagePart(beamBetween([side*w,y0,z1],[side*w,y1,z1],.016)),0,0,0);
  }
  for(const [y,z] of [[y0,z1],[y1,z1]] as const)onTurret(P,'turretDetail',stowagePart(beamBetween([-w,y,z],[w,y,z],.016)),0,0,0);
  onTurret(P,'turretDetail',stowagePart(box(1.78,.012,.40)),0,y0+.006,(z0+z1)/2);
  onTurret(P,'turretCloth',stowagePart(cylX(.13,1.30,16)),-.14,y0+.14,-1.40);
  for(const x of [.72,.42])onTurret(P,'turretDetail',stowagePart(box(.26,.22,.30)),x,y0+.12,-1.52);
  // the snorkel tube across the rack's top
  onTurret(P,'turretDetail',cylX(.17,1.70,24),0,y1+.17,-1.50);
  for(const x of [-.55,.55])onTurret(P,'turretDark',torus(.172,.011,24,6).rotateZ(Math.PI/2),x,y1+.17,-1.50);
}

// ------------------------------------------------------------------------------------------------------ the hull --

/** The 6TD-2's deck (hull frame, on the T-80U X hull's roof at 1.56): the intake grille behind the turret, two radiator
 * grilles over the engine, the wide, shallow louvred exhaust across the top of the sloping rear plate (z -3.13 at 1.547
 * to -3.36 at 1.347). */
function dieselDeck(P:TankBuilderPort):void{
  P.addEquipment('hullDetail',box(1.30,.030,.62),0,1.575,-1.62);
  for(let i=0;i<9;i++)P.addEquipment('hullDark',box(1.20,.008,.020),0,1.594,-1.87+i*.062);
  for(const side of [-1,1]){
    P.addEquipment('hullDetail',box(.80,.034,.86),side*.46,1.578,-2.62);
    for(let i=0;i<12;i++)P.addEquipment('hullDark',box(.70,.008,.018),side*.46,1.598,-2.99+i*.068);
  }
  // the exhaust: a louvred box lying on the rear plate's slope, 1.86 m across between the drums
  const lean=Math.atan2(1.547-1.347,3.36-3.13),zc=-3.245,yc=1.447,ny=Math.cos(lean),nz=-Math.sin(lean);
  P.addEquipment('hullDark',box(1.86,.06,.26),0,yc+ny*.028,zc+nz*.028,-lean,0,0);
  for(let i=0;i<5;i++){
    const t=-.10+i*.05;
    P.addEquipment('hullDetail',box(1.84,.008,.035),0,yc+ny*.062+Math.sin(lean)*t,zc+nz*.062+Math.cos(lean)*t,-lean+.5,0,0);
  }
}

/** The stern: two 200 L drums on the T-80U X cradles and the unditching log on its chains (as the T-80 marks). */
function stern(P:TankBuilderPort):void{
  addT90CradleDrums(P,1.664,-3.433,[[-1.542,-1.179],[1.179,1.542]]);
  P.addEquipment('hullDetail',stowagePart(cylX(.135,1.40,14)),0,1.06,-3.49);
  for(const x of [-.50,0,.50]){
    P.addEquipment('hullDark',stowagePart(torus(.142,.012,16,5).rotateY(Math.PI/2)),x,1.06,-3.49);
    P.addEquipment('hullDark',stowagePart(beamBetween([x,1.19,-3.45],[x,1.30,-3.33],.010)),0,0,0);
  }
}

/** The T-80U X side apron's section ([z, foot, top]; the face leans out from x 1.685 at the top to 1.80 at the foot) and
 * thick Kontakt-5 blocks on its three front sections. */
const APRON:readonly(readonly[number,number,number])[]=[[-2.882,.886,1.414],[-2.45,.815,1.458],[-1.22,.782,1.504],[1.75,.762,1.449],[2.886,.782,1.418]];
function apronAt(z:number):{foot:number;top:number}{
  for(let i=1;i<APRON.length;i++){const a=APRON[i-1],b=APRON[i];
    if(z<=b[0]||i===APRON.length-1){const t=Math.max(0,Math.min(1,(z-a[0])/(b[0]-a[0])));return {foot:a[1]+(b[1]-a[1])*t,top:a[2]+(b[2]-a[2])*t};}}
  return {foot:APRON[0][1],top:APRON[0][2]};
}
function skirtK5(P:TankBuilderPort):void{
  for(const side of [-1,1])P.destructibleCluster(`skirt_era_${side<0?'L':'R'}`,()=>{
    for(const z of [1.10,1.62,2.14]){
      const {foot,top}=apronAt(z),lean=Math.atan2(.115,top-foot),h=.34,y=top-.08-h/2;
      const x=1.80-.115*(y-foot)/(top-foot)-.015;
      P.addExternalArmor('hull',markEraHitFaces(box(.075,h,.48),[1,0,0]),side*x,y,z,0,0,side*lean);
      for(const dz of [-.18,.18])P.addExternalArmor('hull',markEraFurniture(cylX(.012,.012,8)),side*(x+.04),y+.10,z+dz,0,0,side*lean);
    }
  });
}

// ------------------------------------------------------------------------------------------------------- build --

export function buildT84(P:TankBuilderPort):void{
  P.hullG.position.set(0,0,0);
  P.turretG.position.set(YAW[0],YAW[1]+T80U_X_RING_RAISE_M,YAW[2]);
  P.addEquipment('hullDetail',machinedRing(.90,1.01,YAW[1]+T80U_X_RING_RAISE_M-.030-1.522,.004,P.q?32:20),YAW[0],1.522,YAW[2]);
  P.gunG.position.set(GUN[0]-YAW[0],GUN[1]-YAW[1],GUN[2]-YAW[2]);
  buildT80UXHullBase(P,{turbineDeck:false});
  buildT80UXGlacisEra(P);dieselDeck(P);stern(P);skirtK5(P);
  weldedTurret(P);turretK5(P);roof(P);smoke(P);rearRack(P);kt127(P);
  buildT80UXGun(P);shtora(P);
  for(const s of [-1,1])P.decal('turret','number',P.spec.visual.number||'084',.24,[s*1.405,.15,-.70],s*Math.PI/2);
  P.hullG.userData.familyRebuild={donor:'t80u',revision:1,variant:'t84-478du2'};
  P.turretG.userData.t84Receipt=Object.freeze({turret:'welded-478du2',deck:'6td-2',era:'kontakt-5',
    shtora:true,smokeTubes:12,roofGun:'kt-12.7',rearRack:true,sternDrums:true});
  P.topY=roofAt(-.225)+.093+.45-YAW[1];
}
