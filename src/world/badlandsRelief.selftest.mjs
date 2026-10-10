import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { getMapConfig } from './maps/index.ts';
import { sampleRedrockCanyon, redrockCanyonCenter, redrockCanyonFloorHalfWidth } from './redrockCanyon.ts';

// 2026-10-01 (frozen pins retired): this receipt used to `git show` the 57fe26ac9 terrain program and every map module,
// authenticate each current map file against it through fifteen historical projections (road settlement, map pass,
// rounds 47/66/70/71/72/75/76, lighting, sky, apertures, slopes, vista ground, drain aprons, exits) and require every
// other battlefield's heights to equal the old program bit for bit. Those were change detectors of history. The Redrock
// contract is now live: the analytic canyon shape and its negatives, the closed mouths and flat floor, the gated
// opt-in, and on today's terrain program a region-scale canyon against the same map with the canyon opted out, roads
// re-seated in it, drivable road grades and seated deployment/tactical footprints.
const read = name => readFileSync(new URL('../../' + name, import.meta.url), 'utf8');
const sha = data => createHash('sha256').update(data).digest('hex');
const terrainURL = new URL('./terrain.ts', import.meta.url).href, observedURL = `${terrainURL}?redrock-observed`;
const anchor = '  const getHeightAt = (x: number, z: number): number => heightAt(x, z, true, true);';
const terrainSource = read('src/world/terrain.ts');
assert.equal(terrainSource.split(anchor).length, 2, 'actual completed support checkpoint');
const observedSource = stripTypeScriptTypes(terrainSource.replace(anchor, anchor + '\n  __supports = {road:gRoadElev,dist:gRoadDist,corridor:gCorridor,pads:padYs,lakes:lakeLevels};')
  + '\nlet __supports; export function constructObserved(seed,cfg){const field=createHeightField(seed,cfg);return {field,supports:__supports};}\n');
const hook = registerHooks({ load(url, context, next) {
  return url === observedURL ? { format: 'module', source: observedSource, shortCircuit: true } : next(url, context);
} });
let current;
try { current = await import(observedURL); } finally { hook.deregister(); }
const config = getMapConfig('badlands'), layout = current.createLayout(config);
assert.equal(config.terrain.redrockCanyon, true);
assert.equal(config.terrain.mesas, null, 'blanket random mesas no longer define this canyon');
assert.equal(config.terrain.rimH, 0, 'no closed square wall across the two canyon mouths');
// 2026-10-02 (Redrock Divide rebuilt to docs/MAP-LAYOUT-BRIEF.md): the authored landforms are floor features
// (inselbergs, dune ridges, sand ramps); the rejected scattered shelf pilot stays out, so none stands on a wall.
for (const form of config.terrain.landforms) {
  assert.ok(Math.abs(form.x - redrockCanyonCenter(form.z)) < redrockCanyonFloorHalfWidth(form.z),
    `rejected scattered shelf pilot is not layered underneath: ${form.kind} at (${form.x}, ${form.z}) is on the floor`);
}
const optedOut = { ...config, terrain: { ...config.terrain, redrockCanyon: false } };

function canyonContract(sample) {
  for (const z of [-80, 0, 70]) {
    const center = redrockCanyonCenter(z), floor = sample(center, z);
    const west = sample(center - 400, z) - floor, east = sample(center + 400, z) - floor;
    assert.ok(west > 55 && east > 65 && east - west > 8, 'two tall unequal flanks above a real low floor');
    assert.ok(Math.abs(sample(center - 160, z) - floor) < 6 && Math.abs(sample(center + 160, z) - floor) < 6,
      'wide connected floor, not the crown of a ridge or several random mesas');
    for (const side of [-1, 1]) {
      // 2026-10-07 (the Redrock lane, owner: "redrock is really rough"; the walls read as smooth clay ramps with a 20 m
      // bench between two 45-65 degree steps): every wall is a Wadi Rum jebel's section — a talus apron, the pale Disi's
      // rounded base up to its bench ~9 m over the floor, then the Umm Ishrin's sheer face to the top, within ~90 m of the toe
      let steepest = 0, benchRun = 0, longestBench = 0, toe = -1, top = -1;
      const full = sample(center + side * 420, z) - floor, heights = [];
      for (let distance = 200; distance < 400; distance++) {
        const height = sample(center + side * distance, z) - floor;
        heights[distance] = height;
        const slope = Math.abs(sample(center + side * (distance + 1), z)
          - sample(center + side * distance, z));
        const benchSlope = Math.abs(sample(center + side * (distance + 1), z)
          - sample(center + side * (distance - 1), z)) / 2;
        steepest = Math.max(steepest, slope);
        if (top < 0 && height > full * 0.85) top = distance;
        benchRun = height > 5 && height < 24 && benchSlope < .4 ? benchRun + 1 : 0;
        longestBench = Math.max(longestBench, benchRun);
      }
      // (round 9: the toe is the foot of the climb that reaches the top — the last point before it within 2 m of the floor;
      // the full field's floor carries 1-3 m dunes and a road's crown beside the walls, which the first point 0.5 m up took
      // for the wall's foot 40 m out on the sand)
      for (let distance = top; distance >= 200 && toe < 0; distance--) if (heights[distance] <= 2) toe = distance;
      assert.ok(steepest > 4, `central walls stand sheer (a face past 76 degrees), not hillside ramps: z=${z}, side=${side}, steepest=${steepest}`);
      assert.ok(longestBench >= 2, `the Disi's bench stands between the base and the face: z=${z}, side=${side}, length=${longestBench}`);
      assert.ok(toe > 0 && top > 0 && top - toe < 95, `the wall rises from its toe to its top within 95 m: z=${z}, side=${side}, toe=${toe}, top=${top}`);
    }
  }
}
canyonContract(sampleRedrockCanyon);
assert.throws(() => canyonContract(() => 4), { code: 'ERR_ASSERTION' }, 'flat former-floor substitute fails tall canyon');
assert.throws(() => canyonContract((x, z) => sampleRedrockCanyon(x, z) * .1), { code: 'ERR_ASSERTION' },
  'tiny shelf-height substitution cannot satisfy a canyon');
