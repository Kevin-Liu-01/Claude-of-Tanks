// The dome-detail law (dome-detail-275; Kevin, 2026-11-22: "no more low quality/low poly buildings ... like the one in
// orchard valley of a dome on a building thats just so low detailed compared to others"). The Orchard hammam's domes were
// six stacked `cylinder` frustums of fourteen flat facets: each frustum's quads carry their own flat normal, so the dome
// read as a polyhedron beside houses dressed to the centimetre. Every kit builder is built (desktop, two seeds) with
// PartSink's round emitters watched:
//   1. no dome, bulb or round roof is a stack of frustums: no run of three or more upright `cylinder` frustums, each
//      standing on the last's head, narrowing to under 0.6 of its widest radius, at 0.8 m or more (domes.ts smoothDome,
//      bulb: one smooth revolve);
//   2. every upright revolve that closes over its axis like a dome (from 0.9 of its widest radius to under 0.35 of it
//      over a rise of at least 0.3 of it, never through a flat lid), 0.8 m or wider, turns at least DOME_MIN_SEGMENTS round and five rows up that
//      closing (domes.ts draws DOME_MIN_RINGS up the whole curve);
//      (domes.ts polygonalDome, the cloister vault over a polygonal body, is drawn as faces and is not a round dome);
//   3. the watch sees what it guards (synthetic): the old Chouf dome fails law 1, a 14-segment revolve fails law 2, and
//      smoothDome and bulb pass both.
import assert from 'node:assert/strict';
import { ARCHITECTURE_STYLES, buildRegionalParts } from './index.ts';
import { PartSink, streamFrom } from './geometry.ts';
import { DOME_MIN_RINGS, DOME_MIN_SEGMENTS, bulb, smoothDome } from './domes.ts';
import { INFO } from '../../../../tools/building-detail-census.mjs';

const MIN_R = 0.8;
let calls = null;
const watch = (name) => {
  const orig = PartSink.prototype[name];
  PartSink.prototype[name] = function (...a) {
    if (calls) calls.push({ name, a, site: new Error().stack.split('\n').map((l) => l.match(/\/src\/world\/(.*?\.ts):(\d+)/)).find((m) => m && !m[1].endsWith('regional/geometry.ts')) });
    return orig.apply(this, a);
  };
};
watch('cylinder');
watch('revolve');
const where = (c) => (c.site ? `${c.site[1]}:${c.site[2]}` : '?');

/** Law 1: runs of upright frustums, each on the last's head, closing in like a dome. */
function frustumDomes(list) {
  const ys = list.filter((c) => c.name === 'cylinder' && c.a[2] === 'y').map((c) => {
    const [, start, , length, radius, , , radiusEnd = radius] = c.a;
    return { c, x: start[0], z: start[2], y0: start[1], y1: start[1] + length, r0: radius, r1: radiusEnd };
  });
  const out = [];
  const used = new Set();
  for (const first of ys) {
    if (used.has(first)) continue;
    const run = [first];
    for (;;) {
      const last = run[run.length - 1];
      const next = ys.find((f) => !used.has(f) && !run.includes(f) && Math.abs(f.x - last.x) < 0.02 && Math.abs(f.z - last.z) < 0.02
        && Math.abs(f.y0 - last.y1) < 0.03 && Math.abs(f.r0 - last.r1) < 0.03 && Math.abs(f.r1 - f.r0) > 1e-3);
      if (!next) break;
      run.push(next);
    }
    const rMax = Math.max(...run.map((f) => Math.max(f.r0, f.r1)));
    const head = run[run.length - 1].r1;
    if (run.length >= 3 && rMax >= MIN_R && head < 0.6 * rMax) {
      run.forEach((f) => used.add(f));
      out.push(`${run.length} frustums of ${Math.min(...run.map((f) => f.c.a[5] ?? 8))} segments, r ${rMax.toFixed(2)} m at ${where(run[0].c)}`);
    }
  }
  return out;
}

