// Synthetic buildings for the building integrity check's self-test (tools/building-integrity-check.mjs --self-test):
// each defect class on a box house, and the sound house it must leave alone.
import { analyseBuilding } from './building-integrity-core.mjs';

/** An axis-aligned box's 12 triangles, wound outward (or inward with `inside`), skipping the faces named in `skip`. */
function box(x0, y0, z0, x1, y1, z1, { inside = false, skip = [] } = {}) {
  const c = (sx, sy, sz) => [sx ? x1 : x0, sy ? y1 : y0, sz ? z1 : z0];
  const faces = {
    px: [c(1, 0, 1), c(1, 0, 0), c(1, 1, 0), c(1, 1, 1)], nx: [c(0, 0, 0), c(0, 0, 1), c(0, 1, 1), c(0, 1, 0)],
    py: [c(0, 1, 1), c(1, 1, 1), c(1, 1, 0), c(0, 1, 0)], ny: [c(0, 0, 0), c(1, 0, 0), c(1, 0, 1), c(0, 0, 1)],
    pz: [c(0, 0, 1), c(1, 0, 1), c(1, 1, 1), c(0, 1, 1)], nz: [c(1, 0, 0), c(0, 0, 0), c(0, 1, 0), c(1, 1, 0)],
  };
  const out = [];
  for (const [name, [a, b, cc, d]] of Object.entries(faces)) {
    if (skip.includes(name)) continue;
    const tris = inside ? [[a, cc, b], [a, d, cc]] : [[a, b, cc], [a, cc, d]];
    for (const t of tris) for (const p of t) out.push(...p);
  }
  return out;
}

function building(...parts) {
  const flat = parts.flat();
  const n = flat.length / 9;
  return { pos: Float32Array.from(flat), flags: new Uint8Array(n), bucketOf: new Uint8Array(n), buckets: ['wall'] };
}

/** A hollow house: four 0.3 m walls on a slab, a 0.3 m roof slab; `roofHole` cuts a square of that size from the roof. */
function hollowHouse(roofHole = 0) {
  const parts = [box(-4, -0.5, -5, 4, 0.2, 5), box(-4, 0.2, -5, 4, 4, -4.7), box(-4, 0.2, 4.7, 4, 4, 5),
    box(-4, 0.2, -4.7, -3.7, 4, 4.7), box(3.7, 0.2, -4.7, 4, 4, 4.7)];
  if (!roofHole) parts.push(box(-4.3, 4, -5.3, 4.3, 4.3, 5.3));
  else {
    const h = roofHole / 2;
    parts.push(box(-4.3, 4, -5.3, 4.3, 4.3, -h), box(-4.3, 4, h, 4.3, 4.3, 5.3), box(-4.3, 4, -h, -h, 4.3, h), box(h, 4, -h, 4.3, 4.3, h));
  }
  return building(...parts);
}

const quick = { elevations: [-20, 0, 25], pxM: 0.08, maxRes: 192 };

export function selfTest(log) {
  let ok = true;
  const check = (label, cond, detail) => { log(`${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`); if (!cond) ok = false; };
  const sum = (r) => ({ floating: r.floating.length, hole: r.kinds.hole?.maxViewM2 ?? 0, inside: r.kinds.inside?.maxViewM2 ?? 0,
    gap: r.kinds.gap?.maxViewM2 ?? 0, inverted: r.kinds.inverted?.maxViewM2 ?? 0 });

  const sound = sum(analyseBuilding(building(box(-3, -0.5, -4, 3, 5, 4), box(-3.3, 5, -4.3, 3.3, 5.4, 4.3)), quick));
  check('a closed house on its plinth: nothing', !sound.floating && !sound.hole && !sound.inside && !sound.gap && !sound.inverted, JSON.stringify(sound));

  const lifted = sum(analyseBuilding(building(box(-3, -0.5, -4, 3, 5, 4), box(-3.3, 6.2, -4.3, 3.3, 6.6, 4.3)), quick));
  check('a roof standing 1.2 m clear of its walls: floating', lifted.floating === 1, JSON.stringify(lifted));

  const lantern = analyseBuilding(building(box(-3, -0.5, -4, 3, 5, 4), box(-0.3, 5.4, -0.3, 0.3, 6.0, 0.3)), quick);
  check('a lantern 0.4 m over the roof: floating, its clearance measured', lantern.floating.length === 1 && Math.abs(lantern.floating[0].clearanceM - 0.4) < 0.15,
    JSON.stringify(lantern.floating[0]));

  const seated = sum(analyseBuilding(building(box(-3, -0.5, -4, 3, 5, 4), box(-0.3, 4.98, -0.3, 0.3, 6.0, 0.3)), quick));
  check('a lantern seated on the roof: not floating', seated.floating === 0, JSON.stringify(seated));

  const sign = analyseBuilding(building(box(-3, -0.5, -4, 3, 5, 4), box(-0.5, 2, 4.3, 0.5, 2.6, 4.36)), quick);
  check('a sign 30 cm off its wall: floating', sign.floating.length === 1, JSON.stringify(sign.floating));

  const hidden = analyseBuilding(building(box(-3, -0.5, -4, 3, 5, 4), box(-1, 1, -1, 1, 2, 1)), quick);
  check('a block sealed inside the body: not shown, not reported', hidden.floating.length === 0 && hidden.hiddenFloating === 1, `hidden ${hidden.hiddenFloating}`);

  const openTop = sum(analyseBuilding(building(box(-3, -0.5, -4, 3, 5, 4, { skip: ['py'] })), quick));
  check('a body without its top face: open from above', openTop.hole > 5, JSON.stringify(openTop));

  const insideOut = sum(analyseBuilding(building(box(-3, -0.5, -4, 3, 5, 4, { inside: true })), quick));
  check('an inside-out body: open from every side', insideOut.hole + insideOut.inverted > 10, JSON.stringify(insideOut));

  const tight = sum(analyseBuilding(hollowHouse(0), quick));
  check('a hollow house, its roof whole: nothing', !tight.floating && !tight.hole && tight.inside < 0.05 && !tight.gap, JSON.stringify(tight));

  const holed = sum(analyseBuilding(hollowHouse(0.7), quick));
  check('a hollow house with a 0.7 m hole in its roof: its inside seen from above', holed.inside > 0.2, JSON.stringify(holed));

  const passage = sum(analyseBuilding(building(box(-4, -0.5, -3, -1.5, 6, 3), box(1.5, -0.5, -3, 4, 6, 3), box(-1.5, 4, -3, 1.5, 6, 3)), quick));
  check('a gate tower over its passage: the passage is no gap', passage.gap === 0 && passage.floating === 0, JSON.stringify(passage));
  return ok;
}
