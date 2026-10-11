/**
 * One bad tank build never aborts a battle (owner via coordinator, 2026-10-10). A roster visual is tried as authored,
 * then at the other geometry tier, then as the donor its variant was cloned from, then as the first participant's own
 * tank (whose family is loaded by construction). Each failure is logged by the caller; only when every attempt fails
 * does the build throw as before. Pure: the roster supplies the build options and the two fallback ids.
 */
export interface RosterVisualAttempt<Options> {
  readonly specId: string;
  readonly options: Options;
  readonly reason: 'authored' | 'other geometry tier' | 'donor' | 'stand-in';
}

export function rosterVisualAttempts<Options extends { geometryQuality?: 'high' | 'low' }>(
  specId: string,
  options: Options,
  variantOf: string | undefined,
  standIn: string | undefined,
): RosterVisualAttempt<Options>[] {
  const other: 'high' | 'low' = options.geometryQuality === 'low' ? 'high' : 'low';
  const attempts: RosterVisualAttempt<Options>[] = [
    { specId, options, reason: 'authored' },
    { specId, options: { ...options, geometryQuality: other }, reason: 'other geometry tier' },
  ];
  if (variantOf && variantOf !== specId) attempts.push({ specId: variantOf, options, reason: 'donor' });
  if (standIn && standIn !== specId && standIn !== variantOf) attempts.push({ specId: standIn, options, reason: 'stand-in' });
  return attempts;
}
