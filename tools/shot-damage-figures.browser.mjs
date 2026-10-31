#!/usr/bin/env node
// Every damage figure the battle shows is the hull points the hit took off (owner 2026-10-31, "the amount u took off the
// enemy"): the event's hpRemoved, stamped where the hit resolved (sim/damage.ts settleHullPoints), never the roll. On the
// HUD fixture, resolved shell:hit events per case; the shot card's figure beside its outcome, the float over the hit, the
// shot log's row and the end report's dealt tile and best shot must each read it. A penetration, a non-penetration, a
// ricochet, module damage with no hull points (its outcome alone, never −0), an overkill (320 into 50 left reads 50), an
// ammo-rack kill (320 cooks off 900 left: 900) and a missile with its blast (the card sums the group). Desktop shows the
// card and the log; touch hides them (the float is its figure).
//   node tools/shot-damage-figures.browser.mjs --url=http://127.0.0.1:5173 [--out=.qa-dev/shot-damage-figures]
import { launchGuardedBrowser } from './browser-launch.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createCaptureLock } from './capture-lock.mjs';

const arg = (name, fallback) => process.argv.find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const { chromium } = await import(arg('playwright-module', 'playwright'));

/** [case, events, the card's figure (0: none), the floats' figures]: hpRemoved as the sim stamps it. */
const CASES = [
  ['penetration', [{ kind: 'pen', damage: 420, hpRemoved: 420, targetHpAfter: 1480 }], 420, [420]],
  ['non-penetration', [{ kind: 'nonpen', damage: 0, hpRemoved: 0, effectiveMm: 520, targetHpAfter: 1900 }], 0, []],
  ['ricochet', [{ kind: 'ricochet', damage: 0, hpRemoved: 0, impactAngleDeg: 74, targetHpAfter: 1900 }], 0, []],
  ['module, no hull points', [{ kind: 'nonpen', damage: 0, hpRemoved: 0, zone: 'trackL', targetHpAfter: 1900,
    modulesHit: [{ module: 'trackL', newState: 'red', dmg: 220 }] }], 0, []],
  ['overkill', [{ kind: 'pen', damage: 320, hpRemoved: 50, targetHpAfter: 0, destroyed: true }], 50, [50]],
  ['ammo-rack kill', [{ kind: 'pen', damage: 320, hpRemoved: 900, targetHpAfter: 0, destroyed: true, ammoRacked: true,
    modulesHit: [{ module: 'ammoRack', newState: 'red', dmg: 300 }] }], 900, [900]],
  ['missile and blast', [
    { kind: 'he_pen', damage: 610, hpRemoved: 610, targetHpAfter: 1290 },
    { kind: 'he_splash', damage: 140, hpRemoved: 140, target: 9, targetHpAfter: 1660 },
    { kind: 'he_splash', damage: 95, hpRemoved: 95, target: 10, targetHpAfter: 1705 },
  ], 845, [610, 140, 95]],
];
const digits = (text) => Number(String(text ?? '').replace(/[^\d]/g, '')) || 0;

