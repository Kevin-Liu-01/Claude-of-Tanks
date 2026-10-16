#!/usr/bin/env node
// Wreck barrel census: one barrel per real gun, bent at its bend point, on every wreck of the whole fleet (tank-opt
// 2026-10-15; the owner: "fix the guns of the destroyed tanks that kind of spawn 2 barrels").
//
//   node tools/wreck-barrel-census.mjs --ids=m1a1_abrams_hc,t90am | --all [--modes=player,bot,mobile,bake]
//     [--pops=0,1] [--seeds=1,132] [--strokes=none,0.12] [--shard=k/n] [--jsonl=out.jsonl] [--gate]
//
// Per id, wreck mode (the battle builds: the player's tank, a desktop bot, a mobile bot; the map hulk), pop and seed:
// builds the visual, kills it (a battle build: setDestroyed, the kill's own crumple; the hulk: the posed, planned,
// refined and crumpled sequence of wrecks.ts) and measures every bore with src/vehicles/wreckBarrel.test-support.mjs:
// one seated muzzle per real gun, no tube on a bore owned by another rig, no two pieces concentric intact that the
// wreck pulls apart (the bent gun drawn as two barrels), and the drawn stock where the kink puts it. --strokes adds
// battle kills inside the tank's own shot (seconds after its recoilKick, its cannon out of battery; 'none' is the kill in
// battery, the default): the stroke's return and the wreck's settle run through syncFromState (WRECK verify
// 2026-10-16). --gate exits 1 on any failure. A sample of gun constructions runs in npm test
// (src/vehicles/wreckGunSingleBarrel.selftest.mjs).
import { appendFileSync, writeFileSync } from 'node:fs';
import { createTank } from '../src/vehicles/tankFactory.ts';
import { ensureInteriorFills } from '../src/vehicles/interiorFills.ts';
import { preloadWreckTurretDriver } from '../src/vehicles/wreckTurretDriverLoader.ts';
import { ALL_TANK_IDS, TANK_SPECS } from '../src/vehicles/specs.ts';
import { KINK_M, POKE_M, WRECK_MODES, measureWreckBarrels } from '../src/vehicles/wreckBarrel.test-support.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const flag = (name) => args.includes(`--${name}`);
let ids = flag('all') ? [...ALL_TANK_IDS] : opt('ids', 'm1a1_abrams_hc').split(',').filter(Boolean);
const unknown = ids.filter((id) => !TANK_SPECS[id]);
if (unknown.length) throw new Error(`unknown tank ids: ${unknown.join(', ')}`);
const shard = opt('shard', '');
if (shard) { const [k, n] = shard.split('/').map(Number); ids = ids.filter((_, i) => i % n === k); }
const modes = opt('modes', WRECK_MODES.join(',')).split(',').filter(Boolean);
const pops = opt('pops', '0,1').split(',').map((v) => v === '1');
const seeds = opt('seeds', '1,132').split(',').map(Number);
const strokes = opt('strokes', 'none').split(',').filter(Boolean).map((v) => v === 'none' ? null : Number(v));
if (strokes.some((v) => v !== null && !(v >= 0))) throw new Error('--strokes: none or seconds after the shot');
const jsonl = opt('jsonl', '');
if (jsonl) writeFileSync(jsonl, '');

await preloadWreckTurretDriver();
const failed = [];
let rows = 0;
for (const id of ids) {
  await ensureInteriorFills([id]);
  for (const mode of modes) for (const pop of pops) for (const seed of seeds) for (const strokeS of strokes) {
    // a map hulk is baked in battery: the stroke poses are battle kills
    if (mode === 'bake' && strokeS !== null) continue;
    let res;
    try { res = measureWreckBarrels(createTank, TANK_SPECS[id], { mode, pop, seed, strokeS }); } catch (error) { res = { id, mode, pop, seed, strokeS, pass: false, error: String(error?.message ?? error) }; }
    rows++;
    if (jsonl) appendFileSync(jsonl, `${JSON.stringify(res)}\n`);
    const bores = res.bores ?? [];
    const split = bores.reduce((w, b) => (b.poke ?? -1) > (w?.poke ?? -1) ? b : w, null);
    const off = bores.reduce((w, b) => (b.kink ?? -1) > (w?.kink ?? -1) ? b : w, null);
    const why = res.error ? `ERROR ${res.error}`
      : [res.muzzles > res.realGuns ? `${res.muzzles} muzzles for ${res.realGuns} guns` : '',
        res.strays.length ? `strays ${res.strays.map((s) => `${s.owner}:${s.name}@${s.z}`).join(' ')}` : '',
        split && split.poke > POKE_M ? `split ${split.poke} m at z ${split.z} over ${split.splitM} m (${split.a} / ${split.b})` : '',
        off && off.kink > KINK_M ? `off the kink ${off.kink} m at z ${off.kinkZ} (${off.kinkPiece})` : '',
        res.bend && bores.some((b) => b.owner === 'gun' && b.rings > 0 && b.muzzleZ > res.bend.z0 && b.pastKink === 0)
          ? 'nothing drawn past the kink' : '',
      ].filter(Boolean).join('; ');
    const kink = off?.kink ?? '-';
    // informational: a muzzle anchor seated off its own tube's axis (the flash and the round leave off the bore)
    const anchor = bores.reduce((w, b) => Math.max(w, b.anchorOffM ?? 0), 0);
    const stroke = strokeS === null ? '' : ` stroke=${strokeS}s(${res.outOfBatteryM ?? '?'}m)`;
    console.log(`${res.pass ? 'ok  ' : 'FAIL'} ${id.padEnd(24)} ${mode.padEnd(6)} pop=${pop ? 1 : 0} seed=${seed}${stroke} `
      + `bend=${res.bend ? `${res.bend.z0}/${res.bend.theta}` : '-'} kink=${kink}${anchor > 0.02 ? ` anchorOff=${anchor}` : ''}`
      + `${why ? ` :: ${why}` : ''}`);
    if (!res.pass) failed.push(`${id}/${mode}/pop${pop ? 1 : 0}/seed${seed}${strokeS === null ? '' : `/stroke${strokeS}`}`);
  }
}
console.log(`\nwreck-barrel-census: ${rows - failed.length} of ${rows} wrecks one barrel per gun, bent at its bend point`
  + `${failed.length ? `; FAIL ${failed.join(' ')}` : ''}`);
if (flag('gate') && failed.length) process.exit(1);
