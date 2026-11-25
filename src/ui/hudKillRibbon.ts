// The kill card and the personal event stream (brand-ui H3, the direction's 06-battle-hud.html .ribbon; notices-polish-277,
// Kevin 2026-11-24 on live 276: "for a kill card, make it look a lot better and organized and make the tank actually
// viewable. rn it gets cut off. also make it a hexagon!!"). Copyright © 2026 Kevin B. Liu.
//
// One card centre low, above the systems row and well clear of the sight, on the HUD's hexagon (hexPlate.ts, the notice
// plates' shape at a larger point). Its words in a column, read top down:
//   DESTROYED  [cause]  ×3           what happened: the word, the cause where it says more than a shot (ammo rack, fire,
//                                    ramming, a drone), the streak's multiplier from the second kill in its window
//   [flag] Callsign                  the victim, callsign first (SPEC 12.2.3)
//   Leopard 2A6 · Enemy              its vehicle and its side
//   You · 120 mm DM53 APFSDS · 840 m who made it, with what and from how far (the player's last hit on it, where the
//                                    hit carried them)
//   +640 damage · 1 zone · 2 spotted what the streak earned (+kills, +damage, the zones the side took, the tanks the
//                                    player lit in the streak's window), only when there is any
// and beside them the destroyed hull's own 3/4 render whole: fitted to its silhouette's bounds with padding
// (portraitFraming.ts fitPortraitInBox over the render's measured pixels), so a long gun, a tall launcher or a squat
// casemate all show entire. It holds 2.4 s after the latest kill (SPEC 12.2.1) and steps aside while a notice meets its
// place (battleHudLayout.ts yieldKillRibbon). The mouse layouts wide and tall enough for it show it (laptop and desktop,
// 720 px and up); every other layout reads the same kill in the feed.

import { createElement as el } from './dom.ts';
import { ensureStyle } from './styleLayers.ts';
import { formatNumber, t } from './i18n.ts';
import { uiIconSVG } from './uiIcons.ts';
import { iconUrl, maskIcon } from './icons.ts';
import { hexPlateClip } from './hexPlate.ts';
import { fitPortraitInBox, measurePortraitFullBounds, type PortraitPixelBounds } from './portraitFraming.ts';

/** How long the card holds after the latest kill, and how soon another kill extends the streak. */
const RIBBON_HOLD_MS = 2400;
const STREAK_WINDOW_MS = 8000;
/** How many of the latest spots and captures the stream remembers. */
const RECENT = 8;
/** The render's box (px; a tight card scales it by its own factor, the same proportions): the fit is computed for this
 *  aspect and written as shares of the box. */
const KILL_CARD_ART = Object.freeze({ w: 196, h: 92, pad: 0.05 });

/** How many of `times` fall in the streak's window before `now`. */
function inWindow(times: Float64Array, now: number): number {
  let count = 0;
  for (let i = 0; i < times.length; i++) if (now - times[i] <= STREAK_WINDOW_MS) count++;
  return count;
}

