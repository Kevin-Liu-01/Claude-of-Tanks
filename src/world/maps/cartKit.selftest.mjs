import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CART_RECEIPTS, CART_SETS_FOR_TEST, cartOverrides, cartsForMap } from './cartKit.ts';
import { LEGACY_DRAWS } from './civilianVehicleLegacy.ts';
import { MAP_IDS } from './index.ts';

// The map-vehicles lane (P3, 2026-10-06): every map's handcart, haycart and sled is its place's real type, built in
// the vehicle toolkit's five streams; each builder spends exactly its legacy draws from the destructible stream (no
// later pool moves); each role fits its legacy box, stands on y = 0 and collides by its own footprint and contact band,
// the same on desktop and mobile; rebuilds are byte-identical; the desktop casts through a lighter stand-in.

const ROLES = ['handcart', 'haycart', 'sled'];
const STREAMS = ['color', 'normal', 'position', 'surf', 'uv'];

const digest = (g) => {
  const hash = createHash('sha256');
  for (const key of Object.keys(g.attributes).sort()) {
    const a = g.attributes[key].array;
    hash.update(key).update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  }
  const i = g.index.array;
  hash.update(Buffer.from(i.buffer, i.byteOffset, i.byteLength));
  return hash.digest('hex');
};
const counting = () => {
  let calls = 0, s = 0x2545f491;
  const rng = () => { calls++; s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  return { rng, calls: () => calls };
};
/** The geometry's extents: its solids' plan (the dressing — straw wisps, lashings, bows — left out) and its height. */
const extents = (g) => {
  g.computeBoundingBox();
  const b = g.boundingBox, p = g.attributes.position.array, skip = g.userData.noCollisionVertices;
  let hw = 0, hl = 0;
  for (let v = 0; v < p.length / 3; v++) {
    if (skip && skip[v]) continue;
    hw = Math.max(hw, Math.abs(p[v * 3])); hl = Math.max(hl, Math.abs(p[v * 3 + 2]));
  }
  return { hw, hl, minY: b.min.y, maxY: b.max.y };
};

/** A contact part's plan bounds (collision.ts simpleShapeBounds: convex points are in the record's frame). */
function partBounds(part) {
  if (part.kind === 'circle') return [part.cx - part.r, part.cz - part.r, part.cx + part.r, part.cz + part.r];
  if (part.kind === 'obb') {
    const cs = Math.abs(Math.cos(part.yaw)), sn = Math.abs(Math.sin(part.yaw));
    const ex = part.hw * cs + part.hl * sn, ez = part.hw * sn + part.hl * cs;
    return [part.cx - ex, part.cz - ez, part.cx + ex, part.cz + ez];
  }
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let k = 0; k < part.points.length; k += 2) {
    x0 = Math.min(x0, part.points[k]); x1 = Math.max(x1, part.points[k]);
    z0 = Math.min(z0, part.points[k + 1]); z1 = Math.max(z1, part.points[k + 1]);
  }
  return [x0, z0, x1, z1];
}

// every battlefield has its own set
for (const mapId of MAP_IDS) assert.ok(CART_SETS_FOR_TEST[mapId], `${mapId}: a cart set of its own`);

