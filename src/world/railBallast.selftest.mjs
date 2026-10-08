// Receipt of the rail kit's ballast (the ground lane, after gauntlet wave 234: the railyards' track bed "a smooth grey
// slab with sleepers sitting on it and no stone ballast, shoulder, fastenings or grime"). Certifies:
//   1. tagRailBallast writes each vertex's place across the track (half-gauges) and its role into the UV;
//   2. the kit lays every bed and shoulder into the ballast bucket when the caller has one, and into the baked bucket
//      when it has not (the phones, the plain bucket sets), with the same geometry and the same seeded stream either
//      way — the bed's u spans the slab's half-width, the shoulders' run outward from it and their v down the slope;
//   3. the hook anchors on the props grime hook's own declarations (pinned in props.ts), paints the stone in world
//      space with an integer cell hash, fades it by the footprint, lays the four-foot's oil and the rails' rust by the
//      UV, and drops the stones and their normals in its cheap variant;
//   4. props.ts gives the bucket its own material on the cascade setup (the ballast hook over the grime hook, its own
//      program key) and keeps the phones' bed on the baked material.
// Source and geometry checks; the look and the cost are the lane's lab frames and ABCCBA hold.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createHeightField, mulberry32 } from './terrain.ts';
import { dressMapExtras } from './maps/mapKits.ts';
import { getMapConfig } from './maps/index.ts';
import { RAIL_SPUR_BALLAST_M, RAIL_SPUR_GAUGE_M } from './railSpurs.ts';
import {
  RAIL_BALLAST_BED, RAIL_BALLAST_SHOULDER, RAIL_BALLAST_SHOULDER_STONE_M, RAIL_BALLAST_STONE_M, applyRailBallastHook, tagRailBallast,
} from './railBallast.ts';

// 1. the tag
{
  const g = new THREE.BoxGeometry(3, 0.16, 10);
  tagRailBallast(g, 1.44, (x) => x, () => RAIL_BALLAST_BED);
  const uv = g.getAttribute('uv'), pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    assert.ok(Math.abs(uv.getX(i) - pos.getX(i) / 0.72) < 1e-6, 'u is the offset across in half-gauges');
    assert.equal(uv.getY(i), RAIL_BALLAST_BED, 'v is the role');
  }
  assert.throws(() => tagRailBallast(new THREE.BoxGeometry(1, 1, 1), 0, (x) => x, () => 0), 'a zero gauge is refused');
  g.dispose();
}

