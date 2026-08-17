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

// =============================================================================
// DESERT WALLED COMPOUNDS — plan builders ('compound', 'compoundSouk')
// content_breadth r5: the critique's "adobe 'village' is ~6 small boxes
// scattered on a bare sand pan with no compound walls/courtyards". Real
// crossroads settlements cluster into WALLED family compounds: a mud-brick
// perimeter with a gate, a 2-story main house in a back corner, an annex, a
// well/souk anchor and lived-in courtyard clutter. Each compound registers as
// ONE plan building, so it inherits ground-fit, the worn-earth apron decal,
// minimap footprint and collision for free.
// =============================================================================

// mud-brick perimeter wall with a gate gap on the street face (+z), coping
// course and gate posts. Returns nothing; pushes into buckets.
function compoundWall(rng, buckets, w, d, wallH) {
  const T = 0.42;
  // coping rides the SAME plaster print as the wall — the derived plaster2
  // shift renders as a saturated orange stripe under the desert sun (probed
  // on the r5 establishing shot); the 0.14 m geometric lip alone reads as a
  // finished mud-brick cap
  const cop = (g) => buckets.plaster.push(jitterUV(g, rng));
  const wal = (g) => buckets.plaster.push(jitterUV(g, rng));
  // back + side walls (slight per-run lean/settle so runs read hand-built)
  const runs = [
    { x: 0, z: -d / 2, wx: w, wz: T },
    { x: -w / 2, z: 0, wx: T, wz: d - T },
    { x: w / 2, z: 0, wx: T, wz: d - T },
  ];
  for (const r of runs) {
    const g = box(r.wx, wallH, r.wz, 0.8);
    g.rotateY((rng() - 0.5) * 0.015);
    g.translate(r.x, wallH / 2, r.z);
    wal(g);
    const c = box(r.wx + 0.14, 0.14, r.wz + 0.14, 0.8);
    c.translate(r.x, wallH + 0.07, r.z);
    cop(c);
  }
  // front wall split by a 3.6 m gate (offset from center like real lanes)
  const gx = w * (0.10 + rng() * 0.10) * (rng() < 0.5 ? -1 : 1);
  const segs = [
    { x0: -w / 2, x1: gx - 1.8 },
    { x0: gx + 1.8, x1: w / 2 },
  ];
  for (const s of segs) {
    const ww = s.x1 - s.x0;
    if (ww < 0.8) continue;
    const g = box(ww, wallH, T, 0.8);
    g.translate((s.x0 + s.x1) / 2, wallH / 2, d / 2);
    wal(g);
    const c = box(ww + 0.14, 0.14, T + 0.14, 0.8);
    c.translate((s.x0 + s.x1) / 2, wallH + 0.07, d / 2);
    cop(c);
  }
  // gate posts + timber lintel
  for (const s of [-1, 1]) {
    const p = box(0.55, wallH + 0.65, 0.55, 1.0);
    p.translate(gx + s * 1.95, (wallH + 0.65) / 2, d / 2);
    buckets.plaster.push(jitterUV(p, rng));
  }
  const lin = box(4.5, 0.16, 0.22, 1.2);
  lin.translate(gx, wallH + 0.30, d / 2);
  buckets.wood.push(jitterUV(lin, rng));
  return gx;
}

