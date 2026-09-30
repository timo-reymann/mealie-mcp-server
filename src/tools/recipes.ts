import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as recipesApi from '../api/recipes.js';
import { buildTaxonomyPatch, updateRecipeTaxonomy, updateRecipeTaxonomyBatch } from '../lib/recipe-taxonomy.js';
import { resolveTaxonomyFilter } from '../lib/taxonomy-resolution.js';
import { findRecipesForIngredients } from '../lib/find-recipes-for-ingredients.js';
import {
  getRecipesForClassification,
  CLASSIFICATION_DEFAULT_LIMIT,
  CLASSIFICATION_MAX_LIMIT,
  CLASSIFICATION_DEFAULT_TAXONOMY_STATE,
} from '../lib/recipe-classification.js';
import {
  updateRecipeIngredients,
  updateRecipeIngredientsBatch,
  RECIPE_INGREDIENTS_BATCH_MAX_SIZE,
} from '../lib/recipe-ingredients.js';
import {
  getRecipesForIngredientParsing,
  INGREDIENT_PARSING_DEFAULT_LIMIT,
  INGREDIENT_PARSING_MAX_LIMIT,
  INGREDIENT_PARSING_DEFAULT_STATE,
} from '../lib/recipe-ingredient-parsing.js';

const taxonomyModeSchema = z
  .enum(['merge', 'replace'])
  .describe(
    'merge (default) adds the given categories/tags to whatever the recipe already has. ' +
      'replace overwrites the corresponding collection with exactly the given list — ' +
      'an empty array in replace mode clears that collection entirely.',
  );

const createMissingSchema = z
  .boolean()
  .describe(
    'When true, any named category/tag that does not already exist in Mealie is created automatically. ' +
      'When false (default), unknown names cause the call to fail with an error listing the unresolved values.',
  );

const categoriesParamSchema = z
  .array(z.string())
  .describe(
    'Categories to assign, each given as a name, slug, or ID (matched case-insensitively by name/slug). ' +
      'Categories are broad groupings (e.g. "Dinner", "Dessert") as opposed to Tags, which are more specific ' +
      'attributes (e.g. "Quick", "Dairy-Free"). Omit this field to leave the recipe\'s categories unchanged. ' +
      'Passing an empty array with mode "replace" clears all categories from the recipe — use with care.',
  );

const tagsParamSchema = z
  .array(z.string())
  .describe(
    'Tags to assign, each given as a name, slug, or ID (matched case-insensitively by name/slug). ' +
      'Tags are specific, free-form attributes (e.g. "Quick", "Dairy-Free") as opposed to Categories, which are ' +
      'broad groupings (e.g. "Dinner", "Dessert"). Omit this field to leave the recipe\'s tags unchanged. ' +
      'Passing an empty array with mode "replace" clears all tags from the recipe — use with care.',
  );

const nutritionValueSchema = z.union([z.string(), z.number()]).nullable().optional();

const nutritionParamSchema = z
  .object({
    calories: nutritionValueSchema.describe('Energy, in kcal.'),
    proteinContent: nutritionValueSchema.describe('Protein, in grams.'),
    carbohydrateContent: nutritionValueSchema.describe('Carbohydrates, in grams.'),
    fatContent: nutritionValueSchema.describe('Total fat, in grams.'),
    saturatedFatContent: nutritionValueSchema.describe('Saturated fat, in grams.'),
    unsaturatedFatContent: nutritionValueSchema.describe('Unsaturated fat, in grams.'),
    transFatContent: nutritionValueSchema.describe('Trans fat, in grams.'),
    fiberContent: nutritionValueSchema.describe('Fiber, in grams.'),
    sugarContent: nutritionValueSchema.describe('Sugar, in grams.'),
    sodiumContent: nutritionValueSchema.describe('Sodium, in milligrams.'),
    cholesterolContent: nutritionValueSchema.describe('Cholesterol, in milligrams.'),
  })
  .strict()
  .describe(
    'Per-serving nutrition values, given as bare numbers (e.g. 500 or "500") — Mealie appends its own unit ' +
      'suffix (kcal, g, mg) when displaying them, so do not include units. Merged into the recipe\'s existing ' +
      'nutrition: fields omitted here keep their current value, and null clears a field. Only set values the ' +
      'source states; never estimate nutrition the source does not provide.',
  );

