// The world's flags are invented (world-flags-278, 2026-11-26; Kevin on the badlands fort's flag of Jordan: "that flag
// looks too much like a real flag. fix"). worldFlags.ts draws every flag map dressing flies; this receipt reads what is
// drawn and checks it against a table of real flags.
//
//   1. the designs: each of WORLD_FLAG_DESIGNS, rasterised from the panels the helper hands its sites, matches no real
//      flag in REAL_FLAGS (either face) — its colour regions do not line up with a real flag's in layout and colour;
//   2. the drawn flags: each site that flies one (the badlands fort's tower, the Dalmatian square's stendardo, the lunar
//      site's mission banner, the Franconian border post) is built, the triangles in its flag's window are rendered in
//      software (the nearest face at each sample, each column's cloth stretched to its own height, so the droop and
//      ripple come out) and that picture is the site's own design and no real flag;
//   3. the source: no world module but worldFlags.ts keeps flag or banner colours (a FLAG_* or BANNER_* hex constant) or
//      names a nation's flag, and the modules that use worldFlags.ts are exactly the sites part 2 renders and the
//      plain cloths' sites (a new one gets a window here, or a PLAIN_CLOTHS id).
// (world-flags-279, Kevin on the kolkhoz arch: its red banners "read as real Soviet flags") part 2 also renders the arch's
// pillar flag, the Lorraine mairie's (a real tricolour until 279) and the arch's name banner: a banner is no design, so
// it must read as no real flag and keep its field's colour family (the arch's stays red: 279-r2, Kevin: "for the flags on
// that sign keep them red not brown"). Each site's build is censused: it notes its cloth by design id.
//
// Controls: forts.ts with the flag of Jordan restored (git show 1e7afa12dc:src/world/landmarks/forts.ts) fails parts 2
// and 3: its drawn cloth matches Jordan and Palestine, it keeps FLAG_* colours, names the flag of Jordan, and leaves the
// helper; gates.ts and lorrain.ts as b6c100411f had them fail part 2 (plain red, a red banner, France) and part 3.
// Out of scope: the vehicles' markings and the UI's nation flags (src/ui/flags.ts), real on purpose; the period emblems
// (the arch's and the memorials' red stars: Main's ruling, 279) are no cloth.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as THREE from 'three';
import { PLAIN_CLOTHS, WORLD_FLAG_DESIGNS, closeWorldClothCensus, openWorldClothCensus, worldFlagPanels } from './worldFlags.ts';
import { LANDMARK_BUILDERS } from './landmarks/index.ts';
import { resolveLandmarkParams } from './landmarks/plan.ts';
import { REGIONAL_BUCKETS, streamFrom } from './maps/regional/geometry.ts';
import { REGIONAL_DESTRUCTIBLE_TYPES } from './maps/structureKit.ts';
import { buildRegionalParts } from './maps/regional/index.ts';
import { LORRAIN_STYLE } from './maps/regional/lorrain.ts';

const ROOT = new URL('../..', import.meta.url).pathname;
const COLS = 60, ROWS = 40, ASPECT = 1.5;

// ---------------------------------------------------------------------------------------------------- colour
const decode = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linOfHex = (hex) => [decode(((hex >> 16) & 255) / 255), decode(((hex >> 8) & 255) / 255), decode((hex & 255) / 255)];
/** OKLab from linear sRGB. */
function oklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** A colour's family: what a viewer would call it (pale and faded colours keep their hue). */
function family([L, a, b]) {
  if (Math.hypot(a, b) < 0.035) return L > 0.78 ? 'white' : L < 0.32 ? 'black' : 'grey';
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return h < 45 || h >= 350 ? 'red' : h < 85 ? 'orange' : h < 125 ? 'yellow' : h < 180 ? 'green' : h < 230 ? 'cyan' : h < 300 ? 'blue' : 'purple';
}

