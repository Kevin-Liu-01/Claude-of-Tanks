import * as THREE from 'three';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

// Scalar measurements from Barak Object_22 (roof/cage) and Object_3 (stowage).
// Coordinates remain in the certified source frame; only the turret pivot is removed.
const Y = 1.605, Z = -.3906;
type Point = readonly [number, number, number];
function put(P: TankBuilderPort, slot: string, g: THREE.BufferGeometry, x=0,y=0,z=0, ry=0): void {
  P.addEquipment(slot,g,x,y-Y,z-Z,0,ry);
}
function optic(P: TankBuilderPort, g: THREE.BufferGeometry, x:number,y:number,z:number, ry=0): void {
  // These dark apertures are real sights; keep their stock/material bucket
  // unchanged while publishing their turret-owned damage-module receipts.
  P.addModuleVisual('optics','turretDark',g,x,y-Y,z-Z,0,ry);
}
function upright(P: TankBuilderPort, radius: number, height: number, x:number,y:number,z:number, slot='turretDetail'): void {
  put(P,slot,KIT.cylY(radius,radius,height,P.q?24:12),x,y,z);
}
function bar(P: TankBuilderPort, a: Point, b: Point, width: number, slot='turretOpenLattice'): void {
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);
  const g=KIT.box(width,delta.length(),width);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
  const mid=start.add(end).multiplyScalar(.5);put(P,slot,g,mid.x,mid.y,mid.z);
}
function roofStrip(P: TankBuilderPort, rear:number,front:number, points: readonly (readonly [number,number])[]): void {
  const minX=points[0][0],maxX=points[points.length-1][0];
  const ring: [number,number][]=[[minX,2.23-Y],[maxX,2.23-Y],...points.slice().reverse().map(([x,y])=>[x,y-Y] as [number,number])];
  P.add('turret',sectionSolid([{z:rear-Z,ring},{z:front-Z,ring}]));
}

function addFoldedSideScreens(P: TankBuilderPort): void {
  // Object_21's two screens have a flat high lip and a thin bent web. The
  // former ramp filled the inside while dropping the real aft silhouette.
  const section=(points: readonly (readonly [number,number])[],side:number)=>
    points.map(([x,y])=>[side*x+(side<0?-.001:0),y-Y] as [number,number]);
  for(const side of[-1,1]){
    const ring=(top:number)=>{
      const points=section([[1.300680,2.428767],[1.311272,2.428767],
        [1.311272,2.668810],[1.380859,2.765718],[1.380859,top],
        [1.370268,top],[1.370268,2.765718],[1.300680,2.668810]],side);
      return side<0?points.reverse():points;
    };
    P.add('turret',sectionSolid([[-1.740081,2.889154],[-1.189121,2.889154],
      [-1.171204,2.881236],[-1.163483,2.863765]].map(([z,top])=>({z:z-Z,ring:ring(top)}))));
    const cap=section([[1.300680,2.428767],[1.444706,2.428767],
      [1.444706,2.848570],[1.432135,2.876385],[1.404022,2.889154],
      [1.370268,2.889154],[1.370268,2.765718],[1.300680,2.668810]],side);
    if(side<0)cap.reverse();
    P.add('turret',sectionSolid([{z:-1.740081-Z,ring:cap},{z:-1.725629-Z,ring:cap}]));
  }
}

