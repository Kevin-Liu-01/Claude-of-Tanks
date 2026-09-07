import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function shearedArm(width: number, pivotHeight: number, axleHeight: number,
  shear: number): THREE.BufferGeometry {
  if (!Number.isFinite(shear) || Math.abs(shear) > .5) {
    throw new RangeError('Source arm axial shear must be finite and within half a metre');
  }
  const parts: THREE.BufferGeometry[] = [];
  for (const [end, height] of [[-1, pivotHeight], [1, axleHeight]]) {
    const shape = new THREE.Shape(), phase = end < 0 ? Math.PI / 2 : -Math.PI / 2;
    for (let i = 0; i <= 8; i++) {
      const a = phase + i * Math.PI / 8, z = end * .5 + Math.cos(a) * .12;
      const y = Math.sin(a) * height / 2;
      if (i === 0) shape.moveTo(z, y); else shape.lineTo(z, y);
    }
    shape.closePath();
    parts.push(new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false })
      .translate(0, 0, -width / 2).rotateY(-Math.PI / 2).translate(end * shear / 2, 0, 0));
  }
  // Separate closed endpoint forgings keep their actual axial faces flat.
  // The connecting web alone carries the shear; warping one triangulated
  // long cap would bow each endpoint face toward the opposite endpoint.
  const web = new THREE.BoxGeometry(width, 1, 1), positions = web.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const z = positions.getZ(i), height = pivotHeight + (z + .5) * (axleHeight - pivotHeight);
    positions.setXYZ(i, positions.getX(i) + z * shear, positions.getY(i) * height, z);
  }
  web.computeVertexNormals();
  parts.push(web.toNonIndexed());
  web.dispose();
  const result = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!result) throw new Error('Source arm forgings must have compatible original attributes');
  return result;
}

/** Original closed forged-web primitive; +Z is the moving axle end. */
export function dimensionedSuspensionArm(width: number, pivotHeight: number, axleHeight: number,
  axialShearM?: number): THREE.BufferGeometry {
  if (axialShearM !== undefined) return shearedArm(width, pivotHeight, axleHeight, axialShearM);
  // Two rounded endpoint forgings are joined by the sloping web. The source
  // axial sides are flat: an elliptical XY tube would falsely narrow the
  // web's vertical silhouette near either measured lateral side face.
  const outline=new THREE.Shape();
  for(const [centerZ,height,phase] of [[-.5,pivotHeight,Math.PI/2],[.5,axleHeight,-Math.PI/2]]) {
    for(let i=0;i<=8;i++) {
      const angle=phase+i*Math.PI/8;
      const z=centerZ+Math.cos(angle)*.12,y=Math.sin(angle)*height/2;
      if(centerZ<0&&i===0)outline.moveTo(z,y);else outline.lineTo(z,y);
    }
  }
  outline.closePath();
  return new THREE.ExtrudeGeometry(outline,{depth:width,bevelEnabled:false,curveSegments:8})
    .translate(0,0,-width/2).rotateY(-Math.PI/2);
}
