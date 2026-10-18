#!/usr/bin/env node
// Gun-junction gap census: can a player see THROUGH the main gun where the tube, its sleeve or collar meets the
// mantlet and the turret face?
//
//   node tools/gun-junction-census.mjs --ids=c2_ariete,cv90 [--poses=rest,elev,dep,e0.5,d0.5] [--res-mm=2] [--images] [--json=path]
//   node tools/gun-junction-census.mjs --all [--gate]
//   node tools/gun-junction-census.mjs --ledger=docs/geometry-gate/gun-junction.json --update|--check [--gate] --ids=<a,b>|--all
//
// Every main-gun mouth the factory publishes (userData.physicalMouth under rig_gun: origin on the mouth plane, -Z into
// the bore) defines the gun axis. The tank is built first-party (createTank, proceduralOnly, interior fills applied, LOD
// level 0 only), posed at rest and at the spec's maximum elevation and depression (rig_gun.rotation.x = -pitch, the
// runtime convention), and software-rasterised orthographically from 24 directions perpendicular to that axis, at
// millimetre pixels, over the band from the mouth back past the gun pivot.
//
// For each pixel the nearest opaque front and back faces decide what the player sees (the sealed check's rules:
// transparent and alpha-cut surfaces do not occlude, a back face nearer than every front face is the inside of a wall,
// a back face with a front face within 8 cm behind it is an inside-out thin part and the GPU shows the front face):
//   on the axis band (|offset| <= 0.85 x the bore radius, never past 0.6 x the mouth's outer radius), the gun line must be hidden by material in front
//   of it: a pixel where nothing is hit (background), where the inside of a wall shows, or where the nearest visible
//   front face lies BEHIND the axis is a gap in the gun;
//   on the junction band beside it (out to --band-m, default 0.45 m), the inside of a wall showing is an opening
//   between the gun and the mantlet or turret face (an off-axis open ring, slot or slit).
// Bore interiors (insideBore over every physical mouth) are never openings. Gap pixels are grouped into axial runs;
// each run reports its stations (mm behind the mouth, and forward of the gun pivot), its axial size, how many of the 24
// directions see it, and the meshes that bound it behind and ahead on the axis, classified as
//   gun-junction (a mantlet/turret/mount part behind, a recoiling tube part ahead; 'aperture' when the run lies wholly
//   behind the gun pivot, a look along the gun line into the turret), tube-segment (recoiling parts on
//   both sides), muzzle-device (within --muzzle-m of the mouth, brake ports), or mount (non-recoiling on both sides).
// Receipt 2026-10-17 (227, all 220 ids, 2 mm, rest/max elevation/max depression): gun-junction c2_ariete 50 mm and
// ztz85_iii 10 mm; mount t90m_proryv/t90am 58-70 mm, pl01/pl01_105 88-96 mm at max elevation; aperture fv510,
// fv510_milan, m3a3_bradley, spz_wotan; off-axis slivers t72b3_qilin, ztz99a2, vt4a1, bmpt_t90, cv90_mk4 (smoke-tube mouths).
// --gate exits non-zero when any gun-junction, tube-segment, mount or aperture run is at least --min-mm (default 4 mm)
// long and seen from at least 2 directions, or any off-axis opening reaches --min-px pixels.
// --seed-recoil-m=<m> is the negative control: it slides the recoil rig m metres forward along the bore (the tube pulled
// off its seat), which must open a gun-junction run of about m at a closed junction.
// Fixes 2026-10-17 (227, same census): c2_ariete, ztz85_iii, t90am, t90m_proryv, pl01, pl01_105, fv510, fv510_milan
// and spz_wotan CLOSED at rest, full elevation and full depression; tools/gun-junction-census.selftest.mjs holds them
// (4 mm, 12 directions, plus half elevation) with a seeded control. r3 (2026-10-18): the same nine CLOSED across the
// sweep rest/elev/dep/e0.25/e0.5/e0.75/d0.5 at 2 mm, 24 directions (the fv510/fv510_milan 12 px turret-seam sliver
// at e0.25 is the turret's own roof-face crevice, identical in the pre-lane tree). The off-axis slivers on t72b3_qilin,
// ztz99a2 and vt4a1 were the ERA cassettes' sawtooth caps on the gun channel walls (chineseGunOpening.ts halfStock);
// closed (src/vehicles/profiles/chineseChannelWallCaps.selftest.mjs), ztz99a2 and vt4a1 now CLOSED at rest/elev/dep/
// e0.5/d0.5 (t72b3_qilin keeps a pre-existing 12-45 px turretEquipment box edge at the band's rear station).
// r4 (2026-10-18): that box edge, the bmpt_t90 'seam', the fv510/fv510_milan 12 px crevice and the cv90_mk4 run at full
// elevation all sat on the band's last column: triangles there were culled one pixel early, so their front faces went
// missing; with the cull fixed all four read CLOSED (cv90_mk4's run past the pivot at +45 deg is the turret-ring
// clearance over the hull deck, a 'behind-pivot' run, never gated). Guns fixed in the hull (strv103a, strv103b, udes03)
// are censused from their hull mouth at one pose; launchers with fixed canisters (aft10, griffin_viper, tos1a_tagil)
// have no cannon mouth. m3a3_bradley's 86-90 mm aperture (the gun line open from above between the roof's leading edge
// and the receiver) closed with a trunnion hood (m3BradleyGunMount.ts); cv90_mk4's smoke-tube rings no longer overhang
// their tubes (the ring's back face was the 'opening'); fv510's mantlet slot was re-centred on the RARDEN. The per-id
// ledger (--ledger, below) now holds all 220 rows.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { collectTriangles } from './tank-surface-collect.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const flag = (name) => args.includes(`--${name}`);
// Per-id ledger (r4, 2026-10-18): --ledger=docs/geometry-gate/gun-junction.json measures every row at the ledger's own
// settings (the CLI resolution, directions and poses are ignored there, so rows stay comparable) and binds each row to
// the tank's turret and gun group digests in docs/references/fleet-geometry-ledger.json (plus the hull group for a gun
// fixed in the hull). --update re-measures and writes the rows for --ids (or --all); --check re-measures them and
// compares, failing on a moved status or a stale binding; --gate also fails on any row that is not closed (a launcher
// with fixed canisters has no cannon mouth and is its own status). tools/gun-junction-census.selftest.mjs holds the
// whole fleet against the ledger without building a tank (every binding current, every row closed or a launcher).
const LEDGER_PATH = opt('ledger', '');
const FLEET_LEDGER_PATH = 'docs/references/fleet-geometry-ledger.json';
const LEDGER_DEFAULTS = Object.freeze({ resMm: 4, azimuths: 12, poses: ['rest', 'elev', 'dep', 'e0.5', 'd0.5'], minMm: 4, minPx: 12, bandM: 0.45, behindM: 0.35 });
const ledger = LEDGER_PATH && existsSync(resolve(LEDGER_PATH)) ? JSON.parse(readFileSync(resolve(LEDGER_PATH), 'utf8')) : null;
const L = LEDGER_PATH ? (ledger?.settings ?? LEDGER_DEFAULTS) : null;
const RES_M = (L ? L.resMm : Number(opt('res-mm', '2'))) / 1000;
const BAND_M = L ? L.bandM : Number(opt('band-m', '0.45'));
const AZIMUTHS = L ? L.azimuths : Number(opt('azimuths', '24'));
const MUZZLE_M = Number(opt('muzzle-m', '0.8'));
const MIN_MM = L ? L.minMm : Number(opt('min-mm', '4'));
const MIN_PX = L ? L.minPx : Number(opt('min-px', '12'));
const SEED_RECOIL_M = Number(opt('seed-recoil-m', '0'));
const BEHIND_PIVOT_M = L ? L.behindM : Number(opt('behind-m', '0.35'));
const SEAM_EPS = 0.004, INVERTED_DEPTH = 0.08, AXIS_TOL = 0.002;
// Sample points sit off the pixel centres by irrational fractions so a round-metre edge (a 0.25 m box seen edge-on)
// never lands exactly on a sample row; triangles seen within 0.006 deg of edge-on cover no area and are skipped.
const SX = 0.5 + 0.1913, SY = 0.5 + 0.3771, EDGE_ON = 1e-4;
const poses = L ? [...L.poses] : opt('poses', 'rest,elev,dep').split(',').filter(Boolean);
const outDir = resolve(opt('out', '.qa-dev/out/gun-junction'));
const writeImages = flag('images');
if (writeImages) mkdirSync(outDir, { recursive: true });
// A gun fixed in the hull (Strv 103, UDES 03) aims with the hull: its smallest main-gun bore is 15 mm, so a hull
// machine gun's mouth is never taken for it.
const HULL_GUN_MIN_BORE_M = 0.015;