export function addBarakMeasuredRoofStock(P: TankBuilderPort): void {
  addFoldedSideScreens(P);
  // The real closed rear roof stops before the basket. Its separate stepped
  // left cover and flat right deck never fill the open storage volume aft.
  roofStrip(P,-3.0056,-2.9534,[[-1.0665,2.451],[1.065,2.451]]);
  roofStrip(P,-2.963,-2.1066,[[-1.3334,2.3316],[-1.0539,2.50464],[-.6567,2.50464],[-.5387,2.48197],[-.1721,2.48197]]);
  roofStrip(P,-2.938,-1.7692,[[-.0837,2.4704],[.8349,2.4704],[1.0746,2.4848],[1.16,2.421]]);
  roofStrip(P,-2.0496,-1.7325,[[-.9066,2.52691],[-.1771,2.52691]]);
  // Source right-hand crew deck is ~28 mm above the neighboring hatch berth.
  roofStrip(P,-1.7489,-.9036,[[-.078,2.60036],[.9587,2.60036]]);
  P.add('turret',sectionSolid([
    {z:-.9036-Z,ring:[[-.078,2.35-Y],[.9587,2.35-Y],[.86,2.60036-Y],[-.078,2.60036-Y]]},
    {z:-.2216-Z,ring:[[-.078,2.35-Y],[.9587,2.35-Y],[.86,2.5854-Y],[-.078,2.5854-Y]]},
  ]));
}

function liftingEyeEnd(P: TankBuilderPort,z:number): void {
  // Thin ends of the D-plan lifting-eye case, with the source's open bore.
  const cx=-.011715,cy=2.535129,r=.04949,shape=new THREE.Shape();
  shape.moveTo(-.078630,2.470391);shape.lineTo(cx,2.470391);
  shape.lineTo(cx,cy-r);shape.absarc(cx,cy,r,-Math.PI/2,-Math.PI,true);
  shape.absarc(cx,cy,r,-Math.PI,-Math.PI*1.5,true);
  shape.lineTo(cx,2.599866);shape.lineTo(-.078630,2.599866);shape.closePath();
  const g=new THREE.ExtrudeGeometry(shape,{depth:.00396,bevelEnabled:false,curveSegments:P.q?6:4});
  g.translate(0,0,z);put(P,'turretDetail',g);
}
function liftingEyeCurve(P: TankBuilderPort,cz:number,upper:boolean): void {
  const r=.04949,cx=-.011715,cy=2.535129;
  const sections=Array.from({length:P.q?13:9},(_,i)=>{
    const angle=-Math.PI/2+i*Math.PI/(P.q?12:8),z=cz+r*Math.sin(angle);
    const outer=cx+r*Math.cos(angle),inner=outer-.00396;
    const hole=Math.sqrt(Math.max(0,r*r-(inner-cx)**2));
    const low=upper?cy+hole:2.470391,high=upper?2.599866:cy-hole;
    return {z:z-Z,ring:[[inner,low-Y],[outer,low-Y],[outer,high-Y],[inner,high-Y]] as [number,number][]};
  });
  P.addEquipment('turretDetail',sectionSolid(sections));
}
function rearLiftingEyes(P: TankBuilderPort): void {
  // Object22 components356/357: 4 mm folded cases, not solid blocks filling
  // their roughly 99 mm through-openings. Their lower rim seats on the deck.
  for(const cz of[-2.083911,-1.946121]){
    liftingEyeEnd(P,cz-.04979);liftingEyeEnd(P,cz+.04583);
    put(P,'turretDetail',KIT.box(.00396,.129475,.09958),-.07665,2.5351285,cz);
    liftingEyeCurve(P,cz,true);liftingEyeCurve(P,cz,false);
  }
}

function hatchRing(P: TankBuilderPort): void {
  const cx=-.4413,cz=-1.145;
  const ring=new THREE.LatheGeometry([
    new THREE.Vector2(.302,0),new THREE.Vector2(.411,0),new THREE.Vector2(.411,.0111),
    new THREE.Vector2(.302,.0111),new THREE.Vector2(.302,0),
  ],P.q?32:20);
  put(P,'turretDetail',ring,cx,2.57957,cz);
  // Closed hatch cover and its true stepped receiver, inside the annular rim.
  P.addCupola('turret',KIT.cylY(.298,.298,.061,P.q?28:16),cx,2.582-Y,cz-Z);
  upright(P,.292,.026,cx,2.60716,cz);
  for(const [x,z,angle]of[[-.0334,-1.1518,Math.PI/2],[-.1558,-.8617,Math.PI/4],
    [-.4363,-.7324,0],[-.7176,-.8552,-Math.PI/4],[-.8442,-1.1421,-Math.PI/2]] as const){
    // Five canted, separately housed periscopes follow the actual hatch rim.
    const caseGeo=sectionSolid([
      {z:-.06,ring:[[-.143,0],[.143,0],[.143,.1517],[-.143,.1517]]},
      {z:.064,ring:[[-.143,0],[.143,0],[.143,.044],[-.143,.044]]},
    ]);
    put(P,'turretDetail',caseGeo,x,2.567,z,angle);
    optic(P,KIT.box(.216,.035,.007),x+Math.sin(angle)*.051,2.687,z+Math.cos(angle)*.051,angle);
  }
  for(const x of[-.7428,-.1517]){
    put(P,'turretDetail',KIT.box(.026,.10,.38),x,2.604,-1.44);
    put(P,'turretDark',KIT.cylZ(.010,.30,8),x,2.649,-1.44);
  }
}

