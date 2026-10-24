#!/usr/bin/env node
/**
 * The Deploy screen's objective map (brand-ui 242; the Premiere direction's 04-deploy page, its .bfield .mm): each
 * battlefield's opening objectives (spawns, capture zones, flag bases, frontline sectors, goals) for every mode that
 * places any, baked headless through the real placement (sim/matchPlacement.ts) and mode controller
 * (sim/matchModes.ts), seated as tools/spawn-points-probe.mjs seats a solo match. The Deploy screen reads the
 * serialized state through the HUD's own derivation (ui/minimapObjectives.ts) and glyphs (ui/objectiveGlyphs.ts), so
 * its map shows the battle's own objectives.
 * Copyright © 2026 Kevin B. Liu.
 *
 * Usage: NODE_OPTIONS=--max-old-space-size=4096 node tools/deploy-objectives-bake.mjs [--maps=a,b] [--resume] [--out=file]
 * Writes public/minimaps/objectives.json after every map; --maps and --resume merge into it, and --resume skips the maps
 * it already holds. Re-run it when a map's layout or a mode's placement changes.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { createDedicatedWorldCollision } from '../server/dedicatedWorldCollision.ts';
import { createMatchPlacement, matchPlacementAnchors, placementTankRadius } from '../src/sim/matchPlacement.ts';
import { createMatchModeController } from '../src/sim/matchModes.ts';
import { matchRulesetFor, rulesetObjectiveAxisM, terrainVariantFor } from '../src/sim/matchRuleset.ts';
import { BOT_TANK_IDS, getSpec } from '../src/vehicles/specs.ts';
import { MAP_IDS } from '../src/world/maps/index.ts';

/** The modes whose opening objectives the Deploy map shows (Standard: the two spawns). */
const MODES = ['standard', 'zone_control', 'capture_the_flag', 'frontline_assault', 'turbo_ball', 'mars', 'ac130'];
/** The serialized state's fields ui/minimapObjectives.ts reads. */
const KEEP = ['id', 'perspectiveTeam', 'respawns', 'spawns', 'flags', 'zones', 'ball', 'goals', 'line'];
const SIM_DT = 1 / 60;
const SEED = 1;

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=');
  return [key, value ?? true];
}));
const maps = args.maps ? String(args.maps).split(',') : MAP_IDS.filter((id) => id !== 'random');
const outPath = String(args.out ?? 'public/minimaps/objectives.json');

/** What a flat north-up map never reads: heights and the ball's motion. */
const DROP = new Set(['y', 'baseY', 'vx', 'vy', 'vz', 'lastTouchId', 'carrierId']);
/** Whole metres: the map draws them at a few hundred pixels across. */
function rounded(value) {
  if (Array.isArray(value)) return value.map(rounded);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([k, v]) => v !== undefined && !DROP.has(k)).map(([k, v]) => [k, rounded(v)]));
  }
  return typeof value === 'number' ? Math.round(value) : value;
}

function openingState(mapId, mode, world) {
  const ruleset = matchRulesetFor(mode, null, null);
  const field = world.heightField;
  const placement = createMatchPlacement({
    mapId, heightField: field, obstacles: world.getObstacles(), queryObstacles: world.queryObstacles,
    anchors: matchPlacementAnchors(field._layout.spawns), mode, objectiveAxisM: rulesetObjectiveAxisM(ruleset),
    assaultLines: field.assaultTrenchLines?.sectors ?? field.assaultTrenchLines?.lines ?? null,
  });
  const players = [{ id: 'p0', team: 'alpha', bot: false }];
  for (let i = 0; i < (ruleset.allies ?? 6); i++) players.push({ id: `a${i + 1}`, team: 'alpha', bot: true });
  for (let i = 0; i < (ruleset.enemies ?? 7); i++) players.push({ id: `e${i}`, team: 'bravo', bot: true });
  const index = { alpha: 0, bravo: 0 };
  const entities = players.map((player, i) => {
    const spec = getSpec(BOT_TANK_IDS[i % BOT_TANK_IDS.length]), radius = placementTankRadius(spec);
    const slot = placement.deploymentSlot(player.team, index[player.team]++);
    const pad = placement.spawn({ x: slot.x, z: slot.z, yaw: slot.yaw }, player.id, radius, false);
    return { id: player.id, team: player.team, bot: player.bot, isPlayer: !player.bot, spec, specId: spec.id, radius,
      state: { pos: new Vector3(pad.x, field.getHeightAt(pad.x, pad.z), pad.z), yaw: pad.yaw, speed: 0, aimPoint: new Vector3() },
      combat: { hp: 1000, maxHp: 1000, destroyed: false, ammo: [20, 20, 20], ammoCapacity: [20, 20, 20] },
      input: { aimPoint: new Vector3() } };
  });
  const revive = (entity, spawn) => {
    entity.state.pos.set(spawn.x, field.getHeightAt(spawn.x, spawn.z), spawn.z);
    entity.state.yaw = spawn.yaw;
    entity.combat.destroyed = false;
  };
  const controller = createMatchModeController({ mode, entities, seed: SEED, placement, ruleset, revive,
    setActive(entity, active) { entity.modeActive = active; }, setWeaponStage() {},
    terrainHeight: (x, z) => field.getHeightAt(x, z), ballFloorHeight: (x, z) => field.getHeightAt(x, z), emit() {} });
  controller.step(SIM_DT, SIM_DT);
  const state = controller.serialize('p0') ?? {};
  const kept = Object.fromEntries(KEEP.filter((key) => state[key] != null).map((key) => [key, state[key]]));
  // Standard places no objective of its own: its map shows the two sides' spawns
  if (mode === 'standard' && !kept.spawns) {
    const anchors = matchPlacementAnchors(field._layout.spawns);
    kept.spawns = [{ team: 'alpha', x: anchors.alpha.x, z: anchors.alpha.z }, { team: 'bravo', x: anchors.bravo.x, z: anchors.bravo.z }];
  }
  return rounded({ ...kept, id: mode, perspectiveTeam: 'alpha' });
}

const out = existsSync(outPath) && (args.maps || args.resume) ? JSON.parse(readFileSync(outPath, 'utf8')) : { maps: {} };
const write = () => {
  out.maps = Object.fromEntries(Object.entries(out.maps).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(outPath, `${JSON.stringify(out)}\n`);
};
for (const mapId of maps) {
  if (args.resume && out.maps[mapId]) continue;
  const worlds = new Map();
  const entry = { size: 0, modes: {} };
  for (const mode of MODES) {
    const variant = terrainVariantFor(mode) ?? '';
    let world = worlds.get(variant);
    if (!world) { world = createDedicatedWorldCollision(mapId, { variant: variant || undefined }); worlds.set(variant, world); }
    entry.size = world.heightField.size ?? 1024;
    try {
      entry.modes[mode] = openingState(mapId, mode, world);
    } catch (error) {
      console.warn(`[deploy-objectives] ${mapId} ${mode}: ${error?.message ?? error}`);
    }
  }
  out.maps[mapId] = entry;
  write();
  console.log(`[deploy-objectives] ${mapId}: ${Object.keys(entry.modes).join(', ')}`);
}
write();
console.log(`[deploy-objectives] wrote ${outPath} (${Object.keys(out.maps).length} maps)`);