for (const z of [-6000, -600, -430, 430, 600, 6000]) {
  assert.equal(redrockCanyonFloorHalfWidth(z), 330, 'mouth stops widening before the boundary');
}
// the floor is flat and symmetric across the axis to the map edge and just past it
for (const z of [-540, -430, 430, 540]) {
  const center = redrockCanyonCenter(z);
  assert.equal(sampleRedrockCanyon(center + 300, z), sampleRedrockCanyon(center - 300, z));
}
// The redesigned closure climbs through scalloped benches around 720 m and
// closes by 1000 m, with the playable deployment floor still protected.
for (const z of [-720, 720]) {
  const center = redrockCanyonCenter(z), openFloor = 4 + 0.004 * z;
  const rising = sampleRedrockCanyon(center, z);
  assert.ok(rising > openFloor + 1 && rising < 70, `mouth floor climbing at z=${z}: ${rising}`);
}
for (const z of [-6000, -1000, 1000, 6000]) {
  const center = redrockCanyonCenter(z);
  for (const across of [-300, 0, 300]) {
    assert.ok(sampleRedrockCanyon(center + across, z) > 45, `headwall closes the mouth at z=${z}, across=${across}`);
  }
}
assert.equal(sampleRedrockCanyon(redrockCanyonCenter(500), 500), 4 + 0.004 * 500, 'the playable floor keeps its exact datum to the edge');
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
  // 2026-09-17 field trenches: the relief law is compared on untrenched fields (fieldTrenches:false); the carve has its own receipt.
  const a = current.constructObserved(seed, { ...config, fieldTrenches: false });
  const b = current.constructObserved(seed, { ...optedOut, fieldTrenches: false });
  const support = bufferReceipt(a.supports), flatSupport = bufferReceipt(b.supports);
  for (const key of Object.keys(support)) {
    assert.equal(support[key].type, flatSupport[key].type); assert.equal(support[key].bytes, flatSupport[key].bytes);
  }
  assert.notEqual(support.road.sha, flatSupport.road.sha, 'roads are seated in the canyon, not held at the opted-out elevations');
  assert.notEqual(support.pads.sha, flatSupport.pads.sha, 'deployment targets are recomputed on the canyon floor');
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
// The canyon opt-in on another actual map is exactly inert, not a global policy switch.
const frontier = getMapConfig('frontier');
const gated = { ...frontier, terrain: { ...frontier.terrain, redrockCanyon: true } }, disabled = frontier;
const gatedA = current.constructObserved(1337, gated), gatedB = current.constructObserved(1337, disabled);
assert.deepEqual(bufferReceipt(gatedA.supports), bufferReceipt(gatedB.supports));
for (let z = -400; z <= 400; z += 80) for (let x = -400; x <= 400; x += 80) {
  assert.equal(gatedA.field.getHeightAt(x, z), gatedB.field.getHeightAt(x, z));
}
console.log(JSON.stringify({ test: 'badlandsRelief', receipts,
  limits: 'Actual conditioned CPU ground/support/cache and road/footprint measurements. Full-mode current-terrain access, actual native prop contact, refreshed collision/minimap and visual acceptance remain separate gates; no GPU or memory-performance clearance.' }, null, 2));
for (const receipt of receipts) {
  for (const road of receipt.roads) assert.ok(road.maxGrade <= .30, `road${road.index}/${receipt.seed}: continuous drivable grade`);
  for (const point of receipt.footprints) {
    assert.ok(point.relief <= 2 && point.minNormalY >= .94, `${receipt.seed}/${point.x},${point.z}: seated deployment/tactical footprint`);
  }
}
