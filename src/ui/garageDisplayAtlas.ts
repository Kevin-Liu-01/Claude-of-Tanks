import * as THREE from 'three';

import { getDeviceTier } from '../engine/quality.ts';
import { GARAGE_DISPLAY_ATLAS_MANIFEST } from './garageDisplayAtlas.generated.ts';
import type { KitAtlasRect } from './garageKitGeometry.ts';

/**
 * The Garages' one display atlas at runtime (garage r9). Every banner, crest, nameboard, framed print, monitor readout,
 * map screen, safety pictogram, stencil, decal and lamp lens samples a named rect of
 * `public/textures/garage/garage-display-atlas.webp` through the generated manifest; geometry never names a pixel, so
 * a rebrand is a re-run of tools/generate-garage-display-atlas.mjs on new public/brand art.
 *
 * Two materials draw it, each on a shader program the Garage boot already compiles:
 * - DISPLAY-LIT: MeshStandardMaterial with map + emissiveMap (the wall signs' key), lit by the scene and given its own
 *   emission from the half-resolution emissive atlas, where screens and lamp lenses glow and prints barely do;
 * - DECAL: MeshBasicMaterial with map, transparent, no depth write, polygon offset (the contact-shadow and bay-grime
 *   key), for stencils, grime, oil and light pools.
 *
 * The atlas loads lazily, once, when a display first renders (after the Garage presents), and is shared by every Garage.
 * Until it arrives the displays show neutral dark panels and the decals nothing.
 */

type AtlasStatus = 'idle' | 'loading' | 'ready' | 'failed';

const manifest = GARAGE_DISPLAY_ATLAS_MANIFEST;
const rects = manifest.rects as Readonly<Record<string, KitAtlasRect & { readonly px: readonly number[]; readonly kind: string }>>;

/** A named rect of the atlas. `media.<map>` and `map.<map>` resolve a Garage without a still to its sister map's. */
export function garageDisplayRect(name: string): KitAtlasRect {
  const direct = rects[name];
  if (direct) return direct;
  const [group, key] = name.split('.');
  const alias = (manifest.aliases as Readonly<Record<string, string>>)[key ?? ''];
  if (alias && rects[`${group}.${alias}`]) return rects[`${group}.${alias}`];
  throw new Error(`garage display atlas has no rect '${name}'`);
}

/**
 * The atlas picture for a hall sign's legend (garage r9 K3: "less text, more pictograms, no sentences"): bay labels
 * become their numerals, hazards their ISO-7010-style pictograms, a bay's service label the vehicle's readout.
 */
export function garageDisplaySignRect(legend: string): string {
  const text = legend.toUpperCase();
  const bay = /^BAY\s*0?(\d)/.exec(text);
  if (bay) return `num.0${bay[1]}`;
  if (/NO SMOKING/.test(text)) return 'picto.nosmoking';
  if (/FLAMMABLE|FIRE/.test(text)) return 'picto.flammable';
  if (/KEEP CLEAR/.test(text)) return 'picto.overhead';
  if (/T-90/.test(text)) return 'readout.modules.t90';
  if (/K2/.test(text)) return 'readout.armor.k2';
  if (/WEAPON/.test(text)) return 'picto.gloves';
  return 'picto.head';
}

/**
 * Whether a rect is paint with alpha (numerals, stencils, decals): its texels outside the paint carry no colour of their
 * own (the encoder smears the paint into them), so it is drawn with the DECAL material over a plate, never on an opaque
 * DISPLAY-LIT face (where a bay numeral read as a white blob).
 */
export function garageDisplayRectHasAlpha(name: string): boolean {
  const kind = (rects[name] as { readonly kind?: string } | undefined)?.kind;
  return kind === 'numeral' || kind === 'stencil' || kind === 'decal';
}

/** Every rect name of one group ('media', 'readout', 'picto', 'name', ...). */
export function garageDisplayRectNames(group: string): readonly string[] {
  return Object.keys(rects).filter((name) => name.startsWith(`${group}.`)).sort();
}

/**
 * The stills' rect group. Rect names are not translation keys: the name is joined from this constant, never spelled as a
 * template or a 'media.' prefix literal, which the page-catalog scan (tools/i18n-page-catalogs.mjs) reads as every
 * `media.*` translation key and so would pull the site's captions into the game's boot catalogs.
 */
const STILL_GROUP = 'media';
const stillRect = (mapId: string): string => [STILL_GROUP, mapId].join('.');

/** The Garage's own still (its map's, or its sister map's). */
export function garageMediaRectName(mapId: string): string {
  if (rects[stillRect(mapId)]) return stillRect(mapId);
  const alias = (manifest.aliases as Readonly<Record<string, string>>)[mapId];
  return alias && rects[stillRect(alias)] ? stillRect(alias) : stillRect('verdant');
}

let status: AtlasStatus = 'idle';
let albedo: THREE.Texture | null = null;
let emissive: THREE.Texture | null = null;
const displayMaterials = new Set<THREE.MeshStandardMaterial>();
const decalMaterials = new Set<THREE.MeshBasicMaterial>();
const readyListeners = new Set<() => void>();

