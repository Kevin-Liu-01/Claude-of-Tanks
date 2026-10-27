type TextNode = Pick<HTMLElement, 'textContent'>;
type StyledNode = Pick<HTMLElement, 'style'>;

interface ConsumableSlotElements {
  button: Pick<HTMLButtonElement, 'classList' | 'setAttribute'>;
  count: TextNode & Pick<HTMLElement, 'classList'>;
  cooldown: StyledNode;
}

interface ConsumableSlotOptions {
  elements: ConsumableSlotElements;
  locale(): string;
  /** The ready tile's mark: ∞ for an unlimited item, or (2026-10-26, the catalog) the uses a charged item has left. */
  readyMark: string | (() => string);
  readyLabel(): string;
  coolingLabel(seconds: number): string;
}

export interface RetainedConsumableSlot {
  /** @param remainingS seconds until ready; any non-positive value is ready */
  render(remainingS: number, cooldownS: number): void;
}

/**
 * Retained counterpart of the immediate-mode consumable tray. The shell tray
 * beside it is already retained, but consumables re-queried their children and
 * re-translated their accessible label on every presented frame even when no
 * cooldown was running anywhere in the battle. Only copied primitives are kept
 * here, so an unchanged sweep, count, cooling class or label never reaches the
 * DOM. `null` seconds marks the ready label and a locale change clears the
 * memo, which keeps accessibility in step with the rendered class.
 */
export function createRetainedConsumableSlot({
  elements, locale, readyMark, readyLabel, coolingLabel,
}: ConsumableSlotOptions): RetainedConsumableSlot {
  let cooling: boolean | undefined;
  let sweep: string | undefined;
  let countText: string | undefined;
  let seconds: number | null | undefined;
  let currentLocale: string | undefined;

  return {
    render(remainingS, cooldownS) {
      const nextCooling = remainingS > 0;
      if (cooling !== nextCooling) {
        cooling = nextCooling;
        elements.cooldown.style.display = nextCooling ? 'block' : 'none';
        elements.button.classList.toggle('cooling', nextCooling);
        // The countdown ticks in tabular Plex Mono; the ready mark ∞ stays in the shell face (its fallback's bold ∞).
        elements.count.classList.toggle('num', nextCooling);
        seconds = undefined;
      }
      const nextLocale = locale();
      if (currentLocale !== nextLocale) {
        currentLocale = nextLocale;
        seconds = undefined;
      }
      if (!nextCooling) {
        const mark = typeof readyMark === 'function' ? readyMark() : readyMark;
        if (countText !== mark) {
          countText = mark;
          elements.count.textContent = mark;
        }
        if (seconds !== null) {
          seconds = null;
          elements.button.setAttribute('aria-label', readyLabel());
        }
        return;
      }
      const remaining = Math.ceil(remainingS);
      const percent = Math.max(0, Math.min(100, remainingS / cooldownS * 100));
      const nextSweep = `${percent.toFixed(1)}%`;
      if (sweep !== nextSweep) {
        sweep = nextSweep;
        elements.cooldown.style.setProperty('--cool', nextSweep);
      }
      const nextCount = String(remaining);
      if (countText !== nextCount) {
        countText = nextCount;
        elements.count.textContent = nextCount;
      }
      if (seconds !== remaining) {
        seconds = remaining;
        elements.button.setAttribute('aria-label', coolingLabel(remaining));
      }
    },
  };
}
