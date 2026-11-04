// 2026-11-02 audit S3: the game branched on navigator.webdriver in six places (main.ts's diagnostics, drive test, battle
// and Garage scene watchdogs; bootScreen.ts's entry gate; transition.ts's veils), so every receipt certified the
// automation path and a player-path receipt had to spoof Navigator.prototype.webdriver. One owner now reads the page's
// path (src/app/automationPath.ts) from an explicit request only; every tool's browser asks for the harness path at
// launch (tools/browser-launch.mjs -> tools/game-readiness.mjs prepareToolBrowser), a player-path tool asks for the
// player's and checks the page took it, and docs/AUTOMATION-PATHS.md lists which tools take which path, how they enter a
// battle and which write the game's state, checked here against the tools.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { automationMode, harnessPath, resolveAutomationMode } from './automationPath.ts';
import { createBootScreen } from '../ui/bootScreen.ts';
import {
  AUTOMATION_PATHS, HARNESS_DEFAULT_SCRIPT, assertAutomationPath, automationPathScript, prepareToolBrowser, requestAutomationPath,
  sessionPathProblem,
} from '../../tools/game-readiness.mjs';
import { launchGuardedBrowser } from '../../tools/browser-launch.mjs';
import { codeText, toolCensusFiles } from '../../tools/code-text.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const htmlComments = (text) => text.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

/** Run `fn` with these globals in place, then put the originals back. */
function withGlobals(values, fn) {
  const saved = Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  try { return fn(); } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
}

// The resolution: an explicit request only (the page flag, then the URL); a page that asks for nothing is a player's.
{
  const pick = (probe) => { const { driven, harness, path, source } = resolveAutomationMode(probe); return { driven, harness, path, source }; };
  assert.deepEqual(pick({}), { driven: false, harness: false, path: 'player', source: 'none' });
  assert.deepEqual(pick({ flag: 'player' }), { driven: false, harness: false, path: 'player', source: 'flag' },
    'a player-path receipt: no shortcuts, no QA surfaces (a cold load never times the test runtime)');
  assert.deepEqual(pick({ search: '?map=verdant&automation=player' }), { driven: false, harness: false, path: 'player', source: 'query' });
  assert.deepEqual(pick({ flag: 'harness' }), { driven: true, harness: true, path: 'harness', source: 'flag' });
  assert.deepEqual(pick({ search: '?automation=harness' }), { driven: true, harness: true, path: 'harness', source: 'query' });
  assert.equal(pick({ flag: 'player', search: '?automation=harness' }).path, 'player', 'the page flag wins over the URL');
  assert.equal(pick({ flag: 'bogus', search: '?automation=nope' }).source, 'none', 'an unknown request is no request');
  assert.ok(Object.isFrozen(resolveAutomationMode({})));
  assert.deepEqual([...AUTOMATION_PATHS].sort(), ['harness', 'player'], "the tools' vocabulary is the game's");
}

// The page reader reads the page as it is, and never the driver: a driven page that asks for nothing is a player's
// page (the gate waits, the veils run); click-timeline switches a booted page to the player's veils.
{
  const page = { location: { search: '' } };
  withGlobals({ window: page, navigator: { webdriver: true } }, () => {
    assert.equal(harnessPath(), false, 'navigator.webdriver alone picks no path');
    assert.equal(automationMode().source, 'none');
    page.__COT_AUTOMATION = 'harness';
    assert.equal(harnessPath(), true);
    page.__COT_AUTOMATION = 'player';
    assert.equal(harnessPath(), false);
    assert.equal(automationMode().source, 'flag');
  });
}

// The requests: a tool's (an init script that sets the page flag) and the launcher's (the harness path unless the tool
// asked for a path: its own script runs later and wins, and a `?automation=` in its URL is left to the URL).
{
  assert.equal(automationPathScript('player'), "window.__COT_AUTOMATION = \"player\";");
  assert.throws(() => automationPathScript('webdriver'), /unknown automation path/);
  await assert.rejects(requestAutomationPath({ evaluateOnNewDocument: async () => {} }, 'automation'), /unknown automation path/);
  /** A new document: run its init scripts in order, then resolve its path as the game does. */
  const document = (scripts, search = '') => {
    const win = { location: { search } };
    for (const [script, arg] of scripts) new Function('window', 'location', typeof script === 'string' ? script : `(${script})(${JSON.stringify(arg)});`)(win, win.location);
    return resolveAutomationMode({ flag: win.__COT_AUTOMATION, search }).path;
  };
  const toolScripts = [];
  await requestAutomationPath({ evaluateOnNewDocument: async (fn, value) => toolScripts.push([fn, value]) }, 'player');
  assert.equal(document([[HARNESS_DEFAULT_SCRIPT]]), 'harness', "a tool's page is driven unless it asks");
  assert.equal(document([[HARNESS_DEFAULT_SCRIPT], ...toolScripts]), 'player', "the tool's request runs after the launcher's and wins");
  assert.equal(document([[HARNESS_DEFAULT_SCRIPT], [automationPathScript('player')]]), 'player');
  assert.equal(document([[HARNESS_DEFAULT_SCRIPT]], '?nosplash=1&automation=player'), 'player', 'a URL request is the URL\'s');
  assert.equal(document([]), 'player', 'a page nobody prepared is a player\'s');
}

