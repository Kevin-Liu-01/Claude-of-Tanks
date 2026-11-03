// The T-80UK command fit on the complete T-80U source-X build (buildT80UX): the parts the commander's version carries
// that the line tank lacks. 267 (blind critics on grey close-ups, both FIX; coordinator brief): the real T-80UK adds the
// R-163-50U / R-163-50K radio pair (inside the turret; outside, two whip antennas on insulated mounts at the turret
// rear), the Shtora-1 laser-warning heads on the turret roof front, the DVE-BS crosswind sensor mast at the rear of the
// roof, and the AB-1-P/30 auxiliary power unit in an armoured box on the left rear fender; the field stowage basket and
// its canvas roll ride the turret rear. The commander's sight is the twin's own (t80uX.ts commanderSightHead), so no
// second sensor head stands on the roof. Every part is seated on what carries it by a ray onto that stock, its foot
// SEAT_M into it. Turret parts in the turret frame (the ring centre, the casting raised T80U_X_RING_RAISE_M with it),
// hull parts in the hull frame. First-party construction: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {beamBetween} from './measuredPrimitives.ts';
import {sectionSolid,type SectionPoint} from './sectionSolid.ts';
import {antennaPart} from './antennaPart.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
type Point=readonly[number,number,number];
const {box,cylX,cylZ}=KIT;
const cylY=(r:number,h:number,n=16,r2?:number)=>KIT.cylY(r,r2??r,h,n);
/** How far a part's foot stands into the stock that carries it. */
const SEAT_M=.008;

/** The stock a part may seat on: the rig's own buckets as raycast meshes (reactive cassettes left out). */
function stock(P:TankBuilderPort,buckets:readonly string[]):{meshes:THREE.Mesh[];dispose:()=>void}{
  const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),meshes:THREE.Mesh[]=[];
  P.forEachBucketPart([...buckets],g=>{if(g.userData.eraHitFaceVertexStarts)return;const m=new THREE.Mesh(g,mat);m.updateMatrixWorld();meshes.push(m);});
  return {meshes,dispose:()=>mat.dispose()};
}
/** The first stock surface along a ray (the rig frame), or a thrown error naming the part. */
function hit(meshes:THREE.Mesh[],from:Point,dir:Point,what:string,id:string):THREE.Vector3{
  const h=new THREE.Raycaster(new THREE.Vector3(...from),new THREE.Vector3(...dir).normalize()).intersectObjects(meshes)[0];
  if(!h)throw new Error(`${id}: T-80UK command fit finds no seat for ${what}`);
  return h.point;
}
const TURRET_STOCK=['turret','turretDetail','turretEquipment','turretDark'] as const;
const HULL_STOCK=['hull','hullDetail'] as const;
const lathe=(profile:readonly(readonly[number,number])[],n=20)=>new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),n);

// ---- turret roof ------------------------------------------------------------------------------------------------------

/** A Shtora-1 TShU-1-11 laser-warning head: a bolted foot flange, a short neck and a drum head with a domed top, its
 * dark receiving window to the front. */
function laserWarningHead(P:TankBuilderPort,x:number,z:number,roof:number):void{
  const y0=roof-SEAT_M;
  P.addEquipment('turretDetail',lathe([[0,y0],[.055,y0],[.055,y0+.010],[.050,y0+.014],[.030,y0+.016],[.028,y0+.058],
    [.060,y0+.064],[.062,y0+.070],[.062,y0+.150],[.052,y0+.166],[.030,y0+.176],[0,y0+.179]],24),x,0,z);
  P.addEquipment('turretDark',cylZ(.040,.010,20),x,y0+.110,z+.058);
  for(const a of [Math.PI/4,3*Math.PI/4,5*Math.PI/4,7*Math.PI/4])
    P.addEquipment('turretDark',cylY(.0065,.006,6),x+.045*Math.cos(a),y0+.0155,z+.045*Math.sin(a));
}

/** The DVE-BS crosswind sensor: a folding mast on a hinge block at the rear of the roof, its sensor head on top. The mast
 * and head take the antenna seat role (antennaPart): a thin mast is not the turret's body. */
