// js/chef.js — ChefAI Companion (UI only)
// ─────────────────────────────────────────────────────────────────────────────
// "Chef Mimi" — the friendly mascot + chat experience. This file is PURELY
// front-end: it contains NO AI logic and never calls Gemini or any backend.
// All replies are local, hand-written mock responses for UX demonstration.
// The recommendation/vision/pantry/reasoning systems are untouched.
// ─────────────────────────────────────────────────────────────────────────────

// ── Mascot artwork (original cute rounded chef — not a copy of any reference) ──
function chefMascotSVG() {
  return `
  <svg class="chef-svg" viewBox="0 0 140 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <ellipse class="chef-shadow" cx="70" cy="143" rx="33" ry="6" fill="rgba(44,24,16,.12)"/>

    <!-- waving arm (right) -->
    <g class="chef-arm">
      <rect x="97" y="96" width="10" height="26" rx="5" fill="#C4622D" stroke="#9A4A22" stroke-width="2"/>
      <circle cx="102" cy="92" r="8" fill="#F6DCC4" stroke="#C4622D" stroke-width="2.5"/>
    </g>

    <!-- left arm holding a wooden spoon -->
    <g class="chef-arm-left">
      <rect x="33" y="100" width="10" height="22" rx="5" fill="#C4622D" stroke="#9A4A22" stroke-width="2"/>
      <line x1="38" y1="100" x2="28" y2="74" stroke="#B8895E" stroke-width="4" stroke-linecap="round"/>
      <ellipse cx="26" cy="70" rx="7" ry="5" fill="#D9A86C" stroke="#9A6B3A" stroke-width="2"/>
      <circle cx="38" cy="100" r="7" fill="#F6DCC4" stroke="#C4622D" stroke-width="2.5"/>
    </g>

    <!-- body + apron -->
    <path d="M46 110 L94 110 Q104 110 104 122 L104 130 Q104 136 96 136 L44 136 Q36 136 36 130 L36 122 Q36 110 46 110 Z" fill="#C4622D" stroke="#9A4A22" stroke-width="2.5"/>
    <path d="M57 110 L83 110 L79 136 L61 136 Z" fill="#FBF3E6" stroke="#E3CFB2" stroke-width="2"/>
    <circle cx="70" cy="124" r="6" fill="#F0C27B" stroke="#C99A52" stroke-width="2"/>
    <path d="M67.2 124 a2.8 2.8 0 1 0 5.6 0" fill="none" stroke="#9A6B3A" stroke-width="1.3" stroke-linecap="round"/>

    <!-- head -->
    <g class="chef-head">
      <!-- chef hat -->
      <g class="chef-hat">
        <rect x="42" y="25" width="56" height="16" rx="6" fill="#FFFFFF" stroke="#DBC9AE" stroke-width="2.5"/>
        <circle cx="50" cy="23" r="14" fill="#FFFFFF" stroke="#DBC9AE" stroke-width="2.5"/>
        <circle cx="70" cy="14" r="17" fill="#FFFFFF" stroke="#DBC9AE" stroke-width="2.5"/>
        <circle cx="90" cy="23" r="14" fill="#FFFFFF" stroke="#DBC9AE" stroke-width="2.5"/>
      </g>
      <!-- face -->
      <rect x="30" y="39" width="80" height="70" rx="30" fill="#F6DCC4" stroke="#C4622D" stroke-width="3"/>
      <!-- cheeks -->
      <ellipse cx="48" cy="81" rx="7" ry="4.5" fill="#EFA07E" opacity=".75"/>
      <ellipse cx="92" cy="81" rx="7" ry="4.5" fill="#EFA07E" opacity=".75"/>
      <!-- eyes -->
      <g class="chef-eyes">
        <g class="chef-eye"><ellipse cx="56" cy="69" rx="7.5" ry="9.5" fill="#3A2418"/><circle cx="58.5" cy="65.5" r="2.6" fill="#FFF"/></g>
        <g class="chef-eye"><ellipse cx="84" cy="69" rx="7.5" ry="9.5" fill="#3A2418"/><circle cx="86.5" cy="65.5" r="2.6" fill="#FFF"/></g>
      </g>
      <!-- smile -->
      <path class="chef-smile" d="M57 87 Q70 97 83 87" fill="none" stroke="#3A2418" stroke-width="3" stroke-linecap="round"/>
    </g>
  </svg>`
}

// ── State ──────────────────────────────────────────────────────────────────
const CHEF_STORE = "chefai-chat"
let chefHistory = []     // [{ who:'bot'|'user', text, time }]
let chefGreeted = false

// ── Init ──────────────────────────────────────────────────────────────────
function chefInit() {
  // Inject the mascot artwork into the launcher and the chat header.
  document.querySelectorAll(".chef-mascot-slot").forEach(slot => {
    slot.innerHTML = chefMascotSVG()
  })

  renderQuickChips()

  // Default visual state: Discovery mode.
  const st0 = document.querySelector(".chef-status")
  if (st0) st0.innerHTML = `<span class="chef-dot"></span> 🔍 Discover recipes`

  // Restore prior conversation if any.
  try {
    const saved = JSON.parse(localStorage.getItem(CHEF_STORE) || "[]")
    if (Array.isArray(saved) && saved.length) {
      chefHistory = saved
      chefGreeted = true
      chefHistory.forEach(m => renderMessage(m.who, m.text, m.time, false))
      chefScroll()
    }
  } catch (_) {}

  // A gentle "peek" of the speech bubble shortly after load.
  setTimeout(() => {
    const sp = document.getElementById("chef-speech")
    if (sp && !document.getElementById("chef-companion").classList.contains("open")) {
      sp.classList.add("peek")
      setTimeout(() => sp.classList.remove("peek"), 3800)
    }
  }, 1600)
}

// Run once DOM is ready (script is at the end of <body>, so it is).
chefInit()

// ── Open / minimize / close ─────────────────────────────────────────────────
function openChef() {
  document.getElementById("chef-companion").classList.add("open")
  // First time opening → warm greeting + suggested prompts.
  if (!chefGreeted) {
    chefGreeted = true
    chefBotSay("Hey there, chef! 👋 I'm Mimi. Tell me what's in your kitchen and I'll help you whip up something tasty.")
    showSuggestions([
      "What can I cook tonight?",
      "I have paneer and rice 🍚",
      "Something quick & lazy 😴"
    ])
  }
  setTimeout(() => { const i = document.getElementById("chef-input"); if (i) i.focus() }, 360)
  chefScroll()
}

function minimizeChef() {
  document.getElementById("chef-companion").classList.remove("open")
}

function closeChef() {
  document.getElementById("chef-companion").classList.remove("open")
}

