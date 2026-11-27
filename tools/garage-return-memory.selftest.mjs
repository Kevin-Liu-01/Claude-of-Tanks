// garage-return-memory.selftest (battle-retention-279): the memory probe's pure rules and its judgement gate, on
// synthetic Garage-after-GC readings (no browser). A run that took a heap snapshot is diagnostic and never judged (278:
// two snapshots read as +1.7 GB retention steps); the slope rule (Main 2026-11-27: >= 6 battles, 5 % of battle 1 a
// battle), the repeat-roster rule and the ruin-fire rule decide as pre-registered, each with a retaining series as its
// control. The registry ledger (v3): a page-lifetime pool's tagged materials are counted apart, an untagged undrawn
// entry of a released world is stale.
import assert from 'node:assert/strict';
import { judgement, parseArgs, registryLedger, registryV3, repeatRule, ruinFireRule, slopeRule } from './garage-return-memory.mjs';

const garage = (series) => series.map((r, i) => ({ point: 'garage-after-gc', battle: i + 1, ...r }));
const flat = garage([2200, 2260, 2240, 2290, 2270, 2300].map((mb) => ({ rendererMb: mb, gpuMb: 2600, jsHeapUsedMb: 240 })));
const climbing = garage([2200, 2400, 2600, 2800, 3000, 3200].map((mb) => ({ rendererMb: mb, gpuMb: 2600, jsHeapUsedMb: 240 })));

// the gate: --snapshots makes the run diagnostic, whatever its readings
const snap = parseArgs(['--dist=/tmp/x', '--battles=6', '--snapshots=2']);
const verdict = judgement(snap, climbing);
assert.equal(verdict.diagnostic, true, 'a run with --snapshots is diagnostic');
assert.equal('pass' in verdict, false, 'a diagnostic run carries no PASS/FAIL');
assert.match(verdict.note, /diagnostic, not judged/, 'it says so');
// control: the same readings without --snapshots are judged (and the climbing series fails the band)
const judged = judgement(parseArgs(['--dist=/tmp/x', '--battles=6']), climbing);
assert.equal(judged.diagnostic, undefined, 'control: without --snapshots the run is judged');
assert.equal(judged.pass, false, 'control: the climbing series fails the band');
assert.equal(judgement(parseArgs(['--dist=/tmp/x', '--battles=6']), flat).pass, true, 'a flat series passes the band');

// the slope rule
assert.equal(slopeRule(flat).result, 'FLAT', 'slope: the flat series is FLAT');
assert.equal(slopeRule(climbing).result, 'RETAINS', 'slope control: +200 MB a battle on 2200 RETAINS');
assert.match(slopeRule(climbing.slice(0, 3)).result, /^TOO FEW/, 'slope: fewer than 6 battles is not a verdict');

// the repeat-roster rule (battles 1..4 new specs, 5..8 the same rosters)
const repeat = (heap8) => garage([
  [2130, 2700, 200], [2260, 2670, 220], [2290, 2680, 229], [2300, 2680, 238],
  [2360, 2790, 244], [2380, 2790, 245], [2380, 2390, 246], [2380, 2800, heap8],
].map(([rendererMb, gpuMb, jsHeapUsedMb]) => ({ rendererMb, gpuMb, jsHeapUsedMb })));
assert.equal(repeatRule(repeat(244), 4).pass, true, 'repeat: the heap within 8 MB of battle 4 passes');
const held = repeatRule(repeat(303), 4);
assert.equal(held.pass, false, 'repeat control: +65 MB over the repeat half fails');
assert.equal(held.rows.find((r) => r.half === 'repeat' && r.key === 'jsHeapUsedMb').pass, false, 'repeat control: the heap row is the one that fails');

// the ruin-fire rule: growth from the 10 s reading within 600 MB
const fire = (gpuStep) => [0, 5, 10, 15, 20, 25].map((driveS) => ({ point: 'fire', driveS, shots: driveS / 2,
  rendererMb: 3600, gpuMb: driveS >= 20 ? 3800 + gpuStep : 3800, treeMb: 8300, jsHeapUsedMb: 350 }));
