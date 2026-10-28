// Receipt for the tank id boundaries (SSOT 2.19, ID.03): an old save, an old
// replay, an old scene link, an old gallery URL, an old room seat (the wire's
// spec id) and telemetry, each written under schema 1 and naming a swapped id
// (leo2a6m meaning the Leopard 2A4 OTCO, t90m meaning the T-90AM), resolve to
// the right vehicle in a fixture schema 2 built from the rename table; data
// already in schema 2 is never renamed again. With the live schema (1 until a
// rename lands) every boundary is the identity.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTankIdResolver, TANK_IDS } from '../vehicles/tankIdAliases.ts';
import {
  galleryHref, linkTankId, replayInCurrentTankIds, sceneInCurrentTankIds, stampTankIdLink, telemetryTankId,
} from './tankIdBoundaries.ts';
import { migrateStoredTankIds, planTankIdStorageMigration, TANK_ID_STORAGE_SCHEMA_KEY } from './tankIdStorageMigration.ts';
import { sceneLinkPath } from './studioSceneLink.ts';
import { planFromMatchStart, planFromRoom } from '../mp/host/hostPlan.ts';

// The fixture world: the rename table's swaps for these ids, and the names the owner sees after it.
const fixture = createTankIdResolver({
  schema: 2,
  renames: [{
    leo2a6m: 'leo2a4_otco', leo2a6m_x: 'leo2a6m', leo2a4_otco: 'leo2a3',
    t90m: 't90am', t90m_x: 't90m', t14_x: 't14_armata', m1a2_sepv2_x: 'm1a2_sepv2', m1a2_sepv2: 'm1a1_aim',
  }],
});
const NAME = {
  leo2a4_otco: 'Leopard 2A4 OTCO', leo2a6m: 'Leopard 2A6M', leo2a3: 'Leopard 2A3',
  t90am: 'T-90AM', t90m: 'T-90M', t14_armata: 'T-14 Armata', m1a2_sepv2: 'M1A2 Abrams SEPv2', m1a3: 'M1E3 Abrams',
};
const shown = (id) => NAME[id] ?? `unknown:${id}`;

// ---- an old save (browser storage written by a schema-1 build)
function memoryStorage(entries) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}
const save = memoryStorage({
  'cot.lastTank.v1': 'leo2a6m',
  'cot.garage.nationTank.v1': JSON.stringify({ germany: 'leo2a6m', russia: 't90m_x', usa: 'm1a3' }),
  'cot.camo.leo2a6m': 'paint_otco',
  'cot.camo.leo2a6m_x': 'paint_2a6m',
  'cot.camoCustom.v1.leo2a6m_x': '{"base":"#445533"}',
  'cot.equip.t90m': '["smoke","repair","ammo"]',
  'cot.equip.m1a3': '["smoke"]',
  'cot.profile.v2': JSON.stringify({ version: 2, matches: 3, lastBattle: { result: 'victory', vehicleId: 't90m', mapId: 'verdant' } }),
  'cot.service.v1': JSON.stringify({
    version: 1, vehicles: ['leo2a6m', 't90m', 'm1a3'],
    history: [{ at: 1, vehicleId: 'leo2a6m', mapId: 'urban', trace: [{ t: 3, specId: 't90m', distM: 400, cause: 'shot' }] }],
  }),
  'cot.settings.v1': '{"volume":0.5}',
});
const migrated = migrateStoredTankIds(save, fixture);
assert.equal(migrated.from, 1);
assert.equal(migrated.to, 2);
const get = (k) => save.getItem(k);
assert.equal(shown(get('cot.lastTank.v1')), 'Leopard 2A4 OTCO', 'the last tank is still the 2A4 OTCO');
assert.deepEqual(JSON.parse(get('cot.garage.nationTank.v1')), { germany: 'leo2a4_otco', russia: 't90m', usa: 'm1a3' });
assert.equal(get('cot.camo.leo2a4_otco'), 'paint_otco', "the 2A4 OTCO keeps its paint");
assert.equal(get('cot.camo.leo2a6m'), 'paint_2a6m', "the 2A6M keeps its paint through the swap");
assert.equal(get('cot.camoCustom.v1.leo2a6m'), '{"base":"#445533"}');
assert.equal(get('cot.camoCustom.v1.leo2a6m_x'), null, 'the retired key is gone');
assert.equal(get('cot.equip.t90am'), '["smoke","repair","ammo"]', 'the T-90AM keeps its loadout');
assert.equal(get('cot.equip.t90m'), null);
assert.equal(get('cot.equip.m1a3'), '["smoke"]', 'an unrenamed key stays');
assert.equal(shown(JSON.parse(get('cot.profile.v2')).lastBattle.vehicleId), 'T-90AM');
const service = JSON.parse(get('cot.service.v1'));
assert.deepEqual(service.vehicles.map(shown), ['Leopard 2A4 OTCO', 'T-90AM', 'M1E3 Abrams']);
assert.equal(shown(service.history[0].vehicleId), 'Leopard 2A4 OTCO');
assert.equal(shown(service.history[0].trace[0].specId), 'T-90AM');
assert.equal(get('cot.settings.v1'), '{"volume":0.5}', 'other keys are untouched');
assert.equal(get(TANK_ID_STORAGE_SCHEMA_KEY), '2');
// Never twice: a second boot (and a value a schema-2 page wrote since) stays as it is.
save.setItem('cot.lastTank.v1', 'leo2a6m'); // the 2A6M, chosen on the schema-2 build
assert.equal(migrateStoredTankIds(save, fixture).changed.length, 0);
assert.equal(shown(get('cot.lastTank.v1')), 'Leopard 2A6M', 'schema-2 data is never renamed again');
// The live build (schema 1 until a rename lands) plans nothing and writes no stamp.
const live = memoryStorage({ 'cot.lastTank.v1': 'leo2a6m', 'cot.camo.leo2a6m_x': 'x' });
if (TANK_IDS.schema === 1) {
  assert.equal(planTankIdStorageMigration(live).writes.size, 0);
  migrateStoredTankIds(live);
  assert.equal(live.getItem(TANK_ID_STORAGE_SCHEMA_KEY), null);
}
assert.equal(migrateStoredTankIds(null).changed.length, 0, 'no storage, no work');

