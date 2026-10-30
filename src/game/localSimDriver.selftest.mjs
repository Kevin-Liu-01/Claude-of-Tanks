// The local Worker driver draws the page's own battle (docs/ARCHITECTURE.md "One core, two drivers"; ?localDriver=worker).
// Two copies of one solo battle on Verdant, seated by the page's setupBattle from the same seeds: the first steps on the
// page (game/state.ts simStep), the second is the page end of the Worker driver (game/localSimDriver.ts) over the Worker's
// core (game/localSimCore.ts) in-process, its channel cloning every message as a Worker's would (transfers included).
// The player drives, turns and fires on both; the bots play on both. Every tick the driven page's hulls (every leaf the
// mirror carries), its shells, its clock and its verdict must be the stepped page's, bit for bit, and the Worker must
// have seated the page's roster. Negative control: a micrometre on the Worker's aim point at tick 200 is found at that tick.
// First-party receipt: Kevin B. Liu.
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { createBus, createCollider, createGameState, setupBattle, simStep } from './state.ts';
import { spawnTanks } from './rosterState.ts';
import { createLocalSimCore, headlessGunPose } from './localSimCore.ts';
import { createLocalSimDriver } from './localSimDriver.ts';
import { createMirrorWriter, createStringTable } from './localSimMirror.ts';
import { ensureFullFleet } from '../vehicles/fleetFactory.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

const MAP = 'verdant';
await ensureFullFleet();

function worldFor() {
  const world = createDedicatedWorldCollision(MAP);
  const authored = world.heightField._layout.spawns;
  const spawnOf = (point) => ({ pos: [point.x, world.heightField.getHeightAt(point.x, point.z), point.z], yaw: point.yaw ?? 0 });
  world.spawnPoints = { player: spawnOf(authored.player), enemies: authored.enemies.map(spawnOf) };
  return world;
}

/** A page's battle (setupBattle), its models stood in by the Worker's gun pose so both fire from the same muzzle. */
function seatPage(world, beforeSetup) {
  const game = createGameState({ rosterSeed: 3 });
  game.mapId = MAP;
  spawnTanks(game, { scene: { add() {}, remove() {} } });
  for (const entity of game.allTanks) {
    entity.visual = { root: new Group(), contactGeom: null, trackWidthM: null,
      gunMuzzleWorld: (out, index, launchers) => { headlessGunPose(entity, out, null, index, launchers); return out; },
      gunDirWorld: (out, index, launchers) => { headlessGunPose(entity, null, out, index, launchers); return out; },
      recoilKick() {}, setDestroyed() {}, resetDestroyed() {}, syncFromState() {}, setVisible() {}, dispose() {} };
  }
  game.battleCount = 1;
  beforeSetup?.(game);
  setupBattle(game, 'm1a1_abrams_hc', world, { random: true, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: false });
  game.preBattleS = 0;
  for (const entity of game.tanks) entity.input.aimPoint ??= new Vector3();
  return game;
}

/** An in-process Worker: each message structured-cloned (transfers detached), delivered at once. */
function workerPair() {
  const pageListeners = [], coreListeners = [];
  const worker = {
    postMessage(message, transfer = []) { const copy = structuredClone(message, { transfer }); for (const listener of coreListeners) listener(copy); },
    addEventListener(type, listener) { if (type === 'message') pageListeners.push(listener); },
  };
  const port = {
    post(message, transfer = []) { const copy = structuredClone(message, { transfer }); for (const listener of pageListeners) listener({ data: copy }); },
    onMessage(listener) { coreListeners.push(listener); return () => {}; },
  };
  return { worker, port };
}

const strings = createStringTable();
/** Every leaf the mirror carries, a hull at a time, as bytes (a string by its interned index). */
function leavesOf(game) {
  return game.tanks.map((entity) => {
    const writer = createMirrorWriter();
    const out = new Float64Array(4096);
    const count = writer.write(entity, out, 0, strings);
    const schema = writer.schema(entity);
    return { id: entity.id, count, values: out.slice(0, count), keys: schema.leafKey, parents: schema.leafParent, parentKeys: schema.parentKey,
      parentOf: schema.parentOf };
  });
}
/** A leaf's whole path (its parents' keys, then its own). */
const pathOf = (row, index) => {
  const parts = [row.keys[index]];
  for (let parent = row.parents[index]; parent >= 0; parent = row.parentOf[parent]) parts.unshift(row.parentKeys[parent]);
  return `${row.id}:${parts.join('.')}`;
};
const pathsOf = (row) => Array.from({ length: row.count }, (_, index) => pathOf(row, index));

