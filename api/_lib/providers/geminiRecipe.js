// api/_lib/providers/geminiRecipe.js
// ─────────────────────────────────────────────────────────────────────────────
// Gemini recipe-GENERATION provider (final fallback only).
//
// Used exclusively by /api/generate when the user explicitly asks for a custom
// recipe after weak recommendations. It generates exactly ONE recipe from the
// user's own ingredients + preferences and returns it in ChefAI's internal
// recipe shape so it drops straight into the existing cards/modal.
//
// It does NOT touch the Recommendation Engine. One call per key (quota-friendly,
// no retry/backoff); fails by throwing so the endpoint can respond gracefully.
// ─────────────────────────────────────────────────────────────────────────────

const { GEMINI_BASE } = require("../config")
const { fetchWithRetry } = require("../http")

const name = "gemini-recipe"

function isAvailable(keys = {}) {
  return Boolean(keys.geminiKey)
}

// Concise prompt (well under 500 tokens) using only the user's context.
function buildPrompt(p) {
  const have = (p.ingredients || []).join(", ") || "basic ingredients"
  const pantry = (p.pantry || []).join(", ") || "common staples"
  const qty = p.quantities && Object.keys(p.quantities).length
    ? Object.entries(p.quantities).map(([k, v]) => `${k}:${v}`).join(", ")
    : "not specified"
  const time = p.maxTime ? `${p.maxTime} minutes` : "flexible"

  return `You are a creative chef. Create ONE realistic recipe using MAINLY the user's available ingredients.
Available: ${have}.
Pantry/staples: ${pantry}.
Quantities: ${qty}.
Preferences -> mood: ${p.mood || "any"}, cuisine: ${p.cuisine || "any"}, diet: ${p.diet || "any"}, meal: ${p.meal || "any"}, max time: ${time}.
Rules: use mostly the available ingredients; put any extra required items under optionalIngredients (never in the main list); respect the diet strictly.
Reply with ONLY valid JSON, no markdown:
{"title":"","emoji":"🍽️","description":"max 20 words","ingredients":[{"name":"","amount":1,"unit":""}],"optionalIngredients":[{"name":"","amount":1,"unit":""}],"steps":["step 1","step 2"],"preparationTime":10,"cookTime":15,"servings":2,"nutrition":{"calories":0,"protein":0,"carbs":0,"fat":0},"difficulty":"easy","cuisine":"","mealType":["dinner"],"moods":[""],"diet":"vegetarian","tips":["one tip"],"commonSubstitutions":["item -> alternative"],"storage":"short storage note"}
Keep it concise and realistic.`
}

// ── interface: generate one recipe ───────────────────────────────────────────
async function generate(params, keys = {}) {
  const prompt = buildPrompt(params)

  let data = await callGemini(prompt, keys.geminiKey)
  if (!data && keys.geminiBackupKey) data = await callGemini(prompt, keys.geminiBackupKey)
  if (!data) throw new Error("Recipe generation is unavailable right now")

  const parsed = parseJson(data)
  if (!parsed || !parsed.title) throw new Error("Could not generate a valid recipe")

  return shape(parsed)
}

async function callGemini(prompt, key) {
  if (!key) return null
  try {
    const res = await fetchWithRetry(`${GEMINI_BASE}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1200 }
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

// ── map model output → ChefAI internal recipe shape ──────────────────────────
function ingList(arr) {
  if (!Array.isArray(arr)) return []
  return arr.map(i => ({
    name: String(i && i.name || "").trim().toLowerCase(),
    amount: (i && Number(i.amount) > 0) ? Number(i.amount) : "",
    unit: String(i && i.unit || "").trim()
  })).filter(i => i.name)
}

function normDiet(d) {
  d = String(d || "").toLowerCase()
  if (d.includes("vegan")) return "vegan"
  if (d.includes("veg")) return "vegetarian"
  if (d) return "non-vegetarian"
  return "vegetarian"
}

function num(n) { return Number.isFinite(Number(n)) ? Math.round(Number(n)) : 0 }

function shape(o) {
  const prep = num(o.preparationTime)
  const cook = num(o.cookTime)
  const ready = (prep + cook) || prep || cook || null

  return {
    title:          String(o.title).trim(),
    emoji:          String(o.emoji || "✨"),
    description:    String(o.description || "").trim(),
    image:          null,                       // no image → emoji fallback in UI
    ingredients:    ingList(o.ingredients),
    optionalIngredients: ingList(o.optionalIngredients),
    steps:          Array.isArray(o.steps) ? o.steps.map(String).filter(Boolean) : [],
    preparationTime: prep || null,
    cookTime:       cook || null,
    readyInMinutes: ready,
    servings:       num(o.servings) || 2,
    nutrition: o.nutrition ? {
      calories: num(o.nutrition.calories),
      protein:  num(o.nutrition.protein),
      carbs:    num(o.nutrition.carbs),
      fat:      num(o.nutrition.fat)
    } : null,
    difficulty:     String(o.difficulty || "easy"),
    cuisine:        String(o.cuisine || "").toLowerCase(),
    mealType:       Array.isArray(o.mealType) ? o.mealType.map(s => String(s).toLowerCase()) : [],
    moods:          Array.isArray(o.moods) ? o.moods.map(s => String(s).toLowerCase()).filter(Boolean) : [],
    diet:           normDiet(o.diet),
    tips:           Array.isArray(o.tips) ? o.tips.map(String).filter(Boolean) : [],
    substitutions:  Array.isArray(o.commonSubstitutions) ? o.commonSubstitutions.map(String).filter(Boolean) : [],
    storage:        String(o.storage || "").trim(),
    source:         "ai",
    aiGenerated:    true
  }
}

module.exports = { name, isAvailable, generate }
