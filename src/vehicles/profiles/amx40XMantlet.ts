// Original cast/optical-support primitives, fitted to independent source
// surface planes. The unchanged cannon tube and deep bore are authored elsewhere.
import * as THREE from 'three';
import {sectionSolid} from './sectionSolid.ts';
import {KIT} from './kit.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const GUN=[-.00005,1.94827,1.3413] as const;
type Point=readonly[number,number];
function add(P:TankBuilderPort,g:THREE.BufferGeometry,glass=false):void {
  P.add(glass?'gunMountGlass':'gunMount',g.translate(-GUN[0],-GUN[1],-GUN[2]));
}
function lens(P:TankBuilderPort,x:number,y:number,z:number,r:number,depth:number):void {
  const profile=[[0,z],[r*.55,z-depth*.15],[r*.88,z-depth*.5],[r,z-depth],
    [r,z-depth-.002],[0,z-depth-.002]];
  add(P,new THREE.LatheGeometry(profile.reverse().map(([radius,at])=>new THREE.Vector2(radius,at)),32)
    .rotateX(Math.PI/2).translate(x,y,0),true);
  // Concealed closed retaining seat: it joins the lens rim to the existing
  // reveal wall, leaving all measured front approach rays clear.
  const low=z-depth-.001,high=low+.002,inner=r-.003,outer=r+.010;
  const seat=[[inner,low],[outer,low],[outer,high],[inner,high],[inner,low]];
  add(P,new THREE.LatheGeometry(seat.map(([radius,at])=>new THREE.Vector2(radius,at)),32)
    .rotateX(Math.PI/2).translate(x,y,0));
}
function perforatedPrism(ring:readonly Point[],hole:readonly[number,number,number],back:number,front:number):THREE.BufferGeometry {
  const s=new THREE.Shape();s.moveTo(...ring[0]);for(const p of ring.slice(1))s.lineTo(...p);s.closePath();
  const h=new THREE.Path();h.absarc(hole[0],hole[1],hole[2],0,Math.PI*2,true);s.holes.push(h);
  return new THREE.ExtrudeGeometry(s,{depth:front-back,bevelEnabled:false,curveSegments:24}).translate(0,0,back);
}

function wedgeRing(z:number,b:number,t:number):Point[] {
  const lowY=b+.04;
  const left=(y:number)=>y>2.11037?(.342402*y+.329554*z-1.99099285)/.879861
    :(.324652*y+.355671*z-1.99513506)/.876413;
  const right=(y:number)=>(1.56638751-.119397*y-.396669*z)/.910164;
  return[[left(lowY),lowY],[-.446,b],[.266,b],[right(lowY),lowY],
    [right(t),t],[left(t),t]];
}
function casting(P:TankBuilderPort):void {
  const aft=[[1.3113,1.9291,1.9351,-1.0146,.9248],[1.325,1.856,2.039,-1.045,.905],
    [1.36,1.789,2.115,-1.055,.895],[1.40,1.7436,2.155,-1.0585,.9114],
    [1.455,1.700,2.192,-1.0547,.8901],[1.537,1.677,2.2013,-1.0208,.8469]];
  const rows=aft.map(([z,b,t,l,r])=>({z,ring:[[l,b+(t-b)*.10],[l*.7,b],[r*.7,b],
    [r,b+(t-b)*.10],[r-.09,t],[l+.19,t]] as [number,number][]}));
  for(const[z,b,t]of[[1.60,1.6615,2.1819],[1.70,1.68986,2.1508],[1.78,1.7125,2.1257],
    [1.861,1.7424,2.1002]])rows.push({z,ring:wedgeRing(z,b,t) as [number,number][]});
  add(P,sectionSolid(rows));
  const back=1.861,front=1.9790,ring=wedgeRing(back,1.7424,2.1002);
  const end=wedgeRing(front,1.7866,2.0632),g=perforatedPrism(ring,[-.33165,1.89192,.072],back,front);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++)for(let k=0;k<ring.length;k++) {
    if(Math.hypot(p.getX(i)-ring[k][0],p.getY(i)-ring[k][1])>1e-5)continue;
    const u=(p.getZ(i)-back)/(front-back);
    p.setX(i,ring[k][0]+u*(end[k][0]-ring[k][0]));
    p.setY(i,ring[k][1]+u*(end[k][1]-ring[k][1]));break;
  }
  g.computeVertexNormals();add(P,g);
  lens(P,-.33165,1.89192,1.8877,.06725,.008);
  const neck=[[0,1.976],[.20205,1.976],[.20205,2.042],[.17485,2.070],
    [.17485,2.10],[.1623,2.1409],[0,2.1409]];
  add(P,new THREE.LatheGeometry(neck.map(([r,z])=>new THREE.Vector2(r,z)),32)
    .rotateX(Math.PI/2).translate(-.00005,1.94827,0));
}

function leftSight(P:TankBuilderPort):void {
  const ring:Point[]=[[-1.0371,1.774],[-.5942,1.774],[-.5942,2.108],[-.971,2.108]];
  const g=perforatedPrism(ring,[-.8269,1.96837,.096],1.414,2.1492),p=g.attributes.position;
  // The leading lower edge is raked, not a large forward vertical box.
  for(let i=0;i<p.count;i++)if(p.getZ(i)>2.1491)p.setZ(i,2.0828+
    Math.max(0,Math.min(1,(p.getY(i)-1.84617)/.2623))*.0664);
  g.computeVertexNormals();add(P,g);
  const x=-.802,y=1.9396,w=.328,h=.299,c=.037;
  const face:Point[]=[[-w/2+c,-h/2],[w/2-c,-h/2],[w/2,-h/2+c],
    [w/2,h/2-c],[w/2-c,h/2],[-w/2+c,h/2],[-w/2,h/2-c],[-w/2,-h/2+c]]
    .map(([u,v])=>[x+u,y+v]);
  const shield=perforatedPrism(face,[-.8269,1.96837,.0865],2.105,2.18645),a=shield.attributes.position;
  for(let i=0;i<a.count;i++)a.setZ(i,a.getZ(i)+.20343*(a.getY(i)-1.94));
  shield.computeVertexNormals();add(P,shield);
  lens(P,-.8269,1.96837,2.1258,.0856,.0093);
  add(P,KIT.box(.1314,.0503,.1473).translate(-.6599,2.1327,2.06925));
}

function coaxSocket(P:TankBuilderPort):void {
  const x=.39185,y=1.93372;
  // Wider tapered foot and twelve-sided sleeve precede the unchanged tube.
  const outer=[[0,1.9715],[.0768,1.9715],[.0725,2.0176],[.06325,2.0176],
    [.06325,2.3802],[.055,2.3802],[.055,2.0176],[0,2.0176]];
  add(P,new THREE.LatheGeometry(outer.map(([r,z])=>new THREE.Vector2(r,z)),12)
    .rotateX(Math.PI/2).rotateZ(.1309).translate(x,y,0));
}

export function addAmx40Mantlet(P:TankBuilderPort):void {
  casting(P);leftSight(P);coaxSocket(P);
}
