// Aircraft streaks in the team colour (aircraft-streaks-277; Kevin 2026-11-24: "in air support/combined arms, make ur side
// planes have blue streaks and other side have red", then "make the colors on planes dependent on your team color thats
// all"). game/airSupportWorld.ts lays two wingtip streaks (game/aircraftStreaks.ts) behind every aircraft it flies, in the
// colour its side already shows on the footprints, the minimap and the markers: ui/objectiveGlyphs.ts sideColor('own')
// or sideColor('enemy'), relative to the viewer's team. Pins, on the real airSupportWorld and the real airframes:
//   1. census: every aircraft the world flies (each strike kind that flies: the A-10's recon and strafing runs, the
//      fighter's bomb and Maverick runs, the AC-130's orbit), on either side, draws two streaks, both laid behind it;
//   2. a streak's colour is its side's team colour as the viewer sees it: own for the viewer's team, enemy for the other,
//      and they swap when the viewer is on the other team (each peer, a replay or a spectated player sees its own blue);
//   3. a colour-vision preset (deutan) moves the enemy streak with every other enemy mark; the own stays its own;
//   4. a streak keeps its fade: it leaves the wingtip softly, is most opaque just behind it and fades out along its length;
//   5. a wreck draws no streak;
//   6. (Kevin: "on the actual vehicles add more detailling and coloring") every airframe carries team trim (its markings:
//      fin caps, wingtips, a band, the roundels' centres) in its one geometry, painted the same viewer-relative team
//      colour as its streaks; an airframe nobody paints (the AC-130 mode, the renders) keeps it insignia white.
import assert from 'node:assert/strict';
import { Color, Group } from 'three';
import { createAirSupportWorld } from './airSupportWorld.ts';
import { loadGunshipAirframe } from './gunshipVisual.ts';
import { AIR_SUPPORT_RULES, airStrikeFlies } from '../sim/matchRuleset.ts';
import { sideColor } from '../ui/objectiveGlyphs.ts';
import { setActiveTokens } from '../ui/tokens/tokenSelection.ts';
import { INSIGNIA } from './airframeParts.ts';
import { buildStrikeJetAirframe } from './strikeJetAirframe.ts';
import { buildFighterJetAirframe } from './fighterJetAirframe.ts';
import { loadedGunshipAirframe } from './gunshipVisual.ts';

await loadGunshipAirframe();
const R = AIR_SUPPORT_RULES;
const KINDS = ['recon', 'strafe', 'bomb', 'missile', 'gunship'];
for (const kind of KINDS) assert.ok(airStrikeFlies(kind), `${kind} flies`);
const NAME = { recon: 'jet', strafe: 'jet', bomb: 'fighter', missile: 'fighter', gunship: 'gunship' };

function strikes() {
  let id = 1;
  const out = [];
  for (const team of ['alpha', 'bravo']) {
    for (const kind of KINDS) {
      out.push({ id: id++, kind, team, mine: false, x: id * 40, y: 0, z: -id * 30, heading: 0.4 * id, calledS: 0,
        landsS: R[kind].warningS, hp: R[kind].hp, maxHp: R[kind].hp, downedS: null });
    }
  }
  return out;
}

/** Flies every strike for a second up to its mark, the frames a battle draws, as `perspective` sees it. */
function fly(perspective) {
  const root = new Group();
  const world = createAirSupportWorld(root, { viewerPosition: () => ({ x: 0, y: 2, z: 0 }) });
  const air = { nowS: 0, strikes: strikes() };
  const end = Math.min(...KINDS.map((k) => R[k].warningS));
  for (let t = end - 1; t <= end; t += 1 / 60) { air.nowS = t; world.update(air, perspective, t); }
  return { root, world, air };
}

const hex = (css) => new Color(css).getHex();
function streaksOf(root, strike) {
  const name = `air-support ${NAME[strike.kind]} ${strike.id}`;
  return [root.getObjectByName(`${name} streak port`), root.getObjectByName(`${name} streak starboard`)];
}

/** How many of the airframe's body vertices are `colour` (linear rgb, as the trim is painted). */
function verticesOf(body, colour) {
  const a = body.geometry.attributes.color.array;
  let n = 0;
  for (let i = 0; i < a.length; i += 3) {
    if (Math.abs(a[i] - colour.r) < 1e-6 && Math.abs(a[i + 1] - colour.g) < 1e-6 && Math.abs(a[i + 2] - colour.b) < 1e-6) n++;
  }
  return n;
}
/** The drawn airframe's body: the jet's own (the AC-130's models are checked together: one beside each anchor). */
function bodyOf(root, strike) {
  const craft = root.getObjectByName(`air-support ${NAME[strike.kind]} ${strike.id}`);
  return craft?.getObjectByName(NAME[strike.kind] === 'jet' ? 'strike-jet-body' : 'strike-fighter-body') ?? null;
}

// 6: unpainted, every airframe's trim is insignia white
const insignia = new Color(INSIGNIA);
const TRIM_MIN = 400;
for (const [name, build] of [['A-10', buildStrikeJetAirframe], ['fighter', buildFighterJetAirframe],
  ['AC-130', loadedGunshipAirframe().buildGunshipAirframe]]) {
  const built = build(null);
  const body = built.root.children.find((o) => o.isMesh && o.geometry.attributes.color.count > 1000);
  assert.ok(body, `6: ${name}: its body`);
  const white = verticesOf(body, insignia);
  assert.ok(white >= TRIM_MIN, `6: ${name}: its markings are on the airframe (${white} insignia vertices)`);
  assert.equal(verticesOf(body, new Color(sideColor('own'))), 0, `6: ${name}: unpainted, nothing on it is a team colour`);
  built.dispose();
}

