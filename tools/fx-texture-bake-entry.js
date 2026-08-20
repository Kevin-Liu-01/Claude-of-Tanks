import * as THREE from 'three';
import { createParticleSystem } from '../src/fx/particles.js';

const particles = createParticleSystem({ scene: new THREE.Scene() }, { seed: 5000 });
const proceduralStartedAt = performance.now();
particles.warmTextures();
const proceduralMs = performance.now() - proceduralStartedAt;

const textures = {
  smoke: particles.pools.smoke.mesh.material.uniforms.uMap.value,
  fire: particles.pools.fire.mesh.material.uniforms.uMap.value,
  prop: particles.pools.psmoke.mesh.material.uniforms.uMap.value,
  dust: particles.pools.dust.mesh.material.uniforms.uMap.value,
  flash: particles.pools.flash.mesh.material.uniforms.uMap.value,
  jet: particles.pools.jet.mesh.material.uniforms.uMap.value,
};

window.__FX_TEXTURE_BAKE = Object.fromEntries(Object.entries(textures).map(([name, texture]) => [
  name,
  {
    width: texture.image.width,
    height: texture.image.height,
    png: texture.image.toDataURL('image/png'),
  },
]));

const assetParticles = createParticleSystem({ scene: new THREE.Scene() }, { seed: 5000 });
const assetStartedAt = performance.now();
const assetLoaded = await assetParticles.preloadTextures();
const assetReadyAt = performance.now();
assetParticles.warmTextures();
window.__FX_TEXTURE_METRICS = {
  proceduralMs,
  assetLoaded,
  assetLoadAndDecodeMs: assetReadyAt - assetStartedAt,
  assetInstallMs: performance.now() - assetReadyAt,
};