const CSS = `
.cot-ribbon{--kc-point:22px;--kc-art-w:${KILL_CARD_ART.w}px;--kc-art-h:${KILL_CARD_ART.h}px;--kc-fill:var(--hud-plate-strong);
  --kc-line:color-mix(in srgb,var(--accent) 38%,var(--line-2));
  position:absolute;z-index:var(--hud-layer-status);left:var(--hud-ribbon-x,50%);top:var(--hud-ribbon-top,var(--hud-systems-top,80%));
  transform:translate(-50%,calc(-100% - 8px));width:var(--hud-ribbon-w,min(520px,calc(100vw - 32px)));box-sizing:border-box;display:none;
  align-items:center;gap:12px;min-height:calc(var(--kc-art-h) + 16px);padding:8px calc(var(--kc-point) + 2px) 8px calc(var(--kc-point) + 8px);
  isolation:isolate;color:var(--ink-1);pointer-events:none;opacity:0;visibility:hidden;
  transition:opacity var(--dur-base) var(--ease-exit),visibility var(--dur-base) step-end}
/* the HUD's hexagon (hexPlate.ts): its edge and its fill two layers under the card, as the notice plates (a ring cannot
   follow a clip) */
.cot-ribbon::before,.cot-ribbon::after{content:'';position:absolute;z-index:-1;pointer-events:none;clip-path:${hexPlateClip('var(--kc-point)')}}
.cot-ribbon::before{inset:0;background:var(--kc-line)}
.cot-ribbon::after{inset:1px;background:radial-gradient(60% 120% at 82% 60%,color-mix(in srgb,var(--accent) 11%,transparent),transparent 70%),var(--kc-fill)}
/* (a mouse layout from 768 px wide: centred over the systems row in the gap its lower corners leave, battleHudLayout.ts;
   gauntlet r3 found no kill banner at 1024x600 and 900x700) */
body:not(.cot-touch-layout):is([data-cot-width='tablet'],[data-cot-width='laptop'],[data-cot-width='desktop']):not([data-cot-height='short']) .cot-ribbon{display:flex}
.cot-ribbon.on{opacity:1;visibility:visible;transition:opacity var(--dur-fast) var(--ease-enter)}
/* it steps aside for a notice that meets it, while spectating, and in the scope (the direction's 06b .sniper .ribbon) */
.cot-ribbon.on.yield,body.cot-spectating .cot-ribbon.on,html[data-cot-scoped] .cot-ribbon.on{opacity:0;visibility:hidden}
.cot-ribbon.on.cramped,.cot-ribbon.cramped{opacity:0;visibility:hidden}
.cot-ribbon .copy{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:3px}
.cot-ribbon .head,.cot-ribbon .who,.cot-ribbon .what,.cot-ribbon .how{display:flex;align-items:center;gap:8px;min-width:0}
.cot-ribbon .w{flex:none;font:700 var(--battle-fs-12)/1 var(--hud-font);letter-spacing:var(--track-label);text-transform:uppercase;color:var(--accent)}
/* (the cause in the card's capitals, as its word: a title-case "Fire" beside it read as another kit, gauntlet r5) */
.cot-ribbon .cause{display:contents}
.cot-ribbon .cot-c-chip{flex:none;height:20px;padding:0 var(--s2);font-size:var(--battle-fs-11);letter-spacing:var(--track-label);text-transform:uppercase}
.cot-ribbon .cot-c-chip svg{width:12px;height:12px}
.cot-ribbon .cot-c-chip[data-cause='ammorack']{color:var(--sys-ammo);box-shadow:var(--battle-ring-ammo)}
.cot-ribbon .cot-c-chip[data-cause='fire']{color:var(--danger);box-shadow:var(--ring-danger)}
/* (the streak is its count alone on a tungsten block: a word under "×3" said "TRIPLE" again, gauntlet r12) */
.cot-ribbon .x{flex:none;margin-left:auto;padding:2px 7px;background:var(--accent);color:var(--ink-on-accent);font:700 var(--battle-fs-13)/1 var(--hud-font)}
.cot-ribbon .x[hidden]{display:none}
/* the callsign takes its row (SPEC 12.2.3), cut at its end before anything else gives */
.cot-ribbon .cs{flex:1 1 auto;min-width:4ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:700 var(--battle-fs-20)/1.1 var(--hud-font)}
.cot-ribbon .fl{display:flex;flex:none}.cot-ribbon .fl:empty{display:none}
.cot-ribbon .fl .cot-flag{display:block;border-radius:1px;box-shadow:var(--flag-ring)}
.cot-ribbon .what,.cot-ribbon .how{font:500 var(--battle-fs-13)/1.2 var(--font-body);color:var(--ink-2);white-space:nowrap}
.cot-ribbon .vn{min-width:0;overflow:hidden;text-overflow:ellipsis}
.cot-ribbon .vn[hidden]{display:none}
.cot-ribbon .side{flex:none;color:var(--text-enemy);font-weight:700;text-transform:uppercase;letter-spacing:var(--track-label-s);font-size:var(--battle-fs-11)}
.cot-ribbon .by{flex:none;color:var(--text-own);font-weight:700}
.cot-ribbon .wp{min-width:0;overflow:hidden;text-overflow:ellipsis}
.cot-ribbon .wp:empty,.cot-ribbon .rg:empty{display:none}
.cot-ribbon .rg{flex:none;font-family:var(--font-data);color:var(--ink-1)}
.cot-ribbon .how>:not(:first-child)::before{content:'·';margin-right:8px;color:var(--ink-3)}
.cot-ribbon .stream{display:flex;gap:12px;margin-top:2px;font:500 var(--battle-fs-12)/1 var(--font-data);color:var(--accent)}
.cot-ribbon .stream>span{display:flex;align-items:center;gap:4px;white-space:nowrap}
.cot-ribbon .stream>span[hidden],.cot-ribbon .stream[hidden]{display:none}
.cot-ribbon .stream svg{width:12px;height:12px;flex:none}
.cot-ribbon .gi{display:flex}
/* the destroyed hull, whole: its render placed by its own silhouette's bounds (fitPortraitInBox), never cropped */
.cot-ribbon .art{position:relative;flex:none;width:var(--kc-art-w);height:var(--kc-art-h)}
.cot-ribbon .art img{position:absolute;display:block;max-width:none;height:auto;left:var(--kc-x,0%);top:var(--kc-y,0%);width:var(--kc-w,100%);
  opacity:0;transition:opacity var(--dur-fast) var(--ease-enter)}
.cot-ribbon .art img.fit{opacity:1}
.cot-ribbon .sil{position:absolute;inset:18% 6%;color:var(--team-enemy);transform:scaleX(-1);filter:var(--sil-shadow)}
.cot-ribbon .sil[hidden],.cot-ribbon .art[hidden]{display:none}
/* (a card in a narrow gap keeps the callsign: the cause chip gives way and the render steps down to three quarters,
   battleHudLayout.ts RIBBON_TIGHT; at 1024x600 the callsign read "Command…" beside them, gauntlet r4) */
.cot-ribbon.tight{--kc-point:16px;--kc-art-w:${Math.round(KILL_CARD_ART.w * 0.72)}px;--kc-art-h:${Math.round(KILL_CARD_ART.h * 0.72)}px;gap:8px;padding-left:calc(var(--kc-point) + 6px)}
.cot-ribbon.tight .cause{display:none}
.cot-ribbon.tight .cs{font-size:var(--battle-fs-16)}
:lang(zh-CN) .cot-ribbon .w,:lang(zh-CN) .cot-ribbon .cot-c-chip,:lang(zh-CN) .cot-ribbon .side{font-size:var(--battle-fs-13)}
`;

