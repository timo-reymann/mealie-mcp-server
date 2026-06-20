import { apiGet, apiPost, apiPut, apiDelete, formatParams, PaginatedResult } from '../api/client.js';

export function getTags(params?: { page?: number; perPage?: number; search?: string }): Promise<PaginatedResult<Record<string, unknown>>> {
  return apiGet<PaginatedResult<Record<string, unknown>>>('/api/organizers/tags', params ? formatParams(params) : undefined);
}

export function getEmptyTags(): Promise<Record<string, unknown>> {
  return apiGet<Record<string, unknown>>('/api/organizers/tags/empty');
}

export function createTag(name: string): Promise<Record<string, unknown>> {
  return apiPost<Record<string, unknown>>('/api/organizers/tags', { name });
}

export function getTag(id: string): Promise<Record<string, unknown>> {
  return apiGet<Record<string, unknown>>(`/api/organizers/tags/${id}`);
}

export function getTagBySlug(slug: string): Promise<Record<string, unknown>> {
  return apiGet<Record<string, unknown>>(`/api/organizers/tags/slug/${slug}`);
}

export function updateTag(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  return apiPut<Record<string, unknown>>(`/api/organizers/tags/${id}`, data);
}

export function deleteTag(id: string): Promise<Record<string, unknown>> {
  return apiDelete<Record<string, unknown>>(`/api/organizers/tags/${id}`);
}
