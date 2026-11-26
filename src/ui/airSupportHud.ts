/**
 * airSupportHud.ts — Air Support's controls and warnings (air-support-270; owner 2026-11-05: "if you ativatee the thing it
 * goes in with a transition to an airstrike view where you can enter a special binocular view and theres a giant aiming
 * reticle on the ground respecting ground geometry and u cann call in 3 differennt kinnds of airstrikes", then "keep and add
 * artillery annd recon with the 3 airstrikes").
 *
 * - At rest, one slot (owner 2026-11-06, of a row of seven down the left: "theres gotta be a better way than presenting
 *   that as an obtrusive line"): Support, the binoculars (X) with the crew's points as its count (no fill meter: gauntlet
 *   g9 read it as an outline edge), at the end of the battle tray on a desktop and beside the vehicle's action row on a phone.
 * - The call-ins come up only with the binoculars: the six (1-6: recon, barrage, strafing run, precision bomb, the Maverick
 *   run, AC-130)
 *   in a row centred over the tray, each a slot of the tray's own kind (the ammunition and consumable slots: the key top
 *   left, the price top right, the sprite glyph, the short name along the floor, the consumables' conic cooldown shade,
 *   the tray's one selected state); its hover tip names it in full.
 * - The strike view: the binoculars come up over the scope's camera (game/strikeViewState.ts; the camera rig enters the
 *   scope), a two-lens vignette, one readout plate (the call-in's glyph and name, its warning, the range and
 *   bearing to the reticle, its state as a chip), the keys as key caps, and on a phone the kit's CALL button. The Support
 *   slot itself is the close while they are up (its X and "Lower"), in its own place on every layout.
 *   The reticle itself is on the ground (engine/strikeMarks.ts).
 * - The air lane (notices-276b; Kevin 2026-11-24: "should we combine stuff", the plan he approved through Main): every
 *   live air event is one plate of the condition lane (battleNotices.ts; noticeKinds.ts subject `air`, the hexagon plate
 *   with its aircraft's render), never a second surface on the same subject: the strike whose footprint covers the crew
 *   (airIncoming, NOTICE_PRIORITY.threat, its countdown), the crew's own call-in (airOrder: sent, called, the refusal it
 *   met, then its run's countdown, NOTICE_PRIORITY.answered; the binoculars' readout keeps the aim alone), and an
 *   aircraft the crew brought down (airDown, the event lane's time). Each is updated in place and taken down when it has
 *   passed. The condition lane is the page's: a couch pane's HUD is handed a port that raises none (hud.ts). Every
 *   strike's footprint is also on the minimap and the ground, and its aircraft on the minimap.
 * Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import type { EventBus } from '../game/stateCore.ts';
import { AIR_STRIKE_KINDS, AIR_SUPPORT_RULES as R, type AirStrikeKind } from '../sim/matchRuleset.ts';
import { strikeCovers, strikeDangerS, type AirSupportView } from '../sim/airSupport.ts';
import { strikeCallBlocker as callBlocker } from '../sim/strikeCall.ts';
import { endStrikeView, strikeView, STRIKE_VIEW_TRANSITION_S } from '../game/strikeViewState.ts';
import { battleScoped, currentBattleScope, type BattleScope } from '../game/battleScope.ts';
import type { StrikeOrderRefusal } from '../game/strikeOrder.ts';

const strikeCallBlocker = (air: AirSupportView | null | undefined, kind: AirStrikeKind, rangeM: number) => callBlocker(R, air, kind, rangeM);
import { icon, type IconId } from './icons/icon.ts';
import { markDatum } from './dom.ts';
import { t } from './i18n.ts';
import { setAttr, setData, setDisabled, setHidden, setStyle, setText } from './domWrite.ts';
import { prefersReducedMotion } from './accessibilityPreferences.ts';
import { battleNotices, NOTICE_PRIORITY, type BattleNoticePort } from './battleNotices.ts';
import { EVENT_HOLD_MS } from './battleNoticeEvents.ts';
import type { NoticeArtId } from './components/noticeArt.ts';

interface Point { x: number; y: number; z: number }

/** Each call-in's glyph in the sprite (the AC-130's is its mode's). */
const STRIKE_ICON: Readonly<Record<AirStrikeKind, IconId>> = {
  recon: 'strikeRecon', artillery: 'strikeArtillery', strafe: 'strikeStrafe', bomb: 'strikeBomb', missile: 'rocket', gunship: 'modeAc130',
};

