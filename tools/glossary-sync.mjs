#!/usr/bin/env node
// tools/glossary-sync.mjs — the glossary (src/ui/glossary.json, SPEC 11.2) is the one source of the names it holds.
//
//   node tools/glossary-sync.mjs           write every bound catalog key from its glossary term
//   node tools/glossary-sync.mjs --check   fail when a catalog drifts from the glossary or prints a retired name
//
// Bindings (glossary.json $description): `keys` take the term in both locales, `upper` take it in capitals in en-US,
// `zh` bind only the zh-CN text; a term's `short` form has its own lists. Every bound key must exist in both catalogs
// (a binding never creates a key, so a typo fails instead of adding dead copy). Writing keeps each catalog's key order
// and its two-space JSON layout. Pure Node: no network, no dependencies.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GLOSSARY_PATH = resolve(ROOT, 'src/ui/glossary.json');
const CATALOG_PATHS = {
  'en-US': resolve(ROOT, 'src/ui/i18nCatalog.en-US.json'),
  'zh-CN': resolve(ROOT, 'src/ui/i18nCatalog.zh-CN.json'),
};
const LOCALES = /** @type {const} */ (['en-US', 'zh-CN']);

/**
 * Every (key, locale) -> expected value the glossary pins, plus the term each came from.
 * @param {any} glossary
 * @returns {{ pins: Array<{ key: string, locale: string, value: string, term: string }>, errors: string[] }}
 */
export function glossaryPins(glossary) {
  const pins = [];
  const errors = [];
  const seen = new Map();
  const pin = (key, locale, value, term) => {
    const id = `${locale}\u0000${key}`;
    const prior = seen.get(id);
    if (prior && prior.value !== value) errors.push(`${key} (${locale}) is bound to "${prior.value}" (${prior.term}) and "${value}" (${term})`);
    if (!prior) {
      seen.set(id, { value, term });
      pins.push({ key, locale, value, term });
    }
  };
  const bind = (form, term) => {
    for (const locale of LOCALES) {
      if (typeof form[locale] !== 'string' || !form[locale]) errors.push(`${term}: missing ${locale} text`);
    }
    for (const key of form.keys ?? []) for (const locale of LOCALES) pin(key, locale, form[locale], term);
    for (const key of form.upper ?? []) {
      pin(key, 'en-US', form['en-US'].toUpperCase(), term);
      pin(key, 'zh-CN', form['zh-CN'], term);
    }
    for (const key of form.zh ?? []) pin(key, 'zh-CN', form['zh-CN'], term);
  };
  for (const [group, terms] of Object.entries(glossary.groups ?? {})) {
    for (const [id, term] of Object.entries(terms)) {
      bind(term, `${group}.${id}`);
      if (term.short) bind(term.short, `${group}.${id}.short`);
    }
  }
  return { pins, errors };
}

/**
 * Drift between catalogs and the glossary: missing keys, wrong values, retired names.
 * @param {any} glossary
 * @param {Record<string, Record<string, string>>} catalogs
 */
export function glossaryDrift(glossary, catalogs) {
  const { pins, errors } = glossaryPins(glossary);
  const drift = [...errors];
  for (const { key, locale, value, term } of pins) {
    if (!Object.hasOwn(catalogs[locale], key)) drift.push(`${key} (${locale}) is bound to ${term} but the catalog has no such key`);
    else if (catalogs[locale][key] !== value) drift.push(`${key} (${locale}) reads "${catalogs[locale][key]}", ${term} says "${value}"`);
  }
  for (const locale of LOCALES) {
    for (const retired of glossary.retired?.[locale] ?? []) {
      const needle = retired.toLowerCase();
      for (const [key, value] of Object.entries(catalogs[locale])) {
        if (value.toLowerCase().includes(needle)) drift.push(`${key} (${locale}) prints the retired name "${retired}"`);
      }
    }
  }
  return drift;
}

/** Apply every pin; returns the number of values changed. */
export function applyGlossary(glossary, catalogs) {
  const { pins, errors } = glossaryPins(glossary);
  if (errors.length) throw new Error(`glossary: ${errors.join('; ')}`);
  let changed = 0;
  for (const { key, locale, value } of pins) {
    if (!Object.hasOwn(catalogs[locale], key)) throw new Error(`glossary: ${key} is not in the ${locale} catalog`);
    if (catalogs[locale][key] !== value) {
      catalogs[locale][key] = value;
      changed++;
    }
  }
  return changed;
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

if (import.meta.url === `file://${process.argv[1]}`) {
  const glossary = readJson(GLOSSARY_PATH);
  const catalogs = Object.fromEntries(LOCALES.map((locale) => [locale, readJson(CATALOG_PATHS[locale])]));
  if (process.argv.includes('--check')) {
    const drift = glossaryDrift(glossary, catalogs);
    if (drift.length) {
      console.error(`glossary-sync: ${drift.length} drift(s)\n  ${drift.join('\n  ')}\nRun node tools/glossary-sync.mjs to write the glossary into the catalogs.`);
      process.exit(1);
    }
    console.log(`glossary-sync: catalogs agree with ${glossaryPins(glossary).pins.length} glossary bindings`);
  } else {
    const changed = applyGlossary(glossary, catalogs);
    for (const locale of LOCALES) writeFileSync(CATALOG_PATHS[locale], `${JSON.stringify(catalogs[locale], null, 2)}\n`);
    const drift = glossaryDrift(glossary, catalogs);
    console.log(`glossary-sync: ${changed} value(s) written${drift.length ? `; still drifting:\n  ${drift.join('\n  ')}` : ''}`);
    if (drift.length) process.exit(1);
  }
}
