// src/world/hinterland/drafts/index.ts — the lab drafts (HL-1, the horizons stream, 2026-10-13): a map without a
// `hinterland` block in its file draws its draft only under the lab override `?hinterland=1` (B-architecture §7.1),
// so the parity lab (Verdant) and a migration in progress can be captured on one build while production keeps the ring.
import type { HinterlandConfig } from '../spec.ts';
import alpine from './alpine.ts';
import coastal from './coastal.ts';
import fjord from './fjord.ts';
import winter from './winter.ts';
import railyard from './railyard.ts';
import mars from './mars.ts';
import polders from './polders.ts';
import saltwind from './saltwind.ts';
import steppe from './steppe.ts';
import verdant from './verdant.ts';

export const HINTERLAND_LAB_DRAFTS: Readonly<Record<string, HinterlandConfig>> = Object.freeze({ alpine, coastal, fjord, mars, polders, railyard, saltwind, steppe, verdant, winter });
