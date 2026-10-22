// The light nation index (gameplay-modes-228 TEAM NATIONS): src/sim/nationIndex.generated.ts must equal what
// tools/nation-index.mjs writes from the registered fleet (every production bot vehicle: id, country, era, tier). The
// multiplayer bot planner reads it where the fleet cannot load (the rooms Worker, the LAN service, the p2p host). A tank
// addition, rename or re-tier regenerates it with the combat-anatomy procedure: node tools/nation-index.mjs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const run = spawnSync(process.execPath, ['--max-old-space-size=4096', 'tools/nation-index.mjs', '--check'], { cwd: root, encoding: 'utf8', timeout: 240000 });
assert.equal(run.status, 0, `the committed nation index is stale:\n${run.stderr}${run.stdout}`);
console.log(`nationIndex.selftest: ${run.stdout.trim()}`);
