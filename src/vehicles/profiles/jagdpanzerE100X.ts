// Original first-party reconstruction of the supplied fictional vehicle.
// The private comparison GLB is never a playable asset or vertex source.
import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { beamBetween, blindTube } from './measuredPrimitives.ts';
import { jagdpanzerBell, jagdpanzerFixedCollar, jagdpanzerBearingDome } from './jagdpanzerE100XGun.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylY, cylZ, torus } = KIT;
const PITCH = [-.0007, 2.33805, .20] as const;
export const JPZE100_X_DATUMS = Object.freeze({
  dims: {hullLengthM:8.7475677,overallLengthM:11.4206558,widthM:4.4788417,heightM:3.16101265},
  turretPivot: PITCH, trunnion: PITCH, muzzleZ:7.04687214, roofEquipmentTopM:3.400795,
  // Internal virtual traverse axis, not a claimed bearing in the reference.
  jointBasis:'fixed hull casemate; inferred internal limited-traverse trunnion; repeated physical bore circles',
  wheelZs:[-2.449407,-1.740414,-1.031552,-.322558,.386304,1.091798,1.804232,2.513210],
});

function place(P:TankBuilderPort,slot:string,g:THREE.BufferGeometry,x:number,y:number,z:number,rx=0,ry=0,rz=0):void {
  const gun=slot.startsWith('gun');
  P.addEquipment(slot,g,x-(gun?PITCH[0]:0),y-(gun?PITCH[1]:0),z-(gun?PITCH[2]:0),rx,ry,rz);
}
function optic(P:TankBuilderPort,slot:string,g:THREE.BufferGeometry,x:number,y:number,z:number):void {
  // Fixed casemate sights belong to the hull, never the virtual gun traverse.
  P.addModuleVisual('optics',slot,g,x,y,z);
}

function hullTub(P:TankBuilderPort):void {
  const row=(z:number,top:number,bottom:number,wide:number,base=1.001,sideBottom=bottom):SolidSection=>{
    // The centre nose closes to a 10 mm lip. Preserve monotone returns inside
    // that thickness; fixed 20 mm offsets would fold its end contour over.
    const depth=top-Math.max(bottom,sideBottom);
    const returnLow=Math.min(top-Math.min(.02,depth*.75),Math.max(sideBottom+.005,Math.min(.990,top-.03)));
    const returnHigh=Math.min(top-Math.min(.015,depth*.50),Math.max(bottom+.010,Math.min(1.005,top-.02)));
    const shoulder=Math.min(top-Math.min(.01,depth*.25),Math.max(bottom+.02,top-(z>3.3?.14:.27)));
    return{z,ring:[
    // Main hull sides stay inside the tracks. The wider circular drive
    // housings below are separate fixtures, not an extended lower glacis.
    [-base,sideBottom],[-.881,bottom],[.881,bottom],[base,sideBottom],
    [base,returnLow],[1.001,returnHigh],[1.001,shoulder],
    [wide-.03,top],[-wide+.03,top],[-1.001,shoulder],
    [-1.001,returnHigh],[-base,returnLow],
  ]};};
  P.add('hull',sectionSolid([
    row(-4.11,1.77,1.02,1.586),row(-3.87,1.77,.865,1.586),
    row(-3.48,1.77,.4198,1.586),row(2.86,1.77,.4198,1.586),
    row(3.30,1.6388,.4198,1.586),row(3.72,1.430,.77988,1.586),
    row(4.12,1.224,1.123958,1.086),row(4.19296,1.1868,1.1768,1.08),
  ]));
  for(const side of[-1,1]) {
    // Source final-drive covers: 30-sided circular castings, not a broad
    // solid nose wedge. Their inboard ends engage the actual hull wall.
    P.add('hull',cylX(.3869442,.2297804,30).rotateX(Math.PI/2),
      side*1.114825,.8232929,3.399256);
  }
  // Thin connected over-track shells: no solid cuboid fills the wheel bays.
  const section=(z:number,width:number,roof:number,edge:number,side:number):SolidSection=>{
    // The nose rounds down toward a raised outer lip; it does NOT translate
    // the entire fender section downward into the front sprocket envelope.
    const outer=1.14+(2.23942-1.14)*width;
    // An authored rolled-shoulder curve: shallow root tangent, progressively
    // rounder outer roll. Five straight panels exaggerated the faceting.
    const arcStart=Math.min(1.585,outer-.08);
    const crown:[number,number][]=[[1.005,roof]];
    for(let i=0;i<=12;i++) {
      const u=i/12,drop=.374*u+.051*u*u+.575*u**7;
      crown.push([arcStart+(outer-arcStart)*u,roof-(roof-edge)*drop]);
    }
    const ring:[number,number][]=[...crown.map(([x,y])=>[x,y-.070] as [number,number]),...crown.slice().reverse()];
    const transformed=ring.map(([x,y])=>[side*x,y] as [number,number]);
    return{z,ring:side<0?transformed.reverse():transformed};
  };
  for(const side of[-1,1]) {
    P.addMudguard('jpze100-x-connected-guard','hull',sectionSolid([
      section(-4.15,.76,1.55,1.13,side),section(-3.90,.94,1.73,.99,side),
      section(-3.48,1,1.770,.93,side),section(2.88,1,1.77,.93,side),
      section(3.38,.994,1.608,.97,side),section(3.75,.943,1.418,1.035,side),
      section(4.01,.770,1.303,1.18,side),section(4.193,.40,1.24,1.21,side),
    ]));
    // Individual lifting eyes seated on the curved shoulder crown.
    for(const z of[-3.55,-2.42,-1.27,.02,1.35,2.56]) {
      place(P,'hullDetail',box(.12,.033,.12),side*1.92,1.55,z,0,0,side*-.48);
      place(P,'hullDetail',torus(.049,.012,14,8),side*1.93,1.58,z,0,0,Math.PI/2);
    }
  }
}

