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
