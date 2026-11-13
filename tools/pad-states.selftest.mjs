// Round 8 Y5 s6-04 (after the 2026-11-02 audit's S3, tools/mp-states.selftest.mjs): the phone controller's harnesses
// spelled the pad's state words as string literals ('live', 'here', 'shown', 'timeout' ...), so a renamed state in
// src/pad read as a timeout or a failed check naming the wrong cause. The pad modules now export their vocabularies as
// runtime lists, tools/pad-states.mjs serves them (a word the owner does not have throws by name), the harnesses pass
// the words into their page functions, and no harness compares a pad state to a literal word.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAD_GUN_STATE, PAD_LINK_PATH, PAD_LINK_STATE, PAD_PHONE_STATE, PAD_SEAT_STATE, PAD_TOUR_STATE } from './pad-states.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const words = (vocabulary) => Object.keys(vocabulary);

// ---- each list is its owner's: the type derives from the list, and the link's union names exactly its kinds -----------
for (const [file, list, type] of [
  ['src/pad/padLink.ts', 'PAD_LINK_KINDS', 'PadLinkKind'], ['src/pad/padLink.ts', 'PAD_LINK_PATHS', 'PadLinkPath'],
  ['src/pad/padLink.ts', 'PAD_PHONE_STATES', 'PadPhoneState'], ['src/pad/padProtocol.ts', 'PAD_SEAT_STATES', 'PadSeatState'],
  ['src/pad/padProtocol.ts', 'PAD_TOUR_STATES', 'PadTourState'], ['src/pad/padReadyBuzz.ts', 'PAD_GUN_STATES', 'PadGunState'],
]) {
  assert.match(read(file), new RegExp(`export type ${type} = \\(typeof ${list}\\)\\[number\\];`), `${type} is its list's`);
}
{
  const union = read('src/pad/padLink.ts').match(/export type PadLinkState =([\s\S]*?);\n/)?.[1];
  assert.ok(union, 'padLink.ts declares PadLinkState');
  assert.deepEqual(words(PAD_LINK_STATE), [...union.matchAll(/kind: '([a-z]+)'/g)].map((match) => match[1]), 'every kind of PadLinkState is listed, in order');
  assert.match(union, /kind: 'live'; path: PadLinkPath/, "a live link's path is a listed path");
}
assert.deepEqual(words(PAD_LINK_STATE), ['connecting', 'waiting', 'linking', 'live', 'away', 'ended']);
assert.deepEqual(words(PAD_LINK_PATH), ['direct', 'turn', 'relay']);
assert.deepEqual(words(PAD_PHONE_STATE), ['join', ...words(PAD_LINK_STATE)], "the phone's diagnostics: its join screen, then its link's kind");
assert.deepEqual(words(PAD_SEAT_STATE), ['here', 'away', 'gone']);
assert.deepEqual(words(PAD_TOUR_STATE), ['hidden', 'shown', 'skipped', 'timeout', 'ended', 'screen']);
assert.deepEqual(words(PAD_GUN_STATE), ['idle', 'down', 'loading', 'ready']);
// the pages write these words from the owners' types and functions, never a free string
{
  const page = read('src/pad/padPage.ts');
  assert.match(page, /\bstate: PadPhoneState;/, "the phone's diagnostics state is a PadPhoneState");
  assert.match(page, /\btour: PadTourState;/, "the guide's diagnostics word is a PadTourState");
  assert.match(page, /function endTour\(how: PadTourEnd\)/, 'the guide ends one of the declared ways');
  assert.match(page, /ctl\.dataset\.state = padGunState\(next\);/, "the panel's gun state is padGunState's");
  assert.match(read('src/ui/couchLobby.ts'), /cell\.dataset\.state = entry \? entry\.presence : 'free';/, "a seat cell shows its seat's presence");
  assert.match(read('src/pad/padLobby.ts'), /export type PadLobbyPresence = Exclude<PadSeatState, 'gone'>;/, "a held seat's presence is a PadSeatState");
}

