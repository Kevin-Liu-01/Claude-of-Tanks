#!/usr/bin/env node
// Mode aggression harness (gameplay-modes-228 study, owner 2026-10-18: "up its aggression of tanks more" in Frontline
// Assault, "make [Endless Horde] work a lot more properly ... more enemies per round ... increase aggression", "increase
// aggression of bots trying to capture flag or pursuing ball", "make the allied/enemy tank country enforcement work
// properly"). Measurement only: it runs seeded headless matches through the real simulation and bots and reports how
// aggressively the bots play each mode, plus the roster's nation purity per team. Nothing in src changes.
//
// Engines
//   solo (default)  the solo battle exactly as the game runs it (game/state.ts createGameState → rosterState.spawnTanks →
//                   setupBattle with a random roster through soloRosterPlan / pickBattleParticipants / chooseBattleAllies →
//                   simStep at SIM_DT), on the headless collision world (server/dedicatedWorldCollision.ts, the mode's
//                   terrain variant). Two harness shims, both outside src: (1) every vehicle gets a headless visual whose
//                   gun pose is the authority's gunWorldPose maths (the solo step reads the muzzle from the visual), and
//                   (2) the player seat is driven by a createAI controller built like createBattleBot's (it stays the
//                   human seat for the mode controller: isPlayer, bot=false), so wave modes keep their human-alive rule.
//                   The player seat is reported apart and left out of every per-bot aggregate.
//   authority       the network authority (sim/authoritativeMatch.ts) with every seat a bot, seated from the same solo
//                   roster plan; seat h1 (the player's vehicle) reads as human only while the mode controller steps
//                   (the tools/mode-balance-probe.mjs shim), in every mode.
//
// Commands
//   node tools/mode-aggression-harness.mjs run --mode=frontline_assault --seed=3 [--engine=solo|authority] [--map=ID]
//        [--capS=N] [--arrangement='{json}'] [--difficulty=normal] [--player=specId]          one JSON line on stdout
//   node tools/mode-aggression-harness.mjs batch --modes=standard,frontline_assault,endless_horde,capture_the_flag,turbo_ball
//        --seeds=1-8 --jobs=6 --out=DIR [--engine=solo] [--wallS=3600] [run options]       one capped child per run,
//                                                                                       DIR/runs/<mode>.<seed>.json
//   node tools/mode-aggression-harness.mjs roster --modes=... --seeds=1-32 --out=DIR      roster nation census, no sim:
//        each mode x arrangement (default, sameNation, enemyNation, both; opt-in mono, random via --arrangements=) x seed
//        through the real setupBattle, plus the multiplayer room plans (--mp=mp1,mp2: roomPolicy.planStart seated by the
//        authority; one human on alpha, or one human a side)
//   node tools/mode-aggression-harness.mjs report --dir=DIR                                DIR/report.json + DIR/report.md
//   --teamSurvival (endless_horde only): the overrun waits for the whole alpha team, not just the player seat
//   --playerSeat=fight|shield|park (solo engine): fight (default) = the createAI-driven player seat, mortal, as above;
//        shield = the same seat but it cannot be destroyed (hull, crew and modules restored every step), so a wave
//        mode's human-alive rule never ends the match and the clock or the mode's own verdict does; park = shielded
//        and passive at its spawn (no controller: it neither drives nor fires), so every push and every kill on the
//        player's side is the allied bots'. Frontline Assault ends when the player seat dies (~100 s with the fight
//        seat), so its push and zone metrics read best with park or shield. In Frontline the fight seat routes to the
//        attack's objective point (the live sector) and follows the line, like a human attacker (gameplay-modes-228).
//
// Maps: --map pins one; otherwise seed s plays MAP_ROTATION[(s - 1) % 8] (Redrock = badlands and Steinburg = urban are
// in it), so an A/B pair on the same seeds plays the same maps. The clock cap is the ruleset's own clock (+5 s), or
// --capS (default 900 s for clockless modes such as Endless Horde). Determinism: every random draw is seeded (the game's
// own seeds, the roster seed = the run seed, the battle ordinal = the run seed); no wall clock enters the simulation.
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const ROOT = new URL('../', import.meta.url);
const argv = process.argv.slice(2);
const command = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'run';
const arg = (name, fallback) => {
  const hit = argv.find((entry) => entry.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs) => {
  const s = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};
const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(d));
const DEFAULT_MODES = ['standard', 'frontline_assault', 'endless_horde', 'capture_the_flag', 'turbo_ball', 'infected', 'juggernaut'];
const MAP_ROTATION = ['verdant', 'badlands', 'urban', 'desert', 'winter', 'autumn', 'steppe', 'coastal'];
const SAMPLE_TICKS = 30; // 0.5 s at SIM_DT
const MOVE_EPS_MPS = 0.75;

function parseSeeds(text) {
  const out = [];
  for (const part of String(text).split(',')) {
    const [a, b] = part.split('-').map(Number);
    if (Number.isFinite(a)) for (let s = a; s <= (Number.isFinite(b) ? b : a); s++) out.push(s);
  }
  return out;
}
function mulberry(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------------------------------------- batch (parent) ---
if (command === 'batch') {
  const modes = (arg('modes', DEFAULT_MODES.join(','))).split(',').filter(Boolean);
  const seeds = parseSeeds(arg('seeds', '1-8'));
  const jobs = Math.max(1, Number(arg('jobs', 4)));
  const out = arg('out', '.');
  const capWallS = Number(arg('wallS', 3600));
  mkdirSync(`${out}/runs`, { recursive: true });
  const passThrough = argv.slice(1).filter((entry) => !/^--(modes|seeds|jobs|out|wallS|skipDone)=/.test(entry) && entry !== '--skipDone');
  const skipDone = argv.includes('--skipDone');
  // longest runs first so the tail of the batch is short
  const weight = { standard: 900, capture_the_flag: 900, endless_horde: 900, frontline_assault: 720, turbo_ball: 600, juggernaut: 600, infected: 420 };
  const queue = [];
  for (const mode of modes) for (const seed of seeds) queue.push({ mode, seed });
  queue.sort((a, b) => (weight[b.mode] ?? 600) - (weight[a.mode] ?? 600) || a.seed - b.seed);
  const pending = queue.filter(({ mode, seed }) => !(skipDone && existsSync(`${out}/runs/${mode}.${seed}.json`)));
  const started = Date.now();
  const total = pending.length;
  let done = 0;
  const runOne = ({ mode, seed }) => new Promise((resolve) => {
    const child = spawn('nice', ['-n', '10', process.execPath, '--max-old-space-size=4096', SELF, 'run', ...passThrough, `--mode=${mode}`, `--seed=${seed}`],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; if (stderr.length > 200000) stderr = stderr.slice(-100000); });
    const timer = setTimeout(() => child.kill('SIGKILL'), capWallS * 1000);
    child.on('close', (code) => {
      clearTimeout(timer);
      const line = stdout.trim().split('\n').pop() || '';
      done++;
      if (code === 0 && line.startsWith('{')) writeFileSync(`${out}/runs/${mode}.${seed}.json`, `${line}\n`);
      else writeFileSync(`${out}/runs/${mode}.${seed}.err`, `exit ${code}\n${stderr.slice(-20000)}`);
      console.log(`[${new Date().toISOString()}] ${done}/${total} ${mode}.${seed} exit ${code} (${Math.round((Date.now() - started) / 1000)} s)`);
      resolve();
    });
  });
  await Promise.all(Array.from({ length: Math.min(jobs, pending.length) }, async () => {
    while (pending.length) await runOne(pending.shift());
  }));
  process.exit(0);
}

