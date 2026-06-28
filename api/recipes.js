// api/recipes.js
// ─────────────────────────────────────────────────────────────────────────────
// HTTP entry point for ChefAI's recipe search (Vercel serverless function).
//
// This file is intentionally THIN. Its only jobs are transport concerns:
//   • CORS headers + preflight handling
//   • method/validation guards
//   • reading API keys from the environment
//   • parsing the request body
//   • checking/populating the cache
//   • delegating to the recipe engine and the response formatter
//
// All real logic lives in ./_lib/* :
//   config.js        – static maps & constants
//   http.js          – fetchWithRetry transport helper
//   spoonacular.js   – primary recipe source + normalization
//   gemini.js        – fallback recipe source + prompt/parse
//   recipeEngine.js  – orchestration (which source, dedupe, merge)
//   formatter.js     – builds the backward-compatible JSON envelope
//   cache.js         – in-memory TTL cache
//
// The response contract is unchanged: { recipes: [...], moodTip: "" }.
// ─────────────────────────────────────────────────────────────────────────────

const { getRecipes } = require("./_lib/recipeEngine")
const { formatRecipeResponse, formatError } = require("./_lib/formatter")
const cache = require("./_lib/cache")

module.exports = async (req, res) => {
  // ── CORS ──────────────────────────────────────────────────────────────────
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  if (req.method === "OPTIONS") return res.status(200).end()
  if (req.method !== "POST")    return res.status(405).json(formatError("Method not allowed"))

  // ── API keys (from environment) ─────────────────────────────────────────────
  const keys = {
    geminiKey:       process.env.GEMINI_KEY       || "",
    geminiBackupKey: process.env.GEMINI_KEY2      || "",
    spoonacularKey:  process.env.SPOONACULAR_KEY  || ""
  }
  if (!keys.spoonacularKey && !keys.geminiKey) {
    return res.status(500).json(formatError("No API keys configured"))
  }

  // ── Request parsing + validation ────────────────────────────────────────────
  const {
    ingredients = [],
    pantry      = [],   // optional: extra pantry items (frontend may not send)
    quantities  = {},   // optional: { ingredientName: number } (frontend may not send)
    mood        = "",
    cuisine     = "indian",
    diet        = "veg",
    meal        = "any"
  } = req.body || {}

  if (!ingredients.length) {
    return res.status(400).json(formatError("Ingredients are required"))
  }

  const params = { ingredients, pantry, quantities, mood, cuisine, diet, meal }

  // ── Cache lookup ──────────────────────────────────────────────────────────
  const cacheKey = cache.buildKey(params)
  if (cache.has(cacheKey)) return res.status(200).json(cache.get(cacheKey))

  // ── Fetch + format ────────────────────────────────────────────────────────
  try {
    const { recipes, moodTip } = await getRecipes({ ...params, keys })
    const result = formatRecipeResponse(recipes, moodTip)

    // Only cache non-empty results (matches original behavior).
    if (recipes.length > 0) cache.set(cacheKey, result)

    return res.status(200).json(result)
  } catch (err) {
    console.error("ChefAI error:", err.message)
    return res.status(500).json(formatError(err.message))
  }
}
