// api/recipes.js — Spoonacular primary, Gemini last-resort fallback only

const SPOONACULAR_BASE = "https://api.spoonacular.com"
const GEMINI_BASE      = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

const MOOD_MAP = {
  lazy:    { maxReadyTime: 20, sort: "time" },
  festive: { sort: "popularity", type: "main course", minCalories: "300" },
  healthy: { maxCalories: 400, sort: "healthiness", minProtein: 10 },
  comfort: { sort: "popularity", minCalories: 350, type: "main course" },
  fancy:   { sort: "popularity", minServings: 2 },
  snack:   { maxReadyTime: 15, type: "snack", maxCalories: 300 }
}

const DIET_MAP = { veg: "vegetarian", vegan: "vegan", nonveg: "" }
const MEAL_MAP = { breakfast: "breakfast", lunch: "main course", dinner: "main course", snack: "snack", any: "" }

const PANTRY = ["salt","water","oil","sugar","black pepper",
  "turmeric","red chili powder","cumin seeds","mustard seeds","hing","curry leaves"]

// Translate Indian ingredient names to Spoonacular-friendly names
const INGREDIENT_MAP = {
  "paneer": "cottage cheese", "curd": "yogurt", "dal": "lentils",
  "toor dal": "lentils", "moong dal": "mung beans", "chana dal": "chickpeas",
  "rajma": "kidney beans", "atta": "whole wheat flour", "besan": "chickpea flour",
  "poha": "flattened rice", "suji": "semolina", "methi": "fenugreek",
  "shimla mirch": "bell pepper", "bhindi": "okra", "karela": "bitter melon",
  "lauki": "bottle gourd", "arbi": "taro"
}

function translateIngredients(ingredients) {
  return ingredients.map(i => INGREDIENT_MAP[i.toLowerCase()] || i)
}

const cache = new Map()

async function fetchWithRetry(url, options, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      const res = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timeout)
      if (res.status !== 429) return res
      if (i < retries) await new Promise(r => setTimeout(r, 3000))
    } catch (err) {
      if (i === retries) return { ok: false, status: 500, json: async () => ({}) }
    }
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
  const GEMINI_KEY2     = process.env.GEMINI_KEY2     || ""
  const SPOONACULAR_KEY = process.env.SPOONACULAR_KEY || ""

  if (!SPOONACULAR_KEY && !GEMINI_KEY) {
    return res.status(500).json({ error: "No API keys configured" })
  }

  const { ingredients = [], mood = "", cuisine = "indian", diet = "veg", meal = "any" } = req.body || {}
  if (!ingredients.length) return res.status(400).json({ error: "Ingredients are required" })

  const cacheKey = [ingredients.slice().sort().join(","), mood, cuisine, diet, meal].join("|")
  if (cache.has(cacheKey)) return res.status(200).json(cache.get(cacheKey))

  try {
    // STEP 1: Spoonacular ALWAYS runs first, handles ALL filters
    // Indian cuisine search ignores the cuisine param (sparse Indian data on Spoonacular)
    let recipes = []
    if (SPOONACULAR_KEY) {
      recipes = await fetchFromSpoonacular({ ingredients, mood, cuisine, diet, meal, apiKey: SPOONACULAR_KEY })
    }

    // STEP 2: Gemini ONLY if Spoonacular genuinely failed (< 3 results)
    if (recipes.length < 3 && GEMINI_KEY) {
      const geminiRecipes = await fetchFromGemini({ ingredients, mood, cuisine, diet, meal, apiKey: GEMINI_KEY, backupKey: GEMINI_KEY2 })
      const existingIds = new Set(recipes.map(r => r.id))
      for (const r of geminiRecipes) {
        if (!existingIds.has(r.id)) recipes.push(r)
        if (recipes.length >= 6) break
      }
    }

    const result = { recipes: recipes.slice(0, 6), moodTip: "" }
    if (recipes.length > 0) {
      cache.set(cacheKey, result)
      setTimeout(() => cache.delete(cacheKey), 10 * 60 * 1000)
    }
    return res.status(200).json(result)

  } catch (err) {
    console.error("ChefAI error:", err.message)
    return res.status(500).json({ error: err.message || "Server error" })
  }
}

