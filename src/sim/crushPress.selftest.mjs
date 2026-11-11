// 2026-11-02 audit M6, crush press: the press a hull's tracks put on a crushable record (physics DST-02: 0.45 s of contact
// under throttle or steer fells it) is this battle's, per hull and record (sim/crushPress.ts). It lived on the world's
// collision records (`_pressT` / `_pressS`), which a cached world reuses across battles while each battle's clock restarts
// at 0: the gap reset never fired, so a prop pressed in one battle fell after a tick or two in the next on the same map.
// Here, on both drivers: a hull turning on the spot into a bench (the authority receipt's DST-02 fixture) presses it for
// part of the fell time, the battle ends, and a second battle on the SAME records fells it exactly when a fresh one does;
// and the ledger alone: the count, the gap, one count per hull, once per tick.
import assert from 'node:assert/strict';
import { Group } from 'three';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { CRUSH_PRESS_GAP_S, CRUSH_PRESS_S, createCrushPressLedger } from './crushPress.ts';
import { createBus, createCollider, createGameState, setupBattle, simStep } from '../game/state.ts';
import { spawnTanks } from '../game/rosterState.ts';
import { ensureFullFleet } from '../vehicles/fleetFactory.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

const DT = 1 / 60;

// ---- the ledger ---------------------------------------------------------------------------------------------------
{
  const ledger = createCrushPressLedger();
  const bench = {}, crate = {};
  // (the count sums whole steps: 27 of them come to 0.4499…, so the 28th fells it, as the drivers always did)
  let fellTicks = 0;
  for (let sum = 0; sum < CRUSH_PRESS_S; fellTicks++) sum += DT;
  let fell = -1;
  for (let tick = 1; tick <= 60 && fell < 0; tick++) if (ledger.press(bench, 'a', tick * DT, DT)) fell = tick;
  assert.equal(fell, fellTicks, `one hull fells a record after ${CRUSH_PRESS_S} s of press (${fellTicks} steps)`);
  // a second call on the same tick (two sweeps of one hull) adds nothing
  const twice = createCrushPressLedger();
  let fellTwice = -1;
  for (let tick = 1; tick <= 60 && fellTwice < 0; tick++) {
    twice.press(bench, 'a', tick * DT, DT);
    if (twice.press(bench, 'a', tick * DT, DT)) fellTwice = tick;
  }
  assert.equal(fellTwice, fellTicks, 'the count is per tick, not per call');
  // two hulls on one record each count their own press
  const pair = createCrushPressLedger();
  let fellPair = -1;
  for (let tick = 1; tick <= 60 && fellPair < 0; tick++) {
    const a = pair.press(crate, 'a', tick * DT, DT), b = pair.press(crate, 'b', tick * DT, DT);
    if (a || b) fellPair = tick;
  }
  assert.equal(fellPair, fellTicks, 'two hulls pressing one record do not run it at twice the rate');
  // a gap longer than CRUSH_PRESS_GAP_S starts the count again
  const gap = createCrushPressLedger();
  for (let tick = 1; tick <= fellTicks - 2; tick++) gap.press(bench, 'a', tick * DT, DT);
  const after = (fellTicks - 2) * DT + CRUSH_PRESS_GAP_S + 2 * DT;
  assert.equal(gap.press(bench, 'a', after, DT), false, 'after the gap the press starts again');
  assert.equal(gap.press(bench, 'a', after + DT, DT), false);
  // a clock that ran backwards (a new battle on the same ledger) never inherits the count
  assert.equal(gap.press(bench, 'a', DT, DT), false, 'an earlier time starts the count again');
  gap.clear();
  assert.equal(gap.size, 0, 'clear forgets every press');
}

