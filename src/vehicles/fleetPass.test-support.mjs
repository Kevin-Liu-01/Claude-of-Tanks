// One fleet construction for several fleet audits (gate plan "one fleet pass", 2026-10-02).
//
// Ten receipts used to rebuild the fleet each, one full sweep per check. A fleet audit is { check(id, tank),
// finish() }, the shape of createMachineGunAttachmentAudit, createTrackEndWrapAudit and the geometry ledger's audit.
// runFleetPass builds every roster tank ONCE with one set of build options (createTank from tankFactory.ts, passed in
// by the pass receipt) and hands that build to every audit in the declared order; each audit still runs all of its
// assertions on every tank it covers. The build options stay the
// audits' own: the audits that compare against generated seats and calibrations keep the factory default (seed 4000),
// the ledger keeps its unbatched seed-4242 HIGH and LOW builds, the floor check keeps its static preview, so a pass
// groups only audits that already read identical builds (fleetPassDefault, fleetPassHigh, fleetPassLow).
//
// Rules of the shared build:
// - An audit sees the build as its own receipt did. Synchronous checks run back to back without yielding, so they see
//   the build as createTank returned it; a few builders (kf51, kf51b and the PT-91M) queue a microtask that rewrites
//   their merged meshes' UVs or vertex colors after createTank returns. Before the first async check of a build the pass
//   yields one microtask turn, as those receipts did with their `await Promise.resolve()`, so async checks and every
//   check declared after one see the build after it. The pass never updates matrices for an audit.
// - An audit that poses the model (yaw, pitch, ERA strips, test negatives) restores it before returning or is declared
//   last. After every audit but the last, the pass compares every node's parent, visibility and local transform, and
//   every mesh's geometry, attribute bytes, index, instance matrices and materials, with what the audit received, and
//   fails the audit that left a difference.
// - An audit that throws stops receiving tanks, as its receipt stopped at its first failure; the other audits go on.
//   A build an audit may have left half-posed is discarded and the remaining audits of that tank get a fresh build.
//   finish() runs only for audits that never failed. The pass throws once at the end, naming every failed audit and
//   tank, with each original error printed in full above it.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const POSE_FIELDS = ['parent', 'visible', 'position.x', 'position.y', 'position.z', 'quaternion.x', 'quaternion.y',
  'quaternion.z', 'quaternion.w', 'scale.x', 'scale.y', 'scale.z'];
const bytesOf = (array) => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);

// Do not serialize Three.js objects with toJSON(): that drops semantic userData,
// live shader hooks and several material fields. Read own data properties without
// invoking getters; references/cycles are common in fitting and damage receipts.
// Scene and geometry references stop here: their mutable state is walked below.
const identities = new WeakMap();
let nextIdentity = 0;
const identityOf = (value) => {
  if (!identities.has(value)) identities.set(value, ++nextIdentity);
  return identities.get(value);
};
function hashState(hash, value, seen = new Map()) {
  const type = typeof value;
  if (value === null || (type !== 'object' && type !== 'function')) {
    hash.update(`${type}:${Object.is(value, -0) ? '-0' : String(value)};`);
    return;
  }
  if (type === 'function' || value.isObject3D || value.isBufferGeometry) {
    hash.update(`identity:${identityOf(value)};`);
    return;
  }
  if (seen.has(value)) { hash.update(`ref:${seen.get(value)};`); return; }
  seen.set(value, seen.size);
  hash.update(`${value.constructor?.name ?? 'object'}{`);
  hashContents(hash, value, seen);
  hash.update('}');
}

