import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../api/mealplans.js', () => ({
  getMealplans: vi.fn(),
  getTodaysMealplan: vi.fn(),
  createMealplan: vi.fn(),
  getMealplan: vi.fn(),
  updateMealplan: vi.fn(),
  deleteMealplan: vi.fn(),
}));

vi.mock('../api/recipes.js', () => ({
  getRecipesBatch: vi.fn(),
}));

import * as mealplansApi from '../api/mealplans.js';
import { registerMealplanTools } from '../tools/mealplans.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}>;

interface PatchResponse {
  summary: { deleted: number; replaced: number; appended: number; failed: number };
  results: Array<{ action: string; id?: string; ok: boolean; error?: string; entry?: unknown }>;
}

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

const mockCreateMealplan = vi.mocked(mealplansApi.createMealplan);
const mockGetMealplan = vi.mocked(mealplansApi.getMealplan);
const mockUpdateMealplan = vi.mocked(mealplansApi.updateMealplan);
const mockDeleteMealplan = vi.mocked(mealplansApi.deleteMealplan);

let calls: Map<string, unknown[]>;

beforeEach(() => {
  vi.clearAllMocks();
  const mocked = createMockServer();
  registerMealplanTools(mocked.server);
  calls = mocked.calls;
});

describe('registration', () => {
  it('registers all six meal plan tools', () => {
    expect(calls.has('get_all_mealplans')).toBe(true);
    expect(calls.has('get_mealplan_with_recipes')).toBe(true);
    expect(calls.has('create_mealplan')).toBe(true);
    expect(calls.has('create_mealplan_bulk')).toBe(true);
    expect(calls.has('get_todays_mealplan')).toBe(true);
    expect(calls.has('patch_mealplan')).toBe(true);
  });
});