function casemate(P:TankBuilderPort):void {
  const row=(z:number,top:number):SolidSection=>{
    const roofHalf=1.586-(top-1.77)*.378;
    return{z,ring:[[-1.586,1.737],[1.586,1.737],[roofHalf,top],[-roofHalf,top]]};
  };
  // The aft fighting compartment is hull-owned. Only the internal cradle
  // and its cannon may traverse: never rotate the whole casemate as a turret.
  P.add('hull',sectionSolid([
    row(-4.1911,1.7374),row(-4.0314,3.12555),row(-3.98765,3.161013),
    row(-2.27613,3.161013),row(-.65194,3.06395),row(-.49255,3.02090),row(.25619,1.77074),
  ]));
  for(const side of[-1,1]) {
    // Two measured rows of projecting stowage clips. A circular bolt head
    // does not reproduce their 149mm vertical stand-off or the real hook air.
    for(const z of[-3.872,-3.416,-2.971,-2.515,-2.030,-1.574,-1.088,-.632])for(const y of[1.978,2.424]) {
      const rootX=1.586-(y-1.77)*.378-.004,tip=rootX+.044;
      place(P,'hullDetail',beamBetween([side*rootX,y+.01,z],[side*tip,y+.01,z],.012),0,0,0);
      place(P,'hullDetail',beamBetween([side*tip,y+.01,z],[side*tip,y+.137,z],.012),0,0,0);
      place(P,'hullDetail',beamBetween([side*tip,y+.137,z],[side*(tip-.027),y+.137,z],.012),0,0,0);
    }
  }
  P.add('hullDetail',jagdpanzerFixedCollar());
  P.add('hullDetail',jagdpanzerBearingDome());
  for(let i=0;i<14;i++) {
    const a=i*Math.PI*2/14,y=2.402+Math.cos(a)*.544;
    const z=(1.212762-.506720064*y)/.862110652;
    place(P,'hullDetail',cylZ(.042,.052,6),Math.sin(a)*.721,y,z+.012,-.53135);
  }
}

