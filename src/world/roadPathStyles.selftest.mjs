import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHeightField, makeMaskTexture, mulberry32, stackLandUseBake } from './terrain.ts';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { getMapConfig } from './maps/index.ts';

// Ground lane (2026-10-05; Ruinspires first, Shanghai's lilong lanes, Ronda's streets and the Lorraine villages after):
// a road path's own surface and carriageway width (terrain.roads.pathStyles[i] styles paths[i]). Pins: the layout
// carries each line's style; the ground mask's core follows a styled path's width and nothing else of the mask moves;
// the road layer holds the nearest path's class, half-width and heading at every texel near a styled road (zero near an
// unstyled one, absent without a styled net); the stack carries it under the mask and addresses it; the material decodes
// it with one exact fetch through the mask's own sampler. No GPU or art claim.

// (the plain net is Ruinspires' own lines without its authored styles: the map-revival lane set them, 2026-10-05; since
// the Miljacka valley, 2026-10-07, path 0 is the north avenue, 1 the south avenue, 2-6 the bridges' streets west to east
// and 7 the north bench street, and the probes stand where each line runs straight)
const authored = getMapConfig('ruinspires');
const base = { ...authored, terrain: { ...authored.terrain, roads: { ...authored.terrain.roads, pathStyles: undefined } } };
// (every street that meets the wide asphalt line carries a style of its own: a texel nearer an unstyled street inside
// the wide core would read as a core moved off a styled road; the south avenue and the south flank stay unstyled)
const SETTS = { surface: 'cobble', widthM: 6 };
// (16 m: the meandering avenue's wandering edge at 18 m feathered a texel past the class's 12 m ramp)
const STYLES = [{ surface: 'asphalt', widthM: 16 }, null, SETTS, { surface: 'dirt' }, { surface: 'patched', widthM: 6 },
  SETTS, SETTS, SETTS, null, SETTS, null, null, null, SETTS, null, SETTS, null];
const styledCfg = { ...base, terrain: { ...base.terrain, roads: { ...base.terrain.roads, pathStyles: STYLES } } };

function bake(cfg) {
  const field = createHeightField(1337, cfg);
  const texture = makeMaskTexture(new SimplexNoise({ random: mulberry32(3010) }), field._layout, null, field._waterWetnessAt, null);
  return { layout: field._layout, texture, px: texture.image.data, size: texture.image.width };
}
const plain = bake(base), styled = bake(styledCfg);
const at = (size, x, z) => (Math.floor((z + 512) * size / 1024) * size + Math.floor((x + 512) * size / 1024)) * 4;

// the layout: a style per line, aligned with the roads; none without pathStyles
assert.equal(plain.layout.roadStyles, undefined, 'no pathStyles: no styles on the layout');
assert.equal(styled.layout.roadStyles.length, styled.layout.roads.length, 'a style per road line');
for (let i = 0; i < styled.layout.roads.length; i++) assert.deepEqual(styled.layout.roadStyles[i], STYLES[i] ?? null, `line ${i}'s style is its path's`);

// the road layer: absent without a styled net; near each road the nearest path's class, half-width (dm) and heading
assert.equal(plain.texture.userData.roadLayer, undefined, 'no styled net: no road layer');
const layer = styled.texture.userData.roadLayer;
assert.ok(layer && layer.n === styled.size && layer.data.length === styled.size * styled.size * 4, 'one layer, a texel per mask texel');
const turnOf = (t) => (layer.data[t + 2] * 256 + layer.data[t + 3]) / 65536;
const axisErr = (turn, axis) => Math.min(...[0, 0.5, 1].map((k) => Math.abs(turn - axis - k)), Math.abs(turn - axis + 0.5));
for (const [x, z, cls, half, axis, label] of [
  [-400, -23.9, 1, 80, 0, 'the north avenue (path 0): asphalt, 8 m a side, along x where its meander turns'],
  [-165, -60, 4, 0, 0.25, 'the bridge street at x -165 (path 3): dirt at the map gauge, along z'],
  [0, -25, 3, 30, 0.25, 'the central bridge\'s street (path 4): patched, 3 m a side'],
  [-110, 291, 2, 30, 0, 'the north bench street (path 7): setts, 3 m a side, along x'],
  [400, 23.9, 0, 0, null, 'the south avenue (path 1): unstyled'],
]) {
  const t = at(styled.size, x, z);
  assert.equal(layer.data[t], cls, `${label}: the class`);
  assert.equal(layer.data[t + 1], half, `${label}: the half-width`);
  if (axis !== null) assert.ok(axisErr(turnOf(t), axis) < 0.01, `${label}: the heading (${turnOf(t).toFixed(3)} of a turn)`);
}
// (a class only within the 12 m distance ramp, where the material reads it — or on a square's paved apron, whose core
// the hardstand stamp lays without a distance: the material reads no class there)
let far = 0;
for (let i = 0; i < styled.size * styled.size; i++) if (styled.px[i * 4 + 1] === 0 && styled.px[i * 4] === 0 && layer.data[i * 4]) far++;
assert.equal(far, 0, 'nothing past the 12 m distance ramp carries a class');

