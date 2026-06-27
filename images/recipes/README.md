# Local Recipe Images

Drop one photo per recipe in this folder.

## Rules
- **Format:** `.jpg`
- **Filename:** must exactly match the recipe slug (lowercase, words separated
  by single hyphens). See the full list in `image-filenames.txt` at the project
  root, or the table generated for you.
- **Recommended size:** ~800×600px, landscape, under ~200 KB each for fast loads.

## How it works
The backend (`api/_lib/localDb.js`) builds each recipe's image URL as:

```
/images/recipes/<slug>.jpg
```

Vercel serves this folder statically. If a file is missing, the frontend
automatically falls back to the recipe emoji — so you can add images
incrementally without breaking anything.

## Example
Recipe "Masala Dosa" → file `masala-dosa.jpg`