// ── Sending messages ─────────────────────────────────────────────────────────
function chefSend() {
  const input = document.getElementById("chef-input")
  const text = input.value.trim()
  if (!text) return
  input.value = ""
  chefUserSay(text)
}

function chefUserSay(text) {
  clearSuggestions()
  pushMessage("user", text)
  chefBotTyping()
  handleChefIntent(text)
}

function chefBotSay(text) {
  pushMessage("bot", text)
}

// ── Message rendering + history ──────────────────────────────────────────────
function pushMessage(who, text) {
  const time = nowTime()
  chefHistory.push({ who, text, time })
  saveHistory()
  renderMessage(who, text, time, true)
}

function renderMessage(who, text, time, animate) {
  const wrap = document.getElementById("chef-messages")
  const el = document.createElement("div")
  if (who === "divider") {
    el.className = "chef-divider"
    el.innerHTML = `<span>${escHtml(text)}</span>`
    wrap.appendChild(el)
    chefScroll()
    return
  }
  el.className = `chef-msg ${who}`
  el.innerHTML = `<div class="chef-bubble">${escHtml(text)}</div><span class="chef-time">${escHtml(time)}</span>`
  wrap.appendChild(el)
  chefScroll()
}

// Lightweight system divider in the chat (kept in history, never erases messages).
function pushDivider(text) {
  chefHistory.push({ who: "divider", text })
  saveHistory()
  renderMessage("divider", text, "", true)
}

// ── Typing indicator ─────────────────────────────────────────────────────────
function chefBotTyping() {
  hideTyping()
  const wrap = document.getElementById("chef-messages")
  const el = document.createElement("div")
  el.className = "chef-msg bot"
  el.id = "chef-typing-row"
  el.innerHTML = `<div class="chef-typing"><span></span><span></span><span></span></div>`
  wrap.appendChild(el)
  chefScroll()
}
function hideTyping() {
  const t = document.getElementById("chef-typing-row")
  if (t) t.remove()
}

// ── Suggested prompts (contextual, inside chat) ──────────────────────────────
function showSuggestions(list) {
  clearSuggestions()
  const wrap = document.getElementById("chef-messages")
  const box = document.createElement("div")
  box.className = "chef-suggestions"
  box.id = "chef-suggestions"
  box.innerHTML = list.map(s => `<button class="chef-sugg">${escHtml(s)}</button>`).join("")
  box.querySelectorAll(".chef-sugg").forEach(btn =>
    btn.addEventListener("click", () => chefUserSay(btn.textContent))
  )
  wrap.appendChild(box)
  chefScroll()
}
function clearSuggestions() {
  const s = document.getElementById("chef-suggestions")
  if (s) s.remove()
}
function maybeFollowUpSuggestions(lastText) {
  // Offer a couple of contextual nudges after certain replies.
  const t = lastText.toLowerCase()
  if (/(cook|recipe|dinner|lunch|make)/.test(t)) {
    showSuggestions(["Show me veg options 🟢", "Surprise me 🎲", "Keep it under 20 min ⏱"])
  }
}

// ── Quick action chips (persistent bar) ──────────────────────────────────────
function renderQuickChips() {
  const chips = [
    "🍳 What can I cook?",
    "🎲 Surprise me",
    "🥗 Healthy ideas",
    "⏱ Quick meals",
    "💡 Cooking tip"
  ]
  const bar = document.getElementById("chef-quickchips")
  bar.innerHTML = chips.map(c => `<button class="chef-chip">${c}</button>`).join("")
  bar.querySelectorAll(".chef-chip").forEach(btn =>
    btn.addEventListener("click", () => chefUserSay(btn.textContent.replace(/^[^\w]+\s*/, "")))
  )
}

// ── Mock reply engine (NO AI, NO network — canned, playful responses) ────────
function chefReply(text) {
  const t = text.toLowerCase()
  const pick = arr => arr[Math.floor(Math.random() * arr.length)]

  if (/\b(hi|hello|hey|yo|namaste)\b/.test(t))
    return pick([
      "Hello hello! 👋 Ready to cook up something wonderful?",
      "Hey, friend! 🧡 What are we making today?"
    ])

  if (/\bthank|thanks|thx\b/.test(t))
    return pick(["Anytime, chef! 🧡", "You're so welcome — now go make magic! ✨"])

  if (/surprise|random|anything|idea/.test(t))
    return "Ooh, let's be adventurous! 🎲 How about " + pick([
      "Paneer Butter Masala with warm naan", "a comforting bowl of Rajma Chawal",
      "crispy Masala Dosa", "quick Lemon Rice", "cheesy Pav Bhaji"
    ]) + "? Want the steps?"

  if (/healthy|light|low ?cal|diet|fit/.test(t))
    return "Love that energy! 💪 Try something like Palak Paneer, Moong Dal Cheela, or a fresh Sprout Chaat. Tell me your veggies and I'll tailor it."

  if (/quick|fast|lazy|20 ?min|hurry|easy/.test(t))
    return "Short on time? ⏱ Poha, Besan Chilla, or Lemon Rice come together in minutes. Want a 15-minute idea?"

  if (/\bveg|vegetarian|vegan\b/.test(t))
    return "Plenty of plant-y goodness here! 🟢 Pop your ingredients into the search and pick the Veg or Vegan filter — I'll cheer you on."

  if (/paneer|rice|dal|atta|potato|tomato|onion|chicken|egg/.test(t))
    return pick([
      "Yum! 😋 Add those to the ingredient box and hit Find My Recipes — I bet we'll find a winner.",
      "Great start! Toss them into your ingredients and I'll help you turn them into dinner. 🍽"
    ])

  if (/cook|recipe|make|dinner|lunch|breakfast|snack/.test(t))
    return "Tell me what's in your fridge and your mood, and I'll point you to the perfect dish. You can even 📷 scan a photo of your ingredients!"

  if (/tip|help|how|advice/.test(t))
    return pick([
      "Chef tip 💡: salt your onions while sautéing — they soften faster and sweeten up.",
      "Chef tip 💡: toast your whole spices for 30 seconds before grinding for deeper flavour.",
      "Chef tip 💡: rest your dough 15 minutes for softer, fluffier rotis."
    ])

  return pick([
    "I'm all ears! 👂 Try telling me your ingredients or tap a quick chip below.",
    "Hmm, let's cook something! 🍲 Share what you've got and I'll suggest a dish.",
    "I'm just the UI for now 😄 but I'd love to help — tell me what's in your kitchen!"
  ])
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function chefScroll() {
  const wrap = document.getElementById("chef-messages")
  if (wrap) requestAnimationFrame(() => { wrap.scrollTop = wrap.scrollHeight })
}
function nowTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}
function saveHistory() {
  try { localStorage.setItem(CHEF_STORE, JSON.stringify(chefHistory.slice(-50))) } catch (_) {}
}
function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// ═════════════════════════════════════════════════════════════════════════════
// CONVERSATION INTELLIGENCE (Step 6B)
//
// Understands natural language, continuously builds a context, auto-populates
// the EXISTING filters, and calls the EXISTING Recommendation Engine via
// findRecipes(). It NEVER generates recipes. A local parser does the work
// (robust + quota-free); Gemini (/api/understand) is a fallback only for
// messages the local parser can't handle, with a graceful message if it's down.
// The Recommendation/Vision/Pantry/Reasoning engines are NOT modified.
// ═════════════════════════════════════════════════════════════════════════════

