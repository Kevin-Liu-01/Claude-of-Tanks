// Build-only: content-hashed copies of the runtime audio (2026-10-02).
//
// The game fetches its combat samples and radio lines by name from /audio (111 files per battle session). Those
// URLs never change across deploys, so they are served for an hour and then revalidated
// (tools/vercel-output-immutable.mjs) — part of the 28 % of production requests that were revalidations. This
// plugin emits a copy of each file under /assets with an eight-character content hash in its name
// (`assets/audio/sfx/era_pop-<hash>.ogg`), so it takes the year-long immutable route of every hashed asset and the
// release carry-forward keeps it for old tabs, and defines `__COT_RUNTIME_FILES__`, the map `src/runtimeFiles.ts`
// resolves the two fetch sites through. The unhashed originals stay deployed. Fonts are not versioned: pages,
// three stylesheets, a runtime-injected stylesheet, a public stylesheet and the material painter all name them, and
// a partial rewrite would download the same face twice. Textures, maps, sky, cloud and terrain data and the
// vehicle icons belong to other owners.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';

/** Public directories whose files the game fetches by name, and the extensions that count. */
export const RUNTIME_FILE_DIRS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  audio: Object.freeze(['.ogg', '.opus', '.mp3', '.wav', '.m4a']),
});

interface RuntimeFileEntry { path: string; hashed: string; file: string }

/** `assets/<path without extension>-<8 base36 characters of its SHA-256><extension>`. */
export function hashedRuntimePath(path: string, bytes: Uint8Array): string {
  const extension = extname(path);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const hash = BigInt(`0x${digest.slice(0, 13)}`).toString(36).padStart(8, '0').slice(-8);
  return `assets/${path.slice(0, path.length - extension.length)}-${hash}${extension}`;
}

/** Every runtime file under `publicDir`, sorted by public path. */
export function runtimeFileEntries(publicDir: string | null, dirs: Readonly<Record<string, readonly string[]>> = RUNTIME_FILE_DIRS): RuntimeFileEntry[] {
  if (!publicDir) return [];
  const entries: RuntimeFileEntry[] = [];
  for (const [dir, extensions] of Object.entries(dirs)) {
    const visit = (folder: string): void => {
      if (!existsSync(folder)) return;
      for (const name of readdirSync(folder).sort()) {
        const file = join(folder, name);
        if (statSync(file).isDirectory()) { visit(file); continue; }
        if (!extensions.includes(extname(name).toLowerCase())) continue;
        const path = relative(publicDir, file).split('\\').join('/');
        entries.push({ path, hashed: hashedRuntimePath(path, readFileSync(file)), file });
      }
    };
    visit(join(publicDir, dir));
  }
  return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** The map the build defines for `src/runtimeFiles.ts`: public path → hashed path. */
export function runtimeFileManifest(entries: readonly RuntimeFileEntry[]): Record<string, string> {
  return Object.fromEntries(entries.map((entry) => [entry.path, entry.hashed]));
}

export function runtimeFileVersions(dirs: Readonly<Record<string, readonly string[]>> = RUNTIME_FILE_DIRS): Plugin {
  let entries: RuntimeFileEntry[] = [];
  return {
    name: 'cot-runtime-file-versions',
    apply: 'build',
    config(config) {
      const root = resolve(config.root ?? process.cwd());
      const publicDir = config.publicDir === false ? null : resolve(root, typeof config.publicDir === 'string' ? config.publicDir : 'public');
      entries = runtimeFileEntries(publicDir, dirs);
      return { define: { __COT_RUNTIME_FILES__: JSON.stringify(runtimeFileManifest(entries)) } };
    },
    generateBundle() {
      for (const entry of entries) this.emitFile({ type: 'asset', fileName: entry.hashed, source: readFileSync(entry.file) });
    },
  };
}