// The launcher prepares every page it hands out, before the tool sees the page: puppeteer's Browser.newPage, its
// contexts' newPage (createBrowserContext, the default context) and the pages already open; playwright's newContext,
// Browser.newPage and a persistent context. The doubles start no process, so the guard hands them back unwatched.
{
  const puppeteerPage = (name) => ({ name, scripts: [], async evaluateOnNewDocument(script, ...args) { this.scripts.push([script, ...args]); } });
  const context = (name) => ({ opened: [], async newPage() { const page = puppeteerPage(`${name}:${this.opened.length}`); this.opened.push(page); return page; },
    async pages() { return this.opened; } });
  const initial = puppeteerPage('about:blank');
  const defaultContext = context('default');
  defaultContext.opened.push(initial);
  const fakeBrowser = {
    async newPage() { return defaultContext.newPage(); },
    async createBrowserContext() { return context('fresh'); },
    defaultBrowserContext: () => defaultContext,
    async close() {},
  };
  const browser = await launchGuardedBrowser({ async launch() { return fakeBrowser; } }, { headless: true });
  assert.equal(browser, fakeBrowser, 'the browser the launcher made');
  assert.deepEqual(initial.scripts, [[HARNESS_DEFAULT_SCRIPT]], 'the page already open is prepared before the tool sees it');
  const page = await browser.newPage();
  await requestAutomationPath(page, 'player');
  assert.equal(page.scripts.length, 2, 'prepared once');
  assert.equal(page.scripts[0][0], HARNESS_DEFAULT_SCRIPT, "the launcher's request is the page's first script");
  for (const fresh of [await (await browser.createBrowserContext()).newPage(), await browser.defaultBrowserContext().newPage()]) {
    assert.deepEqual(fresh.scripts, [[HARNESS_DEFAULT_SCRIPT]], `${fresh.name}: prepared`);
  }

  const playwrightScripts = [];
  const playwrightContext = () => ({ async addInitScript(script) { playwrightScripts.push(script); }, async newPage() { return {}; } });
  const chromium = { async launch() { return { async newContext() { return playwrightContext(); },
    async newPage() { return { async addInitScript(script) { playwrightScripts.push(`page:${script}`); } }; }, async close() {} }; },
  async launchPersistentContext() { return playwrightContext(); } };
  const pw = await launchGuardedBrowser(chromium, { headless: true });
  await pw.newContext();
  await pw.newPage();
  await launchGuardedBrowser(chromium, { headless: true }, { method: 'launchPersistentContext', userDataDir: '/nowhere' });
  assert.deepEqual(playwrightScripts, [HARNESS_DEFAULT_SCRIPT, `page:${HARNESS_DEFAULT_SCRIPT}`, HARNESS_DEFAULT_SCRIPT],
    'every playwright context and page: one init script');
  assert.equal(await prepareToolBrowser(fakeBrowser), fakeBrowser, 'idempotent');
  assert.equal(initial.scripts.length, 1);
}

// After the boot a player-path tool checks the path the page took. A build before the owner ignores the request and
// decides by navigator.webdriver (so a tool that may load one hides the driver at launch); either way a page that took
// the other path fails by name.
{
  const page = (facts) => ({ evaluate: async (fn) => withGlobals({ window: facts.window, navigator: { webdriver: facts.webdriver } }, fn) });
  assert.deepEqual(await assertAutomationPath(page({ window: { __AUTOMATION_PATH: { path: 'player', source: 'flag' } }, webdriver: true }), 'player'),
    { path: 'player', source: 'flag', webdriver: true, legacy: false });
  await assert.rejects(assertAutomationPath(page({ window: { __AUTOMATION_PATH: { path: 'harness', source: 'flag' } }, webdriver: true }), 'player',
    { label: 'gate-audio-probe base' }), /gate-audio-probe base asked for the player path and took the harness path/);
  assert.equal((await assertAutomationPath(page({ window: {}, webdriver: false }), 'player')).legacy, true, 'an older build with the driver hidden');
  await assert.rejects(assertAutomationPath(page({ window: {}, webdriver: true }), 'player'),
    /publishes no window\.__AUTOMATION_PATH.*took the harness path; launch with --disable-blink-features=AutomationControlled/);
  assert.equal(sessionPathProblem('harness', 'harness'), null);
  assert.match(sessionPathProblem('player', 'harness'), /open it with &automation=harness/);
}

