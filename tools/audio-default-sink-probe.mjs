#!/usr/bin/env node
// Opt-in native AUDIO experiment; plays a quiet 440 Hz tone per real click.
// NEVER run under runSelftestSuite's outer lease: this CLI owns the shared FIFO.
// node tools/audio-default-sink-probe.mjs --allow-native-audio --out=/absolute/new-directory [--blocks=3] [--executable-path=/absolute/chrome]
// No game boot, build, autoplay bypass, fake audio, device enumeration or mic.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { createCaptureLock } from './capture-lock.mjs';
import { withIsolatedCaptureBrowser } from './isolated-capture-browser.mjs';
import { nativeBrowserLaunchOptions, verifyNativeBrowserLaunch } from './native-browser-launch.mjs';
import { audioSinkOrder, deadline, summarizeAudioSinkExperiment } from './audio-default-sink.fixture.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ROUTE = '/__audio_default_sink_fixture';
const HELP = 'node tools/audio-default-sink-probe.mjs --allow-native-audio --out=/absolute/new-directory [--blocks=3] [--executable-path=/absolute/chrome]';

export function audioProbeOptions(args) {
  assert.ok(args.every(arg => /^(--allow-native-audio|--(?:out|blocks|executable-path)=.+)$/.test(arg)), 'Unknown argument');
  assert.ok(args.includes('--allow-native-audio'), 'Explicit --allow-native-audio required; this emits a quiet test tone');
  const value = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const out = value('out'), executablePath = value('executable-path'), blocks = Number(value('blocks') ?? 3);
  assert.ok(out && isAbsolute(out), '--out must be an absolute new directory');
  assert.ok(!executablePath || isAbsolute(executablePath), '--executable-path must be absolute');
  audioSinkOrder(blocks);
  return { out: resolve(out), blocks, executablePath };
}

export function audioProbeLaunchOptions(executablePath) {
  return nativeBrowserLaunchOptions({ headless: false, timeout: 30000, protocolTimeout: 30000,
    ...(executablePath ? { executablePath } : {}), ignoreDefaultArgs: ['--mute-audio'],
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
}

function verifyAudioLaunch(browser) {
  const launch = verifyNativeBrowserLaunch(browser), args = browser.process().spawnargs;
  const forbidden = /^(?:--mute-audio|--autoplay-policy|--use-fake-device-for-media-stream|--use-fake-ui-for-media-stream|--use-file-for-fake-audio-capture)(?:=|$)/;
  assert.ok(!args.some(arg => forbidden.test(arg)), 'Native audio launch forbids mute/autoplay/fake-device overrides');
  return { ...launch, muted: false, autoplayOverride: false, fakeDevices: false, headless: false };
}

function acquisitionHash() {
  const hash = createHash('sha256');
  for (const file of ['audio-default-sink-probe.mjs', 'audio-default-sink.fixture.mjs', 'audio-default-sink.selftest.mjs',
    'capture-lock.mjs', 'native-browser-launch.mjs', 'isolated-capture-browser.mjs', '../package-lock.json']) {
    hash.update(file).update('\0').update(readFileSync(new URL(file, import.meta.url))).update('\0');
  }
  return hash.digest('hex');
}

function serverOptions() {
  return { root: ROOT, logLevel: 'error', configFile: false,
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
    plugins: [{ name: 'audio-default-sink-fixture', configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== ROUTE) return next();
        response.setHeader('Content-Type', 'text/html');
        response.setHeader('Permissions-Policy', 'microphone=(), camera=(), speaker-selection=(self)');
        response.end('<!doctype html><html><head><title>Default audio sink experiment</title><link rel="icon" href="data:,"></head><body data-audio-sink-fixture="1"><p>Native default-output experiment. Clicking Start emits a quiet test tone.</p></body></html>');
      });
    } }] };
}

async function sampleClick(page, mode) {
  await page.evaluate(async selectedMode => {
    const { installAudioSinkFixture } = await import('/tools/audio-default-sink.fixture.mjs');
    window.__AUDIO_SINK_PROBE = installAudioSinkFixture(selectedMode);
    // Establish callback cadence before dispatch, without constructing audio.
    const startedAt = performance.now();
    do { await new Promise(requestAnimationFrame); } while (performance.now() - startedAt < 250);
  }, mode);
  await page.click('#audio-sink-start'); // Native input, never dispatchEvent/evaluate(click).
  const result = await deadline(page.evaluate(() => window.__AUDIO_SINK_PROBE.finished), 18000, 'native audio attempt');
  result.foreground = await page.evaluate(() => ({ hidden: document.hidden, focused: document.hasFocus() }));
  await page.evaluate(() => window.__AUDIO_SINK_PROBE.dispose());
  return result;
}

async function runSample(browser, url, scenario, report) {
  const context = await browser.createBrowserContext();
  const sample = { ...scenario, browserContextClosed: false, fallback: null };
  report.samples.push(sample); // Preserve partial/error evidence, never discard failed B.
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => { if (report.errors.length < 24) report.errors.push(String(error)); });
    await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 1 });
    await page.setCacheEnabled(false);
    const navigation = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    assert.equal(navigation.status(), 200);
    assert.equal(await page.evaluate(() => document.body.dataset.audioSinkFixture), '1');
    await page.bringToFront();
    assert.deepEqual(await page.evaluate(() => ({ secure: isSecureContext, hidden: document.hidden })),
      { secure: true, hidden: false });
    Object.assign(sample, await sampleClick(page, scenario.mode));
    if (sample.fallbackRequired && sample.closed) {
      // An explicitly separate real click; never substituted into ABBA timing.
      sample.fallback = await sampleClick(page, 'default');
      sample.fallback.role = 'separate-trusted-click-compatibility-only';
    }
  } catch (error) { sample.error = String(error); sample.ok = false; }
  finally {
    await deadline(context.close(), 10000, 'owned browser context close');
    sample.browserContextClosed = true;
  }
}

