/**
 * Touch action dock: where the vehicle-controls row ("the stuff you can do": jump, special action, drone, missile,
 * smoke, lights, roof gun) sits on a phone or tablet, and how its cooldowns read.
 *
 * The desktop strip is a 74 x 32 px text row. On touch it used to be the same row at 44 px with 9 px labels, placed
 * above the ammo selector and scrolled sideways under a hidden scrollbar once five controls no longer fit, so on a
 * 360 px phone the last controls were simply off-screen. The dock instead lays the controls out as icon tiles in the
 * row's order and never scrolls. Its position is searched, not hard-coded: the dock goes to the free spot nearest the
 * point between the two thumbs (the joystick and FIRE), keeping a clearance from every fixed touch control and
 * instrument it is given, and from everything the reticle draws.
 *
 * One rule, on every touch screen (the browser receipt tools/battle-hud-layout.browser.mjs checks the same rule):
 * - Every tile is at least 44 x 44 px, Apple's minimum touch target (Human Interface Guidelines); 48 px, Material's
 *   comfortable target, wherever it fits. 48 px everywhere is not possible: a 360 x 640 phone has a 45 px band
 *   between its minimap and the open ammo drawer, and a 320 x 568 phone or a 568 x 256 landscape browser has no
 *   room for a row of 48 px tiles that clears its joystick, FIRE cluster and instruments.
 * - The dock never scrolls and never covers a fixed control, an instrument, anything the reticle draws in any sight
 *   mode at any bloom (touchReticleFootprint: the ring, the scope's cross arms, the magazine and reload countdown, the
 *   scope's ammunition line, zoom plate and range tag), or the gun-limit warning's place (touchAimWarningSlot).
 * - When the whole row does not fit, the dock shows the first controls (in a jump mode the jump comes first) and a
 *   More tile; More opens the rest beside it. The open panel may lie over instruments for that moment, never over the
 *   reticle's footprint or the gun-limit warning's place, and never over a touch control unless the screen leaves no
 *   other room (then it clears only the dock and the aim keep-out). Every control is one tap away, or two through
 *   More; none is ever off-screen.
 *
 * Rows fill from the bottom: the first control is the bottom-left tile, nearest the thumbs, and a second or third row
 * stacks above it. DOM-free and deterministic, so placement is checked in plain Node (touchActionDock.selftest.mjs)
 * for every touch viewport of the browser receipt, and recomputed by battleHudLayout.ts only when its inputs change.
 */

export interface TouchDockRect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
/** A circular keep-out: nothing of the dock may come within `r` of its centre (plus a 2 px hairline). */
export interface TouchDockDisc { readonly x: number; readonly y: number; readonly r: number }
/** What the dock and its More panel never cover: discs and rects, each kept a 2 px hairline clear. */
export type TouchDockKeepOut = TouchDockDisc | TouchDockRect;

export interface TouchDockPlacement extends TouchDockRect {
  /** Tile edge in px: 48, or 44 (Apple's minimum touch target) where 48 does not fit. */
  readonly tile: number;
  readonly columns: number;
  readonly rows: number;
  /** One rect per dock slot, in the row's order: the first `shown` controls, then the More tile when `more`. */
  readonly tiles: readonly TouchDockRect[];
  /** How many controls the dock itself shows (all of them unless `more`). */
  readonly shown: number;
  /** The last slot is the More tile, and the remaining controls open in `flyout`. */
  readonly more: boolean;
  /** One rect per control behind More, in the row's order (empty when everything fits). */
  readonly flyout: readonly TouchDockRect[];
  /** The dock stands in a reserved lane: no room at all cleared the lanes (568 x 256). A notice shown there draws over
   *  it, and a tap still reaches the tile through the notice. */
  readonly inLane: boolean;
}