// ---- an old replay (a kill-cam payload staged without a stamp)
const oldReplay = {
  replayKind: 'projectile',
  ev: { kind: 'hit', attackerSpecId: 'leo2a6m', targetSpecId: 't90m' },
  attackerEnt: { id: 'e1', specId: 'leo2a6m' },
  targetEnt: { id: 'e2', specId: 't90m' },
};
const replay = replayInCurrentTankIds(oldReplay, fixture);
assert.equal(shown(replay.ev.attackerSpecId), 'Leopard 2A4 OTCO');
assert.equal(shown(replay.attackerEnt.specId), 'Leopard 2A4 OTCO');
assert.equal(shown(replay.ev.targetSpecId), 'T-90AM');
assert.equal(shown(replay.targetEnt.specId), 'T-90AM');
assert.equal(oldReplay.attackerEnt.specId, 'leo2a6m', 'the payload is not mutated');
const stampedReplay = { ...oldReplay, ...fixture.stamp() };
assert.equal(shown(replayInCurrentTankIds(stampedReplay, fixture).attackerEnt.specId), 'Leopard 2A6M', 'a stamped schema-2 replay is read as written');
if (TANK_IDS.schema === 2) assert.deepEqual(replayInCurrentTankIds(oldReplay), oldReplay, 'the live build: an old replay naming unrenamed ids reads as written');

// ---- an old scene link: /studio?scene=<file> loads that file under its own schema
const link = new URL('https://cot.kevinliu.studio/studio?scene=/media/site50-r14/scenes/s05-barn-advance.scene.json');
const scenePath = sceneLinkPath(link.searchParams.get('scene'));
assert.ok(scenePath, 'the scene link is accepted');
const sceneFile = JSON.parse(readFileSync(new URL(`../../public${scenePath}`, import.meta.url), 'utf8'));
assert.equal(sceneFile.tankIdSchema, undefined, 'the published scene predates the stamp (schema 1)');
assert.deepEqual(sceneFile.actors.map((a) => a.id), ['t14_x', 't90m_x', 'leo2a6m_x', 'm1a2_sepv2_x']);
const loaded = sceneInCurrentTankIds(sceneFile, fixture);
assert.deepEqual(loaded.actors.map((a) => shown(a.id)), ['T-14 Armata', 'T-90M', 'Leopard 2A6M', 'M1A2 Abrams SEPv2'],
  'the file\'s X studies keep their vehicles through the swap');