function sight(P: TankBuilderPort): void {
  // A single round housing, not an invented panoramic blue-window octagon.
  const x=.4577,z=-.5177;
  upright(P,.2115,.070,x,2.6218,z);
  upright(P,.195,.145,x,2.7294,z);
  upright(P,.202,.0126,x,2.8082,z);
  put(P,'turretDetail',KIT.box(.162,.202,.100),.5577,2.710,-.65);
  optic(P,KIT.box(.124,.117,.008),.5577,2.721,-.703);
  for(const [dx,dz]of[[.18,-.12],[-.18,-.12],[.13,.17],[-.13,.17]])
    put(P,'turretDetail',KIT.box(.047,.030,.065),x+dx,2.607,z+dz);
}

function forwardOptic(P: TankBuilderPort): void {
  // Object_22 component133: the asymmetric forward sight is a small roof
  // enclosure behind an inclined front, not a transverse window bridge.
  const ring=(rear:boolean): [number,number][]=>[[-.9143,2.4771-Y],[-.4203,2.4771-Y],
    [-.4290,(rear?2.7275:2.7400)-Y],[-.9061,(rear?2.7275:2.7400)-Y]];
  P.addEquipment('turretDetail',sectionSolid([{z:-.2019-Z,ring:ring(true)},{z:.0943-Z,ring:ring(false)}]));
  optic(P,KIT.box(.345,.130,.009),-.6673,2.612,.101);
  for(const x of[-.485,-.850])put(P,'turretDetail',KIT.box(.021,.217,.180),x,2.612,.184);
}

export function addBarakCrewRoof(P: TankBuilderPort): void {
  hatchRing(P);sight(P);forwardOptic(P);rearLiftingEyes(P);
  for(const side of[-1,1])for(const [x,y,z]of[[.966,2.423,.32],[1.019,2.423,.215],[1.072,2.423,.114],
    [1.081,2.368,.203],[1.029,2.368,.303],[.975,2.368,.409]])
    put(P,'turretDark',KIT.cylZ(.035,.31,P.q?12:8),side*x,y,z,side*.46);
}

export function addBarakWhips(P: TankBuilderPort): void {
  // Source-only Object26 axial sections: retain both original aerials and
  // their 3-degree aft rake, stepped lower stock and thin tapered tips.
  const baseY=2.607366,axisY=Math.cos(Math.PI/60);
  const rings=[[2.607366,.019797],[2.698606,.026677],[2.777786,.019500],
    [2.925666,.018906],[2.931301,.015046],[3.418439,.015343],
    [3.425656,.011779],[3.679802,.012274],[3.688599,.008612],
    [3.696705,.011383],[4.134022,.010493],[4.571339,.009602],
    [5.008657,.008711],[5.664633,.007424]];
  const points=[new THREE.Vector2(0,0),...rings.map(([y,r])=>new THREE.Vector2(r,(y-baseY)/axisY)),
    new THREE.Vector2(0,(5.664633-baseY)/axisY)];
  const whips=new THREE.InstancedMesh(new THREE.LatheGeometry(points,P.q?8:6),P.mats.dark,2);
  whips.name='barakRearWhips';
  for(const [i,x,y,z]of[[0,-1.023587,2.598081,-3.570749],[1,1.029952,2.607366,-3.572234]]){
    const pose=new THREE.Object3D();pose.rotation.x=-Math.PI/60;
    pose.position.set(x,y-Y,z-Z);pose.updateMatrix();whips.setMatrixAt(i,pose.matrix);
  }
  whips.instanceMatrix.needsUpdate=true;P.turretG.add(whips);
}

