// The dev battle hold's edges on the page's own battle (round 8 Y1 s2-05; game/devBattleHold.ts stepBattleHold and
// undoHeldDamage). The hold froze the bots without parking them and let them go without a resume, so a bot hurt while it
// stood booked a burst at the release; and the undo gave the player's modules and fire back without a word, so the HUD's
// module states and the fire alarm stayed on. Seeded Verdant battles seated by the page's setupBattle (the staged
// roster, two hostiles on the player's flank, as devBattleHold.selftest seats them):
// - a battle begun armed parks every bot's brain at its first step and the release resumes each before its first update
//   back, and a bot the player's round hurt while it stood books no burst at the release;
// - held throughout, a volley into the player's flank makes a module worse inside one held step (a track goes yellow,
//   then red) and heavy rounds into its rear light a fire: the undo answers each in the step that made it (module:state
//   source 'hold', never a repair; tank:fire burning false), so the last word on every module and on the fire is the hull's.
// The owner's edge table and the undo's events on stand-ins stay in devBattleHold.selftest (default tier); these battles
// cost a page import, a world and a fleet: MANUAL suite 'sims' (tools/selftest-tiers.mjs).
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { createBus, createCollider, createGameState, setupBattle, simStep } from './state.ts';
import { createShell } from '../sim/ballistics.ts';
import { spawnTanks } from './rosterState.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { TANK_IDS } from '../vehicles/specs.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

// the staged roster (random: false) and the player's tank, their combat anatomy only: no vehicle builders
await ensureAuthorityFleet([...TANK_IDS, 'leo2a4']);
const visualFor = (entity) => ({ root: new Group(), setVisible() {}, syncFromState() {}, dispose() {}, recoilKick() {}, setDestroyed() {},
  gunMuzzleWorld: (out) => out.copy(entity.state.pos).setY(entity.state.pos.y + 2), gunDirWorld: (out) => out.set(0, 0, 1),
  gunPivotWorld: (out) => out.copy(entity.state.pos) });
const _from = new Vector3(), _toward = new Vector3();

/** `count` rounds of `shell` from `shooter`, 8-9 m off `target` at `bearing` (radians off its yaw), toward its middle. */
function volley(game, world, shooter, target, shell, bearing, count, rangeM = 8, heightF = 0.45) {
  const dir = target.state.yaw + bearing, midY = target.state.pos.y + target.spec.dims.heightM * heightF;
  const x = target.state.pos.x + rangeM * Math.sin(dir), z = target.state.pos.z + rangeM * Math.cos(dir);
  _from.set(x, Math.max(midY, world.heightField.getHeightAt(x, z) + 0.6), z);
  _toward.set(target.state.pos.x, midY, target.state.pos.z).sub(_from).normalize();
  for (let n = 0; n < count; n++) game.shells.push(createShell(shell, shooter.id, shooter === game.player, _from, _toward, game.nextShellId++));
}

