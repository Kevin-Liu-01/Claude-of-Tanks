// Publish the 40 approved R2 masters as efficient web renditions plus four
// contact sheets and one page-coverage manifest.

import { spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const rawDir = resolve(option('raw', join(ROOT, 'shots/showcase-r2/raw')));
const reportFile = resolve(option('report', join(ROOT, 'shots/showcase-r2/quality-report.json')));
const outDir = resolve(ROOT, 'public/media/showcase-r2');
const processDir = join(outDir, 'process');
const reviewRawDir = resolve(ROOT, 'shots/showcase-r2/review-sheets');
const config = JSON.parse(readFileSync(join(HERE, 'showcase-r2.json'), 'utf8'));
const report = JSON.parse(readFileSync(reportFile, 'utf8'));

if (report.totals?.images !== config.expectedCount
    || report.totals?.passed !== config.expectedCount
    || report.totals?.failed !== 0) {
  throw new Error(`R2 quality gate must be ${config.expectedCount}/${config.expectedCount}: ${JSON.stringify(report.totals)}`);
}

mkdirSync(outDir, { recursive: true });
mkdirSync(processDir, { recursive: true });
mkdirSync(reviewRawDir, { recursive: true });
for (const directory of [outDir, processDir, reviewRawDir]) {
  for (const file of readdirSync(directory).filter((name) => /\.(?:png|webp)$/i.test(name))) {
    rmSync(join(directory, file));
  }
}

const run = (command, commandArgs, label) => {
  const result = spawnSync(command, commandArgs, { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${label} failed`);
};
const encodeWebp = (input, output, width, height, quality = 84) => {
  if (!existsSync(input)) throw new Error(`Missing source image: ${input}`);
  run('cwebp', [
    '-quiet', '-mt', '-m', '6', '-q', String(quality), '-sharp_yuv',
    '-resize', String(width), String(height), input, '-o', output,
  ], `cwebp ${basename(input)}`);
};

const qualityById = new Map(report.rows.map((row) => [row.id, row]));
const pagesByShot = new Map();
for (const [page, ids] of Object.entries(config.pageAssignments)) {
  for (const id of ids) {
    if (!pagesByShot.has(id)) pagesByShot.set(id, []);
    pagesByShot.get(id).push(page);
  }
}

const featureFor = (shot) => {
  if (shot.sourceType === 'garage') return 'Garage environments';
  if (shot.sourceType === 'gallery') return 'Tank Gallery';
  if (shot.sourceType === 'studio') return 'Scene Studio';
  if (shot.sourceType === 'mobile') return 'Responsive interface';
  if (shot.kind === 'vehicle') return 'Tank design';
  if (shot.kind === 'battle') return 'Battlefield atmosphere';
  if (shot.id === '17_live_player_hud') return 'Interface';
  if (shot.id === '18_live_spectator') return 'Multiplayer';
  if (shot.id === '19_live_sniper' || shot.id === '20_live_gunnery') return 'Gunnery';
  if (shot.id === '21_live_destruction') return 'Destruction';
  if (shot.id === '22_live_detrack') return 'Track physics';
  if (shot.id.startsWith('23_live_killcam') || shot.id.startsWith('24_live_killcam')
      || shot.id.startsWith('25_live_killcam')) return 'Killcam';
  return 'Interface';
};

const mapFor = (shot) => {
  const labels = {
    '01_garage_verdant': 'Verdant Fields',
    '02_garage_sirocco': 'Sirocco Wadi',
    '03_garage_frosthollow': 'Frosthollow',
    '04_garage_steinburg': 'Steinburg',
    '05_garage_saltmere': 'Saltmere Bay',
    '06_garage_cinder': 'Cinder Junction',
    '07_garage_monsoon': 'Monsoon Expanse',
    '08_garage_glacier': 'Glacier Pass',
    '09_garage_redrock': 'Redrock Basin',
    '10_garage_ironworks': 'Ironworks',
    '29_battle_sirocco': 'Sirocco Wadi',
    '30_battle_frosthollow': 'Frosthollow',
    '31_battle_steinburg': 'Steinburg',
    '32_battle_verdant': 'Verdant Fields',
    '33_battle_saltmere': 'Saltmere Bay',
    '34_battle_amberford': 'Amberford',
    '35_battle_tarkhan': 'Tarkhan Steppe',
    '36_battle_cinder': 'Cinder Junction',
    '37_battle_frontier': 'Frontier Basin',
    '38_battle_nordhavn': 'Nordhavn Fjord',
    '39_battle_jade_delta': 'Jade River Delta',
    '40_battle_urban_hero': 'Steinburg',
  };
  return labels[shot.id] || (shot.sourceType === 'gallery'
    ? 'Tank Gallery'
    : shot.sourceType === 'studio'
      ? 'Scene Studio'
      : shot.sourceType === 'mobile'
        ? 'Compact viewport'
        : 'Live battle');
};

const shots = config.shots.map((shot) => {
  const quality = qualityById.get(shot.id);
  if (!quality?.passed) throw new Error(`Missing passing quality row for ${shot.id}`);
  const isMobile = shot.sourceType === 'mobile';
  const dimensions = isMobile ? { width: 860, height: 1864 } : { width: 1920, height: 1080 };
  const output = join(outDir, `${shot.id}.webp`);
  encodeWebp(join(rawDir, shot.source), output, dimensions.width, dimensions.height, isMobile ? 82 : 84);
  return {
    sequence: shot.sequence,
    id: shot.id,
    src: `/media/showcase-r2/${shot.id}.webp`,
    title: shot.title,
    alt: shot.alt,
    kind: shot.kind,
    feature: featureFor(shot),
    map: mapFor(shot),
    sourceType: shot.sourceType,
    source: shot.sourceType === 'studio-scene'
      ? `tools/marketing-shots/scenes-presentation-r1/${shot.scene}.json`
      : shot.sourceType === 'shot-view'
        ? `window.__SHOTS.${shot.view}`
        : 'tools/marketing-shots/capture-showcase-r2-ui.mjs',
    dimensions,
    pages: pagesByShot.get(shot.id) || [],
    quality: { passed: true, metrics: quality.metrics },
  };
});

run(process.execPath, [
  join(HERE, 'contact.mjs'), '--all', '--contain',
  '--dir', outDir,
  '--out', reviewRawDir,
  '--tile', '480', '--cols', '5', '--rows', '2',
], 'R2 contact sheets');
const rawSheets = readdirSync(reviewRawDir)
  .filter((file) => /^all_\d+_SHEET\.png$/.test(file))
  .sort();
if (rawSheets.length !== 4) throw new Error(`Expected four R2 contact sheets, found ${rawSheets.length}`);
const contactSheets = rawSheets.map((file, index) => {
  const page = index + 1;
  const output = `review-${String(page).padStart(2, '0')}.webp`;
  encodeWebp(join(reviewRawDir, file), join(processDir, output), 2400, 592, 84);
  return {
    page,
    src: `/media/showcase-r2/process/${output}`,
    frames: shots.slice(index * 10, index * 10 + 10).map((shot) => shot.id),
    dimensions: { width: 2400, height: 592 },
  };
});

const counts = Object.fromEntries(['garage', 'interface', 'live', 'vehicle', 'battle']
  .map((kind) => [kind, shots.filter((shot) => shot.kind === kind).length]));
const manifest = {
  libraryId: config.collectionId,
  schemaVersion: 2,
  generatedAt: '2026-09-04',
  renderer: 'Claude of Tanks production Garage, Tank Gallery, Scene Studio, and deterministic shot runtime',
  firstPartyRuntimeOnly: true,
  review: 'Forty current-renderer frames with image-level gates, four visual review sheets, and explicit coverage for every public route',
  sourceDimensions: config.sourceDimensions,
  counts: { ...counts, total: shots.length },
  qualityGate: { report: 'shots/showcase-r2/quality-report.json', required: { images: 40, passed: 40, failed: 0 } },
  pageAssignments: config.pageAssignments,
  process: {
    purpose: 'Collection-level visual review before public-page admission',
    sequence: ['deterministic runtime state', '4K capture', 'image gate', 'contact-sheet review', 'web rendition', 'page assignment'],
    contactSheets,
  },
  shots,
};
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[publish-showcase-r2] published ${shots.length} current-renderer frames to ${outDir}`);
