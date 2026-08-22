import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/recipes.js', () => ({
  getRecipes: vi.fn(),
  getRecipe: vi.fn(),
  getRecipesBatch: vi.fn(),
  createRecipe: vi.fn(),
  patchRecipe: vi.fn(),
  duplicateRecipe: vi.fn(),
  updateRecipeLastMade: vi.fn(),
  setRecipeImageFromUrl: vi.fn(),
  deleteRecipe: vi.fn(),
  updateRecipe: vi.fn(),
}));

import * as recipesApi from '../api/recipes.js';
import { DEFAULT_DETAIL_FETCH_CONCURRENCY } from '../lib/concurrency.js';
import {
  getRecipesForIngredientParsing,
  InvalidLimitError,
  InvalidStateError,
  InvalidCursorError,
  INGREDIENT_PARSING_DEFAULT_LIMIT,
  INGREDIENT_PARSING_MAX_LIMIT,
} from '../lib/recipe-ingredient-parsing.js';

const mockGetRecipes = vi.mocked(recipesApi.getRecipes);
const mockGetRecipe = vi.mocked(recipesApi.getRecipe);
const mockPatchRecipe = vi.mocked(recipesApi.patchRecipe);
const mockUpdateRecipe = vi.mocked(recipesApi.updateRecipe);
const mockCreateRecipe = vi.mocked(recipesApi.createRecipe);
const mockDeleteRecipe = vi.mocked(recipesApi.deleteRecipe);
const mockDuplicateRecipe = vi.mocked(recipesApi.duplicateRecipe);
const mockUpdateRecipeLastMade = vi.mocked(recipesApi.updateRecipeLastMade);
const mockSetRecipeImageFromUrl = vi.mocked(recipesApi.setRecipeImageFromUrl);

const UNIT_CUP = { id: 'u-cup', name: 'cup' };
const FOOD_FLOUR = { id: 'f-flour', name: 'flour' };
const FOOD_EGG = { id: 'f-egg', name: 'egg' };

function structuredIngredient(overrides: Record<string, unknown> = {}) {
  return {
    referenceId: 'ref-structured',
    quantity: 2,
    unit: UNIT_CUP,
    food: FOOD_FLOUR,
    note: 'sifted',
    display: '2 cups flour sifted',
    originalText: null,
    title: null,
    ...overrides,
  };
}

// Mirrors a real Mealie import: raw text dumped into note/display, quantity 0, no unit/food.
function unparsedIngredient(overrides: Record<string, unknown> = {}) {
  return {
    referenceId: 'ref-unparsed',
    quantity: 0,
    unit: null,
    food: null,
    note: '1 tablespoon cornstarch',
    display: '1 tablespoon cornstarch',
    originalText: null,
    title: null,
    ...overrides,
  };
}

// Food resolved, no unit, positive quantity — matches "4 eggs" observed on a live instance.
function partialIngredient(overrides: Record<string, unknown> = {}) {
  return {
    referenceId: 'ref-partial',
    quantity: 4,
    unit: null,
    food: FOOD_EGG,
    note: '',
    display: '4 eggs',
    originalText: null,
    title: null,
    ...overrides,
  };
}

function sectionIngredient(overrides: Record<string, unknown> = {}) {
  return {
    referenceId: 'ref-section',
    quantity: 0,
    unit: null,
    food: null,
    note: '',
    display: '',
    originalText: null,
    title: 'For the sauce',
    ...overrides,
  };
}

function summary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'id-default',
    slug: 'slug-default',
    name: 'Recipe',
    createdAt: '2024-01-01T00:00:00.000000',
    ...overrides,
  };
}

function detail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'id-default',
    slug: 'slug-default',
    name: 'Recipe',
    description: 'A tasty recipe',
    totalTime: '30 minutes',
    prepTime: '10 minutes',
    cookTime: '20 minutes',
    recipeServings: 4,
    recipeYield: '4 servings',
    recipeCategory: [],
    tags: [],
    recipeIngredient: [structuredIngredient()],
    recipeInstructions: [{ id: 'instr-1', title: '', text: 'Mix well', ingredientReferences: [] }],
    nutrition: { calories: '200' },
    settings: { public: true },
    assets: [{ name: 'photo.jpg' }],
    comments: [{ id: 'c-1', text: 'nice' }],
    ...overrides,
  };
}

