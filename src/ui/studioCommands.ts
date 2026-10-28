/**
 * studioCommands.ts — the Studio's command palette (brand-ui SPEC 6 "Search + command palette" and 12.6's header
 * Commands). Copyright © 2026 Kevin B. Liu.
 *
 * Ctrl/Cmd+K or the header chip opens one search over every action the Studio offers (studioPanel.ts builds the list
 * from its own controls, so a command does exactly what its button does). Typing filters; the arrows move, Enter runs,
 * Esc closes and never reaches the Studio's own Esc; focus returns to where it was.
 */
import { t } from './i18n.ts';
import { closeSurface, openSurface, type TransientSurface } from './components/surfaceStack.ts';

export interface StudioCommand {
  readonly id: string;
  readonly label: string;
  /** Extra words it answers to (the English ids, so a Chinese page still finds "export"). */
  readonly keywords?: string;
  /** Its shortcut, shown at the row's end. */
  readonly hint?: string;
  /** Listed only once the query names it (the fleet's tanks, the battlefields). */
  readonly searchOnly?: boolean;
  run(): void;
}

interface StudioCommandPalette {
  readonly root: HTMLDivElement;
  open(): void;
  close(): void;
}

/** At most this many rows at once (the fleet alone has hundreds). */
const MAX_ROWS = 40;

const fold = (text: string): string => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Lower is better; null when a query word is missing. The label's start beats a word's start beats anywhere. */
function rank(command: StudioCommand, words: readonly string[], query: string): number | null {
  const label = fold(command.label);
  const all = `${label} ${fold(command.keywords ?? '')}`;
  if (!words.every((word) => all.includes(word))) return null;
  if (label.startsWith(query)) return 0;
  if (label.includes(` ${words[0]}`) || label.includes(`·${words[0]}`)) return 1;
  return label.includes(words[0]) ? 2 : 3;
}

export function createCommandPalette(commands: () => readonly StudioCommand[]): StudioCommandPalette {
  const root = document.createElement('div');
  root.className = 'st-cmd';
  root.hidden = true;
  const box = document.createElement('div');
  box.className = 'st-cmd-box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', t('studio.ws.commands'));
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'st-cmd-input';
  input.placeholder = t('studio.ws.commandsPlaceholder');
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-controls', 'st-cmd-list');
  const list = document.createElement('div');
  list.id = 'st-cmd-list';
  list.className = 'st-cmd-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', t('studio.ws.commands'));
  const empty = document.createElement('p');
  empty.className = 'st-cmd-empty';
  empty.textContent = t('studio.ws.commandsNone');
  box.append(input, list, empty);
  root.appendChild(box);

  let all: readonly StudioCommand[] = [];
  let shown: StudioCommand[] = [];
  let current = 0;
  let returnFocus: HTMLElement | null = null;

  function render(): void {
    const query = fold(input.value.trim());
    const words = query.split(/\s+/).filter(Boolean);
    if (!words.length) shown = all.filter((command) => !command.searchOnly).slice(0, MAX_ROWS);
    else {
      shown = all
        .map((command, order) => ({ command, order, score: (command.searchOnly && query.length < 2) ? null : rank(command, words, query) }))
        .filter((entry): entry is { command: StudioCommand; order: number; score: number } => entry.score != null)
        .sort((a, b) => a.score - b.score || a.order - b.order)
        .slice(0, MAX_ROWS)
        .map((entry) => entry.command);
    }
    current = Math.min(current, Math.max(0, shown.length - 1));
    list.replaceChildren(...shown.map((command, index) => {
      const row = document.createElement('div');
      row.className = 'st-cmd-row';
      row.id = `st-cmd-${index}`;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(index === current));
      const label = document.createElement('span');
      label.textContent = command.label;
      row.appendChild(label);
      if (command.hint) {
        // the kit's key cap (components.ts keycap: cot-c-kbd, hidden from assistive technology), built as nodes: a Studio
        // sink writes no markup from data (studioSceneShare.selftest §10); no command hint is an arrow
        const cap = document.createElement('kbd');
        cap.className = 'cot-c-kbd';
        cap.setAttribute('aria-hidden', 'true');
        cap.textContent = command.hint;
        row.appendChild(cap);
      }
      // a press runs the row without stealing focus from the field first
      row.addEventListener('pointerdown', (event) => event.preventDefault());
      row.addEventListener('click', () => run(command));
      return row;
    }));
    empty.hidden = shown.length > 0;
    input.setAttribute('aria-activedescendant', shown.length ? `st-cmd-${current}` : '');
  }
  function move(step: number): void {
    if (!shown.length) return;
    current = (current + step + shown.length) % shown.length;
    for (const [index, row] of [...list.children].entries()) row.setAttribute('aria-selected', String(index === current));
    list.children[current]?.scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', `st-cmd-${current}`);
  }
  function run(command: StudioCommand): void {
    close();
    command.run();
  }
  // a modal transient surface (components/surfaceStack.ts): opening it closes the Studio's open popover, Escape is the
  // stack's, and a press on its own scrim closes it
  const surface: TransientSurface = { id: 'studio-commands', element: () => box, close: () => close(), modal: true };
  function open(): void {
    if (!root.hidden) { input.select(); return; }
    all = commands();
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openSurface(surface, returnFocus);
    input.value = '';
    current = 0;
    root.hidden = false;
    render();
    input.focus();
  }
  function close(): void {
    if (root.hidden) return;
    closeSurface(surface);
    root.hidden = true;
    returnFocus?.focus?.({ preventScroll: true });
    returnFocus = null;
  }

  input.addEventListener('input', () => { current = 0; render(); });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
    else if (event.key === 'Enter') { event.preventDefault(); const command = shown[current]; if (command) run(command); }
    else if (event.key === 'Tab') event.preventDefault(); // the field is the dialog's one stop
  });
  // a press outside the box closes it
  root.addEventListener('pointerdown', (event) => { if (event.target === root) close(); });
  return { root, open, close };
}
