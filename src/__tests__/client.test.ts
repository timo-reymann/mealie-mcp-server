import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MealieApiError } from '../api/client.js';

describe('MealieApiError', () => {
  it('sets name correctly', () => {
    const error = new MealieApiError(401, 'Unauthorized');
    expect(error.name).toBe('MealieApiError');
  });

  it('includes status and body in message', () => {
    const error = new MealieApiError(500, 'Internal Server Error');
    expect(error.message).toContain('500');
    expect(error.message).toContain('Internal Server Error');
  });

  it('stores status and body as properties', () => {
    const error = new MealieApiError(404, 'Not Found');
    expect(error.status).toBe(404);
    expect(error.body).toBe('Not Found');
  });
});

describe('apiGet', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mixes auth header with custom headers', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    const { apiGet } = await import('../api/client.js');
    await apiGet('/api/recipes');

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toMatch(/\/api\/recipes$/);
  });

  it('throws MealieApiError on non-ok response', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response('Not Found', { status: 404, statusText: 'Not Found' }));

    const { apiGet, MealieApiError: ErrorClass } = await import('../api/client.js');
    await expect(apiGet('/api/recipes/nonexistent')).rejects.toThrow(ErrorClass);
  });
});
