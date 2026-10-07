// mudWalls.selftest — the mud walls weathered in world space (the scenery lane, b14; gauntlet wave 97 on Desert's mud
// walls: "wave-top silhouette and rust-colored staining repeat identically roughly eight times across the frame",
// "stamped rectangle decals and no courses, render, slumping or erosion"). A pool draws one module for every module,
// so nothing that varies may live in the module or its tile. Pinned:
//   1. the module (inhabitKit adobeModule through the walladobe build): its crown level along the module and its faces
//      plain (no bite, wave or gully: every row of the extrusion the same section), fitted to the old envelope (the
//      collider's box: its foot, its top and its width unchanged);
//   2. the material (mudWallShader.ts): its hook applies to three's standard shader and the depth shader (every anchor
//      found), the crown's loss is bounded by MUD_SLUMP_M (0.24 m, under the old bites' 0.40 m) and only ever lowers the
//      crown, the displacement runs in the shadow pass too, the losses and stains are laid by world place;
//   3. the wiring (props.ts): the mud print has its own program and the mud hook, the walladobe pool's depth material
//      is the mud one, its shape the pool geometry's;
//   4. (b18; the b14 reshoot of Desert's walls: the crown "a sawtooth", the render's losses "carved glyphs") the crown's
//      noises a metre and more across (none fine enough to beat against its 0.45 m smoothing taps), the losses broad
//      (the face's noise metres across, its ragged edge a sixth of the field at most), the bricks under them soft;
//   5. (b27; waves 173 and 174: "carved, pharaonic-looking glyphs", "a crisp, repeating ornamental motif") the face's
//      horizontal reads no normal: the world place along the module's own axes, its sign fixed so a module turned round
//      runs the same way — continuous along a run and across its joints at any pitch. (It was the shaded normal's
//      tangent dotted with the world place: 200 m from the map's middle a turn of a few hundredths of a radian, the crown's
//      tilt or a module's pitch, moved it by metres, triangle by triangle, the same on every module.) The render thins
//      over its edge; the bricks under it are worn round.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { DESTRUCTIBLE_TYPES } from './maps/inhabitKit.ts';
import { MUD_SHOULDER, MUD_SLUMP_M, applyMudWallHook, createMudWallDepthMaterial, mudShapeFor } from './mudWallShader.ts';

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// 1. the module
{
  const g = DESTRUCTIBLE_TYPES.walladobe.build(mulberry32(7));
  g.computeBoundingBox();
  const p = g.attributes.position;
  // the crown: the highest vertex of each row along the module (rows by z)
  const rows = new Map();
  for (let i = 0; i < p.count; i++) {
    const z = Math.round(p.getZ(i) * 1000);
    rows.set(z, Math.max(rows.get(z) ?? -Infinity, p.getY(i)));
  }
  const crowns = [...rows.values()];
  const top = g.boundingBox.max.y;
  assert.ok(crowns.length > 15, `the module's rows (${crowns.length})`);
  assert.ok(Math.max(...crowns) - Math.min(...crowns) < 1e-4, `the crown is level along the module (spread ${(Math.max(...crowns) - Math.min(...crowns)).toFixed(5)} m)`);
  // the faces: at every row the widest point at mid height is the same (no gully, no bow)
  const widths = new Map();
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(p.getY(i) / top - 0.5) > 0.25) continue;
    const z = Math.round(p.getZ(i) * 1000);
    widths.set(z, Math.max(widths.get(z) ?? 0, Math.abs(p.getX(i))));
  }
  const ws = [...widths.entries()].sort((a, b) => a[0] - b[0]).map(([, w]) => w);
  // (the module's last tenth tucks inside the next's start: the faces are plain before it)
  const body = ws.slice(0, Math.floor(ws.length * 0.85));
  assert.ok(Math.max(...body) - Math.min(...body) < 1e-4, 'the faces are plain along the module (no gully, no bow)');
  // the envelope: the same box the old module was fitted to (its collider's)
  assert.ok(Math.abs(g.boundingBox.min.y) < 1e-6 && top > 1.05 && top < 1.25, `the module stands on its foot to the envelope's top (${top.toFixed(3)} m)`);
}

