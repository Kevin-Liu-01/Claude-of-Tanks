// Rebuild the shortened balanced promo as two synchronized masters:
//   1. badge-led section headings with no subtitle/small-print line
//   2. identical footage with promotional typography removed
//
// All action reels preserve source speed. Variable-cadence browser captures
// are converted to CFR 60 with simple temporal frame blending, not optical
// flow, so missing frames are filled without bending tracks, foliage, or guns.
// Front- and rear-facing tank compositions are intentionally interleaved.

// Usage:
//   node tools/feature-promo-balanced-v2.mjs


import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FFMPEG = existsSync('/opt/homebrew/bin/ffmpeg')
  ? '/opt/homebrew/bin/ffmpeg'
  : 'ffmpeg';
const FFPROBE = existsSync('/opt/homebrew/bin/ffprobe')
  ? '/opt/homebrew/bin/ffprobe'
  : 'ffprobe';
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 60;
const TOTAL_FRAMES = 1496;
const DURATION = TOTAL_FRAMES / FPS;
const OUT_DIR = join(ROOT, 'shots/promo-40s/selected-v13');
const WORK = join(OUT_DIR, 'work');
const MUSIC_DIR = join(OUT_DIR, 'music');
const UI_DIR = join(ROOT, 'shots/promo-35s/ui-video');
const CINEMATIC_DIR = join(ROOT, 'shots/studio-modern-all-maps-v4-60fps');
const MAP_DIR = join(ROOT, 'shots/promo-map-rail-60fps');
const KF51_FRONTLINE = requireFile(join(ROOT, 'shots/promo-frontline-60fps/02_kf51b_autumn.webm'));
const LOGO = join(ROOT, 'public/brand/og-logo-transparent.png');
const LOOP_DIR = '/Library/Audio/Apple Loops/Apple/01 Hip Hop';
const SCORE = join(MUSIC_DIR, 'armor-ballistics-action-bed.wav');

mkdirSync(WORK, { recursive: true });
mkdirSync(MUSIC_DIR, { recursive: true });

function run(command, commandArgs, label) {
  console.log(`[balanced-v2] ${label}`);
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`${label} failed${detail ? `\n${detail}` : ''}`);
  }
  return (result.stdout || '').trim();
}

function ffmpeg(args, label) {
  run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], label);
}

function requireFile(path, label = path) {
  if (!existsSync(path)) throw new Error(`missing ${label}: ${path}`);
  return path;
}

for (const [path, label] of [[LOGO, 'brand logo']]) {
  requireFile(path, label);
}

const scoreStems = [
  ['Epoch Beat.caf', 'volume=0.40,highpass=f=38'],
  ['Epoch Orchestra Hits.caf', 'volume=0.52,highpass=f=75'],
  ['Epoch Sub Bass.caf', 'volume=0.34,lowpass=f=210'],
  ['Epoch Synth Arp.caf', 'volume=0.23,highpass=f=150'],
  ['Epoch Synth Lead.caf', 'volume=0.17,highpass=f=180'],
].map(([name, filter]) => ({
  path: requireFile(join(LOOP_DIR, name), name),
  filter,
}));

function renderActionScore() {
  const inputs = scoreStems.flatMap(({ path }) => ['-stream_loop', '-1', '-i', path]);
  const filters = scoreStems.map(({ filter }, index) =>
    `[${index}:a]atrim=duration=${DURATION},asetpts=PTS-STARTPTS,` +
      `aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,${filter}[s${index}]`,
  );
  filters.push(
    `${scoreStems.map((_, index) => `[s${index}]`).join('')}` +
      `amix=inputs=${scoreStems.length}:duration=longest:normalize=0,` +
      `afade=t=in:st=0:d=0.35,afade=t=out:st=${DURATION - 0.85}:d=0.85,` +
      'alimiter=limit=.92:level=false[outa]',
  );
  ffmpeg([
    ...inputs, '-filter_complex', filters.join(';'), '-map', '[outa]',
    '-t', String(DURATION), '-c:a', 'pcm_s24le', '-ar', '48000', SCORE,
  ], 'render continuous Armor/Ballistics score');
}

