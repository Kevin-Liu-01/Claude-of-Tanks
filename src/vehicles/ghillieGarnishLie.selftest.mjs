// A field suit's garnish lies on its net (netting-proper, 2026-10-13). The owner on the fleet's field suits: "make sure
// roof ghillie and leaves aren't as ridiculously placed like peacock feathers, make them more proper". The fix round
// stood each clump's boughs out of the net in every direction, 17 to 62 degrees off it and up to 55 cm over a turret roof,
// and stood boughs up past the roof line from the drapes' top cords (ghillieSuit.ts addFieldTufts).
//
// For representative field suits (ghillieFleetSuits.ts and the Ukrainian concept hulls), built HIGH, this receipt reads
// every garnish card (24 vertices, vehicleFoliage.ts FoliageCardBuffer.push) of each owner against its roof and deck
// nets (the net mesh's leading GHILLIE_TOP_VERTICES) and checks:
//   1. a roof or deck card (the leading GHILLIE_TOP_CARDS of its mesh) stands no more than 12 cm (and 2 cm of the net's
//      own interpolation) over the roof net under it anywhere along it (the highest roof-net point under each vertex,
//      within 25 cm under the card's stem: a deck far below a roof's edge is not the net it lies on); where it spills past
//      the net's edge or over a gap in it, no point of it stands more than 12 cm over its stem;
//   2. its face lies on the net's: within 25 degrees of the plane of the net under it (fitted through the net's heights
//      under its face, without the net's own spikes; a card with no footprint, one standing up, is held to the net's plane
//      round its stem) for at least 90 % of a hull's roof cards, and more than 60 degrees for at most 2 % of them (at least
//      one: a card where two nets meet is measured against the higher);
//   3. no drape card's spine rises more than 20 degrees (nothing stands up out of a drape past the roof line);
//   4. (netting-proper round 2; three critics on the Mk 4B: "the plume is gone, but nothing replaced it ... a low draped
//      net with flat foliage is needed across the turret roof") a turret roof net of 2 m2 or more is covered in plan by
//      its own lying roof cards over at least 30 % of it (2 cm cells; the Mk 4B's had fallen to 26 % when the fix round's
//      boughs were first laid flat, main's standing clumps 39 %).
//   5. (netting-proper round 2; a critic on the Mk 4B: "a large dark fan of long blades or strips spreads out sideways
//      from the turret's side") a drape card tucked where its drape lies level, and laid within 30 degrees of level,
//      lies over the cloth: in plan no point of it more than 30 cm from the owner's net (the boughs standing straight
//      out of the Mk 4B's bustle drape where it rolled level over the basket's edge reached 34 to 38 cm past it);
//   6. (netting-proper round 2) no three roof cards fan out of one point: among cards whose stems lie within 3 cm of
//      each other, no three point more than 40 degrees apart in plan (the Mk 4B carried seven such fans of 3 or 4
//      boughs and strips, each turned its own way where a clump's bare seat took them all).
import assert from 'node:assert/strict';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';

installCanvasFixture();
const { createTank } = await import('./tankFactory.ts');
const { GHILLIE_TOP_CARDS, GHILLIE_TOP_VERTICES } = await import('./ghillieDrape.ts');

const IDS = process.env.GARNISH_LIE_DEBUG ? [process.env.GARNISH_LIE_DEBUG] : ['cv90', 'merkava4b', 'ua_t72b3m_hetman_ii', 'leo2_revolution', 'griffin_viper', 'm1a3', 'strv103', 'ztz99a2'];
// netting-pl (2026-10-13; the owner: "also add a bunch of ghillie on the husarz and zubr polish tanks"): the Polish field
// suits (nationalPolandProtectionConfig.ts, hung on the slat screens) lay theirs the same way
if (!process.env.GARNISH_LIE_DEBUG) IDS.push('pl_t80u_modern', 'pl_t72b3_zubr_ii');
const LIFT_M = 0.12, LIFT_TOL_M = 0.02, OWN_NET_M = 0.25, EDGE_RISE_M = 0.12;
// GARNISH_LIE_DEBUG=<id>: list that hull's tilted roof cards
const DEBUG_ID = process.env.GARNISH_LIE_DEBUG;
const TILT_DEG = 25, TILT_SHARE = 0.9, TILT_MAX_DEG = 60, STEEP_SHARE = 0.02, DRAPE_RISE_DEG = 20;
const COVER_CELL_M = 0.02, COVER_MIN_NET_M2 = 2, COVER_MIN_SHARE = 0.3, DRAPE_PLAN_REACH_M = 0.3, FAN_STEM_M = 0.03, FAN_SPREAD_DEG = 40;