// Session context — merged across turns so we never re-ask for what we know.
const chefContext = { ingredients: [], mood: null, meal: null, diet: null, cuisine: null }

const CHEF_PICK = arr => arr[Math.floor(Math.random() * arr.length)]

const MOOD_EMOJI = { lazy: "😴", festive: "🎉", healthy: "💪", comfort: "🍲", fancy: "✨", snack: "☕" }
const DIET_EMOJI = { veg: "🟢", nonveg: "🔴", vegan: "🌱" }
const DIET_LABEL = { veg: "veg", nonveg: "non-veg", vegan: "vegan" }

// Known ingredient vocabulary (multi-word first so longer terms win).
const CHEF_VOCAB = [
  "moong dal", "toor dal", "chana dal", "green chili", "green chilli",
  "bell pepper", "sweet corn", "bottle gourd", "spring onion",
  "paneer", "tomato", "tomatoes", "onion", "onions", "potato", "potatoes",
  "capsicum", "carrot", "carrots", "spinach", "cauliflower", "peas", "brinjal",
  "eggplant", "cabbage", "beans", "mushroom", "mushrooms", "rice", "atta",
  "flour", "rajma", "chickpeas", "chickpea", "chana", "poha", "suji", "semolina",
  "bread", "vermicelli", "chicken", "mutton", "fish", "prawns", "prawn", "egg",
  "eggs", "milk", "curd", "yogurt", "butter", "ghee", "cheese", "cream", "lemon",
  "banana", "coconut", "ginger", "garlic", "coriander", "mint", "methi", "besan",
  "dal", "lentils", "soya", "tofu", "corn",
  "noodles", "pasta", "oats", "sprouts", "mayonnaise", "cucumber",
  "soy sauce", "schezwan sauce"
]

function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") }

// ── Local natural-language parser → partial entities ─────────────────────────
function chefUnderstand(text) {
  const out = { ingredients: [] }
  const t = " " + text.toLowerCase() + " "

  // ingredients (remove matches progressively so "dal" doesn't double-hit "moong dal")
  let work = t
  for (const term of CHEF_VOCAB) {
    const re = new RegExp("\\b" + reEsc(term) + "\\b", "i")
    if (re.test(work)) {
      out.ingredients.push(term)
      work = work.replace(new RegExp("\\b" + reEsc(term) + "\\b", "ig"), " ")
    }
  }

  // diet (explicit words win; otherwise infer from non-veg ingredients)
  if (/\bvegan\b/.test(t)) out.diet = "vegan"
  else if (/non[\s-]?veg|non[\s-]?vegetarian/.test(t)) out.diet = "nonveg"
  else if (/\b(chicken|mutton|fish|prawns?|eggs?|meat)\b/.test(t)) out.diet = "nonveg"
  else if (/\bveg\b|vegetarian|veggie/.test(t)) out.diet = "veg"

  // mood
  if (/comfort|cozy|cosy|homely|hearty|soul/.test(t)) out.mood = "comfort"
  else if (/festive|celebrat|party|guests?|festival/.test(t)) out.mood = "festive"
  else if (/fancy|gourmet|impress|restaurant|elegant|posh|date night/.test(t)) out.mood = "fancy"
  else if (/healthy|nutritious|low[\s-]?cal|light meal|clean eating|\bfit\b/.test(t)) out.mood = "healthy"
  else if (/lazy|\bquick|\bfast\b|\beasy\b|in a hurry|in a rush|\btired\b|\b\d+\s?min/.test(t)) out.mood = "lazy"
  else if (/munch|nibble|light snack|chai time|tea time/.test(t)) out.mood = "snack"

  // meal
  if (/breakfast|brunch|morning/.test(t)) out.meal = "breakfast"
  else if (/lunch|afternoon/.test(t)) out.meal = "lunch"
  else if (/dinner|supper|tonight|evening meal/.test(t)) out.meal = "dinner"
  else if (/\bsnack\b/.test(t)) out.meal = "snack"

  // cuisine
  if (/any cuisine|global|international|continental|world cuisine/.test(t)) out.cuisine = "any"
  else if (/indian|desi/.test(t)) out.cuisine = "indian"

  return out
}

function chefHasEntities(e) {
  return !!(e && ((e.ingredients && e.ingredients.length) || e.mood || e.meal || e.diet || e.cuisine))
}

// ── Apply entities to the EXISTING app state + visible filters ───────────────
const CHEF_DIET_ID = { veg: "btn-veg", nonveg: "btn-nonveg", vegan: "btn-vegan" }
const CHEF_MEAL_ID = { any: "btn-any-meal", breakfast: "btn-breakfast", lunch: "btn-lunch", dinner: "btn-dinner", snack: "btn-snack-meal" }
const CHEF_CUIS_ID = { indian: "btn-indian", any: "btn-any" }

function chefClickBtn(id) {
  const el = document.getElementById(id)
  if (el) el.click() // reuses the existing onclick (setDiet/setMeal/setCuisine) — no toggle-off
}
function chefSetMood(mood) {
  // selectMood toggles OFF if the same mood is re-clicked, so guard it.
  if (typeof selectedMood !== "undefined" && selectedMood === mood) return
  const btn = [...document.querySelectorAll(".mood-btn")]
    .find(b => (b.getAttribute("onclick") || "").includes(`selectMood('${mood}'`))
  if (btn) btn.click()
}

function chefApplyEntities(e) {
  (e.ingredients || []).forEach(name => {
    const n = String(name).toLowerCase().trim()
    if (n && !chefContext.ingredients.includes(n)) {
      chefContext.ingredients.push(n)
      if (typeof addIngredient === "function") addIngredient(n)
    }
  })
  if (e.mood)    { chefContext.mood = e.mood;       chefSetMood(e.mood) }
  if (e.diet)    { chefContext.diet = e.diet;       chefClickBtn(CHEF_DIET_ID[e.diet]) }
  if (e.meal)    { chefContext.meal = e.meal;       chefClickBtn(CHEF_MEAL_ID[e.meal]) }
  if (e.cuisine) { chefContext.cuisine = e.cuisine; chefClickBtn(CHEF_CUIS_ID[e.cuisine]) }
}

