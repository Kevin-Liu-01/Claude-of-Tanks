#!/usr/bin/env node
// Scene Studio cinema masters (docs/MEDIA-PRODUCTION.md "Cinema masters").
//
// Renders Studio scenes through the deterministic accumulation film renderer
// (src/game/studioFilm.ts: shutter-sampled motion blur, jittered anti-aliasing,
// speed ramps) at native landscape / portrait / square sizes up to 2160p,
// writes the lossless PNG sequence, then a ProRes 422 HQ master and an H.264
// proxy, plus supersampled stills. Receipts, digests, resume and the shared
// capture lock follow produce.mjs. `--jobs=file.json` renders several jobs in
// one browser session and one capture-lock hold (a trailer's shot list).
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, readdirSync, createReadStream, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCaptureLock, ticketAt } from '../capture-lock.mjs';
import { digest, sourceDigest, contactSheet, leaseClock } from './pipeline.mjs';
import { normalizeFilm, filmOutputSize, createFilmPlan } from '../../src/game/studioFilmPlan.ts';

const JOB_OPTIONS = ['scene', 'formats', 'resolution', 'fps', 'samples', 'max-samples', 'shutter', 'filter', 'shake', 'start-ms', 'end-ms',
  'frames', 'stills', 'still-samples', 'still-exposure-ms', 'still-max-samples', 'supersample', 'film', 'master', 'proxy',
  'keep-frames', 'out', 'resume'];
const OPTIONS = [...JOB_OPTIONS, 'jobs', 'port', 'cache-dir', 'ticket-stamp', 'lease-min'];
const help = `npm run media:cinema -- --scene=scene.json [--formats=landscape,portrait,square] [--resolution=1080|1440|2160]
  [--fps=24|30|60] [--samples=1-64] [--max-samples=<samples>-128] [--shutter=0-360] [--filter=gaussian|box] [--shake=0-2]
  [--start-ms=0] [--end-ms=<storyboard>] [--frames=<limit>] [--stills=<timeline ms,...>] [--still-samples=32]
  [--still-exposure-ms=0-1000] [--still-max-samples=<still-samples>-128]
  [--supersample=1-2] [--film=true|false] [--master=prores|none] [--proxy=true|false] [--keep-frames=false]
  [--out=shots/cinema] [--resume=true] [--port=5381] [--cache-dir=<vite cache>] [--ticket-stamp=<ms>] [--lease-min=<minutes>]
  or --jobs=jobs.json: an array of jobs with the same keys (without "--"); every job needs its own "out".
--ticket-stamp joins the capture queue at that place (a run split over leases keeps its first ticket's place);
--lease-min ends the capture lease before a film that would carry it past the budget, exit 75: resume the rest.
Film settings default to the scene's "film" block, then the Studio defaults (30 fps, 180°, 8 samples
adaptive to 64 on fast motion, gaussian). Speed ramps come from the scene's film.speed keys.`;
if (process.argv.includes('--help')) { console.log(help); process.exit(0); }
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const match = /^--([a-z-]+)=(.+)$/.exec(arg);
  if (!match || !OPTIONS.includes(match[1])) throw Error(help);
  return [match[1], match[2]];
}));
const rawJobs = args.jobs
  ? JSON.parse(readFileSync(resolve(args.jobs), 'utf8')).map(job => Object.fromEntries(Object.entries(job).map(([key, value]) => {
    if (!JOB_OPTIONS.includes(key)) throw Error(`Unknown job key ${key}\n${help}`);
    return [key, String(value)];
  })))
  : [Object.fromEntries(Object.entries(args).filter(([key]) => JOB_OPTIONS.includes(key)))];
