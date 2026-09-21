import { preserveSourceStudyGunMountAppearance } from './sourceStudyGunMount.ts';
// Authored Griffin 50 mm study: native solids, mechanisms and material roles.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { lathedWheelSection, type AxialWheelStation } from './lathedWheelStock.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { GRIFFIN_HULL_LENGTH_SCALE as H, lengthenGriffinHull, reduceGriffinTurret } from './griffinProportions.ts';

const { box, cylX, cylY, cylZ, torus } = KIT;

type EquipmentAdder = (bucket: string, geometry: ReturnType<typeof box>,
  x: number, y: number, z: number, rx?: number, ry?: number, rz?: number) => void;

function opticalPod(width:number,height:number,depth:number) {
  const x=width/2,y=height/2,c=Math.min(width,height)*.20;
  const ring=[[-x+c,-y],[x-c,-y],[x,-y+c],[x,y-c],[x-c,y],[-x+c,y],[-x,y-c],[-x,-y+c]] as const;
  return sectionSolid([{z:-depth/2,ring},{z:depth/2,ring}]);
}

// Analytic capsule stock. Width/height/depth are independent source measurements.
function capsuleCase(width:number,height:number,depth:number,segments:number) {
  const r=height/2,halfStraight=(width-height)/2;
  const ring:[number,number][]=[];
  for(const [cx,start] of [[halfStraight,-Math.PI/2],[-halfStraight,Math.PI/2]])
    for(let i=0;i<=segments;i++) {
      const a=start+i*Math.PI/segments;
      ring.push([cx+Math.cos(a)*r,Math.sin(a)*r]);
    }
  return sectionSolid([{z:-depth/2,ring},{z:depth/2,ring}]);
}

function deckPlate(width:number,depth:number,thickness:number) {
  return opticalPod(width,depth,thickness).rotateX(Math.PI/2);
}

