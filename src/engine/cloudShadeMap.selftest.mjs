// cloudShadeMap.selftest — the clouds' shadows by one path (2026-10-03, the skies-and-atmosphere lane; the ground lane
// traced the gauntlet's stipple, arcs, weave and checkerboard to the cascade gobos' dithered depth under the PCF taps).
// Pinned: the map (the field and core every consumer cut, undithered, snapped and scheduled, published to the shared
// uniforms and dropped when the clouds cast none); the lookup (GLSL and CPU twin: up the sun's ray to the base, the
// edge and low-sun fades); the chunk patches every CSM material compiles (the vertex fetch, the varying, the sun
// cascades' light and cotSunVis); the material hook (the define off the phone tier, the opt-out, the custom shaders'
// opt-in, the shared uniforms, the sampler budget); and that no gobo, no far pass and no second shade path remain.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  CLOUD_SHADE_EDGE_FADE, CLOUD_SHADE_PARS_GLSL, CLOUD_SHADE_SAMPLER_BUDGET, CLOUD_SHADE_SUN_FADE, attachCloudShadeUniforms,
  cloudShadeSamplerCount, cloudSunShareAt, createCloudShadeUniforms, publishCloudShade,
} from './cloudShadeMap.ts';
import { CLOUD_FAR_SHADE_EVERY, CLOUD_FAR_SHADE_SIZE, CLOUD_FAR_SHADE_SPAN_M, CLOUD_SHADOW_CORE } from './volumetricClouds.ts';

const here = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const clouds = here('./volumetricClouds.ts'), lighting = here('./lighting.ts'), post = here('./post.ts');
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);

