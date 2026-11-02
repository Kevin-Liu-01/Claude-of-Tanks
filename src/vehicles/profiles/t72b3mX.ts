import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { antennaPart } from './antennaPart.ts';
// Independent first-party T-72B3M (2022) construction from scalar source
// measurements. No source topology, source loading, or donor builder calls.
import * as THREE from 'three';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import {KIT} from './kit.ts';
import {boxSections,castSections,roofSheet,beamBetween,blindTube} from './measuredPrimitives.ts';
import {markEraHitFaces,markEraFurniture} from './eraHitFaces.ts';
import { libraryRoofMg } from './libraryRoofMg.ts';
import {T72B3M_X_SOURCE_DATUMS} from '../t72b3mXArmor.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
import {addT72B3MSideMounts,T72B3M_DECK_FRONT_Z} from './t72b3mXSideMounts.ts';
import {barkLog} from '../accessoryPrimitives.ts';
import {sectionSolid,type SectionPoint} from './sectionSolid.ts';
import {loft,type V3} from './eraModuleKit.ts';

const T72B3M_X_DATUMS=T72B3M_X_SOURCE_DATUMS;
const YAW=T72B3M_X_DATUMS.turretPivot,GUN=T72B3M_X_DATUMS.trunnion;
const {box,cylX,cylZ,torus}=KIT;
const cylY=(r:number,h:number,n=28)=>KIT.cylY(r,r,h,n);
function topPart(P:TankBuilderPort,bucket:string,g:THREE.BufferGeometry,x:number,y:number,z:number,rx=0,ry=0,rz=0):void {
  P.addEquipment(bucket,g,x-YAW[0],y-YAW[1],z-YAW[2],rx,ry,rz);
}

export function buildT72B3MXHullCore(P:TankBuilderPort):void {
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
}

function hull(P:TankBuilderPort,skirtEra=true,roundedFront=true):void {
  buildT72B3MXHullCore(P);
  for(const side of [-1,1])fenders(P,side,roundedFront);
  addT72B3MSideMounts(P,{skirtEra});
}

function fenders(P:TankBuilderPort,side:number,roundedFront=true):void {
  const a=Math.min(side*1.128,side*1.764),b=Math.max(side*1.128,side*1.764);
  P.addMudguard('t72b3m-x-deck','hull',roofSheet([
    [-3.47,a,b,1.20,1.20],[-3.15,a,b,1.3324,1.3324],[-2.80,a,b,1.526,1.526],
    [1.65,a,b,1.509,1.509],[2.7,a,b,1.446,1.446],[T72B3M_DECK_FRONT_Z,a,b,1.42328,1.42328],
  ],.019));
  const ringRows:readonly(readonly[number,number,number,number])[]=[
    [3.06,1.02,1.897,1.42328],[3.23,1.006,1.933,1.42328],[3.43,1.026,1.955,1.399],
    [3.59,1.08,1.951,1.302],[3.73,1.13,1.91,1.155],
  ];
  const sheet=(rows:readonly(readonly[number,number,number,number])[])=>roofSheet(rows.map(([z,inner,outer,y])=>{
    const l=Math.min(side*inner,side*outer),r=Math.max(side*inner,side*outer);return[z,l,r,y,y] as const;
  }),.015);
  if(roundedFront)P.addMudguard('t72b3m-x-rounded-front','hull',sheet([...ringRows,[3.835,1.19,1.78,.915]]));
  // (266; blind critics: "the front mudguards are flat plates that flare out like wings") the guard's outer edge is
  // turned down 10 cm, a 12 mm flange from the skirt's front to the guard's last station, so it reads as a pressed
  // mudguard; outboard of the track (x > 1.88 against its 1.75)
  const lip=ringRows.slice(1).map(([z,,outer,y])=>({z,ring:(side>0?[[outer-.012,y-.115],[outer,y-.115],[outer,y-.010],[outer-.012,y-.010]]:
    [[-outer,y-.115],[-outer+.012,y-.115],[-outer+.012,y-.010],[-outer,y-.010]]) as SectionPoint[]}));
  if(roundedFront)P.addMudguard('t72b3m-x-rounded-front-lip','hullDetail',sectionSolid([{z:3.19,ring:lip[0].ring},...lip]));
  P.addMudguard('t72b3m-x-rear-leaf','hullRubber',roofSheet([
    [-3.475,Math.min(side*1.145,side*1.935),Math.max(side*1.145,side*1.935),1.043,1.043],
    [-3.155,a,b,1.3207,1.3207],
  ],.014));
}

function runningGear(P:TankBuilderPort):void {
  // Source axle staggering is averaged across sides (maximum11.2mm). All six
  // wheels, end drums and the three inferred return rollers remain the native animated assembly (FSP-03 2026-09-25).
  // owner 2026-09-22 ("standardize our wheels across NATIONS"): the road-wheel face is the Russia nation construction
  // (T-90 donor, nationWheelSets.ts), fitted by the running-gear builder into this hull's own wheel envelope.
  P.gear=KIT.buildRunningGear(P,{style:'rubber',wheelR:.391766,wheelY:.4728865,wheelW:.45254,
    wheelZs:[-1.822412,-.953673,-.089323,.858392,1.722743,2.591482],xc:1.4713,trackW:.554,trackTh:.030, // Russian X track standard 2026-09-12: band .030, pad .036, web .018
    sprocket:{z:-2.5973,y:.79690,r:.36720,trackR:.327},idler:{z:3.2184,y:.87328,r:.2823,trackR:.270},
    // FSP-03 2026-09-25 (owner: rollers wherever the real vehicle has them): the T-72/T-90 family carries three
    // return rollers per side (FAS T-72 entry; the source `support wheels` node, docs/references/tanks/t90a_x.md);
    // the 2026-09-23 rollerless reading is reversed and the source-measured stations return byte-for-byte.
    rollers:[{z:-1.78,y:1.16,r:.12},{z:.05,y:1.16,r:.12},{z:1.85,y:1.16,r:.12}],rollerR:.12,
    returnRollerWidthM:.30,returnRollerInsetM:.16,topY:1.325,botY:.055,arms:true,coveredTop:true,paintedEnds:true,
    sprocketDepthScale:.86,idlerDepthScale:.86,linkPitchM:.14,
    trackShoeDimensions:{padHeight:.036,grouserHeight:.011,webHeight:.018,hornHeight:.045,pinRadius:.010,pinCentreY:0},
  });
}

/** A run of the skirt left without its Relikt cassettes on one side (OPEN_NONE: none), for a hull whose own screen stands
 * there (the BMPT Terminator's left slat section, bmptTerminator.ts): a cassette whose span lies inside it draws no
 * containers, backing strip, flap or hanger. */
type OpenSkirtSpan=readonly[side:number,rearZ:number,frontZ:number];
const OPEN_NONE:readonly OpenSkirtSpan[]=Object.freeze([]);
const skirtSpanOpen=(open:readonly OpenSkirtSpan[],side:number,a:number,b:number)=>
  open.some(([s,r,f])=>s===side&&a>=r-1e-6&&b<=f+1e-6);
