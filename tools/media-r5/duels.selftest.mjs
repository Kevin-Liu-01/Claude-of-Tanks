import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMBAT, DUELS, DUEL_TABLE, FLEET, OWNER_NINE, SHOTS, combatTake, siteScene } from './site50.mjs';
import { knockouts } from './combat-check.mjs';
import { sampleActorTrack } from '../../src/game/studioTimeline.ts';

// The duel wall in motion (2026-10-25, the owner on the versus wall: "the tanks arent even moving"; the media audit: the
// twelve versus films the stillest on the site): takes 234 to 245, each versus pair re-staged as a moving 1v1 duel
// (site50.mjs DUEL_TABLE), apart from the combat round's nine (combat.selftest.mjs). Every take a race but one, both
// guns trading rounds, one knockout, and quiet: no dust burst and every explosion small, so both tanks stay in sight.

// --- the takes ------------------------------------------------------------------------------------------------------
const TAKES = Array.from({ length: 12 }, (_, i) => 234 + i);
assert.deepEqual(DUELS.map((s) => s[0]), TAKES, 'takes 234 to 245 in order');
const all = [...SHOTS, ...OWNER_NINE, ...FLEET, ...COMBAT, ...DUELS];
assert.equal(new Set(all.map((s) => s[0])).size, all.length, 'unique take numbers across every take');
assert.equal(new Set(all.map((s) => s[1])).size, all.length, 'unique ids across every take');
assert.ok(COMBAT.every((s) => !s[5].quiet), 'quiet is the duels\' alone: the combat round keeps the fire it was filmed with');
// (Steinburg's streets leave no 40 m run for a race: 235 is a street fight, the Leopard driving at the standing T-90M)
const RACES = DUEL_TABLE.filter((r) => r[15]?.geo === 'race').map((r) => r[0]);
assert.deepEqual(RACES, TAKES.filter((n) => n !== 235), 'every take a race but the Steinburg street fight');
// each re-staged pair stands where its versus scene stood: its set named for the scene, every pair once (234 replaces
// the versus 03 film on a set of its own, the reservoir village at golden hour)
const versus = DUEL_TABLE.filter((r) => r[15]?.versus).map((r) => [r[0], r[15].versus, r[3].id]);
assert.deepEqual(versus.map(([n]) => n), TAKES.slice(1), 'takes 235 to 245 each name their versus scene');
assert.equal(new Set(versus.map(([, v]) => v)).size, versus.length, 'every versus pair once');
for (const [n, v, set] of versus) {
  assert.equal(set, `${v}-set`, `s${n}: its set stands where ${v} stood`);
  assert.ok(existsSync(fileURLToPath(new URL(`./versus/scenes/${v}.json`, import.meta.url))), `s${n}: ${v} is a versus scene`);
}

const poseAt = (scene, name, tMs) => {
  const keys = scene.storyboard.actorTracks.find((t) => t.actor === name)?.keys, out = {};
  assert.ok(keys?.length && sampleActorTrack(keys, tMs, out), `${scene.meta.id}: ${name} keyed`);
  return [out.x, out.z];
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], len = (v) => Math.hypot(v[0], v[1]);
// every effect but the dust, counted by type: what a quiet take keeps
const kept = (scene) => JSON.stringify(Object.entries(Object.groupBy(scene.effects.filter((e) => e.type !== 'dust'), (e) => e.type))
  .map(([type, list]) => [type, list.length]).sort());
