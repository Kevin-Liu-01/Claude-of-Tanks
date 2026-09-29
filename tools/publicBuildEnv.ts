/** Vercel may redact sensitive values during a local pull. VITE_* values are
 * browser-visible; a redaction marker is never a usable runtime value. */
export function assertPublicBuildEnv(env: Readonly<Record<string, unknown>>): void {
  const redacted = Object.entries(env)
    .filter(([key, value]) => key.startsWith('VITE_') && value === '[SENSITIVE]')
    .map(([key]) => key);
  if (redacted.length) {
    throw new Error(`Public build configuration is redacted: ${redacted.join(', ')}. Supply verified public values or use a hosted build. Do not publish this artifact.`);
  }
}
