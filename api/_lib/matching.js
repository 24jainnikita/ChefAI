// api/_lib/matching.js
// ─────────────────────────────────────────────────────────────────────────────
// Shared ingredient-matching utilities.
//
// Extracted so the recommender, the recipe engine, and the Spoonacular service
// all compute "what does the user have / lack" identically. Pure JavaScript.
// ─────────────────────────────────────────────────────────────────────────────

const { PANTRY } = require("./config")

// Built-in pantry staples assumed to always be on hand.
const STAPLES = PANTRY.map(p => p.toLowerCase())

const norm = s => String(s || "").toLowerCase().trim()

// Loose name match: either string contains the other ("onion" ↔ "red onion").
function namesMatch(a, b) {
  a = norm(a); b = norm(b)
  return a === b || a.includes(b) || b.includes(a)
}

// Does any name in `set` loosely match `name`?
function setHas(set, name) {
  for (const item of set) if (namesMatch(item, name)) return true
  return false
}

// Build the set of ingredients the user effectively has. An ingredient with a
// declared quantity of 0 or less is treated as NOT available.
function buildOwnedSet(ingredients = [], quantities = {}) {
  const set = new Set()
  for (const raw of ingredients) {
    const q = quantities ? quantities[raw] : undefined
    if (q !== undefined && Number(q) <= 0) continue
    set.add(norm(raw))
  }
  return set
}

// Built-in staples merged with any user-supplied pantry items.
function buildPantrySet(pantry = []) {
  return new Set([...STAPLES, ...pantry.map(norm)])
}

// Split a recipe's ingredients into what the user has vs. genuinely lacks.
// Pantry staples count as "have" and are NOT reported as missing.
function computeMatch(recipe, ownedSet, pantrySet) {
  const matched = []
  const missing = []
  for (const ing of recipe.ingredients || []) {
    const name = ing.name || ""
    if (setHas(ownedSet, name)) matched.push(name)
    else if (!setHas(pantrySet, name)) missing.push(name)
    // else: pantry staple → considered available, not missing
  }
  return { matched, missing }
}

module.exports = {
  STAPLES,
  norm,
  namesMatch,
  setHas,
  buildOwnedSet,
  buildPantrySet,
  computeMatch
}
