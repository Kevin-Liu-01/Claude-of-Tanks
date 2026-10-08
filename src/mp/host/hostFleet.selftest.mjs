// The host Worker carries vehicle specs, not vehicles (ARCH-P3, 2026-10-01). Its static module graph holds no fleet
// builder, geometry kit, calibration literal, interior fill or marking seat (the eager tankFactory.ts used to put the
// whole 217-vehicle fleet, 11.55 MB, into the Worker); the actor admits a roster only after its combat anatomy
// loaded (authorityFleet.ts), and the host core loads exactly the roster's calibration groups at boot.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAst } from 'rolldown/parseAst';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Repository files a module statically imports at runtime (type-only imports and dynamic import() excluded). */
function staticImports(file) {
  if (!/\.(?:ts|mjs|js)$/.test(file)) return []; // JSON, CSS and other data imports have no imports of their own
  const source = readFileSync(resolve(root, file), 'utf8');
  const ast = parseAst(source, { lang: file.endsWith('.ts') ? 'ts' : 'js' }, file);
  const out = [];
  for (const node of ast.body) {
    const declaration = node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration'
      || (node.type === 'ExportNamedDeclaration' && node.source);
    if (!declaration || typeof node.source?.value !== 'string') continue;
    if (node.importKind === 'type' || node.exportKind === 'type') continue;
    if (node.type === 'ImportDeclaration' && node.specifiers?.length
      && node.specifiers.every((specifier) => specifier.importKind === 'type')) continue;
    const specifier = node.source.value;
    if (!specifier.startsWith('.')) continue;
    const target = resolve(root, dirname(file), specifier);
    if (existsSync(target)) out.push(relative(root, target));
  }
  return out;
}

function staticClosure(entry) {
  const seen = new Set([entry]);
  const queue = [entry];
  while (queue.length) for (const next of staticImports(queue.shift())) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  return [...seen].sort();
}

const closure = staticClosure('src/mp/host/matchHostWorker.ts');
const FLEET_PAYLOAD = /^src\/vehicles\/(?:tankFactory|tankFactoryCore|fleetFactory|profiledProcedurals|modern[123]|france|combatAnatomyCalibrations|vehicleMarkingSeats\.generated|interiorFills|profiles\/kit)\.ts$|^src\/vehicles\/(?:combatAnatomyGroups|interiorFillGroups|vehicleMarkingSeatGroups)\//;
assert.deepEqual(closure.filter((file) => FLEET_PAYLOAD.test(file)), [], 'no fleet builder, kit, calibration literal, fill or seat in the host Worker');
// The Worker builds its world from the verified collision manifest and createHeightField (worldCollision.ts); the
// visual horizon, its border farmsteads and the regional building kits are not authority inputs. terrain.ts reaches the
// horizon only through horizonRingHook.ts (2026-10-08: terrain.ts → maps/horizon.ts → borderFarmsteads.ts →
// maps/regional/index.ts had put every regional kit, 1.9 MB of 7.07 MB, into the Worker).
const VISUAL_WORLD = /^src\/world\/(?:maps\/horizon|borderFarmsteads|horizonPanorama|horizonVista)\.ts$|^src\/world\/maps\/regional\//;
assert.deepEqual(closure.filter((file) => VISUAL_WORLD.test(file)), [], 'no visual horizon, farmstead or regional building kit in the host Worker');
for (const file of ['server/match/matchActor.ts', 'src/vehicles/authorityFleet.ts', 'src/vehicles/fleetRegistration.ts']) {
  assert.ok(closure.includes(file), `the host Worker registers the fleet through ${file}`);
}
const sourceBytes = closure.reduce((sum, file) => sum + statSync(resolve(root, file)).size, 0);
// The bound guards against eager fleet imports: the fleet alone is 18.9 MB of static source plus every calibration group,
// so one stray import of a builder, a kit or a calibration literal fails it by a wide margin. What the Worker does carry
// grows with the maps: the simulation, the world's height field, the wire, the server actor, three's math and the i18n
// catalogs. Its world collision comes from the captured manifests, not from kit geometry, so the regional building kits
// stay out (above). 4.45 MB on 2026-10-01; 5.81 MB at PR head 5d2461283; 6.06 MB with the five map revival lane 2 kits
// combined (2026-10-05); 7.07 MB at e65122a84 through the horizon chain, 5.13 MB once terrain.ts stopped importing the
// horizon (2026-10-08).
assert.ok(sourceBytes < 7e6, `the host Worker's static source stays spec-sized (${(sourceBytes / 1e6).toFixed(2)} MB)`);

