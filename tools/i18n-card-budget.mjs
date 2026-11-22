#!/usr/bin/env node
// tools/i18n-card-budget.mjs — a tutorial act card's copy fits two lines in every locale (274). First-party tooling:
// Kevin B. Liu.
//
// An act card (a step the player completes by doing, step.advance.on !== 'next') stays open over the battle, and its copy
// runs at most two lines (tools/tutorial-cards.browser.mjs fails a third). The 274 top-up translated them with no length
// in view, and es, ja, de and pt ran three and four lines. So each act card's body carries its budget into the
// translation context (src/ui/i18nCatalog.en-US.metadata.json, which the gt CLI reads beside the catalog), and the
// catalogs are checked against it. The budgets are characters, measured on the cards (tutorial-cards fit walks, 274):
// a Latin-script body fits two phone lines to about 87 characters and runs three from 95; Cyrillic sets wider (a 79-character
// Russian body ran three on the phone); Japanese
// fits to 43 and runs three from 45; Chinese passed every card at 51.
//
//   node tools/i18n-card-budget.mjs           check: every act card body has its context, and every translation fits
//   node tools/i18n-card-budget.mjs --write   write the act card bodies' context into the metadata file
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const METADATA = resolve(ROOT, 'src/ui/i18nCatalog.en-US.metadata.json');
/** The most characters an act card's body may run in each translated locale. */
export const CARD_BUDGET = Object.freeze({ 'zh-CN': 52, es: 85, ja: 40, de: 85, 'pt-BR': 85, ru: 72 });
const INPUTS = ['keyboard', 'touch', 'pad'];

/** Every act card's body key, over every chapter (the offer included) and input, in step order. */
export async function actCardBodyKeys() {
  const { chapterSteps } = await import('../src/ui/tutorial/tutorialSteps.ts');
  const { TUTORIAL_CHAPTERS } = await import('../src/ui/tutorial/tutorialRecord.ts');
  const keys = new Set();
  for (const chapter of [...TUTORIAL_CHAPTERS, 'offer']) {
    for (const input of INPUTS) {
      for (const step of chapterSteps(chapter, input)) if (step.advance.on !== 'next' && step.body) keys.add(step.body);
    }
  }
  return [...keys];
}

/** The translation context an act card's body carries (the gt CLI reads it per key). */
export function cardBudgetContext() {
  const { es, ru, ja, 'zh-CN': zh } = CARD_BUDGET;
  return 'A tutorial instruction card in Claude of Tanks, a browser tank game, shown while the battle goes on under it. '
    + 'It must fit in two short lines on a phone: write it as briefly as possible, cutting words rather than meaning. '
    + `Hard limit: at most ${es} characters (Russian: ${ru}; Japanese: ${ja}; Chinese: ${zh}). Letters such as C, D, F, G, `
    + 'Q, U and V are ring or bush markers on the ground; Sentry and Bulwark name practice targets. Keep every '
    + '{placeholder} exactly as written. Never use an em dash.';
}

/** What breaks the budget: an act card body without its context, or a translation past its locale's budget. */
export function cardBudgetFailures(keys, metadata, catalogs) {
  const failures = [];
  const context = cardBudgetContext();
  for (const key of keys) {
    if (metadata[key]?.context !== context) failures.push(`${key}: the metadata lacks the card budget (node tools/i18n-card-budget.mjs --write)`);
    for (const [locale, budget] of Object.entries(CARD_BUDGET)) {
      const text = catalogs[locale]?.[key];
      if (typeof text === 'string' && text.length > budget) failures.push(`${locale} ${key}: ${text.length} characters, over ${budget}`);
    }
  }
  return failures;
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

export async function repositoryCardBudgetFailures() {
  const keys = await actCardBodyKeys();
  const catalogs = Object.fromEntries(Object.keys(CARD_BUDGET)
    .map((locale) => [locale, readJson(resolve(ROOT, `src/ui/i18nCatalog.${locale}.json`))]));
  return cardBudgetFailures(keys, readJson(METADATA), catalogs);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--write')) {
    const metadata = readJson(METADATA);
    const keys = await actCardBodyKeys();
    for (const key of keys) metadata[key] = { context: cardBudgetContext() };
    writeFileSync(METADATA, `${JSON.stringify(metadata, null, 2)}\n`);
    console.log(`i18n-card-budget: ${keys.length} act card bodies carry their budget`);
  } else {
    const failures = await repositoryCardBudgetFailures();
    if (failures.length) console.error(`i18n-card-budget: ${failures.length} failure(s)\n  ${failures.join('\n  ')}`);
    else console.log('i18n-card-budget: every act card body carries its budget, and every translation fits it');
    if (failures.length) process.exit(1);
  }
}
