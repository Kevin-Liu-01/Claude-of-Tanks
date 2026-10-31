// paneStack.selftest (local-fps-266): a regional window's farther faces are layered behind. The rule (stacked) takes a
// face 0..5 cm behind (or in front of) another facing its way and overlapping it, nothing else; paneStackLayers puts a
// pane behind its frame one layer back unless a wall stands behind it (it would lose to the wall), and the dark behind a
// pane one layer behind that pane; the regional sink sets each layer apart (userData.paneStackLayer) and leaves a bare
// opening's dark and an unframed pane where they were; installPaneStackDepth offsets its mesh's draws alone and gives the
// shared material back; props.ts draws each layer that way. The GPU half (every order at 20-700 m) is
// tools/pane-stack-layer.browser.selftest.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { PANE_STACK_MAX_GAP_M, PANE_STACK_UNITS_PER_LAYER, installPaneStackDepth, paneStackLayers, stacked } from './paneStack.ts';
import { PartSink } from './maps/regional/geometry.ts';
import { holedPolygon } from './maps/regional/house.ts';
import { windowUnit } from './maps/regional/openings.ts';
import { NIGHT_EMISSION_ATTRIBUTE } from '../engine/nightEmissionMaterial.ts';

/** A quad facing +z at depth z (two triangles, counter-clockwise from +z), or -z when `back`. */
function quad(x0, y0, x1, y1, z, back = false) {
  const tris = [[x0, y0, z, x1, y0, z, x1, y1, z], [x0, y0, z, x1, y1, z, x0, y1, z]];
  return (back ? tris.map((t) => [t[0], t[1], t[2], t[6], t[7], t[8], t[3], t[4], t[5]]) : tris).flat();
}

// the rule
{
  const pane = quad(-0.45, 1, 0.45, 2.3, -0.328);
  const behind = (z, ...args) => stacked(quad(-0.45, 1, 0.45, 2.3, z, ...args), [pane], 'behind');
  assert.deepEqual(behind(-0.344), [true, true], 'the reveal\'s dark 1.6 cm behind its pane');
  assert.deepEqual(behind(-0.328 - PANE_STACK_MAX_GAP_M + 0.002), [true, true], 'up to 5 cm behind');
  assert.deepEqual(behind(-0.328 - PANE_STACK_MAX_GAP_M - 0.01), [false, false], 'farther back is not in the stack');
  assert.deepEqual(behind(-0.31), [false, false], 'a face in front of the pane is not behind it');
  assert.deepEqual(behind(-0.328), [false, false], 'a face in the pane\'s own plane');
  assert.deepEqual(behind(-0.344, true), [false, false], 'facing the other way');
  assert.deepEqual(stacked(quad(1.5, 1, 2.4, 2.3, -0.344), [pane], 'behind'), [false, false], 'beside the pane, not behind it');
  assert.deepEqual(stacked(quad(0.45, 1, 1.2, 2.3, -0.344), [pane], 'behind'), [false, false], 'a face that only meets its edge');
  assert.deepEqual(stacked(quad(-0.45, 1, 0.45, 2.3, -0.31), [pane], 'front'), [true, true], 'in front of it, asked the other way');
  // a frame's rail: a small face across the pane, its centre far from the pane triangle's
  assert.deepEqual(stacked(pane, [quad(-0.39, 1, 0.39, 1.06, -0.31)], 'behind'), [true, false], 'a pane behind its bottom rail');
  assert.deepEqual(stacked(quad(-0.45, 1, 0.45, 2.3, -0.344), [], 'behind'), [false, false], 'nothing in front, no stack');
}

// the layers: a pane behind its frame is one back unless a wall stands behind it; the dark one behind its pane
{
  const pane = quad(-0.45, 1, 0.45, 2.3, -0.328), frame = quad(-0.45, 2.24, 0.45, 2.3, -0.31), dark = quad(-0.45, 1, 0.45, 2.3, -0.344);
  assert.deepEqual(paneStackLayers([pane], [dark], [frame]), { panes: [[1, 1]], darks: [[2, 2]] }, 'framed pane over its dark: 1 and 2');
  assert.deepEqual(paneStackLayers([pane], [dark], []), { panes: [[0, 0]], darks: [[1, 1]] }, 'an unframed pane stays, its dark one back');
  const wall = quad(-1, 0.5, 1, 2.8, -0.346);
  assert.deepEqual(paneStackLayers([pane], [], [frame, wall]).panes, [[0, 0]], 'a pane with a wall 1.8 cm behind it is not drawn back');
  assert.deepEqual(paneStackLayers([pane], [quad(2, 1, 3, 2, -0.344)], [frame]).darks, [[0, 0]], 'a bare opening\'s dark stays');
}

