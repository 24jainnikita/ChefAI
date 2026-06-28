// api/_lib/recipeEngine.js
// ─────────────────────────────────────────────────────────────────────────────
// Recipe Engine — orchestration layer.
//
// Decides WHERE recipes come from and combines them. Owns no transport details
// and no HTTP/response shaping — just sourcing, scoring, enrichment, merging,
// de-duping and (optional) LLM reasoning.
//
// Pipeline:
//   1. Score + rank the LOCAL database with the Recommendation Engine
//      (recommender.js): hard filters → weighted scoring → progressive
//      relaxation that guarantees a non-empty result set. Carries per-recipe
//      score + matched/missing ingredients.
//   2. Query SPOONACULAR (when a key is present) and compute the same
//      matched/missing info for those recipes using the shared matcher.
//   3. Merge local (ranked) first, then Spoonacular, de-duping by title.
//   4. Enrich every merged recipe with STATIC substitutions from the local
//      substitution DB (and record which ingredients still lack one).
//   5. Hand the TOP candidates to the provider-agnostic reasoningEngine for
//      optional LLM enhancement (re-rank, mood explanations, contextual
//      substitutions, mood tip). Skipped cleanly on any failure.
//
// Returns { recipes, moodTip }. The local recommender never returns zero, so
// the engine never returns zero — with or without an LLM.
// ─────────────────────────────────────────────────────────────────────────────

const { getCandidates, normalize } = require("./localDb")
const { recommend } = require("./recommender")
const { fetchFromSpoonacular } = require("./spoonacular")
const { recipeSubstitutions } = require("./substitutions")
const { buildOwnedSet, buildPantrySet, computeMatch } = require("./matching")
const { enhance } = require("./reasoningEngine")

const MAX_RESULTS = 6

// Normalize a title for duplicate detection (lowercase, collapse whitespace).
function titleKey(title) {
  return String(title || "").toLowerCase().replace(/\s+/g, " ").trim()
}

async function getRecipes({ ingredients, pantry, quantities, mood, cuisine, diet, meal, keys }) {
  const { spoonacularKey, geminiKey, geminiBackupKey } = keys

  // STEP 1 — score + rank the local database (synchronous, always available).
  const ranked = recommend(getCandidates(), {
    ingredients, pantry, quantities, mood, cuisine, diet, meal
  })
  const localRecipes = ranked.map(r => {
    const base = normalize(r.recipe, r.index)
    base.matchScore         = Number(r.score.toFixed(3))
    base.matchedIngredients = r.matched
    base.missingIngredients = r.missing
    return base
  })

  // STEP 2 — Spoonacular (network; skipped if no key configured). Compute the
  // same matched/missing info so reasoning context is consistent across sources.
  let spoonacularRecipes = []
  if (spoonacularKey) {
    const ownedSet  = buildOwnedSet(ingredients, quantities)
    const pantrySet = buildPantrySet(pantry)
    spoonacularRecipes = (await fetchFromSpoonacular({
      ingredients, mood, cuisine, diet, meal, apiKey: spoonacularKey
    })).map(r => {
      const { matched, missing } = computeMatch(r, ownedSet, pantrySet)
      r.matchedIngredients = matched
      r.missingIngredients = missing
      return r
    })
  }

  // STEP 3 — merge local (ranked) first, then Spoonacular, skipping dup titles.
  const merged = []
  const seenTitles = new Set()
  for (const recipe of [...localRecipes, ...spoonacularRecipes]) {
    const key = titleKey(recipe.title)
    if (seenTitles.has(key)) continue
    seenTitles.add(key)
    merged.push(recipe)
    if (merged.length >= MAX_RESULTS) break
  }

  // STEP 4 — enrich with STATIC substitutions; note gaps for the LLM.
  for (const recipe of merged) {
    const { known, uncovered } = recipeSubstitutions(recipe, diet)
    recipe.substitutions     = known       // e.g. ["paneer -> tofu / halloumi"]
    recipe.substitutionGaps  = uncovered   // ingredients with no common sub (LLM only)
  }

  // STEP 5 — optional, provider-agnostic LLM reasoning over the top candidates.
  const { recipes, moodTip } = await enhance(
    merged,
    { mood, cuisine, diet, meal, pantry },
    { geminiKey, geminiBackupKey }
  )

  return { recipes, moodTip }
}

module.exports = { getRecipes, MAX_RESULTS }
