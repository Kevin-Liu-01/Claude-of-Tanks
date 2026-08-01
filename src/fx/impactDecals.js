/**
 * impactDecals.js — procedural ballistic armor-scarring decals.
 *
 * Replaces the old effects.js "armor scar" pool (14 shared near-black
 * MeshBasicMaterial quads re-parented onto struck hull roots — the "plain
 * black rhombus" read, made literal on wrecks when tankFactory's burn sweep
 * swapped the un-hookable Basic material for the opaque shared burnt
 * material). This module bakes a 1024² canvas atlas of mark families and
 * stamps caliber-scaled, tangent-oriented quads into the struck NODE's local
 * space (hull root or rig_turret), batched into at most one mesh per node
 * per vehicle.
 *
 * Mark families (each with rotation/size/tint jitter + baked variants):
 *  - pen    penetration: dark hole, molten rim ring, 4-7 radial spall
 *           streaks + bright metal scratches, soft scorch halo
 *  - crit   module/crew penetration: darker soot, wider halo, deeper rim
 *  - gouge  ricochet: elongated bare-metal scrape aligned to the impact
 *           tangent (shell direction projected onto the plate), bright
 *           silvery brushed streaks with a directional taper and a faint
 *           heat tint at the entry end — NO hole
 *  - scorch HE splash (and ERA pops at reduced size): wide shallow ragged
 *           soot blot, low alpha at the edge, no hole
 *  - scuff  blunt non-penetration: small chipped-paint dish, no hole
 *
 * Placement: prefers the sim's HULL-LOCAL hit data (HitEvent.localPos /
 * localDir — exact inverse of the tankFactory 'YXZ' visual mapping) so the
 * stamp cannot smear when the tank moved between sim tick and render sync.
 * Turret hits are detected against the spec's armor turret-plate envelope
 * (the same geometry the sim traced) and stamped in rig_turret local space,
 * so marks ride turret rotation and the turret pop. Works identically for
 * procedural and GLB visuals (the GLB turret is re-parented into rig_turret
 * at swap time).
 *
 * Lifecycle: per-vehicle ring of IMPACT_DECAL_CAP quads (oldest evicted),
 * persistent for the battle, cleared when the vehicle wrecks (matching the
 * profile decalMeshes hidden by setDestroyed) and on resetAll(). Clearing on
 * destruction is also what keeps the burn sweep from ever re-materializing
 * a decal mesh into an opaque burnt quad.
 *
 * Perf: one shared CanvasTexture atlas + one shared material; ≤ 2 batched
 * meshes (hull/turret) per struck vehicle; CPU cost only at stamp time
 * (4 vertices written). All randomness through the injected seeded rng.
 */
import * as THREE from 'three';
import { mulberry32, makeFbm } from './particles.js';

/** Per-vehicle decal budget (oldest evicted beyond this). */
export const IMPACT_DECAL_CAP = 24;

// --- atlas layout ------------------------------------------------------------
const ATLAS = 1024;
const GRID = 4;
const CELL = ATLAS / GRID; // 256 px
const PAD = 4;             // px inset per cell edge (mip bleed guard)
const FAMILY_CELLS = {
  pen: [0, 1, 2, 3],
  crit: [4, 5],
  scuff: [6, 7],
  gouge: [8, 9, 10, 11],
  scorch: [12, 13, 14],
};

// ---------------------------------------------------------------------------
// Atlas bake (2D canvas, seeded — no external assets)
// ---------------------------------------------------------------------------

/** Begin drawing one cell: clipped + translated to cell space. */
function beginCell(ctx, idx) {
  const ox = (idx % GRID) * CELL;
  const oy = Math.floor(idx / GRID) * CELL;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, CELL, CELL);
  ctx.clip();
  ctx.translate(ox, oy);
  return [ox, oy];
}

/** fbm alpha erosion over one cell so no mark reads as a clean stamp. */
function erodeCell(ctx, fbm, ox, oy, strength, freq = 3.1) {
  const img = ctx.getImageData(ox, oy, CELL, CELL);
  const d = img.data;
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const i = (y * CELL + x) * 4 + 3;
      if (d[i] === 0) continue;
      const n = fbm((x / CELL) * freq, (y / CELL) * freq);
      const m = Math.max(0, Math.min(1, n * 2.0 - 0.35));
      d[i] = d[i] * (1 - strength + strength * m);
    }
  }
  ctx.putImageData(img, ox, oy);
}