function hullCassettes(P:TankBuilderPort,nativeEra=true,containers=true,open:readonly OpenSkirtSpan[]=OPEN_NONE):void {
  for(const side of [-1,1]){
    const left=side<0?-1.103:.014,right=side<0?-.014:1.103;
    if(nativeEra)P.destructibleCluster(`glacis_era_${side<0?'L':'R'}`,()=>{
      const cover=roofSheet([[2.00,left,right,1.4934,1.4934],[2.61,left,right,1.2725,1.2725],[3.25,left,right,1.0232,1.0232]],.040);
      P.addExternalArmor('hull',markEraHitFaces(cover,[0,1,0]));
      if(containers)glacisContainers(P,side);
    });
    const lane=side<0?-1.962:1.958;
    for(const [a,b,top,low]of SKIRT_SPANS){
      if(nativeEra){
      if(skirtSpanOpen(open,side,a,b))continue;
      P.addEquipment('hullDetail',box(.009,top-low,b-a),lane-side*.014,(low+top)/2,(a+b)/2);
      P.destructibleCluster(`skirt_era_${side<0?'L':'R'}`,()=>{
        for(const [y0,y1]of [[1.24,top],[low,1.203]]){
          P.addExternalArmor('hull',markEraHitFaces(reliktContainer(side,lane-side*.009,y0,y1,a,b),[side,0,0]));
          // two cover bolts at the container's upper corners go with it
          for(const z of [a+.035,b-.035])P.addExternalArmor('hull',markEraFurniture(box(.008,.020,.020)),side*(skirtFaceX(a)+.003),y1-.032,z);
        }
      });
      }
      else if(a> -1.4&&b<2.24)P.addMudguard('t72b3m-x-lower-curtain','hullRubber',box(.003,.277,b-a-.006),lane-side*.009,.6591,(a+b)/2);
    }
    if(nativeEra)skirtFlapsAndHangers(P,side,lane,open);
    else {
      P.addMudguard('t72b3m-x-front-curtain','hullRubber',box(.004,.17,.935),lane-side*.009,.7146,2.712);
      P.addMudguard('t72b3m-x-rear-curtain','hullRubber',box(.004,.14,.825),lane-side*.009,.730,-2.143);
    }
  }
  if(nativeEra&&containers)splashBoard(P);
}

// 267 (Main: "Relikt glacis in distinct rows of containers with seams and a stepped face"). The source raft
// (t72b3m_x_source.glb, Object_6, 1 cm height field against the glacis plane y 1.517 - .389 (z - 1.94)): the upper glacis
// from the driver's plate to z 2.33 lies in the plane; from there forward the reactive raft stands proud of it (+15..22
// mm) to its bolted front edge at z 3.30-3.34, its access plates another 15 mm up (z 2.68-2.84 at |x| .08-.32 and
// .49-.77, z 3.07-3.25 at |x| .19-.48), crossed at z 2.89-2.92 by the splash board standing 0.13 m square to the plate
// between the headlights, with its seams at |x| .20 and .48 in the front row. Here: the 40 mm cover keeps its hit faces
// (the armour binding) and carries the containers as furniture of the same cluster, in two rows of closed boxes with 12 mm
// seams, the rear row (z 2.335-2.900) two a side, the front row (z 2.940-3.244) three a side, every lid in one plane
// (1.5359 - .382 (z - 2)), 30-36 mm over the cover, chamfered 6 mm on the top edges, their feet 6 mm into the cover. (The
// obr. 2022 lays its own block grid instead, on the bare cover: buildT72B3MXHull glacisContainers.) The rear row's back edge is the glacis step; the front row's
// face over the cover's edge is the bolted toe (two hex heads a box); the source's two bolt groups and the access plates sit
// on the lids. Gun sweep: the upper glacis under the mantlet (z < 2.335) is unchanged.
const GLACIS_COVER:readonly(readonly[z:number,y:number])[]=[[2.00,1.4934],[2.61,1.2725],[3.25,1.0232]];
function glacisCoverY(z:number):number {
  const [a,b,c]=GLACIS_COVER;
  const [z0,y0,z1,y1]=z<=b[0]?[a[0],a[1],b[0],b[1]]:[b[0],b[1],c[0],c[1]];
  return y0+(y1-y0)*(z-z0)/(z1-z0);
}
const GLACIS_LID_SLOPE=.382,GLACIS_ALPHA=Math.atan(GLACIS_LID_SLOPE);
const glacisLidY=(z:number)=>1.5359-GLACIS_LID_SLOPE*(z-2);
const GLACIS_ROWS:readonly(readonly[z0:number,z1:number])[]=[[2.335,2.900],[2.940,3.244]];
/** The bare glacis cover's top at z: what a frontal package that replaces the containers (buildT72B3MXHull
 * glacisContainers: false; the obr. 2022's block grid, t72b3m2022Kit.ts glacisRows) seats on. */
export function t72b3mGlacisCoverY(z:number):number { return glacisCoverY(z); }
/** A closed container box between |x| a..b and z z0..z1: its foot 6 mm into the cover (following the cover's kink at z
 * 2.61), its lid in the glacisLidY plane, top edges chamfered 6 mm (the ends' top edges too); a plate: 10 mm, 3 mm into
 * the lid, chamfered 3 mm. */
