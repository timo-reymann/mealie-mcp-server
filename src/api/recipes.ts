import { apiGet, apiPost, apiPatch, apiPut, apiDelete, formatParams, PaginatedResult } from './client.js';

export async function getRecipes(
  params?: {
    search?: string;
    page?: number;
    perPage?: number;
    orderBy?: string;
    orderDirection?: string;
    categories?: string[];
    tags?: string[];
    requireAllTags?: boolean;
    requireAllCategories?: boolean;
  },
): Promise<PaginatedResult<Record<string, unknown>>> {
  return apiGet(
    '/api/recipes',
    params ? formatParams(params as Record<string, string | number | boolean | string[] | undefined | null>) : undefined,
  );
}

export async function getRecipe(slug: string): Promise<Record<string, unknown>> {
  return apiGet(`/api/recipes/${slug}`);
}

export async function getRecipesBatch(
  slugs: string[],
): Promise<Record<string, Record<string, unknown> | { error: string }>> {
  const results = await Promise.allSettled(slugs.map(slug => getRecipe(slug)));
  const map: Record<string, Record<string, unknown> | { error: string }> = {};
  for (let i = 0; i < slugs.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      map[slugs[i]] = result.value;
    } else {
      const reason = result.reason as Error | undefined;
      map[slugs[i]] = { error: reason?.message ?? 'Unknown error' };
    }
  }
  return map;
}

export async function createRecipe(name: string): Promise<Record<string, unknown>> {
  return apiPost('/api/recipes', { name });
}

export async function patchRecipe(
  slug: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return apiPatch(`/api/recipes/${slug}`, data);
}

export async function duplicateRecipe(
  slug: string,
  name?: string,
): Promise<Record<string, unknown>> {
  return apiPost(`/api/recipes/${slug}/duplicate`, name ? { name } : undefined);
}

export async function updateRecipeLastMade(slug: string): Promise<Record<string, unknown>> {
  return apiPatch(`/api/recipes/${slug}/last-made`, {
    timestamp: new Date().toISOString(),
  });
}

export async function setRecipeImageFromUrl(
  slug: string,
  url: string,
): Promise<Record<string, unknown>> {
  return apiPost(`/api/recipes/${slug}/image`, { url });
}

export async function deleteRecipe(slug: string): Promise<Record<string, unknown>> {
  return apiDelete(`/api/recipes/${slug}`);
}

export async function updateRecipe(
  slug: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return apiPut(`/api/recipes/${slug}`, data);
}
