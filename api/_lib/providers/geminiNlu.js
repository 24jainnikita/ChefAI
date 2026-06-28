// api/_lib/providers/geminiNlu.js
// ─────────────────────────────────────────────────────────────────────────────
// Gemini natural-language-understanding (NLU) provider.
//
// SEPARATE from the Reasoning Engine (which must not be modified). Its only job
// is to turn a free-text message into the structured filter entities the
// existing Recommendation Engine understands:
//   { ingredients:[], mood, meal, diet, cuisine }
//
// It NEVER generates recipes. The chat uses it only as a fallback for messages
// its local parser can't handle, so quota usage stays minimal. One call per key
// (no retry/backoff); fails by throwing so the endpoint can respond gracefully.
// ─────────────────────────────────────────────────────────────────────────────

const { GEMINI_BASE } = require("../config")
const { fetchWithRetry } = require("../http")

const name = "gemini-nlu"

// Allowed enum values — anything else from the model is dropped.
const MOODS    = ["lazy", "festive", "healthy", "comfort", "fancy", "snack"]
const MEALS    = ["breakfast", "lunch", "dinner", "snack", "any"]
const DIETS    = ["veg", "nonveg", "vegan"]
const CUISINES = ["indian", "any"]

function isAvailable(keys = {}) {
  return Boolean(keys.geminiKey)
}

function buildPrompt(message) {
  return `Extract cooking preferences from the user's message. Reply with ONLY valid JSON, no markdown:
{"ingredients":[],"mood":"","meal":"","diet":"","cuisine":""}
Rules: ingredients = food items mentioned, lowercase singular. mood one of ${MOODS.join(",")} or "". meal one of ${MEALS.join(",")} or "". diet one of veg,nonveg,vegan or "". cuisine one of indian,any or "". Use "" when unsure. Do not invent items.
Message: ${JSON.stringify(message)}`
}

// ── interface: understand ─────────────────────────────────────────────────────
async function understand(message, keys = {}) {
  if (!message) throw new Error("No message provided")

  let data = await callGemini(message, keys.geminiKey)
  if (!data && keys.geminiBackupKey) data = await callGemini(message, keys.geminiBackupKey)
  if (!data) throw new Error("NLU provider unavailable")

  const parsed = parseJson(data)
  if (!parsed) throw new Error("Could not parse NLU response")

  return sanitize(parsed)
}

async function callGemini(message, key) {
  if (!key) return null
  try {
    const res = await fetchWithRetry(`${GEMINI_BASE}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(message) }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 256 }
      })
    }, 0) // one call per key — quota friendly
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

function parseJson(data) {
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || ""
  const clean = rawText.replace(/```json/gi, "").replace(/```/g, "").trim()
  const match = clean.match(/\{[\s\S]*\}/)
  if (!match) return null
  try { return JSON.parse(match[0]) } catch { return null }
}

// Coerce/validate model output into the strict entity shape.
function sanitize(o) {
  const pickEnum = (v, set) => (set.includes(String(v || "").toLowerCase()) ? String(v).toLowerCase() : "")
  const ingredients = Array.isArray(o.ingredients)
    ? o.ingredients.map(x => String(x || "").trim().toLowerCase()).filter(Boolean).slice(0, 15)
    : []
  return {
    ingredients,
    mood:    pickEnum(o.mood, MOODS),
    meal:    pickEnum(o.meal, MEALS),
    diet:    pickEnum(o.diet, DIETS),
    cuisine: pickEnum(o.cuisine, CUISINES)
  }
}

module.exports = { name, isAvailable, understand }
