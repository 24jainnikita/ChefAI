// ══ STATE ════════════════════════════════════════════
let ingredients   = []
let selectedMood  = ""
let selectedCuis  = "indian"
let selectedDiet  = "veg"
let selectedMeal  = "any"
let favourites    = JSON.parse(localStorage.getItem("chefai-favs") || "[]")
let currentServings = 2
let baseServings    = 2
let currentRecipe   = null

// ══ KITCHEN STAPLES (assumed pantry) ═════════════════
// Mirrors the documented basic-staples list. When the toggle is on, these are
// sent as pantry items so recipes are never penalised for needing them.
const KITCHEN_STAPLES = [
  "salt", "oil", "water", "turmeric", "red chili powder",
  "coriander powder", "garam masala", "cumin", "black pepper"
]
let assumeStaples = JSON.parse(localStorage.getItem("chefai-staples") ?? "true")
function toggleStaples(el) {
  assumeStaples = !!(el && el.checked)
  localStorage.setItem("chefai-staples", JSON.stringify(assumeStaples))
}
// Sync the checkbox with the saved preference (scripts run after the DOM).
;(function () {
  const c = document.getElementById("staples-toggle")
  if (c) c.checked = assumeStaples
})()

// Remembers the last search so the AI fallback can reuse the exact same inputs.
let lastSearch = null

// ══ CLICK SOUND ══════════════════════════════════════
const clickSound = new Audio("/assets/sounds/click.mp3");
clickSound.preload = "auto";
clickSound.volume = 0.5;

// Button click sound
function playClick() {
  try {
    clickSound.currentTime = 0;
    clickSound.play().catch(() => {});
  } catch (e) {}
}

// Add ingredient sound (uses the same MP3)
function playAdd() {
  try {
    clickSound.currentTime = 0;
    clickSound.play().catch(() => {});
  } catch (e) {}
}

// ══ PAGE SWITCHING ═══════════════════════════════════
function showPage(name, el) {
  playClick()
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"))
  document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"))
  document.getElementById("page-" + name).classList.add("active")
  if (el) el.classList.add("active")
  if (name === "favourites") renderFavourites()
}

// ══ INGREDIENTS ══════════════════════════════════════
function addIngredient(raw) {
  const parts = raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
  let added = 0
  parts.forEach(val => {
    if (val && !ingredients.includes(val)) { ingredients.push(val); added++ }
  })
  if (added) { renderTags(); playAdd() }
  document.getElementById("ing-input").focus()
}

function removeIngredient(name) {
  playClick()
  ingredients = ingredients.filter(i => i !== name)
  renderTags()
}

function renderTags() {
  const c = document.getElementById("tag-container")
  c.innerHTML = ingredients.map(ing => `
    <div class="tag">
      ${ing}
      <span class="tag-x" onclick="removeIngredient('${escStr(ing)}')">✕</span>
    </div>`).join("")
}

// ══ QUICK ADD ════════════════════════════════════════
function toggleCat(el) {
  playClick()
  el.classList.toggle("open")
  el.nextElementSibling.classList.toggle("open")
}

function quickAdd(el) {
  const val = el.textContent.trim().toLowerCase()
  if (!ingredients.includes(val)) {
    ingredients.push(val)
    renderTags()
    el.classList.add("added")
    playAdd()
  } else {
    ingredients = ingredients.filter(i => i !== val)
    renderTags()
    el.classList.remove("added")
    playClick()
  }
}

// ══ MOOD ═════════════════════════════════════════════
function selectMood(mood, el) {
  playClick()
  if (selectedMood === mood) {
    selectedMood = ""
    el.classList.remove("sel")
    return
  }
  selectedMood = mood
  document.querySelectorAll(".mood-btn").forEach(b => b.classList.remove("sel"))
  el.classList.add("sel")
}

// ══ CUISINE ══════════════════════════════════════════
function setCuisine(val, el) {
  playClick()
  selectedCuis = val
  document.querySelectorAll(".tog-btn[id^='btn-indian'], .tog-btn[id^='btn-any']").forEach(b => b.classList.remove("active"))
  el.classList.add("active")
}

// ══ DIET ═════════════════════════════════════════════
function setDiet(val, el) {
  playClick()
  selectedDiet = val
  document.querySelectorAll(".diet-btn").forEach(b => b.classList.remove("active"))
  el.classList.add("active")
}

// ══ MEAL ═════════════════════════════════════════════
function setMeal(val, el) {
  playClick()
  selectedMeal = val
  document.querySelectorAll(".meal-btn").forEach(b => b.classList.remove("active"))
  el.classList.add("active")
}

