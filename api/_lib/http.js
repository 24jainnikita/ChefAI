// api/_lib/http.js
// ─────────────────────────────────────────────────────────────────────────────
// Shared HTTP helper.
//
// fetchWithRetry wraps the global fetch with:
//   • an 8s abort timeout so a slow provider can't hang the serverless function
//   • a single retry with a 3s backoff specifically on HTTP 429 (rate limited)
//
// It is used by the Gemini service. It never throws: on network failure it
// resolves to a fake response object so callers can branch on `res.ok` /
// `res.status` without try/catch noise.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 25000
const RETRY_BACKOFF_MS = 1000

async function fetchWithRetry(url, options, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
      const res = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timeout)

      // Anything that isn't a rate-limit is returned immediately.
      if (res.status !== 429) return res

      // Rate limited: wait then retry (unless we're out of attempts).
      if (i < retries) await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS))
    } catch (err) {
      // Network error / abort — bail with a synthetic 500-ish response.
      if (i === retries) return { ok: false, status: 500, json: async () => ({}) }
    }
  }
  // Exhausted retries while rate limited.
  return { ok: false, status: 429, json: async () => ({}) }
}

module.exports = { fetchWithRetry }
