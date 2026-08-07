// ===========================================================================
// HISTORICAL LOADOUT KITS (camo r7, owner ask: "historical camos that come
// with extra attachments like ladders, extra machine guns, moss").
//
// Certain camo patterns carry a PHYSICAL kit: procedural stowage meshes bolted
// onto the finished visual. The kit is a pair of runtime groups — 'camoKitG'
// under rig_hull and 'camoKitTurretG' under rig_turret (so turret pieces ride
// the turret) — added/removed whole on every pattern apply, which keeps camo
// switching instant and leaves the shared bake pipeline untouched (paint
// still comes from materials.js; this module is geometry only).
//
// Anchoring: hull/turret extents are measured ONCE at build time (the visual
// is still unposed at every apply call site, so world == local) and cached on
// the visual (visual._camoKitDims). Re-applies from the garage picker reuse
// the cache, so a posed, scene-added pedestal never gets mis-measured. All
// placements are FRACTIONS of those extents — the same kit lands plausibly on
// a Sherman, a T-90M or a swapped GLB (+z is the bow, -z the engine deck,
// per the factory convention).
// ===========================================================================
import * as THREE from 'three';

// ---- shared materials (one instance each; kits never repaint) -------------
const M = {
  wood: new THREE.MeshStandardMaterial({ color: 0x6b4f33, roughness: 0.92, metalness: 0.05 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x4e3a26, roughness: 0.94, metalness: 0.05 }),
  burlap: new THREE.MeshStandardMaterial({ color: 0x8d7c58, roughness: 0.97, metalness: 0.02 }),
  canvas: new THREE.MeshStandardMaterial({ color: 0x6d6a4f, roughness: 0.95, metalness: 0.03 }),
  gunmetal: new THREE.MeshStandardMaterial({ color: 0x2b2e31, roughness: 0.55, metalness: 0.6 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x555a5e, roughness: 0.6, metalness: 0.55 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x24272a, roughness: 0.95, metalness: 0.1 }),
  jerry: new THREE.MeshStandardMaterial({ color: 0x4b5540, roughness: 0.7, metalness: 0.3 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x3d5a34, roughness: 0.95, metalness: 0, flatShading: true }),
  leaf2: new THREE.MeshStandardMaterial({ color: 0x54703f, roughness: 0.95, metalness: 0, flatShading: true }),
  moss: new THREE.MeshStandardMaterial({ color: 0x5d7040, roughness: 1.0, metalness: 0, flatShading: true }),
};

