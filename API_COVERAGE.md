# API Coverage

| Category | Tools |
|---|---|
| Recipes | 17 |
| Meal Plans | 6 |
| Categories | 7 |
| Tags | 7 |
| Shopping Lists | 13 |
| Foods | 6 |
| Units | 6 |
| **Total** | **62** |

## Recipes Operations (17)

- `create_recipe` — POST /api/recipes, PUT /api/recipes/{slug}
  Creates a new recipe. Optionally sets ingredients and instructions on creation.
  Params: `name`, `ingredients`, `instructions`

- `delete_recipe` — DELETE /api/recipes/{slug}
  Permanently deletes a recipe.
  Params: `slug`

- `duplicate_recipe` — POST /api/recipes/{slug}/duplicate
  Creates a duplicate of an existing recipe with an optional new name.
  Params: `slug`, `name`

- `find_recipes_for_ingredients` — GET /api/foods, GET /api/recipes/suggestions, GET /api/recipes
  Finds recipes that contain one or more requested ingredients. Ingredient names are resolved against 

- `get_recipe_concise` — GET /api/recipes/{slug}
  Retrieves a recipe by slug, filtered to summary fields (name, slug, servings, yield, total time, rating, ingredients, last made).
  Params: `slug`

- `get_recipe_detailed` — GET /api/recipes/{slug}
  Retrieves a recipe by slug with full details including nutrition, settings, and assets.
  Params: `slug`

- `get_recipes` — GET /api/recipes
  Searches and lists recipes with pagination. Categories and tags are resolved by name/slug/ID against 

- `get_recipes_batch` — GET /api/recipes/{slug}
  Fetches multiple recipes by slug with bounded concurrency (4 in-flight requests at a time).
  Params: `slugs`

- `get_recipes_detailed_batch` — GET /api/recipes/{slug}
  Fetches multiple recipes by slug with full details (including nutrition) and bounded concurrency.
  Params: `slugs`

- `get_recipes_for_classification` — GET /api/recipes, GET /api/recipes/{slug}
  Compact, paginated, READ-ONLY feed of recipes for assigning Categories and Tags. Returns only the 

- `get_recipes_for_ingredient_parsing` — GET /api/recipes, GET /api/recipes/{slug}
  Compact, paginated, READ-ONLY work queue of recipes whose ingredients may need structured parsing. This 

- `mark_recipe_last_made` — PATCH /api/recipes/{slug}/last-made
  Records the current timestamp as the recipe\

- `patch_recipe` — GET /api/recipes/{slug}, PATCH /api/recipes/{slug}
  Partially updates a recipe. Also accepts optional categories/tags/taxonomyMode/createMissing for taxonomy assignment.
  Params: `slug`, `name`, `description`, `recipeYield`, `totalTime`, `categories`, `tags`, `taxonomyMode`, `createMissing`

- `set_recipe_image_from_url` — POST /api/recipes/{slug}/image
  Sets a recipe\

- `update_recipe_ingredients` — PATCH /api/recipes/{slug}
  Replaces the complete structured ingredient collection (recipeIngredient) of an existing recipe, leaving 

- `update_recipe_taxonomy` — GET /api/organizers/categories, POST /api/organizers/categories, GET /api/organizers/tags, POST /api/organizers/tags, GET /api/recipes/{slug}, PATCH /api/recipes/{slug}
  Updates a recipe\

- `update_recipe_taxonomy_batch` — GET /api/organizers/categories, POST /api/organizers/categories, GET /api/organizers/tags, POST /api/organizers/tags, GET /api/recipes/{slug}, PATCH /api/recipes/{slug}
  Runs update_recipe_taxonomy for multiple recipes with bounded concurrency (5 at a time), returning a 

## Meal Plans Operations (6)

- `create_mealplan` — POST /api/households/mealplans
  Creates a single meal plan entry for a given date.
  Params: `date`, `recipeId`, `title`, `entryType`

- `create_mealplan_bulk` — POST /api/households/mealplans
  Creates multiple meal plan entries at once via concurrent requests.
  Params: `entries`, `date`, `recipeId`, `title`, `entryType`

- `get_all_mealplans` — GET /api/households/mealplans
  Lists meal plans with optional date range filtering and pagination.
  Params: `startDate`, `endDate`, `page`, `perPage`

- `get_mealplan_with_recipes` — GET /api/households/mealplans, GET /api/recipes/{slug}
  Returns meal plans with embedded recipe details (full recipe data fetched via batch requests with bounded concurrency).
  Params: `startDate`, `endDate`

- `get_todays_mealplan` — GET /api/households/mealplans/today
  Returns today\

- `patch_mealplan` — DELETE /api/households/mealplans/{id}, GET /api/households/mealplans/{id}, PUT /api/households/mealplans/{id}, POST /api/households/mealplans
  Performs a batch of mixed operations on meal plan entries in a single call. Use this to move recipes between meal types, update entries, or add new ones.
  Params: `action`, `id`, `date`, `recipeId`, `title`

## Categories Operations (7)

- `create_category` — POST /api/organizers/categories
  Creates a new recipe category.
  Params: `name`

