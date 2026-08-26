/** True only for an explicit production QA URL. */
export function debugModeRequested(
  search = (typeof location !== 'undefined' ? location.search : ''),
): boolean {
  const query = new URLSearchParams(search || '');
  if (!query.has('debug')) return false;
  const value = String(query.get('debug') ?? '').toLowerCase();
  return value !== '0' && value !== 'false' && value !== 'off';
}