function windSensorMast(P:TankBuilderPort,x:number,z:number,roof:number):void{
  const y0=roof-SEAT_M,hinge=y0+.055,top=hinge+.56;
  P.addEquipment('turretDetail',sectionSolid([{z:z-.045,ring:[[x-.040,y0],[x+.040,y0],[x+.040,y0+.040],[x+.024,y0+.070],
    [x-.024,y0+.070],[x-.040,y0+.040]]},{z:z+.045,ring:[[x-.040,y0],[x+.040,y0],[x+.040,y0+.040],[x+.024,y0+.070],
    [x-.024,y0+.070],[x-.040,y0+.040]]}]));
  P.addEquipment('turretDark',cylX(.012,.096,10),x,hinge,z);
  P.addEquipment('turretDetail',antennaPart(cylY(.017,top-hinge,12,.020)),x,(hinge+top)/2,z);
  P.addEquipment('turretDetail',antennaPart(lathe([[0,top-.006],[.034,top-.006],[.036,top+.064],[.030,top+.078],[0,top+.082]],16)),x,0,z);
  P.addEquipment('turretDark',antennaPart(box(.004,.050,.070)),x,top+.040,z-.060);
}

/** An R-163 whip on its insulated mount: a bolted flange, the cylindrical insulator base, the conical insulator, the
 * coil-spring foot and the cable gland, then the whip in three sections with joint collars and a tip cap, leaning
 * back WHIP_LEAN. The whip takes the antenna seat role (antennaPart). */
const WHIP_LEAN=.07,WHIP_SECTIONS=[[.0105,1.05],[.0085,1.00],[.0065,.95]] as const;
function antennaMount(P:TankBuilderPort,x:number,z:number,roof:number,side:number):void{
  const y0=roof-SEAT_M;
  P.addEquipment('turretDetail',lathe([[0,y0],[.068,y0],[.068,y0+.012],[.062,y0+.016],[.046,y0+.016],[.046,y0+.080],
    [.040,y0+.086],[.040,y0+.090],[.020,y0+.160],[.016,y0+.166],[0,y0+.166]],24),x,0,z);
  for(let k=0;k<6;k++){const a=k*Math.PI/3+Math.PI/6;
    P.addEquipment('turretDark',cylY(.0075,.007,6),x+.057*Math.cos(a),y0+.0155,z+.057*Math.sin(a));}
  // the cable gland on the base's inboard side and its cable into the roof
  P.addEquipment('turretDark',cylX(.016,.050,10),x-side*.060,y0+.045,z);
  P.addEquipment('turretDark',new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x-side*.082,y0+.045,z),
    new THREE.Vector3(x-side*.115,y0+.035,z),new THREE.Vector3(x-side*.130,y0+.004,z)]),10,.0085,8));
  // the coil-spring foot over the insulator, then the whip, both turned back WHIP_LEAN about the spring's foot
  const foot=new THREE.Vector3(x,y0+.164,z),lean=new THREE.Matrix4().makeRotationX(-WHIP_LEAN),turns=6,coilH=.090;
  const coil:THREE.Vector3[]=[];
  for(let i=0;i<=turns*16;i++){const t=i/16*Math.PI*2;coil.push(new THREE.Vector3(.019*Math.cos(t),coilH*i/(turns*16),.019*Math.sin(t)));}
  const place=(g:THREE.BufferGeometry)=>g.applyMatrix4(lean).translate(foot.x,foot.y,foot.z);
  P.addEquipment('turretDark',place(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil),turns*16,.0055,6)));
  P.addEquipment('turretDark',place(cylY(.014,.020,12).translate(0,coilH+.006,0)));
  let y=coilH+.016;
  WHIP_SECTIONS.forEach(([r,len],i)=>{
    P.addEquipment('turretDark',antennaPart(place(cylY(r,len,8,r*1.12).translate(0,y+len/2,0))));
    y+=len;
    if(i<WHIP_SECTIONS.length-1)P.addEquipment('turretDark',antennaPart(place(cylY(r*1.6,.032,8).translate(0,y,0))));
  });
  P.addEquipment('turretDark',antennaPart(place(new THREE.SphereGeometry(.013,10,6).translate(0,y+.004,0))));
}

