/** Exercise every sensor branch of the shared output shader while covered.
 * Restore the selected view before each checkpoint; cancellation cannot flash
 * another sensor mode or change the player's saved choice. */
export function* createVisionWarmSteps(
  uniform: { value: number }, render: () => void,
): Generator<number> {
  for (const mode of [0, 1, 2, 3]) {
    const previous = uniform.value;
    try { uniform.value = mode; render(); }
    finally { uniform.value = previous; }
    yield mode;
  }
}
