import { weaponAssembly } from './weaponStock.ts';
import { preserveSourceStudyGunMountAppearance } from './sourceStudyGunMount.ts';
// Independent first-party construction of the supplied wide-cage MILAN fit.
// Source meshes remain local comparison inputs; no source vertices are used.
import { BoxGeometry, Mesh, Shape, Path, ExtrudeGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { WARRIOR_TIRE_BANDS, warriorRoadWheelCore } from '../nationWheelConstructions.ts';

const { box, cylX, cylY, cylZ, torus } = KIT;

type EquipmentAdder = (bucket: string, geometry: ReturnType<typeof box>,
  x: number, y: number, z: number, rx?: number, ry?: number, rz?: number) => void;
type CageBar = (w:number,h:number,d:number,x:number,y:number,z:number,ry?:number) => number;
type CagePiece = (g:ReturnType<typeof box>,x:number,y:number,z:number,ry?:number) => number;

function clippedPlate(width:number,height:number,depth:number,cut:number) {
  const x=width/2,y=height/2,ring=[[-x+cut,-y],[x-cut,-y],[x,-y+cut],
    [x,y-cut],[x-cut,y],[-x+cut,y],[-x,y-cut],[-x,-y+cut]] as const;
  return sectionSolid([{z:-depth/2,ring},{z:depth/2,ring}]);
}

/** Object_27's real rear door cage and two curved corner cages. */
function rearCage(P:TankBuilderPort):void {
  const parts:BoxGeometry[]=[];
  const bar=(w:number,h:number,d:number,x:number,y:number,z:number,ry=0)=>
    parts.push(new BoxGeometry(w,h,d).rotateY(ry).translate(x,y,z));
  for(const x of [-.571,.604])bar(.011,1.21,.025,x,1.205,-2.9725);
  for(const y of [.600,1.800])bar(1.185,.011,.025,.0165,y,-2.9725);
  for(const x of [-.3025,0,.3025])bar(.011,1.20,.011,x,1.205,-2.9725);
  for(let row=0;row<19;row++)bar(1.165,.010,.025,.0165,.665+row*.060,-2.9725);
  // Door hinges and latch supports connect this slat panel to the seated
  // door. The unrelated below-ground duplicate remains a source conflict.
  for(const y of [.756,1.637])bar(.123,.050,.242,-.6395,y,-2.862);
  for(const y of [.691,1.291])bar(.045,.11,.206,.5195,y,-2.876);
  rearCornerCages(P, bar);
  const geometry=mergeGeometries(parts);for(const part of parts)part.dispose();
  if(!geometry)throw new Error('Warrior rear cage merge failed');
  const mesh=new Mesh(geometry,P.mats.detail);mesh.name='warrior_rear_slatted_cages';
  mesh.userData={appearanceRole:'fittingPaint',combatHitboxRole:'equipment',
    continuityRole:'open-lattice',sourceEquipment:'rear-door-and-corner-slats'};
  mesh.castShadow=mesh.receiveShadow=true;P.hullG.add(mesh);P.disposables.push(geometry);
}

function hullStation(z:number,half:number,roof:number,floor=.40,rightDrop=.078):SolidSection {
  // Object_21's central roof sits above the two asymmetric side ledges.
  const leftRoof=Math.min(1.04,half-.18),rightRoof=Math.min(.90,half-.18);
  const ledgeDrop=Math.max(.008,rightDrop);
  const leftDrop=Math.min(.138,Math.max(.012,roof-1.312));
  return {z,ring:[[-.94,floor],[.94,floor],[1.01,1.20],
    [half,1.29],[half,roof-ledgeDrop-.012],[Math.min(1.18,half),roof-ledgeDrop],
    [rightRoof,roof],[-leftRoof,roof],[-Math.min(1.23,half),roof-leftDrop],
    [-half,roof-leftDrop],[-half,1.29],[-1.01,1.20]]};
}

function deckPlate(width:number,depth:number,thickness:number,cut:number) {
  return clippedPlate(width,depth,thickness,cut).rotateX(-Math.PI/2);
}

function rearMudguards(P: TankBuilderPort): void {
  // Object_21 source-only sections: a thin pitched roof, two edge webs and
  // a rear lip surround real air above the track. The lip overlaps the flap;
  // the inboard web meets the existing lower hull at its forward end.
  const roof = [
    { z: -3.0879, top: .9571, bottom: .9459 },
    { z: -2.7480, top: 1.1476, bottom: 1.1329 },
    { z: -2.5605, top: 1.1486, bottom: 1.1323 },
  ];
  const rectangle = (x0:number,x1:number,y0:number,y1:number) =>
    [[x0,y0],[x1,y0],[x1,y1],[x0,y1]] as const;
  for (const side of [-1,1]) {
    const x0 = side < 0 ? -1.6016 : .9551;
    const x1 = side < 0 ? -.9570 : 1.5996;
    const prefix = `warrior-milan-rear-${side}`;
    P.addMudguard(`${prefix}-roof`, 'hull', sectionSolid(roof.map(({z,top,bottom}) =>
      ({ z, ring: rectangle(x0,x1,bottom,top) }))));
    for (const [edge,a,b] of [
      [side < 0 ? 'outboard' : 'inboard',x0,x0+.0098],
      [side < 0 ? 'inboard' : 'outboard',x1-.0098,x1],
    ] as const) {
      P.addMudguard(`${prefix}-${edge}-web`, 'hull', sectionSolid(roof.map(({z,top}) =>
        ({ z, ring: rectangle(a,b,.8126+Math.max(0,z+3.0781)*(.0503/.5176),top) }))));
    }
    P.addMudguard(`${prefix}-lip`, 'hull', box(x1-x0,.1445,.0098),
      (x0+x1)/2,.88485,-3.0830);
    // Preserve the source's lateral asymmetry and 50 mm lip overlap. Seat the
    // rubber 0.5 mm inward so its covered back face cannot fight the steel lip.
    P.addMudguard('warrior-milan-rear-flap-' + side, 'hullRubber', box(.5586,.5630,.0313),
      side < 0 ? -1.3057 : 1.3037,.5814,-3.07175);
  }
}

/** Source-measured Object_5 inner skirt rails; the corridor outside stays open. */
function sourceSideLedges(P: TankBuilderPort): void {
  const section = (side:number,z:number,inner:number,web:number,lipInner:number,outer:number,
    floor:number,top:number,under:number,lipBottom:number):SolidSection => {
    const ring = [[inner,floor],[web,floor],[web,under],[lipInner,under],
      [lipInner,lipBottom],[outer,lipBottom],[outer,top],[inner,top]]
      .map(([x,y])=>[side*x,y] as const);
    if(side<0)ring.reverse();return {z,ring};
  };
  // Three measured seams interrupt the outer flange and return lip. The
  // inner web and narrow inner shelf continue through each open notch.
  const rightTop=(z:number)=>z<=.4795?1.9005:z<=1.4639?
    1.9005-(z-.4795)*(.001/.9844):1.8995-(z-1.4639)*(.4912/1.2021);
  for(const [start,end] of [[-2.6172,-1.2451],[-1.2012,.1486],[.1921,.4578],[.5015,2.6660]]) {
    const zs=[start,...[1.4639].filter(z=>z>start&&z<end),end];
    P.add('hull',sectionSolid(zs.map(z=>{
      const t=Math.max(0,(z-1.4570)/(2.6660-1.4570));
      return section(1,z,1.5820,1.6133,1.7168,1.7275,1.1515,rightTop(z),
        1.8888-t*.4932,1.8673-t*.4912);
    })));
  }
  for(const [start,end] of [[-1.2451,-1.2012],[.1486,.1921],[.4578,.5015]])
    P.add('hull',sectionSolid([start,end].map(z=>({z,ring:[
      [1.5820,1.1515],[1.6133,1.1515],[1.6133,1.8888],
      [1.6768,1.8888],[1.6768,rightTop(z)],[1.5820,rightTop(z)],
    ]}))));
  P.add('hull',sectionSolid([
    section(-1,-2.6172,1.5977,1.6172,1.7217,1.7314,1.1583,1.9005,1.8888,1.8673),
    section(-1,1.4570,1.5977,1.6172,1.7217,1.7314,1.1583,1.9005,1.8888,1.8673),
  ]));
  const slab = (side:number,stations:readonly (readonly [number,number,number,number,number])[]) =>
    sectionSolid(stations.map(([z,inner,outer,bottom,top])=>{
      const ring=[[inner,bottom],[outer,bottom],[outer,top],[inner,top]]
        .map(([x,y])=>[side*x,y] as const);if(side<0)ring.reverse();return {z,ring};
    }));
  // The rear folded ends are solid caps. Their short diagonal edge is not a
  // licence to fill the long open underside of the J section.
  for(const side of [-1,1]) {
    const inner=side<0?1.5977:1.5820, rear=side<0?1.6074:1.6035, outer=side<0?1.7314:1.7275;
    P.add('hull',slab(side,[[-2.7656,inner,rear,.7955,1.9005],
      [-2.7148,inner,rear,.7955,1.9005],[-2.6504,inner,outer,.7955,1.9005],
      [-2.6172,inner,outer,.7955,1.9005]]));
  }
  // Left front ends sooner and turns inward. Keep its lower tongue separate
  // from the high thin web; the right-hand long slope must not be mirrored.
  P.add('hull',slab(-1,[[1.4570,1.5977,1.7314,1.8888,1.9005],
    [1.4902,1.5977,1.7314,1.8888,1.9005],
    [1.5361,1.5977,1.6924,1.8888,1.9005],
    [1.5547,1.5977,1.6074,1.8888,1.9005]]));
  P.add('hull',slab(-1,[[1.4570,1.5977,1.6172,1.1583,1.8888],
    [1.5547,1.5977,1.6074,1.1583,1.9005],
    [1.9697,1.5977,1.6074,1.1583,1.7238]]));
  P.add('hull',slab(-1,[[1.4902,1.6074,1.7314,.7955,1.8478],
    [1.5361,1.6074,1.7314,.7955,1.8478],
    [1.9170,1.6074,1.6221,.7955,1.6886]]));
  sideLedgePanels(P);
  sideLedgeServiceCover(P);

}

function hull(P: TankBuilderPort): void {
  const cageParts:ReturnType<typeof box>[]=[];
  const cage=(g:ReturnType<typeof box>,x:number,y:number,z:number,ry=0)=>
    cageParts.push(g.rotateY(ry).translate(x,y,z));
  P.add('hull', sectionSolid([
    hullStation(-2.766,1.48,1.896,.66),
    hullStation(-2.62,1.60,1.897),
    hullStation(-1.42,1.60,1.897),
    hullStation(-1.10,1.60,1.897,.40,0),
    hullStation(.94,1.60,1.897,.40,0),
    hullStation(1.45,1.56,1.897,.40,.096),
    hullStation(1.65,1.56,1.823,.40,.020),
    hullStation(3.12,1.43,1.345,.89,0),
  ]));
  P.add('hull',box(2.53,.095,.40),0,1.235,3.31,.17);
  // Real corrugated add-on armor: one closed section per long plate, with
  // genuine angled ridges, separate from the open slat cage below it.
  for (const side of [-1, 1]) {
    corrugatedSideArmor(P, side);
    for (const z of [-2.52, -1.35, -.18, .99, 2.13]) {
      P.addEquipment('hullDetail', box(.40, .065, .07), side * 1.77, 1.77, z);
      P.addEquipment('hullDetail', box(.065, .08, .18), side * 2.05, 1.86, z);
    }
    sideAndBowCage(P, cage, side);
    hullSideLights(P, side);
  }
  sourceSideLedges(P);
  rearMudguards(P);
  for(let row=0;row<4;row++)
    cage(box(2.86,.024,.027),0,1.185+row*.085,3.415);
  for(const x of [-1.43,-.70,.05,.79,1.43])
    cage(box(.027,.30,.027),x,1.33,3.415);
  // Move only existing open bars into their own semantic mesh. Their stock
  // is unchanged; solid side armor and its real stand-off air stay audited.
  const cageGeometry=mergeGeometries(cageParts);for(const part of cageParts)part.dispose();
  if(!cageGeometry)throw new Error('Warrior hull cage merge failed');
  const cageMesh=new Mesh(cageGeometry,P.mats.detail);cageMesh.name='warrior_hull_open_cage';
  cageMesh.userData={appearanceRole:'fittingPaint',combatHitboxRole:'equipment',
    continuityRole:'open-lattice',sourceEquipment:'front-and-side-slats'};
  cageMesh.castShadow=cageMesh.receiveShadow=true;P.hullG.add(cageMesh);P.disposables.push(cageGeometry);
  rearDoorStock(P);
  driverCover(P);
  bowServiceCovers(P);
  rearDeckStowage(P);

}

function gear(P: TankBuilderPort): void {
  // Object_33 has a deep plain steel web, not the generic capped six-hub face; the sparse axial/radius
  // stations are the UK IFV wheel construction (nationWheelConstructions.ts, owner 2026-09-22).
  const core=warriorRoadWheelCore(Boolean(P.q));

  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelPattern: 'armored-hub-six', trackPattern: 'compact-ifv',
    wheelR:.2991,wheelW:.3435,wheelY:.3657,
    wheelTireBands:WARRIOR_TIRE_BANDS,
    wheelCoreGeometry:{disc:core},
    wheelZs: [-1.8483, -1.0779, -.41275, .41325, 1.0787, 1.84695],
    xc: 1.296, trackW: .453, trackTh: .032,
    trackShoeBuilder:buildFleetTrackShoe,
    trackShoeDimensions:{padHeight:.034,grouserHeight:.008,webHeight:.026,hornHeight:.08,pinRadius:.014},
    sprocket: { z: 2.6847, y: .7546, r: .276 },
    idler: { z: -2.5386, y: .7681, r: .2252 },
    rollers: [{ z: -1.454, y: .9005, r: .0985 }, { z: -.003, y: .8473, r: .1537 },
      { z: 1.437, y: .9005, r: .0985 }],
    rollerR: .10, topY: 1.044, botY: .054, paintedEnds: true,
    arms: true, coveredTop: true, dedupeLoopPoints: true, fitLoadedRun: true,
  });
}

