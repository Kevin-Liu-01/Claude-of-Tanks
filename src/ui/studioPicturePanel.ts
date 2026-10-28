import type { RuntimeValue } from '../runtimeTypes.ts';
import { PICTURE_LETTERBOXES, PICTURE_SENSOR_MM } from '../game/studioPicture.ts';
import { createPickerMenu, type PickerMenu } from './components/pickerMenu.ts';
import { segmented, setRoving, wireRoving } from './components/components.ts';
import { pickerText } from './pickerText.ts';
import { t } from './i18n.ts';
/**
 * studioPicturePanel.ts — the Scene Studio "Picture" section (media r5): look picker, the key
 * grade/finish sliders, letterbox, depth of field (focus on the selected tank or a distance,
 * aperture, format) and reset. A thin view over `__STUDIO.setPicture()` / `getPicture()`, so a
 * hand-tuned picture round-trips through the scene JSON exactly like a scripted one.
 */

interface PictureSnapshot {
  readonly preset: string;
  readonly exposure: number;
  readonly contrast: number;
  readonly saturation: number;
  readonly temperature: number;
  readonly tint: number;
  readonly bloom: number;
  readonly chromaticAberration: number;
  readonly letterbox: string;
  readonly vignette: { readonly amount: number };
  readonly grain: { readonly amount: number };
  readonly halation: { readonly amount: number };
  readonly streaks: { readonly amount: number };
  readonly dof: {
    readonly enabled: boolean;
    readonly focusActor: string | null;
    readonly focusDistance: number;
    readonly fStop: number;
    readonly sensor: string;
  };
}

export interface StudioPicturePanelApi {
  readonly PICTURE_PRESETS: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  getPicture(): PictureSnapshot;
  setPicture(patch: Readonly<Record<string, RuntimeValue>> | null): RuntimeValue;
}

interface SliderLike {
  readonly row: HTMLDivElement;
  set(value: number): void;
}

interface PicturePanelKit {
  sliderRow(label: string, min: number, max: number, step: number, onInput: (value: number) => void): SliderLike;
  selectedActor(): { readonly uid: string; readonly name?: string | null } | null;
  flash(text: string): void;
}

const SENSORS = Object.keys(PICTURE_SENSOR_MM);
const F_STOPS = [0.95, 1.4, 2, 2.8, 4, 5.6, 8, 11, 16] as const;

/** A labelled choice on the kit (2026-10-27, the dropdown audit: these were raw selects): a set over five on the picker
 *  menu, two to five values on the segmented control. */
function labelledMenu(label: string, items: readonly { id: string; name: string }[], onChoose: (id: string) => void): { row: HTMLDivElement; menu: PickerMenu } {
  const row = document.createElement('div');
  row.className = 'production-lens';
  const name = document.createElement('span');
  name.textContent = label;
  const host = document.createElement('div');
  row.append(name, host);
  const menu = createPickerMenu(host, { id: 'studio-picture', label, items, value: items[0]?.id ?? null, layout: 'list', text: pickerText(),
    onChoose: (item) => onChoose(item.id) });
  return { row, menu };
}
function labelledSegments(label: string, options: readonly { value: string; label: string }[], onChoose: (value: string) => void): { row: HTMLDivElement; seg: HTMLElement } {
  const row = document.createElement('div');
  row.className = 'production-lens';
  const name = document.createElement('span');
  name.textContent = label;
  row.append(name);
  row.insertAdjacentHTML('beforeend', segmented({ label, className: 'studio-picture-seg', value: options[0]?.value ?? '', options }));
  const seg = row.lastElementChild as HTMLElement;
  wireRoving(seg, (value) => onChoose(value));
  return { row, seg };
}

/** A kit chip (src/ui/components) that toggles: aria-pressed carries its state. */
function chip(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cot-c-chip';
  button.dataset.uiSound = 'toggle';
  button.setAttribute('aria-pressed', 'false');
  button.textContent = label;
  return button;
}

