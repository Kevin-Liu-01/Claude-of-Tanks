// The world-events audit's ghost findings as deterministic scenarios (ghost-crunch lane, 2026-10-02). The audit of
// 2026-10-02 (verdant, three seats, bot fill) failed once with a prop:crushed "for a prop the host never sent" on three
// views at once and a fall death presented 0.806 m from the authority's hull. Traced on the real harness:
//   - the crunch was the authority's own event, presented once, at the right tick, on the right record: a hedgehog's
//     crossed beams are separate obstacle records with ONE box centre, the event's effect carried only a position, and
//     the audit read that position back as the sibling beam (a record "never sent"); the event's own record then
//     showed a crush without an effect. Nothing client-side felled anything;
//   - the death was presented at the pose the frame showed — mid-air, one interpolation step before the landing — not
//     where the hull died.
// Fixed by the effect naming its obstacle (`prop:crushed.obstacleIndex`) and the death carrying its position
// (`tank_destroyed.{x,y,z}`). This receipt drives the real authority (src/sim/authoritativeMatch.ts) on verdant's
// collision shard and feeds what it emits, as the wire carries it, into the real battle presentation (renderer stubbed):
//   A. a hull driven into each shared-centre prop: one world_prop_destroyed fells the whole prop on the host (every
//      record crushed, one index listed); the presentation fells it once and its crunch names that index — a position
//      two records share cannot; a re-sent event (a migration) crunches nothing;
//   B. a hull falling to its death beside a crushable tree: the death names its position (the hull's at the death tick);
//      the presentation puts the explosion and wreck smoke there although its frame shows the hull mid-air; the host
//      crushed nothing it did not announce and the presentation crunched nothing but announced falls.
//   C. the real ghost falls the trace turned up: a world laid out otherwise than the authority's manifest. The mobile
//      tier counts fewer props and trees (verdant: 6,641 records against the manifest's 6,977, 57 at the same index,
//      half the trees elsewhere) and Frontline Assault's trench works add 144 records ahead of the trees; there the
//      record at the authority's index is another prop, and every fall felled it — a tree nobody touched, with its
//      crunch. Built here from the manifest (a lighter world with records left out, a variant world with records ahead,
//      one that claims the base layout): every fall the authority sends fells the viewer's own record of that prop or
//      nothing, never another; the persistent list is not read by index on such a world, and through the authority's
//      identities it lays down exactly the props that fell.
// No network, no wall clock: fixed seed, fixed inputs, fixed frames.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { ensureAuthorityFleet } from '../src/vehicles/authorityFleet.ts';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.ts';
import { SIM_DT } from '../src/sim/movement.ts';
import { createDedicatedWorldCollision } from '../server/dedicatedWorldCollision.ts';
import { decodeCollisionManifest } from '../server/collisionManifestCodec.ts';
import { createHeadlessCollisionWorld } from '../src/world/headlessCollisionWorld.ts';
import { createBattlePresentation } from '../src/mp/presentation/battlePresentation.ts';
import { createEntitySample } from '../src/mp/match/interpolation.ts';
import { ENTITY_FLAGS, PHASE, TEAM, VERDICT } from '../src/mp/wire/index.ts';

const MAP_ID = 'verdant';
await ensureAuthorityFleet(['m1a2', 't90m']);

const anchorOf = (o) => [(o.min[0] + o.max[0]) * 0.5, o.min[1], (o.min[2] + o.max[2]) * 0.5];
const centreKey = (pos) => pos.map((v) => Number(v).toFixed(3)).join(',');
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** What the wire delivers: the event as JSON, under its kind. */
const wire = (event) => ({ kind: event.type, payload: JSON.parse(JSON.stringify(event)) });
const OTHER = { own: false, feedbackPredicted: false };

function stepAndCollect(match, inputs, events, ticks, until = () => false) {
  for (let tick = 0; tick < ticks; tick++) {
    match.step({ dt: SIM_DT, inputs });
    for (const event of match.eventsForViewer('__audit__')) events.push({ tick: match.timeS, event });
    match.afterEventBroadcast();
    if (until()) return tick + 1;
  }
  return ticks;
}

