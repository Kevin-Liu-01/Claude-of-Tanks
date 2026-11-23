/**
 * killcamShotCard.ts — the kill cam's one shot card (death-flow-275; Kevin 2026-11-21: "make the kill cam look a lot better
 * esp in terms of ui and presentation"). It replaces the replay's two cards (the "ballistic analysis" block and the death
 * view's killer card, which named the tank and its tier only and read "APFSDS · CL3143"): who fired, with what, what it
 * did and where it landed, and the shot's numbers, in one card at the band's left.
 *
 *   [flag] Viper 2                         the killer's callsign (a room player's name), else its platform
 *   Leopard 2A6 · Tier X                   its vehicle, or the call-in and who called it
 *   120 mm DM53 APFSDS                     hitEventFormat.ts weaponDisplayName (the end screen's), never a bare designation
 *   PENETRATED · Turret front L            the outcome chip and the hit's location
 *   Distance · Damage · Armor · Pen        the shot's figures (one damage figure: hullPointsRemoved)
 *                                          the killer's tank render beside the first lines
 *
 * `shotCardModel` is pure (the selftest builds every outcome in Node); the lookups a spec needs are injected, so this
 * module never imports the fleet. `renderShotCard` writes a model into the card's markup. Copyright © 2026 Kevin B. Liu.
 */
import { t } from '../ui/i18n.ts';
import { hitOutcomeFor, nominalPenFor, weaponDisplayName, zoneLabel, type HitEventPresentation } from '../ui/hitEventFormat.ts';
import { hullPointsRemoved } from './hullPointsRemoved.ts';
import { killSourceIdentity } from '../ui/killSourceIdentity.ts';

/** The hit event fields the card reads (the killcam's KillcamHitEvent carries all of them). */
export interface ShotCardEvent extends HitEventPresentation {
  readonly kind?: string;
  readonly attackerId?: string | null;
  readonly attackerName?: string | null;
  readonly attackerSpecId?: string | null;
  readonly attackerSource?: string | null;
  readonly targetName?: string | null;
  readonly targetSpecId?: string | null;
  readonly ammoRacked?: boolean;
  readonly flightDistM?: number;
  readonly impactAngleDeg?: number;
  readonly nominalMm?: number;
  readonly effectiveMm?: number;
  readonly physicalMm?: number;
  readonly penRollMm?: number;
  readonly closingMps?: number;
}

/** What the card needs from the fleet and the roster, injected by the killcam (and stubbed by the selftest). */
export interface ShotCardLookups {
  /** A vehicle's display name, or null for an unknown id. */
  specName(specId: string): string | null;
  /** A vehicle's nation (its flag), or null. */
  specNation(specId: string): string | null;
  /** A vehicle's tier numeral, or ''. */
  tier(specId: string): string;
}

export type ShotCardView = 'death' | 'kill' | 'final';
export type ShotOutcomeTone = 'pen' | 'rack' | 'glance' | 'ram' | 'fire';

export interface ShotCardStat { readonly id: 'distance' | 'armor' | 'pen' | 'damage' | 'closing'; readonly label: string; readonly value: string }

export interface ShotCardModel {
  readonly view: ShotCardView;
  /** "Destroyed by" (your death), "Your kill", "Final blow". */
  readonly heading: string;
  /** The killer: a callsign or a player's name, else the platform ("AC-130"), else "enemy". */
  readonly who: string;
  /** The killer's nation for its flag (null: a platform, or unknown). */
  readonly flagNation: string | null;
  /** Its vehicle and tier ("Leopard 2A6 · Tier X"), or the call-in and its caller ("GAU-8 strafing run · called by Viper 2"). */
  readonly vehicle: string;
  /** The platform's icon where a call-in, the gunship or a drone made the kill. */
  readonly sourceIcon: string | null;
  /** The killer's vehicle, whose render stands at the card's right (Kevin 2026-11-22: "in the right of the enemy stat
   *  readout show their tank card since theres extra space there"); null for a platform. */
  readonly vehicleSpecId: string | null;
  /** The round as a weapon ("120 mm DM53 APFSDS"); '' for a ram or a fire. */
  readonly weapon: string;
  readonly outcome: { readonly tone: ShotOutcomeTone; readonly label: string };
  /** Where it struck ("Turret front L"); '' where no plate was struck. */
  readonly location: string;
  /** The victim, outside the death view ("Leopard 1A5"). */
  readonly target: string | null;
  readonly stats: readonly ShotCardStat[];
}

