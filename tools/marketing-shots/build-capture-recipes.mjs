import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const manifest = readJson('public/media/showcase-r1/manifest.json');
const studioWinter = readJson('tools/marketing-shots/scenes-studio-r1/studio_winter_breakthrough.json');
const recipes = {};
const media = {};

for (const shot of manifest.shots) {
  if (!shot.sourceScene) continue;
  const source = shot.sourceScene.startsWith('tools/') ? readJson(shot.sourceScene) : studioWinter;
  const recipe = clone(source);
  recipe.fxTime = Number.isFinite(shot.timeMs) ? shot.timeMs : (recipe.fxTime || 0);
  recipe.timeScale = 0;
  recipes[shot.id] = recipe;
  media[shot.src] = shot.id;
}

const FEATURE_SCENES = [
  ['01_desert_duel_leclerc_kill', '61_action_desert_duel_leclerc_kill.json'],
  ['02_desert_ram_abramsx_t90m', '62_action_desert_ram_abramsx_t90m.json'],
  ['03_winter_lake_duel', '67_action_winter_lake_duel.json'],
  ['04_urban_street_duel', '71_action_urban_street_duel.json'],
  ['05_urban_hero_abramsx', '75_action_urban_hero_abramsx.json'],
  ['06_verdant_meadow_duel', '88_action_verdant_meadow_duel.json'],
];

function featureRecipe(source) {
  const scene = clone(source);
  const fireTimes = [750, 1750, 2850];
  let fireIndex = 0;
  let accentIndex = 0;
  scene.effects = (scene.effects || []).map((effect) => {
    let tMs;
    if (effect.type === 'fire' || effect.type === 'mg_burst') tMs = fireTimes[fireIndex++ % fireTimes.length];
    else if (effect.type === 'tank_kill') tMs = 4050;
    else if (effect.type === 'explosion') tMs = 3650;
    else tMs = [1250, 2350, 3300, 4800][accentIndex++ % 4];
    return { ...effect, tMs };
  });
  const durationMs = 6000;
  const actorTracks = scene.actors.map((actor, actorIndex) => {
    const heading = (actor.facingDeg || 0) * Math.PI / 180;
    const travel = actorIndex === 1 ? 0.8 : 1.8;
    return { actor: actor.name, keys: [
      { id: `${actor.name}-0`, tMs: 0, pos: [...actor.pos], facingDeg: actor.facingDeg || 0,
        turretDeg: actor.turretDeg || 0, gunDeg: actor.gunDeg || 0 },
      { id: `${actor.name}-1`, tMs: durationMs,
        pos: [actor.pos[0] + Math.sin(heading) * travel, actor.pos[1] + Math.cos(heading) * travel],
        facingDeg: actor.facingDeg || 0, turretDeg: actor.turretDeg || 0, gunDeg: actor.gunDeg || 0 },
    ] };
  });
  const base = scene.camera;
  const [x, y, z] = base.pos;
  const [lx, ly, lz] = base.lookAt;
  scene.storyboard = {
    durationMs,
    shots: [
      { id: 'open', label: 'Contact', tMs: 0, pos: [x, y, z], lookAt: [lx, ly, lz],
        fov: base.fov, rollDeg: base.rollDeg || 0, transition: 'linear' },
      { id: 'exchange', label: 'Exchange', tMs: 2900, pos: [x + 0.9, y + 0.25, z + 0.45],
        lookAt: [lx + 0.5, ly + 0.1, lz], fov: Math.max(32, base.fov - 1),
        rollDeg: (base.rollDeg || 0) * 0.5, transition: 'smooth' },
      { id: 'impact', label: 'Impact', tMs: durationMs, pos: [x + 1.6, y + 0.45, z + 0.75],
        lookAt: [lx + 0.8, ly + 0.15, lz + 0.1], fov: Math.max(32, base.fov - 2),
        rollDeg: 0, transition: 'smooth' },
    ],
    actorTracks,
  };
  scene.fxTime = 0;
  scene.timeScale = 0;
  return scene;
}

for (const [slug, file] of FEATURE_SCENES) {
  const id = `feature_loop_${slug}`;
  recipes[id] = featureRecipe(readJson(`tools/marketing-shots/scenes-action-r3/${file}`));
  media[`/media/feature-loops-r1/${slug}.webm`] = id;
  media[`/media/feature-loops-r1/${slug}.jpg`] = id;
}

const output = {
  schemaVersion: 1,
  generatedBy: 'tools/marketing-shots/build-capture-recipes.mjs',
  usage: 'Copy a recipe value and load it with window.__STUDIO.load(recipe).',
  media,
  recipes,
};
writeFileSync(join(ROOT, 'public/media/capture-recipes-r1.json'), `${JSON.stringify(output)}\n`);
console.log(`capture recipes: ${Object.keys(recipes).length} recipes / ${Object.keys(media).length} media paths`);