// ---- the map: the clouds' shade at the base, undithered, world-anchored, on a schedule
assert.ok(CLOUD_SHADOW_CORE > 0.4 && CLOUD_SHADOW_CORE < 0.9, 'a cloud core takes most of the sun, never all of it');
const texel = CLOUD_FAR_SHADE_SPAN_M / CLOUD_FAR_SHADE_SIZE;
assert.ok(texel <= 30, `a texel (${texel.toFixed(1)} m) under a cumulus shadow's soft edge`);
assert.ok(CLOUD_FAR_SHADE_SPAN_M / 2 >= 3300, 'the square reaches the ring and the far range (3.3 km)');
assert.ok(CLOUD_FAR_SHADE_EVERY * 12 / 60 < texel / 4, 'between refreshes a strong wind moves the field well under a texel');
const law = 'float shade = uShadeLook.x * smoothstep( uThreshold + uShadeLook.y - uShadeLook.z, uThreshold + uShadeLook.y + uShadeLook.z, cloudField(';
assert.equal(clouds.split(law).length - 1, 1, 'one cut of the shared field, in the map alone');
// (2026-10-05: the core, the cut's shift and its half-width through the QA hook — the defaults the constant law's)
assert.match(clouds, /uShadeLook: \{ value: new THREE\.Vector3\(CLOUD_SHADOW_CORE, 0, 0\.08\) \},/);
// (2026-10-05: a stratiform deck with gaps casts its cells too — a thick cell's core, by the deck's openness)
assert.match(clouds, /const core = preset\.shadow \? lightTune\('CLOUD_SHADOW_CORE', CLOUD_SHADOW_CORE\) : lightTune\('CLOUD_DECK_SHADOW_CORE', CLOUD_LAYER_RULES\.deckShadowCore\);\s*const pattern = preset\.shadow \? preset\.shadowPattern : preset\.shadowPattern \* \(lightTune\('DECK_PATTERN', 1\) > 0 \? 1 : 0\);\s*\(this\.farShadeMaterial\.uniforms\.uShadeLook\.value as THREE\.Vector3\)\.set\(core \* pattern,\s*lightTune\('CLOUD_SHADOW_SHIFT', 0\), lightTune\('CLOUD_SHADOW_SOFT', 0\.08\)\);/);
assert.match(clouds, /if \(!\(preset\.shadowPattern > 0\) \|\| preset\.coverage <= 0\) \{ this\.dropCloudShade\(\); return; \}/, 'a deck that casts no pattern publishes none');
assert.match(clouds, /const FAR_SHADE_FRAGMENT = \/\* glsl \*\/`\nprecision highp float;\n\$\{CLOUD_FIELD_GLSL\}/, 'the map reads the shared field GLSL');
assert.match(clouds, /gl_FragColor = vec4\( shade, 0\.0, 0\.0, 1\.0 \);/, 'undithered: the shade itself, no discard');
assert.match(clouds, /if \( uClear\.z > 0\.0 \) shade \*= smoothstep\( uClear\.z \* 0\.6, uClear\.z \* 1\.4, length\( xz - uClear\.xy \) \);/, 'a front keeps its clear radius');
assert.match(clouds, /const cx = Math\.round\(this\.cam\.pos\.x \/ texel\) \* texel, cz = Math\.round\(this\.cam\.pos\.z \/ texel\) \* texel;/, 'snapped: the shadows never swim');
assert.match(clouds, /if \(!moved && \+\+this\.farShadeAge < CLOUD_FAR_SHADE_EVERY\) return;/, 'a refresh when the square moves, else on the schedule');
// (2026-10-05: the publish gate is the pattern's share — pinned above)
assert.match(clouds, /publishCloudShade\(shared, this\.farShadeInfo as \{ texture: THREE\.Texture; rect: THREE\.Vector3; baseM: number \},\s*this\.traceMaterial\.uniforms\.uSunDir\.value as THREE\.Vector3\);/,
  'published to the lit materials when the map is refreshed (one frame: map and square agree)');
assert.match(clouds, /const shared = this\.scene\.userData\.cloudShadeUniforms as CloudShadeUniforms \| undefined;/, 'the scene\'s shared uniforms (lighting.ts)');
assert.equal(clouds.split('this.dropCloudShade();').length - 1, 3, 'dropped when the layer stops, when the clouds cast none and on dispose');
// (2026-10-05: a deck with gaps casts its cells — the pattern's share, CloudLayerPreset.shadowPattern)
assert.match(clouds, /get shadowsActive\(\): boolean \{\s*return this\.active && \(this\.preset\?\.shadowPattern \?\? 0\) > 0 && \(this\.preset\?\.coverage \?\? 0\) > 0;/, 'the shadows are the map\'s (the ring\'s horizon shade follows it)');

// ---- no gobo, no far pass, no second path
for (const gone of ['GOBO_FRAGMENT', 'GOBO_VERTEX', 'customDepthMaterial', 'uShadowCellOrigin', 'attachShadowCascades', 'markShadowOnly']) {
  assert.ok(!clouds.includes(gone), `no cascade gobo (${gone})`);
}
assert.ok(!here('../main.ts').includes('attachShadowCascades') && !here('./sky.ts').includes('attachShadowCascades'), 'nothing hands the cascades to the clouds');
for (const gone of ['tFarShade', 'uFarShade', 'FAR_CLOUD_SHADE']) assert.ok(!post.includes(gone), `no far pass in the aerial shader (${gone})`);

// ---- the lookup: up the sun's ray to the cloud base, the map's square, the fades
const g = CLOUD_SHADE_PARS_GLSL;
assert.match(g, /vec2 p = wp\.xz \+ uCotCloudSun\.xz \* \( \( uCotCloudSun\.w - wp\.y \) \/ uCotCloudSun\.y \);/, 'the point the sun\'s ray crosses the base');
assert.match(g, /vec2 uv = \( p - uCotCloudShade\.xy \) \* uCotCloudShade\.z \+ 0\.5;/, 'in the map\'s square');
assert.match(g, /float shade = textureLod\( tCotCloudShade, uv, 0\.0 \)\.r;/, 'an explicit level (the vertex stage has no derivatives)');
assert.match(g, /if \( uCotCloudShade\.w < 0\.5 \|\| uCotCloudSun\.y < 0\.03 \) return 1\.0;/, 'off, or a grazing sun: full sun');
assert.match(g, /if \( edge >= 1\.0 \) return 1\.0;/, 'outside the square: full sun');
assert.ok(CLOUD_SHADE_EDGE_FADE > 0.6 && CLOUD_SHADE_EDGE_FADE < 0.95 && CLOUD_SHADE_SUN_FADE[0] < CLOUD_SHADE_SUN_FADE[1]);
{
  // the CPU twin over a synthetic map: a cloud core at the square's centre (in base-plane coordinates)
  const rect = { x: 100, y: -40, z: CLOUD_FAR_SHADE_SPAN_M }, base = 1400;
  const coreAt = (u, v) => (Math.hypot(u - 0.5, v - 0.5) < 0.01 ? CLOUD_SHADOW_CORE : 0);
  const sun = new THREE.Vector3(0.3, 0.8, 0.2).normalize();
  // the ground point under the core along the sun: the core sits at the base over (100, -40)
  const ground = { x: 100 - sun.x * (base / sun.y), y: 0, z: -40 - sun.z * (base / sun.y) };
  near(cloudSunShareAt(ground, rect, base, sun, coreAt), 1 - CLOUD_SHADOW_CORE, 1e-9, 'the ground the core shades keeps 1 - core');
  near(cloudSunShareAt({ x: 100, y: 0, z: -40 }, rect, base, sun, coreAt), 1, 1e-9, 'the ground straight under the core is lit (the sun is slanted)');
  near(cloudSunShareAt(ground, rect, base, { x: 0.999, y: 0.02, z: 0 }, () => CLOUD_SHADOW_CORE), 1, 1e-9, 'a grazing sun: no cloud shade');
  near(cloudSunShareAt({ x: rect.x + rect.z, y: 0, z: rect.y }, rect, base, { x: 0, y: 1, z: 0 }, () => CLOUD_SHADOW_CORE), 1, 1e-9, 'outside the square');
  const edge = cloudSunShareAt({ x: rect.x + rect.z * 0.49, y: 0, z: rect.y }, rect, base, { x: 0, y: 1, z: 0 }, () => CLOUD_SHADOW_CORE);
  assert.ok(edge > 1 - CLOUD_SHADOW_CORE && edge < 1, `faded near the square's edge (${edge.toFixed(3)})`);
}
{
  const u = createCloudShadeUniforms();
  assert.equal(u.uCotCloudShade.value.w, 0, 'off until the clouds publish');
  const tex = new THREE.Texture();
  publishCloudShade(u, { texture: tex, rect: new THREE.Vector3(10, 20, 12000), baseM: 1500 }, new THREE.Vector3(0, 1, 0));
  assert.deepEqual([u.tCotCloudShade.value, ...u.uCotCloudShade.value.toArray(), u.uCotCloudSun.value.w], [tex, 10, 20, 1 / 12000, 1, 1500]);
  publishCloudShade(u, null, new THREE.Vector3(0, 1, 0));
  assert.equal(u.uCotCloudShade.value.w, 0, 'dropped');
  const shader = { uniforms: {} };
  attachCloudShadeUniforms(shader, u);
  assert.strictEqual(shader.uniforms.uCotCloudShade, u.uCotCloudShade, 'by reference: one update reaches every material');
}

