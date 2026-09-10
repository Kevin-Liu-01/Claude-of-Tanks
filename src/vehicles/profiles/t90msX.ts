// Independent T-90MS Tagil X source-scalar construction. No existing vehicle
// builder, source mesh, texture, vertex table, or source rig is used at runtime.
import * as THREE from 'three';
import {markVehicleNightLens} from '../vehicleNightLighting.ts';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {boxSections,castSections,roofSheet,beamBetween,blindTube} from './measuredPrimitives.ts';
import {markEraHitFaces,markEraFurniture} from './eraHitFaces.ts';
import {sourceMachineGun} from './sourceMachineGun.ts';
import {T90MS_X_SOURCE_DATUMS} from '../t90msXArmor.ts';
import {addT90MSGunBase} from './t90msXGunBase.ts';
import {addT90MSAntennaSeat} from './t90msXMast.ts';
import {addT90MSSideAssembly} from './t90msXSideAssembly.ts';
import {addT90MSOpticalHead} from './t90msXOpticalHead.ts';
import {addT90MSRearCradles,addT90MSRearCase,addT90MSRearFenderCourses} from './t90msXHullEnds.ts';
import {addT90MSHullCages} from './t90msXHullCages.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
export const T90MS_X_DATUMS=T90MS_X_SOURCE_DATUMS;
const YAW=T90MS_X_DATUMS.turretPivot,GUN=T90MS_X_DATUMS.trunnion;
const {box,cylX,cylZ,torus}=KIT;
const cylY=(r:number,h:number,n=28)=>KIT.cylY(r,r,h,n);
function top(P:TankBuilderPort,bucket:string,g:THREE.BufferGeometry,x:number,y:number,z:number):void{
  P.addEquipment(bucket,g,x-YAW[0],y-YAW[1],z-YAW[2]);
}
function hull(P:TankBuilderPort):void{
  P.add('hull',boxSections([
    [-3.18265,1.035,1.19,1.175],[-3.1,1.035,1.349,1.13245],[-2.9,1.035,1.4766,.74485],[-2.7,1.035,1.55057,.52653],
    [-2.5,1.035,1.54594,.48482],[-2.3,1.033,1.54131,.53893],[-2.1,1.032,1.47474,.59420],[-1.9,1.0426,1.50474,.59587],
    [-1.5,1.0657,1.50340,.56008],[-1.3,1.0655,1.48533,.5186],[-1.1,1.0654,1.4941,.57243],[-.9,1.0652,1.495,.57261],
    [.9,1.0608,1.496,.57087],[1.3,1.0567,1.496,.5728],[1.5,1.0546,1.459,.55867],[1.9,1.052,1.43104,.52231],
    [2.3,1.047,1.25740,.52246],[2.5,1.043,1.17075,.52432],[2.7,1.0317,1.0841,.54593],
    [2.9,1.0216,.99746,.62666],[3.1,1.0115,.91081,.76988],[3.18265,1.007,.875,.86],
  ]));
  P.add('hull',cylY(1.24025,.053,48),-.00095,1.519,.118);
  for(const side of [-1,1])fenders(P,side);
}
function fenders(P:TankBuilderPort,side:number):void{
  addT90MSRearFenderCourses(P,side);
  const l=Math.min(side*.956,side*1.792),r=Math.max(side*.956,side*1.792);
  const rows:readonly(readonly[number,number,number])[]=[[-1.00495,1.515,1.287],[0,1.505,1.287],[1,1.469,1.287],[2,1.409,1.286],
    [2.8,1.351,1.267],[3.10,1.307,1.237],[3.30,1.256,1.210],[3.50,1.135,1.101],[3.67675,.809,.777]];
  P.addMudguard('t90ms-x-source-fender','hull',sectionSolid(rows.map(([z,t,b])=>({z,ring:[[l,b],[r,b],[r,t-.007],[l,t]]}))));
  // The hanging curtain is a separate narrow sheet, not a filled side wall.
  for(const[z,d]of [[-.669,.67],[-.001,.655],[.662,.650],[1.328,.655],[1.999,.661],[2.659,.634]]){
    P.addMudguard('t90ms-x-lower-curtain','hullRubber',box(.021,.322,d-.005),side*1.766,.598,z);
    P.addEquipment('hullDetail',box(.02,.022,d-.012),side*1.766,.763,z);
  }
}
function runningGear(P:TankBuilderPort):void{
  // Source left axles are ~76 mm aft of right axles. Actual road stations use
  // the measured side arrays; the unchanged belt course uses pair midpoints.
  P.gear=KIT.buildRunningGear(P,{style:'rubber',wheelPattern:'pressed-six',wheelR:.3884,wheelY:.4485,wheelW:.4206,
    wheelZs:[-1.7806,-.9404,-.08855,.76255,1.6144,2.46025],
    wheelZsLeftM:[-1.81590002775,-.97714999318,-.12659997866,.72445000755,1.57635003328,2.42254996300],
    wheelZsRightM:[-1.74285000563,-.90240001678,-.05049999041,.80055001006,1.65250003338,2.49795007706],
    xc:1.437,trackW:.4876,trackTh:.014,
    idler:{z:3.14985,y:.87725,r:.26365,trackR:.250},sprocket:{z:-2.49745,y:.8275,r:.3627,trackR:.343},
    rollers:[{z:-1.5043,y:1.07865,r:.12335},{z:.1704,y:1.07865,r:.12335},{z:1.8357,y:1.07865,r:.12335}],rollerR:.12335,
    returnRollerWidthM:.0982,returnRollerInsetM:.103,topY:1.214,botY:.039,arms:true,coveredTop:true,paintedEnds:true,
    wheelFaceDepthScale:.87,sprocketDepthScale:.82,idlerDepthScale:.82,linkPitchM:.138,
    // Keep the recessed painted dish visible inside closed neutral tire stock.
    wheelTireInnerRadiusM:.33402,
    trackShoeDimensions:{padHeight:.029,grouserHeight:.010,webHeight:.014,hornHeight:.040,pinRadius:.009,pinCentreY:0},
  });
}
function glacis(P:TankBuilderPort):void{
  for(const side of [-1,1]){
    const l=side<0?-.8972:-.008,r=side<0?-.0104:.878;
    P.destructibleCluster(`glacis_era_${side<0?'L':'R'}`,()=>{
      P.addExternalArmor('hull',markEraHitFaces(roofSheet([[2.024,l,r,1.433,1.433],[2.711,l,r,1.10,1.10]],.024),[0,1,0]));
      P.addExternalArmor('hull',markEraHitFaces(roofSheet([[2.6893,l,r,1.20964,1.20964],[2.933,l,r,1.043,1.043],[3.1924,l,r,.85254,.85254]],.022),[0,1,0]));
      for(const x of [side*.158,side*.454,side*.750])for(const z of [2.14,2.35,2.57])
        P.addExternalArmor('hull',markEraFurniture(box(.265,.012,.024).rotateX(.451)),x,1.442-(z-2.024)*.485,z);
      for(const x of [side*.13,side*.72])P.addExternalArmor('hull',markEraFurniture(box(.068,.029,.090).rotateX(.53)),x,1.15,2.843);
    });
    P.addEquipment('hullDetail',markVehicleNightLens(cylZ(.066,.11,24),'headlight'),side*.774,1.108,2.858);
    for(const dx of [-.093,.093])P.addEquipment('hullDetail',beamBetween([side*.774+dx,1.015,2.874],[side*.774+dx,1.245,2.730],.008));
  }
  P.addEquipment('hullDetail',cylY(.294,.038,32).scale(1,1,.83),-.056,1.494,1.609);
}
function skirts(P:TankBuilderPort):void{
  for(const side of [-1,1])for(const[z,d]of [[-.67086,.6536],[-.00331,.6557],[.66249,.6498],[1.32764,.6547],[1.99864,.6613],[2.65939,.6344]]){
    const x=side<0?-1.78658:1.78406,t=z>2.5?1.36644:1.43438;
    P.addEquipment('hullDetail',box(.025,t-.763,d-.007),x-side*.035,(t+.763)/2,z);
    P.destructibleCluster(`skirt_era_${side<0?'L':'R'}`,()=>{
      P.addExternalArmor('hull',markEraHitFaces(box(.013,t-1.139,d-.003),[side,0,0]),x,(t+1.139)/2,z);
      P.addExternalArmor('hull',markEraHitFaces(box(.013,.3002,d-.003),[side,0,0]),x,.90963,z);
    });
  }
}
function engineDeck(P:TankBuilderPort):void{
  for(const x of [-.47,.47]){
    P.addEquipment('hullDetail',roofSheet([[-2.76,x-.439,x+.439,1.570,1.570],[-2.168,x-.439,x+.439,1.553,1.553]],.014));
    for(let i=0;i<16;i++)P.addEquipment('hullDark',box(.85,.007,.014),x,1.572-i*.001,-2.736+i*.036);
  }
  P.addEquipment('hullDetail',box(1.847,.029,.659),-.009,1.518,-1.67);
  for(const[x,z,w,d,y,p]of [[-1.36,-.41,.53,1.07,1.514,.02],
    [-1.36,.72,.53,1.09,1.478,.041],[-1.36,1.93,.53,.88,1.419,.063],[1.417,-.604,.291,.974,1.516,.022],
    [1.462,.87,.254,1.092,1.472,.041],[1.385,2.062,.335,.780,1.410,.066],[1.326,-1.6485,.507,1.037,1.517,.01]]){
    P.addEquipment('hullDetail',box(w,.027,d).rotateX(p),x,y,z);
    for(const dz of [-d*.40,d*.40])P.addEquipment('hullDetail',box(w*.86,.013,.024).rotateX(p),x,y+.020,z+dz);
  }
  for(const x of [-.18135,.5563])P.addEquipment('hullDetail',box(.696,.090,.1816).rotateX(.37),x,1.57665,-3.04885);
}
function rearAndHullCages(P:TankBuilderPort):void{
  P.addEquipment('hullDetail',cylX(.105,3.35,28),-.008,1.0115,-3.213);
  addT90MSRearCradles(P);addT90MSRearCase(P);addT90MSHullCages(P);
  for(const side of [-1,1]){
    P.addEquipment('hullDetail',torus(.06,.024,20,8).rotateX(Math.PI/2),side*.967,.94,-3.177);
  }
  const a:readonly(readonly[number,number,number])[]=[[-1.30,1.32,-3.31],[-1.15,.91,-3.34],[-.54,.775,-3.34],[.23,.90,-3.34],[.89,1.315,-3.31]];
  for(let i=0;i<a.length-1;i++)P.addEquipment('hullDark',beamBetween(a[i],a[i+1],.013,12));
}
function turret(P:TankBuilderPort):void{
  const rows:readonly(readonly[number,number,number,number,number])[]=[[-1.59091,.74,.72,2.116,1.62],[-1.5,.7639,.7422,2.11729,1.61939],
    [-1.3,.8273,.8056,2.11751,1.61939],[-1.1,.8902,.8684,2.12097,1.53271],[-.9,.9511,.9294,2.14912,1.49677],
    [-.7,1.012,.9903,2.18559,1.44340],[-.5,1.0748,1.0512,2.18559,1.44339],[-.3,1.1418,1.1205,2.18559,1.44339],
    [-.1,1.2064,1.1886,2.15836,1.44339],[.1,1.2683,1.2546,2.14057,1.44339],[.3,1.3304,1.3196,2.12343,1.44339],
    [.5,1.3933,1.3771,2.10602,1.44339],[.7,1.3911,1.3878,2.08846,1.44339],[.9,1.1819,1.1792,2.07014,1.44339],
    [1.1,.9728,.9706,2.02477,1.47389],[1.2999,.7636,.7630,1.97461,1.51717],[1.38859,.65,.65,1.951,1.54]];
  P.add('turret',sectionSolid(rows.map(([z,l,r,t,b])=>({z:z-YAW[2],ring:[[-l*.95-YAW[0],b-YAW[1]],[r*.95-YAW[0],b-YAW[1]],
    [r-YAW[0],b+.055-YAW[1]],[r-YAW[0],t-.11-YAW[1]],[r-.07-YAW[0],t-YAW[1]],[-l+.07-YAW[0],t-YAW[1]],
    [-l-YAW[0],t-.11-YAW[1]],[-l-YAW[0],b+.055-YAW[1]]]}))));
  P.add('turret',cylY(.9367,.075,48),-.00095-YAW[0],1.48089-YAW[1],.12009-YAW[2]);
}
function cheekModule(P:TankBuilderPort,x:number,y:number,z:number,width:number,yaw:number):void{
  const d=.4466,pitch=Math.acos(.90947);
  P.destructibleCluster(`turret_era_${x<0?'L':'R'}`,()=>{
    P.addExternalArmor('turret',markEraHitFaces(box(width,.047,d),[0,1,0]).rotateX(pitch).rotateY(yaw),x-YAW[0],y-YAW[1],z-YAW[2]);
    // Source lower leaf is a separately pitched 57 mm plate, not a thin
    // inset roof sheet parallel to the upper leaf. Its forward lip reaches
    // the real chevron edge; these scalar stations are independent of any
    // candidate render or camera registration.
    const bottom=markEraHitFaces(box(width,.05702,.47171),[0,-1,0])
      .rotateX(-.530109).translate(0,-.19970,.11223).rotateY(yaw);
    P.addExternalArmor('turret',bottom,x-YAW[0],y-YAW[1],z-YAW[2]);
    if(Math.abs(x)>1||Math.abs(x)<.6){
      // Separate9.9 mm folded closing lip at the lower leaf's leading edge.
      // Its ~60 mm height is normal to that leaf, not a horizontal roof strip.
      const lip=markEraFurniture(box(width+.0012,.0602,.010))
        .rotateX(-.539).translate(Math.sign(x)*.0005,-.07837,.31986).rotateY(yaw);
      P.addExternalArmor('turret',lip,x-YAW[0],y-YAW[1],z-YAW[2]);
    }
  });
  for(const dx of [-width*.49,width*.49]){
    const g=sectionSolid([{z:-.09,ring:[[dx-.004,-.316],[dx+.004,-.316],[dx+.004,.043],[dx-.004,.043]]},
      {z:.203,ring:[[dx-.004,-.149],[dx+.004,-.149],[dx+.004,-.09],[dx-.004,-.09]]}]).rotateY(yaw);
    top(P,'turretDetail',g,x,y,z);
  }
  top(P,'turretDetail',beamBetween([x*.82,1.66,z*.76],[x,y-.22,z-.08],.018),0,0,0);
}
function cheeks(P:TankBuilderPort):void{
  for(const[x,y,z,w,yaw]of [[-1.49283,1.94349,.63886,.2862,-.786],[-1.28556,1.94348,.84644,.28647,-.787],
    [-1.07792,1.94345,1.05429,.28640,-.787],[-.87014,1.94343,1.26224,.28612,-.786],[-.48004,1.94309,1.45986,.1772,0],
    [1.49613,1.94346,.63247,.28630,.786],[1.28843,1.94343,.84039,.28622,.787],[1.08038,1.94350,1.04857,.28622,.787],
    [.87270,1.94345,1.25640,.28620,.786],[.43556,1.94191,1.45030,.28621,0]])cheekModule(P,x,y,z,w,yaw);
  for(const[x,z]of [[-.29,.74],[-.09,.74],[.11,.74],[-.29,.41],[-.09,.41],[.11,.41],[-.29,.06],[-.09,.06],[.11,.06]]){
    const y=2.18-z*.073;
    P.destructibleCluster(`turret_era_${x<0?'L':'R'}`,()=>P.addExternalArmor('turret',markEraHitFaces(box(.19,.042,.308),[0,1,0]).rotateX(.073),x-YAW[0],y-YAW[1],z-YAW[2]));
  }
}
function sideArmor(P:TankBuilderPort):void{
  addT90MSSideAssembly(P);
}
function bustle(P:TankBuilderPort):void{
  top(P,'turretDetail',boxSections([[-2.4092,.61,2.100,1.66],[-2.28,.660,2.1163,1.6292],[-1.70,.66,2.1163,1.675],[-1.5899,.64,2.10,1.70]]),-.0127,0,0);
  top(P,'turretDetail',box(.5082,.0127,.751),-.00955,2.12014,-1.99081);
  top(P,'turretDetail',box(1.5049,.3445,.0957),.0088,1.91174,-2.49616);
  for(const x of [-.24575,.22745])top(P,'turretDetail',box(.0202,.3713,.2929),x,1.93,-2.55966);
  for(const y of [1.84159,1.89494,1.95339,2.00909,2.06449,2.12064])top(P,'turretDetail',box(1.721,.006,.0371),.003,y,-2.91216);
  for(const y of [1.85379,1.90969,1.96569,2.02154,2.07669,2.13284]){
    top(P,'turretDetail',beamBetween([-.86,y,-2.912],[-.998,y,-2.355],.003,8),0,0,0);
    top(P,'turretDetail',beamBetween([.852,y,-2.912],[1.0889,y,-1.7061],.003,8),0,0,0);
  }
  for(const x of [-.85,-.44,0,.44,.85])top(P,'turretDetail',box(.011,.306,.015),x,1.976,-2.906);
  for(const[x,z]of [[-.987,-2.390],[1.071,-1.79],[.970,-2.33]])top(P,'turretDetail',box(.009,.301,.011),x,1.981,z);
  for(const side of [-1,1])top(P,'turretDetail',beamBetween([side*.62,1.70,-2.30],[side*.83,1.83,-2.908],.011),0,0,0);
  top(P,'turretDetail',box(.2466,.2692,.5273),.73315,1.90299,-2.07526);
}
function roofEquipment(P:TankBuilderPort):void{
  P.addCupola('turret',cylY(.4162,.0854,32),-.6981-YAW[0],2.15749-YAW[1],-.28881-YAW[2]);
  top(P,'turretDetail',cylY(.369,.0962,32).scale(1,1,.966),-.69845,2.21759,-.27691);
  top(P,'turretDetail',cylY(.307,.034,8).scale(1,1,.973),-.6997,2.30309,-.29336);
  P.addCupola('turret',cylY(.365,.08,32).scale(1,1,.88),.6966-YAW[0],2.126-YAW[1],-.82061-YAW[2]);
  top(P,'turretDetail',cylY(.353,.027,32).scale(1,1,.88),.6966,2.172,-.82061);
  top(P,'turretDetail',box(.7227,.0376,.4903).rotateY(.20),.4937,2.20149,-.53816);
  top(P,'turretDetail',cylY(.22875,.0523,28),.6922,2.09254,.06639);
  addT90MSOpticalHead(P);
  for(const[x,y,z,w,h,d]of [[-.7893,2.21074,-1.02396,.2739,.1695,.3877],
    [-.5509,2.21269,-1.44001,.4871,.189,.2978],[.3728,2.39604,-1.14116,.1611,.1611,.1143],
    [.2836,2.60454,-1.08261,.2415,.0635,.2568],[.2756,2.81889,-1.07821,.0841,.3066,.1094]])top(P,'turretDetail',box(w,h,d),x,y,z);
  top(P,'turretDetail',cylY(.029,.4644,16),.27545,2.39039,-1.07821);
  top(P,'turretDetail',cylY(.01735,.4073,12),-.7956,2.72854,-2.38676);
  antenna(P);
}
function antenna(P:TankBuilderPort):void{
  addT90MSAntennaSeat(P);
  const rows=[[0,0],[.0129,0],[.0185,.0694],[.0115,.1385],[.012,.5989],[.0094,.6042],[.0093,.7922],
    [.0064,.7986],[.0086,.8041],[.0082,1.0165],[.0078,1.2289],[.0074,1.4414],[.007,1.6538],[.0066,1.8662],[.0062,2.0786],[.0058,2.291],[0,2.291]];
  top(P,'turretDetail',new THREE.LatheGeometry(rows.map(([r,h])=>new THREE.Vector2(r,h)),6).rotateY(Math.PI/6),.55525,2.45610,-1.42175);
}
function aps(P:TankBuilderPort):void{
  for(const side of [-1,1]){
    const x=side*.6735;
    top(P,'turretDetail',box(.4431,.4117,.030),x,2.07304,1.65329);
    top(P,'turretDetail',boxSections([[-.17,.1903,.095,-.1344],[-.10,.1903,.1344,-.1344],[.17,.174,.095,-.1344]]),x,2.09509,1.68259);
    top(P,'turretDark',box(.278,.198,.013),x,2.09509,1.855);
    top(P,'turretDetail',box(.33,.16,.30).rotateY(side*.785),side*.92,2.06129,1.30144);
    top(P,'turretDetail',beamBetween([side*.78,1.87,1.44],[x,1.984,1.65],.02),0,0,0);
  }
}
function remoteWeapon(P:TankBuilderPort):void{
  for(const[y,r,h]of [[2.19559,.2553,.1636],[2.28619,.2881,.0244],[2.30229,.308,.0098],[2.34454,.21715,.0747],[2.52154,.21715,.2803]])
    top(P,'turretDetail',cylY(r,h,32),-.5514,y,-1.12601);
  top(P,'turretDark',box(.1872,.206,.012),-.55185,2.53519,-.9786);
  for(const x of [-.740,-.353]){
    const wall=sectionSolid([[-1.725, {low:2.80,high:2.90}],[-1.55,{low:2.38,high:2.99469}],[-1.33,{low:2.55,high:2.985}]].map(([z,r])=>{
      const a=r as {low:number;high:number};return{z:z as number,ring:[[x-.014,a.low],[x+.014,a.low],[x+.014,a.high],[x-.014,a.high]] as Array<readonly[number,number]>};
    }));top(P,'turretDetail',wall,0,0,0);
  }
  top(P,'turretDetail',roofSheet([[-1.70,-.754,-.339,2.904,2.904],[-1.55,-.754,-.339,2.99469,2.99469],[-1.33,-.754,-.339,2.985,2.985]],.017),0,0,0);
  top(P,'turretDetail',box(.1592,.1963,.1075),-.55225,2.61824,-1.42976);
  top(P,'turretDetail',box(.2251,.1328,.1015),-.5857,2.44879,-1.43366);
  top(P,'turretDetail',box(.1201,.3027,.1162),-.708,2.81694,-1.37851);
  const mg=sourceMachineGun(P,YAW);
  mg.add('turretDark',box(.1045,.1622,.2656),-.5796,2.86869,-1.52451);
  mg.add('turretDetail',box(.125,.0826,.7422),-.58005,2.88699,-1.44731);
  mg.add('turretDark',cylZ(.02055,.5591,24),-.582,2.91609,-.99496);
  mg.add('turretDetail',box(.0393,.07,.3701),-.494,2.90,-1.51816);mg.finish();
}
function smoke(P:TankBuilderPort):void{
  const stocks:readonly(readonly[number,number,number,number,number,number])[]=[
    [1.372366,2.116363,-.3205,.434555,.230144,.870744],[1.251166,2.11809,-.273902,.274869,.212441,.937718],
    [1.360106,2.035186,-.147401,.203959,.213070,.955511],[1.181948,2.190428,-.387363,.434617,.333542,.836575],
    [1.285071,2.185995,-.44613,.509548,.329313,.794930],[1.385858,2.174387,-.520327,.649890,.313322,.692440],
    [-1.151412,2.130457,-.486438,-.337005,.269541,.902095],[-1.181796,2.056908,-.34493,-.288904,.264787,.920012],
    [-1.291329,2.058032,-.377959,-.375176,.268097,.887337],[-1.399681,2.05905,-.417944,-.451522,.264030,.852301],
    [-1.270919,1.956827,-.294797,-.369531,.285934,.884132],[-1.379696,1.953166,-.343418,-.535409,.273388,.799122],
  ];
  for(const[x,y,z,dx,dy,dz]of stocks){
    const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(dx,dy,dz).normalize());
    top(P,'turretDark',blindTube(.0453,.032,.1947,.12,24).applyQuaternion(q),x,y,z);
    top(P,'turretDetail',beamBetween([x*.94,y-.10,z-.09],[x-dx*.075,y-dy*.075,z-dz*.075],.011),0,0,0);
  }
}
function mainGun(P:TankBuilderPort):void{
  const tip=T90MS_X_DATUMS.muzzleZ,floor=T90MS_X_DATUMS.boreFloorZ;
  KIT.buildGun(P,{len:floor-GUN[2],r:.078,baseR:.125,sleeve:false,collar:false});
  P.add('gunMount',castSections([[1.21923,.24,.24,1.987,1.579,1.81431],[1.370072,.278,.278,2.00441,1.55981,1.81431],
    [1.50,.20,.20,1.979,1.615,1.81431],[1.64223,.128,.128,1.94231,1.68631,1.81431]],GUN));
  addT90MSGunBase(P);
  const p=[[0,1.64246],[.1267,1.64246],[.10921,2.20456],[.10034,3.91206],[.11787,3.91206],[.120615,4.84766],
    [.09160,4.84766],[.093205,6.05276],[.086625,6.05276],[.086745,6.18166],[.093375,6.19726],[.093505,tip],[.0625,tip],[.0625,floor],[0,floor]];
  P.add('gun',new THREE.LatheGeometry(p.map(([r,z])=>new THREE.Vector2(r,z)),32).rotateX(Math.PI/2),0,0,-GUN[2]);
  // Actual muzzle-reference fixture, correctly recoil-owned, with the measured
  // small open optical stock. It is not an enlarged full muzzle collar.
  P.add('gun',box(.0484,.0222,.038),.0006,.12670,6.11916-GUN[2]);
  P.add('gun',blindTube(.01765,.0119,.020,.014,24),.00075,.11115,6.12866-GUN[2]);
  P.add('gun',box(.065,.041,.030),0,.103,6.079-GUN[2]);
  P.muzzleZ=tip-GUN[2];
}
export function buildT90MSX(P:TankBuilderPort):void{
  P.hullG.position.set(0,0,0);P.turretG.position.set(...YAW);P.gunG.position.set(GUN[0]-YAW[0],GUN[1]-YAW[1],GUN[2]-YAW[2]);
  P.topY=T90MS_X_DATUMS.highestFittingM-YAW[1];
  hull(P);runningGear(P);glacis(P);skirts(P);engineDeck(P);rearAndHullCages(P);turret(P);cheeks(P);sideArmor(P);bustle(P);roofEquipment(P);aps(P);remoteWeapon(P);smoke(P);mainGun(P);
}
export const T90MS_X_PROFILES={t90ms_x:{build:buildT90MSX}} as const;
