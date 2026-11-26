// minimapIconHeading.selftest.mjs — (map-icon-heading-278; Kevin 2026-11-26: "for the icons in map make sure they actually
// face the right way, esp plane icons") every directional icon on the minimap (the M map is the same canvas, larger) is
// drawn by the HUD's own painters (hud.ts drawArrowBlip, drawGhostMarker, drawMinimapObjectives over the real marker
// derivation and the real flight, aerialMinimap.ts drawAerialMinimap) into a context that records each path in canvas
// space, and the drawn nose is read from that geometry, never from the angle the code meant to pass.
//
// PASS RULE (written before measuring):
//  1. For each icon and each heading in HEADINGS, the drawn nose points along the world heading's screen direction on the
//     north-up map (two points projected independently, world +Z map-up, world +X map-left) within 1° (vector geometry:
//     no raster error). The nose is read from the drawn shape: the polygon's apex on its mirror axis, farthest from its
//     centroid (arrows, jets, the flown gunship); the AC-130 top view's body axis pointing from the tailplane through the
//     fuselage (three rects); a footprint's long axis (lane or ellipse, either end: they are symmetric).
//  2. An aircraft on the plate is drawn at its run's projected point (within 0.01 px); a footprint is drawn at the map's
//     scale (its long half-axis = metres x 220 / world size, within 1 %).
//  3. An aircraft off the plate sits on the rim on the line from the mark it is inbound to (perpendicular miss <= 0.5 px),
//     and on a straight inbound leg its nose runs down its own drawn approach line (<= 3°).
//  4. The strike view's bearing reads clockwise on the north-up map: map-up 000°, map-right 090°, map-down 180°.
// CONTROLS: the same gate run on deliberately wrong painters must fail: an art forward taken as +x (a 90° turn) and a
// mirrored yaw sign. (The pre-fix hud.ts, with its two worldToMap calls on one shared tuple, drew every aircraft
// nose-south and every footprint at 1 px/m unturned; run against it, rules 1 to 3 fail: the lane's evidence notes.)
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import {
  minimapBearingDegrees, minimapRimPoint, minimapYawForHeading, projectWorldToMinimap,
} from './minimapOrientation.ts';
import { drawAerialMinimap, drawAircraftGlyph } from './aerialMinimap.ts';
import { OBJECTIVE_PALETTE, drawStrikeFootprint, drawStrikeGlyph, sideColor, sideFill } from './objectiveGlyphs.ts';
import { objectiveMarkers } from './minimapObjectives.ts';
import { AIR_SUPPORT_RULES as R } from '../sim/matchRuleset.ts';
import { runFootprint, runPose } from '../sim/strikeRuns.ts';

const DEG = Math.PI / 180;
const HEADINGS = [0, 45, 90, 180, 270, 17, 133, 301].map((d) => d * DEG);
const NOSE_TOL = 1 * DEG, APPROACH_TOL = 3 * DEG;
const WORLD = 1024, MM = 220;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const halfTurn = (a) => { const w = wrap(a); return Math.abs(w) > Math.PI / 2 ? wrap(w + Math.PI) : w; };

/** The truth: the screen angle of a world heading, from two independently projected points. */
function expectedAngle(x, z, yaw) {
  const a = projectWorldToMinimap(x, z, WORLD, MM, [0, 0]);
  const b = projectWorldToMinimap(x + Math.sin(yaw) * 10, z + Math.cos(yaw) * 10, WORLD, MM, [0, 0]);
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}

