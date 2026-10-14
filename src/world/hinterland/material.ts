// src/world/hinterland/material.ts — the land material's surface (HZ.09 fills it; HL-3 draws the debug albedo).
import type * as THREE from 'three';
import type { HinterlandWire } from './wire.ts';

export interface HinterlandSurface { uniforms: Record<string, THREE.IUniform>; fragmentPars: string; albedo: string }

/** The land's surface from the worker's atlas; null draws the debug albedo by slope (mesh.ts). */
export function createHinterlandSurface(_wire: HinterlandWire): HinterlandSurface | null {
  return null;
}
