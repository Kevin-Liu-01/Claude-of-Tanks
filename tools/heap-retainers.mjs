// (battle-spikes-253) Who keeps an object alive: a V8 heap snapshot parsed as it streams (CDP HeapProfiler chunks; nothing
// written to disk), and for a marker object (found by its constructor's name) the shortest strong retainer paths back to a
// GC root (weak and shortcut edges skipped). battle-memory-probe --retainers runs it on a leaked world's marker.

/**
 * A streaming parser of the snapshot's JSON: the meta, the nodes and edges as integer runs in arrays sized from the counts
 * the meta declares (Uint32, widened to Float64 only for a value past 32 bits), the string table read string by string as
 * it arrives. (2026-10-26: a game page's snapshot — 11 million nodes, 31 million edges — outgrew the doubling Float64
 * arrays; the allocation threw inside the protocol's event handler, which swallowed it, and every chunk after was lost.)
 * Nothing thrown escapes `feed`: a failure is kept in `errors` and the parse is not whole.
 */
export function createSnapshotParser() {
  class Ints {
    constructor(capacity) { this.a = new Uint32Array(Math.max(16, capacity)); this.n = 0; }
    push(v) {
      if (this.n === this.a.length) {
        const grown = new this.a.constructor(this.a.length * 2); grown.set(this.a); this.a = grown;
      }
      if (this.a instanceof Uint32Array && !(v >= 0 && v <= 0xffffffff && v === Math.floor(v))) {
        const wide = new Float64Array(this.a.length); wide.set(this.a); this.a = wide;
      }
      this.a[this.n++] = v;
    }
  }
  let nodes = null, edges = null, declared = null, meta = null;
  let state = 'head', head = '', carry = '', target = null, metaText = null;
  const errors = [];
  function ints(text) {
    const end = text.indexOf(']');
    const parts = (carry + (end < 0 ? text : text.slice(0, end))).split(',');
    carry = end < 0 ? parts.pop() : '';
    for (const part of parts) { const t = part.trim(); if (t) target.push(Number(t)); }
    if (end < 0) return '';
    state = 'between'; head = '';
    return text.slice(end + 1);
  }
  // the string table: one string at a time, never the whole table as one string
  const strings = [], gaps = [];
  const ESCAPES = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
  let inString = false, escapePending = false, unicodeLeft = 0, unicode = '', piece = '', expectValue = true, stringsDone = false;
  function strs(text) {
    let i = 0;
    while (i < text.length && !stringsDone) {
      if (inString) {
        if (unicodeLeft > 0) {
          const take = Math.min(unicodeLeft, text.length - i);
          unicode += text.slice(i, i + take); i += take; unicodeLeft -= take;
          if (!unicodeLeft) { piece += String.fromCharCode(Number.parseInt(unicode, 16)); unicode = ''; }
          continue;
        }
        if (escapePending) {
          const e = text[i++]; escapePending = false;
          if (e === 'u') { unicodeLeft = 4; unicode = ''; } else piece += ESCAPES[e] ?? e;
          continue;
        }
        const quote = text.indexOf('"', i), slash = text.indexOf('\\', i);
        if (quote < 0 && slash < 0) { piece += text.slice(i); break; }
        if (slash >= 0 && (quote < 0 || slash < quote)) { piece += text.slice(i, slash); escapePending = true; i = slash + 1; continue; }
        piece += text.slice(i, quote); strings.push(piece); piece = ''; inString = false; expectValue = false; i = quote + 1;
        continue;
      }
      const c = text[i];
      if (c === ']') { stringsDone = true; break; }
      if (c === ',') { expectValue = true; i++; continue; }
      if (c === ' ' || c === '\n' || c === '\r' || c === '\t') { i++; continue; }
      if (c === '"' && expectValue) { inString = true; i++; continue; }
      // a value where a comma belongs (a stretch the stream lost): a gap, and its content read as the next string's
      gaps.push(strings.length);
      inString = true; expectValue = false;
      if (c === '"') i++;
    }
  }
  function sizeArrays(mark) {
    if (!meta) {
      const parsed = JSON.parse(metaText.replace(/^\s*\{\s*"snapshot"\s*:\s*/, '').replace(/,\s*$/, ''));
      meta = parsed.meta; declared = { nodes: parsed.node_count, edges: parsed.edge_count };
    }
    if (mark === '"nodes":[') nodes = new Ints((declared.nodes ?? 0) * meta.node_fields.length);
    else edges = new Ints((declared.edges ?? 0) * meta.edge_fields.length);
  }
  function feed(chunk) {
    try {
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
            if (mark === '"strings":[') { state = 'strings'; head = ''; text = rest; break; }
            sizeArrays(mark);
            state = 'ints'; target = mark === '"nodes":[' ? nodes : edges; carry = ''; text = rest;
            break;
          }
          if (state === 'head' || state === 'between') { if (state === 'between' && head.length > 4096) head = head.slice(-64); return; }
          continue;
        }
        if (state === 'ints') { text = ints(text); continue; }
        strs(text); return;
      }
    } catch (error) {
      if (errors.length < 8) errors.push(String(error?.message ?? error));
    }
  }
  function finish() {
    if (!meta) sizeArrays(null);
    let fault = null;
    if (gaps.length || !stringsDone || errors.length) {
      fault = { message: errors[0] ?? (stringsDone ? 'gaps in the string table' : 'the string table did not end'), gaps: gaps.length, errors };
      // the strings after a single gap realigned: as many placeholders there as the graph's highest string index says are
      // missing (the ints whole)
      if (gaps.length === 1 && nodes && edges) {
        const missing = highestStringIndex(meta, nodes.a.subarray(0, nodes.n), edges.a.subarray(0, edges.n)) + 1 - strings.length;
        if (missing > 0) strings.splice(gaps[0], 0, ...new Array(missing).fill('(lost)'));
        fault.realigned = missing;
      }
    }
    const empty = new Uint32Array(0);
    return { meta, declared, nodes: nodes ? nodes.a.subarray(0, nodes.n) : empty, edges: edges ? edges.a.subarray(0, edges.n) : empty,
      strings, fault };
  }
  return { feed, finish };
}