// ------------------------------------------------------------------------------------------------ report (parent) ---
if (command === 'report') {
  const dir = arg('dir', '.');
  const rows = readdirSync(`${dir}/runs`).filter((f) => f.endsWith('.json'))
    .map((f) => { try { return JSON.parse(readFileSync(`${dir}/runs/${f}`, 'utf8')); } catch { return null; } }).filter(Boolean);
  const errors = readdirSync(`${dir}/runs`).filter((f) => f.endsWith('.err'));
  const byMode = new Map();
  for (const row of rows) { if (!byMode.has(row.mode)) byMode.set(row.mode, []); byMode.get(row.mode).push(row); }
  const report = { tool: 'tools/mode-aggression-harness.mjs', dir, generated: new Date().toISOString(), errors, modes: {} };
  for (const [mode, list] of byMode) report.modes[mode] = aggregateMode(mode, list.sort((a, b) => a.seed - b.seed));
  const rosterPath = `${dir}/roster.json`;
  if (existsSync(rosterPath)) report.roster = JSON.parse(readFileSync(rosterPath, 'utf8')).summary;
  writeFileSync(`${dir}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(`${dir}/report.md`, reportMarkdown(report));
  console.log(`report: ${rows.length} runs, ${errors.length} errors -> ${dir}/report.json, ${dir}/report.md`);
  process.exit(0);
}

// ----------------------------------------------------------------------------------------------- compare (parent) ---
// compare --base=DIR --dir=DIR --targets=FILE: every target row reads one field (a dot path) of the after report
// (DIR/<sub>/report.json, the mode's aggregate or the roster census row) and the same field of the base, prints
// before -> after and PASS / MISS, and exits 1 on any miss. Ops: <= >= < > == between [lo, hi], equalsBase (the
// field, or the whole mode aggregate minus `ignore`, equals the base's), and the named checks in COMPARE_CHECKS.
if (command === 'compare') {
  const baseDir = arg('base', null), dir = arg('dir', '.'), targetsPath = arg('targets', 'tools/mode-aggression-targets.json');
  const only = arg('only', null);
  const spec = JSON.parse(readFileSync(targetsPath, 'utf8'));
  const loaded = new Map();
  const load = (root, sub) => {
    if (!root) return null;
    const path = sub ? `${root}/${sub}/report.json` : `${root}/report.json`;
    if (!loaded.has(path)) { try { loaded.set(path, JSON.parse(readFileSync(path, 'utf8'))); } catch { loaded.set(path, null); } }
    return loaded.get(path);
  };
  const dig = (object, path) => (path ? String(path).split('.') : []).reduce((o, k) => (o == null ? undefined : o[k]), object);
  const strip = (value, ignore) => JSON.parse(JSON.stringify(value, (k, v) => (ignore.includes(k) ? undefined : v)));
  const scope = (report, t) => {
    if (!report) return undefined;
    if (t.roster) return report.roster?.[t.mode]?.[t.arrangement];
    if (t.mode) return report.modes?.[t.mode];
    return report;
  };
  const COMPARE_CHECKS = {
    // engaged-and-standing-still: the Horde's zombies <= the infected <= every other side in the batch
    engagedStillRanking(report) {
      const modes = report?.modes ?? {};
      const zombies = modes.endless_horde?.bravo?.engagedStillShare, infected = modes.infected?.bravo?.engagedStillShare;
      if (zombies == null || infected == null) return { value: null, pass: false };
      const others = [];
      for (const [name, a] of Object.entries(modes)) for (const team of ['alpha', 'bravo']) {
        if ((name === 'endless_horde' || name === 'infected') && team === 'bravo') continue;
        if (a[team]?.engagedStillShare != null && a[team].n !== 0) others.push(a[team].engagedStillShare);
      }
      return { value: `${zombies} <= ${infected} <= min(${others.length ? Math.min(...others) : '—'})`, pass: zombies <= infected && others.every((x) => infected <= x) };
    },
    // the Horde's wave law: every cleared wave fielded exactly what the ruleset's law says
    hordeLaw(report) {
      const law = report?.modes?.endless_horde?.horde?.law;
      if (!law) return { value: null, pass: false };
      return { value: `${law.clearedOnLaw}/${law.cleared} cleared waves on the law; arrivals ${JSON.stringify(law.arrivalsPerWave.slice(0, 12))}`, pass: law.cleared > 0 && law.clearedOnLaw === law.cleared };
    },
  };
  let misses = 0, rows = 0;
  for (const t of spec.targets) {
    if (only && !t.id.startsWith(only)) continue;
    rows++;
    const after = load(dir, t.dir), before = load(baseDir, t.baseDir ?? t.dir);
    let a, b, pass;
    if (t.op === 'check') {
      const res = COMPARE_CHECKS[t.check](after);
      a = res.value; b = before ? COMPARE_CHECKS[t.check](before).value : null; pass = res.pass;
    } else if (t.op === 'equalsBase') {
      const ignore = t.ignore ?? ['wallMs', 'generated', 'dir'];
      a = dig(scope(after, t), t.path); b = dig(scope(before, t), t.path);
      pass = a !== undefined && b !== undefined && JSON.stringify(strip(a, ignore)) === JSON.stringify(strip(b, ignore));
      a = pass ? 'identical' : (a === undefined ? 'missing' : 'differs'); b = b === undefined ? 'missing' : 'base';
    } else {
      a = dig(scope(after, t), t.path); b = dig(scope(before, t), t.path);
      const v = t.value;
      const num = typeof a === 'number' ? a : (a == null ? NaN : Number(a));
      pass = a != null && Number.isFinite(num) && (
        t.op === '<=' ? num <= v : t.op === '>=' ? num >= v : t.op === '<' ? num < v : t.op === '>' ? num > v
          : t.op === '==' ? num === v : t.op === 'between' ? num >= v[0] && num <= v[1] : false);
      if (t.op === 'deepEquals') pass = JSON.stringify(a) === JSON.stringify(v);
    }
    if (!pass && t.optional) { console.log(`skip ${t.id}: ${JSON.stringify(b)} -> ${JSON.stringify(a)} (optional) ${t.note ?? ''}`); continue; }
    if (!pass) misses++;
    console.log(`${pass ? 'PASS' : 'MISS'} ${t.id}: ${JSON.stringify(b ?? null)} -> ${JSON.stringify(a ?? null)}  (want ${t.op}${t.value === undefined ? '' : ` ${JSON.stringify(t.value)}`})${t.note ? `  ${t.note}` : ''}`);
  }
  console.log(`compare: ${rows - misses}/${rows} targets met${misses ? `, ${misses} missed` : ''}`);
  process.exit(misses ? 1 : 0);
}

// ---------------------------------------------------------------------------------- simulation modules (children) ---
const { ensureFullFleet } = await import(new URL('src/vehicles/fleetFactory.ts', ROOT).href);
const { createGameState, setupBattle, simStep, createCollider, createBus } = await import(new URL('src/game/state.ts', ROOT).href);
const { spawnTanks } = await import(new URL('src/game/rosterState.ts', ROOT).href);
const { createDedicatedWorldCollision } = await import(new URL('server/dedicatedWorldCollision.ts', ROOT).href);
const { matchRulesetFor, terrainVariantFor, isWaveMode } = await import(new URL('src/sim/matchRuleset.ts', ROOT).href);
const { createAI, roleOf } = await import(new URL('src/game/ai.ts', ROOT).href);
const { planBotRoute } = await import(new URL('src/sim/botRoutePlanner.ts', ROOT).href);
const { SIM_DT } = await import(new URL('src/sim/movement.ts', ROOT).href);
const { getSpec, PRODUCTION_TANK_IDS } = await import(new URL('src/vehicles/specs.ts', ROOT).href);
const { isBotTankId } = await import(new URL('src/game/matchmaking.ts', ROOT).href);
const { canSelfRightTank, requestTankSelfRight } = await import(new URL('src/sim/rollover.ts', ROOT).href);
const { totalAmmunition } = await import(new URL('src/sim/ammunition.ts', ROOT).href);
const { usesLauncherMuzzles, launcherMuzzleIndex } = await import(new URL('src/sim/launcherPolicy.ts', ROOT).href);
const { ENEMY_NATION_OPTIONS } = await import(new URL('src/game/teamArrangement.ts', ROOT).href);
const { createAuthoritativeMatch } = await import(new URL('src/sim/authoritativeMatch.ts', ROOT).href);
// optional on older trees (the integ/228 baseline has neither): the Horde's wave-total law and the matchmaking era bands
const RULESET_MODULE = await import(new URL('src/sim/matchRuleset.ts', ROOT).href);
const { ERA_NEIGHBOURS } = await import(new URL('src/game/matchmaking.ts', ROOT).href);
const { vehicleEraForId } = await import(new URL('src/vehicles/taxonomy.ts', ROOT).href);
const THREE = await import('three');
await ensureFullFleet();

const nationKey = (nation) => {
  const raw = String(nation ?? '');
  return ENEMY_NATION_OPTIONS.find((option) => option.specNations.includes(raw))?.id ?? (raw.toLowerCase() || 'unknown');
};
const normTeam = (team) => (team === 'player' || team === 'alpha' ? 'alpha' : 'bravo');
const hullOf = (spec) => Number(spec?.hp) || 1;

/** The authority's gunWorldPose (sim/authoritativeMatch.ts), for the headless visual the solo step reads its muzzle from. */
const _euler = new THREE.Euler(), _quat = new THREE.Quaternion(), _unit = new THREE.Vector3(), _hull = new THREE.Matrix4();
const _local = new THREE.Matrix4(), _turret = new THREE.Matrix4(), _gunDir = new THREE.Vector3(), _muzzle = new THREE.Vector3();
function gunPose(entity, launcher, index) {
  const state = entity.state;
  const armor = entity.spec.armor || {};
  const turretPivot = armor.turretPivot || [0, entity.spec.dims.heightM * 0.7, 0];
  const gunPivot = armor.gunPivot || [0, entity.spec.dims.heightM * 0.15, 0];
  const barrelM = Math.max(0.5, Number.isFinite(armor.gunBarrel?.lengthM) ? armor.gunBarrel.lengthM : 3);
  _euler.set(-(state.visualPitch || 0), state.yaw, state.visualRoll || 0, 'YXZ');
  _quat.setFromEuler(_euler);
  _unit.setScalar(state.modeScale ?? 1);
  _hull.compose(state.pos, _quat, _unit);
  _local.makeRotationY(state.turretYaw || 0);
  _local.setPosition(turretPivot[0], turretPivot[1], turretPivot[2]);
  _turret.multiplyMatrices(_hull, _local);
  const sinPitch = Math.sin(state.gunPitch || 0), cosPitch = Math.cos(state.gunPitch || 0);
  _gunDir.set(0, sinPitch, cosPitch).transformDirection(_turret).normalize();
  _muzzle.set(gunPivot[0], gunPivot[1], gunPivot[2]).applyMatrix4(_turret).addScaledVector(_gunDir, barrelM * (state.modeScale ?? 1));
  const launchers = launcher ? entity.spec.gun.launcherMuzzles : null;
  const tip = launchers?.length ? launchers[Math.max(0, Math.min(launchers.length - 1, index ?? 0))] : null;
  if (tip) {
    _muzzle.set(tip.x, tip.y, tip.z);
    const mouthPitch = tip.pitch ?? 0, mouthYaw = tip.yaw ?? 0;
    _gunDir.set(Math.sin(mouthYaw) * Math.cos(mouthPitch), Math.sin(mouthPitch), Math.cos(mouthYaw) * Math.cos(mouthPitch));
    if (tip.frame !== 'turret') {
      _muzzle.set(gunPivot[0] + tip.x, gunPivot[1] + tip.y * cosPitch + tip.z * sinPitch, gunPivot[2] - tip.y * sinPitch + tip.z * cosPitch);
      const dy = _gunDir.y, dz = _gunDir.z;
      _gunDir.y = dy * cosPitch + dz * sinPitch;
      _gunDir.z = -dy * sinPitch + dz * cosPitch;
    }
    _muzzle.applyMatrix4(_turret);
    _gunDir.transformDirection(_turret);
  }
}
function headlessVisual(entity) {
  return {
    // aircraftOnly: an AC-130 battle keeps this visual for its gunship seat instead of building the aircraft model
    root: { userData: { aircraftOnly: true } }, contactGeom: null,
    setVisible() {}, syncFromState() {}, dispose() {}, recoilKick() {}, setDestroyed() {}, resetDestroyed() {},
    gunMuzzleWorld(out, index, launcher) { gunPose(entity, launcher, index); out.copy(_muzzle); return out; },
    gunDirWorld(out, index, launcher) { gunPose(entity, launcher, index); out.copy(_gunDir); return out; },
    gunPivotWorld(out) { gunPose(entity, false, 0); out.copy(_muzzle); return out; },
  };
}

function worldFor(mapId, mode) {
  const world = createDedicatedWorldCollision(mapId, { retain: true, variant: terrainVariantFor(mode) });
  const authored = world.heightField._layout.spawns;
  const at = (p) => ({ pos: [p.x, world.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
  world.spawnPoints = { player: at(authored.player), enemies: authored.enemies.map(at) };
  return world;
}

function playerSpecFor(seed) {
  const pinned = arg('player', null);
  if (pinned) return pinned;
  const pool = PRODUCTION_TANK_IDS.filter((id) => { const s = getSpec(id); return isBotTankId(id) && s && !s.aerial && s.gun?.shells?.length; });
  return pool[Math.floor(mulberry(seed * 7919 + 13)() * pool.length)];
}

/** One solo battle set up exactly as the game does (random roster, the mode's ruleset and arrangement). */
function setupSolo({ mode, seed, mapId, arrangement, world, deferOpeningRoutes }) {
  const game = createGameState({ rosterSeed: seed });
  game.mapId = mapId;
  spawnTanks(game, { scene: { remove() {} } });
  for (const entity of game.allTanks) entity.visual = headlessVisual(entity);
  game.battleCount = seed;
  const playerSpecId = playerSpecFor(seed);
  setupBattle(game, playerSpecId, world, {
    gameMode: mode, random: true, arrangement, brain: null,
    deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes,
  });
  for (const entity of game.tanks) if (!entity.visual) entity.visual = headlessVisual(entity);
  return { game, playerSpecId };
}

/** Seats outside the player's era band (the player's era plus its matchmaking neighbours), and repeated vehicles per side. */
function rosterShape(seats, playerSpecId) {
  const playerEra = vehicleEraForId(playerSpecId);
  const band = playerEra ? (ERA_NEIGHBOURS[playerEra] ?? [playerEra]) : null;
  let farEra = 0;
  const repeats = { alpha: 0, bravo: 0 };
  const seen = { alpha: new Set(), bravo: new Set() };
  for (const s of seats) {
    if (s.human) { seen[s.team].add(s.specId); continue; }
    const era = vehicleEraForId(s.specId);
    if (band && era && !band.includes(era)) farEra++;
    if (seen[s.team].has(s.specId)) repeats[s.team]++;
    seen[s.team].add(s.specId);
  }
  return { farEraSeats: farEra, repeatSeats: repeats };
}

/**
 * TEAM NATIONS (gameplay-modes-228): a side is pure when it holds its primary country plus only the fill countries its
 * plan's notes name. `plan` is the battle's own record (game.teamNations on the 228 tree; absent on older trees).
 */
function nationPlanCheck(seats, plan) {
  if (!plan) return null;
  const allowed = (side) => {
    const set = new Set();
    const primary = side === 'alpha' ? plan.allied : plan.enemy;
    if (primary) set.add(primary);
    for (const note of plan.notes ?? []) if (note.side === side && note.country) set.add(note.country);
    return set;
  };
  const out = {};
  for (const side of ['alpha', 'bravo']) {
    const ok = allowed(side);
    const list = seats.filter((s) => s.team === side && !s.human);
    const outside = list.filter((s) => !ok.has(s.nation)).length;
    out[side] = { primary: side === 'alpha' ? plan.allied : plan.enemy, seats: list.length, outsidePlan: outside,
      primaryShare: list.length ? round(list.filter((s) => s.nation === (side === 'alpha' ? plan.allied : plan.enemy)).length / list.length, 3) : null };
  }
  out.teamNations = plan.teamNations ?? null;
  out.notes = (plan.notes ?? []).map((n) => `${n.side}:${n.country}+${n.count}:${n.reason}`);
  return out;
}

function rosterPurity(seats) {
  // seats: [{ team: 'alpha'|'bravo', nation, human }]
  const side = (team, includeHuman) => seats.filter((s) => s.team === team && (includeHuman || !s.human));
  const stats = (list, playerNation) => {
    const counts = {};
    for (const s of list) counts[s.nation] = (counts[s.nation] ?? 0) + 1;
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return {
      n: list.length, distinct: entries.length, modal: entries[0]?.[0] ?? null,
      modalShare: list.length ? round(entries[0][1] / list.length, 3) : null,
      ...(playerNation ? { playerNationShare: list.length ? round(list.filter((s) => s.nation === playerNation).length / list.length, 3) : null } : {}),
      nations: Object.fromEntries(entries),
    };
  };
  const human = seats.find((s) => s.human);
  const allies = side('alpha', false), enemies = side('bravo', true);
  // nations fielded on both sides (the player's own vehicle counts on the allied side)
  const shared = [...new Set(side('alpha', true).map((s) => s.nation))].filter((n) => enemies.some((e) => e.nation === n));
  const enemyShare = (nation) => enemies.length ? enemies.filter((e) => e.nation === nation).length / enemies.length : 0;
  return {
    playerNation: human?.nation ?? null,
    allies: stats(allies, human?.nation ?? null),
    enemies: stats(enemies, null),
    sharedNations: shared.length,
    enemiesOfPlayerNation: human ? round(enemyShare(human.nation), 3) : null,
  };
}

const ARRANGEMENTS = {
  default: () => null,
  sameNation: () => ({ alliedNation: 'player' }),
  enemyNation: (seed, playerNation) => ({ enemyNation: pickEnemyNation(seed, playerNation) }),
  both: (seed, playerNation) => ({ alliedNation: 'player', enemyNation: pickEnemyNation(seed, playerNation) }),
  // the TEAM NATIONS option the 228 lane adds (study-country 3.1 names it `teamNations: 'mono' | 'random'`; adjust the
  // field if the lane names it otherwise). Opt-in rows (--arrangements=default,mono,random): on integ/228 the field is
  // unknown and both read as default
  mono: () => ({ teamNations: 'mono' }),
  random: () => ({ teamNations: 'random' }),
};
const DEFAULT_ARRANGEMENTS = ['default', 'sameNation', 'enemyNation', 'both'];
function pickEnemyNation(seed, playerNation) {
  // the nations the fleet can field in numbers (at least seven production vehicles), never the player's own
  const counts = ENEMY_NATION_OPTIONS.map((o) => ({ id: o.id, n: PRODUCTION_TANK_IDS.filter((id) => isBotTankId(id) && o.specNations.includes(String(getSpec(id)?.nation ?? ''))).length }))
    .filter((o) => o.n >= 7 && o.id !== playerNation);
  return counts[Math.floor(mulberry(seed * 104729 + 7)() * counts.length)].id;
}

const { createRoom, joinRoom, planStart, isCoopGameMode } = await import(new URL('src/mp/room/roomPolicy.ts', ROOT).href);
const { planFromRoom } = await import(new URL('src/mp/host/hostPlan.ts', ROOT).href);
/** One multiplayer roster: a private room (one human on alpha, or one a side), every seat ready, the room's start plan,
 *  then the authority's own seating (co-op hostiles, asymmetric roles), read back from its entities. The p2p host's
 *  own derivation (hostPlan.planFromRoom, the room snapshot and the match seed) must name the same bot vehicles. */
function mpRoster({ mode, seed, mapId, world, humans, arrangement = null }) {
  const picks = [playerSpecFor(seed), playerSpecFor(seed + 1000)];
  const room = createRoom({ roomCode: 'HARN01', mode: 'private', creator: { id: 'p1', name: 'P1' }, selection: { specId: picks[0] }, settings: { gameMode: mode, mapId }, now: 0 });
  if (humans > 1 && !isCoopGameMode(mode)) joinRoom(room, { player: { id: 'p2', name: 'P2' }, selection: { specId: picks[1] }, team: 'bravo', now: 0 });
  if (arrangement) room.settings.arrangement = { ...(room.settings.arrangement ?? {}), ...arrangement };
  for (const player of room.players) player.ready = true;
  const snapshot = JSON.parse(JSON.stringify(room));
  const plan = planStart(room, { seed, now: 1 });
  let hostBots = null;
  try { hostBots = planFromRoom(snapshot, { seed: plan.seed }).bots.map((b) => `${b.team}:${b.specId}`); } catch (error) { hostBots = [`error:${error?.message ?? error}`]; }
  const roomBots = plan.bots.map((b) => `${b.team}:${b.specId}`);
  const parity = JSON.stringify(roomBots) === JSON.stringify(hostBots);
  const seated = { alphaBots: plan.bots.filter((b) => b.team === 'alpha').length, bravoBots: plan.bots.filter((b) => b.team === 'bravo').length,
    distinctBotSpecs: { alpha: new Set(plan.bots.filter((b) => b.team === 'alpha').map((b) => b.specId)).size, bravo: new Set(plan.bots.filter((b) => b.team === 'bravo').map((b) => b.specId)).size },
    botsCloneHost: plan.bots.length > 0 && plan.bots.every((b) => b.specId === picks[0]) };
  const players = [
    ...plan.seats.filter((seat) => seat.team !== 'spectator').map((seat) => ({ id: seat.playerId, specId: seat.specId, team: seat.team })),
    ...plan.bots.map((bot) => ({ id: bot.playerId, specId: bot.specId, team: bot.team, bot: true, difficulty: 'normal' })),
  ];
  let entities = null;
  try {
    const match = createAuthoritativeMatch({ players, mapId, seed, countdownS: 0, gameMode: mode, worldCollision: world,
      ruleset: matchRulesetFor(mode, null, room.settings.arrangement ?? null) });
    entities = match.entities.map((e) => ({ team: normTeam(e.team), nation: nationKey(e.spec?.nation), human: e.id === 'p1' || e.id === 'p2', specId: e.specId }));
  } catch (error) {
    entities = players.map((p) => ({ team: normTeam(p.team), nation: nationKey(getSpec(p.specId)?.nation), human: !p.bot, specId: p.specId, planOnly: String(error?.message ?? error) }));
  }
  // the first human leads: rosterPurity reads the player's nation from the first human seat
  entities.sort((a, b) => Number(b.human && b.specId === picks[0]) - Number(a.human && a.specId === picks[0]));
  return { seats: entities, picks, seated, parity, plan: plan.teamNations ?? null };
}

// ------------------------------------------------------------------------------------------- roster census (child) ---
if (command === 'roster') {
  const modes = (arg('modes', DEFAULT_MODES.join(','))).split(',').filter(Boolean);
  const seeds = parseSeeds(arg('seeds', '1-32'));
  const out = arg('out', '.');
  const which = arg('arrangements', DEFAULT_ARRANGEMENTS.join(',')).split(',').filter((name) => ARRANGEMENTS[name]);
  const mpVariants = arg('mp', 'mp1,mp2').split(',').filter((name) => name === 'mp1' || name === 'mp2' || name === 'coop');
  const rows = [];
  const worlds = new Map();
  for (const mode of modes) {
    for (const seed of seeds) {
      const mapId = arg('map', MAP_ROTATION[(seed - 1) % MAP_ROTATION.length]);
      const key = `${mapId}@${terrainVariantFor(mode) ?? ''}`;
      if (!worlds.has(key)) worlds.set(key, worldFor(mapId, mode));
      const world = worlds.get(key);
      const playerNation = nationKey(getSpec(playerSpecFor(seed))?.nation);
      // multiplayer: the room's start plan (roomPolicy.planStart: bots fill a side with its humans' most common pick, the
      // co-op and asymmetric modes left to arrangeModeRoster and the authority), seated by the network authority
      for (const variant of mpVariants) {
        // the co-op row is one human in a co-operative mode (Horde, Frontline): what the room seats around them
        if (variant === 'coop' && !isCoopGameMode(mode)) continue;
        const { seats, picks, seated, parity, plan } = mpRoster({ mode, seed, mapId, world, humans: variant === 'mp2' ? 2 : 1 });
        rows.push({ mode, seed, mapId, arrangement: variant, arranged: null, playerSpecId: picks[0], ...rosterPurity(seats),
          ...rosterShape(seats, picks[0]), seated, hostParity: parity, nationPlan: nationPlanCheck(seats, plan),
          playerPickKept: seats.some((s) => s.human && s.specId === picks[0]),
          roster: { alpha: seats.filter((s) => s.team === 'alpha').map((s) => `${s.specId}:${s.nation}${s.human ? '*' : ''}`), bravo: seats.filter((s) => s.team === 'bravo').map((s) => `${s.specId}:${s.nation}${s.human ? '*' : ''}`) } });
      }
      for (const name of which) {
        const arrangement = ARRANGEMENTS[name](seed, playerNation);
        const { game, playerSpecId } = setupSolo({ mode, seed, mapId, arrangement, world, deferOpeningRoutes: true });
        const seats = game.tanks.map((e) => ({ team: normTeam(e.team), nation: nationKey(e.spec.nation), human: !!e.isPlayer, specId: e.specId }));
        rows.push({ mode, seed, mapId, arrangement: name, arranged: arrangement, playerSpecId, ...rosterPurity(seats),
          ...rosterShape(seats, playerSpecId), nationPlan: nationPlanCheck(seats, game.teamNations ?? null),
          playerPickKept: game.player?.specId === playerSpecId,
          roster: { alpha: seats.filter((s) => s.team === 'alpha').map((s) => `${s.specId}:${s.nation}${s.human ? '*' : ''}`), bravo: seats.filter((s) => s.team === 'bravo').map((s) => `${s.specId}:${s.nation}`) } });
      }
    }
  }
  const summary = {};
  for (const mode of modes) {
    summary[mode] = {};
    for (const name of [...mpVariants, ...which]) {
      const list = rows.filter((r) => r.mode === mode && r.arrangement === name);
      if (!list.length) continue;
      summary[mode][name] = {
        runs: list.length,
        allies: { distinct: round(mean(list.map((r) => r.allies.distinct)), 2), modalShare: round(mean(list.map((r) => r.allies.modalShare)), 3),
          playerNationShare: round(mean(list.map((r) => r.allies.playerNationShare ?? 0)), 3),
          pureRuns: list.filter((r) => r.allies.n === 0 || r.allies.distinct === 1).length,
          playerNationPureRuns: list.filter((r) => r.allies.n === 0 || r.allies.playerNationShare === 1).length },
        enemies: { distinct: round(mean(list.map((r) => r.enemies.distinct)), 2), modalShare: round(mean(list.map((r) => r.enemies.modalShare)), 3),
          pureRuns: list.filter((r) => r.enemies.distinct === 1).length,
          arrangedNationShare: list[0].arranged?.enemyNation ? round(mean(list.map((r) => (r.enemies.nations[r.arranged.enemyNation] ?? 0) / Math.max(1, r.enemies.n))), 3) : null },
        sharedNations: round(mean(list.map((r) => r.sharedNations)), 2),
        sharedRuns: list.filter((r) => r.sharedNations > 0).length,
        enemiesOfPlayerNation: round(mean(list.map((r) => r.enemiesOfPlayerNation ?? 0)), 3),
        enemyHoldsPlayerNationRuns: list.filter((r) => (r.enemiesOfPlayerNation ?? 0) > 0).length,
        playerPickKeptRuns: list.filter((r) => r.playerPickKept).length,
        farEraSeats: list.reduce((s, r) => s + (r.farEraSeats ?? 0), 0),
        farEraRuns: list.filter((r) => (r.farEraSeats ?? 0) > 0).length,
        repeatSeats: list.reduce((s, r) => s + (r.repeatSeats?.alpha ?? 0) + (r.repeatSeats?.bravo ?? 0), 0),
        // TEAM NATIONS: seats outside the side's primary country and its listed fills (0 = every seat accounted for)
        planned: list.some((r) => r.nationPlan) ? {
          runs: list.filter((r) => r.nationPlan).length,
          outsidePlanSeats: list.reduce((s, r) => s + (r.nationPlan ? r.nationPlan.alpha.outsidePlan + r.nationPlan.bravo.outsidePlan : 0), 0),
          pureAllies: list.filter((r) => r.nationPlan && r.nationPlan.alpha.outsidePlan === 0 && !(r.nationPlan.notes ?? []).some((n) => n.startsWith('alpha:'))).length,
          pureEnemies: list.filter((r) => r.nationPlan && r.nationPlan.bravo.outsidePlan === 0 && !(r.nationPlan.notes ?? []).some((n) => n.startsWith('bravo:'))).length,
          withFillNotes: list.filter((r) => r.nationPlan?.notes?.length).length,
        } : null,
        ...(list.some((r) => r.seated) ? { seated: {
          alphaBots: round(mean(list.map((r) => r.seated?.alphaBots ?? 0)), 2), bravoBots: round(mean(list.map((r) => r.seated?.bravoBots ?? 0)), 2),
          distinctAlpha: round(mean(list.map((r) => r.seated?.distinctBotSpecs?.alpha ?? 0)), 2), distinctBravo: round(mean(list.map((r) => r.seated?.distinctBotSpecs?.bravo ?? 0)), 2),
          botsCloneHostRuns: list.filter((r) => r.seated?.botsCloneHost).length,
          hostParityRuns: list.filter((r) => r.hostParity).length,
        } } : {}),
      };
    }
  }
  for (const world of worlds.values()) world.release?.();
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/roster.json`, `${JSON.stringify({ tool: 'tools/mode-aggression-harness.mjs roster', seeds, modes, arrangements: which, summary, rows }, null, 1)}\n`);
  console.log(JSON.stringify(summary));
  process.exit(0);
}

