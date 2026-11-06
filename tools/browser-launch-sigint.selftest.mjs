// (round 3 B16) SIGINT and the guarded browser (tools/browser-launch.mjs launchGuardedBrowser). puppeteer-core hands its
// handleSIGINT (true unless the caller says otherwise) to @puppeteer/browsers' launch, whose SIGINT listener kills the
// browser and calls process.exit(130) inside itself: on Ctrl-C a capture hold's unwind (tools/capture-hold.mjs, which
// owns SIGTERM, SIGINT and SIGHUP) and a tool's own cooperative SIGINT handler were cut off before they ran, while SIGTERM
// (puppeteer closes the browser and exits nothing) let both run. Now the launch hands handleSIGINT: false unless the caller
// sets it, and the guard answers SIGINT only when nothing else in the process does: it exits 130 as puppeteer did, and the
// exit hooks kill the browser. Driven through @puppeteer/browsers' own launch with puppeteer-core's defaults; a node child
// stands in for Chrome, so no browser starts.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchGuardedBrowser } from './browser-launch.mjs';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// ---- the launch's options: SIGINT is the guard's unless the caller sets it; SIGTERM and SIGHUP are left as they were -----
{
  const seen = [];
  const double = { launch: async (options) => { seen.push(options); return { double: true }; } };
  await launchGuardedBrowser(double, { headless: true });
  await launchGuardedBrowser(double, { handleSIGINT: true });
  await launchGuardedBrowser(double, { handleSIGINT: false, handleSIGTERM: false });
  assert.deepEqual(seen.map((options) => [options.handleSIGINT, options.handleSIGTERM, options.handleSIGHUP]),
    [[false, undefined, undefined], [true, undefined, undefined], [false, false, undefined]],
    'handleSIGINT false by default, a caller\'s own choice kept, SIGTERM and SIGHUP untouched');
  assert.equal(process.listenerCount('SIGINT'), 0, 'a test double leaves no SIGINT listener behind');
}

// a child script with a guarded stand-in browser launched as puppeteer launches Chrome; `body` runs once it is up
const browsersUrl = import.meta.resolve('@puppeteer/browsers');
const childScript = (events, body) => `import { appendFileSync } from 'node:fs';
  import { launch } from ${JSON.stringify(browsersUrl)};
  import { launchGuardedBrowser } from ${JSON.stringify(new URL('./browser-launch.mjs', import.meta.url).href)};
  const note = (line) => appendFileSync(${JSON.stringify(events)}, line + '\\n');
  // puppeteer-core's BrowserLauncher.launch: handleSIGINT/SIGTERM/SIGHUP default true, handed to @puppeteer/browsers
  const puppeteerLike = { launch: async ({ args = [], handleSIGINT = true, handleSIGTERM = true, handleSIGHUP = true }) => {
    const proc = launch({ executablePath: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)', '--', ...args],
      handleSIGINT, handleSIGTERM, handleSIGHUP });
    return { process: () => proc.nodeProcess, close: () => proc.close() };
  } };
  ${body}`;
async function runChild(name, body, { signal = 'SIGINT' } = {}) {
  const root = mkdtempSync(join(tmpdir(), `cot-launch-sigint-${name}-`));
  const events = join(root, 'events');
  writeFileSync(events, '');
  let browserPid = 0;
  try {
    const child = spawn(process.execPath, ['--input-type=module', '-e', childScript(events, body)], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.setEncoding('utf8').on('data', (chunk) => { err += chunk; });
    const read = () => readFileSync(events, 'utf8').trim().split('\n').filter(Boolean);
    for (let i = 0; i < 800 && !read().some((line) => line.startsWith('up ')); i++) await sleep(25);
    browserPid = Number(/browser=(\d+)/.exec(read().find((line) => line.startsWith('up ')) ?? '')?.[1]);
    assert.ok(browserPid > 0, `${name}: the child is up with its browser: ${err.slice(-400)}`);
    child.kill(signal);
    const code = await new Promise((done) => child.once('close', (status, killedBy) => done(status ?? killedBy)));
    for (let i = 0; i < 100; i++) { try { process.kill(browserPid, 0); await sleep(20); } catch { break; } }
    const gone = (() => { try { process.kill(browserPid, 0); return false; } catch { return true; } })();
    return { code, lines: read(), err, gone };
  } finally {
    try { if (browserPid > 0) process.kill(browserPid, 'SIGKILL'); } catch { /* gone */ }
    rmSync(root, { recursive: true, force: true });
  }
}

// ---- nothing else answers SIGINT: the process still ends 130 on Ctrl-C, and its browser goes with it ---------------------
{
  const { code, lines, err, gone } = await runChild('alone', `
    const browser = await launchGuardedBrowser(puppeteerLike, {}, { label: 'stand-in', intervalMs: 60_000 });
    note('listeners ' + process.listenerCount('SIGINT'));
    note('up browser=' + browser.process().pid);
    setInterval(() => {}, 1000);`);
  assert.equal(code, 130, `a tool with no SIGINT owner of its own exits 130, as with puppeteer's handler (${lines.join(', ')}; ${err.slice(-300)})`);
  assert.ok(lines.includes('listeners 1'), `one SIGINT listener while the browser is open: the guard's (${lines.join(', ')})`);
  assert.ok(gone, 'and its browser is not orphaned');
}

// ---- a tool's own SIGINT handler runs as its SIGTERM one does: it stops its run, closes its browser, writes its report ------
{
  const body = `
    let stop = false;
    for (const name of ['SIGINT', 'SIGTERM']) process.once(name, () => { stop = name; });
    const before = new Set(process.listeners('SIGINT'));
    const browser = await launchGuardedBrowser(puppeteerLike, {}, { label: 'stand-in', intervalMs: 60_000 });
    note('up browser=' + browser.process().pid);
    while (!stop) await new Promise((done) => setTimeout(done, 25));
    await browser.close();
    note('closed; SIGINT listeners the launch added ' + process.listeners('SIGINT').filter((listener) => !before.has(listener)).length);
    note('report written on ' + stop);
    process.exitCode = stop === 'SIGINT' ? 130 : 143;`;
  for (const [signal, exitCode] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    const { code, lines, err, gone } = await runChild(`own-${signal}`, body, { signal });
    assert.equal(code, exitCode, `${signal}: the tool's handler decides the exit (${lines.join(', ')}; ${err.slice(-300)})`);
    assert.ok(lines.includes(`report written on ${signal}`), `${signal}: its way out ran to its report (${lines.join(', ')})`);
    assert.ok(lines.includes('closed; SIGINT listeners the launch added 0'), `${signal}: the guard's listener goes with its last browser (${lines.join(', ')})`);
    assert.ok(gone, `${signal}: the browser is gone`);
  }
}

console.log('browser-launch-sigint.selftest: the guarded launch hands handleSIGINT false (a caller\'s own kept); with no other owner SIGINT still exits 130 and kills the browser; a tool\'s own SIGINT handler runs to its report as on SIGTERM');