// ---------------------------------------------------------------------------------------------------- real flags
// Simplified to their colour regions (u from the hoist, v from the foot; emblems as discs, rings or blocks of their
// colour). Equal or weighted bands, triangles at the hoist, crosses: enough for a layout-and-colour likeness.
const bands = (weights, hexes, along) => {
  const total = weights.reduce((a, b) => a + b, 0);
  return (u, v) => {
    let t = (along === 'h' ? 1 - v : u) * total;
    for (let i = 0; i < hexes.length; i++) { if (t < weights[i] || i === hexes.length - 1) return hexes[i]; t -= weights[i]; }
  };
};
const H = (...hexes) => bands(hexes.map(() => 1), hexes, 'h');
const HW = (w, hexes) => bands(w, hexes, 'h');
const V = (...hexes) => bands(hexes.map(() => 1), hexes, 'v');
const VW = (w, hexes) => bands(w, hexes, 'v');
const base = (hex) => () => hex;
const tri = (depth, hex) => (u, v) => (u < depth * (1 - Math.abs(v - 0.5) * 2) ? hex : undefined);
const trap = (depth, hex) => (u, v) => (u < depth && Math.abs(v - 0.5) < 0.5 - (u / depth) / 6 ? hex : undefined);
const rect = (u0, v0, u1, v1, hex) => (u, v) => (u >= u0 && u <= u1 && v >= v0 && v <= v1 ? hex : undefined);
const disc = (cu, cv, r, hex) => (u, v) => (((u - cu) * ASPECT) ** 2 + (v - cv) ** 2 < r * r ? hex : undefined);
const ring = (cu, cv, ro, ri, hex) => (u, v) => { const d = Math.hypot((u - cu) * ASPECT, v - cv); return d < ro && d > ri ? hex : undefined; };
const cross = (w, hex, cu = 0.375) => (u, v) => (Math.abs(u - cu) * ASPECT < w / 2 || Math.abs(v - 0.5) < w / 2 ? hex : undefined);
const plus = (r, w, hex) => (u, v) => { const x = Math.abs(u - 0.5) * ASPECT, y = Math.abs(v - 0.5); return (x < w / 2 && y < r) || (y < w / 2 && x < r) ? hex : undefined; };
const stripes = (n, a, b) => (u, v) => (Math.floor((1 - v) * n) % 2 ? b : a);
const lozenge = (rx, ry, hex) => (u, v) => (Math.abs(u - 0.5) / rx + Math.abs(v - 0.5) / ry < 1 ? hex : undefined);
const diagonal = (a, b) => (u, v) => (v > u ? a : b);

