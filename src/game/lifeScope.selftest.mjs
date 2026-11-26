// lifeScope.selftest — a seat's life (life-reset-279; Kevin 2026-11-24: "if youve expended an ammo it doesnt clear the
// state once you die and respawn or even join another game. fix any kind of bugs like this with game state"). The
// battle scope ends what a battle holds at the Garage; a life is one level down: opened when the frame first sees a
// seat's hull alive, ended when it sees it down, when the seat leaves the hull or when the battle ends; a respawn or a
// room's restart the frame never saw down is a new life on its event. Pure (no DOM): the edges, the per-life resets
// (onLifeStart), the holdings a life ends, couch seats apart, and bots' revives opening no life.
import assert from 'node:assert/strict';
import { endBattleScope, openBattleScope } from './battleScope.ts';
import { attachLifeScopeEdges, endLifeScope, lifeScope, lifeScopeFrame, lifeScopeSnapshot, onLifeStart, openLifeScope }
  from './lifeScope.ts';

const listeners = new Map();
const bus = { on(type, fn) { (listeners.get(type) ?? listeners.set(type, []).get(type)).push(fn); },
  emit(type, payload) { for (const fn of listeners.get(type) ?? []) fn(payload); } };
attachLifeScopeEdges(bus);
const starts = [];
const unhook = onLifeStart((life) => starts.push(`${life.entityId}:${life.reason}`));
const hull = (id, destroyed = false) => ({ id, combat: { destroyed } });

// --- a battle: the first frame that sees the seat alive opens its life; the frame that sees it down ends it ---
openBattleScope('battle:1');
lifeScopeFrame(hull('player'));
const first = lifeScope('player');
assert.ok(first?.live, 'the first frame with the seat alive opens its life');
assert.deepEqual(starts, ['player:life:spawn'], 'the per-life resets ran once, at the spawn');
lifeScopeFrame(hull('player'));
assert.equal(lifeScope('player'), first, 'another live frame is the same life');
let fired = 0;
first.setTimeout(() => { fired++; }, 5);
let disposed = 0;
first.defer(() => { disposed++; });
lifeScopeFrame(hull('player', true), 'player');
assert.equal(first.live, false, 'the frame that sees the hull down ends the life');
assert.equal(lifeScope('player'), null, 'no life while down');
assert.equal(disposed, 1, "the life's disposers ran at its death");
assert.equal(lifeScopeSnapshot().lastEnded.player.reason, 'death');
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(fired, 0, "a life's timer never fires after its death");
assert.equal(first.setTimeout(() => {}, 1), null, 'an ended life starts no timer');

// --- the revive: the next alive frame opens the next life (a revive, not a spawn) ---
lifeScopeFrame(hull('player'), 'player');
const second = lifeScope('player');
assert.ok(second?.live && second !== first, 'the revived hull lives a new life');
assert.equal(starts.at(-1), 'player:life:revive');

// --- a revive between two frames (no dead frame): the respawn event ends the old life and opens the next ---
bus.emit('mode:respawn', { id: 'player' });
const third = lifeScope('player');
assert.ok(second.live === false && third?.live && third !== second, 'the respawn event is a new life even with no dead frame');
assert.equal(starts.at(-1), 'player:life:respawn');
lifeScopeFrame(hull('player'), 'player');
assert.equal(lifeScope('player'), third, "the next frame keeps the event's life (no double start)");

// --- a bot's revive opens no life (only seats a frame reported live) ---
bus.emit('mode:respawn', { id: 'bot-7' });
assert.equal(lifeScope('bot-7'), null, "a bot's revive opens no life");

// --- a couch split: two seats live and die apart ---
lifeScopeFrame(hull('seat2'));
const couch = lifeScope('seat2');
lifeScopeFrame(hull('seat2', true), 'seat2');
assert.ok(third.live && !couch.live, "one seat's death ends only its own life");

// --- the seat leaves the hull (Watch's drone, a takeover of another hull): that life ends ---
lifeScopeFrame(hull('bot-3'), 'player');
assert.equal(third.live, false, 'a seat that leaves its hull ends that life');
assert.equal(lifeScopeSnapshot().lastEnded.player.reason, 'seat-changed');
assert.ok(lifeScope('bot-3')?.live, 'the hull taken over lives its own life');
lifeScopeFrame(null, 'bot-3');
assert.equal(lifeScope('bot-3'), null, 'a seat with no hull lives no life');

// --- a room's restart starts every live seat's life over ---
lifeScopeFrame(hull('player'));
const beforeRestart = lifeScope('player');
bus.emit('battle:restarted', {});
assert.ok(!beforeRestart.live && lifeScope('player')?.live, "a room's restart is a new life");

// --- the battle's end ends every life; the next battle's first life is a spawn ---
const lastOfBattle = lifeScope('player');
endBattleScope('garage');
assert.equal(lastOfBattle.live, false, "the battle's end ends the life (a quit while alive)");
assert.equal(lifeScopeSnapshot().live.length, 0, 'no life outlives its battle');
bus.emit('mode:respawn', { id: 'player' });
assert.equal(lifeScope('player'), null, "a respawn event after the battle opens no life");
openBattleScope('battle:2');
lifeScopeFrame(hull('player'), 'player');
assert.equal(starts.at(-1), 'player:life:spawn', "the next battle's first life is a spawn, not a revive");
// a life ended on its own leaves nothing on the battle's scope (its unhook ran)
const counts = () => lifeScopeSnapshot().live[0].counts;
endLifeScope('player', 'test');
openLifeScope('player', 'test');
assert.deepEqual(counts(), { timers: 0, intervals: 0, frames: 0, listeners: 0, deferred: 1 }, 'a life holds only its battle unhook');
endBattleScope('garage');
unhook();

// --- Turbo's tile and the phone's key (game/turboCooldown.ts): the cooldown is the hull's across a revive (the sim's
// turboReadyS spans it on both drivers) but the battle's alone: the next battle's clock restarts at 0, and a Turbo used
// at 500 s greyed its first 500 s ---
{
  const { createBus } = await import('./stateCore.ts');
  const { createTurboCooldown } = await import('./turboCooldown.ts');
  const turboBus = createBus();
  let clock = 500;
  const turbo = createTurboCooldown(turboBus, () => 'player', () => clock);
  openBattleScope('battle:turbo');
  turboBus.emit('tank:turbo', { id: 'player', readyS: 12 });
  assert.equal(turbo.readyIn(500), 12, 'Turbo cools for 12 s');
  lifeScopeFrame(hull('player', true));
  lifeScopeFrame(hull('player'), 'player');
  assert.equal(turbo.readyIn(504), 8, "a revive keeps the hull's own cooldown");
  endBattleScope('garage');
  openBattleScope('battle:next');
  clock = 0;
  assert.equal(turbo.readyIn(0), 0, "the next battle's Turbo is ready at its start");
  turboBus.emit('tank:turbo', { id: 'player', readyS: 12 });
  turboBus.emit('battle:restarted', {});
  assert.equal(turbo.readyIn(1), 0, "a room's restart readies it too");
  endBattleScope('garage');
  turbo.dispose();
}

console.log('lifeScope.selftest: a life opens on the first live frame and ends on the down frame, a seat change or the '
  + "battle's end; a respawn or restart between frames is a new life; couch seats apart; bots open none; its timers and "
  + 'disposers end with it');
