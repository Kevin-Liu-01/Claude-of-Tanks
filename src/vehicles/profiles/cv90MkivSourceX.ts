import { weaponAssembly } from './weaponStock.ts';
// Independent owner-source CV90 Mk.IV; existing cv90_mkiv stays untouched.
import * as THREE from 'three';
import { preserveSourceStudyGunMountAppearance } from './sourceStudyGunMount.ts';
import { KIT } from './kit.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { armorLoft, turretEquipment, openTube, optic, antenna, deckGrille, sideWall, chassisLoft } from './europeSourcePrimitives.ts';
const {box,cylY,cylZ,cylX}=KIT;

/** The asymmetric six-tube cheek arrays use source-measured mouth centers. */
function smokeMouth(P: TankBuilderPort, x: number, y: number, z: number): void {
  const angle=-.77,dy=Math.sin(.77),dz=Math.cos(.77),n=P.q?16:8;
  const shell=new THREE.CylinderGeometry(.043,.043,.19,n,1,true).rotateX(Math.PI/2);
  turretEquipment(P,'turretDetail',shell,x,y-dy*.095,z-dz*.095,angle);
  const wall=new THREE.CylinderGeometry(.031,.031,.060,n,1,true).rotateX(Math.PI/2);
  const index=wall.index!;
  for(let i=0;i<index.count;i+=3){const a=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,a);}
  wall.computeVertexNormals();
  turretEquipment(P,'turretDark',wall,x,y-dy*.030,z-dz*.030,angle);
  turretEquipment(P,'turretDetail',new THREE.RingGeometry(.031,.047,n),x,y,z,angle);
  turretEquipment(P,'turretDark',new THREE.CircleGeometry(.031,n),x,y-dy*.060,z-dz*.060,angle);
}

function towerStrut(P: TankBuilderPort, a: readonly number[], b: readonly number[], width: number, depth: number): void {
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),direction=end.clone().sub(start);
  const geometry=box(width,direction.length(),depth).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));
  const mid=start.add(end).multiplyScalar(.5);
  turretEquipment(P,'turretDetail',geometry,mid.x,mid.y,mid.z);
}

function addCv90FendersAndLamps(P: TankBuilderPort, side: number): void {
    const guardX=side<0?-1.2412:1.1700;
    P.addMudguard('cv90-mkiv-front-'+side,'hullRubber',box(.703,.341,.024),guardX,.887,3.270,-.80);
    P.addMudguard('cv90-mkiv-rear-'+side,'hullRubber',box(.50,.30,.07),side*1.25,.79,-3.09,.13);
    // Broad source corner receivers carry the low forward lamps and their cap.
    const lampX=side<0?-1.337:1.204,lampW=side<0?.49:.626;
    P.addEquipment('hullDetail',box(lampW,.116,.27),lampX,1.059,3.065);
    P.addEquipment('hullDetail',box(lampW,.031,.307),lampX,1.157,3.084,.09);
    P.addEquipment('hullDetail',box(lampW,.035,.041),lampX,1.132,3.21,.09);
    const mainLightX=side<0?-1.406:1.336;
    P.addEquipment('hullDark',cylZ(.045,.024,P.q?18:10),mainLightX,1.064,3.193);
    P.addEquipment('hullGlass',cylZ(.035,.012,P.q?18:10),mainLightX,1.064,3.208);
    for(const dx of [-.093,.093])P.addEquipment('hullGlass',box(.025,.052,.013),mainLightX+dx,1.066,3.205);
    P.addEquipment('hullGlass',box(.098,.04,.012),side<0?-1.17:.966,1.073,3.201);
    for(const dx of [-lampW*.38,0,lampW*.38])P.addEquipment('hullDetail',cylY(.006,.006,.009,6),lampX+dx,1.18,3.08);
    P.addEquipment('hullDetail',box(.03,.04,1.48),side*1.32,1.53,1.13,0,0,-side*.02);
    for(const z of [-2.62,-2.01])P.addHatch('hullDetail',box(.84,.025,.51),side*.89,1.748,z);
}

