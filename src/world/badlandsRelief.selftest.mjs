import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { createLayout } from './terrain.ts';
import { sampleRedrockCanyon, redrockCanyonCenter, redrockCanyonFloorHalfWidth } from './redrockCanyon.ts';

const base = '57fe26ac9c13525338178de28bfb52f9f19e2e90', root = fileURLToPath(new URL('../../', import.meta.url));
const read = name => readFileSync(new URL('../../' + name, import.meta.url), 'utf8');
const old = name => execFileSync('git', ['show', `${base}:${name}`], { cwd: root, encoding: 'utf8' });
const sha = data => createHash('sha256').update(data).digest('hex');
const serialize = value => JSON.stringify(value, (_key, item) => typeof item === 'function' ? item.toString() : item);
const oldMap = old('src/world/maps/badlands.ts'), oldTerrain = old('src/world/terrain.ts');
assert.equal(sha(oldMap), 'eae9a03e75913e7c1b6ba87fae136115e5a568675d4998923da47492cd7ddada');
assert.equal(sha(oldTerrain), 'cecde431b664736c5fd68f57f593ce9499e9bf792816a66376a454a031376e6d');
const registry = read('src/world/maps/index.ts');
assert.equal(registry, old('src/world/maps/index.ts'));
const mapFiles = [...registry.matchAll(/import \w+ from '\.\/(\w+\.ts)';/g)].map(match => match[1]);
assert.equal(mapFiles.length, MAP_IDS.length);
for (const file of mapFiles) if (file !== 'badlands.ts') {
  assert.equal(read('src/world/maps/' + file), old('src/world/maps/' + file), `${file}: unchanged authoring`);
}

const ports = new Map(), terrainURL = new URL('./terrain.ts', import.meta.url).href;
const anchor = '  const getHeightAt = (x: number, z: number): number => heightAt(x, z, true, true);';
for (const [side, text] of [['current', read('src/world/terrain.ts')], ['old', oldTerrain]]) {
  assert.equal(text.split(anchor).length, 2, 'actual completed support checkpoint');
  const observed = text.replace(anchor, anchor + '\n  __supports = {road:gRoadElev,dist:gRoadDist,corridor:gCorridor,pads:padYs,lakes:lakeLevels};')
    + '\nlet __supports; export function constructObserved(seed,cfg){const field=createHeightField(seed,cfg);return {field,supports:__supports};}\n';
  ports.set(`${terrainURL}?redrock-${side}`, stripTypeScriptTypes(observed));
}
const oldURL = new URL('./maps/badlands.ts?redrock-old', import.meta.url).href;
ports.set(oldURL, stripTypeScriptTypes(oldMap));
const hook = registerHooks({ load(url, context, next) {
  return ports.has(url) ? { format: 'module', source: ports.get(url), shortCircuit: true } : next(url, context);
} });
let current, previous, original;
try {
  current = await import(`${terrainURL}?redrock-current`);
  previous = await import(`${terrainURL}?redrock-old`);
  original = (await import(oldURL)).default;
} finally { hook.deregister(); }
const config = getMapConfig('badlands'), layout = createLayout(config);
assert.equal(config.terrain.redrockCanyon, true);
assert.equal(config.terrain.mesas, null, 'blanket random mesas no longer define this canyon');
assert.equal(config.terrain.rimH, 0, 'no closed square wall across the two canyon mouths');
assert.deepEqual(config.terrain.landforms, [], 'rejected scattered shelf pilot is not layered underneath');
assert.deepEqual(config.spawns, original.spawns, 'existing deployment anchors retained');
assert.deepEqual(config.terrain.village, original.terrain.village, 'outpost stays on its original floor footprint');
assert.deepEqual(config.terrain.marshes, original.terrain.marshes);
assert.equal(config.terrain.roads.paths.length, 5);
for (const index of [1, 3, 4]) assert.deepEqual(config.terrain.roads.paths[index], original.terrain.roads.paths[index]);
for (const index of [0, 2]) {
  assert.deepEqual(config.terrain.roads.paths[index][0], original.terrain.roads.paths[index][0]);
  assert.deepEqual(config.terrain.roads.paths[index].at(-1), original.terrain.roads.paths[index].at(-1));
}
// Later material-only refinement is independently bounded by redrockMaterial.
assert.equal(serialize({ ...config, blurb: original.blurb, terrain: original.terrain,
  splat: original.splat, horizon: original.horizon,
  props: { ...config.props, tacticalBeats: original.props.tacticalBeats, wallRuns: original.props.wallRuns } }),
serialize(original), 'only scoped terrain, blurb, materials and floor-reseated tactical/wall records change');

