import { apiGet, apiPost, apiPut, apiDelete, formatParams, PaginatedResult } from './client.js';

export function getShoppingLists(
  params?: { page?: number; perPage?: number; search?: string },
): Promise<PaginatedResult<Record<string, unknown>>> {
  return apiGet<PaginatedResult<Record<string, unknown>>>(
    '/api/households/shopping/lists',
    params ? formatParams(params) : undefined,
  );
}

export function createShoppingList(name: string): Promise<Record<string, unknown>> {
  return apiPost<Record<string, unknown>>('/api/households/shopping/lists', { name });
}

export function getShoppingList(listId: string): Promise<Record<string, unknown>> {
  return apiGet<Record<string, unknown>>(`/api/households/shopping/lists/${listId}`);
}

export function updateShoppingList(
  listId: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return apiPut<Record<string, unknown>>(`/api/households/shopping/lists/${listId}`, data);
}

export function deleteShoppingList(listId: string): Promise<Record<string, unknown>> {
  return apiDelete<Record<string, unknown>>(`/api/households/shopping/lists/${listId}`);
}

export function addRecipeToShoppingList(
  listId: string,
  recipeId: string,
  recipeIncrementQuantity?: number,
): Promise<Record<string, unknown>> {
  return apiPost<Record<string, unknown>>(
    `/api/households/shopping/lists/${listId}/recipe/${recipeId}`,
    recipeIncrementQuantity !== undefined ? { recipeIncrementQuantity } : undefined,
  );
}

export function removeRecipeFromShoppingList(
  listId: string,
  recipeId: string,
): Promise<Record<string, unknown>> {
  return apiPost<Record<string, unknown>>(
    `/api/households/shopping/lists/${listId}/recipe/${recipeId}/delete`,
  );
}

export function getShoppingListItems(
  params?: { page?: number; perPage?: number; search?: string },
): Promise<PaginatedResult<Record<string, unknown>>> {
  return apiGet<PaginatedResult<Record<string, unknown>>>(
    '/api/households/shopping/items',
    params ? formatParams(params) : undefined,
  );
}

export function createShoppingListItem(data: {
  shoppingListId: string;
  note: string;
  quantity?: number;
  unitId?: string;
  foodId?: string;
  labelId?: string;
}): Promise<Record<string, unknown>> {
  return apiPost<Record<string, unknown>>('/api/households/shopping/items', data);
}

export function createShoppingListItemsBulk(
  items: Record<string, unknown>[],
): Promise<Record<string, unknown>> {
  return apiPost<Record<string, unknown>>('/api/households/shopping/items/create-bulk', items);
}

export function updateShoppingListItem(
  itemId: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return apiPut<Record<string, unknown>>(`/api/households/shopping/items/${itemId}`, data);
}

export function deleteShoppingListItem(itemId: string): Promise<Record<string, unknown>> {
  return apiDelete<Record<string, unknown>>(`/api/households/shopping/items/${itemId}`);
}

export function deleteShoppingListItemsBulk(
  itemIds: string[],
): Promise<Record<string, unknown>> {
  return apiDelete<Record<string, unknown>>(
    `/api/households/shopping/items?${new URLSearchParams({ ids: itemIds.join(',') }).toString()}`,
  );
}