const ui = {
  garage: requireFile(join(UI_DIR, 'garage.webm')),
  garageSurface: requireFile(join(UI_DIR, 'garage-overlay.png')),
  live: requireFile(join(UI_DIR, 'battle-live.webm')),
  liveReticle: requireFile(join(UI_DIR, 'battle-live-reticle.webm')),
  liveHud: requireFile(join(UI_DIR, 'battle-live-hud.png')),
  studio: requireFile(join(UI_DIR, 'studio.webm')),
  studioSurface: requireFile(join(UI_DIR, 'studio-overlay.png')),
  gallery: requireFile(join(UI_DIR, 'gallery.webm')),
};

const cinematicNames = [
  '01_m1a2_sepv3_vs_t90m_verdant.webm',
  '02_strv122_vs_k2_desert.webm',
  '03_challenger_3_vs_leo2a7v_winter.webm',
  '04_type10b_vs_ztz99a2_urban.webm',
  '05_leclerc_xlr_vs_t14_coastal.webm',
  '06_kf51b_vs_abramsx_autumn.webm',
  '07_m1a2_tusk_vs_t90sm_steppe.webm',
  '08_ua_t84_oplot_m_vs_pt91_twardy_railyard.webm',
  '09_pl01_105_vs_k2b_frontier.webm',
  '10_merkava4b_vs_ariete_c2_fjord.webm',
  '11_m1a2_sepv2_vs_type99a_delta.webm',
  '12_leo2_revolution_vs_t72b3m_badlands.webm',
  '13_challenger2_vs_leclerc_monsoon.webm',
  '14_type10_vs_k1a1_alpine.webm',
  '15_m1a1ha_vs_t80u_caldera.webm',
  '16_ua_m1a1_vs_ua_t64bv_foundry.webm',
  '17_leo2a6m_vs_t90ms_desert.webm',
  '18_merkava3d_vs_amx40_winter.webm',
  '19_type90a_vs_pt91m_verdant.webm',
  '20_m1a2_vs_ua_t80u_kursk_coastal.webm',
];
const cinematic = cinematicNames.map((name) =>
  requireFile(join(CINEMATIC_DIR, name), name));
const maps = [
  '01_verdant.webm', '02_desert.webm', '03_winter.webm', '04_urban.webm',
  '05_autumn.webm', '06_steppe.webm', '07_railyard.webm', '08_fjord.webm',
  '09_delta.webm', '10_coastal.webm',
].map((name) => requireFile(join(MAP_DIR, name), name));

