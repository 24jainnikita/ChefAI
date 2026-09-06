// api/_lib/config.js
// ─────────────────────────────────────────────────────────────────────────────
// Central configuration & lookup tables for the recipe backend.
//
// Everything here is static data with no side effects: API base URLs, the
// mood / diet / meal filter maps used to translate the frontend's friendly
// values into provider-specific query params, the assumed pantry staples, and
// the Indian → Spoonacular ingredient name translations.
//
// Keeping this in one place means the Spoonacular and Gemini services share a
// single source of truth and nothing is duplicated across modules.
// ─────────────────────────────────────────────────────────────────────────────

// Provider endpoints
const SPOONACULAR_BASE = "https://api.spoonacular.com"

// gemini-2.0-flash-lite — current free-tier GA model
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent"

// Mood → Spoonacular query hints (sort order, calorie/time/protein bounds, type)
const MOOD_MAP = {
  lazy:    { maxReadyTime: 20, sort: "time" },
  festive: { sort: "popularity", type: "main course", minCalories: "300" },
  healthy: { maxCalories: 400, sort: "healthiness", minProtein: 10 },
  comfort: { sort: "popularity", minCalories: 350, type: "main course" },
  fancy:   { sort: "popularity", minServings: 2 },
  snack:   { maxReadyTime: 15, type: "snack", maxCalories: 300 }
}

// Diet → Spoonacular diet param ("nonveg" has no Spoonacular equivalent)
const DIET_MAP = { veg: "vegetarian", vegan: "vegan", nonveg: "" }

// Meal type → Spoonacular recipe "type" param
const MEAL_MAP = {
  breakfast: "breakfast",
  lunch:     "main course",
  dinner:    "main course",
  snack:     "snack",
  any:       ""
}

// Staples assumed to always be on hand — treated as available by the matcher so
// they're never counted as "missing". Aligned with the "Assume Basic Kitchen
// Staples" option in the UI.
const PANTRY = [
  "salt", "water", "oil", "sugar", "black pepper",
  "turmeric", "red chili powder", "coriander powder", "garam masala",
  "cumin seeds", "mustard seeds", "hing", "curry leaves"
]

// Indian ingredient names → Spoonacular-friendly equivalents. Spoonacular's
// database is sparse on Indian terms, so we translate before querying.
const INGREDIENT_MAP = {
  "paneer": "cottage cheese", "curd": "yogurt", "dal": "lentils",
  "toor dal": "lentils", "moong dal": "mung beans", "chana dal": "chickpeas",
  "rajma": "kidney beans", "atta": "whole wheat flour", "besan": "chickpea flour",
  "poha": "flattened rice", "suji": "semolina", "methi": "fenugreek",
  "shimla mirch": "bell pepper", "bhindi": "okra", "karela": "bitter melon",
  "lauki": "bottle gourd", "arbi": "taro"
}

module.exports = {
  SPOONACULAR_BASE,
  GEMINI_BASE,
  MOOD_MAP,
  DIET_MAP,
  MEAL_MAP,
  PANTRY,
  INGREDIENT_MAP
}