/** Law 2: dome-like upright revolves below the segment and ring floors. */
function coarseRevolves(list) {
  const out = [];
  for (const c of list) {
    if (c.name !== 'revolve' || c.a[2] !== 'y') continue;
    const profile = c.a[3], segments = c.a[4];
    const rMax = Math.max(...profile.map((p) => p[1]));
    if (rMax < MIN_R) continue;
    // the closing: from the last row still at 0.9 of the widest radius to the first row under 0.35 of it, measured in
    // rows and rise (a drum's flat lid or a ring's step closes with no rise: not a dome)
    const iMax = profile.findLastIndex((p, i) => p[1] >= 0.9 * rMax && profile.slice(0, i + 1).some((q) => q[1] === rMax));
    const iHead = profile.findIndex((p, i) => i > iMax && p[1] < 0.35 * rMax);
    // (a shaft tapering to a flat lid reaches its axis through the lid: not a dome)
    if (iHead < 0 || profile[iHead][0] - profile[iMax][0] < 0.3 * rMax || Math.abs(profile[iHead][0] - profile[iHead - 1][0]) < 1e-6) continue;
    const rows = profile.slice(iMax, iHead + 1).filter((p, i, arr) => i === 0 || Math.abs(p[0] - arr[i - 1][0]) > 1e-6).length - 1;
    if (segments < DOME_MIN_SEGMENTS || rows < 5) out.push(`${segments} segments x ${rows} rows, r ${rMax.toFixed(2)} m at ${where(c)}`);
  }
  return out;
}

// ---- 3. the watch sees what it guards
{
  const sink = new PartSink();
  calls = [];
  // the Orchard hammam's dome before dome-detail-275 (chouf.ts dome(), six frustums of fourteen segments)
  const r = 3, n = 6;
  for (let k = 0; k < n; k++) {
    const a0 = (Math.PI / 2) * k / n, a1 = (Math.PI / 2) * (k + 1) / n;
    sink.cylinder('plaster', [0, Math.sin(a0) * r, 0], 'y', (Math.sin(a1) - Math.sin(a0)) * r, Math.cos(a0) * r, 14, {}, Math.max(0.04, Math.cos(a1) * r), k === 0 || k === n - 1);
  }
  assert.equal(frustumDomes(calls).length, 1, 'law 1 catches the old Chouf dome');
  calls = [];
  sink.revolve('plaster', [0, 0, 0], 'y', Array.from({ length: 10 }, (_, i) => [Math.sin(i / 9 * Math.PI / 2) * 2, Math.cos(i / 9 * Math.PI / 2) * 2]), 14);
  assert.equal(coarseRevolves(calls).length, 1, 'law 2 catches a 14-segment dome');
  calls = [];
  smoothDome(sink, 'plaster', 0, 0, 0, 3, { haunch: true, stilt: 0.06 });
  smoothDome(sink, 'plaster', 5, 0, 0, 1.2, { form: 'pointed', openTop: 0.3 });
  bulb(sink, 'roof', -5, 0, 0, [[0.4, 1.45, 1.2], [0.45, 1.2, 1.55], [0.5, 1.55, 1.62], [0.5, 1.62, 1.42], [0.45, 1.42, 0.95], [0.4, 0.95, 0.42]]);
  assert.deepEqual([...frustumDomes(calls), ...coarseRevolves(calls)], [], 'smoothDome and bulb pass both laws');
  calls = null;
}

// ---- 1 and 2 over every kit builder
const failures = [];
let builds = 0;
for (const style of ARCHITECTURE_STYLES) {
  for (const id of Object.keys(style.builders)) {
    const [w, d, h] = INFO[id] ?? [7, 9, 6];
    for (const seed of [11, 29]) {
      calls = [];
      buildRegionalParts(style, { structureId: id, info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
        wallBucket: 'stone', rng: streamFrom(seed), variant: streamFrom(seed * 7 + 3), mapId: 'selftest', snowCap: false, tier: 'desktop' }, streamFrom(seed + 1));
      for (const f of [...frustumDomes(calls), ...coarseRevolves(calls)]) failures.push(`${style.id}/${id} (seed ${seed}): ${f}`);
      calls = null;
      builds++;
    }
  }
}
assert.deepEqual([...new Set(failures)], [], 'no kit builds a faceted dome (domes.ts smoothDome / bulb)');
console.log(`domeDetail.selftest: ${builds} kit builds, no frustum-stack dome and no dome under ${DOME_MIN_SEGMENTS} segments or five rows up its closing; the watch catches the old Chouf dome PASS`);
