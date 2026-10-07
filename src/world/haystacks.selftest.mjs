// haystacks.selftest — the field stacks of every region and the straw props' print (the scenery lane, b15; gauntlet wave
// 106 on the field haystack: "a bare textureless dark cone … a leftover debug marker"). Pinned:
//   1. the print (hayPrint.ts): deterministic; four bands, each periodic along u; the face band straw-coloured and lit
//      (no dark cone), its locks a relief, its foot darker than its shoulder; the thatch band in courses; the wood band
//      grey;
//   2. the forms (haystackKit.ts, the straw kinds of inhabitKit and sceneryKit): every kind's geometry inside its
//      record's radius and height, its footprint (collider) inside its visible hay, its print in the bands, within its
//      triangle budget; the stog and the plast round a pole that stands out of the crown, the hooiberg's roof on four
//      poles over its stack, the Diemen longer than it is wide; the stook a teepee of sheaves inside the Autumn
//      harvest envelope;
//   3. the maps (haystackKit HAYSTACK_STYLE_BY_MAP): each region's stack where the coordinator's survey placed one,
//      none at the default and on the maps that stack no hay, the steppe's cone left to the maps lane;
//   4. the wiring (props.ts): the print on the straw destructibles' own material (the roofs and reeds keep the straw
//      print), the default count none, the draws the old stream's (the authored count or fifteen), a stack the region
//      does not build taking its draws and standing nowhere;
//   5. (b21; wave 139: "a perfectly smooth, symmetric beehive silhouette", "a straight-edged, four-sided pyramid", "a
//      base that isn't settled or trodden") the hand-built stacks no solids of revolution — the stog, the plast, the
//      meule and the kopna slumped to a side through the belly, inside their reach; the legacy cone the kopna, its draws
//      spent as the cone's; the trodden straw round every stack's foot;
//   6. (b22; waves 147, 154 and 157: "modern round bales" on the WW2 and 1950s maps) the period's 'bale', the haycock: on
//      the round bale's record, contact and burst heap, drawing what it draws (nothing), a man's height inside the
//      bale's height, its reach inside the Autumn harvest's envelope, its collider inside its hay at the ground, built
//      by hand, its colliders refit from one convex stand-in; the round bale on the modern maps alone (Kestrel Airfield,
//      Frontier Basin), swapped in by props.ts;
//   7. (b24) every straw kind's colliders refit from a convex stand-in: one outline each, from the ground, inside the
//      plan footprint of its hay below the contact band's top (rasterised at 2 cm, its gaps closed, filled), so a hull
//      never stops short of the hay it sees; every straw kind but the convex round bale names one.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { HAY_FACE_V, HAY_PACKED_V, HAY_THATCH_V, HAY_WOOD_V, paintHayBuffers } from './hayPrint.ts';
import { HAYCOCK_REACH, HAYSTACK_DESTRUCTIBLE_TYPES, HAYSTACK_STYLE_BY_MAP, HAYSTACK_STYLE_KINDS, ROUND_BALE_MAPS, STRAW_STAND_IN_TOP_M } from './maps/haystackKit.ts';
import { DESTRUCTIBLE_TYPES, HAYCOCK_BALE } from './maps/inhabitKit.ts';
import { SCENERY_DESTRUCTIBLE_TYPES } from './maps/sceneryKit.ts';
import { MAP_IDS } from './maps/index.ts';
import { deriveRuntimeStructureContactBand } from './structureCollision.ts';

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const drain = (it) => { let s = it.next(); while (!s.done) s = it.next(); return s.value; };

