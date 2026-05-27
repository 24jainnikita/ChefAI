// api/recipes.js — Hybrid Spoonacular + Gemini backend
// Flow: Spoonacular (primary) → Gemini fallback + mood tip

const SPOONACULAR_BASE = "https://api.spoonacular.com"
const GEMINI_BASE      = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

const MOOD_MAP = {
  lazy:    { maxReadyTime: 20, sort: "time" },
  festive: { sort: "popularity" },
  healthy: { maxCalories: 450, sort: "healthiness", minProtein: 8 },
  comfort: { sort: "popularity", minCalories: 300 },
  fancy:   { sort: "popularity", minServings: 2 },
  snack:   { maxReadyTime: 15, type: "snack" }
}

const DIET_MAP = {
  veg:    "vegetarian",
  vegan:  "vegan",
  nonveg: ""
}

const MEAL_MAP = {
  breakfast: "breakfast",
  lunch:     "main course",
  dinner:    "main course",
  snack:     "snack",
  any:       ""
}

const PANTRY = ["salt","water","oil","sugar","black pepper",
  "turmeric","red chili powder","cumin seeds","mustard seeds","hing","curry leaves"]

// In-memory cache — prevents quota burn on repeated searches
const cache = new Map()

// Retry helper — waits 5s and retries on 429
async function fetchWithRetry(url, options, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url, options)
    if (res.status !== 429) return res
    console.warn(`429 received, retry ${i + 1} of ${retries} in 5s...`)
    if (i < retries) await new Promise(r => setTimeout(r, 5000))
  }
  return { ok: false, status: 429, json: async () => ({}) }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  if (req.method === "OPTIONS") return res.status(200).end()
  if (req.method !== "POST")    return res.status(405).json({ error: "Method not allowed" })

  const GEMINI_KEY      = process.env.GEMINI_KEY      || ""
  const SPOONACULAR_KEY = process.env.SPOONACULAR_KEY || ""

  if (!SPOONACULAR_KEY && !GEMINI_KEY) {
    return res.status(500).json({ error: "No API keys configured" })
  }

  const {
    ingredients = [],
    mood        = "",
    cuisine     = "indian",
    diet        = "veg",
    meal        = "any"
  } = req.body || {}

  if (!ingredients.length) {
    return res.status(400).json({ error: "Ingredients are required" })
  }

  // Return cached result if same search was made recently
  const cacheKey = [ingredients.slice().sort().join(","), mood, cuisine, diet, meal].join("|")
  if (cache.has(cacheKey)) {
    console.log("Cache hit:", cacheKey)
    return res.status(200).json(cache.get(cacheKey))
  }

  try {
    // STEP 1: Spoonacular only for non-Indian (Indian ingredients not in their DB)
    let recipes = []
    if (SPOONACULAR_KEY && cuisine !== "indian") {
      recipes = await fetchFromSpoonacular({
        ingredients, mood, cuisine, diet, meal, apiKey: SPOONACULAR_KEY
      })
    }

    // STEP 2: Gemini — always for Indian, fallback for others if < 3 results
    if (recipes.length < 3 && GEMINI_KEY) {
      const geminiRecipes = await fetchFromGemini({
        ingredients, mood, cuisine, diet, meal, apiKey: GEMINI_KEY
      })
      const existingIds = new Set(recipes.map(r => r.id))
      for (const r of geminiRecipes) {
        if (!existingIds.has(r.id)) recipes.push(r)
        if (recipes.length >= 6) break
      }
    }

    // STEP 3: Mood tip — tiny 1-sentence Gemini call
    let moodTip = ""
    if (mood && GEMINI_KEY && recipes.length > 0) {
      moodTip = await getMoodTip(mood, ingredients, GEMINI_KEY)
    }

    const result = { recipes: recipes.slice(0, 6), moodTip }
    cache.set(cacheKey, result)
    setTimeout(() => cache.delete(cacheKey), 10 * 60 * 1000)
    return res.status(200).json(result)

  } catch (err) {
    console.error("ChefAI error:", err.message)
    return res.status(500).json({ error: err.message || "Server error" })
  }
}