// Make sure recipe results are visible (switch to Discover if needed).
function chefGoHome() {
  const home = document.getElementById("page-home")
  if (home && !home.classList.contains("active")) {
    const discover = document.querySelector(".nav-link")
    if (discover) discover.click()
  }
}

// Build the response message + decide whether to search, from current context.
function chefContextResponse() {
  const c = chefContext
  const parts = []
  if (c.ingredients.length) parts.push("🧺 " + c.ingredients.slice(0, 6).join(", "))
  if (c.mood) parts.push(MOOD_EMOJI[c.mood] + " " + c.mood)
  if (c.meal && c.meal !== "any") parts.push("🍽 " + c.meal)
  if (c.diet) parts.push(DIET_EMOJI[c.diet] + " " + DIET_LABEL[c.diet])
  if (c.cuisine && c.cuisine !== "indian") parts.push("🌍 " + c.cuisine)

  let msg = parts.length ? "Got it! " + parts.join(" · ") + ". " : ""

  if (c.ingredients.length) {
    msg += CHEF_PICK([
      "Finding your recipes now — peek at the page behind me! 👀",
      "Cooking up matches on your board! 🍳 Want it quicker, healthier, or veg? Just say the word.",
      "On it! Your picks are loading on the page. 🍽 Tell me if you'd like to tweak anything."
    ])
    return { msg, doSearch: true }
  }
  msg += "What's in your kitchen? Even 2–3 things work — like 'paneer, rice and peas'. 🧺"
  return { msg, doSearch: false }
}

// Small-talk detector (handled by the playful mock replies, not the engine).
function chefIsSmallTalk(text) {
  return /\b(hi|hello|hey|yo|namaste|thanks|thank|thx|tip|help|surprise|random|who are you|what can you do|how are you)\b/i.test(text)
}

// Show typing → respond after a natural delay (optionally run a follow-up).
function botRespond(text, after) {
  const delay = 600 + Math.min(1200, text.length * 10)
  setTimeout(() => {
    hideTyping()
    chefBotSay(text)
    if (typeof after === "function") after()
  }, delay)
}

