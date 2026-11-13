// Release 262 (Main's ruling on the Challenger 3 TD's residuals): every fleet part tools/oracle-blind-parts.mjs sets
// aside quotes the ruling's words for it, leaves the track profile alone with a measured reason, and names meshes the
// build carries exactly once in their declared role at both qualities; procedural-fidelity.html reads the declaration
// only outside ?comparison=raw-source and fails closed on a missing part. The oracle's own node patterns are checked by
// the page against the registered file (gitignored, so not here).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORACLE_BLIND_PARTS } from './oracle-blind-parts.mjs';
import { createTank } from '../src/vehicles/tankFactory.ts';

const SCOPES = new Set(['trackProfile']);
for (const [id, target] of Object.entries(ORACLE_BLIND_PARTS)) {
  assert.match(target.decision, /^Main \(\d+\): ".+"\./, `${id}: the decision quotes Main's ruling`);
  assert.match(target.decisionDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(readFileSync(new URL(`../${target.packet}`, import.meta.url), 'utf8').includes(id), `${id}: its run packet`);
  assert.equal(new Set(target.parts.map((part) => part.key)).size, target.parts.length, `${id}: one key per part`);
  for (const part of target.parts) {
    assert.ok(SCOPES.has(part.masks), `${id}/${part.key}: a declared mask scope`);
    assert.ok(target.decision.includes(part.rulingWords), `${id}/${part.key}: "${part.rulingWords}" are the ruling's words`);
    assert.ok(part.reason.length > 40 && part.part.length > 10, `${id}/${part.key}: names the part and the measured reason`);
    assert.ok(part.procedural.length > 0, `${id}/${part.key}: the build's own meshes`);
    if (part.reference) {
      assert.doesNotThrow(() => new RegExp(part.reference.node), `${id}/${part.key}: a reference node pattern`);
      assert.ok(Number.isInteger(part.reference.count) && part.reference.count > 0);
    }
  }
  for (const quality of ['high', 'low']) {
    const tank = createTank(id, null, { quality, proceduralOnly: true, geometryReceipt: true });
    try {
      const hull = tank.root.getObjectByName('rig_hull');
      for (const part of target.parts) for (const { name, appearanceRole } of part.procedural) {
        const found = [];
        tank.root.traverse((o) => { if (o.name === name) found.push(o); });
        assert.equal(found.length, 1, `${id}/${quality}: exactly one ${name}`);
        const [mesh] = found;
        assert.ok(mesh.isMesh && mesh.geometry, `${id}/${quality}: ${name} is a mesh`);
        assert.equal(mesh.userData.appearanceRole, appearanceRole, `${id}/${quality}: ${name} is the ${appearanceRole}`);
        let below = false;
        for (let p = mesh.parent; p; p = p.parent) if (p === hull) below = true;
        assert.ok(below, `${id}/${quality}: ${name} is hull running gear`);
        assert.ok((mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) >= 3,
          `${id}/${quality}: ${name} has physical stock`);
      }
    } finally { tank.dispose?.(); }
  }
}

const page = readFileSync(new URL('./procedural-fidelity.html', import.meta.url), 'utf8');
assert.match(page, /params\.get\('comparison'\)!=='raw-source'\?ORACLE_BLIND_PARTS\[id\]\?\?null:null/,
  'the raw-source comparison never reads the exemption');
assert.match(page, /must be the one \$\{appearanceRole\} mesh/, 'a missing or re-roled part stops the page');
assert.match(page, /baseVisible\.set\(o,base\)/, 'the track profile restores every set-aside part for the masks after it');
assert.match(page, /window\.__ORACLE_BLIND_IDS = Object\.keys\(ORACLE_BLIND_PARTS\)/, 'the fidelity driver keeps the raw sidecar');
console.log(`oracle-blind-parts.selftest: ${Object.keys(ORACLE_BLIND_PARTS).length} vehicle(s); every set-aside fleet part is named, ruled and carried once, and leaves the track profile only`);
