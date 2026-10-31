// tools/body-height-parts.mjs — the BODY the geometry gate's dims rows measure (Main's ruling 2026-10-30, owner-delegated):
// a tank's measured height is hull + turret, without radio whips and antennas, pintle and roof weapons and their mounts,
// or other thin roof fittings. The sim's dims.heightM (bots aim at 0.85 of it) does not change. Main's rulings later that
// day: a published height is an interval target, since sources measure to the cupola or to the roof gun: it passes when it
// lies between the body top and the roof-fittings top (whips always out, heightIntervalPct). An oracle comparison stays
// body against body. Hull length is the hull curve's own side span (the gun's rig left out, even on a casemate), never a
// band threshold that barrel columns can cross (bodyExtent). That span is a silhouette, so a build on a donor's frame,
// whose dims carry the donor's structural hull length, is held to its own oracle's span or the donor's silhouette
// (hullLengthTarget; Main 2026-10-30).
//
// The parts are named by tags the builders already set, never by shape:
//   - fitting roots (profiles/kit.ts FITTINGS): antennaWhip, and the roof-gun set ghillieSuit.ts's ROOF_GUN_FITTINGS names;
//   - working auxiliary stations (remoteControlled + auxiliaryPivot, as tools/vehicle-controls-inventory.mjs reads them);
//   - the 'antenna' seat role on parts drawn into ordinary buckets (spareTrackSeat.ts withSeatRole, profiles/antennaPart.ts;
//     the bucket merge keeps their spans as seatRoleRanges), cut from the merged mesh rather than hiding it, and on the
//     own geometry of a mesh drawn outside the buckets (the Barak's instanced whips).
// The main gun's rig stays body, and so does a roof station that is the vehicle's primary weapon (ares_apc's RWS).
// A supplied oracle names its own: the War Thunder exports' antenna* nodes and their roof guns' bones, mounts and guns
// (bone_mg_aa_*, mg_aa*, bone_mg_h_/bone_mg_v_*, mg_NN, mg_mount_*; never mg_twin or bone_mg_twin, the coaxial and
// over-gun weapons the build keeps on its gun), the Sketchfab prints' *Pintle and AmmoCan nodes, the supplied sources'
// numbered weapon2../mount2.. and mgbracket/mgbox (their bare weapon and mount are the main gun's), or the registration's
// own roofFittingNodes pattern, so a gun-less oracle compares like for like. A node named ammo* (War Thunder's ammo_NN,
// a print's ammo_5, a source's ammo2 or ammobelt) goes with a roof gun the oracle names when it touches it (AMMO_TOUCH_M),
// as the build's ammunition rides in its gun's fitting; a box or rack anywhere else, or beside the coaxial mg_twin, stays
// body. An oracle comparison drops a kind of roof
// fitting (antennas, roof weapons) only where the oracle names that kind (pairedRoofFittings): a source that fuses its
// roof gun into the turret keeps the build's gun beside it, and one that names nothing is compared whole against whole.
// Imported by tools/procedural-fidelity.html (the browser gate) and tools/body-height-parts.selftest.mjs.
import { Box3 } from 'three';

/** Fitting types that are roof fittings; the antenna ones never count toward any height. */
export const ROOF_FITTING_TYPES = Object.freeze(['antennaWhip', 'pintleMG', 'americanM2', 'americanRws', 'openYokeRws',
  'weaponStationMount', 'auxiliaryWeapon']);