const { createTank } = await import('../src/vehicles/tankFactory.ts');
const { ensureInteriorFills } = await import('../src/vehicles/interiorFills.ts');
const { ALL_TANK_IDS, getSpec } = await import('../src/vehicles/specs.ts');
const ids = flag('all') ? [...ALL_TANK_IDS] : opt('ids', LEDGER_PATH ? '' : 'c2_ariete').split(',').filter(Boolean);
if (LEDGER_PATH && !ids.length) { console.error('gun-junction ledger: pass --ids=<a,b> or --all'); process.exit(2); }
if (LEDGER_PATH && flag('update') === flag('check')) { console.error('gun-junction ledger: pass exactly one of --update or --check'); process.exit(2); }

/** Show only LOD level 0 (the close-up surface the player inspects); returns a restore function. */
function nearestLodOnly(root) {
  const hidden = [];
  root.traverse((o) => {
    if (!o.isLOD) return;
    o.levels.forEach((level, i) => { if (i > 0 && level.object.visible) { level.object.visible = false; hidden.push(level.object); } });
  });
  return () => { for (const o of hidden) o.visible = true; };
}

/** The mesh objects collectTriangles indexes, in its traversal order, with their rig ownership. */
function meshOwners(root) {
  const owners = [];
  root.traverseVisible((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.getAttribute('position')) return;
    let rig = 'hull';
    for (let p = o; p; p = p.parent) {
      if (/^rig_recoil$|^rig_barrel_/.test(p.name)) { rig = 'recoil'; break; }
      if (p.name === 'rig_gun') { rig = 'gun'; break; }
      if (p.name === 'rig_turret') { rig = 'turret'; break; }
    }
    owners.push({ name: o.name || o.type, rig });
  });
  return owners;
}