// ══ FIND RECIPES ═════════════════════════════════════
async function findRecipes() {
  if (ingredients.length === 0) {
    showToast("🌿 Add at least one ingredient first!")
    document.getElementById("ing-input").focus()
    return
  }
  playClick()

  const btn  = document.getElementById("btn-find")
  const grid = document.getElementById("recipe-grid")
  const hdr  = document.getElementById("results-header")
  const lbl  = document.getElementById("results-label")

  btn.classList.add("loading")
  btn.innerHTML = `<span class="spinner"></span> Asking ChefAI…`
  hdr.style.display = "flex"
  lbl.textContent   = "ChefAI is cooking up ideas…"
  grid.innerHTML    = Array(6).fill('<div class="skeleton"></div>').join("")
  document.getElementById("results-section")?.scrollIntoView({ behavior:"smooth", block:"start" })

  try {
    const pantry = assumeStaples ? KITCHEN_STAPLES : []
    lastSearch = {
      ingredients: [...ingredients], pantry, quantities: {},
      mood: selectedMood, cuisine: selectedCuis, diet: selectedDiet, meal: selectedMeal
    }
    const recipes = await searchRecipes(ingredients, selectedMood, selectedCuis, selectedDiet, selectedMeal, pantry)
    cacheRecipes(recipes)

    if (!recipes || recipes.length === 0) {
      lbl.textContent = "No strong match"
      grid.innerHTML  = emptyState("🍽️","No close matches found","Try the custom recipe option below, or tweak your ingredients")
      appendGenerateCard()
      return
    }

    lbl.textContent = `${recipes.length} recipes crafted for you`
    renderRecipes(recipes, grid)

    // AI is offered ONLY when nothing scored a Good/Excellent match.
    if (!hasStrongMatch(recipes)) appendGenerateCard()

  } catch(err) {
    lbl.textContent = "Error"
    if (err.message.includes("429")) {
      grid.innerHTML = emptyState("⏳","Too many requests","Wait 30 seconds and try again")
    } else if (err.message.includes("JSON")) {
      grid.innerHTML = emptyState("⚠️","Unexpected response","Try again — AI sometimes needs a retry!")
    } else {
      grid.innerHTML = emptyState("⚠️",err.message || "Something went wrong","Check console for details")
    }
    console.error(err)
  } finally {
    btn.classList.remove("loading")
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M8 3Q12 3 12.5 8Q13 12 9 13Q5.5 14 3.5 11Q1.5 8 4 5.5Q5.5 3 8 3Z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M12 12 L16 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Find My Recipes`
  }
}

function emptyState(icon, title, hint) {
  return `<div class="empty-state">
    <div class="empty-icon">${icon}</div>
    <p class="empty-title">${title}</p>
    <p class="empty-hint">${hint}</p>
  </div>`
}

// ══ CHEFAI MATCH — transparency helpers ══════════════
// All derived purely from the existing search result fields (matchScore,
// matchedIngredients, missingIngredients, diet, mealType, moods, readyInMinutes).
// Nothing is recalculated and no extra requests are made.
function chefMatchMeta(score) {
  const pct = Math.round((Number(score) || 0) * 100)
  if (pct >= 90) return { pct, label: "Excellent Match", emoji: "🟢", cls: "exc" }
  if (pct >= 75) return { pct, label: "Good Match",      emoji: "🟡", cls: "good" }
  if (pct >= 60) return { pct, label: "Partial Match",   emoji: "🟠", cls: "part" }
  return { pct, label: "Weak Match", emoji: "⚪", cls: "weak" }
}

// The match percentage + level + progress bar. Returns "" when no score exists.
function matchBlockHtml(r) {
  if (typeof r.matchScore !== "number" || !isFinite(r.matchScore)) return ""
  const m = chefMatchMeta(r.matchScore)
  return `
    <div class="match-block ${m.cls}">
      <div class="match-top">
        <span class="match-label">ChefAI Match</span>
        <span class="match-pct">${m.pct}%</span>
      </div>
      <div class="match-bar"><span style="width:${m.pct}%"></span></div>
      <div class="match-level">${m.emoji} ${m.label}</div>
    </div>`
}

const MOOD_WORD = { lazy: "quick", festive: "festive", healthy: "healthy", comfort: "comfort", fancy: "fancy", snack: "snack" }

// Build only TRUE explanation statements from the recipe's data.
function whyBullets(r) {
  const out = []
  const userCount = Array.isArray(ingredients) ? ingredients.length : 0
  const matched   = Array.isArray(r.matchedIngredients) ? r.matchedIngredients.length : 0

  if (matched > 0) {
    if (userCount > 0 && matched >= userCount) out.push("Uses all your ingredients")
    else if (userCount > 0)                    out.push(`Uses ${matched} of your ${userCount} ingredients`)
    else                                       out.push(`Uses ${matched} of your ingredients`)
  }
  if (selectedMood && Array.isArray(r.moods) && r.moods.includes(selectedMood))
    out.push(`Perfect for your ${MOOD_WORD[selectedMood] || selectedMood} mood`)
  if (selectedMeal && selectedMeal !== "any" && Array.isArray(r.mealType) && r.mealType.includes(selectedMeal))
    out.push(`Great for ${selectedMeal}`)
  if (r.diet)
    out.push(r.diet.includes("vegan") ? "Vegan" : r.diet.includes("veg") ? "Vegetarian" : "Non-vegetarian")
  if (r.readyInMinutes)
    out.push(r.readyInMinutes <= 20 ? `Ready in just ${r.readyInMinutes} minutes` : `Ready in ${r.readyInMinutes} minutes`)

  return out
}

function whyHtml(r, max) {
  const bullets = whyBullets(r)
  if (!bullets.length) return ""
  const items = (max ? bullets.slice(0, max) : bullets)
    .map(x => `<li>${escStr(x)}</li>`).join("")
  return `<div class="why-block"><div class="why-title">Why this recipe?</div><ul class="why-list">${items}</ul></div>`
}

// Matched / missing ingredient chips for the modal.
function matchChipsHtml(r) {
  let html = ""
  const matched = r.matchedIngredients || []
  const missing = r.missingIngredients || []
  if (matched.length)
    html += `<div class="modal-section">You already have</div><div class="match-chips">${matched.map(n => `<span class="match-chip have">✓ ${escStr(n)}</span>`).join("")}</div>`
  if (missing.length)
    html += `<div class="modal-section">You might need</div><div class="match-chips">${missing.map(n => `<span class="match-chip need">+ ${escStr(n)}</span>`).join("")}</div>`
  return html
}

// ══ RENDER CARDS ═════════════════════════════════════
function recipeCardHtml(r, i) {
  const fav      = favourites.some(f => f.id === r.id)
  const dietIcon = r.diet?.includes("vegan") ? "🌱" :
                   r.diet?.includes("veg")   ? "🟢" : "🔴"
  const imgHtml  = r.image
    ? `<img src="${r.image}" alt="${escStr(r.title)}"
         onload="this.style.opacity=1"
         onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
         style="opacity:0;transition:opacity .4s;width:100%;height:100%;object-fit:cover" loading="lazy"/>
       <div class="card-img-fallback">${r.emoji || "🍽️"}</div>`
    : `<div class="card-img-fallback" style="display:flex">${r.emoji || "🍽️"}</div>`
  const aiBadge = r.aiGenerated ? `<span class="ai-badge">✨ AI Generated</span>` : ""

  return `
    <div class="recipe-card" style="animation-delay:${i*.07}s" onclick="openRecipe(${r.id})">
      <div class="card-img">
        ${imgHtml}
        <span class="diet-dot" title="${r.diet || ""}">${dietIcon}</span>
        ${aiBadge}
        <button class="card-heart ${fav?"loved":""}"
          onclick="event.stopPropagation();quickFav(${r.id},'${escStr(r.title)}',${JSON.stringify(r.image||"")},this)"
          title="${fav?"Remove":"Save"}">
          ${fav?"♥":"♡"}
        </button>
      </div>
      <div class="card-body">
        <div class="card-title">${r.title}</div>
        ${matchBlockHtml(r)}
        ${whyHtml(r, 3)}
        <div class="card-meta">
          ${r.readyInMinutes ? `<span class="badge">⏱ ${r.readyInMinutes} min</span>` : ""}
          ${r.servings ? `<span class="badge">🍽 ${r.servings} serves</span>` : ""}
          ${r.nutrition?.calories ? `<span class="badge">🔥 ${r.nutrition.calories} cal</span>` : ""}
        </div>
      </div>
    </div>`
}

function renderRecipes(recipes, container) {
  container.innerHTML = recipes.map((r, i) => recipeCardHtml(r, i)).join("")
}

// ══ AI FALLBACK — offer a custom recipe only after weak matches ═══════
// A result is "strong" if any recipe is a Good (≥75%) or Excellent (≥90%) match.
function hasStrongMatch(recipes) {
  return recipes.some(r => typeof r.matchScore === "number" && r.matchScore >= 0.75)
}

// Suggestion card shown when no strong match exists (does NOT call AI yet).
function appendGenerateCard() {
  const grid = document.getElementById("recipe-grid")
  if (!grid || document.getElementById("generate-card")) return
  grid.insertAdjacentHTML("beforeend", `
    <div class="generate-card" id="generate-card">
      <div class="generate-inner">
        <div class="generate-spark">✨</div>
        <p class="generate-title">Couldn't find the perfect recipe?</p>
        <p class="generate-sub">I can create a completely new recipe from your ingredients and preferences.</p>
        <button class="btn-find generate-btn" type="button" onclick="generateCustomRecipe(this)">✨ Generate Custom Recipe</button>
      </div>
    </div>`)
}

// Called ONLY when the user clicks the button. One click → one recipe.
async function generateCustomRecipe(btn) {
  if (!lastSearch) return
  btn.disabled = true
  btn.innerHTML = `<span class="spinner"></span> Creating your recipe…`
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lastSearch)
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.recipe) throw new Error((data && data.error) || "generation failed")

    const recipe = data.recipe
    cacheRecipes([recipe])
    const card = document.getElementById("generate-card")
    if (card) card.remove()
    const grid = document.getElementById("recipe-grid")
    grid.insertAdjacentHTML("afterbegin", recipeCardHtml(recipe, 0))
    const lbl = document.getElementById("results-label")
    if (lbl) lbl.textContent = "Your custom recipe is ready ✨"
    showToast("✨ Created a custom recipe just for you!")
  } catch (err) {
    const card = document.getElementById("generate-card")
    if (card) {
      card.querySelector(".generate-inner").innerHTML =
        `<div class="generate-spark">😔</div>
         <p class="generate-title">Couldn't create a recipe right now</p>
         <p class="generate-sub">I'm unable to generate a custom recipe at the moment. You can still explore the recipes ChefAI recommended above.</p>`
    }
    console.error("Generate failed:", err.message)
  }
}