/** A 2D context recording each painted path in canvas space (the current transform applied to every vertex). */
/** `turn`: the control's mutant for a painter whose turn is internal (the flown gunship): every rotate passes through it. */
function recorder(turn = (r) => r) {
  const ops = [];
  const stack = [];
  let m = [1, 0, 0, 1, 0, 0], subs = [], cur = null, shapes = [];
  const at = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const mul = (n) => { m = [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]; };
  const paint = (op, style) => ops.push({ op, style, subs: subs.map((s) => s.slice()), shapes: shapes.slice(), origin: [m[4], m[5]] });
  const ctx = {
    ops, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineJoin: 'miter', lineCap: 'butt', globalAlpha: 1, lineDashOffset: 0,
    save() { stack.push(m); }, restore() { m = stack.pop() ?? m; },
    translate(x, y) { mul([1, 0, 0, 1, x, y]); }, rotate(r0) { const r = turn(r0); mul([Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]); },
    scale(x, y) { mul([x, 0, 0, y, 0, 0]); }, setTransform(a, b, c, d, e, f) { m = [a, b, c, d, e, f]; },
    beginPath() { subs = []; cur = null; shapes = []; },
    moveTo(x, y) { cur = [at(x, y)]; subs.push(cur); }, lineTo(x, y) { if (!cur) { cur = []; subs.push(cur); } cur.push(at(x, y)); },
    closePath() { cur = null; },
    rect(x, y, w, h) { subs.push([at(x, y), at(x + w, y), at(x + w, y + h), at(x, y + h)]); cur = null; },
    arc(x, y, r) { shapes.push({ kind: 'arc', c: at(x, y), r }); },
    ellipse(x, y, rx, ry, rot) {
      // its semi-axes as drawn: the local x and y axes turned by `rot`, through the current transform
      const c = at(x, y), ax = at(x + Math.cos(rot) * rx, y + Math.sin(rot) * rx), ay = at(x - Math.sin(rot) * ry, y + Math.cos(rot) * ry);
      shapes.push({ kind: 'ellipse', c, ax: [ax[0] - c[0], ax[1] - c[1]], ay: [ay[0] - c[0], ay[1] - c[1]] });
    },
    fill() { paint('fill', ctx.fillStyle); }, stroke() { paint('stroke', ctx.strokeStyle); },
    quadraticCurveTo(cx, cy, x, y) { ctx.lineTo(x, y); }, bezierCurveTo(a, b, c, d, x, y) { ctx.lineTo(x, y); },
    setLineDash() {}, fillRect() {}, strokeRect() {}, fillText() {}, measureText: () => ({ width: 0 }),
  };
  return ctx;
}

/** The nose of a closed polygon: the vertex on its mirror axis farthest from its centroid. */
function polygonNose(points) {
  const n = points.length, cx = points.reduce((s, p) => s + p[0], 0) / n, cy = points.reduce((s, p) => s + p[1], 0) / n;
  let best = null, bestD = -1;
  for (const v of points) {
    const ux = v[0] - cx, uy = v[1] - cy, len = Math.hypot(ux, uy);
    if (len < 1e-6) continue;
    const ex = ux / len, ey = uy / len;
    const mirrored = points.every((p) => {
      const px = p[0] - cx, py = p[1] - cy, along = px * ex + py * ey;
      const rx = cx + 2 * along * ex - px, ry = cy + 2 * along * ey - py;
      return points.some((q) => Math.hypot(q[0] - rx, q[1] - ry) < 0.02);
    });
    if (mirrored && len > bestD) { bestD = len; best = v; }
  }
  assert.ok(best, 'a directional polygon has an apex on its mirror axis');
  return { angle: Math.atan2(best[1] - cy, best[0] - cx), centre: [cx, cy] };
}

/** The AC-130's top view (fuselage, wing, tailplane): its body axis from the tailplane's centre through the fuselage's. */
function gunshipNose(rects) {
  assert.equal(rects.length, 3, 'the AC-130 glyph is its fuselage, wing and tailplane');
  const info = rects.map((r) => {
    const c = [r.reduce((s, p) => s + p[0], 0) / 4, r.reduce((s, p) => s + p[1], 0) / 4];
    const a = Math.hypot(r[1][0] - r[0][0], r[1][1] - r[0][1]), b = Math.hypot(r[2][0] - r[1][0], r[2][1] - r[1][1]);
    return { c, area: a * b };
  });
  const tail = info.reduce((s, r) => (r.area < s.area ? r : s));
  // the fuselage: of the other two, the one whose centre is the glyph's centre (the wing sits forward of it)
  const others = info.filter((r) => r !== tail);
  const all = [info.reduce((s, r) => s + r.c[0], 0) / 3, info.reduce((s, r) => s + r.c[1], 0) / 3];
  const body = others.reduce((s, r) => (Math.hypot(r.c[0] - all[0], r.c[1] - all[1]) < Math.hypot(s.c[0] - all[0], s.c[1] - all[1]) ? r : s));
  return { angle: Math.atan2(body.c[1] - tail.c[1], body.c[0] - tail.c[0]), centre: body.c };
}