/** The real battle presentation over a client copy of the shard (or `world`), logging the crushes it applies and the bus events it emits. */
function clientPresentation(world = createDedicatedWorldCollision(MAP_ID)) {
  const crushes = [];
  const bus = [];
  const worldCollision = {
    heightField: world.heightField,
    getObstacles: () => world.getObstacles(),
    queryObstacles: (...args) => world.queryObstacles(...args),
    // the headless seam fells the record's siblings (a hedgehog's beams) as the browser's clutter does
    crushObstacle(obstacle, dx, dz, speed, cause, options) { crushes.push({ index: world.getObstacles().indexOf(obstacle), dx, dz, speed, cause, settled: !!options?.settled }); return world.crushObstacle(obstacle); },
    layoutTier: world.layoutTier ?? null, terrainVariant: world.terrainVariant ?? null,
  };
  const fakeVisual = () => ({
    root: { position: new Vector3(), userData: {} }, setVisible() {}, syncFromState() {}, dispose() {}, recoilKick() { return -1; },
    gunMuzzleWorld(out) { return out.set(0, 2, 0); }, gunDirWorld(out) { return out.set(0, 0, 1); },
    stripEra() {}, resetEra() {}, setDestroyed() {}, resetDestroyed() {},
  });
  const game = { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, allTanks: [], timeS: 0, preBattleS: 0, result: null, resultReason: null, mapId: MAP_ID };
  const presentation = createBattlePresentation({
    engineCtx: { scene: { add() {} }, anisotropy: 1 }, game, worldCollision,
    // a crunch is emitted right after the crush it belongs to: pair it with the record this world felled
    bus: { emit(type, payload) { bus.push({ type, payload, felled: type === 'prop:crushed' ? crushes.at(-1)?.index ?? null : null }); } },
    createTankVisual: fakeVisual, prepareVisualTextures: async () => {},
  });
  return { world, presentation, crushes, bus };
}

