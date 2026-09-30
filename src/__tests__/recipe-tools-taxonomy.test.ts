import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

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

vi.mock('../api/categories.js', () => ({
  getCategories: vi.fn(),
  createCategory: vi.fn(),
}));

vi.mock('../api/tags.js', () => ({
  getTags: vi.fn(),
  createTag: vi.fn(),
}));

import * as recipesApi from '../api/recipes.js';
import * as categoriesApi from '../api/categories.js';
import * as tagsApi from '../api/tags.js';
import { registerRecipeTools } from '../tools/recipes.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}>;

function createMockServer(): { server: McpServer; handlers: Map<string, ToolHandler> } {
  const handlers = new Map<string, ToolHandler>();
  const server = {
    tool: (name: string, ...rest: unknown[]) => {
      const cb = rest[rest.length - 1] as ToolHandler;
      handlers.set(name, cb);
      return {};
    },
  };
  return { server: server as unknown as McpServer, handlers };
}

const DINNER = { id: 'cat-1', name: 'Dinner', slug: 'dinner' };
const DESSERT = { id: 'cat-2', name: 'Dessert', slug: 'dessert' };
const QUICK = { id: 'tag-1', name: 'Quick', slug: 'quick' };

function baseRecipe(): Record<string, unknown> {
  return {
    id: 'recipe-id-1',
    slug: 'chicken-shawarma',
    name: 'Chicken Shawarma',
    recipeIngredient: [{ note: '1 lb chicken' }],
    recipeInstructions: [{ text: 'Cook it' }],
    recipeCategory: [DINNER],
    tags: [QUICK],
  };
}

function paginated<T>(items: T[]): { items: T[]; total: number; page: number; size: number } {
  return { items, total: items.length, page: 1, size: items.length };
}

const mockGetRecipe = vi.mocked(recipesApi.getRecipe);
const mockPatchRecipe = vi.mocked(recipesApi.patchRecipe);
const mockGetCategories = vi.mocked(categoriesApi.getCategories);
const mockGetTags = vi.mocked(tagsApi.getTags);

let handlers: Map<string, ToolHandler>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRecipe.mockResolvedValue(baseRecipe());
  mockPatchRecipe.mockImplementation((_slug: string, data: Record<string, unknown>) =>
    Promise.resolve({ ...baseRecipe(), ...data }),
  );
  mockGetCategories.mockResolvedValue(paginated([DINNER, DESSERT]));
  mockGetTags.mockResolvedValue(paginated([QUICK]));

  const mocked = createMockServer();
  registerRecipeTools(mocked.server);
  handlers = mocked.handlers;
});

describe('patch_recipe backward compatibility', () => {
  it('patches only the given basic fields, unchanged from before taxonomy support existed', async () => {
    const handler = handlers.get('patch_recipe')!;
    const response = await handler({ slug: 'chicken-shawarma', name: 'New Name' });

    expect(mockGetRecipe).not.toHaveBeenCalled();
    expect(mockPatchRecipe).toHaveBeenCalledWith('chicken-shawarma', { name: 'New Name' });
    expect(response.isError).toBeUndefined();

    const body: unknown = JSON.parse(response.content[0].text);
    expect(body).not.toHaveProperty('taxonomyChanges');
  });

  it('still supports description/recipeYield/totalTime with no taxonomy fields present', async () => {
    const handler = handlers.get('patch_recipe')!;
    await handler({
      slug: 'chicken-shawarma',
      description: 'Updated description',
      recipeYield: '6 servings',
      totalTime: '45 minutes',
    });

    expect(mockPatchRecipe).toHaveBeenCalledWith('chicken-shawarma', {
      description: 'Updated description',
      recipeYield: '6 servings',
      totalTime: '45 minutes',
    });
    expect(mockGetRecipe).not.toHaveBeenCalled();
  });
});

