/**
 * airSupportHud.ts — Air Support's controls and warnings (air-support-270; owner 2026-11-05: "if you ativatee the thing it
 * goes in with a transition to an airstrike view where you can enter a special binocular view and theres a giant aiming
 * reticle on the ground respecting ground geometry and u cann call in 3 differennt kinnds of airstrikes", then "keep and add
 * artillery annd recon with the 3 airstrikes").
 *
 * - At rest, one slot (owner 2026-11-06, of a row of seven down the left: "theres gotta be a better way than presenting
 *   that as an obtrusive line"): Support, the binoculars (X) with the crew's points as its count and their fill toward the
 *   cap, at the end of the battle tray on a desktop and beside the vehicle's action row on a phone.
 * - The call-ins come up only with the binoculars: the five (1-5: recon, barrage, strafing run, precision bomb, AC-130)
 *   in a row centred over the tray, each a slot of the tray's own kind (the ammunition and consumable slots: the key top
 *   left, the price top right, the sprite glyph, the short name along the floor, the consumables' conic cooldown shade,
 *   the tray's one selected state); its hover tip names it in full.
 * - The strike view: the binoculars come up over the scope's camera (game/strikeViewState.ts; the camera rig enters the
 *   scope), a two-lens vignette, one readout plate (the call-in's glyph and name, its warning, the range and
 *   bearing to the reticle, its state as a chip), the keys as key caps, and on a phone the kit's CALL and close buttons.
 *   The reticle itself is on the ground (engine/strikeMarks.ts).
 * - The warning: a strike whose footprint covers the crew raises an INCOMING plate (the HUD alert's form: the alert
 *   glyph in the danger tone, never a coloured edge) with its countdown; every strike's footprint is also on the minimap
 *   and the ground.
 * Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import type { EventBus } from '../game/stateCore.ts';
import { AIR_STRIKE_KINDS, AIR_SUPPORT_RULES as R, type AirStrikeKind } from '../sim/matchRuleset.ts';
import { strikeCovers, strikeDangerS, type AirSupportView } from '../sim/airSupport.ts';
import { strikeView, STRIKE_VIEW_TRANSITION_S } from '../game/strikeViewState.ts';
import { icon, type IconId } from './icons/icon.ts';
import { markDatum } from './dom.ts';
import { t } from './i18n.ts';
import { setAttr, setData, setDisabled, setHidden, setStyle, setText } from './domWrite.ts';
import { prefersReducedMotion } from './accessibilityPreferences.ts';

interface Point { x: number; y: number; z: number }

/** Each call-in's glyph in the sprite (the AC-130's is its mode's). */
const STRIKE_ICON: Readonly<Record<AirStrikeKind, IconId>> = {
  recon: 'strikeRecon', artillery: 'strikeArtillery', strafe: 'strikeStrafe', bomb: 'strikeBomb', gunship: 'modeAc130',
};

function node<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); element.className = cls; parent.append(element); return element;
}

/** A readout's figure and its unit (the unit in the label ink). */
function stat(parent: HTMLElement, unit: string): HTMLElement {
  const box = node('span', 'binocular-stat', parent);
  const value = node('b', 'num', box);
  if (unit) node('small', '', box).textContent = unit;
  return value;
}

/** Why a call-in cannot be made now (null: it can). */
function blocker(air: AirSupportView, kind: AirStrikeKind, rangeM: number): 'points' | 'cooldown' | 'air' | 'range' | null {
  if ((air.points ?? 0) < R[kind].cost) return 'points';
  if ((air.cooldowns?.[kind] ?? 0) > 0) return 'cooldown';
  if (air.teamAirFull) return 'air';
  if (rangeM > R.callRangeM) return 'range';
  return null;
}

