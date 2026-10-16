// craterEjecta.selftest.mjs — the craters' ejecta by the ground struck (props lane A, #19, 2026-10-15): every map has its
// climate; sand only slumped clumps of its rim (low and smooth); each piece is a small closed-enough body on the baked family's attributes, part-buried
// (its foot under y 0), under its triangle cap, coloured as its ground (grass over soil on turf, the snow over its
// spatter, the asphalt dark), deterministic at its seed.
import assert from 'node:assert/strict';
import { MAP_IDS } from './catalog.ts';
import { ejectaClimateOf, ejectaPiece } from './craterEjecta.ts';

const seen = new Set();
for (const mapId of MAP_IDS) {
  const climate = ejectaClimateOf(mapId);
  seen.add(climate);
  for (let i = 0; i < 12; i++) {
    const size = 0.14 + (i / 11) * 0.26, g = ejectaPiece(climate, mapId, size, 7 + i * 131);
    assert.deepEqual(Object.keys(g.attributes).sort(), ['color', 'normal', 'position', 'uv'], 'the baked family\'s attributes');
    assert.equal(g.index, null);
    const p = g.attributes.position, c = g.attributes.color, tris = p.count / 3;
    assert.ok(tris >= 8 && tris <= 90, `${mapId}: ${tris} triangles`);
    let lo = Infinity, hi = -Infinity, spanX = 0;
    for (let k = 0; k < p.count; k++) {
      lo = Math.min(lo, p.getY(k)); hi = Math.max(hi, p.getY(k)); spanX = Math.max(spanX, Math.abs(p.getX(k)), Math.abs(p.getZ(k)));
      assert.ok([p.getX(k), p.getY(k), p.getZ(k), c.getX(k), c.getY(k), c.getZ(k)].every(Number.isFinite));
    }
    if (climate !== 'town') assert.ok(lo < -0.005, `${mapId}: part-buried`);
    assert.ok(hi > 0.02 && hi < size * 1.1, `${mapId}: stands ${hi.toFixed(3)} m, inside its size`);
    if (climate === 'sand') assert.ok(hi < size * 0.32, `${mapId}: a sand clump slumps (${hi.toFixed(3)} m at ${size.toFixed(2)})`);
    assert.ok(spanX <= size * 1.05, `${mapId}: no wider than its size`);
    const again = ejectaPiece(climate, mapId, size, 7 + i * 131);
    assert.deepEqual(again.attributes.position.array, p.array, 'deterministic');
  }
}
assert.deepEqual([...seen].sort(), ['ash', 'mud', 'regolith', 'sand', 'snow', 'town', 'turf'], 'every climate in use');
// the grounds' colours: a sod's grass (green over red) on its top, the snow pale, the asphalt dark
const avg = (g, pick) => { const c = g.attributes.color, p = g.attributes.position; let s = [0, 0, 0], n = 0;
  for (let k = 0; k < c.count; k++) if (pick(p.getY(k))) { s[0] += c.getX(k); s[1] += c.getY(k); s[2] += c.getZ(k); n++; } return s.map((v) => v / Math.max(1, n)); };
let green = 0;
for (let i = 0; i < 20; i++) { const t = avg(ejectaPiece('turf', 'verdant', 0.3, i), (y) => y > 0.08); if (t[1] > t[0]) green++; }
assert.ok(green >= 10, `most sods land grass up (${green}/20)`);
assert.ok(avg(ejectaPiece('snow', 'winter', 0.3, 3), () => true)[2] > 0.3, 'snow lumps pale');
assert.equal(ejectaClimateOf('orchard'), 'turf'); assert.equal(ejectaClimateOf('mars'), 'regolith'); assert.equal(ejectaClimateOf('desert'), 'sand');
console.log(`craterEjecta.selftest: ${MAP_IDS.length} maps, ${seen.size} climates, sand clumps slumped, pieces part-buried and deterministic`);