function isUnder(o, ancestor) { for (let p = o; p; p = p.parent) if (p === ancestor) return true; return false; }

/** Main-gun mouths: frames under rig_gun with a physical mouth seat receipt. */
function collectMouths(root) {
  root.updateMatrixWorld(true);
  const gun = root.getObjectByName('rig_gun'), turretRig = root.getObjectByName('rig_turret');
  const mouths = [];
  root.traverseVisible((o) => {
    const seat = o.userData?.muzzleSeatReceipt;
    if (!o.userData?.physicalMouth || !seat) return;
    const scale = Math.abs(o.getWorldScale(new THREE.Vector3()).x) || 1;
    const r = Number(seat.physicalInnerRadiusM ?? seat.innerRadiusM), depth = Number(seat.physicalBoreDepthM);
    const outer = Math.max(r || 0, Number(seat.outerRadiusM ?? seat.measuredOuterRadiusM) || 0, Number(seat.supportOuterRadiusM) || 0);
    const main = !!gun && isUnder(o, gun), turret = !!turretRig && isUnder(o, turretRig);
    mouths.push({
      name: o.name, main, hullFixed: !main && !turret && r >= HULL_GUN_MIN_BORE_M, inv: o.matrixWorld.clone().invert(), worldScale: scale,
      r: r > 0 ? r : 0, depth: depth > 0 ? depth : 0, outer: (outer || 0.05) * scale,
      origin: new THREE.Vector3().setFromMatrixPosition(o.matrixWorld),
      axis: new THREE.Vector3(0, 0, 1).transformDirection(o.matrixWorld).normalize(),
    });
  });
  return mouths;
}

const _local = new THREE.Vector3();
function insideBore(mouths, x, y, z, tolM) {
  for (const b of mouths) {
    if (!(b.r > 0) || !(b.depth > 0)) continue;
    _local.set(x, y, z).applyMatrix4(b.inv);
    const tol = tolM / b.worldScale;
    if (_local.z > tol || _local.z < -(b.depth + tol)) continue;
    const radial = Math.hypot(_local.x, _local.y);
    if (radial <= b.r + tol || (Math.abs(_local.z) <= tol && radial <= b.outer / b.worldScale + tol)) return true;
  }
  return false;
}

/**
 * The pose's opaque triangles in one mouth's axis frame: per vertex (s = metres behind the mouth, x = along e1,
 * y = along e2), culled to the stations the census covers. Also returns the frame and the junction station: the
 * forward-most station where non-recoiling gun-rig or turret stock lies within the band of the axis.
 */
