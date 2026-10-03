#!/usr/bin/env node
// Record a battlefield's settlement as a props build seats it (maps-and-layouts lane, 2026-10-03; the owner's town-plan
// ruling), for props.ts townPlan: every planned building's structure, plan index, wall, the props stream's state after
// the wall pick, and its final pose. Run it on a checkout of the build whose town a map should keep (a git worktree or
// `git archive <commit>` of it): it copies that checkout's src/world/props.ts beside itself with the stream state and a
// record hook spliced in, builds each map headless (terrain, vegetation and props at the shard seeds 1337/2001/2002),
// prints the entries as JSON and removes the copy. The checkout's own files are not changed.
//
//   node tools/record-town-plan.mjs --root=<checkout> titan_gorge skybridge > plans.json
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const root = path.resolve(args.find((a) => a.startsWith('--root='))?.slice(7) ?? '.');
const maps = args.filter((a) => !a.startsWith('--'));
if (!maps.length) throw new Error('name at least one map');

const propsPath = path.join(root, 'src/world/props.ts');
const copyPath = path.join(root, 'src/world/.props.town-record.ts');
let source = readFileSync(propsPath, 'utf8');
const splice = (pattern, replace, what) => {
  if (!pattern.test(source)) throw new Error(`record-town-plan: ${what} not found in ${propsPath}`);
  source = source.replace(pattern, replace);
};
// the stream keeps its state readable: mulberry32's closure value before its next draw
splice(/export function mulberry32\(a: number\): Rng \{return function\(\)\{([\s\S]*?)\}\}/,
  (_m, body) => `export function mulberry32(a: number): Rng {const f = function(){${body}}; (f as unknown as { state: () => number }).state = () => a; return f;}`,
  'mulberry32');
// the wall pick, then the state the builder starts from
splice(/const info = builder\(rng, tmp, pickWall\(rng\)\);/,
  'const recWall = pickWall(rng); const recState = (rng as unknown as { state: () => number }).state();\n    const info = builder(rng, tmp, recWall);',
  'the planned builder call');
// the final pose, as the building is counted
splice(/(\n\s*)if \(!explicitStructure\) bi\+\+;\n(\s*)return true;/,
  (_m, lead, tail) => `${lead}((globalThis as unknown as { __townRecord?: unknown[] }).__townRecord ??= []).push({ structure: structureId, planIndex: bi, wall: recWall, rng: recState, x: px, z: pz, rot });${lead}if (!explicitStructure) bi++;\n${tail}return true;`,
  'the planned building count');
writeFileSync(copyPath, source);
try {
  const imp = (rel) => import(pathToFileURL(path.join(root, rel)).href);
  const { installWorldBuildFixture } = await imp('tools/headlessWorldCollision.mjs');
  installWorldBuildFixture();
  const [mapsModule, terrain, vegetation, props, fleet, models] = await Promise.all([
    imp('src/world/maps/index.ts'), imp('src/world/terrain.ts'), imp('src/world/vegetation.ts'),
    imp('src/world/.props.town-record.ts'), imp('src/vehicles/fleetFactory.ts'), imp('src/world/propsModelStore.ts'),
  ]);
  await models.preloadPropModels();
  const result = {};
  for (const mapId of maps) {
    const config = mapsModule.getMapConfig(mapId);
    const wreckIds = config.props?.tankWrecks?.ids ?? [];
    if (wreckIds.length) await fleet.ensureTankBuilders(wreckIds);
    const engine = { anisotropy: 4, setupShadowMaterial() {} };
    const field = terrain.createHeightField(1337, config);
    const flora = vegetation.createVegetation(field, engine, 2001, config);
    globalThis.__townRecord = [];
    props.createProps(field, engine, 2002, config, flora);
    result[mapId] = globalThis.__townRecord.map((entry) => ({ ...entry,
      x: Math.round(entry.x * 1e6) / 1e6, z: Math.round(entry.z * 1e6) / 1e6, rot: Math.round(entry.rot * 1e9) / 1e9 }));
  }
  process.stdout.write(`${JSON.stringify(result, null, 1)}\n`);
} finally {
  rmSync(copyPath, { force: true });
}
