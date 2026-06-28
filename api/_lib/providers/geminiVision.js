// api/_lib/providers/geminiVision.js
// ─────────────────────────────────────────────────────────────────────────────
// Gemini Vision detection provider.
//
// Implements the visionService provider interface:
//   • name
//   • isAvailable(keys)               → boolean
//   • detect({ data, mimeType }, keys) → { ingredients: [...] }
//
// Responsibility is NARROW: send an image to Gemini Vision, get back a list of
// detected ingredients. It knows nothing about recipes or the Recommendation
// Engine. A future provider (YOLO, OpenCV, etc.) implements the same interface
// and is swapped in via visionService without touching anything else.
//
// On 429, any API error, missing key, or unparseable output it throws, and the
// visionService / endpoint translate that into a clean error response so the
// frontend can fall back to manual entry.
// ─────────────────────────────────────────────────────────────────────────────

const { GEMINI_BASE } = require("../config")
const { fetchWithRetry } = require("../http")

const name = "gemini-vision"

function isAvailable(keys = {}) {
  return Boolean(keys.geminiKey)
}

// Concise prompt — vision only, strict JSON, never guess quantities.
const PROMPT = `You are a kitchen vision assistant. Identify the distinct edible food ingredients visible in this image.
Reply with ONLY valid JSON, no markdown, in this exact shape:
{"ingredients":[{"name":"","quantity":number_or_null,"unit":"","confidence":0_to_1}]}
Rules: list only clearly visible edible ingredients; use singular lowercase names; if you cannot confidently estimate quantity use null (do not guess); confidence is 0-1.`

// ── interface: detect ────────────────────────────────────────────────────────
async function detect({ data, mimeType = "image/jpeg" } = {}, keys = {}) {
  if (!data) throw new Error("No image data provided")

  let response = await callGemini(data, mimeType, keys.geminiKey)
  if (!response && keys.geminiBackupKey) {
    response = await callGemini(data, mimeType, keys.geminiBackupKey)
  }
  if (!response) throw new Error("Vision provider unavailable")

  const parsed = parseJson(response)
  if (!parsed) throw new Error("Could not parse vision response")

  return { ingredients: sanitize(parsed.ingredients) }
}

// ── single multimodal call (returns parsed response JSON or null) ────────────
async function callGemini(base64, mimeType, key) {
  if (!key) return null
  try {
    const res = await fetchWithRetry(`${GEMINI_BASE}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: PROMPT },
            { inlineData: { mimeType, data: base64 } }
          ]
        }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
      })
    }, 0) // retries = 0 → one call per key (no 3s backoff). Backup key is the fallback.
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ── parse the JSON object out of the model text ──────────────────────────────
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

// ── normalize / harden the model output ──────────────────────────────────────
// Guarantees the documented shape regardless of what the model returns.
function sanitize(list) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const item of list) {
    if (!item || typeof item !== "object") continue
    const nm = String(item.name || "").trim()
    if (!nm) continue

    // Quantity: a positive finite number, else null (never a guess).
    let quantity = null
    const q = Number(item.quantity)
    if (Number.isFinite(q) && q > 0) quantity = q

    // Confidence: clamp to 0..1, default 0.
    let confidence = Number(item.confidence)
    confidence = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0

    out.push({
      name:       nm.toLowerCase(),
      quantity,
      unit:       String(item.unit || "").trim(),
      confidence: Number(confidence.toFixed(2))
    })
  }
  return out
}

module.exports = { name, isAvailable, detect }