// The entry gate on the player's path: a player-path page shows the gate and waits for a key, under a driver or not;
// the harness path auto-skips it. A real-player-path receipt of the boot is possible.
{
  const gate = ({ flag = null, webdriver = true } = {}) => {
    const listeners = new Map();
    const classes = new Set();
    const root = { classList: { add: (key) => classes.add(key), remove: (key) => classes.delete(key), contains: (key) => classes.has(key) } };
    return withGlobals({
      window: { location: { search: '' }, __COT_NO_BOOT_HERO: true, ...(flag ? { __COT_AUTOMATION: flag } : {}),
        addEventListener: (type, callback) => listeners.set(type, callback), removeEventListener: (type) => listeners.delete(type) },
      document: { getElementById: (id) => (id === 'cot-boot' ? root : null), querySelectorAll: () => [], dispatchEvent() {} },
      navigator: { webdriver }, Element: class {},
      requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setTimeout: () => 1, clearTimeout() {},
      setInterval: () => 1, clearInterval() {}, // the tips' rotation: no live timer outlives the fixture
    }, () => {
      const boot = createBootScreen({ mode: 'garage' });
      void boot.ready();
      const seen = { gated: boot.gated, listening: listeners.has('keydown'), out: classes.has('cot-boot-out') };
      boot.dismiss();
      return seen;
    });
  };
  assert.deepEqual(gate({ flag: 'harness' }), { gated: false, listening: false, out: true }, 'the harness path skips the gate');
  assert.deepEqual(gate({ flag: 'player' }), { gated: true, listening: true, out: false }, "the player's path waits at the gate");
  assert.deepEqual(gate(), { gated: true, listening: true, out: false }, 'a driven page that asks for nothing is a player\'s');
}

// One reader, and no driver sniffing: no module under src/ reads navigator.webdriver except the two bot exclusions
// (analytics, the telemetry beacon), which must keep seeing a robot on either path; index.html's inline telemetry gate
// likewise. The owner itself reads only the request.
{
  const readers = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      if (statSync(file).isDirectory()) { walk(file); continue; }
      if (!/\.(ts|mjs|js)$/.test(name) || /\.(selftest|test-support)\.mjs$/.test(name) || /\.d\.ts$/.test(name)) continue;
      const raw = readFileSync(file, 'utf8');
      if (/\bwebdriver\b/.test(raw) && /\bwebdriver\b/.test(codeText(raw, name))) readers.push(relative(ROOT, file));
    }
  };
  walk(join(ROOT, 'src'));
  assert.deepEqual(readers.sort(), ['src/entry/telemetry.ts', 'src/googleAnalytics.ts'], 'navigator.webdriver readers under src/');
  const html = htmlComments(read('index.html'));
  assert.equal((html.match(/\bwebdriver\b/g) ?? []).length, 1, "index.html reads webdriver once, in its telemetry gate");
  assert.match(html, /nav\.webdriver === true\) return false;/);
  // the shortcuts each read the owner where they are decided
  const main = read('src/main.ts');
  assert.match(main, /const automationAtBoot = automationMode\(\);\nconst diagnosticsRequested = import\.meta\.env\.DEV \|\| debugModeRequested\(\) \|\| automationAtBoot\.driven;/);
  assert.match(main, /\|\| automationAtBoot\.driven;\nconst driveTestController/);
  assert.equal((codeText(main, 'main.ts').match(/harnessPath\(\)/g) ?? []).length, 3, 'the battle watchdog (arm and consume) and the Garage watchdog');
  assert.match(read('src/ui/bootScreen.ts'), /if \(\/\[\?&\]\(nosplash\|nogate\)\\b\/\.test\(q\)\) return true;\n[^\n]*\n  return harnessPath\(\);/);
  assert.match(read('src/ui/transition.ts'), /if \(\/\[\?&\]notrans\\b\/\.test\(q\)\) return true;\n[^\n]*\n  return harnessPath\(\);/);
  // the launcher makes the harness request for every browser it starts
  assert.match(read('tools/browser-launch.mjs'), /\n {2}await prepareToolBrowser\(target\);\n {2}let rootPid = null;/);
}

