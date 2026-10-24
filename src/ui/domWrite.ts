// Change-only DOM writes for the battle HUD's per-frame code (brand-ui 249, the owner's 10-24 performance push).
// Copyright © 2026 Kevin B. Liu.
//
// Each writer compares before it writes: setting textContent to the same string still replaces the text node, and
// setting an attribute (hidden, aria-*, data-*) to its own value still invalidates style. Over a frame those dirty the
// document, and the reticle canvas's next font change then pays for a full style recalc (the 249 trace: aerialHud's
// <html data-flight> written every frame). The reads are cheap: none of them forces style or layout.

/** Set a node's text when it differs. */
export function setText(node: Node, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** Show or hide an element when its state differs. */
export function setHidden(element: HTMLElement, hidden: boolean): void {
  if (element.hidden !== hidden) element.hidden = hidden;
}

/** Set an attribute when its value differs. */
export function setAttr(element: Element, name: string, value: string): void {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

/** Set a data-* value when it differs. */
export function setData(element: HTMLElement, key: string, value: string): void {
  if (element.dataset[key] !== value) element.dataset[key] = value;
}

/** Set an inline style property (a custom property or a plain one) when its value differs. */
export function setStyle(element: HTMLElement, name: string, value: string): void {
  if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
}

/** Enable or disable a control when its state differs. */
export function setDisabled(element: HTMLButtonElement | HTMLInputElement, disabled: boolean): void {
  if (element.disabled !== disabled) element.disabled = disabled;
}
