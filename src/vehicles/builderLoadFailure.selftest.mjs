// builderLoadFailure.selftest.mjs — a tank's builder loads survive one failed chunk (2026-11-02 audit R6). Copyright ©
// 2026 Kevin B. Liu.
//
// One offline blip on a lazy chunk used to stand for the session: the interior fills kept a rejected group as its
// pending load (every tank of the group failed ensureTankBuilder until a reload: the Garage pedestal, battle loading, the
// streamer), the turret ring kept `loading ??=` (no kill left a ring), and the riding-parts prebuild latched before its
// import. isTankBuilderReady skipped the interior fills ensureTankBuilder awaits, so createTank could build a tank
// without them, and a build passed the guard before its spec's combat anatomy was finalized. Each chunk is now one
// app/lazyChunk.ts (a module failure is asked again by the next ask past the backoff), the predicate is exactly what the
// ensure awaits, and a build finalizes first.
//
// The fleet facade's heavy neighbours (the factory core, the fleet registration, the specs, the profile packs) are
// stubbed through a resolve hook so this runs in a second; the four data loaders it awaits (the kit's groups, the
// marking seats, the combat-anatomy calibrations, the interior fills) are the real ones, and a chunk "fails" the way a
// browser's import does when the network drops: its resolve throws once.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

let clock = 0;
performance.now = () => clock; // the lazy chunks' default clock

const failing = new Set();
const asked = [];
const blip = (specifier) => new TypeError(`Failed to fetch dynamically imported module: ${specifier}`);
const data = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const FINALIZE = data('export const finalized = []; export function finalizeCombatAnatomy(spec) { if (spec) finalized.push(spec.id); return spec; }');
const PREBUILD = data('export const started = []; export function startRidingPartsPrebuild(order) { started.push([...order]); }');
const FACADE_STUBS = {
  './fleetRegistration.ts': data('export {};'),
  './tankFactoryCore.ts': data(`export const KIT = {};
    export function configureTankFactory() {} export function registerCanonicalBuilders() {} export function registerProfiledBuilders() {}
    export function createTank(id) { return { id }; } export function* createTankSteps(id) { return { id }; }`),
  './combatAnatomy.ts': FINALIZE,
  './specs.ts': data("export const TANK_SPECS = new Proxy({}, { get: (_, id) => (typeof id === 'string' ? { id } : undefined) }); export const SAVED_TANK_IDS = [];"),
  './abramsSourceXSpecs.ts': data('export const ABRAMS_SOURCE_X_IDS = [];'),
  './profileBuilderAdapter.ts': data('export function createProfileBuilders() { return {}; }'),
  './profiles/kit.ts': data('export const FITTINGS = {};'),
  './ridingPartsPrebuild.ts': PREBUILD,
};
const RING_STUB = data('export function createTurretRingPresentation() { return {}; } export function capTurretRingDents() {}');
const hook = registerHooks({
  resolve(specifier, context, next) {
    for (const name of failing) if (specifier.endsWith(name)) { failing.delete(name); throw blip(specifier); }
    const parent = context.parentURL ?? '';
    if (parent.endsWith('/src/vehicles/fleetFactory.ts')) {
      asked.push(specifier);
      if (FACADE_STUBS[specifier]) return { url: FACADE_STUBS[specifier], shortCircuit: true };
      if (/^\.\/(?:profiles\/|modern2|modern3|france)/.test(specifier)) return { url: data('export {};'), shortCircuit: true };
    }
    if (parent.endsWith('/src/vehicles/turretRingLoader.ts') && specifier === './turretRingWell.ts') {
      return { url: RING_STUB, shortCircuit: true };
    }
    return next(specifier, context);
  },
});
const settle = () => new Promise((resolve) => setImmediate(resolve));

// ---- the turret ring: one failed chunk, then the next visual's ask past the backoff loads it
{
  const { loadTurretRingModule, turretRingModule } = await import('./turretRingLoader.ts');
  failing.add('./turretRingWell.ts');
  await assert.rejects(loadTurretRingModule(), /dynamically imported module/);
  assert.equal(turretRingModule(), null);
  clock += 2_000;
  const ring = await loadTurretRingModule();
  assert.equal(typeof ring.createTurretRingPresentation, 'function', 'a failed ring chunk no longer stands for the session');
  assert.equal(turretRingModule(), ring);
}

// ---- the fleet facade: a failed interior-fill chunk fails that ensure only, and the predicate says so
const { ensureTankBuilder, ensureTankBuilders, isTankBuilderReady, createTank, createTankSteps } = await import('./fleetFactory.ts');
const { ensureVehicleMarkingSeats } = await import('./vehicleMarkingSeatLoader.ts');
const { ensureCombatAnatomyCalibration } = await import('./combatAnatomyCalibrationLoader.ts');
const { finalized } = await import(FINALIZE);
const { started } = await import(PREBUILD);
const leopard = 'leopard2_proto';
const sibling = 'leo2_revolution';
{
  failing.add('interiorFillGroups/leopard.generated.ts');
  await assert.rejects(ensureTankBuilder(leopard), /dynamically imported module/);
  // the ensure rejects as soon as the fills do: let the other three loads it started land before reading the predicate
  await Promise.all([ensureVehicleMarkingSeats(leopard), ensureCombatAnatomyCalibration(leopard)]);
  for (let i = 0; i < 400 && !asked.includes('./profiles/leopard.ts'); i++) await settle();
  for (let i = 0; i < 20; i++) await settle();
  assert.ok(asked.includes('./profiles/leopard.ts'), "the group's chunk was asked for");
  assert.equal(isTankBuilderReady(leopard), false,
    'the kit, the group, the seats and the calibration landed but the fills did not: the builder is not ready');
  assert.throws(() => createTank(leopard, null), /is not loaded/, 'so no build runs without its fills');
  await assert.rejects(ensureTankBuilder(leopard), /dynamically imported module/, 'inside the backoff the kept failure answers');
  clock += 2_000;
  await ensureTankBuilder(leopard);
  assert.equal(isTankBuilderReady(leopard), true, 'the next ensure past the backoff loads the fills');
  assert.deepEqual(createTank(leopard, null), { id: leopard });
}

// ---- a build finalizes its spec's combat anatomy before it runs, ensured or not
{
  assert.equal(isTankBuilderReady(sibling), true, "a sibling's builder is ready once its group's loads are resident");
  assert.equal(finalized.includes(sibling), false, 'it was never ensured, so its anatomy was never finalized');
  const steps = createTankSteps(sibling, null);
  assert.equal(finalized.includes(sibling), true, 'createTankSteps finalizes before its build runs');
  steps.return(undefined);
}

// ---- the riding-parts prebuild: a failed chunk is asked again by a later ensureTankBuilders
{
  const created = [];
  globalThis.Worker = class { constructor() { created.push(this); } };
  failing.add('./ridingPartsPrebuild.ts');
  await ensureTankBuilders([leopard]);
  await settle();
  assert.deepEqual(started, [], 'the prebuild chunk failed');
  clock += 2_000;
  await ensureTankBuilders([sibling]);
  await settle();
  assert.deepEqual(started, [[sibling]], 'a later ask starts it (the latch no longer stands before its import)');
  delete globalThis.Worker;
}

hook.deregister();
console.log('builderLoadFailure.selftest: a failed fills, ring or prebuild chunk is asked again past the backoff; isTankBuilderReady needs the fills; a build finalizes first');