const REAL_FLAGS = {
  // the audit's: the flags world dressing flew before world-flags-278
  jordan: [H(0x000000, 0xffffff, 0x007a3d), tri(0.5, 0xce1126), disc(0.17, 0.5, 0.06, 0xffffff)],
  croatia: [H(0xff0000, 0xffffff, 0x171796), rect(0.42, 0.3, 0.58, 0.75, 0xff0000)],
  usa: [stripes(13, 0xb22234, 0xffffff), rect(0, 6 / 13, 0.4, 1, 0x3c3b6e)],
  // (and as a game draws it at range: seven stripes, the canton over the top four; the lunar site's faded flag)
  usaAtRange: [stripes(7, 0xb22234, 0xffffff), rect(0, 3 / 7, 0.34, 1, 0x3c3b6e)],
  germany: [H(0x000000, 0xdd0000, 0xffce00)],
  ukraine: [H(0x0057b7, 0xffd700)],
  // the pan-Arab and the region's
  palestine: [H(0x000000, 0xffffff, 0x009639), tri(0.33, 0xed2e38)],
  uae: [H(0x00732f, 0xffffff, 0x000000), rect(0, 0, 0.25, 1, 0xff0000)],
  sudan: [H(0xd21034, 0xffffff, 0x000000), tri(0.33, 0x007229)],
  kuwait: [H(0x007a3d, 0xffffff, 0xce1126), trap(0.25, 0x000000)],
  iraq: [H(0xce1126, 0xffffff, 0x000000), rect(0.3, 0.4, 0.7, 0.6, 0x007a3d)],
  egypt: [H(0xce1126, 0xffffff, 0x000000), disc(0.5, 0.5, 0.1, 0xc09300)],
  syria: [H(0xce1126, 0xffffff, 0x000000), disc(0.35, 0.5, 0.07, 0x007a3d), disc(0.65, 0.5, 0.07, 0x007a3d)],
  yemen: [H(0xce1126, 0xffffff, 0x000000)],
  libya: [HW([1, 2, 1], [0xe70013, 0x000000, 0x239e46]), ring(0.5, 0.5, 0.14, 0.1, 0xffffff)],
  saudiArabia: [base(0x006c35), rect(0.25, 0.35, 0.75, 0.6, 0xffffff)],
  iran: [H(0x239f40, 0xffffff, 0xda0000)],
  lebanon: [HW([1, 2, 1], [0xed1c24, 0xffffff, 0xed1c24]), disc(0.5, 0.5, 0.17, 0x00a651)],
  algeria: [V(0x006233, 0xffffff), ring(0.5, 0.5, 0.25, 0.19, 0xd21034)],
  tunisia: [base(0xe70013), disc(0.5, 0.5, 0.25, 0xffffff), ring(0.5, 0.5, 0.19, 0.14, 0xe70013)],
  turkey: [base(0xe30a17), ring(0.4, 0.5, 0.25, 0.19, 0xffffff), disc(0.55, 0.5, 0.06, 0xffffff)],
  pakistan: [VW([1, 3], [0xffffff, 0x01411c]), ring(0.62, 0.5, 0.3, 0.23, 0xffffff)],
  qatar: [VW([1, 2], [0xffffff, 0x8a1538])],
  bahrain: [VW([1, 3], [0xffffff, 0xce1126])],
  israel: [base(0xffffff), rect(0, 0.1, 1, 0.24, 0x0038b8), rect(0, 0.76, 1, 0.9, 0x0038b8), ring(0.5, 0.5, 0.2, 0.15, 0x0038b8)],
  // bicolours and tricolours
  poland: [H(0xffffff, 0xdc143c)], indonesia: [H(0xff0000, 0xffffff)],
  italy: [V(0x009246, 0xffffff, 0xce2b37)], france: [V(0x002395, 0xffffff, 0xed2939)], ireland: [V(0x169b62, 0xffffff, 0xff883e)],
  belgium: [V(0x000000, 0xfae042, 0xed2939)], romania: [V(0x002b7f, 0xfcd116, 0xce1126)], mali: [V(0x14b53a, 0xfcd116, 0xce1126)],
  guinea: [V(0xce1126, 0xfcd116, 0x009460)], nigeria: [V(0x008751, 0xffffff, 0x008751)], ivoryCoast: [V(0xf77f00, 0xffffff, 0x009e60)],
  peru: [V(0xd91023, 0xffffff, 0xd91023)], canada: [VW([1, 2, 1], [0xd52b1e, 0xffffff, 0xd52b1e]), disc(0.5, 0.5, 0.17, 0xd52b1e)],
  malta: [V(0xffffff, 0xcf142b)], vatican: [V(0xffe000, 0xffffff)], portugal: [VW([2, 3], [0x006600, 0xff0000]), disc(0.4, 0.5, 0.2, 0xffcc00)],
  russia: [H(0xffffff, 0x0039a6, 0xd52b1e)], netherlands: [H(0xae1c28, 0xffffff, 0x21468b)], austria: [H(0xc8102e, 0xffffff, 0xc8102e)],
  hungary: [H(0xce2939, 0xffffff, 0x477050)], bulgaria: [H(0xffffff, 0x00966e, 0xd62612)], estonia: [H(0x0072ce, 0x000000, 0xffffff)],
  lithuania: [H(0xfdb913, 0x006a44, 0xc1272d)], latvia: [HW([2, 1, 2], [0x9e3039, 0xffffff, 0x9e3039])],
  spain: [HW([1, 2, 1], [0xaa151b, 0xf1bf00, 0xaa151b])], colombia: [HW([2, 1, 1], [0xfcd116, 0x003893, 0xce1126])],
  armenia: [H(0xd90012, 0x0033a0, 0xf2a800)], gabon: [H(0x009e60, 0xfcd116, 0x3a75c4)], sierraLeone: [H(0x1eb53a, 0xffffff, 0x0072c6)],
  ethiopia: [H(0x078930, 0xfcdd09, 0xda121a), disc(0.5, 0.5, 0.2, 0x0f47af)], ghana: [H(0xce1126, 0xfcd116, 0x006b3f)],
  bolivia: [H(0xd52b1e, 0xf9e300, 0x007934)], belarus: [HW([2, 1], [0xc8313e, 0x4aa657]), rect(0, 0, 0.11, 1, 0xffffff)],
  argentina: [H(0x74acdf, 0xffffff, 0x74acdf)], elSalvador: [H(0x0047ab, 0xffffff, 0x0047ab)],
  thailand: [HW([1, 1, 2, 1, 1], [0xa51931, 0xf4f5f8, 0x2d2a4a, 0xf4f5f8, 0xa51931])],
  // fields with a device
  japan: [base(0xffffff), disc(0.5, 0.5, 0.3, 0xbc002d)], bangladesh: [base(0x006a4e), disc(0.45, 0.5, 0.33, 0xf42a41)],
  palau: [base(0x0099ff), disc(0.45, 0.5, 0.33, 0xffde00)], laos: [HW([1, 2, 1], [0xce1126, 0x002868, 0xce1126]), disc(0.5, 0.5, 0.2, 0xffffff)],
  vietnam: [base(0xda251d), disc(0.5, 0.5, 0.25, 0xffff00)], china: [base(0xee1c25), disc(0.17, 0.75, 0.1, 0xffff00)],
  sovietUnion: [base(0xcc0000), disc(0.12, 0.85, 0.06, 0xffd700)], redBanner: [base(0xcc0000)],
  // (279) a red field with a star at its middle, and a red banner in a white frame (the lettered Soviet banner's read)
  redStar: [base(0xcc0000), disc(0.5, 0.5, 0.18, 0xffd700)], redBannerFramed: [base(0xcc0000), rect(0, 0, 1, 0.12, 0xffffff), rect(0, 0.88, 1, 1, 0xffffff)],
  northKorea: [HW([6, 1, 22, 1, 6], [0x024fa2, 0xffffff, 0xed1c27, 0xffffff, 0x024fa2]), disc(0.33, 0.5, 0.17, 0xffffff), disc(0.33, 0.5, 0.06, 0xed1c27)],
  somalia: [base(0x4189dd), disc(0.5, 0.5, 0.17, 0xffffff)], kazakhstan: [base(0x00afca), rect(0, 0, 0.1, 1, 0xfec50c), disc(0.5, 0.55, 0.2, 0xfec50c)],
  brazil: [base(0x009c3b), lozenge(0.42, 0.4, 0xfedf00), disc(0.5, 0.5, 0.2, 0x002776)],
  bhutan: [diagonal(0xffd520, 0xff4e12)],
  // crosses
  greece: [stripes(9, 0x0d5eaf, 0xffffff), rect(0, 4 / 9, 0.37, 1, 0x0d5eaf)],
  denmark: [base(0xc8102e), cross(0.125, 0xffffff)], sweden: [base(0x006aa7), cross(0.2, 0xfecc02)],
  norway: [base(0xba0c2f), cross(0.25, 0xffffff), cross(0.125, 0x00205b)], finland: [base(0xffffff), cross(0.27, 0x002f6c)],
  iceland: [base(0x02529c), cross(0.25, 0xffffff), cross(0.125, 0xdc1e35)], switzerland: [base(0xd52b1e), plus(0.31, 0.19, 0xffffff)],
  unitedKingdom: [base(0x012169), cross(0.33, 0xffffff, 0.5), cross(0.2, 0xc8102e, 0.5)],
};

