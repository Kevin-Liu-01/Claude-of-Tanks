// Destruction in both simulations (docs/DESTRUCTION.md): the solo step (game/state.ts) and the network authority
// (sim/authoritativeMatch.ts) own one destruction match each and call it at the same moments; the authority, run for
// real, brings a house down under a hull driven into it at speed (a `structure_stage` event per stage, the collision
// swapped, the hull through the rubble line) and replays it bit for bit; the shell paths price a real HE round and a
// real APFSDS round on a structure as the catalog says.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { createDestructionMatch } from './destructionMatch.ts';
import { matchRulesetFor } from './matchRuleset.ts';
import { kineticStructurePoints, munitionChargeKg, structureBlastPoints } from './munitionBlast.ts';
import { ramStructurePoints, structureHitPoints } from './structureDamage.ts';
import { createObstacleGrid, setCompoundShape, setObbShape } from '../world/collision.ts';
import { getSpec } from '../vehicles/specs.ts';

const solo = readFileSync(new URL('../game/state.ts', import.meta.url), 'utf8');
const authority = readFileSync(new URL('./authoritativeMatch.ts', import.meta.url), 'utf8');

// ---- both sims call the same seam at the same moments ---------------------------------------------------------------
for (const [name, text, prefix] of [['solo', solo, 'game\\._destruction\\?\\.'], ['authority', authority, 'destruction\\.']]) {
  assert.match(text, /createDestructionMatch\(\{\s*rules: (game\.)?ruleset\.destruction, obstacles:/, `${name}: one destruction match from the ruleset block`);
  assert.match(text, new RegExp(`${prefix}shellWorldHit\\(shell\\.spec, (hit|worldHit)\\.record,`), `${name}: a shell meeting the world`);
  assert.match(text, new RegExp(`${prefix}shellBurst\\(shell\\.spec, strike\\.x, strike\\.y, strike\\.z, shell\\.vel\\.x, shell\\.vel\\.z\\)`),
    `${name}: a round bursting on a hull`);
  assert.match(text, new RegExp(`if \\(entity\\._ramRecord && state\\.impactSource === IMPACT_SOURCE_COLLIDER\\) \\{\\s*${prefix}ram\\(entity\\._ramRecord, entity\\.spec\\.weightTons, closing, prior,`),
    `${name}: a crash into a structure prices a ram on the closing speed it adds`);
  assert.match(text, /if \((self|entity) && obstacle\.structureIdx !== undefined && !(self|entity)\._ramRecord\) (self|entity)\._ramRecord = obstacle;|if \(obstacle\.structureIdx !== undefined && !entity\._ramRecord\) entity\._ramRecord = obstacle;/,
    `${name}: the hard contact names the structure`);
  assert.match(text, /entity\._ramRecord = null;\s*entity\._ramKeep = undefined;\s*try \{ updateTank\(/, `${name}: the record is the tick's own`);
  assert.match(text, /\} finally \{ if \(parking\)[^\n]*\}\s*\n\s*if \(entity\._ramKeep !== undefined\) entity\.state\.speed \*= entity\._ramKeep;|finally \{ if \(parking\)[^\n]*\n\s*if \(entity\._ramKeep !== undefined\) entity\.state\.speed \*= entity\._ramKeep;/,
    `${name}: a hull keeps the yielded share of its speed after the move`);
  assert.match(text, /const closing = Math\.max\(0, -state\.speed \* \(Math\.sin\(state\.yaw\) \* pushX \+ Math\.cos\(state\.yaw\) \* pushZ\) \/ length\);\s*return (game\._destruction|destruction)\.ramThrough\(obstacle, entity\.spec\.weightTons, closing, Math\.abs\(state\.speed\),/,
    `${name}: a structure a ram brings down yields on the closing speed along the contact`);
  assert.match(text, /tankDeath\((String\(payload\.cause\)|cause), (dead|ent)\.spec\.weightTons,/, `${name}: a hull's death bursts on the structures beside it`);
}
assert.match(authority, /advanceRepairs\(dt\);\s*advanceDestruction\(\);\s*updateVisibility\(\);/, 'the authority steps destruction before sight');
// the detonations (§11): solo raises munition:blast where the round burst; the authority carries the same facts to the
// peers (shell_impact: class, charge, struck structure; the direct shell_hit: the burst point), which raise it alike
assert.match(solo, /const blast = munitionBlastEventFor\(shell\.spec, hit\.point\.x, hit\.point\.y, hit\.point\.z,[\s\S]{0,260}hit\.record\?\.structureIdx, craterId\);\s*if \(blast\) bus\.emit\(DESTRUCTION_BUS_EVENTS\.blast, blast\);\s*bus\.emit\('shell:expired'/,
  'solo: a round meeting the world bursts before it expires, naming the structure it struck and the crater it dug');
assert.match(solo, /munitionBlastEventFor\(shell\.spec, strike\.x, strike\.y, strike\.z,[^\n]*'tank'\);\s*if \(blast\) bus\.emit\(DESTRUCTION_BUS_EVENTS\.blast, blast\);/,
  'solo: a round bursting on a hull');
assert.match(solo, /bus\.emit\(DESTRUCTION_BUS_EVENTS\.blast, \{ munition: cookOff \? 'cook_off' : 'fuel',/, 'solo: a cook-off or a fuel fire');
assert.match(authority, /emit\('shell_impact', \{\s*munition, chargeKg: munitionChargeKg\(shell\.spec, munition\),\s*\.\.\.\(typeof structureId === 'number' \? \{ structureId \} : \{\}\),/,
  'authority: a world impact carries the class, the charge and the struck structure');
assert.match(authority, /pendingTankBlast = \{ shellId: shell\.id, blast: \[strike\.x, strike\.y, strike\.z,/, 'authority: the burst on a hull rides the direct hit');
assert.match(solo, /tickRepairs\(game, bus, SIM_DT\);\s*stepDestruction\(game, bus, world\);/, 'the solo step steps it at the same place');
assert.match(solo, /resetStructureRecords\(world\.getObstacles\(\), worldColliders\);/, 'a reused solo world stands its buildings again');

// ---- the shell paths: a real HE round and a real APFSDS round on a structure ---------------------------------------
function houseRecords(id, cx, cz, w, d, h, baseY = 0) {
  const contact = setObbShape({ min: [0, baseY, 0], max: [0, baseY + 1.8, 0], kind: 'structure', structureIdx: id },
    cx, cz, w / 2, d / 2, 0);
  const shell = setCompoundShape({ min: [0, baseY, 0], max: [0, baseY + h, 0], kind: 'structure', structureIdx: id },
    [{ kind: 'obb', cx, cz, hw: w / 2, hl: d / 2, yaw: 0 }]);
  return { contact, shell };
}
{
  const { contact, shell } = houseRecords(0, 0, 0, 10, 8, 7);
  const match = createDestructionMatch({ rules: matchRulesetFor('standard').destruction, obstacles: [contact], colliders: [shell] });
  const house = match.structures.byId(0);
  const t90 = getSpec('t90m');
  const he = t90.gun.shells.find((round) => round.type === 'HE');
  const apfsds = t90.gun.shells.find((round) => round.type === 'APFSDS');
  match.shellWorldHit(apfsds, shell, 0, 2, -4, 0, 1);
  assert.ok(Math.abs((house.maxHp - house.hp) - kineticStructurePoints(apfsds)) < 1e-9, 'an APFSDS strike deals its kinetic points');
  const before = house.hp;
  match.shellWorldHit(he, shell, 0, 2, -4, 0, 1);
  assert.ok(Math.abs((before - house.hp) - structureBlastPoints(munitionChargeKg(he), 'he', 0)) < 1e-9,
    'an HE round on the wall deals its contact blast');
  const near = house.hp;
  match.shellWorldHit(he, null, 0, 0.2, -4 - 3, 0, 1);
  assert.ok(near - house.hp > 0 && near - house.hp < 2, 'the same round on the ground 3 m short deals its falloff');
  const far = house.hp;
  match.shellBurst(he, 60, 1, 60, 0, 1);
  assert.equal(house.hp, far, 'a burst on a hull 60 m off touches nothing');
}

// ---- the authority, run for real: a hull driven into a house brings it down -----------------------------------------
// A 24 × 6 m house, 6 m tall (864 m³: a house of 94 hit points) across the hull's path on verdant, as impactParity's wall,
// standing on the ground there (its contact record from the ground line to 1.8 m above it, as the build seats one).
const groundProbe = createAuthoritativeMatch({ mapId: 'verdant', seed: 1, countdownS: 0,
  players: [{ id: 'probe', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: -140, yaw: 0 } }] });
let houseBase = Infinity;
for (let x = -12; x <= 12; x += 2) for (let z = -38; z <= -32; z += 1) houseBase = Math.min(houseBase, groundProbe.heightField.getHeightAt(x, z));
const { contact: houseContact, shell: houseShell } = houseRecords(0, 0, -35, 24, 6, 6, houseBase - 0.2);
function houseWorld() {
  const obstacles = [structuredClone(houseContact)];
  const colliders = [structuredClone(houseShell)];
  return {
    mapId: 'verdant',
    getObstacles: () => obstacles,
    getColliders: () => colliders,
    queryObstacles: createObstacleGrid(obstacles),
  };
}
function houseMatch(seed = 7) {
  const world = houseWorld();
  const match = createAuthoritativeMatch({
    mapId: 'verdant', seed, countdownS: 0, worldCollision: world,
    players: [
      { id: 'ram-a', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: -140, yaw: 0 } },
      { id: 'ram-b', specId: 'm1a2', team: 'bravo', spawn: { x: 60, z: 120, yaw: Math.PI } },
    ],
  });
  match.onMatchReady();
  return { match, world };
}
const drive = new Map([['ram-a', { throttle: 1, steer: 0, brake: false, fire: false, aimYaw: 0, aimPitch: 0, shellSlot: 0 }]]);
function run(seed, steps, onTick = () => {}) {
  const { match, world } = houseMatch(seed);
  const stages = [];
  const seen = new Set();
  for (let i = 0; i < steps; i++) {
    match.step({ dt: 1 / 60, inputs: drive });
    for (const event of match.snapshot({ tick: i, serverTimeMs: i * 16, viewerId: 'ram-b', ackInputSeq: 1 }).events) {
      if (event.type !== 'structure_stage' || seen.has(event)) continue;
      seen.add(event);
      stages.push(event);
    }
    onTick(match, i);
  }
  return { match, world, stages };
}
{
  let crossedAt = -1;
  const { match, world, stages } = run(7, 900, (m, i) => {
    if (crossedAt < 0 && m.entityById.get('ram-a').state.pos.z > -32) crossedAt = i;
  });
  const hull = match.entityById.get('ram-a');
  assert.deepEqual(stages.map((event) => event.stage), ['damaged', 'breached', 'collapsed'],
    `a hull at speed brings the house down, one event a stage (seen by the other side: ${stages.map((e) => e.stage)})`);
  assert.ok(stages.every((event) => event.structureId === 0 && event.cause === 'ram' && event.munition === null), 'a ram');
  assert.equal(stages[0].massClass, 'house');
  assert.ok(Math.abs(stages[0].cx) < 1e-6 && Math.abs(stages[0].cz + 35) < 1e-6, 'the event carries the footprint identity');
  const hp = structureHitPoints(24 * 6 * 6);
  const total = stages.reduce((max, event) => Math.max(max, event.points), 0);
  assert.ok(total >= hp && total <= ramStructurePoints(hull.spec.weightTons, 30), `priced by the ram law (${total.toFixed(1)} SP of ${hp.toFixed(1)})`);
  assert.ok(stages.at(-1).integrity === 0, 'down to nothing');
  assert.equal(world.getObstacles()[0].crushed, true, 'the contact record no longer pushes');
  assert.equal(world.getColliders()[0].dead, true, 'the shell band no longer stops shells or sight');
  assert.ok(crossedAt > 0, 'the hull drove on through where the house stood');
  // the wall-crash receipt's hull stops dead against a wall; this one lost only the house's share of its speed
}
// ---- the authority's world impact names the structure a real round burst on (§11) ---------------------------------
// The house in a headless collision world (the dedicated hosts' facade: shells trace its colliders), an M1A2 30 m short
// of its south wall firing its HE round at it.
{
  const { createHeadlessCollisionWorld } = await import('../world/headlessCollisionWorld.ts');
  const { packCollisionRecord } = await import('../../tools/headlessWorldCollision.mjs');
  const world = createHeadlessCollisionWorld({ mapId: 'verdant', heightField: groundProbe.heightField,
    manifest: { obstacles: [packCollisionRecord(houseContact)], colliders: [packCollisionRecord(houseShell)], concealers: [] } });
  const match = createAuthoritativeMatch({ mapId: 'verdant', seed: 3, countdownS: 0, worldCollision: world,
    players: [
      { id: 'ram-a', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: -68, yaw: 0 } },
      { id: 'ram-b', specId: 'm1a2', team: 'bravo', spawn: { x: 60, z: 120, yaw: Math.PI } },
    ] });
  match.onMatchReady();
  const fire = new Map([['ram-a', { throttle: 0, steer: 0, brake: true, fire: true, aimYaw: 0, aimPitch: 0, shellSlot: 2 }]]);
  let impact = null;
  for (let i = 0; i < 900 && !impact; i++) {
    match.step({ dt: 1 / 60, inputs: fire });
    for (const event of match.eventsForViewer('ram-a')) if (event.type === 'shell_impact' && !impact) impact = event;
    match.afterEventBroadcast();
  }
  assert.ok(impact, 'the M1A2\'s HE round met the house');
  assert.equal(impact.munition, 'he');
  assert.ok(Math.abs(impact.chargeKg - munitionChargeKg(getSpec('m1a2').gun.shells[2])) < 1e-9, 'its charge');
  assert.equal(impact.structureId, 0, `the struck structure (${JSON.stringify(impact)})`);
  assert.ok(impact.z > -38.5 && impact.z < -37, `on the house's south wall (z ${impact.z.toFixed(2)})`);
}
{
  const digest = ({ match, stages }) => [
    ...match.entities.map((entity) => [entity.id, entity.state.pos.x.toFixed(9), entity.state.pos.z.toFixed(9),
      entity.state.speed.toFixed(9), entity.combat.hp].join('|')),
    ...stages.map((event) => `${event.stage}@${event.timeS.toFixed(4)}:${event.points.toFixed(6)}`),
  ].join('\n');
  assert.equal(digest(run(11, 600)), digest(run(11, 600)), 'the same seed and inputs replay the collapse bit for bit');
}

console.log('destructionParity: one seam called alike by the solo step and the authority; real HE and APFSDS rounds priced '
  + 'by the catalog; an authoritative hull rams a house down (three stage events, collision swapped, driven through) and '
  + 'replays bit for bit; detonations raised alike, a real HE round\'s impact naming the house PASS');
