import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMBAT, FLEET, OWNER_NINE, SHOTS, siteScene } from './site50.mjs';
import { holdShot } from './setups.mjs';
import { combatVerdict, knockouts } from './combat-check.mjs';
import { worldModel } from './world-model.mjs';
import { absoluteShots } from './lens-check.mjs';
import { sampleActorTrack, sampleCameraRail } from '../../src/game/studioTimeline.ts';
import { SHOTS as SHOTS_DIR } from './paths.mjs';

// The combat round (owner 2026-10-13: "more shots of 1v1 tank battles or 2v2 or 1v2s ... 1. show more tanks and 2. show
// the actual tank combat ... with effects all over the place"): takes 225 to 233, three of each format, every gun
// trading rounds, every hit on a hull's armour, every lens holding its fight.

// --- the group lens (setups.mjs holdShot) ---------------------------------------------------------------------------
const deg = (r) => r * 180 / Math.PI, bearing = (eye, p) => deg(Math.atan2(p[0] - eye[0], p[1] - eye[1]));
const at = (b, d) => [Math.sin(b * Math.PI / 180) * d, Math.cos(b * Math.PI / 180) * d];
{
  // two hulls 20° either side of north at 30 m: aimed due north, opened until each sits 0.6 of the half-width out
  const [lx, lz, fov, ll] = holdShot([0, 0], [at(-20, 30), at(20, 30)], {}, 1.3);
  assert.ok(Math.abs(bearing([0, 0], [lx, lz])) < 1e-9, 'aimed between the two');
  const want = 2 * deg(Math.atan(Math.tan(20 * Math.PI / 180) / 0.6 / (16 / 9)));
  assert.ok(Math.abs(fov - want) < 1e-9, `the lens opened to hold both (${fov.toFixed(2)} vs ${want.toFixed(2)})`);
  assert.ok(Math.abs(ll - 1.3) < 1e-6, 'a lens at the hulls\' height looks level');
  // a bias leans the aim toward the last hull named; the lens never closes past its tightest nor opens past its widest
  const [bx, bz] = holdShot([0, 0], [at(-20, 30), at(20, 30)], { bias: 0.5 });
  assert.ok(bearing([0, 0], [bx, bz]) > 9.9, 'the bias leans toward the last hull');
  assert.equal(holdShot([0, 0], [at(-1, 30), at(1, 30)], { fov: 32 })[2], 32, 'two hulls in line keep the tightest lens');
  assert.equal(holdShot([0, 0], [at(-80, 30), at(80, 30)], { fovMax: 56 })[2], 56, 'hulls too far apart take the widest lens');
  // high over the fight, the lens pitches down between the near hull and the far one (the look point sits on that ray
  // at the hulls' mean distance, so it may fall below the ground: only its direction counts)
  const [dx, dz, , down] = holdShot([0, 0], [at(0, 10), at(0, 40)], {}, 12);
  const pitch = deg(Math.atan2(down - 12, Math.hypot(dx, dz))), near = deg(Math.atan2(1.3 - 12, 10)), far = deg(Math.atan2(1.3 - 12, 40));
  assert.ok(pitch > near && pitch < far, `a crane looks down between the hulls (${pitch.toFixed(1)}° between ${near.toFixed(1)}° and ${far.toFixed(1)}°)`);
}