// ------------------------------------------------------------ A. the shared-centre prop
const reference = createDedicatedWorldCollision(MAP_ID).getObstacles();
const byCentre = new Map();
reference.forEach((o, index) => {
  if (!o.crushable || o.propIdx == null) return;
  const key = centreKey(anchorOf(o));
  if (!byCentre.has(key)) byCentre.set(key, []);
  byCentre.get(key).push(index);
});
const sharedGroups = [...byCentre.values()].filter((list) => list.length > 1);
assert.ok(sharedGroups.length > 0, `${MAP_ID} has crushable records sharing a box centre (its hedgehogs' crossed beams)`);
let sharedEventProps = 0;
const drives = [];
for (const pair of sharedGroups) {
  const propIdx = reference[pair[0]].propIdx;
  const records = reference.map((o, i) => (o.propIdx === propIdx ? i : -1)).filter((i) => i >= 0);
  const [cx, , cz] = anchorOf(reference[pair[0]]);
  const hostWorld = createDedicatedWorldCollision(MAP_ID, { retain: true });
  const match = createAuthoritativeMatch({
    mapId: MAP_ID, seed: 7, countdownS: 0, worldCollision: hostWorld,
    players: [
      { id: 'driver', specId: 'm1a2', team: 'alpha', spawn: { x: cx, z: cz - 9, yaw: 0 } },
      { id: 'far', specId: 't90m', team: 'bravo', spawn: { x: cx + 160, z: cz + 160, yaw: 0 } },
    ],
  });
  match.onMatchReady();
  const inputs = new Map([['driver', { throttle: 1, steer: 0, brake: false, fire: false, aimYaw: 0, aimPitch: 0, aimDistance: 300, shellSlot: 0, aimLocked: false, actionBits: 0 }]]);
  const events = [];
  const felled = () => events.some(({ event }) => event.type === 'world_prop_destroyed' && records.includes(event.obstacleIndex));
  const at = stepAndCollect(match, inputs, events, 900, felled);
  assert.ok(felled(), `the hull driven at prop ${propIdx} (records ${records.join('/')}) fells it within ${at} ticks`);
  // drive on through the whole prop: no second event for any of its records
  stepAndCollect(match, inputs, events, 180);
  const propEvents = events.filter(({ event }) => event.type === 'world_prop_destroyed' && records.includes(event.obstacleIndex));
  assert.equal(propEvents.length, 1, `prop ${propIdx}: its ${records.length} records fall together, with one event (got ${propEvents.map(({ event }) => event.obstacleIndex).join(', ')})`);
  const fell = propEvents[0].event;
  assert.ok(records.every((index) => hostWorld.getObstacles()[index].crushed), `prop ${propIdx}: every record crushed in the host world`);
  const listed = match.snapshot({ tick: 0, serverTimeMs: 0, viewerId: '__audit__', ackInputSeq: null }).meta.destroyedObstacleIndices.filter((index) => records.includes(index));
  assert.deepEqual(listed, [fell.obstacleIndex], `prop ${propIdx}: the persistent list names the felled record once`);

  // the client: the same event, as the wire delivers it
  const client = clientPresentation();
  client.presentation.applyEvent(wire(fell), OTHER);
  const crunches = client.bus.filter(({ type }) => type === 'prop:crushed');
  assert.equal(crunches.length, 1, `prop ${propIdx}: one crunch`);
  assert.deepEqual(client.crushes.map(({ index, settled }) => [index, settled]), [[fell.obstacleIndex, false]], `prop ${propIdx}: the event's record falls live, once`);
  assert.ok(records.every((index) => client.world.getObstacles()[index].crushed), `prop ${propIdx}: the client's records all fall with it`);
  const crunch = crunches[0].payload;
  assert.equal(crunch.obstacleIndex, fell.obstacleIndex, `prop ${propIdx}: the crunch names the record the authority felled`);
  assert.ok(distance(crunch.pos, anchorOf(reference[fell.obstacleIndex])) < 1e-9, `prop ${propIdx}: at that record's anchor`);
  assert.ok(Math.abs(crunch.h - (reference[fell.obstacleIndex].max[1] - reference[fell.obstacleIndex].min[1])) < 1e-9, 'sized by the prop, as the solo crush is');
  const sharing = (byCentre.get(centreKey(crunch.pos)) ?? []).length;
  if (pair.includes(fell.obstacleIndex)) {
    sharedEventProps++;
    // the 2026-10-02 artifact: this position names two records, so the effect must carry its index
    assert.ok(sharing > 1, `prop ${propIdx}: the felled record's anchor is shared (${pair.join('/')})`);
  }
  // a re-send (a migrated host re-delivering the same fall) fells nothing twice and crunches nothing
  client.presentation.applyEvent(wire(fell), OTHER);
  assert.equal(client.bus.filter(({ type }) => type === 'prop:crushed').length, 1, `prop ${propIdx}: a re-sent fall crunches nothing`);
  assert.equal(client.crushes.length, 1, `prop ${propIdx}: a re-sent fall fells nothing`);
  drives.push(`${reference[fell.obstacleIndex].kind} ${propIdx} → ${fell.obstacleIndex}${pair.includes(fell.obstacleIndex) ? ` (centre shared with ${pair.filter((i) => i !== fell.obstacleIndex).join('/')})` : ''}`);
  client.presentation.dispose();
  hostWorld.release?.();
}
assert.ok(sharedEventProps > 0, 'at least one drive fells a prop through a record whose anchor another record shares (the ambiguous case)');

