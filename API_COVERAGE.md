# API Coverage

| Category | Tools |
|---|---|
| Recipes | 11 |
| Meal Plans | 5 |
| Categories | 7 |
| Tags | 7 |
| Shopping Lists | 13 |
| **Total** | **43** |

## Recipe Operations (11)

- `get_recipes` — `GET /api/recipes` (paginated, search, filter by tags/categories)
- `get_recipe_detailed` — `GET /api/recipes/{slug}` (full details)
- `get_recipe_concise` — `GET /api/recipes/{slug}` (filtered to summary fields)
- `get_recipes_batch` — Concurrent `GET /api/recipes/{slug}` for multiple slugs via `Promise.allSettled`
- `get_recipes_detailed_batch` — Concurrent `GET /api/recipes/{slug}` for multiple slugs (full details including nutrition)
- `create_recipe` — `POST /api/recipes` + optional `PUT` for ingredients/instructions
- `patch_recipe` — `PATCH /api/recipes/{slug}` (partial update)
- `duplicate_recipe` — `POST /api/recipes/{slug}/duplicate`
- `mark_recipe_last_made` — `PATCH /api/recipes/{slug}/last-made`
- `set_recipe_image_from_url` — `POST /api/recipes/{slug}/image`
- `delete_recipe` — `DELETE /api/recipes/{slug}`

## Meal Plan Operations (5)

- `get_all_mealplans` — `GET /api/households/mealplans`
- `get_mealplan_with_recipes` — Composite: `GET /api/households/mealplans` + batch `GET /api/recipes/{slug}` with client-side date filtering
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