function hatches(P:TankBuilderPort):void {
  // Separate measured roof/deck lids; gaps around optic lips are actual air.
  for(const[x,y,z,r]of[[-.495,3.161,-1.80,.4665],[-.677,3.090,-1.023,.322],
    [-.91,1.770,1.245,.335],[.91,1.770,1.245,.335]]) {
    place(P,'hullDetail',cylY(r,r,.034,36),x,y+.015,z);
    place(P,'hullDetail',cylY(r*.84,r*.87,.026,32),x,y+.045,z);
    place(P,'hullDetail',beamBetween([x-.12,y+.062,z],[x-.12,y+.104,z],.013),0,0,0);
    place(P,'hullDetail',beamBetween([x-.12,y+.104,z],[x+.12,y+.104,z],.013),0,0,0);
    place(P,'hullDetail',beamBetween([x+.12,y+.104,z],[x+.12,y+.062,z],.013),0,0,0);
  }
  const sight=(x:number,y:number,z:number,w:number):void=>{
    for(const side of[-1,1])optic(P,'hullDetail',box(.026,.105,.11),x+side*(w-.026)/2,y+.052,z);
    optic(P,'hullDetail',box(w,.021,.11),x,y+.109,z);
    optic(P,'hullDetail',box(w,.10,.018),x,y+.05,z-.055);
    optic(P,'hullGlass',box(w-.052,.058,.004),x,y+.058,z+.004);
  };
  sight(-.708,3.184,-1.844,.210);
  sight(.908,1.809,1.520,.212);
  sight(-.908,1.809,1.520,.212);
  for(const x of[.511765,-.462957]) {
    // Two low glacis vision blocks are distinct from the hatch periscopes.
    // Their projecting frame encloses a 20mm-deep open lens reveal.
    for(const side of[-1,1])optic(P,'hullDetail',box(.07412,.09926,.10431),
      x+side*.10853,1.81881,2.837784);
    optic(P,'hullDetail',box(.143,.02204,.10431),x,1.857423,2.837784);
    optic(P,'hullDetail',box(.143,.016,.10431),x,1.77718,2.837784);
    optic(P,'hullDetail',box(.29118,.09926,.014),x,1.81881,2.792628);
    optic(P,'hullGlass',box(.14294,.056,.004),x,1.818,2.867583);
  }
  // The source's aft roof fitting is a raised tapered cupola, not the flat
  // lid in the first draft. Its short forward weapon and three eyes are
  // separate physical parts; none is a silhouette-only floating marker.
  place(P,'hullDetail',cylY(.2912,.4115,.236,40),.4723,3.2772,-3.4117);
  cupolaWeapon(P);
  for(const[x,z,ry]of[[.487,-3.7408,0],[.7403,-3.2175,2.1],[.2199,-3.1987,-2.1]]) {
    place(P,'hullDetail',box(.065,.045,.045),x,3.315,z,0,ry);
    place(P,'hullDetail',torus(.031,.010,16,8),x,3.358,z,Math.PI/2,ry);
  }
  // Low roof ventilator and three handled/periscope covers, independently
  // located from the supplied model's complete hull owner.
  place(P,'hullDetail',cylY(.1725,.2365,.066,32),.0017,3.177,-1.2087);
  for(const[x,z,angle]of[[-.8012,-3.8862,-.20],[.8007,-3.8857,.20],[-.7143,-1.0825,0]]) {
    place(P,'hullDetail',box(.30,.033,.112),x,3.190,z,0,angle);
    place(P,'hullDetail',beamBetween([x-.12,3.201,z],[x-.12,3.240,z],.011),0,0,0);
    place(P,'hullDetail',beamBetween([x-.12,3.240,z],[x+.12,3.240,z],.011),0,0,0);
    place(P,'hullDetail',beamBetween([x+.12,3.240,z],[x+.12,3.201,z],.011),0,0,0);
  }
  for(const x of[-.8012,.8007]) {
    for(const s of[-1,1])optic(P,'hullDetail',box(.023,.054,.075),x+s*.118,3.213,-3.92);
    optic(P,'hullDetail',box(.26,.015,.075),x,3.242,-3.92);
    optic(P,'hullGlass',box(.212,.030,.004),x,3.216,-3.937);
  }
  // Central bow lamp has a recessed lens inside the cylindrical guard.
  place(P,'hullDetail',blindTube(.0864,.068,.135,.037,24),-.0126,1.7331,3.5660);
  place(P,'hullGlass',cylZ(.063,.004,24),-.0126,1.7331,3.5985);
  place(P,'hullDetail',box(.086,.16,.053),-.0126,1.671,3.528);
}

