// paneBacking.selftest (local-fps-266): the dark a pane stands in front of is set apart and drawn behind it. The rule
// (paneBackingTriangles) takes a dark face 0..5 cm behind a pane facing its way and overlapping it, nothing else; the
// regional sink sets an opening's backing apart when its unit lays a pane in it and leaves a bare opening's dark as it
// was; the backing's material is the dark's (its program key and kind) drawn PANE_BACKING_DEPTH_UNITS steps back; props.ts
// draws the set-apart dark through it. The GPU half (both draw orders at 300-700 m) is
// tools/pane-backing-layer.browser.selftest.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { PANE_BACKING_DEPTH_UNITS, PANE_BACKING_MAX_GAP_M, paneBackingMaterial, paneBackingTriangles } from './paneBacking.ts';
import { PartSink } from './maps/regional/geometry.ts';
import { holedPolygon } from './maps/regional/house.ts';
import { windowUnit } from './maps/regional/openings.ts';

/** A quad facing +z at depth z (two triangles, counter-clockwise from +z), or -z when `back`. */
function quad(x0, y0, x1, y1, z, back = false) {
  const tris = [[x0, y0, z, x1, y0, z, x1, y1, z], [x0, y0, z, x1, y1, z, x0, y1, z]];
  return (back ? tris.map((t) => [t[0], t[1], t[2], t[6], t[7], t[8], t[3], t[4], t[5]]) : tris).flat();
}

// the rule
{
  const pane = quad(-0.45, 1, 0.45, 2.3, -0.328);
  assert.deepEqual(paneBackingTriangles(quad(-0.45, 1, 0.45, 2.3, -0.344), [pane]), [true, true], 'the reveal\'s dark 1.6 cm behind its pane');
  assert.deepEqual(paneBackingTriangles(quad(-0.45, 1, 0.45, 2.3, -0.328 - PANE_BACKING_MAX_GAP_M + 0.002), [pane]), [true, true], 'up to 5 cm behind');
  assert.deepEqual(paneBackingTriangles(quad(-0.45, 1, 0.45, 2.3, -0.328 - PANE_BACKING_MAX_GAP_M - 0.01), [pane]), [false, false], 'farther back is not the pane\'s');
  assert.deepEqual(paneBackingTriangles(quad(-0.45, 1, 0.45, 2.3, -0.31), [pane]), [false, false], 'a dark face in front of the pane');
  assert.deepEqual(paneBackingTriangles(quad(-0.45, 1, 0.45, 2.3, -0.328), [pane]), [false, false], 'a face in the pane\'s own plane');
  assert.deepEqual(paneBackingTriangles(quad(1.5, 1, 2.4, 2.3, -0.344), [pane]), [false, false], 'beside the pane, not behind it');
  assert.deepEqual(paneBackingTriangles(quad(-0.45, 1, 0.45, 2.3, -0.344, true), [pane]), [false, false], 'facing the other way');
  assert.deepEqual(paneBackingTriangles(quad(-0.45, 1, 0.45, 2.3, -0.344), []), [false, false], 'no pane, no backing');
}

// the sink: three openings, a pane in two of them
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
  const backing = parts.dark.filter((g) => g.userData.paneBacking === true), plain = parts.dark.filter((g) => g.userData.paneBacking !== true);
  assert.equal(parts.curtain.length + parts.glass.length >= 2, true, 'a curtain and a glass pane');
  assert.equal(triangles(backing), 4, 'the two glazed openings\' dark is set apart');
  assert.equal(triangles(plain), 2, 'the bare opening keeps its dark where it was');
  assert.ok(backing.every((g) => g.userData.noCollision === true && g.userData.regional === true), 'the set-apart dark keeps its roles');
}

// the material and the merge
{
  let setup = 0;
  const dark = new THREE.MeshStandardMaterial({ color: 0x161a1d });
  dark.userData.propsKind = 'dark';
  dark.customProgramCacheKey = () => 'world-props-plain-v8';
  const material = paneBackingMaterial(dark, () => { setup++; });
  assert.equal(setup, 1, 'the backing takes the dark\'s shader set-up');
  assert.notEqual(material, dark);
  assert.equal(material.customProgramCacheKey(), dark.customProgramCacheKey(), 'one program with the dark');
  assert.equal(material.userData.propsKind, 'dark');
  assert.equal(material.color.getHex(), dark.color.getHex());
  assert.equal(material.polygonOffset, true);
  assert.equal(material.polygonOffsetFactor, 0, 'a depth-step offset, the same at every range and slope');
  assert.equal(material.polygonOffsetUnits, PANE_BACKING_DEPTH_UNITS);
  assert.ok(PANE_BACKING_DEPTH_UNITS > 0, 'behind');
  assert.equal(dark.polygonOffset, false, 'the dark itself is untouched');
  const props = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
  assert.match(props, /buckets\.paneBacking = buckets\.dark\.filter\(\(g\) => g\.userData\.paneBacking === true\)/, 'props.ts sets the backing apart');
  assert.match(props, /mats\.paneBacking = paneBackingMaterial\(mats\.dark,/, 'and draws it through the backing material');
}

console.log(`paneBacking.selftest: a dark face 0-${PANE_BACKING_MAX_GAP_M * 100} cm behind a pane facing its way is its backing (nothing in front, in its plane, beside, turned or farther); the sink sets the glazed openings' dark apart and leaves a bare opening's; the backing draws as the dark ${PANE_BACKING_DEPTH_UNITS} depth steps back PASS`);
