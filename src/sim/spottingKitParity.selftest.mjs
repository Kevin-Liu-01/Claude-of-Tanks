// Round 4 F8 (2026-11-06; the 2026-11-02 audit's spotting parity, M6): both drivers' spotting reads the kit
// applyEquipmentToCombat wrote (combat.equip, the hull-gated list). The authority read tank.equip, that very array; the solo
// step read entity.equip, the loadout the battle seat handed in. That list holds the same ids (state.ts loadEquipment
// gates a saved loadout with the hull's spec, a bot's defaultLoadoutFor with its own), but it is another array, and
// Fresh Foliage's list switches on the array it is handed (consumableRules.ts consumableSpottingIds): each solo life's
// first spotting read under Foliage rebuilt the list from the loadout, not from the kit the authority reads.
// Here a KV-2 (WWII) whose saved loadout still holds thermal_sight, a modern sight it cannot mount, uses Fresh Foliage
// with a foe 300 m off (inside the range where the spotting reads equipment), on each driver.
import assert from 'node:assert/strict';

const SAVED = ['thermal_sight', 'optics'];
const ITEMS = ['foliage', 'repair', 'first_aid'];
const store = new Map([['cot.equip.kv2', JSON.stringify(SAVED)], ['cot.cons.kv2', JSON.stringify(ITEMS)]]);
// the Garage's saved loadouts, as the page keeps them (state.ts reads them at the battle seat)
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => { store.set(key, String(value)); },
  removeItem: (key) => { store.delete(key); },
};
const { Group } = await import('three');
const { createAuthoritativeMatch } = await import('./authoritativeMatch.ts');
const { CONSUMABLE_FOLIAGE_EQUIPMENT } = await import('./consumableRules.ts');
const { createBus, createCollider, createGameState, setupBattle, simStep } = await import('../game/state.ts');
const { spawnTanks } = await import('../game/rosterState.ts');
const { useSoloConsumable } = await import('../game/soloConsumables.ts');
const { createDedicatedWorldCollision } = await import('../../server/dedicatedWorldCollision.ts');

const KIT = ['optics', CONSUMABLE_FOLIAGE_EQUIPMENT];

// ---- the authority: the seat's loadout through applyEquipmentToCombat, Foliage from the seat's first slot ------------
let authorityIds;
{
  const match = createAuthoritativeMatch({ mapId: 'verdant', seed: 3, countdownS: 0, players: [
    { id: 'kv', specId: 'kv2', team: 'alpha', equipment: SAVED.slice(), consumables: ITEMS.slice(), spawn: { x: 0, z: -150, yaw: 0 } },
    { id: 'foe', specId: 'kv2', team: 'bravo', bot: true, spawn: { x: 0, z: 150, yaw: Math.PI } },
  ] });
  match.onMatchReady();
  const tank = match.entityById.get('kv');
  assert.deepEqual(tank.combat.equip, ['optics'], 'the authority gates thermal_sight off the KV-2');
  assert.equal(tank.equip, tank.combat.equip, 'the authority\'s seat keeps the kit applyEquipmentToCombat wrote');
  const idle = { throttle: 0, steer: 0, brake: false, fire: false, aimYaw: 0, aimPitch: 0, shellSlot: 0 };
  match.step({ dt: 1 / 60, inputs: new Map([['kv', { ...idle, actionBits: 1 << ITEMS.indexOf('foliage') }]]) });
  assert.ok(tank.consumables.until.foliage > 0, 'the authority: Fresh Foliage is on');
  for (let tick = 0; tick < 120; tick++) match.step({ dt: 1 / 60, inputs: new Map() });
  assert.equal(tank.consumables.spotSource, tank.combat.equip, 'the authority: the Foliage list is built from the kit');
  authorityIds = tank.consumables.spotIds.slice();
  assert.deepEqual(authorityIds, KIT, 'the authority: the kit and Foliage\'s id, no thermal sight');
}

// ---- the solo step: the Garage's saved loadout at the battle seat, Foliage through the player's own use --------------
// (no fleet builders: the visuals are stubs, and the spotting reads the specs alone)
const world = createDedicatedWorldCollision('verdant');
{
  const authored = world.heightField._layout.spawns;
  const spawnOf = (point) => ({ pos: [point.x, world.heightField.getHeightAt(point.x, point.z), point.z], yaw: point.yaw ?? 0 });
  world.spawnPoints = { player: spawnOf(authored.player), enemies: authored.enemies.map(spawnOf) };
}
{
  const game = createGameState({ rosterSeed: 3 });
  game.mapId = 'verdant';
  spawnTanks(game, { scene: { remove() {} } });
  const bus = createBus(() => {});
  for (const entity of game.allTanks) entity.visual = { root: new Group(), setVisible() {}, syncFromState() {}, dispose() {}, resetDestroyed() {} };
  setupBattle(game, 'kv2', world, { gameMode: 'standard', random: true, brain: null, deferVisuals: true,
    deferCamoRepaint: true, deferOpeningRoutes: true });
  const own = game.tanks.find((entity) => entity.isPlayer), foe = game.tanks.find((entity) => entity.team === 'enemy');
  assert.equal(own.specId, 'kv2');
  assert.deepEqual(own.combat.equip, ['optics'], 'the solo step gates thermal_sight off the KV-2 too');
  // one foe, held 300 m ahead: the spotting reads both hulls' equipment at that range (spotting.ts canSpotFrom)
  game.tanks = [own, foe];
  game.tankById = new Map([[own.id, own], [foe.id, foe]]);
  foe.aiCtl = null;
  foe.ai = null;
  foe.state.pos.set(own.state.pos.x + 300 * Math.sin(own.state.yaw), own.state.pos.y, own.state.pos.z + 300 * Math.cos(own.state.yaw));
  const use = useSoloConsumable(own, bus, ITEMS.indexOf('foliage'), game.timeS);
  assert.ok(use.ok && use.item === 'foliage', 'the solo step: Fresh Foliage is on');
  const collider = createCollider(game, world);
  for (let tick = 0; tick < 120; tick++) simStep(game, bus, world, null, collider);
  // the HUD's concealment readout reads the player's equipment through the same spotting (battleHudFrameRuntime.ts)
  const conceal = game.spotting.getConcealment(own, game.timeS);
  assert.ok(conceal.equip > 0, `the solo spotting read the player's equipment with Foliage's camouflage (${conceal.equip})`);
  assert.deepEqual(own.consumables.spotIds, authorityIds, 'the solo Foliage list is the authority\'s');
  assert.equal(own.consumables.spotSource, own.combat.equip,
    'the solo spotting hands Foliage the kit applyEquipmentToCombat wrote, as the authority does (it rebuilt the list from the seat\'s loadout)');
}
world.release?.();

console.log('spottingKitParity: a KV-2 whose saved loadout holds a thermal sight reads its gated kit, with Fresh Foliage, on both '
  + 'drivers; the solo Foliage list is built from the kit, not rebuilt from the seat\'s loadout');
