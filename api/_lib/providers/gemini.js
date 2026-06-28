// api/_lib/providers/gemini.js
// ─────────────────────────────────────────────────────────────────────────────
// Gemini reasoning provider.
//
// Implements the reasoningEngine provider interface:
//   • name
//   • isAvailable(keys)            → boolean
//   • enhance(recipes, context, keys) → { recipes, moodTip }
//
// Gemini does NOT generate recipes or descriptions (descriptions now come from
// static metadata). It reasons over the TOP candidates produced by the JS
// Recommendation Engine to:
//   • re-rank for the user's mood/diet/meal
//   • explain why each recipe fits the mood
//   • suggest ONLY uncommon / contextual substitutions (common ones already
//     come from the static substitution DB and are passed in as "covered")
//
// Expanded reasoning context per recipe — matched ingredients, missing
// ingredients, recommendation score — is included while keeping the prompt
// under ~500 tokens (arrays are truncated, candidates capped by the caller).
//
// On 429, any API error, missing key, or unparseable output, it returns the
// input recipes unchanged with an empty moodTip.
// ─────────────────────────────────────────────────────────────────────────────

const { GEMINI_BASE } = require("../config")
const { fetchWithRetry } = require("../http")

const name = "gemini"

function isAvailable(keys = {}) {
  return Boolean(keys.geminiKey)
}

// ── interface: enhance ────────────────────────────────────────────────────────
async function enhance(recipes, context = {}, keys = {}) {
  if (!recipes || !recipes.length) return { recipes, moodTip: "" }

  try {
    const prompt = buildPrompt(recipes, context)

    let data = await callGemini(prompt, keys.geminiKey)
    if (!data && keys.geminiBackupKey) data = await callGemini(prompt, keys.geminiBackupKey)
    if (!data) return { recipes, moodTip: "" } // 429 / error → skip

    const parsed = parseJson(data)
    if (!parsed) return { recipes, moodTip: "" } // unparseable → skip

    return {
      recipes: applyEnhancements(recipes, parsed),
      moodTip: typeof parsed.moodTip === "string" ? parsed.moodTip : ""
    }
  } catch (err) {
    console.warn("Gemini reasoning skipped:", err.message)
    return { recipes, moodTip: "" }
  }
}

// ── compact prompt (<500 tokens) with expanded reasoning context ─────────────
function buildPrompt(recipes, context) {
  const mood = context.mood || "any"
  const diet = context.diet || "any"
  const meal = context.meal || "any"

  // Slim per-recipe context: score + matched/missing (truncated) + ingredients
  // still needing a substitution (uncovered by the static DB).
  const slim = recipes.map(r => ({
    id:      r.id,
    title:   r.title,
    score:   typeof r.matchScore === "number" ? Number(r.matchScore.toFixed(2)) : null,
    have:    (r.matchedIngredients || []).slice(0, 4),
    missing: (r.missingIngredients || []).slice(0, 4),
    needSub: (r.substitutionGaps || []).slice(0, 3)
  }))

  return `You are ChefAI's culinary reasoning assistant.
User preferences -> mood: ${mood}, diet: ${diet}, meal: ${meal}.
Candidates (JSON, score is 0-1 from our recommender; "have"=user ingredients matched, "missing"=ingredients they lack, "needSub"=ingredients with no common substitute yet):
${JSON.stringify(slim)}
Tasks: (1) re-rank best-first using score + mood/diet fit; (2) for each, explain mood fit; (3) suggest substitutions ONLY for "needSub" items or contextual swaps. Do not repeat common substitutions.
Reply with ONLY valid JSON, no markdown:
{"ranking":[ids best first],"moodTip":"one short friendly line",
"recipes":{"<id>":{"moodMatch":"why it fits, max 15 words","substitutions":["item -> alt"]}}}
Keep all text short. Do not invent recipes or descriptions.`
}

// ── single call (returns parsed response JSON or null) ───────────────────────
async function callGemini(prompt, key) {
  if (!key) return null
  try {
    const res = await fetchWithRetry(`${GEMINI_BASE}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 512 }
      })
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ── parse JSON object out of the model text ──────────────────────────────────
function parseJson(data) {
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || ""
  const clean = rawText.replace(/```json/gi, "").replace(/```/g, "").trim()
  const match = clean.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

// ── merge model output (additive) + re-rank ──────────────────────────────────
function applyEnhancements(recipes, parsed) {
  const byId = new Map(recipes.map(r => [String(r.id), r]))

  if (parsed.recipes && typeof parsed.recipes === "object") {
    for (const [id, enh] of Object.entries(parsed.recipes)) {
      const r = byId.get(String(id))
      if (!r || !enh || typeof enh !== "object") continue

      if (enh.moodMatch) r.moodMatch = String(enh.moodMatch)

      // Append contextual substitutions to the static ones, de-duplicated.
      if (Array.isArray(enh.substitutions) && enh.substitutions.length) {
        const existing = new Set((r.substitutions || []).map(s => s.toLowerCase()))
        const extra = enh.substitutions
          .map(String)
          .filter(s => !existing.has(s.toLowerCase()))
        r.substitutions = [...(r.substitutions || []), ...extra]
      }

      r.reasoned = true
    }
  }

  if (Array.isArray(parsed.ranking) && parsed.ranking.length) {
    const rank = parsed.ranking.map(String)
    const pos = id => {
      const i = rank.indexOf(String(id))
      return i === -1 ? Number.POSITIVE_INFINITY : i
    }
    return [...recipes].sort((a, b) => pos(a.id) - pos(b.id))
  }

  return recipes
}

module.exports = { name, isAvailable, enhance }
