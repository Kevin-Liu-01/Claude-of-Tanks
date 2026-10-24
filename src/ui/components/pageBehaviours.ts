// The behaviours every page of the product shares, installed once per document by its shell (the public pages'
// publicNav.ts, the game's settings panel): the kit's hover tip. Copyright © 2026 Kevin B. Liu.
import { installHoverTips } from './hoverTip.ts';

export function installPageBehaviours(doc: Document = document): void {
  installHoverTips(doc);
}