function cupolaWeapon(P:TankBuilderPort):void {
  // This is the existing source-measured enclosed cupola weapon, not an
  // extra free-standing pintle. Its receiver root enters the cupola casting
  // and its straight jacket overlaps that receiver by25.5mm. A small blind
  // muzzle recess is inferred where the reference has a flat muzzle cap.
  const station=new THREE.Group();
  station.name='jpze100XEnclosedCupolaWeapon';
  const receiver=new THREE.Mesh(box(.0794,.172,.1296),P.mats.dark);
  receiver.name='jpze100XCupolaReceiver';
  receiver.position.set(.4766,3.288,-3.0801);
  const barrel=new THREE.Mesh(blindTube(.0327,.004,.7592,.040,20),P.mats.dark);
  barrel.name='jpze100XCupolaBarrel';
  barrel.position.set(.4764,3.2934,-2.6612);
  receiver.castShadow=receiver.receiveShadow=true;
  barrel.castShadow=barrel.receiveShadow=true;
  P.disposables.push(receiver.geometry,barrel.geometry);
  station.add(receiver,barrel);
  FITTINGS.markExact(station,'pintleMG');
  station.name='jpze100XEnclosedCupolaWeapon';
  station.userData.supportAssembly='enclosed-cupola';
  station.userData.sourceGeometryBasis='measured receiver/jacket; inferred8mm blind muzzle recess';
  P.hullG.add(station);
}

function rearEquipment(P:TankBuilderPort):void {
  // The complete source's tall rear assemblies are DOOR HINGES, not exhaust
  // pipes. The first draft's false pair of open stacks is removed entirely.
  // Independent slabs form the sloped service door and its raised frame.
  const rearZ=(y:number)=>-4.292+(y-1.78)*.119;
  place(P,'hullDetail',box(1.24,1.080,.098),0,2.313,rearZ(2.313)+.050,.118);
  place(P,'hullDetail',box(1.10,.385,.093),0,1.566,-4.185,.515);
  for(const side of[-1,1]) {
    place(P,'hullDetail',box(.105,1.067,.115),side*.759,2.272,rearZ(2.272)+.08,.118);
    for(const y of[1.812,2.332,2.734]) {
      place(P,'hullDetail',box(.174,.068,.135),side*.634,y,rearZ(y)+.055,.118);
      place(P,'hullDetail',cylY(.046,.046,.093,16),side*.718,y,rearZ(y)+.067);
    }
    const x=side*.104;
    place(P,'hullDetail',beamBetween([x,2.19,rearZ(2.19)+.007],[x,2.19,rearZ(2.19)-.045],.011),0,0,0);
    place(P,'hullDetail',beamBetween([x,2.19,rearZ(2.19)-.045],[x,2.447,rearZ(2.447)-.045],.011),0,0,0);
    place(P,'hullDetail',beamBetween([x,2.447,rearZ(2.447)-.045],[x,2.447,rearZ(2.447)+.007],.011),0,0,0);
    for(const z of[-3.970,-3.780])place(P,'hullDetail',box(.52,.095,.07),side*.95,1.62,z);
    place(P,'hullDetail',box(.258,.212,.078),side*1.526,1.558,-4.252);
    place(P,'hullDark',torus(.080,.023,20,8),side*1.526,1.538,-4.315,Math.PI/2);
  }
  bowTowingEyes(P);
  // Measured octagonal rear-roof fastener. Its small concealed cantilever
  // seating is inferred: the reference fastener's underside is detached.
  place(P,'hullDetail',box(.060,.024,.092),-.005527,3.065,-4.025);
  const fastener=cylY(.039678,.039678,.092051,8);
  const positions=fastener.getAttribute('position');
  for(let i=0;i<positions.count;i++) {
    if(positions.getY(i)<0)positions.setY(i,-.032015-positions.getZ(i)*.335);
  }
  fastener.computeVertexNormals();
  place(P,'hullDetail',fastener,-.005527,3.103490,-4.065573);
  place(P,'hullDetail',box(1.082,.067,.0337),0,1.7869,-4.2994);
  for(const x of[-.657,.657])place(P,'hullDetail',box(.08,.24,.17),x,1.392,-4.093);
  for(const[x,z,length]of[[1.31,1.97,1.24],[-1.31,2.22,.76],[.28,2.18,1.16]]) {
    place(P,'hullDark',cylZ(.022,length,12),x,1.795,z);
    for(const end of[-1,1])place(P,'hullDetail',box(.092,.075,.037),x,1.791,z+end*length*.4);
  }
}