function canyonContract(sample) {
  for (const z of [-80, 0, 70]) {
    const center = redrockCanyonCenter(z), floor = sample(center, z);
    const west = sample(center - 400, z) - floor, east = sample(center + 400, z) - floor;
    assert.ok(west > 55 && east > 65 && east - west > 8, 'two tall unequal flanks above a real low floor');
    assert.ok(Math.abs(sample(center - 160, z) - floor) < 6 && Math.abs(sample(center + 160, z) - floor) < 6,
      'wide connected floor, not the crown of a ridge or several random mesas');
    for (const side of [-1, 1]) {
      let steepest = 0, benchRun = 0, longestBench = 0;
      for (let distance = 211; distance < 400; distance++) {
        const height = sample(center + side * distance, z) - floor;
        const slope = Math.abs(sample(center + side * (distance + 1), z)
          - sample(center + side * distance, z));
        // Measure the bench across one 4m terrain-support cell. One-metre
        // soil ripples must not split an otherwise continuous rock terrace.
        const benchSlope = Math.abs(sample(center + side * (distance + 2), z)
          - sample(center + side * (distance - 2), z)) / 4;
        steepest = Math.max(steepest, slope);
        benchRun = height > 15 && height < 40 && benchSlope < .2 ? benchRun + 1 : 0;
        longestBench = Math.max(longestBench, benchRun);
      }
      assert.ok(steepest > 2.2, 'central walls contain steep rock faces, not smooth hillside ramps');
      assert.ok(longestBench >= 22, `continuous rock benches separate the steep faces: z=${z}, side=${side}, length=${longestBench}, steepest=${steepest}`);
    }
  }
}
canyonContract(sampleRedrockCanyon);
assert.throws(() => canyonContract(() => 4), { code: 'ERR_ASSERTION' }, 'flat former-floor substitute fails tall canyon');
assert.throws(() => canyonContract((x, z) => sampleRedrockCanyon(x, z) * .1), { code: 'ERR_ASSERTION' },
  'tiny shelf-height substitution cannot satisfy a canyon');
