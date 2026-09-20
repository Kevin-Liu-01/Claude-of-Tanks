import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {KIT} from './kit.ts';
import {sectionSolid, type SolidSection} from './sectionSolid.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const XS=.972;
type XY=readonly [number,number];
const local=(x:number,y:number): XY=>[x/XS,y];

function stationAt(sections: readonly SolidSection[],z:number): SolidSection {
  const index=sections.findIndex(section=>section.z>=z);
  if(sections[index].z===z)return sections[index];
  const a=sections[index-1],b=sections[index],t=(z-a.z)/(b.z-a.z);
  return {z,ring:a.ring.map(([x,y],i)=>[x+(b.ring[i][0]-x)*t,y+(b.ring[i][1]-y)*t])};
}
function span(sections: readonly SolidSection[],rear:number,front:number): SolidSection[] {
  return [stationAt(sections,rear),...sections.filter(s=>s.z>rear&&s.z<front),stationAt(sections,front)];
}
function outerWings(section:SolidSection): [SolidSection,SolidSection] {
  const p=section.ring,left=-.3067/XS,right=.3057/XS;
  return [{z:section.z,ring:[p[0],[left,p[0][1]],[left,p[5][1]],p[5],p[6],p[7]]},
    {z:section.z,ring:[[right,p[1][1]],p[1],p[2],p[3],p[4],[right,p[4][1]]]}];
}
function baySectors(section:SolidSection): SolidSection[] {
  const p=section.ring,z=section.z,floor=.513444;
  const middle=z<=-1.481983?1.503806:1.503806-(z+1.481983)*(.306463/.800407);
  const edge=middle;
  const lb=local(-.900982,floor),rb=local(.900477,floor);
  // Keep the visible doorway/depth/floor faithful. The source's hidden upper
  // room is wider than this retained exterior tub; its internal side expansion
  // is intentionally simplified, rather than widening the chassis around it.
  const lt=local(-.900982,edge),rt=local(.900477,edge),mt=local(-.0005,middle);
  const rings: XY[][]=[[p[0],p[1],rb,lb],[p[1],p[2],[rb[0],p[2][1]],rb],
    [p[2],p[3],p[4],p[5],p[6],p[7],lt,mt,rt],
    [p[7],p[0],lb,[lb[0],p[7][1]]]];
  return rings.map(ring=>({z,ring}));
}
function portal(): THREE.BufferGeometry {
  // Object29's rounded entrance is small; the actual Object7 bay widens behind
  // it. Preserve both the finite header/sill and the exterior-facing air.
  const shape=new THREE.Shape();shape.moveTo(-.945,.419);shape.lineTo(.945,.419);
  shape.lineTo(.945,1.62843);shape.lineTo(-.945,1.62843);shape.closePath();
  const hole=new THREE.Path(),cx=-.0005,cy=(.586397+1.429368)/2,w=.551554,h=.842971,r=.0769;
  hole.moveTo(cx-w/2+r,cy-h/2);hole.lineTo(cx+w/2-r,cy-h/2);
  hole.absarc(cx+w/2-r,cy-h/2+r,r,-Math.PI/2,0,false);
  hole.lineTo(cx+w/2,cy+h/2-r);hole.absarc(cx+w/2-r,cy+h/2-r,r,0,Math.PI/2,false);
  hole.lineTo(cx-w/2+r,cy+h/2);hole.absarc(cx-w/2+r,cy+h/2-r,r,Math.PI/2,Math.PI,false);
  hole.lineTo(cx-w/2,cy-h/2+r);hole.absarc(cx-w/2+r,cy-h/2+r,r,Math.PI,Math.PI*1.5,false);
  shape.holes.push(hole);
  const g=new THREE.ExtrudeGeometry(shape,{depth:.1200,bevelEnabled:false,curveSegments:3});
  g.translate(0,0,-2.595583);g.scale(1/XS,1,1);return g;
}

function closedRearDoor(): THREE.BufferGeometry {
  // Owner-selected closed pose (2026-09-20). The leaf overlaps the existing
  // rounded aperture by 24–29 mm, with 40 mm of actual frame engagement.
  // Keep the deep exterior recess and the room behind it; this is a door,
  // not a slab across the rear stowage or a fill of the passenger bay.
  const cx=-.0005,cy=1.0078825,halfWidth=.300,halfHeight=.450,corner=.060;
  const ring:XY[]=[[-halfWidth+corner,-halfHeight],[halfWidth-corner,-halfHeight],
    [halfWidth,-halfHeight+corner],[halfWidth,halfHeight-corner],
    [halfWidth-corner,halfHeight],[-halfWidth+corner,halfHeight],
    [-halfWidth,halfHeight-corner],[-halfWidth,-halfHeight+corner]];
  return sectionSolid([-2.633583,-2.555583].map(z=>({z,
    ring:ring.map(([x,y])=>local(x+cx,y+cy))})));
}

