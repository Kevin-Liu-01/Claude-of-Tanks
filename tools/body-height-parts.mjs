// tools/body-height-parts.mjs — the BODY the geometry gate's dims rows measure (Main's ruling 2026-10-30, owner-delegated):
// a tank's measured height is hull + turret, without radio whips and antennas, pintle and roof weapons and their mounts,
// or other thin roof fittings. The sim's dims.heightM (bots aim at 0.85 of it) does not change. Main's rulings later that
// day: a published height is an interval target, since sources measure to the cupola or to the roof gun: it passes when it
// lies between the body top and the roof-fittings top (whips always out, heightIntervalPct). An oracle comparison stays
// body against body. Hull length is the hull curve's own side span (the gun's rig left out, even on a casemate), never a
// band threshold that barrel columns can cross (bodyExtent). That span is a silhouette, so a build on a donor's frame,
// whose dims carry the donor's structural hull length, is held to the donor's silhouette, its own oracle's span shown
// beside it (hullLengthTarget; Main 2026-10-31).
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
// numbered weapon2../mount2.. and mgbracket/mgbox (their bare weapon and mount are the main gun's), the T-90M print's
// misspelt Anthena whip (267), or the registration's
// own roofFittingNodes pattern, so a gun-less oracle compares like for like. A node named ammo* (War Thunder's ammo_NN,
// a print's ammo_5, a source's ammo2 or ammobelt) goes with a roof gun the oracle names when it touches it (AMMO_TOUCH_M),
// as the build's ammunition rides in its gun's fitting; a box or rack anywhere else, or beside the coaxial mg_twin, stays
// body. A fused source names its roof gun by registered boxes in its certified frame (tools/fused-roof-gun-boxes.mjs):
// the triangles with all three corners in them leave its body; whips it fuses into a mesh it names by antenna boxes, and
// those leave every height, as the build's antenna spans do. An oracle comparison drops a kind of roof
// fitting (antennas, roof weapons) only where the oracle names that kind (pairedRoofFittings): a source that fuses its
// roof gun into the turret keeps the build's gun beside it, and one that names nothing is compared whole against whole.
// Stowage (Main's ruling 2026-10-31, 267): fuel drums, their cradles and stowage racks and baskets leave the body the gate
// compares, on the build and the source alike, wherever the build tags them (profiles/stowagePart.ts: a mesh of its own
// whole, a merged bucket's span by its stowageRanges) or the source names them (ORACLE_STOWAGE_NODES) or boxes them
// (FUSED_STOWAGE_BOXES: per source, named nodes and boxes within named nodes); the score's ruler stays the whole source
// (stowageParts).
// Imported by tools/procedural-fidelity.html (the browser gate) and tools/body-height-parts.selftest.mjs.
import { Box3, Matrix4, Vector3 } from 'three';

/** Fitting types that are roof fittings; the antenna ones never count toward any height. A commander's sight tower over
 * the cupola (kit.ts roofSight, 267) is one: a published height is taken to the cupola or the roof gun, so the body leaves
 * the tower out and the roof-fittings top keeps it. */
export const ROOF_FITTING_TYPES = Object.freeze(['antennaWhip', 'pintleMG', 'americanM2', 'americanRws', 'openYokeRws',
  'weaponStationMount', 'auxiliaryWeapon', 'roofSight']);