// ---- turret rear: the stowage basket and its canvas roll --------------------------------------------------------------

/** Plan of the basket in the turret frame: behind the stowed OPVT snorkel (its back at z -1.741), its inner side
 * straight along the tube, its outer side following the turret's rounded rear (0.30 m deep at the ends, 0.40 m at the
 * centre line). */
const BASKET={halfW:.86,inner:-1.772,depthEnd:.30,depthMid:.40,floor:.088,height:.34} as const;
const basketOuter=(x:number)=>BASKET.inner-(BASKET.depthEnd+(BASKET.depthMid-BASKET.depthEnd)*(1-(x/BASKET.halfW)**2));
function rearBasket(P:TankBuilderPort,meshes:THREE.Mesh[]):void{
  const {halfW:W,inner:zi,floor:yf,height:H}=BASKET,yt=yf+H;
  const rail=(a:Point,b:Point,r=.013)=>P.addEquipment('turretDetail',beamBetween(a,b,r,10));
  const curve=(y:number)=>new THREE.CatmullRomCurve3(Array.from({length:13},(_,i)=>{const x=-W+2*W*i/12;return new THREE.Vector3(x,y,basketOuter(x));}));
  // the frame: outer rails along the curve, inner rails straight along the tube, end rails, corner posts
  for(const y of [yf,yt])P.addEquipment('turretDetail',new THREE.TubeGeometry(curve(y),48,.013,8));
  for(const y of [yf,yt])rail([-W,y,zi],[W,y,zi]);
  for(const s of [-1,1])for(const y of [yf,yt])rail([s*W,y,zi],[s*W,y,basketOuter(s*W)]);
  for(const s of [-1,1])for(const z of [zi,basketOuter(s*W)])rail([s*W,yf-.013,z],[s*W,yt+.013,z],.015);
  // posts every sixth of the outer curve, and the bar screen between them
  for(let i=1;i<6;i++){const x=-W+2*W*i/6;rail([x,yf,basketOuter(x)],[x,yt,basketOuter(x)],.012);}
  for(let i=1;i<24;i++){if(i%4===0)continue;const x=-W+2*W*i/24;
    P.addEquipment('turretOpenLattice',beamBetween([x,yf,basketOuter(x)],[x,yt,basketOuter(x)],.0065,6));}
  for(const s of [-1,1])for(let i=1;i<4;i++){const z=zi+(basketOuter(s*W)-zi)*i/4;
    P.addEquipment('turretOpenLattice',beamBetween([s*W,yf,z],[s*W,yt,z],.0065,6));}
  // the slatted floor: slats front to back on two bearers across the basket
  for(const f of [.33,.72]){const pts=Array.from({length:13},(_,i)=>{const x=-W+2*W*i/12;return new THREE.Vector3(x,yf-.010,zi+(basketOuter(x)-zi)*f);});
    P.addEquipment('turretDetail',new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),36,.010,6));}
  for(let i=0;i<=16;i++){const x=-W+.06+(2*W-.12)*i/16,zo=basketOuter(x);
    P.addEquipment('turretOpenLattice',box(.032,.008,Math.abs(zo-zi)-.010).translate(x,yf+.002,(zi+zo)/2));}
  // two brackets from the casting's rear wall under the tube to the inner bottom rail, each on a foot plate with a
  // diagonal stay up to the inner top rail
  for(const s of [-1,1]){
    const x=s*.32,wall=hit(meshes,[x,.066,-2.6],[0,0,1],'a basket bracket',P.spec.id),zw=wall.z+SEAT_M;
    P.addEquipment('turretDetail',box(.075,.095,.014).translate(x,.066,wall.z-.007+SEAT_M*.5));
    P.addEquipment('turretDetail',sectionSolid([{z:zi-.004,ring:[[x-.012,yf-.032],[x+.012,yf-.032],[x+.012,yf+.004],[x-.012,yf+.004]]},
      {z:zw,ring:[[x-.012,.066-.040],[x+.012,.066-.040],[x+.012,.066+.020],[x-.012,.066+.020]]}]));
    rail([x,yf-.010,zi-.010],[x,yt,zi],.010);
    for(const dx of [-.025,.025])P.addEquipment('turretDark',cylZ(.008,.012,6).translate(x+dx,.066,wall.z-.013));
  }
}