function buildCv90RearRamp(P: TankBuilderPort): void {
  P.addEquipment('hullDetail',box(1.30,1.06,.055),.02,1.125,-3.207);
  // Rear ramp perimeter, separate access leaf, hinge barrels and lifting handles.
  for(const x of [-.60,.64])P.addEquipment('hullDetail',box(.033,1.02,.038),x,1.13,-3.249);
  for(const y of [.62,1.64])P.addEquipment('hullDetail',box(1.26,.031,.038),.02,y,-3.249);
  P.addHatch('hull',box(.50,.82,.026),.14,1.09,-3.25);
  for(const y of [.87,1.25]) {
    P.addEquipment('hullDetail',box(.10,.016,.034),.18,y,-3.277);
    for(const x of [.135,.225])P.addEquipment('hullDetail',box(.014,.022,.040),x,y,-3.263);
  }
  for(const x of [-.73,.77])P.addEquipment('hullDetail',cylX(.043,.14,P.q?16:8),x,.69,-3.245);
  for(const side of [-1,1]) {
    P.addEquipment('hullDetail',box(.47,.024,.07),side*1.12,1.678,-3.192);
    P.addEquipment('hullGlass',box(.22,.074,.012),side*(side<0?1.46:1.39),1.654,-3.197);
  }
}

function addCv90SideArmor(P: TankBuilderPort, side: number, x: number): void {
    sideWall(P,side,Math.abs(x)-.0225,Math.abs(x)+.0225,[
      [-3.16,.97,1.725],[-1.80,.97,1.725],[-1.22,.97,1.537],
      [1.25,.97,1.515],[2.55,.97,1.266],[3.17,.995,1.15],
    ]);
    // Independently hinged lower panels leave the lower wheel faces exposed.
    for(let i=0;i<6;i++) {
      const z=-2.44+i*.88;
      P.addExternalArmor('hull',box(.035,.42,.855),x,.765,z);
      for(const dz of [-.31,.31])P.addEquipment('hullDetail',box(.034,.07,.08),x+side*.0035,.985,z+dz);
    }
    // The source's lower curtain is a separate part below the upper side cells.
    // Source-only lateral rays put its central lower edge at0.307–0.310m rawY.
    sideWall(P,side,Math.abs(x)-.0175,Math.abs(x)+.0175,[
      [-2.754,.830,.856],[-2.70,.789,.856],[-2.48,.515,.565],
      [-2.40,.422,.563],[-2.18,.314,.562],[0,.312,.557],
      [2.40,.310,.552],[2.80,.366,.551],[2.905,.510,.551],
    ]);
    for(const z of [-2.13,-1.24,.211,1.72,2.55]) {
      P.addEquipment('hullDetail',box(.044,.068,.185),x,.344,z);
      for(const dz of [-.055,.055])P.addEquipment('hullDark',cylX(.007,.012,6),x+side*.021,.363,z+dz);
    }
}

function buildCv90Hull(P: TankBuilderPort): void {
  P.add('hull',chassisLoft([
    [-3.185,.76,1.535,1.515,.91,1.03,1.727],[-2.75,.78,1.555,1.535,.35,.99,1.727],
    [-1.80,.69,1.555,1.535,.30,.97,1.727],[-1.22,.68,1.555,1.535,.30,.97,1.537],
    [1.25,.65,1.555,1.525,.30,.97,1.515],[2.50,.73,1.545,1.495,.36,.96,1.276],
    [3.23,.82,1.515,1.445,.75,.99,1.14],
  ],.923).translate(-.035,0,0));
  for(const side of [-1,1]) {
    const x=side<0?-1.6094:1.5381;
    addCv90SideArmor(P,side,x);
    addCv90FendersAndLamps(P,side);
  }
  for(const x of [-.5432,.4682]) {
    P.addEquipment('hullDetail',box(.067,.142,.225),x,.71,3.075);
    const points=Array.from({length:13},(_,i)=>{
      const a=i*Math.PI/6;return new THREE.Vector3(x,.644+Math.cos(a)*.073,3.143+Math.sin(a)*.036);
    });
    P.addEquipment('hullOpenLattice',new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),P.q?24:12,.010,6,true));
  }
  // Only the source's small +X towing loop reaches the 1.672m extremum;
  // the continuous side sheet remains at x1.560, offset from the left side.
  const towLoop=new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.555,.645,2.075),new THREE.Vector3(1.665,.645,2.13),
    new THREE.Vector3(1.665,.645,2.32),new THREE.Vector3(1.555,.645,2.375),
  ]);
  // This open towing eye is separate equipment, never continuous armor.
  P.addEquipment('hullOpenLattice',new THREE.TubeGeometry(towLoop,P.q?16:8,.007,6,false));
  buildCv90RearRamp(P);
  // Large paired deck service covers follow the actual glacis slope.
  for(const side of [-1,1]) {
    P.addHatch('hull',box(.72,.022,.67),side*.88,1.451,1.65,.188);
    for(const dx of [-.30,.30])P.addEquipment('hullDetail',box(.046,.038,.12),side*.88+dx,1.512,1.39,.188);
    for(const dz of [-.25,.25])P.addEquipment('hullDetail',box(.15,.022,.036),side*.88,1.467-dz*.19,1.65+dz,.188);
  }
  P.addHatch('hullDetail',cylY(.315,.315,.044,8),-.66,1.546,1.18);
  P.addEquipment('hullDetail',box(.36,.16,.16),-.66,1.60,1.48);
  P.addEquipment('hullGlass',box(.27,.065,.018),-.66,1.646,1.569);
  deckGrille(P,.81,1.522,.73,.83,.64);
}

