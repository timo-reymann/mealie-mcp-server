import { describe, it, expect, vi } from 'vitest';
import {
  lookupCandidates,
  LookupValidationError,
  MAX_QUERIES_PER_CALL,
  MAX_QUERY_LENGTH,
  type MatchFieldSpec,
  type FetchCandidatesResult,
} from '../lib/multi-query-lookup.js';

const fields: MatchFieldSpec[] = [
  { key: 'name', queryFilterAttr: 'name' },
  { key: 'alias', queryFilterAttr: 'aliases.name', isAlias: true },
];

function item(id: string, name: string): Record<string, unknown> {
  return { id, name, aliases: [] };
}

describe('lookupCandidates — validation', () => {
  it('rejects an empty query list', async () => {
    await expect(lookupCandidates([], fields, 10, vi.fn())).rejects.toThrow(LookupValidationError);
  });

  it('rejects more than the maximum number of queries', async () => {
    const tooMany = Array.from({ length: MAX_QUERIES_PER_CALL + 1 }, (_, i) => `q${i}`);
    await expect(lookupCandidates(tooMany, fields, 10, vi.fn())).rejects.toThrow(
      new RegExp(`At most ${MAX_QUERIES_PER_CALL}`),
    );
  });

  it('rejects a blank query', async () => {
    await expect(lookupCandidates(['basil', '   '], fields, 10, vi.fn())).rejects.toThrow(/cannot be blank/);
  });

  it('rejects an overly long query', async () => {
    await expect(lookupCandidates(['a'.repeat(MAX_QUERY_LENGTH + 1)], fields, 10, vi.fn())).rejects.toThrow(
      /at most \d+ characters/,
    );
  });

  it('does not call fetchCandidates when validation fails', async () => {
    const fetchCandidates = vi.fn();
    await expect(lookupCandidates([], fields, 10, fetchCandidates)).rejects.toThrow();
    expect(fetchCandidates).not.toHaveBeenCalled();
  });
});

describe('lookupCandidates — deduplication and efficiency', () => {
  it('does not call fetchCandidates once per query — a small batch collapses into one request', async () => {
    const fetchCandidates = vi.fn(
      (): Promise<FetchCandidatesResult> => Promise.resolve({
        items: [item('1', 'basil'), item('2', 'garlic')],
        total: 2,
      }),
    );

    const result = await lookupCandidates(['basil', 'olive oil', 'garlic', 'som moo', 'broccoli'], fields, 10, fetchCandidates);

    expect(fetchCandidates).toHaveBeenCalledTimes(1);
    expect(result.apiRequestCount).toBe(1);
    expect(result.queryCount).toBe(5);
  });

  it('deduplicates case-insensitively before building requests, but returns one entry per input query', async () => {
    const fetchCandidates = vi.fn(
      (): Promise<FetchCandidatesResult> => Promise.resolve({ items: [item('1', 'basil')], total: 1 }),
    );

    const result = await lookupCandidates(['Basil', 'basil', 'BASIL'], fields, 10, fetchCandidates);

    expect(fetchCandidates).toHaveBeenCalledTimes(1);
    expect(result.uniqueQueryCount).toBe(1);
    expect(result.queryCount).toBe(3);
    expect(result.matches).toHaveLength(3);
    expect(result.matches.map((m) => m.query)).toEqual(['Basil', 'basil', 'BASIL']);
    for (const match of result.matches) {
      expect(match.items).toHaveLength(1);
    }
  });

  it('chunks a large deduplicated batch into a bounded number of requests', async () => {
    const uniqueQueries = Array.from({ length: 25 }, (_, i) => `food-${i}`);
    const fetchCandidates = vi.fn((): Promise<FetchCandidatesResult> => Promise.resolve({ items: [], total: 0 }));

    const result = await lookupCandidates(uniqueQueries, fields, 10, fetchCandidates);

    // 25 unique queries at 10 per request -> 3 requests, not 25.
    expect(fetchCandidates).toHaveBeenCalledTimes(3);
    expect(result.apiRequestCount).toBe(3);
  });

  it('builds a combined queryFilter covering every field for every query in a request', async () => {
    const fetchCandidates = vi.fn((): Promise<FetchCandidatesResult> => Promise.resolve({ items: [], total: 0 }));
    await lookupCandidates(['basil', 'garlic'], fields, 10, fetchCandidates);

    const [filterArg] = fetchCandidates.mock.calls[0];
    expect(filterArg).toContain('name LIKE "%basil%"');
    expect(filterArg).toContain('aliases.name LIKE "%basil%"');
    expect(filterArg).toContain('name LIKE "%garlic%"');
    expect(filterArg).toContain('aliases.name LIKE "%garlic%"');
  });

  it('skips the request entirely when every query in the batch sanitizes to nothing', async () => {
    const fetchCandidates = vi.fn();
    const result = await lookupCandidates(['"""', '%%%'], fields, 10, fetchCandidates);

    expect(fetchCandidates).not.toHaveBeenCalled();
    expect(result.apiRequestCount).toBe(0);
    expect(result.matches.every((m) => m.items.length === 0)).toBe(true);
  });
});

