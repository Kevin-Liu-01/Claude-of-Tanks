import { layoutViewportSize } from './responsiveLayout.ts';
import { ensureStyle } from './styleLayers.ts';
import {
  mouseAlertBox, mouseMedalWaits, mouseNoticeStackBand, planMouseNotices, type MouseNoticeInput, type MouseNoticePlan, type PlanLane,
  type PlanRect,
} from './mouseNoticePlan.ts';
import { scratchCanvas } from './uiCanvas.ts';
import { addPlateObstacle, addSightFurniture, addSightNoticeCut, clearSightFurniture, setSightNotice, settleSightFurniture } from './sightFurniture.ts';
import { battleSightShift, onBattleSightShift, publishBattleBands, type BattleBandBox } from './battleSight.ts';
import { planTouchNotices, TOUCH_COMPACT_ALERT, TOUCH_COMPACT_NOTICE, TOUCH_NOTICE_GAP, TOUCH_ONE_ROW, type TouchBox, type TouchSize } from './touchNoticePlan.ts';

/** A resize whose sizes arrive closer than this is still in progress. */
const RESIZE_SETTLE_MS = 150;
/** The phone-width network strip's folded ping (multiplayerStatus.ts), at most. */
const PHONE_STRIP_WIDTH = 96, PHONE_STRIP_HEIGHT = 30;
/** A measured box, as getBoundingClientRect gives one. */
type PlanBox = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
/** The scope flag hud.ts sets on the document element (not on the observed HUD root: a scope toggle relayouts nothing,
 *  unless a queued medal card waits on it). */
const SCOPED_ATTRIBUTE = 'data-cot-scoped';

/** The scoreboard polygon's bottom corners (its 16 px slants, hud.ts .cot-top); the objective clears each by 8px. */
const SCORE_BOTTOM_INSET = 16;
/** The objective's width under the desktop plate: the panel keeps its measure under the direction's wider score. */
const OBJECTIVE_MAX_W = 278;
/** The objective tab's padding and glyph's share of its width (battleHudLayout.css). */
const OBJECTIVE_CHROME_W = 70;
/** A copy's width at the objective's 11 px caps: about 7.5 px a Latin letter or figure, 13 a Chinese character. */
function objectiveCopyWidth(copy: string): number {
  let width = 0;
  for (const char of copy) width += /[\u3000-\u9fff\uff00-\uffef]/.test(char) ? 13 : /\s/.test(char) ? 3.5 : 7.5;
  return width;
}
/** How far a copy on one line may run into the tab's 22 px side padding before it wraps or stacks: 6 px or more from the
 *  slanted edge at its line's height. */
const OBJECTIVE_COPY_SLACK = 4;
let copyMeasure: CanvasRenderingContext2D | null | undefined;
/** Whether a copy on one line runs past the tab's cell at its width: measured in the copy's own type where a canvas can
 *  measure it, estimated where none can (Node). The estimate's 7.5 px a letter wrapped FIRST TO 3 FLAGS, 97 px over a
 *  96 px cell at 568x256, which sent the detection onto the hull panel (gauntlet r17). */
export function objectiveCopyOver(node: Element | null | undefined, copy: string, width: number): boolean {
  const cell = width - OBJECTIVE_CHROME_W;
  if (copyMeasure === undefined) {
    // (an offscreen measure: uiCanvas.ts's scratchCanvas, the one maker of offscreen canvases; uiCanvasCensus.selftest)
    const canvas = typeof document !== 'undefined' && typeof document.createElement === 'function' ? scratchCanvas(1, 1) : null;
    const context = typeof canvas?.getContext === 'function' ? canvas.getContext('2d') : null;
    copyMeasure = typeof context?.measureText === 'function' ? context : null;
  }
  const style = copyMeasure && node && typeof getComputedStyle === 'function' ? getComputedStyle(node) : null;
  if (!copyMeasure || !style?.font) return objectiveCopyWidth(copy) > cell;
  copyMeasure.font = style.font;
  const measured = copyMeasure.measureText(copy).width + (parseFloat(style.letterSpacing) || 0) * copy.length;
  return Number.isFinite(measured) ? measured > cell + OBJECTIVE_COPY_SLACK : objectiveCopyWidth(copy) > cell;
}
export function objectiveWidth(scoreWidth: number): number {
  return Math.max(0, Math.min(OBJECTIVE_MAX_W, scoreWidth - 2 * (SCORE_BOTTOM_INSET + 8)));
}
/** The team strip's gap under the score, and the objective's under the strip (hudTeamPips.ts: the direction's pips sit
 *  6 px under the plate). */
const PIPS_GAP = 6;
/** The mission plate's corner seat (brand-ui H3, the direction's .mission at 16, 14): the mouse layouts the team strip
 *  shows on, where the plate keeps CORNER_GAP from the score; battleHudLayout.css data-objective-seat=corner. */
const CORNER_GAP = 12;
const WIDE_TOP_WIDTHS = new Set(['laptop', 'desktop']);
const WIDE_TOP_HEIGHTS = new Set(['standard', 'tall']);
const wideTop = (touch: boolean) => !touch && WIDE_TOP_WIDTHS.has(document.body.dataset.cotWidth ?? '')
  && WIDE_TOP_HEIGHTS.has(document.body.dataset.cotHeight ?? '');

export const MAX_BATTLE_NOTIFICATIONS = 8;
/** Whole 26px rows, separated by 3px, within the available lane (a stacked lane's rows: FEED_STACK_PITCH). */
export function battleNotificationRows(height: number, count = MAX_BATTLE_NOTIFICATIONS, pitch = 29): number {
  return Math.min(MAX_BATTLE_NOTIFICATIONS, Math.max(0, count), Math.max(0, Math.floor((height + 3) / pitch)));
}
/** A touch global feed narrower than this stacks each kill row, the killer over the cause and the victim
 *  (battleHudLayout.css [data-stack]): side by side its two callsigns kept under twelve characters, "Command…", gauntlet
 *  r8 at 390x844; and fourteen take 98 px each beside the cause, so 210 px at 568x256 read "Commander_…", r10. */
const FEED_STACK_W = 244;
/** A stacked row (38 px: the killer's line, the cause and the victim's) and the lane's 3 px gap. */
const FEED_STACK_PITCH = 41;

/** Keep space for kill notices and the side's combat readout. */
export function battleRosterHeight(viewportHeight: number, available: number, minimum = 48, count = 0, expanded = false): number {
  const space = Math.max(0, available);
  if (count > 0 && count <= 14) {
    // (the lanes keep 112 px, or what the roster at its least rows leaves them, never under LANE_LEAST)
    const least = 22 + count * rosterRowLeast(count);
    const reserve = Math.min(232, Math.max(LANE_LEAST, Math.min(112, space - least), space - (22 + count * 16)));
    const wanted = 22 + count * (expanded ? 30 : 24);
    return Math.min(space, Math.max(Math.min(22, space), Math.min(wanted, space - reserve)));
  }
  return Math.min(space, Math.max(minimum, Math.min(viewportHeight * .28,
    space - 92 - Math.min(240, space * .45))));
}

/** Bounded side lanes. Reflow on UI/viewport changes, never in the render loop. */
export function battleSideStack(height: number, chat: boolean, toastCount: number) {
  const available = Math.max(0, height);
  const chatReserve = chat ? 62 : 0;
  const toastRows = battleNotificationRows(available - chatReserve - (chat ? 8 : 0), toastCount);
  const toastHeight = toastRows ? toastRows * 29 - 3 : 0;
  const gap = toastHeight && chat ? 8 : 0;
  return { toastRows, toastHeight, chatOffset: toastHeight + gap,
    chatHeight: Math.max(0, available - toastHeight - gap) };
}

export const REPORT_MAP_GAP = 12;
/** The network strip's corner row (multiplayerStatus.ts: `top:8px`, level with the fps/ping plate) and its edge gap. */
const NETWORK_CORNER_TOP = 8;
const NETWORK_CORNER_RIGHT = 10;
const NETWORK_PLATE_TUCK = 12;
/** A bottom-anchored report budget; notification counts never enter this policy. */
/** The shortest dock the shot report is moved down to (a tight card: its rows hidden, its plans scaled to the dock). */
const REPORT_DOCK_MIN = 140;
/** A roster row's least height (its line and its gap: 12 px rows touched one another), and a dense roster's (more than
 *  ten a side, hud.ts .cot-ear.dense: 11 px type, no pads), so fourteen a side fit 1024x600's left column whole (the
 *  layout receipt: a cut roster scrolls). */
const ROSTER_ROW_MIN = 16, ROSTER_ROW_DENSE = 13;
const rosterRowLeast = (count: number) => count > 10 ? ROSTER_ROW_DENSE : ROSTER_ROW_MIN;
/** The side lanes' least room under a roster at its least rows: two kill rows. */
const LANE_LEAST = 60;
/** The least dock that reads (the layout receipt's readable combat report): where the feed's room between the right
 *  roster and the report leaves it less, the feed gives way to the report. */
const REPORT_READABLE = 100;
/** The "+N" line a cut roster ends with, and the gap over it (battleHudLayout.css .cot-ear[data-more]). */
const ROSTER_MORE_H = 17;
/** A roster's head row (battleHudLayout.css: the rows take the roster's height less it). */
const ROSTER_HEAD_H = 22;

export function battleReportDock(bottom: number, ceiling: number, compact: boolean) {
  const height = Math.min(compact ? 160 : 260, Math.max(0, bottom - ceiling));
  return { top: bottom - height, height, bottom };
}

/** The controls strip's place (settings.ts .cot-hints): centred over the systems row and its rack (`centre`), its bottom
 *  8 px over the row (`bottom`), at most as wide as it can be there 16 px from the lower corners' instruments that rise
 *  into its band (and at least 240 px: below that it wraps to three rows anyway). Where they leave the rack's centre less,
 *  it fills the gap between them instead, beside the instrument on its left, their bottoms level (gauntlet r3: at 900x700
 *  it sat 10 px from the speedometer, its edges on nothing; at 1024x600 centred on the window, 9 px off the rack's). */
function hintsPlace(width: number, height: number, corners: readonly (DOMRect | null)[], centre: number, bottom: number) {
  let left = 16, right = width - 16;
  let beside: DOMRect | null = null;
  for (const box of corners) {
    // (a box reaching into the lower half counts: the large map's top above the middle let the ribbon run 4 px from it
    // at 1280x720, gauntlet r5)
    if (!box || box.width < 1 || box.bottom < height / 2) continue;
    if (box.right < width / 2) {
      if (box.right + 16 > left) { left = box.right + 16; beside = box; }
    } else if (box.left > width / 2) right = Math.min(right, box.left - 16);
  }
  const half = Math.min(centre - left, right - centre);
  if (half * 2 >= 240) return { width: Math.floor(half * 2), x: centre, bottom };
  return { width: Math.max(240, Math.floor(right - left)), x: (left + right) / 2,
    bottom: beside && beside.bottom < bottom ? beside.bottom : bottom };
}

/** How far right a lower gap's left edge moves to start on a control's edge under it (the cells' gap, and a little). */
const CELL_SNAP = 8;
/** The reticle's band around the screen-centre sight (hud.ts paints it at the centre): above, the dispersion ring
 * (RET_CEIL_FRAC caps it near 58 px on a phone); below, the reload countdown under the autoloader rack, the struck
 * empty round and the aim warning (battleHudLayout.css: 50% + 48 px, 24 px tall). Through the scope the ammunition
 * readout and zoom plate run lower (hud.ts sniperAmmoReadoutY: up to 108 px down, the plate 24 px under it). */
export const SIGHT_BAND_ABOVE = 64;
export const SIGHT_BAND_BELOW = 80;
export const SCOPE_BAND_BELOW = 140;
/**
 * Owner 2026-10-17 (out of ammo, critic r3): a portrait phone parks the systems row above its ammo tray, which on
 * tall phones lands it across the sight — the countdown, the rack and the struck empty round painted over its labels.
 * A row crossing the sight's band moves below the scope's band too when the lower cluster leaves room above `floor`,
 * else above the ring when it fits below `ceiling` (the map, the touch chrome), else it stays. A row already clear of
 * the sight keeps its place (a tablet's row sits under the battle furniture, where it always was). `sightY`: the battle
 * sight's y where the chase framing raises it over the centre (battleSight.ts); the scope's band stays on `centerY`.
 */
export function portraitSightClearTop(top: number, height: number, centerY: number, floor: number, ceiling: number,
  sightY = centerY): number {
  if (top >= sightY + SIGHT_BAND_BELOW || top + height <= sightY - SIGHT_BAND_ABOVE) return top;
  const below = Math.max(centerY + SCOPE_BAND_BELOW, sightY + SIGHT_BAND_BELOW);
  if (below + height <= floor) return below;
  const above = Math.min(centerY, sightY) - SIGHT_BAND_ABOVE - height;
  return above >= ceiling ? above : top;
}

/**
 * The most the battle sight may rise over the centre (the chase framing's lens shift, battle-camera-264) before a portrait
 * phone's systems row, seated off the sight by portraitSightClearTop, would stop moving over the ring and stay over the
 * tank under the risen sight, or would find no place over it: the row at its own place `top`, `height` tall, the band
 * over the sight ending at `ceiling` (the map, the touch chrome). A row under the band never moves for the sight.
 */
export function portraitSightRiseCap(top: number, height: number, centerY: number, ceiling: number): number {
  if (top >= centerY + SIGHT_BAND_BELOW) return Infinity;
  // (until the band reaches it a row over the sight stays; once it does, the row moves over the ring while the band
  // still crosses it and its place there stays under the ceiling)
  const untouched = centerY - SIGHT_BAND_ABOVE - (top + height);
  const moved = Math.min(centerY + SIGHT_BAND_BELOW - top - 1, centerY - SIGHT_BAND_ABOVE - height - ceiling);
  return Math.max(0, untouched, moved);
}

/** The touch warning chip wherever it shows: the reticle's mark under the sight (data-seat, hud.ts), or the kit's notice
 *  where a layout parks it off the sight (the battle's region, UI-LOCKDOWN B14: hud.ts syncAimNotice). */
const AIM_CHIP = '.cot-aim-warning:not([hidden]),.cot-battle-notices .cot-aim-notice';
/** What the reticle's marks keep clear of (sightFurniture.ts): the HUD panels and controls that can sit near the sight. The
 *  touch warning chip the reticle seats under the sight itself (data-seat, hud.ts) is one of the reticle's marks. A shot
 *  report, the open combat log and the centre notices are passing overlays the reticle never dodges, or its marks would
 *  jump as they come and go (only the vision switch keeps clear of the right lane's: seatScopeVision). */
/** How much further than the reticle's 3 px gap its marks keep from a round touch control (publishSightFurniture). */
const ROUND_CONTROL_PAD = 5;
const SIGHT_FURNITURE = ['.cot-vehicle-controls>button', '.cot-shell', '.cot-con', '.cot-touch.on .round', '.cot-touch.on .joy',
  '.cot-touch.on .quick', '.cot-dp', '.cot-drive', '.cot-minimap', '.cot-top', '.cot-pips.show', '.cot-mode-status.show',
  '.cot-scope-vision', '.cot-aim-warning:not([hidden]):not([data-seat])', '.cot-battle-notices .cot-aim-notice', '.flight-identity',
  '.cot-ear'].join(',');
/** What the world plates keep clear of besides that furniture (sightFurniture.ts plateObstacles): Watch's and the
 *  spectator's bars, the network strip; and the kill feed's rows, which give way to the target plate (FEED_ROWS). */
const PLATE_OBSTACLES = '.cot-watch:not([hidden]),.cot-spec,.cot-mp-status.battle';
const FEED_ROWS = '.cot-kill-lane .cot-kf:not(.out)';
/** The bottom chrome the chase framing keeps the player's hull and tracks over (battle-camera-264: engine/chaseFraming.ts,
 *  through battleSight.ts): what never moves with the sight. A portrait touch layout seats its systems row off the sight
 *  (portraitSightClearTop), so there the row (CHASE_FLOOR_SYSTEMS) counts only where it stands under the sight's band,
 *  and the first battles' controls strip counts while it shows (publishBattleBandsNow). */
const CHASE_FLOOR = '.cot-shell,.cot-con,.cot-shells,.cot-cons,.cot-dp,.cot-drive,.cot-minimap,.cot-touch.on .round,'
  + '.cot-touch.on .joy,.cot-touch.on .quick,.cot-touch.on .fire,.cot-touch.on .autoaim,.cot-touch.on .scope';
const CHASE_FLOOR_SYSTEMS = '.cot-vehicle-controls>button';
/** The head band over the centre column the risen sight keeps its widest ring under (the score and objective, the team
 *  strip; a portrait phone's touch chrome and map where they cross it). */
const CHASE_CEILING = '.cot-top,.cot-mode-status.show,.cot-pips.show,.cot-touch.on .mobile-chrome,.cot-minimap';
/** The column the head band is measured over, either side of the centre line. */
const CHASE_CEILING_HALF = 60;
/** What a touch layout's centre notices, countdown and medal card keep clear of besides the reticle's footprint
 *  (touchNoticePlan.ts): the controls, the ammunition and consumables, the instruments, the vision plate, the warning
 *  chip (seated or parked) and a shot report or open combat log (the systems row by its new place); and the score and
 *  the objective, the rosters, the network readouts and the feed lanes (`soft`; the map apart, touchNoticePlan `map`). */
const TOUCH_NOTICE_OBSTACLES = '.cot-vehicle-controls>button,.cot-shell,.cot-con,.cot-touch.on .round,.cot-touch.on .joy,'
  + '.cot-touch.on .quick,.cot-dp,.cot-drive,.cot-scope-vision,'
  + `${AIM_CHIP},.flight-identity,.cot-touch.on .mobile-chrome,.cot-touch.on .autoaim,`
  + '.cot-touch.on .scope,.cot-touch.on .fire,.cot-shells,.cot-cons,.cot-si-cardhost:not(:empty),.cot-si-log.open,'
  // (Watch's bar where it rides on the floor: watchHud.ts)
  + '.cot-watch:not([hidden])';
/** The round buttons' labels hung under them (r10g: the alert sat on AUTO AIM and SCOPE at 375x667; touchNoticePlan
 *  `labels`). */
const TOUCH_NOTICE_LABELS = '.cot-touch.on .round>.lb';
const TOUCH_NOTICE_SOFT = '.cot-top,.cot-pips.show,.cot-mode-status.show,.cot-ear,.cot-net,.cot-mp-status.battle,'
  + '.cot-si-toasthost,.cot-room-chat:not([hidden]),.cot-spec.show';
/** The alert's height while none shows (two lines at the touch type size in the detection's width), so places hold. */
const TOUCH_ALERT_RESERVE_H = 40;
/** The compact alert's two lines of 8 px type (battleHudLayout.css data-touch-notices~='alert-compact', 28 px at the
 *  least), its planned height until one shows. */
const TOUCH_COMPACT_ALERT_LINES_H = 28;
/** Half the centre column a touch landscape's kill lanes leave the notices: a compact notice and its gaps (battleHudLayout.css
 *  --hud-message-width keeps the same 74 px). At 844 x 390 a lane's row crossed the centre line wherever a notice stood
 *  over the sight. */
