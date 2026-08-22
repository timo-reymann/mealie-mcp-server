import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../api/foods.js', () => ({
  getFoods: vi.fn(),
  getFood: vi.fn(),
  getFoodMatches: vi.fn(),
  createFood: vi.fn(),
  updateFood: vi.fn(),
  deleteFood: vi.fn(),
}));

import * as foodsApi from '../api/foods.js';
import { registerFoodTools } from '../tools/foods.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}>;

function createMockServer(): { server: McpServer; calls: Map<string, unknown[]> } {
  const calls = new Map<string, unknown[]>();
  const server = {
    tool: (name: string, ...rest: unknown[]) => {
      calls.set(name, rest);
      return {};
    },
  };
  return { server: server as unknown as McpServer, calls };
}

function handlerFor(calls: Map<string, unknown[]>, name: string): ToolHandler {
  const rest = calls.get(name);
  if (!rest) throw new Error(`tool not registered: ${name}`);
  return rest[rest.length - 1] as ToolHandler;
}

function schemaFor(calls: Map<string, unknown[]>, name: string): Record<string, unknown> {
  const rest = calls.get(name);
  if (!rest) throw new Error(`tool not registered: ${name}`);
  return rest[rest.length - 2] as Record<string, unknown>;
}

const mockGetFoods = vi.mocked(foodsApi.getFoods);
const mockGetFood = vi.mocked(foodsApi.getFood);
const mockGetFoodMatches = vi.mocked(foodsApi.getFoodMatches);
const mockCreateFood = vi.mocked(foodsApi.createFood);
const mockUpdateFood = vi.mocked(foodsApi.updateFood);
const mockDeleteFood = vi.mocked(foodsApi.deleteFood);

let calls: Map<string, unknown[]>;

beforeEach(() => {
  vi.clearAllMocks();
  const mocked = createMockServer();
  registerFoodTools(mocked.server);
  calls = mocked.calls;
});

describe('registration', () => {
  it('registers all six food tools', () => {
    expect(calls.has('get_foods')).toBe(true);
    expect(calls.has('get_food')).toBe(true);
    expect(calls.has('get_food_matches')).toBe(true);
    expect(calls.has('create_food')).toBe(true);
    expect(calls.has('update_food')).toBe(true);
    expect(calls.has('delete_food')).toBe(true);
  });

  it('uses the intended public parameter names for each tool', () => {
    expect(Object.keys(schemaFor(calls, 'get_foods')).sort()).toEqual(['page', 'perPage', 'search'].sort());
    expect(Object.keys(schemaFor(calls, 'get_food'))).toEqual(['foodId']);
    expect(Object.keys(schemaFor(calls, 'get_food_matches')).sort()).toEqual(
      ['queries', 'maxMatchesPerQuery'].sort(),
    );
    expect(Object.keys(schemaFor(calls, 'create_food')).sort()).toEqual(
      ['name', 'pluralName', 'description', 'aliases', 'labelId'].sort(),
    );
    expect(Object.keys(schemaFor(calls, 'update_food')).sort()).toEqual(
      ['foodId', 'name', 'pluralName', 'description', 'aliases', 'labelId'].sort(),
    );
    expect(Object.keys(schemaFor(calls, 'delete_food'))).toEqual(['foodId']);
  });
});

describe('get_foods tool', () => {
  it('passes params through and returns the result', async () => {
    const result = { items: [{ id: 'food-1', name: 'Onion' }], total: 1, page: 1, size: 1 };
    mockGetFoods.mockResolvedValue(result);

    const handler = handlerFor(calls, 'get_foods');
    const response = await handler({ search: 'onion', page: 1, perPage: 10 });

    expect(mockGetFoods).toHaveBeenCalledWith({ search: 'onion', page: 1, perPage: 10 });
    expect(response.isError).toBeUndefined();
    expect(JSON.parse(response.content[0].text)).toEqual(result);
  });

  it('surfaces API errors as an error response', async () => {
    mockGetFoods.mockRejectedValue(new Error('Unable to retrieve foods: Mealie API error 500: boom'));
    const handler = handlerFor(calls, 'get_foods');
    const response = await handler({});
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/Unable to retrieve foods/);
  });
});

describe('get_food tool', () => {
  it('returns the food on success', async () => {
    const food = { id: 'food-1', name: 'Onion' };
    mockGetFood.mockResolvedValue(food);

    const handler = handlerFor(calls, 'get_food');
    const response = await handler({ foodId: 'food-1' });

    expect(mockGetFood).toHaveBeenCalledWith('food-1');
    expect(response.isError).toBeUndefined();
    expect(JSON.parse(response.content[0].text)).toEqual(food);
  });

  it('surfaces a not-found error', async () => {
    mockGetFood.mockRejectedValue(new Error('Food not found: missing-id: Mealie API error 404: Not Found'));
    const handler = handlerFor(calls, 'get_food');
    const response = await handler({ foodId: 'missing-id' });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/Food not found/);
  });
});