/** The tools that define navigator.webdriver in a page, each with its reason (docs/AUTOMATION-PATHS.md names them). */
const SPOOF_EXCEPTIONS = new Map([
  ['tools/click-timeline.mjs', 'its battle document boots driven for __DEBUG on an A/B base that predates the owner, '
    + 'which decides by navigator.webdriver alone while the driver is hidden at launch; the probe mirrors its one '
    + 'choice (window.__cotAutomation) onto the request and the driver'],
]);

// The tools (and the selftests that drive a page): none hides navigator.webdriver by hand but the named exception;
// docs/AUTOMATION-PATHS.md lists exactly the tools on the player's path (each checks the path its page took), each
// battle entry's users, and the tools that write the game's state outside its transitions; a browser a tool connects to
// (not one it launched) is prepared as a launched one is; an agent-browser session tool checks the path its session's
// page took.
{
  const files = toolCensusFiles(ROOT);
  assert.ok(files.includes('tools/black-world.browser.selftest.mjs') && files.includes('tools/destruction-first-use.browser.selftest.mjs'),
    'the census reads the selftests that drive a page');
  const raw = new Map(files.map((file) => [file, read(file)]));
  const spoofers = [...raw].filter(([, text]) => /Navigator\.prototype,\s*'webdriver'/.test(text)).map(([file]) => file);
  assert.deepEqual(spoofers, [...SPOOF_EXCEPTIONS.keys()], 'tools that define navigator.webdriver by hand instead of asking for a path');
  const never = read('docs/AUTOMATION-PATHS.md').match(/\nNever spoof `navigator\.webdriver`[^\n]*(?:\n[^\n]+)*/)?.[0] ?? '';
  for (const file of SPOOF_EXCEPTIONS.keys()) assert.ok(never.includes(`\`${file}\``), `docs/AUTOMATION-PATHS.md names the exception ${file}`);
  const census = {
    player: /__COT_AUTOMATION\s*=\s*'player'|requestAutomationPath\(\s*\w+\s*,\s*'player'\s*\)|automationPathScript\(\s*'player'\s*\)|defineProperty\(window,\s*'__COT_AUTOMATION'/,
    startBattle: /\.startBattle\(/,
    beginSoloBattle: /\.beginSoloBattle\(/,
    beginBattleEntry: /\.beginBattleEntry\(/,
    preBattleS: /\bgame\.preBattleS\s*=(?!=)/,
    battleCount: /\b(?:__DEBUG|D|d)\.game\.battleCount\s*=(?!=)/,
    loaderClasses: /'\.cot-bl'[^\n]*classList\.(?:add|remove|toggle)/,
    reveal: /__BATTLE_REVEAL\s*=(?!=)/,
  };
  const any = new RegExp(Object.values(census).map((pattern) => pattern.source).join('|'));
  const code = new Map([...raw].filter(([file, text]) => file !== 'tools/game-readiness.mjs' && any.test(text))
    .map(([file, text]) => [file, codeText(text, file)]));
  const doc = read('docs/AUTOMATION-PATHS.md');
  const listed = (key) => {
    const block = doc.match(new RegExp(`<!-- census:${key} -->\\n([\\s\\S]*?)<!-- /census -->`))?.[1];
    assert.ok(block, `docs/AUTOMATION-PATHS.md has the ${key} list`);
    return [...block.matchAll(/^- `([^`]+)`/gm)].map((match) => match[1]).sort();
  };
  for (const [key, pattern] of Object.entries(census)) {
    const found = [...code].filter(([, text]) => pattern.test(text)).map(([file]) => file).sort();
    assert.deepEqual(listed(key), found, `docs/AUTOMATION-PATHS.md ${key}: the tools as they are`);
  }
  for (const file of listed('player')) {
    assert.match(code.get(file), /\bassertAutomationPath\(/, `${file}: a player-path tool checks the path its page took`);
  }
  const connect = /\b(?:puppeteer|chromium|firefox|webkit)\s*\.\s*connect(?:OverCDP)?\s*\(|\.connectOverCDP\s*\(/;
  for (const [file, text] of raw) {
    if (!connect.test(text)) continue;
    for (const line of codeText(text, file).split('\n').filter((row) => connect.test(row))) {
      assert.match(line, /prepareToolBrowser\(/, `${file}: a connected browser's pages ask for a path (${line.trim()})`);
    }
  }
  const sessions = [...raw].filter(([, text]) => /execFileSync\(\s*'agent-browser'/.test(text)).map(([file]) => file).sort();
  assert.deepEqual(sessions, ['tools/capture-world-collision-manifests.mjs', 'tools/map-shadow-audit.mjs', 'tools/render-stability-audit.mjs']);
  for (const file of sessions) {
    assert.match(raw.get(file), /sessionPathProblem\(/, `${file}: checks the path its session's page took`);
    assert.match(raw.get(file), /automation=harness/, `${file}: its usage opens the session on the harness path`);
  }
}

// The exception, run: click-timeline's probe on both kinds of build. Its battle document must boot driven (the build
// then installs __DEBUG, which the battle paths need) and hand over to the player's path once warm; its game document
// is the player's throughout. A build before the owner decides by navigator.webdriver alone (item/sm-fix-app-flow
// src/main.ts:702, `diagnosticsRequested = DEV || debugModeRequested() || navigator.webdriver`), and the tool hides the
// driver at launch; round 1's probe made only the request, so such a build's battle document never installed __DEBUG
// and never warmed (the A/B against main broke).
{
  const source = read('tools/click-timeline.mjs');
  const probe = new Function(`return ${source.match(/\nconst PROBE = (`\(\(\) => \{[\s\S]*?\n\}\)\(\);`);\n/)[1]};`)();
  assert.match(source, /'--disable-blink-features=AutomationControlled'/, 'click-timeline hides the driver at launch');
  assert.match(source, /if \(DOCS\[doc\]\.automation\) await page\.evaluateOnNewDocument\('window\.__cotAutomation = true;'\);/);
  assert.match(source, /after: async \(page\) => \{ await page\.evaluate\(\(\) => \{ window\.__cotAutomation = false; \}\); \}/);
  /** One document: the launcher's request, the tool's scripts, then the build's boot decision. */
  const open = (script, { owner, battle }) => {
    class Navigator {}
    Object.defineProperty(Navigator.prototype, 'webdriver', { configurable: true, get: () => false }); // AutomationControlled
    const nav = new Navigator();
    const win = { location: { search: '?nogate' } };
    const run = (text) => new Function('window', 'location', 'Navigator', 'navigator', 'HTMLCanvasElement', 'requestAnimationFrame', text)(
      win, win.location, Navigator, nav, class { getContext() { return null; } }, () => 0);
    run(HARNESS_DEFAULT_SCRIPT);
    if (battle) run('window.__cotAutomation = true;');
    run(script);
    if (owner) Object.defineProperty(win, '__AUTOMATION_PATH', { get: () => resolveAutomationMode({ flag: win.__COT_AUTOMATION, search: win.location.search }) });
    const driven = owner ? win.__AUTOMATION_PATH.driven : nav.webdriver === true;
    if (driven) win.__DEBUG = { slayEnemies() {} };
    return { win, nav, debug: typeof win.__DEBUG?.slayEnemies === 'function' };
  };
  const handOver = async ({ win, nav }) => {
    win.__cotAutomation = false; // DOCS.battle.after
    return assertAutomationPath({ evaluate: async (fn) => withGlobals({ window: win, navigator: nav }, fn) }, 'player');
  };
  for (const owner of [false, true]) {
    const battle = open(probe, { owner, battle: true });
    assert.equal(battle.debug, true, `${owner ? 'a build with the owner' : 'an older build'}: the battle document boots driven`);
    const took = await handOver(battle);
    assert.deepEqual([took.path, took.legacy], ['player', !owner], 'and is timed on the player\'s path once warm');
    const game = open(probe, { owner, battle: false });
    assert.equal(game.debug, false, 'the game document is the player\'s from its boot');
    assert.equal(game.nav.webdriver, false, 'analytics and telemetry see a player there, as before the owner');
    assert.equal((await assertAutomationPath({ evaluate: async (fn) => withGlobals({ window: game.win, navigator: game.nav }, fn) }, 'player')).path, 'player');
  }
  const requestOnly = probe.replace(/\n {2}Object\.defineProperty\(Navigator\.prototype, 'webdriver'[^\n]*/, '');
  assert.notEqual(requestOnly, probe);
  assert.equal(open(requestOnly, { owner: false, battle: true }).debug, false, '(round 1: the older build never installed __DEBUG)');
}

console.log('automationPath.selftest: a requested path only, the launcher\'s harness request, the player path checked, the tools census');
