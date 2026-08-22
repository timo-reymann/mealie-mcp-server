import { describe, it, expect } from 'vitest';
import { sanitizeForLikeFilter, buildCombinedLikeFilter } from '../lib/query-filter.js';

describe('sanitizeForLikeFilter', () => {
  it('strips double quotes, since Mealie\'s filter grammar has no escape for them', () => {
    expect(sanitizeForLikeFilter('say "hello"')).toBe('say hello');
  });

  it('strips SQL LIKE wildcard characters % and _', () => {
    expect(sanitizeForLikeFilter('100%_free')).toBe('100free');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeForLikeFilter('  basil  ')).toBe('basil');
  });

  it('leaves parentheses, brackets, commas, and logical-operator words intact', () => {
    // These are only special to Mealie's grammar outside of a quoted region; since we always wrap the
    // sanitized value in our own quotes, these pass through safely as literal characters.
    expect(sanitizeForLikeFilter('cheese (cheddar or mozzarella), [aged]')).toBe(
      'cheese (cheddar or mozzarella), [aged]',
    );
  });

  it('preserves apostrophes, which are not special in this grammar', () => {
    expect(sanitizeForLikeFilter("chef's knife")).toBe("chef's knife");
  });

  it('preserves unicode characters', () => {
    expect(sanitizeForLikeFilter('crème brûlée 🧈')).toBe('crème brûlée 🧈');
  });

  it('can sanitize down to an empty string', () => {
    expect(sanitizeForLikeFilter('"%_"')).toBe('');
  });
});

describe('buildCombinedLikeFilter', () => {
  const foodFields = [{ queryFilterAttr: 'name' }, { queryFilterAttr: 'aliases.name' }];

  it('returns null when there is nothing to filter on', () => {
    expect(buildCombinedLikeFilter(foodFields, [])).toBeNull();
    expect(buildCombinedLikeFilter(foodFields, [''])).toBeNull();
  });

  it('builds one OR-ed LIKE clause per field for a single query', () => {
    expect(buildCombinedLikeFilter(foodFields, ['basil'])).toBe(
      '(name LIKE "%basil%" OR aliases.name LIKE "%basil%")',
    );
  });

  it('combines multiple queries into one filter string, OR-ing each query\'s parenthesized group', () => {
    const filter = buildCombinedLikeFilter(foodFields, ['basil', 'garlic']);
    expect(filter).toBe(
      '(name LIKE "%basil%" OR aliases.name LIKE "%basil%") OR (name LIKE "%garlic%" OR aliases.name LIKE "%garlic%")',
    );
  });

  it('skips empty queries but still combines the non-empty ones', () => {
    const filter = buildCombinedLikeFilter(foodFields, ['', 'basil']);
    expect(filter).toBe('(name LIKE "%basil%" OR aliases.name LIKE "%basil%")');
  });
});
