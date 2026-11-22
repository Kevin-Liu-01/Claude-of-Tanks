// Read-only fleet table for the turret-deck check (src/vehicles/turretDeckAudit.test-support.mjs): every turreted tank's
// turret clearance over the deck past its ring's rim and the hull props standing over the turret's foot, on the factory's
// default build (the build fleetPassDefault reads). Writes JSON; never fails on an offender.
//   node tools/turret-deck-audit.mjs [--ids=a,b] [--out=.qa-dev/turret-deck-audit.json]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { runFleetPass } from '../src/vehicles/fleetPass.test-support.mjs';
import { createTank } from '../src/vehicles/tankFactory.ts';
import { ALL_TANK_IDS } from '../src/vehicles/specs.ts';
import { uniqueIds } from './id-list.mjs';
import { createTurretDeckAudit } from '../src/vehicles/turretDeckAudit.test-support.mjs';

const option = (name, fallback = '') => {
  const arg = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : fallback;
};
const ids = option('ids') ? uniqueIds(option('ids').split(',').map((id) => id.trim()).filter(Boolean), 'turret-deck-audit --ids') : ALL_TANK_IDS;
const out = resolve(option('out', '.qa-dev/turret-deck-audit.json'));
const report = [];
await runFleetPass({
  name: 'turretDeckReport',
  build: { proceduralOnly: true, geometryReceipt: true },
  createTank,
  ids,
  audits: [{ name: 'turretDeck', create: () => createTurretDeckAudit({ report }) }],
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
const offenders = report.filter((row) => row.fails);
console.log(`turret-deck: ${report.length} rows, ${report.filter((row) => row.noReceipt).length} without a ring receipt, `
  + `${report.filter((row) => row.noTurret).length} no-turret, `
  + `${offenders.length} failing the gate${offenders.length ? ` (${offenders.map((row) => row.id).join(', ')})` : ''}; ${out}`);
