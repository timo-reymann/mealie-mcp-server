// Shared engine behind get_food_matches/get_unit_matches: resolves a batch of caller-supplied lookup
// strings to Mealie candidate entities using a small, bounded number of `queryFilter` requests instead
// of one request per query. See query-filter.ts for how a single request's filter is built and
// candidate-matching.ts for how matches are classified/ranked once fetched.
//
// Strategy: dedupe queries (case-insensitively), split the deduped set into chunks, fetch each chunk's
// candidate union with one combined-OR `queryFilter` request, then classify every original input query
// (including duplicates) against the union of all successfully-fetched candidates. A chunk that fails
// only blanks out the queries that chunk alone was responsible for; other chunks' results still return.
import { mapWithConcurrency } from './concurrency.js';
import { buildCombinedLikeFilter, sanitizeForLikeFilter, type MatchFieldFilter } from './query-filter.js';
import { classifyAndRank, type MatchField, type MatchInfo } from './candidate-matching.js';

export const MAX_QUERIES_PER_CALL = 25;
export const MAX_QUERY_LENGTH = 200;
export const DEFAULT_MAX_MATCHES_PER_QUERY = 10;
export const MAX_MATCHES_PER_QUERY_CAP = 25;

const QUERIES_PER_REQUEST = 10;
const CANDIDATE_POOL_SIZE = 200;
const REQUEST_CONCURRENCY = 4;

export interface FetchCandidatesResult {
  items: Record<string, unknown>[];
  total: number;
}

export interface MatchFieldSpec extends MatchField, MatchFieldFilter {}

export interface QueryMatchResult {
  query: string;
  items: (Record<string, unknown> & MatchInfo)[];
  /**
   * True when additional matching candidates may exist beyond `items`, for either reason: the ranked
   * candidate list was longer than `maxMatchesPerQuery` and got capped, or the underlying Mealie
   * `queryFilter` request itself came back paginated short (its own candidate pool was incomplete).
   * Callers should treat both cases identically — `items` is not necessarily the full candidate set.
   */
  truncated: boolean;
  error?: string;
}

export interface MultiQueryLookupResult {
  matches: QueryMatchResult[];
  queryCount: number;
  uniqueQueryCount: number;
  matchedCount: number;
  apiRequestCount: number;
}

/** Thrown for bad caller input (as opposed to an upstream Mealie/network failure). */
export class LookupValidationError extends Error {}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export async function lookupCandidates(
  queries: string[],
  fields: MatchFieldSpec[],
  maxMatchesPerQuery: number,
  fetchCandidates: (queryFilter: string, perPage: number) => Promise<FetchCandidatesResult>,
): Promise<MultiQueryLookupResult> {
  if (queries.length === 0) {
    throw new LookupValidationError('At least one query is required.');
  }
  if (queries.length > MAX_QUERIES_PER_CALL) {
    throw new LookupValidationError(
      `At most ${MAX_QUERIES_PER_CALL} queries are allowed per call (got ${queries.length}).`,
    );
  }

  const trimmedQueries = queries.map((q) => q.trim());
  if (trimmedQueries.some((q) => q.length === 0)) {
    throw new LookupValidationError('Queries cannot be blank.');
  }
  if (trimmedQueries.some((q) => q.length > MAX_QUERY_LENGTH)) {
    throw new LookupValidationError(`Each query must be at most ${MAX_QUERY_LENGTH} characters.`);
  }

  // Dedupe case-insensitively: identical-but-differently-cased queries produce identical LIKE clauses
  // (matching is already case-insensitive), so there's no reason to search for both.
  const dedupKeyFor = (q: string) => q.toLowerCase();
  const uniqueByKey = new Map<string, string>(); // dedup key -> representative original (sanitized-safe) query
  for (const q of trimmedQueries) {
    const key = dedupKeyFor(q);
    if (!uniqueByKey.has(key)) uniqueByKey.set(key, q);
  }

  const uniqueEntries = [...uniqueByKey.entries()]; // [dedupKey, representativeQuery][]
  const requestChunks = chunk(uniqueEntries, QUERIES_PER_REQUEST);

  const chunkResults = await mapWithConcurrency(requestChunks, REQUEST_CONCURRENCY, async (entries) => {
    const sanitized = entries.map(([, q]) => sanitizeForLikeFilter(q));
    const filter = buildCombinedLikeFilter(fields, sanitized);

    // Every query in this chunk sanitized down to nothing (e.g. a query of only `"`/`%`/`_` characters)
    // — there's nothing to search for, so skip the request rather than sending an empty/invalid filter.
    if (!filter) {
      return {
        ok: true as const,
        requested: false,
        keys: entries.map(([key]) => key),
        items: [] as Record<string, unknown>[],
        truncated: false,
      };
    }

    try {
      const result = await fetchCandidates(filter, CANDIDATE_POOL_SIZE);
      return {
        ok: true as const,
        requested: true,
        keys: entries.map(([key]) => key),
        items: result.items,
        truncated: result.total > result.items.length,
      };
    } catch (error) {
      return {
        ok: false as const,
        requested: true,
        keys: entries.map(([key]) => key),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  const candidatesById = new Map<string, Record<string, unknown>>();
  const failedKeys = new Map<string, string>(); // dedup key -> error message
  // Keys whose chunk's Mealie response was itself paginated/cut off, meaning that chunk's candidate
  // pool may be missing rows. This is one of two independent reasons a query's public `truncated` can
  // end up true — the other, checked below once the full ranked list is known, is this tool's own
  // maxMatchesPerQuery cap.
  const truncatedKeys = new Set<string>();
  let apiRequestCount = 0;

  for (const result of chunkResults) {
    if (result.requested) apiRequestCount += 1;
    if (!result.ok) {
      for (const key of result.keys) failedKeys.set(key, result.error);
      continue;
    }
    if (result.truncated) {
      for (const key of result.keys) truncatedKeys.add(key);
    }
    for (const item of result.items) {
      const id = typeof item.id === 'string' ? item.id : JSON.stringify(item);
      candidatesById.set(id, item);
    }
  }

  const candidatePool = [...candidatesById.values()];

  const matches: QueryMatchResult[] = trimmedQueries.map((query) => {
    const key = dedupKeyFor(query);
    const failure = failedKeys.get(key);
    if (failure) {
      return { query, items: [], truncated: false, error: `Candidate lookup failed for this query: ${failure}` };
    }

    const ranked = classifyAndRank(candidatePool, fields, query);
    const retrievalIncomplete = truncatedKeys.has(key);
    const cappedByMaxMatches = ranked.length > maxMatchesPerQuery;
    return {
      query,
      items: ranked.slice(0, maxMatchesPerQuery),
      truncated: retrievalIncomplete || cappedByMaxMatches,
    };
  });

  return {
    matches,
    queryCount: trimmedQueries.length,
    uniqueQueryCount: uniqueEntries.length,
    matchedCount: matches.filter((m) => m.items.length > 0).length,
    apiRequestCount,
  };
}
