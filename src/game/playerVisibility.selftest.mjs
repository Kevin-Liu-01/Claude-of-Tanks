// Receipt (round 8 Y3 s1-02): what the player sees is one rule (src/game/playerVisibility.ts), and the audio listener's
// runtime hands that rule to the engine with every frame. Driven on the real spotting system: an enemy a far ally lit is
// spotted team-wide (the tank:spotted event's truth) but not seen by the player's seat beyond the radio share; a network
// actor's word wins; the watch with no seat and a couch battle with seats on both sides show every hull, a couch battle
// on one side does not (round 8 amendment 4: battle-core's couch gate, stateCore.ts watchRevealsAll, is the rule's).
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { isPlayerVisible } from './playerVisibility.ts';
import { createSpottingSystem, SIGNAL_RANGE_M } from '../sim/spotting.ts';
import { createListenerPoseRuntime } from '../audio/listenerPoseRuntime.ts';

function hull(id, team, x, z) {
  return {
    id, team,
    spec: { id: 'fixture_medium', role: 'medium', dims: { heightM: 2.7 } },
    state: { pos: { x, y: 0, z }, speed: 0 },
    combat: { destroyed: false },
  };
}
const STANDARD = Object.freeze({ watch: null });

// ---- the seat's eyes and the radio share, on the real spotting system
{
  const ally = hull('ally', 'player', 0, 0);
  const enemy = hull('enemy', 'enemy', 0, 250);
  const me = hull('me', 'player', 0, -(SIGNAL_RANGE_M + 400)); // beyond the ally's radio share
  const tanks = [ally, enemy, me];
  const spotting = createSpottingSystem({ getTanks: () => tanks, raycast: null, concealers: [], rng: () => 0.5 });
  spotting.forceCheck(1);
  assert.ok(spotting.isSpotted('enemy', 'player'), 'the team has the enemy spotted (the event every seat of the side hears)');
  const game = { player: me, spotting, ruleset: STANDARD, watch: null, couch: null, phase: 'battle' };
  assert.equal(isPlayerVisible(game, enemy), false, 'beyond the radio share the player does not see what a far ally lit');
  assert.equal(isPlayerVisible(game, ally), true, 'our own side always shows');
  me.state.pos.z = -100; // inside the share now
  assert.equal(isPlayerVisible(game, enemy), true, 'within the radio share the ally\'s spot reaches the player');
  // a network actor: the authority's word, whatever the local spotting says
  assert.equal(isPlayerVisible(game, { ...enemy, networkVisible: false }), false, 'a network actor the authority hides is hidden');
  assert.equal(isPlayerVisible(game, { id: 'far', team: 'enemy', networkVisible: true }), true, 'a network actor it sends is seen');
}

// ---- every hull shows: the watch with no seat; a couch battle with seats on both sides (amendment 4)
{
  const unspotted = { isSpotted: () => false };
  const enemy = { id: 'e', team: 'enemy' };
  const watch = { player: null, spotting: unspotted, ruleset: { watch: { revealAll: true } }, watch: { opened: true }, couch: null, phase: 'battle' };
  assert.equal(isPlayerVisible(watch, enemy), true, 'a watched battle with no seat shows every hull');
  const seat = { id: 'p1', team: 'player', state: { pos: { x: 0, z: 0 } } };
  const couch = (sides) => ({ player: seat, spotting: unspotted, ruleset: { watch: null, couch: { seats: 4 } }, watch: null, couch: { sides },
    phase: 'battle' });
  assert.equal(isPlayerVisible(couch('teams'), enemy), true, 'a couch battle with seats on both sides shares one screen: every hull shows');
  assert.equal(isPlayerVisible(couch('together'), enemy), false, 'a couch battle on one side sees as its side does');
  assert.equal(isPlayerVisible({ ...couch('teams'), couch: null }, enemy), false, 'no couch session: the side\'s eyes again');
}

// ---- the listener's runtime hands the one rule to the engine, made once, read on the live game
{
  const camera = new PerspectiveCamera();
  camera.updateMatrixWorld(true);
  const me = { id: 'me', team: 'player', state: { pos: new Vector3(0, 0, 0) }, spec: { dims: { heightM: 2.5 } } };
  const enemy = { id: 'enemy', team: 'enemy', state: { pos: new Vector3(0, 0, 300) } };
  let lit = false;
  const game = {
    player: me, tanks: [me, enemy], tankById: new Map([['me', me], ['enemy', enemy]]), shells: [],
    spotting: { isSpotted: (id, team, receiver) => id === 'enemy' && team === 'player' && receiver === me && lit },
    ruleset: STANDARD, watch: null, couch: null, phase: 'battle',
  };
  const handed = [];
  const runtime = createListenerPoseRuntime({
    camera, game, rig: { mode: 'ARCADE' }, killcam: { isActive: () => false, spectate: { active: false, targetId: null } },
    audio: { update(dt, pose, tanks, shells, visible) { handed.push({ tanks, visible, seen: tanks.map((t) => visible?.(t)) }); } },
  });
  runtime.update(1 / 60, true, false);
  lit = true;
  runtime.update(1 / 60, true, false);
  assert.equal(typeof handed[0].visible, 'function', 'the engine is handed what the player sees');
  assert.equal(handed[0].visible, handed[1].visible, 'one predicate, made once (no allocation per frame)');
  assert.deepEqual(handed.map((h) => h.seen), [[true, false], [true, true]], 'it reads the live game: the enemy shows once the seat sees it');
}

console.log('playerVisibility.selftest: the seat\'s eyes and the radio share on the real spotting, the network\'s word, the watch and couch reveals, and the listener handing the one rule to the engine passed');
