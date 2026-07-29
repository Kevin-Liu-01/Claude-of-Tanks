// src/world/maps/mapKits.js — per-map set-dressing extras beyond the generic
// props vocabulary (content_breadth r2).
//
// Two exports:
//   MARKET_BUILDERS — plan-name builders (props.js BUILDER_BY_NAME contract:
//     make<X>(rng, buckets, wallBucket?) -> {w,d,h}) for the desert bazaar.
//     Spread into URBAN_BUILDERS (maps/urbanKit.js) so map plans can place
//     'market' entries with ZERO props.js changes.
//   dressMapExtras(ctx) — explicit-position dressing that the road-side plan
//     mechanism cannot reach: Frosthollow's frozen-lake basin gets shoreline
//     reed stands, refrozen pressure-ridge slab chains, a frozen-in rowboat
//     and a short timber jetty. Hooked from props.js right before the bucket
//     merge (see docs/handoff/content_breadth-r2.md — one import + one call).
//
// All geometry is procedural THREE.BufferGeometry pushed into the existing
// material buckets (wood/straw/stone), so it merges into the per-material
// prop meshes and inherits map-toned textures + the grime overlay for free.
// Everything here is soft dressing: no obstacles/colliders (same rule as the
// road-side fence runs), tanks drive through reeds, not into invisible walls.

import * as THREE from 'three';

// --- tiny local twins of the props.js geometry helpers (not exported there;
// same duplication rule as maps/urbanKit.js) ---------------------------------
function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

function box(w, h, d, uvScale = 0.5) {
  const g = new THREE.BoxGeometry(w, h, d);
  return scaleUV(g, Math.max(w, d) * uvScale, h * uvScale);
}

function jitterUV(geo, rng) {
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  const ou = rng() * 7.31, ov = rng() * 5.17;
  const su = 0.86 + rng() * 0.30, sv = 0.86 + rng() * 0.30;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov);
  return geo;
}

// =============================================================================
// DESERT BAZAAR — plan builders ('market', 'marketRow')
// =============================================================================

// A single souk stall: timber posts under a sagging fabric awning, a low
// counter, crate + pot clutter and a ground rug. Reads as commerce at the
// crossroads without blocking a driving lane (h kept low, footprint small).
function makeMarketStall(rng, buckets) {
  const w = 6.6, d = 5.2;
  const ph = 2.2 + rng() * 0.4;
  // 4 corner posts (slightly splayed like re-driven timber)
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const post = box(0.16, ph, 0.16, 1.2);
    post.rotateZ((rng() - 0.5) * 0.06);
    post.translate(sx * (w / 2 - 0.7), ph / 2, sz * (d / 2 - 0.7));
    buckets.wood.push(jitterUV(post, rng));
  }
  // awning: thin plaster-toned slab (sun-bleached canvas), pitched + skewed
  const awn = box(w - 0.4, 0.09, d - 0.4, 0.35);
  awn.rotateX((rng() - 0.5) * 0.10 - 0.06);
  awn.rotateZ((rng() - 0.5) * 0.10);
  awn.translate(0, ph + 0.05, 0);
  buckets.plaster.push(jitterUV(awn, rng));
  // ragged valance strip on the street edge
  const val = box(w - 0.6, 0.5, 0.06, 0.5);
  val.translate(0, ph - 0.28, d / 2 - 0.55);
  buckets.plaster.push(jitterUV(val, rng));
  // low counter + goods
  const counter = box(2.6, 0.85, 0.9, 0.8);
  counter.translate(-0.6, 0.43, d / 2 - 1.35);
  buckets.wood.push(jitterUV(counter, rng));
  for (let k = 0, n = 2 + ((rng() * 3) | 0); k < n; k++) {
    const cs = 0.55 + rng() * 0.4;
    const crate = box(cs, cs, cs, 1.0);
    crate.rotateY(rng() * Math.PI * 0.5);
    crate.translate(-w / 2 + 1.2 + rng() * 1.6, cs / 2, -d / 2 + 1.1 + rng() * (d - 2.2));
    buckets.wood.push(jitterUV(crate, rng));
  }
  // clay pots (sandstone-toned) clustered by a post
  for (let k = 0, n = 2 + ((rng() * 3) | 0); k < n; k++) {
    const pr = 0.24 + rng() * 0.16, phg = 0.5 + rng() * 0.3;
    const pot = new THREE.CylinderGeometry(pr * 0.7, pr, phg, 8, 1);
    scaleUV(pot, 2, 1);
    pot.translate(w / 2 - 1.0 - rng() * 1.2, phg / 2, -d / 2 + 0.9 + rng() * 1.4);
    buckets.stone.push(jitterUV(pot, rng));
  }
  // ground rug (roof-tile tone reads as a dyed red carpet at range)
  const rug = box(1.8 + rng() * 0.8, 0.05, 2.6 + rng() * 0.6, 0.4);
  rug.rotateY((rng() - 0.5) * 0.4);
  rug.translate(0.9, 0.035, 0.2);
  buckets.roof.push(jitterUV(rug, rng));
  return { w, d, h: ph + 0.4 };
}