function glacisBox(side:number,a:number,b:number,z0:number,z1:number,plate=false):THREE.BufferGeometry {
  const x0=Math.min(side*a,side*b),x1=Math.max(side*a,side*b),ch=plate?.003:.006;
  const ring=(z:number,drop:number):SectionPoint[]=>{
    const foot=plate?glacisLidY(z)-.003:glacisCoverY(z)-.006,lid=glacisLidY(z)+(plate?.007:0)-drop;
    return [[x0,foot],[x1,foot],[x1,lid-ch],[x1-ch,lid],[x0+ch,lid],[x0,lid-ch]];
  };
  const zs=[z0,z0+ch,...(z0+ch<GLACIS_COVER[1][0]&&GLACIS_COVER[1][0]<z1-ch?[GLACIS_COVER[1][0]]:[]),z1-ch,z1];
  return sectionSolid(zs.map((z,i)=>({z,ring:ring(z,i===0||i===zs.length-1?ch:0)})));
}
/** A hex bolt head on a lid (axis on the lid's normal, 3 mm into it) or on a box's front face (axis +z). */
function glacisBolt(x:number,z:number,onFace=false):[THREE.BufferGeometry,number,number,number] {
  if(onFace)return [cylZ(.010,.013,6),x,(glacisCoverY(z)+glacisLidY(z)-.006)/2-.003,z+.0035];
  return [KIT.cylY(.015,.015,.012,6).rotateX(GLACIS_ALPHA),x,glacisLidY(z)+.003,z];
}
function glacisContainers(P:TankBuilderPort,side:number):void {
  const fur=(g:THREE.BufferGeometry,x=0,y=0,z=0)=>P.addExternalArmor('hull',markEraFurniture(g),x,y,z);
  const FRONT=GLACIS_ROWS[1][1];
  const [[A0,A1],[B0]]=GLACIS_ROWS;
  for(const [a,b]of [[.020,.455],[.467,1.065]])fur(glacisBox(side,a,b,A0,A1));
  for(const [a,b]of [[.020,.195],[.207,.475],[.487,1.065]]){
    fur(glacisBox(side,a,b,B0,FRONT));
    // the toe: two hex heads on the box's face over the cover's front edge
    for(const x of [a+.045,b-.045]){const [g,bx,by,bz]=glacisBolt(side*x,FRONT,true);fur(g,bx,by,bz);}
  }
  // access plates: 10 mm, chamfered, 3 mm into the lid
  for(const [a,b,z0,z1]of [[.080,.320,2.680,2.840],[.490,.770,2.680,2.840],[.225,.457,3.060,3.215]])
    fur(glacisBox(side,a,b,z0,z1,true));
  // the source's bolt group on the rear row's outer box
  for(const [x,z]of [[.61,2.50],[.61,2.56],[.73,2.50],[.73,2.56],[.73,2.62]]){const [g,bx,by,bz]=glacisBolt(side*x,z);fur(g,bx,by,bz);}
}
/** 267: the splash board across the glacis between the headlights' inner guard bars (|x| .72), standing in the 40 mm
 * seam between the container rows, 12 mm thick and square to the plate (the source's board leans forward with it), its
 * top 0.13 m over the cover with the source photo's shallow notch over the centre (30 mm down for |x| < .14), its foot down
 * through the cover onto the hull glacis (the hull's own fitting: it stays when the reactive cover is stripped). */
function splashBoard(P:TankBuilderPort):void {
  const W=.72,H=.130,notch=.030,t=.012,foot=2.910,root=-.047;
  const outline:SectionPoint[]=[[-W,root],[W,root],[W,H-.008],[W-.008,H],[.14+notch,H],[.14,H-notch],[-.14,H-notch],
    [-.14-notch,H],[-W+.008,H],[-W,H-.008]];
  const g=sectionSolid([{z:-t/2,ring:outline},{z:t/2,ring:outline}]).rotateX(GLACIS_ALPHA);
  P.addEquipment('hullDetail',g,0,glacisCoverY(foot),foot);
}

// The nine side-skirt cassette spans a side: [rear z, front z, top, bottom] (source stations).
const SKIRT_SPANS:readonly(readonly[a:number,b:number,top:number,low:number])[]=[[-3.153,-2.559,1.53164,.79919],
  [-2.217,-1.73,1.53257,.79949],[-1.389,-.795,1.53164,.79919],[-.785,-.19,1.53164,.79919],[-.18,.415,1.53164,.79919],
  [.423,1.018,1.53164,.79919],[1.029,1.624,1.53164,.79919],[1.637,2.232,1.52077,.79884],[2.242,3.182,1.47615,.7984]];
/** Outer face of a skirt cassette's Relikt containers (266; they were 18 mm slabs to x 1.967): the six over the fighting
 * compartment stand 61 mm deep from their 1.949 inner face, the three over the engine bay 26 mm, so the forward skirt
 * reads as the B3M's deep Relikt boxes and the rear as its thinner screens. */
const skirtFaceX=(a:number)=>a> -.8?2.010:1.975;

/** 266 (shared-base follow-up; blind critics: "flat, thin, toy-like skirts"): one 4S23 container of the skirt, a closed box
 * from the source cassette's inner face out to skirtFaceX with 10 mm chamfers round its outer face, so each row reads
 * as boxes standing proud of the skirt, not a sheet. */
function reliktContainer(side:number,inner:number,y0:number,y1:number,a:number,b:number):THREE.BufferGeometry {
  const xi=Math.abs(inner),xo=skirtFaceX(a),c=.010;
  const full:SectionPoint[]=[[xi,y0],[xo-c,y0],[xo,y0+c],[xo,y1-c],[xo-c,y1],[xi,y1]];
  const end:SectionPoint[]=[[xi,y0],[xo-2*c,y0],[xo-c,y0+c],[xo-c,y1-c],[xo-2*c,y1],[xi,y1]];
  const ring=(r:SectionPoint[])=>{const m=r.map(([x,y])=>[side*x,y] as const);return side<0?m.reverse():m;};
  return sectionSolid([{z:a,ring:ring(end)},{z:a+c,ring:ring(full)},{z:b-c,ring:ring(full)},{z:b,ring:ring(end)}]);
}

/** 266: the rubber-fabric hem under the skirt's lower containers, one flap per cassette (two under the long front and
 * rear spans), each its own segment (a 12 mm slot to the next) cut with deep chamfered lower corners (30 % of its width,
 * 55 % of its height) so the hem reads as the B3M's row of trapezoid teeth, hung 6 degrees outboard from a bolted hinge
 * bar under the container (its top edge tucked 13 mm into the container's foot), alternate flaps 10 mm further out.
 * Bottoms .50 under the fighting compartment, .62 front, .65 rear: above the belly pan (.4526); every flap lies outboard
 * of the track (x > 1.95 against the track's 1.75). Steel hangers clip each cassette seam at the row gap and at the
 * skirt top. */
function skirtFlapsAndHangers(P:TankBuilderPort,side:number,lane:number,open:readonly OpenSkirtSpan[]=OPEN_NONE):void {
  const hingeY=.812,lean=.105,t=.014;
  const flaps:(readonly[a:number,b:number,bottom:number])[]=[];
  for(const [a,b]of SKIRT_SPANS)if(a> -1.4&&b<2.24)flaps.push([a,b,.50]);
  flaps.push([2.245,2.712,.62],[2.712,3.180,.62],[-2.556,-2.143,.65],[-2.143,-1.731,.65]);
  flaps.forEach(([a,b,bottom],i)=>{
    if(skirtSpanOpen(open,side,a,b))return;
    const h=hingeY-bottom,w=b-a-.012,cx=w*.30,cy=h*.55;
    const outline:SectionPoint[]=[[-w/2,0],[-w/2,-(h-cy)],[-w/2+cx,-h],[w/2-cx,-h],[w/2,-(h-cy)],[w/2,0]];
    // outline in (along-hull, height); extruded through the flap's thickness and turned so the outline lies in the y-z plane
    const g=sectionSolid([{z:-t/2,ring:outline},{z:t/2,ring:outline}]).rotateY(-Math.PI/2).rotateZ(side*lean);
    const x0=Math.abs(lane)-.009+t/2+(i%2?.010:0),z=(a+b)/2;
    P.addMudguard('t72b3m-x-rubber-flap','hullRubber',g,side*x0,hingeY,z);
    // hinge bar and its three bolts along the flap's top edge
    const sx=x0+t/2+.007;
    P.addEquipment('hullDetail',box(.016,.044,w-.03),side*sx,hingeY-.018,z);
    for(const dz of [-w*.35,0,w*.35])P.addEquipment('hullDetail',box(.009,.016,.016),side*(sx+.0115),hingeY-.018,z+dz);
  });
  // the hangers: a clip over each seam between cassettes at the gap between the two container rows, and a hook over the
  // skirt's top edge at each seam (4 mm over it), both standing 4 mm proud of the containers' faces
  for(let i=0;i+1<SKIRT_SPANS.length;i++){
    if([i,i+1].some((k)=>skirtSpanOpen(open,side,SKIRT_SPANS[k][0],SKIRT_SPANS[k][1])))continue;
    const z=(SKIRT_SPANS[i][1]+SKIRT_SPANS[i+1][0])/2,top=Math.min(SKIRT_SPANS[i][2],SKIRT_SPANS[i+1][2]);
    const face=Math.max(skirtFaceX(SKIRT_SPANS[i][0]),skirtFaceX(SKIRT_SPANS[i+1][0])),xi=1.949;
    P.addEquipment('hullDetail',box(face+.004-xi,.054,.046),side*(face+.004+xi)/2,1.2215,z);
    P.addEquipment('hullDetail',box(face+.004-1.959,.050,.040),side*(face+.004+1.959)/2,top-.021,z);
  }
}

