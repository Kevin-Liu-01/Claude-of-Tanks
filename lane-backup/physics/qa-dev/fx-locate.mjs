// fx-locate.mjs — surface location for the destruction-fx lane's strip runner (scratch, never staged).
// ---- surface location (the fx classifier's law, src/fx/surfaceLooks.ts classifyTerrain) ----------------------------
export function locateInPage(o) {
  const D = window.__DEBUG;
  const W = D && D.world;
  if (!W || !W.heightField) return { error: 'no world' };
  const f = W.heightField;
  const V = D.camera.position.constructor;
  const ts = (x, z) => { const s = f.getTrackSurfaceAt ? f.getTrackSurfaceAt(x, z) : 0; return typeof s === 'number' ? s : 0; };
  const around = (x, z) => {
    let sand = 0, snow = 0;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      const s = ts(x + Math.cos(a) * 22, z + Math.sin(a) * 22);
      if (s === 2) sand++; else if (s === 3) snow++;
    }
    if (snow >= 2 && snow >= sand) return 3;
    if (sand >= 2) return 2;
    return 0;
  };
  const water = (x, z) => (f.getWaterMaskAt ? f.getWaterMaskAt(x, z) : 0);
  const classify = (x, z) => {
    if (water(x, z) > 0.5) return 'water';
    const g = f.getGroundType ? f.getGroundType(x, z) : 'medium';
    const s = ts(x, z);
    if (g === 'soft') return 'mud';
    if (s === 3) return 'snow';
    if (s === 2) return 'sand';
    const ar = around(x, z);
    if (ar === 3) return 'snow';
    if (ar === 2) return 'sand';
    if (g === 'hard') return 'concrete';
    const n = f.getNormalAt ? f.getNormalAt(x, z) : null;
    if (n && n.y < 0.8) return 'rock';
    return 'soil';
  };
  const gy = (x, z) => f.getHeightAt(x, z);
  const ny = (x, z) => (f.getNormalAt ? f.getNormalAt(x, z).y : 1);
  const buf = [];
  const clearBox = (x, z, r) => { buf.length = 0; W.queryObstacles(x - r, z - r, x + r, z + r, buf); return buf.length === 0; };
  const org = new V(), dir = new V();
  const sight = (cx, cy, cz, tx, ty, tz) => {
    org.set(cx, cy, cz); dir.set(tx - cx, ty - cy, tz - cz);
    const d = dir.length(); dir.multiplyScalar(1 / d);
    const hit = W.raycast(org, dir, d);
    return !hit || hit.dist > d - 2.5;
  };
  const sp = W.spawnPoints || {};
  const starts = [];
  if (sp.player && sp.player.pos) starts.push([sp.player.pos[0], sp.player.pos[2]]);
  for (const e of sp.enemies || []) if (e && e.pos) starts.push([e.pos[0], e.pos[2]]);
  starts.push([0, 0]);
  const want = o.surface, dist = o.dist || 40, camH = o.camH || 3, lookH = o.lookH || 3.5, clear = o.clear || 8;
  if (o.structure) {
    // a building (a structure group's contact record, not a fixed set piece) at least minH tall, with an open camera
    // point `dist` away whose first sight of its middle is the building itself
    const recs = (W.getObstacles?.() ?? []).filter((r) => typeof r.structureIdx === 'number' && r.structureRole !== 'fixed'
      && r.max[1] - r.min[1] >= (o.minH || 5) && Math.max(r.max[0] - r.min[0], r.max[2] - r.min[2]) <= (o.maxW || 22)
      && Math.min(r.max[0] - r.min[0], r.max[2] - r.min[2]) >= (o.minW || 5));
    const sp0 = W.spawnPoints?.player?.pos;
    const ox = sp0 ? sp0[0] : 0, oz = sp0 ? sp0[2] : 0;
    recs.sort((a, b) => Math.hypot((a.min[0] + a.max[0]) / 2 - ox, (a.min[2] + a.max[2]) / 2 - oz)
      - Math.hypot((b.min[0] + b.max[0]) / 2 - ox, (b.min[2] + b.max[2]) / 2 - oz));
    for (const r of recs.slice(0, 80)) {
      const x = (r.min[0] + r.max[0]) / 2, z = (r.min[2] + r.max[2]) / 2;
      const hx = (r.max[0] - r.min[0]) / 2, hz = (r.max[2] - r.min[2]) / 2;
      const base = r.min[1], h = r.max[1] - r.min[1];
      for (let t = 0; t < 16; t++) {
        const th = (t / 16) * Math.PI * 2;
        const cx = x - Math.cos(th) * dist, cz = z - Math.sin(th) * dist;
        // an open camera point (round b23: a camera 3 m from another house filmed its wall)
        if (water(cx, cz) > 0.25 || !clearBox(cx, cz, 5)) continue;
        const cy = gy(cx, cz) + camH;
        // the building's whole face in view: its middle, both ends and its top are the first thing each ray meets
        const extent = Math.abs(Math.cos(th)) * hx + Math.abs(Math.sin(th)) * hz;
        const across = Math.abs(Math.sin(th)) * hx + Math.abs(Math.cos(th)) * hz;
        const px = -Math.sin(th), pz = Math.cos(th);
        const probes = [[0, 0.5], [0.75, 0.45], [-0.75, 0.45], [0, 0.9]];
        let seen = 0;
        for (const [side, up] of probes) {
          const tx = x + px * across * side - Math.cos(th) * extent * 0.9, tz = z + pz * across * side - Math.sin(th) * extent * 0.9;
          org.set(cx, cy, cz); dir.set(tx - cx, base + h * up - cy, tz - cz);
          const d = dir.length(); dir.multiplyScalar(1 / d);
          const hit = W.raycast(org, dir, d + extent * 2);
          if (hit && hit.kind === 'prop' && hit.record?.structureIdx === r.structureIdx) seen++;
        }
        if (seen < probes.length) continue;
        // and the sky over it (the dust column rises in the open)
        if (!sight(cx, cy, cz, x, base + h + 12, z)) continue;
        return { x, z, theta: th, ground: base, camGround: gy(cx, cz), structureId: r.structureIdx, extent, h, surface: 'structure' };
      }
    }
    return { error: 'no open building' };
  }
  const tried = { points: 0, surface: 0 };
  for (const [sx, sz] of starts) {
    for (let r = 0; r <= (o.radius || 320); r += 12) {
      const steps = r === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * r) / 16));
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        const x = sx + Math.cos(a) * r, z = sz + Math.sin(a) * r;
        tried.points++;
        if (classify(x, z) !== want) continue;
        let uniform = true;
        for (let q = 0; q < 4 && uniform; q++) {
          const b = q * Math.PI / 2;
          if (classify(x + Math.cos(b) * 7, z + Math.sin(b) * 7) !== want) uniform = false;
        }
        if (!uniform) continue;
        tried.surface++;
        if (want !== 'water' && want !== 'rock' && ny(x, z) < 0.93) continue;
        if (!clearBox(x, z, clear)) continue;
        for (let t = 0; t < 12; t++) {
          const th = (t / 12) * Math.PI * 2;
          const cx = x - Math.cos(th) * dist, cz = z - Math.sin(th) * dist;
          if (water(cx, cz) > 0.25) continue;
          if (!clearBox(cx, cz, 2.5)) continue;
          const cy = gy(cx, cz) + camH;
          const ty = (want === 'water' && f.getWaterSurfaceHeightAt) ? f.getWaterSurfaceHeightAt(x, z) : gy(x, z);
          if (!sight(cx, cy, cz, x, ty + 1.5, z)) continue;
          if (!sight(cx, cy, cz, x, ty + lookH + 9, z)) continue;
          return { x, z, theta: th, start: [sx, sz], tried, ground: ty, camGround: gy(cx, cz), surface: want };
        }
      }
    }
  }
  return { error: `no open ${want} point`, tried };
}

