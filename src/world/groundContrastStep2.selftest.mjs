import assert from 'node:assert/strict';
import { terrainSourceText } from './terrainSourceText.mjs'; // (terrain.ts with roadSurfaceShader.ts's road chunks in place)

// Ground lane (2026-10-05, the local-contrast program, step 2): the ground's mid-scale contrast (the skies lane's metric:
// the std of log luminance against its 25 px mean, ground below the skyline) read 0.17–0.42 on the game's frames against
// photographs' 0.5–1.25; on the game's renderer, one loss at a time, the detail normal at twice its strength and the mid
// dapple at twice its scale were the strongest ground terms, the far variant's kept variance a poor third (its shimmer). Pins:
// (b') the detail normal's gain from ~20 m to ~300 m, none beside the camera, on a field or where the steep-face
// attenuation holds it; (b'') the dapple's gain on a vegetated map's sward only. No GPU or art claim.

const source = terrainSourceText().replace(/\s+/g, ' ');
const has = (line) => assert.ok(source.includes(line.replace(/\s+/g, ' ')), `the material: ${line}`);
const num = (name) => { const m = new RegExp(`#define ${name} ([0-9.]+)`).exec(source); assert.ok(m, `${name} is defined`); return Number(m[1]); };

// (b')
const dkGain = num('DK_RANGE_GAIN');
assert.ok(dkGain > 0 && dkGain <= 1.5, `the range gain (${dkGain}) raises the relief and stays under ×2.5`);
has('dk *= 1.0 + DK_RANGE_GAIN * smoothstep(18.0, 45.0, camDk) * (1.0 - smoothstep(300.0, 600.0, camDk)) * (1.0 - clamp(gSplatSteepAtt / 0.62, 0.0, 1.0)) * (1.0 - max(gCropW, gSoilW));');
// (item 31, the map revival, 2026-10-11: the detail normal's base strength is the map's splat.detailNormal, uDetailGain,
// 1 on every map but Earthrise Basin's softened regolith)
has('float dk = uDetailGain * (1.0 - max(gSplatFar * 0.62, gSplatSteepAtt));');
has('shader.uniforms.uDetailGain = { value: S.detailNormal ?? 1 };');
// (b'')
const swardGain = num('MID_SWARD_GAIN');
assert.ok(swardGain > 0 && swardGain <= 1.5, `the sward's dapple gain (${swardGain})`);
// (264b, the critics' pocked and smeared meadows) the gain stays in the sward's tone; its relief is cut to
// SWARD_DAP_RELIEF and fades as the view grazes the flat sward (groundTrainIrregularity pins the cut)
has('float vegSward = meadowG * vegGround;');
has('float swardGain = 1.0 + MID_SWARD_GAIN * vegSward;');
has('n.xy -= (ga * 1.1 * dapField + gb * 1.55) * dMid * uMidRelief * dapG * swardRelief * (1.0 - fMs) * midGraze;');
has('* uMidRelief * dapG * swardGain * (1.0 - fMs) * dapField;');
console.log(`groundContrastStep2: (b') the detail normal ×${(1 + dkGain).toFixed(2)} from 20 to 300 m, (b'') the sward's dapple tone ×${(1 + swardGain).toFixed(2)} on vegetated maps PASS; no GPU/art claim`);
