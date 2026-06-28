// api/_lib/spoonacular.js
// ─────────────────────────────────────────────────────────────────────────────
// Spoonacular service — the PRIMARY recipe source.
//
// Responsibilities:
//   • Build the complexSearch query from the user's ingredients + filters
//   • Translate Indian ingredient names into Spoonacular-friendly terms
//   • Call Spoonacular and filter out results that need far more ingredients
//     than the user actually has
//   • Normalize each raw Spoonacular result into ChefAI's internal recipe shape
//
// NOTE: the `cuisine` filter is intentionally NOT sent to Spoonacular — its
// Indian-cuisine data is too sparse and including it returns almost nothing.
//
// On any failure this module returns an empty array (never throws) so the
// recipe engine can cleanly fall back to Gemini.
// ─────────────────────────────────────────────────────────────────────────────

const { SPOONACULAR_BASE, MOOD_MAP, DIET_MAP, MEAL_MAP, INGREDIENT_MAP } = require("./config")

// Map Indian ingredient names to terms Spoonacular understands.
function translateIngredients(ingredients) {
  return ingredients.map(i => INGREDIENT_MAP[i.toLowerCase()] || i)
}

// ── Public: fetch + normalize recipes from Spoonacular ──────────────────────
async function fetchFromSpoonacular({ ingredients, mood, cuisine, diet, meal, apiKey }) {
  try {
    const moodParams = MOOD_MAP[mood] || {}
    const dietParam  = DIET_MAP[diet] || ""
    const typeParam  = MEAL_MAP[meal] || ""
    // Explicit meal type wins; otherwise fall back to the mood's implied type.
    const finalType  = typeParam || moodParams.type || ""

    const params = new URLSearchParams({
      apiKey,
      includeIngredients:    translateIngredients(ingredients).join(","),
      number:                "9",
      addRecipeInformation:  "true",
      addRecipeNutrition:    "true",
      fillIngredients:       "true",
      addRecipeInstructions: "true",
      sort:                  moodParams.sort || "max-used-ingredients",
      ...(dietParam               && { diet: dietParam }),
      ...(finalType               && { type: finalType }),
      ...(moodParams.maxReadyTime && { maxReadyTime: String(moodParams.maxReadyTime) }),
      ...(moodParams.maxCalories  && { maxCalories:  String(moodParams.maxCalories)  }),
      ...(moodParams.minCalories  && { minCalories:  String(moodParams.minCalories)  }),
      ...(moodParams.minProtein   && { minProtein:   String(moodParams.minProtein)   }),
      ...(moodParams.minServings  && { minServings:  String(moodParams.minServings)  }),
    })
    // cuisine param intentionally omitted — see module header.

    const res = await fetch(`${SPOONACULAR_BASE}/recipes/complexSearch?${params}`)
    if (!res.ok) { console.warn("Spoonacular:", res.status); return [] }

    const data = await res.json()
    if (!data.results?.length) return []

    // Drop recipes that require more than (used + 2) extra ingredients.
    const filtered = data.results.filter(r => {
      const used   = r.usedIngredientCount   || 0
      const missed = r.missedIngredientCount || 0
      return missed <= used + 2
    })
    if (!filtered.length) return []

    return filtered.map((r, i) => ({
      id:             r.id || i + 1,
      title:          r.title || "Untitled",
      readyInMinutes: r.readyInMinutes || null,
      servings:       r.servings || 2,
      diet:           extractDiet(r),
      image:          r.image || null,
      emoji:          "🍽️",
      description:    buildSpoonacularDescription(r),
      ingredients:    extractIngredients(r),
      steps:          extractSteps(r),
      nutrition:      extractNutrition(r),
      source:         "spoonacular"
    }))
  } catch (err) {
    console.warn("Spoonacular failed:", err.message)
    return []
  }
}

// ── Normalization helpers (Spoonacular-specific) ───────────────────────────

// Build a static description from Spoonacular metadata only (no AI).
function buildSpoonacularDescription(r) {
  const diet = r.vegan ? "vegan" : r.vegetarian ? "vegetarian" : ""
  const time = r.readyInMinutes
  const parts = ["A", diet, "recipe"].filter(Boolean)
  let desc = parts.join(" ")
  if (time) desc += `, ready in ${time} minutes`
  return desc + "."
}

// Derive a diet label from Spoonacular flags, falling back to a title scan.
function extractDiet(r) {
  if (r.vegan) return "vegan"
  if (r.vegetarian) return "vegetarian"
  const title = (r.title || "").toLowerCase()
  const meatWords = ["chicken","mutton","beef","pork","fish","prawn","shrimp","lamb","bacon","meat","turkey"]
  return meatWords.some(w => title.includes(w)) ? "non-vegetarian" : "vegetarian"
}

// Flatten Spoonacular's ingredient objects into { name, amount, unit }.
function extractIngredients(r) {
  return (r.extendedIngredients || r.usedIngredients || []).map(i => ({
    name:   i.name || i.originalName || "",
    amount: i.amount || 0,
    unit:   i.unit || i.measures?.metric?.unitShort || ""
  }))
}

// Prefer structured analyzed steps; fall back to splitting raw instructions.
function extractSteps(r) {
  const analyzed = r.analyzedInstructions?.[0]?.steps
  if (analyzed?.length) return analyzed.map(s => s.step)
  if (r.instructions) {
    return r.instructions
      .replace(/<[^>]*>/g, "")
      .split(/\.\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 10)
  }
  return ["No steps available — visit the original recipe source for full instructions."]
}

// Pull the four headline macros out of Spoonacular's nutrient array.
function extractNutrition(r) {
  const n = r.nutrition?.nutrients
  if (!n) return null
  const get = name => Math.round(n.find(x => x.name === name)?.amount || 0)
  return {
    calories: get("Calories"),
    protein:  get("Protein"),
    carbs:    get("Carbohydrates"),
    fat:      get("Fat")
  }
}

module.exports = { fetchFromSpoonacular, translateIngredients }
