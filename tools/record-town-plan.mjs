#!/usr/bin/env node
// Record a battlefield's settlement as a props build seats it (maps-and-layouts lane, 2026-10-03; the owner's town-plan
// ruling), for props.ts townPlan: every planned building's structure, plan index, wall, the props stream's state after
// the wall pick, and its final pose. Run it on a checkout of the build whose town a map should keep (a git worktree or
// `git archive <commit>` of it): it copies that checkout's src/world/props.ts beside itself with the stream state and a
// record hook spliced in, builds each map headless (terrain, vegetation and props at the shard seeds 1337/2001/2002),
// prints the entries as JSON and removes the copy. The checkout's own files are not changed.
//
// It records the settlement's light (destructible) buildings as well, each one's kind and final pose (props.ts
// townLightPlan). With --write=<file> it writes the generated module (both records, the maps in the order named)
// instead of printing JSON:
//
//   node tools/record-town-plan.mjs --root=<checkout> titan_gorge skybridge > plans.json
//   node tools/record-town-plan.mjs --root=<checkout> --write=src/world/maps/townPlans.generated.ts titan_gorge skybridge
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const root = path.resolve(args.find((a) => a.startsWith('--root='))?.slice(7) ?? '.');
const maps = args.filter((a) => !a.startsWith('--'));
const writeTo = args.find((a) => a.startsWith('--write='))?.slice(8);
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
// (the regional-buildings lane named the wall pick: `const wallBucket = pickWall(rng);` before the builder call)
splice(/const wallBucket = pickWall\(rng\);(\s*)const info = builder\(rng, tmp, wallBucket\);/,
  (_m, gap) => `const wallBucket = pickWall(rng); const recWall = wallBucket; const recState = (rng as unknown as { state: () => number }).state();${gap}const info = builder(rng, tmp, wallBucket);`,
  'the planned builder call');
// the final pose, as the building is counted
splice(/(\n\s*)if \(!explicitStructure\) bi\+\+;\n(\s*)return true;/,
  (_m, lead, tail) => `${lead}((globalThis as unknown as { __townRecord?: unknown[] }).__townRecord ??= []).push({ structure: structureId, planIndex: bi, wall: recWall, rng: recState, x: px, z: pz, rot });${lead}if (!explicitStructure) bi++;\n${tail}return true;`,
  'the planned building count');
// the street rows (the map-revival lane, 2026-10-05): the props stream's state before a row's builder, the row as it
// is counted, and its rubble's seat, size and the street stream's state before the pile
splice(/(\n\s*)const info = ruined\n(\s*)\? makeRuin\(rng, tmp\)/,
  (_m, lead, mid) => `${lead}const recRowState = (rng as unknown as { state: () => number }).state();${lead}const info = ruined\n${mid}? makeRuin(rng, tmp)`,
  'the street row builder call');
splice(/(\n\s*)addStructureCollision\(ruined \? 'ruin' : 'rowhouse', tmp, x, fit\.y \+ 0\.05, z, rot\);/,
  (_m, lead) => `${lead}((globalThis as unknown as { __townRows?: unknown[] }).__townRows ??= []).push({ x, z, rot, w: width, d: depth, ruined, wall: rowWall, rng: recRowState });${lead}addStructureCollision(ruined ? 'ruin' : 'rowhouse', tmp, x, fit.y + 0.05, z, rot);`,
  'the street row as it is counted');
splice(/(\n\s*)addRubblePile\(seat\[0\], seat\[1\], pr, srng\);/,
  (_m, lead) => `${lead}{ const rows = (globalThis as unknown as { __townRows?: Record<string, unknown>[] }).__townRows; const last = rows?.[rows.length - 1]; if (last) Object.assign(last, { rubbleX: seat[0], rubbleZ: seat[1], rubbleR: pr, rubbleRng: (srng as unknown as { state: () => number }).state() }); }${lead}addRubblePile(seat[0], seat[1], pr, srng);`,
  'the street row rubble pile');