describe('patch_mealplan tool', () => {
  describe('single delete', () => {
    it('deletes an entry and returns success', async () => {
      mockDeleteMealplan.mockResolvedValue({});

      const handler = handlerFor(calls, 'patch_mealplan');
      const response = await handler({
        actions: [{ action: 'delete', id: 'entry-1' }],
      });

      expect(mockDeleteMealplan).toHaveBeenCalledWith('entry-1');
      expect(response.isError).toBeUndefined();
      const body = JSON.parse(response.content[0].text) as PatchResponse;
      expect(body.summary).toEqual({ deleted: 1, replaced: 0, appended: 0, failed: 0 });
      expect(body.results).toHaveLength(1);
      expect(body.results[0]).toEqual({ action: 'delete', id: 'entry-1', ok: true });
    });

    it('reports failure without aborting', async () => {
      mockDeleteMealplan.mockRejectedValue(new Error('not found'));

      const handler = handlerFor(calls, 'patch_mealplan');
      const response = await handler({
        actions: [{ action: 'delete', id: 'bad-id' }],
      });

      const body = JSON.parse(response.content[0].text) as PatchResponse;
      expect(body.summary.failed).toBe(1);
      expect(body.results[0].ok).toBe(false);
      expect(body.results[0].error).toBe('not found');
    });
  });

  describe('single replace', () => {
    it('reads, merges, and writes the entry', async () => {
      const current = {
        id: 'entry-2',
        date: '2026-08-26',
        entryType: 'dinner',
        recipeId: 'recipe-old',
        title: 'Old Title',
      };
      const updated = { ...current, entryType: 'lunch', recipeId: 'recipe-new' };

      mockGetMealplan.mockResolvedValue(current);
      mockUpdateMealplan.mockResolvedValue(updated);

      const handler = handlerFor(calls, 'patch_mealplan');
      const response = await handler({
        actions: [
          { action: 'replace', id: 'entry-2', entryType: 'lunch', recipeId: 'recipe-new' },
        ],
      });

      expect(mockGetMealplan).toHaveBeenCalledWith('entry-2');
      expect(mockUpdateMealplan).toHaveBeenCalledWith('entry-2', {
        id: 'entry-2',
        date: '2026-08-26',
        entryType: 'lunch',
        recipeId: 'recipe-new',
        title: 'Old Title',
      });
      expect(response.isError).toBeUndefined();
      const body = JSON.parse(response.content[0].text) as PatchResponse;
      expect(body.summary).toEqual({ deleted: 0, replaced: 1, appended: 0, failed: 0 });
      expect(body.results[0]).toEqual({ action: 'replace', id: 'entry-2', ok: true, entry: updated });
    });

    it('preserves untouched fields when only some are provided', async () => {
      const current = {
        id: 'entry-3',
        date: '2026-08-26',
        entryType: 'breakfast',
        recipeId: 'recipe-abc',
        title: 'Pancakes',
      };
      mockGetMealplan.mockResolvedValue(current);
      mockUpdateMealplan.mockResolvedValue(current);

      const handler = handlerFor(calls, 'patch_mealplan');
      await handler({
        actions: [{ action: 'replace', id: 'entry-3', title: 'Blueberry Pancakes' }],
      });

      expect(mockUpdateMealplan).toHaveBeenCalledWith('entry-3', {
        id: 'entry-3',
        date: '2026-08-26',
        entryType: 'breakfast',
        recipeId: 'recipe-abc',
        title: 'Blueberry Pancakes',
      });
    });
  });

  describe('single append', () => {
    it('creates a new entry', async () => {
      const created = { id: 'entry-4', date: '2026-08-27', entryType: 'lunch', recipeId: 'recipe-xyz' };
      mockCreateMealplan.mockResolvedValue(created);

      const handler = handlerFor(calls, 'patch_mealplan');
      const response = await handler({
        actions: [{ action: 'append', date: '2026-08-27', entryType: 'lunch', recipeId: 'recipe-xyz' }],
      });

      expect(mockCreateMealplan).toHaveBeenCalledWith({
        date: '2026-08-27',
        entryType: 'lunch',
        recipeId: 'recipe-xyz',
        title: undefined,
      });
      expect(response.isError).toBeUndefined();
      const body = JSON.parse(response.content[0].text) as PatchResponse;
      expect(body.summary).toEqual({ deleted: 0, replaced: 0, appended: 1, failed: 0 });
      expect(body.results[0]).toEqual({ action: 'append', ok: true, entry: created });
    });

    it('passes entryType through to createMealplan', async () => {
      mockCreateMealplan.mockResolvedValue({ id: 'entry-5' });

      const handler = handlerFor(calls, 'patch_mealplan');
      await handler({
        actions: [{ action: 'append', date: '2026-08-27', entryType: 'dinner' }],
      });

      expect(mockCreateMealplan).toHaveBeenCalledWith(
        expect.objectContaining({ entryType: 'dinner' }),
      );
    });
  });

  describe('mixed batch — move recipe from dinner to lunch', () => {
    it('deletes the old entry then appends the new one', async () => {
      mockDeleteMealplan.mockResolvedValue({});
      mockCreateMealplan.mockResolvedValue({ id: 'new-entry', date: '2026-08-26', entryType: 'lunch', recipeId: 'recipe-1' });

      const handler = handlerFor(calls, 'patch_mealplan');
      const response = await handler({
        actions: [
          { action: 'delete', id: 'dinner-entry' },
          { action: 'append', date: '2026-08-26', entryType: 'lunch', recipeId: 'recipe-1' },
        ],
      });

      const body = JSON.parse(response.content[0].text) as PatchResponse;
      expect(body.summary).toEqual({ deleted: 1, replaced: 0, appended: 1, failed: 0 });
      expect(body.results).toHaveLength(2);
      expect(body.results[0].action).toBe('delete');
      expect(body.results[1].action).toBe('append');
    });
  });

  describe('partial failure', () => {
    it('continues processing when one action fails', async () => {
      mockDeleteMealplan.mockRejectedValue(new Error('not found'));
      mockCreateMealplan.mockResolvedValue({ id: 'new-entry' });

      const handler = handlerFor(calls, 'patch_mealplan');
      const response = await handler({
        actions: [
          { action: 'delete', id: 'bad-id' },
          { action: 'append', date: '2026-08-27', recipeId: 'recipe-2' },
        ],
      });

      const body = JSON.parse(response.content[0].text) as PatchResponse;
      expect(body.summary).toEqual({ deleted: 0, replaced: 0, appended: 1, failed: 1 });
      expect(body.results[0].ok).toBe(false);
      expect(body.results[1].ok).toBe(true);
    });
  });

  describe('execution order', () => {
    it('runs deletes before replaces before appends', async () => {
      const order: string[] = [];
      mockDeleteMealplan.mockImplementation(() => { order.push('delete'); return Promise.resolve({}); });
      mockGetMealplan.mockImplementation((id: string) => {
        order.push('get');
        return Promise.resolve({ id, date: '2026-08-26', entryType: 'dinner' });
      });
      mockUpdateMealplan.mockImplementation((id: string) => { order.push('update'); return Promise.resolve({ id }); });
      mockCreateMealplan.mockImplementation(() => { order.push('append'); return Promise.resolve({ id: 'new' }); });

      const handler = handlerFor(calls, 'patch_mealplan');
      await handler({
        actions: [
          { action: 'append', date: '2026-08-27', recipeId: 'r1' },
          { action: 'delete', id: 'e1' },
          { action: 'replace', id: 'e2', entryType: 'lunch' },
          { action: 'append', date: '2026-08-28', recipeId: 'r2' },
        ],
      });

      const deleteIdx = order.indexOf('delete');
      const updateIdx = order.indexOf('update');
      const appendIdx = order.indexOf('append');
      expect(deleteIdx).toBeLessThan(updateIdx);
      expect(updateIdx).toBeLessThan(appendIdx);
    });
  });
});
