/**
 * The proving ground's range card (v2 progression, owner 2026-10-17: "build out all the options": proving ground / test
 * drive). A HUD panel in the left lane: every lane's set range, presented angle and target hull, the expected outcome of
 * the loaded round laid on that hull's centre of mass, and the thickest rolled plate the round defeats at the range's
 * plate angles (sim/provingGround.ts provingShellCard measures all of it once, when the range is laid out). The lane the
 * gun is laid on is lit. Two controls close it: reset the range (every hull back on its mark) and moving targets; on a
 * keyboard their bound keys (R and Y by default), on a phone the buttons themselves.
 *
 * The final UI moves to the brand overhaul's components (streams/brand-ui SPEC.md); this is the minimal hook. It renders
 * only when the inputs change (the range record, the loaded slot, the laid lane, the switch, the key labels), so the HUD's
 * per-frame update does no DOM or string work on a steady frame.
 */
import { createElement, ensureStyle } from './dom.ts';
import { FONT_COND } from './fonts.ts';
import { t } from './i18n.ts';
import { uiIconSVG } from './uiIcons.ts';

/** The range as the HUD receives it (sim/matchModes.ts ProvingRangePresentation, structurally). */
export interface RangeCardState {
  readonly moving: boolean;
  readonly plateAnglesDeg: readonly number[];
  readonly lanes: ReadonlyArray<{
    readonly index: number;
    readonly rangeM: number;
    readonly presentDeg: number;
    readonly x: number;
    readonly z: number;
    readonly targetId: string;
    readonly targetName: string;
    readonly shells: ReadonlyArray<{
      readonly penMm: number;
      readonly ratio: number;
      readonly outcome: 'pen' | 'marginal' | 'nopen';
      readonly plateMm: readonly number[];
    }>;
  }>;
}

interface RangeCardInput {
  readonly range: RangeCardState | null | undefined;
  /** The loaded shell slot and its name (the HUD's own shell rail names it). */
  readonly shellSlot: number;
  readonly shellName: string;
  /** The hull the gun is laid on (the aim's gun target), or null. */
  readonly laidTargetId: string | null;
  readonly resetKey: string;
  readonly movingKey: string;
}

interface ProvingRangeCard {
  readonly root: HTMLElement;
  update(input: RangeCardInput): void;
  hide(): void;
}

const CSS = `
.cot-range-card{position:absolute;z-index:var(--hud-layer-controls,30);left:12px;
  top:calc(var(--hud-left-top,120px) + var(--hud-toast-height,0px) + 8px);
  width:min(300px,var(--hud-side-width,300px));max-height:calc(var(--hud-left-height,60vh) - var(--hud-toast-height,0px) - 8px);
  overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;display:none;flex-direction:column;gap:2px;
  padding:7px 8px 8px;color:#e8f0f5;background:rgba(7,11,15,.82);border:1px solid rgba(176,194,208,.24);
  box-shadow:0 6px 16px rgba(0,0,0,.36);font:700 10px ${FONT_COND};letter-spacing:.04em;pointer-events:auto;}
.cot-range-card.show{display:flex}
.cot-range-card .rc-head{display:flex;align-items:center;gap:6px;padding-bottom:4px;margin-bottom:2px;
  border-bottom:1px solid rgba(176,194,208,.18);text-transform:uppercase;letter-spacing:.14em;font-size:9px}
.cot-range-card .rc-head .mi,.cot-range-card .rc-head .mi svg{display:block;width:14px;height:14px;color:#f0a030}
.cot-range-card .rc-head .sh{margin-left:auto;color:#fff1d6;letter-spacing:.06em}
.cot-range-card .rc-lane{display:grid;grid-template-columns:14px 44px minmax(0,1fr) auto;gap:2px 6px;align-items:baseline;
  padding:3px 4px;border-left:2px solid transparent}
.cot-range-card .rc-lane.laid{background:rgba(240,160,48,.12);border-left-color:#f0a030}
.cot-range-card .rc-n{color:#798996;font-variant-numeric:tabular-nums}
.cot-range-card .rc-r{color:#e2ebf2;font-variant-numeric:tabular-nums}
.cot-range-card .rc-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#c8d4dc}
.cot-range-card .rc-t small{color:#798996;margin-left:4px;font-size:9px}
.cot-range-card .rc-o{font-variant-numeric:tabular-nums;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
.cot-range-card .rc-o.pen{color:#7ee87e}.cot-range-card .rc-o.marginal{color:#f3a536}.cot-range-card .rc-o.nopen{color:#f05a5a}
.cot-range-card .rc-p{grid-column:2 / -1;color:#798996;font-size:9px;font-variant-numeric:tabular-nums;letter-spacing:.02em}
.cot-range-card .rc-foot{display:flex;gap:6px;margin-top:5px}
.cot-range-card .rc-foot button{flex:1 1 0;min-height:30px;display:flex;align-items:center;justify-content:center;gap:5px;
  padding:4px 6px;color:#e8f0f5;background:rgba(126,148,164,.12);border:1px solid rgba(176,194,208,.28);
  font:800 9px ${FONT_COND};letter-spacing:.12em;text-transform:uppercase;cursor:pointer;touch-action:manipulation}
.cot-range-card .rc-foot button[aria-pressed='true']{color:#fff1d6;border-color:#f0a030;background:rgba(240,160,48,.16)}
.cot-range-card .rc-foot kbd{font:inherit;color:#f0a030;border:1px solid rgba(240,160,48,.45);padding:0 4px;min-width:10px}
body.cot-touch-layout .cot-range-card{width:min(240px,var(--hud-side-width,240px));font-size:9px}
body.cot-touch-layout .cot-range-card .rc-p,body.cot-touch-layout .cot-range-card .rc-foot kbd{display:none}
body.cot-touch-layout .cot-range-card .rc-foot button{min-height:40px}
`;

