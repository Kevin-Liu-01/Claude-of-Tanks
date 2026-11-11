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
import { openCaptureHold } from './capture-hold.mjs';

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
  // an autocannon's burst: forty 0.4-point penetrations sum on one float ("−16"); the card and the log round each to 0 and
  // show no figure, never −0
  ['autocannon burst', Array.from({ length: 40 }, () => ({ kind: 'pen', damage: 0.4, hpRemoved: 0.4, caliberMm: 30,
    shellType: 'AP' })), 0, [16]],
];
const digits = (text) => Number(String(text ?? '').replace(/[^\d]/g, '')) || 0;
/** WCAG contrast of two sRGB byte triples. */
function contrast(a, b) {
  const lum = (rgb) => rgb.slice(0, 3).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

let hold;
hold = await openCaptureHold({ label: 'shot-damage-figures', timeoutMs: Number(arg('lock-timeout', String(45 * 60 * 1000))), lockClass: 'render', holdCapMinutes: 12 });

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
          // (a blast victim stands apart from the direct hit; a burst's rounds strike one spot, as its float sums them)
          pos: [target ? i * 6 : 0, 1, 50] }));
        for (let i = 0; i < 2; i++) f.hud.update(f.frame);
        const text = (selector) => [...document.querySelectorAll(selector)]
          .filter((el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })).map((el) => el.textContent);
        // a computed colour as sRGB bytes (a token in oklch reads back as oklch)
        const rgba = (css) => { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = css;
          c.fillRect(0, 0, 1, 1); return [...c.getImageData(0, 0, 1, 1).data]; };
        const ink = (selector) => { const el = [...document.querySelectorAll(selector)].find((e) => /\d/.test(e.textContent));
          return el ? rgba(getComputedStyle(el).color) : null; };
        const plate = document.querySelector('.cot-si-card');
        const result = { card: text('.cot-si-dmg'), shown: document.querySelector('.cot-si-card')?.dataset.shown ?? null,
          blast: text('.cot-si-missile-blast'), floats: text('.cot-dmgnum'),
          ink: { card: ink('.cot-si-dmg'), float: ink('.cot-dmgnum'),
            plate: plate ? getComputedStyle(plate).backgroundColor : null } };
        f.bus.emit('ui:shotLog', {});
        result.log = text('.cot-si-log.open .cot-si-lrow .d');
        result.ink.log = ink('.cot-si-log.open .cot-si-lrow .d.dealt');
        f.bus.emit('ui:shotLog', {});
        return result;
      }, { events, missile: name.startsWith('missile') });
      const problems = [];
      const expect = (ok, what) => { if (!ok) problems.push(what); };
      // (a touch window's zero-damage hit floats its outcome's word, no figure)
      const numeric = seen.floats.filter((text) => /\d/.test(text));
      // (the float prints the card's true minus: one datum, one glyph)
      expect(numeric.every((text) => text.startsWith('\u2212')), `floats ${JSON.stringify(numeric)} print a true minus`);
      const figures = numeric.map(digits);
      expect(figures.sort().join() === floats.slice().sort().join(),
        `floats ${JSON.stringify(seen.floats)} read ${floats.join(', ') || 'none'}`);
      if (!touch) {
        expect(card ? seen.card.length === 1 && digits(seen.card[0]) === card && seen.card[0].startsWith('−')
          : seen.card.length === 0, `card figure ${JSON.stringify(seen.card)} reads ${card ? `−${card}` : 'nothing'}`);
        expect(Number(seen.shown) === card, `card.dataset.shown ${seen.shown} is ${card}`);
        const logged = digits(seen.log[0]);
        expect(logged === Math.round(events[0].hpRemoved || 0) && !/−0(?![\d.,])/.test(seen.log[0] ?? ''),
          `log row ${JSON.stringify(seen.log[0])} reads ${Math.round(events[0].hpRemoved || 0) || 'its dot'}`);
        // one damage-dealt colour (owner 2026-10-31, "make the -xxxxx number be colored"): the card's figure, the float and
        // the log's figure share it, and it holds 4.5:1 on the card's plate even over a white battlefield
        if (card) {
          const same = (a, b) => a && b && a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= 1);
          expect(same(seen.ink.card, seen.ink.float) && same(seen.ink.card, seen.ink.log),
            `one colour: card ${seen.ink.card}, float ${seen.ink.float}, log ${seen.ink.log}`);
          const m = /rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[, /]+([\d.]+))?/.exec(seen.ink.plate || '');
          const alpha = m && m[4] !== undefined ? Number(m[4]) : 1;
          const overWhite = m ? [1, 2, 3].map((i) => Number(m[i]) * alpha + 255 * (1 - alpha)) : [255, 255, 255];
          const ratio = seen.ink.card ? contrast(seen.ink.card, overWhite) : 0;
          expect(ratio >= 4.5, `the figure's contrast on the plate over white is ${ratio.toFixed(2)}:1, under 4.5`);
        }
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
        const report = await page.evaluate(() => {
          const rgba = (css) => { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = css;
            c.fillRect(0, 0, 1, 1); return [...c.getImageData(0, 0, 1, 1).data]; };
          const dealt = document.querySelector('.cot-si-stats .es-tal[data-stat=dealt] .v');
          const best = document.querySelector('.cot-si-stats .bd');
          return { dealt: dealt?.textContent ?? null, best: best?.textContent ?? null,
            dealtInk: dealt ? rgba(getComputedStyle(dealt).color) : null, bestInk: best ? rgba(getComputedStyle(best).color) : null };
        });
        expect(digits(report.dealt) === 50, `end report dealt ${report.dealt} reads 50`);
        expect(digits(report.best) === 50, `end report best shot ${report.best} reads 50`);
        // (the same datum in the same colour as the card's figure, Main 2026-10-31)
        const near = (a, b) => a && b && a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= 1);
        expect(near(report.dealtInk, seen.ink.card) && near(report.bestInk, seen.ink.card),
          `end report dealt ${report.dealtInk} and best ${report.bestInk} in the card's ${seen.ink.card}`);
      }
      problems.push(...errors.map((e) => `page error: ${e}`));
      await page.screenshot({ path: `${out}/${layout}-${name.replace(/[^a-z]+/g, '-')}.png` });
      if (problems.length) { failures += problems.length; console.log(`FAIL ${layout} ${name}: ${problems.join('; ')}`); }
      else console.log(`${layout} ${name}: every figure reads the hull points taken off`);
      await page.close();
    }
    await context.close();
  }
} finally { await browser?.close(); await hold?.release(); }
console.log(`shot-damage-figures: ${failures ? `FAIL (${failures})` : 'PASS'}`);
if (failures) process.exitCode = 1;
