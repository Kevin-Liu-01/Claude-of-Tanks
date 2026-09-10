/** Authored axes replace individual tactical forms, never the base noise field. */
export interface PlayableRelief {
  kind: 'spur' | 'glacial' | 'terrace';
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  leftWidthM: number;
  rightWidthM: number;
  bendM: number;
  branchSide: -1 | 1;
  notchAtFraction: number;
}

export interface PreparedPlayableRelief extends PlayableRelief {
  axisX: number;
  axisZ: number;
  inverseLength: number;
  lengthM: number;
}

function bounded(value: number, low: number, high: number): boolean {
  return Number.isFinite(value) && value >= low && value <= high;
}

/** Construction-only validation/constants. No new random stream or height grid. */
export function preparePlayableRelief(form: PlayableRelief): PreparedPlayableRelief {
  if (!['spur', 'glacial', 'terrace'].includes(form.kind)) throw new Error('Unknown playable relief profile');
  for (const coordinate of [form.startX, form.startZ, form.endX, form.endZ]) {
    if (!bounded(coordinate, -480, 480)) throw new Error('Playable relief axis outside authored bounds');
  }
  const dx = form.endX - form.startX, dz = form.endZ - form.startZ;
  const lengthM = Math.hypot(dx, dz);
  if (!bounded(lengthM, 80, 900)) throw new Error('Playable relief axis length must be80–900m');
  if (!bounded(form.leftWidthM, 24, 180) || !bounded(form.rightWidthM, 24, 180)) {
    throw new Error('Playable relief shoulder width must be24–180m');
  }
  if (!bounded(form.bendM, -lengthM * 0.15, lengthM * 0.15)) throw new Error('Playable relief bend exceeds axis budget');
  if (form.branchSide !== -1 && form.branchSide !== 1) throw new Error('Playable relief branch side must be signed');
  if (!bounded(form.notchAtFraction, 0.25, 0.75)) throw new Error('Playable relief notch must remain inside its axis');
  return { ...form, axisX: dx / lengthM, axisZ: dz / lengthM, inverseLength: 1 / lengthM, lengthM };
}

function ramp(low: number, high: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

/** Smooth-ended unequal branch, including a secondary interfluve off one side. */
function spurWeight(form: PreparedPlayableRelief, along: number, acrossM: number): number {
  const taper = 1 - along * 0.42;
  const width = (acrossM < 0 ? form.leftWidthM : form.rightWidthM) * taper;
  const core = 1 - ramp(0.06, 1, Math.abs(acrossM) / width);
  const branchWidth = form.branchSide < 0 ? form.leftWidthM : form.rightWidthM;
  const branchAlong = along + 0.5 - form.notchAtFraction;
  const branchCenter = form.branchSide * branchWidth * 0.70 * ramp(0.18, 0.78, branchAlong);
  const branch = (1 - ramp(0.08, 1, Math.abs(acrossM - branchCenter) / (branchWidth * 0.28)))
    * ramp(0.14, 0.38, branchAlong) * (1 - ramp(0.70, 0.94, branchAlong));
  return core + (1 - core) * branch * 0.64;
}

/** Unequal trough walls with a slanted, finite saddle/drainage cut. */
function glacialWeight(form: PreparedPlayableRelief, along: number, acrossM: number): number {
  const width = acrossM < 0 ? form.leftWidthM : form.rightWidthM;
  const shoulder = 1 - ramp(0.08, 1, Math.abs(acrossM) / width);
  const cutDistance = (along - form.notchAtFraction) * form.lengthM - acrossM * form.branchSide * 0.55;
  const cut = 1 - ramp(0, form.lengthM * 0.13, Math.abs(cutDistance));
  return shoulder * shoulder * (1 - cut * 0.46);
}

/** Two broad benches and softened risers, interrupted by an oblique side wash. */
function terraceWeight(form: PreparedPlayableRelief, along: number, acrossM: number): number {
  const width = acrossM < 0 ? form.leftWidthM : form.rightWidthM;
  const radius = Math.abs(acrossM) / width;
  const terraces = (1 - ramp(0.60, 1, radius)) * 0.38 + (1 - ramp(0.12, 0.32, radius)) * 0.62;
  const cutDistance = (along - form.notchAtFraction) * form.lengthM - acrossM * form.branchSide * 0.85;
  const cut = (1 - ramp(0, form.lengthM * 0.12, Math.abs(cutDistance)))
    * ramp(0.02, 0.64, acrossM * form.branchSide / width);
  return terraces * (1 - cut * 0.76);
}

/** Allocation/noise-free scalar weight in[0,1]; signed amplitude stays with its original form. */
export function samplePlayableRelief(form: PreparedPlayableRelief, x: number, z: number): number {
  const dx = x - form.startX, dz = z - form.startZ;
  const along = (dx * form.axisX + dz * form.axisZ) * form.inverseLength;
  if (along <= 0 || along >= 1) return 0;
  const acrossM = -dx * form.axisZ + dz * form.axisX - form.bendM * 4 * along * (1 - along);
  const ends = ramp(0, 0.16, along) * (1 - ramp(0.80, 1, along));
  if (form.kind === 'spur') return ends * spurWeight(form, along, acrossM);
  if (form.kind === 'glacial') return ends * glacialWeight(form, along, acrossM);
  return ends * terraceWeight(form, along, acrossM);
}