function axisFrame(tris, owners, mouth, sMax) {
  const a = mouth.axis, O = mouth.origin;
  const up = Math.abs(a.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const e1 = new THREE.Vector3().crossVectors(up, a).normalize();
  const e2 = new THREE.Vector3().crossVectors(a, e1).normalize();
  const keep = [];
  const v9 = [];
  let sJunction = Infinity;
  for (let ti = 0; ti < tris.length; ti++) {
    const t = tris[ti]; if (t.transparent) continue;
    const pts = [[t.ax, t.ay, t.az], [t.bx, t.by, t.bz], [t.cx, t.cy, t.cz]].map(([x, y, z]) => {
      const px = x - O.x, py = y - O.y, pz = z - O.z;
      return [-(px * a.x + py * a.y + pz * a.z), px * e1.x + py * e1.y + pz * e1.z, px * e2.x + py * e2.y + pz * e2.z];
    });
    const sLo = Math.min(pts[0][0], pts[1][0], pts[2][0]), sHi = Math.max(pts[0][0], pts[1][0], pts[2][0]);
    // Keep every triangle that can reach the last image column: its sample sits up to 1.7 px past sMax (r4, 2026-10-18:
    // culling at sMax + 1 px dropped front faces there and read a band-edge sliver on t72b3_qilin, bmpt_t90, fv510 and cv90_mk4).
    if (sHi < -RES_M || sLo > (Math.ceil(sMax / RES_M) + 2) * RES_M) continue;
    const rig = owners[t.mesh].rig;
    if (rig === 'gun' || rig === 'turret') for (const q of pts) if (Math.hypot(q[1], q[2]) <= BAND_M && q[0] >= 0 && q[0] < sJunction) sJunction = q[0];
    keep.push(ti); v9.push(pts[0][0], pts[0][1], pts[0][2], pts[1][0], pts[1][1], pts[1][2], pts[2][0], pts[2][1], pts[2][2]);
  }
  return { e1, e2, keep: Int32Array.from(keep), v9: Float64Array.from(v9), sJunction };
}

/**
 * Rasterise one view perpendicular to the mouth's axis. Image column = station s (metres behind the mouth), row =
 * lateral offset v. Returns per-pixel kinds: 0 solid/empty-off-axis, 1 axis gap (background), 2 axis gap (wall
 * inside), 3 axis gap (seeing past the axis), 4 off-axis opening (wall inside). Inside-wall pixels count only when
 * that wall lies within the band of the axis (a hull or track interior seen past the gun is the sealed check's).
 */
function rasterizeAxisView(tris, frame, mouth, mouths, sMax, phi) {
  const a = mouth.axis, O = mouth.origin;
  const { e1, e2, keep, v9 } = frame;
  const cp = Math.cos(phi), sp = Math.sin(phi);
  const cam = e1.clone().multiplyScalar(cp).addScaledVector(e2, sp); // axis -> camera
  const d = cam.clone().negate(); // view direction
  const w = new THREE.Vector3().crossVectors(a, d).normalize(); // image lateral
  // in the (e1, e2) plane: d = (-cp, -sp); w = a x d = (sp, -cp) since a x e1 = e2 and a x e2 = -e1
  const wx = sp, wy = -cp, dx = -cp, dy = -sp;
  const W = Math.ceil(sMax / RES_M) + 1, H = Math.ceil((2 * BAND_M) / RES_M);
  const N = W * H;
  const zf = new Float32Array(N).fill(Infinity), zb = new Float32Array(N).fill(Infinity);
  const ownF = new Int32Array(N).fill(-1), ownB = new Int32Array(N).fill(-1);
  // The axis band stays inside the bore radius (any tube wall covers it from every side), so a thin autocannon tube
  // behind a wider muzzle device or seat ring is never read as open at the band's edges.
  const rBore = mouth.r * mouth.worldScale;
  const axisHalf = Math.max(2, Math.round(Math.min(0.6 * mouth.outer, rBore > 0 ? 0.85 * rBore : Infinity) / RES_M));
  const mid = H / 2 - SY + 0.5; // the row whose sample lies on the axis, in the 'py + 0.5 - mid' convention
  const axisLo = Math.floor(mid - axisHalf), axisHi = Math.ceil(mid + axisHalf);
  const junctionPx = Number.isFinite(frame.sJunction) ? Math.max(0, Math.floor((frame.sJunction - 0.05) / RES_M)) : 0;
  const invRes = 1 / RES_M;
  for (let k = 0; k < keep.length; k++) {
    const t = tris[keep[k]]; const o = k * 9;
    const x0 = v9[o] * invRes, y0 = (v9[o + 1] * wx + v9[o + 2] * wy + BAND_M) * invRes, z0 = v9[o + 1] * dx + v9[o + 2] * dy;
    const x1 = v9[o + 3] * invRes, y1 = (v9[o + 4] * wx + v9[o + 5] * wy + BAND_M) * invRes, z1 = v9[o + 4] * dx + v9[o + 5] * dy;
    const x2 = v9[o + 6] * invRes, y2 = (v9[o + 7] * wx + v9[o + 8] * wy + BAND_M) * invRes, z2 = v9[o + 7] * dx + v9[o + 8] * dy;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    if (minX > maxX || minY > maxY) continue;
    const nx = (t.by - t.ay) * (t.cz - t.az) - (t.bz - t.az) * (t.cy - t.ay), ny = (t.bz - t.az) * (t.cx - t.ax) - (t.bx - t.ax) * (t.cz - t.az), nz = (t.bx - t.ax) * (t.cy - t.ay) - (t.by - t.ay) * (t.cx - t.ax);
    const facing = nx * d.x + ny * d.y + nz * d.z; if (Math.abs(facing) <= EDGE_ON * Math.hypot(nx, ny, nz)) continue;
    let front = facing < 0; if (t.flip) front = !front; if (t.side === THREE.BackSide) front = !front; if (t.side === THREE.DoubleSide) front = true;
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0); if (Math.abs(area) < 1e-12) continue; const inv = 1 / area;
    for (let py = minY; py <= maxY; py++) {
      const sy = py + SY;
      const rowMinX = (py < axisLo || py > axisHi) ? Math.max(minX, junctionPx) : minX;
      for (let px = rowMinX; px <= maxX; px++) {
        const sx = px + SX;
        const w0 = ((x1 - sx) * (y2 - sy) - (x2 - sx) * (y1 - sy)) * inv; if (w0 < 0) continue;
        const w1 = ((x2 - sx) * (y0 - sy) - (x0 - sx) * (y2 - sy)) * inv; if (w1 < 0) continue;
        const w2 = 1 - w0 - w1; if (w2 < 0) continue;
        const depth = w0 * z0 + w1 * z1 + w2 * z2; const p = py * W + px;
        if (front) { if (depth < zf[p]) { zf[p] = depth; ownF[p] = t.mesh; } }
        else if (depth < zb[p]) { zb[p] = depth; ownB[p] = t.mesh; }
      }
    }
  }
  const kind = new Uint8Array(N);
  const worldOf = (px, py, depth) => {
    const s = (px + SX) * RES_M, v = (py + SY) * RES_M - BAND_M;
    return [O.x - a.x * s + w.x * v + d.x * depth, O.y - a.y * s + w.y * v + d.y * depth, O.z - a.z * s + w.z * v + d.z * depth];
  };
  for (let py = 0; py < H; py++) {
    const onAxis = py >= axisLo && py <= axisHi && Math.abs(py + 0.5 - mid) <= axisHalf;
    for (let px = onAxis ? 0 : junctionPx; px < W; px++) {
      const p = py * W + px;
      const hasF = zf[p] !== Infinity, hasB = zb[p] !== Infinity;
      let insideWall = false;
      if (hasB && zb[p] < (hasF ? zf[p] : Infinity) - SEAM_EPS && Math.abs(zb[p]) <= BAND_M) {
        const inverted = hasF && zf[p] - zb[p] < INVERTED_DEPTH;
        if (!inverted) {
          const [x, y, z] = worldOf(px, py, zb[p]);
          if (!insideBore(mouths, x, y, z, RES_M)) insideWall = true;
        }
      }
      if (onAxis) {
        if (insideWall) kind[p] = 2;
        else if (!hasF && !hasB) kind[p] = 1;
        else if (hasF ? zf[p] > -AXIS_TOL && !(hasB && zb[p] < -AXIS_TOL && zb[p] < zf[p] - SEAM_EPS) : zb[p] > -AXIS_TOL) kind[p] = 3;
      } else if (insideWall) kind[p] = 4;
    }
  }
  return { W, H, kind, ownF, ownB, zf, axisHalf, mid, cam, d };
}

