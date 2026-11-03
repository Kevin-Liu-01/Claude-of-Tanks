// cachedFailures.selftest.mjs — two page owners that kept a failure for their whole session no longer do (2026-11-02
// audit R6). Copyright © 2026 Kevin B. Liu.
//
// - The Gallery's vehicle load had no failure edge: a builder or lab chunk that did not arrive left the loading
//   silhouette up, READY false and an unhandled rejection; and a superseded load hid the newer load's silhouette. Its
//   anatomy waiters (`waitAnatomyReady`, the workbench's toggles) waited on whichever show was latest when they asked.
// - The HUD editor's backdrop decode was one promise for the editor's life: a failed decode failed every profile tab.
// The Gallery and the editor need a document; their functions are lifted out of the sources and run here on stubs (the
// browser hazards themselves were not reproduced).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
/** The top-level function `name` of `text` (to its closing brace at column 0), types stripped. */
function lift(text, signature) {
  const begin = text.indexOf(signature);
  assert.ok(begin >= 0, `${signature} is in the source`);
  const end = text.indexOf('\n}\n', begin);
  return stripTypeScriptTypes(text.slice(begin, end + 2));
}
const gallery = source('../gallery/gallery.ts');

// ---- the anatomy waiters follow the latest show
{
  const scope = { anatomyReady: null };
  const anatomySettled = new Function('scope', `with (scope) { ${lift(gallery, 'async function anatomySettled(')}\nreturn anatomySettled; }`)(scope);
  let release1, release2;
  scope.anatomyReady = new Promise((resolve) => { release1 = resolve; });
  let settled = false;
  const waiter = anatomySettled().then(() => { settled = true; });
  scope.anatomyReady = new Promise((resolve) => { release2 = resolve; });
  release1();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false, 'a show replaced while it was waited on: the waiter follows the newer one');
  release2();
  await waiter;
  assert.equal(settled, true);
  scope.anatomyReady = Promise.reject(new Error('the anatomy view did not load'));
  await anatomySettled();
  assert.match(gallery, /waitAnatomyReady: anatomySettled,/, 'the probe waits on the latest show');
  assert.doesNotMatch(gallery, /void anatomyReady\.then\(/, 'no workbench waiter holds an old show');
}

// ---- the vehicle load's failure edge
{
  const wrapper = lift(gallery, 'async function loadTank(');
  const run = async ({ superseded }) => {
    const calls = [];
    const scope = {
      loadVersion: 4,
      loadTankUnguarded: async () => {
        scope.loadVersion += superseded ? 2 : 1; // a newer load claimed the stage meanwhile
        throw new TypeError('Failed to fetch dynamically imported module: /assets/leopard-12345678.js');
      },
      loadingState: { classList: { add: (name) => calls.push(`hide ${name}`) } },
      showToast: (text, options) => calls.push(`toast ${text} ${options.severity}`),
      t: (key) => key,
      console: { warn: () => calls.push('warn') },
    };
    const loadTank = new Function('scope', `with (scope) { ${wrapper}\nreturn loadTank; }`)(scope);
    await loadTank('leopard2_proto');
    return calls;
  };
  assert.deepEqual(await run({ superseded: false }), ['hide hidden', 'warn', 'toast loadFailed.generic error'],
    'the current load\'s failure takes the silhouette down and says so, with no rejection left over');
  assert.deepEqual(await run({ superseded: true }), [], 'a superseded load leaves the newer load\'s silhouette alone');
  const body = lift(gallery, 'async function loadTankUnguarded(');
  assert.match(body, /await nextFrame\(\);\n\s*\/\/[^\n]*\n\s*if \(version === loadVersion\) loadingState\.classList\.add\('hidden'\);/,
    'after the swap, only the current load hides the silhouette');
}

// ---- the HUD editor's backdrop: a failed decode no longer fails every profile
{
  const editor = source('./hudEditor.ts');
  assert.match(editor, /const backdropReady=backdrop\.decode\(\)\.catch\(\(\)=>\{\}\);/, 'the preview waits on the decode, never on its failure');
  assert.doesNotMatch(editor, /void backdropReady\.catch/);
}
console.log('cachedFailures.selftest: the Gallery load has a failure edge and its waiters follow the latest show; the HUD editor shows without a failed backdrop');
