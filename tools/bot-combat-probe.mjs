// Shared bot-combat integration probe.
// Runs real 7v7 setup through the fixed-step simulation and exports the full
// DEV recorder plus per-team combat/fire-discipline telemetry.
// Usage: node tools/bot-combat-probe.mjs [--seconds 90] [--tank m1a2]
//   [--map verdant] [--out .qa-bots/bot-combat.json]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const seconds = Math.max(30, Number(opt('seconds', '90')) || 90);
const tankId = opt('tank', 'm1a2');
const mapId = opt('map', 'verdant');
const output = resolve(opt('out', '.qa-bots/bot-combat.json'));
const port = 6100 + Math.floor(Math.random() * 300);
const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port, strictPort: false },
});
await server.listen();
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
  protocolTimeout: 600000,
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text());
});

let result;
try {
  await page.goto(`http://localhost:${server.config.server.port}/?nosplash=1&tier=desktop`, {
    waitUntil: 'domcontentloaded', timeout: 120000,
  });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 180000 });
  result = await page.evaluate(async ({ durationS, tankId: playerTank, mapId: battleMap }) => {
    const D = window.__DEBUG;
    const g = D.game;
    if (D.devTrace) D.devTrace.clear();
    const teamRow = () => ({ shots: 0, hits: 0, damage: 0, kills: 0, shooters: {} });
    const combat = { player: teamRow(), enemy: teamRow() };
    const discipline = {
      sameTeamHits: 0, sameTeamDamage: 0, sameTeamRamDamage: 0,
      authoritativeFriendlyBlocks: 0,
    };
    const timeline = [];
    let firstDeathS = null;
    const off = [
      D.bus.on('shell:fired', (ev) => {
        const shooter = g.tankById.get(ev.shooterId);
        if (!shooter || !combat[shooter.team]) return;
        const row = combat[shooter.team];
        row.shots++;
        row.shooters[shooter.id] = (row.shooters[shooter.id] || 0) + 1;
      }),
      D.bus.on('shell:hit', (ev) => {
        const attacker = g.tankById.get(ev.attackerId);
        const target = g.tankById.get(ev.targetId);
        if (!attacker || !target || !combat[attacker.team]) return;
        combat[attacker.team].hits++;
        combat[attacker.team].damage += ev.damage || 0;
        if (attacker.team === target.team) {
          discipline.sameTeamHits++;
          discipline.sameTeamDamage += ev.damage || 0;
        }
      }),
      D.bus.on('shell:friendly-blocked', () => { discipline.authoritativeFriendlyBlocks++; }),
      D.bus.on('tank:ram', (ev) => {
        const a = g.tankById.get(ev.aId), b = g.tankById.get(ev.bId);
        if (a && b && a.team === b.team) {
          discipline.sameTeamRamDamage += (ev.dmgA || 0) + (ev.dmgB || 0);
        }
      }),
      D.bus.on('tank:destroyed', (ev) => {
        const tank = g.tankById.get(ev.id);
        if (tank && combat[tank.team]) combat[tank.team].kills += 0;
        const killer = g.tankById.get(ev.killerId);
        if (killer && combat[killer.team]) combat[killer.team].kills++;
        if (firstDeathS == null) firstDeathS = g.timeS;
      }),
    ];

    await D.startBattle(playerTank, battleMap);
    const roster = g.tanks.map((t) => ({
      id: t.id, specId: t.specId, team: t.team, isPlayer: !!t.isPlayer,
      hasSharedController: t.isPlayer ? true : !!(t.aiCtl &&
        typeof t.aiCtl.update === 'function' && typeof t.aiCtl.notifyFriendlyBlocked === 'function'),
    }));
    for (let s = 0; s < durationS && g.phase === 'battle'; s++) {
      D.fastForward(1);
      if ((s + 1) % 5 === 0) {
        const alive = { player: 0, enemy: 0 };
        for (const t of g.tanks) {
          if (t.combat && !t.combat.destroyed) alive[t.team]++;
        }
        timeline.push({ t: Math.round(g.timeS), alive, result: g.result });
      }
    }
    for (const stop of off) stop();
    const controllers = g.tanks.filter((t) => t.aiCtl).map((t) => ({
      id: t.id, team: t.team, ...t.aiCtl.debugInfo(),
    }));
    const aggregate = controllers.reduce((a, d) => {
      a.friendlyBlocks += d.friendlyBlockCount || 0;
      a.friendlyLaneMoves += d.friendlyLaneMoves || 0;
      a.fallingBack += d.fallingBack ? 1 : 0;
      a.relocations += d.relocations || 0;
      return a;
    }, { friendlyBlocks: 0, friendlyLaneMoves: 0, fallingBack: 0, relocations: 0 });
    return {
      generatedAt: new Date().toISOString(), durationS, tankId: playerTank,
      mapId: battleMap, simTimeS: g.timeS,
      result: g.result, firstDeathS, roster, combat, discipline, aggregate,
      controllers, timeline,
      trace: D.devTrace ? D.devTrace.snapshot() : null,
    };
  }, { durationS: seconds, tankId, mapId });
} finally {
  await browser.close();
  await server.close();
}

result.consoleErrors = errors;
const checks = {
  sharedController: result.roster.filter((t) => !t.isPlayer).every((t) => t.hasSharedController),
  bothTeamsFire: result.combat.player.shots > 0 && result.combat.enemy.shots > 0,
  noFriendlyHits: result.discipline.sameTeamHits === 0 && result.discipline.sameTeamDamage === 0,
  noFriendlyRamDamage: result.discipline.sameTeamRamDamage === 0,
  noConsoleErrors: errors.length === 0,
};
result.checks = checks;
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  output, simTimeS: result.simTimeS, result: result.result,
  firstDeathS: result.firstDeathS, combat: result.combat,
  discipline: result.discipline, aggregate: result.aggregate,
  trace: result.trace && result.trace.stats, checks,
}, null, 2));
if (!Object.values(checks).every(Boolean)) process.exit(1);
