// ══ RECIPE CACHE (keeps modal working after search) ═══
const recipeCache = {}

function cacheRecipes(recipes) {
  recipes.forEach(r => { recipeCache[r.id] = r })
}

async function getRecipeDetail(id) {
  if (recipeCache[id]) return recipeCache[id]
  throw new Error("Recipe not in cache")
}

// ══ MAIN SEARCH — calls your Vercel backend ═══════════
async function searchRecipes(ingredients, mood, cuisine, diet, meal) {
  const res = await fetch("/api/recipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ingredients, mood, cuisine, diet, meal })
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