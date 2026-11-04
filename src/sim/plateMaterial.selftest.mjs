// What a round struck (impact-materials-269, sim/plateMaterial.ts): every plate of every playable vehicle's armour has a
// material; the classes land on the plates they name (rubber skirts, tracks and wheels, cages, racks, ERA, launcher
// boxes, armoured screens); and the damage law stamps the struck plate and the outer screen on real rounds, a wreck's
// strikes as the wreck, without touching what it decides.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { PLATE_MATERIALS, plateMaterial, strikesRoadWheel } from './plateMaterial.ts';

const t0 = performance.now();
await import('../vehicles/tankFactory.ts');
const fleet = await import('../vehicles/specs.ts');
const { traceTank, tankPoseFromState } = await import('./armor.ts');
const { resolveShellHit, createCombatState } = await import('./damage.ts');
const { createShell } = await import('./ballistics.ts');

// ---- the classes on the plates they name
const plate = (name, kind, physicalMm, extra = {}) => ({ name, kind, physicalMm, keMm: physicalMm, ceMm: physicalMm, verts: [], ...extra });
const cases = [
  [plate('upper_glacis', 'main', 80), 'armour'],
  [plate('skirt_era_R', 'era', 15), 'era'],
  [plate('track_R', 'external', 20, { moduleLink: 'trackR' }), 'trackLinks'],
  [plate('skirt_rubber_L', 'spaced', 8), 'rubberSkirt'],
  [plate('skirt_R', 'spaced', 8), 'rubberSkirt'],
  [plate('skirt_R', 'spaced', 10), 'thinSteel'],
  [plate('skirt_heavy_R', 'spaced', 110), 'armour'],
  [plate('turret_wedge_L', 'spaced', 90), 'armour'],
  [plate('slat_cage', 'spaced', 10), 'cage'],
  [plate('turret_net_R', 'spaced', 6, { droneInterception: 0.4 }), 'cage'],
  [plate('bustle_rack_BasketCourse1_0_2', 'external', 10), 'stowage'],
  [plate('turret_stowage_screen_R', 'spaced', 10), 'stowage'],
  [plate('weapon_missileRack_3', 'external', 10, { moduleLink: 'missileRack' }), 'thinSteel'],
  [plate('track_guard_R', 'spaced', 6), 'thinSteel'],
];
for (const [p, want] of cases) assert.equal(plateMaterial(p), want, `${p.name} (${p.kind}, ${p.physicalMm} mm) is ${want}`);

// ---- the road wheels: the band's side between its runs; the runs, the ends and the top are links
const band = { yMin: 0, yMax: 0.9 };
assert.ok(strikesRoadWheel({ ...band, y: 0.45, normalX: 1 }), 'mid-height on the side: a road wheel');
assert.ok(!strikesRoadWheel({ ...band, y: 0.08, normalX: 1 }), 'the bottom run is links');
assert.ok(!strikesRoadWheel({ ...band, y: 0.85, normalX: -1 }), 'the top run is links');
assert.ok(!strikesRoadWheel({ ...band, y: 0.45, normalX: 0.2 }), 'the sprocket or idler end (a ramp) is links');
assert.ok(!strikesRoadWheel(null), 'no strike data: links');
assert.equal(plateMaterial(plate('track_L', 'external', 20, { moduleLink: 'trackL' }), { ...band, y: 0.45, normalX: -1 }), 'roadWheel');

// ---- every plate of the fleet classifies, and the fleet holds every class but the wreck's
const seen = new Map(PLATE_MATERIALS.map((m) => [m, 0]));
let plates = 0;
const walk = (node, visited) => {
  if (!node || typeof node !== 'object' || visited.has(node)) return;
  visited.add(node);
  if (typeof node.name === 'string' && typeof node.kind === 'string' && typeof node.physicalMm === 'number') {
    const material = plateMaterial(node);
    assert.ok(seen.has(material), `${node.name}: ${material} is a plate material`);
    seen.set(material, seen.get(material) + 1);
    plates++;
  }
  for (const value of Object.values(node)) if (value && typeof value === 'object') walk(value, visited);
};
for (const id of fleet.ALL_TANK_IDS) walk(fleet.getSpec(id).armor, new Set());
// (a road wheel is where a track is struck, a wreck is a destroyed hull: neither is a plate's own class)
for (const [material, count] of seen) if (material !== 'wreck' && material !== 'roadWheel') assert.ok(count > 0, `the fleet has ${material} plates`);
assert.equal(seen.get('wreck'), 0, 'no plate is a wreck: a destroyed hull is');

