import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The map-vehicles lane (2026-10-06, hold 6): the geometries the map vehicles draw every frame keep V8's fast
// properties on their attributes object. A geometry that lost an attribute through deleteAttribute drops to dictionary
// mode, and one such geometry drawn each frame (the vehicles' and carts' shadow stand-ins, a moored hull) left three's
// per-frame geometry update loop megamorphic for every geometry in the scene: +1.0 ms of CPU a frame at Cinder Junction
// and Glacier Pass. vehicleMesh.ts keepStreams builds those geometries fresh. The check needs V8's natives syntax, so
// the receipt runs itself again with it.
if (!process.argv.includes('--natives')) {
  const child = spawnSync(process.execPath, ['--allow-natives-syntax', fileURLToPath(import.meta.url), '--natives'],
    { encoding: 'utf8', timeout: 900000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(child.status, 0, child.stderr || String(child.error));
  process.stdout.write(child.stdout);
} else {
  const fast = new Function('o', 'return %HasFastProperties(o)');
  const { cartOverrides } = await import('./cartKit.ts');
  const { civilianVehicleOverrides } = await import('./civilianVehicleKit.ts');
  const { BOAT_FAMILIES, familyBoat } = await import('./boatHulls.ts');
  // the control: a deletion does drop an attributes object to dictionary mode
  {
    const g = familyBoat(BOAT_FAMILIES.canot, 5, 3, false);
    assert.ok(fast(g.attributes), 'a fresh hull is fast');
    g.deleteAttribute('uv');
    assert.equal(fast(g.attributes), false, 'deleteAttribute leaves dictionary mode (the trap this receipt guards)');
    g.dispose();
  }
  let checked = 0;
  for (const mapId of ['railyard', 'alpine', 'ruinspires']) {
    for (const [role, o] of Object.entries(cartOverrides(mapId, false))) {
      const g = o.shadowBuild?.();
      assert.ok(g, `${mapId} ${role}: a desktop shadow stand-in`);
      assert.ok(fast(g.attributes), `${mapId} ${role}: the cart's shadow stand-in keeps fast attributes`);
      g.dispose(); checked++;
    }
    for (const [role, o] of Object.entries(civilianVehicleOverrides(mapId, false))) {
      const g = o.shadowBuild?.();
      if (!g) continue;
      assert.ok(fast(g.attributes), `${mapId} ${role}: the vehicle's shadow stand-in keeps fast attributes`);
      g.dispose(); checked++;
    }
  }
  for (const [name, family] of Object.entries(BOAT_FAMILIES)) {
    for (const mast of [false, true]) {
      const g = familyBoat(family, 5, 7, mast);
      assert.ok(fast(g.attributes), `${name}: a hull (a moored one is drawn on its own) keeps fast attributes`);
      g.dispose(); checked++;
    }
  }
  console.log(`drawnGeometryShape.selftest: ${checked} shadow stand-ins and hulls keep fast attribute objects; a deletion would not`);
}
