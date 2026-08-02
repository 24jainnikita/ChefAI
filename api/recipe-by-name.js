// api/recipe-by-name.js
// ─────────────────────────────────────────────────────────────────────────────
// HTTP endpoint for direct recipe lookup by dish name.
// Called only by Chef Mimi when the user asks "give me the recipe for X".
// Reuses all existing modules. Never called by the recommendation pipeline.
// Priority: Local DB → Spoonacular → Gemini.
// ─────────────────────────────────────────────────────────────────────────────

const { findByName } = require("./_lib/recipeByName")
const { formatError } = require("./_lib/formatter")

// Simple in-memory cache (10 min) so repeated requests for the same dish skip
// the Gemini fallback.
const TTL_MS = 10 * 60 * 1000
const store = new Map()

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  if (req.method === "OPTIONS") return res.status(200).end()
  if (req.method !== "POST")    return res.status(405).json(formatError("Method not allowed"))

  const { query } = req.body || {}
  if (!query || !String(query).trim()) {
    return res.status(400).json(formatError("A recipe name is required"))
  }

  const keys = {
    geminiKey:       process.env.GEMINI_KEY       || "",
    geminiBackupKey: process.env.GEMINI_KEY2      || "",
    spoonacularKey:  process.env.SPOONACULAR_KEY  || ""
  }

  const cacheKey = String(query).toLowerCase().trim()
  if (store.has(cacheKey)) return res.status(200).json(store.get(cacheKey))

  try {
    const recipe = await findByName(query, keys)
    if (!recipe) {
      return res.status(404).json(formatError(`Sorry, I couldn't find a recipe for "${query}"`))
    }

    const result = { recipe }
    store.set(cacheKey, result)
    setTimeout(() => store.delete(cacheKey), TTL_MS)
    return res.status(200).json(result)
  } catch (err) {
    console.error("recipe-by-name error:", err.message)
    return res.status(502).json(formatError(err.message || "Recipe lookup failed"))
  }
}
