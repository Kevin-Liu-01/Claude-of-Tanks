// z-layer-census.selftest.mjs — the stacking order's receipt (modal-layer-277; owner 2026-11-24: "the settings and pause,
// any modal should go above any other ui stuff"). Copyright © 2026 Kevin B. Liu.
//
// The tree passes tools/z-layer-census.mjs, and the census fails each way the order breaks: a literal off the scale, a step
// that crosses a layer, a fallback that disagrees with its token, a scale out of order, a modal off the modal layer or with
// no row, a notice in the top layer, a top-layer user with no row. The modal layer's tokens sit where the owner put them:
// over every HUD, notice, menu and drawer layer, under only the tooltip and the critical blockers.
// The live pass is tools/modal-layer.browser.mjs (a built preview, under the capture lock): the pause and Settings in an Air
// Support battle with the INCOMING warning, a kill and the binoculars up, where elementFromPoint finds only the modal.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRANSIENT_SURFACES } from '../src/ui/transientSurfaceRegistry.ts';
import { judgeValue, readScale, scaleProblems, zLayerCensus, MODALS } from './z-layer-census.mjs';

const tokensJson = JSON.parse(readFileSync(new URL('../src/ui/tokens/tokens.json', import.meta.url), 'utf8'));
const scale = readScale(tokensJson);
const z = (name) => scale.tokens.get(name);

// 1. the tree
const tree = zLayerCensus({ registry: TRANSIENT_SURFACES });
assert.deepEqual(tree.problems, [], `the tree holds the stacking order:\n${tree.problems.join('\n')}`);
assert.ok(tree.seen.length > 200, 'the census read the app\'s z-indexes');

// 2. the order the owner asked for: HUD < notices < menus/drawers < modal < tooltip < critical
const order = ['z-hud', 'z-screen', 'z-report', 'z-cover', 'z-notice', 'z-drawer', 'z-menu', 'z-modal', 'z-tip', 'z-critical'];
for (let i = 1; i < order.length; i++) assert.ok(z(order[i]) > z(order[i - 1]), `--${order[i]} stands over --${order[i - 1]}`);
assert.ok(!scale.tokens.has('z-toast'), 'no toast layer over the modal (notices are z-notice, under it)');
assert.deepEqual(scaleProblems(scale), []);

// 3. values
const aliases = new Map([['hud-layer-score', { token: 'z-hud-score', fallback: z('z-hud-score') }], ['bad-alias', { token: 'z-hud-score', fallback: 1 }]]);
const ok = (value) => judgeValue(value, scale, aliases);
assert.equal(ok('3').ok, true, 'a band literal orders a component\'s own parts');
assert.equal(ok('-1').ok, true);
assert.equal(ok('500').ok, false, 'a literal over the band is off the scale');
assert.equal(ok('10050').ok, false);
assert.equal(ok('var(--z-modal)').value, z('z-modal'));
assert.equal(ok('calc(var(--z-modal) + 2)').value, z('z-modal') + 2, 'a step on a layer');
assert.equal(ok('calc(var(--z-modal) + 60)').ok, false, 'a step that reaches the tooltip layer crosses it');
assert.equal(ok('calc(var(--z-notice) + 30)').ok, false, 'a notice stepped onto the drawers crosses a layer');
assert.equal(ok('calc(var(--z-hud) - 1)').ok, true, 'just under the HUD falls into the band');
assert.equal(ok('calc(var(--z-shell) - var(--z-lift))').value, z('z-shell') - 1, 'a step by a band token');
assert.equal(ok('var(--hud-layer-score)').value, z('z-hud-score'), 'an alias of a z token');
assert.equal(ok('var(--bad-alias)').ok, false, 'an alias whose fallback disagrees with its token');
assert.equal(ok('var(--z-critical,900)').ok, true, 'a fallback equal to its token (a page whose token sheet may have failed)');
assert.equal(ok('var(--z-critical,10000)').ok, false, 'a fallback that differs');
assert.equal(ok('var(--interpolated)').ok, false, 'a computed value');
assert.equal(ok('var(--s4)').ok, false, 'a token that is no z token');
assert.equal(ok('auto').ok, true);

// 4. the scale's own order breaks
const broken = structuredClone(tokensJson);
broken.semantic.layer['z-notice'] = { value: 450 };
assert.match(scaleProblems(readScale(broken)).join('\n'), /--z-drawer \(200\) does not rise over --z-notice/);
const leak = structuredClone(tokensJson);
leak.component.kit['z-lift'] = { value: 70 };
assert.match(scaleProblems(readScale(leak)).join('\n'), /--z-lift \(70\) is neither in the local band nor a root layer/);

// 5. a planted tree: the census fails each breach
const FILES = {
  'src/ui/tokens/tokens.json': JSON.stringify(tokensJson),
  'src/ui/a.css': '.a{position:fixed;z-index:500}',
  'src/ui/b.ts': 'const CSS = `.b{position:fixed;inset:0;z-index:calc(var(--z-notice) + 40)}`; el.style.zIndex = String(n);',
  'src/ui/components/notice.ts': 'region.showPopover();',
  'src/ui/c.ts': 'menu.setAttribute(\'popover\', \'manual\');',
  'src/ui/settings.ts': 'const CSS = `.cot-settings{position:fixed;z-index:80}`; liftModal(root, true);',
};
const planted = zLayerCensus({ files: Object.keys(FILES).filter((p) => p !== 'src/ui/tokens/tokens.json'), read: (p) => FILES[p] ?? '',
  registry: { settings: { modal: true }, 'new-dialog': { modal: true } } }).problems.join('\n');
assert.match(planted, /src\/ui\/a\.css: z-index 500: literal 500 outside the local band/);
assert.match(planted, /src\/ui\/b\.ts: z-index calc\(var\(--z-notice\) \+ 40\): a step on --z-notice \(220\) crosses/);
assert.match(planted, /src\/ui\/b\.ts: sets a z-index from script to a computed value/);
assert.match(planted, /notice\.ts: a notice entered the top layer/);
assert.match(planted, /src\/ui\/c\.ts: puts an element in the top layer/);
assert.match(planted, /modal settings: src\/ui\/settings\.ts \.cot-settings is off the modal layer \(z-index 80/);
assert.match(planted, /modal new-dialog: no MODALS row/);

// 6. every modal row: lifted, a native dialog or contained with its reason
for (const [id, row] of Object.entries(MODALS)) {
  assert.ok(['lift', 'dialog', 'contained'].includes(row.how), `${id}: a known way onto the modal layer`);
  if (row.how === 'contained') assert.ok(row.reason?.length > 40, `${id}: contained with its reason`);
}
assert.equal(MODALS.pause, undefined, 'the pause is Settings: no veil row (settings-unify-278)');
for (const id of ['settings', 'modal', 'hud-editor', 'deploy', 'rooms', 'tech-tree']) assert.equal(MODALS[id]?.how, 'lift', `${id} is lifted onto the modal layer`);

console.log(`z-layer-census selftest: PASS (${tree.seen.length} z-indexes, ${Object.keys(MODALS).length} modals, `
  + `${order.map((n) => `${n} ${z(n)}`).join(' < ')})`);
