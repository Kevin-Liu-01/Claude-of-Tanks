// End-wrap metric (owner 2026-09-21: the TOS-1A "tracks have the improper wrapping issue around the front road wheel
// and back road wheel … have a check for this for all tanks").
//
// The loaded run must leave each OUTER road wheel the way a real track does: it hugs the tire's seat circle down from
// the foot and departs along the common external tangent to the idler / sprocket wrap. The old review measured that
// against the course's shared station list (wheelZs) — measured rigs seat each side's wheels on their own stations
// (wheelZsLeftM / wheelZsRightM, 38–124 mm apart on the T-90MS X, the CV90s and the ZTZ-100 X), so a course that
// wrapped the pair-midpoint station passed while the rendered band cut into one end tire and floated off the other.
// This metric therefore reads the RENDERED rest band of each side (its gearTrackBand cells) against that side's actual
// outer road wheel and the ideal wrap built from it:
//   seat circle   centre = the side's axle, radius seatR = axle height − the loop's own ground run (the flat run seats
//                 the tire into the band by an authored amount; kit courses: tire + half a band)
//   end circle    centre = the receipt's idler / sprocket, radius read off the course (median distance of the cells
//                 beyond the end centre)
//   ideal course  seat arc from the foot (180°) to the common external tangent, then the tangent to the end circle
//   cutMm         min over the end-region cells of (distance to the axle − seatR): negative = the band centreline
//                 rides inside its seat, i.e. the inner face is buried in the tire
//   deviationMm   max over the end-region cells of the distance to the ideal course: daylight at the departure, a
//                 ramp that leaves early / late, or a wrap laid about a station where no wheel is
// 'ground-level' ends (dead-track rigs whose drive / idler wrap crosses the ground run) carry no wheel wrap and are
// reported without numbers, as tools/track-wrap-review.mjs does.
const D2R = Math.PI / 180;
const EPS = 1e-6;

/** Band centreline cells (point f0 of every 24-vertex cell: the midpoint of its outer (2) and inner (6) duplicates). */
export function bandCentrelineCells(band) {
  const pos = band.geometry.getAttribute('position');
  const cells = [];
  for (let i = 0; i * 24 < pos.count; i++) {
    cells.push([(pos.getZ(i * 24 + 2) + pos.getZ(i * 24 + 6)) / 2, (pos.getY(i * 24 + 2) + pos.getY(i * 24 + 6)) / 2]);
  }
  return cells;
}

/** Common external tangent of the seat circle and the end circle as the shared radial angle (arc() convention:
 * 0 = up, 90 = +z) — the solve tankFactoryCore.roadWheelWrap / the live end re-lay use. */
export function externalTangentDeg(end, axleZ, axleY, seatR, endR, endRadius) {
  const dz = axleZ - endR.z, dy = axleY - endR.y, distance = Math.hypot(dz, dy);
  if (distance <= Math.abs(endRadius - seatR) + 1e-3) return null;
  const phi = Math.atan2(dz, dy);
  const spread = Math.acos(Math.max(-1, Math.min(1, (endRadius - seatR) / distance)));
  const lo = end === 'front' ? 90 : 180, hi = lo + 90;
  const normalise = (radians) => (((radians / D2R) % 360) + 360) % 360;
  const candidates = [normalise(phi + spread), normalise(phi - spread)]
    .filter((deg) => deg > lo + 0.5 && deg < hi - 0.5)
    .sort((a, b) => Math.abs(a - (lo + hi) / 2) - Math.abs(b - (lo + hi) / 2));
  return candidates.length ? candidates[0] : null;
}

function segmentDistance(z, y, a, b) {
  const dz = b[0] - a[0], dy = b[1] - a[1], l2 = dz * dz + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((z - a[0]) * dz + (y - a[1]) * dy) / l2)) : 0;
  return Math.hypot(z - (a[0] + dz * t), y - (a[1] + dy * t));
}

/**
 * Measure one end of one side. `cells` are the side's rest band centreline cells, `receipt` the running-gear receipt.
 * Returns { status, offsetMm, seatR, endRadius, tangentDeg, cutMm, deviationMm, worstAt, cells } — status 'ok' carries
 * the numbers; 'ground-level' | 'no-end' | 'no-wrap' | 'nested' | 'no-tangent' | 'no-cells' carry none.
 */
