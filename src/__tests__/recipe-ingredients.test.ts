import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/recipes.js', () => ({
  patchRecipe: vi.fn(),
}));

import * as recipesApi from '../api/recipes.js';
import { updateRecipeIngredients } from '../lib/recipe-ingredients.js';

const mockPatchRecipe = vi.mocked(recipesApi.patchRecipe);

beforeEach(() => {
  vi.clearAllMocks();
  mockPatchRecipe.mockImplementation((_slug: string, data: Record<string, unknown>) => Promise.resolve(data));
});

describe('updateRecipeIngredients — replacing structured ingredients', () => {
  it('replaces ingredients with structured food/unit associations, preserving all sub-fields', async () => {
    await updateRecipeIngredients('chicken-shawarma', [
      {
        quantity: 2,
        unitId: 'unit-1',
        unitName: 'tablespoons',
        foodId: 'food-1',
        foodName: 'olive oil',
        note: 'extra virgin',
        display: '2 tablespoons olive oil',
        originalText: '2 tbsp olive oil',
        title: null,
        referenceId: 'ref-new-1',
      },
    ]);

    expect(mockPatchRecipe).toHaveBeenCalledTimes(1);
    const [slugArg, payload] = mockPatchRecipe.mock.calls[0];
    expect(slugArg).toBe('chicken-shawarma');
    const ingredients = payload.recipeIngredient as Record<string, unknown>[];
    expect(ingredients).toHaveLength(1);
    expect(ingredients[0]).toEqual({
      quantity: 2,
      unit: { id: 'unit-1', name: 'tablespoons' },
      food: { id: 'food-1', name: 'olive oil' },
      note: 'extra virgin',
      display: '2 tablespoons olive oil',
      originalText: '2 tbsp olive oil',
      title: null,
      referenceId: 'ref-new-1',
    });
  });
});

// Regression coverage for the real-world finding that PUT-based full recipe replacement
// regenerated recipeInstructions[].id on every call, even though the instructions themselves
// were never touched. Root cause: Mealie's PUT route (update_one) persists the entire incoming
// Recipe object, and recipe_instructions is a SQLAlchemy relationship with
// cascade="all, delete-orphan" — reassigning it (even to an unchanged copy) deletes and recreates
// every row with a fresh id. Mealie's PATCH route (patch_one) instead calls
// patch_data.model_dump(exclude_unset=True) before persisting, so only keys actually present in
// the request body are touched. The fix: send only { recipeIngredient }, never fetch or echo back
// the rest of the recipe, so recipeInstructions (and everything else) can never be reassigned.
describe('updateRecipeIngredients — unrelated fields cannot be touched (PATCH, not PUT)', () => {
  it('sends a PATCH body containing only recipeIngredient — no other recipe field', async () => {
    await updateRecipeIngredients('chicken-shawarma', [{ note: 'new single ingredient' }]);

    expect(mockPatchRecipe).toHaveBeenCalledTimes(1);
    const [slugArg, payload] = mockPatchRecipe.mock.calls[0];
    expect(slugArg).toBe('chicken-shawarma');
    expect(Object.keys(payload)).toEqual(['recipeIngredient']);
  });

  it('keeps sending only recipeIngredient across repeated updates — no unrelated-field or id churn between writes', async () => {
    await updateRecipeIngredients('chicken-shawarma', [{ note: 'first write' }]);
    await updateRecipeIngredients('chicken-shawarma', [{ note: 'second write' }]);

    expect(mockPatchRecipe).toHaveBeenCalledTimes(2);
    for (const [, payload] of mockPatchRecipe.mock.calls) {
      expect(Object.keys(payload)).toEqual(['recipeIngredient']);
    }
  });
});

describe('updateRecipeIngredients — replaces rather than appends', () => {
  it('the supplied list is sent verbatim as the complete new collection', async () => {
    await updateRecipeIngredients('chicken-shawarma', [{ note: 'new ingredient A' }, { note: 'new ingredient B' }]);

    const [, payload] = mockPatchRecipe.mock.calls[0];
    const ingredients = payload.recipeIngredient as Record<string, unknown>[];
    expect(ingredients).toHaveLength(2);
    expect(ingredients.map((i) => i.note)).toEqual(['new ingredient A', 'new ingredient B']);
  });
});

describe('updateRecipeIngredients — preserves false/zero values', () => {
  it('does not drop an explicit quantity of 0', async () => {
    await updateRecipeIngredients('chicken-shawarma', [{ quantity: 0, note: 'a pinch' }]);
    const [, payload] = mockPatchRecipe.mock.calls[0];
    const ingredients = payload.recipeIngredient as Record<string, unknown>[];
    expect(ingredients[0].quantity).toBe(0);
  });

  it('does not drop an explicit empty-string note or display', async () => {
    await updateRecipeIngredients('chicken-shawarma', [{ note: '', display: '' }]);
    const [, payload] = mockPatchRecipe.mock.calls[0];
    const ingredients = payload.recipeIngredient as Record<string, unknown>[];
    expect(ingredients[0].note).toBe('');
    expect(ingredients[0].display).toBe('');
  });
});

