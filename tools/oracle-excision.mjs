// tools/oracle-excision.mjs — BUILD-STANDARD §E oracle repair by excision (release 270, Main 2026-11-06): a registered
// print that carries parts the vehicle does not (loose rounds or tubes modelled on the ground beside it) is re-exported
// without them, every other node, name and transform kept, so its registration (turret/gun nodes, yaw) stands as it was.
// The pristine file stays where it is (the §E .bak); the excised file is a new, separately pinned oracle
// (tools/oracle-pins.mjs) whose recipe under docs/references/oracle-excisions/ is its provenance row: the source and its
// sha256, each removed node and why, and the output's sha256. The export is byte-idempotent (verified against the
// recipe), untextured (GLTFLoader cannot decode images in Node; the gate's masks read geometry).
//   node tools/oracle-excision.mjs --recipe=docs/references/oracle-excisions/<name>.json [--check]
// --check rebuilds in memory and compares the sha256 without writing.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

/** The recipe's shape, or the first reason it is not one. */
export function recipeError(recipe) {
  if (!recipe || typeof recipe !== 'object') return 'not an object';
  for (const key of ['source', 'output']) {
    if (typeof recipe[key] !== 'string' || !/^\/models\/community-candidates\/[a-z0-9_.-]+\.glb$/.test(recipe[key]))
      return `${key}: a /models/community-candidates/*.glb path`;
  }
  if (recipe.source === recipe.output) return 'the output must not overwrite the pristine source';
  for (const key of ['sourceSha256', 'outputSha256']) if (!/^[0-9a-f]{64}$/.test(recipe[key] ?? '')) return `${key}: a full sha256`;
  if (!Array.isArray(recipe.removed) || !recipe.removed.length) return 'removed: at least one node';
  for (const row of recipe.removed) {
    if (typeof row?.node !== 'string' || !row.node) return 'removed: each row names a node';
    if (typeof row.what !== 'string' || row.what.length < 10) return `${row.node}: what it is, in words`;
  }
  if (new Set(recipe.removed.map((row) => row.node)).size !== recipe.removed.length) return 'removed: a node once';
  if (typeof recipe.reason !== 'string' || recipe.reason.length < 40) return 'reason: why the parts leave, in words';
  if (typeof recipe.authority !== 'string' || !recipe.authority) return 'authority: the ruling';
  return null;
}

/** The excised GLB bytes for a recipe, from the pristine source bytes. */
export async function excise(recipe, sourceBytes) {
  const THREE = await import('three');
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const { loadSource } = await import('./source-x-oracle.mjs');
  if (sha256(sourceBytes) !== recipe.sourceSha256) throw new Error(`${recipe.source}: not the recipe's pristine ${recipe.sourceSha256}`);
  const scratch = path.join(repo, 'node_modules', '.cache', 'oracle-excision');
  fs.mkdirSync(scratch, { recursive: true });
  const file = path.join(scratch, path.basename(recipe.source));
  fs.writeFileSync(file, sourceBytes);
  const { scene } = await loadSource(file);
  for (const { node } of recipe.removed) {
    const hits = [];
    scene.traverse((o) => { if (o.name === node) hits.push(o); });
    if (hits.length !== 1) throw new Error(`${node}: ${hits.length} source nodes carry this name`);
    hits[0].removeFromParent();
  }
  const material = new THREE.MeshStandardMaterial({ color: 0x798167, roughness: 0.8, metalness: 0.1 });
  scene.traverse((o) => { if (o.isMesh) o.material = material; });
  scene.updateMatrixWorld(true);
  return Buffer.from(await new GLTFExporter().parseAsync(scene, { binary: true }));
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)=?(.*)$/.exec(a); return m ? [m[1], m[2] || true] : [a, true]; }));
  if (!args.recipe) throw new Error('usage: node tools/oracle-excision.mjs --recipe=<docs/references/oracle-excisions/*.json> [--check]');
  const recipe = JSON.parse(fs.readFileSync(path.resolve(repo, args.recipe), 'utf8'));
  const error = recipeError(recipe);
  if (error) throw new Error(`${args.recipe}: ${error}`);
  const sourceFile = path.join(repo, 'public', recipe.source.slice(1));
  const bytes = await excise(recipe, fs.readFileSync(sourceFile));
  const digest = sha256(bytes);
  if (digest !== recipe.outputSha256) throw new Error(`${recipe.output}: built ${digest}, the recipe pins ${recipe.outputSha256}`);
  if (args.check) { console.log(`oracle-excision: ${recipe.output} rebuilds to ${digest} (check, nothing written)`); return; }
  const target = path.join(repo, 'public', recipe.output.slice(1));
  execFileSync('git', ['check-ignore', '--no-index', target], { cwd: repo, stdio: 'pipe' });
  fs.writeFileSync(target, bytes);
  console.log(`oracle-excision: wrote ${recipe.output} (${bytes.length} bytes, ${digest}); removed ${recipe.removed.map((r) => r.node).join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