const azName = (phi) => { const deg = Math.round(phi * 180 / Math.PI) % 360; return deg === 0 ? 'side+X' : deg === 90 ? 'above' : deg === 180 ? 'side-X' : deg === 270 ? 'below' : `az${deg}`; };

/** The meshes that bound an axial run on the axis row: the nearest front-face owners just behind and just ahead. */
function boundingMeshes(view, owners, s0, s1) {
  const { W, ownF, mid } = view; const row = Math.floor(mid);
  const look = (from, step) => {
    for (let k = 1; k <= 60; k++) {
      const px = from + step * k; if (px < 0 || px >= W) break;
      for (const dy of [0, -1, 1, -2, 2]) { const o = ownF[(row + dy) * W + px]; if (o >= 0) return owners[o]; }
    }
    return null;
  };
  return { behind: look(s1, +1), ahead: look(s0, -1) };
}

function classify(run, sPivot) {
  const behind = run.behind, ahead = run.ahead;
  if (run.s0 < MUZZLE_M && (!behind || behind.rig === 'recoil') && (!ahead || ahead.rig === 'recoil')) return 'muzzle-device';
  if (behind && ahead && behind.rig === 'recoil' && ahead.rig === 'recoil') return 'tube-segment';
  // Wholly behind the gun pivot the gun line runs inside the turret: an opening there is a look into the gun aperture.
  if (ahead && ahead.rig === 'recoil' && behind && behind.rig !== 'recoil') return run.s0 > sPivot ? 'aperture' : 'gun-junction';
  if (run.s1 > sPivot) return 'behind-pivot';
  return 'mount';
}

/** The main-gun mouths a census covers: those under rig_gun, or, on a gun fixed in the hull, its hull mouths. */
function censusMouths(mouths) {
  const main = mouths.filter((m) => m.main);
  return main.length ? main : mouths.filter((m) => m.hullFixed);
}
const mouthKind = (mouths) => (mouths.some((m) => m.main) ? 'turret' : mouths.some((m) => m.hullFixed) ? 'hull-fixed' : 'none');