// ---------------------------------------------------------------------------------------------------- the grids
/** A grid (COLS x ROWS, row 0 at the head) of OKLab colours, null where there is no cloth. */
const grid = (at) => Array.from({ length: ROWS }, (_, j) => Array.from({ length: COLS }, (_, i) => at((i + 0.5) / COLS, 1 - (j + 0.5) / ROWS)));
function realGrid(layers) {
  return grid((u, v) => {
    let hex;
    for (const layer of layers) hex = layer(u, v) ?? hex;
    return oklab(linOfHex(hex));
  });
}
function inConvex(poly, u, v) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], c = (b[0] - a[0]) * (v - a[1]) - (b[1] - a[1]) * (u - a[0]);
    if (Math.abs(c) < 1e-12) continue;
    if (sign === 0) sign = Math.sign(c); else if (Math.sign(c) !== sign) return false;
  }
  return true;
}
function designGrid(id, fade = 0) {
  const panels = worldFlagPanels(id, { aspect: ASPECT, columns: 1, fade });
  return grid((u, v) => {
    let hit = null;
    for (const p of panels) if ((!hit || p.layer >= hit.layer) && inConvex(p.poly, u, v)) hit = p;
    return hit ? oklab(linOfHex(hit.hex)) : null;
  });
}
const mirror = (g) => g.map((row) => [...row].reverse());