export function createAirSupportHud(parent: HTMLElement, bus: EventBus) {
  // the rest slot: Support (the binoculars) with the points; it joins the battle tray on a desktop (update() re-seats it
  // when the layout turns touch or back), and stands by itself beside the action row on a phone
  const dock = node('div', 'cot-strike-dock', parent);
  dock.hidden = true;
  const seam = document.createElement('span');
  seam.className = 'cot-consep';
  seam.setAttribute('aria-hidden', 'true');
  const view = node('button', 'strike-slot strike-support', dock);
  view.type = 'button';
  view.setAttribute('aria-label', t('airSupport.view'));
  node('span', 'glyph', view).innerHTML = icon('eqBinoculars', { size: 26 });
  const viewKey = node('kbd', 'key', view);
  const points = markDatum(node('span', 'strike-points num', view), 'support-points');
  points.setAttribute('role', 'status');
  node('span', 'label', view).textContent = t('airSupport.short.view');
  const pointsFill = node('i', 'strike-points-fill', view);
  pointsFill.setAttribute('aria-hidden', 'true');
  view.addEventListener('click', () => bus.emit('ui:strikeViewToggle', {}));
  let seat: 'tray' | 'own' = 'own';
  /** The rest slot's seat: the tray's end on a desktop, its own place on a touch layout (or before the tray exists). */
  function seatDock(): void {
    const tray = document.body.classList.contains('cot-touch-layout') ? null : parent.querySelector<HTMLElement>('.cot-shells');
    const want = tray ? 'tray' : 'own';
    if (want === seat) return;
    seat = want;
    if (tray) tray.append(seam, view); else { seam.remove(); dock.append(view); }
    setHidden(dock, !!tray);
  }

  // the call-ins: a row over the tray while the binoculars are up
  const rack = node('section', 'cot-strike-rack', parent);
  rack.hidden = true;
  rack.setAttribute('aria-label', t('airSupport.strip'));
  const slots = AIR_STRIKE_KINDS.map((kind, index) => {
    const button = node('button', 'strike-slot', rack);
    button.type = 'button';
    button.dataset.kind = kind;
    // painted in this order (no z-index): the cooldown shade dims the glyph, never the key, the price or the name
    node('span', 'glyph', button).innerHTML = icon(STRIKE_ICON[kind], { size: 26 });
    node('span', 'cool', button).setAttribute('aria-hidden', 'true');
    node('kbd', 'key', button).textContent = String(index + 1);
    node('span', 'price num', button).textContent = String(R[kind].cost);
    node('span', 'label', button).textContent = t(`airSupport.short.${kind}`);
    const left = node('span', 'left num', button);
    const tip = node('span', 'tip', button);
    tip.setAttribute('aria-hidden', 'true');
    node('b', '', tip).textContent = t(`airSupport.kind.${kind}`);
    node('span', 'num', tip).textContent = `${R[kind].cost} ${t('airSupport.points')} · ${R[kind].warningS} s ${t('airSupport.warning')}`;
    button.addEventListener('click', () => {
      if (strikeView.open && strikeView.kind === kind) bus.emit('ui:strikeCall', {});
      else bus.emit('ui:strikePick', { kind });
    });
    return { kind, button, left };
  });

  // ---- the binoculars ----
  const binoculars = node('div', 'cot-binoculars', parent);
  binoculars.hidden = true;
  // a labelled group over the HUD, not a dialog: it takes no focus and traps no key (the crew keeps driving)
  binoculars.setAttribute('role', 'group');
  binoculars.setAttribute('aria-label', t('airSupport.view'));
  node('div', 'binocular-lens', binoculars).setAttribute('aria-hidden', 'true');
  const scale = node('div', 'binocular-scale', binoculars);
  scale.setAttribute('aria-hidden', 'true');
  const readout = node('div', 'binocular-readout', binoculars);
  const kindGlyph = node('span', 'glyph', readout);
  const kindName = node('strong', 'binocular-kind', readout);
  const facts = node('span', 'binocular-group binocular-facts', readout);
  const warn = stat(facts, `s ${t('airSupport.warning')}`);
  const where = node('span', 'binocular-group', readout);
  const range = stat(where, 'm');
  const bearing = stat(where, '');
  const state = node('span', 'binocular-state', readout);
  const hint = node('div', 'binocular-hint', binoculars);
  const hintKey = (key: string, label: string): HTMLElement => {
    const item = node('span', '', hint);
    const cap = node('kbd', 'cot-c-kbd', item);
    cap.textContent = key;
    // (a zh cap, 左键, is set in the UI face, as the controls card's: settings.ts CJK_CAP)
    cap.classList.toggle('cjk', /[\u3400-\u9fff]/.test(key));
    node('span', '', item).textContent = label;
    return cap;
  };
  hintKey(t('input.mouse.left'), t('airSupport.hint.call'));
  hintKey('1–5', t('airSupport.hint.pick'));
  const lowerKey = hintKey('', t('airSupport.hint.lower'));
  const call = node('button', 'binocular-call cot-c-btn cot-c-btn--primary cot-c-btn--56', binoculars);
  call.type = 'button';
  call.textContent = t('airSupport.call');
  call.addEventListener('click', () => bus.emit('ui:strikeCall', {}));
  const close = node('button', 'binocular-close cot-c-btn cot-c-btn--secondary cot-c-btn--56 cot-c-btn--icon', binoculars);
  close.type = 'button';
  close.setAttribute('aria-label', t('airSupport.lower'));
  close.innerHTML = icon('close', { size: 20 });
  close.addEventListener('click', () => bus.emit('ui:strikeViewClose', {}));

  // ---- the warning ----
  const warning = node('div', 'cot-strike-warning', parent);
  warning.hidden = true;
  warning.setAttribute('role', 'alert');
  node('span', 'glyph', warning).innerHTML = icon('alert', { size: 16 });
  const warningTitle = node('strong', '', warning);
  const warningTime = node('span', 'num', warning);

  let lastTimeS = 0, called = false, glyphKind: AirStrikeKind | null = null, scopedFlag = false;
  bus.on('ui:strikeCalled', () => { called = true; });
  bus.on('ui:strikeView', (payload) => {
    const open = !!(payload as { open?: boolean } | null)?.open;
    binoculars.classList.toggle('is-raising', open && !prefersReducedMotion());
    if (!open) called = false;
  });

  /**
   * Each frame: the ledger and the strikes (`air`, the viewer's), the crew's aim point and hull, its side, the clock and
   * whether the HUD shows; `keyX` is the binoculars' key as bound.
   */
  function update(air: AirSupportView | null | undefined, aim: Point | null | undefined, hull: Point | null | undefined,
    team: 'alpha' | 'bravo', timeS: number, active: boolean, keyX: string): void {
    const dt = Math.max(0, Math.min(0.1, timeS - lastTimeS));
    lastTimeS = timeS;
    const shown = !!air && active;
    seatDock();
    setHidden(view, !shown);
    setHidden(seam, !shown);
    if (seat === 'own') setHidden(dock, !shown);
    setHidden(rack, !shown || !strikeView.open);
    if (!air || !shown) {
      if (strikeView.open) bus.emit('ui:strikeViewClose', {});
      setHidden(binoculars, true); setHidden(warning, true);
      if (scopedFlag) { scopedFlag = false; document.documentElement.toggleAttribute('data-cot-strike-view', false); }
      strikeView.blend = 0;
      return;
    }
    // the reticle rides the crew's aim point; the run's heading is the hull's line to it
    let rangeM = 0;
    if (aim && hull) {
      strikeView.x = aim.x; strikeView.y = aim.y; strikeView.z = aim.z;
      const dx = aim.x - hull.x, dz = aim.z - hull.z;
      rangeM = Math.hypot(dx, dz);
      if (rangeM > 1) strikeView.heading = Math.atan2(dx, dz);
    }
    const why = blocker(air, strikeView.kind, rangeM);
    strikeView.ready = !why;
    const step = dt / STRIKE_VIEW_TRANSITION_S;
    strikeView.blend = Math.max(0, Math.min(1, strikeView.blend + (strikeView.open ? step : -step)));
    // a call made: the reticle holds its lock, then the binoculars come down
    if (called && strikeView.open && timeS >= strikeView.lockedUntilS) bus.emit('ui:strikeViewClose', {});

    const have = air.points ?? 0;
    setText(points, String(have));
    setStyle(view, '--strike-fill', String(Math.min(1, have / R.points.cap)));
    setText(viewKey, keyX);
    setData(view, 'selected', strikeView.open ? 'true' : 'false');
    setAttr(view, 'aria-pressed', strikeView.open ? 'true' : 'false');
    for (const slot of slots) {
      const slotWhy = blocker(air, slot.kind, slot.kind === strikeView.kind ? rangeM : 0);
      setData(slot.button, 'state', slotWhy ?? 'ready');
      setData(slot.button, 'selected', strikeView.open && strikeView.kind === slot.kind ? 'true' : 'false');
      const cool = air.cooldowns?.[slot.kind] ?? 0;
      setStyle(slot.button, '--strike-cool', `${Math.round(Math.min(1, cool / R[slot.kind].cooldownS) * 100)}%`);
      setText(slot.left, cool > 0 ? String(Math.ceil(cool)) : '');
      setAttr(slot.button, 'aria-label', `${t(`airSupport.kind.${slot.kind}`)}, ${R[slot.kind].cost} ${t('airSupport.points')}`
        + (slotWhy ? `, ${t(`airSupport.state.${slotWhy}`)}` : ''));
    }

    setHidden(binoculars, !strikeView.open);
    // the controls card (settings.ts .cot-hints) stands down under the binoculars, as it does under the scope
    if (scopedFlag !== strikeView.open) { scopedFlag = strikeView.open; document.documentElement.toggleAttribute('data-cot-strike-view', scopedFlag); }
    if (strikeView.open) {
      const kind = strikeView.kind;
      if (glyphKind !== kind) { kindGlyph.innerHTML = icon(STRIKE_ICON[kind], { size: 20 }); glyphKind = kind; }
      setText(kindName, t(`airSupport.kind.${kind}`));
      setText(warn, String(R[kind].warningS));
      setText(range, String(Math.round(rangeM)));
      setText(bearing, `${String(Math.round(((strikeView.heading * 180 / Math.PI) + 360) % 360)).padStart(3, '0')}°`);
      const locked = timeS < strikeView.lockedUntilS;
      setText(state, locked ? t('airSupport.state.called') : why ? t(`airSupport.state.${why}`) : t('airSupport.state.ready'));
      setData(binoculars, 'state', locked ? 'called' : why ?? 'ready');
      setText(lowerKey, keyX);
      setDisabled(call, !strikeView.ready || locked);
    }

    // the warning: the nearest-landing strike of the other side (or a friendly one: friendly fire is on) whose footprint
    // covers the crew, until its danger is past
    let threat: (typeof air.strikes)[number] | null = null;
    if (hull) {
      for (const strike of air.strikes) {
        if (strike.downedS != null || strike.kind === 'recon' || strike.mine) continue;
        if (air.nowS > strike.landsS + strikeDangerS(R, strike.kind)) continue;
        if (!strikeCovers(R, strike, hull.x, hull.z, 8)) continue;
        if (!threat || strike.landsS < threat.landsS) threat = strike;
      }
    }
    setHidden(warning, !threat);
    if (threat) {
      setData(warning, 'side', threat.team === team ? 'own' : 'enemy');
      setText(warningTitle, t(`airSupport.incoming.${threat.kind}`));
      const left = threat.landsS - air.nowS;
      setText(warningTime, left > 0 ? `${left.toFixed(1)} s` : t('airSupport.incoming.now'));
    }
  }

  return { update };
}
