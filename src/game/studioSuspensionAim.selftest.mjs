// A siege vehicle's hydropneumatic aim is part of its scene (the home page's suspension still, 2026-10-13): an actor's
// suspensionAimDeg runs setHydropneumaticAim at load, state() saves the aim it was given (clamped to the spec's travel),
// and that record loads to the same aim. The actual replaceLoadActors, setHydropneumaticAim and actorStateJson of
// studio.ts, run here with stub ports (the movement solver stands in as a spy on the aim point it is handed).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';

const studioSource = readFileSync(new URL('./studio.ts', import.meta.url), 'utf8');
const source = ts.createSourceFile('studio.ts', studioSource, ts.ScriptTarget.Latest, true);
const names = new Set(['replaceLoadActors', 'setHydropneumaticAim', 'actorStateJson']);
const functions = [];
(function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) functions.push(node.getText(source));
  ts.forEachChild(node, visit);
})(source);
assert.equal(functions.length, 3, "the Studio's replaceLoadActors, setHydropneumaticAim and actorStateJson");

const DEG = Math.PI / 180;
const SPECS = {
  strv103: { id: 'strv103', hydropneumaticAim: { noseDownDeg: 13, noseUpDeg: 12 } },
  t90m_x: { id: 't90m_x' },
};

/** A Studio around the three functions: addActor makes a plain actor record, updateTank records the aim point. */
function studio() {
  const actors = [], aims = [], calls = [];
  const addActor = (cfg) => {
    const a = {
      uid: `a${actors.length + 1}`, name: cfg.name ?? null, specId: cfg.id, spec: SPECS[cfg.id],
      pose: { x: cfg.pos?.[0] ?? 0, z: cfg.pos?.[1] ?? 0, facingDeg: cfg.facingDeg ?? 0, turretDeg: 0, gunDeg: 0 },
      state: { pos: { x: cfg.pos?.[0] ?? 0, y: 1, z: cfg.pos?.[1] ?? 0 }, yaw: 0, speed: 0, yawRate: 0, visualPitch: 0, _terr: { pitch: 0 }, suspensionAimPitch: 0 },
      input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: { set(x, y, z) { Object.assign(this, { x, y, z }); } } },
      visual: { syncFromState() {}, root: { getObjectByName: () => null } },
      camo: null, camoSeed: 1, stateName: 'intact', authoredStateName: 'intact', stateAgeS: null, authoredStateAgeS: null,
      recoilAgeS: null, authoredRecoilAgeS: null, smoking: false, burning: false, authoredSmoking: false, authoredBurning: false,
      authoredSuspensionAimPitch: null, authoredSuspensionAimDeg: null,
    };
    actors.push(a);
    return a;
  };
  const ports = {
    sceneMeta: {}, clearActors: () => { actors.length = 0; }, resetFx: () => {}, addActor,
    findActor: (ref) => (typeof ref === 'object' ? ref : actors.find((a) => a.name === ref || a.uid === ref) ?? null),
    actorRootPosition: (a, x, z, yaw, out) => Object.assign(out, { x, z }),
    // the solver settles the hull on the aim it is given: the sight line's pitch out of the aim point
    updateTank: (a) => {
      const p = a.input.aimPoint, st = a.state;
      st.suspensionAimPitch = Math.atan2(p.y - (st.pos.y + 2), Math.hypot(p.x - st.pos.x, p.z - st.pos.z));
      st.visualPitch = st.suspensionAimPitch;
    },
    actorSupport: () => null, invalidate: () => {}, SIM_DT: 1 / 60, DEG,
    THREE: { InstancedMesh: class {}, Matrix4: class {}, Vector3: class {} },
    r2: (v) => Math.round(v * 100) / 100,
  };
  const code = stripTypeScriptTypes(`
    function make(ports, calls) {
      const { sceneMeta, clearActors, resetFx, addActor, findActor, actorRootPosition, updateTank, actorSupport, invalidate,
        SIM_DT, DEG, THREE, r2 } = ports;
      let timeScale = 1;
      const _v3 = { x: 0, y: 0, z: 0 };
      ${functions.join('\n')}
      const aimed = setHydropneumaticAim;
      setHydropneumaticAim = (ref, deg) => { calls.push([ref?.name ?? ref, deg]); return aimed(ref, deg); };
      return { replaceLoadActors, actorStateJson, setHydropneumaticAim };
    }
  `);
  const api = new Function('ports', 'calls', `${code}\nreturn make(ports, calls);`)(ports, calls);
  return { api, actors, calls, aims };
}
const pitchOf = (a) => Math.atan2(a.input.aimPoint.y - (a.state.pos.y + 2), Math.hypot(a.input.aimPoint.x - a.state.pos.x, a.input.aimPoint.z - a.state.pos.z)) / DEG;
const yieldNone = async () => {};

// load: the Strv's sight line laid 10° up; the T-90M (no hydropneumatic aim) left alone
{
  const s = studio();
  await s.api.replaceLoadActors({ actors: [{ id: 'strv103', name: 'hero', pos: [3, 4], suspensionAimDeg: 10 }, { id: 't90m_x', name: 'foe0' }] }, yieldNone);
  assert.deepEqual(s.calls, [['hero', 10]], 'setHydropneumaticAim runs once, for the actor that names an aim');
  const [hero, foe] = s.actors;
  assert.ok(Math.abs(pitchOf(hero) - 10) < 0.01, `the solver is handed a sight line 10° up (${pitchOf(hero).toFixed(2)}°)`);
  assert.equal(hero.authoredSuspensionAimDeg, 10, 'the aim is authored');
  assert.ok(Math.abs(hero.authoredSuspensionAimPitch - 10 * DEG) < 1e-6, 'and the settled pitch is kept for the timeline');
  assert.equal(hero.state.pos.x, 3, 'the authored place holds');
  // state(): the aim saved; an actor without one carries no field
  const saved = s.api.actorStateJson(hero);
  assert.equal(saved.suspensionAimDeg, 10, 'state() saves the aim');
  assert.equal('suspensionAimDeg' in s.api.actorStateJson(foe), false, 'no field for an actor without one');
  // the round trip: that record loads to the same aim
  const again = studio();
  await again.api.replaceLoadActors({ actors: [saved, s.api.actorStateJson(foe)] }, yieldNone);
  assert.deepEqual(again.calls, [['hero', 10]], 'the saved record lays the same aim at load');
  assert.equal(again.api.actorStateJson(again.actors[0]).suspensionAimDeg, 10, 'and saves it again unchanged');
}
// the spec's travel clamps the aim; a vehicle without the system ignores the field
{
  const s = studio();
  await s.api.replaceLoadActors({ actors: [{ id: 'strv103', name: 'up', suspensionAimDeg: 20 }, { id: 'strv103', name: 'down', suspensionAimDeg: -30 },
    { id: 't90m_x', name: 'mbt', suspensionAimDeg: 8 }] }, yieldNone);
  assert.equal(s.api.actorStateJson(s.actors[0]).suspensionAimDeg, 12, 'nose up stops at the spec\'s 12°');
  assert.equal(s.api.actorStateJson(s.actors[1]).suspensionAimDeg, -13, 'nose down stops at the spec\'s 13°');
  assert.equal(s.actors[2].authoredSuspensionAimDeg, null, 'a hull without hydropneumatics takes no aim');
  assert.equal('suspensionAimDeg' in s.api.actorStateJson(s.actors[2]), false, 'and saves none');
}
console.log('studioSuspensionAim.selftest: load lays the aim, state() saves it clamped to the travel, the record loads to the same aim');
