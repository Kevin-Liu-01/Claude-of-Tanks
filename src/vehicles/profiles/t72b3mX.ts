// Independent first-party T-72B3M (2022) construction from scalar source
// measurements. No source topology, source loading, or donor builder calls.
import * as THREE from 'three';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {boxSections,castSections,roofSheet,beamBetween,blindTube,type Point3} from './measuredPrimitives.ts';
import {markEraHitFaces,markEraFurniture} from './eraHitFaces.ts';
import {sourceMachineGun} from './sourceMachineGun.ts';
import {T72B3M_X_SOURCE_DATUMS} from '../t72b3mXArmor.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
import {addT72B3MSideMounts} from './t72b3mXSideMounts.ts';

export const T72B3M_X_DATUMS=T72B3M_X_SOURCE_DATUMS;
const YAW=T72B3M_X_DATUMS.turretPivot,GUN=T72B3M_X_DATUMS.trunnion;
const {box,cylX,cylZ,torus}=KIT;
const cylY=(r:number,h:number,n=28)=>KIT.cylY(r,r,h,n);
function topPart(P:TankBuilderPort,bucket:string,g:THREE.BufferGeometry,x:number,y:number,z:number,rx=0,ry=0,rz=0):void {
  P.addEquipment(bucket,g,x-YAW[0],y-YAW[1],z-YAW[2],rx,ry,rz);
}

function hull(P:TankBuilderPort):void {
  // The narrow main tub is separate from the wide over-track decks. Closed
  // carrier beneath the measured forward removable covers is inferred.
  P.add('hull',boxSections([
    [-3.342,1.18,1.28,1.26],[-3.20,1.165,1.415,1.084],[-3.0,1.149,1.52948,.74346],
    [-2.80,1.145,1.52948,.5219],[-2.60,1.145,1.52948,.45261],[-2.20,1.145,1.52948,.531015],
    [1.90,1.145,1.50926,.531015],[2.00,1.145,1.454,.531015],[2.40,1.145,1.315,.531015],
    [2.60,1.145,1.236,.5331],[2.80,1.145,1.157,.5818],[3.0,1.145,1.079,.70358],
    [3.20,1.145,1.001,.82261],[3.342,1.145,.967,.955],
  ]));
  P.add('hull',cylY(1.318788,.026,48),YAW[0],1.512,YAW[2]);
  for(const side of [-1,1])fenders(P,side);
  addT72B3MSideMounts(P);
}

function fenders(P:TankBuilderPort,side:number):void {
  const a=Math.min(side*1.128,side*1.764),b=Math.max(side*1.128,side*1.764);
  P.addMudguard('t72b3m-x-deck','hull',roofSheet([
    [-3.47,a,b,1.20,1.20],[-3.15,a,b,1.3324,1.3324],[-2.80,a,b,1.526,1.526],
    [1.65,a,b,1.509,1.509],[2.7,a,b,1.446,1.446],[3.08,a,b,1.42328,1.42328],
  ],.019));
  const ringRows:readonly(readonly[number,number,number,number])[]=[
    [3.06,1.02,1.897,1.42328],[3.23,1.006,1.933,1.42328],[3.43,1.026,1.955,1.399],
    [3.59,1.08,1.951,1.302],[3.73,1.13,1.91,1.155],[3.835,1.19,1.78,.915],
  ];
  P.addMudguard('t72b3m-x-rounded-front','hull',roofSheet(ringRows.map(([z,inner,outer,y])=>{
    const l=Math.min(side*inner,side*outer),r=Math.max(side*inner,side*outer);return[z,l,r,y,y] as const;
  }),.015));
  P.addMudguard('t72b3m-x-rear-leaf','hullRubber',roofSheet([
    [-3.475,Math.min(side*1.145,side*1.935),Math.max(side*1.145,side*1.935),1.043,1.043],
    [-3.155,a,b,1.3207,1.3207],
  ],.014));
}