// ---- the chunks every CSM material compiles
assert.match(lighting, /THREE\.ShaderChunk\.shadowmap_pars_vertex = `\$\{THREE\.ShaderChunk\.shadowmap_pars_vertex\}\n#if defined\( COT_CLOUD_SHADE \) && defined\( USE_SHADOWMAP \)\n\$\{CLOUD_SHADE_PARS_GLSL\}\nvarying float vCotCloudSun;\n#endif`;/,
  'the vertex stage declares the lookup and the varying');
assert.match(lighting, /THREE\.ShaderChunk\.shadowmap_vertex = `\$\{THREE\.ShaderChunk\.shadowmap_vertex\}\n#if defined\( COT_CLOUD_SHADE \) && defined\( USE_SHADOWMAP \)\n\tvCotCloudSun = cotCloudSun\( worldPosition\.xyz \);\n#endif`;/,
  'one fetch per vertex, after the shadow coordinates (appended: the chunk\'s own lines stay for the copies the terrain and the grass make)');
assert.match(lighting, /#if defined\( COT_CLOUD_SHADE \) && defined\( USE_SHADOWMAP \)\nvarying float vCotCloudSun;\n#endif\n\$\{THREE\.ShaderChunk\.lights_pars_begin\}/, 'the fragment\'s varying');
assert.match(lighting, /const COT_CLOUD_SUN_GLSL = `#if defined\( COT_CLOUD_SHADE \) && defined\( USE_SHADOWMAP \)\n\t+directLight\.color \*= vCotCloudSun;\n#endif`;/, 'the sun cascade\'s light takes the share');
assert.match(lighting, /frag = frag\.replace\(fadePrevAnchor, `\$\{COT_CLOUD_SUN_GLSL\}\n\t+\$\{fadePrevAnchor\}`\);/, 'before the shadow, on the fade path');
assert.match(lighting, /frag = frag\.replace\(noFadeAnchor, `\$\{COT_CLOUD_SUN_GLSL\}\n\t+cotPrev = directLight\.color;/, 'and on the plain path');
assert.match(lighting, /#if defined\( COT_CLOUD_SHADE \) && defined\( USE_SHADOWMAP \)\n\tcotSunVis \*= vCotCloudSun;\n\t#endif\n[\s\S]{0,700}float cotAmbVis = cotSunVis;[\s\S]{0,700}vec3 cotAmbDim = mix\( uCotShadowDim, vec3\( 1\.0 \), cotAmbVis \);/,
  'the sun visibility takes the cloud (the scene alpha, the contact shadows\' sun share, the shadowed ambient dim)');
{
  // the patched chunks really carry the code (CSM installs its own lights chunks; lighting.ts patches them once)
  const { createLighting } = await import('./lighting.ts');
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 4000);
  const rig = createLighting(scene, camera, new THREE.Vector3(1, 2, 1).normalize());
  try {
    const C = THREE.ShaderChunk;
    assert.ok(C.shadowmap_vertex.includes('vCotCloudSun = cotCloudSun( worldPosition.xyz );'), 'the vertex fetch is in the chunk');
    assert.ok(C.shadowmap_vertex.includes('shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias'), 'the chunk\'s own lines stay (the terrain\'s copy anchors on them)');
    assert.ok(C.shadowmap_pars_vertex.includes('uniform sampler2D tCotCloudShade;'));
    assert.equal(C.lights_fragment_begin.split('directLight.color *= vCotCloudSun;').length - 1, 2, 'both CSM paths shade the sun cascades');
    assert.ok(C.lights_fragment_end.includes('cotSunVis *= vCotCloudSun;'));
    assert.strictEqual(scene.userData.cloudShadeUniforms?.uCotCloudShade?.value?.isVector4, true, 'the scene carries the shared uniforms');
    // the material hook: the define, the shared uniforms, the budget
    const shared = scene.userData.cloudShadeUniforms;
    // (the material's real ShaderLib sources, as three hands them to onBeforeCompile: the physical fragment declares five
    // standard maps inline under their #ifdefs — counted, they took the terrain's cloud shade away in the ground lane's lab)
    const libOf = (mat) => (mat.isMeshStandardMaterial ? THREE.ShaderLib.standard : mat.isMeshLambertMaterial ? THREE.ShaderLib.lambert : { vertexShader: '#include <common>\nvoid main() {}', fragmentShader: '#include <common>\nvoid main() {}' });
    const compile = (mat, extra) => {
      rig.setupShadowMaterial(mat, extra ?? null);
      const lib = libOf(mat);
      const shader = { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
      mat.onBeforeCompile(shader, null);
      return shader;
    };
    assert.equal(cloudShadeSamplerCount({ vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader },
      new THREE.MeshStandardMaterial(), 4, false), 4, 'a bare standard material: the cascades alone (the inline standard maps cost nothing unset)');
    assert.equal(cloudShadeSamplerCount({ vertexShader: '', fragmentShader: THREE.ShaderLib.standard.fragmentShader },
      new THREE.MeshPhysicalMaterial({ sheenColorMap: new THREE.Texture() }), 4, false), 5, 'a set inline map counts once');
    const plain = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    const s1 = compile(plain);
    assert.equal(plain.defines.COT_CLOUD_SHADE, '', 'a desktop CSM material takes the define');
    assert.strictEqual(s1.uniforms.tCotCloudShade, shared.tCotCloudShade, 'and the shared uniforms');
    assert.ok(!s1.vertexShader.startsWith('#undef COT_CLOUD_SHADE'), 'within the budget');
    const optOut = new THREE.MeshStandardMaterial(); optOut.userData.cotCloudShade = false;
    compile(optOut);
    assert.equal(optOut.defines?.COT_CLOUD_SHADE, undefined, 'a material that writes the varying itself opts out');
    const custom = new THREE.ShaderMaterial({ lights: true });
    compile(custom);
    assert.equal(custom.defines?.COT_CLOUD_SHADE, undefined, 'a custom shader opts in explicitly (its chunks must carry the varying both ways)');
    // the terrain's program: ten samplers of its own, the cascades and the scene environment: the map makes sixteen
    const terrainLike = new THREE.MeshStandardMaterial();
    const s2 = compile(terrainLike, (shader) => {
      shader.fragmentShader = 'uniform sampler2D uAlbG, uAlbD, uAlbR, uAlbM;\nuniform sampler2D uNrmG, uNrmD, uNrmR, uNrmM;\nuniform sampler2D uMask, uNoise;\n' + shader.fragmentShader;
    });
    const cascades = rig.csm.lights.length;
    assert.equal(cloudShadeSamplerCount(s2, terrainLike, cascades, true), 10 + cascades + 1, 'ten, the cascades and the environment (the physical fragment\'s inline maps skipped)');
    assert.equal(cascades, 4, 'four desktop cascades: the terrain\'s fifteen plus the map is the budget exactly (a fifth cascade drops the terrain\'s cloud shade: revisit the budget first)');
    assert.ok(!s2.vertexShader.startsWith('#undef COT_CLOUD_SHADE'), 'the terrain keeps its cloud shade (no scene environment yet in this fixture: fourteen + 1)');
    const crowded = new THREE.MeshStandardMaterial();
    const s3 = compile(crowded, (shader) => {
      shader.fragmentShader = `uniform sampler2D ${Array.from({ length: 12 }, (_, i) => `uX${i}`).join(', ')};\n` + shader.fragmentShader;
    });
    assert.ok(s3.vertexShader.startsWith('#undef COT_CLOUD_SHADE\n') && s3.fragmentShader.startsWith('#undef COT_CLOUD_SHADE\n'),
      `a program past ${CLOUD_SHADE_SAMPLER_BUDGET} samplers with the map keeps no cloud shade (no per-draw unit warning)`);
  } finally {
    rig.dispose?.();
  }
}
assert.match(lighting, /const cloudShadeOn = !mobileTier;/, 'phones take no define (their tier has no volumetric layer)');

// (2026-10-05, the gauntlet's wave 93 on Whiteout: "soft dark-grey blotches ... cloud shadows that a solid overcast cannot
// cast") the aerial pass's world-anchored patchiness follows no cloud: it fades with the light model's overcast
assert.match(post, /aerial\.uniforms\.uCloudShade\.value = \(scene\.userData\.cloudShadeAmp \?\? CLOUD_SHADE_DEFAULT\)\s*\* \(1 - Math\.min\(1, Math\.max\(0, \(scene\.userData\.lightModel as \{ overcast\?: number \} \| undefined\)\?\.overcast \?\? 0\)\)\);/,
  'none under a closed deck, the whole under an open sky');

console.log(`cloudShadeMap.selftest: one undithered ${CLOUD_FAR_SHADE_SIZE}² map over ${CLOUD_FAR_SHADE_SPAN_M / 1000} km (a ${texel.toFixed(1)} m texel), the lookup and its twin, the CSM chunks, the material hook and its ${CLOUD_SHADE_SAMPLER_BUDGET}-sampler budget, no gobo and no far pass PASS`);
