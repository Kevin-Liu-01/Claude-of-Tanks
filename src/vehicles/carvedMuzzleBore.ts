import * as THREE from 'three';
import { isVehicleMesh } from './vehicleMesh.ts';

type Vertex = { p: THREE.Vector3; data: number[] };
type Plane = readonly [number, number, number, number];

/** Subtract a small convex bore from native gun stock. No shader hole, depth
 * offset, hidden cap, CSG dependency, or change to the muzzle's outer outline. */
export function carveMuzzleGeometry(
  source: THREE.BufferGeometry, toBore: THREE.Matrix4,
  radius: number, depth: number, segments: number,
): { geometry: THREE.BufferGeometry; removed: number; added: number } | null {
  const position = source.getAttribute('position');
  if (!position || source.morphAttributes.position?.length) return null;
  const layout = Object.entries(source.attributes);
  const size = layout.reduce((sum, [, attribute]) => sum + attribute.itemSize, 0);
  const planes: Plane[] = [[0, 0, 1, .00001], [0, 0, -1, depth]];
  for (let i = 0; i < segments; i++) {
    const angle = (i + .5) * Math.PI * 2 / segments;
    planes.push([Math.cos(angle), Math.sin(angle), 0, radius * Math.cos(Math.PI / segments)]);
  }
  const output: number[] = [], groups: { start: number; count: number; materialIndex: number }[] = [];
  const count = source.index?.count ?? position.count;
  let changed = false, removed = 0, added = 0;
  const vertex = (index: number): Vertex => ({
    p: new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(toBore),
    data: layout.flatMap(([, attribute]) => Array.from({ length: attribute.itemSize }, (_, k) => attribute.getComponent(index, k))),
  });
  const fans = planarCapRings(source, vertex, radius, depth, segments);
  const emit = (polygon: Vertex[], materialIndex: number) => {
    const start = output.length / size;
    for (let i = 1; i + 1 < polygon.length; i++) {
      const [a, b, c] = [polygon[0], polygon[i], polygon[i + 1]];
      if (b.p.clone().sub(a.p).cross(c.p.clone().sub(a.p)).lengthSq() < 1e-20) continue;
      output.push(...a.data, ...b.data, ...c.data);
    }
    const emitted = output.length / size - start;
    if (!emitted) return;
    const last = groups.at(-1);
    if (last?.materialIndex === materialIndex) last.count += emitted;
    else groups.push({ start, count: emitted, materialIndex });
  };
  for (let t = 0; t < count; t += 3) {
    const fan = fans.get(t);
    if (fan && fan.first === t) {
      fan.triangles.forEach(triangle => emit(triangle, fan.material));
      added += fan.triangles.length;
    }
    if (fan) { changed = true; removed++; continue; }
    const original = [0, 1, 2].map(k => vertex(source.index?.getX(t + k) ?? t + k));
    const materialIndex = source.groups.find(g => t >= g.start && t < g.start + g.count)?.materialIndex ?? 0;
    const bounds = new THREE.Box3().setFromPoints(original.map(v => v.p));
    if (outsideBore(bounds, radius, depth)) {
      emit(original, materialIndex); continue;
    }
    const pieces = subtractPrism(original, planes);
    if (!pieces) { emit(original, materialIndex); continue; }
    changed = true; removed++;
    const before = output.length / size / 3;
    for (const piece of pieces) emit(piece, materialIndex);
    added += output.length / size / 3 - before;
  }
  if (!changed) return null;
  return { geometry: writeGeometry(layout, size, output, source.groups.length ? groups : []), removed, added };
}

function outsideBore(bounds: THREE.Box3, radius: number, depth: number): boolean {
  return bounds.max.z < -depth || bounds.min.z > .00001
    || bounds.min.x >= radius || bounds.max.x <= -radius
    || bounds.min.y >= radius || bounds.max.y <= -radius;
}

function subtractPrism(original: Vertex[], planes: Plane[]): Vertex[][] | null {
  let inside = original;
  const pieces: Vertex[][] = [];
  for (const plane of planes) {
    const split = splitPolygon(inside, plane);
    if (split.outside.length >= 3) pieces.push(split.outside);
    inside = split.inside;
    if (inside.length < 3) return null;
  }
  return pieces;
}

