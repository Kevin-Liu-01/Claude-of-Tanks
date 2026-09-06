// Opt-in diagnosis only. No runtime imports or browser work at module load.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** Read native linked sources and existing scene-material links; never compile. */
export function collectResidencyPrograms() {
  const { renderer, scene, world } = window.__DEBUG;
  const gl = renderer.getContext();
  const programs = renderer.info.programs.map(program => ({
    id: program.id, name: program.name, usedTimes: program.usedTimes, cacheKey: program.cacheKey,
    vertexSource: gl.getShaderSource(program.vertexShader),
    fragmentSource: gl.getShaderSource(program.fragmentShader),
  }));
  const materials = new Map();
  function add(material, owner) {
    if (!material || !renderer.properties.has(material)) return;
    let row = materials.get(material.id);
    if (!row) {
      row = { id: material.id, name: material.name, type: material.type,
        cacheKey: material.customProgramCacheKey(), owners: [],
        programs: [...(renderer.properties.get(material).programs?.values() || [])].map(program => program.id) };
      materials.set(material.id, row);
    }
    if (!row.owners.includes(owner)) row.owners.push(owner);
  }
  function visit(object) {
    const lineage = [];
    for (let node = object; node; node = node.parent) lineage.push(node.name || node.type);
    const owner = lineage.reverse().join('/');
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) add(material, owner);
    add(object.customDepthMaterial, `${owner}/customDepthMaterial`);
    add(object.customDistanceMaterial, `${owner}/customDistanceMaterial`);
  }
  scene.traverse(visit);
  if (world?.group && !scene.getObjectById(world.group.id)) world.group.traverse(visit);
  return { programs, materials: [...materials.values()],
    ownerCoverage: 'Current scene and active world only; detached cached owners may be unmapped.' };
}

/** Preserve source text by content hash outside the scalar memory receipt. */
export function writeResidencyPrograms(inventory, directory, checkpoint) {
  fs.mkdirSync(path.join(directory, 'sources'), { recursive: true });
  const hash = value => createHash('sha256').update(value).digest('hex');
  const source = (text, stage) => {
    if (typeof text !== 'string' || !text) throw new Error('Native program shader source unavailable');
    const digest = hash(text), file = path.join(directory, 'sources', `${digest}.${stage}.glsl`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, text, { flag: 'wx' });
    else if (fs.readFileSync(file, 'utf8') !== text) throw new Error('Program source hash collision');
    return { hash: digest, bytes: Buffer.byteLength(text), file };
  };
  const programs = inventory.programs.map(({ vertexSource, fragmentSource, ...program }) => ({
    ...program, vertexSource: source(vertexSource, 'vert'), fragmentSource: source(fragmentSource, 'frag'),
  }));
  const file = path.join(directory, `${checkpoint}.programs.json`);
  fs.writeFileSync(file, JSON.stringify({ ...inventory, programs }, null, 2), { flag: 'wx' });
  return { file, programs: programs.length, mappedMaterials: inventory.materials.length };
}

/** Runs in the inspected page. Track scalar ownership plus WeakRefs, never roots. */
export function installResidencyGeometryTracker() {
  const renderer = window.__DEBUG.renderer;
  const original = renderer.renderBufferDirect;
  const entries = new Map();
  const rootRefs = new Map();
  let draws = 0, allocations = 0, disposals = 0;
  function ownerOf(object) {
    let owner = object.name || object.type || 'renderer';
    for (let node = object; node; node = node.parent) {
      if (node.name?.startsWith('world-')) {
        if (node.isGroup && !rootRefs.has(node.uuid)) {
          rootRefs.set(node.uuid, { uuid: node.uuid, name: node.name, ref: new WeakRef(node) });
        }
        return `${node.name}/${owner}`;
      }
      if (node.name) owner = node.name;
    }
    return owner;
  }
  function bytesOf(geometry) {
    const arrays = new Set(Object.values(geometry.attributes || {}).map(attribute =>
      (attribute.isInterleavedBufferAttribute ? attribute.data : attribute).array));
    if (geometry.index) arrays.add(geometry.index.array);
    let bytes = 0;
    for (const array of arrays) bytes += array?.byteLength || 0;
    return bytes;
  }
  renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    if (!entries.has(geometry.id)) {
      const id = geometry.id;
      const entry = { id, ref: new WeakRef(geometry), owner: ownerOf(object),
        type: geometry.type, bytes: bytesOf(geometry), vertices: geometry.attributes.position?.count || 0 };
      entries.set(id, entry);
      allocations++;
      // The callback captures an integer and the scalar tracker only, not
      // geometry/object/material. Removing it permits normal resume/reupload.
      const disposed = event => {
        event.target.removeEventListener('dispose', disposed);
        entries.delete(id);
        disposals++;
      };
      geometry.addEventListener('dispose', disposed);
    }
    draws++;
    return original.call(this, camera, scene, geometry, material, object, group);
  };
  window.__RESIDENCY_DIAGNOSTICS = {
    inventory() {
      const rows = [];
      const owners = {};
      for (const entry of entries.values()) {
        const { ref, ...row } = entry;
        row.cpuAlive = !!ref.deref();
        rows.push(row);
        const owner = owners[row.owner] ||= { geometries: 0, bytes: 0, collectedWithoutDispose: 0 };
        owner.geometries++; owner.bytes += row.bytes;
        if (!row.cpuAlive) owner.collectedWithoutDispose++;
      }
      const worlds = window.__DEBUG.scene.children.filter(object => object.name?.startsWith('world-'))
        .map(world => ({ name: world.name, uuid: world.uuid, visible: world.visible,
          terrain: world.children.find(child => child.name === 'terrain')?.userData.streamingStats || null }));
      const worldRoots = [];
      let worldRootsAlive = 0;
      for (const { uuid, name, ref } of rootRefs.values()) {
        const cpuAlive = !!ref.deref();
        if (cpuAlive) worldRootsAlive++;
        worldRoots.push({ uuid, name, cpuAlive });
      }
      return { draws, allocations, disposals, residentTracked: entries.size,
        rendererGeometries: renderer.info.memory.geometries, owners, worlds, rows,
        worldRoots, worldRootsAlive,
        worldRootsCoverage: 'World Groups encountered on first geometry upload; not unrendered constructed worlds.' };
    },
  };
}