function hull(P: TankBuilderPort): void {
  const s=(z:number,half:number,portRoof:number,floor:number,starboardRoof=portRoof):SolidSection=>({z,ring:[
    [-1.1396,floor],[1.1396,floor],[1.1396,Math.max(floor,1.403)],
    [half,Math.max(floor,Math.min(1.403,starboardRoof))],[half,starboardRoof],
    [-half,portRoof],[-half,Math.max(floor,Math.min(1.403,portRoof))],[-1.1396,Math.max(floor,1.403)],
  ]});
  // Source Object_20's belly stays nearly level to the bow knee. Its aft
  // central plate is recessed between the two separate equipment wings.
  const body=sectionSolid([
    s(-2.30,1.7295,2.1091,.5757),s(.89,1.7295,2.1091,.5688),
    s(1.30,1.70,2.109,.5679,2.033),s(1.78,1.70,1.954,.5669,1.938),
    s(2.7383,1.7285,1.6462,.5656),s(3.4648,1.7285,1.405,1.401),
  ]);
  const bodyPositions=body.getAttribute('position');
  for(let i=0;i<bodyPositions.count;i++)if(Math.abs(bodyPositions.getZ(i)+2.30)<1e-5)
    bodyPositions.setZ(i,-2.1777-(bodyPositions.getY(i)-.5754)*.0813);
  body.computeVertexNormals();P.add('hull',body);
  for(const side of [-1,1]) {
    hullSkirtPanels(P, side);
    const wing=(z:number,bottom:number):SolidSection=>{
      const ring=[[.8645,bottom],[1.729,bottom],[1.729,2.1091],[.8645,2.1091]]
        .map(([x,y])=>[side*x,y] as [number,number]);
      if(side<0)ring.reverse();return {z,ring};
    };
    const wings=[wing(-3.0234,1.4743),wing(-2.5527,1.1833),
      wing(-2.418,1.1833),wing(-2.2656,1.6335)];
    P.add('hull',sectionSolid(wings));
    P.addEquipment('hullDetail',deckPlate(.829,.664,.025),side*1.282,2.122,-2.666);
    for(const [lampX,lampY,r] of [[1.419,1.299,.072],[1.256,1.261,.072]]) {
      P.addEquipment('hullDetail',cylZ(r+.016,.062,P.q?20:12),side*lampX,lampY,3.444);
      P.addEquipment('hullGlass',cylZ(r,.009,P.q?20:12),side*lampX,lampY,3.477);
    }
    // The source towing eyes stand in the YZ plane: only 55 mm across X.
    P.addEquipment('hullDetail',box(.0552,.2373,.037),side*1.0105,1.28245,3.3310);
    P.addEquipment('hullDetail',torus(.06515,.0276,P.q?24:16,8)
      .rotateZ(Math.PI/2).scale(1,1.27925,1),side*1.0105,1.28245,3.40525);
    // Object_20 lifting eyes are the source's outermost width datum. Their
    // actual receiving side is X ±1.7295 m, measured separately from the eye.
    const eye=torus(.107,.014,P.q?24:14,8).rotateZ(Math.PI/2)
      .scale(1,1,1.198).rotateY(side*.555);
    P.addEquipment('hullDetail',eye,side*1.8174,1.9118,-2.1514);
    P.addEquipment('hullDetail',box(.031,.110,.118),side*1.7295,1.843,-2.240);
    // Object_20's rear guards curve down behind the idler. Their receiving
    // lip is at Y1.4733, not the former low floating rectangular apron.
    const flap=(z:number,low:number,high:number):SolidSection=>({z,ring:[
      [-.271,low],[.271,low],[.271,high],[-.271,high],
    ]});
    P.addMudguard('griffin-rear-flap-'+side,'hullRubber',sectionSolid([
      flap(-2.3896,1.2233,1.2350),flap(-2.333,1.3190,1.3330),
      flap(-2.280,1.3990,1.4120),flap(-2.2529,1.4350,1.4733),
    ]),side*1.4409,0,0);

  }
  hullDeckCovers(P);
  rearDoorAndPlatform(P);

  for(const x of [-.55,.55])P.addEquipment('hullDetail',box(.09,.045,.27),x,1.79,2.29,-.24);
}

function gear(P:TankBuilderPort):void {
  // Object_23 scalar rays: centre cap 0.2206, recessed web 0.0796 and
  // tire face 0.2735 metres from the axle mid-plane. No capped overlay.
  const section:AxialWheelStation[]=P.q?[
    [.030,0],[.2206,0],[.2206,.038],[.195,.055],[.164,.077],
    [.0796,.090],[.0796,.241],[.2735,.249],[.2735,.251],
    [.014,.251],[.030,.239],
  ]:[
    [.030,0],[.2206,0],[.2206,.038],[.164,.077],
    [.0796,.090],[.0796,.241],[.2735,.249],[.2735,.251],[.014,.251],[.030,.239],
  ];
  const core=KIT.mergeAll([
    lathedWheelSection(section,P.q?24:12),
    lathedWheelSection(section.map(([x,r])=>[-x,r]),P.q?24:12),
    cylX(.07,.08,P.q?18:10),
  ]);
  P.gear=KIT.buildRunningGear(P,{
    style:'rubber',wheelPattern:'armored-hub-six',trackPattern:'compact-ifv',
    trackShoeBuilder:buildFleetTrackShoe,
    wheelR:.3225,wheelW:.547,wheelY:.4235,
    wheelTireBands:[
      {centerM:-.1424,widthM:.2622,innerRadiusM:.250},
      {centerM:.1424,widthM:.2622,innerRadiusM:.250},
    ],
    wheelCoreGeometry:{disc:core},
    wheelZs:[-1.4585,-.7285,.0015,.7315,1.4885,2.2185].map(z=>z*H),
    xc:1.4345,trackW:.575,trackTh:.032,
    trackShoeDimensions:{padHeight:.034,grouserHeight:.008,webHeight:.026,hornHeight:.08,pinRadius:.014},
    sprocket:{z:2.8175*H,y:.9715,r:.3665},idler:{z:-1.9865*H,y:.997,r:.2615},
    rollers:[-1.10,.12,1.38,2.14].map(z=>({z:z*H,y:1.18,r:.096})),
    rollerR:.096,topY:1.31,botY:.054,coveredTop:true,paintedEnds:true,
    arms:true,dedupeLoopPoints:true,fitLoadedRun:true,
  });
}