interface TouchDockInput {
  readonly width: number;
  readonly height: number;
  /** Visible controls in the row. */
  readonly count: number;
  /** Touch controls the dock and its More panel never cover. */
  readonly obstacles: readonly TouchDockRect[];
  /** Instruments the dock never covers; the More panel may lie over them while it is open. */
  readonly soft?: readonly TouchDockRect[];
  /** Lanes reserved for passing notices (touchReservedLanes): kept clear like instruments, unless the screen leaves no
   *  room for even a lone More tile (568 x 320 and 568 x 256 landscape); then the dock may stand in them. */
  readonly lanes?: readonly TouchDockRect[];
  /** The reticle's footprint and the gun-limit warning's place (touchAimKeepOut): neither the dock nor its More panel
   *  comes within a 2 px hairline of them, even in the panel's last resort. */
  readonly keepOut?: readonly TouchDockKeepOut[];
  /** Where the thumbs rest (between the joystick and FIRE); the default is the bottom centre. */
  readonly anchor?: { readonly x: number; readonly y: number } | null;
  /** Safe-area insets (notch, home indicator). */
  readonly insets?: { readonly top?: number; readonly right?: number; readonly bottom?: number; readonly left?: number } | null;
}

/** A tile is a 48 px square where it fits: the size of the touch quick buttons' family. */
export const TOUCH_ACTION_TILE_PX = 48;
/** The floor: Apple's 44 pt minimum touch target. No dock tile is ever smaller. */
export const TOUCH_ACTION_MIN_TILE_PX = 44;
export const TOUCH_ACTION_GAP_PX = 6;
/** Space kept between the dock and any other control, and between the dock and the screen edge. */
export const TOUCH_ACTION_CLEARANCE_PX = 8;
const STEPS = [
  { tile: TOUCH_ACTION_TILE_PX, clearance: TOUCH_ACTION_CLEARANCE_PX },
  { tile: TOUCH_ACTION_MIN_TILE_PX, clearance: 6 },
] as const;
const EDGE_PX = 12;
/** One extra row costs as much as this much more distance from the thumbs: a single row wins whenever one fits nearby. */
const ROW_PENALTY_PX = 72;
/** 44 px tiles cost as much as this much more distance from the thumbs. */
const SMALL_TILE_PENALTY_PX = 48;
const MAX_ROWS = 3;
/** The aim keep-out is the reticle's own ink; tiles keep this hairline off it. */
const RETICLE_CLEARANCE_PX = 2;

/**
 * The crosshair keep-out. Touch aim raycasts through the screen centre, where the reticle canvas (.cot-ret, hud.ts)
 * draws the camera cross and the dispersion ring. The ring's radius runs from 11 px to RET_CEIL_FRAC (0.15) of the
 * shorter screen side at full bloom; the keep-out is that full-bloom ring, and never less than the 64 px crosshair
 * area (32 px radius), so no tile sits on the crosshair or on the ring around it, however far the ring blooms.
 */
export const TOUCH_ACTION_RETICLE = Object.freeze({ minRadiusPx: 32, ringCeilFraction: .15, ringFloorPx: 11 });

export function touchReticleKeepOut(width: number, height: number): TouchDockDisc {
  return { x: width / 2, y: height / 2,
    r: Math.max(TOUCH_ACTION_RETICLE.minRadiusPx, Math.ceil(TOUCH_ACTION_RETICLE.ringCeilFraction * Math.min(width, height))) };
}

/**
 * Where hud.ts draws the reticle's readouts on .cot-ret, around the aiming point at the screen centre, as offsets in
 * CSS px. Each entry restates one hud.ts placement (touchActionDock.selftest.mjs pins those lines, so a change there
 * fails until this follows) and widens its text by the widest copy the readout can print, the 3 px text shadow and
 * the stroke; the browser receipt (tools/battle-hud-layout.browser.mjs) records every glyph and stroke the canvas
 * draws in the battle and scope sights, at rest and at full bloom, and checks each lies inside this footprint.
 */
