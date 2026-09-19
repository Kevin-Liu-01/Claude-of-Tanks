import assert from 'node:assert/strict';
import './tankFactory.ts';
import { createTank } from './tankFactory.ts';
import { getSpec, PRODUCTION_TANK_IDS } from './specs.ts';

// Owner 2026-09-18: "minimum amount of missiles for IFVs with missiles should be how many tubes present. so the bmpt t90
// should have minimum 8 since it has 8 tubes". Every guided round declares the launcher tubes modelled for it
// (0 = fired through the gun); its authored load is never below one round per tube; and wherever the built vehicle
// publishes a tube census (userData.launcherTubes on any node), the spec's declaration must match the geometry.
const guided = [];
for (const id of PRODUCTION_TANK_IDS) {
  const spec = getSpec(id);
  for (const shell of spec.gun?.shells ?? []) {
    if (!shell.guided) continue;
    assert.ok(Number.isInteger(shell.launcherTubes) && shell.launcherTubes >= 0, `${id}: ${shell.name} declares its launcher tubes`);
    assert.ok(Number.isInteger(shell.count) && shell.count >= shell.launcherTubes,
      `${id}: ${shell.name} carries ${shell.count} rounds for ${shell.launcherTubes} tubes — the load is at least one round per tube`);
    guided.push({ id, shell });
  }
}
assert.ok(guided.length >= 20, `the fleet fields guided rounds (${guided.length})`);
const published = [];
for (const { id, shell } of guided) {
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
  try {
    let census = null;
    tank.root.traverse((node) => {
      const value = node.userData?.launcherTubes;
      if (Number.isInteger(value)) census = census == null ? value : census + value;
      for (const receipt of Object.values(node.userData ?? {})) {
        if (receipt && typeof receipt === 'object' && Number.isInteger(receipt.launcherTubes) && census == null) census = receipt.launcherTubes;
      }
    });
    if (census != null) {
      assert.equal(shell.launcherTubes, census, `${id}: the spec's ${shell.launcherTubes} launcher tubes match the ${census} the profile publishes`);
      published.push(`${id}:${census}`);
    }
  } finally { tank.dispose?.(); }
}
assert.ok(published.length >= 6, `the rack-launcher vehicles publish their tube census (${published.join(' ')})`);
const bmpt = getSpec('bmpt_t90').gun.shells.find((shell) => shell.guided);
assert.equal(bmpt.launcherTubes, 8); assert.ok(bmpt.count >= 8, 'the BMPT T-90 carries at least its eight tubes of Ataka');
console.log(`guidedLauncherTubes.selftest: ${guided.length} guided rounds declare tubes, loads never below one per tube; published censuses ${published.join(' ')}`);