function censusPose(tank, spec, pose) {
  const root = tank.root; const gun = root.getObjectByName('rig_gun');
  // rest, elev, dep, or a fraction of either limit: e0.5 is half the maximum elevation, d0.5 half the depression
  const E = spec.gunElevationDeg ?? 0, D = spec.gunDepressionDeg ?? 0;
  const pitch = pose === 'elev' ? E : pose === 'dep' ? -D : /^e[\d.]+$/.test(pose) ? E * Number(pose.slice(1))
    : /^d[\d.]+$/.test(pose) ? -D * Number(pose.slice(1)) : 0;
  if (gun) gun.rotation.x = -pitch * Math.PI / 180;
  root.updateMatrixWorld(true);
  const restore = nearestLodOnly(root);
  const { tris } = collectTriangles(root);
  const owners = meshOwners(root);
  const mouths = collectMouths(root);
  restore();
  const pivot = gun ? new THREE.Vector3().setFromMatrixPosition(gun.matrixWorld) : null;
  const results = [];
  const censused = censusMouths(mouths);
  for (const mouth of censused) {
    const sPivot = pivot ? new THREE.Vector3().subVectors(mouth.origin, pivot).dot(mouth.axis) : 3;
    const sMax = Math.max(0.5, sPivot + BEHIND_PIVOT_M);
    const frame = axisFrame(tris, owners, mouth, sMax);
    const rows = new Map(); // station px -> {dirs:Set, kinds:Set}
    const offAxis = []; const images = [];
    let viewForBounds = null;
    for (let k = 0; k < AZIMUTHS; k++) {
      const phi = (k / AZIMUTHS) * Math.PI * 2;
      const view = rasterizeAxisView(tris, frame, mouth, mouths, sMax, phi);
      if (!viewForBounds) viewForBounds = view;
      let gapPx = 0, offPx = 0;
      const offOwners = new Map();
      let offS0 = Infinity, offS1 = -Infinity, offV0 = Infinity, offV1 = -Infinity;
      for (let py = 0; py < view.H; py++) for (let px = 0; px < view.W; px++) {
        const kd = view.kind[py * view.W + px]; if (!kd) continue;
        if (kd === 4) {
          offPx++; const o = view.ownB[py * view.W + px]; if (o >= 0) offOwners.set(owners[o].name, (offOwners.get(owners[o].name) || 0) + 1);
          offS0 = Math.min(offS0, px); offS1 = Math.max(offS1, px); const v = (py + SY) * RES_M - BAND_M; offV0 = Math.min(offV0, v); offV1 = Math.max(offV1, v);
          continue;
        }
        gapPx++;
        let r = rows.get(px); if (!r) rows.set(px, r = { dirs: new Set(), kinds: new Set(), views: [] });
        r.dirs.add(k); r.kinds.add(kd);
      }
      if (offPx >= MIN_PX) offAxis.push({ view: azName(phi), px: offPx, sMm: [Math.round(offS0 * RES_M * 1000), Math.round(offS1 * RES_M * 1000)], vMm: [Math.round(offV0 * 1000), Math.round(offV1 * 1000)], meshes: [...offOwners.entries()].sort((u, v) => v[1] - u[1]).slice(0, 3).map(([n, c]) => `${n}(${c})`) });
      if ((gapPx || offPx >= MIN_PX) && writeImages) images.push({ name: azName(phi), view });
      if (gapPx) for (const [px, r] of rows) if (r.dirs.has(k) && r.views.length < 1) r.views.push(view);
    }
    // group stations into contiguous axial runs (1-px tolerance)
    const stations = [...rows.keys()].sort((u, v) => u - v);
    const runs = [];
    for (const px of stations) {
      const last = runs[runs.length - 1];
      if (last && px - last.p1 <= 2) { last.p1 = px; for (const d of rows.get(px).dirs) last.dirs.add(d); for (const kd of rows.get(px).kinds) last.kinds.add(kd); last.n++; }
      else runs.push({ p0: px, p1: px, dirs: new Set(rows.get(px).dirs), kinds: new Set(rows.get(px).kinds), n: 1, view: rows.get(px).views[0] });
    }
    const reported = runs.map((run) => {
      const s0 = run.p0 * RES_M, s1 = (run.p1 + 1) * RES_M;
      const { behind, ahead } = boundingMeshes(run.view || viewForBounds, owners, run.p0, run.p1);
      const row = { s0, s1, behind, ahead };
      const kinds = [...run.kinds].map((kd) => (kd === 1 ? 'background' : kd === 2 ? 'wall-inside' : 'past-axis'));
      return {
        class: classify(row, sPivot),
        sizeMm: +((s1 - s0) * 1000).toFixed(1),
        behindMouthMm: [Math.round(s0 * 1000), Math.round(s1 * 1000)],
        forwardOfPivotMm: [Math.round((sPivot - s1) * 1000), Math.round((sPivot - s0) * 1000)],
        directions: run.dirs.size,
        seenFrom: [...run.dirs].sort((u, v) => u - v).map((k) => azName((k / AZIMUTHS) * Math.PI * 2)),
        shows: kinds,
        behind: behind ? `${behind.name}[${behind.rig}]` : null,
        ahead: ahead ? `${ahead.name}[${ahead.rig}]` : null,
      };
    });
    results.push({ mouth: mouth.name, outerRadiusMm: Math.round(mouth.outer * 1000), pivotBehindMouthMm: Math.round(sPivot * 1000), junctionBehindMouthMm: Number.isFinite(frame.sJunction) ? Math.round(frame.sJunction * 1000) : null, runs: reported, offAxis, images });
  }
  if (gun) { gun.rotation.x = 0; root.updateMatrixWorld(true); }
  return { pose, pitchDeg: pitch, mainMouths: censused.length, kind: mouthKind(mouths), allMouths: mouths.length, results };
}

