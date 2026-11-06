#!/usr/bin/env node
// Settings › Sound › Crew voices on a phone (390x844, touch) and a desktop, on the real Settings and input store
// (tools/fixtures/crew-voice.html): every pack is a language row with no flag, and the list scrolls under a real touch
// drag (and the wheel on desktop) until its last row and an RTL row (Urdu) are on screen and can be chosen.
// crew-languages-270 (owner 2026-11-06: "also that selection should be in languages").
import { launchGuardedBrowser } from './browser-launch.mjs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { createCaptureLock, selftestLockTimeoutMs } from './capture-lock.mjs';
import { CREW_LANGUAGES } from '../src/audio/vehicleAudioProfiles.ts';

const lock = createCaptureLock();
let server, browser, refresh;
const report = [];
try {
  await lock.acquire(selftestLockTimeoutMs());
  refresh = setInterval(() => lock.refresh(), 30_000); refresh.unref();
  server = await createServer({ root: process.cwd(), logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await launchGuardedBrowser(puppeteer, { headless: 'new', protocolTimeout: 120_000 });
  for (const view of [{ name: 'phone', width: 390, height: 844, isMobile: true, hasTouch: true }, { name: 'desktop', width: 1280, height: 800 }]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewport({ ...view, deviceScaleFactor: 1 });
    await page.goto(`${base}/tools/fixtures/crew-voice.html?locale=en-US`, { waitUntil: 'networkidle0', timeout: 180_000 });
    await page.waitForSelector('.cot-set-crew-field .cot-c-menu__trigger', { timeout: 60_000 });
    const open = async () => {
      await page.click('.cot-set-crew-field .cot-c-menu__trigger');
      await page.waitForSelector('.cot-c-menu__pop:popover-open [role="option"]');
    };
    /** The row's box against the sheet's visible list and the viewport: a row can be chosen only where both show it. */
    const rowState = (id) => page.evaluate((id) => {
      const option = document.querySelector(`.cot-c-menu__pop:popover-open [role="option"][data-id="${id}"]`);
      const pop = document.querySelector('.cot-c-menu__pop:popover-open');
      let scroller = option?.parentElement;
      while (scroller && scroller !== pop && !(scroller.scrollHeight > scroller.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
      const r = option.getBoundingClientRect();
      const s = (scroller && scroller !== pop ? scroller : pop).getBoundingClientRect();
      const p = pop.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, x: r.left + r.width / 2, y: r.top + r.height / 2,
        shown: r.top >= Math.max(0, s.top) - 1 && r.bottom <= Math.min(innerHeight, s.bottom) + 1,
        list: scroller && scroller !== pop ? { scrollTop: scroller.scrollTop, scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight } : null,
        pop: { top: p.top, bottom: p.bottom, height: p.height }, viewport: innerHeight };
    }, id);
    /** Drag (touch) or wheel the list until the row is on screen; a list that never moves fails here. */
    const scrollTo = async (id) => {
      for (let i = 0; i < 12; i++) {
        const state = await rowState(id);
        if (state.shown) return state;
        const anchor = await page.evaluate(() => {
          const list = document.querySelector('.cot-c-menu__pop:popover-open [role="listbox"], .cot-c-menu__pop:popover-open [role="option"]')?.closest('[role="listbox"]')
            ?? document.querySelector('.cot-c-menu__pop:popover-open [role="option"]').parentElement;
          const r = list.getBoundingClientRect();
          const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight);
          return { x: r.left + r.width / 2, y0: top + (bottom - top) * 0.8, y1: top + (bottom - top) * 0.2 };
        });
        if (view.hasTouch) {
          await page.touchscreen.touchStart(anchor.x, anchor.y0);
          for (let k = 1; k <= 8; k++) await page.touchscreen.touchMove(anchor.x, anchor.y0 + (anchor.y1 - anchor.y0) * k / 8);
          await page.touchscreen.touchEnd();
        } else {
          await page.mouse.move(anchor.x, (anchor.y0 + anchor.y1) / 2);
          await page.mouse.wheel({ deltaY: 400 });
        }
        await new Promise((r) => setTimeout(r, 350));
      }
      return rowState(id);
    };
    const choose = async (id) => {
      await open();
      const state = await scrollTo(id);
      assert.ok(state.shown, `${view.name}: ${id} scrolls on screen (${JSON.stringify(state)})`);
      if (view.hasTouch) await page.touchscreen.tap(state.x, state.y); else await page.mouse.click(state.x, state.y);
      await page.waitForFunction(() => !document.querySelector('.cot-c-menu__pop:popover-open'), { timeout: 5_000 });
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cot.settings.v1') || '{}').crewVoice);
      assert.equal(stored, id, `${view.name}: tapping ${id} after the scroll chooses it`);
      return state;
    };
    await open();
    const rows = await page.evaluate(() => [...document.querySelectorAll('.cot-c-menu__pop:popover-open [role="option"]')]
      .map((o) => ({ id: o.dataset.id, flags: o.querySelectorAll('img').length })));
    assert.equal(rows[0].id, 'national', `${view.name}: National crews first`);
    assert.deepEqual(rows.slice(1).map((r) => r.id).sort(), [...CREW_LANGUAGES].sort(), `${view.name}: every pack listed`);
    assert.equal(rows.reduce((a, r) => a + r.flags, 0), 0, `${view.name}: no flags: a language is not a country`);
    const first = await rowState(rows[1].id);
    if (view.hasTouch) assert.ok(first.pop.bottom <= first.viewport + 1, `${view.name}: the sheet ends inside the viewport (${JSON.stringify(first.pop)})`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.cot-c-menu__pop:popover-open'));
    const last = rows.at(-1).id;
    const lastState = await choose(last);
    const rtl = await choose('ur');
    assert.deepEqual(errors, [], `${view.name}: no page errors`);
    report.push({ view: view.name, rows: rows.length, last, lastList: lastState.list, rtlList: rtl.list, pop: first.pop });
    await page.close();
  }
  console.log(`crew-voice-picker.browser.selftest: ${report.map((r) => `${r.view} ${r.rows} rows, ${r.last} and ur scrolled to and chosen (list ${r.lastList?.clientHeight}/${r.lastList?.scrollHeight} px)`).join('; ')}; no flags`);
} finally {
  clearInterval(refresh);
  await browser?.close();
  await server?.close();
  lock.release();
}
