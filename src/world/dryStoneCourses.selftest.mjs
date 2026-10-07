// dryStoneCourses.selftest — how a dry-stone wall's face is laid (the scenery lane, b26; gauntlet wave 177, Saltwind:
// "neat stacks of uniform rectangular slabs", "a jumbled, collapsed pile of flat slabs at odd angles", "a crazy-paving
// decal with thick black grout"). Pinned, on the law itself (dryStoneCourses.ts) that the field works' stone form, their
// print and the suhozid module all lay their faces by:
//   1. deterministic for its stream; every outline counter-clockwise, four to nine corners, inside the face;
//   2. no two stones overlap, none stands above the crown, and the stones cover the face but for its joints and voids;
//   3. random rubble brought to courses: the footing's big stones at the foot, smaller ones up the wall, beds that
//      wander (never a ruled course line), the odd stone two courses high, knocked corners, stones longer than tall;
//   4. a fallen stretch (a lower crown) laid lower, the course under it closing on it;
//   5. a wrapped face (a print's tile, a module's run) laid on a periodic skyline: as covered across its end as anywhere;
//   6. sliced: the generator yields every few dozen stones and lays exactly what the plain call lays.
import assert from 'node:assert/strict';
import { layDryStoneFace, layDryStoneFaceSteps } from './dryStoneCourses.ts';

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SIZES = { foot: 0.08, footH: [0.2, 0.32], footL: [0.36, 0.78], courseH: [0.13, 0.27], courseL: [0.2, 0.62] };
const inside = (pts, s, y) => {
  let c = false;
  for (let i = 0, j = pts.length / 2 - 1; i < pts.length / 2; j = i++) {
    const xi = pts[i * 2], yi = pts[i * 2 + 1], xj = pts[j * 2], yj = pts[j * 2 + 1];
    if ((yi > y) !== (yj > y) && s < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const area = (pts) => { let a = 0; for (let i = 0, j = pts.length / 2 - 1; i < pts.length / 2; j = i++) a += (pts[j * 2] - pts[i * 2]) * (pts[j * 2 + 1] + pts[i * 2 + 1]); return a / 2; };

// ---------------------------------------------------------------------------------------------- 1-3. a long face
{
  const L = 12, crown = (s) => 0.76 + 0.04 * Math.sin(s * 1.7);
  const a = layDryStoneFace(mulberry32(7), L, { crown, ...SIZES }), b = layDryStoneFace(mulberry32(7), L, { crown, ...SIZES });
  assert.deepEqual(a, b, 'deterministic for its stream');
  assert.ok(a.length > L * 5, `a face of many stones (${a.length} over ${L} m)`);
  for (const st of a) {
    const n = st.pts.length / 2;
    assert.ok(n >= 4 && n <= 9, `an outline of four to nine corners (${n})`);
    assert.ok(area(st.pts) > 0, 'every outline counter-clockwise');
    assert.ok(st.s0 >= -1e-9 && st.s1 <= L + 1e-9, 'inside the face');
    for (let k = 0; k < n; k++) assert.ok(st.pts[k * 2 + 1] <= crown(st.pts[k * 2]) + 1e-6, 'no stone above the crown');
  }
  // the face sampled on a 1 cm grid: no point in two stones; the stones cover it but for the joints and voids
  let covered = 0, twice = 0, total = 0;
  const byS = new Map();
  for (const st of a) for (let c = Math.floor(st.s0 / 0.25); c <= Math.floor(st.s1 / 0.25); c++) { const l = byS.get(c); if (l) l.push(st); else byS.set(c, [st]); }
  for (let s = 0.005; s < L; s += 0.01) for (let y = 0.005; y < crown(s); y += 0.01) {
    total++;
    let n = 0;
    for (const st of byS.get(Math.floor(s / 0.25)) ?? []) if (s >= st.s0 && s <= st.s1 && y >= st.y0 && y <= st.y1 && inside(st.pts, s, y)) n++;
    if (n) covered++;
    if (n > 1) twice++;
  }
  assert.equal(twice, 0, 'no two stones overlap');
  assert.ok(covered / total > 0.74 && covered / total < 0.95, `the stones cover the face but for its joints and voids (${(covered / total * 100).toFixed(1)} %)`);
  // the courses: the footing's big stones, smaller up the wall
  const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
  const foot = a.filter((st) => st.kind === 1), upper = a.filter((st) => st.course >= 2);
  assert.ok(foot.length && upper.length, 'a footing course and courses over it');
  assert.ok(avg(foot.map((st) => (st.s1 - st.s0) * (st.y1 - st.y0))) > avg(upper.map((st) => (st.s1 - st.s0) * (st.y1 - st.y0))) * 1.5,
    'the footing\'s stones the biggest');
  assert.ok(foot.every((st) => st.y0 < 0), 'the footing bedded under the ground');
  // the beds wander: in every upper course the stones' beds spread over centimetres, never one ruled line
  const courses = new Map();
  for (const st of a.filter((x) => x.course >= 1)) { const l = courses.get(st.course); if (l) l.push(st.y0); else courses.set(st.course, [st.y0]); }
  for (const [course, beds] of courses) {
    if (beds.length < 6) continue;
    const m = avg(beds), sd = Math.sqrt(avg(beds.map((y) => (y - m) ** 2)));
    assert.ok(sd > 0.012, `course ${course}'s beds wander (sd ${(sd * 100).toFixed(1)} cm)`);
  }
  assert.ok(a.some((st) => st.kind === 2), 'the odd stone two courses high');
  assert.ok(a.filter((st) => st.pts.length / 2 >= 6).length > a.length * 0.25, 'knocked corners on many stones');
  const long = a.filter((st) => (st.s1 - st.s0) > (st.y1 - st.y0)).length;
  assert.ok(long > a.length * 0.6, `stones laid longer than they stand (${long} of ${a.length}), not slabs on edge`);
  const sizes = a.map((st) => area(st.pts)).sort((p, q) => p - q);
  assert.ok(sizes[sizes.length - 1] / sizes[Math.floor(sizes.length * 0.05)] > 4, 'stones of every size');
}

// ---------------------------------------------------------------------------------------------- 4. a fallen stretch
{
  const L = 8, crown = (s) => (s > 3 && s < 5 ? 0.38 : 0.8);
  const a = layDryStoneFace(mulberry32(11), L, { crown, ...SIZES });
  const low = a.filter((st) => st.s0 > 3.05 && st.s1 < 4.95);
  assert.ok(low.length > 0 && low.every((st) => st.y1 <= 0.38 + 1e-6), 'the fallen stretch laid lower, under its own crown');
  assert.ok(a.some((st) => st.s1 < 3 && st.y1 > 0.6) && a.some((st) => st.s0 > 5 && st.y1 > 0.6), 'the sound wall either side laid to its height');
}

// ---------------------------------------------------------------------------------------------- 5. a wrapped face
{
  const L = 3, crown = () => 0.8;
  const a = layDryStoneFace(mulberry32(5), L, { crown, ...SIZES, wrap: true });
  const cover = (s0, s1) => {
    let c = 0, t = 0;
    for (let s = s0; s < s1; s += 0.01) for (let y = 0.005; y < 0.8; y += 0.01) {
      t++;
      if (a.some((st) => [0, L, -L].some((shift) => inside(st.pts, s + shift, y)))) c++;
    }
    return c / t;
  };
  const atEnd = cover(L - 0.15, L + 0.15), inner = cover(1.35, 1.65);
  assert.ok(Math.abs(atEnd - inner) < 0.12, `as covered across its end as anywhere (${(atEnd * 100).toFixed(0)} % against ${(inner * 100).toFixed(0)} %)`);
  assert.ok(a.some((st) => st.s1 > L + 0.02), 'a stone runs on past the end of a wrapped face');
}

// ---------------------------------------------------------------------------------------------- 6. sliced
{
  const crown = () => 0.8;
  const steps = layDryStoneFaceSteps(mulberry32(3), 20, { crown, ...SIZES });
  let slices = 0, step = steps.next();
  while (!step.done) { slices++; step = steps.next(); }
  assert.ok(slices >= Math.floor(step.value.length / 48) - 1 && slices > 0, `laid across slices (${slices} for ${step.value.length} stones)`);
  assert.deepEqual(step.value, layDryStoneFace(mulberry32(3), 20, { crown, ...SIZES }), 'the slices lay what the plain call lays');
}

console.log('dryStoneCourses.selftest: random rubble brought to courses, no overlap, under its crown, the footing biggest, beds wandering, a wrapped face periodic, sliced');
