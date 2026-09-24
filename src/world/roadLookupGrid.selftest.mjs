import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { beforeRoadCompletionConstructor } from '../../tools/road-constructor-history-fixture.mjs';

// Exact private declarations from origin/main at 5b322420483210485dc802bf3f40af0f250ca59e.
// Only the construction lookup algorithm is replaced; every map, elevation,
// query and retained grid stays on current main. CI requires no Git history.
const legacyLookup = `function buildRoadLookupGrid(): void {
    for (let gz = 0; gz < GN; gz++) {
      const z = gz * CELL - HALF;
      for (let gx = 0; gx < GN; gx++) {
        const x = gx * CELL - HALF;
        const i = gz * GN + gx;
        for (let r = 0; r < roads.length; r++) {
          const nodes = roads[r];
          for (let s = 0; s < nodes.length - 1; s++) {
            const { d, t } = segDist(x, z, nodes[s][0], nodes[s][1], nodes[s + 1][0], nodes[s + 1][1]);
            if (d < gRoadDist[i]) { gRoadDist[i] = d; gSegRoad[i] = r; gSegIdx[i] = s; gSegT[i] = t; }
          }
        }
        let cw = 0;
        for (const c of corridors) {
          const { d } = segDist(x, z, c[0], c[1], c[2], c[3]);
          cw = Math.max(cw, 1 - smoothstep(8, 30, d));
        }
        gCorridor[i] = cw;
      }
    }
  }`;
