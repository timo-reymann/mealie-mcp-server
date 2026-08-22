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

vi.mock('../lib/recipe-ingredient-parsing.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/recipe-ingredient-parsing.js')>(
    '../lib/recipe-ingredient-parsing.js',
  );
  return { ...actual, getRecipesForIngredientParsing: vi.fn() };
});

import * as ingredientParsingLib from '../lib/recipe-ingredient-parsing.js';
import { registerRecipeTools } from '../tools/recipes.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}>;

function createMockServer(): { server: McpServer; handlers: Map<string, ToolHandler>; calls: Map<string, unknown[]> } {
  const handlers = new Map<string, ToolHandler>();
  const calls = new Map<string, unknown[]>();
  const server = {
    tool: (name: string, ...rest: unknown[]) => {
      const cb = rest[rest.length - 1] as ToolHandler;
      handlers.set(name, cb);
      calls.set(name, rest);
      return {};
    },
  };
  return { server: server as unknown as McpServer, handlers, calls };
}

const mockGetRecipesForIngredientParsing = vi.mocked(ingredientParsingLib.getRecipesForIngredientParsing);

let handlers: Map<string, ToolHandler>;
let calls: Map<string, unknown[]>;

beforeEach(() => {
  vi.clearAllMocks();
  const mocked = createMockServer();
  registerRecipeTools(mocked.server);
  handlers = mocked.handlers;
  calls = mocked.calls;
});

describe('get_recipes_for_ingredient_parsing tool', () => {
  it('is registered', () => {
    expect(handlers.has('get_recipes_for_ingredient_parsing')).toBe(true);
  });

  it('is registered as read-only and non-destructive', () => {
    const rest = calls.get('get_recipes_for_ingredient_parsing')!;
    const annotations = rest.find((arg): arg is Record<string, unknown> => {
      return typeof arg === 'object' && arg !== null && 'readOnlyHint' in arg;
    });

    expect(annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  });

  it('forwards cursor/limit/state to the lib function and returns its result', async () => {
    const page = {
      items: [],
      failures: [],
      nextCursor: null,
      scannedCount: 0,
      returnedCount: 0,
      hasMore: false,
    };
    mockGetRecipesForIngredientParsing.mockResolvedValue(page);

    const handler = handlers.get('get_recipes_for_ingredient_parsing')!;
    const response = await handler({ cursor: 'abc', limit: 10, state: 'partially_parsed' });

    expect(mockGetRecipesForIngredientParsing).toHaveBeenCalledWith({ cursor: 'abc', limit: 10, state: 'partially_parsed' });
    expect(response.isError).toBeUndefined();
    expect(JSON.parse(response.content[0].text)).toEqual(page);
  });

  it('works with no arguments (defaults applied downstream)', async () => {
    mockGetRecipesForIngredientParsing.mockResolvedValue({
      items: [],
      failures: [],
      nextCursor: null,
      scannedCount: 0,
      returnedCount: 0,
      hasMore: false,
    });

    const handler = handlers.get('get_recipes_for_ingredient_parsing')!;
    const response = await handler({});

    expect(mockGetRecipesForIngredientParsing).toHaveBeenCalledWith({ cursor: undefined, limit: undefined, state: undefined });
    expect(response.isError).toBeUndefined();
  });

  it('surfaces an invalid cursor error as an error response, not a crash', async () => {
    mockGetRecipesForIngredientParsing.mockRejectedValue(new Error('Invalid cursor: not valid base64url-encoded JSON.'));

    const handler = handlers.get('get_recipes_for_ingredient_parsing')!;
    const response = await handler({ cursor: 'garbage' });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/Invalid cursor/);
  });

  it('surfaces a general failure without masquerading as success', async () => {
    mockGetRecipesForIngredientParsing.mockRejectedValue(new Error('Mealie API error 500: Internal Server Error'));

    const handler = handlers.get('get_recipes_for_ingredient_parsing')!;
    const response = await handler({});

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/500/);
  });

  it('surfaces an invalid state error as an error response, not a crash', async () => {
    mockGetRecipesForIngredientParsing.mockRejectedValue(
      new Error('state must be one of "unparsed_only", "partially_parsed", "any" (got "bogus").'),
    );

    const handler = handlers.get('get_recipes_for_ingredient_parsing')!;
    const response = await handler({ state: 'bogus' });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/state must be one of/);
  });
});
