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
    const stringsJson = stringsText.replace(/\}\s*$/, '');
    let strings;
    try { strings = JSON.parse(stringsJson); } catch (error) {
      // (a real snapshot's string table failed JSON.parse 11 MB in, 2026-10-25) read it string by string instead, and keep
      // what stood at the fault for the record
      const at = Number(/position (\d+)/.exec(String(error?.message))?.[1] ?? -1);
      fault = { message: String(error?.message ?? error), around: at >= 0 ? stringsJson.slice(Math.max(0, at - 200), at + 200) : null,
        head: stringsJson.slice(0, 200), tail: stringsJson.slice(-200) };
      const read = readStringArray(stringsJson);
      strings = read.strings;
      fault.gaps = read.gaps.length;
      // (2026-10-25: a stretch of one chunk lost inside the string table — the protocol's text dropped it, the ints are
      // whole) the strings after a single gap realigned: as many placeholders there as the graph's highest string index says
      // are missing
      if (read.gaps.length === 1) {
        const meta0 = JSON.parse(metaText.replace(/^\s*\{\s*"snapshot"\s*:\s*/, '').replace(/,\s*$/, '')).meta;
        const missing = highestStringIndex(meta0, nodes.a.subarray(0, nodes.n), edges.a.subarray(0, edges.n)) + 1 - strings.length;
        if (missing > 0) strings.splice(read.gaps[0], 0, ...new Array(missing).fill('(lost)'));
        fault.realigned = missing;
      }
    }
    const meta = JSON.parse(metaText.replace(/^\s*\{\s*"snapshot"\s*:\s*/, '').replace(/,\s*$/, '')).meta;
    return { meta, nodes: nodes.a.subarray(0, nodes.n), edges: edges.a.subarray(0, edges.n), strings, fault };
  }
  let fault = null;
  return { feed, finish };
}

/**
 * A JSON array of strings read string by string. Where a string's content follows the last string with no comma (a lost
 * stretch took the comma and the next string's opening quote: `"16.40421485900"528984",`), a gap is noted at that index
 * and the content read as the next string's.
 */
export function readStringArray(text) {
  const strings = [], gaps = [];
  let i = text.indexOf('[') + 1, expectValue = true;
  const readTo = (from, quoted) => {
    let j = from, value = '';
    for (; j < text.length; j++) {
      const d = text[j];
      if (d === '"') break;
      if (d !== '\\') { value += d; continue; }
      const e = text[++j];
      if (e === 'u') { value += String.fromCharCode(Number.parseInt(text.slice(j + 1, j + 5), 16)); j += 4; }
      else value += ({ b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' })[e] ?? e;
    }
    strings.push(value);
    return j + 1;
  };
  while (i < text.length) {
    const c = text[i];
    if (c === ']') break;
    if (c === ',') { expectValue = true; i++; continue; }
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t') { i++; continue; }
    if (c === '"' && expectValue) { i = readTo(i + 1); expectValue = false; continue; }
    // a value where a comma belongs: the lost stretch ended inside a string (its quote taken for the last one's close)
    gaps.push(strings.length);
    i = readTo(c === '"' ? i + 1 : i);
    expectValue = false;
  }
  return { strings, gaps };
}

/** The highest string index a node's name or a named edge reads. */
function highestStringIndex(meta, nodes, edges) {
  const NF = meta.node_fields.length, EF = meta.edge_fields.length;
  const nName = meta.node_fields.indexOf('name'), eType = meta.edge_fields.indexOf('type'), eName = meta.edge_fields.indexOf('name_or_index');
  const edgeTypes = meta.edge_types[eType];
  let top = -1;
  for (let i = nName; i < nodes.length; i += NF) if (nodes[i] > top) top = nodes[i];
  for (let e = 0; e < edges.length; e += EF) {
    const kind = edgeTypes[edges[e + eType]];
    if (kind !== 'element' && kind !== 'hidden' && edges[e + eName] > top) top = edges[e + eName];
  }
  return top;
}

/** The shortest strong retainer paths (up to `max`) from a GC root to each object built by `markerName` (or, given its
 *  heap snapshot object id, that object: a string table that lost a stretch can misname it). */
export function retainerPaths({ meta, nodes, edges, strings }, markerName, max = 3, markerId = null) {
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
  const nId = meta.node_fields.indexOf('id');
  for (let i = 0; i < N; i++) {
    if (markerId != null ? nodes[i * NF + nId] === Number(markerId) : typeOf(i) === 'object' && nameOf(i) === markerName) markers.push(i);
  }
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
      // (the nodes' heap ids beside the steps: a caller can name them through the page when the strings are suspect)
      const nodeIds = [];
      for (let node = root; node !== marker && via[node] >= 0;) {
        nodeIds.push(nodes[node * NF + nId]);
        const e = via[node], kind = edgeTypes[edges[e * EF + eType]];
        const label = kind === 'element' || kind === 'hidden' ? `[${edges[e * EF + eName]}]` : strings[edges[e * EF + eName]];
        steps.push(`${typeOf(node) === 'closure' ? 'fn ' : ''}${nameOf(node) || typeOf(node)} .${String(label).slice(0, 60)}`);
        node = edges[e * EF + eTo] / NF;
      }
      steps.push(markerName);
      nodeIds.push(nodes[marker * NF + nId]);
      return Object.defineProperty(steps, 'nodeIds', { value: nodeIds, enumerable: false });
    });
  });
}

