const API_KEY = "ADD_YOUR_API_KEY" 
const BASE    = "https://api.spoonacular.com"

const MOOD_MAP = {
  lazy:    { maxReadyTime: 20 },
  festive: { cuisine: "Indian" },
  healthy: { diet: "vegetarian", maxCalories: 400 },
  comfort: { cuisine: "Indian", type: "main course" },
  fancy:   { sort: "popularity" },
  snack:   { type: "snack", maxReadyTime: 15 }
}

async function searchRecipes(ingredients, mood) {
  // 1. build ingredient string
  const ingString = ingredients.join(",")

  // 2. get mood params (empty object if no mood selected)
  const moodParams = MOOD_MAP[mood] || {}

  // 3. build query params
  const params = new URLSearchParams({
    apiKey:      API_KEY,
    ingredients: ingString,
    number:      6,          // how many recipes to return
    ranking:     2,          // maximize used ingredients
    ignorePantry: true,
    ...moodParams
  })

  // 4. fetch from Spoonacular
  const res = await fetch(`${BASE}/recipes/findByIngredients?${params}`)

  // 5. check for errors
  if (!res.ok) throw new Error("API call failed: " + res.status)

  // 6. parse and return JSON
  const data = await res.json()
  return data
}