# Workflows

This document is usage guidance for the more involved tools in this server — how to call them, in what sequence, and what to do with the response. It's aimed at whoever is prompting or building on top of the calling LLM, and at the LLM itself when it has this file as context.

For a one-line-per-tool mapping to the underlying Mealie API, see [API Coverage](./API_COVERAGE.md). For why these tools are built the way they are internally (pagination/cursor design, concurrency choices, known Mealie API quirks), see [Architecture](./ARCHITECTURE.md).

## Finding Recipes by Ingredient

`find_recipes_for_ingredients` lets an AI assistant discover recipes from human-readable ingredient names (e.g. `"branzino"`, `"chicken thighs"`) without ever needing to know Mealie's internal food UUIDs. The MCP handles all Mealie-specific mechanics — resolving names to Mealie Food objects, calling Mealie's Recipe Finder (`GET /api/recipes/suggestions`) or normal recipe search — while ingredient substitution/broadening (e.g. deciding that "sea bass" or "whole fish" are reasonable stand-ins for "branzino") is left to the calling LLM.

**Ingredient resolution**, in order, per ingredient:
1. Exact case-insensitive match on the food's name.
2. Exact case-insensitive match on the food's plural name or one of its aliases (Mealie's Food object has no `slug` field, unlike Category/Tag).
3. A single unique result from Mealie's food search, if nothing above matched.

If a name matches multiple foods with no unique candidate (e.g. `"fish"`), it's reported back as `ambiguous` with the candidate names — the tool never guesses.

**Search strategy**, depending on what resolved:

```json
{ "ingredients": ["salmon"], "categories": ["Dinner"] }
```
Resolves `salmon` to a Food, then uses Mealie's Recipe Finder — recipes are ranked by how many of the resolved ingredients they use and how few other ingredients they're missing. `matchSource: "suggestions"`.

```json
{ "ingredients": ["branzino"] }
```
No Food match for `branzino` → falls back to Mealie's normal recipe search (matches recipe name, description, and ingredient text). If that also finds nothing useful, `unresolvedIngredients` reports it so the LLM can retry with a broader term like `"sea bass"` or `"whole fish"`. `matchSource: "text-search"` (or `"none"` if nothing came back).

```json
{ "ingredients": ["chicken thighs", "broccoli"], "requireAllIngredients": true }
```
With two or more resolved ingredients and `requireAllIngredients: true`, uses Mealie's normal recipe search with a strict food-based AND filter instead of the Finder. `matchSource: "food-filter"`.

`categories`/`tags` are resolved the same way as `get_recipes` — by name, slug, or ID, case-insensitively — before any search runs, and sent to Mealie as canonical IDs for the food-filter and text-search paths; for the Recipe Finder path (which has no taxonomy filters of its own) they're applied to the returned candidates instead.

Each returned recipe includes `name`, `slug`, `description`, `categories`, `tags`, `totalTime`, which requested ingredients it matched, and (for Recipe Finder results) which other ingredients it's missing — enough to decide what's worth a closer look with `get_recipe_detailed` or `get_recipes_batch`, without an extra round trip per candidate.

## Assigning Categories & Tags

Categories are broad groupings (e.g. `Dinner`, `Dessert`) used to organize the recipe book, while Tags are more specific, free-form attributes (e.g. `Quick`, `Dairy-Free`). Both can be assigned to an existing recipe via `update_recipe_taxonomy` (a focused tool for this one job) or via `patch_recipe` (which also accepts `categories`/`tags`/`taxonomyMode`/`createMissing` alongside its existing fields, so a name/description edit and a taxonomy change can be sent in one call).

Every value in `categories`/`tags` may be a name, a slug, or an ID — matching against existing categories/tags is case-insensitive on name and slug. Results are deduplicated automatically.

**Add a category and some tags, keeping everything else the recipe already has (`mode: "merge"`, the default):**

```json
{
  "slug": "chicken-shawarma",
  "categories": ["Dinner"],
  "tags": ["Dairy-Free", "Quick"],
  "mode": "merge",
  "createMissing": false
}
```

