import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMBAT, COMBAT_TABLE, FLEET, OWNER_NINE, SHOTS, combatTake, siteScene } from './site50.mjs';
import { holdShot } from './setups.mjs';
import { combatVerdict, knockouts } from './combat-check.mjs';
import { worldModel } from './world-model.mjs';
import { powerLinesOf, powerWires, telephoneWires } from './wire-model.mjs';
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
    // (the battlefields a tree's own review dumped, MEDIA_R5_FEATURES, as combat-check reads them)
    const f = join(process.env.MEDIA_R5_FEATURES ?? join(SHOTS_DIR, 'features'), `features-${map}.json`);
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
// --- the overhead wires (wire-model.mjs; the coordinator on the 224 review, 2026-10-14: wires are occluders) ---------
{
  // the telephone line: consecutive poles 6-52 m apart strung with two conductors 0.6 m either side, 6.5 m up, hanging
  // 0.45 m + 0.8 % of the span at its middle; a span past 52 m is left unstrung
  const pole = (x, z) => [x, 2, z, 0.45, 7.4, 'pole', 0];
  const wires = telephoneWires({ crushables: [pole(0, 0), pole(30, 0), pole(90, 0), [95, 2, 3, 0.3, 0.9, 'barrel', 0]] });
  assert.equal(wires.length, 2, 'one span strung (30 m), the 60 m gap left bare: two conductors');
  const [w] = wires, mid = w.pts[(w.pts.length - 1) / 2];
  assert.ok(Math.abs(w.pts[0][1] - 8.5) < 1e-9 && Math.abs(Math.abs(w.pts[0][2]) - 0.6) < 1e-9, 'a conductor leaves 6.5 m over the pole\'s foot, 0.6 m off the line');
  assert.ok(Math.abs(8.5 - mid[1] - (0.45 + 30 * 0.008)) < 1e-9, 'it hangs 0.69 m at the middle of a 30 m span');
  // the high-voltage lines: Verdant's 110 kV line as its map authors it, its towers raised until the lowest conductor
  // clears the ground by 12 m at the middle of the longest span
  const [line] = powerLinesOf('verdant');
  assert.deepEqual([line.towers.length, line.heightM], [4, 30], 'Verdant\'s 110 kV line: four towers, 30 m');
  const hv = powerWires('verdant', () => 0);
  assert.equal(hv.length, 3 * 5, 'three spans of four phases and the earth wire');
  const lowest = Math.min(...hv.flatMap((x) => x.pts.map((p) => p[1])));
  assert.ok(Math.abs(lowest - 12 + 0.15) < 0.05, `the lowest conductor clears flat ground by 12 m (${lowest.toFixed(2)} m)`);
  // with the scenery receipt's towers (a dump's pylons) the line runs between the standing ones at their built height:
  // the second tower refused, the 50 m line strung first to third, third to fourth
  const pylons = line.towers.map(([x, z], i) => [x, z, i === 1 ? 0 : 1, 50, 30, 'the 110 kV line']);
  const built = powerWires('verdant', () => 0, 18, pylons);
  assert.equal(built.length, 2 * 5, 'two spans past the refused tower');
  const lowArm = built.find((x) => x.kind === 'power line').pts[0][1];
  assert.ok(Math.abs(lowArm - (0.62 * 50 + 0.4 - 2.6 - 0.15)) < 1e-9, `the lower arms hang their strings at the built height (${lowArm.toFixed(2)} m)`);
}
// s226 as first staged, the lens climbing to 7 m through the telephone line by the church, fails on its own battlefield
{
  const row = COMBAT_TABLE.find((r) => r[0] === 226), scene = siteScene(combatTake(row, { camEnd: { lift: 7 } })), { model, features } = worldOf(scene.map);
  if (model) {
    const verdict = combatVerdict(scene, model, features);
    assert.ok(!verdict.ok && verdict.faults.some((f) => /telephone wire/.test(f)), `s226 climbing through the wires fails (${verdict.faults.join('; ') || 'no fault'})`);
  }
}
console.log(`combat selftest: ${COMBAT.length} takes, ${checked} frame-checked on their battlefields, a lone birch caught by its trunk and by its crown, the overhead wires strung and caught`);