function writeGeometry(
  layout: [string, THREE.BufferAttribute | THREE.InterleavedBufferAttribute][],
  size: number, output: number[], groups: { start: number; count: number; materialIndex: number }[],
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  let offset = 0;
  for (const [name, attribute] of layout) {
    const data = new Float32Array(output.length / size * attribute.itemSize);
    for (let i = 0; i < data.length / attribute.itemSize; i++)
      for (let k = 0; k < attribute.itemSize; k++) data[i * attribute.itemSize + k] = output[i * size + offset + k];
    geometry.setAttribute(name, new THREE.BufferAttribute(data, attribute.itemSize));
    offset += attribute.itemSize;
  }
  for (const g of groups) geometry.addGroup(g.start, g.count, g.materialIndex);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

type Fan = { first: number; triangles: Vertex[][]; material: number };
type Face = { t: number; vertices: Vertex[]; material: number; sign: number };

/** Rebuild a regular fan as one ring. Boolean clipping every fan sector
 * independently creates unnecessary cuts along the old radial spokes. */
function planarCapRings(
  geometry: THREE.BufferGeometry, read: (index: number) => Vertex,
  radius: number, depth: number, segments: number,
): Map<number, Fan> {
  const groups = planarFaceGroups(geometry, read, depth);
  const result = new Map<number,Fan>();
  for (const faces of groups.values()) appendPlanarRings(faces, radius, segments, result);
  return result;
}

function appendPlanarRings(faces: Face[], radius: number, segments: number, result: Map<number,Fan>): void {
    const loops = faceBoundaryLoops(faces.map(f=>f.vertices));
    for (const outer of loops) {
      const hole = Array.from({length:segments},(_,i)=>new THREE.Vector2(radius*Math.cos(i*Math.PI*2/segments),radius*Math.sin(i*Math.PI*2/segments)));
      if (!hole.every(p=>insideContour(p.x,p.y,outer))) continue;
      // Existing vents/interior holes are left to the exact prism cutter.
      if (loops.some(loop=>loop!==outer && insideContour(loop[0].p.x,loop[0].p.y,outer))) continue;
      const members=faces.filter(f=>insideContour(f.vertices.reduce((v,p)=>v+p.p.x,0)/3,
        f.vertices.reduce((v,p)=>v+p.p.y,0)/3,outer));
      if (!members.length) continue;
      const inner=hole.map(p=>interpolateFacePoint(p,members.map(f=>f.vertices)));
      if (inner.some(v=>v===null)) continue;
      const all=[...outer,...inner.filter((v):v is Vertex=>v!==null)];
      const triangles=THREE.ShapeUtils.triangulateShape(outer.map(v=>new THREE.Vector2(v.p.x,v.p.y)),[hole])
        .map(indices=>indices.map(i=>all[i]));
      if(members[0].sign<0)for(const tri of triangles)tri.reverse();
      const fan={first:members[0].t,triangles,material:members[0].material};
      for(const face of members)result.set(face.t,fan);
    }
}

function planarFaceGroups(geometry: THREE.BufferGeometry, read: (index: number) => Vertex, depth: number): Map<string,Face[]> {
  const groups = new Map<string, Face[]>();
  const count = geometry.index?.count ?? geometry.getAttribute('position').count;
  for (let t = 0; t < count; t += 3) {
    const vertices = [0,1,2].map(k => read(geometry.index?.getX(t+k) ?? t+k));
    const [a,b,c] = vertices, z = a.p.z;
    if (z < -depth || z > .00001 || Math.abs(b.p.z-z)>1e-6 || Math.abs(c.p.z-z)>1e-6) continue;
    const sign = Math.sign((b.p.x-a.p.x)*(c.p.y-a.p.y)-(b.p.y-a.p.y)*(c.p.x-a.p.x));
    if (!sign) continue;
    const material = geometry.groups.find(g => t>=g.start && t<g.start+g.count)?.materialIndex ?? 0;
    const key = `${Math.round(z*1e6)}:${sign}:${material}`;
    const group=groups.get(key)??[]; group.push({t,vertices,material,sign}); groups.set(key,group);
  }
  return groups;
}

function faceBoundaryLoops(faces: Vertex[][]): Vertex[][] {
  const key=(v:Vertex)=>`${Math.round(v.p.x*1e6)},${Math.round(v.p.y*1e6)}`;
  const edges=new Map<string,{a:Vertex;b:Vertex;count:number}>();
  for(const face of faces)for(let i=0;i<3;i++){
    const a=face[i],b=face[(i+1)%3],ka=key(a),kb=key(b);
    if(ka===kb)continue;
    const edgeKey=[ka,kb].sort().join('|'),edge=edges.get(edgeKey);
    if(edge)edge.count++;else edges.set(edgeKey,{a,b,count:1});
  }
  if([...edges.values()].some(e=>e.count>2))return [];
  const pending=new Map([...edges.values()].filter(e=>e.count===1).map(e=>[key(e.a),e]));
  const loops:Vertex[][]=[];
  while(pending.size){
    const first=pending.values().next().value;
    if(!first)break;
    const loop=traceBoundary(first,pending,edges.size,key);
    if(loop)loops.push(loop);
  }
  return loops;
}

function traceBoundary(
  first:{a:Vertex;b:Vertex}, pending:Map<string,{a:Vertex;b:Vertex}>, limit:number, key:(v:Vertex)=>string,
): Vertex[] | null {
  let current=first; const loop:Vertex[]=[];
  for(let i=0;i<=limit;i++){
    loop.push(current.a);pending.delete(key(current.a));
    if(key(current.b)===key(first.a))return loop;
    const next=pending.get(key(current.b));if(!next)return null;current=next;
  }
  return null;
}

function insideContour(x:number,y:number,contour:Vertex[]):boolean {
  let inside=false;
  for(let i=0,j=contour.length-1;i<contour.length;j=i++){
    const a=contour[i].p,b=contour[j].p;
    if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}

function interpolateFacePoint(point:THREE.Vector2,faces:Vertex[][]):Vertex|null {
  for(const [a,b,c] of faces){
    const den=(b.p.y-c.p.y)*(a.p.x-c.p.x)+(c.p.x-b.p.x)*(a.p.y-c.p.y);
    if(Math.abs(den)<1e-12)continue;
    const u=((b.p.y-c.p.y)*(point.x-c.p.x)+(c.p.x-b.p.x)*(point.y-c.p.y))/den;
    const v=((c.p.y-a.p.y)*(point.x-c.p.x)+(a.p.x-c.p.x)*(point.y-c.p.y))/den,w=1-u-v;
    if(Math.min(u,v,w)<-1e-7)continue;
    return {p:new THREE.Vector3(point.x,point.y,a.p.z),data:a.data.map((value,k)=>value*u+b.data[k]*v+c.data[k]*w)};
  }
  return null;
}

function splitPolygon(vertices: Vertex[], plane: Plane): { inside: Vertex[]; outside: Vertex[] } {
  const inside: Vertex[] = [], outside: Vertex[] = [];
  const distance = (v: Vertex) => v.p.x * plane[0] + v.p.y * plane[1] + v.p.z * plane[2] - plane[3];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const da = distance(a), db = distance(b);
    (da <= 0 ? inside : outside).push(a);
    if ((da <= 0) === (db <= 0)) continue;
    const t = da / (da - db);
    const cross = { p: a.p.clone().lerp(b.p, t), data: a.data.map((value, k) => value + (b.data[k] - value) * t) };
    inside.push(cross); outside.push(cross);
  }
  return { inside, outside };
}

/** Bore-owned wall and recessed floor use one 12-sided mesh (34 triangles).
 * The mouth annulus is cut from the original painted face, never overlaid. */
export function installCarvedMuzzleBore(
  roots: readonly THREE.Object3D[], frame: THREE.Object3D, radius: number,
  depth: number, material: THREE.Material, disposables: { push(resource: THREE.BufferGeometry): number },
  floorMaterial: THREE.Material = material,
): { removedTriangles: number; addedTriangles: number; cutSurfaces: { name: string; removed: number; added: number }[] } {
  const segments = 12;
  frame.updateWorldMatrix(true, false);
  const inverse = frame.matrixWorld.clone().invert();
  const meshes = new Set<THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>>();
  for (const root of roots) root.traverseVisible(object => {
    if (isVehicleMesh(object) && !object.userData.shadowOnly && !object.userData.cannonBore
        && !object.userData.cannonBoreSuppressed && !object.userData.carvedBoreStock && !(object instanceof THREE.InstancedMesh)) meshes.add(object);
  });
  let removedTriangles = 0, addedTriangles = 0;
  const cutSurfaces: { name: string; removed: number; added: number }[] = [];
  for (const mesh of meshes) {
    const matrix = inverse.clone().multiply(mesh.matrixWorld);
    mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox?.clone().applyMatrix4(matrix);
    if (!bounds || outsideBore(bounds, radius, depth)) continue;
    const cut = carveMuzzleGeometry(mesh.geometry, matrix, radius, depth, segments);
    if (!cut) continue;
    mesh.geometry = cut.geometry; disposables.push(cut.geometry);
    removedTriangles += cut.removed; addedTriangles += cut.added;
    cutSurfaces.push({name:mesh.name,removed:cut.removed,added:cut.added});
  }
  const points: number[] = [], indices: number[] = [];
  for (const z of [0, -depth]) for (let i = 0; i < segments; i++) {
    const angle = i * Math.PI * 2 / segments;
    points.push(radius * Math.cos(angle), radius * Math.sin(angle), z);
  }
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    indices.push(i, j, i + segments, j, j + segments, i + segments);
  }
  points.push(...points.slice(segments * 3));
  for (let i = 1; i < segments - 1; i++) indices.push(segments * 2, segments * 2 + i, segments * 2 + i + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); geometry.setIndex(indices);
  geometry.computeVertexNormals(); disposables.push(geometry);
  geometry.addGroup(0, segments * 6, 0);
  geometry.addGroup(segments * 6, (segments - 2) * 3, 1);
  const wall = new THREE.Mesh(geometry, [material, floorMaterial]);
  wall.name = 'muzzleBoreInnerWallAndBackstop'; wall.userData.carvedBoreStock = true;
  wall.userData.cannonBoreFallbackPart = true;
  frame.add(wall);
  return { removedTriangles, addedTriangles: addedTriangles + indices.length / 3, cutSurfaces };
}