// flat-roofed adobe block with parapet, viga beam ends, door + windows on the
// courtyard face — the same massing language as props.js makeAdobe.
function adobeBlock(rng, buckets, bw, bd, bh, x, z, doorAxis = 'z', tone = 'plaster') {
  const wal = buckets[tone] ? tone : 'plaster';
  const base = box(bw + 0.25, 0.6, bd + 0.25, 0.8);
  base.translate(x, -0.1, z);
  buckets.stone.push(jitterUV(base, rng));
  const blk = box(bw, bh, bd, 0.6);
  blk.translate(x, bh / 2, z);
  buckets[wal].push(jitterUV(blk, rng));
  // parapet
  for (const [px, pz, pw, pdep] of [
    [0, bd / 2 - 0.08, bw, 0.16], [0, -bd / 2 + 0.08, bw, 0.16],
    [bw / 2 - 0.08, 0, 0.16, bd - 0.32], [-bw / 2 + 0.08, 0, 0.16, bd - 0.32],
  ]) {
    const p = box(pw, 0.42, pdep, 0.8);
    p.translate(x + px, bh + 0.21, z + pz);
    buckets[wal].push(jitterUV(p, rng));
  }
  // roof deck: sun-bleached MUD roof (BASE plaster tone), not wood planking —
  // from the raised establishing camera a big timber deck read as a dark
  // brown slab, and the derived plaster3 shift (hue -0.035) rendered a big
  // sunlit deck saturated RED (both probed r5); vigas keep the timber cue
  const deck = box(bw - 0.2, 0.08, bd - 0.2, 0.35);
  deck.translate(x, bh + 0.02, z);
  buckets.plaster.push(jitterUV(deck, rng));
  // viga beam ends on the door face
  const dSign = 1;
  const nBeam = Math.max(3, (bw / 0.95) | 0);
  for (let k = 0; k < nBeam; k++) {
    const bx = -bw / 2 + (k + 0.5) * (bw / nBeam);
    const beam = box(0.13, 0.13, 0.5, 1.2);
    if (doorAxis === 'z') beam.translate(x + bx, bh - 0.3, z + dSign * (bd / 2 + 0.2));
    else beam.translate(x + dSign * (bw / 2 + 0.2), bh - 0.3, z + bx);
    buckets.wood.push(beam);
  }
  // door + a pair of small windows (courtyard face)
  const dr = box(1.0, 1.9, 0.10, 1.0);
  const drD = box(0.8, 1.7, 0.06, 1.0);
  if (doorAxis === 'z') {
    dr.translate(x + bw * 0.14, 0.95, z + bd / 2 + 0.06);
    drD.translate(x + bw * 0.14, 0.9, z + bd / 2 + 0.10);
  } else {
    dr.rotateY(Math.PI / 2); drD.rotateY(Math.PI / 2);
    dr.translate(x + bw / 2 + 0.06, 0.95, z + bd * 0.14);
    drD.translate(x + bw / 2 + 0.10, 0.9, z + bd * 0.14);
  }
  buckets.wood.push(dr); buckets.dark.push(drD);
  for (const s of [-1, 1]) {
    const wnd = box(0.55, 0.65, 0.06, 1.0);
    if (doorAxis === 'z') wnd.translate(x - bw * 0.24 + (s > 0 ? bw * 0.5 : 0), bh - 0.95, z + bd / 2 + 0.05);
    else { wnd.rotateY(Math.PI / 2); wnd.translate(x + bw / 2 + 0.05, bh - 0.95, z - bd * 0.24 + (s > 0 ? bd * 0.5 : 0)); }
    buckets.dark.push(wnd);
  }
  if (rng() < 0.5) { // rooftop stair hut
    const hut = box(bw * 0.32, 0.9, bd * 0.3, 0.8);
    hut.translate(x - bw * 0.2, bh + 0.45, z - bd * 0.2);
    buckets[wal].push(jitterUV(hut, rng));
  }
}

// courtyard well: stone ring, two posts, crossbar + bucket
function courtyardWell(rng, buckets, x, z) {
  const ring = new THREE.CylinderGeometry(0.85, 0.95, 0.85, 9, 1);
  scaleUV(ring, 3, 1);
  ring.translate(x, 0.42, z);
  buckets.stone.push(jitterUV(ring, rng));
  for (const s of [-1, 1]) {
    const p = box(0.14, 1.9, 0.14, 1.2);
    p.translate(x + s * 0.75, 0.95, z);
    buckets.wood.push(p);
  }
  const bar = box(1.8, 0.10, 0.10, 1.2);
  bar.translate(x, 1.8, z);
  buckets.wood.push(bar);
  const bk = box(0.3, 0.3, 0.3, 1.2);
  bk.translate(x + 0.2, 1.35, z);
  buckets.dark.push(bk);
}

// scattered courtyard living clutter: crates, clay pots, sacks, a rug
function courtyardClutter(rng, buckets, w, d, n) {
  for (let k = 0; k < n; k++) {
    const cx = (rng() - 0.5) * (w - 5), cz = (rng() - 0.5) * (d - 5);
    const roll = rng();
    if (roll < 0.34) {
      const cs = 0.5 + rng() * 0.4;
      const crate = box(cs, cs, cs, 1.0);
      crate.rotateY(rng() * Math.PI * 0.5);
      crate.translate(cx, cs / 2, cz);
      buckets.wood.push(jitterUV(crate, rng));
    } else if (roll < 0.62) {
      const pr = 0.22 + rng() * 0.16, ph = 0.5 + rng() * 0.3;
      const pot = new THREE.CylinderGeometry(pr * 0.7, pr, ph, 8, 1);
      scaleUV(pot, 2, 1);
      pot.translate(cx, ph / 2, cz);
      buckets.stone.push(jitterUV(pot, rng));
    } else if (roll < 0.82) {
      const s = 0.42 + rng() * 0.22;
      const sack = new THREE.SphereGeometry(s, 7, 5);
      scaleUV(sack, 1.5, 1);
      sack.scale(1, 0.7, 1);
      sack.translate(cx, s * 0.48, cz);
      buckets.plaster.push(jitterUV(sack, rng));
    } else {
      const rug = box(1.5 + rng() * 0.8, 0.05, 2.2 + rng() * 0.6, 0.4);
      rug.rotateY((rng() - 0.5) * 0.6);
      rug.translate(cx, 0.035, cz);
      buckets.roof.push(jitterUV(rug, rng));
    }
  }
}

/**
 * Walled family compound: perimeter wall + gate, 2-story main house, 1-story
 * annex, well anchor, courtyard clutter. w runs ALONG the street so the
 * footprint stays shallow enough for the road-side placement lattice.
 */
