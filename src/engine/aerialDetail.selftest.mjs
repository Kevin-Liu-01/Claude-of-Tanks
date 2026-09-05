import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
const scalar = (name) => {
  const match = source.match(new RegExp(`const ${name} = ([\\d.]+);`));
  assert.ok(match, `read the actual ${name} shader policy`);
  return Number(match[1]);
};
const fovLimit = scalar('AERIAL_DETAIL_FOV');
const near = scalar('AERIAL_DETAIL_NEAR'), far = scalar('AERIAL_DETAIL_FAR');
const floor = scalar('AERIAL_DETAIL_ARCADE');
const floorNear = scalar('AERIAL_DETAIL_ARCADE_NEAR'), floorFar = scalar('AERIAL_DETAIL_ARCADE_FAR');
assert.deepEqual([fovLimit, near, far, floor, floorNear, floorFar], [20, 90, 320, 0.55, 430, 950],
  'volumetric detail preserves every legacy arcade/scope weight and distance');
assert.equal(scalar('AERIAL_DETAIL_AMP'), 0.34, 'surface-detail strength is unchanged');
assert.match(source, /\(AERIAL_DETAIL_FOV - camera\.fov\) \/ \(AERIAL_DETAIL_FOV - 8\)/,
  'the existing scope uniform API and zoom response are unchanged');