function hashContents(hash, value, seen) {
  if (ArrayBuffer.isView(value)) { hash.update(bytesOf(value)); return; }
  if (value instanceof ArrayBuffer) { hash.update(new Uint8Array(value)); return; }
  if (value instanceof Map) {
    for (const [key, item] of value) { hashState(hash, key, seen); hashState(hash, item, seen); }
    return;
  }
  if (value instanceof Set) {
    for (const item of value) hashState(hash, item, seen);
    return;
  }
  for (const key of Object.keys(value).sort()) {
    hash.update(`${JSON.stringify(key)}:`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if ('value' in descriptor) hashState(hash, descriptor.value, seen);
    else { hashState(hash, descriptor.get, seen); hashState(hash, descriptor.set, seen); }
  }
}

/** Every node's identity, parent, visibility and local transform, in traversal order. Reads only. */
function poseOf(root) {
  const rows = [];
  root.traverse((node) => rows.push([node, node.parent, node.visible, ...node.position.toArray(),
    ...node.quaternion.toArray(), ...node.scale.toArray()]));
  return rows;
}

/** sha256 of every mesh's geometry and material identity, attribute and index bytes and instance data. Reads only. */
function meshFingerprint(root) {
  const hash = createHash('sha256');
  const materials = new Set();
  root.traverse((object) => {
    hashState(hash, [object.name, object.layers?.mask, object.castShadow, object.receiveShadow,
      object.renderOrder, object.frustumCulled, object.userData]);
    const geometry = object.geometry;
    if (!geometry?.attributes) return;
    hashState(hash, geometry.userData);
    hash.update(`${object.uuid}|${geometry.uuid}|${object.isInstancedMesh ? object.count : '-'}|`
      + `${JSON.stringify(geometry.drawRange)}|${JSON.stringify(geometry.groups)}|`);
    for (const name of Object.keys(geometry.attributes).sort()) {
      const attribute = geometry.attributes[name], array = attribute.array ?? attribute.data?.array;
      hash.update(`${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.usage}:`);
      if (array) hash.update(bytesOf(array));
    }
    if (geometry.index) hash.update(bytesOf(geometry.index.array));
    if (object.isInstancedMesh) {
      hash.update(bytesOf(object.instanceMatrix.array));
      if (object.instanceColor) hash.update(bytesOf(object.instanceColor.array));
    }
    for (const material of [].concat(object.material ?? [])) {
      hash.update(`material:${identityOf(material)};`);
      // Shared paint can occur on hundreds of meshes. Hash it once per snapshot,
      // including texture bindings/transforms, uniforms, colors and shader hooks.
      if (!materials.has(material)) {
        materials.add(material);
        hashState(hash, material);
        hashState(hash, [material.onBeforeCompile, material.customProgramCacheKey]);
      }
    }
  });
  return hash.digest('hex');
}

const isAsyncFunction = (fn) => fn?.constructor?.name === 'AsyncFunction';

function pathOf(node) {
  const names = [];
  for (let at = node; at; at = at.parent) names.push(at.name || at.type);
  return names.reverse().join('/');
}

/** The first difference between two pose snapshots, or null. */
function poseChange(before, after) {
  if (before.length !== after.length) return `${before.length} nodes became ${after.length}`;
  for (let row = 0; row < before.length; row++) {
    const [node, ...was] = before[row], [other, ...now] = after[row];
    if (node !== other) return `node ${row} is ${pathOf(other)}, was ${pathOf(node)}`;
    const field = was.findIndex((value, at) => !Object.is(value, now[at]));
    if (field >= 0) return `${pathOf(node)} ${POSE_FIELDS[field]}`;
  }
  return null;
}

/** An error's message (with the values Node prints into it), indented under its audit line, at most maxLines long. */
function messageOf(error, maxLines = 24) {
  const lines = String(error?.message ?? error).replace(/\s+$/, '').split('\n');
  return (lines.length > maxLines ? [...lines.slice(0, maxLines), `… ${lines.length - maxLines} more lines`] : lines)
    .map((line, index) => (index && line ? `      ${line}` : line)).join('\n');
}

function buildForAudits(id, pending, create, build, stats, fail) {
  const at = performance.now();
  try { const tank = create(id, null, build); stats.builds++; return tank; }
  catch (error) { for (const entry of pending) fail(entry, id, error); return null; }
  finally { stats.buildMs += performance.now() - at; }
}

function changedBuildError(id, name, change) {
  return new assert.AssertionError({
    message: `${id}: ${name} left the shared build changed (${change}); restore what the audit poses, `
      + 'or declare it last',
  });
}

function sharedBuildChange(tank, guarded, pose, meshes, stats) {
  if (!guarded) return null;
  const at = performance.now();
  try {
    return poseChange(pose, poseOf(tank.root))
      ?? (meshFingerprint(tank.root) === meshes ? null : 'mesh geometry, instances or materials/metadata');
  } finally { stats.guardMs += performance.now() - at; }
}

async function checkTank(id, entries, create, build, stats, fail) {
  const pending = entries.filter((entry) => !entry.failed && (!entry.covers || entry.covers.has(id)));
  const firstAsync = pending.findIndex((entry) => isAsyncFunction(entry.audit.check));
  let tank = null, settled = false;
  const discard = () => {
    try { tank?.dispose(); } finally { tank = null; }
  };
  try {
    for (let index = 0; index < pending.length; index++) {
      const entry = pending[index];
      if (!tank) {
        tank = buildForAudits(id, pending.slice(index), create, build, stats, fail);
        if (!tank) break;
        settled = false;
      }
      if (!settled && firstAsync >= 0 && index >= firstAsync) {
        await Promise.resolve();
        settled = true;
      }
      const guarded = index < pending.length - 1;
      let at = performance.now();
      const pose = guarded ? poseOf(tank.root) : null, meshes = guarded ? meshFingerprint(tank.root) : null;
      stats.guardMs += performance.now() - at;
      at = performance.now();
      try {
        const result = entry.audit.check(id, tank);
        if (typeof result?.then === 'function') await result;
      } catch (error) {
        fail(entry, id, error);
        discard();
        continue;
      } finally { entry.ms += performance.now() - at; }
      const change = sharedBuildChange(tank, guarded, pose, meshes, stats);
      if (change) {
        fail(entry, id, changedBuildError(id, entry.name, change));
        discard();
      }
    }
  } finally { discard(); }
}

/**
 * @param {{ name: string, build: object, ids: Iterable<string>,
 *   audits: { name: string, ids?: Iterable<string>, create: () => { check(id, tank): unknown, finish?(): unknown } }[],
 *   createTank: (id: string, engine: null, build: object) => { root: object, dispose(): void },
 *   log?: typeof console.log, logError?: typeof console.error }} pass
 * @returns {Promise<{ tanks: number, builds: number }>} once every audit finished; throws when any audit failed
 */
export async function runFleetPass({ name, build, ids, audits, createTank: create,
  log = console.log, logError = console.error }) {
  assert.equal(typeof create, 'function', `${name}: pass createTank from tankFactory.ts`);
  assert.ok(audits.length > 0 && new Set(audits.map((audit) => audit.name)).size === audits.length,
    `${name}: name each fleet audit once`);
  const roster = [...ids];
  const failures = [];
  const fail = (entry, id, error) => {
    entry.failed = true;
    failures.push({ audit: entry.name, id, error });
    logError(`[fleet-pass] ${name}: ${entry.name} failed at ${id}: ${String(error?.message ?? error).split('\n')[0]}`);
  };
  const entries = [];
  for (const { name: auditName, ids: covered, create: createAudit } of audits) {
    const entry = { name: auditName, covers: covered ? new Set(covered) : null, audit: null, failed: false, ms: 0 };
    entries.push(entry);
    try { entry.audit = await createAudit(); } catch (error) { fail(entry, 'setup', error); }
  }
  const started = performance.now();
  const stats = { builds: 0, buildMs: 0, guardMs: 0 };
  for (const id of roster) await checkTank(id, entries, create, build, stats, fail);
  const { builds, buildMs, guardMs } = stats;
  for (const entry of entries) {
    if (entry.failed) continue;
    const at = performance.now();
    try { await entry.audit.finish?.(); } catch (error) { fail(entry, 'fleet', error); }
    finally { entry.ms += performance.now() - at; }
  }
  const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;
  log(`[fleet-pass] ${name}: ${roster.length} tanks, ${builds} builds ${seconds(buildMs)}, guards ${seconds(guardMs)}, `
    + `audits ${entries.map((entry) => `${entry.name} ${seconds(entry.ms)}`).join(', ')}; ${seconds(performance.now() - started)}`);
  if (failures.length) {
    for (const failure of failures) logError(`\n[fleet-pass] ${name}: ${failure.audit} at ${failure.id}:`, failure.error);
    throw new assert.AssertionError({
      message: `${name}: ${new Set(failures.map((failure) => failure.audit)).size} of ${entries.length} fleet audits failed\n`
        + failures.map((failure) => `  [${failure.audit}] ${failure.id}: ${messageOf(failure.error)}`).join('\n'),
    });
  }
  return { tanks: roster.length, builds };
}
