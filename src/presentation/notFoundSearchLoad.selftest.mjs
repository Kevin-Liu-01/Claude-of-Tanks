// notFoundSearchLoad.selftest.mjs — the 404 page's search loads under the kit's opener rule (2026-11-02 audit R6, round 2
// U35). Copyright © 2026 Kevin B. Liu.
//
// The 404 page's search held its indexes in `search ??= loadSearch()`: a load that failed stood for the page's life with
// no sign on the field, every keystroke after it raised an unhandled rejection, and a focus while offline spent the one
// try (Chrome 151 keeps a failed import for the document). The page does not boot app/lazyChunk.ts, so it takes the
// docs' search rule (docs.ts, topics.ts): asked once, never offline, and a failure marks the field, whose next press
// reloads the page once online (components/loadFailure.ts). This runs notFound.ts on a stand-in document; its two
// chunks resolve to small modules, and "fail" the way a browser's import does when the network drops.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const data = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const SEARCH = data(`export const entriesOf = (records) => records;
  export const searchManual = (manual, query, n) => manual.filter((entry) => entry.title.toLowerCase().includes(query.toLowerCase())).slice(0, n);`);
const INDEXES = data(`export const fleet = [{ name: 'Leopard 2A4', href: '/gallery/leopard2a4', entry: { searchText: 'leopard 2a4 germany' } }];
  export const manualEn = [{ title: 'Leopard drills', href: '/docs/combat' }]; export const manualZh = [];`);
let failSearch = 0;
const asked = [];
const hook = registerHooks({
  resolve(specifier, context, next) {
    const parent = context.parentURL ?? '';
    if (/\/src\/presentation\/notFound\.ts(?:\?|$)/.test(parent)) {
      if (specifier === './publicNav.ts') return { url: data('export const localeRouteChanged = true;'), shortCircuit: true };
      if (specifier === './revealStills.ts') return { url: data('export function revealStills() {}'), shortCircuit: true };
      if (specifier === '../docs/docsSearch.ts') {
        asked.push(specifier);
        if (failSearch > 0) { failSearch -= 1; throw new TypeError(`Failed to fetch dynamically imported module: ${specifier}`); }
        return { url: SEARCH, shortCircuit: true };
      }
      if (specifier === './notFoundIndexes.ts') return { url: INDEXES, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    const loaded = next(url, context);
    // Vite's import.meta.env: a self-hosted build compiles the page's analytics out
    if (/\/src\/presentation\/notFound\.ts(?:\?|$)/.test(url)) {
      return { ...loaded, source: String(loaded.source).replace(/import\.meta\.env/g, "({ VITE_SELF_HOSTED: '1' })") };
    }
    return loaded;
  },
});

const unhandled = [];
process.on('unhandledRejection', (reason) => { unhandled.push(reason); });
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve)); };

/** A stand-in element: its listeners, dataset and attributes, and the parts the search reads. */
function element(extra = {}) {
  const listeners = new Map();
  return Object.assign({
    hidden: false, dataset: {}, attributes: {}, children: [], textContent: '',
    addEventListener(type, listener) { (listeners.get(type) ?? listeners.set(type, []).get(type)).push(listener); },
    fire(type, event = {}) { for (const listener of listeners.get(type) ?? []) listener(event); },
    listeners: (type) => (listeners.get(type) ?? []).length,
    setAttribute(name, value) { this.attributes[name] = value; },
    querySelector: () => null, querySelectorAll: () => [], contains: () => false, closest: () => null,
    replaceChildren(...children) { this.children = children; },
    focus() {},
  }, extra);
}
const template = () => element({ content: { firstElementChild: { cloneNode: () => {
  const link = element({ href: '', querySelector: (selector) => (selector === 'b' ? link.title : link.detail) });
  link.title = { textContent: '' };
  link.detail = { textContent: '' };
  return element({ querySelector: () => link });
} } } });

const windowListeners = new Map();
let reloads = 0;
let online = true;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { get onLine() { return online; }, language: 'en-US', languages: ['en-US'] } });
globalThis.location = { href: 'https://game.test/missing', pathname: '/missing', search: '', reload() { reloads += 1; }, assign() {} };
globalThis.addEventListener = (type, listener) => { (windowListeners.get(type) ?? windowListeners.set(type, []).get(type)).push(listener); };
const goOnline = () => { online = true; const listeners = windowListeners.get('online') ?? []; windowListeners.delete('online'); for (const listener of listeners) listener(); };

/** One page: a document with the search form, and notFound.ts run on it. */
let page = 0;
async function openPage() {
  const label = element();
  const input = element({ value: '', closest: (selector) => (selector === 'label' ? label : null) });
  const list = element({ hidden: true });
  const empty = element({ hidden: true });
  const rows = { vehicle: template(), manual: template() };
  const form = element({
    querySelector: (selector) => ({
      'input[type="search"]': input, '[data-nf-hits]': list, '[data-nf-empty]': empty,
      'template[data-nf-hit="vehicle"]': rows.vehicle, 'template[data-nf-hit="manual"]': rows.manual,
    })[selector] ?? null,
  });
  globalThis.document = {
    title: '', documentElement: { lang: 'en' }, activeElement: null,
    querySelectorAll: (selector) => (selector === 'form[data-nf-search]' ? [form] : []),
    querySelector: () => null, getElementById: () => null,
  };
  page += 1;
  await import(`./notFound.ts?page=${page}`);
  return { label, input, list };
}
const type = async (input, value) => { input.value = value; input.fire('input'); await settle(); };

// ---- a focus while offline spends nothing: the indexes are asked for once the browser is back
{
  online = false;
  asked.length = 0;
  const { input, list } = await openPage();
  input.fire('focus');
  await settle();
  assert.equal(asked.length, 0, 'the indexes are never asked for while offline (Chrome 151 would keep that failure for the document)');
  await type(input, 'leopard');
  goOnline();
  await settle();
  assert.equal(asked.length, 1, 'back online, the indexes are asked for');
  assert.equal(list.hidden, false, 'and what was typed meanwhile shows its hits once they are in');
  assert.equal(list.children.length, 2, 'the tank and the manual section');
}

// ---- a search that did not arrive: the field says so, keystrokes raise nothing, and its next press reloads
{
  online = true;
  asked.length = 0;
  unhandled.length = 0;
  failSearch = 1;
  const { label, input } = await openPage();
  input.fire('focus');
  await settle();
  assert.equal(asked.length, 1);
  assert.equal(label.dataset.loadState, 'error', 'the field keeps the kit\'s error state (the base kept the rejection with no sign)');
  assert.ok(label.attributes['aria-description'], 'and says so to assistive technology');
  for (const value of ['l', 'le', 'leo']) await type(input, value);
  assert.equal(unhandled.length, 0, `a keystroke after the failure raises no unhandled rejection (${unhandled.length})`);
  assert.equal(asked.length, 1, 'a search that did not arrive is not asked for again in this document');
  label.fire('pointerdown');
  assert.equal(reloads, 1, 'the field\'s next press reloads the page');
}

// ---- the plain path: the indexes load with the first focus, and a query shows its hits
{
  asked.length = 0;
  const { input, list } = await openPage();
  input.fire('focus');
  await type(input, 'leopard');
  assert.equal(asked.length, 1);
  assert.equal(list.hidden, false);
  assert.equal(list.children.length, 2);
  await type(input, 'nothing-like-it');
  assert.equal(list.hidden, true, 'no hits: the list closes');
}

hook.deregister();
console.log('notFoundSearchLoad.selftest: the 404 search asks once, never offline; a failure marks the field (its press reloads) and raises nothing per keystroke');
