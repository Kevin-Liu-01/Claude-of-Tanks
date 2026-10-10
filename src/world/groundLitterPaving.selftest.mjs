import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { createHeightField, makeMaskTexture, makePavedGroundAt, mulberry32 } from './terrain.ts';
import { getMapConfig } from './maps/index.ts';
import { createGroundLitter, GROUND_LITTER, groundLitterProfile } from './groundLitter.ts';

// Roads lane R3 (2026-10-10; the gauntlet's wave 349a: "identical pebbles scattered on top" of Ruinspires' asphalt, "white
// pebble decals" on Ironworks' setts, "pale pebble decals" on Steinburg's): the ground litter skipped only 3.2 m of a road's
// centreline (GROUND_LITTER.roadCoreM), while the kerbed streets are paved out to the kerbs' face at 5.05 m and the paved
// towns pave their streets and squares. Pins: the litter laid as main laid it puts stones on the paving the terrain draws
// (the material's own paved share and cover, terrain.ts makePavedGroundAt); laid with that paving, none — and its margin
// keeps the verge's litter off the paving's edge; the rest of the litter stays; the world wires it. No GPU or art claim.

const positions = (mesh) => {
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), out = [];
  for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); p.setFromMatrixPosition(m); out.push([p.x, p.z]); }
  return out;
};
const settle = (litter, camera) => {
  for (let i = 0; i < 60 && (litter.getState().pending || i < 2); i++) litter.update(camera);
};

for (const id of ['ruinspires', 'urban', 'foundry']) {
  const cfg = getMapConfig(id), S = cfg.splat ?? {};
  const field = createHeightField(1337, cfg);
  // the mask as the terrain bakes it (terrain.ts createSplatMaterialSteps)
  const mask = makeMaskTexture(new SimplexNoise({ random: mulberry32(3010) }), field._layout, null, field._waterWetnessAt,
    S.shoreDirt ? (S.seaRamp?.[0] ?? 0.40) : null, field._sorWetnessAt ?? null, !!S.townPaving);
  const paved = makePavedGroundAt(mask, field._layout, S, id);
  assert.ok(paved, `${id}: the terrain paves something`);
  // the cameras: the town's middle and its streets, a node every few along each road inside the town rect
  const v = field._layout.village;
  const cams = [{ x: (v.x0 + v.x1) / 2, z: (v.z0 + v.z1) / 2 }];
  for (const road of field._layout.roads) {
    road.forEach(([x, z], k) => { if (k % 3 === 0 && x > v.x0 && x < v.x1 && z > v.z0 && z < v.z1 && cams.length < 9) cams.push({ x, z }); });
  }
  const lay = (options) => {
    const litter = createGroundLitter(field, { config: groundLitterProfile(id), ...options });
    let onPaving = 0, total = 0, inCore = 0;
    const seen = new Set();
    for (const cam of cams) {
      settle(litter, cam);
      for (const mesh of litter.meshes) {
        for (const [x, z] of positions(mesh)) {
          const key = `${x.toFixed(3)},${z.toFixed(3)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          total++;
          if (paved(x, z)) onPaving++;
          if (field._roadDist(x, z) < GROUND_LITTER.roadCoreM) inCore++;
        }
      }
    }
    litter.dispose();
    return { onPaving, total, inCore };
  };
  const before = lay({});
  const after = lay({ paved });
  assert.equal(before.inCore, 0, `${id}: no litter within the centreline's ${GROUND_LITTER.roadCoreM} m, before or after`);
  assert.ok(before.onPaving > 0, `${id}: main's litter lies on the paving (${before.onPaving} of ${before.total} pieces)`);
  assert.equal(after.onPaving, 0, `${id}: none on the paving or its edge now (of ${after.total} pieces)`);
  assert.ok(after.total >= before.total - before.onPaving, `${id}: every piece off the paving stays (${after.total} of ${before.total - before.onPaving})`);
  console.log(`groundLitterPaving: ${id} — ${before.onPaving} of ${before.total} pieces lay on the paving; now none (${after.total} pieces)`);
}

// a map that paves nothing keeps its litter as it was: no paving predicate at all
{
  const cfg = getMapConfig('steppe'), field = createHeightField(1337, cfg);
  const mask = makeMaskTexture(new SimplexNoise({ random: mulberry32(3010) }), field._layout, null, field._waterWetnessAt, null);
  assert.equal(makePavedGroundAt(mask, field._layout, cfg.splat ?? {}, 'steppe'), null, 'the steppe paves nothing');
}

// the world wires it: the terrain exposes its paving, the map hands it to the litter
const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const map = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
const litterSource = readFileSync(new URL('./groundLitter.ts', import.meta.url), 'utf8');
assert.ok(terrain.includes('mat.userData.pavedGroundAt = makePavedGroundAt(mask, layout, S, mapId);')
  && terrain.includes('group.userData.pavedGroundAt = mat.userData.pavedGroundAt;'), 'the terrain group exposes its paving');
assert.ok(map.includes('paved: (terrain.userData.pavedGroundAt as ((x: number, z: number) => boolean) | null | undefined) ?? null,'),
  'the world hands the litter the terrain\'s paving');
assert.ok(litterSource.includes('if (paved && paved(x, z)) continue;'), 'the litter skips it (after its seeded draws: the stream is unchanged)');

console.log('groundLitterPaving: Ruinspires, Steinburg and Ironworks — main\'s litter on the paving, none now, the rest kept; the steppe paves nothing; the wiring PASS; no GPU/art claim');