function turret(P: TankBuilderPort): void {
  const p = P.turretG.position;
  const add = (bucket: string, g: ReturnType<typeof box>, x: number, y: number, z: number,
    rx=0, ry=0, rz=0) => P.addEquipment(bucket,g,x-p.x,y-p.y,z-p.z,rx,ry,rz);
  const s = (z:number, half:number, roofHalf:number, bottom:number, roof:number):SolidSection => ({ z:z-p.z,
    ring:[[-half,bottom-p.y],[half,bottom-p.y],[half,2.18-p.y],[roofHalf,roof-p.y],[-roofHalf,roof-p.y],[-half,2.18-p.y]] });
  P.add('turret', sectionSolid([
    s(-1.15,.75,.65,1.955,2.389),s(-.80,.84,.67,1.955,2.389),
    s(.03,.80,.62,1.955,2.389),s(.49,.48,.33,2.065,2.389),
  ]));
  P.add('turret',cylY(.74,.74,.18,P.q?40:24),0,.005,0);
  turretSideFittings(P, add);
  turretHatches(P, add);
  turretPeriscopes(P, add);
  milanLauncherAndAntenna(P, add);
  turretRearStowage(P, add);
  P.addGunExtra(KIT.xform(box(.46,.39,.52),0,0,.04,-.09));
  P.add('gun',cylZ(.044,2.3793,P.q?28:16),0,0,1.18965);
  P.add('gun',cylZ(.069,.78,P.q?28:16),0,0,.55);
  P.add('gunDark',cylZ(.047,.08,P.q?28:16),0,0,2.3393);
  P.muzzleZ=2.3793;
}

