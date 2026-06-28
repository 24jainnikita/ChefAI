// api/_lib/normalize.js
// ─────────────────────────────────────────────────────────────────────────────
// Centralized ingredient normalization layer.
//
// Maps the many ways people write an ingredient (bell pepper / green pepper /
// shimla mirch → capsicum; mayo → mayonnaise; dahi / yogurt → curd; cilantro →
// coriander; scallion → spring onion; …) to ONE canonical name.
//
// Both the user's typed/scanned/spoken ingredients AND the recipe ingredient
// names are passed through here, so all matching inside the Recommendation
// Engine compares canonical names — no duplicate representations, better
// matches. This module is pure data + string handling; it does not change the
// scoring algorithm.
// ─────────────────────────────────────────────────────────────────────────────

const path = require("path")

let ALIASES = {}
try {
  ALIASES = require(path.join(__dirname, "..", "..", "data", "ingredient-aliases.json"))
} catch (err) {
  console.warn("Ingredient aliases failed to load:", err.message)
  ALIASES = {}
}

// Lowercase, trim, collapse inner whitespace, strip trailing punctuation.
function clean(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/, "")
}

// Map a single name to its canonical form. Falls back to a light singular
// check, then returns the cleaned name unchanged if no alias is known.
function normalizeName(name) {
  const c = clean(name)
  if (!c) return ""
  if (ALIASES[c]) return ALIASES[c]
  if (c.endsWith("es") && ALIASES[c.slice(0, -2)]) return ALIASES[c.slice(0, -2)]
  if (c.endsWith("s") && ALIASES[c.slice(0, -1)]) return ALIASES[c.slice(0, -1)]
  return c
}

// Normalize a list of names and de-duplicate the canonical results.
function normalizeList(list) {
  const out = []
  const seen = new Set()
  ;(list || []).forEach(n => {
    const v = normalizeName(n)
    if (v && !seen.has(v)) { seen.add(v); out.push(v) }
  })
  return out
}

// Normalize the keys of a { name: quantity } map.
function normalizeQuantities(quantities) {
  const out = {}
  for (const k in (quantities || {})) {
    const v = normalizeName(k)
    if (v) out[v] = quantities[k]
  }
  return out
}

module.exports = { normalizeName, normalizeList, normalizeQuantities }
