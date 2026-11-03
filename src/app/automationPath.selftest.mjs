// 2026-11-02 audit S3: the game branched on navigator.webdriver in six places (main.ts's diagnostics, drive test, battle
// and Garage scene watchdogs; bootScreen.ts's entry gate; transition.ts's veils), so every receipt certified the
// automation path and a player-path receipt had to spoof Navigator.prototype.webdriver. One owner now reads the page's
// path (src/app/automationPath.ts), tools ask for the player's path explicitly, and docs/AUTOMATION-PATHS.md lists which
// tools take which path, how they enter a battle and which write the game's state, checked here against the tools.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { automationMode, harnessPath, resolveAutomationMode } from './automationPath.ts';
import { createBootScreen } from '../ui/bootScreen.ts';
import { AUTOMATION_PATHS, automationPathScript, requestAutomationPath } from '../../tools/game-readiness.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

// The resolution: an explicit request first (the page flag, then the URL), navigator.webdriver's default, else a player.
{
  const pick = (probe) => { const { driven, harness, path, source } = resolveAutomationMode(probe); return { driven, harness, path, source }; };
  assert.deepEqual(pick({}), { driven: false, harness: false, path: 'player', source: 'none' });
  assert.deepEqual(pick({ webdriver: true }), { driven: true, harness: true, path: 'harness', source: 'webdriver' });
  assert.deepEqual(pick({ webdriver: true, flag: 'player' }), { driven: false, harness: false, path: 'player', source: 'flag' },
    'a player-path receipt under a driver: no shortcuts, no QA surfaces (a cold load never times the test runtime)');
  assert.deepEqual(pick({ webdriver: true, search: '?map=verdant&automation=player' }),
    { driven: false, harness: false, path: 'player', source: 'query' });
  assert.deepEqual(pick({ flag: 'harness' }), { driven: true, harness: true, path: 'harness', source: 'flag' });
  assert.deepEqual(pick({ search: '?automation=harness' }), { driven: true, harness: true, path: 'harness', source: 'query' });
  assert.equal(pick({ flag: 'player', search: '?automation=harness' }).path, 'player', 'the page flag wins over the URL');
  assert.equal(pick({ webdriver: true, flag: 'bogus', search: '?automation=nope' }).source, 'webdriver', 'an unknown request is no request');
  assert.ok(Object.isFrozen(resolveAutomationMode({})));
  assert.deepEqual([...AUTOMATION_PATHS].sort(), ['harness', 'player'], "the tools' vocabulary is the game's");
}

// The page reader reads the page as it is (click-timeline switches a booted page to the player's veils).
{
  const saved = ['window', 'navigator'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  try {
    const page = { location: { search: '' } };
    Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: page });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: { webdriver: true } });
    assert.equal(harnessPath(), true);
    page.__COT_AUTOMATION = 'player';
    assert.equal(harnessPath(), false);
    assert.equal(automationMode().source, 'flag');
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
}

// The tools' request: an init script that sets the page flag before the page's scripts.
{
  assert.equal(automationPathScript('player'), "window.__COT_AUTOMATION = \"player\";");
  assert.throws(() => automationPathScript('webdriver'), /unknown automation path/);
  const scripts = [];
  await requestAutomationPath({ evaluateOnNewDocument: async (fn, value) => scripts.push([fn, value]) }, 'player');
  assert.equal(scripts.length, 1);
  const page = {};
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: page });
  try { scripts[0][0](scripts[0][1]); } finally {
    if (saved) Object.defineProperty(globalThis, 'window', saved); else delete globalThis.window;
  }
  assert.equal(page.__COT_AUTOMATION, 'player', 'the init script sets the page flag');
  await assert.rejects(requestAutomationPath({ evaluateOnNewDocument: async () => {} }, 'automation'), /unknown automation path/);
}

