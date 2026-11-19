// penInk.ts — the reticle's verdict inks (locked colours per ARCHITECTURE §3.7.1), one place for every surface that
// shows a penetration verdict in them: the reticle's ring (ui/hud.ts) and the angling arc of the training battle
// (ui/tutorial/tutorialGuide.ts, 273). Copyright © 2026 Kevin B. Liu.
import type { PenVerdict } from '../sim/penVerdict.ts';

export const PEN_INK: Readonly<Record<PenVerdict, string>> = Object.freeze({ pen: '#7ee87e', marginal: '#f0b04a', nopen: '#f05a5a' });
