// Explicit test/acquisition fixture, never imported by shipping terrain.
import assert from 'node:assert/strict';

export const AUTHORED_EXIT_FIXTURE = {
  alpine: [
    { path: 0, prefix: [[-420, -480]], suffix: [[-202, 480]], original:
      [[-420, -450], [-346, -278], [-316, -90], [-330, 108], [-276, 290], [-202, 468]] },
    { path: 1, prefix: [[-112, -480]], suffix: [[-18, 480]], original:
      [[-112, -466], [-146, -304], [-154, -168], [-172, -28], [-138, 142], [-86, 316], [-18, 466]] },
    { path: 2, prefix: [[330, -480]], suffix: [[212, 480]], original:
      [[330, -452], [286, -282], [246, -122], [226, 42], [258, 218], [212, 410]] },
  ],
  reservoir: [
    { path: 0, prefix: [[-480, -72]], suffix: [], original:
      [[-424, -72], [-364, -72], [-340, -88], [-238, -174], [-78, -212],
        [42, -244], [172, -224], [294, -190], [392, -100]] },
    { path: 4, prefix: [[420, -480], [420, -448], [370, -400]], suffix: [[448, 400], [480, 400]], original:
      [[370, -328], [436, -288], [420, -208], [392, -100], [416, 0],
        [388, 160], [448, 226], [372, 282], [440, 354]] },
  ],
};

export function configuredIdentity(value) {
  return JSON.stringify(value, (_key, item) => typeof item === 'function'
    ? { functionSource: item.toString() } : item);
}

export function withAuthoredExits(original) {
  const additions = AUTHORED_EXIT_FIXTURE[original.id];
  if (!additions) return original;
  const paths = [...original.terrain.roads.paths];
  for (const row of additions) {
    assert.deepEqual(paths[row.path], row.original, 'frozen original interior path ownership');
    paths[row.path] = [...row.prefix, ...row.original, ...row.suffix];
  }
  return { ...original, terrain: { ...original.terrain,
    roads: { ...original.terrain.roads, paths } } };
}

export function assertAuthoredExitConfig(original, actual) {
  assert.equal(configuredIdentity(actual), configuredIdentity(withAuthoredExits(original)),
    'only the exact finite authored additions may differ; all interior nodes/materials/config stay exact');
}

export function originalExitConfig(actual) {
  const additions = AUTHORED_EXIT_FIXTURE[actual.id];
  if (!additions) return actual;
  const paths = [...actual.terrain.roads.paths];
  for (const row of additions) paths[row.path] = row.original;
  const original = { ...actual, terrain: { ...actual.terrain,
    roads: { ...actual.terrain.roads, paths } } };
  assertAuthoredExitConfig(original, actual);
  return original;
}

export function authoredApproachEntries(config, roads) {
  const entries = [];
  for (const row of AUTHORED_EXIT_FIXTURE[config.id] ?? []) {
    for (const end of [0, 1]) appendApproach(entries, config, roads, row, end);
  }
  return entries;
}

function appendApproach(entries, config, roads, row, end) {
  const added = end ? row.suffix : [...row.prefix].reverse();
  if (!added.length) return;
  const chain = [end ? row.original.at(-1) : row.original[0], ...added,
    end ? roads[row.path].at(-1) : roads[row.path][0]];
  const neighbor = end ? row.original.at(-2) : row.original[1], anchor = chain[0];
  const distance = Math.hypot(neighbor[0] - anchor[0], neighbor[1] - anchor[1]);
  // Four metres along the REAL original tangent, not the straight
  // extrapolation of a newly authored segment on the other side of a bend.
  entries.push(measuredSegment(config, row.path, end, -1, anchor,
    [anchor[0] + (neighbor[0] - anchor[0]) * 4 / distance,
      anchor[1] + (neighbor[1] - anchor[1]) * 4 / distance], 'original-tie-in'));
  for (let segment = 0; segment < chain.length - 1; segment++) {
    entries.push(measuredSegment(config, row.path, end, segment, chain[segment], chain[segment + 1], 'added-approach'));
  }
}

function measuredSegment(config, road, end, segment, a, b, kind) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  assert.ok(length > 0 && Number.isFinite(length), 'finite nondegenerate measured segment');
  return { road, end, segment, kind, a, b, length,
    ux: (b[0] - a[0]) / length, uz: (b[1] - a[1]) / length,
    width: Math.max(32, 6 + Math.abs(config.terrain.rimH) * 2.4) };
}
