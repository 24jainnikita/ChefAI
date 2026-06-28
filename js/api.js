// ══ RECIPE CACHE (keeps modal working after search) ═══
const recipeCache = {}

function cacheRecipes(recipes) {
  recipes.forEach(r => { recipeCache[r.id] = r })
}

async function getRecipeDetail(id) {
  if (recipeCache[id]) return recipeCache[id]

  // Check localStorage favourites as fallback after refresh
  const saved = JSON.parse(localStorage.getItem("chefai-favs") || "[]")
  const found = saved.find(r => r.id === id)
  if (found) {
    recipeCache[id] = found  // re-populate cache
    return found
  }

  throw new Error("Recipe not in cache — search again to reload")
}

// ══ MAIN SEARCH — calls your Vercel backend ═══════════
async function searchRecipes(ingredients, mood, cuisine, diet, meal, pantry = []) {
  const res = await fetch("/api/recipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ingredients, mood, cuisine, diet, meal, pantry })
  })

  if (!res.ok) {
    let msg = `Backend error: ${res.status}`
    try {
      const err = await res.json()
      msg = err.error || msg
    } catch {}
    throw new Error(msg)
  }

  const data = await res.json()
  return data.recipes || []
}