// Visual census views (2026-10-01, the baseline of the Opus 5.5 visual redesign). The fixed camera set every census
// run shoots on every registered map, and the pure site selection behind the three views that depend on the map's
// own layout. Everything here is Node-side and deterministic: the page only supplies data (the staged player hull,
// the minimap features, the concealment discs, terrain heights at the points listed here) and resolves each final
// height at the exact XZ through resolveGroundPose (tools/map-probe-runtime.mjs), so two runs on two commits frame
// the same ground whenever the map's layout did not move. tools/visual-census.selftest.mjs pins the table.
//
// A resolved census pose is { cam: [x, yAbove, z], at: [x, yAbove, z], fov }: the y values are metres ABOVE THE
// GROUND at the (clamped) XZ, exactly as the map view probe's table views. World +X is east, +Z is north; a hull's
// forward is (sin yaw, cos yaw).
import { MAP_VIEW_PROBE_VIEWS } from './map-view-probe-views.mjs';
import { selectStandView } from './environment-shot-camera.mjs';

export const CENSUS_PROTOCOL = 'visual-census-v1';
export const CENSUS_VIEWPORT = Object.freeze({ width: 1600, height: 900 });
export const CENSUS_FOV = 55;
/** Ground-height clamp for table poses: the playable square's height field (the map view probe's value). */
export const CENSUS_HALF = 511;

const probeView = (name) => {
  const view = MAP_VIEW_PROBE_VIEWS.find((v) => v.name === name);
  if (!view) throw new Error(`map view probe table lost ${name}`);
  return view;
};
const freeze = (view) => Object.freeze(Object.fromEntries(Object.entries(view)
  .map(([key, value]) => [key, Array.isArray(value) ? Object.freeze([...value]) : value])));
/** A round-35 skyline view as census terms: camera height, how far out and how high above the ground it looks. */
function skyFrom(view) {
  const [cx, cy, cz] = view.cam, [ax, ay, az] = view.at;
  if (cx !== 0 || cz !== 0) throw new Error(`${view.name}: the round-35 skyline views stand at the map centre`);
  return { camAbove: cy, reach: Math.hypot(ax, az), lift: ay };
}

/**
 * The census camera set, in capture order. `kind` decides how a view is posed:
 *   shot     — the game's own deterministic battlefield recipe (__SHOTS.set('battlefield_<map>')), left where it stands;
 *   hull     — behind the staged player hull: the first `back` distance whose camera point is clear of footprints;
 *   table    — a fixed table pose;
 *   sky      — the round-35 all-map skyline views of the map view probe (6 m over the map centre, looking west / south at
 *              a point 900 m out and 260 m up) from the clear spot nearest the centre (selectSkySite): the round-35 pose
 *              itself wherever the centre is clear, so those maps compare with every earlier round's sky-w / sky-s;
 *   terrain  — 1.8 m over open ground near the spawn, looking away from the hull (selectTerrainSite);
 *   tree     — the map audit's foliage stand (selectStandView), skipped when the map has no tree clusters.
 */
export const CENSUS_VIEWS = Object.freeze([
  { name: 'establishing', kind: 'shot', label: 'establishing (game shot)' },
  { name: 'chase', kind: 'hull', label: 'chase', back: [12, 9, 15, 7], camAbove: 3.4, ahead: 40, atAbove: 1.2, fov: CENSUS_FOV },
  { name: 'bird', kind: 'table', label: 'bird (SW three-quarter)', cam: [-420, 300, -420], at: [60, 0, 60], fov: CENSUS_FOV },
  { name: 'sky-w', kind: 'sky', label: 'sky west', heading: [-1, 0], ...skyFrom(probeView('sky-w')), fov: CENSUS_FOV },
  { name: 'sky-s', kind: 'sky', label: 'sky south', heading: [0, -1], ...skyFrom(probeView('sky-s')), fov: CENSUS_FOV },
  { name: 'terrain', kind: 'terrain', label: 'terrain close-up', camAbove: 1.8, look: 6, atAbove: 0, fov: CENSUS_FOV },
  { name: 'tree', kind: 'tree', label: 'tree close-up', camAbove: 4.2, atAbove: 3.6, fov: 50 },
].map(freeze));
const VIEW = Object.freeze(Object.fromEntries(CENSUS_VIEWS.map((v) => [v.name, v])));

// ---------------------------------------------------------------------------------------------- border set