/** A page object's heap snapshot id, its handle released before any snapshot (a held handle would retain it itself). */
export async function heapObjectIdOf(cdp, expression) {
  await cdp.send('HeapProfiler.enable');
  const { result } = await cdp.send('Runtime.evaluate', { expression, objectGroup: 'cot-heap-retainers' });
  try { return result?.objectId ? (await cdp.send('HeapProfiler.getHeapObjectId', { objectId: result.objectId })).heapSnapshotObjectId : null; }
  finally { await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'cot-heap-retainers' }); }
}

/** Take the page's heap snapshot through a CDP session and return each marker's retainer paths. `locate`: an expression
 *  a marker's name reads it by in the page, whose heap snapshot object id (asked once the snapshot has assigned ids, the
 *  handle released) finds it where the string table may have misnamed it. */
export async function snapshotRetainerPaths(cdp, markerNames, max = 3, locate = {}) {
  const parser = createSnapshotParser();
  const onChunk = ({ chunk }) => parser.feed(chunk);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
  try { await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false }); }
  finally { cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk); }
  const snapshot = parser.finish();
  if (snapshot.fault) console.error(`[heap-retainers] the string table read string by string: ${JSON.stringify(snapshot.fault)}`);
  const ids = {};
  for (const name of markerNames) {
    if (!locate[name]) continue;
    const id = await heapObjectIdOf(cdp, locate[name]).catch(() => null);
    if (id && id !== '0') ids[name] = id;
  }
  if (Object.keys(locate).length) console.error(`[heap-retainers] marker ids ${JSON.stringify(ids)}`);
  const result = Object.fromEntries(markerNames.map((name) => [name, retainerPaths(snapshot, name, max, ids[name] ?? null)]));
  // a string table that lost more than one stretch names some steps wrongly: each step's object as the page describes it
  if (snapshot.fault && !(snapshot.fault.gaps === 1)) {
    for (const perMarker of Object.values(result)) for (const steps of perMarker) {
      for (let k = 0; k < steps.length; k++) {
        const id = steps.nodeIds?.[k];
        if (id == null) continue;
        const described = await cdp.send('HeapProfiler.getObjectByHeapObjectId', { objectId: String(id), objectGroup: 'cot-heap-retainers' })
          .then(({ result: o }) => o?.description ?? o?.className ?? o?.type ?? '?', () => '(not an object)');
        steps[k] = `${steps[k]} {${String(described).replace(/\s+/g, ' ').slice(0, 90)}}`;
      }
    }
    await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'cot-heap-retainers' }).catch(() => {});
  }
  return result;
}