const oldScene = { map: 'verdant', actors: [{ id: 'leo2a6m', pos: [0, 0] }, { specId: 't90m', pos: [10, 0] }] };
assert.deepEqual(sceneInCurrentTankIds(oldScene, fixture).actors.map((a) => shown(a.id ?? a.specId)), ['Leopard 2A4 OTCO', 'T-90AM']);
assert.equal(sceneInCurrentTankIds({ ...oldScene, tankIdSchema: 2 }, fixture).actors[0].id, 'leo2a6m', 'a stamped scene is read as written');
if (TANK_IDS.schema === 2) assert.deepEqual(sceneInCurrentTankIds(sceneFile), sceneFile, 'the live build loads a file naming unrenamed ids as written');

// ---- an old gallery URL
const oldUrl = new URL('https://cot.kevinliu.studio/gallery?id=leo2a6m&layer=armor');
assert.equal(shown(linkTankId(oldUrl.searchParams, fixture)), 'Leopard 2A4 OTCO');
assert.equal(shown(linkTankId(new URL('https://x/gallery?id=t90m').searchParams, fixture)), 'T-90AM');
assert.equal(shown(linkTankId(new URL('https://x/gallery?id=leo2a6m&ids=2').searchParams, fixture)), 'Leopard 2A6M');
assert.equal(linkTankId(new URL('https://x/gallery').searchParams, fixture), null);
assert.equal(galleryHref('leo2a6m', fixture), '/gallery?id=leo2a6m&ids=2', 'links this build writes carry the schema');
const written = new URL('https://x/gallery?id=leo2a6m');
stampTankIdLink(written.searchParams, fixture);
assert.equal(written.searchParams.get('ids'), '2');
assert.equal(linkTankId(written.searchParams, fixture), 'leo2a6m', 'a written link reads back as the same vehicle');
if (TANK_IDS.schema === 1) assert.equal(galleryHref('leo2a6m'), '/gallery?id=leo2a6m', 'schema 1 links stay as they were');

// ---- an old room seat: the spec id a room (or the dedicated server's control plane) hands the host
const room = {
  players: [
    { id: 'p1', seat: 0, name: 'Kevin', team: 'alpha', specId: 'leo2a6m_x', connected: true, equipment: [] },
    { id: 'p2', seat: 1, name: 'Ana', team: 'bravo', specId: 'leo2a6m', connected: true, equipment: [] },
  ],
  settings: { botsFill: false, gameMode: 'standard', teamSize: 1, arrangement: null },
};
const seats = planFromRoom(room, { tankIds: fixture }).seats;
assert.equal(shown(seats.find((s) => s.playerId === 'p1').specId), 'Leopard 2A6M', 'a retired id from an older build still names its vehicle');
assert.equal(shown(seats.find((s) => s.playerId === 'p2').specId), 'Leopard 2A6M', 'a room on one build speaks current ids');
const started = planFromMatchStart({ plan: { seats: [{ seat: 0, playerId: 'p1', name: 'K', team: 'alpha', specId: 't90m_x' }], bots: [{ playerId: 'b', name: 'B', team: 'bravo', specId: 't14_x' }] } }, fixture);
assert.equal(shown(started.seats[0].specId), 'T-90M');
assert.equal(shown(started.bots[0].specId), 'T-14 Armata');
if (TANK_IDS.schema === 2) assert.equal(planFromRoom(room).seats[0].specId, 'leo2a6m_x', 'the live build passes current room ids through');

// ---- telemetry notes name the schema once a rename lands
assert.equal(telemetryTankId('leo2a6m', fixture), 'leo2a6m.s2');
if (TANK_IDS.schema === 1) assert.equal(telemetryTankId('leo2a6m'), 'leo2a6m');