/**
 * The border census (2026-10-02, the map-borders lane of the Opus 5.5 redesign): the owner's eye test of every map's
 * rim — "eye test all map skyboxes and where the borders are … a map square boundary area carved into a broader map"
 * (2026-09-21) — as a SECOND camera set beside the seven core views, with its own protocol and digest so the core
 * census keeps comparing with every earlier run. Seventeen views per map:
 *   edge-n/e/s/w, corner-ne/se/sw/nw   — tank eye height (2.5 m over the ground, or over the water surface), level,
 *                                        from a spot 60–100 m inside the edge looking straight out (corners: along
 *                                        the diagonal, 60–100 m inside both edges);
 *   …-up                               — the same eight spots 60 m up, pitched 15° down (the edge, the outland band
 *                                        and the ranges in one frame);
 *   oblique-ne                         — 280 m over (230, 230) looking out across the north-east corner, 22° down.
 * World +X is east, +Z is north. The spot of each side/corner is the first clear candidate (selectBorderSite): the
 * side's centre line (corners: the diagonal) first, then offsets along the edge; 80 m inside first, then 70, 90, 60,
 * 100. The eye and the 60 m view of a side share the spot. Poses are ABSOLUTE (borderPose): the camera height comes
 * from the ground (and water) sampled at the spot, the look from the table's pitch — no ground under the look point
 * is consulted, so a rim rising past the edge cannot tilt the camera.
 */
export const BORDER_PROTOCOL = 'visual-census-border-v1';
/**
 * The border set's second protocol (2026-10-03, gauntlet wave 1: the Verdant north eye view stood beside a tree whose
 * leaf cards filled the frame's corner): the same seventeen views, whose spots must also keep the frame's near field
 * clear — no crown within `frameClearM` of the spot inside the view's wedge (±52° of its heading, the 16:9 frame's
 * half-width plus a margin). Its own protocol and digest: a v2 census never merges with a v1 census.
 */
export const BORDER2_PROTOCOL = 'visual-census-border-v2';
/** The near field a border2 spot keeps clear of crowns, in the view's wedge (m from the spot to the crown's edge). */
export const BORDER_FRAME_CLEAR_M = 14;
const BORDER_FRAME_HALF_ANGLE = (52 * Math.PI) / 180;
/** The playable square's terrain edge (|x|, |z| = 512, TERRAIN_HALF_EXTENT_M). */
export const BORDER_EDGE = 512;
/** Eye height of the rim views (m over the ground or the water surface): a tank commander's eye. */
export const BORDER_EYE = 2.5;
const BORDER_SIDES = Object.freeze({ n: [0, 1], e: [1, 0], s: [0, -1], w: [-1, 0], ne: [1, 1], se: [1, -1], sw: [-1, -1], nw: [-1, 1] });
const BORDER_INSETS = Object.freeze([80, 70, 90, 60, 100]);
const BORDER_SIDE_OFFSETS = Object.freeze([0, 40, -40, 80, -80, 120, -120, 160, -160, 200, -200]);
/** Corner spots: every pair of insets from the two edges, the square ones nearest 80 m first, then the skewed ones. */
const BORDER_CORNER_INSETS = Object.freeze(BORDER_INSETS.flatMap((a) => BORDER_INSETS.map((b) => [a, b]))
  .map(([a, b], order) => ({ a, b, order }))
  .sort((p, q) => (Math.abs(p.a - p.b) - Math.abs(q.a - q.b)) || (p.order - q.order))
  .map(({ a, b }) => Object.freeze([a, b])));
const BORDER_CORRIDOR = Object.freeze([8, 16, 24]);
const BORDER_LOOK = 400;
const SIDE_NAMES = Object.freeze({ n: 'north', e: 'east', s: 'south', w: 'west', ne: 'north-east', se: 'south-east', sw: 'south-west', nw: 'north-west' });

const borderRimView = (side, up) => ({
  name: `${side.length === 1 ? 'edge' : 'corner'}-${side}${up ? '-up' : ''}`, kind: 'border',
  label: `${SIDE_NAMES[side]} ${side.length === 1 ? 'edge' : 'corner'} · ${up ? '60 m up' : 'eye height'}`,
  side, camAbove: up ? 60 : BORDER_EYE, pitchDeg: up ? -15 : 0, fov: CENSUS_FOV,
});
export const BORDER_VIEWS = Object.freeze([
  ...['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'].map((side) => borderRimView(side, false)),
  ...['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'].map((side) => borderRimView(side, true)),
  { name: 'oblique-ne', kind: 'oblique', label: 'high oblique across the north-east corner', cam: [230, 280, 230], heading: [1, 1], pitchDeg: -22, fov: CENSUS_FOV },
].map(freeze));

