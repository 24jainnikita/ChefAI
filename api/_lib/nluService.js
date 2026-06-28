// api/_lib/nluService.js
// ─────────────────────────────────────────────────────────────────────────────
// Provider-agnostic NLU service (natural-language → filter entities).
//
// Mirrors the visionService / reasoningEngine abstraction. The endpoint talks
// only to this module; swapping the LLM means registering a new provider.
//
// It is INDEPENDENT of the Recommendation Engine and the Reasoning Engine — it
// only extracts { ingredients, mood, meal, diet, cuisine } from text. It never
// produces recipes.
// ─────────────────────────────────────────────────────────────────────────────

const geminiNluProvider = require("./providers/geminiNlu")

const providers = { [geminiNluProvider.name]: geminiNluProvider }
let activeProvider = geminiNluProvider.name

function registerProvider(provider) {
  if (!provider || !provider.name || typeof provider.understand !== "function") {
    throw new Error("Invalid NLU provider")
  }
  providers[provider.name] = provider
}

function useProvider(name) {
  if (providers[name]) activeProvider = name
}

function isAvailable(keys = {}) {
  const provider = providers[activeProvider]
  return Boolean(provider && provider.isAvailable(keys))
}

// Throws on failure so the endpoint can return a clean error and the client can
// fall back gracefully.
async function understand(message, keys = {}) {
  const provider = providers[activeProvider]
  if (!provider) throw new Error("No NLU provider registered")
  if (!provider.isAvailable(keys)) throw new Error("NLU provider not configured")
  return provider.understand(message, keys)
}

module.exports = { understand, isAvailable, registerProvider, useProvider }
