// Aircraft trails in the team colour (aircraft-streaks-277; Kevin 2026-11-24: "in air support/combined arms, make ur side
// planes have blue streaks and other side have red", then "make the colors on planes dependent on your team color thats
// all"), and trails that never end by a cut (aircraft-trails-278; Kevin 2026-11-25: "make the aircraft trails much much
// better instead of having a hard cut off point"). game/airSupportWorld.ts lays two wingtip trails (game/aircraftStreaks.ts)
// behind every aircraft it flies, in the colour its side already shows on the footprints, the minimap and the markers:
// ui/objectiveGlyphs.ts sideColor('own') or sideColor('enemy'), relative to the viewer's team. Pins, on the real
// airSupportWorld and the real airframes, reading what is drawn (every visible trail mesh's triangles in its draw range,
// each laid point a vertex pair, its drawn alpha the vertex alpha x the opacity x the across-profile the material maps):
//   1. census: every aircraft the world flies (each strike kind that flies: the A-10's recon and strafing runs, the
//      fighter's bomb and Maverick runs, the AC-130's orbit), on either side, draws two trails from its wingtips;
//   2. a trail's colour is its side's team colour as the viewer sees it: own for the viewer's team, enemy for the other,
//      and they swap when the viewer is on the other team (each peer, a replay or a spectated player sees its own blue);
//   3. a colour-vision preset (deutan) moves the enemy trail with every other enemy mark; the own stays its own;
//   4. a trail keeps its fade: it leaves the wingtip softly, is opaque enough to read behind it and fades along its length;
//   5. (278) no cut: a point drawn with alpha above EPS is drawn the next frame too, through a run flown to its exit and
//      past it (every kind), a jet downed into its wreck, a record the view drops mid-flight, a networked client's
//      lagging snapshot clock and a kill-cam replay on its own clock; every strip's oldest point is at most EPS; no
//      drawn point's alpha jumps more than POP a frame; the trail outlives its aircraft (drawn past EPS a second after
//      it went) and is gone by its life's end; a wreck lays none;
//   6. (278) soft edges: the ribbon's alpha across its width is zero at both edges;
//   7. (Kevin: "on the actual vehicles add more detailling and coloring") every airframe carries team trim (its markings:
//      fin caps, wingtips, a band, the roundels' centres) in its one geometry, painted the same viewer-relative team
//      colour as its trails; an airframe nobody paints (the AC-130 mode, the renders) keeps it insignia white.
// The pass rule was written before measuring (~/cot-lanes/aircraft-trails-278-notes/PASS-RULE.md); origin/main's
// per-aircraft ribbons fail 5 (a whole trail dropped at the exit, the wreck and a dropped record) and 6.
import assert from 'node:assert/strict';
import { Color, Group } from 'three';
import { createAirSupportWorld } from './airSupportWorld.ts';
import { loadGunshipAirframe } from './gunshipVisual.ts';
import { AIR_SUPPORT_RULES, airStrikeFlies } from '../sim/matchRuleset.ts';
import { runExitS, runPose } from '../sim/strikeRuns.ts';
import { killcamStage } from './killcamStage.ts';
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
const EPS = 0.02, POP = 0.1;

/** The across-profile the material draws at u (its alphaMap's green, linearly filtered; none: 1). */
function profileOf(material) {
  const map = material.alphaMap;
  if (!map) return () => 1;
  const { data, width } = map.image;
  return (u) => {
    const x = Math.min(width - 1, Math.max(0, u * width - 0.5)), i = Math.floor(x), j = Math.min(width - 1, i + 1);
    return (data[i * 4 + 1] * (1 - (x - i)) + data[j * 4 + 1] * (x - i)) / 255;
  };
}
/** What is drawn: every visible trail mesh's strips (runs of segments joined vertex pair to vertex pair), each a list of
 *  points newest first: [x, y, z (the pair's centre), drawn alpha, r, g, b (vertex colour x material colour)]. */