// ── Main intent router (discovery mode) ──────────────────────────────────────
async function handleChefIntent(text) {
  const cls = chefClassifyIntent(text)

  switch (cls.intent) {
    case "INGREDIENT": {
      chefApplyEntities(cls.entities)
      const { msg, doSearch } = chefContextResponse()
      botRespond(msg, doSearch ? () => { chefGoHome(); if (typeof findRecipes === "function") findRecipes() } : null)
      return
    }
    case "DISH":
      chefHandleDish(cls.dish, cls.entities)
      return
    case "DISCOVERY":
      chefHandleDiscovery(cls.entities)
      return
    case "SMALLTALK":
      botRespond(chefReply(text), () => maybeFollowUpSuggestions(text))
      return
  }

  // UNKNOWN — never the scary message for normal English.
  // Pure symbols/numbers → friendly guidance immediately (no API call).
  if (!/[a-z]/i.test(text)) { botRespond(chefGuidingFallback()); return }

  // Otherwise try the optional NLU endpoint, then fall back gently.
  try {
    const res = await fetch("/api/understand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text })
    })
    if (!res.ok) throw new Error("nlu " + res.status)
    const data = await res.json().catch(() => ({}))
    if (chefHasEntities(data && data.entities)) {
      chefApplyEntities(data.entities)
      const { msg, doSearch } = chefContextResponse()
      botRespond(msg, doSearch ? () => { chefGoHome(); if (typeof findRecipes === "function") findRecipes() } : null)
    } else {
      botRespond(chefGuidingFallback())
    }
  } catch (_) {
    botRespond(chefGuidingFallback())
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// COOKING ASSISTANT MODE (Step 6C)
//
// When a recipe is opened, the companion stores it as context and switches into
// cooking mode. It then answers questions about THAT recipe — substitutions,
// vegan/healthier versions, serving scaling, spice level, steps, storage,
// reheating, side dishes, tips, nutrition — always using the stored recipe and
// never asking for it again. All answers are local (no AI / no engine changes).
// ═════════════════════════════════════════════════════════════════════════════

let chefMode = "general"          // "general" | "cooking"
let chefCookingRecipe = null      // { title, ingredients, steps, nutrition, servings, diet }
let chefLastCookedTitle = null

// Common ingredient swaps (client-side, for cooking answers).
const COOK_SUBS = {
  paneer: "tofu or halloumi", cream: "cashew paste or coconut cream", malai: "coconut cream",
  butter: "ghee or oil", ghee: "oil or butter", curd: "yogurt (or coconut yogurt)", yogurt: "curd",
  milk: "plant milk (almond/soy)", cheese: "paneer or vegan cheese", egg: "flax egg or curd",
  sugar: "jaggery or honey", rice: "quinoa or millet", atta: "multigrain flour",
  besan: "rice flour", cashews: "almonds or melon seeds", coconut: "cashew paste",
  tomato: "tamarind pulp + water", lemon: "lime or vinegar", chicken: "soya chunks or paneer",
  mutton: "mushroom or soya chunks", fish: "tofu or paneer", prawns: "mushrooms"
}
const VEGAN_SUBS = {
  paneer: "firm tofu", cream: "coconut cream", malai: "coconut cream",
  butter: "vegan butter or oil", ghee: "coconut/vegetable oil", curd: "coconut yogurt",
  yogurt: "coconut yogurt", milk: "almond or soy milk", cheese: "vegan cheese",
  khoya: "cashew paste", honey: "maple syrup", egg: "flax egg"
}

function chefTruncate(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s }

// ── Enter / exit cooking mode ────────────────────────────────────────────────
function chefEnterCookingMode(r) {
  if (!r) return
  chefMode = "cooking"
  chefCookingRecipe = {
    title:       r.title || "this dish",
    ingredients: r.ingredients || [],
    steps:       r.steps || [],
    nutrition:   r.nutrition || null,
    servings:    r.servings || 2,
    diet:        r.diet || ""
  }

  const st = document.querySelector(".chef-status")
  if (st) st.innerHTML = `<span class="chef-dot"></span> 👩‍🍳 Cooking · ${escHtml(chefTruncate(chefCookingRecipe.title, 20))}`

  const chat = document.getElementById("chef-chat")
  if (chat) chat.classList.add("cooking")

  renderCookingChips()

  // Greet once per newly-selected recipe.
  if (chefLastCookedTitle !== chefCookingRecipe.title) {
    chefLastCookedTitle = chefCookingRecipe.title
    chefGreeted = true // suppress the generic greeting
    pushDivider(`${r.emoji || "🍛"} Started cooking · ${chefCookingRecipe.title}`)
    pushMessage("bot", `Yum — let's make ${chefCookingRecipe.title}! 👩‍🍳 I'm in cooking mode now. Ask me about substitutions, a vegan twist, scaling servings, spice level, storage, reheating, side dishes — or say "explain the steps".`)
    clearSuggestions()
    showSuggestions(["Explain the steps 📖", "Make it vegan 🌱", "Scale to 4 servings 🍽", "What can I serve with it? 🥗"])
  }

  // If the chat is closed, gently invite via the speech bubble.
  const comp = document.getElementById("chef-companion")
  if (comp && !comp.classList.contains("open")) {
    const sp = document.getElementById("chef-speech")
    if (sp) { sp.textContent = "Need help cooking? 👩‍🍳"; sp.classList.add("peek"); setTimeout(() => sp.classList.remove("peek"), 4200) }
  }
}

function chefExitCookingMode() {
  chefMode = "general"
  chefCookingRecipe = null
  chefLastCookedTitle = null
  const st = document.querySelector(".chef-status")
  if (st) st.innerHTML = `<span class="chef-dot"></span> 🔍 Discover recipes`
  const chat = document.getElementById("chef-chat")
  if (chat) chat.classList.remove("cooking")
  renderQuickChips()
}

// Manual / automatic return to Discovery. Keeps chat history, drops a divider.
// silent=true → divider only (the caller will produce the next reply);
// silent=false → also show a friendly confirmation (manual "Back to Discover").
function chefBackToDiscover(silent) {
  const wasCooking = (chefMode === "cooking")
  chefExitCookingMode()
  if (wasCooking) pushDivider("⟵ Back to Discover")
  if (!silent) botRespond("Back to discovery! 🔍 Tell me your ingredients or what you'd like to cook, and I'll find recipes.")
}

// Quick chips while cooking.
function renderCookingChips() {
  const chips = [
    "🔄 Substitutions", "🌱 Vegan version", "💪 Healthier", "🍽 Side dishes",
    "🧂 Spice level", "📦 Storage", "🔥 Reheat", "📖 Explain steps"
  ]
  const bar = document.getElementById("chef-quickchips")
  if (!bar) return
  bar.innerHTML = chips.map(c => `<button class="chef-chip">${c}</button>`).join("")
  bar.querySelectorAll(".chef-chip").forEach(btn =>
    btn.addEventListener("click", () => chefUserSay(btn.textContent.replace(/^[^\w]+\s*/, "")))
  )
}

// ── Intent detection (pure JS, no AI) ────────────────────────────────────────
// Strong signals that the user wants to leave cooking and discover new recipes.
function chefIsStrongDiscovery(t) {
  return /(another|other|different|new)\s+(recipe|dish|meal|idea)/.test(t)
    || /\bfind\b[\s\S]*\b(recipe|recipes|meal|dish)\b/.test(t)
    || /what (can|should) i (cook|make|eat)/.test(t)
    || /\b(start over|reset|clear|new search|search again|back to discover|discover recipes)\b/.test(t)
    || /change (the )?recipe/.test(t)
}
// Softer discovery cues (checked AFTER cooking queries so "suggest a side dish" stays).
function chefIsGenericDiscovery(t) {
  return /\b(recommend|suggest)\b/.test(t)
    || /something (else|different|new|tasty|nice|good|healthy|quick)/.test(t)
    || /\b(discover|go back)\b/.test(t)
}
// Genuine questions about the currently-open recipe (stay in cooking mode).
function chefIsCookingQuery(t) {
  return /scale|\bserving|\bserves\b|\bportion|double|twice|halve|\bhalf\b|for \d+/.test(t)
    || /\bvegan\b|healthier|lighter|less oil|less cream|low[\s-]?cal/.test(t)
    || /substitut|replace|swap|instead of|don'?t have|out of/.test(t)
    || /spic|spicy|mild|chilli|chili|too hot|tone down/.test(t)
    || /\bstor|fridge|leftover|preserve/.test(t)
    || /reheat|warm (it )?up|microwave/.test(t)
    || /side dish|serve with|accompan|\bpair\b|go(es)? with/.test(t)
    || /\bstep\b|\bsteps\b|how do i|how to|method|instruction|explain|walk me|guide me/.test(t)
    || /\btip\b|\btips\b|advice|trick/.test(t)
    || /nutrition|calorie|protein|carb|\bfat\b/.test(t)
}

// Exit cooking and continue the normal recommendation flow with this message.
function switchToDiscovery(text) {
  chefBackToDiscover(true)          // silent: just drop a divider + switch mode
  return _chefGeneralIntent(text)   // run the existing discovery / recommendation flow
}

// ── Cooking intent router ─────────────────────────────────────────────────────
function handleCookingIntent(text) {
  const t = text.toLowerCase()

  // 1) Clear "I want a new recipe" / reset → back to discovery automatically.
  if (chefIsStrongDiscovery(t)) return switchToDiscovery(text)

  // 2) Greetings / thanks stay playful.
  if (/^\s*(hi|hello|hey|yo|namaste|thanks|thank you|thank u|thx|ty)\b/.test(t)) {
    botRespond(chefReply(text))
    return
  }

  // 3) Genuine question about the open recipe → stay in cooking mode.
  if (chefIsCookingQuery(t)) {
    botRespond(chefCookingReply(text, chefCookingRecipe))
    return
  }

  // 4) Softer discovery cues (e.g. "suggest something else") → discovery.
  if (chefIsGenericDiscovery(t)) return switchToDiscovery(text)

  // 4b) A dish / craving (e.g. "I want noodles") → discovery.
  if (chefDetectDish(t)) return switchToDiscovery(text)

  // 5) A fresh ingredient / filter message (e.g. "I have paneer and rice") → discovery.
  if (chefHasEntities(chefUnderstand(text))) return switchToDiscovery(text)

  // 6) Otherwise, keep helping with the current recipe.
  botRespond(chefCookingReply(text, chefCookingRecipe))
}

// ── Cooking answer engine (local, uses the stored recipe as context) ─────────
function chefCookingReply(text, r) {
  const t = text.toLowerCase()
  if (/scale|\bserving|\bserves\b|\bportion|double|twice|halve|\bhalf\b|for \d+|\d+\s*(people|person|serving|portion)/.test(t)) return cookScale(t, r)
  if (/vegan/.test(t)) return cookVegan(r)
  if (/substitut|replace|swap|instead of|don'?t have|out of|alternative/.test(t)) return cookSubs(r)
  if (/health|lighter|less oil|less cream|fewer cal|low[\s-]?cal|guilt/.test(t)) return cookHealthier(r)
  if (/spic|spicy|mild|chilli|chili|too hot|tone down|heat level/.test(t)) return cookSpice(t, r)
  if (/stor|keep|fridge|refriger|leftover|preserve|how long.*last/.test(t)) return cookStorage(r)
  if (/reheat|re-heat|warm (it )?up|microwave|heat it/.test(t)) return cookReheat(r)
  if (/side|serve with|accompan|pair|go(es)? with|along with|what to eat/.test(t)) return cookSides(r)
  if (/step|how do i|how to|method|instruction|explain|walk me|guide me/.test(t)) return cookSteps(t, r)
  if (/\btip|advice|trick|hack|make it better/.test(t)) return cookTips(r)
  if (/nutrition|calorie|protein|carb|\bfat\b|macro/.test(t)) return cookNutrition(r)
  if (/ingredient|what do i need|shopping|grocery/.test(t)) return cookIngredients(r)
  return cookDefault(r)
}

function cookScale(t, r) {
  const base = r.servings || 2
  let target = base
  if (/double|twice/.test(t)) target = base * 2
  else if (/halve|\bhalf\b/.test(t)) target = Math.max(1, Math.round(base / 2))
  else { const m = t.match(/(\d+)/); if (m) target = parseInt(m[1], 10) }
  target = Math.max(1, Math.min(50, target))
  const ratio = target / base
  const lines = (r.ingredients || []).map(i => {
    const raw = parseFloat(i.amount) || 0
    const amt = raw ? raw * ratio : 0
    const disp = amt ? (amt < 10 ? Math.round(amt * 10) / 10 : Math.round(amt)) : ""
    return `• ${disp ? disp + " " : ""}${i.unit ? i.unit + " " : ""}${i.name}`
  })
  return `${r.title} scaled for ${target} serving${target > 1 ? "s" : ""} (from ${base}):\n` +
    lines.join("\n") + `\n\nWant it spicier, lighter, or vegan? Just ask! 😊`
}

function cookVegan(r) {
  if ((r.diet || "").includes("vegan"))
    return `Good news — ${r.title} is already vegan! 🌱 Just check any breads/spice blends are dairy-free.`
  const subs = []
  ;(r.ingredients || []).forEach(i => {
    const n = (i.name || "").toLowerCase()
    for (const k in VEGAN_SUBS) { if (n.includes(k)) { subs.push(`• ${i.name} → ${VEGAN_SUBS[k]}`); break } }
  })
  if (!subs.length) return `${r.title} is pretty plant-friendly already 🌱 — just use oil instead of any ghee/butter.`
  return `To make ${r.title} vegan 🌱, swap:\n` + subs.join("\n") + `\n\nEverything else stays the same — it holds up beautifully!`
}

function cookSubs(r) {
  const subs = []
  ;(r.ingredients || []).forEach(i => {
    const n = (i.name || "").toLowerCase()
    for (const k in COOK_SUBS) { if (n.includes(k)) { subs.push(`• ${i.name} → ${COOK_SUBS[k]}`); break } }
  })
  if (!subs.length) return `Most of ${r.title}'s ingredients are flexible! Tell me which one you're missing and I'll suggest a swap. 🔄`
  return `Handy swaps for ${r.title} 🔄:\n` + subs.join("\n") + `\n\nMissing something else? Just name it!`
}

function cookSteps(t, r) {
  const steps = r.steps || []
  if (!steps.length) return `I don't have detailed steps for ${r.title}, but tell me where you're stuck and I'll guide you! 👩‍🍳`
  const m = t.match(/step\s*(\d+)/)
  if (m) {
    const n = parseInt(m[1], 10)
    if (steps[n - 1]) return `Step ${n} of ${r.title}:\n${steps[n - 1]}`
    return `${r.title} has ${steps.length} steps — pick a number from 1 to ${steps.length}.`
  }
  return `Here's how to make ${r.title} 👩‍🍳:\n` +
    steps.map((s, i) => `${i + 1}. ${s}`).join("\n") + `\n\nAsk me to explain any step!`
}

function cookHealthier(r) {
  const tips = [
    "Use half the oil/ghee and a non-stick pan",
    "Swap cream for blended cashews or thick curd",
    "Bake or air-fry instead of deep-frying",
    "Add extra veggies for fibre",
    "Use brown rice or multigrain atta",
    "Go easy on sugar and salt"
  ]
  return `Lighter ${r.title} 💪:\n` + tips.map(x => "• " + x).join("\n") + `\n\nSmall swaps, same comfort!`
}

function cookSpice(t, r) {
  if (/mild|less|tone down|too spicy|reduce|not spicy/.test(t))
    return `To mellow ${r.title} 🧂:\n• Stir in curd, cream or coconut milk\n• Add a pinch of sugar or a squeeze of lemon\n• Cut back on chilli & garam masala\n• Serve with cooling raita`
  return `To fire up ${r.title} 🌶️:\n• Add chopped green chillies or red chilli powder\n• Finish with a pinch of garam masala\n• Temper dried red chillies in hot oil\n• A little black pepper at the end\nGo slow — you can't un-spice it! 😄`
}

function cookStorage(r) {
  return `Storing ${r.title} 📦:\n• Cool fully, then refrigerate in an airtight box\n• Keeps 2–3 days in the fridge\n• Gravy dishes freeze well up to ~1 month\n• Store rice/breads separately for best texture`
}

function cookReheat(r) {
  return `Reheating ${r.title} 🔥:\n• Stovetop: low heat with a splash of water, stir gently\n• Microwave: cover loosely, 1–2 min, stir halfway\n• Loosen thick gravies with a little water or milk\n• Reheat only what you'll eat`
}

function cookSides(r) {
  const t = (r.title || "").toLowerCase()
  let sides
  if (/biryani|pulao|fried rice|rice/.test(t)) sides = ["Cucumber-onion raita", "Papad", "Salan or kadhi", "Fresh salad & lemon"]
  else if (/dosa|idli|uttapam|vada/.test(t)) sides = ["Coconut chutney", "Tomato chutney", "Sambar", "Filter coffee"]
  else if (/samosa|pakora|tikki|chaat|kabab|cutlet|snack|chilla/.test(t)) sides = ["Green mint chutney", "Tamarind chutney", "Masala chai", "Sliced onions & lemon"]
  else sides = ["Steamed or jeera rice", "Roti / naan / paratha", "Onion-cucumber salad", "Boondi raita"]
  return `Lovely with ${r.title} 🍽:\n` + sides.map(s => "• " + s).join("\n") + `\n\nWant a lighter or vegan side? Ask away!`
}

function cookTips(r) {
  return `Chef tips for ${r.title} 💡:\n• Prep & measure everything before you start\n• Cook onions till golden for deeper flavour\n• Bloom whole spices in hot oil first\n• Taste and adjust salt/acidity at the end\n• Rest a few minutes before serving`
}

function cookNutrition(r) {
  const n = r.nutrition
  if (!n) return `I don't have exact numbers for ${r.title}, but it's portioned for ${r.servings || 2}. Want a lighter version? 💪`
  return `${r.title} — per serving (approx):\n• ${n.calories || "—"} kcal\n• Protein ${n.protein || "—"}g\n• Carbs ${n.carbs || "—"}g\n• Fat ${n.fat || "—"}g\n\nWant to lighten it up? Just ask! 💪`
}

function cookIngredients(r) {
  const ings = r.ingredients || []
  if (!ings.length) return `Tell me what you have and I'll map it to ${r.title}. 🧺`
  return `For ${r.title} (serves ${r.servings || 2}):\n` +
    ings.map(i => `• ${i.amount ? i.amount + " " : ""}${i.unit ? i.unit + " " : ""}${i.name}`).join("\n") +
    `\n\n(plus pantry staples like salt & oil)`
}

function cookDefault(r) {
  return `I'm right here for ${r.title}! 👩‍🍳 I can help with:\n• 🔄 Substitutions   • 🌱 Vegan version\n• 💪 Healthier swaps   • 🍽 Side dishes\n• 🧂 Spice level   • 📦 Storage   • 🔥 Reheating\n• 📖 Explaining steps   • 🍽 Scaling servings\nWhat would you like?`
}

// ── Route cooking-mode messages before general intent handling ───────────────
const _chefGeneralIntent = handleChefIntent
handleChefIntent = function (text) {
  if (chefMode === "cooking" && chefCookingRecipe) return handleCookingIntent(text)
  return _chefGeneralIntent(text)
}

// ── Hook recipe selection: wrap the existing global openRecipe (app.js) ──────
// Non-invasive — we call the original, then enter cooking mode with the recipe
// it stored in `currentRecipe`. The Recommendation Engine is untouched.
if (typeof openRecipe === "function") {
  const _chefOrigOpenRecipe = openRecipe
  openRecipe = function (id) {
    const result = _chefOrigOpenRecipe(id)
    Promise.resolve(result)
      .then(() => {
        if (typeof currentRecipe !== "undefined" && currentRecipe) chefEnterCookingMode(currentRecipe)
      })
      .catch(() => {})
    return result
  }
  if (typeof window !== "undefined") window.openRecipe = openRecipe
}

// ═════════════════════════════════════════════════════════════════════════════
// MULTIMODAL INPUT (Step 11) — Voice + Vision launcher
//
// Adds two extra ways to talk to Chef Mimi, both feeding the EXISTING pipeline:
//   🎤 Voice  → browser SpeechRecognition → transcript → chefUserSay() (same as typing)
//   📷 Vision → opens the EXISTING vision modal (openVision) → existing /api/vision
//
// No new backend, no new AI provider, no duplicated Vision UI or logic.
// ═════════════════════════════════════════════════════════════════════════════

// ── Vision launcher ──────────────────────────────────────────────────────────
// Reuses the app's existing vision modal (camera + upload + confirmation table).
function chefVisionTrigger() {
  // During cooking, scanning means "start a new ingredient search" — confirm first.
  if (chefMode === "cooking" && chefCookingRecipe) {
    const ok = window.confirm("Would you like to start a new ingredient search? This will leave cooking mode.")
    if (!ok) return
    chefBackToDiscover(true) // exit cooking → discovery (keeps history, drops a divider)
  }
  // Hide the chat panel so the existing vision modal is fully visible, then open it.
  minimizeChef()
  if (typeof openVision === "function") openVision()
  else showToast("Vision isn't available right now")
}

// ── Voice input (client-side Web Speech API only) ────────────────────────────
let chefRecognition = null
let chefListening = false

function chefToggleVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) { showToast("🎤 Voice input isn't supported in this browser"); return }
  if (chefListening) { stopChefVoice(); return }
  startChefVoice(SR)
}