// ---- a word is itself; a word the owner does not have throws by name ------------------------------------------------
assert.equal(PAD_LINK_STATE.live, 'live');
assert.equal(PAD_SEAT_STATE.here, 'here');
assert.equal(`${PAD_TOUR_STATE.shown}`, 'shown');
assert.equal(JSON.stringify({ state: PAD_PHONE_STATE.join }), '{"state":"join"}');
assert.throws(() => PAD_LINK_STATE.paired, /PadLinkKind has no state paired \(connecting, waiting, linking, live, away, ended\)/);
assert.throws(() => PAD_TOUR_STATE.timedOut, /PadTourState has no state timedOut/);

// ---- the harnesses: no pad state compared to a literal word, in any of the forms they used --------------------------
{
  const all = [...new Set([PAD_LINK_STATE, PAD_LINK_PATH, PAD_PHONE_STATE, PAD_SEAT_STATE, PAD_TOUR_STATE, PAD_GUN_STATE].flatMap(words))];
  const word = `(['"\`])(?:${all.join('|')})\\1`;
  const FORMS = {
    // a state-shaped field compared to a word: .state, .tour, .how (the guide's end), .path (a live link's)
    field: new RegExp(`[\\w$?.()\\]]*\\.(?:state|tour|how|path)\\s*[!=]==?\\s*${word}`, 'g'),
    // the same, the word first
    reversed: new RegExp(`${word}\\s*[!=]==?\\s*[\\w$?.()\\]]*\\.(?:state|tour|how|path)\\b`, 'g'),
    // a selector that names a state (the couch lobby's seat cells, the phone's panel)
    selector: new RegExp(`\\[data-state=(['"]?)(?:${all.join('|')})\\1\\]`, 'g'),
    // a record of states read back (pad-e2e's resumed.desktop, resumed.phone)
    record: new RegExp(`\\bresumed\\.\\w+\\s*[!=]==?\\s*${word}`, 'g'),
  };
  // planted controls: each form catches its sample, and a word passed in, another field or a template is not caught
  const caught = (form, text) => new RegExp(FORMS[form].source).test(text);
  for (const [form, sample] of [
    ['field', "window.__COT_PAD_PHONE?.state === 'live'"], ['field', "window.__COT_PAD_PHONE.tour === 'shown'"],
    ['field', "phoneShut.how === 'timeout'"], ['field', "window.__COT_PAD.path === 'direct'"], ['field', "el.dataset.state === 'loading'"],
    ['field', 'x.state !== "away"'], ['reversed', "'ended' === window.__COT_PAD?.state"],
    ['selector', `document.querySelectorAll('.cot-couch-seat[data-state="here"]')`], ['selector', "'.pad-ctl[data-state=ready]'"],
    ['record', "resumed.desktop === 'live'"],
  ]) assert.ok(caught(form, sample), `the ${form} form catches ${sample}`);
  for (const sample of ['window.__COT_PAD_PHONE?.state === live', "x.label === 'live'", 'el.dataset.state === gun.loading',
    `.cot-couch-seat[data-state="\${here}"]`, "resumed.desktop === PAD_LINK_STATE.live", "p.state.pos.x === 'here'"]) {
    assert.ok(!Object.keys(FORMS).some((form) => caught(form, sample)), `not a literal comparison: ${sample}`);
  }
  const harnesses = ['tools/pad-e2e.browser.mjs', 'tools/couch-e2e.browser.mjs', 'tools/couch-panes.browser.mjs'];
  const found = {};
  for (const file of harnesses) {
    const source = read(file);
    const hits = Object.values(FORMS).flatMap((form) => [...source.matchAll(form)].map((match) => match[0].trim()));
    if (hits.length) found[file] = hits;
  }
  assert.deepEqual(found, {}, 'pad harness comparisons against literal state words (pass the word in from tools/pad-states.mjs)');
  for (const file of harnesses) assert.match(read(file), /import \{[^}]*\} from '\.\/pad-states\.mjs';/, `${file} reads its words from pad-states.mjs`);
}

console.log('pad-states.selftest: the pad vocabularies come from their owners; the pad harnesses spell none of them');