// --- the takes ------------------------------------------------------------------------------------------------------
assert.deepEqual(COMBAT.map((s) => s[0]), [225, 226, 227, 228, 229, 230, 231, 232, 233], 'takes 225 to 233 in order');
const all = [...SHOTS, ...OWNER_NINE, ...FLEET, ...COMBAT];
assert.equal(new Set(all.map((s) => s[1])).size, all.length, 'unique ids across every take');
const formats = COMBAT.map((s) => s[5].combat);
for (const f of ['1v1', '1v2', '2v2']) assert.equal(formats.filter((x) => x === f).length, 3, `three ${f} takes`);
const worlds = new Map();
const worldOf = (map) => {
  if (!worlds.has(map)) {
    const f = join(SHOTS_DIR, 'features', `features-${map}.json`);
    const features = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
    worlds.set(map, { features, model: features ? worldModel(features) : null });
  }
  return worlds.get(map);
};
let checked = 0;
for (const shot of COMBAT) {
  const scene = siteScene(shot), id = scene.meta.id, format = shot[5].combat;
  assert.equal(scene.actors.length, { '1v1': 2, '1v2': 3, '2v2': 4 }[format], `${id}: the ${format} cast`);
  assert.equal(scene.autoPlace, false, `${id}: placed as built (the hits are seated on the hulls where the table puts them)`);
  assert.equal(scene.still?.tMs, 4560, `${id}: the still is the knockout`);
  // every hit seated: no armour marker, deflection or seed left for the Studio to puzzle over
  for (const e of scene.effects) {
    assert.ok(!e.at?.armor && !e.deflect && !e.params?.seedToward, `${id}: ${e.type} at ${e.tMs} seated`);
    if (e.type === 'impact' && Array.isArray(e.at) && e.at.length === 3) assert.ok(Array.isArray(e.params.normal), `${id}: the impact at ${e.tMs} sprays off its plate`);
  }
  // the rounds go both ways, and every knockout has its shooter
  const shooters = new Set(scene.effects.filter((e) => e.type === 'fire').map((e) => e.actor));
  assert.ok(shooters.has('hero') && shooters.has('foe0'), `${id}: both sides fire`);
  const kos = knockouts(scene);
  assert.equal(kos.length, format === '2v2' ? 2 : 1, `${id}: its knockouts`);
  for (const k of kos) assert.ok(k.killer && k.killer !== k.victim && k.killMs - k.shotMs <= 250, `${id}: ${k.victim} knocked out by ${k.killer}'s round`);
  if (scene.meta.time === 'night') assert.ok(scene.effects.some((e) => e.type === 'flare'), `${id}: a night fight lit by a flare`);
  // the frame check on the battlefield as dumped (shots/media-r5/features; a worktree without the dumps skips it)
  const { model, features } = worldOf(scene.map);
  if (!model) continue;
  const verdict = combatVerdict(scene, model, features);
  assert.ok(verdict.ok, `${id}: ${verdict.faults.join('; ')}`);
  checked++;
}
// A single birch between the lens and the hero fails the take (coordinator 2026-10-13: the FX lane's lens check read
// merged forest bounds and could not tell a tree in front of the lens from a stand; this one reads the battlefield's
// per-tree records, trunk and crown): one birch planted on s226's sightline, 15 % of the way from the lens to the hero
// at the middle of the take, and the frame check must name it.
{
  const shot = COMBAT.find((s) => s[0] === 226), scene = siteScene(shot), { features } = worldOf(scene.map);
  if (features) {
    const model0 = worldModel(features), cam = {}, pose = {};
    sampleCameraRail(absoluteShots(scene, model0), 3300, cam);
    let [hx, hz] = scene.actors.find((a) => a.name === 'hero').pos;
    const keys = scene.storyboard.actorTracks.find((t) => t.actor === 'hero')?.keys;
    if (keys?.length && sampleActorTrack(keys, 3300, pose)) { hx = pose.x; hz = pose.z; }
    const bx = cam.x + (hx - cam.x) * 0.15, bz = cam.z + (hz - cam.z) * 0.15, gy = model0.heightAt(bx, bz);
    const birch = { k: 'tree', b: [bx - 0.25, gy, bz - 0.25, bx + 0.25, gy + 11, bz + 0.25], c: 0, s: ['c', bx, bz, 0.25], t: 1, cr: 2.6 };
    const withBirch = { ...features, obstacles: [...features.obstacles, birch] };
    assert.ok(combatVerdict(scene, model0, features).ok, 's226 passes on its own battlefield');
    const verdict = combatVerdict(scene, worldModel(withBirch), withBirch);
    assert.ok(!verdict.ok && verdict.faults.some((f) => /hero blocked|in sight/.test(f)), `a single birch on the sightline fails s226 (${verdict.faults.join('; ') || 'no fault'})`);
  }
}
// and its crown alone: a birch whose trunk stands 1.8 m off s232's crane sightline (the lens 9-13 m up) where the line
// runs through the crown's height, 6 % of the way out
{
  const shot = COMBAT.find((s) => s[0] === 232), scene = siteScene(shot), { features } = worldOf(scene.map);
  if (features) {
    const model0 = worldModel(features), cam = {}, pose = {};
    sampleCameraRail(absoluteShots(scene, model0), 3300, cam);
    let [hx, hz] = scene.actors.find((a) => a.name === 'hero').pos;
    const keys = scene.storyboard.actorTracks.find((t) => t.actor === 'hero')?.keys;
    if (keys?.length && sampleActorTrack(keys, 3300, pose)) { hx = pose.x; hz = pose.z; }
    const dx = hx - cam.x, dz = hz - cam.z, dl = Math.hypot(dx, dz), px = -dz / dl, pz = dx / dl;
    const lx = cam.x + dx * 0.06, lz = cam.z + dz * 0.06, gy = model0.heightAt(lx, lz), lineY = cam.y + (model0.heightAt(hx, hz) + 1.4 - cam.y) * 0.06;
    const bx = lx + px * 1.8, bz = lz + pz * 1.8, top = lineY - gy + 1; // the crown spans the line's height (top - 0.3 cr .. top + 1.7 cr)
    const birch = { k: 'tree', b: [bx - 0.25, gy, bz - 0.25, bx + 0.25, gy + top, bz + 0.25], c: 0, s: ['c', bx, bz, 0.25], t: 1, cr: 2.6 };
    const withBirch = { ...features, obstacles: [...features.obstacles, birch] };
    assert.ok(combatVerdict(scene, model0, features).ok, 's232 passes on its own battlefield');
    const verdict = combatVerdict(scene, worldModel(withBirch), withBirch);
    assert.ok(!verdict.ok && verdict.faults.some((f) => /hero blocked|in sight/.test(f)), `a birch's crown across the crane's sightline fails s232 (${verdict.faults.join('; ') || 'no fault'})`);
  }
}
console.log(`combat selftest: ${COMBAT.length} takes, ${checked} frame-checked on their battlefields, a lone birch caught by its trunk and by its crown`);