function drawn(root) {
  const strips = [];
  root.traverse((o) => {
    if (!o.isMesh || !/streak|trail/.test(o.name) || !o.visible) return;
    const g = o.geometry, idx = g.index.array, { start, count } = g.drawRange;
    const pos = g.attributes.position.array, col = g.attributes.color.array, cs = g.attributes.color.itemSize;
    const uv = g.attributes.uv?.array, profile = profileOf(o.material);
    const op = o.material.opacity ?? 1, mc = o.material.color;
    const point = (pair) => {
      const a = pair * 2, b = a + 1;
      const peak = uv ? Math.max(...[0, 0.25, 0.5, 0.75, 1].map((f) => profile(uv[a * 2] + (uv[b * 2] - uv[a * 2]) * f))) : 1;
      return [(pos[a * 3] + pos[b * 3]) / 2, (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2, (pos[a * 3 + 2] + pos[b * 3 + 2]) / 2,
        (cs === 4 ? col[a * 4 + 3] : 1) * op * peak, col[a * cs] * mc.r, col[a * cs + 1] * mc.g, col[a * cs + 2] * mc.b];
    };
    let strip = null, last = -1;
    for (let i = start; i < Math.min(idx.length, start + count); i += 6) {
      const pair = idx[i] >> 1;
      if (pair !== last) { strip = [point(pair)]; strips.push({ mesh: o, strip }); }
      strip.push(point(pair + 1));
      last = pair + 1;
    }
  });
  return strips;
}
/** The material edge profile of every visible trail mesh at u = 0 and 1 (and its peak). */
function edgesOf(root) {
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh || !/streak|trail/.test(o.name)) return;
    const uv = o.geometry.attributes.uv?.array, profile = profileOf(o.material);
    const us = uv ? [0, 1] : [null];
    out.push({ name: o.name, edge: Math.max(...us.map((u) => (u == null ? 1 : profile(u)))), peak: uv ? profile(0.5) : 1 });
  });
  return out;
}

/** The no-cut watch: frame to frame, every point drawn past EPS must still be drawn (its centre within 2 cm). */
function watcher(label) {
  let prev = null, prevT = -Infinity;
  const cuts = [], pops = [];
  let tail = 0;
  return {
    cuts, pops,
    get tail() { return tail; },
    /** `t`: the view's clock this frame (a point may move POP per 1/60 s of it) */
    frame(root, t) {
      const strips = drawn(root), pts = [];
      for (const { strip } of strips) { tail = Math.max(tail, strip[strip.length - 1][3]); pts.push(...strip); }
      const grid = new Map();
      for (const q of pts) { const k = `${Math.floor(q[0])},${Math.floor(q[1])},${Math.floor(q[2])}`; (grid.get(k) ?? grid.set(k, []).get(k)).push(q); }
      const allowed = POP * Math.max(1, (t - prevT) * 60 + 1e-6);
      if (prev) for (const q of prev) {
        let match = null;
        const gx = Math.floor(q[0]), gy = Math.floor(q[1]), gz = Math.floor(q[2]);
        for (let dx = -1; dx <= 1 && !match; dx++) for (let dy = -1; dy <= 1 && !match; dy++) for (let dz = -1; dz <= 1 && !match; dz++)
          for (const r of grid.get(`${gx + dx},${gy + dy},${gz + dz}`) ?? []) if (Math.hypot(r[0] - q[0], r[1] - q[1], r[2] - q[2]) < 0.02) { match = r; break; }
        if (!match) { if (q[3] > EPS) cuts.push(`${label} t=${t.toFixed(3)} alpha ${q[3].toFixed(3)}`); }
        else if (Math.abs(match[3] - q[3]) > allowed) pops.push(`${label} t=${t.toFixed(3)} ${q[3].toFixed(3)} -> ${match[3].toFixed(3)}`);
      }
      prev = pts; prevT = t;
      return pts;
    },
  };
}
const peakOf = (pts) => pts.reduce((m, q) => Math.max(m, q[3]), 0);
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

