import type { RuntimeValue } from '../runtimeTypes.ts';
import { PICTURE_LETTERBOXES, PICTURE_SENSOR_MM } from '../game/studioPicture.ts';
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

function option(select: HTMLSelectElement, value: string, label: string): void {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  select.appendChild(o);
}

function labelledSelect(label: string): { row: HTMLLabelElement; select: HTMLSelectElement } {
  const row = document.createElement('label');
  row.className = 'row';
  const k = document.createElement('span');
  k.className = 'k';
  k.textContent = label;
  const select = document.createElement('select');
  select.setAttribute('aria-label', label);
  row.append(k, select);
  return { row, select };
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

  const look = labelledSelect(t('studioPanel.picture.look'));
  for (const preset of S.PICTURE_PRESETS) option(look.select, preset.id, t(`studioPanel.picture.look.${preset.id}`));
  look.select.addEventListener('change', () => set({ preset: look.select.value }));
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
  for (const slider of Object.values(sliders)) section.appendChild(slider.row);

  const matte = labelledSelect(t('studioPanel.picture.letterbox'));
  for (const box of PICTURE_LETTERBOXES) {
    option(matte.select, box, box === 'none' ? t('studioPanel.picture.letterboxNone') : `${box} : 1`);
  }
  matte.select.addEventListener('change', () => set({ letterbox: matte.select.value }));
  section.appendChild(matte.row);

  // depth of field
  const dofRow = document.createElement('div');
  dofRow.className = 'grid';
  dofRow.style.marginTop = '4px';
  const dofBtn = document.createElement('button');
  dofBtn.type = 'button';
  dofBtn.textContent = t('studioPanel.picture.dof');
  dofBtn.addEventListener('click', () => set({ dof: { enabled: !S.getPicture().dof.enabled } }));
  const format = document.createElement('select');
  format.setAttribute('aria-label', t('studioPanel.picture.sensor'));
  for (const sensor of SENSORS) option(format, sensor, t(`studioPanel.picture.sensor.${sensor}`));
  format.addEventListener('change', () => set({ dof: { sensor: format.value } }));
  dofRow.append(dofBtn, format);
  section.appendChild(dofRow);

  const focusRow = document.createElement('div');
  focusRow.className = 'grid';
  focusRow.style.marginTop = '5px';
  const focusTank = document.createElement('button');
  focusTank.type = 'button';
  focusTank.textContent = t('studioPanel.picture.focusSelected');
  focusTank.addEventListener('click', () => {
    const actor = kit.selectedActor();
    if (!actor) { kit.flash(t('studioPanel.picture.focusNeedsTank')); return; }
    set({ dof: { enabled: true, focusActor: actor.name || actor.uid } });
  });
  const focusDistanceBtn = document.createElement('button');
  focusDistanceBtn.type = 'button';
  focusDistanceBtn.textContent = t('studioPanel.picture.focusDistance');
  focusDistanceBtn.addEventListener('click', () => set({ dof: { enabled: true, focusActor: null } }));
  focusRow.append(focusTank, focusDistanceBtn);
  section.appendChild(focusRow);
  const distance = kit.sliderRow(t('studioPanel.picture.focusMeters'), 1, 200, 0.5, (v) => set({ dof: { focusDistance: v, focusActor: null } }));
  distance.row.style.marginTop = '5px';
  section.appendChild(distance.row);
  const aperture = labelledSelect(t('studioPanel.picture.fStop'));
  for (const stop of F_STOPS) option(aperture.select, String(stop), `f/${stop}`);
  aperture.select.addEventListener('change', () => set({ dof: { fStop: Number(aperture.select.value) } }));
  section.appendChild(aperture.row);

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = t('studioPanel.picture.reset');
  reset.style.width = '100%';
  reset.style.marginTop = '4px';
  reset.addEventListener('click', () => set(null));
  section.appendChild(reset);

  return {
    refresh() {
      const p = S.getPicture();
      look.select.value = p.preset;
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
      matte.select.value = p.letterbox;
      dofBtn.classList.toggle('on', p.dof.enabled);
      dofBtn.setAttribute('aria-pressed', String(p.dof.enabled));
      format.value = p.dof.sensor;
      focusTank.classList.toggle('on', p.dof.enabled && p.dof.focusActor != null);
      focusDistanceBtn.classList.toggle('on', p.dof.enabled && p.dof.focusActor == null);
      distance.set(p.dof.focusDistance);
      const nearest = F_STOPS.reduce((best, stop) => (Math.abs(stop - p.dof.fStop) < Math.abs(best - p.dof.fStop) ? stop : best));
      aperture.select.value = String(nearest);
    },
  };
}
