/** Inject a stylesheet once and return the canonical style element. */
export function ensureStyle(id: string, css: string): HTMLStyleElement {
  const existing = document.getElementById(id);
  if (existing?.tagName === 'STYLE') return existing as HTMLStyleElement;

  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
  return style;
}

/** Create an element, optionally assign its class and append it to a parent. */
export function createElement<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className = '',
  parent: ParentNode | null = null,
): HTMLElementTagNameMap[Tag] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (parent) parent.appendChild(element);
  return element;
}
