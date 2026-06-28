// api/_lib/visionService.js
// ─────────────────────────────────────────────────────────────────────────────
// Provider-agnostic Vision service (ingredient detection only).
//
// Mirrors the reasoningEngine abstraction: the rest of the app talks ONLY to
// this module and never imports a specific vision model. Swapping Gemini Vision
// for YOLO / OpenCV / a custom model means adding a provider that implements the
// interface and registering it here — no other code changes.
//
// Provider interface:
//   {
//     name: string,
//     isAvailable(keys): boolean,
//     detect({ data, mimeType }, keys): Promise<{ ingredients: [...] }>
//   }
//
// IMPORTANT: this service is completely independent of the Recommendation
// Engine. It returns a detected ingredient list only; it never produces recipes.
// ─────────────────────────────────────────────────────────────────────────────

const geminiVisionProvider = require("./providers/geminiVision")

// Registered providers, keyed by name.
const providers = {
  [geminiVisionProvider.name]: geminiVisionProvider
}

// Active provider (could later be driven by an env var or request param).
let activeProvider = geminiVisionProvider.name

// Register or replace a vision provider implementation.
function registerProvider(provider) {
  if (!provider || !provider.name || typeof provider.detect !== "function") {
    throw new Error("Invalid vision provider")
  }
  providers[provider.name] = provider
}

// Choose which provider the service uses.
function useProvider(name) {
  if (providers[name]) activeProvider = name
}

// Is vision usable right now (provider present + has what it needs)?
function isAvailable(keys = {}) {
  const provider = providers[activeProvider]
  return Boolean(provider && provider.isAvailable(keys))
}

// ── public: detect ingredients from an image ─────────────────────────────────
// image: { data: <base64 string>, mimeType: <string> }
// Returns { ingredients: [{ name, quantity, unit, confidence }] }.
// Throws on failure so the endpoint can return a clean, informative error.
async function detect(image, keys = {}) {
  const provider = providers[activeProvider]
  if (!provider) throw new Error("No vision provider registered")
  if (!provider.isAvailable(keys)) throw new Error("Vision provider not configured")

  const result = await provider.detect(image, keys)
  if (!result || !Array.isArray(result.ingredients)) {
    return { ingredients: [] }
  }
  return { ingredients: result.ingredients }
}

module.exports = { detect, isAvailable, registerProvider, useProvider }