function rearCornerCages(P: TankBuilderPort, bar: CageBar): void {
  for(const side of [-1,1]) {
    const centreX=side<0?-1.621:1.596,radius=.482,steps=P.q?8:5;
    for(let row=0;row<16;row++)for(let segment=0;segment<steps;segment++) {
      const a=segment*Math.PI/2/steps,b=(segment+1)*Math.PI/2/steps;
      const ax=centreX+side*radius*Math.cos(a),az=-2.768-radius*Math.sin(a);
      const bx=centreX+side*radius*Math.cos(b),bz=-2.768-radius*Math.sin(b);
      bar(.011,.010,Math.hypot(bx-ax,bz-az),(ax+bx)/2,.835+row*.065,(az+bz)/2,Math.atan2(bx-ax,bz-az));
    }
    for(const [x,z] of [[centreX+side*.470,-2.775],[centreX+side*.014,-3.236]])
      bar(.025,1.115,.025,x,1.3225,z);
    for(const [x,z] of [[centreX+side*.239,-3.236],[centreX+side*.469,-3.008]])
      bar(.011,1.105,.012,x,1.3225,z);
    for(const y of [1.190,1.600])
      bar(.30,.055,.10,side*1.60,y,-2.775);
  }
}

function sideLedgePanels(P: TankBuilderPort): void {
  // Independent scalar dimensions of the separate inset panel row. Borders
  // remain proud of the broad face; the small inter-panel gaps stay open.
  const panels = [
    [-1,-2.6172,-1.9453],[-1,-1.9404,-1.2695],[-1,-1.2637,-.5923],
    [-1,-.5864,.0850],[-1,.0925,.7637],[-1,.7725,1.4443],
    [1,-2.5977,-1.9258],[1,-1.9160,-1.2451],[1,-1.2070,-.5361],
    [1,-.5239,.1471],[1,.1921,.4578],[1,.5078,1.1787],
  ] as const;
  for(const [side,z0,z1] of panels) {
    insetSidePanel(P, side, z0, z1);
  }
  // The right forward panel continues down the slope. Its source recess is
  // blind, with a real circular mouth and a retained 44 mm back plate.
  const forwardPanel = (inset:number,depth:number,hole:boolean) => {
    const outline = [[1.207+inset,.7955+inset],[2.666-inset,.7955+inset],
      [2.666-inset,1.3907-inset],[1.459,1.8800-inset],[1.207+inset,1.8800-inset]];
    const shape=new Shape();outline.forEach(([z,y],i)=>i?shape.lineTo(-z,y):shape.moveTo(-z,y));shape.closePath();
    if(hole){const aperture=new Path();aperture.absarc(-1.8438,1.2833,.0737,0,Math.PI*2,false);shape.holes.push(aperture);}
    return new ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:P.q?16:10}).rotateY(Math.PI/2);
  };
  P.addExternalArmor('hull',forwardPanel(0,.0439,false),1.6143,0,0);
  P.addExternalArmor('hull',forwardPanel(.0154,.0430,true),1.6582,0,0);
  // Source rim stock stands 13.6 mm proud of the broad recessed face.
  const panelRim = new Shape();
  for(const [i,[z,y]] of [[1.207,.7955],[2.666,.7955],[2.666,1.3907],[1.459,1.8800],[1.207,1.8800]].entries())
    i?panelRim.lineTo(-z,y):panelRim.moveTo(-z,y);
  panelRim.closePath();const panelInset=new Path();
  for(const [i,[z,y]] of [[1.2224,.8109],[2.6506,.8109],[2.6506,1.3753],[1.459,1.8646],[1.2224,1.8646]].entries())
    i?panelInset.lineTo(-z,y):panelInset.moveTo(-z,y);
  panelInset.closePath();panelRim.holes.push(panelInset);
  P.addExternalArmor('hull',new ExtrudeGeometry(panelRim,{depth:.0566,bevelEnabled:false}).rotateY(Math.PI/2),1.6582,0,0);
  P.addExternalArmor('hull',sectionSolid([[1.207,1.88],[1.459,1.88],[2.666,1.3907]].map(([z,top])=>({
    z,ring:[[1.7128,top-.0154],[1.7175,top-.0154],[1.7175,top],[1.7128,top]],
  }))));
}

