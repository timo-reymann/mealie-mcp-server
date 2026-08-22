import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as unitsApi from '../api/units.js';
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
    'Alternate names Mealie should also recognize for this unit (e.g. "tbsp" or "tbs" as aliases for ' +
      '"tablespoon"), given as plain strings — converted internally to the alias object shape Mealie expects. ' +
      'Note: aliases are not matched by get_units\' search — search only matches name, pluralName, ' +
      'abbreviation, and pluralAbbreviation.',
  );

const standardQuantityParamSchema = z
  .number()
  .describe(
    'How many standardUnit this unit is equivalent to (e.g. a tablespoon might have standardQuantity 0.5 with ' +
      'standardUnit "fluid_ounce"). Used only by Mealie\'s own shopping-list item merging to combine quantities ' +
      'across differently-expressed but equivalent units — this tool does not compute or validate conversions. ' +
      'Must be provided together with standardUnit: supplying only one causes Mealie to silently clear both.',
  );

const standardUnitParamSchema = z
  .string()
  .describe(
    'The reference unit standardQuantity is expressed in, as a plain string Mealie\'s conversion library (pint) ' +
      'can parse (e.g. "fluid_ounce", "cup", "gram"). Must be provided together with standardQuantity: supplying ' +
      'only one causes Mealie to silently clear both.',
  );