function startChefVoice(SR) {
  const input = document.getElementById("chef-input")
  const mic   = document.getElementById("chef-mic")
  let finalText = ""

  try {
    chefRecognition = new SR()
    chefRecognition.lang = "en-IN"          // English (India); recogniser is fully client-side
    chefRecognition.interimResults = true
    chefRecognition.continuous = false       // auto-stops after a natural pause
    chefRecognition.maxAlternatives = 1

    chefListening = true
    if (mic) mic.classList.add("listening")
    if (input) { input.dataset.ph = input.placeholder; input.placeholder = "Listening…"; }
    document.getElementById("chef-companion")?.classList.add("open") // make sure chat is visible

    chefRecognition.onresult = e => {
      let interim = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const tr = e.results[i][0].transcript
        if (e.results[i].isFinal) finalText += tr
        else interim += tr
      }
      if (input) input.value = (finalText + interim).trim()
    }

    chefRecognition.onerror = e => {
      chefVoiceCleanup()
      chefRecognition = null
      if (e.error === "not-allowed" || e.error === "service-not-allowed")
        showToast("🎤 Microphone permission denied")
      else if (e.error !== "aborted")
        showToast("🎤 Couldn't hear that — try again")
    }

    chefRecognition.onend = () => {
      const text = (finalText || (input ? input.value : "")).trim()
      chefVoiceCleanup()
      chefRecognition = null
      if (text) { if (input) input.value = ""; chefUserSay(text) } // same path as typed input
    }

    chefRecognition.start()
  } catch (err) {
    chefVoiceCleanup()
    chefRecognition = null
    showToast("🎤 Couldn't start voice input")
  }
}