async function writeImage(path, view) {
  const { createCanvas } = await import('@napi-rs/canvas');
  const { W, H, kind, zf } = view;
  const canvas = createCanvas(W, H); const ctx = canvas.getContext('2d'); const img = ctx.createImageData(W, H);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const p = py * W + px; const kd = kind[p];
    let r = 14, g = 15, b = 18;
    if (Number.isFinite(zf[p])) { const l = Math.max(60, Math.min(210, 150 - zf[p] * 120)); r = g = b = l; }
    if (kd === 1) { r = 230; g = 60; b = 230; } else if (kd === 2) { r = 235; g = 40; b = 40; } else if (kd === 3) { r = 250; g = 150; b = 30; } else if (kd === 4) { r = 40; g = 200; b = 235; }
    if (Math.abs(py + 0.5 - view.mid) <= view.axisHalf && !kd && (px % 20 === 0)) { r = Math.min(255, r + 40); }
    const q = ((H - 1 - py) * W + (W - 1 - px)) * 4; // muzzle on the right, gun axis horizontal
    img.data[q] = r; img.data[q + 1] = g; img.data[q + 2] = b; img.data[q + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); writeFileSync(path, canvas.toBuffer('image/png'));
}

const report = []; let failures = 0;
for (const id of ids) {
  const started = performance.now();
  await ensureInteriorFills([id]);
  let tank;
  try { tank = createTank(id, null, { proceduralOnly: true }); } catch (error) { console.log(`${id}: build failed: ${error.message}`); failures++; report.push({ id, status: 'build-failed', error: error.message }); continue; }
  const spec = getSpec(id);
  if (SEED_RECOIL_M) { const recoil = tank.root.getObjectByName('rig_recoil'); if (recoil) recoil.position.z += SEED_RECOIL_M; }
  const built = performance.now();
  // A gun fixed in the hull does not pitch against its mount (the whole vehicle aims), so one pose covers it.
  const kind = mouthKind(collectMouths(tank.root));
  const tankPoses = kind === 'hull-fixed' ? ['rest'] : poses;
  const rows = [];
  for (const pose of tankPoses) rows.push(censusPose(tank, spec, pose));
  const censused = performance.now();
  let worst = 0, openings = 0; const lines = [];
  let gated = false;
  for (const r of rows) for (const m of r.results) {
    for (const run of m.runs) {
      const counts = run.class !== 'muzzle-device' && run.class !== 'behind-pivot' && run.sizeMm >= MIN_MM && run.directions >= 2;
      if (counts) { gated = true; worst = Math.max(worst, run.sizeMm); openings++; }
      if (run.sizeMm >= MIN_MM || flag('verbose')) lines.push(`   ${r.pose}(${r.pitchDeg}°) ${m.mouth}: ${run.class} ${run.sizeMm} mm at ${run.behindMouthMm.join('..')} mm behind mouth (${run.forwardOfPivotMm.join('..')} fwd of pivot), ${run.directions}/${AZIMUTHS} dirs [${run.shows.join(',')}] behind=${run.behind} ahead=${run.ahead}`);
    }
    for (const o of m.offAxis) { gated = true; openings++; lines.push(`   ${r.pose}(${r.pitchDeg}°) ${m.mouth}: off-axis opening ${o.px} px from ${o.view} at s ${o.sMm.join('..')} mm, v ${o.vMm.join('..')} mm — ${o.meshes.join('/')}`); }
    if (writeImages) for (const im of m.images) await writeImage(`${outDir}/${id}__${r.pose}__${m.mouth}__${im.name}.png`, im.view);
  }
  const mouthCount = rows[0]?.mainMouths ?? 0;
  // No cannon mouth is a status of its own only for a launcher with fixed canisters; anywhere else it is uncensused.
  const status = mouthCount ? (gated ? 'gap' : 'closed') : spec.gun?.fixedLaunchCanisters === true ? 'launcher' : 'no-mouth';
  if (status === 'gap' || status === 'no-mouth') failures++;
  report.push({ id, status, kind, mainMouths: mouthCount, gap: gated, worstMm: worst, openings, poses: rows.map((r) => ({ pose: r.pose, pitchDeg: r.pitchDeg, mouths: r.results.map(({ images, ...rest }) => rest) })) });
  const verdict = { closed: 'CLOSED', gap: `GAP (worst ${worst} mm)`, launcher: 'launcher (fixed canisters, no cannon mouth)', 'no-mouth': 'NO MAIN-GUN MOUTH' }[status];
  console.log(`${id}: ${verdict} — ${mouthCount} main mouth(s)${kind === 'hull-fixed' ? ' fixed in the hull' : ''}, ${tankPoses.length} poses (build ${((built - started) / 1000).toFixed(1)} s, census ${((censused - built) / 1000).toFixed(1)} s, total ${((performance.now() - started) / 1000).toFixed(1)} s)`);
  for (const l of lines) console.log(l);
  tank.dispose?.();
}
const jsonPath = opt('json', '');
if (jsonPath) { writeFileSync(resolve(jsonPath), JSON.stringify({ generated: new Date().toISOString(), resMm: RES_M * 1000, bandM: BAND_M, azimuths: AZIMUTHS, poses, tanks: report }, null, 1) + '\n'); console.log(`wrote ${jsonPath}`); }
const gapped = report.filter((r) => r.status === 'gap' || r.status === 'no-mouth').map((r) => r.id);
console.log(`gun-junction census: ${report.length} tank(s), ${gapped.length} with gun gaps${gapped.length ? ': ' + gapped.join(', ') : ''}`);

