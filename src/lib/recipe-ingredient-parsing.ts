import * as recipesApi from '../api/recipes.js';
import { mapWithConcurrency, DEFAULT_DETAIL_FETCH_CONCURRENCY } from './concurrency.js';
import {
  scanRecipesStable,
  encodeCursor,
  decodeCursor,
  str,
  idString,
  toArray,
  toTaxonomyItem,
  InvalidCursorError,
  InvalidLimitError as SharedInvalidLimitError,
  type ScannedRecipe,
  type TaxonomyItem,
} from './recipe-scan.js';

export const INGREDIENT_PARSING_DEFAULT_LIMIT = 25;
export const INGREDIENT_PARSING_MAX_LIMIT = 50;
export const INGREDIENT_PARSING_DEFAULT_STATE: IngredientParsingQueryState = 'unparsed_only';

// Unlike classification (which can filter cheaply from the list endpoint's embedded
// recipeCategory/tags), Mealie's recipe list endpoint does not include recipeIngredient — the
// only way to know whether a recipe needs ingredient parsing is to fetch its full detail. That
// means detail must be fetched for every scanned recipe, not just matches, so the fetch happens
// in small concurrent batches while scanning (see DETAIL_FETCH_BATCH_SIZE below) instead of
// after a cheap pre-filter pass.
const DETAIL_FETCH_BATCH_SIZE = 20;

// Soft internal budget: because every scanned recipe requires a detail fetch (see above), a
// library where only a small fraction of recipes need parsing can take a while to accumulate a
// full page of matches. Stop and hand back a partial page with a cursor rather than risking an
// MCP gateway timeout.
const DEFAULT_DEADLINE_MS = 20_000;

function debugLog(...args: unknown[]): void {
  if (process.env.MEALIE_MCP_DEBUG === 'true') {
    // stdout is reserved for MCP JSON-RPC traffic; diagnostics must go to stderr.
    console.error('[get_recipes_for_ingredient_parsing]', ...args);
  }
}

export { InvalidCursorError };

export class InvalidLimitError extends SharedInvalidLimitError {
  constructor(limit: unknown) {
    super(limit, INGREDIENT_PARSING_MAX_LIMIT);
  }
}

/**
 * Which recipes to return, based purely on the deterministic per-ingredient `parsingState`
 * (see classifyIngredient below) — never on semantic interpretation of ingredient text:
 *  - "unparsed_only": at least one ingredient has no associated food (excluding section
 *    headings) — the strong, low-noise signal that a line still needs a food resolved.
 *  - "partially_parsed": at least one ingredient has a food but no unit (see classifyIngredient
 *    for the documented false-positive tradeoff this carries for legitimately unit-less
 *    countable foods like "4 eggs").
 *  - "any": no filtering — every scanned recipe is a "match", useful for auditing.
 */
export type IngredientParsingQueryState = 'unparsed_only' | 'partially_parsed' | 'any';

const INGREDIENT_PARSING_QUERY_STATES: readonly IngredientParsingQueryState[] = ['unparsed_only', 'partially_parsed', 'any'];

export class InvalidStateError extends Error {
  constructor(state: unknown) {
    super(`state must be one of ${INGREDIENT_PARSING_QUERY_STATES.map((s) => `"${s}"`).join(', ')} (got ${JSON.stringify(state)}).`);
    this.name = 'InvalidStateError';
  }
}

/**
 * Deterministic, schema-only classification of a single ingredient row. Mealie's RecipeIngredient
 * schema (confirmed against a live instance) exposes no explicit "isFood"/"disableAmount"/
 * "freeform" flag — only `title`, `quantity`, `unit`, `food`, `note`, `display`, `originalText`,
 * and `referenceId` are actually present on read. So the only reliable, non-linguistic signals
 * available are field *presence*, not text content:
 *  - "section": `title` is non-empty. This is Mealie's own documented mechanism for ingredient
 *    section headers (e.g. "For the sauce") — a heading row normally carries no food/unit/note of
 *    its own. Section rows are never counted as needing parsing.
 *  - "unparsed": `title` is empty and `food` is null. This is the primary, high-confidence signal
 *    the tool is built around — Mealie itself has not linked this line to any food.
 *  - "partial": `food` is present but `unit` is null and `quantity` is a positive number. KNOWN,
 *    DOCUMENTED LIMITATION: this cannot be distinguished, without linguistic parsing of the
 *    ingredient text, from a fully-and-correctly-structured count-based ingredient that simply
 *    has no unit (e.g. "4 eggs", "2 lemons", "1 pie crust" — all observed as unit: null on a real
 *    Mealie instance despite being completely resolved). Expect false positives here; treat
 *    "partial" as a coarse audit signal, not a confirmed defect.
 *  - "structured": food is present and either a unit is present, or quantity is not a positive
 *    number (e.g. a garnish like "avocado, diced, for serving" with no meaningful quantity).
 *
 * `originalText` was investigated as a potential "this came from unparsed source text" signal but
 * discarded: on a live instance it was null on every observed ingredient, both fully structured
 * and completely unparsed alike — imported/scraped recipes put the raw line straight into `note`/
 * `display` instead. It is not a reliable signal and is not used for classification.
 *
 * "free_form" (a deliberately non-food entry, e.g. "extra napkins") was in scope to investigate
 * but is NOT implemented as a distinct state: nothing in the schema distinguishes it from a
 * genuinely unparsed food ingredient (both are food: null, title: empty, with text in note/
 * display). Rather than fabricate a distinction the data doesn't support, such rows are
 * classified as "unparsed" like any other food-less ingredient — conservative in the sense that
 * a recipe with only a couple of deliberately free-form lines will still surface for review
 * rather than being silently skipped.
 */
