// ── STATE ─────────────────────────────────────────────
let ingredients  = []
let selectedMood = ""
let cuisine      = "indian"
let favourites   = JSON.parse(localStorage.getItem("chefai-favs") || "[]")
let currentRecipeId = null
let currentServings = 2
let baseIngredients = []   // stores original amounts for scaling

// ── PAGES ─────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"))
  document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"))
  document.getElementById("page-" + name).classList.add("active")

  // highlight nav
  document.querySelectorAll(".nav-link").forEach(l => {
    if (l.getAttribute("onclick")?.includes(name)) l.classList.add("active")
  })

  if (name === "favourites") renderFavourites()
}

// ── INGREDIENTS ───────────────────────────────────────
function addIngredient(value) {
  const val = value.trim().toLowerCase().replace(/,/g, "")
  if (!val || ingredients.includes(val)) return
  ingredients.push(val)
  renderTags()
}

function removeIngredient(name) {
  ingredients = ingredients.filter(i => i !== name)
  renderTags()
}

function renderTags() {
  const container = document.getElementById("tag-container")
  if (ingredients.length === 0) {
    container.innerHTML = ""
    return
  }
  container.innerHTML = ingredients.map(ing => `
    <div class="tag">
      ${ing}
      <span class="tag-x" onclick="removeIngredient('${ing}')">✕</span>
    </div>
  `).join("")
}

// ── MOOD ──────────────────────────────────────────────
function selectMood(mood, el) {
  selectedMood = mood
  document.querySelectorAll(".mood-btn").forEach(b => b.classList.remove("sel"))
  el.classList.add("sel")
}

// ── CUISINE ───────────────────────────────────────────
function setCuisine(val) {
  cuisine = val
  document.querySelectorAll(".cuisine-btn").forEach(b => b.classList.remove("active"))
  document.getElementById("btn-" + val).classList.add("active")
}

