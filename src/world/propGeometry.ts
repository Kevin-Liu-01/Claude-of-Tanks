import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type RandomSource = () => number;
type Rgb = readonly [number, number, number];

export function scaleUV<T extends THREE.BufferGeometry>(
  geometry: T,
  scaleU: number,
  scaleV: number,
): T {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * scaleU, uv.getY(i) * scaleV);
  }
  return geometry;
}

export function box(width: number, height: number, depth: number, uvScale = 0.5): THREE.BoxGeometry {
  return scaleUV(
    new THREE.BoxGeometry(width, height, depth),
    Math.max(width, depth) * uvScale,
    height * uvScale,
  );
}

// Thin slabs need per-face world dimensions; scaling every V axis by the box
// height stretches roof and sidewalk textures across their broad faces.
export function slabBox(
  width: number,
  height: number,
  depth: number,
  uvScale = 0.5,
): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const uv = geometry.attributes.uv;
  const scaleU = [depth, depth, width, width, width, width];
  const scaleV = [height, height, depth, depth, height, height];
  for (let face = 0; face < 6; face++) {
    for (let vertex = 0; vertex < 4; vertex++) {
      const i = face * 4 + vertex;
      uv.setXY(i, uv.getX(i) * scaleU[face] * uvScale, uv.getY(i) * scaleV[face] * uvScale);
    }
  }
  return geometry;
}

export function gablePrism(
  width: number,
  height: number,
  depth: number,
  uvScale = 0.4,
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, height);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.translate(0, 0, -depth / 2);
  return scaleUV(geometry, uvScale, uvScale);
}

export function jitterUV<T extends THREE.BufferGeometry>(geometry: T, rng: RandomSource): T {
  const uv = geometry.attributes.uv;
  if (!uv) return geometry;
  const offsetU = rng() * 7.31;
  const offsetV = rng() * 5.17;
  const scaleU = 0.86 + rng() * 0.30;
  const scaleV = 0.86 + rng() * 0.30;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * scaleU + offsetU, uv.getY(i) * scaleV + offsetV);
  }
  return geometry;
}

function paintVertices<T extends THREE.BufferGeometry>(geometry: T, color: Rgb): T {
  const position = geometry.getAttribute('position');
  const values = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    values[i * 3] = color[0];
    values[i * 3 + 1] = color[1];
    values[i * 3 + 2] = color[2];
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
  return geometry;
}

/**
 * Distance representation for the sourced telephone pole. The authored mesh
 * remains authoritative at readable range; beyond that, its 6,528 triangles
 * collapse to the same trunk/crossarm/insulator silhouette in 340 triangles.
 */
export function makeTelephonePoleDistanceGeometry(): THREE.BufferGeometry {
  const wood: Rgb = [0.43, 0.34, 0.23];
  const darkWood: Rgb = [0.29, 0.23, 0.17];
  const ceramic: Rgb = [0.14, 0.21, 0.16];
  const parts: THREE.BufferGeometry[] = [];
  const add = (geometry: THREE.BufferGeometry, color: Rgb): void => {
    parts.push(paintVertices(geometry, color));
  };

  const trunk = new THREE.CylinderGeometry(0.11, 0.18, 7.15, 7, 1, false);
  trunk.translate(0, 3.43, 0);
  add(trunk, wood);

  const crossarms = [[6.18, 3.15], [5.56, 2.72]] as const;
  for (const [armY, armLength] of crossarms) {
    add(box(armLength, 0.14, 0.12).translate(0, armY, 0), darkWood);
    for (const x of [-armLength * 0.39, 0, armLength * 0.39]) {
      const peg = new THREE.CylinderGeometry(0.035, 0.035, 0.23, 5, 1, false);
      peg.translate(x, armY + 0.17, 0);
      add(peg, darkWood);
      const cap = new THREE.CylinderGeometry(0.07, 0.09, 0.13, 6, 1, false);
      cap.translate(x, armY + 0.34, 0);
      add(cap, ceramic);
    }
  }

  for (const side of [-1, 1]) {
    const brace = box(0.065, 1.18, 0.07);
    brace.rotateZ(side * 0.58);
    brace.translate(side * 0.32, 5.30, 0);
    add(brace, darkWood);
  }

  const expanded = parts.map((geometry) => (geometry.index ? geometry.toNonIndexed() : geometry));
  const merged = mergeGeometries(expanded, false);
  for (const geometry of new Set([...parts, ...expanded])) geometry.dispose();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  merged.userData.distanceRepresentation = 'telephone-pole';
  return merged;
}
