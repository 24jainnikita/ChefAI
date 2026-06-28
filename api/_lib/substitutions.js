// api/_lib/substitutions.js
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight static substitution database.
//
// Covers the COMMON ingredient replacements (dairy swaps, veg/vegan swaps,
// pantry equivalents) so the reasoning engine (Gemini) is only consulted for
// uncommon or contextual substitutions it can't get from this table. This keeps
// the app useful offline and keeps LLM prompts small.
//
// Lookup is diet-aware: a "vegan" diet prefers the recipe's "vegan" list when
// present, otherwise falls back to the generic "any" list.
// ─────────────────────────────────────────────────────────────────────────────

const path = require("path")
const { namesMatch } = require("./matching")

let DB = {}
try {
  DB = require(path.join(__dirname, "..", "..", "data", "substitutions.json"))
} catch (err) {
  console.warn("Substitution DB failed to load:", err.message)
  DB = {}
}

// Find the DB entry whose key loosely matches the ingredient name.
function lookupEntry(ingredientName) {
  if (DB[ingredientName]) return DB[ingredientName] // fast exact path
  for (const key of Object.keys(DB)) {
    if (namesMatch(key, ingredientName)) return DB[key]
  }
  return null
}

// Substitutes for a single ingredient given the diet. Returns [] if none known.
function substitutesFor(ingredientName, diet = "any") {
  const entry = lookupEntry(ingredientName)
  if (!entry) return []
  if (diet === "vegan" && entry.vegan) return entry.vegan
  return entry.any || []
}

// Static substitutions for a whole recipe, as "ingredient -> alt1 / alt2"
// strings. Also returns the set of ingredient names that have NO static
// substitution, so the caller can ask the LLM only about those.
function recipeSubstitutions(recipe, diet = "any") {
  const known = []
  const uncovered = []
  for (const ing of recipe.ingredients || []) {
    const name = ing.name || ""
    const subs = substitutesFor(name, diet)
    if (subs.length) known.push(`${name} -> ${subs.join(" / ")}`)
    else uncovered.push(name)
  }
  return { known, uncovered }
}

module.exports = { substitutesFor, recipeSubstitutions }