describe('lookupCandidates — partial failure handling', () => {
  it('keeps successful chunks\' matches when a different chunk fails', async () => {
    const queriesA = Array.from({ length: 10 }, (_, i) => `a-${i}`); // first chunk
    const queriesB = ['b-broken']; // second chunk

    const fetchCandidates = vi.fn((queryFilter: string): Promise<FetchCandidatesResult> => {
      if (queryFilter.includes('b-broken')) {
        return Promise.reject(new Error('upstream 500'));
      }
      return Promise.resolve({ items: [item('1', 'a-0')], total: 1 });
    });

    const result = await lookupCandidates([...queriesA, ...queriesB], fields, 10, fetchCandidates);

    expect(fetchCandidates).toHaveBeenCalledTimes(2);
    expect(result.apiRequestCount).toBe(2);

    const goodMatch = result.matches.find((m) => m.query === 'a-0')!;
    expect(goodMatch.error).toBeUndefined();
    expect(goodMatch.items).toHaveLength(1);

    const failedMatch = result.matches.find((m) => m.query === 'b-broken')!;
    expect(failedMatch.error).toMatch(/upstream 500/);
    expect(failedMatch.items).toEqual([]);
  });
});

describe('lookupCandidates — candidate pool limits and the public `truncated` flag', () => {
  // `truncated` must mean "items is not necessarily the full candidate set", true whenever EITHER the
  // ranked list was longer than maxMatchesPerQuery and got capped, OR the underlying Mealie retrieval
  // for that query's chunk was itself paginated short — never only the latter (see multi-query-lookup.ts).

  it('caps each query\'s results at maxMatchesPerQuery, keeping the strongest matches, and reports truncated: true', async () => {
    const many = Array.from({ length: 5 }, (_, i) => item(`${i}`, `zzz-basil-${i}`));
    many.push(item('exact', 'basil'));
    const fetchCandidates = vi.fn((): Promise<FetchCandidatesResult> => Promise.resolve({ items: many, total: many.length }));

    const result = await lookupCandidates(['basil'], fields, 3, fetchCandidates);

    expect(result.matches[0].items).toHaveLength(3);
    expect(result.matches[0].items[0].id).toBe('exact'); // exact match ranked first, so never trimmed away
    expect(result.matches[0].truncated).toBe(true);
  });

  it('reports truncated: false when the candidate count is exactly maxMatchesPerQuery', async () => {
    const exact = Array.from({ length: 3 }, (_, i) => item(`${i}`, `basil-${i}`));
    const fetchCandidates = vi.fn((): Promise<FetchCandidatesResult> => Promise.resolve({ items: exact, total: exact.length }));

    const result = await lookupCandidates(['basil'], fields, 3, fetchCandidates);

    expect(result.matches[0].items).toHaveLength(3);
    expect(result.matches[0].truncated).toBe(false);
  });

  it('reports truncated: true when the candidate count is exactly one more than maxMatchesPerQuery', async () => {
    const overByOne = Array.from({ length: 4 }, (_, i) => item(`${i}`, `basil-${i}`));
    const fetchCandidates = vi.fn((): Promise<FetchCandidatesResult> => Promise.resolve({ items: overByOne, total: overByOne.length }));

    const result = await lookupCandidates(['basil'], fields, 3, fetchCandidates);

    expect(result.matches[0].items).toHaveLength(3);
    expect(result.matches[0].truncated).toBe(true);
  });

  it('reports truncated: false when the candidate count is below maxMatchesPerQuery', async () => {
    const fewer = Array.from({ length: 2 }, (_, i) => item(`${i}`, `basil-${i}`));
    const fetchCandidates = vi.fn((): Promise<FetchCandidatesResult> => Promise.resolve({ items: fewer, total: fewer.length }));

    const result = await lookupCandidates(['basil'], fields, 10, fetchCandidates);

    expect(result.matches[0].items).toHaveLength(2);
    expect(result.matches[0].truncated).toBe(false);
  });

  it('reports truncated: true when the underlying Mealie retrieval was itself paginated short, even under the cap', async () => {
    // Only 1 candidate came back (well under maxMatchesPerQuery: 10), but Mealie's own total (500) says
    // there were more rows than this request's page size returned — the local cap never kicked in here,
    // so this exercises the retrieval-incompleteness path in isolation.
    const fetchCandidates = vi.fn((): Promise<FetchCandidatesResult> => Promise.resolve({ items: [item('1', 'basil')], total: 500 }));

    const result = await lookupCandidates(['basil'], fields, 10, fetchCandidates);

    expect(result.matches[0].items).toHaveLength(1);
    expect(result.matches[0].truncated).toBe(true);
  });

  it('reports truncated: false when retrieval was complete and no cap was applied', async () => {
    const fetchCandidates = vi.fn((): Promise<FetchCandidatesResult> => Promise.resolve({ items: [item('1', 'basil')], total: 1 }));

    const result = await lookupCandidates(['basil'], fields, 10, fetchCandidates);

    expect(result.matches[0].truncated).toBe(false);
  });

  it('reports truncated: false for a query with zero matches', async () => {
    const fetchCandidates = vi.fn((): Promise<FetchCandidatesResult> => Promise.resolve({ items: [], total: 0 }));

    const result = await lookupCandidates(['nonexistent'], fields, 10, fetchCandidates);

    expect(result.matches[0].items).toEqual([]);
    expect(result.matches[0].truncated).toBe(false);
  });

  it('flags only the queries that were actually capped when several queries share one request', async () => {
    // "pepper" has many more candidates than maxMatchesPerQuery; "garlic" has exactly one.
    const manyPepperMatches = Array.from({ length: 6 }, (_, i) => item(`p${i}`, `pepper-${i}`));
    const pool = [...manyPepperMatches, item('g1', 'garlic')];
    const fetchCandidates = vi.fn((): Promise<FetchCandidatesResult> => Promise.resolve({ items: pool, total: pool.length }));

    const result = await lookupCandidates(['pepper', 'garlic'], fields, 5, fetchCandidates);

    const pepperMatch = result.matches.find((m) => m.query === 'pepper')!;
    const garlicMatch = result.matches.find((m) => m.query === 'garlic')!;
    expect(pepperMatch.items).toHaveLength(5);
    expect(pepperMatch.truncated).toBe(true);
    expect(garlicMatch.items).toHaveLength(1);
    expect(garlicMatch.truncated).toBe(false);
  });

  it('applies the same truncated value to duplicate and case-equivalent input queries', async () => {
    const many = Array.from({ length: 5 }, (_, i) => item(`${i}`, `pepper-${i}`));
    const fetchCandidates = vi.fn((): Promise<FetchCandidatesResult> => Promise.resolve({ items: many, total: many.length }));

    const result = await lookupCandidates(['pepper', 'Pepper', 'pepper'], fields, 3, fetchCandidates);

    expect(result.matches).toHaveLength(3);
    for (const match of result.matches) {
      expect(match.items).toHaveLength(3);
      expect(match.truncated).toBe(true);
    }
  });

  it('caps correctly when an alias exact match competes with many substring matches', async () => {
    const substringMatches = Array.from({ length: 5 }, (_, i) => item(`${i}`, `basil-flavored-${i}`));
    const aliasExact = { id: 'alias-exact', name: 'thai holy basil', aliases: [{ name: 'basil' }] };
    const pool = [...substringMatches, aliasExact];
    const fetchCandidates = vi.fn((): Promise<FetchCandidatesResult> => Promise.resolve({ items: pool, total: pool.length }));

    const result = await lookupCandidates(['basil'], fields, 2, fetchCandidates);

    expect(result.matches[0].items).toHaveLength(2);
    expect(result.matches[0].items[0].id).toBe('alias-exact'); // exact alias match ranked ahead of substrings
    expect(result.matches[0].truncated).toBe(true);
  });
});

describe('lookupCandidates — no-match is not an error', () => {
  it('returns an empty items array for a query with no candidates', async () => {
    const fetchCandidates = vi.fn((): Promise<FetchCandidatesResult> => Promise.resolve({ items: [], total: 0 }));
    const result = await lookupCandidates(['something nonexistent'], fields, 10, fetchCandidates);

    expect(result.matches).toEqual([{ query: 'something nonexistent', items: [], truncated: false }]);
    expect(result.matchedCount).toBe(0);
  });
});
