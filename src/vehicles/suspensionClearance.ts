import * as THREE from 'three';

type Side = 'left' | 'right';
export interface SpatialArmClearance {
  minimumM: number;
  samples: number;
  arms: number;
}

function roadSurfaces(arm: THREE.InstancedMesh, hull: THREE.Object3D): THREE.Object3D[] {
  const result: THREE.Object3D[] = [];
  hull.traverse(object => {
    if (!(object instanceof THREE.InstancedMesh)
      || object.userData.runningGearUnitId !== arm.userData.runningGearUnitId) return;
    if (object.userData.dynamicWheelFace || /^gearRoadWheel(Tires|Discs|DiscsRecessed|Insets)$/.test(object.name))
      result.push(object);
  });
  return result;
}

function triangleSamples(points: THREE.Vector3[]): THREE.Vector3[] {
  return [...points,
    points[0].clone().add(points[1]).multiplyScalar(.5),
    points[1].clone().add(points[2]).multiplyScalar(.5),
    points[2].clone().add(points[0]).multiplyScalar(.5),
    points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1 / 3)];
}

function outboardSamples(geometry:THREE.BufferGeometry,matrix:THREE.Matrix4,sign:number):THREE.Vector3[] {
  const position=geometry.attributes.position,index=geometry.index,result:THREE.Vector3[]=[];
  for(let i=0;i<(index?.count??position.count);i+=3) {
    const points=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(position,
      index?index.getX(i+j):i+j).applyMatrix4(matrix));
    const normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
    if(normal.x*sign>=.8)result.push(...triangleSamples(points));
  }
  return result;
}

/** Diagnostic-only narrow phase. Compare actual same-Y/Z surfaces, not the
 * unrelated extreme X points of a dished wheel and an axially sheared arm.
 * Uses the current native instance matrices and facing materials; no stored
 * builder "pass" flag, invisible proxy solid, or reduced clearance floor.
 * No call from the simulation/render hot path.
 */
export function measureSpatialArmClearance(object: THREE.Object3D, side: Side): SpatialArmClearance | null {
  if (!(object instanceof THREE.InstancedMesh)) return null;
  let hull: THREE.Object3D | null = object.parent;
  while (hull && hull.name !== 'rig_hull') hull = hull.parent;
  if (!hull) return null;
  hull.updateWorldMatrix(true, true);
  const wheels = roadSurfaces(object, hull);
  if (!wheels.length) return null;
  const inverse = hull.matrixWorld.clone().invert(), matrix = new THREE.Matrix4();
  const sign = side === 'left' ? -1 : 1;
  const direction = new THREE.Vector3(sign, 0, 0).transformDirection(hull.matrixWorld);
  const ray = new THREE.Raycaster(), intersections: THREE.Intersection[] = [];
  let minimumM = Infinity, samples = 0, arms = 0;
  for (let instance = 0; instance < object.count; instance++) {
    object.getMatrixAt(instance, matrix);
    matrix.premultiply(object.matrixWorld).premultiply(inverse);
    if (Math.sign(matrix.elements[12]) !== sign) continue;
    let hits = 0;
    for (const point of outboardSamples(object.geometry,matrix,sign)) {
        const origin = new THREE.Vector3(0, point.y, point.z).applyMatrix4(hull.matrixWorld);
        ray.set(origin, direction);
        intersections.length = 0;
        ray.intersectObjects(wheels, false, intersections);
        const hit = intersections[0];
        if (!hit) continue;
        const contact = hit.point.clone().applyMatrix4(inverse);
        minimumM = Math.min(minimumM, sign * (contact.x - point.x));
        samples++;
        hits++;
    }
    // Missing/cull-reversed wheel surfaces are not evidence of safe air.
    if (hits < 12) return null;
    arms++;
  }
  return arms > 0 && Number.isFinite(minimumM) ? {minimumM, samples, arms} : null;
}
