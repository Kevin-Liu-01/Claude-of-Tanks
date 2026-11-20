/**
 * couch-perf-275: the split screen's cost levers as runtime switches, so the harness measures each one off and on inside
 * one page (tools/couch-panes.browser.mjs --ab; docs/COUCH-MODE.md "The frame-rate rule, as measured"). Every switch is
 * off by default, so the split screen draws as before. A lever that wins becomes the code and its switch goes; one that
 * does not goes whole.
 */
export const couchPaneLevers = {
  /** Lever 3: a pane-only coarse world tier, the dressing no player reads (couchPaneViews.ts PANE_COARSE_NAMES). */
  coarseWorld: false,
  /**
   * Lever 1's ceiling, measurement only (the image is wrong): the panes after the first skip every pass from the grade on
   * (post.ts renderViewFrames), the most that running the per-pixel passes once over the whole canvas could save.
   */
  postCeiling: false,
};

export type CouchPaneLever = keyof typeof couchPaneLevers;

/** Set a lever (the harness's switch); false for a name that is not a lever. */
export function setCouchPaneLever(name: string, on: boolean): boolean {
  if (!Object.hasOwn(couchPaneLevers, name)) return false;
  couchPaneLevers[name as CouchPaneLever] = !!on;
  return true;
}