let built = 0, worst = { handcart: 0, haycart: 0, sled: 0 };
const seen = new Map();
for (const mapId of MAP_IDS) {
  const desktop = cartOverrides(mapId, false), mobile = cartOverrides(mapId, true);
  for (const role of ROLES) {
    const box = CART_RECEIPTS[role];
    const d = desktop[role], m = mobile[role];
    // collision: one footprint and band on both tiers, inside the role's legacy box
    assert.equal(d.hw, m.hw, `${mapId} ${role}: the tiers share the footprint`);
    assert.equal(d.hl, m.hl);
    assert.deepEqual(d.contactBand, m.contactBand, `${mapId} ${role}: the tiers share the contact band`);
    assert.ok(d.hw > 0.2 && d.hw <= box.halfWidth + 1e-6 && d.hl > 0.25 && d.hl <= box.halfLength + 1e-6,
      `${mapId} ${role}: footprint ${d.hw} x ${d.hl} inside the box ${box.halfWidth} x ${box.halfLength}`);
    const band = d.contactBand;
    assert.ok(band.minY > -0.02 && band.maxY <= box.height + box.rise + 1e-6, `${mapId} ${role}: band height ${band.minY}..${band.maxY}`);
    assert.ok(band.parts.length > 0, `${mapId} ${role}: the cart bears on the ground somewhere`);
    for (const part of band.parts) {
      const [x0, z0, x1, z1] = partBounds(part);
      for (const x of [x0, x1]) assert.ok(Math.abs(x) <= d.hw + 0.06, `${mapId} ${role}: a contact part inside the footprint's width (${x})`);
      for (const z of [z0, z1]) assert.ok(Math.abs(z) <= d.hl + 0.06, `${mapId} ${role}: a contact part inside the footprint's length (${z})`);
    }
    // the builders: legacy draws, streams, budgets, ground, fit, determinism
    const key = `${role}:${JSON.stringify(cartsForMap(mapId)[role].model)}`;
    for (const [tier, o] of [['desktop', d], ['mobile', m]]) {
      for (const [state, builder] of [['intact', o.build], ['wrecked', o.broken]]) {
        const c = counting();
        const g = builder(c.rng);
        try {
          assert.equal(c.calls(), LEGACY_DRAWS[role][state === 'intact' ? 'build' : 'broken'],
            `${mapId} ${role} ${tier} ${state}: spends the legacy builder's draws`);
          assert.deepEqual(Object.keys(g.attributes).sort(), STREAMS, `${mapId} ${role}: the vehicle material's streams`);
          for (const a of Object.values(g.attributes)) assert.ok(a.array.every(Number.isFinite), `${mapId} ${role}: finite streams`);
          const tris = g.index.count / 3;
          const budget = tier === 'desktop' ? box.triangleBudget : box.triangleBudget * 0.7;
          assert.ok(tris <= budget, `${mapId} ${role} ${tier} ${state}: ${tris} triangles within ${budget}`);
          const e = extents(g);
          assert.ok(Math.abs(e.minY) < 1e-4, `${mapId} ${role} ${tier} ${state}: stands on y = 0 (${e.minY})`);
          if (state === 'intact') {
            if (tier === 'desktop') worst[role] = Math.max(worst[role], tris);
            // a heaped load's lumps fall on the finer desktop grid a few centimetres apart from the coarse one's
            const slack = cartsForMap(mapId)[role].model.load === 'hay' || cartsForMap(mapId)[role].model.load === 'seaweed' ? 0.07 : 0.03;
            assert.ok(Math.abs(e.hw - d.hw) < slack && Math.abs(e.hl - d.hl) < slack,
              `${mapId} ${role} ${tier}: the body follows its footprint (${e.hw.toFixed(3)} x ${e.hl.toFixed(3)} vs ${d.hw} x ${d.hl})`);
            assert.ok(e.maxY <= box.height + box.rise + 1e-6, `${mapId} ${role}: ${e.maxY.toFixed(2)} m tall within its record and rise`);
          } else {
            assert.ok(e.hw < d.hw * 1.9 + 0.8 && e.hl < d.hl * 1.6 + 0.8, `${mapId} ${role}: the wreck stays by its cart`);
          }
          // a rebuild from the same stream is byte-identical (once per distinct model and tier)
          const id = `${key}/${tier}/${state}`;
          const sum = digest(g);
          if (!seen.has(id)) {
            const again = builder(counting().rng);
            assert.equal(digest(again), sum, `${mapId} ${role} ${tier} ${state}: a rebuild is byte-identical`);
            again.dispose();
            seen.set(id, sum);
          }
          built++;
        } finally { g.dispose(); }
      }
    }
    // the desktop casts through the coarse solid (positions only, fewer triangles); the mobile body casts itself
    assert.equal(typeof d.shadowBuild, 'function', `${mapId} ${role}: a shadow stand-in on desktop`);
    assert.equal(m.shadowBuild, undefined, `${mapId} ${role}: none on mobile`);
    const s = d.shadowBuild();
    assert.deepEqual(Object.keys(s.attributes), ['position'], `${mapId} ${role}: the stand-in is positions only`);
    const full = d.build(counting().rng);
    assert.ok(s.index.count < full.index.count, `${mapId} ${role}: the stand-in is lighter than the body`);
    s.dispose(); full.dispose();
  }
}

// the places' own types
const kind = (mapId, role) => cartsForMap(mapId)[role].model.kind;
assert.equal(kind('blackglass', 'handcart'), 'rickshaw', 'Suzhou Creek, 1937: a pulled rickshaw');
assert.equal(kind('caldera', 'handcart'), 'riyaka', 'the Aso caldera: a riyakā');
assert.equal(kind('ruinspires', 'handcart'), 'cantrolley', 'Sarajevo under siege: the water trolley');
assert.equal(kind('moon', 'handcart'), 'toolcarrier', 'Taurus-Littrow: the hand tool carrier');
assert.equal(kind('mars', 'handcart'), 'evacart');
assert.equal(kind('railyard', 'handcart'), 'trolley', 'the junction: a platform barrow');
assert.equal(kind('foundry', 'handcart'), 'tipcart', 'Völklingen: an ironworks tipping cart');
assert.equal(kind('verdant', 'haycart'), 'wagon4', 'Prokhorovka: a ladder hay wagon');
assert.equal(cartsForMap('verdant').haycart.model.hitch, 'shafts', 'a Russian wagon in shafts');
assert.equal(cartsForMap('longleaf').haycart.model.seat, true, 'Louisiana: a box wagon on its spring seat');
assert.equal(cartsForMap('monsoon').haycart.model.canopy, 'chhai', 'Kohima: a bullock cart under its mat hood');
assert.equal(cartsForMap('coastal').haycart.model.load, 'seaweed', 'the Léon coast: a seaweed cart');
assert.equal(kind('winter', 'haycart'), 'sledge', 'Podhale in January: a hay sledge');
assert.equal(kind('frontier', 'haycart'), 'trailer', 'the Fulda Gap, the 1980s: a bale trailer');
assert.equal(cartsForMap('whiteout').sled.model.style, 'komatik', 'the DEW Line: a komatik');
assert.equal(cartsForMap('alpine').sled.model.style, 'horn', 'the Mont-Cenis: a Hornschlitten');

console.log(`cartKit.selftest: ${built} builds over ${MAP_IDS.length} maps x ${ROLES.length} roles x 2 tiers x 2 states; legacy draws, `
  + `streams, footprints shared by the tiers, the box, the ground, byte-identical rebuilds, stand-ins; worst desktop triangles `
  + `${worst.handcart} / ${worst.haycart} / ${worst.sled}`);
