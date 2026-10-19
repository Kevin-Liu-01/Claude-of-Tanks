// Native GPU regression (lane ac130-fx-228, 2026-10-19; it replaces the retired ribbon-tracer regression with the old ribbon it
// tested): fire the AC-130's real weapons, hold a mid-flight frame of each round, and check it draws through the October
// effects — the 30 mm and the 152 mm in the projectile tracers (the howitzer's the wider heavy class), the missile as the
// hellfire airframe with its smoke trail — that a networked snapshot round (no reload group) draws the same, that no
// pre-October ribbon object exists, and that a reset clears them. Desktop and a 480x270 touch viewport, under the shared
// capture lock (normal band).
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createCaptureLock } from './capture-lock.mjs';
import { withMapProbeSession, openGamePage, beginSoloBattle } from './map-probe-runtime.mjs';

const out = resolve('.qa-dev/gunship-fx'); mkdirSync(out, { recursive: true });
const GROUPS = ['gunship-cannon', 'gunship-howitzer', 'gunship-missile'];
const lock = createCaptureLock(); let heartbeat; const results = [];
try {
  await lock.acquire(); heartbeat = setInterval(() => lock.refresh(), 30000); console.log('gunship-fx: acquired GPU slot');
  await withMapProbeSession({ root: process.cwd(), launch: { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } }, async ({ browser, port }) => {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 480, height: 270, isMobile: true, hasTouch: true }]) {
      const { page, errors } = await openGamePage(browser, { port, viewport });
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.evaluate(async () => { const { writeTeamArrangement } = await import('/src/game/teamArrangement.ts'); writeTeamArrangement('ac130', { allies: 4, enemies: 4 }); });
      await beginSoloBattle(page, { specId: 'm1a1_abrams_hc', mapId: 'verdant', gameMode: 'ac130' });
      assert.equal(await page.evaluate(() => !!window.__DEBUG.fx.group.getObjectByName('Ballistic tracer ribbons and heads')), false,
        'the pre-October ribbon block is gone');
      for (const slot of [0, 1, 2]) {
        await page.evaluate((slot, groups) => {
          const D = window.__DEBUG, fx = D.fx, original = fx.update;
          window.__gunshipSample = null; window.__restoreGunship = () => { fx.update = original; };
          let held = null;
          window.__gunshipNetworkSnapshot = () => { if (held) held[0].spec = { type: held[0].spec.type, tracer: held[0].spec.tracer, guided: held[0].spec.guided }; };
          fx.update = function (dt, shells, camera, resolveSubject) {
            if (!held) {
              const shell = shells.find((s) => s.shooterId === D.game.player.id && !s.dead && s.spec.reloadGroup === groups[slot] && s.distM > 60);
              if (shell) held = [{ ...shell, pos: shell.pos.clone(), prevPos: shell.prevPos?.clone(), vel: shell.vel.clone() }];
            }
            original.call(fx, held ? 0 : dt, held ?? shells, camera, resolveSubject);
            if (held) {
              const tracers = fx.group.getObjectByName('Projectile tracers');
              const g = tracers.geometry;
              let maxHalfWidth = 0;
              for (let i = 0; i < g.instanceCount; i++) maxHalfWidth = Math.max(maxHalfWidth, g.attributes.aHead.getW(i));
              const hellfire = fx.group.getObjectByName('fx-missile-body-hellfire');
              const konkurs = fx.group.getObjectByName('fx-missile-body-konkurs');
              window.__gunshipSample = { slot, tracers: g.instanceCount, maxHalfWidth, hellfire: hellfire?.count ?? 0, konkurs: konkurs?.count ?? 0,
                missile: fx.getGuidedMissileDebug(), trails: !!fx.group.getObjectByName('fx-missile-trails')?.visible, distM: held[0].distM };
            }
          };
        }, slot, GROUPS);
        if (viewport.hasTouch) await page.tap(`.flight-weapon:nth-child(${slot + 1})`);
        else await page.evaluate((s) => window.__DEBUG.input.tapVirtual(`shell${s + 1}`), slot);
        await page.waitForFunction((slot) => window.__DEBUG.game.player.combat.shellSlot === slot, {}, slot);
        await page.evaluate(() => { window.__DEBUG.flags.forceFire = true; });
        try { await page.waitForFunction((slot) => slot === 2 ? window.__gunshipSample?.hellfire > 0 : window.__gunshipSample?.tracers > 0, { timeout: 15000 }, slot); }
        catch (error) { await page.screenshot({ path: resolve(out, 'failure.png') }); throw error; }
        await page.evaluate(() => { window.__DEBUG.flags.forceFire = false; });
        const sample = await page.evaluate(() => window.__gunshipSample);
        if (slot === 0) assert.ok(sample.maxHalfWidth >= 1.3, 'the autocannon draws its gunship class');
        if (slot === 1) assert.ok(sample.maxHalfWidth >= 2.2, 'the howitzer draws the heavy class, wider than a tank round');
        if (slot === 2) { assert.ok(sample.hellfire > 0 && sample.konkurs === 0, 'the missile is the hellfire airframe'); assert.ok(sample.missile.trailSegments > 0, 'its motor glows'); }
        await page.screenshot({ path: resolve(out, `${viewport.width}-${slot}.png`) });
        results.push({ width: viewport.width, ...sample }); console.log('gunship-fx:', JSON.stringify(results.at(-1)));
        await page.evaluate(() => window.__gunshipNetworkSnapshot());
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const snapshot = await page.evaluate(() => window.__gunshipSample);
        if (slot === 2) assert.ok(snapshot.hellfire > 0, 'a snapshot missile with no name resolves the hellfire through its aircraft');
        else assert.ok(snapshot.tracers > 0 && snapshot.maxHalfWidth >= sample.maxHalfWidth - 1e-3, 'a snapshot round without its reload group keeps its gunship class');
        await page.evaluate(() => window.__restoreGunship());
        await new Promise((r) => setTimeout(r, slot === 2 ? 6500 : 1400));
      }
      assert.equal(await page.evaluate(() => { window.__DEBUG.fx.resetAll(); return window.__DEBUG.fx.group.getObjectByName('Projectile tracers').geometry.instanceCount; }), 0,
        'reset clears the tracers');
      assert.deepEqual(errors, [], 'no shader or page errors'); await page.close();
    }
  });
  writeFileSync(resolve(out, 'report.json'), JSON.stringify({ pass: true, results }, null, 2));
  console.log('gunship-fx: the AC-130 on the October tracers, the hellfire, snapshots, desktop/touch and reset passed');
} finally { clearInterval(heartbeat); lock.release(); }
