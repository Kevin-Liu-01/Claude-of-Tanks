// Compress the deterministic presentation-r1 PNG captures and publish the
// metadata consumed by the public media-archive component.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const SCENES = join(HERE, 'scenes-presentation-r1');
const RAW = resolve(ROOT, 'shots/presentation-r1/raw');
const UI_RAW = resolve(ROOT, 'shots/presentation-r1/ui-raw');
const OUT = resolve(ROOT, 'public/media/presentation-r1');
mkdirSync(OUT, { recursive: true });

const sceneFiles = readdirSync(SCENES).filter((file) => file.endsWith('.json')).sort();
if (sceneFiles.length < 50) throw new Error(`Expected at least 50 scene files, found ${sceneFiles.length}`);

function encode(input, output, quality = 80) {
  const result = spawnSync('cwebp', ['-quiet', '-mt', '-m', '6', '-q', String(quality), '-sharp_yuv', input, '-o', output], {
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`cwebp failed for ${input}`);
}

const shots = sceneFiles.map((file, index) => {
  const scene = JSON.parse(readFileSync(join(SCENES, file), 'utf8'));
  const id = basename(file, '.json');
  const raw = join(RAW, `${id}.png`);
  const output = join(OUT, `${id}.webp`);
  encode(raw, output);
  const actorNames = scene.actors.map((actor) => actor.id);
  const effects = [...new Set(scene.effects.map((effect) => effect.type))];
  const meta = scene.meta || {};
  return {
    id,
    sequence: index + 1,
    src: `/media/presentation-r1/${id}.webp`,
    title: meta.title || id,
    map: meta.map || scene.map,
    feature: meta.feature || 'Live renderer',
    kind: meta.kind || 'action',
    alt: `${meta.title || id} on ${meta.map || scene.map}, captured from the live Claude of Tanks renderer`,
    actors: actorNames,
    effects,
    seed: scene.seed,
  };
});

const uiLabels = Object.freeze({
  garage: ['Garage command deck', 'Interface'],
  player_view: ['Production battle HUD', 'HUD'],
  sniper_view: ['Precision sight', 'Gunnery'],
  combat_firing: ['Live firing cycle', 'Gunnery'],
  explosion: ['Destruction event', 'Destruction'],
  killcam_xray: ['Resolved-shot X-ray', 'Killcam'],
  tank_closeup_modern: ['First-party vehicle rig', 'Tank design'],
  battlefield_foundry: ['Ironworks overview', 'World system'],
  gallery: ['Tank Gallery live dossier', 'Tank design'],
  studio: ['Scene Studio workspace', 'Interface'],
  mobile: ['Responsive mobile command deck', 'Interface'],
});
const uiShots = [];
try {
  for (const file of readdirSync(UI_RAW).filter((entry) => entry.endsWith('.png')).sort()) {
    const id = basename(file, '.png');
    const [title, feature] = uiLabels[id] || [id.replaceAll('_', ' '), 'Interface'];
    const outputName = `ui_${id}.webp`;
    encode(join(UI_RAW, file), join(OUT, outputName), 82);
    uiShots.push({
      id: `ui_${id}`,
      src: `/media/presentation-r1/${outputName}`,
      title,
      map: 'Live game',
      feature,
      kind: 'interface',
      alt: `${title} captured from the live Claude of Tanks game`,
      actors: [],
      effects: [],
    });
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const manifest = {
  schemaVersion: 1,
  generatedAt: '2026-08-19',
  renderer: 'Claude of Tanks Scene Studio and deterministic game harness',
  firstPartyRuntimeOnly: true,
  studioShotCount: shots.length,
  interfaceShotCount: uiShots.length,
  totalShotCount: shots.length + uiShots.length,
  shots: [...uiShots, ...shots],
};
writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Published ${shots.length} Studio frames and ${uiShots.length} interface frames to ${OUT}`);
