// Receipt: every bridge support stands on a footing through the ground under it (bridge-footings-275).
//
// The owner, 2026-11-21, with a screenshot of Aegis Crossing's Puente Nuevo: "in the bridge map its supports need to have
// proper foundations going through bottom of land". The viaduct's body stood on one footing for the whole bridge (the bed
// at the deck's centre less 0.6 m), and its five piers hung 2.5-5.9 m over the gorge floor; Amberford's piers and
// Blackglass's Suzhou Creek piers hung 0.1-0.4 m over their beds; the landmark viaduct's piers stood 1.2 m under a base
// read at nine points of its footprint. Every builder now foots each support on the ground under its own rectangle
// (footings.ts) and reports it. This receipt reads each support against the ground under it read every 0.2 m, and against
// what is built on it: the drawn stone or timber inside its rectangle reaches its footing, and so does the collision.
//
// Covered: every terrain bridge deck on every map (each must be claimed by a known builder: a new deck builder fails
// here until it reports its footings), every authored bridge landmark on every map in the composer's frame, and every
// landmark bridge kind over a ditch narrower than the composer's nine-point read. A control proves a floating support
// fails.
import assert from 'node:assert/strict';
import { createHeightField, mulberry32 } from './terrain.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { addArchedStoneBridge, archedBridgeFootings } from './maps/archedStoneBridge.ts';
import { addSuzhouBridge, suzhouBridgeFootings } from './maps/suzhouBridges.ts';
import { LANDMARK_BUILDERS } from './landmarks/index.ts';
import { LANDMARK_KINDS, resolveLandmarkParams } from './landmarks/plan.ts';
import { REGIONAL_BUCKETS, streamFrom } from './maps/regional/geometry.ts';
import { sampleObbGround } from './propPlacement.ts';

/** The ground under a support is read this far apart here (the builders read it every 0.5 m). */
const DENSE_M = 0.2;
const EPS = 0.01;

/**
 * A support's failures: its base over the lowest ground under its rectangle; the drawn geometry inside its rectangle (in
 * the support's frame) not reaching its base; a collision part centred over it standing higher than its base.
 */
function footingFailures(label, supports, { ground, vertices, parts }) {
  const failures = [];
  let worst = Infinity;
  for (const s of supports) {
    let low = Infinity;
    const nx = Math.max(1, Math.ceil((s.x1 - s.x0) / DENSE_M)), nz = Math.max(1, Math.ceil((s.z1 - s.z0) / DENSE_M));
    for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++) low = Math.min(low, ground(s.x0 + (s.x1 - s.x0) * i / nx, s.z0 + (s.z1 - s.z0) * k / nz));
    worst = Math.min(worst, low - s.y0);
    if (!(s.y0 < low)) failures.push(`${label} ${s.label}: its base ${s.y0.toFixed(2)} stands ${(s.y0 - low).toFixed(2)} m over the ground under it (${low.toFixed(2)})`);
    if (vertices) {
      let drawn = Infinity;
      for (let i = 0; i < vertices.length; i += 3) {
        const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
        if (x >= s.x0 - EPS && x <= s.x1 + EPS && z >= s.z0 - EPS && z <= s.z1 + EPS && y < drawn) drawn = y;
      }
      if (!(drawn <= s.y0 + EPS)) failures.push(`${label} ${s.label}: the geometry over it stops at ${drawn.toFixed(2)}, not its footing ${s.y0.toFixed(2)}`);
    }
    if (parts) {
      // (a support the record leaves out, a bent's piles or a sill, takes its collision from the drawn geometry)
      const over = parts.filter((p) => p.cx >= s.x0 - EPS && p.cx <= s.x1 + EPS && p.cz >= s.z0 - EPS && p.cz <= s.z1 + EPS);
      const y0 = Math.min(...over.map((p) => p.y0));
      if (over.length && !(y0 <= s.y0 + EPS)) failures.push(`${label} ${s.label}: its collision stops at ${y0.toFixed(2)}, not its footing ${s.y0.toFixed(2)}`);
    }
  }
  return { failures, worst };
}

