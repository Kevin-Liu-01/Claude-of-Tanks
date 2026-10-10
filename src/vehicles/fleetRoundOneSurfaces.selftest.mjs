import assert from 'node:assert/strict';
import * as THREE from 'three';

// Fleet lane round 1 (2026-10-08): the surface fixes from the fleet audit, measured on built vehicles.
// (2026-10-09, fix/camo-defaults: the bore-wrapped gun camouflage, factoryGeometry.ts boreCylinderUV, left with the rest
// of PR #9's camouflage system. The owner on launch day: "why did you break camos? they only show generic camos now
// instead of the cool camos we had before", then "yeah our entire camo system before was better"; R113: "the default
// camos of our tanks to be what they were before". The gun tube keeps production's box projection.)
//  - wheel insets (lightening holes, hub wells) take the rubber with a cavity's light (materials.ts COT_GEAR_CAVITY),
//    so a hole reads as a hole under the Garage key;
//  - a broad box sight pane is cut into an armoured frame and a window (tankFactoryCore.ts armouredGlassSurround): four
//    painted bars take the outer ring of the pane's own box, flush with its faces, so nothing stands proud or overhangs
//    (the watertight census and every envelope see exactly the authored box);
//  - the shared plate tile carries seams, welds and bolt lines but no random bolt circles (materialPainter.ts).

await import('../../tools/tank-surface-collect.mjs'); // node canvas shim: materials as shipped
const { createTank } = await import('./tankFactory.ts');
const build = (id) => createTank(id, null, { decor: true, quality: 'high', geometryQuality: 'high', camoSeed: 4242 });

// --- built hulls: the insets' cavity material, the framed sight panes
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
  if (insets) assert.equal(cavityInsets, insets, `${id}: every wheel inset mesh takes the cavity rubber`);
  tankLog.push(`${id} insets ${cavityInsets}/${insets}`);
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

console.log(`fleetRoundOneSurfaces: cavity wheel insets, framed sight panes and a ring-free plate tile (${tankLog.join('; ')})`);