/** The victim as the HUD knows it: `flag` is its nation's flag markup (flags.ts), empty where none has loaded. */
interface RibbonVictim {
  id: string;
  callsign: string;
  vehicle: string;
  flag: string;
  specId: string | null;
}

/** The kill's cause as killPresentation() names it. */
interface RibbonCause {
  cause: string;
  icon: string;
  label: string;
}

/** The player's hit on a tank as the card names it: the round as a weapon (hitEventFormat.ts weaponDisplayName), and how
 *  far it flew (m), where the hit carried them. */
interface RibbonShot {
  readonly weapon: string;
  readonly distanceM: number | null;
}

interface KillRibbonRuntime {
  root: HTMLElement;
  /** The player hit a tank for `amount` (summed into the stream when it dies), with the round and its range. */
  damage(targetId: string, amount: number, shot?: RibbonShot): void;
  /** The player destroyed `victim`. */
  kill(victim: RibbonVictim, cause: RibbonCause): void;
  /** Whether the card shows a kill here now (a mouse layout from 768 px wide and not short, not spectating, not in the
   *  scope): the feed then leaves the player's own kill to it (one datum, one place: UI-LOCKDOWN B1). */
  shows(): boolean;
  /** The player lit an enemy (the stream counts the spots of the streak's window). */
  spot(): void;
  /** The player's side took a zone. */
  zone(): void;
  /** A battle ends or restarts: forget the streak and the damage ledger. */
  clear(): void;
}

const CAUSE_CHIPS = new Set(['ammorack', 'fire', 'ram', 'drone']);

/** Each render's silhouette bounds, measured once per page from its pixels (null: unmeasurable, the render then fills its
 *  box uncropped by its own frame). */
const boundsByUrl = new Map<string, Promise<PortraitPixelBounds | null>>();
function renderBounds(img: HTMLImageElement): Promise<PortraitPixelBounds | null> {
  const url = img.currentSrc || img.src;
  let pending = boundsByUrl.get(url);
  if (!pending) {
    pending = (typeof img.decode === 'function' ? img.decode() : Promise.reject(new Error('no decode'))).then(() => {
      const w = img.naturalWidth, h = img.naturalHeight;
      const canvas = (img.ownerDocument ?? document).createElement('canvas');
      canvas.width = w; canvas.height = h;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context || !w || !h) return null;
      context.drawImage(img, 0, 0);
      return measurePortraitFullBounds(context.getImageData(0, 0, w, h).data, w, h);
    }).catch(() => null);
    boundsByUrl.set(url, pending);
  }
  return pending;
}

