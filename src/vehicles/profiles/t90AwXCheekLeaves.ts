// Independently measured upper/lower reactive leaves: source stock, pitch,
// clipped back footprint and true folded air, not scaled turret geometry.
import * as THREE from 'three';
import {orientedSlab} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {markEraHitFaces,markEraFurniture} from './eraHitFaces.ts';
import {T90_AW_X_SOURCE_DATUMS} from '../t90AwXArmor.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
type V=readonly[number,number,number];
interface Leaf{readonly front:V;readonly back:V;readonly normal:V;readonly backNormal:V;readonly width:number;readonly depth:number;readonly backDepth:number;}
const LEAVES:readonly Leaf[]=[
  {front:[1.453186,1.951948,.649274],back:[1.428170,1.914505,.634599],normal:[.349328,.914330,.204864],backNormal:[.344459,.916821,.201960],width:.28945,depth:.4650,backDepth:.4429},
  {front:[1.549350,1.735226,.705819],back:[1.510113,1.763322,.682767],normal:[.434266,-.863942,.254985],backNormal:[.433852,-.864229,.254716],width:.28929,depth:.299748,backDepth:.24976},
  {front:[1.328486,1.964923,.925040],back:[1.304366,1.927451,.909297],normal:[.337415,.915490,.219155],backNormal:[.332724,.917900,.216230],width:.289325,depth:.465174,backDepth:.442771},
  {front:[1.422602,1.748514,.986145],back:[1.384416,1.776493,.961294],normal:[.424326,-.862504,.275744],backNormal:[.423837,-.862806,.275550],width:.289289,depth:.299766,backDepth:.249796},
  // The innermost regular upper skin has small irregular source crown faces;
  // this plane joins its measured rim and stock, not an invented larger box.
  {front:[1.104096,1.970651,1.266602],back:[1.080505,1.932994,1.249845],normal:[.3269,.91555,.2326],backNormal:[.322237,.918384,.229639],width:.28939,depth:.4652,backDepth:.442788},
  {front:[1.195451,1.754200,1.331812],back:[1.158407,1.782162,1.305340],normal:[.412760,-.862015,.294208],backNormal:[.412411,-.862225,.294083],width:.28937,depth:.299983,backDepth:.249755},
];
function corners(center:V,normal:V,width:number,depth:number):number[][]{
  const n=new THREE.Vector3(...normal).normalize(),u=new THREE.Vector3(n.z,0,-n.x).normalize(),v=new THREE.Vector3().crossVectors(n,u);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>new THREE.Vector3(...center).addScaledVector(u,a*width/2).addScaledVector(v,b*depth/2).toArray());
}
function transformed(points:number[][],side:number,third:boolean):number[][]{
  // Original source left/right leaves are reflected about raw X0; canonical
  // hull centering adds the same -0.95 mm offset to both sides.
  for(const p of points){p[0]=side*(p[0]+.00094997882843)-.00094997882843;
    if(third&&side<0){p[0]-=.0530;p[2]-=.03766;}}
  return points;
}
function leafGeometry(leaf:Leaf,side:number,third:boolean):THREE.BufferGeometry{
  const points=transformed([...corners(leaf.back,leaf.backNormal,leaf.width,leaf.backDepth),...corners(leaf.front,leaf.normal,leaf.width,leaf.depth)],side,third);
  const g=orientedSlab(...points),n:V=[side*leaf.normal[0],leaf.normal[1],leaf.normal[2]];
  return markEraHitFaces(g,n,.99);
}
function foldGeometry(upper:Leaf,lower:Leaf,side:number,third:boolean):THREE.BufferGeometry{
  const u=corners(upper.front,upper.normal,upper.width,upper.depth),l=corners(lower.front,lower.normal,lower.width,lower.depth);
  const ub=corners(upper.back,upper.backNormal,upper.width,upper.backDepth),lb=corners(lower.back,lower.backNormal,lower.width,lower.backDepth);
  // The two measured back skins meet at one crease: this is a triangular
  // fold, not an eight-corner slab with a nearly collapsed/self-crossing cap.
  const points=transformed([ub[0],ub[1],lb[2],lb[3],u[0],u[1],l[2],l[3]],side,third).map(p=>new THREE.Vector3(...p));
  const up=points[4].clone().add(points[5]).multiplyScalar(.5),lo=points[6].clone().add(points[7]).multiplyScalar(.5);
  const rear=points.slice(0,4).reduce((a,p)=>a.add(p),new THREE.Vector3()).multiplyScalar(.25);
  const axis=new THREE.Vector3(upper.normal[2],0,-side*upper.normal[0]).normalize(),radial=new THREE.Vector3().crossVectors(axis,new THREE.Vector3(0,1,0));
  const ring=[up,lo,rear].map(p=>[p.y,p.dot(radial)] as [number,number]);
  const area=ring.reduce((a,p,i)=>a+p[0]*ring[(i+1)%3][1]-ring[(i+1)%3][0]*p[1],0);if(area<0)ring.reverse();
  const z=up.dot(axis),half=Math.min(upper.width,lower.width)/2;
  const g=sectionSolid([{z:z-half,ring},{z:z+half,ring}]);g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,1,0),radial,axis));
  return markEraHitFaces(g,[side*Math.abs(upper.normal[0])*2.1,.52,upper.normal[2]*2.1],.97);
}
function thinQuad(points:number[][],side:number,normal:V):THREE.BufferGeometry{
  const n=new THREE.Vector3(...normal).normalize(),front=points.map(p=>[...p]),back=points.map(p=>new THREE.Vector3(...p).addScaledVector(n,-.003).toArray());
  return orientedSlab(...transformed([...back,...front],side,true));
}
function openThirdUpper(P:TankBuilderPort,leaf:Leaf,side:number):void{
  const pivot=T90_AW_X_SOURCE_DATUMS.turretPivot,put=(g:THREE.BufferGeometry)=>P.addExternalArmor('turret',g,-pivot[0],-pivot[1],-pivot[2]);
  // The source third cassette has an exposed back sheet and narrow remaining
  // upper rims. A full max-height roof would cover its real open case.
  const back=corners(leaf.back,leaf.backNormal,leaf.width,leaf.backDepth),front=corners(leaf.front,leaf.normal,leaf.width,leaf.depth);
  put(markEraHitFaces(thinQuad(back,side,leaf.backNormal),[side*leaf.backNormal[0],leaf.backNormal[1],leaf.backNormal[2]],.99));
  const inner=corners(leaf.front,leaf.normal,leaf.width-.010,leaf.depth-.010);
  for(let i=0;i<4;i++){
    const j=(i+1)%4;
    put(markEraHitFaces(thinQuad([front[i],front[j],inner[j],inner[i]],side,leaf.normal),[side*leaf.normal[0],leaf.normal[1],leaf.normal[2]],.99));
    const a=new THREE.Vector3(...front[j]).sub(new THREE.Vector3(...front[i])),b=new THREE.Vector3(...back[i]).sub(new THREE.Vector3(...front[i]));
    const wallNormal=a.cross(b).normalize();
    put(markEraFurniture(thinQuad([front[i],front[j],back[j],back[i]],side,wallNormal.toArray() as [number,number,number])));
  }
}
export function addT90AWCheekLeaves(P:TankBuilderPort):void{
  const pivot=T90_AW_X_SOURCE_DATUMS.turretPivot;
  for(const side of [-1,1])for(let i=0;i<3;i++)P.destructibleCluster(`turret_era_${side<0?'L':'R'}`,()=>{
    const upper=LEAVES[i*2],lower=LEAVES[i*2+1],third=i===2;
    if(third)openThirdUpper(P,upper,side);else P.addExternalArmor('turret',leafGeometry(upper,side,false),-pivot[0],-pivot[1],-pivot[2]);
    P.addExternalArmor('turret',leafGeometry(lower,side,third),-pivot[0],-pivot[1],-pivot[2]);
    P.addExternalArmor('turret',foldGeometry(upper,lower,side,third),-pivot[0],-pivot[1],-pivot[2]);
  });
}