export type IngredientState = 'section' | 'unparsed' | 'partial' | 'structured';

export interface CompactRef {
  id: string;
  name: string;
}

export interface CompactIngredient {
  referenceId: string;
  quantity: number | null;
  unit: CompactRef | null;
  food: CompactRef | null;
  note: string;
  display: string;
  originalText: string | null;
  title: string | null;
  parsingState: IngredientState;
}

export interface CompactInstruction {
  id?: string;
  title: string;
  text: string;
  ingredientReferences: unknown[];
}

export interface IngredientParsingCounts {
  totalCount: number;
  structuredCount: number;
  partialCount: number;
  unparsedCount: number;
  sectionCount: number;
}

export interface RecipeForIngredientParsing {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  categories: TaxonomyItem[];
  tags: TaxonomyItem[];
  totalTime: string | null;
  prepTime: string | null;
  cookTime: string | null;
  servings: number | null;
  yield: string | null;
  ingredients: CompactIngredient[];
  instructions: CompactInstruction[];
  ingredientParsingState: IngredientParsingCounts;
}

export interface IngredientParsingFailure {
  slug?: string;
  id?: string;
  error: string;
}

export interface IngredientParsingPage {
  items: RecipeForIngredientParsing[];
  failures: IngredientParsingFailure[];
  nextCursor: string | null;
  scannedCount: number;
  returnedCount: number;
  hasMore: boolean;
}

export interface GetRecipesForIngredientParsingInput {
  cursor?: string;
  limit?: number;
  state?: IngredientParsingQueryState;
}

function toCompactRef(raw: unknown): CompactRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return { id: idString(r.id), name: str(r.name) };
}

function classifyIngredient(raw: Record<string, unknown>): IngredientState {
  if (str(raw.title)) return 'section';

  const hasFood = raw.food !== null && raw.food !== undefined && typeof raw.food === 'object';
  if (!hasFood) return 'unparsed';

  const hasUnit = raw.unit !== null && raw.unit !== undefined && typeof raw.unit === 'object';
  const quantity = typeof raw.quantity === 'number' ? raw.quantity : null;
  if (!hasUnit && quantity !== null && quantity > 0) return 'partial';

  return 'structured';
}

function toCompactIngredient(raw: Record<string, unknown>): CompactIngredient {
  return {
    referenceId: idString(raw.referenceId),
    quantity: typeof raw.quantity === 'number' ? raw.quantity : null,
    unit: toCompactRef(raw.unit),
    food: toCompactRef(raw.food),
    note: str(raw.note),
    display: str(raw.display),
    originalText: str(raw.originalText) || null,
    title: str(raw.title) || null,
    parsingState: classifyIngredient(raw),
  };
}

function toCompactInstruction(raw: Record<string, unknown>): CompactInstruction {
  const id = str(raw.id);
  return {
    ...(id ? { id } : {}),
    title: str(raw.title),
    text: str(raw.text),
    ingredientReferences: Array.isArray(raw.ingredientReferences) ? raw.ingredientReferences : [],
  };
}

function countIngredientStates(ingredients: CompactIngredient[]): IngredientParsingCounts {
  const counts: IngredientParsingCounts = {
    totalCount: ingredients.length,
    structuredCount: 0,
    partialCount: 0,
    unparsedCount: 0,
    sectionCount: 0,
  };
  for (const ingredient of ingredients) {
    switch (ingredient.parsingState) {
      case 'structured':
        counts.structuredCount++;
        break;
      case 'partial':
        counts.partialCount++;
        break;
      case 'unparsed':
        counts.unparsedCount++;
        break;
      case 'section':
        counts.sectionCount++;
        break;
    }
  }
  return counts;
}

function matchesQueryState(counts: IngredientParsingCounts, state: IngredientParsingQueryState): boolean {
  switch (state) {
    case 'any':
      return true;
    case 'unparsed_only':
      return counts.unparsedCount > 0;
    case 'partially_parsed':
      return counts.partialCount > 0;
    default: {
      const exhaustive: never = state;
      throw new Error(`Unsupported state: ${String(exhaustive)}`);
    }
  }
}

