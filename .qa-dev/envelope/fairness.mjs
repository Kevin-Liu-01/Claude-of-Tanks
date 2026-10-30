// Lane tool (envelope-honesty-264 (copied from the christian2-262 lane tool)): one same-tier fairness line per id, the tier-fairness-259 measure: the balance-range
// round robin (balanceSimulation.ts runBalanceSeries: six seeds, both range ends, 120 m) against every MBT/medium gun
// tank at the id's shown tier. strength = mean score; band = pairs inside 0.2-0.8.
//   node .qa-dev/envelope/fairness.mjs --ids=<ids> [--root=<repo>]
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)=?(.*)$/.exec(a); return [m[1], m[2]]; }));
const root = args.root ? new URL(`file://${args.root.replace(/\/$/, '')}/`) : new URL('../../', import.meta.url);
const { runBalanceSeries } = await import(new URL('src/vehicles/balanceSimulation.ts', root).href);
const { TANK_SPECS, ALL_TANK_IDS } = await import(new URL('src/vehicles/specs.ts', root).href);
const { tankTier } = await import(new URL('src/vehicles/tier.ts', root).href);
const ids = String(args.ids ?? 'centurion3,centurion5_2,strv81').split(',').filter((id) => TANK_SPECS[id]);
const gunTank = (id) => ['mbt'].includes(TANK_SPECS[id].role) && !TANK_SPECS[id].armor?.turretless;
for (const id of ids) {
  const tier = tankTier(id);
  const peers = ALL_TANK_IDS.filter((p) => p !== id && tankTier(p) === tier && gunTank(p));
  const rows = peers.map((p) => [p, runBalanceSeries({ aId: id, bId: p, distanceM: 120 }).aScore]);
  const strength = rows.reduce((s, [, x]) => s + x, 0) / Math.max(1, rows.length);
  const out = rows.filter(([, x]) => x < 0.2 || x > 0.8);
  console.log(JSON.stringify({ id, tier, peers: rows.length, strength: +strength.toFixed(3),
    inBand: `${rows.length - out.length}/${rows.length}`, outOfBand: out, min: Math.min(...rows.map((r) => r[1])), max: Math.max(...rows.map((r) => r[1])) }));
}
