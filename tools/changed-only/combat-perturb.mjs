// Preload for the combat proof (tools/changed-only/trace-check.mjs --combat): `node --import <this file>` (or NODE_OPTIONS,
// which child processes inherit) with COT_COMBAT_PERTURB=1 moves every combat leaf (steps.mjs BALANCE.combat) of every
// registered spec as the balance importer finishes registering, so a step whose rows do not move does not read them.
// First-party tooling: Kevin B. Liu.
import { registerHooks } from 'node:module';
import { moveCombat } from './combat-fields.mjs';
import { BALANCE } from './steps.mjs';

if (process.env.COT_COMBAT_PERTURB === '1') {
  globalThis[Symbol.for('cot.combatPerturb')] = (registry) => {
    for (const spec of Object.values(registry)) moveCombat(spec, BALANCE.combat);
  };
  const importers = Object.keys(BALANCE.importers);
  registerHooks({
    load(url, context, nextLoad) {
      const result = nextLoad(url, context);
      // The importer applies the pass to TANK_SPECS at the end of its body; a ReferenceError here means it no longer does.
      if (importers.some((file) => url.endsWith(`/${file}`))) {
        return { ...result, source: `${result.source}\n;globalThis[Symbol.for('cot.combatPerturb')](TANK_SPECS);\n` };
      }
      return result;
    },
  });
}
