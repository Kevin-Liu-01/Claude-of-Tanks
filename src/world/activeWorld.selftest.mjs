// activeWorld.selftest.mjs — (mp-fixes-277; Kevin 2026-11-24, after 276 shipped: "multiplayer is broken ... and still merges
// 2 maps") No module finds the battlefield by looking for it. Every built battlefield stays in the scene hidden
// (worldActivationRuntime.ts), so a reader that searched the scene by name, or took a world snapshotted earlier, could
// hold a hidden one; the black-world guard did, and its heal drew it beside the presented one. The battlefield comes from
// its owner (src/world/activeWorld.ts, bound by the activation runtime):
// 1. no source file under src names a world by its `world-` prefix to find one (map.ts gives the name; nothing reads it);
// 2. the guard's install reads the owner's reference for every entry, and no entry hands it a world of its own;
// 3. the guard tracks the live world (no world noted at the reveal), and notes a reveal per battle scope.
// The behaviour is covered beside its owners: src/engine/blackWorldGuard.selftest.mjs (a hidden planned battlefield first
// in the scene, the old fallback as the negative control, a round written over a round) and
// src/world/worldActivationOneWorld.selftest.mjs section 6 (the runtime binds the reference).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), 'utf8');

// ---- 1. no world found by name in src
const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith('.ts')) files.push(relative(root, path));
  }
};
walk(join(root, 'src'));
assert.ok(files.length > 500, `src lists its modules (${files.length})`);
// the ways a module could find a battlefield by its name
const lookups = [
  /startsWith\(\s*['"`]world-/,
  /getObjectByName\(\s*['"`]world-/,
  /\.name\s*===?\s*['"`]world-/,
  /\.name\.(includes|indexOf|match|test)\(\s*['"`/]world-/,
  /\/\^world-\//,
];
const found = [];
for (const file of files) {
  const lines = read(file).split('\n');
  lines.forEach((line, index) => {
    if (lookups.some((pattern) => pattern.test(line))) found.push(`${file}:${index + 1}: ${line.trim()}`);
  });
}
assert.deepEqual(found, [], `a module finds a battlefield by name; read activeWorld() from src/world/activeWorld.ts instead:\n${found.join('\n')}`);
assert.match(read('src/world/map.ts'), /group\.name = 'world-' \+ config\.id;/, 'map.ts still names the battlefield (the name this scan keeps unread)');

// ---- 2. the guard's install reads the owner for every entry
const install = read('src/engine/blackWorldGuardInstall.ts');
assert.match(install, /getWorld: activeWorld,/, 'the install hands the guard the owner\'s world');
assert.match(install, /isBattlefieldRoot,/, 'and the owner\'s battlefield test');
assert.match(install, /battleId: \(\) => currentBattleScope\(\)\?\.id \?\? null/, 'and the battle scope\'s id');
assert.doesNotMatch(install, /arming\.getWorld/, 'no entry hands the guard a world of its own');
for (const file of ['src/mp/session/browserComposition.ts', 'src/game/soloBattleDeploymentRuntime.ts']) {
  const arms = read(file).split('\n').filter((line) => line.includes('armBlackWorldGuard({'));
  assert.ok(arms.length >= 1, `${file} arms the guard`);
  for (const line of arms) assert.doesNotMatch(line, /getWorld/, `${file} arms the guard with no world of its own`);
}
assert.match(read('src/world/worldActivationRuntime.ts'), /bindActiveWorld\(\{/, 'the activation runtime binds the reference');

// ---- 3. the guard reads the live world and notes a reveal per battle
const guard = read('src/engine/blackWorldGuard.ts');
assert.doesNotMatch(guard, /revealWorld/, 'no world is noted at the reveal: the ROOTS check and H1 read the owner\'s world now');
assert.match(guard, /\(ports\.battleId\?\.\(\) \?\? null\) !== revealBattle\)\) noteReveal\(\)/, 'a new battle scope notes its own reveal');
assert.match(guard, /if \(ports\.isBattlefieldRoot\?\.\(child\)\) continue;/, 'a battlefield is never a reveal root');

console.log(`activeWorld.selftest: no module of ${files.length} finds a battlefield by name, the guard reads the owner's world for every entry, `
  + 'tracks it live and notes a reveal per battle scope PASS');
