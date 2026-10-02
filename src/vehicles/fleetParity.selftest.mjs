// One fleet on every path (ARCH-P2, 2026-10-01). Each facade loads alone in a fresh process and finalizes the
// registry its own way: the browser fleet (fleetFactory.ts: the whole fleet, and a battle roster through
// ensureTankBuilders) and the eager tool fleet (tankFactory.ts). Every saved spec — armor plates, modules, crew
// boxes, hit shells, contact points, gun, mobility, dims, labels, visual — must digest identically on all of them.
// Before this receipt the eager facade (then also the host Worker's and the Node match service's fleet) gave the
// Type 96B X and the three Type 96 concepts other turret plates, modules, crew boxes and hit shells than the
// player's: it registered modern2.ts's live type99a, whose plates share vertex arrays, and in-place armor fitting
// moved a shared vertex of the clone twice. Every facade now registers the generated metadata (asserted below with
// the legacy builder files imported first).
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { stableDigest } from './fleetParity.test-support.mjs';

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ROSTER = ['type96b_x', 'type96_72_long', 'type96_80_feng', 'type96_72m_lei', 'm1a2', 'strv122_x'];
const LOADS = {
  player: `const fleet = await import('./src/vehicles/fleetFactory.ts'); await fleet.ensureFullFleet();`,
  playerRoster: `const fleet = await import('./src/vehicles/fleetFactory.ts'); await fleet.ensureTankBuilders(${JSON.stringify(ROSTER)});`,
  tools: `await import('./src/vehicles/tankFactory.ts');`,
};
const node = (script) => run(process.execPath, ['--input-type=module', '-e', script], {
  cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 240_000,
}).then(({ stdout }) => JSON.parse(stdout));

const digestOf = (name) => node(`${LOADS[name]}
  const { fleetDigest } = await import('./src/vehicles/fleetParity.test-support.mjs');
  process.stdout.write(JSON.stringify(fleetDigest()));`);

// The legacy builder files evaluated before any facade: the registry holds their generated rows (equal data,
// never their live objects, whose plates may share vertex arrays).
const legacyFirst = () => node(`
  const { MODERN2_SPECS } = await import('./src/vehicles/modern2.ts');
  const { MODERN1_SPECS } = await import('./src/vehicles/modern1.ts');
  const { TANK_SPECS } = await import('./src/vehicles/specs.ts');
  const rows = {};
  for (const [id, live] of [...Object.entries(MODERN2_SPECS), ...Object.entries(MODERN1_SPECS)]) {
    const seen = new Set(); let shared = 0;
    for (const plate of [...TANK_SPECS[id].armor.hullPlates, ...TANK_SPECS[id].armor.turretPlates]) {
      for (const vertex of plate.verts) { if (seen.has(vertex)) shared++; seen.add(vertex); }
    }
    rows[id] = { registeredLive: TANK_SPECS[id] === live, sameData: JSON.stringify(TANK_SPECS[id]) === JSON.stringify(live), shared };
  }
  process.stdout.write(JSON.stringify(rows));`);

// The digest sees the last bit of one plate vertex (negative control).
{
  const plate = { name: 'turret_cheek_R', verts: [[0.18875, -0.03, 2.08], [1.51, 0.017959, 1.084572]] };
  const moved = structuredClone(plate);
  moved.verts[0][0] += Number.EPSILON * 0.25;
  assert.notEqual(moved.verts[0][0], plate.verts[0][0]);
  assert.notEqual(stableDigest(moved), stableDigest(plate), 'a one-ulp vertex move changes the digest');
  assert.equal(stableDigest(structuredClone(plate)), stableDigest(plate));
}

const names = Object.keys(LOADS);
const [rows, legacy] = await Promise.all([Promise.all(names.map(digestOf)), legacyFirst()]);
const digests = Object.fromEntries(names.map((name, index) => [name, rows[index]]));
const { player, tools } = digests;
const ids = Object.keys(player.specs);
assert.equal(ids.length, 217, 'the saved fleet');

assert.ok(Object.keys(legacy).includes('type99a') && Object.keys(legacy).includes('leo2a6'));
for (const [id, row] of Object.entries(legacy)) {
  assert.equal(row.registeredLive, false, `${id}: the registry never holds the legacy file's live row`);
  assert.equal(row.sameData, true, `${id}: the generated row carries the live row's data`);
  assert.equal(row.shared, 0, `${id}: no registered plate shares a vertex array`);
}

function differences(reference, candidate, only = null) {
  const out = [];
  for (const id of only ?? Object.keys(reference.specs)) {
    const a = reference.specs[id], b = candidate.specs[id];
    if (!b) { out.push(`${id}: missing`); continue; }
    if (a.digest === b.digest) continue;
    const fields = [...new Set([...Object.keys(a.fields), ...Object.keys(b.fields)])].filter((key) => a.fields[key] !== b.fields[key]);
    out.push(`${id}: ${fields.join('+')}`);
  }
  return out;
}

for (const [name, digest] of Object.entries({ player, tools })) {
  assert.deepEqual(Object.keys(digest.specs).sort(), ids.slice().sort(), `${name}: the same saved ids`);
  const open = Object.entries(digest.specs).filter(([, spec]) => !spec.finalized).map(([id]) => id);
  assert.deepEqual(open, [], `${name}: every spec's combat anatomy is finalized`);
}
assert.deepEqual(differences(player, tools), [], 'the tool fleet finalizes every spec exactly as the player\'s');
assert.deepEqual(differences(player, digests.playerRoster, ROSTER), [], 'a battle roster finalizes as in the whole fleet');
assert.equal(Object.values(digests.playerRoster.specs).filter((spec) => spec.finalized).length, ROSTER.length,
  'ensuring a roster finalizes exactly the roster');

// The tool facade keeps its historical release order (its builder packs and its listed packs evaluate first;
// generated receipts list ids in that order) over the same ids, model sources and core roster.
for (const [name, list] of Object.entries(player.catalogs)) {
  assert.deepEqual(tools.catalogs[name].slice().sort(), list.slice().sort(), `tools ${name}: the same ids`);
}
assert.deepEqual(tools.tankIds, player.tankIds);
assert.equal(tools.modelSource, player.modelSource);

console.log(`fleetParity.selftest: ${ids.length} specs digest identically on the browser and tool facades `
  + `(whole fleet and a ${ROSTER.length}-tank roster); the legacy builder files register no live rows`);