/** The border views with the frame-clear spot rule (BORDER2_PROTOCOL). */
export const BORDER2_VIEWS = Object.freeze(BORDER_VIEWS.map((v) => freeze(v.kind === 'border' ? { ...v, frameClearM: BORDER_FRAME_CLEAR_M } : { ...v })));

/** The camera sets a census run may shoot: the seven core views (the default), the border set or its second protocol. */
export const CENSUS_VIEW_SETS = Object.freeze({
  core: Object.freeze({ protocol: CENSUS_PROTOCOL, views: CENSUS_VIEWS }),
  border: Object.freeze({ protocol: BORDER_PROTOCOL, views: BORDER_VIEWS }),
  border2: Object.freeze({ protocol: BORDER2_PROTOCOL, views: BORDER2_VIEWS }),
});

/** A view set by name; unknown names fail closed. */
export function censusViewSet(name = 'core') {
  const set = CENSUS_VIEW_SETS[name];
  if (!set) throw new Error(`Unknown census view set "${name}" (${Object.keys(CENSUS_VIEW_SETS).join(', ')})`);
  return set;
}

/** The views a run shoots: all of them, or the named subset in table order. Unknown names fail closed. */
export function selectCensusViews(names = null, setName = 'core') {
  const views = censusViewSet(setName).views;
  if (!names || names.length === 0) return [...views];
  const known = new Set(views.map((v) => v.name));
  const unknown = names.filter((n) => !known.has(n));
  if (unknown.length) throw new Error(`Unknown census view(s): ${unknown.join(', ')} (see tools/visual-census-views.mjs)`);
  const wanted = new Set(names);
  return views.filter((v) => wanted.has(v.name));
}

/**
 * The deterministic candidate spots of a border view, preferred first. A side: offsets along the edge (the centre
 * line first), and for each offset the insets 80, 70, 90, 60, 100 m. A corner: the spot `insetX` m inside the east or
 * west edge and `insetZ` m inside the north or south edge, over every pair of those insets (equal pairs first, in that
 * order, then the skewed pairs), so the spot always stands 60–100 m inside both edges. Every candidate carries its
 * outward heading `dir` and the corridor points 8, 16 and 24 m out that the selection keeps clear.
 */
export function borderSiteCandidates(view) {
  const side = BORDER_SIDES[view.side];
  if (!side) throw new Error(`${view.name}: unknown border side ${view.side}`);
  const [sx, sz] = side, corner = sx !== 0 && sz !== 0, len = Math.hypot(sx, sz);
  const nx = sx / len, nz = sz / len, tx = -nz, tz = nx, out = [];
  const push = (px, pz, spot) => out.push({
    index: out.length, side: view.side, ...spot, dir: [nx, nz], p: [px, pz],
    corridor: BORDER_CORRIDOR.map((d) => [px + nx * d, pz + nz * d]),
    ...(view.frameClearM ? { frameClearM: view.frameClearM } : {}),
  });
  if (corner) {
    for (const [insetX, insetZ] of BORDER_CORNER_INSETS) push(sx * (BORDER_EDGE - insetX), sz * (BORDER_EDGE - insetZ), { insetX, insetZ });
    return out;
  }
  for (const offset of BORDER_SIDE_OFFSETS) {
    for (const inset of BORDER_INSETS) push(sx * (BORDER_EDGE - inset) + tx * offset, sz * (BORDER_EDGE - inset) + tz * offset, { inset, offset });
  }
  return out;
}

/** Every ground point the border selection may read (the spot and its corridor). */
export function borderSamplePoints(candidates) {
  return candidates.flatMap((c) => [c.p, ...c.corridor]);
}

/**
 * Pick the spot of a border view. Pass 1: dry (water depth ≤ 5 cm), 10 m clear of building footprints and 3 m of
 * every crown, the corridor 8–24 m out 3 m off footprints and 1.5 m off crowns, and no corridor ground above the eye
 * (BORDER_EYE − 0.5 m over the spot). Pass 2 lets the ground rise, pass 3 lets crowns into the corridor, pass 4 lets
 * the spot stand in water (the camera then stands on the surface). Nowhere clear: the first candidate (80 m inside on
 * the centre line), flagged 'anchor'. The rules do not depend on the view's height, so a side's eye and 60 m views
 * share one spot.
 */