/** Radial soot halo — several offset soft gradients so it is never a disc. */
function sootHalo(ctx, rng, cx, cy, radius, alpha) {
  for (let i = 0; i < 3; i++) {
    const ox = (rng() - 0.5) * radius * 0.22;
    const oy = (rng() - 0.5) * radius * 0.22;
    const rr = radius * (0.72 + rng() * 0.34);
    const g = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, rr);
    g.addColorStop(0, `rgba(16,13,11,${(alpha * (0.55 + rng() * 0.2)).toFixed(3)})`);
    g.addColorStop(0.55, `rgba(21,17,14,${(alpha * 0.34).toFixed(3)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CELL, CELL);
  }
}

/** Penetration cell: halo + spall streaks + molten rim + hole + scratches. */
function drawPen(ctx, rng, crit) {
  const c = CELL / 2;
  const R = c;
  sootHalo(ctx, rng, c, c, R * (crit ? 0.95 : 0.80), crit ? 0.75 : 0.60);
  // faint ash ring inside the halo: keeps the scorch readable on very dark
  // camo (soot-on-black otherwise vanishes in shade)
  const ag = ctx.createRadialGradient(c, c, 0, c, c, R * 0.62);
  ag.addColorStop(0.32, 'rgba(0,0,0,0)');
  ag.addColorStop(0.52, 'rgba(142,134,120,0.15)');
  ag.addColorStop(0.78, 'rgba(120,112,100,0.05)');
  ag.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ag;
  ctx.fillRect(0, 0, CELL, CELL);
  // radial spall streaks: 4-7 dark sooty rays flung from the hole
  const nStreak = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < nStreak; i++) {
    const a = rng() * Math.PI * 2;
    const len = R * (0.30 + rng() * 0.36);
    const w = R * (0.030 + rng() * 0.045);
    const r0 = R * 0.17;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    const g = ctx.createLinearGradient(r0, 0, r0 + len, 0);
    g.addColorStop(0, `rgba(12,10,8,${0.55 + rng() * 0.25})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(r0 + len * 0.45, 0, len * 0.62, w, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // heat-tempering annulus outside the rim: oxide browns/violets where the
  // plate cooked — this is what keeps an old hit looking HOT-WORKED rather
  // than lit, and gives the mark body on any camo tone
  const rimR = R * (crit ? 0.225 : 0.20);
  const tg = ctx.createRadialGradient(c, c, 0, c, c, rimR * 2.6);
  tg.addColorStop(0.3, 'rgba(0,0,0,0)');
  tg.addColorStop(0.52, 'rgba(96,62,50,0.34)');
  tg.addColorStop(0.74, 'rgba(74,56,64,0.22)');
  tg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = tg;
  ctx.fillRect(0, 0, CELL, CELL);
  // molten rim: hot ring hugging the hole, cooling outward. Crit runs a
  // touch deeper into red (over-match heat).
  const g2 = ctx.createRadialGradient(c, c, 0, c, c, rimR * 1.9);
  g2.addColorStop(0.0, 'rgba(0,0,0,0)');
  g2.addColorStop(0.50, `rgba(255,224,170,${crit ? 0.9 : 0.85})`);
  g2.addColorStop(0.66, crit ? 'rgba(250,120,48,0.66)' : 'rgba(250,146,62,0.6)');
  g2.addColorStop(0.85, 'rgba(160,62,26,0.26)');
  g2.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, CELL, CELL);
  // molten beads spattered on the rim
  const nBead = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < nBead; i++) {
    const a = rng() * Math.PI * 2;
    const d = rimR * (0.9 + rng() * 0.5);
    const r = 1.4 + rng() * 2.2;
    const bg = ctx.createRadialGradient(c + Math.cos(a) * d, c + Math.sin(a) * d, 0,
      c + Math.cos(a) * d, c + Math.sin(a) * d, r * 2);
    bg.addColorStop(0, 'rgba(255,214,150,0.85)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CELL, CELL);
  }
  // the hole itself: near-black core with a hard shoulder — sized so the
  // dark void reads as strongly as the rim (a hit mark, not a glowing ring)
  const holeR = R * (crit ? 0.155 : 0.14);
  const g3 = ctx.createRadialGradient(c, c, 0, c, c, holeR * 1.2);
  g3.addColorStop(0, 'rgba(3,2,2,0.985)');
  g3.addColorStop(0.78, 'rgba(6,5,4,0.97)');
  g3.addColorStop(1, 'rgba(10,8,6,0)');
  ctx.fillStyle = g3;
  ctx.fillRect(0, 0, CELL, CELL);
  // bright bare-metal scratches whipped outward by spall
  const nBright = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < nBright; i++) {
    const a = rng() * Math.PI * 2;
    const len = R * (0.18 + rng() * 0.22);
    const r0 = rimR * (1.0 + rng() * 0.4);
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    const g4 = ctx.createLinearGradient(r0, 0, r0 + len, 0);
    g4.addColorStop(0, `rgba(214,220,228,${0.5 + rng() * 0.3})`);
    g4.addColorStop(1, 'rgba(214,220,228,0)');
    ctx.fillStyle = g4;
    ctx.fillRect(r0, -(0.6 + rng() * 0.9), len, 1.2 + rng() * 1.8);
    ctx.restore();
  }
}

/**
 * Ricochet gouge cell — drawn horizontal: entry (heat tint) at the LEFT
 * edge, brushed bare-metal streaks tapering out toward the right.
 */
