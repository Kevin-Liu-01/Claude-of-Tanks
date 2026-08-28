import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vehicleRoot = path.join(root, 'src', 'vehicles');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const failures = [];
const files = walk(vehicleRoot);
const externalGeometryExt = /\.(?:glb|gltf|fbx|obj|stl|dae|blend|3ds|ply)$/i;

// Local ignored comparison oracles are permitted authoring inputs, but an
// external model file must never become a tracked/shippable asset again.
// Runtime world props use their attributed baked JSON representation.
try {
  const trackedExternalGeometry = execFileSync(
    'git',
    ['ls-files', '-z'],
    { cwd: root, encoding: 'utf8' },
  ).split('\0').filter(Boolean).filter((file) => externalGeometryExt.test(file));
  for (const file of trackedExternalGeometry) {
    failures.push(`${file}: tracked external model geometry is forbidden`);
  }
} catch (error) {
  failures.push(`unable to audit tracked external model geometry (${error.message})`);
}

for (const file of files) {
  const rel = path.relative(root, file);
  if (/source-geometry\.js$/i.test(file)) {
    failures.push(`${rel}: baked source-geometry payload is forbidden`);
  }
  if (!file.endsWith('.js')) continue;
  const source = fs.readFileSync(file, 'utf8');
  if (/ALLOW_LOCAL_RECOVERED_MODELS\s*=\s*true/.test(source)) {
    failures.push(`${rel}: local recovered-model runtime switch is enabled`);
  }
  if (/from\s+['"][^'"]*source-geometry\.js['"]/.test(source)) {
    failures.push(`${rel}: imports baked source geometry`);
  }
  // A copied mesh can be hidden without a source-geometry filename. Reject
  // the two common payload forms as well: runtime base64 decoding and giant
  // encoded string literals. Playable geometry must remain readable authored
  // construction code built from our primitives, not an opaque vertex blob.
  if (/\batob\s*\(|Buffer\.from\s*\([^,]+,\s*['"]base64['"]/.test(source)) {
    failures.push(`${rel}: decodes an opaque/base64 geometry payload`);
  }
  if (/[`'"][A-Za-z0-9+/]{4096,}={0,2}[`'"]/.test(source)) {
    failures.push(`${rel}: contains a giant encoded payload literal`);
  }
  // Likewise, a multi-thousand-value literal typed array is source mesh data
  // in another costume. Small arrays used by authored lofts remain legal.
  for (const match of source.matchAll(/(?:Float32Array|Uint(?:16|32)Array)\s*\(\s*\[([\s\S]*?)\]\s*\)/g)) {
    const values = match[1].split(',').length;
    if (values > 1024) {
      failures.push(`${rel}: contains an opaque ${values}-value typed-array mesh payload`);
      break;
    }
  }
  // Builder-map names are part of the provenance contract. A function may
  // be retained as archaeological dead code, but no playable mapping may
  // resolve through a Source/OwnerSource-labelled implementation. This
  // catches the exact class that previously let a procedural fallback look
  // native in MODEL_SOURCE while still being wired through a source-rebuild
  // entry point.
  if (/\bbuild\s*:\s*(?:build|create)[A-Za-z0-9_$]*(?:Owner)?Source[A-Za-z0-9_$]*/i.test(source)
      || /:\s*(?:build|create)[A-Za-z0-9_$]*(?:Owner)?Source[A-Za-z0-9_$]*\s*[,}]/i.test(source)) {
    failures.push(`${rel}: playable builder map resolves through a Source-labelled implementation`);
  }
}

// Loading the factory also loads every extension pack; those packs append
// their ids/specs to the shared tables during module initialization.
await import(pathToFileURL(path.join(vehicleRoot, 'tankFactory.ts')).href);
const specsUrl = pathToFileURL(path.join(vehicleRoot, 'specs.js')).href;
const { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS, RETIRED_EXTERNAL_PLACEHOLDER_IDS } = await import(specsUrl);
// No MODEL_SOURCE row is the original procedural default. An explicit row
// is legal only when it also says procedural (usually to carry candidateGlb).
const nonNative = ALL_TANK_IDS.filter((id) => MODEL_SOURCE[id] && MODEL_SOURCE[id].source !== 'procedural');
for (const id of nonNative) {
  failures.push(`${id}: battle playable resolves to ${MODEL_SOURCE[id]?.source ?? 'unknown'} geometry`);
}
for (const id of ALL_TANK_IDS) {
  if (MODEL_SOURCE[id]?.glb?.path) {
    failures.push(`${id}: battle playable retains an active external geometry path (${MODEL_SOURCE[id].glb.path})`);
  }
}

for (const id of ALL_TANK_IDS) {
  const spec = TANK_SPECS[id];
  if (!spec) {
    failures.push(`${id}: selectable id has no spec`);
    continue;
  }
  if (spec.community) failures.push(`${id}: selectable spec carries obsolete community/source authorship`);
  if (String(spec.nation || '').toLowerCase() === 'community') {
    failures.push(`${id}: selectable spec uses the Community nation bucket`);
  }
  if (spec.authorship?.geometry !== 'first-party-procedural'
      || spec.authorship?.runtimeExternalGeometry !== false) {
    failures.push(`${id}: selectable spec lacks the sealed first-party procedural authorship contract`);
  }
}
for (const id of RETIRED_EXTERNAL_PLACEHOLDER_IDS) {
  if (ALL_TANK_IDS.includes(id)) failures.push(`${id}: retired external placeholder is selectable`);
}

if (failures.length) {
  console.error('Native-playable provenance audit FAILED:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const candidateCount = ALL_TANK_IDS.filter((id) => MODEL_SOURCE[id]?.candidateGlb).length;
console.log(`Native-playable provenance audit PASS: ${ALL_TANK_IDS.length} first-party procedural battle playables, 0 GLB-sourced, ${candidateCount} isolated comparison candidates.`);
