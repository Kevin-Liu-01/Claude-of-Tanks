// The T-90AM (`t90am`): its own fittings on the T-90SM source build under the owner's field net (ghillieFleetSuits.ts). 2026-10-30 (lane t90-family-266; the owner: "our new
// versiosn now just look way too identical to sources. tone down that copying a lil", then "we can also make new turrets,
// layerring onn top, hull modificaitons, track shapes, shoulders, rear stuuff like barrrles and so on, sideskirts, cages,
// shtora or otherr quipmennt, machine guns"). Laid after the source build, in the builder frame of that build.
// The net covers the deck, the turret roof and the side drapes (z -3.05..3.35), so the package lives where it reads:
// the stern behind the drums, the fender ends and the bow guards.
// 2026-10-31 (the owner: "also make some of our reworked t90s have new or unique machine gun arrangmenet,s like 2
// machine guns"): a second, working roof gun, a ganged twin 7.62 mm anti-drone mount on a post at the turret's left rear
// beside the remote station (twinPktMount).
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {beamBetween} from './measuredPrimitives.ts';
import {sectionSolid} from './sectionSolid.ts';
import {sourceMachineGun} from './sourceMachineGun.ts';
import {latheY,moldedBox,roundBar,sweptTube} from '../accessoryPrimitives.ts';
import {addPintleBarrel,addPintleFeed,addPintleReceiver,createPintleLayout,MG_AMMO_CAN_SLOT,MG_CLASSES,
  pintleFeedTrayZ} from '../machineGunGeometry.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
import {addT90CradleDrums} from './t90CradleDrums.ts';

type Point=readonly[number,number,number];
const {box,cylX,cylY}=KIT;
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