// ---------------------------------------------------------------------------------------------- 1. the print
{
  const S = 256, a = drain(paintHayBuffers(S)), b = drain(paintHayBuffers(S));
  assert.deepEqual(Array.from(a.px), Array.from(b.px), 'the print is deterministic');
  // (the GPU's way round: row y at v = 1 - (y + 0.5) / S)
  const rowOf = (v) => Math.min(S - 1, Math.max(0, Math.round((1 - v) * S - 0.5)));
  const stats = (band, from = 0, to = 1) => {
    let l = 0, sat = 0, n = 0, h = 0, h2 = 0;
    for (let y = rowOf(band[0] + (band[1] - band[0]) * to); y <= rowOf(band[0] + (band[1] - band[0]) * from); y++) for (let x = 0; x < S; x++) {
      const j = (y * S + x) * 4, r = a.px[j] / 255, g = a.px[j + 1] / 255, bl = a.px[j + 2] / 255;
      const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl);
      l += (mx + mn) / 2; sat += mx - mn; n++;
      h += a.hgt[y * S + x]; h2 += a.hgt[y * S + x] ** 2;
    }
    return { l: l / n, chroma: sat / n, relief: Math.sqrt(h2 / n - (h / n) ** 2) };
  };
  const face = stats(HAY_FACE_V), foot = stats(HAY_FACE_V, 0, 0.12), shoulder = stats(HAY_FACE_V, 0.7, 1);
  assert.ok(face.l > 0.33 && face.l < 0.55 && face.chroma > 0.12, `the face straw-coloured and lit, no dark cone (L ${face.l.toFixed(3)}, chroma ${face.chroma.toFixed(3)})`);
  assert.ok(face.relief > 0.05, `the face's locks a relief (sd ${face.relief.toFixed(3)})`);
  assert.ok(foot.l < shoulder.l - 0.03, `the foot pressed and darker than the shoulder (${foot.l.toFixed(3)} < ${shoulder.l.toFixed(3)})`);
  const wood = stats(HAY_WOOD_V), thatch = stats(HAY_THATCH_V), packed = stats(HAY_PACKED_V);
  assert.ok(wood.chroma < face.chroma * 0.7, `the wood band grey timber (chroma ${wood.chroma.toFixed(3)})`);
  assert.ok(thatch.relief > 0.05 && packed.relief > 0.05, 'the thatch and the bale straw in relief');
  // periodic along u: every band's first and last columns alike (a stack's print wraps round it)
  let seam = 0, inner = 0;
  for (let y = 0; y < S; y++) {
    const j0 = (y * S) * 4, j1 = (y * S + S - 1) * 4, j2 = (y * S + 1) * 4;
    seam += Math.abs(a.px[j0] - a.px[j1]); inner += Math.abs(a.px[j0] - a.px[j2]);
  }
  assert.ok(seam < inner * 1.6 + S * 4, `periodic along u (seam ${(seam / S).toFixed(1)} against neighbours ${(inner / S).toFixed(1)})`);
}

