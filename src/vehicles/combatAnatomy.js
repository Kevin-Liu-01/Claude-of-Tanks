// Fleet-wide combat-anatomy finalizer. It reconciles authored armor/module/
// crew coordinates with measured first-party geometry receipts, then adds
// only the extra internal systems that have real simulation behavior.
// Pure array math: no DOM, WebGL or Three dependency.

import { MODULE_IDS } from '../sim/moduleCatalog.js';
import { COMBAT_ANATOMY_CALIBRATIONS } from './combatAnatomyCalibrations.js';

const FINALIZED = Symbol.for('claude-of-tanks.combat-anatomy.v1');
const MISSILE_RELOAD_FLOOR_S = 8;

function copyBox(box, module) {
  return {
    module,
    min: box.min.slice(),
    max: box.max.slice(),
    turretLocal: !!box.turretLocal,
  };
}

function shrinkBox(box, module, scale, offset = [0, 0, 0]) {
  const out = copyBox(box, module);
  for (let axis = 0; axis < 3; axis++) {
    const center = (box.min[axis] + box.max[axis]) / 2 + offset[axis];
    const half = Math.max(0.035, (box.max[axis] - box.min[axis]) * scale[axis] / 2);
    out.min[axis] = center - half;
    out.max[axis] = center + half;
  }
  return out;
}

function plateBounds(plates) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const plate of plates || []) {
    if (plate.kind === 'external') continue;
    for (const point of plate.verts || []) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : null;
}

function mapPoint(point, from, to) {
  for (let axis = 0; axis < 3; axis++) {
    const span = from.max[axis] - from.min[axis];
    if (!(span > 1e-5)) continue;
    const t = (point[axis] - from.min[axis]) / span;
    point[axis] = to.min[axis] + t * (to.max[axis] - to.min[axis]);
  }
}

function mapBox(box, from, to) {
  mapPoint(box.min, from, to);
  mapPoint(box.max, from, to);
  for (let axis = 0; axis < 3; axis++) {
    if (box.min[axis] > box.max[axis]) [box.min[axis], box.max[axis]] = [box.max[axis], box.min[axis]];
  }
}

function boxBounds(boxes) {
  if (!boxes.length) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const box of boxes) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], box.min[axis]);
      max[axis] = Math.max(max[axis], box.max[axis]);
    }
  }
  return { min, max };
}

function fixedCompartment(calibration) {
  const hull = calibration?.hull;
  const left = calibration?.tracks?.left;
  const right = calibration?.tracks?.right;
  if (!hull || !left || !right) return null;
  const hullWidth = hull.max[0] - hull.min[0];
  const hullHeight = hull.max[1] - hull.min[1];
  const centerX = (hull.min[0] + hull.max[0]) / 2;
  const trackMinZ = Math.min(left.min[2], right.min[2]);
  const trackMaxZ = Math.max(left.max[2], right.max[2]);
  const trackDepth = trackMaxZ - trackMinZ;
  return {
    min: [centerX - hullWidth * 0.32, hull.min[1] + hullHeight * 0.32, trackMinZ + trackDepth * 0.34],
    max: [centerX + hullWidth * 0.32, hull.max[1] - hullHeight * 0.10, trackMinZ + trackDepth * 0.78],
  };
}

function fitFixedBoxes(boxes, pivot, target) {
  if (!boxes.length || !target) return;
  // Bake fixed-mount boxes into hull coordinates before normalizing the
  // fighting compartment. The articulation pivot remains useful to the gun,
  // but it must not make internal systems or people behave like turret crew.
  for (const box of boxes) {
    if (box.turretLocal) {
      for (let axis = 0; axis < 3; axis++) {
        box.min[axis] += pivot[axis];
        box.max[axis] += pivot[axis];
      }
      box.turretLocal = false;
    }
  }
  const from = boxBounds(boxes);
  if (!from) return;
  for (const box of boxes) mapBox(box, from, target);
}

