// src/world/hinterland/drafts/index.ts — the lab drafts (HL-1, the horizons stream, 2026-10-13): a map without a
// `hinterland` block in its file draws its draft only under the lab override `?hinterland=1` (B-architecture §7.1),
// so the parity lab (Verdant) and a migration in progress can be captured on one build while production keeps the ring.
import type { HinterlandConfig } from '../spec.ts';
import alpine from './alpine.ts';
import delta from './delta.ts';
import winter from './winter.ts';
import railyard from './railyard.ts';
import mangrove from './mangrove.ts';
import mars from './mars.ts';
import monsoon from './monsoon.ts';
import polders from './polders.ts';
import verdant from './verdant.ts';

export const HINTERLAND_LAB_DRAFTS: Readonly<Record<string, HinterlandConfig>> = Object.freeze({ alpine, delta, mangrove, mars, monsoon, polders, railyard, verdant, winter });
