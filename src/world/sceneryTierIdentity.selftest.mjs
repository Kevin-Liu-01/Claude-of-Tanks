// A phone's scenery collision is the desktop's (the hitbox lane, 2026-10-11; docs/DESTRUCTION.md §8.4). The rock
// formations and stone landmarks drew fewer, leaner pieces on a phone and built their masses from them, so a phone's
// collision world drifted from the authority's on every map with formations
// (`node tools/capture-world-collision-manifests.mjs --tier=mobile`: Verdant, Desert, Badlands, Coastal, Saltwind, ...).
// (The scenery lane fixed it on 2026-10-08, visual/scenery-phone-masses 16469bc6a, which never reached main.)
// The masses now come from the pieces the desktop lays, on every tier. Here, for every form at two sizes on a slope:
//   - a phone build (mobile, with the desktop's `collision` options as scenery.ts passes them) publishes the desktop's
//     masses exactly (their points, tiers, slabs and heights);
//   - a lean formation (one the desktop builds lean too) keeps its own lean pieces' masses on both tiers;
//   - the phone still draws its own, lighter geometry, and the desktop's build is unchanged by the option — save the
//     desktop's loose stones that carry a fallen mass (physics stream, 2026-10-13), which the phone draws where the
//     desktop does, so its stone and its colliders agree.
// And the stones: on every angular map a phone's collision boulder form is the desktop's (below).
// (scenery.selftest holds composeScenery's records, byte for byte, on both tiers.)
import assert from 'node:assert/strict';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { buildRockFormation } from './sceneryRocks.ts';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const noise = new SimplexNoise({ random: mulberry32(9299) });
const slope = { getHeightAt: (x, z) => 0.12 * x - 0.05 * z };
const FORMS = [
  ['tor', 'granite', 6, 5], ['outcrop', 'sandstone', 7, 3], ['crag', 'slate', 6, 5], ['pavement', 'limestone', 12, 0],
  ['scree', 'slate', 8, 0], ['hoodoo', 'sandstone', 3.2, 6], ['menhir', 'granite', 1.2, 4.5], ['cairn', 'limestone', 4.2, 2.6],
  ['calvary', 'granite', 1.6, 5.6], ['blocks', 'breccia', 6, 2.6],
];
const plain = (masses) => JSON.parse(JSON.stringify(masses));
let compared = 0, standing = 0, phoneEmpty = 0, fallenMasses = 0;
for (const [form, geology, radius, height] of FORMS) {
  for (const scale of [1, 0.6]) {
    const spec = { form, geology, x: 30, z: -20, radius: radius * scale, height: height * scale, yawDeg: 25 };
    const seed = 4242 + compared;
    // the desktop as scenery.ts builds it (its own `mobile` false), and the phone (mobile, the desktop's collision)
    const desk = buildRockFormation(spec, slope, noise, mulberry32(seed), { mobile: false, collision: { mobile: false, stream: () => mulberry32(seed) } });
    const bare = buildRockFormation(spec, slope, noise, mulberry32(seed), { mobile: false });
    const phone = buildRockFormation(spec, slope, noise, mulberry32(seed), { mobile: true, collision: { mobile: false, stream: () => mulberry32(seed) } });
    assert.deepEqual(plain(phone.masses), plain(desk.masses), `${geology} ${form} x${scale}: the phone's masses are the desktop's`);
    // whether it stands is the desktop's to say, even where the phone draws none of it (a small pavement's lean build)
    assert.equal(phone.laid, desk.laid, `${geology} ${form} x${scale}: the phone counts it laid as the desktop does`);
    if (desk.laid && !phone.geometry) phoneEmpty++;
    assert.deepEqual(Array.from(desk.geometry?.attributes.position.array ?? []), Array.from(bare.geometry?.attributes.position.array ?? []),
      `${geology} ${form} x${scale}: the option leaves the desktop's build as it was`);
    if (desk.geometry && phone.geometry) {
      assert.ok(phone.triangles <= desk.triangles, `${geology} ${form} x${scale}: the phone draws its own lighter pieces (${phone.triangles} / ${desk.triangles})`);
    }
    // and the same on every build: the desktop's pieces come from a fresh stream, never the phone's own
    const again = buildRockFormation(spec, slope, noise, mulberry32(seed), { mobile: true, collision: { mobile: false, stream: () => mulberry32(seed) } });
    assert.deepEqual(Array.from(phone.geometry?.attributes.position.array ?? []), Array.from(again.geometry?.attributes.position.array ?? []),
      `${geology} ${form} x${scale}: the phone draws the same on every build`);
    again.geometry?.dispose();
    // a fallen mass (the desktop's loose stones past the drive-over line) stands where the phone draws stone: over its
    // footprint's centre the phone's geometry rises within its height
    for (const mass of desk.masses) {
      if (!mass.fallen) continue;
      let cx = 0, cz = 0;
      for (let i = 0; i < mass.points.length; i += 2) { cx += mass.points[i]; cz += mass.points[i + 1]; }
      cx /= mass.points.length / 2; cz /= mass.points.length / 2;
      const p = phone.geometry?.attributes.position.array ?? [];
      let near = Infinity;
      for (let i = 0; i < p.length; i += 3) {
        const d = Math.hypot(p[i] - cx, p[i + 2] - cz);
        if (p[i + 1] > mass.y0 && d < near) near = d;
      }
      // (the centroid of a mass's outline lies within its stones' spread: a drawn vertex within its reach)
      let reach = 0;
      for (let i = 0; i < mass.points.length; i += 2) reach = Math.max(reach, Math.hypot(mass.points[i] - cx, mass.points[i + 1] - cz));
      assert.ok(near <= reach, `${geology} ${form} x${scale}: the phone draws the fallen stone its colliders stand on (${near.toFixed(2)} / ${reach.toFixed(2)} m)`);
      fallenMasses++;
    }
    // a lean formation: lean on the desktop too, so both tiers keep the lean pieces' masses
    const leanDesk = buildRockFormation(spec, slope, noise, mulberry32(seed), { mobile: true, collision: { mobile: true, stream: () => mulberry32(seed) } });
    const leanPhone = buildRockFormation(spec, slope, noise, mulberry32(seed), { mobile: true, collision: { mobile: true, stream: () => mulberry32(seed) } });
    assert.deepEqual(plain(leanPhone.masses), plain(leanDesk.masses), `${geology} ${form} x${scale}: a lean formation's masses on both tiers`);
    for (const built of [desk, bare, phone, leanDesk, leanPhone]) built.geometry?.dispose();
    if (desk.masses.length) standing++;
    compared++;
  }
}
assert.ok(standing >= 12, `formations with masses were compared (${standing})`);
assert.ok(fallenMasses >= 3, `fallen masses drawn on the phone were checked (${fallenMasses})`);