async function fetchFromSpoonacular({ ingredients, mood, cuisine, diet, meal, apiKey }) {
  try {
    const moodParams = MOOD_MAP[mood]  || {}
    const dietParam  = DIET_MAP[diet]  || ""
    const typeParam  = MEAL_MAP[meal]  || ""

    const params = new URLSearchParams({
      apiKey,
      includeIngredients:   ingredients.join(","),
      number:               "9",
      addRecipeInformation: "true",
      addRecipeNutrition:        "true",
      fillIngredients:           "true",
      addRecipeInstructions:     "true",
      sort:                 moodParams.sort || "max-used-ingredients",
      maximizeMissingIngredients: "false",
      ignorePantry:         "true",
      ...(cuisine !== "any"       && { cuisine }),
      ...(dietParam               && { diet: dietParam }),
      ...(typeParam               && { type: typeParam }),
      ...(moodParams.maxReadyTime && { maxReadyTime: String(moodParams.maxReadyTime) }),
      ...(moodParams.maxCalories  && { maxCalories:  String(moodParams.maxCalories)  }),
      ...(moodParams.minCalories  && { minCalories:  String(moodParams.minCalories)  }),
      ...(moodParams.minProtein   && { minProtein:   String(moodParams.minProtein)   }),
    })

    const res = await fetch(`${SPOONACULAR_BASE}/recipes/complexSearch?${params}`)
    if (!res.ok) { console.warn("Spoonacular:", res.status); return [] }

    const data = await res.json()
    if (!data.results?.length) return []
    // Only keep recipes where most ingredients are ones the user has
    const filtered = data.results.filter(r => {
    const used   = r.usedIngredientCount || 0
    const missed = r.missedIngredientCount || 0
    // Keep if at least 40% of ingredients are from user's list
    return missed <= used + 2
 })
if (!filtered.length) return []

    return filtered.map((r, i) => ({
      id:             r.id || i + 1,
      title:          r.title || "Untitled",
      readyInMinutes: r.readyInMinutes || null,
      servings:       r.servings       || 2,
      diet:           extractDiet(r),
      image:          r.image          || null,
      emoji:          "🍽️",
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

async function fetchFromGemini({ ingredients, mood, cuisine, diet, meal, apiKey }) {
  try {
    const cuisineText = cuisine === "indian" ? "Indian" : "any cuisine"
    const dietText    = diet === "veg"   ? "strictly vegetarian" :
                        diet === "vegan" ? "strictly vegan"      : "any diet"
    const moodText    = mood || "any style"
    const mealText    = meal !== "any" ? `suitable for ${meal}` : ""

    const prompt = `Generate exactly 6 ${cuisineText} recipes.
User has: ${ingredients.join(", ")}.
Pantry staples: ${PANTRY.join(", ")}.
Requirements: ${dietText}, ${moodText} style${mealText ? ", " + mealText : ""}.
Use ONLY listed ingredients plus pantry staples. Use Indian units: cups, tsp, tbsp.
Respond ONLY with valid JSON array, no markdown.
[{"id":1,"title":"...","readyInMinutes":25,"servings":2,"diet":"vegetarian","ingredients":[{"name":"paneer","amount":1,"unit":"cup"}],"steps":["Step 1."],"nutrition":{"calories":320,"protein":18,"carbs":24,"fat":14},"emoji":"🍛"}]`

    const res = await fetchWithRetry(`${GEMINI_BASE}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
      })
    })

    if (!res.ok) { console.warn("Gemini fallback:", res.status); return [] }

    const data    = await res.json()
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || ""
    const clean   = rawText.replace(/```json/gi,"").replace(/```/g,"").trim()
    const match   = clean.match(/\[[\s\S]*\]/)
    if (!match) {
      console.warn("Gemini: no JSON array found in response")
      console.warn("Raw text:", rawText.slice(0, 300))
      return []
    }

    try {
      return JSON.parse(match[0]).map(r => ({ ...r, source: "gemini" }))
    } catch(parseErr) {
      console.warn("Gemini: JSON parse failed:", parseErr.message)
      console.warn("Matched text:", match[0].slice(0, 300))
      return []
    }

  } catch (err) {
    console.warn("Gemini fallback failed:", err.message)
    return []
  }
}

async function getMoodTip(mood, ingredients, apiKey) {
  try {
    const res = await fetchWithRetry(`${GEMINI_BASE}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `In one short friendly sentence (max 15 words), give a cooking tip for someone feeling "${mood}" who has ${ingredients.slice(0,3).join(", ")}. No preamble.` }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 60 }
      })
    })
    if (!res.ok) return ""
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ""
  } catch { return "" }
}

function extractDiet(r) {
  if (r.vegan)                          return "vegan"
  if (r.vegetarian)                     return "vegetarian"
  if (r.dairyFree && !r.glutenFree)     return "vegetarian"
  // Check title for obvious meat words
  const title = (r.title || "").toLowerCase()
  const meatWords = ["chicken","mutton","beef","pork","fish","prawn","shrimp","lamb","bacon","meat","turkey"]
  const hasMeat = meatWords.some(w => title.includes(w))
  if (!hasMeat) return "vegetarian"
  return "non-vegetarian"
}

function extractIngredients(r) {
  return (r.extendedIngredients || r.usedIngredients || []).map(i => ({
    name:   i.name || i.originalName || "",
    amount: i.amount || 0,
    unit:   i.unit  || i.measures?.metric?.unitShort || ""
  }))
}

function extractSteps(r) {
  // Try analyzed instructions first
  const analyzed = r.analyzedInstructions?.[0]?.steps
  if (analyzed?.length) return analyzed.map(s => s.step)
  
  // Try plain instructions text
  if (r.instructions) {
    return r.instructions
      .replace(/<[^>]*>/g, "")  // strip HTML
      .split(/\.\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 10)
  }

  return ["No steps available — visit the original recipe source for full instructions."]
}

function extractNutrition(r) {
  const n = r.nutrition?.nutrients
  if (!n) return null
  const get = name => Math.round(n.find(x => x.name === name)?.amount || 0)
  return { calories: get("Calories"), protein: get("Protein"), carbs: get("Carbohydrates"), fat: get("Fat") }
}