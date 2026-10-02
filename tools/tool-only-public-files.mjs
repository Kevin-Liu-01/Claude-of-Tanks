// tool-only-public-files.mjs — files under public/ that only repository tools read (FE-P15).
//
// The anatomy procedure and the asset tools write these beside the icons they describe, so the
// sources stay in public/icons/. No page, worker or function requests them
// (tools/tool-only-public-files.selftest.mjs proves it), so the build drops them from dist/
// (tools/strip-nc-assets.mjs) instead of publishing 33.5 MB of manifest and 7.3 MB of
// marking sheets on every deploy.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** dist-relative directory -> file-name rule of the tool-only files it holds. */
export const TOOL_ONLY_PUBLIC_FILES = Object.freeze([
  Object.freeze({ dir: 'icons', test: (name) => name === 'tank-assets.json', why: 'tank asset manifest (tools/genIcons.mjs)' }),
  Object.freeze({ dir: 'icons', test: (name) => /_markings\.png$/.test(name), why: 'marking sheets (tools/genIcons.mjs --views markings)' }),
]);

/** The tool-only files present in a build output, as dist-relative paths with their sizes. */
export function toolOnlyPublicFiles(distDir) {
  const found = [];
  for (const { dir, test } of TOOL_ONLY_PUBLIC_FILES) {
    let names;
    try { names = readdirSync(join(distDir, dir)); } catch { continue; }
    for (const name of names) {
      if (!test(name)) continue;
      const path = `${dir}/${name}`;
      if (!found.some((entry) => entry.path === path)) found.push({ path, bytes: statSync(join(distDir, path)).size });
    }
  }
  return found.sort((a, b) => a.path.localeCompare(b.path));
}
