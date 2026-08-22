import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as foodsApi from '../api/foods.js';
import {
  MAX_QUERIES_PER_CALL,
  MAX_QUERY_LENGTH,
  DEFAULT_MAX_MATCHES_PER_QUERY,
  MAX_MATCHES_PER_QUERY_CAP,
} from '../lib/multi-query-lookup.js';

function successResponse(result: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
}

function errorResponse(error: unknown) {
  return {
    content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
    isError: true,
  };
}

const aliasesParamSchema = z
  .array(z.string())
  .describe(
    'Alternate names Mealie should also recognize for this food (e.g. "scallions" as an alias for ' +
      '"green onion"), given as plain strings — converted internally to the alias object shape Mealie expects.',
  );

export function registerFoodTools(server: McpServer): void {
  server.tool(
    'get_foods',
    'Lists and searches the household\'s foods (reusable structured ingredient entities such as "chicken breast" ' +
      'or "onion") with plain pagination. For resolving several already-interpreted food concepts to candidate ' +
      'IDs at once (e.g. after an LLM parses a batch of ingredients), prefer get_food_matches instead — it ' +
      'checks aliases too and answers many lookups in one call. Performs no fuzzy matching itself; matching is ' +
      'delegated entirely to Mealie\'s search.',
    {
      search: z
        .string()
        .optional()
        .describe(
          'Matches against food name and pluralName only, per Mealie\'s search behavior — despite having ' +
            'aliases, a food is NOT found by searching for one of its aliases here (confirmed by live testing: ' +
            'a food named "fermented pork" with alias "cured pork (som moo)" is not returned by search="som ' +
            'moo"). Use get_food_matches for alias-aware lookup.',
        ),
      page: z.number().optional(),
      perPage: z.number().optional(),
    },
    async (params) => {
      try {
        const result = await foodsApi.getFoods(params);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.tool(
    'get_food',
    'Retrieves a single food by ID, including its aliases and label information when present.',
    { foodId: z.string().describe('UUID of the food to retrieve.') },
    async ({ foodId }) => {
      try {
        const result = await foodsApi.getFood(foodId);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.tool(
    'get_food_matches',
    'Finds existing canonical Mealie food candidates for multiple already-interpreted food concepts in one ' +
      'call, including stored aliases (which get_foods\' search does not check). Use this after deciding what ' +
      'foods an ingredient refers to (e.g. an LLM parsing "2 tbsp chopped fresh parsley" into unit=tablespoon, ' +
      'food=parsley) and before calling create_food, to check whether a matching food or alias already exists. ' +
      'Returns ranked candidates per query rather than choosing one — the caller decides which candidate (if ' +
      'any) to use. Each query\'s result includes truncated: true when additional matching candidates may ' +
      'exist beyond the returned items (either because there were more than maxMatchesPerQuery, or because ' +
      'Mealie\'s own retrieval for that query was itself incomplete) — narrow the query text or raise ' +
      'maxMatchesPerQuery if that matters for a given lookup. Does not parse ingredient text, does not ' +
      'perform fuzzy/semantic matching, and does not create, update, or otherwise modify any food or alias.',
    {
      queries: z
        .array(z.string().trim().min(1, 'Queries cannot be blank.').max(MAX_QUERY_LENGTH))
        .min(1)
        .max(MAX_QUERIES_PER_CALL)
        .describe(
          `Food concepts to resolve, e.g. ["fresh mozzarella", "basil", "som moo"]. 1-${MAX_QUERIES_PER_CALL} ` +
            'plain lookup strings (not search syntax) — duplicates (case-insensitive) are resolved once but ' +
            'still returned once per input entry.',
        ),
      maxMatchesPerQuery: z
        .number()
        .int()
        .min(1)
        .max(MAX_MATCHES_PER_QUERY_CAP)
        .optional()
        .describe(
          `Maximum ranked candidates to return per query (default ${DEFAULT_MAX_MATCHES_PER_QUERY}, capped at ` +
            `${MAX_MATCHES_PER_QUERY_CAP}). Strongest matches (exact name/pluralName/alias, then substring ` +
            'matches) are kept first when a query has more candidates than this.',
        ),
    },
    async ({ queries, maxMatchesPerQuery }) => {
      try {
        const result = await foodsApi.getFoodMatches(queries, { maxMatchesPerQuery });
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.tool(
    'create_food',
    'Creates a new food. Call get_foods first to check whether an existing food or alias already covers this ' +
      'name — creating a duplicate food fragments the taxonomy instead of reusing what is already there.',
    {
      name: z.string().describe('Name of the new food. Cannot be blank.'),
      pluralName: z.string().optional().describe('Plural form of the name, if different.'),
      description: z.string().optional(),
      aliases: aliasesParamSchema.optional(),
      labelId: z.string().optional().describe('ID of an existing food label to assign. Does not create a new label.'),
    },
    async (params) => {
      try {
        const result = await foodsApi.createFood(params);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.tool(
    'update_food',
    'Updates an existing food. Fields left unspecified keep their current value. Sufficient for adding an alias: ' +
      'get_food the current record, append to its existing aliases, and pass the complete list back here.',
    {
      foodId: z.string().describe('UUID of the food to update.'),
      name: z.string().optional(),
      pluralName: z.string().optional(),
      description: z.string().optional(),
      aliases: aliasesParamSchema
        .optional()
        .describe(
          aliasesParamSchema.description +
            ' Replaces the food\'s entire alias collection when provided — pass an empty array to clear all ' +
            'aliases, or omit this field entirely to leave existing aliases untouched.',
        ),
      labelId: z
        .string()
        .nullable()
        .optional()
        .describe(
          'ID of an existing food label to assign. Pass null to clear the food\'s label, or omit to leave the ' +
            'current label unchanged.',
        ),
    },
    async ({ foodId, ...rest }) => {
      try {
        const result = await foodsApi.updateFood(foodId, rest);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.tool(
    'delete_food',
    'DESTRUCTIVE and irreversible: permanently deletes a food. Use get_food first to verify this is the exact ' +
      'food intended. Deleting a food may affect recipes and shopping list items that reference it — Mealie may ' +
      'refuse the deletion in that case, leaving the food intact.',
    { foodId: z.string().describe('UUID of the food to delete.') },
    async ({ foodId }) => {
      try {
        const result = await foodsApi.deleteFood(foodId);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
