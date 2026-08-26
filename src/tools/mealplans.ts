import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as mealplansApi from '../api/mealplans.js';
import { getRecipesBatch } from '../api/recipes.js';
import { mapWithConcurrency, DEFAULT_DETAIL_FETCH_CONCURRENCY } from '../lib/concurrency.js';

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

export function registerMealplanTools(server: McpServer) {
  // @endpoints GET /api/households/mealplans
  server.tool(
    'get_all_mealplans',
    'Lists meal plans with optional date range filtering and pagination.',
    {
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      page: z.number().optional(),
      perPage: z.number().optional(),
    },
    async (params) => {
      try {
        const result = await mealplansApi.getMealplans(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  // @endpoints GET /api/households/mealplans, GET /api/recipes/{slug}
  server.tool(
    'get_mealplan_with_recipes',
    'Returns meal plans with embedded recipe details (full recipe data fetched via batch requests with bounded concurrency).',
    {
      startDate: z.string(),
      endDate: z.string(),
    },
    async (params) => {
      try {
        const mealplansResult = await mealplansApi.getMealplans({ startDate: params.startDate, endDate: params.endDate });
        const filtered = mealplansResult.items.filter(
          (item) => {
            const date = item.date as string | undefined;
            return date !== undefined && date >= params.startDate && date <= params.endDate;
          },
        );

        const recipeIds = new Set<string>();
        for (const item of filtered) {
          const recipeId = item.recipeId as string | undefined;
          const recipeSlug = item.recipeSlug as string | undefined;
          if (recipeId) recipeIds.add(recipeId);
          if (recipeSlug) recipeIds.add(recipeSlug);
        }

        const recipeMap = recipeIds.size > 0 ? await getRecipesBatch(Array.from(recipeIds)) : {};

        const enriched = filtered.map((item) => {
          const recipeId = (item.recipeId as string) || (item.recipeSlug as string);
          if (recipeId && recipeMap[recipeId]) {
            return { ...item, recipe: recipeMap[recipeId] };
          }
          return item;
        });

        return { content: [{ type: 'text' as const, text: JSON.stringify(enriched) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  // @endpoints POST /api/households/mealplans
  server.tool(
    'create_mealplan',
    'Creates a single meal plan entry for a given date.',
    {
      date: z.string(),
      recipeId: z.string().optional(),
      title: z.string().optional(),
      entryType: z.string().default('breakfast'),
    },
    async (params) => {
      try {
        const result = await mealplansApi.createMealplan(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  // @endpoints POST /api/households/mealplans
  server.tool(
    'create_mealplan_bulk',
    'Creates multiple meal plan entries at once via concurrent requests.',
    {
      entries: z.array(
        z.object({
          date: z.string(),
          recipeId: z.string().optional(),
          title: z.string().optional(),
          entryType: z.string().default('breakfast'),
        }),
      ),
    },
    async (params) => {
      try {
        const results = await Promise.all(
          params.entries.map((entry) => mealplansApi.createMealplan(entry)),
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ message: `Successfully created ${results.length} entries` }) }],
        };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  // @endpoints GET /api/households/mealplans/today
  server.tool(
    'get_todays_mealplan',
    'Returns today\'s meal plan.',
    {},
    async () => {
      try {
        const result = await mealplansApi.getTodaysMealplan();
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  // @endpoints DELETE /api/households/mealplans/{id}, GET /api/households/mealplans/{id}, PUT /api/households/mealplans/{id}, POST /api/households/mealplans
  server.tool(
    'patch_mealplan',
    'Performs a batch of mixed operations on meal plan entries in a single call. Use this to move recipes between meal types, update entries, or add new ones.',
    {
      actions: z
        .array(
          z.discriminatedUnion('action', [
            z.object({
              action: z.literal('delete'),
              id: z.string().describe('ID of the meal plan entry to delete'),
            }),
            z.object({
              action: z.literal('replace'),
              id: z.string().describe('ID of the meal plan entry to update'),
              date: z.string().optional().describe('New date (YYYY-MM-DD)'),
              recipeId: z.string().optional().describe('New recipe ID'),
              title: z.string().optional().describe('New title'),
              entryType: z
                .string()
                .optional()
                .describe('New entry type (breakfast | lunch | dinner | snack)'),
            }),
            z.object({
              action: z.literal('append'),
              date: z.string().describe('Date for the new entry (YYYY-MM-DD)'),
              recipeId: z.string().optional().describe('Recipe ID to add'),
              title: z.string().optional().describe('Title for the entry'),
              entryType: z
                .string()
                .default('breakfast')
                .describe('Entry type (breakfast | lunch | dinner | snack)'),
            }),
          ]),
        )
        .min(1)
        .describe(
          'Ordered list of actions. Deletions and replacements execute before appends, so you can move a recipe by deleting it from one slot and appending it to another in a single call.',
        ),
    },
    async (params) => {
      try {
        const deletes = params.actions.filter(
          (a): a is { action: 'delete'; id: string } => a.action === 'delete',
        );
        const replaces = params.actions.filter(
          (a): a is { action: 'replace'; id: string; date?: string; recipeId?: string; title?: string; entryType?: string } =>
            a.action === 'replace',
        );
        const appends = params.actions.filter(
          (a): a is { action: 'append'; date: string; recipeId?: string; title?: string; entryType: string } =>
            a.action === 'append',
        );

        const results: Array<{ action: string; id?: string; ok: boolean; error?: string; entry?: unknown }> = [];
        let deleted = 0;
        let replaced = 0;
        let appended = 0;
        let failed = 0;

        if (deletes.length > 0) {
          const deleteResults = await mapWithConcurrency(deletes, DEFAULT_DETAIL_FETCH_CONCURRENCY, async (action) => {
            try {
              await mealplansApi.deleteMealplan(action.id);
              return { action: 'delete' as const, id: action.id, ok: true };
            } catch (error) {
              return { action: 'delete' as const, id: action.id, ok: false, error: error instanceof Error ? error.message : String(error) };
            }
          });
          for (const r of deleteResults) {
            results.push(r);
            if (r.ok) deleted++;
            else failed++;
          }
        }

        if (replaces.length > 0) {
          const replaceResults = await mapWithConcurrency(replaces, DEFAULT_DETAIL_FETCH_CONCURRENCY, async (action) => {
            try {
              const current = await mealplansApi.getMealplan(action.id);
              const merged: Record<string, unknown> = { ...current };
              if (action.date !== undefined) merged.date = action.date;
              if (action.recipeId !== undefined) merged.recipeId = action.recipeId;
              if (action.title !== undefined) merged.title = action.title;
              if (action.entryType !== undefined) merged.entryType = action.entryType;
              const updated = await mealplansApi.updateMealplan(action.id, merged);
              return { action: 'replace' as const, id: action.id, ok: true, entry: updated };
            } catch (error) {
              return { action: 'replace' as const, id: action.id, ok: false, error: error instanceof Error ? error.message : String(error) };
            }
          });
          for (const r of replaceResults) {
            results.push(r);
            if (r.ok) replaced++;
            else failed++;
          }
        }

        if (appends.length > 0) {
          const appendResults = await mapWithConcurrency(appends, DEFAULT_DETAIL_FETCH_CONCURRENCY, async (action) => {
            try {
              const created = await mealplansApi.createMealplan({
                date: action.date,
                recipeId: action.recipeId,
                title: action.title,
                entryType: action.entryType,
              });
              return { action: 'append' as const, ok: true, entry: created };
            } catch (error) {
              return { action: 'append' as const, ok: false, error: error instanceof Error ? error.message : String(error) };
            }
          });
          for (const r of appendResults) {
            results.push(r);
            if (r.ok) appended++;
            else failed++;
          }
        }

        return successResponse({ summary: { deleted, replaced, appended, failed }, results });
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