export async function runAudioSinkProbe(options) {
  const { out, blocks, executablePath } = audioProbeOptions(['--allow-native-audio', `--out=${options.out}`,
    `--blocks=${options.blocks ?? 3}`, ...(options.executablePath ? [`--executable-path=${options.executablePath}`] : [])]);
  mkdirSync(out); // Never overwrite historical evidence.
  const report = { protocol: 'audio-default-sink-ABBA-v1', ok: false,
    baseRevision: '559e7b779ef18588f9e0e5a91c73a37c971d0128',
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    acquisitionHash: acquisitionHash(), startedAt: new Date().toISOString(), blocks,
    semantics: 'A: interactive/default; B: interactive/none then await setSinkId(empty string). No explicit sampleRate in either arm.',
    cacheScope: 'Fresh browser context and AudioContext per sample; one shared browser process/audio service, OS/device cache unspecified.',
    samples: [], errors: [], cleanupErrors: [], browserClosed: false, serverClosed: false, lockReleased: false };
  const lock = createCaptureLock();
  let refresh, held = false, browser, interrupted = null, closing;
  const active = () => { if (interrupted) throw new Error(`Interrupted by ${interrupted}`); };
  const interrupt = signal => { interrupted ||= signal; if (browser) void browser.close().catch(() => {}); };
  const sigint = () => interrupt('SIGINT'), sigterm = () => interrupt('SIGTERM');
  process.on('SIGINT', sigint); process.on('SIGTERM', sigterm);
  try {
    // Queue waiting does not consume the per-attempt deadline. On interruption
    // the existing non-abortable FIFO producer drains before this owner exits.
    await lock.acquire(45 * 60_000); held = true; active();
    refresh = setInterval(() => lock.refresh(), 30000); refresh.unref();
    await withIsolatedCaptureBrowser(serverOptions(), audioProbeLaunchOptions(executablePath), async owners => {
      active(); report.launch = verifyAudioLaunch(owners.browser); report.browserVersion = await owners.browser.version();
      const url = `http://127.0.0.1:${owners.server.httpServer.address().port}${ROUTE}`;
      for (const scenario of audioSinkOrder(blocks)) {
        active(); await runSample(owners.browser, url, scenario, report);
      }
    }, {
      createViteServer: async value => {
        const server = await createServer(value), close = server.close.bind(server);
        server.close = async () => {
          const pending = close();
          try { await deadline(pending, 10000, 'owned Vite close'); report.serverClosed = true; }
          catch (error) {
            // A deadline is not cancellation: drain the admitted close before
            // the shared helper deletes its cache or releases our FIFO lease.
            await Promise.allSettled([pending]); throw error;
          }
        };
        return server;
      },
      launchBrowser: async value => {
        browser = await puppeteer.launch(value);
        const close = browser.close.bind(browser);
        browser.close = () => {
          closing ??= (async () => {
            const pending = close();
            try { await deadline(pending, 15000, 'owned browser close'); report.browserClosed = true; }
            catch (error) {
              const child = browser.process();
              if (child && child.exitCode === null && child.signalCode === null) {
                const exited = new Promise(resolve => child.once('exit', resolve));
                child.kill('SIGKILL'); await deadline(exited, 5000, 'owned browser kill/drain');
              }
              await Promise.allSettled([pending]);
              throw error;
            }
          })();
          return closing;
        };
        return browser;
      },
      logCleanupError: (resource, error) => report.cleanupErrors.push(`${resource}: ${error}`),
    });
    active();
    assert.equal(acquisitionHash(), report.acquisitionHash, 'Acquisition source changed during measurement');
  } catch (error) { report.errors.push(String(error)); }
  finally {
    clearInterval(refresh);
    if (held) { lock.release(); report.lockReleased = true; }
    process.removeListener('SIGINT', sigint); process.removeListener('SIGTERM', sigterm);
  }
  report.summary = summarizeAudioSinkExperiment(report.samples);
  report.ok = report.samples.length === blocks * 4 && report.samples.every(row => row.ok && row.browserContextClosed
    && row.foreground?.focused && !row.foreground?.hidden) && report.errors.length === 0 && report.cleanupErrors.length === 0
    && report.browserClosed && report.serverClosed && report.lockReleased;
  report.hypothesisPassed = report.ok && report.summary.verdict === 'promising-microprobe-only';
  writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes('--help')) console.log(HELP);
  else {
    const options = audioProbeOptions(process.argv.slice(2));
    const report = await runAudioSinkProbe(options);
    console.log(JSON.stringify({ ok: report.ok, hypothesisPassed: report.hypothesisPassed,
      summary: report.summary, report: join(options.out, 'report.json'), errors: report.errors }, null, 2));
    if (!report.ok) process.exitCode = 1;
  }
}
