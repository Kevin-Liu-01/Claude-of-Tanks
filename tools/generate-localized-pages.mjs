#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localizeHtmlDocument } from '../src/presentation/localizedHtml.ts';
import { localeRecord, PREFIXED_LOCALES, PUBLIC_ROUTE_RECORDS } from '../src/ui/localeRouting.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputFlag = process.argv.find((argument) => argument.startsWith('--dir='));
const outputRoot = resolve(ROOT, outputFlag?.slice('--dir='.length) || 'dist');
const check = process.argv.includes('--check');

// Every locale other than English gets its own tree of documents under its URL prefix (/cn/, /es/, /ja/, ...).
for (const locale of PREFIXED_LOCALES) {
  for (const route of PUBLIC_ROUTE_RECORDS) {
    const sourcePath = join(outputRoot, route.sourceHtml);
    const outputPath = join(outputRoot, localeRecord(locale).prefix, route.localizedHtml);
    const localized = localizeHtmlDocument(readFileSync(sourcePath, 'utf8'), route, locale);
    if (check) {
      assert.equal(readFileSync(outputPath, 'utf8'), localized, `${outputPath} is stale`);
      continue;
    }
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, localized);
  }
}

console.log(`localized pages ${check ? 'verified' : 'generated'} (${PUBLIC_ROUTE_RECORDS.length} routes x ${PREFIXED_LOCALES.length} locales)`);