export const TOUCH_ACTION_RETICLE_READOUTS = Object.freeze({
  /** drawScope: cross arms from the ring out to 1.55 r + 3 (2.4 px under-stroke), mil ticks 4.5 px either side. */
  armReachFactor: 1.55, armReachPx: 3 + 1.2, armHalfWidthPx: 6.5,
  /** paintAutoloaderMagazine and paintReloadCountdown, under the marker in both sights: the centre clearance is
   *  14 + (zoomScale - 1) * 9 (zoomScale to 1.8 in the scope), the rack 6 px below it (16 px shells sitting up to
   *  2.25 px lower, 3 px outline), the countdown 15 px under the rack or the clearance (16 px numerals, or SWITCHING
   *  while a round is chosen, its caps rising 12 px from a baseline 29 px down in the battle sight). */
  stackTopPx: 12, stackBottomPx: 21.2 + 6 + 2.25 + 16 + 15 + 7, stackHalfWidthPx: 56,
  /** paintSniperAmmoReadout: 13.5 px count + 9 px type ("120 APFSDS"), baseline at sniperAmmoReadoutY. */
  ammoAscentPx: 13, ammoDescentPx: 6, ammoHalfWidthPx: 46,
  /** paintSniperZoom: 16 px "x25.0" 18 px (300 px tall and less) or 24 px under the ammunition, its rules running 12 + 20 px
   *  past the text either side. */
  zoomAscentPx: 15, zoomDescentPx: 7, zoomHalfWidthPx: 60,
  /** paintSniperDistance: 11.5 px "1500 m" off the ring's 4:30 point, 0.7071 (r + 9) out, 4 px right and 12 px down. */
  rangeWidthPx: 56, rangeAscentPx: 12, rangeDescentPx: 6,
});

/** sniperAmmoReadoutY (hud.ts): the scope's ammunition baseline below the aiming point, for ring radius `r`. */
function scopeAmmoOffset(height: number, r: number): number {
  if (height <= 300) return 32;
  if (height <= 430) return 44;
  return Math.min(Math.max(r * 1.02 + 24, r * 1.55 + 18, 96), height - 176 - height / 2);
}

/**
 * Everything the reticle canvas draws around the aiming point, in the battle sight and the scope, at every ring
 * radius from rest (11 px) to full bloom: the full-bloom ring (touchReticleKeepOut), the scope's cross arms, the
 * magazine and reload countdown under the marker, the scope's ammunition line and zoom plate below them and its range
 * tag off the ring's lower right. The dock does not move when the sight changes or the ring blooms, so it keeps clear
 * of all of it at once. The range tag rides the ring outward as it blooms; the sweep is covered exactly by the boxes
 * spanning each pair of sampled radii.
 */
export function touchReticleFootprint(width: number, height: number): TouchDockKeepOut[] {
  const R = TOUCH_ACTION_RETICLE_READOUTS;
  const cx = width / 2, cy = height / 2;
  const ceil = Math.max(TOUCH_ACTION_RETICLE.ringFloorPx, TOUCH_ACTION_RETICLE.ringCeilFraction * Math.min(width, height));
  const floor = TOUCH_ACTION_RETICLE.ringFloorPx;
  const arm = ceil * R.armReachFactor + R.armReachPx;
  const zoomGap = height <= 300 ? 18 : 24;
  const ammoTop = cy + scopeAmmoOffset(height, floor) - R.ammoAscentPx;
  const zoomBottom = cy + scopeAmmoOffset(height, ceil) + zoomGap + R.zoomDescentPx;
  const footprint: TouchDockKeepOut[] = [
    touchReticleKeepOut(width, height),
    { x: cx - arm, y: cy - R.armHalfWidthPx, w: arm * 2, h: R.armHalfWidthPx * 2 },
    { x: cx - R.armHalfWidthPx, y: cy - arm, w: R.armHalfWidthPx * 2, h: arm * 2 },
    { x: cx - R.stackHalfWidthPx, y: cy + R.stackTopPx, w: R.stackHalfWidthPx * 2, h: R.stackBottomPx - R.stackTopPx },
    { x: cx - R.zoomHalfWidthPx, y: ammoTop, w: R.zoomHalfWidthPx * 2, h: zoomBottom - ammoTop },
  ];
  const tag = (r: number) => {
    const out = .7071 * (r + 9);
    return { x0: cx + out + 4 - 3, y0: cy + out + 12 - R.rangeAscentPx, x1: cx + out + 4 + R.rangeWidthPx, y1: cy + out + 12 + R.rangeDescentPx };
  };
  const SAMPLES = 4;
  for (let k = 0; k < SAMPLES; k++) {
    const a = tag(floor + (ceil - floor) * k / SAMPLES), b = tag(floor + (ceil - floor) * (k + 1) / SAMPLES);
    footprint.push({ x: a.x0, y: a.y0, w: b.x1 - a.x0, h: b.y1 - a.y0 });
  }
  return footprint;
}

