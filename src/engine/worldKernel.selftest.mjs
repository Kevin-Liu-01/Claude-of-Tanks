import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  WORLD_KERNEL_MANIFEST, WORLD_KERNEL_WASM, worldKernelArtifactIdentity,
} from '../../tools/world-kernel-identity.mjs';
import { installSimplexKernel, SimplexNoise } from './simplexFast.ts';
import {
  WORLD_KERNEL_ABI, WORLD_KERNEL_FLAG, createWorldKernel, installWorldKernel, worldKernelMatchesJavaScript,
} from './worldKernel.ts';
import { mulberry32 } from '../game/stateCore.ts';
import { getMapConfig } from '../world/maps/index.ts';
import { createHeightField } from '../world/terrain.ts';

// The opt-in Rust/WebAssembly world kernel (wasm/world-kernel, loaded by engine/worldKernel.ts behind ?wasm=world)
// must be the JavaScript noise to the bit: world heights are authoritative. This receipt holds the COMMITTED binary
// to (1) its sources, (2) simplexFast.ts on random, edge-case and non-finite inputs, (3) whole battlefields built
// with and without it, and (4) the opt-in and fallback contracts. It needs no Rust toolchain.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const bytes = readFileSync(new URL(`../../${WORLD_KERNEL_WASM}`, import.meta.url));

// ---- 1. the committed binary is the build of the committed sources --------------------------------------------
const manifest = JSON.parse(readFileSync(new URL(`../../${WORLD_KERNEL_MANIFEST}`, import.meta.url), 'utf8'));
const identity = worldKernelArtifactIdentity(ROOT);
assert.equal(manifest.sourceSha256, identity.sourceSha256,
  'wasm/world-kernel sources changed since the binary was built: run npm run wasm:world-kernel and commit pkg/');
assert.deepEqual({ bytes: manifest.bytes, sha256: manifest.sha256, abi: manifest.abi },
  { bytes: identity.bytes, sha256: identity.sha256, abi: identity.abi }, 'pkg/cot_world_kernel.wasm matches its manifest');
assert.equal(identity.abi, WORLD_KERNEL_ABI, 'the loader and the crate agree on the ABI');
assert.ok(bytes.length < 16 * 1024, `the kernel stays small (${bytes.length} B)`);

const module = await WebAssembly.compile(bytes);
assert.deepEqual(WebAssembly.Module.imports(module), [], 'the kernel imports nothing');
assert.deepEqual(WebAssembly.Module.exports(module).map((entry) => `${entry.name}:${entry.kind}`).sort(),
  ['cot_abi:function', 'cot_noise2:function', 'cot_noise3:function', 'cot_noise4:function', 'cot_tables:function',
    'memory:memory']);
const probe = new WebAssembly.Instance(module, {});
assert.equal(probe.exports.memory.buffer.byteLength, 65536, 'one 64 KiB page per noise table');

// ---- 2. bit-exact against simplexFast.ts -------------------------------------------------------------------
const tablesOf = (noise) => [noise._perm, noise._pm12, noise._pm32];
const plainKernel = createWorldKernel(module);
const special = [0, -0, 0.5, -0.5, 1e-310, -1e-310, 2 ** 31 - 0.5, -(2 ** 31) - 0.5, 2 ** 31, -(2 ** 31), 2 ** 32 + 7,
  2 ** 52 + 1, -(2 ** 53), 2 ** 63, -(2 ** 63), 2 ** 64 * 3, 1e20, -1e20, 1e300, -1e300, Infinity, -Infinity, Number.NaN];
let compared = 0;
// Tables from the battlefield's own seeds (terrain, mask, shader-noise twins) and the plain LCG sequence.
for (const seed of [(1337 ^ 0x9e3779b9) >>> 0, 3010, 3011, 2002, 1]) {
  const js = new SimplexNoise({ random: mulberry32(seed) });
  const wasm = plainKernel.bind(...tablesOf(js));
  assert.ok(wasm, `seed ${seed}: the kernel binds a valid table`);
  const rng = mulberry32(seed ^ 0x5bd1e995);
  const same = (a, b, what) => {
    compared++;
    if (!Object.is(a, b)) assert.fail(`seed ${seed}: ${what} differs (${a} vs ${b})`);
  };
  for (let i = 0; i < 60000; i++) {
    const x = (rng() - 0.5) * 2400, y = (rng() - 0.5) * 2400, z = (rng() - 0.5) * 300, w = (rng() - 0.5) * 300;
    same(wasm.noise(x, y), js.noise(x, y), `noise(${x}, ${y})`);
    if (i % 4 === 0) same(wasm.noise3d(x, y, z), js.noise3d(x, y, z), `noise3d(${x}, ${y}, ${z})`);
    if (i % 4 === 1) same(wasm.noise4d(x, y, z, w), js.noise4d(x, y, z, w), `noise4d(${x}, ${y}, ${z}, ${w})`);
  }
  for (const a of special) {
    for (const b of special) {
      same(wasm.noise(a, b), js.noise(a, b), `noise(${a}, ${b})`);
      same(wasm.noise3d(a, b, a), js.noise3d(a, b, a), `noise3d(${a}, ${b}, ${a})`);
      same(wasm.noise4d(b, a, b, a), js.noise4d(b, a, b, a), `noise4d(${b}, ${a}, ${b}, ${a})`);
    }
  }
}
assert.ok(worldKernelMatchesJavaScript(plainKernel), 'the install-time self-check passes on the committed binary');
// Tables the masks could misread are refused, and the instance keeps its JavaScript methods.
const outOfRange = new SimplexNoise({ random: () => 0.9999999 });
const broken = tablesOf(outOfRange).map((table) => table.slice());
broken[0][7] = 256;
assert.equal(plainKernel.bind(...broken), null, 'a table entry outside 0..255 is never bound');