const overlayDefinitions = {
  opening: { hero: true },
  maps: { title: '16 BATTLEFIELDS' },
  combat: { title: 'ARMOR  •  BALLISTICS  •  MODULE DAMAGE' },
  hud: { title: 'FULL BATTLE HUD' },
  movement: { title: 'TRACKED MOVEMENT  •  STABILIZED FIRE' },
  studio: { title: 'SCENE STUDIO' },
  library: { title: 'MASSIVE MODERN TANK LIBRARY' },
  gallery: { title: 'LIVE TANK GALLERY' },
  finale: { title: 'EVERY MAP.  EVERY ANGLE.' },
  outro: { hero: true },
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function renderOverlays() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    const logoUri = `data:image/png;base64,${readFileSync(LOGO).toString('base64')}`;
    const [shieldUri, wordmarkUri] = await page.evaluate(async (source) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const crop = ({ x, y, width, height }) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(
          image, x, y, width, height, 0, 0, width, height,
        );
        return canvas.toDataURL('image/png');
      };
      return [
        crop({ x: 24, y: 88, width: 456, height: 456 }),
        crop({ x: 520, y: 178, width: 648, height: 272 }),
      ];
    }, logoUri);

    for (const [id, definition] of Object.entries(overlayDefinitions)) {
      const html = `<!doctype html><html><head><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}
body{font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;color:#f4f4f1}
.shade{position:absolute;inset:auto 0 0;height:38%;background:linear-gradient(0deg,rgba(4,7,10,.86),rgba(4,7,10,.48) 48%,transparent)}
.label{position:absolute;left:72px;bottom:62px;display:flex;align-items:center;gap:27px;filter:drop-shadow(0 5px 14px rgba(0,0,0,.88))}
.badge{width:112px;height:112px;flex:none}.badge img{display:block;width:100%;height:100%;object-fit:contain}
.title{font-size:55px;font-weight:850;letter-spacing:.045em;line-height:1;text-transform:uppercase;white-space:nowrap}
.hero-shade{position:absolute;inset:0;background:radial-gradient(circle at 50% 44%,rgba(5,8,12,.04),rgba(5,8,12,.76) 78%)}
.hero{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:54px;filter:drop-shadow(0 8px 20px rgba(0,0,0,.88))}
.hero-shield{width:302px;height:302px;flex:none}.hero-shield img{display:block;width:100%;height:100%;object-fit:contain}
.hero-wordmark{width:700px;flex:none}.hero-wordmark img{display:block;width:100%;height:auto}
</style></head><body>${definition.empty
    ? ''
    : definition.hero
      ? `<div class="hero-shade"></div><div class="hero"><div class="hero-shield"><img src="${shieldUri}" alt=""></div><div class="hero-wordmark"><img src="${wordmarkUri}" alt=""></div></div>`
      : `<div class="shade"></div><div class="label"><div class="badge"><img src="${shieldUri}" alt=""></div><div class="title">${escapeHtml(definition.title)}</div></div>`}
</body></html>`;
      await page.setContent(html, { waitUntil: 'load' });
      await page.screenshot({
        path: join(WORK, `overlay-${id}.png`),
        omitBackground: true,
      });
    }
  } finally {
    await browser.close();
  }
}

const smooth60 = [
  // Browser WebM timestamps are bursty even when the captured frame sequence
  // is healthy. Reclock the decoded frames first, then blend only the cadence
  // gap up to 60; this removes timestamp judder without optical-flow warping.
  'setpts=PTS-STARTPTS',
  `framerate=fps=${FPS}:interp_start=15:interp_end=240:scene=12`,
].join(',');
const grade = [
  `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase:flags=lanczos`,
  `crop=${WIDTH}:${HEIGHT}`,
  'setsar=1',
  'eq=contrast=1.055:saturation=1.08:brightness=-0.008',
  'vignette=PI/6',
  'format=yuv420p',
].join(',');

function encodeLayeredUi({ id, source, surface, start, duration, darken = false }) {
  const output = join(WORK, `${id}.mp4`);
  const visualGrade = darken
    ? `${grade},eq=contrast=1.03:saturation=0.95:brightness=-0.08`
    : grade;
  ffmpeg([
    '-i', source,
    '-loop', '1', '-framerate', String(FPS), '-t', String(duration), '-i', surface,
    '-filter_complex',
    `[0:v]trim=start=${start}:duration=${duration + 0.35},${smooth60},` +
      `tpad=stop_mode=clone:stop_duration=0.1,trim=duration=${duration},${visualGrade}[scene];` +
      `[1:v]scale=${WIDTH}:${HEIGHT}:flags=lanczos,format=rgba[surface];` +
      '[scene][surface]overlay=0:0:format=auto,format=yuv420p[v]',
    '-map', '[v]', '-an', '-t', String(duration),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', output,
  ], `encode ${id}`);
  return { id, path: output, duration };
}

function encodeSingle({ id, source, start, duration }) {
  const output = join(WORK, `${id}.mp4`);
  ffmpeg([
    '-i', source,
    '-filter_complex',
    `[0:v]trim=start=${start}:duration=${duration + 0.12},${smooth60},` +
      `tpad=stop_mode=clone:stop_duration=0.1,trim=duration=${duration},${grade}[v]`,
    '-map', '[v]', '-an', '-t', String(duration),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', output,
  ], `encode ${id}`);
  return { id, path: output, duration };
}

