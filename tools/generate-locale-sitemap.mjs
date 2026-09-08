#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_ORIGIN } from '../src/presentation/siteMetadata.ts';
import { hrefForLocale, PUBLIC_ROUTE_RECORDS } from '../src/ui/localeRouting.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = join(ROOT, 'public/sitemap.xml');
const lastModified = '2026-09-08';

const escapeXml = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const records = PUBLIC_ROUTE_RECORDS.filter(({ indexable }) => indexable);
const rows = [];
for (const route of records) {
  const english = `${SITE_ORIGIN}${route.pathname}`;
  const chinese = `${SITE_ORIGIN}${hrefForLocale(route.pathname, 'zh-CN')}`;
  const alternates = [
    `    <xhtml:link rel="alternate" hreflang="en-US" href="${escapeXml(english)}" />`,
    `    <xhtml:link rel="alternate" hreflang="zh-CN" href="${escapeXml(chinese)}" />`,
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(english)}" />`,
  ].join('\n');
  for (const loc of [english, chinese]) {
    rows.push([
      '  <url>',
      `    <loc>${escapeXml(loc)}</loc>`,
      alternates,
      `    <lastmod>${lastModified}</lastmod>`,
      '  </url>',
    ].join('\n'));
  }
}
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
  '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  rows.join('\n'),
  '</urlset>',
  '',
].join('\n');

if (process.argv.includes('--check')) {
  assert.equal(readFileSync(outputPath, 'utf8'), sitemap, 'public/sitemap.xml is stale; run npm run i18n:sitemap');
  console.log(`locale sitemap verified (${rows.length} URLs)`);
} else {
  writeFileSync(outputPath, sitemap);
  console.log(`locale sitemap generated (${rows.length} URLs)`);
}