/** Rays read final rendered stock, including generated fills, rather than
 * trusting the conversion flag. Flush caps and absent walls fail separately. */
export function verifyCarvedMuzzleBore(root: THREE.Object3D, frame: THREE.Object3D): {
  measuredMinimumDepthM: number; measuredMaximumDepthM: number;
  measuredMaximumWallErrorM: number; measuredMaximumRimOffsetM: number;
} {
  const receipt = frame.userData.muzzleSeatReceipt;
  const radius: number = receipt.physicalInnerRadiusM, depth: number = receipt.physicalBoreDepthM;
  root.updateWorldMatrix(true, true);
  const surfaces: THREE.Object3D[] = [];
  root.traverseVisible(object => {
    if (!isVehicleMesh(object) || object.userData.shadowOnly) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some(m => m.visible && m.colorWrite && (!m.transparent || m.opacity > .001))) surfaces.push(object);
  });
  const ray = new THREE.Raycaster();
  const hit = (origin: THREE.Vector3, direction: THREE.Vector3) => {
    ray.set(frame.localToWorld(origin), direction.transformDirection(frame.matrixWorld));
    const first = ray.intersectObjects(surfaces, false)[0];
    return first ? frame.worldToLocal(first.point.clone()) : null;
  };
  let minimumDepth=Infinity, maximumDepth=0, maximumWallError=0, maximumRimOffset=0;
  for (const angle of [.17, 1.88, 3.35, 4.94]) {
    const x = Math.cos(angle), y = Math.sin(angle);
    const floor = hit(new THREE.Vector3(x * radius * .65, y * radius * .65, .01), new THREE.Vector3(0,0,-1));
    if (!floor || Math.abs(floor.z + depth) > .001) throw new Error(`Carved bore is capped or has no recessed floor: ${floor?.z} vs ${-depth}`);
    minimumDepth=Math.min(minimumDepth,-floor.z); maximumDepth=Math.max(maximumDepth,-floor.z);
    const rimRadius=radius+Math.min(.002,(receipt.supportOuterRadiusM-radius)*.15);
    const rim=hit(new THREE.Vector3(x*rimRadius,y*rimRadius,.01),new THREE.Vector3(0,0,-1));
    if(!rim || rim.z<-.004 || rim.z>(receipt.physicalRimProjectionM??0)+.004) throw new Error(`Carved bore has no attached native rim: ${rim?.z}`);
    maximumRimOffset=Math.max(maximumRimOffset,Math.abs(rim.z));
    for (const fraction of [.2,.55,.85]) {
      const wall = hit(new THREE.Vector3(0,0,-depth*fraction),new THREE.Vector3(x,y,0));
      // Exact inscribed dodecagon, not a smooth analytic cylinder.
      if (!wall || Math.hypot(wall.x,wall.y) < radius * Math.cos(Math.PI/12) - .0001
          || Math.hypot(wall.x,wall.y) > radius + .0001) throw new Error('Carved bore lacks its inward wall');
      maximumWallError=Math.max(maximumWallError,Math.abs(Math.hypot(wall.x,wall.y)-radius));
    }
  }
  return {measuredMinimumDepthM:minimumDepth,measuredMaximumDepthM:maximumDepth,
    measuredMaximumWallErrorM:maximumWallError,measuredMaximumRimOffsetM:maximumRimOffset};
}
