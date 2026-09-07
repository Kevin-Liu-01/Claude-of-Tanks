// Original closed equipment primitives from independently measured source
// planes and section dimensions. No reference topology enters the runtime.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const YAW=[-.03904,1.56289,.16819] as const;
const {box,cylY}=KIT;
function put(P:TankBuilderPort,slot:string,g:THREE.BufferGeometry,x=0,y=0,z=0,ry=0):void {
  P.addEquipment(slot,g,x-YAW[0],y-YAW[1],z-YAW[2],0,ry);
}

function clippedPlan(width:number,depth:number,clip:number):[number,number][] {
  const x=width/2,z=depth/2;
  return[[-x,-z+clip],[-x+clip,-z],[x-clip,-z],[x,-z+clip],
    [x,z-clip],[x-clip,z],[-x+clip,z],[-x,z-clip]];
}

function uprightCase(width:number,depth:number,bottom:number,top:number,clip:number):THREE.BufferGeometry {
  const ring=clippedPlan(width,depth,clip);
  return sectionSolid([{z:bottom,ring},{z:top,ring}]).rotateX(-Math.PI/2);
}

function sightOpening():THREE.Shape {
  const p=new THREE.Shape(),r=.0647,halfStraight=.02955,y=2.96864;
  p.moveTo(-r,y-halfStraight);p.lineTo(-r,y+halfStraight);
  p.absarc(0,y+halfStraight,r,Math.PI,0,true);
  p.lineTo(r,y-halfStraight);p.absarc(0,y-halfStraight,r,0,-Math.PI,true);
  p.closePath();return p;
}

function nightRainCap(P:TankBuilderPort):void {
  // Object_12:6556 is a separate 10.7mm horizontal cap with two small
  // corner facets per quadrant. The complete source leaves a 6.9–8.3mm
  // floating gap; only the two concealed mounting spacers are inferred.
  const ring:[number,number][]=[];
  for(let quadrant=0;quadrant<4;quadrant++) {
    const angle=quadrant*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
    for(const [x,z]of[[-.1561,-.1118],[-.1401,-.1401],[-.1118,-.1561]])
      ring.push([x*c-z*s,(x*s+z*c)*(.3121/.3122)]);
  }
  const cap=sectionSolid([{z:3.08439,ring},{z:3.09509,ring}]).rotateX(-Math.PI/2);
  put(P,'turretDetail',cap,-.24744,0,-.17576);
  for(const x of [-.290,-.205])
    put(P,'turretDetail',box(.016,.012,.020),x,3.0798,-.180);
}

function nightSight(P:TankBuilderPort):void {
  // Object_12:1908 continues above the low rim only at this narrow pedestal.
  put(P,'turretDetail',uprightCase(.2181,.2229,2.704,2.827,.022),-.24839,0,-.17516);
  put(P,'turretDetail',uprightCase(.253,.2568,2.825,2.84709,.027),-.24829,0,-.17531);
  // The actual head is a clipped vertical box, not a horizontal round tube.
  const x=-.24764,low=2.84709,top=3.07659,back=-.30561,front=-.04551;
  const ring=[[-.1308,low],[.1308,low],[.1308,top-.023],
    [.1078,top],[-.1078,top],[-.1308,top-.023]] as [number,number][];
  put(P,'turretDetail',sectionSolid([{z:back,ring},{z:-.08851,ring}]),x);
  const face=new THREE.Shape();
  face.moveTo(...ring[0]);for(const v of ring.slice(1))face.lineTo(...v);face.closePath();
  face.holes.push(sightOpening());
  const skin=new THREE.ExtrudeGeometry(face,{depth:front+.08851,bevelEnabled:false,curveSegments:20});
  put(P,'turretDetail',skin,x,0,-.08851);
  // Retain the exact observed front plane. A 4 mm inward glazing volume
  // (concealed thickness inferred) engages the rear case by 1 mm and gives
  // the damage/inspection model a physical part, not a zero-depth sheet.
  const pane=new THREE.ExtrudeGeometry(sightOpening(),{depth:.004,bevelEnabled:false,curveSegments:20});
  put(P,'turretGlass',pane.translate(0,0,-.004),x,0,-.08551);
  nightRainCap(P);
}