function buildCv90RunningGear(P: TankBuilderPort): void {
  P.gear=KIT.buildRunningGear(P,{
    trackShoeBuilder:buildFleetTrackShoe,
    style:'rubber',wheelPattern:'armored-hub-six',trackPattern:'nato-double-pin',
    wheelR:.303,wheelW:.2924,wheelY:.3626, wheelZs:[-1.8908,-1.2202,-.5675,.075,.7192,1.383,2.0629],
    wheelZsLeftM:[-1.8908,-1.2202,-.5675,.075,.7192,1.383,2.0629],
    wheelZsRightM:[-1.7898,-1.1191,-.4664,.1759,.8202,1.484,2.1639],
    xc:1.266,xcLeft:1.3009,xcRight:1.2306,trackW:.55,trackTh:.026,
    trackShoeDimensions:{padHeight:.022,grouserHeight:.008,webHeight:.016,hornHeight:.070,pinRadius:.012,pinCentreY:0},
    sprocket:{z:2.9828,y:.6313,r:.275,trackR:.273,toothTipRadiusM:.299},idler:{z:-2.5524,y:.5408,r:.2622,trackR:.238},
    // Return-course rays at the source lane measure 0.81–0.84m, below the skirt lip.
    rollers:[{z:-1.55,y:.685,r:.09},{z:-.18,y:.665,r:.09},{z:1.24,y:.702,r:.09}],
    topY:.82,botY:.045,coveredTop:true,paintedEnds:true,arms:true,fitLoadedRun:true,dedupeLoopPoints:true,
  });
}

function buildCv90TurretArmor(P: TankBuilderPort, py: number, pz: number): void {
  P.add('turret',armorLoft([
    [-2.08,.76,.83,.75,1.83,2.01,2.081],[-1.65,1.14,1.48,1.41,1.74,1.95,2.10],
    [-.85,1.37,1.52,1.39,1.58,1.82,2.155],[.36,1.38,1.53,1.38,1.58,1.82,2.13],
    [.85,1.05,1.27,1.10,1.61,1.87,2.01],[1.12,.35,.66,.51,1.64,1.80,1.92],
  ],py,pz));
  // Compact sloped crew citadel rises from the much wider lower turret shoulders.
  P.add('turret',armorLoft([
    [-1.12,.65,.72,.61,2.07,2.15,2.30],[-.33,.65,.74,.58,2.07,2.17,2.34],
    [.39,.43,.62,.32,2.07,2.15,2.27],
  ],py,pz));
  for(const side of [-1,1]) {
    for(const z of [-1.05,-.38,.24])turretEquipment(P,'turretDetail',box(.023,.34,.58),side*1.53,1.93,z);

  }
  // Source arrays differ by side: +X is three across in two rows, −X is two across in three rows.
  turretEquipment(P,'turretDetail',box(.52,.34,.035),.655,1.86,1.00,-.77);
  turretEquipment(P,'turretDetail',box(.34,.39,.035),-.91,1.795,.83,-.77,-.30);
  for(const [x,y,z] of [
    [.5437,1.9680,1.0378],[.6976,1.9680,1.0379],[.8516,1.9680,1.0379],
    [.4586,1.8879,1.1317],[.6126,1.8879,1.1317],[.7664,1.8879,1.1317],
    [-.8447,1.9656,.8768],[-.8291,1.8633,.9725],[-.8125,1.7719,1.0613],
    [-.9939,1.9524,.6971],[-.9797,1.8491,.7938],[-.9612,1.7553,.8852],
  ])smokeMouth(P,x,y,z);
}