/** The crew's canvas roll lying across the basket floor: a soft roll (its radius swelling between three webbing straps
 * and its ends rounded) whose straps run round it, buckle on top and lash to the outer bars. */
function canvasRoll(P:TankBuilderPort):void{
  const {floor:yf}=BASKET,L=1.18,R=.105,zc=(BASKET.inner+basketOuter(0))/2-.015,yc=yf+R+.004-.006;
  const straps=[-.40,0,.40];
  const prof:[number,number][]=[[0,-L/2]];
  for(let i=0;i<=40;i++){const s=-L/2+L*i/40,u=Math.abs(s)/(L/2);
    const pinch=Math.min(...straps.map(q=>Math.abs(s-q)))<.025?.92:1;
    const end=u>.86?Math.sqrt(Math.max(0,1-((u-.86)/.14)**2)):1;
    prof.push([R*pinch*(.96+.04*Math.cos(s*9))*Math.max(.25,end),s]);}
  prof.push([0,L/2]);
  // a lathe about y, laid along x, flattened 12 % where it rests (a soft roll settles)
  const roll=lathe(prof,28).rotateZ(Math.PI/2).scale(1,.88,1).translate(0,yc-R*.12,zc);
  P.addEquipment('turretCloth',roll);
  for(const q of straps){
    const ring:THREE.Vector3[]=[];
    for(let i=0;i<=32;i++){const t=i/32*Math.PI*2;ring.push(new THREE.Vector3(q,yc-R*.12+Math.sin(t)*R*.88*.93,zc+Math.cos(t)*R*.93));}
    P.addEquipment('turretDark',new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ring,true),32,.006,4,true));
    P.addEquipment('turretDark',box(.040,.012,.034).translate(q,yc-R*.12+R*.88*.93+.004,zc));
    // the lashing from the roll's outer side to the outer rail of the basket
    const zo=basketOuter(q);
    P.addEquipment('turretDark',beamBetween([q,yc-R*.12,zc-R*.95],[q,yf+.018,zo+.012],.005,5));
  }
}

// ---- hull: the auxiliary power unit ------------------------------------------------------------------------------------

/** The AB-1-P/30 auxiliary power unit's armoured box on the left rear fender's deck plate (top 1.542, x 1.103-1.597):
 * a closed box chamfered along its outboard top edge, its hinged lid with two knuckles inboard, two latches and a lifting
 * handle, the exhaust outlet turned down out of its outboard face, a louvred intake on its rear face, and the cable
 * conduit from its inboard face down into the hull's side deck. */