export function createKillRibbon(parent: HTMLElement): KillRibbonRuntime {
  ensureStyle('cot-hud-ribbon-style', CSS, 'surfaces');
  const root = el('div', 'cot-ribbon', parent);
  root.setAttribute('role', 'status');
  const copy = el('div', 'copy', root);
  const head = el('div', 'head', copy);
  const word = el('span', 'w', head);
  const causeHost = el('span', 'cause', head);
  const multi = el('span', 'x', head);
  const multiCount = el('span', 'n', multi);
  const who = el('div', 'who', copy);
  const flagHost = el('span', 'fl', who);
  const callsign = el('b', 'cs', who);
  const what = el('div', 'what', copy);
  const vehicle = el('span', 'vn', what);
  const side = el('span', 'side', what);
  const how = el('div', 'how', copy);
  const by = el('b', 'by', how);
  const weapon = el('span', 'wp', how);
  const range = el('span', 'rg', how);
  const stream = el('div', 'stream', copy);
  const killsItem = el('span', 'k', stream);
  el('span', 'gi', killsItem).innerHTML = uiIconSVG('skull', 12);
  const killsText = el('span', '', killsItem);
  const damageItem = el('span', 'd', stream);
  el('span', 'gi', damageItem).innerHTML = uiIconSVG('damage', 12);
  const damageText = el('span', '', damageItem);
  const zonesItem = el('span', 'z', stream);
  el('span', 'gi', zonesItem).innerHTML = uiIconSVG('modeZones', 12);
  const zonesText = el('span', '', zonesItem);
  const spotsItem = el('span', 's', stream);
  el('span', 'gi', spotsItem).innerHTML = uiIconSVG('optics', 12);
  const spotsText = el('span', '', spotsItem);
  const art = el('div', 'art', root);
  art.setAttribute('aria-hidden', 'true');
  const picture = el('img', '', art) as HTMLImageElement;
  picture.alt = '';
  picture.decoding = 'async';
  picture.draggable = false;
  const silhouette = el('span', 'sil', art);
  // the latest spots and captures, as times: a fixed ring each, so an event allocates nothing
  const spotTimes = new Float64Array(RECENT).fill(-Infinity);
  const zoneTimes = new Float64Array(RECENT).fill(-Infinity);
  let spotNext = 0, zoneNext = 0;
  const dealt = new Map<string, number>();
  const shots = new Map<string, RibbonShot>();
  let streak = 0, streakDamage = 0, lastKillMs = -Infinity;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  /** The render the card asked for last: a fit that lands after the next kill's is dropped. */
  let wanted = '';

  function paintStream(): void {
    const now = performance.now();
    killsText.textContent = t('hud.ribbon.kills', { count: streak });
    // (a streak's count is its multiplier's: the stream says it only for a single kill, gauntlet r2 read "×3 TRIPLE" and
    // "+3 kills" together)
    killsItem.hidden = streak >= 2;
    damageItem.hidden = streakDamage <= 0;
    damageText.textContent = t('hud.ribbon.damage', { amount: formatNumber(Math.round(streakDamage)) });
    const zones = inWindow(zoneTimes, now), spots = inWindow(spotTimes, now);
    zonesItem.hidden = zones <= 0;
    zonesText.textContent = t('hud.ribbon.zones', { count: zones });
    spotsItem.hidden = spots <= 0;
    spotsText.textContent = t('hud.ribbon.spots', { count: spots });
    // (a streak with nothing to add drops the band itself: an empty ruled strip hung under the plate, gauntlet r3)
    stream.hidden = killsItem.hidden && damageItem.hidden && zonesItem.hidden && spotsItem.hidden;
  }

  /** The victim's render, whole in its box: fitted to its measured silhouette, or its side silhouette where it has none. */
  function paintArt(specId: string | null): void {
    const url = specId ? iconUrl(specId, 'angle') : '';
    wanted = url;
    picture.classList.remove('fit');
    silhouette.hidden = true;
    art.hidden = !specId;
    if (!specId) { picture.removeAttribute('src'); return; }
    picture.onerror = () => {
      if (wanted !== url) return;
      picture.removeAttribute('src');
      silhouette.hidden = false;
      maskIcon(silhouette, specId, 'side_silhouette', 'currentColor');
    };
    if (picture.getAttribute('src') !== url) picture.src = url;
    void renderBounds(picture).then((bounds) => {
      if (wanted !== url) return;
      const fit = bounds && picture.naturalWidth
        ? fitPortraitInBox(bounds, picture.naturalWidth, KILL_CARD_ART.w, KILL_CARD_ART.h, KILL_CARD_ART.pad)
        : { width: KILL_CARD_ART.h / KILL_CARD_ART.w, left: (1 - KILL_CARD_ART.h / KILL_CARD_ART.w) / 2, top: 0 };
      picture.style.setProperty('--kc-w', `${(fit.width * 100).toFixed(2)}%`);
      picture.style.setProperty('--kc-x', `${(fit.left * 100).toFixed(2)}%`);
      picture.style.setProperty('--kc-y', `${(fit.top * 100).toFixed(2)}%`);
      picture.classList.add('fit');
    });
  }

  return {
    root,
    damage(targetId, amount, shot) {
      if (!targetId || !(amount > 0)) return;
      dealt.set(targetId, (dealt.get(targetId) ?? 0) + amount);
      if (shot) shots.set(targetId, shot);
    },
    kill(victim, cause) {
      const now = performance.now();
      if (now - lastKillMs > STREAK_WINDOW_MS) { streak = 0; streakDamage = 0; }
      lastKillMs = now;
      streak++;
      streakDamage += dealt.get(victim.id) ?? 0;
      dealt.delete(victim.id);
      const shot = shots.get(victim.id) ?? null;
      shots.delete(victim.id);
      word.textContent = t('hud.kill.shot');
      flagHost.innerHTML = victim.flag;
      callsign.textContent = victim.callsign;
      vehicle.textContent = victim.vehicle;
      vehicle.hidden = !victim.vehicle || victim.vehicle === victim.callsign;
      side.textContent = t('hud.enemy');
      by.textContent = t('hud.feed.you');
      // (a ram, a fire or a rack's blast is the cause chip's to say; a shot's round and range where its hit carried them)
      const shotKill = !CAUSE_CHIPS.has(cause.cause) || cause.cause === 'ammorack';
      // (the round by its designation and type, "M829A4 APFSDS": the calibre before it cut the type off at the card's width;
      // the whole name stays its title)
      const round = shotKill ? shot?.weapon ?? '' : '';
      weapon.textContent = round.replace(/^\d+\s*mm\s+/i, '');
      weapon.title = round;
      range.textContent = shotKill && shot?.distanceM != null && shot.distanceM > 0
        ? t('hud.killCard.distance', { m: formatNumber(Math.round(shot.distanceM)) }) : '';
      causeHost.replaceChildren();
      if (CAUSE_CHIPS.has(cause.cause)) {
        const chip = el('span', 'cot-c-chip', causeHost);
        chip.dataset.cause = cause.cause;
        el('span', 'gi', chip).innerHTML = uiIconSVG(cause.icon, 12);
        el('span', '', chip).textContent = cause.label;
      }
      multi.hidden = streak < 2;
      multiCount.textContent = `×${streak}`;
      paintArt(victim.specId);
      paintStream();
      root.classList.add('on');
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { hideTimer = null; root.classList.remove('on'); }, RIBBON_HOLD_MS);
    },
    shows() {
      // (its layouts set it flex: anything else, a phone's none or a stub document's nothing, shows no card)
      if (typeof getComputedStyle !== 'function' || getComputedStyle(root).display !== 'flex') return false;
      // (its own document's flags: a split-screen pane's card reads its pane's, hud.ts HudView)
      const doc = root.ownerDocument ?? document;
      return !doc.body.classList.contains('cot-spectating') && !doc.documentElement.hasAttribute('data-cot-scoped');
    },
    spot() {
      spotTimes[spotNext] = performance.now();
      spotNext = (spotNext + 1) % RECENT;
      if (root.classList.contains('on')) paintStream();
    },
    zone() {
      zoneTimes[zoneNext] = performance.now();
      zoneNext = (zoneNext + 1) % RECENT;
      if (root.classList.contains('on')) paintStream();
    },
    clear() {
      dealt.clear();
      shots.clear();
      spotTimes.fill(-Infinity);
      zoneTimes.fill(-Infinity);
      streak = 0; streakDamage = 0; lastKillMs = -Infinity;
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      root.classList.remove('on');
    },
  };
}