function turret(P:TankBuilderPort):void {
  const p=P.turretG.position;
  const add=(b:string,g:ReturnType<typeof box>,x:number,y:number,z:number,rx=0,ry=0,rz=0)=>
    P.addEquipment(b,g,x-p.x,y-p.y,z-p.z,rx,ry,rz);
  // Sparse body planes measured independently of the equipment bounds. The
  // rear roof slopes down to the antenna bases; the front cheeks taper in plan.
  const s=(z:number,w:number,roof:number):SolidSection=>({z:z-p.z,ring:[
    [-w*.96,2.1705-p.y],[w*.96,2.1705-p.y],[w,2.37-p.y],
    [w,roof-p.y],[-w,roof-p.y],[-w,2.37-p.y],
  ]});
  P.add('turret',sectionSolid([
    s(-1.818,.815,2.679),s(-1.50,1.16,2.760),s(-1.16,1.51,2.846),
    s(-.50,1.51,3.0115),s(-.02,1.51,3.0105),
  ]));
  P.add('turret',cylY(1.145,1.145,.225,P.q?40:24),0,2.112-p.y,-.35-p.z);
  for(const side of [-1,1]) {
    turretCheek(P, side);
    turretSideCasesAndSmoke(P, add, side);
    turretTwinSensorHead(P, add, side);
  }
  turretOpticalReceivers(P, add);
  add('turretDetail',cylY(.175,.214,.080,P.q?24:14),.770,3.006,.436);
  add('turretDetail',box(.287,.120,.287),.770,3.108,.429);
  turretRoofEquipment(P, add);
  turretGunCorridor(P);
  // The source flared jacket narrows from the trunnion into the bare tube.
  // The jacket and trunnion pitch as a cradle; the tube slides inside it.
  const gunSections=[
    [.553,.1745,2.599,.1745],[.90,.153,2.608,.157],
    [1.50,.125,2.6244,.1249],[1.74,.068,2.600,.068],
  ];
  P.addGunExtra(sectionSolid(gunSections.map(([z,rx,y,ry])=>({z:z-.74,ring:
    Array.from({length:P.q?24:12},(_,i)=>{
      const a=i*Math.PI*2/(P.q?24:12);return[Math.cos(a)*rx,y-2.6+Math.sin(a)*ry] as const;
    })}))));
  P.addGunExtra(cylX(.147,.405,P.q?24:14),0,0,-.096);
  P.add('gun',cylZ(.067,2.93194,P.q?32:18),0,0,1.46597);
  P.add('gunDark',cylZ(.061,.19,P.q?32:18),0,0,2.83694);
  if(P.q)for(let i=0;i<4;i++)P.add('gunDark',torus(.061,.006,20,5).rotateX(Math.PI/2),0,0,2.765+i*.04);
  P.muzzleZ=2.93194;
}