/** Map a local-frame scene (burst at the origin, camera on -X) onto a located point. */
export function placeScene(scene, at) {
  const c = Math.cos(at.theta), s = Math.sin(at.theta);
  const xz = (lx, lz) => [at.x + lx * c - lz * s, at.z + lx * s + lz * c];
  const p2 = (v) => { const [x, z] = xz(v[0], v[1]); return [x, z]; };
  const p3 = (v) => { const [x, z] = xz(v[0], v[2]); return [x, v[1], z]; };
  const out = JSON.parse(JSON.stringify(scene));
  for (const e of out.effects || []) {
    // a blow on the building's camera-facing wall, heading into it (a located building: at.extent from its centre)
    if (e.atFace && Number.isFinite(at.extent)) e.at = [-(at.extent + 0.4), 0];
    if (e.params && e.params.dirLocal === '+x') { e.params.dirDeg = (Math.atan2(c, s) * 180) / Math.PI; delete e.params.dirLocal; }
    delete e.atFace;
    if (Array.isArray(e.at)) e.at = e.at.length >= 3 ? p3(e.at) : p2(e.at);
    if (e.params && Array.isArray(e.params.from)) e.params.from = p3(e.params.from);
    if (e.params && Array.isArray(e.params.to)) e.params.to = p3(e.params.to);
  }
  // actor facings: Studio facingDeg 90 looks along +X; the local frame's +X maps to theta
  for (const a of out.actors || []) {
    if (Array.isArray(a.pos)) a.pos = p2(a.pos);
    if (typeof a.facingDeg === 'number') a.facingDeg = a.facingDeg - (at.theta * 180) / Math.PI;
  }
  // a storyboard's actor keys (a driven actor) live in the same local frame
  for (const track of out.storyboard?.actorTracks || []) {
    for (const k of track.keys || []) {
      if (Array.isArray(k.pos)) k.pos = p2(k.pos);
      if (typeof k.facingDeg === 'number') k.facingDeg = k.facingDeg - (at.theta * 180) / Math.PI;
    }
  }
  if (out.camera) {
    // absolute heights: the camera over its own ground, the look over the burst's surface (the water's, on water)
    const rel = out.camera.groundRel === true;
    if (Array.isArray(out.camera.pos)) { out.camera.pos = p3(out.camera.pos); if (rel) out.camera.pos[1] += at.camGround; }
    if (Array.isArray(out.camera.lookAt)) { out.camera.lookAt = p3(out.camera.lookAt); if (rel) out.camera.lookAt[1] += at.ground; }
    out.camera.groundRel = false;
  }
  return out;
}