const legacyDistance = `function segDist(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { d: number; t: number } {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  const ex = ax + dx * t - px, ez = az + dz * t - pz;
  return { d: Math.sqrt(ex * ex + ez * ez), t };
}`;
const sha = value => createHash('sha256').update(value).digest('hex');
assert.equal(sha(legacyLookup), 'fcfd54a5b81ff74cf7fc31c445a13f2984b05119dd3366a8db970adc227e85a2');
assert.equal(sha(legacyDistance), '74a5e3afbeb8fb5b0dda372e4cb9bce2ec3b377ccf5b4ceb87223d141fa2b9f8');
const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
function declaration(text, name) {
  const ast = ts.createSourceFile('terrain.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const matches = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(matches.length, 1, `unique actual declaration: ${name}`);
  return matches[0];
}
const lookup = declaration(source, 'buildRoadLookupGrid').getText();
const segment = declaration(source, 'stampRoadLookupSegment').getText();
const support = ['clamp', 'smoothstep', 'segDist'].map(name => declaration(source, name).getText()).join('\n');
// Reconstruct the complete unsliced constructor at 3c2abead2. The later
// d948cb573 relief phase and d23529c05 Redrock contribution are explicitly
// projected out of this HISTORICAL source hash only. The actual current
// optimized/legacy lookup comparisons below retain both terrain additions.
// Their own playableRelief/badlandsRelief checks certify the changed terrain.
// No old golden or arbitrary source region is replaced.
function historicalHeightFieldSource(text) {
  text = beforeRoadCompletionConstructor(text);
  for (const [current, historical] of [
    // Round 36 (2026-09-22): the outland height sampler (the same composition past the square, for the horizon ring's
    // near rows) is a declared addition — projected out of the HISTORICAL hash only; playable heights are untouched.
    // Round 47 + follow-up (2026-09-23): the sampler now composes the shore rings' liquid surfaces, the coast rim fade
    // (coastRimKeep) and the lake banks; the whole declared region (comments, coastRimKeep, outlandHeightAt and its
    // scratch result) is still one addition outside heightAt.
    [`  // Round 36 (owner 2026-09-21, "it looked like a completely new geography"): the same composition as heightAt for a
  // point OUTSIDE the square — the hill noise at full weight (no corridor pull), the map's macro landforms and the rim
  // lift, which is 1 beyond the edge — without roads, corridors, villages, lakes, pads or the tactical micro-terrain.
  // The horizon ring's near rows seat on this so the border is a rule, not a change of geology. Pure function of
  // (x, z): no grid, no clamp, no allocation.
  // Round 47 follow-up (2026-09-23): a headland beside a bay rose to the full border rim within 82 m of the water (a
  // 26–42 m block against a -4…-8 m sheet). Within \`coastRimFadeM\` of a bay's shoreline the rim lift fades in, so a
  // headland climbs away from the strand instead of standing on it. Pure function of (x, z); off unless the map authors it.
  function coastRimKeep(x: number, z: number): number {
    const coastRimFadeM = T.coastRimFadeM ?? 0;
    if (coastRimFadeM <= 0) return 1;
    let keep = 1;
    for (let li = 0; li < _LAKES.length; li++) {
      const lake = _LAKES[li];
      const dx = x - lake.x, dz = z - lake.z;
      const outside = Math.hypot(dx, dz) - shorelineRadiusAt(lake, Math.atan2(dz, dx)) * 0.96;
      keep = Math.min(keep, smoothstep(0, coastRimFadeM, outside));
    }
    return keep;
  }
  function outlandHeightAt(x: number, z: number): number {
    // Round 47 follow-up (2026-09-23): the composition heightAt applies inside the square continues past the red line —
    // the shore rings' liquid surfaces (their dip, their bank pull, their flat core), the border rim gated by that water
    // weight, then the bay banks with the SAME per-lake band the square uses (authored or fitted — a narrower band
    // out here left Saltwind's headlands standing as slabs on the line). Without it a shore ring flattened the square
    // to the sea level while the ring's first outer row stood at the geology's full height: a 25 m step on the red
    // line north of Saltmere's bay, the "28 m block" of round 47. Roads, pads and the micro relief stay inside.
    let liquidDip = 0, marshW = 0, waterWeight = 0, waterLevelSum = 0, waterWeightSum = 0, waterCoreSum = 0, waterCoreCount = 0;
    if (liquidSurfaces) for (let mi = 0; mi < _MARSHES.length; mi++) {
      const m = _MARSHES[mi], surfaceOffset = mi * LIQUID_MARSH_STRIDE, bankBand = liquidSurfaces[surfaceOffset + 3];
      const md = shorelineDistance(m, x, z, bankBand);
      if (md < 1) { const t = 1 - md; liquidDip += m.dip * t * t * (3 - 2 * t); marshW = Math.max(marshW, t); }
      if (md < bankBand) {
        const weight = smoothstep(bankBand, LIQUID_MARSH_CORE, md);
        const level = liquidSurfaces[surfaceOffset] + liquidSurfaces[surfaceOffset + 1] * x + liquidSurfaces[surfaceOffset + 2] * z;
        waterWeight = Math.max(waterWeight, weight);
        const priority = weight / Math.max(1e-9, 1 - weight);
        waterWeightSum += priority; waterLevelSum += level * priority;
        if (md <= LIQUID_MARSH_CORE) { waterCoreSum += level; waterCoreCount++; }
      }
    }
    let h: number;
    if (waterCoreCount) h = waterCoreSum / waterCoreCount;
    else {
      h = baseTerrainHeight(x, z, 0, 0) - liquidDip;
      h = applyMacroTerrain(x, z, h, 0, 0, marshW);
      const borderRadius = Math.max(Math.abs(x), Math.abs(z));
      const rim = smoothstep(430, HALF, borderRadius);
      // round 47 (2026-09-23): the border rim yields to the water so a shore continues past the square instead of a wall
      h += rim * rim * T.rimH * (1 - waterWeight) * (rim > 0 ? coastRimKeep(x, z) : 1);
      if (waterWeight > 0) h += (waterLevelSum / waterWeightSum - h) * waterWeight;
    }
    if (liquidLakeBanks !== null) {
      composeLakeHeight(_LAKES, lakeLevels, liquidLakeBanks, continuousLakeAprons, x, z, h, 0, outlandLakeHeight);
      h = outlandLakeHeight.height;
    }
    return h;
  }
  const outlandLakeHeight: LakeHeightResult = { height: 0, wetness: 0 };

`, ''],
    ['    getOutlandHeightAt: outlandHeightAt,\n', ''],
    // Round 47 (2026-09-23, shorelines): the bay contour query the ring, the material bake and the sheet apron read is a
    // declared addition beside the wetness sampler — projected out of the HISTORICAL hash only.
    [`  /** Round 47: the bay contour and its water level at any point (the ring, the material bake and the apron read it). */
  function outlandWaterAt(x: number, z: number): { wetness: number; level: number } | null {
    let best = 0, level = 0;
    for (let li = 0; li < _LAKES.length; li++) {
      const wetness = shorelineWetness(_LAKES[li], x, z, true);
      if (wetness > best) { best = wetness; level = lakeLevels[li]; }
    }
    return best > 0 ? { wetness: best, level } : null;
  }

`, ''],
    ["  const redrockCanyon = cfg?.id === 'badlands' && T.redrockCanyon === true;\n", ''],
    ["  let landformPhase: 'legacy-support' | 'authored-relief' = 'legacy-support';\n", ''],
    [`    // Unlike the held decorative relief pilot, these are the actual support
    // heights from the first construction sample onward. Roads and pads below
    // therefore conform to the canyon instead of retaining obsolete mesa levels.
    if (redrockCanyon) h += sampleRedrockCanyon(x, z);
`, ''],
    ['sampleLandformHeight(form, x, z, landformPhase)', 'sampleLandformHeight(form, x, z)'],
    [`  // Explicit second phase: all legacy support targets above are frozen.
  // Exact mesh/physics and the existing one-metre live cache share this surface.
  landformPhase = 'authored-relief';
`, ''],
    // Frontline Assault 2026-09-13 (546a5f5e5): the assault-trenches world variant adds a
    // lazily resolved trench plan, a carve after the height constraints, and the plan on
    // the returned field. All three are construction-only additions projected out of this
    // HISTORICAL hash; assaultTrenchTerrain.selftest certifies the carve itself and that the
    // standard field stays byte-identical.
    [`  // Frontline Assault 2026-09-13: the assault-trenches world variant carves
  // three fire trenches and a communication trench along the alpha→bravo
  // axis into the height field itself, so terrain, collision, grass and
  // props all follow the cut. The standard field is byte-identical.
  // Resolved on first height query (every construction constant exists by
  // then): a fire trench whose centre falls inside the settlement is dropped
  // rather than half-carved under the houses; the sector marker still stands.
  let _trenchPlan: AssaultTrenchPlan | null | undefined;
  const trenchPlan = (): AssaultTrenchPlan | null => {
    if (_trenchPlan !== undefined) return _trenchPlan;
    if (!cfg?.assaultTrenches) return (_trenchPlan = null);
    const { alpha, bravo } = assaultTeamCenters({ x: _SPAWN_PLAYER.x, z: _SPAWN_PLAYER.z },
      _SPAWN_ENEMIES.map((point) => ({ x: point.x, z: point.z })));
    const planned = planAssaultTrenchLines(alpha, bravo);
    const kept = planned.lines.map((line) => villageMask(line.x, line.z) < 0.4);
    const lines = planned.lines.filter((_line, index) => kept[index]);
    // Sector list stays index-aligned with the fractions: a dropped (settlement) sector reads
    // null so the mode falls back to its own axis fraction instead of the next line's centre.
    const sectors = planned.lines.map((line, index) => (kept[index] ? { x: line.x, z: line.z } : null));
    _trenchPlan = lines.length ? { lines, connector: planned.connector, sectors } : null;
    return _trenchPlan;
  };
`, ''],
    [`    // Frontline Assault trenches: carved after every road, pad and lake
    // constraint so the cut survives road grading (a road meets a real ditch),
    // never into water or under the settlement.
    const trenches = trenchPlan();
    if (trenches) {
      const carve = assaultTrenchCarveDepth(x, z, trenches);
      if (carve > 0) h -= carve * (1 - vm) * (1 - marshW);
    }
`, ''],
    [`    // Frontline Assault trenches (assault-trenches variant), null on the standard field.
    assaultTrenchLines: trenchPlan(),
`, ''],
    // 2026-09-17 field trenches on every standard map: the plan, its carve and the field entry are later deltas
    [`  // owner 2026-09-17 ("more trenches … on ALL maps, extra in Frontline Assault"): every field carries short
  // fire trenches — two per side of the axis at 30 % and 70 % of the way to the enemy — unless the map opts
  // out (\`fieldTrenches: false\`). A line is dropped where the settlement, a road (< 26 m at any of five
  // stations — clear of the graded shoulder as well as the pavement), the map edge or an assault sector line
  // would cross it. Resolved on the first FINAL height query (roads and pads on): raw authoring queries — road
  // node grades, pad seats, lake levels, marsh inputs — read the untrenched ground, so the plan never feeds back
  // into the roads it keeps clear of and a completed-roads variant authors the same raw inputs.
  const FIELD_TRENCH_ROAD_BERTH_M = 26;
  let _fieldPlan: AssaultTrenchPlan | null | undefined;
  const fieldTrenchPlan = (): AssaultTrenchPlan | null => {
    if (_fieldPlan !== undefined) return _fieldPlan;
    if (cfg?.fieldTrenches === false) return (_fieldPlan = null);
    // The marsh bank widths come from the liquid surfaces, which the dry construction pass has not built
    // yet: a plan drawn during that pass is provisional (bank band 1) and only the plan drawn once the
    // surfaces exist is cached — the final heights, the props and the receipts all read that one.
    // Round 59 (2026-09-24, performance audit): only a liquid-water map ever builds those surfaces. A map
    // whose marshes are dry (Tarkhan Steppe's takyr crusts, round 48) never does, so its plan stayed
    // provisional for the world's whole life and every height query with roads and pads on re-planned the
    // trenches (lines × five samples × every marsh's shoreline distance): 11.8 µs per sample against
    // 1.0 µs at deploy 66, a 9.9 s world build. The bank-band-1 plan IS a dry map's final plan (nothing
    // later changes it), so it is cached like every other map's — byte-identical heights and plan.
    const provisional = liquidWater && !liquidSurfaces && _MARSHES.length > 0;
    const { alpha, bravo } = assaultTeamCenters({ x: _SPAWN_PLAYER.x, z: _SPAWN_PLAYER.z },
      _SPAWN_ENEMIES.map((point) => ({ x: point.x, z: point.z })));
    const sectors = trenchPlan();
    // the carve is damped by the settlement and marsh weights heightAt applies; a station under 75 % dry
    // would leave a shallow ditch instead of a trench, so the line is dropped (same marsh/bank law as heightAt)
    const dryFactor = (x: number, z: number): number => {
      let marshW = 0;
      for (let mi = 0; mi < _MARSHES.length; mi++) {
        const bankBand = liquidSurfaces ? liquidSurfaces[mi * LIQUID_MARSH_STRIDE + 3] : 1;
        const md = shorelineDistance(_MARSHES[mi], x, z, bankBand);
        if (md < 1) marshW = Math.max(marshW, 1 - md);
        if (liquidSurfaces && md < bankBand) marshW = Math.max(marshW, smoothstep(bankBand, LIQUID_MARSH_CORE, md));
      }
      return (1 - villageMask(x, z)) * (1 - marshW);
    };
    const lines = planFieldTrenchLines(alpha, bravo).lines.filter((line) => {
      for (let k = -2; k <= 2; k++) {
        const s = (k / 2) * line.halfLengthM;
        const px = line.x + line.lx * s, pz = line.z + line.lz * s;
        if (Math.max(Math.abs(px), Math.abs(pz)) > 455) return false;
        if (villageMask(px, pz) >= 0.4) return false;
        if (gridSample(gRoadDist, px, pz) < FIELD_TRENCH_ROAD_BERTH_M) return false;
        // wet ground never takes a trench (the carve fades to nothing in marsh and water anyway):
        // the same wetness law the splat mask and the wakes read, plus a dry berth around every sheet
        if (waterWetnessAt(px, pz) > 0.02) return false;
        if (dryFactor(px, pz) < 0.75) return false;
        if (_LAKES.some((lake) => shorelineDistance(lake, px, pz, 1.25) < 1.25)) return false;
        if (_MARSHES.some((marsh) => shorelineDistance(marsh, px, pz, 1.25) < 1.25)) return false;
      }
      return !sectors || !sectors.lines.some((sector) =>
        Math.hypot(sector.x - line.x, sector.z - line.z) < sector.halfLengthM + line.halfLengthM + 10);
    });
    const plan = lines.length ? { lines, connector: null, profile: FIELD_TRENCH.profile } : null;
    if (!provisional) _fieldPlan = plan;
    return plan;
  };
`, ''],
    [`    // field trenches (2026-09-17) are dug after the roads and pads exist: only final queries see the carve
    if (roadsOn && padsOn) {
      const fieldTrenches = fieldTrenchPlan();
      if (fieldTrenches) {
        const carve = assaultTrenchCarveDepth(x, z, fieldTrenches);
        if (carve > 0) h -= carve * (1 - vm) * (1 - marshW);
      }
    }
`, ''],
    [`    // Field trenches on every standard field (2026-09-17), also on the assault variant clear of its sector lines.
    fieldTrenchLines: fieldTrenchPlan(),
`, ''],
    // Round 57 (2026-09-24): the authored rail spur's berth joins the vegetation/prop exclusion (railSpurs.ts) — a
    // declared addition projected out of the HISTORICAL hash only; heights are untouched (railSpurs.selftest
    // certifies the berth and the track the kit lays on it).
    [`  const railSpurNoVeg = createRailSpurExclusion(T.railSpurs); // round 57: the spur's berth joins noVeg below
`, ''],
    [`    if (railSpurNoVeg !== null && railSpurNoVeg(x, z)) return true; // round 57: the rail spur's berth
`, ''],
    // Round 61 (2026-09-24, Amberford's bridge over the river): a marsh station authored crossing: 'bridge' resolves a
    // level deck plane (the deck state and its terms, the resolution after the liquid fit, the ground type and the
    // published planes below); the road-plane blend it exempts is a fixture slice (road-constructor-history-fixture)
    // and the dry-band line is restored here. All declared additions projected out of the HISTORICAL hash only —
    // heights on every map without a bridge station are untouched (the resolution finds none).
    [`  // Round 61 (2026-09-24): the bridge decks, resolved after the road plane and the liquid surfaces are frozen (below);
  // every construction query before that sees none, so the road grid, the pads and the liquid fit are untouched.
  let bridgeDecks: readonly BridgeDeckPlane[] = EMPTY_BRIDGE_DECKS;
  const _bridgeTerms = { span: 0, approach: 0, deckY: 0 };
  /**
   * The bridge terms at a point, allocation-free: \`span\` is 1 under the deck and falls to 0 through the abutment (the
   * road plane and the dry band are exempted by it), \`approach\` is 1 at the abutment face and falls to 0 at the end of
   * the approach (the road plane grades toward \`deckY\` by it); both are 0 off every deck's corridor.
   */
  function bridgeTermsAt(x: number, z: number): typeof _bridgeTerms {
    const out = _bridgeTerms;
    out.span = 0; out.approach = 0; out.deckY = 0;
    for (let i = 0; i < bridgeDecks.length; i++) {
      const deck = bridgeDecks[i];
      const dx = x - deck.x, dz = z - deck.z;
      const along = Math.abs(dx * deck.ux + dz * deck.uz);
      if (along >= deck.halfLength + deck.approachM) continue;
      if (Math.abs(dx * deck.uz - dz * deck.ux) > BRIDGE_CORRIDOR_HALF_WIDTH_M) continue;
      out.deckY = deck.deckY;
      if (along < deck.halfLength) {
        out.span = 1 - smoothstep(deck.halfLength - BRIDGE_ABUTMENT_M, deck.halfLength, along);
        out.approach = 1;
      } else out.approach = 1 - smoothstep(deck.halfLength, deck.halfLength + deck.approachM, along);
      return out;
    }
    return out;
  }
  /** The deck standing over (x, z) — inside the span and between the parapets — or null. */
  function bridgeDeckOver(x: number, z: number): BridgeDeckPlane | null {
    for (let i = 0; i < bridgeDecks.length; i++) {
      const deck = bridgeDecks[i];
      const dx = x - deck.x, dz = z - deck.z;
      if (Math.abs(dx * deck.ux + dz * deck.uz) <= deck.halfLength
        && Math.abs(dx * deck.uz - dz * deck.ux) <= deck.halfWidth) return deck;
    }
    return null;
  }
`, ''],
    [`  // Round 61 (2026-09-24, Amberford's bridge over the river): a marsh station authored \`crossing: 'bridge'\` carries
  // its road over the water on a deck instead of through the 14–18 m dry band. Resolved once the road plane and the
  // liquid surfaces are frozen: the deck centre is the road's nearest point to the station and its axis the road
  // bearing there; the span is the river's own wet reach along that axis (the liquid union before the dry band, marched
  // at 0.25 m) plus an abutment at each end; the plane is the road plane lifted clear of the water surface by the
  // authored clearance. Under the span heightAt keeps the river bed and waterWetnessAt keeps the river (bridgeTermsAt);
  // over each approach the road plane grades to the deck at no more than 7 % (the same length on both sides: the
  // steeper side's). A station without a road inside its radius is an authoring error and fails here rather than
  // silently drying a crossing.
  function resolveBridgeDecks(): readonly BridgeDeckPlane[] {
    const decks: BridgeDeckPlane[] = [];
    for (const station of _MARSHES) {
      if (station.crossing !== 'bridge') continue;
      let best = Infinity, cx = station.x, cz = station.z, ux = 1, uz = 0, route = -1;
      for (let r = 0; r < roads.length; r++) {
        const nodes = roads[r];
        for (let s = 0; s < nodes.length - 1; s++) {
          const { d, t } = segDist(station.x, station.z, nodes[s][0], nodes[s][1], nodes[s + 1][0], nodes[s + 1][1]);
          if (d >= best) continue;
          const dx = nodes[s + 1][0] - nodes[s][0], dz = nodes[s + 1][1] - nodes[s][1];
          const length = Math.hypot(dx, dz);
          if (length <= 0) continue;
          best = d; route = r; ux = dx / length; uz = dz / length;
          cx = nodes[s][0] + dx * t; cz = nodes[s][1] + dz * t;
        }
      }
      if (best > station.r) throw new Error(\`bridge station at \${station.x},\${station.z} has no road inside its radius\`);
      let reach = 0;
      for (const sign of [-1, 1]) {
        for (let along = 0; along <= station.r * 2; along += 0.25) {
          if (sampleShorelineMask(_MARSHES, _LAKES, cx + ux * along * sign, cz + uz * along * sign) > waterRampStart) {
            reach = Math.max(reach, along);
          }
        }
      }
      const halfLength = reach + BRIDGE_ABUTMENT_M;
      const bedY = heightAt(cx, cz, false, false);
      const waterY = bedY + liquidDepthM;
      const deckY = Math.max(gridSample(gRoadElev, cx, cz), waterY + (station.deckClearM ?? BRIDGE_DECK_CLEAR_M));
      let approachM = BRIDGE_APPROACH_MIN_M;
      for (const sign of [-1, 1]) {
        const rise = Math.abs(deckY - gridSample(gRoadElev, cx + ux * halfLength * sign, cz + uz * halfLength * sign));
        approachM = Math.max(approachM, Math.min(BRIDGE_APPROACH_MAX_M, rise / BRIDGE_APPROACH_GRADE));
      }
      decks.push({
        x: cx, z: cz, ux, uz, route, halfLength,
        halfWidth: (station.deckWidthM ?? BRIDGE_DECK_WIDTH_M) / 2,
        deckY, bedY, waterY,
        approachM: station.approachM ?? approachM,
      });
    }
    return decks.length ? Object.freeze(decks) : EMPTY_BRIDGE_DECKS;
  }
  if (liquidWater && liquidSurfaces) bridgeDecks = resolveBridgeDecks();

`, ''],
    [`    if (bridgeDecks.length && bridgeDeckOver(x, z) !== null) return 'hard'; // round 61: stone across the whole deck
`, ''],
    [`    // round 61: under a bridge deck the river keeps its wetness — the deck, not a causeway, carries the road
    const roadDry = smoothstep(14, 18, gridSample(gRoadDist, x, z));
    wetness *= bridgeDecks.length ? roadDry + (1 - roadDry) * bridgeTermsAt(x, z).span : roadDry;
`, `    wetness *= smoothstep(14, 18, gridSample(gRoadDist, x, z));
`],
    [`    bridgeDecks, // round 61
`, ''],
  ]) {
    assert.equal(text.split(current).length, 2, 'each declared historical delta occurs exactly once');
    text = text.replace(current, historical);
  }
  return text;
}
const originalHeightField = historicalHeightFieldSource(declaration(source, 'heightFieldBuildSteps').getText())
  .replace('function* heightFieldBuildSteps(', 'export function createHeightField(')
  .replace('): Generator<number, HeightField, void> {', '): HeightField {')
  .replace(/  \/\/ Count completed segments, corridor rows, support setup and range rows;\n  \/\/ this is construction progress, not elapsed-time or work-cost prediction\.\n  const totalHeightSlices = roads\.reduce\(\(sum, nodes\) => sum \+ Math\.max\(0, nodes\.length - 1\), 0\)\n    \+ GN \+ 1 \+ 129;\n  let completedHeightSlices = 0;\n/, '')
  .replace('function* buildRoadLookupGrid(): Generator<number, void, void>', 'function buildRoadLookupGrid(): void')
  .replace(/^ *yield \+\+completedHeightSlices \/ totalHeightSlices;\n/gm, '')
  .replace('yield* buildRoadLookupGrid();', 'buildRoadLookupGrid();')
  .replace('function* measureHeightRange(): Generator<number, [number, number], void>', 'function measureHeightRange(): [number, number]')
  .replace(`    for (let gz = 0; gz <= 128; gz++) {
      for (let gx = 0; gx <= 128; gx++) {
        const h = getHeightAt(gx * 8 - HALF, gz * 8 - HALF);
        if (h < minY) minY = h;
        if (h > maxY) maxY = h;
      }
    }`, `    for (let gz = 0; gz <= 128; gz++) for (let gx = 0; gx <= 128; gx++) {
      const h = getHeightAt(gx * 8 - HALF, gz * 8 - HALF);
      if (h < minY) minY = h;
      if (h > maxY) maxY = h;
    }`)
  .replace('const [minY, maxY] = yield* measureHeightRange();', 'const [minY, maxY] = measureHeightRange();');
assert.equal(sha(originalHeightField + '\n'),
  '0767b9f0a0ceeb827665c61a57ec6313a939ad875fea7e7ff2d8fb104fc8bc36');
assert.throws(() => historicalHeightFieldSource(declaration(source, 'heightFieldBuildSteps').getText()
  .replace('sampleRedrockCanyon(x, z)', 'sampleRedrockCanyon(x, z) * 2')),
'an undeclared terrain contribution cannot disappear in historical projection');
for (const name of ['stampRoadLookupSegment', 'buildRoadLookupGrid']) {
  function inspect(node) {
    assert.ok(!ts.isNewExpression(node) && !ts.isArrayLiteralExpression(node)
      && !ts.isObjectLiteralExpression(node), `${name}: no added construction arrays/objects`);
    ts.forEachChild(node, inspect);
  }
  inspect(declaration(source, name).body);
}
function compileLookup(body, distance = support) {
  // Only repository-owned, AST-selected declarations and the literal above;
  // no CLI, downloaded, user or rendered input enters this evaluation.
  return new Function('fixture', stripTypeScriptTypes(`
    const { GN, CELL, HALF, roads, corridors, gRoadDist, gSegRoad, gSegIdx, gSegT, gCorridor } = fixture;
    let completedHeightSlices = 0;
    const totalHeightSlices = 1;
    ${distance}\n${body}
    const steps = buildRoadLookupGrid();
    if (steps) for (const _ of steps) { /* execute every current-generator write */ }`));
}
const current = compileLookup(`${segment}\n${lookup}`);
const previous = compileLookup(legacyLookup,
  `${declaration(source, 'clamp').getText()}\n${declaration(source, 'smoothstep').getText()}\n${legacyDistance}`);
function fixture(roads, Distance = Float32Array) {
  return { GN: 9, CELL: 8, HALF: 32, roads,
    corridors: [[-32, -32, 32, 32], [32, -32, -32, 32]],
    gRoadDist: new Distance(81).fill(1e9), gSegRoad: new Int16Array(81),
    gSegIdx: new Int16Array(81), gSegT: new Float32Array(81), gCorridor: new Float32Array(81) };
}
const names = ['gRoadDist', 'gSegRoad', 'gSegIdx', 'gSegT', 'gCorridor'];
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
function exactFixture(factory, roads) {
  const before = JSON.stringify(roads), expected = fixture(roads), actual = fixture(roads);
  previous(expected); factory(actual);
  for (const name of names) assert.deepEqual(bytes(actual[name]), bytes(expected[name]), `exact ${name}`);
  assert.equal(JSON.stringify(roads), before, 'input coordinates/order remain unchanged');
  return actual;
}
const tie = [[[-32, 0], [32, 0]], [[-32, 0], [32, 0]]];
const zero = [[[0, 0], [0, 0]], [[-32, 24], [32, 24]]];
const first = 1 + 2 ** -24 + 2 ** -40, second = 1 + 2 ** -23 - 2 ** -40;
const rounded = [[[-32, first], [32, first]], [[-32, second], [32, second]]];
for (const roads of [tie, zero, rounded,
  [[[-32, -32], [0, 0], [0, 0], [32, 16]], [[32, -32], [-32, 32]]],
  [[[32, 32], [-32, -32]], [[-31.3, 4.7], [29.9, -8.1], [7.4, 31.2]]]]) exactFixture(current, roads);
assert.equal(exactFixture(current, tie).gSegRoad[40], 0, 'equal-distance winner remains first route');
assert.equal(exactFixture(current, zero).gSegT[40], 0, 'zero-length segment keeps t=0');
assert.equal(exactFixture(current, rounded).gSegRoad[40], 1,
  'a slightly farther distance still wins against the prior rounded-up Float32 value');
const promoted = fixture(rounded, Float64Array); current(promoted);
assert.equal(promoted.gSegRoad[40], 0, 'Float64 nearest storage is a real ownership-changing negative');
function replaceOnce(text, before, after) {
  assert.equal(text.split(before).length - 1, 1, `unique mutation/tap: ${before}`);
  return text.replace(before, after);
}
assert.throws(() => exactFixture(compileLookup(`${replaceOnce(segment,
  'd < gRoadDist[i]', 'd <= gRoadDist[i]')}\n${lookup}`), tie), /exact gSegRoad/);
assert.throws(() => exactFixture(compileLookup(`${replaceOnce(segment,
  '/ l2 : 0;', '/ l2 : 0.5;')}\n${lookup}`), zero), /exact gSegT/);
assert.throws(() => exactFixture(compileLookup(`${segment}\n${replaceOnce(lookup,
  'gCorridor[i] = cw;', 'gCorridor[i] = 0;')}`), tie), /exact gCorridor/);

// Two test-only module projections tap actual complete constructors. One
// substitutes only the immutable original-main lookup and distance declarations;
// road layouts, hardstands, liquids and queries remain the same on both sides.
// Taps retain scalar digests, not grids.
async function constructor(legacy) {
  let text = source;
  if (legacy) {
    text = replaceOnce(text, lookup, legacyLookup);
    text = replaceOnce(text, declaration(source, 'segDist').getText(), legacyDistance);
    text = replaceOnce(text, '  yield* buildRoadLookupGrid();', '  buildRoadLookupGrid();');
  }
  text += '\nlet __lookupTap = (_stage: string, _grids: any): void => {};\nexport function setLookupTap(fn: typeof __lookupTap): void { __lookupTap = fn; }\n';
  const tap = stage => `__lookupTap('${stage}', { gRoadDist, gRoadElev, gSegRoad, gSegIdx, gSegT, gCorridor });`;
  const lookupCall = legacy ? '  buildRoadLookupGrid();' : '  yield* buildRoadLookupGrid();';
  text = replaceOnce(text, lookupCall, `${lookupCall}\n${tap('lookup')}`);
  const afterRoadSupport = '  gSegRoad = null; gSegIdx = null; gSegT = null;';
  text = replaceOnce(text, afterRoadSupport, `${tap('final')}\n${afterRoadSupport}`);
  const url = new URL(`./terrain.ts?selftest=road-lookup-${legacy ? 'legacy' : 'current'}`, import.meta.url).href;
  const hooks = registerHooks({ load(request, context, next) {
    return request === url ? { format: 'module-typescript', source: text, shortCircuit: true } : next(request, context);
  } });
  try { return await import(url); } finally { hooks.deregister(); }
}
const modules = [await constructor(true), await constructor(false)];
function construct(module, id, cooperative = false) {
  const snapshots = [];
  module.setLookupTap((stage, grids) => snapshots.push({ stage, grids: Object.fromEntries(
    Object.entries(grids).map(([name, array]) => [name,
      { type: array.constructor.name, length: array.length, bytes: array.byteLength, sha256: sha(bytes(array)) }])) }));
  const finish = field => {
    assert.deepEqual(snapshots.map(row => row.stage), ['lookup', 'final']);
    return { field, snapshots };
  };
  if (cooperative) {
    const fractions = [];
    return module.createHeightFieldAsync(1337, getMapConfig(id), fraction => fractions.push(fraction))
      .then(field => ({ ...finish(field), fractions }))
      .finally(() => module.setLookupTap(() => {}));
  }
  try {
    return finish(module.createHeightField(1337, getMapConfig(id)));
  } finally { module.setLookupTap(() => {}); }
}
function fieldSamples(field) {
  const samples = [];
  for (let z = -512; z <= 512; z += 32) for (let x = -512; x <= 512; x += 32) {
    const px = x + .375, pz = z + .625, normal = field.getNormalAt(px, pz);
    const values = [field.getHeightAt(px, pz), field.getHeightAtFast(px, pz), normal.x, normal.y, normal.z,
      field._roadDist(px, pz), field.getWaterMaskAt(px, pz),
      field.getWaterDepthAt(px, pz), field.getTrackSurfaceAt(px, pz)];
    assert(values.every(Number.isFinite), 'actual field samples remain finite');
    samples.push([...values, field.getGroundType(px, pz)]);
  }
  return samples;
}
const receipts = [];
for (const id of MAP_IDS) {
  const before = construct(modules[0], id), after = construct(modules[1], id);
  const paced = await construct(modules[1], id, true);
  assert.deepEqual(after.snapshots, before.snapshots, `${id}: exact raw and final grid bytes/budgets`);
  assert.deepEqual(Object.keys(after.field).sort(), Object.keys(before.field).sort(), 'same returned API');
  assert.deepEqual(after.field._layout, before.field._layout, `${id}: road layouts and placements unchanged`);
  assert.deepEqual([after.field.minY, after.field.maxY], [before.field.minY, before.field.maxY]);
  assert.deepEqual(fieldSamples(after.field), fieldSamples(before.field), `${id}: actual exact/fast/normal/water/ground output`);
  assert.deepEqual(paced.snapshots, after.snapshots, `${id}: yielded raw and final grid bytes`);
  assert.deepEqual(Object.keys(paced.field).sort(), Object.keys(after.field).sort());
  assert.deepEqual(paced.field._layout, after.field._layout);
  assert.deepEqual([paced.field.minY, paced.field.maxY], [after.field.minY, after.field.maxY]);
  assert.deepEqual(fieldSamples(paced.field), fieldSamples(after.field), `${id}: yielded exact/fast/normal/water/depth/track output`);
  const expectedSlices = after.field._layout.roads.reduce((sum, nodes) => sum + nodes.length - 1, 0) + 257 + 1 + 129;
  assert.deepEqual(paced.fractions, Array.from({ length: expectedSlices }, (_, index) => (index + 1) / expectedSlices),
    `${id}: completed segment, corridor/support/range progress is monotonic and exact`);
  const warmPoints = [{ x: 0, z: 0 }, { x: 15.75, z: 16.25, radiusM: 1 }];
  assert.deepEqual([...paced.field.warmFastTilesAround(warmPoints)], [...after.field.warmFastTilesAround(warmPoints)]);
  assert.deepEqual([...paced.field.warmFastTilesAround(warmPoints)], [], 'completed fast tiles are not rebuilt');
  receipts.push({ id, grids: 18, fieldSamples: 1089, checkpoints: expectedSlices, exact: true });
}

// Tap the actual private construction phases and generator close in memory.
// An abandoned callback cannot continue a later grid/scan or publish a field.
async function cancellationModule() {
  const generator = declaration(source, 'heightFieldBuildSteps').getText();
  const body = declaration(source, 'heightFieldBuildSteps').body.getText();
  let observed = generator.replace(body, `{ try ${body} finally { __heightClosed++; } }`);
  const stamp = '        stampRoadLookupSegment(r, s, nodes[s][0], nodes[s][1], nodes[s + 1][0], nodes[s + 1][1]);';
  observed = replaceOnce(observed, stamp, stamp + "\n        __heightEvents.push('segment');");
  observed = replaceOnce(observed, '  buildRoadElevationGrid();',
    "  __heightEvents.push('support');\n  buildRoadElevationGrid();");
  observed = replaceOnce(observed, '      for (let gx = 0; gx <= 128; gx++) {',
    "      __heightEvents.push('range');\n      for (let gx = 0; gx <= 128; gx++) {");
  const text = source.replace(generator, observed)
    + '\nexport let __heightClosed = 0;\nexport const __heightEvents: string[] = [];\n';
  const url = new URL('./terrain.ts?selftest=heightfield-close', import.meta.url).href;
  const hooks = registerHooks({ load(request, context, next) {
    return request === url ? { format: 'module-typescript', source: text, shortCircuit: true } : next(request, context);
  } });
  try { return await import(url); } finally { hooks.deregister(); }
}
const observedHeight = await cancellationModule();
const urban = getMapConfig('urban');
const segments = modules[1].createLayout(urban).roads.reduce((sum, nodes) => sum + nodes.length - 1, 0);
for (const [cancelAt, asynchronous] of [[1, false], [1, true], [segments, false],
  [segments + 257, true], [segments + 258, false], [segments + 259, false],
  [segments + 259, true], [segments + 387, true]]) {
  const failure = new Error('cancel private height field'), closedBefore = observedHeight.__heightClosed;
  observedHeight.__heightEvents.length = 0;
  let ticks = 0, lastFraction = 0, published = false;
  const pending = observedHeight.createHeightFieldAsync(1337, urban, fraction => {
    lastFraction = fraction;
    if (++ticks !== cancelAt) return;
    if (asynchronous) return Promise.reject(failure);
    throw failure;
  }).then(() => { published = true; });
  await assert.rejects(pending, error => error === failure);
  assert.equal(published, false);
  assert.equal(ticks, cancelAt);
  assert.equal(lastFraction, cancelAt / (segments + 387), 'even fraction=1 remains cancellable before publication');
  assert.equal(observedHeight.__heightClosed, closedBefore + 1, 'actual delegated construction closes once');
  assert.deepEqual(observedHeight.__heightEvents, [
    ...Array(Math.min(cancelAt, segments)).fill('segment'),
    ...(cancelAt > segments + 257 ? ['support'] : []),
    ...Array(Math.max(0, cancelAt - segments - 258)).fill('range'),
  ], 'no later road/support/range work after rejection');
}
{
  let release;
  const held = new Promise(resolve => { release = resolve; });
  observedHeight.__heightEvents.length = 0;
  let ticks = 0, published = false;
  const pending = observedHeight.createHeightFieldAsync(1337, urban, () => { if (++ticks === 1) return held; })
    .then(field => { published = true; return field; });
  assert.deepEqual(observedHeight.__heightEvents, ['segment']);
  await Promise.resolve();
  assert.equal(published, false, 'a pending pacing promise cannot expose a partial field');
  assert.equal(ticks, 1);
  release();
  assert.ok((await pending).getHeightAt, 'only the completed field reaches the caller');
}
{
  const failure = new Error('original pacing failure');
  let advances = 0, closes = 0;
  const run = new Function('heightFieldBuildSteps', stripTypeScriptTypes(
    declaration(source, 'createHeightFieldAsync').getText()).replace('export ', '')
    + '\nreturn createHeightFieldAsync;')(() => ({
    next() { advances++; return { done: false, value: 0.1 }; },
    return() { closes++; throw new Error('close failed'); },
  }));
  await assert.rejects(run(1337, null, () => { throw failure; }), error => error === failure);
  assert.equal(advances, 1);
  assert.equal(closes, 1, 'failed close never masks the original callback error');
}

// Execute the actual map composition seam without geometry or source IO.
// Fine callers pace Surveying; coarse callers retain their original callbacks.
const mapSource = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
const mapAsync = declaration(mapSource, 'createMapAsync').getText();
function mapFixture(fine, fail = false) {
  const field = { _layout: { spawns: { player: { x: 0, z: 0 } } } };
  const events = [], fractions = [], failure = new Error('cancel map surveying');
  const dependencies = {
    getMapConfig: () => urban, preloadPropModels: () => Promise.resolve(), prepareSourcedTerrain: () => ({}),
    createHeightField() { assert.equal(fine, false); events.push('sync-field'); return field; },
    async createHeightFieldAsync(_seed, _config, tick) {
      assert.equal(fine, true); events.push('field-start');
      await tick(0.5); await tick(1);
      events.push('field-complete'); return field;
    },
    requireTerrainRoot: value => value,
    async buildTerrainMeshesAsync(actual) { assert.equal(actual, field); events.push('terrain'); return { userData: {} }; },
    async createVegetationAsync(actual) { assert.equal(actual, field); events.push('vegetation'); return {}; },
    async createPropsAsync(actual) { assert.equal(actual, field); events.push('props'); return {}; },
    assembleWorld(_engine, _config, actual) { assert.equal(actual, field); events.push('assembled'); return {}; },
  };
  const run = new Function(...Object.keys(dependencies), stripTypeScriptTypes(mapAsync).replace('export ', '')
    + '\nreturn createMapAsync;')(...Object.values(dependencies));
  const pending = run({}, { mapId: 'urban' }, (label, fraction) => {
    fractions.push([label, fraction]);
    if (fail && label === 'Surveying terrain' && fraction > 0) throw failure;
  }, { fineSlices: fine });
  return { pending, events, fractions, failure };
}
for (const fine of [false, true]) {
  const h = mapFixture(fine);
  await h.pending;
  assert.deepEqual(h.events, [...(fine ? ['field-start', 'field-complete'] : ['sync-field']),
    'terrain', 'vegetation', 'props', 'assembled']);
  assert.deepEqual(h.fractions, [['Surveying terrain', 0],
    ...(fine ? [['Surveying terrain', 0.17], ['Surveying terrain', 0.34]] : []),
    ['Building terrain meshes', 0.34], ['Planting vegetation', 0.58],
    ['Placing structures', 0.82], ['Sealing the battlefield', 0.96]]);
}
{
  const h = mapFixture(true, true);
  await assert.rejects(h.pending, error => error === h.failure);
  assert.deepEqual(h.events, ['field-start'], 'cancelled surveying cannot create a terrain/GPU owner');
}
console.log('roadLookupGrid selftest: PASS', JSON.stringify({ fixtures: 5, maps: receipts }));
