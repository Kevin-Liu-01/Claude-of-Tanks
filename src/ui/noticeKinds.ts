// The battle notices' kinds (notices-276b; Kevin 2026-11-24: "should we combine stuff, the art system is awesome, and
// theres so much and hexagons look better for the bigger notis", the plan he approved through Main). Copyright © 2026
// Kevin B. Liu.
//
// Every battle notice is raised with its kind, and the kind is declared here once: what it is about (its subject) and its
// shape. Both lanes read the table (battleNoticeEvents.ts the event lane, battleNotices.ts the condition lane); no notice
// carries an if or a rule of its own.
// - Subject. `tank`: the tank's own gun, ammunition and systems. While the crew looks through another view (Air Support's
//   binoculars, the drone's feed, the gunship) a tank notice is held, and shown when the view returns to the tank if it
//   still applies (a condition still raised; an event younger than VIEW_HOLD_MS). `crew`: a danger to the crew wherever
//   they look (a fire, the scuttle's hold), shown in every view. `air`: Air Support's air lane, one plate per live air event
//   (airSupportHud.ts), all in the condition lane, never the event lane, so one air subject shows at a time. `battle`: the
//   battle turning. `link`: the network and the pointer lock. `teaching`: the first-use hints.
// - Shape. `plate`: the HUD's long hexagon (the score plate's slant at both ends), for every large or subject notice,
//   anything with art, a detail line or keys. `pill`: a one-line status, rounded at both ends, never with art or a detail.
//   The lanes write the kind's shape as data-shape on the notice; one rule each in the HUD's sheet draws it (hud.ts,
//   battleHudLayout.css: --notice-cut).
// Pure: no DOM (the receipts run it in Node).

export type NoticeSubject = 'tank' | 'crew' | 'air' | 'battle' | 'link' | 'teaching';
export type NoticeShape = 'plate' | 'pill';

interface NoticeKindDeclaration {
  readonly subject: NoticeSubject;
  readonly shape: NoticeShape;
  /** Whether it carries a picture (components/noticeArt.ts): a plate only. */
  readonly art?: true;
}

const plate = (subject: NoticeSubject, art?: true): NoticeKindDeclaration => (art ? { subject, shape: 'plate', art } : { subject, shape: 'plate' });
const pill = (subject: NoticeSubject): NoticeKindDeclaration => ({ subject, shape: 'pill' });

export const NOTICE_KINDS = Object.freeze({
  // ---- the tank (held off a view)
  ammoTypeEmpty: plate('tank'),
  ammoDepleted: plate('tank'),
  missilesDepleted: plate('tank'),
  atgmSelected: plate('tank'),
  autoAimOn: plate('tank', true),
  autoAimRefused: pill('tank'),
  magazineRefused: pill('tank'),
  consumable: pill('tank'),
  apsIntercepted: pill('tank'),
  armorOverlay: pill('tank'),
  pickup: pill('tank'),
  moduleRepaired: pill('tank'),
  aimLimit: pill('tank'),
  overturned: plate('tank'),
  // ---- the crew (every view)
  fire: plate('crew'),
  scuttle: plate('crew'),
  // ---- the air lane (airSupportHud.ts, the condition lane)
  airIncoming: plate('air', true),
  airOrder: plate('air', true),
  airDown: plate('air', true),
  droneDown: plate('air', true),
  // ---- the battle
  objective: plate('battle'),
  wave: plate('battle'),
  caption: plate('battle'),
  infected: plate('battle'),
  cacheDropped: pill('battle'),
  // ---- the link, the teaching
  link: plate('link'),
  pointerLock: pill('link'),
  hint: plate('teaching'),
} satisfies Record<string, NoticeKindDeclaration>);

export type NoticeKind = keyof typeof NOTICE_KINDS;

/** What the crew looks through: the tank (its own sight and scope), or a view that is not the tank's. */
export type NoticeView = 'tank' | 'binoculars' | 'drone' | 'gunship';

/** How long a tank event held behind a view still shows when the view returns to the tank (ms). */
export const VIEW_HOLD_MS = 6000;

/** The kind's declaration (an unknown kind reads as a battle plate: a receipt holds every raise to a declared kind). */
export function noticeKind(kind: string | null | undefined): NoticeKindDeclaration {
  return (kind && Object.hasOwn(NOTICE_KINDS, kind) ? NOTICE_KINDS[kind as NoticeKind] : null) ?? NOTICE_KINDS.objective;
}

/** Whether a kind's notice shows in a view: the tank's own only from the tank. */
export function shownInView(kind: string | null | undefined, view: NoticeView): boolean {
  return view === 'tank' || noticeKind(kind).subject !== 'tank';
}