// Two stalls back-to-back with a shared alley of clutter — fills a wider
// road-side slot so the bazaar reads as a block, not a lone tent.
function makeMarketRow(rng, buckets) {
  const a = makeMarketStall(rng, buckets);
  // second stall, offset along x, mirrored
  const tmp = { wood: [], plaster: [], stone: [], roof: [] };
  const b = makeMarketStall(rng, tmp);
  const off = a.w / 2 + b.w / 2 - 1.2;
  for (const key of Object.keys(tmp)) {
    for (const g of tmp[key]) {
      g.rotateY(Math.PI + (rng() - 0.5) * 0.2);
      g.translate(off, 0, (rng() - 0.5) * 1.2);
      buckets[key].push(g);
    }
  }
  // shared clutter: sacks (straw-less desert: use stone-toned bags -> plaster)
  for (let k = 0; k < 3; k++) {
    const s = 0.5 + rng() * 0.25;
    const sack = new THREE.SphereGeometry(s, 7, 5);
    scaleUV(sack, 1.5, 1);
    sack.scale(1, 0.72, 1);
    sack.translate(off / 2 + (rng() - 0.5) * 2.4, s * 0.5, (rng() - 0.5) * 2.4);
    buckets.plaster.push(jitterUV(sack, rng));
  }
  return { w: a.w + b.w - 1.2, d: Math.max(a.d, b.d), h: a.h };
}

/** Plan-name builders to spread into URBAN_BUILDERS (props.js contract). */
export const MARKET_BUILDERS = { market: makeMarketStall, marketRow: makeMarketRow };

// =============================================================================
// FROSTHOLLOW LAKE BASIN — explicit-position dressing
// =============================================================================

// One clump of frozen shoreline reeds: 6-11 thin rimed stalks with a couple
// of bent heads. Straw bucket — winter maps tone straw to pale rime.
function reedClump(buckets, rng, x, y, z) {
  // stalks sized to survive establishing-shot minification (~350 m): a
  // 5 cm-wide stick disappears at that range, so the clump reads through a
  // few taller, thicker rimed stems over a skirt of short ones
  const n = 8 + ((rng() * 7) | 0);
  for (let k = 0; k < n; k++) {
    const tall = k < 3;
    const h = tall ? 1.15 + rng() * 0.6 : 0.6 + rng() * 0.6;
    const w = tall ? 0.10 + rng() * 0.05 : 0.06 + rng() * 0.04;
    const st = box(w, h, w, 2.0);
    st.rotateX((rng() - 0.5) * 0.24);
    st.rotateZ((rng() - 0.5) * 0.24);
    st.rotateY(rng() * Math.PI);
    st.translate(x + (rng() - 0.5) * 2.2, y + h / 2 - 0.06, z + (rng() - 0.5) * 2.2);
    buckets.straw.push(st);
  }
  // the odd broken-over head
  if (rng() < 0.6) {
    const bh = box(0.07, 0.55, 0.07, 2.0);
    bh.rotateZ(1.2 + rng() * 0.3);
    bh.translate(x + (rng() - 0.5) * 1.2, y + 0.55, z + (rng() - 0.5) * 1.2);
    buckets.straw.push(bh);
  }
}

// A chain of upthrust refrozen ice slabs (pressure ridge) marching along a
// short arc on the sheet. Stone bucket — winter stone is pale snow-dusted, so
// tilted thin plates read as broken refrozen ice with real shadow lines.
function pressureRidge(buckets, rng, cx, cz, y, ang, len) {
  // near-continuous chain (1.6 m pitch, plates overlapping) — sparse plates
  // minified to scattered specks; a ridge must read as a LINE across the ice
  const n = Math.max(5, Math.round(len / 1.6));
  for (let k = 0; k < n; k++) {
    const t = (k / (n - 1) - 0.5) * len;
    const px = cx + Math.cos(ang) * t + (rng() - 0.5) * 0.6;
    const pz = cz + Math.sin(ang) * t + (rng() - 0.5) * 0.6;
    const pw = 1.8 + rng() * 1.4, phh = 0.38 + rng() * 0.5;
    const slab = box(pw, phh, 0.18 + rng() * 0.12, 0.8);
    slab.rotateZ((rng() - 0.5) * 0.5);           // canted plates
    slab.rotateX((rng() - 0.5) * 0.55);
    slab.rotateY(-ang + (rng() - 0.5) * 0.35);
    slab.translate(px, y + phh * 0.32, pz);
    buckets.stone.push(jitterUV(slab, rng));
  }
}