const lock = createCaptureLock();
await lock.acquire(Number(arg('lock-timeout', String(45 * 60 * 1000))), { lockClass: 'render', holdCapMinutes: 12 });
const refresh = setInterval(() => lock.refresh(), 30000);
let browser;
let failures = 0;
try {
  browser = await launchGuardedBrowser(chromium, { channel: 'chrome', headless: true, args: ['--disable-gpu'] });
  const out = arg('out', '.qa-dev/shot-damage-figures'); await mkdir(out, { recursive: true });
  for (const [layout, width, height, touch] of [['desktop', 1600, 900, false], ['phone', 390, 844, true]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch,
      reducedMotion: 'reduce' });
    for (const [name, events, card, floats] of CASES) {
      const page = await context.newPage();
      const errors = []; page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${arg('url', 'http://127.0.0.1:5173')}/tools/fixtures/battle-hud-layout.html`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.__HUD_LAYOUT);
      const seen = await page.evaluate(async ({ events, missile }) => {
        const f = window.__HUD_LAYOUT;
        const { PerspectiveCamera } = await import('/node_modules/three/build/three.module.js');
        const camera = new PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
        camera.position.set(0, 4, 0); camera.lookAt(0, 2, 50); camera.updateMatrixWorld();
        f.frame.camera = camera; f.hud.update(f.frame);
        const base = { attackerId: f.frame.player.id, targetId: f.tanks[8].id, targetName: 'Leopard 2A5',
          targetSpecId: 'leo2a4_v', attackerSpecId: 'm1a3', shellType: missile ? 'ATGM' : 'APFSDS', guided: missile,
          caliberMm: missile ? 152 : 120, shellId: 900, zone: 'hullFront', flightDistM: 240, timeS: 60, pos: [0, 1, 50],
          localPos: [0, 1, 2], localDir: [0, 0, -1], impactAngleDeg: 34, dmgRoll: 340, penRollMm: 560, penRollFreshMm: 560,
          effectiveMm: 350, nominalMm: 220 };
        events.forEach(({ target, ...event }, i) => f.bus.emit('shell:hit', { ...base, ...event,
          ...(target ? { targetId: f.tanks[target].id, targetName: 'T-90AM', targetSpecId: 't90am' } : {}),
          pos: [i * 6, 1, 50] }));
        for (let i = 0; i < 2; i++) f.hud.update(f.frame);
        const text = (selector) => [...document.querySelectorAll(selector)]
          .filter((el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })).map((el) => el.textContent);
        const result = { card: text('.cot-si-dmg'), shown: document.querySelector('.cot-si-card')?.dataset.shown ?? null,
          blast: text('.cot-si-missile-blast'), floats: text('.cot-dmgnum') };
        f.bus.emit('ui:shotLog', {});
        result.log = text('.cot-si-log.open .cot-si-lrow .d');
        f.bus.emit('ui:shotLog', {});
        return result;
      }, { events, missile: name.startsWith('missile') });
      const problems = [];
      const expect = (ok, what) => { if (!ok) problems.push(what); };
      // (a touch window's zero-damage hit floats its outcome's word, no figure)
      const figures = seen.floats.filter((text) => /\d/.test(text)).map(digits);
      expect(figures.sort().join() === floats.slice().sort().join(),
        `floats ${JSON.stringify(seen.floats)} read ${floats.join(', ') || 'none'}`);
      if (!touch) {
        expect(card ? seen.card.length === 1 && digits(seen.card[0]) === card && seen.card[0].startsWith('−')
          : seen.card.length === 0, `card figure ${JSON.stringify(seen.card)} reads ${card ? `−${card}` : 'nothing'}`);
        expect(Number(seen.shown) === card, `card.dataset.shown ${seen.shown} is ${card}`);
        const logged = digits(seen.log[0]);
        expect(logged === (events[0].hpRemoved || 0), `log row ${JSON.stringify(seen.log[0])} reads ${events[0].hpRemoved}`);
        if (name.startsWith('missile')) expect(seen.blast.length === 1 && !/\d{3}/.test(seen.blast[0]),
          `the blast line ${JSON.stringify(seen.blast)} names the vehicles, its damage on the figure`);
      }
      if (!touch && name === 'overkill') {
        // the end report: the dealt tile and the best shot are the hull points taken off
        await page.evaluate(() => {
          const f = window.__HUD_LAYOUT;
          f.bus.emit('battle:ended', { result: 'victory', timeS: 300, mapId: 'verdant', gameMode: 'standard',
            roster: f.tanks.map((t) => ({ id: t.id, name: t.displayName || t.id, team: t.team === 'player' ? 'player' : 'enemy',
              alive: t !== f.tanks[8], isPlayer: !!t.isPlayer })) });
        });
        await page.waitForSelector('.cot-si-stats.show', { timeout: 15000 });
        await page.waitForTimeout(3500);
        const report = await page.evaluate(() => ({
          dealt: document.querySelector('.cot-si-stats .es-tal.hot .v')?.textContent ?? null,
          best: document.querySelector('.cot-si-stats .bd')?.textContent ?? null,
        }));
        expect(digits(report.dealt) === 50, `end report dealt ${report.dealt} reads 50`);
        expect(digits(report.best) === 50, `end report best shot ${report.best} reads 50`);
      }
      problems.push(...errors.map((e) => `page error: ${e}`));
      await page.screenshot({ path: `${out}/${layout}-${name.replace(/[^a-z]+/g, '-')}.png` });
      if (problems.length) { failures += problems.length; console.log(`FAIL ${layout} ${name}: ${problems.join('; ')}`); }
      else console.log(`${layout} ${name}: every figure reads the hull points taken off`);
      await page.close();
    }
    await context.close();
  }
} finally { await browser?.close(); clearInterval(refresh); lock.release(); }
console.log(`shot-damage-figures: ${failures ? `FAIL (${failures})` : 'PASS'}`);
if (failures) process.exitCode = 1;
