// studioTemplateSheet.ts — the Studio's template browser (owner 2026-10-27: "make template presentation a lotttt more and
// better"). Copyright © 2026 Kevin B. Liu.
//
// One modal sheet over the Studio: beside the kit picker's cards (components/picker.ts: search, the kind and category
// chips, favourites and recents) one large preview shows the template under the pointer or the focus: its still, then its
// muted loop once the pointer rests (unless motion is reduced or data saved), its name, its facts, its sentence and, for a
// sequence, its three acts. Leaving the cards restores the current template; one press stages the one pressed and closes
// the sheet. The sheet is built the first time it opens, so a Studio visit that never browses pays nothing for it.

import { createPicker, type PickerFilter, type PickerText } from './components/picker.ts';
import { esc } from './components/escape.ts';
import { prefersReducedMotion } from './accessibilityPreferences.ts';
import { stillDataSaver } from '../presentation/responsivePicture.ts';
import { uiIconSVG } from './uiIcons.ts';
import { dialogSurface } from './components/surfaceStack.ts';
import type { StudioTemplate } from './studioTemplates.ts';

interface TemplateSheetOptions {
  readonly title: string;
  /** The count beside the title: "214 templates". */
  readonly count: (count: number) => string;
  /** The preview's line for a sequence: who it stars. */
  readonly stars: () => string;
  readonly text: PickerText;
  readonly filters: readonly PickerFilter[];
  readonly onChoose: (template: StudioTemplate) => void;
}

export interface TemplateSheet {
  /** Open on the current template (its card chosen, its preview shown). */
  open(items: readonly StudioTemplate[], value: string | null): void;
  close(): void;
  readonly isOpen: boolean;
}

/** How long the pointer or the focus rests on a card before its loop and its larger still load: a pointer crossing the
 *  cards fetches neither. */
const DWELL_MS = 300;