/**
 * An owner's net for its drape garnish: `level(p)`, whether the drape cloth nearest a point (within 30 cm; its net mesh
 * after the leading `top` roof vertices) lies level (its normal within 53 degrees of vertical: a roll over a roof's edge,
 * a net over a cage's top), and `reach(p)`, how far in plan the point lies from the nearest of the whole net's vertices
 * and edge midpoints (searched to 0.6 m).
 */
function drapeCloth(net, top) {
  const pos = net.geometry.attributes.position, C = 0.1, tris = new Map(), pts = new Map(), P = 0.05;
  for (let t = 0; t + 2 < pos.count; t += 3) {
    const a = [pos.getX(t), pos.getY(t), pos.getZ(t)], b = [pos.getX(t + 1), pos.getY(t + 1), pos.getZ(t + 1)];
    const c = [pos.getX(t + 2), pos.getY(t + 2), pos.getZ(t + 2)];
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      for (const q of [u, [(u[0] + v[0]) / 2, 0, (u[2] + v[2]) / 2]]) {
        const key = `${Math.floor(q[0] / P)},${Math.floor(q[2] / P)}`;
        if (!pts.has(key)) pts.set(key, []);
        pts.get(key).push([q[0], q[2]]);
      }
    }
    if (t < top) continue;
    const raw = cross(sub(b, a), sub(c, a));
    if (Math.hypot(...raw) < 1e-12) continue;
    const ny = Math.abs(norm(raw)[1]), m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const key = `${Math.floor(m[0] / C)},${Math.floor(m[1] / C)},${Math.floor(m[2] / C)}`;
    if (!tris.has(key)) tris.set(key, []);
    tris.get(key).push([m, ny]);
  }
  return {
    level(p) {
      let best = 0.3, ny = 0;
      const i0 = Math.floor(p[0] / C), j0 = Math.floor(p[1] / C), k0 = Math.floor(p[2] / C);
      for (let i = i0 - 3; i <= i0 + 3; i++) for (let j = j0 - 3; j <= j0 + 3; j++) for (let k = k0 - 3; k <= k0 + 3; k++) {
        for (const [m, n] of tris.get(`${i},${j},${k}`) ?? []) {
          const d = Math.hypot(m[0] - p[0], m[1] - p[1], m[2] - p[2]);
          if (d < best) { best = d; ny = n; }
        }
      }
      return ny > 0.6;
    },
    reach(p) {
      let best = 0.6;
      const i0 = Math.floor(p[0] / P), j0 = Math.floor(p[2] / P), R = Math.ceil(0.6 / P);
      for (let i = i0 - R; i <= i0 + R; i++) for (let j = j0 - R; j <= j0 + R; j++) {
        for (const [x, z] of pts.get(`${i},${j}`) ?? []) best = Math.min(best, Math.hypot(x - p[0], z - p[2]));
      }
      return best;
    },
  };
}

/** The 2 cm plan cells a run of triangles (flat [x, y, z] triples, from `from` to `to` vertices) covers. */
function planCells(pos, from, to, cells) {
  const C = COVER_CELL_M;
  for (let t = from; t + 2 < to; t += 3) {
    const ax = pos.getX(t), az = pos.getZ(t), bx = pos.getX(t + 1), bz = pos.getZ(t + 1), cx = pos.getX(t + 2), cz = pos.getZ(t + 2);
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-10) continue;
    for (let i = Math.floor(Math.min(ax, bx, cx) / C); i <= Math.floor(Math.max(ax, bx, cx) / C); i++) {
      for (let j = Math.floor(Math.min(az, bz, cz) / C); j <= Math.floor(Math.max(az, bz, cz) / C); j++) {
        const x = (i + 0.5) * C, z = (j + 0.5) * C;
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
        if (l1 >= 0 && l2 >= 0 && l1 + l2 <= 1) cells.add(i * 100003 + j);
      }
    }
  }
  return cells;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const deg = (r) => r * 180 / Math.PI;

/**
 * A suit part's roof and deck net (its net mesh's leading GHILLIE_TOP_VERTICES): the highest net point under an
 * owner-local point (at most 10 cm over it), and the net triangle nearest a point with its normal (up).
 */
