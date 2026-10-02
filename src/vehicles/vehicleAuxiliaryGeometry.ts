import * as THREE from 'three';

export interface SmokeSocket { position: [number, number, number]; direction: [number, number, number] }
/** Mark the actual forward aperture before placement. Triangle offsets survive
 * authored transforms, clones and vehicle resizing without extra geometry. */
export function markSmokeTube<T extends THREE.BufferGeometry>(geometry: T, axis: readonly number[] = [0,0,1], curved = false): T {
  const normals = geometry.getAttribute('normal'), count = geometry.index?.count ?? normals.count;
  const n = new THREE.Vector3(...axis).normalize(), faces: number[] = [];
  const vertex = (offset:number) => geometry.index?.getX(offset) ?? offset;
  const positions=geometry.getAttribute('position');
  let front=-Infinity;
  for(let i=0;i<positions.count;i++)front=Math.max(front,positions.getX(i)*n.x+positions.getY(i)*n.y+positions.getZ(i)*n.z);
  for (let face=0; face<count; face+=3) {
    if ([0,1,2].every(corner => {
      const i=vertex(face+corner);
      return normals.getX(i)*n.x+normals.getY(i)*n.y+normals.getZ(i)*n.z > (curved ? .01 : .98)
        && positions.getX(i)*n.x+positions.getY(i)*n.y+positions.getZ(i)*n.z >= front-.02;
    })) faces.push(face);
  }
  if (!faces.length) throw new Error('Smoke tube needs a forward aperture');
  geometry.userData.smokeAperture = faces;
  return geometry;
}
/** Open cylinders have no forward face. Retain opposing rim vertices and a
 * second rim as the axis, so every subsequent geometry transform still applies. */
export function markOpenSmokeTube<T extends THREE.BufferGeometry>(geometry:T):T{
  const p=geometry.getAttribute('position');let min=Infinity,max=-Infinity;
  for(let i=0;i<p.count;i++){min=Math.min(min,p.getZ(i));max=Math.max(max,p.getZ(i));}
  const pair=(z:number)=>{
    const indices:number[]=[];for(let i=0;i<p.count;i++)if(Math.abs(p.getZ(i)-z)<1e-5)indices.push(i);
    const a=indices[0]!;let b=a,dist=-1;
    for(const i of indices){const d=(p.getX(i)-p.getX(a))**2+(p.getY(i)-p.getY(a))**2;if(d>dist){dist=d;b=i;}}
    return [a,b];
  };
  geometry.userData.openSmokeAperture=[...pair(max),...pair(min)];return geometry;
}
/** Area weighting avoids the duplicated cap-center vertices biasing the mouth. */
export function registerSmokeSockets(mesh: THREE.Object3D, parts: readonly THREE.BufferGeometry[]): void {
  const sockets: SmokeSocket[] = [];
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3();
  for (const part of parts) {
    const open=part.userData.openSmokeAperture as number[]|undefined;
    if(open){
      const vertices=part.getAttribute('position');
      a.fromBufferAttribute(vertices,open[0]!);b.fromBufferAttribute(vertices,open[1]!);a.add(b).multiplyScalar(.5);
      b.fromBufferAttribute(vertices,open[2]!);c.fromBufferAttribute(vertices,open[3]!);b.add(c).multiplyScalar(.5);
      sockets.push({position:a.toArray(),direction:b.subVectors(a,b).normalize().toArray()});continue;
    }
    const faces = part.userData.smokeAperture as number[] | undefined;
    if (!faces?.length) continue;
    const pos = part.getAttribute('position'), normal = part.getAttribute('normal');
    const p = new THREE.Vector3(), n = new THREE.Vector3(); let total=0;
    const vertex=(offset:number)=>part.index?.getX(offset)??offset;
    for (const face of faces) {
      const ia=vertex(face),ib=vertex(face+1),ic=vertex(face+2);
      a.fromBufferAttribute(pos,ia);b.fromBufferAttribute(pos,ib);c.fromBufferAttribute(pos,ic);
      const area=ab.subVectors(b,a).cross(ac.subVectors(c,a)).length();
      p.addScaledVector(a,area/3).addScaledVector(b,area/3).addScaledVector(c,area/3);
      n.x+=normal.getX(ia)*area;n.y+=normal.getY(ia)*area;n.z+=normal.getZ(ia)*area;total+=area;
    }
    if(total<1e-12)throw new Error('Smoke aperture collapsed');
    p.divideScalar(total); n.normalize();
    sockets.push({ position: p.toArray(), direction: n.toArray() });
  }
  if (sockets.length) mesh.userData.smokeSockets = sockets;
}
export function smokeSocketsFor(mesh: THREE.Object3D): readonly SmokeSocket[] {
  return (mesh.userData.smokeSockets as SmokeSocket[] | undefined) ?? [];
}
/** Static batches bake sibling transforms into an identity mesh. Keep the same
 * launcher mouths on that mesh so both quality paths retain functional equipment. */
export function transferSmokeSockets(sources: readonly THREE.Object3D[], batch: THREE.Object3D): void {
  const sockets: SmokeSocket[] = [];
  const position = new THREE.Vector3(), direction = new THREE.Vector3();
  for (const source of sources) {
    source.updateMatrix();
    for (const socket of smokeSocketsFor(source)) {
      position.fromArray(socket.position).applyMatrix4(source.matrix);
      direction.fromArray(socket.direction).transformDirection(source.matrix);
      sockets.push({ position: position.toArray(), direction: direction.toArray() });
    }
  }
  if (sockets.length) batch.userData.smokeSockets = sockets;
}

/** Correct the complete mounted bank, including its caps and support, in the
 * turret/hull frame. Parent mount yaw must not turn the outside tubes aft. */
export function alignSmokeBanks(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const banks: THREE.Object3D[] = [];
  root.traverse(o => { if(o.userData.fittingRoot && o.userData.fitting==='smokeBank') banks.push(o); });
  for(const bank of banks){
    let owner=bank.parent;
    while(owner?.parent && owner.name!=='rig_turret' && owner.name!=='rig_hull')owner=owner.parent;
    if(!owner || !bank.parent)continue;
    const inv=new THREE.Matrix4().copy(owner.matrixWorld).invert();
    let min=Infinity,max=-Infinity;
    bank.traverse(o=>{const m=inv.clone().multiply(o.matrixWorld);for(const s of smokeSocketsFor(o)){
      const d=new THREE.Vector3(...s.direction).transformDirection(m);const yaw=Math.atan2(d.x,d.z);min=Math.min(min,yaw);max=Math.max(max,yaw);
    }});
    if(!Number.isFinite(min))continue;
    const delta = max>1.35 ? 1.35-max : min< -1.35 ? -1.35-min : 0;
    if(!delta)continue;
    const parentQ=bank.parent.getWorldQuaternion(new THREE.Quaternion());
    const ownerQ=owner.getWorldQuaternion(new THREE.Quaternion());
    const rotation=parentQ.clone().invert().multiply(ownerQ)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),delta))
      .multiply(ownerQ.clone().invert()).multiply(parentQ);
    bank.quaternion.premultiply(rotation);bank.updateMatrixWorld(true);
  }
}