function deckEquipment(P:TankBuilderPort,glacisLamps=true,sweptStrap=true,lowCrown=false):void {
  // (lowCrown, release 240: the hump flat at its 1.577 rim, under a turret whose floor sweeps 1.580-1.599 over it (the
  // T-84 and the Type 96 Lei); its 1.624 crest stood 3-4 cm in it)
  const crown=lowCrown?1.577:1.62359;
  P.addEquipment('hullDetail',boxSections([[-2.19,1.058,1.578,1.535],[-2.03,1.058,crown,1.535],
    [-1.69,1.058,crown,1.535],[-1.482,1.058,1.577,1.535]]));
  for(const x of [-.527,.523]){
    P.addEquipment('hullDetail',box(1.029,.024,.746),x,1.539,-2.609);
    for(let i=0;i<19;i++)P.addEquipment('hullDark',box(.98,.010,.012),x,1.555,-2.945+i*.037);
  }
  for(const [x,z,w,d,y]of [[-1.46,-2.57,.59,1.10,1.554],[-1.46,-1.47,.59,1.04,1.55],
    [-1.46,-.27,.59,1.29,1.55],[-1.46,1.04,.59,1.28,1.547],[-1.46,2.18,.59,.87,1.47],
    [1.44,-2.70,.58,.82,1.511],[1.42,-1.80,.51,.79,1.582],[1.45,-.45,.59,1.60,1.505],
    [1.43,1.04,.59,1.25,1.503],[1.43,2.20,.59,.89,1.468]]){
    // each deck plate and its strips seat on the deck under them (owner 2026-10-19 sweep: authored 1-5 cm over it)
    // (sweptStrap false: no strap whose inner end lies within 1.4 m of the turret's yaw axis on the right covers)
    P.snapGroup('t72b3m-deck-plate',()=>{
      P.addEquipment('hullDetail',box(w,.024,d),x,y,z);
      // (sweptStrap false: no strap whose inner end lies within 1.4 m of the turret's yaw axis on the right covers)
      for(const dz of [-d*.38,d*.38])if(sweptStrap||x>0||Math.hypot(Math.abs(x)-w*.42,z+dz-YAW[2])>1.4)P.addEquipment('hullDetail',box(w*.84,.020,.037),x,y+.022,z+dz);
    },{reachM:.06});
  }
  P.addEquipment('hullDark',box(.17,.12,.586),1.759,1.431,-1.797);
  for(const z of [-2.043,-1.917,-1.79,-1.665,-1.54])P.addEquipment('hullDetail',box(.025,.138,.018),1.828,1.43,z);
  P.addEquipment('hullDetail',cylY(.374,.043,32),-.079,1.540,1.720);
  P.addEquipment('hullDark',box(.39,.027,.085),.002,1.491,2.03);
  // each headlight with its guard is seated on the glacis (it stood 5 cm off it; owner 2026-10-19 sweep)
  // 2026-10-19 (owner float sweep): the lamp still stood 51 mm in front of its guard after that seat; it sits back on a
  // crossbar between the guard bars (glacisLamps false: a national hull's own lamps replace both, release 227)
  if(glacisLamps)for(const x of [-.863,.868])P.snapGroup('t72b3m-headlight',()=>{
    P.addEquipment('hullDetail',markVehicleNightLens(cylZ(.076,.105,24),'headlight'),x,1.318,2.9355);
    for(const dx of [-.118,.118])P.addEquipment('hullDetail',beamBetween([x+dx,1.12,3.007],[x+dx,1.38,2.85],.009));
    P.addEquipment('hullDetail',beamBetween([x-.118,1.318,2.8874],[x+.118,1.318,2.8874],.009));
  },{reachM:.07});
  // each louvre slat is seated on the falling stern deck (it stood 3 cm over it; owner 2026-10-19 sweep)
  for(const x of [-.193,.596])for(let i=0;i<8;i++)P.snapGroup('t72b3m-stern-slat',()=>P.addEquipment('hullDetail',box(.061,.012,.24),x-.315+i*.089,1.542,-3.214,.244),{reachM:.05});
}