// ---- 3. whole battlefields: identical with and without the kernel ------------------------------------------
const receipt = { installed: true, reason: null, bytes: bytes.length, fetchMs: 0, compileMs: 0, checkMs: 0, instances: 0 };
const kernel = createWorldKernel(module, receipt);
function surveyField(field) {
  const out = new Float64Array(0x4000);
  let n = 0;
  for (let j = 0; j <= 80; j++) {
    for (let i = 0; i <= 80; i++) {
      const x = -530 + i * 13.25 + (j % 3) * 0.37, z = -530 + j * 13.25 - (i % 5) * 0.29;
      out[n++] = field.getHeightAt(x, z);
      if ((i + j) % 7 === 0) {
        const normal = field.getNormalAt(x, z);
        out[n++] = normal.x; out[n++] = normal.y; out[n++] = normal.z;
        out[n++] = field.getWaterMaskAt(x, z);
      }
    }
  }
  return out.subarray(0, n);
}
for (const mapId of ['verdant', 'steppe', 'desert', 'coastal', 'whiteout', 'mars']) {
  const config = getMapConfig(mapId);
  installSimplexKernel(null);
  const reference = surveyField(createHeightField(1337, config));
  installSimplexKernel(kernel);
  const before = receipt.instances;
  const accelerated = surveyField(createHeightField(1337, config));
  installSimplexKernel(null);
  assert.ok(receipt.instances > before, `${mapId}: the height field's noise really ran in the kernel`);
  assert.equal(accelerated.length, reference.length);
  for (let k = 0; k < reference.length; k++) {
    if (!Object.is(accelerated[k], reference[k])) assert.fail(`${mapId}: survey value ${k} differs (${accelerated[k]} vs ${reference[k]})`);
  }
  compared += reference.length;
}

// ---- 4. opt-in, installation and fallback contracts ---------------------------------------------------------
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const optIn = /loadModule: \(\) => \(\/(.+?)\/\.test\(location\.search\)\s*\? import\('\.\/engine\/worldKernel\.ts'\)\.then\(\(kernel\) => kernel\.installWorldKernel\(\), \(\) => null\)\s*\.then\(\(\) => import\('\.\/world\/map\.ts'\)\)\s*: import\('\.\/world\/map\.ts'\)\),/.exec(main);
assert.ok(optIn, 'main.ts installs the kernel only behind the flag, before the world module, with map.ts on both paths');
assert.equal(optIn[1], WORLD_KERNEL_FLAG.source, 'main.ts tests the same opt-in flag the loader exports');
assert.doesNotMatch(main, /^import[^;]*worldKernel/m, 'the kernel loader never joins the boot graph statically');
for (const [search, on] of [['?wasm=world', true], ['?tier=desktop&wasm=world', true], ['?wasm=world&debug=1', true],
  ['?wasm=worlds', false], ['?xwasm=world', false], ['', false], ['?gpu=wgpu', false]]) {
  assert.equal(WORLD_KERNEL_FLAG.test(search), on, `flag ${JSON.stringify(search)}`);
}

// A failing load (corrupt bytes) installs nothing: new tables keep the JavaScript methods.
const failing = await import(`./worldKernel.ts?receipt=failing`);
const failed = await failing.installWorldKernel({ readBytes: async () => new Uint8Array([0, 97, 115, 109, 9, 9]) });
assert.equal(failed.installed, false);
assert.match(failed.reason, /\S/);
assert.equal(new SimplexNoise({ random: mulberry32(9) }).noise, SimplexNoise.prototype.noise,
  'after a failed load the JavaScript noise stays in place');
// The real load: fetch → compile → self-check → install, once; later tables bind to fresh instances.
const installed = await installWorldKernel({ readBytes: async () => bytes });
assert.equal(installed.installed, true, `installed (${installed.reason})`);
assert.equal(installed.bytes, bytes.length);
assert.equal(await installWorldKernel(), installed, 'installation happens once');
const bound = new SimplexNoise({ random: mulberry32(11) });
const plain = (() => { installSimplexKernel(null); return new SimplexNoise({ random: mulberry32(11) }); })();
assert.notEqual(bound.noise, SimplexNoise.prototype.noise, 'an installed kernel replaces the methods of new tables');
assert.equal(installed.instances, 1, 'one kernel instance per table bound after installation');
assert.ok(Object.is(bound.noise(12.5, -40.25), plain.noise(12.5, -40.25)));

console.log(`worldKernel.selftest: ${bytes.length} B kernel, ${compared.toLocaleString('en-US')} values bit-identical `
  + 'to simplexFast (random, edge-case, six battlefields); opt-in and fallback contracts hold');