// ------------------------------------------------------------------------------------------------- one run (child) ---
const mode = arg('mode', 'standard');
const seed = Number(arg('seed', 1));
const engine = arg('engine', 'solo');
const mapId = arg('map', MAP_ROTATION[(seed - 1) % MAP_ROTATION.length]);
const difficulty = arg('difficulty', 'normal');
const arrangement = arg('arrangement', null) ? JSON.parse(arg('arrangement')) : null;
const rules = matchRulesetFor(mode, null, arrangement);
const capS = Number(arg('capS', (rules.timeLimitS ?? 900) + 5));
// --teamSurvival (Endless Horde only): every alpha seat reads as human while the mode controller steps, so the overrun
// comes when the whole team is down instead of when the harness-driven player seat dies (a measurement shim, as the
// authority engine's h1 shim; it would change Frontline's regroup gate, so it is refused there)
const teamSurvival = argv.includes('--teamSurvival');
if (teamSurvival && mode !== 'endless_horde') throw new Error('--teamSurvival applies to endless_horde only');
const playerSeat = arg('playerSeat', 'fight');
if (!['fight', 'shield', 'park'].includes(playerSeat)) throw new Error(`--playerSeat must be fight, shield or park (got ${playerSeat})`);
if (playerSeat !== 'fight' && engine !== 'solo') throw new Error('--playerSeat=shield|park needs the solo engine');
const wallStarted = performance.now();
const world = worldFor(mapId, mode);

// --- the engine adapters: entities, the mode controller, the step, the result, and normalized events ---------------
const recorded = [];
let recorderErrors = 0;
let adapter;
if (engine === 'solo') {
  const { game, playerSpecId } = setupSolo({ mode, seed, mapId, arrangement, world, deferOpeningRoutes: false });
  const bus = createBus((name, payload) => {
    try {
      if (name === 'shell:fired') recorded.push({ kind: 'fired', shooterId: payload.shooterId });
      else if (name === 'shell:hit') recorded.push({ kind: 'hit', attackerId: payload.attackerId, targetId: payload.targetId, damage: payload.damage || 0 });
      else if (name === 'tank:destroyed') recorded.push({ kind: 'destroyed', id: payload.id, killerId: payload.killerId ?? null, cause: payload.cause });
      else if (name === 'tank:spotted') recorded.push({ kind: 'spotted', id: payload.id, team: payload.team });
      else if (name === 'tank:ram') recorded.push({ kind: 'ram', aId: payload.aId ?? null, bId: payload.bId ?? null });
      else if (name.startsWith('mode:')) recorded.push({ kind: 'mode', type: name.slice(5), payload: { ...payload } });
    } catch { recorderErrors++; }
  });
  const collider = createCollider(game, world);
  // the player seat: a createAI controller like createBattleBot's, still the human seat for the mode controller
  const player = game.tanks[0];
  const enemyScratch = [], allyScratch = [];
  const searchRng = mulberry(18000 + 997);
  player.aiCtl = createAI(player, {
    difficulty, rng: mulberry(7000 + 997),
    deps: {
      heightField: world.heightField, raycast: world.raycast, getObstacles: () => world.getObstacles(),
      queryObstacles: world.queryObstacles || null, getConcealment: () => (world.getConcealment ? world.getConcealment() : []),
      planRoute: (start, goal, options) => planBotRoute({ start, goal, navigation: game._botNavigation, rng: searchRng, role: roleOf(player.spec),
        spec: player.spec, useRoleDetour: false, requireGoalLevel: options?.requireGoalLevel === true }),
      getEnemies: () => { enemyScratch.length = 0; for (const c of game.tanks) if (c.team !== player.team && c.modeActive !== false && !c.combat.destroyed && c.aerial?.kind !== 'gunship') enemyScratch.push(c); return enemyScratch; },
      getAllies: () => { allyScratch.length = 0; for (const c of game.tanks) if (c !== player && c.team === player.team && !c.combat.destroyed) allyScratch.push(c); return allyScratch; },
      spotting: { isSpotted: (id, receiver) => (game.spotting ? game.spotting.isSpotted(id, player.team, receiver) : true) },
      getObjective: () => game.matchModeController?.botObjective(player) ?? null,
    },
  });
  // the player seat's opening: toward the enemy deployment like an allied bot's doctrine leg (no mode target in Standard)
  if (playerSeat === 'park') player.aiCtl = null;
  else {
    const enemies = game.tanks.filter((e) => e.team !== player.team);
    const cx = mean(enemies.map((e) => e.state.pos.x)) ?? 0, cz = mean(enemies.map((e) => e.state.pos.z)) ?? 0;
    const route = planBotRoute({ start: { x: player.state.pos.x, z: player.state.pos.z }, goal: { x: cx, z: cz }, navigation: game._botNavigation,
      rng: mulberry(17000 + 997), role: roleOf(player.spec), spec: player.spec, useRoleDetour: false });
    if (route.length) player.aiCtl.setWaypoints(route.map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z])), { loop: false });
  }
  if (teamSurvival) {
    const controller = game.matchModeController;
    const step = controller.step;
    let inModeStep = false;
    controller.step = function (dt, t) { inModeStep = true; try { return step.call(this, dt, t); } finally { inModeStep = false; } };
    for (const e of game.tanks) if (normTeam(e.team) === 'alpha' && e !== player) {
      Object.defineProperty(e, 'bot', { get: () => !inModeStep, set() {}, configurable: true });
    }
  }
  // --playerSeat=shield|park: the player seat's combat state cannot reach destroyed (a measurement shim outside src;
  // re-installed whenever a revive hands the seat a fresh combat object), and its hull, crew and modules are restored
  // around every step so it keeps fighting (shield) or keeps standing (park) at full strength
  let shieldedCombat = null;
  const shieldPlayer = () => {
    const combat = player.combat;
    if (shieldedCombat !== combat) {
      let hp = combat.hp;
      Object.defineProperty(combat, 'hp', { get: () => hp, set: (v) => { hp = Math.max(1, Number.isFinite(v) ? v : 1); }, configurable: true, enumerable: true });
      Object.defineProperty(combat, 'destroyed', { get: () => false, set() {}, configurable: true, enumerable: true });
      shieldedCombat = combat;
    }
    combat.hp = combat.maxHp;
    for (const name of Object.keys(combat.crew ?? {})) combat.crew[name] = true;
    for (const module of Object.values(combat.modules ?? {})) if (module) { module.hp = module.maxHp; module.state = 'ok'; module.repairT = 0; }
    if (combat.fire) combat.fire.burning = false;
  };
  // Frontline Assault: the fight seat plays the objective like a human attacker — its route goes to the attack's point
  // for it (the live sector, the mode controller's botObjective) and follows the line as it advances, instead of the
  // enemy deployment's centroid (since gameplay-modes-228 the defenders stand on the line, so the centroid drove the seat
  // alone into the dug-in line ahead of its allies). Re-checked once a second; re-routed when the point moves 20 m.
  const playObjective = mode === 'frontline_assault' && playerSeat === 'fight';
  let objectiveCheckS = -Infinity, routedX = NaN, routedZ = NaN;
  const followObjective = () => {
    if (!playObjective || !player.aiCtl || player.combat.destroyed || game.timeS < objectiveCheckS + 1) return;
    objectiveCheckS = game.timeS;
    const goal = game.matchModeController?.botObjective(player);
    if (!goal || Math.hypot(goal.x - routedX, goal.z - routedZ) < 20) return;
    routedX = goal.x; routedZ = goal.z;
    const route = planBotRoute({ start: { x: player.state.pos.x, z: player.state.pos.z }, goal: { x: goal.x, z: goal.z }, navigation: game._botNavigation,
      rng: searchRng, role: roleOf(player.spec), spec: player.spec, useRoleDetour: false });
    player.aiCtl.setWaypoints(route.length ? route.map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z])) : [[goal.x, goal.z]], { loop: false });
  };
  adapter = {
    playerSpecId,
    entities: () => game.tanks,
    isHuman: (e) => !!e.isPlayer,
    controller: () => game.matchModeController,
    step() {
      if (playerSeat !== 'fight') shieldPlayer();
      followObjective();
      simStep(game, bus, world, null, collider);
      if (playerSeat !== 'fight') shieldPlayer();
      if (canSelfRightTank(player.state)) requestTankSelfRight(player.state, rules.gravityScale ?? 1);
    },
    timeS: () => game.timeS,
    /** Whether `team` (the bot's own team name) holds a spot on `id` right now (null: no spotting system). */
    isSpottedBy: (team, id) => (game.spotting ? !!game.spotting.isSpotted(id, team) : null),
    result: () => (game.result == null ? null : { result: game.result === 'victory' ? 'alpha' : game.result === 'defeat' ? 'bravo' : 'draw', reason: game.resultReason ?? null, atS: game.resultTimeS ?? game.timeS }),
    drain() { const out = recorded.splice(0); return out; },
  };
} else if (engine === 'authority') {
  // the same seats the solo battle would field (roster plan, ally split), as authority players
  const { game: plan, playerSpecId } = setupSolo({ mode, seed, mapId, arrangement, world, deferOpeningRoutes: true });
  const players = [];
  let a = 0, z = 0;
  for (const e of plan.tanks) {
    const human = e === plan.tanks[0];
    const team = normTeam(e.team);
    players.push({ id: human ? 'h1' : team === 'alpha' ? `a${a++}` : `z${z++}`, specId: e.specId, team, bot: true, difficulty });
  }
  const match = createAuthoritativeMatch({ players, mapId, seed, countdownS: 0, gameMode: mode, worldCollision: world, ruleset: rules });
  let inModeStep = false;
  const controller = match.modeController;
  const step = controller.step;
  controller.step = function (dt, t) { inModeStep = true; try { return step.call(this, dt, t); } finally { inModeStep = false; } };
  for (const e of match.entities) if (e.id === 'h1' || (teamSurvival && normTeam(e.team) === 'alpha')) {
    Object.defineProperty(e, 'bot', { get: () => !inModeStep, set() {}, configurable: true });
  }
  match.onMatchReady();
  const inputs = new Map();
  adapter = {
    playerSpecId,
    entities: () => match.entities,
    isHuman: (e) => e.id === 'h1',
    controller: () => match.modeController,
    step() { match.step({ dt: SIM_DT, inputs }); },
    timeS: () => match.timeS,
    isSpottedBy: () => null, // the authority keeps its spotting system private
    result: () => (match.result == null ? null : { result: match.result === 'alpha' || match.result === 'bravo' ? match.result : 'draw', reason: match.resultReason ?? null, atS: match.resultTimeS ?? match.timeS }),
    drain() {
      const out = [];
      for (const ev of match.eventsForViewer('__harness__')) {
        if (ev.type === 'shell_fired') out.push({ kind: 'fired', shooterId: ev.shooterId });
        else if (ev.type === 'shell_hit') out.push({ kind: 'hit', attackerId: ev.attackerId ?? ev.shooterId, targetId: ev.targetId ?? null, damage: ev.damage || 0 });
        else if (ev.type === 'tank_destroyed') out.push({ kind: 'destroyed', id: ev.id, killerId: ev.killerId ?? null, cause: ev.cause });
        else if (ev.type === 'tank_spotted') out.push({ kind: 'spotted', id: ev.id, team: ev.team });
        else if (ev.type === 'tank_ram') out.push({ kind: 'ram', aId: ev.aId ?? null, bId: ev.bId ?? null });
        else if (ev.type.startsWith('mode_')) out.push({ kind: 'mode', type: ev.type.slice(5), payload: { ...ev } });
      }
      match.afterEventBroadcast();
      return out;
    },
  };
} else {
  throw new Error(`unknown engine ${engine}`);
}

