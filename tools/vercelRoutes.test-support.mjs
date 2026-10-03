// Resolve a request through vercel.json the way the deployed router walks it (INFRA-P5/P6/P20, 2026-10-01).
//
// The routes come from @vercel/routing-utils' getTransformedRoutes — the conversion `vercel build` runs. For
// 24c5c5b03's vercel.json its 41 routes appear verbatim in deploy 163's `.vercel/output/config.json`. A small
// evaluator then walks them in Vercel's order: redirect and header routes, the filesystem, then the rewrites.
// The model leaves out what vercel.json does not own: the Routing Middleware (it runs after the redirect and header
// routes, before the filesystem, and is identical on both sides of any vercel.json comparison) and the function
// builders' own `/api` routes.
import { getTransformedRoutes } from '@vercel/routing-utils';

/** The routes `vercel build` derives from a vercel.json object. */
export function vercelJsonRoutes(config) {
  const { routes, error } = getTransformedRoutes({
    cleanUrls: config.cleanUrls,
    trailingSlash: config.trailingSlash,
    redirects: config.redirects,
    headers: config.headers,
    rewrites: config.rewrites,
  });
  if (error) throw new Error(`vercel.json does not convert: ${JSON.stringify(error)}`);
  return routes;
}

/** A `has`/`missing` host value: a regex string (anchored, as Next.js and Vercel evaluate it) or a condition object. */
function hostValueMatches(value, host) {
  if (value === undefined) return true;
  if (typeof value === 'string') return new RegExp(`^(?:${value})$`).test(host);
  const checks = [];
  if ('eq' in value) checks.push(host === String(value.eq));
  if ('neq' in value) checks.push(host !== value.neq);
  if ('inc' in value) checks.push(value.inc.includes(host));
  if ('ninc' in value) checks.push(!value.ninc.includes(host));
  if ('pre' in value) checks.push(host.startsWith(value.pre));
  if ('suf' in value) checks.push(host.endsWith(value.suf));
  if ('re' in value) checks.push(new RegExp(value.re).test(host));
  if (checks.length === 0) throw new Error(`unsupported host condition ${JSON.stringify(value)}`);
  return checks.every(Boolean);
}

function conditionsMatch(route, request) {
  for (const item of route.has || []) {
    if (item.type !== 'host') throw new Error(`the evaluator models host conditions only, not ${item.type}`);
    if (!hostValueMatches(item.value, request.host)) return false;
  }
  for (const item of route.missing || []) {
    if (item.type !== 'host') throw new Error(`the evaluator models host conditions only, not ${item.type}`);
    if (hostValueMatches(item.value, request.host)) return false;
  }
  return true;
}

/** `$1` / `$name` substitution from the route's match, as the router fills Location and dest. */
function substitute(template, match) {
  return template.replace(/\$(\d+|[A-Za-z_][A-Za-z0-9_]*)/g, (_, key) => {
    const value = /^\d+$/.test(key) ? match[Number(key)] : match.groups?.[key];
    return value ?? '';
  });
}

/** Vercel passes the request's query string on to a redirect's destination. */
function withQuery(location, query) {
  const search = String(query || '').replace(/^\?/, '');
  if (!search) return location;
  return `${location}${location.includes('?') ? '&' : '?'}${search}`;
}

function fileFor(path, files) {
  if (files.has(path)) return path;
  if (path.endsWith('/') && files.has(`${path}index.html`)) return `${path}index.html`;
  return null;
}

/**
 * The outcome of one request: `{ status, location }` for a redirect, `{ status: 200, file }` for a served file,
 * `{ status: 404 }` otherwise; `headers` collects every header route that matched (names lower-cased).
 */
export function resolveVercelRequest(routes, { host = 'cot.kevinliu.studio', path, query = '' }, files) {
  const request = { host: String(host).toLowerCase(), path };
  const headers = {};
  let afterFilesystem = false;
  for (const route of routes) {
    if (route.handle) {
      if (route.handle === 'filesystem') {
        const file = fileFor(path, files);
        if (file) return { status: 200, file, headers };
        afterFilesystem = true;
      }
      continue;
    }
    const match = new RegExp(route.src).exec(path);
    if (!match || !conditionsMatch(route, request)) continue;
    const location = route.headers?.Location ?? route.headers?.location;
    if (route.status && location !== undefined) {
      return { status: route.status, location: withQuery(substitute(location, match), query), headers };
    }
    if (route.headers && route.continue) {
      for (const [name, value] of Object.entries(route.headers)) headers[name.toLowerCase()] = substitute(value, match);
      continue;
    }
    if (route.dest !== undefined) {
      const destination = substitute(route.dest, match).split('?')[0];
      if (!afterFilesystem) throw new Error(`a rewrite ahead of the filesystem is outside the model: ${route.src}`);
      const file = fileFor(destination, files);
      return file ? { status: 200, file, headers } : { status: 404, headers };
    }
  }
  const file = afterFilesystem ? null : fileFor(path, files);
  return file ? { status: 200, file, headers } : { status: 404, headers };
}
