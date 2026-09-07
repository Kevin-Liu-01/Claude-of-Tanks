// Original analytic equipment from the T-72B3 source's measured planes.
// Scalar case axes and supporting sections, never source topology or textures.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {sectionSolid,type SectionPoint} from './sectionSolid.ts';
import {beamBetween,roofSheet} from './measuredPrimitives.ts';
import {sourceMachineGun} from './sourceMachineGun.ts';
import {T72B3_X_SOURCE_DATUMS} from '../t72b3XArmor.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const SHIFT=.172150015831,YAW=T72B3_X_SOURCE_DATUMS.turretPivot;
const CASE_ANGLE=Math.atan2(.54883,.835934);
function add(P:TankBuilderPort,g:THREE.BufferGeometry,x=0,y=0,z=0,dark=false):void{
  P.addEquipment(dark?'turretDark':'turretDetail',g,x-YAW[0],y-YAW[1],z-YAW[2]);
}
function sight(P:TankBuilderPort,g:THREE.BufferGeometry,x=0,y=0,z=0,dark=false):void{
  P.addModuleVisual('optics',dark?'turretDark':'turretDetail',g,x-YAW[0],y-YAW[1],z-YAW[2]);
}

function caseSection(v:number,side:number):readonly SectionPoint[]{
  // Intersections of the measured inner approach, outer vertical wall, and
  // chamfer planes. The lower outer wall slopes inward, leaving turret air.
  const inner=Math.max(1.32672,Math.min(1.41494,1.32672+.28221*(v+.6496),1.32672+.27668*(.3843-v)));
  const outer=Math.min(1.73557,1.55555+1.29643*(v+.7287),1.55633+1.327745*(.46321-v));
  const lowOuter=Math.min(1.5563,outer-.0003),shoulder=1.6165+Math.max(.0005,outer-1.5563)*1.8140;
  const ring:Array<SectionPoint>=[[inner+.04982,1.6165],[lowOuter,1.6165],[outer,shoulder],[outer,2.0467],[inner,2.0467]];
  return side>0?ring:ring.map(([u,y])=>[-u,y] as const).reverse();
}
function sideCase(P:TankBuilderPort,side:number):void{
  const stations=[-.728,-.6496,-.58984,-.337,-.01,.06543,.3282,.3843,.462];
  const g=sectionSolid(stations.map(v=>({z:v,ring:caseSection(v,side)}))).rotateY(side*CASE_ANGLE);
  add(P,g,side>0?-.0007:0,0,SHIFT);
  // The lid is a small separate yawed plate, not a full bounding-box roof.
  for(const [u,v,w,d]of [[1.574225,-.277232,.26406,.64104],[1.540834,.247482,.22350,.27289]]){
    const lid=KIT.box(w,.0148,d).rotateY(side*CASE_ANGLE);
    add(P,lid,side*(Math.cos(CASE_ANGLE)*u+Math.sin(CASE_ANGLE)*v)+(side>0?-.0007:0),2.05410,
      -Math.sin(CASE_ANGLE)*u+Math.cos(CASE_ANGLE)*v+SHIFT);
  }
}
function rearCase(P:TankBuilderPort):void{
  const xs=[-.5207,-.4469,-.3929,-.1497,.227,.4667,.5207,.5946];
  const rows=xs.map(x=>{
    const inset=Math.max(0,Math.min(1,(x+.4469)/.2972,(.5207-x)/.2937));
    const front=-1.3949-.1323*inset+SHIFT;
    const rear=-1.6828-.0797*Math.max(0,Math.min(1,(x+.5207)/.1278,(.5946-x)/.1279))+SHIFT;
    return{z:x,ring:[[-front,1.6585],[-rear-.1618,1.6585],[-rear,2.0326],[-rear,2.1419],[-front,2.1419]] as readonly SectionPoint[]};
  });
  add(P,sectionSolid(rows).rotateY(Math.PI/2));
  add(P,sectionSolid([[-1.57595,.4091,2.149],[-1.56035,.42505,2.1568],[-1.37535,.42505,2.1568],[-1.35935,.4091,2.149]]
    .map(([z,r,top])=>({z,ring:[[.03725-r,2.1419],[.03725+r,2.1419],[.03725+r,top],[.03725-r,top]]}))));
  for(const x of [-.2123,.03855,.28945])add(P,KIT.box(.0469,.0074,.0857),x,2.1586,-1.53850);
}
export function addT72B3Stowage(P:TankBuilderPort):void{
  sideCase(P,-1);sideCase(P,1);rearCase(P);
}