function makeCompound(rng, buckets) {
  const w = 21 + rng() * 3, d = 13.5 + rng() * 1.5;
  const wallH = 2.05 + rng() * 0.3;
  compoundWall(rng, buckets, w, d, wallH);
  // main house in a back corner (2-story), door onto the courtyard
  const hw = 7.6 + rng() * 1.2, hd = 5.6 + rng() * 0.8, hh = 5.1 + rng() * 0.5;
  const hs = rng() < 0.5 ? -1 : 1;
  const hx = hs * (w / 2 - hw / 2 - 0.55), hz = -d / 2 + hd / 2 + 0.55;
  adobeBlock(rng, buckets, hw, hd, hh, hx, hz, 'z', 'plaster');
  // single-story annex against the opposite side wall (base plaster: the
  // derived plaster3 family carries a red hue shift that reads brick, not
  // mud, under the desert sun — probed r5)
  const aw = 4.6 + rng() * 1.0, ad = 3.8 + rng() * 0.8, ah = 2.75 + rng() * 0.3;
  const ax = -hs * (w / 2 - aw / 2 - 0.5), az = -d / 2 + ad / 2 + 0.6;
  adobeBlock(rng, buckets, aw, ad, ah, ax, az, 'z', 'plaster');
  // lean-to awning off the annex (shade for goods/animals)
  const awn = box(aw * 0.9, 0.08, 2.4, 0.35);
  awn.rotateX(-0.12);
  awn.translate(ax, ah - 0.35, az + ad / 2 + 1.15);
  buckets.plaster.push(jitterUV(awn, rng));
  for (const s of [-1, 1]) {
    const p = box(0.13, ah - 0.75, 0.13, 1.2);
    p.translate(ax + s * aw * 0.4, (ah - 0.75) / 2, az + ad / 2 + 2.1);
    buckets.wood.push(p);
  }
  // well just off courtyard center + lived-in clutter
  courtyardWell(rng, buckets, -hs * w * 0.08, d * 0.12);
  courtyardClutter(rng, buckets, w, d, 6 + ((rng() * 3) | 0));
  return { w: w + 0.5, d: d + 0.5, h: hh + 0.5 };
}

/**
 * Souk compound: walled yard with a shop row along the back wall, an awning
 * stall, corner watch-post and dense goods clutter — the market anchor.
 */
