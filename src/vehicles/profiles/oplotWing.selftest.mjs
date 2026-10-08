import assert from 'node:assert/strict';
import {Vector3,Triangle,Ray,Plane} from 'three';
import {sampleArmorFace} from './armorFaceSampling.ts';
import {oplotWing,oplotWingSeat,OPLOT_WING_ERA_SEATS,OPLOT_WING_TOP} from './oplotWing.ts';
import {shellPart,mirroredSurfaceError} from '../../../tools/base-shell-audit-math.mjs';

const top=OPLOT_WING_TOP;
assert.equal(OPLOT_WING_ERA_SEATS.length,15);
let worstGap=-Infinity,oldSurfaceMiss=0;
for(const side of [-1,1]){
  const quad=top.map(([x,y,z])=>[side*x,y,z]);
  const [a,b,c,d]=quad.map(p=>new Vector3(...p));
  const triangles=[new Triangle(a,b,c),new Triangle(a,c,d)];
  for(const u of [.22,.50,.78])for(const v of [.10,.245,.39,.535,.68]){
    const old=sampleArmorFace(...quad,u,v,[0,1,0]);
    oldSurfaceMiss=Math.max(oldSurfaceMiss,Math.abs(triangles[u>=v?0:1].getPlane(new Plane()).distanceToPoint(old.point)));
  }
  for(const [sx,sz] of OPLOT_WING_ERA_SEATS){
    const f=oplotWingSeat(sx,sz,side);
    assert.ok(triangles.some(t=>Math.abs(t.getPlane(new Plane()).distanceToPoint(f.point))<1e-12),'seat is on an actual roof plane');
    const z=new Vector3(0,0,-1).addScaledVector(f.normal,f.normal.z).normalize();
    const x=new Vector3().crossVectors(f.normal,z).normalize();
    // The whole conservative rectangular carrier footprint, including the
    // corners that cross the ridge, must remain supported after 12 mm embed.
    for(const dx of [-.235/2,0,.235/2])for(const dz of [-.205/2,0,.205/2]){
      const point=f.point.clone().addScaledVector(x,dx).addScaledVector(z,dz);
      const ray=new Ray(point.clone().addScaledVector(f.normal,1),f.normal.clone().negate());
      const hits=triangles.map(t=>ray.intersectTriangle(t.a,t.b,t.c,false,new Vector3())).filter(Boolean);
      assert.ok(hits.length,'entire cassette footprint stays within the wing');
      const surface=hits.sort((p,q)=>p.distanceTo(ray.origin)-q.distanceTo(ray.origin))[0];
      const gap=point.clone().sub(surface).dot(f.normal)-.012;
      worstGap=Math.max(worstGap,gap);
      assert.ok(gap<=1e-6,`cassette underside remains supported across roof crease (gap ${gap})`);
    }
    const mirror=oplotWingSeat(sx,sz,1);
    assert.ok(f.point.distanceTo(new Vector3(side*mirror.point.x,mirror.point.y,mirror.point.z))<1e-12);
    assert.ok(f.normal.distanceTo(new Vector3(side*mirror.normal.x,mirror.normal.y,mirror.normal.z))<1e-12);
  }
}
assert.ok(oldSurfaceMiss>.012,'negative control detects the former bilinear/triangle mismatch');
console.log(`Oplot roof sampling: both wings and 30 complete cassette footprints supported; worst gap ${worstGap.toFixed(6)} m`);

const left=oplotWing(-1),right=oplotWing(1);
assert.ok(mirroredSurfaceError(shellPart(left),shellPart(right)).maxM<1e-6,'entire welded wing mirrors exactly');
left.dispose();right.dispose();