function encodeBattleHud({ id, start, duration }) {
  const output = join(WORK, `${id}.mp4`);
  ffmpeg([
    '-i', ui.live, '-c:v', 'libvpx-vp9', '-i', ui.liveReticle,
    '-loop', '1', '-framerate', String(FPS), '-t', String(duration), '-i', ui.liveHud,
    '-filter_complex',
    `[0:v]trim=start=${start}:duration=${duration + 0.35},${smooth60},` +
      `tpad=stop_mode=clone:stop_duration=0.1,trim=duration=${duration},${grade}[game];` +
      `[1:v]trim=start=${start}:duration=${duration + 0.35},${smooth60},` +
      `tpad=stop_mode=clone:stop_duration=0.1,trim=duration=${duration},` +
      `scale=${WIDTH}:${HEIGHT}:flags=lanczos,format=rgba,` +
      'colorkey=0x000000:similarity=0.16:blend=0.10[reticle];' +
      `[2:v]scale=${WIDTH}:${HEIGHT}:flags=lanczos,format=rgba[hud];` +
      '[game][reticle]overlay=0:0:format=auto[withReticle];' +
      '[withReticle][hud]overlay=0:0:format=auto,format=yuv420p[v]',
    '-map', '[v]', '-an', '-t', String(duration),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', output,
  ], `encode ${id}`);
  return { id, path: output, duration };
}

function encodeMapRail() {
  const id = '01-maps';
  const output = join(WORK, `${id}.mp4`);
  const duration = 2.4;
  // 144 output frames cannot be divided evenly across ten maps. Give four
  // rails 15 frames and six rails 14 frames so the tour lands on exactly
  // 2.400 seconds without a duplicated tail.
  const segmentDurations = maps.map((_, index) => (index < 4 ? 15 : 14) / FPS);
  const inputs = maps.flatMap((path) => ['-i', path]);
  const filters = maps.map((_, index) => {
    const segmentDuration = segmentDurations[index];
    return `[${index}:v]trim=start=0.08:duration=0.82,` +
      `setpts=(PTS-STARTPTS)*${(segmentDuration / 0.82).toFixed(6)},` +
      `fps=${FPS},tpad=stop_mode=clone:stop_duration=0.12,` +
      `trim=duration=${segmentDuration},${grade}[m${index}]`;
  });
  filters.push(
    `${maps.map((_, index) => `[m${index}]`).join('')}` +
      `concat=n=${maps.length}:v=1:a=0,trim=duration=${duration},format=yuv420p[v]`,
  );
  ffmpeg([
    ...inputs, '-filter_complex', filters.join(';'), '-map', '[v]', '-an', '-t', String(duration),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', output,
  ], 'encode smooth map rail');
  return { id, path: output, duration };
}

const usedSourceWindows = new Map();

function encodeReel({ id, clips }) {
  for (const clip of clips) {
    const sourceKey = clip.sourceKey ?? clip.index;
    if (clip.safeRange) {
      const [safeStart, safeEnd] = clip.safeRange;
      const clipEnd = clip.start + clip.duration;
      if (clip.start < safeStart - 0.0001 || clipEnd > safeEnd + 0.0001) {
        throw new Error(`${id}: source ${sourceKey} window ` +
          `${clip.start}-${clipEnd} escapes cut-safe range ${safeStart}-${safeEnd}`);
      }
    }
    const interval = {
      id,
      start: clip.start,
      end: clip.start + clip.duration,
    };
    const priorIntervals = usedSourceWindows.get(sourceKey) || [];
    const overlap = priorIntervals.find((prior) =>
      interval.start < prior.end && interval.end > prior.start,
    );
    if (overlap) {
      throw new Error(`${id}: source ${sourceKey} interval ` +
        `${interval.start}-${interval.end} overlaps ${overlap.id} ` +
        `${overlap.start}-${overlap.end}`);
    }
    priorIntervals.push(interval);
    usedSourceWindows.set(sourceKey, priorIntervals);
  }
  const output = join(WORK, `${id}.mp4`);
  const inputs = clips.flatMap((clip) => ['-i', clip.source || cinematic[clip.index]]);
  const duration = clips.reduce((sum, clip) => sum + clip.duration, 0);
  const filters = clips.map((clip, index) =>
    `[${index}:v]trim=start=${clip.start}:duration=${clip.duration + 0.35},` +
      `${smooth60},tpad=stop_mode=clone:stop_duration=0.1,trim=duration=${clip.duration},` +
      `setpts=PTS-STARTPTS,${grade}[c${index}]`,
  );
  filters.push(
    `${clips.map((_, index) => `[c${index}]`).join('')}` +
      `concat=n=${clips.length}:v=1:a=0,trim=duration=${duration},format=yuv420p[v]`,
  );
  ffmpeg([
    ...inputs, '-filter_complex', filters.join(';'), '-map', '[v]', '-an', '-t', String(duration),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', output,
  ], `encode ${id}`);
  return { id, path: output, duration };
}

