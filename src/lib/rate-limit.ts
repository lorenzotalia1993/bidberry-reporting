/**
 * Simple in-memory rate limiter for serverless.
 * Each instance maintains its own window — not shared across cold starts,
 * but sufficient to block rapid brute-force within a single instance.
 */

interface Entry {
  count: number
  resetAt: number
}

const stores = new Map<string, Map<string, Entry>>()

export function rateLimit(opts: {
  /** Unique namespace (e.g. 'login', 'api') */
  name: string
  /** Max requests per window */
  max: number
  /** Window duration in seconds */
  windowSec: number
}) {
  let store = stores.get(opts.name)
  if (!store) {
    store = new Map()
    stores.set(opts.name, store)
  }

  return {
    /** Returns { ok: true } if allowed, { ok: false, retryAfter } if blocked */
    check(key: string): { ok: true } | { ok: false; retryAfter: number } {
      const now = Date.now()
      const entry = store!.get(key)

      // Cleanup expired entries periodically (every 100 checks)
      if (Math.random() < 0.01) {
        for (const [k, v] of store!) {
          if (now > v.resetAt) store!.delete(k)
        }
      }

      if (!entry || now > entry.resetAt) {
        store!.set(key, { count: 1, resetAt: now + opts.windowSec * 1000 })
        return { ok: true }
      }

      if (entry.count >= opts.max) {
        return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
      }

      entry.count++
      return { ok: true }
    },
  }
}