function rearEquipment(P:TankBuilderPort):void {
  // This source carries no external drums. The rear screen is six thin
  // upright leaves and six separate sloping lower leaves, not a filled box.
  for(const x of [-.946,-.563,-.182,.194,.571,.946]){
    P.addEquipment('hullDetail',box(.3667,.534,.013),x,1.5015,-3.665);
    // the lower leaf hangs from the upright leaf's foot (its top edge stood 5 mm under and 3 mm behind it)
    P.addEquipment('hullDetail',roofSheet([[-3.665,x-.1833,x+.1833,1.24,1.24],[-3.455,x-.1833,x+.1833,.93,.93]],.011));
    P.addEquipment('hullDetail',beamBetween([x,1.31,-3.29],[x,1.365,-3.665],.011));   // from inside the stern plate (it started 14 mm off it)
  }
  // 2026-10-07 (tank-accessories round 4; wave 217: soft-looking rounds on the T-72B3M "wear the hull's camo decal"):
  // the transom's 2.68 m round is the unditching log, a camouflaged 28-sided cylinder until now; it is the shared
  // barked log in its own baked wood colours (hullBark, as the T-90M and the fitting logs), same axis and seat.
  const log=barkLog({len:2.68,r:.115,seed:7230,detail:P.q===false?0:1,relief:2,tinted:true});
  for(const part of [log.bark,...(log.stub?[log.stub]:[]),...log.ends,...log.grain])P.addEquipment('hullBark',part,-.001,1.012,-3.29);
  // the towing rings sit on the stern (3-5 cm off it; owner 2026-10-19 sweep)
  for(const x of [-.786,.78])P.snapGroup('t72b3m-tow-ring',()=>P.addEquipment('hullDetail',torus(.07,.023,20,8),x,.85,-3.215),{reachM:.07});
  for(const x of [-1.58,1.576])P.snapGroup('t72b3m-tow-ring',()=>P.addEquipment('hullDetail',torus(.06,.018,20,8),x,1.38,-3.28),{reachM:.07});
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
function cheekCassettes(P:TankBuilderPort,finish=false):void {
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
    if(!finish){
      // the measured cassettes (national concepts fit their own kits against these)
      const [x,y,z,nx,ny,nz,w,d]=cell,normal=new THREE.Vector3(nx,ny,nz).normalize();
      const yaw=Math.atan2(nx,nz),pitch=Math.acos(normal.y);
      const g=markEraHitFaces(box(w,.167,d),[0,1,0]).rotateX(pitch).rotateY(yaw);
      const center=new THREE.Vector3(x,y,z).addScaledVector(normal,-.0835);
      P.destructibleCluster(`turret_era_${x<0?'L':'R'}`,()=>P.addExternalArmor('turret',g,center.x-YAW[0],center.y-YAW[1],center.z-YAW[2]));
      topPart(P,'turretDetail',beamBetween([x*.78,1.66,z*.78],[center.x,center.y-.067,center.z],.017),0,0,0);
      continue;
    }
    // 266 (familyFinish; blind critics over three rounds: "a fan of small separate bricks hanging down over the turret
    // front", "too thin, droop too low", "the real cassettes are thick wedges whose tops meet the roof line"): each
    // cassette keeps its measured plan station and heading but stands CHEEK_LIFT higher, at CHEEK_TILT of its measured
    // tilt, 12 % wider and 20 % longer, so each cheek's fan closes into one thick brow whose rear edge meets the roof's
    // front; t72b3mXGeometry's covers receipt pins the exposed planes (cheekCellPlane).
    // 267 (Main: "the turret cheek Relikt/Kontakt-5 wedge packs with real depth, the 2016's characteristic boxy cheek
    // modules"): the rounded 0.20 m slab on its upright prism (two stacked bricks from the front) is one sharp-edged wedge
    // (cheekWedge), as the source's cassettes are (Object_14, islands 8832/9442/10078/10463: a sloping lid, a short upright
    // end cap at the front, an underside rising from the casting to it), with the slab's exposed lid plane and extent.
    const [x]=cell;
    const g=cheekWedge(cell);
    P.destructibleCluster(`turret_era_${x<0?'L':'R'}`,()=>P.addExternalArmor('turret',g));
    for(const b of cheekCapBolts(cell))P.destructibleCluster(`turret_era_${x<0?'L':'R'}`,()=>P.addExternalArmor('turret',markEraFurniture(b)));
  }
}
const CHEEK_LIFT=.10,CHEEK_TILT=.6;
/** A cheek cassette's exposed plane (266): the measured station (x, z) and heading, CHEEK_LIFT higher, at CHEEK_TILT of
 * the measured tilt (t72b3mXGeometry's covers receipt pins three of them). */
function cheekCellPlane(cell:Cheek):{point:THREE.Vector3;normal:THREE.Vector3;yaw:number;pitch:number} {
  const [x,y,z,nx,ny,nz]=cell,measured=new THREE.Vector3(nx,ny,nz).normalize();
  const yaw=Math.atan2(nx,nz),pitch=Math.acos(measured.y)*CHEEK_TILT;
  return {point:new THREE.Vector3(x,y+CHEEK_LIFT,z),normal:new THREE.Vector3(Math.sin(pitch)*Math.sin(yaw),Math.cos(pitch),Math.sin(pitch)*Math.cos(yaw)),yaw,pitch};
}
/** The wedge's base (the 266 prism's foot) and its front: an upright end cap CHEEK_CAP deep under the lid's front edge, the
 * underside rising from the casting to the cap's foot at CHEEK_UNDER (the source's lower faces rise 13-15 degrees under
 * its 32-degree lids; under the 266 brow's flatter lids 22 degrees keeps the reference photos' deep angled undersides
 * below each end cap, where 15 degrees left a thin dark sliver and the pack read as slabs on air), down to the 266
 * prism's foot or, on the short cells, into the casting at the lid's rear. */
const CHEEK_BODY_BASE_Y=1.65,CHEEK_CAP=.095,CHEEK_UNDER=22*Math.PI/180,CHEEK_EDGE=.010;
/** The cassette frame: x along the heading (horizontal), y up, z across (x cross y), origin at the lid's centre point. */
function cheekFrame(cell:Cheek):{frame:THREE.Matrix4;sF:number;yF:number;sR:number;yR:number;w:number} {
  const [,,,,,,w0,d0]=cell,{point,yaw,pitch}=cheekCellPlane(cell),d=d0*1.2;
  const h=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw)),up=new THREE.Vector3(0,1,0),a=h.clone().cross(up);
  const frame=new THREE.Matrix4().makeBasis(h,up,a).setPosition(point.x-YAW[0],point.y-YAW[1],point.z-YAW[2]);
  const c=Math.cos(pitch)*d/2,v=Math.sin(pitch)*d/2;
  return {frame,sF:c,yF:-v,sR:-c,yR:v,w:w0*1.12};
}
/** One cassette (267): the lid plane and extent of the 266 slab (hit faces), its front an upright cap, its underside rising
 * at CHEEK_UNDER from the casting to the cap's foot, its back down to CHEEK_BODY_BASE_Y inside the casting; every edge on
 * the sides chamfered CHEEK_EDGE. One closed solid in the turret frame. */
