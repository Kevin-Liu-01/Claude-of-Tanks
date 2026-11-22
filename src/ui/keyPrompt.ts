/**
 * keyPrompt.ts — the one standard for "what do I press" (owner 2026-11-20, mobile-hud-274: "for those we also need a
 * standardized system for knowing and easily seeing what key to press"). Copyright © 2026 Kevin B. Liu.
 *
 * One resolver, an action to what the player presses for it on the device in their hands now: on a keyboard its bound
 * key (game/battleKeyCaps.ts keyCapFor, the same caps the HUD's tiles show, so a rebinding relabels both); on a pad its
 * button; on a touch layout no key at all but the HUD tile that does it, whose own icon the line shows while the tile
 * itself is lit (data-hint-pulse, battleHudLayout.css). One visual: the kit's keycap (components.ts keycap) at the
 * battle's size. A line takes its keys as {placeholders} the resolver fills (formatPrompt), never a hard-coded key.
 * The device and the bindings are read, not announced (input.ts polls both): promptRevision says when to draw again.
 */
import type { ActionId } from '../game/input.ts';
import { keyCapFor, type KeyCapInput, type CapAction } from '../game/battleKeyCaps.ts';
import { keycap } from './components/components.ts';
import { t } from './i18n.ts';
import { uiIconSVG } from './uiIcons.ts';
import type { IconId } from './icons/icon.ts';

/** What the resolver reads: the key caps' input, and whether the layout is touch. */
export interface PromptInput extends Omit<KeyCapInput, 'getBinding' | 'getPadBinding'> {
  getBinding(actionId: ActionId, slot?: 0 | 1): string | null;
  getPadBinding(actionId: ActionId): number | null;
  isTouchLayout(): boolean;
}

type InputDevice = 'keyboard' | 'pad' | 'touch';

/** The device in the player's hands: a touch layout, else a pad used in the last few seconds (the key caps' rule,
 *  input.padActive), else the keyboard. */
export function inputDevice(input: PromptInput): InputDevice {
  return input.isTouchLayout() ? 'touch' : input.padActive() ? 'pad' : 'keyboard';
}

/** Changes whenever a drawn prompt may: a rebinding (input.bindingsRevision) or a change of device. */
export function promptRevision(input: PromptInput): string {
  return `${input.bindingsRevision()}:${inputDevice(input)}`;
}

/** An action's HUD tile on a touch layout, and the icon it is drawn with where its own cannot be read. */
interface TouchTile {
  readonly selector: string;
  readonly icon: IconId;
  /** Draw `icon`, never the tile's own first glyph (the shell tile's first glyph is its cycle chevron, notices-audit-275's
   *  phone capture: three "‹" for the three slots). */
  readonly drawn?: true;
}
const ROW = (action: string) => `.cot-vehicle-controls>button:has([data-key-cap="${action}"])`;
const TOUCH_TILES: Partial<Record<ActionId, TouchTile>> = {
  consumable1: { selector: '.cot-con:has([data-key-cap="consumable1"])', icon: 'repair' },
  consumable2: { selector: '.cot-con:has([data-key-cap="consumable2"])', icon: 'repair' },
  consumable3: { selector: '.cot-con:has([data-key-cap="consumable3"])', icon: 'repair' },
  shell1: { selector: '.cot-shell:has([data-key-cap="shell1"])', icon: 'shell', drawn: true },
  shell2: { selector: '.cot-shell:has([data-key-cap="shell2"])', icon: 'shell', drawn: true },
  shell3: { selector: '.cot-shell:has([data-key-cap="shell3"])', icon: 'shell', drawn: true },
  smoke: { selector: ROW('smoke'), icon: 'smoke' },
  // a jump mode's moves (turbo-spin-275): the row's tile, or on a phone the touch kit's round button, each drawn with
  // the same glyph; the flip notice names selfRight, so a touch player sees the jump button there too (notices-audit-275)
  selfRight: { selector: `${ROW('selfRight')}, .cot-touch.on .round.jump`, icon: 'rocket' },
  turbo: { selector: `${ROW('turbo')}, .cot-touch.on .round.turbo`, icon: 'turbo' },
  airSpin: { selector: `${ROW('airSpin')}, .cot-touch.on .round.air-spin`, icon: 'airSpin' },
  lights: { selector: ROW('lights'), icon: 'lightbulb' },
  roofGun: { selector: ROW('roofGun'), icon: 'roofGun' },
  drone: { selector: ROW('drone'), icon: 'controller' },
  atgm: { selector: ROW('atgm'), icon: 'fireGun' },
  specialAction: { selector: ROW('specialAction'), icon: 'controller' },
  // (Air Support's Support slot, airSupportHud.ts: its call-ins open from it)
  strikeView: { selector: '.cot-strike-dock', icon: 'modeAirSupport' },
  autoAim: { selector: '.cot-touch.on .autoaim', icon: 'autoAim' },
  sniperToggle: { selector: '.cot-touch.on .scope', icon: 'scope' },
  fire: { selector: '.cot-touch.on .fire:not(.alt)', icon: 'fireGun' },
};

/** What to show for an action: a key's or a button's cap, or (touch) the tile that does it; none where nothing does. */
export type Prompt =
  | { readonly kind: 'key' | 'pad'; readonly label: string }
  | { readonly kind: 'tile'; readonly selector: string; readonly icon: IconId; readonly drawn?: true }
  | { readonly kind: 'none' };

/** The one resolver. */
export function promptFor(input: PromptInput, action: ActionId, device: InputDevice = inputDevice(input)): Prompt {
  if (device === 'touch') return tilePrompt(action);
  const label = keyCapFor(input as unknown as KeyCapInput, action as CapAction, device === 'pad');
  return !label || label === '—' ? { kind: 'none' } : { kind: device === 'pad' ? 'pad' : 'key', label };
}

