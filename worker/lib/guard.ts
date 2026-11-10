// Write guard for the public read-only demo.
// A browser is "admin" when its tw_admin cookie matches the ADMIN_KEY secret.
// No ADMIN_KEY configured means nobody is admin (fail closed).

export const ADMIN_COOKIE = "tw_admin";
export const READ_ONLY = "This is a read-only demo. Changes are turned off for visitors.";

export function readCookie(header: string | null | undefined, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(eq + 1).trim()); } catch { return null; }
  }
  return null;
}

/** Constant-time string comparison; false when either side is empty. */
export function sameSecret(given: string | null | undefined, secret: string | null | undefined): boolean {
  if (!given || !secret) return false;
  const a = new TextEncoder().encode(given), b = new TextEncoder().encode(secret);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i % (a.length || 1)] ?? 0) ^ b[i];
  return diff === 0;
}

export const isAdmin = (secret: string | undefined, cookieHeader: string | null | undefined) =>
  sameSecret(readCookie(cookieHeader, ADMIN_COOKIE), secret);

/** Reads never need the key; the unlock form is how a browser gets it. */
export const needsAdmin = (method: string, path: string) =>
  !(method === "GET" || method === "HEAD" || path === "/api/unlock");