// ---- the authority: a second match on the same records -------------------------------------------------------------
const pivotBenches = () => [1, -1].map((side, index) => ({
  min: [side > 0 ? 1.95 : -2.55, -100, -47.4], max: [side > 0 ? 2.55 : -1.95, 100, -46.4], kind: 'bench', crushable: true,
  propIdx: 60 + index, shape2: { kind: 'obb', cx: side * 2.25, cz: -46.9, hw: 0.3, hl: 0.5, yaw: 0 } }));
function pivotMatch(benches) {
  const world = {
    mapId: 'verdant',
    getObstacles: () => benches,
    queryObstacles: (minX, minZ, maxX, maxZ, out) => {
      out.length = 0;
      for (const r of benches) if (!r.crushed && r.max[0] >= minX && r.min[0] <= maxX && r.max[2] >= minZ && r.min[2] <= maxZ) out.push(r);
      return out;
    },
    raycast: () => null,
    crushObstacle(obstacle) { obstacle.crushed = true; return true; },
  };
  const match = createAuthoritativeMatch({ mapId: 'verdant', countdownS: 0, worldCollision: world, players: [
    { id: 'pivot-a', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: 0, z: -50, yaw: 0 } },
    { id: 'pivot-b', specId: 'm1a1_abrams_hc', team: 'bravo', spawn: { x: 0, z: 50, yaw: Math.PI } },
  ] });
  match.onMatchReady();
  return match;
}
const pivot = new Map([['pivot-a', { throttle: 0, steer: 1, brake: false, fire: false, aimYaw: 0, aimPitch: 0, shellSlot: 0 }]]);
/** Ticks until a bench falls (stepping at most `limit`), or -1. */
function ticksToFell(match, benches, limit) {
  for (let tick = 1; tick <= limit; tick++) {
    match.step({ dt: DT, inputs: pivot });
    if (benches.some((bench) => bench.crushed)) return tick;
  }
  return -1;
}
let authorityFresh;
{
  const fresh = pivotBenches();
  authorityFresh = ticksToFell(pivotMatch(fresh), fresh, 120);
  assert.ok(authorityFresh > 20, `the turning hull fells a bench through the press (tick ${authorityFresh})`);
  const reused = pivotBenches();
  // the first battle presses the bench most of the way, then ends; the world (its records) is reused
  assert.equal(ticksToFell(pivotMatch(reused), reused, authorityFresh - 6), -1, 'the first battle stops short of the fell');
  assert.ok(reused.every((bench) => !bench.crushed));
  const second = ticksToFell(pivotMatch(reused), reused, 120);
  assert.equal(second, authorityFresh,
    `the authority: a second match on the same records fells the bench when a fresh one does (tick ${second}, fresh ${authorityFresh})`);
  for (const bench of reused) assert.ok(!('_pressS' in bench) && !('_pressT' in bench), 'no press state on the world\'s records');
}