// 2. the kit
const PLAIN = ['plaster', 'plaster2', 'plaster3', 'roof', 'stone', 'wood', 'dark', 'glass', 'curtain', 'straw', 'baked'];
function build(mapId, withBallast) {
  const cfg = getMapConfig(mapId);
  const field = createHeightField(1337, cfg);
  const buckets = Object.fromEntries([...PLAIN, ...(withBallast ? ['ballast'] : [])].map((n) => [n, []]));
  const random = mulberry32(1337 ^ 0x5a17);
  let calls = 0;
  dressMapExtras({ mapId, extraKits: cfg.props?.extraKits, riverLandings: cfg.props?.riverLandings, L: field._layout,
    heightField: field, rng: () => { calls++; return random(); }, buckets, obstacles: [], colliders: [] });
  return { buckets, calls, next: random() };
}
const isBed = (g) => g.parameters?.width === RAIL_SPUR_BALLAST_M && (g.parameters.height === 0.16 || g.parameters.height === 0.36);
const isShoulder = (g) => g.parameters?.height === 0.05 && Math.abs(g.parameters.width - Math.hypot(0.62, 0.24)) < 1e-9;
let beds = 0, shoulders = 0;
for (const mapId of ['foundry', 'caldera', 'steppe']) {
  const a = build(mapId, true), b = build(mapId, false);
  try {
    assert.equal(a.calls, b.calls, `${mapId}: the ballast bucket draws nothing of the seeded stream`);
    assert.equal(a.next, b.next, `${mapId}: and leaves it where it was`);
    const inBallast = a.buckets.ballast;
    assert.ok(inBallast.length > 0, `${mapId}: the kit lays its bed into the ballast bucket`);
    assert.ok(inBallast.every((g) => isBed(g) || isShoulder(g)), `${mapId}: and nothing else`);
    assert.equal(a.buckets.baked.filter((g) => isBed(g) || isShoulder(g)).length, 0, `${mapId}: no bed left on the baked material`);
    const fallback = b.buckets.baked.filter((g) => isBed(g) || isShoulder(g));
    assert.equal(fallback.length, inBallast.length, `${mapId}: without the bucket the same parts fall back to the baked material`);
    for (let i = 0; i < inBallast.length; i++) {
      const pa = inBallast[i].getAttribute('position').array, pb = fallback[i].getAttribute('position').array;
      assert.ok(pa.length === pb.length && pa.every((v, k) => v === pb[k]), `${mapId}: the same geometry either way`);
    }
    for (const g of inBallast) {
      const uv = g.getAttribute('uv');
      let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
      for (let i = 0; i < uv.count; i++) {
        uMin = Math.min(uMin, uv.getX(i)); uMax = Math.max(uMax, uv.getX(i)); vMin = Math.min(vMin, uv.getY(i)); vMax = Math.max(vMax, uv.getY(i));
      }
      const halfBed = RAIL_SPUR_BALLAST_M / RAIL_SPUR_GAUGE_M; // the slab's half-width in half-gauges
      if (isBed(g)) {
        beds++;
        assert.ok(Math.abs(uMin + halfBed) < 1e-6 && Math.abs(uMax - halfBed) < 1e-6, `${mapId}: a bed spans its half-width across (${uMin}..${uMax})`);
        assert.ok(vMin === RAIL_BALLAST_BED && vMax === RAIL_BALLAST_BED, `${mapId}: a bed's role`);
      } else {
        shoulders++;
        const out = Math.max(Math.abs(uMin), Math.abs(uMax)), inn = Math.min(Math.abs(uMin), Math.abs(uMax));
        assert.ok(Math.sign(uMin) === Math.sign(uMax), `${mapId}: a shoulder lies on one side`);
        assert.ok(inn > halfBed - 0.1 && out < halfBed + 0.62 / (RAIL_SPUR_GAUGE_M / 2) + 0.05, `${mapId}: a shoulder runs out from the bed's edge (${inn.toFixed(2)}..${out.toFixed(2)})`);
        assert.ok(vMin >= RAIL_BALLAST_SHOULDER - 1e-9 && vMax <= RAIL_BALLAST_SHOULDER + 1 + 1e-9 && vMax - vMin > 0.9,
          `${mapId}: a shoulder's v runs down its slope (${vMin.toFixed(2)}..${vMax.toFixed(2)})`);
      }
    }
  } finally {
    for (const built of [a, b]) for (const list of Object.values(built.buckets)) for (const g of list) g.dispose();
  }
}
assert.ok(beds > 50 && shoulders === beds * 2, `two shoulders a bed (${beds} beds, ${shoulders} shoulders)`);

