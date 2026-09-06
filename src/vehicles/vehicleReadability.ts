/** Scene-wide vehicle readability, owned by covered atmosphere transitions.
 * Kept separate from material/texture construction so atmosphere stays light.
 * The uniform identity survives cached materials and later shader compilation.
 */
const readabilityScale = { value: 1 };

export function setVehicleReadabilityScale(scale: number): void {
  if (!Number.isFinite(scale) || scale < 0 || scale > 1) {
    throw new RangeError('Vehicle readability scale must be finite and in 0..1');
  }
  readabilityScale.value = scale;
}

export function getVehicleReadabilityScale(): number {
  return readabilityScale.value;
}

export function bindVehicleReadabilityUniform(
  uniforms: Record<string, { value: number }>,
): void {
  uniforms.uVehicleReadabilityScale = readabilityScale;
}
