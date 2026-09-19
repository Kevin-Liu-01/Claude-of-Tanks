/** Certified models share the source camera, including source-only reframing.
 * Legacy comparisons retain their independent presentation cameras. */
export function comparisonCameras(makeCamera, referenceBox, candidateBox, certified) {
  const reference = makeCamera(referenceBox);
  return { reference, candidate: certified ? reference : makeCamera(candidateBox) };
}
