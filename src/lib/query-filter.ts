// Builds Mealie `queryFilter` expressions for substring lookups across multiple candidate fields
// and multiple caller-supplied search terms in a single combined filter string, so a batch of N
// lookups can be answered with one (or a handful of) `GET` requests instead of N.
//
// Mealie's filter grammar (mealie/services/query_filter/builder.py) has no escape mechanism for a
// `"` embedded inside a quoted value, and its `LIKE` keyword compiles straight to SQL ILIKE with no
// ESCAPE clause, so a literal `%`/`_` in the value would be interpreted as a SQL wildcard rather than
// a literal character. Both are therefore stripped (not escaped) from values before they're embedded.
// Every other special character in the grammar (parentheses, brackets, commas, AND/OR, IN/LIKE
// keywords) is neutralized by wrapping the sanitized value in `"..."`: the builder's tokenizer only
// treats those characters specially outside of a quoted region, and toggles that region strictly on
// `"` characters, so a value with zero embedded `"` characters is always read back as one opaque
// literal regardless of what it contains.

const LIKE_WILDCARD_OR_QUOTE = /["%_]/g;

/** Strips characters Mealie's queryFilter grammar can't safely carry inside a quoted LIKE value. */
export function sanitizeForLikeFilter(raw: string): string {
  return raw.replace(LIKE_WILDCARD_OR_QUOTE, '').trim();
}

export interface MatchFieldFilter {
  /** Attribute path as understood by Mealie's queryFilter attribute-chain syntax, e.g. "aliases.name". */
  queryFilterAttr: string;
}

/**
 * Combines a substring LIKE check across `fields` for each of `sanitizedQueries` into one filter
 * string, OR-ing every field/query combination together. Returns null if there is nothing to filter
 * on (e.g. every query sanitized down to an empty string).
 */
export function buildCombinedLikeFilter(fields: MatchFieldFilter[], sanitizedQueries: string[]): string | null {
  const groups = sanitizedQueries
    .filter((q) => q.length > 0)
    .map((q) => `(${fields.map((f) => `${f.queryFilterAttr} LIKE "%${q}%"`).join(' OR ')})`);

  return groups.length > 0 ? groups.join(' OR ') : null;
}
