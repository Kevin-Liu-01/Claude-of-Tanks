// blobMediaRewrite.ts — finds the site's /media/ paths in a page, a script, a style or a JSON file and rewrites the ones
// that moved to Vercel Blob to their URLs (media-blob-279). The build's dist pass (tools/blob-media.mjs rewrite) and the
// Vite plugin (tools/viteBlobMedia.ts) share it, so both read a path the same way. Copyright © 2026 Kevin B. Liu.

/** A Blob path item as the rewrite reads it (src/presentation/blobMedia.json). */
export interface MediaPathItem {
  readonly id: string;
  readonly path: string;
  readonly url: string | null;
  readonly sha256: string;
  readonly pathname: string;
}
export type MediaPathIndex = ReadonlyMap<string, MediaPathItem>;

interface ManifestLike {
  readonly items: Readonly<Record<string, { readonly path?: string; readonly url: string | null; readonly sha256: string; readonly pathname: string }>>;
}

/** Every path item by its site path. */
export function pathIndex(manifest: ManifestLike): Map<string, MediaPathItem> {
  const index = new Map<string, MediaPathItem>();
  for (const [id, item] of Object.entries(manifest.items)) {
    if (item.path) index.set(item.path, { id, path: item.path, url: item.url, sha256: item.sha256, pathname: item.pathname });
  }
  return index;
}

/** The site's own origins: an absolute link to a moved file on one of them is rewritten too (og:video, the sitemap). */
const OWN_ORIGIN = /https?:\/\/(?:cot\.kevinliu\.studio|claudeoftanks\.kevinliu\.studio|claude-of-tanks\.vercel\.app)$/;
const PATH_CHAR = /[A-Za-z0-9_.~%/-]/;
const HAS_EXTENSION = /\.[A-Za-z0-9]{2,5}$/;

export interface FoundMediaPath {
  readonly start: number;
  readonly end: number;
  /** The site path (`/media/…`). */
  readonly path: string;
  /** True when it names a file (it has an extension), false for a folder a page builds a path from. */
  readonly full: boolean;
}

/**
 * Every /media/ path in `text`: `/media/x`, a bare `media/x` (the runtime manifests' form) and an absolute link on the
 * site's own origin. A path inside another path, or on another origin (a Blob URL among them), is not one.
 */
export function mediaPaths(text: string): FoundMediaPath[] {
  const found: FoundMediaPath[] = [];
  for (let at = text.indexOf('media/'); at !== -1; at = text.indexOf('media/', at + 6)) {
    const before = text[at - 1];
    let start: number;
    if (before === '/') {
      const ahead = text[at - 2];
      if (ahead === undefined || (!PATH_CHAR.test(ahead) && ahead !== ':')) start = at - 1;
      else {
        const origin = /https?:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.exec(text.slice(Math.max(0, at - 81), at - 1))?.[0];
        if (!origin || !OWN_ORIGIN.test(origin)) continue;
        start = at - 1 - origin.length;
      }
    } else if (before === undefined || !PATH_CHAR.test(before)) start = at;
    else continue;
    let end = at + 6;
    while (end < text.length && PATH_CHAR.test(text[end])) end++;
    while (end > at + 6 && text[end - 1] === '.') end--;
    const rest = text.slice(at + 6, end);
    found.push({ start, end, path: `/media/${rest}`, full: HAS_EXTENSION.test(rest) });
  }
  return found;
}

/** `text` with every uploaded path item's path replaced by its URL; `hits` counts each path's rewrites. */
export function rewriteText(text: string, index: MediaPathIndex, hits: Map<string, number> = new Map()): string {
  let out = '';
  let last = 0;
  for (const found of mediaPaths(text)) {
    const item = found.full ? index.get(found.path) : undefined;
    if (!item?.url) continue;
    out += text.slice(last, found.start) + item.url;
    last = found.end;
    hits.set(found.path, (hits.get(found.path) ?? 0) + 1);
  }
  return last ? out + text.slice(last) : text;
}