// ══ MODAL ════════════════════════════════════════════
async function openRecipe(id) {
  playClick()
  const overlay = document.getElementById("modal-overlay")
  const body    = document.getElementById("modal-body")
  overlay.classList.add("open")
  document.body.style.overflow = "hidden"

  body.innerHTML = `
    <div class="skeleton" style="height:220px;border-radius:12px;margin-bottom:18px"></div>
    <div class="skeleton" style="height:28px;width:60%;border-radius:6px;margin-bottom:10px"></div>
    <div class="skeleton" style="height:100px;border-radius:8px"></div>`

  try {
    const d = await getRecipeDetail(id)
    currentRecipe   = d
    baseServings    = d.servings || 2
    currentServings = baseServings

    const fav      = favourites.some(f => f.id === id)
    const dietIcon = d.diet?.includes("vegan") ? "🌱 Vegan" :
                     d.diet?.includes("veg")   ? "🟢 Vegetarian" : "🔴 Non-veg"

    const imgHtml = d.image
      ? `<img class="modal-img" src="${d.image}" alt="${escStr(d.title)}" onerror="this.style.display='none'"/>`
      : `<div class="modal-img-fallback">${d.emoji || "🍽️"}</div>`

    body.innerHTML = `
      ${imgHtml}
      <h2 class="modal-title">${d.title}</h2>
      <div class="modal-badges">
        ${d.readyInMinutes ? `<span class="badge">⏱ ${d.readyInMinutes} min</span>` : ""}
        ${d.servings ? `<span class="badge">🍽 ${d.servings} servings</span>` : ""}
        <span class="badge">${dietIcon}</span>
        ${selectedCuis === "indian" ? `<span class="badge">🇮🇳 Indian</span>` : ""}
      </div>

      ${matchBlockHtml(d)}
      ${d.aiGenerated ? `<div class="ai-note"><span class="ai-note-tag">✨ AI Generated</span><span class="ai-note-text">Created for you because no strong recipe match was available.</span></div>` : ""}
      ${whyHtml(d)}
      ${matchChipsHtml(d)}

      ${d.nutrition ? `
      <div class="modal-section">Nutrition per serving</div>
      <div class="nutri-grid">
        <div class="nutri-box"><div class="nutri-val">${d.nutrition.calories||"—"}</div><div class="nutri-lbl">Calories</div></div>
        <div class="nutri-box"><div class="nutri-val">${d.nutrition.protein||"—"}g</div><div class="nutri-lbl">Protein</div></div>
        <div class="nutri-box"><div class="nutri-val">${d.nutrition.carbs||"—"}g</div><div class="nutri-lbl">Carbs</div></div>
        <div class="nutri-box"><div class="nutri-val">${d.nutrition.fat||"—"}g</div><div class="nutri-lbl">Fat</div></div>
      </div>` : ""}

      <div class="modal-section">Serving size</div>
      <div class="scaler">
        <button class="scaler-btn" onclick="changeServings(-1)">−</button>
        <span class="scaler-num" id="modal-servings">${currentServings}</span>
        <button class="scaler-btn" onclick="changeServings(1)">+</button>
        <span class="scaler-lbl">servings</span>
      </div>

      ${d.ingredients?.length ? `
      <div class="modal-section">Ingredients</div>
      <ul class="ing-list" id="modal-ing-list">
        ${renderIngList(d.ingredients, currentServings, baseServings)}
      </ul>` : ""}

      ${d.optionalIngredients?.length ? `
      <div class="modal-section">Optional additional ingredients</div>
      <ul class="ing-list ing-list-opt">
        ${d.optionalIngredients.map(i => `<li>${i.amount ? `<strong>${i.amount} ${i.unit||""}</strong>` : ""} ${i.name}</li>`).join("")}
      </ul>` : ""}

      ${d.steps?.length ? `
      <div class="modal-section">Steps</div>
      <ol class="steps-list">
        ${d.steps.map((s,i) => `
          <li class="step-item">
            <div class="step-num">${i+1}</div>
            <div class="step-text">${s}</div>
          </li>`).join("")}
      </ol>` : ""}

      <div class="modal-section">Pantry staples assumed</div>
      <p style="font-family:'Outfit',sans-serif;font-size:13px;color:var(--ink-lt);font-style:italic;line-height:1.7">
        Salt, water, oil, sugar, turmeric, red chili powder, cumin seeds, black pepper — assumed available in your kitchen.
      </p>

      <div class="modal-actions">
        <button class="m-btn ${fav?"primary":""}" id="fav-modal-btn"
          onclick="toggleFavModal(${d.id},'${escStr(d.title)}','${escStr(d.image||"")}')">
          ${fav ? "♥ Saved" : "♡ Save recipe"}
        </button>
        <button class="m-btn" onclick="planFromModal('${escStr(d.title)}')">📅 Add to plan</button>
        <button class="m-btn" onclick="generateShoppingList()">🛒 Shopping list</button>
      </div>`

  } catch(err) {
    body.innerHTML = emptyState("⚠️","Could not load recipe","Try clicking the recipe again")
    console.error(err)
  }
}

