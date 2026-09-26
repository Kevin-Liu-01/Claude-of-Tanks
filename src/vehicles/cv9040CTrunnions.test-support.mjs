import assert from 'node:assert/strict';
import { Matrix4, Ray, Triangle, Vector3 } from 'three';

// Read finite, outward-wound native stock rather than an equipment AABB.
function stockIntervals(mesh, frame, origin, direction, axis) {
  const geometry=mesh.geometry, positions=geometry.attributes.position;
  const transform=new Matrix4().copy(frame.matrixWorld).invert().multiply(mesh.matrixWorld);
  const ray=new Ray(origin,direction), hit=new Vector3(), normal=new Vector3(), events=[];
  const end=Math.min(geometry.index?.count??positions.count,geometry.drawRange.start+geometry.drawRange.count);
  for(let i=geometry.drawRange.start;i+2<end;i+=3) {
    const points=[0,1,2].map(j=>new Vector3().fromBufferAttribute(positions,geometry.index?geometry.index.getX(i+j):i+j).applyMatrix4(transform));
    const triangle=new Triangle(...points);
    if(!ray.intersectTriangle(...points,false,hit))continue;
    const facing=triangle.getNormal(normal).dot(direction);
    if(Math.abs(facing)>1e-6)events.push({at:hit[axis],delta:facing<0?1:-1});
  }
  events.sort((a,b)=>a.at-b.at);
  const unique=events.filter((e,i)=>!events.slice(0,i).some(p=>Math.abs(p.at-e.at)<1e-6&&p.delta===e.delta));
  let winding=0,start=null;const intervals=[];
  for(const event of unique) {
    const next=winding+event.delta;
    assert(next>=0,'CV9040C support stock has outward winding');
    if(winding===0&&next>0)start=event.at;
    if(winding>0&&next===0)intervals.push([start,event.at]);
    winding=next;
  }
  assert.equal(winding,0,'CV9040C support rays exit closed native stock');
  return intervals;
}

export function verifyCv9040CTrunnions(root) {
  root.updateMatrixWorld(true);
  const frame=root.getObjectByName('rig_turret'),gun=root.getObjectByName('rig_gun');
  const fixed=frame.getObjectByName('turret'),moving=gun.getObjectByName('gunMount');
  for(const dy of [-.04,0,.04])for(const dz of [-.025,0,.025]) {
    const y=gun.position.y+dy,z=gun.position.z+dz;
    const beam=stockIntervals(moving,frame,new Vector3(-100,y,z),new Vector3(1,0,0),'x').find(([a,b])=>a<=-.20&&b>=.20);
    assert(beam,'finite rocking shield surrounds its actual pitching axis');
    const supports=stockIntervals(fixed,frame,new Vector3(-100,y,z),new Vector3(1,0,0),'x');
    for(const side of [-1,1]) {
      const ear=supports.find(([a,b])=>a<=side*.285&&b>=side*.285);
      assert(ear&&ear[1]-ear[0]>=.08,'native turret support reaches each trunnion');
      assert(Math.max(ear[0],beam[0])<=Math.min(ear[1],beam[1])+.005,'fixed ear and rocking shield remain joined');
    }
  }
  for(const side of [-1,1])for(const dx of [-.015,0,.015])for(const dy of [-.04,0,.04]) {
    const intervals=stockIntervals(fixed,frame,new Vector3(side*.285+dx,gun.position.y+dy,-100),new Vector3(0,0,1),'z');
    assert(intervals.some(([a,b])=>a<=1.0&&b>=gun.position.z+.025),'continuous native turret support connects shell to pitching axis');
  }
}
