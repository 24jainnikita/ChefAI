// api/_lib/recommender.js
// ─────────────────────────────────────────────────────────────────────────────
// Recommendation Engine.
//
// SCORES candidate recipes instead of merely filtering them, then ranks by the
// resulting score. Pure JavaScript, no AI.
//
// Inputs (criteria):
//   ingredients  – array of ingredient names the user has
//   pantry       – extra pantry items the user has (merged with built-in staples)
//   quantities   – optional { ingredientName: number } map; a value <= 0 means
//                  "I don't actually have this", so it is excluded from matching
//   cuisine, meal, diet, mood
//
// HARD FILTERS (applied first): diet, cuisine, meal type.
// SOFT SCORING (ranks survivors), weighted to sum to 1.0:
//   • Ingredient match … 40%   (recipe coverage by your ingredients; pantry
//                                items count at half weight → "pantry match")
//   • Mood ………………………… 25%
//   • Cuisine …………………… 15%
//   • Meal type ……………… 10%
//   • Preparation time … 10%   (faster relative to the dataset scores higher)
//
// PROGRESSIVE RELAXATION — if strict filtering yields nothing, we loosen only
// the soft requirement first (ingredient overlap), then progressively drop hard
// constraints (meal → cuisine → diet) until candidates exist. Scoring always
// uses the ORIGINAL criteria, so even after relaxing a filter the recipes that
// truly match still float to the top. This guarantees we NEVER return zero.
//
// Each returned result carries { score, matched, missing } so downstream layers
// (the reasoning engine, the response) can explain WHY a recipe was chosen.
// ─────────────────────────────────────────────────────────────────────────────

const {
  norm,
  setHas,
  buildOwnedSet,
  buildPantrySet,
  computeMatch
} = require("./matching")

// Soft-scoring weights. Must sum to 1.0.
const WEIGHTS = {
  ingredient: 0.40,
  mood:       0.25,
  cuisine:    0.15,
  meal:       0.10,
  prepTime:   0.10
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

// ── hard-filter predicates ───────────────────────────────────────────────────
function passesDiet(recipe, diet) {
  if (diet === "vegan") return recipe.diet === "vegan"
  if (diet === "veg")   return recipe.diet === "vegetarian" || recipe.diet === "vegan"
  return true // nonveg / unknown → no restriction
}

function passesCuisine(recipe, cuisine) {
  if (!cuisine || cuisine === "any") return true
  return norm(recipe.cuisine) === norm(cuisine)
}

function passesMeal(recipe, meal) {
  if (!meal || meal === "any") return true
  return Array.isArray(recipe.mealType) && recipe.mealType.includes(meal)
}

function hasIngredientMatch(recipe, ownedSet) {
  return (recipe.ingredients || []).some(ing => setHas(ownedSet, ing.name))
}

// ── individual soft sub-scores (each 0..1) ───────────────────────────────────

// Ingredient coverage: fraction of the recipe you can make. User ingredients
// count full (1.0), pantry staples count half (0.5) — folding the "pantry
// match" signal into the ingredient score.
function ingredientScore(recipe, ownedSet, pantrySet) {
  const ings = recipe.ingredients || []
  if (!ings.length) return 0
  let credit = 0
  for (const ing of ings) {
    if (setHas(ownedSet, ing.name)) credit += 1
    else if (setHas(pantrySet, ing.name)) credit += 0.5
  }
  return clamp(credit / ings.length, 0, 1)
}

function moodScore(recipe, mood) {
  if (!mood) return 1 // no preference → neutral, don't penalize
  return Array.isArray(recipe.moods) && recipe.moods.includes(mood) ? 1 : 0
}

function cuisineScore(recipe, cuisine) {
  if (!cuisine || cuisine === "any") return 1
  return norm(recipe.cuisine) === norm(cuisine) ? 1 : 0
}

function mealScore(recipe, meal) {
  if (!meal || meal === "any") return 1
  return Array.isArray(recipe.mealType) && recipe.mealType.includes(meal) ? 1 : 0
}

// Faster recipes score higher, normalized across the candidate set's range.
function prepScore(recipe, range) {
  if (range.max === range.min) return 1
  const p = recipe.preparationTime || range.max
  return clamp((range.max - p) / (range.max - range.min), 0, 1)
}

// Weighted total (0..1).
function scoreRecipe(recipe, ctx) {
  return (
    WEIGHTS.ingredient * ingredientScore(recipe, ctx.ownedSet, ctx.pantrySet) +
    WEIGHTS.mood       * moodScore(recipe, ctx.mood) +
    WEIGHTS.cuisine    * cuisineScore(recipe, ctx.cuisine) +
    WEIGHTS.meal       * mealScore(recipe, ctx.meal) +
    WEIGHTS.prepTime   * prepScore(recipe, ctx.prepRange)
  )
}

// ── progressive relaxation levels (strict → loose) ───────────────────────────
const LEVELS = [
  { label: "strict",            diet: true,  cuisine: true,  meal: true,  requireMatch: true  },
  { label: "no-ingredient-req", diet: true,  cuisine: true,  meal: true,  requireMatch: false },
  { label: "relaxed-meal",      diet: true,  cuisine: true,  meal: false, requireMatch: false },
  { label: "relaxed-cuisine",   diet: true,  cuisine: false, meal: false, requireMatch: false },
  { label: "relaxed-diet",      diet: false, cuisine: false, meal: false, requireMatch: false }
]

function passesLevel(recipe, level, criteria, ownedSet) {
  if (level.diet    && !passesDiet(recipe, criteria.diet))       return false
  if (level.cuisine && !passesCuisine(recipe, criteria.cuisine)) return false
  if (level.meal    && !passesMeal(recipe, criteria.meal))       return false
  if (level.requireMatch && !hasIngredientMatch(recipe, ownedSet)) return false
  return true
}

function computePrepRange(candidates) {
  let min = Infinity, max = -Infinity
  for (const { recipe } of candidates) {
    const p = recipe.preparationTime || 0
    if (p < min) min = p
    if (p > max) max = p
  }
  if (!isFinite(min)) { min = 0; max = 0 }
  return { min, max }
}

// ── public API ────────────────────────────────────────────────────────────────
// candidates: [{ recipe, index }, …] from localDb.getCandidates()
// criteria:   { ingredients, pantry, quantities, cuisine, meal, diet, mood }
// Returns sorted [{ recipe, index, score, matched, missing, relaxed }] — best
// first, never empty (unless there are no candidates at all).
function recommend(candidates, criteria = {}) {
  if (!candidates.length) return []

  const ownedSet  = buildOwnedSet(criteria.ingredients, criteria.quantities)
  const pantrySet = buildPantrySet(criteria.pantry)
  const prepRange = computePrepRange(candidates)
  const ctx = {
    ownedSet,
    pantrySet,
    prepRange,
    mood:    criteria.mood,
    cuisine: criteria.cuisine,
    meal:    criteria.meal
  }

  // Walk relaxation levels until one yields candidates.
  for (const level of LEVELS) {
    const survivors = candidates.filter(c => passesLevel(c.recipe, level, criteria, ownedSet))
    if (!survivors.length) continue

    const scored = survivors.map(c => {
      const { matched, missing } = computeMatch(c.recipe, ownedSet, pantrySet)
      return {
        ...c,
        score: scoreRecipe(c.recipe, ctx),
        matched,
        missing,
        relaxed: level.label
      }
    })
    scored.sort((a, b) => b.score - a.score)
    return scored
  }

  return [] // unreachable when candidates is non-empty (last level enforces nothing)
}

module.exports = { recommend, scoreRecipe, WEIGHTS }
