// Every fence family's own gate (maps/gateKit.ts; the looks lane, 2026-10-13; the owner: "gate structures ... need brand
// new looks"): each family builds in every region's style, intact and off its hinges, member by member, in its module's
// span and under its height; deterministic; the stone gate's timber samples a flat texel of its kit's stone print; the
// fence runs and the yards hang their family's gate (props.ts, the kits' yard styles, the landmark grounds).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GATE_KINDS, GATE_STYLES, GATE_WIDTH, STONE_FLAT_TEXEL, buildGate, gateKindForFence, gateStoneOf, gateStyleFor } from './gateKit.ts';
import { ARCHITECTURE_STYLES, resolveRegionalArchitecture } from './regional/index.ts';
import { paintDressedStoneBuffers, paintRegionalSurfaceBuffers } from '../regionalSurfaces.ts';

const run = (gen) => { let r = gen.next(); while (!r.done) r = gen.next(); return r.value; };
let builds = 0, maxTris = 0;
for (const [id, style] of Object.entries(GATE_STYLES)) {
  let arch = null;
  try { arch = resolveRegionalArchitecture(id); } catch { arch = null; }
  const ctx = { style, stone: gateStoneOf(arch) ?? { kind: 'sandstone', dressed: false, tint: [0.6, 0.5, 0.4], damp: 0.8 }, render: { damp: 0.3 } };
  for (const kind of GATE_KINDS) {
    const W = GATE_WIDTH[kind];
    let intactTop = 0;
    for (const broken of [false, true]) {
      const g = buildGate(kind, ctx, broken);
      for (const name of ['position', 'normal', 'uv', 'color']) assert.ok(g.getAttribute(name), `${id} ${kind}: ${name}`);
      const p = g.getAttribute('position').array, c = g.getAttribute('color').array, uv = g.getAttribute('uv').array;
      assert.equal(p.length % 9, 0, `${id} ${kind}: whole triangles`);
      const tris = p.length / 9;
      maxTris = Math.max(maxTris, tris);
      assert.ok(tris >= 80 && tris <= 1600, `${id} ${kind}${broken ? ' broken' : ''}: ${tris} triangles, member by member and bounded`);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < p.length; i += 3) {
        assert.ok(Number.isFinite(p[i]) && Number.isFinite(p[i + 1]) && Number.isFinite(p[i + 2]), `${id} ${kind}: finite`);
        x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]);
        z0 = Math.min(z0, p[i + 2]); z1 = Math.max(z1, p[i + 2]);
      }
      for (const v of c) assert.ok(Number.isFinite(v) && v >= 0 && v < 8, `${id} ${kind}: colour in range`);
      for (const v of uv) assert.ok(Number.isFinite(v), `${id} ${kind}: uv finite`);
      // in its module: from its hanging post or pier at z = 0 to the gap's far side (a pier's cap and a swung leaf a
      // little either side), its posts set into the ground
      // (broken: its pieces lie about the gateway, a snapped post's head beside its stub)
      const reach = broken ? 1.6 : 0.45;
      assert.ok(z0 > -reach - 0.85 && z1 < W + reach, `${id} ${kind}${broken ? ' broken' : ''}: within its ${W} m module (${z0.toFixed(2)}..${z1.toFixed(2)})`);
      assert.ok(y0 >= -0.25, `${id} ${kind}: footings no deeper than 0.25 m`);
      assert.ok(Math.abs(x0) < 2.4 && Math.abs(x1) < 2.4, `${id} ${kind}: the leaf swings within reach of the line`);
      if (!broken) {
        intactTop = y1;
        assert.ok(y1 > 1.0 && y1 < 2.75, `${id} ${kind}: a gate's height (${y1.toFixed(2)} m)`);
      } else {
        assert.ok(y1 < intactTop - 0.4 && y1 < 1.35, `${id} ${kind}: off its hinges, lower than it stood (${y1.toFixed(2)} vs ${intactTop.toFixed(2)})`);
      }
      // deterministic: no stream of the world's
      const again = buildGate(kind, ctx, broken).getAttribute('position').array;
      assert.deepEqual(Array.from(again.slice(0, 300)), Array.from(p.slice(0, 300)), `${id} ${kind}: deterministic`);
      builds++;
    }
  }
}
// the families by fence
assert.equal(gateKindForFence('fencepicket'), 'gatepicket');
assert.equal(gateKindForFence('fencewattle'), 'gatewattle');
for (const k of ['fenceplank', 'fencerail', 'wallstone', 'walladobe']) assert.equal(gateKindForFence(k), 'gate', `${k}: the field gate`);
// every kit's yard and churchyard hang their fence family's gate (the stone and mud walls' gates need the kit surfaces)
const FAMILY = { wallstone: 'gatestone', walladobe: 'gateadobe', fencepicket: 'gatepicket', fencewattle: 'gatewattle', fenceplank: 'gate', fencerail: 'gate' };
let yards = 0;
for (const style of ARCHITECTURE_STYLES) {
  for (const yard of [style.yard, style.churchyard]) {
    if (!yard || !yard.gate) continue;
    assert.equal(yard.gate, FAMILY[yard.fence], `${style.id}: a ${yard.fence} yard hangs the ${FAMILY[yard.fence]} (not the farm gate)`);
    yards++;
  }
  assert.ok(gateStyleFor(style.id, 'x') === GATE_STYLES[style.id] || !GATE_STYLES[style.id], `${style.id}: its own gates`);
}
assert.ok(yards >= 17, `the kits' yards and churchyards hang family gates (${yards})`);
// the stone gate's timber and iron sample a flat texel of each kit stone print (STONE_FLAT_TEXEL against the painters)
for (const [key, texel] of Object.entries(STONE_FLAT_TEXEL)) {
  const [kind, dressed] = key.split(':');
  const b = dressed ? run(paintDressedStoneBuffers(kind, [1, 1, 1], 0x51a7)) : run(paintRegionalSurfaceBuffers('stone', kind, [1, 1, 1], 0x51a7));
  const s = b.size, x = Math.round(texel.uv[0] * s - 0.5), y = Math.round((1 - texel.uv[1]) * s - 0.5);
  let m = 0, m2 = 0, n = 0;
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const j = (((y + dy + s) % s) * s + ((x + dx + s) % s)) * 4, l = (b.px[j] * 0.3 + b.px[j + 1] * 0.59 + b.px[j + 2] * 0.11) / 255;
    m += l; m2 += l * l; n++;
  }
  m /= n;
  const sd = Math.sqrt(Math.max(0, m2 / n - m * m));
  assert.ok(sd < 0.04, `${key}: the gate texel's window is flat (sd ${sd.toFixed(4)})`);
  const j = (y * s + x) * 4;
  for (let ch = 0; ch < 3; ch++) assert.ok(Math.abs(b.px[j + ch] / 255 - texel.srgb[ch]) < 0.04, `${key}: the texel's value as recorded`);
}
// the placements: a road's field entrance hangs its run's family gate; a yard's fills its slot from the slot's start;
// the landmark grounds' farm gate is its fence family's
const props = readFileSync(new URL('../props.ts', import.meta.url), 'utf8');
assert.match(props, /addDestructible\(gateKindForFence\(kind\), ax, gy - 0\.06, az, yaw, 1\)/, 'placeFenceRun: the run family\'s gate');
assert.match(props, /const gx = plan\.gate\.x - Math\.sin\(plan\.gate\.yaw\) \* half, gz = plan\.gate\.z - Math\.cos\(plan\.gate\.yaw\) \* half;/,
  'a yard gate from its slot\'s start');
assert.match(props, /\.\.\.gateTypes\(\),/, 'the gate kinds join the props\' local types');
const grounds = readFileSync(new URL('../landmarks/grounds.ts', import.meta.url), 'utf8');
assert.match(grounds, /kind: opts\.gate === 'gate' \? gateKindForFence\(kind\) : opts\.gate/, 'the landmark grounds hang the family gate');
console.log(`gateKit: ${builds} builds (${Object.keys(GATE_STYLES).length} regional styles x ${GATE_KINDS.length} families, intact and broken; `
  + `at most ${maxTris} triangles), ${yards} kit yards on their family gates, ${Object.keys(STONE_FLAT_TEXEL).length} flat stone texels PASS`);
