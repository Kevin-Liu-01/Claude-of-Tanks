// A fallen bot's stage is its dead life's (gaps 274; Kevin, 2026-11-18). The mode controller's life transition owns it:
// setLife drops it at the down edge, wherever the match plays (the solo battle included), and the revived bot asks for
// its role again and stages afresh.
//
// [1] G4, Capture the Flag: a lone raider going in falls. Only a live bot's ask ran the role deal that dropped a fallen
// raider's stage, so with no other bot asking the old controller kept the dead life's stage through the revive, and the
// revived raider went in alone (held 0 s, the round 8 residual probe), against the deal's own rule. Now the stage is
// gone at the step that sees the death, with nobody asking, and the revived raider put back inside the stage waits for
// its group (raidWaitS). [2] G4: a revived bot asks for its role again: with other bots asking through its death, the
// deal it missed was dealt without it, and its first ask after the revive took the raid by default until the next deal
// up to a second later; now a bot asking with no role dealt is dealt one at once (here it guards home, nearest to it).
// [3] G5, Frontline: an attacker that fell pushing came back from the allied revive still pushing (its plan outlived its
// life: only a line advance cleared it) and drove into the live sector alone, skipping the group wait; now its plan goes
// at its death, its first ask after the revive is planned at once (not driving at the sector until the next plan), and
// back at the edge it waits pushAfterS for its group.
import { createMatchModeController } from './matchModes.ts';
import { matchRulesetFor } from './matchRuleset.ts';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };
const tank = (id, team, x, z, bot = true) => ({ id, team, bot, state: { pos: { x, y: 0, z }, yaw: 0, speed: 0 },
  combat: { hp: 1000, maxHp: 1000, destroyed: false, ammo: [20], ammoCapacity: [20] } });
const STEP_S = 0.25;
/** One controller over its hulls (the drivers' hooks: a revive stands the hull on its spot), and a clock. */
function match(mode, entities) {
  const ruleset = matchRulesetFor(mode);
  const clock = { t: 0 };
  const ctl = createMatchModeController({ mode, entities, seed: 21, terrainHeight: () => 0, ruleset,
    setActive(target, active) { target.modeActive = active; },
    revive(target, spawn) { Object.assign(target.state.pos, { x: spawn.x, z: spawn.z }); target.state.yaw = spawn.yaw ?? 0; target.combat.destroyed = false; target.combat.hp = target.combat.maxHp; } });
  return { ctl, ruleset, clock, byId: (id) => entities.find((e) => e.id === id) };
}
const kill = (e) => { e.combat.hp = 0; e.combat.destroyed = true; };
const near = (a, b) => !!a && !!b && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;

console.log('[1] G4, Capture the Flag: a lone raider that falls going in drops its stage at its death and stages afresh');
{
  const hulls = [tank('h', 'alpha', 0, -180, false), tank('a0', 'alpha', 10, -170), tank('b0', 'bravo', 0, 300)];
  const { ctl, ruleset, clock, byId } = match('capture_the_flag', hulls);
  const raider = byId('a0');
  const own = ctl.state.flags.find((f) => f.team === 'alpha'), goal = ctl.state.flags.find((f) => f.team === 'bravo');
  const dx = own.x - goal.x, dz = own.z - goal.z, length = Math.hypot(dx, dz);
  const inside = () => Object.assign(raider.state.pos, { x: goal.x + dx / length * 100, z: goal.z + dz / length * 100 });
  Object.assign(byId('h').state.pos, { x: own.x, z: own.z });
  // the raider alone asks (the human and the enemy bot never do): the hulls stand where the case puts them
  const play = (seconds, ask = true) => {
    let held = 0;
    for (const end = clock.t + seconds; clock.t < end - 1e-9;) {
      clock.t += STEP_S; ctl.step(1 / 60, clock.t);
      if (ask && raider.modeActive !== false && !raider.combat.destroyed) {
        const to = ctl.botTarget(raider);
        if (to && Math.hypot(to.x - goal.x, to.z - goal.z) > 1) held += STEP_S;
      }
    }
    return held;
  };
  const stageOf = () => ctl.captureCheckpoint(clock.t).objectives?.raids?.find(([id]) => id === 'a0')?.[1] ?? null;
  inside();
  play(ruleset.flagBots.raidWaitS + 2);
  const going = stageOf();
  ok(going?.go === true, `the case is built: the lone raider waited out its stage and goes in (${going ? `staged at ${going.atS}, go ${going.go}` : 'no stage'})`);
  kill(raider);
  play(STEP_S, false);
  ok(stageOf() === null, `the step that sees its death drops its stage, with no bot asking (${stageOf() ? `kept: go ${stageOf().go}` : 'none'})`);
  play(ruleset.respawnS + 0.5, false);
  ok(!raider.combat.destroyed && raider.modeLife === 'alive', `the case is built: it revived (${raider.modeLife})`);
  inside();
  const held = play(ruleset.flagBots.raidWaitS + 2);
  ok(held >= ruleset.flagBots.raidWaitS - STEP_S - 1e-9, `put back inside the stage, the revived raider waits for its group (held ${held.toFixed(2)} s of `
    + `the ${ruleset.flagBots.raidWaitS} s wait; it went in alone with its dead life's stage)`);
}