// Stowage deck: a plate floor across the cage bay at the drum cradles' mounting-plate level, from the hull's rear face
// to the screen, with a grating face and a crate lashed between the drums. 2026-10-31 (tank-standard-check §B2): the
// bay the screen, its returns and the hull enclosed read as a hole in plan; the crews floored theirs to stow kit in it.
// It replaces the unditching log that hung behind the screen and left slots between the two.
const DECK_Y=1.235;
/** The hull's rear stock ahead of (x, y) behind the stern: the first 'hull' part a ray toward +Z meets, or null. */
function sternFaceZ(P:TankBuilderPort,x:number,y:number):number|null{
  const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const ray=new THREE.Raycaster(new THREE.Vector3(x,y,SCREEN_Z),new THREE.Vector3(0,0,1),0,1.2);
  let face:number|null=null;
  P.forEachBucketPart(['hull'],g=>{const h=ray.intersectObject(new THREE.Mesh(g,mat))[0];if(h&&(face===null||h.point.z<face))face=h.point.z;});
  mat.dispose();
  return face;
}
function stowageDeck(P:TankBuilderPort):void{
  const back=SCREEN_Z+.03,w=2*RETURN_X-.04;
  // three strips, each running forward under the hull's rear stock it meets (the tub between the drums, the fender ends
  // at the sides) and lapped 12 mm under it: the bay closes in plan right up to the hull (tank-standard-check B2)
  for(const [x0,x1] of [[-w/2,-1.10],[-1.10,1.10],[1.10,w/2]] as const){
    // probed at the deck and up to 10 cm over it: the fender ends and the tub's overhang stand a little above the deck,
    // which then runs on under them
    const xc=(x0+x1)/2,face=Math.max(...[x0+.05,xc,x1-.05].flatMap(x=>[.004,.045,.085].map(dy=>sternFaceZ(P,x,DECK_Y+dy)??-3.70)));
    const front=Math.min(-3.40,face+.012),depth=front-back,z=(front+back)/2,sw=x1-x0;
    P.addEquipment('hullDetail',box(sw,.012,depth),xc,DECK_Y-.006,z);
    for(let x=x0+.06;x<x1-.05;x+=.12)P.addEquipment('hullOpenLatticeDark',box(.012,.010,depth-.02),x,DECK_Y+.004,z);
    for(const dz of[-depth/2+.02,depth/2-.02])P.addEquipment('hullOpenLatticeDark',box(sw-.02,.022,.022),xc,DECK_Y+.011,z+dz);
  }
  // the crate rides the deck between the drums' inner ends, clear under the gun laid aft
  const cz=SCREEN_Z+.03+.17;
  P.addEquipment('hullFittingPaint',box(.26,.20,.30),0,DECK_Y+.10,cz);
  P.addEquipment('hullDark',box(.27,.012,.31),0,DECK_Y+.205,cz);
  for(const dz of[-.09,.09])P.addEquipment('hullDark',box(.272,.212,.022),0,DECK_Y+.10,cz+dz);
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

// Twin anti-drone mount: two 7.62 mm PKTs ganged on one cradle, the field fit Russian crews put on tank turrets from
// 2024 against FPV drones, here a remote mount (the PKT's own solenoid triggers, a camera sight on the cradle's roll bar,
// the slew and elevation drives cabled into the turret). It stands on a slewing post on the roof plate at the turret's
// left rear, 1.04 m behind the remote station's ring, and is one working station (calibre 7.62: the rifle profile).
// Turret frame (pivot at hull 0.008, 1.532, 0.359). Its height is set by the remote station, which turns its hoods and
// Kord through a 0.76 m circle up to 1.605: the twin's column and fork turn inside 0.2 m of its own axis, its cradle
// rides over the hoods' circle and its barrels (0.71 m out) over the Kord's, the bores at 1.69 (1.0 m over the roof),
// so the two stations' full circles keep 47 mm apart at any pair of bearings, and the rear radio mast (0.47 m off, its
// whip to 1.52) passes under the guns. It rests 30 degrees to the left; the remote station rests aft.
const TWIN={x:.50,z:-2.30,bore:1.69,bearingDeg:30,name:'t90amTwinPkt'};
// the guns (receiver, barrel, solenoid back plate) on the fleet's GPMG construction, both feeding from the right as the
// PKT does: across the cradle from the left, the left cheek, the left gun, its box, the right gun, its box, the right cheek
const TWIN_GUN_X=[.134,-.034] as const,TWIN_BOX_X=[.050,-.118] as const,TWIN_CHEEK_X=.176,TWIN_ARM_X=.190;
const TWIN_BARREL=.56,TWIN_BOX={w:.09,h:.13,d:.20};
// Over the remote station (mount-local yaw -85..20 degrees from the rest bearing) the twin depresses only as far as keeps
// its cradle and barrels 20 mm over everything that station turns at level through its whole circle (its hoods, box and
// Kord, wherever it is turned), less 0.01 rad; elsewhere the weapon's full depression clears the roof. Measured every
// 5 degrees in 0.005 rad steps on the built mount ([yaw, deepest clear depression], radians; auxiliaryInventory.ts).
const TWIN_DEPRESSION:readonly(readonly[number,number])[]=[[-1.4835,.18],[-1.3963,.145],[-1.309,.08],[-1.2217,.08],[-1.1345,.08],
  [-1.0472,.065],[-.9599,.055],[-.8727,.065],[-.7854,.065],[-.6981,.055],[-.6109,.065],[-.5236,.065],[-.4363,.065],[-.3491,.05],
  [-.2618,.065],[-.1745,.06],[-.0873,.06],[0,.08],[.0873,.08],[.1745,.08],[.2618,.125],[.3491,.18]];

/** The turret stock's top under (x, z) (ERA hit faces left out), and the low and high tops under a w x d footprint. */
function turretTops(P:TankBuilderPort,x:number,z:number,w:number,d:number):[number,number]{
  const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),stock:THREE.Mesh[]=[];
  P.forEachBucketPart(['turret','turretExternalArmor','turretDetail','turretPermanentMarkingSurface'],g=>{
    if(!g.userData.eraHitFaceVertexStarts){const m=new THREE.Mesh(g,mat);m.updateMatrixWorld();stock.push(m);}
  });
  const ys:number[]=[];
  for(const sx of[-1,0,1])for(const sz of[-1,0,1]){
    const hit=new THREE.Raycaster(new THREE.Vector3(x+sx*w/2,3,z+sz*d/2),new THREE.Vector3(0,-1,0)).intersectObjects(stock)[0];
    if(!hit||hit.point.y<.45)throw new Error(`${P.spec.id}: the twin mount's post has no roof under ${x+sx*w/2},${z+sz*d/2}`);
    ys.push(hit.point.y);
  }
  mat.dispose();
  return [Math.min(...ys),Math.max(...ys)];
}