export function selectBorderSite(candidates, { buildings = [], concealers = [], heightAt, waterDepthAt = null }) {
  if (typeof heightAt !== 'function') throw new Error('selectBorderSite needs heightAt(x, z)');
  const passes = [
    { name: 'clear', rise: true, crowns: true, dry: true },
    { name: 'rise-allowed', rise: false, crowns: true, dry: true },
    { name: 'crowns-allowed', rise: false, crowns: false, dry: true },
    { name: 'wet-allowed', rise: false, crowns: false, dry: false },
  ];
  for (let pass = 0; pass < passes.length; pass++) {
    const rule = passes[pass];
    for (const c of candidates) {
      const [px, pz] = c.p;
      if (buildingClearance(px, pz, buildings) < 10 || crownClearance(px, pz, concealers) < 3) continue;
      if (rule.dry && waterDepthAt && waterDepthAt(px, pz) > 0.05) continue;
      if (c.corridor.some(([x, z]) => buildingClearance(x, z, buildings) < 3)) continue;
      if (rule.crowns && c.corridor.some(([x, z]) => crownClearance(x, z, concealers) < 1.5)) continue;
      if (rule.crowns && c.frameClearM && frameCrown(c, concealers)) continue;
      const eye = heightAt(px, pz) + BORDER_EYE - 0.5;
      if (rule.rise && c.corridor.some(([x, z]) => heightAt(x, z) > eye)) continue;
      return { candidate: c, pass: pass + 1, rule: rule.name };
    }
  }
  return { candidate: candidates[0], pass: 5, rule: 'anchor' };
}

const lookAt = ([x, y, z], [hx, hz], pitchDeg) => {
  const len = Math.hypot(hx, hz), pitch = (pitchDeg * Math.PI) / 180;
  return [x + (hx / len) * BORDER_LOOK, y + Math.tan(pitch) * BORDER_LOOK, z + (hz / len) * BORDER_LOOK];
};

/**
 * The absolute pose of a border view at its selected spot: `camAbove` over the ground there (over the water surface
 * when the spot is wet), looking out along the side's outward heading at the table's pitch.
 */
export function borderPose(site, view, groundY, waterDepth = 0) {
  if (!Number.isFinite(groundY)) throw new Error(`${view.name}: no ground height at the selected spot`);
  const c = site.candidate, [px, pz] = c.p;
  const cam = [px, groundY + Math.max(0, waterDepth || 0) + view.camAbove, pz];
  return {
    cam, at: lookAt(cam, c.dir, view.pitchDeg), fov: view.fov, absolute: true,
    selection: { index: c.index, ...(c.insetX !== undefined ? { insetX: c.insetX, insetZ: c.insetZ } : { inset: c.inset, offset: c.offset }),
      pass: site.pass, rule: site.rule, groundY: Math.round(groundY * 100) / 100,
      waterDepth: Math.round(Math.max(0, waterDepth || 0) * 100) / 100 },
  };
}

/** The ground point an oblique view reads (its camera XZ). */
export function obliqueSamplePoints(view) {
  return [[view.cam[0], view.cam[2]]];
}

/** The absolute pose of the oblique view: `cam[1]` over the ground at its XZ, looking along `heading` at the table's pitch. */
export function obliquePose(view, groundY) {
  if (!Number.isFinite(groundY)) throw new Error(`${view.name}: no ground height under the camera`);
  const cam = [view.cam[0], groundY + view.cam[1], view.cam[2]];
  return { cam, at: lookAt(cam, view.heading, view.pitchDeg), fov: view.fov, absolute: true, selection: { groundY: Math.round(groundY * 100) / 100 } };
}

// ---------------------------------------------------------------------------------------------- clearance