// 3. the hook, on the props grime hook's anchors (pinned against props.ts)
const props = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
for (const anchor of ["'#include <common>\\nvarying vec3 vGrimeW;\\nvarying vec3 vGrimeN;'", 'vGrimeN = normalize(mat3(modelMatrix) * gn);\n}`);',
  "'#include <common>\\nvarying vec3 vGrimeW;\\nvarying vec3 vGrimeN;\\nuniform sampler2D uGrime;'"]) {
  assert.ok(props.includes(anchor), `the grime hook still writes the anchor the ballast hook reads: ${anchor.slice(0, 60)}`);
}
const grimed = () => ({
  uniforms: {},
  vertexShader: THREE.ShaderLib.standard.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGrimeW;\nvarying vec3 vGrimeN;')
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n{\n  vec4 gw = vec4(transformed, 1.0);\n  vec3 gn = objectNormal;\n  vGrimeW = (modelMatrix * gw).xyz;\n  vGrimeN = normalize(mat3(modelMatrix) * gn);\n}'),
  fragmentShader: THREE.ShaderLib.standard.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGrimeW;\nvarying vec3 vGrimeN;\nuniform sampler2D uGrime;'),
});
const full = grimed(); applyRailBallastHook(full);
const cheap = grimed(); applyRailBallastHook(cheap, false);
assert.ok(full.vertexShader.includes('vBallastUv = uv;'), 'the vertex stage passes the part\'s place across the track');
const hash = /vec2 cotBallastHash\(vec2 c\) \{([\s\S]*?)\n\}/.exec(full.fragmentShader);
assert.ok(hash && hash[1].includes('uvec2') && !hash[1].includes('sin('), 'the stones\' cells hash by integers (exact at any distance)');
assert.ok(full.fragmentShader.includes('#define COT_BALLAST_STONES') && !cheap.fragmentShader.includes('#define COT_BALLAST_STONES'), 'the cheap variant draws no stones');
assert.ok(full.fragmentShader.includes(`mix(${RAIL_BALLAST_STONE_M.toFixed(3)}, ${RAIL_BALLAST_SHOULDER_STONE_M.toFixed(3)}, balShoulder)`), 'the bed\'s and the shoulders\' stone sizes');
assert.ok(/float sv = 1\.0 - smoothstep\(0\.32, 0\.85, fw\);/.test(full.fragmentShader) && full.fragmentShader.includes('balStone = mix(1.0, tone * (1.0 - 0.55 * voidW) / 0.92, sv);'),
  'the stones fade to the pattern\'s mean by the footprint');
assert.ok(full.fragmentShader.includes('float fourFoot = (1.0 - smoothstep(0.78, 0.94, balU)) * (1.0 - balShoulder);'), 'the four-foot lies between the rails, on the bed');
assert.ok(full.fragmentShader.includes('roughnessFactor *= 1.0 - 0.28 * cotBallastGloss;'), 'the oil is a little glossier');
assert.ok(full.fragmentShader.includes('normal = normalize(normal + (viewMatrix * vec4(balTiltW, 0.0)).xyz);') && !cheap.fragmentShader.includes('balTiltW'),
  'the stones\' faces tilt the normal (not in the cheap variant)');
const map = full.fragmentShader.indexOf('#include <map_fragment>'), color = full.fragmentShader.indexOf('#include <color_fragment>');
assert.ok(map > 0 && full.fragmentShader.indexOf('diffuseColor.rgb *= bal;') > map && full.fragmentShader.indexOf('diffuseColor.rgb *= bal;') < color,
  'the stone multiplies the material ahead of the baked vertex tones');
const weedLay = full.fragmentShader.indexOf('diffuseColor.rgb = mix(diffuseColor.rgb, cotBallastWeedCol, cotBallastWeed);');
assert.ok(weedLay > color && full.fragmentShader.includes('#define COT_BALLAST_WEEDS'), 'the weeds\' own albedo laid after the vertex tones');
const snowy = grimed(); applyRailBallastHook(snowy, true, false);
assert.ok(!snowy.fragmentShader.includes('#define COT_BALLAST_WEEDS') && snowy.fragmentShader.includes('#ifdef COT_BALLAST_WEEDS'), 'no weeds under a snow load');

// 4. the props wiring
assert.ok(/ballast: new THREE\.MeshStandardMaterial\(\{ vertexColors: true, roughness: 0\.94, metalness: 0 \}\),/.test(props), 'the bucket\'s own material');
assert.ok(props.includes("const ballastHook: MaterialShaderHook = (shader) => { grimeHook(shader); applyRailBallastHook(shader, true, !snowCap); };"),
  'its hook over the grime hook (no weeds under the snow load)');
assert.ok(props.includes(": materialKind === 'ballast' ? ballastHook"), 'installed through the cascade setup with every surface material');
assert.ok(props.includes('...(mobileProps ? {} : { ballast: [] }),'), 'the phones keep the bed on the baked material');
console.log(`railBallast: UV tags, ${beds} beds and ${shoulders} shoulders on Ironworks, Caldera and Steppe in the ballast bucket (the baked one without it, the same geometry and seeded stream), the hook's integer-hashed stones faded by the footprint, the four-foot's oil, its cheap variant and the props wiring PASS; no GPU/art claim`);