assert.equal(ruinFireRule(fire(100)).pass, true, 'ruin: +100 MB passes');
assert.equal(ruinFireRule(fire(1000)).pass, false, 'ruin control: a +1 GB GPU step fails');

// the registry ledger (v3, Main 2026-11-27): the in-page function on a stand-in page. Battle 1 on verdant adds a pool's
// material (tagged) and the impostor material (untagged, the 278 holder); at the Garage after battle 2 (desert resident)
// neither is drawn: the impostor is stale, the pool's is counted per pool only. Control: the same entry untagged is stale.
const material = (name, pool) => ({ type: 'MeshStandardMaterial', name, userData: pool ? { cotPagePool: pool } : {} });
const ledger = (impostorTagged, vehicleCheck = true) => {
  const pool = material('fx-rubble-body', 'fx-rubble-body');
  const impostor = material('horizon-forest-impostor-v2', impostorTagged ? 'fx-rubble-body' : null);
  const track = material('cot:track-steel');
  const shaders = new Map([[material('cot:gunmetal'), {}]]);
  const scene = { traverse() {} };
  const isVehicleMaterial = vehicleCheck ? (m) => m === track : undefined;
  globalThis.window = { __DEBUG: { lighting: { csm: { shaders } }, scene, world: { mapId: 'verdant', group: scene }, isVehicleMaterial } };
  registryLedger('garage-boot-gc', 0);
  shaders.set(pool, {}); shaders.set(impostor, {}); shaders.set(track, {});
  registryLedger('start', 1);
  window.__DEBUG.world = { mapId: 'desert', group: scene };
  registryLedger('start', 2);
  const reading = registryLedger('garage-after-gc', 2);
  delete globalThis.window;
  return { reading, keep: [pool, impostor, track] };
};
const v3 = ledger(false).reading;
assert.equal(v3.staleTotal, 1, 'ledger: the untagged undrawn impostor of the released world is stale');
assert.deepEqual(v3.pooled, { 'fx-rubble-body': 1 }, 'ledger: the pool-tagged material is counted per pool, not stale');
assert.equal(ledger(true).reading.staleTotal, 0, 'ledger: tagged, the same entry is pooled');
// the v3 scope (Main 2026-11-27): a vehicle-registered entry is listed apart in full, never judged; control: a page
// without the vehicle check counts it as a world entry
assert.deepEqual(v3.vehicle, { 'b1:verdant': { count: 1, kinds: { 'MeshStandardMaterial:cot:track-steel': 1 } } }, 'ledger: the vehicle entry is listed by kind');
assert.equal(v3.vehicleTotal, 1, 'ledger: the vehicle count');
const unscoped = ledger(true, false).reading;
assert.equal(unscoped.staleTotal, 1, 'ledger control: without the page\'s vehicle check the vehicle entry is stale');
assert.match(registryV3([{ point: 'garage-after-gc', battle: 2, registry: unscoped }]).note, /counted as world/, 'v3: an unscoped page is said');
const v3Sample = (r) => ({ point: 'garage-after-gc', battle: 2, registry: r });
assert.equal(registryV3([v3Sample(v3)]).pass, false, 'v3: an untagged stale entry fails');
assert.equal(registryV3([v3Sample({ staleTotal: 0, stale: {}, pooledTotal: 3, pooled: { 'fx-rubble-body': 3 } })]).pass, true, 'v3: pool-tagged entries alone pass');
assert.equal(registryV3([]).pass, null, 'v3: no readings, no verdict');

console.log('garage-return-memory.selftest: a snapshot run is diagnostic, never judged; slope, repeat and ruin rules decide as pre-registered (each with a retaining control); the registry ledger counts pool-tagged materials apart and v3 fails an untagged stale entry');
