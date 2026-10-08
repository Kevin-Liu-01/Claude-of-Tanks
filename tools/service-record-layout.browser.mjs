// Production Service Record geometry regression; run under capture-command.mjs.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
const modulePath = process.argv.find(arg => arg.startsWith('--playwright-module='))?.slice(20) || 'playwright';
const { chromium } = await import(modulePath);
const out = resolve('.qa-dev/service-record-layout');
await mkdir(out, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
const receipts = [];
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu'] });
  for (const [name, width, height, locale] of [
    ['desktop', 1440, 900, 'en-US'], ['small-portrait', 320, 568, 'en-US'],
    ['portrait', 390, 844, 'en-US'], ['landscape', 667, 375, 'en-US'],
    ['short-landscape', 568, 256, 'en-US'], ['portrait-zh', 390, 844, 'zh-CN'],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 800, isMobile: width < 800, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tools/fixtures/battle-hud-layout.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__HUD_LAYOUT);
    await page.evaluate(async locale => {
      window.__HUD_LAYOUT.hud.setMode('hidden');
      const [{ createServiceRecordDialog }, { createBus }, { installServiceRecord }, { installBattleRecords }, { setLocale }] = await Promise.all([
        import('/src/ui/serviceRecordDialog.ts'), import('/src/game/stateCore.ts'), import('/src/game/serviceRecord.ts'),
        import('/src/game/profile.ts'), import('/src/ui/i18n.ts'), import('/src/ui/serviceRecord.css'),
      ]);
      setLocale(locale);
      const bus = createBus();
      installBattleRecords(bus);
      let clock = 10;
      installServiceRecord(bus, { playerId: () => 'me', playerTeam: () => 'player', teamOf: id => id === 'me' ? 'player' : 'enemy', gameMode: () => 'standard', clockS: () => clock, playerHpFraction: () => 1, playerMaxHp: () => 2600, playerNation: () => 'USA', playerAerialKind: () => null, respawns: () => false });
      const record = createServiceRecordDialog({ vehicle: () => 'M1A2 Abrams SEP v3', map: () => 'Glacier Pass', modeIcon: () => 'modeStandard' }, () => {});
      window.__RECORD_TEST = { record, seed() {
        // Populate newly earned medals, multi-line names, a full chain, and large stats.
        bus.emit('ui:battleStart', { specId: 'm1a2', mapId: 'winter' });
        for (let i = 0; i < 8; i++) {
          clock = 20 + i * 4;
          bus.emit('shell:fired', { shooterId: 'me', shellId: i, caliberMm: 120 });
          bus.emit('shell:hit', { attackerId: 'me', targetId: `e${i}`, shellId: i, damage: 1800, kind: 'pen', destroyed: true });
          bus.emit('tank:destroyed', { id: `e${i}`, killerId: 'me', specId: 't90m', cause: i === 2 ? 'ammorack' : 'shot' });
        }
        bus.emit('battle:ended', { result: 'victory', mapId: 'winter', durationS: 180, gameMode: 'standard', roster: [] });
      } };
      record.open(document.body);
    }, locale);
    await page.evaluate(() => document.fonts.ready);
    for (const state of ['empty', 'earned']) {
      if (state === 'earned') await page.evaluate(() => { window.__RECORD_TEST.record.close(); window.__RECORD_TEST.seed(); window.__RECORD_TEST.record.open(document.body); });
      for (const tab of ['overview', 'medals', 'achievements', 'history']) {
        await page.locator(`[data-record-tab=${tab}]`).click();
        if (tab === 'history' && state === 'earned') await page.locator('.cot-record-battle summary').click();
        const violations = await page.evaluate(() => {
          const failures = [];
          const body = document.querySelector('.cot-record-body');
          if (body.scrollWidth > body.clientWidth + 1) failures.push('horizontal panel overflow');
          const panel = body.getBoundingClientRect();
          if (panel.height < 44) failures.push('scroll panel cannot expose a touch target');
          for (const selector of ['.cot-modal__header', '.cot-record-tabs', '.cot-modal__footer']) {
            const rect = document.querySelector(`.cot-service-record ${selector}`).getBoundingClientRect();
            if (rect.left < -1 || rect.right > innerWidth + 1 || rect.top < -1 || rect.bottom > innerHeight + 1) failures.push(`${selector} outside viewport`);
          }
          for (const [selector, artSelector, copySelector] of [
            ['.cot-record-reason', ':scope > svg', ':scope > div'],
            ['.cot-record-latest-medal', ':scope > svg', ':scope > span'],
            ['.cot-record-medal', '.cot-record-medal-art svg', '.cot-record-medal-copy'],
          ]) for (const card of document.querySelectorAll(selector)) {
            const box = card.getBoundingClientRect(), art = card.querySelector(artSelector).getBoundingClientRect(), copy = card.querySelector(copySelector).getBoundingClientRect();
            const label = card.textContent.trim().slice(0, 40);
            if (art.bottom > copy.top + 1) failures.push(`${label}: art overlaps text`);
            for (const rect of [art, copy]) if (rect.left < box.left - 1 || rect.right > box.right + 1 || rect.bottom > box.bottom + 1) failures.push(`${label}: content outside card`);
            const badge = card.querySelector('.cot-record-new')?.getBoundingClientRect();
            if (badge && badge.bottom > art.top && badge.left < art.right && badge.right > art.left) failures.push(`${label}: badge overlaps art`);
          }
          for (const stat of document.querySelectorAll('.cot-record-outcome,.cot-record-metric,.cot-record-ach-copy')) {
            if (stat.scrollWidth > stat.clientWidth + 1) failures.push('stat/achievement text overflow');
          }
          return failures;
        });
        assert.deepEqual(violations, [], `${name}/${state}/${tab}`);
        if (tab === 'overview') {
          assert.equal(await page.locator('.cot-record-overview [data-stat-icon] svg').count(), 10);
          assert.equal(await page.locator('.cot-record-ring').count(), 0);
          assert.equal(await page.locator('.cot-modal__eyebrow').isVisible(), false);
          assert.equal(await page.locator('.cot-modal__title').evaluate(el => getComputedStyle(el).color), 'rgb(240, 172, 76)');
        }
        if (state === 'earned') await page.screenshot({ path: resolve(out, `${name}-${tab}.png`) });
        receipts.push({ name, state, tab, violations });
      }
    }
    await page.locator('[data-record-tab=medals]').click();
    const medal = page.locator('.cot-record-medal-inspect').first();
    await medal.scrollIntoViewIfNeeded();
    await medal.click();
    assert.equal(await page.locator('.cot-rich-tooltip:visible').count(), 1, `${name}: medal requirements open on tap`);
    const tip = await page.locator('.cot-rich-tooltip:visible').boundingBox();
    assert.ok(tip.x >= 0 && tip.y >= 0 && tip.x + tip.width <= width + 1 && tip.y + tip.height <= height + 1, `${name}: tooltip stays in viewport`);
    await page.screenshot({ path: resolve(out, `${name}-medal-tooltip.png`) });
    await page.setViewportSize({ width: height, height: width });
    await page.locator('[data-record-tab=overview]').click();
    assert.ok(await page.locator('.cot-record-body').evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${name}: rotation reflows`);
    assert.deepEqual(errors, [], `${name}: no runtime errors`);
    await context.close();
  }
  await writeFile(resolve(out, 'results.json'), JSON.stringify(receipts, null, 2));
  console.log(`Service Record: ${receipts.length} layout cases + tap tooltips + rotations PASS; ${out}`);
} finally { await browser?.close(); await server.close(); }