const esc = (value: string) => value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** The battle's keycap: the kit's (components.ts keycap) at the battle's 20 px, for the hints, the controls strip and the
 *  tutorial's cards alike. `action` marks it for a relabel in place (data-key-cap); `cjk` sets a Chinese cap in the plain
 *  face; `spoken` keeps it for a screen reader where no other words say the key. */
export function battleKeycap(label: string, options: { readonly action?: string; readonly cjk?: boolean; readonly spoken?: boolean } = {}): string {
  let html = keycap(label).replace('class="cot-c-kbd"', `class="cot-c-kbd cot-c-kbd--battle${options.cjk ? ' cjk' : ''}"`);
  if (options.action) html = html.replace('<kbd ', `<kbd data-key-cap="${esc(options.action)}" `);
  if (options.spoken) html = html.replace(' aria-hidden="true"', '');
  return html;
}

/** A prompt as markup: the kit's keycap at the battle's size (its key also said to a screen reader), or the tile's icon
 *  (the tile's own where the page has it). `root` is where a tile is looked up (the document by default). */
function promptHtml(prompt: Prompt, root: Pick<Document, 'querySelector'> | null = typeof document === 'undefined' ? null : document): string {
  if (prompt.kind === 'none') return '';
  if (prompt.kind === 'tile') {
    const own = prompt.drawn ? null : root?.querySelector(prompt.selector)?.querySelector('svg');
    const svg = own ? own.outerHTML : uiIconSVG(prompt.icon, 16);
    return `<span class="cot-key-prompt cot-key-prompt--tile" aria-hidden="true">${svg}</span>`;
  }
  return `<span class="cot-key-prompt">${battleKeycap(prompt.label)}<span class="cot-key-prompt__said">${esc(prompt.label)}</span></span>`;
}

/** A catalog line whose {placeholders} name actions: each filled with that action's prompt in the run of words, every
 *  other character escaped (the tutorial's sentinel swap, tutorialRunner.ts, as one helper): for prose, a tutorial card's
 *  body. Other vars pass through as text. */
export function formatPrompt(input: PromptInput, key: string, actions: Readonly<Record<string, ActionId>>,
  vars: Readonly<Record<string, string | number>> = {}, root?: Pick<Document, 'querySelector'> | null): string {
  const device = inputDevice(input);
  return fill(key, actions, vars, (action) => promptHtml(promptFor(input, action, device), root));
}

/** A hint's line, laid out "[KEY] text" (owner 2026-11-20: "lets avoid 2 lines and if so make it [KEY] text (can be up to 2
 *  lines)"): its keys (it leads with them: keyPrompt.selftest holds every hint line to that) in a column of their own,
 *  centred against the words beside them, which wrap under their own first word and stop at two lines (cot-key-line,
 *  components.css); never a key inside the run of words. A line without keys is its words, two lines at most. */
export function formatKeyLine(input: PromptInput, key: string, actions: Readonly<Record<string, ActionId>>,
  vars: Readonly<Record<string, string | number>> = {}, root?: Pick<Document, 'querySelector'> | null): string {
  const device = inputDevice(input);
  return formatKeyLineWith((action) => promptFor(input, action, device), key, actions, vars, root);
}

/** formatKeyLine with the prompts from another resolver: the HUD's event lane, which reads the frame's key caps
 *  (game/battleKeyCaps.ts, the same caps promptFor reads) and the layout's touch flag, has no input of its own. */
export function formatKeyLineWith(resolve: (action: ActionId) => Prompt, key: string, actions: Readonly<Record<string, ActionId>>,
  vars: Readonly<Record<string, string | number>> = {}, root?: Pick<Document, 'querySelector'> | null): string {
  const keys: string[] = [];
  const words = fill(key, actions, vars, (action) => {
    // (an action with nothing to press on this device, a pad button left unbound, keeps its tile's icon in the column: a
    // line never loses the thing it names)
    const html = promptHtml(resolve(action), root) || promptHtml(tilePrompt(action), root);
    // (one prompt once: a phone's one shell tile stands for the three slots, notices-audit-275)
    if (html && !keys.includes(html)) keys.push(html);
    return ' ';
  }).replace(/\s+/g, ' ').trim();
  const text = `<span class="cot-key-line__text">${words}</span>`;
  return keys.length ? `<span class="cot-key-line"><span class="cot-key-line__keys">${keys.join('')}</span>${text}</span>` : text;
}

/** An action's HUD tile as a prompt (a touch layout's), or none where no tile does it. */
export function tilePrompt(action: ActionId): Prompt {
  const tile = TOUCH_TILES[action];
  return tile ? { kind: 'tile', selector: tile.selector, icon: tile.icon, drawn: tile.drawn } : { kind: 'none' };
}

/** The catalog line, escaped, each action's placeholder replaced by `draw(action)`. */
function fill(key: string, actions: Readonly<Record<string, ActionId>>, vars: Readonly<Record<string, string | number>>,
  draw: (action: ActionId) => string): string {
  const marks: Record<string, string> = {};
  const names = Object.keys(actions);
  names.forEach((name, i) => { marks[name] = `\u0000${i}\u0000`; });
  return esc(t(key, { ...vars, ...marks })).replace(/\u0000(\d+)\u0000/g, (_, i) => draw(actions[names[Number(i)]]));
}

/** The HUD tiles a line's actions name, for lighting them on a touch layout while the line shows. */
export function promptTiles(input: PromptInput, actions: readonly ActionId[]): string[] {
  if (inputDevice(input) !== 'touch') return [];
  return actions.map((action) => TOUCH_TILES[action]?.selector).filter((selector): selector is string => !!selector);
}