// 7: unpainted, every airframe's trim is insignia white
const insignia = new Color(INSIGNIA);
const TRIM_MIN = 400;
for (const [name, build] of [['A-10', buildStrikeJetAirframe], ['fighter', buildFighterJetAirframe],
  ['AC-130', loadedGunshipAirframe().buildGunshipAirframe]]) {
  const built = build(null);
  const body = built.root.children.find((o) => o.isMesh && o.geometry.attributes.color.count > 1000);
  assert.ok(body, `7: ${name}: its body`);
  const white = verticesOf(body, insignia);
  assert.ok(white >= TRIM_MIN, `7: ${name}: its markings are on the airframe (${white} insignia vertices)`);
  assert.equal(verticesOf(body, new Color(sideColor('own'))), 0, `7: ${name}: unpainted, nothing on it is a team colour`);
  built.dispose();
}

/** Strips whose newest point is at `strike`'s wingtips now (within 30 m of the airframe at time t). */
function stripsOf(root, strike, t) {
  const p = runPose(R, strike, t, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 });
  return drawn(root).filter(({ strip }) => Math.hypot(strip[0][0] - p.x, strip[0][1] - p.y, strip[0][2] - p.z) < 30);
}
const near = (a, b) => Math.abs(a - b) < 1e-4;
const ofColour = (q, css) => { const c = new Color(css); return near(q[4], c.r) && near(q[5], c.g) && near(q[6], c.b); };

for (const perspective of ['alpha', 'bravo']) {
  const { root, world, air } = fly(perspective);
  const end = Math.min(...KINDS.map((k) => R[k].warningS));
  for (const strike of air.strikes) {
    const label = `${strike.kind} of ${strike.team} seen by ${perspective}`;
    // 7: its markings in its side's team colour (the AC-130's model is shared by gunship strikes: one per anchor, so
    // checked on a strike of each side)
    if (strike.kind !== 'gunship') {
      const side = strike.team === perspective ? 'own' : 'enemy', other = side === 'own' ? 'enemy' : 'own';
      const body = bodyOf(root, strike);
      assert.ok(body, `7: ${label}: its body`);
      const painted = verticesOf(body, new Color(sideColor(side)));
      assert.ok(painted >= TRIM_MIN, `7: ${label}: its markings are the ${side} team colour (${painted} vertices)`);
      assert.equal(verticesOf(body, new Color(sideColor(other))), 0, `7: ${label}: none in the ${other} colour`);
    }
    // 1: two trails from its wingtips, with length
    const mine = stripsOf(root, strike, end);
    assert.equal(mine.length, 2, `1: ${label} draws both wingtip trails (${mine.length})`);
    for (const { strip } of mine) {
      assert.ok(strip.length >= 10, `1: ${label}: the trail has length (${strip.length} points)`);
      // 2: its side's team colour, viewer-relative
      const side = strike.team === perspective ? 'own' : 'enemy';
      assert.ok(strip.every((q) => ofColour(q, sideColor(side))), `2: ${label}: the trail is the ${side} team colour`);
      // 4: it fades in from the tip and out along its length
      const peak = peakOf(strip), a0 = strip[0][3], aN = strip[strip.length - 1][3];
      assert.ok(a0 < 0.05, `4: ${label}: it leaves the wingtip softly (${a0.toFixed(2)})`);
      assert.ok(peak > 0.5, `4: ${label}: it is opaque enough to read behind the tip (${peak.toFixed(2)})`);
      assert.ok(aN < peak * 0.6, `4: ${label}: it fades along its length (${aN.toFixed(2)} at its end)`);
    }
  }
  // 7: the AC-130s: one model beside each side's anchor, each painted its side's colour
  const gunships = root.children.filter((o) => o.name === 'AC-130 gunship').map((m) => m.getObjectByName('ac130-airframe-body'));
  assert.equal(gunships.length, 2, `7: an AC-130 of each side seen by ${perspective}`);
  const sides = gunships.map((b) => (verticesOf(b, new Color(sideColor('own'))) >= TRIM_MIN ? 'own'
    : verticesOf(b, new Color(sideColor('enemy'))) >= TRIM_MIN ? 'enemy' : 'unpainted')).sort();
  assert.deepEqual(sides, ['enemy', 'own'], `7: the AC-130s seen by ${perspective} are painted own and enemy`);
  // 6: soft edges
  for (const e of edgesOf(root)) {
    assert.ok(e.edge <= EPS && e.peak > 0.95, `6: ${e.name}: the ribbon is soft across its width (edge ${e.edge.toFixed(3)}, line ${e.peak.toFixed(2)})`);
  }
  world.dispose();
  assert.equal(root.children.length, 0, 'the trails go with the world');
}
assert.notEqual(hex(sideColor('own')), hex(sideColor('enemy')), '2: own and enemy differ');