/** A JSON array of strings read string by string (the streaming reader over one text): `{ strings, gaps }`. */
export function readStringArray(text) {
  const parser = createSnapshotParser();
  parser.feed(`{"snapshot":{"meta":{"node_fields":[],"edge_fields":[]},"node_count":0,"edge_count":0},"nodes":[],"edges":[],"strings":${text.slice(text.indexOf('['))}`);
  const { strings, fault } = parser.finish();
  return { strings, gaps: new Array(fault?.gaps ?? 0).fill(0) };
}

/** A parsed snapshot holds every node and edge its meta declares, and a string table read whole. */
export function snapshotIsWhole(snapshot) {
  const { meta, declared, nodes, edges, fault } = snapshot;
  return !fault && !!meta && !!declared && nodes.length === declared.nodes * meta.node_fields.length
    && edges.length === declared.edges * meta.edge_fields.length;
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
  // (2026-10-26: the game page's snapshots arrived with stretches missing — in the string table, once its very mark —
  // so the graph is checked against the counts its meta declares and the snapshot taken again, three times at most)
  let snapshot = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const parser = createSnapshotParser();
    let chunks = 0, chars = 0;
    const onChunk = ({ chunk }) => { chunks++; chars += chunk.length; parser.feed(chunk); };
    cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
    try { await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false }); }
    finally { cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk); }
    let taken = null, whole = false, why = '';
    try {
      taken = parser.finish();
      whole = snapshotIsWhole(taken);
      why = whole ? 'whole' : `nodes ${taken.nodes.length / taken.meta.node_fields.length} of ${taken.declared?.nodes}, edges ${taken.edges.length / taken.meta.edge_fields.length} of ${taken.declared?.edges}, gaps ${taken.fault?.gaps ?? 0}`;
    } catch (error) { why = String(error?.message ?? error); }
    console.error(`[heap-retainers] snapshot ${attempt}: ${chunks} chunks, ${chars} chars, ${why}`);
    if (taken) snapshot = taken;
    if (whole) break;
  }
  if (!snapshot) return Object.fromEntries(markerNames.map((name) => [name, []]));
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