function cheekWedge(cell:Cheek):THREE.BufferGeometry {
  const {frame,sF,yF,sR,yR,w}=cheekFrame(cell),{point}=cheekCellPlane(cell);
  const base=CHEEK_BODY_BASE_Y-point.y,capFoot=yF-CHEEK_CAP;
  const run=(capFoot-base)/Math.tan(CHEEK_UNDER);
  const profile:[number,number][]=sF-run>sR+.02?[[sR,yR],[sR,base],[sF-run,base],[sF,capFoot],[sF,yF]]
    :[[sR,yR],[sR,capFoot-(sF-sR)*Math.tan(CHEEK_UNDER)],[sF,capFoot],[sF,yF]];
  // counter-clockwise in (x, y) seen from +z
  let area=0;for(let i=0;i<profile.length;i++){const p=profile[i],q=profile[(i+1)%profile.length];area+=p[0]*q[1]-q[0]*p[1];}
  if(area<0)profile.reverse();
  const inner=insetConvex(profile,CHEEK_EDGE),c=CHEEK_EDGE;
  const g=sectionSolid([{z:-w/2,ring:inner},{z:-w/2+c,ring:profile},{z:w/2-c,ring:profile},{z:w/2,ring:inner}]);
  const {normal}=cheekCellPlane(cell),local=normal.clone().transformDirection(new THREE.Matrix4().copy(frame).invert());
  return markEraHitFaces(g,[local.x,local.y,local.z]).applyMatrix4(frame);
}
/** Two hex heads on each cassette's end cap, 3 mm into it (ERA furniture: they leave with it). */
function cheekCapBolts(cell:Cheek):THREE.BufferGeometry[] {
  const {frame,sF,yF,w}=cheekFrame(cell);
  return [-1,1].map(k=>cylX(.013,.012,6).translate(sF+.003,yF-CHEEK_CAP*.45,k*(w/2-.045)).applyMatrix4(frame));
}
/** A convex counter-clockwise polygon moved in by `c` along every edge's inward normal. */
function insetConvex(poly:readonly(readonly[number,number])[],c:number):SectionPoint[] {
  const n=poly.length;
  const lines=poly.map((p,i)=>{const q=poly[(i+1)%n],dx=q[0]-p[0],dy=q[1]-p[1],l=Math.hypot(dx,dy);
    return {p:[p[0]-dy/l*c,p[1]+dx/l*c],d:[dx/l,dy/l]};});
  return poly.map((_,i)=>{const a=lines[(i+n-1)%n],b=lines[i],den=a.d[0]*b.d[1]-a.d[1]*b.d[0];
    const t=((b.p[0]-a.p[0])*b.d[1]-(b.p[1]-a.p[1])*b.d[0])/den;return [a.p[0]+t*a.d[0],a.p[1]+t*a.d[1]] as const;});
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
  // each brick is seated on the roof under it (owner 2026-10-19 sweep: on the Zubr and 2016 roofs some stood up to
  // 8 cm over it)
  for(const [x,y,z,pitch]of rows){
    P.destructibleCluster(`turret_era_${x<0?'L':'R'}`,()=>P.snapGroup('t72b3m-roof-era',()=>P.addExternalArmor('turret',
      markEraHitFaces(box(.160,.058,.362),[0,1,0]).rotateX(pitch),x-YAW[0],y-YAW[1],z-YAW[2]),{reachM:.10}));
  }
}

function bustle(P:TankBuilderPort,boxes=false):void {
  const cases:readonly(readonly[number,number,number,number])[]=[
    [-1.57548,.18880,-1.96081,1.93334],[-1.47929,-.12408,-1.96081,1.93334],[-1.34719,-.43498,-1.96081,1.93334],
    [-1.21581,-.72725,-1.96081,1.93334],[-1.06794,-1.01019,-1.96081,1.93334],
    [-.75405,-1.35976,-2.35861,1.96952],[-.42147,-1.56789,-2.79812,1.96952],[-.05395,-1.63409,-3.12707,1.96952],
    [.31475,-1.58214,2.84249,1.96952],[.64009,-1.43069,2.55228,1.96952],
    [.92650,-1.13733,1.96203,1.93334],[1.14576,-.88737,1.96203,1.93334],
    [1.26361,-.60051,1.96203,1.93334],[1.38204,-.31420,1.96203,1.93334],
  ];
  if(!boxes){
    // the fourteen measured cases (national concepts dock their own flank packs and cage feet against these)
    for(const [x,z,yaw,y]of cases){
      const g=boxSections([[-.193,.15478,.29573,-.263],[-.176,.15478,.290,-.29573],
        [.180,.15478,.166,-.265],[.193,.15478,.146,-.262]]).rotateY(yaw);
      topPart(P,'turretDetail',g,x,y,z);
      topPart(P,'turretDetail',box(.026,.48,.397).rotateY(yaw),x,y-.025,z);
      topPart(P,'turretDetail',beamBetween([x*.76,1.75,z*.76],[x,y-.22,z],.017),0,0,0);
    }
    return;
  }
  // 266 (familyFinish; blind critics: "a ring of narrow bricks, from behind it reads as a crown, not a bin"):
  // the fourteen measured case stations now carry five continuous stowage boxes, two a side and the rear bin, each a
  // closed loft through its stations' sections, in the cases' own envelope (inner and outer faces .193 either side of
  // each station, bottoms .265 under its datum, a flat-topped section with a chamfered outer edge whose tops stay within
  // the old cases' 2.08-2.27 band), so what stands on them (the 2022 canopy posts, the snorkel, the whip) keeps its seat.
  // Runs are separated by 2 cm seams; a latch on each station's outer face. The radial fins and the support beams of the
  // separate cases went with them.
  const half=.155,seam=.010;
  const station=(k:number,t=0)=>{const [x,z,yaw,y]=cases[k];
    const R=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw)),T=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
    return {p:new THREE.Vector3(x,0,z).addScaledVector(T,t),R,T,y,yaw};};
  const ring=({p,R,y}:{p:THREE.Vector3;R:THREE.Vector3;y:number}):V3[]=>([[-.193,-.265],[.193,-.262],[.193,.19],[.163,.22],
    [-.193,.27]] as const).map(([u,v])=>[p.x+R.x*u-YAW[0],y+v-YAW[1],p.z+R.z*u-YAW[2]] as const);
  for(const [k0,k1]of [[0,2],[3,4],[5,9],[10,11],[12,13]]){
    // the run's open ends lie half a case past its end stations, away from its neighbours, less half a seam
    const end=(k:number,next:number)=>{const s=station(k),n=station(next).p;
      const t=s.p.clone().addScaledVector(s.T,half).distanceTo(n)>s.p.clone().addScaledVector(s.T,-half).distanceTo(n)?1:-1;
      return station(k,t*(half-seam));};
    const rings=[end(k0,k0+1)];
    for(let k=k0;k<=k1;k++)rings.push(station(k));
    rings.push(end(k1,k1-1));
    P.addEquipment('turretDetail',loft(rings.map(ring)));
  }
  for(let k=0;k<cases.length;k++){const s=station(k);
    topPart(P,'turretDetail',box(.05,.06,.022).rotateY(s.yaw),s.p.x+s.R.x*.199,s.y+.05,s.p.z+s.R.z*.199);}
}

function roofEquipment(P:TankBuilderPort,antennaMasts=true):void {
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
  if(antennaMasts)for(const [x,z,top]of [[.225,-.791,2.904],[.077,-.534,2.627]]){
    topPart(P,'turretDetail',antennaPart(cylY(.025,top-2.327,16)),x,(top+2.327)/2,z);
    topPart(P,'turretDark',cylY(.037,.075,16),x,2.382,z);
  }
}

function smoke(P:TankBuilderPort):void {
  // Six actual right-side stocks in a3+2+1 bank, recessed closed mouths.
  for(const [x,y,z]of [[1.16,2.163,.085],[1.37,2.129,.145],[1.58,2.067,.199],
    [1.35,1.994,.242],[1.56,1.932,.296],[1.56,1.82,.36]]){
    const axis=new THREE.Vector3(.31,.38,.872).normalize(),g=markSmokeTube(blindTube(.041,.033,.218,.124,20),[0,0,1],true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),axis));
    topPart(P,'turretDark',g,x,y,z);
    topPart(P,'turretDetail',box(.29,.036,.095),x-.07,y-.07,z-.102);
  }
}