/** Every vertex of a set of geometries, mapped into a frame by `to` ([x, y, z] -> [fx, y, fz]). */
function frameVertices(geometries, to) {
  const out = [];
  for (const g of geometries) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) { const [x, z] = to(p.getX(i), p.getZ(i)); out.push(x, p.getY(i), z); }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------- control
{
  const flat = () => 0;
  const floating = footingFailures('control', [{ label: 'pier', x0: -1, x1: 1, z0: -1, z1: 1, y0: 0.3 }], { ground: flat });
  assert.equal(floating.failures.length, 1, 'control: a support 0.3 m over the ground fails');
  const ditch = (x) => (Math.abs(x - 0.7) < 0.15 ? -2 : 0); // a ditch the builders' 0.5 m read must still catch
  assert.equal(footingFailures('control', [{ label: 'pier', x0: -1, x1: 1, z0: -1, z1: 1, y0: -1.2 }], { ground: ditch }).failures.length, 1,
    'control: a footing over a ditch narrower than its read fails at 0.2 m');
  const short = footingFailures('control', [{ label: 'pier', x0: -1, x1: 1, z0: -1, z1: 1, y0: -1.2 }], { ground: flat, vertices: [0, -0.5, 0, 0, 3, 0] });
  assert.equal(short.failures.length, 1, 'control: geometry stopping short of the footing fails');
  const record = footingFailures('control', [{ label: 'pier', x0: -1, x1: 1, z0: -1, z1: 1, y0: -1.2 }],
    { ground: flat, parts: [{ cx: 0, cz: 0, y0: -0.6 }] });
  assert.equal(record.failures.length, 1, 'control: a collision part over it stopping short of the footing fails');
}

const report = [];
const failures = [];

// ---------------------------------------------------------------------------------------------------------- terrain bridge decks
// the builders mapKits.ts dressMapExtrasSteps lays on a map's decks: Cliffbridge's Puente Nuevo (Ronda masonry), the
// river kit's arched bridges (Norman), Suzhou Creek's girders and the Garden Bridge's truss
function deckBuilder(mapId, cfg) {
  const kits = cfg.props?.extraKits ?? [];
  if (mapId === 'cliffbridge') return 'ronda';
  if (kits.includes('shanghai')) return 'suzhou';
  if (mapId === 'autumn' || kits.includes('river')) return 'norman';
  return null;
}
let decksSeen = 0;
for (const mapId of MAP_IDS) {
  const cfg = getMapConfig(mapId), field = createHeightField(1337, cfg), decks = field.bridgeDecks ?? [];
  if (!decks.length) continue;
  const builder = deckBuilder(mapId, cfg);
  // (Polders' deck carries its lift bridge, a landmark: read below with the authored pieces)
  if (mapId === 'polders') continue;
  assert.ok(builder, `${mapId}: its ${decks.length} bridge deck(s) are built by a builder this receipt knows (report its footings here)`);
  const bund = decks.reduce((best, d) => (!best || d.x > best.x ? d : best), null);
  let worst = Infinity, count = 0;
  for (const deck of decks) {
    decksSeen++;
    const buckets = new Proxy({}, { get: (t, k) => (t[k] ??= []) }), obstacles = [], colliders = [];
    const ctx = { mapId, obstacles, colliders };
    let supports;
    if (builder === 'suzhou') {
      supports = suzhouBridgeFootings(deck, field).list;
      addSuzhouBridge(deck, field, buckets, ctx, deck === bund ? 'truss' : 'girder');
    } else {
      supports = archedBridgeFootings(deck, field).list;
      addArchedStoneBridge(deck, field, mulberry32(1337 ^ 0x5a17), buckets, ctx, builder);
    }
    const { x: cx, z: cz, ux, uz } = deck, vx = -uz, vz = ux;
    const toFrame = (x, z) => [(x - cx) * ux + (z - cz) * uz, (x - cx) * vx + (z - cz) * vz];
    const geometries = Object.values(buckets).flat();
    const parts = obstacles.filter((r) => r.kind === 'bridge').flatMap((r) => r.shape2?.parts ?? [])
      .map((p) => { const [x, z] = toFrame(p.cx, p.cz); return { ...p, cx: x, cz: z }; });
    const result = footingFailures(`${mapId} deck (${deck.x.toFixed(0)}, ${deck.z.toFixed(0)})`, supports, {
      ground: (u, v) => field.getHeightAt(cx + ux * u + vx * v, cz + uz * u + vz * v),
      vertices: frameVertices(geometries, toFrame), parts,
    });
    failures.push(...result.failures);
    worst = Math.min(worst, result.worst); count += supports.length;
    for (const g of geometries) g.dispose();
  }
  report.push(`${mapId} ${builder}: ${decks.length} deck(s), ${count} supports, the shallowest ${worst.toFixed(2)} m under its ground`);
}
assert.ok(decksSeen >= 6, 'the decks this receipt reads (Cliffbridge, Amberford, Blackglass four)');