/** Mount the Picture controls into `section`; returns the refresh hook the panel calls. */
export function mountStudioPicturePanel(
  S: StudioPicturePanelApi,
  section: HTMLDivElement,
  kit: PicturePanelKit,
): { refresh(): void } {
  const set = (patch: Readonly<Record<string, RuntimeValue>> | null): void => {
    try { S.setPicture(patch); } catch (error) { kit.flash(error instanceof Error ? error.message : String(error)); }
  };

  const look = labelledMenu(t('studioPanel.picture.look'),
    S.PICTURE_PRESETS.map((preset) => ({ id: preset.id, name: t(`studioPanel.picture.look.${preset.id}`) })), (id) => set({ preset: id }));
  section.appendChild(look.row);

  const sliders = {
    exposure: kit.sliderRow(t('studioPanel.picture.exposure'), -3, 3, 0.05, (v) => set({ exposure: v })),
    contrast: kit.sliderRow(t('studioPanel.picture.contrast'), 0.5, 2, 0.01, (v) => set({ contrast: v })),
    saturation: kit.sliderRow(t('studioPanel.picture.saturation'), 0, 2, 0.01, (v) => set({ saturation: v })),
    temperature: kit.sliderRow(t('studioPanel.picture.temperature'), -100, 100, 1, (v) => set({ temperature: v })),
    tint: kit.sliderRow(t('studioPanel.picture.tint'), -100, 100, 1, (v) => set({ tint: v })),
    bloom: kit.sliderRow(t('studioPanel.picture.bloom'), 0, 4, 0.05, (v) => set({ bloom: v })),
    halation: kit.sliderRow(t('studioPanel.picture.halation'), 0, 2, 0.01, (v) => set({ halation: { amount: v } })),
    streaks: kit.sliderRow(t('studioPanel.picture.streaks'), 0, 2, 0.01, (v) => set({ streaks: { amount: v } })),
    aberration: kit.sliderRow(t('studioPanel.picture.aberration'), 0, 1, 0.01, (v) => set({ chromaticAberration: v })),
    vignette: kit.sliderRow(t('studioPanel.picture.vignette'), 0, 1, 0.01, (v) => set({ vignette: { amount: v } })),
    grain: kit.sliderRow(t('studioPanel.picture.grain'), 0, 1, 0.01, (v) => set({ grain: { amount: v } })),
  };
  // Quick shows the look alone; the fine controls, the matte and depth of field are Pro (brand-ui SPEC 12.6)
  for (const slider of Object.values(sliders)) {
    slider.row.dataset.pro = '';
    section.appendChild(slider.row);
  }

  const matte = labelledSegments(t('studioPanel.picture.letterbox'),
    PICTURE_LETTERBOXES.map((box) => ({ value: box, label: box === 'none' ? t('studioPanel.picture.letterboxNone') : `${box} : 1` })),
    (value) => set({ letterbox: value }));
  matte.row.dataset.pro = '';
  section.appendChild(matte.row);

  // depth of field
  const dofRow = document.createElement('div');
  dofRow.className = 'grid';
  const dofBtn = chip(t('studioPanel.picture.dof'));
  dofBtn.addEventListener('click', () => set({ dof: { enabled: !S.getPicture().dof.enabled } }));
  dofRow.append(dofBtn);
  dofRow.dataset.pro = '';
  section.appendChild(dofRow);
  const format = labelledSegments(t('studioPanel.picture.sensor'),
    SENSORS.map((sensor) => ({ value: sensor, label: t(`studioPanel.picture.sensor.${sensor}`) })), (value) => set({ dof: { sensor: value } }));
  format.row.dataset.pro = '';
  section.appendChild(format.row);

  const focusRow = document.createElement('div');
  focusRow.className = 'grid';
  const focusTank = chip(t('studioPanel.picture.focusSelected'));
  focusTank.addEventListener('click', () => {
    const actor = kit.selectedActor();
    if (!actor) { kit.flash(t('studioPanel.picture.focusNeedsTank')); return; }
    set({ dof: { enabled: true, focusActor: actor.name || actor.uid } });
  });
  const focusDistanceBtn = chip(t('studioPanel.picture.focusDistance'));
  focusDistanceBtn.addEventListener('click', () => set({ dof: { enabled: true, focusActor: null } }));
  focusRow.append(focusTank, focusDistanceBtn);
  focusRow.dataset.pro = '';
  section.appendChild(focusRow);
  const distance = kit.sliderRow(t('studioPanel.picture.focusMeters'), 1, 200, 0.5, (v) => set({ dof: { focusDistance: v, focusActor: null } }));
  distance.row.dataset.pro = '';
  section.appendChild(distance.row);
  const aperture = labelledMenu(t('studioPanel.picture.fStop'), F_STOPS.map((stop) => ({ id: String(stop), name: `f/${stop}` })),
    (id) => set({ dof: { fStop: Number(id) } }));
  aperture.row.dataset.pro = '';
  section.appendChild(aperture.row);

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'cot-c-btn cot-c-btn--36 cot-c-btn--wide';
  reset.textContent = t('studioPanel.picture.reset');
  reset.addEventListener('click', () => set(null));
  section.appendChild(reset);

  return {
    refresh() {
      const p = S.getPicture();
      look.menu.setValue(p.preset);
      sliders.exposure.set(p.exposure);
      sliders.contrast.set(p.contrast);
      sliders.saturation.set(p.saturation);
      sliders.temperature.set(p.temperature);
      sliders.tint.set(p.tint);
      sliders.bloom.set(p.bloom);
      sliders.halation.set(p.halation.amount);
      sliders.streaks.set(p.streaks.amount);
      sliders.aberration.set(p.chromaticAberration);
      sliders.vignette.set(p.vignette.amount);
      sliders.grain.set(p.grain.amount);
      setRoving(matte.seg, p.letterbox);
      dofBtn.setAttribute('aria-pressed', String(p.dof.enabled));
      setRoving(format.seg, p.dof.sensor);
      focusTank.setAttribute('aria-pressed', String(p.dof.enabled && p.dof.focusActor != null));
      focusDistanceBtn.setAttribute('aria-pressed', String(p.dof.enabled && p.dof.focusActor == null));
      distance.set(p.dof.focusDistance);
      const nearest = F_STOPS.reduce((best, stop) => (Math.abs(stop - p.dof.fStop) < Math.abs(best - p.dof.fStop) ? stop : best));
      aperture.menu.setValue(String(nearest));
    },
  };
}
