// Authors the 50-frame presentation archive used by /home, /docs, /gallery,
// Scene Studio, and the README. The first 34 frames are new compositions
// derived from proven deterministic Studio recipes; the final 16 give every
// battlefield its own current-renderer hero frame.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'scenes-presentation-r1');
mkdirSync(OUT, { recursive: true });

const titleCase = (value) => value
  .replace(/^\d+_/, '')
  .replaceAll('_', ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const mapNames = Object.freeze({
  verdant: 'Verdant Fields', desert: 'Sirocco Wadi', winter: 'Frosthollow',
  urban: 'Steinburg', coastal: 'Saltmere Bay', autumn: 'Amberford',
  steppe: 'Tarkhan Steppe', railyard: 'Cinder Junction',
  frontier: 'Frontier Basin', fjord: 'Nordhavn Fjord', delta: 'Jade River Delta',
  badlands: 'Redrock Divide', monsoon: 'Monsoon Ridge', alpine: 'Glacier Pass',
  caldera: 'Obsidian Caldera', foundry: 'Ironworks',
});

const vehiclePool = [
  'm1a2_sepv3', 'kf51b', 'challenger_3', 't90a_vladimir', 't90a_burlak',
  'merkava4b', 'strv103', 'strv103a', 'udes03', 'mbt70', 'spz_puma',
  'fv510_milan', 'm2a2_bradley', 'pl01_105', 'type99a', 'leclerc_xlr',
];
const camos = ['factory', 'summer', 'desert', 'winter', 'digital', 'urbanblock', 'splinter', 'flecktarn'];

const sources = [
  ...readdirSync(join(HERE, 'scenes2')).filter((file) => file.endsWith('.json')).sort(),
  ...readdirSync(join(HERE, 'scenes')).filter((file) => file.endsWith('.json')).sort().slice(0, 4),
];

const featureFor = (scene) => {
  const types = new Set((scene.effects || []).map((effect) => effect.type));
  if (types.has('tank_kill')) return 'Destruction';
  if (types.has('detrack')) return 'Track physics';
  if (types.has('sparks') || types.has('impact')) return 'Armor impacts';
  if (types.has('firing_moment') || types.has('fire')) return 'Gunnery';
  return 'Battlefield atmosphere';
};

for (let index = 0; index < sources.length; index += 1) {
  const sourceFile = sources[index];
  const sourceDir = Number.parseInt(sourceFile, 10) >= 31 ? 'scenes2' : 'scenes';
  const scene = JSON.parse(readFileSync(join(HERE, sourceDir, sourceFile), 'utf8'));
  const number = index + 1;
  const driftX = ((number % 5) - 2) * 1.25;
  const driftZ = (((number * 3) % 5) - 2) * 1.1;

  scene.seed = 9200 + number;
  scene.actors = (scene.actors || []).map((actor, actorIndex) => ({
    ...actor,
    id: vehiclePool[(number * 2 + actorIndex * 5) % vehiclePool.length],
    pos: [actor.pos[0] + driftX, actor.pos[1] + driftZ],
    camo: camos[(number + actorIndex * 2) % camos.length],
    camoSeed: 92000 + number * 10 + actorIndex,
  }));

  if (scene.camera?.pos) {
    scene.camera.pos[0] += driftX + ((number % 3) - 1) * 1.6;
    scene.camera.pos[2] += driftZ + (((number + 1) % 3) - 1) * 1.2;
    scene.camera.fov = Math.max(24, Math.min(58, (scene.camera.fov || 42) + ((number % 5) - 2)));
    scene.camera.rollDeg = Number(((scene.camera.rollDeg || 0) + ((number % 3) - 1) * 1.5).toFixed(1));
  }
  if (scene.camera?.lookAt) {
    scene.camera.lookAt[0] += driftX;
    scene.camera.lookAt[2] += driftZ;
  }

  const freezeAt = Number.isFinite(scene.fxTime) ? scene.fxTime : 620;
  if (number % 4 === 0 && scene.actors[0]) {
    scene.effects.push({
      type: 'sparks', actor: scene.actors[0].name, tMs: Math.max(0, freezeAt - 75),
      params: { caliberMm: 120, hFrac: 0.62 },
    });
  }
  if (number % 7 === 0 && scene.actors[0]) {
    scene.effects.push({
      type: 'detrack', actor: scene.actors[0].name, tMs: Math.max(0, freezeAt - 180),
      params: { side: number % 2 ? 'L' : 'R' },
    });
  }
  scene.meta = {
    title: titleCase(basename(sourceFile, '.json')),
    map: mapNames[scene.map] || scene.map,
    feature: featureFor(scene),
    kind: 'action',
    sequence: number,
  };
  const outputName = `${String(number).padStart(2, '0')}_${basename(sourceFile, '.json').replace(/^\d+_/, '')}.json`;
  writeFileSync(join(OUT, outputName), `${JSON.stringify(scene, null, 2)}\n`);
}

const mapHeroes = [
  ['verdant', [-16, -72], [-28, 4.2, -98], 'm1a2_sepv3', 'summer'],
  ['desert', [56, 76], [37, 4.0, 58], 'leclerc_xlr', 'desert'],
  ['winter', [12, 42], [-11, 4.5, 21], 'strv122', 'winter'],
  ['urban', [36, 60], [17, 4.0, 43], 'challenger_3', 'urbanblock'],
  ['coastal', [168, 42], [143, 4.2, 22], 'merkava4b', 'naval'],
  ['autumn', [4, 52], [-18, 4.2, 33], 'leo2a7v', 'autumn'],
  ['steppe', [2, 44], [-24, 4.0, 24], 't90a_vladimir', 'amoeba'],
  ['railyard', [18, 34], [-12, 4.1, 14], 'kf51b', 'digital'],
  ['frontier', [28, 80], [2, 4.3, 55], 'm2a2_bradley', 'desert'],
  ['fjord', [78, 40], [51, 4.4, 20], 'strv103', 'winter'],
  ['delta', [-18, 54], [-46, 4.1, 34], 'type99a', 'digital'],
  ['badlands', [16, 58], [-12, 4.2, 36], 'mbt70', 'desert'],
  ['monsoon', [20, 72], [-9, 4.1, 49], 'pl01_105', 'tropic'],
  ['alpine', [32, 54], [4, 4.8, 31], 'udes03', 'winter'],
  ['caldera', [18, 62], [-12, 4.2, 39], 't90a_burlak', 'factory'],
  ['foundry', [26, 46], [-5, 4.0, 25], 'spz_puma', 'urbanblock'],
];

for (let mapIndex = 0; mapIndex < mapHeroes.length; mapIndex += 1) {
  const [map, pos, cameraPos, tank, camo] = mapHeroes[mapIndex];
  const number = 35 + mapIndex;
  const scene = {
    map,
    seed: 9300 + mapIndex,
    actors: [
      { id: tank, name: 'hero', pos, facingDeg: 28 + mapIndex * 17, turretDeg: -18 + (mapIndex % 5) * 9, gunDeg: 1, camo, camoSeed: 93000 + mapIndex },
      { id: vehiclePool[(mapIndex + 7) % vehiclePool.length], name: 'wing', pos: [pos[0] + 14, pos[1] + 18], facingDeg: 196 + mapIndex * 11, turretDeg: 22, gunDeg: 0.5, camo: camos[(mapIndex + 3) % camos.length], camoSeed: 93100 + mapIndex },
    ],
    effects: [
      { type: 'dust', at: [pos[0] + 3, pos[1] - 2], tMs: 260, params: { count: 14, intensity: 1.05, dirDeg: 210 } },
      { type: mapIndex % 3 === 0 ? 'firing_moment' : 'fire', actor: 'hero', tMs: 530, params: { slot: 0, tracer: true, ageS: 0.06 } },
      ...(mapIndex % 3 === 1 ? [{ type: 'sparks', actor: 'wing', tMs: 470, params: { caliberMm: 120, hFrac: 0.58 } }] : []),
      ...(mapIndex % 3 === 2 ? [{ type: 'explosion', at: [pos[0] + 18, pos[1] + 10], tMs: 230, params: { size: 'medium' } }] : []),
    ],
    camera: { pos: cameraPos, lookAt: [pos[0] + 5, 2.1, pos[1] + 5], groundRel: true, fov: 40 + (mapIndex % 4) * 2, rollDeg: (mapIndex % 3) - 1 },
    fxTime: 560,
    timeScale: 0,
    meta: {
      title: `${mapNames[map]} Contact`, map: mapNames[map], feature: 'World system',
      kind: 'battlefield', sequence: number,
    },
  };
  writeFileSync(join(OUT, `${String(number).padStart(2, '0')}_${map}_contact.json`), `${JSON.stringify(scene, null, 2)}\n`);
}

console.log(`Wrote ${readdirSync(OUT).filter((file) => file.endsWith('.json')).length} presentation scenes to ${OUT}`);
