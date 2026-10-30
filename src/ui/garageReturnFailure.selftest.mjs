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
// loading states (2026-10-27): a notice handed a retry carries the one action that runs it; one without carries none
{
  const made = [];
  globalThis.document = { createElement: () => {
    const listeners = {};
    const label = { textContent: '' };
    const button = { hidden: false, type: '', className: '', set innerHTML(html) { label.textContent = html.replace(/<[^>]+>/g, ''); },
      querySelector: () => label, addEventListener: (kind, fn) => { listeners[kind] = fn; }, click: () => listeners.click?.(), label };
    made.push(button);
    return button;
  } };
  const footer = { children: [], append(child) { this.children.push(child); } };
  const shut = [];
  const presenter = createGarageReturnFailurePresenter(() => ({ body: { textContent: '' }, footer, setTitle() {}, open() {},
    close: (options) => shut.push(options) }), () => 'The battle could not start');
  let retried = 0;
  presenter(new Error('cold chunk failed'), () => { retried += 1; });
  assert.equal(footer.children.length, 1, 'a retry puts one action in the footer');
  assert.equal(footer.children[0].hidden, false);
  footer.children[0].click();
  assert.equal(retried, 1, 'the action runs the retry');
  assert.deepEqual(shut, [{ restoreFocus: false, immediate: true }], 'and closes the notice first');
  presenter(new Error('again'), () => { retried += 1; });
  assert.equal(footer.children.length, 1, 'a second failure reuses the one action');
  presenter(new Error('no retry here'));
  assert.equal(footer.children[0].hidden, true, 'a failure without a retry hides it');
  // (264) a chunk that did not arrive is not asked for again in this document: its action reloads the page once online
  const reloaded = [];
  globalThis.location = { reload: () => reloaded.push(true) };
  const online = (value) => Object.defineProperty(globalThis, 'navigator', { value: { onLine: value }, configurable: true, writable: true });
  const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  online(false);
  presenter(new TypeError('Failed to fetch dynamically imported module: https://x/assets/battleLoad-1a2b3c4d.js'));
  assert.equal(footer.children[0].hidden, false, 'a chunk failure carries an action');
  assert.equal(footer.children[0].label.textContent, 'Reload page', 'and it is Reload page');
  footer.children[0].click();
  assert.deepEqual(reloaded, [], 'offline the press waits (a reload would be the browser\'s error page)');
  online(true);
  footer.children[0].click();
  assert.deepEqual(reloaded, [true], 'online it reloads the page');
  delete globalThis.location;
  if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator); else delete globalThis.navigator;
  delete globalThis.document;
}
{
  const { isNetworkFailure } = await import('./garageReturnFailure.ts');
  assert.equal(isNetworkFailure(new TypeError('Failed to fetch dynamically imported module: https://x/assets/a-1.js'), true), true);
  assert.equal(isNetworkFailure(new TypeError('Failed to fetch'), true), true, 'a fetch the network refused');
  assert.equal(isNetworkFailure(new Error('World build failed'), true), false, 'a build failure keeps its reason');
  assert.equal(isNetworkFailure(new Error('World build failed'), false), true, 'any failure while offline is the network\'s');
  assert.equal(isNetworkFailure(new TypeError('error loading dynamically imported module: https://x/assets/a-1b2c3d4e.js'), true), true, 'Firefox');
  assert.equal(isNetworkFailure(new TypeError('Importing a module script failed.'), true), true, 'Safari');
  assert.equal(isNetworkFailure(new Error('Unable to preload CSS for /assets/mediaArchive-k2j4h5g6.css'), true), true, "a chunk's CSS");
  const built = new Error('World build failed');
  built.stack = 'Error: World build failed\n    at buildWorld (https://cot.kevinliu.studio/assets/main-lgbo999x.js:1:2345)';
  assert.equal(isNetworkFailure(built, true), false, 'a production stack names a hashed chunk whatever the error: only the message counts');
}
const presenterSource = await readFile(new URL('./garageReturnFailure.ts', import.meta.url), 'utf8');
assert.doesNotMatch(presenterSource, /from '\.\.\/app\/lazyImportRetry\.ts'/,
  'the notice never imports the retry helper: as a third importer it split into a boot request of its own on the game page');
assert.match(presenterSource, /export const showSoloEntryFailure = createGarageReturnFailurePresenter\([\s\S]{0,200}t\('battle\.entryFailed\.title'\)[\s\S]{0,420}t\('battle\.entryFailed\.body', \{ reason \}\)/,
  'the solo notice is a second failure-only presenter over the same modal');
assert.match(presenterSource, /isChunkFailure\(error\) \? t\('battle\.entryFailed\.reload'\)/,
  'a chunk that did not arrive asks for the page\'s reload (components/loadFailure.ts)');

const main = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(main, /presentFailure: \(error, retry\) => \{[\s\S]{0,160}return import\('\.\/ui\/garageReturnFailure\.ts'\)\.then\(\(\{ showSoloEntryFailure \}\) => showSoloEntryFailure\(error, reload \? null : retry\)\);/,
  'a failed solo entry demand-loads the notice from the failure-only owner (a chunk failure without a retry)');
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
