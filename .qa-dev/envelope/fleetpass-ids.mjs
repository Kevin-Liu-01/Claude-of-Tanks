// Lane tool (envelope-honesty-264): fleetPassDefault's per-tank audits on named ids, each id with fresh audits (the
// fleet runner stops an audit at its first failing id) and no fleet-coverage finish().
//   ROOT=<tree> node .qa-dev/envelope/fleetpass-ids.mjs <id,id,...>
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const root = process.env.ROOT || process.cwd();
const imp = (rel) => import(pathToFileURL(join(root, rel)).href);
const { runFleetPass } = await imp('src/vehicles/fleetPass.test-support.mjs');
const { createTank } = await imp('src/vehicles/tankFactory.ts');
const names = ['RunningGearRegistration', 'CombatAnatomy', 'MudguardFenderSeating', 'VehicleMarkings', 'Watertight', 'WorkingPintleCradle', 'TankAssets'];
const files = ['runningGearRegistrationAudit', 'combatAnatomyAudit', 'mudguardFenderSeatingAudit', 'vehicleMarkingsAudit', 'watertightAudit', 'workingPintleCradleAudit', 'tankAssetsAudit'];
const makers = [];
for (let k = 0; k < names.length; k++) makers.push((await imp(`src/vehicles/${files[k]}.test-support.mjs`))[`create${names[k]}Audit`]);
const ids = process.argv[2].split(',');
let bad = 0;
for (const id of ids) {
  const audits = names.map((n, k) => ({ name: n, create: async () => {
    const a = await (n === 'WorkingPintleCradle' ? makers[k]({ minimumStations: { pintleMG: 0, americanM2: 0, americanRws: 0, openYokeRws: 0 } }) : makers[k]());
    return { check: (i, t) => a.check(i, t) };
  } }));
  try { await runFleetPass({ name: `ids:${id}`, build: { proceduralOnly: true, geometryReceipt: true }, createTank, ids: [id], audits, log: () => {} });
    console.log(`PASS ${id}`);
  } catch (e) { bad++; console.log(`FAIL ${id}: ${String(e.message).split('\n').slice(1).join(' | ')}`); }
}
console.log(`FLEETPASS-IDS-DONE ${ids.length - bad}/${ids.length} pass`);