function twinPktMount(P:TankBuilderPort):void{
  // the base plate (buried 8 mm under the roof's lowest corner), the slewing ring's housing on its bolted flange, and the
  // slew drive's gearbox and motor behind the ring with the motor's cable gland down into the plate
  const {x,z,bore}=TWIN,plateZ=z-.05,[low,high]=turretTops(P,x,plateZ,.28,.36);
  const plateTop=high+.014,ringTop=plateTop+.058;
  P.addEquipment('turretDetail',box(.28,plateTop-low+.008,.36),x,(plateTop+low-.008)/2,plateZ);
  P.addEquipment('turretDetail',latheY([[0,0],[.125,0],[.125,.012],[.106,.016],[.106,.052],[.098,.060],[0,.060]],24),x,plateTop-.002,z);
  for(let k=0;k<8;k++){const a=(k+.5)*Math.PI/4;P.addEquipment('turretDark',cylY(.008,.008,.008,6),x+Math.sin(a)*.116,plateTop+.013,z+Math.cos(a)*.116);}
  // (the gearbox's inner face 15 mm outside the turntable's rim: the turntable turns over the ring, not over the drive)
  P.addEquipment('turretDetail',moldedBox(.09,.07,.075,.008,1,.005),x,plateTop+.034,z-.1525);
  P.addEquipment('turretDetail',cylX(.032,.085,14),x+.085,plateTop+.034,z-.157);
  P.addEquipment('turretDark',cylX(.035,.012,14),x+.1335,plateTop+.034,z-.157);
  P.addEquipment('turretDark',sweptTube([[x+.11,plateTop+.03,z-.18],[x+.11,plateTop+.012,z-.205],[x+.10,plateTop-.004,z-.215]],.008,6,6));
  // the station: its yaw axis on the ring, the trunnion on that axis at the bores' height, the muzzle between the guns
  // (the muzzle as machineGunGeometry.ts addPintleBarrel draws it: the barrel's seat, the barrel, the flash hider and
  // its 11 mm end marker ahead of the trunnion, at the GPMG's own scale)
  const {s:mgS,flashL}=MG_CLASSES.mag,reach=.10*mgS+TWIN_BARREL+flashL*mgS+.011,gunMid=(TWIN_GUN_X[0]+TWIN_GUN_X[1])/2;
  const gun=sourceMachineGun(P,[0,0,0],{name:TWIN.name,caliberMm:7.62,yaw:[x,ringTop,z],pivot:[x,bore,z],muzzle:[x+gunMid,bore,z+reach]});
  // yaw stage: the turntable, the column with its foot gussets, the fork and its trunnion bosses, the elevation drive
  // under the fork and the cable up the column into it
  gun.stage('yaw');
  const head=bore-.27,yaw:Record<'turretDetail'|'turretDark',THREE.BufferGeometry[]>={turretDetail:[],turretDark:[]};
  const put=(slot:'turretDetail'|'turretDark',g:THREE.BufferGeometry,px:number,py:number,pz:number,rx=0,ry=0,rz=0):void=>{
    yaw[slot].push(KIT.xform(g,px,py,pz,rx,ry,rz));
  };
  put('turretDetail',latheY([[0,0],[.10,0],[.10,.016],[.062,.03],[.05,.034],[0,.034]],24),x,ringTop-.002,z);
  put('turretDetail',cylY(.048,.052,head-ringTop,16),x,(head+ringTop)/2,z);
  const gusset=sectionSolid([-1,1].map(side=>({z:side*.005,ring:[[.046,0],[.094,0],[.046,.12]] as [number,number][]})));
  for(let k=0;k<4;k++)put('turretDetail',KIT.xform(gusset.clone(),0,0,0,0,k*Math.PI/2,0),x,ringTop+.016,z);
  gusset.dispose();
  // the fork: a welded base across the column's head and two arms, deeper at the foot, to the trunnion bosses
  put('turretDetail',moldedBox(2*TWIN_ARM_X+.012,.04,.09,.008,1,.005),x,head,z);
  put('turretDetail',cylY(.06,.05,.05,16),x,head-.04,z);
  for(const side of[-1,1]){
    const arm=sectionSolid([-1,1].map(t=>({z:t*.006,ring:[[-.05,0],[.05,0],[.035,bore-head+.035],[-.035,bore-head+.035]] as [number,number][]})));
    put('turretDetail',KIT.xform(arm,0,0,0,0,-Math.PI/2,0),x+side*TWIN_ARM_X,head+.005,z);
    put('turretDark',cylX(.03,.016,16),x+side*(TWIN_ARM_X+.014),bore,z);
  }
  put('turretDetail',moldedBox(.10,.09,.085,.008,1,.005),x,head-.095,z-.075);
  put('turretDark',sweptTube([[x,ringTop+.034,z-.055],[x,ringTop+.12,z-.056],[x,head-.16,z-.056],[x,head-.14,z-.075]],.009,6,10),0,0,0);
  // two clamp collars hold the cable to the column
  for(const t of[.36,.68])put('turretDark',cylY(.067,.067,.022,16),x,ringTop+(head-ringTop)*t,z);
  for(const slot of['turretDetail','turretDark'] as const)gun.add(slot,KIT.mergeAll(yaw[slot]),0,0,0);
  gun.stage('pitch');
  // the cradle: two welded flat-bar side frames (a top rail, a foot rail along the tray, three uprights and the front
  // strut) with their trunnion lugs (the pins through them into the fork), the tray across their feet that carries both
  // boxes and the saddles under both receivers, the front tie under the barrels' breeches with its clamps, and the roll
  // bar over the guns carrying the camera sight; the frames leave the boxes and the receivers in sight from the side
  const plate=(ring:[number,number][]):THREE.BufferGeometry=>KIT.xform(sectionSolid([-1,1].map(t=>({z:t*.004,ring}))),0,0,0,0,-Math.PI/2,0);
  const trayTop=bore-.02-TWIN_BOX.h-.002,foot=trayTop-bore-.012;
  for(const side of[-1,1]){
    const fx=x+side*TWIN_CHEEK_X;
    gun.add('turretDetail',box(.008,.022,.40),fx,bore-.041,z-.10);
    gun.add('turretDetail',box(.008,.024,.25),fx,trayTop-.006,z-.13);
    for(const uz of[-.245,-.13,-.015])gun.add('turretDetail',box(.008,-.03-foot,.022),fx,bore+(foot-.03)/2,z+uz);
    gun.add('turretDetail',plate([[-.026,foot],[.004,foot],[.105,-.052],[.075,-.052]]),fx,bore,z);
    gun.add('turretDetail',plate([[-.07,-.05],[.07,-.05],[.07,0],[.035,.035],[-.035,.035],[-.07,0]]),fx,bore,z);
    gun.add('turretDark',cylX(.016,TWIN_ARM_X-TWIN_CHEEK_X+.012,12),x+side*(TWIN_CHEEK_X+TWIN_ARM_X)/2,bore,z);
  }
  gun.add('turretDetail',box(2*TWIN_CHEEK_X,.012,.22),x,trayTop-.006,z-.13);
  for(const gx of TWIN_GUN_X)for(const sz of[-.20,-.06]){
    gun.add('turretDetail',box(.05,bore-.0235-trayTop+.004,.04),x+gx,(bore-.0235+trayTop)/2,z+sz);
  }
  gun.add('turretDetail',box(2*TWIN_CHEEK_X,.024,.03),x,bore-.05,z+.10);
  for(const gx of TWIN_GUN_X)gun.add('turretDark',box(.032,.026,.022),x+gx,bore-.026,z+.10);
  for(const side of[-1,1])gun.add('turretDark',roundBar([x+side*TWIN_CHEEK_X,bore-.04,z-.28],[x+side*TWIN_CHEEK_X,bore+.13,z-.22],.011,8),0,0,0);
  gun.add('turretDark',roundBar([x-TWIN_CHEEK_X,bore+.13,z-.22],[x+TWIN_CHEEK_X,bore+.13,z-.22],.011,8),0,0,0);
  // the camera sight: a sealed box on the bar between the guns, its window forward under a sun hood
  gun.add('turretDetail',moldedBox(.11,.08,.15,.010,1,.006),x+gunMid,bore+.178,z-.19);
  gun.add('turretDetail',box(.11,.006,.05),x+gunMid,bore+.221,z-.095);
  gun.add('turretDark',box(.084,.058,.006),x+gunMid,bore+.178,z-.113);
  gun.add('turretGlass',box(.066,.044,.004),x+gunMid,bore+.178,z-.109);
  // the guns, their boxes and belts
  for(let i=0;i<2;i++){
    const gx=TWIN_GUN_X[i],bx=TWIN_BOX_X[i];
    const off={x:x+gx,y:0,z:0};
    const pkt=createPintleLayout({cls:'mag',scale:1,remote:true,ammo:false,mount:'external-cradle',feed:'right',barrelLength:TWIN_BARREL},{
      add(name,geometry,px=0,py=0,pz=0,rx=0,ry=0,rz=0){
        const slot=name===MG_AMMO_CAN_SLOT?'turretAmmo' as const:'turretDark' as const;
        gun.add(slot,KIT.xform(geometry,px,py,pz,rx,ry,rz),off.x,off.y,off.z);
      },
    });
    off.y=bore-pkt.trunY;off.z=z-pkt.trunZ;
    addPintleReceiver(pkt);addPintleBarrel(pkt);
    // the box beside the receiver's feed side, its top under the feed tray, the lid's mouth open toward the gun
    const {w,h,d}=TWIN_BOX,bxW=x+bx,by=bore-.02-h/2,bz=z-.13;
    gun.add('turretAmmo',moldedBox(w,h,d,.008,1,.005),bxW,by,bz);
    const mouthW=w*.34,lidY=by+h/2;
    gun.add('turretAmmo',moldedBox(w*1.04-mouthW,.01,d*1.025,.006,1,.003),bxW-mouthW/2,lidY+.005,bz);
    gun.add('turretDark',new THREE.BoxGeometry(mouthW*.86,.004,d*.9),bxW+w/2-mouthW/2,lidY+.0005,bz);
    gun.add('turretDark',roundBar([bxW-w*.52,lidY,bz-d*.42],[bxW-w*.52,lidY,bz+d*.42],.0045,6),0,0,0);
    gun.add('turretDark',new THREE.BoxGeometry(w*.42,.034,.007),bxW,lidY-.03,bz+d/2+.004);
    addPintleFeed(pkt,[bxW+w/2-mouthW/2-off.x,lidY-.02-off.y,pintleFeedTrayZ(pkt)],lidY-off.y,.03,11);
    // the solenoid's cable from its gland back, down and forward onto the tray's rear edge
    const back=off.z+pkt.recZ-pkt.rd/2-.105*pkt.s,cx=off.x+pkt.bodyW*.18,cy=off.y+pkt.bodyH*.3;
    gun.add('turretDark',sweptTube([[cx,cy,back-.010],[cx,cy-.03,back-.035],[cx,trayTop+.02,z-.27],[cx,trayTop+.004,z-.236]],.004,5,8),0,0,0);
  }
  const root=gun.finish();
  root.userData.t90OwnBearing=true;
  root.userData.depressionByYaw=TWIN_DEPRESSION.map(([y,d])=>[y,d]);
  root.rotateY(THREE.MathUtils.degToRad(TWIN.bearingDeg));
}

export function addT90MarkAMKit(P:TankBuilderPort):void{
  // the mark's rear drums: two 200 L drums on each pair of the source build's cradles (t90CradleDrums.ts). The source-X
  // twin keeps its reference's empty cradles (Main 10-31: the gate measures against what the build follows)
  addT90CradleDrums(P,1.5335,-3.86,[[-.8059,-.3655],[.3736,.8001]]);
  sternCage(P);stowageDeck(P);rearFlaps(P);frontFlaps(P);fenderBox(P);twinPktMount(P);
}