const footprintRadius = (b) => Math.hypot(b.w || 0, b.d || 0) * 0.5;
/** Metres from (x, z) to the nearest building footprint circle (negative inside); Infinity without buildings. */
function buildingClearance(x, z, buildings) {
  let best = Infinity;
  for (const b of buildings) best = Math.min(best, Math.hypot(x - b.x, z - b.z) - footprintRadius(b));
  return best;
}
/** Metres from (x, z) to the nearest full crown: concealment discs are 80 % of the canopy (selectStandView's rule). */
function crownClearance(x, z, concealers) {
  let best = Infinity;
  for (const c of concealers) best = Math.min(best, Math.hypot(x - c.x, z - c.z) - c.r / 0.8);
  return best;
}
/** A crown inside a border2 spot's near frame: within `frameClearM` of the spot and inside the view's wedge. */
function frameCrown(c, concealers) {
  const [px, pz] = c.p, [dx, dz] = c.dir;
  for (const crown of concealers) {
    const ox = crown.x - px, oz = crown.z - pz, reach = crown.r / 0.8;
    if (Math.hypot(ox, oz) - reach >= c.frameClearM) continue;
    const ahead = ox * dx + oz * dz, side = Math.abs(ox * dz - oz * dx);
    // the crown's disc reaches into the wedge (its nearest point within the half-angle of the heading)
    if (ahead + reach > 0 && Math.atan2(Math.max(0, side - reach), Math.max(0.01, ahead + reach)) < BORDER_FRAME_HALF_ANGLE) return true;
  }
  return false;
}
function discClearance(x, z, discs) {
  let best = Infinity;
  for (const d of discs) best = Math.min(best, Math.hypot(x - d.x, z - d.z) - d.r);
  return best;
}
/** Metres from (x, z) to the nearest road centreline (polylines of [x, z] nodes). */
function roadClearance(x, z, roads) {
  let best = Infinity;
  for (const road of roads) {
    for (let i = 1; i < road.length; i++) {
      const [ax, az] = road[i - 1], [bx, bz] = road[i];
      const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
      best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------- chase

/**
 * Behind the staged hull: the camera `back` metres behind it along its heading, `camAbove` over the ground there,
 * looking at the point `ahead` metres in front of the hull. The first back distance (table order) whose camera
 * point clears building footprints by 2.5 m and every crown by 1 m, with the midpoint to the hull clear too (1 m /
 * 0.5 m), wins; when none does, the first one is kept and the selection says so.
 */
export function selectChasePose(player, { buildings = [], concealers = [] } = {}, view = VIEW.chase) {
  if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.z) || !Number.isFinite(player.yaw)) {
    throw new Error('chase view needs the staged player hull (x, z, yaw)');
  }
  const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
  const at = [player.x + fx * view.ahead, view.atAbove, player.z + fz * view.ahead];
  const tried = [];
  for (const back of view.back) {
    const x = player.x - fx * back, z = player.z - fz * back;
    const mx = player.x - fx * back * 0.5, mz = player.z - fz * back * 0.5;
    const clear = buildingClearance(x, z, buildings) >= 2.5 && crownClearance(x, z, concealers) >= 1
      && buildingClearance(mx, mz, buildings) >= 1 && crownClearance(mx, mz, concealers) >= 0.5;
    tried.push(back);
    if (clear) return { cam: [x, view.camAbove, z], at, fov: view.fov, selection: { back, clear: true, tried } };
  }
  const back = view.back[0];
  return {
    cam: [player.x - fx * back, view.camAbove, player.z - fz * back], at, fov: view.fov,
    selection: { back, clear: false, tried },
  };
}

// ---------------------------------------------------------------------------------------------- terrain

const TERRAIN_RADII = Object.freeze([36, 52, 70, 92, 118, 150, 190]);
/** Azimuth steps (22.5° each) from the hull's heading outward: ahead first, then alternating sides, behind last. */
const TERRAIN_STEPS = Object.freeze([0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8]);
const TERRAIN_INSIDE = 490;

/**
 * The deterministic candidate list of the terrain close-up, from the hull alone (no heights): every candidate is a
 * camera point P on a ring around the spawn looking outward (away from the hull) and the ground points the
 * selection samples — P, the look point T (`look` m out), the mid-ground point M (18 m out) and P ± 5 m across.
 */
export function terrainSiteCandidates(player, view = VIEW.terrain) {
  if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.z) || !Number.isFinite(player.yaw)) {
    throw new Error('terrain view needs the staged player hull (x, z, yaw)');
  }
  const out = [];
  for (const radius of TERRAIN_RADII) {
    for (const step of TERRAIN_STEPS) {
      const a = player.yaw + step * Math.PI / 8;
      const dx = Math.sin(a), dz = Math.cos(a);
      const px = player.x + dx * radius, pz = player.z + dz * radius;
      out.push({
        index: out.length, radius, azimuthStep: step, dir: [dx, dz],
        p: [px, pz], t: [px + dx * view.look, pz + dz * view.look], m: [px + dx * 18, pz + dz * 18],
        l: [px - dz * 5, pz + dx * 5], r: [px + dz * 5, pz - dx * 5],
      });
    }
  }
  return out;
}