export function barakHullBody(sections: readonly SolidSection[]): THREE.BufferGeometry {
  const rear=span(sections,sections[0].z,-2.595583).map(outerWings);
  const inner=span(sections,-2.475583,-.681676);
  for(const z of[-1.481983,-.970617])inner.push(stationAt(sections,z));
  inner.sort((a,b)=>a.z-b.z);
  const sectors=inner.map(baySectors);
  const entrance=span(sections,-2.595583,-2.475583).map(outerWings);
  const parts=[0,1].flatMap(i=>[sectionSolid(rear.map(row=>row[i])),sectionSolid(entrance.map(row=>row[i]))]);
  for(let i=0;i<4;i++)parts.push(sectionSolid(sectors.map(row=>row[i])));
  parts.push(portal(),closedRearDoor(),sectionSolid(span(sections,-.681576,sections[sections.length-1].z)));
  const result=mergeGeometries(parts);for(const part of parts)part.dispose();
  if(!result)throw new Error('Barak measured rear boundary did not merge');return result;
}

function stock(P:TankBuilderPort,g:THREE.BufferGeometry,x=0,y=0,z=0,slot='hullDetail'):void {
  g.scale(1/XS,1,1);P.addEquipment(slot,g,x/XS,y,z);
}
function caseFrame(P:TankBuilderPort,side:number):void {
  const x=side*.6258-.0005;
  // Thin separate sidewalls, floor and inclined lid surround the actual cases.
  stock(P,KIT.box(.5658,.026,.450),x,.985,-3.572);
  stock(P,KIT.box(.5658,.535,.028),x,1.3148,-3.354);
  for(const dx of[-.267,.267])stock(P,KIT.box(.029,.424,.456),x+dx,1.2935,-3.572);
  stock(P,sectionSolid([{z:-3.8348,ring:[[-.2829,1.4748],[.2829,1.4748],[.2829,1.502],[-.2829,1.502]]},
    {z:-3.367,ring:[[-.2829,1.5588],[.2829,1.5588],[.2829,1.586],[-.2829,1.586]]}]),x);
  for(const [low,high]of[[.941166,1.032],[1.0485,1.1393],[1.1509,1.2418],[1.2515,1.3432],[1.353,1.44382]]){
    const panel=KIT.box(.5461,high-low,.003861);
    if(low<1){panel.rotateX(-.12817);stock(P,panel,x,.9863,-3.80392);}
    else stock(P,panel,x,(low+high)/2,-3.8097045);
    for(const dx of[-.229,-.038,.238])stock(P,KIT.box(.010,.045,.023),x+dx,high+.006,-3.81165);
  }
  // Sparse rounded cans remain inside the open frame, independently authored.
  for(const dx of[-.13,.14]){
    const g=KIT.cylY(.137,.130,.385,P.q?14:8);g.rotateX(-.115);
    stock(P,g,x+dx,1.137,-3.626);
    stock(P,KIT.cylY(.141,.141,.045,P.q?14:8),x+dx,1.343,-3.647);
  }
}
function rearLamps(P:TankBuilderPort):void {
  for(const side of[-1,1]){
    const x=side*1.628821-.0005;
    stock(P,KIT.cylZ(.0759,.05603,P.q?20:12),x,1.4018,-3.61346);
    stock(P,KIT.cylZ(.052,.005,P.q?20:12),x,1.4018,-3.638977,'hullDark');
    stock(P,KIT.box(.167,.018,.022),x,1.484,-3.609);
    const bx=side*1.347-.0005;
    stock(P,KIT.box(.376,.291,.091),bx,1.4433,-3.5955);
    stock(P,KIT.box(.020,.112,.020),bx-.17,1.596,-3.569);
    stock(P,KIT.box(.020,.112,.020),bx+.17,1.596,-3.569);
  }
}
export function addBarakRearCases(P:TankBuilderPort):void {
  caseFrame(P,-1);caseFrame(P,1);rearLamps(P);
  // Two hinge barrels span the leaf/frame edge; each receiver overlaps both
  // the real door and its header-side frame. The latch mounts into the leaf.
  for(const y of[.7378825,1.2778825]){
    stock(P,KIT.box(.094,.060,.040),-.2945,y,-2.630583);
    stock(P,KIT.cylY(.022,.022,.110,P.q?12:8),-.3085,y,-2.638583);
  }
  stock(P,KIT.box(.084,.048,.032),.2035,1.0078825,-2.637583);
  stock(P,KIT.box(.021,.125,.025),.2165,1.0078825,-2.661583,'hullDark');
}
