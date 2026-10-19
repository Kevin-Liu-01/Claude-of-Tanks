// Chinese concept ERA: a single broad cassette with a blunt horizontal ridge,
// unlike the Russian paired steep leaves. Each bank follows a real planar wall.
import * as THREE from 'three';
import {sectionSolid,type SectionPoint} from './sectionSolid.ts';
import {orientedSlab} from './kit.ts';
import {markEraHitFaces} from './eraHitFaces.ts';
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
function addFacet(P:Port,f:Facet,side:number,depth:number,cassettes?:number):void{
 let a=new THREE.Vector3(...f.a),b=new THREE.Vector3(...f.b);
 if(side<0){a.x=-a.x;b.x=-b.x;[a,b]=[b,a];}
 const span=a.distanceTo(b),count=cassettes??Math.max(1,Math.round(span/.37));
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

/** One planar wall facet's bank of single-piece cassettes (release 227: the Qilin's brows carry three a side, an
 * explicit count): `a` to `b` is the facet's lower edge (the right-hand side's coordinates, bow to rear, so the normal
 * faces outward), `height` its height; each cassette rides its own 22 mm seat pad in sector turret_era_L/R. */
export function addChineseChevronFacet(P:Port,f:Facet,side:number,depth:number,cassettes:number):void{
 addFacet(P,f,side,depth,cassettes);
}