let dropped = 0;
for (const shot of DUELS) {
  const n = shot[0], row = DUEL_TABLE.find((r) => r[0] === n), scene = siteScene(shot), id = scene.meta.id;
  assert.equal(shot[5].combat, '1v1', `${id}: a 1v1`);
  assert.deepEqual(scene.actors.map((a) => [a.name, a.id]), [['hero', row[6][0]], ['foe0', row[7][0]]], `${id}: the hero and its foe as the row casts them`);
  assert.equal(scene.autoPlace, false, `${id}: placed as built (the hits are seated on the hulls where the table puts them)`);
  assert.equal(scene.still?.tMs, 4560, `${id}: the still is the knockout`);
  // the rounds go both ways, and the hero's round knocks the foe out
  const shooters = new Set(scene.effects.filter((e) => e.type === 'fire').map((e) => e.actor));
  assert.ok(shooters.has('hero') && shooters.has('foe0'), `${id}: both sides fire`);
  const kos = knockouts(scene);
  assert.equal(kos.length, 1, `${id}: one knockout`);
  const [ko] = kos;
  assert.ok(ko.victim === 'foe0' && ko.killer === 'hero' && ko.killMs - ko.shotMs <= 250, `${id}: foe0 knocked out by the hero's round`);
  // driving: a race's two hulls run abreast on parallel lines, the gap held through the knockout; the street fight's
  // hero drives at its standing foe
  const h = sub(poseAt(scene, 'hero', ko.killMs), poseAt(scene, 'hero', 0)), f = sub(poseAt(scene, 'foe0', ko.killMs), poseAt(scene, 'foe0', 0));
  const gap = (t) => len(sub(poseAt(scene, 'hero', t), poseAt(scene, 'foe0', t)));
  if (RACES.includes(n)) {
    assert.ok(len(h) > 20 && len(f) > 20, `${id}: both hulls drive (${len(h).toFixed(1)} m, ${len(f).toFixed(1)} m by the knockout)`);
    assert.ok((h[0] * f[0] + h[1] * f[1]) / len(h) / len(f) > 0.99, `${id}: abreast, the same way`);
    for (const t of [0, 2000, ko.killMs]) assert.ok(Math.abs(gap(t) - row[8]) < 0.5, `${id}: ${row[8]} m between the lines at ${t} (${gap(t).toFixed(2)})`);
    assert.ok(scene.meta.combat.lens === 'raceClose', `${id}: the close race lens`);
  } else {
    assert.ok(len(h) > 10 && len(f) < 0.5, `${id}: the hero drives (${len(h).toFixed(1)} m), its foe holds the street`);
    assert.ok(gap(ko.killMs) < gap(0) - 10, `${id}: the hero closes on its foe (${gap(0).toFixed(1)} to ${gap(ko.killMs).toFixed(1)} m)`);
  }
  // quiet: no dust burst, every explosion small, the guns, tracers, hits, knockout and fire kept; built loud, the same
  // take has its dust and a bigger blast
  assert.equal(scene.meta.quiet, true, `${id}: quiet`);
  assert.ok(!scene.effects.some((e) => e.type === 'dust'), `${id}: no dust burst`);
  const blasts = scene.effects.filter((e) => e.type === 'explosion');
  assert.ok(blasts.length && blasts.every((e) => e.params?.size === 'small'), `${id}: every explosion small`);
  const loud = siteScene(combatTake(row, { quiet: false }));
  assert.ok(!loud.meta.quiet && loud.effects.some((e) => e.type === 'dust'), `${id}: built loud, its dust is back`);
  assert.ok(loud.effects.some((e) => e.type === 'explosion' && e.params?.size !== 'small'), `${id}: built loud, a bigger blast`);
  assert.equal(kept(scene), kept(loud), `${id}: quiet drops only the dust`);
  dropped += loud.effects.filter((e) => e.type === 'dust').length;
}

// --- the CLI writes their scenes (node tools/media-r5/site50.mjs <out> <ids>) -----------------------------------------
const dir = mkdtempSync(join(tmpdir(), 'site50-duels-'));
try {
  const ids = DUELS.map((s) => `s${s[0]}-${s[1]}`);
  execFileSync(process.execPath, [fileURLToPath(new URL('./site50.mjs', import.meta.url)), join(dir, 'scenes'), ids.join(',')], { stdio: 'pipe' });
  const manifest = JSON.parse(readFileSync(join(dir, 'site50-manifest.json'), 'utf8'));
  assert.deepEqual(manifest.map((m) => m.id), ids, 'the CLI writes the twelve duels when named');
  for (const id of ids) assert.equal(JSON.parse(readFileSync(join(dir, 'scenes', `${id}.json`), 'utf8')).meta.id, id, `${id}: written`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`duels selftest: ${DUELS.length} takes (${RACES.length} races abreast, 1 street fight), both guns firing, one knockout each, quiet (${dropped} dust bursts dropped, every blast small), written by the CLI`);