async function fetchFromSpoonacular({ ingredients, mood, cuisine, diet, meal, apiKey }) {
  try {
    const moodParams = MOOD_MAP[mood] || {}
    const dietParam  = DIET_MAP[diet] || ""
    const typeParam  = MEAL_MAP[meal] || ""
    const finalType  = typeParam || moodParams.type || ""

    const params = new URLSearchParams({
      apiKey,
      includeIngredients:    translateIngredients(ingredients).join(","),
      number:                "9",
      addRecipeInformation:  "true",
      addRecipeNutrition:    "true",
      fillIngredients:       "true",
      addRecipeInstructions: "true",
      sort:                  moodParams.sort || "max-used-ingredients",
      ...(dietParam               && { diet: dietParam }),
      ...(finalType               && { type: finalType }),
      ...(moodParams.maxReadyTime && { maxReadyTime: String(moodParams.maxReadyTime) }),
      ...(moodParams.maxCalories  && { maxCalories:  String(moodParams.maxCalories)  }),
      ...(moodParams.minCalories  && { minCalories:  String(moodParams.minCalories)  }),
      ...(moodParams.minProtein   && { minProtein:   String(moodParams.minProtein)   }),
      ...(moodParams.minServings  && { minServings:  String(moodParams.minServings)  }),
    })
    // NOTE: cuisine param intentionally omitted — Spoonacular's Indian data is too sparse

    const res = await fetch(`${SPOONACULAR_BASE}/recipes/complexSearch?${params}`)
    if (!res.ok) { console.warn("Spoonacular:", res.status); return [] }

    const data = await res.json()
    if (!data.results?.length) return []

    const filtered = data.results.filter(r => {
      const used = r.usedIngredientCount || 0
      const missed = r.missedIngredientCount || 0
      return missed <= used + 2
    })
    if (!filtered.length) return []

    return filtered.map((r, i) => ({
      id: r.id || i + 1,
      title: r.title || "Untitled",
      readyInMinutes: r.readyInMinutes || null,
      servings: r.servings || 2,
      diet: extractDiet(r),
      image: r.image || null,
      emoji: "🍽️",
      ingredients: extractIngredients(r),
      steps: extractSteps(r),
      nutrition: extractNutrition(r),
      source: "spoonacular"
    }))
  } catch (err) {
    console.warn("Spoonacular failed:", err.message)
    return []
  }
}

async function fetchFromGemini({ ingredients, mood, cuisine, diet, meal, apiKey, backupKey }) {
  try {
    const cuisineText = cuisine === "indian" ? "Indian" : "any cuisine"
    const dietText = diet === "veg" ? "strictly vegetarian" : diet === "vegan" ? "strictly vegan" : "any diet"
    const moodText = mood || "any style"
    const mealText = meal !== "any" ? `suitable for ${meal}` : ""

    const prompt = `Generate exactly 6 ${cuisineText} recipes.
User has: ${ingredients.join(", ")}.
Pantry staples: ${PANTRY.join(", ")}.
Requirements: ${dietText}, ${moodText} style${mealText ? ", " + mealText : ""}.
Use ONLY listed ingredients plus pantry staples. Use Indian units: cups, tsp, tbsp.
Respond ONLY with valid JSON array, no markdown.
[{"id":1,"title":"...","readyInMinutes":25,"servings":2,"diet":"vegetarian","ingredients":[{"name":"paneer","amount":1,"unit":"cup"}],"steps":["Step 1."],"nutrition":{"calories":320,"protein":18,"carbs":24,"fat":14},"emoji":"🍛"}]`

    let data = await tryGemini(prompt, apiKey)
    if (!data && backupKey) data = await tryGemini(prompt, backupKey)
    if (!data) return []

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || ""
    const clean = rawText.replace(/```json/gi,"").replace(/```/g,"").trim()
    const match = clean.match(/\[[\s\S]*\]/)
    if (!match) return []

    return JSON.parse(match[0]).map(r => ({ ...r, source: "gemini" }))
  } catch (err) {
    console.warn("Gemini fallback failed:", err.message)
    return []
  }
}

async function tryGemini(prompt, key) {
  try {
    const res = await fetchWithRetry(`${GEMINI_BASE}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
      })
    })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

function extractDiet(r) {
  if (r.vegan) return "vegan"
  if (r.vegetarian) return "vegetarian"
  const title = (r.title || "").toLowerCase()
  const meatWords = ["chicken","mutton","beef","pork","fish","prawn","shrimp","lamb","bacon","meat","turkey"]
  return meatWords.some(w => title.includes(w)) ? "non-vegetarian" : "vegetarian"
}

function extractIngredients(r) {
  return (r.extendedIngredients || r.usedIngredients || []).map(i => ({
    name: i.name || i.originalName || "",
    amount: i.amount || 0,
    unit: i.unit || i.measures?.metric?.unitShort || ""
  }))
}

function extractSteps(r) {
  const analyzed = r.analyzedInstructions?.[0]?.steps
  if (analyzed?.length) return analyzed.map(s => s.step)
  if (r.instructions) {
    return r.instructions.replace(/<[^>]*>/g, "").split(/\.\s+/).map(s => s.trim()).filter(s => s.length > 10)
  }
  return ["No steps available — visit the original recipe source for full instructions."]
}

function extractNutrition(r) {
  const n = r.nutrition?.nutrients
  if (!n) return null
  const get = name => Math.round(n.find(x => x.name === name)?.amount || 0)
  return { calories: get("Calories"), protein: get("Protein"), carbs: get("Carbohydrates"), fat: get("Fat") }
}