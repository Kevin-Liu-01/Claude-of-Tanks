// The battle fleet pass (roster-errors-279, 2026-11-26; manual `fleet` suite): every roster id built as a battle builds
// it, at each role a battle builds (fleetBattleBuilds.test-support.mjs), with no throw and no console.error or
// console.warn from its loaders and builders. The roster's fallback hides a failed build in a battle behind a donor's
// tank and a console line, which no gate read (2026-11-09 and 2026-11-21: leo2a5, merkava, sabra_mk2, griffin50mm,
// bmp3m_dragun125, kurganets25, t14_armata and tos1a_tagil in lane dev consoles).
//
// Node holds one copy of three, so this pass sees what the builders themselves do. Those eight ids build clean here: in
// those dev sessions the page held a second three (the server re-bundled its dependencies mid-session with hmr off), and
// every `instanceof THREE.*` check in a lazily loaded profile failed against the core's objects. vite.config.ts now
// reports that event (optimizerReloadReport) and keeps each worktree's optimizer cache its own.
//
// FLEET_BATTLE_BUILD_IDS=<id,id> narrows the pass (a planted-error control on a few ids); the full pass runs ~6 CPU-min.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runFleetSweep } from './fleetSweep.test-support.mjs';

const at = (file) => JSON.stringify(pathToFileURL(fileURLToPath(new URL(file, import.meta.url))).href);
const only = (process.env.FLEET_BATTLE_BUILD_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean);

await runFleetSweep(`
  import assert from 'node:assert/strict';
  const { installCanvasFixture } = await import(${at('./canvasFixture.test-support.mjs')});
  installCanvasFixture();
  const { battleBuildFindings, formatBattleBuildFindings } = await import(${at('./fleetBattleBuilds.test-support.mjs')});
  const fleet = await import(${at('./fleetFactory.ts')});
  const { FLEET_GROUP_BY_ID } = await import(${at('./fleetManifest.ts')});
  const specs = await import(${at('./specs.ts')});
  const all = Object.keys(FLEET_GROUP_BY_ID);
  const only = ${JSON.stringify(only)};
  for (const id of only) assert.ok(all.includes(id), 'FLEET_BATTLE_BUILD_IDS: unknown tank id ' + id);
  const ids = only.length ? only : all;
  process.send({ kind: 'fleet-start', ids });
  const findings = await battleBuildFindings({ fleet, ids, onBuilt: (id) => process.send({ kind: 'fleet-complete', id }) });
  if (!only.length) {
    // every id a battle can field has a builder group, so the pass above built the whole roster
    assert.deepEqual(specs.VISIBLE_TANK_IDS.filter((id) => !all.includes(id)), [], 'every visible tank has a builder group');
  }
  if (findings.length) {
    console.error('fleetBattleBuilds: ' + findings.length + ' battle build findings\\n' + formatBattleBuildFindings(findings));
    process.exit(1);
  }
`);

console.log(`fleetBattleBuilds.selftest: PASS (${only.length ? only.join(', ') : 'the whole roster'} at every battle role, no throw and no console.error or console.warn)`);
