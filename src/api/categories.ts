import { apiGet, apiPost, apiPut, apiDelete, formatParams, PaginatedResult } from './client.js';

export function getCategories(
  params?: { page?: number; perPage?: number; search?: string },
): Promise<PaginatedResult<Record<string, unknown>>> {
  return apiGet<PaginatedResult<Record<string, unknown>>>(
    '/api/organizers/categories',
    params ? formatParams(params) : undefined,
  );
}

export function getEmptyCategories(): Promise<Record<string, unknown>> {
  return apiGet<Record<string, unknown>>('/api/organizers/categories/empty');
}

export function createCategory(name: string): Promise<Record<string, unknown>> {
  return apiPost<Record<string, unknown>>('/api/organizers/categories', { name });
}

export function getCategory(id: string): Promise<Record<string, unknown>> {
  return apiGet<Record<string, unknown>>(`/api/organizers/categories/${id}`);
}

export function getCategoryBySlug(slug: string): Promise<Record<string, unknown>> {
  return apiGet<Record<string, unknown>>(`/api/organizers/categories/slug/${slug}`);
}

export function updateCategory(
  id: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return apiPut<Record<string, unknown>>(`/api/organizers/categories/${id}`, data);
}

export function deleteCategory(id: string): Promise<Record<string, unknown>> {
  return apiDelete<Record<string, unknown>>(`/api/organizers/categories/${id}`);
}
