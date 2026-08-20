// Publish the canonical, owner-approved Claude of Tanks showcase library.
//
// The 4K campaign masters remain under shots/ (gitignored). This command
// verifies their quality receipt, creates checked-in web renditions, preserves
// the hand-picked presentation frames, and publishes one searchable manifest.
//
// Usage:
//   npm run showcase:publish
//   npm run showcase:publish -- \
//     --campaign-root /path/to/shots/marketing-battles-r3 \
//     --studio-root /path/to/shots/studio-action-loop-winter-r1

import { spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2);

function opt(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const CAMPAIGN = resolve(opt('campaign-root', join(ROOT, 'shots/marketing-battles-r3')));
const STUDIO = resolve(opt('studio-root', join(ROOT, 'shots/studio-action-loop-winter-r1')));
const SHOWCASE_OUT = resolve(ROOT, 'public/media/showcase-r1');
const PRESENTATION_OUT = resolve(ROOT, 'public/media/presentation-r1');
const OWNER_PICKS = JSON.parse(readFileSync(join(HERE, 'showcase-owner-picks-r1.json'), 'utf8'));
const MAP_NAMES = Object.freeze({
  desert: 'Sirocco Wadi',
  winter: 'Frosthollow',
  urban: 'Steinburg',
  verdant: 'Verdant Fields',
  coastal: 'Breakwater Coast',
  steppe: 'Tarkhan Steppe',
});

mkdirSync(SHOWCASE_OUT, { recursive: true });
mkdirSync(PRESENTATION_OUT, { recursive: true });

function readJson(file) {
  if (!existsSync(file)) throw new Error(`Missing required file: ${file}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

function run(command, commandArgs, label) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${label} failed`);
}

function encodeWebp(input, output, quality = 80) {
  if (!existsSync(input)) throw new Error(`Missing source image: ${input}`);
  run('cwebp', [
    '-quiet', '-mt', '-m', '6', '-q', String(quality), '-sharp_yuv',
    '-resize', '1920', '1080', input, '-o', output,
  ], `cwebp ${basename(input)}`);
}

function numericPrefix(file) {
  return Number(/^\d+/.exec(file)?.[0] || Number.MAX_SAFE_INTEGER);
}

function sceneFiles(directory) {
  return readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .sort((a, b) => numericPrefix(a) - numericPrefix(b) || a.localeCompare(b));
}

function titleFromId(id) {
  return id
    .replace(/^\d+_(?:action|foreground)_/, '')
    .split('_')
    .map((word) => word === 't90m' ? 'T-90M' : word === 'abramsx' ? 'AbramsX' : `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function inferFeature(effects) {
  const types = new Set(effects.map((effect) => effect.type));
  if (types.has('tank_kill') || types.has('explosion')) return 'Destruction';
  if (types.has('detrack')) return 'Track physics';
  if (types.has('impact') || types.has('sparks')) return 'Armor impacts';
  if (types.has('fire') || types.has('firing_moment') || types.has('mg_burst')) return 'Gunnery';
  return 'Battlefield atmosphere';
}

function campaignShots(qualityReport) {
  const qualityByFile = new Map(qualityReport.rows.map((row) => [row.file, row]));
  const categories = [
    ['action', join(HERE, 'scenes-action-r3'), join(CAMPAIGN, 'action-4k')],
    ['foreground', join(HERE, 'scenes-foreground-r3'), join(CAMPAIGN, 'foreground-4k')],
  ];
  const shots = [];

  for (const [kind, sceneDirectory, masterDirectory] of categories) {
    const files = sceneFiles(sceneDirectory);
    if (files.length !== 30) throw new Error(`Expected 30 ${kind} scenes, found ${files.length}`);
    for (const file of files) {
      const id = file.replace(/\.json$/, '');
      const sourceName = `${id}.png`;
      const quality = qualityByFile.get(sourceName);
      if (!quality?.passed) throw new Error(`Missing passing quality receipt for ${sourceName}`);
      const scene = readJson(join(sceneDirectory, file));
      const source = join(masterDirectory, sourceName);
      const output = join(SHOWCASE_OUT, `${id}.webp`);
      encodeWebp(source, output);
      const title = titleFromId(id);
      const map = MAP_NAMES[scene.map] || scene.map;
      const effects = [...new Set(scene.effects.map((effect) => effect.type))];
      shots.push({
        id,
        src: `/media/showcase-r1/${id}.webp`,
        title,
        map,
        feature: inferFeature(scene.effects),
        kind,
        collection: 'marketing-battles-r3',
        shotStyle: scene.meta?.category || kind,
        alt: `${title} on ${map}, captured from the live Claude of Tanks renderer`,
        actors: scene.actors.map((actor) => actor.id),
        effects,
        seed: scene.seed,
        sourceScene: `tools/marketing-shots/scenes-${kind}-r3/${file}`,
        sourceMaster: `${kind}-4k/${sourceName}`,
        quality: {
          automated: true,
          ownerApproved: true,
          passed: true,
          dimensions: quality.dimensions,
          metrics: quality.metrics,
        },
      });
    }
  }
  return shots;
}

function ownerPickShots() {
  return OWNER_PICKS.map((id) => {
    const scene = readJson(join(HERE, 'scenes-presentation-r1', `${id}.json`));
    const output = join(PRESENTATION_OUT, `${id}.webp`);
    if (!existsSync(output)) throw new Error(`Missing owner-approved presentation frame: ${output}`);
    const meta = scene.meta || {};
    const title = meta.title || titleFromId(id);
    const map = meta.map || MAP_NAMES[scene.map] || scene.map;
    return {
      id,
      src: `/media/presentation-r1/${id}.webp`,
      title,
      map,
      feature: meta.feature || inferFeature(scene.effects),
      kind: 'owner pick',
      collection: 'owner-picks-r1',
      alt: `${title} on ${map}, captured from the live Claude of Tanks renderer`,
      actors: scene.actors.map((actor) => actor.id),
      effects: [...new Set(scene.effects.map((effect) => effect.type))],
      seed: scene.seed,
      sourceScene: `tools/marketing-shots/scenes-presentation-r1/${id}.json`,
      quality: { ownerApproved: true },
    };
  });
}

function studioShots(offset) {
  const keyframes = readdirSync(STUDIO)
    .filter((file) => /^studio_winter_breakthrough_\d+_\d+ms\.png$/.test(file))
    .sort();
  if (keyframes.length !== 5) throw new Error(`Expected 5 Studio keyframes, found ${keyframes.length}`);
  const studioScene = readJson(join(STUDIO, 'studio_winter_breakthrough.resolved.json'));
  const titles = ['Armored contact', 'First impact', 'Return fire', 'Knockout', 'Burning advance'];
  const shots = keyframes.map((file, index) => {
    const timeMs = Number(/_(\d+)ms\.png$/.exec(file)?.[1] || 0);
    const id = `studio_action_${String(index + 1).padStart(2, '0')}_${timeMs}ms`;
    encodeWebp(join(STUDIO, file), join(PRESENTATION_OUT, `${id}.webp`), 82);
    return {
      id,
      sequence: offset + index + 1,
      src: `/media/presentation-r1/${id}.webp`,
      title: titles[index],
      map: 'Frosthollow',
      feature: 'Studio direction',
      kind: 'studio',
      collection: 'studio-action-loop-winter-r1',
      alt: `${titles[index]} in the animated Scene Studio battle sequence`,
      actors: studioScene.actors.map((actor) => actor.id),
      effects: [...new Set(studioScene.effects.filter((effect) => effect.tMs <= timeMs).map((effect) => effect.type))],
      seed: studioScene.seed,
      timeMs,
      sourceScene: 'shots/studio-action-loop-winter-r1/studio_winter_breakthrough.resolved.json',
      quality: { automated: true, ownerApproved: true },
    };
  });

  const master = join(STUDIO, 'studio_winter_breakthrough.webm');
  const gif = join(PRESENTATION_OUT, 'studio_action_loop.gif');
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', master,
    '-filter_complex',
    'fps=10,scale=720:-1:flags=lanczos,split[s0][s1];' +
      '[s0]palettegen=max_colors=128:stats_mode=diff[p];' +
      '[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
    '-loop', '0', gif,
  ], 'Studio GIF encode');
  encodeWebp(join(STUDIO, keyframes.at(-1)), join(PRESENTATION_OUT, 'studio_action_poster.webp'), 84);
  return { shots, studioScene, gif };
}

function interfaceShots() {
  const metadata = Object.freeze({
    battlefield_foundry: ['Ironworks overview', 'World system'],
    combat_firing: ['Live firing cycle', 'Gunnery'],
    explosion: ['Destruction event', 'Destruction'],
    gallery: ['Tank Gallery live dossier', 'Tank design'],
    garage: ['Garage command deck', 'Interface'],
    killcam_xray: ['Resolved-shot X-ray', 'Killcam'],
    mobile: ['Responsive mobile command deck', 'Interface'],
    player_view: ['Production battle HUD', 'Interface'],
    sniper_view: ['Precision sight', 'Gunnery'],
    tank_closeup_modern: ['First-party vehicle rig', 'Tank design'],
  });
  return Object.entries(metadata).map(([id, [title, feature]]) => {
    const file = join(PRESENTATION_OUT, `ui_${id}.webp`);
    if (!existsSync(file)) throw new Error(`Missing interface capture: ${file}`);
    return {
      id: `ui_${id}`,
      src: `/media/presentation-r1/ui_${id}.webp`,
      title,
      map: 'Live game',
      feature,
      kind: 'interface',
      collection: 'live-interface-r1',
      alt: `${title} captured from the live Claude of Tanks game`,
      actors: [],
      effects: [],
      quality: { ownerApproved: true },
    };
  });
}

const qualityReport = readJson(join(CAMPAIGN, 'quality-report.json'));
if (qualityReport.totals?.images !== 60 || qualityReport.totals?.passed !== 60 || qualityReport.totals?.failed !== 0) {
  throw new Error(`Campaign quality gate must be 60/60 passing; received ${JSON.stringify(qualityReport.totals)}`);
}

const ownerPicks = ownerPickShots();
const campaign = campaignShots(qualityReport);
const studio = studioShots(ownerPicks.length + campaign.length);
const interfaces = interfaceShots();
const shots = [...ownerPicks, ...campaign, ...studio.shots, ...interfaces]
  .map((shot, index) => ({ ...shot, sequence: index + 1 }));

const animatedPreview = {
  src: '/media/presentation-r1/studio_action_loop.gif',
  poster: '/media/presentation-r1/studio_action_poster.webp',
  durationMs: studio.studioScene.storyboard.durationMs,
  bytes: statSync(studio.gif).size,
};
const manifest = {
  libraryId: 'claude-of-tanks-showcase-r1',
  schemaVersion: 1,
  generatedAt: '2026-08-19',
  renderer: 'Claude of Tanks Scene Studio and deterministic game harness',
  firstPartyRuntimeOnly: true,
  review: 'Owner-approved feature shortlist plus every quality-gated action and foreground campaign frame',
  sourceDimensions: { width: 3840, height: 2160 },
  renditionDimensions: { width: 1920, height: 1080 },
  counts: {
    ownerPicks: ownerPicks.length,
    action: campaign.filter((shot) => shot.kind === 'action').length,
    foreground: campaign.filter((shot) => shot.kind === 'foreground').length,
    studio: studio.shots.length,
    interface: interfaces.length,
    total: shots.length,
  },
  qualityGate: {
    report: 'shots/marketing-battles-r3/quality-report.json',
    required: { images: 60, passed: 60, failed: 0 },
    thresholds: qualityReport.thresholds,
  },
  animatedPreview,
  shots,
};
writeFileSync(join(SHOWCASE_OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const presentationShots = [...ownerPicks, ...studio.shots, ...interfaces]
  .map((shot, index) => ({ ...shot, sequence: index + 1 }));
const presentationManifest = {
  schemaVersion: 2,
  generatedAt: '2026-08-19',
  renderer: manifest.renderer,
  firstPartyRuntimeOnly: true,
  review: 'Compatibility subset of the authoritative showcase-r1 library',
  battleShotCount: ownerPicks.length,
  studioShotCount: studio.shots.length,
  interfaceShotCount: interfaces.length,
  totalShotCount: presentationShots.length,
  authoritativeManifest: '/media/showcase-r1/manifest.json',
  animatedPreview,
  shots: presentationShots,
};
writeFileSync(join(PRESENTATION_OUT, 'manifest.json'), `${JSON.stringify(presentationManifest, null, 2)}\n`);

console.log(`Published ${shots.length} showcase frames: ${ownerPicks.length} owner picks, ` +
  `${campaign.length} campaign frames, ${studio.shots.length} Studio frames, and ${interfaces.length} interface frames.`);