describe('get_food_matches tool', () => {
  it('passes queries and maxMatchesPerQuery through and returns the result', async () => {
    const result = {
      matches: [{ query: 'basil', items: [], truncated: false }],
      queryCount: 1,
      uniqueQueryCount: 1,
      matchedCount: 0,
      apiRequestCount: 1,
    };
    mockGetFoodMatches.mockResolvedValue(result);

    const handler = handlerFor(calls, 'get_food_matches');
    const response = await handler({ queries: ['basil'], maxMatchesPerQuery: 5 });

    expect(mockGetFoodMatches).toHaveBeenCalledWith(['basil'], { maxMatchesPerQuery: 5 });
    expect(response.isError).toBeUndefined();
    expect(JSON.parse(response.content[0].text)).toEqual(result);
  });

  it('surfaces validation errors as an error response', async () => {
    mockGetFoodMatches.mockRejectedValue(new Error('At least one query is required.'));
    const handler = handlerFor(calls, 'get_food_matches');
    const response = await handler({ queries: [] });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/At least one query is required/);
  });

  it('surfaces API errors as an error response', async () => {
    mockGetFoodMatches.mockRejectedValue(new Error('Unable to look up food matches: Mealie API error 500: boom'));
    const handler = handlerFor(calls, 'get_food_matches');
    const response = await handler({ queries: ['basil'] });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/Unable to look up food matches/);
  });

  it('never creates, updates, or deletes a food — read-only', async () => {
    mockGetFoodMatches.mockResolvedValue({
      matches: [],
      queryCount: 0,
      uniqueQueryCount: 0,
      matchedCount: 0,
      apiRequestCount: 0,
    });
    const handler = handlerFor(calls, 'get_food_matches');
    await handler({ queries: ['basil'] });
    expect(mockCreateFood).not.toHaveBeenCalled();
    expect(mockUpdateFood).not.toHaveBeenCalled();
    expect(mockDeleteFood).not.toHaveBeenCalled();
  });
});

describe('create_food tool', () => {
  it('creates a food with the given fields', async () => {
    const created = { id: 'food-2', name: 'Garlic' };
    mockCreateFood.mockResolvedValue(created);

    const handler = handlerFor(calls, 'create_food');
    const response = await handler({ name: 'Garlic', aliases: ['garlic clove'] });

    expect(mockCreateFood).toHaveBeenCalledWith({ name: 'Garlic', aliases: ['garlic clove'] });
    expect(response.isError).toBeUndefined();
    expect(JSON.parse(response.content[0].text)).toEqual(created);
  });

  it('surfaces a blank-name validation error', async () => {
    mockCreateFood.mockRejectedValue(new Error('Food name cannot be empty.'));
    const handler = handlerFor(calls, 'create_food');
    const response = await handler({ name: '   ' });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/cannot be empty/);
  });

  it('surfaces API errors', async () => {
    mockCreateFood.mockRejectedValue(new Error('Unable to create food: Mealie API error 400: Bad Request'));
    const handler = handlerFor(calls, 'create_food');
    const response = await handler({ name: 'Garlic' });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/Unable to create food/);
  });
});

describe('update_food tool', () => {
  it('forwards foodId separately from the update fields', async () => {
    const updated = { id: 'food-1', name: 'Yellow Onion' };
    mockUpdateFood.mockResolvedValue(updated);

    const handler = handlerFor(calls, 'update_food');
    const response = await handler({ foodId: 'food-1', name: 'Yellow Onion', labelId: null });

    expect(mockUpdateFood).toHaveBeenCalledWith('food-1', { name: 'Yellow Onion', labelId: null });
    expect(response.isError).toBeUndefined();
    expect(JSON.parse(response.content[0].text)).toEqual(updated);
  });

  it('surfaces a no-fields validation error', async () => {
    mockUpdateFood.mockRejectedValue(new Error('At least one field must be supplied for an update.'));
    const handler = handlerFor(calls, 'update_food');
    const response = await handler({ foodId: 'food-1' });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/At least one field must be supplied/);
  });

  it('surfaces API errors', async () => {
    mockUpdateFood.mockRejectedValue(new Error('Unable to update food food-1: Mealie API error 400: Bad Request'));
    const handler = handlerFor(calls, 'update_food');
    const response = await handler({ foodId: 'food-1', name: 'Onion' });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/Unable to update food/);
  });
});

describe('delete_food tool', () => {
  it('deletes a food and returns a concise success result', async () => {
    mockDeleteFood.mockResolvedValue({ id: 'food-1' });

    const handler = handlerFor(calls, 'delete_food');
    const response = await handler({ foodId: 'food-1' });

    expect(mockDeleteFood).toHaveBeenCalledWith('food-1');
    expect(response.isError).toBeUndefined();
    expect(JSON.parse(response.content[0].text)).toEqual({ id: 'food-1' });
  });

  it('surfaces a referenced-food conflict error', async () => {
    mockDeleteFood.mockRejectedValue(new Error('Unable to delete food food-1. ... still referenced ...'));
    const handler = handlerFor(calls, 'delete_food');
    const response = await handler({ foodId: 'food-1' });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/still referenced/);
  });

  it('surfaces general API errors', async () => {
    mockDeleteFood.mockRejectedValue(new Error('Unable to delete food food-1: Mealie API error 500: boom'));
    const handler = handlerFor(calls, 'delete_food');
    const response = await handler({ foodId: 'food-1' });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/Unable to delete food/);
  });
});
