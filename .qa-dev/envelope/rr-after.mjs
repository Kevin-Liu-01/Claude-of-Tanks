// Lane copy (envelope-honesty-264) of ~/cot-lanes/balance-263-evidence/rr-shard.mjs with one addition: --ids=<a,b> keeps
// only the pairs and rows that name one of those ids (the envelope lane's changed anatomy), in the same order and seeds.
// The 259 same-tier MBT round robin (runBalanceSeries: 6 seeds x both range ends = 12 games a pair, fair 0.2-0.8), fleet-wide
// and sharded: every MBT pair at each shown tier, plus --rows=<id>@<tier>,... (a non-MBT or out-of-tier row, e.g. the KV-2
// or the T-55A against a tier's MBTs). Pairs are listed in one fixed order and shard k of n takes every n-th pair.
// --levers=<json> applies levers to the live registry after the fleet pass, the way fleetBalancePass's helpers do (exp-row.mjs).
//   cd <worktree> && node <this> <out.json> --tiers=1,2,...,10 --shard=k/n [--rows=kv2@1] [--levers=<json>] [--seeds=N]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const imp = (p) => import(pathToFileURL(resolve(p)).href);
await imp('src/vehicles/tankFactory.ts');
const { TANK_SPECS, PRODUCTION_TANK_IDS } = await imp('src/vehicles/specs.ts');
const { scaleNonExternalArmor } = await imp('src/vehicles/fleetSpecRegistry.ts');
const { runBalanceSeries } = await imp('src/vehicles/balanceSimulation.ts');
const { displayTier } = await imp('src/techTree/tiers.ts');
const { vehicleClassForId } = await imp('src/vehicles/vehicleFacets.ts');
// --zones: zone plates on (sim/armorZonePlates.ts setArmorZonePlates(true), face angles), the 262 phase-2 flag the owner flips
if (process.argv.includes('--zones')) { const { setArmorZonePlates } = await imp('src/sim/armorZonePlates.ts'); setArmorZonePlates(true); console.log('zone plates ON'); }
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = process.argv[2];
const levers = arg('levers') ? JSON.parse(readFileSync(resolve(arg('levers')), 'utf8')) : {};
const TURRET_FRONT_ZONE = /cheek|wedge|front|mantlet|gun_notch/i;
const scalePlates = (plates, test, f) => { for (const p of plates) if (test(p)) { p.keMm = Math.round(p.keMm * f); p.ceMm = Math.round(p.ceMm * f); } };
for (const [id, l] of Object.entries(levers)) {
  if (id.startsWith('_')) continue;
  const s = TANK_SPECS[id];
  if (!s) throw new Error(`no spec ${id}`);
  if (l.hp != null) s.hp = l.hp;
  if (l.damage != null) s.gun.shells[0].dmg = l.damage;
  if (l.reload != null) { s.gun.reloadS = l.reload; for (const r of s.gun.shells) if (!r.guided) r.reloadS = l.reload; }
  if (l.gunReload != null) s.gun.reloadS = l.gunReload;
  if (l.aim != null) s.gun.aimTimeS = l.aim;
  if (l.accuracy != null) s.gun.baseAccuracy = l.accuracy;
  if (l.magazine != null || l.intraClip != null || l.fullReload != null) {
    const al = s.gun.autoloader;
    if (!al) throw new Error(`${id}: no autoloader`);
    if (l.magazine != null) al.magazineSize = l.magazine;
    if (l.intraClip != null) al.intraClipS = l.intraClip;
    if (l.fullReload != null) { al.fullReloadS = l.fullReload; s.gun.reloadS = l.fullReload; }
  }
  if (l.armor != null) scaleNonExternalArmor(s, l.armor);
  if (l.mantlet != null) scalePlates(s.armor.turretPlates, (p) => p.kind === 'main' && /mantlet|gun_notch/i.test(p.name), l.mantlet);
  if (l.turretFront != null) scalePlates(s.armor.turretPlates, (p) => p.kind === 'main' && TURRET_FRONT_ZONE.test(p.name) && !/side|cupola/i.test(p.name), l.turretFront);
  if (l.hullFront != null) scalePlates(s.armor.hullPlates, (p) => p.kind === 'main' && /glacis|lower_front|front/i.test(p.name) && !/side/i.test(p.name), l.hullFront);
  if (l.pen) { const r = s.gun.shells[0]; for (const k of ['pen100', 'pen1000', 'pen2000']) if (l.pen[k] != null) r[`${k}Mm`] = l.pen[k]; }
  for (const k of ['topSpeedKmh', 'reverseSpeedKmh', 'enginePowerHp', 'hullTraverseDegS', 'turretTraverseDegS']) if (l[k] != null) s[k] = l[k];
}
const BASE_SEEDS = [101, 211, 307, 401, 503, 601];
const seedCount = Number(arg('seeds') ?? 6);
const SEEDS = [...BASE_SEEDS, ...Array.from({ length: Math.max(0, seedCount - 6) }, (_, k) => 701 + 104 * k)].slice(0, seedCount);
const tiers = (arg('tiers') ?? '').split(',').filter(Boolean).map(Number);
const [k, n] = (arg('shard') ?? '0/1').split('/').map(Number);
const all = [];
for (const t of tiers) {
  const ids = PRODUCTION_TANK_IDS.filter((x) => displayTier(x) === t && vehicleClassForId(x) === 'mbt').sort();
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) all.push({ tier: t, a: ids[i], b: ids[j] });
}
for (const spec of (arg('rows') ?? '').split(',').filter(Boolean)) {
  const [id, t] = spec.split('@');
  const tier = Number(t ?? displayTier(id));
  for (const p of PRODUCTION_TANK_IDS.filter((x) => x !== id && displayTier(x) === tier && vehicleClassForId(x) === 'mbt').sort()) all.push({ tier, a: id, b: p, row: id });
}
for (const pair of (arg('pairs') ?? '').split(',').filter(Boolean)) { const [a, b] = pair.split(':'); all.push({ tier: displayTier(a), a, b, extra: true }); }
const only = arg('ids') ? new Set(arg('ids').split(',')) : null;
const kept = only ? all.filter((p) => only.has(p.a) || only.has(p.b)) : all;
const mine = kept.filter((_, i) => i % n === k);
const result = { zones: process.argv.includes('--zones'), seeds: SEEDS, shard: `${k}/${n}`, levers, pairs: [] };
for (const p of mine) {
  const r = runBalanceSeries({ aId: p.a, bId: p.b, seeds: SEEDS });
  result.pairs.push({ ...p, s: r.aScore, aDmg: r.averageADamage, bDmg: r.averageBDamage, aHp: r.averageAEndHp, bHp: r.averageBEndHp, dur: r.averageDurationS });
  console.log(`${p.tier} ${p.a} v ${p.b}: ${r.aScore}`);
  writeFileSync(out, JSON.stringify(result));
}
writeFileSync(out, JSON.stringify(result));
console.log(`DONE ${mine.length}`);