- `delete_category` — DELETE /api/organizers/categories/{id}
  Deletes a category. Mealie may refuse if recipes still reference it.
  Params: `categoryId`

- `get_categories` — GET /api/organizers/categories
  Lists and searches the household\

- `get_category` — GET /api/organizers/categories/{id}
  Retrieves a single category by its UUID.
  Params: `categoryId`

- `get_category_by_slug` — GET /api/organizers/categories/slug/{slug}
  Retrieves a single category by its URL slug.
  Params: `categorySlug`

- `get_empty_categories` — GET /api/organizers/categories/empty
  Returns categories that have no recipes assigned.

- `update_category` — PUT /api/organizers/categories/{id}
  Updates a category\

## Tags Operations (7)

- `create_tag` — POST /api/organizers/tags
  Creates a new recipe tag.
  Params: `name`

- `delete_tag` — DELETE /api/organizers/tags/{id}
  Deletes a tag. Mealie may refuse if recipes still reference it.
  Params: `tagId`

- `get_empty_tags` — GET /api/organizers/tags/empty
  Returns tags that have no recipes assigned.

- `get_tag` — GET /api/organizers/tags/{id}
  Retrieves a single tag by its UUID.
  Params: `tagId`

- `get_tag_by_slug` — GET /api/organizers/tags/slug/{slug}
  Retrieves a single tag by its URL slug.
  Params: `tagSlug`

- `get_tags` — GET /api/organizers/tags
  Lists and searches the household\

- `update_tag` — PUT /api/organizers/tags/{id}
  Updates a tag\

## Shopping Lists Operations (13)

- `add_recipe_to_shopping_list` — POST /api/households/shopping/lists/{id}/recipe/{recipeId}
  Adds a recipe\

- `create_shopping_list` — POST /api/households/shopping/lists
  Creates a new shopping list.
  Params: `name`

- `create_shopping_list_item` — POST /api/households/shopping/items
  Creates a single shopping list item.
  Params: `shoppingListId`, `note`, `quantity`, `unitId`, `foodId`, `labelId`

- `create_shopping_list_items_bulk` — POST /api/households/shopping/items/create-bulk
  Creates multiple shopping list items at once.
  Params: `items`

- `delete_shopping_list` — DELETE /api/households/shopping/lists/{id}
  Deletes a shopping list.
  Params: `listId`

- `delete_shopping_list_item` — DELETE /api/households/shopping/items/{id}
  Deletes a single shopping list item.
  Params: `itemId`

- `delete_shopping_list_items_bulk` — DELETE /api/households/shopping/items
  Deletes multiple shopping list items at once.
  Params: `itemIds`

- `get_shopping_list` — GET /api/households/shopping/lists/{id}
  Retrieves a shopping list by its UUID.
  Params: `listId`

- `get_shopping_list_items` — GET /api/households/shopping/items
  Lists all shopping list items across lists with pagination.
  Params: `page`, `perPage`, `search`

- `get_shopping_lists` — GET /api/households/shopping/lists
  Lists the household\

- `remove_recipe_from_shopping_list` — POST /api/households/shopping/lists/{id}/recipe/{recipeId}/delete
  Removes a recipe\

- `update_shopping_list` — PUT /api/households/shopping/lists/{id}
  Updates a shopping list\

- `update_shopping_list_item` — PUT /api/households/shopping/items/{id}
  Updates a shopping list item\

## Foods Operations (6)

- `create_food` — POST /api/foods
  Creates a new food. Call get_foods first to check whether an existing food or alias already covers this 

- `delete_food` — DELETE /api/foods/{id}
  DESTRUCTIVE and irreversible: permanently deletes a food. Use get_food first to verify this is the exact 

- `get_food` — GET /api/foods/{id}
  Retrieves a single food by ID, including its aliases and label information when present.
  Params: `foodId`

- `get_food_matches` — GET /api/foods (with queryFilter)
  Finds existing canonical Mealie food candidates for multiple already-interpreted food concepts in one 

- `get_foods` — GET /api/foods
  Lists and searches the household\

- `update_food` — GET /api/foods/{id}, PUT /api/foods/{id}
  Updates an existing food. Fields left unspecified keep their current value. Sufficient for adding an alias: 

## Units Operations (6)

- `create_unit` — POST /api/units
  Creates a canonical Mealie ingredient unit when an appropriate unit does not already exist. Call 

- `delete_unit` — DELETE /api/units/{id}
  DESTRUCTIVE and irreversible: permanently deletes a canonical Mealie ingredient unit. Use get_unit first 

- `get_unit` — GET /api/units/{id}
  Retrieves a single canonical Mealie ingredient unit by ID, including its aliases, abbreviations, and 

- `get_unit_matches` — GET /api/units (with queryFilter)
  Finds existing canonical Mealie unit candidates for multiple already-interpreted unit concepts in one 

- `get_units` — GET /api/units
  Search or list canonical Mealie ingredient units (e.g. "tablespoon", "cup", "gram") with plain pagination. 

- `update_unit` — GET /api/units/{id}, PUT /api/units/{id}
  Updates an existing canonical Mealie ingredient unit. Fields left unspecified keep their current value.