function drawGouge(ctx, rng) {
  const cy = CELL / 2 + (rng() - 0.5) * 10;
  const x0 = CELL * 0.08;
  // brushed-metal body: many thin horizontal sub-streaks
  const nS = 16 + Math.floor(rng() * 6);
  for (let i = 0; i < nS; i++) {
    const yy = cy + (rng() - 0.5) * CELL * 0.17;
    const sx = x0 + rng() * CELL * 0.20;
    const len = CELL * (0.30 + rng() * 0.52);
    const w = 1 + rng() * 2.6;
    const b = 150 + rng() * 92;
    const a0 = 0.28 + rng() * 0.45;
    const g = ctx.createLinearGradient(sx, 0, sx + len, 0);
    g.addColorStop(0, `rgba(${(b * 0.92) | 0},${(b * 0.95) | 0},${b | 0},0)`);
    g.addColorStop(0.22, `rgba(${(b * 0.92) | 0},${(b * 0.95) | 0},${b | 0},${a0})`);
    g.addColorStop(1, `rgba(${(b * 0.92) | 0},${(b * 0.95) | 0},${b | 0},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(sx, yy - w / 2, len, w);
  }
  // hottest core scrape near the entry half
  for (let i = 0; i < 3; i++) {
    const yy = cy + (rng() - 0.5) * CELL * 0.05;
    const sx = CELL * (0.14 + rng() * 0.08);
    const len = CELL * (0.26 + rng() * 0.2);
    const g = ctx.createLinearGradient(sx, 0, sx + len, 0);
    g.addColorStop(0, 'rgba(232,238,246,0)');
    g.addColorStop(0.3, `rgba(232,238,246,${0.55 + rng() * 0.3})`);
    g.addColorStop(1, 'rgba(232,238,246,0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx, yy - 1.1, len, 2.2);
  }
  // dark displaced-paint burrs above/below the scrape
  for (const s of [-1, 1]) {
    const yy = cy + s * CELL * (0.085 + rng() * 0.03);
    const sx = x0 + rng() * CELL * 0.1;
    const len = CELL * (0.4 + rng() * 0.3);
    const g = ctx.createLinearGradient(sx, 0, sx + len, 0);
    g.addColorStop(0, 'rgba(24,21,18,0)');
    g.addColorStop(0.3, `rgba(24,21,18,${0.3 + rng() * 0.2})`);
    g.addColorStop(1, 'rgba(24,21,18,0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx, yy - 2, len, 4);
  }
  // faint heat tint at the entry end (friction flash where the shell bit)
  const hg = ctx.createRadialGradient(CELL * 0.20, cy, 0, CELL * 0.20, cy, CELL * 0.17);
  hg.addColorStop(0, 'rgba(255,172,92,0.34)');
  hg.addColorStop(1, 'rgba(255,140,70,0)');
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, CELL, CELL);
  // envelope: elongated ellipse biased toward the entry — kills the tail and
  // the top/bottom fringe in one pass (the directional taper)
  ctx.globalCompositeOperation = 'destination-in';
  ctx.save();
  ctx.translate(CELL * 0.40, cy);
  ctx.scale(2.7, 1);
  const eg = ctx.createRadialGradient(0, 0, 0, 0, 0, CELL * 0.235);
  eg.addColorStop(0, 'rgba(255,255,255,1)');
  eg.addColorStop(0.62, 'rgba(255,255,255,0.92)');
  eg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = eg;
  ctx.fillRect(-CELL, -CELL, CELL * 2.5, CELL * 2);
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
}

/** HE splash cell: wide shallow ragged soot blot — no hole, feathered edge. */
function drawScorch(ctx, rng) {
  const c = CELL / 2;
  const R = c;
  const nBlot = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < nBlot; i++) {
    const a = rng() * Math.PI * 2;
    const d = rng() * R * 0.34;
    const bx = c + Math.cos(a) * d;
    const by = c + Math.sin(a) * d;
    const rr = R * (0.30 + rng() * 0.34);
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, rr);
    g.addColorStop(0, `rgba(14,11,9,${0.38 + rng() * 0.2})`);
    g.addColorStop(0.6, `rgba(18,14,11,${0.2 + rng() * 0.12})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CELL, CELL);
  }
  // radial soot lashes — blast products streaked outward
  for (let i = 0; i < 10; i++) {
    const a = rng() * Math.PI * 2;
    const len = R * (0.38 + rng() * 0.5);
    const w = R * (0.02 + rng() * 0.05);
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    const g = ctx.createLinearGradient(R * 0.1, 0, R * 0.1 + len, 0);
    g.addColorStop(0, `rgba(13,10,8,${0.24 + rng() * 0.16})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(R * 0.1 + len * 0.5, 0, len * 0.62, w, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Blunt non-pen scuff: chipped-paint dish with a bare-metal ring. */
function drawScuff(ctx, rng) {
  const c = CELL / 2;
  const R = c;
  // shallow dark smudge where the shell slammed
  const g0 = ctx.createRadialGradient(c, c, 0, c, c, R * 0.34);
  g0.addColorStop(0, 'rgba(26,22,19,0.4)');
  g0.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g0;
  ctx.fillRect(0, 0, CELL, CELL);
  // chipped ring: broken arcs of exposed metal
  const ringR = R * (0.30 + rng() * 0.05);
  const nArc = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < nArc; i++) {
    const a0 = rng() * Math.PI * 2;
    const span = 0.4 + rng() * 0.9;
    ctx.strokeStyle = `rgba(168,173,180,${0.35 + rng() * 0.3})`;
    ctx.lineWidth = 2 + rng() * 4;
    ctx.beginPath();
    ctx.arc(c, c, ringR * (0.9 + rng() * 0.25), a0, a0 + span);
    ctx.stroke();
  }
  // paint-chip scratches flung off the ring
  for (let i = 0; i < 4; i++) {
    const a = rng() * Math.PI * 2;
    const r0 = ringR * (0.9 + rng() * 0.3);
    const len = R * (0.1 + rng() * 0.16);
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    const g = ctx.createLinearGradient(r0, 0, r0 + len, 0);
    g.addColorStop(0, `rgba(180,184,190,${0.4 + rng() * 0.3})`);
    g.addColorStop(1, 'rgba(180,184,190,0)');
    ctx.fillStyle = g;
    ctx.fillRect(r0, -0.9, len, 1.8);
    ctx.restore();
  }
}

/** Bake the full atlas. @returns {THREE.CanvasTexture} */
function bakeAtlas(rng, anisotropy) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = ATLAS;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, ATLAS, ATLAS);
  const fbm = makeFbm(rng);
  const bake = (idx, draw, erode, freq) => {
    const [ox, oy] = beginCell(ctx, idx);
    draw();
    ctx.restore();
    erodeCell(ctx, fbm, ox, oy, erode, freq);
  };
  for (const i of FAMILY_CELLS.pen) bake(i, () => drawPen(ctx, rng, false), 0.30, 3.4);
  for (const i of FAMILY_CELLS.crit) bake(i, () => drawPen(ctx, rng, true), 0.30, 3.4);
  for (const i of FAMILY_CELLS.scuff) bake(i, () => drawScuff(ctx, rng), 0.34, 4.0);
  for (const i of FAMILY_CELLS.gouge) bake(i, () => drawGouge(ctx, rng), 0.26, 5.2);
  for (const i of FAMILY_CELLS.scorch) bake(i, () => drawScorch(ctx, rng), 0.62, 2.6);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = Math.max(1, anisotropy | 0);
  return tex;
}

// ---------------------------------------------------------------------------
// Runtime: batched per-vehicle stamping
// ---------------------------------------------------------------------------

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _d = new THREE.Vector3();
const _t = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c0 = new THREE.Vector3();
// dedicated register for the turret-frame test: stampLocal's pos/normal/dir
// arguments ARE the shared _p/_n/_d scratch (stampFromEvent fills them), so
// the pivot-shift below must never run through those same registers — doing
// so dragged every HULL stamp down by the turret pivot height.
const _pt = new THREE.Vector3();
// skin-clamp scratch (see clampToSkin)
const _raycaster = new THREE.Raycaster();
const _wp = new THREE.Vector3();
const _wn = new THREE.Vector3();
const _wq = new THREE.Quaternion();
const _wqi = new THREE.Quaternion();
const _hitN = new THREE.Vector3();
const _nm3 = new THREE.Matrix3();

/**
 * Clamp a node-local stamp point onto the vehicle's VISIBLE skin.
 *
 * The armor model's plate point (HitEvent.localPos) often sits INSIDE the
 * rendered hull — side skirts, spaced armor and GLB shells all stand proud
 * of the sim plates — which buried the mark behind the skin. Cast from
 * outside the hull back along the surface normal against the struck node's
 * meshes and adopt the first visible skin point (and its face normal, when
 * it roughly agrees) so the decal always sits ON what the player sees.
 * Mutates pos/normal in place; keeps them untouched when nothing is hit.
 * @returns {boolean} true when a skin point was adopted
 */
function clampToSkin(node, pos, normal) {
  // ancestors AND descendants: a stamp can land before the next visual sync
  // renders (headless probes, same-tick kills), leaving child mesh world
  // matrices stale — the ray would test yesterday's pose and miss
  node.updateWorldMatrix(true, true);
  _wp.copy(pos);
  node.localToWorld(_wp);
  node.getWorldQuaternion(_wq);
  _wn.copy(normal).applyQuaternion(_wq).normalize();
  _raycaster.ray.origin.copy(_wp).addScaledVector(_wn, 1.6);
  _raycaster.ray.direction.copy(_wn).negate();
  _raycaster.near = 0;
  _raycaster.far = 2.3; // reach up to ~0.7 m behind the reported plate
  const hits = _raycaster.intersectObject(node, true);
  for (const h of hits) {
    const o = h.object;
    // visible opaque skin only: never our own decals, never the hidden
    // placeholder hull under a GLB swap, never colorWrite-false shadow
    // proxies, never glass/soot overlay cards, never ERA brick instances
    if (!o.visible || o.name === 'fx_impactDecals' || o.isInstancedMesh) continue;
    let vis = true;
    for (let par = o.parent; par && par !== node; par = par.parent) {
      if (!par.visible) { vis = false; break; }
    }
    if (!vis) continue;
    const mm = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!mm || mm.colorWrite === false || mm.transparent === true) continue;
    node.worldToLocal(pos.copy(h.point));
    if (h.face && h.face.normal) {
      _nm3.getNormalMatrix(o.matrixWorld);
      _hitN.copy(h.face.normal).applyMatrix3(_nm3).normalize();
      _wqi.copy(_wq).invert();
      _hitN.applyQuaternion(_wqi); // world -> node-local
      // adopt the skin's facing only when it broadly agrees with the plate
      // normal (never re-aim a side mark onto a perpendicular greeble face)
      if (_hitN.dot(normal) > 0.45) normal.copy(_hitN).normalize();
    }
    return true;
  }
  return false;
}

/** UV rect for an atlas cell (respects CanvasTexture flipY). */
function cellUV(idx) {
  const col = idx % GRID;
  const row = Math.floor(idx / GRID);
  return {
    u0: (col * CELL + PAD) / ATLAS,
    u1: ((col + 1) * CELL - PAD) / ATLAS,
    // canvas y-down vs texture v-up
    v0: 1 - ((row + 1) * CELL - PAD) / ATLAS,
    v1: 1 - (row * CELL + PAD) / ATLAS,
  };
}

/**
 * @param {{ anisotropy?: number, seed?: number }} [opts]
 */
export function createImpactDecals({ anisotropy = 4, seed = 0x51f7a3 } = {}) {
  const rng = mulberry32(seed >>> 0);
  const atlas = bakeAtlas(mulberry32((seed ^ 0x9d2c5681) >>> 0), anisotropy);
  const material = new THREE.MeshBasicMaterial({
    map: atlas,
    transparent: true,
    vertexColors: true, // itemSize-4 color attr: per-stamp tint + alpha
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });

  /** Pooled batched node-mesh: capacity IMPACT_DECAL_CAP quads. */
  function makeNodeMesh() {
    const geo = new THREE.BufferGeometry();
    const pos = new THREE.Float32BufferAttribute(new Float32Array(IMPACT_DECAL_CAP * 12), 3);
    const uv = new THREE.Float32BufferAttribute(new Float32Array(IMPACT_DECAL_CAP * 8), 2);
    const col = new THREE.Float32BufferAttribute(new Float32Array(IMPACT_DECAL_CAP * 16), 4);
    pos.setUsage(THREE.DynamicDrawUsage);
    uv.setUsage(THREE.DynamicDrawUsage);
    col.setUsage(THREE.DynamicDrawUsage);
    const idx = [];
    for (let i = 0; i < IMPACT_DECAL_CAP; i++) {
      const v = i * 4;
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    }
    geo.setAttribute('position', pos);
    geo.setAttribute('uv', uv);
    geo.setAttribute('color', col);
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = 'fx_impactDecals';
    mesh.renderOrder = 3;
    mesh.castShadow = mesh.receiveShadow = false;
    mesh.frustumCulled = false; // rides its parent node; quads are hull-sized
    return { mesh, geo, pos, uv, col, used: 0, free: [] };
  }
  const meshPool = [];
  function obtainNodeMesh() {
    const nm = meshPool.pop() || makeNodeMesh();
    nm.mesh.material = material; // defensive: undo any historical burnt swap
    nm.used = 0;
    nm.free.length = 0;
    nm.pos.array.fill(0);
    nm.pos.needsUpdate = true;
    return nm;
  }
  function releaseNodeMesh(nm) {
    if (nm.mesh.parent) nm.mesh.parent.remove(nm.mesh);
    if (meshPool.length < 24) meshPool.push(nm);
    else nm.geo.dispose();
  }

  /**
   * Per-vehicle record.
   * ring[i] = { nodeKey: 'hull'|'turret', slot } in stamp order.
   */
  const records = new Map(); // key -> rec
  const legacyKeys = new WeakMap(); // visual -> synthetic key
  let legacySeq = 0;
  const turretEnvBySpec = new Map(); // specId -> {min:[3],max:[3]}|null

  function recFor(key, visual) {
    let rec = records.get(key);
    if (rec && rec.visual !== visual) { clearRecord(rec); rec = null; }
    if (!rec) {
      // hard ceiling on tracked vehicles: evict the least-recently stamped
      if (records.size >= 20) {
        let oldK = null;
        let oldT = Infinity;
        for (const [k, r] of records) if (r.lastStampT < oldT) { oldT = r.lastStampT; oldK = k; }
        if (oldK !== null) clearRecord(records.get(oldK));
      }
      rec = {
        key, visual,
        hull: null, turret: null,
        turretNode: null,
        ring: new Array(IMPACT_DECAL_CAP),
        head: 0, count: 0,
        lastStampT: 0,
      };
      records.set(key, rec);
    }
    return rec;
  }

  function clearRecord(rec) {
    if (rec.hull) releaseNodeMesh(rec.hull);
    if (rec.turret) releaseNodeMesh(rec.turret);
    records.delete(rec.key);
  }

  /** Armor-model turret envelope (turret-local AABB over turretPlates). */
  function turretEnvelope(spec) {
    if (!spec || !spec.armor) return null;
    let env = turretEnvBySpec.get(spec.id);
    if (env !== undefined) return env;
    env = null;
    const plates = spec.armor.turretPlates;
    if (plates && plates.length) {
      const mn = [Infinity, Infinity, Infinity];
      const mx = [-Infinity, -Infinity, -Infinity];
      for (const p of plates) {
        if (!Array.isArray(p.verts)) continue;
        for (const v of p.verts) {
          for (let a = 0; a < 3; a++) {
            if (v[a] < mn[a]) mn[a] = v[a];
            if (v[a] > mx[a]) mx[a] = v[a];
          }
        }
      }
      if (mn[0] < mx[0]) env = { mn, mx };
    }
    turretEnvBySpec.set(spec.id, env);
    return env;
  }

  const MARGIN = 0.22; // m of tolerance around the turret envelope

  /** Map HitEvent.kind (+crit flags) to a mark family, or null to skip. */
  function classify(ev) {
    const kind = ev.kind;
    if (kind === 'pen' || kind === 'he_pen') {
      const crit = (ev.modulesHit && ev.modulesHit.length > 0) ||
        (ev.crewHit && ev.crewHit.length > 0) || ev.ammoRacked || ev.fireStarted;
      return { fam: crit ? 'crit' : 'pen', sizeK: kind === 'he_pen' ? 1.3 : 1 };
    }
    if (kind === 'ricochet') return { fam: 'gouge', sizeK: 1 };
    if (kind === 'nonpen') return { fam: 'scuff', sizeK: 1 };
    if (kind === 'era') return { fam: 'scorch', sizeK: 0.55 };
    if (kind === 'he_splash') {
      // only a real armor contact point scorches the plate — pure blast
      // overpressure (no zone/localPos from the nearest-plate trace) skips
      return (ev.zone && ev.localPos) ? { fam: 'scorch', sizeK: 1 } : null;
    }
    return null;
  }

  /** Full quad side sizes (m) per family, caliber-scaled + jittered. */
  function sizeFor(fam, caliberMm, sizeK) {
    const calK = THREE.MathUtils.clamp((caliberMm || 90) / 100, 0.5, 1.7);
    switch (fam) {
      case 'crit': return { w: 0.40 * calK * (0.85 + rng() * 0.35) * sizeK, h: 0 };
      case 'pen': return { w: 0.34 * calK * (0.85 + rng() * 0.35) * sizeK, h: 0 };
      case 'gouge': {
        const L = 0.74 * calK * (0.85 + rng() * 0.45) * sizeK;
        return { w: L, h: L * (0.30 + rng() * 0.10) };
      }
      case 'scorch': return { w: 0.95 * calK * (0.75 + rng() * 0.5) * sizeK, h: 0 };
      case 'scuff': return { w: 0.26 * calK * (0.8 + rng() * 0.4) * sizeK, h: 0 };
      default: return { w: 0.3 * calK, h: 0 };
    }
  }

  /** Per-family tint (grime jitter) + alpha. */
  function shadeFor(fam) {
    const j = 0.9 + rng() * 0.1;
    switch (fam) {
      case 'crit': return { r: 0.82 * j, g: 0.82 * j, b: 0.82 * j, a: 1 };
      case 'pen': return { r: j, g: j, b: j, a: 1 };
      case 'gouge': return { r: j, g: j, b: j, a: 0.95 };
      case 'scorch': return { r: 0.95 * j, g: 0.95 * j, b: 0.95 * j, a: 0.82 + rng() * 0.13 };
      case 'scuff': return { r: j, g: j, b: j, a: 0.82 };
      default: return { r: 1, g: 1, b: 1, a: 1 };
    }
  }

  /** Write one quad into a node mesh slot (node-local corner positions). */
  function writeQuad(nm, slot, center, t, b, w2, h2, cell, shade) {
    const pa = nm.pos.array;
    const ua = nm.uv.array;
    const ca = nm.col.array;
    const uv = cellUV(cell);
    const flip = rng() < 0.5; // extra variety on the non-directional axis
    const vA = flip ? uv.v1 : uv.v0;
    const vB = flip ? uv.v0 : uv.v1;
    let o = slot * 12;
    // corners: (-t,-b) (+t,-b) (+t,+b) (-t,+b) — CCW facing +normal
    pa[o++] = center.x - t.x * w2 - b.x * h2; pa[o++] = center.y - t.y * w2 - b.y * h2; pa[o++] = center.z - t.z * w2 - b.z * h2;
    pa[o++] = center.x + t.x * w2 - b.x * h2; pa[o++] = center.y + t.y * w2 - b.y * h2; pa[o++] = center.z + t.z * w2 - b.z * h2;
    pa[o++] = center.x + t.x * w2 + b.x * h2; pa[o++] = center.y + t.y * w2 + b.y * h2; pa[o++] = center.z + t.z * w2 + b.z * h2;
    pa[o++] = center.x - t.x * w2 + b.x * h2; pa[o++] = center.y - t.y * w2 + b.y * h2; pa[o++] = center.z - t.z * w2 + b.z * h2;
    let u = slot * 8;
    ua[u++] = uv.u0; ua[u++] = vA;
    ua[u++] = uv.u1; ua[u++] = vA;
    ua[u++] = uv.u1; ua[u++] = vB;
    ua[u++] = uv.u0; ua[u++] = vB;
    let c = slot * 16;
    for (let i = 0; i < 4; i++) {
      ca[c++] = shade.r; ca[c++] = shade.g; ca[c++] = shade.b; ca[c++] = shade.a;
    }
    nm.pos.needsUpdate = true;
    nm.uv.needsUpdate = true;
    nm.col.needsUpdate = true;
  }

  function zeroQuad(nm, slot) {
    nm.pos.array.fill(0, slot * 12, slot * 12 + 12);
    nm.col.array.fill(0, slot * 16, slot * 16 + 16);
    nm.pos.needsUpdate = true;
    nm.col.needsUpdate = true;
  }

  /** Allocate a quad slot in the vehicle ring (evicting the oldest). */
  function allocEntry(rec, nodeKey, node) {
    let nm = rec[nodeKey];
    if (!nm) {
      nm = obtainNodeMesh();
      rec[nodeKey] = nm;
      node.add(nm.mesh);
    } else if (nm.mesh.parent !== node) {
      if (nm.mesh.parent) nm.mesh.parent.remove(nm.mesh);
      node.add(nm.mesh);
    }
    if (rec.count >= IMPACT_DECAL_CAP) {
      // evict oldest
      const old = rec.ring[rec.head];
      rec.head = (rec.head + 1) % IMPACT_DECAL_CAP;
      rec.count--;
      const oldNm = rec[old.nodeKey];
      if (oldNm) {
        zeroQuad(oldNm, old.slot);
        oldNm.free.push(old.slot);
      }
    }
    const slot = nm.free.length ? nm.free.pop() : nm.used++;
    const at = (rec.head + rec.count) % IMPACT_DECAL_CAP;
    rec.ring[at] = { nodeKey, slot };
    rec.count++;
    return { nm, slot };
  }

  /**
   * Core stamp in HULL-LOCAL space. pos/normal/dir are hull-local (dir may
   * be null); turretYaw/turretPivot/env route turret hits into rig_turret.
   */
  function stampLocal(key, visual, fam, sizeK, caliberMm, pos, normal, dir,
    turretYaw, turretPivot, env) {
    const rec = recFor(key, visual);
    rec.lastStampT = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    // --- node routing: armor-model turret envelope test (turret frame) ------
    let nodeKey = 'hull';
    let node = visual.root;
    if (env && turretPivot) {
      _pt.copy(pos);
      _pt.x -= turretPivot[0]; _pt.y -= turretPivot[1]; _pt.z -= turretPivot[2];
      const cy = Math.cos(-turretYaw || 0);
      const sy = Math.sin(-turretYaw || 0);
      const tx = _pt.x * cy + _pt.z * sy;
      const tz = -_pt.x * sy + _pt.z * cy;
      if (tx > env.mn[0] - MARGIN && tx < env.mx[0] + MARGIN &&
          _pt.y > env.mn[1] - MARGIN && _pt.y < env.mx[1] + MARGIN &&
          tz > env.mn[2] - MARGIN && tz < env.mx[2] + MARGIN) {
        const tn = rec.turretNode ||
          (rec.turretNode = visual.root.getObjectByName('rig_turret'));
        if (tn) {
          nodeKey = 'turret';
          node = tn;
          // rotate the whole stamp frame into turret space
          pos.set(tx, _pt.y, tz);
          rot2D(normal, cy, sy);
          if (dir) rot2D(dir, cy, sy);
        }
      }
    }
    // --- clamp onto the rendered skin (skirts/GLB shells stand proud of the
    // armor-model plates; an unclamped mark buries behind them) --------------
    clampToSkin(node, pos, normal);
    // --- tangent frame -------------------------------------------------------
    _n.copy(normal).normalize();
    if (_n.lengthSq() < 0.5) _n.set(0, 1, 0);
    let aligned = false;
    if (fam === 'gouge' && dir) {
      _t.copy(dir).addScaledVector(_n, -dir.dot(_n));
      if (_t.lengthSq() > 0.02) { _t.normalize(); aligned = true; }
    }
    if (!aligned) {
      // random rotation about the normal so repeat hits never tile
      _t.set(0.31, 0.65, 0.69).cross(_n);
      if (_t.lengthSq() < 1e-4) _t.set(1, 0, 0).cross(_n);
      _t.normalize();
      const a = rng() * Math.PI * 2;
      _b.crossVectors(_n, _t);
      _t.multiplyScalar(Math.cos(a)).addScaledVector(_b, Math.sin(a)).normalize();
    }
    _b.crossVectors(_n, _t).normalize();
    const { w, h } = sizeFor(fam, caliberMm, sizeK);
    const w2 = w / 2;
    const h2 = (h || w) / 2;
    const lift = 0.03 + rng() * 0.014;
    _c0.copy(pos).addScaledVector(_n, lift);
    const cells = FAMILY_CELLS[fam] || FAMILY_CELLS.pen;
    const cell = cells[(rng() * cells.length) | 0];
    const { nm, slot } = allocEntry(rec, nodeKey, node);
    writeQuad(nm, slot, _c0, _t, _b, w2, h2, cell, shadeFor(fam));
    return true;
  }

  /** In-place rotate a vector by yaw angle (cos/sin given) about +Y. */
  function rot2D(v, cy, sy) {
    const x = v.x * cy + v.z * sy;
    const z = -v.x * sy + v.z * cy;
    v.x = x; v.z = z;
  }

  const api = {
    material, // exposed for tests/perf probes

    /**
     * Stamp from a resolved HitEvent + game entity ({state, spec, visual}).
     * Uses the sim's hull-local hit data; returns false when skipped.
     */
    stampFromEvent(ev, ent) {
      if (!ev || !ent || !ent.visual || !ent.visual.root) return false;
      const visual = ent.visual;
      if (visual.isDestroyed && visual.isDestroyed()) return false;
      if (ev.zone === 'gun_barrel') return false; // no quad fits the tube
      const cls = classify(ev);
      if (!cls) return false;
      const st = ent.state;
      // hull-local position: prefer the sim's exact localPos
      if (ev.localPos) {
        _p.set(ev.localPos[0], ev.localPos[1], ev.localPos[2]);
      } else if (ev.pos && st && st.pos) {
        _e.set(-(st.visualPitch || 0), st.yaw || 0, st.visualRoll || 0, 'YXZ');
        _q.setFromEuler(_e).invert();
        _p.set(ev.pos[0], ev.pos[1], ev.pos[2]).sub(st.pos).applyQuaternion(_q);
      } else return false;
      // world normal -> hull-local
      _e.set(-(st.visualPitch || 0), st.yaw || 0, st.visualRoll || 0, 'YXZ');
      _q.setFromEuler(_e).invert();
      _n.set(ev.normal ? ev.normal[0] : 0, ev.normal ? ev.normal[1] : 1,
        ev.normal ? ev.normal[2] : 0).applyQuaternion(_q);
      const dir = ev.localDir ? _d.set(ev.localDir[0], ev.localDir[1], ev.localDir[2]) : null;
      return stampLocal(String(ev.targetId), visual, cls.fam, cls.sizeK,
        ev.caliberMm, _p, _n, dir, st.turretYaw || 0,
        ent.spec && ent.spec.armor ? ent.spec.armor.turretPivot : null,
        turretEnvelope(ent.spec));
    },

    /**
     * Legacy/direct stamp (world-space args, no entity — the old armorScar
     * contract). Hull-frame only; kind optional.
     */
    stampDirect(visual, worldPos, worldNormal, caliberMm, kind = 'pen') {
      if (!visual || !visual.root) return false;
      if (visual.isDestroyed && visual.isDestroyed()) return false;
      const cls = classify({ kind, zone: 'x', localPos: [0, 0, 0] }) || { fam: 'pen', sizeK: 1 };
      let key = legacyKeys.get(visual);
      if (!key) { key = `v${legacySeq++}`; legacyKeys.set(visual, key); }
      visual.root.updateMatrixWorld(true);
      _p.copy(worldPos);
      visual.root.worldToLocal(_p);
      visual.root.getWorldQuaternion(_q).invert();
      _n.copy(worldNormal).applyQuaternion(_q);
      return stampLocal(key, visual, cls.fam, cls.sizeK, caliberMm, _p, _n,
        null, 0, null, null);
    },

    /** Remove all decals for a vehicle (by targetId key or visual). */
    clearVehicle(keyOrVisual) {
      if (keyOrVisual == null) return;
      const rec = records.get(String(keyOrVisual));
      if (rec) { clearRecord(rec); return; }
      for (const r of [...records.values()]) {
        if (r.visual === keyOrVisual) clearRecord(r);
      }
    },

    /** Battle reset: detach every decal mesh and drop all records. */
    clearAll() {
      for (const rec of [...records.values()]) clearRecord(rec);
    },

    /** Drop decals whose vehicle has wrecked (defensive sweep). */
    sweep() {
      for (const rec of [...records.values()]) {
        const v = rec.visual;
        if (!v || !v.root || !v.root.parent ||
            (v.isDestroyed && v.isDestroyed())) clearRecord(rec);
      }
    },

    /** @returns {{vehicles:number,decals:number,meshes:number,pooled:number}} */
    stats() {
      let decals = 0;
      let meshes = 0;
      for (const rec of records.values()) {
        decals += rec.count;
        if (rec.hull) meshes++;
        if (rec.turret) meshes++;
      }
      return { vehicles: records.size, decals, meshes, pooled: meshPool.length };
    },
  };
  return api;
}
