import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BOAT_FAMILIES, boatFamilyForMap, buildBoat, familyBoat } from './boatHulls.ts';

// The map-vehicles lane (P2, 2026-10-05): every coast's boat is a lofted hull — one indexed geometry in the baked
// bucket's four streams, its keel on y = 0, its length on +Z, inside its family's dimensions, its triangles bounded,
// rebuilt byte for byte from the same scheme and length; the coasts take their own families.

const digest = (g) => {
  const hash = createHash('sha256');
  for (const key of Object.keys(g.attributes).sort()) {
    const a = g.attributes[key].array; hash.update(key).update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  }
  const i = g.index.array; hash.update(Buffer.from(i.buffer, i.byteOffset, i.byteLength));
  return hash.digest('hex');
};

let hulls = 0, worst = 0;
for (const [name, family] of Object.entries(BOAT_FAMILIES)) {
  assert.ok(family.schemes.length >= 2, `${name}: more than one colour scheme on its coast`);
  for (const length of [4.6, 5.2, 5.8]) for (const scheme of [0, 1, 7]) for (const mast of [false, true]) {
    const g = familyBoat(family, length, scheme, mast);
    try {
      assert.deepEqual(Object.keys(g.attributes).sort(), ['color', 'normal', 'position', 'uv'], `${name}: the baked bucket's streams`);
      assert.ok(g.index && g.index.count % 3 === 0, `${name}: indexed whole triangles`);
      for (const a of Object.values(g.attributes)) assert.ok(a.array.every(Number.isFinite), `${name}: finite`);
      g.computeBoundingBox();
      const b = g.boundingBox;
      assert.ok(Math.abs(b.min.y + 0.032) < 0.02, `${name}: the keel strip under y = 0 (${b.min.y.toFixed(3)})`);
      const len = b.max.z - b.min.z;
      assert.ok(len > length * 0.95 && len < length * 1.25, `${name}: its length on +Z (${len.toFixed(2)} for ${length})`);
      assert.ok(b.max.x - b.min.x < family.hull.beam * 1.25 + 0.1, `${name}: inside its beam`);
      assert.ok(Math.abs(b.max.x + b.min.x) < 1e-4, `${name}: symmetric about the keel`);
      assert.ok(mast ? b.max.y > length * 0.55 : b.max.y < family.hull.depth * 2.2 + family.hull.posts + 0.4, `${name}: the mast ${mast ? 'stands' : 'is absent'}`);
      const triangles = g.index.count / 3;
      worst = Math.max(worst, triangles);
      assert.ok(triangles <= 4800, `${name}: ${triangles} triangles within the boat budget`);
      const again = familyBoat(family, length, scheme, mast);
      assert.equal(digest(again), digest(g), `${name}: a rebuild is byte-identical`);
      again.dispose();
      hulls++;
    } finally { g.dispose(); }
  }
}
// the painted colours differ between schemes (the coast's variety) and the hull reads its scheme only
const a = familyBoat(BOAT_FAMILIES.canot, 5.2, 0, false), b = familyBoat(BOAT_FAMILIES.canot, 5.2, 1, false);
assert.notEqual(digest(a), digest(b), 'two schemes paint two boats');
a.dispose(); b.dispose();
// afloat (a moored hull, 2026-10-07): the planking soaked dark from the keel to 0.1 m over the water and a weed-and-slime
// strip at the waterline (dressing); ashore the same hull is untouched by both
{
  const draft = 0.28;
  for (const [name, family] of Object.entries(BOAT_FAMILIES)) {
    const dry = familyBoat(family, family.hull.length, 0, false), wet = familyBoat(family, family.hull.length, 0, false, false, draft);
    try {
      assert.ok(wet.index.count > dry.index.count, `${name}: the waterline strip is built`);
      // the outer skin's colour low on the hull against the same vertices dry: soaked under the water (a painted hull
      // darkens; a tarred one, near black already, takes the stain and stays as dark)
      const pd = dry.attributes.position.array, nd = dry.attributes.normal.array, cd = dry.attributes.color.array, cw = wet.attributes.color.array;
      let low = 0, soaked = 0, high = 0, kept = 0;
      const lum = (c, i) => c[i * 3] + c[i * 3 + 1] + c[i * 3 + 2];
      for (let v = 0; v < pd.length / 3; v++) {
        const x = pd[v * 3], y = pd[v * 3 + 1], nx = nd[v * 3];
        if (Math.abs(x) < 0.05 || nx * x <= 0) continue; // the outer skin only (normals out from the keel line)
        if (y < draft - 0.03) { low++; if (lum(cw, v) < lum(cd, v) * 0.75 || (lum(cd, v) < 0.12 && Math.abs(lum(cw, v) - lum(cd, v)) > 1e-4)) soaked++; }
        if (y > draft + 0.2) { high++; if (Math.abs(lum(cw, v) - lum(cd, v)) < 1e-6) kept++; }
      }
      assert.ok(low > 10 && soaked / low > 0.9, `${name}: the planking under the water is soaked (${soaked}/${low})`);
      assert.ok(high > 10 && kept / high > 0.95, `${name}: the topsides stay as painted (${kept}/${high})`);
    } finally { dry.dispose(); wet.dispose(); }
  }
}
// a spec builds without a family too (the kits' only door is familyBoat; buildBoat stays the primitive)
const bare = buildBoat({ ...BOAT_FAMILIES.lakeboat.hull, ...BOAT_FAMILIES.lakeboat.schemes[0] }, { scheme: 0, mast: false });
assert.ok(bare.index.count > 0);
bare.dispose();
// each coast its own boat
assert.equal(boatFamilyForMap('fjord'), BOAT_FAMILIES.faering, 'Narvik: the Nordland færing');
assert.equal(boatFamilyForMap('coastal'), BOAT_FAMILIES.canot, 'the Léon coast: the canot');
assert.equal(boatFamilyForMap('saltwind'), BOAT_FAMILIES.gajeta, 'Dalmatia: the gajeta');
assert.equal(boatFamilyForMap('mangrove'), BOAT_FAMILIES.xuong, 'Ca Mau: the xuồng');
assert.equal(boatFamilyForMap('delta'), BOAT_FAMILIES.nouka, 'the Jamuna: a nouka');
assert.equal(boatFamilyForMap('alpine'), BOAT_FAMILIES.lakeboat, 'the Mont-Cenis lake: a plank rowing boat');
console.log(`boatHulls.selftest: ${hulls} hulls over ${Object.keys(BOAT_FAMILIES).length} families, keels on the ground, `
  + `dimensions, budgets (worst ${worst} triangles) and byte-identical rebuilds`);