const TOUCH_CENTRE_HALF = TOUCH_COMPACT_NOTICE.w / 2 + TOUCH_NOTICE_GAP;
/** Below this height a portrait phone's systems row leaves the band over the sight for the top slot (r10g). */
const PORTRAIT_SIGHT_ROOM_H = 720;
/** Where a touch layout parks the gun travel chip under the map instead of seating it by the sight (hud.ts
 *  touchWarningSeated): a short landscape, and a portrait phone 340 px wide or less (r10g: every seat by the sight met the
 *  left FIRE button, the map or the speedometer at 320x568). */
const touchChipParked = (width: number, height: number) => (width > height && height < 550) || (height >= width && width <= 340);
/** A short landscape at most this tall (touch) seats the objective under the map in its compact form, its progress
 *  alone (the mode's name in its title), where the left column holds it over the joystick: the centre column then holds
 *  the notices from under the score (at 568x290 the panel under the score left them no clear place). Where the column
 *  is too short (568x256) the panel stays under the score. battleHudLayout.css data-objective-seat. */
const OBJECTIVE_COMPACT_H = 340;
/** The layout variables that place an element on the centre line, written unrounded. */
const CENTRING_VARS = new Set(['objective-top', 'objective-left', 'systems-left']);
/**
 * (local-fps-265) The layout variables only a side panel reads (the proving range card, the room chat), written on one
 * rule over those panels (PANEL_VAR_SCOPE) instead of the body. A custom property written on the body restyles every
 * element under it (1,310 in a 1280x720 battle, ~10 ms a write on a loaded machine), and the left lane's height steps
 * 3 px each time the vehicle status strip comes or goes (the player concealed in a bush, then spotted: in a solo battle
 * about twice a second, with neither panel in the document).
 */
const PANEL_VARS = new Set(['left-height', 'chat-height']);
const PANEL_VAR_SCOPE = '.cot-range-card,.cot-room-chat';
const PANEL_VAR_STYLE_ID = 'cot-hud-panel-vars';
/** The declaration of the panels' rule (its style element made once a document), or null where the document has no
 *  style sheets (the Node receipts' stand-ins): the body then carries them, as before. */
function panelVarDeclaration(): CSSStyleDeclaration | null {
  if (typeof document.getElementById !== 'function' || !document.head) return null;
  const sheet = ensureStyle(PANEL_VAR_STYLE_ID, `${PANEL_VAR_SCOPE}{}`, 'surfaces').sheet;
  const layer = sheet?.cssRules[sheet.cssRules.length - 1] as CSSLayerBlockRule | undefined;
  return (layer?.cssRules?.[0] as CSSStyleRule | undefined)?.style ?? null;
}
/** A portrait phone's signal tile keeps this far from the touch chrome beside it (properties' network-left). */
const NETWORK_TILE_GAP = 6;
/** The rosters' row pitch steps where they have room (snapRosterHeight). */
const ROSTER_PITCH_STEP = 4;
/** A short landscape's joystick and its gutter under it, from the window's foot (touchControls.ts: 108 px over 24). */
const TOUCH_JOY_FOOTPRINT = 132;
/** The parked warning's height at the most, its words on two lines (battleHudLayout.css .cot-aim-notice). */
const PARKED_CHIP_TALL = 48;
/** The side seat's gap under the map, and its least width: the parked warning chip's (battleHudLayout.css), one column. */
const OBJECTIVE_SEAT_GAP = 4;
const PARKED_CHIP_W = 106;
/** A touch target's least side (battle-hud-layout.browser.mjs) and the systems row's gap (battleHudLayout.css). */
const TOUCH_TARGET = 44;
const SYSTEMS_GAP = 3;
// the systems top slot's gap under the touch chrome and its rows' gap (portrait phones; the column's 7 px rhythm)
const SLOT_GAP = 7;
const SLOT_ROW_GAP = 4;
/** The kill ribbon's width (hudKillRibbon.ts), where its place holds it. */
const RIBBON_W = 520;
/** Under this width the ribbon drops its cause chip and its silhouette; under the least it does not show. */
const RIBBON_TIGHT = 480, RIBBON_LEAST = 300;
/** How far past its gap's edge a rack may stand and still lend a strip or a ribbon its edges. */
const RACK_SNAP_INSET = 4;
/** Up to this width the map's large step takes the kill ribbon's room and the right-hand kill feed's beside it. */
const MAP_TAKES_LANES_W = 1024;
/** The map's large step as its plate names it (hud.ts MM_SCALES: data-zoom). */
const MAP_LARGE_STEP = '2';
/** The ribbon's foot over its seat (hudKillRibbon.ts: translate(-50%, calc(-100% - 8px))), the hints plate's 8 px in the
 *  same seat (at 12 its foot stood 4 px over the hull plate's and the speedometer's at 900x700, gauntlet r13), and its
 *  height with the streak's row (44 + 28). */
const RIBBON_LIFT = 8, RIBBON_H = 72;
/** A portrait phone's personal feed under the global one: at most this wide. */
const KILL_LANE_MAX_W = 400;
/** The narrowest map whose width the report over it takes. */
const REPORT_MIN_W = 220;
/** What the shot report docked under the right roster leaves the global feed between them: one kill row and its gaps
 *  (at 32 px the row did not fit, and the feed vanished while a report showed, gauntlet r3 at 1280x720 down to 900x700). */
const REPORT_FEED_ROOM = 8 + 26 + 8;
/** The shot report's head and its line (battleHudLayout.css): under this the dock shows the head alone. */
const MICRO_REPORT_H = 52;
/** Half the centre column a mouse layout's lanes leave the countdown dial: its 164 px over 2, and a gap. */
const DESK_CENTRE_HALF = 100;
/** The narrowest ammo rack the mouse layout's systems row spans (narrower, the row keeps its own width). */
const RACK_FILL_MIN = 160;
/** How far a mouse layout's inline tray keeps from the drive gauge: the damage panel's gap to it (r10f). */
const TRAY_GAUGE_GAP = 12;
/** The sixth-sense notice, which a touch layout's seated warning chip yields to (sightFurniture.ts sightNotice). */
const SIXTH_SENSE = '.cot-sixth.on';
/** The properties whose transition end measures a furniture again (installBattleHudLayout): a fade decides whether it is
 *  furniture at all (shownBox); a slide or a press is measured as it lands by the pass its own change asks for. */
const FURNITURE_SETTLES = new Set(['opacity', 'visibility']);
/** The vertical part of an element's transform, in CSS px (0 when it has none). */
function translationY(node: Element): number {
  const transform = getComputedStyle(node).transform;
  return transform && transform !== 'none' && typeof DOMMatrixReadOnly === 'function' ? new DOMMatrixReadOnly(transform).m42 : 0;
}
/** The notices the kill ribbon steps aside for (yieldKillRibbon). */
const RIBBON_YIELDS = '.cot-sixth.on,.cot-alert.show,.cot-prebattle.on,.cot-revive.on,.cot-hints.show,'
  + '.cot-medal-toasts[data-placement="ready"] .cot-medal-toast';
/** The left lane's feeds, which the scope's vision switch keeps clear of in its mirror seat (seatScopeVision). */
const LEFT_LANE = '.cot-kill-lane.l .cot-kf:not([hidden]),.cot-si-toasthost .cot-si-toast:not([hidden]),.cot-room-chat:not([hidden])';
/** What covers the vision switch's seat right of the sight on a mouse layout (critic r9: under about 1200 px wide): a shot
 *  report's host, which takes the pointer over its whole box while it holds a card, and the open combat log. */
const RIGHT_LANE_COVERS = '.cot-si-cardhost:not(:empty),.cot-si-log.open';
/** (local-fps-266) The screens the layout's queries never look into. In battle the Garage, the icon sprite and the play
 *  screen held 10,221 of the document's 12,028 elements and every one of a pass's ~30 queries walked them (2.9 ms a query
 *  against 0.14 ms under the HUD root; a pass took 20-25 ms, 21 passes in a 25 s drive). None holds a HUD part; the parts
 *  outside the root (.cot-hints, .cot-medal-toasts, the network strip) are body children of their own. */
const HUD_QUERY_SKIPS = '.cot-garage,#cot-icon-sprite,.cot-play';
/** A document stand-in without its body's children (the receipts') is queried whole. */
function hudHosts(): HTMLCollection | null {
  return document.body?.children ?? null;
}
/** hudQueryAll(selector) less the HUD_QUERY_SKIPS screens, in document order: each body child that is not
 *  one of them, then its matches (Element.querySelectorAll matches against the whole document, so a combinator still
 *  reads the ancestors above it). */
export function hudQueryAll<E extends Element = Element>(selector: string): E[] {
  const hosts = hudHosts();
  if (!hosts) return Array.from(document.querySelectorAll<E>(selector));
  const out: E[] = [];
  for (let i = 0; i < hosts.length; i++) {
    const host = hosts[i];
    if (host.matches(HUD_QUERY_SKIPS)) continue;
    if (host.matches(selector)) out.push(host as unknown as E);
    const found = host.querySelectorAll<E>(selector);
    for (let k = 0; k < found.length; k++) out.push(found[k]);
  }
  return out;
}
/** hudQuery(selector) less the HUD_QUERY_SKIPS screens: the first match in document order. */
export function hudQuery<E extends Element = Element>(selector: string): E | null {
  const hosts = hudHosts();
  if (!hosts) return document.querySelector<E>(selector);
  for (let i = 0; i < hosts.length; i++) {
    const host = hosts[i];
    if (host.matches(HUD_QUERY_SKIPS)) continue;
    if (host.matches(selector)) return host as unknown as E;
    const found = host.querySelector<E>(selector);
    if (found) return found;
  }
  return null;
}