// ---- the solo step: a second battle on the same world ------------------------------------------------------------
await ensureFullFleet();
const MAP = 'verdant';
const pageWorld = createDedicatedWorldCollision(MAP);
{
  const authored = pageWorld.heightField._layout.spawns;
  const spawnOf = (point) => ({ pos: [point.x, pageWorld.heightField.getHeightAt(point.x, point.z), point.z], yaw: point.yaw ?? 0 });
  pageWorld.spawnPoints = { player: spawnOf(authored.player), enemies: authored.enemies.map(spawnOf) };
}
// the benches stand off the player's front corners (the authority fixture's placement, in the hull's frame); `keep` moves
// the same two records to this battle's spawn (the deployment slot moves a little from battle to battle) — the records,
// and whatever a battle left on them, are what a cached world carries into the next
const soloBenches = [];
const baseQuery = pageWorld.queryObstacles.bind(pageWorld);
pageWorld.queryObstacles = (minX, minZ, maxX, maxZ, out) => {
  baseQuery(minX, minZ, maxX, maxZ, out);
  for (const r of soloBenches) if (!r.crushed && r.max[0] >= minX && r.min[0] <= maxX && r.max[2] >= minZ && r.min[2] <= maxZ) out.push(r);
  return out;
};
function plantBenches(state, keep) {
  const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw), rx = fz, rz = -fx;
  if (!keep) soloBenches.length = 0;
  for (const [index, side] of [1, -1].entries()) {
    const cx = state.pos.x + rx * side * 2.25 + fx * 3.1, cz = state.pos.z + rz * side * 2.25 + fz * 3.1;
    const record = soloBenches[index] ?? (soloBenches[index] = { kind: 'bench', crushable: true, propIdx: 9000 + index });
    record.min = [cx - 0.6, -1000, cz - 0.6];
    record.max = [cx + 0.6, 1000, cz + 0.6];
    record.shape2 = { kind: 'obb', cx, cz, hw: 0.3, hl: 0.5, yaw: state.yaw };
  }
}
const game = createGameState({ rosterSeed: 3 });
game.mapId = MAP;
spawnTanks(game, { scene: { remove() {} } });
const bus = createBus(() => {});
/**
 * One solo battle on the shared world: the player turns on the spot; ticks until a bench falls (at most `limit`), or -1.
 * `plant` stands a fresh pair of benches, else the last battle's records are met again.
 */
function soloBattle(limit, plant) {
  for (const entity of game.allTanks) entity.visual = { root: new Group(), setVisible() {}, syncFromState() {}, dispose() {}, resetDestroyed() {} };
  setupBattle(game, 'm1a1_abrams_hc', pageWorld, { gameMode: 'standard', random: true, brain: null, deferVisuals: true,
    deferCamoRepaint: true, deferOpeningRoutes: true });
  const own = game.tanks.find((entity) => entity.isPlayer), foe = game.tanks.find((entity) => entity.team === 'enemy');
  game.tanks = [own, foe];
  game.tankById = new Map([[own.id, own], [foe.id, foe]]);
  foe.aiCtl = null;
  foe.ai = null;
  foe.state.pos.set(own.state.pos.x + 300 * Math.sin(own.state.yaw), own.state.pos.y, own.state.pos.z + 300 * Math.cos(own.state.yaw));
  plantBenches(own.state, !plant);
  const collider = createCollider(game, pageWorld);
  for (let tick = 1; tick <= limit; tick++) {
    Object.assign(own.input, { throttle: 0, steer: 1, brake: false, fire: false });
    simStep(game, bus, pageWorld, null, collider);
    if (soloBenches.some((bench) => bench.crushed)) return tick;
  }
  return -1;
}
const soloFresh = soloBattle(120, true);
assert.ok(soloFresh > 20, `the solo step: the turning hull fells a bench through the press (tick ${soloFresh})`);
{
  // a fresh pair at the same spot: battle 1 presses it most of the way and ends, battle 2 meets it on the same world
  const first = soloBattle(soloFresh - 6, true);
  assert.equal(first, -1, 'the first solo battle stops short of the fell');
  const benches = soloBenches.slice();
  assert.ok(benches.every((bench) => !bench.crushed));
  const second = soloBattle(120, false);
  assert.ok(soloBenches.every((bench, index) => bench === benches[index]), 'the second battle meets the same records');
  assert.equal(second, soloFresh,
    `the solo step: a second battle on the same world fells the bench when a fresh one does (tick ${second}, fresh ${soloFresh})`);
  for (const bench of benches) assert.ok(!('_pressS' in bench) && !('_pressT' in bench), 'no press state on the world\'s records');
}
pageWorld.release?.();

console.log(`crushPress.selftest: the press is the battle's, per hull and record — a bench pressed ${(authorityFresh - 6)} ticks in one `
  + `battle falls on tick ${authorityFresh} of the next on the same records (the authority) and on tick ${soloFresh} (the solo step), `
  + `as a fresh one does; one count per hull, once per tick, reset by a ${CRUSH_PRESS_GAP_S} s gap`);
