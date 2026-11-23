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
// Russian body ran three on the phone); Japanese fits to 43 and runs three from 45; Chinese passed every card at 51.
// Two narrower places carry their own budget: the touch firePen card leaves one body line on the turned phone (a
// 61-character Portuguese body fit, a 69-character German one scrolled), and the Skip and Next buttons share one row
// on the phone card (Einführung überspringen, チュートリアルをスキップ and Пропустить обучение wrapped it to two rows and
// scrolled the drive card; Omitir tutorial and Pular tutorial fit).
// Settings rows carry a budget too where a lane asks (reload-others-275): a row label sits beside its On/Off pair, so its
// budget stays under the longest Interface labels translated so far (es 37, ru 39, ja 14, zh 6 characters), and the note
// under it keeps to a few short lines.
// Battle key lines (275: hud.alert.line.*, hud.hint.<x>.line, the flip and fire lines) draw their {placeholder} key caps
// first and must stay one line on a phone. Their budget counts the words alone, key caps left out, and sits at the longest
// line already shipped in every locale (the turbo hint: es 54, de and ru 55, ja 22, zh 13 characters); no fit walk covers
// the HUD yet, so it is a ceiling from shipped text, not a measurement. A lane's own context for these keys stays: the
// budget sentence is appended to it.
//
//   node tools/i18n-card-budget.mjs           check: every act card body has its context, and every translation fits
//   node tools/i18n-card-budget.mjs --write   write the act card bodies' context into the metadata file
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const METADATA = resolve(ROOT, 'src/ui/i18nCatalog.en-US.metadata.json');
/** The most characters an act card's body may run in each translated locale. */
export const CARD_BUDGET = Object.freeze({ 'zh-CN': 52, es: 85, ja: 40, de: 85, 'pt-BR': 85, ru: 72 });
/** Bodies whose card leaves less room than an act card's two lines. */
const KEY_BUDGET = Object.freeze({
  'tutorial.training.firePen.bodyTouch': Object.freeze({ 'zh-CN': 40, es: 62, ja: 34, de: 62, 'pt-BR': 62, ru: 55 }),
});
/** The card's buttons, which share one row on a phone card. */
const BUTTON_BUDGET = Object.freeze({ 'zh-CN': 6, es: 15, ja: 8, de: 15, 'pt-BR': 15, ru: 14 });
export const CARD_BUTTON_KEYS = Object.freeze(['tutorial.skip', 'tutorial.next']);
/** Settings row labels (one line beside the row's On/Off pair) and the note under them. */
const SETTINGS_ROW_BUDGET = Object.freeze({ 'zh-CN': 10, es: 34, ja: 14, de: 34, 'pt-BR': 34, ru: 34 });
const SETTINGS_NOTE_BUDGET = Object.freeze({ 'zh-CN': 50, es: 150, ja: 70, de: 150, 'pt-BR': 150, ru: 140 });
export const SETTINGS_ROW_KEYS = Object.freeze(['settings.interface.allyReload', 'settings.interface.enemyReload']);
export const SETTINGS_NOTE_KEYS = Object.freeze(['settings.interface.reloadNote']);
/** Battle key lines: key caps first, one phone line; the budget counts the words without the {placeholder} key caps. */
const HUD_LINE_BUDGET = Object.freeze({ 'zh-CN': 20, es: 56, ja: 24, de: 56, 'pt-BR': 56, ru: 56 });
const HUD_LINE = /^hud\.alert\.line\.|^hud\.aimWarning\.flipLine$|^hud\.status\.fireLine$|^hud\.hint\.[^.]+\.line$/;
export const isHudLineKey = (key) => HUD_LINE.test(key);
const hudLineSentence = () => `Budget: the words after the key caps run ${limits(HUD_LINE_BUDGET)}, key caps not counted.`;
const HUD_LINE_DEFAULT = 'A battle key line in Claude of Tanks, a browser tank game: the {placeholders} are key caps drawn before the words, '
  + 'so keep every placeholder first and the words after them; one line on a phone, as short as the English. Never use an em dash.';
/** How long a budgeted text runs: a key line's words alone, else the whole text. */
const measure = (key, text) => (isHudLineKey(key) ? text.replace(/\{\w+\}/g, '').replace(/\s+/g, ' ').trim().length : text.length);
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

/** A key's budget per locale: a card button's, a narrower card's, else an act card's. */
export function budgetFor(key) {
  if (CARD_BUTTON_KEYS.includes(key)) return BUTTON_BUDGET;
  if (SETTINGS_ROW_KEYS.includes(key)) return SETTINGS_ROW_BUDGET;
  if (SETTINGS_NOTE_KEYS.includes(key)) return SETTINGS_NOTE_BUDGET;
  if (isHudLineKey(key)) return HUD_LINE_BUDGET;
  return KEY_BUDGET[key] ?? CARD_BUDGET;
}