function closeModal(e) {
  if (e && e.target !== document.getElementById("modal-overlay")) return
  playClick()
  document.getElementById("modal-overlay").classList.remove("open")
  document.body.style.overflow = ""
}

function changeServings(delta) {
  playClick()
  const next = Math.max(1, Math.min(30, currentServings + delta))
  currentServings = next
  document.getElementById("modal-servings").textContent = next
  const list = document.getElementById("modal-ing-list")
  if (list && currentRecipe?.ingredients) {
    list.innerHTML = renderIngList(currentRecipe.ingredients, next, baseServings)
  }
}

function renderIngList(ings, target, base) {
  const ratio = target / (base || 2)
  return ings.map(ing => {
    const raw = parseFloat(ing.amount) || 0
    const amt = raw ? raw * ratio : 0
    const display = amt ? (amt < 10 ? parseFloat(amt.toFixed(1)) : Math.round(amt)) : ""
    return `<li>${display ? `<strong>${display} ${ing.unit||""}</strong>` : ""} ${ing.name}</li>`
  }).join("")
}

// ══ SHOPPING LIST ════════════════════════════════════
function generateShoppingList() {
  if (!currentRecipe?.ingredients) return
  const owned  = new Set(ingredients.map(i => i.toLowerCase()))
  const missing = currentRecipe.ingredients.filter(ing => !owned.has(ing.name.toLowerCase()))
  if (missing.length === 0) { showToast("✅ You have everything needed!"); return }
  const list = missing.map(i => `• ${i.amount} ${i.unit} ${i.name}`).join("\n")
  alert(`🛒 Shopping list for "${currentRecipe.title}":\n\n${list}`)
}