/** A Verdant battle stepped `ticks` ticks: `hold(tick)` sets the switch before that tick's step (undefined leaves it). */
function battle(ticks, { hold, onSetup = null, onTick = null, onEvent = null }) {
  const world = createDedicatedWorldCollision('verdant');
  const authored = world.heightField._layout.spawns;
  const spawnOf = (p) => ({ pos: [p.x, world.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
  world.spawnPoints = { player: spawnOf(authored.player), enemies: authored.enemies.map(spawnOf) };
  const game = createGameState({ rosterSeed: 3 });
  game.mapId = 'verdant';
  spawnTanks(game, { scene: { remove() {} } });
  for (const e of game.allTanks) e.visual = visualFor(e);
  game.battleCount = 1;
  setupBattle(game, 'leo2a4', world, { gameMode: 'standard', random: false, brain: null, deferVisuals: true, deferCamoRepaint: true });
  for (const e of game.allTanks) e.visual = visualFor(e);
  game.preBattleS = 0;
  const player = game.player;
  // two hostiles 110 m off the player's flank, facing it
  const side = player.state.yaw + Math.PI / 2;
  for (const [index, foe] of game.tanks.filter((e) => e.team === 'enemy').slice(0, 2).entries()) {
    const x = player.state.pos.x + 110 * Math.sin(side) + index * 14 * Math.cos(side);
    const z = player.state.pos.z + 110 * Math.cos(side) - index * 14 * Math.sin(side);
    foe.state.pos.set(x, world.heightField.getHeightAt(x, z) + 0.2, z);
    foe.state.yaw = side + Math.PI;
    foe.state.speed = 0;
  }
  onSetup?.(game);
  const bus = createBus(onEvent ? (event, payload) => onEvent(event, payload, game) : () => {});
  const collider = createCollider(game, world);
  try {
    for (let tick = 1; tick <= ticks; tick++) {
      const set = hold(tick);
      if (set !== undefined) game.devBattleHold = set;
      onTick?.(tick, game, world);
      simStep(game, bus, world, null, collider);
    }
    return { game };
  } finally {
    world.release?.();
  }
}

// ---- the hold's edges: the brains park when it holds and resume when it lets go ----------------------------------------
// A battle begun armed, released at tick 200; every bot's controller watched (its park, resume and update, by tick); a
// round of the player's into the nearest hostile's flank at tick 60, while it stands
const RELEASE_AT = 200, BOT_STRIKE_AT = 60;
let edgeCalls = null, struck = null, struckHpBefore = 0, struckBurstAfter = null;
battle(RELEASE_AT + 2, {
  hold: (tick) => (tick === 1 ? true : tick === RELEASE_AT ? false : undefined),
  onSetup: (game) => {
    edgeCalls = new Map();
    for (const entity of game.tanks) {
      if (!entity.aiCtl) continue;
      const calls = [];
      edgeCalls.set(entity.id, calls);
      const brain = entity.aiCtl;
      entity.aiCtl = new Proxy(brain, { get(target, key) {
        const value = Reflect.get(target, key);
        if (typeof value !== 'function') return value;
        if (key === 'park' || key === 'resume' || key === 'update') return (...args) => { calls.push(`${key}@${Math.round(game.timeS * 60)}`); return value.apply(target, args); };
        return value.bind(target);
      } });
    }
  },
  onTick: (tick, game, world) => {
    if (tick === BOT_STRIKE_AT) {
      const player = game.player;
      struck = game.tanks.filter((e) => e.team === 'enemy').sort((a, b) => a.state.pos.distanceTo(player.state.pos) - b.state.pos.distanceTo(player.state.pos))[0];
      struckHpBefore = struck.combat.hp;
      volley(game, world, player, struck, player.spec.gun.shells[0], Math.PI / 2, 1);
    }
    // the first update back is this tick's (the release ran at its start); its burst is read after it, at the next tick
    if (tick === RELEASE_AT + 1) struckBurstAfter = struck.aiCtl.debugInfo().burstDamage;
  },
});
assert.ok(edgeCalls.size >= 5, `the battle's bots are watched (${edgeCalls.size})`);
assert.ok(struck && struck.combat.hp < struckHpBefore, `the player's round hurt the standing bot (${struckHpBefore} -> ${struck?.combat.hp})`);
for (const [id, calls] of edgeCalls) {
  // a step's tick is its clock (simStep advances it first): the battle's first step is tick 1
  const parks = calls.filter((call) => call.startsWith('park')), resumes = calls.filter((call) => call.startsWith('resume'));
  assert.deepEqual(parks, ['park@1'], `${id}: its brain parks once, at the battle's first (held) step (${calls.slice(0, 4)})`);
  assert.deepEqual(resumes, [`resume@${RELEASE_AT}`], `${id}: and resumes once, at the release (${calls.slice(0, 4)})`);
  assert.equal(calls.indexOf(resumes[0]), 1, `${id}: never updated while it stood, resumed before its first update back (${calls.slice(0, 4)})`);
  assert.equal(calls[2], `update@${RELEASE_AT}`, `${id}: its first update is the release step's`);
}
assert.equal(struckBurstAfter, 0, `the hull the bot lost while it stood books no burst at the release (${struckBurstAfter})`);

// ---- the undo answers what the held step said: a module made worse, and a fire, held throughout --------------------------
{
  const said = [];
  const FLANK_AT = 40, BURN_FROM = 60, BURN_TO = 120;
  const run = battle(BURN_TO + 20, {
    hold: (tick) => (tick === 1 ? true : undefined),
    onTick: (tick, game, world) => {
      const player = game.player, foe = game.tanks.find((e) => e.team === 'enemy');
      // a volley of the field's heaviest kinetic round into the flank, in one step: a track yellow, then red, in that step
      if (tick === FLANK_AT) {
        const kinetic = game.tanks.flatMap((e) => e.spec.gun.shells).filter((shell) => shell.type === 'APFSDS')
          .sort((a, b) => (b.dmg ?? 0) - (a.dmg ?? 0))[0];
        volley(game, world, foe, player, kinetic, Math.PI / 2, 6);
      }
      // the field's heaviest high-explosive round into the rear (the engine and its fuel) every few ticks: a fire
      if (tick >= BURN_FROM && tick <= BURN_TO && tick % 6 === 0) {
        const heavy = game.tanks.flatMap((e) => e.spec.gun.shells).filter((shell) => shell.type === 'HE')
          .sort((a, b) => (b.dmg ?? 0) - (a.dmg ?? 0))[0];
        volley(game, world, foe, player, heavy, Math.PI, 1, 9, 0.4);
      }
    },
    onEvent: (event, payload, game) => {
      if ((event === 'module:state' || event === 'tank:fire') && payload?.id === game.player?.id) said.push({ event, ...payload });
    },
  });
  const brief = JSON.stringify(said.map((entry) => [entry.module ?? 'fire', entry.state ?? entry.burning, entry.source ?? null]));
  // the preconditions, each outright: the held steps made a module worse and lit a fire, and said so
  const worse = said.filter((entry) => entry.event === 'module:state' && entry.state !== 'ok' && entry.source !== 'hold');
  assert.ok(worse.length > 0, `a held step made a module worse and said so (${brief})`);
  assert.ok(said.some((entry) => entry.event === 'tank:fire' && entry.burning === true), `a held step lit a fire and said so (${brief})`);
  // the answers: each module the undo gave back is said again with source 'hold' (never a repair), the fire is said out
  const answered = new Set(said.filter((entry) => entry.event === 'module:state' && entry.source === 'hold').map((entry) => entry.module));
  for (const entry of worse) assert.ok(answered.has(entry.module), `the undo answered ${entry.module} (${brief})`);
  const combat = run.game.player.combat;
  const lastModule = new Map();
  for (const entry of said) if (entry.event === 'module:state') lastModule.set(entry.module, entry.state);
  for (const [module, state] of lastModule) assert.equal(state, combat.modules[module].state, `the last word on ${module} is its state (${brief})`);
  const fires = said.filter((entry) => entry.event === 'tank:fire');
  assert.equal(fires.at(-1).burning, combat.fire.burning, `the last word on the fire is the fire (${brief})`);
  assert.equal(combat.fire.burning, false, 'and the held hull is not burning');
  assert.ok(said.every((entry) => entry.repaired !== true), 'nothing the undo says plays a repair');
  console.log(`devBattleHoldEdges.selftest: the brains park at the hold and resume at the release, a bot hurt while it stood books `
    + `no burst; held throughout, ${worse.length} worse module states and a fire were each answered by the undo (${[...answered].join(', ')}) PASS`);
}
process.exit(0);
