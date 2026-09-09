import assert from 'node:assert/strict';
import { createHeightField } from '../terrain.ts';
import { sampleShorelineMask, shorelineRadiusAt, SHORELINE_SEGMENTS } from '../shoreline.ts';
import { historicalShorelineConfig } from '../shorelineHistoryTestOracle.mjs';
import { createLakeChannel } from './marshChannel.ts';
import polders from './polders.ts';
import mangrove from './mangrove.ts';
import oasis from './oasis.ts';
import reservoir from './reservoir.ts';

const channel = createLakeChannel([{ x: 0, z: 0, r: 20 }, { x: 0, z: 100, r: 20 }], -1.2);
assert.equal(channel.length, 6);
assert.ok(channel.every((cell) => cell.level === -1.2 && !('dip' in cell)),
  'interpolated liquid cells use one explicit waterline, never summed marsh dips');

const originalPolders = historicalShorelineConfig(polders);
const originalOasis = historicalShorelineConfig(oasis);

function checkCircleChannels(config, expectedCells, expectedReaches, maximumAreaBudget) {
  const hf = createHeightField(1337, config);
  const cells = config.terrain.lakes;
  assert.equal(cells.length, expectedCells, `${config.id}: fixed channel-cell budget`);
  assert.equal(config.terrain.marshes.length, 0, `${config.id}: no liquid painted over noisy marsh height`);
  assert.equal(config.terrain.softLakes, true);
  assert.ok(cells.reduce((area, cell) => area + cell.r * cell.r, 0) <= maximumAreaBudget,
    `${config.id}: reshaping does not inflate the wet-cell area budget`);
  const pads = [hf._layout.spawns.player, ...hf._layout.spawns.enemies];
  const awayFromDryPriority = (x, z) => hf._roadDist(x, z) >= 18
    && pads.every((pad) => Math.hypot(x - pad.x, z - pad.z) >= 26);
  const joined = (a, b) => {
    if (Math.hypot(a.x - b.x, a.z - b.z) > 0.8 * (a.r + b.r)) return false;
    for (let step = 0; step <= 8; step++) {
      const t = step / 8;
      if (sampleShorelineMask([], cells, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) < 0.99) return false;
    }
    return true;
  };
  const unvisited = new Set(cells.map((_, index) => index));
  const components = [];
  while (unvisited.size) {
    const queue = [unvisited.values().next().value];
    unvisited.delete(queue[0]);
    for (let i = 0; i < queue.length; i++) {
      const a = cells[queue[i]];
      for (const other of unvisited) {
        const b = cells[other];
        if (joined(a, b)) {
          queue.push(other);
          unvisited.delete(other);
        }
      }
    }
    components.push(queue);
  }
  assert.equal(components.length, expectedReaches, `${config.id}: authored connected water planform before dry road crossings`);
  let flatSamples = 0;
  for (const component of components) {
    const waterline = cells[component[0]].level;
    assert.ok(component.length >= 3, `${config.id}: no isolated round ponds`);
    for (const i of component) {
      const a = cells[i];
      assert.equal(a.level, waterline, `${config.id}: overlapping cells share a level`);
      if (awayFromDryPriority(a.x, a.z)) {
        assert.ok(Math.abs(hf.getHeightAt(a.x, a.z) - waterline) < 1e-7,
          `${config.id}: standing water at every non-crossing center is flat`);
        assert.ok(hf.getWaterMaskAt(a.x, a.z) >= 0.99);
      }
      for (const j of component) {
        if (j <= i) continue;
        const b = cells[j];
        if (!joined(a, b)) continue;
        for (let step = 0; step <= 8; step++) {
          const t = step / 8, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
          assert.ok(sampleShorelineMask([], cells, x, z) >= 0.99,
            `${config.id}: no dry dots at a channel join`);
          if (awayFromDryPriority(x, z)) {
            assert.ok(Math.abs(hf.getHeightAt(x, z) - waterline) < 1e-7,
              `${config.id}: no uphill water at ${x},${z}; got ${hf.getHeightAt(x, z)}, expected ${waterline}; road ${hf._roadDist(x, z)}`);
            assert.ok(hf.getWaterMaskAt(x, z) >= 0.99, `${config.id}: visible connected water away from crossings`);
            flatSamples++;
          }
        }
      }
    }
  }
  checkDryAccess(hf, config, cells);
  assert.ok(flatSamples >= expectedCells * 2, `${config.id}: enough real open-water samples, not all excused as crossings`);
  console.log(`authoredChannels.selftest: ${config.id} ${cells.length} cells / ${components.length} reaches / ${flatSamples} flat join samples; dry routes and pads`);
}

function checkDryAccess(hf, config, cells) {
  for (const nodes of hf._layout.roads) {
    for (let index = 1; index < nodes.length; index++) {
      const a = nodes[index - 1], b = nodes[index];
      for (let step = 0; step <= 4; step++) {
        const t = step / 4, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        assert.equal(hf.getWaterMaskAt(x, z), 0, `${config.id}: every actual causeway remains dry`);
        assert.equal(hf.getGroundType(x, z), 'hard', `${config.id}: causeways keep hard-ground movement`);
        assert.ok(hf.getNormalAt(x, z).y >= 0.90, `${config.id}: crossings remain tank-traversable`);
      }
    }
  }
  for (const site of [config.spawns.player, ...config.spawns.enemies, ...config.props.tacticalBeats]) {
    for (const dx of [-8, 0, 8]) for (const dz of [-8, 0, 8]) {
      assert.equal(sampleShorelineMask([], cells, site.x + dx, site.z + dz), 0,
        `${config.id}: complete deployment/strongpoint footprints stay dry`);
    }
  }
}

