/**
 * runtimeFiles.ts — the URL of a runtime file the game fetches by name (2026-10-02).
 *
 * The production build copies the audio under `public/audio/` to content-hashed names under `/assets/audio/`
 * (tools/viteRuntimeFiles.ts) and defines `__COT_RUNTIME_FILES__` as the map from the public path to the hashed
 * one, so those files are served immutable and survive deploys like every other hashed asset; the deploy keeps
 * the unhashed originals for anything that names them directly. In development, in Node and for a file the map
 * does not name, the public path itself is used.
 */
declare const __COT_RUNTIME_FILES__: Readonly<Record<string, string>> | undefined;

const BUILD_MANIFEST: Readonly<Record<string, string>> =
  typeof __COT_RUNTIME_FILES__ === 'object' && __COT_RUNTIME_FILES__ !== null ? __COT_RUNTIME_FILES__ : {};

/** `base` + the hashed path of `path` (relative to the public root, e.g. 'audio/sfx/era_pop.ogg'), or of `path` itself. */
export function runtimeFileUrl(path: string, base = '/', manifest: Readonly<Record<string, string>> = BUILD_MANIFEST): string {
  return `${base}${Object.hasOwn(manifest, path) ? manifest[path] : path}`;
}