// --- the collector ---------------------------------------------------------------------------------------------------
const recs = new Map();
const recOf = (e) => {
  let r = recs.get(e.id);
  if (!r) {
    r = { id: e.id, specId: e.specId, nation: nationKey(e.spec?.nation), team0: normTeam(e.team), human: adapter.isHuman(e), hull0: e.combat?.maxHp ?? null,
      shots: 0, hits: 0, damagingHits: 0, damageDealt: 0, damageTaken: 0, kills: 0, deaths: 0, aliveS: 0,
      move: { advance: 0, hold: 0, retreat: 0, lateral: 0 }, ai: {}, engage: { samples: 0, still: 0 },
      flags: { fallingBack: 0, kiting: 0, scooting: 0, settling: 0, reacting: 0, searching: 0, pressing: 0, passivePress: 0, missionReleased: 0, ramming: 0, samples: 0 },
      engageDistSum: 0, engageDistN: 0,
      // guards: slow-while-free time (stuck), moving samples and the ones with a friendly inside 10 m (bunching)
      slowT: 0, guardSamples: 0, stuckSamples: 0, movingSamples: 0, bunchedSamples: 0,
      prev: null, ranDry: false };
    recs.set(e.id, r);
  }
  return r;
};
const ents = adapter.entities();
for (const e of ents) recOf(e);
const byId = new Map(ents.map((e) => [e.id, e]));
const teamNow = (id) => { const e = byId.get(id); return e ? normTeam(e.team) : null; };
const alive = (e) => e.modeActive !== false && !e.combat.destroyed;
const roster = rosterPurity(ents.map((e) => ({ team: normTeam(e.team), nation: nationKey(e.spec?.nation), human: adapter.isHuman(e) })));

const first = { spotS: null, shotS: null, hitS: null, damageS: null, killS: null, spotByTeam: { alpha: null, bravo: null }, shotByTeam: { alpha: null, bravo: null } };
const kills = { alpha: 0, bravo: 0, self: 0 };
const deathCauses = { alpha: {}, bravo: {} };
const damageBy = { alpha: 0, bravo: 0 };
let rams = 0;
const modeCounts = {};
const timeline = [];
const minuteBuckets = []; // [{ alpha: {objSum, objN, enemySum, enemyN, adv, hold, ret, lat}, bravo: {...} }]
const bucket = (t, team) => {
  const m = Math.floor(t / 60);
  while (minuteBuckets.length <= m) minuteBuckets.push({ alpha: { objSum: 0, objN: 0, enemySum: 0, enemyN: 0, advance: 0, hold: 0, retreat: 0, lateral: 0 }, bravo: { objSum: 0, objN: 0, enemySum: 0, enemyN: 0, advance: 0, hold: 0, retreat: 0, lateral: 0 } });
  return minuteBuckets[m][team];
};
// mode-specific accumulators
const ctf = { taken: { alpha: 0, bravo: 0 }, dropped: { alpha: 0, bravo: 0 }, returned: { alpha: 0, bravo: 0 }, returnedAuto: 0, captured: { alpha: 0, bravo: 0 },
  firstPickupS: null, carriedSamples: 0, nearestPursuerSum: 0, meanPursuerSum: 0, within120Sum: 0, recoverShareSum: 0, pursuerSamples: 0, carrierEscortSum: 0 };
const ball = { touches: { alpha: 0, bravo: 0, unknown: 0 }, shotTouches: 0, ramTouches: 0, possessionChanges: 0, lastTeam: null, goals: { alpha: 0, bravo: 0 }, firstTouchS: null,
  samples: 0, nearest: { alpha: 0, bravo: 0 }, meanDist: { alpha: 0, bravo: 0 }, within40: { alpha: 0, bravo: 0 }, botSamples: { alpha: 0, bravo: 0 }, strikerShare: { alpha: 0, bravo: 0 },
  // how close the ball comes to scoring: its distance to the nearer goal centre (a goal is scored inside 18 m), the
  // share of samples it sits in an end third of the goal axis, and the share it lies still (< 0.5 m/s)
  goalSamples: 0, goalDistSum: 0, goalDistMin: Infinity, endThirdSamples: 0, stillSamples: 0, axisM: null, prev: { x: 0, z: 0, set: false },
  // crowd: samples where at most 3 bots of each team stand within 30 m of the ball; bot shells that touched the ball
  crowdSamples: 0, crowdOk: 0, botShotTouches: 0 };
const front = { lines: [], total: null, zoneSamples: { alpha: 0, bravo: 0 }, liveSamples: 0, alphaDistSum: 0, alphaDistN: 0, bravoDistSum: 0, bravoDistN: 0, maxIndex: 0 };
const horde = { waves: [], humanHpSamples: [], maxWave: 0, peakAlive: 0, spawnChecks: 0, spawnNear: 0, spawnSeen: 0, spawnMinM: Infinity,
  pendingArrivals: [] };
// rams: bot-on-bot ram deaths and the hunter rams (a Horde / Infected hostile in a ram contact with an alpha hull)
const ramStats = { botOnBotDeaths: 0, hunterRams: 0, hunterContacts: 0 };
const sector1 = { kills: 0, done: false };
const inf = { infections: 0, firstInfectionS: null, infectionTimes: [], survivors0: 0, infected0: 0, survivorsByMin: [],
  shots: { alpha: 0, bravo: 0 }, hits: { alpha: 0, bravo: 0 }, damage: { alpha: 0, bravo: 0 }, botSamples: { alpha: 0, bravo: 0 },
  huntDistSum: 0, huntDistN: 0, huntWithin150: 0 };
// hunt honesty (Infected, Endless Horde): how often a hostile bot's mode objective is the live position of a survivor its
// team holds no spot on (the house rule: bots must not route on hidden enemies to look aggressive)
const hunt = { samples: 0, unspotted: 0, unknown: 0 };
let lastWave = null;
const humanHull0 = mean(ents.filter((e) => normTeam(e.team) === 'alpha').map((e) => e.combat.maxHp));
inf.survivors0 = ents.filter((e) => normTeam(e.team) === 'alpha').length;
inf.infected0 = ents.filter((e) => normTeam(e.team) === 'bravo').length;

