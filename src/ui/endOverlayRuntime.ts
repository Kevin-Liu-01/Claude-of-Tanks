import type { RuntimeValue } from '../runtimeTypes.ts';
import {
  getLastBattleRecord,
  type BattleRecord,
  type BattleResult,
} from '../game/profile.ts';
import { t, formatNumber } from './i18n.ts';

interface EndOverlayBus {
  emit(event: string, payload: Record<string, RuntimeValue>): void;
}

interface EndOverlayRuntime {
  readonly root: HTMLDivElement;
  readonly returnButton: HTMLButtonElement;
  show(result: BattleResult): void;
  hide(): void;
}

interface EndOverlayOptions {
  bus: EndOverlayBus;
  onReturnToGarage(): void;
  getRecord?: () => BattleRecord | null;
  ownerDocument?: Document;
}

export function endRecordMarkup(record: BattleRecord | null): string {
  if (!record) return '';
  const killsText = t('endOverlay.kills', { count: record.kills });
  return `<span style="color:#ffd27a">${killsText}</span>`
    + `<span style="margin-left:14px;color:#cfd9e2">${t('endOverlay.damage', { count: formatNumber(record.damage) })}</span>`;
}

/**
 * Own the small integration overlay adopted by the full after-action screen.
 * Its DOM identity and button handler stay stable across every round so the
 * richer end screen can safely reparent the existing Garage action.
 */
export function createEndOverlayRuntime({
  bus,
  onReturnToGarage,
  getRecord = getLastBattleRecord,
  ownerDocument = document,
}: EndOverlayOptions): EndOverlayRuntime {
  if (!bus || typeof bus.emit !== 'function' || typeof onReturnToGarage !== 'function') {
    throw new TypeError('end overlay requires event and garage-return owners');
  }

  const root = ownerDocument.createElement('div');
  root.style.cssText =
    'position:fixed;inset:0;display:none;z-index:70;align-items:center;justify-content:center;'
    + 'flex-direction:column;gap:var(--s5);background:var(--battle-veil);color:var(--ink-1);';
  root.className = 'cot-end';

  const title = ownerDocument.createElement('div');
  title.style.cssText =
    'font:700 var(--fs-52)/1 var(--font-display);letter-spacing:var(--track-display);text-transform:uppercase;'
    + 'text-shadow:var(--battle-text-halo);';
  const recordLine = ownerDocument.createElement('div');
  recordLine.style.cssText =
    'font:700 var(--fs-15)/1.2 var(--font-ui);letter-spacing:var(--track-label-s);color:var(--ink-2);'
    + 'text-shadow:var(--battle-text-halo);';
  // the kit's button (the end screen adopts it into its actions row)
  const returnButton = ownerDocument.createElement('button');
  returnButton.type = 'button';
  returnButton.className = 'cot-c-btn cot-c-btn--secondary cot-c-btn--48';
  returnButton.textContent = t('endOverlay.returnToGarage');
  returnButton.dataset.uiSound = 'back';
  root.append(title, recordLine, returnButton);
  ownerDocument.body.appendChild(root);

  returnButton.addEventListener('click', () => {
    bus.emit('ui:click', {});
    onReturnToGarage();
  });

  const hide = (): void => {
    root.style.display = 'none';
  };

  return {
    root,
    returnButton,
    show(result) {
      title.textContent = result === 'victory'
        ? t('endOverlay.victory')
        : result === 'draw' ? t('endOverlay.draw') : t('endOverlay.defeat');
      title.style.color = result === 'victory'
        ? '#7ee87e'
        : result === 'draw' ? '#cfd9e2' : '#f05a5a';
      recordLine.innerHTML = endRecordMarkup(getRecord());

      // The after-action report owns the visible verdict and backdrop. This
      // stable integration root only retains and positions its adopted action.
      title.style.display = 'none';
      root.style.background = 'none';
      root.style.justifyContent = 'flex-end';
      root.style.paddingBottom = '5vh';
      root.style.display = 'flex';
    },
    hide,
  };
}