function runningGear(P:TankBuilderPort):void {
  // Source axle staggering is averaged across sides (maximum11.2mm). All six
  // wheels, end drums and return rollers remain the native animated assembly.
  P.gear=KIT.buildRunningGear(P,{style:'rubber',wheelPattern:'pressed-six',wheelR:.391766,wheelY:.4728865,wheelW:.45254,
    wheelZs:[-1.822412,-.953673,-.089323,.858392,1.722743,2.591482],xc:1.4713,trackW:.554,trackTh:.018,
    sprocket:{z:-2.5973,y:.79690,r:.36720,trackR:.327},idler:{z:3.2184,y:.87328,r:.2823,trackR:.270},
    rollers:[{z:-1.78,y:1.16,r:.12},{z:.05,y:1.16,r:.12},{z:1.85,y:1.16,r:.12}],rollerR:.12,
    returnRollerWidthM:.30,returnRollerInsetM:.16,topY:1.325,botY:.055,arms:true,coveredTop:true,paintedEnds:true,
    wheelFaceDepthScale:.83,wheelTireInnerRadiusM:.33692,sprocketDepthScale:.86,idlerDepthScale:.86,linkPitchM:.14,
    trackShoeDimensions:{padHeight:.029,grouserHeight:.011,webHeight:.015,hornHeight:.045,pinRadius:.010,pinCentreY:0},
  });
}

function hullCassettes(P:TankBuilderPort):void {
  for(const side of [-1,1]){
    const left=side<0?-1.103:.014,right=side<0?-.014:1.103;
    P.destructibleCluster(`glacis_era_${side<0?'L':'R'}`,()=>{
      const cover=roofSheet([[2.00,left,right,1.4934,1.4934],[2.61,left,right,1.2725,1.2725],[3.25,left,right,1.0232,1.0232]],.040);
      P.addExternalArmor('hull',markEraHitFaces(cover,[0,1,0]));
      for(const z of [2.14,2.45,2.78,3.07])for(const x of [side*.30,side*.73]){
        const y=1.4934-(z-2)*.382;
        P.addExternalArmor('hull',markEraFurniture(box(.294,.012,.023)),x,y+.008,z,.365);
      }
    });
    const lane=side<0?-1.962:1.958;
    for(const [a,b,top,low]of [[-3.153,-2.559,1.53164,.79919],[-2.217,-1.73,1.53257,.79949],
      [-1.389,-.795,1.53164,.79919],[-.785,-.19,1.53164,.79919],[-.18,.415,1.53164,.79919],
      [.423,1.018,1.53164,.79919],[1.029,1.624,1.53164,.79919],[1.637,2.232,1.52077,.79884],
      [2.242,3.182,1.47615,.7984]]){
      P.addEquipment('hullDetail',box(.009,top-low,b-a),lane-side*.014,(low+top)/2,(a+b)/2);
      P.destructibleCluster(`skirt_era_${side<0?'L':'R'}`,()=>{
        for(const [y,h]of [[(top+1.24)/2,(top-1.24)],[(low+1.203)/2,1.203-low]])P.addExternalArmor('hull',
          markEraHitFaces(box(.018,h,b-a),[side,0,0]),lane,y,(a+b)/2);
      });
      if(a> -1.4&&b<2.24)P.addMudguard('t72b3m-x-lower-curtain','hullRubber',box(.003,.277,b-a-.006),lane-side*.009,.6591,(a+b)/2);
    }
    P.addMudguard('t72b3m-x-front-curtain','hullRubber',box(.004,.17,.935),lane-side*.009,.7146,2.712);
    P.addMudguard('t72b3m-x-rear-curtain','hullRubber',box(.004,.14,.825),lane-side*.009,.730,-2.143);
  }
}