const APU={x0:1.14,x1:1.56,z0:-2.72,z1:-2.26,top:1.80} as const;
function auxiliaryPowerUnit(P:TankBuilderPort,meshes:THREE.Mesh[]):void{
  const {x0,x1,z0,z1,top}=APU;
  const seat=Math.min(...[[x0+.03,z0+.03],[x1-.03,z0+.03],[x0+.03,z1-.03],[x1-.03,z1-.03]].map(([x,z])=>
    hit(meshes,[x,2.5,z],[0,-1,0],'the APU box',P.spec.id).y)),y0=seat-SEAT_M;
  const body:SectionPoint[]=[[x0,y0],[x1,y0],[x1,top-.055],[x1-.050,top],[x0+.012,top],[x0,top-.012]];
  P.addEquipment('hullDetail',sectionSolid([{z:z0,ring:body},{z:z1,ring:body}]));
  // the lid, 3 mm into the box top, and its hinge knuckles along the inboard edge
  const lid:SectionPoint[]=[[x0+.020,top-.003],[x1-.060,top-.003],[x1-.060,top+.009],[x0+.026,top+.009],[x0+.020,top+.006]];
  P.addEquipment('hullDetail',sectionSolid([{z:z0+.025,ring:lid},{z:z1-.025,ring:lid}]));
  for(const z of [z0+.12,z1-.12])P.addEquipment('hullDark',cylZ(.011,.075,10),x0+.018,top+.004,z);
  // the latches on the outboard face, the lifting handle on the lid
  for(const z of [z0+.14,z1-.14]){
    P.addEquipment('hullDark',box(.016,.050,.042),x1+.005,top-.085,z);
    P.addEquipment('hullDark',cylX(.008,.020,8),x1+.012,top-.068,z);
  }
  const zm=(z0+z1)/2,xh=(x0+x1)/2-.03;
  P.addEquipment('hullDark',new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(xh,top+.006,zm-.09),
    new THREE.Vector3(xh,top+.045,zm-.07),new THREE.Vector3(xh,top+.050,zm),new THREE.Vector3(xh,top+.045,zm+.07),
    new THREE.Vector3(xh,top+.006,zm+.09)]),16,.007,6));
  // the exhaust: a stub out of the outboard face near the rear, its elbow turned down
  const ex=new THREE.CatmullRomCurve3([new THREE.Vector3(x1-.010,top-.120,z0+.10),new THREE.Vector3(x1+.050,top-.120,z0+.10),
    new THREE.Vector3(x1+.075,top-.150,z0+.10),new THREE.Vector3(x1+.078,top-.195,z0+.10)]);
  P.addEquipment('hullDark',new THREE.TubeGeometry(ex,12,.030,12));
  // the louvred intake on the rear face: a frame and four slats
  P.addEquipment('hullDetail',box(.24,.12,.010).translate((x0+x1)/2,y0+.13,z0-.002));
  for(let i=0;i<4;i++)P.addEquipment('hullDark',box(.21,.010,.022).rotateX(.6).translate((x0+x1)/2,y0+.09+i*.027,z0-.010));
  // the cable conduit from the inboard face down into the hull's side deck
  const deck=hit(meshes,[1.00,2.5,z1-.08],[0,-1,0],'the APU conduit',P.spec.id);
  P.addEquipment('hullDark',new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x0+.010,y0+.12,z1-.08),
    new THREE.Vector3(x0-.050,y0+.11,z1-.08),new THREE.Vector3(1.02,deck.y+.030,z1-.08),new THREE.Vector3(1.00,deck.y-.010,z1-.08)]),12,.016,8));
  P.addEquipment('hullDark',cylX(.024,.030,10),x0-.005,y0+.12,z1-.08);
}

/** Lay the T-80UK command fit (after buildT80UX). */
export function addT80UKCommandFit(P:TankBuilderPort):void{
  const turret=stock(P,TURRET_STOCK),hull=stock(P,HULL_STOCK);
  try{
    const roof=(x:number,z:number,what:string)=>hit(turret.meshes,[x,1.6,z],[0,-1,0],what,P.spec.id).y;
    // every turret seat is read before any part is laid, so no part seats on another
    const lwr=[-1,1].map(s=>({x:s*.50,z:.548,y:roof(s*.50,.548,'a laser-warning head')}));
    const wind={x:0,z:-1.172,y:roof(0,-1.172,'the DVE-BS mast')};
    const whips=[-1,1].map(s=>({s,x:s*.50,z:-1.072,y:Math.min(...[[0,0],[.05,0],[-.05,0],[0,.05],[0,-.05]].map(([dx,dz])=>roof(s*.50+dx,-1.072+dz,'an antenna mount')))}));
    rearBasket(P,turret.meshes);
    for(const h of lwr)laserWarningHead(P,h.x,h.z,h.y);
    windSensorMast(P,wind.x,wind.z,wind.y);
    for(const w of whips)antennaMount(P,w.x,w.z,w.y,w.s);
    canvasRoll(P);
    auxiliaryPowerUnit(P,hull.meshes);
  }finally{turret.dispose();hull.dispose();}
}