assert.match(source, /if \( dw > 0\.003 \) \{/,
  'restore useful arcade far detail with the corrected volumetric coordinates');
assert.doesNotMatch(source, /uDetailW > 0\.0 && dw > 0\.003/,
  'the temporary arcade-off A/B must not ship');
assert.match(source, /float dw = max\( dwS, \$\{AERIAL_DETAIL_ARCADE\.toFixed\(2\)\}/,
  'partially zoomed scopes retain their original far-field detail floor');
const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
for (const fov of [70, 60, 48, 30, 20, 19, 15, 12, 8, 5]) {
  const scope = clamp((fovLimit - fov) / (fovLimit - 8));
  for (const distance of [0, 60, 90, 220, 320, 500, 950, 1800, 3000]) {
    const legacyWeight = Math.max(scope * smooth(near, far, distance),
      floor * smooth(floorNear, floorFar, distance));
    const fineWeight = scope * smooth(near, far, distance);
    if (fov >= fovLimit) assert.equal(fineWeight, 0,
      'arcade never needs the finest octave');
    // Once noise values are supplied, skipping a zero-weight evaluation must
    // not change the modulation envelope, including partially zoomed scopes.
    for (const fineSample of [0, 0.23, 0.5, 0.87, 1]) {
      const coarse = 0.21 * 0.42 + 0.73 * 0.28 + 0.48 * 0.17;
      const fine = (fineSample - 0.5) * 0.13 * fineWeight / Math.max(legacyWeight, 1e-3);
      const legacyNoise = coarse + fine + 0.065;
      const candidateNoise = coarse + 0.065 + (fineWeight > 0 ? fine : 0);
      assert.ok(Math.abs(candidateNoise - legacyNoise) < 1e-14,
        'skip-zero evaluation preserves arcade/scope amplitude and centering');
    }
  }
}

const detail = source.slice(source.indexOf('float dwS ='), source.indexOf('// pre-tonemap emissive shoulder'));
assert.doesNotMatch(detail, /vec2 dp|vnoise\(|texture2D|dFdx|dFdy/,
  'no singular projection, added texture fetches, or derivatives inside a divergent depth branch');
assert.equal((detail.match(/vnoise3\(/g) || []).length, 4, 'only the original four detail octaves');
assert.match(detail, /if \( dwS > 0\.0 \) \{\s*dn \+= \( vnoise3/,
  'skip, rather than compute and multiply away, the zero-weight arcade finest octave');
for (const scale of ['15.0', '4.6', '1.6', '0.55']) {
  assert.ok(detail.includes(`vnoise3( wp * ( 1.0 / ${scale} )`), 'all octaves sample actual world volume');
}
assert.match(detail, /dnM \* 0\.42[\s\S]*\* 0\.28[\s\S]*\* 0\.17[\s\S]*\+ 0\.065/,
  'same coarse/mid/detail amplitude mix and centering');
assert.match(detail, /\* 0\.13 \* \( dwS \/ max\( dw, 1e-3 \) \)/,
  'same scope-only finest amplitude');
assert.match(detail, /vec3\( 1\.075, 0\.995, 0\.86 \), \( dnM - 0\.5 \) \* 1\.7 \* gVar/,
  'same green-keyed chroma response');
const volumeSource = source.slice(source.indexOf('float vnoise3('), source.indexOf('    void main()', source.indexOf('float vnoise3(')));
assert.equal((volumeSource.match(/vhash3\(/g) || []).length, 4,
  'four lattice hashes per octave, not an eight-corner or triplanar expansion');
// Lock the GLSL corner/weight expressions to the CPU reference below. Ties
// favor x, then y, then z; a cyclical rank shortcut fails at equal fractions.
const compact = volumeSource.replace(/\s+/g, '');
for (const expression of [
  'xy=step(f.y,f.x)', 'yz=step(f.z,f.y)', 'xz=step(f.z,f.x)',
  'a=vec3(xy*xz,(1.0-xy)*yz,(1.0-xz)*(1.0-yz))',
  'b=vec3(max(xy,xz),max(1.0-xy,yz),max(1.0-xz,1.0-yz))',
  'mid=u.x+u.y+u.z-hi-lo',
  'vhash3(i)*(1.0-hi)+vhash3(i+a)*(hi-mid)+vhash3(i+b)*(mid-lo)+vhash3(i+vec3(1.0))*lo',
]) assert.ok(compact.includes(expression), `actual shader follows verified ${expression}`);

const fract = (x) => x - Math.floor(x);
const fade = (x) => x * x * x * (x * (x * 6 - 15) + 10);
const hash = (p) => fract(Math.sin(p[0] * 127.1 + p[1] * 311.7 + p[2] * 74.7) * 43758.5453);
function volumeNoise(p) {
  const i = p.map(Math.floor), f = p.map(fract), u = f.map(fade);
  const xy = Number(f[0] >= f[1]), yz = Number(f[1] >= f[2]), xz = Number(f[0] >= f[2]);
  const a = [xy * xz, (1 - xy) * yz, (1 - xz) * (1 - yz)];
  const b = [Math.max(xy, xz), Math.max(1 - xy, yz), Math.max(1 - xz, 1 - yz)];
  assert.equal(a.reduce((sum, x) => sum + x), 1, 'exactly one largest-axis corner, including ties');
  assert.equal(b.reduce((sum, x) => sum + x), 2, 'exactly one top-two corner, including ties');
  const hi = Math.max(...u), lo = Math.min(...u), mid = u[0] + u[1] + u[2] - hi - lo;
  const w = [1 - hi, hi - mid, mid - lo, lo];
  assert.ok(w.every((x) => x >= -1e-14 && x <= 1 + 1e-14), 'convex weights, no detail overshoot');
  assert.ok(Math.abs(w.reduce((sum, x) => sum + x) - 1) < 1e-14, 'partition of unity');
  return w[0] * hash(i) + w[1] * hash(i.map((x, k) => x + a[k]))
    + w[2] * hash(i.map((x, k) => x + b[k])) + w[3] * hash(i.map((x) => x + 1));
}
let seed = 1337;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
let mean = 0, square = 0;
for (let n = 0; n < 10000; n++) {
  const point = [random() * 100 - 50, random() * 100 - 50, random() * 100 - 50];
  const value = volumeNoise(point);
  assert.ok(value >= 0 && value <= 1);
  mean += value; square += value * value;
}
mean /= 10000;
assert.ok(Math.abs(mean - 0.5) < 0.02, 'unbiased detail does not shift overall exposure');
assert.ok(Math.sqrt(square / 10000 - mean * mean) > 0.19, 'retain useful material variation');
for (const fraction of [0, 0.001, 0.25, 0.5, 0.999]) {
  volumeNoise([fraction, fraction, fraction]);
  for (const [a, b] of [[0, 1], [1, 2], [0, 2]]) {
    const p = [2.71, -3.29, 5.82];
    p[a] = Math.floor(p[a]) + fraction;
    p[b] = Math.floor(p[b]) + fraction;
    const left = [...p], right = [...p];
    left[a] -= 1e-7; right[a] += 1e-7;
    assert.ok(Math.abs(volumeNoise(left) - volumeNoise(right)) < 1e-6,
      'no visible discontinuity when crossing a tetrahedron or cube boundary');
  }
}
// Travel along the old projection's null vector. Every planar octave used to
// stay constant along this entire line, regardless of frequency or phase.
for (let line = 0; line < 12; line++) {
  const values = [];
  const origin = [random() * 30, random() * 30, random() * 30];
  for (let n = 0; n < 256; n++) {
    values.push(volumeNoise(origin.map((x, k) => x + [-0.85, 1, -0.37][k] * n * 0.07)));
  }
  assert.ok(Math.max(...values) - Math.min(...values) > 0.35,
    'formerly blind surface direction now carries bounded spatial detail');
}

// Actual V9 Fjord EN pixel (640,355), row 7. The single projection's null
// vector (-.85,1,-.37) lies almost in this face. Compare the well-conditioned
// WS face from the same read-only geometry/camera audit. These fixtures
// establish the real directional defect; they do not claim a native A/B pass.
const condition = ([nx, ny, nz]) => {
  const length = Math.hypot(nx, ny);
  const tangent = [ny / length, -nx / length, 0];
  const bitangent = [-nz * tangent[1], nz * tangent[0], nx * tangent[1] - ny * tangent[0]];
  const metric = (a, b) => (a[0] + 0.85 * a[1]) * (b[0] + 0.85 * b[1])
    + (a[2] + 0.37 * a[1]) * (b[2] + 0.37 * b[1]);
  const aa = metric(tangent, tangent), bb = metric(bitangent, bitangent), ab = metric(tangent, bitangent);
  const delta = Math.hypot(aa - bb, 2 * ab);
  return Math.sqrt((aa + bb + delta) / (aa + bb - delta));
};
assert.ok(condition([0.7661778098946731, 0.6421508867441705, -0.024775033373900607]) > 10000,
  'the real EN face reproduces extreme parallel-fiber stretching');
assert.ok(condition([0.08753772387831393, 0.3200049086829419, -0.9433631354452144]) < 3.2,
  'the same projection is benign in the cleaner WS view, explaining the angle dependence');

console.log('aerialDetail.selftest: four-hash volume, continuity/ties, restored arcade/scope policy and real projection failure passed');
