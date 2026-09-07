import { next } from '@vercel/functions';
import { injectSiteMetadata, privateRoomMetadata, STUDIO_METADATA } from './src/presentation/siteMetadata.ts';

const DEPLOYMENT_COOKIE = '__vdpl';
const DEPLOYMENT_RESET_PARAM = '_dplreset';
const METADATA_SHELL_PARAM = '_cot_meta_shell';

/** Expire the host-only deployment pin before a clean-document retry. */
export function deploymentResetCookie() {
  return `${DEPLOYMENT_COOKIE}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict`;
}

/**
 * Return the same playable URL without the one-shot reset signal. The existing
 * `_bootretry` receipt deliberately remains in the URL so recovery stays
 * bounded even when sessionStorage is unavailable.
 *
 * @param {string} requestUrl
 * @returns {string | null}
 */
export function deploymentResetLocation(requestUrl: string): string | null {
  const url = new URL(requestUrl);
  if (!url.searchParams.has(DEPLOYMENT_RESET_PARAM)) return null;
  url.searchParams.delete(DEPLOYMENT_RESET_PARAM);
  return url.href;
}

/** Build the official Vercel deployment pin without exposing the deployment
 * identifier to app code or giving preload and import URLs different names.
 *
 * Keep this deployment adapter dependency-light: Vercel discovers the root
 * TypeScript middleware directly, while application code remains outside the
 * edge request path.
 *
 * @param {string | null} cookieHeader
 * @param {string | undefined} deploymentId
 * @returns {string | null}
 */
export function deploymentPinCookie(
  cookieHeader: string | null,
  deploymentId: string | undefined,
): string | null {
  const id = String(deploymentId || '').trim();
  if (!id || new RegExp(`(?:^|;\\s*)${DEPLOYMENT_COOKIE}=`).test(cookieHeader || '')) {
    return null;
  }
  return `${DEPLOYMENT_COOKIE}=${encodeURIComponent(id)}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export const config = {
  // Long-lived playable documents and Gallery share the site-wide deployment
  // cookie. Gallery must participate too: otherwise a stale game pin can make
  // its HTML request chunk hashes from a different deployment.
  // Asset requests bypass middleware and inherit the cookie set on the HTML
  // response before the browser begins parsing modulepreload links.
  matcher: ['/', '/index.html', '/studio', '/studio/', '/gallery', '/gallery/', '/gallery.html'],
};

/** @param {Request} request */
export default async function middleware(request: Request): Promise<Response> {
  const resetLocation = deploymentResetLocation(request.url);
  if (resetLocation) {
    // A stale __vdpl routes this request to the old deployment first. Expire
    // it there, then redirect once so Vercel resolves the newest document and
    // that deployment can establish its own pin before modules are parsed.
    return new Response(null, {
      status: 307,
      headers: {
        'cache-control': 'private, no-store',
        location: resetLocation,
        'set-cookie': deploymentResetCookie(),
      },
    });
  }
  const cookie = deploymentPinCookie(
    request.headers.get('cookie'),
    process.env.VERCEL_DEPLOYMENT_ID,
  );

  const requestUrl = new URL(request.url);
  if (!requestUrl.searchParams.has(METADATA_SHELL_PARAM)) {
    const isPlayableDocument = requestUrl.pathname === '/' || requestUrl.pathname === '/index.html';
    const roomMetadata = isPlayableDocument ? privateRoomMetadata(requestUrl) : null;
    const metadata = roomMetadata || (requestUrl.pathname === '/studio' || requestUrl.pathname === '/studio/'
      ? STUDIO_METADATA
      : null);
    if (metadata) {
      const shellUrl = new URL('/index.html', requestUrl.origin);
      shellUrl.searchParams.set(METADATA_SHELL_PARAM, '1');
      const shellResponse = await fetch(shellUrl, {
        headers: {
          accept: 'text/html',
          cookie: request.headers.get('cookie') || '',
          'user-agent': request.headers.get('user-agent') || 'Claude-of-Tanks metadata shell',
        },
      });
      if (shellResponse.ok) {
        const headers = new Headers(shellResponse.headers);
        headers.delete('content-encoding');
        headers.delete('content-length');
        headers.delete('etag');
        headers.delete('last-modified');
        headers.set('content-type', 'text/html; charset=utf-8');
        headers.set('cache-control', roomMetadata ? 'private, no-store' : 'public, max-age=0, must-revalidate');
        if (roomMetadata) headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
        if (cookie && !headers.get('set-cookie')?.includes(`${DEPLOYMENT_COOKIE}=`)) {
          headers.append('set-cookie', cookie);
        }
        return new Response(injectSiteMetadata(await shellResponse.text(), metadata), {
          status: shellResponse.status,
          headers,
        });
      }
    }
  }
  return next(cookie ? { headers: { 'set-cookie': cookie } } : {});
}