const limits = ({ es, ru, ja, 'zh-CN': zh }) => `at most ${es} characters (Russian: ${ru}; Japanese: ${ja}; Chinese: ${zh})`;

/** The translation context a budgeted key carries (the gt CLI reads it per key); a key line keeps its lane's context. */
export function cardBudgetContext(key, current = '') {
  if (isHudLineKey(key)) {
    const base = (current || HUD_LINE_DEFAULT).replace(/\s*Budget: the words after the key caps run [^.]*\.(?: key caps not counted\.)?/, '').trim();
    return `${base} ${hudLineSentence()}`;
  }
  if (SETTINGS_ROW_KEYS.includes(key)) {
    return 'A switch label in the Interface settings of Claude of Tanks, a browser tank game. It turns on a thin bar under '
      + 'other tanks\' health bars showing how far each is through reloading its gun; allies are the player\'s team, '
      + `enemies the other team. It sits on one line beside an On/Off pair on a phone: hard limit ${limits(SETTINGS_ROW_BUDGET)}. `
      + 'Never use an em dash.';
  }
  if (SETTINGS_NOTE_KEYS.includes(key)) {
    return 'A short explanatory note under two switches in the Interface settings of Claude of Tanks, a browser tank game. '
      + 'Amber and gray are the colors the bar is drawn in: amber while the tank reloads, gray once its gun is loaded. '
      + `Hard limit: ${limits(SETTINGS_NOTE_BUDGET)}. Never use an em dash.`;
  }
  if (CARD_BUTTON_KEYS.includes(key)) {
    return 'A small text button on a tutorial card in Claude of Tanks, a browser tank game; it shares one row with the card\'s '
      + `other button on a narrow phone screen, so keep it as short as the language allows: hard limit ${limits(BUTTON_BUDGET)}. `
      + 'Never use an em dash.';
  }
  return 'A tutorial instruction card in Claude of Tanks, a browser tank game, shown while the battle goes on under it. '
    + 'It must fit in two short lines on a phone: write it as briefly as possible, cutting words rather than meaning. '
    + `Hard limit: ${limits(budgetFor(key))}. Letters such as C, D, F, G, Q, U and V are ring or bush markers on the `
    + 'ground; Sentry and Bulwark name practice targets. Keep every {placeholder} exactly as written. Never use an em dash.';
}

/** Every budgeted key: the act card bodies, the narrower bodies, the card buttons, the budgeted Settings rows and the
 *  battle key lines the English catalog holds. */
export async function budgetedKeys(en = readJson(resolve(ROOT, 'src/ui/i18nCatalog.en-US.json'))) {
  return [...new Set([...await actCardBodyKeys(), ...Object.keys(KEY_BUDGET), ...CARD_BUTTON_KEYS, ...SETTINGS_ROW_KEYS,
    ...SETTINGS_NOTE_KEYS, ...Object.keys(en).filter(isHudLineKey)])];
}

/** What breaks the budget: a budgeted key without its context, or a translation past its locale's budget. */
export function cardBudgetFailures(keys, metadata, catalogs) {
  const failures = [];
  for (const key of keys) {
    const current = metadata[key]?.context ?? '';
    if (current !== cardBudgetContext(key, current)) failures.push(`${key}: the metadata lacks the card budget (node tools/i18n-card-budget.mjs --write)`);
    for (const [locale, budget] of Object.entries(budgetFor(key))) {
      const text = catalogs[locale]?.[key];
      if (typeof text === 'string' && measure(key, text) > budget) failures.push(`${locale} ${key}: ${measure(key, text)} characters, over ${budget}`);
    }
  }
  return failures;
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

export async function repositoryCardBudgetFailures() {
  const keys = await budgetedKeys();
  const catalogs = Object.fromEntries(Object.keys(CARD_BUDGET)
    .map((locale) => [locale, readJson(resolve(ROOT, `src/ui/i18nCatalog.${locale}.json`))]));
  return cardBudgetFailures(keys, readJson(METADATA), catalogs);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--write')) {
    const metadata = readJson(METADATA);
    const keys = await budgetedKeys();
    for (const key of keys) metadata[key] = { context: cardBudgetContext(key, metadata[key]?.context ?? '') };
    writeFileSync(METADATA, `${JSON.stringify(metadata, null, 2)}\n`);
    console.log(`i18n-card-budget: ${keys.length} budgeted keys carry their budget`);
  } else {
    const failures = await repositoryCardBudgetFailures();
    if (failures.length) console.error(`i18n-card-budget: ${failures.length} failure(s)\n  ${failures.join('\n  ')}`);
    else console.log('i18n-card-budget: every budgeted key carries its budget, and every translation fits it');
    if (failures.length) process.exit(1);
  }
}
