import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/recipes.js', () => ({
  getRecipe: vi.fn(),
  updateRecipe: vi.fn(),
}));

import * as recipesApi from '../api/recipes.js';
import { updateRecipeIngredients } from '../lib/recipe-ingredients.js';

const mockGetRecipe = vi.mocked(recipesApi.getRecipe);
const mockUpdateRecipe = vi.mocked(recipesApi.updateRecipe);

function baseRecipe(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'recipe-id-1',
    slug: 'chicken-shawarma',
    name: 'Chicken Shawarma',
    description: 'A tasty dish',
    recipeYield: '4 servings',
    recipeServings: 4,
    totalTime: '30 minutes',
    prepTime: '10 minutes',
    cookTime: '20 minutes',
    recipeIngredient: [
      { referenceId: 'orig-ref-1', quantity: 1, unit: null, food: null, note: 'old ingredient one', display: '', title: null, originalText: null },
      { referenceId: 'orig-ref-2', quantity: 2, unit: null, food: null, note: 'old ingredient two', display: '', title: null, originalText: null },
      { referenceId: 'orig-ref-3', quantity: 3, unit: null, food: null, note: 'old ingredient three', display: '', title: null, originalText: null },
    ],
    recipeInstructions: [{ id: 'step-1', text: 'Marinate the chicken' }, { id: 'step-2', text: 'Grill until done' }],
    nutrition: { calories: '450' },
    settings: { public: true, disableComments: false },
    image: 'chicken-shawarma.jpg',
    notes: [{ title: 'Tip', text: 'Use fresh garlic' }],
    tools: [{ id: 'tool-1', name: 'Grill', slug: 'grill' }],
    rating: 4.5,
    assets: [{ name: 'photo.jpg' }],
    orgURL: 'https://example.com/original',
    recipeCategory: [{ id: 'cat-1', name: 'Dinner', slug: 'dinner' }],
    tags: [{ id: 'tag-1', name: 'Quick', slug: 'quick' }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateRecipe.mockImplementation((_slug: string, data: Record<string, unknown>) => Promise.resolve(data));
});