function hullSkirtPanels(P: TankBuilderPort, side: number): void {
    // Three upper skirt panels and seven separate lower aprons follow the
    // source's hinge stations; the apron bottoms cover the wheel shoulders.
    const panel=(z:number,bottom:number,top:number,xc:number,half:number):SolidSection=>({
      z,ring:[[xc-half,bottom],[xc+half,bottom],[xc+half,top],[xc-half,top]],
    });
    // Continuous inner rail seats each skirt on the hull above the shoe run.
    P.add('hull',box(.20,.09,5.443),side*1.697,1.442,.4795);
    const upperRuns=[[-2.242,-1.526,-.122],[-.115,-.115,1.633],[1.637,2.358,3.201]];
    for(let i=0;i<upperRuns.length;i++) {
      const [a,b,c]=upperRuns[i];
      const stations=i===0?[[a,1.206],[b,.757],[c,.757]]:
        i===2?[[a,.757],[b,.757],[c,1.206]]:[[a,.752],[c,.752]];
      P.addExternalArmor('hull',sectionSolid(stations.map(([z,bottom])=>
        panel(z,bottom,1.459,side*1.777,.023))));
    }
    const apronEdges=[-2.242,-1.526,-.841,-.116,.730,1.628,2.354,3.201];
    for(let i=0;i<apronEdges.length-1;i++) {
      const a=apronEdges[i]+.003,b=apronEdges[i+1]-.003;
      P.addEquipment('hullDetail',sectionSolid([
        panel(a,i===0?.91:.323,i===0?1.206:.79,side*1.803,.014),
        panel(b,i===6?.91:.323,i===6?1.206:.79,side*1.803,.014),
      ]));
    }
    for(const z of [-2.20,-1.78,-.95,-.12,.82,1.633,2.44,3.18])
      P.addEquipment('hullDetail',box(.052,.049,.155),side*1.783,1.418,z);
    for(const z of [-.11,1.633])
      P.addEquipment('hullDetail',cylX(.078,.025,6),side*1.82,.866,z);
    if(side<0) {
      // Object_20 has one closed service cover here, not exposed grille fins.
      P.addEquipment('hullDetail',sectionSolid([
        panel(.635,1.493,2.017,-1.751,.0215),
        panel(1.936,1.493,1.786,-1.751,.0215),
      ]));
      for(const z of [.73,1.80])
        P.addEquipment('hullDetail',box(.052,.044,.085),-1.766,1.55,z);
    }
}

function hullDeckCovers(P: TankBuilderPort): void {
  // Polygonal driver cover follows the shallow starboard deck plane.
  P.addHatch('hullDetail',deckPlate(.869,.744,.041),.7825,2.040,1.328,.186);
  for(const x of [.36,.70,1.04,1.25]) {
    P.addEquipment('hullDetail',box(.19,.065,.16),x,1.993,1.715,.186);
    P.addEquipment('hullGlass',box(.14,.026,.012),x,1.988,1.793,.186);
  }
  for(const x of [.47,1.06])P.addEquipment('hullDetail',box(.12,.045,.085),x,2.096,.985);
  P.addEquipment('hullDetail',deckPlate(.487,.512,.037),-1.435,2.122,1.029);
  P.addEquipment('hullDetail',deckPlate(.402,.418,.014),-1.434,2.140,1.028);
  // The source deck rises locally around the large port engine access panel.
  P.add('hull',sectionSolid([
    {z:.74,ring:[[-1.101,2.025],[.303,2.025],[.303,2.119],[-1.101,2.119]]},
    {z:1.30,ring:[[-1.101,2.025],[.303,2.025],[.303,2.132],[-1.101,2.132]]},
  ]));
  P.addEquipment('hullDetail',deckPlate(1.348,.505,.008),-.399,2.132,1.025,-.023);
  for(const x of [-.982,.253])P.addEquipment('hullDetail',box(.15,.035,.044),x,2.154,.816);
  // The broad raised port access cover is a closed deck panel with two hinges.
  P.addEquipment('hullDetail',deckPlate(1.240,.342,.043),-.419,2.063,1.561,.186);
  for(const x of [-.93,.10])P.addEquipment('hullDetail',box(.095,.043,.060),x,2.118,1.407);
}