function buildCv90CrewHatch(P: TankBuilderPort, px: number, py: number, pz: number): void {
  // The circular hatch has separate base, narrow waist, raised lid and actual
  // asymmetric hinge/clamp furniture measured from the supplied configuration.
  turretEquipment(P,'turretDetail',cylY(.3774,.3774,.056,P.q?32:16),.7308,2.314,-.148);
  turretEquipment(P,'turretDark',cylY(.359,.359,.030,P.q?32:16),.7308,2.357,-.148);
  P.addHatch('turret',cylY(.359,.375,.036,P.q?32:16),.7308-px,2.394-py,-.148-pz);
  for(const z of [-.32,-.23]) {
    turretEquipment(P,'turretDetail',box(.19,.040,.060),1.08,2.398,z,0,-.34);
    turretEquipment(P,'turretDetail',box(.068,.133,.058),1.188,2.37,z,0,-.34);
  }
  turretEquipment(P,'turretDetail',cylZ(.028,.19,P.q?16:8),1.18,2.35,-.282,0,-.34);
  turretEquipment(P,'turretDetail',box(.161,.038,.101),.823,2.359,.0915);
  turretEquipment(P,'turretDetail',box(.053,.087,.149),.56,2.381,-.349);
  turretEquipment(P,'turretDetail',box(.071,.045,.082),.6096,2.416,-.375);
  turretEquipment(P,'turretDetail',cylY(.010,.010,.027,8),.7308,2.425,-.146);
  for(const a of [-1.15,.25,1.65,2.7])turretEquipment(P,'turretDetail',box(.022,.040,.063),.7308+Math.sin(a)*.367,2.346,-.148+Math.cos(a)*.367,0,a);
}

function buildCv90RoofSights(P: TankBuilderPort, px: number, py: number, pz: number): void {
  // Open A-frame feet carry the source sight neck; the space between them remains real air.
  for(const side of [-1,1])towerStrut(P,[.2341+side*.165,2.18,-.63],[.2341+side*.070,2.455,-.66],.055,.16);
  turretEquipment(P,'turretDetail',box(.23,.12,.21),.2341,2.455,-.66);
  // Source sight head has raked front/rear caps; a bounding box overstates
  // its full-height roof coverage by roughly 0.1m in side elevation.
  P.addEquipment('turretDetail',sectionSolid([
    {z:-.821-pz,ring:[[.097-px,2.55-py],[.371-px,2.55-py],[.371-px,2.668-py],[.097-px,2.668-py]]},
    {z:-.730-pz,ring:[[.097-px,2.55-py],[.371-px,2.55-py],[.371-px,2.804-py],[.097-px,2.804-py]]},
    {z:-.563-pz,ring:[[.097-px,2.56-py],[.371-px,2.56-py],[.371-px,2.818-py],[.097-px,2.818-py]]},
    {z:-.515-pz,ring:[[.097-px,2.68-py],[.371-px,2.68-py],[.371-px,2.711-py],[.097-px,2.711-py]]},
  ]));
  turretEquipment(P,'turretGlass',box(.194,.135,.018),.2341,2.725,-.550,-.50);
  for(const side of [-1,1]) {
    const x=side<0?-.570:.923,baseY=side<0?2.193:2.248;
    turretEquipment(P,'turretDetail',box(.40,.15,.32),x,baseY,-1.425);
    for(const dx of [-.080,.080])turretEquipment(P,'turretDetail',box(.043,.31,.24),x+dx,baseY+.22,-1.425,-.16);
    turretEquipment(P,'turretDetail',box(.205,.045,.26),x,baseY+.080,-1.425);
    for(const dy of [0,.1465]) {
      const hx=side<0?-.710+dy*.36:1.063-dy*.36,hy=baseY+.219+dy;
      turretEquipment(P,'turretDetail',cylX(.088,.27,P.q?20:10),hx,hy,-1.422,0,0,side*.31);
      turretEquipment(P,'turretDark',cylX(.061,.012,P.q?16:8),hx+side*.132,hy+side*.041,-1.422,0,0,side*.31);
    }
  }
  turretEquipment(P,'turretDetail',cylY(.055,.072,.575,P.q?16:8),.313,2.367,-1.737);
  antenna(P,-.71,2.28,3.85279,-.65);antenna(P,1.10,2.28,3.72,-.65);
}

function buildCv90MissileCanisters(P: TankBuilderPort): void {
  // Thin open awning over the source's outboard sight station.
  weaponAssembly(P, () => {
    for(const x of [-1.38,-1.05])turretEquipment(P,'turretDetail',box(.055,.235,.74),x,2.25,-.18,-.04);
    turretEquipment(P,'turretDetail',box(.62,.030,.99),-1.215,2.38,-.18,-.015);
    // Supplied model's paired missile canisters remain under their real awning.
    // Their source dimensions establish two launchers, not reserve ammunition.
    for(const x of [-1.0525,-1.3769]) {
      turretEquipment(P,'turretDetail',cylZ(.0553,.9508,P.q?24:12),x,2.235,-.1795,-.085);
      for(const z of [-.52,.13])turretEquipment(P,'turretDetail',cylZ(.073,.046,P.q?20:10),x,2.235,z,-.085);
      turretEquipment(P,'turretDark',cylZ(.046,.014,P.q?20:10),x,2.275,.303,-.085);
    }
  });
  optic(P,-.282,2.407,.25,.488,.245,.377);
}