**Replace the tag list outright, discarding whatever tags were there before:**

```json
{
  "slug": "chicken-shawarma",
  "tags": ["Weeknight", "Middle Eastern"],
  "mode": "replace",
  "createMissing": true
}
```

`createMissing: true` above means `Weeknight` and `Middle Eastern` are created automatically if they don't already exist.

**Clear all categories from a recipe** by passing an explicit empty array with `mode: "replace"` — omitting `categories` instead would leave it untouched:

```json
{
  "slug": "chicken-shawarma",
  "categories": [],
  "mode": "replace"
}
```

**Update many recipes at once** with `update_recipe_taxonomy_batch`. Each entry is processed independently (bounded concurrency) and the response includes a per-recipe success or error result, so one bad slug doesn't fail the whole batch:

```json
{
  "updates": [
    { "slug": "chicken-shawarma", "categories": ["Dinner"], "mode": "merge" },
    { "slug": "banana-bread", "tags": ["Dessert", "Baking"], "mode": "merge" },
    { "slug": "does-not-exist", "categories": ["Dinner"], "mode": "merge" }
  ]
}
```

Both tools return the recipe's `id`/`slug` plus, per collection, the `final` list after the update and which items were `added`, `removed`, or `created` — useful for confirming exactly what changed.

## Resolving or Creating a Food

Foods are Mealie's reusable structured ingredient entities (e.g. "onion", "chicken breast") — the building blocks that a parsed recipe ingredient eventually points to, as distinct from the free-text ingredient notes on a recipe. Search existing foods before creating a new one: the name you need, or a close alias of it, often already exists, and creating a duplicate fragments the taxonomy.