/** Greedy colour clusters (OKLab within 0.06 of a cluster's first colour): a label grid and each label's mean. */
function cluster(g) {
  const seeds = [], sums = [];
  const labels = g.map((row) => row.map((c) => {
    if (!c) return -1;
    let k = seeds.findIndex((s) => dist(s, c) < 0.06);
    if (k < 0) { k = seeds.length; seeds.push(c); sums.push([0, 0, 0, 0]); }
    sums[k][0] += c[0]; sums[k][1] += c[1]; sums[k][2] += c[2]; sums[k][3]++;
    return k;
  }));
  return { labels, means: sums.map((s) => [s[0] / s[3], s[1] / s[3], s[2] / s[3]]) };
}

/**
 * How far one picture is another: the share of cloth cells whose colour regions line up one-to-one (the regions paired
 * greedily by overlap), and the share of those paired cells whose colours are of one family.
 */
function likeness(a, b) {
  const A = cluster(a), B = cluster(b), counts = new Map();
  let total = 0;
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const x = A.labels[j][i], y = B.labels[j][i];
    if (x < 0 || y < 0) continue;
    total++;
    counts.set(`${x},${y}`, (counts.get(`${x},${y}`) ?? 0) + 1);
  }
  const pairs = [...counts].map(([k, n]) => [...k.split(',').map(Number), n]).sort((p, q) => q[2] - p[2]);
  const usedA = new Set(), usedB = new Set();
  let mapped = 0, sameFamily = 0;
  for (const [x, y, n] of pairs) {
    if (usedA.has(x) || usedB.has(y)) continue;
    usedA.add(x); usedB.add(y); mapped += n;
    if (family(A.means[x]) === family(B.means[y])) sameFamily += n;
  }
  return { layout: total ? mapped / total : 0, colour: mapped ? sameFamily / mapped : 0 };
}
/** A picture looks like a flag when its regions line up (80%) and their colours are the flag's (70%), either face. */
const LAYOUT = 0.8, COLOUR = 0.7;
function nearestReal(g) {
  let best = { name: null, layout: 0, colour: 0, match: false };
  for (const [name, layers] of Object.entries(REAL_FLAGS)) {
    const ref = realGrid(layers);
    for (const pic of [g, mirror(g)]) {
      const l = likeness(pic, ref), match = l.layout >= LAYOUT && l.colour >= COLOUR;
      if (match > best.match || (match === best.match && l.layout * l.colour > best.layout * best.colour)) best = { name, ...l, match };
    }
  }
  return best;
}
const fmt = (b) => `${b.name} (layout ${b.layout.toFixed(2)}, colour ${b.colour.toFixed(2)})`;

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