/** Every ground point the terrain selection may read, in candidate order (the page answers them in one call). */
export function terrainSamplePoints(candidates) {
  return candidates.flatMap((c) => [c.p, c.t, c.m, c.l, c.r]);
}

/**
 * Pick the terrain close-up site. Pass 1 wants open, gentle, dry ground away from roads: all five points inside the
 * square (|x|,|z| <= 490), at most 2.2 m of relief across them, P and M 12 m clear of building footprints, P/T/M 6 m
 * clear of crowns and of water discs and dry (`waterDepthAt` <= 5 cm, when given), P and T 8 m off any road
 * centreline. Pass 2 drops the road rule, pass 3 the relief rule too, pass 4 keeps only the square. `heightAt(x, z)`
 * and `waterDepthAt(x, z)` answer for the points of terrainSamplePoints.
 */
export function selectTerrainSite(candidates, { buildings = [], concealers = [], water = [], roads = [], heightAt, waterDepthAt = null }) {
  if (typeof heightAt !== 'function') throw new Error('selectTerrainSite needs heightAt(x, z)');
  const passes = [
    { name: 'open', roads: true, relief: true, clear: true },
    { name: 'roads-allowed', roads: false, relief: true, clear: true },
    { name: 'relief-allowed', roads: false, relief: false, clear: true },
    { name: 'inside-only', roads: false, relief: false, clear: false },
  ];
  for (let pass = 0; pass < passes.length; pass++) {
    const rule = passes[pass];
    for (const c of candidates) {
      const pts = [c.p, c.t, c.m, c.l, c.r];
      if (pts.some(([x, z]) => Math.max(Math.abs(x), Math.abs(z)) > TERRAIN_INSIDE)) continue;
      const hs = pts.map(([x, z]) => heightAt(x, z));
      if (hs.some((h) => !Number.isFinite(h))) continue;
      const relief = Math.max(...hs) - Math.min(...hs);
      if (rule.relief && relief > 2.2) continue;
      if (rule.clear) {
        if ([c.p, c.m].some(([x, z]) => buildingClearance(x, z, buildings) < 12)) continue;
        if ([c.p, c.t, c.m].some(([x, z]) => crownClearance(x, z, concealers) < 6 || discClearance(x, z, water) < 6)) continue;
        if (waterDepthAt && [c.p, c.t, c.m].some(([x, z]) => waterDepthAt(x, z) > 0.05)) continue;
      }
      if (rule.roads && [c.p, c.t].some(([x, z]) => roadClearance(x, z, roads) < 8)) continue;
      return { candidate: c, pass: pass + 1, rule: rule.name, relief: Math.round(relief * 100) / 100 };
    }
  }
  throw new Error('No terrain close-up site inside the battlefield');
}

/** The terrain close-up pose of a selected site. */
export function terrainPose(site, view = VIEW.terrain) {
  const c = site.candidate;
  return {
    cam: [c.p[0], view.camAbove, c.p[1]], at: [c.t[0], view.atAbove, c.t[1]], fov: view.fov,
    selection: { index: c.index, radius: c.radius, azimuthStep: c.azimuthStep, pass: site.pass, rule: site.rule, relief: site.relief },
  };
}

// ---------------------------------------------------------------------------------------------- sky

const SKY_RADII = Object.freeze([0, 25, 50, 80, 120, 160]);
const SKY_AZIMUTHS = 12;
const SKY_CORRIDOR = Object.freeze([15, 30, 45, 60]);

/**
 * The candidate camera spots of a skyline view, nearest the map centre first: the centre itself (the round-35 pose),
 * then rings of 12 spots (north first, clockwise) at 25–160 m, each with the corridor points 15–60 m out along the
 * view heading that the selection keeps clear.
 */
export function skySiteCandidates(view) {
  const [hx, hz] = view.heading, out = [];
  for (const radius of SKY_RADII) {
    for (let k = 0; k < (radius === 0 ? 1 : SKY_AZIMUTHS); k++) {
      const a = (k * 2 * Math.PI) / SKY_AZIMUTHS;
      const px = radius ? Math.sin(a) * radius : 0, pz = radius ? Math.cos(a) * radius : 0;
      out.push({ index: out.length, radius, azimuthStep: k, p: [px, pz], corridor: SKY_CORRIDOR.map((d) => [px + hx * d, pz + hz * d]) });
    }
  }
  return out;
}

