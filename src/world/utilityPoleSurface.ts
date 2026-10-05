import * as THREE from 'three';

/** Small shared timber tile; the right-hand strip is neutral for glazed insulators. */
export function createUtilityPoleMaterial(anisotropy = 1): THREE.MeshStandardMaterial {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const phase = y / size * Math.PI * 2;
    const bend = Math.sin(phase) * 1.4 + Math.sin(phase * 3 + x * .06) * .6;
    const grain = Math.sin((x + bend) * 1.7) * .5 + .5;
    const split = Math.pow(Math.max(0, Math.sin((x + bend * .4) * .43)), 18);
    const weather = Math.sin(x * .17 + Math.sin(phase) * .5) * .5 + .5;
    const value = x >= 100 ? 255 : Math.round(255 * (.78 + grain * .14 + weather * .08 - split * .19));
    const i = (y * size + x) * 4;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
    pixels[i + 3] = 255;
  }
  const map = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  map.name = 'utility-pole-weathered-grain';
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = anisotropy;
  map.needsUpdate = true;
  return new THREE.MeshStandardMaterial({
    name: 'utility-pole-timber', vertexColors: true, map, bumpMap: map,
    bumpScale: .025, roughness: .88, metalness: 0,
  });
}

/** Own a UV-mapped copy: never mutate the shared baked source or its collision bounds. */
export function textureUtilityPoleGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  const position = geometry.getAttribute('position');
  const colors = geometry.getAttribute('color');
  const normal = geometry.getAttribute('normal');
  const uv = new Float32Array(position.count * 2);
  for (let face = 0; face < position.count; face += 3) {
    const x = (position.getX(face) + position.getX(face + 1) + position.getX(face + 2)) / 3;
    // Crossarms run across the post; grain follows their length, not the trunk's.
    const crossarm = Math.abs(x) > .25;
    for (let j = 0; j < 3; j++) {
      const i = face + j;
      // Warm low-saturation timber; red-brown metal brackets remain untextured.
      const timber = colors.getX(i) > colors.getY(i) * 1.05
        && colors.getX(i) < colors.getY(i) * 1.8;
      const across = crossarm ? (position.getY(i) - 6) * .22 : Math.abs(normal.getX(i)) > Math.abs(normal.getZ(i)) ? position.getZ(i) : position.getX(i);
      uv[i * 2] = timber ? Math.max(.04, Math.min(.72, .38 + across * .83)) : .9375;
      uv[i * 2 + 1] = (crossarm ? position.getX(i) : position.getY(i)) * .7;
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}