renderActionScore();
await renderOverlays();

const openingBadged = encodeLayeredUi({
  id: '00-opening-badged', source: ui.garage, surface: ui.garageSurface,
  start: 0.2, duration: 3.2, darken: true,
});
const openingBadgeless = encodeLayeredUi({
  id: '00-opening-badgeless', source: ui.garage, surface: ui.garageSurface,
  start: 0.2, duration: 3.2,
});

const chapters = [
  {
    ...openingBadged,
    id: '00-opening',
    cleanPath: openingBadgeless.path,
    overlay: 'opening',
  },
  { ...encodeMapRail(), overlay: 'maps' },
  {
    ...encodeReel({
      id: '02-combat',
      clips: [
        // Two new, centered impact shots replace the tree-obscured v5 opener.
        { index: 10, start: 9.7, duration: 0.7, angle: 'close armor impact', safeRange: [9.65, 13.5] },
        { index: 18, start: 9.3, duration: 0.7, angle: 'burning orbit', safeRange: [9.25, 13.5] },
        // Each retained legacy beat now stays wholly inside one source angle.
        { index: 5, start: 6.95, duration: 0.8, angle: 'return fire', safeRange: [6.9, 7.85] },
        { index: 11, start: 7.0, duration: 0.8, angle: 'turning pursuit', safeRange: [6.0, 7.85] },
        { index: 2, start: 9.25, duration: 0.85, angle: 'armor impact', safeRange: [9.2, 13.5] },
      ],
    }),
    overlay: 'combat',
  },
  {
    ...encodeReel({
      id: '03-movement',
      // Put the dedicated full-vehicle KF51 master immediately before Abrams
      // UA, then finish on the cut-safe left-weighted firing window.
      clips: [
        { index: 0, start: 1.25, duration: 0.9, angle: 'wide approach', safeRange: [0.2, 3.5] },
        { source: KF51_FRONTLINE, sourceKey: 'kf51-frontline', start: 0.05, duration: 0.6, angle: 'full KF51 firing reveal', safeRange: [0, 2.2] },
        { index: 15, start: 1.25, duration: 0.9, angle: 'counter-charge', safeRange: [0.2, 3.7] },
        { index: 5, start: 7.95, duration: 23 / FPS, angle: 'left-framed firing line', safeRange: [7.94, 8.34] },
      ],
    }),
    overlay: 'movement',
  },
  {
    ...encodeLayeredUi({
      id: '04-studio', source: ui.studio, surface: ui.studioSurface,
      // The source changes angles at 9.448s. Enter after that edit so this
      // chapter contains only the Leclerc explosion shot, not its setup pose.
      start: 9.45, duration: 2.25,
    }),
    overlay: 'studio',
  },
  {
    ...encodeSingle({ id: '05-gallery', source: ui.gallery, start: 0.25, duration: 3.4 }),
    overlay: 'library',
  },
  {
    ...encodeReel({
      id: '06-leclerc',
      // Open the Every Map / Every Angle sequence on the requested Leclerc XLR
      // driving beat before continuing into the explosion montage.
      clips: [
        { index: 4, start: 1.25, duration: 0.75, angle: 'low hero reveal', safeRange: [0.2, 3.5] },
      ],
    }),
    overlay: 'finale',
  },
  {
    ...encodeReel({
      id: '07-finale',
      // Restore the full montage, but shift every shot beyond its source's
      // internal edit boundary. Source 1 replaces the weak, obscured shot.
      clips: [
        { index: 0, start: 9.3, duration: 0.6, angle: 'explosion montage', safeRange: [9.25, 13.5] },
        { index: 3, start: 9.3, duration: 0.6, angle: 'explosion montage', safeRange: [9.25, 13.5] },
        { index: 4, start: 9.35, duration: 0.6, angle: 'explosion montage', safeRange: [9.3, 13.5] },
        { index: 6, start: 9.3, duration: 0.6, angle: 'explosion montage', safeRange: [9.25, 13.5] },
        { index: 12, start: 9.35, duration: 0.6, angle: 'explosion montage', safeRange: [9.3, 13.2] },
        { index: 1, start: 9.3, duration: 0.6, angle: 'explosion montage', safeRange: [9.25, 13.5] },
        { index: 16, start: 9.35, duration: 0.6, angle: 'explosion montage', safeRange: [9.3, 13.5] },
        { index: 19, start: 9.35, duration: 0.6, angle: 'explosion montage', safeRange: [9.3, 13.5] },
      ],
    }),
    overlay: 'finale',
  },
  {
    ...encodeReel({
      id: '08-outro',
      // Restore the original cut-safe explosion outro; the malformed clips the
      // user identified were in the movement reel, not this logo chapter.
      clips: [
        { index: 7, start: 9.35, duration: 0.75, angle: 'final explosion', safeRange: [9.3, 13.4] },
        { index: 17, start: 9.35, duration: 0.75, angle: 'final explosion', safeRange: [9.3, 13.5] },
      ],
    }),
    overlay: 'outro',
  },
];

