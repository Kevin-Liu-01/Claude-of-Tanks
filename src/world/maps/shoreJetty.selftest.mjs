// Round 58 (2026-09-24): jetties at the water's edge. shoreJetty.ts plans a landing from the lake's authored contour and
// its water level — the strand march of strandWrack.ts for the water's edge and the sand's end, the planar core for
// the tip, the sheet's surface for the deck, the bed under every pile. This receipt checks that law on the production
// fields of the three sea maps at three seeds: every plan's shore end is dry, its tip over the core with a full span to
// spare, its deck a constant 0.45 m over the water surface, every station clear of roads / pads / the square and over
// ground below the deck, the gangway only where the deck stands over the sand (its foot dry) and never where the deck
// lands on the bank, the moored hull afloat over the core; a flat strand gets a gangway, a bank shore lands at grade;
// every arm of every map plans a jetty inside the kit's window; an azimuth without a strand, a core or a shelf plans
// nothing; the built kit stands where the plan says; the landing pieces draw from their own stream. Bytes are frozen by
// beachedBoat, winterLakeGeometry and riverLandings, not here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHeightField, mulberry32 } from '../terrain.ts';
import { MAP_IDS, getMapConfig } from './index.ts';
import { dressMapExtras } from './mapKits.ts';
import {
  GANGWAY_MAX_RUN_M, GANGWAY_MIN_RISE_M, GANGWAY_MIN_RUN_M, JETTY_BANK_CLEARANCE_M, JETTY_BANK_LANDING_M,
  JETTY_DECK_HALF_WIDTH_M, JETTY_DECK_THICKNESS_M, JETTY_FREEBOARD_M, JETTY_MAX_SPANS, JETTY_MIN_SPANS,
  JETTY_ROAD_CLEARANCE_M, JETTY_SPAN_M, MOORED_BOAT_DRAFT_M, landingStream, planShoreJetty,
} from './shoreJetty.ts';

const names = ['plaster', 'plaster2', 'plaster3', 'roof', 'stone', 'wood', 'dark', 'glass', 'curtain', 'straw', 'baked'];
const seaMaps = MAP_IDS.filter(id => (getMapConfig(id).terrain.lakes ?? []).some(lake => lake.shelfM !== undefined));
assert.deepEqual(seaMaps, ['coastal', 'fjord', 'saltwind'], 'the strand law reaches every authored shelf, and only those');
const near = (a, b, tol, label) => assert.ok(Math.abs(a - b) <= tol, `${label}: ${a} vs ${b}`);