// ---------------------------------------------------------------------------------------------------------- authored bridge landmarks
const build = (kind, params, ground, groundFall = 0, seed = 11) => LANDMARK_BUILDERS[kind]({ kind, params, rng: streamFrom(seed),
  variant: streamFrom(seed * 7 + 3), tier: 'desktop', groundFall, brick: false, snowCap: false, mapId: 'selftest', ground });
const pieceVertices = (parts) => frameVertices(REGIONAL_BUCKETS.flatMap((name) => parts[name] ?? []), (x, z) => [x, z]);
const disposeAll = (parts) => { for (const name of REGIONAL_BUCKETS) for (const g of parts[name] ?? []) g.dispose(); };
let authored = 0;
for (const mapId of MAP_IDS) {
  const cfg = getMapConfig(mapId), pieces = (cfg.props?.landmarks ?? []).filter((p) => LANDMARK_KINDS[p.kind]?.family === 'bridge');
  if (!pieces.length) continue;
  const field = createHeightField(1337, cfg);
  for (const placement of pieces) {
    authored++;
    // the composer's frame (compose.ts): its seat's lowest ground the base, the ground over it read in the piece's frame
    const spec = LANDMARK_KINDS[placement.kind], params = resolveLandmarkParams(placement), yaw = (placement.yawDeg ?? 0) * Math.PI / 180;
    const [hw, hl] = spec.footprint(params), [sw, sl] = spec.seat?.(params) ?? [hw, hl];
    const seat = sampleObbGround(field, placement.x, placement.z, sw, sl, yaw), c = Math.cos(yaw), s = Math.sin(yaw);
    const ground = (lx, lz) => field.getHeightAt(placement.x + lx * c + lz * s, placement.z - lx * s + lz * c) - seat.y;
    const built = build(placement.kind, params, ground, seat.spread);
    assert.ok(built.supports?.length, `${mapId} ${placement.kind}: it reports its footings`);
    const result = footingFailures(`${mapId} ${placement.name ?? placement.kind}`, built.supports, { ground, vertices: pieceVertices(built.parts), parts: built.movement });
    failures.push(...result.failures);
    report.push(`${mapId} ${placement.kind}: ${built.supports.length} supports, the shallowest ${result.worst.toFixed(2)} m under its ground`);
    disposeAll(built.parts);
  }
}
assert.ok(authored >= 1, 'the authored bridge landmarks (Polders\' lift bridge)');

// ---------------------------------------------------------------------------------------------------------- every bridge kind over a ditch
// a valley falling 6 m to its middle, a cross slope of 1 in 10, and a ditch 1.2 m wide and 3 m deep cut at a quarter of
// the span: no single depth, and no nine-point read of the footprint, stands every support in it
for (const kind of Object.keys(LANDMARK_KINDS).filter((k) => LANDMARK_KINDS[k].family === 'bridge')) {
  for (const params of kind === 'liftBridge' ? [{}, { span: 12, approach: 5.6, rise: 1.5 }] : [{}]) {
    const resolved = resolveLandmarkParams({ kind, x: 0, z: 0, params });
    const span = kind === 'baileyBridge' ? Number(resolved.bays) * 3.048 : kind === 'viaduct'
      ? Number(resolved.arches) * (Number(resolved.archSpan) + Math.max(2.4, Number(resolved.archSpan) * 0.24)) : Number(resolved.span);
    const ditchAt = span / 4;
    const ground = (lx, lz) => {
      const t = Math.min(1, Math.abs(lz) / (span / 2 + 1));
      return 6 * t * t * (3 - 2 * t) + lx * 0.1 - (Math.abs(lz - ditchAt) < 0.6 ? 3 : 0);
    };
    const built = build(kind, resolved, ground, 1.0);
    assert.ok(built.supports?.length, `${kind}: it reports its footings`);
    const label = `${kind}${params.approach ? ' (long form)' : ''} over a ditch`;
    const result = footingFailures(label, built.supports, { ground, vertices: pieceVertices(built.parts), parts: built.movement });
    failures.push(...result.failures);
    report.push(`${label}: ${built.supports.length} supports, the shallowest ${result.worst.toFixed(2)} m under its ground`);
    disposeAll(built.parts);
  }
}

if (process.env.COT_FOOTINGS_REPORT === '1' || failures.length) for (const line of report) console.log(`  ${line}`);
assert.deepEqual(failures, [], `supports standing over the ground under them:\n${failures.join('\n')}`);
console.log(`supportFootings selftest: ${decksSeen} bridge decks, ${authored} authored bridge landmark(s), every bridge kind over a ditch; every support footed through its ground OK`);