function roundedStowage(P: TankBuilderPort): void {
  // Separate measured bag/case bounds. The shapes are independent low-order
  // ellipsoids with straps, not the source's vertices or a filled cage box.
  for(const [x,y,z,w,h,d]of[[-.441,2.0945,-3.319,1.1605,.4181,.4071],[-.1458,2.3111,-3.3301,.6157,.2787,.5251],
    [.2180,2.0799,-3.2806,.1485,.3772,.2737],[.6565,2.0799,-3.4022,.2784,.3772,.2427],[.6636,2.1076,-3.2246,.3667,.3824,.1170]]){
    const g=new THREE.SphereGeometry(1,P.q?12:8,P.q?6:4);g.scale(w/2,h/2,d/2);
    put(P,'turretDetail',g,x,y,z);
    // The broad webbing follows the case rather than masking all storage air.
    put(P,'turretDark',KIT.box(Math.min(.03,w/7),h*.76,.014),x,y,z-d*.47);
  }
}

function basketFringe(P: TankBuilderPort): void {
  const count=26;
  for(let i=0;i<count;i++){
    const x=-.818+i*(1.636/(count-1));
    put(P,'turretOpenLatticeDark',KIT.cylY(.006,.006,.190,6),x,1.794,-3.544);
    const ball=new THREE.SphereGeometry(.024,P.q?8:6,P.q?4:3);
    put(P,'turretOpenLatticeDark',ball,x,1.689,-3.544);
  }
  for(const side of[-1,1])for(let i=0;i<18;i++){
    const t=i/17,x=side*(.964+t*.430),z=-3.524+t*1.415,y=1.804-t*.035;
    put(P,'turretOpenLatticeDark',KIT.cylY(.006,.006,.175,6),x,y+.111,z);
    put(P,'turretOpenLatticeDark',new THREE.SphereGeometry(.024,P.q?8:6,P.q?4:3),x,y,z);
  }
}

export function addBarakBasket(P: TankBuilderPort): void {
  // The source basket floor is solid receiving stock, not an open-lattice
  // exemption. Keep its real plate visible to the continuity raster.
  put(P,'turretDetail',KIT.box(2.069,.005,.538),-.0005,1.887,-3.269);
  // Object22 component70 is a separate tall, shallow case at the right-front
  // of the basket; its bevel does not close the neighboring storage air.
  P.addEquipment('turretDetail',sectionSolid([[-3.140891,.05896,.84066],[-3.117728,.034413,.865307],
    [-2.990134,.034413,.865307]].map(([z,left,right])=>({z:z-Z,ring:[[left,1.938536-Y],[right,1.938536-Y],
      [right,2.424956-Y],[left,2.424956-Y]]}))));
  for(const side of[-1,1])bar(P,[side*1.055,1.884,-3.00],[side*.950,1.891,-3.551],.027);
  bar(P,[-.951,1.895,-3.551],[.951,1.895,-3.551],.027);
  for(const [y,z]of[[2.038,-3.563],[2.120,-3.572],[2.201,-3.580],[2.283,-3.590],[2.356,-3.610]]){
    put(P,'turretOpenLattice',KIT.box(1.885,.019,.019),-.0003,y,z);
    for(const side of[-1,1])bar(P,[side*.943,y,z],[side*1.055,y+.030,-3.016],.019);
  }
  for(const x of[-.954,0,.954])bar(P,[x,1.89,-3.545],[x,2.3655,-3.610],.024);
  for(const side of[-1,1])bar(P,[side*1.055,1.894,-3.008],[side*1.055,2.408,-3.044],.025);
  roundedStowage(P);basketFringe(P);
}
