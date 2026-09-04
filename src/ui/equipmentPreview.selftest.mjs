import assert from 'node:assert/strict';
import {
  equipmentHoverPreview,
  projectEquipmentLoadout,
} from './equipmentPreview.ts';

const spec = {
  id: 'fixture_mbt',
  name: 'Fixture MBT',
  era: 'modern',
  role: 'mbt',
  hullTraverseDegS: 40,
  turretTraverseDegS: 32,
  gun: { reloadS: 6, aimTimeS: 1.8 },
};

const metric = (preview, id) => {
  const found = preview.metrics.find((candidate) => candidate.id === id);
  assert.ok(found, `expected ${id} metric`);
  return found;
};

assert.deepEqual(
  projectEquipmentLoadout(['vents', 'optics'], 'rammer', 2),
  ['vents', 'optics', 'rammer'],
  'an empty slot appends the selected equipment',
);
assert.deepEqual(
  projectEquipmentLoadout(['vents', 'optics'], 'rammer', 0),
  ['rammer', 'optics'],
  'an occupied slot is replaced',
);
assert.deepEqual(
  projectEquipmentLoadout(['rammer', 'vents'], 'rammer', 0),
  ['vents'],
  'clicking the item fitted in the open slot removes it',
);
assert.deepEqual(
  projectEquipmentLoadout(['rammer', 'vents'], null, 1),
  ['rammer'],
  'the Empty tile clears the open slot',
);

const addRammer = equipmentHoverPreview(spec, ['vents', 'optics'], 'rammer', 2);
assert.equal(addRammer.summary, 'Adds Gun Rammer to Slot 3.');
assert.deepEqual(metric(addRammer, 'reload'), {
  id: 'reload',
  label: 'Reload time',
  stock: '6.00 s',
  current: '5.85 s',
  projected: '5.26 s',
  changed: true,
  outcome: 'improved',
});

const replaceOptics = equipmentHoverPreview(spec, ['optics'], 'rammer', 0);
assert.equal(replaceOptics.summary, 'Replaces Coated Optics in Slot 1.');
assert.equal(metric(replaceOptics, 'reload').outcome, 'improved');
assert.equal(metric(replaceOptics, 'view').outcome, 'degraded');
assert.equal(metric(replaceOptics, 'view').current, '484 m');
assert.equal(metric(replaceOptics, 'view').projected, '440 m');

const removeRammer = equipmentHoverPreview(spec, ['rammer'], 'rammer', 0);
assert.equal(removeRammer.summary, 'Removes Gun Rammer from Slot 1.');
assert.equal(metric(removeRammer, 'reload').projected, '6.00 s');
assert.equal(metric(removeRammer, 'reload').outcome, 'degraded');

const rotation = equipmentHoverPreview(spec, [], 'rotation', 0);
assert.equal(metric(rotation, 'hullTraverse').projected, '44.0°/s');
assert.equal(metric(rotation, 'turretTraverse').projected, '35.2°/s');

const binoculars = equipmentHoverPreview(spec, [], 'binoculars', 0);
assert.equal(metric(binoculars, 'view').current, '440 m');
assert.equal(metric(binoculars, 'view').projected, '440 m / 550 m');

const autoloader = {
  ...spec,
  id: 'fixture_autoloader',
  gun: {
    ...spec.gun,
    autoloader: { fullReloadS: 20 },
  },
};
const vents = equipmentHoverPreview(autoloader, [], 'vents', 0);
assert.equal(metric(vents, 'reload').label, 'Magazine reload time');
assert.equal(metric(vents, 'reload').stock, '20.0 s');
assert.equal(metric(vents, 'reload').projected, '19.5 s');

const lockedRammer = equipmentHoverPreview(autoloader, [], 'rammer', 0, false);
assert.match(lockedRammer.summary, /^Unavailable for this vehicle/);
assert.deepEqual(lockedRammer.projectedLoadout, []);
assert.equal(metric(lockedRammer, 'reload').changed, false);

console.log('equipment hover preview: PASS');
