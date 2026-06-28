// api/_lib/reasoningEngine.js
// ─────────────────────────────────────────────────────────────────────────────
// Provider-agnostic reasoning interface.
//
// The recommendation pipeline talks ONLY to this module — it never imports a
// specific LLM. Swapping Gemini for another model (OpenAI, Claude, a local
// model, etc.) means adding a provider that implements the interface and
// registering it here; the pipeline doesn't change.
//
// Provider interface:
//   {
//     name: string,
//     isAvailable(keys): boolean,
//     enhance(recipes, context, keys): Promise<{ recipes, moodTip }>
//   }
//
// Contract: enhance() must be non-destructive on failure — if a provider can't
// run (no key, error, rate limit), the pipeline keeps the JS-ranked recipes.
// ─────────────────────────────────────────────────────────────────────────────

const geminiProvider = require("./providers/gemini")

// Registered providers, keyed by name.
const providers = {
  [geminiProvider.name]: geminiProvider
}

// Active provider (could later be driven by an env var or request param).
let activeProvider = geminiProvider.name

// Register or replace a provider implementation.
function registerProvider(provider) {
  if (!provider || !provider.name || typeof provider.enhance !== "function") {
    throw new Error("Invalid reasoning provider")
  }
  providers[provider.name] = provider
}

// Choose which provider the pipeline uses.
function useProvider(name) {
  if (providers[name]) activeProvider = name
}

// ── public: enhance via the active provider ──────────────────────────────────
// Always resolves to { recipes, moodTip }. If the provider is unavailable or
// throws, returns the input recipes unchanged with an empty moodTip.
async function enhance(recipes, context = {}, keys = {}) {
  const provider = providers[activeProvider]
  if (!provider || !provider.isAvailable(keys)) {
    return { recipes, moodTip: "" }
  }
  try {
    const result = await provider.enhance(recipes, context, keys)
    // Defensive: a misbehaving provider must never break the pipeline.
    if (!result || !Array.isArray(result.recipes)) {
      return { recipes, moodTip: "" }
    }
    return { recipes: result.recipes, moodTip: result.moodTip || "" }
  } catch (err) {
    console.warn(`Reasoning provider "${activeProvider}" failed:`, err.message)
    return { recipes, moodTip: "" }
  }
}

module.exports = { enhance, registerProvider, useProvider }