export interface ShotCardInput {
  readonly ev: ShotCardEvent;
  readonly view: ShotCardView;
  readonly replayKind: 'projectile' | 'collision';
  /** The destruction's cause when it was not the shot itself (a fire that burned the hull out). */
  readonly cause?: string | null;
  /** The killer's and the victim's names as the rosters show them (callsigns; a room player's name). */
  readonly killerCallsign?: string | null;
  readonly victimCallsign?: string | null;
}

const round = (value: number | undefined): number => Math.round(Number.isFinite(value) ? (value as number) : 0);

/** The armour the round met, as the card says it: "220 → 410 mm" (nominal → effective), a ricochet's plate and angle. */
function armorText(ev: ShotCardEvent): string {
  const plateMm = ev.nominalMm || ev.physicalMm || 0;
  if (ev.kind === 'ricochet' && plateMm > 0) return t('shotInfo.armorRicochet', { mm: round(plateMm), angle: round(ev.impactAngleDeg) });
  if ((ev.nominalMm || 0) > 0 || (ev.effectiveMm || 0) > 0) {
    return t('shotInfo.armorEffective', { nominal: round(ev.nominalMm), effective: round(ev.effectiveMm) });
  }
  return t('killcam.externalNoArmor');
}

function outcomeOf(input: ShotCardInput): ShotCardModel['outcome'] {
  const { ev } = input;
  if (input.replayKind === 'collision') return { tone: 'ram', label: t('killcam.outcome.rammed') };
  if (ev.ammoRacked || input.cause === 'ammorack' || input.cause === 'ammo_rack') {
    return { tone: 'rack', label: t('killcam.outcome.ammoRack') };
  }
  if (input.cause === 'fire') return { tone: 'fire', label: t('killcam.outcome.burnedOut') };
  const outcome = hitOutcomeFor(ev);
  return { tone: outcome.id === 'penetration' || outcome.id === 'splash' || outcome.id === 'module_hit' ? 'pen' : 'glance', label: outcome.label };
}

