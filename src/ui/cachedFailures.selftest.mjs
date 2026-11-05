// cachedFailures.selftest.mjs — two page owners that kept a failure for their whole session no longer do (2026-11-02
// audit R6). Copyright © 2026 Kevin B. Liu.
//
// - The Gallery's vehicle load had no failure edge: a builder or lab chunk that did not arrive left the loading
//   silhouette up, READY false and an unhandled rejection; and a superseded load hid the newer load's silhouette. Its
//   anatomy waiters (`waitAnatomyReady`, the workbench's toggles) waited on whichever show was latest when they asked.
//   The dossier and the row move at a press while the stage, the lab and the anatomy stay the tank before it until the
//   swap (16-audio-gallery item 8): a layer paired the new id with the old root, the lab's copy wrote the new id over
//   the old lab, and a failed load left it so for good. The shown tank has its own id now, and a failure goes back to it.
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

// ---- the vehicle load's failure edge, and (16-audio-gallery item 8) the half-swapped specimen it used to leave
{
  const wrapper = lift(gallery, 'async function loadTank(');
  const run = async ({ superseded = false, shown = 'm1a1_abrams_hc', pressed = 'leopard2_proto', lab = true, swapped = false, marked = [], options, online = true } = {}) => {
    const calls = [];
    const scope = {
      navigator: { onLine: online },
      loadVersion: 4,
      selectedId: shown,
      shownId: shown,
      damageLab: lab ? {} : null,
      failedLoads: new Set(marked),
      window: { __TANK_GALLERY_READY: true },
      recordById: new Map([[shown, { id: shown }], [pressed, { id: pressed }]]),
      loadTankUnguarded: async (id) => {
        calls.push(`load ${id}`);
        scope.loadVersion += superseded ? 2 : 1; // a newer load claimed the stage meanwhile
        scope.selectedId = id; // the dossier and the row move at the press
        scope.window.__TANK_GALLERY_READY = false;
        if (swapped) scope.shownId = id; // the swap ran, and a later chunk (the lab's) failed
        throw new TypeError('Failed to fetch dynamically imported module: /assets/leopard-12345678.js');
      },
      // the kit's press on a row whose load failed: true (it reloads once online), so the load stops there
      pressFailed: (row) => { if (!row?.failed) return false; if (online) calls.push(`reload ${row.id}`); return true; },
      rowFor: (id) => (id ? { id, failed: scope.failedLoads.has(id) } : null),
      renderDossier: (record) => calls.push(`dossier ${record.id}`),
      markSelectedRow: () => calls.push(`row ${scope.selectedId}`),
      markFailedRows: () => calls.push(`marked ${[...scope.failedLoads].join(',')}`),
      updateUrl: () => calls.push(`url ${scope.selectedId}`),
      loadingState: { classList: { add: (name) => calls.push(`hide ${name}`) } },
      showToast: (text, options) => calls.push(`toast ${text} ${options.severity}`),
      t: (key) => key,
      console: { warn: () => calls.push('warn') },
    };
    const loadTank = new Function('scope', `with (scope) { ${wrapper}\nreturn loadTank; }`)(scope);
    await loadTank(pressed, options);
    return { calls, scope };
  };
  {
    const { calls, scope } = await run();
    assert.deepEqual(calls, ['load leopard2_proto', 'hide hidden', 'warn', 'dossier m1a1_abrams_hc', 'row m1a1_abrams_hc',
      'url m1a1_abrams_hc', 'marked leopard2_proto', 'toast loadFailed.generic error'],
      'the current load\'s failure takes the silhouette down, puts the dossier and the row back on the shown tank, marks the failed row and says so, with no rejection left over');
    assert.equal(scope.selectedId, 'm1a1_abrams_hc', 'the selection is the shown tank again: no layer or copy pairs the failed id with its root');
    assert.equal(scope.window.__TANK_GALLERY_READY, true, 'READY as it stood for the shown tank');
  }
  assert.deepEqual((await run({ superseded: true })).calls, ['load leopard2_proto'], 'a superseded load leaves the newer load\'s silhouette alone');
  assert.deepEqual((await run({ marked: ['leopard2_proto'] })).calls, ['reload leopard2_proto'],
    "a failed vehicle's next press reloads (the kit's opener rule): its load is not asked again in the page");
  // (round 2, the loaders residual) a Back or Forward move to a failed tank's address: online the page reloads there; offline
  // it cannot, and the address (which the move had put on the failed tank) goes back to the tank still shown
  assert.deepEqual((await run({ marked: ['leopard2_proto'], options: { history: true } })).calls, ['reload leopard2_proto'],
    'online, a history move to a failed tank reloads at its address');
  assert.deepEqual((await run({ marked: ['leopard2_proto'], options: { history: true }, online: false })).calls, ['url m1a1_abrams_hc'],
    'offline, a history move to a failed tank puts the address back on the tank shown (it stayed on the failed id)');
  assert.deepEqual((await run({ marked: ['leopard2_proto'], online: false })).calls, [], 'offline, a press waits and the row keeps saying so');
  assert.match(gallery, /window\.addEventListener\('popstate', \(\) => \{[\s\S]{0,200}loadTank\([^\n]*history: true \}\);/,
    'the history move says it is one');
  {
    const { calls, scope } = await run({ shown: null, lab: false });
    assert.deepEqual(calls, ['load leopard2_proto', 'hide hidden', 'warn', 'marked leopard2_proto', 'toast loadFailed.generic error'],
      'the first load failed: nothing to go back to, the dossier stays on it and its row is marked');
    assert.equal(scope.selectedId, 'leopard2_proto');
    assert.equal(scope.window.__TANK_GALLERY_READY, false);
  }
  {
    const { calls, scope } = await run({ swapped: true });
    assert.deepEqual(calls, ['load leopard2_proto', 'hide hidden', 'warn', 'toast loadFailed.generic error'],
      'a failure after the swap (the lab) leaves the new tank shown and selected, its row unmarked');
    assert.equal(scope.selectedId, 'leopard2_proto');
  }
  const body = lift(gallery, 'async function loadTankUnguarded(');
  assert.match(body, /await nextFrame\(\);\n\s*\/\/[^\n]*\n\s*if \(version === loadVersion\) loadingState\.classList\.add\('hidden'\);/,
    'after the swap, only the current load hides the silhouette');
  assert.match(body, /disposeTank\(\);\n\s*visual = built;\n\s*shownId = id;/, 'shownId moves at the swap, with the visual');
  assert.match(lift(gallery, 'function disposeTank('), /visual = null;\n\s*shownId = null;/);

  // tank-scoped actions pair the shown tank with its own id
  const anatomyVehicle = (scope) => new Function('scope', `with (scope) { ${lift(gallery, 'function anatomyVehicle(')}\nreturn anatomyVehicle; }`)(scope)();
  const stage = { visual: { root: 'm1a1 root' }, damageLab: null, getSpec: (id) => ({ id, armor: `${id} armour` }), isPostwarVehicleEra: () => true };
  assert.equal(anatomyVehicle({ ...stage, selectedId: 'leopard2_proto', shownId: 'm1a1_abrams_hc' }), null,
    'while a pressed row builds, no layer pairs its id with the old root and the old armour');
  assert.deepEqual(anatomyVehicle({ ...stage, selectedId: 'm1a1_abrams_hc', shownId: 'm1a1_abrams_hc' }),
    { id: 'm1a1_abrams_hc', key: 'm1a1_abrams_hc|', armor: 'm1a1_abrams_hc armour', caliberMm: 0, modern: true, root: 'm1a1 root' });
  assert.match(gallery, /JSON\.stringify\(\{ vehicleId: shownId, \.\.\.damageLab\.snapshot\(\) \}/, "the lab's copy names the lab's own vehicle");
  // a redraw keeps the failed rows marked
  assert.match(lift(gallery, 'function renderRoster('), /\n\s*markFailedRows\(\);\n/);
}

// ---- the HUD editor's backdrop: a failed decode no longer fails every profile
{
  const editor = source('./hudEditor.ts');
  assert.match(editor, /const backdropReady=backdrop\.decode\(\)\.catch\(\(\)=>\{\}\);/, 'the preview waits on the decode, never on its failure');
  assert.doesNotMatch(editor, /void backdropReady\.catch/);
}
console.log('cachedFailures.selftest: the Gallery load has a failure edge that goes back to the shown tank and marks the failed row; layers and the lab copy pair the shown tank with its id; its waiters follow the latest show; the HUD editor shows without a failed backdrop');
