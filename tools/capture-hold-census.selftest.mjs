// The capture-hold census (2026-11-02 audit S4): the rules every tool that holds the GPU follows, read from the sources.
// - Retired machine gates: the memory guard's ~/cot-launch-state/memguard/{PAUSE,WARN} files are retired (no memory
//   gates; `headroom can-start` always passes). A tool that still reads them stops on a leftover PAUSE and waits hours on a
//   leftover WARN, so no source of this checkout names the memguard directory in code.
// - Release after teardown: a finally that releases the capture lock and closes a browser closes the browser first, so the
//   next holder's GPU work never overlaps a live Chrome (solo-kernels-probe released first); so does any other release
//   statement followed in its block by a browser close: a close() helper or a signal handler (ground-banding-shots
//   released first on every way out, round 2).
// - One hold wrapper: tools/capture-hold.mjs withCaptureHold (and runWarmHold on it) owns a hold's refresh, cap, yield,
//   signals and teardown; a tool that calls a capture lock's acquire() itself sets its own timers, limits and signal
//   handlers, so a fix to hold semantics had to be made in each. Round 2 U38 (2026-11-04): a script tool holds through the
//   wrapper's open form, openCaptureHold (two lines: the acquire and the release), whose default teardown stops the
//   process's guarded browsers, so the cap holds for a tool that never checkpoints; 68 of the 75 tools and every browser
//   receipt moved onto it. The direct acquirers left are listed below, each with the reason it differs (the lock's own
//   receipts among them): a new one fails here, and so does a row with no reason or one that no longer acquires. A
//   direct acquirer is a source that imports a capture lock and calls acquire(), or one that calls acquire() on a lock it
//   was handed (`lock.acquire(`, `capture.lock.acquire(`; round 2: withIsolatedCaptureBrowser and hud-ammo-capture's
//   runCapture held that way, parallel wrappers the import test never saw; both hold through withCaptureHold now), or one
//   that calls the shared lock's acquire under a name of its own (round 3: 15 tools imported `acquireCaptureLock as
//   acquireLock` and none of these rules saw them; they hold through openCaptureHold now).
//   (review 2) A direct acquirer's importers are listed too, each with what it takes: frame-budget-probe's
//   acquireProbeLocks handed its FIFO to four other tools that never called acquire() themselves, so none was listed and
//   none had the cap. It holds through openCaptureHold now, and acquireProbeLocks counts as a wrapper call.
// - No trusted held-lock claim (round 2 U38): a tool's own flag that says the caller holds the lock (--lock-held,
//   COT_CAPTURE_LOCK_HELD=1) is passed as the hold's ancestorHeld, checked against the live owner as COT_LANE_HOLD is.
// - One owner of a signal (round 2 U38 review): a wrapper user with its own SIGINT/SIGTERM handler (process.on/once, an
//   emitter helper such as registerCancellation) passes `signals: []`. With the hold's owner too, the owner released the
//   lock and exited while the tool's own cancellation still ran: horizon-construction-bench left a 0-byte 'wx' report and
//   wreck-paint-bench let the lock go before its worker closed, its final report never written.
// - A real stop for the cap (round 2 U38 review): the open hold's default teardown stops guarded browsers, so a wrapper
//   user that launches none (itself or through a module it imports) gives the cap a stop of its own: it reads its hold's
//   signal, awaits between() between synchronous steps, passes a teardown, or declares atCap. Otherwise a cap stop was a
//   log line and the hold went on (seven CPU-only holders did so).
// - No unchecked nesting (round 2): COT_LANE_HOLD=1 skipped the capture FIFO and the session mutex in three tools with
//   nothing checking that a live hold backed it (its helper, tools/tmp-lane-hold.mjs, is gone), so a leftover export ran
//   GPU work unlocked. A child nests through its hold's token (capture-lock nestedEnv, checked against the owner record),
//   or on the flag only in a live hold an ancestor of it owns (round 3): only capture-lock.mjs reads the flag, and the
//   receipts that set it (capture-lock-reentry, frame-budget-probe) to prove that check. No tool skips a lock on it.
// The census lists the sources (tracked and new) and reads code only (comments removed); its controls prove the pattern.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SELF = 'tools/capture-hold-census.selftest.mjs';
// A source's code: its comments blanked line for line (so a finding's line number is the source's), its strings, template
// literals and regular expression literals kept whole. (round 3 A5) One pass that knows where a string or a regular
// expression begins: the two regular expressions before it read a '/*' inside a string or a line comment ('**/*',
// `// scenes/*.json`) as a block comment and blanked the code after it up to the next '*/', so an acquire in
// tools/marketing-shots/shoot.mjs (and lines of audio-probe and sfx-smoke) was invisible to every rule here.
const REGEX_AFTER = new Set([...'(,=:[!&|?{};+-*%<>~^']);
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const SPECIAL = /[/'"`{}]/g;
const codeOf = new Map(); // one scan per source text: the census reads ~5,900 sources several times
function code(text) {
  const known = codeOf.get(text);
  if (known !== undefined) return known;
  const n = text.length, out = [];
  let i = 0;
  const blank = (from, to) => out.push(text.slice(from, to).replace(/[^\n]/g, ' '));
  // code up to the end, or (`nested`, inside a template's ${...}) up to the '}' that closes it
  const scanCode = (nested) => {
    let depth = 0, prev = '', word = '';
    while (i < n) {
      SPECIAL.lastIndex = i;
      const at = SPECIAL.exec(text)?.index ?? n;
      if (at > i) {
        const run = text.slice(i, at), trimmed = run.trimEnd();
        out.push(run);
        if (trimmed) { prev = trimmed[trimmed.length - 1]; word = /[\w$]+$/.exec(trimmed)?.[0] ?? ''; }
        i = at;
        if (i >= n) return;
      }
      const ch = text[i], next = text[i + 1];
      if (ch === '/' && next === '/') { const end = text.indexOf('\n', i); const stop = end < 0 ? n : end; blank(i, stop); i = stop; continue; }
      if (ch === '/' && next === '*') { const end = text.indexOf('*/', i + 2); const stop = end < 0 ? n : end + 2; blank(i, stop); i = stop; continue; }
      if (ch === '\'' || ch === '"') {
        const from = i++;
        while (i < n && text[i] !== ch && text[i] !== '\n') i += text[i] === '\\' ? 2 : 1;
        if (text[i] === ch) i++;
        out.push(text.slice(from, i)); prev = ch; word = '';
        continue;
      }
      if (ch === '`') { out.push(ch); i++; scanTemplate(); prev = ch; word = ''; continue; }
      if (ch === '/' && (prev === '' || REGEX_AFTER.has(prev) || REGEX_KEYWORDS.has(word))) {
        // a regular expression literal (to its closing '/' outside a class, on its line), then its flags
        const from = i++;
        let inClass = false;
        while (i < n && text[i] !== '\n') {
          const c = text[i];
          if (c === '\\') { i += 2; continue; }
          if (inClass) { if (c === ']') inClass = false; } else if (c === '[') inClass = true; else if (c === '/') break;
          i++;
        }
        if (text[i] === '/') { i++; while (i < n && /[a-z]/i.test(text[i])) i++; }
        out.push(text.slice(from, i)); prev = ')'; word = '';
        continue;
      }
      if (ch === '}' && nested && depth === 0) return;
      if (ch === '{') depth++; else if (ch === '}') depth--;
      out.push(ch); i++; prev = ch; word = '';
    }
  };
  // a template literal, after its opening backquote, through its closing one
  const scanTemplate = () => {
    let from = i;
    while (i < n) {
      const c = text[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { i++; out.push(text.slice(from, i)); return; }
      if (c === '$' && text[i + 1] === '{') { i += 2; out.push(text.slice(from, i)); scanCode(true); from = i; continue; }
      i++;
    }
    out.push(text.slice(from, n));
  };
  scanCode(false);
  const body = out.join('');
  codeOf.set(text, body);
  return body;
}
{
  // (round 3 A5) a '/*' in a string or a line comment opens no comment; a regular expression and a template keep theirs
  const lock = `import { createCaptureLock } from './${'capture-lock'}.mjs';\nconst lock = createCaptureLock();\n`;
  const kept = (source, needle) => code(source).includes(needle);
  assert.ok(kept(`${lock}// scenes/*.json\nawait lock.${'acq'}uire(1);\nconst watch = { ignored: ['**/*'] };`, `lock.${'acq'}uire(1)`), 'a /* in a line comment (shoot.mjs)');
  assert.ok(kept(`${lock}const watch = { ignored: ['**/*'] };\nawait lock.${'acq'}uire(1);\n/* a comment */`, `lock.${'acq'}uire(1)`), 'a /* in a string');
  assert.ok(kept(`${lock}const re = /\\/\\*.*$/gm;\nawait lock.${'acq'}uire(1);\nconst s = '*/';`, `lock.${'acq'}uire(1)`), 'a /* in a regular expression');
  assert.ok(kept(`${lock}const t = \`a \${b ? '/*' : \`c\${d}\`} e\`;\nawait lock.${'acq'}uire(1); // done`, `lock.${'acq'}uire(1);`), 'a /* in a template\'s expression');
  assert.ok(!kept(`${lock}/* await lock.${'acq'}uire(1); */\nconst x = a / b / c; // lock.${'acq'}uire(2)`, `${'acq'}uire(`), 'comments are still blanked (and a division is no regular expression)');
  const source = `const a = 1; /* one\ntwo */ const b = '//';\n// three\nconst c = \`\n\${a}\`;`;
  assert.equal(code(source).split('\n').length, source.split('\n').length, 'line for line');
  assert.match(code(source), /const b = '\/\/';/, 'a // in a string is kept');
}
// built from parts so this file is not its own finding
const MEMGUARD = new RegExp(['[\'"`/]mem', 'guard\\b'].join(''));

/** The lines of one source's code that name the retired memory-guard directory. */
const memguardReads = (text) => code(text).split('\n').flatMap((line, index) => (MEMGUARD.test(line) ? [`${index + 1}: ${line.trim().slice(0, 140)}`] : []));
assert.equal(memguardReads(`const MEMGUARD = join(homedir(), 'cot-launch-state', '${'mem'}guard');`).length, 1, 'a joined path');
assert.equal(memguardReads(`if (existsSync(\`\${home}/cot-launch-state/${'mem'}guard/PAUSE\`)) stop();`).length, 1, 'a template path');
assert.equal(memguardReads(`// the ${'mem'}guard files are retired`).length, 0, 'a comment is not a read');
assert.equal(memguardReads('const QUIET = join(homedir(), \'cot-launch-state\', \'QUIET\');').length, 0, 'the quiet window is not the memory guard');

// a finally block's code (its own line on, at most 10 lines, to where its braces close)
function finallyBlocks(text) {
  const lines = code(text).split('\n'), blocks = [];
  lines.forEach((line, index) => {
    const at = line.search(/\bfinally\s*\{/);
    if (at < 0) return;
    let depth = 0, body = '';
    for (let j = index; j < Math.min(lines.length, index + 10); j++) {
      const part = j === index ? line.slice(at) : lines[j];
      body += `${part}\n`;
      depth += (part.match(/\{/g) ?? []).length - (part.match(/\}/g) ?? []).length;
      if (depth <= 0) break;
    }
    blocks.push({ line: index + 1, body });
  });
  return blocks;
}
// (round 2 U38) any spelling of a capture release: releaseCaptureLock(), and release() with or without a reason on a lock,
// lease or hold object (lock.release('reason'), lease.release(), hold.release()); and any browser's close, whatever it is
// called (chrome.close(), ctx.browser.close(), this.browser?.close(), guardedBrowser.close())
const RELEASE = /(?:\breleaseCaptureLock\(|\b(?:\w*[lL]ock|locks|capture|fifo|lease|hold)\??\.release\([^)]*\))/;
const CLOSE = /\b(?:\w*[bB]rowser|chrome)\??\.close\(/;
// a release as a statement (not an argument, as in a receipt's `assert.equal(lock.release(), false)`)
const RELEASE_STATEMENT = new RegExp(`(?:^|[;{}]|\\)|=>|&&|\\|\\||\\breturn|\\bvoid|\\bawait)[ \\t]*${RELEASE.source}`, 'gm');
const STICKY_CLOSE = new RegExp(CLOSE.source, 'y');
/** The lines of one source's release statements followed, in their own block or the one around it (at most 12 lines on),
 *  by a browser close: a close() helper or a signal handler that lets the lock go before Chrome closes. */
function releaseThenClose(text) {
  const body = code(text), found = [];
  for (const match of body.matchAll(RELEASE_STATEMENT)) {
    let depth = 0, lines = 0;
    for (let i = match.index + match[0].length; i < body.length; i++) {
      const ch = body[i];
      if (ch === '\n' && ++lines > 12) break;
      if (ch === '{') depth++;
      else if (ch === '}' && --depth < -1) break;
      STICKY_CLOSE.lastIndex = i;
      if (STICKY_CLOSE.test(body)) { found.push(body.slice(0, match.index).split('\n').length); break; }
    }
  }
  return found;
}
/** The lines of one source where the capture lock is released before a browser closes: a finally block that does so, or a
 *  release statement followed in its block by a close. */
const releaseBeforeClose = (text) => [...new Set([...finallyBlocks(text).filter(({ body }) => {
  const released = body.search(RELEASE), closed = body.search(CLOSE);
  return released >= 0 && closed > released;
}).map(({ line }) => line), ...releaseThenClose(text)])].sort((a, b) => a - b);
assert.deepEqual(releaseBeforeClose('try { go(); } finally {\n  lock.release();\n  await browser.close();\n}'), [1, 2], 'a release before the close');
assert.deepEqual(releaseBeforeClose('try { go(); } finally { await browser?.close(); await server?.close(); lock.release(); }'), [], 'a close, then the release');
assert.deepEqual(releaseBeforeClose('try { go(); } finally { lock.release(); }\n}\nawait browser.close();'), [], 'another block\'s close');
// a close helper (ground-banding-shots before round 2) and a signal handler, braced or not; a receipt's checked release
assert.deepEqual(releaseBeforeClose('const close = async () => {\n  if (held) lock.release();\n  held = false;\n  if (browser) await browser.close().catch(() => {});\n};'), [2], 'a close helper');
assert.deepEqual(releaseBeforeClose('const close = async () => {\n  if (held) { lock.release(); held = false; }\n  await browser?.close();\n};'), [2], 'a braced release in a close helper');
assert.deepEqual(releaseBeforeClose('process.once(signal, async () => { lock.release(); await browser.close(); process.exit(143); });'), [1], 'a signal handler');
assert.deepEqual(releaseBeforeClose('const close = async () => {\n  await browser?.close();\n  lock.release();\n  await server.close();\n};'), [], 'the browser, then the release');
assert.deepEqual(releaseBeforeClose('assert.equal(lock.release(), false, \'nothing left\');\nawait browser.close();'), [], 'a checked release is not a release statement');
assert.deepEqual(releaseBeforeClose('const lease = () => {\n  lock.release();\n};\n}\nconst stop = async () => { await browser.close(); };'), [], 'a close two blocks out');
// (round 2 U38) the spellings the first census missed
assert.deepEqual(releaseBeforeClose('try { go(); } finally {\n  releaseCaptureLock();\n  await browser.close();\n}'), [1, 2], 'the shared lock\'s releaseCaptureLock()');
assert.deepEqual(releaseBeforeClose('try { go(); } finally {\n  lock.release(\'done\');\n  await browser.close();\n}'), [1, 2], 'a release with a reason');
assert.deepEqual(releaseBeforeClose('try { go(); } finally {\n  lease.release();\n  await chrome.close();\n}'), [1, 2], 'a lease and a browser named chrome');
assert.deepEqual(releaseBeforeClose('const stop = async () => {\n  await hold.release();\n  await ctx.browser?.close();\n};'), [2], 'a hold handle and a browser on an object');
assert.deepEqual(releaseBeforeClose('try { go(); } finally {\n  await guardedBrowser.close();\n  releaseCaptureLock();\n}'), [], 'any browser closed first');
assert.deepEqual(releaseBeforeClose('try { go(); } finally {\n  pool.release();\n  await browser.close();\n}'), [], 'another release (a worker pool) is no capture release');

// a source that imports a capture lock (built from parts so this file is not its own finding) and calls acquire() itself
const LOCK_IMPORT = new RegExp(['capture-lock', '\\.mjs|visual-census-lock', '\\.mjs'].join(''));
const ACQUIRE = new RegExp(['\\.acq', 'uire\\(|acquireCapture', 'Lock\\('].join(''));
// (round 4 E10 review) tools/held-items.mjs opens a held run's hold (openHeldRun) for the long hold users
const HOLD_OWNERS = new Set(['tools/capture-lock.mjs', 'tools/capture-hold.mjs', 'tools/held-items.mjs', 'tools/visual-census-lock.mjs', SELF]);
// acquire() on a lock the source was handed, whatever it imports: `lock.acquire(`, `captureLock.acquire(`,
// `capture.lock.acquire(`, `lock?.acquire(` (built from parts so this file is not its own finding)
const HANDED_ACQUIRE = new RegExp(['\\b\\w*[lL]ock\\??\\.acq', 'uire\\('].join(''), 'g');
/** Whether `index` of `line` is inside a one-line string literal (an odd count of one quote kind before it). */
const inString = (line, index) => ['\'', '"', '`'].some((quote) => (line.slice(0, index).match(new RegExp(`(?<!\\\\)${quote}`, 'g')) ?? []).length % 2 === 1);
const handedAcquire = (text) => code(text).split('\n').some((line) => [...line.matchAll(HANDED_ACQUIRE)].some((match) => !inString(line, match.index)));
// (round 3 A5) the shared lock's acquire under a name of the source's own: `import { acquireCaptureLock as acquireLock }`,
// a destructured `{ acquireCaptureLock: take }`, or `const take = acquireCaptureLock`, then a call of that name. 15 tools
// held the lock as `acquireLock(` and no rule here saw them: the import line has no '(' and the call names no
// acquireCaptureLock (built from parts so this file is not its own finding).
const ACQUIRE_BINDING = new RegExp(['\\bacquireCapture', 'Lock\\s+as\\s+([A-Za-z_$][\\w$]*)|\\bacquireCapture', 'Lock\\s*:\\s*([A-Za-z_$][\\w$]*)',
  '|\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:[\\w$]+\\.)?acquireCapture', 'Lock\\b(?!\\s*\\()'].join(''), 'g');
const aliasedAcquire = (text) => {
  const body = code(text);
  if (!body.includes(['acquireCapture', 'Lock'].join(''))) return false;
  const names = new Set([...body.matchAll(ACQUIRE_BINDING)].map((match) => match[1] ?? match[2] ?? match[3]));
  return [...names].some((name) => {
    const call = new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}\\s*\\(`, 'g');
    return body.split('\n').some((line) => [...line.matchAll(call)].some((match) => !inString(line, match.index)));
  });
};
const acquiresDirectly = (file, text) => !HOLD_OWNERS.has(file)
  && ((LOCK_IMPORT.test(code(text)) && ACQUIRE.test(code(text))) || handedAcquire(text) || aliasedAcquire(text));
{
  const via = (what) => `import { createCaptureLock } from './${'capture-lock'}.mjs';\n${what}`;
  assert.equal(acquiresDirectly('tools/a.mjs', via(`const lock = createCaptureLock(); await lock.${'acq'}uire(60_000);`)), true, 'a direct acquire');
  assert.equal(acquiresDirectly('tools/a.mjs', via('await withCaptureHold(work, { label: \'a\' });')), false, 'the wrapper');
  assert.equal(acquiresDirectly('tools/a.mjs', `await pool.${'acq'}uire(1);`), false, 'another acquire() (no capture lock imported)');
  assert.equal(acquiresDirectly('tools/a.mjs', via(`// await lock.${'acq'}uire(1);`)), false, 'a comment');
  // a lock handed in (withIsolatedCaptureBrowser's `capture.lock`, hud-ammo-capture's `lock`): no import needed
  assert.equal(acquiresDirectly('tools/a.mjs', `await capture.lock.${'acq'}uire(waitMs, { prepare: open });`), true, 'an injected lock');
  assert.equal(acquiresDirectly('tools/a.mjs', `export async function run({ lock }) { await lock.${'acq'}uire(1); }`), true, 'a lock parameter');
  assert.equal(acquiresDirectly('tools/a.mjs', `await captureLock?.${'acq'}uire(1);`), true, 'an optional call');
  assert.equal(acquiresDirectly('tools/a.selftest.mjs', `assert.ok(source.indexOf('await lock.${'acq'}uire(') > 0);`), false, 'a string a receipt reads');
  assert.equal(acquiresDirectly('tools/a.mjs', `const handle = assets.${'acq'}uire(key);`), false, 'another acquire() on no lock');
  // (round 3 A5) the shared lock's acquire under a name of the source's own (15 tools: screenshot.mjs and its kin)
  const shared = ['acquireCapture', 'Lock'].join('');
  const aliased = `import { ${shared} as acquireLock, releaseCaptureLock as releaseLock } from './${'capture-lock'}.mjs';\n`;
  assert.equal(acquiresDirectly('tools/a.mjs', `${aliased}await acquireLock(20 * 60 * 1000);\nprocess.on('exit', releaseLock);`), true, 'an aliased import');
  assert.equal(acquiresDirectly('tools/a.mjs', `const { ${shared}: take } = await import('./${'capture-lock'}.mjs');\nawait take();`), true, 'a destructured one');
  assert.equal(acquiresDirectly('tools/a.mjs', `import * as locks from './${'capture-lock'}.mjs';\nconst take = locks.${shared};\ntake(1);`), true, 'an assigned one');
  assert.equal(acquiresDirectly('tools/a.mjs', `${aliased}// await acquireLock(1);\nconst note = 'acquireLock(1)';`), false, 'a comment and a string');
  assert.equal(acquiresDirectly('tools/a.mjs', `import { ${shared} } from './${'capture-lock'}.mjs';\nawait runCapture({ lock: { ${'acq'}uire: ${shared} } });`), false,
    'handed to a wrapper as a value (hud-ammo-states): no call here');
  // the alias in a source whose '**/*' string the old comment stripper read as a comment (marketing-shots/shoot.mjs)
  assert.equal(acquiresDirectly('tools/a.mjs', `${aliased}// scenes/*.json\nawait acquireLock(30 * 60 * 1000);\nconst watch = { ignored: ['**/*'] };`), true,
    'an aliased acquire after a /* in a line comment');
}
/** The tools that still hold the GPU through a capture lock's acquire() themselves, each with the reason it differs from
 *  the one wrapper (round 2 U38: the other 68 of the 75 listed on 2026-11-02 hold through withCaptureHold or its open form,
 *  openCaptureHold). A new direct acquirer fails here; one with no reason, or one that no longer acquires, too. */
const DIRECT_ACQUIRERS = Object.freeze({
  // (round 8 Y11) release 270's three shot tools, ground-banding-shots' form; onto withCaptureHold in a later round
  'tools/building-style-shots.mjs': '270\'s buildings shots, as ground-banding-shots: a render-class acquire() whose prepare stages and freezes the first pair while it waits, lock.checkpoint between pairs yielding at the 20-min cap and rejoining; its close takes the browser down before the release',
  'tools/built-env-shots.mjs': '270\'s built-environment shots, as ground-banding-shots: a render-class acquire() whose prepare stages the first pair while it waits, lock.checkpoint between pairs yielding at the 20-min cap (the page and browser dropped first); its close takes the browser down before the release',
  'tools/ground-surface-shots.mjs': '270\'s ground-surface shots, as ground-banding-shots: a render-class acquire() whose prepare stages and freezes the first pair while it waits, lock.checkpoint between pairs yielding at the 20-min cap and rejoining; its close takes the browser down before the release',
  'tools/anatomy-render-set.mjs': 'loads the lock from the checkout it renders (toolRoot), which may predate the open hold; its own 19.5-min watchdog ends the hold (exit 124) under the cap',
  'tools/ground-banding-shots.mjs': 'yields at the 20-min cap itself: --band gives the lock up and re-enters the priority band one past its highest live stamp, staging the next pair while it waits (a fresh ticket per yield)',
  'tools/media-r5/lab.mjs': 'the media lease protocol: per-job, per-map and budget leases with paid yields to normal-band holds (priority-yield.mjs), decided on lock.held (priority-yield.selftest pins it)',
  'tools/media-r5/studio-ui.mjs': 'loads the lock from the checkout it serves (cwd), which may predate the open hold; one short hold per script, the browser kept idle between them; a script is one frame-by-frame film, which cannot stop part-way, so its cap is logged by the lock (refresh past the cap), as the film renders\' atCap keep is',
  'tools/run-selftests.mjs': 'the suite runner\'s CPU lease: bounded 45 s batches that rejoin the FIFO between receipts, released before a receipt that holds the lock itself',
  'tools/selftest-cpu-pool.mjs': 'the pool form of the suite runner\'s bounded CPU lease',
});
/** (review 2) The sources outside receipts that import a direct acquirer, with what they take from it: an export that takes
 *  the lock for its caller (acquireProbeLocks did, for four tools) hands that caller a hold the rules above never see. */
const DIRECT_ACQUIRER_IMPORTERS = Object.freeze({
  'tools/gate.mjs': 'runSelftestSuite and runSelftestFile from run-selftests: the suite runner\'s own bounded 45 s CPU lease, the cap inside the runner',
  'tools/run-selftests.mjs': 'runSelftestCpuPool from selftest-cpu-pool: the pool form of the same bounded lease',
  'tools/test-audit.mjs': 'run-selftests\' constants only (worker count, file sets): no lock',
  'tools/test-heavy.mjs': 'run-selftests\' suite runner, whole: its bounded CPU lease',
});
/** The receipts that call acquire() on a capture lock (the lock's own, and the ones proving a wrapper on private
 *  directories), with the reason; the browser receipts that held the shared lock hold through the wrapper (round 2 U38). */
const DIRECT_ACQUIRER_RECEIPTS = Object.freeze({
  // (round 8 Y11) release 270's browser receipt; onto withCaptureHold in a later round
  'tools/crew-voice-picker.browser.selftest.mjs': '270\'s crew voice picker page receipt: one hold of the shared lock for its browser (selftestLockTimeoutMs, refreshed every 30 s), taken at the start',
  'tools/browser-guard-holds.selftest.mjs': 'pins what a guard trip releases, on private locks',
  'tools/browser-launch.selftest.mjs': 'pins the guard trip\'s release of a private hold',
  'tools/capture-command.selftest.mjs': 'pins runCapturedCommand on a private lock',
  'tools/capture-hold-phases.selftest.mjs': 'holds a private lock itself so a child\'s open hold queues behind it (a signal while queued)',
  'tools/capture-lock-class.selftest.mjs': 'the lock\'s own receipt (classes)',
  'tools/capture-lock-reentry.selftest.mjs': 'the lock\'s own receipt (re-entry, nesting)',
  'tools/capture-lock.selftest.mjs': 'the lock\'s own receipt',
  'tools/chain-lifecycle.selftest.mjs': 'a child under runInCaptureHold takes a private lock to prove it nests',
  'tools/media-r5/priority-yield.selftest.mjs': 'pins lock.held on a private hold',
  'tools/session-mutex.selftest.mjs': 'the polite lock on private directories',
  'tools/standard-check-stages.selftest.mjs': 'a fixture repository\'s stand-in lock',
  'tools/visual-census-lock.selftest.mjs': 'the polite lock\'s own receipt',
  'tools/visual-census.selftest.mjs': 'the polite lock on private directories',
  'tools/with-capture-lock.selftest.mjs': 'children take a private lock to prove they nest in the hold CLI\'s hold',
});
for (const [file, reason] of [...Object.entries(DIRECT_ACQUIRERS), ...Object.entries(DIRECT_ACQUIRER_RECEIPTS)]) {
  assert.ok(typeof reason === 'string' && reason.length >= 20, `${file}: a direct acquirer states why it differs from the one wrapper`);
}

// (round 2 U38) a claim that the caller holds the lock is checked, never trusted: a tool's own flag for it (garage-wheel-band
// --lock-held, media-motion-savedata COT_CAPTURE_LOCK_HELD=1) skipped the lock whatever held it, the COT_LANE_HOLD hazard
// again; it is passed as the hold's `ancestorHeld` (nested only in an ancestor's live hold). A stub lock stands in only
// where nothing draws (a SwiftShader preview) or in a receipt's fixture.
const LOCK_CLAIM = new RegExp(['COT_CAPTURE', '_LOCK_HELD|[\'"`]lock', '-held[\'"`]'].join(''));
const STUB_LOCK = new RegExp(['acq', 'uire\\s*:\\s*async\\s*\\(\\s*\\)\\s*=>\\s*\\{\\s*\\}'].join(''));
const STUB_LOCKS = Object.freeze({
  'tools/anatomy-render-set.mjs': 'a --swiftshader preview set renders on the CPU: no GPU, so no lock',
  'tools/selftest-scans.selftest.mjs': 'a receipt\'s stand-in runner lock',
});
const unchecked = (file, text) => {
  const body = code(text);
  const found = [];
  if (LOCK_CLAIM.test(body) && !/\bancestorHeld\s*:/.test(body)) found.push('reads a held-lock claim without passing it as ancestorHeld');
  if (STUB_LOCK.test(body) && !Object.hasOwn(STUB_LOCKS, file)) found.push('stands a stub in for the capture lock');
  return found;
};
assert.deepEqual(unchecked('tools/a.mjs', `const lock = process.env.${'COT_CAPTURE'}_LOCK_HELD === '1' ? { ${'acq'}uire: async () => {}, release() {} } : createCaptureLock();`).length, 2, 'a trusted claim and its stub');
assert.deepEqual(unchecked('tools/a.mjs', `const held = !!flag('lock${'-held'}');\nif (!held) await lock.${'acq'}uire(1);`).length, 1, 'a flag that skips the acquire');
assert.deepEqual(unchecked('tools/a.mjs', `const held = !!flag('lock${'-held'}');\nawait openCaptureHold({ ancestorHeld: held });`), [], 'a claim passed to the checked path');
assert.deepEqual(unchecked('tools/anatomy-render-set.mjs', `const lock = sw ? { ${'acq'}uire: async () => {} } : createCaptureLock();`), [], 'a CPU-only preview');

// (round 2 U38 review) a wrapper call, a signal handler of a source's own, `signals: []`, a guarded launch and a cap stop,
// each read from code outside one-line strings (a receipt's source pins name them in strings)
const codeLines = new Map(); // one code() per source text: the census reads ~5,900 sources several times
const linesOf = (text) => {
  let lines = codeLines.get(text);
  if (!lines) { lines = code(text).split('\n'); codeLines.set(text, lines); }
  return lines;
};
const globalOf = new Map();
const outside = (text, pattern) => {
  let global = globalOf.get(pattern);
  if (!global) { global = new RegExp(pattern.source, 'g'); globalOf.set(pattern, global); }
  // a quick test of the whole text first: most sources never name the pattern
  if (!pattern.test(text)) return false;
  return linesOf(text).some((line) => [...line.matchAll(global)].some((match) => !inString(line, match.index)));
};
// (review 2) acquireProbeLocks (frame-budget-probe) holds its FIFO through openCaptureHold: its callers are the wrapper's.
// (round 4 E10 review) So are openHeldRun's (tools/held-items.mjs: openCaptureHold, a signal while queued kept as 128 + n).
const WRAPPER_CALL = /\b(?:withCaptureHold|openCaptureHold|runWarmHold|acquireProbeLocks|openHeldRun)\(/;
const OWN_SIGNAL = [
  /\.(?:on|once|addListener|prependListener)\(\s*['"`]SIG(?:INT|TERM|HUP)['"`]/, // process.once('SIGTERM', …), emitter.on('SIGINT', …)
  /\bregister\w*Cancellation\(/, // a helper that installs one (wreck-build-profile's comes from props-build-profile)
];
// a handler named through a list: for (const s of ['SIGINT', 'SIGTERM']) process.once(s, …), ['SIGINT', …].map(…)
const SIGNAL_LIST = /\[[^\]\n]*['"`]SIG(?:INT|TERM)['"`][^\]\n]*\]/;
const LISTED_HANDLER = /\bprocess\.(?:on|once)\(\s*[A-Za-z_$][\w$]*\s*,/;
const NO_SIGNALS = /\bsignals\s*:\s*\[\s*\]/;
const ownSignalHandler = (text) => OWN_SIGNAL.some((pattern) => outside(text, pattern)) || (outside(text, SIGNAL_LIST) && outside(text, LISTED_HANDLER));
/** A wrapper user whose own SIGINT/SIGTERM handler shares the signal with the hold's owner (no `signals: []`). */
const twoSignalOwners = (text) => outside(text, WRAPPER_CALL) && ownSignalHandler(text) && !outside(text, NO_SIGNALS);
{
  const hold = 'const hold = await openCaptureHold({ label: \'a\' });';
  assert.equal(twoSignalOwners(`${hold}\nprocess.once('SIGTERM', () => controller.abort());`), true, 'a handler of its own and the hold\'s owner');
  assert.equal(twoSignalOwners(`${hold}\nemitter.on('SIGINT', stop);`), true, 'an emitter helper\'s handler');
  assert.equal(twoSignalOwners(`${hold}\nconst cancellation = registerProfileCancellation(() => child);`), true, 'a helper imported from another tool');
  assert.equal(twoSignalOwners(`await withCaptureHold(work, { lock });\nconst handlers = ['SIGINT', 'SIGTERM'].map(name => [name, stop]);\n`
    + 'for (const [name, handler] of handlers) process.once(name, handler);'), true, 'a list of signals (horizon-construction-bench)');
  assert.equal(twoSignalOwners(`${hold.replace('})', ', signals: [] })')}\nprocess.once('SIGTERM', stop);`), false, 'signals: [] leaves the signal to the tool');
  assert.equal(twoSignalOwners(`${hold}\npreview?.kill('SIGTERM');`), false, 'a kill is no handler');
  assert.equal(twoSignalOwners(`assert.ok(source.indexOf("process.on('SIGINT'") > source.indexOf('await openCaptureHold('));`), false, 'a receipt\'s strings');
  assert.equal(twoSignalOwners(`process.once('SIGTERM', stop);\nawait lock.${'acq'}uire(1);`), false, 'no wrapper: the direct-acquirer rule\'s');
  // (review 2) the probe pair's callers hold through the wrapper (battle-spike-census exits on its own handler)
  assert.equal(twoSignalOwners('let locks = await acquireProbeLocks({ log });\nfor (const signal of [\'SIGTERM\', \'SIGINT\']) {\n  process.once(signal, close);\n}'),
    true, 'acquireProbeLocks is a wrapper call');
  assert.equal(twoSignalOwners('let locks = await acquireProbeLocks({ log, hold: { signals: [] } });\nprocess.once(\'SIGTERM\', close);'), false,
    'its hold options leave the signal to the tool');
}
/** The tools that own a signal beside a wrapper call that is not the hold's, with the reason. */
const SIGNAL_OWNERS_OFF_THE_HOLD = Object.freeze({
  'tools/capture-hold-phases.selftest.mjs': 'the wrapper\'s own receipt: its handlers are stand-in commands\' and tools\', inside child scripts (template strings)',
  'tools/click-timeline.mjs': 'its SIGTERM/SIGINT/SIGALRM/SIGHUP handler is on the unlocked path only; with --lock it holds through runWarmHold, whose owner handles signals',
  'tools/nav-timeline.mjs': 'its SIGTERM/SIGINT/SIGALRM/SIGHUP handler is on the unlocked path only; with --lock it holds through runWarmHold, whose owner handles signals',
});
// a guarded browser launched in the source or in a module it imports (one level: garage-switch-probe.selftest runs
// garage-switch-probe's runProfile in its own process); runWarmHold's warm resources have their own teardown (closeWarm)
// (a call, not the definition: every wrapper user imports capture-hold.mjs, which defines runWarmHold)
const GUARDED = /(?<!function\s+)\b(?:launchGuardedBrowser|withMapProbeSession|withDistProbeSession|eachBrowserChunk|withIsolatedCaptureBrowser|runWarmHold)\(/;
const RELATIVE_IMPORT = /(?:\bfrom\s*|\bimport\(\s*)['"`](\.{1,2}\/[^'"`]+\.[cm]?[jt]s)['"`]/g;
const CAP_STOP = [
  /\bteardown\s*:/, /\batCap\s*:/, // a teardown that stops its workers; a declared keep
  /\b\w*[hH]old\??\.(?:signal|between)\b/, // the open hold's signal into its cancellation, or between() between steps
  /\(\s*\{[^})]*\b(?:signal|between)\b[^})]*\}\s*\)\s*=>/, // withCaptureHold's work reading its signal or between()
];
const capStopped = (text) => CAP_STOP.some((pattern) => outside(text, pattern));
{
  const hold = 'const hold = await openCaptureHold({ label: \'a\' });';
  assert.equal(capStopped(`${hold}\nfor (const r of rows) build(r);\nawait hold.release();`), false, 'a CPU loop that never stops');
  assert.equal(capStopped(`${hold}\nhold.signal.addEventListener('abort', () => cancellation.interrupt());`), true, 'its signal into its cancellation');
  assert.equal(capStopped(`${hold}\nfor (const r of rows) { await hold.between(); build(r); }`), true, 'between() between synchronous steps');
  assert.equal(capStopped('await withCaptureHold(async ({ between }) => measure({ between }), { lock });'), true, 'a work that reads between()');
  assert.equal(capStopped('await withCaptureHold(({ signal }) => run(signal), { lock });'), true, 'a work that reads its signal');
  assert.equal(capStopped('await openCaptureHold({ label: \'a\', teardown: () => child?.kill(\'SIGKILL\') });'), true, 'a teardown of its own');
  assert.equal(capStopped('await openCaptureHold({ label: \'a\', atCap: \'keep\' });'), true, 'a declared keep');
}
/** CPU-only holders whose cap stop is still only logged, with the reason (none since round 2 U38's review). */
const CPU_HOLDERS_UNSTOPPED = Object.freeze({});

// a read of the retired nesting flag (built from parts so this file is not its own finding)
const LANE_HOLD = new RegExp(['\\benv\\??\\.COT_LANE', '_HOLD\\b|\\[[\'"`]COT_LANE', '_HOLD[\'"`]\\]'].join(''));
const LANE_HOLD_READERS = new Set(['tools/capture-lock.mjs', 'tools/capture-lock-reentry.selftest.mjs', 'tools/frame-budget-probe.selftest.mjs']);
const laneHoldReads = (file, text) => (LANE_HOLD_READERS.has(file) ? [] : code(text).split('\n')
  .flatMap((line, index) => (LANE_HOLD.test(line) ? [`${index + 1}: ${line.trim().slice(0, 140)}`] : [])));
assert.equal(laneHoldReads('tools/a.mjs', `if (process.env.${'COT_LANE'}_HOLD === '1') return;`).length, 1, 'a bypass');
assert.equal(laneHoldReads('tools/a.mjs', `const on = process.env['${'COT_LANE'}_HOLD'];`).length, 1, 'a bracket read');
assert.equal(laneHoldReads('tools/a.mjs', `// ${'COT_LANE'}_HOLD=1 is retired`).length, 0, 'a comment');
assert.equal(laneHoldReads('tools/capture-lock.mjs', `if (process.env.${'COT_LANE'}_HOLD) check();`).length, 0, 'the lock checks it against an ancestor\'s hold');

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'api', 'scripts', 'server', 'src', 'tools'],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n').filter((file) => /\.(?:[cm]?js|[cm]?ts|tsx|zsh|sh)$/.test(file) && file !== SELF);
assert.ok(files.length > 500, `the census lists the sources (${files.length})`);
const sources = new Map();
for (const file of files) {
  try { sources.set(file, readFileSync(join(ROOT, file), 'utf8')); } catch { /* deleted in the working tree */ }
}

const gates = [...sources].flatMap(([file, text]) => memguardReads(text).map((hit) => `${file}:${hit}`));
assert.deepEqual(gates, [], `the memory guard is retired: nothing reads its PAUSE or WARN files\n  ${gates.join('\n  ')}`);

const bypasses = [...sources].flatMap(([file, text]) => laneHoldReads(file, text).map((hit) => `${file}:${hit}`));
assert.deepEqual(bypasses, [], `never skip a lock on COT_LANE_HOLD: capture-lock nests a child in an ancestor's live hold on it, or through the hold's token (nestedEnv)\n  ${bypasses.join('\n  ')}`);

const early = [...sources].flatMap(([file, text]) => releaseBeforeClose(text).map((line) => `${file}:${line}`));
assert.deepEqual(early, [], `close the browser before the capture lock is released (the next holder's GPU work would overlap it)\n  ${early.join('\n  ')}`);

const claims = [...sources].flatMap(([file, text]) => unchecked(file, text).map((why) => `${file}: ${why}`));
assert.deepEqual(claims, [], `a held-lock claim is checked (the hold's ancestorHeld), never a skip:\n  ${claims.join('\n  ')}`);

const owners = [...sources].filter(([file, text]) => file !== 'tools/capture-hold.mjs' && twoSignalOwners(text)).map(([file]) => file).sort();
assert.deepEqual(owners.filter((file) => !Object.hasOwn(SIGNAL_OWNERS_OFF_THE_HOLD, file)), [],
  `a tool with its own SIGINT/SIGTERM handler passes signals: [] to its hold (one owner of a signal per process)\n  `
  + owners.filter((file) => !Object.hasOwn(SIGNAL_OWNERS_OFF_THE_HOLD, file)).join('\n  '));
assert.deepEqual(Object.keys(SIGNAL_OWNERS_OFF_THE_HOLD).filter((file) => !owners.includes(file)), [], 'a signal-owner row that no longer applies: drop it');

const holdsGuarded = (file, text) => {
  if (outside(text, GUARDED)) return true;
  for (const [, spec] of code(text).matchAll(RELATIVE_IMPORT)) {
    const imported = join(file, '..', spec).replace(/\\/g, '/');
    const body = sources.get(imported) ?? sources.get(imported.replace(/\.js$/, '.ts'));
    if (body && outside(body, GUARDED)) return true;
  }
  return false;
};
const cpuHolders = [...sources].filter(([file, text]) => !HOLD_OWNERS.has(file) && outside(text, WRAPPER_CALL) && !holdsGuarded(file, text));
const unstopped = cpuHolders.filter(([file, text]) => !capStopped(text) && !Object.hasOwn(CPU_HOLDERS_UNSTOPPED, file)).map(([file]) => file).sort();
assert.deepEqual(unstopped, [], `a hold that launches no browser gives the cap a stop of its own (its signal, between(), a teardown, or atCap)\n  ${unstopped.join('\n  ')}`);
assert.ok(cpuHolders.length >= 8, `the CPU-only holders are found (${cpuHolders.map(([file]) => file).join(', ')})`);

const listed = new Set([...Object.keys(DIRECT_ACQUIRERS), ...Object.keys(DIRECT_ACQUIRER_RECEIPTS)]);
const direct = [...sources].filter(([file, text]) => acquiresDirectly(file, text)).map(([file]) => file).sort();
const unlisted = direct.filter((file) => !listed.has(file));
assert.deepEqual(unlisted, [], `hold the capture lock through tools/capture-hold.mjs withCaptureHold (refresh, cap, yield, signals and teardown in one place), not acquire():\n  ${unlisted.join('\n  ')}`);
const stale = [...listed].filter((file) => !direct.includes(file));
assert.deepEqual(stale, [], `no longer a direct acquirer (migrated, moved or gone): drop its row\n  ${stale.join('\n  ')}`);
// (review 2) every source outside receipts that imports a direct acquirer says what it takes from it
const importsOf = (file, text) => [...code(text).matchAll(RELATIVE_IMPORT)].map(([, spec]) => join(file, '..', spec).replace(/\\/g, '/'));
{
  const acquirer = Object.keys(DIRECT_ACQUIRERS)[0];
  const spec = acquirer.replace(/^tools\//, './');
  assert.deepEqual(importsOf('tools/a.mjs', `import { take } from '${spec}';`), [acquirer], 'an import of a direct acquirer');
  assert.deepEqual(importsOf('tools/a.mjs', `const runner = await import('${spec}');`), [acquirer], 'a dynamic one');
  assert.deepEqual(importsOf('tools/a.mjs', `// import { take } from '${spec}';`), [], 'a comment');
}
const importers = [...sources].filter(([file, text]) => !/\.selftest\.mjs$/.test(file)
  && importsOf(file, text).some((imported) => Object.hasOwn(DIRECT_ACQUIRERS, imported))).map(([file]) => file).sort();
assert.deepEqual(importers.filter((file) => !Object.hasOwn(DIRECT_ACQUIRER_IMPORTERS, file)), [],
  `a tool that imports a direct acquirer may hold through its export, outside every rule here: hold through the wrapper, or list it with what it takes\n  `
  + importers.filter((file) => !Object.hasOwn(DIRECT_ACQUIRER_IMPORTERS, file)).join('\n  '));
assert.deepEqual(Object.keys(DIRECT_ACQUIRER_IMPORTERS).filter((file) => !importers.includes(file)), [], 'an importer row that no longer applies: drop it');
const wrapped = [...sources].filter(([file, text]) => !HOLD_OWNERS.has(file) && /\b(?:withCaptureHold|runWarmHold|openCaptureHold|openHeldRun)\(/.test(code(text))).length;
assert.ok(wrapped >= 70, `the wrapper has its users (${wrapped})`);

console.log(`capture-hold-census.selftest: ${sources.size} sources; no retired memory-guard gate; no COT_LANE_HOLD bypass; every browser closes before its lock goes; `
  + `one signal owner per hold; ${cpuHolders.length} CPU-only holders each stop at the cap; ${wrapped} hold through the wrapper, ${Object.keys(DIRECT_ACQUIRERS).length} tools and ${Object.keys(DIRECT_ACQUIRER_RECEIPTS).length} receipts acquire directly (each with its reason, `
  + `${importers.length} importers with theirs); no held-lock claim trusted`);