const placeholder = (rgba: readonly [number, number, number, number]): THREE.DataTexture => {
  const texture = new THREE.DataTexture(new Uint8Array(rgba), 1, 1, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};
let placeholderAlbedo: THREE.DataTexture | null = null;
let placeholderEmissive: THREE.DataTexture | null = null;
let placeholderClear: THREE.DataTexture | null = null;

function placeholders(): { albedo: THREE.Texture; emissive: THREE.Texture; clear: THREE.Texture } {
  placeholderAlbedo ||= placeholder([30, 34, 37, 255]);
  placeholderEmissive ||= placeholder([0, 0, 0, 255]);
  placeholderClear ||= placeholder([0, 0, 0, 0]);
  return { albedo: placeholderAlbedo, emissive: placeholderEmissive, clear: placeholderClear };
}

function applyAtlas(): void {
  if (!albedo || !emissive) return;
  for (const material of displayMaterials) { material.map = albedo; material.emissiveMap = emissive; }
  for (const material of decalMaterials) material.map = albedo;
}

/** Run once the atlas is ready (immediately when it already is). */
export function onGarageDisplayAtlasReady(listener: () => void): () => void {
  if (status === 'ready') { listener(); return () => {}; }
  readyListeners.add(listener);
  return () => readyListeners.delete(listener);
}

function loadTexture(url: string, options: { width: number; height: number }): Promise<THREE.Texture> {
  const finish = (texture: THREE.Texture): THREE.Texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
  };
  if (typeof createImageBitmap === 'function' && typeof fetch === 'function') {
    return fetch(url)
      .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(`display atlas ${response.status}`))))
      .then((blob) => createImageBitmap(blob, {
        resizeWidth: options.width, resizeHeight: options.height, resizeQuality: 'high',
        imageOrientation: 'flipY', premultiplyAlpha: 'none',
      }))
      .then((bitmap) => {
        const texture = new THREE.Texture(bitmap as unknown as HTMLImageElement);
        texture.flipY = false; // flipped at decode
        return finish(texture);
      });
  }
  return new THREE.TextureLoader().loadAsync(url).then(finish);
}

/**
 * Start the one atlas load (idempotent). Called from a display's first render, never on the boot or switch path; a
 * headless build (no document) never loads it. `lowTier` decodes it at half size (2.8 MB instead of 11.2 MB); it
 * defaults to the device tier, so a phone never holds the full-size atlas.
 */
export function ensureGarageDisplayAtlas({ anisotropy = 4, lowTier = getDeviceTier() === 'mobile' }: { anisotropy?: number; lowTier?: boolean } = {}): void {
  if (status !== 'idle' || typeof document === 'undefined') return;
  status = 'loading';
  const scale = lowTier ? 0.5 : 1;
  Promise.all([
    loadTexture(manifest.url, { width: manifest.width * scale, height: manifest.height * scale }),
    loadTexture(manifest.emissiveUrl, { width: manifest.emissiveWidth * scale, height: manifest.emissiveHeight * scale }),
  ]).then(([albedoTexture, emissiveTexture]) => {
    albedoTexture.anisotropy = Math.min(8, anisotropy);
    albedoTexture.name = 'garage-display-atlas';
    emissiveTexture.name = 'garage-display-emissive';
    albedo = albedoTexture;
    emissive = emissiveTexture;
    status = 'ready';
    applyAtlas();
    for (const listener of [...readyListeners]) listener();
    readyListeners.clear();
  }).catch(() => {
    status = 'failed';
  });
}

const retiredAtlasHook = (): void => {};

/**
 * Arm a display or decal mesh: its first render starts the atlas load, then the hook retires itself, so a display costs
 * nothing per frame afterwards (no call, no options object).
 */
export function loadGarageDisplayAtlasOnFirstRender(mesh: THREE.Object3D, anisotropy = 4): void {
  const options = { anisotropy };
  mesh.onBeforeRender = () => {
    mesh.onBeforeRender = retiredAtlasHook;
    ensureGarageDisplayAtlas(options);
  };
}

/** The DISPLAY-LIT material for one pack (joins the shared cascade setup through `setup`). */
export function createGarageDisplayMaterial(
  setup?: ((material: THREE.Material) => void) | null,
): THREE.MeshStandardMaterial {
  const { albedo: albedoPlaceholder, emissive: emissivePlaceholder } = placeholders();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: albedo ?? albedoPlaceholder,
    emissive: 0xffffff,
    emissiveMap: emissive ?? emissivePlaceholder,
    emissiveIntensity: 1,
    roughness: 0.6,
    metalness: 0.1,
  });
  material.name = 'garage:display-lit';
  setup?.(material);
  displayMaterials.add(material);
  material.addEventListener('dispose', () => { displayMaterials.delete(material); });
  return material;
}

/** The DECAL material for one pack: stencils, grime, oil and light pools on the atlas. */
export function createGarageDecalMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    map: albedo ?? placeholders().clear,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  material.name = 'garage:display-decal';
  decalMaterials.add(material);
  material.addEventListener('dispose', () => { decalMaterials.delete(material); });
  return material;
}

/** Test seam: the receipts swap in a fixture atlas and check every material follows it. */
export function garageDisplayAtlasTestHooks(): {
  inject(albedoTexture: THREE.Texture, emissiveTexture: THREE.Texture): void;
  reset(): void;
  materialCount(): number;
} {
  return {
    inject(albedoTexture, emissiveTexture) {
      albedo = albedoTexture; emissive = emissiveTexture; status = 'ready'; applyAtlas();
      for (const listener of [...readyListeners]) listener();
      readyListeners.clear();
    },
    reset() { albedo = null; emissive = null; status = 'idle'; },
    materialCount() { return displayMaterials.size + decalMaterials.size; },
  };
}