function rearDoorAndPlatform(P: TankBuilderPort): void {
  // Assembled source door: chamfered plate follows the measured rear slope.
  const doorRing:[number,number][]=[[-.6682+.09,-.6876],[.6682-.09,-.6876],
    [.6682,-.6876+.09],[.6682,.6876-.075],[.6682-.075,.6876],
    [-.6682+.075,.6876],[-.6682,.6876-.075],[-.6682,-.6876+.09]];
  const door=sectionSolid([{z:-.025,ring:doorRing},{z:.025,ring:doorRing}]);
  P.addEquipment('hullDetail',door,.090218,1.335243,-2.253923,-.08017);
  P.addEquipment('hullGlass',box(.4756,.1839,.008),.090218,1.824093,-2.30412,-.08017);
  P.addEquipment('hullDetail',cylZ(.1001,.039,P.q?24:14),.090218,1.597843,-2.3279,-.08017);
  for(const [y,z]of[[.83169,-2.26127],[1.83969,-2.34157]])
    P.addEquipment('hullDetail',box(.1964,.0437,.0769),-.53538,y,z);
  P.addEquipment('hullDetail',box(.0354,.2981,.0484),.68232,1.48699,-2.34812);
  // The port rear lamp, not the central door, defines the source stern tip.
  P.addEquipment('hullDetail',cylZ(.0723,.1074,P.q?24:14),-1.62305,1.9333,-3.0537);
  // Source starboard rear platform has a rounded projecting end. It is
  // distinct from the port lamp and meets the underside of the fixed wing.
  const rearPlatform=new THREE.Shape();
  rearPlatform.moveTo(-.1865,-.0381);rearPlatform.lineTo(.1865,-.0381);
  for(let i=0;i<=8;i++) {
    const angle=i*Math.PI/8;
    rearPlatform.lineTo(.1865*Math.cos(angle),.1865*Math.sin(angle));
  }
  rearPlatform.closePath();
  P.addEquipment('hullDetail',new THREE.ExtrudeGeometry(rearPlatform,
    {depth:.0909,bevelEnabled:false,steps:1,curveSegments:1}).rotateX(-Math.PI/2),
    1.5371,1.3815,-2.9072);
}

function turretCheek(P: TankBuilderPort, side: number): void {
  const p=P.turretG.position;
    const cheek=(z:number,outerBottom:number,outerTop:number,bottom:number,roof:number):SolidSection=>{
      const out=[[.383,bottom],[outerBottom,bottom],[outerTop,roof],[.383,roof]]
        .map(([x,y])=>[side*x,y-p.y] as const);
      if(side<0)out.reverse();return {z:z-p.z,ring:out};
    };
    const stations=[[-.04,1.51,1.51,2.17,3.0105],[.30,1.51,1.51,2.17,2.9975],
      [.60,1.51,1.392,2.17,2.9725],[.85,1.365,1.207,2.2995,2.9415],
      [1.00,1.211,1.080,2.362,2.923],[1.15,1.125,.994,2.423,2.793],
      [1.268,.986,.985,2.469,2.479]];
    if(side<0)P.add('turret',sectionSolid(stations.map(([z,a,b,c,d])=>cheek(z,a,b,c,d))));
    else {
      // The lower sight sits in a source pocket, not on the outer sloping
      // cheek: X .545–1.002, rear wall Z .6656, floor near Y 2.592.
      // Clip only this independently authored cheek stock into closed jambs
      // and a floor; retain its original outer facets and the opposite cheek.
      const rear=.6656,t=(rear-.60)/(.85-.60);
      stations.splice(3,0,stations[2].map((v,i)=>v+(stations[3][i]-v)*t));
      for(let i=0;i<stations.length-1;i++) {
        const a=stations[i],b=stations[i+1];
        if(b[0]<=rear+1e-8){P.add('turret',sectionSolid([cheek(...a as [number,number,number,number,number]),cheek(...b as [number,number,number,number,number])]));continue;}
        const points=[a,b].flatMap(([z,outerBottom,outerTop,bottom,roof])=>[
          new THREE.Vector3(.383,bottom,z),new THREE.Vector3(outerBottom,bottom,z),
          new THREE.Vector3(outerTop,roof,z),new THREE.Vector3(.383,roof,z),
        ]);
        const clip=(input:THREE.Vector3[],plane:(v:THREE.Vector3)=>number)=>{
          const kept=input.filter(v=>plane(v)>=-1e-9);
          for(let j=0;j<input.length;j++)for(let k=j+1;k<input.length;k++){
            const da=plane(input[j]),db=plane(input[k]);
            if((da<0)!==(db<0))kept.push(input[j].clone().lerp(input[k],da/(da-db)));
          }
          return [...new Map(kept.map(v=>[v.toArray().map(n=>Math.round(n*1e7)).join(','),v])).values()];
        };
        const cells=[clip(points,v=>.545-v.x),clip(points,v=>v.x-1.002),
          clip(clip(clip(points,v=>v.x-.545),v=>1.002-v.x),v=>2.5881+.0056*v.z-v.y)];
        for(const cell of cells){
          if(cell.length<4)continue;
          const g=new ConvexGeometry(cell.map(v=>v.clone().sub(p)));
          const pos=g.getAttribute('position'),uv=[];
          for(let j=0;j<pos.count;j++)uv.push(pos.getX(j),pos.getZ(j));
          g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));P.add('turret',g);
        }
      }
    }
}

