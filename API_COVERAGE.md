# API Coverage

| Category | Tools |
|---|---|
| Recipes | 16 |
| Meal Plans | 5 |
| Categories | 7 |
| Tags | 7 |
| Shopping Lists | 13 |
| Foods | 5 |
| **Total** | **53** |

## Recipe Operations (16)

- `get_recipes` — `GET /api/recipes` (paginated, search, filter by tags/categories). `categories`/`tags` are resolved by name, slug, or ID (case-insensitive) against `GET /api/organizers/categories`/`GET /api/organizers/tags` before the request, since Mealie's own query params only match by exact slug/ID and silently skip the filter (returning the unfiltered library) when a name doesn't match — unresolved values fail the call clearly instead.
- `find_recipes_for_ingredients` — Composite: `GET /api/foods` (search) to resolve human-readable ingredient names to Mealie Food IDs, then either `GET /api/recipes/suggestions` (Mealie's Recipe Finder, ranked by fewest missing ingredients — one call per resolved food, run concurrently), `GET /api/recipes` with `foods`/`requireAllFoods` (strict AND match across every resolved ingredient), or `GET /api/recipes?search=` (free-text fallback, one call per unresolved term) depending on resolution results and `requireAllIngredients`. `categories`/`tags` are resolved the same way as `get_recipes`. Never fetches the full food or recipe library.
- `get_recipe_detailed` — `GET /api/recipes/{slug}` (full details)
- `get_recipe_concise` — `GET /api/recipes/{slug}` (filtered to summary fields)
- `get_recipes_batch` — `GET /api/recipes/{slug}` for multiple slugs, with bounded concurrency (4 in flight at a time) rather than firing every request at once
- `get_recipes_detailed_batch` — Same as `get_recipes_batch` (full details including nutrition), also bounded to 4 concurrent requests
- `get_recipes_for_classification` — Read-only, paginated: `GET /api/recipes` (ordered by `createdAt`, page-scanned with a stable opaque cursor) to cheaply filter by taxonomy state using the embedded `recipeCategory`/`tags`, then `GET /api/recipes/{slug}` for matches only, with bounded concurrency (4 in flight, shared with `get_recipes_batch`). Returns a compact projection (ingredients/instructions as plain strings, existing categories/tags, no nutrition/settings/assets/images/comments) plus per-recipe `failures`. Pairs with `update_recipe_taxonomy_batch` to apply the resulting classifications.
- `create_recipe` — `POST /api/recipes` + optional `PUT` for ingredients/instructions
- `patch_recipe` — `PATCH /api/recipes/{slug}` (partial update). Also accepts optional `categories`/`tags`/`taxonomyMode`/`createMissing`; when present, `GET /api/recipes/{slug}` is used to resolve current categories/tags for merge mode and the resolved `recipeCategory`/`tags` collections are folded into the same `PATCH` call as the other fields.
- `update_recipe_ingredients` — `PATCH /api/recipes/{slug}` with a body containing only `{ recipeIngredient: [...] }` — no `GET` first, no other fields sent. This keeps every unrelated *scalar* field (name, description, settings, nutrition, categories/tags, etc.) safe, since Mealie's `PATCH` route only merges keys present in the request onto the existing recipe. **Known Mealie limitation** (confirmed by live testing, including explicitly echoing `recipeInstructions` back with matching ids — it made no difference): `recipeInstructions[].id` is regenerated on *every* recipe `PUT` or `PATCH`, regardless of payload shape. Root cause: both routes call the same repository `update()`, which re-invokes the SQLAlchemy model's constructor (`self.__init__(*args, **kwargs)`) on the already-persisted recipe; `recipe_instructions` is declared with `cascade="all, delete-orphan"`, so every instruction row is deleted and recreated with a fresh id as a side effect — not something this tool causes or can avoid. Instruction content is preserved correctly; only the ids churn. `foodId`/`unitId` + `foodName`/`unitName` pairs are transformed into the minimal `{id, name}` object shape Mealie's embedded `food`/`unit` fields expect; this tool never resolves or creates foods/units itself. Each ingredient's `display` is accepted and forwarded but not a persisted field in Mealie — it is always recomputed from `quantity`/`unit`/`food`/`note`.
- `update_recipe_taxonomy` — Composite: `GET /api/recipes/{slug}` to read current categories/tags (and to resolve requested names/slugs/IDs against `GET /api/organizers/categories`/`GET /api/organizers/tags`, optionally `POST`-creating missing ones), then a single `PATCH /api/recipes/{slug}` with only the changed `recipeCategory`/`tags` fields
- `update_recipe_taxonomy_batch` — Runs `update_recipe_taxonomy` for multiple recipes with bounded concurrency (5 at a time), returning a success/error result per recipe
- `duplicate_recipe` — `POST /api/recipes/{slug}/duplicate`
- `mark_recipe_last_made` — `PATCH /api/recipes/{slug}/last-made`
- `set_recipe_image_from_url` — `POST /api/recipes/{slug}/image`
- `delete_recipe` — `DELETE /api/recipes/{slug}`

## Meal Plan Operations (5)

- `get_all_mealplans` — `GET /api/households/mealplans`
- `get_mealplan_with_recipes` — Composite: `GET /api/households/mealplans` + batch `GET /api/recipes/{slug}` (bounded concurrency) with client-side date filtering
- `create_mealplan` — `POST /api/households/mealplans`
- `create_mealplan_bulk` — Multiple `POST /api/households/mealplans` via `Promise.all`
- `get_todays_mealplan` — `GET /api/households/mealplans/today`

## Category Operations (7)

- `get_categories`, `get_empty_categories`, `create_category`, `get_category`, `get_category_by_slug`, `update_category`, `delete_category`

## Tag Operations (7)

- `get_tags`, `get_empty_tags`, `create_tag`, `get_tag`, `get_tag_by_slug`, `update_tag`, `delete_tag`

## Shopping List Operations (13)

- `get_shopping_lists`, `create_shopping_list`, `get_shopping_list`, `update_shopping_list`, `delete_shopping_list`
- `add_recipe_to_shopping_list`, `remove_recipe_from_shopping_list`
- `get_shopping_list_items`, `create_shopping_list_item`, `create_shopping_list_items_bulk`, `update_shopping_list_item`, `delete_shopping_list_item`, `delete_shopping_list_items_bulk`

## Food Operations (5)

- `get_foods` — `GET /api/foods` (paginated, search matches name/aliases per Mealie's behavior)
- `get_food` — `GET /api/foods/{foodId}`
- `create_food` — `POST /api/foods`; converts `aliases: string[]` to Mealie's `{ name }[]` alias shape
- `update_food` — `GET /api/foods/{foodId}` to fetch the current record, merged with the requested changes (Mealie's `PUT` is a full replace of the create-shape fields), then `PUT /api/foods/{foodId}`; the existing `id` is always echoed back (Mealie's update schema includes it and defaults to `null` if omitted, which Mealie then writes into the row), while response-only fields (`label`, `createdAt`, `updatedAt`) are stripped before the `PUT`
- `delete_food` — `DELETE /api/foods/{foodId}`
