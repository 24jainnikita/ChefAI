// api/generate.js
// ─────────────────────────────────────────────────────────────────────────────
// HTTP endpoint for AI-generated custom recipes — the FINAL fallback layer.
//
// Called ONLY when the user explicitly clicks "Generate Custom Recipe" after
// weak recommendations. It never runs automatically and never replaces the
// Recommendation Engine or /api/recipes.
//
//   • Generates exactly ONE recipe from the user's own ingredients/preferences.
//   • Computes matched/missing ingredients (for transparency) using the shared
//     matcher — no recommendation score is recalculated.
//   • Caches results 20 min keyed by the full search inputs to avoid repeat
//     Gemini calls for identical requests.
//   • On 429 / error / no key, returns a clean error so the UI can show a
//     friendly message while the recommended recipes stay on screen.
// ─────────────────────────────────────────────────────────────────────────────

const recipeProvider = require("./_lib/providers/geminiRecipe")
const { normalizeList, normalizeQuantities } = require("./_lib/normalize")
const { buildOwnedSet, buildPantrySet, computeMatch } = require("./_lib/matching")
const { formatError } = require("./_lib/formatter")

// Dedicated AI cache (separate from the recommendation cache).
const TTL_MS = 20 * 60 * 1000
const store = new Map()

function cacheKey(p) {
  const ing = p.ingredients.slice().sort().join(",")
  const pan = p.pantry.slice().sort().join(",")
  const qty = Object.keys(p.quantities).sort().map(k => `${k}:${p.quantities[k]}`).join(",")
  return [ing, pan, qty, p.mood, p.cuisine, p.diet, p.meal].join("|")
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  if (req.method === "OPTIONS") return res.status(200).end()
  if (req.method !== "POST")    return res.status(405).json(formatError("Method not allowed"))

  const keys = {
    geminiKey:       process.env.GEMINI_KEY  || "",
    geminiBackupKey: process.env.GEMINI_KEY2 || ""
  }
  if (!recipeProvider.isAvailable(keys)) {
    return res.status(503).json(formatError("Custom recipe generation is unavailable right now"))
  }

  const body = req.body || {}
  const ingredients = normalizeList(body.ingredients || [])
  if (!ingredients.length) {
    return res.status(400).json(formatError("Ingredients are required"))
  }

  const params = {
    ingredients,
    pantry:     normalizeList(body.pantry || []),
    quantities: normalizeQuantities(body.quantities || {}),
    mood:       body.mood    || "",
    cuisine:    body.cuisine || "indian",
    diet:       body.diet    || "veg",
    meal:       body.meal    || "any",
    maxTime:    Number(body.maxTime) || null
  }

  // Cache hit → reuse, no Gemini call.
  const key = cacheKey(params)
  if (store.has(key)) return res.status(200).json(store.get(key))

  try {
    const recipe = await recipeProvider.generate(params, keys)

    // Transparency: which of the user's ingredients are used / still needed.
    const ownedSet  = buildOwnedSet(params.ingredients, params.quantities)
    const pantrySet = buildPantrySet(params.pantry)
    const { matched, missing } = computeMatch(recipe, ownedSet, pantrySet)
    recipe.matchedIngredients = matched
    recipe.missingIngredients = missing
    recipe.id = Date.now() // unique numeric id (won't collide with local/Spoonacular)

    const result = { recipe }
    store.set(key, result)
    setTimeout(() => store.delete(key), TTL_MS)
    return res.status(200).json(result)
  } catch (err) {
  console.error("Generate error:", err.message)
  const is429 = err.message?.includes("429") || err.message?.includes("quota")
  return res
    .status(is429 ? 429 : 502)
    .json(formatError(is429
      ? "AI quota exhausted — try again in a minute"
      : err.message || "Generation failed"
    ))
  }
}