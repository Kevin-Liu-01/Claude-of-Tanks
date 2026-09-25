// Battle endings (owner 2026-09-25): the report's final-blow line resolves from the resolved events the
// shot-info ledger already holds — the last lethal shell:hit and the last tank:destroyed — for a shot, an
// ammo-rack kill, a ram and a burn-out, from the player's side, on the player, and between two other tanks.
import assert from 'node:assert/strict';
import { resolveFinalBlow, finalBlowLine } from './finalBlow.ts';

const names = new Map([['me', 'T-90M'], ['a2', 'Leopard 2A7'], ['e1', 'M1A2'], ['e4', 'Challenger 3']]);
const nameOf = (id) => names.get(id) ?? null;
const lethal = (over = {}) => ({
  attackerId: 'a2', attackerName: 'Leopard 2A7', targetId: 'e1', targetName: 'M1A2', shellName: 'DM63', shellType: 'APFSDS', ...over,
});

assert.equal(resolveFinalBlow(lethal(), null, 'me', nameOf), null, 'no destruction: no final blow');

// an ally's shell decided the battle
const ally = resolveFinalBlow(lethal(), { id: 'e1', killerId: 'a2', cause: 'shot' }, 'me', nameOf);
assert.deepEqual(ally, { cause: 'shot', attacker: 'Leopard 2A7', target: 'M1A2', shell: 'DM63', attackerIsPlayer: false, targetIsPlayer: false });
assert.equal(finalBlowLine(ally), 'Final blow — Leopard 2A7 destroyed M1A2 with DM63');

// the player's own final blow
const mine = resolveFinalBlow(lethal({ attackerId: 'me', attackerName: 'T-90M', shellName: '3BM60' }), { id: 'e1', killerId: 'me', cause: 'ammorack' }, 'me', nameOf);
assert.equal(mine.cause, 'ammorack');
assert.equal(mine.attackerIsPlayer, true);
assert.equal(finalBlowLine(mine), 'Final blow — you destroyed M1A2 with 3BM60');

// the shot that ended the player
const onMe = resolveFinalBlow(lethal({ attackerId: 'e4', attackerName: 'Challenger 3', targetId: 'me', targetName: 'T-90M', shellName: 'L27A1' }),
  { id: 'me', killerId: 'e4', cause: 'shot' }, 'me', nameOf);
assert.equal(onMe.targetIsPlayer, true);
assert.equal(finalBlowLine(onMe), 'Final blow — Challenger 3 destroyed you with L27A1');

// the lethal hit belongs to another victim: the destruction's own killer names the blow, no shell claimed
const stale = resolveFinalBlow(lethal(), { id: 'e4', killerId: 'me', cause: 'shot' }, 'me', nameOf);
assert.deepEqual(stale, { cause: 'shot', attacker: 'T-90M', target: 'Challenger 3', shell: null, attackerIsPlayer: true, targetIsPlayer: false });
assert.equal(finalBlowLine(stale), 'Final blow — you destroyed Challenger 3 with enemy fire'.replace('enemy fire', 'enemy fire'),
  'an unknown shell falls back to the killcam\'s generic fire label');

// a ram: no shell, the destruction's killer is the rammer
const ram = resolveFinalBlow(lethal(), { id: 'e1', killerId: 'a2', cause: 'ram' }, 'me', nameOf);
assert.deepEqual(ram, { cause: 'ram', attacker: 'Leopard 2A7', target: 'M1A2', shell: null, attackerIsPlayer: false, targetIsPlayer: false });
assert.equal(finalBlowLine(ram), 'Final blow — Leopard 2A7 rammed M1A2');

// a burn-out: the victim alone, whoever lit it
const fire = resolveFinalBlow(lethal(), { id: 'e4', killerId: null, cause: 'fire' }, 'me', nameOf);
assert.deepEqual(fire, { cause: 'fire', attacker: null, target: 'Challenger 3', shell: null, attackerIsPlayer: false, targetIsPlayer: false });
assert.equal(finalBlowLine(fire), 'Final blow — Challenger 3 burned out');

// names the ledger never learned fall back to the event's own names, then the id; an unknown cause reads as a shot
const unnamed = resolveFinalBlow(lethal({ targetId: 'x9', targetName: 'Type 100' }), { id: 'x9', killerId: 'a2', cause: 'plasma' }, null, nameOf);
assert.deepEqual(unnamed, { cause: 'shot', attacker: 'Leopard 2A7', target: 'Type 100', shell: 'DM63', attackerIsPlayer: false, targetIsPlayer: false });
assert.equal(resolveFinalBlow(null, { id: 'z1', killerId: 'z2', cause: 'ram' }, 'me', nameOf).target, 'z1');
assert.equal(finalBlowLine(resolveFinalBlow(null, { id: 'z1', killerId: null, cause: 'shot' }, 'me', nameOf)),
  'Final blow — enemy destroyed z1 with enemy fire');

console.log('finalBlow.selftest: shot, ammo rack, ram, burn-out, player-side and fallback lines pass');