/** The presented angle as the card names it: nose on, broadside, or the angle off the nose. */
function presentedAngleLabel(deg: number): string {
  const angle = Math.round(Math.abs(deg));
  if (angle === 0) return t('hud.range.noseOn');
  if (angle === 90) return t('hud.range.broadside');
  return t('hud.range.angle', { value: String(angle) });
}

/** The reference-plate line: "RHA 0° 540 · 30° 470 · 60° 270 mm" (a dash where no plate is defeated). */
function plateLine(anglesDeg: readonly number[], plateMm: readonly number[]): string {
  const parts = anglesDeg.map((angle, index) => `${angle}° ${plateMm[index] ? plateMm[index] : '—'}`);
  return t('hud.range.plates', { values: parts.join(' · ') });
}

export function createProvingRangeCard(parent: HTMLElement, emit: (type: string) => void): ProvingRangeCard {
  ensureStyle('cot-range-card-style', CSS);
  const root = createElement('section', 'cot-range-card', parent);
  root.setAttribute('aria-label', t('hud.range.title'));
  root.innerHTML = `<div class="rc-head"><span class="mi">${uiIconSVG('modeProving', 14)}</span>` +
    `<span class="nm">${t('hud.range.title')}</span><span class="sh"></span></div>` +
    `<div class="rc-lanes"></div>` +
    `<div class="rc-foot"><button type="button" data-range-action="reset"><kbd></kbd><span>${t('hud.range.reset')}</span></button>` +
    `<button type="button" data-range-action="moving" aria-pressed="false"><kbd></kbd><span>${t('hud.range.moving')}</span></button></div>`;
  const shellEl = root.querySelector<HTMLElement>('.rc-head .sh')!;
  const lanesEl = root.querySelector<HTMLElement>('.rc-lanes')!;
  const resetButton = root.querySelector<HTMLButtonElement>('[data-range-action="reset"]')!;
  const movingButton = root.querySelector<HTMLButtonElement>('[data-range-action="moving"]')!;
  const resetKeyEl = resetButton.querySelector('kbd')!;
  const movingKeyEl = movingButton.querySelector('kbd')!;
  resetButton.addEventListener('click', (event) => { event.stopPropagation(); emit('ui:rangeReset'); });
  movingButton.addEventListener('click', (event) => { event.stopPropagation(); emit('ui:rangeMoving'); });
  // touch: a tap on the card must not fall through to the battle's look/fire surface
  root.addEventListener('pointerdown', (event) => event.stopPropagation());

  let shown = false;
  let lastRange: RangeCardState | null = null;
  let lastSlot = -1;
  let lastShellName = '';
  let lastMoving: boolean | null = null;
  let lastLaid = -2;
  let lastResetKey = '';
  let lastMovingKey = '';
  let rows: HTMLElement[] = [];

  const renderLanes = (range: RangeCardState, slot: number): void => {
    lanesEl.textContent = '';
    rows = range.lanes.map((lane) => {
      const card = lane.shells[Math.min(Math.max(0, slot), lane.shells.length - 1)];
      const row = createElement('div', 'rc-lane', lanesEl);
      const outcome = card ? card.outcome : 'nopen';
      row.innerHTML = `<span class="rc-n">${lane.index + 1}</span>` +
        `<span class="rc-r">${t('hud.range.meters', { value: String(lane.rangeM) })}</span>` +
        `<span class="rc-t"></span>` +
        `<span class="rc-o ${outcome}">${t(`hud.range.outcome.${outcome}`)}${card && card.ratio > 0 ? ` ${card.ratio.toFixed(2)}` : ''}</span>` +
        `<span class="rc-p"></span>`;
      const target = row.querySelector<HTMLElement>('.rc-t')!;
      target.textContent = lane.targetName || '—';
      const angle = createElement('small', '', target);
      angle.textContent = presentedAngleLabel(lane.presentDeg);
      row.querySelector<HTMLElement>('.rc-p')!.textContent = card
        ? `${t('hud.range.pen', { value: String(card.penMm) })} · ${plateLine(range.plateAnglesDeg, card.plateMm)}`
        : '';
      return row;
    });
  };

  const hide = (): void => {
    if (!shown) return;
    shown = false;
    root.classList.remove('show');
    lastRange = null;
  };

  const update = (input: RangeCardInput): void => {
    const range = input.range;
    if (!range || !range.lanes.length) { hide(); return; }
    if (!shown) { shown = true; root.classList.add('show'); }
    if (range !== lastRange || input.shellSlot !== lastSlot) {
      renderLanes(range, input.shellSlot);
      lastRange = range;
      lastSlot = input.shellSlot;
      lastLaid = -2;
    }
    if (input.shellName !== lastShellName) { shellEl.textContent = input.shellName; lastShellName = input.shellName; }
    if (range.moving !== lastMoving) {
      movingButton.setAttribute('aria-pressed', String(range.moving));
      lastMoving = range.moving;
    }
    let laid = -1;
    if (input.laidTargetId) {
      for (let i = 0; i < range.lanes.length; i++) if (range.lanes[i].targetId === input.laidTargetId) { laid = i; break; }
    }
    if (laid !== lastLaid) {
      for (let i = 0; i < rows.length; i++) rows[i].classList.toggle('laid', i === laid);
      lastLaid = laid;
    }
    if (input.resetKey !== lastResetKey) { resetKeyEl.textContent = input.resetKey; lastResetKey = input.resetKey; }
    if (input.movingKey !== lastMovingKey) { movingKeyEl.textContent = input.movingKey; lastMovingKey = input.movingKey; }
  };

  return { root, update, hide };
}
