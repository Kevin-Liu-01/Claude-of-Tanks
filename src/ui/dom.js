/** Inject a stylesheet once and return the canonical style element. */
export function ensureStyle(id, css) {
  let style = document.getElementById(id);
  if (style) return style;
  style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
  return style;
}

/** Create an element, optionally assign its class and append it to a parent. */
export function createElement(tag, className = '', parent = null) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (parent) parent.appendChild(element);
  return element;
}
