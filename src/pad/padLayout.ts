/**
 * The phone controller's layout (docs/PHONE-CONTROLLER.md "Controls"; owner 2026-11-20: "use joysticks buttons in specific
 * areas, big buttons and surface areas for all capabilities, special sections from left and right for the special
 * abilities, so you can play all special modes from couch/mobile controller mode"). Pure and Node-runnable: the page
 * renders it, padLayout.selftest.mjs checks it.
 *
 * Five zones, the same in every mode, mirrored for a left-handed player:
 *
 *   ┌────────┬──────────────────┬──────────┬──────────────────┬────────┐
 *   │ LEFT   │ left thumb:      │  deck:   │ right thumb:     │ RIGHT  │
 *   │ special│ the stick (drive,│  the     │ the aim area     │ special│
 *   │ column │ fly, move) and   │  rounds  │ (drag, hold past │ column │
 *   │        │ its hold key     │  or the  │ the ring to keep │        │
 *   │        │ (brake, climb)   │  call-ins│ turning), FIRE   │        │
 *   └────────┴──────────────────┴──────────┴──────────────────┴────────┘
 *
 * The desktop says which mode it is in and which of a mode's controls this player has (the status's `m` and `a`,
 * padProtocol.ts); the page lays out that mode's controls and nothing else, so the thumbs never meet a dead key.
 */
import type { PadCommand, PadHoldAction, PadMode, PadTapAction } from './padProtocol.ts';

/** What a control sends: a tap (an input action pressed once), a hold (pressed while a finger is on it), or a command
 *  the input actions have no id for (Watch's tank picks, a call-in past the third). */
export type PadSend =
  | { tap: PadTapAction }
  | { hold: PadHoldAction }
  | { cmd: PadCommand; n?: number };

export interface PadControl {
  /** Unique within a mode; also the bit name the desktop's `a` mask grants (padActBit) when `optional`. */
  id: string;
  send: PadSend;
  /** The glyph's sprite id (src/ui/icons/spriteIndex.ts) and its name's i18n key. */
  glyph: string;
  label: string;
  /** The key's own short word where the full name (`label`, its accessible name) would not fit a thumb key. */
  short?: string;
  /** Shown only when the desktop grants it (the status's `a`): a vehicle's own kit, a mode's grants. */
  optional?: boolean;
  /** Lit while the desktop's status says so. */
  lit?: 'sniper' | 'lock';
}

/** What the two thumbs and FIRE mean in a mode (their names, for the guide and assistive tech). */
export interface PadThumbs {
  /** The left stick: i18n key of its name; null where it moves nothing. */
  stick: string | null;
  /** The right area: i18n key; null where it aims nothing. */
  aim: string | null;
  /** FIRE: its glyph and name, or null where there is nothing to fire. */
  fire: { glyph: string; label: string; hold: PadHoldAction } | null;
}

export interface PadModeLayout {
  thumbs: PadThumbs;
  /** The special columns along the left and right edges, top to bottom. */
  left: PadControl[];
  right: PadControl[];
  /** Under the left thumb, beside the stick (brake, climb). */
  stickKeys: PadControl[];
  /** Over FIRE, under the right thumb (scope, look, zoom). */
  fireKeys: PadControl[];
  /** The centre deck: the rounds (filled from the status's shells) or the call-ins. */
  deck: 'shells' | PadControl[] | null;
  /** The line the deck shows when the mode has nothing to drive (an i18n key). */
  note?: string;
}

const tap = (id: PadTapAction, glyph: string, label: string, extra: Partial<PadControl> = {}): PadControl =>
  ({ id, send: { tap: id }, glyph, label, ...extra });
const hold = (id: PadHoldAction, glyph: string, label: string, extra: Partial<PadControl> = {}): PadControl =>
  ({ id, send: { hold: id }, glyph, label, ...extra });
const cmd = (id: string, c: PadCommand, glyph: string, label: string, n?: number, extra: Partial<PadControl> = {}): PadControl =>
  ({ id, send: n === undefined ? { cmd: c } : { cmd: c, n }, glyph, label, ...extra });

const FIRE = { glyph: 'fireGun', label: 'pad.fire', hold: 'fire' } as const;

