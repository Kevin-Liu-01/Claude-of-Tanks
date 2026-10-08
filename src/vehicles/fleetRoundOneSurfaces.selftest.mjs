import assert from 'node:assert/strict';
import * as THREE from 'three';
import { boreCylinderUV, cylZ, boxUV, mergeAll } from './factoryGeometry.ts';
import { CAMO_UV_REPEATS_PER_M } from './camoWorldScale.ts';

// Fleet lane round 1 (2026-10-08): the surface fixes from the fleet audit, measured on built vehicles.
//  - the gun tube wears its camouflage round the bore (factoryGeometry.ts boreCylinderUV), not as four box swatches
//    that band and jump along the barrel;
//  - wheel insets (lightening holes, hub wells) take the rubber with a cavity's light (materials.ts COT_GEAR_CAVITY),
//    so a hole reads as a hole under the Garage key;
//  - a broad box sight pane is cut into an armoured frame and a window (tankFactoryCore.ts armouredGlassSurround): four
//    painted bars take the outer ring of the pane's own box, flush with its faces, so nothing stands proud or overhangs
//    (the watertight census and every envelope see exactly the authored box);
//  - the shared plate tile carries seams, welds and bolt lines but no random bolt circles (materialPainter.ts).

// --- boreCylinderUV on a plain tube: u is arc length round the bore at the vertex radius, v the bore axis, one
// projection with no 45-degree swatch changes; end caps keep the box projection
{
  const tube = mergeAll([cylZ(0.06, 2.0, 24)]);
  boxUV(tube, CAMO_UV_REPEATS_PER_M);
  const before = tube.getAttribute('uv').array.slice();
  const wrapped = boreCylinderUV(tube, CAMO_UV_REPEATS_PER_M);
  const pos = tube.getAttribute('position'), nor = tube.getAttribute('normal'), uv = tube.getAttribute('uv');
  let side = 0, caps = 0;
  for (let t = 0; t < pos.count; t += 3) {
    const radial = [0, 1, 2].every((k) => Math.abs(nor.getZ(t + k)) < 0.5);
    if (radial) {
      side++;
      for (let k = 0; k < 3; k++) {
        const i = t + k, r = Math.hypot(pos.getX(i), pos.getY(i));
        assert.ok(Math.abs(uv.getY(i) - pos.getZ(i) * CAMO_UV_REPEATS_PER_M) < 1e-6, 'v runs along the bore');
        // u / (r * density) is the angle from the top, unwrapped by at most one turn across the seam underneath
        const angle = uv.getX(i) / (r * CAMO_UV_REPEATS_PER_M), turn = Math.PI * 2;
        const expected = Math.atan2(pos.getX(i), pos.getY(i));
        const off = ((angle - expected) % turn + turn) % turn;
        assert.ok(Math.min(off, turn - off) < 1e-4, 'u is arc length round the bore');
      }
      // one triangle never spans the seam underneath
      const us = [0, 1, 2].map((k) => uv.getX(t + k));
      assert.ok(Math.max(...us) - Math.min(...us) < 0.06 * Math.PI * CAMO_UV_REPEATS_PER_M, 'no triangle wraps the seam');
    } else {
      caps++;
      for (let k = 0; k < 3; k++) {
        const i = (t + k) * 2;
        assert.equal(uv.array[i], before[i], 'end caps keep the box projection');
      }
    }
  }
  assert.equal(wrapped, side, 'every radial triangle of the tube is wrapped');
  assert.ok(side > 0 && caps > 0, 'the tube has both walls and caps');
}

await import('../../tools/tank-surface-collect.mjs'); // node canvas shim: materials as shipped
const { createTank } = await import('./tankFactory.ts');
const build = (id) => createTank(id, null, { decor: true, quality: 'high', geometryQuality: 'high', camoSeed: 4242 });

// --- built hulls: the gun bucket's wrap share, the insets' cavity material, the framed sight panes
const tankLog = [];
for (const id of ['t90m_x', 'm1a2_sepv3_x', 'leo2a6_ua', 'challenger_3']) {
  const tank = build(id);
  tank.root.updateMatrixWorld(true);
  let gun = null, insets = 0, cavityInsets = 0;
  tank.root.traverse((o) => {
    if (!o.isMesh) return;
    if (!gun && /barrel/.test(o.material?.name || '') && /recoil/i.test(o.parent?.name || '')) gun = o;
    if (o.isInstancedMesh && o.name === 'gearRoadWheelInsets') {
      insets++;
      const m = o.material;
      if (m.defines?.COT_GEAR_CAVITY && m.userData?.appearanceRole === 'tireRubber' && m.envMapIntensity <= 0.2) cavityInsets++;
    }
  });
  assert.ok(gun, `${id}: a gun tube bucket`);
  const p = gun.geometry.getAttribute('position'), uv = gun.geometry.getAttribute('uv');
  // a triangle wears the bore projection when its UVs are the cylindrical (arc, axis) coordinates up to one offset (the
  // camouflage panels shift a sleeve section's window, never its projection)
  let tubeTris = 0, onBore = 0;
  const n = gun.geometry.getAttribute('normal'), s = CAMO_UV_REPEATS_PER_M;
  for (let t = 0; t < p.count; t += 3) {
    const rs = [0, 1, 2].map((k) => Math.hypot(p.getX(t + k), p.getY(t + k)));
    if (rs.some((r) => r < 0.004 || r > 0.32)) continue;
    if ([0, 1, 2].some((k) => (n.getX(t + k) * p.getX(t + k) + n.getY(t + k) * p.getY(t + k)) / rs[k] < 0.6)) continue;
    tubeTris++;
    const th = [0, 1, 2].map((k) => Math.atan2(p.getX(t + k), p.getY(t + k)));
    if (Math.max(...th) - Math.min(...th) > Math.PI) for (let k = 0; k < 3; k++) if (th[k] < 0) th[k] += Math.PI * 2;
    const du = [0, 1, 2].map((k) => uv.getX(t + k) - th[k] * rs[k] * s);
    const dv = [0, 1, 2].map((k) => uv.getY(t + k) - p.getZ(t + k) * s);
    if (Math.max(...du) - Math.min(...du) < 1e-4 && Math.max(...dv) - Math.min(...dv) < 1e-4) onBore++;
  }
  assert.ok(tubeTris > 0 && onBore === tubeTris, `${id}: every outward tube triangle wears the bore projection (${onBore}/${tubeTris})`);
  if (insets) assert.equal(cavityInsets, insets, `${id}: every wheel inset mesh takes the cavity rubber`);
  tankLog.push(`${id} gun ${onBore}/${tubeTris}, insets ${cavityInsets}/${insets}`);
  tank.dispose?.();
}

