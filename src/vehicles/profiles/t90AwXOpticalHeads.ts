// Canted left observation housing and circular right optical head. Original
// closed parametric stock; source glazing is measured, not a runtime texture.
import * as THREE from 'three';
import {KIT,orientedSlab} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {T90_AW_X_SOURCE_DATUMS} from '../t90AwXArmor.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const PIVOT=T90_AW_X_SOURCE_DATUMS.turretPivot;
type Pair=readonly[number,number];
type PlaneRow=readonly[number,number,number,number];
function crossing(a:PlaneRow,b:PlaneRow,c:PlaneRow):number[]{
  const na=new THREE.Vector3(a[0],a[1],a[2]),nb=new THREE.Vector3(b[0],b[1],b[2]),nc=new THREE.Vector3(c[0],c[1],c[2]);
  const p=nb.clone().cross(nc),q=nc.clone().cross(na),r=na.clone().cross(nb),d=na.dot(p);
  return p.multiplyScalar(-a[3]).addScaledVector(q,-b[3]).addScaledVector(r,-c[3]).divideScalar(d).toArray();
}
function leftWedge():THREE.BufferGeometry{
  const back:PlaneRow=[-.882245795,.000835451,-.470788337,-.09837443];
  const front:PlaneRow=[-.883090154,.004027682,.469186059,-.101744984];
  const top:PlaneRow=[.047466754,.998667157,.020268594,-.042177173];
  const bottom:PlaneRow=[.087325277,-.996179056,.001258413,-.0648593];
  const l:PlaneRow=[-1,0,0,-.1132],r:PlaneRow=[1,0,0,.053];
  const corners=(plane:PlaneRow)=>[crossing(l,back,plane),crossing(r,back,plane),
    crossing(r,front,plane),crossing(l,front,plane)];
  return orientedSlab(...corners(bottom),...corners(top));
}
function emit(P:TankBuilderPort,g:THREE.BufferGeometry,dark=false):void{
  P.addEquipment(dark?'turretDark':'turretDetail',g,-PIVOT[0],-PIVOT[1],-PIVOT[2]);
}
function leftFrame():THREE.Matrix4{
  const up=new THREE.Vector3(.25603494,.96577426,.04154745).normalize();
  const fore=new THREE.Vector3(-.156,.0003,.98775).normalize();
  const right=up.clone().cross(fore).normalize();fore.crossVectors(right,up).normalize();
  return new THREE.Matrix4().makeBasis(right,up,fore).setPosition(-1.22314998,2.19778001,-.13012999);
}
function planPrism(plan:readonly Pair[],bottom:(x:number)=>number,top:(x:number)=>number):THREE.BufferGeometry{
  // An X,Z polygon extruded in +Y, using a proper rotation rather than a
  // reflected cross-section. Sloping lower surfaces retain the source seat.
  const ring=plan.map(([x,z])=>[x,-z] as const).reverse();
  const g=sectionSolid([{z:0,ring},{z:1,ring}]).rotateX(-Math.PI/2);
  const a=g.getAttribute('position');
  for(let i=0;i<a.count;i++)a.setY(i,THREE.MathUtils.lerp(bottom(a.getX(i)),top(a.getX(i)),a.getY(i)));
  a.needsUpdate=true;g.computeVertexNormals();return g;
}
function leftHead(P:TankBuilderPort):void{
  const frame=leftFrame();
  // Two differently shaped sides of the source head flank a thin raised
  // central strap. Their unequal plan outlines are not a mirrored box.
  const right:Pair[]=[[-.006,-.0905],[.026,-.0905],[.1191,-.024],[.1191,.0986],[-.006,.0986]];
  emit(P,planPrism(right,x=>Math.max(-.07053,-.08298+.4559*x),()=>.0431736).applyMatrix4(frame));
  emit(P,leftWedge().applyMatrix4(frame));
  // The narrow raised central strap is solid in the supplied source. Its
  // clipped ends do not occupy the bounding rectangle's corner air.
  const strap:Pair[]=[[-.053,-.098],[-.026,-.1194],[-.009,-.1194],
    [-.009,.1273],[-.039,.1273],[-.053,.105]];
  emit(P,planPrism(strap,()=>-.0778,()=>.05025).applyMatrix4(frame));
  leftReturns(P);
  leftFeet(P);
}
function leftFeet(P:TankBuilderPort):void{
  // Source 25582/25606 are paired narrow inclined feet. They meet the
  // unchanged casting inboard; there is no broad skirt-to-optic pedestal.
  const ring:readonly Pair[]=[[-1.20705,2.02758],[-1.12695,2.04938],
    [-1.10055,2.14898],[-1.17865,2.12748]];
  const nz=.987695885,nx=-.156384811,ny=-.000793424;
  const d=.281516422-nx*(-.00094997882843)-nz*.37695002555847;
  const skew=new THREE.Matrix4().set(1,0,0,0,0,1,0,0,-nx/nz,-ny/nz,1,-d/nz,0,0,0,1);
  for(const [dx,dz]of [[0,0],[-.0092,.0589]])emit(P,
    sectionSolid([{z:-.0142,ring},{z:0,ring}]).applyMatrix4(skew).translate(dx,0,dz));
}
function leftReturns(P:TankBuilderPort):void{
  // Two source end plates have shallow folded returns. Their faces are
  // closed stock, not transparent glazing or an invented optical opening.
  const rows:readonly(readonly[number,number,number,number,number,number])[]=[
    [-1.32520,2.20758009,-.08782996,-.905688069,.217511862,.363892445],
    [-1.30855,2.20758009,-.19417998,-.745577074,.227762346,-.626289982],
  ];
  for(const [x,y,z,nx,ny,nz]of rows){
    const fore=new THREE.Vector3(nx,ny,nz).normalize(),up=new THREE.Vector3(.256,.9658,.0415).normalize();
    const right=up.clone().cross(fore).normalize();up.crossVectors(fore,right).normalize();
    const frame=new THREE.Matrix4().makeBasis(right,up,fore).setPosition(x,y,z);
    emit(P,KIT.box(.098,.0868,.0054).translate(0,0,.00905).applyMatrix4(frame));
    for(const yy of[-.0407,.0407])emit(P,KIT.box(.098,.0054,.024).translate(0,yy,0).applyMatrix4(frame));
    for(const xx of[-.0463,.0463])emit(P,KIT.box(.0054,.076,.024).translate(xx,0,0).applyMatrix4(frame));
  }
}
function axialLathe(profile:readonly Pair[],segments=32):THREE.BufferGeometry{
  return new THREE.LatheGeometry(profile.map(([r,z])=>new THREE.Vector2(r,z)),segments).rotateX(Math.PI/2);
}
function rightHead(P:TankBuilderPort):void{
  const x=1.07135,y=2.25198;
  // Rounded rear dish, short rim, and actual convex sealed lens. The lens
  // is not an empty muzzle: its measured center projects 14mm past the rim.
  emit(P,axialLathe([[0,.37027],[.024,.37027],[.060,.38807],[.0752,.42277],
    [.0782,.45427],[.0833,.45427],[.0833,.48597],[.067,.48597],[.067,.47747],
    [.030,.47747],[0,.47747]],32).translate(x,y,0));
  emit(P,axialLathe([[0,.47847],[.0713,.47847],[.067,.485],
    [.048,.49407],[.024,.49847],[0,.49997]],32).translate(x,y,0),true);
  // Actual narrow outboard stand and transverse rotating boss (source
  // 26950/16387), rather than an opaque pedestal under the whole lens.
  emit(P,KIT.box(.0224,.2458,.0258).translate(1.15675,2.09638,.41277));
  emit(P,KIT.cylX(.0332,.0429,20).translate(1.1348,2.25198,.41432));
  emit(P,KIT.cylX(.0242,.0498,16).translate(1.10015,2.21368,.38602));
}
export function addT90AWOpticalHeads(P:TankBuilderPort):void{
  leftHead(P);rightHead(P);
}