// Keep every former connected-cell assertion against its exact published
// input. Polders/Oasis now use authored contours, not looser circle budgets.
for (const args of [
  [originalPolders, 27, 5, 15324], [mangrove, 26, 1, 35098],
  [originalOasis, 3, 1, 8462], [reservoir, 3, 1, 23147],
]) checkCircleChannels(...args);

function authoredContourArea(lake) {
  assert.equal(lake.radii?.length, 16, 'sixteen authored contour stations, not legacy round cells');
  assert.ok(lake.radii.every(r => Number.isFinite(r) && r > 0 && r <= 1));
  assert.ok(Math.max(...lake.radii) - Math.min(...lake.radii) > .15, 'real irregular contour, not disguised discs');
  let twiceArea = 0;
  for (let i = 0; i < SHORELINE_SEGMENTS; i++) {
    const a = i * Math.PI * 2 / SHORELINE_SEGMENTS, b = (i + 1) * Math.PI * 2 / SHORELINE_SEGMENTS;
    const r = shorelineRadiusAt(lake, a), next = shorelineRadiusAt(lake, b);
    twiceArea += r * next * Math.sin(b - a);
  }
  return twiceArea * .5;
}

function checkAuthoredBasins(config, count) {
  const cells = config.terrain.lakes, hf = createHeightField(1337, config);
  assert.equal(cells.length, count, 'published authored basin count');
  assert.equal(config.terrain.marshes.length, 0);
  assert.equal(config.terrain.softLakes, true);
  const areas = cells.map(authoredContourArea);
  assert.ok(areas.every(area => area > 3000), 'substantial basins, not tiny isolated water dots');
  // Existing Polders/Oasis shoreline owners use actual contour coverage,
  // unlike the former sum(r²) of overlapping circle records.
  if (config.id === 'polders') assert.ok(areas.reduce((a, b) => a + b, 0) > 29000
    && areas.reduce((a, b) => a + b, 0) < 35000, 'existing authored Polders contour-area budget');
  else {
    let before = 0, after = 0, shared = 0;
    for (let x = -250; x <= -70; x += 2) for (let z = -80; z <= 145; z += 2) {
      const a = sampleShorelineMask([], originalOasis.terrain.lakes, x, z) > .5;
      const b = sampleShorelineMask([], cells, x, z) > .5;
      before += a * 4; after += b * 4; shared += (a && b) * 4;
    }
    assert.ok(after >= before * .85 && after <= before * 1.15 && shared / before > .8,
      'existing Oasis coverage/location budget');
  }
  const pads = [hf._layout.spawns.player, ...hf._layout.spawns.enemies];
  let flatSamples = 0;
  for (const lake of cells) for (let i = 0; i < 64; i++) for (const band of [.3, .6]) {
    const angle = i * Math.PI / 32, radius = shorelineRadiusAt(lake, angle) * band;
    const x = lake.x + Math.cos(angle) * radius, z = lake.z + Math.sin(angle) * radius;
    assert.equal(sampleShorelineMask([], cells, x, z), 1, 'each continuous radial core belongs to its basin');
    if (hf._roadDist(x, z) < 18 || pads.some(p => Math.hypot(x - p.x, z - p.z) < 26)) continue;
    assert.ok(Math.abs(hf.getHeightAt(x, z) - lake.level) < 1e-7, 'same strict flat-water height contract');
    assert.ok(hf.getWaterMaskAt(x, z) >= .99, 'visible open water, not just an authored radius');
    flatSamples++;
  }
  assert.ok(flatSamples >= count * 2, 'same non-vacuous physical water-sample floor');
  checkDryAccess(hf, config, cells);
  console.log(`authoredChannels.selftest: current ${config.id} ${count} authored basins / ${flatSamples} flat core samples; dry routes and pads`);
}
checkAuthoredBasins(polders, 5);
checkAuthoredBasins(oasis, 1);
assert.throws(() => checkAuthoredBasins(originalPolders, 5), /published authored basin count/);
assert.throws(() => authoredContourArea({ ...oasis.terrain.lakes[0], radii: Array(16).fill(1) }), /disguised discs/);
assert.throws(() => authoredContourArea(originalOasis.terrain.lakes[0]), /legacy round cells/);
// Planform signatures complement connectivity: a connected row of circles is
// insufficient for a crescent, a forked valley or a drainage junction.
for (const [config, dryInlet] of [[originalOasis, [-112, 34]], [reservoir, [159, 123]]]) {
  assert.equal(sampleShorelineMask([], config.terrain.lakes, ...dryInlet), 0,
    `${config.id}: a dry promontory cuts into the connected water body`);
}
for (const [x, z] of [[74, 282], [126, 282], [100, 308]]) {
  assert.equal(sampleShorelineMask([], originalPolders.terrain.lakes, x, z), 1,
    'historical Polders retains all three arms of the northern T collector');
}
assert.equal(sampleShorelineMask([], originalPolders.terrain.lakes, 100, 248), 0,
  'the T collector has a dry headland rather than a fourth rounded lobe');
for (const [x, z] of [[80, -230], [81.33333333333333, 232]]) {
  assert.equal(sampleShorelineMask([], mangrove.terrain.lakes, x, z), 1,
    'the former broad gaps now belong to the connected estuary spine');
}
assert.equal(new Set(mangrove.terrain.lakes.map((cell) => cell.level)).size, 1,
  'all tidal reaches share the same estuary waterline');
assert.ok(mangrove.terrain.hillScale <= 0.25 && mangrove.terrain.microScale <= 0.3,
  'mangrove is a lowland estuary rather than deep channels cut through noisy hills');
