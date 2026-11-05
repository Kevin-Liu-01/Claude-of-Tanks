// 2026-11-02 audit F11 / Q16 (round 2): tools/sfx-smoke.mjs fires synthetic deaths of one live enemy id (the scenes'
// tank_explosion and tank_burnout, and the volley's two blasts 120 ms apart). The mixer hears a hull die once a life, so
// the tool revives the enemy with the game's own new-life edge (mode:respawn) before each one. The browser tool itself
// needs a page and is not run here; this receipt reads the tool's own death sequence from its source and replays it
// against the real engine in Node, so the tool and the mixer's per-life latch cannot drift apart unnoticed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBus } from '../game/stateCore.ts';
import { installFetch, namedContext, terrain, tank, listener, probeOf, mark, since, count } from './engineHarness.test-support.mjs';

const tool = readFileSync(new URL('../../tools/sfx-smoke.mjs', import.meta.url), 'utf8');

// --- the tool's sequence, from its source ---------------------------------------------------------------------------
const scenes = [...tool.matchAll(/\{ name: '(\w+)', ev: 'tank:destroyed', holdMs: \d+,\s*p: `\{[^`]*cause:'(\w+)'\}`,\s*expect: \[([^\]]*)\] \}/g)]
  .map(([, name, cause, expect]) => ({ name, cause, expect: [...expect.matchAll(/'(\w+)'/g)].map((m) => m[1]) }));
assert.deepEqual(scenes.map((s) => s.name), ['tank_explosion', 'tank_burnout'], 'the tool\'s two destruction scenes are found');
assert.match(tool, /const reviveEnemy = \(\) => emit\('mode:respawn', '\{id:window\.__P\.enemyId\}'\);/,
  'the tool revives its enemy with the game\'s own new-life edge');
assert.match(tool, /for \(const sc of SCENES\) \{\s*if \(sc\.ev === 'tank:destroyed'\) await reviveEnemy\(\);/,
  'every destruction scene revives the enemy first');
const volley = tool.slice(tool.indexOf('// ---- volley stress'), tool.indexOf("writeWav(join(outDir, 'volley.wav')"));
const volleyDeaths = [...volley.matchAll(/await emit\('tank:destroyed'/g)].length;
assert.equal(volleyDeaths, 2, 'the volley fires two deaths');
assert.equal([...volley.matchAll(/await reviveEnemy\(\);\s*await emit\('tank:destroyed'/g)].length, volleyDeaths,
  'each volley death is revived first');
const loose = [...tool.matchAll(/emit\('tank:destroyed'/g)].length;
assert.equal(loose, volleyDeaths, 'no other synthetic death in the tool (each would need its own revive)');

// --- the sequence against the real engine --------------------------------------------------------------------------
globalThis.window = {};
installFetch();
const { createAudio } = await import('./audioEngine.ts');
const ctx = namedContext();
const audio = createAudio({ context: ctx, getMapId: () => 'verdant', getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop' });
const bus = createBus();
audio.bindBus(bus);
audio.resume();
const probe = probeOf();
const me = tank('me', { isPlayer: true });
const foe = tank('foe', { specId: 'leo2a4', nation: 'Germany', x: 0, z: 30, team: 'enemy' });
const frames = (n) => { for (let i = 0; i < n; i++) { ctx.advance(1 / 30); audio.update(1 / 30, listener, [me, foe]); } };
bus.emit('phase:change', { phase: 'battle' });
await audio.warmBattleEvents(['t72b3m_2022', 'leo2a4']);
await probe.libraryIdle();
audio.ambientOn(true);
frames(10);
bus.emit('battle:rollout', {});
const death = (cause, x, z) => {
  bus.emit('mode:respawn', { id: 'foe' }); // the tool's reviveEnemy()
  bus.emit('tank:destroyed', { id: 'foe', specId: 't90am', pos: [x, -1.5, z], killerId: cause === 'fire' ? null : 'me', cause });
};
// turret_land comes from the physics lane's landing callback (a page's rigid body), not the death itself
const DEATH_SOUNDS = new Set(['tank_explode_ammo', 'burnout_blast', 'debris_metal', 'cookoff_loop']);
for (const scene of scenes) {
  const seq = mark(probe);
  death(scene.cause, 0, 30);
  frames(150);
  const heard = since(seq, probe);
  for (const id of scene.expect.filter((e) => DEATH_SOUNDS.has(e))) {
    assert.ok(heard.includes(id), `${scene.name}: ${id} is heard for the revived enemy's death (${heard.filter((n) => DEATH_SOUNDS.has(n))})`);
  }
}
const seq = mark(probe);
death('ammorack', -6, 24);
frames(4); // 120 ms
death('ammorack', 9, 21);
frames(100);
assert.equal(count(since(seq, probe), 'tank_explode_ammo'), 2, 'the volley\'s two revived deaths are two blasts');
// and without the revive the same id's second death is deduped by design (a re-sent network death)
const dup = mark(probe);
bus.emit('tank:destroyed', { id: 'foe', specId: 't90am', pos: [0, -1.5, 30], killerId: 'me', cause: 'ammorack' });
frames(30);
assert.equal(count(since(dup, probe), 'tank_explode_ammo'), 0, 'a death with no new life between is heard once');
bus.emit('phase:change', { phase: 'garage' });

console.log(`sfxSmokeDeaths.selftest: sfx-smoke's ${scenes.length} destruction scenes and ${volleyDeaths}-death volley revive first and are heard through the per-life latch passed`);