// User pressed the mic again (or we need to stop) → end recognition; onend sends text.
function stopChefVoice() {
  if (chefRecognition) { try { chefRecognition.stop() } catch (_) {} }
  else chefVoiceCleanup()
}

// Reset the listening UI (mic glow + placeholder).
function chefVoiceCleanup() {
  chefListening = false
  const mic = document.getElementById("chef-mic")
  if (mic) mic.classList.remove("listening")
  const input = document.getElementById("chef-input")
  if (input && input.dataset.ph !== undefined) { input.placeholder = input.dataset.ph; delete input.dataset.ph }
}

// Hide the mic button if the browser has no SpeechRecognition support.
;(function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) { const m = document.getElementById("chef-mic"); if (m) m.style.display = "none" }
})()

// ═════════════════════════════════════════════════════════════════════════════
// INTENT CLASSIFIER (Step 12) — conversational understanding (pure JS, no AI)
//
// Turns natural messages into one of: INGREDIENT · DISH · DISCOVERY · SMALLTALK
// · UNKNOWN. Dish/craving/discovery requests get warm, guiding responses (and a
// search when we can satisfy them) instead of the old generic fallback.
// The Recommendation Engine and Cooking Assistant are unchanged.
// ═════════════════════════════════════════════════════════════════════════════

const capitalize = s => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1)

const MOOD_PHRASE = {
  lazy:    "Looking for something quick",
  healthy: "Something healthy, love it",
  comfort: "Comfort food, yes please",
  festive: "Feeling festive",
  fancy:   "Something a little fancy",
  snack:   "Snack time"
}

