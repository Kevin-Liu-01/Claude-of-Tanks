// Puppeteer's automation defaults otherwise bypass normal Chrome background
// scheduling. Remove only these defaults; never emulate visibility or focus.
const BACKGROUND_OVERRIDES = Object.freeze([
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
]);

function isBackgroundOverride(argument) {
  return BACKGROUND_OVERRIDES.some(flag => argument === flag || argument.startsWith(`${flag}=`));
}

export function nativeBrowserLaunchOptions(options = {}) {
  const args = options.args ?? [];
  const ignored = options.ignoreDefaultArgs ?? [];
  if (!Array.isArray(args) || !args.every(arg => typeof arg === 'string') ||
      (ignored !== true && ignored !== false &&
        (!Array.isArray(ignored) || !ignored.every(arg => typeof arg === 'string')))) {
    throw new TypeError('native_browser_launch_options_invalid');
  }
  if (args.some(isBackgroundOverride)) throw new Error('native_browser_background_override');
  return { ...options, ignoreDefaultArgs: ignored === true ? true
    : [...new Set([...(ignored || []), ...BACKGROUND_OVERRIDES])] };
}

/** Inspect actual local child-process arguments, never just requested options.
 * Only counts leave this boundary; argv may contain private paths or URLs.
 * Absence of these three bypasses is not a claim that Chrome cannot throttle.
 */
export function verifyNativeBrowserLaunch(browser) {
  let args;
  try { args = browser?.process?.()?.spawnargs; }
  catch { throw new Error('native_browser_launch_unverifiable'); }
  if (!Array.isArray(args) || args.length < 1 || args.length > 512 ||
      !args.every(arg => typeof arg === 'string') || !args[0]) {
    throw new Error('native_browser_launch_unverifiable');
  }
  const backgroundOverridesPresent = args.filter(isBackgroundOverride).length;
  if (backgroundOverridesPresent) throw new Error('native_browser_background_override');
  return { verified: true, argumentCount: args.length,
    checkedBackgroundFlags: BACKGROUND_OVERRIDES.length, backgroundOverridesPresent };
}