// ---------------------------------------------------------------------------------------------- 2. the forms
const REG = { ...DESTRUCTIBLE_TYPES, ...SCENERY_DESTRUCTIBLE_TYPES, ...HAYSTACK_DESTRUCTIBLE_TYPES };
const inBands = (v) => [HAY_PACKED_V, HAY_FACE_V, HAY_THATCH_V, HAY_WOOD_V].some((band) => v >= band[0] - 0.021 && v <= band[1] + 0.021);
const STACKS = new Set(Object.keys(HAYSTACK_DESTRUCTIBLE_TYPES));
// (b21: the hooiberg's hay pitched up in layers, its roof's courses stepped; the legacy cone the kopna)
const BUDGET = { stog: 600, plast: 520, hooiberg: 900, meule: 700, diemen: 640, strawstack: 260, haystack: 340, stook: 420, bale: 130 };
for (const kind of ['stog', 'plast', 'hooiberg', 'meule', 'diemen', 'strawstack', 'haystack', 'stook', 'bale']) {
  const t = REG[kind];
  assert.ok(t && t.mat === 'straw' && t.cls === 'break' && t.contact === 'ob' && !t.collider, `${kind}: a straw stack, crushable and shoot-through`);
  for (const seed of [3, 17, 2002, 40961]) {
    for (const [label, build] of [['intact', t.build], ['broken', t.broken]]) {
      const g = build(mulberry32(seed));
      const p = g.attributes.position, uv = g.attributes.uv;
      assert.ok(uv && uv.count === p.count && g.attributes.normal, `${kind} ${label}: position, normal and uv`);
      const tris = (g.index ? g.index.count : p.count) / 3;
      assert.ok(tris <= BUDGET[kind], `${kind} ${label}: within its budget (${tris} triangles of ${BUDGET[kind]})`);
      for (let i = 0; i < uv.count; i++) assert.ok(inBands(uv.getY(i)), `${kind} ${label}: its print in the bands (v ${uv.getY(i).toFixed(3)})`);
      if (label === 'broken' || !STACKS.has(kind)) continue;
      // a region's stack: its hay above the skirt inside its reach, its top (the poles) inside its height, its settled foot
      // inside its grounding disc, its footprint inside the hay at the ground (its foot and the skirt pressed round it)
      let body = 0, foot = 0, top = -Infinity, footX = 0, footZ = 0;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
        top = Math.max(top, y);
        if (y > 0.3) body = Math.max(body, r);
        else foot = Math.max(foot, r);
        if (y >= 0 && y < 1.0 && uv.getY(i) >= HAY_FACE_V[0] && uv.getY(i) <= HAY_FACE_V[1]) { footX = Math.max(footX, Math.abs(x)); footZ = Math.max(footZ, Math.abs(z)); }
      }
      assert.ok(body <= t.r * 1.03 + 0.03, `${kind}: its hay inside its reach (${body.toFixed(2)} of ${t.r})`);
      assert.ok(top <= t.h + 0.05, `${kind}: inside its height (${top.toFixed(2)} of ${t.h})`);
      const style = Object.values(HAYSTACK_STYLE_KINDS).find((s) => s.kind === kind);
      assert.ok(style && foot <= style.spotR, `${kind}: its settled foot inside its grounding disc (${foot.toFixed(2)} of ${style?.spotR})`);
      if (t.collisionR) assert.ok(t.collisionR <= Math.min(footX, footZ), `${kind}: its footprint inside its hay at the ground (${t.collisionR} of ${Math.min(footX, footZ).toFixed(2)})`);
      if (t.hw && t.hl) assert.ok(t.hw <= footX + 0.05 && t.hl <= footZ + 0.05, `${kind}: its box inside its hay at the ground (${t.hw} x ${t.hl} of ${footX.toFixed(2)} x ${footZ.toFixed(2)})`);
    }
  }
}
{
  // the regions' builds
  const tops = (g, r) => { let top = -Infinity; const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (Math.hypot(p.getX(i), p.getZ(i)) < r) top = Math.max(top, p.getY(i)); return top; };
  for (const kind of ['stog', 'plast']) {
    const g = REG[kind].build(mulberry32(5));
    const p = g.attributes.position;
    let crown = -Infinity;
    for (let i = 0; i < p.count; i++) if (Math.hypot(p.getX(i), p.getZ(i)) > 0.3) crown = Math.max(crown, p.getY(i));
    assert.ok(tops(g, 0.15) > crown + 0.4, `${kind}: its pole stands out of its crown (${(tops(g, 0.15) - crown).toFixed(2)} m)`);
  }
  const hooi = REG.hooiberg.build(mulberry32(5)), hp = hooi.attributes.position;
  let polesHigh = 0;
  for (let i = 0; i < hp.count; i++) if (Math.abs(Math.abs(hp.getX(i)) - Math.abs(hp.getZ(i))) < 0.3 && Math.hypot(hp.getX(i), hp.getZ(i)) > 2.6 && hp.getY(i) > 5.5) polesHigh++;
  assert.ok(polesHigh >= 4, 'the hooiberg: its four poles stand above its roof at the corners');
  const diemen = REG.diemen.build(mulberry32(5));
  diemen.computeBoundingBox();
  assert.ok(diemen.boundingBox.max.z > diemen.boundingBox.max.x * 1.5, 'the Diemen: a long rick');
  // the stook inside the Autumn harvest envelope (props.ts autumnHarvestRadius: .22 + .16 + .625 sin .34)
  const stook = REG.stook.build(mulberry32(5));
  stook.computeBoundingBox();
  const sb = stook.boundingBox, envelope = 0.22 + 0.16 + 0.625 * Math.sin(0.34);
  assert.ok(Math.max(-sb.min.x, sb.max.x, -sb.min.z, sb.max.z) <= envelope, `the stook inside the harvest envelope (${Math.max(-sb.min.x, sb.max.x, -sb.min.z, sb.max.z).toFixed(3)} of ${envelope.toFixed(3)})`);
}