// The entry gate on the player's path: under a driver, a player-path page shows the gate and waits for a key (the
// harness default still auto-skips it). A real-player-path receipt of the boot is possible.
{
  const globals = ['window', 'document', 'navigator', 'Element', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout',
    'clearTimeout', 'setInterval', 'clearInterval'];
  const saved = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const gate = (flag) => {
    const listeners = new Map();
    const classes = new Set();
    const root = { classList: { add: (key) => classes.add(key), remove: (key) => classes.delete(key), contains: (key) => classes.has(key) } };
    const scope = {
      window: { location: { search: '' }, __COT_NO_BOOT_HERO: true, ...(flag ? { __COT_AUTOMATION: flag } : {}),
        addEventListener: (type, callback) => listeners.set(type, callback), removeEventListener: (type) => listeners.delete(type) },
      document: { getElementById: (id) => (id === 'cot-boot' ? root : null), querySelectorAll: () => [], dispatchEvent() {} },
      navigator: { webdriver: true }, Element: class {},
      requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setTimeout: () => 1, clearTimeout() {},
      setInterval: () => 1, clearInterval() {}, // the tips' rotation: no live timer outlives the fixture
    };
    for (const [key, value] of Object.entries(scope)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const boot = createBootScreen({ mode: 'garage' });
    void boot.ready();
    const seen = { gated: boot.gated, listening: listeners.has('keydown'), out: classes.has('cot-boot-out') };
    boot.dismiss();
    return seen;
  };
  try {
    assert.deepEqual(gate(null), { gated: false, listening: false, out: true }, 'the harness default skips the gate');
    assert.deepEqual(gate('player'), { gated: true, listening: true, out: false }, "the player's path waits at the gate");
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
}

// One reader: no module under src/ reads navigator.webdriver except the owner and the two bot exclusions (analytics,
// the telemetry beacon), which must keep seeing a robot on either path; index.html's inline telemetry gate likewise.
{
  const readers = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      if (statSync(file).isDirectory()) { walk(file); continue; }
      if (!/\.(ts|mjs|js)$/.test(name) || /\.(selftest|test-support)\.mjs$/.test(name) || /\.d\.ts$/.test(name)) continue;
      if (/\bwebdriver\b/.test(stripComments(readFileSync(file, 'utf8')))) readers.push(relative(ROOT, file));
    }
  };
  walk(join(ROOT, 'src'));
  assert.deepEqual(readers.sort(), ['src/app/automationPath.ts', 'src/entry/telemetry.ts', 'src/googleAnalytics.ts'],
    'navigator.webdriver readers under src/');
  const html = stripComments(read('index.html'));
  assert.equal((html.match(/\bwebdriver\b/g) ?? []).length, 1, "index.html reads webdriver once, in its telemetry gate");
  assert.match(html, /nav\.webdriver === true\) return false;/);
  // the shortcuts each read the owner where they are decided
  const main = read('src/main.ts');
  assert.match(main, /const automationAtBoot = automationMode\(\);\nconst diagnosticsRequested = import\.meta\.env\.DEV \|\| debugModeRequested\(\) \|\| automationAtBoot\.driven;/);
  assert.match(main, /\|\| automationAtBoot\.driven;\nconst driveTestController/);
  assert.equal((stripComments(main).match(/harnessPath\(\)/g) ?? []).length, 3, 'the battle watchdog (arm and consume) and the Garage watchdog');
  assert.match(read('src/ui/bootScreen.ts'), /if \(\/\[\?&\]\(nosplash\|nogate\)\\b\/\.test\(q\)\) return true;\n[^\n]*\n  return harnessPath\(\);/);
  assert.match(read('src/ui/transition.ts'), /if \(\/\[\?&\]notrans\\b\/\.test\(q\)\) return true;\n[^\n]*\n  return harnessPath\(\);/);
}

// The tools: none hides navigator.webdriver, and docs/AUTOMATION-PATHS.md lists exactly the tools on the player's path,
// each battle entry's users, and the tools that write the game's state outside its transitions.
{
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      if (statSync(file).isDirectory()) { if (name !== 'node_modules' && !name.startsWith('.')) walk(file); continue; }
      if (/\.(mjs|js|cjs|ts)$/.test(name) && !/\.(selftest|test-support)\.mjs$/.test(name)) files.push(file);
    }
  };
  walk(join(ROOT, 'tools'));
  const sources = new Map(files.map((file) => [relative(ROOT, file), readFileSync(file, 'utf8')]));
  const spoofers = [...sources].filter(([, text]) => /Navigator\.prototype,\s*'webdriver'/.test(text)).map(([file]) => file);
  assert.deepEqual(spoofers, [], 'tools that hide navigator.webdriver instead of asking for a path');
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
  const doc = read('docs/AUTOMATION-PATHS.md');
  for (const [key, pattern] of Object.entries(census)) {
    const found = [...sources].filter(([file, text]) => file !== 'tools/game-readiness.mjs' && pattern.test(text))
      .map(([file]) => file).sort();
    const block = doc.match(new RegExp(`<!-- census:${key} -->\\n([\\s\\S]*?)<!-- /census -->`))?.[1];
    assert.ok(block, `docs/AUTOMATION-PATHS.md has the ${key} list`);
    const listed = [...block.matchAll(/^- `([^`]+)`/gm)].map((match) => match[1]).sort();
    assert.deepEqual(listed, found, `docs/AUTOMATION-PATHS.md ${key}: the tools as they are`);
  }
}

console.log('automationPath.selftest: one automation reader, an explicit player path, the gate on it, the tools census');
