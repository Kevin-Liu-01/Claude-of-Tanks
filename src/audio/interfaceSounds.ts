/**
 * Interface sounds for every control in the garage and the menus.
 *
 * One delegated click listener classifies the control that was pressed — a
 * tab, a tank card, a list option, a toggle, a back or close button, the
 * primary action, any other button — and asks the audio facade for its sound;
 * a range input sounds on change. In battle only menus and dialogs sound, never
 * the battle controls themselves. Controls that also emit 'ui:click' are
 * deduplicated by the engine's short interface window.
 *
 * Roles, not words (SPEC 10, BUI-F8): a control names its role with
 * `data-ui-sound` (`press`, `confirm`, `deploy`, `back`, `tab`, `toggle`,
 * `select`, `slider`, `vehicle`, or `none` to stay silent). Without one, the
 * sound comes only from locale-independent structure: ARIA role and state, the
 * input type, a close glyph (× ✕), and the element's own code names (a class or
 * `data-action` token such as `close`, `back`, `cancel`, `start`, `ready`). The
 * visible label is never read, so 关闭, 返回 and 出战 sound exactly like
 * Close, Back and Battle.
 */

export type InterfaceSound = 'click' | 'tab' | 'select' | 'toggle' | 'slider' | 'back' | 'confirm' | 'vehicle';

/** `data-ui-sound` roles (SPEC 10 names and the cue names) onto the shipped cues. Deploy is the confirm press: the
 *  breech-close `ui_deploy` already plays when the battle load starts. */
const ROLES: Readonly<Record<string, InterfaceSound>> = Object.freeze({
  click: 'click', press: 'click', tab: 'tab', select: 'select', toggle: 'toggle', slider: 'slider', back: 'back',
  confirm: 'confirm', deploy: 'confirm', vehicle: 'vehicle',
});

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
/** Code-name tokens (class and data-action words, never visible copy) that mark a back or a primary control. */
const BACK = new Set(['close', 'back', 'cancel', 'dismiss', 'exit', 'return', 'resume', 'scrim', 'leave']);
const PRIMARY = new Set(['deploy', 'start', 'ready', 'join', 'launch', 'prime', 'primary']);
const codeTokens = (el: ControlLike): string[] =>
  `${el.getAttribute('class') || ''} ${el.getAttribute('data-action') || ''}`.toLowerCase().split(/[^a-z0-9]+/);

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
  if (named && Object.hasOwn(ROLES, named)) return { sound: ROLES[named], inMenu };
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
  const text = (el.textContent || '').trim();
  const tokens = codeTokens(el);
  if (text === '×' || text === '✕' || tokens.some((token) => BACK.has(token))) return { sound: 'back', inMenu };
  if (tokens.some((token) => PRIMARY.has(token))) return { sound: 'confirm', inMenu };
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