/** What neither the dock nor its More panel ever covers: the reticle's footprint and the gun-limit warning's place. */
export function touchAimKeepOut(width: number, height: number, minimapBottom: number): TouchDockKeepOut[] {
  return [...touchReticleFootprint(width, height), touchAimWarningSlot(width, height, minimapBottom)];
}

/**
 * The gun-limit warning's own place (.cot-aim-warning, battleHudLayout.css), reserved whether or not it shows, so the
 * warning never has to move for the dock (it used to be pushed onto the crosshair): 48 px under the crosshair on
 * portrait and tall screens, 326 px down on 340 px phones, under the minimap on landscape phones (549 px tall and less).
 * The height leaves room for a second line of copy.
 */
export function touchAimWarningSlot(width: number, height: number, minimapBottom: number): TouchDockRect {
  if (width > height && height <= 549) return { x: 8, y: minimapBottom + 4, w: 106, h: 24 };
  if (width <= 340 && height > width) return { x: 94, y: 326, w: 156, h: 36 };
  return { x: width / 2 - 90, y: height / 2 + 48, w: 180, h: 36 };
}

/**
 * The landscape pre-battle countdown's box before it has been seen at this size (battleHudLayout.ts remembers the
 * measured one from the countdown that opens every battle). It mirrors the stylesheet: on short landscape screens
 * (519 px tall and less) objective bottom + 8, 100vw - 420 wide, the 30 + 7 + 92 px rows scaled .82 (20 + 3 + 48
 * unscaled at 340 px and less; one 40 px row at 299 px and less); taller screens 22% down, min(390, 100vw - 32) x 136.
 */
export function touchCountdownEstimate(width: number, height: number, objectiveBottom: number): TouchDockRect {
  if (height <= 519) {
    const w = width - 420, y = objectiveBottom + 8;
    if (height <= 299) return { x: (width - w) / 2, y, w, h: 40 };
    if (height <= 340) return { x: (width - w) / 2, y, w, h: 74 };
    return { x: (width - w * .82) / 2, y: y + 136 * .09, w: w * .82, h: 136 * .82 };
  }
  const w = Math.min(390, width - 32);
  return { x: (width - w) / 2, y: height * .22, w, h: 136 };
}

/**
 * Lanes the dock keeps clear of although nothing may be showing there yet, so it never has to move when they appear:
 * the gun-limit warning's place, and in landscape the pre-battle countdown and the centre notices' lane (detection
 * over the system alert under the objective; at 340 px tall and less their fixed band, side by side at 299 px and
 * less). The alert's lane holds two lines of its copy: 8 px type at 299 px and less (30 px with padding), else 34 px.
 * Portrait notices make room for the dock instead (battleHudLayout.ts).
 */
