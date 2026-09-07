// QA-only scalar cross sections. Camera near/far clipping does not cap solids:
// faces parallel to the viewing axis project to zero pixels. Intersect actual
// triangle edges with a physical Z slab instead, including those parallel faces.
import * as THREE from 'three';

export function triangleSlabPoints(vertices, z0, z1) {
  if (!(Number.isFinite(z0) && Number.isFinite(z1) && z1 > z0)) throw new Error('Invalid slab');
  const points=vertices.filter(v=>v.z>=z0 && v.z<=z1);
  for (let i=0;i<3;i++) {
    const a=vertices[i],b=vertices[(i+1)%3],dz=b.z-a.z;
    if (Math.abs(dz)<1e-12) continue;
    for (const z of [z0,z1]) {
      const t=(z-a.z)/dz;
      if (t>=0 && t<=1) points.push(new THREE.Vector3(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,z));
    }
  }
  return points;
}

function visitMeshTriangles(object, visit) {
  const geometry=object.geometry,positions=geometry.attributes.position;
  if (!positions || object.isLine || object.isPoints) return;
  const instance=new THREE.Matrix4(),world=new THREE.Matrix4();
  const vertices=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
  const count=geometry.index?.count ?? positions.count;
  const start=geometry.drawRange.start ?? 0;
  const end=Math.min(count,start+(geometry.drawRange.count ?? Infinity));
  for (let copy=0;copy<(object.isInstancedMesh?object.count:1);copy++) {
    world.copy(object.matrixWorld);
    if (object.isInstancedMesh) {
      object.getMatrixAt(copy,instance);
      world.multiplyMatrices(object.matrixWorld,instance);
    }
    for (let i=start;i+2<end;i+=3) {
      for (let j=0;j<3;j++) vertices[j].fromBufferAttribute(positions,
        geometry.index?geometry.index.getX(i+j):i+j).applyMatrix4(world);
      visit(vertices,object.name);
    }
  }
}

export function measureSlabBounds(root, planes, include=()=>true) {
  const rows=planes.map(([z0,z1])=>({z0,z1,bounds:new THREE.Box3(),witness:{}}));
  root.updateMatrixWorld(true);
  root.traverseVisible(object=>{
    if (!object.isMesh || !include(object)) return;
    visitMeshTriangles(object,(vertices,name)=>{
      const minZ=Math.min(...vertices.map(v=>v.z)),maxZ=Math.max(...vertices.map(v=>v.z));
      for (const row of rows) {
        if (minZ>row.z1 || maxZ<row.z0) continue;
        for (const p of triangleSlabPoints(vertices,row.z0,row.z1)) {
          for (const axis of ['x','y']) {
            if (p[axis]<row.bounds.min[axis]) row.witness[`${axis}Min`]=name;
            if (p[axis]>row.bounds.max[axis]) row.witness[`${axis}Max`]=name;
          }
          row.bounds.expandByPoint(p);
        }
      }
    });
  });
  return rows.map(({z0,z1,bounds,witness})=>bounds.isEmpty()?{z0,z1,empty:true}:
    {z0,z1,width:bounds.max.x-bounds.min.x,top:bounds.max.y,bottom:bounds.min.y,witness});
}
