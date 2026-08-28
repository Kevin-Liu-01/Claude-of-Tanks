import { uiIconSVG, type UiIconId } from '../ui/uiIcons.ts';

type DocsIconTone = 'steel' | 'amber' | 'cyan' | 'green' | 'red' | 'violet';

interface DocsIconSpec {
  readonly id: UiIconId;
  readonly tone: DocsIconTone;
}

/** One typed visual vocabulary for the field-manual landing page. */
export const DOCS_ICON_SPECS = Object.freeze({
  manual: { id: 'battleRecord', tone: 'amber' },
  github: { id: 'github', tone: 'steel' },
  fleet: { id: 'gallery', tone: 'amber' },
  battlefields: { id: 'map', tone: 'green' },
  simulation: { id: 'clock', tone: 'cyan' },
  refresh: { id: 'performance', tone: 'green' },
  overview: { id: 'battleRecord', tone: 'amber' },
  rendering: { id: 'graphics', tone: 'cyan' },
  vehicles: { id: 'track', tone: 'amber' },
  combat: { id: 'fireGun', tone: 'red' },
  worlds: { id: 'map', tone: 'green' },
  interface: { id: 'controller', tone: 'cyan' },
  multiplayer: { id: 'radio', tone: 'cyan' },
  performance: { id: 'performance', tone: 'green' },
  mobile: { id: 'autoAim', tone: 'cyan' },
  studio: { id: 'pixels', tone: 'violet' },
  gallery: { id: 'scope', tone: 'amber' },
  verification: { id: 'check', tone: 'green' },
  authority: { id: 'shield', tone: 'green' },
  measured: { id: 'graphics', tone: 'cyan' },
  assets: { id: 'check', tone: 'amber' },
  specification: { id: 'battleRecord', tone: 'cyan' },
  rig: { id: 'track', tone: 'amber' },
  anatomy: { id: 'crew', tone: 'red' },
  release: { id: 'check', tone: 'green' },
  runtimeData: { id: 'telemetry', tone: 'cyan' },
  coordinates: { id: 'globe', tone: 'amber' },
} as const satisfies Readonly<Record<string, DocsIconSpec>>);

export type DocsIconKey = keyof typeof DOCS_ICON_SPECS;

export function docsIconKeys(): DocsIconKey[] {
  return Object.keys(DOCS_ICON_SPECS) as DocsIconKey[];
}

/** Fill decorative placeholders without changing their accessible text. */
export function mountDocsIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-doc-icon]').forEach((element) => {
    const key = element.dataset.docIcon as DocsIconKey | undefined;
    if (!key) return;
    const spec = DOCS_ICON_SPECS[key];
    if (!spec) return;
    element.classList.add('doc-icon', `tone-${spec.tone}`);
    element.setAttribute('aria-hidden', 'true');
    element.innerHTML = uiIconSVG(spec.id, 24);
  });
}