export function addAmx40Cupola(P:TankBuilderPort):void {
  // The broad lower cast foot has vertical sides; its upper shoulder narrows
  // to the periscope band. The old conical foot and 141mm false rim are absent.
  put(P,'turretDetail',cylY(.577,.577,.1691,40),-.5589,2.46324,-.225);
  put(P,'turretDetail',cylY(.454,.471,.1567,40),-.5589,2.62614,-.225);
  put(P,'turretDetail',cylY(1,1,.04010,32).scale(.32685,1,.2654),-.60819,2.72354,-.27491);
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4+.24;
    put(P,'turretDetail',box(.157,.082,.034),-.5589+Math.sin(a)*.455,
      2.63269,-.225+Math.cos(a)*.455,a);
    put(P,'turretGlass',box(.132,.0654,.004),-.5589+Math.sin(a)*.475,
      2.63269,-.225+Math.cos(a)*.475,a);
  }
  nightSight(P);
}

export function addAmx40LauncherGuard(P:TankBuilderPort):void {
  // The supplied tank carries this open guard on the left bank only. These
  // are an original bent-rod spine fit to its principal line/bend stations.
  const points=[[-1.069,1.855,1.232],[-1.28,1.865,1.214],[-1.322,1.93,1.185],
    [-1.330,2.10,1.1701],[-1.331,2.325,1.166],[-1.294,2.394,1.205],[-1.195,2.395,1.276],
    [-1.08,2.361,1.348],[-.882,2.291,1.353]];
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal');
  put(P,'turretDetail',new THREE.TubeGeometry(curve,48,.013,8,false));
}

export function addAmx40RearInsulator(P:TankBuilderPort,x:number):void {
  // Object_12:13425/13747 have a broad low casting, a much narrower stock,
  // then a 36.2-to-10.8mm tapered neck. They are not full-height 130mm cones.
  // The lowest 6.5mm overlaps the retained attachment foot; whip transforms
  // and endpoints stay unchanged and overlap the source neck above2.64721.
  const profile=[[0,2.235],[.0664,2.235],[.0664,2.32459],
    [.03707,2.32459],[.03328,2.42709],[.0181,2.44079],
    [.0054,2.74059],[0,2.74059]];
  put(P,'turretDetail',new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),24),x,0,-1.693);
}

export function addAmx40FrontInsulator(P:TankBuilderPort):void {
  // Object_12:5818: 9.3mm base flare, vertical lower drum, two shoulder
  // tapers, and the thin upper neck. These are independently measured
  // radial/height stations; the source's 5.11445m whip remains untouched.
  const profile=[[0,2.38349],[.09005,2.38349],[.07835,2.39349],
    [.07835,2.49209],[.04515,2.49209],[.03227,2.54079],
    [.01785,2.55119],[.00955,2.82659],[0,2.82659]];
  put(P,'turretDetail',new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),36),.7195,0,.7057);
}

type RollRow=readonly[z:number,left:number,right:number,bottom:number,top:number];
function roll(P:TankBuilderPort,rows:readonly RollRow[]):void {
  const geometry=sectionSolid(rows.map(([z,left,right,bottom,top])=>({z,
    ring:Array.from({length:16},(_,i)=>{
      const a=2*Math.PI*i/16;
      return[(left+right)/2+Math.cos(a)*(right-left)/2,
        (bottom+top)/2+Math.sin(a)*(top-bottom)/2] as [number,number];
    }),
  })));
  put(P,'turretDetail',geometry);
}

