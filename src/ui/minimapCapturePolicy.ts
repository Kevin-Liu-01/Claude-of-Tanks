export interface MinimapCaptureReceipt {
  source: 'scene' | 'procedural' | 'asset';
  generation: number;
  width: number;
  height: number;
}

/** Ordinary HUDs retain their fallback; authoring must never silently publish it. */
export function captureMinimapScene<T>(strict: boolean, capture: () => T | null): T | null {
  try {
    const result = capture();
    if (strict && result === null) throw new Error('textured minimap capture returned no scene');
    return result;
  } catch (error) {
    if (strict) throw new Error('textured minimap capture failed', { cause: error });
    return null;
  }
}

export function requireSceneMinimap(receipt: MinimapCaptureReceipt | null, generation: number): void {
  if (!receipt || receipt.source !== 'scene' || receipt.generation !== generation ||
      receipt.width <= 0 || receipt.height <= 0) {
    throw new Error('strict minimap export requires a fresh textured scene capture');
  }
}