function onEvent(ev, t) {
  if (ev.kind === 'fired') {
    const e = byId.get(ev.shooterId);
    if (!e) return;
    recOf(e).shots++;
    if (first.shotS == null) first.shotS = t;
    const team = normTeam(e.team);
    if (mode === 'infected' && !adapter.isHuman(e)) inf.shots[team]++;
    if (first.shotByTeam[team] == null) first.shotByTeam[team] = t;
    // a wave's first contact: the first round either side fires after it starts (nothing is left to shoot between waves)
    if (lastWave && lastWave.firstShotS == null) lastWave.firstShotS = round(t - lastWave.atS, 2);
  } else if (ev.kind === 'hit') {
    if (!ev.targetId) return;
    const a = byId.get(ev.attackerId), b = byId.get(ev.targetId);
    if (!a || !b || normTeam(a.team) === normTeam(b.team)) return;
    const ra = recOf(a), rb = recOf(b);
    ra.hits++;
    if (mode === 'infected' && !adapter.isHuman(a)) { inf.hits[normTeam(a.team)]++; inf.damage[normTeam(a.team)] += ev.damage || 0; }
    if (first.hitS == null) first.hitS = t;
    if (ev.damage > 0) {
      ra.damagingHits++; ra.damageDealt += ev.damage; rb.damageTaken += ev.damage;
      damageBy[normTeam(a.team)] += ev.damage;
      if (first.damageS == null) first.damageS = t;
      if (lastWave) { if (normTeam(a.team) === 'alpha') lastWave.dmgToZombies += ev.damage; else lastWave.dmgToHumans += ev.damage; }
    }
  } else if (ev.kind === 'destroyed') {
    const e = byId.get(ev.id);
    if (!e) return;
    recOf(e).deaths++;
    const victimTeam = recOf(e).lastTeam ?? normTeam(e.team);
    const causeKey = `${ev.cause ?? 'unknown'}${ev.killerId && ev.killerId !== ev.id ? '' : ':nokiller'}${adapter.isHuman(e) ? ':player' : ''}`;
    deathCauses[victimTeam][causeKey] = (deathCauses[victimTeam][causeKey] ?? 0) + 1;
    const killer = ev.killerId && ev.killerId !== ev.id ? byId.get(ev.killerId) : null;
    if (killer && normTeam(killer.team) !== victimTeam) {
      recOf(killer).kills++; kills[normTeam(killer.team)]++;
      if (first.killS == null) first.killS = t;
      if (mode === 'frontline_assault' && !sector1.done) sector1.kills++;
    } else kills.self++;
    if (String(ev.cause ?? '') === 'ram' && killer && !adapter.isHuman(killer) && !adapter.isHuman(e)) ramStats.botOnBotDeaths++;
    if (lastWave) { if (victimTeam === 'alpha') lastWave.humanDeaths++; else lastWave.zombieDeaths++; }
  } else if (ev.kind === 'spotted') {
    const victim = teamNow(ev.id);
    const spotter = ev.team ? normTeam(ev.team) : null;
    if (victim && spotter && victim !== spotter) {
      if (first.spotS == null) first.spotS = t;
      if (first.spotByTeam[spotter] == null) first.spotByTeam[spotter] = t;
    }
  } else if (ev.kind === 'ram') {
    rams++;
    if ((mode === 'endless_horde' || mode === 'infected') && ev.aId && ev.bId) {
      const a = byId.get(ev.aId), b = byId.get(ev.bId);
      // a hunter's ram: a hostile bot in contact with an alpha hull while it was itself driving into it (its own
      // velocity toward the other hull over 1 m/s); an alpha hull driving into a hostile is not the hunter's ram
      const drivesInto = (h, o) => {
        const dx = o.state.pos.x - h.state.pos.x, dz = o.state.pos.z - h.state.pos.z, d = Math.hypot(dx, dz) || 1;
        return (Math.sin(h.state.yaw) * dx + Math.cos(h.state.yaw) * dz) / d * h.state.speed > 1;
      };
      if (a && b && normTeam(a.team) !== normTeam(b.team)) {
        const hunter = normTeam(a.team) === 'bravo' && !adapter.isHuman(a) ? a : normTeam(b.team) === 'bravo' && !adapter.isHuman(b) ? b : null;
        if (hunter) { ramStats.hunterContacts++; if (drivesInto(hunter, hunter === a ? b : a)) ramStats.hunterRams++; }
      }
    }
  } else if (ev.kind === 'mode') {
    const type = ev.type;
    const p = ev.payload || {};
    modeCounts[type] = (modeCounts[type] ?? 0) + 1;
    if (type === 'respawn' && mode === 'endless_horde' && p.id) {
      const who = byId.get(p.id);
      if (who && normTeam(who.team) === 'bravo' && !adapter.isHuman(who)) horde.pendingArrivals.push(p.id);
    }
    if (timeline.length < 600 && type !== 'pickup_spawned' && type !== 'respawn' && type !== 'ball_hit') timeline.push([round(t, 1), type, p.team ?? p.wave ?? p.line ?? p.by ?? null]);
    if (type === 'flag_taken') { ctf.taken[otherSide(p.team)]++; if (ctf.firstPickupS == null) ctf.firstPickupS = t; }
    else if (type === 'flag_dropped') ctf.dropped[otherSide(p.team)]++;
    else if (type === 'flag_returned') { if (p.automatic) ctf.returnedAuto++; else ctf.returned[normFlagTeam(p.team)]++; }
    else if (type === 'flag_captured') ctf.captured[normFlagTeam(p.team)]++;
    else if (type === 'ball_hit') {
      const by = p.by ? byId.get(p.by) : null;
      const team = by ? normTeam(by.team) : (p.team ? normTeam(p.team) : null);
      if (team) { ball.touches[team]++; if (ball.lastTeam && ball.lastTeam !== team) ball.possessionChanges++; ball.lastTeam = team; } else ball.touches.unknown++;
      if (p.kind === 'shot') { ball.shotTouches++; if (by && !adapter.isHuman(by)) ball.botShotTouches++; } else ball.ramTouches++;
      if (ball.firstTouchS == null) ball.firstTouchS = t;
    } else if (type === 'goal_scored') { const team = p.team ? normFlagTeam(p.team) : null; if (team) ball.goals[team]++; }
    else if (type === 'line_advanced') { front.lines.push({ line: p.line, atS: round(t, 1) }); front.total = p.total ?? front.total; front.maxIndex = Math.max(front.maxIndex, p.line ?? 0); sector1.done = true; }
    else if (type === 'wave_started') {
      const hostiles = ents.filter((e) => normTeam(e.team) === 'bravo' && alive(e));
      const humans = ents.filter((e) => normTeam(e.team) === 'alpha' && alive(e));
      const previous = lastWave;
      lastWave = { wave: p.wave, atS: round(t, 1), enemies: p.enemies, total: p.total ?? p.enemies, special: p.special ?? null, healthScale: round(p.healthScale, 3), clearedAtS: null,
        hostileMaxHp: round(mean(hostiles.map((e) => e.combat.maxHp)), 0), hostileHullOfOwn: round(mean(hostiles.map((e) => e.combat.maxHp / hullOf(e.spec))), 3),
        humanMaxHp: round(mean(humans.map((e) => e.combat.maxHp)), 0), humanHpFracAtStart: round(mean(humans.map((e) => e.combat.hp / e.combat.maxHp)), 3), humansAlive: humans.length,
        humanDeaths: 0, zombieDeaths: 0, dmgToHumans: 0, dmgToZombies: 0, arrivals: 0, firstShotS: null, intermissionS: null, peakAlive: 0 };
      if (previous && previous.clearedAtS != null && (mode === 'endless_horde')) previous.intermissionS = round(t - previous.clearedAtS, 2);
      if (mode === 'endless_horde' || mode === 'frontline_assault') horde.waves.push(lastWave);
      horde.maxWave = Math.max(horde.maxWave, p.wave ?? 0);
    } else if (type === 'wave_cleared') { if (lastWave) lastWave.clearedAtS = round(t, 1); }
    else if (type === 'infected') { inf.infections++; if (inf.firstInfectionS == null) inf.firstInfectionS = t; if (inf.infectionTimes.length < 200) inf.infectionTimes.push(round(t, 1)); }
  }
}
function normFlagTeam(team) { return team === 'bravo' || team === 'enemy' ? 'bravo' : 'alpha'; }
/** A flag event names the flag's own team; the actor is the other side. */
function otherSide(team) { return normFlagTeam(team) === 'alpha' ? 'bravo' : 'alpha'; }

function sample(t) {
  const ctl = adapter.controller();
  const mstate = ctl?.state;
  const living = [];
  for (const e of ents) if (alive(e)) living.push(e);
  // Frontline: the live sector and its reach
  let zone = null, zoneR = null;
  if (mode === 'frontline_assault' && mstate?.zones?.length) {
    const idx = Math.min(mstate.line?.index ?? 0, mstate.zones.length - 1);
    zone = mstate.zones[idx];
    front.total = front.total ?? mstate.zones.length;
    front.liveSamples++;
  }
  // CTF carriers
  const carried = mode === 'capture_the_flag' ? (mstate?.flags ?? []).filter((f) => f.status === 'carried' && f.carrierId) : [];
  if (carried.length) ctf.carriedSamples++;
  const b = mode === 'turbo_ball' ? mstate?.ball : null;
  if (b) {
    ball.samples++;
    const goals = mstate?.goals ?? [];
    let ga = null, gb = null;
    for (const g of goals) { if (g.team === 'alpha') ga = g; else if (g.team === 'bravo') gb = g; }
    if (ga && gb) {
      const axis = Math.hypot(gb.x - ga.x, gb.z - ga.z);
      const dn = Math.min(Math.hypot(b.x - ga.x, b.z - ga.z), Math.hypot(b.x - gb.x, b.z - gb.z));
      ball.goalSamples++; ball.goalDistSum += dn;
      if (dn < ball.goalDistMin) ball.goalDistMin = dn;
      if (dn <= axis / 3) ball.endThirdSamples++;
      ball.axisM = axis;
    }
    if (ball.prev.set && Math.hypot(b.x - ball.prev.x, b.z - ball.prev.z) / (SAMPLE_TICKS * SIM_DT) < 0.5) ball.stillSamples++;
    ball.prev.x = b.x; ball.prev.z = b.z; ball.prev.set = true;
  }
  const ballNearest = { alpha: Infinity, bravo: Infinity };
  for (const e of living) {
    const r = recOf(e);
    const team = normTeam(e.team);
    r.lastTeam = team;
    r.aliveS += SAMPLE_TICKS * SIM_DT;
    if (!r.ranDry && totalAmmunition(e.combat) === 0) r.ranDry = true;
    const x = e.state.pos.x, z = e.state.pos.z;
    // nearest living enemy (ground truth; the harness may know what the bot may not)
    let nearest = null, nearestD = Infinity;
    for (const o of living) {
      if (normTeam(o.team) === team) continue;
      const d = Math.hypot(o.state.pos.x - x, o.state.pos.z - z);
      if (d < nearestD) { nearestD = d; nearest = o; }
    }
    let objective = null;
    try { objective = ctl?.botObjective(e) ?? null; } catch { objective = null; }
    const ref = objective ?? (nearest ? { x: nearest.state.pos.x, z: nearest.state.pos.z } : null);
    const bk = bucket(t, team);
    if (!r.human) {
      if (objective) { bk.objSum += Math.hypot(objective.x - x, objective.z - z); bk.objN++; }
      if (nearest) { bk.enemySum += nearestD; bk.enemyN++; }
    }
    if (r.prev && Math.abs(r.prev.t - (t - SAMPLE_TICKS * SIM_DT)) < 1e-6 && ref) {
      const dt = SAMPLE_TICKS * SIM_DT;
      const speed = Math.hypot(x - r.prev.x, z - r.prev.z) / dt;
      const rate = (Math.hypot(ref.x - x, ref.z - z) - Math.hypot(ref.x - r.prev.x, ref.z - r.prev.z)) / dt;
      const cls = speed < MOVE_EPS_MPS ? 'hold' : rate < -MOVE_EPS_MPS ? 'advance' : rate > MOVE_EPS_MPS ? 'retreat' : 'lateral';
      r.move[cls]++;
      if (!r.human) bk[cls]++;
      if (e.aiCtl?.state === 'engage') { r.engage.samples++; if (speed < MOVE_EPS_MPS) r.engage.still++; }
      if (!r.human) {
        // guards: stuck = under 0.5 m/s for over 10 s while not engaged and off its objective; bunching = a moving
        // sample with a friendly hull inside 10 m (a conga line or a pile-up)
        r.guardSamples++;
        const onObjective = !!objective && Math.hypot(objective.x - x, objective.z - z) <= (objective.radiusM ?? 25);
        if (speed < 0.5 && e.aiCtl?.state !== 'engage' && !onObjective) r.slowT += dt; else r.slowT = 0;
        if (r.slowT > 10) r.stuckSamples++;
        if (speed >= MOVE_EPS_MPS) {
          r.movingSamples++;
          for (const o of living) {
            if (o === e || normTeam(o.team) !== team) continue;
            if (Math.hypot(o.state.pos.x - x, o.state.pos.z - z) <= 10) { r.bunchedSamples++; break; }
          }
        }
      }
    } else r.slowT = 0;
    r.prev = { x, z, t };
    const ai = e.aiCtl;
    if (ai) {
      r.ai[ai.state] = (r.ai[ai.state] ?? 0) + 1;
      const targetId = ai.state === 'engage' ? ai.targetId : null;
      const target = targetId ? byId.get(targetId) : null;
      if (target && alive(target)) { r.engageDistSum += Math.hypot(target.state.pos.x - x, target.state.pos.z - z); r.engageDistN++; }
      if ((Math.round(t / (SAMPLE_TICKS * SIM_DT)) & 3) === 0 && typeof ai.debugInfo === 'function') {
        const info = ai.debugInfo();
        r.flags.samples++;
        if (info.fallingBack) r.flags.fallingBack++;
        if (info.kiting) r.flags.kiting++;
        if (info.scooting) r.flags.scooting++;
        if (info.settling) r.flags.settling++;
        if (info.reaction) r.flags.reacting++;
        if (info.searching) r.flags.searching++;
        if (info.pressing) r.flags.pressing++;
        if (info.passivePress) r.flags.passivePress++;
        if (info.missionReleased) r.flags.missionReleased++;
        if (info.ramming) r.flags.ramming++;
      }
    }
    if (mode === 'infected' && !r.human) {
      inf.botSamples[team]++;
      if (team === 'bravo' && nearest) { inf.huntDistSum += nearestD; inf.huntDistN++; if (nearestD <= 150) inf.huntWithin150++; }
    }
    // the Horde's allied bots hunt too (gameplay-modes-228): their objective may not name a hidden zombie either
    if (((mode === 'infected' && team === 'bravo') || mode === 'endless_horde') && !r.human && objective) {
      let quarry = null, quarryD = Infinity;
      for (const o of living) {
        if (normTeam(o.team) === team) continue;
        const d = Math.hypot(o.state.pos.x - objective.x, o.state.pos.z - objective.z);
        if (d < quarryD) { quarryD = d; quarry = o; }
      }
      if (quarry && quarryD < 2) {
        hunt.samples++;
        const seen = adapter.isSpottedBy(e.team, quarry.id);
        if (seen === null) hunt.unknown++; else if (!seen) { hunt.unspotted++; if (team === 'alpha') hunt.alliesUnspotted = (hunt.alliesUnspotted ?? 0) + 1; }
        if (team === 'alpha') hunt.alliesSamples = (hunt.alliesSamples ?? 0) + 1;
      }
    }
    if (zone && !r.human) {
      const d = Math.hypot(zone.x - x, zone.z - z);
      zoneR = zoneR ?? objective?.radiusM ?? null;
      const reach = zoneR ?? 30;
      if (d <= reach) front.zoneSamples[team]++;
      if (team === 'alpha') { front.alphaDistSum += d; front.alphaDistN++; } else { front.bravoDistSum += d; front.bravoDistN++; }
    }
    if (b && !r.human) {
      const d = Math.hypot(b.x - x, b.z - z);
      ball.meanDist[team] += d; ball.botSamples[team]++;
      if (d < ballNearest[team]) ballNearest[team] = d;
      if (d <= 40) ball.within40[team]++;
      if (objective?.mission === 'striker') ball.strikerShare[team]++;
    }
  }
  if (b) for (const team of ['alpha', 'bravo']) if (Number.isFinite(ballNearest[team])) ball.nearest[team] += ballNearest[team];
  if (b) {
    const crowd = { alpha: 0, bravo: 0 };
    for (const e of living) if (!adapter.isHuman(e) && Math.hypot(b.x - e.state.pos.x, b.z - e.state.pos.z) <= 30) crowd[normTeam(e.team)]++;
    ball.crowdSamples++;
    if (crowd.alpha <= 3 && crowd.bravo <= 3) ball.crowdOk++;
  }
  if (mode === 'endless_horde') {
    let hostiles = 0;
    for (const e of living) if (normTeam(e.team) === 'bravo' && !adapter.isHuman(e)) hostiles++;
    if (hostiles > horde.peakAlive) horde.peakAlive = hostiles;
    if (lastWave && hostiles > lastWave.peakAlive) lastWave.peakAlive = hostiles;
    if (mstate?.horde && lastWave) { lastWave.remainingSeen = Math.max(lastWave.remainingSeen ?? 0, mstate.horde.remaining ?? 0); }
  }
  for (const flag of carried) {
    const carrier = byId.get(flag.carrierId);
    if (!carrier) continue;
    const pursuerTeam = normFlagTeam(flag.team);
    const pursuers = living.filter((e) => normTeam(e.team) === pursuerTeam && !adapter.isHuman(e));
    const escorts = living.filter((e) => normTeam(e.team) !== pursuerTeam && e !== carrier && !adapter.isHuman(e));
    if (!pursuers.length) continue;
    const ds = pursuers.map((e) => Math.hypot(e.state.pos.x - carrier.state.pos.x, e.state.pos.z - carrier.state.pos.z));
    ctf.pursuerSamples++;
    ctf.nearestPursuerSum += Math.min(...ds);
    ctf.meanPursuerSum += mean(ds);
    ctf.within120Sum += ds.filter((d) => d <= 120).length / pursuers.length;
    let recover = 0;
    for (const e of pursuers) { try { if (ctl.botObjective(e)?.mission === 'recover') recover++; } catch { /* measurement only */ } }
    ctf.recoverShareSum += recover / pursuers.length;
    if (escorts.length) ctf.carrierEscortSum += escorts.filter((e) => Math.hypot(e.state.pos.x - carrier.state.pos.x, e.state.pos.z - carrier.state.pos.z) <= 80).length / escorts.length;
  }
  if (mode === 'infected') {
    const m = Math.floor(t / 60);
    if (inf.survivorsByMin[m] == null) inf.survivorsByMin[m] = living.filter((e) => normTeam(e.team) === 'alpha').length;
  }
  if (mode === 'endless_horde') {
    const humans = living.filter((e) => normTeam(e.team) === 'alpha');
    if (humans.length && horde.humanHpSamples.length < 4000) horde.humanHpSamples.push(mean(humans.map((e) => e.combat.hp / e.combat.maxHp)));
  }
}