// ---------------------------------------------------------------------------------------------- 3. the maps
{
  const expected = {
    verdant: 'stog', winter: 'stog', saltwind: 'plast', polders: 'hooiberg', autumn: 'meule', coastal: 'meule',
    frontier: 'diemen', reservoir: 'diemen', delta: 'strawstack', mangrove: 'strawstack', orchard: 'none', longleaf: 'none', cliffbridge: 'none',
  };
  assert.deepEqual({ ...HAYSTACK_STYLE_BY_MAP }, expected, 'each region\'s stack, none where its fields stack no hay');
  for (const map of Object.keys(HAYSTACK_STYLE_BY_MAP)) assert.ok(MAP_IDS.includes(map), `${map}: a map`);
  assert.ok(!('steppe' in HAYSTACK_STYLE_BY_MAP), 'the steppe\'s rick is the maps lane\'s (its authored count keeps the cone until then)');
  for (const [style, { kind }] of Object.entries(HAYSTACK_STYLE_KINDS)) assert.ok(REG[kind], `${style}: its kind in the registry`);
  for (const kind of Object.keys(HAYSTACK_DESTRUCTIBLE_TYPES)) {
    assert.ok(!(kind in DESTRUCTIBLE_TYPES) && !(kind in SCENERY_DESTRUCTIBLE_TYPES), `${kind}: a new kind (no existing kind moves)`);
  }
}

