// The capture-hold census (2026-11-02 audit S4): the rules every tool that holds the GPU follows, read from the sources.
// - Retired machine gates: the memory guard's ~/cot-launch-state/memguard/{PAUSE,WARN} files are retired (no memory
//   gates; `headroom can-start` always passes). A tool that still reads them stops on a leftover PAUSE and waits hours on a
//   leftover WARN, so no source of this checkout names the memguard directory in code.
// - Release after teardown: a finally that releases the capture lock and closes a browser closes the browser first, so the
//   next holder's GPU work never overlaps a live Chrome (solo-kernels-probe released first).
// - One hold wrapper: tools/capture-hold.mjs withCaptureHold (and runWarmHold on it) owns a hold's refresh, cap, yield,
//   signals and teardown; a tool that calls a capture lock's acquire() itself sets its own timers, limits and signal
//   handlers, so a fix to hold semantics had to be made in each. The direct acquirers today are listed below (grandfathered;
//   the lock's own receipts among them): a new one fails here (hold through withCaptureHold), and a migrated one must
//   leave the list.
// The census lists the sources (tracked and new) and reads code only (comments removed); its controls prove the pattern.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SELF = 'tools/capture-hold-census.selftest.mjs';
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
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
const RELEASE = /\b(?:lock|capture|fifo|locks|captureLock|holdLock)\??\.release\(\)/;
const CLOSE = /\bbrowser\??\.close\(\)/;
/** The finally blocks of one source that release the capture lock before they close a browser. */
const releaseBeforeClose = (text) => finallyBlocks(text).filter(({ body }) => {
  const released = body.search(RELEASE), closed = body.search(CLOSE);
  return released >= 0 && closed > released;
}).map(({ line }) => line);
assert.deepEqual(releaseBeforeClose('try { go(); } finally {\n  lock.release();\n  await browser.close();\n}'), [1], 'a release before the close');
assert.deepEqual(releaseBeforeClose('try { go(); } finally { await browser?.close(); await server?.close(); lock.release(); }'), [], 'a close, then the release');
assert.deepEqual(releaseBeforeClose('try { go(); } finally { lock.release(); }\nawait browser.close();'), [], 'another block\'s close');