function toCompactRecipe(raw: Record<string, unknown>): RecipeForIngredientParsing {
  const ingredients = toArray(raw.recipeIngredient).map(toCompactIngredient);
  const instructions = toArray(raw.recipeInstructions).map(toCompactInstruction);
  return {
    id: idString(raw.id),
    slug: str(raw.slug),
    name: str(raw.name),
    description: str(raw.description) || null,
    categories: toArray(raw.recipeCategory).map(toTaxonomyItem),
    tags: toArray(raw.tags).map(toTaxonomyItem),
    totalTime: str(raw.totalTime) || null,
    prepTime: str(raw.prepTime) || null,
    cookTime: str(raw.cookTime) || null,
    servings: typeof raw.recipeServings === 'number' ? raw.recipeServings : null,
    yield: str(raw.recipeYield) || null,
    ingredients,
    instructions,
    ingredientParsingState: countIngredientStates(ingredients),
  };
}

interface ClockOptions {
  now?: () => number;
  deadlineMs?: number;
}

function validateLimit(limit: number | undefined): number {
  if (limit === undefined) return INGREDIENT_PARSING_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > INGREDIENT_PARSING_MAX_LIMIT) {
    throw new InvalidLimitError(limit);
  }
  return limit;
}

function validateState(state: IngredientParsingQueryState | undefined): IngredientParsingQueryState {
  if (state === undefined) return INGREDIENT_PARSING_DEFAULT_STATE;
  if (!INGREDIENT_PARSING_QUERY_STATES.includes(state)) {
    throw new InvalidStateError(state);
  }
  return state;
}

async function pullBatch(iterator: AsyncGenerator<ScannedRecipe, void, undefined>, size: number): Promise<ScannedRecipe[]> {
  const batch: ScannedRecipe[] = [];
  for (let i = 0; i < size; i++) {
    const { value, done } = await iterator.next();
    if (done) break;
    batch.push(value);
  }
  return batch;
}

interface DetailFetchResult {
  entry: ScannedRecipe;
  success: boolean;
  detail?: Record<string, unknown>;
  slug?: string;
  error?: string;
}

/**
 * Read-only, paginated work queue of recipes whose ingredients may need structured parsing. The
 * MCP server does NOT parse ingredient text or interpret it semantically — it only reports each
 * ingredient's already-existing structured state (see classifyIngredient) so the calling model
 * can do the interpretation and later write a complete collection via update_recipe_ingredients.
 *
 * Unlike get_recipes_for_classification, this cannot pre-filter from the cheap list response —
 * Mealie's /api/recipes list endpoint does not include recipeIngredient, so every scanned recipe
 * needs a detail fetch to know whether it matches. Detail fetches happen in small batches
 * (DETAIL_FETCH_BATCH_SIZE) with bounded concurrency while scanning, rather than loading the
 * whole collection into memory or firing every request at once.
 */
export async function getRecipesForIngredientParsing(
  input: GetRecipesForIngredientParsingInput,
  clock: ClockOptions = {},
): Promise<IngredientParsingPage> {
  const limit = validateLimit(input.limit);
  const state = validateState(input.state);
  const startCursor = input.cursor ? decodeCursor(input.cursor) : null;

  const now = clock.now ?? Date.now;
  const deadline = now() + (clock.deadlineMs ?? DEFAULT_DEADLINE_MS);

  const iterator = scanRecipesStable(startCursor);
  const matched: RecipeForIngredientParsing[] = [];
  const failures: IngredientParsingFailure[] = [];
  let scannedCount = 0;
  let lastScanned: ScannedRecipe | null = null;
  let stopReason: 'limit' | 'deadline' | 'exhausted' = 'exhausted';

  const scanStartedAt = now();

  outer: for (;;) {
    const batch = await pullBatch(iterator, DETAIL_FETCH_BATCH_SIZE);
    if (batch.length === 0) {
      stopReason = 'exhausted';
      break;
    }

    const results = await mapWithConcurrency<ScannedRecipe, DetailFetchResult>(
      batch,
      DEFAULT_DETAIL_FETCH_CONCURRENCY,
      async (entry) => {
        const slug = str(entry.summary.slug) || entry.id;
        try {
          const detail = await recipesApi.getRecipe(slug);
          return { entry, success: true, detail };
        } catch (error) {
          return {
            entry,
            success: false,
            slug: slug || undefined,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    );

    for (const result of results) {
      scannedCount++;
      lastScanned = result.entry;

      if (!result.success || !result.detail) {
        failures.push({ slug: result.slug, id: result.entry.id || undefined, error: result.error ?? 'Unknown error' });
        continue;
      }

      const compact = toCompactRecipe(result.detail);
      if (matchesQueryState(compact.ingredientParsingState, state)) {
        matched.push(compact);
      }

      if (matched.length >= limit) {
        stopReason = 'limit';
        break outer;
      }
    }

    if (now() > deadline) {
      stopReason = 'deadline';
      break;
    }
  }

  debugLog('scan phase', {
    ms: now() - scanStartedAt,
    scannedCount,
    matchedCount: matched.length,
    failureCount: failures.length,
    stopReason,
  });

  const hasMore = stopReason !== 'exhausted';
  const nextCursor =
    hasMore && lastScanned
      ? encodeCursor({ v: 1, lastCreatedAt: lastScanned.createdAt, lastId: lastScanned.id, page: lastScanned.page })
      : null;

  return {
    items: matched,
    failures,
    nextCursor,
    scannedCount,
    returnedCount: matched.length,
    hasMore,
  };
}