if (!rawJobs.length || rawJobs.some(job => !job.scene)) throw Error(help);
if (args.jobs && (rawJobs.some(job => !job.out) || new Set(rawJobs.map(job => resolve(job.out))).size !== rawJobs.length)) {
  throw Error('Every job needs its own "out" directory');
}
// 2026-10-07 (the coordinator's alternating finals): a long batch runs as several leases, one process each; every lease
// joins the queue at the batch's first stamp, so it follows whichever lane held the GPU in between, not the line's tail.
const ticket = args['ticket-stamp'] === undefined ? null : ticketAt(Number(args['ticket-stamp']));
const leaseMs = Number(args['lease-min'] ?? 0) * 60000;
if (!(leaseMs >= 0)) throw Error(help);

/** Validate one job into its settings, receipt and output paths (before taking the GPU). */
async function prepareJob(raw) {
  const scene = JSON.parse(readFileSync(resolve(raw.scene), 'utf8'));
  const sceneFormat = scene.productionFormat ?? 'landscape';
  const formats = raw.formats?.split(',') ?? [sceneFormat];
  if (!formats.length || new Set(formats).size !== formats.length || !formats.every(f => ['landscape', 'portrait', 'square'].includes(f))) {
    throw Error('Invalid formats');
  }
  const resolution = Number(raw.resolution ?? 1080);
  const authored = scene.film ?? {};
  const film = normalizeFilm({
    fps: raw.fps ? Number(raw.fps) : authored.fps,
    samples: raw.samples ? Number(raw.samples) : authored.samples,
    maxSamples: raw['max-samples'] ? Number(raw['max-samples']) : authored.maxSamples,
    shutterDeg: raw.shutter ? Number(raw.shutter) : authored.shutterDeg,
    filter: raw.filter ?? authored.filter,
    shake: raw.shake ? Number(raw.shake) : authored.shake,
    speed: authored.speed,
  });
  const durationMs = scene.storyboard?.durationMs ?? 12000;
  const job = {
    scene, formats, resolution, film,
    startMs: Number(raw['start-ms'] ?? 0),
    endMs: Number(raw['end-ms'] ?? durationMs),
    frameLimit: raw.frames ? Number(raw.frames) : null,
    stills: raw.stills ? raw.stills.split(',').map(Number) : [],
    stillSamples: Number(raw['still-samples'] ?? 32),
    stillExposureMs: Number(raw['still-exposure-ms'] ?? 0),
    stillMaxSamples: raw['still-max-samples'] ? Number(raw['still-max-samples']) : null,
    supersample: Number(raw.supersample ?? 1),
    renderFilms: (raw.film ?? 'true') === 'true',
    master: raw.master ?? 'prores',
    proxy: (raw.proxy ?? 'true') === 'true',
    keepFrames: raw['keep-frames'] === 'true',
    out: resolve(raw.out ?? 'shots/cinema'),
  };
  if (![1080, 1440, 2160].includes(resolution) || !(job.endMs > job.startMs) || job.startMs < 0 || job.endMs > durationMs
    || (job.frameLimit !== null && !(Number.isInteger(job.frameLimit) && job.frameLimit > 0))
    || !job.stills.every(ms => Number.isFinite(ms) && ms >= 0 && ms <= durationMs)
    || !(Number.isInteger(job.stillSamples) && job.stillSamples >= 1 && job.stillSamples <= 64)
    || !(job.stillExposureMs >= 0 && job.stillExposureMs <= 1000)
    || (job.stillMaxSamples !== null && !(Number.isInteger(job.stillMaxSamples) && job.stillMaxSamples >= job.stillSamples
      && job.stillMaxSamples <= 128))
    || !(job.supersample >= 1 && job.supersample <= 2) || !['prores', 'none'].includes(job.master)
    || (!job.renderFilms && !job.stills.length)) throw Error(`Invalid cinema settings for ${raw.scene}\n${help}`);
  mkdirSync(job.out, { recursive: true });
  job.receiptFile = join(job.out, 'cinema-receipt.json');
  const config = { scene, formats, resolution, film, startMs: job.startMs, endMs: job.endMs, frameLimit: job.frameLimit,
    stills: job.stills, stillSamples: job.stillSamples, stillExposureMs: job.stillExposureMs, stillMaxSamples: job.stillMaxSamples,
    supersample: job.supersample, renderFilms: job.renderFilms,
    master: job.master, proxy: job.proxy };
  if (raw.resume === 'true' && existsSync(job.receiptFile)) {
    const receipt = JSON.parse(readFileSync(job.receiptFile, 'utf8'));
    if (receipt.sourceDigest !== fingerprint || JSON.stringify(receipt.config) !== JSON.stringify(config)) {
      throw Error(`Sources or cinema settings changed for ${job.out}; use a new output directory`);
    }
    receipt.films = receipt.films.filter(row => row.complete);
    receipt.stills = receipt.stills.filter(row => row.complete);
    for (const row of [...receipt.films, ...receipt.stills]) for (const file of row.files) {
      if (!existsSync(file.path) || await hashFile(file.path) !== file.sha256) throw Error(`Capture changed or missing: ${file.path}`);
    }
    receipt.errors = []; delete receipt.finished;
    job.receipt = receipt;
  } else {
    if (existsSync(job.receiptFile)) throw Error(`Output already exists: ${job.out}; choose a new directory or resume=true`);
    job.receipt = { version: 1, tool: 'cinema', sourceDigest: fingerprint, revision,
      started: new Date().toISOString(), config, films: [], stills: [], errors: [] };
  }
  job.save = () => writeFileSync(job.receiptFile, JSON.stringify(job.receipt, null, 2) + '\n');
  return job;
}

