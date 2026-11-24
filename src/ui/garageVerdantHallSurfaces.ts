// The Verdant Motor Pool hall's surfaces from the battle kit's own painters (garage round 2, 277; Kevin 2026-11-24: "the
// standard garage (motor pool) needs to be updated a lot too, textures etc"). Copyright © 2026 Kevin B. Liu.
//
// The hall's steel (columns, girts, frames, door leaves), its roof trusses and its concrete upstand were vertex colour or
// flat colour. They take the destructible building kit's neutral detail prints (structureDetailTile.ts: rolled plate,
// its grain, scratches and rust) and the regional kit's poured concrete (regionalSurfaces.ts), under the tones they
// already carry. Painted after the Garage presents (garageStage.ts' idle chain), so the first frame pays nothing.
import * as THREE from 'three';

import { SimplexNoise } from '../engine/simplexFast.ts';
import { normalTextureFromHeight, textureFromRgbaPixels } from '../world/proceduralTexture.ts';
import { makeRegionalConcrete } from '../world/regionalSurfaces.ts';
import { paintStructureDetailBuffers } from '../world/structureDetailTile.ts';

/** A print and the gain that keeps the tone it is laid under: 1 / its mean linear albedo. */
export interface VerdantHallPrint {
  readonly albedo: THREE.Texture;
  readonly normal: THREE.Texture;
  readonly gain: number;
}

export interface VerdantHallSurfaces {
  /** Rolled plate: 1.82 m a tile (the kit's 0.55 repeats a metre). */
  readonly plate: VerdantHallPrint;
  /** Poured concrete: 2.38 m a tile (the regional kit's 0.42 repeats a metre). */
  readonly concrete: VerdantHallPrint;
}

/** The kit's sheet-steel rust (its weathering hook's red-oxide) laid into the plate's albedo by the painted mask. */
const RUST: readonly [number, number, number] = [0.47, 0.27, 0.17];

const meanLinear = (px: Uint8ClampedArray): number => {
  let sum = 0;
  for (let index = 0; index < px.length; index += 4) {
    const r = px[index] / 255, g = px[index + 1] / 255, b = px[index + 2] / 255;
    sum += (r ** 2.2) * 0.2126 + (g ** 2.2) * 0.7152 + (b ** 2.2) * 0.0722;
  }
  return sum / (px.length / 4);
};

const tile = (texture: THREE.Texture, repeatPerMetre: number): THREE.Texture => {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatPerMetre, repeatPerMetre);
  return texture;
};

/** Paints the hall's prints a step at a time (each step a few milliseconds: the caller yields between them). */
export function* paintVerdantHallSurfaces(anisotropy: number): Generator<void, VerdantHallSurfaces, void> {
  const noise = new SimplexNoise({ random: mulberry(0x5eed_4a11) });
  const plate = paintStructureDetailBuffers(noise, 'plate');
  yield;
  const { size, px, hgt, rust } = plate;
  if (rust) {
    for (let index = 0; index < size * size; index += 1) {
      const k = rust[index] * 0.7, j = index * 4;
      px[j] = px[j] * (1 - k) + RUST[0] * 255 * k;
      px[j + 1] = px[j + 1] * (1 - k) + RUST[1] * 255 * k;
      px[j + 2] = px[j + 2] * (1 - k) + RUST[2] * 255 * k;
    }
  }
  const plateGain = 1 / Math.max(0.2, meanLinear(px));
  const plateAlbedo = tile(textureFromRgbaPixels(px, size, { srgb: true, anisotropy }), 0.55);
  yield;
  const plateNormal = tile(normalTextureFromHeight(hgt, size, 0.3, anisotropy), 0.55);
  yield;
  const concrete = makeRegionalConcrete('poured', null, anisotropy);
  let step = concrete.next();
  while (!step.done) { yield; step = concrete.next(); }
  const poured = step.value;
  const canvas = poured.albedo.image as HTMLCanvasElement;
  const concretePx = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  return {
    plate: { albedo: plateAlbedo, normal: plateNormal, gain: plateGain },
    concrete: {
      albedo: tile(poured.albedo, 0.42), normal: tile(poured.normal, 0.42),
      gain: 1 / Math.max(0.2, meanLinear(concretePx)),
    },
  };
}

/** Lays a print under a material's tone: its map and normal, its colour lifted by the print's gain. */
export function wearVerdantHallPrint(material: THREE.MeshStandardMaterial, print: VerdantHallPrint): void {
  material.map = print.albedo;
  material.normalMap = print.normal;
  material.color.multiplyScalar(print.gain);
  material.needsUpdate = true;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