// ------------------------------------------------------------ B. a fall death beside a crushable tree
let tree = null;
reference.forEach((o, index) => {
  if (o.treeIdx == null || !o.crushable) return;
  const [x, , z] = anchorOf(o);
  if (!tree || Math.hypot(x, z) < Math.hypot(tree.anchor[0], tree.anchor[2])) tree = { index, anchor: anchorOf(o) };
});
assert.ok(tree, 'a crushable tree to fall beside');
const hostWorld = createDedicatedWorldCollision(MAP_ID, { retain: true });
const fall = createAuthoritativeMatch({
  mapId: MAP_ID, seed: 11, countdownS: 0, worldCollision: hostWorld,
  players: [
    { id: 'faller', specId: 'm1a2', team: 'alpha', spawn: { x: tree.anchor[0] + 2.5, z: tree.anchor[2], yaw: 0 } },
    { id: 'viewer', specId: 't90m', team: 'bravo', spawn: { x: tree.anchor[0] + 160, z: tree.anchor[2] + 160, yaw: 0 } },
  ],
});
fall.onMatchReady();
const faller = fall.entityById.get('faller');
// 40 m up (the ride integrator owns the hull's height), one hit point: the authority's fall pricing kills it on landing
faller.state.pos.y += 40;
Object.assign(faller.state._ride, { y: faller.state.pos.y, v: 0, grounded: false });
faller.state.grounded = false;
faller.combat.hp = 1;
const poses = [];   // the hull at the end of every tick
const fallEvents = [];
let deathTick = -1;
for (let tick = 1; tick <= 600 && deathTick < 0; tick++) {
  fall.step({ dt: SIM_DT, inputs: new Map() });
  poses.push([faller.state.pos.x, faller.state.pos.y, faller.state.pos.z]);
  for (const event of fall.eventsForViewer('__audit__')) {
    fallEvents.push({ tick, event });
    if (event.type === 'tank_destroyed' && event.id === 'faller') deathTick = tick;
  }
  fall.afterEventBroadcast();
}
assert.ok(deathTick > 0, 'the hull dropped on one hit point dies on landing');
const death = fallEvents.find(({ event }) => event.type === 'tank_destroyed' && event.id === 'faller').event;
assert.equal(death.cause, 'fall');
const died = poses[deathTick - 1];
const named = [death.x, death.y, death.z];
assert.ok(named.every(Number.isFinite) && distance(named, died) < 1e-3, `the death names where the hull died: ${named.join(',')} vs ${died.map((v) => v.toFixed(3))}`);
// the host's prop state: every crushed record near the landing was announced, or is a sibling of an announced one
const announced = new Set(fallEvents.filter(({ event }) => event.type === 'world_prop_destroyed').map(({ event }) => event.obstacleIndex));
const announcedOwners = new Set([...announced].map((index) => { const o = hostWorld.getObstacles()[index]; return o.propIdx != null ? `p${o.propIdx}` : `t${o.treeIdx}`; }));
const silentlyCrushed = hostWorld.getObstacles().map((o, index) => ({ o, index })).filter(({ o, index }) => o.crushed && !announced.has(index)
  && !announcedOwners.has(o.propIdx != null ? `p${o.propIdx}` : `t${o.treeIdx}`));
assert.deepEqual(silentlyCrushed.map(({ index }) => index), [], 'the host crushed nothing it did not announce');