const pngSize = bytes => [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
// Masters run to gigabytes: hash by stream, never by whole-file reads.
async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
const fileRecord = async (path, extra = {}) => ({ path, bytes: statSync(path).size, sha256: await hashFile(path), ...extra });
const probe = file => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0',
  '-show_entries', 'stream=codec_name,profile,width,height,pix_fmt,nb_read_frames,r_frame_rate,color_space,color_transfer,color_primaries:format=duration',
  '-of', 'json', file], { encoding: 'utf8' }));
const colorTags = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];
const frameName = index => `frame-${String(index).padStart(5, '0')}.png`;

const fingerprint = sourceDigest();
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const jobs = [];
for (const raw of rawJobs) jobs.push(await prepareJob(raw));

// Frames stream to disk through the private dev server: the browser encodes
// PNGs off its main thread (canvas.toBlob) and POSTs raw bytes, avoiding a
// base64 round trip through the DevTools protocol for every 4K frame.
const token = digest(Buffer.from(`${process.pid}:${Date.now()}`)).slice(0, 16);
let frameDir = null;
const framePlugin = {
  name: 'cot-cinema-frames',
  configureServer(server) {
    server.middlewares.use('/__cinema/frame', (req, res) => {
      const url = new URL(req.url ?? '', 'http://127.0.0.1');
      const index = Number(url.searchParams.get('i'));
      if (req.method !== 'POST' || url.searchParams.get('token') !== token || !frameDir || !Number.isInteger(index) || index < 0) {
        res.statusCode = 403; res.end(); return;
      }
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        try {
          writeFileSync(join(frameDir, frameName(index)), Buffer.concat(chunks));
          res.statusCode = 204; res.end();
        } catch (error) { res.statusCode = 500; res.end(String(error)); }
      });
    });
  },
};