console.log('[2] G4: a revived bot asks for its role again, and is dealt one at once');
{
  // seven bots: a large squad (defendMinSquad 6) guards home with one; the six others far forward, so the bot nearest
  // the base is the one that revives at its spawn by it (the human is away, by the enemy flag)
  const hulls = [tank('h', 'alpha', 0, -180, false), ...Array.from({ length: 7 }, (_, i) => tank(`a${i}`, 'alpha', i * 15 - 45, -20)), tank('b0', 'bravo', 0, 300)];
  const { ctl, ruleset, clock, byId } = match('capture_the_flag', hulls);
  const bots = hulls.filter((e) => e.bot && e.team === 'alpha');
  const own = ctl.state.flags.find((f) => f.team === 'alpha'), goal = ctl.state.flags.find((f) => f.team === 'bravo');
  Object.assign(byId('h').state.pos, { x: goal.x, z: goal.z + 400 });
  const ux = (goal.x - own.x) / Math.hypot(goal.x - own.x, goal.z - own.z), uz = (goal.z - own.z) / Math.hypot(goal.x - own.x, goal.z - own.z);
  // the six others stand 150 m forward of the home flag, spread across the line
  const forward = () => bots.slice(1).forEach((bot, i) => Object.assign(bot.state.pos, { x: own.x + ux * 150 + uz * (i - 2.5) * 20, z: own.z + uz * 150 - ux * (i - 2.5) * 20 }));
  const fallen = byId('a0');
  let firstAsk = null;
  const play = (seconds) => {
    for (const end = clock.t + seconds; clock.t < end - 1e-9;) {
      const wasDown = fallen.combat.destroyed;
      forward();
      clock.t += STEP_S; ctl.step(1 / 60, clock.t);
      // every live bot asks each step, the others first (they deal the roles through its death)
      for (const bot of [...bots.slice(1), bots[0]]) if (bot.modeActive !== false && !bot.combat.destroyed) {
        const to = ctl.botTarget(bot);
        if (bot === fallen && wasDown && firstAsk === null) firstAsk = to;
      }
    }
  };
  // the deals run each second from the first ask (0.25 s, 1.25 s, ...): the death is seen at 3.5 s and the revive falls
  // at 9.5 s, between two deals, the last of them dealt without it
  play(3.25);
  kill(fallen);
  play(ruleset.respawnS + 1);
  ok(!fallen.combat.destroyed && firstAsk !== null, `the case is built: a0 fell, revived behind its flag and asked (${firstAsk?.mission ?? 'no ask'})`);
  play(1.25);
  const settled = ctl.botTarget(fallen);
  ok(settled?.mission === 'defend', `the case is built: once dealt, the revived a0 guards home, nearest to it (${settled?.mission})`);
  ok(firstAsk?.mission === settled?.mission && near(firstAsk, settled), `its first ask after the revive is dealt its role at once (${firstAsk?.mission} `
    + `against the dealt ${settled?.mission}; the raid by default until the next deal)`);
}