export function touchReservedLanes({ width, height, objectiveBottom, scoreBottom, minimapBottom, countdown, sixthHeight }: {
  readonly width: number; readonly height: number; readonly objectiveBottom: number; readonly scoreBottom: number;
  readonly minimapBottom: number; readonly countdown: TouchDockRect | null; readonly sixthHeight: number;
}): TouchDockRect[] {
  const lanes = [touchAimWarningSlot(width, height, minimapBottom)];
  if (width > height) {
    lanes.push(countdown ?? touchCountdownEstimate(width, height, objectiveBottom));
    const y = height <= 340 ? Math.max(objectiveBottom + 16, scoreBottom + 52) : Math.max(objectiveBottom + 8, height * .12);
    if (height <= 299) lanes.push({ x: 122, y, w: 278, h: Math.max(sixthHeight, 30) });
    else if (height <= 340) {
      // Detection min(214, 100vw - 28) wide, the alert (180 at most) 8 px under it, each centred: two boxes, not
      // their 248 px common box, so a tile can stand in the corner they leave (568 x 320).
      const sixthW = Math.min(214, width - 28);
      lanes.push({ x: (width - sixthW) / 2, y, w: sixthW, h: sixthHeight }, { x: width / 2 - 90, y: y + sixthHeight + 8, w: 180, h: 34 });
    } else lanes.push({ x: width / 2 - 124, y, w: 248, h: sixthHeight + 8 + 34 });
  }
  return lanes;
}

const extent = (count: number, tile: number) => count * tile + Math.max(0, count - 1) * TOUCH_ACTION_GAP_PX;

interface Block { x: number; y: number; columns: number; rows: number; cost: number }

// Blocked x intervals for one candidate row band, reused across every search (no per-position allocation).
let blocked = new Float64Array(64);

/**
 * The block of `slots` tiles nearest `anchor` that clears every rect by `c` and every keep-out by a 2 px hairline, or null (also null when nothing
 * costs less than `limit`). Candidates are 1 to 3 rows; for each row count every vertical position on the 1 px grid is
 * tried and the best horizontal position at that height is solved exactly from the obstacles' blocked intervals. A
 * height whose vertical distance alone already costs as much as the best block so far is skipped, and once the band
 * is above the anchor every higher one is farther still, so the search stops there.
 */
function searchBlock(width: number, height: number, insets: TouchDockInput['insets'], slots: number, tile: number, c: number,
  rects: readonly (readonly TouchDockRect[])[], keep: readonly TouchDockKeepOut[], ax: number, ay: number, limit = Infinity): Block | null {
  const left = EDGE_PX + Math.max(0, insets?.left ?? 0);
  const right = width - EDGE_PX - Math.max(0, insets?.right ?? 0);
  const top = EDGE_PX + Math.max(0, insets?.top ?? 0);
  const bottom = height - EDGE_PX - Math.max(0, insets?.bottom ?? 0);
  let total = keep.length;
  for (const list of rects) total += list.length;
  if (blocked.length < total * 2) blocked = new Float64Array(total * 2);
  let best: Block | null = null;
  for (let rows = 1; rows <= Math.min(MAX_ROWS, slots); rows++) {
    const columns = Math.ceil(slots / rows);
    // Two row counts can need the same columns (5 slots: 3 columns for 2 rows, also 2 for 3): keep the fewest rows.
    if (rows > 1 && Math.ceil(slots / columns) !== rows) continue;
    const w = extent(columns, tile), h = extent(rows, tile);
    if (left + w > right || top + h > bottom) continue;
    const lo = Math.ceil(left), hi = Math.floor(right - w);
    const target = ax - w / 2, penalty = ROW_PENALTY_PX * (rows - 1);
    for (let y = Math.floor(bottom - h); y >= Math.ceil(top); y--) {
      // Exact pruning: cost >= vertical distance + row penalty, and a block replaces the best only when cheaper.
      if (Math.abs(y + h / 2 - ay) + penalty >= Math.min(limit, best ? best.cost - 1e-9 : Infinity)) {
        if (y + h / 2 <= ay) break;
        continue;
      }
      let n = 0;
      for (const list of rects) {
        for (const o of list) {
          if (y < o.y + o.h + c && y + h > o.y - c) { blocked[n++] = o.x - c - w; blocked[n++] = o.x + o.w + c; }
        }
      }
      for (const k of keep) {
        if ('r' in k) {
          const reach = k.r + RETICLE_CLEARANCE_PX;
          const dy = k.y < y ? y - k.y : k.y > y + h ? k.y - y - h : 0;
          if (dy >= reach) continue;
          const half = Math.sqrt(reach * reach - dy * dy);
          blocked[n++] = k.x - half - w; blocked[n++] = k.x + half;
        } else if (y < k.y + k.h + RETICLE_CLEARANCE_PX && y + h > k.y - RETICLE_CLEARANCE_PX) {
          blocked[n++] = k.x - RETICLE_CLEARANCE_PX - w; blocked[n++] = k.x + k.w + RETICLE_CLEARANCE_PX;
        }
      }
      const x = nearestFreeX(n, lo, hi, target);
      if (x === null) continue;
      const cost = Math.hypot(x + w / 2 - ax, y + h / 2 - ay) + penalty;
      if (!best || cost < best.cost - 1e-9) best = { x, y, columns, rows, cost };
    }
  }
  return best;
}

