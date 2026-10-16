#!/usr/bin/env node
// tools/cost-census.mjs — per map, the props group's draw calls, triangles and shader programs as the desktop tier builds
// it (Node, the headless world build), its obstacles and colliders, and each destructible pool's draws, triangles and
// instances (from the looks lane's census, 2026-10-13; into tools/ with props lane A's #2, 2026-10-14, for every lane's
// landing protocol: "run the cost census: draws, tris, obstacles, per map, base against branch").
//
//   node tools/cost-census.mjs <out.jsonl> <mapId...>         one row a map (cwd = the tree to measure)
//   node tools/cost-census.mjs --compare <base.jsonl> <branch.jsonl> [--max-tris=45000] [--max-draws=0]
//                                                            the branch against the base, map by map; exit 1 past a limit
// Triangles are what the GPU is sent: a pool's geometry × its instances (a distance-folded pool counts both its forms).
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const tris = (g) => (g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3;

/** One map's row from a built props group (`built`: props.createProps's result). */
export function censusRow(mapId, built, ms = 0) {
  let draws = 0, triangles = 0;
  const programs = new Set(), byName = {}, pools = {};
  built.group.updateMatrixWorld(true);
  built.group.traverse((o) => {
    if (!o.isMesh) return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    const n = o.isInstancedMesh ? o.count : 1;
    if (n <= 0) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const t = tris(o.geometry) * n;
    draws += mats.length;
    triangles += t;
    for (const m of mats) programs.add(`${m.type}${m.customProgramCacheKey?.() ?? ''}`);
    const key = o.name || o.userData?.kind || (o.isInstancedMesh ? 'inst' : 'mesh');
    byName[key] = byName[key] ?? { draws: 0, tris: 0 };
    byName[key].draws += mats.length; byName[key].tris += t;
    if (o.isInstancedMesh && o.name.startsWith('destructible-')) {
      pools[o.name.slice(13)] = { draws: mats.length, trisPer: tris(o.geometry), instances: n };
    }
  });
  const kinds = {};
  for (const d of built.destructibles) kinds[d.kind] = (kinds[d.kind] ?? 0) + 1;
  return { mapId, draws, triangles: Math.round(triangles), programs: programs.size, obstacles: built.obstacles.length,
    colliders: built.colliders?.length ?? null, kinds, pools, ms,
    top: Object.entries(byName).sort((a, b) => b[1].tris - a[1].tris).slice(0, 12) };
}

/** The branch's rows against the base's, by map: deltas, and each limit a map passes. */
export function compareRows(baseRows, branchRows, { maxTris = Infinity, maxDraws = Infinity } = {}) {
  const base = new Map(baseRows.map((r) => [r.mapId, r]));
  return branchRows.filter((r) => base.has(r.mapId)).map((r) => {
    const b = base.get(r.mapId);
    const d = { mapId: r.mapId, draws: r.draws - b.draws, triangles: r.triangles - b.triangles, programs: r.programs - b.programs,
      obstacles: r.obstacles - b.obstacles, colliders: (r.colliders ?? 0) - (b.colliders ?? 0) };
    const pools = {};
    for (const kind of new Set([...Object.keys(b.pools ?? {}), ...Object.keys(r.pools ?? {})])) {
      const x = b.pools?.[kind], y = r.pools?.[kind];
      const dt = (y ? y.trisPer * y.instances : 0) - (x ? x.trisPer * x.instances : 0);
      if (dt !== 0 || !x !== !y) pools[kind] = { tris: dt, trisPer: [x?.trisPer ?? 0, y?.trisPer ?? 0], instances: [x?.instances ?? 0, y?.instances ?? 0] };
    }
    return { ...d, pools, ok: d.triangles <= maxTris && d.draws <= maxDraws };
  });
}

const readRows = (file) => readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

async function main(argv) {
  if (argv[0] === '--compare') {
    const num = (name) => { const a = argv.find((x) => x.startsWith(`--${name}=`)); return a ? Number(a.split('=')[1]) : Infinity; };
    const rows = compareRows(readRows(argv[1]), readRows(argv[2]), { maxTris: num('max-tris'), maxDraws: num('max-draws') });
    for (const r of rows) {
      const top = Object.entries(r.pools).sort((a, b) => Math.abs(b[1].tris) - Math.abs(a[1].tris)).slice(0, 6)
        .map(([k, p]) => `${k} ${p.tris > 0 ? '+' : ''}${p.tris}`).join(', ');
      console.log(`${r.ok ? 'ok  ' : 'OVER'} ${r.mapId.padEnd(12)} draws ${r.draws >= 0 ? '+' : ''}${r.draws}  tris ${r.triangles >= 0 ? '+' : ''}${r.triangles}  programs ${r.programs >= 0 ? '+' : ''}${r.programs}  obstacles ${r.obstacles >= 0 ? '+' : ''}${r.obstacles}  colliders ${r.colliders >= 0 ? '+' : ''}${r.colliders}${top ? `  (${top})` : ''}`);
    }
    return rows.every((r) => r.ok) ? 0 : 1;
  }
  const [out, ...mapIds] = argv;
  if (!out || !mapIds.length) { console.error('usage: node tools/cost-census.mjs <out.jsonl> <mapId...> | --compare <base> <branch>'); return 2; }
  const T = process.cwd();
  const { installWorldBuildFixture } = await import(`${T}/tools/headlessWorldCollision.mjs`);
  installWorldBuildFixture();
  const [maps, terrain, vegetation, props, models, fleet] = await Promise.all([
    import(`${T}/src/world/maps/index.ts`), import(`${T}/src/world/terrain.ts`), import(`${T}/src/world/vegetation.ts`), import(`${T}/src/world/props.ts`),
    import(`${T}/src/world/propsModelStore.ts`), import(`${T}/src/vehicles/fleetFactory.ts`)]);
  await models.preloadPropModels();
  const engine = { anisotropy: 4, setupShadowMaterial() {} };
  for (const mapId of mapIds) {
    const t0 = Date.now();
    const config = maps.getMapConfig(mapId);
    if (config.props?.tankWrecks?.ids?.length) await fleet.ensureTankBuilders(config.props.tankWrecks.ids);
    const field = terrain.createHeightField(1337, config);
    const flora = vegetation.createVegetation(field, engine, 2001, config);
    const built = props.createProps(field, engine, 2002, config, flora);
    const row = censusRow(mapId, built, Date.now() - t0);
    appendFileSync(out, JSON.stringify(row) + '\n');
    console.log(mapId, 'draws', row.draws, 'tris', row.triangles, 'programs', row.programs, 'obst', row.obstacles, `${row.ms} ms`);
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));
