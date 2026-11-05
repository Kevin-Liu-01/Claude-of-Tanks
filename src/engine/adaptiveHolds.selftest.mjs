import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

// 2026-11-02 audit R3 (governor suspend flag): one boolean held the adaptive governor off for a covered battle load, a
// lost WebGL context and a Studio film, and every owner wrote it directly (last writer wins). A context restore that
// finished during a covered load turned the governor back on, so it measured loading frames (which "must never demote
// the quality") and could step the session's auto tier down; a Studio film restored it from a DOM mirror. Now the
// suspension is derived from named holds (namedHolds.ts) and each owner releases only its own.
//
// The receipt source-executes post.ts's production governor suspension (the holds owner and the public methods) and
// replays the owners' call order as main.ts, the loading runtimes and the Studio film make it.

const post = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
// (the holds owner, where the tree has one: a base without it still runs the hazard case below)
const { createNamedHolds } = await import('./namedHolds.ts').catch(() => ({ createNamedHolds: null }));
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const film = readFileSync(new URL('../game/studioFilm.ts', import.meta.url), 'utf8');

function between(source, start, end) {
  const first = source.indexOf(start);
  assert.notEqual(first, -1, `missing production start: ${start}`);
  const last = source.indexOf(end, first + start.length);
  assert.notEqual(last, -1, `missing production end: ${end}`);
  return source.slice(first, last);
}

// --- (round 2 Q14) the hazard itself, first: main.ts's own governor calls on post.ts's own governor --------------------
// Whatever shape the two files have (the base wrote the one boolean from every owner; the merged tree holds by name), the
// calls the context hooks and ui:battleStart make run against the governor suspension post.ts declares, in the order a
// context restore that completes during a covered battle load makes them. On the base the restore wrote false over the
// load's true, and the governor measured loading frames.
const contextHooks = between(main, 'renderer.userData.contextRecovery = {', "bus.on('phase:change'");
{
  const governorCall = (source, label) => {
    const m = source.match(/post\.(setAdaptiveSuspended|setAdaptiveHold)\(([^)]*)\)/);
    assert.ok(m, `main.ts's ${label} calls the governor`);
    return new Function('post', `post.${m[1]}(${m[2]});`);
  };
  const onLost = governorCall(between(contextHooks, '  onLost() {', '\n  },'), 'onLost');
  const restoreBody = between(contextHooks, '  async onRestored(', '\n  },');
  const releases = [...restoreBody.matchAll(/post\.(setAdaptiveSuspended|setAdaptiveHold)\(([^)]*)\)/g)];
  assert.ok(releases.length > 0, "main.ts's onRestored calls the governor");
  const onRestored = governorCall(releases.at(-1)[0], 'onRestored');
  const battleStart = governorCall(main.match(/bus\.on\('ui:battleStart', \(\) => ([^\n]*)\);/)?.[1] ?? '', 'ui:battleStart');
  const optional = (start, end) => {
    const first = post.indexOf(start);
    return first < 0 ? '' : post.slice(first, post.indexOf(end, first + start.length));
  };
  const holds = optional('  const adaptiveHolds = createNamedHolds', '\n  });');
  const methods = ['setAdaptiveSuspended(suspended) {', 'setAdaptiveHold(reason, held) {']
    .map((start) => optional(`    ${start}`, '\n    },'))
    .filter(Boolean).map((body) => `${body}\n    },`).join('\n');
  const g = new Function('createNamedHolds', stripTypeScriptTypes(`function governor() {
    const renderer = { domElement: { dataset: {} } };
    let adaptiveSuspended = false;
    function resetGovernorState() {}
    ${holds ? `${holds}\n  });` : ''}
    const api = {\n${methods}\n};
    return { api, suspended: () => adaptiveSuspended };
  }`) + '\nreturn governor();')(createNamedHolds);
  battleStart(g.api); // the covered battle load
  g.api.setAdaptiveSuspended(true); // soloBattleLoadingRuntime.begin
  onLost(g.api); // a context loss under the cover
  onRestored(g.api); // its restore completes while the cover is still up
  assert.equal(g.suspended(), true, "a restore during a covered load leaves the governor off (the load's frames never govern)");
}