const recipeIngredientInputSchema = z.object({
  quantity: z
    .number()
    .nullable()
    .optional()
    .describe('Numeric amount, e.g. 2. 0 is a valid explicit value; omit to use Mealie\'s default (0).'),
  unitId: z
    .string()
    .uuid()
    .optional()
    .describe('UUID of an existing unit. Must be given together with unitName — never alone.'),
  unitName: z.string().optional().describe('Human-readable name of the unit identified by unitId. Required whenever unitId is given.'),
  foodId: z
    .string()
    .uuid()
    .optional()
    .describe(
      'UUID of an existing food (see get_food_matches for resolving multiple already-interpreted concepts at ' +
        'once, or get_foods/get_food for a single manual lookup). Must be given together with foodName — never ' +
        'alone. This tool never looks up or creates foods; resolve the food first.',
    ),
  foodName: z.string().optional().describe('Human-readable name of the food identified by foodId. Required whenever foodId is given.'),
  note: z.string().nullable().optional().describe('Free-text note for this ingredient line.'),
  display: z
    .string()
    .optional()
    .describe(
      'Fully composed display string, e.g. "2 tablespoons olive oil". Mealie does not persist this field — it ' +
        'always recomputes its own display string from quantity/unit/food/note when the ingredient is read, so ' +
        'do not rely on this value round-tripping literally.',
    ),
  originalText: z.string().nullable().optional().describe('The original, unparsed ingredient text, if any.'),
  title: z
    .string()
    .nullable()
    .optional()
    .describe('Section heading for this ingredient line (e.g. "For the sauce"); omit or use null for a normal ingredient.'),
  referenceId: z
    .string()
    .uuid()
    .optional()
    .describe(
      'Stable UUID for this ingredient line. Recipe instructions can reference ingredients by this ID — pass ' +
        'back the value from a prior get_recipe_detailed to preserve those links; omit to let Mealie assign a new one.',
    ),
});

const conciseFields = [
  'name',
  'slug',
  'recipeServings',
  'recipeYieldQuantity',
  'recipeYield',
  'totalTime',
  'rating',
  'recipeIngredient',
  'lastMade',
] as const;

function successResponse(result: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
  };
}

function errorResponse(error: unknown) {
  return {
    content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
    isError: true,
  };
}