/** Every ground point the skyline selection may read (the camera spot and its corridor). */
export function skySamplePoints(candidates) {
  return candidates.flatMap((c) => [c.p, ...c.corridor]);
}

/**
 * Pick the camera spot of a skyline view. Pass 1: the spot is dry and 12 m clear of building footprints and 4 m of
 * every crown, the corridor 15–60 m out keeps 4 m off footprints and 1 m off crowns, and no corridor ground rises
 * within a metre of eye level. Pass 2 lets the ground rise, pass 3 lets crowns into the corridor, pass 4 keeps the
 * centre (the round-35 pose) whatever stands there.
 */
export function selectSkySite(candidates, { buildings = [], concealers = [], heightAt, waterDepthAt = null }, view) {
  if (typeof heightAt !== 'function') throw new Error('selectSkySite needs heightAt(x, z)');
  const passes = [
    { name: 'clear', rise: true, crowns: true },
    { name: 'rise-allowed', rise: false, crowns: true },
    { name: 'crowns-allowed', rise: false, crowns: false },
  ];
  for (let pass = 0; pass < passes.length; pass++) {
    const rule = passes[pass];
    for (const c of candidates) {
      const [px, pz] = c.p;
      if (buildingClearance(px, pz, buildings) < 12 || crownClearance(px, pz, concealers) < 4) continue;
      if (waterDepthAt && waterDepthAt(px, pz) > 0.05) continue;
      if (c.corridor.some(([x, z]) => buildingClearance(x, z, buildings) < 4)) continue;
      if (rule.crowns && c.corridor.some(([x, z]) => crownClearance(x, z, concealers) < 1)) continue;
      const eye = heightAt(px, pz) + view.camAbove - 1;
      if (rule.rise && c.corridor.some(([x, z]) => heightAt(x, z) > eye)) continue;
      return { candidate: c, pass: pass + 1, rule: rule.name };
    }
  }
  return { candidate: candidates[0], pass: 4, rule: 'centre' };
}

/** The skyline pose of a selected spot: the round-35 look (reach out along the heading, lift above the ground). */
export function skyPose(site, view) {
  const [px, pz] = site.candidate.p, [hx, hz] = view.heading;
  return {
    cam: [px, view.camAbove, pz], at: [px + hx * view.reach, view.lift, pz + hz * view.reach], fov: view.fov,
    selection: { index: site.candidate.index, radius: site.candidate.radius, azimuthStep: site.candidate.azimuthStep, pass: site.pass, rule: site.rule },
  };
}

// ---------------------------------------------------------------------------------------------- tree

/** The tree close-up: the map audit's foliage stand (largest clusters first, outside every crown); null without trees. */
export function selectTreePose({ clusters = [], concealers = [], buildings = [] }, view = VIEW.tree) {
  if (!clusters.length) return { skipped: 'no tree clusters' };
  let stand;
  try { stand = selectStandView({ clusters, concealers, buildings }); }
  catch (error) { return { skipped: String(error?.message || error) }; }
  return {
    cam: [stand.x, view.camAbove, stand.z], at: [stand.target.x, view.atAbove, stand.target.z], fov: view.fov,
    selection: { cluster: { x: stand.target.x, z: stand.target.z, r: stand.target.r }, clearance: Math.round(stand.clearance * 100) / 100 },
  };
}

// ---------------------------------------------------------------------------------------------- framing

/** Pitch (radians, + up) of a camera at `cam` looking at `at` (world positions). */
export function pitchOf(cam, at) {
  return Math.atan2(at[1] - cam[1], Math.hypot(at[0] - cam[0], at[2] - cam[2]));
}

/**
 * The screen row of the flat-world horizon for a roll-free camera: rows count down from the top, so a camera
 * pitched up puts the horizon below the centre. May fall outside [0, height) (null for a vertical camera).
 */
export function horizonRow(pitchRad, fovDeg, height) {
  const half = Math.tan((fovDeg * Math.PI) / 360);
  if (!(Math.abs(Math.cos(pitchRad)) > 1e-6)) return null;
  return height / 2 + (height / 2) * (Math.tan(pitchRad) / half);
}