const chapterDuration = chapters.reduce((sum, chapter) => sum + chapter.duration, 0);
if (Math.abs(chapterDuration - DURATION) > 0.001) {
  throw new Error(`chapter duration ${chapterDuration}, expected ${DURATION}`);
}

function assemble({ id, withText }) {
  const output = join(OUT_DIR, `${id}.mp4`);
  const videoInputs = chapters.flatMap((chapter) => [
    '-i', withText ? chapter.path : (chapter.cleanPath || chapter.path),
  ]);
  const overlayInputs = withText
    ? chapters.flatMap((chapter) => [
      '-loop', '1', '-framerate', String(FPS), '-t', String(chapter.duration),
      '-i', join(WORK, `overlay-${chapter.overlay}.png`),
    ])
    : [];
  const audioIndex = chapters.length + (withText ? chapters.length : 0);
  const filters = [];
  for (let index = 0; index < chapters.length; index += 1) {
    filters.push(
      `[${index}:v]trim=duration=${chapters[index].duration},` +
        `setpts=PTS-STARTPTS,fps=${FPS},format=yuv420p[base${index}]`,
    );
    if (withText) {
      filters.push(
        `[${chapters.length + index}:v]format=rgba[ov${index}]`,
        `[base${index}][ov${index}]overlay=0:0:format=auto,format=yuv420p[v${index}]`,
      );
    } else {
      filters.push(`[base${index}]null[v${index}]`);
    }
  }
  filters.push(
    `${chapters.map((_, index) => `[v${index}]`).join('')}` +
      `concat=n=${chapters.length}:v=1:a=0,trim=duration=${DURATION},` +
      'setpts=PTS-STARTPTS,format=yuv420p[outv]',
    `[${audioIndex}:a]atrim=duration=${DURATION},asetpts=PTS-STARTPTS,` +
      'aformat=channel_layouts=stereo,loudnorm=I=-10:LRA=7:TP=-0.5,' +
      'alimiter=limit=.97:level=false[outa]',
  );
  ffmpeg([
    ...videoInputs, ...overlayInputs, '-i', SCORE,
    '-filter_complex', filters.join(';'), '-map', '[outv]', '-map', '[outa]',
    '-t', String(DURATION),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high',
    '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-disposition:a:0', 'default',
    '-movflags', '+faststart', output,
  ], `assemble ${id}`);
  return output;
}

