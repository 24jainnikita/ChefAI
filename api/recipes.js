// api/recipes.js

const MOOD_DESC = {
  lazy: "quick and easy, ready in under 20 minutes, minimal steps",
  festive: "celebratory, rich, flavourful, great for guests",
  healthy: "light, nutritious, low-calorie, balanced",
  comfort: "hearty, warm, satisfying, soul food",
  fancy: "impressive, restaurant-style, elaborate presentation",
  snack: "small portion, quick snack, finger food"
};

const PANTRY = [
  "salt",
  "water",
  "oil",
  "sugar",
  "black pepper",
  "turmeric",
  "red chili powder",
  "cumin seeds",
  "mustard seeds",
  "hing",
  "curry leaves"
];

function buildPrompt({ ingredients, mood, cuisine, diet, meal }) {
  const moodText = mood ? MOOD_DESC[mood] || mood : "any style";
  const cuisineText = cuisine === "indian" ? "Indian" : "any cuisine";
  const dietText =
    diet === "veg"
      ? "strictly vegetarian (no meat, no eggs, no fish)"
      : diet === "nonveg"
      ? "non-vegetarian is fine"
      : diet === "vegan"
      ? "strictly vegan (no dairy, no eggs, no meat)"
      : "any diet";

  const mealText =
    meal === "breakfast"
      ? "for breakfast"
      : meal === "lunch"
      ? "for lunch"
      : meal === "dinner"
      ? "for dinner"
      : "any meal";

  const ingList = ingredients.join(", ");
  const pantryNote = `You can assume the user always has these pantry staples: ${PANTRY.join(", ")}.`;

  return `You are a recipe assistant specializing in ${cuisineText} cooking.

A user has these ingredients: ${ingList}.
${pantryNote}

Generate EXACTLY 6 recipes that:
- Use ONLY the ingredients listed plus pantry staples
- Are ${moodText}
- Are ${dietText}
- Cuisine style: ${cuisineText}
- Meal type: ${mealText}
- Use Indian measurement units: cups, tsp, tbsp — NOT oz or ml
- Are realistic, cookable recipes

Respond ONLY with a valid JSON array. No markdown, no explanation, no backticks.

Format:
[
  {
    "id": 1,
    "title": "Recipe Name",
    "readyInMinutes": 25,
    "servings": 2,
    "diet": "vegetarian",
    "ingredients": [
      {"name": "paneer", "amount": 200, "unit": "grams"},
      {"name": "tomato", "amount": 2, "unit": "pieces"}
    ],
    "steps": [
      "Heat oil in a pan.",
      "Add cumin seeds and let them splutter.",
      "Add chopped tomatoes and cook for 5 minutes."
    ],
    "nutrition": {
      "calories": 320,
      "protein": 18,
      "carbs": 24,
      "fat": 14
    },
    "emoji": "🍛"
  }
]`;
}

function extractJsonArray(text) {
  const clean = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const match = clean.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("No JSON array found in Gemini response");
  return JSON.parse(match[0]);
}

async function fetchRecipeImage(title, spoonacularKey) {
  if (!spoonacularKey) return null;

  try {
    const params = new URLSearchParams({
      apiKey: spoonacularKey,
      query: title,
      number: "1"
    });

    const res = await fetch(
      `https://api.spoonacular.com/recipes/complexSearch?${params}`
    );

    if (!res.ok) return null;

    const data = await res.json();
    return data.results?.[0]?.image || null;
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      ingredients = [],
      mood = "",
      cuisine = "indian",
      diet = "veg",
      meal = "any"
    } = req.body || {};

    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      return res.status(400).json({ error: "Ingredients are required" });
    }

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    const SPOONACULAR_KEY = process.env.SPOONACULAR_KEY || "";

    if (!GEMINI_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_KEY" });
    }

    const prompt = buildPrompt({ ingredients, mood, cuisine, diet, meal });

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
        })
      }
    );

    if (!geminiRes.ok) {
      const detail = await geminiRes.text().catch(() => "");
      return res.status(500).json({
        error: `Gemini API failed: ${geminiRes.status}`,
        detail
      });
    }

    const data = await geminiRes.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const recipes = extractJsonArray(rawText);

    const withImages = await Promise.all(
      recipes.map(async (r) => {
        const image = await fetchRecipeImage(r.title, SPOONACULAR_KEY);
        return { ...r, image: image || null };
      })
    );

    return res.status(200).json({ recipes: withImages });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: err.message || "Server error"
    });
  }
};