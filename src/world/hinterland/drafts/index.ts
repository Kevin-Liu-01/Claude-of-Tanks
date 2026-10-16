// src/world/hinterland/drafts/index.ts — the lab drafts (HL-1, the horizons stream, 2026-10-13): a map without a
// `hinterland` block in its file draws its draft only under the lab override `?hinterland=1` (B-architecture §7.1),
// so the parity lab (Verdant) and a migration in progress can be captured on one build while production keeps the ring.
import type { HinterlandConfig } from '../spec.ts';
import alpine from './alpine.ts';
import autumn from './autumn.ts';
import badlands from './badlands.ts';
import blackglass from './blackglass.ts';
import caldera from './caldera.ts';
import coastal from './coastal.ts';
import copper_mesa from './copper_mesa.ts';
import delta from './delta.ts';
import desert from './desert.ts';
import fjord from './fjord.ts';
import foundry from './foundry.ts';
import frontier from './frontier.ts';
import longleaf from './longleaf.ts';
import mangrove from './mangrove.ts';
import mars from './mars.ts';
import monsoon from './monsoon.ts';
import oasis from './oasis.ts';
import polders from './polders.ts';
import railyard from './railyard.ts';
import reservoir from './reservoir.ts';
import saltwind from './saltwind.ts';
import steppe from './steppe.ts';
import titan_gorge from './titan_gorge.ts';
import urban from './urban.ts';
import verdant from './verdant.ts';
import whiteout from './whiteout.ts';
import winter from './winter.ts';

export const HINTERLAND_LAB_DRAFTS: Readonly<Record<string, HinterlandConfig>> = Object.freeze({ alpine, autumn, badlands, blackglass, caldera, coastal, copper_mesa, delta, desert, fjord, foundry, frontier, longleaf, mangrove, mars, monsoon, oasis, polders, railyard, reservoir, saltwind, steppe, titan_gorge, urban, verdant, whiteout, winter });
