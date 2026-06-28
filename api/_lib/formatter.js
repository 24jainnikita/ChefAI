// api/_lib/formatter.js
// ─────────────────────────────────────────────────────────────────────────────
// Response formatter.
//
// Single place that builds the JSON envelope the frontend consumes. Keeping
// this isolated guarantees the response stays BACKWARD COMPATIBLE: the shape
// has always been { recipes: [...], moodTip: "" }, and js/app.js reads
// `data.recipes`, so that contract must not change.
//
// `moodTip` is preserved as an empty string exactly as before.
// ─────────────────────────────────────────────────────────────────────────────

const { MAX_RESULTS } = require("./recipeEngine")

// Build the success payload: cap the recipe list and attach the mood tip.
// moodTip comes from Gemini when available, otherwise an empty string (the
// original, backward-compatible default).
function formatRecipeResponse(recipes, moodTip = "") {
  return {
    recipes: recipes.slice(0, MAX_RESULTS),
    moodTip: moodTip || ""
  }
}

// Build a consistent error payload.
function formatError(message) {
  return { error: message || "Server error" }
}

module.exports = { formatRecipeResponse, formatError }