// Dish / craving catalogue. `seed` = ingredient(s) to search with (null → just
// ask a follow-up because we can't directly satisfy it from the local DB).
const CHEF_DISHES = [
  { match: /noodles|maggi|hakka|chow ?mein/,            label: "noodles",       emoji: "🍜", seed: ["noodles"] },
  { match: /pasta|spaghetti|penne|macaroni|arrabbiata/, label: "pasta",         emoji: "🍝", seed: ["pasta"] },
  { match: /sandwich/,                                  label: "sandwich",      emoji: "🥪", seed: ["bread"] },
  { match: /\btoast\b/,                                 label: "toast",         emoji: "🍞", seed: ["bread"] },
  { match: /wrap|frankie|kathi|\broll\b/,               label: "wrap",          emoji: "🌯", seed: ["atta"] },
  { match: /fried rice/,                                label: "fried rice",    emoji: "🍚", seed: ["rice"] },
  { match: /biryani|pulao/,                             label: "biryani",       emoji: "🍛", seed: ["rice"] },
  { match: /manchurian|chilli paneer|schezwan|indo[- ]?chinese|chinese/, label: "Indo-Chinese", emoji: "🥢", seed: ["noodles"] },
  { match: /rajma/,                                     label: "rajma",         emoji: "🍲", seed: ["rajma"] },
  { match: /chole|chana masala|chickpea/,               label: "chole",         emoji: "🍲", seed: ["chickpeas"] },
  { match: /dosa|idli|uttapam|vada/,                    label: "South Indian",  emoji: "🥞", seed: ["rice"] },
  { match: /\bpoha\b/,                                  label: "poha",          emoji: "🍚", seed: ["poha"] },
  { match: /paratha|thepla|chilla/,                     label: "paratha",       emoji: "🫓", seed: ["atta"] },
  { match: /\bsoup\b/,                                  label: "soup",          emoji: "🍲", seed: ["tomato"] },
  { match: /salad|sprout/,                              label: "salad",         emoji: "🥗", seed: ["sprouts"] },
  { match: /\boats\b/,                                  label: "oats",          emoji: "🥣", seed: ["oats"] },
  { match: /paneer/,                                    label: "paneer dish",   emoji: "🧀", seed: ["paneer"] },
  { match: /\bdal\b|tadka|makhani/,                     label: "dal",           emoji: "🍲", seed: ["toor dal"] },
  { match: /cake|dessert|sweet|mithai|halwa|kheer|something sweet/, label: "something sweet", emoji: "🍮", seed: ["sugar"] },
  { match: /italian|continental/,                       label: "Italian",       emoji: "🍝", seed: ["pasta"] },
  // cravings we can't directly satisfy from the local DB → follow-up only
  { match: /\bpizza\b/,                                 label: "pizza",         emoji: "🍕", seed: null },
  { match: /\bburger\b/,                                label: "burger",        emoji: "🍔", seed: null }
]

function chefDetectDish(t) {
  for (const d of CHEF_DISHES) if (d.match.test(t)) return d
  return null
}

function chefIsDiscoveryRequest(t) {
  return /what (can|should|do) i (cook|make|eat|have)/.test(t)
    || /\b(recommend|suggest|recipe|recipes|cook|meal|dish|idea|options)\b/.test(t)
    || /\b(dinner|lunch|breakfast|brunch|snack)\b/.test(t)
    || /\b(quick|healthy|comfort|easy|tasty|light|fancy|festive)\b/.test(t)
    || /\bi (want|feel like|am craving|crave|fancy|am in the mood)\b/.test(t)
    || /something (to eat|tasty|nice|good|different|sweet|spicy)/.test(t)
}

// Returns { intent, entities?, dish? }
function chefClassifyIntent(text) {
  const t = (text || "").toLowerCase().trim()
  const entities = chefUnderstand(text)

  if (entities.ingredients.length) return { intent: "INGREDIENT", entities }

  const dish = chefDetectDish(t)
  if (dish) return { intent: "DISH", dish, entities }

  if (chefIsSmallTalk(text)) return { intent: "SMALLTALK" }

  if (chefIsDiscoveryRequest(t) || entities.mood || entities.meal || entities.diet || entities.cuisine)
    return { intent: "DISCOVERY", entities }

  return { intent: "UNKNOWN" }
}

// DISH → apply any extra prefs, then either search (if we can satisfy it) or ask.
function chefHandleDish(dish, entities) {
  chefApplyEntities(entities) // applies any mood/meal/diet/cuisine found alongside

  if (dish.seed) {
    dish.seed.forEach(s => {
      if (!chefContext.ingredients.includes(s)) chefContext.ingredients.push(s)
      if (typeof addIngredient === "function") addIngredient(s)
    })
    botRespond(
      `${dish.emoji} ${capitalize(dish.label)} — great choice! I've pulled up some ideas behind me. ` +
      `Tell me what else is in your kitchen and I'll tailor them. 👀`,
      () => { chefGoHome(); if (typeof findRecipes === "function") findRecipes() }
    )
  } else {
    botRespond(
      `${dish.emoji} ${capitalize(dish.label)}, yum! I don't have a dedicated ${dish.label} recipe yet — ` +
      `tell me what ingredients you have and I'll find the closest tasty match. 🧺`
    )
  }
}

// DISCOVERY → if we already know ingredients, search; otherwise ask a tailored
// follow-up that reflects what we understood (mood / meal).
function chefHandleDiscovery(entities) {
  chefApplyEntities(entities)
  const c = chefContext

  if (c.ingredients.length) {
    const { msg, doSearch } = chefContextResponse()
    botRespond(msg, doSearch ? () => { chefGoHome(); if (typeof findRecipes === "function") findRecipes() } : null)
    return
  }

  let lead = "Let's find you something delicious!"
  if (c.mood && MOOD_PHRASE[c.mood]) lead = `${MOOD_EMOJI[c.mood] || "😋"} ${MOOD_PHRASE[c.mood]}!`
  else if (c.meal && c.meal !== "any") lead = `🍽 ${capitalize(c.meal)} it is!`
  botRespond(`${lead} What ingredients do you have available? Even 2–3 work — like 'paneer, rice and peas'. 🧺`)
}

// Friendly last-resort message (replaces the old "smart understanding" line).
function chefGuidingFallback() {
  return CHEF_PICK([
    "I didn't quite catch that 😋 — tell me your ingredients (like 'paneer, rice') or what you're craving!",
    "Hmm, let's cook something 🍲 — share a few ingredients or a dish you fancy and I'll take it from there.",
    "Tell me what's in your kitchen, or say something like 'I want noodles' or 'suggest a quick dinner'. 🧺"
  ])
}
