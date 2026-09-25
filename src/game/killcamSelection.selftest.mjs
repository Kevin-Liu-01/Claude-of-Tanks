// Battle endings (owner 2026-09-25: "for the final kill in a battle, in regular it just ends instead of showing
// a final kill cam"): the end-of-battle replay selection over every captured chain — the player's kill, an
// ally's kill, a bot's kill, a ram death, a fire death and a battle with no lethal event at all — for victory,
// defeat and draw, with the player's own death still preferred when it is what just happened.
import assert from 'node:assert/strict';
import {
  selectResultReplay, VICTORY_WINDOW_S, FINAL_KILL_WINDOW_S, PLAYER_DEATH_PRIORITY_S,
} from './killcamSelection.ts';

const snap = (label, timeS, extra = {}) => ({ label, timeS, ...extra });
const base = (over = {}) => ({
  result: 'victory', timeS: 100, finalKill: true, playerId: 'me',
  pendingDeath: null, lastHitOnPlayer: null, pendingVictory: null, lastLethal: null, lastDestroyed: null,
  lastHitOn: () => null, timeOf: (s) => s.timeS,
  ...over,
});
const pick = (over) => selectResultReplay(base(over));
const label = (selection) => selection && `${selection.source}:${selection.kind}:${selection.snap.label}${selection.xrayOnly ? ':xray' : ''}`;

assert.equal(VICTORY_WINDOW_S, 1, 'the player final-blow freshness window is unchanged from killcam_endscreen r1');
assert.equal(FINAL_KILL_WINDOW_S, 1);
assert.equal(PLAYER_DEATH_PRIORITY_S, 6);

// player kill: the existing victory replay, exactly as before, when the blow is fresh
assert.equal(label(pick({ pendingVictory: snap('mine', 99.8), lastLethal: snap('mine', 99.8) })),
  'playerKill:victory:mine', 'a fresh own final blow keeps the victory replay');
assert.equal(label(pick({ pendingVictory: snap('mine', 99.8), finalKill: false })),
  'playerKill:victory:mine', 'the victory replay never needed the final-kill request');
assert.equal(pick({ pendingVictory: snap('old', 90), finalKill: false }), null,
  'a stale own kill plays nothing without the final-kill request (existing behaviour)');

// ally kill: the last lethal chain whoever fired, from the shooter's side, for a victory
assert.equal(label(pick({ pendingVictory: snap('old', 90), lastLethal: snap('ally', 100) })),
  'finalKill:final:ally', 'an ally\'s battle-deciding kill replays as the final blow');
assert.equal(label(pick({ lastLethal: snap('ally', 100 - FINAL_KILL_WINDOW_S) })),
  'finalKill:final:ally', 'the final-kill window is inclusive');
assert.equal(pick({ lastLethal: snap('ally', 98.9) }), null,
  'a lethal chain older than the window did not decide this verdict');

// bot kill: an enemy's kill on the last ally decides a defeat while the player died long ago
assert.equal(label(pick({ result: 'defeat', pendingDeath: snap('myDeath', 40), lastLethal: snap('bot', 100) })),
  'finalKill:final:bot', 'a stale own death yields to the kill that decided the defeat');
assert.equal(label(pick({ result: 'defeat', pendingDeath: snap('myDeath', 40), lastLethal: snap('bot', 100), finalKill: false })),
  'playerDeath:death:myDeath', 'without the final-kill request the own death replays as before');
assert.equal(label(pick({ result: 'defeat', pendingDeath: snap('myDeath', 96), lastLethal: snap('bot', 100) })),
  'playerDeath:death:myDeath', 'an own death within the priority window is still the player\'s story');
assert.equal(label(pick({ result: 'defeat', pendingDeath: snap('myDeath', 40), lastLethal: snap('bot', 90) })),
  'playerDeath:death:myDeath', 'no fresh final kill: the stale own death is the last resort');

// ram death: the collision snapshot is the last lethal chain (the killcam records lethal rams between any pair)
assert.equal(label(pick({ lastLethal: snap('ram', 100, { replayKind: 'collision' }) })),
  'finalKill:final:ram', 'a bot-on-bot ram that decided the battle replays as the final blow');
assert.equal(label(pick({ result: 'defeat', pendingDeath: snap('rammedMe', 100, { replayKind: 'collision' }) })),
  'playerDeath:death:rammedMe', 'the player\'s own fatal ram keeps the death view');

// fire death: no lethal shell — the x-ray of the shell that lit the burn-out, looked up by the victim
const lit = new Map([['b7', snap('litB7', 88)], ['me', snap('litMe', 91)]]);
assert.equal(label(pick({
  lastLethal: snap('older', 70), lastDestroyed: { id: 'b7', cause: 'fire', timeS: 100, killerId: 'a2' },
  lastHitOn: (id) => lit.get(id) ?? null,
})), 'finalBurnOut:final:litB7:xray', 'a burn-out that decided the battle shows the shell that lit it');
assert.equal(pick({
  lastDestroyed: { id: 'b7', cause: 'fire', timeS: 100, killerId: null }, lastHitOn: () => null,
}), null, 'a burn-out without any recorded hit has nothing to replay');
assert.equal(label(pick({
  result: 'defeat', lastHitOnPlayer: snap('litMe', 91), lastDestroyed: { id: 'me', cause: 'fire', timeS: 100, killerId: 'e1' },
  lastLethal: snap('older', 70), lastHitOn: (id) => lit.get(id) ?? null,
})), 'playerBurnOut:death:litMe:xray', 'the player\'s own burn-out keeps the death view (x-ray only)');
assert.equal(label(pick({ result: 'defeat', lastHitOnPlayer: snap('litMe', 91), finalKill: false })),
  'playerBurnOut:death:litMe:xray', 'the existing fire-death fallback is untouched');

// draw: a fresh own death, else the final kill whoever fired it; never the player-kill victory framing
assert.equal(label(pick({ result: 'draw', pendingDeath: snap('myDeath', 99.5), lastLethal: snap('other', 100) })),
  'playerDeath:death:myDeath', 'a draw decided as the player fell keeps the death replay');
assert.equal(label(pick({ result: 'draw', pendingVictory: snap('mine', 100), lastLethal: snap('mine', 100) })),
  'finalKill:final:mine', 'a draw never frames the own kill as a victory');
assert.equal(pick({ result: 'draw', finalKill: false }), null, 'a draw with nothing captured plays nothing');

// the own death already replayed mid-battle: never the same death twice — the final kill or nothing
assert.equal(label(pick({ result: 'defeat', pendingDeath: snap('myDeath', 99), lastLethal: snap('bot', 100), allowOwnDeath: false })),
  'finalKill:final:bot', 'a replayed own death yields to the kill that decided the defeat');
assert.equal(pick({ result: 'defeat', pendingDeath: snap('myDeath', 99), lastHitOnPlayer: snap('lit', 90), allowOwnDeath: false }), null,
  'a replayed own death is not replayed again even as a burn-out x-ray');

// no event: nothing captured → no replay (the director falls back to a camera beat)
assert.equal(pick({}), null);
assert.equal(pick({ result: 'defeat' }), null);
assert.equal(pick({ lastDestroyed: { id: 'x', cause: 'ram', timeS: 100, killerId: 'y' } }), null,
  'a destruction without any captured chain plays nothing');

console.log('killcamSelection.selftest: player kill, ally kill, bot kill, ram death, fire death, draw and no-event selections pass');
