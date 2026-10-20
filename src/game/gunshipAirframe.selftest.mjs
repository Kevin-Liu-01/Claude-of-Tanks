// gunshipAirframe.selftest.mjs — the AC-130's airframe and its loading path (lane ac130-fx-228 r2, 2026-10-19; the owner:
// "fix ... how we load stuff in for ac 130"; the critics: "the AC-130 reveal still stalls", "a placeholder-grade airframe at
// the centre of every ending orbit", "the airframe compiles at the ending", "the player's own airframe in their lens").
//   - the airframe (gunshipAirframe.ts) at the C-130's proportions, its guns on the port side, one lit material on the
//     cascades, outward faces, and released whole;
//   - it is its own chunk: the boot closure never reaches it; the flight anchor syncs nothing until it has loaded and
//     asks for it; the covered entry loads it, builds it and shows it for the covered scene compile, then hides it;
//   - the pilot's own airframe hides exactly while the gimbal lens is the camera (the rig's own-vehicle visibility: its
//     aerial branch hides it each lens frame, an external pose shows it), and the gimbal's sight and solution leave with it;
//   - the rest of the AC-130 warm path is registered under the cover: the mode's objective markers, the late pass's copy
//     program, the ground's pressure ring.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { staticImportClosure } from '../../tools/static-import-closure.mjs';
import { buildGunshipAirframe } from './gunshipAirframe.ts';
import { createGunshipBattleVisual, hideGunshipVisual, loadGunshipAirframe, stageGunshipVisual, syncGunshipVisual } from './gunshipVisual.ts';
import { createMatchModeWorldPresentation, stageMatchModeObjectives } from './matchModeWorldPresentation.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (path) => readFileSync(resolve(ROOT, path), 'utf8');

// ---- the airframe ----
{
  const setup = [], release = [];
  const built = buildGunshipAirframe({ setup: (m) => setup.push(m), release: (m) => release.push(m) });
  const box = new THREE.Box3().setFromObject(built.root);
  const size = box.getSize(new THREE.Vector3());
  assert.ok(size.x > 39.5 && size.x < 41.5, `the C-130's 40.4 m span (${size.x.toFixed(1)})`);
  assert.ok(size.z > 29 && size.z < 31.5, `its 29.8 m length (${size.z.toFixed(1)})`);
  assert.ok(size.y > 9 && size.y < 13, `its tall fin (${size.y.toFixed(1)} m high)`);
  const meshes = [];
  built.root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  assert.equal(meshes.length, 5, 'one merged body and four props');
  const materials = new Set(meshes.map((m) => m.material));
  assert.equal(materials.size, 1, 'one lit material');
  const [material] = materials;
  assert.ok(material.isMeshStandardMaterial && material.vertexColors, 'gunship grey in vertex colours, lit');
  assert.deepEqual(setup, [material], 'its material joins the cascade setup');
  const body = meshes.find((m) => m.name === 'ac130-airframe-body');
  const tris = body.geometry.getAttribute('position').count / 3;
  assert.ok(tris > 1500 && tris < 6000, `a real model, still cheap (${tris} triangles)`);
  // outward faces: every triangle's winding agrees with its stored normal (no inside-out panel to the culling)
  const p = body.geometry.getAttribute('position'), n = body.geometry.getAttribute('normal');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nn = new THREE.Vector3();
  let against = 0, faces = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const face = b.sub(a).cross(c.sub(a));
    if (face.lengthSq() < 1e-8) continue;
    faces++;
    nn.fromBufferAttribute(n, i).add(new THREE.Vector3().fromBufferAttribute(n, i + 1)).add(new THREE.Vector3().fromBufferAttribute(n, i + 2));
    if (face.dot(nn) < 0) against++;
  }
  assert.ok(against / faces < 0.01, `faces wound outward (${against} of ${faces} against their normals)`);
  // the guns on the port side (+x, toward the pylon turn's centre): the body reaches further out on +x below the wing
  let port = 0, starboard = 0;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), z = p.getZ(i);
    if (y > 0.5 || Math.abs(z) > 8) continue;
    port = Math.max(port, p.getX(i)); starboard = Math.max(starboard, -p.getX(i));
  }
  assert.ok(port > starboard + 1.5, `the 105 mm and 30 mm barrels out of the port side (${port.toFixed(1)} vs ${starboard.toFixed(1)} m)`);
  const props = meshes.filter((m) => m.name === 'ac130-prop');
  const before = props.map((m) => m.rotation.z);
  built.spin(0.1);
  assert.ok(props.every((m, i) => m.rotation.z > before[i]), 'the props turn');
  built.dispose();
  assert.deepEqual(release, [material], 'and leave the cascades with it');
}

