import { preserveSourceStudyGunMountAppearance } from './sourceStudyGunMount.ts';
// Independent procedural reconstruction of the owner's long-skirt Ajax fit.
import { BoxGeometry, Mesh, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { mirrorX } from './europeSourcePrimitives.ts';
import { lathedWheelSection, type AxialWheelStation } from './lathedWheelStock.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylY, cylZ, torus } = KIT;

/** Eight-sided closed plate; every cut is an authored scalar corner radius. */
type EquipmentAdder = (bucket: string, geometry: ReturnType<typeof box>,
  x: number, y: number, z: number, rx?: number, ry?: number, rz?: number) => void;

function clippedPlate(width:number,height:number,thickness:number,cut:number) {
  const x=width/2,y=height/2;
  const ring=[[-x+cut,-y],[x-cut,-y],[x,-y+cut],[x,y-cut],
    [x-cut,y],[-x+cut,y],[-x,y-cut],[-x,-y+cut]] as const;
  return sectionSolid([{z:-thickness/2,ring},{z:thickness/2,ring}]);
}

function horizontalPlate(width:number,depth:number,thickness:number,cut:number) {
  return clippedPlate(width,depth,thickness,cut).rotateX(-Math.PI/2);
}

/** Object_10's rear sheet turns inward at its inner edge and folds upward
 * against the hull. Sparse dimensional stations construct independent stock;
 * the source's low track course is not part of this flap. */
function rearFlap(P:TankBuilderPort,side:number):void {
  // x, bottom z/y, intermediate z/y, root z/y, sheet depth along Z.
  const rows=[
    [.993,-3.300,.843,-3.300,1.020,-3.287,1.209,.010],
    [1.033,-3.459,.899,-3.400,1.057,-3.287,1.294,.013],
    [1.114,-3.507,.914,-3.400,1.125,-3.287,1.3291,.010],
    [1.339,-3.531,.934,-3.400,1.150,-3.287,1.3291,.010],
    [1.565,-3.551,.948,-3.400,1.176,-3.309,1.293,.021],
  ];
  // Loft laterally, then rotate local longitudinal stations onto vehicle X.
  const sheet=sectionSolid(rows.map(([x,bz,by,mz,my,tz,ty,depth])=>({z:x,ring:[
    [-bz,by],[-mz,my],[-tz,ty],[-tz-depth,ty],[-mz-depth,my],[-bz-depth,by],
  ]}))).rotateY(Math.PI/2);
  if(side<0)mirrorX(sheet);
  P.addMudguard(`ajax-rear-flap-${side}`,'hullRubber',sheet);
  // Measured narrow terminal fold, not a bridge to the obsolete low flap.
  P.addMudguard(`ajax-rear-fold-${side}`,'hullRubber',
    new BoxGeometry(.225,.0444,.010),side*1.2265,1.3392,-3.292);
}

/** Measured asymmetry of Object_10: closed port bin and starboard service bay. */
function rearEquipment(P:TankBuilderPort):void {
  // The broad port box reaches the hull's aft face; it is not a floating pod.
  P.addEquipment('hullDetail',box(1.427,.75,.982),-1.2665,1.719,-3.778);
  P.addEquipment('hullDetail',box(1.427,.026,.982),-1.2665,2.107,-3.778);
  P.addEquipment('hullDetail',clippedPlate(1.29,.62,.022,.055),-1.2665,1.729,-4.279);
  for(const x of [-1.82,-.73]) {
    P.addEquipment('hullDetail',box(.065,.13,.045),x,1.956,-4.266);
    P.addEquipment('hullDetail',box(.071,.047,.10),x,2.126,-3.47);
  }
  // The right aft module has two walls, a recessed service face, and real
  // access-step air below the vent. Its top bridges to the main hull deck.
  P.addEquipment('hullDetail',box(.416,.755,.877),1.772,1.7215,-3.7455);
  P.addEquipment('hullDetail',box(.295,1.053,.897),.7545,1.5725,-3.7355);
  // Object_10's receiving module rises toward the hull on its underside.
  // The former flat y1.10 bottom buried the source's sloped rear flap.
  P.addEquipment('hullDetail',sectionSolid([-3.587,-3.287].map(z=>({z,ring:[
    [.898,1.302982+(z+3.4)*.57391],[1.578,1.302982+(z+3.4)*.57391],
    [1.578,2.04],[.898,2.04],
  ]}))));
  P.addEquipment('hullDetail',box(.704,.034,.927),1.246,2.083,-3.752);
  // The vent cassette bridges both side walls; only the access space below
  // it is open. The louver face must not hang in front of an empty cavity.
  P.addEquipment('hullDetail',box(.70,.53,.91),1.237,1.764,-3.75);
  P.addEquipment('hullDark',box(.604,.193,.026),1.248,1.903,-4.197);
  for(const x of [.934,1.562])
    P.addEquipment('hullDetail',box(.033,.25,.065),x,1.891,-4.208);
  for(const y of [1.772,2.01])
    P.addEquipment('hullDetail',box(.66,.032,.065),1.248,y,-4.208);
  for(let row=0;row<6;row++)
    P.addEquipment('hullDetail',box(.598,.018,.042),1.248,1.811+row*.032,-4.224,-.22);
  P.addEquipment('hullDetail',box(.70,.049,.41),1.237,1.095,-3.678);
  for(let row=0;row<5;row++)
    P.addEquipment('hullDetail',box(.538,.014,.059),1.249,1.127+row*.015,-3.804-row*.014);
  P.addHatch('hullDetail',horizontalPlate(.441,.344,.028,.055),1.2645,2.118,-3.670);
  for(const x of [1.15,1.38])P.addEquipment('hullDetail',box(.037,.058,.036),x,2.158,-3.67);
  P.addEquipment('hullDetail',box(.25,.022,.027),1.2645,2.192,-3.67);
  // Shallow main ramp and its offset small access door preserve the broad
  // hull rear outline while distinguishing the source's nested service forms.
  P.addEquipment('hullDetail',clippedPlate(1.865,1.31,.035,.13),.026,1.365,-3.313);
  P.addEquipment('hullDetail',clippedPlate(.847,.868,.045,.105),.169,1.414,-3.353);
  for(const y of [1.106,1.722]) {
    P.addEquipment('hullDetail',box(.13,.09,.08),.619,y,-3.373);
    P.addEquipment('hullDetail',cylY(.023,.023,.12,10),.679,y,-3.388);
  }
  for(const y of [1.20,1.56])P.addEquipment('hullDetail',box(.041,.035,.071),-.263,y,-3.367);
  P.addEquipment('hullDetail',box(.028,.39,.027),-.263,1.38,-3.408);
  for(const side of [-1,1]) {
    P.addEquipment('hullDetail',box(.056,.66,.052),side*1.964,1.732,-4.187);
    P.addEquipment('hullDetail',cylZ(.047,.024,P.q?18:10),side*1.868,1.787,-4.223);
    P.addEquipment('hullDetail',box(.11,.08,.19),side*.885,.737,-3.326);
    P.addEquipment('hullDetail',torus(.051,.014,P.q?16:10,6),side*.885,.704,-3.418);
  }
}

function bowServicePanels(P:TankBuilderPort):void {
  const pitch=Math.atan(.306),surface=(z:number)=>2.10-(z-1.30)*.306;
  // Object_10's two port engine/service covers straddle the deck break.
  // Split at the actual break so the aft cover is not tilted off its seat.
  for(const [x,width,rear,front] of [[-1.2805,.561,.316,1.858],[-.395,1.116,.798,1.674]]) {
    const aftDepth=1.30-rear,forwardDepth=front-1.30;
    P.addHatch('hullDetail',box(width,.027,aftDepth),x,2.111,(rear+1.30)/2);
    const frontZ=(front+1.30)/2;
    P.addHatch('hullDetail',box(width,.027,forwardDepth/Math.cos(pitch)),x,surface(frontZ)+.012,frontZ,pitch);
    for(const dx of [-width*.31,width*.31]) {
      const z=rear+.055;
      P.addEquipment('hullDetail',box(.075,.036,.075),x+dx,2.137,z);
      P.addEquipment('hullDetail',cylX(.023,.086,10),x+dx,2.157,z);
    }
  }
  // The central bow housing has an angled back and an open handle beside it.
  P.addEquipment('hullDetail',box(.51,.11,.25),.025,surface(2.09)+.06,2.09,pitch);
  for(const x of [-.12,.12])P.addEquipment('hullDetail',box(.026,.12,.035),x,surface(2.49)+.07,2.49,pitch);
  P.addEquipment('hullDetail',box(.27,.022,.028),0,surface(2.49)+.125,2.49,pitch);
  for(const [x,zs] of [[-1.455,[2.39,2.72]],[1.438,[2.135,2.393,2.673]]] as const)
    for(const z of zs) {
      P.addEquipment('hullDetail',cylY(.054,.066,.035,P.q?16:10),x,surface(z)+.022,z,pitch);
      P.addEquipment('hullDetail',box(.07,.025,.025),x,surface(z)+.047,z,pitch);
    }
  // The source's port raised service frame is an open rectangular bracket.
  for(const x of [-.96,-.18])
    P.addEquipment('hullDetail',box(.035,.075,.45),x,surface(2.375)+.054,2.375,pitch);
  for(const z of [2.155,2.595])
    P.addEquipment('hullDetail',box(.81,.075,.038),-.57,surface(z)+.054,z,pitch);
  // Chamfered driver hatch, source Object_16 scalar envelope, with its
  // forward periscope and transverse hinge instead of the old round disc.
  P.addHatch('hullDetail',horizontalPlate(.752,.805,.045,.17),.710,2.084,1.1395,.095);
  P.addEquipment('hullDetail',box(.35,.075,.13),.710,2.102,1.535);
  P.addEquipment('hullGlass',box(.285,.031,.012),.710,2.113,1.606);
  P.addEquipment('hullDetail',cylX(.028,.38,12),.710,2.137,.78);
  for(const x of [.575,.845])P.addEquipment('hullDetail',box(.04,.055,.035),x,2.117,1.31);
  P.addEquipment('hullDetail',box(.31,.021,.029),.710,2.137,1.31);
}

function hull(P:TankBuilderPort):void {
  const s=(z:number,half:number,roof:number,floor:number):SolidSection=>({z,ring:[
    [-.94,floor],[.94,floor],[1.0,1.29],[half,1.41],[half,roof],[-half,roof],[-half,1.41],[-1.0,1.29],
  ]});
  P.add('hull',sectionSolid([
    s(-3.32,1.56,2.10,.58),s(-2.85,1.63,2.10,.42),s(1.30,1.64,2.10,.42),
    s(2.51,1.65,1.73,.57),s(3.35,1.58,1.47,1.02),
  ]));
  hullSideArmor(P);
  hullInspectionCoverAndLamps(P);
  rearEquipment(P);bowServicePanels(P);
  for(const z of [-2.86,-2.37]) {
    P.addEquipment('hullDark',box(.78,.023,.38),-.73,2.111,z);
    for(let i=-3;i<=3;i++)P.addEquipment('hullDetail',box(.68,.013,.015),-.73,2.128,z+i*.049);
  }
  P.addHatch('hullDetail',horizontalPlate(.73,.57,.043,.065),.72,2.121,-2.57);
  bowOpenStepFrame(P);

}

function gear(P:TankBuilderPort):void {
  // Source Object_25: the steel dish is 122 mm behind the tire face.
  // These scalar stations preserve that recess through native suspension.
  const section:AxialWheelStation[]=[
    [.0205,0],[.1687,0],[.1687,.038],[.164,.057],[.154,.073],
    [.136,.084],[.103,.095],[.0475,.110],[.0475,.178],
    [.0586,.211],[.0451,.228],[.0584,.253],[.0884,.2665],
    [.032,.2665],[.0205,.221],
  ];
  const lowSection:AxialWheelStation[]=[
    [.0205,0],[.1687,0],[.1687,.038],[.150,.080],
    [.0475,.110],[.0475,.235],[.0884,.2665],[.032,.2665],[.0205,.221],
  ];
  // Twenty angular sectors retain every HIGH axial station with at most
  // 3.3 mm chord error at the outer steel lip; LOW uses twelve sectors.
  const activeSection=P.q?section:lowSection;
  const core=KIT.mergeAll([
    lathedWheelSection(activeSection,P.q?20:12),
    lathedWheelSection(activeSection.map(([x,r])=>[-x,r]),P.q?20:12),
    // This axle bridge is wholly buried behind both measured dish faces.
    cylX(.090,.080,8),
  ]);
  P.gear=KIT.buildRunningGear(P,{
    style:'rubber',wheelPattern:'plain-dish-twelve',trackPattern:'compact-ifv',
    wheelR:.324,wheelW:.340,wheelY:.391,
    wheelTireBands:[
      {centerM:-.1036,widthM:.1328,innerRadiusM:.266},
      {centerM:.1036,widthM:.1328,innerRadiusM:.266},
    ],
    wheelCoreGeometry:{disc:core},
    wheelZs:[-2.233,-1.489,-.745,-.001,.7435,1.4875,2.2315],
    xc:1.322,trackW:.597,trackTh:.032,
    trackShoeBuilder:buildFleetTrackShoe,
    trackShoeDimensions:{padHeight:.034,grouserHeight:.008,webHeight:.026,hornHeight:.08,pinRadius:.014},
    sprocket:{z:2.867,y:.8655,r:.343},idler:{z:-2.992,y:.8305,r:.3235},
    rollers:[-2.0,-.70,.61,1.89].map(z=>({z,y:1.067,r:.095})),
    rollerR:.095,topY:1.195,botY:.054,coveredTop:true,paintedEnds:true,
    arms:true,fitLoadedRun:true,dedupeLoopPoints:true,
  });
  // Object_25 has twelve web fasteners and six hub fasteners on the outward
  // face only. Side-filtered native layers follow the same physical axle;
  // mirroring both faces of every wheel would invent hidden inward hardware.
  for(const side of [-1,1] as const) {
    const fasteners=[];
    for(let i=0;i<12;i++) {
      const a=i*Math.PI/6;
      fasteners.push(cylX(.009,.012,P.q?6:4).translate(side*.0664,Math.cos(a)*.133,Math.sin(a)*.133));
    }
    for(let i=0;i<6;i++) {
      const a=i*Math.PI/3;
      fasteners.push(cylX(.009,.015,P.q?6:4).translate(side*.1434,Math.cos(a)*.074,Math.sin(a)*.074));
    }
    P.gear.addRoadWheelLayer(KIT.mergeAll(fasteners),P.mats.rubber,{
      side,appearanceRole:'wheelInset',name:'ajaxRoadWheelFasteners'+side,
    });
  }
}

function turret(P:TankBuilderPort):void {
  const p=P.turretG.position;
  const add=(b:string,g:ReturnType<typeof box>,x:number,y:number,z:number,rx=0,ry=0,rz=0)=>
    P.addEquipment(b,g,x-p.x,y-p.y,z-p.z,rx,ry,rz);
  const s=(z:number,w:number,roofW:number,low:number,roof:number):SolidSection=>({z:z-p.z,ring:[
    [-w,low-p.y],[w,low-p.y],[w,2.53-p.y],[roofW,roof-p.y],[-roofW,roof-p.y],[-w,2.53-p.y],
  ]});
  P.add('turret',sectionSolid([
    s(-2.69,1.20,1.12,2.17,2.695),s(-2.18,1.34,1.22,2.14,2.695),
    s(-.30,1.29,1.10,2.16,2.695),s(.42,.78,.64,2.28,2.54),
  ]));
  P.add('turret',cylY(.91,.91,.13,P.q?40:24),0,.025,0);
  turretSideEquipment(P, add);
  for(const side of [-1,1]) {
    smokeBankCarrier(P, add, side);
    smokeBankSockets(P, add, side);
    for(const z of [-2.42,-1.24])add('turretDetail',box(.065,.14,.08),side*1.30,2.60,z);
  }
  turretServicePlateAndAntennas(P, add);
  turretHatches(P, add);
  panoramicSight(P, add);
  portSight(P, add);
  roofMachineGun(P, add);
  gunReceiverShoulders(P);
  const gunDatum={x:0,y:2.506,z:.67};
  const shroud=(z:number,left:number,right:number,bottom:number,top:number,roofRight:number,shoulder:number):SolidSection=>{
    const cut=.025;
    return {z:z-gunDatum.z,ring:[
      [left+cut,bottom-gunDatum.y],[right-cut,bottom-gunDatum.y],
      [right,bottom+cut-gunDatum.y],[right,shoulder-gunDatum.y],
      [roofRight,top-gunDatum.y],[left+cut,top-gunDatum.y],
      [left,top-cut-gunDatum.y],[left,bottom+cut-gunDatum.y],
    ]};
  };
  P.addGunExtra(sectionSolid([
    shroud(-.298,-.219,.430,2.30,2.435,.405,2.41),
    shroud(-.220,-.219,.430,2.30,2.759,.405,2.734),
    shroud(-.100,-.219,.430,2.28,2.783,.405,2.758),
    shroud(0,-.219,.430,2.273,2.764,.405,2.739),
    shroud(.145,-.219,.430,2.273,2.694,.405,2.669),
    shroud(.280,-.219,.227,2.335,2.6805,0,2.489),
    shroud(.884,-.219,.227,2.335,2.6805,0,2.489),
  ]));
  P.addGunExtraDark(box(.047,.051,.012),-.172,-.059,.220);
  P.add('gun',cylZ(.049,2.429,P.q?28:16),0,0,1.2145);
  P.add('gun',cylZ(.105,.17,P.q?28:16),0,0,.27);
  P.add('gun',cylZ(.065,.15,P.q?28:16),0,0,2.354);
  P.muzzleZ=2.429;
}

function hullSideArmor(P: TankBuilderPort): void {
  for(const side of [-1,1]) {
    const deck=(z:number,roof:number,outer:number):SolidSection=>{
      const ring=[[1.56,roof-.07],[outer,roof-.07],[outer,roof],[1.56,roof]]
        .map(([x,y])=>[side*x,y] as const);
      if(side<0)ring.reverse();return {z,ring};
    };
    P.add('hull',sectionSolid([
      deck(-3.28,2.10,1.96),deck(1.30,2.10,1.931),deck(2.51,1.73,1.931),deck(2.82,1.64,1.98),
    ]));
    P.add('hull',sectionSolid([
      deck(2.82,1.64,1.98),deck(3.16,1.50,1.99),deck(3.34,1.47,1.85),
    ]));
    const ring=[[1.655,.565],[1.931,.565],[1.931,2.10],[1.655,2.10]].map(([x,y])=>[side*x,y] as const);
    if(side<0)ring.reverse();
    P.addExternalArmor('hull',sectionSolid([
      {z:-3.17,ring:ring.map(([x,y])=>[x,Math.max(y,.95)] as const)},
      {z:-2.38,ring}, {z:1.92,ring},
      {z:2.82,ring:ring.map(([x,y])=>[x,Math.max(.97,Math.min(y,1.64))] as const)},
    ]));
    // Side-panel fasteners and latches identify the large uninterrupted armor.
    for(let i=0;i<8;i++) {
      const z=-2.77+i*.73;
      P.addEquipment('hullDetail',box(.065,.073,.13),side*1.948,1.40,z);
      P.addEquipment('hullDark',cylX(.018,.02,8),side*1.98,1.40,z);
      if(i%2===0) {
        P.addEquipment('hullDetail',box(.043,.045,.105),side*1.954,1.97,z);
        P.addEquipment('hullDetail',box(.043,.072,.040),side*1.954,.88,z);
      }
    }
    rearFlap(P,side);
    P.addEquipment('hullDetail',box(.27,.17,.13),side*1.47,1.55,3.13,-.13);
    P.addEquipment('hullGlass',cylZ(.057,.02,P.q?20:10),side*1.47,1.56,3.207);
    // Object_10's towing eyes stand in YZ planes below the sloped bow.
    P.addEquipment('hullDetail',torus(.073,.036,P.q?18:10,7)
      .rotateZ(Math.PI/2).scale(1,1,1.147),side*1.0395,1.309,3.188);
    P.addEquipment('hullDetail',cylY(.11,.14,.075,P.q?20:12),side*1.788,2.137,.206);
  }
}

function hullInspectionCoverAndLamps(P: TankBuilderPort): void {
  // Port forward inspection cover: the source's asymmetric outermost item.
  // Its short mounting rails bridge back to the side armor, not a floating skin.
  for(const y of [1.365,1.935])
    P.addEquipment('hullDetail',box(.11,.06,.39),-1.966,y,1.569);
  P.addEquipment('hullDetail',box(.024,.629,.388),-2.003,1.653,1.569);
  for(const y of [1.51,1.79])
    P.addEquipment('hullDetail',box(.105,.033,.047),-2.052,y,1.686);
  P.addEquipment('hullDetail',cylY(.016,.016,.30,10),-2.093,1.65,1.686);
  for(const z of [1.392,1.746])for(const y of [1.361,1.948])
    P.addEquipment('hullDark',cylX(.012,.012,8),-2.02,y,z);
  for(const [x,z] of [[-2.013,3.055],[1.951,3.055]]) {
    P.addEquipment('hullDetail',box(.136,.187,.168),x,1.399,z);
    P.addEquipment('hullGlass',cylZ(.047,.017,P.q?18:10),x,1.405,z+.09);
    P.addEquipment('hullDetail',box(.07,.06,.18),x+(x<0?.064:-.064),1.481,z);
  }
}

function bowOpenStepFrame(P: TankBuilderPort): void {
  // Only the actual open bars live in this mesh. Closed armor and the solid
  // footstep remain in ordinary equipment buckets and in the zero-hole scan.
  const frameParts:BoxGeometry[]=[];
  const bar=(w:number,h:number,d:number,x:number,y:number,z:number)=>
    frameParts.push(new BoxGeometry(w,h,d).translate(x,y,z));
  // Object_28 has two staggered grids: port ends above the road wheel;
  // starboard extends to a small projecting step. The diagonal stays enter
  // the solid bow at Y 1.076 / Z 3.17, instead of ending below the hull.
  bar(.026,.758,.061,-.6845,1.368,3.595);
  for(const x of [-.0745,.6825])bar(.026,1.12,.061,x,1.187,3.595);
  for(const y of [.999,1.743])bar(.636,.022,.052,-.379,y,3.595);
  for(const y of [.638,1.384,1.743])bar(.772,.022,.052,.304,y,3.595);
  for(let row=0;row<11;row++)bar(.587,.009,.033,-.3795,1.0765+row*.066,3.595);
  for(let row=0;row<11;row++) {
    const width=row<3?.381:.684;
    bar(width,.009,.033,row<3?.1525:.304,.6985+row*.0664,3.595);
  }
  const stayRise=.650,stayRun=.395,stayLength=Math.hypot(stayRise,stayRun);
  for(const x of [-.6845,-.0745,.6825])
    frameParts.push(new BoxGeometry(.023,.024,stayLength)
      .rotateX(-Math.atan2(stayRise,stayRun)).translate(x,1.401,3.3675));
  for(const x of [.365,.632])
    frameParts.push(new BoxGeometry(.018,.020,.215)
      .rotateX(.42).translate(x,.661,3.700));
  for(const x of [.352,.646])bar(.018,.11,.026,x,.677,3.595);
  bar(.295,.012,.026,.499,.717,3.595);
  const frameGeometry=mergeGeometries(frameParts);
  for(const part of frameParts)part.dispose();
  if(!frameGeometry)throw new Error('Ajax bow frame geometry did not merge');
  const frame=new Mesh(frameGeometry,P.mats.detail);
  frame.name='ajax_bow_open_step_frame';
  frame.userData={appearanceRole:'fittingPaint',combatHitboxRole:'equipment',
    continuityRole:'open-lattice',sourceEquipment:'bow-slat-step-frame'};
  frame.castShadow=frame.receiveShadow=true;
  P.hullG.add(frame);P.disposables.push(frameGeometry);
  P.addEquipment('hullDetail',box(.295,.025,.229),.499,.615,3.704);}

function turretSideEquipment(P: TankBuilderPort, add: EquipmentAdder): void {
  // The source's large side case is on +X, farther aft than the smoke banks.
  add('turretDetail',box(.411,.610,.525),1.2585,2.433,-.9095);
  add('turretDetail',box(.029,.37,.42),1.478,2.445,-.9095);
  for(const z of [-1.029,-.775])add('turretDetail',box(.15,.04,.115),1.258,2.758,z);
  for(const [x,y,z] of [[-1.438,2.578,-.058],[-1.399,2.492,-2.475],[1.248,2.597,-.098],[1.070,2.44,-2.73]]) {
    const sign=Math.sign(x);
    add('turretDetail',box(.22,.245,.243),x-sign*.10,y-.01,z);
    add('turretDetail',cylX(.089,.08,P.q?20:12),x,y,z);
    add('turretDark',cylX(.058,.014,P.q?18:10),x+sign*.045,y,z);
    add('turretDetail',box(.10,.028,.095),x,y+.106,z);
  }
  // The cable/handrail and its stand-offs follow the port face between the
  // two measured actuator cases; each end terminates at an actual bracket.
  add('turretDetail',cylZ(.014,2.32,P.q?12:8),-1.412,2.605,-1.24);
  for(const z of [-2.40,-1.53,-.08])add('turretDetail',box(.12,.046,.055),-1.365,2.605,z);
}

function smokeBankCarrier(P: TankBuilderPort, add: EquipmentAdder, side: number): void {
    // Object_27 has two short, inclined receiver brackets per bank. A
    // single vertical face plate incorrectly buried the outboard column.
    // These scalar widths/angles come from the source support envelopes.
    const yaw=side<0?-.834:1.039;
    for(const upper of [false,true]) {
      smokeReceiverBracket(add, side, upper, yaw);
    }
    // The folded inner carrier returns into the actual turret side, behind
    // the sockets. It does not occupy the cap plane or fill the column air.
    if(side<0) {
      add('turretDetail',box(.032,.09,.46).rotateX(.445).rotateY(.26),-1.056,2.625,.008);
      for(const x of [-1.067,-1.021])
        add('turretDetail',box(.010,.186,.080).rotateY(yaw),x,2.456,.208);
    } else {
      add('turretDetail',box(.040,.53,.085).rotateX(-.61),.894,2.437,.015);
      for(const [x,z] of [[.926,.190],[.956,.138]])
        add('turretDetail',box(.010,.258,.075).rotateY(yaw),x,2.279,z);
    }
}

function smokeBankSockets(P: TankBuilderPort, add: EquipmentAdder, side: number): void {
    for(let i=0;i<8;i++) {
      smokeSocket(P, add, side, i);
    }
}

function turretServicePlateAndAntennas(P: TankBuilderPort, add: EquipmentAdder): void {
  for(const [x,y,z] of [[-.889,2.740,-.185],[-.835,2.740,-1.804],[1.175,2.783,-.956]])
    add('turretDetail',cylY(.056,.070,.090,P.q?18:10),x,y,z);
  // Raised central service plate: source roof rays remain at 2.8205 m
  // across this stock, above the surrounding 2.695 m structural roof.
  add('turretDetail',horizontalPlate(.82,.73,.126,.045),.108,2.758,-.747);
  for(const x of [-.217,.105,.427])for(const z of [-1.101,-.548])
    add('turretDark',cylY(.011,.011,.011,8),x,2.827,z);
  // The short antenna fittings are distinct from the single centre mast.
  for(const [x,y,z] of [[-.889,2.912,-.185],[-1.243,2.833,-2.179],[1.331,2.867,-.775]]) {
    add('turretDetail',cylY(.027,.032,.134,P.q?12:8),x,y,z);
    add('turretDetail',cylY(.049,.059,.070,P.q?14:8),x,y-.095,z);
  }
  // Object_27's single tall mast is near the centre, not a generic mirrored pair.
  add('turretDetail',box(.079,.226,.079),.162,2.806,-1.104);
  add('turretDetail',cylY(.036,.050,.108,P.q?16:8),.162,2.971,-1.104);
  add('turretDetail',cylY(.012,.019,.415,P.q?12:8),.162,3.2245,-1.104);
}

function turretHatches(P: TankBuilderPort, add: EquipmentAdder): void {
  // Object_27's two broad clipped covers and their hinge/latch hardware.
  for(const [x,width] of [[-.423,.835],[.602,.916]]) {
    add('turretDetail',horizontalPlate(width,.81,.050,.15),x,2.714,-1.54);
    add('turretDetail',horizontalPlate(width-.065,.744,.032,.135),x,2.752,-1.54);
    for(const dx of [-width*.28,width*.28]) {
      add('turretDetail',box(.13,.072,.11),x+dx,2.762,-1.92);
      add('turretDetail',cylX(.040,.14,12),x+dx,2.814,-1.92);
    }
    for(const dx of [-.22,.22]) {
      add('turretDetail',box(.083,.055,.11),x+dx,2.787,-1.195);
      add('turretDark',cylY(.015,.015,.016,8),x+dx,2.824,-1.174);
    }
    for(const dx of [-.09,.09])add('turretDetail',box(.027,.047,.030),x+dx,2.789,-1.55);
    add('turretDetail',box(.208,.024,.028),x,2.825,-1.55);
  }
}

function panoramicSight(P: TankBuilderPort, add: EquipmentAdder): void {
  const p=P.turretG.position;
  // The source's panoramic sight sits on a broad, rear-flat polygonal tower.
  // Horizontal first-hit measurements establish its clipped footprint; a
  // narrow circular pedestal lost the rear and side identity of this turret.
  const tower=(z:number,left:number,right:number):SolidSection=>({z:z-p.z,ring:[
    [left-p.x,2.14-p.y],[right-p.x,2.14-p.y],
    [right-p.x,3.200-p.y],[left-p.x,3.200-p.y],
  ]});
  P.add('turret',sectionSolid([
    tower(-2.692,.1346,.741),tower(-2.50,.1346,.945),
    tower(-2.44,.1346,1.002),tower(-2.12,.1346,1.002),
    tower(-1.95,.3096,.8268),tower(-1.865,.535,.602),
  ]));
  // The hood has an overhanging roof and side cheeks around the lower lens;
  // its full bounding box is not solid stock.
  add('turretDetail',box(.343,.230,.241),.569,3.303,-2.234);
  add('turretDetail',box(.469,.300,.038),.569,3.46,-2.495);
  add('turretDetail',box(.469,.040,.377),.569,3.589,-2.326);
  for(const x of [.355,.783])add('turretDetail',box(.041,.243,.315),x,3.433,-2.327);
  for(const x of [.461,.677])add('turretDetail',box(.014,.045,.020),x,3.631,-2.265);
  add('turretDetail',box(.216,.014,.020),.569,3.653,-2.265);
  add('turretGlass',box(.267,.223,.018),.569,3.321,-2.130);
}

function portSight(P: TankBuilderPort, add: EquipmentAdder): void {
  // Object_6 has one port low sight, not two mirrored forward screens.
  add('turretDetail',box(.358,.256,.270),-.510,2.804,-.973);
  add('turretGlass',box(.233,.198,.014),-.492,2.812,-.832);
  // Its raised protective cover opens toward the front, with separate
  // side walls and a sloping top seated on the sight's rear housing.
  for(const x of [-.675,-.346])add('turretDetail',box(.028,.228,.310),x,2.914,-.739,-.29);
  add('turretDetail',box(.356,.027,.334),-.510,3.010,-.731,-.29);
}

function roofMachineGun(P: TankBuilderPort, add: EquipmentAdder): void {
  const p=P.turretG.position;
  // Remote roof MG has a visible fork-to-pedestal load path.
  add('turretDetail',cylY(.10,.15,.39,P.q?24:14),.71,2.89,-1.02);
  for(const x of [.60,.82])add('turretDetail',box(.045,.18,.28),x,3.01,-1.02);
  const roofGun=FITTINGS.pintleMG({mats:P.mats,cls:'mag',tone:'two-tone',ammo:true,seed:4017});
  roofGun.position.set(.71-p.x,2.985-p.y,-1.01-p.z);
  P.turretG.add(roofGun);
}

function gunReceiverShoulders(P: TankBuilderPort): void {
  const p=P.turretG.position;
  // Object_27's receiver shoulders roll around the gun cradle. Sparse
  // transverse rays fit a 293.97 mm upper arc and a separate 237.51 mm
  // starboard outer ledge; the former three planes erased this transition.
  // These remain fixed turret stock around the independently pitched shroud.
  const receiverShoulder=(side:-1|1,outerLedge=false)=>{
    const centreZ=outerLedge?-.10039:-.10084;
    const centreY=(outerLedge?2.53115:2.52974)+.001;
    const radius=outerLedge?.23751:.29397;
    const bottom=side<0?2.589:2.476;
    const finalAngle=side<0?Math.asin((bottom+.008-centreY)/radius):0;
    const curveSteps=P.q?9:5;
    const outerBase=side<0?-.341:(outerLedge?.613:.555);
    const outerTop=side<0?-.3275:(outerLedge?.599:.5373);
    const inner=(z:number)=>outerLedge?.535:side<0
      ?(z<=-.22?-.2512:z>=-.15?-.2198:-.2512+(z+.22)/.07*.0314)
      :(z<=-.22?.4612:z>=-.15?.4297:.4612-(z+.22)/.07*.0315);
    const station=(z:number,top:number):SolidSection=>{
      const inside=inner(z);
      const outside=outerTop+(outerBase-outerTop)*(centreY+radius-top)/(centreY+radius-bottom);
      const ring=side<0?[[outerBase,bottom],[inside,bottom],[inside,top],[outside,top]]
        :[[inside,bottom],[outerBase,bottom],[outside,top],[inside,top]];
      return {z:z-p.z,ring:ring.map(([x,y])=>[x-p.x,y-p.y] as const)};
    };
    const sections=[station(-.524,2.696),station(-.476,centreY+radius-.002),station(centreZ,centreY+radius)];
    for(let i=1;i<=curveSteps;i++) {
      const angle=Math.PI/2-(Math.PI/2-finalAngle)*i/curveSteps;
      sections.push(station(centreZ+Math.cos(angle)*radius,centreY+Math.sin(angle)*radius));
    }
    P.add('turret',sectionSolid(sections));
  };
  receiverShoulder(-1);receiverShoulder(1);receiverShoulder(1,true);
}

function smokeReceiverBracket(add: EquipmentAdder, side: number, upper: boolean, yaw: number): void {
      const y=side<0?(upper?2.700:2.527):(upper?2.558:2.385);
      const x=side<0?(upper?-1.087:-1.083):(upper?.991:.987);
      const z=side<0?.245:.192;
      add('turretDetail',box(.166,.173,upper?.084:.064)
        .rotateX(upper?-.332:-.50).rotateY(yaw),x,y,z);
}

function smokeSocket(P: TankBuilderPort, add: EquipmentAdder, side: number, i: number): void {
      const col=i%2,row=Math.floor(i/2),stagger=row%2;
      const x=side<0
        ?(col===0?-1.27+stagger*.03:-1.14-stagger*.015)
        :(col===0?1.092+stagger*.01:1.201-stagger*.035);
      const y=(side<0?2.554:2.416)+row*.094;
      const z=side<0
        ?(col===0?.278+stagger*.02:.430-stagger*.03)
        :(col===0?.380-stagger*.045:.180+stagger*.03);
      // Keep the measured cap stations. Each stagger has its own measured
      // axis: the +X outer column points almost sideways, not forward.
      const axis=smokeSocketAxis(side,col,stagger);
      const direction=new Vector3(...axis).normalize();
      const rotation=new Quaternion().setFromUnitVectors(new Vector3(0,0,1),direction);
      const socket=(radius:number,length:number,back:number,bucket='turretDetail')=>
        add(bucket,cylZ(radius,length,P.q?16:10).applyQuaternion(rotation),
          x-direction.x*back,y-direction.y*back,z-direction.z*back);
      socket(.039,.215,.1075);
      socket(.0465,.061,.027);
      socket(.037,.015,0,'turretDark');
}

function smokeSocketAxis(side: number, col: number, stagger: number): [number,number,number] {
  return side<0
        ?(col===0?(stagger?[-.743,.465,.482]:[-.880,.423,.218])
          :(stagger?[-.550,.465,.694]:[-.299,.423,.855]))
        :(col===0?(stagger?[.681,.465,.565]:[.468,.423,.776])
          :(stagger?[.826,.465,.319]:[.905,.423,.032]));
}

export function buildAjaxX(P:TankBuilderPort):void {
  // Measured fixed armor extends the shadow silhouette; omit small fittings.
  P.additionalShadowSources = {
    hull: ['hullExternalArmor'],
  };
  P.hullG.position.set(0,0,0);P.turretG.position.set(-.05,2.10,-1.05);P.gunG.position.set(.05,.406,1.72);
  hull(P);gear(P);turret(P);P.topY=2.695-2.10;
  preserveSourceStudyGunMountAppearance(P);
  P.hullG.userData.xRebuild={candidate:'ajax_x',independent:true,sourceLocalOnly:true,datumVersion:1};
}
