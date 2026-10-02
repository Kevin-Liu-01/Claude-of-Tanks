// The fleet geometry ledger's digest, roster, comparison and in-receipt audit (2026-10-01, owner: "Retire frozen
// pins"). One row per playable tank at HIGH and LOW quality digests every mesh a build emits, rolled up per rig group
// (hull / turret / gun / running gear / other) and per tank, so a geometry change names the tanks and groups it moved.
//
// No child processes and no writes here: receipts import this module without widening their cached input closure.
// Measuring and re-pinning live in the CLI, tools/fleet-geometry-ledger.mjs (npm run tank:geometry:check|update).
//
// Texture pixels are deliberately outside the digest (canvas rasterisers differ across platforms); generated interior
// fills are outside it as well (they load on demand). Everything else a build emits is inside.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FLEET_GROUP_BY_ID } from '../src/vehicles/fleetManifest.ts';

export const LEDGER_PATH = fileURLToPath(new URL('../docs/references/fleet-geometry-ledger.json', import.meta.url));
export const LEDGER_QUALITIES = Object.freeze(['high', 'low']);
const LEDGER_BUILD = Object.freeze({ proceduralOnly: true, camoSeed: 4242, geometryReceipt: true, batchStatic: false });
const GROUPS = Object.freeze(['hull', 'turret', 'gun', 'runningGear', 'other']);
const RUNNING_GEAR = /gear|wheel|track|shoe|sprocket|idler|roller|link/i;
const sha = () => createHash('sha256');
const short = hash => hash.digest('hex').slice(0, 16);
const bytesOf = array => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);

/**
 * The build every ledger row digests: the unbatched HIGH model wheelQuality.selftest reads and the LOW model
 * gunArticulation.selftest reads (both verify their rows in npm test without a second fleet build).
 */
export function ledgerBuildOptions(quality) {
  if (!LEDGER_QUALITIES.includes(quality)) throw new TypeError(`fleet geometry ledger: unknown quality '${quality}'`);
  return { ...LEDGER_BUILD, quality };
}

function hex(color) { return color && typeof color.getHex === 'function' ? color.getHex() : null; }
function materialRecord(material) {
  if (!material) return null;
  const textureSlots = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap']
    .filter(slot => material[slot]);
  return [material.type, material.name, hex(material.color), hex(material.emissive), material.emissiveIntensity ?? null,
    material.roughness ?? null, material.metalness ?? null, material.side, material.transparent, material.opacity,
    material.alphaTest, material.vertexColors, material.flatShading ?? null, material.depthWrite, material.colorWrite,
    material.visible, textureSlots];
}
function groupOf(object) {
  if (RUNNING_GEAR.test(object.name || '')) return 'runningGear';
  for (let owner = object.parent; owner; owner = owner.parent) {
    if (owner.name === 'rig_gun') return 'gun';
    if (owner.name === 'rig_turret') return 'turret';
    if (owner.name === 'rig_hull') return 'hull';
  }
  return 'other';
}
function pathOf(object) {
  const names = [];
  for (let node = object; node; node = node.parent) names.push(node.name || node.type);
  return names.reverse().join('/');
}

/** Digest one freshly built tank root (before any posing). Mesh order independent. */
export function digestTankRoot(root) {
  root.updateMatrixWorld(true);
  const meshes = [];
  let vertices = 0, triangles = 0;
  root.traverse(object => {
    if (!(object.isMesh || object.isInstancedMesh || object.isBatchedMesh) || !object.geometry?.getAttribute) return;
    if (object.userData?.interiorFill) return;
    const geometry = object.geometry, hash = sha();
    hash.update(JSON.stringify([pathOf(object), object.type, object.visible, object.castShadow, object.receiveShadow,
      object.renderOrder, object.isInstancedMesh ? object.count : null, geometry.groups, geometry.drawRange]));
    for (const name of Object.keys(geometry.attributes).sort()) {
      const attribute = geometry.attributes[name], array = attribute.array ?? attribute.data?.array;
      hash.update(JSON.stringify([name, attribute.itemSize, attribute.normalized, array?.constructor?.name]));
      if (array) hash.update(bytesOf(array));
    }
    if (geometry.index) hash.update(bytesOf(geometry.index.array));
    hash.update(bytesOf(new Float32Array(object.matrixWorld.elements)));
    if (object.isInstancedMesh) {
      hash.update(bytesOf(object.instanceMatrix.array.subarray(0, object.count * 16)));
      if (object.instanceColor) hash.update(bytesOf(object.instanceColor.array.subarray(0, object.count * 3)));
    }
    hash.update(JSON.stringify([].concat(object.material).map(materialRecord)));
    const copies = object.isInstancedMesh ? object.count : 1;
    const position = geometry.getAttribute('position');
    vertices += (position?.count ?? 0) * copies;
    triangles += Math.floor((geometry.index?.count ?? position?.count ?? 0) / 3) * copies;
    meshes.push({ group: groupOf(object), digest: hash.digest('hex') });
  });
  const groups = {};
  for (const group of GROUPS) {
    const hash = sha();
    for (const digest of meshes.filter(mesh => mesh.group === group).map(mesh => mesh.digest).sort()) hash.update(digest);
    groups[group] = short(hash);
  }
  const total = sha();
  for (const digest of meshes.map(mesh => mesh.digest).sort()) total.update(digest);
  return { meshes: meshes.length, vertices, triangles, digest: short(total), groups };
}

