import { apiGet, apiPost, apiPut, apiDelete, formatParams, MealieApiError, PaginatedResult } from './client.js';
import {
  lookupCandidates,
  LookupValidationError,
  DEFAULT_MAX_MATCHES_PER_QUERY,
  MAX_MATCHES_PER_QUERY_CAP,
  type MatchFieldSpec,
  type MultiQueryLookupResult,
} from '../lib/multi-query-lookup.js';

export interface CreateUnitInput {
  name: string;
  pluralName?: string;
  description?: string;
  abbreviation?: string;
  pluralAbbreviation?: string;
  useAbbreviation?: boolean;
  fraction?: boolean;
  aliases?: string[];
  standardQuantity?: number;
  standardUnit?: string;
}

export interface UpdateUnitInput {
  name?: string;
  pluralName?: string;
  description?: string;
  abbreviation?: string;
  pluralAbbreviation?: string;
  useAbbreviation?: boolean;
  fraction?: boolean;
  aliases?: string[];
  standardQuantity?: number | null;
  standardUnit?: string | null;
}

// Fields Mealie's PUT /api/units/{id} accepts (the CreateIngredientUnit shape). The GET response
// additionally includes response-only fields (createdAt, updatedAt) that must not be echoed back
// in an update payload. `id` IS part of CreateIngredientUnit (inherited from UnitFoodBase); it is
// carried forward defensively on every update, mirroring update_food, even though unit's model
// construction excludes `id` from the constructor kwargs it applies (unlike food's), so a null id
// is not actually written to the row for units — carrying it forward costs nothing and stays safe
// if that ever changes.
const UPDATABLE_UNIT_FIELDS = [
  'id',
  'name',
  'pluralName',
  'description',
  'extras',
  'fraction',
  'abbreviation',
  'pluralAbbreviation',
  'useAbbreviation',
  'aliases',
  'standardQuantity',
  'standardUnit',
] as const;

function toAliasPayload(aliases: string[]): { name: string }[] {
  return aliases.map((name) => ({ name }));
}

function wrapError(context: string, error: unknown): never {
  if (error instanceof Error) {
    throw new Error(`${context}: ${error.message}`, { cause: error });
  }
  throw new Error(`${context}: ${String(error)}`);
}

export async function getUnits(
  params?: { search?: string; page?: number; perPage?: number },
): Promise<PaginatedResult<Record<string, unknown>>> {
  try {
    return await apiGet<PaginatedResult<Record<string, unknown>>>(
      '/api/units',
      params ? formatParams(params) : undefined,
    );
  } catch (error) {
    wrapError('Unable to retrieve units', error);
  }
}

export async function getUnit(unitId: string): Promise<Record<string, unknown>> {
  const id = unitId?.trim();
  if (!id) {
    throw new Error('unitId is required.');
  }

  try {
    return await apiGet<Record<string, unknown>>(`/api/units/${id}`);
  } catch (error) {
    if (error instanceof MealieApiError && error.status === 404) {
      wrapError(`Unit not found: ${id}`, error);
    }
    wrapError(`Unable to retrieve unit ${id}`, error);
  }
}

export async function createUnit(input: CreateUnitInput): Promise<Record<string, unknown>> {
  const name = input.name?.trim();
  if (!name) {
    throw new Error('Unit name cannot be empty.');
  }

  const payload: Record<string, unknown> = { name };
  if (input.pluralName !== undefined) payload.pluralName = input.pluralName;
  if (input.description !== undefined) payload.description = input.description;
  if (input.abbreviation !== undefined) payload.abbreviation = input.abbreviation;
  if (input.pluralAbbreviation !== undefined) payload.pluralAbbreviation = input.pluralAbbreviation;
  if (input.useAbbreviation !== undefined) payload.useAbbreviation = input.useAbbreviation;
  if (input.fraction !== undefined) payload.fraction = input.fraction;
  if (input.aliases !== undefined) payload.aliases = toAliasPayload(input.aliases);
  if (input.standardQuantity !== undefined) payload.standardQuantity = input.standardQuantity;
  if (input.standardUnit !== undefined) payload.standardUnit = input.standardUnit;

  try {
    return await apiPost<Record<string, unknown>>('/api/units', payload);
  } catch (error) {
    wrapError('Unable to create unit', error);
  }
}