export const ANTENNA_FITTING_TYPES = Object.freeze(['antennaWhip']);
/** Seat roles cut from merged buckets (all antennas). */
export const BODY_EXCLUDED_SEAT_ROLES = Object.freeze(['antenna']);
/** Oracle node names: whips, masts and aerials, and the roof guns with their mounts (never the coaxial mg_twin). */
export const ORACLE_ROOF_FITTING_NODES = /(?:^|[#/-])(?:antenna|anthena|aerial|bone_mg_aa|mg_aa|bone_mg_[hv]_|mg_\d|mg_mount|\w*pintle|ammocan|weapon[2-9]|mount[2-9]|mgbracket|mgbox)/i;

/** Oracle node names of stowage by kind (Main 2026-11-01: one class, paired by kind): fuel drums and fuel storage,
 * stowage baskets and racks; jerry cans; unditching logs (never a gun's ammunition box). */
export const ORACLE_STOWAGE_NODES = Object.freeze({
  stowage: /(?:^|[#/_ -])(?:\w*drums?\b|fuel[ _-]?(?:drums?|storage|barrels?)|extra[ _-]?fuel|\w*baskets?|stowage)/i,
  can: /(?:^|[#/_ -])jerry[ _-]?cans?/i,
  log: /(?:^|[#/_ -])(?:unditching[ _-]?)?logs?(?![a-z])/i,
});
/** The kit fittings (profiles/kit.ts FITTINGS) that are stowage, by kind. */
export const KIT_STOWAGE_FITTINGS = Object.freeze({ stowageRack: 'stowage', jerryCans: 'can', unditchingLog: 'log' });

const roofTypes = new Set(ROOF_FITTING_TYPES);
const antennaTypes = new Set(ANTENNA_FITTING_TYPES);
const cutRoles = new Set(BODY_EXCLUDED_SEAT_ROLES);
const oracleAntenna = /(?:^|[#/-])(?:antenna|anthena|aerial)/i;
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

/** The triangles (corner slots, as bodyGeometryWithout takes them) of `mesh` whose three corners lie in `boxes`
 * ([x0, y0, z0, x1, y1, z1] in `root`'s frame). */
export function trianglesInBoxes(mesh, root, boxes) {
  const toRoot = new Matrix4().copy(root.matrixWorld).invert().multiply(mesh.matrixWorld);
  const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
  const n = index ? index.count : position.count, p = new Vector3(), ranges = [];
  const inside = (slot) => {
    p.fromBufferAttribute(position, index ? index.getX(slot) : slot).applyMatrix4(toRoot);
    return boxes.some((b) => p.x >= b[0] && p.y >= b[1] && p.z >= b[2] && p.x <= b[3] && p.y <= b[4] && p.z <= b[5]);
  };
  for (let t = 0; t + 2 < n; t += 3) if (inside(t) && inside(t + 1) && inside(t + 2)) ranges.push({ start: t, count: 3 });
  return ranges;
}

/**
 * The roof fittings of one model: `nodes` (render node -> tag) leave the body whole; `trimmed` (render node -> body
 * geometry) lose their antennas: the build's tagged spans, or the whips an oracle fuses into a mesh, the triangles in its
 * registered `antennaBoxes` (`antennaBoxed`: render node -> triangles taken); `boxed` (render node -> body geometry) lose
 * a fused oracle's roof gun, the triangles in its registered `boxes`, and those antennas too. An oracle also answers to
 * its node names. isAntennaTag sorts the nodes.
 */
export function roofFittingParts(root, { isRenderNode, oracle = false, nodePattern = ORACLE_ROOF_FITTING_NODES, boxes = null,
  antennaBoxes = null, cut = null }) {
  const nodes = new Map(), trimmed = new Map(), ammo = new Map(), boxed = new Map(), antennaBoxed = new Map();
  if (oracle && (boxes?.length || antennaBoxes?.length)) root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!isRenderNode(o)) return;
    const tag = roofFittingTag(o, root) ?? (oracle ? oracleRoofFittingTag(o, root, nodePattern) : null)
      ?? (cutRoles.has(o.geometry.userData?.seatRole) ? `${o.geometry.userData.seatRole}:${o.name}` : null);
    if (tag) { nodes.set(o, tag); return; }
    const box = oracle ? oracleRoofFittingTag(o, root, oracleAmmo) : null;
    if (box) ammo.set(o, box);
    if (o.isInstancedMesh) return;
    const whips = oracle && antennaBoxes?.length ? trianglesInBoxes(o, root, antennaBoxes) : [];
    if (whips.length) antennaBoxed.set(o, whips.length);
    const ranges = [...(o.userData?.seatRoleRanges ?? []).filter((r) => cutRoles.has(r.role)), ...whips];
    // the stowage a page sets aside (stowageParts: `cut`) stays out of every body built here too
    const also = cut?.get(o) ?? [];
    if (ranges.length) trimmed.set(o, bodyGeometryWithout(o.geometry, [...ranges, ...also]));
    if (oracle && boxes?.length) {
      const gun = trianglesInBoxes(o, root, boxes);
      if (gun.length) boxed.set(o, bodyGeometryWithout(o.geometry, [...gun, ...whips, ...also]));
    }
  });
  if (ammo.size) {
    root.updateMatrixWorld(true);
    const guns = [...nodes].filter(([, tag]) => !isAntennaTag(tag)).map(([o]) => new Box3().setFromObject(o).expandByScalar(AMMO_TOUCH_M));
    for (const [o, tag] of ammo) {
      const box = new Box3().setFromObject(o);
      if (guns.some((gun) => gun.intersectsBox(box))) nodes.set(o, tag);
    }
  }
  return { nodes, trimmed, boxed, antennaBoxed };
}

/** The stowage kind a build part carries: its own geometry's stowagePart tag, or a stowage kit fitting it belongs to. */
function buildStowageKind(object, root) {
  const own = object.geometry?.userData?.stowage;
  if (own) return typeof own === 'string' ? own : 'stowage';
  for (let p = object; p && p !== root; p = p.parent) {
    const fitting = p.userData?.fitting;
    if (typeof fitting === 'string' && KIT_STOWAGE_FITTINGS[fitting]) return KIT_STOWAGE_FITTINGS[fitting];
  }
  return null;
}

/**
 * The stowage of one model (Main 2026-10-31, kinds 2026-11-01): `nodes` (render node -> { kind, tag }) leave whole, the
 * build's meshes whose own geometry carries the stowage tag or that belong to a stowage kit fitting, and the oracle's nodes
 * ORACLE_STOWAGE_NODES (or `nodePatterns`) or its registration's `named` ({ kind: RegExp }) names; `ranges` (render node ->
 * [{ start, count, kind }], corner slots as bodyGeometryWithout takes them) are cut from merged meshes, the build's
 * stowageRanges and, for each of a fused oracle's registered `parts` ({ kind, within, boxes }), the triangles of the nodes
 * `within` names (the node or an ancestor) whose three corners lie in its boxes.
 */
export function stowageParts(root, { isRenderNode, oracle = false, nodePatterns = ORACLE_STOWAGE_NODES, named = null, parts = null }) {
  const nodes = new Map(), ranges = new Map();
  if (oracle && parts?.length) root.updateMatrixWorld(true);
  const patterns = [...Object.entries(nodePatterns), ...Object.entries(named ?? {})];
  root.traverse((o) => {
    if (!isRenderNode(o)) return;
    if (oracle) {
      for (const [kind, pattern] of patterns) {
        const tag = oracleRoofFittingTag(o, root, pattern);
        if (tag) { nodes.set(o, { kind, tag }); return; }
      }
    } else {
      const kind = buildStowageKind(o, root);
      if (kind) { nodes.set(o, { kind, tag: `stowage:${o.name}` }); return; }
    }
    if (o.isInstancedMesh) return;
    const cut = oracle
      ? (parts ?? []).filter(({ within }) => oracleRoofFittingTag(o, root, within))
        .flatMap(({ kind = 'stowage', boxes }) => trianglesInBoxes(o, root, boxes).map((r) => ({ ...r, kind })))
      : (o.userData?.stowageRanges ?? []).map((r) => ({ ...r, kind: r.kind ?? 'stowage' }));
    if (cut.length) ranges.set(o, cut);
  });
  return { nodes, ranges };
}

/** The stowage both models set aside (Main 2026-11-01): a kind leaves only where the build tags it (a part `visible`) and
 * the source names or boxes it; any other kind stays on both sides. `unpaired` names the kinds one side has alone. */
export function pairedStowage(built, oracle, visible = () => true) {
  const kinds = ({ nodes, ranges }, own) => new Set([...[...nodes].filter(([node]) => !own || visible(node)).map(([, v]) => v.kind),
    ...[...ranges].filter(([node]) => !own || visible(node)).flatMap(([, list]) => list.map((r) => r.kind))]);
  const have = [kinds(built, true), kinds(oracle, false)];
  const both = new Set([...have[0]].filter((kind) => have[1].has(kind)));
  const keep = ({ nodes, ranges }) => ({
    nodes: new Map([...nodes].filter(([, v]) => both.has(v.kind))),
    ranges: new Map([...ranges].map(([node, list]) => [node, list.filter((r) => both.has(r.kind))]).filter(([, list]) => list.length)),
  });
  return { built: keep(built), oracle: keep(oracle), kinds: [...both].sort(),
    unpaired: { procedural: [...have[0]].filter((k) => !both.has(k)).sort(), reference: [...have[1]].filter((k) => !both.has(k)).sort() } };
}

/** The parts an oracle comparison leaves out of both models: every roof fitting the oracle names (by node or by its
 * registered roof-gun boxes), and the build's roof fittings of the kinds the oracle names. `cutBuildSpans` says whether the build's antenna spans are cut too. */
export function pairedRoofFittings(built, oracle) {
  const named = { antenna: oracle.trimmed.size > 0, weapon: (oracle.boxed?.size ?? 0) > 0 };
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
 * built on that hull by design, so it is held to the donor's silhouette, and its own oracle's hull span (`ownOracleLen`,
 * measured on the same raster) rides along for information only (Main 2026-10-31: legacy oracles carry scale error). */
export function hullLengthTarget(dims, donorDims = null, ownOracleLen = null) {
  if (dims.silhouetteHullLengthM != null) return { published: dims.silhouetteHullLengthM };
  if (donorDims?.silhouetteHullLengthM == null || donorDims.hullLengthM !== dims.hullLengthM) return { published: dims.hullLengthM };
  return { published: donorDims.silhouetteHullLengthM, method: 'donor frame: donor silhouette',
    ...(ownOracleLen > 0 && { ownOracleHullSpan: ownOracleLen }) };
}

/** A published height's error against the interval from the body top to the roof-fittings top: 0 inside it, else the
 * percentage distance to its nearer end. */
export function heightIntervalPct(bodyH, roofH, published) {
  const hi = Math.max(bodyH, roofH);
  const gap = published < bodyH ? bodyH - published : published > hi ? published - hi : 0;
  return gap / published * 100;
}