// Horde arrivals: every hostile revive this tick belongs to the wave live after the tick's events (a wave's opening burst
// and its trickle alike). Each arrival is checked where it stands: the nearest living alpha hull, and whether any alpha
// within 450 m sees it over the terrain (a height-field ray march at 8 m from an eye 2.4 m up to the hull 1.5 m up).
function terrainSees(ax, ay, az, bx, by, bz) {
  const d = Math.hypot(bx - ax, bz - az);
  for (let s = 8; s < d - 4; s += 8) {
    const f = s / d;
    const ground = world.heightField.getHeightAt(ax + (bx - ax) * f, az + (bz - az) * f);
    if (ground > ay + (by - ay) * f) return false;
  }
  return true;
}
function settleArrivals() {
  const ids = horde.pendingArrivals.splice(0);
  if (lastWave) lastWave.arrivals += ids.length;
  for (const id of ids) {
    const z = byId.get(id);
    if (!z || !alive(z)) continue;
    let nearest = Infinity, seen = false;
    for (const h of ents) {
      if (normTeam(h.team) !== 'alpha' || !alive(h)) continue;
      const d = Math.hypot(h.state.pos.x - z.state.pos.x, h.state.pos.z - z.state.pos.z);
      if (d < nearest) nearest = d;
      if (!seen && d <= 450 && terrainSees(h.state.pos.x, h.state.pos.y + 2.4, h.state.pos.z, z.state.pos.x, z.state.pos.y + 1.5, z.state.pos.z)) seen = true;
    }
    horde.spawnChecks++;
    if (nearest < horde.spawnMinM) horde.spawnMinM = nearest;
    if (nearest < 150) horde.spawnNear++;
    if (seen) horde.spawnSeen++;
    if (lastWave) { lastWave.spawnNear = (lastWave.spawnNear ?? 0) + (nearest < 150 ? 1 : 0); lastWave.spawnSeen = (lastWave.spawnSeen ?? 0) + (seen ? 1 : 0); }
  }
}

// --- the loop --------------------------------------------------------------------------------------------------------
const ticks = Math.round(capS / SIM_DT);
let result = null;
let tick = 0;
let spentSamples = 0;
for (; tick < ticks; tick++) {
  adapter.step();
  const t = adapter.timeS();
  for (const ev of adapter.drain()) onEvent(ev, t);
  if (horde.pendingArrivals.length) settleArrivals();
  if (tick % SAMPLE_TICKS === 0) sample(t);
  const res = adapter.result();
  if (res) { result = res; break; }
  // a parked seat in Frontline Assault (no respawn; allies revive only when a sector falls): once every allied bot is
  // down nothing on the attacking side can move again, so the clock's defeat is settled — stop there
  // (held for 10 s, so a revive still pending a clear spawn point comes back first)
  if (playerSeat === 'park' && mode === 'frontline_assault' && tick % SAMPLE_TICKS === 0) {
    spentSamples = ents.some((e) => normTeam(e.team) === 'alpha' && !adapter.isHuman(e) && alive(e)) ? 0 : spentSamples + 1;
    if (spentSamples >= 20) { result = { result: 'bravo', reason: 'attackers_spent', atS: adapter.timeS() }; break; }
  }
}
const endS = result?.atS ?? adapter.timeS();
const minutes = Math.max(1e-6, endS / 60);

// --- the summary -----------------------------------------------------------------------------------------------------
const rows = [...recs.values()];
const bots = (team) => rows.filter((r) => !r.human && r.team0 === team);
const sideSummary = (list) => {
  const aliveMin = list.reduce((s, r) => s + r.aliveS, 0) / 60;
  const moves = list.reduce((acc, r) => { for (const k in r.move) acc[k] += r.move[k]; return acc; }, { advance: 0, hold: 0, retreat: 0, lateral: 0 });
  const moveN = Object.values(moves).reduce((a, b) => a + b, 0) || 1;
  const aiStates = {};
  for (const r of list) for (const [k, v] of Object.entries(r.ai)) aiStates[k] = (aiStates[k] ?? 0) + v;
  const aiN = Object.values(aiStates).reduce((a, b) => a + b, 0) || 1;
  const flags = list.reduce((acc, r) => { for (const k in r.flags) acc[k] += r.flags[k]; return acc; }, { fallingBack: 0, kiting: 0, scooting: 0, settling: 0, reacting: 0, searching: 0, pressing: 0, passivePress: 0, missionReleased: 0, ramming: 0, samples: 0 });
  const engageDist = list.reduce((s, r) => s + r.engageDistSum, 0), engageDistN = list.reduce((s, r) => s + r.engageDistN, 0);
  const engageSamples = list.reduce((s, r) => s + r.engage.samples, 0), engageStill = list.reduce((s, r) => s + r.engage.still, 0);
  const shots = list.reduce((s, r) => s + r.shots, 0), hits = list.reduce((s, r) => s + r.hits, 0), dmgHits = list.reduce((s, r) => s + r.damagingHits, 0);
  return {
    n: list.length, aliveBotMin: round(aliveMin, 1),
    shotsPerBotMin: round(shots / Math.max(1e-6, aliveMin), 2), hitsPerBotMin: round(hits / Math.max(1e-6, aliveMin), 2),
    damagingHitsPerBotMin: round(dmgHits / Math.max(1e-6, aliveMin), 2), hitRate: round(hits / Math.max(1, shots), 3),
    damagePerBotMin: round(list.reduce((s, r) => s + r.damageDealt, 0) / Math.max(1e-6, aliveMin), 1),
    kills: list.reduce((s, r) => s + r.kills, 0), deaths: list.reduce((s, r) => s + r.deaths, 0),
    move: Object.fromEntries(Object.entries(moves).map(([k, v]) => [k, round(v / moveN, 3)])),
    ai: Object.fromEntries(Object.entries(aiStates).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, round(v / aiN, 3)])),
    flags: flags.samples ? Object.fromEntries(Object.entries(flags).filter(([k]) => k !== 'samples').map(([k, v]) => [k, round(v / flags.samples, 3)])) : {},
    engagedStillShare: engageSamples ? round(engageStill / engageSamples, 3) : null,
    engageDistM: engageDistN ? Math.round(engageDist / engageDistN) : null,
    ranDry: list.filter((r) => r.ranDry).length,
    avgHull0: round(mean(list.map((r) => r.hull0).filter((x) => x != null)), 0),
    stuckShare: round(list.reduce((s, r) => s + r.stuckSamples, 0) / Math.max(1, list.reduce((s, r) => s + r.guardSamples, 0)), 4),
    bunchShare: round(list.reduce((s, r) => s + r.bunchedSamples, 0) / Math.max(1, list.reduce((s, r) => s + r.movingSamples, 0)), 4),
  };
};
// offensive jumps (Turbo Ball strikers), read from each controller's own count where the tree has one
let offensiveJumps = 0;
for (const e of ents) { try { offensiveJumps += Number(e.aiCtl?.debugInfo?.().offensiveJumps) || 0; } catch { /* measurement only */ } }
const human = rows.find((r) => r.human);
const summary = {
  tool: 'tools/mode-aggression-harness.mjs', engine, mode, seed, mapId, difficulty, arrangement, teamSurvival, playerSeat, playerSpecId: adapter.playerSpecId,
  result: result?.result ?? null, reason: result?.reason ?? (result ? null : 'cap'), endS: round(endS, 1), capS,
  firstContact: { spotS: round(first.spotS, 1), shotS: round(first.shotS, 1), hitS: round(first.hitS, 1), damageS: round(first.damageS, 1), killS: round(first.killS, 1),
    spotByTeam: { alpha: round(first.spotByTeam.alpha, 1), bravo: round(first.spotByTeam.bravo, 1) }, shotByTeam: { alpha: round(first.shotByTeam.alpha, 1), bravo: round(first.shotByTeam.bravo, 1) } },
  alpha: sideSummary(bots('alpha')), bravo: sideSummary(bots('bravo')),
  kills, deathCauses, killsPerMin: { alpha: round(kills.alpha / minutes, 2), bravo: round(kills.bravo / minutes, 2) }, damageBy: { alpha: Math.round(damageBy.alpha), bravo: Math.round(damageBy.bravo) }, rams,
  ramStats: { ...ramStats },
  player: human ? { specId: human.specId, nation: human.nation, shots: human.shots, kills: human.kills, deaths: human.deaths, aliveS: round(human.aliveS, 0), ranDry: human.ranDry, move: human.move } : null,
  overTime: minuteBuckets.map((m, i) => ({ min: i,
    alphaObjM: m.alpha.objN ? Math.round(m.alpha.objSum / m.alpha.objN) : null, bravoObjM: m.bravo.objN ? Math.round(m.bravo.objSum / m.bravo.objN) : null,
    alphaEnemyM: m.alpha.enemyN ? Math.round(m.alpha.enemySum / m.alpha.enemyN) : null, bravoEnemyM: m.bravo.enemyN ? Math.round(m.bravo.enemySum / m.bravo.enemyN) : null,
    alphaAdvance: round(m.alpha.advance / Math.max(1, m.alpha.advance + m.alpha.hold + m.alpha.retreat + m.alpha.lateral), 2),
    bravoAdvance: round(m.bravo.advance / Math.max(1, m.bravo.advance + m.bravo.hold + m.bravo.retreat + m.bravo.lateral), 2) })),
  roster,
  modeEvents: modeCounts,
  timeline: timeline.slice(0, 200),
  wallMs: Math.round(performance.now() - wallStarted), recorderErrors, simTicks: tick,
};
if (mode === 'capture_the_flag') {
  const n = Math.max(1, ctf.pursuerSamples);
  summary.ctf = { taken: ctf.taken, dropped: ctf.dropped, returned: ctf.returned, returnedAuto: ctf.returnedAuto, captured: ctf.captured,
    pickups: ctf.taken.alpha + ctf.taken.bravo, captures: ctf.captured.alpha + ctf.captured.bravo, returns: ctf.returned.alpha + ctf.returned.bravo + ctf.returnedAuto,
    firstPickupS: round(ctf.firstPickupS, 1), carriedShare: round(ctf.carriedSamples / Math.max(1, Math.floor(tick / SAMPLE_TICKS)), 3),
    pursuit: ctf.pursuerSamples ? { nearestPursuerM: Math.round(ctf.nearestPursuerSum / n), meanPursuerM: Math.round(ctf.meanPursuerSum / n),
      within120Share: round(ctf.within120Sum / n, 3), recoverMissionShare: round(ctf.recoverShareSum / n, 3), escortWithin80Share: round(ctf.carrierEscortSum / n, 3) } : null };
}
if (mode === 'turbo_ball') {
  const s = Math.max(1, ball.samples);
  summary.ball = { touches: ball.touches, totalTouches: ball.touches.alpha + ball.touches.bravo + ball.touches.unknown, shotTouches: ball.shotTouches, ramTouches: ball.ramTouches,
    touchesPerMin: round((ball.touches.alpha + ball.touches.bravo + ball.touches.unknown) / minutes, 2), possessionChanges: ball.possessionChanges,
    goals: ball.goals, totalGoals: ball.goals.alpha + ball.goals.bravo, firstTouchS: round(ball.firstTouchS, 1),
    pursuit: { nearestBotM: { alpha: Math.round(ball.nearest.alpha / s), bravo: Math.round(ball.nearest.bravo / s) },
      meanBotM: { alpha: Math.round(ball.meanDist.alpha / Math.max(1, ball.botSamples.alpha)), bravo: Math.round(ball.meanDist.bravo / Math.max(1, ball.botSamples.bravo)) },
      within40Share: { alpha: round(ball.within40.alpha / Math.max(1, ball.botSamples.alpha), 3), bravo: round(ball.within40.bravo / Math.max(1, ball.botSamples.bravo), 3) },
      strikerShare: { alpha: round(ball.strikerShare.alpha / Math.max(1, ball.botSamples.alpha), 3), bravo: round(ball.strikerShare.bravo / Math.max(1, ball.botSamples.bravo), 3) } },
    goalApproach: ball.goalSamples ? { nearestGoalMinM: Math.round(ball.goalDistMin), nearestGoalMeanM: Math.round(ball.goalDistSum / ball.goalSamples),
      endThirdShare: round(ball.endThirdSamples / ball.goalSamples, 3), stillShare: round(ball.stillSamples / Math.max(1, ball.samples - 1), 3), axisM: Math.round(ball.axisM) } : null,
    crowdOkShare: round(ball.crowdOk / Math.max(1, ball.crowdSamples), 4), botShotTouches: ball.botShotTouches, offensiveJumps };
}
if (mode === 'frontline_assault') {
  const total = front.total ?? 0;
  summary.frontline = { sectors: total, sectorsTaken: front.lines.length, progress: total ? round((front.lines.length + (result?.reason === 'line_held' ? 1 : 0)) / total, 3) : null,
    lines: front.lines, held: result?.reason === 'line_held',
    zoneTimeBotS: { alpha: round(front.zoneSamples.alpha * SAMPLE_TICKS * SIM_DT, 0), bravo: round(front.zoneSamples.bravo * SAMPLE_TICKS * SIM_DT, 0) },
    attackerZoneShare: round(front.zoneSamples.alpha / Math.max(1, front.alphaDistN), 3),
    attackerDistToLiveZoneM: front.alphaDistN ? Math.round(front.alphaDistSum / front.alphaDistN) : null,
    defenderDistToLiveZoneM: front.bravoDistN ? Math.round(front.bravoDistSum / front.bravoDistN) : null,
    sector1Kills: sector1.kills, counterAttacks: modeCounts.counter_attack ?? 0,
    waves: horde.waves };
}
if (mode === 'endless_horde') {
  summary.horde = { roundsReached: horde.maxWave, waves: horde.waves,
    enemiesPerRound: horde.waves.map((w) => w.enemies), deathsPerRound: horde.waves.map((w) => ({ wave: w.wave, humans: w.humanDeaths, zombies: w.zombieDeaths })),
    hostileHullOfOwn: round(mean(horde.waves.map((w) => w.hostileHullOfOwn).filter((x) => x != null)), 3),
    hostileMaxHp: round(mean(horde.waves.map((w) => w.hostileMaxHp).filter((x) => x != null)), 0), humanMaxHp0: round(humanHull0, 0),
    humanHpFracMean: round(mean(horde.humanHpSamples), 3), damage: { humansDealt: Math.round(damageBy.alpha), zombiesDealt: Math.round(damageBy.bravo) },
    zombieKillsPerHumanDeath: round(kills.alpha / Math.max(1, kills.bravo), 2), wavesCleared: horde.waves.filter((w) => w.clearedAtS != null).length };
  // the wave law: arrivals per wave against the ruleset's own law (the 228 tree's hordeWaveTotal; before it, the wave
  // size capped by the pool), judged on the waves that were cleared (a run's last wave ends early)
  const pool = ents.filter((e) => normTeam(e.team) === 'bravo').length;
  const lawFor = (w) => (typeof RULESET_MODULE.hordeWaveTotal === 'function'
    ? RULESET_MODULE.hordeWaveTotal(rules.horde, w, 1) : Math.min(pool, RULESET_MODULE.hordeWaveSize(rules.horde, w)));
  const cleared = horde.waves.filter((w) => w.clearedAtS != null);
  summary.horde.law = {
    arrivalsPerWave: horde.waves.map((w) => w.arrivals), expectedPerWave: horde.waves.map((w) => lawFor(w.wave)),
    clearedOnLaw: cleared.filter((w) => w.arrivals === lawFor(w.wave)).length, cleared: cleared.length,
    specials: horde.waves.map((w) => w.special ?? null),
    peakAlive: horde.peakAlive, poolIdentities: pool,
    spawnChecks: horde.spawnChecks, spawnNear: horde.spawnNear, spawnSeen: horde.spawnSeen, spawnMinM: Number.isFinite(horde.spawnMinM) ? Math.round(horde.spawnMinM) : null,
    firstContactPerWave: horde.waves.map((w) => w.firstShotS), intermissionPerWave: horde.waves.map((w) => w.intermissionS),
    hullPerWave: horde.waves.map((w) => w.hostileHullOfOwn),
  };
}
if (mode === 'infected') {
  const botMin = (team) => Math.max(1e-6, inf.botSamples[team] * SAMPLE_TICKS * SIM_DT / 60);
  const sideOf = (team) => ({ aliveBotMin: round(botMin(team), 1), shotsPerBotMin: round(inf.shots[team] / botMin(team), 2), hitsPerBotMin: round(inf.hits[team] / botMin(team), 2),
    damagePerBotMin: round(inf.damage[team] / botMin(team), 1), hitRate: round(inf.hits[team] / Math.max(1, inf.shots[team]), 3) });
  summary.infected = { survivors0: inf.survivors0, infected0: inf.infected0, infections: inf.infections, firstInfectionS: round(inf.firstInfectionS, 1),
    infectionsPerMin: round(inf.infections / minutes, 2), survivorsLeft: ents.filter((e) => normTeam(e.team) === 'alpha' && alive(e)).length,
    survivorsByMin: Array.from(inf.survivorsByMin, (v) => v ?? null), infectionTimes: inf.infectionTimes,
    survivors: sideOf('alpha'), infectedSide: sideOf('bravo'),
    huntDistToSurvivorM: inf.huntDistN ? Math.round(inf.huntDistSum / inf.huntDistN) : null, huntWithin150Share: round(inf.huntWithin150 / Math.max(1, inf.huntDistN), 3) };
}
if (mode === 'infected' || mode === 'endless_horde') {
  summary.huntHonesty = { samples: hunt.samples, unspottedShare: hunt.samples - hunt.unknown ? round(hunt.unspotted / (hunt.samples - hunt.unknown), 3) : null, unknown: hunt.unknown,
    alliesSamples: hunt.alliesSamples ?? 0, alliesUnspotted: hunt.alliesUnspotted ?? 0 };
}
world.release?.();
console.log(JSON.stringify(summary));
process.exit(0);