function sideLedgeServiceCover(P: TankBuilderPort): void {
  // Object_9's small service cover sits on this shoulder. Its two folded
  // retainers are actual stock above the ledge, not part of the hull plate.
  const coverY=(x:number,z:number)=>1.5499+(x+1.5100)*.621-(z-2.2350)*.142;
  P.addEquipment('hullDetail',sectionSolid([
    [2.009,.099],[2.070,.084],[2.225,.136],[2.398,.084],[2.456,.099],
  ].map(([z,width])=>{
    const centre=-1.508-(z-2.234)*.09,lo=centre-width/2,hi=centre+width/2;
    return {z,ring:[[lo,coverY(lo,z)-.012],[hi,coverY(hi,z)-.012],
      [hi,coverY(hi,z)],[lo,coverY(lo,z)]]};
  })));
  // Folded side walls of the measured cover descend inward to its hull
  // shoulder. Keep the space under the cover open between these two webs.
  for(const edge of [-1,1]) P.addEquipment('hullDetail',sectionSolid([
    [2.070,.084],[2.225,.136],[2.398,.084],
  ].map(([z,width])=>{
    const x=-1.508-(z-2.234)*.09+edge*width/2,y=coverY(x,z);
    return {z,ring:[[x-.004,y-.009],[x+.014,y-.050],
      [x+.022,y-.050],[x+.004,y-.009]]};
  })));
  for(const [dx,dy,dz] of [[0,0,0],[-.0118,-.0371,.2090]]) {
    const clamp=(z:number):SolidSection=>{
      const x=-1.5565-(z-2.064)*.05+dx,y=1.5210-(z-2.064)*.173+dy;
      return {z:z+dz,ring:[
        [x-.0165,y-.0192],[x+.0075,y-.0192],[x+.0290,y-.0043],
        [x+.0141,y+.0216],[x-.0025,y+.0216],[x-.0290,y-.0043],
      ]};
    };
    P.addEquipment('hullDetail',sectionSolid([clamp(2.0605),clamp(2.1679)]));
  }
  // Receiving edge of Object_21 below the left sloping service deck. This
  // restores the narrow outer hull shoulder without widening its roof.
  P.add('hull',sectionSolid([
    {z:1.2646,ring:[[-1.5940,1.1476],[-1.52,1.1476],[-1.52,1.600],[-1.5940,1.5548]]},
    {z:1.4697,ring:[[-1.5938,1.1476],[-1.52,1.1476],[-1.52,1.5970],[-1.5938,1.5538]]},
    {z:1.9609,ring:[[-1.5938,1.1476],[-1.50,1.1476],[-1.50,1.5379],[-1.5938,1.4793]]},
    {z:2.7578,ring:[[-1.5938,1.1476],[-1.43,1.1476],[-1.43,1.4609],[-1.5938,1.3585]]},
  ]));}

