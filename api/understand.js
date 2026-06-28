// api/understand.js
// ─────────────────────────────────────────────────────────────────────────────
// HTTP endpoint for conversational understanding (Vercel serverless).
//
// Accepts a free-text message and returns structured filter entities:
//   { "entities": { ingredients:[], mood, meal, diet, cuisine } }
//
// Thin transport layer only. It NEVER generates recipes and does not touch the
// Recommendation Engine, Reasoning Engine, Vision, or Pantry. If the LLM is
// unavailable it returns a clean error (503/502) so the chat can fall back to
// its local parser and show a graceful message — the app keeps working.
// ─────────────────────────────────────────────────────────────────────────────

const nlu = require("./_lib/nluService")
const { formatError } = require("./_lib/formatter")

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  if (req.method === "OPTIONS") return res.status(200).end()
  if (req.method !== "POST")    return res.status(405).json(formatError("Method not allowed"))

  const keys = {
    geminiKey:       process.env.GEMINI_KEY  || "",
    geminiBackupKey: process.env.GEMINI_KEY2 || ""
  }
  if (!nlu.isAvailable(keys)) {
    return res.status(503).json(formatError("Understanding unavailable"))
  }

  const { message } = req.body || {}
  if (!message || !String(message).trim()) {
    return res.status(400).json(formatError("A message is required"))
  }

  try {
    const entities = await nlu.understand(String(message).trim(), keys)
    return res.status(200).json({ entities })
  } catch (err) {
    console.error("Understand error:", err.message)
    return res.status(502).json(formatError(err.message || "Understanding failed"))
  }
}