// ══ FAVOURITES ═══════════════════════════════════════
function quickFav(id, title, image, btn) {
  playClick()
  const idx = favourites.findIndex(f => f.id === id)
  const fullRecipe = recipeCache[id] || { id, title, image }
  if (idx === -1) {
    favourites.push(fullRecipe)
    btn.classList.add("loved"); btn.textContent = "♥"
    showToast("❤ Saved to favourites!")
    if (currentUser) saveFavToFirestore(fullRecipe)
  } else {
    favourites.splice(idx, 1)
    btn.classList.remove("loved"); btn.textContent = "♡"
    showToast("Removed from favourites")
    if (currentUser) removeFavFromFirestore(id)
  }
  saveFavs()
}

function toggleFavModal(id, title, image) {
  playClick()
  const idx = favourites.findIndex(f => f.id === id)
  const btn = document.getElementById("fav-modal-btn")
  const fullRecipe = recipeCache[id] || { id, title, image }
  if (idx === -1) {
    favourites.push(fullRecipe)
    btn.className = "m-btn primary"; btn.textContent = "♥ Saved"
    showToast("❤ Saved to favourites!")
    if (currentUser) saveFavToFirestore(fullRecipe)
  } else {
    favourites.splice(idx, 1)
    btn.className = "m-btn"; btn.textContent = "♡ Save recipe"
    showToast("Removed from favourites")
    if (currentUser) removeFavFromFirestore(id)
  }
  saveFavs()
}

function saveFavs() {
  localStorage.setItem("chefai-favs", JSON.stringify(favourites))
  // Firestore sync handled per-action in quickFav and toggleFavModal
}