// 3: a colour-vision preset moves the enemy's trails with the enemy's other marks
const enemyBefore = hex(sideColor('enemy')), ownBefore = hex(sideColor('own'));
setActiveTokens({ cvd: 'deutan' });
try {
  assert.notEqual(hex(sideColor('enemy')), enemyBefore, '3: the deutan preset moves the enemy colour');
  const { root, world, air } = fly('alpha');
  const end = Math.min(...KINDS.map((k) => R[k].warningS));
  for (const strike of air.strikes) {
    const side = strike.team === 'alpha' ? 'own' : 'enemy';
    for (const { strip } of stripsOf(root, strike, end)) {
      assert.ok(strip.every((q) => ofColour(q, sideColor(side))), `3: deutan: ${strike.kind} of ${strike.team} is ${side}'s colour`);
    }
  }
  assert.equal(hex(sideColor('own')), ownBefore, '3: the own colour stays');
  world.dispose();
} finally { setActiveTokens({}); }

// 5: no cut, frame by frame at 60 Hz
const STEP = 1 / 60;
const run = (id, kind, extra = {}) => ({ id, kind, team: 'bravo', mine: false, x: 0, y: 0, z: 0, heading: 0.5, calledS: 0,
  landsS: R[kind].warningS, hp: R[kind].hp, maxHp: R[kind].hp, downedS: null, ...extra });
/** Flies `strikes` from `from` to `to`; `clock(frame, t)` gives the view's snapshot time; `mutate` edits the view.
 *  Returns the watch and, per frame, the strongest drawn alpha. */