// ---- the live schema 2 (2026-10-13, VEH-11): the Warrior MILAN X is the Warrior TES(H) at every boundary
if (TANK_IDS.schema >= 2) {
  const warriorSave = memoryStorage({
    'cot.lastTank.v1': 'fv510_milan_x', 'cot.camo.fv510_milan_x': 'dpm', 'cot.equip.fv510_milan_x': '["smoke"]',
    'cot.garage.nationTank.v1': JSON.stringify({ uk: 'fv510_milan_x' }),
    'cot.service.v1': JSON.stringify({ version: 1, vehicles: ['fv510_milan_x'], history: [] }),
  });
  migrateStoredTankIds(warriorSave);
  assert.equal(warriorSave.getItem('cot.lastTank.v1'), 'warrior_tes_h', 'an old save keeps its Warrior');
  assert.equal(warriorSave.getItem('cot.camo.warrior_tes_h'), 'dpm');
  assert.equal(warriorSave.getItem('cot.equip.warrior_tes_h'), '["smoke"]');
  assert.deepEqual(JSON.parse(warriorSave.getItem('cot.garage.nationTank.v1')), { uk: 'warrior_tes_h' });
  assert.deepEqual(JSON.parse(warriorSave.getItem('cot.service.v1')).vehicles, ['warrior_tes_h']);
  assert.equal(warriorSave.getItem(TANK_ID_STORAGE_SCHEMA_KEY), String(TANK_IDS.schema));
  const warriorScene = JSON.parse(readFileSync(new URL('../../public/media/site50-r14/scenes/s11-container-rows.scene.json', import.meta.url), 'utf8'));
  assert.ok(warriorScene.actors.some((a) => a.id === 'fv510_milan_x'), 'the published scene names the Warrior MILAN X');
  assert.ok(sceneInCurrentTankIds(warriorScene).actors.some((a) => a.id === 'warrior_tes_h'), 'an old scene link loads the Warrior TES(H)');
  assert.equal(replayInCurrentTankIds({ attackerEnt: { specId: 'fv510_milan_x' } }).attackerEnt.specId, 'warrior_tes_h');
  assert.equal(linkTankId(new URL('https://x/gallery?id=fv510_milan_x').searchParams), 'warrior_tes_h', 'an old gallery link');
  assert.equal(galleryHref('warrior_tes_h'), `/gallery?id=warrior_tes_h&ids=${TANK_IDS.schema}`, 'new links carry the schema');
  assert.equal(planFromRoom({ ...room, players: [{ ...room.players[0], specId: 'fv510_milan_x' }] }).seats[0].specId, 'warrior_tes_h',
    'a room seat from an older build');
  assert.equal(telemetryTankId('warrior_tes_h'), `warrior_tes_h.s${TANK_IDS.schema}`);
}

// ---- the live schema 3 (ID.04/05): the bulk rename, swaps included, at every boundary
if (TANK_IDS.schema >= 3) {
  const liveReplay = replayInCurrentTankIds(oldReplay);
  assert.equal(liveReplay.attackerEnt.specId, 'leo2a4_otco', 'an old replay keeps its Leopard 2A4 OTCO through the swap');
  assert.equal(liveReplay.ev.targetSpecId, 't90am', 'and its T-90AM');
  assert.deepEqual(sceneInCurrentTankIds(sceneFile).actors.map((a) => a.id), ['t14_armata', 't90m', 'leo2a6m', 'm1a2_abrams_sepv2'],
    'a published schema-1 scene loads its X studies under their new ids');
  const liveSeats = planFromRoom(room).seats;
  assert.equal(liveSeats.find((s) => s.playerId === 'p1').specId, 'leo2a6m', 'a retired id from an older build names the Leopard 2A6M');
  assert.equal(liveSeats.find((s) => s.playerId === 'p2').specId, 'leo2a6m', 'a current id passes through');
  const oldSave = memoryStorage({ 'cot.lastTank.v1': 'leo2a6m', 'cot.camo.leo2a6m': 'a', 'cot.camo.leo2a6m_x': 'b' });
  migrateStoredTankIds(oldSave);
  assert.equal(oldSave.getItem('cot.lastTank.v1'), 'leo2a4_otco', 'an old save keeps its Leopard 2A4 OTCO');
  assert.equal(oldSave.getItem('cot.camo.leo2a4_otco'), 'a');
  assert.equal(oldSave.getItem('cot.camo.leo2a6m'), 'b', 'and the 2A6M keeps its own paint through the swap');
  const schema2Save = memoryStorage({ [TANK_ID_STORAGE_SCHEMA_KEY]: '2', 'cot.lastTank.v1': 'leo2a6m_x' });
  migrateStoredTankIds(schema2Save);
  assert.equal(schema2Save.getItem('cot.lastTank.v1'), 'leo2a6m', 'a schema-2 save moves once');
  assert.equal(linkTankId(new URL('https://x/gallery?id=leo2a6m').searchParams), 'leo2a4_otco', 'an unstamped link is schema 1');
  assert.equal(galleryHref('leo2a6m'), `/gallery?id=leo2a6m&ids=${TANK_IDS.schema}`);
  assert.equal(telemetryTankId('leo2a6m'), `leo2a6m.s${TANK_IDS.schema}`);
}

console.log('tankIdBoundaries selftest: an old save, replay, scene link, gallery URL and room seat naming leo2a6m '
  + '(2A4 OTCO) and t90m (T-90AM) resolve to the right vehicles; schema-2 data is read as written');
