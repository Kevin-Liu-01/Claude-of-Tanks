// The fleet as the manual's chapters show it: each tank's name, nation and tier (the asset manifest's rows, read
// tool-side by tools/docsFleetTable.ts) and its hero card, the tank render over its waving flag (public/icons/hero,
// src/ui/heroCard.css), composed as the landing's fleet plate composes it (tools/home-premiere.mjs heroLayers).
// Copyright © 2026 Kevin B. Liu. Node only: tools/docs-prerender.mjs runs it.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { docsFleetRows, type DocsFleetRow } from '../../../tools/docsFleetTable.ts';
import type { HeroFacing } from '../../ui/heroCardPolicy.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export type FleetTank = DocsFleetRow;
interface HeroRow { readonly flag: string; readonly b: readonly number[]; readonly face?: readonly string[]; readonly sha: readonly string[] }
interface HeroCards { readonly facing: HeroFacing; readonly tanks: Readonly<Record<string, HeroRow>>; readonly flags: Readonly<Record<string, { readonly sha: readonly string[] }>> }

let tanks: ReadonlyMap<string, FleetTank> | null = null;
/** Every playable tank's name, nation and tier, by id. */
export function fleetTanks(): ReadonlyMap<string, FleetTank> {
  if (tanks) return tanks;
  tanks = new Map(docsFleetRows().map((row) => [row.id, row]));
  return tanks;
}

let hero: HeroCards | null = null;
const heroCards = (): HeroCards => (hero ??= JSON.parse(readFileSync(join(ROOT, 'public/icons/hero/hero-cards.json'), 'utf8')) as HeroCards);
const v = (sha: string | undefined): string => (sha ? `?v=${sha.slice(0, 8)}` : '');

/** One tank's hero card: its flag and its render, as two lazy pictures in a .cot-hc host the manual sizes. */
export function heroCardMarkup(id: string, sizes: string): string {
  const cards = heroCards();
  const row = cards.tanks[id];
  const flag = row && cards.flags[row.flag];
  if (!row || !flag) throw new Error(`docs: ${id} has no hero card`);
  const [cx, cw, ch, cb, fx0, fx1] = row.b;
  const mirrored = (row.face?.[1] ?? 'left') !== 'left';
  const place = `--hc-cx:${cx};--hc-cw:${cw};--hc-ch:${ch};--hc-cb:${cb};--hc-fx0:${fx0};--hc-fx1:${fx1};--hc-fw:${Number((fx1 - fx0).toFixed(4))}${mirrored ? ';--hc-gs:-1' : ''}`;
  return `<div class="dm-hc cot-hc hc-loaded" data-hero-facing="${cards.facing}">`
    + `<picture><source type="image/avif" srcset="/icons/hero/flag-${row.flag}-480.avif${v(flag.sha[0])} 480w, /icons/hero/flag-${row.flag}-960.avif${v(flag.sha[1])} 960w" sizes="${sizes}">`
    + `<img class="hc-flag" src="/icons/hero/flag-${row.flag}-480.webp${v(flag.sha[2])}" width="480" height="300" alt="" loading="lazy" decoding="async"></picture>`
    + `<picture><source type="image/avif" srcset="/icons/hero/${id}-480.avif${v(row.sha[0])} 480w, /icons/hero/${id}-960.avif${v(row.sha[1])} 960w" sizes="${sizes}">`
    + `<img class="hc-tank" src="/icons/hero/${id}-480.webp${v(row.sha[2])}" width="480" height="300" alt="" loading="lazy" decoding="async" style="${place}"></picture></div>`;
}