function turretSideCasesAndSmoke(P: TankBuilderPort, add: EquipmentAdder, side: number): void {
    // Oval side cases sit on the measured diagonal faces, rather than being
    // swallowed by a rectangular cheek extension.
    for(const [x,y,z,w,h,yaw,pitch] of [
      [1.3105,2.5865,.871,.57,.397,.93,-.20],
      [1.1985,2.379,-1.5125,.62,.364,2.43,0],
    ]) {
      add('turretDetail',capsuleCase(w,h,.12,P.q?12:7),side*x,y,z,pitch,side*yaw);
      add('turretDetail',capsuleCase(w-.035,h-.035,.018,P.q?12:7),
        side*(x+Math.sin(yaw)*.067),y-Math.sin(pitch)*.067,z+Math.cos(yaw)*.067,pitch,side*yaw);
      // Narrow retaining strap visible across each source casing.
      add('turretDetail',box(.032,h+.012,.035),side*(x+Math.sin(yaw)*.084),
        y-Math.sin(pitch)*.084,z+Math.cos(yaw)*.084,pitch,side*yaw);
    }
    const smokeStations=[[1.187,2.336,1.157],[1.200,2.249,1.098],[1.156,2.411,1.111],[1.248,2.352,1.044]];
    for(const [x,y,z] of smokeStations) {
      add('turretDetail',cylZ(.048,.157,P.q?16:10),side*x,y,z,-.37,side*.56);
      add('turretDark',cylZ(.033,.008,P.q?16:10),side*(x+.043),y+.029,z+.065,-.37,side*.56);
    }
}

function turretTwinSensorHead(P: TankBuilderPort, add: EquipmentAdder, side: number): void {
    // Two short tubes in a forked head. Object_11 has two tube components per
    // head; the source's three visible horizontal edges are not three barrels.
    const x=side<0?-.780:1.134,z=side<0?.801:-1.194,dy=side<0?0:-.1064;
    const baseY=side<0?2.9925:2.8685,baseH=side<0?.145:.165;
    add('turretDetail',cylY(.177,.214,baseH,P.q?24:14),x,baseY,z);
    add('turretDetail',cylY(.102,.145,.160,P.q?20:12),x,3.134+dy,z);
    add('turretDetail',cylY(.071,.080,.033,P.q?18:10),x,3.217+dy,z);
    add('turretDetail',capsuleCase(.320,.169,.200,P.q?10:6).rotateZ(Math.PI/2),x,3.382+dy,z);
    for(const dx of [-.1,.1])
      add('turretDetail',opticalPod(.033,.257,.190),x+dx,3.410+dy,z);
    add('turretDetail',cylX(.075,.262,P.q?18:10),x,3.410+dy,z);
    for(const rawY of [3.3185,3.422]) {
      add('turretDetail',cylZ(.040,.337,P.q?18:10),x,rawY+.029+dy,z+.0315);
      add('turretDark',cylZ(.026,.007,P.q?16:10),x,rawY+.029+dy,z+.204);
    }
}

