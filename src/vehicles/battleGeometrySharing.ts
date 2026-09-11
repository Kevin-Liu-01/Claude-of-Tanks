import { BufferGeometry, Mesh, StaticDrawUsage, type Object3D } from 'three';

// These final rigid stocks move through object/instance matrices. Animated
// carrier/shoe, thrown-track, ERA, shadow-batch and terrain buffers are excluded.
const RIGID_STOCK = /^(?:gear(?:RoadWheel(?:Tires|Discs(?:Recessed)?|Insets|Recesses)|Suspension(?:Links|JointBosses)|ReturnRoller(?:Tires|Discs)|EndWheel(?:Body|Hardware))|fitting_.+|vehicleMarking_.+)$/;
interface Entry { geometry: BufferGeometry; refs: number; bytes: Uint8Array[] }
const entries = new Map<string, Entry[]>();

function candidate(geometry: BufferGeometry): { key: string; bytes: Uint8Array[] } | null {
  if (Object.keys(geometry.morphAttributes).length || Object.keys(geometry.userData).length
    || geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return null;
  const bytes: Uint8Array[] = [], layout: string[] = [];
  let hash = 2166136261;
  for (const [name, attribute] of [...Object.entries(geometry.attributes),
    ...(geometry.index ? [['index', geometry.index] as const] : [])].sort(([a],[b])=>a.localeCompare(b))) {
    if ('isInterleavedBufferAttribute' in attribute || attribute.usage !== StaticDrawUsage) return null;
    const view = new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength);
    bytes.push(view);
    layout.push(`${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}:${view.length}`);
    // A bounded fingerprint only shortlists candidates; full byte equality
    // below decides sharing, including deliberate fingerprint collisions.
    for (let i=0,step=Math.max(1,Math.ceil(view.length/64));i<view.length;i+=step)
      hash = Math.imul(hash ^ view[i], 16777619);
  }
  return { key: `${layout.join('|')}|${JSON.stringify([geometry.groups,geometry.boundingBox,geometry.boundingSphere])}|${hash >>> 0}`, bytes };
}
function equalBytes(a: readonly Uint8Array[], b: readonly Uint8Array[]): boolean {
  return a.length === b.length && a.every((view,index) => view.length === b[index].length
    && view.every((value,offset) => value === b[index][offset]));
}

/** Share only byte-identical final rigid stocks in battle visuals. Restore
 * the original per-visual owners before existing disposal walks run.
 * Independent backing avoids coupling the original disposal path to pooled
 * WebGL attributes. Original construction buffers remain owned by each visual.
 * Pool entries exist only while a live visual holds a lease; no idle global cache. */
export function shareBattleGeometry(root: Object3D): () => void {
  const uses = new Map<BufferGeometry, Mesh[]>();
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const meshes=uses.get(object.geometry) ?? []; meshes.push(object); uses.set(object.geometry,meshes);
  });
  const leased: Array<{ source: BufferGeometry; meshes: Mesh[]; entry: Entry; key: string }> = [];
  try {
    for (const [source,meshes] of uses) {
      if (meshes.some(mesh => !RIGID_STOCK.test(mesh.name) || mesh.userData.__kitMerged
        || mesh.userData.__cotTrackRuntimeClone || mesh.userData.__cotSharedAttributeView)) continue;
      const value=candidate(source); if (!value) continue;
      const bucket=entries.get(value.key) ?? [];
      let entry=bucket.find(existing=>equalBytes(existing.bytes,value.bytes));
      if (!entry) {
        const geometry = source.clone();
        const attributes = [...Object.entries(geometry.attributes),
          ...(geometry.index ? [['index', geometry.index] as const] : [])];
        const canonicalBytes = attributes.sort(([a], [b]) => a.localeCompare(b))
          .map(([, attribute]) => new Uint8Array(attribute.array.buffer,
            attribute.array.byteOffset, attribute.array.byteLength));
        entry = { geometry, refs: 0, bytes: canonicalBytes };
        bucket.push(entry);
        entries.set(value.key, bucket);
      }
      entry.refs++;
      leased.push({source,meshes,entry,key:value.key});
      for (const mesh of meshes) mesh.geometry=entry.geometry;
    }
  } catch(error) { release(); throw error; }
  function release(): void {
    for (const {source,meshes,entry,key} of leased.splice(0)) {
      for (const mesh of meshes) if (mesh.geometry===entry.geometry) mesh.geometry=source;
      if (--entry.refs) continue;
      const bucket=entries.get(key)!; bucket.splice(bucket.indexOf(entry),1);
      if (!bucket.length) entries.delete(key);
      entry.geometry.dispose();
    }
  }
  return release;
}

/** Construction-only diagnostic; does not retain owners or scene references. */
export function battleGeometrySharingStats(): { geometries: number; leases: number; attributeBytes: number } {
  let geometries=0, leases=0, attributeBytes=0;
  for (const bucket of entries.values()) for (const entry of bucket) {
    geometries++; leases+=entry.refs;
    attributeBytes+=entry.bytes.reduce((sum,view)=>sum+view.byteLength,0);
  }
  return {geometries,leases,attributeBytes};
}