// ---------------------------------------------------------------------------------------------- 4. the wiring
{
  const props = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
  // the straw destructibles wear the hay print on their own material (sharing the straw's program); the straw bucket
  // (thatched roofs, reeds: their UVs tile the whole tile) keeps the straw print's uniform stalks
  assert.match(props, /const straw = makeStraw\(noi, aniso, T\.straw \|\| null\);/, 'the roofs and reeds keep the straw print');
  assert.match(props, /const hay = yield\* makeHay\(aniso, T\.straw \|\| null, getDeviceTier\(\) === 'mobile' \? 256 : 512\);/, 'the hay print, half size on phones');
  assert.match(props, /hay: new THREE\.MeshStandardMaterial\(\{ map: hay\.albedo, normalMap: hay\.normal,/, 'the hay material');
  // (b25: the kind's single material is \`single\`; a kind of two materials by its groups names them in its record)
  assert.match(props, /let single: THREE\.MeshStandardMaterial = \(meta\.mat === 'straw' \? mats\.hay : mats\[meta\.mat\]\) \|\| mats\.baked;/, 'a straw destructible wears the hay material');
  assert.match(props, /materialKind === 'hay' \? 'straw'/, 'the hay shares the straw\'s program');
  assert.match(props, /const PROP_TYPE_REGISTRY: Readonly<Record<string, PropsDestructibleMeta>> = \{ \.\.\.DESTRUCTIBLE_TYPES, \.\.\.SCENERY_DESTRUCTIBLE_TYPES, \.\.\.HAYSTACK_DESTRUCTIBLE_TYPES \};/,
    'the stacks join the props registry after the scenery\'s kinds (not landmarks: the scenery plan never places them)');
  assert.match(props, /haystacks: 0, rocks: 170/, 'the default draws none');
  assert.match(props, /const haystackDraws = authoredHaystacks \?\? 15;/, 'the draws the old stream\'s');
  assert.match(props, /const haystackStyle: HaystackStyle = P\.haystackStyle \?\? HAYSTACK_STYLE_BY_MAP\[mapId\] \?\? \(authoredHaystacks !== undefined \? 'haystack' : 'none'\);/,
    'the map\'s region, else the cone where a count is authored, else none');
  const loop = props.slice(props.indexOf('function placeFieldHaystacks('), props.indexOf('placeFieldHaystacks();'));
  assert.ok(loop.indexOf('const sc = 0.85 + rng() * 0.4;') < loop.indexOf('const yaw = rng() * Math.PI * 2;')
    && loop.indexOf('const yaw = rng() * Math.PI * 2;') < loop.indexOf('placed++;') && loop.indexOf('placed++;') < loop.indexOf('if (!form || !meta) continue;'),
    'a stack takes its scale and its yaw before the region decides, so every later placement keeps its seat');
}

// ---------------------------------------------------------------------------------------------- 5. by hand
{
  for (const kind of ['stog', 'plast', 'meule', 'haystack']) {
    const g = REG[kind].build(mulberry32(11)), p = g.attributes.position;
    g.computeBoundingBox();
    const H = g.boundingBox.max.y, bins = new Float64Array(16);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < H * 0.2 || y > H * 0.45) continue;
      const a = Math.atan2(p.getZ(i), p.getX(i)), b = Math.floor(((a / (Math.PI * 2)) + 1) * 16) % 16;
      bins[b] = Math.max(bins[b], Math.hypot(p.getX(i), p.getZ(i)));
    }
    const filled = [...bins].filter((r) => r > 0);
    const lean = Math.max(...filled) / Math.min(...filled);
    assert.ok(filled.length >= 12 && lean > 1.06, `${kind}: slumped to a side through its belly, no solid of revolution (${lean.toFixed(3)})`);
  }
  // the kopna for the legacy cone: a haycock of loose hay, no pole, and the cone's draws spent first
  const kopna = REG.haystack.build(mulberry32(3));
  kopna.computeBoundingBox();
  assert.ok(kopna.boundingBox.max.y > 2.1 && kopna.boundingBox.max.y <= REG.haystack.h + 1e-6, `the kopna about two metres and a bit (${kopna.boundingBox.max.y.toFixed(2)} m)`);
  const kp = kopna.attributes.position;
  assert.ok(kp.count / 3 > 200, `the kopna a stack of locks, not a nine-sided cone (${kp.count / 3} triangles)`);
  const cone = new THREE.ConeGeometry(1.9, 2.5, 9, 2), cp = cone.attributes.position;
  let coneDraws = 0;
  for (let k = 0; k < cp.count; k++) if (Math.hypot(cp.getX(k), cp.getZ(k)) > 1e-4) coneDraws++;
  let draws = 0;
  const base = mulberry32(77);
  REG.haystack.build(() => { draws++; return base(); });
  assert.equal(draws, coneDraws, 'the kopna spends exactly the legacy cone\'s draws (every later pool keeps its geometry)');
  // the trodden straw round every stack's foot (props.ts): its own decal, a third again wider than the contact's
  const props = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
  assert.match(props, /function paintStrawLitter\(ctx: CanvasRenderingContext2D, size: number\): void \{/, 'the litter\'s painter');
  assert.match(props, /const size = kind === 'straw' \? 256 : 128;/, 'its strands their texels');
  assert.match(props, /strawDiscs\.push\(conformedDisc\(stack\.x, stack\.z, stack\.r \* 1\.35, /, 'a stack\'s straw a third again wider than its soil');
  assert.match(props, /addDecalMesh\(strawDiscs, makeGroundDecalTexture\(noi, aniso, 'straw'\), \{\n\s*decalKind: 'straw-litter',/, 'one decal layer for every stack\'s straw');
}

// ---------------------------------------------------------------------------------------------- 6. the period's bale
{
  const props6 = () => readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
  const bale = DESTRUCTIBLE_TYPES.bale, cock = HAYCOCK_BALE;
  for (const key of ['cls', 'mat', 'contact', 'r', 'h', 'shape', 'collisionR', 'broken']) {
    assert.equal(cock[key], bale[key], `the haycock keeps the round bale's ${key}`);
  }
  let draws = 0, baleDraws = 0;
  cock.build(() => { draws++; return 0.5; });
  bale.build(() => { baleDraws++; return 0.5; });
  assert.equal(draws, baleDraws, `the haycock draws what the round bale draws (${baleDraws}): every later pool keeps its geometry`);
  const g = cock.build(mulberry32(1)), p = g.attributes.position, uv = g.attributes.uv;
  assert.deepEqual(Array.from(p.array), Array.from(cock.build(mulberry32(99)).attributes.position.array), 'from a stream of its own');
  assert.ok(uv && uv.count === p.count && g.attributes.normal, 'position, normal and uv');
  const tris = (g.index ? g.index.count : p.count) / 3;
  assert.ok(tris <= 260, `within its budget (${tris} triangles)`);
  for (let i = 0; i < uv.count; i++) assert.ok(inBands(uv.getY(i)), `its print in the bands (v ${uv.getY(i).toFixed(3)})`);
  let top = 0, body = 0, all = 0;
  const ground = new Float64Array(12), belly = new Float64Array(16);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z), turn = Math.atan2(z, x) / (Math.PI * 2) + 1;
    top = Math.max(top, y); all = Math.max(all, r);
    if (y > 0.3) body = Math.max(body, r);
    if (y >= 0 && y <= 0.25) { const b = Math.round(turn * 12) % 12; ground[b] = Math.max(ground[b], r); }
    if (y > 0.25 && y < 0.6) { const b = Math.floor(turn * 16) % 16; belly[b] = Math.max(belly[b], r); }
  }
  assert.ok(top > 1.2 && top <= bale.h, `a man's height, inside the bale's height (${top.toFixed(2)} of ${bale.h})`);
  const envelope = Math.hypot(0.725, 0.72); // props.ts autumnHarvestRadius, the bale's
  assert.ok(body <= HAYCOCK_REACH + 1e-6 && all <= envelope, `its hay inside its reach and the harvest envelope (${body.toFixed(3)}, ${all.toFixed(3)} of ${envelope.toFixed(3)})`);
  assert.ok(Math.min(...ground) >= bale.collisionR, `its collider inside its hay at the ground (${bale.collisionR} of ${Math.min(...ground).toFixed(3)})`);
  // its colliders refit from a convex stand-in (props.ts refitDestructibleColliders): one outline inside its hay at
  // the ground and up to its height, not the dome's ear-clipped dozens
  const proxy = cock.contactProxy();
  proxy.computeBoundingBox();
  const pb = proxy.boundingBox, pr = Math.max(pb.max.x, pb.max.z, -pb.min.x, -pb.min.z);
  assert.ok(pr <= Math.min(...ground) && pr >= bale.collisionR - 1e-6 && Math.abs(pb.max.y - top) < 0.05 && Math.abs(pb.min.y) < 1e-6,
    `the stand-in inside its hay at the ground, up to its height (${pr.toFixed(3)} m, ${pb.max.y.toFixed(2)} m)`);
  const band = deriveRuntimeStructureContactBand({ baked: [proxy] });
  assert.equal(band.parts.length, 1, 'one outline');
  assert.match(props6(), /const proxy = source \? null : pool\.meta\.contactProxy\?\.\(\) \?\? null;\n\s*const contactBand = source\?\.profile\.contact\n\s*\?\? deriveRuntimeStructureContactBand\(\{ baked: \[proxy \?\? geometry\] \}\);/,
    'props refits a kind\'s colliders from its stand-in where it has one');
  const filled = [...belly].filter((r) => r > 0), lean = Math.max(...filled) / Math.min(...filled);
  assert.ok(filled.length >= 10 && lean > 1.06 && lean < 1.4, `built by hand, its slump tempered to its size (${lean.toFixed(3)})`);
  // the maps: the round bale on the modern maps alone, the haycock swapped in on every other
  assert.deepEqual([...ROUND_BALE_MAPS].sort(), ['airfield', 'frontier'], 'the round bale on Kestrel Airfield (2022) and Frontier Basin (the 1980s)');
  for (const m of ROUND_BALE_MAPS) assert.ok(MAP_IDS.includes(m), `${m}: a map`);
  const props = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
  assert.match(props, /\.\.\.\(ROUND_BALE_MAPS\.has\(mapId\) \? \{\} : \{ bale: HAYCOCK_BALE \}\),/, 'props swaps the haycock in for the bale, the modern maps aside');
  const local = props.slice(props.indexOf('const LOCAL_TYPES: Record<string, PropsDestructibleMeta> = {'));
  assert.ok(local.indexOf('bale: HAYCOCK_BALE') > 0 && local.indexOf('bale: HAYCOCK_BALE') < local.indexOf('REGIONAL_DESTRUCTIBLE_TYPES[regionalArchitecture.id]'),
    'before the regional kinds and the map\'s own variants (they may still name their own)');
}

// ---------------------------------------------------------------------------------------------- 7. the stand-ins
{
  // the plan footprint of a build's hay below the contact band's top: every triangle clipped to it and rasterised at
  // 2 cm, closed over `close` cells (a stook's sheaves read as one cone), the exterior flood-filled from the border
  const CELL = 0.02;
  const footprintOf = (g, half, close) => {
    const n = Math.ceil((half * 2) / CELL), occ = new Uint8Array(n * n);
    const p = g.attributes.position, idx = g.index ? g.index.array : null, tris = (idx ? idx.length : p.count) / 3;
    const fill = (pts) => {
      let z0 = Infinity, z1 = -Infinity;
      for (const [, z] of pts) { z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      for (let row = Math.max(0, Math.floor(z0)); row <= Math.min(n - 1, Math.ceil(z1)); row++) {
        const zc = row + 0.5; let xa = Infinity, xb = -Infinity;
        for (let k = 0; k < pts.length; k++) {
          const [ax, az] = pts[k], [bx, bz] = pts[(k + 1) % pts.length];
          if ((az <= zc && bz >= zc) || (bz <= zc && az >= zc)) { const t = Math.abs(bz - az) < 1e-9 ? 0 : (zc - az) / (bz - az), x = ax + (bx - ax) * t; xa = Math.min(xa, x); xb = Math.max(xb, x); }
        }
        if (xa === Infinity) continue;
        for (let c = Math.max(0, Math.floor(xa)); c <= Math.min(n - 1, Math.floor(xb)); c++) occ[row * n + c] = 1;
      }
    };
    for (let t = 0; t < tris; t++) {
      const v = [0, 1, 2].map((k) => { const i = idx ? idx[t * 3 + k] : t * 3 + k; return [p.getX(i), p.getY(i), p.getZ(i)]; });
      const out = [];
      for (let k = 0; k < 3; k++) {
        const a = v[k], b = v[(k + 1) % 3], ina = a[1] <= STRAW_STAND_IN_TOP_M, inb = b[1] <= STRAW_STAND_IN_TOP_M;
        if (ina) out.push(a);
        if (ina !== inb) { const u = (STRAW_STAND_IN_TOP_M - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * u, 0, a[2] + (b[2] - a[2]) * u]); }
      }
      if (out.length >= 3) fill(out.map(([x, , z]) => [(x + half) / CELL, (z + half) / CELL]));
    }
    const pass = (src, horizontal, any) => {
      const dst = new Uint8Array(n * n);
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        let val = any ? 0 : 1;
        for (let d = -close; d <= close; d++) {
          const rr = horizontal ? r : r + d, cc = horizontal ? c + d : c;
          const sv = rr >= 0 && rr < n && cc >= 0 && cc < n ? src[rr * n + cc] : 0;
          if (any && sv) { val = 1; break; }
          if (!any && !sv) { val = 0; break; }
        }
        dst[r * n + c] = val;
      }
      return dst;
    };
    const closed = pass(pass(pass(pass(occ, true, true), false, true), true, false), false, false);
    const ext = new Uint8Array(n * n), stack = [];
    for (let k = 0; k < n; k++) for (const i of [k, (n - 1) * n + k, k * n, k * n + n - 1]) if (!closed[i] && !ext[i]) { ext[i] = 1; stack.push(i); }
    while (stack.length) {
      const i = stack.pop(), r = (i / n) | 0, c = i % n;
      for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
        const j = rr * n + cc;
        if (!closed[j] && !ext[j]) { ext[j] = 1; stack.push(j); }
      }
    }
    return { n, half, ext };
  };
  const REG7 = { ...DESTRUCTIBLE_TYPES, ...SCENERY_DESTRUCTIBLE_TYPES, ...HAYSTACK_DESTRUCTIBLE_TYPES, haycock: HAYCOCK_BALE };
  const straw = Object.entries(REG7).filter(([, t]) => t.mat === 'straw' && t.cls === 'break' && t.contact === 'ob');
  for (const [kind, t] of straw) {
    if (kind === 'bale') { assert.ok(!t.contactProxy, 'the round bale needs none: its cylinder is convex'); continue; }
    assert.equal(typeof t.contactProxy, 'function', `${kind}: a convex stand-in for its colliders`);
    const proxy = t.contactProxy(), pp = proxy.attributes.position;
    assert.equal(deriveRuntimeStructureContactBand({ baked: [proxy] }).parts.length, 1, `${kind}: one outline`);
    proxy.computeBoundingBox();
    assert.ok(Math.abs(proxy.boundingBox.min.y) < 1e-6 && proxy.boundingBox.max.y <= Math.max(t.h, STRAW_STAND_IN_TOP_M) + 1e-6, `${kind}: from the ground`);
    const close = kind === 'stook' ? 5 : 3;
    for (const seed of [3, 17, 2002, 40961]) {
      const fp = footprintOf(t.build(mulberry32(seed)), (t.r ?? 2) + 0.6, close);
      let outside = 0;
      for (let i = 0; i < pp.count; i++) {
        const c = Math.floor((pp.getX(i) + fp.half) / CELL), r = Math.floor((pp.getZ(i) + fp.half) / CELL);
        // (the stand-in's corner cell and its neighbours: none of them the hay's exterior)
        for (const [dr, dc] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) if (fp.ext[(r + dr) * fp.n + (c + dc)]) { outside++; break; }
      }
      assert.equal(outside, 0, `${kind} (seed ${seed}): its stand-in inside the hay's footprint (${outside} corners out)`);
    }
  }
  assert.ok(straw.length >= 9, `every straw kind measured (${straw.map(([k]) => k).join(', ')})`);
}

console.log('haystacks.selftest: the hay print\'s four bands (the face lit and in locks, its foot pressed), the regions\' stacks inside their records over their footprints, the maps\' builds, the draws kept; built by hand, the kopna for the cone, the trodden straw; the haycock for the round bale off the modern maps; every straw kind\'s colliders from a stand-in inside its hay');