// deterministic per-(spec, pattern) stream so a kit lands identically on
// rebuilds, thumbnails and battle spawns
function rng32(seed) {
  let a = seed | 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// per-build deterministic stream (set by applyCamoKit before builders run;
// single-threaded, so a module slot is race-free and keeps builder
// signatures free of trailing-rng positional hazards)
let _rnd = Math.random;

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
function mesh(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---- attachment builders (each returns a Group centered on its anchor) ----
function logBundle(len = 1.6, r = 0.09, n = 2) {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(r, r * 0.92, len, 9);
  for (let i = 0; i < n; i++) {
    g.add(mesh(geo, M.wood, 0, i * r * 1.7, 0, 0, 0, Math.PI / 2));
  }
  for (const s of [-0.3, 0.32]) {                    // retaining straps
    g.add(mesh(box(0.05, r * (n * 1.7 + 0.6), 0.02), M.rubber, s * len, r * (n - 1) * 0.85, r + 0.005));
  }
  return g;
}
function ladder(len = 1.7, w = 0.34) {
  const g = new THREE.Group();
  const rail = new THREE.CylinderGeometry(0.025, 0.025, len, 6);
  for (const s of [-1, 1]) g.add(mesh(rail, M.woodDark, (s * w) / 2, 0, 0));
  const rungs = Math.max(3, Math.round(len / 0.3));
  const rung = new THREE.CylinderGeometry(0.018, 0.018, w, 6);
  for (let i = 0; i < rungs; i++) {
    g.add(mesh(rung, M.wood, 0, -len / 2 + ((i + 0.5) * len) / rungs, 0.02, 0, 0, Math.PI / 2));
  }
  return g;
}
function sandbagWall(cols = 4, rows = 2) {
  const rnd = _rnd;
  const g = new THREE.Group();
  const bag = new THREE.CapsuleGeometry(0.085, 0.16, 3, 7);
  for (let r2 = 0; r2 < rows; r2++) {
    const n = cols - (r2 % 2);
    for (let i = 0; i < n; i++) {
      const m = mesh(bag, M.burlap,
        (i - (n - 1) / 2) * 0.3 + (rnd() - 0.5) * 0.03,
        r2 * 0.145, (rnd() - 0.5) * 0.03,
        0, (rnd() - 0.5) * 0.4, Math.PI / 2);
      m.scale.set(1, 1, 0.72);                       // squashed by weight
      g.add(m);
    }
  }
  return g;
}
function jerryGroup(n = 3) {
  const rnd = _rnd;
  const g = new THREE.Group();
  const can = box(0.34, 0.46, 0.16);
  const handle = box(0.2, 0.035, 0.04);
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 0.2;
    const ry = (rnd() - 0.5) * 0.3;
    g.add(mesh(can, M.jerry, x, 0.23, (i % 2) * 0.06 - 0.03, 0, ry, 0));
    g.add(mesh(handle, M.jerry, x, 0.475, (i % 2) * 0.06 - 0.03, 0, ry, 0));
  }
  return g;
}
function trackStrip(len = 1.5) {
  const g = new THREE.Group();
  g.add(mesh(box(len, 0.055, 0.3), M.rubber, 0, 0, 0));
  const links = Math.round(len / 0.17);
  const horn = box(0.05, 0.05, 0.1);
  for (let i = 0; i < links; i++) {
    g.add(mesh(horn, M.steel, -len / 2 + ((i + 0.5) * len) / links, 0.045, 0));
  }
  return g;
}
function spareWheel(r = 0.38, w = 0.22) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(r, r, w, 16), M.rubber));
  g.add(mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.03, 12), M.steel));
  return g;
}
function crate(w = 0.55, h = 0.34, d = 0.42) {
  const g = new THREE.Group();
  g.add(mesh(box(w, h, d), M.wood, 0, h / 2, 0));
  g.add(mesh(box(w + 0.02, 0.04, 0.05), M.woodDark, 0, h * 0.7, d / 2 - 0.02));
  g.add(mesh(box(0.05, h + 0.015, d + 0.02), M.woodDark, -w / 3, h / 2, 0));
  g.add(mesh(box(0.05, h + 0.015, d + 0.02), M.woodDark, w / 3, h / 2, 0));
  return g;
}
function tarpRoll(len = 1.1, r = 0.14) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(r, r, len, 10), M.canvas, 0, r, 0, 0, 0, Math.PI / 2));
  for (const s of [-0.32, 0.3]) {
    g.add(mesh(box(0.05, r * 2.15, 0.03), M.rubber, s * len, r, 0));
  }
  return g;
}
function pintleMG() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.3, 8), M.gunmetal, 0, 0.15, 0)); // pintle post
  g.add(mesh(box(0.09, 0.11, 0.5), M.gunmetal, 0, 0.36, 0.05));                 // receiver
  g.add(mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.62, 8), M.gunmetal,
    0, 0.38, 0.58, Math.PI / 2, 0, 0));                                         // barrel
  g.add(mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.14, 8), M.gunmetal,
    0, 0.38, 0.34, Math.PI / 2, 0, 0));                                         // cooling shroud
  g.add(mesh(box(0.14, 0.16, 0.2), M.jerry, -0.11, 0.34, -0.02));               // ammo box
  for (const s of [-1, 1]) {                                                    // spade grips
    g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 6), M.gunmetal,
      s * 0.05, 0.3, -0.24, 0.5, 0, 0));
  }
  return g;
}
function foliageClump(r = 0.45) {
  const rnd = _rnd;
  const g = new THREE.Group();
  const n = 3 + ((rnd() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const rr = r * (0.45 + rnd() * 0.45);
    const m = mesh(new THREE.IcosahedronGeometry(rr, 0),
      rnd() < 0.5 ? M.leaf : M.leaf2,
      (rnd() - 0.5) * r * 1.3, rr * 0.55, (rnd() - 0.5) * r * 1.1,
      rnd() * 2, rnd() * 2, 0);
    m.scale.y = 0.6 + rnd() * 0.25;                  // wind-flattened
    m.castShadow = false;                            // perf: puffs skip the cascade
    g.add(m);
  }
  return g;
}
function mossPatch(w = 0.6, d = 0.4) {
  const rnd = _rnd;
  const g = new THREE.Group();
  const n = 4 + ((rnd() * 4) | 0);
  for (let i = 0; i < n; i++) {
    const m = mesh(new THREE.IcosahedronGeometry(0.07 + rnd() * 0.09, 0), M.moss,
      (rnd() - 0.5) * w, 0.015, (rnd() - 0.5) * d, rnd(), rnd(), 0);
    m.scale.y = 0.18;                                // moss hugs the plate
    m.castShadow = false;
    g.add(m);
  }
  return g;
}
function plankStack(len = 2.0, n = 3) {
  const g = new THREE.Group();
  const board = box(0.05, 0.26, len);
  for (let i = 0; i < n; i++) {
    g.add(mesh(board, i % 2 ? M.wood : M.woodDark, i * 0.06, 0, (i % 2) * 0.08 - 0.04));
  }
  return g;
}
function bedroll(len = 0.75) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, len, 9), M.canvas, 0, 0.11, 0, 0, 0, Math.PI / 2));
  g.add(mesh(box(0.05, 0.24, 0.03), M.rubber, 0, 0.11, 0));
  return g;
}