function renderFavourites() {
  const g = document.getElementById("fav-grid")
  // Update header with count
const header = document.querySelector("#page-favourites .inner-title")
if (header) header.innerHTML = `Your <em>Cookbook</em> <span style="font-size:16px;color:var(--gold);font-family:'Outfit',sans-serif;font-weight:500">· ${favourites.length} recipes</span>`
  if (!favourites.length) {
    g.innerHTML = emptyState("🤍","No favourites yet","Heart a recipe on Discover to save it here")
    return
  }
  g.innerHTML = favourites.map((r, i) => `
    <div class="recipe-card" style="animation-delay:${i*.06}s" onclick="openRecipe(${r.id})">
      <div class="card-img">
        ${r.image
          ? `<img src="${r.image}" alt="${escStr(r.title)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" style="width:100%;height:100%;object-fit:cover" loading="lazy"/>
             <div class="card-img-fallback">🍽️</div>`
          : `<div class="card-img-fallback" style="display:flex">🍽️</div>`}
        <button class="card-heart loved"
          onclick="event.stopPropagation();quickFav(${r.id},'${escStr(r.title)}','${escStr(r.image||"")}',this);renderFavourites()">♥</button>
      </div>
      <div class="card-body"><div class="card-title">${r.title}</div></div>
    </div>`).join("")
}

// ══ MEAL PLANNER ═════════════════════════════════════
function planFromModal(title) {
  const days  = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
  const day   = prompt(`Add "${title}" to which day?\n\nType: ${days.join(", ")}`)
  if (!day) return
  const match = days.find(d => d.toLowerCase() === day.trim().toLowerCase())
  if (!match) { showToast("Invalid day — try Mon, Tue, Wed…"); return }
  const slot = document.getElementById("plan-" + match)
  if (slot) { slot.textContent = title; slot.className = "plan-slot filled" }
  document.getElementById("modal-overlay").classList.remove("open")
  document.body.style.overflow = ""
  showPage("planner", document.querySelectorAll(".nav-link")[2])
  showToast(`📅 Added to ${match}!`)
}

// ══ TOAST ════════════════════════════════════════════
function showToast(msg) {
  const t = document.getElementById("toast")
  t.textContent = msg
  t.classList.add("show")
  clearTimeout(t._timer)
  t._timer = setTimeout(() => t.classList.remove("show"), 2600)
}

// ══ KEYBOARD ═════════════════════════════════════════
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    document.getElementById("modal-overlay").classList.remove("open")
    document.body.style.overflow = ""
  }
})

// ══ HELPERS ══════════════════════════════════════════
function escStr(s) {
  return String(s||"").replace(/\\/g,"\\\\").replace(/'/g,"\\'").replace(/"/g,'\\"')
}

// ══ MEAL PLAN PERSISTENCE ════════════════════════════
function savePlan() {
  const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
  const plan = {}
  days.forEach(d => {
    const slot = document.getElementById("plan-" + d)
    if (slot && slot.classList.contains("filled")) {
      plan[d] = slot.textContent
    }
  })
  localStorage.setItem("chefai-plan", JSON.stringify(plan))
}

function loadPlan() {
  const plan = JSON.parse(localStorage.getItem("chefai-plan") || "{}")
  Object.entries(plan).forEach(([day, title]) => {
    const slot = document.getElementById("plan-" + day)
    if (slot) {
      slot.textContent = title
      slot.className = "plan-slot filled"
    }
  })
}

loadPlan()

// ══ AUTH STATE LISTENER ═══════════════════════════════════
firebase.auth().onAuthStateChanged(async (user) => {
  currentUser = user

  const authBtn   = document.getElementById("auth-btn")
  const authLabel = document.getElementById("auth-label")

  if (user) {
    // User signed in
    authLabel.innerHTML = user.photoURL
      ? `<img src="${user.photoURL}" class="auth-avatar" alt="${user.displayName}"/> ${user.displayName?.split(" ")[0] || "You"}`
      : `👤 ${user.displayName?.split(" ")[0] || "You"}`

    authBtn.classList.add("signed-in")
    saveUserProfile(user)

    // Load Firestore favourites
    const firestoreFavs = await loadFavsFromFirestore()
    if (firestoreFavs && firestoreFavs.length > 0) {
      favourites = firestoreFavs
      saveFavs() // sync to localStorage too
      showToast(`Welcome back! ${firestoreFavs.length} recipes in your cookbook.`)
    } else {
      // First sign-in — migrate localStorage favs
      const localFavs = JSON.parse(localStorage.getItem("chefai-favs") || "[]")
      if (localFavs.length > 0) {
        await migrateLocalFavsToFirestore(localFavs)
        showToast("Your favourites have been synced to the cloud! ☁️")
      }
    }

  } else {
    // User signed out
    currentUser = null
    authLabel.innerHTML = "Sign in"
    authBtn.classList.remove("signed-in")
    // Fall back to localStorage
    favourites = JSON.parse(localStorage.getItem("chefai-favs") || "[]")
  }
})

