/** The generator's exact four-decimal serialization; this is not a tolerance. */
export function presentationNumberSource(value) {
  const rounded = Number(Number(value).toFixed(4));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** Compare a measured/generated receipt with its published runtime values. */
export function presentationReceiptErrors(id, anchor, projection, savedAnchor, savedProjection) {
  const errors = [];
  for (const [kind, actual, saved, fields] of [
    ['anchor', anchor, savedAnchor, ['xM', 'zM']],
    ['projection', projection, savedProjection, ['centerYM', 'topHalfM', 'sideHalfM']],
  ]) for (const field of fields) {
    const value = actual?.[field], expected = saved?.[field];
    if (!Number.isFinite(value) || !Number.isFinite(expected)) {
      errors.push(`${id}: missing/nonfinite presentation ${kind}.${field}`);
    } else if (field.endsWith('HalfM') && (value <= 0 || expected <= 0)) {
      errors.push(`${id}: presentation ${kind}.${field} must be positive`);
    } else if (Number(presentationNumberSource(value)) !== expected) {
      errors.push(`${id}: stale presentation ${kind}.${field}: measured ${presentationNumberSource(value)} != published ${expected}`);
    }
  }
  return errors;
}
