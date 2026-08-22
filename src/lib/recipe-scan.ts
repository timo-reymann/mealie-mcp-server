import * as recipesApi from '../api/recipes.js';

// Mealie's recipe list endpoint has no native "after" cursor, only page/perPage. Both the
// classification feed and the ingredient-parsing feed scan it ordered by createdAt (immutable,
// and new recipes always sort last) in pages of this size, re-sorting each page client-side by
// (createdAt, id) so ordering is deterministic even if the server's tie-break for equal
// timestamps is not. See encodeCursor/decodeCursor/scanRecipesStable below for how this is
// turned into a stable, self-correcting continuation token shared by both scanners.
export const SCAN_PAGE_SIZE = 50;

export interface TaxonomyItem {
  id: string;
  name: string;
  slug: string;
}

export class InvalidLimitError extends Error {
  constructor(limit: unknown, maxLimit: number) {
    super(`limit must be between 1 and ${maxLimit} (got ${JSON.stringify(limit)}).`);
    this.name = 'InvalidLimitError';
  }
}

export class InvalidCursorError extends Error {
  constructor(reason: string) {
    super(`Invalid cursor: ${reason}`);
    this.name = 'InvalidCursorError';
  }
}

export interface ScanCursor {
  v: 1;
  lastCreatedAt: string;
  lastId: string;
  page: number;
}

export function encodeCursor(cursor: ScanCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): ScanCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidCursorError('not valid base64url-encoded JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new InvalidCursorError('decoded payload is not an object.');
  }
  const c = parsed as Record<string, unknown>;
  if (c.v !== 1) {
    throw new InvalidCursorError('unsupported or missing cursor version.');
  }
  if (typeof c.lastCreatedAt !== 'string' || !c.lastCreatedAt) {
    throw new InvalidCursorError('missing or malformed lastCreatedAt.');
  }
  if (typeof c.lastId !== 'string' || !c.lastId) {
    throw new InvalidCursorError('missing or malformed lastId.');
  }
  if (typeof c.page !== 'number' || !Number.isInteger(c.page) || c.page < 1) {
    throw new InvalidCursorError('missing or malformed page.');
  }

  return { v: 1, lastCreatedAt: c.lastCreatedAt, lastId: c.lastId, page: c.page };
}

export function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

// Mealie ids are UUID strings, but this stays defensive against unexpected shapes rather than
// stringifying an object into "[object Object]".
export function idString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

export function toArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

export function toTaxonomyItem(raw: unknown): TaxonomyItem {
  const r = (raw ?? {}) as Record<string, unknown>;
  return { id: idString(r.id), name: str(r.name), slug: str(r.slug) };
}

export function compareScanPosition(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export interface ScannedRecipe {
  summary: Record<string, unknown>;
  createdAt: string;
  id: string;
  page: number;
}

/**
 * Walks the complete recipe collection in a stable order (createdAt asc, id as tie-breaker),
 * resuming from `startCursor` if given. New recipes always sort after everything already
 * scanned (createdAt only increases), so they never shift already-issued page positions.
 * Deletions/edits to already-scanned recipes are handled by re-fetching the cursor's page and
 * skipping everything at or before the cursor position, rather than trusting page arithmetic
 * blindly — so a recipe changing state between calls can never cause another recipe to be
 * skipped. Shared by every tool that needs a stable, resumable walk of the recipe collection
 * (currently `get_recipes_for_classification` and `get_recipes_for_ingredient_parsing`) — only
 * the per-recipe matching predicate differs between callers.
 */
export async function* scanRecipesStable(startCursor: ScanCursor | null): AsyncGenerator<ScannedRecipe, void, undefined> {
  let page = startCursor?.page ?? 1;
  let skipUntil: { createdAt: string; id: string } | null = startCursor
    ? { createdAt: startCursor.lastCreatedAt, id: startCursor.lastId }
    : null;

  for (;;) {
    const result = await recipesApi.getRecipes({
      page,
      perPage: SCAN_PAGE_SIZE,
      orderBy: 'createdAt',
      orderDirection: 'asc',
    });
    const items = result.items ?? [];
    if (items.length === 0) return;

    const normalized = items
      .map((raw) => ({
        raw,
        createdAt: str(raw.createdAt),
        id: idString(raw.id),
      }))
      .sort((a, b) => compareScanPosition(a, b));

    for (const entry of normalized) {
      if (skipUntil && compareScanPosition(entry, skipUntil) <= 0) continue;
      yield { summary: entry.raw, createdAt: entry.createdAt, id: entry.id, page };
    }

    skipUntil = null;

    const total = typeof result.total === 'number' ? result.total : undefined;
    const isLastPage = items.length < SCAN_PAGE_SIZE || (total !== undefined && page * SCAN_PAGE_SIZE >= total);
    if (isLastPage) return;
    page++;
  }
}