function corrugatedSideArmor(P: TankBuilderPort, side: number): void {
    const outer = [[1.91, 1.017], [2.10, 1.017], [2.10, 1.15],
      [1.97, 1.31], [2.10, 1.31], [2.10, 1.46], [1.97, 1.62],
      [2.10, 1.62], [2.10, 1.86], [1.91, 1.86]] as const;
    const ring = outer.map(([x, y]) => [side * x, y] as const);
    if (side < 0) ring.reverse();
    if(side<0) {
      // Object_27's inward upper flange ends on an oblique forward edge.
      // Replace the old flat upper contour; do not overlay another plate.
      const upper=(inner:number,top:number,scale=1)=>[
        [1.91,1.017],[2.10,1.017],[2.10,1.15],[1.97,1.31],
        [2.10,1.31],[2.10,1.46],[1.97,1.62],
        [2.10264,1.76282],[inner,top],[1.91,1.75282],
      ].map(([x,y])=>[-x,1.017+(y-1.017)*scale] as const).reverse();
      P.addExternalArmor('hull',sectionSolid([
        {z:-2.77,ring:upper(1.88184,1.86902)},
        {z:1.5407,ring:upper(1.88184,1.86902)},
        {z:1.8039,ring:upper(2.10254,1.76292)},
        {z:1.96,ring:upper(2.10254,1.76292)},
        {z:2.73,ring:upper(2.10254,1.76292,.7)},
      ]));
    } else P.addExternalArmor('hull', sectionSolid([
      { z: -2.77, ring }, { z: 1.96, ring },
      { z: 2.73, ring: ring.map(([x,y]) => [x, Math.min(y,1.017+(y-1.017)*.7)] as const) },
    ]));
}