export function measureEndWrap(receipt, cells, side, end) {
  const { wheelZs, wheelY, wheelYs } = receipt;
  if (!Array.isArray(wheelZs) || !wheelZs.length || !cells.length) return { status: 'no-cells' };
  const idx = end === 'front' ? wheelZs.indexOf(Math.max(...wheelZs)) : wheelZs.indexOf(Math.min(...wheelZs));
  const stations = (side < 0 ? receipt.wheelZsLeftM : receipt.wheelZsRightM) ?? wheelZs;
  const axleZ = stations[idx], axleY = wheelYs?.[idx] ?? wheelY;
  const offsetMm = +((axleZ - wheelZs[idx]) * 1000).toFixed(1);
  const botY = Math.min(...cells.map(([, y]) => y));
  const seatR = axleY - botY;
  const ends = [receipt.sprocket, receipt.idler].filter(Boolean);
  if (ends.length !== 2) return { status: 'no-end', offsetMm };
  const endC = end === 'front' ? (ends[0].z > ends[1].z ? ends[0] : ends[1]) : (ends[0].z > ends[1].z ? ends[1] : ends[0]);
  // the end-wrap radius, read off the course: the arc vertices beyond the end centre sit on the wrap circle; the upper
  // half holds nothing else (no ramp, no top run — those lie on the other side of the centre), while the subdivided
  // chords of a large wrap leave stations a sagitta (≤ 2 cm) inside it, so the largest upper-half distance is the radius
  const beyond = cells.filter(([z]) => (end === 'front' ? z > endC.z + EPS : z < endC.z - EPS));
  if (beyond.length < 3) return { status: 'no-wrap', offsetMm };
  const upper = beyond.filter(([, y]) => y > endC.y).map(([z, y]) => Math.hypot(z - endC.z, y - endC.y));
  const sorted = beyond.map(([z, y]) => Math.hypot(z - endC.z, y - endC.y)).sort((a, b) => a - b);
  const endRadius = upper.length ? Math.max(...upper) : sorted[Math.floor(sorted.length / 2)];
  if (endC.y - endRadius <= botY + 0.005) return { status: 'ground-level', offsetMm };
  const tangentDeg = externalTangentDeg(end, axleZ, axleY, seatR, endC, endRadius);
  if (tangentDeg == null) return { status: 'no-tangent', offsetMm };
  const pW = [axleZ + Math.sin(tangentDeg * D2R) * seatR, axleY + Math.cos(tangentDeg * D2R) * seatR];
  const pE = [endC.z + Math.sin(tangentDeg * D2R) * endRadius, endC.y + Math.cos(tangentDeg * D2R) * endRadius];
  const arcLo = Math.min(180, tangentDeg) - 0.5, arcHi = Math.max(180, tangentDeg) + 0.5;
  let cutMm = Infinity, deviationMm = 0, worstAt = null, counted = 0;
  for (const [z, y] of cells) {
    if (end === 'front' ? z < axleZ - EPS : z > axleZ + EPS) continue; // the loaded run and the far end
    if (y >= axleY || y <= botY + 1e-4) continue;                      // above the axle / the flat run itself
    const dE = Math.hypot(z - endC.z, y - endC.y);
    if (dE <= endRadius + 2.5e-3 && dE >= endRadius - 0.025) continue; // the end arc (incl. its subdivided chords' stations)
    const rho = Math.hypot(z - axleZ, y - axleY);
    const angle = (((Math.atan2(z - axleZ, y - axleY) / D2R) % 360) + 360) % 360;
    const seatGap = rho - seatR;
    const onArc = angle >= arcLo && angle <= arcHi ? Math.abs(seatGap) : Infinity;
    const deviation = Math.min(onArc, segmentDistance(z, y, pW, pE));
    counted++;
    cutMm = Math.min(cutMm, seatGap * 1000);
    if (deviation * 1000 > deviationMm) { deviationMm = deviation * 1000; worstAt = [+z.toFixed(4), +y.toFixed(4)]; }
  }
  if (!counted) return { status: 'no-cells', offsetMm };
  return { status: 'ok', offsetMm, seatR: +seatR.toFixed(4), endRadius: +endRadius.toFixed(4), tangentDeg: +tangentDeg.toFixed(2),
    cutMm: +cutMm.toFixed(1), deviationMm: +deviationMm.toFixed(1), worstAt, cells: counted };
}

/** Every running-gear unit's band pair, paired with its receipt through userData.runningGearUnitId. */
export function runningGearBands(root) {
  const receipts = [];
  root.traverse((o) => { const list = o.userData?.runningGearReceipts; if (Array.isArray(list)) receipts.push(...list); });
  const bands = [];
  root.traverse((o) => { if (o.isMesh && /^gearTrackBand[LR]$/.test(o.name)) bands.push(o); });
  return receipts.map((receipt) => ({
    receipt,
    bands: {
      [-1]: bands.find((b) => b.userData.runningGearUnitId === receipt.unitId && b.userData.runningGearSide === -1) ?? null,
      [1]: bands.find((b) => b.userData.runningGearUnitId === receipt.unitId && b.userData.runningGearSide === 1) ?? null,
    },
  }));
}

/** Rows for one built tank: per unit, per side, per end. Units whose band pair is not in the scene (a gear the profile
 * rebuilt) are skipped. */
export function endWrapRows(root) {
  const rows = [];
  for (const [unit, { receipt, bands }] of runningGearBands(root).entries()) {
    for (const side of [-1, 1]) {
      const band = bands[side];
      if (!band) continue;
      const cells = bandCentrelineCells(band);
      for (const end of ['front', 'rear']) rows.push({ unit, side, end, ...measureEndWrap(receipt, cells, side, end) });
    }
  }
  return rows;
}

/** Gate thresholds (mm). The fleet's tangent wraps sit within ±1 mm (graded chords circumscribe up to R / cos 3°);
 * a course wrapped about a station 38 mm from its wheel reads 16–23 mm. */
export const END_WRAP_CUT_LIMIT_MM = 3;
export const END_WRAP_DEVIATION_LIMIT_MM = 5;
export function endWrapFlags(row) {
  if (row.status !== 'ok') return [];
  const flags = [];
  if (row.cutMm < -END_WRAP_CUT_LIMIT_MM) flags.push('CUT');
  if (row.deviationMm > END_WRAP_DEVIATION_LIMIT_MM) flags.push('OFF-TANGENT');
  return flags;
}