// the viewer's presentation: the frame shows the hull two ticks before it landed — the 2026-10-02 case
const client = clientPresentation();
const roster = [
  { entityId: 1, seat: 0, team: TEAM.ALPHA, bot: false, connected: true, playerId: 'faller', name: 'Faller', specId: 'm1a2' },
  { entityId: 2, seat: 1, team: TEAM.BRAVO, bot: false, connected: true, playerId: 'viewer', name: 'Viewer', specId: 't90m' },
];
await client.presentation.applyRoster(roster, { ownEntityId: 2, ownPlayerId: 'viewer', roomId: 'r', mapId: MAP_ID, mode: 'standard', rulesetJson: '{}' });
function sample(entityId, pos, flags = 0) {
  return Object.assign(createEntitySample(entityId), {
    x: pos[0], y: pos[1], z: pos[2], yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0, hp: flags & ENTITY_FLAGS.DESTROYED ? 0 : 1, maxHp: 2000,
    reloadS: 0, reloadTotalS: 6, reloadKind: 'ready', gunReloadS: 0, gunReloadTotalS: 6, gunReloadKind: 'ready',
    ammo0: 20, ammo1: 4, ammo2: 2, flags, snapped: false, eraSpent: [],
  });
}
const midAir = poses[deathTick - 3];
const frame = {
  tick: deathTick, renderTimeMs: deathTick * 1000 / 60, entities: [sample(1, midAir)], shells: [],
  meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: 10_000, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: 0 },
  modeStateJson: null, destroyed: [], destructibleRevision: 0, destroyedPending: () => false,
  viewer: { entityId: 2, playerId: 'viewer', state: null, row: null, viewer: null, authorityTick: deathTick, authorityReceivedAtMs: null, predictedShot: null },
  events: [], ownShots: [], extrapolatedMs: 0, phase: 'live',
};
client.presentation.applyFrame(frame);
const presentedPose = [client.presentation.actors.get('faller').state.pos.x, client.presentation.actors.get('faller').state.pos.y, client.presentation.actors.get('faller').state.pos.z];
assert.ok(distance(presentedPose, died) > 0.3, `the frame shows the hull ${distance(presentedPose, died).toFixed(3)} m from where it died (the case the receipt guards)`);
for (const { event } of fallEvents) client.presentation.applyEvent(wire(event), OTHER);
const destroyed = client.bus.filter(({ type }) => type === 'tank:destroyed');
assert.equal(destroyed.length, 1);
assert.ok(distance(destroyed[0].payload.pos, died) < 1e-3, `the explosion and wreck smoke sit where the hull died, not where the frame shows it: ${destroyed[0].payload.pos.map((v) => v.toFixed(3))} vs ${died.map((v) => v.toFixed(3))} (${distance(destroyed[0].payload.pos, died).toFixed(3)} m)`);
// a death beside props crunches nothing the authority did not fell
const crunched = client.bus.filter(({ type }) => type === 'prop:crushed').map(({ payload }) => payload.obstacleIndex);
assert.deepEqual(crunched.sort((a, b) => a - b), [...announced].sort((a, b) => a - b), 'the presentation crunched exactly the falls the authority announced');
assert.ok(client.crushes.every(({ index }) => announced.has(index)), 'and felled nothing else');
client.presentation.dispose();
hostWorld.release?.();

