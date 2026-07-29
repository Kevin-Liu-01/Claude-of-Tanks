// tools/tmp-cs-r3-bonusprobe.mjs — camo_spotting r3: live check that the
// +3.5% camo paint bonus is granted ONLY when the pattern matches the
// battle biome (AUTO always matches; factory and mismatched picks get 0).
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: {
    port: 6700 + Math.floor(Math.random() * 200), strictPort: false,
    hmr: false, watch: { ignored: ['**/*'] },
  },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
let failed = false;
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  const res = await page.evaluate(async () => {
    const M = await import('/src/vehicles/materials.js');
    const D = window.__DEBUG;
    const out = {};
    const probe = (mapId, sel) => {
      M.setCamoSelection(D.game.player.specId, sel);
      const c = D.spotting.getConcealment(D.game.player, 1);
      return Math.round(c.paint * 1000) / 1000;
    };
    D.startBattle('m4a3e8', 'verdant');   // startBattle sets biome 'verdant'
    out.verdant_summer = probe('verdant', 'summer');   // match -> 0.035
    out.verdant_winter = probe('verdant', 'winter');   // mismatch -> 0
    out.verdant_auto = probe('verdant', 'auto');       // auto -> 0.035
    out.verdant_factory = probe('verdant', 'factory'); // factory -> 0
    D.startBattle('m4a3e8', 'desert');
    out.desert_winter = probe('desert', 'winter');     // mismatch -> 0
    out.desert_desert = probe('desert', 'desert');     // match -> 0.035
    out.desert_auto = probe('desert', 'auto');         // auto -> 0.035
    D.startBattle('m4a3e8', 'urban');
    out.urban_digital = probe('urban', 'digital');     // manual digital != internal urban -> 0
    out.urban_auto = probe('urban', 'auto');           // auto -> urban -> 0.035
    M.setCamoSelection(D.game.player.specId, 'factory');
    return out;
  });
  const want = {
    verdant_summer: 0.035, verdant_winter: 0, verdant_auto: 0.035, verdant_factory: 0,
    desert_winter: 0, desert_desert: 0.035, desert_auto: 0.035,
    urban_digital: 0, urban_auto: 0.035,
  };
  for (const [k, v] of Object.entries(want)) {
    const ok = res[k] === v;
    console.log(`[bonus] ${ok ? ' ok ' : 'FAIL'} ${k}: ${res[k]} (want ${v})`);
    if (!ok) failed = true;
  }
} catch (e) {
  failed = true;
  console.error(`[bonus] FAILED: ${e.message}`);
} finally {
  if (errors.length) { console.error(`[bonus] console errors: ${errors.length}`); for (const e of errors.slice(0, 10)) console.error(`  ${e}`); }
  await browser.close();
  await server.close();
}
process.exit(failed || errors.length ? 1 : 0);