for (const perspective of ['alpha', 'bravo']) {
  const { root, world, air } = fly(perspective);
  for (const strike of air.strikes) {
    const label = `${strike.kind} of ${strike.team} seen by ${perspective}`;
    // 6: its markings in its side's team colour (the AC-130's model is shared by gunship strikes: one per anchor, so
    // checked on a strike of each side)
    if (strike.kind !== 'gunship') {
      const side = strike.team === perspective ? 'own' : 'enemy', other = side === 'own' ? 'enemy' : 'own';
      const body = bodyOf(root, strike);
      assert.ok(body, `6: ${label}: its body`);
      const painted = verticesOf(body, new Color(sideColor(side)));
      assert.ok(painted >= TRIM_MIN, `6: ${label}: its markings are the ${side} team colour (${painted} vertices)`);
      assert.equal(verticesOf(body, new Color(sideColor(other))), 0, `6: ${label}: none in the ${other} colour`);
    }
    const streaks = streaksOf(root, strike);
    // 1: two streaks, drawn, behind the airframe
    assert.ok(streaks.every(Boolean), `1: ${label} has both wingtip streaks`);
    for (const s of streaks) {
      assert.ok(s.visible, `1: ${label}: the streak is drawn`);
      assert.ok(s.geometry.drawRange.count >= 6 * 10, `1: ${label}: the streak has length (${s.geometry.drawRange.count / 6} segments)`);
      // 2: its side's team colour, viewer-relative
      const side = strike.team === perspective ? 'own' : 'enemy';
      assert.equal(s.material.color.getHex(), hex(sideColor(side)), `2: ${label}: the streak is the ${side} team colour`);
      // 4: it fades in from the tip and out along its length
      const alpha = s.geometry.attributes.color.array, n = s.geometry.drawRange.count / 6 + 1;
      const a = (i) => alpha[i * 2 * 4 + 3];
      const peak = Math.max(...Array.from({ length: n }, (_, i) => a(i)));
      assert.ok(a(0) < 0.05, `4: ${label}: it leaves the wingtip softly (${a(0).toFixed(2)})`);
      assert.ok(peak > 0.5, `4: ${label}: it is opaque enough to read just behind the tip (${peak.toFixed(2)})`);
      assert.ok(a(n - 1) < peak * 0.6, `4: ${label}: it fades along its length (${a(n - 1).toFixed(2)} at its end)`);
    }
  }
  // 6: the AC-130s: one model beside each side's anchor, each painted its side's colour
  const gunships = root.children.filter((o) => o.name === 'AC-130 gunship').map((m) => m.getObjectByName('ac130-airframe-body'));
  assert.equal(gunships.length, 2, `6: an AC-130 of each side seen by ${perspective}`);
  const sides = gunships.map((b) => (verticesOf(b, new Color(sideColor('own'))) >= TRIM_MIN ? 'own'
    : verticesOf(b, new Color(sideColor('enemy'))) >= TRIM_MIN ? 'enemy' : 'unpainted')).sort();
  assert.deepEqual(sides, ['enemy', 'own'], `6: the AC-130s seen by ${perspective} are painted own and enemy`);
  world.dispose();
  assert.equal(root.children.length, 0, 'the streaks go with their aircraft');
}
assert.notEqual(hex(sideColor('own')), hex(sideColor('enemy')), '2: own and enemy differ');

// 3: a colour-vision preset moves the enemy's streaks with the enemy's other marks
const enemyBefore = hex(sideColor('enemy')), ownBefore = hex(sideColor('own'));
setActiveTokens({ cvd: 'deutan' });
try {
  assert.notEqual(hex(sideColor('enemy')), enemyBefore, '3: the deutan preset moves the enemy colour');
  const { root, world, air } = fly('alpha');
  for (const strike of air.strikes) {
    const side = strike.team === 'alpha' ? 'own' : 'enemy';
    for (const s of streaksOf(root, strike)) {
      assert.equal(s.material.color.getHex(), hex(sideColor(side)), `3: deutan: ${strike.kind} of ${strike.team} is ${side}'s colour`);
    }
  }
  assert.equal(hex(sideColor('own')), ownBefore, '3: the own colour stays');
  world.dispose();
} finally { setActiveTokens({}); }

// 5: a downed jet's wreck draws no streak
{
  const root = new Group();
  const world = createAirSupportWorld(root, { groundHeight: () => 0 });
  const strike = { id: 9, kind: 'strafe', team: 'bravo', mine: false, x: 0, y: 0, z: 0, heading: 0.6, calledS: 0, landsS: 10,
    hp: 0, maxHp: 1, downedS: 10 };
  const air = { nowS: 0, strikes: [strike] };
  for (let t = 9.5; t < 30; t += 1 / 60) { air.nowS = t; world.update(air, 'alpha', t); }
  const [port, starboard] = streaksOf(root, strike);
  assert.ok(port && starboard && !port.visible && !starboard.visible, '5: the wreck draws no streak');
  world.dispose();
}

console.log(`aircraft streaks: ${KINDS.length} aircraft kinds on both sides draw two wingtip streaks in their side's team colour, viewer-relative and under the deutan preset; each fades; a wreck draws none; every airframe's markings take the same colour (insignia white unpainted)`);
