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
        enter('bwp1', 'drone');
        const slot = player.specialAction.missileSlot;
        player.combat.ammo[slot] = 0;
        player.combat.reloadChannels[slot].t = 8;
        hud.update(frame);
        const empty = { ...read(), capacity: player.combat.ammoCapacity[slot] };
        const eventsBeforeEmpty = events;
        button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        button.dispatchEvent(new MouseEvent('click', { detail: 0, bubbles: true }));
        const emptyEvents = events - eventsBeforeEmpty;
        player.combat.ammo[slot] = 1;
        player.combat.reloadChannels[slot].t = 0;
        hud.update(frame);
        const resupplied = read();
        // A hydraulic E action leaves the same missile inventory on the extra shortcut.
        player.spec = { ...player.spec, hydropneumaticAim: {} };
        player.specialAction = createSpecialActionState(player.spec);
        player.combat.ammo[slot] = 0;
        hud.update(frame);
        const extra = document.querySelector('.cot-vehicle-controls>.cot-auxiliary:not(.cot-drone-control)');
        const extraEmpty = { label: extra.querySelector('.sl').textContent, disabled: extra.disabled, hidden: extra.hidden };
        player.combat.ammo[slot] = 1; hud.update(frame);
        const extraResupplied = { label: extra.querySelector('.sl').textContent, disabled: extra.disabled };
        enter('bwp1', 'drone'); player.combat.ammo[player.specialAction.missileSlot] = 0; hud.update(frame);
        return { aircraft, drone, hiddenEvents, actions, empty, emptyEvents, resupplied, extraEmpty, extraResupplied };
      });
      assert.equal(result.aircraft.label, 'ATGM');
      assert.deepEqual(result.drone, { label: '', hidden: true, disabled: true, visible: false });
      assert.equal(result.hiddenEvents, 0);
      assert.deepEqual(result.actions.map(action => action.label), ['ATGM', 'Suspension', 'Reload']);
      assert.ok(result.actions.every(action => action.visible && !action.disabled));
      assert.equal(result.empty.label, `0/${result.empty.capacity}`, 'empty inventory overrides reload time just like smoke');
      assert.equal(result.empty.disabled, true);
      assert.equal(result.empty.visible, true);
      assert.equal(result.emptyEvents, 0, 'depleted controls reject pointer and keyboard activation');
      assert.equal(result.resupplied.label, 'ATGM');
      assert.equal(result.resupplied.disabled, false, 'live resupply restores E without a tank swap');
      assert.deepEqual(result.extraEmpty, { label: result.empty.label, disabled: true, hidden: false });
      assert.deepEqual(result.extraResupplied, { label: 'ATGM', disabled: false });
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