export async function updateUnit(
  unitId: string,
  input: UpdateUnitInput,
): Promise<Record<string, unknown>> {
  const id = unitId?.trim();
  if (!id) {
    throw new Error('unitId is required.');
  }

  if (
    input.name === undefined &&
    input.pluralName === undefined &&
    input.description === undefined &&
    input.abbreviation === undefined &&
    input.pluralAbbreviation === undefined &&
    input.useAbbreviation === undefined &&
    input.fraction === undefined &&
    input.aliases === undefined &&
    input.standardQuantity === undefined &&
    input.standardUnit === undefined
  ) {
    throw new Error('At least one field must be supplied for an update.');
  }

  try {
    const existing = await apiGet<Record<string, unknown>>(`/api/units/${id}`);

    // Mealie's PUT is a full replace of the CreateIngredientUnit shape, so fields the caller
    // didn't ask to change must be carried forward from the existing record.
    const payload: Record<string, unknown> = {};
    for (const field of UPDATABLE_UNIT_FIELDS) {
      if (field in existing) payload[field] = existing[field];
    }

    if (input.name !== undefined) payload.name = input.name;
    if (input.pluralName !== undefined) payload.pluralName = input.pluralName;
    if (input.description !== undefined) payload.description = input.description;
    if (input.abbreviation !== undefined) payload.abbreviation = input.abbreviation;
    if (input.pluralAbbreviation !== undefined) payload.pluralAbbreviation = input.pluralAbbreviation;
    if (input.useAbbreviation !== undefined) payload.useAbbreviation = input.useAbbreviation;
    if (input.fraction !== undefined) payload.fraction = input.fraction;
    if (input.aliases !== undefined) payload.aliases = toAliasPayload(input.aliases);
    if (input.standardQuantity !== undefined) payload.standardQuantity = input.standardQuantity;
    if (input.standardUnit !== undefined) payload.standardUnit = input.standardUnit;

    return await apiPut<Record<string, unknown>>(`/api/units/${id}`, payload);
  } catch (error) {
    if (error instanceof MealieApiError && error.status === 404) {
      wrapError(`Unit not found: ${id}`, error);
    }
    wrapError(`Unable to update unit ${id}`, error);
  }
}

// Priority order for get_unit_matches ranking, mirroring Mealie's own IngredientUnit search fields
// (name, pluralName, abbreviation, pluralAbbreviation) plus aliases, which that search never checks.
// Attribute paths are Mealie's queryFilter attribute-chain syntax; "aliases.name" traverses the unit's
// alias relationship (a real SQLAlchemy relationship, not an association proxy, so the join is valid).
const UNIT_MATCH_FIELDS: MatchFieldSpec[] = [
  { key: 'name', queryFilterAttr: 'name' },
  { key: 'pluralName', queryFilterAttr: 'pluralName' },
  { key: 'abbreviation', queryFilterAttr: 'abbreviation' },
  { key: 'pluralAbbreviation', queryFilterAttr: 'pluralAbbreviation' },
  { key: 'alias', queryFilterAttr: 'aliases.name', isAlias: true },
];

export async function getUnitMatches(
  queries: string[],
  options?: { maxMatchesPerQuery?: number },
): Promise<MultiQueryLookupResult> {
  const maxMatchesPerQuery = Math.min(
    Math.max(1, options?.maxMatchesPerQuery ?? DEFAULT_MAX_MATCHES_PER_QUERY),
    MAX_MATCHES_PER_QUERY_CAP,
  );

  try {
    return await lookupCandidates(queries, UNIT_MATCH_FIELDS, maxMatchesPerQuery, async (queryFilter, perPage) => {
      const result = await apiGet<PaginatedResult<Record<string, unknown>>>(
        '/api/units',
        formatParams({ queryFilter, perPage, page: 1 }),
      );
      return { items: result.items, total: result.total };
    });
  } catch (error) {
    if (error instanceof LookupValidationError) throw error;
    wrapError('Unable to look up unit matches', error);
  }
}

export async function deleteUnit(unitId: string): Promise<Record<string, unknown>> {
  const id = unitId?.trim();
  if (!id) {
    throw new Error('unitId is required.');
  }

  try {
    return await apiDelete<Record<string, unknown>>(`/api/units/${id}`);
  } catch (error) {
    if (error instanceof MealieApiError && error.status === 404) {
      wrapError(`Unit not found: ${id}`, error);
    }
    wrapError(
      `Unable to delete unit ${id}. If this unit is still referenced by existing recipe ingredients, ` +
        'Mealie will refuse to delete it',
      error,
    );
  }
}