async function run(ticks, perturbAt = -1) {
  // the page that steps its own battle
  const stepWorld = worldFor();
  const stepped = seatPage(stepWorld);
  const bus = createBus();
  const collider = createCollider(stepped, stepWorld);
  // the page the Worker drives, and the Worker's core
  const drivenWorld = worldFor();
  const { worker, port } = workerPair();
  let clock = 0;
  const core = createLocalSimCore({ port, buildWorld: async () => worldFor(), now: () => clock, schedule: () => null, cancel: () => {} });
  let driver = null;
  const drivenBus = createBus();
  const driven = seatPage(drivenWorld, (game) => {
    driver = createLocalSimDriver({ game, bus: drivenBus, getRig: () => null, getWorld: () => drivenWorld, kernels: false,
      createWorker: () => worker, now: () => clock, log: (line) => { throw new Error(line); } });
    driver.beforeSetup();
  });
  driver.begin({ specId: 'm1a1_abrams_hc', gameMode: 'standard', random: true });
  for (let wait = 0; wait < 200 && driver.pending; wait++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(driver.pending, false, 'the Worker seated the battle');
  assert.equal(driver.stats.mismatch, null, 'the Worker seated the page\'s roster');
  assert.ok(driver.active, 'the Worker drives it');
  // the fight brought close: the hostiles 130 m ahead of the player, on both pages and in the Worker's battle alike
  for (const game of [stepped, driven, core.game]) {
    const player = game.player;
    let slot = 0;
    for (const entity of game.tanks) {
      if (entity.team !== 'enemy') continue;
      const bearing = player.state.yaw + (slot++ - 3) * 0.12;
      const x = player.state.pos.x + Math.sin(bearing) * 130, z = player.state.pos.z + Math.cos(bearing) * 130;
      entity.state.pos.set(x, stepWorld.heightField.getHeightAt(x, z), z);
      if (entity.state._sup) entity.state._sup.x = NaN;
    }
  }
  const own = (game) => game.player, foeOf = (game) => game.tanks.find((entity) => entity.team === 'enemy' && !entity.combat.destroyed);
  const inputFor = (tick, game) => {
    const foe = foeOf(game);
    return { throttle: 0.7, steer: tick < 300 ? 0 : 0.3, brake: false, fire: tick % 90 === 30,
      aim: foe ? [foe.state.pos.x, foe.state.pos.y + 1.5, foe.state.pos.z] : [0, 0, 0] };
  };
  let divergence = null;
  let shotsSeen = 0;
  let hitsSeen = 0;
  drivenBus.on('shell:hit', () => { hitsSeen++; });
  for (let tick = 1; tick <= ticks && !divergence; tick++) {
    // the stepped page: its input on the hull, then its own step
    const a = inputFor(tick, stepped), sp = own(stepped).input;
    Object.assign(sp, { throttle: a.throttle, steer: a.steer, brake: a.brake, fire: a.fire, shellSlot: 0, aimLocked: false });
    sp.aimPoint.set(...a.aim);
    simStep(stepped, bus, stepWorld, null, collider);
    // the driven page: the same input sampled and posted, then the Worker's tick applied
    const b = inputFor(tick, driven), dp = own(driven).input;
    Object.assign(dp, { throttle: b.throttle, steer: b.steer, brake: b.brake, fire: b.fire, shellSlot: 0, aimLocked: false });
    dp.aimPoint.set(...b.aim);
    if (tick === perturbAt) dp.aimPoint.x += 1e-6;
    driver.postInput();
    if (tick > 1) core.stepOnce();
    let applied = 0;
    driver.advance(() => { applied++; });
    assert.equal(applied, 1, `one tick applied at tick ${tick}`);
    clock += 1000 / 60;
    if (stepped.timeS !== driven.timeS) { divergence = { tick, field: 'timeS' }; break; }
    if (stepped.shells.length !== driven.shells.length) { divergence = { tick, field: `shells ${stepped.shells.length} != ${driven.shells.length}` }; break; }
    shotsSeen = Math.max(shotsSeen, stepped.shells.length);
    for (let index = 0; index < stepped.shells.length && !divergence; index++) {
      const s = stepped.shells[index], d = driven.shells[index];
      if (s.id !== d.id || !s.pos.equals(d.pos) || !s.vel.equals(d.vel) || s.dead !== d.dead) divergence = { tick, field: `shell ${s.id}` };
    }
    // every hull's leaves by path (an object the mirror built on the page may hold its keys in another order)
    const left = leavesOf(stepped), right = leavesOf(driven);
    for (let hull = 0; hull < left.length && !divergence; hull++) {
      const l = left[hull], r = right[hull];
      const rightByPath = new Map(pathsOf(r).map((path, index) => [path, r.values[index]]));
      const leftPaths = pathsOf(l);
      if (l.id !== r.id || l.count !== r.count || leftPaths.some((path) => !rightByPath.has(path))) {
        const lp = new Set(leftPaths);
        divergence = { tick, field: `${l.id} shape ${l.count} != ${r.count}`, onlyStepped: leftPaths.filter((path) => !rightByPath.has(path)),
          onlyDriven: [...rightByPath.keys()].filter((path) => !lp.has(path)) };
        break;
      }
      for (let index = 0; index < l.count; index++) {
        const driven = rightByPath.get(leftPaths[index]);
        if (!Object.is(l.values[index], driven)) { divergence = { tick, field: leftPaths[index], stepped: l.values[index], driven }; break; }
      }
    }
    if (String(stepped.result) !== String(driven.result)) divergence = { tick, field: 'result' };
  }
  const exercised = { shotsSeen, hits: hitsSeen, hpOwn: own(driven).combat.hp, destroyed: driven.tanks.filter((entity) => entity.combat.destroyed).length,
    stats: { ...driver.stats } };
  driver.end();
  core.dispose();
  return { divergence, exercised };
}

const same = await run(1200);
assert.equal(same.divergence, null, `the driven page parts from the stepped page at ${JSON.stringify(same.divergence)}`);
assert.ok(same.exercised.shotsSeen > 0 && same.exercised.hits > 0, `shots flew and struck (${JSON.stringify(same.exercised)})`);
const perturbed = await run(260, 200);
assert.ok(perturbed.divergence, 'a micrometre on the Worker\'s aim is found');
assert.ok(perturbed.divergence.tick >= 200 && perturbed.divergence.tick <= 202, `found at its tick (${JSON.stringify(perturbed.divergence)})`);
console.log(`localSimDriver.selftest: the Worker-driven page is the stepped page bit for bit over 1,200 ticks (${JSON.stringify(same.exercised)}); `
  + `a micrometre on the Worker's aim point found at tick ${perturbed.divergence.tick} (${perturbed.divergence.field})`);
