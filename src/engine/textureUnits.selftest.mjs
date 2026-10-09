// textureUnits.selftest — the programs' texture units counted as the GPU counts them (2026-10-05, the skies lane: the
// terrain's seventeenth unit).
//
// three r185's physical fragment declares `uniform sampler2D dfgLUT` inside `#include <lights_physical_pars_fragment>` and
// reads it in every standard material; the cloud shade's budget gate counted the shader before its includes expanded and
// never saw it. Three numbers a program's units over both stages and warns past MAX_TEXTURE_IMAGE_UNITS (16) on every
// bind: the terrain stood at seventeen (ten layer samplers, four cascades, the environment, the DFG LUT, the cloud shade's
// vertex fetch). This receipt counts on the expanded, preprocessed program — three's includes resolved, its prefix defines
// and the material's own applied, `#if` evaluated, a sampler active where the code reads it — independently of the gate,
// and holds the real terrain program (built by terrain.ts, registered through lighting.ts) to 16 in its fragment stage and
// 16 in all, with its cloud shade on. On the PR head before the fix it counts seventeen and fails.
import assert from 'node:assert/strict';
import * as THREE from 'three';

// ---- the counter: three's includes, a C preprocessor for #if / #ifdef / #define, the active samplers
const expand = (src) => src.replace(/^[ \t]*#include +<([\w\d./]+)>/gm, (_, name) => {
  const chunk = THREE.ShaderChunk[name];
  if (chunk === undefined) throw new Error(`no chunk ${name}`);
  return expand(chunk);
});
function preprocess(src, defines) {
  const env = new Map(Object.entries(defines).map(([k, v]) => [k, String(v)]));
  const out = [], stack = [];
  const active = () => stack.every((s) => s.active);
  const evaluate = (expr) => {
    let e = expr.replace(/\/\/.*$/, '').replace(/defined\s*\(\s*(\w+)\s*\)/g, (_, n) => (env.has(n) ? '1' : '0'))
      .replace(/defined\s+(\w+)/g, (_, n) => (env.has(n) ? '1' : '0'));
    for (let k = 0; k < 4; k++) e = e.replace(/\b[A-Za-z_]\w*\b/g, (n) => (env.has(n) && env.get(n) !== '' ? env.get(n) : '0'));
    if (!/^[\d\s()!&|<>=+\-*/.]*$/.test(e)) throw new Error(`unparsed #if: ${expr}`);
    return !!Function(`return (${e || 0});`)();
  };
  for (const line of src.split('\n')) {
    const m = line.match(/^\s*#\s*(\w+)\s*(.*)$/);
    if (!m) { if (active()) out.push(line); continue; }
    const [, d, rest] = m;
    if (d === 'ifdef') { const a = env.has(rest.trim()); stack.push({ active: a, taken: a }); }
    else if (d === 'ifndef') { const a = !env.has(rest.trim()); stack.push({ active: a, taken: a }); }
    else if (d === 'if') { const a = active() ? evaluate(rest) : false; stack.push({ active: a, taken: a }); }
    else if (d === 'elif') { const s = stack[stack.length - 1]; if (s.taken) s.active = false; else { s.active = evaluate(rest); s.taken = s.active; } }
    else if (d === 'else') { const s = stack[stack.length - 1]; s.active = !s.taken; s.taken = true; }
    else if (d === 'endif') stack.pop();
    else if (d === 'define') { if (active()) { const [name, ...v] = rest.trim().split(/\s+/); env.set(name, v.join(' ')); } }
    else if (d === 'undef') { if (active()) env.delete(rest.trim()); }
    else if (active()) out.push(line);
  }
  assert.equal(stack.length, 0, 'balanced #if blocks');
  return { text: out.join('\n'), env };
}
const SAMPLER = /uniform\s+(?:(?:lowp|mediump|highp)\s+)?(?:sampler2D|sampler3D|samplerCube|sampler2DArray|sampler2DShadow|samplerCubeShadow|usampler2D|isampler2D)\s+([^;]+);/g;
/** the units a stage's active samplers take: declared, then read somewhere else (an array by its size) */
function stageSamplers(text, env) {
  const units = new Map();
  for (const m of text.matchAll(SAMPLER)) {
    for (const part of m[1].split(',')) {
      const am = part.trim().match(/^(\w+)\s*(?:\[\s*([\w\d]+)\s*\])?$/);
      if (!am) continue;
      const [, name, size] = am;
      const n = size ? Number(env.get(size) ?? size) : 1;
      const reads = text.split(new RegExp(`\\b${name}\\b`)).length - 1;
      if (reads > 1) units.set(name, n);
    }
  }
  return units;
}
const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
/** a program's units: three's prefix defines, the material's own, the expanded stages */
function programUnits(shader, material, programDefines) {
  const defines = { ...programDefines, ...(material.defines ?? {}) };
  const vs = preprocess(expand(shader.vertexShader), defines), fs = preprocess(expand(shader.fragmentShader), defines);
  const vertex = stageSamplers(vs.text, vs.env), fragment = stageSamplers(fs.text, fs.env);
  const all = new Map([...vertex, ...fragment]);
  return { vertex, fragment, fragmentUnits: sum(fragment), totalUnits: sum(all), vs: vs.text, fs: fs.text };
}

// ---- the program three builds for a standard material under the battle's rig (desktop high): four CSM cascades, the
// hemisphere light, the scene environment (a PMREM, cube UV), soft PCF shadows
const BATTLE_PROGRAM = {
  STANDARD: '', USE_ENVMAP: '', ENVMAP_TYPE_CUBE_UV: '', ENVMAP_MODE_REFLECTION: '', CUBEUV_TEXEL_WIDTH: '0.0013', CUBEUV_TEXEL_HEIGHT: '0.0010',
  CUBEUV_MAX_MIP: '8.0', USE_SHADOWMAP: '', SHADOWMAP_TYPE_PCF: '', NUM_DIR_LIGHTS: 4, NUM_POINT_LIGHTS: 0, NUM_SPOT_LIGHTS: 0,
  NUM_SPOT_LIGHT_COORDS: 0, NUM_SPOT_LIGHT_MAPS: 0, NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS: 0, NUM_RECT_AREA_LIGHTS: 0, NUM_HEMI_LIGHTS: 1,
  NUM_DIR_LIGHT_SHADOWS: 4, NUM_POINT_LIGHT_SHADOWS: 0, NUM_SPOT_LIGHT_SHADOWS: 0, NUM_LIGHT_PROBES: 0, NUM_CLIPPING_PLANES: 0,
  UNION_CLIPPING_PLANES: 0, USE_FOG: '', FOG_EXP2: '', DOUBLE_SIDED: undefined,
};
for (const k of Object.keys(BATTLE_PROGRAM)) if (BATTLE_PROGRAM[k] === undefined) delete BATTLE_PROGRAM[k];

// ---- 1. the counter on three's own standard program: the DFG LUT, the environment, the cascades
{
  const u = programUnits({ vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader },
    new THREE.MeshStandardMaterial(), BATTLE_PROGRAM);
  assert.ok(u.fragment.has('dfgLUT'), 'three r185\'s physical fragment reads its DFG LUT (the unit the include hid)');
  assert.equal(u.fragment.get('directionalShadowMap'), 4, 'the four cascades\' shadow maps');
  assert.ok(u.fragment.has('envMap'), 'the scene environment');
  assert.equal(u.fragmentUnits, 6, 'a bare standard material: the DFG LUT, the environment and the four cascades');
  assert.equal(u.vertex.size, 0, 'no vertex sampler without the cloud shade');
}

// ---- 2. the real terrain program: built by terrain.ts, registered through lighting.ts's setupShadowMaterial
const originals = { document: globalThis.document, Image: globalThis.Image, ImageData: globalThis.ImageData };
globalThis.ImageData = class { constructor(data) { this.data = data; } };
globalThis.Image = class { width = 8; height = 8; set src(value) { this.url = value; queueMicrotask(() => this.onload?.()); } };
globalThis.document = {
  createElement() {
    const canvas = { width: 0, height: 0 };
    const context = new Proxy({
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128) }),
      createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    }, { get(target, key) { return target[key] ?? (() => {}); } });
    canvas.getContext = () => context;
    return canvas;
  },
};
let terrainUnits = null, unswappedUnits = null;
try {
  const { buildTerrainMeshes, createLayout } = await import('../world/terrain.ts');
  await import('../world/maps/horizon.ts'); // installs the ring terrain meshes are built with (horizonRingHook.ts)
  const { getMapConfig } = await import('../world/maps/index.ts');
  const { createLighting } = await import('./lighting.ts');
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 4000);
  scene.environment = new THREE.Texture(); // the battle's PMREM stands in: the gate counts its unit
  const rig = createLighting(scene, camera, new THREE.Vector3(1, 2, 1).normalize());
  const config = getMapConfig('verdant');
  const field = { getHeightAt: () => 0, _layout: createLayout(config), _mesaW: null };
  const group = buildTerrainMeshes(field, { anisotropy: 4, setupShadowMaterial: (m, hook) => rig.setupShadowMaterial(m, hook) }, config);
  await group.userData.sourcedTexturesReady;
  const material = group.children.flatMap((c) => (c.isMesh ? [c.material].flat() : []))
    .find((m) => m?.userData?.sourcedTexturesReady === group.userData.sourcedTexturesReady);
  assert.ok(material, 'the terrain material');
  assert.equal(material.defines?.COT_CLOUD_SHADE, '', 'the terrain takes the cloud shade');
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, null);
  const defines = { ...BATTLE_PROGRAM, USE_CSM: '', CSM_CASCADES: rig.csm.lights.length, CSM_FADE: '' };
  terrainUnits = programUnits(shader, material, defines);
  // the PR head before the fix: the same program with three's DFG LUT put back in place of the fit (its gate passed the
  // terrain at "sixteen" and kept the cloud shade)
  const plain = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(plain, null);
  plain.fragmentShader = plain.fragmentShader.replace(/\nvec2 cotDfgApprox\([\s\S]*?\n}\n/, '\nuniform sampler2D dfgLUT;\n')
    .replace(/cotDfgApprox\( ([^,()]+), ([^,()]+) \)/g, 'texture2D( dfgLUT, vec2( $1, $2 ) ).rg');
  unswappedUnits = programUnits(plain, material, defines);
} finally {
  Object.assign(globalThis, originals);
}