/** The integer x in [lo, hi] outside every open interval (the first `n` entries of `blocked`, in pairs) nearest `target`. */
function nearestFreeX(n: number, lo: number, hi: number, target: number): number | null {
  if (lo > hi) return null;
  let best = NaN;
  // Candidates: the target itself, the bounds, and both integer edges of every blocked interval.
  for (let k = -3; k < n; k++) {
    const raw = k === -3 ? Math.round(target) : k === -2 ? lo : k === -1 ? hi
      : (k & 1) === 0 ? Math.floor(blocked[k]) : Math.ceil(blocked[k]);
    const x = raw < lo ? lo : raw > hi ? hi : raw;
    let free = true;
    for (let i = 0; i < n; i += 2) if (x > blocked[i] && x < blocked[i + 1]) { free = false; break; }
    if (!free) continue;
    const distance = Math.abs(x - target), bestDistance = Math.abs(best - target);
    if (Number.isNaN(best) || distance < bestDistance || (distance === bestDistance && x < best)) best = x;
  }
  return Number.isNaN(best) ? null : best;
}

/** Slot rects of a block, filled from the bottom row up, left to right: slot 0 is the bottom-left tile. */
function blockTiles(block: Block, slots: number, tile: number): TouchDockRect[] {
  const tiles: TouchDockRect[] = [];
  for (let i = 0; i < slots; i++) {
    const row = Math.floor(i / block.columns);
    tiles.push({ x: block.x + (i % block.columns) * (tile + TOUCH_ACTION_GAP_PX),
      y: block.y + (block.rows - 1 - row) * (tile + TOUCH_ACTION_GAP_PX), w: tile, h: tile });
  }
  return tiles;
}

/**
 * The dock nearest the thumbs that clears every obstacle, soft lane and keep-out: all `count` controls when they fit
 * (48 px tiles, else 44 px), otherwise as many as fit with the last slot a More tile and the rest in a panel beside it.
 * Null only when not even one 44 px tile fits anywhere (the caller then keeps the older strip).
 */