// The articulation pivots (armor.turretPivot / armor.gunPivot) are RIG
// anchors, not anatomy: tankFactory seats the visual rig_turret/rig_gun at
// exactly these arrays, and every geometry receipt is measured INSIDE those
// rig frames (tools/gen-combat-anatomy.mjs computes envelopes relative to
// rig_hull/rig_turret). Remapping a pivot through the plate->receipt map
// therefore moves the rendered turret off its authored ring wherever the
// authored plate bounds differ from the measured envelope (§5.356 fleet
// floating-turret regression: pl01 +0.63 m, pt91_twardy +0.28 m). Plates and
// boxes calibrate; pivots stay profile-authored.
function reconcileFrame(plates, boxes, target) {
  const from = plateBounds(plates);
  if (!from || !target) return;
  const seen = new Set();
  for (const plate of plates || []) {
    if (plate.kind === 'external') continue;
    for (const point of plate.verts || []) {
      if (seen.has(point)) continue;
      seen.add(point);
      mapPoint(point, from, target);
    }
  }
  for (const box of boxes) mapBox(box, from, target);
}

function reconcileChildFrame(plates, boxes, pivot, from, to) {
  if (!pivot || !from || !to) return;
  // Compose each turret-local point with the authored pivot, scale it through
  // the hull receipt, then decompose about the SAME authored pivot: world
  // placements calibrate while the rig anchor (and the visual gun it seats)
  // keeps the profile-authored frame.
  const mapLocalPoint = (point) => {
    for (let axis = 0; axis < 3; axis++) point[axis] += pivot[axis];
    mapPoint(point, from, to);
    for (let axis = 0; axis < 3; axis++) point[axis] -= pivot[axis];
  };
  const seen = new Set();
  for (const plate of plates || []) {
    for (const point of plate.verts || []) {
      if (seen.has(point)) continue;
      seen.add(point);
      mapLocalPoint(point);
    }
  }
  for (const box of boxes) {
    mapLocalPoint(box.min);
    mapLocalPoint(box.max);
    for (let axis = 0; axis < 3; axis++) {
      if (box.min[axis] > box.max[axis]) [box.min[axis], box.max[axis]] = [box.max[axis], box.min[axis]];
    }
  }
}

function reconcileTracks(modules, target) {
  if (!target) return;
  for (const box of modules) {
    if (box.module !== 'trackL' && box.module !== 'trackR') continue;
    const side = box.module === 'trackL' ? target.left : target.right;
    if (!side) continue;
    box.min.splice(0, 3, ...side.min);
    box.max.splice(0, 3, ...side.max);
  }
}

function hasMissile(spec) {
  return (spec.gun?.shells || []).some((shell) => (
    Number(shell.reloadS || spec.gun.reloadS) >= MISSILE_RELOAD_FLOOR_S
    && (shell.guided || (spec.class === 'ifv' && shell.type === 'HEAT'))
  ));
}

function alignTurretRing(armor, calibration) {
  const ring = (armor.modules || []).find((box) => box.module === 'turretRing');
  if (!ring || !calibration?.turret) return;
  const thickness = Math.max(0.14, ring.max[1] - ring.min[1]);
  const baseY = calibration.turret.min[1] + (ring.turretLocal ? 0 : armor.turretPivot[1]);
  ring.min[1] = baseY - thickness * 0.5;
  ring.max[1] = baseY + thickness * 0.5;
}

function addDerivedModules(spec) {
  const armor = spec.armor;
  const modules = armor.modules || (armor.modules = []);
  const byName = new Map(modules.map((box) => [box.module, box]));
  const engine = byName.get('engine');
  const ammo = byName.get('ammoRack');
  const gun = byName.get('gun');

  if (!byName.has('transmission') && engine) {
    const rearward = (engine.min[2] + engine.max[2]) / 2 < 0 ? -1 : 1;
    const depth = engine.max[2] - engine.min[2];
    const transmission = shrinkBox(
      engine, 'transmission', [0.86, 0.72, 0.34], [0, -0.04, rearward * depth * 0.25],
    );
    modules.push(transmission);
    byName.set('transmission', transmission);
  }

  const crew = armor.crew || [];
  const hasLoader = crew.some((box) => box.crew === 'loader');
  if (!hasLoader && spec.class !== 'ifv' && !byName.has('autoloader') && ammo) {
    const autoloader = shrinkBox(ammo, 'autoloader', [0.72, 0.48, 0.72], [0, 0.02, 0]);
    modules.push(autoloader);
    byName.set('autoloader', autoloader);
  }
  if (spec.class === 'ifv' && !byName.has('feedSystem') && (gun || ammo)) {
    const source = gun || ammo;
    const feed = shrinkBox(source, 'feedSystem', [0.74, 0.55, 0.58], [0, -0.02, -0.04]);
    modules.push(feed);
    byName.set('feedSystem', feed);
  }
  if (hasMissile(spec) && !byName.has('missileRack') && ammo) {
    const side = (ammo.min[0] + ammo.max[0]) / 2 <= 0 ? 1 : -1;
    const width = ammo.max[0] - ammo.min[0];
    const missileRack = shrinkBox(ammo, 'missileRack', [0.42, 0.62, 0.78], [side * width * 0.24, 0.03, 0]);
    modules.push(missileRack);
    byName.set('missileRack', missileRack);
  }

  // Stable presentation and RNG trace order: core systems first, then the
  // vehicle-specific mechanisms, while preserving authored boxes.
  const order = new Map(MODULE_IDS.map((id, index) => [id, index]));
  modules.sort((a, b) => (order.get(a.module) ?? 999) - (order.get(b.module) ?? 999));
}