for (const z of [-6000, -600, -430, 430, 600, 6000]) {
  assert.equal(redrockCanyonFloorHalfWidth(z), 330, 'mouth stops widening before the boundary');
  const center = redrockCanyonCenter(z);
  assert.equal(sampleRedrockCanyon(center + 300, z), sampleRedrockCanyon(center - 300, z));
}
for (const across of [-400, 400]) {
  for (const z of [-207 + across * .035, 110 + Math.abs(across) * .24]) {
    const x = redrockCanyonCenter(z) + across;
    assert.equal(sampleRedrockCanyon(x, z), sampleRedrockCanyon(redrockCanyonCenter(z), z),
      'road-aligned side ravines connect all the way through each wall');
  }
}
assert.doesNotMatch(read('src/world/redrockCanyon.ts'), /\bnew\s+|Math\.random|\.noise\(|new (?:Float|Int|Uint)/,
  'shared analytic region adds no query allocation, noise or grid');

const bufferReceipt = values => Object.fromEntries(Object.entries(values).map(([key, value]) => [key,
  { type: value.constructor.name, bytes: value.byteLength, sha: sha(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) }]));
function roadGrades(field) {
  return layout.roads.map((road, index) => {
    let maxGrade = 0, maxStep = 0, samples = 0;
    for (let i = 1; i < road.length; i++) {
      const a = road[i - 1], b = road[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.ceil(length / 2), step = length / steps;
      let prior = field.getHeightAt(...a);
      for (let j = 1; j <= steps; j++) {
        const t = j / steps, h = field.getHeightAt(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
        maxStep = Math.max(maxStep, Math.abs(h - prior)); maxGrade = Math.max(maxGrade, Math.abs(h - prior) / step);
        prior = h; samples++;
      }
    }
    return { index, maxGrade, maxStep, samples };
  });
}
function supportFootprints(field) {
  const points = [...layout.spawns.enemies, layout.spawns.player, ...config.props.tacticalBeats];
  return points.map(point => {
    let lo = Infinity, hi = -Infinity, minNormalY = 1;
    for (const dx of [-8, 0, 8]) for (const dz of [-8, 0, 8]) {
      const x = point.x + dx, z = point.z + dz, h = field.getHeightAt(x, z);
      lo = Math.min(lo, h); hi = Math.max(hi, h); minNormalY = Math.min(minNormalY, field.getNormalAt(x, z).y);
    }
    return { x: point.x, z: point.z, relief: hi - lo, minNormalY };
  });
}
const receipts = [];
for (const seed of [1337, 7719]) {
  const a = current.constructObserved(seed, config), b = previous.constructObserved(seed, original);
  const support = bufferReceipt(a.supports), oldSupport = bufferReceipt(b.supports);
  for (const key of Object.keys(support)) {
    assert.equal(support[key].type, oldSupport[key].type); assert.equal(support[key].bytes, oldSupport[key].bytes);
  }
  assert.notEqual(support.road.sha, oldSupport.road.sha, 'new roads are seated in the canyon, not held mesa elevations');
  assert.notEqual(support.pads.sha, oldSupport.pads.sha, 'deployment targets are recomputed on the new floor');
  canyonContract((x, z) => a.field.getHeightAt(x, z));
  let changed = 0, maxDelta = 0, fastSamples = 0;
  for (let z = -480; z <= 480; z += 40) for (let x = -480; x <= 480; x += 40) {
    const h = a.field.getHeightAt(x, z), delta = Math.abs(h - b.field.getHeightAt(x, z));
    assert.ok(Number.isFinite(h)); maxDelta = Math.max(maxDelta, delta); if (delta > 8) changed++;
    assert.equal(a.field.getWaterMaskAt(x, z), 0);
    if (x % 80 === 0 && z % 80 === 0) {
      assert.equal(a.field.getHeightAtFast(x, z), Math.fround(h)); fastSamples++;
    }
  }
  assert.ok(changed > 80 && maxDelta > 40, 'region-scale canyon, not another low-impact shelf adjustment');
  receipts.push({ seed, changed, maxDelta, fastSamples, support, roads: roadGrades(a.field), footprints: supportFootprints(a.field) });
}
// Current opt-in disabled on another actual map ID is exactly inert, not a global policy switch.
const gated = { ...config, id: 'frontier' }, disabled = { ...gated, terrain: { ...gated.terrain, redrockCanyon: false } };
const gatedA = current.constructObserved(1337, gated), gatedB = current.constructObserved(1337, disabled);
assert.deepEqual(bufferReceipt(gatedA.supports), bufferReceipt(gatedB.supports));
for (let z = -400; z <= 400; z += 80) for (let x = -400; x <= 400; x += 80) {
  assert.equal(gatedA.field.getHeightAt(x, z), gatedB.field.getHeightAt(x, z));
}
for (const id of MAP_IDS) if (id !== 'badlands') {
  const cfg = getMapConfig(id), a = current.constructObserved(1337, cfg), b = previous.constructObserved(1337, cfg);
  assert.deepEqual(bufferReceipt(a.supports), bufferReceipt(b.supports), `${id}: unchanged support arrays`);
  for (let z = -480; z <= 480; z += 80) for (let x = -480; x <= 480; x += 80) {
    assert.equal(a.field.getHeightAt(x, z), b.field.getHeightAt(x, z), `${id}: exact original height`);
    assert.deepEqual(a.field.getNormalAt(x, z).toArray(), b.field.getNormalAt(x, z).toArray());
  }
}
console.log(JSON.stringify({ test: 'badlandsRelief', base, unchangedMaps: 29, receipts,
  limits: 'Actual conditioned CPU ground/support/cache and road/footprint measurements. Full-mode current-terrain access, actual native prop contact, refreshed collision/minimap and visual acceptance remain separate gates; no GPU or memory-performance clearance.' }, null, 2));
for (const receipt of receipts) {
  for (const road of receipt.roads) assert.ok(road.maxGrade <= .30, `road${road.index}/${receipt.seed}: continuous drivable grade`);
  for (const point of receipt.footprints) {
    assert.ok(point.relief <= 2 && point.minNormalY >= .94, `${receipt.seed}/${point.x},${point.z}: seated deployment/tactical footprint`);
  }
}