// ---------------------------------------------------------------------------------------------------- 1. the designs
// (the table's own sanity: the matcher finds a flag in itself, and the real flags this lane replaced in their drawn colours)
for (const name of ['jordan', 'usa', 'croatia']) assert.ok(nearestReal(realGrid(REAL_FLAGS[name])).match, `the matcher finds ${name} in itself`);
const designGrids = Object.fromEntries(Object.keys(WORLD_FLAG_DESIGNS).map((id) => [id, designGrid(id)]));
for (const [id, g] of Object.entries(designGrids)) {
  const near = nearestReal(g);
  check(!near.match, `design '${id}' reads as a real flag: ${fmt(near)}`);
  console.log(`  design ${id}: nearest real flag ${fmt(near)}`);
}

// ---------------------------------------------------------------------------------------------------- 2. the drawn flags
const landmark = (kind, params) => () => {
  const out = LANDMARK_BUILDERS[kind]({ kind, params: resolveLandmarkParams({ kind, x: 0, z: 0, params }), rng: streamFrom(11), variant: streamFrom(80),
    age: streamFrom(148), tier: 'desktop', groundFall: 0, brick: false, snowCap: false, mapId: 'selftest' });
  const parts = out.parts ?? out;
  return REGIONAL_BUCKETS.flatMap((b) => parts[b] ?? []);
};
const KOLKHOZ = landmark('kolkhozArch', { span: 10, height: 6.2, sign: 'КОЛХОЗ «ЗАРЯ ЦЕЛИНЫ»' });
/** Each site that flies a flag: its build, the box its cloth hangs in (the piece's frame), the axis it faces along. */
const SITES = [
  { file: 'src/world/landmarks/forts.ts', name: 'the badlands fort', design: 'dune', build: landmark('desertFort', {}),
    box: [[-11.15, 14.0, 10.5], [-7.0, 16.95, 12.0]], face: 'z' },
  { file: 'src/world/landmarks/parks.ts', name: "Saltwind's stendardo", design: 'quay', build: landmark('piazza', { width: 18, depth: 29, furnish: true }),
    box: [[-0.95, 7.5, -9.3], [1.1, 10, -8.7]], face: 'z' },
  { file: 'src/world/landmarks/lunar.ts', name: 'the Apollo site', design: 'survey', build: landmark('apolloSite', { radius: 16 }),
    box: [[-5.16, 1.3, -6.7], [-3.4, 2.43, -6.1]], face: 'z', fade: 0.25 },
  { file: 'src/world/maps/structureKit.ts', name: 'the Franconian border post', design: 'march',
    build: () => [REGIONAL_DESTRUCTIBLE_TYPES.franconian.securityoffice.build(streamFrom(5))], box: [[3.8, 4.3, 3.9], [4.3, 5.3, 4.95]], face: 'x' },
  // (279) the kolkhoz arch's right pillar flag (span 10, height 6.2: the pillar at x 5.4, the cloth 6.59–7.55 m up)
  { file: 'src/world/landmarks/gates.ts', name: "the kolkhoz arch's pillar flag", design: 'furrow', build: KOLKHOZ,
    box: [[5.38, 6.5, -0.06], [6.6, 7.6, 0.06]], face: 'z' },
  // (279) the Lorraine mairie's staff over its door (a 9 × 11 m lot: the cloth on the front's centre line, 4.75–5.45 m up)
  { file: 'src/world/maps/regional/lorrain.ts', name: 'the Lorraine mairie', design: 'commune', build: () => {
    const [w, d, h] = [9, 11, 8];
    return Object.values(buildRegionalParts(LORRAIN_STYLE, { structureId: 'schoolhouse', info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
      wallBucket: 'plaster', rng: streamFrom(11), variant: streamFrom(80), mapId: 'selftest', snowCap: false, tier: 'desktop' }, streamFrom(38))).flat();
  }, box: [[-0.05, 4.65, 6.15], [0.05, 5.55, 7.2]], face: '-x' },
];
/** (279) The banners: lettered boards, no design, so no real flag and no red field. */
const BANNERS = [
  { file: 'src/world/landmarks/gates.ts', name: "the kolkhoz arch's name banner", build: KOLKHOZ, box: [[-5, 3.48, 0], [5, 4.83, 0.2]], face: 'z', field: 'red' },
];
const _c = new THREE.Color();
/** The cloth in the window as drawn: the faces turned to the viewer, nearest first, each column stretched to its height. */
function drawnGrid(geoms, [lo, hi], face) {
  const tris = [];
  const P = (g, i) => [g.getX(i), g.getY(i), g.getZ(i)];
  const screen = (p) => (face === 'z' ? [p[0], p[1], p[2]] : face === 'x' ? [-p[2], p[1], p[0]] : [p[2], p[1], -p[0]]);
  for (const geo of geoms) {
    const pos = geo.getAttribute('position'), col = geo.getAttribute('color'), index = geo.index;
    if (!col) continue;
    const count = index ? index.count : pos.count;
    for (let t = 0; t < count; t += 3) {
      const ids = [0, 1, 2].map((k) => (index ? index.getX(t + k) : t + k)), pts = ids.map((i) => P(pos, i));
      if (!pts.every((p) => p.every((x, k) => x >= lo[k] && x <= hi[k]))) continue;
      const s = pts.map(screen), area = (s[1][0] - s[0][0]) * (s[2][1] - s[0][1]) - (s[2][0] - s[0][0]) * (s[1][1] - s[0][1]);
      if (area <= 1e-9) continue;
      const rgb = ids.reduce((acc, i) => [acc[0] + col.getX(i) / 3, acc[1] + col.getY(i) / 3, acc[2] + col.getZ(i) / 3], [0, 0, 0]);
      tris.push({ s, depth: (s[0][2] + s[1][2] + s[2][2]) / 3, lab: oklab(rgb), area: area / 2,
        box: [Math.min(s[0][0], s[1][0], s[2][0]), Math.max(s[0][0], s[1][0], s[2][0]), Math.min(s[0][1], s[1][1], s[2][1]), Math.max(s[0][1], s[1][1], s[2][1])] });
    }
  }
  const at = (x, y) => {
    let best = null;
    for (const t of tris) {
      if (x < t.box[0] || x > t.box[1] || y < t.box[2] || y > t.box[3] || (best && t.depth <= best.depth)) continue;
      if (inConvex(t.s, x, y)) best = t;
    }
    return best;
  };
  const x0 = Math.min(...tris.map((t) => t.box[0])), x1 = Math.max(...tris.map((t) => t.box[1]));
  const y0 = Math.min(...tris.map((t) => t.box[2])), y1 = Math.max(...tris.map((t) => t.box[3]));
  const columns = Array.from({ length: COLS }, (_, i) => {
    const x = x0 + ((i + 0.5) / COLS) * (x1 - x0);
    let top = -Infinity, foot = Infinity;
    for (let k = 0; k <= 400; k++) { const y = y0 + (k / 400) * (y1 - y0); if (at(x, y)) { top = Math.max(top, y); foot = Math.min(foot, y); } }
    return Array.from({ length: ROWS }, (_, j) => (top > foot ? at(x, top - ((j + 0.5) / ROWS) * (top - foot))?.lab ?? null : null));
  });
  return { grid: Array.from({ length: ROWS }, (_, j) => columns.map((c) => c[j])), area: tris.reduce((a, t) => a + t.area, 0) };
}
for (const site of SITES) {
  openWorldClothCensus();
  const geoms = site.build(), noted = closeWorldClothCensus();
  check(noted.some((e) => e.id === site.design && e.kind === 'design' && e.site),
    `${site.name}: its build notes its cloth in the census by design id '${site.design}' (noted: ${JSON.stringify(noted)})`);
  const { grid: g, area } = drawnGrid(geoms, site.box, site.face);
  check(area > 0.3, `${site.name}: the window holds a flag's cloth (${area.toFixed(2)} m² faces it)`);
  if (area <= 0.3) continue;
  const near = nearestReal(g);
  check(!near.match, `${site.name}: the drawn flag reads as a real flag: ${fmt(near)}`);
  const own = Object.keys(designGrids).map((id) => [id, designGrid(id, site.fade)]).map(([id, d]) => [id, Math.max(...[g, mirror(g)].map((pic) => { const l = likeness(pic, d); return l.layout * l.colour; }))])
    .sort((a, b) => b[1] - a[1]);
  check(own[0][0] === site.design && own[0][1] >= 0.75,
    `${site.name}: the drawn flag is worldFlags.ts '${site.design}' (nearest design ${own[0][0]} at ${own[0][1].toFixed(2)})`);
  console.log(`  ${site.name}: ${area.toFixed(2)} m² of cloth, design ${own[0][0]} (${own[0][1].toFixed(2)}), nearest real flag ${fmt(near)}`);
}