/** Every fleet id (the demand-loaded manifest; equal to ALL_TANK_IDS once the factory registered every group). */
export function fleetRoster() {
  return Object.keys(FLEET_GROUP_BY_ID).sort();
}

export function readFleetGeometryLedger(path = LEDGER_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Compare measured rows with the ledger. Returns human-readable differences (empty when everything matches). */
export function compareFleetGeometry(ledger, rows, { roster = null, qualities = LEDGER_QUALITIES } = {}) {
  const problems = [];
  if (ledger.build?.camoSeed !== LEDGER_BUILD.camoSeed) problems.push(`ledger camo seed ${ledger.build?.camoSeed} != ${LEDGER_BUILD.camoSeed}`);
  if (roster) {
    for (const id of roster) if (!ledger.tanks[id]) problems.push(`${id}: missing from the ledger`);
    for (const id of Object.keys(ledger.tanks).sort()) if (!roster.includes(id)) problems.push(`${id}: in the ledger but not in the playable roster`);
  }
  for (const [id, row] of Object.entries(rows)) {
    for (const quality of qualities) {
      const expected = ledger.tanks[id]?.[quality], actual = row[quality];
      if (!expected || !actual || expected.digest === actual.digest) continue;
      const moved = GROUPS.filter(group => expected.groups?.[group] !== actual.groups[group]);
      problems.push(`${id}/${quality}: geometry moved (${moved.join(', ') || 'mesh census'}; meshes ${expected.meshes}->${actual.meshes}, `
        + `vertices ${expected.vertices}->${actual.vertices}, triangles ${expected.triangles}->${actual.triangles})`);
    }
  }
  return problems;
}

/** One line per tank and quality, so a re-pin diff names exactly the rows that moved. */
export function serializeFleetGeometryLedger(tankRows) {
  const header = JSON.stringify({
    schemaVersion: 1,
    generator: 'node tools/fleet-geometry-ledger.mjs --update',
    build: LEDGER_BUILD,
    qualities: LEDGER_QUALITIES,
    algorithm: 'per mesh: sha256(path, type, visibility/shadow flags, render order, instance count, groups, draw range, '
      + 'every attribute (name, layout, bytes), index bytes, Float32 world matrix, instance matrices/colours, material '
      + 'scalars and texture-slot presence); per group and per tank: sha256 of the sorted mesh digests (first 16 hex). '
      + 'Interior fills and texture pixels excluded.',
  }, null, 1);
  const tanks = Object.keys(tankRows).sort().map(id => {
    const qualities = Object.keys(tankRows[id]).sort().map(quality => `   ${JSON.stringify(quality)}: ${JSON.stringify(tankRows[id][quality])}`);
    return `  ${JSON.stringify(id)}: {\n${qualities.join(',\n')}\n  }`;
  });
  return `${header.slice(0, -2)},\n "tanks": {\n${tanks.join(',\n')}\n }\n}\n`;
}

/**
 * Verify ledger rows inside a receipt that already builds the whole fleet with the ledger's options: record each fresh
 * build before posing it; finish() lists every moved row, every roster tank the sweep never built and roster drift.
 */
export function createFleetGeometryLedgerAudit(options) {
  const expected = ledgerBuildOptions(options.quality);
  for (const key of new Set([...Object.keys(expected), ...Object.keys(options)])) {
    if (options[key] !== expected[key]) {
      throw new Error(`fleet geometry ledger audit: build option ${key}=${options[key]} differs from the ledger's ${expected[key]}`);
    }
  }
  const ledger = readFleetGeometryLedger(), rows = {};
  return {
    record(id, tank) { rows[id] = { [options.quality]: digestTankRoot(tank.root) }; },
    finish() {
      const roster = fleetRoster();
      const problems = compareFleetGeometry(ledger, rows, { roster, qualities: [options.quality] });
      for (const id of roster) if (!rows[id]) problems.push(`${id}/${options.quality}: not built by this sweep`);
      return { problems, checked: roster.filter(id => rows[id]).length };
    },
  };
}