function machineGun(P:TankBuilderPort):void {
  topPart(P,'turretDetail',cylY(.395,.20,32),-.632,2.43,-.24);
  // Owner 2026-10-28 ("... show actual machine guns that need to be actual machine guns of current dimensions"): the
  // commander's Kord is the fleet's true-scale Kord in a working station (libraryRoofMg.ts), its pintle on the mount
  // drum's front (top 2.53), in place of the traced posts, stayed box and rods.
  libraryRoofMg(P,{station:'t72b3mCommanderKordStation',cls:'kord',seat:[-.70-YAW[0],2.53-YAW[1],.05-YAW[2]]});
}

function mainGun(P:TankBuilderPort,chinLift=0,finish=false):void {
  const muzzle=T72B3M_X_DATUMS.muzzleZ,floor=T72B3M_X_DATUMS.boreFloorZ,c=chinLift;
  KIT.buildGun(P,{len:floor-GUN[2],r:.085,baseR:.13,sleeve:false,collar:false});
  P.add('gunMount',cylX(.238,.61,32),0,0,0);
  P.add('gunMount',castSections([[.939,.27,.27,2.118,1.565+c,1.85],
    [1.334,.337,.337,2.108,1.566+c,1.86],[1.50,.300,.300,2.081,1.61+c,1.85],
    [1.791,.1606,.1606,1.98264,1.66135+c,1.82199]],GUN));
  // 266 (shared-base follow-up; blind critics: "the thermal sleeve reads too thin and plain"): on the B3M family's own
  // build (familyFinish) the 2A46M-5's fume extractor stands proud of the sleeve (r .1475, 295 mm, against the 243 mm
  // sleeve; it was 252 mm, under the sleeve's own 258 mm root), with short conical ends, and the sleeve carries its
  // clamp bands, seams and muzzle reference. The national concepts on this turret keep the measured sleeve their gun
  // curves were swept for (nationalGunMantlet: the fatter sleeve took the Hetman II's barrel to 7.7 mm of its rear rack).
  const sleeve:readonly(readonly[number,number,number,number])[]=finish?[[1.791,2.302,.12879,.11855],
    [2.3013,3.1700,.12129,.12129],[3.170,3.987,.11571,.11140],[3.987,4.050,.1200,.1475],[4.050,4.905,.1475,.1475],
    [4.905,5.0073,.1475,.1025],[5.0067,5.84385,.102544,.102544]]
    :[[1.791,2.302,.12879,.11855],[2.3013,3.1700,.12129,.12129],[3.170,3.987,.11571,.11140],[3.987,4.0365,.1222,.12607],
    [4.0365,4.962,.12607,.12607],[4.962,5.0073,.12258,.09258],[5.0067,5.84385,.102544,.102544]];
  for(const [a,b,ra,rb]of sleeve)P.add('gun',KIT.cylY(rb,ra,b-a,32).rotateX(Math.PI/2),0,0,(a+b)/2-GUN[2]);
  if(finish)sleeveHardware(P);
  // Scalar axial profile. Owner 2026-09-22 ("the point of adding holes instead of carving them
  // into the barrel is that we save on triangles"): the tube is closed at the source tip. Until
  // then the profile turned into the measured 125 mm bore (radius .0625) down to the source floor
  // 5.890883855316, a 0.697 m recess that sat entirely behind the factory's dark mouth disc; the
  // depth stays recorded here and in t72b3mXGeometry.selftest.mjs (SOURCE.floor).
  const tubeProfile:readonly(readonly[number,number])[]=[[0,5.84385],[.098435,5.84385],
    [.098435,6.294786],[.09313,6.300016],[.09313,6.448276],[.103942,6.452386],
    [.103942,6.581836],[.09945,muzzle],[0,muzzle]];
  P.add('gun',new THREE.LatheGeometry(tubeProfile.map(([r,z])=>new THREE.Vector2(r,z)),32).rotateX(Math.PI/2),0,0,-GUN[2]);
  for(const z of [2.325,3.142,3.963])P.add('gun',torus(.126,.009,32,6).rotateX(Math.PI/2),0,0,z-GUN[2]);
  P.muzzleZ=muzzle-GUN[2];
}

// The thermal sleeve's joints, seam and muzzle reference (266): a flat clamp band at every sleeve joint (the three
// measured clamp rings at z 2.325, 3.142 and 3.963 keep their 135 mm beads on the bands, t72b3mXGeometry's bore receipt),
// two more at the extractor's front and the sleeve's front end, a tightening lug with its bolt on top of each, the
// sleeve's raised seam strip along the top of each segment, and the muzzle reference mirror's saddle and shroud 30 cm
// behind the muzzle ring. All of it lies inside the measured tube's length (the metal tip stays the source muzzle).
function sleeveHardware(P:TankBuilderPort):void {
  const at=(z:number)=>z-GUN[2];
  const bands:readonly(readonly[z:number,r:number,w:number])[]=[[2.325,.1335,.085],[3.142,.1335,.085],[3.963,.1285,.070],
    [4.996,.1160,.070],[5.815,.1160,.070]];
  for(const [z,r,w]of bands){
    P.add('gun',KIT.cylY(r,r,w,32).rotateX(Math.PI/2),0,0,at(z));
    P.add('gun',box(.052,.030,.044),0,r+.012,at(z));
    P.add('gun',cylX(.0085,.080,10),0,r+.019,at(z));
  }
  for(const z of [4.996,5.815])P.add('gun',torus(.110,.008,32,6).rotateX(Math.PI/2),0,0,at(z));
  // the extractor's end lips
  for(const z of [4.062,4.893])P.add('gun',KIT.cylY(.1505,.1505,.020,32).rotateX(Math.PI/2),0,0,at(z));
  // seam strips: [from, to, sleeve radius at each end], seated 2 mm into the sleeve's top
  for(const [a,b,ra,rb]of [[1.800,2.292,.1284,.1189],[2.358,3.109,.12129,.12129],[3.175,3.933,.1157,.1116],
    [5.023,5.788,.102544,.102544]]){
    const strip=(y:number)=>[[-.012,y-.002],[.012,y-.002],[.012,y+.008],[-.012,y+.008]] as const;
    P.add('gun',sectionSolid([{z:at(a),ring:strip(ra)},{z:at(b),ring:strip(rb)}]));
  }
  // muzzle reference: a saddle clamp on the bare tube under the whole of the mirror's shroud, its window facing the turret
  P.add('gun',KIT.cylY(.1085,.1085,.190,32).rotateX(Math.PI/2),0,0,at(6.218));
  P.add('gun',sectionSolid([{z:at(6.125),ring:[[-.058,.100],[.058,.100],[.058,.155],[-.058,.155]]},
    {z:at(6.190),ring:[[-.058,.100],[.058,.100],[.058,.197],[-.058,.197]]},
    {z:at(6.310),ring:[[-.058,.100],[.058,.100],[.058,.197],[-.058,.197]]}]));
  P.add('gunDark',box(.090,.006,.050).rotateX(-.574),0,.177,at(6.157));
}