// ══ AUTH BUTTON CLICK ══════════════════════════════════════
function handleAuthClick() {
  if (currentUser) {
    if (confirm(`Sign out of ChefAI?`)) signOut()
  } else {
    signInWithGoogle()
  }
}

// ══ VISION — PHOTO INGREDIENT DETECTION ══════════════════════════════
// Detects ingredients from a photo, lets the user review/edit them, then
// feeds the confirmed names into the EXISTING manual flow (addIngredient +
// findRecipes). No new search pipeline is created.

// Escape a value for safe use inside an HTML attribute.
function escAttr(s) {
  return String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;").replace(/"/g, "&quot;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// Open the vision modal in its initial (upload) state.
function openVision() {
  playClick()
  resetVision()
  const ov = document.getElementById("vision-overlay")
  ov.classList.add("open")
  document.body.style.overflow = "hidden"
}

function closeVision(e) {
  if (e && e.target !== document.getElementById("vision-overlay")) return
  stopCamera()
  document.getElementById("vision-overlay").classList.remove("open")
  document.body.style.overflow = ""
}

// Reset modal sections back to the starting state.
function resetVision() {
  stopCamera()
  document.getElementById("vision-upload-area").style.display = ""
  const cam = document.getElementById("vision-camera")
  if (cam) cam.style.display = "none"
  document.getElementById("vision-preview-wrap").style.display = "none"
  document.getElementById("vision-loading").style.display = "none"
  document.getElementById("vision-results").style.display = "none"
  document.getElementById("vision-rows").innerHTML = ""
  showVisionError("")
  document.getElementById("vision-preview").src = ""
}

// Show (or clear) the error panel. When shown, include a one-click escape to
// manual entry so the recipe-search flow is never blocked.
function showVisionError(msg) {
  const el = document.getElementById("vision-error")
  if (!msg) { el.style.display = "none"; el.innerHTML = ""; return }
  el.innerHTML = `${msg}<br/><button class="vision-manual-btn" type="button" onclick="visionToManual()">Enter ingredients manually</button>`
  el.style.display = "block"
}

function visionToManual() {
  closeVision()
  document.getElementById("ing-input").focus()
  showToast("✍️ Add your ingredients manually")
}

// Downscale + compress the chosen image to a JPEG data URL before upload.
function compressImage(file, maxDim = 1024, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = e => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        let { width, height } = img
        if (width > height && width > maxDim) {
          height = Math.round(height * maxDim / width); width = maxDim
        } else if (height > maxDim) {
          width = Math.round(width * maxDim / height); height = maxDim
        }
        const canvas = document.createElement("canvas")
        canvas.width = width; canvas.height = height
        canvas.getContext("2d").drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL("image/jpeg", quality))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

// File chosen → compress → run the SHARED detection pipeline.
async function handleVisionFile(event) {
  const file = event.target.files && event.target.files[0]
  event.target.value = "" // allow re-selecting the same file later
  if (!file) return

  showVisionError("")
  let dataUrl
  try {
    dataUrl = await compressImage(file)
  } catch (_) {
    showVisionError("Couldn't read that image. Try another photo.")
    return
  }
  runVisionDetection(dataUrl)
}

// ── SHARED Vision pipeline ───────────────────────────────────────────────────
// Both Upload Image and Scan Pantry (camera) funnel a compressed JPEG data URL
// through here, so there is exactly ONE Vision detection path and ONE request
// format ({ image: dataUrl }) hitting the existing /api/vision endpoint.
async function runVisionDetection(dataUrl) {
  stopCamera() // ensure the live camera is off once we have a frame

  document.getElementById("vision-preview").src = dataUrl
  document.getElementById("vision-preview-wrap").style.display = "block"
  document.getElementById("vision-upload-area").style.display = "none"
  const cam = document.getElementById("vision-camera")
  if (cam) cam.style.display = "none"
  document.getElementById("vision-results").style.display = "none"
  document.getElementById("vision-loading").style.display = "flex"

  try {
    const res = await fetch("/api/vision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl })
    })
    const data = await res.json().catch(() => ({}))
    document.getElementById("vision-loading").style.display = "none"

    if (!res.ok) {
      showVisionError((data && data.error) || "Vision couldn't process that image.")
      return
    }
    const ings = (data && data.ingredients) || []
    if (!ings.length) {
      showVisionError("No ingredients detected. Try a clearer photo, or add them manually.")
      return
    }

    renderVisionRows(ings)
    document.getElementById("vision-results").style.display = "block"
  } catch (err) {
    document.getElementById("vision-loading").style.display = "none"
    showVisionError("Couldn't reach Vision right now. You can add ingredients manually.")
  }
}