function sideAndBowCage(P: TankBuilderPort, cage: CagePiece, side: number): void {
    for (let row = 0; row < 8; row++) {
      cage(box(.035, .024, 5.518), side * 2.095, .49 + row * .075, -.009);
    }
    for (let i = 0; i < 15; i++) {
      cage(box(.035, .57, .027), side * 2.095, .76, -2.93 + i * .405);
    }
    // Object_27 has already curved inward at z=3.30; no outer post stands there.
    for (const z of [-2.77, 2.55]) {
      cage(box(.035, 1.04, .035), side * 2.095, 1.02, z);
    }
    // The front cage wraps continuously around each corner. The bent bars
    // remain open, with a real post at each end of the quarter arc.
    const segments=P.q?8:5,radius=.665;
    for(let row=0;row<8;row++) {
      const y=.75+row*.075;
      for(let i=0;i<segments;i++) {
        const a=i*Math.PI/2/segments,b=(i+1)*Math.PI/2/segments;
        const ax=side*(1.43+radius*Math.cos(a)),az=2.75+radius*Math.sin(a);
        const bx=side*(1.43+radius*Math.cos(b)),bz=2.75+radius*Math.sin(b);
        cage(box(.026,.024,Math.hypot(bx-ax,bz-az)),
          (ax+bx)/2,y,(az+bz)/2,Math.atan2(bx-ax,bz-az));
      }
    }
    cage(box(.035,.60,.035),side*2.095,1.015,2.75);
    cage(box(.035,.60,.035),side*1.43,1.015,3.415);
}

function rearDoorStock(P: TankBuilderPort): void {
  // Object_26's actual seated door, not its displaced origin duplicate.
  P.addEquipment('hullDetail',clippedPlate(1.130,1.323,.103,.075),0,1.170,-2.7525);
  for(const y of [.756,1.637])P.addEquipment('hullDetail',box(.15,.065,.055),-.608,y,-2.766);
  P.addEquipment('hullDark',box(.88,.027,.017),0,1.765,-2.810);
  for(const y of [1.088,1.228])P.addEquipment('hullDetail',box(.035,.025,.047),.22,y,-2.825);
  P.addEquipment('hullDetail',box(.025,.165,.024),.22,1.158,-2.847);
  rearCage(P);
}

function driverCover(P: TankBuilderPort): void {
  // Object_21's driver cover lies on the forward slope, well ahead of
  // the old flat plate. Its small periscope has a tapered seated receiver.
  P.addHatch('hullDetail',deckPlate(.659,.730,.043,.065),.735,1.785,1.8057,.371);
  const opticRing=(bottom:number,top:number)=>[[-.158,bottom],[.158,bottom],[.158,top],[-.158,top]] as const;
  P.addEquipment('hullDetail',sectionSolid([
    {z:1.707,ring:opticRing(1.804,1.964)},
    {z:1.800,ring:opticRing(1.778,1.964)},
    {z:2.008,ring:opticRing(1.724,1.869)},
  ]),.6429,0,0);
  P.addEquipment('hullGlass',box(.233,.073,.013),.6429,1.823,2.013);
}

function bowServiceCovers(P: TankBuilderPort): void {
  // Source forward service plates follow the glacis angle, with physically
  // seated hinges and grab handles instead of a texture-only hatch impression.
  const bowPitch=Math.atan((1.823-1.345)/(3.12-1.65));
  const bowY=(z:number)=>1.823-(z-1.65)*(1.823-1.345)/(3.12-1.65);
  for(const [x,z,w,d] of [[.57,2.44,.83,.54],[-.46,2.05,.94,.45],[-.76,2.66,.58,.39]]) {
    P.addHatch('hullDetail',box(w,.026,d),x,bowY(z)+.018,z,bowPitch);
    for(const dx of [-w*.31,w*.31])
      P.addEquipment('hullDetail',box(.11,.045,.058),x+dx,bowY(z-d*.37)+.032,z-d*.37,bowPitch);
    for(const dx of [-.085,.085])
      P.addEquipment('hullDetail',box(.025,.044,.030),x+dx,bowY(z)+.052,z,bowPitch);
    P.addEquipment('hullDetail',box(.19,.022,.026),x,bowY(z)+.077,z,bowPitch);
  }
}

function rearDeckStowage(P: TankBuilderPort): void {
  // Source side stowage hangs beside the central deck on its lower ledge;
  // the former three high generic cylinders did not match these envelopes.
  for(const [x,y,z,w,h,d] of [
    [-1.289,1.822,-2.4005,.486,.347,.506],
    [-1.312,1.796,-1.465,.341,.261,.318],
    [-1.345,1.900,-1.027,.342,.274,.576],
  ]) {
    P.addEquipment('hullDetail',clippedPlate(w,h,d,.055),x,y,z);
    for(const dx of [-w*.30,w*.30])
      P.addEquipment('hullDark',box(.018,.014,d+.008),x+dx,y+h/2+.003,z);
  }
  // One broad chamfered aft access assembly, with a centre rib and the
  // measured outer hinges; no unsupported rear grilles or raised twin boxes.
  P.addHatch('hullDetail',deckPlate(1.54,.966,.040,.10),0,1.9196,-2.116);
  P.addEquipment('hullDetail',box(.030,.024,.93),0,1.949,-2.116);
  for(const side of [-1,1]) {
    for(const z of [-2.312,-1.917]) {
      P.addEquipment('hullDetail',box(.064,.087,.036),side*.791,1.939,z);
      P.addEquipment('hullDetail',cylZ(.027,.055,P.q?12:8),side*.791,1.969,z);
    }
    P.addHatch('hullDetail',deckPlate(.253,.253,.0195,.028),side*.786,1.9103,-1.534);
    P.addEquipment('hullDetail',deckPlate(.177,.173,.0215,.019),side*.786,1.9328,-1.534);
  }
}

