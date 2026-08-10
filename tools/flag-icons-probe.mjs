// Browser regression gate for the official lipis/flag-icons migration.
// Verifies every garage card plus the selected vehicle detail, then captures
// one visual proof frame outside the tracked screenshot tree.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const expectedCodes = ['cn', 'de', 'fr', 'gb', 'il', 'it', 'jp', 'kr', 'pl', 'ru', 'se', 'ua', 'us'];
const failures = [];
let checks = 0;
const check = (name, ok, detail = '') => {
  checks++;
  if (ok) console.log(`  PASS ${name}${detail ? ` (${detail})` : ''}`);
  else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.error(`  FAIL ${name}${detail ? ` (${detail})` : ''}`);
  }
};

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { port: 7600 + Math.floor(Math.random() * 300), strictPort: false, hmr: false, watch: null },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/?nosplash`;
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const browserErrors = [];
page.on('pageerror', (error) => browserErrors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('favicon')) browserErrors.push(message.text());
});

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
  await page.waitForFunction(() => {
    const flags = [...document.querySelectorAll('.cot-card img.cot-flag')];
    return flags.length > 0 && flags.every((image) => image.complete && image.naturalWidth > 0);
  }, { timeout: 30000 });

  const audit = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.cot-card')];
    const flags = cards.map((card) => card.querySelector('.flag img.cot-flag'));
    const stats = document.querySelector('.cot-garage .stats .sub img.cot-flag');
    const selected = document.querySelector('.cot-card.sel .flag img.cot-flag');
    const badAspect = flags.filter((image) => {
      if (!image) return false;
      const box = image.getBoundingClientRect();
      return Math.abs((box.width / box.height) - (4 / 3)) > 0.04;
    }).length;
    return {
      cards: cards.length,
      flags: flags.filter(Boolean).length,
      loaded: flags.filter((image) => image?.complete && image.naturalWidth > 0).length,
      codes: [...new Set(flags.map((image) => image?.dataset.countryCode).filter(Boolean))].sort(),
      remote: flags.filter((image) => image && new URL(image.currentSrc).origin !== location.origin &&
        !image.currentSrc.startsWith('data:')).length,
      oldInlineSvg: document.querySelectorAll('.cot-card .flag svg, .cot-garage .stats .sub svg').length,
      badAspect,
      statsLoaded: !!(stats?.complete && stats.naturalWidth > 0),
      statsCode: stats?.dataset.countryCode || null,
      selectedCode: selected?.dataset.countryCode || null,
    };
  });

  check('one official icon per garage card', audit.cards > 0 && audit.flags === audit.cards,
    `${audit.flags}/${audit.cards}`);
  check('every card icon decodes', audit.loaded === audit.flags, `${audit.loaded}/${audit.flags}`);
  check('all roster mappings appear', JSON.stringify(audit.codes) === JSON.stringify(expectedCodes),
    audit.codes.join(','));
  check('no remote flag fetches', audit.remote === 0, String(audit.remote));
  check('old inline flag drawings are gone', audit.oldInlineSvg === 0, String(audit.oldInlineSvg));
  check('official 4x3 aspect ratio is preserved', audit.badAspect === 0, `${audit.badAspect} distorted`);
  check('selected-vehicle detail icon matches its card', audit.statsLoaded && audit.statsCode === audit.selectedCode,
    `${audit.statsCode}/${audit.selectedCode}`);
  check('no browser errors', browserErrors.length === 0, browserErrors.join(' | '));

  await page.screenshot({ path: '/private/tmp/cot-flag-icons-proof.png', type: 'png' });
  console.log('  proof /private/tmp/cot-flag-icons-proof.png');
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(`\nflag-icons-probe: ${failures.length}/${checks} failed`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`\nflag-icons-probe: all ${checks} checks passed`);