// ── Native camera capture (Scan Pantry) ──────────────────────────────────────
// Opens the device camera (rear-facing on mobile), shows a live preview, and on
// capture produces a compressed JPEG that reuses the SHARED pipeline above.
let visionStream = null

async function startCamera() {
  playClick()
  showVisionError("")

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showVisionError("Live camera isn't supported on this browser. Please use Upload Image instead.")
    return
  }

  document.getElementById("vision-upload-area").style.display = "none"
  document.getElementById("vision-preview-wrap").style.display = "none"
  document.getElementById("vision-results").style.display = "none"
  const camWrap = document.getElementById("vision-camera")
  camWrap.style.display = "block"

  const video = document.getElementById("vision-video")
  try {
    // Prefer the rear camera on phones; fall back to any camera.
    visionStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    })
    video.srcObject = visionStream
    await video.play().catch(() => {})
  } catch (err) {
    camWrap.style.display = "none"
    document.getElementById("vision-upload-area").style.display = "" // graceful fallback to upload
    const name = err && err.name
    if (name === "NotAllowedError" || name === "SecurityError") {
      showVisionError("Camera permission was denied. Allow it in your browser settings, or just use Upload Image.")
    } else if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
      showVisionError("No camera found on this device — no worries, use Upload Image instead.")
    } else {
      showVisionError("Couldn't start the camera. Please use Upload Image instead.")
    }
  }
}

function captureCameraPhoto() {
  playClick()
  const video = document.getElementById("vision-video")
  if (!video || !video.videoWidth) {
    showVisionError("Camera isn't ready yet — give it a second and try again.")
    return
  }
  const maxDim = 1024
  let w = video.videoWidth, h = video.videoHeight
  if (w > h && w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim }
  else if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim }

  const canvas = document.createElement("canvas")
  canvas.width = w; canvas.height = h
  canvas.getContext("2d").drawImage(video, 0, 0, w, h)
  const dataUrl = canvas.toDataURL("image/jpeg", 0.7) // compress before upload

  stopCamera()
  runVisionDetection(dataUrl) // same pipeline as Upload Image
}

function cancelCamera() {
  playClick()
  stopCamera()
  const cam = document.getElementById("vision-camera")
  if (cam) cam.style.display = "none"
  document.getElementById("vision-upload-area").style.display = ""
}

function stopCamera() {
  if (visionStream) {
    visionStream.getTracks().forEach(t => t.stop())
    visionStream = null
  }
  const video = document.getElementById("vision-video")
  if (video) video.srcObject = null
}

function visionRowHtml(name, qty, unit) {
  const q = (qty === null || qty === undefined) ? "" : qty
  return `<div class="vision-row">
    <input class="vrow-name" value="${escAttr(name)}" placeholder="ingredient"/>
    <input class="vrow-qty" value="${escAttr(q)}" placeholder="—" inputmode="decimal"/>
    <input class="vrow-unit" value="${escAttr(unit || "")}" placeholder="unit"/>
    <button class="vrow-del" type="button" title="Remove" onclick="this.closest('.vision-row').remove()">✕</button>
  </div>`
}

function renderVisionRows(ings) {
  document.getElementById("vision-rows").innerHTML =
    ings.map(i => visionRowHtml(i.name, i.quantity, i.unit)).join("")
}

function addVisionRow() {
  playClick()
  document.getElementById("vision-rows").insertAdjacentHTML("beforeend", visionRowHtml("", "", ""))
}

// Confirm → push edited ingredient NAMES into the existing flow and search.
// mode "once" → use for this search only.
// mode "save" → also persist to the user's Firestore pantry (merge, no overwrite).
function confirmVision(mode) {
  const rows = [...document.querySelectorAll("#vision-rows .vision-row")]
  const names = []
  rows.forEach(r => {
    const n = r.querySelector(".vrow-name").value.trim().toLowerCase()
    if (n) names.push(n)
  })
  if (!names.length) {
    showVisionError("Add at least one ingredient before searching.")
    return
  }
  playClick()

  if (mode === "save") {
    if (typeof currentUser !== "undefined" && currentUser && typeof savePantryToFirestore === "function") {
      savePantryToFirestore(names).then(ok =>
        showToast(ok ? "🫙 Saved to your pantry!" : "Couldn't save pantry — used for this search")
      )
    } else {
      showToast("Sign in to save your pantry — using these once")
    }
  }

  names.forEach(n => addIngredient(n)) // existing manual-entry helper (dedupes + renders tags)
  closeVision()
  findRecipes()                        // reuse the existing recipe-search pipeline
}

// Close the vision modal on Escape too.
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeVision()
})