function deckEquipment(P:TankBuilderPort):void {
  P.addEquipment('hullDetail',boxSections([[-2.19,1.058,1.578,1.535],[-2.03,1.058,1.62359,1.535],
    [-1.69,1.058,1.62359,1.535],[-1.482,1.058,1.577,1.535]]));
  for(const x of [-.527,.523]){
    P.addEquipment('hullDetail',box(1.029,.024,.746),x,1.539,-2.609);
    for(let i=0;i<19;i++)P.addEquipment('hullDark',box(.98,.010,.012),x,1.555,-2.945+i*.037);
  }
  for(const [x,z,w,d,y]of [[-1.46,-2.57,.59,1.10,1.554],[-1.46,-1.47,.59,1.04,1.55],
    [-1.46,-.27,.59,1.29,1.55],[-1.46,1.04,.59,1.28,1.547],[-1.46,2.18,.59,.87,1.47],
    [1.44,-2.70,.58,.82,1.511],[1.42,-1.80,.51,.79,1.582],[1.45,-.45,.59,1.60,1.505],
    [1.43,1.04,.59,1.25,1.503],[1.43,2.20,.59,.89,1.468]]){
    P.addEquipment('hullDetail',box(w,.024,d),x,y,z);
    for(const dz of [-d*.38,d*.38])P.addEquipment('hullDetail',box(w*.84,.020,.037),x,y+.022,z+dz);
  }
  P.addEquipment('hullDark',box(.17,.12,.586),1.759,1.431,-1.797);
  for(const z of [-2.043,-1.917,-1.79,-1.665,-1.54])P.addEquipment('hullDetail',box(.025,.138,.018),1.828,1.43,z);
  P.addEquipment('hullDetail',cylY(.374,.043,32),-.079,1.540,1.720);
  P.addEquipment('hullDark',box(.39,.027,.085),.002,1.491,2.03);
  for(const x of [-.863,.868]){
    P.addEquipment('hullDetail',markVehicleNightLens(cylZ(.076,.105,24),'headlight'),x,1.318,2.999);
    for(const dx of [-.118,.118])P.addEquipment('hullDetail',beamBetween([x+dx,1.12,3.007],[x+dx,1.38,2.85],.009));
  }
  for(const x of [-.193,.596])for(let i=0;i<8;i++)P.addEquipment('hullDetail',box(.061,.012,.24),x-.315+i*.089,1.542,-3.214,.244);
}

function rearEquipment(P:TankBuilderPort):void {
  // This source carries no external drums. The rear screen is six thin
  // upright leaves and six separate sloping lower leaves, not a filled box.
  for(const x of [-.946,-.563,-.182,.194,.571,.946]){
    P.addEquipment('hullDetail',box(.3667,.534,.013),x,1.5015,-3.665);
    P.addEquipment('hullDetail',roofSheet([[-3.674,x-.1833,x+.1833,1.23,1.23],[-3.455,x-.1833,x+.1833,.93,.93]],.011));
    P.addEquipment('hullDetail',beamBetween([x,1.34,-3.31],[x,1.365,-3.665],.011));
  }
  P.addEquipment('hullDetail',cylX(.115,2.68,28),-.001,1.012,-3.29);
  for(const x of [-.786,.78])P.addEquipment('hullDetail',torus(.07,.023,20,8),x,.85,-3.215);
  for(const x of [-1.58,1.576])P.addEquipment('hullDetail',torus(.06,.018,20,8),x,1.38,-3.28);
  for(const x of [-.60,.45]){
    P.addEquipment('hullDetail',beamBetween([x,1.29,-3.20],[x,1.25,-3.45],.015));
    P.addEquipment('hullDark',box(.26,.077,.058),x,1.11,-3.29);
  }
}

function turret(P:TankBuilderPort):void {
  P.add('turret',castSections([
    [-1.359,.02,.02,2.052,1.72,1.95],[-1.20,.509,.509,2.157,1.598,1.91],[-1.0,.751,.750,2.169,1.5153,1.87],
    [-.8,.923,.922,2.2183,1.5153,1.855],[-.6,1.055,1.055,2.3158,1.5153,1.81],
    [-.4,1.161,1.161,2.35091,1.5153,1.795],[-.2,1.241,1.241,2.34392,1.5153,1.75],
    [0,1.312,1.312,2.30523,1.5153,1.70],[.2,1.380,1.380,2.27150,1.5153,1.675],
    [.4,1.407,1.407,2.22701,1.5153,1.67],[.6,1.387,1.387,2.17510,1.5153,1.66],
    [.8,1.331,1.331,2.13105,1.5153,1.65],[1.0,1.232,1.232,2.09366,1.5153,1.63],
    [1.2,1.078,1.078,2.00802,1.5153,1.625],[1.40,.777,.777,1.81957,1.56725,1.65],
    [1.44,.27,.27,1.58,1.565,1.57],
  ],YAW));
}

