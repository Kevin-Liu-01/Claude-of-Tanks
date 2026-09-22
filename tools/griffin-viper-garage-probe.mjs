// Real Garage regression, including the served revision. Run against the
// production build before release, then the live URL after manual deployment.
// node tools/griffin-viper-garage-probe.mjs --url=http://localhost:7437 \
//   --revision=<gated SHA> --out=/absolute/fresh-evidence-directory
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createCaptureLock } from './capture-lock.mjs';

const option = name => process.argv.slice(2).find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const base = option('url'), revision = option('revision'), output = option('out');
assert.ok(base && output && /^[a-f0-9]{9,40}$/.test(revision ?? ''), 'Require --url, --revision and --out');
const out = resolve(output), url = new URL(base);
await mkdir(out, { recursive: false }); // Never replace previous evidence.
const acquisitionSha256 = createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
const report = { ok: false, url: url.href, revision, acquisitionSha256, samples: [], errors: [] };
const lock = createCaptureLock();
let browser, refresh;
try {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, `Garage HTTP ${response.status}`);
  const html = await response.text();
  report.version = html.match(/name="application-version" content="([^"]+)"/)?.[1];
  report.entry = html.match(/src="(\/assets\/main-[^"]+\.js)"/)?.[1];
  assert.ok(report.entry, 'Require a bundled production entry');
  assert.ok(report.version?.endsWith(`+g${revision.slice(0, 9)}`),
    `Served ${report.version}; expected clean revision ${revision.slice(0, 9)}. A push is not a deployment.`);
  await lock.acquire(45 * 60 * 1000);
  refresh = setInterval(() => lock.refresh(), 30000); refresh.unref();
  browser = await puppeteer.launch({ headless: true,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  page.on('pageerror', error => report.errors.push(String(error)));
  // QA exposes read-only diagnostics. Vehicle selection, build context, camera,
  // quality, camouflage and resource ownership stay on the normal Garage path.
  url.searchParams.set('qa', '1'); url.searchParams.set('nosplash', '1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__GAME_READY && window.__DEBUG?.pedestalOnStage,
    { timeout: 120000 });
  await page.waitForSelector('#cot-boot', { hidden: true, timeout: 30000 });
  await page.waitForFunction(() => window.__GARAGE_WORKSHOP?.stats().architecture?.presented,
    { timeout: 60000 });
  async function select(id) {
    const card = await page.waitForSelector(`.cot-card[data-spec-id="${id}"]`, { timeout: 30000 });
    await card.evaluate(el => el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' }));
    await card.click();
    await page.waitForFunction(selected => {
      const d = window.__DEBUG, v = d?.pedestalVisual;
      return d?.selectedSpecId === selected && v?.specId === selected && d.pedestalOnStage
        && v.root.visible && v.root.parent && document.querySelector('.cot-card.sel')?.dataset.specId === selected;
    }, { timeout: 60000 }, id);
  }
  for (const phase of ['first-selection', 'cached-return']) {
    if (phase === 'cached-return') await select('griffin50_x');
    await select('griffin_viper');
    const sample = await page.evaluate(() => {
      const d = window.__DEBUG, root = d.pedestalVisual.root;
      const cable = root.userData.__decorSummary?.pieces.find(p => p.kit === 'cable');
      const hull = root.getObjectByName('rig_hull');
      const support = cable?.attachment?.supportPoint;
      const points = [], meshes = [];
      // Read the final rendered geometry, after static batching. Every sample
      // must remain in a narrow band on the right side, running fore-aft.
      if (support && hull) {
        root.updateMatrixWorld(true);
        const p = root.position.clone();
        hull.traverse(mesh => {
          if (!mesh.isMesh || mesh.name !== 'decor_hull_steel') return;
          const a = mesh.geometry?.attributes.position;
          if (!a) return;
          let count = 0;
          for (let i = 0; i < a.count; i++) {
            p.fromBufferAttribute(a, i).applyMatrix4(mesh.matrixWorld); hull.worldToLocal(p);
            if (p.x > support[0] + .01 && p.x < support[0] + .13
              && Math.abs(p.y - support[1]) < .15 && Math.abs(p.z - support[2]) < 1.6) {
              points.push([p.x, p.y, p.z]); count++;
            }
          }
          if (count) meshes.push({ name: mesh.name, vertices: count, receiveShadow: mesh.receiveShadow });
        });
      }
      return { version: document.querySelector('meta[name="application-version"]')?.content,
        entry: [...document.scripts].map(script => script.getAttribute('src')).find(src => src?.startsWith('/assets/main-')),
        specId: d.selectedSpecId, rootId: root.uuid, cable, points, meshes,
        staticBatchSavedDraws: root.userData.staticBatchSavedDraws,
        camera: d.camera.position.toArray(), quality: d.quality.resolvePresetName(),
        cached: d.pedestalCacheIds.includes('griffin_viper') };
    });
    report.samples.push({ phase, ...sample });
    await page.screenshot({ path: `${out}/${phase}.png` });
    assert.equal(sample.version, report.version, 'Browser and served document must be the same release');
    assert.equal(sample.entry, report.entry, 'Browser must load the approved production entry');
    if (phase === 'cached-return') assert.equal(sample.rootId, report.samples[0].rootId, 'Return to the cached visual');
    assert.equal(sample.cable?.frame, 'hull', 'Retain the tow cable on the hull');
    assert.equal(sample.cable?.attachment?.slot, 'hull-side-cable', 'The garage must use the repaired side mount');
    assert.ok(sample.cable.attachment.alignmentDot > .99999, 'Clamps face hull armor');
    assert.ok(Math.abs(sample.cable.attachment.supportGapM + .004) < .001, 'Clamp bases contact armor');
    // Already-merged profiles can legitimately save zero further draws.
    assert.ok(Number.isInteger(sample.staticBatchSavedDraws) && sample.staticBatchSavedDraws >= 0,
      'Exercise the actual static-batching stage in the Garage');
    const z = sample.points.map(p => p[2]);
    assert.ok(z.length > 150 && Math.max(...z) - Math.min(...z) > 2.3,
      'Rendered cable extends fore-aft across the hull side');
    for (const station of [-1.2, -.6, 0, .6, 1.2]) {
      assert.ok(z.some(value => Math.abs(value - station) < .15), `Cable stock exists at hull station ${station}`);
    }
    assert.ok(sample.meshes.some(mesh => mesh.receiveShadow), 'Cable retains the live shaded material path');
  }
  assert.deepEqual(report.errors, [], 'No uncaught garage errors');
  report.ok = true;
} catch (error) {
  report.failure = String(error);
  process.exitCode = 1;
} finally {
  try { await browser?.close(); }
  catch (error) { report.ok = false; report.errors.push(`Browser cleanup: ${error}`); process.exitCode = 1; }
  finally {
    clearInterval(refresh); lock.release();
    await writeFile(`${out}/receipt.json`, JSON.stringify(report, null, 2));
  }
}
console.log(JSON.stringify({ ok: report.ok, version: report.version, failure: report.failure, out }));