const BUILDERS = {
  logBundle, ladder, sandbagWall, jerryGroup, trackStrip, spareWheel,
  crate, tarpRoll, pintleMG, foliageClump, mossPatch, plankStack, bedroll,
};

// ---- per-pattern kit tables ------------------------------------------------
// at: anchor resolved from measured dims. dx/dy/dz are FRACTIONS of the
// matching half-extent (dx of hull half-width, dz of hull half-length; dy is
// ABSOLUTE metres above the anchor plane). ry/rx in radians. tp: true parents
// the piece under rig_turret (it turns with the gun).
const KITS = {
  normandy44: [
    { b: 'pintleMG', tp: true, dx: 0.45, dz: -0.35, ry: 0.35 },
    { b: 'sandbagWall', a: [5, 2], at: 'glacis' },
    { b: 'trackStrip', a: [1.4], at: 'sideL', dy: 0.32 },
    { b: 'jerryGroup', a: [3], at: 'deckRear', dx: 0.45 },
    { b: 'foliageClump', a: [0.42], at: 'deckRear', dx: -0.5, dz: -0.1 },
    { b: 'bedroll', tp: true, dx: -0.4, dz: -0.55, ry: 0.2 },
  ],
  berlin45: [
    { b: 'logBundle', a: [1.9, 0.1, 2], at: 'rearPlate', dy: 0.28 },
    { b: 'ladder', a: [1.5, 0.36], at: 'sideR', rx: 0.3, dy: 0.62 },
    { b: 'trackStrip', a: [1.2], at: 'sideL', dy: 0.3 },
    { b: 'crate', at: 'deckRear', dx: 0.4 },
    { b: 'tarpRoll', a: [1.0], at: 'deckRear', dx: -0.45 },
  ],
  ardennes44: [
    { b: 'sandbagWall', a: [6, 2], at: 'sideL', dy: 0.1 },
    { b: 'sandbagWall', a: [6, 2], at: 'sideR', dy: 0.1 },
    { b: 'tarpRoll', a: [1.2], at: 'deckRear', dx: -0.4 },
    { b: 'jerryGroup', a: [2], at: 'deckRear', dx: 0.5 },
    { b: 'crate', a: [0.5, 0.3, 0.4], tp: true, dx: -0.45, dz: -0.5 },
  ],
  pacific45: [
    { b: 'plankStack', a: [2.2, 3], at: 'sideL', dy: 0.25 },
    { b: 'plankStack', a: [2.2, 3], at: 'sideR', dy: 0.25 },
    { b: 'pintleMG', tp: true, dx: -0.45, dz: -0.35, ry: -0.4 },
    { b: 'foliageClump', a: [0.5], at: 'deckRear', dx: 0.35 },
    { b: 'foliageClump', a: [0.4], tp: true, dx: 0.45, dz: 0.15 },
    { b: 'sandbagWall', a: [4, 1], at: 'deckRear', dx: -0.35 },
  ],
  jungleops: [
    { b: 'foliageClump', a: [0.55], at: 'deckRear', dx: -0.4 },
    { b: 'foliageClump', a: [0.45], at: 'glacis', dx: 0.35 },
    { b: 'foliageClump', a: [0.42], tp: true, dx: -0.5, dz: 0.1 },
    { b: 'foliageClump', a: [0.36], tp: true, dx: 0.5, dz: -0.3 },
    { b: 'pintleMG', tp: true, dx: 0.4, dz: -0.45, ry: 0.5 },
    { b: 'mossPatch', a: [0.8, 0.5], at: 'deckRear', dx: 0.4 },
    { b: 'tarpRoll', a: [0.9], at: 'rearPlate', dy: 0.2 },
  ],
  rasputitsa: [
    { b: 'logBundle', a: [2.2, 0.13, 1], at: 'rearPlate', dy: 0.3 },
    { b: 'spareWheel', at: 'rearPlate', dx: 0.55, dy: 0.55, rx: 0.15 },
    { b: 'trackStrip', a: [1.5], at: 'sideL', dy: 0.3 },
    { b: 'mossPatch', a: [0.9, 0.55], at: 'deckRear', dx: -0.3 },
    { b: 'mossPatch', a: [0.6, 0.4], at: 'glacis', dx: -0.4 },
    { b: 'crate', a: [0.5, 0.32, 0.4], at: 'deckRear', dx: 0.5 },
  ],
};