// ---- the HUD's own painters, evaluated from hud.ts with the minimap's own bindings ----
const hudSource = await readFile(new URL('./hud.ts', import.meta.url), 'utf8');
function hudPainter(name, nextName, bindings) {
  const begin = hudSource.indexOf(`  function ${name}(`);
  const end = hudSource.indexOf(`  function ${nextName}(`, begin);
  assert.ok(begin >= 0 && end > begin, `${name}: HUD implementation remains discoverable`);
  const javascript = stripTypeScriptTypes(hudSource.slice(begin, end));
  return new Function(...Object.keys(bindings), `${javascript}\nreturn ${name};`)(...Object.values(bindings));
}
// one shared tuple, as hud.ts's worldToMap returns: a painter that keeps it across a second call is caught here
const shared = [0, 0];
const worldToMap = (x, z) => projectWorldToMinimap(x, z, WORLD, MM, shared);

/** Every painter, built on the bindings given (the controls swap in deliberately wrong ones). */
function painters({ yawForHeading = minimapYawForHeading, turn } = {}) {
  const ctx = recorder();
  const arrow = hudPainter('drawArrowBlip', 'pushLiveBlip', { minimapYawForHeading: yawForHeading });
  const ghost = hudPainter('drawGhostMarker', 'drawMinimapBases', { minimapYawForHeading: yawForHeading });
  const objectives = hudPainter('drawMinimapObjectives', 'drawDestroyedMinimapTank', {
    worldToMap, MM, mmCtx: ctx, mapWorldSize: WORLD, FONT_COND: 'sans-serif', minimapYawForHeading: yawForHeading,
    minimapRimPoint, _rim: [0, 0], sideColor, sideFill, OBJECTIVE_PALETTE, drawStrikeFootprint, drawStrikeGlyph,
    drawAircraftGlyph, drawSpawnGlyph() {}, drawHexBadge() {}, drawGoalGlyph() {}, drawBallGlyph() {},
    drawPickupGlyph() {}, drawPennant() {}, drawProgressArc() {}, drawCheck() {}, drawLaneGlyph() {},
    badgeLetter: (x, y, r, color, out) => out, laneLetter: (x, y, r, out) => out, mapLetter: {}, placeMapLetter() {},
  });
  return { ctx, arrow, ghost, objectives, turn };
}

/** A strike's public record, as the sim's view carries it. */
const strikeOf = (kind, heading, x, z, team = 'bravo') => ({ id: 3, kind, team, x, y: 0, z, heading, calledS: 0, landsS: 12, endS: 40, downedS: null });

