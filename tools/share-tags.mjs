#!/usr/bin/env node
// share-tags.mjs: every public page's share tags (og:* and twitter:*) as a finished build serves them. The English pages
// and their /cn twins come from dist/; /studio, /cn/studio, an unknown /cn path and a room invite come from middleware.ts
// over the built shells, as production answers them. Prints one markdown table (page, tag, content) or, with --json,
// one object keyed by page. Diff two builds' outputs to review a metadata change.
//
//   node tools/share-tags.mjs [--dist=<dir>] [--json] [--out=<file>]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hrefForLocale, PUBLIC_ROUTE_RECORDS } from '../src/ui/localeRouting.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://cot.kevinliu.studio';
const option = (name) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const dist = resolve(ROOT, option('dist') || 'dist');

// middleware.ts fetches its shells (/index.html, /404.html) from the deployment: here, from the build.
globalThis.fetch = async (url) => new Response(readFileSync(join(dist, new URL(String(url)).pathname), 'utf8'),
  { headers: { 'content-type': 'text/html' } });
const { default: middleware } = await import('../middleware.ts');
const served = async (path) =>
  (await middleware(new Request(`${SITE}${path}`, { headers: { accept: 'text/html' } }))).text();

const pages = [];
for (const route of PUBLIC_ROUTE_RECORDS) {
  for (const locale of ['en-US', 'zh-CN']) {
    const path = hrefForLocale(route.pathname, locale);
    pages.push([path, route.id === 'studio'
      ? await served(path)
      : readFileSync(join(dist, locale === 'en-US' ? route.sourceHtml : `cn/${route.localizedHtml}`), 'utf8')]);
  }
}
for (const path of ['/cn/no-such-page', '/?room=HKP5XW&mode=lan&host=Commander+09HY']) pages.push([path, await served(path)]);

const decode = (value) => value.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const tags = Object.fromEntries(pages.map(([path, html]) => [path, [...html.matchAll(/<meta\b[^>]*>/gi)].flatMap(([tag]) => {
  const key = /\b(?:property|name)\s*=\s*["']((?:og|twitter):[^"']+)["']/i.exec(tag)?.[1];
  return key ? [[key, decode(/\bcontent\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2] ?? '')]] : [];
})]));

const cell = (value) => value.replace(/\|/g, '\\|');
const text = process.argv.includes('--json')
  ? `${JSON.stringify(tags, null, 1)}\n`
  : `${['| page | tag | content |', '|---|---|---|',
    ...Object.entries(tags).flatMap(([path, rows]) => rows.map(([key, value]) => `| ${cell(path)} | ${key} | ${cell(value)} |`)),
  ].join('\n')}\n`;
const out = option('out');
if (out) writeFileSync(resolve(out), text);
else process.stdout.write(text);
