#!/usr/bin/env node
// Pacing trace (round 48 landing, committed 2026-09-24). Replays ONE of server/battlePacing.selftest's seeded idle-host
// 2v2 battles (the same lobby, roster and seed: 21000 + the map's index in MAP_IDS * 1000 + sample) on the dedicated
// collision world and prints what the receipt cannot: a row per interval with every hull's position, health, damage
// dealt, AI mode and target; the AI controller's debugInfo() at chosen times (mode, role, relocations, scooting,
// pressing, penDeniedT, yaw/pitch error, fire gates); and a tally of every shell result each bot's controller was
// told about (kind / zone / plate). This is how the Frosthollow ridge-flank scoots, the closed-penetration-gate
// stalemate and the stale Amberford shard were found (docs/MAP-BEAUTIFICATION.md, "Round 48 landing").
//
//   node tools/pacing-trace.mjs --map=winter --sample=1 [--step=60] [--debug-at=480,840] [--team=bravo]
//
// Pure Node (no browser, no mutex); one battle takes 3-8 s. A subset run of the receipt (COT_PACING_MAPS) uses other
// seeds — this tool reproduces the FULL receipt's seed for the named map.
import { buildPrivateMatchPlayers } from '../src/net/privateMatchHandoff.ts';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.ts';
import { MAP_IDS } from '../src/world/maps/index.ts';
import { createDedicatedWorldCollision } from '../server/dedicatedWorldCollision.ts';

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const mapId = option('map', 'verdant');
if (!MAP_IDS.includes(mapId)) { console.error(`unknown map ${mapId}; one of ${MAP_IDS.join(', ')}`); process.exit(2); }
const sample = Number(option('sample', '0'));
const stepS = Number(option('step', '60'));
const debugAt = new Set(option('debug-at', '').split(',').filter(Boolean).map(Number));
const teamFilter = option('team', '');
const matchSeed = 21000 + MAP_IDS.indexOf(mapId) * 1000 + sample;
const lobby = {
  phase: 'starting', matchSeed, mapId, teamSize: 2,
  players: [{ id: 'host', name: 'Host', specId: 'm1a2', team: 'alpha' }],
};
const match = createAuthoritativeMatch({
  players: buildPrivateMatchPlayers(lobby), mapId, seed: matchSeed, countdownS: 0,
  worldCollision: createDedicatedWorldCollision(mapId),
});
match.onMatchReady();
const entities = [...(match.entities.values?.() ?? match.entities)];
const tallies = new Map();
for (const entity of entities) {
  if (!entity.aiCtl) continue;
  const original = entity.aiCtl.notifyShellResult.bind(entity.aiCtl);
  const tally = {};
  tallies.set(entity.id, tally);
  entity.aiCtl.notifyShellResult = (...args) => {
    const hit = args[0];
    const key = hit && typeof hit === 'object'
      ? ['kind', 'zone', 'plateKind', 'shellName'].filter((k) => hit[k] != null).map((k) => `${k}=${hit[k]}`).join(' ')
      : String(hit);
    tally[key] = (tally[key] ?? 0) + 1;
    return original(...args);
  };
}
const row = (entity) => {
  const p = entity.state.pos;
  const hp = Math.round(entity.combat?.hp ?? 0);
  const ai = entity.aiCtl ? ` ${entity.aiCtl.state}->${entity.aiCtl.targetId ?? '-'}` : '';
  return `${entity.team}:${entity.specId.padEnd(14)} hp=${String(hp).padStart(4)} (${p.x.toFixed(0).padStart(4)},${p.z.toFixed(0).padStart(4)}) dmg=${String(Math.round(entity.damage ?? 0)).padStart(5)}${ai}`;
};
console.log(`pacing-trace ${mapId} sample ${sample} seed ${matchSeed}: ${entities.map((e) => `${e.team}:${e.specId}${e.bot ? '' : ' (idle host)'}`).join(', ')}`);
for (let tick = 0; tick < 15 * 60 * 60 + 2 && !match.result; tick++) {
  match.step({ dt: 1 / 60, inputs: new Map() });
  const t = tick / 60;
  if (tick > 0 && tick % (stepS * 60) === 0) console.log(`t=${t.toFixed(0).padStart(3)} | ${entities.map(row).join(' | ')}`);
  if (debugAt.has(t)) {
    for (const entity of entities) {
      if (!entity.aiCtl || (entity.combat?.hp ?? 0) <= 0) continue;
      if (teamFilter && entity.team !== teamFilter) continue;
      console.log(`  debug t=${t} ${entity.team}:${entity.specId} ${JSON.stringify(entity.aiCtl.debugInfo?.() ?? {})}`);
    }
  }
}
console.log(`END ${match.timeS.toFixed(0)}s ${match.resultReason} | ${entities.map(row).join(' | ')}`);
for (const entity of entities) {
  if (tallies.has(entity.id)) console.log(`  shells ${entity.team}:${entity.specId} ${JSON.stringify(tallies.get(entity.id))}`);
}