// ---------------------------------------------------------------------------------------------------- aggregation ---
function aggregateMode(mode, list) {
  const pick = (f) => list.map(f).filter((x) => x != null && Number.isFinite(x));
  const m = (f, d = 2) => round(mean(pick(f)), d);
  const md = (f, d = 1) => round(median(pick(f)), d);
  const side = (team) => ({
    shotsPerBotMin: m((r) => r[team].shotsPerBotMin), hitsPerBotMin: m((r) => r[team].hitsPerBotMin), damagingHitsPerBotMin: m((r) => r[team].damagingHitsPerBotMin),
    hitRate: m((r) => r[team].hitRate, 3), damagePerBotMin: m((r) => r[team].damagePerBotMin, 1),
    advance: m((r) => r[team].move.advance, 3), hold: m((r) => r[team].move.hold, 3), retreat: m((r) => r[team].move.retreat, 3), lateral: m((r) => r[team].move.lateral, 3),
    ai: (() => { const acc = {}; for (const r of list) for (const [k, v] of Object.entries(r[team].ai)) acc[k] = (acc[k] ?? 0) + v / list.length; return Object.fromEntries(Object.entries(acc).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, round(v, 3)])); })(),
    flags: (() => { const acc = {}; for (const r of list) for (const [k, v] of Object.entries(r[team].flags || {})) acc[k] = (acc[k] ?? 0) + v / list.length; return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, round(v, 3)])); })(),
    engagedStillShare: m((r) => r[team].engagedStillShare, 3), engageDistM: m((r) => r[team].engageDistM, 0),
    kills: m((r) => r[team].kills, 1), deaths: m((r) => r[team].deaths, 1), ranDry: m((r) => r[team].ranDry, 2), avgHull0: m((r) => r[team].avgHull0, 0),
    stuckShare: m((r) => r[team].stuckShare, 4), bunchShare: m((r) => r[team].bunchShare, 4),
    ranDryTotal: list.reduce((s, r) => s + (r[team].ranDry || 0), 0),
  });
  const results = {};
  for (const r of list) results[r.result ?? 'none'] = (results[r.result ?? 'none'] ?? 0) + 1;
  const overTime = [];
  const maxMin = Math.max(...list.map((r) => r.overTime.length));
  for (let i = 0; i < maxMin; i++) {
    const at = list.map((r) => r.overTime[i]).filter(Boolean);
    overTime.push({ min: i, runs: at.length, alphaObjM: round(mean(at.map((o) => o.alphaObjM).filter((x) => x != null)), 0), bravoObjM: round(mean(at.map((o) => o.bravoObjM).filter((x) => x != null)), 0),
      alphaEnemyM: round(mean(at.map((o) => o.alphaEnemyM).filter((x) => x != null)), 0), bravoEnemyM: round(mean(at.map((o) => o.bravoEnemyM).filter((x) => x != null)), 0),
      alphaAdvance: round(mean(at.map((o) => o.alphaAdvance).filter((x) => x != null)), 2), bravoAdvance: round(mean(at.map((o) => o.bravoAdvance).filter((x) => x != null)), 2) });
  }
  const out = {
    runs: list.length, seeds: list.map((r) => r.seed), maps: list.map((r) => r.mapId), engine: list[0].engine, results,
    resultsBySeed: list.map((r) => `${r.seed}:${r.mapId}:${r.result ?? 'none'}/${r.reason ?? ''}@${r.endS}`).join(' '),
    endS: { mean: m((r) => r.endS, 0), median: md((r) => r.endS, 0) },
    firstContact: { spotS: md((r) => r.firstContact.spotS), shotS: md((r) => r.firstContact.shotS), hitS: md((r) => r.firstContact.hitS),
      damageS: md((r) => r.firstContact.damageS), killS: md((r) => r.firstContact.killS) },
    alpha: side('alpha'), bravo: side('bravo'),
    killsPerMin: { alpha: m((r) => r.killsPerMin.alpha), bravo: m((r) => r.killsPerMin.bravo) }, rams: m((r) => r.rams, 1),
    deathCauses: (() => { const acc = { alpha: {}, bravo: {} }; for (const r of list) for (const team of ['alpha', 'bravo']) for (const [k, v] of Object.entries(r.deathCauses?.[team] ?? {})) acc[team][k] = (acc[team][k] ?? 0) + v; return acc; })(),
    teamSurvival: list.some((r) => r.teamSurvival), playerSeat: [...new Set(list.map((r) => r.playerSeat ?? 'fight'))].join(','),
    roster: {
      alliesDistinct: m((r) => r.roster.allies.distinct), alliesModalShare: m((r) => r.roster.allies.modalShare, 3), alliesPlayerNationShare: m((r) => r.roster.allies.playerNationShare ?? 0, 3),
      enemiesDistinct: m((r) => r.roster.enemies.distinct), enemiesModalShare: m((r) => r.roster.enemies.modalShare, 3), sharedNations: m((r) => r.roster.sharedNations),
      enemiesOfPlayerNation: m((r) => r.roster.enemiesOfPlayerNation ?? 0, 3),
    },
    overTime,
    wallMs: { mean: m((r) => r.wallMs, 0) },
    recorderErrors: list.reduce((s, r) => s + (r.recorderErrors || 0), 0),
    playerRanDry: list.filter((r) => r.player?.ranDry).length,
    ramStats: { botOnBotDeathsMean: m((r) => r.ramStats?.botOnBotDeaths, 2), botOnBotDeathsTotal: list.reduce((s, r) => s + (r.ramStats?.botOnBotDeaths ?? 0), 0),
      hunterRamsTotal: list.reduce((s, r) => s + (r.ramStats?.hunterRams ?? 0), 0) },
    winsAlpha: list.filter((r) => r.result === 'alpha').length, winsBravo: list.filter((r) => r.result === 'bravo').length,
    draws: list.filter((r) => r.result === 'draw' || r.result == null).length,
  };
  if (mode === 'capture_the_flag') {
    out.ctf = { pickupsPerMatch: m((r) => r.ctf.pickups), capturesPerMatch: m((r) => r.ctf.captures), returnsPerMatch: m((r) => r.ctf.returns),
      matchesWithCapture: list.filter((r) => r.ctf.captures > 0).length, matchesDecidedByCaptures: list.filter((r) => r.reason === 'flag_limit').length,
      autoReturnsPerMatch: m((r) => r.ctf.returnedAuto), dropsPerMatch: m((r) => r.ctf.dropped.alpha + r.ctf.dropped.bravo),
      firstPickupS: md((r) => r.ctf.firstPickupS), carriedShare: m((r) => r.ctf.carriedShare, 3), matchesWithNoPickup: list.filter((r) => !r.ctf.pickups).length,
      pursuit: { nearestPursuerM: m((r) => r.ctf.pursuit?.nearestPursuerM, 0), meanPursuerM: m((r) => r.ctf.pursuit?.meanPursuerM, 0),
        within120Share: m((r) => r.ctf.pursuit?.within120Share, 3), recoverMissionShare: m((r) => r.ctf.pursuit?.recoverMissionShare, 3), escortWithin80Share: m((r) => r.ctf.pursuit?.escortWithin80Share, 3) } };
  }
  if (mode === 'turbo_ball') {
    out.ball = { touchesPerMatch: m((r) => r.ball.totalTouches, 1), touchesPerMin: m((r) => r.ball.touchesPerMin), shotTouches: m((r) => r.ball.shotTouches, 1), ramTouches: m((r) => r.ball.ramTouches, 1),
      possessionChangesPerMatch: m((r) => r.ball.possessionChanges, 1), goalsPerMatch: m((r) => r.ball.totalGoals), firstTouchS: md((r) => r.ball.firstTouchS),
      matchesWithNoGoal: list.filter((r) => !r.ball.totalGoals).length,
      matchesUnder40Touches: list.filter((r) => r.ball.totalTouches < 40).length,
      touchesByMap: Object.fromEntries(list.map((r) => [r.mapId, r.ball.totalTouches])),
      crowdOkShare: m((r) => r.ball.crowdOkShare, 4), botShotTouches: m((r) => r.ball.botShotTouches, 1), offensiveJumps: m((r) => r.ball.offensiveJumps, 1),
      pursuit: { nearestBotM: { alpha: m((r) => r.ball.pursuit.nearestBotM.alpha, 0), bravo: m((r) => r.ball.pursuit.nearestBotM.bravo, 0) },
        meanBotM: { alpha: m((r) => r.ball.pursuit.meanBotM.alpha, 0), bravo: m((r) => r.ball.pursuit.meanBotM.bravo, 0) },
        within40Share: { alpha: m((r) => r.ball.pursuit.within40Share.alpha, 3), bravo: m((r) => r.ball.pursuit.within40Share.bravo, 3) },
        strikerShare: { alpha: m((r) => r.ball.pursuit.strikerShare.alpha, 3), bravo: m((r) => r.ball.pursuit.strikerShare.bravo, 3) } },
      goalApproach: list.some((r) => r.ball.goalApproach) ? { nearestGoalMinM: m((r) => r.ball.goalApproach?.nearestGoalMinM, 0), nearestGoalMeanM: m((r) => r.ball.goalApproach?.nearestGoalMeanM, 0),
        endThirdShare: m((r) => r.ball.goalApproach?.endThirdShare, 3), stillShare: m((r) => r.ball.goalApproach?.stillShare, 3), axisM: m((r) => r.ball.goalApproach?.axisM, 0),
        lowTouchMatches: list.filter((r) => r.ball.totalTouches < 20).length } : null };
  }
  if (mode === 'frontline_assault') {
    out.frontline = { sectors: m((r) => r.frontline.sectors, 1), sectorsTakenMean: m((r) => r.frontline.sectorsTaken), progressMean: m((r) => r.frontline.progress, 3),
      held: list.filter((r) => r.frontline.held).length,
      firstSectorS: md((r) => r.frontline.lines[0]?.atS), zoneTimeBotS: { alpha: m((r) => r.frontline.zoneTimeBotS.alpha, 0), bravo: m((r) => r.frontline.zoneTimeBotS.bravo, 0) },
      attackerZoneShare: m((r) => r.frontline.attackerZoneShare, 3), attackerDistToLiveZoneM: m((r) => r.frontline.attackerDistToLiveZoneM, 0),
      defenderDistToLiveZoneM: m((r) => r.frontline.defenderDistToLiveZoneM, 0),
      sector1FightRuns: list.filter((r) => (r.frontline.sector1Kills ?? 0) > 0).length, counterAttacksMean: m((r) => r.frontline.counterAttacks, 2),
      attackerWins: list.filter((r) => r.result === 'alpha').length, attackerWinShare: round(list.filter((r) => r.result === 'alpha').length / Math.max(1, list.length), 3),
      defendersPerWave: (() => { const acc = []; for (const r of list) r.frontline.waves.forEach((w, i) => { (acc[i] ??= []).push(w.enemies); }); return acc.map((xs) => round(mean(xs), 1)); })() };
  }
  if (list.some((r) => r.huntHonesty)) {
    out.huntHonesty = { unspottedShare: m((r) => r.huntHonesty?.unspottedShare, 3), samples: list.reduce((s, r) => s + (r.huntHonesty?.samples ?? 0), 0) };
  }
  if (mode === 'infected') {
    const side = (key) => ({ shotsPerBotMin: m((r) => r.infected[key].shotsPerBotMin), hitsPerBotMin: m((r) => r.infected[key].hitsPerBotMin),
      damagePerBotMin: m((r) => r.infected[key].damagePerBotMin, 1), hitRate: m((r) => r.infected[key].hitRate, 3) });
    out.infected = { survivors0: m((r) => r.infected.survivors0, 1), infected0: m((r) => r.infected.infected0, 1),
      outbreakWins: list.filter((r) => r.reason === 'outbreak_complete').length, survivorWins: list.filter((r) => r.reason === 'survivors_extracted').length,
      firstInfectionS: md((r) => r.infected.firstInfectionS), infectionsPerMatch: m((r) => r.infected.infections, 1), infectionsPerMin: m((r) => r.infected.infectionsPerMin),
      survivorsLeft: m((r) => r.infected.survivorsLeft, 1),
      outbreakEndMedianS: md((r) => (r.reason === 'outbreak_complete' ? r.endS : null), 0),
      survivorsByMin: (() => { const acc = []; for (const r of list) r.infected.survivorsByMin.forEach((v, i) => { if (v != null) (acc[i] ??= []).push(v); }); return acc.map((xs) => round(mean(xs), 1)); })(),
      survivors: side('survivors'), infectedSide: side('infectedSide'),
      huntDistToSurvivorM: m((r) => r.infected.huntDistToSurvivorM, 0), huntWithin150Share: m((r) => r.infected.huntWithin150Share, 3) };
  }
  if (mode === 'endless_horde') {
    out.horde = { roundsReachedMean: m((r) => r.horde.roundsReached), roundsReachedMedian: md((r) => r.horde.roundsReached), roundsReachedBest: Math.max(...pick((r) => r.horde.roundsReached)),
      wavesClearedMean: m((r) => r.horde.wavesCleared),
      enemiesPerRound: (() => { const acc = []; for (const r of list) r.horde.enemiesPerRound.forEach((n, i) => { (acc[i] ??= []).push(n); }); return acc.map((xs) => round(mean(xs), 1)); })(),
      deathsPerRound: (() => { const acc = []; for (const r of list) r.horde.deathsPerRound.forEach((d, i) => { (acc[i] ??= { humans: [], zombies: [] }); acc[i].humans.push(d.humans); acc[i].zombies.push(d.zombies); }); return acc.map((a, i) => ({ wave: i + 1, runs: a.humans.length, humans: round(mean(a.humans), 2), zombies: round(mean(a.zombies), 2) })); })(),
      hostileHullOfOwn: m((r) => r.horde.hostileHullOfOwn, 3), hostileMaxHp: m((r) => r.horde.hostileMaxHp, 0), humanMaxHp0: m((r) => r.horde.humanMaxHp0, 0),
      humanHpFracMean: m((r) => r.horde.humanHpFracMean, 3), humansDealt: m((r) => r.horde.damage.humansDealt, 0), zombiesDealt: m((r) => r.horde.damage.zombiesDealt, 0),
      zombieKillsPerHumanDeath: m((r) => r.horde.zombieKillsPerHumanDeath) };
    const laws = list.map((r) => r.horde.law).filter(Boolean);
    if (laws.length) {
      const perIndex = (f) => { const acc = []; for (const l of laws) f(l).forEach((v, i) => { if (v != null) (acc[i] ??= []).push(v); }); return acc; };
      const allContact = laws.flatMap((l) => l.firstContactPerWave).filter((v) => v != null);
      const allInter = laws.flatMap((l) => l.intermissionPerWave).filter((v) => v != null);
      out.horde.law = {
        arrivalsPerWave: perIndex((l) => l.arrivalsPerWave).map((xs) => round(median(xs), 1)),
        expectedPerWave: perIndex((l) => l.expectedPerWave).map((xs) => xs[0]),
        clearedOnLaw: laws.reduce((s, l) => s + l.clearedOnLaw, 0), cleared: laws.reduce((s, l) => s + l.cleared, 0),
        peakAliveMax: Math.max(...laws.map((l) => l.peakAlive)), poolIdentitiesMax: Math.max(...laws.map((l) => l.poolIdentities)),
        spawnChecks: laws.reduce((s, l) => s + l.spawnChecks, 0), spawnNear: laws.reduce((s, l) => s + l.spawnNear, 0),
        spawnSeen: laws.reduce((s, l) => s + l.spawnSeen, 0), spawnMinM: Math.min(...laws.map((l) => l.spawnMinM ?? Infinity)),
        firstContactPerWave: perIndex((l) => l.firstContactPerWave).map((xs) => round(median(xs), 1)),
        firstContactMinS: allContact.length ? round(Math.min(...allContact), 1) : null, firstContactMaxS: allContact.length ? round(Math.max(...allContact), 1) : null,
        firstContactOutside8to25: allContact.filter((v) => v < 8 || v > 25).length, firstContactWaves: allContact.length,
        intermissionMinS: allInter.length ? round(Math.min(...allInter), 2) : null, intermissionMaxS: allInter.length ? round(Math.max(...allInter), 2) : null,
        hullPerWave: perIndex((l) => l.hullPerWave).map((xs) => round(mean(xs), 3)),
        runsEndedBy15: list.filter((r) => r.result && r.horde.roundsReached <= 15).length,
      };
    }
  }
  return out;
}