for (const banner of BANNERS) {
  const { grid: g, area } = drawnGrid(banner.build(), banner.box, banner.face);
  check(area > 1, `${banner.name}: the window holds the banner (${area.toFixed(2)} m² faces it)`);
  if (area <= 1) continue;
  const near = nearestReal(g), { labels, means } = cluster(g), counts = means.map(() => 0);
  for (const row of labels) for (const k of row) if (k >= 0) counts[k]++;
  const field = means[counts.indexOf(Math.max(...counts))];
  check(!near.match, `${banner.name}: reads as a real flag: ${fmt(near)}`);
  check(family(field) === banner.field, `${banner.name}: its field is ${family(field)}, not ${banner.field}`);
  console.log(`  ${banner.name}: ${area.toFixed(2)} m², field ${family(field)}, nearest real flag ${fmt(near)}`);
}

// ---------------------------------------------------------------------------------------------------- 3. the source
const WORLD = join(ROOT, 'src/world');
const sources = readdirSync(WORLD, { recursive: true }).filter((f) => f.endsWith('.ts')).map((f) => join(WORLD, f));
const drawers = [];
for (const file of sources) {
  const rel = relative(ROOT, file);
  if (rel === 'src/world/worldFlags.ts') continue;
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/\b[A-Z_]*(?:FLAG|BANNER)_[A-Z_]*\s*=\s*(?:rgb\()?0x[0-9a-f]{6}/gi)) check(false, `${rel}: keeps a flag colour of its own (${m[0]}); a world flag is worldFlags.ts's`);
  for (const m of text.matchAll(/\bflag of (?!the\b|its\b|a\b)[A-Z]\w+|\b(?!Main\b)[A-Z][a-z]+'s (?:national )?flag\b|\bnational flag\b/g)) {
    check(false, `${rel}: names a nation's flag ("${m[0]}"); world dressing flies worldFlags.ts's`);
  }
  if (/from '(?:\.\.?\/)+(?:world\/)?worldFlags\.ts'/.test(text)) drawers.push(rel);
}
// (279) the plain cloths' sites note their cloth by a PLAIN_CLOTHS id and draw no design
const PLAIN_FILES = ['src/world/landmarks/lunar.ts', 'src/world/maps/regional/lunarWorks.ts', 'src/world/maps/regional/wadirum.ts', 'src/world/landmarks/polarStations.ts'];
const users = [...new Set([...SITES.map((s) => s.file), ...PLAIN_FILES])].sort();
check(JSON.stringify(drawers.sort()) === JSON.stringify(users),
  `the modules that use worldFlags.ts (${drawers.join(', ')}) are the sites rendered here and the plain cloths' (${users.join(', ')})`);
for (const id of Object.keys(PLAIN_CLOTHS)) {
  check(sources.some((f) => readFileSync(f, 'utf8').includes(`noteWorldCloth('${id}'`)), `the plain cloth '${id}' is noted by a site`);
}

if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
console.log(`worldFlags.selftest: PASS (${Object.keys(WORLD_FLAG_DESIGNS).length} designs, ${SITES.length} drawn flags and ${BANNERS.length} banner against ${Object.keys(REAL_FLAGS).length} real flags; the source keeps no flag of its own)`);
