/**
 * Interface sounds for every control in the garage and the menus.
 *
 * One delegated click listener classifies the control that was pressed — a
 * tab, a tank card, a list option, a toggle, a back or close button, the
 * primary action, any other button — and asks the audio facade for its sound;
 * a range input sounds on change. An element can name its sound, or opt out,
 * with `data-ui-sound`. In battle only menus and dialogs sound, never the
 * battle controls themselves. Controls that also emit 'ui:click' are
 * deduplicated by the engine's short interface window.
 */

export type InterfaceSound = 'click' | 'tab' | 'select' | 'toggle' | 'slider' | 'back' | 'confirm' | 'vehicle';

const SOUNDS: readonly InterfaceSound[] = ['click', 'tab', 'select', 'toggle', 'slider', 'back', 'confirm', 'vehicle'];

/** The slice of a DOM element the classifier reads (kept small so it runs in Node). */
interface ControlLike {
  readonly tagName?: string;
  readonly textContent?: string | null;
  readonly type?: string;
  getAttribute(name: string): string | null;
  closest(selector: string): ControlLike | null;
}

const CONTROL = '[data-ui-sound],button,[role="button"],[role="tab"],[role="option"],[role="switch"],[role="menuitem"],[role="checkbox"],a[href],input,select,summary';
const MENU = '[role="dialog"],[role="menu"],[aria-modal="true"],.cot-modal,.settings,.pause-menu';
const BACK = /\b(close|back|cancel|dismiss|exit|return)\b/i;
const PRIMARY = /^\s*(battle|play|deploy|start|ready|join|fight|launch)\b/i;

interface InterfaceHit {
  readonly sound: InterfaceSound;
  /** Inside a menu or dialog (the only controls that sound in battle). */
  readonly inMenu: boolean;
}

/** The sound for a pressed element, or null when it is not a control or opts out. */
export function classifyInterfaceTarget(target: ControlLike | null): InterfaceHit | null {
  const el = target?.closest(CONTROL) ?? null;
  if (!el) return null;
  if (el.getAttribute('disabled') != null || el.getAttribute('aria-disabled') === 'true') return null;
  const inMenu = !!el.closest(MENU);
  const named = el.getAttribute('data-ui-sound');
  if (named === 'none') return null;
  if (named && (SOUNDS as readonly string[]).includes(named)) return { sound: named as InterfaceSound, inMenu };
  const tag = (el.tagName || '').toLowerCase();
  const role = el.getAttribute('role');
  const type = (el.type || el.getAttribute('type') || '').toLowerCase();
  if (tag === 'input' && type === 'range') return null; // sounds on change, not on every press
  if (role === 'tab') return { sound: 'tab', inMenu };
  if (role === 'option') {
    const vehicle = el.getAttribute('data-spec-id') != null || !!el.closest('[data-spec-id]');
    return { sound: vehicle ? 'vehicle' : 'select', inMenu };
  }
  if (role === 'switch' || role === 'checkbox' || el.getAttribute('aria-pressed') != null
    || (tag === 'input' && (type === 'checkbox' || type === 'radio'))) return { sound: 'toggle', inMenu };
  const label = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`;
  const text = (el.textContent || '').trim();
  if (BACK.test(label) || BACK.test(text) || text === '×' || text === '✕') return { sound: 'back', inMenu };
  if (PRIMARY.test(text) || PRIMARY.test(label)) return { sound: 'confirm', inMenu };
  return { sound: 'click', inMenu };
}

interface ListenerTarget {
  addEventListener(type: string, listener: (event: { target: unknown }) => void, capture?: boolean): void;
  removeEventListener(type: string, listener: (event: { target: unknown }) => void, capture?: boolean): void;
}

/** Bind the delegated listeners; returns the unbind. */
export function bindInterfaceSounds(doc: ListenerTarget, onSound: (hit: InterfaceHit) => void): () => void {
  const isControl = (value: unknown): value is ControlLike =>
    !!value && typeof (value as ControlLike).closest === 'function' && typeof (value as ControlLike).getAttribute === 'function';
  const onClick = (event: { target: unknown }): void => {
    const hit = isControl(event.target) ? classifyInterfaceTarget(event.target) : null;
    if (hit) onSound(hit);
  };
  const onChange = (event: { target: unknown }): void => {
    const el = event.target;
    if (!isControl(el) || (el.tagName || '').toLowerCase() !== 'input') return;
    if ((el.type || el.getAttribute('type') || '').toLowerCase() !== 'range' || el.getAttribute('data-ui-sound') === 'none') return;
    onSound({ sound: 'slider', inMenu: !!el.closest(MENU) });
  };
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('change', onChange, true);
  return () => {
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('change', onChange, true);
  };
}