export function placeTouchActionDock(input: TouchDockInput): TouchDockPlacement | null {
  const { width, height, obstacles, insets } = input;
  const n = Math.floor(input.count);
  if (!(n > 0) || !(width > 0) || !(height > 0)) return null;
  const soft = input.soft ?? [];
  const keep = input.keepOut ?? [];
  const ax = input.anchor && Number.isFinite(input.anchor.x) ? input.anchor.x : width / 2;
  const ay = input.anchor && Number.isFinite(input.anchor.y) ? input.anchor.y
    : height - EDGE_PX - Math.max(0, insets?.bottom ?? 0);
  // Clear of the reserved lanes first, down to a lone More tile; only a screen without room even for that stands the
  // dock in a lane (never on a control, an instrument, the reticle's footprint or the gun-limit warning's place).
  const reserved = input.lanes ?? [];
  for (const [tier, dockLanes] of (reserved.length ? [[obstacles, soft, reserved], [obstacles, soft]] : [[obstacles, soft]]).entries()) {
    const placed = placeTiers(input, n, dockLanes, keep, ax, ay, tier > 0);
    if (placed) return placed;
  }
  return null;
}

function placeTiers(input: TouchDockInput, n: number, dockLanes: readonly (readonly TouchDockRect[])[],
  keep: readonly TouchDockKeepOut[], ax: number, ay: number, inLane: boolean): TouchDockPlacement | null {
  const { width, height, obstacles, insets } = input;
  for (let slots = n; slots >= 1; slots--) {
    // 48 px tiles near the thumbs beat 44 px ones; a 44 px row by the thumbs beats a 48 px block across the screen.
    const options: { block: Block; step: (typeof STEPS)[number] }[] = [];
    for (const step of STEPS) {
      // With the whole row placed (no More panel that could fail), a 44 px block is wanted only if it beats the 48 px one.
      const limit = slots === n && options.length && step.tile < TOUCH_ACTION_TILE_PX
        ? options[0].block.cost - SMALL_TILE_PENALTY_PX : Infinity;
      const block = searchBlock(width, height, insets, slots, step.tile, step.clearance, dockLanes, keep, ax, ay, limit);
      if (block) options.push({ block, step });
    }
    options.sort((a, b) => (a.block.cost + (a.step.tile < TOUCH_ACTION_TILE_PX ? SMALL_TILE_PENALTY_PX : 0))
      - (b.block.cost + (b.step.tile < TOUCH_ACTION_TILE_PX ? SMALL_TILE_PENALTY_PX : 0)));
    for (const { block, step } of options) {
      const tiles = blockTiles(block, slots, step.tile);
      const w = extent(block.columns, step.tile), h = extent(block.rows, step.tile);
      const rect = { x: block.x, y: block.y, w, h };
      if (slots === n) {
        return { ...rect, tile: step.tile, columns: block.columns, rows: block.rows, tiles, shown: n, more: false, flyout: [], inLane };
      }
      // More: the last slot. The rest open beside it, clear of the touch controls, the dock and the aim keep-out; on a
      // screen too crowded even for that, clear of the dock and the aim keep-out alone.
      const more = tiles[slots - 1];
      const hidden = n - (slots - 1);
      const mx = more.x + more.w / 2, my = more.y + more.h / 2;
      const panel = searchBlock(width, height, insets, hidden, step.tile, step.clearance, [obstacles, [rect]], keep, mx, my)
        ?? searchBlock(width, height, insets, hidden, step.tile, step.clearance, [[rect]], keep, mx, my);
      if (!panel) continue;
      return { ...rect, tile: step.tile, columns: block.columns, rows: block.rows, tiles, shown: slots - 1, more: true,
        flyout: blockTiles(panel, hidden, step.tile), inLane };
    }
  }
  return null;
}

/**
 * A cooldown sweep for a control whose total cooldown the HUD does not know (smoke, the drone, a missile launcher):
 * the first remaining time seen after the control was ready is the whole cooldown, so the sweep reads 1 at the start
 * and runs down to 0. A longer remaining time than the latched one starts a new cooldown.
 */
export function createCooldownSweep(): (remainingS: number) => number {
  let peak = 0;
  return (remainingS) => {
    const remaining = Number.isFinite(remainingS) ? Math.max(0, remainingS) : 0;
    if (remaining <= 0) { peak = 0; return 0; }
    if (remaining > peak) peak = remaining;
    return remaining / peak;
  };
}
