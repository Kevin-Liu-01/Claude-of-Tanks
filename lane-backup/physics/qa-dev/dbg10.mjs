import { createTank } from '../src/vehicles/tankFactory.ts';
import { createHash } from 'node:crypto';
for (const id of ['t90m', 'm1a2']) {
  const visual = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  const snap = () => { const m = new Map(); visual.root.traverse((o) => m.set(o.uuid, JSON.stringify([o.name, o.position.toArray(), o.quaternion.toArray(), o.scale.toArray(), o.visible]))); return m; };
  const before = snap();
  visual.setDestroyed(); visual.resetDestroyed();
  const after = snap();
  let diffs = 0;
  for (const [k, v] of before) if (after.get(k) !== v) { if (diffs++ < 6) console.log(id, 'BEFORE', v.slice(0, 200), '\n   AFTER ', (after.get(k) || '').slice(0, 200)); }
  console.log(id, 'objects', before.size, 'diffs', diffs);
}
