// @ts-check

import { next } from '@vercel/functions';

const DEPLOYMENT_COOKIE = '__vdpl';

/** Build the official Vercel deployment pin without exposing the deployment
 * identifier to app code or giving preload and import URLs different names.
 *
 * Keep this deployment adapter as checked JavaScript until Vercel's Node
 * builder supports the repository's TypeScript 7 toolchain. Domain modules
 * continue to migrate to strict TypeScript independently of this boundary.
 *
 * @param {string | null} cookieHeader
 * @param {string | undefined} deploymentId
 * @returns {string | null}
 */
export function deploymentPinCookie(cookieHeader, deploymentId) {
  const id = String(deploymentId || '').trim();
  if (!id || new RegExp(`(?:^|;\\s*)${DEPLOYMENT_COOKIE}=`).test(cookieHeader || '')) {
    return null;
  }
  return `${DEPLOYMENT_COOKIE}=${encodeURIComponent(id)}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export const config = {
  // Only the long-lived playable documents need a session deployment pin.
  // Asset requests bypass middleware and inherit the cookie set on the HTML
  // response before the browser begins parsing modulepreload links.
  matcher: ['/', '/index.html', '/studio', '/studio/'],
};

/** @param {Request} request */
export default function middleware(request) {
  const cookie = deploymentPinCookie(
    request.headers.get('cookie'),
    process.env.VERCEL_DEPLOYMENT_ID,
  );
  return next(cookie ? { headers: { 'set-cookie': cookie } } : {});
}