/** Options for carrying the T-72B3M hull under a national package. Each defaults to the T-72B3M's own output.
 * `nativeEra: false` drops its Relikt glacis sheet and straps and its side-skirt Relikt boxes with their backing
 * strips (the rubber curtains stay: under a national hull's own fitted skirt banks their top edges tuck into the banks'
 * undersides), and with them the side mounts that only those boxes carried (t72b3mXSideMounts skirtEra: the rearmost
 * upper links and the open rail fields' four lower strips); `glacisLamps: false` drops the two round glacis headlights and their guards.
 * (2026-10-16, release 227: Hetman II's own frontal package replaces them; its fitted skirt banks buried the boxes.)
 * `sweptStrap: false` drops the two right deck-cover straps within 1.4 m of the turret's yaw axis (z .22 and .55): they
 * stand 2 cm over their covers, into the path of the T-72B3M turret's mantlet, whose foot rides 4 mm over the covers at
 * yaw -57 to -99 (release 227, round 2: Hetman II's whole-gun sweep). */
interface T72B3MXHullOptions { nativeEra?:boolean; glacisLamps?:boolean; sweptStrap?:boolean; lowDeckCrown?:boolean;
  /** false (267): the reactive cover stays, without the 2016's containers, plates, bolts and splash board over it, for a
   * frontal package that lays its own glacis blocks on the bare cover (buildT72B3MX: wherever the cheek cells give way to
   * the build's own, the obr. 2022's t72b3m2022Kit.ts). */
  glacisContainers?:boolean;
  /** false (267): no rounded front mudguards or their turned-down lips, for a hull whose own front fender housings stand
   * there (the BMPT Terminator's AG-17D boxes, bmptTerminator.ts); the deck under them stays. */
  roundedFrontGuards?:boolean;
  /** 267: skirt runs [side, rear z, front z] left without their Relikt cassettes (skirtSpanOpen). */
  openSkirtSpans?:readonly OpenSkirtSpan[];
}

export function buildT72B3MXHull(P:TankBuilderPort,options:T72B3MXHullOptions={}):void {
  P.hullG.position.set(0,0,0);
  hull(P,options.nativeEra!==false,options.roundedFrontGuards!==false);runningGear(P);hullCassettes(P,options.nativeEra!==false,options.glacisContainers!==false,options.openSkirtSpans??OPEN_NONE);deckEquipment(P,options.glacisLamps!==false,options.sweptStrap!==false,options.lowDeckCrown===true);rearEquipment(P);
}

export function buildT72B3MX(P:TankBuilderPort,turretOptions:T72B3MXTurretOptions={},hullOptions:T72B3MXHullOptions={}):void {
  P.hullG.position.set(0,0,0);P.turretG.position.set(...YAW);
  P.topY=T72B3M_X_DATUMS.highestFittingM-YAW[1];
  buildT72B3MXHull(P,hullOptions);buildT72B3MXTurret(P,{familyFinish:true,...turretOptions});
}

/** Options for reusing the T-72B3M turret on another hull. A vehicle whose own
 * fitted remote station replaces the commander's Kord omits it and its drum
 * (one working roof gun, never a duplicate); one whose station's barrel sweeps
 * the two rear roof masts omits them and fits its own outside that sweep. */
export interface T72B3MXTurretOptions {
  commanderGun?:boolean; antennaMasts?:boolean;
  /** false drops the nine Relikt cheek cells with their nine support beams and the 33 roof cassettes (a national
   * concept that fits its own frontal package on this turret, release 227). */
  reliktEra?:boolean;
  /** false drops only the nine Relikt cheek cells and their beams, keeping the roof cassettes: the T-72B3M obr. 2022
   * (t72b3m2022Kit.ts, 266) lays its own boxed cheek containers. */
  cheekEra?:boolean;
  /** Metres the cast mantlet's underside is raised at each of its four stations (default 0, the T-72B3M's own). Release
   * 230 (UA/PL round 11; the gun-depression lane's census, 2026-10-21: the mantlet's underside passes 6-18 mm over the
   * driver's hatch and periscope at yaw 0-25, and over the right deck cover at yaw -48..-133, at every pitch, which no
   * depression stop cures): a concept whose gun must clear its hull by 20 mm takes a shallower chin. The trunnion boss
   * (radius .238, 19 mm over the stock underside) stays inside the lifted mantlet for a lift up to .016. */
  mantletChinLift?:number;
  /** true (the T-72B3M family's own build, buildT72B3MX: t72b3m_2016 and t72b3m_2022; 266) lays the family finish: five
   * continuous stowage boxes on the fourteen measured case stations, and the cheek cassettes raised, flattened and
   * deepened into a solid brow over container bodies (cheekCellPlane). Omitted, the turret keeps the fourteen measured
   * cases and the measured cheek cassettes, which the national concepts on this turret (nationalDonorTurrets.ts:
   * t72b3m_hetman, t72b3m_hetman_ii, t72b3_zubr, t72b3_zubr_ii) dock their own flank packs and roof-cage feet against. */
  familyFinish?:boolean;
}

/** The complete T-72B3M (2016) turret in its own turret frame (the turret ring
 * centre is the origin): cast shell, Relikt cheek and roof cassettes, bustle
 * screen boxes, roof equipment, smoke, the commander's gun and the main gun.
 * The caller places P.turretG on its hull's ring. */
export function buildT72B3MXTurret(P:TankBuilderPort,options:T72B3MXTurretOptions={}):void {
  P.gunG.position.set(GUN[0]-YAW[0],GUN[1]-YAW[1],GUN[2]-YAW[2]);
  turret(P);
  const finish=options.familyFinish===true;
  if(options.reliktEra!==false){if(options.cheekEra!==false)cheekCassettes(P,finish);roofCassettes(P);}
  bustle(P,finish);roofEquipment(P,options.antennaMasts!==false);smoke(P);
  if(options.mantletChinLift!==undefined&&!(options.mantletChinLift>=0&&options.mantletChinLift<=.016))
    throw new RangeError(`mantletChinLift ${options.mantletChinLift}: 0 to .016 m (the trunnion boss stays inside)`);
  if(options.commanderGun!==false)machineGun(P);mainGun(P,options.mantletChinLift??0,finish);
}
export const T72B3M_X_PROFILES={t72b3m_2016:{build:(P:TankBuilderPort):void=>buildT72B3MX(P)}} as const;

/** Native mechanical foundation for owner-authorized complete hull rebuilds. */
export function buildT72B3MXRunningGear(P:TankBuilderPort):void { runningGear(P); }

/** Native upper track decks, rounded front guards and flexible rear leaves.
 * The donor hull, running gear, side cassettes and curtains are not emitted. */
export function buildT72B3MXFenders(P:TankBuilderPort):void {
  for(const side of [-1,1])fenders(P,side);
}