function setupServer(items: Record<string, unknown>[], detailsBySlug: Record<string, Record<string, unknown>>) {
  mockGetRecipes.mockImplementation((params) => {
    const page = params?.page ?? 1;
    const perPage = params?.perPage ?? 50;
    const start = (page - 1) * perPage;
    const pageItems = items.slice(start, start + perPage);
    return Promise.resolve({ items: pageItems, total: items.length, page, size: pageItems.length });
  });
  mockGetRecipe.mockImplementation((slug: string) => {
    const found = detailsBySlug[slug];
    if (!found) return Promise.reject(new Error(`Recipe not found: ${slug}`));
    return Promise.resolve(found);
  });
}

function recipe(i: number, ingredients: Record<string, unknown>[], instructions?: Record<string, unknown>[]) {
  const id = `id-${i}`;
  const slug = `recipe-${i}`;
  const createdAt = `2024-01-01T00:00:${String(i).padStart(2, '0')}.000000`;
  return {
    summary: summary({ id, slug, name: `Recipe ${i}`, createdAt }),
    detail: detail({
      id,
      slug,
      name: `Recipe ${i}`,
      recipeIngredient: ingredients,
      ...(instructions ? { recipeInstructions: instructions } : {}),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('state filtering', () => {
  it('defaults to unparsed_only', async () => {
    const r1 = recipe(1, [structuredIngredient(), unparsedIngredient()]); // has an unparsed line -> matches
    const r2 = recipe(2, [structuredIngredient()]); // fully structured -> no match
    setupServer([r1.summary, r2.summary], { [r1.detail.slug as string]: r1.detail, [r2.detail.slug as string]: r2.detail });

    const result = await getRecipesForIngredientParsing({});

    expect(result.items.map((i) => i.slug)).toEqual(['recipe-1']);
  });

  it('excludes a fully structured recipe from unparsed_only', async () => {
    const r1 = recipe(1, [structuredIngredient(), structuredIngredient({ referenceId: 'ref-2' })]);
    setupServer([r1.summary], { [r1.detail.slug as string]: r1.detail });

    const result = await getRecipesForIngredientParsing({ state: 'unparsed_only' });

    expect(result.items).toHaveLength(0);
  });

  it('any returns every scanned recipe regardless of parsing state', async () => {
    const r1 = recipe(1, [unparsedIngredient()]);
    const r2 = recipe(2, [structuredIngredient()]);
    setupServer([r1.summary, r2.summary], { [r1.detail.slug as string]: r1.detail, [r2.detail.slug as string]: r2.detail });

    const result = await getRecipesForIngredientParsing({ state: 'any' });

    expect(result.items.map((i) => i.slug)).toEqual(['recipe-1', 'recipe-2']);
  });

  it('partially_parsed returns a recipe with a food-but-no-unit ingredient', async () => {
    const r1 = recipe(1, [partialIngredient()]); // food present, unit absent, quantity > 0 -> partial
    const r2 = recipe(2, [structuredIngredient()]); // fully structured -> no match
    setupServer([r1.summary, r2.summary], { [r1.detail.slug as string]: r1.detail, [r2.detail.slug as string]: r2.detail });

    const result = await getRecipesForIngredientParsing({ state: 'partially_parsed' });

    expect(result.items.map((i) => i.slug)).toEqual(['recipe-1']);
  });

  it('partially_parsed excludes a recipe whose only unit-less ingredient is unparsed (food null), not partial', async () => {
    const r1 = recipe(1, [unparsedIngredient()]);
    setupServer([r1.summary], { [r1.detail.slug as string]: r1.detail });

    const result = await getRecipesForIngredientParsing({ state: 'partially_parsed' });

    expect(result.items).toHaveLength(0);
  });

  it('a section heading does not make an otherwise fully-parsed recipe look unparsed', async () => {
    const r1 = recipe(1, [sectionIngredient(), structuredIngredient(), structuredIngredient({ referenceId: 'ref-2' })]);
    setupServer([r1.summary], { [r1.detail.slug as string]: r1.detail });

    const result = await getRecipesForIngredientParsing({ state: 'unparsed_only' });

    expect(result.items).toHaveLength(0);
  });

  it('a section heading alongside a genuinely unparsed ingredient still surfaces the recipe', async () => {
    const r1 = recipe(1, [sectionIngredient(), unparsedIngredient()]);
    setupServer([r1.summary], { [r1.detail.slug as string]: r1.detail });

    const result = await getRecipesForIngredientParsing({});

    expect(result.items).toHaveLength(1);
  });

  it('returns an empty page (not an error) when no recipe matches the requested state', async () => {
    const r1 = recipe(1, [structuredIngredient()]);
    const r2 = recipe(2, [structuredIngredient()]);
    setupServer([r1.summary, r2.summary], { [r1.detail.slug as string]: r1.detail, [r2.detail.slug as string]: r2.detail });

    const result = await getRecipesForIngredientParsing({ state: 'unparsed_only' });

    expect(result.items).toEqual([]);
    expect(result.failures).toEqual([]);
    expect(result.scannedCount).toBe(2);
    expect(result.returnedCount).toBe(0);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('returns only the matching recipes from a mix of matching and non-matching recipes, in scan order', async () => {
    const r1 = recipe(1, [unparsedIngredient()]); // match
    const r2 = recipe(2, [structuredIngredient()]); // no match
    const r3 = recipe(3, [unparsedIngredient()]); // match
    const r4 = recipe(4, [structuredIngredient(), partialIngredient()]); // no match under unparsed_only
    const r5 = recipe(5, [unparsedIngredient()]); // match
    const all = [r1, r2, r3, r4, r5];
    setupServer(
      all.map((r) => r.summary),
      Object.fromEntries(all.map((r) => [r.detail.slug as string, r.detail])),
    );

    const result = await getRecipesForIngredientParsing({ state: 'unparsed_only' });

    expect(result.items.map((i) => i.slug)).toEqual(['recipe-1', 'recipe-3', 'recipe-5']);
    expect(result.scannedCount).toBe(5);
  });
});

describe('legacy ingredient fidelity', () => {
  it('exposes the stored note/display verbatim and does not fabricate originalText for a legacy unparsed row', async () => {
    // Real-world shape: an older import stored the raw ingredient line in note/display and never
    // populated originalText — the tool must report exactly what's stored, not invent provenance.
    const r1 = recipe(1, [
      {
        referenceId: 'ref-legacy',
        quantity: 0,
        unit: null,
        food: null,
        note: '2 tablespoons chopped parsley',
        display: '2 tablespoons chopped parsley',
        originalText: null,
        title: null,
      },
    ]);
    setupServer([r1.summary], { [r1.detail.slug as string]: r1.detail });

    const result = await getRecipesForIngredientParsing({});
    const ing = result.items[0].ingredients[0];

    expect(ing.note).toBe('2 tablespoons chopped parsley');
    expect(ing.display).toBe('2 tablespoons chopped parsley');
    expect(ing.originalText).toBeNull();
    expect(ing.parsingState).toBe('unparsed');
  });
});

describe('per-ingredient parsingState classification', () => {
  it('classifies section/unparsed/partial/structured correctly and reports counts', async () => {
    const r1 = recipe(1, [sectionIngredient(), unparsedIngredient(), partialIngredient(), structuredIngredient()]);
    setupServer([r1.summary], { [r1.detail.slug as string]: r1.detail });

    const result = await getRecipesForIngredientParsing({ state: 'any' });

    const states = result.items[0].ingredients.map((i) => i.parsingState);
    expect(states).toEqual(['section', 'unparsed', 'partial', 'structured']);
    expect(result.items[0].ingredientParsingState).toEqual({
      totalCount: 4,
      sectionCount: 1,
      unparsedCount: 1,
      partialCount: 1,
      structuredCount: 1,
    });
  });

  it('treats a food with a unit as structured even with a positive quantity', async () => {
    const r1 = recipe(1, [structuredIngredient()]);
    setupServer([r1.summary], { [r1.detail.slug as string]: r1.detail });

    const result = await getRecipesForIngredientParsing({ state: 'any' });

    expect(result.items[0].ingredients[0].parsingState).toBe('structured');
  });

  it('treats a food with no unit and zero/no quantity as structured, not partial (e.g. a to-taste garnish)', async () => {
    const r1 = recipe(1, [partialIngredient({ quantity: 0 })]);
    setupServer([r1.summary], { [r1.detail.slug as string]: r1.detail });

    const result = await getRecipesForIngredientParsing({ state: 'any' });

    expect(result.items[0].ingredients[0].parsingState).toBe('structured');
  });

  it('treats a food/unit field that is entirely absent from the source the same as an explicit null', async () => {
    const r1 = recipe(1, [
      { referenceId: 'ref-absent', quantity: 2, note: '', display: '', title: null }, // food/unit/originalText keys omitted entirely
    ]);
    setupServer([r1.summary], { [r1.detail.slug as string]: r1.detail });

    const result = await getRecipesForIngredientParsing({ state: 'any' });
    const ing = result.items[0].ingredients[0];

    expect(ing.food).toBeNull();
    expect(ing.unit).toBeNull();
    expect(ing.originalText).toBeNull();
    expect(ing.parsingState).toBe('unparsed'); // absent food is indistinguishable from null food
  });

  describe('recipe-level count invariants', () => {
    const cases: { name: string; ingredients: Record<string, unknown>[] }[] = [
      { name: 'empty ingredient list', ingredients: [] },
      { name: 'single unparsed ingredient', ingredients: [unparsedIngredient()] },
      {
        name: 'one of each state',
        ingredients: [sectionIngredient(), unparsedIngredient(), partialIngredient(), structuredIngredient()],
      },
      {
        name: 'several of the same state',
        ingredients: [
          structuredIngredient({ referenceId: 'a' }),
          structuredIngredient({ referenceId: 'b' }),
          partialIngredient({ referenceId: 'c' }),
          partialIngredient({ referenceId: 'd' }),
          partialIngredient({ referenceId: 'e' }),
        ],
      },
    ];

    it.each(cases)('counts sum to totalCount for: $name', async ({ ingredients }) => {
      const r1 = recipe(1, ingredients);
      setupServer([r1.summary], { [r1.detail.slug as string]: r1.detail });

      const result = await getRecipesForIngredientParsing({ state: 'any' });
      const counts = result.items[0].ingredientParsingState;

      expect(counts.totalCount).toBe(ingredients.length);
      expect(counts.unparsedCount + counts.partialCount + counts.structuredCount + counts.sectionCount).toBe(counts.totalCount);
    });
  });
});

describe('ingredient field preservation', () => {
  it('preserves quantity, food id/name, unit id/name, note, display, originalText, title, and referenceId', async () => {
    const r1 = recipe(1, [
      {
        referenceId: 'ref-abc',
        quantity: 1.5,
        unit: { id: 'u-1', name: 'tablespoon', pluralName: 'tablespoons', extras: {} },
        food: { id: 'f-1', name: 'olive oil', aliases: [{ name: 'good olive oil' }] },
        note: 'divided',
        display: '1 ¹/₂ tablespoons olive oil divided',
        originalText: 'raw scraped text',
        title: null,
      },
    ]);
    setupServer([r1.summary], { [r1.detail.slug as string]: r1.detail });

    const result = await getRecipesForIngredientParsing({ state: 'any' });
    const ing = result.items[0].ingredients[0];

    expect(ing).toEqual({
      referenceId: 'ref-abc',
      quantity: 1.5,
      unit: { id: 'u-1', name: 'tablespoon' },
      food: { id: 'f-1', name: 'olive oil' },
      note: 'divided',
      display: '1 ¹/₂ tablespoons olive oil divided',
      originalText: 'raw scraped text',
      title: null,
      parsingState: 'structured',
    });
  });

  it('preserves a section heading title and a null food/unit', async () => {
    const r1 = recipe(1, [sectionIngredient()]);
    setupServer([r1.summary], { [r1.detail.slug as string]: r1.detail });

    const result = await getRecipesForIngredientParsing({ state: 'any' });
    const ing = result.items[0].ingredients[0];

    expect(ing.title).toBe('For the sauce');
    expect(ing.food).toBeNull();
    expect(ing.unit).toBeNull();
  });

  it('does not leak unrelated food/unit metadata (aliases, label, etc.) into the compact projection', async () => {
    const r1 = recipe(1, [structuredIngredient()]);
    setupServer([r1.summary], { [r1.detail.slug as string]: r1.detail });

    const result = await getRecipesForIngredientParsing({ state: 'any' });

    expect(Object.keys(result.items[0].ingredients[0].food!)).toEqual(['id', 'name']);
    expect(Object.keys(result.items[0].ingredients[0].unit!)).toEqual(['id', 'name']);
  });

  it('includes recipe-level context: categories, tags, description', async () => {
    const r1 = recipe(1, [unparsedIngredient()]);
    r1.detail.recipeCategory = [{ id: 'cat-1', name: 'Dinner', slug: 'dinner' }];
    r1.detail.tags = [{ id: 'tag-1', name: 'Quick', slug: 'quick' }];
    setupServer([r1.summary], { [r1.detail.slug as string]: r1.detail });

    const result = await getRecipesForIngredientParsing({});

    expect(result.items[0].categories).toEqual([{ id: 'cat-1', name: 'Dinner', slug: 'dinner' }]);
    expect(result.items[0].tags).toEqual([{ id: 'tag-1', name: 'Quick', slug: 'quick' }]);
    expect(result.items[0].description).toBe('A tasty recipe');
  });

  it('omits unrelated large fields not needed for ingredient parsing', async () => {
    const r1 = recipe(1, [unparsedIngredient()]);
    setupServer([r1.summary], { [r1.detail.slug as string]: r1.detail });

    const result = await getRecipesForIngredientParsing({});

    expect(result.items[0]).not.toHaveProperty('nutrition');
    expect(result.items[0]).not.toHaveProperty('settings');
    expect(result.items[0]).not.toHaveProperty('assets');
    expect(result.items[0]).not.toHaveProperty('comments');
  });
});

describe('instruction context', () => {
  it('returns instruction text, title, and ingredientReferences unchanged', async () => {
    const r1 = recipe(1, [unparsedIngredient()], [
      { id: 'i1', title: 'Prep', text: 'Chop the onions', ingredientReferences: [{ referenceId: 'ref-unparsed' }] },
      { id: 'i2', title: '', text: 'Saute the onions', ingredientReferences: [] },
    ]);
    setupServer([r1.summary], { [r1.detail.slug as string]: r1.detail });

    const result = await getRecipesForIngredientParsing({});

    expect(result.items[0].instructions).toEqual([
      { id: 'i1', title: 'Prep', text: 'Chop the onions', ingredientReferences: [{ referenceId: 'ref-unparsed' }] },
      { id: 'i2', title: '', text: 'Saute the onions', ingredientReferences: [] },
    ]);
  });

  it('omits the id field entirely when the source instruction has none, rather than a blank string', async () => {
    const r1 = recipe(1, [unparsedIngredient()], [{ title: '', text: 'Mix well', ingredientReferences: [] }]);
    setupServer([r1.summary], { [r1.detail.slug as string]: r1.detail });

    const result = await getRecipesForIngredientParsing({});

    expect(result.items[0].instructions[0]).not.toHaveProperty('id');
  });
});

describe('limit validation', () => {
  it('defaults to INGREDIENT_PARSING_DEFAULT_LIMIT', async () => {
    const items = Array.from({ length: 40 }, (_, i) => recipe(i, [unparsedIngredient()]));
    setupServer(
      items.map((r) => r.summary),
      Object.fromEntries(items.map((r) => [r.detail.slug as string, r.detail])),
    );

    const result = await getRecipesForIngredientParsing({});

    expect(result.items).toHaveLength(INGREDIENT_PARSING_DEFAULT_LIMIT);
    expect(result.hasMore).toBe(true);
  });

  it('honors an explicit limit', async () => {
    const items = Array.from({ length: 10 }, (_, i) => recipe(i, [unparsedIngredient()]));
    setupServer(
      items.map((r) => r.summary),
      Object.fromEntries(items.map((r) => [r.detail.slug as string, r.detail])),
    );

    const result = await getRecipesForIngredientParsing({ limit: 3 });

    expect(result.items).toHaveLength(3);
  });

  it('honors the maximum allowed limit', async () => {
    const items = Array.from({ length: 60 }, (_, i) => recipe(i, [unparsedIngredient()]));
    setupServer(
      items.map((r) => r.summary),
      Object.fromEntries(items.map((r) => [r.detail.slug as string, r.detail])),
    );

    const result = await getRecipesForIngredientParsing({ limit: INGREDIENT_PARSING_MAX_LIMIT });

    expect(result.items).toHaveLength(INGREDIENT_PARSING_MAX_LIMIT);
  });

  it('rejects a limit above the maximum', async () => {
    await expect(getRecipesForIngredientParsing({ limit: INGREDIENT_PARSING_MAX_LIMIT + 1 })).rejects.toThrow(InvalidLimitError);
  });

  it('rejects a limit below 1', async () => {
    await expect(getRecipesForIngredientParsing({ limit: 0 })).rejects.toThrow(InvalidLimitError);
  });

  it('rejects a non-integer limit', async () => {
    await expect(getRecipesForIngredientParsing({ limit: 3.5 })).rejects.toThrow(InvalidLimitError);
  });
});

describe('state validation', () => {
  it('rejects an unknown state value before making any Mealie API call', async () => {
    await expect(getRecipesForIngredientParsing({ state: 'bogus' as never })).rejects.toThrow(InvalidStateError);

    expect(mockGetRecipes).not.toHaveBeenCalled();
    expect(mockGetRecipe).not.toHaveBeenCalled();
  });
});

describe('pagination', () => {
  it('starts from the beginning of the collection when no cursor is given', async () => {
    const items = Array.from({ length: 3 }, (_, i) => recipe(i, [unparsedIngredient()]));
    setupServer(
      items.map((r) => r.summary),
      Object.fromEntries(items.map((r) => [r.detail.slug as string, r.detail])),
    );

    const result = await getRecipesForIngredientParsing({ state: 'any' });

    expect(mockGetRecipes).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
    expect(result.items.map((i) => i.slug)).toEqual(['recipe-0', 'recipe-1', 'recipe-2']);
  });

  it('continues from nextCursor without skipping or repeating recipes', async () => {
    const items = Array.from({ length: 5 }, (_, i) => recipe(i, [unparsedIngredient()]));
    setupServer(
      items.map((r) => r.summary),
      Object.fromEntries(items.map((r) => [r.detail.slug as string, r.detail])),
    );

    const page1 = await getRecipesForIngredientParsing({ state: 'any', limit: 2 });
    expect(page1.items.map((i) => i.slug)).toEqual(['recipe-0', 'recipe-1']);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await getRecipesForIngredientParsing({ state: 'any', limit: 2, cursor: page1.nextCursor! });
    expect(page2.items.map((i) => i.slug)).toEqual(['recipe-2', 'recipe-3']);
    expect(page2.hasMore).toBe(true);

    const page3 = await getRecipesForIngredientParsing({ state: 'any', limit: 2, cursor: page2.nextCursor! });
    expect(page3.items.map((i) => i.slug)).toEqual(['recipe-4']);
    expect(page3.hasMore).toBe(false);
    expect(page3.nextCursor).toBeNull();
  });

  it('does not skip or duplicate recipes across a batch boundary larger than the internal fetch batch size', async () => {
    const items = Array.from({ length: 45 }, (_, i) => recipe(i, [unparsedIngredient()]));
    setupServer(
      items.map((r) => r.summary),
      Object.fromEntries(items.map((r) => [r.detail.slug as string, r.detail])),
    );

    const result = await getRecipesForIngredientParsing({ state: 'any', limit: 45 });

    const slugs = result.items.map((i) => i.slug);
    expect(slugs).toHaveLength(45);
    expect(new Set(slugs).size).toBe(45);
    expect(slugs).toEqual(items.map((r) => r.detail.slug));
  });

  it('rejects a malformed cursor with a clear error', async () => {
    await expect(getRecipesForIngredientParsing({ cursor: 'not-valid!!' })).rejects.toThrow(InvalidCursorError);
    await expect(
      getRecipesForIngredientParsing({ cursor: Buffer.from('{"v":1}').toString('base64url') }),
    ).rejects.toThrow(InvalidCursorError);
    await expect(
      getRecipesForIngredientParsing({ cursor: Buffer.from(JSON.stringify({ v: 2 })).toString('base64url') }),
    ).rejects.toThrow(InvalidCursorError);
  });

  it('advances the underlying page when the scan spans more than one Mealie page', async () => {
    const pageOneItems = Array.from({ length: 50 }, (_, i) =>
      i % 2 === 0 ? recipe(i, [unparsedIngredient()]) : recipe(i, [structuredIngredient()]),
    );
    const pageTwoItems = Array.from({ length: 5 }, (_, i) => recipe(50 + i, [unparsedIngredient()]));
    const all = [...pageOneItems, ...pageTwoItems];
    setupServer(
      all.map((r) => r.summary),
      Object.fromEntries(all.map((r) => [r.detail.slug as string, r.detail])),
    );

    const result = await getRecipesForIngredientParsing({ limit: 30 });

    expect(result.items).toHaveLength(30);
    expect(result.items[29].slug).toBe('recipe-54');
    expect(mockGetRecipes).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
  });

  it('accepts a cursor issued under a different state — cursors are a pure scan position, not tied to a query filter', async () => {
    const items = Array.from({ length: 4 }, (_, i) => recipe(i, [unparsedIngredient()]));
    setupServer(
      items.map((r) => r.summary),
      Object.fromEntries(items.map((r) => [r.detail.slug as string, r.detail])),
    );

    const page1 = await getRecipesForIngredientParsing({ state: 'any', limit: 2 });
    expect(page1.items.map((i) => i.slug)).toEqual(['recipe-0', 'recipe-1']);

    // Continue the same cursor but under a different state filter — must not error or restart the scan.
    const page2 = await getRecipesForIngredientParsing({ state: 'unparsed_only', limit: 2, cursor: page1.nextCursor! });
    expect(page2.items.map((i) => i.slug)).toEqual(['recipe-2', 'recipe-3']);
    // hasMore is true here because the limit was hit exactly on the last item — the scan never
    // looked ahead to discover the collection is actually exhausted; a third call would confirm
    // that with an empty page. That's expected, not a bug.
    const page3 = await getRecipesForIngredientParsing({ state: 'unparsed_only', limit: 2, cursor: page2.nextCursor! });
    expect(page3.items).toEqual([]);
    expect(page3.hasMore).toBe(false);
  });

  it('does not skip a recipe whose ingredients change between calls (simulated concurrent edit)', async () => {
    // A, C, E are unparsed; B, D are already fully structured.
    const dataset = [
      recipe(1, [unparsedIngredient()]), // A - matches
      recipe(2, [structuredIngredient()]), // B - no match
      recipe(3, [unparsedIngredient()]), // C - matches (will be "parsed" by another client before page 2)
      recipe(4, [structuredIngredient()]), // D - no match
      recipe(5, [unparsedIngredient()]), // E - matches
    ];
    setupServer(
      dataset.map((r) => r.summary),
      Object.fromEntries(dataset.map((r) => [r.detail.slug as string, r.detail])),
    );

    const page1 = await getRecipesForIngredientParsing({ limit: 2 });
    expect(page1.items.map((i) => i.slug)).toEqual(['recipe-1', 'recipe-3']);
    expect(page1.scannedCount).toBe(3); // A, B, C scanned; B filtered out
    expect(page1.hasMore).toBe(true);

    // Simulate recipe-3 (C) being fully parsed by another client in between calls.
    dataset[2].detail.recipeIngredient = [structuredIngredient()];

    const page2 = await getRecipesForIngredientParsing({ limit: 2, cursor: page1.nextCursor! });
    expect(page2.items.map((i) => i.slug)).toEqual(['recipe-5']);
    expect(page2.scannedCount).toBe(2); // D, E scanned; C is never re-visited or re-matched
    expect(page2.hasMore).toBe(false);

    // Across both calls every recipe was scanned exactly once: no skips, no duplicates.
    expect(page1.scannedCount + page2.scannedCount).toBe(dataset.length);
  });
});

describe('time budget', () => {
  it('returns a partial page with hasMore:true and a valid cursor when the time budget is exhausted mid-scan', async () => {
    // More recipes than fit in one internal detail-fetch batch, so an immediately-expired
    // deadline (deadlineMs: -1) forces the scan to stop after the first batch rather than
    // draining the whole collection.
    const items = Array.from({ length: 45 }, (_, i) => recipe(i, [unparsedIngredient()]));
    setupServer(
      items.map((r) => r.summary),
      Object.fromEntries(items.map((r) => [r.detail.slug as string, r.detail])),
    );

    const result = await getRecipesForIngredientParsing({ state: 'any', limit: 45 }, { now: () => 0, deadlineMs: -1 });

    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBeTruthy();
    expect(result.scannedCount).toBeGreaterThan(0);
    expect(result.scannedCount).toBeLessThan(items.length); // proves it actually stopped early, not just ran out of data
    expect(result.items.length).toBe(result.scannedCount); // state: 'any' -> every scanned recipe matched
  });

  it('continuing from a deadline-truncated cursor completes the scan without skipping or duplicating recipes', async () => {
    const items = Array.from({ length: 45 }, (_, i) => recipe(i, [unparsedIngredient()]));
    setupServer(
      items.map((r) => r.summary),
      Object.fromEntries(items.map((r) => [r.detail.slug as string, r.detail])),
    );

    const page1 = await getRecipesForIngredientParsing({ state: 'any', limit: 45 }, { now: () => 0, deadlineMs: -1 });
    expect(page1.hasMore).toBe(true);

    // Resume with a real (generous) deadline so the rest of the collection can drain in one call.
    const page2 = await getRecipesForIngredientParsing({ state: 'any', limit: 45, cursor: page1.nextCursor! });
    expect(page2.hasMore).toBe(false);

    const allSlugs = [...page1.items.map((i) => i.slug), ...page2.items.map((i) => i.slug)];
    expect(allSlugs).toHaveLength(45);
    expect(new Set(allSlugs).size).toBe(45); // no duplicates
    expect(allSlugs).toEqual(items.map((r) => r.detail.slug)); // no gaps, correct order
  });
});

describe('detail-fetch concurrency', () => {
  it('bounds concurrent recipe detail requests instead of firing them all at once', async () => {
    const items = Array.from({ length: 12 }, (_, i) => recipe(i, [unparsedIngredient()]));
    setupServer(
      items.map((r) => r.summary),
      {},
    );

    let inFlight = 0;
    let maxInFlight = 0;
    mockGetRecipe.mockImplementation(async (slug: string) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight--;
      const found = items.find((r) => r.detail.slug === slug);
      if (!found) return Promise.reject(new Error(`not found: ${slug}`));
      return found.detail;
    });

    const result = await getRecipesForIngredientParsing({ state: 'any', limit: 12 });

    expect(result.items).toHaveLength(12);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(DEFAULT_DETAIL_FETCH_CONCURRENCY);
  });
});

describe('sparse queue', () => {
  it('finds a single sparse match among many non-matching recipes', async () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      i === 17 ? recipe(i, [unparsedIngredient()]) : recipe(i, [structuredIngredient()]),
    );
    setupServer(
      items.map((r) => r.summary),
      Object.fromEntries(items.map((r) => [r.detail.slug as string, r.detail])),
    );

    const result = await getRecipesForIngredientParsing({ state: 'unparsed_only' });

    expect(result.items.map((i) => i.slug)).toEqual(['recipe-17']);
    expect(result.scannedCount).toBe(20); // had to scan the whole sparse collection to find the one match
    expect(result.hasMore).toBe(false);
  });
});

describe('failure isolation', () => {
  it('reports a single recipe read failure without failing the rest of the page', async () => {
    const r1 = recipe(1, [unparsedIngredient()]);
    const r2 = recipe(2, [unparsedIngredient()]);
    const r3 = recipe(3, [unparsedIngredient()]);
    setupServer(
      [r1.summary, r2.summary, r3.summary],
      { [r1.detail.slug as string]: r1.detail, [r3.detail.slug as string]: r3.detail }, // r2's detail intentionally missing -> getRecipe rejects
    );

    const result = await getRecipesForIngredientParsing({ state: 'any' });

    expect(result.items.map((i) => i.slug)).toEqual(['recipe-1', 'recipe-3']);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].slug).toBe('recipe-2');
    expect(result.failures[0].id).toBe('id-2');
    expect(result.failures[0].error).toContain('recipe-2');

    // The failed recipe still counts as scanned (its scan position must not be lost/re-visited),
    // but never as a returned match, and the cursor is still usable to continue.
    expect(result.scannedCount).toBe(3);
    expect(result.returnedCount).toBe(2);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('a recipe with a failed detail fetch is not counted as a match even under state: "any"', async () => {
    const r1 = recipe(1, [unparsedIngredient()]);
    setupServer([r1.summary], {}); // detail fetch always rejects (not found)

    const result = await getRecipesForIngredientParsing({ state: 'any' });

    expect(result.items).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(result.returnedCount).toBe(0);
  });
});

describe('read-only guarantee', () => {
  it('never calls any write operation on the Mealie API', async () => {
    const items = Array.from({ length: 3 }, (_, i) => recipe(i, [unparsedIngredient(), structuredIngredient(), partialIngredient()]));
    setupServer(
      items.map((r) => r.summary),
      Object.fromEntries(items.map((r) => [r.detail.slug as string, r.detail])),
    );

    await getRecipesForIngredientParsing({ state: 'any' });

    expect(mockPatchRecipe).not.toHaveBeenCalled();
    expect(mockUpdateRecipe).not.toHaveBeenCalled();
    expect(mockCreateRecipe).not.toHaveBeenCalled();
    expect(mockDeleteRecipe).not.toHaveBeenCalled();
    expect(mockDuplicateRecipe).not.toHaveBeenCalled();
    expect(mockUpdateRecipeLastMade).not.toHaveBeenCalled();
    expect(mockSetRecipeImageFromUrl).not.toHaveBeenCalled();
    expect(mockGetRecipes).toHaveBeenCalled();
    expect(mockGetRecipe).toHaveBeenCalled();
  });
});
