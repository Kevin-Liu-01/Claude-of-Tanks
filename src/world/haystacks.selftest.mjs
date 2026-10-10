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
//      does not build taking its draws and standing nowhere.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { HAY_FACE_V, HAY_PACKED_V, HAY_THATCH_V, HAY_WOOD_V, paintHayBuffers } from './hayPrint.ts';
import { HAYSTACK_DESTRUCTIBLE_TYPES, HAYSTACK_STYLE_BY_MAP, HAYSTACK_STYLE_KINDS } from './maps/haystackKit.ts';
import { DESTRUCTIBLE_TYPES } from './maps/inhabitKit.ts';
import { SCENERY_DESTRUCTIBLE_TYPES } from './maps/sceneryKit.ts';
import { MAP_IDS } from './maps/index.ts';

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
const BUDGET = { stog: 600, plast: 520, hooiberg: 760, meule: 700, diemen: 640, strawstack: 260, haystack: 100, stook: 420, bale: 130 };
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
  assert.match(props, /let material = \(meta\.mat === 'straw' \? mats\.hay : mats\[meta\.mat\]\) \|\| mats\.baked;/, 'a straw destructible wears the hay material');
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

console.log('haystacks.selftest: the hay print\'s four bands (the face lit and in locks, its foot pressed), the regions\' stacks inside their records over their footprints, the maps\' builds, the draws kept');
