// Running-gear registration (2026-10-04, the physics lane's finding on the T-90M): the units a tank registers in P.gear
// are exactly the units it draws.
//
// P.gear fans update, conform and setBroken out to every registered unit, and the units' track hitboxes and contact
// spans make the unions the armour and the movement solve read. A rebuilt chassis that clears its hull group without
// discarding the old unit (tankFactoryCore.ts discardRunningGear) leaves that unit registered and invisible: its update
// runs every frame, its hitbox prisms stay in the shared armour, its span stays in the contact union. The opposite
// leftover, a profile that overwrites P.gear while an earlier unit's meshes stay in the hull, draws a unit nothing
// updates. A unit is drawn when at least one of its scene objects (userData.runningGear with its runningGearUnitId)
// hangs in the tank's tree with every ancestor visible. Reads only; a fleet-pass audit (fleetPass.test-support.mjs).
import assert from 'node:assert/strict';

function drawnUnitIds(root) {
  const drawn = new Set();
  const walk = (object) => {
    if (!object.visible) return;
    const data = object.userData;
    if (data?.runningGear === true && Number.isInteger(data.runningGearUnitId)) drawn.add(data.runningGearUnitId);
    for (const child of object.children) walk(child);
  };
  walk(root);
  return [...drawn].sort((a, b) => a - b);
}

export function createRunningGearRegistrationAudit() {
  let tanks = 0, units = 0, gearless = 0;
  return {
    check(id, tank) {
      const registered = tank.root.userData.runningGearUnitIds;
      assert.ok(Array.isArray(registered), `${id}: the factory publishes the running-gear units it registered`);
      const sorted = [...registered].sort((a, b) => a - b);
      assert.ok(sorted.every((unitId) => Number.isInteger(unitId) && unitId >= 0),
        `${id}: every registered running-gear unit carries its id (${JSON.stringify(registered)})`);
      assert.equal(new Set(sorted).size, sorted.length, `${id}: no running-gear unit is registered twice`);
      const drawn = drawnUnitIds(tank.root);
      assert.deepEqual(sorted, drawn, `${id}: the running-gear units registered (${JSON.stringify(sorted)}) are the `
        + `units drawn (${JSON.stringify(drawn)}) — a registered unit nothing draws still updates, conforms and keeps `
        + 'its track hitboxes and contact span; a drawn unit nothing registers never moves');
      tanks += 1;
      units += sorted.length;
      if (!sorted.length) gearless += 1;
    },
    finish() {
      console.log(`fleet running-gear registration: ${units} units on ${tanks} tanks (${gearless} gearless), `
        + 'every registered unit drawn and every drawn unit registered');
      return { tanks, units, gearless };
    },
  };
}
