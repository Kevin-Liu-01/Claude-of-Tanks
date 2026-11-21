// keyPrompt.selftest.mjs — the one "what do I press" (mobile-hud-274, owner 2026-11-20: "a standardized system for knowing
// and easily seeing what key to press"): a rebound key shows in a hint's line, a pad shows its button, a touch layout
// shows the tile's icon and no key, the revision moves when a binding or the device does, and the controls strip and the
// battle's tiles read the same resolver.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { battleKeycap, formatPrompt, inputDevice, promptFor, promptRevision, promptTiles } from './keyPrompt.ts';

function makeInput({ touch = false, pad = false } = {}) {
  const bindings = { consumable1: 'Digit4', autoAim: 'KeyT', hitboxOverlay: 'KeyH', shell1: 'Digit1', shell2: 'Digit2', shell3: 'Digit3' };
  const padBindings = { consumable1: 2, autoAim: null };
  let revision = 1;
  return {
    touch, pad,
    getBinding: (action, slot = 0) => (slot === 0 ? bindings[action] ?? null : null),
    getPadBinding: (action) => padBindings[action] ?? null,
    labelFor: (code) => (code ? code.replace(/^(Digit|Key)/, '') : '—'),
    padLabelFor: (index) => (index == null ? '—' : ['A', 'B', 'X', 'Y'][index] ?? `PAD ${index}`),
    padActive() { return this.pad; },
    isTouchLayout() { return this.touch; },
    bindingsRevision: () => revision,
    rebind(action, code) { bindings[action] = code; revision++; },
  };
}

// 1. the keyboard: the bound key, and a rebinding shows in the hint's line (no hard-coded key)
{
  const input = makeInput();
  assert.equal(inputDevice(input), 'keyboard');
  assert.deepEqual(promptFor(input, 'consumable1'), { kind: 'key', label: '4' });
  const before = formatPrompt(input, 'hud.hint.moduleRepair.line', { repair: 'consumable1' }, {}, null);
  assert.match(before, /<kbd[^>]*class="cot-c-kbd cot-c-kbd--battle"[^>]*>4<\/kbd>/, 'the line holds the battle keycap of the bound key');
  assert.match(before, /cot-key-prompt__said">4</, 'the key is said to a screen reader too');
  const revision = promptRevision(input);
  input.rebind('consumable1', 'KeyR');
  assert.notEqual(promptRevision(input), revision, 'a rebinding moves the revision (the hint draws again)');
  const after = formatPrompt(input, 'hud.hint.moduleRepair.line', { repair: 'consumable1' }, {}, null);
  assert.match(after, />R<\/kbd>/, 'the rebound key shows in the hint');
  assert.doesNotMatch(after, />4<\/kbd>/, 'the old key is gone');
  assert.match(after, /repairs it/, 'the words around the key are the catalog\'s');
}

// 2. a pad: its button, and the device change moves the revision
{
  const input = makeInput();
  const revision = promptRevision(input);
  input.pad = true;
  assert.equal(inputDevice(input), 'pad');
  assert.notEqual(promptRevision(input), revision, 'a device change moves the revision');
  assert.deepEqual(promptFor(input, 'consumable1'), { kind: 'pad', label: 'X' });
  assert.deepEqual(promptFor(input, 'autoAim'), { kind: 'none' }, 'no button bound: no prompt');
}

// 3. touch: the tile's icon, never a key, and the tile to light
{
  const input = makeInput({ touch: true });
  assert.equal(inputDevice(input), 'touch');
  const prompt = promptFor(input, 'consumable1');
  assert.equal(prompt.kind, 'tile');
  const line = formatPrompt(input, 'hud.hint.moduleRepair.line', { repair: 'consumable1' }, {}, null);
  assert.doesNotMatch(line, /<kbd/, 'a touch line holds no keycap');
  assert.match(line, /cot-key-prompt--tile[^>]*><svg/, 'a touch line holds the tile\'s icon');
  assert.deepEqual(promptTiles(input, ['consumable1']), [prompt.selector], 'the tile is lit on the HUD');
  assert.deepEqual(promptTiles(makeInput(), ['consumable1']), [], 'a keyboard lights no tile');
}

// 4. every character of a line's own text is escaped; only the prompts are markup
{
  const input = makeInput();
  const line = formatPrompt(input, 'hud.hint.ammoTypes.line', { shell1: 'shell1', shell2: 'shell2', shell3: 'shell3' }, {}, null);
  assert.equal((line.match(/<kbd/g) || []).length, 3, 'three keys, three caps');
  assert.match(battleKeycap('左键', { action: 'fire', cjk: true, spoken: true }), /^<kbd data-key-cap="fire" class="cot-c-kbd cot-c-kbd--battle cjk">左键<\/kbd>$/);
}

// 5. one resolver: the controls strip's caps and the battle's tiles read it, and no hint line hard-codes a key
{
  const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  const settings = read('./settings.ts');
  assert.match(settings, /const bindLabel = \(id: ActionId\): string => \{\s*const prompt = promptFor\(input, id, 'keyboard'\)/, 'the strip reads the resolver');
  assert.match(settings, /battleKeycap\(cap, \{ action, cjk: CJK_CAP\.test\(cap\), spoken: true \}\)/, 'the strip draws the battle keycap');
  assert.match(read('./keyPrompt.ts'), /keyCapFor\(input as unknown as KeyCapInput/, 'the resolver is the tiles\' keyCapFor');
  const en = JSON.parse(read('./i18nCatalog.en-US.json'));
  for (const [key, value] of Object.entries(en)) {
    if (!key.startsWith('hud.hint.') || !key.endsWith('.line')) continue;
    assert.doesNotMatch(value, /\b(press|Press)\s+[0-9A-Z]\b|\b[0-9]\s*\/\s*[0-9]\b/, `${key} names its keys by placeholder`);
  }
}

console.log('keyPrompt.selftest: PASS (a rebound key shows in a hint, a pad shows its button, touch shows the tile and no key, the revision follows bindings and device, one resolver for the strip and the tiles)');