console.log('[3] G5, Frontline: an attacker that falls pushing drops its plan at its death and waits for its group again');
{
  // a0 at the live sector's edge alone; a1 300 m back, never in its group, asks every step (it plans the attack each
  // second through a0's death); the human and the defenders never ask
  const hulls = [tank('h', 'alpha', 0, -400, false), tank('a0', 'alpha', 10, -400), tank('a1', 'alpha', -10, -400),
    ...Array.from({ length: 6 }, (_, i) => tank(`d${i}`, 'bravo', i * 8 - 20, 400))];
  const { ctl, ruleset, clock, byId } = match('frontline_assault', hulls);
  const zone = ctl.state.zones[0], spawn = ctl.state.spawns.find((p) => p.team === 'alpha');
  const ux = (spawn.x - zone.x) / Math.hypot(spawn.x - zone.x, spawn.z - zone.z), uz = (spawn.z - zone.z) / Math.hypot(spawn.x - zone.x, spawn.z - zone.z);
  const attacker = byId('a0'), rear = byId('a1');
  const at = (e, out) => Object.assign(e.state.pos, { x: zone.x + ux * out, z: zone.z + uz * out });
  Object.assign(byId('h').state.pos, { x: zone.x + ux * 500, z: zone.z + uz * 500 });
  const rules = ruleset.assaultBots;
  let firstAsk = null;
  const play = (seconds, place = true) => {
    let held = 0;
    for (const end = clock.t + seconds; clock.t < end - 1e-9;) {
      const wasDown = attacker.combat.destroyed;
      at(rear, 300);
      if (place && !attacker.combat.destroyed) at(attacker, 50);
      clock.t += STEP_S; ctl.step(1 / 60, clock.t);
      if (!rear.combat.destroyed) ctl.botTarget(rear);
      // revived behind the line, it is put back at the edge before its first ask
      if (wasDown && !attacker.combat.destroyed) at(attacker, 50);
      if (attacker.modeActive !== false && !attacker.combat.destroyed) {
        const to = ctl.botTarget(attacker);
        if (wasDown && firstAsk === null) firstAsk = to;
        if (to && Math.hypot(to.x - zone.x, to.z - zone.z) > 1) held += STEP_S;
      }
    }
    return held;
  };
  const planOf = () => ctl.captureCheckpoint(clock.t).waves?.line?.attack?.find(([id]) => id === 'a0')?.[1] ?? null;
  play(rules.pushAfterS + 2);
  ok(planOf()?.pushing === true, `the case is built: alone at the sector's edge past pushAfterS, a0 pushes (${planOf() ? `pushing ${planOf().pushing}` : 'no plan'})`);
  // the plans run each second from a1's first ask (0.25 s, 1.25 s, ...): the death is seen at 17.5 s, so the allied
  // revive falls between two plans, the last of them planned without a0
  play(STEP_S);
  kill(attacker);
  play(STEP_S, false);
  ok(planOf() === null, `the step that sees its death drops its plan (${planOf() ? `kept: pushing ${planOf().pushing}` : 'none'})`);
  const heldFromRevive = play(ruleset.assault.allyReviveS + 0.5, false);
  ok(!attacker.combat.destroyed && attacker.modeLife === 'alive' && firstAsk !== null, `the case is built: the allied revive brought it back and it asked (${attacker.modeLife})`);
  ok(firstAsk && Math.hypot(firstAsk.x - zone.x, firstAsk.z - zone.z) > 1, `its first ask is planned at once: the edge, not the live sector (${firstAsk
    ? `${Math.hypot(firstAsk.x - zone.x, firstAsk.z - zone.z).toFixed(1)} m from its centre` : 'no ask'})`);
  const held = heldFromRevive + play(rules.pushAfterS + 2);
  ok(held >= rules.pushAfterS - STEP_S - 1e-9, `back at the edge, the revived attacker waits for its group (held ${held.toFixed(2)} s of the `
    + `${rules.pushAfterS} s wait; it came back pushing and went in alone)`);
}

if (failures) { console.error(`fallenStages.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('fallenStages.selftest: a fallen raider\'s stage and a fallen attacker\'s plan go at its death, and a revived bot is dealt its role or plan at once (solo and every host)');