/** Each call-in's picture as the notices draw it (components/noticeArt.ts; Kevin and Main 2026-11-23): the A-10 flies the
 *  recon pass and the strafing run, the F-16 the bomb and the Maverick run, the AC-130 itself; the barrage, which flies no
 *  aircraft, its 155 mm salvo (notices-polish-277; Kevin 2026-11-24: "make all warnings have mictures"). Every call-in has
 *  one (noticeKinds.selftest.mjs: a warning kind without art fails). */
export const STRIKE_ART: Readonly<Record<AirStrikeKind, NoticeArtId>> = {
  recon: 'a10', artillery: 'artillery', strafe: 'a10', bomb: 'f16', missile: 'f16', gunship: 'ac130',
};

function node<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); element.className = cls; parent.append(element); return element;
}

/** A readout's figure, its unit with it, and its label (in the label ink). */
function stat(parent: HTMLElement, label: string): HTMLElement {
  const box = node('span', 'binocular-stat', parent);
  const value = node('b', 'num', box);
  if (label) node('small', '', box).textContent = label;
  return value;
}

/** A refusal's plate state (its i18n key under airSupport.state and its data-state): the reasons a crew can act on
 *  have their own words, the rest (a wreck's press, a mark that is no point, a verdict that never came) read "refused". */
type PlateState = 'points' | 'cooldown' | 'air' | 'gunship' | 'range' | 'denied';
const PLATE_STATE: Readonly<Record<StrikeOrderRefusal, PlateState>> = {
  POINTS: 'points', COOLDOWN: 'cooldown', AIR_FULL: 'air', GUNSHIP_UP: 'gunship', RANGE: 'range',
  DESTROYED: 'denied', MARK: 'denied', LOST: 'denied',
};

/** The INCOMING notice's id in the battle's region (one at a time: the nearest-landing strike's). */
export const INCOMING_NOTICE = 'cot-air-incoming';
/** The crew's own call-in's plate (one at a time: the order under way, else its nearest-landing run). */
export const ORDER_NOTICE = 'cot-air-order';
/** An aircraft the crew brought down. */
export const DOWN_NOTICE = 'cot-air-down';

