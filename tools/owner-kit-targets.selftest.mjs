// Release 262 (Main's ruling on the owner's Oplot kit): every owner-kit part tools/owner-kit-targets.mjs sets aside is one
// unique named group directly under its declared rig, carrying the declared metadata, with physical stock at both
// qualities; each part quotes the owner's words it answers; each accepted receipt row is a well-formed digest of an
// accepted arrangement under the part's own reference. The digests themselves are proved in the browser
// (procedural-fidelity.html via reference-supplement.mjs), where the materials' texture pixels exist.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OWNER_KIT_TARGETS } from './owner-kit-targets.mjs';
import { createTank } from '../src/vehicles/tankFactory.ts';

for (const [id, target] of Object.entries(OWNER_KIT_TARGETS)) {
  assert.match(target.ownerDecision, /^Owner: ".+"\. Main/, `${id}: the decision quotes the owner and names the ruling`);
  assert.match(target.decisionDate, /^\d{4}-\d{2}-\d{2}$/);
  const references = new Set(target.parts.map((part) => part.reference));
  assert.equal(references.size, target.parts.length, `${id}: one reference per part`);
  for (const part of target.parts) {
    assert.ok(target.ownerDecision.includes(part.ownerWords), `${id}/${part.group}: "${part.ownerWords}" is the owner's own words`);
  }
  for (const quality of ['high', 'low']) {
    const tank = createTank(id, null, { quality, proceduralOnly: true, geometryReceipt: true });
    for (const part of target.parts) {
      const groups = [];
      tank.root.traverse((o) => { if (o.name === part.group) groups.push(o); });
      assert.equal(groups.length, 1, `${id}/${quality}: exactly one ${part.group}`);
      const [group] = groups;
      assert.equal(group.parent?.name, part.parent, `${id}/${quality}: ${part.group} hangs directly under ${part.parent}`);
      assert.equal(group.parent.parent, tank.root, `${id}/${quality}: ${part.parent} is a direct articulation rig`);
      for (const [key, value] of Object.entries(part.metadata)) {
        assert.equal(group.userData[key], value, `${id}/${quality}: ${part.group} userData.${key}`);
      }
      let triangles = 0;
      group.traverse((o) => { if (o.isMesh) triangles += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3; });
      assert.ok(triangles > 0, `${id}/${quality}: ${part.group} has physical stock`);
    }
    tank.dispose?.();
  }
  const receipt = JSON.parse(readFileSync(new URL(`../docs/references/tanks/${id}-owner-kit-receipt.json`, import.meta.url), 'utf8'));
  assert.equal(receipt.tankId, id);
  for (const [group, row] of Object.entries(receipt.parts)) {
    const part = target.parts.find((entry) => entry.group === group);
    assert.ok(part, `${id}: receipt row ${group} is a declared part`);
    assert.equal(row.arrangementAccepted, true, `${id}/${group}: accepted`);
    assert.equal(row.reference, part.reference, `${id}/${group}: its own reference`);
    assert.match(row.geometryPoseSha256, /^[a-f0-9]{64}$/, `${id}/${group}: a sha256 digest`);
  }
}
console.log(`owner-kit-targets.selftest: ${Object.keys(OWNER_KIT_TARGETS).length} vehicle(s); every set-aside part is one rigid group under its rig, quoting the owner`);
