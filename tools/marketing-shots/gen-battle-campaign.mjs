// tools/marketing-shots/gen-battle-campaign.mjs
//
// Builds two new deterministic 30-shot campaigns from camera/stage recipes
// that already passed visual review in marketing sets 1 and 2:
//   - scenes-action-r3: close multi-tank battle frames (61-90)
//   - scenes-foreground-r3: large foreground-tank variants (91-120)
//
// The scene content is new: current modern procedural tanks, reinforced casts,
// heavier live FX, and a dedicated foreground camera. Reusing the proven map
// coordinates prevents buildings, terrain, billboards, and vegetation from
// swallowing the subjects during a 60-frame bulk render.

import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ACTION_OUT = join(HERE, 'scenes-action-r3');
const FOREGROUND_OUT = join(HERE, 'scenes-foreground-r3');
mkdirSync(ACTION_OUT, { recursive: true });
mkdirSync(FOREGROUND_OUT, { recursive: true });
for (const dir of [ACTION_OUT, FOREGROUND_OUT]) {
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
    unlinkSync(join(dir, file));
  }
}

const TEMPLATES = [
  ['scenes', '01_desert_duel_leclerc_kill.json'],
  ['scenes', '02_desert_ram_abramsx_t90m.json'],
  ['scenes', '03_desert_overwatch_line.json'],
  ['scenes', '04_desert_village_brawl.json'],
  ['scenes2', '50_coastal_dune_ambush.json'],
  ['scenes2', '51_coastal_seafront_duel.json'],
  ['scenes', '09_winter_lake_duel.json'],
  ['scenes', '10_winter_ram_leo2a6.json'],
  ['scenes', '12_winter_village_brawl.json'],
  ['scenes', '11_winter_overwatch_birch.json'],
  ['scenes', '17_urban_street_duel.json'],
  ['scenes', '18_urban_ram_plaza.json'],
  ['scenes', '19_urban_overwatch_church.json'],
  ['scenes', '20_urban_ruin_brawl.json'],
  ['scenes', '22_urban_hero_abramsx.json'],
  ['scenes', '24_verdant_field_duel.json'],
  ['scenes', '25_verdant_ram_hedgerow.json'],
  ['scenes', '27_verdant_village_brawl.json'],
  ['scenes', '29_verdant_hero_challenger1.json'],
  ['scenes2', '31_desert_wadi_gauntlet.json'],
  ['scenes2', '57_steppe_windbreak_snipe.json'],
  ['scenes2', '34_desert_last_stand.json'],
  ['scenes2', '35_winter_ice_breaker.json'],
  ['scenes2', '55_steppe_horizon_charge.json'],
  ['scenes2', '39_urban_alley_flash.json'],
  ['scenes2', '49_coastal_harbor_kill.json'],
  ['scenes2', '45_verdant_column_massacre.json'],
  ['scenes2', '46_verdant_meadow_duel.json'],
  ['scenes2', '48_coastal_beach_storm.json'],
  ['scenes', '26_verdant_overwatch_ridge.json'],
];

const MODERN_FLEET = [
  'm1a2_sepv3', 'abramsx', 'm1a2_tusk', 'challenger_3',
  'leo2a7v', 'leo2_revolution', 'strv122', 'leclerc_xlr',
  'kf51', 'k2', 'type10', 'type99a',
  't90m', 't90sm', 't14', 'ua_t84_oplot_m',
  'pt91m', 'ariete', 't80u', 't72b3m',
];

const MAP_CAMOS = {
  desert: ['digitaldesert', 'chocchip', 'desert', 'pinkdesert'],
  winter: ['winterbands', 'merdcwinter', 'washworn', 'winter'],
  urban: ['urbanblock', 'berlin', 'digital', 'midnight'],
  verdant: ['dpm', 'flecktarn', 'summer', 'm90'],
  coastal: ['naval', 'dazzle', 'digital', 'summer'],
  railyard: ['urbanblock', 'berlin', 'digital', 'washworn'],
};