export function createAirSupportHud(parent: HTMLElement, bus: EventBus, notices: BattleNoticePort = battleNotices) {
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
  // (Kevin 2026-11-23: "the x button shouldnt just appear and disappear. its part of the ui for air support") the slot
  // is also the close: with the binoculars up its glyph and short name turn to the X and "Lower" in the same box, and
  // back when they come down (airSupportHud.css, with the raise; a cut under reduced motion). No second button.
  const glyph = node('span', 'glyph', view);
  node('span', 'face face-rest', glyph).innerHTML = icon('eqBinoculars', { size: 26 });
  node('span', 'face face-up', glyph).innerHTML = icon('close', { size: 26 });
  const viewKey = node('kbd', 'key', view);
  const points = markDatum(node('span', 'strike-points num', view), 'support-points');
  points.setAttribute('role', 'status');
  const label = node('span', 'label', view);
  node('span', 'face face-rest', label).textContent = t('airSupport.short.view');
  node('span', 'face face-up', label).textContent = t('airSupport.short.lower');
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
  // (the aim alone: the call-in's warning is its slot's tip, and the order's state is the air lane's plate, notices-276b)
  const where = node('span', 'binocular-group', readout);
  const range = stat(where, '');
  const bearing = stat(where, '');
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
  hintKey(`1–${AIR_STRIKE_KINDS.length}`, t('airSupport.hint.pick'));
  const lowerKey = hintKey('', t('airSupport.hint.lower'));
  const call = node('button', 'binocular-call cot-c-btn cot-c-btn--primary cot-c-btn--56', binoculars);
  call.type = 'button';
  call.textContent = t('airSupport.call');
  call.addEventListener('click', () => bus.emit('ui:strikeCall', {}));

  // ---- the air lane's plates: each raised only when what it says changes (its whole seconds), taken down when it passes ----
  // (battle-teardown-276) the plates raised are the battle's own memo: a gunship's "NOW" raised in one battle is never taken
  // for already raised in the next (the region took the plate down with its battle, game/battleScope.ts)
  const platesOf = battleScoped(() => new Map<string, string>());
  function plate(id: string, kind: 'airIncoming' | 'airOrder' | 'airDown', strike: AirStrikeKind | null, text: string, detail: string,
    severity: 'info' | 'success' | 'warning', priority: number, durationMs: number | null = null): void {
    const plates = platesOf();
    const key = strike ? `${kind}|${strike}|${text}|${detail}|${severity}` : '';
    if ((plates.get(id) ?? '') === key) return;
    if (!strike) { plates.delete(id); notices.dismiss(id); return; }
    plates.set(id, key);
    notices.condition({ kind, id, severity, icon: kind === 'airIncoming' ? 'alert' : STRIKE_ICON[strike], text, detail, durationMs,
      dismissible: false, priority, className: kind === 'airIncoming' ? 'cot-air-incoming' : undefined, art: STRIKE_ART[strike] });
    // (a timed plate goes by its own time: forgotten here, so the next one is raised again)
    if (durationMs !== null) plates.delete(id);
  }

  // a call-in the plate refused (playerBattleActions.ts: at the press, or the authority's verdict): the crew's plate says
  // so for the event lane's time; an aircraft the crew brought down, its own plate for that time
  const isKind = (kind: unknown): kind is AirStrikeKind => AIR_STRIKE_KINDS.includes(kind as AirStrikeKind);
  let refusal: { kind: AirStrikeKind; state: PlateState; untilS: number } | null = null;
  bus.on('ui:strikeRefusal', (payload) => {
    const { kind, reason } = (payload ?? {}) as { kind?: unknown; reason?: unknown };
    if (!isKind(kind)) return;
    refusal = { kind, state: PLATE_STATE[String(reason) as StrikeOrderRefusal] ?? 'denied', untilS: lastTimeS + EVENT_HOLD_MS / 1000 };
  });
  bus.on('ui:aircraftDowned', (payload) => {
    const kind = (payload as { kind?: unknown } | null)?.kind;
    if (!isKind(kind)) return;
    plate(DOWN_NOTICE, 'airDown', kind, t('airSupport.downed'), t(`airSupport.kind.${kind}`), 'success', NOTICE_PRIORITY.answered, EVENT_HOLD_MS);
  });

  let lastTimeS = 0, glyphKind: AirStrikeKind | null = null, scopedFlag = false;
  /** (life-reset-279) Lowered binoculars hold no reading: the last raise's call-in, range, bearing, readiness and key stayed
   *  on the hidden group into the next life and the next battle, until a raise wrote over them. */
  let readoutDrawn = false;
  function blankReadout(): void {
    if (!readoutDrawn) return;
    readoutDrawn = false;
    kindGlyph.innerHTML = '';
    glyphKind = null;
    setText(kindName, '');
    setText(range, '');
    setText(bearing, '');
    setText(lowerKey, '');
    delete binoculars.dataset.state;
    setDisabled(call, false);
  }
  // (battle-teardown-276; Kevin 2026-11-24) what the binoculars set outside their own boxes goes with the battle, however it
  // was left (the frames that would lower them stop with it): the page's strike-view flag, the order and the view itself,
  // whose close the main's phone layout and the raise hear
  let adopted: BattleScope | null = null;
  function adoptScope(): void {
    const scope = currentBattleScope();
    if (!scope || scope === adopted) return;
    adopted = scope;
    scope.defer(() => {
      refusal = null;
      setHidden(binoculars, true);
      setHidden(rack, true);
      binoculars.classList.remove('is-raising');
      if (scopedFlag) { scopedFlag = false; document.documentElement.toggleAttribute('data-cot-strike-view', false); }
      if (endStrikeView()) bus.emit('ui:strikeView', { open: false });
    });
  }
  bus.on('ui:strikeView', (payload) => {
    const open = !!(payload as { open?: boolean } | null)?.open;
    binoculars.classList.toggle('is-raising', open && !prefersReducedMotion());
  });

  /**
   * Each frame: the ledger and the strikes (`air`, the viewer's), the crew's aim point and hull, its side, the clock and
   * whether the HUD shows; `keyX` is the binoculars' key as bound.
   */
  function update(air: AirSupportView | null | undefined, aim: Point | null | undefined, hull: Point | null | undefined,
    team: 'alpha' | 'bravo', timeS: number, active: boolean, keyX: string): void {
    adoptScope();
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
      setHidden(binoculars, true);
      blankReadout();
      plate(INCOMING_NOTICE, 'airIncoming', null, '', '', 'warning', NOTICE_PRIORITY.threat);
      plate(ORDER_NOTICE, 'airOrder', null, '', '', 'info', NOTICE_PRIORITY.answered);
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
    strikeView.rangeM = rangeM;
    // readiness is the authority's own rule (sim/strikeCall.ts strikeCallBlocker); the order is read, never written
    const why = strikeCallBlocker(air, strikeView.kind, rangeM);
    const order = strikeView.order.read(timeS);
    const step = dt / STRIKE_VIEW_TRANSITION_S;
    strikeView.blend = Math.max(0, Math.min(1, strikeView.blend + (strikeView.open ? step : -step)));
    // an accepted call: the reticle held its lock, then the binoculars come down
    if (strikeView.order.takeLowered(timeS) && strikeView.open) bus.emit('ui:strikeViewClose', {});

    const have = air.points ?? 0;
    setText(points, String(have));
    setText(viewKey, keyX);
    setData(view, 'selected', strikeView.open ? 'true' : 'false');
    // the slot names what a press does: raise the binoculars, or lower them
    setAttr(view, 'aria-label', t(strikeView.open ? 'airSupport.lower' : 'airSupport.view'));
    for (const slot of slots) {
      const slotRefusal = strikeCallBlocker(air, slot.kind, slot.kind === strikeView.kind ? rangeM : 0);
      const slotWhy = slotRefusal ? PLATE_STATE[slotRefusal] : null;
      setData(slot.button, 'state', slotWhy ?? 'ready');
      setData(slot.button, 'selected', strikeView.open && strikeView.kind === slot.kind ? 'true' : 'false');
      const cool = air.cooldowns?.[slot.kind] ?? 0;
      setStyle(slot.button, '--strike-cool', `${Math.round(Math.min(1, cool / R[slot.kind].cooldownS) * 100)}%`);
      // (gauntlet g10: a duration carries its unit, "35 s", as the readout's and the warning's do)
      setText(slot.left, cool > 0 ? `${Math.ceil(cool)} s` : '');
      setAttr(slot.button, 'aria-label', `${t(`airSupport.kind.${slot.kind}`)}, ${R[slot.kind].cost} ${t('airSupport.points')}`
        + (slotWhy ? `, ${t(`airSupport.state.${slotWhy}`)}` : ''));
    }

    setHidden(binoculars, !strikeView.open);
    // the controls card (settings.ts .cot-hints) stands down under the binoculars, as it does under the scope
    if (scopedFlag !== strikeView.open) { scopedFlag = strikeView.open; document.documentElement.toggleAttribute('data-cot-strike-view', scopedFlag); }
    if (!strikeView.open) blankReadout();
    else {
      readoutDrawn = true;
      const kind = strikeView.kind;
      if (glyphKind !== kind) { kindGlyph.innerHTML = icon(STRIKE_ICON[kind], { size: 20 }); glyphKind = kind; }
      setText(kindName, t(`airSupport.kind.${kind}`));
      setText(range, `${Math.round(rangeM)} m`);
      setText(bearing, `${String(Math.round(((strikeView.heading * 180 / Math.PI) + 360) % 360)).padStart(3, '0')}°`);
      // (whether a press would be taken, for the glyph's dim: the order's own state is the air lane's plate)
      setData(binoculars, 'state', why ? PLATE_STATE[why] : 'ready');
      setText(lowerKey, keyX);
      setDisabled(call, !!why || order.phase === 'sent' || order.phase === 'called');
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
    const countdown = (landsS: number): string => {
      const left = landsS - air.nowS;
      return left > 0 ? `${Math.ceil(left)} s` : t('airSupport.incoming.now');
    };
    if (!threat) plate(INCOMING_NOTICE, 'airIncoming', null, '', '', 'warning', NOTICE_PRIORITY.threat);
    else plate(INCOMING_NOTICE, 'airIncoming', threat.kind, t(`airSupport.incoming.${threat.kind}`), countdown(threat.landsS),
      threat.team === team ? 'info' : 'warning', NOTICE_PRIORITY.threat);

    // the crew's own call-in: the refusal it met, the order under way, else its nearest-landing run until it has passed
    if (refusal && timeS >= refusal.untilS) refusal = null;
    let own: (typeof air.strikes)[number] | null = null;
    for (const strike of air.strikes) {
      if (!strike.mine || strike.downedS != null || air.nowS > strike.landsS + strikeDangerS(R, strike.kind)) continue;
      if (!own || strike.landsS < own.landsS) own = strike;
    }
    const ordered = order.phase === 'sent' || order.phase === 'called' ? order : null;
    if (refusal) plate(ORDER_NOTICE, 'airOrder', refusal.kind, t(`airSupport.kind.${refusal.kind}`), t(`airSupport.state.${refusal.state}`),
      'warning', NOTICE_PRIORITY.answered);
    else if (ordered) plate(ORDER_NOTICE, 'airOrder', ordered.kind, t(`airSupport.kind.${ordered.kind}`), t(`airSupport.state.${ordered.phase}`),
      ordered.phase === 'called' ? 'success' : 'info', NOTICE_PRIORITY.answered);
    else if (own) plate(ORDER_NOTICE, 'airOrder', own.kind, t(`airSupport.kind.${own.kind}`), countdown(own.landsS), 'info', NOTICE_PRIORITY.answered);
    else plate(ORDER_NOTICE, 'airOrder', null, '', '', 'info', NOTICE_PRIORITY.answered);
  }

  return { update };
}