// ── SEARCH ────────────────────────────────────────────
async function findRecipes() {
  if (ingredients.length === 0) {
    showToast("Add at least one ingredient first!")
    return
  }

  const btn  = document.querySelector(".find-btn")
  const grid = document.getElementById("recipe-grid")

  // loading state
  btn.classList.add("loading")
  btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Finding recipes…`

  // loading skeletons
  grid.innerHTML = Array(6).fill('<div class="skeleton"></div>').join("")

  try {
    const recipes = await searchRecipes(ingredients, selectedMood, cuisine)

    if (!recipes || recipes.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-illo">
            <svg viewBox="0 0 80 60" fill="none" width="80">
              <rect x="10" y="20" width="60" height="35" rx="6" fill="#F0E3D3"/>
              <circle cx="40" cy="38" r="10" fill="#D4B896" opacity=".5"/>
              <path d="M33 38 Q40 31 47 38" stroke="#8A5D3B" stroke-width="1.5" stroke-linecap="round" fill="none"/>
            </svg>
          </div>
          <p class="empty-text">No recipes found — try different ingredients</p>
          <p class="empty-sub">Or switch cuisine to "Any"</p>
        </div>`
      return
    }

    renderRecipes(recipes)

  } catch (err) {
    grid.innerHTML = `<div class="empty-state"><p class="empty-text" style="color:var(--terracotta)">Something went wrong. Check your API key!</p></div>`
    console.error(err)
  } finally {
    btn.classList.remove("loading")
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M9 4 Q13.5 4 14 9 Q14.5 13 10 14.5 Q6 15.5 4 12 Q2 8.5 5 6 Q6.5 4 9 4Z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M13 13 L17 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Find my recipes`
  }
}

// ── RENDER CARDS ──────────────────────────────────────
function renderRecipes(recipes) {
  const grid = document.getElementById("recipe-grid")
  grid.innerHTML = recipes.map((recipe, i) => {
    const isFav = favourites.some(f => f.id === recipe.id)
    return `
    <div class="recipe-card" style="animation-delay:${i * 0.06}s" onclick="openRecipe(${recipe.id})">
      <div class="card-img-wrap">
        <img
          src="${recipe.image}"
          alt="${recipe.title}"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
          loading="lazy"
        />
        <div class="card-img-emoji" style="display:none">🍽️</div>
        <button class="card-heart ${isFav ? "loved" : ""}"
          onclick="event.stopPropagation(); toggleFav(${recipe.id}, '${escStr(recipe.title)}', '${recipe.image}')"
          title="${isFav ? "Remove from favourites" : "Save to favourites"}"
        >${isFav ? "♥" : "♡"}</button>
      </div>
      <div class="card-body">
        <div class="card-title">${recipe.title}</div>
        <div class="card-meta">
          <span class="badge badge-used">✓ ${recipe.usedIngredientCount} used</span>
          <span class="badge badge-missing">✗ ${recipe.missedIngredientCount} missing</span>
        </div>
      </div>
    </div>`
  }).join("")
}

// ── MODAL ─────────────────────────────────────────────
async function openRecipe(id) {
  currentRecipeId = id
  currentServings = 2

  const overlay = document.getElementById("modal-overlay")
  const content = document.getElementById("modal-content")

  overlay.classList.add("open")
  content.innerHTML = `<div class="skeleton" style="height:220px;margin-bottom:20px;border-radius:12px"></div><div class="skeleton" style="height:24px;width:60%;margin-bottom:12px;border-radius:6px"></div><div class="skeleton" style="height:16px;margin-bottom:8px;border-radius:6px"></div>`
  document.body.style.overflow = "hidden"

  try {
    const detail = await getRecipeDetail(id)
    const isFav = favourites.some(f => f.id === id)
    baseIngredients = detail.extendedIngredients || []

    content.innerHTML = `
      <img class="modal-img" src="${detail.image}" alt="${detail.title}" onerror="this.style.display='none'"/>
      <h2 class="modal-title">${detail.title}</h2>
      <div class="modal-badges">
        ${detail.readyInMinutes ? `<span class="badge">⏱ ${detail.readyInMinutes} min</span>` : ""}
        ${detail.servings ? `<span class="badge">🍽 ${detail.servings} servings</span>` : ""}
        ${detail.diets?.slice(0,2).map(d => `<span class="badge badge-used">${d}</span>`).join("") || ""}
        ${detail.cuisines?.slice(0,1).map(c => `<span class="badge">${c}</span>`).join("") || ""}
      </div>

      ${detail.nutrition ? `
      <div class="modal-section-label">Nutrition per serving</div>
      <div class="nutrition-row">
        <div class="nutri-box"><div class="nutri-val">${Math.round(detail.nutrition.nutrients?.find(n=>n.name==="Calories")?.amount||0)}</div><div class="nutri-label">Calories</div></div>
        <div class="nutri-box"><div class="nutri-val">${Math.round(detail.nutrition.nutrients?.find(n=>n.name==="Protein")?.amount||0)}g</div><div class="nutri-label">Protein</div></div>
        <div class="nutri-box"><div class="nutri-val">${Math.round(detail.nutrition.nutrients?.find(n=>n.name==="Carbohydrates")?.amount||0)}g</div><div class="nutri-label">Carbs</div></div>
        <div class="nutri-box"><div class="nutri-val">${Math.round(detail.nutrition.nutrients?.find(n=>n.name==="Fat")?.amount||0)}g</div><div class="nutri-label">Fat</div></div>
      </div>` : ""}

      <div class="modal-section-label">Serving size</div>
      <div class="scaler-row">
        <button class="scaler-btn" onclick="changeServings(-1)">−</button>
        <span class="scaler-num" id="serving-count">${currentServings}</span>
        <button class="scaler-btn" onclick="changeServings(1)">+</button>
        <span style="font-size:13px;color:var(--brown-lt)">servings</span>
      </div>

      ${baseIngredients.length ? `
      <div class="modal-section-label">Ingredients</div>
      <ul class="ing-list" id="ing-list">
        ${renderIngredients(baseIngredients, currentServings, detail.servings || 2)}
      </ul>` : ""}

      ${detail.analyzedInstructions?.[0]?.steps?.length ? `
      <div class="modal-section-label">Steps</div>
      <ol class="steps-list">
        ${detail.analyzedInstructions[0].steps.map((s, i) => `
          <li class="step-item">
            <div class="step-num">${i + 1}</div>
            <div class="step-text">${s.step}</div>
          </li>`).join("")}
      </ol>` : detail.instructions ? `
      <div class="modal-section-label">Instructions</div>
      <p style="font-size:14px;color:var(--brown-dk);line-height:1.65">${detail.instructions.replace(/<[^>]*>/g,"")}</p>
      ` : ""}

      <div class="modal-actions">
        <button class="modal-action-btn ${isFav?"primary":""}" id="fav-modal-btn"
          onclick="toggleFavFromModal(${detail.id}, '${escStr(detail.title)}', '${detail.image}')">
          ${isFav ? "♥ Saved" : "♡ Save recipe"}
        </button>
        <button class="modal-action-btn" onclick="addToPlan('${escStr(detail.title)}')">
          📅 Add to plan
        </button>
        ${detail.sourceUrl ? `<a class="modal-action-btn" href="${detail.sourceUrl}" target="_blank" style="text-decoration:none">↗ Full recipe</a>` : ""}
      </div>
    `
  } catch (err) {
    content.innerHTML = `<p style="color:var(--terracotta);padding:20px">Could not load recipe details. Try again!</p>`
    console.error(err)
  }
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open")
  document.body.style.overflow = ""
}

// serving scaler
function changeServings(delta) {
  const newVal = currentServings + delta
  if (newVal < 1 || newVal > 20) return
  currentServings = newVal
  document.getElementById("serving-count").textContent = currentServings

  const list = document.getElementById("ing-list")
  const baseServ = parseInt(document.querySelector(".badge")?.textContent?.match(/\d+/)?.[0] || 2)
  if (list) list.innerHTML = renderIngredients(baseIngredients, currentServings, baseServ)
}

function renderIngredients(ings, targetServings, baseServings) {
  const ratio = targetServings / (baseServings || 2)
  return ings.map(ing => {
    const amt = ing.amount ? (ing.amount * ratio).toFixed(ing.amount * ratio < 10 ? 1 : 0) : ""
    return `<li>${amt ? `<strong>${amt} ${ing.unit || ""}</strong>` : ""} ${ing.name}</li>`
  }).join("")
}

// ── FAVOURITES ────────────────────────────────────────
function toggleFav(id, title, image) {
  const idx = favourites.findIndex(f => f.id === id)
  if (idx === -1) {
    favourites.push({ id, title, image })
    showToast("❤ Saved to favourites!")
  } else {
    favourites.splice(idx, 1)
    showToast("Removed from favourites")
  }
  localStorage.setItem("chefai-favs", JSON.stringify(favourites))

  // update card heart
  document.querySelectorAll(".recipe-card").forEach(card => {
    const heart = card.querySelector(".card-heart")
    const cardId = parseInt(card.getAttribute("onclick")?.match(/\d+/)?.[0])
    if (cardId === id && heart) {
      const isFav = favourites.some(f => f.id === id)
      heart.className = `card-heart ${isFav ? "loved" : ""}`
      heart.textContent = isFav ? "♥" : "♡"
    }
  })
}

function toggleFavFromModal(id, title, image) {
  toggleFav(id, title, image)
  const btn = document.getElementById("fav-modal-btn")
  const isFav = favourites.some(f => f.id === id)
  if (btn) {
    btn.className = `modal-action-btn ${isFav ? "primary" : ""}`
    btn.textContent = isFav ? "♥ Saved" : "♡ Save recipe"
  }
}

function renderFavourites() {
  const grid = document.getElementById("fav-grid")
  if (favourites.length === 0) {
    grid.innerHTML = `<div class="empty-state"><p class="empty-text">No favourites yet — heart a recipe to save it here.</p></div>`
    return
  }
  grid.innerHTML = favourites.map((r, i) => `
    <div class="recipe-card" style="animation-delay:${i*0.06}s" onclick="openRecipe(${r.id})">
      <div class="card-img-wrap">
        <img src="${r.image}" alt="${r.title}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" loading="lazy"/>
        <div class="card-img-emoji" style="display:none">🍽️</div>
        <button class="card-heart loved" onclick="event.stopPropagation();toggleFav(${r.id},'${escStr(r.title)}','${r.image}');renderFavourites()">♥</button>
      </div>
      <div class="card-body">
        <div class="card-title">${r.title}</div>
      </div>
    </div>`).join("")
}

// ── MEAL PLANNER ──────────────────────────────────────
function addToPlan(title) {
  const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
  const day  = prompt("Add to which day?\n" + days.join(" / "))
  const match = days.find(d => d.toLowerCase() === day?.trim().toLowerCase())
  if (!match) { showToast("Invalid day — try Mon, Tue…"); return }

  const slot = document.getElementById("plan-" + match)
  if (slot) {
    slot.textContent = title
    slot.style.color = "var(--brown-dk)"
    slot.style.fontStyle = "normal"
    slot.style.fontWeight = "500"
  }
  closeModal()
  showPage("planner")
  showToast(`📅 Added to ${match}!`)
}

// ── TOAST ─────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById("toast")
  t.textContent = msg
  t.classList.add("show")
  setTimeout(() => t.classList.remove("show"), 2500)
}

// ── HELPERS ───────────────────────────────────────────
function escStr(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"')
}

// close modal on Escape
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeModal()
})