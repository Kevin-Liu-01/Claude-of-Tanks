#!/usr/bin/env node
// hero-lqip.mjs — the inline previews (LQIP) under the public pages' first pictures: the landing's hero still, every
// Field Manual banner (the index's and each chapter's poster) and the index's chapter cards. Each is a WebP data URI of
// at most 1 KB (32 px wide) on its picture's box; the picture fades in over it once decoded, so a slow link shows a
// preview at once and never paints the picture in bands (the slow-load critics, 2026-10-28: on a phone the landing's
// 2560 hero came in in three hard-edged bands over 2 s; a chapter's 460 KB poster landed last, 6.8 s in, over a black
// band; the index's first card stood empty 4 s). Copyright © 2026 Kevin B. Liu.
//
// src/docs/heroLqip.json keeps each preview with its source file's sha256. The pages read it through heroLqip() below:
// tools/docs-prerender.mjs hands the chapters' previews to topics.ts (so they ride in the served markup, never in a
// bundle) and writes the index's; tools/home-premiere.mjs writes the hero's. A source that changed, or a picture with no preview, throws
// there, so topics.selftest (the prerender's check) and landing-media.selftest (home-premiere's) fail until
//   node tools/hero-lqip.mjs --write     re-encodes them (cwebp; only this step needs it)
//   node tools/hero-lqip.mjs             checks the table against the sources and the pages' pictures
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TABLE = join(ROOT, 'src/docs/heroLqip.json');
const WIDTH = 32;
const MAX_BYTES = 1024; // responsivePicture.ts LQIP_MAX_BYTES: the data URI's payload

const sha = (path) => createHash('sha256').update(readFileSync(join(ROOT, 'public', path))).digest('hex');

/** The preview (a data URI) for a public picture path, checked against its source; throws when missing or stale. */
export function heroLqip(path, table = JSON.parse(readFileSync(TABLE, 'utf8'))) {
  const entry = table[path];
  if (!entry) throw new Error(`hero-lqip: ${path} has no preview: run node tools/hero-lqip.mjs --write`);
  if (entry.sha256 !== sha(path)) throw new Error(`hero-lqip: ${path} changed since its preview: run node tools/hero-lqip.mjs --write`);
  return entry.lqip;
}

/** The pictures that carry a preview: the landing's hero still, the manual index's banner and chapter cards (as
 *  site/home.html and site/docs.html serve them) and every chapter banner's poster (topics.ts topicHeroLadder, or a
 *  still-headed chapter's). */
async function pictures() {
  const home = /<img class="hero__still" src="([^"]+)"/.exec(readFileSync(join(ROOT, 'site/home.html'), 'utf8'))?.[1];
  if (!home) throw new Error('hero-lqip: site/home.html has no hero still');
  const docs = readFileSync(join(ROOT, 'site/docs.html'), 'utf8');
  const index = /<header class="docs-hero docs-hero--visual"(?: style="[^"]*")?>\s*<img src="([^"]+)"/.exec(docs)?.[1];
  if (!index) throw new Error('hero-lqip: site/docs.html has no banner');
  const cards = [...docs.matchAll(/<span class="docs-chapter-media" data-reveal(?: style="[^"]*")?><img src="([^"]+)"/g)].map(([, src]) => src);
  await import('../src/ui/i18nCatalog.ts');
  const { topics, topicHeroLadder } = await import('../src/docs/topics.ts');
  const banners = Object.values(topics).map(({ hero }) => topicHeroLadder(hero)?.poster ?? hero);
  return [...new Set([home, index, ...cards, ...banners])].sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes('--write');
  const wanted = await pictures();
  const table = JSON.parse(readFileSync(TABLE, 'utf8'));
  if (write) {
    const scratch = mkdtempSync(join(tmpdir(), 'hero-lqip-'));
    const next = {};
    for (const path of wanted) {
      const out = join(scratch, 'lqip.webp');
      execFileSync('cwebp', ['-quiet', '-resize', String(WIDTH), '0', '-q', '75', '-m', '6', '-metadata', 'none', join(ROOT, 'public', path), '-o', out]);
      const bytes = readFileSync(out);
      if (bytes.length > MAX_BYTES) throw new Error(`hero-lqip: ${path}'s preview is ${bytes.length} B (over ${MAX_BYTES})`);
      next[path] = { sha256: sha(path), lqip: `data:image/webp;base64,${bytes.toString('base64')}` };
    }
    writeFileSync(TABLE, `${JSON.stringify(next, null, 1)}\n`);
    console.log(`hero-lqip: ${wanted.length} previews written (${Object.values(next).reduce((sum, { lqip }) => sum + lqip.length, 0)} B of data URIs)`);
  } else {
    const problems = [];
    for (const path of wanted) {
      try { heroLqip(path, table); } catch (error) { problems.push(error.message); }
    }
    for (const path of Object.keys(table)) if (!wanted.includes(path)) problems.push(`hero-lqip: ${path} is no page's picture any more`);
    if (problems.length) {
      console.error(problems.join('\n'));
      process.exit(1);
    }
    console.log(`hero-lqip: ${wanted.length} previews current`);
  }
}