// ---- its own chunk; the anchor waits for it; the covered entry stages it ----
{
  const closure = staticImportClosure('src/main.ts', { root: ROOT });
  assert.equal(closure.has('src/game/gunshipAirframe.ts'), false, 'the airframe never loads with the boot');
  assert.match(src('src/game/gunshipVisual.ts'), /import\('\.\/gunshipAirframe\.ts'\)/, 'the anchor loads it on demand');
  const scene = new THREE.Scene();
  const anchor = createGunshipBattleVisual('t90am');
  scene.add(anchor.root);
  // before the chunk is in, a sync draws nothing (and asks for it)
  const pending = loadGunshipAirframe();
  syncGunshipVisual(anchor.root, new THREE.Vector3(0, 240, 90), 0, 0.016, true);
  let drawables = 0;
  anchor.root.traverse((o) => { if (o.isMesh || o.isSprite || o.isLine || o.isPoints) drawables++; });
  assert.equal(drawables, 0, 'the anchor itself draws nothing (an empty group: its visibility is only the rig\'s word)');
  await pending;
  const staged = stageGunshipVisual(anchor.root, new THREE.Vector3(0, 240, 90), 1.2);
  assert.ok(staged && staged.parent === scene && staged.visible, 'the covered entry shows the airframe for its compile');
  assert.ok(staged.rotation.z < -0.15, 'banked port wing down into the pylon turn');
  hideGunshipVisual(anchor.root);
  assert.equal(staged.visible, false);
  anchor.dispose();
  assert.ok(staged.parent === null, 'released with its anchor');
  const deploy = src('src/game/soloBattleDeploymentRuntime.ts');
  const stageAt = deploy.indexOf('await stageGunshipAirframes(game.tanks)');
  const earlyAt = deploy.indexOf("mark('earlyPrograms')");
  const forwardAt = deploy.indexOf("mark('forwardPrograms');");
  const hideAt = deploy.indexOf('optionalWarmCompleted = true;\n        // (ac130-fx-228 r2) the staged airframes hide again');
  assert.ok(stageAt > 0 && earlyAt > stageAt && forwardAt > earlyAt && hideAt > forwardAt
    && deploy.indexOf('for (const airframe of airframes) airframe.visible = false;', hideAt) > hideAt,
    'the covered deployment stages the airframes before its scene compile and hides them after its forward and post warms');
}