function turretOpticalReceivers(P: TankBuilderPort, add: EquipmentAdder): void {
  // Object_18 receiving bodies are deep rectangular stock inside rounded
  // side brackets. Object_6/24 contain four separate lenses per face.
  // These are independent scalar sections, not source mesh topology.
  for(const lower of [false,true]) {
    const dy=lower?-.56801:0,dz=lower?.4586:0;
    const addAt=(slot:string,g:THREE.BufferGeometry,x:number,y:number,z:number)=>
      add(slot,g,x,y+dy,z+dz);
    const bodyBack=lower?.2908:.2911,bodyFront=.5636;
    addAt('turretDetail',box(.2945,.2334,bodyFront-bodyBack),.77075,3.37723,(bodyBack+bodyFront)/2);
    // Rounded U-bracket cheeks, each 52 mm thick, terminate in the source's
    // narrow foot. The central space remains open around the receiving body.
    const ring:[number,number][]=[[.09425,3.15803],[-.09425,3.15803]];
    for(let i=0;i<=16;i++) {
      const a=-Math.PI/6+i*(4*Math.PI/3)/16;
      ring.push([-.1089*Math.cos(a),3.39143+.1103*Math.sin(a)]);
    }
    ring.reverse();
    for(const [x0,x1]of [[.5684,.6206],[.9199,.9722]]) {
      const bracket=sectionSolid([{z:x0,ring},{z:x1,ring}]).rotateY(Math.PI/2);
      addAt('turretDetail',bracket,0,0,.4354);
    }
    addAt('turretDetail',box(.2319,.0576,.2906),.77025,3.18683,.4354);
    // Front frame has real cutouts. A solid face overlay would bury the three
    // shallow windows and erase the source's circular lower receiver.
    const frame=new THREE.Shape();
    frame.moveTo(.6392,3.27223);frame.lineTo(.9023,3.27223);
    frame.lineTo(.9023,3.48123);frame.lineTo(.6392,3.48123);frame.closePath();
    const windows=[
      {x:.70485,y:3.44268,w:.0825,h:.0479,z:.5694},
      {x:.83910,y:3.44268,w:.0796,h:.0479,z:.5699},
      {x:.83860,y:3.33868,w:.0776,h:.1055,z:.5699},
    ];
    for(const {x,y,w,h}of windows) {
      const hpath=new THREE.Path();hpath.moveTo(x-w/2,y-h/2);
      hpath.lineTo(x-w/2,y+h/2);hpath.lineTo(x+w/2,y+h/2);
      hpath.lineTo(x+w/2,y-h/2);hpath.closePath();frame.holes.push(hpath);
    }
    const circular=new THREE.Path();circular.absellipse(.70485,3.33868,.05055,.05075,0,Math.PI*2,true,0);
    frame.holes.push(circular);
    const face=new THREE.ExtrudeGeometry(frame,{depth:.0083,bevelEnabled:false,steps:1,curveSegments:P.q?16:8});
    addAt('turretDetail',face,0,0,.5636);
    for(const {x,y,w,h,z}of windows) {
      addAt('turretDark',box(w,h,.0024),x,y,.5648);
      addAt('turretGlass',box(w-.007,h-.004,z-.566),x,y,(z+.566)/2);
    }
    // Convex glass section preserves the measured .0507 / .0451 / .0357
    // radii and 4.9 mm depth. The surrounding frame keeps its aperture open.
    const lensSection:AxialWheelStation[]=[
      [.5688,0],[.5688,.05065],[.5689,.05065],[.5724,.04505],[.5738,.03565],[.5738,0],
    ];
    const lens=lathedWheelSection(lensSection,P.q?32:16).rotateY(-Math.PI/2);
    addAt('turretGlass',lens,.70485,3.33868,0);
  }
}