/** The card for one replayed kill. */
export function shotCardModel(input: ShotCardInput, lookups: ShotCardLookups): ShotCardModel {
  const { ev, view } = input;
  const source = killSourceIdentity(ev.attackerSource);
  const specId = !source && ev.attackerSpecId ? ev.attackerSpecId : null;
  const vehicleName = specId ? lookups.specName(specId) : null;
  // the crew that fired (a call-in's round is its caller's, the gunship's and a drone's their pilot's), else the platform
  const who = input.killerCallsign || source?.label || ev.attackerName || vehicleName || t('killcam.enemy');
  const tier = specId ? lookups.tier(specId) : '';
  let vehicle = '';
  if (source) vehicle = who === source.label ? '' : source.label;
  else if (vehicleName) vehicle = tier ? `${vehicleName} · ${t('killcam.tier', { tier })}` : vehicleName;
  const collision = input.replayKind === 'collision';
  const fire = input.cause === 'fire';
  const stats: ShotCardStat[] = [];
  if (collision) {
    stats.push({ id: 'closing', label: t('killcam.stat.closingSpeed'), value: `${round((ev.closingMps || 0) * 3.6)} km/h` });
  }
  const damage: ShotCardStat = { id: 'damage', label: t('killcam.stat.damage'), value: `−${round(hullPointsRemoved(ev))}` };
  // a blast's splash tests no plate (armour against pen means nothing there): distance and damage only
  const splash = ev.kind === 'he_splash';
  // an Air Support call-in's flight is measured from its caller, not from what released it: no distance (the gunship's
  // and a drone's are their own)
  const calledIn = !!source && source.source !== 'ac130' && source.source !== 'drone';
  if (collision || fire) stats.push(damage);
  else {
    // the short figures share the first row (distance, damage); armour and pen take a row each
    if (!calledIn) stats.push({ id: 'distance', label: t('killcam.stat.distance'), value: `${round(ev.flightDistM).toLocaleString()} m` });
    stats.push(damage);
    if (!splash) {
      stats.push({ id: 'armor', label: t('killcam.stat.armor'), value: armorText(ev) });
      const nominal = nominalPenFor(ev);
      const roll = round(ev.penRollMm);
      stats.push({ id: 'pen', label: t('killcam.stat.pen'), value: roll > 0 ? `${roll}${nominal > 0 ? ` / ${nominal}` : ''} mm` : '—' });
    }
  }
  return {
    view,
    heading: view === 'death' ? t('killcam.destroyedByHeading') : view === 'kill' ? t('killcam.card.yourKill') : t('killcam.card.finalBlow'),
    who,
    flagNation: specId ? lookups.specNation(specId) : null,
    vehicle,
    sourceIcon: source?.icon ?? null,
    vehicleSpecId: specId,
    weapon: collision || fire ? '' : weaponDisplayName(ev),
    outcome: outcomeOf(input),
    location: collision || fire ? '' : (ev.zone ? zoneLabel(ev.zone) : ''),
    target: view === 'death' ? null : (input.victimCallsign || ev.targetName || null),
    stats,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Markup
// ---------------------------------------------------------------------------------------------------------------------

export interface ShotCardDom {
  readonly root: HTMLElement;
  readonly heading: HTMLElement;
  readonly flag: HTMLElement;
  readonly who: HTMLElement;
  readonly vehicle: HTMLElement;
  readonly weapon: HTMLElement;
  readonly outcome: HTMLElement;
  readonly location: HTMLElement;
  readonly target: HTMLElement;
  readonly stats: HTMLElement;
  readonly art: HTMLElement;
}

/** The card's markup, built once per killcam (its words are written per replay, so a locale change reads at once). */
export function buildShotCard(parent: HTMLElement, make: (tag: string, className: string, host: HTMLElement) => HTMLElement): ShotCardDom {
  const root = make('section', 'cot-kc-card cot-m-rise', parent);
  root.setAttribute('aria-live', 'polite');
  const heading = make('div', 'hd', root);
  const id = make('div', 'id', root);
  const flag = make('span', 'fl', id);
  const who = make('span', 'who', id);
  const vehicle = make('div', 'veh', root);
  const weapon = make('div', 'wpn', root);
  const result = make('div', 'res', root);
  const outcome = make('span', 'oc cot-m-beat', result);
  const location = make('span', 'loc', result);
  const target = make('div', 'tg', root);
  const stats = make('dl', 'st', root);
  const art = make('div', 'art', root);
  art.setAttribute('aria-hidden', 'true');
  return { root, heading, flag, who, vehicle, weapon, outcome, location, target, stats, art };
}

export function renderShotCard(card: ShotCardDom, model: ShotCardModel, art: {
  flagHtml(nation: string): string;
  iconHtml(icon: string): string;
  vehicleUrl(specId: string): string;
}): void {
  card.root.dataset.view = model.view;
  card.root.dataset.tone = model.outcome.tone;
  card.heading.textContent = model.heading;
  card.flag.innerHTML = model.flagNation ? art.flagHtml(model.flagNation) : model.sourceIcon ? art.iconHtml(model.sourceIcon) : '';
  card.flag.hidden = !card.flag.innerHTML;
  card.who.textContent = model.who;
  card.vehicle.textContent = model.vehicle;
  card.vehicle.hidden = !model.vehicle;
  card.weapon.textContent = model.weapon;
  card.weapon.hidden = !model.weapon;
  card.outcome.textContent = model.outcome.label;
  card.location.textContent = model.location;
  card.location.hidden = !model.location;
  card.target.textContent = model.target ? t('killcam.card.target', { name: model.target }) : '';
  card.target.hidden = !model.target;
  card.stats.textContent = '';
  for (const stat of model.stats) {
    const row = document.createElement('div');
    row.dataset.stat = stat.id;
    const dt = document.createElement('dt');
    dt.textContent = stat.label;
    const dd = document.createElement('dd');
    dd.textContent = stat.value;
    row.append(dt, dd);
    card.stats.append(row);
  }
  card.art.hidden = !model.vehicleSpecId;
  if (model.vehicleSpecId) card.art.style.backgroundImage = `url(${art.vehicleUrl(model.vehicleSpecId)})`;
}

/**
 * The card's look: the HUD's angled plate in the battle's type, a tone rail on the left (the outcome's), the figures in
 * the data face. Colours are tokens only. Motion is the shared vocabulary (cot-m-rise on the card, cot-m-beat on the chip).
 */
export const SHOT_CARD_CSS = `
.cot-kc-card{position:absolute;z-index:calc(var(--z-hud-sight) + var(--z-lift));left:var(--kc-gutter,28px);bottom:calc(var(--kc-band,8vh) + var(--s3));width:min(340px,calc(100vw - 2 * var(--kc-gutter,28px)));
  display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:var(--s2);row-gap:3px;padding:var(--s2) var(--s3) var(--s3);
  background:linear-gradient(145deg,var(--hud-plate-strong),var(--hud-plate) 70%,var(--hud-plate-strong));
  border:1px solid var(--line-3);
  box-shadow:var(--battle-plate-shadow);color:var(--ink-1);pointer-events:none;}
.cot-kc-card[hidden]{display:none;}
/* (the text in the first column; the killer's tank render in the second, beside its name, vehicle, weapon and outcome:
   the room the figures leave there; the figures and the target line span both) */
.cot-kc-card>*{grid-column:1;}
.cot-kc-card>:is(.st,.tg){grid-column:1/-1;}
.cot-kc-card .art{grid-column:2;grid-row:1/span 5;align-self:center;width:112px;height:76px;
  background-position:center;background-size:contain;background-repeat:no-repeat;}
.cot-kc-card .art[hidden]{display:none;}
.cot-kc-card[data-tone=pen],.cot-kc-card[data-tone=rack],.cot-kc-card[data-tone=fire]{--kc-tone:var(--team-enemy);}
.cot-kc-card[data-tone=glance]{--kc-tone:var(--warn);}
.cot-kc-card[data-tone=ram]{--kc-tone:var(--accent);}
.cot-kc-card[data-view=kill],.cot-kc-card[data-view=final]{--kc-tone:var(--accent);}
.cot-kc-card .hd{font:700 var(--battle-fs-11)/1.2 var(--font-ui);letter-spacing:var(--track-label);text-transform:uppercase;color:var(--ink-3);}
.cot-kc-card .id{display:flex;align-items:center;gap:var(--s2);min-width:0;}
.cot-kc-card .fl{display:inline-flex;flex:none;color:var(--team-enemy);}
.cot-kc-card .fl[hidden]{display:none;}
.cot-kc-card .who{font:700 var(--battle-fs-18)/1.15 var(--font-ui);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cot-kc-card .veh{font:600 var(--battle-fs-12)/1.3 var(--font-ui);color:var(--ink-2);}
.cot-kc-card .wpn{font:700 var(--battle-fs-12)/1.3 var(--font-ui);letter-spacing:var(--battle-track-status);color:var(--accent-hi);}
.cot-kc-card .res{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s1) var(--s2);margin-top:var(--s1);}
.cot-kc-card .oc{padding:2px var(--s2);font:700 var(--battle-fs-11)/1.3 var(--font-ui);letter-spacing:var(--track-label);text-transform:uppercase;
  color:var(--surface-scene);background:var(--kc-tone,var(--accent));}
.cot-kc-card .loc{display:inline-block;font:600 var(--battle-fs-12)/1.3 var(--font-ui);color:var(--ink-2);}
.cot-kc-card .loc::first-letter{text-transform:uppercase;}
.cot-kc-card .tg{font:600 var(--battle-fs-12)/1.3 var(--font-ui);color:var(--ink-2);}
.cot-kc-card :is(.veh,.wpn,.loc,.tg)[hidden]{display:none;}
.cot-kc-card .st{display:grid;grid-template-columns:1fr 1fr;gap:var(--s1) var(--s3);margin:var(--s2) 0 0;
  padding-top:var(--s2);border-top:1px solid var(--line-2);}
.cot-kc-card .st div{display:flex;align-items:baseline;justify-content:space-between;gap:var(--s2);min-width:0;}
.cot-kc-card .st :is([data-stat=armor],[data-stat=pen]){grid-column:1/-1;}
.cot-kc-card .st dt{font:600 var(--battle-fs-11)/1.2 var(--font-ui);color:var(--ink-3);}
.cot-kc-card .st dd{margin:0;font:600 var(--battle-fs-12)/1.2 var(--font-data);color:var(--ink-1);white-space:nowrap;}
.cot-kc-card .st [data-stat=damage] dd{color:var(--accent-hi);}
`;
