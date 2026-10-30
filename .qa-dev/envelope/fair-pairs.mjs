// Lane tool (envelope-honesty-264): the tier-fairness-259 round robin (the christian2-262 lane's fairness.mjs, same
// measure: balanceSimulation runBalanceSeries at 120 m, six seeds, both ends, against every same-tier MBT with a turret),
// split into (id, peer) pairs so it shards across processes.
//   node .qa-dev/envelope/fair-pairs.mjs pairs --ids=<ids> --shard=i/n --out=<file.jsonl> [--root=<repo>]
//   node .qa-dev/envelope/fair-pairs.mjs rows --in=<a.jsonl,b.jsonl,...>         one line per id, as fairness.mjs prints
const args = Object.fromEntries(process.argv.slice(3).map((a) => { const m = /^--([^=]+)=?(.*)$/.exec(a); return [m[1], m[2]]; }));
const mode = process.argv[2];
const { appendFileSync, readFileSync } = await import('node:fs');
if (mode === 'rows') {
  const pairs = args.in.split(',').flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse));
  const by = new Map();
  for (const p of pairs) { if (!by.has(p.id)) by.set(p.id, { tier: p.tier, rows: [] }); by.get(p.id).rows.push([p.peer, p.score]); }
  for (const [id, { tier, rows }] of [...by].sort()) {
    rows.sort((a, b) => a[0].localeCompare(b[0]));
    const strength = rows.reduce((s, [, x]) => s + x, 0) / Math.max(1, rows.length);
    const out = rows.filter(([, x]) => x < 0.2 || x > 0.8);
    console.log(JSON.stringify({ id, tier, peers: rows.length, strength: +strength.toFixed(3), inBand: `${rows.length - out.length}/${rows.length}`,
      outOfBand: out, min: Math.min(...rows.map((r) => r[1])), max: Math.max(...rows.map((r) => r[1])) }));
  }
} else if (mode === 'pairs') {
  const root = args.root ? new URL(`file://${args.root.replace(/\/$/, '')}/`) : new URL('../../', import.meta.url);
  const { runBalanceSeries } = await import(new URL('src/vehicles/balanceSimulation.ts', root).href);
  const { TANK_SPECS, ALL_TANK_IDS } = await import(new URL('src/vehicles/specs.ts', root).href);
  const { tankTier } = await import(new URL('src/vehicles/tier.ts', root).href);
  const ids = String(args.ids).split(',').filter((id) => TANK_SPECS[id]);
  const gunTank = (id) => ['mbt'].includes(TANK_SPECS[id].role) && !TANK_SPECS[id].armor?.turretless;
  const jobs = [];
  for (const id of ids) {
    const tier = tankTier(id);
    for (const peer of ALL_TANK_IDS) if (peer !== id && tankTier(peer) === tier && gunTank(peer)) jobs.push([id, peer, tier]);
  }
  const [index, count] = (args.shard || '1/1').split('/').map(Number);
  for (const [k, [id, peer, tier]] of jobs.entries()) {
    if (k % count !== index - 1) continue;
    const score = runBalanceSeries({ aId: id, bId: peer, distanceM: 120 }).aScore;
    appendFileSync(args.out, `${JSON.stringify({ id, peer, tier, score })}\n`);
  }
} else throw new Error('usage: fair-pairs.mjs pairs|rows ...');