export function finalizeCombatAnatomy(spec, calibration = COMBAT_ANATOMY_CALIBRATIONS[spec?.id]) {
  if (!spec?.armor || spec[FINALIZED]) return spec;
  const armor = spec.armor;
  const hullBoxes = [...(armor.modules || []), ...(armor.crew || [])].filter((box) => !box.turretLocal);
  const turretBoxes = [...(armor.modules || []), ...(armor.crew || [])].filter((box) => box.turretLocal);
  if (calibration) {
    // Preserve the authored lower-belly datum; receipts deliberately own the
    // side, roof and longitudinal faces that players can actually aim at.
    const hullFrom = plateBounds(armor.hullPlates);
    const hullTarget = hullFrom && calibration.hull ? {
      min: [calibration.hull.min[0], hullFrom.min[1], calibration.hull.min[2]],
      max: calibration.hull.max.slice(),
    } : null;
    if (!calibration.turret) {
      // Fixed-mount/casemate armor still uses the turret-local trace frame,
      // even though its visible superstructure belongs to the hull mesh.
      // Scale that child frame through the hull receipt as one rigid anatomy
      // instead of leaving crew floating at the donor pivot.
      reconcileChildFrame(armor.turretPlates, turretBoxes, armor.turretPivot, hullFrom, hullTarget);
      reconcileFrame(armor.hullPlates, hullBoxes, hullTarget);
      const compartment = fixedCompartment(calibration);
      const fixedModules = (armor.modules || []).filter(
        (box) => box.turretLocal && box.module !== 'trackL' && box.module !== 'trackR',
      );
      fitFixedBoxes(fixedModules, armor.turretPivot, compartment);
      fitFixedBoxes(armor.crew || [], armor.turretPivot, compartment);
      const fixedMount = (armor.modules || []).find((box) => box.module === 'turretRing');
      if (fixedMount) {
        fixedMount.module = 'gunMount';
      } else if (!(armor.modules || []).some((box) => box.module === 'gunMount')) {
        // Purpose-built casemate anatomy has no fictional turret ring to
        // rename. Derive the fixed trunnion/mount from the authored gun box so
        // module damage remains available without restoring an invisible
        // rotating volume. This also keeps new turretless specs on the same
        // contract as older donor-based tank destroyers.
        const gun = (armor.modules || []).find((box) => box.module === 'gun');
        if (gun) {
          const depth = gun.max[2] - gun.min[2];
          armor.modules.push(shrinkBox(
            gun, 'gunMount', [1.18, 1.08, 0.42], [0, 0, -depth * 0.25],
          ));
        }
      }
    } else {
      reconcileFrame(armor.hullPlates, hullBoxes, hullTarget);
      reconcileFrame(armor.turretPlates, turretBoxes, calibration.turret);
    }
    reconcileTracks(armor.modules || [], calibration.tracks || null);
    alignTurretRing(armor, calibration);
  }
  addDerivedModules(spec);
  Object.defineProperty(spec, FINALIZED, { value: true, enumerable: false });
  return spec;
}

export function combatAnatomyCalibration(id) {
  return COMBAT_ANATOMY_CALIBRATIONS[id] || null;
}
