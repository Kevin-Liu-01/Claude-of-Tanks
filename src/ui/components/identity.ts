// The kit's vehicle identity (brand-ui SPEC §6.2, owner UI rule 3): a nation's flag, a vehicle's side silhouette, the two
// with its name, and a nation filter chip. Copyright © 2026 Kevin B. Liu.
// A module of its own because the flags are asset imports (../flags.ts, the flag-icons art as Vite URLs): the core kit
// (components.ts) imports no asset, so a surface that draws a button, a tile or an empty state never pulls the flag art
// into its chunk or its Node receipt.
import { flagIconUrl } from '../flags.ts';
import { iconUrl } from '../icons.ts';
import { chip, esc, type ChipOptions } from './components.ts';

/* ----------------------------------------------------------------------------------------- vehicle identity */

type FlagSize = 'sm' | 'md' | 'lg';
/** Each size's box (components.css .cot-c-flag--*), as the image's own size so the first layout reserves it. */
const FLAG_BOX: Readonly<Record<FlagSize, readonly [number, number]>> = { sm: [16, 12], md: [22, 17], lg: [30, 23] };
/** A nation flag (the 4:3 flag-icons art in a hairline frame, SPEC §6.2 badge). Decorative: the nation is named beside it. */
export function flag(nation: string, size: FlagSize = 'md'): string {
  const [width, height] = FLAG_BOX[size];
  return `<img class="cot-c-flag cot-c-flag--${size}" src="${esc(flagIconUrl(nation))}" alt="" aria-hidden="true" width="${width}" height="${height}" draggable="false">`;
}

/** A vehicle's side silhouette, tinted by the text colour (team colours come from the host). */
export function silhouette(id: string, facing: 'left' | 'right' = 'left'): string {
  return `<span class="cot-c-sil${facing === 'right' ? ' cot-c-sil--right' : ''}" aria-hidden="true" `
    + `style="--sil:url(${esc(iconUrl(id, 'side_silhouette'))})"></span>`;
}

interface VehicleOptions {
  readonly id: string;
  readonly nation: string;
  readonly name: string;
  readonly facing?: 'left' | 'right';
  readonly className?: string;
}

/** Flag, silhouette and name: how every vehicle is named on screen (owner UI rule 3). */
export function vehicle(options: VehicleOptions): string {
  return `<span class="cot-c-veh${options.className ? ` ${options.className}` : ''}">${flag(options.nation, 'sm')}`
    + `${silhouette(options.id, options.facing)}<b>${esc(options.name)}</b></span>`;
}

/** A nation filter chip: the kit's chip led by the nation's flag. */
export function nationChip(options: Omit<ChipOptions, 'icon' | 'glyph'> & { readonly nation: string }): string {
  const { nation, ...rest } = options;
  return chip({ ...rest, glyph: flag(nation, 'sm') });
}
