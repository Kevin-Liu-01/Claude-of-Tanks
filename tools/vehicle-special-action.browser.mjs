// Real HUD regression for mode loadouts which retain the same vehicle ID.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createCaptureLock } from './capture-lock.mjs';
import { withMapProbeSession } from './map-probe-runtime.mjs';

const out = resolve('.qa-dev/vehicle-special-action');
mkdirSync(out, { recursive: true });
const lock = createCaptureLock();
let heartbeat;
const reports = [];
try {
  await lock.acquire();
  heartbeat = setInterval(() => lock.refresh(), 30000);
  await withMapProbeSession({ root: process.cwd() }, async ({ browser, baseUrl }) => {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 568, height: 320, isMobile: true, hasTouch: true }]) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewport(viewport);
      await page.goto(`${baseUrl}/tools/fixtures/battle-hud-layout.html`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => !!window.__HUD_LAYOUT);
      const result = await page.evaluate(async () => {
        await import('/src/ui/aerialHud.css');
        const { getSpec } = await import('/src/vehicles/specs.ts');
        const { ensureAuthorityFleet } = await import('/src/vehicles/authorityFleet.ts');
        const { createCombatState } = await import('/src/sim/damage.ts');
        const { createSpecialActionState } = await import('/src/sim/specialActionPolicy.ts');
        const { setModeWeapon } = await import('/src/sim/modeLoadout.ts');
        const { initializeAerial } = await import('/src/sim/aerialCombat.ts');
        const { matchRulesetFor } = await import('/src/sim/matchRuleset.ts');
        await ensureAuthorityFleet(['m1a2', 'bwp1', 'strv103a', 'leclerc']);
        const { hud, frame, bus } = window.__HUD_LAYOUT;
        const player = frame.player, button = document.querySelector('.cot-special');
        let events = 0;
        bus.on('ui:specialAction', () => events++);
        const read = () => ({ label: button.querySelector('.sl').textContent,
          hidden: button.hidden, disabled: button.disabled, visible: button.checkVisibility() });
        const enter = (id, mode) => {
          player.spec = getSpec(id); player.combat = createCombatState(player.spec);
          player.input = { shellSlot: 0 }; player.specialAction = createSpecialActionState(player.spec);
          initializeAerial(player, matchRulesetFor(mode)); frame.matchModeState = { id: mode };
          hud.setMode('battle');
        };
        enter('m1a2', 'ac130'); setModeWeapon(player, 'gunship'); hud.update(frame);
        const aircraft = read();
        enter('m1a2', 'drone'); hud.update(frame);
        const drone = read();
        button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        button.dispatchEvent(new MouseEvent('click', { detail: 0, bubbles: true }));
        const hiddenEvents = events;
        const actions = [];
        for (const id of ['bwp1', 'strv103a', 'leclerc']) {
          enter(id, 'drone'); hud.update(frame); actions.push(read());
        }
        enter('m1a2', 'drone'); hud.update(frame);
        return { aircraft, drone, hiddenEvents, actions };
      });
      assert.equal(result.aircraft.label, 'ATGM');
      assert.deepEqual(result.drone, { label: '', hidden: true, disabled: true, visible: false });
      assert.equal(result.hiddenEvents, 0);
      assert.deepEqual(result.actions.map(action => action.label), ['ATGM', 'Suspension', 'Reload']);
      assert.ok(result.actions.every(action => action.visible && !action.disabled));
      assert.deepEqual(errors, []);
      await page.screenshot({ path: resolve(out, `drone-${viewport.width}.png`) });
      reports.push({ viewport, ...result });
      await page.close();
    }
  });
  writeFileSync(resolve(out, 'report.json'), JSON.stringify(reports, null, 2));
  console.log('vehicle-special-action: desktop and phone landscape mode transitions and hidden-button guards passed');
} finally {
  clearInterval(heartbeat);
  await lock.release();
}