- `get_foods` — Lists and searches foods (`search`, `page`, `perPage`) for browsing or a single lookup. `search` matches `name`/`pluralName` only — **not** `aliases`. For resolving several already-interpreted food concepts at once, and for alias-aware matching, use `get_food_matches` instead — see [Resolving Several Foods or Units at Once](#resolving-several-foods-or-units-at-once) below.
- `get_food` — Retrieves a single food by ID, including its aliases and label.
- `create_food` — Creates a food. Supports assigning aliases (`aliases: string[]`) and an existing food label (`labelId`) at creation time.
- `update_food` — Updates a food's `name`, `pluralName`, `description`, `aliases`, and/or `labelId`. Omitted fields keep their current value.
- `delete_food` — **Destructive.** Permanently deletes a food. Verify the food with `get_food` first — deleting a food may affect recipes and shopping list items that reference it, and Mealie will refuse the deletion in that case rather than cascade it.

`create_food` and `update_food` both accept `aliases` as a plain `string[]` for convenience and convert each entry into the alias object shape Mealie expects internally. `update_food` **replaces the entire alias collection** whenever `aliases` is supplied — pass an empty array to clear all aliases, or omit the field entirely to leave existing aliases untouched. This makes `update_food` sufficient for adding a single alias: `get_food` the current record, append the new alias to its existing `aliases`, and pass the complete list back to `update_food`.

**Example workflow — resolve or create a food, then use its ID:**

```json
// 1. Search for an existing food
{ "search": "scallion" }
// -> get_foods

// 2. If a close match turns up, retrieve it to confirm before reusing it
{ "foodId": "b3f1c2e0-....." }
// -> get_food

// 3a. No match: create the food
{ "name": "Green Onion", "aliases": ["scallion"] }
// -> create_food

// 3b. Close match found: add the missing alias instead of creating a duplicate
{ "foodId": "b3f1c2e0-.....", "aliases": ["Green Onion", "scallion"] }
// -> update_food

// 4. The resulting food id is then used later by a structured ingredient workflow
```

## Resolving or Creating a Unit

Units are Mealie's canonical ingredient unit vocabulary (e.g. "tablespoon", "cup", "gram") — the shared reference objects a parsed recipe ingredient's `unit` points to, analogous to [Resolving or Creating a Food](#resolving-or-creating-a-food) above for the ingredient's food. They are shared across every recipe that uses them: renaming or repurposing a unit changes how every ingredient that references it displays. Search existing units before creating a new one.

- `get_units` — Lists and searches units (`search`, `page`, `perPage`). The primary tool for resolving a human-readable unit name to an existing unit ID. `search` matches against `name`, `pluralName`, `abbreviation`, and `pluralAbbreviation` — **not** `aliases`.
- `get_unit` — Retrieves a single unit by ID, including its aliases, abbreviations, and standard-quantity conversion metadata.
- `create_unit` — Creates a unit. Supports `aliases` (plain `string[]`), `abbreviation`/`pluralAbbreviation`, `useAbbreviation`, `fraction`, and `standardQuantity`/`standardUnit` at creation time.
- `update_unit` — Updates a unit's `name`, `pluralName`, `description`, `abbreviation`, `pluralAbbreviation`, `useAbbreviation`, `fraction`, `aliases`, and/or `standardQuantity`/`standardUnit`. Omitted fields keep their current value.
- `delete_unit` — **Destructive.** Permanently deletes a unit. Verify the unit with `get_unit` first — deleting a unit still referenced by recipe ingredients is refused by Mealie rather than cascaded.

**Aliases vs. abbreviations.** These are two distinct Mealie fields, not the same concept:
- `aliases` (e.g. `["tbs", "tbsp."]`) are alternate names Mealie also recognizes for the unit. Like `create_food`/`update_food`, `create_unit`/`update_unit` accept `aliases` as a plain `string[]` and convert each entry into the alias object shape Mealie expects internally. `update_unit` **replaces the entire alias collection** whenever `aliases` is supplied — pass an empty array to clear all aliases, or omit the field entirely to leave existing aliases untouched. Aliases are not unique (Mealie allows duplicates, even within the same unit) and are not matched by `get_units`' search.
- `abbreviation`/`pluralAbbreviation` (e.g. `"tbsp"`) are a single short display form for the unit, separate from `aliases`. `useAbbreviation` controls only how Mealie *renders* the unit in a computed ingredient display string (abbreviation vs. full name) — it has no effect on matching, search, or storage.

**Standard-quantity conversion metadata.** `standardQuantity`/`standardUnit` (e.g. a tablespoon might carry `standardQuantity: 0.5`, `standardUnit: "fluid_ounce"`) let Mealie's own shopping-list item merging combine quantities across differently-expressed but equivalent units. `standardUnit` is a free-form string that Mealie's conversion library (`pint`) must be able to parse (e.g. `"fluid_ounce"`, `"cup"`, `"gram"`) — Mealie does not validate it against a fixed enum. The pair is all-or-nothing: supplying only one of the two causes Mealie to silently clear both back to `null`. **Mealie itself will auto-populate this pair on `create_unit`** when the new unit's name/abbreviation matches one of its own built-in standardized units (e.g. naming a unit exactly "tablespoon"), unless both fields are already explicitly supplied — this MCP does not perform or replicate that matching itself, only Mealie does.

**Example workflow — resolve a unit for a parsed ingredient, then use its ID:**

```json
// The calling LLM has already interpreted "2 tbsp olive oil" as
// quantity=2, unit="tablespoon", food="olive oil" — the MCP never does this parsing.

// 1. Search for the existing unit
{ "search": "tablespoon" }
// -> get_units

// 2. Resolve its ID from the result, then write the structured ingredient
{
  "slug": "chicken-shawarma",
  "ingredients": [
    {
      "quantity": 2,
      "unitId": "9a7d...",
      "unitName": "tablespoon",
      "foodId": "f04a...",
      "foodName": "olive oil"
    }
  ]
}
// -> update_recipe_ingredients
```

## Resolving Several Foods or Units at Once

`get_food_matches` and `get_unit_matches` resolve a **batch** of already-interpreted food/unit concepts to candidate Mealie entities in one call, using a small, bounded number of Mealie requests instead of one `get_foods`/`get_units` search per concept. This is the tool to reach for once an LLM has parsed a batch of ingredient lines and needs to resolve every concept it identified — e.g. parsing `"2 tbsp olive oil"`, `"3 cloves garlic"`, and `"1 cup broccoli"` into food concepts `["olive oil", "garlic", "broccoli"]` and unit concepts `["tablespoon", "clove", "cup"]` is 2 tool calls with `get_food_matches`/`get_unit_matches` instead of 5 separate `get_foods`/`get_units` searches.

**How this differs from `get_foods`/`get_units`:**

| | `get_foods` / `get_units` | `get_food_matches` / `get_unit_matches` |
|---|---|---|
| Purpose | Browse or a single search | Resolve several already-interpreted concepts at once |
| Aliases | Not matched by `search` | Matched, with `matchedBy: "alias"` reported |
| Result shape | A flat paginated page | Candidates grouped per input query |
| Picks a winner? | N/A | Never — always returns ranked candidates, caller decides |

**What they do NOT do:** parse ingredient text, perform fuzzy/semantic matching, or create/update/delete any food, unit, or alias. By the time you call these tools you've already decided what concepts to look up — these tools only retrieve existing canonical candidates for concepts you've already identified.

**Matching.** Each query is checked against the candidate's canonical fields and its aliases, using plain trimmed/case-insensitive string comparison — never fuzzy or semantic matching. Every candidate that exact-matches or contains the query on any checked field is returned (never just one "best" answer); results are ranked with exact matches ahead of substring matches, and within each of those groups, `name` ahead of `pluralName` ahead of (for units) `abbreviation`/`pluralAbbreviation` ahead of `alias`. Each candidate reports `matchedBy` (which field matched), `matchType` (`"exact"` or `"substring"`), and `matchedValue` (the actual stored text that matched — e.g. the alias text, not the query).

**Example workflow — resolve a batch of parsed ingredient concepts:**

```json
// The calling LLM has already parsed several ingredient lines and identified the concepts below —
// these tools never parse ingredient text themselves.

// 1. Resolve every food concept identified across the batch, in one call
{ "queries": ["olive oil", "garlic", "broccoli"] }
// -> get_food_matches
// -> { "matches": [
//      { "query": "olive oil", "items": [{ "id": "f04a...", "name": "olive oil", "matchedBy": "name", "matchType": "exact", ... }] },
//      { "query": "garlic", "items": [{ "id": "...", "name": "garlic", "matchedBy": "name", "matchType": "exact", ... }] },
//      { "query": "broccoli", "items": [] }  // no existing food — the LLM may now call create_food
//    ], "queryCount": 3, "matchedCount": 2, "apiRequestCount": 1 }

// 2. Resolve every unit concept identified across the batch, in one call
{ "queries": ["tablespoon", "clove", "cup"] }
// -> get_unit_matches

// 3. The calling LLM picks the appropriate candidate (or creates one) per concept, then writes the
//    resolved ingredients in one call
// -> update_recipe_ingredients
```

Both tools accept an optional `maxMatchesPerQuery` (default 10) to cap how many ranked candidates come back per query, and enforce a maximum number of queries per call (25) to keep each underlying request bounded. Passing the same query twice (case-insensitively) does not cost an extra Mealie request — it's resolved once and returned once per input entry, preserving the input order. A failure to look up one particular batch of queries does not discard matches already found for the rest of the batch — the affected entries carry an `error` field instead of `items`.

Each query's result also carries `truncated: true` when additional matching candidates may exist beyond the returned `items` — either because there were more matches than `maxMatchesPerQuery` and the list was capped, or because Mealie's own retrieval for that query came back incomplete. `items` is never guaranteed to be the *complete* candidate set when `truncated` is `true`; narrow the query text or raise `maxMatchesPerQuery` if seeing the rest matters.

## Updating Structured Recipe Ingredients

`update_recipe_ingredients` replaces a recipe's complete structured ingredient collection (`recipeIngredient`) while leaving every other recipe field — name, description, instruction text, categories, tags, servings, times, nutrition, notes, settings, images — exactly as it was, with one caveat on instructions covered below. It's a low-level write primitive: it does not parse ingredient text, and it does not look up or create foods/units. `foodId`/`unitId` must already reference existing Mealie entities, resolved beforehand — normally with `get_food_matches`/`get_unit_matches` (see [Resolving Several Foods or Units at Once](#resolving-several-foods-or-units-at-once) above), which resolve several already-interpreted concepts in one batch and check aliases; `get_foods`/`get_food` (see [Resolving or Creating a Food](#resolving-or-creating-a-food) above) or `get_units`/`get_unit` (see [Resolving or Creating a Unit](#resolving-or-creating-a-unit) above) remain available for a single manual lookup.

The `ingredients` array is the recipe's **complete** new ingredient list, not a patch — any ingredient not included is removed, and an empty array clears all ingredients. Call `get_recipe_detailed` first to see the recipe's current ingredients (including their `referenceId`s, which recipe instructions may reference) before replacing them.

Each ingredient accepts `quantity`, `unitId`/`unitName`, `foodId`/`foodName`, `note`, `display`, `originalText`, `title` (used as a section heading, e.g. `"For the sauce"`), and `referenceId`. `foodId`/`foodName` and `unitId`/`unitName` must each be given as a pair — an ID without its matching name (or vice versa) is rejected, since Mealie needs the name to validate the reference and omitting the ID risks Mealie inline-creating a new food/unit instead of reusing the existing one.

**Two behavioral caveats to know before you rely on this tool** (root cause and investigation detail in [Architecture](./ARCHITECTURE.md#known-mealie-api-quirks)):

- **`recipeInstructions[].id` is regenerated on every recipe update, `PATCH` or `PUT`, no matter what.** Instruction *content* (text, title, summary, ingredient references) is preserved correctly; only the IDs churn. If your workflow depends on stable instruction IDs across ingredient updates, treat that as currently unsupported by Mealie itself — link ingredients to instructions by the ingredient's own `referenceId` instead, which Mealie does not regenerate.
- **`display` is not actually a stored field**, despite being accepted. Mealie always recomputes it from `quantity`/`unit`/`food`/`note` when the ingredient is read, so a supplied value never round-trips literally — don't rely on it coming back as sent.

**Replace a recipe's ingredients with two already-resolved structured entries:**

```json
{
  "slug": "chicken-shawarma",
  "ingredients": [
    {
      "quantity": 1,
      "unitId": "5e2f...",
      "unitName": "lb",
      "foodId": "b3f1c2e0-...",
      "foodName": "chicken thighs",
      "display": "1 lb chicken thighs"
    },
    {
      "quantity": 2,
      "unitId": "9a7d...",
      "unitName": "tablespoons",
      "foodId": "f04a...",
      "foodName": "olive oil",
      "display": "2 tablespoons olive oil"
    }
  ]
}
```

## Recipe Classification Workflow

`get_recipes_for_classification` exists because the general-purpose batch tools (`get_recipes_batch`, `get_recipes_detailed_batch`) return the *full* recipe payload — nutrition, settings, assets, images, comments — for every recipe requested, fetched with unbounded concurrency. On any non-trivial recipe count that reliably produces HTTP 504s through the MCP transport, even at batch sizes as small as 8-9. This tool instead:

- Filters using the cheap recipe-list response (which already embeds each recipe's categories and tags), so full detail is only fetched for recipes that actually need classifying.
- Fetches detail with **bounded concurrency** (a handful of requests in flight at a time), never `Promise.all`/`Promise.allSettled` across the whole batch.
- Returns only fields useful for classification — no nutrition, settings, assets, images, comments, ratings, usage history, or internal ingredient/instruction UUIDs.
- Reports a failed detail fetch as a per-recipe entry in `failures` instead of failing the whole call.

Pagination is a stable, opaque cursor — see [Architecture](./ARCHITECTURE.md#pagination--cursor-design) for how it stays correct while taxonomy edits happen mid-job, and its known limitations.

### First page

```json
{
  "limit": 25,
  "taxonomyState": "missing_either"
}
```

### Continuing to the next page

Pass back `nextCursor` from the previous response unchanged:

```json
{
  "cursor": "<opaque cursor returned by the previous call>",
  "limit": 25,
  "taxonomyState": "missing_either"
}
```

### Recipes missing both Categories and Tags

```json
{
  "limit": 25,
  "taxonomyState": "missing_both"
}
```

`taxonomyState` also accepts `missing_categories`, `missing_tags`, and `any` (no taxonomy filtering).

### Recommended end-to-end workflow

1. Call `get_recipes_for_classification`.
2. Classify each returned recipe using its `ingredients`, `instructions`, and other fields, working within your existing Category/Tag taxonomy.
3. Preserve each recipe's existing `categories`/`tags` from the response — only add to them.
4. Apply additions with `update_recipe_taxonomy_batch` in batches of about five recipes, using `mode: "merge"` and `createMissing: false` unless the user explicitly asks to replace a recipe's collection or auto-create new categories/tags.
5. Save each batch's successful write responses as a checkpoint.
6. Continue calling `get_recipes_for_classification` with `nextCursor` until `hasMore` is `false`.
7. If any individual read (`failures` in a classification page) or write (a failed entry from `update_recipe_taxonomy_batch`) fails, retry only that recipe — do not restart the whole pagination.

## Ingredient Parsing Workflow

`get_recipes_for_ingredient_parsing` is a compact, paginated, **READ-ONLY** work queue of recipes whose ingredients may still need structured parsing — the ingredient-parsing counterpart to `get_recipes_for_classification`. It never modifies a recipe, food, unit, alias, or ingredient, and it never parses ingredient text itself: it does not call Mealie's NLP ingredient parser, does not guess a food/unit association, and does not decide linguistically whether a line "contains a unit". Interpreting free-form ingredient text (e.g. `"2 tablespoons chopped fresh parsley leaves"` → quantity `2`, unit `tablespoon`, food `parsley`, note `"chopped fresh"`) is entirely the calling model's responsibility.

Conceptually:

```
get_recipes_for_ingredient_parsing
    ->
model interprets ingredients (using recipe + instruction context)
    ->
get_food_matches / get_unit_matches
    ->
model selects canonical entities (or decides a new food/unit is needed)
    ->
update_recipe_ingredients
```

This document covers only the first step — the read-only work queue. The detailed rules a model should use to interpret ingredient text (splitting, combining, alternatives, etc.) are intentionally not defined here; that policy lives elsewhere and this tool has no opinion on it.

The intended workflow:

1. Call `get_recipes_for_ingredient_parsing` to get a page of recipes needing attention.
2. For each ingredient, interpret its existing text (`display`/`note`/`originalText`) yourself — the MCP does not do this. Recipe instructions are included for exactly this: they can disambiguate an otherwise-ambiguous line.
3. Resolve canonical food/unit IDs separately with `get_food_matches`/`get_unit_matches` (see [Resolving Several Foods or Units at Once](#resolving-several-foods-or-units-at-once) above) — batch, alias-aware lookups purpose-built for this step. This tool never looks up or creates foods/units itself.
4. Decide whether a new food, unit, or alias is warranted (this tool has no opinion on that).
5. Call `update_recipe_ingredients` (see [Updating Structured Recipe Ingredients](#updating-structured-recipe-ingredients) above) with the recipe's **complete** corrected ingredient collection. Existing `referenceId`s are stable identifiers that recipe instructions may reference — preserve one when an existing ingredient row continues to represent the same ingredient.
6. Continue calling `get_recipes_for_ingredient_parsing` with `nextCursor` until `hasMore` is `false`.

### Arguments

```json
{
  "cursor": "<opaque cursor from a previous call, omit to start over>",
  "limit": 25,
  "state": "unparsed_only"
}
```

- `limit` — 1-50, default 25.
- `state` — which recipes to include, default `"unparsed_only"`:
  - `"unparsed_only"` — at least one ingredient has no associated food.
  - `"partially_parsed"` — at least one ingredient has a food but no unit despite a positive quantity (see the false-positive caveat below).
  - `"any"` — no filtering; every scanned recipe is returned, useful for auditing.

### What each ingredient's `parsingState` means (and what it doesn't)

Mealie's `RecipeIngredient` schema, confirmed against a live instance, exposes no explicit "is this a section heading" or "is this deliberately free-form" flag — only `title`, `quantity`, `unit`, `food`, `note`, `display`, `originalText`, and `referenceId` are actually present on read. So classification here is deliberately narrow and schema-only, never linguistic:

- **`section`** — `title` is non-empty. This is Mealie's own mechanism for ingredient section headers (e.g. "For the sauce"); a heading row is never counted as needing parsing, so a recipe made entirely of structured ingredients plus a section heading still correctly reads as fully parsed.
- **`unparsed`** — `title` is empty and `food` is `null`. The primary, high-confidence signal this tool is built around.
- **`partial`** — `food` is present but `unit` is `null` while `quantity` is a positive number. **Known limitation**: this is indistinguishable, without linguistic parsing, from a legitimately unit-less countable ingredient — real-world data shows things like `"4 eggs"`, `"2 lemons"`, or `"1 pie crust"` are commonly and *correctly* structured with no unit at all. Treat `partially_parsed` results as a coarse audit signal to sanity-check, not a confirmed defect.
- **`structured`** — a food is present and either a unit is present, or quantity isn't a positive number (e.g. a to-taste garnish with no meaningful quantity).

**"Free-form" entries** (deliberately non-food lines, e.g. "extra napkins") were investigated but are **not** exposed as a distinct state: nothing in Mealie's schema distinguishes them from a genuinely unparsed food ingredient — both are `food: null`, `title` empty, with text in `note`/`display`. Rather than fabricate a distinction the data can't support, such rows are classified as `unparsed` like any other food-less ingredient.

**`originalText` is not a reliable signal.** It was investigated as a possible "this came from unparsed source text" marker but discarded — on a live Mealie instance it was observed `null` on every ingredient, fully structured and completely unparsed alike. Imported/scraped recipes put the raw ingredient line straight into `note`/`display` instead. This tool still returns `originalText` when Mealie does populate it, but does not rely on it for classification.

### Returned ingredient fields

Each ingredient preserves its current Mealie state — never a transformed interpretation — so it can be safely round-tripped later through `update_recipe_ingredients`: `referenceId`, `quantity`, `unit` (`{id, name}` or `null`), `food` (`{id, name}` or `null`), `note`, `display`, `originalText`, `title`, and the derived `parsingState` described above.

### Instruction context

Each recipe also includes its instructions (`title`, `text`, `ingredientReferences`) unchanged, since instruction text can disambiguate an otherwise vague ingredient line (e.g. `"1 package ranch"` might mean ranch dressing mix or ranch seasoning — the instructions often make it clear). Instruction `id`s are included when present but, exactly as with `update_recipe_ingredients`, **must not be depended on for stability** — Mealie recreates every `recipeInstructions` row (with a fresh `id`) on any recipe update, including one made via `update_recipe_ingredients`. `referenceId` on the ingredient (not the instruction `id`) is the stable identity `ingredientReferences` actually links against.

### Pagination and efficiency

Pagination reuses the same stable, opaque cursor mechanism as `get_recipes_for_classification` (see [Architecture](./ARCHITECTURE.md#pagination--cursor-design)) — scanning the full recipe collection ordered by `createdAt` with the recipe id as a tie-breaker, so a recipe's ingredients changing state between calls never causes another recipe to be skipped or duplicated. Pass `nextCursor` back unchanged to continue; stop once `hasMore` is `false`.

**Efficiency note**: unlike classification, Mealie's recipe list endpoint does not include `recipeIngredient`, so this tool cannot cheaply pre-filter from the list response — every scanned recipe needs a full detail fetch to know whether it matches (why, and what else was ruled out, is in [Architecture](./ARCHITECTURE.md#why-ingredient-parsing-cant-pre-filter-cheaply)). Detail fetches happen in small batches with the same bounded concurrency used elsewhere in this server, not `Promise.all` across the whole scan. On a library where only a small fraction of recipes need parsing, filling a page can take noticeably longer than classification's equivalent call; a page may come back with `hasMore: true` and fewer than `limit` items if an internal time budget is hit first — just continue with `nextCursor`.

As with `get_recipes_for_classification`, a failure reading one recipe is reported in `failures` and does not fail the rest of the page.
