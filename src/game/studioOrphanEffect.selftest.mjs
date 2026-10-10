// An orphan effect never hangs a film (the media lane, 2026-10-08: s38-church-knockout's fire@ally1@3800 and
// mg_burst@ally1@4800 with no ally1 staged hung the Studio's film capture at 100 % CPU until page.evaluate timed out).
// advanceTimeline offered a due effect again whenever its handler bailed (it never counted as passed), so
// nextPendingEffect returned it forever. The actual advanceTimeline, nextPendingEffect and replaceLoadEffects of
// studio.ts, run here with stub ports: a scene's effects that name actors it does not stage are dropped at load with a
// warning, and an effect whose handler still bails at its moment is offered once and the film runs to its end.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';

const studioSource = readFileSync(new URL('./studio.ts', import.meta.url), 'utf8');
const source = ts.createSourceFile('studio.ts', studioSource, ts.ScriptTarget.Latest, true);
const names = new Set(['advanceTimeline', 'nextPendingEffect', 'replaceLoadEffects']);
const functions = [];
(function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) functions.push(node.getText(source));
  ts.forEachChild(node, visit);
})(source);
assert.equal(functions.length, 3, 'the Studio\'s advanceTimeline, nextPendingEffect and replaceLoadEffects');

/** A Studio around the three functions: effects fire through `fire` (false when its actor is missing), every call
 * counted so a spin is caught; the clock moves with advanceFx. */
function studioTimeline(staged) {
  const fired = [], offered = [], warnings = [];
  let calls = 0;
  const ports = {
    effectLog: [], activeEffectIds: new Set(), storyboard: { durationMs: 12000 },
    clampStudioTime: (v, d) => Math.max(0, Math.min(Number(d), Number(v) || 0)),
    advanceFx: (ms) => { ports.clock.ms += ms; }, applyStoryboardActors: () => {}, applyStoryboardFrame: () => {},
    getWorld: () => null, rebuildEffects: () => {},
    // (2026-10-09, media r5: a step also plays the felled trees' crushes and moves the Studio's lamps with the camera)
    advanceCrushes: () => {}, ctx: {}, camera: { position: null },
    findActor: (ref) => (staged.includes(ref) ? { name: ref } : null),
    makeEffectRecord: (e, tMs) => ({ ...e, id: `fx${ports.effectLog.length}`, tMs }),
    fireEffect: (e) => {
      if (++calls > 1000) throw new Error('the timeline spun on one effect');
      offered.push(`${e.type}@${e.actor ?? '-'}@${e.tMs}`);
      if (e.actor != null && !staged.includes(e.actor)) return false; // the handler bails (fireActorGun, fireMgBurst)
      fired.push(e.type);
      return true;
    },
    console: { warn: (m) => warnings.push(m) },
    clock: { ms: 0 },
  };
  const code = stripTypeScriptTypes(`
    function make(ports) {
      const { effectLog, activeEffectIds, clampStudioTime, advanceFx, applyStoryboardActors, applyStoryboardFrame, getWorld,
        rebuildEffects, findActor, makeEffectRecord, fireEffect, console, advanceCrushes, ctx, camera } = ports;
      let storyboard = ports.storyboard;
      let timeScale = 1;
      const state = ports.clock;
      ${functions.join('\n').replaceAll('clockMs', 'state.ms')}
      return { advanceTimeline, replaceLoadEffects };
    }
  `);
  const api = new Function('ports', code + '\nreturn make(ports);')(ports);
  return { api, ports, fired, offered, warnings };
}

// ---- the media lane's scene: two effects on an unstaged ally1 among staged ones — dropped at load, with warnings
{
  const s = studioTimeline(['tank1']);
  s.api.replaceLoadEffects({ effects: [
    { type: 'explosion', at: [0, 0], tMs: 1200 },
    { type: 'fire', actor: 'ally1', tMs: 3800 },
    { type: 'fire', actor: 'tank1', tMs: 4000 },
    { type: 'mg_burst', actor: 'ally1', tMs: 4800 },
  ] }, 0);
  assert.deepEqual(s.ports.effectLog.map((e) => `${e.type}@${e.actor ?? '-'}`), ['explosion@-', 'fire@tank1'], 'the orphans dropped at load');
  assert.equal(s.warnings.length, 2, 'each with a warning');
  assert.ok(s.warnings.every((w) => w.includes('ally1')), 'naming the missing actor');
  // the film runs to its end
  for (let step = 0; step < 120; step++) s.api.advanceTimeline(100);
  assert.equal(s.ports.clock.ms, 12000, 'the film ran to its end');
  assert.deepEqual(s.fired, ['explosion', 'fire'], 'the staged effects fired once each');
}

// ---- an effect whose handler bails at its moment anyway (its actor removed after load): offered once, the film goes on
{
  const s = studioTimeline(['tank1']);
  s.ports.effectLog.push({ id: 'a', type: 'fire', actor: 'tank1', tMs: 3800 }, { id: 'b', type: 'mg_burst', actor: 'gone', tMs: 4800 },
    { id: 'c', type: 'explosion', tMs: 6000 });
  for (let step = 0; step < 120; step++) s.api.advanceTimeline(100);
  assert.equal(s.ports.clock.ms, 12000, 'the film ran to its end');
  assert.equal(s.offered.filter((o) => o.startsWith('mg_burst@gone')).length, 1, 'the bailing effect was offered once');
  assert.deepEqual(s.fired, ['fire', 'explosion'], 'the others fired in order');
}

console.log('studioOrphanEffect: a scene\'s effects naming an unstaged actor are dropped at load with a warning, and an '
  + 'effect whose handler bails is offered once: the media lane\'s orphan fire and mg_burst no longer spin the film PASS');
