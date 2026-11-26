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

/** An item's content-addressed store pathname: its id and the first 16 hex of its SHA-256 (`media/<id>-<sha16>.<ext>`),
 *  so a re-upload of the same bytes is a no-op and changed bytes get a URL no cache holds. */
export const pathnameFor = (id: string, sha256: string, file: string): string =>
  `${PATHNAME_PREFIX}/${id}-${sha256.slice(0, 16)}${extensionOf(file)}`;
