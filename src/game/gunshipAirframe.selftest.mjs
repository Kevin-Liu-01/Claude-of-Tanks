// gunshipAirframe.selftest.mjs — the AC-130's airframe and its loading path (lane ac130-fx-228 r2, 2026-10-19; the owner:
// "fix ... how we load stuff in for ac 130"; the critics: "the AC-130 reveal still stalls", "a placeholder-grade airframe at
// the centre of every ending orbit", "the airframe compiles at the ending", "the player's own airframe in their lens").
//   - the airframe (gunshipAirframe.ts) at the C-130's proportions, its guns on the port side, one lit material on the
//     cascades, outward faces, and released whole;
//   - it is its own chunk: the boot closure never reaches it; the flight anchor syncs nothing until it has loaded and
//     asks for it; the covered entry loads it, builds it and shows it for the covered scene compile, then hides it;
//   - the pilot's own airframe hides exactly while the gimbal lens is the camera (the aerial camera says so per frame;
//     an external pose clears it), and the gimbal's sight and solution leave with the lens;
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
import { createAerialCamera } from '../engine/aerialCamera.ts';

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
  assert.equal(anchor.root.visible, false, 'the anchor itself never draws');
  await pending;
  const staged = stageGunshipVisual(anchor.root, new THREE.Vector3(0, 240, 90), 1.2);
  assert.ok(staged && staged.parent === scene && staged.visible, 'the covered entry shows the airframe for its compile');
  assert.ok(staged.rotation.z < -0.15, 'banked port wing down into the pylon turn');
  hideGunshipVisual(anchor.root);
  assert.equal(staged.visible, false);
  anchor.dispose();
  assert.equal(staged.parent, null, 'released with its anchor');
  const deploy = src('src/game/soloBattleDeploymentRuntime.ts');
  const stageAt = deploy.indexOf('await stageGunshipAirframes(game.tanks)');
  const earlyAt = deploy.indexOf("mark('earlyPrograms')");
  const forwardAt = deploy.indexOf("mark('forwardPrograms');\n        for (const airframe of airframes) airframe.visible = false;");
  assert.ok(stageAt > 0 && earlyAt > stageAt && forwardAt > earlyAt,
    'the covered deployment stages the airframes before its scene compile and hides them after its forward warm');
}

// ---- the lens: the pilot's own airframe and the gimbal's sight key off the camera the aerial camera drives ----
{
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 4000);
  const aerial = createAerialCamera(camera);
  const pilot = { id: 'pilot', aerial: { kind: 'gunship', active: true, launching: false, x: 0, y: 240, z: 90, yaw: 0, pitch: -0.6,
    batteryS: 0, cooldownS: 0 }, input: { aimPoint: new THREE.Vector3() } };
  const frame = { mouseDX: 0, mouseDY: 0, wheel: 0 };
  assert.equal(aerial.update(pilot, frame, 1 / 60), true);
  assert.equal(camera.userData.gunshipLensId, 'pilot', "the gimbal lens is this pilot's");
  pilot.aerial.active = false;
  aerial.update(pilot, frame, 1 / 60);
  assert.equal(camera.userData.gunshipLensId, null, 'not once the flight view is off');
  const rig = src('src/engine/cameraRig.ts');
  assert.match(rig, /camera\.userData\.gunshipLensId = null;\n      if \(external\) return;/, 'each rig frame starts without the lens');
  assert.match(rig.slice(rig.indexOf('setExternalPose(')), /camera\.userData\.gunshipLensId = null;/, 'an external pose (the ending, a replay) is never the lens');
  assert.match(src('src/game/battlePresentationRuntime.ts'), /visual\.root\.visible && !\(entity\.isPlayer && camera\.userData\.gunshipLensId === entity\.id\)/,
    "the pilot's airframe hides exactly in its own lens (never by distance)");
  assert.match(src('src/ui/hud.ts'), /flier\?\.aerial\?\.kind !== 'gunship' \|\| state\.camera\?\.userData\.gunshipLensId === flier\.id/,
    "the gimbal's sight shows only through the lens");
  assert.match(src('src/ui/aerialHud.ts'), /solution\.hidden=drone\|\|!lensUp;sight\.hidden=!drone&&!lensUp;/);
}

// ---- the rest of the AC-130 warm path, under the cover ----
{
  assert.match(src('src/main.ts'), /prepareAtmosphere: async \(\) => \{[\s\S]{0,400}matchModeWorld\.update\(game\.matchModeState/,
    "the mode's objective markers are built under the cover (the escort's and the extraction's posts compiled at the reveal)");
  const warm = src('src/game/battleWarmRuntime.ts');
  assert.match(warm, /post\.prepareSoftParticles\(\);\n    warmLateFxCopy\(post\);/, "the late pass's copy program links with the covered FX");
  const fx = src('src/fx/effects.ts');
  const opening = fx.slice(fx.indexOf('    warmOpeningEffects('), fx.indexOf('    warmProjectilePresentation('));
  assert.match(opening, /spawnShockRing\(pos\.x, pos\.z, 0\);/, "the ground's pressure ring is warmed whatever the pilot's height");
}

console.log('gunshipAirframe: the AC-130 at its proportions (port guns, one lit material, outward faces), its own chunk staged under the cover, hidden only in its own lens, and the warm path (markers, late copy, pressure ring) registered');
