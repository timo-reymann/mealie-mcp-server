import { apiGet, apiPost, apiPut, apiDelete, formatParams, PaginatedResult } from '../api/client.js';

export function getMealplans(
  params?: { startDate?: string; endDate?: string; page?: number; perPage?: number },
): Promise<PaginatedResult<Record<string, unknown>>> {
  return apiGet<PaginatedResult<Record<string, unknown>>>(
    '/api/households/mealplans',
    params ? formatParams(params) : undefined,
  );
}

export function createMealplan(data: {
  date: string;
  recipeId?: string;
  title?: string;
  entryType: string;
}): Promise<Record<string, unknown>> {
  return apiPost<Record<string, unknown>>('/api/households/mealplans', data);
}

export function getTodaysMealplan(): Promise<Record<string, unknown>> {
  return apiGet<Record<string, unknown>>('/api/households/mealplans/today');
}

export function getMealplan(id: string): Promise<Record<string, unknown>> {
  return apiGet<Record<string, unknown>>(`/api/households/mealplans/${id}`);
}

export function updateMealplan(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  return apiPut<Record<string, unknown>>(`/api/households/mealplans/${id}`, data);
}

export function deleteMealplan(id: string): Promise<Record<string, unknown>> {
  return apiDelete<Record<string, unknown>>(`/api/households/mealplans/${id}`);
}
