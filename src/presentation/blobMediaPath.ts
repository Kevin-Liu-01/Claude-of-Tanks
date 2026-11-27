/**
 * blobMediaPath.ts — how a Blob media item is named in the store (media-blob-279). A leaf with no data: the manifest
 * reader (blobMedia.ts), its writer (tools/blob-media.mjs) and the pages' run-time family maps (blobMediaFamily.ts) all
 * name an item the same way, and a page that imports this does not pull the manifest into its chunk.
 * Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */

/** The store pathnames' prefix. */
export const PATHNAME_PREFIX = 'media';

/** A path item's id: its path under /media/, lowercased, with every separator a hyphen (site50-r14/loops/a.webm →
 *  site50-r14-loops-a-webm). The extension stays in it, so a film's .webm and .mp4 twins are two items. */
export const idForPath = (path: string): string => path.replace(/^\/media\//, '').toLowerCase().replace(/[/._]/g, '-');

const extensionOf = (file: string): string => {
  const dot = file.lastIndexOf('.');
  return dot > file.lastIndexOf('/') ? file.slice(dot).toLowerCase() : '';
};

/** An id item's content-addressed store pathname: its id and the first 16 hex of its SHA-256 (`media/<id>-<sha16>.<ext>`),
 *  so a re-upload of the same bytes is a no-op and changed bytes get a URL no cache holds. */
export const pathnameFor = (id: string, sha256: string, file: string): string =>
  `${PATHNAME_PREFIX}/${id}-${sha256.slice(0, 16)}${extensionOf(file)}`;

/** A path item's store pathname: its old path with the first 16 hex of its SHA-256 before the extension
 *  (the loop site50-r14/loops/a.webm is stored as site50-r14/loops/a-<sha16>.webm under the prefix), so its URL still reads
 *  as its path. */
export const pathnameForPath = (path: string, sha256: string): string => {
  const ext = extensionOf(path);
  return `${path.slice(1, path.length - ext.length)}-${sha256.slice(0, 16)}${ext}`;
};

/** The old /media/ path a page's media URL stands for: a path item's Blob URL (pathnameForPath) gives its path back, and
 *  anything else is returned as is. Code that reads a path's shape (a take id in it, a rung beside it) reads this. */
export function sitePathOf(url: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/[^/]+(\/media\/.+)-[0-9a-f]{16}(\.[a-z0-9]+)$/i.exec(url);
  return match ? `${match[1]}${match[2]}` : url;
}