function reportMarkdown(report) {
  const lines = [`# Mode aggression baseline`, '', `Tool: \`${report.tool}\` — runs in \`${report.dir}/runs\`, generated ${report.generated}.`, ''];
  if (report.errors.length) lines.push(`Errored runs: ${report.errors.join(', ')}`, '');
  const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)} %`);
  lines.push('## Every mode', '', '| mode | runs | results | end s (median) | first spot / shot / damage s | shots / hits per bot-min (alpha · bravo) | advance / hold / retreat (alpha) | advance / hold / retreat (bravo) | kills/min (alpha · bravo) |', '|---|---|---|---|---|---|---|---|---|');
  for (const [mode, a] of Object.entries(report.modes)) {
    lines.push(`| ${mode} | ${a.runs} | ${Object.entries(a.results).map(([k, v]) => `${k} ${v}`).join(', ')} | ${a.endS.median} | ${a.firstContact.spotS} / ${a.firstContact.shotS} / ${a.firstContact.damageS} | ${a.alpha.shotsPerBotMin} / ${a.alpha.hitsPerBotMin} · ${a.bravo.shotsPerBotMin} / ${a.bravo.hitsPerBotMin} | ${pct(a.alpha.advance)} / ${pct(a.alpha.hold)} / ${pct(a.alpha.retreat)} | ${pct(a.bravo.advance)} / ${pct(a.bravo.hold)} / ${pct(a.bravo.retreat)} | ${a.killsPerMin.alpha} · ${a.killsPerMin.bravo} |`);
  }
  lines.push('', '## Mode headlines', '');
  for (const [mode, a] of Object.entries(report.modes)) {
    const parts = [];
    if (a.frontline) parts.push(`progress ${pct(a.frontline.progressMean)} (${a.frontline.sectorsTakenMean}/${a.frontline.sectors} sectors, held ${a.frontline.held}/${a.runs}), first sector ${a.frontline.firstSectorS ?? '—'} s, attacker bots in the live zone ${pct(a.frontline.attackerZoneShare)} of their time, attackers ${a.frontline.attackerDistToLiveZoneM} m / defenders ${a.frontline.defenderDistToLiveZoneM} m from it`);
    if (a.horde) parts.push(`rounds reached ${a.horde.roundsReachedMean} (median ${a.horde.roundsReachedMedian}, best ${a.horde.roundsReachedBest}), enemies per round ${JSON.stringify(a.horde.enemiesPerRound)}, zombie hull ${pct(a.horde.hostileHullOfOwn)} of its own (${a.horde.hostileMaxHp} hp) vs humans ${a.horde.humanMaxHp0} hp, damage humans→zombies ${a.horde.humansDealt} / zombies→humans ${a.horde.zombiesDealt}, zombie kills per human death ${a.horde.zombieKillsPerHumanDeath}`);
    if (a.ctf) parts.push(`pickups ${a.ctf.pickupsPerMatch}, captures ${a.ctf.capturesPerMatch}, returns ${a.ctf.returnsPerMatch} (auto ${a.ctf.autoReturnsPerMatch}) per match, first pickup ${a.ctf.firstPickupS ?? '—'} s, no-pickup matches ${a.ctf.matchesWithNoPickup}/${a.runs}, nearest pursuer ${a.ctf.pursuit.nearestPursuerM ?? '—'} m, pursuers within 120 m ${pct(a.ctf.pursuit.within120Share)}`);
    if (a.ball) parts.push(`touches ${a.ball.touchesPerMatch} (${a.ball.touchesPerMin}/min), possession changes ${a.ball.possessionChangesPerMatch}, goals ${a.ball.goalsPerMatch} per match (goalless ${a.ball.matchesWithNoGoal}/${a.runs}), first touch ${a.ball.firstTouchS ?? '—'} s, nearest bot to the ball ${a.ball.pursuit.nearestBotM.alpha}/${a.ball.pursuit.nearestBotM.bravo} m, bots within 40 m ${pct(a.ball.pursuit.within40Share.alpha)}/${pct(a.ball.pursuit.within40Share.bravo)}${a.ball.goalApproach ? `, ball nearest a goal ${a.ball.goalApproach.nearestGoalMinM} m at best (scores inside 18 m; mean ${a.ball.goalApproach.nearestGoalMeanM} m, goal axis ${a.ball.goalApproach.axisM} m), in an end third ${pct(a.ball.goalApproach.endThirdShare)}, still ${pct(a.ball.goalApproach.stillShare)}, matches under 20 touches ${a.ball.goalApproach.lowTouchMatches}/${a.runs}` : ''}`);
    if (a.infected) parts.push(`outbreak wins ${a.infected.outbreakWins}/${a.runs}, first infection ${a.infected.firstInfectionS ?? '—'} s, infections ${a.infected.infectionsPerMatch} per match (${a.infected.infectionsPerMin}/min), survivors left ${a.infected.survivorsLeft} of ${a.infected.survivors0}, infected ${a.infected.huntDistToSurvivorM} m from the nearest survivor (within 150 m ${pct(a.infected.huntWithin150Share)}), fire per bot-min survivors ${a.infected.survivors.shotsPerBotMin} / infected ${a.infected.infectedSide.shotsPerBotMin}`);
    if (a.huntHonesty) parts.push(`hunt objective on an unspotted survivor ${pct(a.huntHonesty.unspottedShare)} of hostile samples`);
    parts.push(`roster: allies ${a.roster.alliesDistinct} nations (player's ${pct(a.roster.alliesPlayerNationShare)}), enemies ${a.roster.enemiesDistinct} nations (modal ${pct(a.roster.enemiesModalShare)}), ${a.roster.sharedNations} on both sides`);
    lines.push(`- **${mode}**: ${parts.join('; ')}`);
  }
  lines.push('');
  for (const [mode, a] of Object.entries(report.modes)) {
    lines.push(`## ${mode}`, '', `Seeds ${a.seeds.join(', ')} on ${a.maps.join(', ')}; engine ${a.engine}, player seat ${a.playerSeat}${a.teamSurvival ? ', team survival' : ''}. ${a.resultsBySeed}`, '');
    lines.push(`- AI states (alpha): ${JSON.stringify(a.alpha.ai)}; (bravo): ${JSON.stringify(a.bravo.ai)}`);
    lines.push(`- AI flags (alpha): ${JSON.stringify(a.alpha.flags)}; (bravo): ${JSON.stringify(a.bravo.flags)}`);
    lines.push(`- Roster: allies ${a.roster.alliesDistinct} nations (modal ${pct(a.roster.alliesModalShare)}, player's nation ${pct(a.roster.alliesPlayerNationShare)}), enemies ${a.roster.enemiesDistinct} nations (modal ${pct(a.roster.enemiesModalShare)}), ${a.roster.sharedNations} nations on both sides`);
    if (a.ctf) lines.push(`- CTF: ${JSON.stringify(a.ctf)}`);
    if (a.ball) lines.push(`- Turbo Ball: ${JSON.stringify(a.ball)}`);
    if (a.frontline) lines.push(`- Frontline: ${JSON.stringify(a.frontline)}`);
    if (a.horde) lines.push(`- Horde: ${JSON.stringify(a.horde)}`);
    if (a.infected) lines.push(`- Infected: ${JSON.stringify(a.infected)}`);
    if (a.huntHonesty) lines.push(`- Hunt honesty (hostile objective on an unspotted survivor): ${JSON.stringify(a.huntHonesty)}`);
    lines.push(`- Death causes (all runs): ${JSON.stringify(a.deathCauses)}`);
    lines.push(`- Engagement distance m (alpha · bravo): ${a.alpha.engageDistM} · ${a.bravo.engageDistM}`);
    lines.push(`- Engaged and standing still (alpha · bravo): ${pct(a.alpha.engagedStillShare)} · ${pct(a.bravo.engagedStillShare)}; ran dry (bots, alpha · bravo): ${a.alpha.ranDry} · ${a.bravo.ranDry}; player ran dry in ${a.playerRanDry ?? 0}/${a.runs}`);
    lines.push('', '| min | alpha→objective m | bravo→objective m | alpha→enemy m | bravo→enemy m | alpha advance | bravo advance |', '|---|---|---|---|---|---|---|');
    for (const o of a.overTime) lines.push(`| ${o.min} (${o.runs}) | ${o.alphaObjM ?? '—'} | ${o.bravoObjM ?? '—'} | ${o.alphaEnemyM ?? '—'} | ${o.bravoEnemyM ?? '—'} | ${pct(o.alphaAdvance)} | ${pct(o.bravoAdvance)} |`);
    lines.push('');
  }
  if (report.roster) {
    lines.push('## Roster nation census (no simulation)', '', '| mode | arrangement | allies nations | allies modal | allies player nation | allies pure runs | enemies nations | enemies modal | enemies arranged nation | shared nations |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const [mode, byArr] of Object.entries(report.roster)) for (const [name, s] of Object.entries(byArr)) {
      lines.push(`| ${mode} | ${name} | ${s.allies.distinct} | ${pct(s.allies.modalShare)} | ${pct(s.allies.playerNationShare)} | ${s.allies.playerNationPureRuns}/${s.runs} | ${s.enemies.distinct} | ${pct(s.enemies.modalShare)} | ${pct(s.enemies.arrangedNationShare)} | ${s.sharedNations} |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