if (LEDGER_PATH) {
  const fleet = JSON.parse(readFileSync(resolve(FLEET_LEDGER_PATH), 'utf8')).tanks;
  const binding = (id, kind) => {
    const groups = fleet[id]?.high?.groups;
    if (!groups) return null;
    return kind === 'hull-fixed' ? { hull: groups.hull, turret: groups.turret, gun: groups.gun } : { turret: groups.turret, gun: groups.gun };
  };
  const rowOf = (r) => {
    const row = { status: r.status, kind: r.kind ?? 'none', mouths: r.mainMouths ?? 0 };
    if (r.status === 'gap') Object.assign(row, { worstMm: r.worstMm, openings: r.openings });
    row.geometry = binding(r.id, r.kind);
    return row;
  };
  const book = ledger ?? { schemaVersion: 1, generator: 'tools/gun-junction-census.mjs --ledger', settings: LEDGER_DEFAULTS, binding: `turret and gun group digests (hull too for a gun fixed in the hull) of ${FLEET_LEDGER_PATH} at high quality`, tanks: {} };
  let problems = 0;
  for (const r of report) {
    const row = rowOf(r);
    if (!row.geometry) { console.log(`${r.id}: no ${FLEET_LEDGER_PATH} row (run node tools/fleet-geometry-ledger.mjs --update --ids=${r.id} first)`); problems++; continue; }
    if (flag('update')) { book.tanks[r.id] = row; continue; }
    const held = book.tanks[r.id];
    if (!held) { console.log(`${r.id}: no gun-junction ledger row`); problems++; continue; }
    const diffs = ['status', 'kind', 'mouths'].filter((k) => held[k] !== row[k]).map((k) => `${k} ${held[k]} -> ${row[k]}`);
    for (const [group, digest] of Object.entries(row.geometry)) if (held.geometry?.[group] !== digest) diffs.push(`${group} geometry moved since the row was measured`);
    if (diffs.length) { console.log(`${r.id}: ledger differs: ${diffs.join('; ')}`); problems++; }
  }
  if (flag('update')) {
    const tanks = Object.fromEntries(Object.keys(book.tanks).sort().map((id) => [id, book.tanks[id]]));
    const head = JSON.stringify({ ...book, tanks: undefined }, null, 1).replace(/\n}$/, '');
    const body = Object.entries(tanks).map(([id, row]) => `  ${JSON.stringify(id)}: ${JSON.stringify(row)}`).join(',\n');
    writeFileSync(resolve(LEDGER_PATH), `${head},\n "tanks": {\n${body}\n }\n}\n`);
    console.log(`gun-junction ledger: wrote ${report.length} row(s) to ${LEDGER_PATH} (${Object.keys(tanks).length} held)`);
  } else console.log(`gun-junction ledger: ${problems ? `FAIL: ${problems} difference(s)` : `PASS: ${report.length} tank(s) match ${LEDGER_PATH}`}`);
  if (problems) process.exit(1);
}
if (flag('gate') && failures) process.exit(1);
