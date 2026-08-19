import * as THREE from 'three';

export function scaleUV(geometry, scaleU, scaleV) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * scaleU, uv.getY(i) * scaleV);
  }
  return geometry;
}

export function box(width, height, depth, uvScale = 0.5) {
  return scaleUV(
    new THREE.BoxGeometry(width, height, depth),
    Math.max(width, depth) * uvScale,
    height * uvScale,
  );
}

// Thin slabs need per-face world dimensions; scaling every V axis by the box
// height stretches roof and sidewalk textures across their broad faces.
export function slabBox(width, height, depth, uvScale = 0.5) {
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

export function gablePrism(width, height, depth, uvScale = 0.4) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, height);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.translate(0, 0, -depth / 2);
  return scaleUV(geometry, uvScale, uvScale);
}

export function jitterUV(geometry, rng) {
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
