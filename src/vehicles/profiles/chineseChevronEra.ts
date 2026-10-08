// Chinese concept ERA: a single broad cassette with a blunt horizontal ridge,
// unlike the Russian paired steep leaves. Each bank follows a real planar wall.
import * as THREE from 'three';
import {sectionSolid,type SectionPoint} from './sectionSolid.ts';
import {orientedSlab} from './kit.ts';
import {markEraHitFaces} from './eraHitFaces.ts';
import type {FlankStation} from './weldedFlankHousing.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

type Point=readonly[number,number,number];
type Port=Pick<TankBuilderPort,'addExternalArmor'|'destructibleCluster'|'turretG'>;
interface Facet {a:Point;b:Point;height:number}
export interface ChineseChevronReceipt {side:number;normal:Point;back:Point[];vertices:Point[];ridgeWidthM:number}

function cassette(a:THREE.Vector3,b:THREE.Vector3,height:number,depth:number){
 const tangent=b.clone().sub(a).normalize(),up=new THREE.Vector3(0,1,0);
 const normal=tangent.clone().cross(up).normalize();
 // The 40 mm blunt ridge and broad single-piece side caps distinguish this
 // shallow folded module from the sharp two-course Russian retrofit.
 const ring:SectionPoint[]=[[.012,0],[.035,0],[depth,height*.5-.02],
  [depth,height*.5+.02],[.035,height],[.012,height]];
 const g=sectionSolid([{z:0,ring},{z:a.distanceTo(b),ring}]);
 // normal × up = -tangent; reverse the width axis and originate at b.
 g.applyMatrix4(new THREE.Matrix4().makeBasis(normal,up,tangent.clone().negate()).setPosition(b));
 return {g,normal};
}
function addFacet(P:Port,f:Facet,side:number,depth:number):void{
 let a=new THREE.Vector3(...f.a),b=new THREE.Vector3(...f.b);
 if(side<0){a.x=-a.x;b.x=-b.x;[a,b]=[b,a];}
 const span=a.distanceTo(b),count=Math.max(1,Math.round(span/.37));
 const records:ChineseChevronReceipt[]=P.turretG.userData.chineseChevronEra??=[];
 for(let i=0;i<count;i++){
  const lo=a.clone().lerp(b,(i+.04)/count),hi=a.clone().lerp(b,(i+.96)/count);
  const {g,normal}=cassette(lo,hi,f.height,depth);
  const back=[lo.toArray(),hi.toArray(),hi.clone().add(new THREE.Vector3(0,f.height,0)).toArray(),lo.clone().add(new THREE.Vector3(0,f.height,0)).toArray()];
  const center=lo.clone().lerp(hi,.5).add(new THREE.Vector3(0,f.height/2,0));
  const seat=back.map(p=>new THREE.Vector3(...p).lerp(center,.10));
  P.addExternalArmor('turret',orientedSlab(...seat.map(p=>p.clone().addScaledVector(normal,-.004).toArray()),
   ...seat.map(p=>p.clone().addScaledVector(normal,.018).toArray())));
  const pos=g.getAttribute('position'),vertices:Point[]=[];
  for(let v=0;v<pos.count;v++)vertices.push([pos.getX(v),pos.getY(v),pos.getZ(v)]);
  records.push({side,normal:normal.toArray(),back,vertices,ridgeWidthM:.04});
  P.destructibleCluster(`turret_era_${side<0?'L':'R'}`,()=>P.addExternalArmor('turret',markEraHitFaces(g,normal.toArray(),.35)));
 }
 P.turretG.userData.chineseChevronEra=records;
}

export function addChineseChevronBank(P:Port,side:number,rows:readonly FlankStation[],depth:number):void{
 for(let i=1;i<rows.length;i++){
  const raw=rows[i-1],b=rows[i];
  // Rear flanks overlap the cheek root; begin on the exposed forward wall.
  const startZ=Math.max(raw[0],rows[0][0]>.7?.94:.28);
  if(b[0]<=startZ)continue;
  const t=(startZ-raw[0])/(b[0]-raw[0]);
  const a:FlankStation=[startZ,raw[1]+(b[1]-raw[1])*t,raw[2]+(b[2]-raw[2])*t,raw[3]+(b[3]-raw[3])*t,raw[4]+(b[4]-raw[4])*t];
  const bevel=(r:FlankStation)=>Math.min(.035,(r[4]-r[3])*.25,(r[2]-r[1])*.25);
  const low=Math.max(a[3]+bevel(a),b[3]+bevel(b))+.012;
  const top=Math.min(a[4]-bevel(a),b[4]-bevel(b))-.012;
  if(top-low<.06)continue;
  // Travel from bow towards rear so the right-hand normal is outward.
  addFacet(P,{a:[b[2],low,b[0]],b:[a[2],low,a[0]],height:top-low},side,Math.min(depth,(top-low)*.43));
 }
 const nose=rows[rows.length-1];
 if(nose[0]>1.25){
  const low=nose[3]+.045,top=nose[4]-.045;
  addFacet(P,{a:[nose[1]+.04,low,nose[0]],b:[nose[2]-.04,low,nose[0]],height:top-low},side,Math.min(depth,(top-low)*.43));
 }
}