// the light-building pass's placement, as it is placed
splice(/(\n\s*)addDestructible\(kind, x, fit\.y \+ 0\.04, z, rot\);/,
  (_m, lead) => `${lead}((globalThis as unknown as { __townLight?: unknown[] }).__townLight ??= []).push({ kind, x, z, rot });${lead}addDestructible(kind, x, fit.y + 0.04, z, rot);`,
  'the light building placement');
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
    globalThis.__townLight = [];
    globalThis.__townRows = [];
    props.createProps(field, engine, 2002, config, flora);
    const pose = (entry) => ({ ...entry,
      x: Math.round(entry.x * 1e6) / 1e6, z: Math.round(entry.z * 1e6) / 1e6, rot: Math.round(entry.rot * 1e9) / 1e9 });
    const rowPose = (entry) => ({ ...pose(entry), w: Math.round(entry.w * 1e6) / 1e6, d: Math.round(entry.d * 1e6) / 1e6,
      ...(entry.rubbleX !== undefined ? { rubbleX: Math.round(entry.rubbleX * 1e6) / 1e6, rubbleZ: Math.round(entry.rubbleZ * 1e6) / 1e6,
        rubbleR: Math.round(entry.rubbleR * 1e9) / 1e9 } : {}) });
    result[mapId] = { buildings: globalThis.__townRecord.map(pose), light: globalThis.__townLight.map(pose), rows: globalThis.__townRows.map(rowPose) };
  }
  if (writeTo) writeFileSync(path.resolve(writeTo), generatedModule(result));
  else process.stdout.write(`${JSON.stringify(result, null, 1)}\n`);
} finally {
  rmSync(copyPath, { force: true });
}

function generatedModule(result) {
  const line = (entry) => `    { ${Object.entries(entry).map(([key, value]) => `${key}: ${typeof value === 'string' ? `'${value}'` : value}`).join(', ')} },`;
  const block = (name, type, key, only = () => true) => [`export const ${name}: Readonly<Record<string, readonly ${type}[]>> = {`,
    ...Object.entries(result).filter(([, record]) => only(record)).flatMap(([mapId, record]) => [`  ${mapId}: [`, ...record[key].map(line), '  ],']), '};'];
  // the street rows are replayed only where a map authors townRowPlan (Suzhou Creek): the other maps' rows still generate
  const rowMaps = (process.env.COT_TOWN_ROW_MAPS ?? 'blackglass').split(',');
  const withRows = Object.entries(result).some(([mapId, record]) => rowMaps.includes(mapId) && record.rows?.length);
  return [
    `// Generated by tools/record-town-plan.mjs from PR #9's head 0bbb0cddc (the maps-and-layouts lane, 2026-10-03; the owner's`,
    '// town-plan ruling): each rebuilt battlefield\'s settlement exactly as that build seated it. Every TOWN_PLANS entry is',
    '// one planned building: its structure, its plan index, its wall, the props stream\'s state after the wall pick, and',
    '// its final pose (props.ts townPlan); every TOWN_LIGHT_PLANS entry is one light (destructible) building, its kind and',
    '// final pose (props.ts townLightPlan). Do not edit by hand.',
    withRows ? "import type { TownLightEntry, TownPlanEntry, TownRowEntry } from '../props.ts';" : "import type { TownLightEntry, TownPlanEntry } from '../props.ts';",
    '',
    ...block('TOWN_PLANS', 'TownPlanEntry', 'buildings'),
    '',
    ...block('TOWN_LIGHT_PLANS', 'TownLightEntry', 'light'),
    '',
    ...(withRows ? [...block('TOWN_ROW_PLANS', 'TownRowEntry', 'rows', (record) => Object.entries(result).some(([id, r]) => r === record && rowMaps.includes(id))), ''] : []),
  ].join('\n');
}
