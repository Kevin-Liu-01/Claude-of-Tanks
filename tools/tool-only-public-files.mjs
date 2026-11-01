// tool-only-public-files.mjs — files under public/ that only repository tools read (FE-P15).
//
// The anatomy procedure and the asset tools write these beside the icons they describe, so the
// sources stay in public/icons/. No page, worker or function requests them
// (tools/tool-only-public-files.selftest.mjs proves it), so the build drops them from dist/
// (tools/strip-nc-assets.mjs) instead of publishing the 27 MB tank asset manifest and 7.3 MB of
// marking sheets on every deploy.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** dist-relative directory -> file-name rule of the tool-only files it holds (`tree`: everything under it). */
const TOOL_ONLY_PUBLIC_FILES = Object.freeze([
  Object.freeze({ dir: 'icons/tank-assets', tree: true, why: 'tank asset manifest, a row file per tank (tools/tank-assets-store.mjs)' }),
  Object.freeze({ dir: 'icons', test: (name) => /_markings\.png$/.test(name), why: 'marking sheets (tools/genIcons.mjs --views markings)' }),
]);

/** The dist-relative files under a directory, recursively. */
function treeFiles(distDir, dir) {
  let entries;
  try { entries = readdirSync(join(distDir, dir), { withFileTypes: true }); } catch { return []; }
  return entries.flatMap((entry) => (entry.isDirectory() ? treeFiles(distDir, `${dir}/${entry.name}`)
    : [`${dir}/${entry.name}`]));
}

/** The tool-only files present in a build output, as dist-relative paths with their sizes. */
export function toolOnlyPublicFiles(distDir) {
  const found = [];
  for (const { dir, test, tree } of TOOL_ONLY_PUBLIC_FILES) {
    let paths;
    if (tree) paths = treeFiles(distDir, dir);
    else {
      try { paths = readdirSync(join(distDir, dir)).filter(test).map((name) => `${dir}/${name}`); } catch { continue; }
    }
    for (const path of paths) {
      if (!found.some((entry) => entry.path === path)) found.push({ path, bytes: statSync(join(distDir, path)).size });
    }
  }
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

/** The tool-only directories present in a build output (dist-relative): the build removes them whole. */
export const toolOnlyPublicDirs = (distDir) => TOOL_ONLY_PUBLIC_FILES.filter(({ dir, tree }) => {
  try { return tree && statSync(join(distDir, dir)).isDirectory(); } catch { return false; }
}).map(({ dir }) => dir);