describe('patch_recipe metadata and nutrition fields', () => {
  it('passes servings, times and orgURL through without fetching the recipe', async () => {
    const handler = handlers.get('patch_recipe')!;
    await handler({
      slug: 'chicken-shawarma',
      recipeServings: 4,
      recipeYieldQuantity: 12,
      prepTime: '15 minutes',
      performTime: '30 minutes',
      orgURL: 'https://example.com/shawarma',
    });

    expect(mockGetRecipe).not.toHaveBeenCalled();
    expect(mockPatchRecipe).toHaveBeenCalledWith('chicken-shawarma', {
      recipeServings: 4,
      recipeYieldQuantity: 12,
      prepTime: '15 minutes',
      performTime: '30 minutes',
      orgURL: 'https://example.com/shawarma',
    });
  });

  it('merges nutrition into the existing values so unspecified fields are not wiped', async () => {
    mockGetRecipe.mockResolvedValue({
      ...baseRecipe(),
      nutrition: { calories: '400', proteinContent: '30', fatContent: '12' },
    });
    const handler = handlers.get('patch_recipe')!;
    await handler({ slug: 'chicken-shawarma', nutrition: { calories: 500, fatContent: null } });

    expect(mockGetRecipe).toHaveBeenCalledWith('chicken-shawarma');
    expect(mockPatchRecipe).toHaveBeenCalledWith('chicken-shawarma', {
      nutrition: { calories: 500, proteinContent: '30', fatContent: null },
    });
  });

  it('sets nutrition on a recipe that has none yet', async () => {
    mockGetRecipe.mockResolvedValue({ ...baseRecipe(), nutrition: null });
    const handler = handlers.get('patch_recipe')!;
    await handler({ slug: 'chicken-shawarma', nutrition: { calories: '500' } });

    expect(mockPatchRecipe).toHaveBeenCalledWith('chicken-shawarma', { nutrition: { calories: '500' } });
  });

  it('fetches the recipe once when nutrition and taxonomy are patched together', async () => {
    const handler = handlers.get('patch_recipe')!;
    await handler({ slug: 'chicken-shawarma', nutrition: { calories: 500 }, categories: ['Dessert'] });

    expect(mockGetRecipe).toHaveBeenCalledTimes(1);
    expect(mockPatchRecipe).toHaveBeenCalledTimes(1);
    const [, patchData] = mockPatchRecipe.mock.calls[0];
    expect(patchData).toHaveProperty('nutrition', { calories: 500 });
    expect(patchData).toHaveProperty('recipeCategory');
  });
});

describe('patch_recipe with taxonomy fields', () => {
  it('fetches the recipe and merges category/tag changes into a single patch call', async () => {
    const handler = handlers.get('patch_recipe')!;
    const response = await handler({
      slug: 'chicken-shawarma',
      name: 'New Name',
      categories: ['Dessert'],
    });

    expect(mockGetRecipe).toHaveBeenCalledWith('chicken-shawarma');
    expect(mockPatchRecipe).toHaveBeenCalledTimes(1);
    const [, patchData] = mockPatchRecipe.mock.calls[0];
    expect(patchData.name).toBe('New Name');
    expect(patchData).toHaveProperty('recipeCategory');

    const body = JSON.parse(response.content[0].text) as { taxonomyChanges?: { categories?: unknown } };
    expect(body.taxonomyChanges?.categories).toBeDefined();
  });

  it('returns a clear error and skips the patch call when a value is missing and createMissing is false', async () => {
    const handler = handlers.get('patch_recipe')!;
    const response = await handler({ slug: 'chicken-shawarma', tags: ['Nonexistent'] });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/Nonexistent/);
    expect(mockPatchRecipe).not.toHaveBeenCalled();
  });
});

describe('update_recipe_taxonomy tool', () => {
  it('merges categories and tags by default and returns structured results', async () => {
    const handler = handlers.get('update_recipe_taxonomy')!;
    const response = await handler({
      slug: 'chicken-shawarma',
      categories: ['Dessert'],
      tags: ['Quick'],
    });

    expect(response.isError).toBeUndefined();
    const body = JSON.parse(response.content[0].text) as {
      id: string;
      slug: string;
      categories: { final: { name: string }[] };
    };
    expect(body.id).toBe('recipe-id-1');
    expect(body.slug).toBe('chicken-shawarma');
    expect(body.categories.final.map((c) => c.name).sort()).toEqual(['Dessert', 'Dinner']);
  });
});

describe('update_recipe_taxonomy_batch tool', () => {
  it('returns a per-recipe result and does not abort on a single failure', async () => {
    mockGetRecipe.mockImplementation((slug: string) =>
      slug === 'missing-recipe'
        ? Promise.reject(new Error('Mealie API error 404: Not Found'))
        : Promise.resolve(baseRecipe()),
    );

    const handler = handlers.get('update_recipe_taxonomy_batch')!;
    const response = await handler({
      updates: [
        { slug: 'chicken-shawarma', categories: ['Dessert'] },
        { slug: 'missing-recipe', categories: ['Dessert'] },
      ],
    });

    expect(response.isError).toBeUndefined();
    const body = JSON.parse(response.content[0].text) as { slug: string; success: boolean; error?: string }[];
    const ok = body.find((r) => r.slug === 'chicken-shawarma');
    const failed = body.find((r) => r.slug === 'missing-recipe');

    expect(ok?.success).toBe(true);
    expect(failed?.success).toBe(false);
    expect(failed?.error).toMatch(/Not Found/);
  });
});
