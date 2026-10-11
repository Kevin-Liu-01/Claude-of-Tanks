// Receipt for the Chouf kit's earth roofs and the flat roof's parapet hook (house.ts RoofSpec parapetBucket and tint;
// the map-revival lane, 2026-10-07, Orchard Valley round 5 after gauntlet wave 251 and the facades lane's read of it:
// the earth roof took the walls' bucket, so every flat roof printed the walls' ashlar).
//   (1) Every other kit builds what it built before the hook: the regional kits' module graph is loaded a second time
//       with house.ts's flat roof restored in its own source, and every builder of every other style is compared over
//       seeds, bucket by bucket, to the bit.
//   (2) The Chouf's earth roofs: the covering in the domes' limewash bucket painted clay, lying inside a parapet of the
//       walls' stone (never a face of the one in the plane of the other's), the spouts (mizrab) through the parapet; most
//       of the village's one-storey houses under the red tile, a share under the earth roof.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { ARCHITECTURE_STYLE_IDS, buildRegionalParts, resolveRegionalArchitecture } from './index.ts';
import { streamFrom } from './geometry.ts';

// ---- (1) the hook changes no other kit
const houseURL = new URL('./house.ts', import.meta.url).href;
let oldHouse = readFileSync(new URL(houseURL), 'utf8');
const swap = (from, to) => {
  assert.equal(oldHouse.split(from).length, 2, `the hook's lines stand in house.ts once: ${from.slice(0, 70)}`);
  oldHouse = oldHouse.replace(from, to);
};
swap(`  parapet?: number;
  /**
   * (map revival lane, 2026-10-07, Orchard's earth roofs)`, `  parapet?: number;
  /**
   * (cut)`);
oldHouse = oldHouse.replace(/  \/\*\*\n   \* \(cut\)[\s\S]*?  tint\?: Rgb;\n/, '');
swap(`, ...(roof.tint ? { tint: roof.tint } : {}) };`, ` };`);
swap(`    const e = roof.eave, th = 0.22;
    const pb = roof.parapetBucket ?? (bucket === 'roof' ? 'plaster' : bucket);
    // a parapet of another bucket rings the covering: the covering lies inside it (no coplanar faces of two surfaces)
    const inset = roof.parapet && pb !== bucket ? th : 0;
    sink.span(bucket, -s - e + inset, eaveY, -halfD - e + inset, s + e - inset, eaveY + t, halfD + e - inset, dec);
    if (roof.parapet) {
      const p = roof.parapet, top = eaveY + t + p;
      sink.span(pb, -s - e, eaveY, halfD + e - th, s + e, top, halfD + e);
      sink.span(pb, -s - e, eaveY, -halfD - e, s + e, top, -halfD - e + th);
      sink.span(pb, s + e - th, eaveY, -halfD - e + th, s + e, top, halfD + e - th);
      sink.span(pb, -s - e, eaveY, -halfD - e + th, -s - e + th, top, halfD + e - th);
    }`, `    const e = roof.eave;
    sink.span(bucket, -s - e, eaveY, -halfD - e, s + e, eaveY + t, halfD + e, dec);
    if (roof.parapet) {
      const p = roof.parapet, th = 0.22, top = eaveY + t + p;
      sink.span(bucket === 'roof' ? 'plaster' : bucket, -s - e, eaveY, halfD + e - th, s + e, top, halfD + e);
      sink.span(bucket === 'roof' ? 'plaster' : bucket, -s - e, eaveY, -halfD - e, s + e, top, -halfD - e + th);
      sink.span(bucket === 'roof' ? 'plaster' : bucket, s + e - th, eaveY, -halfD - e + th, s + e, top, halfD + e - th);
      sink.span(bucket === 'roof' ? 'plaster' : bucket, -s - e, eaveY, -halfD - e + th, -s - e + th, top, halfD + e - th);
    }`);
assert.ok(!/parapetBucket|roof\.tint/.test(oldHouse), 'the reconstruction holds no line of the hook');
// the kits' module graph again under a tag, house.ts from the reconstruction (three and the node modules shared)
const TAG = '?before-parapet-hook';
const hooks = registerHooks({
  resolve(specifier, context, next) {
    const r = next(specifier, context);
    if (context.parentURL?.endsWith(TAG) && r.url.startsWith('file:') && !r.url.includes('/node_modules/')) return { ...r, url: r.url + TAG };
    return r;
  },
  load(url, context, next) {
    if (!url.endsWith(TAG)) return next(url, context);
    const clean = url.slice(0, -TAG.length);
    if (!clean.endsWith('.ts')) return next(clean, context);
    return { format: 'module-typescript', shortCircuit: true, source: clean === houseURL ? oldHouse : readFileSync(new URL(clean), 'utf8') };
  },
});
let before;
try { before = await import(new URL('./index.ts', import.meta.url).href + TAG); } finally { hooks.deregister(); }