type Cheek=readonly[x:number,y:number,z:number,nx:number,ny:number,nz:number,width:number,length:number];
function cheekCassettes(P:TankBuilderPort):void {
  const cells:readonly Cheek[]=[
    [-.59824,1.93354,1.54708,-.14365,.857658,.493748,.2792,.4429],
    [-.93060,1.93236,1.43514,-.26352,.857646,.441591,.2792,.4429],
    [-1.18987,1.92786,1.20822,-.37128,.857646,.355799,.2792,.4429],
    [-1.38191,1.92828,.89236,-.46012,.863912,.204817,.2792,.4429],
    [-1.48508,1.91604,.57381,-.44491,.881787,.156542,.2792,.4429],
    [1.46609,1.90861,.69865,.516294,.834480,.192572,.2792,.4429],
    [1.32502,1.92166,1.00438,.445996,.850585,.278554,.2792,.4429],
    [1.12681,1.92595,1.28812,.395370,.842089,.366836,.2792,.4429],
    [.86297,1.93439,1.49783,.250223,.854002,.456146,.239,.381],
  ];
  for(const cell of cells){
    const [x,y,z,nx,ny,nz,w,d]=cell,normal=new THREE.Vector3(nx,ny,nz).normalize();
    const yaw=Math.atan2(nx,nz),pitch=Math.acos(normal.y);
    const g=markEraHitFaces(box(w,.167,d),[0,1,0]).rotateX(pitch).rotateY(yaw);
    const center=new THREE.Vector3(x,y,z).addScaledVector(normal,-.0835);
    P.destructibleCluster(`turret_era_${x<0?'L':'R'}`,()=>P.addExternalArmor('turret',g,center.x-YAW[0],center.y-YAW[1],center.z-YAW[2]));
    topPart(P,'turretDetail',beamBetween([x*.78,1.66,z*.78],[center.x,center.y-.067,center.z],.017),0,0,0);
  }
}

function roofCassettes(P:TankBuilderPort):void {
  const rows:readonly(readonly[number,number,number,number])[]=[
    [.060,2.24643,.50514,.237],[-.109,2.24547,.51440,.223],[-.283,2.25653,.45412,.204],[-.447,2.23603,.43136,.222],
    [-.0144,2.32703,.14825,.187],[.1612,2.32672,.14660,.18],[.3332,2.31125,.14681,.158],
    [.0556,2.38167,-.21620,.0633],[1.1048,2.09015,-.28986,.248],[.9348,2.08502,-.65464,.236],
    [.4453,2.20637,-.84583,.20],[.5628,2.08528,-1.11832,.242],[.1692,2.19851,-1.13119,.18],
    [-.1709,2.19687,-1.141,.20],[-.0021,2.20007,-1.1772,.22],[-.4463,2.18766,-.9794,.18],
    [.233,2.24838,.50256,.25],[.1668,2.12258,1.28232,.2427],[.0037,2.12258,1.28242,.2427],
    [-.1598,2.12258,1.28252,.2427],[.3636,2.05937,1.28220,.2427],
    [.7258,2.01819,1.13151,.116],[.8941,2.01945,.93361,.067],[1.0670,2.01914,.74095,.11],
    [.2628,2.16392,.89945,.203],[.0972,2.16392,.89955,.203],[-.0674,2.16392,.89965,.203],
    [-.2310,2.16151,.89975,.251],[-.4008,2.09134,1.04824,.25],[-.6545,2.0292,1.05593,.22],
    [-.816,2.0297,.93681,.22],[-.9565,2.0297,.73672,.22],[-1.106,2.04458,.52564,.22],
  ];
  for(const [x,y,z,pitch]of rows){
    P.destructibleCluster(`turret_era_${x<0?'L':'R'}`,()=>P.addExternalArmor('turret',
      markEraHitFaces(box(.160,.058,.362),[0,1,0]).rotateX(pitch),x-YAW[0],y-YAW[1],z-YAW[2]));
  }
}