export function registerUnitTools(server: McpServer): void {
  server.tool(
    'get_units',
    'Search or list canonical Mealie ingredient units (e.g. "tablespoon", "cup", "gram") with plain pagination. ' +
      'Use this after interpreting an ingredient\'s unit text (e.g. deciding that "tbsp" in "2 tbsp olive oil" ' +
      'means tablespoon) to resolve the existing Mealie unit and its ID for use with update_recipe_ingredients. ' +
      'This tool does not parse ingredient language or infer units from free text — search matches only ' +
      'against existing unit name, pluralName, abbreviation, and pluralAbbreviation, not aliases. For resolving ' +
      'several already-interpreted unit concepts at once, and for alias-aware matching, prefer get_unit_matches.',
    {
      search: z
        .string()
        .optional()
        .describe('Matches against unit name, pluralName, abbreviation, and pluralAbbreviation, per Mealie\'s search behavior.'),
      page: z.number().optional(),
      perPage: z.number().optional(),
    },
    async (params) => {
      try {
        const result = await unitsApi.getUnits(params);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.tool(
    'get_unit',
    'Retrieves a single canonical Mealie ingredient unit by ID, including its aliases, abbreviations, and ' +
      'standard-quantity conversion metadata when present.',
    { unitId: z.string().describe('UUID of the unit to retrieve.') },
    async ({ unitId }) => {
      try {
        const result = await unitsApi.getUnit(unitId);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.tool(
    'get_unit_matches',
    'Finds existing canonical Mealie unit candidates for multiple already-interpreted unit concepts in one ' +
      'call, matching against names, plural names, abbreviations, plural abbreviations, and stored aliases ' +
      '(which get_units\' search does not check). Use after interpreting unit text (e.g. an LLM parsing "2 tbsp ' +
      'olive oil" into unit=tablespoon) and before calling create_unit, to check whether a matching unit or ' +
      'alias already exists. Returns ranked candidates per query rather than choosing one — the caller decides ' +
      'which candidate (if any) to use. Each query\'s result includes truncated: true when additional matching ' +
      'candidates may exist beyond the returned items (either because there were more than ' +
      'maxMatchesPerQuery, or because Mealie\'s own retrieval for that query was itself incomplete) — narrow ' +
      'the query text or raise maxMatchesPerQuery if that matters for a given lookup. Does not parse ' +
      'ingredient text, does not perform fuzzy/semantic matching, and does not create, update, or otherwise ' +
      'modify any unit or alias.',
    {
      queries: z
        .array(z.string().trim().min(1, 'Queries cannot be blank.').max(MAX_QUERY_LENGTH))
        .min(1)
        .max(MAX_QUERIES_PER_CALL)
        .describe(
          `Unit concepts to resolve, e.g. ["tablespoon", "ounce", "cup"]. 1-${MAX_QUERIES_PER_CALL} plain ` +
            'lookup strings (not search syntax) — duplicates (case-insensitive) are resolved once but still ' +
            'returned once per input entry.',
        ),
      maxMatchesPerQuery: z
        .number()
        .int()
        .min(1)
        .max(MAX_MATCHES_PER_QUERY_CAP)
        .optional()
        .describe(
          `Maximum ranked candidates to return per query (default ${DEFAULT_MAX_MATCHES_PER_QUERY}, capped at ` +
            `${MAX_MATCHES_PER_QUERY_CAP}). Strongest matches (exact name/pluralName/abbreviation/` +
            'pluralAbbreviation/alias, then substring matches) are kept first when a query has more candidates ' +
            'than this.',
        ),
    },
    async ({ queries, maxMatchesPerQuery }) => {
      try {
        const result = await unitsApi.getUnitMatches(queries, { maxMatchesPerQuery });
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.tool(
    'create_unit',
    'Creates a canonical Mealie ingredient unit when an appropriate unit does not already exist. Call ' +
      'get_units first to check whether an existing unit or alias already covers this name — creating a ' +
      'duplicate unit fragments the vocabulary instead of reusing what is already there. Note: if the new ' +
      'unit\'s name/abbreviation matches one of Mealie\'s built-in standardized units (e.g. "tablespoon"), ' +
      'Mealie will automatically populate standardQuantity/standardUnit itself unless both are explicitly ' +
      'supplied here — this tool does not perform that matching itself.',
    {
      name: z.string().describe('Name of the new unit. Cannot be blank.'),
      pluralName: z.string().optional().describe('Plural form of the name, if different.'),
      description: z.string().optional(),
      abbreviation: z.string().optional().describe('Short form used for display when useAbbreviation is true (e.g. "tbsp").'),
      pluralAbbreviation: z
        .string()
        .optional()
        .describe('Plural form of abbreviation, used for display when useAbbreviation is true and quantity > 1.'),
      useAbbreviation: z
        .boolean()
        .optional()
        .describe('Whether Mealie should render this unit using its abbreviation instead of its name. Display-only; does not affect matching or search.'),
      fraction: z
        .boolean()
        .optional()
        .describe('Whether Mealie should render this unit\'s quantity as a fraction (e.g. "1 1/2") instead of a decimal. Display-only.'),
      aliases: aliasesParamSchema.optional(),
      standardQuantity: standardQuantityParamSchema.optional(),
      standardUnit: standardUnitParamSchema.optional(),
    },
    async (params) => {
      try {
        const result = await unitsApi.createUnit(params);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.tool(
    'update_unit',
    'Updates an existing canonical Mealie ingredient unit. Fields left unspecified keep their current value. ' +
      'Sufficient for adding an alias: get_unit the current record, append to its existing aliases, and pass ' +
      'the complete list back here. Units are shared vocabulary referenced by many recipes\' ingredients — ' +
      'update deliberately, since renaming or repurposing a unit changes how every recipe using it displays.',
    {
      unitId: z.string().describe('UUID of the unit to update.'),
      name: z.string().optional(),
      pluralName: z.string().optional(),
      description: z.string().optional(),
      abbreviation: z.string().optional(),
      pluralAbbreviation: z.string().optional(),
      useAbbreviation: z.boolean().optional(),
      fraction: z.boolean().optional(),
      aliases: aliasesParamSchema
        .optional()
        .describe(
          aliasesParamSchema.description +
            ' Replaces the unit\'s entire alias collection when provided — pass an empty array to clear all ' +
            'aliases, or omit this field entirely to leave existing aliases untouched.',
        ),
      standardQuantity: standardQuantityParamSchema
        .nullable()
        .optional()
        .describe(standardQuantityParamSchema.description + ' Pass null (together with standardUnit: null) to clear both.'),
      standardUnit: standardUnitParamSchema
        .nullable()
        .optional()
        .describe(standardUnitParamSchema.description + ' Pass null (together with standardQuantity: null) to clear both.'),
    },
    async ({ unitId, ...rest }) => {
      try {
        const result = await unitsApi.updateUnit(unitId, rest);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.tool(
    'delete_unit',
    'DESTRUCTIVE and irreversible: permanently deletes a canonical Mealie ingredient unit. Use get_unit first ' +
      'to verify this is the exact unit intended. Deleting a unit that is still referenced by existing recipe ' +
      'ingredients will be refused by Mealie rather than cascaded.',
    { unitId: z.string().describe('UUID of the unit to delete.') },
    async ({ unitId }) => {
      try {
        const result = await unitsApi.deleteUnit(unitId);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
