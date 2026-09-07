// Measured source outer tube and blind octagonal mouth. Nominal120 mm
// gameplay is not used to stretch this owner-selected visual reference.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { c1Length as m, c1Point as p, CHALLENGER1_SUPPLIED_DATUMS as D } from './challenger1XSuppliedFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

function turned(rows:readonly(readonly[number,number])[]):THREE.BufferGeometry{
  return new THREE.LatheGeometry(rows.map(([z,r])=>new THREE.Vector2(m(r),p(0,0,z)[2]-D.trunnion[2])),48)
    .rotateX(Math.PI/2);
}
function polygon(path:THREE.Path,radius:number):void{
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8,x=m(radius)*Math.cos(a),y=m(radius)*Math.sin(a);
    if(i===0)path.moveTo(x,y);else path.lineTo(x,y);
  }
  path.closePath();
}
function throatRadius(x:number,y:number,rawZ:number):number{
  if(Math.hypot(x,y)>m(3))return m(rawZ===211.141739?3.574:rawZ===215.590546?3.464567:2.9133855);
  if(rawZ!==211.141739)return Math.hypot(x,y);
  const angle=Math.atan2(y,x),faceAngle=Math.atan2(Math.sin(angle*8),Math.cos(angle*8))/8;
  return m(2.383416*Math.cos(Math.PI/8)/Math.cos(faceAngle));
}
function octagonalThroat():THREE.BufferGeometry{
  const floor=211.141739,shoulder=215.590546,mouth=216.220474,outer=3.574,
    radius=2.383416,shape=new THREE.Shape();
  // The source entrance has sixteen facets, reducing to eight at the blind
  // floor. Polygon ray radii reproduce that section change without copying
  // source contour vertices. Sub-millimetre exporter quantization is not baked.
  polygon(shape,outer);
  const hole=new THREE.Path();
  polygon(hole,radius);shape.holes.push(hole);
  const g=new THREE.ExtrudeGeometry(shape,{depth:m(mouth-floor),steps:2,bevelEnabled:false,curveSegments:12});
  const position=g.attributes.position;
  for(let i=0;i<position.count;i++){
    const fraction=position.getZ(i)/m(mouth-floor),rawZ=fraction<.25?floor:fraction<.75?shoulder:mouth;
    const x=position.getX(i),y=position.getY(i),r=Math.hypot(x,y),target=throatRadius(x,y,rawZ);
    position.setX(i,x*target/r);position.setY(i,y*target/r);
    position.setZ(i,p(0,0,rawZ)[2]-D.trunnion[2]);
  }
  g.computeVertexNormals();g.computeBoundingBox();return g;
}
export function addChallenger1SuppliedGun(P:TankBuilderPort):void{
  const floor=211.141739;
  const barrel:readonly(readonly[number,number])[]=[[20.748032,0],[20.748032,4.448819],
    [58.188976,5.354331],[117.047241,4.645669],[117.322838,4.370079],
    [125.551178,4.291339],[125.866142,5.472441],[129.645676,5.472441],
    [129.803146,4.724410],[151.850388,4.566929],[152.086609,5.275591],
    [153.543304,5.413],[163.858261,4.291339],[170.708664,3.976378],
    [172.322830,4.251969],[195.314957,4.094489],[196.850388,3.818898],
    [202.401581,4.212599],[202.834641,3.779528],[floor,3.574],[floor,0]];
  P.add('gun',turned(barrel));
  P.add('gun',octagonalThroat());
  const mantle:readonly(readonly[number,number])[]=[[17.834646,0],[17.834646,9.783465],
    [25.35433,7.46063],[32.007874,6.00394],[38.661419,5.41339],
    [58.228348,5.37402],[58.228348,0]];
  P.add('gunMount',turned(mantle));
  P.add('gunDark',KIT.cylZ(m(2.19),m(.02),32),0,0,p(0,0,floor+.025)[2]-D.trunnion[2]);
  // Actual small longitudinal muzzle-reference hood, not a broad MRS box.
  P.add('gun',KIT.box(m(5.905512),m(3.0),m(14.606292)),0,m(5.15),p(0,0,207.224411)[2]-D.trunnion[2]);
  P.muzzleZ=D.muzzleZ-D.trunnion[2];
}