// Behaviour, in this fresh process: nothing loaded until the roster asks.
const { createMatchActor } = await import('../../../server/match/matchActor.ts');
const { ensureAuthorityFleet } = await import('../../vehicles/authorityFleet.ts');
const { isCombatAnatomyCalibrationReady } = await import('../../vehicles/combatAnatomyCalibrationLoader.ts');
const { getSpec } = await import('../../vehicles/specs.ts');
const { createHostPortPair } = await import('./hostProtocol.ts');
const { createMatchHostCore } = await import('./matchHostCore.ts');

const seats = [
  { seat: 0, playerId: 'p1', name: 'One', team: 'alpha', specId: 'type96b_x' },
  { seat: 1, playerId: 'p2', name: 'Two', team: 'bravo', specId: 'm1a2' },
  { seat: 9, playerId: 'w', name: 'Watcher', team: 'spectator', specId: 'leo2a7v' },
];
const options = { roomId: 'fleet', mapId: 'verdant', seed: 3, seats, world: 'terrain', autoStart: false, countdownS: 1 };
assert.equal(isCombatAnatomyCalibrationReady('type96b_x'), false);
assert.throws(() => createMatchActor(options), /combat anatomy is not loaded for type96b_x, m1a2/,
  'an unloaded roster is refused, naming the hulls');
await ensureAuthorityFleet(seats.map((seat) => seat.specId).slice(0, 2));
assert.equal(isCombatAnatomyCalibrationReady('leo2a7v'), false, 'a spectator\'s vehicle is not loaded');
assert.equal(isCombatAnatomyCalibrationReady('t90m'), false, 'only the roster\'s groups are loaded');
const actor = createMatchActor(options);
const hull = actor.authority.entities.find((entity) => entity.id === 'p1');
assert.equal(hull.spec, getSpec('type96b_x'));
assert.ok(hull.spec.armor.collisionShells.turret.length > 0, 'the authority traces the finalized hit shells');
actor.stop();

// The browser host's core loads the booted roster (seats and bots) before it builds the actor.
{
  const pair = createHostPortPair();
  const core = createMatchHostCore({ port: pair.worker, buildWorld: async () => 'terrain', reportIntervalMs: 60_000, keyframeIntervalMs: 60_000, configIntervalMs: 60_000 });
  const ready = new Promise((resolveReady, reject) => pair.main.onMessage((message) => {
    if (message.type === 'ready') resolveReady(message);
    if (message.type === 'boot_failed') reject(new Error(message.error));
  }));
  pair.main.post({ type: 'boot', config: {
    roomId: 'FLEET1', matchId: 'm-1', generation: 1, mapId: 'verdant', mode: 'standard', seed: 7,
    seats: [{ seat: 0, playerId: 'p1', name: 'One', team: 'alpha', specId: 't90m', equipment: [] }],
    bots: [{ playerId: 'b1', name: 'Bot', team: 'bravo', specId: 'type96_80_feng' }],
    countdownS: 1, battleLimitS: null, hostSecret: 'host-secret-0123456789abcdef', manifestBase: null, resume: null,
  } });
  await ready;
  assert.equal(isCombatAnatomyCalibrationReady('t90m'), true, 'the seat\'s group loaded at boot');
  assert.equal(isCombatAnatomyCalibrationReady('type96_80_feng'), true, 'the bot\'s group loaded at boot');
  assert.equal(core.actor?.authority.entities.length, 2);
  core.dispose();
  pair.main.close();
}

console.log(`hostFleet.selftest: the host Worker's static graph is ${closure.length} modules / ${(sourceBytes / 1e6).toFixed(2)} MB of source with no fleet builder or calibration literal; the actor refuses an unloaded roster and the host core loads exactly the booted roster's anatomy`);
