// api/_lib/recipeByName.js
// ─────────────────────────────────────────────────────────────────────────────
// Direct recipe lookup by dish name.
//
// Priority chain (Local → Spoonacular → Gemini) so Gemini is never called
// unless both local sources return nothing. Reuses all existing modules.
// ─────────────────────────────────────────────────────────────────────────────

const path = require("path")
const { normalizeName } = require("./normalize")
const { fetchFromSpoonacular } = require("./spoonacular")
const { recipeSubstitutions } = require("./substitutions")
const geminiRecipe = require("./providers/geminiRecipe")

// Load local DB once (same JSON the recommender uses — no duplication).
let LOCAL_RECIPES = []
try {
  LOCAL_RECIPES = require(path.join(__dirname, "..", "..", "data", "indian-recipes.json"))
} catch (e) {
  console.warn("recipeByName: local DB not loaded", e.message)
}

// Normalise + strip common request noise so "paneer butter masala" matches the
// DB entry "Paneer Butter Masala" regardless of how the user phrased it.
function cleanTitle(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\b(recipe( for)?|how (do i|to) (make|cook|prepare)|give me (the )?|teach me( to cook)?|i want (the )?)\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// Loose match: true when the haystack contains every word from the needle or
// when either fully includes the other (handles partial names like "fried rice"
// matching "Egg Fried Rice").
function titleMatches(recipeTitle, needle) {
  const a = cleanTitle(recipeTitle)
  const b = needle  // already cleaned by the caller
  if (a === b || a.includes(b) || b.includes(a)) return true
  const words = b.split(" ").filter(Boolean)
  return words.length > 1 && words.every(w => a.includes(w))
}

// Assign a score (lower = better) so the closest title wins.
function matchScore(recipeTitle, needle) {
  const a = cleanTitle(recipeTitle)
  if (a === needle) return 0
  if (a.includes(needle) || needle.includes(a)) return 1
  return 2
}

// ── STEP 1 — local DB ──────────────────────────────────────────────────────
function searchLocal(needle) {
  const hits = LOCAL_RECIPES
    .map((r, i) => ({ r, i, s: titleMatches(r.title, needle) ? matchScore(r.title, needle) : null }))
    .filter(x => x.s !== null)
    .sort((a, b) => a.s - b.s)
  if (!hits.length) return null

  const { r, i } = hits[0]
  // Build the same internal shape that localDb.normalize() produces.
  const slug = r.title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  return {
    id:             -(i + 1),
    title:          r.title,
    readyInMinutes: r.preparationTime || null,
    servings:       r.servings || 2,
    diet:           r.diet || "vegetarian",
    image:          r.image || `/images/recipes/${slug}.jpg`,
    emoji:          r.emoji || "🍽️",
    description:    r.description || "",
    mealType:       r.mealType || [],
    moods:          r.moods || [],
    ingredients:    r.ingredients || [],
    steps:          r.instructions || [],
    nutrition:      r.nutrition || null,
    source:         "local",
    matchedIngredients: [],
    missingIngredients:  (r.ingredients || []).map(x => x.name)
  }
}

// ── STEP 2 — Spoonacular title search ─────────────────────────────────────
// Reuses the existing normalised Spoonacular result shape.
async function searchSpoonacular(dishName, spoonacularKey) {
  if (!spoonacularKey) return null
  try {
    const params = new URLSearchParams({
      apiKey: spoonacularKey,
      query:  dishName,
      number: "3",
      addRecipeInformation:  "true",
      addRecipeNutrition:    "true",
      addRecipeInstructions: "true"
    })
    const res = await fetch(`https://api.spoonacular.com/recipes/complexSearch?${params}`)
    if (!res.ok) return null
    const data = await res.json()
    if (!data.results?.length) return null
    const r = data.results[0]

    // Re-use the extraction helpers from spoonacular.js via a lightweight inline
    // normalisation so we don't duplicate the module (spoonacular.js is required
    // separately — here we just shape the result consistently).
    const { fetchFromSpoonacular: _unused, ..._ } = require("./spoonacular")
    // Actually call fetchFromSpoonacular with the dish title as the ingredient
    // so we get the full normalized shape for free.
    const results = await fetchFromSpoonacular({
      ingredients: [dishName],
      mood: "", cuisine: "", diet: "any", meal: "any",
      apiKey: spoonacularKey
    })
    // Take the first result that actually mentions the dish name.
    const clean = dishName.toLowerCase()
    const match = results.find(r2 => cleanTitle(r2.title).includes(clean) || clean.includes(cleanTitle(r2.title))) || results[0]
    return match || null
  } catch (err) {
    console.warn("recipeByName Spoonacular:", err.message)
    return null
  }
}

// ── STEP 3 — Gemini generation (last resort) ──────────────────────────────
async function generateWithGemini(dishName, keys) {
  if (!geminiRecipe.isAvailable(keys)) return null
  try {
    const recipe = await geminiRecipe.generate({
      ingredients: [dishName],
      pantry: ["salt", "oil", "water"],
      quantities: {},
      mood: "", cuisine: "any", diet: "any", meal: "any", maxTime: null
    }, keys)
    recipe.id = Date.now()
    return recipe
  } catch (err) {
    console.warn("recipeByName Gemini:", err.message)
    return null
  }
}

// ── Public ─────────────────────────────────────────────────────────────────
// Returns the best recipe found (internal shape) or null.
async function findByName(rawQuery, keys = {}) {
  const needle = cleanTitle(rawQuery)
  if (!needle) return null

  // 1 — local (zero cost, instant)
  const local = searchLocal(needle)
  if (local) return local

  // 2 — Spoonacular (one API call)
  const spoon = await searchSpoonacular(needle, keys.spoonacularKey)
  if (spoon) {
    // Enrich with substitutions like the recommendation engine does.
    const { known, uncovered } = recipeSubstitutions(spoon, "any")
    spoon.substitutions    = known
    spoon.substitutionGaps = uncovered
    return spoon
  }

  // 3 — Gemini (last resort)
  const ai = await generateWithGemini(needle, keys)
  if (ai) {
    const { known, uncovered } = recipeSubstitutions(ai, "any")
    ai.substitutions    = known
    ai.substitutionGaps = uncovered
  }
  return ai
}

module.exports = { findByName, cleanTitle }