function bowTowingEyes(P:TankBuilderPort):void {
  for(const side of[-1,1]) {
    const section=(z:number,low:number,top:number):SolidSection=>{
      const ring:[number,number][]=[[.8813,low],[1.0013,low],[1.0013,top],[.8813,top]];
      return{z,ring:side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring};
    };
    // Two separate lower-glacis anchor ribs. Do not fill the air between
    // them or extend the full-width central nose to these fixture tips.
    P.add('hull',sectionSolid([
      section(3.83014,1.31,1.39825),section(4.1921,.9186,1.22137),
      section(4.27207,.9895,1.22137),
    ]));
    place(P,'hullDetail',cylX(.10679,.259176,12).rotateX(Math.PI/12),
      side*.941146,1.118025,4.270632);
    place(P,'hullDetail',cylX(.044726,.313355,16),side*.9277,1.120667,4.270626);
    place(P,'hullDetail',torus(.102,.022,28,10).rotateX(Math.PI/2).scale(1,1.3,1),
      side*.941,1.000,4.272);
  }
}

function cannon(P:TankBuilderPort):void {
  P.add('gunMount',jagdpanzerBell());
  const tubeRows=[[1.545,.203],[2.396,.191],[2.43,.165],[3,.1595],[4,.1497],
    [6.15,.1283],[6.32,.153],[6.41,.1948],[7.028,.1948],
    [7.028,.1354],[7.046872,.1354],[7.046872,.085],
    [5.705,.085],[5.705,0],[1.545,0]];
  P.add('gun',new THREE.LatheGeometry(tubeRows.map(([z,r])=>new THREE.Vector2(r,z-PITCH[2])),40).rotateX(Math.PI/2));
  for(let i=0;i<6;i++) {
    const a=i*Math.PI/3;
    place(P,'gunMount',cylZ(.035,.072,6),-.0007+Math.sin(a)*.351,
      2.337+Math.cos(a)*.34,.674);
  }
  // Small front hoop/rear lifting eye above the mantlet casting.
  place(P,'gunMount',beamBetween([-.02,2.737,.425],[-.02,2.883,.523],.019),0,0,0);
  place(P,'gunMount',beamBetween([-.02,2.883,.523],[-.02,2.738,.622],.019),0,0,0);
  P.muzzleZ=JPZE100_X_DATUMS.muzzleZ-PITCH[2];
}

export function buildJagdpanzerE100X(P:TankBuilderPort):void {
  P.hullG.position.set(0,0,0);
  P.turretG.position.set(...PITCH);
  P.gunG.position.set(0,0,0);
  hullTub(P);casemate(P);hatches(P);rearEquipment(P);cannon(P);
  P.gear=KIT.buildRunningGear(P,{
    style:'steel',wheelR:.450,wheelW:.28,wheelY:.51965,
    wheelZs:[...JPZE100_X_DATUMS.wheelZs],xc:1.546796,trackW:1.000952,
    layers:[[-.184,.060],[-.070]],wheelFaceDepthScale:.84,
    // A pin-span-wide smooth ribbon wrongly fills the chamfered shoulder
    // between real link webs. The full metre-wide moving shoes remain intact;
    // their continuous inner web follows the narrower source cross section.
    trackCarrierWidthM:.780,shoeWidthScale:1/.97,
    trackTh:.023,trackShoeDimensions:{webHeight:.019,padHeight:.018,grouserHeight:.014,hornHeight:.060,pinRadius:.010,pinCentreY:0},
    sprocket:{z:3.4341595,y:.778723,r:.4955,trackR:.475,toothTipRadiusM:.4955,axialScaleLeft:.566,axialScaleRight:.566},
    idler:{z:-3.250577,y:.624833,r:.3298,trackR:.312,axialScaleLeft:.81,axialScaleRight:.81},
    topY:1.299,botY:.0465,rollers:[],paintedEnds:true,arms:true,coveredTop:true,
  });
  P.topY=JPZE100_X_DATUMS.roofEquipmentTopM-PITCH[1];
  P.hullG.userData.xRebuild={candidate:'jpz_e100_x',independent:true,datumVersion:1,sourceLocalOnly:true,fixedCasemate:true};
}
export const JPZE100_X_PROFILES={jpz_e100_x:{build:buildJagdpanzerE100X}} as const;
