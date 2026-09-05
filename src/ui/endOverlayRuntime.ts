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

export interface EndOverlayRuntime {
  readonly root: HTMLDivElement;
  readonly returnButton: HTMLButtonElement;
  show(result: BattleResult): void;
  hide(): void;
}

export interface EndOverlayOptions {
  bus: EndOverlayBus;
  onReturnToGarage(): void;
  getRecord?: () => BattleRecord | null;
  ownerDocument?: Document;
}

export function endRecordMarkup(record: BattleRecord | null): string {
  if (!record) return '';
  const killsText = record.kills === 1 ? t('endOverlay.kills.one') : t('endOverlay.kills.many', { count: formatNumber(record.kills) });
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
    + 'flex-direction:column;gap:22px;background:rgba(4,7,10,0.55);'
    + "font-family:'ABC Monument Grotesk','Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#eef4f9;";
  root.className = 'cot-end';

  const title = ownerDocument.createElement('div');
  title.style.cssText =
    'font-size:52px;font-weight:800;letter-spacing:0.3em;text-shadow:0 2px 18px rgba(0,0,0,0.8);';
  const recordLine = ownerDocument.createElement('div');
  recordLine.style.cssText =
    'font-size:15px;font-weight:700;letter-spacing:0.14em;color:#cfd9e2;'
    + 'text-shadow:0 1px 8px rgba(0,0,0,0.8);';
  const returnButton = ownerDocument.createElement('button');
  returnButton.textContent = t('endOverlay.returnToGarage');
  returnButton.style.cssText =
    'font-size:16px;font-weight:700;letter-spacing:0.2em;padding:14px 44px;cursor:pointer;'
    + 'color:#fff7ea;border:1px solid #ffc169;background:linear-gradient(180deg,#ffa02e,#d95f00);'
    + "font-family:'ABC Monument Grotesk','Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
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
