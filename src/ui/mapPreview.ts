import { getMapConfig } from '../world/maps/index.ts';
import { createModal } from './modal.ts';
import { t } from './i18n.ts';
import { mapRegionTags } from './regionTags.ts';

interface MapPreview { id: string; name: string; blurb?: string; hero?: string; thumb?: string }
/** Lazy, full-width inspection; selecting a map remains an explicit action. */
export function openMapPreview(map: MapPreview, trigger: HTMLElement, select: () => void): void {
  const dialog = createModal({ title: map.name, size: 'large',
    onClose: () => { window.setTimeout(() => dialog.dispose(), 250); } });
  const figure = document.createElement('figure'); figure.style.margin = '0';
  const image = document.createElement('img'); image.src = map.hero || map.thumb || '';
  image.alt = map.name; image.style.cssText = 'display:block;width:100%;height:auto;max-height:65vh;object-fit:contain';
  const caption = document.createElement('figcaption'); caption.style.cssText = 'padding:var(--s3) 0;color:var(--ink-2);line-height:var(--lh-body)';
  caption.textContent = map.blurb || getMapConfig(map.id).blurb;
  const tags = document.createElement('p'); tags.textContent = mapRegionTags(map.id).map(tag => t(`camoTag.${tag}`)).join(' · ');
  figure.append(image, caption, tags); dialog.body.append(figure);
  const deploy = document.createElement('button'); deploy.type = 'button'; deploy.className = 'cot-modal__button';
  deploy.textContent = t('garage.map.deploy'); deploy.addEventListener('click', () => { select(); dialog.close(); });
  dialog.footer.append(deploy); dialog.open({ trigger });
}
