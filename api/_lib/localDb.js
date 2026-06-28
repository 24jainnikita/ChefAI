// api/_lib/localDb.js
// ─────────────────────────────────────────────────────────────────────────────
// Local Recipe Database service — DATA + NORMALIZATION only.
//
// Reads the curated Indian recipe set from data/indian-recipes.json and exposes
// it as scoring candidates. All ranking / filtering logic now lives in
// recommender.js — this module is intentionally dumb: load, expose, normalize.
//
// Why a local DB exists: Spoonacular's Indian-cuisine data is sparse, so a
// curated local set dramatically improves Indian recommendations with no AI.
//
// IMPORTANT — id contract: the frontend (js/app.js) injects recipe ids into
// inline handlers unquoted, e.g. onclick="openRecipe(${r.id})". So local ids
// MUST be numbers. We use NEGATIVE integers (-1, -2, …) which are valid JS and
// can never collide with Spoonacular's positive ids — making title-based
// de-duplication the only thing the engine has to worry about.
// ─────────────────────────────────────────────────────────────────────────────

const path = require("path")
const { normalizeName } = require("./normalize")

// Load the dataset once per warm serverless instance.
let RECIPES = []
try {
  RECIPES = require(path.join(__dirname, "..", "..", "data", "indian-recipes.json"))
} catch (err) {
  console.warn("Local recipe DB failed to load:", err.message)
  RECIPES = []
}

// Pre-pair each recipe with its array index. The index is the source of the
// stable negative id used during normalization, so it must travel with the
// recipe through filtering and sorting. We also canonicalize each recipe's
// ingredient names once (idempotent) so engine matching uses normalized names.
const CANDIDATES = RECIPES.map((recipe, index) => {
  if (Array.isArray(recipe.ingredients)) {
    recipe.ingredients.forEach(i => { if (i && i.name) i.name = normalizeName(i.name) })
  }
  return { recipe, index }
})

// Folder (served statically by Vercel from the repo root) for recipe photos.
const IMAGE_DIR = "/images/recipes"

// Turn a recipe title into a stable, filesystem-safe filename slug.
// e.g. "Masala Dosa" -> "masala-dosa", "Chicken 65" -> "chicken-65".
function slugify(title) {
  return String(title || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumerics → hyphen
    .replace(/^-+|-+$/g, "")      // trim leading/trailing hyphens
}

// Resolve the image URL for a recipe. An explicit `image` field in the JSON
// wins; otherwise we derive /images/recipes/<slug>.jpg. If the file is missing
// the frontend's <img onerror> handler falls back to the recipe emoji.
function imageFor(recipe) {
  if (recipe.image) return recipe.image
  return `${IMAGE_DIR}/${slugify(recipe.title)}.jpg`
}

// Mood → descriptive adjective for the static description line.
const MOOD_ADJ = {
  lazy: "quick", festive: "festive", healthy: "wholesome",
  comfort: "comforting", fancy: "indulgent", snack: "light"
}

const DIET_WORD = {
  vegetarian: "vegetarian", vegan: "vegan", "non-vegetarian": "non-veg"
}

// Build a recipe description from STATIC metadata only (no AI). An explicit
// `description` field in the JSON always wins so curated copy can be added
// later without code changes.
function buildDescription(recipe) {
  if (recipe.description) return recipe.description

  const moodAdj = MOOD_ADJ[(recipe.moods || [])[0]] || ""
  const dietWord = DIET_WORD[recipe.diet] || ""
  const meal = (recipe.mealType || [])[0] || "dish"
  const time = recipe.preparationTime

  const names = (recipe.ingredients || []).slice(0, 3).map(i => i.name)
  let ingList = ""
  if (names.length === 1) ingList = names[0]
  else if (names.length === 2) ingList = `${names[0]} and ${names[1]}`
  else if (names.length >= 3) ingList = `${names[0]}, ${names[1]} and ${names[2]}`

  const lead = [moodAdj, dietWord, meal].filter(Boolean).join(" ")
  let desc = `A ${lead}`.trim()
  if (ingList) desc += ` made with ${ingList}`
  if (time) desc += `, ready in ${time} minutes`
  return desc + "."
}

// All scoring candidates: [{ recipe, index }, …]. The recommender consumes this.
function getCandidates() {
  return CANDIDATES
}

// ── Normalization: local JSON shape → internal recipe shape ─────────────────
// `index` derives the stable negative id (see id contract above). The internal
// shape matches what the Spoonacular service emits and what the frontend reads.
function normalize(recipe, index) {
  return {
    id:             -(index + 1),                 // negative → never collides with Spoonacular
    title:          recipe.title,
    readyInMinutes: recipe.preparationTime || null,
    servings:       recipe.servings || 2,
    diet:           recipe.diet || "vegetarian",  // frontend reads .includes("veg")/("vegan")
    image:          imageFor(recipe),              // /images/recipes/<slug>.jpg (emoji fallback if missing)
    emoji:          recipe.emoji || "🍽️",
    description:    buildDescription(recipe),       // STATIC metadata description (no AI)
    mealType:       recipe.mealType || [],          // surfaced for transparency ("Why this recipe?")
    moods:          recipe.moods || [],             // surfaced for transparency ("Why this recipe?")
    ingredients:    recipe.ingredients || [],      // already { name, amount, unit }
    steps:          recipe.instructions || [],     // frontend renders recipe.steps
    nutrition:      recipe.nutrition || null,
    source:         "local"
  }
}

module.exports = { getCandidates, normalize }