// the sink: three openings, a framed pane in two of them
{
  const face = { origin: [0, 0, 0], u: [1, 0, 0], out: [0, 0, 1], width: 6 };
  const holes = [-2, 0, 2].map((u) => ({ u0: u - 0.45, u1: u + 0.45, y0: 1, y1: 2.3 }));
  const style = { frame: [0.9, 0.9, 0.88], frameWidth: 0.06, frameOut: 0.03, bars: 'cross', surround: null, sill: null, shutters: null };
  const sink = new PartSink();
  holedPolygon(sink, 'plaster', face, [[-3, 0], [3, 0], [3, 3.2], [-3, 3.2]], holes, 0.4, 0.34);
  sink.recess = 0.34;
  windowUnit(sink, face, -2, 1, 0.9, 1.3, style, () => 0, 1);
  windowUnit(sink, face, 0, 1, 0.9, 1.3, style, () => 0.99, 0);
  sink.recess = 0;
  const parts = sink.finish();
  const triangles = (list) => list.reduce((n, g) => n + g.getAttribute('position').count / 3, 0);
  const layerOf = (list, layer) => list.filter((g) => (g.userData.paneStackLayer ?? 0) === layer);
  assert.equal(triangles(layerOf(parts.dark, 2)), 4, 'the two glazed openings\' dark two layers back');
  assert.equal(triangles(layerOf(parts.dark, 0)), 2, 'the bare opening keeps its dark where it was');
  assert.equal(triangles(layerOf([...parts.curtain, ...parts.glass], 1)), triangles([...parts.curtain, ...parts.glass]), 'both panes one layer back');
  assert.ok(parts.structureWood.every((g) => !g.userData.paneStackLayer), 'the frames draw where they are');
  assert.ok(layerOf(parts.dark, 2).every((g) => g.userData.noCollision === true && g.userData.regional === true), 'a layer keeps its roles');
  assert.ok(layerOf(parts.curtain, 1).every((g) => g.getAttribute(NIGHT_EMISSION_ATTRIBUTE)?.count === g.getAttribute('position').count), 'the curtain keeps its glow mask');
}

// the draw: the mesh's own draws take the offset, the shared material comes back after, other draws untouched
{
  const material = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material), other = new THREE.Mesh(new THREE.BufferGeometry(), material);
  let seen = null;
  mesh.onBeforeRender = () => { seen = 'before'; };
  installPaneStackDepth(mesh, material, 2);
  mesh.onBeforeRender(null, null, null, null, material, null);
  assert.equal(seen, 'before', 'an earlier hook still runs');
  assert.deepEqual([material.polygonOffset, material.polygonOffsetFactor, material.polygonOffsetUnits], [true, 0, 2 * PANE_STACK_UNITS_PER_LAYER]);
  mesh.onAfterRender(null, null, null, null, material, null);
  assert.deepEqual([material.polygonOffset, material.polygonOffsetFactor, material.polygonOffsetUnits], [false, 0, 0], 'the material given back');
  other.onBeforeRender(null, null, null, null, material, null);
  assert.equal(material.polygonOffset, false, 'the bucket\'s other mesh draws as it was');
  const depth = new THREE.MeshDepthMaterial();
  mesh.onBeforeRender(null, null, null, null, depth, null);
  assert.equal(material.polygonOffset, false, 'another material\'s draw (an override) is left alone');
  assert.equal(mesh.userData.paneStackLayer, 2);
  const props = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
  assert.match(props, /list\.filter\(\(g\) => \(g\.userData\.paneStackLayer \?\? 0\) === layer\)/, 'props.ts draws each layer apart');
  assert.match(props, /if \(layer\) installPaneStackDepth\(mesh, mats\[key\], layer\);/, 'through the bucket\'s own material, offset');
}

console.log(`paneStack.selftest: a face 0-${PANE_STACK_MAX_GAP_M * 100} cm behind another facing its way and over it is in its stack (not beside, turned, at its edge or farther); a framed pane one layer back unless walled, its dark one more; the sink sets the glazed openings' layers apart and leaves a bare opening's dark; a layer's draws alone take ${PANE_STACK_UNITS_PER_LAYER} depth steps a layer PASS`);