function watch(label, strikes, { from = 0, to, clock = (f, t) => t, mutate = null }) {
  const root = new Group();
  const world = createAirSupportWorld(root, { viewerPosition: () => ({ x: 0, y: 2, z: 0 }), groundHeight: () => 0 });
  const air = { nowS: from, strikes };
  const w = watcher(label), peaks = [];
  // the view's clock as airSupportWorld.ts runs it: the snapshot's time, advanced by the frame's own since it came
  let f = 0, lastNow = -1, since = 0, lastT = from;
  for (let t = from; t <= to + 1e-9; t += STEP, f++) {
    mutate?.(air, t);
    air.nowS = clock(f, t);
    if (air.nowS !== lastNow) { lastNow = air.nowS; since = 0; } else since = Math.min(0.25, since + Math.max(0, t - lastT));
    lastT = t;
    world.update(air, 'alpha', t);
    peaks.push([t, peakOf(w.frame(root, lastNow + since))]);
  }
  world.dispose();
  return { w, peaks };
}
function settle(label, w) {
  assert.deepEqual(w.cuts.slice(0, 3), [], `5: ${label}: no point drawn past ${EPS} leaves the drawing (${w.cuts.length} cut)`);
  assert.deepEqual(w.pops.slice(0, 3), [], `5: ${label}: no drawn point's alpha jumps more than ${POP} a frame`);
  assert.ok(w.tail <= EPS, `5: ${label}: every strip's oldest point is at most ${EPS} (${w.tail.toFixed(3)})`);
}
/** After `goneS` (the aircraft left), something is still drawn past EPS a second later, and nothing past its life. */
function outlives(label, peaks, goneS, lifeS) {
  const after = (s) => peaks.filter(([t]) => t >= goneS + s).map(([, a]) => a);
  assert.ok(after(1)[0] > EPS, `5: ${label}: the trail is still drawn a second after its aircraft went (${(after(1)[0] ?? 0).toFixed(3)})`);
  assert.ok(Math.max(0, ...after(lifeS + 0.2)) === 0, `5: ${label}: and gone by its life's end`);
}
const LIFE = { recon: 4, strafe: 4, bomb: 4, missile: 4, gunship: 7 };
const summary = [];
for (const kind of KINDS) {
  const strike = run(1, kind), exit = runExitS(R, strike);
  const { w, peaks } = watch(`${kind} to its exit`, [strike], { to: exit + LIFE[kind] + 1 });
  settle(`${kind} flown to its exit and past it`, w);
  outlives(`${kind} past its exit`, peaks, exit, LIFE[kind]);
  summary.push(`${kind} ${(exit).toFixed(1)} s`);
}
{
  // a strafer downed mid-run: it falls, meets the ground and lies a wreck; its trail fades where it was laid
  const downed = run(2, 'strafe');
  const { w, peaks } = watch('downed strafer', [downed], { to: 20,
    mutate: (air, t) => { if (t >= 4 && downed.downedS == null) { downed.downedS = t; downed.hp = 0; } } });
  settle('a jet downed into its wreck', w);
  const lastLaid = peaks.findLast(([, a]) => a > EPS)?.[0] ?? 0;
  assert.ok(lastLaid < 20 - 1, '5: the wreck lays no trail (it is all gone before the run ends)');
}
{
  const { w, peaks } = watch('dropped record', [run(3, 'strafe')], { to: 11, mutate: (air, t) => { if (t > 5) air.strikes = []; } });
  settle('a record the view drops mid-flight', w);
  outlives('a dropped record', peaks, 5, LIFE.strafe);
}
for (const kind of ['strafe', 'gunship']) {
  // a networked client: snapshots every ~50 ms, landing late by up to 20 ms (the presentation clock steps back)
  let snap = 0;
  const lag = (f, t) => { if (t - snap >= 0.05 + 0.02 * Math.sin(f * 1.7)) snap = t - 0.02 * Math.abs(Math.sin(f * 0.9)); return snap; };
  const { w } = watch(`networked ${kind}`, [run(4, kind)], { to: 12, clock: lag });
  settle(`a networked client's ${kind}`, w);
}
{
  // a kill-cam replay of a strafing run on its own clock (behind the battle's): only its trail is drawn, never cut
  const strike = run(5, 'strafe');
  const root = new Group();
  const world = createAirSupportWorld(root, { viewerPosition: () => ({ x: 0, y: 2, z: 0 }), groundHeight: () => 0 });
  const w = watcher('replay');
  const air = { nowS: 0, strikes: [] };
  killcamStage.live = true; killcamStage.strike = strike;
  try {
    for (let s = 2; s < 9; s += STEP) {
      killcamStage.strikeTimeS = s;
      world.update(air, 'alpha', s);
      w.frame(root, s);
    }
  } finally { killcamStage.live = false; killcamStage.strike = null; }
  world.dispose();
  settle('a kill-cam replay', w);
}

console.log(`aircraft streaks: ${KINDS.length} aircraft kinds on both sides draw two wingtip trails in their side's team colour, viewer-relative and under the deutan preset; each fades in and out, soft across its width; no trail is cut (no point past ${EPS} leaves the drawing) through its exit (${summary.join(', ')}), a wreck, a dropped record, a networked clock and a replay, and each outlives its aircraft; every airframe's markings take the same colour (insignia white unpainted)`);