export function installBattleHudLayout(root: HTMLElement): void {
  let frame = 0;
  const observed = new Set<Element>();
  const attributes = new WeakMap<Element, Map<string, string | null>>();
  // Relayouts caused only by kill rows, toasts, chat, the shot log and report, the medal card or the notices themselves
  // leave the mouse notice plan's inputs as they were: those reuse the plan without measuring its inputs again.
  let planInputs = true;
  /** Look for new parts to observe on the next pass (a child added to the body or the root, a relayout asked for). */
  let scanParts = true;
  /** Some systems button sits beside the touch chrome (the top slot's overflow: data-slot-beside). */
  let besideMarked = false;
  /** The systems row's tiles stand over the rack's slots (their widths and gaps written on each tile). */
  let tilesOverSlots = false;
  /** A queued medal card whose place clears the battle sight only: the scope flag decides whether it shows. */
  let medalScopeSensitive = false;
  const transientParts = ['cot-kill-lane', 'cot-si-toasthost', 'cot-room-chat', 'cot-si-log', 'cot-si-cardhost', 'cot-medal-toasts', 'cot-sixth', 'cot-alert'];
  const planInput = (target: Element) => { if (!transientParts.some((part) => target.classList?.contains(part))) planInputs = true; };
  const movesPlanInputs = new Set(['fps-top', 'network-top', 'network-corner-right', 'roster-left-height', 'roster-right-height',
    'systems-top', 'systems-width', 'systems-left', 'objective-top', 'objective-bottom', 'objective-width', 'objective-left',
    'report-right', 'flight-right-clearance', 'tray-shift']);
  // A part whose box comes into being (the systems row as the vehicle's controls mount into it) stands hidden until the
  // pass seats it: drawn first where its empty box stood, the row jumped 271 px across a phone's window a frame later as
  // the pass seated it (the loading census, CLS 0.031 at the battle's start). The resize reaches here before that frame
  // paints; the next frame's pass (refresh) shows it, then seats it, before that frame paints.
  const SEATED_ON_ARRIVAL = '.cot-vehicle-controls';
  const sized = new WeakMap<Element, boolean>();
  const seating = new Set<HTMLElement>();
  const resize = new ResizeObserver((entries) => {
    if (entries?.length) {
      for (const entry of entries) {
        planInput(entry.target);
        const has = !!entry.contentRect && entry.contentRect.width > 0 && entry.contentRect.height > 0;
        if (has && sized.get(entry.target) === false && (entry.target as HTMLElement).matches?.(SEATED_ON_ARRIVAL) && (entry.target as HTMLElement).style) {
          const node = entry.target as HTMLElement;
          node.style.setProperty('visibility', 'hidden');
          seating.add(node);
        }
        sized.set(entry.target, has);
      }
    } else planInputs = true;
    schedule();
  });
  // DOMTokenList.remove() still emits an attribute record when the class was
  // already absent (the special-action HUD clears `pending` every frame).
  // A pulse can also remove then re-add the same class within one task. Compare
  // the final delivered value with the previous batch, not each intermediate
  // oldValue. Seed at registration so the very first such batch is a no-op too.
  const changes = new MutationObserver(records => {
    let changed = false;
    for (const record of records) {
      if (record.type === 'childList') { changed = true; scanParts = true; planInput(record.target as Element); continue; }
      const name = record.attributeName;
      if (name === null) continue;
      const target = record.target as Element;
      // the scope flag moves nothing; it matters only to a queued medal card placed clear of the battle sight only
      if (target === document.documentElement) { if (medalScopeSensitive) changed = true; continue; }
      const previous = attributes.get(target);
      const value = target.getAttribute(name);
      // (the body's classes switch the layout, the touch one among them, which changes what is observed)
      if (previous?.get(name) !== value) { changed = true; planInput(target); if (target === document.body) scanParts = true; }
      previous?.set(name, value);
    }
    // Process every record, even after finding a real change, so another
    // watched attribute cannot retain a stale baseline into the next batch.
    if (changed) schedule();
  });
  const watchAttributes = (target: Element, names: string[], childList = false) => {
    let previous = attributes.get(target);
    if (!previous) { previous = new Map(); attributes.set(target, previous); }
    for (const name of names) previous.set(name, target.getAttribute(name));
    changes.observe(target, { attributes: true,
      attributeFilter: names, childList });
  };
  // Mouse relayouts read each fixed instrument once: nothing a relayout writes moves these before it reads them again.
  const steadyReads = new Set(['.cot-dp', '.cot-drive', '.cot-spec.show', '.cot-cons', '.cot-shells', '.cot-minimap', '.cot-si-cardhost',
    '.cot-vehicle-controls', '.cot-vehicle-status:not([hidden])', '.cot-flight-hud:not([hidden]) .flight-console']);
  const readsThisPass = new Map<string, DOMRect | null>();
  let reuseReads = false;
  /** A roster too short for its rows at 16 px holds whole rows only, its last line the count it leaves out ("+3", the
   *  ear's data-more: gauntlet r3 found a 900x700 Watch bar's roster cut to three rows and a sliver, with no cue); a roster
   *  that fits keeps its height. Its height, and the rows it leaves out. */
  const snapRosterHeight = (heightPx: number, selector: string): [number, number] => {
    const count = Number(root.querySelector<HTMLElement>(selector)?.dataset.count) || 0;
    const body = heightPx - ROSTER_HEAD_H;
    // (an icon grid wraps its silhouettes instead)
    const least = rosterRowLeast(count);
    if (!count || root.querySelector(`${selector}.icon-grid`)) return [heightPx, 0];
    // (a roster with room for its rows sets them on a 4 px step, 16 to 24 px (30 expanded), never the room's fraction:
    // spread to its height, a spectating 900x700 roster's rows stood 20.8 px apart, gauntlet r19)
    if (body >= count * least) {
      const most = root.classList.contains('rosters-expanded') ? 30 : 24;
      const pitch = Math.max(least, Math.min(most, Math.floor(body / count / ROSTER_PITCH_STEP) * ROSTER_PITCH_STEP));
      return [Math.min(heightPx, ROSTER_HEAD_H + count * pitch), 0];
    }
    const rows = Math.max(1, Math.floor((body - ROSTER_MORE_H) / least));
    return [ROSTER_HEAD_H + rows * least + ROSTER_MORE_H, Math.max(0, count - rows)];
  };
  const markRosterMore = (selector: string, hidden: number): void => {
    const ear = root.querySelector<HTMLElement>(selector);
    const more = hidden > 0 ? `+${hidden}` : '';
    if (!ear || (ear.dataset.more ?? '') === more) return;
    if (more) ear.dataset.more = more;
    else delete ear.dataset.more;
  };
  const read = (selector: string) => {
    const keep = reuseReads && steadyReads.has(selector);
    if (keep) { const seen = readsThisPass.get(selector); if (seen !== undefined) return seen; }
    const node = hudQuery<HTMLElement>(selector);
    const box = !node || !node.getClientRects().length || getComputedStyle(node).visibility === 'hidden' ? null : node.getBoundingClientRect();
    if (keep) readsThisPass.set(selector, box);
    return box;
  };
  const observe = (selector: string, content = false) => {
    for (const node of hudQueryAll(selector)) {
      if (observed.has(node)) continue;
      observed.add(node);
      resize.observe(node);
      watchAttributes(node, ['class', 'hidden', 'data-count'], content);
    }
  };
  function statusDockBottom(): number | null {
    const panel = read('.cot-dp');
    const strip = read('.cot-vehicle-status:not([hidden])');
    if (!panel || !strip) return null;
    let bottom = panel.top - 5;
    for (const selector of ['.cot-vehicle-controls', '.cot-drive', '.cot-touch.on .joy', '.cot-touch.on .mobile-chrome']) {
      const box = read(selector);
      if (box && strip.left < box.right + 8 && strip.right > box.left - 8
        && bottom > box.top - 8 && bottom - strip.height < box.bottom + 8) bottom = box.top - 8;
    }
    return bottom;
  }
  /** The left lane's floor; `steady`: without the vehicle-status strip (it comes and goes with damage), for the plan. */
  function leftFloor(height: number, touch: boolean, steady = false): number {
    const status = read('.cot-dp');
    return Math.min(height - 12,
      status ? Math.min(status.top - (touch ? 8 : 36), steady ? height : (statusDockBottom() ?? height) - (read('.cot-vehicle-status:not([hidden])')?.height ?? 0)) : height,
      read('.cot-spec.show')?.top ?? height,
      touch ? read('.cot-touch.on .joy')?.top ?? height : height,
      touch ? read('.cot-touch.on .fire.alt')?.top ?? (height <= 340 ? height - 206 : height) : height,
      read('.cot-drive')?.top ?? height) - 8;
  }
  /** The objective's place this pass (`--hud-objective-*`): centred under the score, or its side seat. */
  let objectivePlace = { left: 0, top: 0, width: 0 };
  /** The window and mode the objective last left the side seat for: it stays under the score there, so a count that
   *  gains a digit (a Horde's rounds) moves it once at most, never back and forth. */
  let objectiveTopKey = '';
  /** A side seat measured too tall while the HUD's faces were still loading: their arrival measures it again. */
  let seatAwaitsFaces = false;
  /** Seats the objective (OBJECTIVE_COMPACT_H) and writes its seat and place before the pass reads it: the side seat is
   *  measured in its compact form under the map and kept where it ends over the joystick (the left lane's own floor
   *  reserves a short landscape's hidden second FIRE button); the corner seat is measured as the mission plate in the top
   *  left and kept where it clears the score. 'side', 'corner', or '' (the panel under the score and the team strip). */
  function seatObjective(touch: boolean, width: number, height: number, map: DOMRect | null, score: DOMRect | null,
    pips: DOMRect | null): string {
    const node = hudQuery<HTMLElement>('.cot-mode-status.show');
    objectivePlace = { left: score ? score.left + score.width / 2 : width / 2, top: pips ? pips.bottom + PIPS_GAP : score?.bottom || 64,
      // (the network strip's touch tile stands beside the map, clear of the tab: the 52 px it once took from the tab cut its
      // copy to "CONTROL 2" at 844x390, gauntlet r7)
      width: objectiveWidth(score?.width || 344) };
    let seat = '';
    if (node && score && wideTop(touch)) {
      writeObjective('corner', objectivePlace);
      const box = node.getBoundingClientRect();
      if (box.width > 0 && box.right <= score.left - CORNER_GAP) seat = 'corner';
      else if (document.fonts?.status === 'loading') seatAwaitsFaces = true;
    }
    // (a Standard battle's plate shows only in the corner: battleHudLayout.css .quiet)
    const shown = node && !node.classList?.contains('quiet') ? node : null;
    const key = `${width}x${height}|${shown?.dataset.mode}`;
    if (shown && touch && width > height && height <= OBJECTIVE_COMPACT_H && map && map.left < width / 2 && key !== objectiveTopKey) {
      // (the map's width, so the plate and the map are one column: at the parked chip's 106 px the plate overhung the 84 px
      // map by 22 px at 568x256, gauntlet r13; the chip's width only where a word of the copy does not fit the map's)
      const seatAt = (seatWidth: number) => ({ left: map.left + seatWidth / 2, top: map.bottom + OBJECTIVE_SEAT_GAP, width: seatWidth });
      let place = seatAt(map.width);
      writeObjective('side', place);
      if (shown.scrollWidth > shown.clientWidth + 2 && map.width < PARKED_CHIP_W) {
        place = seatAt(PARKED_CHIP_W);
        writeObjective('side', place);
      }
      // (and over a flight's console: the gunship's weapon cards stood 2.5 px under it at 568x256, gauntlet r11)
      // (the joystick's place where it is hidden, spectating, in Watch or a flight: the seat as the battle's, never one
      // that a hidden stick frees, which seated the spectate bar's and one locale's Watch objective under the map at
      // 568x256 and the rest under the score, gauntlet r18)
      const floor = Math.min(read('.cot-touch.on .joy')?.top ?? height - TOUCH_JOY_FOOTPRINT, read('.cot-touch.on .fire.alt')?.top ?? height,
        read('.cot-flight-hud:not([hidden]) .flight-console')?.top ?? height, height) - 8;
      // (never kept from a measure the HUD's faces have not reached yet: a fallback face wraps wider)
      if (shown.getBoundingClientRect().bottom <= floor) { seat = 'side'; objectivePlace = place; }
      else if (document.fonts?.status !== 'loading') objectiveTopKey = key;
      else seatAwaitsFaces = true;
    }
    writeObjective(seat, objectivePlace);
    return seat;
  }
  function writeObjective(seat: string, place: { left: number; top: number; width: number }) {
    if ((document.body.dataset.objectiveSeat ?? '') !== seat) {
      if (seat) document.body.dataset.objectiveSeat = seat;
      else delete document.body.dataset.objectiveSeat;
    }
    // (as the pass's own write formats them)
    setBodyVar('--hud-objective-top', `${place.top}px`);
    setBodyVar('--hud-objective-left', `${place.left}px`);
    setBodyVar('--hud-objective-width', `${Math.floor(place.width)}px`);
    // A tab too narrow for its parts on one line stacks them (hud.ts setObjectiveValue estimates the same at each copy;
    // the planner decides it again whenever it places the tab, as a copy can land before the tab's width does: gauntlet
    // r3 still read "0 ALIVE" over "· 0/1 SAFE" on the phones).
    const node = hudQuery<HTMLElement>('.cot-mode-status.show');
    const copy = (typeof node?.querySelector === 'function' ? node.querySelector('.mv')?.textContent : '') ?? '';
    if (node?.classList && seat !== 'side') {
      const over = seat !== 'corner' && objectiveCopyOver(node.querySelector?.('.mv') ?? node, copy, place.width);
      node.classList.toggle('stacked', over && copy.includes('·'));
      // (and a copy of one part wraps between its words, as hud.ts setObjectiveValue decides at each copy)
      node.classList.toggle('wraps', over && !copy.includes('·'));
    }
  }
  /** A node's box when it shows (laid out, not hidden or transparent), else null. */
  const shownBox = (node: Element): DOMRect | null => {
    if (!node.getClientRects().length) return null;
    const style = getComputedStyle(node);
    return style.visibility === 'hidden' || style.opacity === '0' ? null : node.getBoundingClientRect();
  };
  const apart = (a: { left: number; top: number; right: number; bottom: number }, b: DOMRect) =>
    Math.max(a.left - b.right, b.left - a.right, a.top - b.bottom, b.top - a.bottom);
  /**
   * The scope's vision switch sits right of the sight on a mouse layout (aerialHud.css). A shot report or the open combat
   * log in the right lane covers that seat on a window under about 1200 px wide (critic r9: 900x700, 640x720, 800x400):
   * the switch then takes the mirror seat left of the sight where that keeps 3 px from every panel and feed there, and
   * otherwise waits hidden until the lane clears (its key still cycles the view). Touch seats it left of the sight already.
   */
  function seatScopeVision(width: number, height: number, touch: boolean): void {
    const vision = hudQuery<HTMLElement>('.cot-scope-vision');
    let seat = '';
    let rise = 0;
    let shift = 0;
    if (vision && !vision.hidden && !touch) {
      const reach = Math.max(Math.min(width, height) * 0.15 + 8, 80);
      const edge = width < 540 ? 112 : 180;
      const w = vision.offsetWidth;
      const h = vision.offsetHeight;
      const right = { left: Math.min(width / 2 + reach, width - edge), top: height / 2 - h / 2, right: 0, bottom: height / 2 + h / 2 };
      right.right = right.left + w;
      let covered = false;
      for (const node of hudQueryAll(RIGHT_LANE_COVERS)) {
        const box = shownBox(node);
        if (box && apart(right, box) < 3) covered = true;
      }
      if (covered) {
        const left = { left: 0, top: right.top, right: Math.max(width / 2 - reach, edge), bottom: right.bottom };
        left.left = left.right - w;
        seat = 'left';
        const boxes: DOMRect[] = [];
        for (const node of hudQueryAll(`${SIGHT_FURNITURE},${LEFT_LANE},.cot-sixth.on,.cot-alert.show`)) {
          if (node === vision || node.contains(vision)) continue;
          const box = shownBox(node);
          if (box) boxes.push(box);
        }
        const met = boxes.filter((box) => apart(left, box) < 3);
        // (a seat met only under its centre rises over what it meets, by half its height at most, and keeps 3 px from every
        // box there too: at 900x700 the hull panel's corner met its foot by 5 px, and the switch waited hidden beside a
        // clear seat, gauntlet r16. It stands on what it rises over, its left edge on that one's and 8 px over it where
        // half its height allows: 12 px into the panel's column and 4 px over its corner, it lined up with nothing, r17)
        if (met.length) {
          const centre = (left.top + left.bottom) / 2;
          const below = met.every((box) => box.top > centre);
          const floor = Math.min(...met.map((box) => box.top));
          shift = below ? Math.max(0, Math.ceil(left.left - Math.max(12, Math.min(...met.map((box) => box.left))))) : 0;
          rise = !below ? Infinity : left.bottom + 8 - floor <= h / 2 ? Math.ceil(left.bottom + 8 - floor) : Math.ceil(left.bottom + 3 - floor);
          const risen = { left: left.left - shift, right: left.right - shift, top: left.top - rise, bottom: left.bottom - rise };
          if (rise > h / 2 || boxes.some((box) => apart(risen, box) < 3)) { seat = 'none'; rise = 0; shift = 0; }
        }
      }
    }
    setBodyVar('--hud-vision-rise', rise ? `${rise}px` : '');
    setBodyVar('--hud-vision-shift', shift ? `${shift}px` : '');
    if ((document.body.dataset.scopeVision ?? '') !== seat) {
      if (seat) document.body.dataset.scopeVision = seat;
      else delete document.body.dataset.scopeVision;
    }
  }
  /** The kill ribbon (hudKillRibbon.ts) holds one place centre low; it steps aside while a notice this pass placed meets
   *  that place (one notice slot, SPEC 12.2.2): the detection, an alert, the countdown, the revive count, a medal card. */
  function yieldKillRibbon(): void {
    const ribbon = root.querySelector<HTMLElement>('.cot-ribbon');
    if (!ribbon) return;
    // (a ribbon that is not showing has nothing to yield: no measure, the pass's late layout read among them; the nav-perf
    // census found this read forcing the layout of every pass between a battle's end and the garage)
    if (!ribbon.classList.contains('on')) {
      if (ribbon.classList.contains('yield')) ribbon.classList.remove('yield');
      return;
    }
    const place = ribbon.getClientRects().length ? ribbon.getBoundingClientRect() : null;
    let meets = false;
    if (place) {
      for (const node of hudQueryAll(RIBBON_YIELDS)) {
        const box = shownBox(node);
        if (box && apart(place, box) < 8) { meets = true; break; }
      }
    }
    if (ribbon.classList.contains('yield') !== meets) ribbon.classList.toggle('yield', meets);
  }
  /** The range that measures a feed row's copy (publishSightFurniture), made once (none in a stub document). */
  let plateRange: Range | null = null;
  /** Measures the furniture the reticle keeps clear of (sightFurniture.ts), once per relayout, on a touch layout the
   *  sixth-sense notice its seated warning chip yields to, and on either the centre notices the scope's arms end short of. */
  function publishSightFurniture(touch: boolean): void {
    clearSightFurniture();
    for (const node of hudQueryAll(SIGHT_FURNITURE)) {
      const box = shownBox(node);
      if (!box) continue;
      // (a round control's ring keeps the reticle's marks the layout's 8 px off, their 3 px gap and ROUND_CONTROL_PAD:
      // the scope's line ended 5 px over the second FIRE's ring at 320x568, gauntlet r14)
      const pad = node.matches?.('.cot-touch.on .round') ? ROUND_CONTROL_PAD : 0;
      addSightFurniture(box.left - pad, box.top - pad, box.right + pad, box.bottom + pad);
    }
    for (const node of hudQueryAll(PLATE_OBSTACLES)) {
      const box = shownBox(node);
      if (box) addPlateObstacle(box.left, box.top, box.right, box.bottom);
    }
    // (each row by its copy's extent, not the lane-wide row box; a row standing aside for the target plate is laid out
    // still, and is published as it is)
    for (const node of hudQueryAll(FEED_ROWS)) {
      if (!node.getClientRects().length) continue;
      plateRange ??= typeof document.createRange === 'function' ? document.createRange() : null;
      plateRange?.selectNodeContents(node);
      const box = plateRange ? plateRange.getBoundingClientRect() : node.getBoundingClientRect();
      addPlateObstacle(box.left, box.top, box.right, box.bottom, true, node);
    }
    // (the notice's settled box: it slides 6 px down as it shows (cotDetectedIn) and fades in from nothing, and a pass can
    // land on any frame of that, its first included; r10e)
    const notice = touch ? hudQuery<HTMLElement>(SIXTH_SENSE) : null;
    if (notice && notice.getClientRects().length && getComputedStyle(notice).visibility !== 'hidden') {
      const box = notice.getBoundingClientRect();
      const slide = translationY(notice);
      setSightNotice(true, box.left, box.top - slide, box.right, box.bottom - slide);
    } else setSightNotice(false);
    // the centre notices the scope's arms end short of, each at its settled place (both slide in)
    for (const node of hudQueryAll<HTMLElement>('.cot-sixth.on,.cot-alert.show')) {
      if (!node.getClientRects().length || getComputedStyle(node).visibility === 'hidden') continue;
      const box = node.getBoundingClientRect();
      const slide = translationY(node);
      addSightNoticeCut(box.left, box.top - slide, box.right, box.bottom - slide);
    }
    settleSightFurniture();
  }
  /** The HUD's bands for the chase framing (battle-camera-264, battleSight.ts): the bottom chrome that never moves with
   *  the sight, the first battles' controls strip while it shows (its seat over the systems row: the chase glides down
   *  once it goes), the head band over the centre column, and how far this layout lets the sight rise. */
  function publishBattleBandsNow(width: number, height: number, touch: boolean,
    hints: { width: number; x: number; bottom: number }, riseCap: number): void {
    const floor: BattleBandBox[] = [];
    const push = (box: { left: number; top: number; right: number; bottom: number } | null) => {
      if (box) floor.push({ x0: Math.floor(box.left), y0: Math.floor(box.top), x1: Math.ceil(box.right), y1: Math.ceil(box.bottom) });
    };
    for (const node of hudQueryAll(CHASE_FLOOR)) push(shownBox(node));
    // (a portrait phone's row by its place this pass: under the sight's band it is the floor's too)
    const rowFloor = touch && width < height ? height / 2 - battleSightShift() + SIGHT_BAND_BELOW : -Infinity;
    for (const node of hudQueryAll(CHASE_FLOOR_SYSTEMS)) {
      const box = shownBox(node);
      if (box && box.top >= rowFloor) push(box);
    }
    // (the strip by its seat, as wide as it may run: its own width changes as its groups are done; transient, the chase
    // keeps its sight where it was and draws back over it)
    const transient: BattleBandBox[] = [];
    const plate = touch ? null : hudQuery<HTMLElement>('.cot-hints.show');
    if (plate?.getClientRects().length) {
      const plateH = plate.getBoundingClientRect().height;
      transient.push({ x0: Math.floor(hints.x - hints.width / 2), y0: Math.floor(hints.bottom - plateH),
        x1: Math.ceil(hints.x + hints.width / 2), y1: Math.ceil(hints.bottom) });
    }
    let ceiling = 0;
    for (const node of hudQueryAll(CHASE_CEILING)) {
      const box = shownBox(node);
      if (!box || box.top > height * 0.45 || box.right < width / 2 - CHASE_CEILING_HALF || box.left > width / 2 + CHASE_CEILING_HALF) continue;
      ceiling = Math.max(ceiling, Math.ceil(box.bottom));
    }
    publishBattleBands({ width: Math.round(width), height: Math.round(height), touch, floor, ceiling,
      ...(transient.length ? { transient } : {}), ...(riseCap < Infinity ? { riseCap: Math.max(0, Math.floor(riseCap)) } : {}) });
  }
  // The multiplayer v2 network strip with every cell shown, measured whenever it is not folded to its ping.
  let networkFullWidth = 0;
  /**
   * The mouse layouts' network strip: bare text in the top-right corner row, left of the fps/ping plate when the
   * plate holds that row, folded to its ping when the row between the score and the corner is too narrow for all of
   * its cells. Returns its right offset. Touch layouts give the strip a lane beside the map instead, and a phone-width
   * mouse window (no corner beside its score) folds it into the right lane under the objective.
   */
  function networkCornerRight(width: number, touch: boolean, telemetry: DOMRect | null, score: DOMRect | null): number {
    const network = hudQuery<HTMLElement>('.cot-mp-status.battle');
    const corner = !touch && document.body.dataset.cotWidth !== 'phone';
    const cells = network && corner ? read('.cot-mp-status.battle .cot-mp-strip') : null;
    if (!network || !cells) return NETWORK_CORNER_RIGHT;
    const folded = network.hasAttribute('data-compact');
    if (!folded) networkFullWidth = cells.width;
    let right = NETWORK_CORNER_RIGHT;
    // (beside the corner plate the strip is the band's next plate, its slanted right edge 4 px off the plate's slanted left
    // one (multiplayerStatus.ts), so its box reaches 12 px under that slant: bare text 16 px off the plate, it was the top
    // row's one datum on no plate, gauntlet r12)
    if (telemetry && telemetry.top < NETWORK_CORNER_TOP + cells.height && telemetry.bottom > NETWORK_CORNER_TOP
      && telemetry.right > width - right - networkFullWidth - 8) right = Math.floor(width - telemetry.left) - NETWORK_PLATE_TUCK;
    const fold = width - right - networkFullWidth < (score?.right ?? width / 2) + 8;
    if (fold !== folded) network.toggleAttribute('data-compact', fold);
    return right;
  }
  function rightFloor(height: number, width: number, map: DOMRect | null): number {
    const ammo = read('.cot-shells');
    const flight = read('.cot-flight-hud:not([hidden]) .flight-console');
    const reportLeft = (map && map.left > width / 2 ? map.right : width - 12) - Math.min(300, width / 2 - 24);
    return Math.min(height - 92,
      flight && flight.right > reportLeft ? flight.top - REPORT_MAP_GAP : height,
      ammo && ammo.left > width / 2 ? ammo.top - 8 : height,
      map && map.left > width / 2 ? map.top - REPORT_MAP_GAP : height,
      read('.cot-spec.show')?.top ?? height,
      width < 768 ? read('.cot-drive')?.top ?? height : height);
  }
  // The mouse plan, cached by its inputs: kill rows, toasts, chat and the notices' own text never enter them, so a
  // burst of kills cannot move a notice. The plan itself is DOM-free (mouseNoticePlan.ts); the last few are kept, so
  // a toggle (minimap zoom, spectator tray, the network strip) and back costs nothing.
  let planned: MouseNoticePlan | null = null;
  let plannedSize = -1;
  const planKey: number[] = [];
  const nextKey: number[] = [];
  const recentPlans: { key: number[]; size: number; plan: MouseNoticePlan }[] = [];
  // A window being resized (sizes arriving within RESIZE_SETTLE_MS of each other) replans once it settles, while nothing
  // planned is on screen; a single change (a keyboard, a rotation) replans at once.
  let settleTimer: ReturnType<typeof setTimeout> | 0 = 0, settled = false, lastSize = -1, lastSizeAt = -Infinity, inRun = false;
  // The rosters as they stand without Tab, for this window and these rosters: the plan sees them while Tab is held, so
  // holding it moves nothing (the held rosters stop short of what is shown instead).
  let restingEars: { size: number; left: DOMRect | null; right: DOMRect | null; counts: number } | null = null;
  /** Whether anything the plan places (or the Tab rosters it bounds) is on screen. */
  const planShown = () => root.classList.contains('rosters-expanded') || !!root.querySelector('.cot-sixth.on,.cot-alert.show,.cot-prebattle.on,.cot-revive.on')
    || !!hudQuery('.cot-medal-toasts')?.childElementCount;
  function mouseNoticePlan(width: number, height: number, top: number, seen: readonly (PlanBox | null)[], net: DOMRect | null, map: DOMRect | null,
    rosters: readonly [PlanBox | null, number, PlanBox | null, number],
    systemsLeft: number, systemsTop: number, systemsWidth: number, systemsHeight: number, sideWidth: number,
    leftTop: number, leftBottom: number, rightTop: number, rightBottom: number,
    report: { top: number; height: number }): MouseNoticePlan {
    const size = width * 65536 + height;
    const now = performance.now();
    // a size that came hard on the last one starts (or continues) a run; the run lasts until sizes stop coming, and the
    // settled window is measured once more (instruments that only move, not resize, report no change of their own)
    if (size !== lastSize) {
      inRun = now - lastSizeAt < RESIZE_SETTLE_MS; lastSize = size; lastSizeAt = now;
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => { settleTimer = 0; settled = true; planInputs = true; schedule(); }, RESIZE_SETTLE_MS);
    }
    const resizing = inRun && now - lastSizeAt < RESIZE_SETTLE_MS;
    // The key: the size, the countdown's and revive count's boxes, then each fixed box (x, y, w, h), then the lanes. A
    // relayout whose key matches the last plan's builds nothing more.
    nextKey.length = 0;
    const countdown = root.querySelector<HTMLElement>('.cot-prebattle');
    const revive = root.querySelector<HTMLElement>('.cot-revive');
    const rules = root.querySelector<HTMLElement>('.cot-prebattle-rules');
    nextKey.push(width, height, Math.round(top), countdown?.offsetWidth ?? 0, countdown?.offsetHeight ?? 0, revive?.offsetWidth ?? 0, revive?.offsetHeight ?? 0,
      rules?.offsetWidth ?? 0, rules?.offsetHeight ?? 0);
    // each box [x, y, w, h, role]: 0 an instrument the notices keep off, 2 a panel or control the reticle's marks keep clear
    // of (SIGHT_FURNITURE, as publishSightFurniture measures it), 1 both
    const box = (x: number, y: number, w: number, h: number, role = 0) => {
      if (w > 0 && h > 0) nextKey.push(Math.round(x), Math.round(y), Math.round(w), Math.round(h), role);
    };
    const add = (r: PlanBox | null, role = 0) => { if (r) box(r.left, r.top, r.width, r.height, role); };
    // score, objective and minimap, then the ammunition rail and the network strip, as refresh() read them
    for (let i = 0; i < seen.length; i++) add(seen[i], i < 3 ? 1 : 0);
    // the team strip under the score, a panel like the score's
    add(read('.cot-pips.show'), 1);
    // each roster down to its height while Tab is held (its width then stops short of anything shown)
    for (let side = 0; side < 4; side += 2) {
      const ear = rosters[side] as DOMRect | null;
      if (ear) box(ear.left, ear.top, ear.width, Math.max(ear.height, rosters[side + 1] as number), 1);
    }
    const panel = read('.cot-dp');
    add(panel, 1);
    // the damage panel's status strip rises into the 36 px above it (leftFloor keeps the same band)
    if (panel) box(panel.left, Math.round(panel.top) - 36, panel.width, 36);
    add(read('.cot-drive'), 1);
    if (systemsHeight > 0) box(systemsLeft, systemsTop, systemsWidth, systemsHeight);
    add(read('.cot-cons'));
    // The marks keep clear of the controls row's buttons, the tray's shells and the consumables (not of the strip's or the
    // rail's spare width): each where this pass puts it (the buttons move with the strip, whose place is written below).
    const strip = read('.cot-vehicle-controls');
    const dx = strip ? systemsLeft - strip.left : 0, dy = strip ? systemsTop - strip.top : 0;
    for (const node of hudQueryAll('.cot-vehicle-controls>button')) {
      const b = shownBox(node);
      if (b) box(b.left + dx, b.top + dy, b.width, b.height, 2);
    }
    for (const node of hudQueryAll('.cot-shell,.cot-con,.flight-identity')) {
      const b = shownBox(node);
      if (b) box(b.left, b.top, b.width, b.height, 2);
    }
    const host = read('.cot-si-cardhost');
    if (host && report.height > 0) box(host.left, report.top, host.width, report.height);
    // The fps/ping readout: below 768 px its place is fixed under the objective (battleHudLayout.css, 88 x 20 at
    // --hud-network-left), kept whether it shows or not (it is opt-in, and hides for 30 frames on a sight change);
    // wider, it sits in the top-right corner row, by the score
    if (width < 768) box(width > height ? Math.max(122, (map?.right ?? 104) + 8) : (map?.right ?? 104) + 8, top + 8, 88, 20);
    else add(net);
    add(read('.cot-spec.show'));
    // the drone's and the gunship's flight console while their view is up (a view change, like the spectator tray),
    // where keeping off it costs no reticle clearance (below)
    const plain = nextKey.length;
    add(read('.cot-flight-hud:not([hidden]) .flight-console'));
    const boxesEnd = nextKey.length;
    const laneKey = (x: number, from: number, to: number) => {
      if (to - from >= 26) nextKey.push(Math.round(x), Math.round(sideWidth), Math.round(from), Math.round(to));
      else nextKey.push(-1, -1, -1, -1);
    };
    laneKey(0, leftTop, leftBottom);
    laneKey(width - sideWidth, rightTop, rightBottom);
    // the battle sight's rise (battleSight.ts: the chase framing's lens shift), after the lanes
    const sightShift = battleSightShift();
    nextKey.push(sightShift);
    const same = (key: readonly number[]) => {
      if (key.length !== nextKey.length) return false;
      for (let i = 0; i < key.length; i++) if (key[i] !== nextKey[i]) return false;
      return true;
    };
    if (planned && same(planKey)) return planned;
    const kept = recentPlans.find((entry) => same(entry.key));
    if (kept) {
      planned = kept.plan; plannedSize = kept.size;
    } else {
      // Mid-resize, with nothing planned on screen, the last plan stands until the window settles.
      if (planned && plannedSize !== size && resizing && !settled && !planShown()) {
        planInputs = true;
        return planned;
      }
      const obstacles: PlanRect[] = [], furniture: PlanRect[] = [];
      let plainObstacles = 0;
      for (let i = 9; i < boxesEnd; i += 5) {
        const r = { x: nextKey[i], y: nextKey[i + 1], w: nextKey[i + 2], h: nextKey[i + 3] }, role = nextKey[i + 4];
        if (role !== 2) { obstacles.push(r); if (i < plain) plainObstacles++; }
        if (role) furniture.push(r);
      }
      const lane = (i: number): PlanLane | null => nextKey[i] < 0 && nextKey[i + 1] < 0 ? null
        : { x: nextKey[i], w: nextKey[i + 1], top: nextKey[i + 2], bottom: nextKey[i + 3] };
      const input: MouseNoticeInput = {
        width, height, top: nextKey[2], obstacles, furniture, lanes: [lane(boxesEnd), lane(boxesEnd + 4)],
        smallAlert: height <= 550 || width <= 480,
        countdown: countdown ? { w: nextKey[3], h: nextKey[4] } : null,
        countdownRules: countdown && nextKey[7] > 0 ? { w: nextKey[7], h: nextKey[8] } : null,
        revive: revive ? { w: nextKey[5], h: nextKey[6] } : null,
        // medalToast.ts: the full card up to 380 px wide (84 px tall with its description; 74 without it at <= 640),
        // the compact card 250
        medal: { w: Math.min(380, width - 32), h: width > 640 ? 85 : 76 },
        medalCompact: { w: Math.min(250, width - 24), h: 40 },
        sightY: height / 2 - sightShift,
      };
      planned = planMouseNotices(input);
      if (boxesEnd > plain && planned.clearance < 2) {
        const without = planMouseNotices({ ...input, obstacles: obstacles.slice(0, plainObstacles) });
        if (without.clearance > planned.clearance) planned = without;
      }
      plannedSize = size;
      recentPlans.unshift({ key: nextKey.slice(), size, plan: planned });
      if (recentPlans.length > 4) recentPlans.pop();
    }
    settled = false;
    planKey.length = 0;
    for (const v of nextKey) planKey.push(v);
    return planned;
  }
  function setBodyVar(name: string, value: string) {
    if (document.body.style.getPropertyValue(name) !== value) document.body.style.setProperty(name, value);
  }
  /** Writes the plan; the countdown, the revive count and the medal card only while they are up (`up`), as the plan
   *  places those when first read. Tops, widths and scales only: every element keeps to the window's centre line
   *  (noticeCentreLine.ts; battleHudLayout.css centres them all). */
  function writeMousePlan(plan: MouseNoticePlan, up: { countdown: boolean; revive: boolean; medal: boolean; alert: boolean },
    medalWaits: boolean, medalFeedWait: boolean) {
    // (the dial a step smaller while an alert shows beside it, where that leaves the alert a clear place)
    const dial = up.countdown && up.alert ? plan.countdownUnderAlert : plan.countdown;
    setBodyVar('--hud-alert-width', `${Math.floor((up.countdown ? plan.countdownAlert : plan.alert).w)}px`);
    const medal = up.medal ? plan.medal : null;
    // The keep-out each element clears (mouseNoticePlan.ts tiers: 2 everything the reticle draws, 1 the battle sight at
    // full bloom, 0 the resting sight, - none, ? not up; s: it shares a notice's place; w: the medal card waits, f: on a
    // kill row of a lane its place cuts), for the browser receipt.
    const tier = (shown: boolean, place: { clearance: number; sharesNotices: boolean } | null) =>
      !shown ? '?' : place ? `${place.clearance}${place.sharesNotices ? 's' : ''}` : '-';
    const alertTier = up.countdown ? plan.countdownAlertClearance : plan.clearance;
    const tiers = `d${plan.clearance} a${alertTier < 0 ? '-' : alertTier} c${tier(up.countdown, up.countdown ? dial : null)} r${tier(up.revive, up.revive ? plan.revive : null)} m${tier(up.medal, medal)}${medal && medalWaits ? `w${medalFeedWait ? 'f' : ''}` : ''}`;
    if (document.body.dataset.hudNoticeTiers !== tiers) document.body.dataset.hudNoticeTiers = tiers;
    for (const name of ['countdown', 'revive'] as const) {
      if (!up[name]) continue;
      const place = name === 'countdown' ? dial : plan[name];
      setBodyVar(`--hud-${name}-top`, place ? `${Math.round(place.y)}px` : name === 'countdown' ? '22%' : '30%');
      setBodyVar(`--hud-${name}-scale`, place ? String(place.scale) : '1');
    }
    // the countdown's rules panel on the centre line under the sight (its scale from its top centre)
    const rules = up.countdown ? dial?.rules ?? null : null;
    if (rules) {
      setBodyVar('--hud-countdown-rules-top', `${Math.round(rules.y)}px`);
      setBodyVar('--hud-countdown-rules-scale', String(rules.scale));
    }
  }
  function refresh() {
    // (the parts held for their seat show where this pass seats them: shown before it measures, so it reads their boxes
    // (held hidden, the row read as empty and was seated so, then moved a pass later), they paint only after their seat)
    for (const node of seating) node.style.removeProperty('visibility');
    seating.clear();
    relayout();
  }
  function relayout() {
    frame = 0;
    // The end report owns the frame from its first frame until the garage (endScreen.ts body.cot-si-report): the HUD under it
    // is hidden or covered, and its teardown's mutations asked for full passes measuring a HUD nobody sees (Main, from the
    // nav-perf census: 400 + 251 ms over 11 tasks from the end to the garage, worst on a 4x phone). The report's exit
    // relayouts again (the class's own mutation).
    if (document.body.classList.contains('cot-si-report')) return;
    // From the battle's decision (endScreen.ts body.cot-es-armed) to that frame the HUD holds its seats: the report is
    // coming over it, and the passes in between seated the countdown's fading dial and the alert under it again, twice
    // (the loading census, CLS 0.028 on a phone's end screen). A new battle's phase lifts the class.
    if (document.body.classList.contains('cot-es-armed')) return;
    // (the HUD's own switch first, hud.ts setMode: a hidden HUD is known without a layout read, the read that forced the
    // frame's reflow at a pass's start, the perf lane's census)
    const visible = root.style?.display === 'none' ? false : !!root.getClientRects().length;
    if (document.body.hasAttribute('data-cot-battle-layout') !== visible) {
      document.body.toggleAttribute('data-cot-battle-layout', visible);
    }
    if (!visible) {
      clearSightFurniture();
      setSightNotice(false);
      settleSightFurniture();
      return;
    }
    // (the observed parts are looked for only when the body's or the root's children changed, or a relayout was asked
    // for, since the last look: a pass walked some 25 selectors over the document each time, the nav-perf census's
    // "observe" share)
    if (scanParts) {
      scanParts = false;
      observe('.cot-vehicle-status,.cot-net,.cot-aim-warning,.cot-sixth,.cot-alert,.cot-ear,.cot-minimap,.cot-dp,.cot-drive,.cot-vehicle-controls,.cot-spec,.cot-top,.cot-pips,.cot-mode-status,.cot-prebattle,.cot-prebattle-rules,.cot-touch .mobile-chrome,.cot-shells,.cot-touch .autoaim,.cot-touch .joy,.cot-touch .fire.alt');
      // the revive count is placed (mouse) as it shows
      if (!document.body.classList.contains('cot-touch-layout')) observe('.cot-revive');
      observe('.cot-si-toasthost,.cot-room-chat,.cot-kill-lane,.cot-medal-toasts,.cot-si-cardhost,.cot-si-log', true);
      // The multiplayer v2 network strip (src/ui/multiplayerStatus.ts) lives outside the HUD root; it
      // asks for a relayout when it mounts, and the lanes seat it in the corner row (networkCornerRight).
      observe('.cot-mp-status.battle,.cot-flight-hud,.flight-console');
      // the scope's vision switch (shown and hidden with the scope) and the consumables, which the reticle keeps clear of
      observe('.cot-scope-vision,.cot-cons,.cot-touch-aim');
      // Watch's bar (its seat: refresh)
      observe('.cot-watch');
      // (battle-camera-264) the first battles' controls strip: the chase framing clears it while it shows
      observe('.cot-hints');
    }
    // The lanes are placed in layout-viewport coordinates (getBoundingClientRect, fixed positioning), so they
    // measure the same viewport the HUD root is sized to: a pinch leaves both unchanged.
    const { width, height } = layoutViewportSize(window);
    const touch = document.body.classList.contains('cot-touch-layout');
    readsThisPass.clear();
    reuseReads = !touch;
    // a new window size (a resize, a keyboard, a toolbar) is a new plan input
    if (width * 65536 + height !== lastSize) planInputs = true;
    const tray = width < 1000 ? 'stacked' : 'inline';
    if (document.body.dataset.hudTray !== tray) document.body.dataset.hudTray = tray;
    // r10f (the notices critic: the drive gauge 2 px from the APFSDS slot at 1024 wide): a mouse layout's inline tray,
    // centred, moves right until it keeps the gap the damage panel keeps from the gauge (TRAY_GAUGE_GAP)
    let trayShift = 0;
    if (!touch && tray === 'inline') {
      const gauge = read('.cot-drive');
      const shells = read('.cot-shells');
      const shifted = parseFloat(document.body.style.getPropertyValue('--hud-tray-shift')) || 0;
      if (gauge && shells) trayShift = Math.max(0, Math.ceil(gauge.right + TRAY_GAUGE_GAP - (shells.left - shifted)));
    }
    // The mouse layout's centre notices are planned off the reticle (mouseNoticePlan.ts); touch keeps its own rules.
    if (document.body.hasAttribute('data-hud-notices') === touch) document.body.toggleAttribute('data-hud-notices', !touch);
    // On touch the HUD's controls are pressed and held mid-fight: the kit's hover tip (components/hoverTip.ts, a 500 ms
    // hold) stays off them there, and shows on a free mouse cursor's rest.
    if (typeof root.toggleAttribute === 'function' && root.hasAttribute('data-tip-off') !== touch) root.toggleAttribute('data-tip-off', touch);
    // (a portrait phone under PORTRAIT_SIGHT_ROOM_H tall whose systems row shows: the row takes the top slot right of the
    // map, and the map drops level with it (battleHudLayout.css data-map-slot), marked before the map is measured so this
    // pass places everything off its new edges)
    const mapSlot = touch && width < height && height < PORTRAIT_SIGHT_ROOM_H && !!read('.cot-vehicle-controls')?.height;
    if ((document.body.dataset.mapSlot === '') !== mapSlot) {
      if (mapSlot) document.body.dataset.mapSlot = '';
      else delete document.body.dataset.mapSlot;
    }
    const map = read('.cot-minimap');
    // (the map's large step on a window up to 1024 px wide takes the kill ribbon's room and the right-hand kill feed's on its
    // side: both stand down while it is open, battleHudLayout.css data-hud-map-large; the two smallest touch windows keep
    // the small step, so nothing gives way there. The ribbon stood beside the map at 1024x600 and a feed row over it at
    // 900x700, gauntlet r16)
    const mapLarge = !!map && width <= MAP_TAKES_LANES_W && !(touch && (width > height ? height <= 340 : width <= 340))
      && root.querySelector<HTMLElement>('.cot-minimap')?.dataset.zoom === MAP_LARGE_STEP;
    const mapSide = !map || !mapLarge ? '' : map.left + map.width / 2 > width / 2 ? 'right' : 'left';
    if ((document.body.dataset.hudMapLarge ?? '') !== mapSide) {
      if (mapSide) document.body.dataset.hudMapLarge = mapSide;
      else delete document.body.dataset.hudMapLarge;
    }
    // (the spectate bar, centred on the floor, ends 8 px short of a map in its band: at 720 px it met the map's larger step
    // at 1440x900, gauntlet r14's overlap receipt)
    const specRoom = map && map.left > width / 2 && map.bottom > height - 16 - 64 ? 2 * (map.left - 8 - width / 2) : 0;
    setBodyVar('--hud-spec-max', specRoom > 0 ? `${Math.floor(specRoom)}px` : '');
    // (the stick's centre over the floor: the drone's climb button sits level with it, 20-25 px under it it lined up with
    // nothing, gauntlet r15)
    const joy = touch ? read('.cot-touch.on .joy') : null;
    setBodyVar('--hud-joy-mid', joy ? `${Math.round(height - (joy.top + joy.bottom) / 2)}px` : '');
    const score = read('.cot-top');
    const scoreBottom = score?.bottom || 64;
    // the team strip under the score (hudTeamPips.ts), where it shows; the objective under the score sits under it
    // (where the top is wide; elsewhere the strip is the zone chips alone, hung under the objective plate, which stays on the
    // score plate's edge: gauntlet r3)
    const wide = wideTop(touch);
    setBodyVar('--hud-pips-top', `${Math.round(scoreBottom + PIPS_GAP)}px`);
    const pips = wide ? read('.cot-pips.show') : null;
    const objectiveSeat = seatObjective(touch, width, height, map, score, pips);
    const objective = read('.cot-mode-status.show');
    const side = objectiveSeat === 'side' && objective ? objective : null;
    let chips: DOMRect | null = null;
    // (the two tiniest touch windows hang the zone chips beside the objective's row, not under it: a landscape up to 340
    // px tall right of the plate, a portrait phone up to 340 px wide over the map, left of the touch chrome; under it they
    // left the notices no row over the sight, the layout receipt at 568x256 and 320x568)
    let chipsBeside = false;
    if (!wide) {
      const under = objectiveSeat === '' && objective ? objective.bottom : scoreBottom;
      const chipsNow = read('.cot-pips.show');
      const besideRight = touch && width > height && height <= 340 && objectiveSeat === '' && !!objective && !!chipsNow
        && objective.right + 6 + chipsNow.width <= width - 12;
      const overMap = touch && height >= width && width <= 340 && objectiveSeat === '' && !!objective && !!chipsNow;
      chipsBeside = besideRight || overMap;
      setBodyVar('--hud-pips-top', `${Math.round(besideRight && objective && chipsNow ? objective.top + (objective.height - chipsNow.height) / 2
        : overMap && objective ? objective.bottom + 8 : under + PIPS_GAP)}px`);
      // (over the map on its left edge: at 8 px the chips' row stood 4 px left of the map under it, gauntlet r14 at 320x568)
      setBodyVar('--hud-pips-left', besideRight && objective ? `${Math.round(objective.right + 6)}px` : overMap ? `${Math.round(map?.left ?? 12)}px` : '');
      setBodyVar('--hud-pips-shift', chipsBeside ? '0px' : '');
      chips = chipsBeside ? null : read('.cot-pips.show');
    }
    const head = Math.max(scoreBottom, pips?.bottom || 0, chips?.bottom || 0);
    const headTop = side || objectiveSeat === 'corner' ? head : Math.max(head, objective?.bottom || 0);
    // Watch's bar (watchHud.ts) owns a band of its own (owner 2026-10-25: "fix overlapping uis"). Riding or driving it
    // hangs under the score's band, below the map and the touch toolbar where it would cross them, and everything the
    // head band bounds (the side lanes, the centre notices) starts under it. Flying it rests on the floor, lifted over the
    // map where the map would meet it. A centred bar of its own width: the box read here holds whatever seat it is given.
    const watchView = document.documentElement?.dataset?.watch ?? '';
    const watchBar = watchView ? read('.cot-watch:not([hidden])') : null;
    const watchRail = watchView === 'drone' && touch ? read('.cot-watch-rail') : null;
    let watchBand = 0;
    // (a landscape phone under 300 px tall seats a riding bar on the floor, over the hull panel: watchHud.ts)
    const watchLow = watchView === 'ride' && touch && width > height && height < 300 ? watchBar : null;
    if (watchBar && !watchLow) {
      const crosses = (box: DOMRect | null): box is DOMRect => !!box && box.right > watchBar.left && box.left < watchBar.right;
      // A phone- or compact-width window hangs its map (and, on touch in portrait, its toolbar) under the head band
      // (battleHudLayout.css --hud-objective-bottom), so they move under the bar; elsewhere they hold their corners, and
      // the bar clears the ones it would cross.
      const narrow = document.body.dataset.cotWidth === 'phone' || document.body.dataset.cotWidth === 'compact';
      const mapFollows = narrow && (!touch || width < height), toolbarFollows = narrow && touch && width < height;
      const toolbar = touch && !toolbarFollows ? read('.cot-touch.on .mobile-chrome') : null;
      const fixedMap = mapFollows ? null : map;
      // Flying, the bar takes the riding bar's seat under the score at every size (gauntlet r4: on the floor at the wide
      // windows and under the score at the narrower ones, the one bar jumped between the two; r2 had found the floor seat
      // lifted over the map floating mid-screen at 1024x600).
      const seatTop = watchView === 'drone';
      if (document.body.hasAttribute('data-watch-top') !== seatTop) document.body.toggleAttribute('data-watch-top', seatTop);
      const watchTop = Math.ceil(Math.max(headTop, crosses(fixedMap) && fixedMap.top < height / 2 ? fixedMap.bottom : 0,
        crosses(toolbar) && toolbar.top < height / 2 ? toolbar.bottom : 0) + 8);
      setBodyVar('--hud-watch-top', `${watchTop}px`);
      watchBand = watchTop + watchBar.height;
    }
    const top = Math.max(headTop, watchBand);
    // the rosters start under a riding bar that crosses their columns (gauntlet r1: 900x700 hung the bar over both)
    const earsBox = read('.cot-ear.l') ?? read('.cot-ear.r');
    setBodyVar('--hud-ears-top', watchBand && watchBar && earsBox && (watchBar.left < earsBox.right || watchBar.right > width - earsBox.width)
      ? `${Math.ceil(watchBand + 8)}px` : '');
    const telemetry = read('.cot-net');
    const earLeft = read('.cot-ear.l');
    // A portrait phone up to 340 px wide parks the warning chip in the notices' row over the sight, where it gives way to
    // a shown notice (the layout receipt at 320x568: under the map the chip met the systems slot, and the notices had no
    // row of their own); the left lane starts under that row.
    const slotChip = touch && height >= width && width <= 340;
    let leftAnchor = Math.max(top, earLeft?.bottom || 0,
      !touch && width < 768 && telemetry && telemetry.top < height / 2 ? telemetry.bottom : 0,
      touch && touchChipParked(width, height) && !slotChip ? read('.cot-battle-notices .cot-aim-notice')?.bottom || 0 : 0,
      map && map.left < width / 2 ? map.bottom : 0, side?.bottom || 0) + 8;
    const systems = read('.cot-vehicle-controls');
    let systemsHeight = systems?.height ?? 0;
    const ammo = read('.cot-shells');
    // (a touch rack opens leftward over its rail, each further round 56 px past the last (hudAmmunitionPresentation.ts
    // layout): a row seated beside the rail stands left of that reach, so the open drawer covers none of it and nothing
    // moves when it opens; seated beside the closed rail, the open HE and HEAT stood over two tiles at 744x1001, the
    // layout receipt's ammo-expanded)
    let ammoReachLeft = ammo?.left ?? 0;
    if (touch && ammo) {
      for (const node of hudQueryAll<HTMLElement>('.cot-shells>.cot-shell')) {
        if (node.checkVisibility()) ammoReachLeft = Math.min(ammoReachLeft, ammo.left + (parseFloat(node.style.getPropertyValue('--touch-ammo-x')) || 0));
      }
    }
    let systemsWidth = Math.min(440, width - 24);
    let systemsTop = (ammo?.top ?? height - 80) - systemsHeight - 8;
    const systemsElement = hudQuery<HTMLElement>('.cot-vehicle-controls');
    const naturalWidth = systemsElement ? systemsElement.scrollWidth + 2 : 0;
    let dockWidth = Math.min(systemsWidth, naturalWidth);
    // (centred on the tray by the row's own rendered width: the 2 px margin dockWidth carries would set it 1 px left)
    let systemsLeft = Math.max(12, Math.min(width - dockWidth - 12,
      (ammo ? ammo.left + ammo.width / 2 : width / 2) - Math.min(dockWidth, Math.max(0, naturalWidth - 2)) / 2));
    // (a mouse layout's row spans its ammo rack edge to edge, the tiles sharing its width (battleHudLayout.css
    // [data-systems-fill]): six 74 px tiles were clipped to the 440 px cap, and four sat centred over six slots, gauntlet r3)
    // (an inline rack only: a phone-width window's rack is a rail, and the row keeps its own width beside it)
    const fillRack = !touch && !!ammo && ammo.width >= RACK_FILL_MIN && ammo.width >= 2 * ammo.height
      && document.body.dataset.cotWidth !== 'phone' && document.body.dataset.cotWidth !== 'compact';
    if (fillRack && ammo) { systemsWidth = dockWidth = ammo.width; systemsLeft = ammo.left; }
    // (a mouse layout's map stops 12 px short of the rack and its row, whatever its zoom step: the large map's 288 px ran
    // over the consumables and the row at 1024x600, gauntlet r4's overlap receipt; battleHudLayout.css --hud-map-max)
    const rackRight = Math.max(ammo?.right ?? 0, fillRack ? systemsLeft + systemsWidth : 0);
    // (and its larger steps stop short of the right roster at its least rows, the feed's gap and a readable report over
    // it: the large map's 258 px left a ten-a-side report 72 px at 1024x600, the layout receipt; never under the first
    // step, 32 % of the height)
    const rightEarNow = touch ? null : read('.cot-ear.r');
    const rightCount = Number(root.querySelector<HTMLElement>('.cot-ear.r')?.dataset.count) || 0;
    const rightGrid = !!root.querySelector('.cot-ear.r.icon-grid');
    const mapRoom = rightEarNow ? Math.max(height * .32, height - 16 - REPORT_MAP_GAP - REPORT_READABLE
      - (rightGrid ? REPORT_FEED_ROOM : 8) - (rightEarNow.top + (rightGrid ? 124 : 22 + Math.min(14, rightCount) * rosterRowLeast(rightCount)))) : Infinity;
    // (the cap sizes the plate's width; its grid labels make it taller by their row less their column)
    const mapNow = rightEarNow ? read('.cot-minimap') : null;
    // (and a mouse layout's map stops where the report and the log over it stop, short of the sight's widest ring
    // (battleHudLayout.css, 176 px at the least), so their edges stay one: at 900x700 the large map stood 10 px past the
    // log's left edge, gauntlet r8)
    const sightStop = touch ? Infinity
      : Math.max(176, width / 2 - Math.max(Math.min(width, height) * 0.15 + 8, 80) - (mapNow ? width - mapNow.right : 12));
    const mapCap = Math.min(!touch && rackRight > width / 2 ? width - 16 - rackRight - 12 : Infinity, sightStop,
      mapRoom - (mapNow ? Math.max(0, mapNow.height - mapNow.width) : 0));
    setBodyVar('--hud-map-max', mapCap < Infinity ? `${Math.floor(mapCap)}px` : '');
    // (as many tiles as the rack has slots: each tile stands over its slot, as wide, the separator's gap with it, so the
    // row's dividers are the rack's, gauntlet r4; otherwise the tiles share the rack's width evenly)
    const tiles: HTMLElement[] = [];
    const slots: DOMRect[] = [];
    let shellSlots = 0, conSlots = 0;
    if (fillRack) {
      for (const node of hudQueryAll<HTMLElement>('.cot-vehicle-controls>button')) if (node.checkVisibility()) tiles.push(node);
      for (const node of hudQueryAll<HTMLElement>('.cot-shell,.cot-con')) {
        const box = shownBox(node);
        if (!box) continue;
        slots.push(box);
        if (node.classList.contains('cot-con')) conSlots++; else shellSlots++;
      }
      slots.sort((a, b) => a.left - b.left);
    }
    // (fewer tiles than slots stand over the middle slots, one a slot: three or five tiles sharing six slots' width set
    // their dividers mid-slot, gauntlet r5; tiles of one group alone keep their group's side of the divider, the
    // equipment's over the consumables and the ammunition's over the shells: a loadout without F, Q and C set G and N
    // over the shells and B alone past the divider, gauntlet r8)
    const overSlots = fillRack && tiles.length > 0 && tiles.length <= slots.length;
    const row = overSlots ? tiles[0].parentElement : null;
    const split = row ? [...row.children].findIndex((node) => node.classList.contains('cot-drone-control')) : -1;
    const group = (node: HTMLElement) => (split < 0 ? 0 : [...row!.children].indexOf(node) > split ? 1 : -1);
    // (each group on its side, the ammunition's from the first slot, the equipment's from the divider, where each fits its
    // side: five tiles split three and two by count set the smoke's G across the divider, gauntlet r11; else the row
    // stands over the middle slots, one a slot)
    const leftTiles = split >= 0 ? tiles.filter((node) => group(node) < 0).length : -1;
    const sided = overSlots && split >= 0 && leftTiles <= shellSlots && tiles.length - leftTiles <= conSlots;
    const firstSlot = overSlots && !sided ? Math.floor((slots.length - tiles.length) / 2) : 0;
    // (each group from its own end, the ammunition's from the first slot and the equipment's from the divider, so a
    // vehicle without a control leaves that control's cell empty and every other keeps its column over the rack: closed up
    // on the divider, a loadout without C set F and Q over HEAT and HE, gauntlet r16)
    const slotOf = (at: number) => (!sided ? firstSlot + at : at < leftTiles ? at : shellSlots + at - leftTiles);
    if (overSlots || tilesOverSlots) {
      for (const node of hudQueryAll<HTMLElement>('.cot-vehicle-controls>button')) {
        if (!node.style) continue;
        const at = overSlots ? tiles.indexOf(node) : -1;
        const slot = at >= 0 ? slots[slotOf(at)] : null;
        const w = slot ? `${slot.width}px` : '';
        const dx = !slot ? '' : at > 0 ? `${slot.left - slots[slotOf(at - 1)].right}px`
          : slotOf(0) > 0 ? `${slot.left - systemsLeft}px` : '';
        if (node.style.getPropertyValue('--hud-tile-w') !== w) node.style.setProperty('--hud-tile-w', w);
        if (node.style.getPropertyValue('--hud-tile-dx') !== dx) node.style.setProperty('--hud-tile-dx', dx);
      }
      tilesOverSlots = overSlots;
    }
    const fillMode = !fillRack ? '' : overSlots ? 'slots' : '1';
    if ((document.body.dataset.systemsFill ?? '') !== fillMode) {
      if (fillMode) document.body.dataset.systemsFill = fillMode;
      else delete document.body.dataset.systemsFill;
    }
    if (touch && height < 550 && width > height) {
      // Landscape phones have a vertical ammo rail. Use the lower gap between
      // the driving instruments and aim buttons, above the health strip.
      systemsLeft = Math.max(read('.cot-touch.on .joy')?.right || 0, read('.cot-drive')?.right || 0) + 8;
      systemsWidth = Math.max(52, Math.min(440, (read('.cot-touch.on .autoaim')?.left || width - 12) - systemsLeft - 8));
      dockWidth = Math.min(systemsWidth, naturalWidth);
      systemsTop = (read('.cot-dp')?.top || height - 44) - systemsHeight - 8;
      // (centred over the hull plate under it where the gap holds it there: set from the gauge, the row stood staggered
      // over the plate, gauntlet r3 at 844x390)
      const plate = read('.cot-dp');
      const rowWidth = Math.min(dockWidth, Math.max(0, naturalWidth - 2));
      const overPlate = plate ? plate.left + plate.width / 2 - rowWidth / 2 : -1;
      // (4 px of the gap's 8 to AUTO AIM may go to the centred row: at 568x256 it missed by 1 px and stood 8 px off the
      // plate's centre, gauntlet r11)
      if (plate && overPlate >= systemsLeft && overPlate + rowWidth <= systemsLeft + systemsWidth + 4) {
        systemsWidth -= overPlate - systemsLeft;
        systemsLeft = overPlate;
      }
    }
    if (touch && width < height && map && map.left < width / 2 && map.bottom + 8 > systemsTop) {
      systemsLeft = map.right + 8;
      systemsWidth = Math.max(52, width - systemsLeft - 12);
      dockWidth = Math.min(systemsWidth, naturalWidth);
    }
    // Portrait rotation can leave the system strip level with the settings
    // buttons. Keep the touch navigation reachable before placing that strip.
    const touchChrome = touch ? read('.cot-touch.on .mobile-chrome') : null;
    if (touch && width < height && touchChrome && systemsLeft + dockWidth > touchChrome.left
      && systemsTop < touchChrome.bottom + 8) systemsTop = touchChrome.bottom + 8;
    // The side lanes keep the floor the row's natural place gives them (a row moved below the sight lends them nothing).
    const laneSystemsTop = systemsTop;
    // (battle-camera-264) the most the chase framing may raise the sight before this layout's own sight-led places give
    let sightRiseCap = Infinity;
    if (touch && width < height && systemsHeight) {
      const floor = Math.min(read('.cot-drive')?.top ?? height, read('.cot-touch.on .fire.alt')?.top ?? height,
        read('.cot-touch.on .joy')?.top ?? height) - 8;
      const ceiling = Math.max(map?.bottom ?? 0, touchChrome?.bottom ?? 0, top) + 8;
      sightRiseCap = portraitSightRiseCap(systemsTop, systemsHeight, height / 2, ceiling);
      const clearTop = portraitSightClearTop(systemsTop, systemsHeight, height / 2, floor, ceiling, height / 2 - battleSightShift());
      if (clearTop !== systemsTop) {
        systemsTop = clearTop;
        // Level with the ammo tray: the row sits left of it, whole, rather than scrolling under it; clear of it, on the
        // window's centre line with the score, the sight and the hull plate (gauntlet r5: centred on the tray, it was
        // pressed to the right edge)
        if (ammo && systemsTop + systemsHeight > ammo.top && systemsTop < ammo.bottom) {
          systemsLeft = Math.max(12, ammoReachLeft - 8 - dockWidth);
        } else {
          systemsLeft = Math.max(12, Math.floor((width - Math.min(dockWidth, Math.max(0, naturalWidth - 2))) / 2));
        }
      }
    }
    // r10g (the r10e critic at 320x568 and 360x640: the scope's readouts on the systems row's labels, the warning chip set
    // over the sight on its key badges; the row clipped at 320 wide): the marks r10 sets over the ring (the readout row,
    // the chip, a rack) reach past SIGHT_BAND_ABOVE, so on a portrait phone under PORTRAIT_SIGHT_ROOM_H tall the row takes
    // the top slot right of the map, under the touch chrome, in its compact form (icons over labels, no key badges, the
    // slot's width shared: battleHudLayout.css data-systems-slot), wherever that slot is higher than its own place (with
    // an objective panel the chrome drops under it, and the slot is as high as the row already was: compact there, it
    // no longer runs off the screen). Its buttons keep the 44 px touch target, as many a row as the slot's width holds,
    // the rows balanced (a five-control kit at 320 wide takes two), 7 px under the chrome (at 8 px a 44 px row left the
    // scope's notices no clear band under it at 360x640). The map shares its top edge (data-map-slot, above: 7 px under the
    // chrome) and the slot keeps the map's when the chrome stands down (a scope): hung from the chrome 4 px under it, the
    // row stood 17.5 px off the map's top and foot, and 12.5 px over the map in a scope, gauntlet r12 at 320x568.
    let systemsSlot = '';
    let systemsPerRow = 0;
    if (touch && width < height && height < PORTRAIT_SIGHT_ROOM_H && systemsHeight && map && map.left < width / 2) {
      const slotTop = Math.max(touchChrome?.bottom ?? 0, top, map.top - SLOT_GAP) + SLOT_GAP;
      if (slotTop <= systemsTop) {
        systemsSlot = 'top';
        systemsTop = slotTop;
        systemsLeft = map.right + 8;
        // (its right edge on the column under it, the ammunition's and the consumables' 14 px: at 12 it stood 2 px past
        // them at 320x568, gauntlet r12)
        systemsWidth = dockWidth = Math.max(52, width - systemsLeft - 14);
      }
    }
    let systemsCount = 0;
    // (what one row cannot hold sits beside the touch chrome, left of it and level with it, where that leaves a 44 px
    // place: a five-control kit at 320 wide, whose second row met the ammo drawer's open shells; else balanced rows)
    let systemsBeside = 0;
    const besideRoom = touchChrome ? touchChrome.left - 8 - (map ? map.right + 8 : 0) : 0;
    const besideFits = besideRoom >= TOUCH_TARGET ? Math.floor((besideRoom + SYSTEMS_GAP) / (TOUCH_TARGET + SYSTEMS_GAP)) : 0;
    const slotRows = () => {
      const fits = Math.max(1, Math.floor((systemsWidth + SYSTEMS_GAP) / (TOUCH_TARGET + SYSTEMS_GAP)));
      systemsBeside = systemsCount > fits && systemsCount - fits <= besideFits ? systemsCount - fits : 0;
      const inRow = systemsCount - systemsBeside;
      const rows = Math.max(1, Math.ceil(inRow / fits));
      systemsPerRow = Math.max(1, Math.ceil(inRow / rows));
      // (rows 4 px apart, two of them the map's height: 3 px apart, they ended 1 px over its foot)
      systemsHeight = rows * TOUCH_TARGET + (rows - 1) * SLOT_ROW_GAP;
    };
    // (a row that pages no longer, its paging marks lifted before it is counted)
    const more = hudQuery<HTMLButtonElement>('.cot-vehicle-controls>.cot-systems-more');
    const paged = touch && !systemsSlot && !!systemsElement && !!more;
    if (!paged && more && !more.hidden) {
      more.hidden = true;
      for (const button of systemsElement?.children ?? []) button.removeAttribute('data-off');
    }
    if (systemsSlot) {
      for (const button of systemsElement?.children ?? []) if (button.checkVisibility()) systemsCount++;
      slotRows();
    }
    if ((document.body.dataset.systemsSlot ?? '') !== systemsSlot) {
      if (systemsSlot) document.body.dataset.systemsSlot = systemsSlot;
      else delete document.body.dataset.systemsSlot;
    }
    if (touch && width < height && ammo && systemsTop + systemsHeight > ammo.top
      && systemsTop < ammo.bottom && systemsLeft < ammo.left) {
      systemsWidth = Math.max(52, ammoReachLeft - systemsLeft - 8);
      dockWidth = Math.min(systemsWidth, naturalWidth);
      // (the top slot's rows in the width the ammo column leaves it)
      if (systemsSlot) { dockWidth = systemsWidth; slotRows(); }
    }
    // UI-06 (owner 2026-10-14: "a better way to show the stuff u can do row on mobile"): a touch row is whole 44 px tiles
    // and never scrolls; where its width holds fewer tiles than it has controls, its last place is the More tile, which
    // pages through the rest in the same place (hud.ts), so nothing new covers the sight or the controls. The paging
    // marks are lifted while the row's controls are counted (no frame between).
    if (paged && systemsElement && more) {
      const controls: HTMLElement[] = [];
      for (const node of systemsElement.children) {
        const button = node as HTMLElement;
        if (button === more) continue;
        button.removeAttribute('data-off');
        if (button.checkVisibility()) controls.push(button);
      }
      const fits = Math.max(1, Math.floor((systemsWidth - 4 + SYSTEMS_GAP) / (TOUCH_TARGET + SYSTEMS_GAP)));
      const perPage = controls.length > fits ? Math.max(1, fits - 1) : Math.max(1, controls.length);
      const pages = Math.max(1, Math.ceil(controls.length / perPage));
      const page = Math.min(pages - 1, Number(systemsElement.dataset.page) || 0);
      controls.forEach((button, index) => { if (Math.floor(index / perPage) !== page) button.setAttribute('data-off', ''); });
      more.hidden = pages <= 1;
      more.classList.toggle('last', pages > 1 && page === pages - 1);
      if (systemsElement.dataset.pages !== String(pages)) systemsElement.dataset.pages = String(pages);
      if (systemsElement.dataset.page !== String(page)) systemsElement.dataset.page = String(page);
      if (pages > 1) dockWidth = Math.min(systemsWidth, (perPage + 1) * (TOUCH_TARGET + SYSTEMS_GAP) - SYSTEMS_GAP + 4);
    }
    // (the buttons beside the chrome: the row's last ones, each 44 px, from the slot's left edge; the marks cleared once
    // none sits there)
    if (systemsElement && (systemsBeside || besideMarked)) {
      besideMarked = systemsBeside > 0;
      let index = 0;
      let beside = 0;
      const buttons = systemsElement.children;
      for (let i = 0; i < buttons.length; i++) {
        const button = buttons[i] as HTMLElement;
        const shown = systemsBeside > 0 && button.checkVisibility();
        const place = shown && index++ >= systemsCount - systemsBeside ? String(beside++) : '';
        if ((button.dataset.slotBeside ?? '') !== place) {
          if (place) button.dataset.slotBeside = place;
          else delete button.dataset.slotBeside;
        }
      }
    }
    // (a mouse layout from 768 px wide keeps its lanes off the countdown dial's column, battleHudLayout.css
    // --hud-message-width: at 900x700 the dial cut both 400 px lanes, which gave it their rows, gauntlet r3)
    const sideWidth = Math.min(400, width / 2 - (touch && width > height ? TOUCH_CENTRE_HALF : !touch && width >= 768 ? DESK_CENTRE_HALF : 24));
    const chat = !!read('.cot-room-chat:not([hidden])');
    const toastHost = root.querySelector<HTMLElement>('.cot-si-toasthost');
    const toastCount = toastHost?.childElementCount || 0;
    const setRows = (host: Element | null, rows: number) => {
      if (!host) return;
      for (let index = 0; index < host.children.length; index++) {
        const item = host.children[index] as HTMLElement;
        item.hidden = index >= rows;
      }
    };
    const killLeft = root.querySelector('.cot-kill-lane.l');
    const killRight = root.querySelector('.cot-kill-lane.r');
    // (the gunship lens's zoom and range row under the sight is a floor for a lane it reaches into: 844x390's left lane
    // ran 21 px over it, gauntlet r5's overlap receipt)
    // (with the weapon's name hung over it: the row's box leaves it out, and at 320x568 both lanes' rows ran into "30 mm
    // cannon", gauntlet r8)
    const lensBox = read('.cot-flight-hud:not([hidden]) .gunship-solution');
    const lensLabel = lensBox ? read('.cot-flight-hud:not([hidden]) .gunship-solution-label') : null;
    const lensRow = lensBox && {
      left: Math.min(lensBox.left, lensLabel?.left ?? Infinity), right: Math.max(lensBox.right, lensLabel?.right ?? -Infinity),
      top: Math.min(lensBox.top, lensLabel?.top ?? Infinity) };
    const leftBottom = Math.min(leftFloor(height, touch),
      systemsHeight && systemsLeft < sideWidth + 12 ? Math.min(laneSystemsTop, systemsTop) - 8 : height,
      lensRow && lensRow.left < sideWidth && lensRow.top > leftAnchor ? lensRow.top - 8 : height,
      watchLow && watchLow.left < sideWidth ? watchLow.top - 8 : height);
    const earRight = read('.cot-ear.r');
    const networkRight = networkCornerRight(width, touch, telemetry, score);
    const strip = read('.cot-mp-status.battle');
    // The strip's corner row stays above the right roster's lane. Only its open details reader reaches into the
    // roster's column, and then the roster takes the lane below it (the roster's own top is otherwise its CSS lane).
    const rosterTopRight = strip && earRight && strip.right > earRight.left && strip.bottom > earRight.top - 8 ? Math.ceil(strip.bottom) + 6 : null;
    const rosterBottomRight = earRight ? (rosterTopRight ?? earRight.top) + (earRight.bottom - earRight.top) : 0;
    const chrome = touch ? read('.cot-touch.on .mobile-chrome') : null;
    // A phone-width mouse window has no roster above the right-hand feeds: they start below the strip's lane, which
    // follows the objective's bottom measured in this pass.
    const networkBottom = strip && !touch && document.body.dataset.cotWidth === 'phone' ? top + 8 + strip.height : 0;
    let rightAnchor = Math.max(top, rosterBottomRight, chrome?.bottom || 0, networkBottom) + 8;
    const lowerCorners = [read('.cot-dp'), read('.cot-drive'), map];
    const rackCentre = fillRack ? systemsLeft + systemsWidth / 2 : width / 2;
    // (the controls strip and the kill ribbon over a mouse layout's rack take the rack's edges, where the rack lies inside
    // their gap: 2-3 px inside it at 1024x600, gauntlet r5; at 1280 and up three centred widths, the strip 594 px, the
    // ribbon 520, the rack 434, r7. The ribbon at the rack's width is its tight form, the callsign kept.)
    const onRack = (place: { width: number; x: number; bottom: number }, cap: number) => {
      const w = Math.min(cap, place.width);
      const inside = systemsLeft >= place.x - place.width / 2 - RACK_SNAP_INSET && systemsLeft + systemsWidth <= place.x + place.width / 2 + RACK_SNAP_INSET;
      return fillRack && inside && systemsWidth >= RIBBON_LEAST
        ? { ...place, width: systemsWidth, x: rackCentre } : { ...place, width: w };
    };
    // (a gap that starts over the controls row starts on the edge of the control under it, the row's next cell, each cell
    // where this pass seats the row: at 900x700 the speedometer's 16 px gutter ended in the 5 px between two cells, the
    // strip and the ribbon 3-4 px off the cell under them, gauntlet r17)
    const rowLeft = typeof systemsElement?.getBoundingClientRect === 'function' ? systemsElement.getBoundingClientRect().left : 0;
    const cellLefts: number[] = [];
    const cells = touch ? null : systemsElement?.children;
    for (let at = 0; at < (cells?.length ?? 0); at++) {
      const cell = cells![at];
      const box = typeof cell.getClientRects === 'function' && cell.getClientRects().length ? cell.getBoundingClientRect() : null;
      if (box && box.width >= 1) cellLefts.push(box.left - rowLeft + systemsLeft);
    }
    const onCell = (place: { width: number; x: number; bottom: number }) => {
      const left = place.x - place.width / 2, right = place.x + place.width / 2;
      const cell = cellLefts.find((x) => x >= left && x - left < CELL_SNAP);
      return cell === undefined ? place : { ...place, width: right - cell, x: (cell + right) / 2 };
    };
    const hints = onCell(onRack(hintsPlace(width, height, lowerCorners, rackCentre, systemsTop - 8), Infinity));
    // (the kill ribbon in the same gap, at most its 520 px: on a 900 px window it would cross the speedometer; under
    // RIBBON_TIGHT it drops its cause chip and the silhouette, under RIBBON_LEAST it does not show)
    const ribbonGap = onCell(onRack(hintsPlace(width, height, lowerCorners, rackCentre, systemsTop - RIBBON_LIFT), RIBBON_W));
    // (over a flight's console where that stands higher, centred on it and as wide: gauntlet r4 at 900x700 set it 57 px
    // off the drone's console under it; r5 found it narrower than the gunship's console from 1440 and the drone's at 900)
    const flightConsole = read('.cot-flight-hud:not([hidden]) .flight-console');
    const overConsole = !!flightConsole && flightConsole.top < systemsTop;
    const ribbon = overConsole && flightConsole
      ? { x: flightConsole.left + flightConsole.width / 2, width: flightConsole.width } : ribbonGap;
    // The kill ribbon's place (it shows on a mouse layout from 768 px wide and not short): the right column ends over it
    // where it reaches under the column (a small map's column ran the open log 10 px onto it at 1024x600, the layout
    // receipt's returned-combined).
    const ribbonTop = Math.min(ribbonGap.bottom + RIBBON_LIFT, flightConsole?.top ?? Infinity);
    const ribbonShows = !touch && document.body.dataset.cotHeight !== 'short'
      && ['tablet', 'laptop', 'desktop'].includes(document.body.dataset.cotWidth ?? '');
    const ribbonFloor = ribbonShows && ribbon.width >= RIBBON_LEAST && ribbon.x + ribbon.width / 2 > width - sideWidth - 12
      ? ribbonTop - RIBBON_LIFT - RIBBON_H - 8 : height;
    const scopeVision = read('.cot-scope-vision');
    const reportShown = !!hudQuery('.cot-si-cardhost')?.childElementCount || !!read('.cot-si-log.open');
    const rightBottom = Math.min(rightFloor(height, width, map), ribbonFloor,
      systemsHeight && systemsLeft + dockWidth > width - sideWidth - 12 ? Math.min(laneSystemsTop, systemsTop) - 8 : height,
      // (Watch's touch climb rail, flying, holds the right edge: the right lanes end above it)
      watchRail && watchRail.left > width - sideWidth ? watchRail.top - 8 : height,
      // (and so does the scope's vision switch beside the sight, where it reaches under the right lanes: 1024x600's lane
      // ran 2 px onto it, gauntlet r4's overlap receipt)
      // (not while a report or the log shows: the dock takes the column and the switch its mirror seat, seatScopeVision;
      // held over the switch, the 1024x600 card had 74 px with 124 px of column empty under it, gauntlet r10)
      !reportShown && scopeVision && scopeVision.right > width - sideWidth && scopeVision.top > height / 3 ? scopeVision.top - 8 : height,
      lensRow && lensRow.right > width - sideWidth && lensRow.top > rightAnchor ? lensRow.top - 8 : height,
      watchLow && watchLow.right > width - sideWidth ? watchLow.top - 8 : height);
    const rosterStart = rosterTopRight ?? earRight?.top ?? scoreBottom + 8;
    const rosterCount = Number(root.querySelector<HTMLElement>('.cot-ear.r')?.dataset.count) || 0;
    // (a row is never squeezed under 16 px, a dense roster's under 13: at 12 px the enemy roster's lines touched, gauntlet
    // r1 at 1280x720). The roster at 16 px rows and the global feed's room between it and the report, where they leave the
    // report a readable dock; else at its dense rows; else the feed gives way (fourteen a side at 1024x600 left the report
    // 40 px, the layout receipt).
    const rosterRows = Math.min(14, rosterCount);
    const roomy = 22 + rosterRows * ROSTER_ROW_MIN, dense = 22 + rosterRows * rosterRowLeast(rosterCount);
    const readable = (roster: number, room: number) => rightBottom - (rosterStart + roster + room) >= REPORT_READABLE;
    const [rosterMinimum, feedRoom] = !earRight ? [0, 0] : root.querySelector('.cot-ear.r.icon-grid') ? [124, REPORT_FEED_ROOM]
      : readable(roomy, REPORT_FEED_ROOM) ? [roomy, REPORT_FEED_ROOM] : readable(dense, REPORT_FEED_ROOM) ? [dense, REPORT_FEED_ROOM] : [dense, 8];
    // The shot report docks under the right roster. On the mouse layout, where its column would cross the centre notices'
    // widest slot, it starts below their stacked band (mouseNoticeStackBand) while that leaves it a tight card's height,
    // so the detection and the alert stack under the objective instead of splitting round it.
    const reportCeiling = Math.max(top + 12, rosterStart + rosterMinimum + feedRoom, networkBottom + 8);
    const reportHost = touch ? null : read('.cot-si-cardhost');
    const noticeBand = reportHost ? mouseNoticeStackBand(width, height, top, height <= 550 || width <= 480) : null;
    const reportUnderBand = !!noticeBand && reportHost!.left < width / 2 + noticeBand.halfWidth
      && rightBottom - noticeBand.bottom >= REPORT_DOCK_MIN;
    // The dock is held only while a report or the open log fills it (the host's cards and the log are observed): an empty
    // dock left the enemy roster 12 px rows and the right kill lane no height at all (gauntlet r1 at 1280x720).
    const report = reportShown ? battleReportDock(rightBottom, reportUnderBand ? Math.max(reportCeiling, noticeBand!.bottom) : reportCeiling,
      root.classList.contains('compact-shot-report')) : { top: rightBottom, height: 0, bottom: rightBottom };
    const dockReport = !touch;
    const rightKillFloor = dockReport ? report.top - 8 : rightBottom;
    const countdown = read('.cot-prebattle.on');
    // Mouse: one plan from the viewport, the fixed instruments and the lanes' bands (mouseNoticePlan.ts).
    const banner = hudQuery<HTMLElement>('.cot-medal-toasts');
    const expanded = root.classList.contains('rosters-expanded');
    let plan: MouseNoticePlan | null = null;
    if (!touch && !planInputs && planned) plan = planned;
    else if (!touch) {
      planInputs = false;
      const rosterCountLeft = Number(root.querySelector<HTMLElement>('.cot-ear.l')?.dataset.count) || 0;
      const size = width * 65536 + height, counts = rosterCountLeft * 4096 + rosterCount;
      if (!expanded) restingEars = { size, left: earLeft, right: earRight, counts };
      else if (!(restingEars?.size === size && restingEars.counts === counts)) {
        // The first plan for this window and these rosters is made while Tab is held: the rosters at rest are read with
        // the class lifted for the read (no frame between; the observers see the same final class), so the plan is the
        // one releasing Tab keeps.
        root.classList.remove('rosters-expanded');
        restingEars = { size, left: read('.cot-ear.l'), right: read('.cot-ear.r'), counts };
        root.classList.add('rosters-expanded');
      }
      const resting = expanded ? restingEars : null;
      // the left lane's floor without the vehicle-status strip, which comes and goes with damage
      const planLeftBottom = Math.min(leftFloor(height, touch, true), systemsHeight && systemsLeft < sideWidth + 12 ? Math.min(laneSystemsTop, systemsTop) - 8 : height);
      // The rosters at rest: their place and width as measured at rest, their height as this pass sizes them at rest
      // (the height variables are written after these reads, so a pass just after Tab's release still measures the held
      // height, 30 px a row against 24)
      const iconLeft = !!root.querySelector('.cot-ear.l.icon-grid'), iconRight = !!root.querySelector('.cot-ear.r.icon-grid');
      const atRest = (ear: PlanBox | null, h: number): PlanBox | null => ear && { left: ear.left, top: ear.top, width: ear.width, height: h };
      const restLeft = resting ? resting.left : earLeft, restRight = resting ? resting.right : earRight;
      const planLeft = atRest(restLeft, restLeft ? battleRosterHeight(height, planLeftBottom - restLeft.top, iconLeft ? 124 : 48, rosterCountLeft, false) : 0);
      const planRight = atRest(restRight, Math.min(battleRosterHeight(height, rightBottom - rosterStart, iconRight ? 124 : 48, rosterCount, false),
        Math.max(0, report.top - rosterStart - feedRoom)));
      // the lanes as they start below the resting rosters
      const planLeftAnchor = Math.max(top, planLeft ? planLeft.top + planLeft.height : 0,
        width < 768 && telemetry && telemetry.top < height / 2 ? telemetry.bottom : 0, map && map.left < width / 2 ? map.bottom : 0) + 8;
      // A phone-width window keeps the network strip's corner of the right lane for it, there or not (multiplayerStatus.ts:
      // its folded ping under the objective), so the strip coming and going (a reconnect) moves no notice.
      const phone = document.body.dataset.cotWidth === 'phone';
      const stripLane: PlanBox | null = phone ? { left: width - NETWORK_CORNER_RIGHT - PHONE_STRIP_WIDTH, top: top + 8, width: PHONE_STRIP_WIDTH, height: PHONE_STRIP_HEIGHT } : null;
      const planNetworkBottom = phone ? Math.max(networkBottom, top + 8 + PHONE_STRIP_HEIGHT) : networkBottom;
      const planRightAnchor = Math.max(top, planRight ? (rosterTopRight ?? planRight.top) + planRight.height : 0, planNetworkBottom) + 8;
      plan = mouseNoticePlan(width, height, top, [score, objective, map, ammo, phone ? stripLane : strip], telemetry, map,
        [planLeft, planLeft ? battleRosterHeight(height, planLeftBottom - planLeft.top, iconLeft ? 124 : 48, rosterCountLeft, true) : 0,
          planRight, planRight ? Math.min(battleRosterHeight(height, rightBottom - rosterStart, iconRight ? 124 : 48, rosterCount, true),
            Math.max(0, report.top - rosterStart - feedRoom)) : 0],
        systemsLeft, systemsTop, dockWidth, systemsHeight, sideWidth, planLeftAnchor, planLeftBottom, planRightAnchor, Math.min(rightBottom, rightKillFloor), report);
    }
    // The medal card waits (keeping its time) where it has no place, while anything shown meets its place (a notice
    // whose place it shares, the revive count) and while the scope is up where its place clears the battle sight only
    // (a short window: hud.ts flags the scope on the document element, which relayouts only while such a card waits).
    let medalReady = false, medalWaiting = false, medalFeedWait = false;
    medalScopeSensitive = false;
    if (plan && banner?.childElementCount) {
      medalWaiting = mouseMedalWaits(plan, { detection: !!root.querySelector('.cot-sixth.on'), alert: !!root.querySelector('.cot-alert.show'),
        revive: !!root.querySelector('.cot-revive.on'), scoped: document.documentElement.hasAttribute(SCOPED_ATTRIBUTE),
        feeds: [!!killLeft?.childElementCount, !!killRight?.childElementCount] });
      medalReady = !medalWaiting;
      medalScopeSensitive = !!plan.medal && plan.medal.clearance < 2;
      // (for the receipt: a lane the card's place cuts shows a kill row, the one wait that comes from the feed)
      medalFeedWait = !!plan.medal && ((plan.medal.cutsLanes[0] && !!killLeft?.childElementCount) || (plan.medal.cutsLanes[1] && !!killRight?.childElementCount));
    }
    // A placed element crossing a side lane takes the lane's band from the plan while it shows (its rows start below it
    // or end above it); the lanes hold all their rows while nothing is up. Held Tab rosters stop short of it too.
    let leftEnd = leftBottom, rightEnd = Math.min(rightBottom, rightKillFloor);
    let wideLeft = Infinity, wideRight = Infinity;
    if (plan) {
      const alertSlot = countdown ? plan.countdownAlert : plan.alert;
      const shown = [root.querySelector('.cot-sixth.on') && plan.detection, root.querySelector('.cot-alert.show') && alertSlot,
        countdown && (root.querySelector('.cot-alert.show') ? plan.countdownUnderAlert : plan.countdown),
        root.querySelector('.cot-revive.on') && plan.revive, medalReady && plan.medal];
      for (const place of shown) {
        if (!place) continue;
        const [lt, lb, rt, rb] = place.giveWay;
        if (lt === lt) leftAnchor = Math.max(leftAnchor, lt);
        if (lb === lb) leftEnd = Math.min(leftEnd, lb);
        if (rt === rt) rightAnchor = Math.max(rightAnchor, rt);
        if (rb === rb) rightEnd = Math.min(rightEnd, rb);
        if (!expanded) continue;
        const box = place === alertSlot ? mouseAlertBox(alertSlot) : place;
        if (earLeft && box.y < earLeft.bottom + 8 && box.y + box.h > earLeft.top - 8) wideLeft = Math.min(wideLeft, box.x - 8 - earLeft.left);
        if (earRight && box.y < earRight.bottom + 8 && box.y + box.h > earRight.top - 8) wideRight = Math.min(wideRight, earRight.right - box.x - box.w - 8);
      }
      setBodyVar('--hud-roster-wide-left', wideLeft < Infinity ? `${Math.floor(wideLeft)}px` : '');
      setBodyVar('--hud-roster-wide-right', wideRight < Infinity ? `${Math.floor(wideRight)}px` : '');
    }
    // (the battle's notice over a side lane's column takes the lane's band too while it shows, the lane's rows starting
    // under it: the network's banner sat over the right-hand kill feed at 1024x600 and 900x700, the overlap probe; a touch
    // layout reads it out, never draws it)
    const battleNotice = touch ? null : hudQuery('.cot-battle-notices .cot-c-notice:not([data-state="exit"])');
    const noticesBox = battleNotice ? battleNotice.parentElement!.getBoundingClientRect() : null;
    if (noticesBox && noticesBox.height > 0) {
      const under = Math.ceil(noticesBox.bottom + 8);
      if (noticesBox.left < sideWidth + 20) leftAnchor = Math.max(leftAnchor, under);
      if (noticesBox.right > width - sideWidth - 20) rightAnchor = Math.max(rightAnchor, under);
    }
    // A portrait phone's global feed (the right lane, level with the map) takes the width right of the map where the rows
    // that end above the personal lane are two or more, and holds those rows (one wide row would cost the lane the rows it
    // holds beside the personal lane down to the systems row): in half the window its two callsigns read
    // "Command…", gauntlet r3 at 390x844. Its depth follows the lanes' anchors, never their rows, so nothing moves as kills
    // come and go.
    // (a touch layout's two lanes keep one 29 px row pitch, each lane's first row a whole number of rows from the other's,
    // by the smaller move down: the later lane to the next row, or the earlier onto the later's; their rows sat 2-14 px
    // apart in one band, gauntlet r5)
    if (slotChip && systemsSlot === 'top') leftAnchor = Math.max(leftAnchor, systemsTop + systemsHeight + TOUCH_NOTICE_GAP + TOUCH_ONE_ROW.h + 8);
    // (where the global feed is bound to stack, beside the map or in its half, its rows' 41 px pitch never meets the
    // personal lane's 29: the two first rows level only when they are 8 px or less apart, the later one's top for both; a
    // whole-row step cost the personal lane its one row in zh at 320x568, gauntlet r13)
    const rightStacks = touch && sideWidth < FEED_STACK_W && (!map || width - map.right - 8 < FEED_STACK_W);
    if (rightStacks && Math.abs(leftAnchor - rightAnchor) <= 8) leftAnchor = rightAnchor = Math.max(leftAnchor, rightAnchor);
    const pitchOff = touch && !rightStacks ? Math.abs(leftAnchor - rightAnchor) % 29 : 0;
    if (pitchOff) {
      const leftLater = leftAnchor >= rightAnchor;
      if (29 - pitchOff <= pitchOff) { if (leftLater) leftAnchor += 29 - pitchOff; else rightAnchor += 29 - pitchOff; }
      else if (leftLater) rightAnchor += pitchOff; else leftAnchor += pitchOff;
    }
    // (its rows counted at the pitch they take: a feed under FEED_STACK_W stacks them 41 px apart, and rows counted at 29
    // ran its last row 10 px into the personal lane in the drone's feed at 320x568, gauntlet r14)
    const wideFeedRoom = touch && width < height && width < 600 && !!map && map.left < width / 2 ? width - map.right - 8 : 0;
    const wideFeedRows = wideFeedRoom > 0
      ? Math.floor((leftAnchor - 8 - rightAnchor + 3) / (wideFeedRoom < FEED_STACK_W ? FEED_STACK_PITCH : 29)) : 0;
    // (one row is enough where the half lane would stack too: the two lanes side by side in one band read as one line at
    // 320x568 and kept no common baseline at 390x844 in the flights, gauntlet r14)
    const wideFeed = wideFeedRows >= (sideWidth < FEED_STACK_W ? 1 : 2);
    const wideFeedWidth = wideFeed ? wideFeedRoom : 0;
    setBodyVar('--hud-kill-right-width', wideFeed ? `${Math.floor(wideFeedWidth)}px` : '');
    // (... and the personal lane under it the window's width, the global feed's rows ending above it: in half the window
    // its callsigns read "Commander_Long…" beside a damage row printing the whole name, gauntlet r5)
    // (never under the ammunition and the consumables where they stand beside it: at 320x568 the lane and the hit rows
    // ran under the column right of the sight, the layout receipt)
    let besideColumn = width - 24;
    // (Watch's rail of controls at the right edge too: the drone's personal lane ran 46 px under it at 390x844, the overlap
    // receipt in round 14)
    for (const box of [ammo, read('.cot-cons'), read('.cot-watch-rail')]) {
      // (beside the rows' band from the lane's anchor: its floor can stand over the anchor, a portrait phone's systems slot)
      if (box && box.left > width / 2 && box.top < Math.max(leftEnd, leftAnchor + 3 * 29) && box.bottom > leftAnchor) besideColumn = Math.min(besideColumn, box.left - 8);
    }
    const wideLeftFeed = wideFeed ? Math.floor(Math.min(besideColumn, KILL_LANE_MAX_W)) : 0;
    // (and the lane and the hit rows at their own width stop there too: the hit rows ran under the consumables)
    setBodyVar('--hud-kill-left-width', wideFeed ? `${wideLeftFeed}px` : touch && width < height && besideColumn < sideWidth ? `${Math.floor(besideColumn)}px` : '');
    // (the global feed's rows stack in a lane too narrow for their two callsigns; the personal lane's killer is "You")
    const rightPitch = touch && (wideFeed ? wideFeedWidth : sideWidth) < FEED_STACK_W ? FEED_STACK_PITCH : 29;
    killRight?.toggleAttribute?.('data-stack', rightPitch !== 29);
    // (a portrait phone's hit rows at the feed's width, min(320 px, the window less 24): battleHudLayout.css)
    setBodyVar('--hud-feed-width', touch && width < height && besideColumn < Math.min(320, width - 24) ? `${Math.floor(besideColumn)}px` : '');
    // A flight's sight at the centre (aerialHud.css .flight-sight) ends a lane that crosses it: a portrait phone's lanes run
    // to the column right of the sight, and the drone's personal lane ran its third row through it at 320x568, gauntlet r14.
    // (and on a portrait phone the tank's reticle, its band around the centre: Watch's ride ran a feed row through the idle
    // ring at 320x568, gauntlet r14)
    // (no reticle while spectating, so no band: at 320x568 the band ended the left lane 4 px under its anchor, its rows
    // gone where the column under the map stood empty, gauntlet r17)
    const flightSight = read('.cot-flight-hud:not([hidden]) .flight-sight');
    const spectating = document.body.classList.contains('cot-spectating');
    const sightY = height / 2 - battleSightShift();
    const sight = flightSight ?? (touch && width < height && !spectating ? { left: width / 2 - SIGHT_BAND_ABOVE, right: width / 2 + SIGHT_BAND_ABOVE,
      top: sightY - SIGHT_BAND_ABOVE, bottom: sightY + SIGHT_BAND_BELOW } : null);
    const sightFloor = (anchor: number, crosses: boolean) =>
      sight && crosses && sight.bottom + 8 > anchor ? sight.top - 8 : Infinity;
    const leftReach = touch && width < height ? Math.max(sideWidth, wideFeed ? wideLeftFeed : besideColumn) : sideWidth;
    // (on mouse the plan's countdown band above already keeps the lanes off it)
    const leftKillBottom = Math.min(!plan && countdown && countdown.left < sideWidth
      && countdown.bottom > leftAnchor ? Math.min(leftEnd, countdown.top - 8) : leftEnd,
    sightFloor(leftAnchor, !!sight && sight.left - 8 < leftReach));
    const leftSpace = Math.max(0, leftKillBottom - leftAnchor);
    // Keep incoming damage and an open chat usable during a burst of kills.
    const chatReserve = chat ? Math.min(leftSpace, Math.max(62, Math.min(140, leftSpace * .4))) : 0;
    const damageReserve = toastCount ? Math.min(116, Math.max(0, (leftSpace - chatReserve) * .45)) : 0;
    // (in Watch the left lane's killers are callsigns, never "You": a lane too narrow for two stacks its rows as the
    // right one does; at 242 px both read "Commander…" at 320x568 in Watch's drone, gauntlet r18)
    const leftPitch = touch && width < height && !wideFeed && document.documentElement?.dataset?.watch !== undefined
      && Math.min(besideColumn, KILL_LANE_MAX_W) < FEED_STACK_W ? FEED_STACK_PITCH : 29;
    killLeft?.toggleAttribute?.('data-stack', leftPitch !== 29);
    const killRowsLeft = battleNotificationRows(leftSpace - chatReserve - damageReserve - (chat || toastCount ? 8 : 0),
      killLeft?.childElementCount || 0, leftPitch);
    setRows(killLeft, killRowsLeft);
    const killHeightLeft = Math.max(0, killRowsLeft * leftPitch - 3);
    const killsLeft = Math.min(killHeightLeft, read('.cot-kill-lane.l')?.height || 0);
    const leftTop = leftAnchor + (killsLeft ? killsLeft + 8 : 0);

    root.classList.toggle('tight-shot-report', dockReport && report.height < 220);
    // (a dock too short for the card's head and its line keeps the head alone: 40 px over the scope's vision switch cut
    // the line through, gauntlet r4 at 1024x600)
    root.classList.toggle('micro-shot-report', dockReport && report.height < MICRO_REPORT_H);
    const rightKillBottom = !plan && countdown && countdown.right > width - sideWidth
      && countdown.bottom > rightAnchor ? Math.min(rightBottom, countdown.top - 8) : rightBottom;
    const rightReach = wideFeed ? width - wideFeedWidth : width - sideWidth;
    const rightKillEnd = Math.min(rightKillBottom, rightKillFloor, rightEnd,
      sightFloor(rightAnchor, !!sight && sight.right + 8 > rightReach));
    const killRowsRight = Math.min(wideFeed ? wideFeedRows : Infinity,
      battleNotificationRows(rightKillEnd - rightAnchor, killRight?.childElementCount || 0, rightPitch));
    setRows(killRight, killRowsRight);
    const killHeightRight = Math.max(0, killRowsRight * rightPitch - 3);
    const killsRight = Math.min(killHeightRight, read('.cot-kill-lane.r')?.height || 0);
    // A portrait phone's personal lane takes the width to the ammunition column where the global feed's room (its rows'
    // capacity, never the rows it holds, so nothing moves as kills come and go) leaves its band: beside an empty half its
    // victims read "Commander…" at 320x568, gauntlet r9.
    const rightRoomRows = battleNotificationRows(rightKillEnd - rightAnchor, MAX_BATTLE_NOTIFICATIONS, rightPitch);
    const rightRoomBottom = rightAnchor + Math.max(0, rightRoomRows * rightPitch - 3);
    const leftAlone = touch && width < height && !wideFeed && killRowsLeft > 0
      && (rightRoomRows === 0 || rightRoomBottom <= leftAnchor - 8 || rightAnchor >= leftKillBottom);
    // ... and beside the global feed's lane it runs to 8 px short of it, not to the half: two half lanes left a 48 px gap
    // between them and cut its victims to "Commander…" at 320x568 in a flight, gauntlet r13.
    const leftBeside = touch && width < height && !wideFeed && !leftAlone && killRowsLeft > 0
      ? Math.floor(Math.min(besideColumn, width - sideWidth - 8, KILL_LANE_MAX_W)) : 0;
    const leftLaneWidth = wideFeed ? wideLeftFeed : leftAlone ? Math.floor(Math.min(besideColumn, KILL_LANE_MAX_W))
      : Math.max(sideWidth, leftBeside);
    if (leftAlone || leftBeside > sideWidth) setBodyVar('--hud-kill-left-width', `${leftLaneWidth}px`);
    const rightTop = dockReport ? report.top : rightAnchor + (killsRight ? killsRight + 8 : 0);
    const notice = read('.cot-sixth');
    let noticeTop: number, alertTop: number;
    // the rows' heights, for the battle's notices under them (ui/battleNotices.ts: the region's top, UI-LOCKDOWN B14)
    let noticeH = notice?.height ?? 48, alertH = read('.cot-alert.show')?.height ?? 32;
    if (plan) {
      noticeTop = plan.detection.y;
      // (an alert raised before the roll-out keeps off the countdown: its own slot then)
      const alertSlot = countdown ? plan.countdownAlert : plan.alert;
      alertTop = alertSlot.y;
      noticeH = plan.detection.h;
      alertH = alertSlot.h;
    } else {
      // Center notices below the score. On narrow screens their horizontal
      // footprint also crosses the team feeds, so clear those occupied lanes.
      const noticeLeft = (width - (notice?.width ?? 248)) / 2;
      noticeTop = Math.max(top + 8, height * .12);
      if (noticeLeft < sideWidth + 14) noticeTop = Math.max(noticeTop, leftTop, rightAnchor + (killsRight ? killsRight + 8 : 0));
      if (systems && noticeTop < systemsTop + systemsHeight + 8
        && noticeTop + (notice?.height ?? 48) > systemsTop - 8
        && noticeLeft < systemsLeft + dockWidth && width - noticeLeft > systemsLeft) {
        noticeTop = systemsTop + systemsHeight + 8;
      }
      if (touch && width > height && height <= 340) noticeTop = Math.max(top + 16, side ? 0 : scoreBottom + 52);
      alertTop = noticeTop + (notice?.height ?? 48) + 8;
    }
    const stack = battleSideStack(leftEnd - leftTop, chat, toastCount);
    setRows(toastHost, stack.toastRows);
    // r10e: a touch layout's centre notices and medal card keep off the reticle's footprint and the HUD's panels
    // (touchNoticePlan.ts); integ's place stays wherever it keeps clear
    // A short landscape parks the warning chip under the map; beside the objective's side seat at its top, below the
    // network button where that stands there. Its place is written before the touch plan measures it (a chip the last pass
    // left elsewhere had the alert set onto its new seat at 568x320, the layout receipt).
    const chipLeft = side ? Math.ceil(side.right) + OBJECTIVE_SEAT_GAP : touch && map ? Math.round(map.left) : 8;
    // (4 px under the map: under 300 px tall the map's 84 px step leaves the 24 px chip 4 px off the stick's crown too,
    // battleHudLayout.css --mm-tiny; at 88 px it had 2 of each at 568x256, gauntlet r9 and r12)
    let chipTop = width > height || touchChipParked(width, height) ? (map?.bottom ?? 114) + 4 : height * .5 + 48;
    if (side) {
      chipTop = side.top;
      if (strip && strip.left < chipLeft + PARKED_CHIP_W && strip.right > chipLeft && strip.bottom > chipTop) chipTop = Math.ceil(strip.bottom) + 4;
    }
    if (touch) {
      setBodyVar('--hud-aim-warning-top', `${Math.floor(chipTop)}px`);
      setBodyVar('--hud-aim-warning-left', `${Math.floor(chipLeft)}px`);
      // (and no wider than the second FIRE beside its row leaves it, its words wrapping: under the map's large step the
      // parked notice ran 20 px onto the button at 844x390, the overlap receipt)
      const altFire = read('.cot-touch.on .fire.alt');
      const beside = altFire && altFire.left > chipLeft && altFire.top < chipTop + PARKED_CHIP_TALL && altFire.bottom > chipTop;
      setBodyVar('--hud-aim-warning-max', beside && altFire ? `${Math.floor(altFire.left - 4 - chipLeft)}px` : '');
    }
    let touchPlan = null;
    // (the touch dial up this pass: once it stands down it keeps its seat and scale while it fades out after GO; set to
    // the plan's default under it, it jumped 98 px over the alert as it faded, the loading census on a phone)
    let touchCountdownShown = false;
    // (no place clears both notices and the detection's would cross a panel: the alert stands in its place while it shows)
    let detectionCovers = false;
    if (touch) {
      const boxes = (selector: string): TouchBox[] => {
        const out: TouchBox[] = [];
        for (const node of hudQueryAll(selector)) {
          const box = shownBox(node);
          if (box) out.push({ x0: box.left, y0: box.top, x1: box.right, y1: box.bottom });
        }
        return out;
      };
      // (the slot chip shares the notices' row: battleHudLayout's slotChip)
      const obstacles = boxes(slotChip ? TOUCH_NOTICE_OBSTACLES.replace(`${AIM_CHIP},`, '') : TOUCH_NOTICE_OBSTACLES);
      if (systems) obstacles.push({ x0: systemsLeft, y0: systemsTop, x1: systemsLeft + dockWidth, y1: systemsTop + systemsHeight });
      // (the countdown's own box, unscaled: the plan sets its scale)
      const countdownNode = hudQuery<HTMLElement>('.cot-prebattle.on');
      const touchCountdown = countdownNode && shownBox(countdownNode) ? { w: countdownNode.offsetWidth, h: countdownNode.offsetHeight } : null;
      touchCountdownShown = !!touchCountdown;
      const rulesNode = hudQuery<HTMLElement>('.cot-prebattle-rules');
      const touchRules = touchCountdown && rulesNode?.offsetWidth ? { w: rulesNode.offsetWidth, h: rulesNode.offsetHeight } : null;
      // (the alert's slot is the detection's width; its wrapped height measured there, while it shows in that form)
      const compactNow = document.body.dataset.touchNotices ?? '';
      // (its full size while it shows compact: one 32 px row, hud.ts .cot-sixth)
      const noticeSize: TouchSize = !compactNow.includes('notice-compact') && notice ? { w: notice.width, h: notice.height } : { w: 214, h: 32 };
      const alertBox = compactNow.includes('alert-compact') ? null : read('.cot-alert.show');
      // (the compact alert planned at its own height while it shows so: two lines of its 8 px type until one does)
      const compactAlertBox = compactNow.includes('alert-compact') ? read('.cot-alert.show') : null;
      // (the card's layout box: it enters scaled)
      const bannerBox = banner?.childElementCount ? { width: banner.offsetWidth, height: banner.offsetHeight } : null;
      // (the kill lanes by the places and heights this pass gives them, while they hold a row)
      const soft = boxes(TOUCH_NOTICE_SOFT);
      if (killsLeft) soft.push({ x0: 0, y0: leftAnchor, x1: leftLaneWidth, y1: leftAnchor + killHeightLeft });
      if (killsRight) soft.push({ x0: width - (wideFeed ? wideFeedWidth : sideWidth), y0: rightAnchor, x1: width, y1: rightAnchor + killHeightRight });
      // (the map apart: through the scope a notice that finds no clear place covers it before the sight's readouts)
      touchPlan = planTouchNotices({ width, height, top, obstacles, soft, labels: boxes(TOUCH_NOTICE_LABELS),
        map: map ? { x0: map.left, y0: map.top, x1: map.right, y1: map.bottom } : null,
        scope: !!read('.cot-scope-vision'), seated: !touchChipParked(width, height), notice: noticeSize,
        alert: { w: noticeSize.w, h: alertBox?.height ?? TOUCH_ALERT_RESERVE_H },
        alertCompact: { w: TOUCH_COMPACT_ALERT.w, h: compactAlertBox?.height ?? TOUCH_COMPACT_ALERT_LINES_H },
        countdown: touchCountdown, countdownRules: touchRules,
        banner: bannerBox ? { w: bannerBox.width, h: bannerBox.height } : null, fallbackTop: noticeTop,
        oneRow: width > height ? height <= 340 : width <= 340, sightY: height / 2 - battleSightShift() });
      noticeTop = touchPlan.noticeTop;
      alertTop = touchPlan.alertTop;
      // (a three-line alert over the sight sent DETECTED under it onto the damage panel at 844x390, the layout receipt)
      if (!touchPlan.cleared) {
        const w = touchPlan.noticeCompact ? TOUCH_COMPACT_NOTICE.w : noticeSize.w;
        const box = { x0: width / 2 - w / 2, y0: noticeTop, x1: width / 2 + w / 2, y1: noticeTop + TOUCH_COMPACT_NOTICE.h };
        detectionCovers = obstacles.some((o) => o.x0 < box.x1 && o.x1 > box.x0 && o.y0 < box.y1 && o.y1 > box.y0);
      }
    }
    const touchNotices = touchPlan ? ['plan', touchPlan.noticeCompact ? 'notice-compact' : '', touchPlan.alertCompact ? 'alert-compact' : '',
      touchPlan.oneRow ? 'one-row' : '', touchPlan.dialOverSight ? 'dial-over-sight' : '', touchPlan.cleared ? '' : 'uncleared'].filter(Boolean).join(' ') : '';
    // (one row: the alert stands in the detection's place while it shows, the detection under it)
    const sixthNode = touch ? root.querySelector<HTMLElement>('.cot-sixth') : null;
    const underAlert = (!!touchPlan?.oneRow || detectionCovers) && !!root.querySelector('.cot-alert.show');
    if (sixthNode && sixthNode.hasAttribute('data-under-alert') !== underAlert) sixthNode.toggleAttribute('data-under-alert', underAlert);
    if ((document.body.dataset.touchNotices ?? '') !== touchNotices) {
      if (touchNotices) document.body.dataset.touchNotices = touchNotices;
      else delete document.body.dataset.touchNotices;
    }
    // Awards use the center lane only when the actual visible HUD leaves room.
    // Keep the card measurable while deferred; no per-frame polling is needed.
    let bannerTop = Math.ceil(touchPlan ? touchPlan.bannerTop : top + 16);
    if (plan) {
      // Mouse: the card has its own place off the reticle (medalReady above), placed once a card is queued.
      const slot = banner?.childElementCount ? plan.medal : null;
      if (slot) bannerTop = slot.y;
      const size = slot?.compact ? 'compact' : '';
      if (banner && (banner.dataset.size ?? '') !== size) {
        if (size) banner.dataset.size = size; else delete banner.dataset.size;
      }
      if (banner?.childElementCount) {
        const placement = medalReady ? 'ready' : 'deferred';
        if (banner.dataset.placement !== placement) {
          banner.dataset.placement = placement;
          banner.dispatchEvent(new Event('cot-banner-placement'));
        }
      }
    } else if (banner?.childElementCount && touchPlan) {
      // Touch: the card's place off the reticle and the notices (touchNoticePlan.ts), or it waits
      const placement = touchPlan.bannerReady ? 'ready' : 'deferred';
      if (banner.dataset.placement !== placement) {
        banner.dataset.placement = placement;
        banner.dispatchEvent(new Event('cot-banner-placement'));
      }
    } else if (banner?.childElementCount) {
      const bounds = banner.getBoundingClientRect();
      const crosses = (box: DOMRect) => bounds.left < box.right + 8 && bounds.right > box.left - 8;
      for (const selector of ['.cot-kill-lane.l', '.cot-kill-lane.r', '.cot-sixth.on', '.cot-alert.show']) {
        const box = read(selector);
        if (box && crosses(box) && bannerTop < box.bottom + 12 && bannerTop + bounds.height > box.top - 12) {
          bannerTop = Math.ceil(box.bottom + 12);
        }
      }
      let fits = bannerTop + bounds.height <= height - 8;
      for (const selector of ['.cot-vehicle-controls', '.cot-shells', '.cot-dp', '.cot-minimap',
        '.cot-touch.on .joy', '.cot-touch.on .autoaim', '.cot-touch.on .scope', '.cot-touch.on .fire', '.cot-cons']) {
        const box = read(selector);
        if (box && crosses(box) && bannerTop < box.bottom + 8 && bannerTop + bounds.height > box.top - 8) fits = false;
      }
      const placement = fits ? 'ready' : 'deferred';
      if (banner.dataset.placement !== placement) {
        banner.dataset.placement = placement;
        banner.dispatchEvent(new Event('cot-banner-placement'));
      }
    }
    if (slotChip && touchPlan) {
      chipTop = touchPlan.noticeTop;
      setBodyVar('--hud-aim-warning-top', `${Math.floor(chipTop)}px`);
    }
    // (the parked chip is the kit's notice in the battle's region, which gives way: battleHudLayout.css)
    const chipNode = slotChip ? hudQuery<HTMLElement>('.cot-battle-notices') : null;
    const underNotice = !!chipNode && !!root.querySelector('.cot-sixth.on,.cot-alert.show');
    if (chipNode && chipNode.hasAttribute('data-under-notice') !== underNotice) chipNode.toggleAttribute('data-under-notice', underNotice);
    const rosterLeftHeight = battleRosterHeight(height, leftBottom - (read('.cot-ear.l')?.top ?? 52), root.querySelector('.cot-ear.l.icon-grid') ? 124 : 48, Number(root.querySelector<HTMLElement>('.cot-ear.l')?.dataset.count) || 0, root.classList.contains('rosters-expanded'));
    const rosterRightHeight = Math.min(battleRosterHeight(height, rightBottom - rosterStart, root.querySelector('.cot-ear.r.icon-grid') ? 124 : 48, rosterCount, root.classList.contains('rosters-expanded')), dockReport ? Math.max(0, report.top - rosterStart - feedRoom) : Infinity);
    const sharedRoster = read('.cot-ear.l') && read('.cot-ear.r') && !root.querySelector('.cot-ear.icon-grid')
      ? Math.min(rosterLeftHeight, rosterRightHeight) : null;
    const [rosterLeft, rosterRight] = [snapRosterHeight(sharedRoster ?? rosterLeftHeight, '.cot-ear.l'), snapRosterHeight(sharedRoster ?? rosterRightHeight, '.cot-ear.r')];
    const rosterHeights = [rosterLeft[0], rosterRight[0]];
    markRosterMore('.cot-ear.l', rosterLeft[1]);
    markRosterMore('.cot-ear.r', rosterRight[1]);
    const ribbonNode = root.querySelector<HTMLElement>('.cot-ribbon');
    if (ribbonNode?.classList) {
      const ribbonWidth = ribbon.width;
      if (ribbonNode.classList.contains('tight') !== ribbonWidth < RIBBON_TIGHT) ribbonNode.classList.toggle('tight', ribbonWidth < RIBBON_TIGHT);
      if (ribbonNode.classList.contains('cramped') !== ribbonWidth < RIBBON_LEAST) ribbonNode.classList.toggle('cramped', ribbonWidth < RIBBON_LEAST);
    }
    // (the map's own width, a large map's too: capped at 300, the log stood 50-60 px off a large map's edge, gauntlet r7)
    const reportWidth = !touch && map && map.left > width / 2 && map.bottom > height / 2 && map.width >= REPORT_MIN_W
      ? Math.floor(Math.min(map.width, width / 2 - 24)) : 0;
    // (the report and the log over a mouse layout's map take its width, their left edges on its edge, the card's plan
    // sized within it: 50 px wider, they stood 50 px left of the map under them, gauntlet r5)
    setBodyVar('--hud-report-width', reportWidth ? `${reportWidth}px` : '');
    const portraitNetworkLeft = (mapBox: DOMRect | null, chromeBox: DOMRect | null): number => {
      const beside = (mapBox?.right ?? 104) + 8;
      const tile = read('.cot-mp-status.battle .cot-mp-strip')?.width ?? 44;
      return chromeBox && beside + tile + NETWORK_TILE_GAP > chromeBox.left ? mapBox?.left ?? 12 : beside;
    };
    const properties = {
      'status-lift': Math.max(5, (read('.cot-dp')?.top ?? 0) - (statusDockBottom() ?? height)),
      'center-notice-width': plan ? plan.detection.w : 248,
      'flight-right-clearance': map && map.left > width / 2 && map.bottom > height / 2 ? width - map.left + 12 : 12,
      // (a portrait phone's tile beside the map where the chrome's row leaves it room, else over the map's column, its left
      // edge on the map's: beside it the outage word ran into the chrome plate's slant at 320x568, gauntlet r19; over the
      // column at 390x844 it met the map's top)
      'network-left': width > height ? Math.max(122, (map?.right ?? 104) + 8) : portraitNetworkLeft(map, chrome),
      'aim-warning-top': chipTop, 'aim-warning-left': chipLeft,
      'fps-top': (read('.cot-spec.show')?.top ?? 36) - 28,
      // (a touch landscape's signal tile level with the map beside it: under the score it floated 44 px down the map's
      // side, on neither edge, gauntlet r12 at 844x390)
      'network-top': width > height ? (touch && map ? map.top : scoreBottom + 4) : (chrome?.top ?? top + 8),
      'network-corner-right': networkRight,
      // the two rosters keep one height while both show, so their rows share one pitch (gauntlet r2: 22 px allies beside
      // 18 px enemies at 1280x720)
      'roster-left-height': rosterHeights[0],
      'roster-right-height': rosterHeights[1],
      'systems-top': systemsTop, 'systems-width': systemsWidth, 'systems-left': systemsLeft,
      // the kill ribbon rests over the systems row, or over a flight's console where that stands higher (the drone's, the
      // gunship's: owner 2026-10-25, "fix overlapping uis like in ac 130")
      'ribbon-top': ribbonTop,
      'ribbon-x': ribbon.x, 'ribbon-w': ribbon.width,
      // the first battles' controls strip (settings.ts) stays on the centre line between the lower corners' instruments
      // (the hull panel and the dial left, the map right) and wraps its groups to fit (gauntlet r1: 900x700 ran it over
      // both)
      'hints-width': hints.width, 'hints-x': hints.x, 'hints-bottom': hints.bottom,
      'systems-beside-dy': systemsBeside && touchChrome ? touchChrome.top - systemsTop : 0,
      'notice-top': noticeTop, 'alert-top': alertTop,
      // (the pointer lock's notice and the network's banner, in the kit's battle region: under the centre's detection and
      // alert, never on them; each stood fixed at the centre top, over the objective and each other, UI-LOCKDOWN B14)
      'battle-notices-top': Math.ceil(Math.max(noticeTop + noticeH, alertTop + alertH) + 8),
      // (the touch plan's own names: the mouse layout's planner writes its own, on its side of the split; tops and widths
      // only, every element on the centre line: noticeCentreLine.ts)
      'touch-alert-w': touchPlan?.alertW ?? width - 24,
      'touch-countdown-top': touchCountdownShown && touchPlan ? touchPlan.countdownTop
        : parseFloat(document.body.style.getPropertyValue('--hud-touch-countdown-top')) || top + 8,
      'touch-rules-top': touchPlan?.rulesTop ?? height,
      'objective-top': objectivePlace.top, 'objective-bottom': top, 'banner-top': bannerTop, 'tray-shift': trayShift,
      'objective-width': objectivePlace.width, 'objective-left': objectivePlace.left,
      // (a short landscape's large map stops short of the score: responsiveSurfaces.css)
      'score-left': score ? score.left : width,
      'kill-left-top': leftAnchor, 'kill-right-top': rightAnchor,
      'kill-left-height': killHeightLeft, 'kill-right-height': killHeightRight,
      'left-top': leftTop, 'left-height': Math.max(0, leftEnd - leftTop),
      'right-top': rightTop, 'right-height': Math.max(0, rightBottom - rightTop),
      'report-right': map && map.left > width / 2 && map.bottom > height / 2 ? width - map.right : 12,
      'toast-height': stack.toastHeight, 'chat-top': leftTop + stack.chatOffset,
      'chat-height': stack.chatHeight,
    };
    const panelVars = panelVarDeclaration() ?? document.body.style;
    for (const [name, value] of Object.entries(properties)) {
      const property = `--hud-${name}`;
      // (a centre and a centred left are written exact: a floored one sets its element up to 1 px off the centre line)
      const pixels = `${CENTRING_VARS.has(name) ? value : Math.floor(value)}px`;
      const target = PANEL_VARS.has(name) ? panelVars : document.body.style;
      if (target.getPropertyValue(property) !== pixels) {
        target.setProperty(property, pixels);
        // an instrument the mouse plan keeps off moves with this write: the next relayout measures its inputs again
        if (movesPlanInputs.has(name)) planInputs = true;
      }
    }
    if (plan) writeMousePlan(plan, { countdown: !!countdown, revive: !!root.querySelector('.cot-revive.on'), medal: !!banner?.childElementCount,
      alert: !!root.querySelector('.cot-alert.show') }, medalWaiting, medalFeedWait);
    // (the touch countdown's and its rules panel's scales and the top slot's buttons a row, unitless)
    const countdownScale = touchCountdownShown ? String(touchPlan?.countdownScale ?? 1)
      : document.body.style.getPropertyValue('--hud-touch-countdown-scale') || '1';
    if (document.body.style.getPropertyValue('--hud-touch-countdown-scale') !== countdownScale) {
      document.body.style.setProperty('--hud-touch-countdown-scale', countdownScale);
    }
    setBodyVar('--hud-touch-rules-scale', String(touchPlan?.rulesScale ?? 1));
    // the rules panel shows only where its plan found it a place under the sight
    const rulesPanel = root.querySelector<HTMLElement>('.cot-prebattle-rules');
    const rulesPlaced = !countdown || (plan ? !!(root.querySelector('.cot-alert.show') ? plan.countdownUnderAlert : plan.countdown)?.rules
      : !!touchPlan?.rulesShown);
    if (rulesPanel && rulesPanel.classList.contains('unplaced') === rulesPlaced) rulesPanel.classList.toggle('unplaced', !rulesPlaced);
    const perRow = systemsPerRow ? String(systemsPerRow) : '';
    if (document.body.style.getPropertyValue('--hud-systems-per-row') !== perRow) {
      if (perRow) document.body.style.setProperty('--hud-systems-per-row', perRow);
      else document.body.style.removeProperty('--hud-systems-per-row');
    }
    const rosterProperty = '--hud-roster-top-right';
    const rosterPixels = rosterTopRight === null ? '' : `${rosterTopRight}px`;
    if (document.body.style.getPropertyValue(rosterProperty) !== rosterPixels) {
      if (rosterPixels) document.body.style.setProperty(rosterProperty, rosterPixels);
      else document.body.style.removeProperty(rosterProperty);
    }
    const toastRows = String(stack.toastRows);
    if (root.dataset.toastRows !== toastRows) root.dataset.toastRows = toastRows;
    yieldKillRibbon();
    seatScopeVision(width, height, touch);
    publishSightFurniture(touch);
    publishBattleBandsNow(width, height, touch, hints, sightRiseCap);
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(refresh);
  }
  watchAttributes(document.body, ['class'], true);
  watchAttributes(root, ['style', 'class'], true);
  changes.observe(document.documentElement, { attributes: true, attributeFilter: [SCOPED_ATTRIBUTE] });
  window.addEventListener('resize', schedule, { passive: true });
  // (a relayout request may come from anything, the network strip mounting outside the HUD root among them: it is a new
  // plan input too)
  window.addEventListener('cot-hud-relayout', () => { planInputs = true; scanParts = true; });
  window.addEventListener('cot-hud-relayout', schedule);
  // (battle-camera-264) the chase framing raised or lowered the battle sight: the notices replan around its new place
  onBattleSightShift(() => { planInputs = true; schedule(); });
  // Keyboard and toolbar changes of the visible height arrive here once responsiveLayout.ts has resized the root.
  window.addEventListener('cot:layoutchange', schedule);
  // The HUD's faces arriving re-measure a side seat a fallback face set too tall (only then: a relayout the faces cause
  // anywhere else is the observers').
  document.fonts?.addEventListener?.('loadingdone', () => {
    if (!seatAwaitsFaces) return;
    seatAwaitsFaces = false;
    planInputs = true;
    schedule();
  });
  // Transforms (notably the spectator tray's entrance) do not resize the
  // border box. Measure the settled position without polling its animation.
  // A pass that lands mid-fade measures the reticle's furniture where its fade has it, so the end of a furniture's own fade
  // measures it again (r10e: the touch tray's two collapsed shell slots, fading out behind the selected one, stayed
  // published until some later relayout). Only the furniture's own opacity or visibility: a child's transition bubbling
  // up, or any other property (the same slots' slower scale, which ended inside the layout receipt's idle window), asks
  // for nothing, and every end in a frame shares its one relayout.
  const transitionFinished = (event: Event) => {
    const target = event.target as Element;
    if (observed.has(target)
      || (FURNITURE_SETTLES.has((event as TransitionEvent).propertyName) && target.matches?.(SIGHT_FURNITURE))) {
      planInput(target);
      schedule();
    }
  };
  window.addEventListener('transitionend', transitionFinished);
  window.addEventListener('transitioncancel', transitionFinished);
  schedule();
}
