// Deterministic, non-semantic classification and ranking of candidate Mealie foods/units against a
// caller-supplied lookup query. `queryFilter` (see query-filter.ts) can only fetch a candidate union —
// it can't report *why* each row matched or in what order to prefer them — so this module inspects the
// actual field values Mealie returned and assigns match metadata itself. This is plain string
// comparison (trim + case-fold), never fuzzy/semantic matching: it only ever reports that some stored
// canonical value or alias equals-or-contains the query, exactly as Mealie stored it.

export type MatchType = 'exact' | 'substring';

export interface MatchInfo {
  matchedBy: string;
  matchType: MatchType;
  matchedValue: string;
}

export interface MatchField {
  /** Value reported in `matchedBy` for a hit on this field, and the queryFilter attribute name. */
  key: string;
  /** True if this field is the candidate's `aliases` collection rather than a scalar string field. */
  isAlias?: boolean;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function bestFieldMatch(
  item: Record<string, unknown>,
  field: MatchField,
  normalizedQuery: string,
): { matchType: MatchType; matchedValue: string } | null {
  if (field.isAlias) {
    const aliases = Array.isArray(item.aliases) ? (item.aliases as { name?: unknown }[]) : [];
    const names = aliases
      .map((a) => (typeof a?.name === 'string' ? a.name : null))
      .filter((n): n is string => !!n && n.trim().length > 0)
      // Deterministic tie-break when multiple aliases match: alphabetical.
      .sort((a, b) => a.localeCompare(b));

    let substringHit: string | null = null;
    for (const name of names) {
      const normalized = normalize(name);
      if (normalized === normalizedQuery) return { matchType: 'exact', matchedValue: name };
      if (!substringHit && normalized.includes(normalizedQuery)) substringHit = name;
    }
    return substringHit ? { matchType: 'substring', matchedValue: substringHit } : null;
  }

  const value = item[field.key];
  if (typeof value !== 'string' || value.trim().length === 0) return null;

  const normalized = normalize(value);
  if (normalized === normalizedQuery) return { matchType: 'exact', matchedValue: value };
  if (normalized.includes(normalizedQuery)) return { matchType: 'substring', matchedValue: value };
  return null;
}

/**
 * Classifies and ranks `candidates` against a single `query`, using `fields` in priority order
 * (earlier fields rank higher). Ranking places every exact match (in field priority order) ahead of
 * every substring match (in the same field priority order) — e.g. for units: exact name, exact plural
 * name, exact abbreviation, exact plural abbreviation, exact alias, then the same order again for
 * substring matches. Case differences never affect ranking tier since exact comparison here is already
 * case-insensitive. Candidates with no match on any field are omitted. Ties within the same rank break
 * alphabetically by name, then id, for a stable order across calls.
 */
interface RankedMatch extends MatchInfo {
  rank: number;
}

function bestOverallMatch(
  item: Record<string, unknown>,
  fields: MatchField[],
  normalizedQuery: string,
): RankedMatch | null {
  let best: RankedMatch | null = null;

  for (const [fieldIndex, field] of fields.entries()) {
    const hit = bestFieldMatch(item, field, normalizedQuery);
    if (!hit) continue;

    const rank = (hit.matchType === 'exact' ? 0 : fields.length) + fieldIndex;
    if (!best || rank < best.rank) {
      best = { rank, matchedBy: field.key, matchType: hit.matchType, matchedValue: hit.matchedValue };
    }
  }

  return best;
}

export function classifyAndRank<T extends Record<string, unknown>>(
  candidates: T[],
  fields: MatchField[],
  query: string,
): (T & MatchInfo)[] {
  const normalizedQuery = normalize(query);

  const matched: { item: T; info: RankedMatch }[] = [];
  for (const item of candidates) {
    const info = bestOverallMatch(item, fields, normalizedQuery);
    if (info) matched.push({ item, info });
  }

  matched.sort((a, b) => {
    if (a.info.rank !== b.info.rank) return a.info.rank - b.info.rank;
    const byName = stringField(a.item.name).localeCompare(stringField(b.item.name));
    if (byName !== 0) return byName;
    return stringField(a.item.id).localeCompare(stringField(b.item.id));
  });

  return matched.map(({ item, info }) => ({
    ...item,
    matchedBy: info.matchedBy,
    matchType: info.matchType,
    matchedValue: info.matchedValue,
  }));
}