function turretSideFittings(P: TankBuilderPort, add: EquipmentAdder): void {
  const p = P.turretG.position;
  for(const side of [-1,1]) {
    add('turretDetail',box(.72,.28,.48),p.x+side*.71,2.17,-1.19);
    add('turretDetail',box(.75,.025,.51),p.x+side*.71,2.325,-1.19);
    for(let row=0;row<5;row++) {
      add('turretDetail',box(.028,.022,1.72),p.x+side*1.02,2.015+row*.071,-.48);
      add('turretDetail',box(.91,.022,.028),p.x+side*.54,2.015+row*.071,-1.43);
    }
    for(const z of [-1.42,-.90,-.35,.34]) add('turretDetail',box(.028,.35,.028),p.x+side*1.02,2.17,z);
    for(let i=0;i<4;i++) {
      const x=p.x+side*(.61+i*.07), y=2.17+(i%2)*.13, z=.44-(i%2)*.12;
      add('turretDetail',cylZ(.052,.25,P.q?16:9),x,y,z,-.2,side*.45);
      add('turretDark',cylZ(.040,.016,12),x+side*.057,y+.026,z+.114,-.2,side*.45);
    }
  }
}

function turretHatches(P: TankBuilderPort, add: EquipmentAdder): void {
  // The two real chamfered hatch leaves tilt towards the centre and forward.
  // Their sloping lower collars meet the flat 2.389 m source roof.
  for(const [x,roll] of [[-.2119,.101],[.5653,-.101]]) {
    const pitch=-.053;
    add('turretDetail',deckPlate(.634,.695,.075,.078).rotateX(pitch).rotateZ(roll),x,2.419,-.4408);
    add('turretDetail',deckPlate(.5636,.625,.043,.071).rotateX(pitch).rotateZ(roll),x,2.471,-.4408);
  }
  for(const [x,z] of [[-.465,-.761],[.8175,-.761]]) {
    add('turretDetail',box(.185,.080,.155),x,2.430,z);
    add('turretDetail',cylX(.029,.155,P.q?12:8),x,2.476,z+.031);
  }
  for(const x of [-.1905,.5439]) {
    for(const dx of [-.060,.060])add('turretDetail',box(.020,.046,.026),x+dx,2.523,-.247);
    add('turretDetail',box(.142,.020,.026),x,2.547,-.247);
  }
}

function turretPeriscopes(P: TankBuilderPort, add: EquipmentAdder): void {
  // Source periscope housings have an overhanging sloped hood, separate
  // cheeks and a rear receiver; their full envelope is not a solid box.
  for(const x of [-.2624,.6158]) {
    add('turretDetail',box(.376,.241,.120),x,2.5095,-.076);
    for(const dx of [-.177,.177])
      add('turretDetail',box(.022,.098,.210),x+dx,2.575,.072);
    const ring=(top:number)=>[[-.188,top-.015],[.188,top-.015],[.188,top],[-.188,top]] as const;
    add('turretDetail',sectionSolid([{z:-.137,ring:ring(2.6735)},{z:.178,ring:ring(2.6159)}]),x,0,0);
    add('turretGlass',box(.282,.082,.016),x,2.570,.179);
  }
}

