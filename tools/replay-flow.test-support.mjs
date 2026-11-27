// The replay receipts' shared page steps (replay-ui-flow and replay-trace-parity, replay-receipts-279): the indexer
// Worker's watch, a visible element's click, entering a solo battle, the drive (its gun raised before it fires) and
// leaving a battle to the Garage. First-party tooling: Kevin B. Liu.
import { readinessExpression } from './game-readiness.mjs';
import { sleep } from './map-probe-runtime.mjs';

/** In-page, before any script: every replay indexer Worker's last reply kept on window.__replayIndexJobs (the problem it
 *  named, the steps it indexed), so a viewer that says "can't be played" says why in the receipt. */
export const WATCH_INDEXER = `(() => {
  const Native = window.Worker;
  if (!Native || Native.__cotReplayWatch) return;
  window.__replayIndexJobs = [];
  window.Worker = new Proxy(Native, {
    construct(target, args, newTarget) {
      const worker = Reflect.construct(target, args, newTarget);
      if (args[1] && args[1].name === 'cot-replay-indexer') {
        const job = { started: performance.now(), reply: null, sent: null, index: null };
        window.__replayIndexJobs.push(job);
        // (replay-receipts-279) the job as posted, copied before its file is handed over (the parity receipt re-runs it)
        const post = worker.postMessage.bind(worker);
        worker.postMessage = (message, transfer) => { if (window.__replayKeepJobs) job.sent = structuredClone(message); return post(message, transfer); };
        worker.addEventListener('message', ({ data }) => {
          if (data?.type === 'done') {
            const track = data.index?.track ?? null, offsets = track?.shellOffsets ?? null;
            let shellSamples = 0;
            if (offsets) for (let i = 0; i + 1 < offsets.length; i++) if (offsets[i + 1] > offsets[i]) shellSamples++;
            // the track census: samples that hold a shell in flight, and shell entries in all
            job.reply = { type: 'done', problem: data.index?.problem ?? null, indexedSteps: data.index?.indexedSteps,
              lastTick: data.index?.lastTick, track: !!track, samples: track?.samples ?? 0, shellSamples,
              shellEntries: offsets ? offsets[offsets.length - 1] : 0, ms: Math.round(performance.now() - job.started) };
            if (window.__replayKeepJobs) job.index = data.index;
          } else if (data?.type === 'error') job.reply = { type: 'error', message: data.message };
        });
        worker.addEventListener('error', (event) => { job.reply = { type: 'workerError', message: String(event?.message ?? event) }; });
      }
      return worker;
    },
    get(target, key, receiver) { return key === '__cotReplayWatch' ? true : Reflect.get(target, key, receiver); },
  });
})();`;

/** In-page: a visible element's click (no coordinates: the HUD may cover it). */
export const clickVisible = (page, selector) => page.evaluate((sel) => {
  const node = [...document.querySelectorAll(sel)].find((el) => el instanceof HTMLElement && el.offsetParent !== null);
  if (!node) return false;
  node.click();
  return true;
}, selector);

/** Enter a solo battle as the player does: the Garage's Deploy key (Enter), then any entry gate, until controls release.
 *  With `mapId` (--map), the Garage's tank on that map through the debug surface's solo start (the Garage plans its own). */
export async function enterBattle(page, mapId = null) {
  await page.waitForFunction(readinessExpression('garage'), { timeout: 300_000, polling: 250 });
  await sleep(500);
  if (mapId) await page.evaluate((map) => { setTimeout(() => window.__DEBUG.beginSoloBattle({ mapId: map }), 0); }, mapId);
  else await page.keyboard.press('Enter');
  const until = Date.now() + 300_000;
  while (Date.now() < until) {
    if (await page.evaluate(readinessExpression('controlsReleased'))) return;
    // a "press any key" gate on the entry's load screen (the player presses one)
    const gate = await page.evaluate(() => /press\s+any\s+key/i.test(document.body.innerText || ''));
    if (gate) await page.keyboard.press('Space');
    await sleep(750);
  }
  throw new Error('the battle never released its controls');
}

/**
 * Drive with real keys for `seconds`: forward and turns, the gun fired now and then. (replay-receipts-279) The gun is
 * raised before it fires: the mouse moves up, to a fifth of the way down the screen, and every press is there (under
 * pointer lock the move turns the aim up; without the lock the aim follows the cursor, into the sky). The 278 drive pressed
 * a little under the middle, and on a hilly map every shot left into the ground ahead and died before the track's first
 * sample. `raise: false` is that drive (the control). Each press logs the gun's pitch and whether the pointer was locked.
 */
export async function drive(page, seconds, { raise = true, shots = null } = {}) {
  const end = Date.now() + seconds * 1000;
  const vp = page.viewport() ?? { width: 1600, height: 900 };
  const at = raise ? { x: Math.round(vp.width / 2), y: Math.round(vp.height * 0.2) } : { x: 800, y: 420 };
  let turn = 0;
  if (raise) { await page.mouse.move(at.x, Math.round(vp.height * 0.47)); await page.mouse.move(at.x, at.y, { steps: 8 }); }
  await page.keyboard.down('KeyW');
  try {
    while (Date.now() < end) {
      const key = turn++ % 2 ? 'KeyA' : 'KeyD';
      await page.keyboard.down(key);
      await sleep(900);
      await page.keyboard.up(key);
      await page.mouse.click(at.x, at.y);
      shots?.push(await page.evaluate(() => {
        const p = window.__DEBUG?.game?.player;
        return { tick: window.__DEBUG?.game?.tick ?? null, gunPitchDeg: p?.state ? Math.round(p.state.gunPitch * 5730) / 100 : null, locked: !!document.pointerLockElement };
      }));
      await sleep(1100);
    }
  } finally { await page.keyboard.up('KeyW'); }
}

/** Leave a live battle as the player does: Esc opens Settings, its Leave (and a confirm, if one asks), to the Garage. */
export async function leaveBattle(page) {
  // leave as the player does: Esc opens Settings, its Leave (and a confirm, if one asks)
  await page.keyboard.press('Escape');
  await sleep(800);
  if (!(await clickVisible(page, '.cot-set-btn.leave'))) {
    // the player's tank was destroyed: the battle is spectated, and its bar's Garage is the way out
    await page.keyboard.press('Escape');
    await sleep(300);
    const spectating = await page.evaluate(() => {
      const garage = [...document.querySelectorAll('button')].find((b) => b.offsetParent && /^garage$/i.test(b.textContent.trim()));
      garage?.click();
      return !!garage;
    });
    if (!spectating) throw new Error('Settings showed no Leave and no spectator Garage');
  }
  await sleep(600);
  await page.evaluate(() => {
    const confirm = [...document.querySelectorAll('button')].find((b) => b.offsetParent && /^(leave|confirm|yes)/i.test(b.textContent.trim())
      && !b.classList.contains('cot-set-btn'));
    confirm?.click();
  });
  await page.waitForFunction(readinessExpression('garage'), { timeout: 120_000, polling: 250 });
}