function buildCv90Cannon(P: TankBuilderPort): void {
  P.add('gunMount',sectionSolid([
    {z:-.14,ring:[[-.26,-.24],[.26,-.24],[.29,.14],[.20,.26],[-.20,.26],[-.29,.14]]},
    {z:.42,ring:[[-.13,-.13],[.13,-.13],[.15,.10],[.10,.15],[-.10,.15],[-.15,.10]]},
  ]));
  // The actual barrel ends inside a flared brake. Side-axis rays through its
  // mid-chamber hit no source stock; a full-length tube would fill that air.
  openTube(P,.0442,.30,2.54251,.0288);
  const channel=(rows:readonly (readonly [number,number,number])[],lower=false)=>sectionSolid(rows.map(([z,w,y])=>{
    const ring: [number,number][]=[[-w,y+.015-.008],[-w*.53,y-.008],[w*.53,y-.008],[w,y+.015-.008],
      [w,y+.015],[w*.53,y],[-w*.53,y],[-w,y+.015]];
    if(lower){for(const p of ring)p[1]*=-1;ring.reverse();}
    return{z,ring};
  }));
  P.add('gun',channel([[2.44,.044,.039],[2.58,.072,.049],[2.70,.091,.048],[2.88,.083,.046],[2.895,.038,.046]]));
  P.add('gun',channel([[2.44,.044,.049],[2.60,.083,.061],[2.78,.085,.064],[2.825,.039,.043]],true));
  P.add('gun',box(.030,.029,.010),0,.06305,2.90081);
  // Source baffle ends at worldZ3.50621; its metal lip projects99.60mm.
  // Supplied AW configuration uses the publisher-documented 50 mm Bushmaster.
  // Keep the measured outer brake, chamber air and 65 mm backstop unchanged.
  const mouth=2.80621,n=P.q?28:14,outer=.0505,inner=.025,depth=.065;
  P.add('gun',new THREE.CylinderGeometry(outer,outer,.0723,n,1,true).rotateX(Math.PI/2),0,0,mouth-.03615);
  const throat=new THREE.CylinderGeometry(inner,inner,depth,n,1,true).rotateX(Math.PI/2),index=throat.index!;
  for(let i=0;i<index.count;i+=3){const a=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,a);}throat.computeVertexNormals();
  P.add('gunDark',throat,0,0,mouth-depth/2);
  P.add('gun',new THREE.RingGeometry(inner,outer,n),0,0,mouth);
  P.add('gunDark',new THREE.CircleGeometry(inner,n),0,0,mouth-depth);
  // The forward upper tab has a measured low edge within the mouth radius.
  P.add('gun',box(.020,.013,.010),0,.049,2.90081);
  P.muzzleZ=mouth;P.physicalMuzzleBore={outerRadiusM:outer,innerRadiusM:inner,depthM:depth,rimProjectionM:.0996};
}

export function buildCv90MkivX(P: TankBuilderPort): void {
  // Measured fixed armor extends the shadow silhouette; omit small fittings.
  P.additionalShadowSources = {
    hull: ['hullExternalArmor', 'hullHatch'],
    turret: ['turretHatch'],
  };
  P.hullG.position.set(0,0,0); P.turretG.position.set(-.035,1.55,-.60);
  P.gunG.position.set(.207, .294, 1.30);
  buildCv90Hull(P);
  buildCv90RunningGear(P);
  const px=P.turretG.position.x,py=P.turretG.position.y,pz=P.turretG.position.z;
  buildCv90TurretArmor(P,py,pz);
  buildCv90CrewHatch(P,px,py,pz);
  buildCv90RoofSights(P,px,py,pz);
  buildCv90MissileCanisters(P);
  buildCv90Cannon(P);
  preserveSourceStudyGunMountAppearance(P);
  P.topY=2.82-py;
  P.hullG.userData.xRebuild={candidate:'cv90_mkiv_x',independent:true,sourceLocalOnly:true,datumVersion:1};
}
export const CV90_MKIV_SOURCE_X_PROFILES={cv90_mkiv_x:{build:buildCv90MkivX}} as const;
