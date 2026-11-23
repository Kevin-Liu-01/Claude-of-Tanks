// 271 (Main, 2026-11-09): the generic decor smoke pair dresses only a build with no drawn smoke banks, and a vehicle's
// salvo is its drawn launcher mouths (decorations.ts drawsOwnSmoke). Each id below draws its own launchers; with the decor
// on, its launch sockets are exactly the drawn ones (the pair used to double them, or a per-id filter hid an unmarked
// set: the T-84U fired nothing). A build with no drawn bank keeps the pair. The generated inventory agrees.
import assert from 'node:assert/strict';
import { createTank } from './tankFactory.ts';
import { smokeSocketsFor } from './vehicleAuxiliaryGeometry.ts';
import { AUXILIARY_INVENTORY } from './auxiliaryInventory.generated.ts';

const sockets = (id, decor) => {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, decor });
  let n = 0;
  tank.root.traverse((o) => { n += smokeSocketsFor(o).length; });
  tank.dispose?.();
  return n;
};
// id -> drawn launcher mouths: the M1A1's two M250s, the Bradley's two M257s (its pin of 14 retired), the T-84U's 902B
// tubes (marked in 271), the T-84's two banks of six (t84.ts, 274), the Oplot-M's, the Leopard 1A5's Wegmann banks, a
// PT-84's two Tellur banks
const DRAWN = { m1a1: 12, m2a2_bradley: 8, t84bm_oplot_m: 8, t84: 12, bm_oplot_m: 8, leo1a5: 8, pt84_orzel: 24 };
for (const [id, drawn] of Object.entries(DRAWN)) {
  assert.equal(sockets(id, false), drawn, `${id}: the build draws ${drawn} launcher mouths`);
  assert.equal(sockets(id, true), drawn, `${id}: no decor pair on top of the drawn launchers`);
  assert.equal(AUXILIARY_INVENTORY[id].smoke.length, drawn, `${id}: the inventory's salvo is the drawn mouths`);
}
// the T-55A draws no bank: the decor pair (its only smoke) stays
assert.equal(sockets('t55a', false), 0, 't55a: no drawn bank');
assert.ok(sockets('t55a', true) > 0 && AUXILIARY_INVENTORY.t55a.smoke.length > 0, 't55a: the decor pair stays');
console.log(`decorDrawnSmoke: ${Object.keys(DRAWN).length} drawn-launcher builds take no decor pair; a bankless build keeps it PASS`);