export const ANTENNA_FITTING_TYPES = Object.freeze(['antennaWhip']);
/** Seat roles cut from merged buckets (all antennas). */
export const BODY_EXCLUDED_SEAT_ROLES = Object.freeze(['antenna']);
/** Oracle node names: whips, masts and aerials, and the roof guns with their mounts (never the coaxial mg_twin). */
export const ORACLE_ROOF_FITTING_NODES = /(?:^|[#/-])(?:antenna|aerial|bone_mg_aa|mg_aa|bone_mg_[hv]_|mg_\d|mg_mount|\w*pintle|ammocan|weapon[2-9]|mount[2-9]|mgbracket|mgbox)/i;

const roofTypes = new Set(ROOF_FITTING_TYPES);
const antennaTypes = new Set(ANTENNA_FITTING_TYPES);
const cutRoles = new Set(BODY_EXCLUDED_SEAT_ROLES);
const oracleAntenna = /(?:^|[#/-])(?:antenna|aerial)/i;
const oracleAmmo = /(?:^|[#/_-])ammo/i;
/** How close (metres, box to box) an oracle's ammo node stands to a named roof gun to go with it. */
export const AMMO_TOUCH_M = 0.1;

/** Whether a roof-fitting tag (roofFittingParts) names an antenna, which leaves every height, or a roof weapon, which only
 * the body leaves. */
export function isAntennaTag(tag) {
  const [kind, ...rest] = tag.split(':');
  return antennaTypes.has(kind) || cutRoles.has(kind) || (kind === 'node' && oracleAntenna.test(rest.join(':')));
}

/** The tag that makes `object` (under `root`) a roof fitting, or null. Anything on the main gun's rig is body. */
export function roofFittingTag(object, root) {
  let tag = null;
  for (let p = object; p && p !== root; p = p.parent) {
    const data = p.userData || {};
    if (p.name === 'rig_gun' || p.name === 'rig_recoil' || data.primaryWeapon) return null;
    if (tag) continue;
    if (typeof data.fitting === 'string' && roofTypes.has(data.fitting)) tag = `${data.fitting}:${p.name}`;
    else if (data.remoteControlled && data.auxiliaryPivot) tag = `station:${p.name}`;
  }
  return tag;
}

/** The oracle node (on `object` or an ancestor under `root`) whose name marks a roof fitting, or null. */
export function oracleRoofFittingTag(object, root, pattern = ORACLE_ROOF_FITTING_NODES) {
  if (!pattern) return null;
  for (let p = object; p && p !== root; p = p.parent) if (pattern.test(p.name || '')) return `node:${p.name}`;
  return null;
}

/** `geometry` without the triangles in `ranges` (corner slots: index entries, or vertex numbers when non-indexed),
 * sharing its attributes. Its bounding box covers the kept triangles only (three's computeBoundingBox reads every vertex
 * of the shared buffer, the cut whip's included). */
export function bodyGeometryWithout(geometry, ranges) {
  const index = geometry.index;
  const n = index ? index.count : geometry.getAttribute('position').count;
  const cut = new Uint8Array(n);
  for (const r of ranges) cut.fill(1, Math.max(0, r.start), Math.min(n, r.start + r.count));
  const kept = [];
  for (let t = 0; t + 2 < n; t += 3) {
    if (cut[t]) continue;
    kept.push(index ? index.getX(t) : t, index ? index.getX(t + 1) : t + 1, index ? index.getX(t + 2) : t + 2);
  }
  const body = new geometry.constructor();
  for (const [name, attribute] of Object.entries(geometry.attributes)) body.setAttribute(name, attribute);
  body.setIndex(kept);
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const position = geometry.getAttribute('position'), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const i of kept) for (let a = 0; a < 3; a++) {
    const v = position.getComponent(i, a);
    if (v < lo[a]) lo[a] = v;
    if (v > hi[a]) hi[a] = v;
  }
  body.boundingBox = geometry.boundingBox.clone();
  if (kept.length) { body.boundingBox.min.set(...lo); body.boundingBox.max.set(...hi); } else body.boundingBox.makeEmpty();
  return body;
}

/**
 * The roof fittings of one model: `nodes` (render node -> tag) leave the body whole; `trimmed` (render node -> body
 * geometry) lose their tagged antenna spans. An oracle also answers to its node names. isAntennaTag sorts the nodes.
 */
export function roofFittingParts(root, { isRenderNode, oracle = false, nodePattern = ORACLE_ROOF_FITTING_NODES }) {
  const nodes = new Map(), trimmed = new Map(), ammo = new Map();
  root.traverse((o) => {
    if (!isRenderNode(o)) return;
    const tag = roofFittingTag(o, root) ?? (oracle ? oracleRoofFittingTag(o, root, nodePattern) : null)
      ?? (cutRoles.has(o.geometry.userData?.seatRole) ? `${o.geometry.userData.seatRole}:${o.name}` : null);
    if (tag) { nodes.set(o, tag); return; }
    const box = oracle ? oracleRoofFittingTag(o, root, oracleAmmo) : null;
    if (box) ammo.set(o, box);
    const ranges = (o.userData?.seatRoleRanges ?? []).filter((r) => cutRoles.has(r.role));
    if (ranges.length && !o.isInstancedMesh) trimmed.set(o, bodyGeometryWithout(o.geometry, ranges));
  });
  if (ammo.size) {
    root.updateMatrixWorld(true);
    const guns = [...nodes].filter(([, tag]) => !isAntennaTag(tag)).map(([o]) => new Box3().setFromObject(o).expandByScalar(AMMO_TOUCH_M));
    for (const [o, tag] of ammo) {
      const box = new Box3().setFromObject(o);
      if (guns.some((gun) => gun.intersectsBox(box))) nodes.set(o, tag);
    }
  }
  return { nodes, trimmed };
}

/** The parts an oracle comparison leaves out of both models: every roof fitting the oracle names, and the build's roof
 * fittings of the kinds the oracle names. `cutBuildSpans` says whether the build's antenna spans are cut too. */
export function pairedRoofFittings(built, oracle) {
  const named = { antenna: oracle.trimmed.size > 0, weapon: false };
  for (const tag of oracle.nodes.values()) named[isAntennaTag(tag) ? 'antenna' : 'weapon'] = true;
  const hidden = new Set(oracle.nodes.keys());
  for (const [node, tag] of built.nodes) if (named[isAntennaTag(tag) ? 'antenna' : 'weapon']) hidden.add(node);
  return { hidden, named, cutBuildSpans: named.antenna };
}

/** The gate's column trace: per column of a square mask (row 0 at the bottom), [along, top, bottom] in metres from the
 * centre of an orthographic frame of half-size `half`, or null for an empty column. */
export function columnTrace(mask, size, half, N = 96) {
  const out = [];
  const step = size / N;
  for (let c = 0; c < N; c++) {
    const x0 = Math.floor(c * step), x1 = Math.min(size, Math.floor((c + 1) * step));
    let top = -1, bot = -1;
    for (let x = x0; x < x1; x++) {
      for (let y = size - 1; y >= 0; y--) if (mask[y * size + x]) { if (y > top) top = y; break; }
      for (let y = 0; y < size; y++) if (mask[y * size + x]) { if (bot < 0 || y < bot) bot = y; break; }
    }
    out.push(top >= 0 ? [((x0 + x1) / 2 + 0.5) / size * 2 * half - half,
      ((top + 0.5) / size * 2 - 1) * half, ((bot + 0.5) / size * 2 - 1) * half] : null);
  }
  return out;
}

/**
 * The dims rows' body extent of a side trace: columns whose band exceeds 12 % of the rough height; `h` is the p95 of their
 * tops (a 2-column mast must not define the roof) over their lowest bottom and `hMax` their highest top over it. `len` is
 * the first-to-last span of those columns, or, given the hull's own trace in the same frame (the gun's rig left out), that
 * trace's full span: Main's ruling 2026-10-30, since a thick barrel column crosses the band once the whips stop raising it,
 * and a hull's fenders and mudguards are part of its published length.
 */
export function bodyExtent(curve, hullCurve = null) {
  const cols = curve.filter(Boolean);
  if (!cols.length) return null;
  const rough = Math.max(...cols.map((c) => c[1])) - Math.min(...cols.map((c) => c[2]));
  const body = cols.filter((c) => c[1] - c[2] > rough * 0.12);
  if (!body.length) return null;
  const tops = body.map((c) => c[1]).sort((a, b) => a - b);
  const top = tops[Math.min(tops.length - 1, Math.floor(tops.length * 0.95))];
  const bot = Math.min(...body.map((c) => c[2]));
  const hull = hullCurve?.filter(Boolean) ?? [];
  const span = hull.length ? hull : body;
  return { h: top - bot, hMax: tops[tops.length - 1] - bot, len: Math.abs(span[span.length - 1][0] - span[0][0]) };
}

/** The published hull length a build's hull span is held to. The span is a silhouette (fenders, drums and stern kit in
 * it), so the target is one too: the spec's own silhouette hull length, else its published one. A build on a donor's
 * frame carries the donor's structural hull length without the donor's silhouette (stripSilhouetteDimensions); it is
 * held to its own oracle's hull span (`ownOracleLen`, measured on the same raster), else to the donor's silhouette. */
export function hullLengthTarget(dims, donorDims = null, ownOracleLen = null) {
  if (dims.silhouetteHullLengthM != null) return { published: dims.silhouetteHullLengthM };
  if (donorDims?.silhouetteHullLengthM == null || donorDims.hullLengthM !== dims.hullLengthM) return { published: dims.hullLengthM };
  return ownOracleLen > 0 ? { published: ownOracleLen, method: 'donor frame: own oracle hull span' }
    : { published: donorDims.silhouetteHullLengthM, method: 'donor frame: donor silhouette' };
}

/** A published height's error against the interval from the body top to the roof-fittings top: 0 inside it, else the
 * percentage distance to its nearer end. */
export function heightIntervalPct(bodyH, roofH, published) {
  const hi = Math.max(bodyH, roofH);
  const gap = published < bodyH ? bodyH - published : published > hi ? published - hi : 0;
  return gap / published * 100;
}