// These source stages put the generic hero-orbit camera inside dense scenery.
// Their action cameras already have a verified, unobstructed line to the hero,
// so move inward along that same ray instead of inventing a new approach.
const SIGHTLINE_FOREGROUND_INDICES = new Set([9, 10, 12, 13, 15, 20, 26, 29]);
const CLOSE_ACTION_INDICES = new Set([9, 26, 29]);
// The action contract: a hull within 29 m of the lens. A template staged as a
// long lens (round 51, 2026-09-24, re-staged 57_steppe_windbreak_snipe down the
// Tarkhan highway with its sniper 60 m out) is pulled in along its own sightline
// until a hull is within ACTION_NEAREST_M, instead of re-staging the approved
// home frame; templates already inside the contract are untouched.
const ACTION_NEAREST_M = 28;

// Two action frames were hand-tuned after the 2026-08-19 generation (the
// 2026-08-20 showcase overhaul) and rendered as tuned; their foreground twins
// kept the generated values. The edits live here so a regeneration reproduces
// the published campaign byte for byte (recorded 2026-09-24, round 53).
const HAND_TUNED_ACTION = {
  '62_action_desert_ram_abramsx_t90m': (scene) => {
    const victim = scene.actors.find((actor) => actor.name === 'victim');
    victim.pos = [31, 75];
    for (const effect of scene.effects) {
      if (effect.type === 'dust' && effect.at && effect.tMs === 140) effect.at = [25, 71.5];
      if (effect.type === 'explosion' && effect.at) effect.at = [31, 75];
    }
    scene.camera.lookAt = [24.5, 1.6, 71.5];
  },
  '89_action_coastal_beach_storm': (scene) => {
    scene.actors.find((actor) => actor.name === 'reinforcement').pos[0] = 190;
  },
};