function makeCompoundSouk(rng, buckets) {
  const w = 19 + rng() * 2.5, d = 13 + rng() * 1.5;
  const wallH = 1.95 + rng() * 0.25;
  compoundWall(rng, buckets, w, d, wallH);
  // shop row: long single-story block against the back wall, wide dark bays.
  // BASE plaster only — both derived families shift hue on desert (plaster2
  // orange, plaster3 brick-red) and a 12 m block wears the cast loudly
  const sw = w * 0.62, sd = 4.0, sh = 3.05 + rng() * 0.25;
  const sx = -w * 0.12, sz = -d / 2 + sd / 2 + 0.55;
  adobeBlock(rng, buckets, sw, sd, sh, sx, sz, 'z', 'plaster');
  for (let k = 0; k < 3; k++) { // open market bays punched into the row
    const bx = sx - sw / 2 + (k + 0.5) * (sw / 3);
    const bay = box(1.7, 1.9, 0.08, 1.0);
    bay.translate(bx, 1.0, sz + sd / 2 + 0.07);
    buckets.dark.push(bay);
  }
  // corner watch-post (small square tower for the skyline)
  const tw = 2.6, th = 4.6 + rng() * 0.5;
  const tx = w / 2 - tw / 2 - 0.5, tz = -d / 2 + tw / 2 + 0.5;
  const tower = box(tw, th, tw, 0.6);
  tower.translate(tx, th / 2, tz);
  buckets.plaster.push(jitterUV(tower, rng));
  for (const [mx, mz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const merlon = box(0.5, 0.5, 0.5, 0.8);
    merlon.translate(tx + mx * (tw / 2 - 0.3), th + 0.25, tz + mz * (tw / 2 - 0.3));
    buckets.plaster.push(jitterUV(merlon, rng));
  }
  const slit = box(0.30, 0.75, 0.06, 1.0);
  slit.translate(tx, th - 1.1, tz + tw / 2 + 0.05);
  buckets.dark.push(slit);
  // awning stall in the yard (reuses the souk stall vocabulary)
  {
    const ph = 2.1 + rng() * 0.3, awW = 5.4, awD = 4.2;
    const ox = -w * 0.18, oz = d * 0.16;
    for (const [sxp, szp] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const post = box(0.15, ph, 0.15, 1.2);
      post.rotateZ((rng() - 0.5) * 0.05);
      post.translate(ox + sxp * (awW / 2 - 0.5), ph / 2, oz + szp * (awD / 2 - 0.5));
      buckets.wood.push(jitterUV(post, rng));
    }
    const awn = box(awW, 0.08, awD, 0.35);
    awn.rotateX((rng() - 0.5) * 0.09 - 0.05);
    awn.translate(ox, ph + 0.04, oz);
    buckets.plaster.push(jitterUV(awn, rng));
    const counter = box(2.4, 0.8, 0.85, 0.8);
    counter.translate(ox - 0.4, 0.4, oz + awD / 2 - 1.1);
    buckets.wood.push(jitterUV(counter, rng));
  }
  courtyardClutter(rng, buckets, w, d, 8 + ((rng() * 4) | 0));
  return { w: w + 0.5, d: d + 0.5, h: th + 0.3 };
}

/** Plan-name builders to spread into URBAN_BUILDERS (props.js contract). */
export const MARKET_BUILDERS = {
  market: makeMarketStall, marketRow: makeMarketRow,
  compound: makeCompound, compoundSouk: makeCompoundSouk,
};

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

// A refrozen pressure ridge, read FOR RANGE (content_breadth r6): the old
// chain of upthrust thin plates minified into dark broken stick strokes lying
// flat on the bright sheet — the critique's "debris reads as flat 2D twigs
// floating on the ice". At 300 m a real ridge reads as a LOW BRIGHT BERM: a
// continuous snow-drifted crack levee. Built as a gently curving run of low
// WIDE segments whose visible top faces dominate (the winter snow-cap shader
// whitens them, so the run reads as a bright ridge line with soft side
// shadows), plus only the odd small upthrust plate on the crest.
function pressureRidge(buckets, rng, cx, cz, y, ang, len) {
  const n = Math.max(6, Math.round(len / 1.7));
  const bend = (rng() - 0.5) * 0.9; // gentle S-curve along the run
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1) - 0.5;
    const aa = ang + bend * t;
    const px = cx + Math.cos(aa) * t * len + (rng() - 0.5) * 0.5;
    const pz = cz + Math.sin(aa) * t * len + (rng() - 0.5) * 0.5;
    const taper = Math.max(0.25, 1 - Math.abs(t) * 1.6); // sink toward the ends
    const bh = (0.17 + rng() * 0.13) * taper;
    const seg = box(1.9 + rng() * 0.9, bh, 1.15 + rng() * 0.65, 0.8);
    seg.rotateY(-aa + (rng() - 0.5) * 0.22);
    seg.rotateX((rng() - 0.5) * 0.10);
    seg.translate(px, y + bh * 0.42, pz);
    buckets.stone.push(jitterUV(seg, rng));
    if (rng() < 0.22) { // occasional small refrozen plate on the crest
      const pw = 0.7 + rng() * 0.6, phh = 0.18 + rng() * 0.22;
      const plate = box(pw, phh, 0.10 + rng() * 0.08, 0.8);
      plate.rotateZ((rng() - 0.5) * 0.5);
      plate.rotateX((rng() - 0.5) * 0.4);
      plate.rotateY(-aa + (rng() - 0.5) * 0.6);
      plate.translate(px, y + bh + phh * 0.3, pz);
      buckets.stone.push(jitterUV(plate, rng));
    }
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
export function dressMapExtras({ mapId, extraKits = null, L, heightField, rng, buckets }) {
  // Configurable kit dispatch lets new maps compose the production dressing
  // vocabulary without cloning geometry builders. Legacy ids resolve to the
  // exact one kit they used before, preserving their RNG stream and output.
  const kits = extraKits || (mapId === 'coastal' ? ['coastal']
    : mapId === 'autumn' ? ['river']
      : mapId === 'railyard' ? ['rail']
        : mapId === 'winter' ? ['winterLake'] : []);
  if (kits.includes('coastal')) dressCoastalShore({ L, heightField, rng, buckets });
  if (kits.includes('river')) dressAutumnRiver({ L, heightField, rng, buckets });
  if (kits.includes('rail')) dressRailYard({ L, heightField, rng, buckets });
  if (!kits.includes('winterLake') || !L.lakes || !L.lakes.length) return;
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
    // --- jumbled shore-ice ring (content_breadth r5) ----------------------
    // The sheet met the snowfield as a soft airbrushed border ("flat light-
    // blue paint puddle ... soft undefined shoreline" critique). Real lake
    // ice piles broken refrozen plates along the waterline; a clumpy ring of
    // small canted slabs draws a bright, structured shoreline that reads at
    // establishing distance. Stone bucket = winter's pale snow-dusted tone.
    {
      const clusters = Math.round(lake.r * (big ? 0.62 : 0.42));
      for (let i = 0; i < clusters; i++) {
        const a = rng() * Math.PI * 2;
        // hug the waterline: just inside/outside the nominal radius
        const rr = lake.r * (0.90 + rng() * 0.12);
        const cx = lake.x + Math.cos(a) * rr, cz = lake.z + Math.sin(a) * rr;
        if (Math.max(Math.abs(cx), Math.abs(cz)) > 480) continue;
        if (heightField._roadDist(cx, cz) < 6) continue;
        // ~55% of the ring carries jumble; leave clean drift stretches
        if (rng() < 0.45) continue;
        const y = heightField.getHeightAt(cx, cz);
        const n = 2 + ((rng() * 4) | 0);
        for (let k = 0; k < n; k++) {
          const pw = 0.7 + rng() * 1.1, ph = 0.22 + rng() * 0.34;
          const slab = box(pw, ph, 0.14 + rng() * 0.10, 0.9);
          slab.rotateZ((rng() - 0.5) * 0.9);
          slab.rotateX((rng() - 0.5) * 0.8);
          slab.rotateY(-a + (rng() - 0.5) * 0.9);
          slab.translate(cx + (rng() - 0.5) * 2.6, y + ph * 0.28, cz + (rng() - 0.5) * 2.6);
          buckets.stone.push(jitterUV(slab, rng));
        }
      }
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
    // --- drift lenses ON the sheet + a drifted shore ring (content_breadth
    // r6). (a) partially snow-drifted ice patches: low flattened lenses
    // scattered over the interior so the sheet reads wind-worked instead of
    // one uniform macro print; (b) a patchy ring of shore-drift lenses
    // straddling the nominal radius — the splat rim used to end as a hard
    // ellipse against the snowfield (critique); overlapping soft lenses blur
    // the shoreline into a 3-8 m drifted transition. Plaster bucket + the
    // winter snow-cap shader = bright snow tops with soft blue side shading.
    {
      // r7 terrain_environment: WIND-STREAK drifts. The old round lenses
      // stamped "obviously repeated circular blobs" across the sheet
      // (critique) — real on-ice drifts are elongated sastrugi tails carved
      // by ONE prevailing wind. Every interior drift is now a 3-5:1 streak
      // aligned to the same azimuth as the ice texture's authored wind
      // streaks (dir 0.6 rad in makeIceLayer -> rotateY(-0.6)), with only
      // small per-streak yaw jitter; several short tail segments trail off
      // downwind so the shapes read carved, not stamped.
      const WIND_YAW = -0.6;
      const lens = (x, z, r, h, streak) => {
        // These lenses are broad enough to sit directly under a chase camera.
        // The former 10×5 sphere left metre-wide planar facets across a
        // 20-30 m streak; at grazing angles they read as torn white polygons
        // hovering over the ice. A modest 24×10 cap keeps the same silhouette
        // and material budget while producing a continuous snow surface.
        const g = new THREE.SphereGeometry(1, 24, 10);
        const el = streak ? 3.0 + rng() * 1.8 : 1.4 + rng() * 0.5;
        g.scale(r * el * 0.5, h, r * (0.55 + rng() * 0.3));
        g.rotateY(WIND_YAW + (rng() - 0.5) * 0.24);
        g.translate(x, heightField.getHeightAt(x, z) + h * 0.12, z);
        buckets.plaster.push(jitterUV(g, rng));
      };
      const nDrift = big ? 12 : 5;
      for (let i = 0; i < nDrift; i++) {
        const a = rng() * Math.PI * 2;
        const rr = lake.r * (0.15 + rng() * 0.6);
        const dx = lake.x + Math.cos(a) * rr, dz = lake.z + Math.sin(a) * rr;
        lens(dx, dz, 3.0 + rng() * 4.0, 0.13 + rng() * 0.12, true);
        // downwind tail fragments
        const nTail = 1 + ((rng() * 3) | 0);
        for (let t = 1; t <= nTail; t++) {
          lens(dx + Math.cos(WIND_YAW) * (5 + t * (4 + rng() * 3)),
            dz - Math.sin(WIND_YAW) * (5 + t * (4 + rng() * 3)),
            1.2 + rng() * 1.8, 0.08 + rng() * 0.07, true);
        }
      }
      const nRim = Math.round(lake.r * (big ? 0.5 : 0.35));
      for (let i = 0; i < nRim; i++) {
        const a = rng() * Math.PI * 2;
        if (rng() < 0.30) continue; // leave clean sheet stretches
        const rr = lake.r * (0.90 + rng() * 0.16);
        const x = lake.x + Math.cos(a) * rr, z = lake.z + Math.sin(a) * rr;
        if (Math.max(Math.abs(x), Math.abs(z)) > 480) continue;
        if (heightField._roadDist(x, z) < 6) continue;
        lens(x, z, 2.6 + rng() * 3.4, 0.13 + rng() * 0.14, false);
      }
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

// =============================================================================
// maps r1 — COASTAL SHORE dressing (beached boats, driftwood, buoys, jetty)
// =============================================================================

// Open clinker fishing boat beached above the surf: planked sides, transom,
// thwarts, a short mast with a furled boom. Reads "working beach" at range.
function beachedBoat(buckets, rng, x, y, z, yaw, withMast) {
  const parts = [];
  const L = 4.6 + rng() * 1.2, W = 1.6, H = 0.72;
  for (const s of [-1, 1]) {
    for (let r = 0; r < 3; r++) { // three lapped strakes each side
      const pl = box(L - r * 0.55, 0.20, 0.07, 1.2);
      pl.rotateZ((rng() - 0.5) * 0.03);
      pl.translate(0, 0.16 + r * 0.20, s * (W / 2 - r * 0.07));
      parts.push(pl);
    }
  }
  const bow = box(0.08, H * 0.9, W * 0.8, 1.2);
  bow.rotateY(Math.PI / 4);
  bow.translate(L / 2 - 0.14, H * 0.45, 0);
  parts.push(bow);
  const transom = box(0.08, H * 0.8, W * 0.9, 1.2);
  transom.translate(-L / 2 + 0.12, H * 0.42, 0);
  parts.push(transom);
  for (const tx of [-L * 0.24, L * 0.18]) {
    const th = box(0.30, 0.06, W * 0.94, 1.2);
    th.translate(tx, H * 0.68, 0);
    parts.push(th);
  }
  const keelList = 0.10 + rng() * 0.08; // beached hulls heel over a touch
  for (const g of parts) {
    g.rotateZ(keelList);
    g.rotateY(yaw);
    g.translate(x, y - 0.06, z);
    buckets.wood.push(jitterUV(g, rng));
  }
  if (withMast) {
    const mast = box(0.11, 3.4, 0.11, 2.0);
    mast.rotateZ(keelList);
    mast.rotateY(yaw);
    mast.translate(x, y + 1.7, z);
    buckets.wood.push(mast);
    const boom = box(0.08, 0.08, 2.3, 2.0);
    boom.rotateY(yaw + (rng() - 0.5) * 0.4);
    boom.translate(x, y + 1.15, z);
    buckets.wood.push(boom);
  }
}

function dressCoastalShore({ L, heightField, rng, buckets }) {
  if (!L.lakes || !L.lakes.length) return;
  // land direction: the sea circles sit on the east edge, land is -x — the
  // dressing hugs whichever shore arc faces the map interior
  for (const lake of L.lakes) {
    const big = lake.r >= 110; // main bay arcs get boats + the jetty
    // --- beached boats + driftwood on the landward arc ----------------------
    const nBoat = big ? 3 : 1;
    for (let i = 0; i < nBoat; i++) {
      const a = Math.PI + (rng() - 0.5) * 1.5; // landward bearing (cos<0 => -x)
      const rr = lake.r * (1.045 + rng() * 0.05); // just above the surf line
      const x = lake.x + Math.cos(a) * rr, z = lake.z + Math.sin(a) * rr;
      if (Math.max(Math.abs(x), Math.abs(z)) > 470) continue;
      if (heightField._roadDist(x, z) < 7) continue;
      beachedBoat(buckets, rng, x, heightField.getHeightAt(x, z), z,
        a + Math.PI / 2 + (rng() - 0.5) * 0.5, rng() < 0.55);
    }
    // driftwood: silvered logs strewn along the wrack line
    const nDrift = Math.round(lake.r * 0.14);
    for (let i = 0; i < nDrift; i++) {
      const a = Math.PI + (rng() - 0.5) * 2.2;
      const rr = lake.r * (1.03 + rng() * 0.09);
      const x = lake.x + Math.cos(a) * rr, z = lake.z + Math.sin(a) * rr;
      if (Math.max(Math.abs(x), Math.abs(z)) > 470) continue;
      if (heightField._roadDist(x, z) < 6) continue;
      const len = 1.6 + rng() * 2.6;
      const log = box(len, 0.16 + rng() * 0.12, 0.16 + rng() * 0.12, 1.4);
      log.rotateY(a + Math.PI / 2 + (rng() - 0.5) * 0.8);
      log.translate(x, heightField.getHeightAt(x, z) + 0.06, z);
      buckets.wood.push(jitterUV(log, rng));
    }
    // mooring buoys bobbing in the shallows (plaster = whitewash tone)
    const nBuoy = big ? 5 : 2;
    for (let i = 0; i < nBuoy; i++) {
      const a = Math.PI + (rng() - 0.5) * 1.8;
      const rr = lake.r * (0.72 + rng() * 0.2);
      const x = lake.x + Math.cos(a) * rr, z = lake.z + Math.sin(a) * rr;
      if (Math.max(Math.abs(x), Math.abs(z)) > 480) continue;
      const b = new THREE.SphereGeometry(0.32 + rng() * 0.12, 8, 6);
      scaleUV(b, 1.5, 1);
      b.translate(x, heightField.getHeightAt(x, z) + 0.16, z);
      buckets.plaster.push(jitterUV(b, rng));
    }
    if (!big) continue;
    // --- the village jetty: walks off the landward shore into the bay ------
    const ja = Math.PI + (rng() - 0.5) * 0.5;
    const jx = lake.x + Math.cos(ja) * lake.r * 1.05;
    const jz = lake.z + Math.sin(ja) * lake.r * 1.05;
    jetty(buckets, rng, jx, jz, ja + Math.PI, heightField.getHeightAt(jx, jz), 11);
  }
}

// =============================================================================
// maps r1 — AUTUMN RIVER dressing (ruined bridge, ford posts, bank reeds)
// =============================================================================

function dressAutumnRiver({ L, heightField, rng, buckets }) {
  const links = (L.marshes || []).filter((m) => m.r <= 40); // river chain links
  if (links.length < 3) return;
  // --- bank reeds: clumps along both banks of every link -------------------
  for (const m of links) {
    const clumps = 2 + ((rng() * 3) | 0);
    for (let i = 0; i < clumps; i++) {
      const a = rng() * Math.PI * 2;
      const rr = m.r * (0.85 + rng() * 0.3);
      const x = m.x + Math.cos(a) * rr, z = m.z + Math.sin(a) * rr;
      if (Math.max(Math.abs(x), Math.abs(z)) > 470) continue;
      if (heightField._roadDist(x, z) < 6) continue;
      reedClump(buckets, rng, x, heightField.getHeightAt(x, z), z);
    }
  }
  // --- ruined stone bridge at ~40% along the chain --------------------------
  {
    const i0 = Math.floor(links.length * 0.4);
    const a = links[Math.max(0, i0 - 1)], b = links[Math.min(links.length - 1, i0 + 1)];
    const cx = links[i0].x, cz = links[i0].z;
    const flow = Math.atan2(b.z - a.z, b.x - a.x);
    const cross = flow + Math.PI / 2; // bridge axis spans the channel
    const halfSpan = links[i0].r * 1.02; // abutments sit right at the banks
    for (const s of [-1, 1]) {
      const ax = cx + Math.cos(cross) * halfSpan * s;
      const az = cz + Math.sin(cross) * halfSpan * s;
      const ay = heightField.getHeightAt(ax, az);
      // r4: bulked up — the first-cut 3.4 m blocks read as lone crates from
      // any gameplay camera. Abutment mass + arch stub + parapet remnant.
      const ab = box(6.2, 3.2, 5.4, 0.6);
      ab.rotateY(-cross);
      ab.translate(ax, ay + 1.2, az);
      buckets.stone.push(jitterUV(ab, rng));
      const stub = box(3.8, 1.6, 4.6, 0.6); // broken arch springing
      stub.rotateY(-cross);
      stub.rotateZ(-s * Math.cos(cross) * 0.30);
      stub.rotateX(s * Math.sin(cross) * 0.30);
      stub.translate(ax - Math.cos(cross) * s * 4.0, ay + 2.2, az - Math.sin(cross) * s * 4.0);
      buckets.stone.push(jitterUV(stub, rng));
      const para = box(0.5, 1.1, 5.8, 0.8); // surviving parapet stump
      para.rotateY(-cross);
      para.translate(ax + Math.cos(cross + Math.PI / 2) * 2.6, ay + 3.2, az + Math.sin(cross + Math.PI / 2) * 2.6);
      buckets.stone.push(jitterUV(para, rng));
      const wing = box(1.6, 1.8, 6.4, 0.6); // splayed wing wall
      wing.rotateY(-cross + s * 0.5);
      wing.translate(ax + Math.cos(cross) * s * 2.2, ay + 0.6, az + Math.sin(cross) * s * 2.2);
      buckets.stone.push(jitterUV(wing, rng));
    }
    // fallen arch slabs canted in the channel
    for (let k = 0; k < 5; k++) {
      const t = (rng() - 0.5) * halfSpan * 1.2;
      const sx = cx + Math.cos(cross) * t, sz = cz + Math.sin(cross) * t;
      const slab = box(2.2 + rng() * 1.6, 0.7, 2.6 + rng() * 1.0, 0.7);
      slab.rotateY(-cross + (rng() - 0.5) * 0.8);
      slab.rotateZ((rng() - 0.5) * 0.5);
      slab.translate(sx, heightField.getHeightAt(sx, sz) + 0.3, sz);
      buckets.stone.push(jitterUV(slab, rng));
    }
  }
  // --- ford marker posts where the roads wade the river ---------------------
  // scan each road polyline for enter/exit transitions across the channel
  const inRiver = (x, z) => {
    for (const m of links) if (Math.hypot(x - m.x, z - m.z) < m.r * 0.85) return true;
    return false;
  };
  for (const nodes of L.roads) {
    let prev = false;
    for (let i = 0; i < nodes.length; i++) {
      const [nx, nz] = nodes[i];
      const now = inRiver(nx, nz);
      if (now !== prev && i > 0) {
        // transition — plant a white-tipped post pair either side of the lane
        const [px, pz] = nodes[i - 1];
        const tx = nx - px, tz = nz - pz;
        const tl = Math.hypot(tx, tz) || 1;
        const lx = -tz / tl, lz = tx / tl;
        for (const s of [-1, 1]) {
          const wx = nx + lx * 4.6 * s, wz = nz + lz * 4.6 * s;
          if (Math.max(Math.abs(wx), Math.abs(wz)) > 470) continue;
          const wy = heightField.getHeightAt(wx, wz);
          const post = box(0.16, 1.5, 0.16, 1.6);
          post.rotateY(rng() * Math.PI);
          post.translate(wx, wy + 0.72, wz);
          buckets.wood.push(jitterUV(post, rng));
          const tip = box(0.19, 0.22, 0.19, 1.0);
          tip.translate(wx, wy + 1.45, wz);
          buckets.plaster.push(tip);
        }
      }
      prev = now;
    }
  }
}

// =============================================================================
// maps r1 — RAIL YARD dressing (track fans, buffers, coal heaps, cable drums)
// =============================================================================

// One rail line: ballast bed + twin rails + sleepers, laid in ~10 m segments
// that follow the terrain (the yard is near-flat; segments tilt to match).
// Soft dressing by contract — hulls roll over the 0.2 m bed like a curb.
function railLine(buckets, rng, heightField, x, z0, z1) {
  const segL = 10;
  const n = Math.max(1, Math.round((z1 - z0) / segL));
  for (let k = 0; k < n; k++) {
    const za = z0 + k * segL, zb = Math.min(z1, za + segL);
    const ya = heightField.getHeightAt(x, za), yb = heightField.getHeightAt(x, zb);
    const zm = (za + zb) / 2, ym = (ya + yb) / 2;
    const len = Math.hypot(zb - za, yb - ya);
    const tilt = Math.atan2(yb - ya, zb - za);
    // ballast slab — grey crushed-stone vertex paint on the matte 'baked'
    // bucket (the 'stone' bucket is BRICK on railyard and read as brick beds)
    const bal = box(3.0, 0.16, len + 0.35, 0.55);
    {
      const n = bal.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const v = 0.040 + rng() * 0.018;
        col[i * 3] = v; col[i * 3 + 1] = v * 0.98; col[i * 3 + 2] = v * 0.94;
      }
      bal.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    bal.rotateX(-tilt);
    bal.translate(x, ym + 0.07, zm);
    (buckets.baked || buckets.stone).push(bal);
    // twin rails
    for (const s of [-0.72, 0.72]) {
      const rail = box(0.09, 0.17, len + 0.06, 2.0);
      rail.rotateX(-tilt);
      rail.translate(x + s, ym + 0.24, zm);
      buckets.dark.push(rail);
    }
    // sleepers every ~1.4 m
    const nS = Math.round(len / 1.4);
    for (let sI = 0; sI < nS; sI++) {
      const t = (sI + 0.5) / nS;
      const sz = za + (zb - za) * t, sy = ya + (yb - ya) * t;
      const sl = box(2.1, 0.09, 0.28, 1.4);
      sl.translate(x + (rng() - 0.5) * 0.05, sy + 0.17, sz);
      buckets.wood.push(sl);
    }
  }
}

// timber-and-steel buffer stop closing a stub track
function bufferStop(buckets, rng, heightField, x, z) {
  const y = heightField.getHeightAt(x, z);
  for (const s of [-0.72, 0.72]) {
    const strut = box(0.18, 1.5, 0.18, 1.4);
    strut.rotateX(-0.5);
    strut.translate(x + s, y + 0.75, z + 0.3);
    buckets.dark.push(strut);
  }
  const beam = box(2.2, 0.45, 0.28, 1.0);
  beam.translate(x, y + 1.05, z - 0.05);
  buckets.wood.push(jitterUV(beam, rng));
}

function dressRailYard({ L, heightField, rng, buckets }) {
  const v = L.village;
  // --- the track fan: parallel sidings east of the yard's center road ------
  // (positions authored against the railyard.js grid: roads at x=-120/0/130)
  const LINES = [
    { x: 40, z0: -235, z1: 235 },
    { x: 49, z0: -235, z1: 235 },
    { x: 58, z0: -205, z1: 210 },  // stubs — staggered ends read as a yard fan
    { x: 67, z0: -175, z1: 185 },
    { x: 76, z0: -150, z1: 160 },
    { x: -66, z0: -235, z1: 235 }, // through line west of the center road
    { x: -57, z0: -190, z1: 200 },
  ];
  for (const ln of LINES) railLine(buckets, rng, heightField, ln.x, ln.z0, ln.z1);
  for (const ln of LINES) {
    if (ln.z1 < 230) bufferStop(buckets, rng, heightField, ln.x, ln.z1 + 0.8);
    if (ln.z0 > -230) bufferStop(buckets, rng, heightField, ln.x, ln.z0 - 0.8);
  }
  // --- coal heaps between sidings (dark matte cones read at range) ---------
  for (let i = 0; i < 7; i++) {
    const x = 34 + rng() * 50, z = -140 + rng() * 280;
    if (heightField._roadDist(x, z) < 7) continue;
    const r = 2.2 + rng() * 2.4;
    const heap = new THREE.SphereGeometry(1, 10, 6);
    scaleUV(heap, 2, 1);
    heap.scale(r, r * 0.36, r * (0.7 + rng() * 0.4));
    heap.rotateY(rng() * Math.PI);
    heap.translate(x, heightField.getHeightAt(x, z) + r * 0.05, z);
    buckets.dark.push(heap);
  }
  // --- cable drums + sleeper stacks along the western fence line -----------
  for (let i = 0; i < 9; i++) {
    const x = v.x0 + 8 + rng() * 30, z = v.z0 + 12 + rng() * (v.z1 - v.z0 - 24);
    if (heightField._roadDist(x, z) < 7) continue;
    const y = heightField.getHeightAt(x, z);
    if (rng() < 0.5) { // cable drum on its side
      const r = 0.7 + rng() * 0.4;
      const drum = new THREE.CylinderGeometry(r, r, r * 1.1, 10, 1);
      scaleUV(drum, 3, 1);
      drum.rotateZ(Math.PI / 2);
      drum.rotateY(rng() * Math.PI);
      drum.translate(x, y + r, z);
      buckets.wood.push(jitterUV(drum, rng));
    } else { // stacked sleeper cribbing
      for (let layer = 0; layer < 3; layer++) {
        for (let s = -1; s <= 1; s += 2) {
          const sl = box(2.2, 0.14, 0.30, 1.2);
          if (layer % 2) sl.rotateY(Math.PI / 2);
          sl.translate(x + (layer % 2 ? s * 0.7 : 0), y + 0.1 + layer * 0.16,
            z + (layer % 2 ? 0 : s * 0.7));
          buckets.wood.push(jitterUV(sl, rng));
        }
      }
    }
  }
}
