import * as recipesApi from '../api/recipes.js';

export interface RecipeIngredientInput {
  quantity?: number | null;
  unitId?: string;
  unitName?: string;
  foodId?: string;
  foodName?: string;
  note?: string | null;
  display?: string;
  originalText?: string | null;
  title?: string | null;
  referenceId?: string;
}

function requirePairedField(idValue: string | undefined, nameValue: string | undefined, idLabel: string, nameLabel: string): void {
  const id = idValue?.trim();
  const name = nameValue?.trim();
  if (id && !name) {
    throw new Error(`${idLabel} was given without ${nameLabel} — both are required to reference an existing ${idLabel === 'foodId' ? 'food' : 'unit'}.`);
  }
  if (!id && name) {
    throw new Error(`${nameLabel} was given without ${idLabel} — both are required to reference an existing ${idLabel === 'foodId' ? 'food' : 'unit'}.`);
  }
}

// Mealie's RecipeIngredient.food/unit are embedded objects, not flat foreign keys, but the
// recipe_ingredients table only stores food_id/unit_id — providing {id, name} is enough to
// resolve the relationship without touching the shared food/unit row's other stored fields
// (the same minimal-object convention already used for recipeCategory/tags elsewhere in this
// codebase). Only id+name together are sent, never a bare name, so Mealie never has enough to
// silently inline-create a new food/unit for an unresolved reference.
function toMealieIngredient(input: RecipeIngredientInput): Record<string, unknown> {
  requirePairedField(input.foodId, input.foodName, 'foodId', 'foodName');
  requirePairedField(input.unitId, input.unitName, 'unitId', 'unitName');

  const foodId = input.foodId?.trim();
  const foodName = input.foodName?.trim();
  const unitId = input.unitId?.trim();
  const unitName = input.unitName?.trim();

  const payload: Record<string, unknown> = {
    food: foodId && foodName ? { id: foodId, name: foodName } : null,
    unit: unitId && unitName ? { id: unitId, name: unitName } : null,
  };

  if (input.quantity !== undefined) payload.quantity = input.quantity;
  if (input.note !== undefined) payload.note = input.note;
  if (input.display !== undefined) payload.display = input.display;
  if (input.originalText !== undefined) payload.originalText = input.originalText;
  if (input.title !== undefined) payload.title = input.title;
  if (input.referenceId !== undefined) payload.referenceId = input.referenceId;

  return payload;
}

/**
 * Replaces a recipe's complete recipeIngredient collection via PATCH, not PUT. PATCH is still the
 * right choice — Mealie's generic repository patch() merges a partial payload onto a fresh full
 * snapshot of the entity and only then persists it, so unrelated *scalar* fields (name,
 * description, settings, nutrition, categories/tags, ...) are correctly left alone whether or not
 * they're in our request body. Sending only { recipeIngredient } also means we never need to fetch
 * the recipe first.
 *
 * IMPORTANT, confirmed by live testing against a real Mealie instance (both omitting
 * recipeInstructions from the request and explicitly echoing it back with matching ids):
 * recipeInstructions[].id (and likely other one-to-many child collections on Recipe) get
 * regenerated on EVERY recipe PUT or PATCH, regardless of payload shape. Root cause traced into
 * Mealie's own source: both routes funnel into RepositoryRecipes.update(), which calls
 * `entry.update(session=..., **new_data)`; BaseMixins.update() is defined as
 * `self.__init__(*args, **kwargs)` — it re-runs the SQLAlchemy model's constructor on the
 * already-persisted row, and recipe_instructions is declared with
 * cascade="all, delete-orphan", so every instruction row is deleted and recreated with a fresh id
 * as a side effect, even when the constructor is handed the exact same ids back. This is a
 * pre-existing Mealie limitation, not something this tool introduces or can avoid — it would
 * happen from any client, including Mealie's own UI. Instruction content (text/title/summary/
 * ingredientReferences) is preserved correctly; only the ids churn.
 */
export async function updateRecipeIngredients(
  slug: string,
  ingredients: RecipeIngredientInput[],
): Promise<Record<string, unknown>> {
  const recipeIngredient = ingredients.map(toMealieIngredient);
  return recipesApi.patchRecipe(slug, { recipeIngredient });
}