export function registerRecipeTools(server: McpServer) {
  // @endpoints GET /api/recipes
  server.tool(
    'get_recipes',
    'Searches and lists recipes with pagination. Categories and tags are resolved by name/slug/ID against ' +
      'Mealie\'s organizer endpoints before the request, since Mealie\'s query params only match by exact slug/ID.',
    {
      search: z.string().optional(),
      page: z.number().optional(),
      perPage: z.number().optional(),
      categories: z
        .array(z.string())
        .optional()
        .describe('Each given as a name, slug, or ID (matched case-insensitively by name/slug).'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Each given as a name, slug, or ID (matched case-insensitively by name/slug).'),
      requireAllTags: z.boolean().optional(),
      requireAllCategories: z.boolean().optional(),
    },
    async (params) => {
      try {
        const categories = await resolveTaxonomyFilter('category', params.categories);
        const tags = await resolveTaxonomyFilter('tag', params.tags);
        const result = await recipesApi.getRecipes({ ...params, categories, tags });
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // @endpoints GET /api/foods, GET /api/recipes/suggestions, GET /api/recipes
  server.tool(
    'find_recipes_for_ingredients',
    'Finds recipes that contain one or more requested ingredients. Ingredient names are resolved against ' +
      "Mealie's food taxonomy internally — never pass Mealie food UUIDs, just human-readable names like " +
      '"branzino" or "chicken thighs". Use this for exact or approximate ingredient-based recipe discovery, ' +
      'e.g. deciding what to cook with an ingredient on hand. If an ingredient has no useful matches (see ' +
      'resolvedIngredients/unresolvedIngredients/matchSource in the response), the MCP will not guess a ' +
      'substitute on your behalf — retry this same tool with broader or substitutable ingredient terms you ' +
      'choose (e.g. "branzino" with no matches -> retry with "sea bass", "whole fish", or "snapper"), then use ' +
      'get_recipe_detailed or get_recipes_batch to inspect the most promising candidates.',
    {
      ingredients: z
        .array(z.string())
        .min(1)
        .describe(
          'One or more human-readable ingredient names (e.g. "branzino", "chicken thighs"). Never Mealie food ' +
            'UUIDs — this tool resolves names against Mealie\'s food taxonomy internally.',
        ),
      categories: z
        .array(z.string())
        .optional()
        .describe('Optional category filter, same name/slug/ID matching convention as get_recipes.'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Optional tag filter, same name/slug/ID matching convention as get_recipes.'),
      requireAllIngredients: z
        .boolean()
        .optional()
        .describe(
          'When true, only return recipes containing every resolved ingredient (AND). Default false returns ' +
            'recipes containing any one of them, ranked by how many they contain and how few other ingredients ' +
            'they are missing (Mealie\'s Recipe Finder behavior).',
        ),
      requireAllCategories: z.boolean().optional().describe('Require every given category, not just one.'),
      requireAllTags: z.boolean().optional().describe('Require every given tag, not just one.'),
      limit: z.number().optional().describe('Max recipes to return, default 10, capped at 50.'),
    },
    async (params) => {
      try {
        const result = await findRecipesForIngredients(params);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // @endpoints GET /api/recipes/{slug}
  server.tool(
    'get_recipe_detailed',
    'Retrieves a recipe by slug with full details including nutrition, settings, and assets.',
    { slug: z.string() },
    async ({ slug }) => {
      try {
        const result = await recipesApi.getRecipe(slug);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // @endpoints GET /api/recipes/{slug}
  server.tool(
    'get_recipe_concise',
    'Retrieves a recipe by slug, filtered to summary fields (name, slug, servings, yield, total time, rating, ingredients, last made).',
    { slug: z.string() },
    async ({ slug }) => {
      try {
        const raw = await recipesApi.getRecipe(slug);
        const result: Record<string, unknown> = {};
        for (const field of conciseFields) {
          if (field in raw) {
            result[field] = raw[field];
          }
        }
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // @endpoints GET /api/recipes/{slug}
  server.tool(
    'get_recipes_batch',
    'Fetches multiple recipes by slug with bounded concurrency (4 in-flight requests at a time).',
    { slugs: z.array(z.string()) },
    async ({ slugs }) => {
      try {
        const result = await recipesApi.getRecipesBatch(slugs);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // @endpoints GET /api/recipes/{slug}
  server.tool(
    'get_recipes_detailed_batch',
    'Fetches multiple recipes by slug with full details (including nutrition) and bounded concurrency.',
    { slugs: z.array(z.string()).describe('Recipe slugs to fetch in parallel') },
    async ({ slugs }) => {
      try {
        const result = await recipesApi.getRecipesBatch(slugs);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // @endpoints GET /api/recipes, GET /api/recipes/{slug}
  server.tool(
    'get_recipes_for_classification',
    'Compact, paginated, READ-ONLY feed of recipes for assigning Categories and Tags. Returns only the ' +
      'fields useful for classification (name, description, times, servings, source URL, ingredients, ' +
      'instructions) plus each recipe\'s EXISTING categories and tags — include and preserve those when ' +
      'classifying; do not drop or overwrite them. By default only recipes missing at least one taxonomy ' +
      'collection are returned (taxonomyState "missing_either"); use "missing_both", "missing_categories", ' +
      '"missing_tags", or "any" to change that. Pass the response\'s nextCursor back unchanged as the next ' +
      'call\'s cursor to continue; stop once hasMore is false. Pagination is stable against concurrent ' +
      'taxonomy edits — a recipe that gains categories/tags between calls will not cause other recipes to be ' +
      'skipped. A failure reading one recipe is reported in failures and does not fail the rest of the page. ' +
      'This tool never creates or modifies anything — it does not assign taxonomy, create categories/tags, or ' +
      'change any recipe. To apply classifications, call update_recipe_taxonomy_batch separately (preferably ' +
      'in batches of about five recipes), normally with mode "merge" and createMissing: false unless the user ' +
      'explicitly asks to replace collections or auto-create new categories/tags.',
    {
      cursor: z
        .string()
        .optional()
        .describe(
          'Opaque continuation token from a previous call\'s nextCursor. Pass it back unchanged to resume ' +
            'exactly where that call left off; omit it to start from the beginning of the collection. Do not ' +
            'construct or edit this value — malformed or foreign cursors are rejected with a clear error.',
        ),
      limit: z
        .number()
        .int(`limit must be between 1 and ${CLASSIFICATION_MAX_LIMIT}.`)
        .min(1, `limit must be between 1 and ${CLASSIFICATION_MAX_LIMIT}.`)
        .max(CLASSIFICATION_MAX_LIMIT, `limit must be between 1 and ${CLASSIFICATION_MAX_LIMIT}.`)
        .optional()
        .describe(`Maximum recipes to return (1-${CLASSIFICATION_MAX_LIMIT}, default ${CLASSIFICATION_DEFAULT_LIMIT}).`),
      taxonomyState: z
        .enum(['missing_either', 'missing_both', 'missing_categories', 'missing_tags', 'any'])
        .optional()
        .describe(
          `Which recipes to include, based on their existing Categories/Tags (default "${CLASSIFICATION_DEFAULT_TAXONOMY_STATE}"): ` +
            '"missing_either" — category list empty, tag list empty, or both; "missing_both" — both empty; ' +
            '"missing_categories" — category list empty regardless of tags; "missing_tags" — tag list empty ' +
            'regardless of categories; "any" — no taxonomy filtering.',
        ),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ cursor, limit, taxonomyState }) => {
      try {
        const result = await getRecipesForClassification({ cursor, limit, taxonomyState });
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // @endpoints GET /api/recipes, GET /api/recipes/{slug}
  server.tool(
    'get_recipes_for_ingredient_parsing',
    'Compact, paginated, READ-ONLY work queue of recipes whose ingredients may need structured parsing. This ' +
      'tool identifies candidate recipes using only their EXISTING stored schema state — it never parses or ' +
      'interprets ingredient language itself: it does not call Mealie\'s NLP ingredient parser, does not guess a ' +
      'food/unit association, and never modifies any recipe, food, unit, alias, or ingredient. It returns each ' +
      'ingredient\'s current stored state (quantity, unit id/name, food id/name, note, display, originalText, ' +
      'title, referenceId) plus recipe instructions (title, text, ingredientReferences) as context — turning ' +
      'that into structured data (e.g. "2 tablespoons chopped fresh parsley leaves" -> quantity 2, unit ' +
      'tablespoon, food parsley, note "chopped fresh") is entirely the calling model\'s job. Instructions are ' +
      'included because they can disambiguate an otherwise-ambiguous ingredient line or reveal how a compound ' +
      'quantity is actually used (e.g. whether "3 cups + 2 tbsp flour" is one combined amount or two separate ' +
      'uses) — this tool does not decide that, it only supplies the text. Each ingredient includes a ' +
      'deterministic, schema-only "parsingState": "section" (a Mealie ingredient-section heading, identified by ' +
      'a non-empty title — never counted as needing parsing), "unparsed" (no food is associated — the primary, ' +
      'high-confidence signal), "partial" (a food is associated but no unit, while quantity is a positive number ' +
      '— NOTE: this also matches legitimately unit-less countable foods like "4 eggs" or "2 lemons", since ' +
      'Mealie\'s schema has no field distinguishing that from an incompletely-structured row; treat "partial" as ' +
      'a coarse audit signal, not a confirmed defect), or "structured" (fully resolved, or has no meaningful ' +
      'quantity to need a unit). Each recipe also includes an ingredientParsingState summary ' +
      '(unparsedCount/partialCount/structuredCount/sectionCount/totalCount). Use "state" to choose the queue: ' +
      '"unparsed_only" (default) — recipes with at least one unparsed ingredient; "partially_parsed" — recipes ' +
      'with at least one partial ingredient; "any" — every scanned recipe, for auditing. Every scanned recipe ' +
      'needs a full detail fetch (Mealie\'s recipe list endpoint does not expose ingredients), fetched with ' +
      'bounded concurrency in small batches — a failure reading one recipe is reported in failures and does not ' +
      'fail the rest of the page. Because of that per-recipe fetch cost, a sparse queue may need to scan far ' +
      'more recipes than it returns to fill a page; returnedCount can come in below the requested limit even ' +
      'when hasMore is true, if an internal time budget is reached first — this is expected, not an error, and ' +
      'the response is still safe to use as-is. Pass the response\'s nextCursor back unchanged as the next ' +
      'call\'s cursor to continue; stop once hasMore is false. Pagination is stable against concurrent recipe ' +
      'edits, the same way get_recipes_for_classification is. When you later write changes: use get_food_matches ' +
      'and get_unit_matches to find existing canonical food/unit candidates for the concepts you interpreted ' +
      '(this tool never looks them up or creates them itself), then call update_recipe_ingredients with the ' +
      'complete, corrected ingredient collection for that recipe. Existing referenceIds are stable identifiers ' +
      'for ingredient rows and may be referenced by recipe instructions — preserve them when an existing ' +
      'ingredient row continues to represent the same ingredient. Recipe instruction ids returned here are NOT ' +
      'stable — Mealie recreates recipeInstructions (and assigns fresh ids) on every recipe update, including ' +
      'update_recipe_ingredients — do not depend on an instruction id read here still being valid after a write.',
    {
      cursor: z
        .string()
        .optional()
        .describe(
          'Opaque continuation token from a previous call\'s nextCursor. Pass it back unchanged to resume ' +
            'exactly where that call left off; omit it to start from the beginning of the collection. Do not ' +
            'construct or edit this value — malformed or foreign cursors are rejected with a clear error.',
        ),
      limit: z
        .number()
        .int(`limit must be between 1 and ${INGREDIENT_PARSING_MAX_LIMIT}.`)
        .min(1, `limit must be between 1 and ${INGREDIENT_PARSING_MAX_LIMIT}.`)
        .max(INGREDIENT_PARSING_MAX_LIMIT, `limit must be between 1 and ${INGREDIENT_PARSING_MAX_LIMIT}.`)
        .optional()
        .describe(`Maximum recipes to return (1-${INGREDIENT_PARSING_MAX_LIMIT}, default ${INGREDIENT_PARSING_DEFAULT_LIMIT}).`),
      state: z
        .enum(['unparsed_only', 'partially_parsed', 'any'])
        .optional()
        .describe(
          `Which recipes to include (default "${INGREDIENT_PARSING_DEFAULT_STATE}"): "unparsed_only" — at least ` +
            'one ingredient has no associated food; "partially_parsed" — at least one ingredient has a food but ' +
            'no unit despite a positive quantity (coarse signal, see tool description for its known false-positive ' +
            'tradeoff); "any" — no filtering, every scanned recipe is returned (useful for auditing).',
        ),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ cursor, limit, state }) => {
      try {
        const result = await getRecipesForIngredientParsing({ cursor, limit, state });
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // @endpoints POST /api/recipes, PUT /api/recipes/{slug}
  server.tool(
    'create_recipe',
    'Creates a new recipe. Optionally sets ingredients and instructions on creation.',
    {
      name: z.string(),
      ingredients: z.array(z.string()).optional(),
      instructions: z.array(z.string()).optional(),
    },
    async ({ name, ingredients, instructions }) => {
      try {
        const slug = await recipesApi.createRecipe(name);
        let result: unknown = slug;

        if (ingredients || instructions) {
          const current = await recipesApi.getRecipe(slug);
          const updatedData = { ...current };
          if (ingredients) {
            updatedData.recipeIngredient = ingredients.map((note) => ({ note }));
          }
          if (instructions) {
            updatedData.recipeInstructions = instructions.map((text) => ({ text }));
          }
          result = await recipesApi.updateRecipe(slug, updatedData);
        }

        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // @endpoints GET /api/recipes/{slug}, PATCH /api/recipes/{slug}
  server.tool(
    'patch_recipe',
    'Partially updates a recipe. Also accepts optional categories/tags/taxonomyMode/createMissing for taxonomy assignment, and a nutrition object that is merged into the existing nutrition.',
    {
      slug: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      recipeYield: z.string().optional(),
      recipeYieldQuantity: z.number().nonnegative().optional().describe('Numeric part of the yield, e.g. 12 for "12 cookies" (recipeYield then holds "cookies").'),
      recipeServings: z.number().nonnegative().optional().describe('Number of servings the recipe makes.'),
      totalTime: z.string().optional(),
      prepTime: z.string().optional(),
      performTime: z.string().optional().describe('Cooking time. Mealie labels this field "Cook Time" in its UI; its separate cookTime field is not displayed anywhere, so cook time belongs here.'),
      orgURL: z.string().optional().describe('Original source URL of the recipe.'),
      nutrition: nutritionParamSchema.optional(),
      categories: categoriesParamSchema.optional(),
      tags: tagsParamSchema.optional(),
      taxonomyMode: taxonomyModeSchema.optional(),
      createMissing: createMissingSchema.optional(),
    },
    async ({ slug, nutrition, categories, tags, taxonomyMode, createMissing, ...rest }) => {
      try {
        const data: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(rest)) {
          if (value !== undefined) {
            data[key] = value;
          }
        }

        const needsTaxonomy = categories !== undefined || tags !== undefined;
        const recipe =
          needsTaxonomy || nutrition !== undefined ? await recipesApi.getRecipe(slug) : undefined;

        if (nutrition !== undefined && recipe) {
          // Mealie's PATCH replaces nested objects wholesale, so unspecified nutrition fields would be wiped.
          const existing = (recipe.nutrition ?? {}) as Record<string, unknown>;
          data.nutrition = { ...existing, ...nutrition };
        }

        let taxonomyChanges: { categories?: unknown; tags?: unknown } | undefined;
        if (needsTaxonomy && recipe) {
          const outcome = await buildTaxonomyPatch(recipe, {
            categories,
            tags,
            mode: taxonomyMode,
            createMissing,
          });
          Object.assign(data, outcome.patchFields);
          taxonomyChanges = { categories: outcome.categories, tags: outcome.tags };
        }

        const result = await recipesApi.patchRecipe(slug, data);
        return successResponse(taxonomyChanges ? { ...result, taxonomyChanges } : result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // @endpoints GET /api/recipes/{slug}, PATCH /api/recipes/{slug}
  server.tool(
    'update_recipe_ingredients',
    'Replaces the complete structured ingredient collection (recipeIngredient) of an existing recipe, leaving ' +
      'every other recipe field untouched (name, description, categories, tags, settings, nutrition, etc.). ' +
      'Known Mealie limitation, not caused by this tool: every recipe instruction\'s ID is regenerated on any ' +
      'recipe update (PATCH or PUT), including this one — instruction text/title/summary/ingredient-references ' +
      'are preserved correctly, only the IDs change. Low-level write primitive: it does not parse ingredient ' +
      'text and does not look up or create foods/units — foodId/unitId must already reference existing Mealie ' +
      'entities, resolved first with get_food_matches/get_unit_matches (batch, alias-aware lookup for several ' +
      'already-interpreted concepts at once — the normal path after parsing ingredient text) or get_foods/' +
      'get_food/get_units/get_unit for a single manual lookup. The ingredients array ' +
      'is the recipe\'s complete new ingredient list, not a patch: any ingredient not included is removed, and ' +
      'an empty array clears all ingredients. Call get_recipe_detailed first to see the recipe\'s current ' +
      'ingredients, referenceIds, and other fields before replacing them. Note: each ingredient\'s "display" ' +
      'field is never actually persisted by Mealie — it is always recomputed from quantity/unit/food/note, ' +
      'regardless of what is supplied here. Integrity check: after writing, the recipe Mealie returns is ' +
      'verified — for every ingredient that supplied a foodId/unitId, the persisted food/unit must still be ' +
      'non-null, match the given id, and match the given name (case-insensitive against name/pluralName, plus ' +
      'abbreviation/pluralAbbreviation for units). If verification fails (e.g. a nonexistent or mismatched ' +
      'foodId/unitId that Mealie silently dropped or resolved to the wrong entity), the recipe is restored to ' +
      'its pre-write state on a best-effort basis and this call reports failure — never a silent partial ' +
      'write. Verification adds no extra request on success; a failed write adds one rollback request.',
    {
      slug: z.string().describe('Slug of the recipe to update.'),
      ingredients: z
        .array(recipeIngredientInputSchema)
        .describe(
          'Complete desired ingredient collection, in order — replaces the recipe\'s entire recipeIngredient ' +
            'list. Pass every ingredient that should remain, not just the ones changing. An empty array clears ' +
            'all ingredients.',
        ),
    },
    async ({ slug, ingredients }) => {
      try {
        const result = await updateRecipeIngredients(slug, ingredients);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // @endpoints GET /api/recipes/{slug}, PATCH /api/recipes/{slug}
  server.tool(
    'update_recipe_ingredients_batch',
    'Runs update_recipe_ingredients for multiple recipes with bounded concurrency (5 at a time). Use this ' +
      'once several recipes already have COMPLETE, resolved ingredient collections ready to persist — e.g. ' +
      'after batch-resolving food/unit concepts with get_food_matches/get_unit_matches across many recipes — ' +
      'to avoid one individual write call per recipe. Same low-level write semantics as the singular tool, ' +
      'applied independently per entry: each item\'s "ingredients" is that recipe\'s complete new ' +
      'recipeIngredient list (not a patch — any ingredient omitted is removed), foodId/unitId must already ' +
      'reference existing Mealie entities (this tool never looks up, matches, or creates foods/units), and ' +
      'referenceIds are preserved exactly as supplied. Same post-write integrity verification and best-effort ' +
      'rollback as the singular tool applies independently per recipe: a verification failure on one recipe ' +
      'restores only that recipe and is reported in its own result entry (error.rollbackSucceeded, plus ' +
      'error.rollbackError if the restore itself failed) — it never affects siblings. There is no cross-recipe ' +
      'transaction: recipes are processed independently, a failure on one (a 404/422/502 from Mealie, a local ' +
      'validation error like a mismatched foodId/foodName, or a verification failure) does not stop or roll ' +
      'back the others, and the response reports a success/failure result per recipe in the same order ' +
      'submitted. The whole call is rejected before any write starts only for a true request-shape problem — ' +
      `an empty batch, more than ${RECIPE_INGREDIENTS_BATCH_MAX_SIZE} recipes, a missing slug, or the same ` +
      'slug repeated in one call. The same recipeInstructions-id-regeneration caveat as ' +
      'update_recipe_ingredients applies to every recipe touched here (instruction content is preserved, only ' +
      'ids churn).',
    {
      updates: z
        .array(
          z.object({
            slug: z.string().describe('Slug of the recipe to update.'),
            ingredients: z
              .array(recipeIngredientInputSchema)
              .describe(
                'Complete desired ingredient collection for this recipe, in order — replaces its entire ' +
                  'recipeIngredient list. An empty array clears all ingredients for this recipe.',
              ),
          }),
        )
        .min(1, `At least one recipe update is required.`)
        .max(
          RECIPE_INGREDIENTS_BATCH_MAX_SIZE,
          `At most ${RECIPE_INGREDIENTS_BATCH_MAX_SIZE} recipes are allowed per batch call.`,
        )
        .describe(
          'One entry per recipe to update, each with its own complete ingredient collection. Each recipe is ' +
            'processed independently with bounded concurrency (5 at a time) — a failure on one recipe does not ' +
            `abort the others. Max ${RECIPE_INGREDIENTS_BATCH_MAX_SIZE} recipes per call; each slug must be unique ` +
            'within the call.',
        ),
    },
    async ({ updates }) => {
      try {
        const result = await updateRecipeIngredientsBatch(updates);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // @endpoints GET /api/organizers/categories, POST /api/organizers/categories, GET /api/organizers/tags, POST /api/organizers/tags, GET /api/recipes/{slug}, PATCH /api/recipes/{slug}
  server.tool(
    'update_recipe_taxonomy',
    'Updates a recipe\'s categories and/or tags. Resolves requested names/slugs/IDs against existing taxonomy, ' +
      'optionally auto-creating missing values. Reads the recipe first to merge with existing taxonomy.',
    {
      slug: z.string().describe('Slug of the recipe to update.'),
      categories: categoriesParamSchema.optional(),
      tags: tagsParamSchema.optional(),
      mode: taxonomyModeSchema.optional(),
      createMissing: createMissingSchema.optional(),
    },
    async ({ slug, categories, tags, mode, createMissing }) => {
      try {
        const result = await updateRecipeTaxonomy(slug, { categories, tags, mode, createMissing });
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // @endpoints GET /api/organizers/categories, POST /api/organizers/categories, GET /api/organizers/tags, POST /api/organizers/tags, GET /api/recipes/{slug}, PATCH /api/recipes/{slug}
  server.tool(
    'update_recipe_taxonomy_batch',
    'Runs update_recipe_taxonomy for multiple recipes with bounded concurrency (5 at a time), returning a ' +
      'success/error result per recipe.',
    {
      updates: z
        .array(
          z.object({
            slug: z.string().describe('Slug of the recipe to update.'),
            categories: categoriesParamSchema.optional(),
            tags: tagsParamSchema.optional(),
            mode: taxonomyModeSchema.optional(),
            createMissing: createMissingSchema.optional(),
          }),
        )
        .describe(
          'One entry per recipe to update. Each recipe is processed independently with bounded concurrency — ' +
            'a failure on one recipe does not abort the others, and the response includes a success/error result ' +
            'for every entry.',
        ),
    },
    async ({ updates }) => {
      try {
        const result = await updateRecipeTaxonomyBatch(updates);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // @endpoints POST /api/recipes/{slug}/duplicate
  server.tool(
    'duplicate_recipe',
    'Creates a duplicate of an existing recipe with an optional new name.',
    { slug: z.string(), name: z.string().optional() },
    async ({ slug, name }) => {
      try {
        const result = await recipesApi.duplicateRecipe(slug, name);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // @endpoints PATCH /api/recipes/{slug}/last-made
  server.tool(
    'mark_recipe_last_made',
    'Records the current timestamp as the recipe\'s last-made date.',
    { slug: z.string() },
    async ({ slug }) => {
      try {
        const result = await recipesApi.updateRecipeLastMade(slug);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // @endpoints POST /api/recipes/{slug}/image
  server.tool(
    'set_recipe_image_from_url',
    'Sets a recipe\'s image from a URL.',
    { slug: z.string(), imageUrl: z.string() },
    async ({ slug, imageUrl }) => {
      try {
        const result = await recipesApi.setRecipeImageFromUrl(slug, imageUrl);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // @endpoints DELETE /api/recipes/{slug}
  server.tool(
    'delete_recipe',
    'Permanently deletes a recipe.',
    { slug: z.string() },
    async ({ slug }) => {
      try {
        const result = await recipesApi.deleteRecipe(slug);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
