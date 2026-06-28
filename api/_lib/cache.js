// api/_lib/cache.js
// ─────────────────────────────────────────────────────────────────────────────
// Tiny in-memory TTL cache.
//
// Mirrors the original behavior: results are cached for 10 minutes keyed by the
// search parameters. This lives for the lifetime of the warm serverless
// instance only — it is a best-effort cache, not durable storage.
// ─────────────────────────────────────────────────────────────────────────────

const TTL_MS = 10 * 60 * 1000 // 10 minutes

const store = new Map()

// Build a stable cache key from ALL search parameters. Ingredients and pantry
// are sorted so order doesn't cause misses; quantities are serialized with
// sorted keys. Including every input prevents different searches from colliding
// on the same cached entry.
function buildKey({
  ingredients = [],
  pantry = [],
  quantities = {},
  mood = "",
  cuisine = "",
  diet = "",
  meal = ""
} = {}) {
  const ing = ingredients.slice().sort().join(",")
  const pan = pantry.slice().sort().join(",")
  const qty = Object.keys(quantities).sort().map(k => `${k}:${quantities[k]}`).join(",")
  return [ing, pan, qty, mood, cuisine, diet, meal].join("|")
}

function get(key) {
  return store.get(key)
}

// Store a value and schedule its eviction after the TTL.
function set(key, value) {
  store.set(key, value)
  setTimeout(() => store.delete(key), TTL_MS)
}

function has(key) {
  return store.has(key)
}

module.exports = { buildKey, get, set, has }