function bustle(P:TankBuilderPort):void {
  const cases:readonly(readonly[number,number,number,number])[]=[
    [-1.57548,.18880,-1.96081,1.93334],[-1.47929,-.12408,-1.96081,1.93334],[-1.34719,-.43498,-1.96081,1.93334],
    [-1.21581,-.72725,-1.96081,1.93334],[-1.06794,-1.01019,-1.96081,1.93334],
    [-.75405,-1.35976,-2.35861,1.96952],[-.42147,-1.56789,-2.79812,1.96952],[-.05395,-1.63409,-3.12707,1.96952],
    [.31475,-1.58214,2.84249,1.96952],[.64009,-1.43069,2.55228,1.96952],
    [.92650,-1.13733,1.96203,1.93334],[1.14576,-.88737,1.96203,1.93334],
    [1.26361,-.60051,1.96203,1.93334],[1.38204,-.31420,1.96203,1.93334],
  ];
  for(const [x,z,yaw,y]of cases){
    const g=boxSections([[-.193,.15478,.29573,-.263],[-.176,.15478,.290,-.29573],
      [.180,.15478,.166,-.265],[.193,.15478,.146,-.262]]).rotateY(yaw);
    topPart(P,'turretDetail',g,x,y,z);
    topPart(P,'turretDetail',box(.026,.48,.397).rotateY(yaw),x,y-.025,z);
    topPart(P,'turretDetail',beamBetween([x*.76,1.75,z*.76],[x,y-.22,z],.017),0,0,0);
  }
}

function roofEquipment(P:TankBuilderPort):void {
  P.addCupola('turret',cylY(.44144,.12,36),-.62689-YAW[0],2.277-YAW[1],-.24424-YAW[2]);
  topPart(P,'turretDetail',cylY(.418,.04214,36),-.62689,2.30722,-.24424);
  P.addCupola('turret',cylY(.329,.10,28),.5278-YAW[0],2.207-YAW[1],-.41232-YAW[2]);
  topPart(P,'turretDetail',cylY(.304,.038,28).scale(1,1,.736),.5278,2.329,-.41232);
  topPart(P,'turretDetail',box(.295,.061,.18),.5713,2.354,-.1795);
  // Independent tapered sight hood: flat top with a narrow rear, splayed
  // forward cheeks and separate front glass, rather than a rectangular box.
  // Source Object_14 island13685 is this sight, not the surrounding roof gear.
  P.addModuleVisual('optics','turretDetail',boxSections([[-.098,.097,2.522,2.190],[.112,.176,2.522,2.190],[.258,.207,2.48,2.190]]).translate(.7854,0,0),-YAW[0],-YAW[1],-YAW[2]);
  P.addModuleVisual('optics','turretDark',box(.228,.125,.008),.7854-YAW[0],2.389-YAW[1],.261-YAW[2]);
  topPart(P,'turretDetail',box(.26,.024,.22),.750,2.096,.400);
  topPart(P,'turretDetail',box(.32,.152,.286),-.001,2.239,-.689);
  for(const z of [-.785,-.610])topPart(P,'turretDetail',box(.238,.012,.069),.134,2.332,z);
  for(const [x,z,top]of [[.225,-.791,2.904],[.077,-.534,2.627]]){
    topPart(P,'turretDetail',cylY(.025,top-2.327,16),x,(top+2.327)/2,z);
    topPart(P,'turretDark',cylY(.037,.075,16),x,2.382,z);
  }
}

function smoke(P:TankBuilderPort):void {
  // Six actual right-side stocks in a3+2+1 bank, recessed closed mouths.
  for(const [x,y,z]of [[1.16,2.163,.085],[1.37,2.129,.145],[1.58,2.067,.199],
    [1.35,1.994,.242],[1.56,1.932,.296],[1.56,1.82,.36]]){
    const axis=new THREE.Vector3(.31,.38,.872).normalize(),g=blindTube(.041,.033,.218,.124,20);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),axis));
    topPart(P,'turretDark',g,x,y,z);
    topPart(P,'turretDetail',box(.29,.036,.095),x-.07,y-.07,z-.102);
  }
}