export function createTemplateSheet(options: TemplateSheetOptions): TemplateSheet {
  let dialog: HTMLDialogElement | null = null;
  let picker: ReturnType<typeof createPicker> | null = null;
  let items: readonly StudioTemplate[] = [];
  let value: string | null = null;
  let shownId: string | null | undefined;
  let wanted = '';
  let dwell = 0;
  let parts: {
    hero: HTMLImageElement; video: HTMLVideoElement; kind: HTMLElement; name: HTMLElement; facts: HTMLElement;
    summary: HTMLElement; acts: HTMLOListElement; stars: HTMLElement; count: HTMLElement;
  } | null = null;

  /** The larger still and the loop of the previewed template, after the dwell; the card's still shows at once. */
  const settle = (template: StudioTemplate | null): void => {
    window.clearTimeout(dwell);
    if (!parts) return;
    const { hero, video } = parts;
    video.classList.remove('is-playing');
    video.pause();
    const motion = !prefersReducedMotion() && !stillDataSaver();
    wanted = template?.loop && motion ? template.loop : '';
    if (!template) return;
    dwell = window.setTimeout(() => {
      if (template.hero && hero.dataset.full !== template.hero && !stillDataSaver()) {
        // the larger rung replaces the card's once it has decoded, so the preview never blanks
        const full = new Image();
        full.decoding = 'async';
        full.onload = () => { if (shownId === template.id) { hero.src = template.hero; hero.dataset.full = template.hero; } };
        full.src = template.hero;
      }
      if (!wanted) return;
      if (video.getAttribute('src') !== wanted) video.src = wanted;
      void video.play().catch(() => { /* the still stays */ });
    }, DWELL_MS);
  };

  /** Show one template in the preview: the current one when nothing is previewed. */
  const show = (template: StudioTemplate | null): void => {
    if (!parts) return;
    const next = template ?? items.find((item) => item.id === value) ?? items[0] ?? null;
    if (next?.id === shownId) return;
    shownId = next?.id ?? null;
    const { hero, kind, name, facts, summary, acts, stars } = parts;
    delete hero.dataset.fell;
    delete hero.dataset.full;
    hero.src = next?.media?.poster ?? '';
    kind.textContent = next?.meta[0] ?? '';
    kind.dataset.kind = next?.kind ?? '';
    name.textContent = next?.name ?? '';
    facts.innerHTML = (next?.meta ?? []).slice(1).map((fact) => `<span>${esc(fact)}</span>`).join('');
    summary.textContent = next?.summary ?? '';
    acts.innerHTML = (next?.acts ?? []).map(([act, at], index) =>
      `<li><span class="n">${String(index + 1).padStart(2, '0')}</span><span class="a">${esc(act)}</span><span class="t">${esc(at)}</span></li>`).join('');
    acts.hidden = !next?.acts?.length;
    stars.textContent = next?.kind === 'sequence' ? options.stars() : '';
    stars.hidden = next?.kind !== 'sequence';
    settle(next);
  };

  const build = (): HTMLDialogElement => {
    const sheet = document.createElement('dialog');
    sheet.className = 'cot-studio-templates';
    sheet.setAttribute('aria-labelledby', 'cot-studio-templates-title');
    // the preview is the cards' echo, so assistive tech reads the focused option, not this figure
    sheet.innerHTML = '<header class="st-tpl__head"><h2 id="cot-studio-templates-title"></h2><span class="st-tpl__count"></span>'
      + '<button type="button" class="cot-c-btn cot-c-btn--36 cot-c-btn--icon st-tpl__x" data-ui-sound="press"></button></header>'
      + '<div class="st-tpl__in"><figure class="st-tpl__preview" aria-hidden="true">'
      + '<div class="st-tpl__hero cot-c-media cot-c-media--soft"><img alt="" decoding="async">'
      + '<video muted loop playsinline preload="none" disablepictureinpicture disableremoteplayback></video>'
      + '<span class="st-tpl__kind"></span></div>'
      + '<figcaption><b class="st-tpl__name"></b><span class="st-tpl__facts"></span><p class="st-tpl__summary"></p>'
      + '<ol class="st-tpl__acts"></ol><span class="st-tpl__stars"></span></figcaption></figure>'
      + '<div class="st-tpl__cards"></div></div>';
    sheet.querySelector('h2')!.textContent = options.title;
    const close = sheet.querySelector<HTMLButtonElement>('.st-tpl__x')!;
    close.innerHTML = uiIconSVG('close', 18);
    close.setAttribute('aria-label', options.text.close ?? '');
    close.addEventListener('click', () => sheet.close());
    // a press on the scrim (the dialog's own box outside its contents) closes it
    sheet.addEventListener('click', (event) => { if (event.target === sheet) sheet.close(); });
    // the sheet's keys and pointer stay in it, as the Studio's panels' do: an Esc closing it never also exits the Studio,
    // and an arrow moving through the cards never flies the camera (the runtime's shortcuts listen on the window)
    for (const name of ['keydown', 'pointerdown', 'pointermove', 'pointerup', 'wheel']) sheet.addEventListener(name, (event) => event.stopPropagation());
    sheet.addEventListener('close', () => { settle(null); shownId = undefined; });
    const video = sheet.querySelector<HTMLVideoElement>('video')!;
    // shown once it plays, so the still holds while it loads; a loop that starts after the preview moved on stops
    video.addEventListener('playing', () => {
      if (video.getAttribute('src') === wanted) video.classList.add('is-playing'); else video.pause();
    });
    parts = {
      hero: sheet.querySelector<HTMLImageElement>('.st-tpl__hero>img')!, video,
      kind: sheet.querySelector<HTMLElement>('.st-tpl__kind')!, name: sheet.querySelector<HTMLElement>('.st-tpl__name')!,
      facts: sheet.querySelector<HTMLElement>('.st-tpl__facts')!, summary: sheet.querySelector<HTMLElement>('.st-tpl__summary')!,
      acts: sheet.querySelector<HTMLOListElement>('.st-tpl__acts')!, stars: sheet.querySelector<HTMLElement>('.st-tpl__stars')!,
      count: sheet.querySelector<HTMLElement>('.st-tpl__count')!,
    };
    // a card whose still is missing (a sequence rendered after this build) shows its battlefield's card
    sheet.addEventListener('error', (event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || image.dataset.fell) return;
      const id = image.closest<HTMLElement>('[data-id]')?.dataset.id ?? (image === parts?.hero ? shownId : null);
      const template = items.find((item) => item.id === id);
      if (!template) return;
      image.dataset.fell = '1';
      image.src = `/maps/cards/${template.map}.webp`;
    }, true);
    document.body.append(sheet);
    // on the kit's surface stack while it is open (transientSurfaceRegistry.ts): it replaces what stood open, Escape is the
    // stack's
    dialogSurface(sheet, 'studio-templates');
    picker = createPicker(sheet.querySelector<HTMLElement>('.st-tpl__cards')!, {
      id: 'studio-templates', label: options.title, items, value, layout: 'cards', text: options.text, filters: options.filters,
      memory: 'studio-template',
      onPreview: (item) => show(item as StudioTemplate | null),
      onChoose: (item) => {
        value = item.id;
        sheet.close();
        options.onChoose(item as StudioTemplate);
      },
    });
    return sheet;
  };

  return {
    open(next, current): void {
      const changed = next.length !== items.length || next.some((item, i) => item.id !== items[i]?.id);
      items = next;
      value = current;
      if (!dialog) dialog = build();
      else if (changed) picker!.setItems(items, value);
      else picker!.setValue(value);
      parts!.count.textContent = options.count(items.length);
      shownId = undefined;
      show(null);
      if (!dialog.open) dialog.showModal();
      picker!.focus();
    },
    close(): void { dialog?.close(); },
    get isOpen(): boolean { return !!dialog?.open; },
  };
}