// 2. the material
{
  const standard = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  // (the props grime hook runs first: its varyings and uGrime in the fragment stage)
  standard.vertexShader = standard.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGrimeW;\nvarying vec3 vGrimeN;');
  standard.fragmentShader = standard.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGrimeW;\nvarying vec3 vGrimeN;\nuniform sampler2D uGrime;');
  const shape = { value: new THREE.Vector3() };
  applyMudWallHook(standard, shape);
  assert.equal(standard.uniforms.uMudShape, shape, 'the hook shares the shape uniform');
  for (const part of ['cotMudLoss', 'cotMudCrown', 'transformed.y = uMudShape.y', 'objectNormal = normalize(objectNormal']) {
    assert.ok(standard.vertexShader.includes(part), `the vertex stage carries ${part}`);
  }
  for (const part of ['float loss = smoothstep', 'brickCol', 'streak', 'cotMudPerturb(-vViewPosition']) {
    assert.ok(standard.fragmentShader.includes(part), `the fragment stage carries ${part}`);
  }
  // the displacement only lowers the crown, by at most uMudShape.z
  assert.match(standard.vertexShader, /return uMudShape\.z \* clamp\(slump \* 0\.72 \+ height \* 0\.28, 0\.0, 1\.0\);/, 'the loss is bounded by the shape\'s depth');
  assert.match(standard.vertexShader, /transformed\.y = uMudShape\.y \+ \(transformed\.y - uMudShape\.y\) \* \(cotSpan - cotLoss\) \/ cotSpan;/, 'the shoulders give with the crown');
  assert.ok(MUD_SLUMP_M > 0 && MUD_SLUMP_M <= 0.25, `the crown drops at most ${MUD_SLUMP_M} m below the collider's top (the old bites 0.40 m)`);
  // the losses and the stains by world place (the face's horizontal and the module's height), never the module's uv;
  // (b27) the face's horizontal along the module's own axes, picked by the face's own geometry, never a shaded normal
  assert.match(standard.fragmentShader, /float ms = vMudPick >= 0\.0 \? vMudS\.y : vMudS\.x;/, 'along the face by world place');
  assert.match(standard.vertexShader, /vMudS = vec2\(dot\(cotFaceW\.xz, cotAxX\), dot\(cotFaceW\.xz, cotAxZ\)\);/, 'the world place along the module\'s own axes');
  assert.match(standard.vertexShader, /vMudPick = abs\(normal\.x\) - abs\(normal\.z\);/, 'a face picks its axis by its geometry\'s normal');
  assert.ok(!/dot\(vGrimeW\.xz, mt\)|vec2 mt = /.test(standard.fragmentShader), 'no coordinate from the shaded normal\'s tangent');
  assert.ok(!/vMapUv|vUv\b/.test(standard.fragmentShader.slice(standard.fragmentShader.indexOf('float cotMudH'), standard.fragmentShader.indexOf('float cotMudH') + 4000)),
    'the weathering never reads the module\'s uv');
  // the shape from a box
  const box = new THREE.Box3(new THREE.Vector3(-0.3, 0, -1.5), new THREE.Vector3(0.3, 1.2, 1.5));
  const v = mudShapeFor(box);
  assert.ok(Math.abs(v.x - 1.2) < 1e-9 && Math.abs(v.y - MUD_SHOULDER * 1.2) < 1e-9 && v.z === MUD_SLUMP_M, 'the shape: the top, the shoulder, the depth');
  // the shadow pass: the same displacement in the depth material
  const depth = createMudWallDepthMaterial(new THREE.Texture(), shape);
  const ds = { uniforms: {}, vertexShader: THREE.ShaderLib.depth.vertexShader, fragmentShader: THREE.ShaderLib.depth.fragmentShader };
  depth.onBeforeCompile(ds);
  assert.ok(ds.vertexShader.includes('transformed.y = uMudShape.y') && ds.uniforms.uMudShape === shape && ds.uniforms.uGrime,
    'the depth material runs the same crown (a slumped crown casts a slumped shadow)');
  assert.equal(depth.depthPacking, THREE.RGBADepthPacking);
}

