# Architecture

Internal design notes for anyone extending or maintaining this server — why things are shaped the way they are, and a record of Mealie API behavior that was investigated so it doesn't need re-discovering. This is not required reading to *use* the tools; see [Workflows](./WORKFLOWS.md) for that, and [API Coverage](./API_COVERAGE.md) for the endpoint mapping.

## Bounded Concurrency

Firing every request in a batch at once (`Promise.all`/`Promise.allSettled` over a full slug list) reliably produces HTTP 504s through the MCP transport on non-trivial batch sizes — observed even at 8-9 concurrent full-detail requests, regardless of how many were ultimately requested. `mapWithConcurrency` (`src/lib/concurrency.ts`) caps in-flight requests to `DEFAULT_DETAIL_FETCH_CONCURRENCY` (4) instead, which sits in the middle of the "3-5 concurrent" range known to avoid this without materially slowing down a batch. Every tool that fans out to multiple recipe detail fetches — `get_recipes_batch`, `get_recipes_detailed_batch`, `get_recipes_for_classification`, `update_recipe_taxonomy_batch` — goes through this same helper rather than reimplementing its own concurrency limit.

## Pagination & Cursor Design

`get_recipes_for_classification` needs pagination that survives a job that's actively changing the thing it's filtering on: as recipes get classified mid-job, they drop out of "missing taxonomy," which would shift every later page backward under naive page-number pagination and cause recipes to be silently skipped. This was hit empirically before being fixed, not designed in the abstract.

Mealie's `/api/recipes` list endpoint only supports `page`/`perPage`, not a native "after" cursor. This tool builds a stable cursor on top of that by:

1. Scanning the full recipe collection ordered by `createdAt` (never `updatedAt`, since applying a taxonomy change updates that field) with the recipe id as a deterministic tie-breaker.
2. Encoding the cursor as the last-scanned recipe's `(createdAt, id, page)`, base64url-encoded JSON — opaque to callers, versioned (`v: 1`) so a malformed or foreign cursor fails clearly instead of silently misbehaving.
3. Resuming by re-fetching the cursor's last known page and skipping everything at or before the cursor position, rather than trusting page-number arithmetic — so if a recipe was inserted or removed from an already-scanned page between calls, resumption still lands in the right place.

This gives two guarantees:
- A recipe gaining or losing categories/tags between calls never causes another recipe to be skipped or duplicated, because pagination position is tracked independently of the taxonomy filter.
- New recipes created while paginating are always sorted after everything already scanned, so they never shift previously-issued cursors.

**Known limitation**: this assumes Mealie's `/api/recipes` list endpoint accepts `orderBy=createdAt` and returns each recipe's `recipeCategory`/`tags` in the list response (not just in the detail response), consistent with the `recipeCategory`/`tags`/`orderBy` field names used elsewhere in this codebase. If a Mealie version does not honor `orderBy=createdAt` for this endpoint, the tool degrades to whatever stable order Mealie falls back to — traversal stays correct (no skips/duplicates, since resumption re-derives its position from the cursor's `createdAt`/`id` rather than trusting page arithmetic), but "oldest first" is no longer guaranteed. If a Mealie version omits `recipeCategory`/`tags` from the list response, filtering would need to move to the detail response instead — check the `MEALIE_MCP_DEBUG` scan-phase timing (see [Debugging](#debugging) below) if classification pages come back empty or unexpectedly small against a real instance.

A recipe that matches the filter but fails its detail fetch (see `failures` in the response) is not retried automatically by continuing pagination — retry it directly (e.g. with `get_recipe_detailed`) once the failure is addressed.

## Debugging

Set `MEALIE_MCP_DEBUG=true` in the server's environment to log per-call phase timings (scan/list, detail fetch, transform) for `get_recipes_for_classification` and `get_recipes_for_ingredient_parsing` to stderr — useful for telling whether a slow call is spending its time listing recipes, fetching detail, or building the response. Diagnostics always go to stderr, never stdout, since stdout carries the MCP JSON-RPC transport.

## Known Mealie API Quirks

Behavior confirmed by live testing against a real Mealie instance, traced to root cause in Mealie's own source, and worth knowing before changing anything that touches recipe writes.

### `recipeInstructions[].id` is regenerated on every recipe update

Confirmed on Mealie `v3.23.1` and `mealie-next`, via two live experiments: omitting `recipeInstructions` from an `update_recipe_ingredients` request, and explicitly echoing it back with its exact current IDs — both regenerated the IDs anyway.

Root cause: both `PUT /api/recipes/{slug}` and `PATCH /api/recipes/{slug}` ultimately call the same repository `update()`, which re-invokes the SQLAlchemy model's constructor (`self.__init__(*args, **kwargs)`) on the already-persisted recipe. `recipe_instructions` is declared with `cascade="all, delete-orphan"`, so every instruction row is deleted and recreated with a fresh ID as a side effect of that re-construction — regardless of what the request body contained. This happens from any client, including Mealie's own web UI, on any recipe save; it is not something this MCP server causes or can work around.

Instruction *content* (text, title, summary, `ingredientReferences`) is preserved correctly — only the IDs churn. Any feature that needs a stable identity for linking instructions to ingredients across writes should use the ingredient's own `referenceId` (which Mealie does not regenerate), never the instruction's `id`.

### `display` is not a persisted field on `RecipeIngredient`

Confirmed directly against the `RecipeIngredientModel` ORM definition — there is no `display` database column. Mealie's `format_display` validator only recomputes the field when it's empty, but since nothing ever persists a supplied value, it reads back empty (and gets recomputed) on every subsequent load, including the response to the very same write that supplied it. Kept as an accepted/forwarded field for forward compatibility in case a future Mealie version starts persisting it, but never treat a round-tripped `display` value as authoritative.

## Why Ingredient Parsing Can't Pre-Filter Cheaply

`get_recipes_for_classification` can filter cheaply because the list endpoint's response already embeds `recipeCategory`/`tags` for every recipe. Mealie's `/api/recipes` list response does **not** include `recipeIngredient` at all — this codebase's own `get_recipe_concise` tool has to call the full `getRecipe(slug)` and trim client-side for the same reason, since there is no server-side field-selection/projection param. That means `get_recipes_for_ingredient_parsing` genuinely needs a detail fetch for every scanned recipe, not just matches — fetched in small batches (`DETAIL_FETCH_BATCH_SIZE`, `src/lib/recipe-ingredient-parsing.ts`) with the same bounded concurrency as everything else, rather than loading the whole collection into memory or firing every request at once.

Before accepting that, two alternatives were investigated directly against a live Mealie instance's real REST API (not this server's own tools) rather than assumed away:

**Mealie's `queryFilter` query-language param can reach into `recipeIngredient` fields — but its pagination is broken for a to-many relation like this one, so it's unsafe to use.** `GET /api/recipes?queryFilter=recipeIngredient.foodId IS NULL` is accepted and returns matches, which looked like it could replace the whole per-recipe detail-fetch design. Testing it against Mealie `v3.20.1`, though:

- Requesting `perPage=50` on that filter returned as few as 4 items on some pages, regardless of how many actually matched.
- Walking `page=1` then `page=2` at `perPage=100` returned **the same recipe on both pages**.
- The `total`/`total_pages` response fields were internally inconsistent across different `perPage` values for the identical filter (1580 at `perPage=50`, 378 at `perPage=5000`, `total_pages: 1` at both).

This is consistent with `LIMIT`/`OFFSET` being applied to the raw joined `recipe_ingredient` rows before `DISTINCT` on the parent recipe — a recipe with many unparsed ingredient rows can straddle a page boundary and get split or duplicated across pages. That's a direct violation of the no-skip/no-duplicate pagination guarantee this tool (and `get_recipes_for_classification`) depends on, so `queryFilter` is not used for traversal here. It may be worth reporting upstream to Mealie; this repository has not done so.

**The household/group export/backup endpoints were considered and not pursued.** They can dump the full recipe collection (including ingredients) in fewer round trips in principle, but likely need admin-level export permissions this server's API key may not have, produce a point-in-time snapshot rather than fitting this tool's live paginated/cursor model, and their actual payload efficiency at scale (images/assets likely bundled in) was not verified. Revisit only with evidence it's actually cheaper for this use case, not on the assumption that it is.

Given that every scanned recipe costs a detail fetch, a sparse queue (few recipes actually needing parsing) can require scanning many recipes to fill one page — a live 25-recipe pilot needed 71 scans (a ~2.8:1 scan-to-return ratio) for `unparsed_only`, and an earlier, smaller pilot saw 30 scans for 5 matches (6:1). That ratio only gets worse as more of a library becomes structured. `DEFAULT_DEADLINE_MS` (`src/lib/recipe-ingredient-parsing.ts`, currently 20s, matching `get_recipes_for_classification`'s own budget) bounds how long a single call will keep scanning before returning whatever it's found so far with `hasMore: true` — the same soft-deadline pattern classification already uses, for the same reason (avoid an MCP gateway timeout on a call that would otherwise keep scanning indefinitely). `returnedCount` coming in under the requested `limit` while `hasMore` is `true` is this budget doing its job, not a bug.

### The `partial` parsing-state heuristic's tradeoff, quantified

The `"food present, unit absent, quantity positive"` heuristic behind `partial` (see [Workflows](./WORKFLOWS.md#what-each-ingredients-parsingstate-means-and-what-it-doesnt)) was checked against real recipes rather than assumed reasonable. A single ordinary, fully-structured recipe fetched during investigation (`lemon-chess-pie`) had 3 of its 9 ingredients — `"1 pie crust"`, `"4 eggs"`, `"4 lemons"` — as legitimately unit-less counts that this heuristic cannot distinguish from incomplete structuring, since there is no schema field recording "unit intentionally omitted". That's roughly a third of one recipe's ingredients, not a rare edge case; `partially_parsed` is documented as a coarse audit signal for exactly this reason, not a confirmed-defect filter.