/** Rules 1 to 3 against one set of painters; returns the failures (empty: PASS). */
function gate(p) {
  const fails = [];
  const check = (ok, what) => { if (!ok) fails.push(what); };
  const last = (op) => p.ctx.ops.filter((o) => o.op === op).at(-1);
  for (const h of HEADINGS) {
    const tag = `${Math.round(h / DEG)}°`;
    // the tank arrow and the stale-contact arrow
    for (const [name, draw] of [['tank arrow', (c) => p.arrow(c, 110, 110, h, '#7ee87e', 5, 1)], ['ghost arrow', (c) => p.ghost(c, 110, 110, h)]]) {
      p.ctx.ops.length = 0;
      draw(p.ctx);
      const op = p.ctx.ops.find((o) => o.subs.length === 1 && o.subs[0].length === 4);
      const nose = polygonNose(op.subs[0]);
      check(Math.abs(wrap(nose.angle - expectedAngle(0, 0, h))) <= NOSE_TOL, `${name} ${tag}: nose ${(nose.angle / DEG).toFixed(1)}°`);
    }
    // the aircraft over the real flight, over a mark at the map's centre (on the plate)
    for (const kind of ['strafe', 'bomb', 'gunship']) {
      p.ctx.ops.length = 0;
      const strike = strikeOf(kind, h, 0, 0, 'alpha');
      // the first moment of its run within 250 m of the mark (well on the plate)
      let nowS = 0;
      for (let t = 0; t < 40; t += 0.05) { const q = runPose(R, strike, t, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 }); if (Math.hypot(q.x, q.z) < 250) { nowS = t; break; } }
      check(nowS > 0, `${kind} ${tag}: its run reaches the mark`);
      const markers = objectiveMarkers({ id: 'air_support', perspectiveTeam: 'alpha', air: { nowS, strikes: [strike] } })
        .filter((mk) => mk.kind === 'aircraft');
      p.objectives(markers, nowS, 999, 999, false);
      const pose = runPose(R, strike, nowS, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 });
      const fill = last('fill');
      const nose = kind === 'gunship' ? gunshipNose(fill.subs) : polygonNose(fill.subs[0]);
      const want = expectedAngle(pose.x, pose.z, pose.yaw);
      check(Math.abs(wrap(nose.angle - want)) <= NOSE_TOL,
        `${kind} aircraft ${tag}: nose ${(nose.angle / DEG).toFixed(1)}°, flight ${(want / DEG).toFixed(1)}°`);
      const at = projectWorldToMinimap(pose.x, pose.z, WORLD, MM, [0, 0]);
      check(Math.hypot(fill.origin[0] - at[0], fill.origin[1] - at[1]) <= 0.01, `${kind} aircraft ${tag}: drawn at (${fill.origin.map((v) => v.toFixed(2))}), its run at (${at.map((v) => v.toFixed(2))})`);
    }
    // the footprints with a long axis: the strafing lane, the recon track, the bomb's ellipse
    for (const kind of ['strafe', 'recon', 'bomb']) {
      p.ctx.ops.length = 0;
      const strike = strikeOf(kind, h, 60, -40, 'alpha');
      const markers = objectiveMarkers({ id: 'air_support', perspectiveTeam: 'alpha', air: { nowS: 13, strikes: [strike] } })
        .filter((mk) => mk.kind === 'strike');
      p.objectives(markers, 13, 999, 999, false);
      const fp = runFootprint(R, kind);
      const wantLen = (fp.shape === 'lane' ? fp.halfLengthM : fp.alongM) * MM / WORLD;
      const op = p.ctx.ops[0];
      let axis, len;
      if (fp.shape === 'ellipse') {
        const e = op.shapes.find((s) => s.kind === 'ellipse');
        const ax = Math.hypot(...e.ax), ay = Math.hypot(...e.ay);
        const v = ax > ay ? e.ax : e.ay;
        axis = Math.atan2(v[1], v[0]); len = Math.max(ax, ay);
      } else {
        const q = op.subs[0];
        const s01 = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), s12 = Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1]);
        const [a, b] = s01 > s12 ? [q[0], q[1]] : [q[1], q[2]];
        axis = Math.atan2(b[1] - a[1], b[0] - a[0]); len = Math.max(s01, s12) / 2;
      }
      check(Math.abs(halfTurn(axis - expectedAngle(60, -40, h))) <= NOSE_TOL, `${kind} footprint ${tag}: long axis ${(axis / DEG).toFixed(1)}°`);
      check(Math.abs(len / wantLen - 1) <= 0.01, `${kind} footprint ${tag}: half length ${len.toFixed(2)} px, want ${wantLen.toFixed(2)}`);
    }
    // rule 3: inbound from off the plate (the first half second of the run: kilometres out), the mark off-centre
    for (const kind of ['recon', 'strafe', 'bomb', 'missile']) {
      for (const [mx, mz] of [[0, 0], [300, -350], [-400, 200]]) {
        p.ctx.ops.length = 0;
        const strike = strikeOf(kind, h, mx, mz, 'bravo');
        const nowS = 0.5;
        const markers = objectiveMarkers({ id: 'air_support', perspectiveTeam: 'alpha', air: { nowS, strikes: [strike] } })
          .filter((mk) => mk.kind === 'aircraft');
        p.objectives(markers, nowS, 999, 999, false);
        const pose = runPose(R, strike, nowS, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 });
        const truePt = projectWorldToMinimap(pose.x, pose.z, WORLD, MM, [0, 0]);
        if (truePt[0] >= 7 && truePt[0] <= MM - 7 && truePt[1] >= 7 && truePt[1] <= MM - 7) continue;
        const mark = projectWorldToMinimap(mx, mz, WORLD, MM, [0, 0]);
        const nose = polygonNose(last('fill').subs[0]);
        // the icon's point: the glyph is drawn about it; its apex sits 1.1 r up the nose, the centroid a little behind
        const line = p.ctx.ops.find((o) => o.op === 'stroke' && o.subs[0]?.length === 2);
        const [from, to] = line.subs[0];
        const ux = truePt[0] - mark[0], uy = truePt[1] - mark[1], ul = Math.hypot(ux, uy);
        const icon = last('fill').origin;
        check(Math.hypot(icon[0] - from[0], icon[1] - from[1]) <= 0.01, `${kind} inbound ${tag}: the approach line starts at the icon`);
        const miss = Math.abs((icon[0] - mark[0]) * uy - (icon[1] - mark[1]) * ux) / ul;
        check(miss <= 0.5, `${kind} inbound ${tag} mark(${mx},${mz}): icon ${miss.toFixed(1)} px off its approach line`);
        const approach = Math.atan2(to[1] - from[1], to[0] - from[0]);
        check(Math.abs(wrap(nose.angle - approach)) <= APPROACH_TOL,
          `${kind} inbound ${tag} mark(${mx},${mz}): nose ${(nose.angle / DEG).toFixed(0)}° vs approach ${(approach / DEG).toFixed(0)}°`);
      }
    }
    // the flown AC-130's own marker (aerialMinimap.ts), nose along its orbit
    {
      const ctx = recorder(p.turn);
      drawAerialMinimap(ctx, { kind: 'gunship', x: 0, y: 240, z: 0, yaw: h }, { x: 0, z: 0 }, null, { x: 0, z: 1 }, worldToMap, MM / WORLD);
      const fill = ctx.ops.filter((o) => o.op === 'fill' && o.subs.length === 1 && o.subs[0].length === 9).at(-1);
      const nose = polygonNose(fill.subs[0]);
      check(Math.abs(wrap(nose.angle - expectedAngle(0, 0, h))) <= NOSE_TOL, `flown gunship ${tag}: nose ${(nose.angle / DEG).toFixed(1)}°`);
    }
  }
  return fails;
}

