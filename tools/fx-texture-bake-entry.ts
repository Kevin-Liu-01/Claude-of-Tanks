import * as THREE from 'three';
import { createParticleSystem } from '../src/fx/particles.ts';

interface BakedTexture {
  readonly width: number;
  readonly height: number;
  readonly png: string;
}

interface TextureMetrics {
  readonly proceduralMs: number;
  readonly assetLoaded: boolean;
  readonly assetLoadAndDecodeMs: number;
  readonly assetInstallMs: number;
}

declare global {
  interface Window {
    __FX_TEXTURE_BAKE: Record<string, BakedTexture>;
    __FX_TEXTURE_METRICS: TextureMetrics;
  }
}

function poolTexture(pool: { readonly mesh: THREE.Mesh }): THREE.Texture {
  const material = pool.mesh.material;
  if (!(material instanceof THREE.ShaderMaterial)) {
    throw new Error('FX bake expected a shader-backed particle pool');
  }
  const texture = material.uniforms.uMap?.value;
  if (!(texture instanceof THREE.Texture)) {
    throw new Error('FX bake expected a uMap texture');
  }
  return texture;
}

function textureCanvas(texture: THREE.Texture): HTMLCanvasElement {
  if (!(texture.image instanceof HTMLCanvasElement)) {
    throw new Error('FX bake expected a canvas-backed procedural texture');
  }
  return texture.image;
}

const particles = createParticleSystem({ scene: new THREE.Scene() }, { seed: 5000 });
const proceduralStartedAt = performance.now();
particles.warmTextures();
const proceduralMs = performance.now() - proceduralStartedAt;

const textures = {
  smoke: poolTexture(particles.pools.smoke),
  fire: poolTexture(particles.pools.fire),
  prop: poolTexture(particles.pools.psmoke),
  dust: poolTexture(particles.pools.dust),
  flash: poolTexture(particles.pools.flash),
  jet: poolTexture(particles.pools.jet),
};

window.__FX_TEXTURE_BAKE = Object.fromEntries(Object.entries(textures).map(([name, texture]) => [
  name,
  (() => {
    const canvas = textureCanvas(texture);
    return { width: canvas.width, height: canvas.height, png: canvas.toDataURL('image/png') };
  })(),
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