describe('updateRecipeIngredients — replacing structured ingredients', () => {
  it('replaces ingredients with structured food/unit associations, preserving all sub-fields', async () => {
    mockGetRecipe.mockResolvedValue(baseRecipe());

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

    expect(mockUpdateRecipe).toHaveBeenCalledTimes(1);
    const [slugArg, payload] = mockUpdateRecipe.mock.calls[0];
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

describe('updateRecipeIngredients — preserves unrelated recipe fields', () => {
  it('leaves every non-ingredient field exactly as fetched', async () => {
    const recipe = baseRecipe();
    mockGetRecipe.mockResolvedValue(recipe);

    await updateRecipeIngredients('chicken-shawarma', [{ note: 'new single ingredient' }]);

    const [, payload] = mockUpdateRecipe.mock.calls[0];
    expect(payload.name).toBe(recipe.name);
    expect(payload.description).toBe(recipe.description);
    expect(payload.recipeInstructions).toEqual(recipe.recipeInstructions);
    expect(payload.recipeCategory).toEqual(recipe.recipeCategory);
    expect(payload.tags).toEqual(recipe.tags);
    expect(payload.recipeServings).toBe(recipe.recipeServings);
    expect(payload.prepTime).toBe(recipe.prepTime);
    expect(payload.cookTime).toBe(recipe.cookTime);
    expect(payload.totalTime).toBe(recipe.totalTime);
    expect(payload.nutrition).toEqual(recipe.nutrition);
    expect(payload.notes).toEqual(recipe.notes);
    expect(payload.settings).toEqual(recipe.settings);
    expect(payload.image).toBe(recipe.image);
    expect(payload.tools).toEqual(recipe.tools);
    expect(payload.rating).toBe(recipe.rating);
    expect(payload.assets).toEqual(recipe.assets);
  });
});

describe('updateRecipeIngredients — replaces rather than appends', () => {
  it('drops all previous ingredients when a smaller complete list is supplied', async () => {
    mockGetRecipe.mockResolvedValue(baseRecipe());

    await updateRecipeIngredients('chicken-shawarma', [{ note: 'new ingredient A' }, { note: 'new ingredient B' }]);

    const [, payload] = mockUpdateRecipe.mock.calls[0];
    const ingredients = payload.recipeIngredient as Record<string, unknown>[];
    expect(ingredients).toHaveLength(2);
    expect(ingredients.map((i) => i.note)).toEqual(['new ingredient A', 'new ingredient B']);
    expect(ingredients.some((i) => i.note === 'old ingredient one')).toBe(false);
    expect(ingredients.some((i) => i.note === 'old ingredient two')).toBe(false);
    expect(ingredients.some((i) => i.note === 'old ingredient three')).toBe(false);
  });
});

describe('updateRecipeIngredients — preserves false/zero values', () => {
  it('does not drop an explicit quantity of 0', async () => {
    mockGetRecipe.mockResolvedValue(baseRecipe());
    await updateRecipeIngredients('chicken-shawarma', [{ quantity: 0, note: 'a pinch' }]);
    const [, payload] = mockUpdateRecipe.mock.calls[0];
    const ingredients = payload.recipeIngredient as Record<string, unknown>[];
    expect(ingredients[0].quantity).toBe(0);
  });

  it('does not drop an explicit empty-string note or display', async () => {
    mockGetRecipe.mockResolvedValue(baseRecipe());
    await updateRecipeIngredients('chicken-shawarma', [{ note: '', display: '' }]);
    const [, payload] = mockUpdateRecipe.mock.calls[0];
    const ingredients = payload.recipeIngredient as Record<string, unknown>[];
    expect(ingredients[0].note).toBe('');
    expect(ingredients[0].display).toBe('');
  });
});

describe('updateRecipeIngredients — null/optional fields', () => {
  it('sends null for note/title/originalText when explicitly requested', async () => {
    mockGetRecipe.mockResolvedValue(baseRecipe());
    await updateRecipeIngredients('chicken-shawarma', [{ note: null, title: null, originalText: null }]);
    const [, payload] = mockUpdateRecipe.mock.calls[0];
    const ingredients = payload.recipeIngredient as Record<string, unknown>[];
    expect(ingredients[0]).toMatchObject({ note: null, title: null, originalText: null });
  });

  it('omits quantity/note/display/title/originalText/referenceId entirely when not supplied', async () => {
    mockGetRecipe.mockResolvedValue(baseRecipe());
    await updateRecipeIngredients('chicken-shawarma', [{}]);
    const [, payload] = mockUpdateRecipe.mock.calls[0];
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
    mockGetRecipe.mockResolvedValue(baseRecipe());
    await updateRecipeIngredients('chicken-shawarma', [{ title: 'For the sauce' }]);
    const [, payload] = mockUpdateRecipe.mock.calls[0];
    const ingredients = payload.recipeIngredient as Record<string, unknown>[];
    expect(ingredients[0].title).toBe('For the sauce');
  });
});

describe('updateRecipeIngredients — alias/name independence', () => {
  it('keeps the food id distinct from its display name in the transformed payload', async () => {
    mockGetRecipe.mockResolvedValue(baseRecipe());
    await updateRecipeIngredients('chicken-shawarma', [{ foodId: 'food-abc', foodName: 'Green Onion' }]);
    const [, payload] = mockUpdateRecipe.mock.calls[0];
    const ingredients = payload.recipeIngredient as Record<string, unknown>[];
    expect(ingredients[0].food).toEqual({ id: 'food-abc', name: 'Green Onion' });
  });

  it('keeps the unit id distinct from its display name in the transformed payload', async () => {
    mockGetRecipe.mockResolvedValue(baseRecipe());
    await updateRecipeIngredients('chicken-shawarma', [{ unitId: 'unit-abc', unitName: 'Tablespoon' }]);
    const [, payload] = mockUpdateRecipe.mock.calls[0];
    const ingredients = payload.recipeIngredient as Record<string, unknown>[];
    expect(ingredients[0].unit).toEqual({ id: 'unit-abc', name: 'Tablespoon' });
  });

  it('rejects a foodId given without a foodName', async () => {
    mockGetRecipe.mockResolvedValue(baseRecipe());
    await expect(updateRecipeIngredients('chicken-shawarma', [{ foodId: 'food-abc' }])).rejects.toThrow(/foodName/);
    expect(mockUpdateRecipe).not.toHaveBeenCalled();
  });

  it('rejects a foodName given without a foodId', async () => {
    mockGetRecipe.mockResolvedValue(baseRecipe());
    await expect(updateRecipeIngredients('chicken-shawarma', [{ foodName: 'Onion' }])).rejects.toThrow(/foodId/);
    expect(mockUpdateRecipe).not.toHaveBeenCalled();
  });

  it('rejects a unitId given without a unitName', async () => {
    mockGetRecipe.mockResolvedValue(baseRecipe());
    await expect(updateRecipeIngredients('chicken-shawarma', [{ unitId: 'unit-abc' }])).rejects.toThrow(/unitName/);
    expect(mockUpdateRecipe).not.toHaveBeenCalled();
  });

  it('rejects a unitName given without a unitId', async () => {
    mockGetRecipe.mockResolvedValue(baseRecipe());
    await expect(updateRecipeIngredients('chicken-shawarma', [{ unitName: 'Tablespoon' }])).rejects.toThrow(/unitId/);
    expect(mockUpdateRecipe).not.toHaveBeenCalled();
  });

  it('validates ingredients before making any network call', async () => {
    await expect(updateRecipeIngredients('chicken-shawarma', [{ foodId: 'food-abc' }])).rejects.toThrow();
    expect(mockGetRecipe).not.toHaveBeenCalled();
  });
});

describe('updateRecipeIngredients — empty ingredient collection', () => {
  it('clears all ingredients when given an empty array, leaving other fields intact', async () => {
    const recipe = baseRecipe();
    mockGetRecipe.mockResolvedValue(recipe);

    await updateRecipeIngredients('chicken-shawarma', []);

    const [, payload] = mockUpdateRecipe.mock.calls[0];
    expect(payload.recipeIngredient).toEqual([]);
    expect(payload.name).toBe(recipe.name);
    expect(payload.recipeInstructions).toEqual(recipe.recipeInstructions);
  });
});

describe('updateRecipeIngredients — recipe not found', () => {
  it('propagates the same not-found error as other recipe tools', async () => {
    mockGetRecipe.mockRejectedValue(new Error('Mealie API error 404: Not Found'));
    await expect(updateRecipeIngredients('missing-recipe', [{ note: 'x' }])).rejects.toThrow(/404/);
    expect(mockUpdateRecipe).not.toHaveBeenCalled();
  });
});

describe('updateRecipeIngredients — Mealie API failure', () => {
  it('propagates an error from the update call without masquerading as success', async () => {
    mockGetRecipe.mockResolvedValue(baseRecipe());
    mockUpdateRecipe.mockRejectedValue(new Error('Mealie API error 500: Internal Server Error'));
    await expect(updateRecipeIngredients('chicken-shawarma', [{ note: 'x' }])).rejects.toThrow(/500/);
  });
});
