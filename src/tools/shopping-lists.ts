import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as api from '../api/shopping-lists.js';

export function registerShoppingListTools(server: McpServer): void {
  server.tool(
    'get_shopping_lists',
    { page: z.number().optional(), perPage: z.number().optional() },
    async (params) => {
      try {
        const result = await api.getShoppingLists(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'create_shopping_list',
    { name: z.string() },
    async (params) => {
      try {
        const result = await api.createShoppingList(params.name);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'get_shopping_list',
    { listId: z.string() },
    async (params) => {
      try {
        const result = await api.getShoppingList(params.listId);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'update_shopping_list',
    { listId: z.string(), name: z.string().optional() },
    async (params) => {
      try {
        const data: Record<string, unknown> = {};
        if (params.name !== undefined) data.name = params.name;
        const result = await api.updateShoppingList(params.listId, data);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'delete_shopping_list',
    { listId: z.string() },
    async (params) => {
      try {
        const result = await api.deleteShoppingList(params.listId);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'add_recipe_to_shopping_list',
    { listId: z.string(), recipeId: z.string(), recipeIncrementQuantity: z.number().optional() },
    async (params) => {
      try {
        const result = await api.addRecipeToShoppingList(params.listId, params.recipeId, params.recipeIncrementQuantity);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'remove_recipe_from_shopping_list',
    { listId: z.string(), recipeId: z.string() },
    async (params) => {
      try {
        const result = await api.removeRecipeFromShoppingList(params.listId, params.recipeId);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'get_shopping_list_items',
    { page: z.number().optional(), perPage: z.number().optional(), search: z.string().optional() },
    async (params) => {
      try {
        const result = await api.getShoppingListItems(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'create_shopping_list_item',
    {
      shoppingListId: z.string(),
      note: z.string(),
      quantity: z.number().optional(),
      unitId: z.string().optional(),
      foodId: z.string().optional(),
      labelId: z.string().optional(),
    },
    async (params) => {
      try {
        const result = await api.createShoppingListItem(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'create_shopping_list_items_bulk',
    { items: z.array(z.record(z.string(), z.unknown())) },
    async (params) => {
      try {
        const result = await api.createShoppingListItemsBulk(params.items);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'update_shopping_list_item',
    { itemId: z.string(), note: z.string().optional(), quantity: z.number().optional(), checked: z.boolean().optional() },
    async (params) => {
      try {
        const data: Record<string, unknown> = {};
        if (params.note !== undefined) data.note = params.note;
        if (params.quantity !== undefined) data.quantity = params.quantity;
        if (params.checked !== undefined) data.checked = params.checked;
        const result = await api.updateShoppingListItem(params.itemId, data);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'delete_shopping_list_item',
    { itemId: z.string() },
    async (params) => {
      try {
        const result = await api.deleteShoppingListItem(params.itemId);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'delete_shopping_list_items_bulk',
    { itemIds: z.array(z.string()) },
    async (params) => {
      try {
        const result = await api.deleteShoppingListItemsBulk(params.itemIds);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );
}
