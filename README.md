# ChefAI 🍳
### AI-Powered Recipe Generator for the Indian Kitchen

> *Tell ChefAI what's in your fridge and how you're feeling — it generates a recipe just for you.*

[![Live Demo](https://img.shields.io/badge/Live%20Demo-chef--ai--seven--livid.vercel.app-C4622D?style=for-the-badge)](https://chef-ai-seven-livid.vercel.app)
[![GitHub](https://img.shields.io/badge/GitHub-24jainnikita%2FChefAI-2C1810?style=for-the-badge&logo=github)](https://github.com/24jainnikita/ChefAI)

---

## The Problem

You open your fridge — paneer, onions, tomatoes — and have no idea what to cook. Most recipe apps require you to know what you want. **ChefAI solves the opposite problem.**

---

## What It Does

ChefAI takes your available ingredients, your current mood, and your dietary preferences — and generates personalized recipes using Google Gemini AI. Unlike static recipe databases, ChefAI generates recipes dynamically, so it **never returns zero results.**

---

## Features

- **Ingredient-based search** — type what you have, get recipes that use them
- **Mood-aware filtering** — Lazy & quick, Festive, Healthy, Comfort food, Fancy, Light snack
- **Indian kitchen focus** — built for Indian pantry ingredients and cuisine
- **Diet filters** — Vegetarian, Non-veg, Vegan
- **Meal type filters** — Breakfast, Lunch, Dinner, Snack
- **Recipe detail modal** — full ingredients list, step-by-step cooking instructions, nutrition info
- **Serving scaler** — adjusts ingredient amounts for 1–30 servings automatically
- **Save favourites** — heart any recipe, saved across sessions via localStorage
- **Weekly meal planner** — schedule recipes to days of the week
- **Shopping list generator** — shows what you're missing for a recipe
- **Quick add pantry** — click common Indian ingredients instead of typing
- **Responsive design** — works on mobile and desktop

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| AI / Recipe Generation | Google Gemini API (gemini-2.0-flash) |
| Recipe Images | Spoonacular API |
| Backend | Vercel Serverless Functions (Node.js) |
| Hosting | Vercel |
| Version Control | GitHub |

---

## Architecture

```
User Input (ingredients + mood + filters)
        ↓
Frontend (HTML/CSS/JS)
        ↓
Vercel Serverless Function (/api/recipes)
        ↓
Spoonacular API → for non-Indian cuisine results
        ↓
Gemini API → for Indian cuisine + fallback generation + mood tip
        ↓
Structured JSON → rendered as recipe cards
```

**Why hybrid?** Spoonacular's database lacks Indian ingredients (paneer, dal, atta). For Indian cuisine, Gemini generates recipes dynamically. For global cuisine, Spoonacular provides real recipe data with Gemini as fallback.

---

## Project Structure

```
chefai/
├── api/
│   └── recipes.js      ← Vercel serverless backend
├── css/
│   └── style.css       ← Full styling with Cormorant Garamond + Outfit fonts
├── js/
│   ├── api.js          ← Frontend API handler
│   └── app.js          ← All UI logic, state, interactions
├── index.html          ← Main app shell
├── vercel.json         ← Vercel routing config
└── package.json
```

---

## How to Run Locally

```bash
# 1. Clone the repo
git clone https://github.com/24jainnikita/ChefAI.git
cd ChefAI

# 2. Install Vercel CLI
npm install -g vercel

# 3. Add environment variables
# Create .env.local with:
# GEMINI_KEY=your_gemini_key
# SPOONACULAR_KEY=your_spoonacular_key

# 4. Run locally
vercel dev
```

Get your free API keys:
- **Gemini** → [aistudio.google.com](https://aistudio.google.com)
- **Spoonacular** → [spoonacular.com/food-api](https://spoonacular.com/food-api)

---

## Why ChefAI vs SuperCook

| Feature | SuperCook | ChefAI |
|---|---|---|
| Recipe source | Static database | AI-generated dynamically |
| Indian ingredients | ❌ Not supported | ✅ Built for Indian kitchen |
| Zero results possible | ✅ Yes (common) | ❌ Never returns zero |
| Mood-aware | ❌ No | ✅ Yes |
| Meal planner | ❌ No | ✅ Yes |
| Diet filters | Basic | Veg / Non-veg / Vegan |
| Serving scaler | ❌ No | ✅ Yes |

---

## Screenshots

> <img width="1491" height="1490" alt="chefAI_overview" src="https://github.com/user-attachments/assets/f92bd0f1-53b8-4c04-93ce-6b9f81a671a8" />


---

## Academic Context

Built as a **Minor Project** for BCO074C — Computer Science & Engineering, 6th Semester.

**Course Outcomes addressed:**
- CO1: Real-world problem identification (food waste, meal planning)
- CO2: Software design using APIs and serverless architecture
- CO3: Implementation with standard coding practices
- CO4: Independent project execution
- CO5: Documentation and presentation

---

## Author

**Nikita Jain**
[GitHub](https://github.com/24jainnikita) · [LinkedIn](https://linkedin.com/in/24jainnikita)

---

*ChefAI — Cook what you have, not what you wish you had.*
