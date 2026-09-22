// Strv 122 X road-wheel solids: the owner-selected Strv file's fused wheels supply visible section
// scalars (a closed steel bowl about 90 mm behind the hub and tire edge, six shallow pressed recesses).
// Leaf module (2026-09-22 wheel audit): the nation wheel construction 'strv122-pressed-recess' draws
// the same bowl for every Swedish MBT hull, so these solids import no running-gear kit.
import * as THREE from 'three';

type Section = readonly [radius: number, axial: number];
function turned(rows: readonly Section[],segments=64):THREE.BufferGeometry{
  return new THREE.LatheGeometry(rows.map(([r,x])=>new THREE.Vector2(r,x)),segments)
    .rotateZ(-Math.PI/2);
}
function wheelFace(side:-1|1,segments:number):THREE.BufferGeometry{
  // The steel bowl really sits about90mm behind the local hub and tire edge.
  // The six shallow pressed recesses are curved depressions in this closed
  // body, not dark decals or large star plates placed ahead of the source.
  const g=turned([[0,-.176],[.299,-.176],[.316,-.165],[.316,.185],
    [.304,.185],[.294,.180],[.284,.146],[.274,.118],[.254,.118],[.230,.096],[.150,.091],
    [.120,.096],[.103,.130],[.083,.179],[.066,.195],[.052,.205],[0,.205]],segments);
  const a=g.attributes.position;
  for(let i=0;i<a.count;i++){
    const r=Math.hypot(a.getY(i),a.getZ(i)),x=a.getX(i);
    if(r>=.145&&r<=.265&&x>0){
      const angle=Math.atan2(a.getY(i),a.getZ(i));
      const radial=Math.sin(Math.PI*(r-.145)/.120);
      const lobe=Math.pow(Math.max(0,Math.cos(angle*6+1.15)),2);
      a.setX(i,x-.023*Math.max(0,radial)*lobe);
    }
  }
  g.computeVertexNormals();if(side<0)g.rotateY(Math.PI);return g;
}
export function strv122SuppliedWheelSolids(segments=48):{
  core:THREE.BufferGeometry;left:THREE.BufferGeometry;right:THREE.BufferGeometry;
}{
  return{core:turned([[0,-.178],[.052,-.178],[.052,.18],[0,.18]],24),
    left:wheelFace(-1,segments),right:wheelFace(1,segments)};
}
