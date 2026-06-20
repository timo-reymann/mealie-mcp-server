import { describe, it, expect } from 'vitest';
import { formatParams } from '../api/client.js';

describe('formatParams', () => {
  it('filters out undefined values', () => {
    const result = formatParams({ a: '1', b: undefined, c: '3' });
    expect(result).toEqual({ a: '1', c: '3' });
  });

  it('filters out null values', () => {
    const result = formatParams({ a: '1', b: null, c: '3' });
    expect(result).toEqual({ a: '1', c: '3' });
  });

  it('converts arrays to comma-separated strings', () => {
    const result = formatParams({ tags: ['a', 'b', 'c'] });
    expect(result).toEqual({ tags: 'a,b,c' });
  });

  it('skips empty arrays', () => {
    const result = formatParams({ tags: [] });
    expect(result).toEqual({});
  });

  it('stringifies numbers', () => {
    const result = formatParams({ page: 1, perPage: 50 });
    expect(result).toEqual({ page: '1', perPage: '50' });
  });

  it('stringifies booleans', () => {
    const result = formatParams({ requireAllTags: true });
    expect(result).toEqual({ requireAllTags: 'true' });
  });

  it('returns empty object for all-undefined input', () => {
    const result = formatParams({ a: undefined, b: null });
    expect(result).toEqual({});
  });

  it('returns empty object for empty input', () => {
    const result = formatParams({});
    expect(result).toEqual({});
  });

  it('preserves string values as-is', () => {
    const result = formatParams({ search: 'chicken parm' });
    expect(result).toEqual({ search: 'chicken parm' });
  });
});