/** Pattern ids that carry a physical loadout (picker badge + apply gate). */
export const KIT_PATTERN_IDS = Object.keys(KITS);

// ---- anchoring -------------------------------------------------------------
function measureDims(visual, spec) {
  const root = visual.root;
  const hull = root.getObjectByName('rig_hull');
  const turret = root.getObjectByName('rig_turret');
  const b = new THREE.Box3();
  // build-time only: every apply call site runs before the visual is posed /
  // scene-added, so this world box IS the root-local box. Re-applies (garage
  // picker) reuse the cache below and never re-measure a posed tank.
  if (hull) b.setFromObject(hull);
  const hw = Math.max(0.9, (b.max.x - b.min.x) / 2 || 1.4);
  const hl = Math.max(2.0, (b.max.z - b.min.z) / 2 || 3.2);
  const deckY = (spec.armor && spec.armor.turretPivot && spec.armor.turretPivot[1]) ||
    Math.max(1.2, b.max.y * 0.85);
  let tTopY = 0.6, tHw = 0.8;
  if (turret) {
    const tb = new THREE.Box3().setFromObject(turret);
    if (isFinite(tb.max.y)) {
      // turret box is in root space; convert to rig_turret local via pivot
      tTopY = Math.max(0.35, tb.max.y - turret.position.y);
      tHw = Math.max(0.5, Math.min((tb.max.x - tb.min.x) / 2, hw * 0.85));
    }
  }
  return { hw, hl, deckY, tTopY, tHw };
}

function anchorFor(at, d) {
  // returns {x, y, z, rx, ry} base pose in rig_hull space
  switch (at) {
    case 'deckRear': return { x: 0, y: d.deckY + 0.02, z: -d.hl * 0.52 };
    case 'glacis': return { x: 0, y: d.deckY * 0.7, z: d.hl * 0.52, rx: -0.42 };
    case 'sideL': return { x: -(d.hw * 0.98), y: d.deckY * 0.72, z: 0, ry: Math.PI / 2 };
    case 'sideR': return { x: d.hw * 0.98, y: d.deckY * 0.72, z: 0, ry: Math.PI / 2 };
    case 'rearPlate': return { x: 0, y: d.deckY * 0.55, z: -(d.hl * 0.97) };
    default: return { x: 0, y: d.deckY, z: 0 };
  }
}

/**
 * Attach (or remove) the historical loadout for a pattern. Idempotent per
 * pattern; call after every camo apply. Geometry only — paint is untouched.
 * @param {object} visual createTank visual (root with rig_hull/rig_turret)
 * @param {object} spec TankSpec
 * @param {string} patternId RESOLVED pattern id (not 'auto')
 */
export function applyCamoKit(visual, spec, patternId) {
  const root = visual && visual.root;
  if (!root) return;
  const hull = root.getObjectByName('rig_hull');
  const turret = root.getObjectByName('rig_turret');
  for (const holder of [hull, turret, root]) {
    if (!holder) continue;
    for (const name of ['camoKitG', 'camoKitTurretG']) {
      const old = holder.getObjectByName(name);
      if (old && old.parent) old.parent.remove(old);
    }
  }
  const kit = KITS[patternId];
  if (!kit || !hull) return;
  if (!visual._camoKitDims) visual._camoKitDims = measureDims(visual, spec);
  const d = visual._camoKitDims;
  let seed = 0x51de;
  for (const ch of `${spec.id}:${patternId}`) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  _rnd = rng32(seed);

  const hullKit = new THREE.Group();
  hullKit.name = 'camoKitG';
  const turretKit = new THREE.Group();
  turretKit.name = 'camoKitTurretG';
  for (const item of kit) {
    const build = BUILDERS[item.b];
    if (!build) continue;
    const piece = build(...(item.a || []));
    if (item.tp) {
      piece.position.set((item.dx || 0) * d.tHw, d.tTopY + (item.dy || 0), (item.dz || 0) * d.tHw * 1.6);
      piece.rotation.set(item.rx || 0, item.ry || 0, 0);
      turretKit.add(piece);
    } else {
      const a = anchorFor(item.at, d);
      piece.position.set(
        a.x + (item.dx || 0) * d.hw,
        a.y + (item.dy || 0),
        a.z + (item.dz || 0) * d.hl);
      piece.rotation.set((a.rx || 0) + (item.rx || 0), (a.ry || 0) + (item.ry || 0), 0);
      hullKit.add(piece);
    }
  }
  if (hullKit.children.length) hull.add(hullKit);
  if (turretKit.children.length && turret) turret.add(turretKit);
}