// ---- the damage law stamps them on real rounds: grazing 120 mm rods along a T-72B3's and a Leopard 2A4's right side
let seed = 11;
const rng = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const rod = fleet.getSpec('leo2a6').gun.shells[0];
const outcomes = { live: new Map(), wreck: new Map() };
let screened = 0, runningGearRicochets = 0;
for (const id of ['t72b3', 'leo2a4', 'm1a1_abrams_hc']) {
  const spec = fleet.getSpec(id);
  for (const wreck of [false, true]) {
    for (const bearing of [55, 72, 82]) for (const y of [0.35, 0.55, 0.8, 1]) for (const z of [-2.5, 0.5, 3]) {
      const state = { pos: new Vector3(), yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0 };
      const combat = createCombatState(spec);
      if (wreck) combat.destroyed = true;
      const aim = new Vector3(2, y, z);
      const b = bearing * Math.PI / 180;
      const from = aim.clone().add(new Vector3(Math.sin(b) * 300, Math.tan(Math.PI / 360) * 300, Math.cos(b) * 300));
      const dir = aim.clone().sub(from).normalize();
      const to = aim.clone().addScaledVector(dir, 6);
      const hits = traceTank(from, to, tankPoseFromState(state), spec.armor, combat.eraSpent);
      if (!hits.length) continue;
      const start = hits[0].point.clone().addScaledVector(dir, -1);
      const shell = createShell(rod, 'S', false, start, dir, 1);
      shell.pos.copy(to);
      shell.prevPos.copy(start);
      const event = resolveShellHit(shell, { id: 'T', spec, state, combat }, hits, rng);
      const tally = outcomes[wreck ? 'wreck' : 'live'];
      tally.set(event.material, (tally.get(event.material) ?? 0) + 1);
      if (wreck) { assert.equal(event.material, 'wreck', `${id} wreck: ${event.kind} strikes the wreck`); continue; }
      if (event.plateKind === 'main') assert.equal(event.material, 'armour', `${id}: ${event.zone} is armour`);
      if (event.screenMaterial !== undefined) {
        screened++;
        assert.ok(PLATE_MATERIALS.includes(event.screenMaterial), `${id}: screen ${event.screenMaterial}`);
        if (event.kind === 'ricochet' && (event.screenMaterial === 'trackLinks' || event.screenMaterial === 'roadWheel')) runningGearRicochets++;
      }
      if (event.zone === 'track_R' || event.zone === 'track_L') assert.ok(event.material === 'trackLinks' || event.material === 'roadWheel', `${id}: a track strike is the running gear (${event.material})`);
    }
  }
}
assert.ok((outcomes.live.get('trackLinks') ?? 0) + (outcomes.live.get('roadWheel') ?? 0) > 0, `rounds strike the running gear (${[...outcomes.live]})`);
assert.ok(screened > 0, 'rounds pass outer screens on their way to a plate');
assert.ok(runningGearRicochets > 0, 'a grazing rod through the running gear that glances off the lower hull names the running gear it passed');

console.log(`plateMaterial.selftest: ${plates} plates over ${fleet.ALL_TANK_IDS.length} vehicles (${[...seen].map(([m, n]) => `${m} ${n}`).join(', ')}); `
  + `live grazes ${[...outcomes.live].map(([m, n]) => `${m} ${n}`).join(', ')}; ${screened} screened, ${runningGearRicochets} running-gear ricochets `
  + `(${((performance.now() - t0) / 1000).toFixed(1)} s) PASS`);
