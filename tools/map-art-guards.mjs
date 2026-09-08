import { closeSync, existsSync, openSync, readSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAP_IDS } from '../src/world/maps/catalog.ts';

export const MAP_ART_VIEWS = Object.freeze(Object.fromEntries(
  MAP_IDS.map((id) => [id, id === 'verdant' ? 'battlefield' : `battlefield_${id}`]),
));

/** Header-only validation; no decoded 4K image buffers or writes. */
export function requireNative4kPng(path) {
  const header = Buffer.alloc(24);
  const handle = openSync(path, 'r');
  let length;
  try { length = readSync(handle, header, 0, header.length, 0); }
  finally { closeSync(handle); }
  if (length !== 24 || !header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      header.readUInt32BE(8) !== 13 || header.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`invalid PNG source: ${path}`);
  }
  if (header.readUInt32BE(16) !== 3840 || header.readUInt32BE(20) !== 2160) {
    throw new Error(`native 3840x2160 source required (no upscaling): ${path}`);
  }
}

/** Preflight the complete batch before the encoder can overwrite even one asset. */
export function preflightMapArt({ only = null, shotsDir, rootDir = process.cwd() }) {
  if (only && (!only.length || new Set(only).size !== only.length ||
      only.some((id) => !Object.hasOwn(MAP_ART_VIEWS, id)))) {
    throw new Error('unknown or duplicate --only map ID');
  }
  for (const [id, view] of Object.entries(MAP_ART_VIEWS)) {
    if (!only || only.includes(id)) requireNative4kPng(resolve(shotsDir, `${view}.png`));
    else for (const path of [`public/maps/${id}.webp`, `public/maps/thumbs/${id}.webp`]) {
      if (!existsSync(resolve(rootDir, path))) throw new Error(`missing preserved asset: ${path}`);
    }
  }
}

export function requireRequestedViews(available, requested) {
  if (!available.length || (requested && (!requested.length || new Set(requested).size !== requested.length ||
      requested.some((view) => !available.includes(view))))) {
    throw new Error('missing or duplicate requested screenshot view');
  }
  return requested || available;
}

export function requireNativeCapture(state, width, height, dpr, dynScale) {
  // Ordinary UI/mobile captures intentionally allow the renderer's device cap.
  if (width !== 3840 || height !== 2160) return;
  if (state.canvas[0] !== Math.round(width * dpr) || state.canvas[1] !== Math.round(height * dpr)) {
    throw new Error('capture canvas does not match requested pixel dimensions');
  }
  if (dpr !== 1 || dynScale !== 1 || Number(state.renderScale) !== 1 || Number(state.dynScale) !== 1) {
    throw new Error('native 4K capture requires pinned renderScale=1 and dynScale=1');
  }
}

export function requireMinimapCapture(result, mapId) {
  const capture = result?.capture;
  if (result?.mapId !== mapId || capture?.source !== 'scene' ||
      !(capture.width > 0 && capture.height > 0) ||
      !result?.dataUrl?.startsWith('data:image/webp;base64,') || result.dataUrl.length <= 40) {
    throw new Error(`battlefield '${mapId}' did not return a verified textured WebP tactical map`);
  }
}