// ---- the lens: the pilot's own airframe and the gimbal's sight key off the rig's own-vehicle visibility ----
{
  // the anchor's visibility is passed straight on and never overwritten: hidden in the lens frame, the airframe hides;
  // shown by an external pose (the killcam, the ending's replay and orbit), it draws, and keeps drawing on the frames
  // after (the rig sets it once for the pose)
  const scene = new THREE.Scene();
  const anchor = createGunshipBattleVisual('t90am');
  scene.add(anchor.root);
  const pos = new THREE.Vector3(0, 240, 90);
  anchor.root.visible = false; // the rig's aerial branch, a lens frame
  syncGunshipVisual(anchor.root, pos, 0, 1 / 60, anchor.root.visible);
  const model = stageGunshipVisual(anchor.root, pos, 0);
  anchor.root.visible = false;
  syncGunshipVisual(anchor.root, pos, 0, 1 / 60, anchor.root.visible);
  assert.equal(model.visible, false, 'hidden in its own lens');
  anchor.root.visible = true; // setExternalPose: applyPlayerVisibility(player, true), once
  for (let frame = 0; frame < 3; frame++) syncGunshipVisual(anchor.root, pos, 0, 1 / 60, anchor.root.visible);
  assert.equal(anchor.root.visible, true, "the sync never overwrites the rig's visibility");
  assert.equal(model.visible, true, 'drawn for the external pose, on every frame after it');
  // (r3, the engineering critic: the ending's first beat leaves from the lens, inside the airframe) a camera inside the
  // hull never draws it, an external one clear of it does
  syncGunshipVisual(anchor.root, pos, 0, 1 / 60, true, new THREE.Vector3(0, 240.12, 90));
  assert.equal(model.visible, false, 'a camera at its origin (the lens, the ending leaving it) does not see it from inside');
  syncGunshipVisual(anchor.root, pos, 0, 1 / 60, true, new THREE.Vector3(18, 236, 90));
  assert.equal(model.visible, false, 'nor one within its wingspan');
  syncGunshipVisual(anchor.root, pos, 0, 1 / 60, true, new THREE.Vector3(60, 250, 40));
  assert.equal(model.visible, true, 'a camera clear of it sees it');
  assert.match(src('src/game/battlePresentationRuntime.ts'), /syncGunshipVisual\(visual\.root, state\.pos, state\.yaw, dtFrame \?\? 0, visual\.root\.visible, camera\.position\)/,
    'the battle passes its camera');
  anchor.dispose();
  const rig = src('src/engine/cameraRig.ts');
  assert.match(rig, /if \(aerialCamera\.update\(player, camInput, dt\)\) \{[\s\S]{0,400}applyPlayerVisibility\(player, player\.aerial\?\.kind !== 'gunship'\);/,
    "the rig hides the gunship pilot's own vehicle on every lens frame");
  assert.match(rig.slice(rig.indexOf('setExternalPose(pos: THREE.Vector3')), /^[\s\S]{0,600}applyPlayerVisibility\(getPlayer\(\), true\);/,
    'an external pose (the ending, a replay) shows it');
  assert.match(src('src/game/battlePresentationRuntime.ts'),
    /if \(entity\.aerial\?\.kind === 'gunship'\) syncGunshipVisual\(visual\.root, state\.pos, state\.yaw, dtFrame \?\? 0, visual\.root\.visible, camera\.position\);/,
    "the presentation passes the rig's visibility straight on (the lens is the rig's call), with its camera for the hull test only");
  assert.doesNotMatch(src('src/game/gunshipVisual.ts'), /tankRoot\.visible = false/, "the sync never hides the anchor itself");
  assert.match(src('src/ui/hud.ts'), /flier\?\.aerial\?\.kind !== 'gunship' \|\| flier\.visual\?\.root\?\.visible === false/,
    "the gimbal's sight shows only through the lens");
  assert.match(src('src/ui/aerialHud.ts'), /solution\.hidden=drone\|\|!lensUp;sight\.hidden=!drone&&!lensUp;/);
}

// ---- the rest of the AC-130 warm path, under the cover ----
{
  // the mode's objective markers are built under the cover, by the lazy deployment (the game's entry is untouched): a
  // presentation drawn in the battle's scene is staged, one in another scene is not, a disposed one is gone
  const battle = new THREE.Scene(), other = new THREE.Scene();
  const host = new THREE.Group(); battle.add(host);
  const view = createMatchModeWorldPresentation(host), elsewhere = createMatchModeWorldPresentation(other);
  const state = { label: 'Escort', perspectiveTeam: 'alpha', respawns: true, target: null, score: { alpha: 0, bravo: 0 },
    flags: [], ball: null, goals: [], horde: null, pickups: [], playerAmmo: null, playerAmmoCapacity: null,
    id: 'zone_control', zones: [{ id: 'a', x: -40, y: 1, z: 7, control: 0.5, owner: 'alpha', contested: false }] };
  assert.ok(view.root.getObjectByName('capture-zone-1') === undefined, 'nothing built before a state');
  assert.equal(stageMatchModeObjectives(battle, state, 0), 1, "only the battle scene's presentation is staged");
  assert.ok(view.root.getObjectByName('capture-zone-1'), 'its markers are built for the covered compile');
  assert.ok(elsewhere.root.getObjectByName('capture-zone-1') === undefined);
  assert.equal(stageMatchModeObjectives(battle, null, 0), 0, 'no state, nothing staged');
  view.dispose(); elsewhere.dispose();
  assert.equal(stageMatchModeObjectives(battle, state, 0), 0, 'a disposed presentation leaves the live set');
  const deploy = src('src/game/soloBattleDeploymentRuntime.ts');
  assert.match(deploy, /const \{ stageMatchModeObjectives \} = await import\('\.\/matchModeWorldPresentation\.ts'\);[\s\S]{0,200}stageMatchModeObjectives\(options\.scene,[\s\S]{0,600}compileSceneSteps\(\{ sliceMs: 8, timing: earlySubmission \}\)/,
    "the solo deployment stages them before its early scene compile");
  assert.doesNotMatch(src('src/main.ts'), /ac130-fx-228/, 'the game entry carries none of it');
  const warm = src('src/game/battleWarmRuntime.ts');
  assert.match(warm, /post\.prepareSoftParticles\(\);\n    warmLateFxCopy\(post\);/, "the late pass's copy program links with the covered FX");
  const fx = src('src/fx/effects.ts');
  const opening = fx.slice(fx.indexOf('    warmOpeningEffects('), fx.indexOf('    warmProjectilePresentation('));
  assert.match(opening, /spawnShockRing\(pos\.x, pos\.z, 0\);/, "the ground's pressure ring is warmed whatever the pilot's height");
  // (r3, first-use-who probe) the warmed ring is spawned under the orbit, outside the gimbal's view: it must not be culled,
  // or its covered draw never reaches the late pass and the first on-screen ring links that program mid-battle
  const rings = fx.slice(fx.indexOf('const shockRings'), fx.indexOf('let muzzleRingCursor'));
  assert.equal((rings.match(/m\.frustumCulled = false;/g) || []).length, 2, 'the pressure rings and muzzle rings are never culled');
  assert.match(opening, /spawnScorch\(pos\.x, pos\.z, 2\.4\);/, "and the burst's scorch decal");
  assert.match(fx.slice(fx.indexOf('    resetAll(')), /for \(const m of scorchMeshes\) m\.visible = false;/, 'which resetAll clears');
}

console.log('gunshipAirframe: the AC-130 at its proportions (port guns, one lit material, outward faces), its own chunk staged under the cover, hidden only in its own lens, and the warm path (markers, late copy, pressure ring) registered');
