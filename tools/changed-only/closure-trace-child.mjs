// Child of tools/changed-only/closure-trace.mjs: loads ONE builder group through the demand-loaded fleet (plus the
// groups of its ids' spec chains), builds each of its ids at the geometry ledger's options and reports every module the
// process loaded and each build's ledger digest. First-party tooling: Kevin B. Liu.
//
//   node tools/changed-only/closure-trace-child.mjs <root> <ids,...> <chain ids,...>   -> JSON on stdout
import { registerHooks } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const loaded = new Set();
registerHooks({
  load(url, context, nextLoad) {
    if (url.startsWith('file:')) loaded.add(url);
    return nextLoad(url, context);
  },
});
const [root, idsArg, loadArg] = process.argv.slice(2);
const ids = idsArg.split(',').filter(Boolean), loadIds = loadArg.split(',').filter(Boolean);
const load = (rel) => import(pathToFileURL(join(root, rel)).href);
const fleet = await load('src/vehicles/fleetFactory.ts');
const { ledgerBuildOptions, digestTankRoot, LEDGER_QUALITIES } = await load('tools/fleet-geometry-digest.mjs');
await fleet.ensureTankBuilders(loadIds);
const digests = {};
for (const id of ids) {
  digests[id] = {};
  for (const quality of LEDGER_QUALITIES) {
    const tank = fleet.createTank(id, null, ledgerBuildOptions(quality));
    try { digests[id][quality] = digestTankRoot(tank.root); } finally { tank.dispose(); }
  }
}
process.stdout.write(JSON.stringify({ loaded: [...loaded], digests }));