const ctxFor = (id, seed, stream) => ({
  structureId: id, info: { w: 8, d: 10, h: 6 }, bounds: { minX: -4, maxX: 4, minZ: -5, maxZ: 5, maxY: 6 },
  wallBucket: 'stone', rng: stream(seed), variant: stream(seed * 7 + 3), mapId: 'selftest', snowCap: false, tier: 'desktop',
});
const digest = (parts) => {
  const h = createHash('sha256');
  for (const [bucket, list] of Object.entries(parts).sort(([a], [b]) => a.localeCompare(b))) {
    h.update(bucket);
    for (const g of list) for (const name of Object.keys(g.attributes).sort()) { h.update(name); h.update(Buffer.from(g.attributes[name].array.buffer)); }
  }
  return h.digest('hex');
};
let compared = 0;
for (const id of ARCHITECTURE_STYLE_IDS) {
  if (id === 'chouf') continue;
  const now = resolveRegionalArchitecture(id), was = before.resolveRegionalArchitecture(id);
  for (const structure of Object.keys(now.builders)) {
    for (const seed of [11, 12, 13]) {
      const a = buildRegionalParts(now, ctxFor(structure, seed, streamFrom), streamFrom(seed * 3 + 5));
      const b = before.buildRegionalParts(was, ctxFor(structure, seed, before.streamFrom ?? streamFrom), (before.streamFrom ?? streamFrom)(seed * 3 + 5));
      assert.equal(digest(a), digest(b), `${id}/${structure}/${seed}: the same build as before the parapet hook`);
      compared++;
    }
  }
}
assert.ok(compared > 500, `every other kit's builders compared (${compared} builds)`);

// ---- (2) the Chouf's earth roofs
const chouf = resolveRegionalArchitecture('chouf');
const INFO = { cottage: [6.0, 8.4, 5.0], bathhouse: [11, 10, 7], marketRow: [12, 5.2, 3.2], granary: [4.2, 6.4, 4.7], barn: [8.4, 12.3, 6.2] };
const build = (id, seed) => {
  const [w, d, h] = INFO[id];
  return buildRegionalParts(chouf, { ...ctxFor(id, seed, streamFrom), info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h }, mapId: 'orchard' },
    streamFrom(seed * 3 + 5));
};
const box = (list, keep = () => true) => {
  const b = new THREE.Box3();
  for (const g of list) if (keep(g)) { g.computeBoundingBox(); b.union(g.boundingBox); }
  return b;
};
/** The covering: up-facing regionalPlaster triangles painted clay (red over blue well above the limewash's). */
function covering(parts) {
  const b = new THREE.Box3(), v = new THREE.Vector3();
  let n = 0;
  for (const g of parts.regionalPlaster) {
    const nor = g.getAttribute('normal'), col = g.getAttribute('color'), pos = g.getAttribute('position');
    for (let i = 0; i < nor.count; i++) {
      if (nor.getY(i) < 0.9 || col.getX(i) / Math.max(1e-6, col.getZ(i)) < 1.25) continue;
      b.expandByPoint(v.set(pos.getX(i), pos.getY(i), pos.getZ(i))); n++;
    }
  }
  return n ? b : null;
}
let earthCottages = 0, tileCottages = 0, roofs = 0;
for (const id of Object.keys(INFO)) {
  for (let seed = 1; seed <= (id === 'cottage' ? 200 : 24); seed++) {
    const parts = build(id, seed);
    const cover = covering(parts);
    if (id === 'cottage') {
      if (cover) earthCottages++;
      else { tileCottages++; assert.ok(parts.regionalRoof.length > 0, `cottage/${seed}: a tile roof where no earth one`); }
    }
    if (!cover) continue;
    roofs++;
    assert.equal(parts.plaster.length + parts.stone.length, 0, `${id}/${seed}: weathered into the regional buckets`);
    // the parapet: solid regionalStone standing over the covering, ringing it 0.22 m wide on every side
    const solid = box(parts.regionalStone, (g) => !g.userData.noCollision);
    assert.ok(solid.max.y > cover.max.y + 0.25, `${id}/${seed}: the stone parapet stands over the earth`);
    for (const [lo, hi] of [[solid.min.x, cover.min.x], [cover.max.x, solid.max.x], [solid.min.z, cover.min.z], [cover.max.z, solid.max.z]]) {
      assert.ok(hi - lo > 0.2, `${id}/${seed}: the covering lies inside the parapet's ring (${(hi - lo).toFixed(3)} m)`);
    }
    // the spouts: dressing stone at the roof's level (the covering's top) standing half a metre past the parapet's face
    let reach = 0;
    for (const g of parts.regionalStone) {
      if (g.userData.noCollision !== true) continue;
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y < cover.max.y - 0.12 || y > cover.max.y + 0.07) continue;
        const x = pos.getX(i), z = pos.getZ(i);
        reach = Math.max(reach, Math.min(Math.max(solid.min.x - x, x - solid.max.x, solid.min.z - z, z - solid.max.z), 9));
      }
    }
    assert.ok(reach > 0.45 && reach < 0.55, `${id}/${seed}: the spouts stand ${reach.toFixed(2)} m proud of the parapet`);
  }
}
const share = earthCottages / (earthCottages + tileCottages);
assert.ok(share > 0.2 && share < 0.4, `a share of the one-storey houses under the earth roof (${share.toFixed(2)}), the rest tiled`);
console.log(`choufEarthRoof.selftest: ${compared} other kits' builds identical to the build before the hook; ${roofs} Chouf earth roofs in clay inside their stone parapets with spouts; cottages ${tileCottages} tiled / ${earthCottages} earth PASS`);