// Foreground lenses whose formula position lands on a prop of the round-48
// redesigned battlefields (2026-09-24, round 53): the orbit lens of the
// Frosthollow ram stood behind a snow rise that hid both hulls' lower halves
// (mirrored to the pair's north side, on the valley floor); the sightline
// lens of the Tarkhan snipe stood 3 m from a highway utility pole (moved onto
// the carriageway, 13 m from the sniper); the orbit lens of the Frosthollow
// crossroads brawl stood 3 m from a hedgehog with a woodshed and yard clutter
// on the crossing road's north verge (moved 1.5 m east and 1.2 m south, 8.5 m
// from the foe, the onion-dome church centred behind the hull). All keep the
// 7-14 m anchor contract.
const HAND_TUNED_FOREGROUND = {
  '99_foreground_winter_village_brawl': (scene) => {
    scene.camera.pos = [-64, 1.7, -18.5];
    scene.camera.lookAt = [-65, 2.25, -32.5];
  },
  '98_foreground_winter_ram_leo2a6': (scene) => {
    scene.camera.pos = [62.4, 1.45, -6.7];
    scene.camera.lookAt = [55.7, 2.25, -21];
  },
  '111_foreground_steppe_windbreak_snipe': (scene) => {
    scene.camera.pos = [-106.7, 2.4, -210.6];
    scene.camera.lookAt = [-115, 2.25, -200];
  },
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const toRad = (degrees) => degrees * Math.PI / 180;
const headingTo = (from, to) => Math.atan2(to[0] - from[0], to[1] - from[1]) * 180 / Math.PI;
const nameStem = (file) => file.replace(/^\d+_/, '').replace(/\.json$/, '');

function uniqueName(actors, base) {
  let name = base;
  let suffix = 1;
  while (actors.some((actor) => actor.name === name)) name = `${base}${suffix++}`;
  return name;
}

function actorForward(actor) {
  const angle = toRad(actor.facingDeg || 0);
  return [Math.sin(angle), Math.cos(angle)];
}

function addReinforcements(scene, campaignIndex) {
  const actors = scene.actors;
  const hero = actors[0];
  const heroForward = actorForward(hero);
  const heroRight = [heroForward[1], -heroForward[0]];
  const target = actors[1]?.pos || [
    hero.pos[0] + heroForward[0] * 28,
    hero.pos[1] + heroForward[1] * 28,
  ];
  const offsets = actors.length === 1
    ? [[18, -11], [27, 11], [37, -5]]
    : actors.length === 2
      ? [[12, -10], [22, 10]]
      : [[16, campaignIndex % 2 ? -11 : 11]];

  for (let i = 0; actors.length < 4; i++) {
    const [forwardM, sideM] = offsets[i] || [20 + i * 8, i % 2 ? -12 : 12];
    const pos = [
      hero.pos[0] + heroForward[0] * forwardM + heroRight[0] * sideM,
      hero.pos[1] + heroForward[1] * forwardM + heroRight[1] * sideM,
    ];
    const id = MODERN_FLEET[(campaignIndex * 4 + actors.length) % MODERN_FLEET.length];
    actors.push({
      id,
      name: uniqueName(actors, 'reinforcement'),
      pos: pos.map((value) => Math.round(value * 10) / 10),
      facingDeg: Math.round(headingTo(pos, target) * 10) / 10,
      turretDeg: 0,
      gunDeg: 0.5,
      camo: MAP_CAMOS[scene.map]?.[actors.length % 4] || 'factory',
      camoSeed: 9000 + campaignIndex * 10 + actors.length,
    });
  }
}

function recast(scene, campaignIndex) {
  const camos = MAP_CAMOS[scene.map] || MAP_CAMOS.verdant;
  scene.actors.forEach((actor, actorIndex) => {
    actor.id = MODERN_FLEET[(campaignIndex * 3 + actorIndex * 5) % MODERN_FLEET.length];
    actor.camo = camos[actorIndex % camos.length];
    actor.camoSeed = 8000 + campaignIndex * 10 + actorIndex;
  });
}

function addBattleEffects(scene, campaignIndex) {
  const fxTime = Math.max(620, Number(scene.fxTime) || 0);
  scene.fxTime = fxTime;
  scene.timeScale = 0;
  const killed = new Set(scene.effects
    .filter((effect) => effect.type === 'tank_kill')
    .map((effect) => String(effect.actor)));
  const living = scene.actors.filter((actor, index) => (
    !String(actor.state || '').includes('wreck')
    && actor.state !== 'turret-popped'
    && !killed.has(actor.name)
    && !killed.has(String(index))
  ));
  const shooters = living.slice(0, Math.min(3, living.length));
  scene.effects = scene.effects.filter((effect) => !(
    effect.type === 'fire' && shooters.some((actor) => effect.actor === actor.name)
  ));
  shooters.forEach((actor, index) => {
    scene.effects.push({
      type: 'fire', actor: actor.name, tMs: fxTime - 24 - index * 11,
      params: { slot: 0, tracer: true, recoil: true },
    });
  });
  scene.effects.push({
    type: 'sparks', actor: scene.actors[0].name, hFrac: 0.68,
    tMs: fxTime - 102,
    params: { caliberMm: 125, kind: 'ricochet' },
  });
  scene.effects.push({
    type: 'dust', actor: scene.actors[0].name, tMs: fxTime - 320,
    params: { count: 8, intensity: 0.65, dirDeg: (scene.actors[0].facingDeg || 0) + 180 },
  });
  if (!scene.effects.some((effect) => ['tank_kill', 'explosion', 'explosion_moment'].includes(effect.type))) {
    const b = scene.actors[1].pos;
    scene.effects.push({
      type: 'explosion',
      at: [...b],
      tMs: fxTime - 470,
      params: { size: campaignIndex % 3 === 0 ? 'large' : 'medium', cause: 'shot' },
    });
  }
  if (campaignIndex % 4 === 0) {
    scene.effects.push({
      type: 'mg_burst', actor: shooters.at(-1)?.name || scene.actors[0].name,
      tMs: fxTime - 46,
      params: { count: 10, gapM: 4, spreadDeg: 0.7 },
    });
  }
}

function nearestHullM(scene) {
  const [cx, , cz] = scene.camera.pos;
  return Math.min(...scene.actors.map((actor) => Math.hypot(actor.pos[0] - cx, actor.pos[1] - cz)));
}

function pullInLongLens(scene) {
  const camera = scene.camera;
  if (nearestHullM(scene) <= 29) return;
  const dx = camera.lookAt[0] - camera.pos[0];
  const dz = camera.lookAt[2] - camera.pos[2];
  const length = Math.hypot(dx, dz);
  let moved = 0;
  while (nearestHullM(scene) > ACTION_NEAREST_M && moved < length - 10) {
    camera.pos[0] += dx / length;
    camera.pos[2] += dz / length;
    moved += 1;
  }
  camera.pos[0] = Math.round(camera.pos[0] * 10) / 10;
  camera.pos[2] = Math.round(camera.pos[2] * 10) / 10;
}

function actionCamera(scene, campaignIndex) {
  const camera = scene.camera;
  pullInLongLens(scene);
  const nudge = campaignIndex % 2 ? -0.7 : 0.7;
  camera.pos[0] = Math.round((camera.pos[0] + nudge) * 10) / 10;
  camera.pos[2] = Math.round((camera.pos[2] - nudge * 0.5) * 10) / 10;
  if (CLOSE_ACTION_INDICES.has(campaignIndex)) {
    const dx = camera.lookAt[0] - camera.pos[0];
    const dz = camera.lookAt[2] - camera.pos[2];
    const distance = Math.hypot(dx, dz);
    camera.pos[0] = Math.round((camera.pos[0] + dx / distance * 2) * 10) / 10;
    camera.pos[2] = Math.round((camera.pos[2] + dz / distance * 2) * 10) / 10;
  }
  camera.fov = Math.max(32, Math.min(50, (camera.fov || 44) + (campaignIndex % 3) - 1));
  camera.rollDeg = Math.max(-5, Math.min(5, (camera.rollDeg || 0) + (campaignIndex % 2 ? -2 : 2)));
  camera.groundRel = true;
}

function foregroundCamera(scene, campaignIndex) {
  const hero = scene.actors[0];
  const gunHeading = toRad((hero.facingDeg || 0) + (hero.turretDeg || 0));
  const forward = [Math.sin(gunHeading), Math.cos(gunHeading)];
  const right = [forward[1], -forward[0]];
  if (SIGHTLINE_FOREGROUND_INDICES.has(campaignIndex)) {
    const actionCamera = scene.camera;
    const dx = actionCamera.pos[0] - hero.pos[0];
    const dz = actionCamera.pos[2] - hero.pos[1];
    const sourceDistance = Math.hypot(dx, dz);
    const distance = Math.min(12.25, sourceDistance);
    const scale = distance / sourceDistance;
    scene.camera = {
      pos: [
        Math.round((hero.pos[0] + dx * scale) * 10) / 10,
        Math.max(1.1, Math.min(2.5, actionCamera.pos[1])),
        Math.round((hero.pos[1] + dz * scale) * 10) / 10,
      ],
      lookAt: [
        Math.round((hero.pos[0] + forward[0] * 5) * 10) / 10,
        2.25,
        Math.round((hero.pos[1] + forward[1] * 5) * 10) / 10,
      ],
      groundRel: true,
      fov: 44,
      rollDeg: campaignIndex % 2 ? -2 : 2,
    };
  } else {
    const side = campaignIndex % 2 ? -1 : 1;
    const rearM = 4.5 + (campaignIndex % 3) * 0.6;
    const sideM = 8.5 + (campaignIndex % 4) * 0.5;
    scene.camera = {
      pos: [
        Math.round((hero.pos[0] - forward[0] * rearM + right[0] * side * sideM) * 10) / 10,
        1.2 + (campaignIndex % 3) * 0.25,
        Math.round((hero.pos[1] - forward[1] * rearM + right[1] * side * sideM) * 10) / 10,
      ],
      lookAt: [
        Math.round((hero.pos[0] + forward[0] * 7) * 10) / 10,
        2.25,
        Math.round((hero.pos[1] + forward[1] * 7) * 10) / 10,
      ],
      groundRel: true,
      fov: 44 + (campaignIndex % 3) * 2,
      rollDeg: campaignIndex % 2 ? -3 : 3,
    };
  }
  scene.effects = scene.effects.filter((effect) => !(
    effect.actor === hero.name && ['fire', 'firing_moment'].includes(effect.type)
  ));
  scene.effects.push({
    type: 'firing_moment', actor: hero.name, tMs: scene.fxTime,
    params: { ageS: 0.05 },
  });
}

function assertScene(scene, category, file) {
  if (scene.actors.length < 4) throw new Error(`${file}: fewer than four actors`);
  const firing = scene.effects.filter((effect) => ['fire', 'firing_moment', 'mg_burst'].includes(effect.type));
  if (firing.length < 2) throw new Error(`${file}: fewer than two firing effects`);
  if (!scene.effects.some((effect) => ['tank_kill', 'explosion', 'explosion_moment'].includes(effect.type))) {
    throw new Error(`${file}: missing major explosion`);
  }
  const [cx, , cz] = scene.camera.pos;
  const distances = scene.actors
    .map((actor) => Math.hypot(actor.pos[0] - cx, actor.pos[1] - cz))
    .sort((a, b) => a - b);
  const heroDistance = Math.hypot(scene.actors[0].pos[0] - cx, scene.actors[0].pos[1] - cz);
  if (category === 'foreground' && (heroDistance < 7 || heroDistance > 14)) {
    throw new Error(`${file}: foreground anchor distance ${heroDistance.toFixed(1)}m`);
  }
  if (category === 'action' && distances[0] > 29) {
    throw new Error(`${file}: action camera is ${distances[0].toFixed(1)}m from its nearest tank`);
  }
  if (scene.camera.fov < 30 || scene.camera.fov > 52) throw new Error(`${file}: lens outside 30-52 degrees`);
}

const sourceNames = new Set();
let actionCount = 0;
let foregroundCount = 0;
for (let index = 0; index < TEMPLATES.length; index++) {
  const [sourceDir, sourceFile] = TEMPLATES[index];
  const sourcePath = join(HERE, sourceDir, sourceFile);
  if (sourceNames.has(sourcePath)) throw new Error(`duplicate template: ${sourcePath}`);
  sourceNames.add(sourcePath);
  const base = JSON.parse(readFileSync(sourcePath, 'utf8'));
  const action = clone(base);
  recast(action, index);
  addReinforcements(action, index);
  addBattleEffects(action, index);
  actionCamera(action, index);
  action.seed = 8200 + index;
  action.meta = {
    campaign: 'marketing-battles-r3', category: 'action',
    sourceComposition: `${sourceDir}/${sourceFile}`,
  };
  const actionNo = 61 + index;
  const actionName = `${String(actionNo).padStart(2, '0')}_action_${nameStem(sourceFile)}`;
  const foreground = clone(action);
  HAND_TUNED_ACTION[actionName]?.(action);
  assertScene(action, 'action', actionName);
  writeFileSync(join(ACTION_OUT, `${actionName}.json`), `${JSON.stringify(action, null, 2)}\n`);
  actionCount++;

  foregroundCamera(foreground, index);
  foreground.seed = 9200 + index;
  foreground.meta = {
    campaign: 'marketing-battles-r3', category: 'foreground',
    sourceComposition: `${sourceDir}/${sourceFile}`,
  };
  const foregroundNo = 91 + index;
  const foregroundName = `${String(foregroundNo).padStart(2, '0')}_foreground_${nameStem(sourceFile)}`;
  HAND_TUNED_FOREGROUND[foregroundName]?.(foreground);
  assertScene(foreground, 'foreground', foregroundName);
  writeFileSync(join(FOREGROUND_OUT, `${foregroundName}.json`), `${JSON.stringify(foreground, null, 2)}\n`);
  foregroundCount++;
}

for (const [dir, count] of [[ACTION_OUT, actionCount], [FOREGROUND_OUT, foregroundCount]]) {
  const files = readdirSync(dir).filter((file) => file.endsWith('.json'));
  if (count !== 30 || files.length !== 30) throw new Error(`${dir}: expected 30 scenes, found ${files.length}`);
}

console.log(`[gen-battle-campaign] wrote ${actionCount} action + ${foregroundCount} foreground scenes`);
