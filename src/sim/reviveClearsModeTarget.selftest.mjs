// A revived bot takes the next mode route push (gameplay-modes-228, study-bots 1 and 5b.2). Nothing cleared a bot's last
// pushed destination (_modeTargetX/Z) when it respawned, so a respawned bot whose destination had not moved past the
// push threshold kept its pre-death waypoints until a replan. Since round 2 the mode controller's own revive clears it,
// before either builder's revive hook runs (the solo battle's and the network authority's), so one place serves both:
// pinned here on the controller, headless (round 2, the critic's E14: this receipt was a 36 s authority match and a
// source regex for the solo half).
import assert from 'node:assert/strict';
import { createMatchModeController } from './matchModes.ts';
import { matchRulesetFor } from './matchRuleset.ts';

const tank = (id, team, x, z) => ({ id, team, bot: true, state: { pos: { x, y: 0, z }, yaw: 0, speed: 0 },
  combat: { hp: 100, maxHp: 100, destroyed: false, ammo: [20], ammoCapacity: [20] } });
const alpha = [tank('a0', 'alpha', 0, -300), tank('a1', 'alpha', 20, -300)];
const bravo = [tank('b0', 'bravo', 0, 300), tank('b1', 'bravo', 20, 300)];
let revives = 0, clearedBeforeHook = 0;
const mode = createMatchModeController({ mode: 'capture_the_flag', entities: [...alpha, ...bravo], seed: 4, terrainHeight: () => 0,
  setActive(t, a) { t.modeActive = a; },
  revive(t, s) { revives++; if (t._modeTargetX === undefined && t._modeTargetZ === undefined) clearedBeforeHook++; Object.assign(t.state.pos, { x: s.x, z: s.z }); t.combat.destroyed = false; } });
const bot = bravo[0];
bot._modeTargetX = 12; bot._modeTargetZ = -40; // the last push's stamp
bot.combat.destroyed = true;
let t = 0;
for (let i = 0; i < 20 && bot.combat.destroyed; i++) mode.step(1 / 60, t += 0.5);
assert.equal(bot.combat.destroyed, false, `the bot respawns after ${matchRulesetFor('capture_the_flag').respawnS} s`);
assert.ok(revives >= 1 && clearedBeforeHook === revives, 'the controller clears the pushed destination before the builder\'s revive hook');
assert.equal(bot._modeTargetX, undefined); assert.equal(bot._modeTargetZ, undefined);
console.log('reviveClearsModeTarget.selftest: the controller clears a revived bot\'s pushed destination for both builders');