// ------------------------------------------------------------ C. worlds laid out otherwise
// The authority: three hulls ploughing north through verdant's densest stand for 30 s on the manifest world; every fall
// it sends, and its final list.
const stands = new Map();
reference.forEach((o) => {
  if (o.treeIdx == null || !o.crushable) return;
  const [x, , z] = anchorOf(o);
  if (Math.abs(x) > 300 || Math.abs(z) > 300) return;
  const key = `${Math.floor(x / 40)},${Math.floor(z / 40)}`;
  stands.set(key, (stands.get(key) ?? 0) + 1);
});
const [standKey] = [...stands.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
const [standX, standZ] = standKey.split(',').map((v) => Number(v) * 40);
const ploughWorld = createDedicatedWorldCollision(MAP_ID, { retain: true });
const plough = createAuthoritativeMatch({
  mapId: MAP_ID, seed: 23, countdownS: 0, worldCollision: ploughWorld,
  players: [
    { id: 'p1', specId: 'm1a2', team: 'alpha', spawn: { x: standX + 8, z: standZ - 12, yaw: 0 } },
    { id: 'p2', specId: 't90m', team: 'alpha', spawn: { x: standX + 20, z: standZ - 12, yaw: 0 } },
    { id: 'p3', specId: 'm1a2', team: 'bravo', spawn: { x: standX + 32, z: standZ - 12, yaw: 0 } },
  ],
});
plough.onMatchReady();
const drive = (tick, phase) => ({ throttle: 1, steer: Math.sin((tick + phase) / 150) * 0.35, brake: false, fire: false, aimYaw: 0, aimPitch: 0, aimDistance: 300, shellSlot: 0, aimLocked: false, actionBits: 0 });
const falls = [];
for (let tick = 1; tick <= 1800; tick++) {
  plough.step({ dt: SIM_DT, inputs: new Map([['p1', drive(tick, 0)], ['p2', drive(tick, 300)], ['p3', drive(tick, 600)]]) });
  for (const event of plough.eventsForViewer('__audit__')) if (event.type === 'world_prop_destroyed') falls.push(event);
  plough.afterEventBroadcast();
}
const finalList = plough.snapshot({ tick: 0, serverTimeMs: 0, viewerId: '__audit__', ackInputSeq: null }).meta.destroyedObstacleIndices;
assert.ok(falls.length >= 10, `the authority fells enough props to judge (${falls.length})`);
const authorityRecords = ploughWorld.getObstacles();
/** Whether a record of some world is the prop the authority's `index` names (box centre within 1 cm, same kind). */
const isAuthorityProp = (record, index) => {
  const o = authorityRecords[index];
  if (!record || !o) return false;
  return Math.abs((record.min[0] + record.max[0]) * 0.5 - (o.min[0] + o.max[0]) * 0.5) <= 0.01
    && Math.abs((record.min[2] + record.max[2]) * 0.5 - (o.min[2] + o.max[2]) * 0.5) <= 0.01
    && (!o.kind || !record.kind || record.kind === o.kind);
};
const authorityIdentity = (index) => { const o = authorityRecords[index]; return o ? { x: (o.min[0] + o.max[0]) * 0.5, z: (o.min[2] + o.max[2]) * 0.5, kind: o.kind ?? null } : null; };

const manifest = decodeCollisionManifest(JSON.parse(readFileSync(new URL(`../server/world-collision-manifests/${MAP_ID}.json`, import.meta.url), 'utf8')));
const heightField = createDedicatedWorldCollision(MAP_ID).heightField;
const firstTree = manifest.obstacles.findIndex((record) => record.t != null);
const felledTrees = new Set(falls.map((event) => authorityRecords[event.obstacleIndex]?.treeIdx).filter((treeIdx) => treeIdx != null));
/** Records moved 3 m east and stripped of their prop: trench works the authority's manifest never had. */
const works = manifest.obstacles.slice(0, 144).map((record) => ({ ...record, b: [record.b[0] + 3, record.b[1], record.b[2], record.b[3] + 3, record.b[4], record.b[5]], p: undefined, s: undefined }));
const build = (obstacles, extra = {}) => Object.assign(createHeadlessCollisionWorld({ mapId: MAP_ID, heightField, manifest: { obstacles, colliders: [], concealers: [] } }), extra);
const layouts = {
  // the mobile tier's shape: a fifth of the props ahead of the trees missing (every later index shifts down) and half
  // of the trees this match fells never planted
  lighter: () => build(manifest.obstacles.filter((record, index) => (index >= firstTree || index % 5 !== 1)
    && !(record.t != null && felledTrees.has(record.t) && record.t % 2 === 0)), { layoutTier: 'mobile' }),
  // Frontline Assault's shape: trench works ahead of everything (every index shifts up)
  variant: () => build([...works, ...manifest.obstacles], { terrainVariant: 'assault-trenches' }),
  // laid out otherwise but claiming the base layout: the first fall's identity gives it away
  unannounced: () => build([...works, ...manifest.obstacles]),
  // the desktop tier's base map: the manifest itself
  base: () => createDedicatedWorldCollision(MAP_ID),
};
const layoutReport = [];
for (const [name, layout] of Object.entries(layouts)) {
  const probe = layout();
  const records = probe.getObstacles();
  const ghostsByIndex = falls.filter((event) => records[event.obstacleIndex] && !isAuthorityProp(records[event.obstacleIndex], event.obstacleIndex)).length;
  const held = falls.filter((event) => records.some((record) => isAuthorityProp(record, event.obstacleIndex)));
  if (name === 'base') assert.equal(ghostsByIndex, 0, 'base: the manifest world shares every index');
  else assert.ok(ghostsByIndex > falls.length / 2, `${name}: the record at the authority's index is another prop for ${ghostsByIndex} of ${falls.length} falls — the ghosts an index-only presentation played`);

  // live: every fall as the wire delivers it
  const live = clientPresentation(probe);
  assert.equal(live.presentation.sharesAuthorityIndices, name === 'base' || name === 'unannounced', `${name}: its layout says whether it shares the authority's indices`);
  for (const event of falls) live.presentation.applyEvent(wire(event), OTHER);
  const crunches = live.bus.filter(({ type }) => type === 'prop:crushed');
  const strangers = crunches.filter(({ payload, felled }) => !isAuthorityProp(records[felled], payload.obstacleIndex));
  assert.deepEqual(strangers.map(({ felled }) => felled), [], `${name}: every record felled is the prop the authority felled — never another in its stead`);
  assert.equal(live.crushes.length, crunches.length, `${name}: every fall crunches once, with the record it felled`);
  assert.equal(new Set(crunches.map(({ payload }) => payload.obstacleIndex)).size, crunches.length, `${name}: one crunch per fall`);
  const unfelled = held.filter((event) => !records.some((record) => isAuthorityProp(record, event.obstacleIndex) && record.crushed));
  assert.deepEqual(unfelled.map((event) => event.obstacleIndex), [], `${name}: every fall whose prop this world has fells it`);
  if (name === 'unannounced') assert.equal(live.presentation.sharesAuthorityIndices, false, 'unannounced: a fall whose record at its index is another prop proves the layout differs');
  live.presentation.dispose();

  // a late joiner on a fresh world: the persistent list alone, then with the authority's identities (a layout that does
  // not announce itself is only known by them: they come first there)
  const late = clientPresentation(layout());
  if (name === 'unannounced') late.presentation.setAuthorityObstacles(authorityIdentity);
  const listFrame = {
    tick: 900, renderTimeMs: 15_000, entities: [], shells: [],
    meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: 15_000, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: finalList.length },
    modeStateJson: null, destroyed: finalList, destructibleRevision: finalList.length, destroyedPending: () => false,
    viewer: { entityId: 0, playerId: '', state: null, row: null, viewer: null, authorityTick: 900, authorityReceivedAtMs: null, predictedShot: null },
    events: [], ownShots: [], extrapolatedMs: 0, phase: 'live',
  };
  late.presentation.applyFrame(listFrame);
  const byIndex = late.crushes.length;
  if (name === 'lighter' || name === 'variant') assert.equal(byIndex, 0, `${name}: the list (indices only) lays nothing down on a world laid out otherwise`);
  late.presentation.setAuthorityObstacles(authorityIdentity);
  late.presentation.applyFrame(listFrame);
  if (name === 'unannounced') assert.equal(late.presentation.sharesAuthorityIndices, false, 'unannounced: the authority\'s identities expose the layout');
  const laid = late.crushes.map(({ index }) => index);
  assert.ok(late.crushes.every(({ settled }) => settled), `${name}: the list lays props down settled`);
  assert.equal(late.bus.filter(({ type }) => type === 'prop:crushed').length, 0, `${name}: and crunches nothing`);
  const notListed = laid.filter((index) => !finalList.some((listed) => isAuthorityProp(late.world.getObstacles()[index], listed)));
  assert.deepEqual(notListed, [], `${name}: every prop laid down is one the authority destroyed`);
  const missed = finalList.filter((listed) => late.world.getObstacles().some((record) => isAuthorityProp(record, listed)) && !late.world.getObstacles().some((record) => isAuthorityProp(record, listed) && record.crushed));
  assert.deepEqual(missed, [], `${name}: every destroyed prop this world has lies down`);
  late.presentation.dispose();
  layoutReport.push(`${name} (${records.length} records): ${ghostsByIndex} of ${falls.length} falls name another prop by index, ${crunches.length} felled as their own prop (${falls.length - held.length} absent here), late list ${byIndex} by index then ${laid.length} by identity`);
}
ploughWorld.release?.();

console.log(`mp world events scenarios: ${drives.length} shared-centre props driven through, each felled by one event and crunched once under its own index (${drives.join('; ')}); `
  + `a fall death (tick ${deathTick}) beside tree ${tree.index} presented at the hull's death position though the frame showed it ${distance(presentedPose, died).toFixed(2)} m away mid-air; `
  + `${announced.size} falls announced there, nothing else crushed or crunched; worlds laid out otherwise — ${layoutReport.join('; ')}`);
