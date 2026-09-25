import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGarageReturnFailurePresenter } from './garageReturnFailure.ts';

const titles = [];
const body = { textContent: '' };
let created = 0;
let opened = 0;
const closes = [];
let title = 'Retry loading';
const show = createGarageReturnFailurePresenter(() => {
  created += 1;
  return { body, setTitle: (value) => titles.push(value), open: () => { opened += 1; },
    close: (options) => closes.push(options) };
}, () => title);
show.hide();
assert.equal(created, 0, 'good transitions and later intent allocate no error dialog');
show(new Error('<button>not markup</button>'));
assert.equal(body.textContent, '<button>not markup</button>', 'error content uses text only');
assert.equal(opened, 1, 'a failed return has a visible notice');
title = '重试加载';
show(null);
assert.equal(created, 1, 'repeated failed clicks reuse one bounded modal');
assert.equal(body.textContent, title, 'unknown errors have localized fallback content');
assert.deepEqual(titles, ['Retry loading', title], 'locale is refreshed on each failure');
assert.equal(opened, 2);
show.hide();
assert.deepEqual(closes, [{ restoreFocus: false, immediate: true }]);

// entry resilience (2026-09-25): the solo entry notice formats the reason into a sentence with the one action
const formatted = { textContent: '' };
const solo = createGarageReturnFailurePresenter(
  () => ({ body: formatted, setTitle() {}, open() {}, close() {} }),
  () => 'The battle could not start',
  (reason) => `${reason}. Back in the Garage — try again.`,
);
solo(new Error('World build failed'));
assert.equal(formatted.textContent, 'World build failed. Back in the Garage — try again.', 'the formatter receives the reason text');
solo('not an error');
assert.equal(formatted.textContent, 'The battle could not start. Back in the Garage — try again.',
  'an unknown failure formats the title as its reason');
const presenterSource = await readFile(new URL('./garageReturnFailure.ts', import.meta.url), 'utf8');
assert.match(presenterSource, /export const showSoloEntryFailure = createGarageReturnFailurePresenter\([\s\S]{0,200}t\('battle\.entryFailed\.title'\)[\s\S]{0,120}t\('battle\.entryFailed\.body', \{ reason \}\)/,
  'the solo notice is a second failure-only presenter over the same modal');

const main = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(main, /presentFailure: \(error\) => import\('\.\/ui\/garageReturnFailure\.ts'\)\.then\(\(\{ showSoloEntryFailure \}\) => showSoloEntryFailure\(error\)\)/,
  'a failed solo entry demand-loads the notice from the failure-only owner');
assert.match(main, /void battleAgainAction\.run\(\)/,
  'the bus must use the action-scoped failure owner');
assert.match(main, /loadFailure: \(\) => import\('\.\/ui\/garageReturnFailure\.ts'\)/,
  'the failure notice must remain outside successful boot and return acquisition');
assert.match(main, /if \(!button \|\| button\.disabled\) return false;\s*button\.click\(\);\s*return true;/,
  'only the real enabled Garage control acknowledges a battle trigger');

const endScreen = await readFile(new URL('./endScreen.ts', import.meta.url), 'utf8');
const againHandler = endScreen.split("again.addEventListener('click', () => {")[1]?.split('\n      });')[0];
assert.ok(againHandler, 'the real result action must be present');
assert.match(againHandler, /bus\.emit\('ui:battleAgain'/);
assert.doesNotMatch(againHandler, /api\.hide\(/,
  'the report remains available until covered canonical return hides it');
console.log('garageReturnFailure.selftest: retained report, caught failures, reusable accessible notice pass');