/** Every rule of the law against one plan on its field. */
function auditPlan(field, lake, plan, spawns, label) {
  const level = lake.level;
  const dx = Math.cos(plan.angle), dz = Math.sin(plan.angle), ax = -dz, az = dx;
  assert.equal(field.getWaterMaskAt(plan.x, plan.z), 0, `${label}: the shore end is dry`);
  assert.ok(plan.spans >= 1 && Number.isInteger(plan.spans) && plan.length === plan.spans * JETTY_SPAN_M, `${label}: whole spans`);
  assert.ok(plan.core <= plan.edge && plan.tipR <= plan.core - JETTY_SPAN_M, `${label}: a full span over the core (tip ${plan.tipR}, core ${plan.core})`);
  near(plan.shoreR - plan.tipR, plan.length, 1e-9, `${label}: the tip is the deck's length from the shore end`);
  for (const across of [-JETTY_DECK_HALF_WIDTH_M, 0, JETTY_DECK_HALF_WIDTH_M]) {
    const tx = plan.x + dx * plan.length + ax * across, tz = plan.z + dz * plan.length + az * across;
    assert.equal(field.getWaterMaskAt(tx, tz), 1, `${label}: the full-width tip stands over visible water`);
    near(field.getHeightAt(tx, tz), level, 1e-6, `${label}: over the planar bed`);
    near(plan.surface, level + field.getWaterDepthAt(tx, tz), 1e-9, `${label}: the surface is bed + depth`);
  }
  near(plan.deckY + JETTY_DECK_THICKNESS_M / 2, plan.surface + JETTY_FREEBOARD_M, 1e-9, `${label}: deck top a constant freeboard over the water`);
  const underside = plan.deckY - JETTY_DECK_THICKNESS_M / 2, top = plan.deckY + JETTY_DECK_THICKNESS_M / 2;
  let shoreGround = -Infinity;
  for (let k = 0; k <= plan.spans; k++) for (const side of [-1, 1]) {
    const px = plan.x + dx * k * JETTY_SPAN_M + ax * side * JETTY_DECK_HALF_WIDTH_M;
    const pz = plan.z + dz * k * JETTY_SPAN_M + az * side * JETTY_DECK_HALF_WIDTH_M;
    assert.ok(Math.max(Math.abs(px), Math.abs(pz)) <= 470, `${label}: station ${k} inside the dressing square`);
    assert.ok(field._roadDist(px, pz) >= JETTY_ROAD_CLEARANCE_M, `${label}: station ${k} off the roads`);
    for (const spawn of spawns) assert.ok(Math.hypot(px - spawn.x, pz - spawn.z) >= 26, `${label}: station ${k} clear of the pads`);
    const ground = field.getHeightAt(px, pz);
    assert.ok(ground <= underside - (k === 0 ? JETTY_BANK_LANDING_M : JETTY_BANK_CLEARANCE_M), `${label}: station ${k} ground ${ground} under the deck ${underside}`);
    if (k === 0) shoreGround = Math.max(shoreGround, ground, field.getHeightAt(plan.x, plan.z));
  }
  if (plan.gangway) {
    const { run, groundY } = plan.gangway;
    assert.ok(run >= GANGWAY_MIN_RUN_M && run <= GANGWAY_MAX_RUN_M, `${label}: gangway run ${run}`);
    const fx = plan.x - dx * run, fz = plan.z - dz * run;
    near(groundY, field.getHeightAt(fx, fz), 1e-9, `${label}: the gangway's foot reads the ground`);
    // the decision reads the shore end's ground; the foot on a rising backshore may be closer to the deck top, down to 0.25 m
    assert.ok(top - shoreGround > GANGWAY_MIN_RISE_M - 1e-9 && groundY <= top - 0.25, `${label}: the gangway climbs to the deck`);
    for (const across of [-0.6, 0, 0.6]) assert.equal(field.getWaterMaskAt(fx + ax * across, fz + az * across), 0, `${label}: gangway foot dry`);
    assert.ok(field._roadDist(fx, fz) >= JETTY_ROAD_CLEARANCE_M, `${label}: gangway foot off the roads`);
  } else {
    // the planner reads the highest ground across the deck at the shore end (a bank is uneven across 1.5 m)
    assert.ok(top - shoreGround <= GANGWAY_MIN_RISE_M + 1e-9, `${label}: no gangway only where the deck lands on the bank (${top - shoreGround} m)`);
  }
  if (plan.boat) {
    const across = plan.boat.side * (JETTY_DECK_HALF_WIDTH_M + 0.35 + 0.8);
    for (const [u, v] of [[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const bx = plan.x + dx * (plan.boat.along + u * 2.9) + ax * (across + v * 0.8);
      const bz = plan.z + dz * (plan.boat.along + u * 2.9) + az * (across + v * 0.8);
      assert.equal(field.getWaterMaskAt(bx, bz), 1, `${label}: the moored hull floats over the core`);
      near(field.getHeightAt(bx, bz), level, 1e-6, `${label}: over the planar bed`);
    }
    assert.ok(plan.boat.along < plan.length && plan.boat.along > plan.length - 2 * JETTY_SPAN_M, `${label}: the hull lies alongside the outer spans`);
  }
}

// ------------------------------------------------------------------ the law on every sea map, three seeds
let plans = 0, flat = 0, bank = 0, moored = 0;
for (const seed of [1337, 2049, 7719]) for (const mapId of seaMaps) {
  const config = getMapConfig(mapId), field = createHeightField(seed, config);
  const spawns = [config.spawns.player, ...config.spawns.enemies];
  const label = `${mapId}/${seed}`;
  if (mapId === 'saltwind') {
    for (const anchor of config.props.riverLandings) {
      const lake = field._layout.lakes[anchor.lakeIndex];
      const plan = planShoreJetty(field, lake, anchor.shoreAngleDeg * Math.PI / 180, { spans: anchor.jettyLength / JETTY_SPAN_M });
      assert.ok(plan, `${label}: the authored pier at ${anchor.shoreAngleDeg}° plans`);
      assert.equal(plan.length, anchor.jettyLength, "an authored length is the pier's length");
      auditPlan(field, lake, plan, spawns, `${label} ${anchor.shoreAngleDeg}°`);
      assert.ok(plan.gangway && plan.boat, `${label}: Saltwind's flat shelf takes a gangway and moors a hull`);
      plans++; flat++; moored++;
    }
    continue;
  }
  field._layout.lakes.forEach((lake, index) => {
    if (lake.r < 110) return;
    // the kit draws π ± 0.25 rad and walks ± 0.25 rad from the draw: every arm must plan somewhere in that reach
    let planned = 0;
    for (let deg = 152; deg <= 208; deg += 2) {
      const plan = planShoreJetty(field, lake, deg * Math.PI / 180, { spawns });
      if (!plan) continue;
      planned++; plans++;
      auditPlan(field, lake, plan, spawns, `${label} lake ${index} ${deg}°`);
      assert.ok(plan.spans >= JETTY_MIN_SPANS && plan.spans <= JETTY_MAX_SPANS, 'sized within the kit');
      if (plan.gangway) flat++; else bank++;
      if (plan.boat) moored++;
    }
    assert.ok(planned >= 3, `${label} lake ${index}: the contour admits a jetty in the kit's reach (${planned} azimuths)`);
  });
}
assert.ok(flat > 0 && bank > 0 && moored > 0, `flat strands, bank shores and moored hulls all occur (${flat} / ${bank} / ${moored})`);
console.log(`shoreJetty.selftest: ${plans} plans audited over nine fields — ${flat} on flat strands with a gangway, ${bank} landing on a bank, ${moored} with a hull moored alongside`);

// ------------------------------------------------------------------ flat strand vs bank shore, sized to the shelf
{
  const coastal = getMapConfig('coastal'), field = createHeightField(1337, coastal), lake = field._layout.lakes[0];
  const plan = planShoreJetty(field, lake, Math.PI);
  assert.ok(plan.gangway, 'Saltmere: the deck stands over the flat strand at the level, so a gangway climbs to it');
  near(plan.gangway.groundY, lake.level, 0.05, 'Saltmere: the sand at the level');
  near(plan.shoreR, plan.edge + 9.5, 0.3, 'Saltmere: the shore end a metre landward of the 8.5 m wrack band');
  assert.equal(plan.spans, 9, 'Saltmere: nine spans cross the 22 m shelf and the shallows with a hull alongside');
  assert.equal(planShoreJetty(field, lake, Math.PI, { spans: 10 }).spans, 10, 'an authored length is honoured');
  assert.equal(planShoreJetty(field, lake, Math.PI, { spans: 4 }), null, 'a 7.6 m deck cannot reach the core from the dry strand');
  const fjord = getMapConfig('fjord'), ffield = createHeightField(1337, fjord), north = ffield._layout.lakes[2];
  const onBank = planShoreJetty(ffield, north, Math.PI);
  assert.ok(onBank && !onBank.gangway, 'Nordhavn north arm: the deck lands on the bank, no gangway');
  const underside = onBank.deckY - JETTY_DECK_THICKNESS_M / 2;
  const ground = ffield.getHeightAt(onBank.x, onBank.z);
  assert.ok(ground <= underside - JETTY_BANK_LANDING_M && ground >= underside - 0.6, `the bank meets the deck at the shore end (${(underside - ground).toFixed(2)} m under it)`);
  assert.ok(onBank.shoreR < onBank.edge + 4, 'the shore end stands within the strand on a bank shore');
  assert.ok(onBank.spans < plan.spans, 'a 10 m shelf takes fewer spans than a 22 m one');
}

// ------------------------------------------------------------------ refusals
{
  const coastal = getMapConfig('coastal'), field = createHeightField(1337, coastal), lake = field._layout.lakes[0];
  assert.equal(planShoreJetty({ ...field, getWaterMaskAt: () => 0 }, lake, Math.PI), null, 'no water, no strand, no jetty');
  assert.equal(planShoreJetty({ ...field, getWaterMaskAt: (x, z) => Math.min(0.5, field.getWaterMaskAt(x, z)) }, lake, Math.PI), null, 'no planar core in reach, no jetty');
  assert.equal(planShoreJetty(field, { ...lake, shelfM: undefined }, Math.PI), null, 'a lake without a shelf is not a strand');
  assert.equal(planShoreJetty(field, { ...lake, level: undefined }, Math.PI), null, 'a lake without a level has no water surface');
  assert.equal(planShoreJetty(field, lake, 0), null, 'the disc\'s far arc past the red line has no strand in the square\'s field');
  assert.equal(planShoreJetty({ ...field, _roadDist: () => 0 }, lake, Math.PI), null, 'a road across the stations refuses the jetty');
  assert.equal(planShoreJetty(field, lake, Math.PI, { spawns: [{ x: lake.x - lake.r * 0.98, z: lake.z }] }), null, 'a pad at the shore refuses it');
  for (const spans of [0, 2.5, -1, NaN]) assert.throws(() => planShoreJetty(field, lake, Math.PI, { spans }), /positive whole number/);
  assert.throws(() => planShoreJetty({ ...field, getWaterMaskAt: undefined }, lake, Math.PI), /getWaterMaskAt/, 'a missing liquid owner is an error, not a silently omitted jetty');
}

// ------------------------------------------------------------------ the built kit stands where the plan says
{
  const kits = readFileSync(new URL('./mapKits.ts', import.meta.url), 'utf8');
  assert.match(kits, /rng: Rng = landingStream\(plan\)/, 'the landing pieces draw from the landing\'s own stream');
  assert.match(kits, /for \(let i = 0; i < LEGACY_COASTAL_JETTY_DRAWS; i\+\+\) rng\(\);/, 'the coastal kit burns the retired jetty\'s draws so later dressing keeps its place');
  assert.match(kits, /const stream = landingStream\(plan\);\n  jetty\(buckets, stream,/, 'the coastal jetty\'s timber comes from the landing stream');
  assert.ok(!/buckets\.dark\.push/.test(kits.slice(kits.indexOf('function jettyMoorings'), kits.indexOf('function dressShoreLanding'))), 'the mooring lines open no new bucket');
  const a = landingStream({ x: 10, z: -20, spans: 7 }), b = landingStream({ x: 10, z: -20, spans: 7 }), c = landingStream({ x: 10, z: -20, spans: 8 });
  const seqA = [a(), a(), a()], seqB = [b(), b(), b()], seqC = [c(), c(), c()];
  assert.deepEqual(seqA, seqB, 'the stream is keyed by the plan'); assert.notDeepEqual(seqA, seqC, 'and differs between landings');
  for (const mapId of seaMaps) {
    const config = getMapConfig(mapId), field = createHeightField(1337, config);
    const buckets = Object.fromEntries(names.map(name => [name, []])), receipts = [];
    dressMapExtras({ mapId, extraKits: config.props.extraKits, riverLandings: config.props.riverLandings,
      L: field._layout, heightField: field, rng: mulberry32(1337 ^ 0x5a17), buckets, groundingReceipts: receipts });
    const piles = receipts.filter(r => r.kind === 'jetty-pile'), hulls = receipts.filter(r => r.kind === 'moored-boat');
    const gangways = receipts.filter(r => r.kind === 'jetty-gangway');
    const jetties = mapId === 'coastal' ? 1 : mapId === 'saltwind' ? 2 : 3;
    assert.ok(hulls.length === jetties, `${mapId}: every jetty moors a hull (${hulls.length} of ${jetties})`);
    assert.ok(piles.length >= jetties * 2 * (JETTY_MIN_SPANS + 1), `${mapId}: planted piles on every jetty`);
    for (const pile of piles) near(pile.y, field.getHeightAt(pile.x, pile.z) - 0.10, 1e-9, `${mapId}: a pile planted into its bed`);
    for (const hull of hulls) {
      assert.equal(field.getWaterMaskAt(hull.x, hull.z), 1, `${mapId}: the hull floats over water`);
      near(hull.baseClearance, -MOORED_BOAT_DRAFT_M, 1e-9, `${mapId}: at its draft`);
      near(hull.y, field.getHeightAt(hull.x, hull.z) + field.getWaterDepthAt(hull.x, hull.z) - MOORED_BOAT_DRAFT_M, 1e-9, `${mapId}: keel under the surface`);
    }
    for (const g of gangways) {
      assert.equal(field.getWaterMaskAt(g.x, g.z), 0, `${mapId}: gangway foot on dry sand`);
      assert.equal(g.baseClearance, -0.01);
    }
    if (mapId === 'coastal') assert.equal(gangways.length, 1, 'Saltmere: one gangway on the flat strand');
    if (mapId === 'saltwind') assert.equal(gangways.length, 2, 'Saltwind: a gangway on each pier');
    // every pile's top meets the deck (the emitted geometry, not only the receipt): the wood pieces whose top is a
    // deck top are at least the piles
    const tops = new Map();
    for (const g of buckets.wood) { g.computeBoundingBox(); const key = g.boundingBox.max.y.toFixed(4); tops.set(key, (tops.get(key) ?? 0) + 1); }
    for (const hull of hulls) {
      const deckTop = (field.getHeightAt(hull.x, hull.z) + field.getWaterDepthAt(hull.x, hull.z) + JETTY_FREEBOARD_M).toFixed(4);
      assert.ok((tops.get(deckTop) ?? 0) >= 2 * (JETTY_MIN_SPANS + 1) + JETTY_MIN_SPANS, `${mapId}: piles and deck segments meet at the deck top ${deckTop}`);
    }
    for (const geometries of Object.values(buckets)) for (const g of geometries) g.dispose();
  }
}
console.log('shoreJetty.selftest: flat/bank cases, refusals, the kit\'s planted piles, hulls and gangways checked on the three sea maps');

// Round 67 (2026-09-24): the moored hull's render-side animation. With an `animated` sink the kit hands each moored
// hull's pieces (the same geometry objects the wood bucket holds) to the renderer with the mooring point, the yaw
// and a phase; without the sink the wood bucket is byte-identical, so every receipt that freezes the kit is untouched.
{
  const { createHash } = await import('node:crypto');
  const digest = (geometries) => {
    const hash = createHash('sha256');
    for (const g of geometries) for (const key of Object.keys(g.attributes).sort()) {
      const a = g.attributes[key].array; hash.update(key).update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
    return hash.digest('hex');
  };
  let hulls = 0;
  for (const mapId of seaMaps) {
    const config = getMapConfig(mapId), field = createHeightField(1337, config);
    const build = (animated) => {
      const buckets = Object.fromEntries(names.map(name => [name, []])), receipts = [];
      dressMapExtras({ mapId, extraKits: config.props.extraKits, riverLandings: config.props.riverLandings, L: field._layout,
        heightField: field, rng: mulberry32(1337 ^ 0x5a17), buckets, groundingReceipts: receipts, ...(animated ? { animated } : {}) });
      return { buckets, receipts };
    };
    const animated = [];
    const withSink = build(animated), without = build(null);
    assert.equal(digest(withSink.buckets.wood), digest(without.buckets.wood), `${mapId}: the wood bucket is byte-identical with and without the sink`);
    assert.deepEqual(withSink.receipts, without.receipts);
    const moored = withSink.receipts.filter(r => r.kind === 'moored-boat');
    assert.equal(animated.length, moored.length, `${mapId}: one animated record per moored hull`);
    animated.forEach((record, i) => {
      assert.equal(record.kind, 'moored-hull'); assert.equal(record.bucket, 'wood');
      assert.equal(record.x, moored[i].x); assert.equal(record.z, moored[i].z); assert.equal(record.y, moored[i].y, 'the pivot is the keel line at the mooring point');
      assert.ok(record.phase >= 0 && record.phase < Math.PI * 2 && Number.isFinite(record.yaw));
      assert.ok(record.geometries.length === 10 || record.geometries.length === 12, `${record.geometries.length} pieces: the clinker hull, with or without its mast and boom`);
      for (const g of record.geometries) assert.ok(withSink.buckets.wood.includes(g), 'the very geometry the wood bucket holds');
      // every piece lies within a hull's length of the pivot
      for (const g of record.geometries) { g.computeBoundingBox(); const c = g.boundingBox.getCenter(new (Object.getPrototypeOf(g.boundingBox.min).constructor)()); assert.ok(Math.hypot(c.x - record.x, c.z - record.z) < 4, 'about the mooring point'); }
      hulls++;
    });
    for (const list of Object.values(withSink.buckets)) for (const g of list) g.dispose();
    for (const list of Object.values(without.buckets)) for (const g of list) g.dispose();
  }
  assert.ok(hulls >= 5, `moored hulls across the sea maps (${hulls})`);
  console.log(`shoreJetty.selftest: ${hulls} moored hulls handed to the animated sink, the wood bucket byte-identical without it`);
}