// Weathered rowboat frozen into the sheet near the shore — planked sides,
// transom and two bench thwarts, listing a few degrees.
function frozenRowboat(buckets, rng, x, y, z, yaw) {
  const parts = [];
  const L = 3.4, W = 1.25, H = 0.52;
  for (const s of [-1, 1]) { // side planks (two lapped strakes each)
    for (let r = 0; r < 2; r++) {
      const pl = box(L - r * 0.5, 0.20, 0.06, 1.2);
      pl.rotateZ((rng() - 0.5) * 0.03);
      pl.translate(0, 0.14 + r * 0.18, s * (W / 2 - r * 0.06));
      parts.push(pl);
    }
  }
  const bow = box(0.07, H * 0.8, W * 0.8, 1.2);
  bow.rotateY(Math.PI / 4);
  bow.translate(L / 2 - 0.12, H * 0.42, 0);
  parts.push(bow);
  const transom = box(0.07, H * 0.75, W * 0.9, 1.2);
  transom.translate(-L / 2 + 0.1, H * 0.4, 0);
  parts.push(transom);
  for (const tx of [-0.7, 0.55]) { // thwarts
    const th = box(0.26, 0.05, W * 0.94, 1.2);
    th.translate(tx, H * 0.62, 0);
    parts.push(th);
  }
  for (const g of parts) {
    g.rotateZ(0.06 + rng() * 0.05); // frozen-in list
    g.rotateY(yaw);
    g.translate(x, y - 0.10, z);    // hull bitten into the ice
    buckets.wood.push(jitterUV(g, rng));
  }
}

// Short timber jetty walking off the shore onto the ice: paired piles with a
// plank deck, ending in a slight sag.
function jetty(buckets, rng, x0, z0, ang, y, len = 7.5) {
  const n = Math.round(len / 1.9);
  const dx = Math.cos(ang), dz = Math.sin(ang);
  const px = -dz, pz = dx; // deck width axis
  for (let k = 0; k <= n; k++) {
    const t = k * 1.9;
    for (const s of [-1, 1]) {
      const ph = 0.9 - k * 0.04;
      const pile = box(0.16, ph, 0.16, 1.2);
      pile.rotateY(rng() * 0.3);
      pile.translate(x0 + dx * t + px * 0.65 * s, y + ph / 2 - 0.05, z0 + dz * t + pz * 0.65 * s);
      buckets.wood.push(jitterUV(pile, rng));
    }
  }
  for (let k = 0; k < n; k++) { // deck segments with a soft sag
    const t = (k + 0.5) * 1.9;
    const deck = box(1.95, 0.09, 1.5, 1.2);
    deck.rotateY(-Math.atan2(dz, dx));
    deck.translate(x0 + dx * t, y + 0.82 - k * 0.05, z0 + dz * t);
    buckets.wood.push(jitterUV(deck, rng));
  }
}

/**
 * Map-specific dressing pass — call from props.js createProps right before
 * the bucket merge ("--- merge buckets into one mesh per material ---").
 * @param {object} ctx {mapId, L (layout), heightField, rng, buckets}
 */
export function dressMapExtras({ mapId, L, heightField, rng, buckets }) {
  if (mapId !== 'winter' || !L.lakes || !L.lakes.length) return;
  for (const lake of L.lakes) {
    const big = lake.r >= 80; // the signature basin gets the full treatment
    // --- shoreline reed stands: clumped along the drift band -------------
    const clumps = Math.round(lake.r * (big ? 0.52 : 0.3));
    for (let i = 0; i < clumps; i++) {
      const a = rng() * Math.PI * 2;
      const rr = lake.r * (0.82 + rng() * 0.22);
      const x = lake.x + Math.cos(a) * rr, z = lake.z + Math.sin(a) * rr;
      if (Math.max(Math.abs(x), Math.abs(z)) > 480) continue;
      if (heightField._roadDist(x, z) < 6) continue;
      reedClump(buckets, rng, x, heightField.getHeightAt(x, z), z);
    }
    // --- refrozen pressure ridges out on the sheet ------------------------
    const ridges = big ? 7 : 2;
    for (let i = 0; i < ridges; i++) {
      const a = rng() * Math.PI * 2;
      const rr = lake.r * (0.16 + rng() * 0.5);
      const x = lake.x + Math.cos(a) * rr, z = lake.z + Math.sin(a) * rr;
      pressureRidge(buckets, rng, x, z, heightField.getHeightAt(x, z),
        rng() * Math.PI, 10 + rng() * 10);
    }
    if (!big) continue;
    // --- one frozen-in rowboat + a sagging jetty on the near shore -------
    // deterministic-ish placement on the south-west shore (faces the
    // establishing camera at [40,52,-288] for the signature lake)
    const ba = Math.PI * 1.32 + rng() * 0.2;
    const bx = lake.x + Math.cos(ba) * lake.r * 0.86;
    const bz = lake.z + Math.sin(ba) * lake.r * 0.86;
    frozenRowboat(buckets, rng, bx, heightField.getHeightAt(bx, bz), bz, ba + Math.PI / 2);
    const ja = ba + 0.45;
    const jx = lake.x + Math.cos(ja) * lake.r * 1.02;
    const jz = lake.z + Math.sin(ja) * lake.r * 1.02;
    jetty(buckets, rng, jx, jz, ja + Math.PI, heightField.getHeightAt(jx, jz));
  }
}