const outputs = {
  badged: assemble({ id: 'claude-of-tanks-selected-scenes-badged', withText: true }),
  badgeless: assemble({ id: 'claude-of-tanks-selected-scenes-badgeless', withText: false }),
};

for (const [id, path] of Object.entries(outputs)) {
  const probe = JSON.parse(run(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,avg_frame_rate,nb_frames',
    '-show_entries', 'format=duration', '-of', 'json', path,
  ], `probe ${id}`));
  const stream = probe.streams?.[0] || {};
  const duration = Number(probe.format?.duration);
  if (Math.abs(duration - DURATION) > 0.06 || stream.width !== WIDTH ||
      stream.height !== HEIGHT || stream.r_frame_rate !== '60/1' ||
      stream.avg_frame_rate !== '60/1' ||
      Number(stream.nb_frames) !== TOTAL_FRAMES) {
    throw new Error(`${id}: invalid master properties ${JSON.stringify(probe)}`);
  }
}

const preview = join(OUT_DIR, 'comparison.jpg');
ffmpeg([
  '-ss', '1.6', '-i', outputs.badged,
  '-ss', '1.6', '-i', outputs.badgeless,
  '-filter_complex',
  '[0:v]scale=960:540[a];[1:v]scale=960:540[b];[a][b]hstack=inputs=2[v]',
  '-map', '[v]', '-frames:v', '1', '-q:v', '2', preview,
], 'render text/no-text comparison');

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  durationSeconds: DURATION,
  width: WIDTH,
  height: HEIGHT,
  fps: FPS,
  outputs: Object.fromEntries(Object.entries(outputs).map(([id, path]) => [
    id, path.replace(`${ROOT}/`, ''),
  ])),
  preview: preview.replace(`${ROOT}/`, ''),
  typographyPolicy: 'badge left of section title; no subtitle, eyebrow, URL, or small-print line',
  cleanVersionPolicy: 'identical selected scenes and score; promotional graphics and the garage darkening treatment are removed',
  selectionPolicy: 'requested lineup retained; the weak green movement shot is replaced by a left-framed firing beat; branded explosion outro retained',
  cutSafetyPolicy: 'every cinematic window declares and is validated against a single-angle safe range so no clip crosses an internal source edit',
  movementSwapPolicy: 'the Twardy beat before Abrams UA is replaced with the dedicated full-vehicle KF51 firing master; the cut-safe left-framed firing beat remains afterward',
  studioTrimPolicy: 'Scene Studio begins at source 9.45s, immediately after its 9.448s internal edit, and retains only the Leclerc explosion shot',
  libraryLabelPolicy: 'MASSIVE MODERN TANK LIBRARY runs across Vehicle Gallery; the following Leclerc shot opens EVERY MAP. EVERY ANGLE. and carries that label into the montage',
  audioPolicy: 'continuous Armor/Ballistics score mastered to -10 LUFS with the AAC stream marked default',
  sourceRepeatPolicy: 'cinematic source windows cannot overlap across reels',
  scorePolicy: 'one continuous Armor/Ballistics action-score family; no separate sound effects',
  cadencePolicy: 'source-speed shots converted to CFR-60 with non-optical temporal frame blending',
  anglePolicy: 'tank reels mix wide reveals, front/rear three-quarters, side profiles, firing lines, tracked turns, impacts, and pullbacks',
  cameraShakePolicy: 'shake appears only in source windows containing visible blast or impact events',
  documentationIncluded: false,
  chapters: chapters.map(({ id, duration, overlay }) => ({ id, duration, overlay })),
};
writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[balanced-v2] complete: ${OUT_DIR}`);