function roofNet(net) {
  const pos = net.geometry.attributes.position, cells = new Map(), C = 0.1, tris = [];
  const top = Math.min(pos.count, net.userData[GHILLIE_TOP_VERTICES] ?? 0);
  for (let t = 0; t + 2 < top; t += 3) {
    const a = [pos.getX(t), pos.getY(t), pos.getZ(t)], b = [pos.getX(t + 1), pos.getY(t + 1), pos.getZ(t + 1)];
    const c = [pos.getX(t + 2), pos.getY(t + 2), pos.getZ(t + 2)];
    const raw = cross(sub(b, a), sub(c, a));
    if (Math.hypot(...raw) < 1e-12) continue;
    let n = norm(raw);
    if (n[1] < 0) n = [-n[0], -n[1], -n[2]];
    const tri = [a, b, c, n];
    tris.push(tri);
    for (let i = Math.floor(Math.min(a[0], b[0], c[0]) / C); i <= Math.floor(Math.max(a[0], b[0], c[0]) / C); i++) {
      for (let j = Math.floor(Math.min(a[2], b[2], c[2]) / C); j <= Math.floor(Math.max(a[2], b[2], c[2]) / C); j++) {
        const key = `${i},${j}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(tri);
      }
    }
  }
  const under = (x, y, z) => {
    let best = null;
    for (const [a, b, c] of cells.get(`${Math.floor(x / C)},${Math.floor(z / C)}`) ?? []) {
      const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d;
      const l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const yy = l1 * a[1] + l2 * b[1] + l3 * c[1];
      if (yy <= y + 0.1 && (best === null || yy > best)) best = yy;
    }
    return best;
  };
  // a least-squares plane y = a x + b z + c through points (x, y, z) about p, refitted twice without the points more than
  // 3 cm off it (a net's own spike, a roll at an opening); null when the points do not span a plane (a line in plan)
  const fitPlane = (pts, p) => {
    let n = null;
    for (let pass = 0; pass < 3 && pts.length >= 5; pass++) {
      let sxx = 0, sxz = 0, szz = 0, sx = 0, sz = 0, sxy = 0, szy = 0, sy = 0;
      for (const v of pts) {
        const x = v[0] - p[0], z = v[2] - p[2], y = v[1] - p[1];
        sxx += x * x; sxz += x * z; szz += z * z; sx += x; sz += z; sxy += x * y; szy += z * y; sy += y;
      }
      const m = pts.length, cxx = sxx / m - (sx / m) ** 2, czz = szz / m - (sz / m) ** 2, cxz = sxz / m - (sx / m) * (sz / m);
      // the plan spread's smaller axis at least 2 cm
      const tr = cxx + czz, det = cxx * czz - cxz * cxz, minor = tr / 2 - Math.sqrt(Math.max(0, tr * tr / 4 - det));
      if (minor < 0.02 * 0.02) return n;
      const A = [[sxx, sxz, sx, sxy], [sxz, szz, sz, szy], [sx, sz, m, sy]];
      for (let i = 0; i < 3; i++) {
        let piv = i;
        for (let r = i + 1; r < 3; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
        [A[i], A[piv]] = [A[piv], A[i]];
        if (Math.abs(A[i][i]) < 1e-12) return n;
        for (let r = 0; r < 3; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let c = i; c < 4; c++) A[r][c] -= f * A[i][c]; }
      }
      const pa = A[0][3] / A[0][0], pb = A[1][3] / A[1][1], pc = A[2][3] / A[2][2];
      n = norm([-pa, 1, -pb]);
      const kept = pts.filter((v) => Math.abs(v[1] - p[1] - (pa * (v[0] - p[0]) + pb * (v[2] - p[2]) + pc)) < 0.03);
      if (kept.length === pts.length || kept.length < 5) break;
      pts = kept;
    }
    return n;
  };
  // the net's plane at a stem: through the roof net's vertices within 18 cm of it in plan (and 25 cm in height)
  const verts = [];
  for (let i = 0; i < top; i++) verts.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  const planeAt = (p) => fitPlane(verts.filter((v) => Math.hypot(v[0] - p[0], v[2] - p[2]) < 0.18 && Math.abs(v[1] - p[1]) < 0.25), p);
  return { under, planeAt, fitPlane, top };
}

const failures = [];
const summary = [];
for (const id of IDS) {
  const tank = createTank(id, null, { quality: 'high', geometryReceipt: true, proceduralOnly: true });
  tank.root.updateMatrixWorld(true);
  const DEBUG = DEBUG_ID === id;
  const steep = [], coverage = [];
  let roofCards = 0, tilted = 0, unseated = 0, drapeCards = 0, worstLift = 0, worstTilt = 0, worstRise = -90, worstReach = 0;
  tank.root.traverse((o) => {
    if (!o.isMesh || !/_ghillie_.*_leaves$/.test(o.name)) return;
    const net = o.parent.children.find((c) => c.isMesh && c.name === o.name.replace(/_leaves$/, '_net'));
    const pos = o.geometry.attributes.position;
    assert.ok(net, `${o.name}: its net is beside it`);
    assert.equal(pos.count % 24, 0, `${o.name}: HIGH garnish is folded 24-vertex cards`);
    const { under, planeAt, fitPlane, top } = roofNet(net);
    const topCards = (o.userData[GHILLIE_TOP_CARDS] ?? [0, 24])[0];
    const V = (i) => [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const cloth = drapeCloth(net, top);
    const stems = [];
    for (let k = 0, card = 0; k + 23 < pos.count; k += 24, card++) {
      // the spine (its root and tip rows' middles) and the middle row's edges
      const s0 = V(k + 1), s2 = V(k + 14), axis = norm(sub(s2, s0));
      if (card >= topCards) {
        drapeCards++;
        const rise = deg(Math.asin(Math.max(-1, Math.min(1, axis[1]))));
        worstRise = Math.max(worstRise, rise);
        if (rise > DRAPE_RISE_DEG) failures.push(`${o.name} drape card ${card}: its spine rises ${rise.toFixed(0)} deg (from ${s0.map((v) => v.toFixed(2))})`);
        // 5. tucked where its drape lies level (a roll over a roof's edge, a net over a cage's top) and laid within 30
        // degrees of level (a bough hanging over the roll's edge down the drape is the drape's), its face lies over the
        // cloth in plan, within DRAPE_PLAN_REACH_M of it (a fan standing straight out of a level roll reached half a
        // metre past it)
        if (Math.abs(axis[1]) < 0.5 && cloth.level(s0)) {
          let reach = 0;
          for (const i of [0, 1, 7, 12, 13, 19, 17, 14, 20]) reach = Math.max(reach, cloth.reach(V(k + i)));
          worstReach = Math.max(worstReach, reach);
          if (reach > DRAPE_PLAN_REACH_M) failures.push(`${o.name} drape card ${card}: juts ${(reach * 100).toFixed(0)} cm past its level cloth in plan (from ${s0.map((v) => v.toFixed(2))})`);
        }
        continue;
      }
      roofCards++;
      assert.ok(top > 0, `${net.name}: marks its roof and deck carriers`);
      stems.push([s0, Math.atan2(s2[0] - s0[0], s2[2] - s0[2])]);
      const face = norm(cross(axis, norm(sub(V(k + 19), V(k + 12)))));
      let lift = -Infinity, edge = -Infinity;
      for (let v = k; v < k + 24; v++) {
        const p = V(v), u = under(p[0], p[1], p[2]);
        if (u !== null && s0[1] - u < OWN_NET_M) lift = Math.max(lift, p[1] - u); else edge = Math.max(edge, p[1] - s0[1]);
      }
      if (lift > LIFT_M + LIFT_TOL_M) {
        failures.push(`${o.name} roof card ${card}: stands ${(lift * 100).toFixed(1)} cm over its net (from ${s0.map((v) => v.toFixed(2))})`);
      }
      if (edge > EDGE_RISE_M) {
        failures.push(`${o.name} roof card ${card}: past its net's edge stands ${(edge * 100).toFixed(1)} cm over its stem (from ${s0.map((v) => v.toFixed(2))})`);
      }
      worstLift = Math.max(worstLift, lift);
      // the net under the card's own footprint (its 5 x 5 face points), else round its stem (a card standing up has no
      // footprint to lie on)
      const g = [0, 1, 7, 12, 13, 19, 17, 14, 20].map((i) => V(k + i));
      const face25 = [];
      for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
        const fr = i / 2, fc = j / 2, r0 = Math.min(1, Math.floor(fr)), c0 = Math.min(1, Math.floor(fc)), u = fr - r0, w = fc - c0;
        const at = (r, c) => g[r * 3 + c];
        face25.push([0, 1, 2].map((q) => (1 - u) * ((1 - w) * at(r0, c0)[q] + w * at(r0, c0 + 1)[q]) + u * ((1 - w) * at(r0 + 1, c0)[q] + w * at(r0 + 1, c0 + 1)[q])));
      }
      const footprint = [];
      for (const q of face25) { const h = under(q[0], q[1], q[2]); if (h !== null && s0[1] - h < OWN_NET_M) footprint.push([q[0], h, q[2]]); }
      const seat = fitPlane(footprint, s0) ?? planeAt(s0);
      if (!seat) { unseated++; continue; }
      const tilt = deg(Math.acos(Math.min(1, Math.abs(dot(face, seat)))));
      worstTilt = Math.max(worstTilt, tilt);
      if (tilt > TILT_DEG) tilted++;
      if (DEBUG && tilt > TILT_DEG) console.log(`  ${o.name} ${card} tilt ${tilt.toFixed(0)} stem ${s0.map((v) => v.toFixed(2))} tip ${s2.map((v) => v.toFixed(2))} face ${face.map((v) => v.toFixed(2))} net ${seat.map((v) => v.toFixed(2))}`);
      if (tilt > TILT_MAX_DEG) steep.push(`${o.name} roof card ${card}: its face stands ${tilt.toFixed(0)} deg off the net's`);
    }
    // 6. no fan of three or more roof cards out of one point
    for (let i = 0; i < stems.length; i++) {
      const [p, h] = stems[i];
      const near = stems.filter(([q]) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < FAN_STEM_M);
      if (near.length < 3) continue;
      // the widest spread of headings among them (headings as angles round the circle)
      const off = near.map(([, g]) => Math.atan2(Math.sin(g - h), Math.cos(g - h))).sort((a, b) => a - b);
      const spread = deg(off[off.length - 1] - off[0]);
      if (spread > FAN_SPREAD_DEG) {
        failures.push(`${o.name}: ${near.length} roof cards fan ${spread.toFixed(0)} deg out of one point (${p.map((v) => v.toFixed(2))})`);
        break;
      }
    }
    // 4. a turret roof net's plan coverage by its own lying roof cards
    if (/_ghillie_turret_leaves$/.test(o.name)) {
      const netCells = planCells(net.geometry.attributes.position, 0, top, new Set());
      const netM2 = netCells.size * COVER_CELL_M * COVER_CELL_M;
      if (netM2 >= COVER_MIN_NET_M2) {
        const cardCells = planCells(pos, 0, topCards * 24, new Set());
        let both = 0;
        for (const c of cardCells) if (netCells.has(c)) both++;
        const share = both / netCells.size;
        coverage.push(`turret net ${netM2.toFixed(1)} m2 ${(share * 100).toFixed(0)} % covered`);
        if (share < COVER_MIN_SHARE) failures.push(`${id}: its turret roof net (${netM2.toFixed(1)} m2) is covered by its lying garnish over only ${(share * 100).toFixed(0)} %`);
      }
    }
  });
  assert.ok(roofCards > 20 && drapeCards > 10, `${id}: carries its roof and drape garnish (${roofCards} roof, ${drapeCards} drape cards)`);
  // a roof card's stem sits in its net (net enough round it to fit its plane)
  if (unseated > 0.05 * roofCards) failures.push(`${id}: ${unseated} of ${roofCards} roof cards have no roof net round their stems`);
  // a card where two nets meet (or at a net drawn steeply up over a fitting) reads steep: two in a hundred may
  if (steep.length > Math.max(1, Math.floor(STEEP_SHARE * roofCards))) failures.push(...steep);
  if (tilted > (1 - TILT_SHARE) * roofCards) failures.push(`${id}: ${tilted} of ${roofCards} roof cards stand more than ${TILT_DEG} deg off the net`);
  summary.push(`${id} ${roofCards}/${drapeCards} cards, lift <= ${(worstLift * 100).toFixed(1)} cm, ${tilted} tilted > ${TILT_DEG} deg (worst ${worstTilt.toFixed(0)}, ${steep.length} over ${TILT_MAX_DEG}), drape rise <= ${worstRise.toFixed(0)} deg, drape reach <= ${(worstReach * 100).toFixed(0)} cm, ${unseated} untied${coverage.length ? `, ${coverage.join(', ')}` : ''}`);
  tank.dispose?.();
}
assert.deepEqual(failures, [], `field garnish lies on its net:\n${failures.slice(0, 40).join('\n')}`);
console.log(`ghillieGarnishLie.selftest: ${IDS.length} field suits lay their garnish on the net\n  ${summary.join('\n  ')}`);
