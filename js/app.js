// ══ STATE ════════════════════════════════════════════
let ingredients   = []
let selectedMood  = ""
let selectedCuis  = "indian"
let selectedDiet  = "veg"
let favourites    = JSON.parse(localStorage.getItem("chefai-favs") || "[]")
let currentServings = 2
let baseServings    = 2
let currentRecipe   = null   // full recipe object from Gemini

// ══ PAGE SWITCHING ═══════════════════════════════════
function showPage(name, el) {
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
  if (added) renderTags()
  document.getElementById("ing-input").focus()
}

function removeIngredient(name) {
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

// ══ MOOD ═════════════════════════════════════════════
function selectMood(mood, el) {
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
  selectedCuis = val
  document.querySelectorAll(".cuis-btn").forEach(b => b.classList.remove("active"))
  el.classList.add("active")
}

// ══ DIET ═════════════════════════════════════════════
function setDiet(val, el) {
  selectedDiet = val
  document.querySelectorAll(".diet-btn").forEach(b => b.classList.remove("active"))
  el.classList.add("active")
}

// ══ FIND RECIPES ═════════════════════════════════════
async function findRecipes() {
  if (ingredients.length === 0) {
    showToast("🌿 Add at least one ingredient first!")
    document.getElementById("ing-input").focus()
    return
  }

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
    const recipes = await searchRecipes(ingredients, selectedMood, selectedCuis, selectedDiet, selectedMeal)
    cacheRecipes(recipes)

    if (!recipes || recipes.length === 0) {
      lbl.textContent = "No results"
      grid.innerHTML  = emptyState("🍽️","No recipes found","Try adding more ingredients or changing filters")
      return
    }

    lbl.textContent = `${recipes.length} recipes crafted for you`
    renderRecipes(recipes, grid)

  } catch(err) {
    lbl.textContent = "Error"
    if (err.message.includes("429")) {
      grid.innerHTML = emptyState("⏳","Too many requests","Wait 30 seconds and try again — free tier limit hit")
    } else if (err.message.includes("JSON")) {
      grid.innerHTML = emptyState("⚠️","Unexpected response","Try again — AI sometimes needs a retry!")
    } else {
      grid.innerHTML = emptyState("⚠️","Gemini error — check console","Open F12 → Console to see the exact error")
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

// ══ RENDER CARDS ═════════════════════════════════════
function renderRecipes(recipes, container) {
  container.innerHTML = recipes.map((r, i) => {
    const fav      = favourites.some(f => f.id === r.id)
    const dietIcon = r.diet?.includes("vegan") ? "🌱" :
                     r.diet?.includes("veg")   ? "🟢" : "🔴"
    const imgHtml  = r.image
      ? `<img src="${r.image}" alt="${escStr(r.title)}"
           onload="this.style.opacity=1"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
           style="opacity:0;transition:opacity .3s;width:100%;height:100%;object-fit:cover" loading="lazy"/>
         <div class="card-img-fallback">${r.emoji || "🍽️"}</div>`
      : `<div class="card-img-fallback" style="display:flex">${r.emoji || "🍽️"}</div>`

    return `
    <div class="recipe-card" style="animation-delay:${i*.07}s" onclick="openRecipe(${r.id})">
      <div class="card-img">
        ${imgHtml}
        <span class="diet-dot" title="${r.diet || ""}">${dietIcon}</span>
        <button class="card-heart ${fav?"loved":""}"
          onclick="event.stopPropagation();quickFav(${r.id},'${escStr(r.title)}',${JSON.stringify(r.image||"")},this)"
          title="${fav?"Remove":"Save"}">
          ${fav?"♥":"♡"}
        </button>
      </div>
      <div class="card-body">
        <div class="card-title">${r.title}</div>
        <div class="card-meta">
          ${r.readyInMinutes ? `<span class="badge">⏱ ${r.readyInMinutes} min</span>` : ""}
          ${r.servings ? `<span class="badge">🍽 ${r.servings} serves</span>` : ""}
          ${r.nutrition?.calories ? `<span class="badge">🔥 ${r.nutrition.calories} cal</span>` : ""}
        </div>
      </div>
    </div>`
  }).join("")
}

// ══ MODAL ════════════════════════════════════════════
async function openRecipe(id) {
  const overlay = document.getElementById("modal-overlay")
  const body    = document.getElementById("modal-body")
  overlay.classList.add("open")
  document.body.style.overflow = "hidden"

  body.innerHTML = `
    <div class="skeleton" style="height:210px;border-radius:10px;margin-bottom:16px"></div>
    <div class="skeleton" style="height:26px;width:65%;border-radius:6px;margin-bottom:10px"></div>
    <div class="skeleton" style="height:120px;border-radius:8px"></div>`

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

      ${d.steps?.length ? `
      <div class="modal-section">Steps</div>
      <ol class="steps-list">
        ${d.steps.map((s,i) => `
          <li class="step-item">
            <div class="step-num">${i+1}</div>
            <div class="step-text">${s}</div>
          </li>`).join("")}
      </ol>` : ""}

      <div class="modal-section">Pantry staples assumed available</div>
      <p style="font-size:13px;color:var(--ink-lt);font-style:italic;line-height:1.6">
        Salt, water, oil, sugar, turmeric, red chili powder, cumin seeds, black pepper — these are assumed in your kitchen.
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
  document.getElementById("modal-overlay").classList.remove("open")
  document.body.style.overflow = ""
}

// serving scaler
function changeServings(delta) {
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
    const display = amt
      ? (amt < 10 ? parseFloat(amt.toFixed(1)) : Math.round(amt))
      : ""
    return `<li>${display ? `<strong>${display} ${ing.unit||""}</strong>` : ""} ${ing.name}</li>`
  }).join("")
}

// ══ SHOPPING LIST ════════════════════════════════════
function generateShoppingList() {
  if (!currentRecipe?.ingredients) return
  const owned  = new Set(ingredients.map(i => i.toLowerCase()))
  const missing = currentRecipe.ingredients.filter(ing =>
    !owned.has(ing.name.toLowerCase())
  )
  if (missing.length === 0) {
    showToast("✅ You have everything needed!")
    return
  }
  const list = missing.map(i => `• ${i.amount} ${i.unit} ${i.name}`).join("\n")
  alert(`🛒 Shopping list for "${currentRecipe.title}":\n\n${list}`)
}

// ══ FAVOURITES ═══════════════════════════════════════
function quickFav(id, title, image, btn) {
  const idx = favourites.findIndex(f => f.id === id)
  if (idx === -1) {
    favourites.push({ id, title, image })
    btn.classList.add("loved"); btn.textContent = "♥"
    showToast("❤ Saved to favourites!")
  } else {
    favourites.splice(idx, 1)
    btn.classList.remove("loved"); btn.textContent = "♡"
    showToast("Removed from favourites")
  }
  saveFavs()
}

function toggleFavModal(id, title, image) {
  const idx = favourites.findIndex(f => f.id === id)
  const btn = document.getElementById("fav-modal-btn")
  if (idx === -1) {
    favourites.push({ id, title, image })
    btn.className = "m-btn primary"; btn.textContent = "♥ Saved"
    showToast("❤ Saved to favourites!")
  } else {
    favourites.splice(idx, 1)
    btn.className = "m-btn"; btn.textContent = "♡ Save recipe"
    showToast("Removed from favourites")
  }
  saveFavs()
}

function saveFavs() {
  localStorage.setItem("chefai-favs", JSON.stringify(favourites))
}

function renderFavourites() {
  const g = document.getElementById("fav-grid")
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

// ══ QUICK ADD ════════════════════════════════════════
function toggleCat(el) {
  el.classList.toggle("open")
  el.nextElementSibling.classList.toggle("open")
}

function quickAdd(el) {
  const val = el.textContent.trim().toLowerCase()
  if (!ingredients.includes(val)) {
    ingredients.push(val)
    renderTags()
    el.classList.add("added")
  } else {
    // clicking again removes it
    ingredients = ingredients.filter(i => i !== val)
    renderTags()
    el.classList.remove("added")
  }
}

// ══ MEAL TYPE ════════════════════════════════════════
let selectedMeal = "any"

function setMeal(val, el) {
  selectedMeal = val
  document.querySelectorAll(".meal-btn").forEach(b => b.classList.remove("active"))
  el.classList.add("active")
}document.querySelectorAll('.mood-btn, .tog-btn, .btn-add, .btn-find, .qi')
.forEach(button => {

  button.addEventListener('click', function (e) {

    const ripple = document.createElement('span');
    ripple.classList.add('ripple');

    const rect = button.getBoundingClientRect();

    ripple.style.left = `${e.clientX - rect.left}px`;
    ripple.style.top = `${e.clientY - rect.top}px`;

    button.appendChild(ripple);

    setTimeout(() => {
      ripple.remove();
    }, 600);

  });

});