function sideCases(P:TankBuilderPort):void {
  // Two rigid canted cases, distinct from the three soft rolls. Their
  // approximately planar walls use original clipped rectangular sections.
  for(const [x,z,low,high,width,depth,yaw,lean]of[
    [1.363,-.0816,1.7461,2.1157,.208,.343,-.044,-.038],
    [-1.326,.3815,1.7155,2.0617,.202,.284,.236,.045],
  ]) {
    const shape=sectionSolid([[low,.90],[low+.018,1],[high-.025,1],[high,.80]].map(([y,scale])=>({z:y,
      ring:clippedPlan(width*scale,depth*scale,.019).map(([u,v])=>
        [u+lean*((y-low)/(high-low)-.5),v] as [number,number]),
    }))).rotateX(-Math.PI/2);
    shape.rotateY(yaw).translate(x,0,z);
    const p=shape.attributes.position;
    for(let i=0;i<p.count;i++)if(p.getY(i)>=high-.025001) {
      const crown=x>0?2.101597-.55636*(p.getX(i)-1.363)+.10455*(p.getZ(i)+.1)
        :2.03751+.38309*(p.getX(i)+1.326)-.23353*(p.getZ(i)-.4);
      p.setY(i,crown+p.getY(i)-high);
    }
    shape.computeVertexNormals();put(P,'turretDetail',shape);
  }
}

export function addAmx40CastNose(P:TankBuilderPort):void {
  // The source cast nose is two closed lips around a front-open recess.
  // Joining a single collapsing terminal row erased the upper lip and filled
  // its lower air. These independently measured scalar section planes retain
  // that concavity without modifying the separate apron or pitching mantlet.
  const lower=[
    [1.279,-1.13545,1.00196,1.68851,1.948],
    [1.30,-1.12889,.98965,1.68987,1.91486],
    [1.35,-1.11327,.96034,1.69311,1.78631],
    [1.40,-1.09765,.93103,1.69635,1.73290],
    [1.44,-1.08516,.90758,1.69895,1.70370],
    [1.442,-1.084,.9064,1.69918,1.70224],
  ];
  P.add('turret',sectionSolid(lower.map(([z,l,r,b,t])=>({z,ring:[
    [l,b],[r,b],[r,t],[l,t],
  ]}))).translate(-YAW[0],-YAW[1],-YAW[2]));
  const upper=[[1.279,1.9585,2.27840],[1.30,2.01840,2.27178],
    [1.35,2.13200,2.25633],[1.40,2.17649,2.24128],
    [1.430,2.18973,2.23256],[1.435,2.19194,2.20778]];
  const left=(y:number,z:number)=>-.95+(y-2.204341+.82756*(z-1.2))/2.48572;
  const right=(y:number,z:number)=>.95-(y-2.103592+.94599*(z-1.2))/2.92314;
  P.add('turret',sectionSolid(upper.map(([z,b,t])=>({z,ring:[
    [left(b,z),b],[right(b,z),b],[right(t,z),t],[left(t,z),t],
  ]}))).translate(-YAW[0],-YAW[1],-YAW[2]));
}

export function addAmx40SideStowage(P:TankBuilderPort):void {
  // Object_8:431/807/166 supply scalar cross-section spans, not a sampled
  // contour. These are independently authored elliptical longitudinal rolls.
  roll(P,[[-1.688,1.20,1.37,1.88,2.04],[-1.50,1.106,1.431,1.798,2.121],
    [-1.20,1.109,1.490,1.803,2.171],[-.90,1.143,1.5195,1.8134,2.1593],
    [-.55,1.162,1.506,1.7926,2.1455],[-.474,1.245,1.45,1.87,2.07]]);
  roll(P,[[-.7664,-1.48,-1.35,1.85,1.99],[-.55,-1.4763,-1.1757,1.7674,2.0986],
    [-.35,-1.5262,-1.1794,1.7617,2.1345],[-.10,-1.5287,-1.2236,1.7502,2.0987],
    [.0181,-1.45,-1.28,1.825,2.03]]);
  roll(P,[[.1846,1.275,1.455,1.85,2.05],[.25,1.2036,1.4927,1.7633,2.1907],
    [.40,1.1517,1.5086,1.7446,2.1981],[.55,1.2048,1.4347,1.7568,2.1222],
    [.6197,1.26,1.385,1.86,2.02]]);
  sideCases(P);
}
