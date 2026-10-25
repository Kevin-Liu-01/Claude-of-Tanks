// (battle-spikes-253) Who keeps an object alive: a V8 heap snapshot parsed as it streams (CDP HeapProfiler chunks; nothing
// written to disk), and for a marker object (found by its constructor's name) the shortest strong retainer paths back to a
// GC root (weak and shortcut edges skipped). battle-memory-probe --retainers runs it on a leaked world's marker.

/** A streaming parser of the snapshot's JSON: the meta, the nodes and edges as integer runs, the strings parsed once. */
export function createSnapshotParser() {
  class Ints {
    constructor() { this.a = new Float64Array(1 << 20); this.n = 0; }
    push(v) {
      if (this.n === this.a.length) { const grown = new Float64Array(this.a.length * 2); grown.set(this.a); this.a = grown; }
      this.a[this.n++] = v;
    }
  }
  const nodes = new Ints(), edges = new Ints();
  let state = 'head', head = '', carry = '', stringsText = '', target = null, metaText = null;
  function ints(text) {
    const end = text.indexOf(']');
    const parts = (carry + (end < 0 ? text : text.slice(0, end))).split(',');
    carry = end < 0 ? parts.pop() : '';
    for (const part of parts) { const t = part.trim(); if (t) target.push(Number(t)); }
    if (end < 0) return '';
    state = 'between'; head = '';
    return text.slice(end + 1);
  }
  function feed(chunk) {
    let text = chunk;
    while (text.length) {
      if (state === 'head' || state === 'between') {
        head += text; text = '';
        const marks = state === 'head' ? ['"nodes":['] : ['"edges":[', '"strings":['];
        for (const mark of marks) {
          const at = head.indexOf(mark);
          if (at < 0) continue;
          if (state === 'head') metaText = head.slice(0, at);
          const rest = head.slice(at + mark.length);
          if (mark === '"strings":[') { state = 'strings'; stringsText = `[${rest}`; return; }
          state = 'ints'; target = mark === '"nodes":[' ? nodes : edges; carry = ''; text = rest;
          break;
        }
        if (state === 'head' || state === 'between') { if (state === 'between' && head.length > 4096) head = head.slice(-64); return; }
        continue;
      }
      if (state === 'ints') { text = ints(text); continue; }
      stringsText += text; return;
    }
  }
  function finish() {
    const strings = JSON.parse(stringsText.replace(/\}\s*$/, ''));
    const meta = JSON.parse(metaText.replace(/^\s*\{\s*"snapshot"\s*:\s*/, '').replace(/,\s*$/, '')).meta;
    return { meta, nodes: nodes.a.subarray(0, nodes.n), edges: edges.a.subarray(0, edges.n), strings };
  }
  return { feed, finish };
}

/** The shortest strong retainer paths (up to `max`) from a GC root to each object built by `markerName`. */
export function retainerPaths({ meta, nodes, edges, strings }, markerName, max = 3) {
  const NF = meta.node_fields.length, EF = meta.edge_fields.length;
  const nType = meta.node_fields.indexOf('type'), nName = meta.node_fields.indexOf('name');
  const nEdges = meta.node_fields.indexOf('edge_count');
  const eType = meta.edge_fields.indexOf('type'), eName = meta.edge_fields.indexOf('name_or_index');
  const eTo = meta.edge_fields.indexOf('to_node');
  const nodeTypes = meta.node_types[nType], edgeTypes = meta.edge_types[eType];
  const N = nodes.length / NF, E = edges.length / EF;
  const typeOf = (i) => nodeTypes[nodes[i * NF + nType]], nameOf = (i) => strings[nodes[i * NF + nName]];
  const edgeFrom = new Int32Array(E);
  for (let i = 0, e = 0; i < N; i++) for (let k = nodes[i * NF + nEdges]; k > 0; k--) edgeFrom[e++] = i;
  const inStart = new Int32Array(N + 1);
  for (let e = 0; e < E; e++) inStart[edges[e * EF + eTo] / NF + 1]++;
  for (let i = 0; i < N; i++) inStart[i + 1] += inStart[i];
  const inEdges = new Int32Array(E), cursor = inStart.slice(0, N);
  for (let e = 0; e < E; e++) { const to = edges[e * EF + eTo] / NF; inEdges[cursor[to]++] = e; }
  const markers = [];
  for (let i = 0; i < N; i++) if (typeOf(i) === 'object' && nameOf(i) === markerName) markers.push(i);
  return markers.map((marker) => {
    const via = new Int32Array(N).fill(-1), seen = new Uint8Array(N), queue = new Int32Array(N);
    let head = 0, tail = 0;
    queue[tail++] = marker; seen[marker] = 1;
    const roots = [];
    while (head < tail && roots.length < max) {
      const node = queue[head++];
      if (typeOf(node) === 'synthetic') { roots.push(node); continue; }
      for (let k = inStart[node]; k < inStart[node + 1]; k++) {
        const e = inEdges[k], kind = edgeTypes[edges[e * EF + eType]];
        if (kind === 'weak' || kind === 'shortcut') continue;
        const from = edgeFrom[e];
        if (seen[from]) continue;
        seen[from] = 1; via[from] = e; queue[tail++] = from;
      }
    }
    return roots.map((root) => {
      const steps = [];
      for (let node = root; node !== marker && via[node] >= 0;) {
        const e = via[node], kind = edgeTypes[edges[e * EF + eType]];
        const label = kind === 'element' || kind === 'hidden' ? `[${edges[e * EF + eName]}]` : strings[edges[e * EF + eName]];
        steps.push(`${typeOf(node) === 'closure' ? 'fn ' : ''}${nameOf(node) || typeOf(node)} .${String(label).slice(0, 60)}`);
        node = edges[e * EF + eTo] / NF;
      }
      steps.push(markerName);
      return steps;
    });
  });
}

/** Take the page's heap snapshot through a CDP session and return each marker's retainer paths. */
export async function snapshotRetainerPaths(cdp, markerNames, max = 3) {
  const parser = createSnapshotParser();
  const onChunk = ({ chunk }) => parser.feed(chunk);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
  try { await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false }); }
  finally { cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk); }
  const snapshot = parser.finish();
  return Object.fromEntries(markerNames.map((name) => [name, retainerPaths(snapshot, name, max)]));
}