// a source that imports a capture lock (built from parts so this file is not its own finding) and calls acquire() itself
const LOCK_IMPORT = new RegExp(['capture-lock', '\\.mjs|visual-census-lock', '\\.mjs'].join(''));
const ACQUIRE = new RegExp(['\\.acq', 'uire\\(|acquireCapture', 'Lock\\('].join(''));
const HOLD_OWNERS = new Set(['tools/capture-lock.mjs', 'tools/capture-hold.mjs', 'tools/visual-census-lock.mjs', SELF]);
const acquiresDirectly = (file, text) => !HOLD_OWNERS.has(file) && LOCK_IMPORT.test(code(text)) && ACQUIRE.test(code(text));
{
  const via = (what) => `import { createCaptureLock } from './${'capture-lock'}.mjs';\n${what}`;
  assert.equal(acquiresDirectly('tools/a.mjs', via(`const lock = createCaptureLock(); await lock.${'acq'}uire(60_000);`)), true, 'a direct acquire');
  assert.equal(acquiresDirectly('tools/a.mjs', via('await withCaptureHold(work, { label: \'a\' });')), false, 'the wrapper');
  assert.equal(acquiresDirectly('tools/a.mjs', `await pool.${'acq'}uire(1);`), false, 'another acquire() (no capture lock imported)');
  assert.equal(acquiresDirectly('tools/a.mjs', via(`// await lock.${'acq'}uire(1);`)), false, 'a comment');
}
/** The tools that hold the GPU through a capture lock's acquire() themselves (2026-11-02): migrate one, drop its row. */
const DIRECT_ACQUIRERS = Object.freeze([
  'tools/anatomy-render-set.mjs', 'tools/audio-default-sink-probe.mjs', 'tools/bake-minimap-assets.mjs',
  'tools/black-world-repro.mjs', 'tools/bot-targeting.browser.mjs', 'tools/challenger-assembly.browser.mjs',
  'tools/combat-visibility.browser.mjs', 'tools/contig-phase-audit.mjs', 'tools/crushable-clutter.browser.mjs',
  'tools/drone-details.browser.mjs', 'tools/drone-hud.browser.mjs', 'tools/environment-motion-probe.mjs',
  'tools/far-tree-trunk-audit.mjs', 'tools/feature-promo-capture.mjs', 'tools/field-guide-capture.mjs',
  'tools/fonts.browser.mjs', 'tools/frame-budget-probe.mjs', 'tools/garage-battle-actions-probe.mjs',
  'tools/garage-draw-range-probe.mjs', 'tools/garage-mobile.browser.mjs', 'tools/garage-mode-preview.browser.mjs',
  'tools/garage-wheel-band.browser.mjs', 'tools/gate-audio-probe.mjs', 'tools/griffin-viper-garage-probe.mjs',
  'tools/ground-banding-shots.mjs', 'tools/gunship-fx.browser.mjs', 'tools/gunship-hud.browser.mjs',
  'tools/gunship-lens-strip.browser.mjs', 'tools/horizon-construction-bench.mjs', 'tools/isometric-camera.browser.mjs',
  'tools/letterbox-bands.browser.mjs', 'tools/loading-census.mjs', 'tools/map-environment-audit.mjs',
  'tools/marketing-shots/capture-multiplayer-dual-screen.mjs', 'tools/marketing-shots/capture-showcase-r2-ui.mjs',
  'tools/marketing-shots/mode-battle-shots.mjs', 'tools/marking-flicker-probe.mjs',
  'tools/media-motion-savedata.browser.mjs', 'tools/media-production/cinema.mjs', 'tools/media-production/produce.mjs',
  'tools/media-r5/lab.mjs', 'tools/media-r5/studio-ui.mjs', 'tools/minimap-contacts.browser.mjs',
  'tools/mp-room-census.mjs', 'tools/offline-import-probe.mjs', 'tools/pad-e2e.browser.mjs',
  'tools/props-build-profile.mjs', 'tools/rapid-fire-feedback.browser.mjs', 'tools/road-border-corridor-pilot.mjs',
  'tools/road-corridor-sections.mjs', 'tools/road-exit-native-audit.mjs', 'tools/run-selftests.mjs',
  'tools/running-gear-damage.browser.mjs', 'tools/shot-card-fit.browser.mjs', 'tools/shot-damage-figures.browser.mjs',
  'tools/shot-schematic-parity-probe.mjs', 'tools/six-modes.browser.mjs', 'tools/smoke-launchers.browser.mjs',
  'tools/solo-cold-import-cover-probe.mjs', 'tools/solo-kernels-probe.mjs',
  'tools/sourced-image-composition-probe.mjs', 'tools/spectator-cursor.browser.mjs',
  'tools/studio-ground-contact-probe.mjs', 'tools/tank-energy.browser.mjs', 'tools/tank-regen-changed.mjs',
  'tools/terrain-fast-cache-benchmark.mjs', 'tools/tree-crown-audit.browser.mjs',
  'tools/vehicle-special-action.browser.mjs', 'tools/vehicle-status.browser.mjs', 'tools/visual-census.mjs',
  'tools/water-palette-probe.mjs', 'tools/world-residency-probe.mjs', 'tools/wreck-build-profile.mjs',
  'tools/wreck-paint-bench.mjs',
]);
/** The lock's own receipts (and receipts that hold a private or the shared lock themselves), listed the same way. */
const DIRECT_ACQUIRER_RECEIPTS = Object.freeze([
  'tools/articulated-shadow-batch.browser.selftest.mjs', 'tools/battle-geometry-sharing.browser.selftest.mjs',
  'tools/black-world.browser.selftest.mjs', 'tools/browser-guard-holds.selftest.mjs',
  'tools/browser-launch.selftest.mjs', 'tools/capture-command.selftest.mjs', 'tools/capture-lock-reentry.selftest.mjs',
  'tools/capture-lock.selftest.mjs', 'tools/cloud-history.browser.selftest.mjs',
  'tools/destruction-first-use.browser.selftest.mjs', 'tools/garage-roster-settle.browser.selftest.mjs',
  'tools/garage-switch-probe.selftest.mjs', 'tools/horizon-panorama-bake.browser.selftest.mjs',
  'tools/hud-self-measure.browser.selftest.mjs', 'tools/late-fx-matrix.browser.selftest.mjs',
  'tools/media-r5/priority-yield.selftest.mjs', 'tools/mp-rooms-entry.browser.selftest.mjs',
  'tools/pane-stack-layer.browser.selftest.mjs', 'tools/resolved-depth-copy.browser.selftest.mjs',
  'tools/session-mutex.selftest.mjs', 'tools/source-dimension-frame.browser.selftest.mjs',
  'tools/sourced-building-source.browser.selftest.mjs', 'tools/standard-check-stages.selftest.mjs',
  'tools/track-texture-source.browser.selftest.mjs', 'tools/vehicle-ground-occlusion.browser.selftest.mjs',
  'tools/visual-census-lock.selftest.mjs', 'tools/visual-census.selftest.mjs',
]);

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

const early = [...sources].flatMap(([file, text]) => releaseBeforeClose(text).map((line) => `${file}:${line}`));
assert.deepEqual(early, [], `close the browser before the capture lock is released (the next holder's GPU work would overlap it)\n  ${early.join('\n  ')}`);

const listed = new Set([...DIRECT_ACQUIRERS, ...DIRECT_ACQUIRER_RECEIPTS]);
const direct = [...sources].filter(([file, text]) => acquiresDirectly(file, text)).map(([file]) => file).sort();
const unlisted = direct.filter((file) => !listed.has(file));
assert.deepEqual(unlisted, [], `hold the capture lock through tools/capture-hold.mjs withCaptureHold (refresh, cap, yield, signals and teardown in one place), not acquire():\n  ${unlisted.join('\n  ')}`);
const stale = [...listed].filter((file) => !direct.includes(file));
assert.deepEqual(stale, [], `no longer a direct acquirer (migrated, moved or gone): drop its row\n  ${stale.join('\n  ')}`);
const wrapped = [...sources].filter(([file, text]) => file !== 'tools/capture-hold.mjs' && /\b(?:withCaptureHold|runWarmHold)\(/.test(code(text))).length;
assert.ok(wrapped >= 6, `the wrapper has its users (${wrapped})`);

console.log(`capture-hold-census.selftest: ${sources.size} sources; no retired memory-guard gate; every browser closes before its lock goes; `
  + `${wrapped} hold through the wrapper, ${DIRECT_ACQUIRERS.length} tools and ${DIRECT_ACQUIRER_RECEIPTS.length} receipts still acquire directly (listed)`);
