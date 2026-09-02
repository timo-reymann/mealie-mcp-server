import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/recipes.js', () => ({
  getRecipe: vi.fn(),
  patchRecipe: vi.fn(),
}));

import * as recipesApi from '../api/recipes.js';
import { MealieApiError } from '../api/client.js';
import {
  updateRecipeIngredients,
  updateRecipeIngredientsBatch,
  IngredientVerificationError,
  RecipeIngredientsBatchValidationError,
  RECIPE_INGREDIENTS_BATCH_MAX_SIZE,
} from '../lib/recipe-ingredients.js';

const mockGetRecipe = vi.mocked(recipesApi.getRecipe);
const mockPatchRecipe = vi.mocked(recipesApi.patchRecipe);

const ORIGINAL_RECIPE = {
  slug: 'chicken-shawarma',
  name: 'Chicken Shawarma',
  description: 'Original description',
  recipeIngredient: [{ note: 'original ingredient', referenceId: 'ref-original' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRecipe.mockImplementation((slug: string) => Promise.resolve({ ...ORIGINAL_RECIPE, slug }));
  // Echoing the exact outgoing payload back is what a well-behaved Mealie write looks like: the
  // minimal { id, name } food/unit objects we send are handed straight back, so verification's
  // id/name checks pass for free in every test that doesn't override this default.
  mockPatchRecipe.mockImplementation((_slug: string, data: Record<string, unknown>) => Promise.resolve({ ...data }));
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

// PATCH keeps the outgoing payload down to exactly { recipeIngredient }, which is what protects
// unrelated *scalar* recipe fields (name, description, settings, nutrition, categories/tags, ...)
// — confirmed correct by live testing against a real Mealie instance.
//
// IMPORTANT LIMITATION, also confirmed by live testing (both omitting recipeInstructions from the
// request AND explicitly echoing it back with matching ids): recipeInstructions[].id still gets
// regenerated on every recipe PUT *or* PATCH, regardless of payload shape. This is a Mealie-side
// bug, not something fixable from the payload we send — see the comment above
// updateRecipeIngredients() in recipe-ingredients.ts for the full root-cause trace. These mocked
// tests can only verify what our own code sends; they cannot observe or claim to fix Mealie's
// server-side persistence behavior for recipeInstructions.
describe('updateRecipeIngredients — payload never contains unrelated scalar fields (PATCH, not PUT)', () => {
  it('sends a PATCH body containing only recipeIngredient — no other recipe field', async () => {
    await updateRecipeIngredients('chicken-shawarma', [{ note: 'new single ingredient' }]);

    expect(mockPatchRecipe).toHaveBeenCalledTimes(1);
    const [slugArg, payload] = mockPatchRecipe.mock.calls[0];
    expect(slugArg).toBe('chicken-shawarma');
    expect(Object.keys(payload)).toEqual(['recipeIngredient']);
  });

  it('keeps sending only recipeIngredient across repeated updates — no unrelated scalar field is ever included', async () => {
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
    expect(mockGetRecipe).not.toHaveBeenCalled();
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
    expect(mockGetRecipe).not.toHaveBeenCalled();
    expect(mockPatchRecipe).not.toHaveBeenCalled();
  });
});

describe('updateRecipeIngredients — case-insensitive name matching', () => {
  it('accepts a persisted food name that only differs in case from the requested name', async () => {
    mockPatchRecipe.mockResolvedValue({
      recipeIngredient: [{ food: { id: 'food-1', name: 'TOMATO' }, unit: null }],
    });

    await expect(
      updateRecipeIngredients('chicken-shawarma', [{ foodId: 'food-1', foodName: 'tomato' }]),
    ).resolves.toBeDefined();
  });

  it('accepts a persisted unit name that only differs in case from the requested name', async () => {
    mockPatchRecipe.mockResolvedValue({
      recipeIngredient: [{ food: null, unit: { id: 'unit-1', name: 'TABLESPOON' } }],
    });

    await expect(
      updateRecipeIngredients('chicken-shawarma', [{ unitId: 'unit-1', unitName: 'tablespoon' }]),
    ).resolves.toBeDefined();
  });

  it('accepts a persisted food name matching only via pluralName', async () => {
    mockPatchRecipe.mockResolvedValue({
      recipeIngredient: [{ food: { id: 'food-1', name: 'tomato', pluralName: 'Tomatoes' }, unit: null }],
    });

    await expect(
      updateRecipeIngredients('chicken-shawarma', [{ foodId: 'food-1', foodName: 'tomatoes' }]),
    ).resolves.toBeDefined();
  });

  it('accepts a persisted unit name matching only via abbreviation', async () => {
    mockPatchRecipe.mockResolvedValue({
      recipeIngredient: [{ food: null, unit: { id: 'unit-1', name: 'tablespoon', abbreviation: 'tbsp' } }],
    });

    await expect(
      updateRecipeIngredients('chicken-shawarma', [{ unitId: 'unit-1', unitName: 'tbsp' }]),
    ).resolves.toBeDefined();
  });
});

describe('updateRecipeIngredients — legitimate unstructured/unitless rows', () => {
  it('does not require a unit for a legitimate unitless countable (e.g. "4 eggs")', async () => {
    mockPatchRecipe.mockResolvedValue({
      recipeIngredient: [{ food: { id: 'food-egg', name: 'egg' }, unit: null, quantity: 4 }],
    });

    await expect(
      updateRecipeIngredients('chicken-shawarma', [{ foodId: 'food-egg', foodName: 'egg', quantity: 4 }]),
    ).resolves.toBeDefined();
  });

  it('does not require a food when no foodId was supplied (e.g. a section heading row)', async () => {
    mockPatchRecipe.mockResolvedValue({
      recipeIngredient: [{ food: null, unit: null, title: 'For the sauce' }],
    });

    await expect(
      updateRecipeIngredients('chicken-shawarma', [{ title: 'For the sauce' }]),
    ).resolves.toBeDefined();
  });

  it('continues to succeed for a food without a unit', async () => {
    mockPatchRecipe.mockResolvedValue({
      recipeIngredient: [{ food: { id: 'food-1', name: 'olive oil' }, unit: null }],
    });

    await expect(
      updateRecipeIngredients('chicken-shawarma', [{ foodId: 'food-1', foodName: 'olive oil' }]),
    ).resolves.toBeDefined();
  });

  it('continues to succeed for an explicit quantity of 0', async () => {
    mockPatchRecipe.mockResolvedValue({
      recipeIngredient: [{ food: { id: 'food-1', name: 'olive oil' }, unit: null, quantity: 0 }],
    });

    await expect(
      updateRecipeIngredients('chicken-shawarma', [{ foodId: 'food-1', foodName: 'olive oil', quantity: 0 }]),
    ).resolves.toBeDefined();
  });
});

describe('updateRecipeIngredients — empty ingredient collection', () => {
  it('sends an empty recipeIngredient array to intentionally clear all ingredients', async () => {
    mockPatchRecipe.mockResolvedValue({ recipeIngredient: [] });
    await updateRecipeIngredients('chicken-shawarma', []);

    const [, payload] = mockPatchRecipe.mock.calls[0];
    expect(payload).toEqual({ recipeIngredient: [] });
  });
});

describe('updateRecipeIngredients — recipe not found', () => {
  it('propagates a not-found error from the initial fetch', async () => {
    mockGetRecipe.mockRejectedValue(new Error('Mealie API error 404: Not Found'));
    await expect(updateRecipeIngredients('missing-recipe', [{ note: 'x' }])).rejects.toThrow(/404/);
    expect(mockPatchRecipe).not.toHaveBeenCalled();
  });

  it('propagates the same not-found error when it surfaces from the write instead', async () => {
    mockPatchRecipe.mockRejectedValue(new Error('Mealie API error 404: Not Found'));
    await expect(updateRecipeIngredients('missing-recipe', [{ note: 'x' }])).rejects.toThrow(/404/);
  });
});

describe('updateRecipeIngredients — Mealie API failure', () => {
  it('propagates an error from the patch call without masquerading as success', async () => {
    mockPatchRecipe.mockRejectedValue(new Error('Mealie API error 500: Internal Server Error'));
    await expect(updateRecipeIngredients('chicken-shawarma', [{ note: 'x' }])).rejects.toThrow(/500/);
  });

  it('does not attempt a rollback for a plain Mealie API failure (nothing was verified)', async () => {
    mockPatchRecipe.mockRejectedValue(new Error('Mealie API error 500: Internal Server Error'));
    await expect(updateRecipeIngredients('chicken-shawarma', [{ note: 'x' }])).rejects.toThrow();
    expect(mockPatchRecipe).toHaveBeenCalledTimes(1);
  });
});

// ── Post-write verification & rollback ──────────────────────────────────────

describe('updateRecipeIngredients — verification: nonexistent food id', () => {
  it('detects Mealie silently dropping a requested food association (food: null) and restores the original recipe', async () => {
    // First call (the write) returns food: null; second call (the rollback) succeeds.
    mockPatchRecipe
      .mockResolvedValueOnce({
        recipeIngredient: [
          { food: null, note: 'fresh; for garnish', originalText: 'Fresh cilantro for garnish' },
        ],
      })
      .mockResolvedValueOnce({ recipeIngredient: ORIGINAL_RECIPE.recipeIngredient });

    await expect(
      updateRecipeIngredients('chicken-shawarma', [
        {
          foodId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          foodName: 'cilantro',
          note: 'fresh; for garnish',
          originalText: 'Fresh cilantro for garnish',
        },
      ]),
    ).rejects.toThrow(IngredientVerificationError);

    expect(mockPatchRecipe).toHaveBeenCalledTimes(2);
    const [rollbackSlug, rollbackPayload] = mockPatchRecipe.mock.calls[1];
    expect(rollbackSlug).toBe('chicken-shawarma');
    expect(rollbackPayload).toEqual({ recipeIngredient: ORIGINAL_RECIPE.recipeIngredient });
  });

  it('reports failure (not success) and includes an actionable message', async () => {
    mockPatchRecipe
      .mockResolvedValueOnce({ recipeIngredient: [{ food: null }] })
      .mockResolvedValueOnce({ recipeIngredient: ORIGINAL_RECIPE.recipeIngredient });

    await expect(
      updateRecipeIngredients('chicken-shawarma', [{ foodId: 'food-x', foodName: 'cilantro' }]),
    ).rejects.toThrow(/foodId 'food-x'.*no food association/s);
  });

  it('reports success (verification passed) when rollback was not needed', async () => {
    mockPatchRecipe.mockResolvedValue({
      recipeIngredient: [{ food: { id: 'food-x', name: 'cilantro' } }],
    });
    await expect(
      updateRecipeIngredients('chicken-shawarma', [{ foodId: 'food-x', foodName: 'cilantro' }]),
    ).resolves.toBeDefined();
    expect(mockPatchRecipe).toHaveBeenCalledTimes(1);
  });

  it('leaves unrelated recipe fields conceptually untouched by rollback (rollback payload is recipeIngredient only)', async () => {
    mockPatchRecipe
      .mockResolvedValueOnce({ recipeIngredient: [{ food: null }] })
      .mockResolvedValueOnce({ recipeIngredient: ORIGINAL_RECIPE.recipeIngredient });

    await expect(
      updateRecipeIngredients('chicken-shawarma', [{ foodId: 'food-x', foodName: 'cilantro' }]),
    ).rejects.toThrow();

    const [, rollbackPayload] = mockPatchRecipe.mock.calls[1];
    expect(Object.keys(rollbackPayload)).toEqual(['recipeIngredient']);
  });
});

describe('updateRecipeIngredients — verification: wrong food id/name', () => {
  it('detects a valid foodId resolving to a different canonical food name and restores the original recipe', async () => {
    mockPatchRecipe
      .mockResolvedValueOnce({
        recipeIngredient: [{ food: { id: 'tomato-id', name: 'tomato' } }],
      })
      .mockResolvedValueOnce({ recipeIngredient: ORIGINAL_RECIPE.recipeIngredient });

    await expect(
      updateRecipeIngredients('chicken-shawarma', [{ foodId: 'tomato-id', foodName: 'cilantro' }]),
    ).rejects.toThrow(/requested foodId 'tomato-id'.*persisted food 'tomato-id' named 'tomato'/s);

    expect(mockPatchRecipe).toHaveBeenCalledTimes(2);
  });
});

describe('updateRecipeIngredients — verification: nonexistent unit id', () => {
  it('detects a requested unit association coming back null and restores the original recipe', async () => {
    mockPatchRecipe
      .mockResolvedValueOnce({ recipeIngredient: [{ food: null, unit: null }] })
      .mockResolvedValueOnce({ recipeIngredient: ORIGINAL_RECIPE.recipeIngredient });

    await expect(
      updateRecipeIngredients('chicken-shawarma', [{ unitId: 'unit-x', unitName: 'tablespoon' }]),
    ).rejects.toThrow(/unitId 'unit-x'.*no unit association/s);

    expect(mockPatchRecipe).toHaveBeenCalledTimes(2);
  });
});

describe('updateRecipeIngredients — verification: wrong unit id/name', () => {
  it('detects a persisted unit identity contradicting the requested unit name', async () => {
    mockPatchRecipe
      .mockResolvedValueOnce({ recipeIngredient: [{ food: null, unit: { id: 'unit-x', name: 'cup' } }] })
      .mockResolvedValueOnce({ recipeIngredient: ORIGINAL_RECIPE.recipeIngredient });

    await expect(
      updateRecipeIngredients('chicken-shawarma', [{ unitId: 'unit-x', unitName: 'tablespoon' }]),
    ).rejects.toThrow(/unitId 'unit-x'.*persisted unit 'unit-x' named 'cup'/s);
  });
});

describe('updateRecipeIngredients — verification: ingredient count mismatch', () => {
  it('fails and restores the original recipe when the persisted count is fewer than requested', async () => {
    mockPatchRecipe
      .mockResolvedValueOnce({
        recipeIngredient: [{ note: 'a' }, { note: 'b' }, { note: 'c' }, { note: 'd' }],
      })
      .mockResolvedValueOnce({ recipeIngredient: ORIGINAL_RECIPE.recipeIngredient });

    await expect(
      updateRecipeIngredients('chicken-shawarma', [
        { note: 'a' },
        { note: 'b' },
        { note: 'c' },
        { note: 'd' },
        { note: 'e' },
      ]),
    ).rejects.toThrow(/Requested 5 ingredient\(s\) but Mealie persisted 4/);

    expect(mockPatchRecipe).toHaveBeenCalledTimes(2);
  });
});

describe('updateRecipeIngredients — verification: rollback failure', () => {
  it('surfaces both the verification failure and the rollback failure distinctly', async () => {
    mockPatchRecipe
      .mockResolvedValueOnce({ recipeIngredient: [{ food: null }] })
      .mockRejectedValueOnce(new Error('Mealie API error 500: Internal Server Error'));

    let caught: unknown;
    try {
      await updateRecipeIngredients('chicken-shawarma', [{ foodId: 'food-x', foodName: 'cilantro' }]);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(IngredientVerificationError);
    const error = caught as InstanceType<typeof IngredientVerificationError>;
    expect(error.rollbackSucceeded).toBe(false);
    expect(error.rollbackError).toMatch(/500/);
    expect(error.message).toMatch(/verification failed/i);
    expect(error.message).toMatch(/rollback.*also failed/i);
    expect(error.message).toMatch(/manual inspection/i);
  });
});

// Regression coverage for a live bug: Mealie's recipe_ingredient.reference_id column is nullable
// with no stored default (mealie-recipes/mealie#7072, fixed by mealie-recipes/mealie PR #7139 with
// a `reference_id or uuid4()` schema validator). For a row whose reference_id was never durably
// pinned, that validator synthesizes a *fresh random UUID on every independent read* — never
// persisting it just by being read. This writer's own pre-write GET (the rollback snapshot) is a
// separate read from whatever the caller's own earlier get_recipe_detailed call saw, so for such a
// row the two reads can disagree even though neither is "wrong". The write that gets rolled back
// already carried the caller's requested referenceId through to Mealie and durably persisted it —
// so rollback must prefer that requested value over the writer's own (possibly different,
// possibly-synthesized) pre-write snapshot value, never the other way around.
describe('updateRecipeIngredients — rollback preserves every requested referenceId, even when the pre-write snapshot disagrees', () => {
  it('restores using each ingredient\'s requested referenceId, not a differing value from the pre-write snapshot (unit verification failure)', async () => {
    mockGetRecipe.mockResolvedValue({
      slug: 'baked-pesto-chicken',
      recipeIngredient: [
        { food: { id: 'garlic-food', name: 'garlic' }, unit: null, note: 'garlic', referenceId: 'ref-garlic-original' },
        {
          food: { id: 'pesto-food', name: 'pesto' },
          unit: { id: 'unit-cup', name: 'cup' },
          note: 'pesto',
          referenceId: 'ref-pesto-original',
        },
        {
          food: { id: 'pepper-food', name: 'black pepper' },
          unit: null,
          note: 'black pepper',
          // Simulates Mealie synthesizing a different display value for a never-pinned row than
          // whatever the caller's own earlier read (and thus their request below) used.
          referenceId: 'ref-pepper-SNAPSHOT-DRIFTED',
        },
      ],
    });

    mockPatchRecipe
      .mockResolvedValueOnce({
        recipeIngredient: [
          { food: { id: 'garlic-food', name: 'garlic' }, unit: null },
          { food: { id: 'pesto-food', name: 'pesto' }, unit: null }, // unit dropped -> verification failure
          { food: { id: 'pepper-food', name: 'black pepper' }, unit: null },
        ],
      })
      .mockResolvedValueOnce({ recipeIngredient: [] });

    await expect(
      updateRecipeIngredients('baked-pesto-chicken', [
        { foodId: 'garlic-food', foodName: 'garlic', note: 'garlic', referenceId: 'ref-garlic-original' },
        {
          foodId: 'pesto-food',
          foodName: 'pesto',
          unitId: '11111111-1111-4111-8111-111111111111',
          unitName: 'cup',
          note: 'pesto',
          referenceId: 'ref-pesto-original',
        },
        {
          foodId: 'pepper-food',
          foodName: 'black pepper',
          note: 'black pepper',
          referenceId: 'ref-pepper-original', // the caller's own known-good value
        },
      ]),
    ).rejects.toThrow(IngredientVerificationError);

    expect(mockPatchRecipe).toHaveBeenCalledTimes(2);
    const [, rollbackPayload] = mockPatchRecipe.mock.calls[1];
    const rollbackIngredients = rollbackPayload.recipeIngredient as Record<string, unknown>[];

    expect(rollbackIngredients.map((i) => i.referenceId)).toEqual([
      'ref-garlic-original',
      'ref-pesto-original',
      'ref-pepper-original', // NOT 'ref-pepper-SNAPSHOT-DRIFTED'
    ]);

    // Everything else the rollback restores still comes from the pre-write snapshot untouched.
    expect(rollbackIngredients[1]).toMatchObject({
      food: { id: 'pesto-food', name: 'pesto' },
      unit: { id: 'unit-cup', name: 'cup' },
      note: 'pesto',
    });
    expect(rollbackIngredients[2]).toMatchObject({
      food: { id: 'pepper-food', name: 'black pepper' },
      unit: null,
      note: 'black pepper',
    });
  });

  it('restores using each ingredient\'s requested referenceId on a food verification failure too (not unit-specific)', async () => {
    mockGetRecipe.mockResolvedValue({
      slug: 'baked-pesto-chicken',
      recipeIngredient: [
        {
          food: { id: 'pesto-food', name: 'pesto' },
          unit: { id: 'unit-cup', name: 'cup' },
          note: 'pesto',
          referenceId: 'ref-pesto-original',
        },
        {
          food: { id: 'pepper-food', name: 'black pepper' },
          unit: null,
          note: 'black pepper',
          referenceId: 'ref-pepper-SNAPSHOT-DRIFTED',
        },
      ],
    });

    mockPatchRecipe
      .mockResolvedValueOnce({
        recipeIngredient: [
          { food: null, unit: { id: 'unit-cup', name: 'cup' } }, // food dropped -> verification failure
          { food: { id: 'pepper-food', name: 'black pepper' }, unit: null },
        ],
      })
      .mockResolvedValueOnce({ recipeIngredient: [] });

    await expect(
      updateRecipeIngredients('baked-pesto-chicken', [
        {
          foodId: '22222222-2222-4222-8222-222222222222',
          foodName: 'pesto',
          unitId: 'unit-cup',
          unitName: 'cup',
          note: 'pesto',
          referenceId: 'ref-pesto-original',
        },
        {
          foodId: 'pepper-food',
          foodName: 'black pepper',
          note: 'black pepper',
          referenceId: 'ref-pepper-original',
        },
      ]),
    ).rejects.toThrow(IngredientVerificationError);

    const [, rollbackPayload] = mockPatchRecipe.mock.calls[1];
    const rollbackIngredients = rollbackPayload.recipeIngredient as Record<string, unknown>[];
    expect(rollbackIngredients.map((i) => i.referenceId)).toEqual(['ref-pesto-original', 'ref-pepper-original']);
  });
});

describe('updateRecipeIngredients — regression: section rows still supported', () => {
  it('accepts a title-only section row with no food/unit', async () => {
    mockPatchRecipe.mockResolvedValue({ recipeIngredient: [{ title: 'For the sauce', food: null, unit: null }] });
    await expect(
      updateRecipeIngredients('chicken-shawarma', [{ title: 'For the sauce' }]),
    ).resolves.toBeDefined();
  });
});

describe('updateRecipeIngredientsBatch — basic behavior', () => {
  it('updates two recipes successfully, preserving input order and reporting counts', async () => {
    const result = await updateRecipeIngredientsBatch([
      { slug: 'recipe-a', ingredients: [{ note: 'flour' }, { note: 'sugar' }] },
      { slug: 'recipe-b', ingredients: [{ note: 'butter' }] },
    ]);

    expect(result.requestedCount).toBe(2);
    expect(result.succeededCount).toBe(2);
    expect(result.failedCount).toBe(0);
    // Each successful recipe now costs 1 GET (rollback snapshot) + 1 PATCH (write) = 2 requests.
    expect(result.apiRequestCount).toBe(4);
    expect(result.results.map((r) => r.slug)).toEqual(['recipe-a', 'recipe-b']);
    expect(result.results[0]).toEqual({ slug: 'recipe-a', success: true, ingredientCount: 2 });
    expect(result.results[1]).toEqual({ slug: 'recipe-b', success: true, ingredientCount: 1 });
    expect(mockPatchRecipe).toHaveBeenCalledTimes(2);
  });

  it('sends only recipeIngredient for each recipe, leaving other fields untouched', async () => {
    await updateRecipeIngredientsBatch([
      { slug: 'recipe-a', ingredients: [{ note: 'flour' }] },
      { slug: 'recipe-b', ingredients: [{ note: 'butter' }] },
    ]);

    for (const [, payload] of mockPatchRecipe.mock.calls) {
      expect(Object.keys(payload)).toEqual(['recipeIngredient']);
    }
  });

  it('preserves supplied referenceId values exactly, same as the singular tool', async () => {
    await updateRecipeIngredientsBatch([
      { slug: 'recipe-a', ingredients: [{ note: 'flour', referenceId: 'ref-1' }] },
    ]);

    const [, payload] = mockPatchRecipe.mock.calls[0];
    const ingredients = payload.recipeIngredient as Record<string, unknown>[];
    expect(ingredients[0].referenceId).toBe('ref-1');
  });

  it('does not touch unrelated instruction/category/tag fields (payload is recipeIngredient only)', async () => {
    await updateRecipeIngredientsBatch([{ slug: 'recipe-a', ingredients: [{ note: 'flour' }] }]);
    const [, payload] = mockPatchRecipe.mock.calls[0];
    expect(payload).not.toHaveProperty('recipeInstructions');
    expect(payload).not.toHaveProperty('recipeCategory');
    expect(payload).not.toHaveProperty('tags');
  });

  it('does not return full recipe payloads for successful entries — only a compact summary', async () => {
    mockPatchRecipe.mockResolvedValue({
      slug: 'recipe-a',
      recipeIngredient: [{ note: 'flour' }],
      name: 'Some Recipe',
      description: 'A long description',
      nutrition: { calories: '100' },
    });

    const result = await updateRecipeIngredientsBatch([{ slug: 'recipe-a', ingredients: [{ note: 'flour' }] }]);

    expect(result.results[0]).toEqual({ slug: 'recipe-a', success: true, ingredientCount: 1 });
    expect(result.results[0]).not.toHaveProperty('name');
    expect(result.results[0]).not.toHaveProperty('nutrition');
  });
});

describe('updateRecipeIngredientsBatch — failure isolation', () => {
  it('recipe 2 fails with 404, recipes 1 and 3 stay successful', async () => {
    mockPatchRecipe.mockImplementation((slug: string, data: Record<string, unknown>) => {
      if (slug === 'recipe-2') {
        return Promise.reject(new MealieApiError(404, 'Not Found'));
      }
      return Promise.resolve({ slug, recipeIngredient: data.recipeIngredient });
    });

    const result = await updateRecipeIngredientsBatch([
      { slug: 'recipe-1', ingredients: [{ note: 'a' }] },
      { slug: 'recipe-2', ingredients: [{ note: 'b' }] },
      { slug: 'recipe-3', ingredients: [{ note: 'c' }] },
    ]);

    expect(result.succeededCount).toBe(2);
    expect(result.failedCount).toBe(1);
    expect(result.results[0]).toMatchObject({ slug: 'recipe-1', success: true });
    expect(result.results[2]).toMatchObject({ slug: 'recipe-3', success: true });
    const failed = result.results[1];
    expect(failed.success).toBe(false);
    if (!failed.success) {
      expect(failed.slug).toBe('recipe-2');
      expect(failed.error.status).toBe(404);
      expect(failed.error.message).toMatch(/404/);
    }
  });

  it('recipe 2 fails with 422, siblings still succeed', async () => {
    mockPatchRecipe.mockImplementation((slug: string, data: Record<string, unknown>) => {
      if (slug === 'recipe-2') {
        return Promise.reject(new MealieApiError(422, 'Unprocessable Entity'));
      }
      return Promise.resolve({ slug, recipeIngredient: data.recipeIngredient });
    });

    const result = await updateRecipeIngredientsBatch([
      { slug: 'recipe-1', ingredients: [{ note: 'a' }] },
      { slug: 'recipe-2', ingredients: [{ note: 'b' }] },
      { slug: 'recipe-3', ingredients: [{ note: 'c' }] },
    ]);

    expect(result.results.filter((r) => r.success)).toHaveLength(2);
    const failed = result.results.find((r) => r.slug === 'recipe-2');
    expect(failed?.success).toBe(false);
    if (failed && !failed.success) {
      expect(failed.error.status).toBe(422);
    }
  });

  it('recipe 2 fails with 502 (transient upstream failure), siblings still succeed', async () => {
    mockPatchRecipe.mockImplementation((slug: string, data: Record<string, unknown>) => {
      if (slug === 'recipe-2') {
        return Promise.reject(new MealieApiError(502, 'Bad Gateway'));
      }
      return Promise.resolve({ slug, recipeIngredient: data.recipeIngredient });
    });

    const result = await updateRecipeIngredientsBatch([
      { slug: 'recipe-1', ingredients: [{ note: 'a' }] },
      { slug: 'recipe-2', ingredients: [{ note: 'b' }] },
      { slug: 'recipe-3', ingredients: [{ note: 'c' }] },
    ]);

    expect(result.results.filter((r) => r.success).map((r) => r.slug)).toEqual(['recipe-1', 'recipe-3']);
    const failed = result.results.find((r) => r.slug === 'recipe-2');
    expect(failed?.success).toBe(false);
    if (failed && !failed.success) {
      expect(failed.error.status).toBe(502);
      expect(failed.error.message).toMatch(/Bad Gateway/);
    }
  });

  it('a local validation error (mismatched foodId/foodName) on one recipe is isolated, not a batch-wide failure', async () => {
    const result = await updateRecipeIngredientsBatch([
      { slug: 'recipe-1', ingredients: [{ note: 'a' }] },
      { slug: 'recipe-2', ingredients: [{ foodId: 'food-1' }] },
      { slug: 'recipe-3', ingredients: [{ note: 'c' }] },
    ]);

    expect(result.succeededCount).toBe(2);
    expect(result.failedCount).toBe(1);
    const failed = result.results.find((r) => r.slug === 'recipe-2');
    expect(failed?.success).toBe(false);
    if (failed && !failed.success) {
      expect(failed.error.message).toMatch(/foodName/);
    }
  });

  it('one failed item does not roll back or prevent previously/subsequently successful writes', async () => {
    mockPatchRecipe.mockImplementation((slug: string, data: Record<string, unknown>) => {
      if (slug === 'recipe-2') {
        return Promise.reject(new MealieApiError(502, 'Bad Gateway'));
      }
      return Promise.resolve({ slug, recipeIngredient: data.recipeIngredient });
    });

    await updateRecipeIngredientsBatch([
      { slug: 'recipe-1', ingredients: [{ note: 'a' }] },
      { slug: 'recipe-2', ingredients: [{ note: 'b' }] },
      { slug: 'recipe-3', ingredients: [{ note: 'c' }] },
    ]);

    expect(mockPatchRecipe).toHaveBeenCalledWith('recipe-1', expect.anything());
    expect(mockPatchRecipe).toHaveBeenCalledWith('recipe-3', expect.anything());
  });
});

describe('updateRecipeIngredientsBatch — verification isolation across recipes', () => {
  it('recipe A valid, recipe B fails verification and rolls back, recipe C still succeeds, order preserved', async () => {
    mockGetRecipe.mockImplementation((slug: string) =>
      Promise.resolve({ slug, recipeIngredient: [{ note: `${slug} original` }] }),
    );
    mockPatchRecipe.mockImplementation((slug: string, data: Record<string, unknown>) => {
      if (slug === 'recipe-b') {
        // First call for B is the write (returns a dropped food association); second is the rollback.
        const isRollback = (data.recipeIngredient as unknown[])[0] &&
          (data.recipeIngredient as Record<string, unknown>[])[0].note === 'recipe-b original';
        if (isRollback) return Promise.resolve(data);
        return Promise.resolve({ recipeIngredient: [{ food: null }] });
      }
      return Promise.resolve(data);
    });

    const result = await updateRecipeIngredientsBatch([
      { slug: 'recipe-a', ingredients: [{ note: 'a' }] },
      { slug: 'recipe-b', ingredients: [{ foodId: 'food-x', foodName: 'cilantro' }] },
      { slug: 'recipe-c', ingredients: [{ note: 'c' }] },
    ]);

    expect(result.results.map((r) => r.slug)).toEqual(['recipe-a', 'recipe-b', 'recipe-c']);
    expect(result.results[0]).toMatchObject({ slug: 'recipe-a', success: true });
    expect(result.results[2]).toMatchObject({ slug: 'recipe-c', success: true });

    const failedB = result.results[1];
    expect(failedB.success).toBe(false);
    if (!failedB.success) {
      expect(failedB.error.rollbackSucceeded).toBe(true);
      expect(failedB.error.message).toMatch(/no food association/);
    }
    expect(result.succeededCount).toBe(2);
    expect(result.failedCount).toBe(1);

    // Recipe B: 1 GET + 1 write PATCH + 1 rollback PATCH = 3 requests.
    const recipeBCalls = mockPatchRecipe.mock.calls.filter((c) => c[0] === 'recipe-b');
    expect(recipeBCalls).toHaveLength(2);
  });

  it('reports the more severe rollback-failed state for recipe B while A/C remain unaffected', async () => {
    mockGetRecipe.mockImplementation((slug: string) =>
      Promise.resolve({ slug, recipeIngredient: [{ note: `${slug} original` }] }),
    );
    mockPatchRecipe.mockImplementation((slug: string, data: Record<string, unknown>) => {
      if (slug === 'recipe-b') {
        const isRollbackAttempt = (data.recipeIngredient as Record<string, unknown>[])[0]?.note === 'recipe-b original';
        if (isRollbackAttempt) return Promise.reject(new Error('Mealie API error 500: Internal Server Error'));
        return Promise.resolve({ recipeIngredient: [{ food: null }] });
      }
      return Promise.resolve(data);
    });

    const result = await updateRecipeIngredientsBatch([
      { slug: 'recipe-a', ingredients: [{ note: 'a' }] },
      { slug: 'recipe-b', ingredients: [{ foodId: 'food-x', foodName: 'cilantro' }] },
      { slug: 'recipe-c', ingredients: [{ note: 'c' }] },
    ]);

    expect(result.results[0]).toMatchObject({ slug: 'recipe-a', success: true });
    expect(result.results[2]).toMatchObject({ slug: 'recipe-c', success: true });

    const failedB = result.results[1];
    expect(failedB.success).toBe(false);
    if (!failedB.success) {
      expect(failedB.error.rollbackSucceeded).toBe(false);
      expect(failedB.error.rollbackError).toMatch(/500/);
      expect(failedB.error.message).toMatch(/manual inspection/i);
    }
  });

  it('recipe B\'s rollback preserves its requested referenceIds (not a drifted snapshot value) while A/C are unaffected and order/counts stay correct', async () => {
    mockGetRecipe.mockImplementation((slug: string) => {
      if (slug === 'recipe-b') {
        return Promise.resolve({
          slug,
          recipeIngredient: [
            {
              food: { id: 'pepper-food', name: 'black pepper' },
              unit: null,
              note: 'black pepper',
              referenceId: 'ref-pepper-SNAPSHOT-DRIFTED',
            },
          ],
        });
      }
      return Promise.resolve({ slug, recipeIngredient: [{ note: `${slug} original` }] });
    });

    let recipeBCallCount = 0;
    mockPatchRecipe.mockImplementation((slug: string, data: Record<string, unknown>) => {
      if (slug === 'recipe-b') {
        recipeBCallCount += 1;
        if (recipeBCallCount === 1) {
          // The write itself drops the requested unit association, triggering verification failure.
          return Promise.resolve({ recipeIngredient: [{ food: { id: 'pepper-food', name: 'black pepper' }, unit: null }] });
        }
        return Promise.resolve(data); // rollback
      }
      return Promise.resolve(data);
    });

    const result = await updateRecipeIngredientsBatch([
      { slug: 'recipe-a', ingredients: [{ note: 'a' }] },
      {
        slug: 'recipe-b',
        ingredients: [
          {
            foodId: 'pepper-food',
            foodName: 'black pepper',
            unitId: '11111111-1111-4111-8111-111111111111',
            unitName: 'cup',
            note: 'black pepper',
            referenceId: 'ref-pepper-original',
          },
        ],
      },
      { slug: 'recipe-c', ingredients: [{ note: 'c' }] },
    ]);

    expect(result.requestedCount).toBe(3);
    expect(result.succeededCount).toBe(2);
    expect(result.failedCount).toBe(1);
    expect(result.results.map((r) => r.slug)).toEqual(['recipe-a', 'recipe-b', 'recipe-c']);
    expect(result.results[0]).toMatchObject({ slug: 'recipe-a', success: true });
    expect(result.results[2]).toMatchObject({ slug: 'recipe-c', success: true });

    const failedB = result.results[1];
    expect(failedB.success).toBe(false);
    if (!failedB.success) {
      expect(failedB.error.rollbackSucceeded).toBe(true);
    }

    const recipeBCalls = mockPatchRecipe.mock.calls.filter((c) => c[0] === 'recipe-b');
    expect(recipeBCalls).toHaveLength(2);
    const [, rollbackPayload] = recipeBCalls[1];
    const rollbackIngredients = rollbackPayload.recipeIngredient as Record<string, unknown>[];
    expect(rollbackIngredients[0].referenceId).toBe('ref-pepper-original');
  });
});

describe('updateRecipeIngredientsBatch — validation', () => {
  it('rejects an empty batch', async () => {
    await expect(updateRecipeIngredientsBatch([])).rejects.toThrow(RecipeIngredientsBatchValidationError);
    expect(mockPatchRecipe).not.toHaveBeenCalled();
  });

  it('rejects a batch larger than the maximum size', async () => {
    const updates = Array.from({ length: RECIPE_INGREDIENTS_BATCH_MAX_SIZE + 1 }, (_, i) => ({
      slug: `recipe-${i}`,
      ingredients: [],
    }));

    await expect(updateRecipeIngredientsBatch(updates)).rejects.toThrow(RecipeIngredientsBatchValidationError);
    expect(mockPatchRecipe).not.toHaveBeenCalled();
  });

  it('accepts a batch at exactly the maximum size', async () => {
    const updates = Array.from({ length: RECIPE_INGREDIENTS_BATCH_MAX_SIZE }, (_, i) => ({
      slug: `recipe-${i}`,
      ingredients: [],
    }));
    mockPatchRecipe.mockImplementation((slug: string) => Promise.resolve({ slug, recipeIngredient: [] }));

    const result = await updateRecipeIngredientsBatch(updates);
    expect(result.requestedCount).toBe(RECIPE_INGREDIENTS_BATCH_MAX_SIZE);
    expect(result.succeededCount).toBe(RECIPE_INGREDIENTS_BATCH_MAX_SIZE);
  });

  it('rejects duplicate recipe slugs in the same batch', async () => {
    await expect(
      updateRecipeIngredientsBatch([
        { slug: 'recipe-a', ingredients: [{ note: 'a' }] },
        { slug: 'recipe-a', ingredients: [{ note: 'b' }] },
      ]),
    ).rejects.toThrow(RecipeIngredientsBatchValidationError);
    expect(mockPatchRecipe).not.toHaveBeenCalled();
  });

  it('rejects a missing/blank recipe identifier', async () => {
    await expect(
      updateRecipeIngredientsBatch([{ slug: '', ingredients: [{ note: 'a' }] }]),
    ).rejects.toThrow(RecipeIngredientsBatchValidationError);
    expect(mockPatchRecipe).not.toHaveBeenCalled();
  });

  it('validates the whole batch before starting any write', async () => {
    await expect(
      updateRecipeIngredientsBatch([
        { slug: 'recipe-a', ingredients: [{ note: 'a' }] },
        { slug: 'recipe-a', ingredients: [{ note: 'b' }] },
      ]),
    ).rejects.toThrow();
    expect(mockPatchRecipe).not.toHaveBeenCalled();
  });
});

describe('updateRecipeIngredientsBatch — concurrency', () => {
  it('bounds concurrency instead of firing every request at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    mockPatchRecipe.mockImplementation((slug: string) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => {
        setTimeout(() => {
          inFlight--;
          resolve({ slug, recipeIngredient: [] });
        }, 5);
      });
    });

    const updates = Array.from({ length: 12 }, (_, i) => ({ slug: `recipe-${i}`, ingredients: [{ note: 'x' }] }));
    await updateRecipeIngredientsBatch(updates);

    expect(maxInFlight).toBeLessThanOrEqual(5);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it('preserves input order in results regardless of completion order', async () => {
    mockPatchRecipe.mockImplementation((slug: string) => {
      // Reverse the delay so later-submitted recipes resolve first.
      const index = Number(slug.split('-')[1]);
      const delay = (5 - index) * 5;
      return new Promise((resolve) => {
        setTimeout(() => resolve({ slug, recipeIngredient: [] }), delay);
      });
    });

    const updates = Array.from({ length: 5 }, (_, i) => ({ slug: `recipe-${i}`, ingredients: [{ note: 'x' }] }));
    const result = await updateRecipeIngredientsBatch(updates);

    expect(result.results.map((r) => r.slug)).toEqual(['recipe-0', 'recipe-1', 'recipe-2', 'recipe-3', 'recipe-4']);
  });
});

describe('updateRecipeIngredientsBatch — basic behavior', () => {
  it('updates two recipes successfully, preserving input order and reporting counts', async () => {
    const result = await updateRecipeIngredientsBatch([
      { slug: 'recipe-a', ingredients: [{ note: 'flour' }, { note: 'sugar' }] },
      { slug: 'recipe-b', ingredients: [{ note: 'butter' }] },
    ]);

    expect(result.requestedCount).toBe(2);
    expect(result.succeededCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(result.apiRequestCount).toBe(4);
    expect(result.results.map((r) => r.slug)).toEqual(['recipe-a', 'recipe-b']);
    expect(result.results[0]).toEqual({ slug: 'recipe-a', success: true, ingredientCount: 2 });
    expect(result.results[1]).toEqual({ slug: 'recipe-b', success: true, ingredientCount: 1 });
    expect(mockPatchRecipe).toHaveBeenCalledTimes(2);
  });

  it('sends only recipeIngredient for each recipe, leaving other fields untouched', async () => {
    await updateRecipeIngredientsBatch([
      { slug: 'recipe-a', ingredients: [{ note: 'flour' }] },
      { slug: 'recipe-b', ingredients: [{ note: 'butter' }] },
    ]);

    for (const [, payload] of mockPatchRecipe.mock.calls) {
      expect(Object.keys(payload)).toEqual(['recipeIngredient']);
    }
  });

  it('preserves supplied referenceId values exactly, same as the singular tool', async () => {
    await updateRecipeIngredientsBatch([
      { slug: 'recipe-a', ingredients: [{ note: 'flour', referenceId: 'ref-1' }] },
    ]);

    const [, payload] = mockPatchRecipe.mock.calls[0];
    const ingredients = payload.recipeIngredient as Record<string, unknown>[];
    expect(ingredients[0].referenceId).toBe('ref-1');
  });

  it('does not touch unrelated instruction/category/tag fields (payload is recipeIngredient only)', async () => {
    await updateRecipeIngredientsBatch([{ slug: 'recipe-a', ingredients: [{ note: 'flour' }] }]);
    const [, payload] = mockPatchRecipe.mock.calls[0];
    expect(payload).not.toHaveProperty('recipeInstructions');
    expect(payload).not.toHaveProperty('recipeCategory');
    expect(payload).not.toHaveProperty('tags');
  });

  it('does not return full recipe payloads for successful entries — only a compact summary', async () => {
    mockPatchRecipe.mockResolvedValue({
      slug: 'recipe-a',
      recipeIngredient: [{ note: 'flour' }],
      name: 'Some Recipe',
      description: 'A long description',
      nutrition: { calories: '100' },
    });

    const result = await updateRecipeIngredientsBatch([{ slug: 'recipe-a', ingredients: [{ note: 'flour' }] }]);

    expect(result.results[0]).toEqual({ slug: 'recipe-a', success: true, ingredientCount: 1 });
    expect(result.results[0]).not.toHaveProperty('name');
    expect(result.results[0]).not.toHaveProperty('nutrition');
  });
});

describe('updateRecipeIngredientsBatch — failure isolation', () => {
  it('recipe 2 fails with 404, recipes 1 and 3 stay successful', async () => {
    mockPatchRecipe.mockImplementation((slug: string) => {
      if (slug === 'recipe-2') {
        return Promise.reject(new MealieApiError(404, 'Not Found'));
      }
      return Promise.resolve({ slug, recipeIngredient: [{ note: 'persisted' }] });
    });

    const result = await updateRecipeIngredientsBatch([
      { slug: 'recipe-1', ingredients: [{ note: 'a' }] },
      { slug: 'recipe-2', ingredients: [{ note: 'b' }] },
      { slug: 'recipe-3', ingredients: [{ note: 'c' }] },
    ]);

    expect(result.succeededCount).toBe(2);
    expect(result.failedCount).toBe(1);
    expect(result.results[0]).toMatchObject({ slug: 'recipe-1', success: true });
    expect(result.results[2]).toMatchObject({ slug: 'recipe-3', success: true });
    const failed = result.results[1];
    expect(failed.success).toBe(false);
    if (!failed.success) {
      expect(failed.slug).toBe('recipe-2');
      expect(failed.error.status).toBe(404);
      expect(failed.error.message).toMatch(/404/);
    }
  });

  it('recipe 2 fails with 422, siblings still succeed', async () => {
    mockPatchRecipe.mockImplementation((slug: string) => {
      if (slug === 'recipe-2') {
        return Promise.reject(new MealieApiError(422, 'Unprocessable Entity'));
      }
      return Promise.resolve({ slug, recipeIngredient: [{ note: 'persisted' }] });
    });

    const result = await updateRecipeIngredientsBatch([
      { slug: 'recipe-1', ingredients: [{ note: 'a' }] },
      { slug: 'recipe-2', ingredients: [{ note: 'b' }] },
      { slug: 'recipe-3', ingredients: [{ note: 'c' }] },
    ]);

    expect(result.results.filter((r) => r.success)).toHaveLength(2);
    const failed = result.results.find((r) => r.slug === 'recipe-2');
    expect(failed?.success).toBe(false);
    if (failed && !failed.success) {
      expect(failed.error.status).toBe(422);
    }
  });

  it('recipe 2 fails with 502 (transient upstream failure), siblings still succeed', async () => {
    mockPatchRecipe.mockImplementation((slug: string) => {
      if (slug === 'recipe-2') {
        return Promise.reject(new MealieApiError(502, 'Bad Gateway'));
      }
      return Promise.resolve({ slug, recipeIngredient: [{ note: 'persisted' }] });
    });

    const result = await updateRecipeIngredientsBatch([
      { slug: 'recipe-1', ingredients: [{ note: 'a' }] },
      { slug: 'recipe-2', ingredients: [{ note: 'b' }] },
      { slug: 'recipe-3', ingredients: [{ note: 'c' }] },
    ]);

    expect(result.results.filter((r) => r.success).map((r) => r.slug)).toEqual(['recipe-1', 'recipe-3']);
    const failed = result.results.find((r) => r.slug === 'recipe-2');
    expect(failed?.success).toBe(false);
    if (failed && !failed.success) {
      expect(failed.error.status).toBe(502);
      expect(failed.error.message).toMatch(/Bad Gateway/);
    }
  });

  it('a local validation error (mismatched foodId/foodName) on one recipe is isolated, not a batch-wide failure', async () => {
    const result = await updateRecipeIngredientsBatch([
      { slug: 'recipe-1', ingredients: [{ note: 'a' }] },
      { slug: 'recipe-2', ingredients: [{ foodId: 'food-1' }] },
      { slug: 'recipe-3', ingredients: [{ note: 'c' }] },
    ]);

    expect(result.succeededCount).toBe(2);
    expect(result.failedCount).toBe(1);
    const failed = result.results.find((r) => r.slug === 'recipe-2');
    expect(failed?.success).toBe(false);
    if (failed && !failed.success) {
      expect(failed.error.message).toMatch(/foodName/);
    }
  });

  it('one failed item does not roll back or prevent previously/subsequently successful writes', async () => {
    mockPatchRecipe.mockImplementation((slug: string) => {
      if (slug === 'recipe-2') {
        return Promise.reject(new MealieApiError(502, 'Bad Gateway'));
      }
      return Promise.resolve({ slug, recipeIngredient: [{ note: 'persisted' }] });
    });

    await updateRecipeIngredientsBatch([
      { slug: 'recipe-1', ingredients: [{ note: 'a' }] },
      { slug: 'recipe-2', ingredients: [{ note: 'b' }] },
      { slug: 'recipe-3', ingredients: [{ note: 'c' }] },
    ]);

    expect(mockPatchRecipe).toHaveBeenCalledWith('recipe-1', expect.anything());
    expect(mockPatchRecipe).toHaveBeenCalledWith('recipe-3', expect.anything());
  });
});

describe('updateRecipeIngredientsBatch — validation', () => {
  it('rejects an empty batch', async () => {
    await expect(updateRecipeIngredientsBatch([])).rejects.toThrow(RecipeIngredientsBatchValidationError);
    expect(mockPatchRecipe).not.toHaveBeenCalled();
  });

  it('rejects a batch larger than the maximum size', async () => {
    const updates = Array.from({ length: RECIPE_INGREDIENTS_BATCH_MAX_SIZE + 1 }, (_, i) => ({
      slug: `recipe-${i}`,
      ingredients: [],
    }));

    await expect(updateRecipeIngredientsBatch(updates)).rejects.toThrow(RecipeIngredientsBatchValidationError);
    expect(mockPatchRecipe).not.toHaveBeenCalled();
  });

  it('accepts a batch at exactly the maximum size', async () => {
    const updates = Array.from({ length: RECIPE_INGREDIENTS_BATCH_MAX_SIZE }, (_, i) => ({
      slug: `recipe-${i}`,
      ingredients: [],
    }));

    const result = await updateRecipeIngredientsBatch(updates);
    expect(result.requestedCount).toBe(RECIPE_INGREDIENTS_BATCH_MAX_SIZE);
    expect(result.succeededCount).toBe(RECIPE_INGREDIENTS_BATCH_MAX_SIZE);
  });

  it('rejects duplicate recipe slugs in the same batch', async () => {
    await expect(
      updateRecipeIngredientsBatch([
        { slug: 'recipe-a', ingredients: [{ note: 'a' }] },
        { slug: 'recipe-a', ingredients: [{ note: 'b' }] },
      ]),
    ).rejects.toThrow(RecipeIngredientsBatchValidationError);
    expect(mockPatchRecipe).not.toHaveBeenCalled();
  });

  it('rejects a missing/blank recipe identifier', async () => {
    await expect(
      updateRecipeIngredientsBatch([{ slug: '', ingredients: [{ note: 'a' }] }]),
    ).rejects.toThrow(RecipeIngredientsBatchValidationError);
    expect(mockPatchRecipe).not.toHaveBeenCalled();
  });

  it('validates the whole batch before starting any write', async () => {
    await expect(
      updateRecipeIngredientsBatch([
        { slug: 'recipe-a', ingredients: [{ note: 'a' }] },
        { slug: 'recipe-a', ingredients: [{ note: 'b' }] },
      ]),
    ).rejects.toThrow();
    expect(mockPatchRecipe).not.toHaveBeenCalled();
  });
});

describe('updateRecipeIngredientsBatch — concurrency', () => {
  it('bounds concurrency instead of firing every request at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    mockPatchRecipe.mockImplementation((slug: string) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => {
        setTimeout(() => {
          inFlight--;
          resolve({ slug, recipeIngredient: [] });
        }, 5);
      });
    });

    const updates = Array.from({ length: 12 }, (_, i) => ({ slug: `recipe-${i}`, ingredients: [{ note: 'x' }] }));
    await updateRecipeIngredientsBatch(updates);

    expect(maxInFlight).toBeLessThanOrEqual(5);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it('preserves input order in results regardless of completion order', async () => {
    mockPatchRecipe.mockImplementation((slug: string) => {
      // Reverse the delay so later-submitted recipes resolve first.
      const index = Number(slug.split('-')[1]);
      const delay = (5 - index) * 5;
      return new Promise((resolve) => {
        setTimeout(() => resolve({ slug, recipeIngredient: [] }), delay);
      });
    });

    const updates = Array.from({ length: 5 }, (_, i) => ({ slug: `recipe-${i}`, ingredients: [{ note: 'x' }] }));
    const result = await updateRecipeIngredientsBatch(updates);

    expect(result.results.map((r) => r.slug)).toEqual(['recipe-0', 'recipe-1', 'recipe-2', 'recipe-3', 'recipe-4']);
  });
});