// 3. the wiring
{
  const props = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
  // (b25: and the building mud — the ksar gate post's and watch hut's walls — its own, its crown left whole)
  assert.match(props, /materialKind === 'fieldMud' \? mudHook : materialKind === 'fieldMudBuilding' \? mudBuildingHook : grimeHook/, 'the mud print takes the mud hook');
  // (b15: the hay shares the straw's program; the mud print keeps its own)
  assert.match(props, /const programKind = materialKind === 'burlap' \? 'structureCanvas' : materialKind === 'hay' \? 'straw'\s*: materialKind === 'fieldMudBuilding' \? 'fieldMud' : materialKind;/,
    'the mud print has its own program (b25: the building mud shares it)');
  assert.match(props, /if \(material === mats\.fieldMud && kind === 'walladobe'\) \{[\s\S]{0,400}mudShapeFor\(geoI\.boundingBox!, mudShape\.value\);[\s\S]{0,200}imI\.customDepthMaterial = depth;/,
    'the mud walls\' pool: its shape from its geometry, its shadows through the mud depth material');
}

// 4. no sawtooth, no glyphs
{
  const standard = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  standard.vertexShader = standard.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGrimeW;\nvarying vec3 vGrimeN;');
  standard.fragmentShader = standard.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGrimeW;\nvarying vec3 vGrimeN;\nuniform sampler2D uGrime;');
  applyMudWallHook(standard, { value: new THREE.Vector3() });
  const loss = standard.vertexShader.slice(standard.vertexShader.indexOf('float cotMudLoss('), standard.vertexShader.indexOf('vec3 cotMudWorld('));
  // (b27: the grime tile's finer octaves wind round their torus several times a tile — near white at its texels — so a
  // frequency alone never kept the teeth off: the crown reads the tile's mip 3, eight texels a side averaged)
  const crown = [...loss.matchAll(/textureLod\(uGrime, xz \* ([0-9.]+)(?: \+ vec2\([^)]*\))?, ([0-9.]+)\)\.[rgb]/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.equal(crown.length, 3, 'the crown\'s three noises');
  assert.ok(crown.every(([f, lod]) => f <= 0.075 && lod >= 3), `the crown's noises a metre and more across (${crown.map(([f, l]) => `${f} a metre at mip ${l}`).join(', ')})`);
  assert.ok(!/texture2D\(uGrime, xz/.test(loss), 'no crown noise read at the tile\'s full size');
  const frag = standard.fragmentShader;
  const n1 = Number(frag.match(/float n1 = texture2D\(uGrime, vec2\(ms \* ([0-9.]+)/)[1]);
  const n2 = Number(frag.match(/float n2 = texture2D\(uGrime, vec2\(ms \* ([0-9.]+)/)[1]);
  // (b27) both a few mips down, so the tile's near-white octaves never crumb the render's edge
  const bias = [...frag.matchAll(/float n[12] = texture2D\(uGrime, vec2\([^;]*\), ([0-9.]+)\)\.[rgb];/g)].map((m) => Number(m[1]));
  assert.ok(bias.length === 2 && bias.every((b) => b >= 2), `the losses' noises read a few mips down (bias ${bias.join(', ')})`);
  const [w1, w2] = frag.match(/float field = n1 \* ([0-9.]+) \+ n2 \* ([0-9.]+) \+ wear;/).slice(1).map(Number);
  assert.ok(n1 <= 0.07 && n2 <= 0.25, `the losses' noises broad (${n1}, ${n2} a metre)`);
  assert.ok(w2 <= 0.2 && Math.abs(w1 + w2 - 1) < 1e-9, `the ragged edge at most a fifth of the field (${w2})`);
  const mortar = Number(frag.match(/brickCol = mix\(brickCol, diffuseColor\.rgb \* ([0-9.]+), mortar\);/)[1]);
  assert.ok(mortar >= 0.6, `the bricks under the render soft, their mortar no dark outline (${mortar})`);
  // (b27) the render thins over its edge (no cut line); the bricks' corners worn round, their arrises wandering
  const thin = Number(frag.match(/float loss = smoothstep\(T - ([0-9.]+) - fw/)[1]);
  assert.ok(thin >= 0.012, `the render thins over its edge (${thin} of the field)`);
  assert.match(frag, /float edge = min\(min\(bd\.x, bd\.y\), 0\.025 - length\(bq\)\);/, 'the bricks\' corners worn round');
  assert.match(frag, /edge \+= \(texture2D\(uGrime, vec2\(ms \* [0-9.]+ \+ [0-9.]+, mh \* [0-9.]+ \+ [0-9.]+\), 2\.0\)\.b - 0\.5\) \* 0\.02;/, 'their arrises wandering');
}

// 5. the face's horizontal (b27), mirrored from the vertex stage: a run 200 m out on a 24-degree slope, its modules
// turned round by place; the coordinate runs on along the run and across every joint, whatever the turn
{
  const canon = (x, z) => { const l = Math.hypot(x, z); x /= l; z /= l; return x * 0.8137 + z * 0.5812 < 0 ? [-x, -z] : [x, z]; };
  const yaw = 2.71, pitch = -0.42, L = 3, run = [Math.sin(yaw), Math.cos(yaw)];
  const module = (k, turned) => {
    const m = new THREE.Matrix4().makeRotationY(yaw + (turned ? Math.PI : 0))
      .multiply(new THREE.Matrix4().makeRotationX(turned ? -pitch : pitch));
    const d = (k + 0.5) * L * Math.cos(pitch);
    return m.setPosition(-190 + run[0] * d, -1 - (k + 0.5) * L * Math.sin(pitch), 13 + run[1] * d);
  };
  // the coordinate at a module's local place (its axis's, as the vertex stage takes it: column 2's ground plan, signed)
  const coord = (m, z, y) => { const e = m.elements, ax = canon(e[8], e[10]); const w = new THREE.Vector3(0.26, y, z).applyMatrix4(m); return w.x * ax[0] + w.z * ax[1]; };
  let prevEnd = null, joints = 0;
  for (let k = 0; k < 6; k++) {
    const turned = k % 3 === 1, m = module(k, turned), s = turned ? -1 : 1;
    const a = coord(m, -s * L / 2, 0.5), b = coord(m, s * L / 2, 0.5);
    assert.ok(Math.abs(Math.abs(b - a) - L * Math.cos(pitch)) < 1e-6, `module ${k}: the face's horizontal runs its ground-plan length`);
    if (prevEnd !== null) { assert.ok(Math.abs(a - prevEnd) < 1e-6, `joint ${k}: the coordinate runs on (${(a - prevEnd).toFixed(6)} m)`); joints++; }
    prevEnd = b;
  }
  assert.equal(joints, 5, 'every joint of the run');
}

console.log(`mudWalls.selftest: the module level and plain in its envelope; the crown, the render's losses and the stains in world space (the crown at most ${MUD_SLUMP_M} m down, the same in the shadows); wired; no sawtooth crown, no glyph losses; the face's horizontal by the module's own axes, continuous across its joints`);