function machineGun(P:TankBuilderPort):void {
  topPart(P,'turretDetail',cylY(.395,.20,32),-.632,2.43,-.24);
  const yaw=-.25575;
  topPart(P,'turretDetail',box(.403,.296,.154).rotateY(yaw),-1.17,2.685,.013);
  topPart(P,'turretDetail',box(.413,.041,.164).rotateY(yaw),-1.17,2.837,.013);
  for(const x of [-.903,-.787])topPart(P,'turretDetail',beamBetween([x,2.54,.18],[x,2.895,.11],.021),0,0,0);
  const mg=sourceMachineGun(P,YAW),axis=new THREE.Vector3(-.21215,.54465,.81139).normalize();
  const pivot=new THREE.Vector3(-.75156,2.85947,.10957),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),axis);
  mg.add('turretDark',box(.080,.134,.64).applyQuaternion(q),...pivot.toArray());
  const tip=new THREE.Vector3(-1.0939276,3.7383842,1.4189293),base=new THREE.Vector3(-.8321749,3.0664378,.4178961);
  mg.add('turretDark',beamBetween(base.toArray(),tip.toArray(),.0198,20),0,0,0);
  mg.add('turretDetail',beamBetween(base.toArray(),base.clone().addScaledVector(axis,.39).toArray(),.030,20),0,0,0);
  mg.add('turretDark',beamBetween(tip.clone().addScaledVector(axis,-.030).toArray(),tip.toArray(),.027,20),0,0,0);
  const group=mg.finish();
  // The fitting's +Z truthfully follows its elevated firing axis while its
  // original world-space receiver and barrel remain fixed at the source pose.
  for(const child of group.children)if(child instanceof THREE.Mesh)child.geometry.applyQuaternion(q.clone().invert());
  group.quaternion.copy(q);
}

function mainGun(P:TankBuilderPort):void {
  const muzzle=T72B3M_X_DATUMS.muzzleZ,floor=T72B3M_X_DATUMS.boreFloorZ;
  KIT.buildGun(P,{len:floor-GUN[2],r:.085,baseR:.13,sleeve:false,collar:false});
  P.add('gunMount',cylX(.238,.61,32),0,0,0);
  P.add('gunMount',castSections([[.939,.27,.27,2.118,1.565,1.85],
    [1.334,.337,.337,2.108,1.566,1.86],[1.50,.300,.300,2.081,1.61,1.85],
    [1.791,.1606,.1606,1.98264,1.66135,1.82199]],GUN));
  for(const [a,b,ra,rb]of [[1.791,2.302,.12879,.11855],[2.3013,3.1700,.12129,.12129],
    [3.170,3.987,.11571,.11140],[3.987,4.0365,.1222,.12607],[4.0365,4.962,.12607,.12607],
    [4.962,5.0073,.12258,.09258],[5.0067,5.84385,.102544,.102544]]){
    P.add('gun',KIT.cylY(rb,ra,b-a,32).rotateX(Math.PI/2),0,0,(a+b)/2-GUN[2]);
  }
  // Scalar axial profile, with no filled core across the measured recess.
  const tubeProfile:readonly(readonly[number,number])[]=[[0,5.84385],[.098435,5.84385],
    [.098435,6.294786],[.09313,6.300016],[.09313,6.448276],[.103942,6.452386],
    [.103942,6.581836],[.09945,muzzle],[.0625,muzzle],[.0625,floor],[0,floor]];
  P.add('gun',new THREE.LatheGeometry(tubeProfile.map(([r,z])=>new THREE.Vector2(r,z)),32).rotateX(Math.PI/2),0,0,-GUN[2]);
  for(const z of [2.325,3.142,3.963])P.add('gun',torus(.126,.009,32,6).rotateX(Math.PI/2),0,0,z-GUN[2]);
  P.muzzleZ=muzzle-GUN[2];
}

export function buildT72B3MX(P:TankBuilderPort):void {
  P.hullG.position.set(0,0,0);P.turretG.position.set(...YAW);
  P.gunG.position.set(GUN[0]-YAW[0],GUN[1]-YAW[1],GUN[2]-YAW[2]);
  P.topY=T72B3M_X_DATUMS.highestFittingM-YAW[1];
  hull(P);runningGear(P);hullCassettes(P);deckEquipment(P);rearEquipment(P);turret(P);
  cheekCassettes(P);roofCassettes(P);bustle(P);roofEquipment(P);smoke(P);machineGun(P);mainGun(P);
}
export const T72B3M_X_PROFILES={t72b3m_x:{build:buildT72B3MX}} as const;