type MachineGun=ReturnType<typeof sourceMachineGun>;
export function addT72B3MgMount(mg:MachineGun):void{
  // Two real 16.8mm fork cheeks leave the center open in front of the pivot.
  for(const x of [-.6819,-.5742])mg.add('turretDetail',sectionSolid([
    [-.85605,2.51590],[-.811,2.5586],[-.80355,2.6281],[-.76505,2.6213],[-.70285,2.4703],
  ].map(([z,top])=>({z,ring:[[x-.0084,2.4269],[x+.0084,2.4269],[x+.0084,top],[x-.0084,top]]}))),0,0,0);
  mg.add('turretDetail',KIT.box(.1314,.0052,.0995),-.6159,2.4295,-.74660);
  mg.add('turretDetail',roofSheet([[-.84685,-.6672,-.5641,2.6096,2.6096],
    [-.81235,-.6672,-.5641,2.6314,2.6314],[-.77365,-.6672,-.5641,2.6206,2.6206]],.004),0,0,0);
  mg.add('turretDetail',beamBetween([-.94,2.459,-.700],[ -.572,2.432,-.700],.009,4),0,0,0);
  // Ammunition box's inclined lid and clipped outboard shoulder.
  const rows=[-.5758,-.37015,-.3265].map(x=>{
    const top=Math.min(2.6959+.258*(x+.45),2.6533-3.112*(x+.35));
    return{z:x,ring:[[1.01535,2.5175],[1.12675,2.5175],[1.12675,top],[1.01535,top]] as readonly SectionPoint[]};
  });
  mg.add('turretDark',sectionSolid(rows).rotateY(Math.PI/2),0,0,0);
}
export function addT72B3MgBracket(mg:MachineGun):void{
  for(const x of [-.5738,-.6549])mg.add('turretDetail',beamBetween([x,2.5265,-1.29555],[x,2.449,-.70505],.02225,4),0,0,0);
  mg.add('turretDetail',sectionSolid([
    {z:-1.28085,ring:[[-.6633,2.5253],[-.5656,2.5253],[-.5656,2.5559],[-.6633,2.5559]]},
    {z:-.80515,ring:[[-.6633,2.5253],[-.5656,2.5253],[-.5656,2.6303],[-.6633,2.6303]]},
  ]),0,0,0);
  // Narrow rising link and its locally beveled top pivot; no high flat rail.
  const linkRing:readonly SectionPoint[]=[[.79775,2.6066],[.83915,2.6066],[.95845,2.7261],[.91705,2.7261]];
  mg.add('turretDetail',sectionSolid([{z:-.5539,ring:linkRing},{z:-.5418,ring:linkRing}]).rotateY(Math.PI/2),0,0,0);
  const boss=sectionSolid([
    {z:-.6074,ring:[[.87665,2.7232],[.99885,2.7232],[.99885,2.8229],[.87665,2.8229]]},
    {z:-.53,ring:[[.86035,2.7099],[1.01515,2.7099],[1.01515,2.8362],[.86035,2.8362]]},
  ]).rotateY(Math.PI/2);
  mg.add('turretDetail',boss,0,0,0);
}

function commanderOptic(P:TankBuilderPort):void{
  const ring=(rx:number,ry:number):readonly SectionPoint[]=>Array.from({length:8},(_,i)=>{
    const a=i*Math.PI/4;return[-.61415+rx*Math.cos(a),2.59865+ry*Math.sin(a)] as const;
  });
  sight(P,sectionSolid([{z:-.02155,ring:ring(.07855,.07445)},{z:.04715,ring:ring(.13685,.12965)},
    {z:.16535,ring:ring(.13685,.12965)}]));
  sight(P,sectionSolid([{z:.1650,ring:ring(.1051,.1025)},{z:.17885,ring:ring(.0947,.0822)}]),0,0,0,true);
  // The upright seats on a real inclined saddle over the cupola's front.
  add(P,roofSheet([[-.10435,-.7003,-.5267,2.4883,2.4883],[-.01685,-.7003,-.5267,2.453,2.453],
    [.07835,-.7003,-.5267,2.4021,2.4021]],.026));
  add(P,roofSheet([[-.16395,-.8581,-.3694,2.462,2.462],[-.12875,-.8581,-.3694,2.4894,2.4894],
    [-.09355,-.8581,-.3694,2.462,2.462]],.0273));
}
function sosnaHousing(P:TankBuilderPort):void{
  // Tall optical head only occupies the rear/right course. Front courses are
  // low separately supported covers, not one tall overall-envelope cuboid.
  sight(P,sectionSolid([
    {z:-.12585,ring:[[.6354,2.0951],[.9458,2.0951],[.9458,2.341],[.6354,2.341]]},
    {z:-.06815,ring:[[.6354,2.0951],[.9458,2.0951],[.9458,2.4014],[.6354,2.4014]]},
    {z:.066,ring:[[.6354,2.0951],[.9458,2.0951],[.9458,2.4014],[.6354,2.4014]]},
    {z:.20535,ring:[[.682,2.0951],[.887,2.0951],[.887,2.4014],[.682,2.4014]]},
  ]));
  sight(P,KIT.box(.1886,.273,.012),.7886,2.2483,.156,true);
  add(P,KIT.box(.2285,.0074,.0529),.78705,2.4059,.20330);
  add(P,KIT.box(.1971,.139,.1518),.50035,2.1358,-.00865);
  add(P,KIT.box(.2292,.0073,.0942),.499,2.21055,.07185);
  add(P,KIT.box(.2319,.1389,.2266).rotateY(.01643),.51035,2.06385,.51755);
  add(P,KIT.box(.3097,.0116,.2621).rotateY(.01643),.50705,2.1367,.4937);
  add(P,KIT.box(.1958,.0085,.2475).rotateY(.01643),.543,2.13745,.7482);
  for(const x of [.4681,.61445])add(P,sectionSolid([
    {z:.6510,ring:[[x-.0167,1.9459],[x+.0167,1.9459],[x+.0167,2.0848],[x-.0167,2.0848]]},
    {z:.8653,ring:[[x-.0167,1.9459],[x+.0167,1.9459],[x+.0167,2.0275],[x-.0167,2.0275]]},
  ]));
}
export function addT72B3Optics(P:TankBuilderPort):void{
  commanderOptic(P);sosnaHousing(P);
}