const fails = gate(painters());
assert.deepEqual(fails, [], `every directional map icon faces its heading:\n  ${fails.join('\n  ')}`);

// the controls: deliberately wrong painters must fail the same gate
const artForwardX = gate(painters({ yawForHeading: (yaw) => minimapYawForHeading(yaw) + Math.PI / 2, turn: (r) => r + Math.PI / 2 }));
const ICONS = ['tank arrow', 'ghost arrow', 'strafe aircraft', 'bomb aircraft', 'gunship aircraft', 'strafe footprint', 'recon footprint',
  'bomb footprint', 'inbound', 'flown gunship'];
const caught = (list) => ICONS.filter((name) => !list.some((f) => f.includes(name)));
assert.deepEqual(caught(artForwardX), [], `control: an art forward taken as +x fails for every icon (${artForwardX.length} failures)`);
const mirrored = gate(painters({ yawForHeading: (yaw) => -minimapYawForHeading(yaw), turn: (r) => -r }));
assert.deepEqual(caught(mirrored), [],
  `control: a mirrored yaw sign fails for every icon (${mirrored.length} failures)`);

// rule 4: the strike view's bearing, clockwise on the north-up map
assert.equal(minimapBearingDegrees(0), 0, 'world +Z (map-up) reads 000°');
assert.equal(minimapBearingDegrees(-Math.PI / 2), 90, 'world -X (map-right) reads 090°');
assert.equal(minimapBearingDegrees(Math.PI), 180, 'world -Z (map-down) reads 180°');
assert.equal(minimapBearingDegrees(Math.PI / 2), 270, 'world +X (map-left) reads 270°');
assert.equal(minimapBearingDegrees(-0.0001), 0, 'a hair right of north rounds to 000°, never 360°');
for (const h of HEADINGS) {
  const b = minimapBearingDegrees(h) * DEG;
  assert.ok(Math.abs(wrap(Math.atan2(-Math.cos(b), Math.sin(b)) - expectedAngle(0, 0, h))) <= 0.6 * DEG,
    `the bearing for ${Math.round(h / DEG)}° names the direction the map draws`);
}
const airHud = await readFile(new URL('./airSupportHud.ts', import.meta.url), 'utf8');
assert.match(airHud, /setText\(bearing, `\$\{String\(minimapBearingDegrees\(strikeView\.heading\)\)/,
  'the binoculars read the run\'s bearing through the map\'s own helper');

console.log(`minimapIconHeading.selftest: arrows, aircraft (jet, AC-130, flown gunship), footprints and inbound rim placement face their headings at ${HEADINGS.length} headings; controls fail (art +x ${artForwardX.length}, mirrored ${mirrored.length}); bearing clockwise`);
