// T-90M/SM-style paired Relikt courses, fitted to each Russian concept's
// existing welded housing. The lower and upper leaves meet at a proud ridge;
// neither is a rotated square box or a replacement primary turret shell.
import * as THREE from 'three';
import {orientedSlab} from './kit.ts';
import {sampleArmorFace} from './armorFaceSampling.ts';
import {markEraHitFaces} from './eraHitFaces.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

export type RussianArmorRow=readonly[z:number,inner:number,outer:number,bottom:number,top:number];
type Point=readonly[number,number,number];
type Plan=readonly[number,number];
type ChevronPort=Pick<TankBuilderPort,'addExternalArmor'|'destructibleCluster'|'turretG'>;
interface Facet {a:Plan;b:Plan;low:number;high:number;tiles:number}
interface Leaf {side:number;course:'lower'|'upper';normal:Point;back:Point[];face:Point[]}

function cheekFacets(rows:readonly RussianArmorRow[],model:number):Facet[] {
 const front=rows.at(-1)!,corner=rows.at(-2)!,shoulder=rows.at(-3)!;
 const at=(a:RussianArmorRow,b:RussianArmorRow,z:number):Plan=>[a[2]+(b[2]-a[2])*(a[0]-z)/(a[0]-b[0]),z];
 const bevel=(r:RussianArmorRow):number=>Math.min(.08,(r[2]-r[1])*.22,(r[4]-r[3])*.22);
 const low=(a:RussianArmorRow,b:RussianArmorRow):number=>Math.max(a[3]+bevel(a),b[3]+bevel(b))+.008;
 const high=(a:RussianArmorRow,b:RussianArmorRow):number=>Math.min(a[4]-bevel(a),b[4]-bevel(b))-.008;
 // The vertical receiving faces end below the housing's upper bevel. Leaving
 // that bevel visible preserves each original roof outline and its equipment.
 return [
  {a:[front[1]+.06,front[0]],b:[front[2]-.05,front[0]],low:front[3]+.03,high:front[4]-.065,tiles:2},
  {a:at(front,corner,front[0]-.055),b:at(front,corner,corner[0]+.055),low:low(front,corner),high:high(front,corner),tiles:model===1?4:3},
  {a:at(corner,shoulder,corner[0]-.055),b:at(corner,shoulder,Math.max(shoulder[0]+.14,.43)),low:low(corner,shoulder),high:high(corner,shoulder),tiles:2},
 ];
}

function surfacePoint(meshes:THREE.Mesh[],facet:Facet,side:number,t:number,y:number,normal:THREE.Vector3):THREE.Vector3 {
 const point=new THREE.Vector3(side*(facet.a[0]+(facet.b[0]-facet.a[0])*t),y,facet.a[1]+(facet.b[1]-facet.a[1])*t);
 const ray=new THREE.Raycaster(point.clone().addScaledVector(normal,.6),normal.clone().negate(),0,1.2);
 const hit=ray.intersectObjects(meshes,false)[0];
 if(!hit?.face||Math.abs(hit.point.y-y)>1e-6||hit.face.normal.dot(normal)<.98)
  throw new Error(`Russian chevron requires an actual planar housing face: ${JSON.stringify({point:point.toArray(),normal:normal.toArray(),hit:hit?.point.toArray(),face:hit?.face?.normal.toArray()})}`);
 return hit.point;
}

function leafGeometry(back:readonly Point[],normal:THREE.Vector3,loDepth:number,hiDepth:number):{geometry:THREE.BufferGeometry;face:Point[]} {
 const face=back.map((p,i)=>new THREE.Vector3(...p).addScaledVector(normal,i<2?loDepth:hiDepth).toArray() as Point);
 const rear=back.map(p=>new THREE.Vector3(...p).addScaledVector(normal,.012).toArray());
 return {geometry:orientedSlab(...rear,...face),face};
}

function addFacet(P:ChevronPort,meshes:THREE.Mesh[],facet:Facet,side:number,ridgeDepth:number,leaves:Leaf[]):void {
 const normal=new THREE.Vector3(side*(facet.a[1]-facet.b[1]),0,facet.b[0]-facet.a[0]).normalize();
 const ridge=(facet.low+facet.high)/2,span=Math.hypot(facet.b[0]-facet.a[0],facet.b[1]-facet.a[1]);
 const seam=.022/span;
 for(let i=0;i<facet.tiles;i++){
  const a=i/facet.tiles+seam/2,b=(i+1)/facet.tiles-seam/2;
  for(const course of ['lower','upper'] as const){
   // A 12 mm horizontal service seam separates the two real wedges at their
   // shared visual ridge. Independent shells can be spent/reset with the zone.
   const low=course==='lower'?facet.low:ridge+.006,high=course==='lower'?ridge-.006:facet.high;
   const back=[surfacePoint(meshes,facet,side,a,low,normal),surfacePoint(meshes,facet,side,b,low,normal),
    surfacePoint(meshes,facet,side,b,high,normal),surfacePoint(meshes,facet,side,a,high,normal)].map(p=>p.toArray() as Point);
   // The cassette sits outside the turret, on an inset finite carrier.
   // Only the carrier's 4 mm root enters permanent stock. A visible lip and
   // wider service joints stop the removable leaves reading as buried faces.
   const carrier=[[.045,.09],[.955,.09],[.955,.91],[.045,.91]].map(([u,v])=>
    sampleArmorFace(back[0],back[1],back[2],back[3],u,v,normal.toArray()).point);
   P.addExternalArmor('turret',orientedSlab(
    ...carrier.map(p=>p.clone().addScaledVector(normal,-.004).toArray()),
    ...carrier.map(p=>p.clone().addScaledVector(normal,.018).toArray())));
   const {geometry,face}=leafGeometry(back,normal,course==='lower'?.039:ridgeDepth,course==='lower'?ridgeDepth:.039);
   P.destructibleCluster(`turret_era_${side<0?'L':'R'}`,()=>P.addExternalArmor('turret',markEraHitFaces(geometry,normal.toArray(),.35)));
   leaves.push({side,course,normal:normal.toArray(),back,face});
  }
 }
}

export function addRussianChevronEra(P:ChevronPort,model:number,rows:readonly RussianArmorRow[],housing:readonly THREE.BufferGeometry[]):void {
 const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
 const meshes=housing.map(g=>{const mesh=new THREE.Mesh(g,material);mesh.updateMatrixWorld(true);return mesh;});
 const leaves:Leaf[]=[],facets=cheekFacets(rows,model),depth=[.17,.20,.16][model];
 try {for(const side of[-1,1])for(const facet of facets)addFacet(P,meshes,facet,side,depth,leaves);}
 finally {material.dispose();}
 P.turretG.userData.russianChevronEra={style:'paired-relikt-chevron',courses:2,leaves,cassetteStandOffM:.012,carrierRootM:.004,serviceSeamM:.012};
}