// ---- 3. the terrain within the budget, its cloud shade on
assert.ok(terrainUnits.vertex.has('tCotCloudShade'), 'the cloud shade\'s vertex fetch is active');
assert.ok(/vCotCloudSun/.test(terrainUnits.fs), 'and its varying reaches the fragment');
assert.equal(terrainUnits.fragment.size >= 10 + 2, true, 'the ten layer samplers and more');
assert.ok(terrainUnits.fragmentUnits <= 16, `the fragment stage ${terrainUnits.fragmentUnits} ≤ 16`);
assert.ok(terrainUnits.totalUnits <= 16, `the program ${terrainUnits.totalUnits} units ≤ 16 (three warns past it on every bind)`);
assert.ok(!terrainUnits.fragment.has('dfgLUT'), 'the terrain\'s DFG LUT traded for the analytic fit');
// ---- 4. the counter catches the PR head: the same program with the DFG LUT is the seventeenth unit
assert.ok(unswappedUnits.fragment.has('dfgLUT'), 'the PR head\'s terrain reads the DFG LUT');
assert.equal(unswappedUnits.totalUnits, terrainUnits.totalUnits + 1, 'one unit more');
assert.ok(unswappedUnits.totalUnits > 16, `the PR head's terrain program at ${unswappedUnits.totalUnits} units: over the budget`);

console.log(`textureUnits.selftest: counted on the expanded program — a standard material 6 fragment units (the DFG LUT, the environment, four cascades); the terrain ${terrainUnits.fragmentUnits} fragment + ${terrainUnits.totalUnits - terrainUnits.fragmentUnits} vertex = ${terrainUnits.totalUnits} units with its cloud shade on (the PR head's ${unswappedUnits.totalUnits}) PASS`);
