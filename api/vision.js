// api/vision.js
// ─────────────────────────────────────────────────────────────────────────────
// HTTP entry point for Vision-Based Pantry Detection (Vercel serverless).
//
// Accepts an image, runs it through the provider-agnostic visionService, and
// returns a structured ingredient list:
//   { "ingredients": [ { name, quantity, unit, confidence }, ... ] }
//
// This endpoint is intentionally THIN — transport concerns only:
//   • CORS + preflight
//   • method/validation guards
//   • read API keys from the environment
//   • parse the image out of the request body (data URL or raw base64)
//   • delegate to visionService and shape the response/errors
//
// It does NOT touch the Recommendation Engine. Detection only. If vision is
// unavailable, it returns a clean error so the frontend can fall back to manual
// ingredient entry without breaking the recipe-search flow.
// ─────────────────────────────────────────────────────────────────────────────

const visionService = require("./_lib/visionService")
const { formatError } = require("./_lib/formatter")

// Pull base64 data + mimeType out of either a data URL or a raw base64 string.
function parseImageInput(image, fallbackMime) {
  if (typeof image !== "string" || !image.trim()) return null
  const dataUrl = image.match(/^data:([^;]+);base64,(.*)$/s)
  if (dataUrl) {
    return { data: dataUrl[2], mimeType: dataUrl[1] }
  }
  // Raw base64 (strip any stray whitespace/newlines).
  return { data: image.replace(/\s+/g, ""), mimeType: fallbackMime || "image/jpeg" }
}

module.exports = async (req, res) => {
  // ── CORS ──────────────────────────────────────────────────────────────────
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  if (req.method === "OPTIONS") return res.status(200).end()
  if (req.method !== "POST")    return res.status(405).json(formatError("Method not allowed"))

  // ── API keys (from environment) ─────────────────────────────────────────────
  const keys = {
    geminiKey:       process.env.GEMINI_KEY  || "",
    geminiBackupKey: process.env.GEMINI_KEY2 || ""
  }

  // Vision unavailable → 503 so the client can offer manual entry.
  if (!visionService.isAvailable(keys)) {
    return res.status(503).json(formatError("Vision is not available — please add ingredients manually"))
  }

  // ── Parse the image from the body ───────────────────────────────────────────
  const body = req.body || {}
  const image = parseImageInput(body.image, body.mimeType)
  if (!image) {
    return res.status(400).json(formatError("An image is required"))
  }

  // ── Detect + respond ──────────────────────────────────────────────────────
  try {
    const result = await visionService.detect(image, keys)
    return res.status(200).json({ ingredients: result.ingredients })
  } catch (err) {
    console.error("Vision error:", err.message)
    const is429 = err.message?.includes("429")
    return res
      .status(is429 ? 429 : 502)
      .json(formatError(is429
        ? "Vision quota exhausted — try again in a minute or add ingredients manually"
        : err.message || "Vision detection failed"
      ))
  }
}