function turretRoofEquipment(P: TankBuilderPort, add: EquipmentAdder): void {
  const p=P.turretG.position;
  // Source roof service plates follow its sloped rear roof instead of discs.
  for(const side of [-1,1]) {
    add('turretDetail',deckPlate(.476,.433,.016),side*.931,3.021,-.276);
    for(const z of [-1.12,-.78]) {
      const y=2.851+(z+1.16)*.251;
      add('turretDetail',deckPlate(.67,.31,.018),side*.375,y+.041,z,-.247);
      for(const dx of [-.17,.17])add('turretDetail',cylY(.079,.079,.035,P.q?18:10),side*.375+dx,y+.07,z);
    }
  }
  // Elevated weapon cradle retains the real open fork and the shared M2 rig.
  add('turretDetail',box(.198,.090,.203),0,3.042,-.239);
  add('turretDetail',box(.445,.153,.240),0,3.163,-.239);
  for(const x of [-.165,.162])add('turretDetail',box(.104,.40,.240),x,3.437,-.239);
  for(const x of [-.238,.236])add('turretDetail',box(.045,.428,.488),x,3.493,-.034);
  add('turretDetail',box(.330,.207,.123),0,3.476,-.056);
  const roofGun=FITTINGS.pintleMG({mats:P.mats,cls:'m2',scale:1.28,tone:'two-tone',ammo:false,seed:5017});
  roofGun.position.set(-p.x,3.32-p.y,-.37-p.z);
  P.turretG.add(roofGun);
  for(const [x,top] of [[-.696,4.702],[.696,4.399]]) {
    add('turretDetail',cylY(.084,.111,.397,P.q?18:10),x,2.938,-1.698);
    add('turretDetail',cylY(.010,.017,top-3.1365,8),x,(top+3.1365)/2,-1.698);
  }
}

function turretGunCorridor(P: TankBuilderPort): void {
  const p=P.turretG.position;
  // Object_3 is the fixed corridor cover behind the moving cradle, not a
  // narrow barrel cylinder. Its front sides leave the real barrel air clear.
  const bridge=(z:number,low:number,top:number):SolidSection=>({z:z-p.z,
    ring:[[-.3755,low-p.y],[.3755,low-p.y],[.3755,top-p.y],[-.3755,top-p.y]]});
  P.add('turret',sectionSolid([bridge(-.024,2.4099,3.0042),bridge(.49,2.4099,2.9609)]));
  for(const side of [-1,1]) {
    const cheek=(z:number,inner:number,low:number,top:number):SolidSection=>{
      const ring=[[inner,low],[.3755,low],[.3755,top],[inner,top]]
        .map(([x,y])=>[side*x,y-p.y] as const);
      if(side<0)ring.reverse();return{z:z-p.z,ring};
    };
    P.add('turret',sectionSolid([
      cheek(.48,.177,2.4099,2.9617),cheek(.60,.177,2.4339,2.7620),
      cheek(.71,.177,2.481,2.685),
    ]));
  }
}

export function buildGriffin50Chassis(P: TankBuilderPort): void {
  P.additionalShadowSources = { hull: ['hullExternalArmor'] };
  P.hullG.position.set(0, 0, 0);
  hull(P); lengthenGriffinHull(P); gear(P);
}

export function buildGriffin50X(P:TankBuilderPort):void {
  // Measured fixed armor extends the shadow silhouette; omit small fittings.
  P.additionalShadowSources = {
    hull: ['hullExternalArmor'],
  };
  P.hullG.position.set(0,0,0);P.turretG.position.set(0,2.07,-.36);P.gunG.position.set(0,.53,1.10);
  buildGriffin50Chassis(P);turret(P);P.topY=3.01-2.07;
  preserveSourceStudyGunMountAppearance(P);
  reduceGriffinTurret(P);
  P.hullG.userData.xRebuild={candidate:'griffin50_x',independent:true,sourceLocalOnly:true,datumVersion:1};
}