function milanLauncherAndAntenna(P: TankBuilderPort, add: EquipmentAdder): void {
  // The cantilever and shim below the MILAN bearing are visible source
  // plate stock (raw Y 2.4922..2.5083 and 2.5083..2.5166 respectively).
  weaponAssembly(P, () => {
    add('turretDetail',box(.274,.0161,.180),-.537,2.50525,-.020);
    add('turretDetail',box(.117,.0083,.115),-.601,2.51745,-.020);
    // Object_29/30's compact left-hatch receiver has a low bearing and a
    // triangular side cradle. It is not the previous tall aft-centred post.
    add('turretDetail',box(.21,.065,.21),-.60,2.553,-.020);
    add('turretDetail',box(.105,.155,.145),-.60,2.658,-.020);
    add('turretDetail',cylX(.083,.166,P.q?20:12),-.60,2.683,-.020);
    const cradleRing=[[-.131,2.704],[.284,2.704],[.284,3.096],
      [-.085,2.954]] as const;
    const cradle=sectionSolid([{z:-.020,ring:cradleRing.map(([z,y])=>[-z,y] as const).reverse()},
      {z:.020,ring:cradleRing.map(([z,y])=>[-z,y] as const).reverse()}]).rotateY(Math.PI/2);
    add('turretDetail',cradle,-.487,0,0);
    add('turretDetail',box(.18,.039,.37),-.598,2.821,.086);
    add('turretDetail',box(.12,.028,.841),-.644,2.863,.0485);
    add('turretDetail',cylZ(.078,1.21,P.q?24:14),-.64,2.955,-.14);
    add('turretDark',cylZ(.059,.016,P.q?24:14),-.64,2.955,.474);
    add('turretDetail',cylZ(.10,.13,P.q?24:14),-.64,2.955,-.69);
    add('turretDetail',box(.026,.056,.274),-.553,3.102,-.010);
    add('turretDetail',box(.131,.159,.029),-.4645,3.012,.280);
    add('turretGlass',box(.098,.112,.012),-.4645,3.012,.300);
  });
  add('turretDetail',box(.22,.10,.12),.855,2.48,.195);
  add('turretDetail',cylY(.019,.029,.19,10),.904,2.60,.195);
  add('turretDetail',cylY(.008,.014,1.29,8),.904,3.34,.195);
}

function turretRearStowage(P: TankBuilderPort, add: EquipmentAdder): void {
  // Object_35's curved rear stowage roll: sparse elliptical stations follow
  // the measured 1.399 × .427 × .443 m envelope behind the turret basket.
  const rollStations=[[-.699,-1.53,.070,.070],[-.60,-1.565,.160,.123],
    [0,-1.648,.213,.173],[.60,-1.565,.160,.123],[.699,-1.53,.070,.070]];
  const roll=sectionSolid(rollStations.map(([x,z,ry,rz])=>({z:x,ring:
    Array.from({length:P.q?16:10},(_,i)=>{
      const a=i*Math.PI*2/(P.q?16:10);return [-z+Math.cos(a)*rz,2.276+Math.sin(a)*ry] as const;
    })}))).rotateY(Math.PI/2);
  add('turretDetail',roll,.2095,0,0);
  for(const x of [-.37,.14,.655]) {
    const offset=x-.2095,z=-1.648+.23*offset*offset;
    add('turretDetail',torus(.177,.013,P.q?20:12,6).rotateZ(Math.PI/2)
      .scale(1,1.17,1),x,2.276,z);
    add('turretDetail',box(.06,.15,.15),x,2.124,z+.09);
  }
}

function hullSideLights(P: TankBuilderPort, side: number): void {
    P.addEquipment('hullDetail',box(.227,.226,.172),side*(side<0?1.2617:1.2837),1.401,2.994);
    P.addEquipment('hullGlass',cylZ(.068,.025,P.q?18:10),side*(side<0?1.2617:1.2837),1.401,3.093);
    for(const y of [1.448,1.340]) {
      P.addEquipment('hullDetail',cylZ(.050,.053,P.q?16:10),side*(side<0?1.4243:1.4458),y,3.04);
      P.addEquipment('hullGlass',cylZ(.040,.013,P.q?16:10),side*(side<0?1.4243:1.4458),y,3.073);
    }
    P.addEquipment('hullDetail', torus(.085, .018, P.q ? 16 : 10, 6), side * .75, .92, 3.16);
}

function insetSidePanel(P: TankBuilderPort, side: number, z0: number, z1: number): void {
    const back=side<0?1.6182:1.6143,face=side<0?1.7061:1.7012,outer=side<0?1.7188:1.7148;
    P.addExternalArmor('hull',box(face-back,1.0845,z1-z0),side*(back+face)/2,1.33775,(z0+z1)/2);
    for(const y of [.8031,1.8722]) {
      // Sub-four-millimetre assembly seat only on the covered upper border:
      // the source export leaves a 2.0/2.9 mm lateral clearance to its return.
      const seatedOuter=outer+(y>1?side<0?.0035:.0027:0);
      P.addExternalArmor('hull',box(seatedOuter-face,.0152,z1-z0),side*(seatedOuter+face)/2,y,(z0+z1)/2);
    }
    for(const z of [z0+.0077,z1-.0077])P.addExternalArmor('hull',box(outer-face,1.0541,.0154),side*(outer+face)/2,1.33775,z);
}

export function buildFv510MilanX(P: TankBuilderPort): void {
  // Measured fixed armor extends the shadow silhouette; omit small fittings.
  P.additionalShadowSources = {
    hull: ['hullExternalArmor'],
  };
  P.hullG.position.set(0,0,0);
  P.turretG.position.set(.175,1.965,-.42);
  P.gunG.position.set(-.061,.265,1.12);
  hull(P); gear(P); turret(P);
  P.topY=2.525-1.965;
  preserveSourceStudyGunMountAppearance(P);
  P.hullG.userData.xRebuild={candidate:'fv510_milan_x',independent:true,sourceLocalOnly:true,datumVersion:1};
}