// --- the owners route through named holds (the base wrote the one boolean from every owner) ---------------------------
assert.match(contextHooks, /post\.setAdaptiveHold\('context-lost', true\)/, 'a context loss takes its own governor hold');
assert.match(contextHooks, /post\.setAdaptiveHold\('context-lost', false\)/, 'and its restore releases only that hold');
assert.doesNotMatch(contextHooks, /setAdaptiveSuspended\(/, 'the restore no longer writes the shared loading latch');
assert.match(main, /bus\.on\('ui:battleStart', \(\) => post\.setAdaptiveHold\('loading', true\)\)/);
assert.doesNotMatch(film, /dataset\.adaptiveSuspended/, 'the Studio film reads no DOM mirror of the governor');
assert.match(film, /post\.holdAdaptive\('studio-film'\)/, 'the film holds the governor through its own handle');
assert.match(film, /state\.adaptiveHold\.release\(\)/, 'and releases only that handle');

// --- the production holds owner (post.ts) --------------------------------------------------------------------------
const holdsDecl = between(post, '  const adaptiveHolds = createNamedHolds', '\n  });') + '\n  });';
const method = (start) => between(post, `    ${start}`, '\n    },') + '\n    }';
const createGovernor = new Function('createNamedHolds', stripTypeScriptTypes(`function governor() {
  const renderer = { domElement: { dataset: {} } };
  let adaptiveSuspended = false;
  let resets = 0;
  function resetGovernorState() { resets += 1; }
  ${holdsDecl}
  const api = {
    ${method('setAdaptiveSuspended(suspended) {')},
    ${method('setAdaptiveHold(reason, held) {')},
    ${method('holdAdaptive(reason) {')},
    get adaptiveHoldReasons() { return adaptiveHolds.reasons(); },
  };
  return { api, suspended: () => adaptiveSuspended, resets: () => resets, dataset: renderer.domElement.dataset };
}`) + '\nreturn governor();');

{
  // a context restore that completes during a covered battle load
  const g = createGovernor(createNamedHolds);
  g.api.setAdaptiveHold('loading', true); // ui:battleStart
  g.api.setAdaptiveSuspended(true); // soloBattleLoadingRuntime.begin (the loading latch again: one hold)
  g.api.setAdaptiveHold('context-lost', true); // onLost
  g.api.setAdaptiveHold('context-lost', false); // onRestored succeeds while the cover is still up
  assert.equal(g.suspended(), true, 'loading frames still never govern after a mid-load restore');
  assert.equal(g.dataset.adaptiveSuspended, 'true');
  assert.deepEqual(g.api.adaptiveHoldReasons, ['loading']);
  g.api.setAdaptiveSuspended(false); // the reveal
  assert.equal(g.suspended(), false, 'the reveal releases the governor');
  assert.equal(g.resets(), 2, 'the governor resets only when the derived switch flips (enter, leave)');
}

{
  // the reverse: a load that finishes while the context is still lost
  const g = createGovernor(createNamedHolds);
  g.api.setAdaptiveHold('context-lost', true);
  g.api.setAdaptiveSuspended(true);
  g.api.setAdaptiveSuspended(false); // garageReturnRuntime / browserComposition release the load
  assert.equal(g.suspended(), true, 'a lost context keeps the governor off past a load release');
  g.api.setAdaptiveHold('context-lost', false);
  assert.equal(g.suspended(), false);
}

{
  // a Studio film across a load release: the film's handle survives; its release restores nobody else's state
  const g = createGovernor(createNamedHolds);
  const filmHold = g.api.holdAdaptive('studio-film');
  g.api.setAdaptiveSuspended(true);
  g.api.setAdaptiveSuspended(false);
  assert.equal(g.suspended(), true, 'a load release mid-film leaves the film holding the governor');
  g.api.setAdaptiveSuspended(true); // a covered load starts before the film ends
  filmHold.release();
  assert.equal(g.suspended(), true, 'the film ending does not release the newer load (no stale snapshot)');
  filmHold.release();
  assert.deepEqual(g.api.adaptiveHoldReasons, ['loading'], 'a handle releases once');
  g.api.setAdaptiveSuspended(false);
  assert.equal(g.suspended(), false);
  assert.equal(g.resets(), 2);
}

// --- the holds owner itself ------------------------------------------------------------------------------------------
{
  const flips = [];
  const holds = createNamedHolds((held) => flips.push(held));
  const a = holds.acquire('film');
  const b = holds.acquire('film');
  holds.set('load', true);
  holds.set('load', true);
  assert.deepEqual(flips, [true], 'only the first hold flips the switch');
  a.release(); a.release();
  assert.equal(holds.has('film'), true, 'counted handles: one release each');
  holds.set('load', false);
  assert.equal(holds.held, true);
  b.release();
  assert.equal(holds.held, false);
  assert.deepEqual(flips, [true, false]);
  holds.set('load', false);
  assert.deepEqual(flips, [true, false], 'releasing an unheld latch is a no-op');
  assert.equal(b.released, true);
}

console.log('adaptiveHolds selftest: named governor holds survive each other (load × restore × film)');