// the mask: a styled path's core follows its width; the distance, marsh and wear channels never move, nor any core
// off the styled roads
const core = (b, x, z) => b.px[at(b.size, x, z)] / 255;
// (the mean core along a straight stretch offset from a line, the gauge's own wander averaged out)
const meanCore = (b, x0, z0, x1, z1) => {
  let sum = 0, n = 0;
  for (let t = 0; t <= 1; t += 1 / Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0)))) { sum += core(b, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t); n++; }
  return sum / n;
};
// the north avenue straight along x from -416 to -384 at z -23.9; the north bench street along x from -150 to -70 at z 291
const avenue = (b) => meanCore(b, -414, -23.9 + 5.5, -386, -23.9 + 5.5), terrace = (b) => meanCore(b, -145, 291 + 3.6, -75, 291 + 3.6);
assert.ok(avenue(styled) > 0.85 && avenue(plain) < 0.30,
  `the avenue's core reaches 5.5 m off its line (${avenue(styled).toFixed(2)} / ${avenue(plain).toFixed(2)})`);
assert.ok(terrace(styled) < terrace(plain) - 0.15 && terrace(styled) < 0.2,
  `the bench street narrows to its 6 m (${terrace(styled).toFixed(2)} / ${terrace(plain).toFixed(2)} at 3.6 m off)`);
let moved = 0;
for (let i = 0; i < plain.px.length; i += 4) {
  for (const c of [1, 2, 3]) assert.equal(styled.px[i + c], plain.px[i + c], 'the distance, marsh and wear channels are the plain bake\'s');
  // (inside the ramp: past it the wandering edge of a 16 m road may still feather, where the material reads the map gauge)
  if (plain.px[i + 1] > 0 && styled.px[i] !== plain.px[i] && !layer.data[i] && !layer.data[i + 1]) moved++;
}
assert.equal(moved, 0, 'no core moves off a styled road');

// the stack: the layer under the mask, addressed by uRoadClass; without it (1, 0, 0, 0)
{
  const st = stackLandUseBake(styled.texture, null, 1, layer);
  const W = st.texture.image.width, rows = styled.texture.image.height;
  assert.deepEqual(st.road.toArray(), [layer.n, rows + 128, 1, 0], 'uRoadClass: the layer\'s size and first row');
  for (let j = 0; j < layer.n; j += 37) {
    assert.deepEqual([...st.texture.image.data.subarray((rows + 128 + j) * W * 4, (rows + 128 + j) * W * 4 + layer.n * 4)],
      [...layer.data.subarray(j * layer.n * 4, (j + 1) * layer.n * 4)], `the layer's row ${j} in the stack`);
  }
  assert.deepEqual(stackLandUseBake(plain.texture, null, 1).road.toArray(), [1, 0, 0, 0], 'no layer: the road class is off');
}

// the material: one exact fetch through the mask's sampler, the decode, the styled gauge and the paved share
const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8').replace(/\s+/g, ' ');
for (const line of [
  'uniform vec4 uRoadClass;',
  'vec4 rc = texelFetch(uMask, rt + ivec2(0, int(uRoadClass.y + 0.5)), 0);',
  'gRoadClass = floor(rc.r * 255.0 + 0.5);',
  'roadHalfW = floor(rc.g * 255.0 + 0.5) * 0.1;',
  'if (gRoadClass > 0.5) gRoadTex = gRoadClass > 3.5 ? 0.0 : 1.0;',
  'float roadHalf = (roadHalfW > 0.05 ? roadHalfW : 3.85) + (n1hs - 0.5) * 1.1 + (n2 - 0.5) * 1.5;',
  'shader.uniforms.uRoadClass = { value: maskStack.road };',
]) assert.ok(source.includes(line.replace(/\s+/g, ' ')), `the material: ${line}`);
assert.ok(!/\(1\.0 - uRoadTex\)/.test(source), 'every road term reads the styled paved share (gRoadTex), none the map\'s alone');

console.log('roadPathStyles: the layout\'s styles, the styled cores and the untouched mask channels, the road layer\'s class, half-width and heading, the stack\'s addressing and the material\'s decode PASS; no GPU/art claim');
