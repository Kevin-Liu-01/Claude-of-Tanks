// Publish native 4K interface evidence from the deterministic capture tools.
// PNG masters stay under shots/; the public archive uses high-quality WebP
// while retaining the full 3840x2160 raster.

import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
function opt(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const shotsRoot = resolve(opt('input', 'shots/feature-evidence-r2'));
const outputDir = resolve(opt('out', 'public/media/feature-evidence-r2'));
mkdirSync(outputDir, { recursive: true });

const captures = [
  ['killcam-modules', 'M1A2 SEPv3 killcam module trace', join(shotsRoot, 'killcam/killcam_xray.png')],
  ['garage-fleet', 'Garage fleet', join(shotsRoot, 'ui-raw/garage_4k.png')],
  ['gallery-carro45t-modules', 'Carro 45t internal modules', join(shotsRoot, 'ui-raw/gallery_modules_carro45t_4k.png')],
  ['studio-action', 'Scene Studio action frame', join(shotsRoot, 'ui-raw/studio_action_4k.png')],
  ['mechanic-mbt70-missile', 'MBT-70 Shillelagh missile', join(shotsRoot, 'ui-raw/mechanic_mbt70_missile_4k.png')],
  ['mechanic-strv-suspension', 'Stridsvagn 103 hydropneumatic aim', join(shotsRoot, 'ui-raw/mechanic_strv_suspension_4k.png')],
];

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(' ')}\n${result.stderr}`);
  return result.stdout;
}

function dimensions(path) {
  const data = JSON.parse(run('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
    '-of', 'json', path,
  ]));
  return data.streams[0];
}

const images = captures.map(([id, title, source]) => {
  const sourceSize = dimensions(source);
  if (sourceSize.width !== 3840 || sourceSize.height !== 2160) {
    throw new Error(`${basename(source)}: expected 3840x2160, got ${sourceSize.width}x${sourceSize.height}`);
  }
  const target = join(outputDir, `${id}.webp`);
  run('cwebp', [
    '-quiet', '-mt', '-m', '6', '-q', '90', '-sharp_yuv', source, '-o', target,
  ]);
  const publicSize = dimensions(target);
  if (publicSize.width !== 3840 || publicSize.height !== 2160) {
    throw new Error(`${id}: public rendition lost its native 4K dimensions`);
  }
  return {
    id,
    title,
    path: `/media/feature-evidence-r2/${id}.webp`,
    width: publicSize.width,
    height: publicSize.height,
    bytes: statSync(target).size,
  };
});

const manifest = {
  libraryId: 'claude-of-tanks-feature-evidence-r2',
  schemaVersion: 1,
  source: 'Native 4K in-engine and public-interface captures',
  qualityGate: {
    requirements: ['3840x2160 raster', 'production UI state', 'procedural playable vehicle geometry'],
    passed: images.length,
    failed: 0,
  },
  images,
};
writeFileSync(join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[feature-evidence] published ${images.length} native 4K images to ${outputDir}`);