// the tank's controls, shared by the tank and the seat Watch hands over
const SURVIVAL: PadControl[] = [
  tap('consumable1', 'repair', 'action.consumable1', { optional: true, short: 'pad.key.repair' }),
  tap('consumable2', 'medkit', 'action.consumable2', { optional: true, short: 'pad.key.medkit' }),
  tap('consumable3', 'extinguisher', 'action.consumable3', { optional: true, short: 'pad.key.extinguisher' }),
  tap('smoke', 'smoke', 'systems.smoke', { optional: true }),
  tap('selfRight', 'rocket', 'hud.jump', { optional: true }),
];
const SYSTEMS: PadControl[] = [
  tap('autoAim', 'autoAim', 'pad.lock', { optional: true, lit: 'lock' }),
  tap('strikeView', 'modeAirSupport', 'airSupport.view', { optional: true, short: 'pad.key.support' }),
  tap('drone', 'modeDrone', 'systems.drone', { optional: true }),
  tap('atgm', 'missileRack', 'systems.atgm', { optional: true }),
  tap('roofGun', 'roofGun', 'systems.roofGun', { optional: true }),
  tap('specialAction', 'track', 'vehicleActions.suspension', { optional: true }),
  tap('reloadMagazine', 'autoloader', 'vehicleActions.reload', { optional: true }),
  tap('lights', 'lightbulb', 'systems.lights', { optional: true }),
  tap('hitboxOverlay', 'toolHitbox', 'action.hitboxOverlay', { optional: true, short: 'pad.key.armor' }),
  tap('rangeReset', 'undo', 'action.rangeReset', { optional: true, short: 'pad.key.reset' }),
  tap('rangeMoving', 'shuffle', 'action.rangeMoving', { optional: true, short: 'pad.key.moving' }),
  cmd('watchSeat', 'watchSeat', 'player', 'pad.watch.leave', undefined, { optional: true }),
];
const SCOPE_KEYS: PadControl[] = [
  tap('sniperToggle', 'scope', 'pad.scope', { lit: 'sniper' }),
  hold('freeLook', 'freeLook', 'pad.look'),
  // (the keys fill from the trigger's side, so zoom in comes first to read − + across)
  tap('zoomIn', 'zoomIn', 'pad.zoomIn', { optional: true }),
  tap('zoomOut', 'zoomOut', 'pad.zoomOut', { optional: true }),
];

const STRIKE_GLYPHS = ['strikeRecon', 'strikeArtillery', 'strikeStrafe', 'strikeBomb', 'modeAc130'] as const;
// (each name a whole key: the page's catalog carries the keys its modules spell out, tools/i18n-page-catalogs.mjs)
const STRIKE_NAMES = ['airSupport.short.recon', 'airSupport.short.artillery', 'airSupport.short.strafe', 'airSupport.short.bomb',
  'airSupport.short.gunship'] as const;