// (a small pavement: the phone's lean build lays no cell of it, the desktop's does; Frontier's north ridge placed an extra
// formation on the phone alone when the field's count read the phone's geometry)
{
  const spec = { form: 'pavement', geology: 'limestone', x: 67, z: 262, radius: 3.18, height: 0, yawDeg: 40 };
  let found = false;
  for (let seed = 1; seed < 48; seed++) {
    const desk = buildRockFormation(spec, slope, noise, mulberry32(seed), { mobile: false, collision: { mobile: false, stream: () => mulberry32(seed) } });
    const phone = buildRockFormation(spec, slope, noise, mulberry32(seed), { mobile: true, collision: { mobile: false, stream: () => mulberry32(seed) } });
    if (desk.laid && !phone.geometry) { found = true; assert.equal(phone.laid, true, 'a pavement the phone draws none of still counts laid, as the desktop\'s'); }
    assert.equal(phone.laid, desk.laid, `seed ${seed}: the phone counts the pavement laid as the desktop does`);
    desk.geometry?.dispose(); phone.geometry?.dispose();
  }
  // (since the phone draws the desktop's loose stones, physics stream 2026-10-13, it seldom draws none of a pavement the
  // desktop lays; every seed's count is the desktop's either way)
  void found;
}
// the stones (props.ts buildRockVariants, rockDressing.ts boulderVariantForms): on every map whose rock climate is angular
// (rockDressing.ts ROCK_CLIMATE `angular`; Badlands on 2026-10-11, more with the map-revival lane's rock round) and on
// two maps that are not, a phone's collision form is the desktop's, vertex for vertex; the desktop collides with the
// form it draws; the phone draws a lighter one. On the angular maps the check bites: the form a phone built before
// (the desktop's subdivision without the map's angularity) is not the desktop's.
const { MAP_IDS } = await import('./maps/catalog.ts');
const { boulderKindFor, boulderVariantForms, buildBoulderForm, legacyRockVariant, rockAngularityFor, rockLithologyFor } = await import('./rockDressing.ts');
const angularMaps = MAP_IDS.filter((id) => rockAngularityFor(id) > 0);
assert.ok(angularMaps.length >= 1, `an angular rock climate is registered (${angularMaps.join(', ')})`);
const positions = (geometry) => Array.from(geometry.attributes.position.array);
let stoneForms = 0;
for (const mapId of [...angularMaps, 'verdant', 'winter']) {
  const lithology = rockLithologyFor(mapId), angular = rockAngularityFor(mapId);
  const stoneNoise = new SimplexNoise({ random: mulberry32(2002 + 7) });
  for (let vi = 0; vi < 3; vi++) {
    const legacy = legacyRockVariant(vi, stoneNoise);
    const stream = () => mulberry32(2002 + 60 + vi);
    const desk = boulderVariantForms(vi, stoneNoise, stream, legacy.hull, legacy.top, lithology, angular, false);
    const phone = boulderVariantForms(vi, stoneNoise, stream, legacy.hull, legacy.top, lithology, angular, true);
    assert.ok(desk.collision === desk.drawn.geometry, `${mapId} stone ${vi}: the desktop collides with the form it draws`);
    assert.deepEqual(positions(phone.collision), positions(desk.collision), `${mapId} stone ${vi}: the phone's collision form is the desktop's`);
    assert.ok(phone.drawn.geometry.attributes.position.count < desk.drawn.geometry.attributes.position.count,
      `${mapId} stone ${vi}: the phone draws a lighter form`);
    if (angular > 0) {
      const before = buildBoulderForm(vi, stoneNoise, stream(), legacy.hull, 6, legacy.top, boulderKindFor(lithology, vi), lithology);
      assert.notDeepEqual(positions(before.geometry), positions(desk.collision), `${mapId} stone ${vi}: the check bites (no angularity, another stone)`);
      before.geometry.dispose();
    }
    for (const geometry of new Set([desk.drawn.geometry, desk.collision, desk.far?.geometry, phone.drawn.geometry, phone.collision])) geometry?.dispose();
    stoneForms++;
  }
}

console.log(`sceneryTierIdentity: ${compared} formations (${standing} with masses) build the desktop's masses on a phone, count laid `
  + `as the desktop does (a pavement the phone draws none of included), the desktop build unchanged and a lean formation's masses on both tiers; `
  + `${stoneForms} stone forms on ${angularMaps.length} angular map(s) (${angularMaps.join(', ')}) and two controls collide as the desktop's PASS`);