const lock = createCaptureLock();
let server, browser, interrupted = false;
await lock.acquire(6 * 60 * 60 * 1000, { ticket });
const heldSince = Date.now(), leaseTime = leaseClock(leaseMs, heldSince);
let leaseOver = false;
// A call that times out leaves the browser wedged (2026-10-07: a still spun the GPU process for 30 minutes under memory
// pressure): the batch ends there, its error recorded, and the caller starts the rest in a fresh browser.
let wedged = false;
const timedOut = (error) => /timed out/i.test(String(error?.message ?? error));
const stop = () => { interrupted = true; void browser?.close().catch(() => {}); };
process.once('SIGINT', stop); process.once('SIGTERM', stop);
const lease = setInterval(() => lock.refresh?.(), 30000); lease.unref();
try {
  const port = Number(args.port ?? 5381);
  server = await createServer({ root: process.cwd(), logLevel: 'error', plugins: [framePlugin],
    ...(args['cache-dir'] ? { cacheDir: resolve(args['cache-dir']) } : {}),
    server: { host: '127.0.0.1', port, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } } });
  await server.listen();
  // Vite's own SIGTERM handler exits the process (code 143) before the finally below can release the capture lock: the
  // stop above owns SIGTERM, so a stopped batch always ends its lease.
  for (const listener of process.listeners('SIGTERM')) if (listener !== stop) process.off('SIGTERM', listener);
  const origin = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? `http://127.0.0.1:${port}`;
  browser = await puppeteer.launch({ headless: true, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
    protocolTimeout: 600000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage', '--js-flags=--expose-gc'] });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(message.text()); });
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(`${origin}/?studio=1&nosplash=1&tier=desktop&map=${jobs[0].scene.map ?? 'verdant'}&diag`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__STUDIO?.active && window.__GAME_READY, { timeout: 300000, polling: 500 });
  await page.evaluate(async () => {
    const { awaitMapCaptureReadiness } = await import('/src/dev/mapCaptureReadiness.ts');
    await awaitMapCaptureReadiness(window.__DEBUG.world, () => window.__DEBUG.world);
    window.__STUDIO.pause(); window.__DEBUG.post.pinDynScale(1);
    window.__DEBUG.post.resetPerfTrims(); window.__DEBUG.post.setAdaptiveSuspended(true);
  });
  const rendererInfo = await page.evaluate(() => {
    const r = window.__DEBUG.renderer, gl = r.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info');
    return { gpu: e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), maxTextureSize: r.capabilities.maxTextureSize,
      floatBlend: !!gl.getExtension('EXT_float_blend') };
  });
  const prepareView = () => page.evaluate(async () => {
    const D = window.__DEBUG;
    for (let steps = 0; steps < 192; steps++) {
      if (!D.world.warmTerrainLookahead(D.camera.position, 1)) break;
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    D.world.update(0, D.camera.position);
  });
  // The scene reframed for a format by the Studio's own reviewed reframing.
  const sceneFor = (scene, format) => page.evaluate(async ({ scene, format }) => {
    await window.__STUDIO.load({ ...scene, fxTime: 0, timeScale: 0 });
    if (format !== (scene.productionFormat ?? 'landscape')) window.__STUDIO.setProductionFormat(format);
    return window.__STUDIO.state();
  }, { scene, format });
  const throwPageErrors = async () => {
    errors.push(...await page.evaluate(() => window.__GL_DIAG?.errors ?? []));
    if (errors.length) throw Error(errors.splice(0).slice(0, 4).join('\n'));
  };

  jobLoop: for (const job of jobs) {
    if (interrupted || wedged) break;
    const { receipt, save, film, scene } = job;
    receipt.renderer = rendererInfo;
    save();
    for (const format of job.renderFilms ? job.formats : []) {
      if (interrupted || wedged) break;
      const { width, height } = filmOutputSize(format, job.resolution);
      // Named by the short side, so a portrait 1080x1920 film reads 1080p like its landscape sibling.
      const stem = `${scene.map ?? 'scene'}-${format}-${job.resolution}p${film.fps}-n${film.samples}`;
      if (receipt.films.some(row => row.stem === stem && row.complete)) { console.log(`[cinema] preserved ${stem}`); continue; }
      if (leaseTime.endBefore()) {
        leaseOver = true;
        console.log(`[cinema] lease over at ${((Date.now() - heldSince) / 60000).toFixed(1)} min (longest take ${(leaseTime.longestTake / 60000).toFixed(1)} min): ${stem} and the rest wait for the next lease`);
        break jobLoop;
      }
      const dir = join(job.out, 'films', stem);
      mkdirSync(dir, { recursive: true });
      for (const name of readdirSync(dir)) if (/^frame-\d+\.png$/.test(name)) unlinkSync(join(dir, name));
      const row = { stem, format, width, height, fps: film.fps, samples: film.samples, maxSamples: film.maxSamples,
        shutterDeg: film.shutterDeg, filter: film.filter, speed: film.speed, files: [], frames: [] };
      receipt.films.push(row); save();
      try {
        const framed = await sceneFor(scene, format);
        row.scene = framed;
        writeFileSync(join(dir, 'scene.json'), JSON.stringify(framed, null, 2) + '\n');
        await page.evaluate(value => window.__STUDIO.load(value), framed); await prepareView();
        const plan = createFilmPlan(film, Math.round(job.startMs), Math.min(job.endMs, framed.storyboard.durationMs));
        const session = await page.evaluate(options => window.__STUDIO.beginFilm(options),
          { width, height, fps: film.fps, samples: film.samples, maxSamples: film.maxSamples, shutterDeg: film.shutterDeg,
            filter: film.filter, shake: film.shake, speed: film.speed, startMs: job.startMs, endMs: job.endMs });
        if (session.frames !== plan.frames) throw Error(`Studio planned ${session.frames} frames, the exporter ${plan.frames}`);
        const frames = Math.min(session.frames, job.frameLimit ?? Infinity);
        row.filmDurationMs = session.filmDurationMs;
        frameDir = dir;
        const started = Date.now();
        for (let index = 0; index < frames; index++) {
          if (interrupted) throw Error('Capture interrupted');
          const info = await page.evaluate(async ({ index, token }) => {
            const S = window.__STUDIO, canvas = window.__DEBUG.renderer.domElement;
            const t0 = performance.now();
            const frame = S.renderFilmFrame();
            const renderMs = performance.now() - t0;
            const pending = window.__cinemaUploads ??= new Set();
            const upload = new Promise((resolve, reject) => canvas.toBlob(blob => {
              if (!blob) { reject(Error('PNG encode failed')); return; }
              fetch(`/__cinema/frame?token=${token}&i=${index}`, { method: 'POST', body: blob })
                .then(response => response.ok ? resolve() : reject(Error(`frame upload ${response.status}`)), reject);
            }, 'image/png'));
            pending.add(upload);
            upload.finally(() => pending.delete(upload));
            while (pending.size > 2) await Promise.race(pending);
            // Grained, smoky 1080p frames encode to ~5-8 MB PNGs and Chrome keeps each uploaded blob until a collection:
            // 198 of them overran its blob store (net::ERR_BLOB_OUT_OF_MEMORY, 2026-10-02). Every tenth frame, let the
            // uploads land and collect.
            if (index % 10 === 9) { await Promise.all([...pending]); globalThis.gc?.(); }
            return { ...frame, renderMs };
          }, { index, token });
          if (Math.abs(info.timelineMs - plan.frameTimelineMs(index)) > 1e-6) throw Error('The frame clock drifted from the film plan');
          row.frames.push({ frame: index, filmMs: +info.filmTimeMs.toFixed(4), timelineMs: +info.timelineMs.toFixed(4),
            openMs: +info.openMs.toFixed(4), closeMs: +info.closeMs.toFixed(4), samples: info.samples,
            motionPx: +info.motionPx.toFixed(1), renderMs: Math.round(info.renderMs) });
          if (index % 30 === 0 || index === frames - 1) {
            console.log(`[cinema] ${stem}: ${index + 1}/${frames} · ${info.samples} samples · ${Math.round(info.renderMs)} ms render`);
          }
        }
        await page.evaluate(() => Promise.all([...(window.__cinemaUploads ?? [])]));
        row.wallSecondsPerFrame = (Date.now() - started) / 1000 / frames;
        row.renderSecondsPerFrame = row.frames.reduce((sum, f) => sum + f.renderMs, 0) / 1000 / frames;
        await page.evaluate(() => window.__STUDIO.endFilm());
        frameDir = null;
        await throwPageErrors();
        // Verify the lossless sequence before encoding anything from it.
        const sequence = [];
        for (let index = 0; index < frames; index++) {
          const bytes = readFileSync(join(dir, frameName(index)));
          const [w, h] = pngSize(bytes);
          if (w !== width || h !== height) throw Error(`Frame ${index} is ${w}×${h}, expected ${width}×${height}`);
          sequence.push(digest(bytes));
        }
        row.frameDigests = sequence.map(hash => hash.slice(0, 16));
        row.sequenceSha256 = digest(Buffer.from(sequence.join('\n')));
        const input = ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(film.fps), '-i', join(dir, 'frame-%05d.png'), '-frames:v', String(frames)];
        // Encoders tag what the frames carry: setparams marks BT.709 limited range on every frame.
        const toVideo = 'scale=out_color_matrix=bt709:out_range=tv';
        const tagged = 'setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709';
        // The encodes and probes run synchronously and hold off the 30 s lease timer: renew the lock before each one.
        if (job.master === 'prores') {
          const path = join(job.out, 'films', `${stem}-master.mov`);
          lock.refresh();
          execFileSync('ffmpeg', [...input, '-vf', `${toVideo},format=yuv422p10le,${tagged}`, '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0',
            '-pix_fmt', 'yuv422p10le', ...colorTags, path]);
          lock.refresh();
          const meta = probe(path);
          const stream = meta.streams[0];
          if (Number(stream.nb_read_frames) !== frames || stream.width !== width || stream.height !== height || stream.codec_name !== 'prores') {
            throw Error(`ProRes master verification failed: ${JSON.stringify(stream)}`);
          }
          row.files.push(await fileRecord(path, { kind: 'master', codec: 'prores_ks 422 HQ', probe: meta }));
        }
        if (job.proxy) {
          const path = join(job.out, 'films', `${stem}-proxy.mp4`);
          lock.refresh();
          execFileSync('ffmpeg', [...input, '-vf', `${toVideo},format=yuv420p,${tagged}`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '14',
            '-profile:v', 'high', '-pix_fmt', 'yuv420p', ...colorTags, '-movflags', '+faststart', path]);
          lock.refresh();
          const meta = probe(path);
          const stream = meta.streams[0];
          if (Number(stream.nb_read_frames) !== frames || stream.width !== width || stream.height !== height) {
            throw Error(`H.264 proxy verification failed: ${JSON.stringify(stream)}`);
          }
          row.files.push(await fileRecord(path, { kind: 'proxy', codec: 'libx264 high crf14', probe: meta }));
        }
        // Review sheet from one frame per second, then bound the disk use.
        const picks = [];
        for (let index = 0; index < frames; index += film.fps) picks.push(index);
        if (picks[picks.length - 1] !== frames - 1) picks.push(frames - 1);
        const sheetFrames = picks.map(index => ({ path: join(dir, frameName(index)),
          label: `${format} · frame ${index} · ${(row.frames[index].timelineMs / 1000).toFixed(2)} s · ${row.frames[index].samples} samples` }));
        const sampling = film.samples === 1 ? '1 SAMPLE' : film.maxSamples > film.samples ? `${film.samples}–${film.maxSamples} SAMPLES` : `${film.samples} SAMPLES`;
        await contactSheet(sheetFrames, join(dir, 'motion-sheet.jpg'), `${stem.toUpperCase()} / ${film.shutterDeg}° / ${sampling}`);
        row.files.push(await fileRecord(join(dir, 'motion-sheet.jpg'), { kind: 'review-sheet' }));
        row.reviewFrames = [];
        for (const file of sheetFrames) row.reviewFrames.push(await fileRecord(file.path, { kind: 'review-frame', label: file.label }));
        if (!job.keepFrames) {
          const retained = new Set(sheetFrames.map(file => file.path));
          for (let index = 0; index < frames; index++) {
            const path = join(dir, frameName(index));
            if (!retained.has(path)) unlinkSync(path);
          }
        }
        row.complete = true; save();
        console.log(`[cinema] ${stem}: ${frames} frames · ${row.renderSecondsPerFrame.toFixed(2)} s/frame render · ${row.wallSecondsPerFrame.toFixed(2)} s/frame wall`);
      } catch (error) {
        frameDir = null;
        await page.evaluate(() => window.__STUDIO.endFilm()).catch(() => {});
        row.error = String(error.stack ?? error); receipt.errors.push({ film: stem, error: row.error }); save();
        if (timedOut(error)) wedged = true;
        console.error(`[cinema] ${stem} FAILED: ${error.message}`);
      }
    }

    for (const format of job.formats) for (const ms of job.stills) {
      if (interrupted || wedged) break;
      const { width, height } = filmOutputSize(format, job.resolution);
      const exposed = job.stillExposureMs > 0 ? `-e${job.stillExposureMs}ms` : '';
      const stem = `${scene.map ?? 'scene'}-${format}-${job.resolution}p-still-${Math.round(ms)}ms${exposed}`;
      if (receipt.stills.some(row => row.stem === stem && row.complete)) continue;
      const row = { stem, format, width, height, timelineMs: ms, samples: job.stillSamples, exposureMs: job.stillExposureMs,
        supersample: job.supersample, files: [] };
      receipt.stills.push(row);
      try {
        const framed = await sceneFor(scene, format);
        await page.evaluate(({ value, ms }) => window.__STUDIO.load({ ...value, fxTime: ms, timeScale: 0 }), { value: framed, ms });
        await prepareView();
        const capture = await page.evaluate(options => window.__STUDIO.capture(options),
          { width, height, samples: job.stillSamples, supersample: job.supersample, filter: film.filter,
            exposureMs: job.stillExposureMs, maxSamples: job.stillMaxSamples ?? undefined, shake: film.shake });
        row.samplesUsed = capture.samples;
        const bytes = Buffer.from(capture.dataURL.split(',')[1], 'base64');
        const [w, h] = pngSize(bytes);
        if (w !== width || h !== height) throw Error('Still dimensions mismatch');
        const path = join(job.out, 'stills', `${stem}.png`);
        mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes);
        await throwPageErrors();
        row.files.push(await fileRecord(path, { kind: 'still' }));
        row.complete = true; save();
        console.log(`[cinema] still ${stem}`);
      } catch (error) {
        row.error = String(error.stack ?? error); receipt.errors.push({ still: stem, error: row.error }); save();
        if (timedOut(error)) wedged = true;
        console.error(`[cinema] ${stem} FAILED: ${error.message}`);
      }
    }
  }
} finally {
  await browser?.close().catch(() => {}); await server?.close().catch(() => {}); clearInterval(lease); lock.release();
  process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  const changed = sourceDigest() !== fingerprint;
  for (const job of jobs) {
    if (interrupted) job.receipt.errors.push({ error: 'Capture interrupted; this batch is incomplete' });
    if (wedged) console.error(`[cinema] the browser stopped answering; ended the batch so the rest renders in a fresh one`);
    if (changed) job.receipt.errors.push({ error: 'Rendering inputs changed during capture; discard this batch' });
    job.receipt.finished = new Date().toISOString(); job.save();
  }
}
if (jobs.some(job => job.receipt.errors.length)) process.exitCode = 1;
else if (leaseOver) process.exitCode = 75;
for (const job of jobs) console.log(`[cinema] receipt ${job.receiptFile}`);
