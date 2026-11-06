// studioArchiveOpener.selftest.mjs — the Studio's field-frames archive is an opener (round 3 X9, after audit R6 and
// U35/Q17). Runs studioPanel.ts's own archiveSheet chunk (app/lazyChunk.ts) and openArchive over a stub document. Its
// stylesheet failure is terminal for the document (a failed sheet never applies, and Vite's preload never adds it again):
// each press of the archive's button opened an empty dialog and said Vite's untranslated "Unable to preload CSS" again,
// for the rest of the page. Now the failure closes the dialog, says so once and marks the button (components/
// loadFailure.ts), and the button's next press reloads the page once online, as every opener's does (offline it says
// so again and waits). (review r1) That press never reloads over the Studio's running work (a recording, an export, a queue
// run: panelBusy()): it asks for the work to finish first. The browser itself (a real failed <link>) was not reproduced.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import { createLazyChunk } from '../app/lazyChunk.ts';
import { loadFailed, markLoadFailed, pressFailed } from './components/loadFailure.ts';

const text = readFileSync(new URL('./studioPanel.ts', import.meta.url), 'utf8');
const source = ts.createSourceFile('studioPanel.ts', text, ts.ScriptTarget.Latest, true);
let sheetDeclaration = null, openArchiveSource = null;
(function visit(node) {
  if (ts.isVariableStatement(node) && node.declarationList.declarations.some((entry) => entry.name.getText(source) === 'archiveSheet')) {
    sheetDeclaration = node.getText(source);
  }
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'openArchive') openArchiveSource = node.getText(source);
  ts.forEachChild(node, visit);
})(source);
assert.ok(sheetDeclaration && openArchiveSource, 'studioPanel.ts declares the archive\'s sheet and openArchive');
const importer = "import('../presentation/mediaArchive.css')";
assert.ok(sheetDeclaration.includes(importer), 'the sheet is the archive\'s stylesheet');

let online = true, reloads = 0;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { get onLine() { return online; } } });
globalThis.location = { reload() { reloads += 1; } };

/** A stub <dialog> with the parts openArchive reads. */
function makeDialog() {
  const parts = { strong: { textContent: '' }, button: { setAttribute() {}, innerHTML: '', addEventListener() {} },
    '[data-media-archive]': { dataset: {} } };
  return {
    className: '', innerHTML: '', open: false, shown: 0,
    querySelector: (selector) => parts[selector] ?? null,
    addEventListener() {}, showModal() { this.open = true; this.shown += 1; }, close() { this.open = false; },
  };
}
/** The panel's archive over its real chunk; `sheet` is the stylesheet import's outcome; `work.busy` is panelBusy(). */
function makePanel(sheet, work = { busy: false }) {
  const said = [], mounted = [], dialogs = [];
  const document = {
    querySelector: (selector) => (selector === '.cot-studio-archive' ? dialogs[0] ?? null : null),
    createElement: () => makeDialog(),
    body: { appendChild: (dialog) => dialogs.push(dialog) },
  };
  const archiveBtn = { dataset: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
  const ports = {
    createLazyChunk, loadFailed, markLoadFailed, pressFailed, document, archiveBtn, panelBusy: () => work.busy,
    loadSheet: () => sheet(), t: (key) => key, uiIconSVG: () => '<svg/>', errorMessage: (error) => String(error?.message ?? error),
    flashBusy: (message) => said.push(message), console,
    mountMediaArchive: async (root, options) => { mounted.push(options); root.dataset.mediaMounted = 'true'; return {}; },
  };
  const code = stripTypeScriptTypes(`
    function makeArchive(ports) {
    const { ${Object.keys(ports).join(', ')} } = ports;
    ${sheetDeclaration.replace(importer, 'loadSheet()')}
    ${openArchiveSource}
    return { openArchive, archiveSheet };
    }
  `);
  const panel = new Function('ports', `${code}\nreturn makeArchive(ports);`)(ports);
  return { ...panel, said, mounted, dialogs, archiveBtn };
}
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve)); };
const cssFailure = () => new Error('Unable to preload CSS for /assets/mediaArchive-k2j4h5g6.css');

// 1. The sheet did not arrive: the empty archive closes, the failure is said once in the kit's words and marks the button.
{
  online = true; reloads = 0;
  let asks = 0;
  const h = makePanel(() => { asks += 1; return Promise.reject(cssFailure()); });
  h.openArchive();
  await settle();
  assert.equal(h.dialogs.length, 1, 'the press opened the archive');
  assert.equal(h.dialogs[0].open, false, 'the empty archive closes once its sheet did not arrive');
  assert.equal(h.archiveBtn.dataset.loadState, 'error', 'its button keeps the kit\'s error state');
  assert.deepEqual(h.said, ['loadFailed.generic'], 'the failure is said once, in the kit\'s words');
  assert.equal(h.mounted.length, 0, 'no archive mounts unstyled');
  // 2. The next press, online: the page reloads (the one recovery that applies a stylesheet), with no second dialog or error
  h.openArchive();
  await settle();
  assert.equal(reloads, 1, 'the button\'s next press reloads the page once online');
  assert.equal(h.dialogs[0].shown, 1, 'no empty archive opens again');
  assert.deepEqual(h.said, ['loadFailed.generic'], 'and the error is not said again');
  assert.equal(asks, 1, 'the sheet is never asked for again in this document');
  // 3. Offline: no reload (it would be the browser's error page); the press says so again and waits
  online = false;
  h.openArchive();
  await settle();
  assert.equal(reloads, 1, 'offline the press does not reload');
  assert.equal(h.dialogs[0].shown, 1, 'nor opens the empty archive');
  assert.deepEqual(h.said, ['loadFailed.generic', 'loadFailed.generic'], 'it says so again');
  online = true;
}
// (the sheet arrives) the archive opens and mounts; nothing is said or marked, and a later press opens it again
{
  online = true; reloads = 0;
  const h = makePanel(() => Promise.resolve({}));
  h.openArchive();
  await settle();
  assert.equal(h.dialogs[0].open, true, 'the archive opens');
  assert.deepEqual(h.mounted, [{ mode: 'compact', limit: 61 }], 'and mounts');
  assert.deepEqual(h.said, []);
  assert.equal(h.archiveBtn.dataset.loadState, undefined);
  h.dialogs[0].close();
  h.openArchive();
  await settle();
  assert.equal(h.dialogs[0].shown, 2, 'a later press opens it again');
  assert.equal(reloads, 0);
}

// 4. (review r1) A press on the failed archive while the Studio works (a recording, an export, a queue run): no reload,
// which would end that work; the press asks for it to finish first. Once the Studio is free the press reloads.
{
  online = true; reloads = 0;
  const work = { busy: false };
  const h = makePanel(() => Promise.reject(cssFailure()), work);
  h.openArchive();
  await settle();
  assert.equal(h.archiveBtn.dataset.loadState, 'error');
  work.busy = true;
  h.openArchive();
  await settle();
  assert.equal(reloads, 0, 'a press on the failed archive never reloads over the Studio\'s running work');
  assert.equal(h.dialogs[0].shown, 1, 'nor opens the empty archive');
  assert.deepEqual(h.said, ['loadFailed.generic', 'studio.error.busy'], 'it asks for the work to finish first');
  work.busy = false;
  h.openArchive();
  await settle();
  assert.equal(reloads, 1, 'once the Studio is free the press reloads');
}

console.log('studioArchiveOpener.selftest: a field-frames archive whose stylesheet did not arrive closes, says so once and marks its button, whose next press reloads once online (never over the Studio\'s running work); a loaded archive opens and mounts');
