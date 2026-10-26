// heap-retainers.mjs on a synthetic snapshot fed in awkward chunks: the strong retainer path from a root to a marker,
// weak edges skipped, the shortest path first.
import assert from 'node:assert/strict';
import { createSnapshotParser, retainerPaths } from './heap-retainers.mjs';

const strings = ['', '(GC roots)', 'Window', 'cache', 'World', 'marker', 'LeakMarker_1', 'weakRefs', 'Holder', 'held'];
const meta = {
  node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'],
  node_types: [['hidden', 'object', 'synthetic', 'closure']],
  edge_fields: ['type', 'name_or_index', 'to_node'],
  edge_types: [['context', 'element', 'property', 'internal', 'hidden', 'shortcut', 'weak']],
};
// nodes: 0 root (synthetic), 1 Window, 2 World, 3 LeakMarker_1, 4 Holder (reached only weakly from the root)
const node = (type, name, edgeCount) => [type, name, 0, 8, edgeCount];
const nodes = [node(2, 1, 2), node(1, 2, 1), node(1, 4, 1), node(1, 6, 0), node(1, 8, 1)].flat();
const F = 5;
const edge = (type, name, to) => [type, name, to * F];
const edges = [
  edge(2, 2, 1), // root .Window -> Window
  edge(6, 7, 4), // root .weakRefs (weak) -> Holder
  edge(2, 3, 2), // Window .cache -> World
  edge(2, 5, 3), // World .marker -> LeakMarker_1
  edge(2, 9, 3), // Holder .held -> LeakMarker_1
].flat();
const json = JSON.stringify({ snapshot: { meta, node_count: 5, edge_count: 5 }, nodes, edges, strings });
const parser = createSnapshotParser();
for (let at = 0; at < json.length; at += 7) parser.feed(json.slice(at, at + 7));
const snapshot = parser.finish();
assert.equal(snapshot.nodes.length, nodes.length, 'every node field parsed across chunk splits');
assert.equal(snapshot.edges.length, edges.length);
const [paths] = retainerPaths(snapshot, 'LeakMarker_1', 3);
assert.deepEqual(paths, [['(GC roots) .Window', 'Window .cache', 'World .marker', 'LeakMarker_1']],
  'the strong path; the weakly held Holder does not retain it');
assert.deepEqual(retainerPaths(snapshot, 'Nothing', 3), [], 'no marker, no paths');
// a stretch of one chunk lost inside the string table (the tail of "Window", the comma, "cache" and the next opening quote):
// read string by string, the gap noted, the strings after it realigned by the graph's highest string index
const lost = json.replace('"Window","cache","World"', '"Win"World"');
const tolerant = createSnapshotParser();
for (let at = 0; at < lost.length; at += 11) tolerant.feed(lost.slice(at, at + 11));
const repaired = tolerant.finish();
assert.ok(repaired.fault && repaired.fault.gaps === 1 && repaired.fault.realigned === 1, `one gap, one string realigned (${JSON.stringify(repaired.fault)})`);
assert.deepEqual(repaired.strings.slice(4), strings.slice(4), 'every string after the gap at its own index');
assert.deepEqual(retainerPaths(repaired, 'LeakMarker_1', 3)[0][0], ['(GC roots) .Win', 'Win .(lost)', 'World .marker', 'LeakMarker_1'],
  'the marker found by name after the gap, the path whole');
// and by its heap id, whatever its name reads (a node's id field)
const byId = { ...snapshot, nodes: Float64Array.from(snapshot.nodes) };
byId.nodes[3 * F + 2] = 77; byId.nodes[3 * F + 1] = 8; // the marker's id 77, its name misread as "Holder"
assert.deepEqual(retainerPaths(byId, 'LeakMarker_1', 3), [], 'by name the misnamed marker is not found');
assert.equal(retainerPaths(byId, 'LeakMarker_1', 3, 77)[0][0].length, 4, 'by id it is, its strong path whole');
console.log('heap-retainers.selftest: streamed parse across chunk splits, strong retainer path, weak edges skipped, a lost stretch in the string table realigned, a marker found by heap id');
