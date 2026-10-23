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

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for an HTML template string: player names and host event fields are peer-chosen, never markup. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]!);
}