describe('updateRecipeIngredients — null/optional fields', () => {
  it('sends null for note/title/originalText when explicitly requested', async () => {
    await updateRecipeIngredients('chicken-shawarma', [{ note: null, title: null, originalText: null }]);
    const [, payload] = mockPatchRecipe.mock.calls[0];
    const ingredients = payload.recipeIngredient as Record<string, unknown>[];
    expect(ingredients[0]).toMatchObject({ note: null, title: null, originalText: null });
  });

  it('omits quantity/note/display/title/originalText/referenceId entirely when not supplied', async () => {
    await updateRecipeIngredients('chicken-shawarma', [{}]);
    const [, payload] = mockPatchRecipe.mock.calls[0];
    const ingredients = payload.recipeIngredient as Record<string, unknown>[];
    expect(ingredients[0]).not.toHaveProperty('quantity');
    expect(ingredients[0]).not.toHaveProperty('note');
    expect(ingredients[0]).not.toHaveProperty('display');
    expect(ingredients[0]).not.toHaveProperty('title');
    expect(ingredients[0]).not.toHaveProperty('originalText');
    expect(ingredients[0]).not.toHaveProperty('referenceId');
    expect(ingredients[0]).toEqual({ food: null, unit: null });
  });

  it('preserves an explicit title used as a section heading', async () => {
    await updateRecipeIngredients('chicken-shawarma', [{ title: 'For the sauce' }]);
    const [, payload] = mockPatchRecipe.mock.calls[0];
    const ingredients = payload.recipeIngredient as Record<string, unknown>[];
    expect(ingredients[0].title).toBe('For the sauce');
  });
});

// Mealie's RecipeIngredientModel has no "display" database column at all (confirmed against the
// ORM model source) — it's a purely computed field. RecipeIngredient's `format_display`
// model_validator recomputes it from quantity/unit/food/note on every read whenever the value is
// falsy, and since nothing ever persists our supplied value, it reads back falsy on every
// subsequent load and gets recomputed every time. We still accept and forward whatever the
// caller supplies (Mealie's schema accepts it and this may change in a future Mealie version),
// but it should never be relied upon to round-trip literally.
describe('updateRecipeIngredients — display is forwarded but not guaranteed to persist', () => {
  it('forwards a caller-supplied display value in the outgoing payload as-is', async () => {
    await updateRecipeIngredients('chicken-shawarma', [{ display: 'CUSTOM TEST DISPLAY' }]);
    const [, payload] = mockPatchRecipe.mock.calls[0];
    const ingredients = payload.recipeIngredient as Record<string, unknown>[];
    expect(ingredients[0].display).toBe('CUSTOM TEST DISPLAY');
  });
});

describe('updateRecipeIngredients — alias/name independence', () => {
  it('keeps the food id distinct from its display name in the transformed payload', async () => {
    await updateRecipeIngredients('chicken-shawarma', [{ foodId: 'food-abc', foodName: 'Green Onion' }]);
    const [, payload] = mockPatchRecipe.mock.calls[0];
    const ingredients = payload.recipeIngredient as Record<string, unknown>[];
    expect(ingredients[0].food).toEqual({ id: 'food-abc', name: 'Green Onion' });
  });

  it('keeps the unit id distinct from its display name in the transformed payload', async () => {
    await updateRecipeIngredients('chicken-shawarma', [{ unitId: 'unit-abc', unitName: 'Tablespoon' }]);
    const [, payload] = mockPatchRecipe.mock.calls[0];
    const ingredients = payload.recipeIngredient as Record<string, unknown>[];
    expect(ingredients[0].unit).toEqual({ id: 'unit-abc', name: 'Tablespoon' });
  });

  it('rejects a foodId given without a foodName', async () => {
    await expect(updateRecipeIngredients('chicken-shawarma', [{ foodId: 'food-abc' }])).rejects.toThrow(/foodName/);
    expect(mockPatchRecipe).not.toHaveBeenCalled();
  });

  it('rejects a foodName given without a foodId', async () => {
    await expect(updateRecipeIngredients('chicken-shawarma', [{ foodName: 'Onion' }])).rejects.toThrow(/foodId/);
    expect(mockPatchRecipe).not.toHaveBeenCalled();
  });

  it('rejects a unitId given without a unitName', async () => {
    await expect(updateRecipeIngredients('chicken-shawarma', [{ unitId: 'unit-abc' }])).rejects.toThrow(/unitName/);
    expect(mockPatchRecipe).not.toHaveBeenCalled();
  });

  it('rejects a unitName given without a unitId', async () => {
    await expect(updateRecipeIngredients('chicken-shawarma', [{ unitName: 'Tablespoon' }])).rejects.toThrow(/unitId/);
    expect(mockPatchRecipe).not.toHaveBeenCalled();
  });

  it('validates ingredients before making any network call', async () => {
    await expect(updateRecipeIngredients('chicken-shawarma', [{ foodId: 'food-abc' }])).rejects.toThrow();
    expect(mockPatchRecipe).not.toHaveBeenCalled();
  });
});

describe('updateRecipeIngredients — empty ingredient collection', () => {
  it('sends an empty recipeIngredient array to intentionally clear all ingredients', async () => {
    await updateRecipeIngredients('chicken-shawarma', []);

    const [, payload] = mockPatchRecipe.mock.calls[0];
    expect(payload).toEqual({ recipeIngredient: [] });
  });
});

describe('updateRecipeIngredients — recipe not found', () => {
  it('propagates the same not-found error as other recipe tools', async () => {
    mockPatchRecipe.mockRejectedValue(new Error('Mealie API error 404: Not Found'));
    await expect(updateRecipeIngredients('missing-recipe', [{ note: 'x' }])).rejects.toThrow(/404/);
  });
});

describe('updateRecipeIngredients — Mealie API failure', () => {
  it('propagates an error from the patch call without masquerading as success', async () => {
    mockPatchRecipe.mockRejectedValue(new Error('Mealie API error 500: Internal Server Error'));
    await expect(updateRecipeIngredients('chicken-shawarma', [{ note: 'x' }])).rejects.toThrow(/500/);
  });
});