export const PAD_LAYOUTS: Readonly<Record<PadMode, PadModeLayout>> = Object.freeze({
  // nothing to drive: the menus, the Garage, a battle's report, a pause
  idle: { thumbs: { stick: null, aim: null, fire: null }, left: [], right: [], stickKeys: [], fireKeys: [], deck: null, note: 'pad.waitingBattle' },
  // a tank in battle (also the seat Watch hands over, with Leave on the right)
  tank: {
    thumbs: { stick: 'pad.tour.stick', aim: 'pad.aimPad', fire: FIRE },
    left: SURVIVAL,
    right: SYSTEMS,
    stickKeys: [hold('handbrake', 'handbrake', 'pad.brake')],
    fireKeys: SCOPE_KEYS,
    deck: 'shells',
  },
  // Air Support's binoculars: the right thumb lays the reticle on the ground, FIRE calls the strike, the deck picks the
  // call-in; the left thumb keeps driving (the crew drives on under the binoculars)
  strike: {
    thumbs: { stick: 'pad.tour.stick', aim: 'pad.strike.aim', fire: { glyph: 'modeAirSupport', label: 'airSupport.call', hold: 'fire' } },
    left: [],
    right: [cmd('strikeClose', 'strikeClose', 'close', 'airSupport.lower', undefined, { short: 'pad.key.lower' })],
    stickKeys: [hold('handbrake', 'handbrake', 'pad.brake')],
    fireKeys: [tap('zoomIn', 'zoomIn', 'pad.zoomIn'), tap('zoomOut', 'zoomOut', 'pad.zoomOut')],
    deck: STRIKE_NAMES.map((name, n) => cmd(`strike${n + 1}`, 'strikePick', STRIKE_GLYPHS[n]!, name, n)),
  },
  // the drone (sim/aerialCombat.ts): the left stick flies it (back is slower, sideways strafes), the right thumb looks and
  // the drone flies where it looks (look down to descend), climb under the left thumb; it has no gun (it is the warhead),
  // so FIRE stands down; its view and the key that brings it home down the right
  drone: {
    thumbs: { stick: 'pad.fly', aim: 'pad.look', fire: null },
    left: [],
    right: [tap('aerialVision', 'visionInfrared', 'flight.view.action', { short: 'pad.key.view' }), tap('drone', 'modeDrone', 'pad.drone.home', { short: 'systems.drone.return' })],
    stickKeys: [hold('handbrake', 'moveForward', 'flight.climb')],
    fireKeys: [],
    deck: null,
  },
  // the AC-130: it flies its own orbit (no stick); the right thumb lays the guns, FIRE fires (held, full-auto), the deck
  // picks the gun (the shell keys), the zoom keys step the optics (never sniperToggle, which steps every frame it reads
  // down: aerialCamera.ts); the drops and the view down the right
  gunship: {
    thumbs: { stick: null, aim: 'pad.aimPad', fire: FIRE },
    left: [],
    right: [
      tap('aerialVision', 'visionInfrared', 'flight.view.action', { short: 'pad.key.view' }),
      tap('supplyAmmo', 'ammoRack', 'flight.supply.ammo', { optional: true, short: 'pad.key.ammoDrop' }),
      tap('supplyHeal', 'medkit', 'flight.supply.heal', { optional: true, short: 'pad.key.healDrop' }),
    ],
    stickKeys: [],
    fireKeys: [tap('zoomIn', 'zoomIn', 'pad.zoomIn'), tap('zoomOut', 'zoomOut', 'pad.zoomOut')],
    deck: 'shells',
  },
  // Watch (game/watchController.ts): the left stick moves the spectator drone, the right thumb looks; climb, descend and
  // boost are holds (the input layer's handbrake, reloadMagazine and sniperToggle, read with isDown), the zoom keys step
  // its speed; the tank picks down the right (the controller's own calls, as the touch bar's)
  watch: {
    thumbs: { stick: 'pad.watch.move', aim: 'pad.look', fire: null },
    left: [
      hold('handbrake', 'moveForward', 'flight.climb'),
      hold('reloadMagazine', 'moveBack', 'pad.watch.descend'),
      hold('sniperToggle', 'speed', 'pad.watch.boost'),
    ],
    right: [
      cmd('watchPrev', 'watchPrev', 'stepBack', 'pad.watch.prev'),
      cmd('watchNext', 'watchNext', 'stepForward', 'pad.watch.next'),
      cmd('watchRide', 'watchRide', 'vehicle', 'pad.watch.ride'),
      cmd('watchDrone', 'watchDrone', 'modeDrone', 'pad.watch.drone', undefined, { optional: true }),
      tap('autoAim', 'autoAim', 'pad.lock', { lit: 'lock' }),
      cmd('watchSeat', 'watchSeat', 'player', 'pad.watch.take', undefined, { optional: true }),
    ],
    stickKeys: [],
    fireKeys: [tap('zoomIn', 'zoomIn', 'pad.watch.faster'), tap('zoomOut', 'zoomOut', 'pad.watch.slower')],
    deck: null,
  },
  // destroyed: nothing drives; the killcam's replay can be skipped, and a spectator's camera steps from tank to tank
  dead: {
    thumbs: { stick: null, aim: null, fire: null },
    left: [],
    right: [
      cmd('killcamSkip', 'killcamSkip', 'chevronRight', 'killcam.skipReplay', undefined, { optional: true }),
      cmd('spectatePrev', 'spectatePrev', 'stepBack', 'pad.watch.prev', undefined, { optional: true }),
      cmd('spectateNext', 'spectateNext', 'stepForward', 'pad.watch.next', undefined, { optional: true }),
    ],
    stickKeys: [],
    fireKeys: [],
    deck: null,
    note: 'pad.destroyed',
  },
});

/** Every optional control's grant bit, in one fixed order (the desktop's `a` mask; padLayout.selftest pins it fits). */
export const PAD_ACTS = [
  'consumable1', 'consumable2', 'consumable3', 'smoke', 'selfRight', 'autoAim', 'strikeView', 'drone', 'atgm', 'roofGun',
  'specialAction', 'reloadMagazine', 'lights', 'hitboxOverlay', 'rangeReset', 'rangeMoving', 'watchSeat', 'zoomOut',
  'zoomIn', 'supplyAmmo', 'supplyHeal', 'watchDrone', 'killcamSkip', 'spectatePrev', 'spectateNext',
] as const;

export const padActBit = (id: string): number => {
  const at = (PAD_ACTS as readonly string[]).indexOf(id);
  return at < 0 ? 0 : 1 << at;
};

export const padActGranted = (mask: number, id: string): boolean => (mask & padActBit(id)) !== 0;

/** A mode's controls as this player has them: the optional ones the mask grants, the rest always. */
export function padVisible(controls: readonly PadControl[], mask: number): PadControl[] {
  return controls.filter((control) => !control.optional || padActGranted(mask, control.id));
}