/** Optional deterministic topology diagnosis via the existing countdown seam. */
export function warmResidencyTerrain() {
  const { world, camera } = window.__DEBUG;
  if (typeof world.warmTerrainLookahead !== 'function') throw new Error('Terrain warming API unavailable');
  let jobs = 0;
  for (let call = 0; call < 256; call++) {
    const built = world.warmTerrainLookahead(camera.position, 1);
    if (built === 0) return { jobs, exhausted: true };
    if (built !== 1) throw new Error('Terrain warming violated its single-job diagnostic budget');
    jobs += built;
  }
  throw new Error('Terrain warming did not reach a finite settled topology');
}

/** Native V8 evidence streams to disk, not into a retained browser JS handle. */
export async function writeResidencyHeapSnapshot(cdp, file) {
  const descriptor = fs.openSync(file, 'wx');
  let bytes = 0;
  const append = event => { bytes += fs.writeSync(descriptor, event.chunk); };
  cdp.on('HeapProfiler.addHeapSnapshotChunk', append);
  try {
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, exposeInternals: true });
  } finally {
    cdp.off('HeapProfiler.addHeapSnapshotChunk', append);
    fs.closeSync(descriptor);
  }
  return { file, bytes };
}

function heapLayout(snapshot) {
  const meta = snapshot.snapshot.meta;
  const nf = meta.node_fields, ef = meta.edge_fields;
  const nodeType = nf.indexOf('type'), nodeName = nf.indexOf('name');
  const nodeId = nf.indexOf('id'), nodeSize = nf.indexOf('self_size'), edgeCount = nf.indexOf('edge_count');
  const edgeType = ef.indexOf('type'), edgeName = ef.indexOf('name_or_index'), edgeTo = ef.indexOf('to_node');
  if ([nodeType, nodeName, nodeId, nodeSize, edgeCount, edgeType, edgeName, edgeTo].some(index => index < 0)) {
    throw new Error('Unsupported native heap snapshot field layout');
  }
  return { nf, ef, nodeType, nodeName, nodeId, nodeSize, edgeCount, edgeType, edgeName, edgeTo,
    types: meta.node_types[nodeType], edgeTypes: meta.edge_types[edgeType] };
}

function visitHeapEdges(snapshot, layout, visit) {
  const { nodes, edges } = snapshot;
  let cursor = 0;
  for (let offset = 0; offset < nodes.length; offset += layout.nf.length) {
    for (let edge = 0; edge < nodes[offset + layout.edgeCount]; edge++, cursor += layout.ef.length) {
      visit(offset, cursor, edges[cursor + layout.edgeTo]);
    }
  }
}

/** Offline class/code and direct world-root retainers from the native format. */
export function summarizeResidencyHeap(snapshot) {
  const { nodes, edges, strings } = snapshot;
  const layout = heapLayout(snapshot);
  const { nf, nodeType, nodeName, nodeId, nodeSize, edgeType, edgeName, types, edgeTypes } = layout;
  const byType = {}, byClass = {}, worlds = new Map();
  for (let offset = 0; offset < nodes.length; offset += nf.length) {
    const type = types[nodes[offset + nodeType]], name = strings[nodes[offset + nodeName]];
    const size = nodes[offset + nodeSize];
    for (const [table, key] of [[byType, type], [byClass, `${type}/${name}`]]) {
      const bucket = table[key] ||= { count: 0, bytes: 0 };
      bucket.count++; bucket.bytes += size;
    }
  }
  visitHeapEdges(snapshot, layout, (offset, cursor, target) => {
    if (edgeTypes[edges[cursor + edgeType]] !== 'property' || strings[edges[cursor + edgeName]] !== 'name') return;
    const value = strings[nodes[target + nodeName]];
    if (types[nodes[target + nodeType]] === 'string' && value.startsWith('world-')) {
      worlds.set(offset, { id: nodes[offset + nodeId], class: strings[nodes[offset + nodeName]], name: value, retainers: [] });
    }
  });
  visitHeapEdges(snapshot, layout, (offset, cursor, target) => {
    const world = worlds.get(target);
    if (!world || world.retainers.length >= 24) return;
    const kind = edgeTypes[edges[cursor + edgeType]];
    world.retainers.push({ id: nodes[offset + nodeId], type: types[nodes[offset + nodeType]],
      name: strings[nodes[offset + nodeName]], edgeType: kind,
      edge: ['element', 'hidden'].includes(kind) ? edges[cursor + edgeName] : strings[edges[cursor + edgeName]] });
  });
  return { nodeCount: nodes.length / nf.length, byType,
    byClass: Object.fromEntries(Object.entries(byClass).sort((a, b) => b[1].bytes - a[1].bytes)),
    worldRoots: [...worlds.values()] };
}