// --- the cavity rubber's hook: the light that reaches a hole's floor is cut after every readability lift
{
  const { vehicleAmbientFloorHook } = await import('./materials.ts');
  const shader = { uniforms: {}, fragmentShader: '#include <lights_fragment_end>\n#include <opaque_fragment>' };
  vehicleAmbientFloorHook(shader);
  const cavity = shader.fragmentShader.indexOf('#ifdef COT_GEAR_CAVITY');
  assert.ok(cavity > 0, 'the floor hook carries the cavity block');
  assert.ok(cavity > shader.fragmentShader.indexOf('vehHeight'), 'the cavity cut comes after the lifts and the ground occlusion');
  // round 2: a hole's floor keeps at most a quarter of the direct light and a fifth of the sky (near-black behind its rim)
  const shares = shader.fragmentShader.slice(cavity).match(/directDiffuse \*= ([0-9.]+);[\s\S]*?indirectDiffuse \*= ([0-9.]+);/);
  assert.ok(shares && Number(shares[1]) <= 0.25 && Number(shares[2]) <= 0.2, `direct and indirect shares (${shares?.slice(1)})`);
}

// --- framed sight glass: every broad box window on these hulls stands in a frame (bars round its edges, flush with it)
{
  const counts = [];
  const FRAME_OF = { turretGlass: 'turretDetail', hullGlass: 'hullDetail', gunMountGlass: 'gunMount' };
  for (const id of ['t90m_x', 'leclerc_classic_x']) {
    const panes = [], parts = { turretDetail: [], hullDetail: [], gunMount: [] };
    createTank(id, null, { proceduralOnly: true, decor: true, quality: 'high', geometryQuality: 'high', camoSeed: 4242,
      partCensus: (bucket, part) => {
        part.computeBoundingBox();
        const box = part.boundingBox.clone(), dims = box.getSize(new THREE.Vector3()).toArray();
        const size = [...dims].sort((x, y) => x - y);
        // the surround frames upright panes (sight windows, periscope faces); a roof skylight lies flat and is left bare
        const upright = dims.indexOf(size[0]) !== 1;
        // box panes only: round lenses (headlights, periscope heads) keep their own rims
        const boxPane = part.type === 'BoxGeometry';
        if (FRAME_OF[bucket] && boxPane && upright && size[0] <= 0.035 && size[1] >= 0.07 && size[2] >= 0.08) panes.push({ bucket, box });
        if (parts[bucket] && size[0] <= 0.05) parts[bucket].push(box);
      } });
    assert.ok(panes.length > 0, `${id}: broad sight panes exist`);
    let framed = 0;
    for (const pane of panes) {
      const near = pane.box.clone().expandByScalar(0.03);
      const lapping = parts[FRAME_OF[pane.bucket]].filter((b) => b.intersectsBox(near) && !b.containsBox(pane.box));
      if (lapping.length >= 4) framed++;
    }
    assert.equal(framed, panes.length, `${id}: ${framed} of ${panes.length} broad box panes stand in a frame`);
    counts.push(`${id} ${framed}/${panes.length} panes framed`);
  }
  tankLog.push(counts.join(', '));
}

// --- the plate tile: no random bolt circles, seams and welds kept
{
  const { createCanvas } = await import('@napi-rs/canvas');
  const { createMaterialPainter } = await import('./materialPainter.ts');
  const { resolveCamoVisual } = await import('./materials.ts');
  const { getSpec } = await import('./specs.ts');
  const painter = createMaterialPainter(createCanvas);
  for (const seed of [4242, 7, 911]) {
    const entry = { camoCanvas: createCanvas(1, 1), normalCanvas: createCanvas(1, 1), roughCanvas: createCanvas(1, 1), feats: null };
    const request = { identity: `ring-check-${seed}`, visual: resolveCamoVisual(getSpec('m1a2'), 'paint_m1a1'), seed,
      dimensions: { albedo: 128, map: 64 }, plateLines: true };
    for (const step of painter.bakeBaseSteps(entry, request)) void step;
    assert.equal(entry.feats.rings.length, 0, `seed ${seed}: no bolt circles in the tile`);
    assert.ok(entry.feats.hLines.length + entry.feats.vLines.length >= 4, `seed ${seed}: plate seams kept`);
    assert.ok(entry.feats.chips.length === 72 && entry.feats.streaks.length === 16, `seed ${seed}: weathering features kept`);
  }
}

console.log(`fleetRoundOneSurfaces: bore-wrapped gun tubes, cavity wheel insets, framed sight panes and a ring-free plate tile (${tankLog.join('; ')})`);
